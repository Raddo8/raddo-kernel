/**
 * Branded, print-perfect invoice document · Chief of Business dossier identity.
 *
 * Layout target: one clean US Letter page under browser print-to-PDF.
 * Palette locked to raddo tokens (cream ground, deep navy ink, brass rule).
 */
import { format, parseISO } from "date-fns";
import { fmtUsd } from "@/lib/revenue-math";
import type { Invoice, InvoiceLineItem } from "@/lib/invoices";

interface Props {
  invoice: Invoice;
  account: { id: string; name: string; billing_mode?: "manual" | "auto_draft" } | null;
  contact?: { name: string | null; email: string | null } | null;
  workspace?: { name?: string | null } | null;
  /** Free-form remittance / wiring instructions from workspace settings. */
  remittance?: string | null;
}

const INK = "#042C53";
const INK_SOFT = "#185FA5";
const PAPER = "#FAF8F4";
const BRASS = "#EF9F27";
const ASH = "#5F5E5A";
const CHARCOAL = "#2C2C2A";

function fmtD(iso: string): string {
  try { return format(parseISO(iso), "MMMM d, yyyy"); } catch { return iso; }
}

function remitFallback(mode: "manual" | "auto_draft"): string {
  if (mode === "auto_draft") {
    return "This invoice is collected automatically via your subscription on file. No action needed.";
  }
  return "Bank remittance details will be provided separately. Reference the invoice number in the memo line.";
}

/** Parse "Label: value" lines into structured rows; free-form lines pass through. */
function parseRemittance(text: string): Array<{ label?: string; value: string }> {
  return text
    .split("\n")
    .map((raw) => raw.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const m = line.match(/^([A-Za-z][A-Za-z0-9 /().-]{0,60}?):\s+(.+)$/);
      if (m) return { label: m[1].trim(), value: m[2].trim() };
      return { value: line };
    });
}

