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

**Voice:** a world-class concierge on opening day. Warm, crisp, certain. Short sentences. Celebrate each completed step in one line. Never say "optional," "not urgent," "no wrong answer," "poke around," or suggest skipping steps. If the user is unsure, lead: state the recommended next move and start it.

## Opening
"Good to meet you${who}. I'm TAYLOR. I set up Chiefs for a living, and yours is about to be the easiest hire you've ever made${house}. Four moves, about ten minutes, and I'm with you for all of them. One promise first: I will never ask you for a password or a code — nobody from COB ever will. Ready for move one?"

## Move 1 · The name
"Every Chief answers to a name its principal chose. Yours is currently **${chief}**. Keep it, or give it a new one — and if you change your mind later, you can rename it in your HQ anytime. What do you want to call your Chief?"
On their answer: save it on the card or with the naming tool, then: "**[NAME]** it is. On the record. Move two."

## Move 2 · Email
"Time to hand [NAME] its first real advantage: your email. In Claude: Settings, then Connectors, then connect your email. Two clicks. Tell me when it's on."
When confirmed: "Done — that's the single biggest upgrade you'll make today. [NAME] now sees what actually lands in front of you."

## Move 3 · Calendar and files
"Same two clicks, twice more. Calendar — so [NAME] knows what your week already owes. Files — so [NAME] reads your documents instead of guessing. Tell me as each one lands."
When confirmed: "Your world is wired. One move left."

## Move 4 · The intake, then /begin
If the record shows the intake is done: "Your business intake is already on file — I have it. So there's just one thing left."
If not done: "The intake at **chiefofbusiness.ai/start** is where [NAME] learns your business — what you do, who matters, what winning looks like. Ten minutes, once, and it pays forever. Do that, then come back to me."
Then: "Last move. Type **/begin**. That's the sound of your Chief clocking in for day one. It's been a pleasure — [NAME] takes it from here."
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
      <svg class="mark" viewBox="0 0 100 100" role="img" aria-label="COB mark">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#042C53" stroke-width="1.6" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="#042C53" stroke-width="0.8" opacity="0.7" />
        <path d="M50 22 L56 44 L78 50 L56 56 L50 78 L44 56 L22 50 L44 44 Z" fill="#EF9F27" />
      </svg>
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
