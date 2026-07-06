import { Link } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";
import { DossierPageBand } from "@/components/dossier/DossierPageBand";

const BOOKING_URL =
  (import.meta.env.VITE_CAL_BOOKING_URL as string | undefined) ?? "https://cal.com/chiefofbusiness";

export default function NextStep() {
  return (
    <main className="min-h-screen bg-dossier-paper">
      <SeoHead
        title="You are on the list · COB"
        description="Your COB conversation is in. Someone from the deployment team will reach out within one business day."
        path="/next-step"
      />
      <DossierPageBand
        chip="deployment · received"
        headline="You are on the"
        keyword="list"
        headlineTrail="."
        subhead="Transcript on its way · should arrive in the next 5 minutes from cob@chiefofbusiness.ai. Someone from the deployment team will read through what you sent and reach out within one business day."
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
            skip the back and forth
          </p>
          <p
            className="mt-5 font-sans text-dossier-charcoal"
            style={{ fontSize: 15, lineHeight: 1.6 }}
          >
            Grab a slot directly · thirty minutes, one conversation, real answers.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center font-mono uppercase"
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
              Book a 30-min slot
            </a>
            <Link
              to="/"
              className="font-mono uppercase text-dossier-ash hover:text-dossier-ink-deep"
              style={{ fontSize: 11, letterSpacing: "0.18em" }}
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