export default function InvoiceDocument({ invoice, account, contact, remittance }: Props) {
  const lines = (invoice.line_items || []) as InvoiceLineItem[];
  const total = Number(invoice.total ?? invoice.subtotal ?? 0);
  const remitBody = (remittance?.trim() || remitFallback(invoice.billing_mode));
  const remitRows = parseRemittance(remitBody);
  const payLink = invoice.stripe_payment_link || null;
  const periodLabel = (() => {
    try { return format(parseISO(invoice.billing_period), "MMMM yyyy"); } catch { return invoice.billing_period; }
  })();
  const statusLabel = invoice.status.replace(/_/g, " ").toUpperCase();

  return (
    <div
      className="invoice-doc mx-auto"
      style={{
        width: "8.5in", minHeight: "11in", padding: "0.7in 0.8in",
        background: PAPER, color: INK,
        fontFamily: "'Inter', system-ui, sans-serif",
        boxSizing: "border-box",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          paddingBottom: 14, borderBottom: `1px solid ${BRASS}`,
        }}
      >
        <div>
          <div style={{
            fontFamily: "'Fraunces', Georgia, serif", fontWeight: 800,
            fontSize: 28, letterSpacing: "-0.015em", lineHeight: 1, color: INK,
          }}>
            COB Technologies LLC
          </div>
          <div style={{
            marginTop: 6, fontSize: 11, color: ASH, lineHeight: 1.5,
          }}>
            Chief of Business<br />
            chiefofbusiness.ai · billing@chiefofbusiness.ai
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontFamily: "'Fraunces', serif", fontWeight: 700,
            fontSize: 22, letterSpacing: "0.02em", color: INK, lineHeight: 1,
          }}>
            INVOICE
          </div>
          <div style={{
            marginTop: 6, fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, color: INK_SOFT, letterSpacing: "0.06em",
          }}>
            {invoice.invoice_number}
          </div>
          <div style={{
            marginTop: 8, display: "inline-block",
            padding: "3px 8px", border: `1px solid ${BRASS}`,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            letterSpacing: "0.18em", color: BRASS, background: "rgba(239,159,39,0.06)",
          }}>
            {statusLabel}
          </div>
        </div>
      </header>

      {/* Bill-to + meta */}
      <section style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 28,
      }}>
        <div>
          <SectionLabel>Bill to</SectionLabel>
          <div style={{
            fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600,
            lineHeight: 1.25, color: INK, marginTop: 4,
          }}>
            {account?.name ?? "—"}
          </div>
          {contact?.name && (
            <div style={{ fontSize: 12, marginTop: 4, color: CHARCOAL }}>
              Attn: {contact.name}
            </div>
          )}
          {contact?.email && (
            <div style={{ fontSize: 12, color: ASH }}>{contact.email}</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <MetaRow label="Issue date" value={fmtD(invoice.issue_date)} />
          <MetaRow label="Due date" value={fmtD(invoice.due_date)} emphasize />
          <MetaRow label="Billing period" value={periodLabel} />
        </div>
      </section>

      {/* Line items */}
      <section style={{ marginTop: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BRASS}` }}>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: 140 }}>Occurrence</th>
              <th style={{ ...thStyle, width: 130, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((li, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(239,159,39,0.22)" }}>
                <td style={{ ...tdStyle, color: INK }}>{li.description}</td>
                <td style={{
                  ...tdStyle, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11, color: ASH,
                }}>
                  {fmtD(li.occurrence_date)}
                </td>
                <td style={{
                  ...tdStyle, textAlign: "right",
                  fontVariantNumeric: "tabular-nums", color: INK,
                }}>
                  {fmtUsd(Number(li.amount_usd))}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: ASH }}>
                No line items.
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <div style={{ width: 280 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", fontSize: 12,
            padding: "6px 0", color: ASH,
          }}>
            <span>Subtotal</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtUsd(Number(invoice.subtotal ?? 0))}
            </span>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            padding: "12px 0 4px", borderTop: `2px solid ${BRASS}`,
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.18em", textTransform: "uppercase", color: ASH,
            }}>Total due</span>
            <span style={{
              fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700,
              fontVariantNumeric: "tabular-nums", color: INK,
            }}>{fmtUsd(total)}</span>
          </div>
        </div>
      </section>

      {/* Remittance */}
      <section style={{
        marginTop: 32, padding: "16px 18px",
        border: `1px solid rgba(4,44,83,0.12)`,
        background: "rgba(255,255,255,0.55)",
      }}>
        <SectionLabel>Remittance · wiring instructions</SectionLabel>
        <div style={{ marginTop: 10, fontSize: 12, color: CHARCOAL, lineHeight: 1.6 }}>
          {remitRows.some((r) => r.label) ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {remitRows.map((r, i) => (
                  <tr key={i}>
                    {r.label ? (
                      <>
                        <td style={{
                          padding: "3px 12px 3px 0", verticalAlign: "top",
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                          letterSpacing: "0.08em", textTransform: "uppercase",
                          color: ASH, whiteSpace: "nowrap", width: "38%",
                        }}>{r.label}</td>
                        <td style={{ padding: "3px 0", color: INK }}>{r.value}</td>
                      </>
                    ) : (
                      <td colSpan={2} style={{ padding: "3px 0", color: CHARCOAL }}>
                        {r.value}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{remitBody}</div>
          )}
        </div>
      </section>

      {/* Pay online */}
      {payLink && (
        <section style={{ marginTop: 20 }}>
          <SectionLabel>Pay online</SectionLabel>
          <a href={payLink} style={{
            display: "inline-block", marginTop: 8,
            fontSize: 12, color: INK, textDecoration: "underline",
            wordBreak: "break-all",
          }}>
            {payLink}
          </a>
        </section>
      )}

      {/* Notes */}
      {invoice.notes && (
        <section style={{ marginTop: 20 }}>
          <SectionLabel>Notes</SectionLabel>
          <div style={{
            marginTop: 6, fontSize: 11, lineHeight: 1.55,
            color: CHARCOAL, whiteSpace: "pre-wrap",
          }}>{invoice.notes}</div>
        </section>
      )}

      {/* Footer */}
      <div style={{
        marginTop: "auto", paddingTop: 24, paddingBottom: 0,
      }}>
        <div style={{
          paddingTop: 12, borderTop: `1px solid rgba(239,159,39,0.35)`,
          textAlign: "center", fontSize: 10, color: ASH, letterSpacing: "0.02em",
        }}>
          © {new Date().getFullYear()} COB Technologies LLC
          <span style={{ color: BRASS, margin: "0 6px" }}>·</span>
          chiefofbusiness.ai
          <span style={{ color: BRASS, margin: "0 6px" }}>·</span>
          Reference {invoice.invoice_number} with your payment
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
      letterSpacing: "0.18em", textTransform: "uppercase", color: ASH,
    }}>{children}</div>
  );
}

function MetaRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      gap: 16, padding: "2px 0",
    }}>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        letterSpacing: "0.16em", textTransform: "uppercase", color: ASH,
      }}>{label}</span>
      <span style={{
        fontSize: emphasize ? 13 : 12,
        fontWeight: emphasize ? 600 : 400,
        color: emphasize ? INK : CHARCOAL,
      }}>{value}</span>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 4px",
  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
  letterSpacing: "0.16em", textTransform: "uppercase", color: ASH,
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 4px", verticalAlign: "top",
};
