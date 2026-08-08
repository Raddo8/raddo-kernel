/** Fleet Live · the operator plane's live tab on /hq/records.
 *
 * Left is the fleet, one card per tenant from admin_fleet_live. Right is the
 * activity feed from admin_activity_read, kept current by seven postgres_changes
 * subscriptions rather than by re-reading the feed on every insert. If the
 * socket drops the page says so and falls back to a ten second poll.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InspectorDrawer, InspectorField } from "@/components/hq/InspectorDrawer";
import { supabase } from "@/integrations/supabase/client";
import "@/hq-next/styles/hq-live.css";

interface TenantCard {
  cid: string;
  cob_name: string | null;
  client: string | null;
  tier: string | null;
  last_seen_at: string | null;
  last_seen_stream: string | null;
  last_seen_subject: string | null;
  live_now: boolean | null;
  events_window: number | null;
  tool_calls_window: number | null;
  hq_writes_window: number | null;
  councils_window: number | null;
  open_signals: number | null;
  kernel_parts: number | null;
  last_kernel_load: string | null;
  calls_since_boot: number | null;
  health: string | null;
  health_human: string | null;
}

interface FeedEvent {
  at: string;
  cid: string | null;
  cob_name: string | null;
  client: string | null;
  stream: string;
  stream_human: string;
  subject: string | null;
  verb: string | null;
  detail_a: string | null;
  detail_b: string | null;
  payload: Record<string, unknown> | null;
  ref: string | null;
}

interface FleetPayload {
  ok: boolean;
  reason_human?: string;
  since?: string;
  as_of?: string;
  tenants?: TenantCard[];
}

interface ActivityPayload {
  ok: boolean;
  reason_human?: string;
  summary?: {
    streams: Record<string, number>;
    window_from: string | null;
    window_to: string | null;
    returned: number;
    truncated: boolean;
  };
  events?: FeedEvent[];
}

const STREAMS: { key: string; label: string }[] = [
  { key: "tool", label: "Tool call" },
  { key: "kernel", label: "Identity read" },
  { key: "write", label: "Wrote to HQ" },
  { key: "connector", label: "Connection" },
  { key: "council", label: "Council" },
  { key: "ritual", label: "Session ritual" },
  { key: "signal", label: "Signal" },
];

const WINDOWS: { key: string; label: string; mins: number }[] = [
  { key: "15m", label: "Last 15 minutes", mins: 15 },
  { key: "1h", label: "Last hour", mins: 60 },
  { key: "24h", label: "Last 24 hours", mins: 60 * 24 },
  { key: "7d", label: "Last 7 days", mins: 60 * 24 * 7 },
];

const PAGE = 200;

/** Realtime tables, and how each insert maps onto a feed row. */
const TABLES: {
  table: string;
  stream: string;
  map: (r: Record<string, unknown>) => Partial<FeedEvent> | null;
}[] = [
  {
    table: "mcp_usage_events",
    stream: "tool",
    map: (r) => ({
      at: String(r.created_at ?? ""),
      cid: (r.cid as string) ?? null,
      subject: (r.tool as string) ?? null,
      verb: "started",
      detail_a: (r.resolution_mode as string) ?? null,
      detail_b: r.total_cost_usd ? String(r.total_cost_usd) : null,
      payload: { agent_id: r.agent_id ?? null, cost_usd: r.total_cost_usd ?? null },
      ref: r.id ? String(r.id) : null,
    }),
  },
  {
    table: "kernel_access_log",
    stream: "kernel",
    map: (r) => ({
      at: String(r.at ?? ""),
      cid: (r.cid as string) ?? null,
      subject: r.part ? `${r.part}#${r.seq ?? ""}` : ((r.access_kind as string) ?? null),
      verb: r.access_kind ? String(r.access_kind).toLowerCase() : null,
      detail_a: (r.surface as string) ?? null,
      detail_b: r.bytes_served != null ? String(r.bytes_served) : null,
      payload: { purpose: r.purpose ?? null, session_id: r.session_id ?? null },
      ref: r.id ? String(r.id) : null,
    }),
  },
  {
    table: "change_ledger",
    stream: "write",
    map: (r) => ({
      at: String(r.at ?? ""),
      cid: (r.cid as string) ?? null,
      subject: (r.table_name as string) ?? null,
      verb: r.op ? String(r.op).toLowerCase() : null,
      detail_a: (r.actor as string) ?? null,
      detail_b: Array.isArray(r.changed_fields) ? (r.changed_fields as string[]).join(", ") : null,
      payload: {
        row_pk: r.row_pk ?? null,
        pk_col: r.pk_col ?? null,
        actor_role: r.actor_role ?? null,
        reason: r.reason ?? null,
        revertable: r.reverted_by == null,
      },
      ref: r.ledger_id ? String(r.ledger_id) : null,
    }),
  },
  {
    table: "connector_events",
    stream: "connector",
    map: (r) => ({
      at: String(r.created_at ?? ""),
      cid: (r.cid as string) ?? null,
      subject: (r.event as string) ?? null,
      verb: "observed",
      detail_a: (r.surface as string) ?? null,
      detail_b: null,
      payload: (r.detail as Record<string, unknown>) ?? null,
      ref: r.id ? String(r.id) : null,
    }),
  },
  {
    table: "council_minutes",
    stream: "council",
    map: (r) => ({
      at: String(r.started_at ?? ""),
      cid: (r.cid as string) ?? null,
      subject: (r.tool as string) ?? null,
      verb: (r.status as string) ?? null,
      detail_a: ((r.mode as string) ?? (r.advisor as string)) ?? null,
      detail_b: r.question ? String(r.question).slice(0, 160) : null,
      payload: { run_id: r.run_id ?? null, chairs: r.chairs ?? null, eps: r.eps ?? null, rho: r.rho ?? null },
      ref: r.id ? String(r.id) : null,
    }),
  },
  {
    table: "ritual_runs",
    stream: "ritual",
    map: (r) => ({
      at: String(r.created_at ?? ""),
      cid: null,
      subject: (r.ritual as string) ?? null,
      verb: (r.outcome as string) ?? null,
      detail_a: r.session_id ? String(r.session_id) : null,
      detail_b: r.duration_ms != null ? String(r.duration_ms) : null,
      payload: (r.layers as Record<string, unknown>) ?? null,
      ref: r.id ? String(r.id) : null,
    }),
  },
  {
    table: "improvement_signals",
    stream: "signal",
    map: (r) => ({
      at: String(r.last_seen ?? ""),
      cid: (r.cid as string) ?? null,
      subject: (r.pattern as string) ?? null,
      verb: (r.status as string) ?? null,
      detail_a: (r.audience as string) ?? null,
      detail_b: r.recurrence != null ? String(r.recurrence) : null,
      payload: { authoritative: r.authoritative ?? null, verification_state: r.verification_state ?? null },
      ref: r.id ? String(r.id) : null,
    }),
  },
];

