import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_CATEGORIES,
  ASPIRATION_WORDS,
  CURRENT_STATE_WORDS,
  DISC_ROWS,
  DISC_STYLE_LABELS,
  THEMES,
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

function WordChip({
  word,
  selected,
  onToggle,
}: {
  word: CurrentWord | AspirationWord;
  selected: boolean;
  onToggle: () => void;
}) {
  const currentWord = word as CurrentWord;
  const sentimentTone =
    "sentiment" in currentWord
      ? currentWord.sentiment === "negative"
        ? "border-raddo-brass-deep/20 text-raddo-brass-deep"
        : "border-raddo-ink-soft/20 text-raddo-ink"
      : "border-raddo-ink-soft/20 text-raddo-ink";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-3 py-2 text-left text-sm transition-colors ${
        selected
          ? "border-raddo-ink bg-raddo-ink text-white"
          : `bg-white ${sentimentTone} hover:border-raddo-ink/40 hover:bg-raddo-paper`
      }`}
    >
      {word.label}
    </button>
  );
}

function DiscOptionButton({
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
      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
        selected
          ? "border-raddo-ink bg-raddo-ink text-white"
          : "border-raddo-paper-edge bg-white text-raddo-charcoal hover:border-raddo-ink/40"
      }`}
    >
      <span className="block text-xs font-medium uppercase tracking-[0.12em] opacity-70">
        {DISC_STYLE_LABELS[option.style]}
      </span>
      <span className="mt-1 block text-sm font-medium">{option.label}</span>
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
    <div className="rounded-3xl border border-raddo-paper-edge bg-white p-5">
      <h3 className="font-display text-xl text-raddo-charcoal">{category.label}</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {category.options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onToggle(option.id)}
            className={`rounded-full border px-3 py-2 text-sm transition-colors ${
              selectedIds.has(option.id)
                ? "border-raddo-ink bg-raddo-ink text-white"
                : "border-raddo-paper-edge text-raddo-charcoal hover:border-raddo-ink/35"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConsultForm() {
  const navigate = useNavigate();
  const [currentWords] = useState(() => shuffleArray(CURRENT_STATE_WORDS));
  const [aspirationWords] = useState(() => shuffleArray(ASPIRATION_WORDS));
  const [discRows] = useState(() => buildShuffledDiscRows(DISC_ROWS));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentStateSelections, setCurrentStateSelections] = useState<string[]>([]);
  const [aspirationSelections, setAspirationSelections] = useState<string[]>([]);
  const [appSelections, setAppSelections] = useState<string[]>([]);
  const [otherAppsText, setOtherAppsText] = useState("");
  const [discAllowMultiSelect, setDiscAllowMultiSelect] = useState(false);
  const [discResponses, setDiscResponses] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>({ kind: "idle", message: "" });

  const currentThemeCounts = THEMES.map((theme) => ({
    ...theme,
    count: currentStateSelections.filter((selection) => selection.startsWith(`${theme.id}-`)).length,
  }));
  const aspirationThemeCounts = THEMES.map((theme) => ({
    ...theme,
    count: aspirationSelections.filter((selection) => selection.startsWith(`${theme.id}-`)).length,
  }));

  function toggleSelection(list: string[], id: string, setter: (next: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  function toggleDiscSelection(rowId: string, optionId: string) {
    setDiscResponses((current) => {
      const selections = current[rowId] ?? [];

      if (selections.includes(optionId)) {
        return { ...current, [rowId]: selections.filter((selection) => selection !== optionId) };
      }

      if (discAllowMultiSelect) {
        return {
          ...current,
          [rowId]: selections.length >= 2 ? [selections[1], optionId] : [...selections, optionId],
        };
      }

      return { ...current, [rowId]: [optionId] };
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
        currentStateWordIds: currentStateSelections,
        aspirationWordIds: aspirationSelections,
        appSelections,
        otherAppsText,
        discResponses: normalizedDiscResponses,
        discAllowMultiSelect,
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
    <main className="min-h-screen bg-raddo-paper">
      <section className="border-b border-raddo-paper-edge bg-raddo-night text-raddo-paper">
        <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-paper/60">
                RADDO consult
              </p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight md:text-6xl">
                Show the business as it feels now, and as it needs to feel next.
              </h1>
            </div>
            <Link
              to="/"
              className="rounded-full border border-raddo-paper/20 px-4 py-2 text-sm text-raddo-paper/80 transition-colors hover:bg-raddo-paper/10"
            >
              Back home
            </Link>
          </div>
          <p className="mt-6 max-w-3xl text-base leading-7 text-raddo-paper/78 md:text-lg">
            This consult stays editorial rather than clinical. Select the language that feels true, inventory the systems already in motion, then answer the DISC prompts the way you naturally operate.
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="mx-auto grid max-w-7xl gap-8 px-6 py-8 md:px-10 md:py-10 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[28px] border border-raddo-paper-edge bg-white p-6 lg:sticky lg:top-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-ash">Five-minute brief</p>
          <div className="mt-5 space-y-5 text-sm text-raddo-charcoal">
            <div>
              <p className="font-medium">1. Current-state words</p>
              <p className="mt-1 text-raddo-ash">{currentStateSelections.length} selected</p>
            </div>
            <div>
              <p className="font-medium">2. Aspiration words</p>
              <p className="mt-1 text-raddo-ash">{aspirationSelections.length} selected</p>
            </div>
            <div>
              <p className="font-medium">3. App footprint</p>
              <p className="mt-1 text-raddo-ash">{appSelections.length} tools tagged</p>
            </div>
            <div>
              <p className="font-medium">4. DISC rows</p>
              <p className="mt-1 text-raddo-ash">
                {Object.values(discResponses).filter((selection) => selection.length > 0).length}/{discRows.length} answered
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl bg-raddo-paper p-4">
            <p className="font-medium text-raddo-charcoal">Theme spread</p>
            <div className="mt-3 space-y-2 text-xs">
              {THEMES.map((theme) => {
                const currentCount = currentThemeCounts.find((item) => item.id === theme.id)?.count ?? 0;
                const aspirationCount = aspirationThemeCounts.find((item) => item.id === theme.id)?.count ?? 0;

                return (
                  <div key={theme.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                    <span className="text-raddo-ash">{theme.label}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-raddo-charcoal">now {currentCount}</span>
                    <span className="rounded-full bg-raddo-ink px-2 py-1 text-white">next {aspirationCount}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {toast.kind === "error" ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {toast.message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-full bg-raddo-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-raddo-ink-deep disabled:cursor-not-allowed disabled:bg-raddo-ash"
          >
            {submitting ? "Submitting consult..." : "Submit consult"}
          </button>
        </aside>

        <div className="space-y-8">
          <section className="rounded-[32px] border border-raddo-paper-edge bg-white p-6 md:p-8">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-ash">Identity</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-raddo-charcoal">Email</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-raddo-paper-edge bg-raddo-paper px-4 py-3 text-sm text-raddo-charcoal outline-none transition-colors focus:border-raddo-ink"
                  placeholder="you@company.com"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-raddo-charcoal">Name (optional)</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-2xl border border-raddo-paper-edge bg-raddo-paper px-4 py-3 text-sm text-raddo-charcoal outline-none transition-colors focus:border-raddo-ink"
                  placeholder="How should we address you?"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[32px] border border-raddo-paper-edge bg-white p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-ash">Part 1 · Current state</p>
                <h2 className="mt-2 font-display text-2xl text-raddo-charcoal md:text-3xl">
                  Choose any words that describe the business right now.
                </h2>
              </div>
              <p className="text-sm text-raddo-ash">{currentStateSelections.length} selected</p>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-raddo-ash">
              100 words across 10 themes · five positive, five negative. Pick the language that feels true.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {currentWords.map((word) => (
                <WordChip
                  key={word.id}
                  word={word}
                  selected={currentStateSelections.includes(word.id)}
                  onToggle={() =>
                    toggleSelection(currentStateSelections, word.id, setCurrentStateSelections)
                  }
                />
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-raddo-paper-edge bg-white p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-ash">Part 2 · Aspiration</p>
                <h2 className="mt-2 font-display text-2xl text-raddo-charcoal md:text-3xl">
                  Choose any words for how the business needs to feel next.
                </h2>
              </div>
              <p className="text-sm text-raddo-ash">{aspirationSelections.length} selected</p>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-raddo-ash">
              100 aspiration words, same 10 themes. No limit · select as many as fit.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {aspirationWords.map((word) => (
                <WordChip
                  key={word.id}
                  word={word}
                  selected={aspirationSelections.includes(word.id)}
                  onToggle={() =>
                    toggleSelection(aspirationSelections, word.id, setAspirationSelections)
                  }
                />
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-raddo-paper-edge bg-white p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-ash">Part 3 · App footprint</p>
                <h2 className="mt-2 font-display text-2xl text-raddo-charcoal md:text-3xl">
                  Tag the systems already in motion.
                </h2>
              </div>
              <p className="text-sm text-raddo-ash">{appSelections.length} tagged</p>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-raddo-ash">
              Ten categories. Select what the business actually runs on today.
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
              <span className="text-sm font-medium text-raddo-charcoal">Other tools (optional)</span>
              <textarea
                value={otherAppsText}
                onChange={(event) => setOtherAppsText(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-raddo-paper-edge bg-raddo-paper px-4 py-3 text-sm text-raddo-charcoal outline-none transition-colors focus:border-raddo-ink"
                placeholder="Anything else the business depends on."
              />
            </label>
          </section>

          <section className="rounded-[32px] border border-raddo-paper-edge bg-white p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-ash">Part 4 · DISC</p>
                <h2 className="mt-2 font-display text-2xl text-raddo-charcoal md:text-3xl">
                  Answer how you naturally operate.
                </h2>
              </div>
              <label className="flex items-center gap-2 text-sm text-raddo-ash">
                <input
                  type="checkbox"
                  checked={discAllowMultiSelect}
                  onChange={(event) => setDiscAllowMultiSelect(event.target.checked)}
                  className="h-4 w-4 rounded border-raddo-paper-edge"
                />
                Allow two selections per row
              </label>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-raddo-ash">
              15 forced-choice rows · options shuffled. Pick the option that fits best (or two, if you toggled multi-select).
            </p>
            <div className="mt-6 space-y-5">
              {discRows.map((row, index) => {
                const selections = discResponses[row.id] ?? [];
                return (
                  <div key={row.id} className="rounded-3xl border border-raddo-paper-edge bg-raddo-paper p-5">
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-ash">
                      Row {String(index + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-2 text-base font-medium text-raddo-charcoal">{row.prompt}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {row.options.map((option) => (
                        <DiscOptionButton
                          key={option.id}
                          option={option}
                          selected={selections.includes(option.id)}
                          onClick={() => toggleDiscSelection(row.id, option.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </form>
    </main>
  );
}
