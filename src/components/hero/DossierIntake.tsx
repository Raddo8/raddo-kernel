import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCobChat, type TranscriptItem, type ChatMessage, type LeadInfo } from "./use-cob-chat";
import { VOICES, type VoiceId } from "./cob-voices";
import { FEATURED_ROLES, FEATURED_INDUSTRIES, ALL_ROLES, ALL_INDUSTRIES } from "./cob-featured";

// ── Gate form (inline) ─────────────────────────────────────────────────────
function GateForm({
  onSubmit,
  submitting,
  error,
}: {
  onSubmit: (lead: LeadInfo) => Promise<{ ok: true } | { ok: false; error: string }>;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [challenge, setChallenge] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const lead: LeadInfo = {
      name: name.trim(),
      email: email.trim(),
      company: company.trim(),
      title: title.trim(),
      challenge: challenge.trim(),
    };
    if (!lead.name || !lead.email || !lead.company || !lead.title) {
      setLocalError("All fields are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      setLocalError("Use a real email address.");
      return;
    }
    if (lead.challenge.length < 10) {
      setLocalError("Tell us a bit more · at least one full sentence.");
      return;
    }
    const res = await onSubmit(lead);
    if (res.ok === false) setLocalError(res.error);
  };

  const fieldStyle: React.CSSProperties = {
    backgroundColor: "hsl(var(--raddo-paper))",
    border: "1px solid hsl(var(--raddo-paper-edge))",
    borderRadius: "4px",
    padding: "10px 12px",
    fontSize: "15px",
    lineHeight: 1.5,
    color: "hsl(var(--raddo-ink-deep))",
    width: "100%",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    color: "hsl(var(--raddo-brass-deep))",
    fontSize: "10px",
    letterSpacing: "0.18em",
    fontWeight: 600,
    display: "block",
    marginBottom: "6px",
  };

  const shown = localError || error;

  return (
    <motion.form
      key="gate"
      onSubmit={handle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="mt-8 flex flex-col gap-4"
    >
      <div>
        <span
          className="font-sans"
          style={{
            color: "hsl(var(--raddo-brass-deep))",
            fontSize: "10px",
            letterSpacing: "0.18em",
            fontWeight: 600,
          }}
        >
          INTAKE · BEFORE WE OPEN THE ROOM
        </span>
        <h3
          className="font-display mt-2"
          style={{
            color: "hsl(var(--raddo-ink-deep))",
            fontSize: "clamp(18px, 1.9vw, 22px)",
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}
        >
          Tell your COB who's at the table. Then name the one thing on your mind.
        </h3>
        <p
          className="font-sans mt-1"
          style={{ color: "hsl(var(--raddo-ash))", fontSize: "13px", lineHeight: 1.55 }}
        >
          Five fields. Used to ground your COB's first read · nothing leaves this page.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="gate-name" className="font-sans" style={labelStyle}>NAME</label>
          <input
            id="gate-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and last"
            className="font-sans placeholder:text-raddo-ash/60 focus:border-raddo-brass-deep"
            style={fieldStyle}
            maxLength={120}
            required
          />
        </div>
        <div>
          <label htmlFor="gate-email" className="font-sans" style={labelStyle}>EMAIL</label>
          <input
            id="gate-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="font-sans placeholder:text-raddo-ash/60 focus:border-raddo-brass-deep"
            style={fieldStyle}
            maxLength={200}
            required
          />
        </div>
        <div>
          <label htmlFor="gate-company" className="font-sans" style={labelStyle}>COMPANY</label>
          <input
            id="gate-company"
            type="text"
            autoComplete="organization"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Where you run point"
            className="font-sans placeholder:text-raddo-ash/60 focus:border-raddo-brass-deep"
            style={fieldStyle}
            maxLength={160}
            required
          />
        </div>
        <div>
          <label htmlFor="gate-title" className="font-sans" style={labelStyle}>TITLE</label>
          <input
            id="gate-title"
            type="text"
            autoComplete="organization-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="CFO · COO · CEO · Chief of Staff"
            className="font-sans placeholder:text-raddo-ash/60 focus:border-raddo-brass-deep"
            style={fieldStyle}
            maxLength={160}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="gate-challenge" className="font-sans" style={labelStyle}>
          ONE CHALLENGING THING · PAST WEEK OR THE HORIZON AHEAD
        </label>
        <textarea
          id="gate-challenge"
          value={challenge}
          onChange={(e) => setChallenge(e.target.value)}
          placeholder="The thing eating your week · the call you're about to make · the number that won't sit right. One paragraph is plenty."
          rows={4}
          className="font-sans placeholder:text-raddo-ash/60 focus:border-raddo-brass-deep resize-none"
          style={{ ...fieldStyle, minHeight: "110px" }}
          maxLength={2000}
          required
        />
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 md:flex-row md:items-center md:justify-between">
        <span
          className="font-sans"
          style={{ color: "hsl(var(--raddo-ash))", fontSize: "11px", letterSpacing: "0.04em" }}
        >
          Encrypted in transit · stored only for your COB's read · withdraw anytime.
        </span>
        <div className="flex items-center gap-3">
          {shown && (
            <span
              className="font-sans"
              style={{
                color: "hsl(var(--raddo-brass-deep))",
                fontSize: "11px",
                letterSpacing: "0.04em",
                borderBottom: "1px solid hsl(var(--raddo-brass-deep))",
              }}
            >
              {shown}
            </span>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center px-5 py-2.5 font-sans transition-transform duration-150 active:translate-y-[1px] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass"
            style={{
              backgroundColor: "hsl(var(--raddo-brass))",
              color: "hsl(var(--raddo-ink-deep))",
              border: "1px solid hsl(var(--raddo-brass-deep))",
              borderRadius: "4px",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              minWidth: "180px",
            }}
          >
            {submitting ? "Opening…" : "Open the sample COB"}
          </button>
        </div>
      </div>
    </motion.form>
  );
}

// RADDO brand motion curve
const BRAND_EASE = [0.22, 1, 0.36, 1] as const;

const INTAKE_HEADER = {
  eyebrow: "SAMPLE COB · CONFIDENTIAL · SESSION 001",
  title: "Meet your COB. Same brain, your call on the voice.",
  subtitle:
    "Pick a lens, name your industry, ask one real question. Two voices, one substance. Nothing leaves this page.",
};

function fmtClock(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getUTCFullYear() % 100)}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} · ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
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

// ── Chip strip primitives ──────────────────────────────────────────────────
function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="font-sans transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass"
      style={{
        backgroundColor: active ? "hsl(var(--raddo-ink-deep))" : "hsl(var(--raddo-paper))",
        color: active ? "hsl(var(--raddo-paper))" : "hsl(var(--raddo-ink-deep))",
        border: `1px solid ${active ? "hsl(var(--raddo-ink-deep))" : "hsl(var(--raddo-paper-edge))"}`,
        borderRadius: "4px",
        padding: "5px 11px",
        fontSize: "12px",
        letterSpacing: "0.02em",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function ChipStrip({
  eyebrow,
  featured,
  all,
  value,
  onChange,
  browseLabel,
}: {
  eyebrow: string;
  featured: { label: string }[];
  all: string[];
  value?: string;
  onChange: (v?: string) => void;
  browseLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((s) => s.toLowerCase().includes(q));
  }, [filter, all]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-sans"
          style={{
            color: "hsl(var(--raddo-brass-deep))",
            fontSize: "10px",
            letterSpacing: "0.18em",
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="font-sans focus:outline-none focus-visible:underline"
            style={{
              color: "hsl(var(--raddo-ash))",
              fontSize: "10px",
              letterSpacing: "0.14em",
            }}
          >
            CLEAR
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {featured.map((f) => (
          <Chip
            key={f.label}
            label={f.label}
            active={value === f.label}
            onClick={() => onChange(value === f.label ? undefined : f.label)}
          />
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="font-sans transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass"
          style={{
            border: `1px dashed hsl(var(--raddo-brass-deep) / 0.55)`,
            color: "hsl(var(--raddo-brass-deep))",
            backgroundColor: "transparent",
            borderRadius: "4px",
            padding: "5px 11px",
            fontSize: "12px",
            letterSpacing: "0.02em",
            fontWeight: 500,
          }}
        >
          {open ? "Close" : browseLabel}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: BRAND_EASE }}
            className="overflow-hidden"
          >
            <div
              className="mt-3 p-3"
              style={{
                backgroundColor: "hsl(var(--raddo-paper))",
                border: "1px solid hsl(var(--raddo-paper-edge))",
                borderRadius: "4px",
              }}
            >
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter · type to narrow"
                className="font-sans w-full bg-transparent outline-none placeholder:text-raddo-ash/70 pb-2 mb-2"
                style={{
                  color: "hsl(var(--raddo-ink-deep))",
                  fontSize: "13px",
                  borderBottom: "1px solid hsl(var(--raddo-paper-edge))",
                }}
              />
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {filtered.length === 0 && (
                  <span
                    className="font-sans"
                    style={{ color: "hsl(var(--raddo-ash))", fontSize: "12px" }}
                  >
                    No match. Type your own lens in the composer below.
                  </span>
                )}
                {filtered.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    active={value === label}
                    onClick={() => {
                      onChange(label);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Voice toggle ────────────────────────────────────────────────────────────
function VoiceToggle({ value, onChange }: { value: VoiceId; onChange: (v: VoiceId) => void }) {
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const idx = VOICES.findIndex((v) => v.id === value);
      const nextIdx = e.key === "ArrowRight" ? (idx + 1) % VOICES.length : (idx + VOICES.length - 1) % VOICES.length;
      onChange(VOICES[nextIdx].id);
    }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-sans"
          style={{
            color: "hsl(var(--raddo-brass-deep))",
            fontSize: "10px",
            letterSpacing: "0.18em",
            fontWeight: 600,
          }}
        >
          VOICE
        </span>
        <span
          className="font-sans"
          style={{ color: "hsl(var(--raddo-ash))", fontSize: "10px", letterSpacing: "0.04em" }}
        >
          Same brain. Different voice. Toggle anytime.
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Voice"
        onKeyDown={onKey}
        className="inline-flex"
        style={{
          border: "1px solid hsl(var(--raddo-brass-deep) / 0.6)",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        {VOICES.map((v) => {
          const active = v.id === value;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(v.id)}
              className="font-sans transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass"
              style={{
                backgroundColor: active ? "hsl(var(--raddo-ink-deep))" : "hsl(var(--raddo-paper))",
                color: active ? "hsl(var(--raddo-paper))" : "hsl(var(--raddo-ink-deep))",
                padding: "7px 16px",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderRight:
                  v.id !== VOICES[VOICES.length - 1].id
                    ? "1px solid hsl(var(--raddo-brass-deep) / 0.6)"
                    : "none",
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Transcript rendering ───────────────────────────────────────────────────
function isVoiceDivider(item: TranscriptItem): item is Extract<TranscriptItem, { kind: "voice-divider" }> {
  return (item as any).kind === "voice-divider";
}

function VoiceLabel({ voice }: { voice: VoiceId }) {
  return <>{voice === "michael" ? "MICHAEL" : "COB"}</>;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DossierIntake() {
  const [sealed, setSealed] = useState(true);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState<Date>(() => new Date());
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
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
  } = useCobChat();

  // Hard-close CTA gating · COB voice, ≥12 user turns in COB, not yet sent.
  const cobUserTurns = useMemo(
    () =>
      transcript.filter(
        (t) => (t as ChatMessage).role === "you" && (t as ChatMessage).voice === "cob",
      ).length,
    [transcript],
  );
  const showDeploymentCta = !sealed && voice === "cob" && cobUserTurns >= 12 && !deploymentInquirySent;

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [draft]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, pending]);

  const handleGateSubmit = async (lead: LeadInfo) => {
    const res = await submitLead(lead);
    if (res.ok) {
      setSealed(false);
      primeIfEmpty(lead);
      // Auto-send the visitor's stated challenge as the first user message · triggers Opus first-turn.
      requestAnimationFrame(() => {
        void send(lead.challenge);
        taRef.current?.focus();
      });
    }
    return res;
  };

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    setDraft("");
    void send(v);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const activeVoiceLabel = voice === "michael" ? "MICHAEL" : "COB";

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
          minHeight: "460px",
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
            <feColorMatrix values="0 0 0 0 0.05  0 0 0 0 0.17  0 0 0 0 0.33  0 0 0 0.6 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#dossier-grain)" />
        </svg>

        {/* Brass corner brackets */}
        <span className="pointer-events-none absolute left-3 top-3 h-3 w-3 border-l border-t border-raddo-brass-deep/60" />
        <span className="pointer-events-none absolute right-3 top-3 h-3 w-3 border-r border-t border-raddo-brass-deep/60" />
        <span className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b border-l border-raddo-brass-deep/60" />
        <span className="pointer-events-none absolute bottom-3 right-3 h-3 w-3 border-b border-r border-raddo-brass-deep/60" />

        <div className="relative px-6 pt-7 pb-6 md:px-10 md:pt-9 md:pb-8">
          {/* Header row */}
          <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
            <span
              className="font-sans"
              style={{
                color: "hsl(var(--raddo-brass-deep))",
                fontSize: "11px",
                letterSpacing: "0.18em",
                fontWeight: 600,
              }}
            >
              {INTAKE_HEADER.eyebrow}
            </span>
            <span
              className="font-sans tabular-nums"
              style={{ color: "hsl(var(--raddo-ash))", fontSize: "11px", letterSpacing: "0.06em" }}
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

          <AnimatePresence mode="wait" initial={false}>
            {sealed ? (
              <GateForm
                onSubmit={handleGateSubmit}
                submitting={submittingLead}
                error={error}
              />
            ) : (
              <motion.div
                key="open"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.42, ease: BRAND_EASE }}
                className="mt-6"
              >
                {/* Voice toggle + chip strips */}
                <div className="grid gap-5 mb-6">
                  <VoiceToggle value={voice} onChange={setVoice} />
                  <ChipStrip
                    eyebrow="ROLE LENS"
                    featured={FEATURED_ROLES}
                    all={ALL_ROLES}
                    value={roleLabel}
                    onChange={setRoleLabel}
                    browseLabel="Browse all 150"
                  />
                  <ChipStrip
                    eyebrow="INDUSTRY"
                    featured={FEATURED_INDUSTRIES}
                    all={ALL_INDUSTRIES}
                    value={industryLabel}
                    onChange={setIndustryLabel}
                    browseLabel="Browse all 30"
                  />
                </div>

                {/* Active lens pill */}
                <div className="flex items-center justify-end mb-3">
                  <span
                    className="font-sans inline-flex items-center gap-2"
                    style={{
                      border: "1px solid hsl(var(--raddo-brass-deep) / 0.55)",
                      color: "hsl(var(--raddo-ink-deep))",
                      borderRadius: "999px",
                      padding: "3px 12px",
                      fontSize: "10px",
                      letterSpacing: "0.14em",
                      backgroundColor: "hsl(var(--raddo-paper))",
                    }}
                  >
                    <span style={{ color: "hsl(var(--raddo-brass-deep))", fontWeight: 700 }}>
                      VOICE · {activeVoiceLabel}
                    </span>
                    <span style={{ color: "hsl(var(--raddo-paper-edge))" }}>·</span>
                    <span>
                      LENS · {roleLabel || "—"} · {industryLabel || "—"}
                    </span>
                  </span>
                </div>

                {/* Transcript */}
                <div
                  ref={scrollRef}
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                  className="flex flex-col gap-5 overflow-y-auto pr-1"
                  style={{ maxHeight: "360px", minHeight: "180px" }}
                >
                  {transcript.map((item) => {
                    if (isVoiceDivider(item)) {
                      return (
                        <div key={item.id} className="flex items-center gap-3 my-1" aria-hidden>
                          <span
                            className="block h-px flex-1"
                            style={{ backgroundColor: "hsl(var(--raddo-brass) / 0.55)" }}
                          />
                          <span
                            className="font-sans"
                            style={{
                              color: "hsl(var(--raddo-brass-deep))",
                              fontSize: "10px",
                              letterSpacing: "0.18em",
                              fontWeight: 600,
                            }}
                          >
                            VOICE · <VoiceLabel voice={item.voice} />
                          </span>
                          <span
                            className="block h-px flex-1"
                            style={{ backgroundColor: "hsl(var(--raddo-brass) / 0.55)" }}
                          />
                        </div>
                      );
                    }
                    const entry = item as ChatMessage;
                    // Skip empty streaming placeholders — the IS WRITING indicator covers them.
                    if (entry.role === "cob" && entry.streaming && !entry.text) return null;
                    return entry.role === "cob" ? (
                      <motion.div
                        key={entry.id}
                        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: BRAND_EASE }}
                        className="relative pl-4"
                      >
                        <span
                          aria-hidden
                          className="absolute left-0 top-1 bottom-1 w-[3px]"
                          style={{
                            backgroundColor:
                              entry.voice === "michael"
                                ? "hsl(var(--raddo-brass-deep))"
                                : "hsl(var(--raddo-brass))",
                          }}
                        />
                        <p
                          className={entry.voice === "michael" ? "font-sans" : "font-display"}
                          style={{
                            color: "hsl(var(--raddo-ink-deep))",
                            fontSize: entry.voice === "michael" ? "15px" : "17px",
                            lineHeight: 1.5,
                            fontWeight: entry.voice === "michael" ? 500 : 600,
                            letterSpacing: "-0.005em",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {entry.text}
                        </p>
                        <span
                          className="font-sans mt-1 block tabular-nums"
                          style={{ color: "hsl(var(--raddo-ash))", fontSize: "11px", letterSpacing: "0.06em" }}
                        >
                          <VoiceLabel voice={entry.voice} /> · {fmtClock(new Date(entry.at))}
                        </span>
                        {entry.trace && (
                          <span
                            className="font-sans mt-1 inline-block"
                            style={{
                              color: "hsl(var(--raddo-ash))",
                              fontSize: "11px",
                              letterSpacing: "0.12em",
                              borderTop: "1px solid hsl(var(--raddo-brass) / 0.5)",
                              paddingTop: "3px",
                              marginTop: "4px",
                            }}
                          >
                            RESEARCHED · {entry.trace}
                          </span>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key={entry.id}
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
                    );
                  })}

                  {pending && (() => {
                    // Show writing indicator only until the in-flight assistant message has any text.
                    const tail = [...transcript].reverse().find(
                      (t) => (t as ChatMessage).role === "cob",
                    ) as ChatMessage | undefined;
                    const inFlightHasText = !!tail?.streaming && !!tail?.text;
                    if (inFlightHasText) return null;
                    return (
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
                          <VoiceLabel voice={voice} /> IS WRITING
                          <TypingDots />
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Composer */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                  className="mt-6"
                >
                  <label htmlFor="dossier-composer" className="sr-only">
                    Ask your COB
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
                      disabled={pending}
                      rows={1}
                      placeholder={
                        voice === "michael"
                          ? "Ask Michael · Enter to send · Shift+Enter for a new line"
                          : "Ask your COB · Enter to send · Shift+Enter for a new line"
                      }
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
                      disabled={pending || !draft.trim()}
                      aria-label="Send your message"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded transition-transform duration-150 active:translate-y-[1px] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-raddo-brass"
                      style={{
                        backgroundColor: "hsl(var(--raddo-brass))",
                        color: "hsl(var(--raddo-ink-deep))",
                      }}
                    >
                      <span aria-hidden style={{ fontSize: "16px", fontWeight: 700 }}>
                        →
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="font-sans"
                      style={{ color: "hsl(var(--raddo-ash))", fontSize: "11px", letterSpacing: "0.04em" }}
                    >
                      Encrypted in transit · stored only with your consent · withdraw anytime.
                    </span>
                    {error && (
                      <span
                        className="font-sans"
                        style={{
                          color: "hsl(var(--raddo-brass-deep))",
                          fontSize: "11px",
                          letterSpacing: "0.04em",
                          borderBottom: "1px solid hsl(var(--raddo-brass-deep))",
                        }}
                      >
                        {error}
                      </span>
                    )}
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom-right fleuron */}
          <span
            aria-hidden
            className="absolute bottom-4 right-5 font-display"
            style={{ color: "hsl(var(--raddo-brass) / 0.4)", fontSize: "16px" }}
          >
            ❦
          </span>
        </div>
      </div>
    </section>
  );
}
