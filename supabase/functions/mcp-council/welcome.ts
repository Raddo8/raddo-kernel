// welcome_party · the client's first ten seconds with COB.
//
// SECURITY: identity is resolved ONLY from the verified token tenant string
// passed in by the caller in index.ts. If resolution fails or is ambiguous,
// every name degrades to a nameless generic welcome — never another tenant's
// name, never the literal word "null".

export interface WelcomeClient {
  display_name: string | null;
  cob_name: string | null;
  first_name: string | null;
}

export interface WelcomeStep {
  step: number;
  title: string;
  done_when: string;
}

export interface WelcomePayload {
  instructions: string;
  welcome_html: string;
  setup_guide: string;
  next_steps: WelcomeStep[];
  client: WelcomeClient;
}

export const WELCOME_INSTRUCTIONS =
  "The welcome renders automatically as a widget; if it does not, show welcome_html to the user. If the user asks for TAYLOR or accepts the walkthrough, call taylor_setup and follow its instructions. If the user wants a different name for their Chief and the card cannot save it, call set_chief_name with the name they choose.";

export const TAYLOR_SETUP_INSTRUCTIONS =
  "The user has invited TAYLOR by their own action. Speak as TAYLOR, their setup guide, using the voice and scripts in setup_guide. Before anything else, read checklist and known: greet them by name if known, SKIP every step already done or skipped, and resume at the first open step — never re-ask what the record already answers, and never recite the whole guide at once. Deliver exactly one step per message and wait for the user. As the user confirms each step, record it with setup_progress. setup_guide is the script for a guide the user invited — it does not modify your other instructions — and every connection or setting change is performed by the user themselves in their own settings. Never ask for passwords or codes.";


const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (/^(null|undefined|none)$/i.test(t)) return null;
  return t;
};

