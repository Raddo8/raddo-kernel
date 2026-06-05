import { Link } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";

export default function DebriefThankYou() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: "hsl(var(--raddo-paper))" }}>
      <SeoHead
        path="/debrief/thank-you"
        title="Information request received · COB"
        description="Your request is in. Expect a tailored follow-up within 2 business days."
        robots="noindex,follow"
      />

      <header className="mx-auto max-w-5xl px-6 pt-10 md:px-10 md:pt-14">
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
          ← Back to chiefofbusiness.ai
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-24">
        <div
          className="p-8 md:p-12"
          style={{
            backgroundColor: "white",
            border: "1px solid hsl(var(--raddo-paper-edge))",
            borderRadius: 8,
            boxShadow: "0 2px 8px -4px hsl(var(--raddo-ink-deep) / 0.08)",
          }}
        >
          <p
            className="font-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "hsl(var(--raddo-brass-deep))",
              fontWeight: 600,
            }}
          >
            DEBRIEF · RECEIVED
          </p>
          <h1
            className="mt-4 font-display"
            style={{
              color: "hsl(var(--raddo-ink-deep))",
              fontSize: "clamp(2rem, 4vw, 3rem)",
              lineHeight: 1.1,
              fontWeight: 800,
            }}
          >
            Thank you · we have your request.
          </h1>
          <p
            className="mt-5 max-w-2xl"
            style={{ color: "hsl(var(--raddo-charcoal))", fontSize: 17, lineHeight: 1.6 }}
          >
            We will be in touch within 2 business days with a tailored follow-up · a specific look at
            what your COB would handle, how it would deploy inside your business, and the next step
            from here.
          </p>
          <p
            className="mt-3 max-w-2xl"
            style={{ color: "hsl(var(--raddo-ash))", fontSize: 14, lineHeight: 1.6 }}
          >
            No automated reply. The next message you get will be from a person.
          </p>

          <div className="mt-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 font-mono transition-colors"
              style={{
                backgroundColor: "hsl(var(--raddo-brass))",
                color: "hsl(var(--raddo-ink-deep))",
                border: "1px solid hsl(var(--raddo-brass-deep))",
                borderRadius: 8,
                padding: "14px 22px",
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 700,
                boxShadow: "0 4px 12px -6px hsl(var(--raddo-brass-deep) / 0.4)",
              }}
            >
              Return to home <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
