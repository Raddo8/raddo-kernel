import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SeoHead } from "@/components/SeoHead";
import {
  ASPIRATION_WORDS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CURRENT_STATE_WORDS,
  DISC_ROWS,
  TOOL_CATEGORIES,
  type AspirationWord,
  type Category,
  type CurrentWord,
  type DiscOption,
  type DiscRow,
  type Tool,
  type ToolCategory,
} from "@/lib/consult-data";
import { ToolLogo } from "@/components/consult/ToolLogo";

import type { DiscResponse } from "@/lib/consult-analysis";

import { ConfirmDebriefDialog } from "@/components/consult/ConfirmDebriefDialog";
import {
  GATE_HANDOFF_KEY,
  type GateHandoff,
} from "@/components/hero/DossierIntake";

type ToastState =
  | { kind: "idle"; message: string }
  | { kind: "error"; message: string };

function shuffleArray<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildShuffledDiscRows(rows: DiscRow[]) {
  return rows.map((row) => ({
    ...row,
    options: shuffleArray(row.options),
  }));
}

// Partition chips by category, then shuffle within each bucket. Emit buckets
// in CATEGORY_ORDER so render iterates in the binding top-to-bottom order.
function groupAndShuffle<T extends { category: Category }>(
  items: T[],
): Array<{ category: Category; label: string; items: T[] }> {
  const byCategory = new Map<Category, T[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: shuffleArray(byCategory.get(category) ?? []),
  })).filter((bucket) => bucket.items.length > 0);
}


function CornerMark({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 10,
    height: 10,
    borderColor: "hsl(var(--raddo-brass))",
    borderStyle: "solid",
    borderWidth: 0,
    pointerEvents: "none",
  };
  const offsets: React.CSSProperties =
    pos === "tl"
      ? { top: 6, left: 6, borderTopWidth: 1, borderLeftWidth: 1 }
      : pos === "tr"
      ? { top: 6, right: 6, borderTopWidth: 1, borderRightWidth: 1 }
      : pos === "bl"
      ? { bottom: 6, left: 6, borderBottomWidth: 1, borderLeftWidth: 1 }
      : { bottom: 6, right: 6, borderBottomWidth: 1, borderRightWidth: 1 };
  return <span aria-hidden style={{ ...base, ...offsets }} />;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`relative ${className}`}
      style={{
        backgroundColor: "hsl(var(--raddo-paper))",
        border: "1px solid hsl(var(--raddo-paper-edge))",
        borderRadius: 8,
        boxShadow: "0 2px 8px -4px hsl(var(--raddo-ink-deep) / 0.08)",
      }}
    >
      <CornerMark pos="tl" />
      <CornerMark pos="tr" />
      <CornerMark pos="bl" />
      <CornerMark pos="br" />
      {children}
    </section>
  );
}

function Overline({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-mono"
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "hsl(var(--raddo-ash))",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "hsl(var(--raddo-brass))",
        }}
      />
      {children}
    </p>
  );
}

function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-full px-3 py-2 text-left text-sm transition-colors duration-150"
      style={{
        border: "1px solid",
        borderColor: selected ? "hsl(var(--raddo-ink-deep))" : "hsl(var(--raddo-paper-edge))",
        backgroundColor: selected ? "hsl(var(--raddo-ink-deep))" : "white",
        color: selected ? "hsl(var(--raddo-paper))" : "hsl(var(--raddo-charcoal))",
      }}
    >
      {label}
    </button>
  );
}

// Tools v2 selection model · per-category.
type ToolCategorySelection = { slugs: string[]; custom: string[] };
type ToolsSelectedState = Record<string, ToolCategorySelection>;

const MAX_CUSTOM_PER_CATEGORY = 5;

function ToolChip({
  tool,
  selected,
  onToggle,
}: {
  tool: Tool;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-left text-sm transition-colors duration-150"
      style={{
        border: "1px solid",
        borderColor: selected ? "hsl(var(--raddo-ink-deep))" : "hsl(var(--raddo-paper-edge))",
        backgroundColor: selected ? "hsl(var(--raddo-ink-deep))" : "white",
        color: selected ? "hsl(var(--raddo-paper))" : "hsl(var(--raddo-charcoal))",
      }}
    >
      <ToolLogo name={tool.name} slug={tool.slug} domain={tool.domain} size={16} />
      <span>{tool.name}</span>
    </button>
  );
}

function CustomChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm"
      style={{
        border: "1px solid hsl(var(--raddo-paper-edge))",
        backgroundColor: "hsl(var(--raddo-paper))",
        color: "hsl(var(--raddo-charcoal))",
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="rounded-full leading-none"
        style={{
          width: 16,
          height: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "hsl(var(--raddo-ash))",
          fontSize: 14,
        }}
      >
        ×
      </button>
    </span>
  );
}

function ToolCategoryCard({
  category,
  selection,
  onToggleSlug,
  onAddCustom,
  onRemoveCustom,
}: {
  category: ToolCategory;
  selection: ToolCategorySelection;
  onToggleSlug: (slug: string) => void;
  onAddCustom: (value: string) => void;
  onRemoveCustom: (index: number) => void;
}) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");

  const existingNames = useMemo(() => {
    const set = new Set<string>();
    for (const t of category.tools) set.add(t.name.trim().toLowerCase());
    for (const c of selection.custom) set.add(c.trim().toLowerCase());
    return set;
  }, [category.tools, selection.custom]);

  const handleAdd = () => {
    const trimmed = otherDraft.trim();
    if (!trimmed) return;
    if (existingNames.has(trimmed.toLowerCase())) {
      setOtherDraft("");
      return;
    }
    if (selection.custom.length >= MAX_CUSTOM_PER_CATEGORY) return;
    onAddCustom(trimmed);
    setOtherDraft("");
  };

  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid hsl(var(--raddo-paper-edge))",
        borderRadius: 8,
        padding: 20,
      }}
    >
      <h3 className="font-display text-lg" style={{ color: "hsl(var(--raddo-ink-deep))" }}>
        {category.label}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {category.tools.map((tool) => (
          <ToolChip
            key={`${category.id}-${tool.slug}`}
            tool={tool}
            selected={selection.slugs.includes(tool.slug)}
            onToggle={() => onToggleSlug(tool.slug)}
          />
        ))}
        {selection.custom.map((label, index) => (
          <CustomChip
            key={`${category.id}-custom-${index}`}
            label={label}
            onRemove={() => onRemoveCustom(index)}
          />
        ))}
      </div>
      <div className="mt-3">
        {otherOpen ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={otherDraft}
              onChange={(e) => setOtherDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Tool name…"
              className="text-sm outline-none"
              style={{
                border: "1px solid hsl(var(--raddo-paper-edge))",
                backgroundColor: "white",
                color: "hsl(var(--raddo-charcoal))",
                borderRadius: 8,
                padding: "8px 10px",
                minWidth: 180,
              }}
              disabled={selection.custom.length >= MAX_CUSTOM_PER_CATEGORY}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!otherDraft.trim() || selection.custom.length >= MAX_CUSTOM_PER_CATEGORY}
              className="font-mono text-xs"
              style={{
                border: "1px solid hsl(var(--raddo-ink-deep))",
                backgroundColor: "hsl(var(--raddo-ink-deep))",
                color: "hsl(var(--raddo-paper))",
                borderRadius: 8,
                padding: "8px 12px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity:
                  !otherDraft.trim() || selection.custom.length >= MAX_CUSTOM_PER_CATEGORY ? 0.5 : 1,
              }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setOtherOpen(false);
                setOtherDraft("");
              }}
              className="text-xs"
              style={{ color: "hsl(var(--raddo-ash))" }}
            >
              cancel
            </button>
            {selection.custom.length >= MAX_CUSTOM_PER_CATEGORY ? (
              <span className="text-xs" style={{ color: "hsl(var(--raddo-ash))" }}>
                Max {MAX_CUSTOM_PER_CATEGORY} reached
              </span>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOtherOpen(true)}
            className="text-xs font-mono"
            style={{
              color: "hsl(var(--raddo-ink))",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
            disabled={selection.custom.length >= MAX_CUSTOM_PER_CATEGORY}
          >
            + Other
          </button>
        )}
      </div>
    </div>
  );
}

