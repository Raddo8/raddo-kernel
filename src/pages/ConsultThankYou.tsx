import { Link } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";
import { DossierPageBand } from "@/components/dossier/DossierPageBand";

export default function ConsultThankYou() {
  return (
    <main className="min-h-screen bg-dossier-paper">
      <SeoHead
        path="/consult/thank-you"
        title="Consult received · COB"
        description="Your consult is in. Expect a response within 2 business days."
        robots="noindex,follow"
      />
      <DossierPageBand
        chip="consult · received"
        headline="Thanks · we have your"
        keyword="answers"
        headlineTrail="."
        subhead="You will hear back within 2 business days with a specific reply on what your COB would look like and what the next step would be."
      />
      <section className="mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-20">
        <div
          className="dossier-navy-shadow bg-white p-8 md:p-12"
          style={{ border: "1px solid hsl(var(--dossier-paper-edge))", borderRadius: 8 }}
        >
          <p
            className="font-mono uppercase text-dossier-brass-deep"
            style={{ fontSize: 10, letterSpacing: "0.22em", fontWeight: 700 }}
          >
            what happens next
          </p>
          <ul className="mt-5 space-y-3 font-sans text-dossier-charcoal" style={{ fontSize: 15, lineHeight: 1.6 }}>
            <li>· A person reads what you sent · no automated reply.</li>
            <li>· We prepare a tailored response scoped to your operation.</li>
            <li>· You get one message with the specific next step.</li>
          </ul>
          <div className="mt-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 font-mono uppercase"
              style={{
                backgroundColor: "hsl(var(--dossier-brass))",
                color: "hsl(var(--dossier-ink-deep))",
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
