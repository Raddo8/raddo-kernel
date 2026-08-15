/** THE BOARD · /hq/board · every row actionable where it sits.
 *
 * The menu on a row is not written here. `board_render` returns
 * `offered_actions` per row and this surface renders exactly that, then routes
 * each verb into the function that owns it. A board you can only read is a
 * list of things you have already failed to do.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SeoHead } from "@/components/SeoHead";
import {
  escalate,
  notMine,
  renderBoard,
  reschedule,
  respond,
  rewriteTitle,
  sayWhoActs,
  type ActOutcome,
  type BoardAction,
  type BoardItem,
  type BoardRender,
} from "@/lib/board-surface";

const ACTION_WORDS: Record<BoardAction, string> = {
  answer: "Answered",
  clear: "Clear it",
  snooze: "Snooze",
  rewrite: "Rewrite",
  escalate: "Escalate",
  reschedule: "Move the date",
  not_mine: "Not mine",
  say_who_acts: "Say who acts",
};

/** Actions that need something typed before they can be honoured. */
const NEEDS_INPUT: BoardAction[] = ["snooze", "rewrite", "escalate", "reschedule", "not_mine"];

const today = (): string => new Date().toISOString().slice(0, 10);

interface RowProps {
  item: BoardItem;
  onDone: (outcome: ActOutcome) => void;
}

const BoardRow = ({ item, onDone }: RowProps) => {
  const [open, setOpen] = useState<BoardAction | null>(null);
  const [text, setText] = useState("");
  const [date, setDate] = useState(item.due_date ?? item.hard_deadline ?? today());
  const [busy, setBusy] = useState(false);

  const start = (action: BoardAction) => {
    if (!NEEDS_INPUT.includes(action)) {
      void run(action);
      return;
    }
    setText(action === "rewrite" ? item.title : "");
    setOpen(open === action ? null : action);
  };

  const run = async (action: BoardAction) => {
    setBusy(true);
    let outcome: ActOutcome;
    switch (action) {
      case "answer":
        outcome = await respond(item.id, "answered");
        break;
      case "clear":
        outcome = await respond(item.id, "cleared");
        break;
      case "snooze":
        outcome = await respond(item.id, "snoozed", date);
        break;
      case "rewrite":
        outcome = await rewriteTitle(item.id, text);
        break;
      case "escalate":
        outcome = await escalate(item.id, text);
        break;
      case "reschedule":
        outcome = item.work_id
          ? await reschedule(item.work_id, date, text)
          : { ok: false, human: "This row has no work item behind it, so there is no date to move." };
        break;
      case "not_mine":
        outcome = item.work_id
          ? await notMine(item.work_id, text)
          : { ok: false, human: "This row has no work item behind it, so it cannot be disposed of." };
        break;
      case "say_who_acts":
        outcome = item.work_id
          ? await sayWhoActs(item.work_id, true)
          : { ok: false, human: "This row has no work item behind it." };
        break;
      default:
        outcome = { ok: false, human: "That is not something this board can do." };
    }
    setBusy(false);
    setOpen(null);
    onDone(outcome);
  };

  const dateLine =
    item.due_date || item.hard_deadline
      ? `${item.date_kind ?? "date"} \u00b7 ${item.due_date ?? item.hard_deadline}`
      : null;

  return (
    <article className="border-b border-border py-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-medium text-foreground">{item.title}</h3>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {item.state ?? "open"}
          {dateLine ? ` \u00b7 ${dateLine}` : ""}
          {item.surfaced_count ? ` \u00b7 shown ${item.surfaced_count}\u00d7` : ""}
          {item.urgent ? " \u00b7 urgent" : ""}
        </p>
      </header>

      {item.note ? <p className="mt-1 text-sm text-muted-foreground">{item.note}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {item.offered_actions.map((action) => (
          <Button
            key={action}
            type="button"
            size="sm"
            variant={action === "answer" ? "default" : "outline"}
            disabled={busy}
            aria-expanded={NEEDS_INPUT.includes(action) ? open === action : undefined}
            onClick={() => start(action)}
          >
            {ACTION_WORDS[action] ?? action}
          </Button>
        ))}
      </div>

      {open ? (
        <div className="mt-3 space-y-2 rounded border border-border p-3">
          {(open === "snooze" || open === "reschedule") && (
            <label className="block text-sm">
              <span className="text-muted-foreground">
                {open === "snooze" ? "Bring it back on" : "Move the date to"}
              </span>
              <Input
                type="date"
                value={date}
                min={open === "snooze" ? today() : undefined}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </label>
          )}
          {open !== "snooze" && (
            <label className="block text-sm">
              <span className="text-muted-foreground">
                {open === "rewrite"
                  ? "New wording"
                  : open === "reschedule"
                    ? "Why it moves"
                    : open === "not_mine"
                      ? "Why it is not yours"
                      : "What makes it urgent"}
              </span>
              <Textarea
                value={text}
                rows={2}
                onChange={(e) => setText(e.target.value)}
                className="mt-1"
              />
            </label>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || (open !== "snooze" && text.trim() === "")}
              onClick={() => void run(open)}
            >
              {ACTION_WORDS[open]}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(null)}>
              Leave it
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
};

export const HqBoard = () => {
  const [board, setBoard] = useState<BoardRender | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(async (bump: boolean) => {
    setLoading(true);
    const next = await renderBoard(bump);
    if (!next) {
      setFailure("The board did not load. Nothing has been changed by this visit.");
      setBoard(null);
    } else {
      setFailure(null);
      setBoard(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const onDone = useCallback(
    (outcome: ActOutcome) => {
      setSaid(outcome.human);
      void load(false);
    },
    [load],
  );

  const heading = useMemo(() => {
    if (!board) return "The board";
    return board.count === 1 ? "1 thing is on your board" : `${board.count} things are on your board`;
  }, [board]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <SeoHead
        title="Your board · act on every open item"
        path="/hq/board"
        description="Every open item in your name, each one actionable where it sits: answer, clear, snooze, rewrite, move the date, escalate, or hand it back."
      />
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Your HQ</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{heading}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Press a button and it happens now. Nothing here files a request.
      </p>

      {said ? (
        <p role="status" className="mt-4 rounded border border-border p-3 text-sm text-foreground">
          {said}
        </p>
      ) : null}

      {failure ? (
        <p role="alert" className="mt-4 rounded border border-destructive p-3 text-sm text-destructive">
          {failure}
        </p>
      ) : null}

      {loading && !board ? (
        <div className="mt-6 space-y-4" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {board ? (
        <section className="mt-6">
          {board.items.map((item) => (
            <BoardRow key={item.id} item={item} onDone={onDone} />
          ))}

          {board.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {board.empty_reason ?? "Nothing is open on this board."}
            </p>
          ) : null}

          {board.withheld.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-medium text-foreground">Held back, and why</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {board.withheld.map((w) => (
                  <li key={w.id}>
                    {w.title} {"\u00b7"} {w.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}
    </main>
  );
};

export default HqBoard;
