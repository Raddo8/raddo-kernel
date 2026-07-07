/**
 * Branded, print-perfect invoice document · Chief of Business dossier identity.
 *
 * Layout target: one clean US Letter page under browser print-to-PDF.
 * Palette locked to raddo tokens (cream ground, deep navy ink, brass rule).
 *
 * The parent surface controls preview vs print. When rendered inside the
 * dedicated /app/invoices/print route the surrounding chrome hides via the
 * `.invoice-print-only` class + a matching `@media print` block in index.css.
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

function fmtD(iso: string): string {
  try { return format(parseISO(iso), "MMMM d, yyyy"); } catch { return iso; }
}

function remitTitle(mode: "manual" | "auto_draft"): string {
  return mode === "auto_draft" ? "Remittance" : "Payment";
}

function remitFallback(mode: "manual" | "auto_draft"): string {
  if (mode === "auto_draft") {
    return "This invoice is collected automatically via your subscription on file. No action needed.";
  }
  return "Bank remittance details will be provided separately. Reference the invoice number in the memo line.";
}

export default function InvoiceDocument({ invoice, account, contact, remittance }: Props) {
  const lines = (invoice.line_items || []) as InvoiceLineItem[];
  const total = Number(invoice.total ?? invoice.subtotal ?? 0);
  const remitBody = (remittance?.trim() || remitFallback(invoice.billing_mode));
  const payLink = invoice.stripe_payment_link || null;
  const periodLabel = (() => {
    try { return format(parseISO(invoice.billing_period), "MMMM yyyy"); } catch { return invoice.billing_period; }
  })();

  return (
    <div
      className="invoice-doc mx-auto"
      style={{
        width: "8.5in", minHeight: "11in", padding: "0.75in 0.85in",
        background: "#FAF8F4", color: "#042C53",
        fontFamily: "'Inter', system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          paddingBottom: 12, borderBottom: "1px solid #EF9F27",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Fraunces', Georgia, serif", fontWeight: 800,
              fontSize: 26, letterSpacing: "-0.01em", lineHeight: 1,
            }}
          >
            COB
            <span style={{ color: "#EF9F27", margin: "0 8px", fontWeight: 400 }}>·</span>
            <span style={{ fontWeight: 500 }}>Chief of Business</span>
          </div>
          <div style={{
            marginTop: 6, fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "#5F5E5A",
          }}>
            invoice
            <span style={{ color: "#EF9F27", margin: "0 6px" }}>·</span>
            {invoice.invoice_number}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#5F5E5A" }}>
          <div>chiefofbusiness.ai</div>
          <div>billing@chiefofbusiness.ai</div>
        </div>
      </header>

      {/* Bill-to + meta */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            letterSpacing: "0.16em", textTransform: "uppercase",
            color: "#5F5E5A", marginBottom: 6,
          }}>
            Billed to
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
            {account?.name ?? "—"}
          </div>
          {contact?.name && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Attn: {contact.name}
            </div>
          )}
          {contact?.email && (
            <div style={{ fontSize: 12, color: "#5F5E5A" }}>{contact.email}</div>
          )}
        </div>
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <MetaRow label="Issued" value={fmtD(invoice.issue_date)} />
          <MetaRow label="Due" value={fmtD(invoice.due_date)} />
          <MetaRow label="Period" value={periodLabel} />
          <MetaRow label="Status" value={invoice.status.replace(/_/g, " ")} mono />
        </div>
      </section>

      {/* Line items */}
      <section style={{ marginTop: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #EF9F27" }}>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: 140 }}>Occurrence</th>
              <th style={{ ...thStyle, width: 120, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((li, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(239,159,39,0.25)" }}>
                <td style={tdStyle}>{li.description}</td>
                <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#5F5E5A" }}>
                  {fmtD(li.occurrence_date)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmtUsd(Number(li.amount_usd))}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "#5F5E5A" }}>
                No line items.
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <div style={{ width: 260 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", fontSize: 12,
            padding: "6px 0", color: "#5F5E5A",
          }}>
            <span>Subtotal</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtUsd(Number(invoice.subtotal ?? 0))}
            </span>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "10px 0", borderTop: "2px solid #EF9F27",
            fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700,
          }}>
            <span>Total due</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtUsd(total)}</span>
          </div>
        </div>
      </section>

      {/* Pay online */}
      {payLink && (
        <section style={{ marginTop: 24, fontSize: 11, lineHeight: 1.5 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            letterSpacing: "0.16em", textTransform: "uppercase",
            color: "#5F5E5A", marginBottom: 6,
          }}>Pay online</div>
          <a href={payLink} style={{ color: "#042C53", textDecoration: "underline" }}>
            {payLink}
          </a>
        </section>
      )}

      {/* Terms / remit */}
      <section style={{ marginTop: 24, fontSize: 11, lineHeight: 1.5 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: "#5F5E5A", marginBottom: 6,
        }}>
          {remitTitle(invoice.billing_mode)}
        </div>
        <div style={{ whiteSpace: "pre-wrap", color: "#2C2C2A" }}>{remitBody}</div>
        {invoice.notes && (
          <div style={{ marginTop: 12, color: "#2C2C2A" }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color: "#5F5E5A", marginBottom: 4,
            }}>
              Notes
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</div>
          </div>
        )}
      </section>


      {/* Footer */}
      <footer style={{
        marginTop: "auto", paddingTop: 24, textAlign: "center",
        fontSize: 10, color: "#5F5E5A",
        borderTop: "1px solid rgba(239,159,39,0.35)",
        position: "absolute" as const,
      }}>
        {/* placeholder to avoid layout shift when embedded */}
      </footer>

      <div style={{
        marginTop: 40, paddingTop: 12,
        borderTop: "1px solid rgba(239,159,39,0.35)",
        textAlign: "center", fontSize: 10, color: "#5F5E5A",
      }}>
        © {new Date().getFullYear()} COB Technologies LLC
        <span style={{ color: "#EF9F27", margin: "0 6px" }}>·</span>
        chiefofbusiness.ai
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "2px 0" }}>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        letterSpacing: "0.14em", textTransform: "uppercase", color: "#5F5E5A",
      }}>{label}</span>
      <span style={mono ? { fontFamily: "'JetBrains Mono', monospace", fontSize: 11 } : undefined}>
        {value}
      </span>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 4px",
  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
  letterSpacing: "0.16em", textTransform: "uppercase", color: "#5F5E5A",
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 4px", verticalAlign: "top",
};
