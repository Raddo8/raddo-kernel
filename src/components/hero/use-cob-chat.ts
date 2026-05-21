import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_VOICE, readStoredVoice, writeStoredVoice, type VoiceId } from "./cob-voices";

export type ChatMessage = {
  id: string;
  role: "cob" | "you";
  voice: VoiceId; // voice this message is rendered in (assistant) or was authored under (user)
  text: string;
  at: number;
  trace?: string | null;
};

export type VoiceDivider = {
  id: string;
  kind: "voice-divider";
  voice: VoiceId;
  at: number;
};

export type TranscriptItem = ChatMessage | VoiceDivider;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeOpener(voice: VoiceId): string {
  if (voice === "michael") {
    return "Hey hey hey — it's Michael. Demo-Michael. Sample-Michael. Whatever. Picture me leaning on the doorframe with a coffee, ready to be useful in a deeply specific way. What's the thing on your plate? Walk me through it. I'll help in the only way I know how.";
  }
  return "I'm your COB — your Chief of Business — standing in for the sandbox. Two ways we can start: tell me the one thing eating your week, or pick a lens (CFO, COO, Chief of Staff, your industry) and I'll run the room from there.";
}

export function useCobChat() {
  const [voice, setVoiceState] = useState<VoiceId>(() => readStoredVoice() ?? DEFAULT_VOICE);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [roleLabel, setRoleLabel] = useState<string | undefined>();
  const [industryLabel, setIndustryLabel] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(uid());
  const initOpenerRef = useRef(false);

  // Plant the opener once when the chat unseals (caller toggles by calling primeIfEmpty)
  const primeIfEmpty = useCallback(() => {
    if (initOpenerRef.current) return;
    initOpenerRef.current = true;
    setTranscript((prev) =>
      prev.length === 0
        ? [
            {
              id: uid(),
              role: "cob",
              voice,
              text: makeOpener(voice),
              at: Date.now(),
              trace: null,
            },
          ]
        : prev,
    );
  }, [voice]);

  const setVoice = useCallback(
    (next: VoiceId) => {
      if (next === voice) return;
      writeStoredVoice(next);
      setVoiceState(next);
      // Insert a divider row so the transcript shows the voice change
      setTranscript((prev) => [
        ...prev,
        { id: uid(), kind: "voice-divider", voice: next, at: Date.now() },
      ]);
    },
    [voice],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pending) return;
      setError(null);

      const youMsg: ChatMessage = {
        id: uid(),
        role: "you",
        voice,
        text,
        at: Date.now(),
      };
      const nextTranscript = [...transcript, youMsg];
      setTranscript(nextTranscript);
      setPending(true);

      // Build wire messages from chat messages (drop dividers).
      const wireMessages = nextTranscript
        .filter((t): t is ChatMessage => (t as ChatMessage).role !== undefined)
        .map((m) => ({
          role: m.role === "you" ? "user" : "assistant",
          content: m.text,
        }));

      try {
        const { data, error: fnErr } = await supabase.functions.invoke("cob-chat", {
          body: {
            session_id: sessionIdRef.current,
            voice,
            role_label: roleLabel,
            industry_label: industryLabel,
            messages: wireMessages,
          },
        });
        if (fnErr) throw fnErr;
        if (!data) throw new Error("Empty response");
        if ((data as any).error) throw new Error((data as any).error);

        const assistantText = String((data as any).assistant || "").trim();
        const trace = (data as any).research_trace ?? null;
        setTranscript((prev) => [
          ...prev,
          {
            id: uid(),
            role: "cob",
            voice,
            text: assistantText || "(silence)",
            at: Date.now(),
            trace,
          },
        ]);
      } catch (e: any) {
        const message = e?.message || "Couldn't reach your COB. Try again.";
        setError(message);
        setTranscript((prev) => [
          ...prev,
          {
            id: uid(),
            role: "cob",
            voice,
            text:
              voice === "michael"
                ? "Hold on — wires crossed. Try that again. Or yell. Either works."
                : "Signal dropped on my side. Try that again.",
            at: Date.now(),
            trace: null,
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [pending, transcript, voice, roleLabel, industryLabel],
  );

  return {
    voice,
    setVoice,
    transcript,
    pending,
    error,
    roleLabel,
    setRoleLabel,
    industryLabel,
    setIndustryLabel,
    send,
    primeIfEmpty,
  };
}
