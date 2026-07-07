/**
 * Audit helper: writes a system timeline event describing a field change.
 * Every UI edit routes through here so the timeline is the durable source of
 * "who changed what, when".
 */
import { writeTimelineEvent } from "@/lib/timeline-events";

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export async function writeAuditEvent(params: {
  accountId: string;
  itemId?: string;
  contactId?: string;
  subject: string;              // e.g. "contact updated", "revenue amount changed"
  changes: FieldChange[];
  actorEmail?: string | null;
  extra?: Record<string, unknown>;
}) {
  const filtered = params.changes.filter(c => fmt(c.before) !== fmt(c.after));
  if (filtered.length === 0) return;
  const body = filtered
    .map(c => `${c.field}: ${fmt(c.before)} → ${fmt(c.after)}`)
    .join("\n");
  const summary = params.actorEmail
    ? `${params.subject} by ${params.actorEmail}`
    : params.subject;
  await writeTimelineEvent({
    accountId: params.accountId,
    itemId: params.itemId,
    contactId: params.contactId,
    direction: "system",
    channel: "system",
    summary,
    body,
    rawJson: { audit: true, changes: filtered, ...(params.extra ?? {}) },
  });
}
