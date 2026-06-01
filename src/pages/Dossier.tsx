import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import logo3d from "@/assets/dossier/logo-3d.png";
import tradeShow from "@/assets/dossier/trade-show.png";
import officeCob from "@/assets/dossier/office-cob.png";
import oilAndGas from "@/assets/dossier/oil-and-gas.png";
import cornerCubicle from "@/assets/dossier/corner-cubicle.png";

/**
 * /dossier — standalone print-ready document.
 * Light cream paper · navy ink · brass accents. No em-dashes (middot/period only).
 */

const dossiers = [
  {
    n: "01",
    title: "built for you",
    body: "Your COB is engineered for one company. From the day it is installed, every behavior is built around your business, your operator, your decisions, and remembers every one of them. No drift from one customer to the next. One COB. One mission. Built to be 110% loyal to your interests, year after year. A category of one.",
  },
  {
    n: "02",
    title: "personality",
    body: "Your COB has a built personality, not a setting you toggle. The tone, register, communication style, and operating posture are engineered to match your operator's voice and your company's culture. The result reads like a senior executive who has been with you for years, not a tool bolted on. Distinct. Coherent. Yours.",
  },
  {
    n: "03",
    title: "alignment",
    body: "Your COB does not optimize for what is generally smart. It optimizes for what your business is doing · the strategy, the priorities, the constraints, the things you said matter and the things you said do not. Every recommendation flows through that filter. Generic advice is easy. Aligned counsel is the hard thing. Wired in at install.",
  },
  {
    n: "04",
    title: "strategy",
    body: "Strategic thinking is engineered into how your COB approaches every consequential question. Diagnosis first. Then guiding policy. Then coherent action. Not advice that sounds smart · analysis that names what is actually happening and what to do about it. Your COB does not surface tactics dressed up as strategy. It works in the register your decisions require.",
  },
  {
    n: "05",
    title: "truth",
    body: "Every response your COB delivers includes its own calibration: how confident it is, what it knows for certain, what it is inferring, what it has not verified. No false confidence. No hidden uncertainty. No marketing language around the gaps. When something matters, the gap matters more than the claim. Your COB is built to surface both.",
  },
  {
    n: "06",
    title: "loyalty",
    body: "Loyalty means telling you uncomfortable truths. Your COB is engineered to disagree when you are about to make a mistake. The pushback is the value, not the friction. When the numbers do not support the decision, your COB will name it. When the strategy you are describing contradicts the strategy you locked last quarter, your COB surfaces it. Loyalty is not agreement.",
  },
  {
    n: "07",
    title: "anticipation",
    body: "Your COB does not wait to be asked. It surfaces what you did not think to look for · the pattern across three customer renegotiations that says something about your pricing, the risk hiding in the contract clause everyone signed last year, the question the board is going to ask before they ask it. Forward posture, not reactive.",
  },
  {
    n: "08",
    title: "compounding",
    body: "Your COB gets sharper with every cycle · not by changing, but by remembering more of you. Years of decisions, patterns, context, conversations, edge cases · all available the moment they are relevant. Living infrastructure that thickens with use. The longer you have it, the more leverage you carry into every room. Compounding intelligence built into how it operates.",
  },
];

const carry: Array<{ label: string; body: string }> = [
  { label: "Strategy", body: "priorities in view, drift flagged early" },
  { label: "Finance", body: "a steady read on what is owed, owed to you, and coming" },
  { label: "Operations", body: "the workflows and status that usually live in one head" },
  { label: "Revenue", body: "pipeline, relationships, and the next move on each" },
  { label: "People", body: "onboarding, commitments, and how things are done here" },
  { label: "Legal and risk", body: "contracts, obligations, and what needs a second look" },
  { label: "Members and customers", body: "who needs what, by when, and what was promised" },
  { label: "Vendors", body: "agreements, renewals, and where the leverage sits" },
  { label: "Meetings", body: "prepared going in, captured coming out, tracked to done" },
  { label: "Memory", body: "one sourced record of decisions and the why behind them" },
];

const whatItDoes = [
  "Briefs you each morning on what actually deserves your attention, drawn from your business, not a generic feed.",
  "Thinks with you on the hard calls: the strongest case for and against, the assumption you have not named, and what would change the answer.",
  "Catches what is off-pattern before it costs you, because it remembers every decision you have made and how each one landed.",
  "Holds the institutional memory that used to walk out the door: every decision, every reason, every result, retained.",
];

const principles = [
  "Executive Clarity",
  "Principled Origin",
  "Disciplined Decision",
  "Timeless Authority",
  "Built to Endure",
];

// Reusable section wrapper · enforces print page break + cream paper rhythm.
function Page({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={
        "dossier-page relative w-full bg-raddo-paper text-raddo-charcoal " +
        "px-6 sm:px-12 lg:px-24 py-16 lg:py-24 " +
        className
      }
    >
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  );
}

function Overline({ n, label }: { n: string; label: string }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.22em] text-raddo-brass-deep mb-6">
      dossier {n} <span className="text-raddo-brass">·</span> {label}
    </p>
  );
}

