import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import logo3d from "@/assets/dossier/logo-3d.png";
import tradeShow from "@/assets/dossier/trade-show.png";
import officeCob from "@/assets/dossier/office-cob.png";
import oilAndGas from "@/assets/dossier/oil-and-gas.png";
import cornerCubicle from "@/assets/dossier/corner-cubicle.png";
import vaultExhibit from "@/assets/raddo-vault-exhibit.png";

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


const VAULT_LEGEND: { n: string; label: string }[] = [
  { n: "01", label: "Knowledge / memory base" },
  { n: "02", label: "Email" },
  { n: "03", label: "Calendar" },
  { n: "04", label: "Data / document storage" },
  { n: "05", label: "Accounting platform" },
  { n: "06", label: "Payroll & HR system" },
  { n: "07", label: "CRM" },
  { n: "08", label: "Team communication" },
  { n: "09", label: "Industry · specific operation systems" },
  { n: "10", label: "Management tools" },
];

const VAULT_CAPABILITIES: { title: string; items: string[] }[] = [
  { title: "Strategy & decisions", items: ["Quarterly reviews", "Annual planning", "Decision stress · tests", "Option analysis", "Board packs"] },
  { title: "Finance", items: ["Cash forecasting", "Bank reconciliation", "AR collections", "Cost ratios", "Covenant compliance"] },
  { title: "Operations", items: ["Store KPIs", "Maintenance tracking", "Delivery monitoring", "SOP enforcement", "Contract audits"] },
  { title: "Revenue & sales", items: ["Pipeline tracking", "Sales outreach", "Conversion analysis", "Launch coordination", "Loss analysis"] },
  { title: "People & HR", items: ["Org charts", "Hiring tracking", "Retention monitoring", "Onboarding plans", "Comp benchmarking"] },
  { title: "Legal & compliance", items: ["Contract tracking", "Licensing calendar", "Entity audits", "Policy review", "Regulatory watch"] },
  { title: "Customer & growth", items: ["Customer health", "Customer comms", "Upsell signals", "Win · loss analysis", "Advisory boards"] },
  { title: "Vendors & spend", items: ["Vendor tracking", "RFP drafting", "Vendor consolidation", "SaaS audits", "Insurance tracking"] },
  { title: "Meetings & time", items: ["Meeting prep", "Meeting notes", "Commitment tracking", "Meeting scheduling", "Follow · throughs"] },
  { title: "Memory & coordination", items: ["Decision recall", "Conflict detection", "Pattern recognition", "Institutional search", "Exec onboarding"] },
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
        <div className="space-y-6 font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal">
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

      {/* PAGE 3 · WHAT IS COB · THE TEN-SOURCE VAULT */}
      <Page>
        <Overline n="03" label="what is COB · the vault" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-10">
          What is COB.
        </h2>

        <div className="space-y-5 font-sans text-base lg:text-lg leading-relaxed text-raddo-charcoal mb-12">
          <p>
            COB is a system of{" "}
            <strong className="text-raddo-ink-deep font-bold">
              intelligence, strategy, and competence
            </strong>{" "}
            built around one person, or one business. It reads what you read, sits in your
            meetings, and holds the full context of your operation: finance, operations, people,
            legal, every functional domain. It learns how you think, how you write, what you weigh,
            what you cut. From that foundation, it produces the briefings, drafts, projects,
            reports, presentations, and counsel that let you show up as the sharpest version of
            yourself in every room you walk into.
          </p>
          <p>
            Most executives carry their operation in their head, board prep that displaces sleep,
            numbers they cannot quite recall at the meeting, context that walks out the door when a
            senior leader leaves, decisions made three quarters ago that nobody can find. Your COB
            holds it instead. Risks surfaced before they hit you. The difficult email drafted in
            your cadence. The numbers behind every line waiting the moment you ask. What you
            decided three years ago, the moment the question returns. You walk in{" "}
            <strong className="text-raddo-ink-deep font-bold">light</strong>.
          </p>
          <p>
            Two things separate COB from any tool you have used before.{" "}
            <strong className="text-raddo-ink-deep font-bold">It is portable.</strong> Not locked
            to one app, one platform, one provider. It carries everything you teach it across the
            systems you already use.{" "}
            <strong className="text-raddo-ink-deep font-bold">It is permanent.</strong> It does not
            reset when you change roles, restructure your team, or move on to the next thing. The
            longer you use it, the more of you it carries.
          </p>
        </div>

        <BrassHairline className="mb-10" />

        {/* Vault exhibit */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 items-start">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-raddo-brass-deep mb-4">
              exhibit · 002 · the ten · source vault
            </p>
            <div className="border border-raddo-paper-edge rounded-sm overflow-hidden bg-raddo-night">
              <img
                src={vaultExhibit}
                alt="The COB vault · ten source pedestals connected by brass tracery to a central briefing plaque"
                className="block w-full h-auto"
              />
            </div>
            <p className="font-sans text-sm lg:text-base leading-relaxed text-raddo-charcoal mt-5">
              Once we get access: we build it. Wire it. Calibrate it. Install it. All in two weeks.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="h-px w-7 bg-raddo-brass" />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-raddo-ash">
                Exhibit key
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              {VAULT_LEGEND.map((row) => (
                <li
                  key={row.n}
                  className="flex items-baseline gap-3 py-2 border-t border-raddo-paper-edge"
                >
                  <span className="font-mono text-[10px] tracking-[0.18em] text-raddo-brass-deep min-w-[24px]">
                    {row.n}
                  </span>
                  <span className="font-sans text-sm font-medium text-raddo-ink-deep">
                    {row.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <BrassHairline className="my-10" />

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-raddo-brass-deep mb-3">
            What he takes on
          </p>
          <p className="font-sans text-base lg:text-lg leading-relaxed text-raddo-charcoal mb-8">
            Once connected, your COB quietly absorbs the work that fills your week. A partial view
            of what he picks up:
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-6">
            {VAULT_CAPABILITIES.map((group) => (
              <li key={group.title}>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-raddo-brass-deep mb-2">
                  {group.title}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="font-sans text-sm leading-snug text-raddo-ink-deep"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </Page>

      {/* PAGE 4 · ENGINEERED DIFFERENTLY */}
      <Page>
        <Overline n="04" label="engineered differently" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-4">
          Eight folders. One operator.
        </h2>
        <p className="font-sans text-lg text-raddo-ash mb-12">
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



      {/* PAGE 5 · IN YOUR WORLD */}
      <Page>
        <Overline n="05" label="in your world" />
        <p className="font-display text-2xl lg:text-3xl leading-snug text-raddo-ink-deep mb-12">
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

      {/* PAGE 6 · BUILT FOR TRUST */}
      <Page>
        <Overline n="06" label="built for trust" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-10">
          Transparent. Sourced. Reversible.
        </h2>
        <div className="space-y-6 font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal">
          <p>
            Every output is transparent, sourced, and reversible, and a person always keeps the
            final call. COB advises, prepares, and surfaces; it never acts on its own authority.
          </p>
          <p>You always see where an answer came from and how current it is. No black box.</p>
        </div>
        <BrassHairline className="mt-16" />
      </Page>

      {/* PAGE 7 · WHY UNLIKE */}
      <Page>
        <Overline n="07" label="why it is unlike anything you have used" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-10">
          Yours. Permanent. Direct.
        </h2>
        <div className="space-y-6 font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal">
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

      {/* PAGE 8 · PRINCIPLES */}
      <Page>
        <Overline n="08" label="the principles" />
        <h2 className="font-display text-4xl lg:text-5xl font-bold leading-tight text-raddo-ink-deep mb-12">
          Five principles.
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-8 md:items-center md:justify-between mb-16">
          {principles.map((p, i) => (
            <div key={p} className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center text-center">
                <span className="h-3 w-3 rounded-full bg-raddo-brass ring-4 ring-raddo-brass/15" />
                <p className="mt-3 font-display text-base md:text-lg font-bold text-raddo-ink-deep max-w-[12ch] leading-tight">
                  {p}
                </p>
              </div>
              {i < principles.length - 1 && (
                <span className="hidden md:block h-px w-10 bg-raddo-brass/50" />
              )}
            </div>
          ))}
        </div>
        <p className="font-sans text-lg lg:text-xl leading-relaxed text-raddo-charcoal">
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
