import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { INTAKE_PROTOCOL, INTAKE_HEADER, type IntakeTurn } from "./intake-protocol";

// RADDO brand motion curve
const BRAND_EASE = [0.22, 1, 0.36, 1] as const;

type TranscriptEntry =
  | { role: "cob"; id: string; text: string; at: number }
  | { role: "you"; id: string; text: string; at: number };

function fmtClock(d: Date) {
  // YY.MM.DD · HH:MM UTC
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getUTCFullYear() % 100)}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} · ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
}

function nextTurnIndex(protocol: IntakeTurn[], currentIndex: number, reply: string): number {
  let i = currentIndex + 1;
  while (i < protocol.length && protocol[i].kind === "branch") {
    const branch = protocol[i] as Extract<IntakeTurn, { kind: "branch" }>;
    const targetId = branch.on(reply);
    const target = protocol.findIndex((t) => t.id === targetId);
    if (target === -1) return protocol.length;
    i = target;
  }
  return i;
}

const TypingDots = () => (
  <span aria-hidden className="inline-flex items-end gap-1 ml-1 align-middle">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: "hsl(var(--raddo-brass))" }}
        animate={{ opacity: [0.25, 1, 0.25] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
      />
    ))}
  </span>
);

export default function DossierIntake() {
  const [sealed, setSealed] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [turnIndex, setTurnIndex] = useState<number>(-1); // index in INTAKE_PROTOCOL of last asked
  const [draft, setDraft] = useState("");
  const [cobTyping, setCobTyping] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Autogrow textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [draft]);

  // Scroll transcript to bottom on new turn
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, cobTyping]);

  const askTurn = (idx: number, delayMs: number) => {
    if (idx >= INTAKE_PROTOCOL.length) return;
    const turn = INTAKE_PROTOCOL[idx];
    if (turn.kind === "branch") return;
    const text = turn.kind === "ask" ? turn.prompt : turn.message;
    setCobTyping(true);
    const reveal = () => {
      setCobTyping(false);
      setTranscript((prev) => [...prev, { role: "cob", id: turn.id, text, at: Date.now() }]);
      setTurnIndex(idx);
      if (turn.kind === "ask") {
        // refocus composer
        requestAnimationFrame(() => taRef.current?.focus());
      }
    };
    if (reducedMotion) reveal();
    else window.setTimeout(reveal, delayMs);
  };

  const unseal = () => {
    if (!sealed) return;
    setSealed(false);
    askTurn(0, reducedMotion ? 0 : 520);
  };

  const send = () => {
    const value = draft.trim();
    if (!value) return;
    const current = INTAKE_PROTOCOL[turnIndex];
    if (!current || current.kind !== "ask") return;
    setTranscript((prev) => [...prev, { role: "you", id: current.id + ":r", text: value, at: Date.now() }]);
    setDraft("");
    const next = nextTurnIndex(INTAKE_PROTOCOL, turnIndex, value);
    if (next < INTAKE_PROTOCOL.length) {
      askTurn(next, reducedMotion ? 0 : 700);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const currentTurn = turnIndex >= 0 ? INTAKE_PROTOCOL[turnIndex] : null;
  const composerDisabled = !currentTurn || currentTurn.kind !== "ask";
  const closing = currentTurn?.kind === "close" ? currentTurn : null;

  return (
    <section
      aria-labelledby="dossier-intake-heading"
      className="relative w-full mx-auto"
      style={{ maxWidth: "1180px" }}
    >
      <div
        className="relative"
        style={{
          backgroundColor: "hsl(var(--raddo-paper))",
          border: "1px solid hsl(var(--raddo-paper-edge))",
          borderRadius: "8px",
          boxShadow: "0 4px 12px -8px hsl(var(--raddo-ink-deep) / 0.18)",
          minHeight: "420px",
        }}
      >
        {/* Paper grain */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ borderRadius: "8px", mixBlendMode: "multiply", opacity: 0.06 }}
        >
          <filter id="dossier-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix
              values="0 0 0 0 0.05  0 0 0 0 0.17  0 0 0 0 0.33  0 0 0 0.6 0"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#dossier-grain)" />
        </svg>

        {/* Brass corner brackets */}
        <span className="pointer-events-none absolute left-3 top-3 h-3 w-3 border-l border-t border-raddo-brass-deep/60" />
        <span className="pointer-events-none absolute right-3 top-3 h-3 w-3 border-r border-t border-raddo-brass-deep/60" />
        <span className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b border-l border-raddo-brass-deep/60" />
        <span className="pointer-events-none absolute bottom-3 right-3 h-3 w-3 border-b border-r border-raddo-brass-deep/60" />

        {/* Inner padding */}
        <div className="relative px-6 pt-7 pb-6 md:px-10 md:pt-9 md:pb-8">
          {/* Header row */}
          <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
            <span
              className="font-sans text-[11px] tracking-[0.18em]"
              style={{ color: "hsl(var(--raddo-brass-deep))", fontWeight: 600 }}
            >
              {INTAKE_HEADER.eyebrow}
            </span>
            <span
              className="font-sans text-[11px] tabular-nums"
              style={{ color: "hsl(var(--raddo-ash))", letterSpacing: "0.06em" }}
            >
              {fmtClock(now)}
            </span>
          </div>

          {/* Title block */}
          <h2
            id="dossier-intake-heading"
            className="font-display mt-5"
            style={{
              color: "hsl(var(--raddo-ink-deep))",
              fontSize: "clamp(22px, 2.4vw, 28px)",
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
            }}
          >
            {INTAKE_HEADER.title}
          </h2>
          <p
            className="font-sans mt-2"
            style={{ color: "hsl(var(--raddo-ash))", fontSize: "13px", lineHeight: 1.55 }}
          >
            {INTAKE_HEADER.subtitle}
          </p>
          <div
            className="mt-5 h-px"
            style={{ width: 64, backgroundColor: "hsl(var(--raddo-brass))", opacity: 0.7 }}
          />

          {/* Sealed cover OR transcript */}
          <AnimatePresence mode="wait" initial={false}>
            {sealed ? (
              <motion.button
                key="sealed"
                type="button"
                onClick={unseal}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.42, ease: BRAND_EASE }}
                className="group mt-8 flex w-full flex-col items-center justify-center gap-4 py-16 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass rounded"
                aria-label="Open the intake dossier"
              >
                <span
                  aria-hidden
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full"
                  style={{
                    border: "1px solid hsl(var(--raddo-brass) / 0.55)",
                    backgroundColor: "hsl(var(--raddo-brass) / 0.12)",
                    color: "hsl(var(--raddo-brass-deep))",
                    fontFamily: "Fraunces, Georgia, serif",
                    fontWeight: 700,
                    fontSize: "16px",
                  }}
                >
                  ❦
                </span>
                <span
                  className="font-display"
                  style={{
                    color: "hsl(var(--raddo-ink-deep))",
                    fontSize: "clamp(20px, 2vw, 24px)",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Open the dossier
                </span>
                <span
                  className="font-sans"
                  style={{
                    color: "hsl(var(--raddo-ash))",
                    fontSize: "12px",
                    letterSpacing: "0.06em",
                  }}
                >
                  TAP TO UNSEAL · TWO QUESTIONS · UNDER 60 SECONDS
                </span>
              </motion.button>
            ) : (
              <motion.div
                key="open"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.42, ease: BRAND_EASE }}
                className="mt-6"
              >
                {/* Transcript */}
                <div
                  ref={scrollRef}
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                  className="flex flex-col gap-5 overflow-y-auto pr-1"
                  style={{ maxHeight: "320px" }}
                >
                  {transcript.map((entry) =>
                    entry.role === "cob" ? (
                      <motion.div
                        key={entry.id + entry.at}
                        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: BRAND_EASE }}
                        className="relative pl-4"
                      >
                        <span
                          aria-hidden
                          className="absolute left-0 top-1 bottom-1 w-[3px]"
                          style={{ backgroundColor: "hsl(var(--raddo-brass))" }}
                        />
                        <p
                          className="font-display"
                          style={{
                            color: "hsl(var(--raddo-ink-deep))",
                            fontSize: "18px",
                            lineHeight: 1.4,
                            fontWeight: 700,
                            letterSpacing: "-0.005em",
                          }}
                        >
                          {entry.text}
                        </p>
                        <span
                          className="font-sans mt-1 block tabular-nums"
                          style={{ color: "hsl(var(--raddo-ash))", fontSize: "11px", letterSpacing: "0.06em" }}
                        >
                          COB · {fmtClock(new Date(entry.at))}
                        </span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key={entry.id + entry.at}
                        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: BRAND_EASE }}
                        className="flex flex-col items-end"
                      >
                        <div
                          className="font-sans"
                          style={{
                            maxWidth: "78%",
                            backgroundColor: "hsl(var(--raddo-paper-edge) / 0.55)",
                            border: "1px solid hsl(var(--raddo-paper-edge))",
                            color: "hsl(var(--raddo-charcoal))",
                            fontSize: "15px",
                            lineHeight: 1.55,
                            padding: "10px 14px",
                            borderRadius: "4px",
                            boxShadow: "0 2px 6px -4px hsl(var(--raddo-ink-deep) / 0.15)",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {entry.text}
                        </div>
                        <span
                          className="font-sans mt-1 block tabular-nums"
                          style={{ color: "hsl(var(--raddo-ash))", fontSize: "11px", letterSpacing: "0.06em" }}
                        >
                          YOU · {fmtClock(new Date(entry.at))}
                        </span>
                      </motion.div>
                    ),
                  )}

                  {cobTyping && (
                    <div className="relative pl-4">
                      <span
                        aria-hidden
                        className="absolute left-0 top-1 bottom-1 w-[3px]"
                        style={{ backgroundColor: "hsl(var(--raddo-brass) / 0.5)" }}
                      />
                      <span
                        className="font-sans"
                        style={{ color: "hsl(var(--raddo-ash))", fontSize: "12px", letterSpacing: "0.06em" }}
                      >
                        COB IS WRITING<TypingDots />
                      </span>
                    </div>
                  )}
                </div>

                {/* Closing CTA (after final close turn) */}
                {closing?.cta && (
                  <motion.div
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: BRAND_EASE, delay: 0.1 }}
                    className="mt-6"
                  >
                    <a
                      href={closing.cta.href}
                      className="raddo-cta-brass group inline-flex items-center gap-3 font-sans"
                      style={{
                        backgroundColor: "hsl(var(--raddo-brass))",
                        color: "hsl(var(--raddo-ink-deep))",
                        padding: "14px 24px",
                        borderRadius: "4px",
                        fontSize: "14px",
                        fontWeight: 600,
                        letterSpacing: "0.01em",
                      }}
                    >
                      <span>{closing.cta.label}</span>
                      <span aria-hidden className="transition-transform duration-220 group-hover:translate-x-[3px]">
                        →
                      </span>
                    </a>
                  </motion.div>
                )}

                {/* Composer */}
                {!closing && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                    className="mt-6"
                  >
                    <label htmlFor="dossier-composer" className="sr-only">
                      Type your answer
                    </label>
                    <div
                      className="flex items-end gap-3"
                      style={{
                        backgroundColor: "hsl(var(--raddo-paper))",
                        border: "1px solid hsl(var(--raddo-paper-edge))",
                        borderRadius: "4px",
                        padding: "10px 12px",
                        transition: "border-color 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    >
                      <textarea
                        ref={taRef}
                        id="dossier-composer"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        disabled={composerDisabled}
                        rows={1}
                        placeholder="Type your answer · Enter to send · Shift+Enter for a new line"
                        className="flex-1 resize-none bg-transparent font-sans outline-none placeholder:text-raddo-ash/70 disabled:opacity-50"
                        style={{
                          color: "hsl(var(--raddo-ink-deep))",
                          fontSize: "16px",
                          lineHeight: 1.5,
                          minHeight: "24px",
                          maxHeight: "160px",
                        }}
                      />
                      <button
                        type="submit"
                        disabled={composerDisabled || !draft.trim()}
                        aria-label="Send your answer"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded transition-transform duration-150 active:translate-y-[1px] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass"
                        style={{
                          backgroundColor: "hsl(var(--raddo-brass))",
                          color: "hsl(var(--raddo-ink-deep))",
                          fontWeight: 700,
                        }}
                      >
                        →
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className="font-sans"
                        style={{ color: "hsl(var(--raddo-ash))", fontSize: "11px", letterSpacing: "0.04em" }}
                      >
                        Encrypted in transit · stored only with your consent · withdraw anytime.
                      </span>
                      {draft.length > 280 && (
                        <span
                          className="font-sans tabular-nums"
                          style={{ color: "hsl(var(--raddo-ash))", fontSize: "11px" }}
                        >
                          {draft.length}
                        </span>
                      )}
                    </div>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fleuron */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-4 right-6 font-display"
            style={{ color: "hsl(var(--raddo-brass) / 0.4)", fontSize: "14px" }}
          >
            ❦
          </span>
        </div>
      </div>
    </section>
  );
}
