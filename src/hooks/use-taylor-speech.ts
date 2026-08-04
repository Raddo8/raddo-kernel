import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * REFINEMENT 2R3 · voice for the TAYLOR guide panel.
 *
 * Policy and engine stay split: this hook owns the POLICY gate (voiceOn, mic
 * on/off, never auto-start) and calls the engines (Deepgram streaming in,
 * taylor-voice TTS out). Speech OUT fails closed and silent when the TTS tier
 * is unavailable (the known 402 case) while the mic keeps working.
 */

/** Deepgram streaming model used for the panel mic. Same engine as the dock. */
const DG_MODEL = "nova-2";

type Args = {
  /** Called with the running dictation text so the composer can mirror it. */
  onTranscript: (text: string) => void;
  /** Called once an utterance closes, so the panel can send it. */
  onUtteranceEnd?: (text: string) => void;
};

export function useTaylorSpeech({ onTranscript, onUtteranceEnd }: Args) {
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [micStatus, setMicStatus] = useState<string | null>(null);
  /** True once the TTS tier refused. Speech OUT then stays silent, mic unaffected. */
  const [speechUnavailable, setSpeechUnavailable] = useState(false);

  const stopRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cb = useRef({ onTranscript, onUtteranceEnd });
  useEffect(() => {
    cb.current = { onTranscript, onUtteranceEnd };
  }, [onTranscript, onUtteranceEnd]);

  // Voice never auto-starts: nothing here runs until the client acts.
  useEffect(
    () => () => {
      try {
        stopRef.current?.();
      } catch {
        /* teardown is best effort */
      }
      try {
        audioRef.current?.pause();
      } catch {
        /* teardown is best effort */
      }
    },
    [],
  );

  const speak = useCallback(
    async (text: string) => {
      const t = String(text || "").trim();
      if (!voiceOn || !t || speechUnavailable) return;
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s.session?.access_token;
        if (!token) return;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/taylor-voice`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: t.slice(0, 4000) }),
        });
        if (!res.ok) {
          // 402 and friends: fail closed, stay silent, keep the mic alive.
          setSpeechUnavailable(true);
          return;
        }
        const blob = await res.blob();
        if (!blob.size) {
          setSpeechUnavailable(true);
          return;
        }
        try {
          audioRef.current?.pause();
        } catch {
          /* replacing the previous clip */
        }
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        await audio.play().catch(() => setSpeechUnavailable(true));
      } catch {
        setSpeechUnavailable(true);
      }
    },
    [voiceOn, speechUnavailable],
  );

  const stopMic = useCallback(() => {
    try {
      stopRef.current?.();
    } catch {
      /* best effort */
    }
    stopRef.current = null;
    setListening(false);
    setMicStatus(null);
  }, []);

  const startMic = useCallback(async () => {
    const AC: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC || !navigator.mediaDevices || !window.WebSocket) {
      setMicStatus("mic not available in this browser. type instead.");
      return;
    }
    setMicStatus("opening the mic…");

    const tok = await supabase.functions
      .invoke("deepgram-token", { body: {} })
      .then((r) => (r.data as any)?.token as string | undefined)
      .catch(() => undefined);
    if (!tok) {
      setMicStatus("mic auth failed. tap to retry.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    } catch {
      setMicStatus("your browser blocked the mic. allow it, or type.");
      return;
    }

    const ctx = new AC({ sampleRate: 16000 });
    try {
      await ctx.resume();
    } catch {
      /* some browsers resume on first audio */
    }
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    let ws: WebSocket | null = null;
    let finalTxt = "";
    let closed = false;

    proc.onaudioprocess = (e) => {
      if (!ws || ws.readyState !== 1) return;
      const inp = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(inp.length);
      for (let i = 0; i < inp.length; i++) {
        const v = Math.max(-1, Math.min(1, inp[i]));
        pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      try {
        ws.send(pcm.buffer);
      } catch {
        /* dropped frame */
      }
    };
    src.connect(proc);
    proc.connect(ctx.destination);

    const url =
      `wss://api.deepgram.com/v1/listen?model=${DG_MODEL}&encoding=linear16&sample_rate=${ctx.sampleRate}` +
      "&interim_results=true&utterance_end_ms=1500&vad_events=true&smart_format=true&punctuate=true";
    ws = new WebSocket(url, ["bearer", tok]);
    ws.onopen = () => setMicStatus("listening. just talk.");
    ws.onmessage = (m) => {
      let d: any;
      try {
        d = JSON.parse(m.data);
      } catch {
        return;
      }
      if (d.type === "UtteranceEnd") {
        const v = finalTxt.trim();
        finalTxt = "";
        if (v) cb.current.onUtteranceEnd?.(v);
        return;
      }
      const alt = d?.channel?.alternatives?.[0];
      const t = String(alt?.transcript || "").trim();
      if (!t) return;
      if (d.is_final) {
        finalTxt = finalTxt ? `${finalTxt} ${t}` : t;
        cb.current.onTranscript(finalTxt);
      } else {
        cb.current.onTranscript(finalTxt ? `${finalTxt} ${t}` : t);
      }
    };
    ws.onclose = () => {
      if (!closed) setMicStatus("mic closed. tap to restart.");
    };

    stopRef.current = () => {
      closed = true;
      try {
        ws?.send(JSON.stringify({ type: "CloseStream" }));
        ws?.close();
      } catch {
        /* best effort */
      }
      try {
        proc.disconnect();
        src.disconnect();
        void ctx.close();
      } catch {
        /* best effort */
      }
      stream.getTracks().forEach((t) => t.stop());
    };
    setListening(true);
  }, []);

  const toggleMic = useCallback(() => {
    if (listening) stopMic();
    else void startMic();
  }, [listening, startMic, stopMic]);

  const toggleVoice = useCallback(() => setVoiceOn((v) => !v), []);

  return { voiceOn, toggleVoice, listening, toggleMic, micStatus, speak, speechUnavailable };
}
