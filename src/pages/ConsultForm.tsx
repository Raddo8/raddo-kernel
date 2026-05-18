import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_CATEGORIES,
  ASPIRATION_WORDS,
  CURRENT_STATE_WORDS,
  DISC_ROWS,
  type AppCategory,
  type AspirationWord,
  type CurrentWord,
  type DiscOption,
  type DiscRow,
} from "@/lib/consult-data";
import type { DiscResponse } from "@/lib/consult-analysis";

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

function CategoryCard({
  category,
  selectedIds,
  onToggle,
}: {
  category: AppCategory;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
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
        {category.options.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            selected={selectedIds.has(option.id)}
            onToggle={() => onToggle(option.id)}
          />
        ))}
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

export function ConsultForm() {
  const navigate = useNavigate();
  const [currentWords] = useState(() => shuffleArray(CURRENT_STATE_WORDS as CurrentWord[]));
  const [aspirationWords] = useState(() => shuffleArray(ASPIRATION_WORDS as AspirationWord[]));
  const [discRows] = useState(() => buildShuffledDiscRows(DISC_ROWS));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [currentStateSelections, setCurrentStateSelections] = useState<string[]>([]);
  const [aspirationSelections, setAspirationSelections] = useState<string[]>([]);
  const [appSelections, setAppSelections] = useState<string[]>([]);
  const [otherAppsText, setOtherAppsText] = useState("");
  const [discResponses, setDiscResponses] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>({ kind: "idle", message: "" });

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setToast({ kind: "idle", message: "" });

    const normalizedDiscResponses: DiscResponse[] = discRows.map((row) => ({
      rowId: row.id,
      selections: discResponses[row.id] ?? [],
    }));

    const { data, error } = await supabase.functions.invoke("submit-consult", {
      body: {
        email,
        name,
        phone,
        occupation,
        currentStateWordIds: currentStateSelections,
        aspirationWordIds: aspirationSelections,
        appSelections,
        otherAppsText,
        discResponses: normalizedDiscResponses,
        discAllowMultiSelect: true,
      },
    });

    if (error || (data && (data as { error?: string }).error)) {
      setSubmitting(false);
      setToast({
        kind: "error",
        message:
          (data as { error?: string } | null)?.error ??
          error?.message ??
          "Submission failed · review the form and try again.",
      });
      return;
    }

    navigate("/consult/thank-you");
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: "hsl(var(--raddo-paper))" }}>
      {/* Top band · cream paper */}
      <header className="mx-auto max-w-7xl px-6 pt-10 md:px-10 md:pt-14">
        <Panel className="px-6 py-10 md:px-10 md:py-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <Overline>CONSULT · 001 · CLASSIFIED · FOR PRINCIPAL</Overline>
              <h1
                className="mt-4 font-display"
                style={{
                  color: "hsl(var(--raddo-ink-deep))",
                  fontSize: "clamp(2.25rem, 4.5vw, 3.75rem)",
                  lineHeight: 1.05,
                  fontWeight: 800,
                }}
              >
                5 minutes to set up your Chief of Business.
              </h1>
              <p
                className="mt-5 max-w-2xl"
                style={{ color: "hsl(var(--raddo-charcoal))", fontSize: 17, lineHeight: 1.6 }}
              >
                Four short sections · where you are today, where you want to be, the systems you already run, and how you make decisions. Skip anything that doesn't apply. Your COB is built from your answers.
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
        <aside className="h-fit lg:sticky lg:top-8">
          <Panel className="p-6">
            <Overline>5 MIN · 4 SECTIONS</Overline>
            <p
              className="mt-5"
              style={{ color: "hsl(var(--raddo-charcoal))", fontSize: 14, lineHeight: 1.6 }}
            >
              Answer what's useful, skip the rest. Submit when you're done · we'll review and reply within 2 business days.
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
              {submitting ? "Submitting…" : "Submit consult"}
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
          </Panel>

          <Panel className="p-6 md:p-8">
            <Overline>PART 1 · WHERE YOU ARE TODAY</Overline>
            <h2
              className="mt-3 font-display"
              style={{ color: "hsl(var(--raddo-ink-deep))", fontSize: 28, lineHeight: 1.15, fontWeight: 700 }}
            >
              Pick the words that describe your business right now.
            </h2>
            <p className="mt-3 max-w-3xl text-sm" style={{ color: "hsl(var(--raddo-ash))" }}>
              Select as many as you want. The good, the bad, and everything in between.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {currentWords.map((word) => (
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
          </Panel>

          <Panel className="p-6 md:p-8">
            <Overline>PART 2 · WHERE YOU WANT TO BE</Overline>
            <h2
              className="mt-3 font-display"
              style={{ color: "hsl(var(--raddo-ink-deep))", fontSize: 28, lineHeight: 1.15, fontWeight: 700 }}
            >
              Pick the words for how your business should feel in 12 months.
            </h2>
            <p className="mt-3 max-w-3xl text-sm" style={{ color: "hsl(var(--raddo-ash))" }}>
              Select as many as fit.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {aspirationWords.map((word) => (
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
              {APP_CATEGORIES.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  selectedIds={new Set(appSelections)}
                  onToggle={(id) => toggleSelection(appSelections, id, setAppSelections)}
                />
              ))}
            </div>
            <label className="mt-6 block space-y-2">
              <span className="text-sm font-medium" style={{ color: "hsl(var(--raddo-charcoal))" }}>
                Other tools (optional)
              </span>
              <textarea
                value={otherAppsText}
                onChange={(event) => setOtherAppsText(event.target.value)}
                rows={3}
                className="w-full text-sm outline-none transition-colors"
                style={{
                  border: "1px solid hsl(var(--raddo-paper-edge))",
                  backgroundColor: "white",
                  color: "hsl(var(--raddo-charcoal))",
                  borderRadius: 8,
                  padding: "12px 14px",
                }}
                placeholder="List any other tools your business depends on."
              />
            </label>
          </Panel>

          <Panel className="p-6 md:p-8">
            <Overline>PART IV · OPERATING STYLE</Overline>
            <h2
              className="mt-3 font-display"
              style={{ color: "hsl(var(--raddo-ink-deep))", fontSize: 28, lineHeight: 1.15, fontWeight: 700 }}
            >
              Mark every option that fits how you naturally work.
            </h2>
            <p className="mt-3 max-w-3xl text-sm" style={{ color: "hsl(var(--raddo-ash))" }}>
              Select as many as feel true on each row. There is no wrong count.
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
    </main>
  );
}