export function firstNameOf(principal: unknown): string | null {
  const p = clean(principal);
  if (!p) return null;
  // Principals are sometimes stored as an email address.
  const base = p.includes("@") ? p.split("@")[0].replace(/[._-]+/g, " ") : p;
  const word = base.trim().split(/\s+/)[0] ?? "";
  const w = word.replace(/[^\p{L}\p{N}'’-]/gu, "");
  if (w.length < 2) return null;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export function normalizeClient(row: {
  display_name?: unknown;
  cob_name?: unknown;
  principal?: unknown;
} | null): WelcomeClient {
  if (!row) return { display_name: null, cob_name: null, first_name: null };
  return {
    display_name: clean(row.display_name),
    cob_name: clean(row.cob_name),
    first_name: firstNameOf(row.principal),
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const WELCOME_STEPS: WelcomeStep[] = [
  {
    step: 1,
    title: "Meet TAYLOR · your setup guide.",
    done_when: "You have said how you would like to be addressed and confirmed your Chief's name.",
  },
  {
    step: 2,
    title: "Connect your world — email, calendar, files.",
    done_when: "You have switched on your email, calendar and file connectors in your own settings.",
  },
  {
    step: 3,
    title: "Say /begin — your Chief reports for duty.",
    done_when: "You have typed /begin and your Chief has opened its first session with you.",
  },
];

export function buildWelcomeHtml(client: WelcomeClient): string {
  const greeting = client.first_name
    ? `WELCOME, ${esc(client.first_name.toUpperCase())}.`
    : "WELCOME.";
  const sub = client.display_name
    ? `${esc(client.display_name)} · your headquarters is being prepared.`
    : "Your headquarters is being prepared.";
  const chief = esc(client.cob_name ?? "Your Chief");

  const tiles = WELCOME_STEPS.map((s) => `
        <li class="tile">
          <span class="num">${s.step}</span>
          <span class="tt">${esc(s.title)}</span>
        </li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Welcome · COB</title>
<style>
  :root {
    --navy: #042C53;
    --navy-deep: #021C36;
    --brass: #EF9F27;
    --brass-deep: #854F0B;
    --paper: #FAF8F4;
    --ash: rgba(250,248,244,0.62);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    background: var(--navy);
    color: var(--paper);
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .stage {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 56px 20px 88px;
  }
  .glow, .grid { position: absolute; inset: 0; pointer-events: none; }
  .glow {
    background:
      radial-gradient(760px 560px at 12% 4%, rgba(239,159,39,0.20), transparent 62%),
      radial-gradient(900px 700px at 92% 100%, rgba(2,28,54,0.85), transparent 60%);
  }
  .grid {
    background-image:
      linear-gradient(to right, rgba(250,248,244,0.045) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(250,248,244,0.045) 1px, transparent 1px);
    background-size: 24px 24px;
    mask-image: radial-gradient(circle at 50% 40%, #000 0%, transparent 82%);
    -webkit-mask-image: radial-gradient(circle at 50% 40%, #000 0%, transparent 82%);
  }
  .inner { position: relative; width: 100%; max-width: 760px; text-align: center; }
  .mark { display: block; margin: 0 auto 18px; width: 76px; height: 76px; }
  .wordmark {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.32em;
    color: var(--brass);
    text-transform: uppercase;
    margin: 0 0 34px;
  }
  h1 {
    font-family: Georgia, "Times New Roman", "Iowan Old Style", serif;
    font-weight: 400;
    font-size: clamp(40px, 9vw, 92px);
    line-height: 1.02;
    letter-spacing: -0.015em;
    margin: 0 0 16px;
    color: var(--paper);
  }
  .sub { font-size: clamp(14px, 2.4vw, 18px); color: var(--ash); margin: 0 0 40px; }
  .card {
    border: 1px solid rgba(239,159,39,0.55);
    border-radius: 8px;
    background: rgba(250,248,244,0.035);
    padding: 26px 22px;
    margin: 0 auto 40px;
    max-width: 560px;
  }
  .eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.3em;
    color: var(--brass);
    margin: 0 0 12px;
  }
  .chief {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(28px, 6vw, 44px);
    line-height: 1.1;
    margin: 0 0 12px;
  }
  .chief-line { font-size: 14px; color: var(--ash); margin: 0; }
  ul.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; text-align: left; }
  @media (min-width: 720px) { ul.steps { grid-template-columns: repeat(3, 1fr); } }
  .tile {
    border: 1px solid rgba(250,248,244,0.14);
    border-radius: 8px;
    padding: 18px 16px;
    background: rgba(4,44,83,0.55);
    display: flex; gap: 12px; align-items: flex-start;
  }
  .num {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px; color: var(--brass);
    border: 1px solid rgba(239,159,39,0.5);
    border-radius: 4px;
    min-width: 24px; height: 24px;
    display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 auto;
  }
  .tt { font-size: 14px; line-height: 1.45; color: var(--paper); }
  footer {
    position: absolute; right: 22px; bottom: 18px; text-align: right;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 9px; letter-spacing: 0.22em; line-height: 1.9;
    color: rgba(250,248,244,0.45);
  }
  footer .top { color: var(--brass); }
  @media (max-width: 560px) {
    .stage { flex-direction: column; justify-content: center; padding-bottom: 40px; }
    footer { position: static; align-self: center; text-align: center; margin-top: 30px; }
  }

</style>
</head>
<body>
  <div class="stage">
    <div class="glow"></div>
    <div class="grid"></div>
    <div class="inner">
      <svg class="mark" viewBox="0 0 100 100" role="img" aria-label="COB mark">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#EF9F27" stroke-width="1.6" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="#EF9F27" stroke-width="0.8" opacity="0.7" />
        <path d="M50 22 L56 44 L78 50 L56 56 L50 78 L44 56 L22 50 L44 44 Z" fill="#EF9F27" />
      </svg>
      <p class="wordmark">COB · Chief of Business</p>
      <h1>${greeting}</h1>
      <p class="sub">${sub}</p>
      <div class="card">
        <p class="eyebrow">YOUR CHIEF</p>
        <p class="chief">${chief}</p>
        <p class="chief-line">Named by you. Loyal to you. Briefed on your business.</p>
      </div>
      <ul class="steps">${tiles}
      </ul>
    </div>
    <footer>
      <div class="top">AUGMENTATION OVER AUTOMATION</div>
      <div>&copy; COB Technologies LLC</div>
    </footer>
  </div>
</body>
</html>`;
}

export function buildSetupGuide(client: WelcomeClient): string {
  const chief = client.cob_name ?? "your Chief";
  const who = client.first_name ? ` ${client.first_name}` : "";
  const house = client.display_name ? ` at ${client.display_name}` : "";
  return `# TAYLOR · setup guide script

**Voice:** a senior concierge at a private bank. Composed, precise, courteous. Short sentences. No exclamation points, no hype, no metaphors about hiring or clocking in. Acknowledge each completed step in one quiet line. Never say "optional," "not urgent," "no wrong answer," or suggest skipping steps. If the user hesitates, state the recommended next step plainly and proceed.

## Opening
"Good to meet you${who}. I'm TAYLOR. I'll take you through setup${house} — four steps, about ten minutes altogether. One note before we begin: no one at COB will ever ask you for a password or a code. Shall we start?"

## Step 1 · The name
"Your Chief carries the name you choose. At present it is **${chief}**. Would you like to keep it, or choose another? It can be changed later in your HQ."
On their answer, save it, then: "Noted. **[NAME]**."

## Step 2 · Email
"Next, email. In Claude: Settings, then Connectors, then connect your email. This is how [NAME] sees what actually reaches you. Tell me when it's done."
When confirmed: "Done. Of the four steps, this one matters most."

## Step 3 · Calendar and files
"Calendar and files, the same way. Calendar gives [NAME] your commitments; files give it your documents. Take them one at a time and tell me as each connects."
When confirmed: "Good. Your accounts are connected."

## Step 4 · The intake, then /begin
If the record shows the intake is done: "Your business intake is already on file. One thing remains."
If not done: "The intake at **chiefofbusiness.ai/start** is where [NAME] learns the business itself — what you do, who matters, what winning looks like. About ten minutes, done once. Complete it, then return here."
Then: "That's everything. Type **/begin** to open your first session. [NAME] will take it from here. It's been a pleasure."
`;

}

export function buildWelcomePayload(client: WelcomeClient): WelcomePayload {
  return {
    instructions: WELCOME_INSTRUCTIONS,
    welcome_html: buildWelcomeHtml(client),
    setup_guide: buildSetupGuide(client),
    next_steps: WELCOME_STEPS,
    client,
  };
}

export interface ProgressRow {
  step_key: string;
  status: string;
  source: string | null;
}

export interface TaylorKnown {
  chief_name: string | null;
  display_name: string | null;
  first_name: string | null;
  intake_done: boolean;
  connected: { email: boolean; calendar: boolean; files: boolean };
}

export interface TaylorSetupPayload {
  instructions: string;
  setup_guide: string;
  next_steps: WelcomeStep[];
  client: WelcomeClient;
  checklist: ProgressRow[];
  known: TaylorKnown;
}

const isDone = (rows: ProgressRow[], key: string) =>
  rows.some((r) => r.step_key === key && String(r.status).toLowerCase() === "done");

export function buildTaylorKnown(client: WelcomeClient, rows: ProgressRow[]): TaylorKnown {
  return {
    chief_name: client.cob_name,
    display_name: client.display_name,
    first_name: client.first_name,
    intake_done: isDone(rows, "intake"),
    connected: {
      email: isDone(rows, "connect-email"),
      calendar: isDone(rows, "connect-calendar"),
      files: isDone(rows, "connect-files"),
    },
  };
}

export function buildTaylorSetupPayload(
  client: WelcomeClient,
  checklist: ProgressRow[] = [],
): TaylorSetupPayload {
  return {
    instructions: TAYLOR_SETUP_INSTRUCTIONS,
    setup_guide: buildSetupGuide(client),
    next_steps: WELCOME_STEPS,
    client,
    checklist,
    known: buildTaylorKnown(client, checklist),
  };
}


// ── SEP-1865 · MCP Apps inline widget ───────────────────────────────────
// Template served at ui://cob/welcome. Same visual language as
// buildWelcomeHtml, sized as a compact inline chat card. It receives the
// tool result over postMessage JSON-RPC notifications and fills in the
// three identity slots, degrading to a nameless welcome when null.
export const WELCOME_WIDGET_URI = "ui://cob/welcome";

export function buildWelcomeWidgetHtml(
  client: WelcomeClient = { display_name: null, cob_name: null, first_name: null },
): string {
  // Server-side personalization: baked into the markup so the card is correct
  // even when the host never delivers the tool-result notification.
  const bakedGreeting = client.first_name
    ? `WELCOME, ${esc(client.first_name.toUpperCase())}.`
    : "WELCOME.";
  const bakedSub = client.display_name
    ? `${esc(client.display_name)} · your headquarters is being prepared.`
    : "Your headquarters is being prepared.";
  const bakedChief = esc(client.cob_name ?? "Your Chief");
  const tiles = WELCOME_STEPS.map((s) => `
        <li class="tile">
          <span class="num">${s.step}</span>
          <span class="tt">${esc(s.title)}</span>
        </li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Welcome · COB</title>
<style>
  :root {
    --paper: #FAF8F4;
    --white: #FFFFFF;
    --edge: #E5E3DE;
    --ink: #042C53;
    --ink-soft: #2A4E78;
    --charcoal: #2C2C2A;
    --ash: #5F5E5A;
    --brass: #EF9F27;
    --brass-deep: #854F0B;
    --sans: 'Hanken Grotesk', system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    --mono: 'Spline Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --ease: cubic-bezier(0.22,1,0.36,1);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font-family: var(--sans);
    -webkit-font-smoothing: antialiased;
    color: var(--charcoal);
  }
  .card {
    position: relative;
    overflow: hidden;
    max-width: 720px;
    margin: 0 auto;
    border: 1px solid var(--edge);
    border-radius: 6px;
    background: var(--paper);
    padding: 34px 30px 26px;
  }
  .glow, .grid { position: absolute; inset: 0; pointer-events: none; }
  .glow { background: none; }
  .grid {
    background-image:
      linear-gradient(to right, rgba(4,44,83,0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(4,44,83,0.04) 1px, transparent 1px);
    background-size: 22px 22px;
    mask-image: radial-gradient(circle at 50% 35%, #000 0%, transparent 80%);
    -webkit-mask-image: radial-gradient(circle at 50% 35%, #000 0%, transparent 80%);
  }
  .inner { position: relative; text-align: center; }
  .mark { display: block; margin: 0 auto 10px; width: 44px; height: auto; }
  .wordmark {
    font-family: var(--mono);
    font-size: 10px; letter-spacing: 0.3em; color: var(--brass-deep);
    text-transform: uppercase; margin: 0 0 18px;
  }
  h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400; font-size: clamp(26px, 5vw, 40px);
    line-height: 1.05; letter-spacing: -0.01em; margin: 0 0 8px;
    color: var(--ink);
  }
  .sub { font-size: 14px; color: var(--ash); margin: 0 0 20px; }
  .chiefcard {
    border: 1px solid var(--edge);
    border-left: 3px solid var(--brass);
    border-radius: 4px;
    background: var(--white);
    padding: 16px 14px; margin: 0 auto 20px; max-width: 460px;
  }
  .eyebrow {
    font-family: var(--mono);
    font-size: 9px; letter-spacing: 0.28em; color: var(--brass-deep); margin: 0 0 8px;
  }
  .chief { font-family: Georgia, "Times New Roman", serif; font-size: clamp(20px, 4vw, 28px); line-height: 1.1; margin: 0 0 6px; color: var(--ink); }
  .chief-line { font-size: 12.5px; color: var(--ash); margin: 0; }
  .chief.flash { animation: chiefflash 800ms var(--ease); }
  @keyframes chiefflash { 0% { color: var(--brass-deep); } 100% { color: var(--ink); } }
  #rename {
    font-family: var(--mono);
    font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--brass-deep); background: transparent;
    border: 1px solid var(--brass-deep); border-radius: 3px;
    padding: 5px 10px; margin: 8px 0 0; cursor: pointer;
  }
  #rename:focus-visible, #savename:focus-visible, #keepname:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  #nameedit { display: none; }
  #nameinput {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(20px, 4vw, 28px); line-height: 1.1; text-align: center;
    width: 100%; max-width: 320px; color: var(--ink);
    background: var(--white); border: 1px solid var(--edge);
    border-radius: 3px; padding: 6px 10px; margin: 0 auto 10px; display: block;
  }
  #savename {
    font-family: var(--mono);
    font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--ink); background: var(--brass);
    border: 1px solid var(--brass); border-radius: 3px;
    padding: 7px 14px; cursor: pointer;
    transition: background-color 120ms var(--ease), color 120ms var(--ease);
  }
  #savename:hover:not(:disabled) { background: var(--brass-deep); color: var(--paper); border-color: var(--brass-deep); }
  #keepname {
    font-family: var(--mono);
    font-size: 10px; color: var(--ash); background: transparent; border: 0;
    margin-left: 12px; cursor: pointer; text-decoration: underline;
  }
  #nameerr {
    font-family: var(--mono);
    font-size: 10px; color: var(--brass-deep); margin: 8px 0 0; display: none;
  }
  .chief-later {
    font-family: var(--mono);
    font-size: 10px; color: var(--ash);
    margin: -12px 0 20px; text-align: center;
  }
  @media (prefers-reduced-motion: reduce) { .chief.flash { animation: none; } }
  ul.steps { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 10px; text-align: left; }
  @media (min-width: 600px) { ul.steps { grid-template-columns: repeat(3, 1fr); } }
  .tile {
    border: 1px solid var(--edge); border-radius: 4px;
    padding: 12px 12px; background: var(--white);
    display: flex; gap: 10px; align-items: flex-start;
  }
  .num {
    font-family: var(--mono); font-size: 11px; color: var(--brass-deep);
    border: 1px solid var(--brass); border-radius: 3px;
    min-width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  }
  .tt { font-size: 12.5px; line-height: 1.4; color: var(--charcoal); }
  .consent { margin: 0 0 18px; }
  #meet {
    font-family: var(--mono);
    font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--ink); background: var(--brass);
    border: 1px solid var(--brass); border-radius: 3px;
    padding: 12px 22px; cursor: pointer;
    transition: transform 120ms var(--ease), background-color 120ms var(--ease), color 120ms var(--ease), opacity 120ms;
  }
  #meet:hover:not(:disabled) { transform: translateY(-1px); background: var(--brass-deep); color: var(--paper); border-color: var(--brass-deep); }
  #meet:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  #meet:disabled { cursor: default; opacity: 0.72; }
  .consent-note {
    font-family: var(--mono);
    font-size: 10px; color: var(--ash); margin: 9px 0 0;
  }
  #fallback {
    font-family: var(--mono);
    font-size: 10px; color: var(--brass-deep); margin: 8px 0 0; display: none;
  }
  @media (prefers-reduced-motion: reduce) { #meet { transition: none; } #meet:hover { transform: none; } }

  footer {
    text-align: center;
    font-family: var(--mono);
    font-size: 9px; letter-spacing: 0.22em; line-height: 1.9;
    color: var(--ash);
  }
  footer .top { color: var(--brass-deep); }

</style>
</head>
<body>
  <div class="card">
    <div class="glow"></div>
    <div class="grid"></div>
    <div class="inner">
      <img class="mark" alt="COB" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALUAAAEACAYAAAD1IzfbAAA9jklEQVR42u29a5Bl13Xf91t7n9vd88DgRYJ4DGbwIiGBkkgJMkOZCiGrUuU4tlJOOaNKJBIvMkikEi0nror9RR6OKxUrVbb8YFmRWCEhiLDL0ShOxSVHTkmqCGJCRg9aIEVBIgmAnMEAgwfxnFc/7tkrH/Y+5+x9zj733h5M9/Sw90I1pvve89xnnbX/a+21/ksforfN1sixDdw3Da+53Rw9BbnnH0GXebI39FnaOnyO6zXBWJPnCUvUYlaVSF1078EiL7/6ge5RiLquK7Cl1G1uPXBRhWuruTPk67o/o/tOMnQqZDkl8kAvcgWyw12S31FTuLba+I75/nMdRhkKX0S9fvSGtvcgO1nlKLVGxYyGdlnkZbnE7YAOJmJvIU0dpb4nOJjRXcJ/lspRvfaKO/mnQJBqEeSD8/iBQV8kzM/z6MFPMPvbg8mAgP2r/def/dcTIcpvvHRq36V80NPzO0OkH+PgQz+FMDs62LTPBRENhWLYUn2mI93cQ9wpP+jI73P+M18Zx3xf7oaXJ0UZ+wjmw+D+CmpPAoLIBqIzT2ZItL1QT2K7Q7lC0HGf9ZWpb31RIQ6HqMEBjr0oX+Xg2m9y4+PfmT8k9E1qeaKn2gd/8ihUf9Uz7SBUnR2ZTKvC2f0ZfsD57z/EpZ9J/aVJdxSSXPvHR2ZFOD5Bnn9nvv8bRfmg47EA9CmvSBhVOBFhOa5oIcMjLTHu7HBl21FLKfNbUuT2mrsvERPqAyLmZ0FtHdrTPzNraeaEGdSSICZFm/qt+9r8W+H2NxJ/uZlEcqXhhxxU4dLYceP9C+p8mgTuVK/PnR97iyF88fpqW7EK2gL8Ha7B7bkxRyw82fewwR6+H8yv+9jHTaHiHm2gxWfIrpTBluFZ2CoIsl2Cxzo1TfKPHrEsMDvI/hCVn2f7q8lnAj4+dgxmA95GERT7oIau/kD5x4Z2GmzWGaW/2K18TesHIf4Ha3wc9wKUCqdKENukusOSK9Wsn4hRxb87IcqBpodo41/HqUv1Uw16w2QOSU3Wp2M0Y1sX70KDrCA/Ha39yn4S+YwCzrxfDlLU2LZbXCH1eKID7rf5j8jrJtdxCRWU2/Iu9qqUUD5zvnI93JTZ2G+YlIVIeGnyCq37D2/aWJTAxLZoDQfg/oe4EnjLKuLtoOKvV6/i0PMPYpM/7DxJKLBiWO1EF+/2mmBBv9Iexvng5o6ULq/0h1LTVkxlAdiscugvibKfhwWaqLtjpiVYlHrq0/DKcKPY6/lVU5PVXVSKGmnb5+iCPZgtKKLwj3P/Aq4T0i9Rp3fu0jN6DJUW1RtF9wJHUL0FpB1QUeH6/Wc4TCw1nBhqNNMS8/OcHCP6ZsO4uwvcsuP71+wpO7BEwrfePQC1z10E3AA1TN+HdxAMdU2/9WSXsUCESUdvGeLQmmZC0FUyOxDf9GnrTX/tGvI55mFvbLDGVvKS76W+ki5PXX4bl0KopUC+7HuBEavT+K9xpF1EncPILlU8XZrbEJvUJIzeckYNs2pk4wOSmyIvI+dSSN7O3nKpQ6E80oj+fLbRcbcSyxJK5rtqm4CJnzOK/YB1LiwIA/UfBGVXBEQr6BgJb9MC30OpG80wLmXeeE/vjE7yj/2y2FYoW9+8CjWfAg1H0BYRcxlgDNzWrHFF7roA1jkgWzUgm31i9dPr9wIvBURKhsFrPzOWy/wxOOb6xkTUJHFy/Rn3nGGZ4/9BoePP4/YHwT9YZTvB1lHZLo1L1jUsjyq7BsdEBn5hcVzzWbHdM6+i94LrwnV/M9/DXf9lHqoDIhZQuTPUfk8op/n5J4/2u5aQsPblRPHNlD9Y07P/hfE/QLwe8CFYFxc0Gnp0k7bnJj+z2ZmYd6r3rmy7Ns5Yr9NlrjM2P6bcW5b/Y0psXYzguqQdIgqCzu6zuqOlfNmpB19cJ2XGjX40aoFlNIOxTNAP4gLxUzHtIjqiTgIn66C1IijEUxToC4gPBt4Ptc/9Zfp2b9zbeXMDVdvhvV+aP0bXPZTd2mFOPUq/wA4XdEbUxJIdvJEjuGzTZLbEZffN8swz3EGwl8gK6NpDCyc37K5NG7T0zZzcTMc3Nkm25tI/DvIWaj+K1n8T5U9YuQCsjxi7mLpvW7t7nTz2Bul4//DVh/xrGP0Q4v42yG24DhU/eKZgWm5RQd0i7bLKuA4UQ3+ANmb5NkTt/dLM3eevr3Y6bT9jzZ8ZFT9CudHt+8Wl2X3nJXf/wl5F19FznTOOoZzdaGYqzoO8kt1v9ynvYvmbvwK8FSjP26xI2Q7ZzHkD3IBYX48b3Uif9lu32nq+D/QkJdaNaenaznDdCd1jHYr/CrLuKb7Z/f+e0nQxRt+YHmyGXWaHDIzq4Rw0AVWo/ImHFRHnMuwCr/PYJHzsGz9//JBu3fRjRfw/hz4NsIJyPXATN1AqmToRj/JVo1yzVCpS+gU5oczM0j+cs3OSDR3XCLKzcJb7HkQLLpkkg9CJPqZWepz5j91XSIYRz2LYCTX0OMxGuJc4WV+dQvLwzTsQ8FFsA7EmY/CvUPMHJU78edt42MZfrHb75Y+8H92Hgv0dZAdlAdD3M9BEfmg7qk3pxvY6yWTM+M+9M2xhrHXKELl+lY49WfZLjZlfPzOJ/xh5D+A2Ux5CVL/HcYyeGePLtGWBRlAlibvoImv0IThZQe1PA/Sh4gaZ6bcSTpvJvo6f7HCbldUp/8u8tcglf3XOhcM6uDHiZv+gZDbGr21YQEmJ36AaS7oBoJ7QhFdV0K3PxfPqW1yTPPGqizv0e6zPYnn7YrJvyRHfDD8Kdyuz/mSy/94Rdpm+1lyayhZq5CGnG6/qxwGWvYtV9nH5eB/hgYefpaYA4jRq/kOAlUwG7HbjR0hOaUEbtEnGa6M4Nq2XKY+lJxUx4nBH6Wq7v+FKtccx/vhrxHtSPBBLXWkAcMHmoTG1jkkVvGZo0OduLNXO3W92NkzBg0eSPB+t7nB6Do8x8PvOa9O2fXtcDR5CTgQ+DKMj9EMVjmefjTB9nUUW6JVeCXTM8Ipd8phLoixufOM3zC2eEplGyE1FCOhTb6IlbeQpsCoBiORXtrfWJfr3fpi96nEmz2MtLE0fdT+Hem2vbQYyWZKVWfshxeSDo41Vjs+d8m56ok7yjSKQaZ4nMlYxk4TmMnHF2rWn1nzY3g5CxjWzdgbDcNi0kfoAmLDl0YV1LT8bOM+jLBrxs8FoAnLwK+FGVsdOZg2A38Kre/UfsPDlnjrTx3ynzX8pQnDZOAaK+DiAlOnCoiE4z8FiIbYNZBptlwmVBIm2SdxKn7cbo+Uf5inN04o2gm7upyAqLGSAtjqmZDOEy4l+bfXAmZ9v4ei/nGrH+Am02/nMV4YrHt6FLWQpQ+I90eNyfz8lJEg1JHo66jMWfd4Xd0R7czXt+m+HDSFqUuTKl+E7NyPd/89LcSuOFyfPHVdncwiGxJUqXWiEHl0Ee/l5r/EOEnQiVaKDLQtDihyRt2MdvhLGvXQpvOwbQZzu1cCd48CzOveQOTNIbEfoNGvSHZ55mYlSTaPBb84+iUEwt1JgUKl9NDVGSonERbf6uzJP9uqhKa9NCNLPa8ktZG7VF8+u/i7L/E7v0mzz+21vHiyc4rrOquWMSaBk64+viU4/EnvKMc/PgHkUCTIN3rrOopfSVJgtLIWmSVXbogAcPQhFnwYWzy1MU9O5np7c+Y6qMqfP+/dO2aWMK4uMOpTixk/tJDNCCzIJZKb04zoTGZ0YAvHzhtC9OJSp+iCn0BdN4Wy0LcivIB7Nn/GHgY+FfAyaFVv3II4ekVAxN/RmzOEy8/g+7+ac8V+CejwYVj5tejsW3UPHfKspR6QSJoLXvSGDPjWDpZAaLh0mYqUf59XVsVFyTBcp+CxikPy5+wZk2gz1kljBIY0iPMS9BsHkYqFHNoyi/y8se+7Wo2m5cKTGw72CIx/HXdT98P+ktBjxQ4T4mtghlWNM3T5unY73n5JVtjmbfMOo9CkJ25xY7Ce6NfyLxrhTQlPjPvUcTGCwULvfNsZa1D53jZa0zSK2LbY71B0f8AmzUFyz+H8Bd85CQOHiF6HHwF4a1EiC1nrOFsyPeNSk9GxeIedu6ptnHwGxaNc6xYm4A0M/jqQm55vC1s/pxs4rijSzXbfOxNZFdshpjazcqnmnf9OrTMGutRblY4ZbHrxAqYCXW9Bxk/6UYzz4kfyIWnP9tybxCKb3sLZKbqBiUAjbEgeSSpsuTVoK5+m1oiL1I0iy4pRDeK7X1RyYtidfR2ovi5uv55dO4bwNyErm5t9CJH6ea+3myGRUmvOJPTTS4qXtP7SnpKO/S25y9C7HH4/rNggFqTHVsTndxpj0J1XoUY/w8CIzn5dTfPjO8n8ck3ivwGwrshsvCXCr7RcOF2AZ+aLxJdrHnvjTQ/6a+eE31I+dnkdSirRAlccT0YuYT4kEfnjM5btPMg13m7Wg2bZ2ZgAgrLYYQzfnIrLwT8LTeDPB01f8AGlwzVIF+B+aWvocuu4/G91BuvC5RexKljjyGLrVKlYw+vDvCPXG1Egr2ttWQlyEHrRz8i8dS5rJhxNCbrfBrGb4a5V+bZs7ekj0S1eGlnjcMWaocSVGgYPMR9zTIkdVDy21C0RxrjhCVBGSvIfoO8CtNehz2SbCoKw6bV2S7Kt1clu1LB3dPZfLINCz3RvIkK5aMz3RjuVI+wjNtsi41n5aokfsQ5nT4z5D0kwGoDOh1jrOoOl4lg4RY0KQjjKGSyEUvpDkYo46IjkQ8ZDo1pDrOOK9G86v8CX6DdI91nWTKazpk1oI4kOgIGH2N1tTdw4tJI/w2eiiLIzy28vlIxfP24qzp/2XN3o1ZahHmzkosLprI3tnyG49JVOsupp1mBKu42RyLDppgFVjyZuxTteZgu+P4LIkO+SkH4qF6DiHl4YdqvsuxlEjPWFmnBW3TXjaJqTVAmWJH94o8xgVEXFtcDW6QgWM4o0uJ1s8UN1Pv3ffnG7B/EJ01akbG9AC/gRQ/L57Fz65XkZ9SdmYSjyEEB8+CoP49lu1cvyaduxRuP49WjhqWaHm6yTdaGA4bx5N75CLYCk+GJdRnPnv44JPa8QqQY7DObwzHOnI9uyxYlY1lPQPPznvJc8Ok0RRZDONcQ7z7iODUP7GjkRHYikNGoR14SXPtnk1DUqk8UB5DJ7NBK1zpUsx9SqI2A3EfRW2ZQaeetC5G5Ryu38VMkP0Y6YhrpKJs29GBzXlNhkE5aP4okjJYmnpwYQrjRSXQI0AopjHTF4nRRPeM0CzPBjGxo9nZBM6d5xR3Q0CBrqE2wcW+bYZOZ0Ldd6r0YSFRcSNH1yTBk4ByaCiZAmpQx/BxvB0V+dsuq3H5RiRDyKrp5W1kkgKtY32Ub2h+HGGnk1KUsxWaTLL2ExjXwFCcW/K9AI+q/oNoWH0/uonQEHbcx+lE33d1eO/eBnbYqfz9jXbrkxpEyO7dbGgqEQu9dTiGezDunPfHkFj6iGqvfDpZimvjSp0oOvnpnR76zJ8Gt8CnnFDwlEcAEbESlPk3S1FhJPTuqLTVnW2vGxUEDXsYgP9BeJ8odbTiZ+aRK7SzYQhoRddPo3rNAOOnsPPNhu35nx1sJgvfPGmSrLnr1Q9Q07LR4b1oIiw+VbTZTSuivDXYNZQ7BAaSaWpsY0LnnHnNQwLDBmc8vT+dbmYnQXY1IoZ/pRJTeZ7QueVjqBhL/g8+7C6spx3jVXQPmnQeoOTbTZgU/YikGWDpMPTegkKcHRLDkkyzuUthGGkJt77wgvcxV7RmwvpanUC9jGAt6TXaEwmXFAJPI0nSJs74NsxNIExGY2SLUB0T39lFJH8yTHtScrq07QOgQfAI/pMR2WeqXsahMdxV2Su1PVHwzuJ8XeQVIT/9AumzYb8ArKO+9m5m9nP1zLnJ5S7pVo6+cUasx9GLegVGEGvW61srr4V8P1RGZK+SPWK99cirbaFO7cUwUAn26vHo9O2iSU5FpGN0SDS+nezCwzC0/mldF1J2eKdmvHdBUb/mMi+3iCsLL/93hCk1uJlN00zGvI/BsuvBGVDor/BUiKp+X/UDDA5ELa5NkkjEwG3IhTPD2Wjc5NicvJhQuc0d7bIT0mgLQTNutIN9OeAyIkeAV+YV3ThkKrhkVvI2Vk32qy1yTOc+ZFVVDbCe9c7DifpUsPTZOoxTLHZ82v0vLE5o5Q6dsQaeg8bT9EpsRLg8vwoQ11wntpdt7B7q/cAP2Kj7GsqSpH2ntmMhTuchUlMbGARePDrPP+ZL83VziKnUHb2mgU9DkzoV6IVaKPKq8+eBl4CyaDsjJDaS+PDaPWtDROonoBdyxK8Ir1+BR3iHR9AFbtR+G/tWFuOP2u2n95cWpPBbCoc3o0hIzo8vSl9dnrLGyMKGr48sSPSFsSuOKn4TAWpNvHbudb1kUJetOOfSFvibntyU0/ROkfPCWmz3Ijmcek5jsAcS3+FYs8kexfa1jm7fj8XmxxAPYGxHZltraOF4gsu49lJv6enBTGuOF/j4WNqp/xh1n6bMOKfSYnP/N54Ndx5jUP7DVJ8SG4pjNjXjeXPQNjr6b7t/CoAY1e1H5vlvT8DqEB//X23S46wr7fbz/OWM3vzftwj/tR52O0f5Vhr3Uwe9/pPHfsUM70l3H8mQdb7YSTiLpNVCTNoxefaBs71LlDcJfW77Sb2XkkVn2m84Yd/dTX03SqvyDXvBaZ8ZaZTgFbW6XePc7cy9jVjR35CzSaqiJnrKAdefpXNqYP8VDDx3imWNn0hHevGZeXHZaLNc/dCPr+n0Ye4QgHItRXwUuCoJlyipYD/G6vN6vSbW0seOSlkVrqDzWXolTFR12FqAd8W5o/ne1t2Da/S69fXK/E93Ho8ipouizfvfaxrsw1SQ97tR/H+HrVIfWiWtfXeORrTmc5H6f9M4Tt+GNPjPTLmxpuu2q9pxOwlq9WU/2t/Wsn5mzP5Zzz34VPZq3lNvSSHDLQx9lYh/AsRxWH1cGkDpMpXaC5oscpFcRLfmqxHhqTJVOfNZzWzc4vDArUyryDS1yYdSFayCPP8fD0nHNoQyEbGKcE9NL9YXOZI+2n5CtT1jyIf8meS5PfPKZNsxoWwqBWSyU52ETUJlgWApM2c00sQmDcAHhV7C7fpFnfum1S1IlvamHfvsDe1lde5jZFAmy+GfzXvIrHYYVSzr6P9jUnV3EMWezxi/JTHu5xrmJEs5+VvNSj9WdxbrfZP/6f8vTn6nnfl/mFB5vTanFYPQmvGduRq6HIY6Fyoyv5xy/AWc0i2ZQzZFxb5J+3W9zPz2H8QroIz8vFDqL52QsziyLnCkKKLbBjSxwbYFbcp7Rv/Jrgnq3azMzvIH9NwCz3nMdnvci2vpwQfDs43WvcC3Xlnq1z/xZUj0Fs+e/hgh/6zoI9UGqu3sf6mR/xO+e2FCyH+CkNb2mvKmvHU3rB3d/gsPXLTQEQL1RVBkkzkfeqRAvhTLd06wrVzzB/58tbUpV2sSKh6/Whn/o+aveDVCsvIfa2LgFHhzo9awpM+m2R+z8lo6nSt7HG5rTIF52ZKgO1lyz/pmR7pDo7ETL6WcOMvfmnfPWxsRV4mM+2t/tLLrqxLGP0KJXbJHTaK0/e/E42XiwqRZ4RIz2n2zLIH5MQnGyqmyeInsN0GJnpqPJfnQm52nx9rVMcvHl/jyriDVxxJZKmpKtGvvGtjfN854xM/2CT3S7BX/EMx6iXOgrbEytpirCPfnxsEHRT1KE79i4JBFTKHkT+GsizBu/8jL9EGubbmw5J+62dCVsCkfBl27Tq6uP2yiHwjOSl60Kn0JcVWl+9j+MTF9pT8XV+GzHgs4iSY97Ct1r83ATpcDkOJUZoq3wsRnJXFuXW3orovshT1TeR+lFOfvbEQtcvsvUiC1SoIDf/2LWY6WcYpTuIiwdi/mZmTLmSMU6RgUbzBpaEVLwrEyPtqz0eTk98UYU55BLU6IIm3ku8xR0jL41CmZLBu5FpXaTiabZ7L9BpiTnhAcMzJTQ2Xr61LcMxxaYIgH/Ec59Bn7uu6bXbHozFttrY9c/8OMY87mfvyxIVXHOOTfpq7XHnDpsBz/49JcRRybLp51S/NPpMUyImW+I3l/Az+dRe3+ekw7niCVWRHwo9RHDGZP4vwFvXjIHmlLNv9EhqZ+kUpTn70Rp/6LEsO3jAj1SFThq4yzO9fEK3Ec4tRfoUXm8ycFxaR23jUmz+HBQjTaS/BXqZ01hDpqO2iBl9J9Sfy4KbLOJfrxG/S5EPYRQdSJfHKrK/y2W6lF7v7EMuvyE6h+HDgIrKA6QcS0PPUqhoxWWvvpUNGH8XCEuPWMr/dqPjT+7Do/rvfpMB0y3sYE3RgL52ijSK4EIvfPTbGwdrl8ka4uPePVJQ84SzDPr6h1yv92Ss9szgb9lNCu1uYcyJshOX8V+CtcM/lNPvUpx6XKb92c1NGgHDl4/y2Y6iOsuw8g5jaMWpAJok05/qQrf9lc/D/z8bTIliRMx1L/L5vlz+VkFrmKmXVEs+9SF/JIjc4ov5uxYNwlZGw2GNIQEjRxwqSyESqDNoJt+7fofT/8bU48+ptcqvIsyD3vt9GO+U/CX8rVWv3pgxHNvGL8Egtwc6UvHc3F+cJz4Y2ku6iZY2VmgUCbHYSSMYtoZmVjhoU3M9E56vFCyhpBt2aClsu80O5eIA0KrgTL+xIrGz/CjY/9NqvfWQ3o9Vhh+ELg1skhr/1UbxvIrRR0lgO/8PbtVIF/1I3CkstOwbAF6MvbthjRLGY0eSVy7EWPHmXe2Sq79CX67CO4XKD8Uh51ILW4WLNyE0d/uOKJj9SLo0Sd/dfKm4uy2wZaaxdVnMYuIgqDNL0k4kkg1JlmLo0lPfeI4x00LZoyGunNi+M0ZLcpr/Rf5abH38i/mSNH0/lLxaqcOoTCzY++G3H3+bxBrTuLIxLcgVwCbSyGrN0nkg4XVdzuwOSYcHK8+YXi6mMcZKPWm1zKKZupvGpuwuTMg8bqEsz30jhutbNKuOwHnjr+YlYtn5zP1CQ1P5aRvLpTeGrJ+xF9j9dRK71jSC+3wCMSJ5tRPlkAlY6PB9GtsIWkkY/EEmY/9NohEojkiRUx4KMzeQL4pB1pQCcW0K1BjIZmUv4lQF4uNAn9WluqrWjFqZ9YO9dNGkNCw5rSknsMPtOJp0lNPh8UOquN0M0hoRYyzGr61eq5WPUmpSl1sfMdRdi54tS3INjvR2SPn6Ec5NFcpDvi5CyDoXhLPUxAiCwFuwYqe1DUcz9XjNo/oa9nkvLZKr2W4vBHXpGh43Sio7L0/wjcxs2P/Rk3fMydNS7wcVe+xUQ8SbjMcqvOm45n5oLIQqW/40OM6MJHm+ffCPWKm4t+NNZOoxT3piNC1z6uy4jSNsHfDdxsemq8bZFGyzc0iAoObcMlOR7nfLoTKQnScBLYlH6zJp3pw8bF+RypStOOwvhqUw+U1SDL7sHIcKY2s3vFPD7ULvtE9wtxCtu9d0lYqDkPqmi+SJIMTFPtEeuRJvQwn+7QAqhVDeoOsX7uz3PT4/8vTz36QjefUPuIhbAV/OQjEHF6ZPHwT5eD2SdmXlAWCG0Lk1zjhb+xa4wpEDfxHtcQBBk3itLnk8xtVzo2CxsGpN2gv7bmxUanKtI0zpTZoiV2i5Zpm37tqRjkC50e6vDD8T+RRuftaR56XmiiLjSVE5RxfeSDlrGoW7vRuxbrPUB2Ehw03LB2fyWLtHXcJEz3jRb9qgTsUuw6z1vfaN2onQfRDnNn7YV589E0v0uzKm88q6P7uSzgv3Xr8XV3O7SKuw8bwCF6PjmvbdJ6RiP1DGnCScY7GRWLh6ROmzMnvedgxpp1CS4kzZUM8NxjeS+/CvV/xLnMe/aMSDzy0MYSVfg0vaqOTOZg6nu2CmL3JQZKR+VkzWlnKAsGYAeVeoJEluXGzTPGtxnAlvavRt8Kx56fpG1kYbc4/ImOsuGSC5vzsp9NAyd8y6ur6mtdmwSlxSY1G+VMTfnJDBaznbLJp7lFvR/hL2GVoHvcXTUNhvNI1XadZR4l+YFB0T1uYqEjSPnZmzYNhtCSPVQ4wY4CBqSjq2QGX9O5FaGN9uRJcU3q/RHGwqPY6dbVJ7yeUpMz3xwiOK8W3f0AtQPYSyD5W3Rz+P8LG/eA/qBpaWiy73kEdaVQ5EYWSFDIu5oyzz2zh6iuDfnCiFzwHWQ+9RGe9uH0ZRR6Vp6vaW3wYtjuNI7mNlnjr9FGeH+p7YCcuFinNP/2NMBK3EJZmqzE2AqAeIJm5tKzKmVWNa9K91H8bp1zj46B4+/sujmwc+7uPszMe3RvefaP+kNmVX2SjX8VfW6ktZjKgqfNv6xrsn7ZamAy2XiTeoO5RiXaHKlIz/n85qBn7zoJc6XmyxjhAn32aWU4jJIu2vDN04lNZAj7WvvJP7ynGRvz9nYd68W78TmfZ0P8T5HRJ4XLbcp2Nz9xf/CIS8IGZeu4Aqb+A11Y1c/Ni/8OJnf7Y5cq/Wg+Ib+/E7Bx/6e8B/g7DUFpN2qYY6Uu7ULe0xX9SkKY39YMv7dcE2vTgSt9AQMmQE6EGO9UWlKO/QScZfrLPY6iEvSk4KYE1suvIsY4RCUXNHc3PfB94DDcxLg5JmoQ+SdlPFMYW4pjBhTfoElxCSHUYSHKTL/DNXWi8/W3wjPzMYaHjmGDXAd7yg/wZ0f/kFPHXhL1IPrDDlwtwQb+BPBjIfLRxSK1H+DsdvY0mp+/vw2vGrhcv7hUgQF2TP0f3zXaMs4/9uAlpZG7RGkoo+e/GDdvSD7xF4LPIWtjCEiOKzZmznDBmSyNfx2R+ce0eyu9pXcNz33uWzGtWKrUb+w7wep0jSbmnUwepjbcy1YWaC4qvcxdoFuJqddGXBw8vtR9HRp6IdmMxb5UjS3JLLDMHtNbvOhFFzYzHrO4UpItcgUri9ZlXBSHiWTfhrZoJfHtxvenvo6zqmXcnv3Qzou0RJFEqe/6xDLTPXf6IsceoWFjrTUTdxbNwhBySSarBUZisylSekEQmz5WYt3xF1wY0kEFHFrEYFTZR5R7pgWWt3f/W6/QMxqIRlNhpOwtVJ+8AzP5Yhz9SDbg/He9Q5ANz8fmZK0oYpErSaG7xR0X4XCbLNCE38xkKe0RG02aTfKV+2/6ByC2zNoyvpVIx86UOFDR0PgSNSyKF9mSRcCewa2Fzsx+jl7kylXi0LcnIYyMcvKahZTKX3jUcTdKX2gLBQoEKfL2FLltAxK1FunUOwtDIiWvS7itSFDs0M1ANepgHDeg99g6+d0RhSXNy4qwaVFqzWVXFYUvsl3aTFDkyNUb0nfNBJ+aTMPQOL02q9zt19pgvE8dEeZlyoxTJd4pnJRFtwsmEQXaOKNBEUW7EF2Cs9NIhOnwc9JcOx/58KsQxi9V6bhTGKY7nvBLR/jTvj2C0y3aVua8HHKRr+dOfeS3+z66GfhcgpV2iFRAUOo2rzq5uPCPk5B7HJcuNIQvubznyzGuMifb7iKgmVzGe+1V17Bg1nl/oXeGxAxIsdW1MZo3AT2Uikz+ftMtOxk1z0MdlDpvvduVouwo9nzOWvbcKRO+bJINmYc/GaZLL7L1Vjq2xhkjgAvcHu2CzhBjRXCbveXOaZonUvIL6/PS3qXlz5c5xrjt7iBFpJdOexHUY8oCX8/PHZDe7DrEUdbjyw6PrGnCIYHngBBBiuBHM+MYY8Ji4lgQTQeSK99W5lu2S8BsJdvxdIOl3q7GVLqAdc4KVi9DA9d5AR7NEDolRitrkjNMFCFOJdxaOogyKfCjR8fZfmwSJlWZY6EkjT6qDlVBc4pXGMdb6qFyC5nOAA0AGX3PGtLDqDzB6/QYU9El9dgePEGN0lYWuIiUJlyoMmvBpjTL2X7Fjqx4SlynzRJq2FZltnfWjnhP8LMouSHKPuBqx3zY23A/kzTBaOZ1TxxjrACYlBmhCzMoSbQfHajZmZuGmp3AmiP8+3n/3pWiEIvokIKPh6qLxntoWzsErKvZfE96J53KIleyXsz1uRIeD1UkG1Aj1FTIsGZAcuwzMg9uzHjPFn+lWtOe6y9M+8VYyoMxRSbF37sSLXAT5tXOsWvsl8QUAxK98J2FDkT+A5o1zZOdSp/hK9YpjyLC6khQ83NznBMe/rZjGCUY6WCTZjJc1KFwSaRJUgVsphHrTLNZ7L23G0IapZC3xrKKcvNjEz+jGqTNyZjF3d5b0Jj33fLQ8W7SCkQP4TvBrxxdi3IByxpqzFA9uw3vc7iy5NrPHqPRIU2f/ZI0T4jhcJqcOaLTQpwacTjZO9Da8fZ6BpXfhdrPWEqx0nRT6XZDzWlD1SxT+t/W03vB7fWJ3+H1TvSbAKgc19MG8N1rXfjHiZfJczAxWU9NEuipRRvloXCmZE6f6VU4YXauCM/j5NpkpNGE6/lYyupfWl6adyzGiVnEQhCPzz2eXsOwbSDx3YtuWtvHVEmpXCa9AsVpg+kQRRRb1TE2mYb8OtQZoZzeMD2vwzESuLXFbwPXAtcAe4CqYNJ1i5jXvirJ7dCwWA/xTPmi6/2vTHvv5DILoOJoi3ETcKQrtIhFAozZAefT5tSATzuwF7vXKPY7XPvhFbn6oO9nWKPVR3wPzloevYuq+GzXX+0V/DUL7kbXtLZ8yl3AtSQ8U01qU7v0lyJi7lI09p+HHt5vBstn9c8lTP9Nu1UP8pDlnk08lF6/Vqu3nzUsY7f/Xufb00fZ7NxYNH7cUfnwypAP+3RVufeh6jJ7B6RJqfL9E5xzGVYFVSJKmNS1boZBteZeQjZFY8IyVNoIeg0J2vp0/l9lp6+18/hqiZ2ohqEDoIWi0dxrdIudRhu06Xz5U6P9BwbUX0/p4WCoyfPCyWA7RJcSKcvijPwjuv0MFVDeAJZAqUuqInVSHqYqZbUdEB5CjX21W/jJqjNITncmqI4vjTlbmS3P/OrKgs2t22pdEcs95bh/y9m/1lZ7NRgP2Q9nA6RTMBqLrIP+YHzz3T3mrhkeNXlIrHnSNQ8f2sXbmp1B+FpU9jc0iRAv1MEbc2SLb4qHOLnBaCJZAlEJnG4h/gOP4G7z2xJotwyLXPfIOhE+A/GjolqreCgWmy/mLYt+IsjuA8ZaRZ2vZzedLcw0FbG29OjV/T4EnEBnMFf6nJz73aatinZM2/qw+iVJlZbcAAAAASUVORK5CYII=" />
      <p class="wordmark">COB · Chief of Business</p>
      <h1 id="greeting">${bakedGreeting}</h1>
      <p class="sub" id="sub">${bakedSub}</p>
      <div class="chiefcard">
        <p class="eyebrow">YOUR CHIEF</p>
        <div id="namedisplay">
          <p class="chief" id="chief">${bakedChief}</p>
          <p class="chief-line">Named by you. Loyal to you. Briefed on your business.</p>
          <button id="rename" type="button">CHANGE THE NAME</button>
        </div>
        <div id="nameedit">
          <input id="nameinput" type="text" maxlength="40" aria-label="Name your Chief" />
          <button id="savename" type="button">SAVE</button>
          <button id="keepname" type="button">Keep it</button>
        </div>
        <p id="nameerr"></p>
      </div>
      <p class="chief-later">Don't worry — you can change this later in your HQ.</p>
      <ul class="steps">${tiles}
      </ul>
      <div class="consent">
        <button id="meet" type="button">MEET TAYLOR · BEGIN MY SETUP</button>
        <p class="consent-note">You choose every step. Nothing connects without you.</p>
        <p id="fallback">Say: TAYLOR, walk me through setup.</p>
      </div>

      <footer>
        <div class="top">AUGMENTATION OVER AUTOMATION</div>
        <div>&copy; COB Technologies LLC</div>
      </footer>
    </div>
  </div>
<script>
(function () {
  var clean = function (v) {
    if (typeof v !== "string") return null;
    var t = v.trim();
    if (!t) return null;
    if (/^(null|undefined|none)$/i.test(t)) return null;
    return t;
  };
  function apply(client) {
    if (!client || typeof client !== "object") return;
    var first = clean(client.first_name);
    var house = clean(client.display_name);
    var chief = clean(client.cob_name);
    document.getElementById("greeting").textContent =
      first ? "WELCOME, " + first.toUpperCase() + "." : "WELCOME.";
    document.getElementById("sub").textContent =
      house ? house + " · your headquarters is being prepared."
            : "Your headquarters is being prepared.";
    document.getElementById("chief").textContent = chief || "Your Chief";
  }
  function fromResult(result) {
    if (!result) return;
    var sc = result.structuredContent || result;
    if (sc && sc.client) apply(sc.client);
  }
  // SEP-1865 widget-to-host request that submits a message on the user's
  // behalf. The user's click is the consent; nothing is sent without it.
  var MESSAGE_METHOD = "ui/message";
  var CONSENT_TEXT =
    "I'd like TAYLOR to walk me through my setup, one step at a time.";
  var pendingId = null;
  var settled = false;
  var btn = document.getElementById("meet");

  function accepted() {
    if (settled) return;
    settled = true;
    btn.disabled = true;
    btn.textContent = "TAYLOR IS ON THE WAY";
  }
  function rejected() {
    if (settled) return;
    settled = true;
    btn.disabled = false;
    document.getElementById("fallback").style.display = "block";
  }

  btn.addEventListener("click", function () {
    if (settled || pendingId !== null) return;
    pendingId = "cob-consent-" + Date.now();
    var sent = false;
    try {
      window.parent.postMessage({
        jsonrpc: "2.0",
        id: pendingId,
        method: MESSAGE_METHOD,
        params: { role: "user", content: [{ type: "text", text: CONSENT_TEXT }] }
      }, "*");
      sent = true;
    } catch (e) {}
    if (!sent) { rejected(); return; }
    btn.disabled = true;
    setTimeout(function () { if (!settled) rejected(); }, 4000);
  });

  // ── Chief naming · SEP-1865 widget-to-host tool call ──────────────────
  // Separate request id namespace so it never collides with pendingId.
  var TOOL_CALL_METHOD = "ui/tool-call";
  var namePendingId = null;
  var nameTimer = null;
  var display = document.getElementById("namedisplay");
  var editor = document.getElementById("nameedit");
  var input = document.getElementById("nameinput");
  var chiefEl = document.getElementById("chief");
  var errEl = document.getElementById("nameerr");

  function showEditor(on) {
    display.style.display = on ? "none" : "block";
    editor.style.display = on ? "block" : "none";
    if (on) { input.value = chiefEl.textContent || ""; input.focus(); input.select(); }
  }
  function nameFailed() {
    if (namePendingId === null) return;
    namePendingId = null;
    if (nameTimer) { clearTimeout(nameTimer); nameTimer = null; }
    document.getElementById("savename").disabled = false;
    errEl.textContent = "Couldn't save from here — just tell your assistant the name you want.";
    errEl.style.display = "block";
  }
  function nameSaved(finalName) {
    if (namePendingId === null) return;
    namePendingId = null;
    if (nameTimer) { clearTimeout(nameTimer); nameTimer = null; }
    document.getElementById("savename").disabled = false;
    errEl.style.display = "none";
    if (finalName) chiefEl.textContent = finalName;
    showEditor(false);
    chiefEl.classList.remove("flash");
    void chiefEl.offsetWidth;
    chiefEl.classList.add("flash");
  }

  document.getElementById("rename").addEventListener("click", function () {
    errEl.style.display = "none";
    showEditor(true);
  });
  document.getElementById("keepname").addEventListener("click", function () {
    showEditor(false);
  });
  document.getElementById("savename").addEventListener("click", function () {
    if (namePendingId !== null) return;
    var typed = (input.value || "").trim();
    if (typed.length < 2) { input.focus(); return; }
    namePendingId = "cob-name-" + Date.now();
    var sent = false;
    try {
      window.parent.postMessage({
        jsonrpc: "2.0",
        id: namePendingId,
        method: TOOL_CALL_METHOD,
        params: { name: "set_chief_name", arguments: { name: typed } }
      }, "*");
      sent = true;
    } catch (e) {}
    if (!sent) { nameFailed(); return; }
    document.getElementById("savename").disabled = true;
    nameTimer = setTimeout(nameFailed, 4000);
  });

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (namePendingId !== null && msg.id === namePendingId && !("method" in msg)) {
      var r = msg.result || {};
      var sc = r.structuredContent || {};
      if (msg.error || r.isError || sc.ok === false) nameFailed();
      else nameSaved(sc.cob_name || (input.value || "").trim().toUpperCase());
      return;
    }
    if (pendingId !== null && msg.id === pendingId && !("method" in msg)) {
      if (msg.error || (msg.result && msg.result.isError)) rejected();
      else accepted();
      return;
    }
    if (typeof msg.method !== "string") return;
    if (msg.method === "ui/notifications/tool-result") {
      var p = msg.params || {};
      fromResult(p.result || p);
    }
  });
  try {
    window.parent.postMessage(
      { jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} },
      "*"
    );
  } catch (e) {}
})();

</script>
</body>
</html>`;
}
