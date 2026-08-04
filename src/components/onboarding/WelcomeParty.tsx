import { useEffect, useRef, useState } from "react";
import cobMarkAsset from "@/assets/cob-square-dark.png.asset.json";

const cobMark = cobMarkAsset.url;

const INK_DEEP = "#042C53";
const INK = "#0C447C";
const BRASS = "#EF9F27";
const PAPER = "#FAF8F4";

/**
 * UNIT 3 · THE WELCOME PARTY.
 *
 * Fires once, when the server record shows the client's first connection
 * succeeded. Golden master treatment: navy ground, brass rules, dossier serif.
 * The only mark used is the canonical COB square. Nothing here is generated.
 */
export function WelcomeParty({
  cobName,
  displayName,
  firstName,
  onRename,
  onDismiss,
}: {
  cobName: string | null;
  displayName: string | null;
  firstName: string | null;
  onRename: (name: string) => Promise<{ ok: boolean; cobName?: string; message?: string }>;
  onDismiss: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
    else closeRef.current?.focus();
  }, [renaming]);

  const name = (cobName || "").trim() || "YOUR COB";

  const save = async () => {
    const next = draft.trim();
    if (!next || saving) return;
    setSaving(true);
    setError(null);
    const res = await onRename(next);
    setSaving(false);
    if (!res.ok) {
      setError(res.message || "That name did not save. Try another one.");
      return;
    }
    setRenaming(false);
    setDraft("");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your COB is live"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: `radial-gradient(circle at 50% 22%, ${INK} 0%, ${INK_DEEP} 58%, #021B34 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 860, textAlign: "center" }}>
        <img
          src={cobMark}
          alt="Chief of Business"
          style={{ width: 76, height: 76, borderRadius: 8, margin: "0 auto", display: "block" }}
        />

        <p
          className="font-mono uppercase"
          style={{ marginTop: 28, fontSize: 10, letterSpacing: "0.32em", color: BRASS, fontWeight: 700 }}
        >
          first connection · confirmed
        </p>

        <div style={{ margin: "18px auto 0", width: 120, height: 2, background: BRASS, opacity: 0.9 }} />

        <p className="font-display" style={{ marginTop: 28, fontSize: 20, color: PAPER, opacity: 0.82 }}>
          {firstName ? `${firstName}, your COB is live.` : "Your COB is live."}
        </p>

        <h1
          className="font-display"
          style={{
            marginTop: 14,
            fontSize: "clamp(3rem, 10vw, 6.5rem)",
            lineHeight: 1.02,
            fontWeight: 900,
            color: PAPER,
            letterSpacing: "-0.01em",
            wordBreak: "break-word",
          }}
        >
          {name}
        </h1>

        {displayName && (
          <p
            className="font-mono uppercase"
            style={{ marginTop: 16, fontSize: 10, letterSpacing: "0.28em", color: BRASS, opacity: 0.9 }}
          >
            chief of business · {displayName}
          </p>
        )}

        <p
          style={{
            margin: "26px auto 0",
            maxWidth: 560,
            fontSize: 15,
            lineHeight: 1.6,
            color: PAPER,
            opacity: 0.78,
          }}
        >
          The connection held. From here your COB starts pulling your world together: email, calendar, and the
          databases your business runs on. The name is yours to set, and you can change it now.
        </p>

        {!renaming && (
          <div style={{ marginTop: 34, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              ref={closeRef}
              type="button"
              onClick={onDismiss}
              className="font-mono uppercase"
              style={{
                fontSize: 11,
                letterSpacing: "0.2em",
                fontWeight: 700,
                padding: "14px 26px",
                borderRadius: 4,
                background: BRASS,
                color: INK_DEEP,
                border: "1px solid " + BRASS,
              }}
            >
              Keep {name} · continue
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(cobName || "");
                setRenaming(true);
              }}
              className="font-mono uppercase"
              style={{
                fontSize: 11,
                letterSpacing: "0.2em",
                fontWeight: 700,
                padding: "14px 26px",
                borderRadius: 4,
                background: "transparent",
                color: BRASS,
                border: "1px solid " + BRASS,
              }}
            >
              Change the name
            </button>
          </div>
        )}

        {renaming && (
          <div style={{ marginTop: 34, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <label htmlFor="cob-rename" className="sr-only">
              Name your COB
            </label>
            <input
              id="cob-rename"
              ref={inputRef}
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              placeholder="Name your COB"
              className="font-display"
              style={{
                width: 320,
                maxWidth: "100%",
                padding: "13px 16px",
                borderRadius: 4,
                fontSize: 18,
                background: PAPER,
                color: INK_DEEP,
                border: "1px solid " + BRASS,
                outlineColor: BRASS,
              }}
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || draft.trim().length < 2}
              className="font-mono uppercase disabled:opacity-40"
              style={{
                fontSize: 11,
                letterSpacing: "0.2em",
                fontWeight: 700,
                padding: "14px 26px",
                borderRadius: 4,
                background: BRASS,
                color: INK_DEEP,
                border: "1px solid " + BRASS,
              }}
            >
              {saving ? "Saving" : "Save the name"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setError(null);
              }}
              className="font-mono uppercase"
              style={{
                fontSize: 11,
                letterSpacing: "0.2em",
                fontWeight: 700,
                padding: "14px 26px",
                borderRadius: 4,
                background: "transparent",
                color: PAPER,
                border: "1px solid rgba(250,248,244,0.35)",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {error && (
          <p role="alert" style={{ marginTop: 18, fontSize: 13, color: BRASS }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
