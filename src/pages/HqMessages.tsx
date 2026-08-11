/** MESSAGES · /hq/messages · what has been drafted for you, and what went out.
 *
 * A draft stays drafted until the provider hands back an id. This page shows
 * that state plainly, so a message is never reported as sent on nothing.
 */
import { RegisterPage, when, type RegisterSpec } from "@/components/hq/RegisterPage";

interface CommRow {
  comm_id: string;
  channel: string | null;
  direction: string | null;
  state: string | null;
  to_whom: string | null;
  subject: string | null;
  body_md: string | null;
  external_url: string | null;
  prepared_by: string | null;
  created_at: string | null;
  sent_at: string | null;
  failed_reason: string | null;
}

const stateWord = (s: string | null): string => {
  switch ((s ?? "").toLowerCase()) {
    case "drafted":
      return "waiting on you";
    case "sent":
      return "sent";
    case "failed":
      return "did not send";
    case "archived":
      return "put away";
    default:
      return s ? s.toLowerCase() : "no state";
  }
};

const spec: RegisterSpec<CommRow> = {
  rpc: "hq_comms_read",
  crumb: "YOUR HQ",
  heading: "Messages",
  sub: "Drafts prepared for you and what actually happened to each one.",
  limit: 120,
  leadKey: "waiting_on_you",
  leadWords: (n) => (n === 1 ? "message is waiting on you" : "messages are waiting on you"),
  kpis: [
    { key: "sent", label: "sent" },
    { key: "failed", label: "did not send" },
    { key: "total", label: "in all" },
  ],
  idOf: (r) => r.comm_id,
  titleOf: (r) => r.subject ?? "No subject",
  cells: (r) => [
    { text: r.to_whom ?? "no recipient" },
    { text: (r.channel ?? "no channel").toLowerCase() },
    { text: stateWord(r.state), mark: (r.state ?? "") === "drafted" },
  ],
  fields: (r) => [
    { k: "To", v: r.to_whom ?? "no recipient" },
    { k: "Subject", v: r.subject ?? "no subject" },
    { k: "Channel", v: (r.channel ?? "not stated").toLowerCase() },
    { k: "State", v: stateWord(r.state) },
    { k: "Prepared", v: when(r.created_at) },
    { k: "Prepared by", v: r.prepared_by ?? "not stated" },
    { k: "Sent", v: r.sent_at ? when(r.sent_at) : "not sent" },
    { k: "Why it failed", v: r.failed_reason ?? "it has not failed" },
    {
      k: "Where it lives",
      v: r.external_url ? (
        <a href={r.external_url} target="_blank" rel="noreferrer">
          Open it where it was filed
        </a>
      ) : (
        "nowhere yet"
      ),
    },
    { k: "Body", v: r.body_md ?? "no body on record" },
  ],
  // Sending is the provider's act, recorded by the COB with the id it was
  // handed. Nothing on this page claims a send the record cannot point at.
  verbs: [],
  haystack: (r) => `${r.subject ?? ""} ${r.to_whom ?? ""} ${r.channel ?? ""} ${r.state ?? ""}`,
  emptyWords: "Nothing drafted for you yet.",
};

export function HqMessages() {
  return <RegisterPage spec={spec} />;
}

export default HqMessages;
