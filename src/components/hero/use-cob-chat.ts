import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_VOICE, readStoredVoice, writeStoredVoice, type VoiceId } from "./cob-voices";
import type { WarmStartPayload } from "@/lib/consult-warm-start";

export type ChatMessage = {
  id: string;
  role: "cob" | "you";
  voice: VoiceId;
  text: string;
  at: number;
  trace?: string | null;
  streaming?: boolean;
  synthetic?: boolean;
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
const TRANSCRIPT_URL = `${SUPABASE_URL}/functions/v1/send-chat-transcript`;

// Idle send threshold · 5 min of no activity = "session ended"
const IDLE_MS = 5 * 60_000;

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

  const [deploymentInquirySent, setDeploymentInquirySent] = useState(false);
  const submitDeploymentInquiry = useCallback(
    async (info: { email: string; company: string; situation: string }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (submittingLead) return { ok: false, error: "Already submitting." };
      setSubmittingLead(true);
      setError(null);
      try {
        // Snapshot transcript (non-synthetic, real exchanges only) to ship with the inquiry.
        const msgs = transcript
          .filter((t): t is ChatMessage => (t as ChatMessage).role !== undefined)
          .filter((m) => !m.synthetic && (m.text || "").trim().length > 0)
          .map((m) => ({ role: m.role, voice: m.voice, text: m.text, at: m.at }));
        const startedAt = msgs.length ? new Date(msgs[0].at).toISOString() : new Date().toISOString();

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
            stage: "deployment_inquiry",
            email: info.email,
            company: info.company,
            situation: info.situation,
            // carry forward gate-known identity when available
            name: lead?.name,
            title: lead?.title,
            // transcript payload for downstream emails
            messages: msgs,
            lead: lead
              ? {
                  name: lead.name,
                  email: lead.email,
                  company: lead.company,
                  title: lead.title,
                  challenge: lead.challenge,
                }
              : null,
            started_at: startedAt,
          }),
        });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = j?.error || "Could not submit. Try again.";
          setError(String(msg));
          return { ok: false, error: String(msg) };
        }
        setDeploymentInquirySent(true);
        return { ok: true };
      } catch (e: any) {
        const msg = e?.message || "Network error.";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setSubmittingLead(false);
      }
    },
    [voice, submittingLead, lead, transcript],
  );

  // ── Phase detectors · drive Conviction Funnel hard-close timing ──────────
  const phase3PivotRe = /(want to talk about (what )?deployment|here'?s what (changes|happens) when (i'?m|cob is) deployed|deployed across your operation|at deployment scale)/i;
  const phase4GateRe = /(that'?s deployment[- ]scope|here'?s the structure i'?d use|no\b[^.]{0,40}but i'?ll give you the structure)/i;
  const bulletLineRe = /^\s*([-*•]|\d+[.)])\s+/;

  const {
    phase3PivotFired,
    phase4GateFired,
    prospectContinuedEngagement,
    cobAssistantTurns,
  } = useMemo(() => {
    let pivotFired = false;
    let pivotAtIndex = -1;
    let gateFired = false;
    let cobCount = 0;
    const chatOnly = transcript.filter((t): t is ChatMessage => (t as ChatMessage).role !== undefined);
    chatOnly.forEach((m, idx) => {
      if (m.synthetic) return;
      if (m.role === "cob" && (m.text || "").trim().length > 0) {
        cobCount += 1;
        const txt = m.text || "";
        if (!pivotFired && phase3PivotRe.test(txt)) {
          pivotFired = true;
          pivotAtIndex = idx;
        }
        if (!gateFired) {
          if (phase4GateRe.test(txt)) {
            gateFired = true;
          } else {
            // Outline heuristic · 4+ bullet lines + deployment mention
            const lines = txt.split("\n").filter((l) => l.trim().length > 0);
            const bullets = lines.filter((l) => bulletLineRe.test(l)).length;
            if (bullets >= 4 && bullets <= 8 && /deploy(ed|ment)/i.test(txt)) {
              gateFired = true;
            }
          }
        }
      }
    });
    let continued = false;
    if (pivotFired) {
      for (let i = pivotAtIndex + 1; i < chatOnly.length; i++) {
        const m = chatOnly[i];
        if (m.role === "you" && (m.text || "").trim().length >= 12) {
          continued = true;
          break;
        }
      }
    }
    return {
      phase3PivotFired: pivotFired,
      phase4GateFired: gateFired,
      prospectContinuedEngagement: continued,
      cobAssistantTurns: cobCount,
    };
  }, [transcript]);

  const blockA =
    phase3PivotFired &&
    prospectContinuedEngagement &&
    phase4GateFired &&
    cobAssistantTurns >= 12 &&
    cobAssistantTurns <= 15;
  const blockB = cobAssistantTurns >= 15;
  const deploymentFormShouldOpen =
    !deploymentInquirySent && voice === "cob" && (blockA || blockB);
  const chatLocked = deploymentFormShouldOpen || deploymentInquirySent;

  // Append disarming COB message once when the form opens.
  const disarmingPushedRef = useRef(false);
  useEffect(() => {
    if (!deploymentFormShouldOpen || disarmingPushedRef.current) return;
    disarmingPushedRef.current = true;
    setTranscript((prev) => [
      ...prev,
      {
        id: uid(),
        role: "cob",
        voice: "cob",
        synthetic: true,
        at: Date.now(),
        trace: null,
        text:
          "Here's where the sandbox ends and the real conversation starts.\n\nWhat you just saw was me working with one slice of your situation in a 90-minute window. Deployed COB does this continuously, against every signal moving through your operation · email, calendar, docs, financials, customer and vendor traffic.\n\nIf the read landed, the next move is a conversation with the deployment team. Leave your email, your company, and one paragraph on where this sits for you. One business day · no list, no drip.\n\nNo pressure to act now. If you want to keep stress-testing the sandbox another day, close this tab and come back · the form will be here.\n\nForm's below.",
      },
    ]);
  }, [deploymentFormShouldOpen]);




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
      // Keep recent history only · server caps total at 24k chars / 30 turns
      const MAX_MSG_CHARS = 6000;
      const MAX_TOTAL_CHARS = 24_000; // matches server cap
      const HISTORY_KEEP = 12;
      const recent = prevChatMessages.slice(-HISTORY_KEEP).map((m) => ({
        role: m.role === "you" ? ("user" as const) : ("assistant" as const),
        content: (m.text || "").slice(0, MAX_MSG_CHARS),
      }));
      const currentTurn = { role: "user" as const, content: text.slice(0, MAX_MSG_CHARS) };
      // Drop oldest until under budget
      let total = recent.reduce((n, m) => n + m.content.length, 0) + currentTurn.content.length;
      while (recent.length > 1 && total > MAX_TOTAL_CHARS) {
        total -= recent[0].content.length;
        recent.shift();
      }
      const wireMessages = [...recent, currentTurn];

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

  // ── Transcript pipe · silent internal email at session end ─────────────
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const voiceRef = useRef<VoiceId>(voice);
  const leadRef = useRef<LeadInfo | null>(lead);
  const sentReasonsRef = useRef<Set<string>>(new Set());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  useEffect(() => {
    leadRef.current = lead;
  }, [lead]);

  const buildTranscriptPayload = useCallback((reason: string) => {
    const msgs = transcriptRef.current
      .filter((t): t is ChatMessage => (t as ChatMessage).role !== undefined)
      .map((m) => ({ role: m.role, voice: m.voice, text: m.text, at: m.at }));
    return {
      session_id: sessionIdRef.current,
      voice: voiceRef.current,
      reason,
      lead: leadRef.current,
      messages: msgs,
    };
  }, []);

  const flushTranscript = useCallback(
    (reason: string, useBeacon = false) => {
      if (sentReasonsRef.current.has(reason)) return;
      const hasUserTurn = transcriptRef.current.some(
        (t) => (t as ChatMessage).role === "you" && ((t as ChatMessage).text || "").trim().length > 0,
      );
      if (!hasUserTurn) return;
      sentReasonsRef.current.add(reason);

      const payload = buildTranscriptPayload(reason);
      const body = JSON.stringify(payload);

      if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        try {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(`${TRANSCRIPT_URL}?apikey=${encodeURIComponent(ANON_KEY)}`, blob);
          return;
        } catch {
          // fall through to fetch
        }
      }

      fetch(TRANSCRIPT_URL, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body,
      }).catch(() => {
        // best-effort · don't surface to user
      });
    },
    [buildTranscriptPayload],
  );

  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      flushTranscript("idle");
    }, IDLE_MS);
  }, [flushTranscript]);

  // Arm idle timer whenever transcript changes
  useEffect(() => {
    if (transcript.length > 0) armIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [transcript, armIdleTimer]);

  // Page-hide / unload · sendBeacon
  useEffect(() => {
    const onHide = () => flushTranscript("pagehide", true);
    const onVis = () => {
      if (document.visibilityState === "hidden") flushTranscript("hidden", true);
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flushTranscript]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      // Component unmount · best-effort flush
      flushTranscript("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    submitDeploymentInquiry,
    deploymentInquirySent,
    deploymentFormShouldOpen,
    chatLocked,
  };
}