function BrassHairline({ className = "" }: { className?: string }) {
  return (
    <div className={"flex items-center gap-2 " + className}>
      <span className="h-px flex-1 bg-raddo-brass/40" />
      <span className="h-1.5 w-1.5 rounded-full bg-raddo-brass" />
      <span className="h-px flex-1 bg-raddo-brass/40" />
    </div>
  );
}

export default function Dossier() {
  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-raddo-paper">
      <Helmet>
        <title>Chief of Business · Dossier</title>
        <meta
          name="description"
          content="The Chief of Business dossier. An executive-level thinking AI operator who never forgets, never leaves, and gets sharper every day you run alongside them."
        />
        <link rel="icon" href={logo3d} />
        <meta name="robots" content="noindex,follow" />
      </Helmet>

      {/* Print styles · one page per section */}
      <style>{`
        @media print {
          @page { size: Letter; margin: 0.5in; }
          html, body { background: #FAF8F4 !important; }
          .dossier-no-print { display: none !important; }
          .dossier-page {
            page-break-after: always;
            break-after: page;
            padding: 0.25in 0.5in !important;
            min-height: auto !important;
          }
          .dossier-page:last-child { page-break-after: auto; }
          img { max-width: 100% !important; }
        }
      `}</style>

      {/* Fixed header · hidden on print */}
      <header className="dossier-no-print sticky top-0 z-30 border-b border-raddo-paper-edge bg-raddo-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 lg:px-12">
          <a href="/" className="flex items-center gap-3">
            <img src={logo3d} alt="Chief of Business mark" className="h-8 w-8 object-contain" />
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-raddo-ink-deep">
              chief of business <span className="text-raddo-brass">·</span> dossier
            </span>
          </a>
          <Button
            onClick={handlePrint}
            variant="default"
            className="bg-raddo-brass text-raddo-ink-deep hover:bg-raddo-brass-deep hover:text-raddo-paper"
          >
            <Printer className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </header>

      {/* PAGE 1 · HERO */}
      <section className="dossier-page relative w-full bg-raddo-paper">
        <div className="w-full">
          <img
            src={tradeShow}
            alt="Chief of Business diorama · the showcase"
            className="block w-full h-auto object-contain"
          />
        </div>
        <div className="mx-auto max-w-5xl px-6 sm:px-12 lg:px-24 py-16 lg:py-24">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-raddo-brass-deep mb-6">
            chief of business
          </p>
          <h1 className="font-display text-5xl lg:text-7xl font-bold leading-[1.05] text-raddo-ink-deep">
            Your Chief of Business.
          </h1>
          <p className="mt-8 max-w-3xl font-sans text-xl lg:text-2xl leading-relaxed text-raddo-charcoal">
            An executive-level thinking AI operator who never forgets, never leaves, and gets
            sharper every day you run alongside them.
          </p>
          <BrassHairline className="mt-16" />
        </div>
      </section>

      {/* PAGE 2 · THE WALL */}
      <Page>
        <Overline n="02" label="the wall" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-10">
          Every serious operator hits the same wall.
        </h2>
        <div className="space-y-6 font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal max-w-3xl">
          <p>
            The business is talking to you constantly, in your inbox, your numbers, your meetings,
            your people, and no single mind can hold all of it at once. The context that makes your
            best decisions possible lives in fragments, and the moment someone leaves or a quarter
            closes, a piece of it is gone for good.
          </p>
          <p>
            A Chief of Business closes that gap. It is a single, dedicated companion that learns
            your business the way a twenty-year chief of staff would: your role, your people, your
            decisions, the way work actually moves through your hands, the unwritten rules no one
            documents. Then it holds all of it, in one place, permanently.
          </p>
        </div>
        <BrassHairline className="mt-16" />
      </Page>

      {/* PAGE 3 · WHAT IT DOES */}
      <Page>
        <Overline n="03" label="what it does" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-12">
          Four things, every day.
        </h2>
        <ul className="space-y-8 max-w-3xl">
          {whatItDoes.map((line, i) => (
            <li key={i} className="flex gap-5">
              <span className="mt-2.5 h-2.5 w-2.5 flex-none rounded-full bg-raddo-brass ring-4 ring-raddo-brass/15" />
              <p className="font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal">
                {line}
              </p>
            </li>
          ))}
        </ul>
        <BrassHairline className="mt-16" />
      </Page>

      {/* PAGE 4 · ENGINEERED DIFFERENTLY */}
      <Page>
        <Overline n="04" label="engineered differently" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-4">
          Eight folders. One operator.
        </h2>
        <p className="font-sans text-lg text-raddo-ash max-w-2xl mb-12">
          The dossier system underneath every COB. Each folder is a design commitment, not a
          feature.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          {dossiers.map((d) => (
            <article key={d.n} className="relative">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-raddo-brass-deep">
                  dossier {d.n}
                </span>
                <span className="h-px flex-1 bg-raddo-brass/40" />
                <span className="h-1.5 w-1.5 rounded-full bg-raddo-brass" />
              </div>
              <h3 className="font-display text-2xl font-bold text-raddo-ink-deep mb-3 lowercase">
                {d.title}
              </h3>
              <p className="font-sans text-base leading-relaxed text-raddo-charcoal">{d.body}</p>
            </article>
          ))}
        </div>
      </Page>

      {/* PAGE 5 · WHAT YOUR COB CARRIES */}
      <Page>
        <Overline n="05" label="what your COB carries" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-4">
          One coordinated layer.
        </h2>
        <p className="font-sans text-lg text-raddo-ash max-w-2xl mb-12">
          Not ten tools. One operator holding ten domains.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
          {carry.map((c) => (
            <div key={c.label} className="flex gap-4 border-b border-raddo-paper-edge pb-4">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-raddo-brass" />
              <p className="font-sans text-base leading-relaxed text-raddo-charcoal">
                <span className="font-semibold text-raddo-ink-deep">{c.label}:</span> {c.body}
              </p>
            </div>
          ))}
        </div>
      </Page>

      {/* PAGE 6 · IN YOUR WORLD */}
      <Page>
        <Overline n="06" label="in your world" />
        <p className="font-display text-2xl lg:text-3xl leading-snug text-raddo-ink-deep max-w-3xl mb-12">
          Built to sit inside how you already operate, in any industry.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { src: officeCob, alt: "COB inside the boardroom" },
            { src: oilAndGas, alt: "COB inside energy operations" },
            { src: cornerCubicle, alt: "COB at the operator's own desk" },
          ].map((img, i) => (
            <figure
              key={i}
              className="border border-raddo-brass/40 bg-white p-2 shadow-sm"
            >
              <div className="aspect-square overflow-hidden bg-raddo-paper">
                <img
                  src={img.src}
                  alt={img.alt}
                  className="h-full w-full object-cover"
                />
              </div>
            </figure>
          ))}
        </div>
      </Page>

      {/* PAGE 7 · BUILT FOR TRUST */}
      <Page>
        <Overline n="07" label="built for trust" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-10">
          Transparent. Sourced. Reversible.
        </h2>
        <div className="space-y-6 font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal max-w-3xl">
          <p>
            Every output is transparent, sourced, and reversible, and a person always keeps the
            final call. COB advises, prepares, and surfaces; it never acts on its own authority.
          </p>
          <p>You always see where an answer came from and how current it is. No black box.</p>
        </div>
        <BrassHairline className="mt-16" />
      </Page>

      {/* PAGE 8 · WHY UNLIKE */}
      <Page>
        <Overline n="08" label="why it is unlike anything you have used" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-10">
          Yours. Permanent. Direct.
        </h2>
        <div className="space-y-6 font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal max-w-3xl">
          <p>
            It runs off your business: your current numbers, your real people, your live decisions,
            never public approximations.
          </p>
          <p>It speaks to you as a peer who has earned the right to be direct.</p>
          <p>
            And it is permanent: it does not reset when you change roles, restructure your team, or
            scale into something larger. The longer you use it, the more of you it carries.
          </p>
        </div>
        <BrassHairline className="mt-16" />
      </Page>

      {/* PAGE 9 · PRINCIPLES */}
      <Page>
        <Overline n="09" label="the principles" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-12">
          Five principles.
        </h2>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-16">
          {principles.map((p, i) => (
            <div key={p} className="flex items-center gap-4">
              <div className="flex flex-col items-center text-center">
                <span className="h-3 w-3 rounded-full bg-raddo-brass ring-4 ring-raddo-brass/15" />
                <p className="mt-3 font-display text-lg font-bold text-raddo-ink-deep max-w-[10ch] leading-tight">
                  {p}
                </p>
              </div>
              {i < principles.length - 1 && (
                <span className="hidden md:block h-px w-10 bg-raddo-brass/50" />
              )}
            </div>
          ))}
        </div>
        <p className="font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal max-w-3xl">
          Installed to fit exactly how you operate, from a quiet private setup to a fully integrated
          seat inside the tools you already run on.
        </p>
      </Page>

      {/* PAGE 10 · CLOSE */}
      <Page className="text-center">
        <div className="flex flex-col items-center">
          <img
            src={logo3d}
            alt="Chief of Business mark"
            className="h-32 w-32 object-contain mb-12"
          />
          <h2 className="font-display text-4xl lg:text-6xl font-bold leading-tight text-raddo-ink-deep mb-12 max-w-3xl">
            Not just in your corner. Building your corner.
          </h2>
          <p className="font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal max-w-2xl mb-12">
            The question is no longer whether decision intelligence at this depth becomes the
            standard for serious operators. The question is whether you have one when it does.
          </p>
          <Button
            asChild
            className="bg-raddo-brass text-raddo-ink-deep hover:bg-raddo-brass-deep hover:text-raddo-paper px-8 py-6 text-base"
          >
            <a href="/consult">Request your COB</a>
          </Button>
          <BrassHairline className="mt-20 w-full max-w-md" />
          <p className="dossier-no-print mt-6 font-mono text-xs uppercase tracking-[0.22em] text-raddo-ash">
            chiefofbusiness.ai
          </p>
        </div>
      </Page>
    </div>
  );
}