function OptionButton({
  option,
  selected,
  onClick,
}: {
  option: DiscOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left transition-colors duration-150"
      style={{
        border: "1px solid",
        borderColor: selected ? "hsl(var(--raddo-ink-deep))" : "hsl(var(--raddo-paper-edge))",
        backgroundColor: selected ? "hsl(var(--raddo-ink-deep))" : "white",
        color: selected ? "hsl(var(--raddo-paper))" : "hsl(var(--raddo-charcoal))",
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 14,
      }}
    >
      {option.label}
    </button>
  );
}

export function DebriefForm() {
  const navigate = useNavigate();
  const [currentBuckets] = useState(() => groupAndShuffle(CURRENT_STATE_WORDS as CurrentWord[]));
  const [aspirationBuckets] = useState(() => groupAndShuffle(ASPIRATION_WORDS as AspirationWord[]));

  const [discRows] = useState(() => buildShuffledDiscRows(DISC_ROWS));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [challenge, setChallenge] = useState("");
  const [currentStateSelections, setCurrentStateSelections] = useState<string[]>([]);
  const [aspirationSelections, setAspirationSelections] = useState<string[]>([]);
  const [toolsSelected, setToolsSelected] = useState<ToolsSelectedState>({});
  const [discResponses, setDiscResponses] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>({ kind: "idle", message: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Pre-fill Identity from the hero gate handoff.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(GATE_HANDOFF_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<GateHandoff>;
      if (parsed?.name && !name) setName(parsed.name);
      if (parsed?.email && !email) setEmail(parsed.email);
      if (parsed?.title && !occupation) setOccupation(parsed.title);
    } catch {
      /* ignore parse failures */
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelection(list: string[], id: string, setter: (next: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  function toggleOperatingSelection(rowId: string, optionId: string) {
    setDiscResponses((current) => {
      const selections = current[rowId] ?? [];
      if (selections.includes(optionId)) {
        return { ...current, [rowId]: selections.filter((s) => s !== optionId) };
      }
      return { ...current, [rowId]: [...selections, optionId] };
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setConfirmOpen(true);
  }

  const decisionRowsAnswered = useMemo(
    () => Object.values(discResponses).filter((s) => s.length > 0).length,
    [discResponses],
  );

  const toolsCount = useMemo(() => {
    let n = 0;
    for (const sel of Object.values(toolsSelected)) {
      n += sel.slugs.length + sel.custom.length;
    }
    return n;
  }, [toolsSelected]);

  async function handleConfirmedSubmit() {
    setSubmitting(true);
    setToast({ kind: "idle", message: "" });

    const normalizedDiscResponses: DiscResponse[] = discRows.map((row) => ({
      rowId: row.id,
      selections: discResponses[row.id] ?? [],
    }));

    // Derive legacy flat shapes + per-category groupings from toolsSelected.
    const appSelections: string[] = [];
    const appLabels: string[] = [];
    const customStrings: string[] = [];
    const toolsByCategory: Array<{ label: string; items: string[] }> = [];
    for (const category of TOOL_CATEGORIES) {
      const sel = toolsSelected[category.id];
      if (!sel) continue;
      const chipNames: string[] = [];
      for (const slug of sel.slugs) {
        const tool = category.tools.find((t) => t.slug === slug);
        if (!tool) continue;
        appSelections.push(`${category.id}-${slug}`);
        appLabels.push(tool.name);
        chipNames.push(tool.name);
      }
      const customs = sel.custom.map((c) => c.trim()).filter(Boolean);
      for (const c of customs) customStrings.push(`${category.label}: ${c}`);
      const items = [...chipNames, ...customs.map((c) => `Custom: ${c}`)];
      if (items.length) toolsByCategory.push({ label: category.label, items });
    }
    const otherAppsText = customStrings.join(" · ");

    const { data, error } = await supabase.functions.invoke("submit-consult", {
      body: {
        email,
        name,
        phone,
        occupation,
        challenge: challenge.trim() || undefined,
        currentStateWordIds: currentStateSelections,
        aspirationWordIds: aspirationSelections,
        appSelections,
        otherAppsText,
        toolsSelected,
        toolsByCategory,
        discResponses: normalizedDiscResponses,
        discAllowMultiSelect: true,
        mode: "request_info",
        source: "debrief",
      },
    });

    if (error || (data && (data as { error?: string }).error)) {
      setSubmitting(false);
      setConfirmOpen(false);
      setToast({
        kind: "error",
        message:
          (data as { error?: string } | null)?.error ??
          error?.message ??
          "Submission failed · review the form and try again.",
      });
      return;
    }

    if (typeof window !== "undefined") {
      window.plausible?.("debrief_submission");
    }

    setSubmitting(false);
    setConfirmOpen(false);
    navigate("/debrief/thank-you");
  }

  return (
    <main className="relative min-h-screen" style={{ backgroundColor: "hsl(var(--raddo-paper))" }}>
      <SeoHead
        path="/debrief"
        title="Request more information · COB"
        description="A short debrief so we can prepare a tailored follow-up · where you are today, where you want to be, the systems you run, and how you decide."
      />
      <ConfirmDebriefDialog
        open={confirmOpen}
        submitting={submitting}
        summary={{
          name,
          email,
          phone,
          occupation,
          challenge: challenge.trim(),
          currentStateCount: currentStateSelections.length,
          aspirationCount: aspirationSelections.length,
          toolsCount,
          decisionRowsAnswered,
        }}
        onConfirm={() => void handleConfirmedSubmit()}
        onCancel={() => {
          if (!submitting) setConfirmOpen(false);
        }}
      />


      {/* Hairline paper grain · same texture as Hero */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage:
            "radial-gradient(hsl(var(--raddo-charcoal)) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
      <div className="relative z-10">
      {/* Top band · cream paper */}
      <header className="mx-auto max-w-7xl px-6 pt-10 md:px-10 md:pt-14">
        <Panel className="px-6 py-10 md:px-10 md:py-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <Overline>DEBRIEF · 001 · INFORMATION REQUEST</Overline>
              <h1
                className="mt-4 font-display"
                style={{
                  color: "hsl(var(--raddo-ink-deep))",
                  fontSize: "clamp(2.25rem, 4.5vw, 3.75rem)",
                  lineHeight: 1.05,
                  fontWeight: 800,
                }}
              >
                5 minutes to request more information about your <strong style={{ fontWeight: 900 }}>C</strong>hief <strong style={{ fontWeight: 900 }}>O</strong>f <strong style={{ fontWeight: 900 }}>B</strong>usiness.
              </h1>
              <p
                className="mt-5 max-w-2xl"
                style={{ color: "hsl(var(--raddo-charcoal))", fontSize: 17, lineHeight: 1.6 }}
              >
                Tell us where you are today, where you want to be, the systems you already run, and how you like to work. We use it to prepare a tailored follow-up · no chat, no demo wall. Skip anything that doesn't apply.
              </p>
            </div>
            <Link
              to="/"
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "hsl(var(--raddo-ink))",
              }}
            >
              ← Back home
            </Link>
          </div>
        </Panel>
      </header>




      <form
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:px-10 lg:grid-cols-[300px_minmax(0,1fr)]"
      >
        {/* Sidebar */}
        <aside className="sticky top-2 z-20 h-fit lg:top-8">
          <Panel className="p-6">
            <Overline>5 MIN · 4 SECTIONS</Overline>
            <p
              className="mt-5"
              style={{ color: "hsl(var(--raddo-charcoal))", fontSize: 14, lineHeight: 1.6 }}
            >
              Answer what's useful, skip the rest. Submit when you're ready · we will follow up directly with information tailored to what you shared.
            </p>

            {toast.kind === "error" ? (
              <div
                className="mt-5"
                role="alert"
                style={{
                  border: "1px solid hsl(var(--raddo-brass))",
                  backgroundColor: "white",
                  color: "hsl(var(--raddo-charcoal))",
                  borderRadius: 8,
                  padding: "12px 14px",
                  fontSize: 13,
                }}
              >
                {toast.message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full font-mono transition-colors"
              style={{
                backgroundColor: "hsl(var(--raddo-brass))",
                color: "hsl(var(--raddo-ink-deep))",
                borderRadius: 8,
                padding: "14px 20px",
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
                opacity: submitting ? 0.6 : 1,
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px -6px hsl(var(--raddo-brass-deep) / 0.4)",
              }}
            >
              {submitting ? "Submitting…" : "Request information"}
            </button>
          </Panel>
        </aside>

        {/* Form body */}
        <div className="space-y-8">
          <Panel className="p-6 md:p-8">
            <Overline>IDENTITY</Overline>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium" style={{ color: "hsl(var(--raddo-charcoal))" }}>
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full text-sm outline-none transition-colors"
                  style={{
                    border: "1px solid hsl(var(--raddo-paper-edge))",
                    backgroundColor: "white",
                    color: "hsl(var(--raddo-charcoal))",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                  placeholder="you@company.com"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium" style={{ color: "hsl(var(--raddo-charcoal))" }}>
                  Name
                </span>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full text-sm outline-none transition-colors"
                  style={{
                    border: "1px solid hsl(var(--raddo-paper-edge))",
                    backgroundColor: "white",
                    color: "hsl(var(--raddo-charcoal))",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                  placeholder="How should we address you?"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium" style={{ color: "hsl(var(--raddo-charcoal))" }}>
                  Phone
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full text-sm outline-none transition-colors"
                  style={{
                    border: "1px solid hsl(var(--raddo-paper-edge))",
                    backgroundColor: "white",
                    color: "hsl(var(--raddo-charcoal))",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                  placeholder="+1 555 000 0000"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium" style={{ color: "hsl(var(--raddo-charcoal))" }}>
                  Occupation
                </span>
                <input
                  type="text"
                  value={occupation}
                  onChange={(event) => setOccupation(event.target.value)}
                  className="w-full text-sm outline-none transition-colors"
                  style={{
                    border: "1px solid hsl(var(--raddo-paper-edge))",
                    backgroundColor: "white",
                    color: "hsl(var(--raddo-charcoal))",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                  placeholder="CEO, CFO, COO, Founder…"
                />
              </label>
            </div>
            <label className="mt-6 block space-y-2">
              <span className="text-sm font-medium" style={{ color: "hsl(var(--raddo-charcoal))" }}>
                What's the one thing on your desk right now you'd hand off if you could? <span style={{ color: "hsl(var(--raddo-ash))" }}>(optional)</span>
              </span>
              <textarea
                value={challenge}
                onChange={(event) => setChallenge(event.target.value)}
                rows={3}
                maxLength={600}
                className="w-full text-sm outline-none transition-colors"
                style={{
                  border: "1px solid hsl(var(--raddo-paper-edge))",
                  backgroundColor: "white",
                  color: "hsl(var(--raddo-charcoal))",
                  borderRadius: 8,
                  padding: "12px 14px",
                  resize: "vertical",
                }}
                placeholder="One sentence is fine. Your COB uses this as the opening lead."
              />
            </label>
          </Panel>

          <Panel className="p-6 md:p-8">
            <Overline>PART 1 · WHERE YOU ARE TODAY</Overline>
            <h2
              className="mt-3 font-display"
              style={{ color: "hsl(var(--raddo-ink-deep))", fontSize: 28, lineHeight: 1.15, fontWeight: 700 }}
            >
              Pick the words that describe you professionally or your business right now.
            </h2>
            <p className="mt-3 max-w-3xl text-sm" style={{ color: "hsl(var(--raddo-ash))" }}>
              Select as many as you want. The good, the bad, and everything in between.
            </p>
            <div className="mt-6 space-y-6">
              {currentBuckets.map((bucket) => (
                <div key={bucket.category}>
                  <div
                    className="text-[11px] tracking-[0.18em] font-medium"
                    style={{ color: "hsl(var(--raddo-ash))" }}
                  >
                    {bucket.label}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {bucket.items.map((word) => (
                      <Chip
                        key={word.id}
                        label={word.label}
                        selected={currentStateSelections.includes(word.id)}
                        onToggle={() =>
                          toggleSelection(currentStateSelections, word.id, setCurrentStateSelections)
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </Panel>

          <Panel className="p-6 md:p-8">
            <Overline>PART 2 · WHERE YOU WANT TO BE</Overline>
            <h2
              className="mt-3 font-display"
              style={{ color: "hsl(var(--raddo-ink-deep))", fontSize: 28, lineHeight: 1.15, fontWeight: 700 }}
            >
              Pick the words for how you professionally or your business should feel in 12 months.
            </h2>
            <p className="mt-3 max-w-3xl text-sm" style={{ color: "hsl(var(--raddo-ash))" }}>
              Select as many as fit.
            </p>
            <div className="mt-6 space-y-6">
              {aspirationBuckets.map((bucket) => (
                <div key={bucket.category}>
                  <div
                    className="text-[11px] tracking-[0.18em] font-medium"
                    style={{ color: "hsl(var(--raddo-ash))" }}
                  >
                    {bucket.label}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {bucket.items.map((word) => (
                      <Chip
                        key={word.id}
                        label={word.label}
                        selected={aspirationSelections.includes(word.id)}
                        onToggle={() =>
                          toggleSelection(aspirationSelections, word.id, setAspirationSelections)
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </Panel>

          <Panel className="p-6 md:p-8">
            <Overline>PART 3 · THE SYSTEMS YOU ALREADY RUN</Overline>
            <h2
              className="mt-3 font-display"
              style={{ color: "hsl(var(--raddo-ink-deep))", fontSize: 28, lineHeight: 1.15, fontWeight: 700 }}
            >
              Which tools does your business actually use?
            </h2>
            <p className="mt-3 max-w-3xl text-sm" style={{ color: "hsl(var(--raddo-ash))" }}>
              Tap every tool you use. So we know what your COB needs to plug into.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {TOOL_CATEGORIES.map((category) => {
                const selection = toolsSelected[category.id] ?? { slugs: [], custom: [] };
                return (
                  <ToolCategoryCard
                    key={category.id}
                    category={category}
                    selection={selection}
                    onToggleSlug={(slug) =>
                      setToolsSelected((curr) => {
                        const prev = curr[category.id] ?? { slugs: [], custom: [] };
                        const nextSlugs = prev.slugs.includes(slug)
                          ? prev.slugs.filter((s) => s !== slug)
                          : [...prev.slugs, slug];
                        return { ...curr, [category.id]: { ...prev, slugs: nextSlugs } };
                      })
                    }
                    onAddCustom={(value) =>
                      setToolsSelected((curr) => {
                        const prev = curr[category.id] ?? { slugs: [], custom: [] };
                        if (prev.custom.length >= MAX_CUSTOM_PER_CATEGORY) return curr;
                        return {
                          ...curr,
                          [category.id]: { ...prev, custom: [...prev.custom, value] },
                        };
                      })
                    }
                    onRemoveCustom={(index) =>
                      setToolsSelected((curr) => {
                        const prev = curr[category.id] ?? { slugs: [], custom: [] };
                        return {
                          ...curr,
                          [category.id]: {
                            ...prev,
                            custom: prev.custom.filter((_, i) => i !== index),
                          },
                        };
                      })
                    }
                  />
                );
              })}
            </div>
          </Panel>

          <Panel className="p-6 md:p-8">
            <Overline>PART 4 · HOW YOU MAKE DECISIONS</Overline>
            <h2
              className="mt-3 font-display"
              style={{ color: "hsl(var(--raddo-ink-deep))", fontSize: 28, lineHeight: 1.15, fontWeight: 700 }}
            >
              Pick the options that sound like how you work.
            </h2>
            <p className="mt-3 max-w-3xl text-sm" style={{ color: "hsl(var(--raddo-ash))" }}>
              For each row, select every option that fits. This tells your COB how to brief you · what to push, what to flag, what to leave alone.
            </p>
            <div className="mt-6 space-y-5">
              {discRows.map((row, index) => {
                const selections = discResponses[row.id] ?? [];
                return (
                  <div
                    key={row.id}
                    style={{
                      backgroundColor: "white",
                      border: "1px solid hsl(var(--raddo-paper-edge))",
                      borderRadius: 8,
                      padding: 20,
                    }}
                  >
                    <p
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "hsl(var(--raddo-ash))",
                      }}
                    >
                      Row {String(index + 1).padStart(2, "0")}
                    </p>
                    <p
                      className="mt-2"
                      style={{ color: "hsl(var(--raddo-ink-deep))", fontSize: 16, fontWeight: 500 }}
                    >
                      {row.prompt}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {row.options.map((option) => (
                        <OptionButton
                          key={option.id}
                          option={option}
                          selected={selections.includes(option.id)}
                          onClick={() => toggleOperatingSelection(row.id, option.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </form>
      </div>
    </main>
  );
}
