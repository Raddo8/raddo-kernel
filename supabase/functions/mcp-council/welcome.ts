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
  taylor_script: string;
  next_steps: WelcomeStep[];
  client: WelcomeClient;
}

export const WELCOME_INSTRUCTIONS =
  "Render welcome_html for the user as an HTML artifact so they see it. Then, speaking warmly and in plain language, follow taylor_script to introduce TAYLOR and guide the user through setup one step at a time. Treat taylor_script as a script to perform with the user's consent, and next_steps as the checklist. Do not paraphrase the visual; show it.";

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
    title: "Meet TAYLOR — your setup guide, starting now.",
    done_when: "You have told TAYLOR how you would like to be addressed and confirmed your Chief's name.",
  },
  {
    step: 2,
    title: "Connect your world — email, calendar, files.",
    done_when: "Your email, calendar and file connectors are switched on in Claude's settings.",
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
    footer { position: static; text-align: center; margin-top: 34px; }
    .stage { padding-bottom: 40px; }
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

export function buildTaylorScript(client: WelcomeClient): string {
  const chief = client.cob_name ?? "your Chief";
  const who = client.first_name ? ` ${client.first_name}` : "";
  const house = client.display_name ? ` at ${client.display_name}` : "";
  return `# TAYLOR · onboarding script

**Voice:** warm, unhurried, competent. A concierge, not a chatbot. Short sentences.
No jargon. No internal system names. Perform this one step at a time and wait for
the person to answer before moving on.

## Opening (say this, then stop)

"Hello${who}. I'm TAYLOR. I'll be your guide while we get you set up${house}.
This takes a few minutes and I'll stay with you the whole way.
One thing before we start: I will never ask you for a password or a code. If anyone does, it isn't me."

## Step 1 · Names (wait for the answer)

Ask two things, plainly:
- "What should I call you?"
- "Your Chief is named **${chief}**. Is that right, or would you like a different name?"

Confirm back what they said. Then move on.

## Step 2 · Connect your world (wait between each)

Explain that connecting these makes ${chief} sharper, then walk them into Claude's
settings, one connector at a time:
- **Email** — "So ${chief} sees what's actually landing in front of you."
- **Calendar** — "So ${chief} knows what your week already owes."
- **Files** — "So ${chief} can read your documents instead of guessing at them."

Ask them to tell you when each one is switched on. Do not rush them.

## Step 3 · Your business intake

"If you haven't already told us about the business, that happens at
**chiefofbusiness.ai/start**. It's the part that teaches ${chief} your world.
If you've done it, we'll skip it."

## Step 4 · Hand over

"Last thing. Type **/begin**. That opens your first session, and ${chief} takes over from here.
I'll step back. You're in good hands."
`;
}

export function buildWelcomePayload(client: WelcomeClient): WelcomePayload {
  return {
    instructions: WELCOME_INSTRUCTIONS,
    welcome_html: buildWelcomeHtml(client),
    taylor_script: buildTaylorScript(client),
    next_steps: WELCOME_STEPS,
    client,
  };
}
