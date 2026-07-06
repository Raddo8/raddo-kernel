import { Link } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";
import { DossierPageBand } from "@/components/dossier/DossierPageBand";

export default function DebriefThankYou() {
  return (
    <main className="min-h-screen bg-raddo-paper">
      <SeoHead
        path="/debrief/thank-you"
        title="Information request received · COB"
        description="Your request is in. Expect a tailored follow-up within 2 business days."
        robots="noindex,follow"
      />
      <DossierPageBand
        chip="debrief · received"
        headline="Thank you · we have your"
        keyword="request"
        headlineTrail="."
        subhead="We will be in touch within 2 business days with a tailored follow-up · a specific look at what your COB would handle, how it would deploy inside your business, and the next step from here."
      />
      <section className="mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-20">
        <div
          className="dossier-navy-shadow bg-white p-8 md:p-12"
          style={{ border: "1px solid hsl(var(--raddo-paper-edge))", borderRadius: 8 }}
        >
          <p
            className="font-mono uppercase text-raddo-brass-deep"
            style={{ fontSize: 10, letterSpacing: "0.22em", fontWeight: 700 }}
          >
            what happens next
          </p>
          <p
            className="mt-5 font-sans text-raddo-charcoal"
            style={{ fontSize: 15, lineHeight: 1.6 }}
          >
            No automated reply. The next message you get will be from a person.
          </p>
          <div className="mt-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 font-mono uppercase"
              style={{
                backgroundColor: "hsl(var(--raddo-brass))",
                color: "hsl(var(--raddo-ink-deep))",
                borderRadius: 4,
                padding: "14px 22px",
                fontSize: 12,
                letterSpacing: "0.18em",
                fontWeight: 700,
              }}
            >
              Return home <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
