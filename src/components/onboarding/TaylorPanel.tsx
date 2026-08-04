import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * UNIT 2 · TAYLOR panel. One thread, two surfaces.
 *
 * Renders the FULL shared thread, including anything the client said to TAYLOR
 * inside their Claude chat through the COB Connector. Polls every 6 seconds so
 * connector traffic is visible well inside 10 seconds.
 */

type Msg = {
  id: string;
  role: "client" | "taylor";
  surface: "start_panel" | "connector";
  content: string;
  created_at: string;
};

const POLL_MS = 6000;

const ERROR_COPY: Record<string, string> = {
  taylor_model_key_unresolvable: "TAYLOR cannot reach her model right now. Nothing you typed was lost.",
  taylor_model_call_rejected: "The model refused that request. Try again in a moment.",
  taylor_model_unreachable: "TAYLOR could not reach the model. Try again in a moment.",
  taylor_model_returned_nothing: "TAYLOR had nothing to say back. Try rephrasing.",
  taylor_client_message_not_recorded: "Your message did not save. Send it again.",
  taylor_reply_not_recorded: "TAYLOR replied but the reply did not save.",
  taylor_no_tenant_for_caller: "Your account is not linked to a company record yet.",
  taylor_token_rejected: "Your session expired. Refresh the page.",
  taylor_thread_unavailable: "Your conversation could not be opened.",
  taylor_cid_lookup_failed: "We could not confirm which company you belong to.",
  taylor_runtime_service_role_missing: "TAYLOR is not fully configured on our side.",
  taylor_runtime_supabase_config_missing: "TAYLOR is not fully configured on our side.",
};

export function TaylorPanel({ pageCtx }: { pageCtx?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.functions.invoke("taylor-thread", { body: { action: "read" } });
    if (err) {
      setReady(true);
      return;
    }
    const next = Array.isArray((data as any)?.messages) ? ((data as any).messages as Msg[]) : [];
    setMessages(next);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [ready]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    const { data, error: err } = await supabase.functions.invoke("taylor-thread", {
      body: { action: "post", message: text, page_ctx: pageCtx || "" },
    });
    const code = (data as any)?.error || (err ? "taylor_model_unreachable" : null);
    if (code) setError(ERROR_COPY[code] ?? "TAYLOR could not answer that one. Try again.");
    await load();
    setSending(false);
    inputRef.current?.focus();
  };

  return (
    <aside
      aria-label="TAYLOR, your onboarding guide"
      className="flex flex-col bg-dossier-paper border-l"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        zIndex: 3,
        boxSizing: "border-box",
        borderColor: "hsl(var(--dossier-ink-deep))",
      }}
    >
      <header
        className="px-5 py-4 flex items-center gap-3"
        style={{
          background: "hsl(var(--dossier-ink-deep))",
          borderBottom: "2px solid hsl(var(--dossier-brass))",
        }}
      >
        <img
          src={cobMark}
          alt=""
          aria-hidden="true"
          style={{ width: 30, height: 30, borderRadius: 4, flex: "none" }}
        />
        <div className="min-w-0">
          <p
            className="font-mono uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "hsl(var(--dossier-brass))",
              fontWeight: 700,
            }}
          >
            taylor · your guide
          </p>
          <p className="mt-1 text-sm" style={{ color: "hsl(var(--dossier-paper))" }}>
            She sets up your COB with you. Same conversation here and in your Claude chat.
          </p>
        </div>
      </header>




      <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {!ready && (
          <p className="font-mono uppercase text-dossier-ash" style={{ fontSize: 10, letterSpacing: "0.22em" }}>
            opening your thread…
          </p>
        )}
        {ready && messages.length === 0 && (
          <p className="text-sm text-dossier-ash">
            Ask TAYLOR anything about this step. She already knows what you have given so far.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <p
              className="font-mono uppercase text-dossier-ash mb-1"
              style={{ fontSize: 9, letterSpacing: "0.18em" }}
            >
              {m.role === "taylor" ? "taylor" : "you"}
              {m.surface === "connector" ? " · from your Claude chat" : ""}
            </p>
            <p
              className="text-sm whitespace-pre-wrap"
              style={{
                color: m.role === "taylor" ? "hsl(var(--dossier-ink-deep))" : "hsl(var(--dossier-charcoal))",
                borderLeft: m.role === "taylor" ? "2px solid hsl(var(--dossier-brass))" : "2px solid hsl(var(--dossier-paper-edge))",
                paddingLeft: 10,
              }}
            >
              {m.content}
            </p>
          </div>
        ))}
        {sending && (
          <p className="font-mono uppercase text-dossier-ash" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
            taylor is thinking…
          </p>
        )}
        {error && (
          <p className="text-sm" style={{ color: "hsl(var(--dossier-brass-deep))" }} role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-dossier-paper-edge p-4">
        <label htmlFor="taylor-draft" className="sr-only">
          Message TAYLOR
        </label>
        <textarea
          id="taylor-draft"
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder="Ask TAYLOR about this step"
          className="w-full resize-none rounded bg-white border border-dossier-paper-edge px-3 py-2 text-sm text-dossier-ink-deep focus:outline-none focus:ring-2 focus:ring-dossier-brass"
          style={{ borderRadius: 4 }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          className="mt-2 w-full font-mono uppercase disabled:opacity-40"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            borderRadius: 4,
            padding: "10px 12px",
            background: "hsl(var(--dossier-brass))",
            color: "hsl(var(--dossier-ink-deep))",
            fontWeight: 700,
          }}
        >
          Send
        </button>
      </div>
    </aside>
  );
}
