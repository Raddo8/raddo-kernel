/** CobDock · the COB chat dock, present on every React HQ page.
 *
 * Mirrors the dock in the pinned client HQ document (surface_version hq v29-r28):
 * fixed to the bottom, 2px ink top border, navy/ink bubbles for COB and
 * brass/paper bubbles for the principal, pill controls, 16px composer radius.
 *
 * Four states, persisted in localStorage under `hq.dock.mode`:
 *   bottom (default) · pinned (right sidebar) · collapsed (bar) · expanded
 *
 * THE WRITE LAW, binding: this surface never writes. It reads the page it sits
 * on and it talks. Any change to the record is made by COB, not by the dock.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CobMark } from "./CobMark";
import { useCob } from "@/lib/cob-identity";
import { useDockContext } from "./dock-context";
import { useDockChat } from "./use-dock-chat";
import "./cob-dock.css";

export type DockMode = "bottom" | "pinned" | "collapsed" | "expanded";

const MODE_KEY = "hq.dock.mode";
const HEIGHT_KEY = "hq.dock.height";

function readMode(): DockMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "bottom" || v === "pinned" || v === "collapsed" || v === "expanded") return v;
  } catch {
    /* private-mode browser simply does not remember the dock */
  }
  return "bottom";
}

function readHeight(): number {
  try {
    const v = Number(localStorage.getItem(HEIGHT_KEY));
    if (Number.isFinite(v) && v >= 140 && v <= 900) return v;
  } catch {
    /* ignore */
  }
  return 0;
}

export function CobDock() {
  const { page, compose } = useDockContext();
  const { cobName } = useCob();
  const { messages, pending, error, send } = useDockChat();
  const [mode, setMode] = useState<DockMode>(() => readMode());
  const [height, setHeight] = useState<number>(() => readHeight());
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const persistMode = (next: DockMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  // The dock owns the page gutter so it never covers the last row of a record.
  useLayoutEffect(() => {
    const root = document.querySelector(".hqg") as HTMLElement | null;
    if (!root) return;
    root.classList.remove("dock-bottom", "dock-pinned", "dock-collapsed", "dock-expanded");
    root.classList.add(`dock-${mode}`);
    if (height > 0) root.style.setProperty("--dock-h", `${height}px`);
    return () => {
      root.classList.remove("dock-bottom", "dock-pinned", "dock-collapsed", "dock-expanded");
    };
  }, [mode, height]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (mode !== "collapsed") inputRef.current?.focus();
  }, [mode]);

  // A page can hand the composer a message. It is never sent for the client.
  useEffect(() => {
    if (!compose) return;
    setDraft(compose.text);
    persistMode(mode === "collapsed" ? "bottom" : mode);
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose?.nonce]);

  // Vertical resize grip · bottom and expanded only.
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = Math.min(Math.max(d.h + (d.y - e.clientY), 140), window.innerHeight * 0.7);
      setHeight(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [height]);

  const submit = () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    void send(text, page.record ? `${page.label} · ${page.record}` : page.label);
    inputRef.current?.focus();
  };

  return (
    <section
      className={`cobdock ${mode}`}
      aria-label={cobName ? `Talk to ${cobName}` : "Talk to your chief of business"}
      style={mode === "bottom" && height > 0 ? { height } : undefined}
    >
      {(mode === "bottom" || mode === "expanded") && (
        <div
          className="dock-grip"
          role="separator"
          aria-label="Resize the dock"
          onMouseDown={(e) => {
            const el = e.currentTarget.parentElement as HTMLElement;
            dragRef.current = { y: e.clientY, h: el.getBoundingClientRect().height };
          }}
        />
      )}

      <header className="dock-head">
        <CobMark className="dock-mark" size={20} />
        <div>
          <div className="dock-title">{cobName ?? "\u00a0"}</div>
          <div className="dock-where">{page.record ? `${page.label} · ${page.record}` : page.label}</div>
        </div>
        <div className="dock-acts">
          <button
            type="button"
            className={`dock-b ${mode === "pinned" ? "on" : ""}`}
            aria-pressed={mode === "pinned"}
            onClick={() => persistMode(mode === "pinned" ? "bottom" : "pinned")}
          >
            {mode === "pinned" ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            className={`dock-b ${mode === "expanded" ? "on" : ""}`}
            aria-pressed={mode === "expanded"}
            onClick={() => persistMode(mode === "expanded" ? "bottom" : "expanded")}
          >
            {mode === "expanded" ? "Shrink" : "Expand"}
          </button>
          <button
            type="button"
            className="dock-b"
            aria-expanded={mode !== "collapsed"}
            onClick={() => persistMode(mode === "collapsed" ? "bottom" : "collapsed")}
          >
            {mode === "collapsed" ? "Open" : "Hide"}
          </button>
        </div>
      </header>

      <div className="dock-body">
        <div className="dock-log" ref={logRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="bub">
              {cobName ? `${cobName} is here on every page. ` : ""}Ask what this record means,
              or say what you want changed &middot; the change is made for you, you read the result.
            </div>
          )}
          {messages.map((m) =>
            m.streaming && !m.text ? (
              <div key={m.id} className="bub wait">
                thinking&hellip;
              </div>
            ) : (
              <div key={m.id} className={`bub ${m.role === "you" ? "me" : ""}`}>
                <span className="bub-who">{m.role === "you" ? "You" : cobName ?? ""}</span>
                {m.text}
              </div>
            ),
          )}
        </div>

        {error && <div className="dock-err">{error}</div>}

        <form
          className="dock-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor="cob-dock-input">
            {cobName ? `Message ${cobName}` : "Send a message"}
          </label>
          <textarea
            id="cob-dock-input"
            ref={inputRef}
            className="dock-in"
            rows={1}
            value={draft}
            placeholder={cobName ? `Ask ${cobName} about this page\u2026` : "Ask about this page\u2026"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="submit" className="dock-send" disabled={pending || !draft.trim()}>
            Send
          </button>
        </form>
      </div>
    </section>
  );
}

export default CobDock;
