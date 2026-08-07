/** Dock transport · streams from the existing cob-chat edge function.
 *
 * THE WRITE LAW: this hook never writes to the database. It POSTs a
 * conversation to cob-chat and renders what streams back. Nothing else.
 */
import { useCallback, useRef, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/cob-chat`;

export type DockMessage = {
  id: string;
  role: "cob" | "you";
  text: string;
  streaming?: boolean;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function useDockChat() {
  const [messages, setMessages] = useState<DockMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(uid());
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (raw: string, pageLabel: string) => {
      const text = raw.trim();
      if (!text || pending) return;

      setError(null);
      const mine: DockMessage = { id: uid(), role: "you", text };
      const replyId = uid();

      const history = [...messages, mine];
      setMessages([...history, { id: replyId, role: "cob", text: "", streaming: true }]);
      setPending(true);

      const wire = history.map((m) => ({
        role: m.role === "you" ? "user" : "assistant",
        content: m.text,
      }));
      // Page context rides in as a plain conversational preface, not a write.
      if (pageLabel) {
        wire.unshift({
          role: "user",
          content: `[context] I am looking at: ${pageLabel}`,
        });
        wire.unshift({ role: "assistant", content: "Noted." } as never);
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const append = (delta: string) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, text: m.text + delta } : m)),
        );
      };
      const finalize = (fallback?: string, err?: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? { ...m, streaming: false, text: m.text || fallback || "" }
              : m,
          ),
        );
        if (err) setError(err);
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
            voice: "cob",
            messages: wire,
          }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          let errText = "Couldn't reach your COB. Try again.";
          try {
            const j = await resp.json();
            if (j?.error) errText = String(j.error);
          } catch {
            /* not JSON */
          }
          finalize("Signal dropped on my side. Try that again.", errText);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent: string | null = null;
        let done = false;

        const flushLine = (rawLine: string) => {
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
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
            done = true;
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            if (currentEvent === "trace") return;
            if (currentEvent === "error") {
              setError(String(parsed?.error || "Stream interrupted."));
              return;
            }
            const content = parsed?.choices?.[0]?.delta?.content as string | undefined;
            if (content) append(content);
          } catch {
            /* partial frame · dropped */
          }
        };

        while (!done) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            flushLine(line);
            if (done) break;
          }
        }
        if (buffer.trim()) for (const l of buffer.split("\n")) flushLine(l);
        finalize();
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") {
          finalize();
          return;
        }
        finalize(
          "Signal dropped on my side. Try that again.",
          (e as Error)?.message || "Couldn't reach your COB.",
        );
      } finally {
        setPending(false);
        abortRef.current = null;
      }
    },
    [messages, pending],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, pending, error, send, stop };
}
