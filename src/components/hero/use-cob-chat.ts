import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_VOICE, readStoredVoice, writeStoredVoice, type VoiceId } from "./cob-voices";

export type ChatMessage = {
  id: string;
  role: "cob" | "you";
  voice: VoiceId;
  text: string;
  at: number;
  trace?: string | null;
  streaming?: boolean;
};

export type VoiceDivider = {
  id: string;
  kind: "voice-divider";
  voice: VoiceId;
  at: number;
};

export type TranscriptItem = ChatMessage | VoiceDivider;

export type LeadInfo = {
  name: string;
  email: string;
  company: string;
  title: string;
  challenge: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function firstName(full?: string): string {
  if (!full) return "";
  return full.trim().split(/\s+/)[0] || "";
}

function makeOpener(voice: VoiceId, lead: LeadInfo | null): string {
  const fn = firstName(lead?.name);
  if (voice === "michael") {
    return fn
      ? `Hey ${fn} — Michael here. Demo-Michael. Sample-Michael. Whatever. Picture me leaning on the doorframe with a coffee. I read what you wrote. Walk me through it one more time, your way, and I'll help in the only way I know how.`
      : "Hey hey hey — it's Michael. Demo-Michael. Sample-Michael. Whatever. Picture me leaning on the doorframe with a coffee, ready to be useful in a deeply specific way. What's the thing on your plate? Walk me through it. I'll help in the only way I know how.";
  }
  return fn
    ? `${fn} — your COB is on. I read what you sent. Hit send on your first ask and I'll open with a read, a recommendation, and the next move. Or toggle a lens · CFO, COO, Chief of Staff, your industry · and I'll run the room from there.`
    : "I'm your COB — your Chief of Business — standing in for the sandbox. Two ways we can start: tell me the one thing eating your week, or pick a lens (CFO, COO, Chief of Staff, your industry) and I'll run the room from there.";
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/cob-chat`;
const LEAD_URL = `${SUPABASE_URL}/functions/v1/submit-chat-lead`;

export function useCobChat() {
  const [voice, setVoiceState] = useState<VoiceId>(() => readStoredVoice() ?? DEFAULT_VOICE);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [roleLabel, setRoleLabel] = useState<string | undefined>();
  const [industryLabel, setIndustryLabel] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadInfo | null>(null);
  const [submittingLead, setSubmittingLead] = useState(false);
  const sessionIdRef = useRef<string>(uid());
  const initOpenerRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const primeIfEmpty = useCallback(
    (overrideLead?: LeadInfo | null) => {
      if (initOpenerRef.current) return;
      initOpenerRef.current = true;
      const useLead = overrideLead ?? lead;
      setTranscript((prev) =>
        prev.length === 0
          ? [
              {
                id: uid(),
                role: "cob",
                voice,
                text: makeOpener(voice, useLead),
                at: Date.now(),
                trace: null,
              },
            ]
          : prev,
      );
    },
    [voice, lead],
  );

  const setVoice = useCallback(
    (next: VoiceId) => {
      if (next === voice) return;
      writeStoredVoice(next);
      setVoiceState(next);
      setTranscript((prev) => [
        ...prev,
        { id: uid(), kind: "voice-divider", voice: next, at: Date.now() },
      ]);
    },
    [voice],
  );

  const submitLead = useCallback(
    async (info: LeadInfo): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (submittingLead) return { ok: false, error: "Already submitting." };
      setSubmittingLead(true);
      setError(null);
      try {
        const resp = await fetch(LEAD_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: ANON_KEY,
            Authorization: `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            voice,
            ...info,
          }),
        });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = j?.error || "Could not submit. Try again.";
          setError(String(msg));
          return { ok: false, error: String(msg) };
        }
        if (j?.session_id) sessionIdRef.current = String(j.session_id);
        setLead(info);
        return { ok: true };
      } catch (e: any) {
        const msg = e?.message || "Network error.";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setSubmittingLead(false);
      }
    },
    [voice, submittingLead],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pending) return;
      setError(null);

      const youMsg: ChatMessage = { id: uid(), role: "you", voice, text, at: Date.now() };
      const assistantId = uid();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "cob",
        voice,
        text: "",
        at: Date.now(),
        trace: null,
        streaming: true,
      };

      const prevChatMessages = transcript.filter(
        (t): t is ChatMessage => (t as ChatMessage).role !== undefined,
      );
      const wireMessages = [
        ...prevChatMessages.map((m) => ({
          role: m.role === "you" ? "user" : "assistant",
          content: m.text,
        })),
        { role: "user" as const, content: text },
      ];

      setTranscript((prev) => [...prev, youMsg, assistantMsg]);
      setPending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";
      let trace: string | null = null;

      const appendDelta = (delta: string) => {
        accumulated += delta;
        setTranscript((prev) =>
          prev.map((item) =>
            (item as ChatMessage).id === assistantId
              ? { ...(item as ChatMessage), text: accumulated }
              : item,
          ),
        );
      };

      const finalize = (final?: string, errMessage?: string) => {
        setTranscript((prev) =>
          prev.map((item) => {
            if ((item as ChatMessage).id !== assistantId) return item;
            const m = item as ChatMessage;
            return {
              ...m,
              text: (final ?? accumulated) || "(silence)",
              streaming: false,
              trace,
            };
          }),
        );
        if (errMessage) setError(errMessage);
      };

      try {
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: ANON_KEY,
            Authorization: `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            voice,
            role_label: roleLabel,
            industry_label: industryLabel,
            lead: lead
              ? {
                  name: lead.name,
                  company: lead.company,
                  title: lead.title,
                  challenge: lead.challenge,
                }
              : undefined,
            messages: wireMessages,
          }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          let errText = "Couldn't reach your COB. Try again.";
          try {
            const j = await resp.json();
            if (j?.error) errText = String(j.error);
          } catch { /* not JSON */ }
          const fallback =
            voice === "michael"
              ? "Hold on — wires crossed. Try that again. Or yell. Either works."
              : "Signal dropped on my side. Try that again.";
          finalize(fallback, errText);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent: string | null = null;
        let streamDone = false;

        const flushLine = (rawLine: string) => {
          let line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          if (line.trim() === "") {
            currentEvent = null;
            return;
          }
          if (line.startsWith(":")) return;
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            return;
          }
          if (!line.startsWith("data: ")) return;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            streamDone = true;
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            if (currentEvent === "trace") {
              if (parsed?.research_trace) trace = String(parsed.research_trace);
              return;
            }
            if (currentEvent === "error") {
              setError(String(parsed?.error || "Stream interrupted."));
              return;
            }
            const content = parsed?.choices?.[0]?.delta?.content as string | undefined;
            if (content) appendDelta(content);
          } catch {
            buffer = rawLine + "\n" + buffer;
          }
        };

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);
            flushLine(line);
            if (streamDone) break;
          }
        }
        if (buffer.trim()) {
          for (const raw of buffer.split("\n")) flushLine(raw);
        }
        finalize();
      } catch (e: any) {
        if (e?.name === "AbortError") {
          finalize();
          return;
        }
        const message = e?.message || "Couldn't reach your COB. Try again.";
        const fallback =
          voice === "michael"
            ? "Hold on — wires crossed. Try that again. Or yell. Either works."
            : "Signal dropped on my side. Try that again.";
        finalize(fallback, message);
      } finally {
        setPending(false);
        abortRef.current = null;
      }
    },
    [pending, transcript, voice, roleLabel, industryLabel, lead],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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
    lead,
    submitLead,
    submittingLead,
  };
}