function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u00b7";
  return `${d.toLocaleTimeString(undefined, { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function ago(iso: string | null): string {
  if (!iso) return "never seen";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function healthClass(h: string | null): string {
  if (h === "healthy" || h === "ok" || h === "live") return "h-ok";
  if (h === "quiet" || h === "warn" || h === "degraded") return "h-warn";
  if (h === "cold" || h === "err" || h === "stalled" || h === "failing") return "h-err";
  return "";
}

function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sk" style={{ height: 22 }} />
      ))}
    </div>
  );
}

export function FleetLive() {
  const [fleet, setFleet] = useState<FleetPayload | null>(null);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [cid, setCid] = useState<string | null>(null);
  const [streams, setStreams] = useState<string[]>([]);
  const [win, setWin] = useState("1h");
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [conn, setConn] = useState<"live" | "reconnecting" | "polling">("reconnecting");

  const filtersRef = useRef({ cid, streams });
  filtersRef.current = { cid, streams };

  const since = useMemo(() => {
    const mins = WINDOWS.find((w) => w.key === win)?.mins ?? 60;
    return new Date(Date.now() - mins * 60_000).toISOString();
  }, [win]);

  const readActivity = useCallback(
    async (before?: string) => {
      const { data, error } = await supabase.rpc("admin_activity_read", {
        p_cid: cid,
        p_streams: streams.length ? streams : null,
        p_since: since,
        p_limit: PAGE,
        p_before: before ?? null,
      });
      if (error) return null;
      return data as unknown as ActivityPayload;
    },
    [cid, streams, since],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const [f, a] = await Promise.all([
      supabase.rpc("admin_fleet_live", { p_since: since }),
      readActivity(),
    ]);
    setFleet(f.error ? { ok: false, reason_human: "The fleet could not be read just now." } : (f.data as unknown as FleetPayload));
    setActivity(a ?? { ok: false, reason_human: "The activity feed could not be read just now." });
    setEvents(a?.events ?? []);
    setExhausted(false);
    setLoading(false);
  }, [since, readActivity]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Seven inserts, one channel. A matching row is prepended; the feed is never
  // re-read wholesale on an event.
  useEffect(() => {
    let dropped = false;
    const channel = supabase.channel("fleet-live");
    TABLES.forEach((t) => {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: t.table },
        (msg) => {
          const row = msg.new as Record<string, unknown>;
          const base = t.map(row);
          if (!base || !base.at) return;
          const f = filtersRef.current;
          if (f.cid && base.cid !== f.cid) return;
          if (f.streams.length && !f.streams.includes(t.stream)) return;
          const human = STREAMS.find((s) => s.key === t.stream)?.label ?? t.stream;
          const ev: FeedEvent = {
            at: base.at,
            cid: base.cid ?? null,
            cob_name: null,
            client: base.cid ?? null,
            stream: t.stream,
            stream_human: human,
            subject: base.subject ?? null,
            verb: base.verb ?? null,
            detail_a: base.detail_a ?? null,
            detail_b: base.detail_b ?? null,
            payload: base.payload ?? null,
            ref: base.ref ?? null,
          };
          const key = `${t.stream}:${ev.ref ?? ev.at}`;
          setEvents((prev) => (prev.some((p) => `${p.stream}:${p.ref ?? p.at}` === key) ? prev : [ev, ...prev]));
          setActivity((prev) =>
            prev?.summary
              ? {
                  ...prev,
                  summary: {
                    ...prev.summary,
                    returned: prev.summary.returned + 1,
                    streams: { ...prev.summary.streams, [t.stream]: (prev.summary.streams[t.stream] ?? 0) + 1 },
                  },
                }
              : prev,
          );
          setFresh((prev) => new Set(prev).add(key));
          window.setTimeout(() => {
            setFresh((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          }, 1600);
        },
      );
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        dropped = false;
        setConn("live");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        dropped = true;
        setConn((c) => (c === "live" ? "reconnecting" : "polling"));
      }
    });

    // Honest fallback: when the socket is not carrying us, we poll.
    const poll = window.setInterval(() => {
      if (!dropped) return;
      setConn("polling");
      void readActivity().then((a) => {
        if (a?.events) {
          setEvents(a.events);
          setActivity(a);
        }
      });
    }, 10_000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [readActivity]);

  const loadOlder = useCallback(async () => {
    if (loadingMore || exhausted || events.length === 0) return;
    setLoadingMore(true);
    const oldest = events[events.length - 1].at;
    const a = await readActivity(oldest);
    if (a?.events?.length) {
      setEvents((prev) => [...prev, ...a.events!]);
      if (a.events.length < PAGE) setExhausted(true);
    } else {
      setExhausted(true);
    }
    setLoadingMore(false);
  }, [loadingMore, exhausted, events, readActivity]);

  const openEvent = openRef ? events.find((e) => `${e.stream}:${e.ref ?? e.at}` === openRef) ?? null : null;
  const streamCounts = activity?.summary?.streams ?? {};

  if (fleet && fleet.ok === false) {
    return (
      <div className="empty">
        <h3>Not available on this sign in</h3>
        <p>{fleet.reason_human ?? "This view is the operator plane."}</p>
      </div>
    );
  }

  const tenants = [...(fleet?.tenants ?? [])].sort((a, b) =>
    (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""),
  );

  return (
    <div>
      <div className="toolbar">
        <label className="conn" htmlFor="live-window">
          Window
        </label>
        <select id="live-window" value={win} onChange={(e) => setWin(e.target.value)}>
          {WINDOWS.map((w) => (
            <option key={w.key} value={w.key}>
              {w.label}
            </option>
          ))}
        </select>
        <span className={`conn ${conn}`} aria-live="polite">
          <i />
          {conn === "live" ? "live" : conn === "reconnecting" ? "reconnecting" : "polling every 10 seconds"}
        </span>
      </div>

      <div className="toolbar" role="group" aria-label="Stream filters">
        {STREAMS.map((s) => (
          <button
            key={s.key}
            type="button"
            className="chip"
            aria-pressed={streams.includes(s.key)}
            onClick={() =>
              setStreams((prev) => (prev.includes(s.key) ? prev.filter((x) => x !== s.key) : [...prev, s.key]))
            }
          >
            {s.label} <span className="m">{streamCounts[s.key] ?? 0}</span>
            {streams.includes(s.key) ? <span aria-hidden="true">{"\u00d7"}</span> : null}
          </button>
        ))}
        <button type="button" className="btn" onClick={() => setStreams([])} disabled={streams.length === 0}>
          Clear all
        </button>
      </div>

      <div className="fleet-split">
        <div className="fleet-rail" aria-label="Fleet">
          <button
            type="button"
            className="tcard"
            aria-pressed={cid === null}
            onClick={() => setCid(null)}
          >
            <div className="tn">All tenants</div>
            <div className="tm">{tenants.length} on the fleet</div>
          </button>
          {loading && tenants.length === 0 ? <Skeleton rows={5} /> : null}
          {tenants.map((t) => (
            <button
              key={t.cid}
              type="button"
              className={`tcard ${healthClass(t.health)}`}
              aria-pressed={cid === t.cid}
              title={t.health_human ?? undefined}
              onClick={() => setCid(t.cid)}
            >
              <div className="tn">
                {t.live_now ? <span className="dot-live" aria-hidden="true" /> : null}
                {t.client ?? t.cid}
              </div>
              <div className="tm">
                {t.cob_name ?? t.cid} &middot; {ago(t.last_seen_at)}
              </div>
              <div className="tm">{t.last_seen_subject ?? "nothing in this window"}</div>
              <div className="cts">
                <span className="tm">events {t.events_window ?? 0}</span>
                <span className="tm">tools {t.tool_calls_window ?? 0}</span>
                <span className="tm">writes {t.hq_writes_window ?? 0}</span>
                <span className="tm">councils {t.councils_window ?? 0}</span>
              </div>
            </button>
          ))}
          {!loading && tenants.length === 0 ? (
            <div className="empty">
              <h3>No tenant activity</h3>
              <p>No tenant has been seen inside this window. Widen the window to look further back.</p>
            </div>
          ) : null}
        </div>

        <div className="feed">
          {loading ? (
            <div style={{ padding: 16 }}>
              <Skeleton rows={12} />
            </div>
          ) : activity && activity.ok === false ? (
            <div className="empty">
              <h3>The feed is not readable</h3>
              <p>{activity.reason_human ?? "The activity feed could not be read just now."}</p>
            </div>
          ) : events.length === 0 ? (
            <div className="empty">
              <h3>Nothing in this window</h3>
              <p>
                No event matches the current filters. Widen the window or clear a stream filter to see more.
              </p>
            </div>
          ) : (
            <>
              <div
                className="feed-rows"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) void loadOlder();
                }}
              >
                {events.map((ev) => {
                  const key = `${ev.stream}:${ev.ref ?? ev.at}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`frow${fresh.has(key) ? " fresh" : ""}`}
                      onClick={() => setOpenRef(key)}
                    >
                      <span className="ft">{clock(ev.at)}</span>
                      <span>
                        <span className="chip">{ev.stream_human}</span>
                      </span>
                      <span className="fd" title={`${ev.client ?? ""} ${ev.cob_name ?? ""}`}>
                        {ev.client ?? ev.cid ?? "unknown"}
                        {ev.cob_name ? ` \u00b7 ${ev.cob_name}` : ""}
                      </span>
                      <span className="fd">
                        {ev.subject ?? "\u00b7"} {ev.verb ? <span className="m">{ev.verb}</span> : null}{" "}
                        {ev.detail_a ? <span className="m">{ev.detail_a}</span> : null}{" "}
                        {ev.detail_b ? <span className="m">{ev.detail_b}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="foot-line">
                {loadingMore
                  ? "reading further back"
                  : activity?.summary?.truncated
                    ? "This window holds more than one page. Scroll on to read further back."
                    : exhausted
                      ? "That is the whole window. Nothing older is filed inside it."
                      : `${events.length} events in view`}
              </div>
            </>
          )}
        </div>
      </div>

      <InspectorDrawer
        open={openEvent !== null}
        title={openEvent?.stream_human ?? "Event"}
        subtitle={openEvent ? `${openEvent.client ?? openEvent.cid ?? ""} \u00b7 ${clock(openEvent.at)}` : undefined}
        onClose={() => setOpenRef(null)}
      >
        {openEvent ? (
          <>
            <h3>Event</h3>
            <InspectorField k="Subject" v={openEvent.subject ?? "not recorded"} />
            <InspectorField k="Verb" v={openEvent.verb ?? "not recorded"} />
            <InspectorField k="Detail" v={openEvent.detail_a ?? "not recorded"} />
            <InspectorField k="Detail two" v={openEvent.detail_b ?? "not recorded"} />
            <InspectorField k="Reference" v={<span className="m">{openEvent.ref ?? "none"}</span>} />

            {openEvent.stream === "write" ? (
              <>
                <h3>The row this touched</h3>
                <InspectorField k="Row key" v={String(openEvent.payload?.row_pk ?? "not recorded")} />
                <InspectorField k="Key column" v={String(openEvent.payload?.pk_col ?? "not recorded")} />
                <InspectorField
                  k="Revertable"
                  v={openEvent.payload?.revertable ? "yes, nothing has undone it" : "no, it has already been undone"}
                />
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="btn" disabled title="Revert lands in the next release">
                    Revert
                  </button>
                </div>
              </>
            ) : null}

            <h3>Full payload</h3>
            <pre>{JSON.stringify(openEvent.payload ?? {}, null, 2)}</pre>
          </>
        ) : null}
      </InspectorDrawer>
    </div>
  );
}

export default FleetLive;
