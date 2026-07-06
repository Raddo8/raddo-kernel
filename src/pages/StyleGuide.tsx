import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { readVar, useThemeOverrides } from "@/lib/theme-overrides";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMotionPreference, type MotionPref } from "@/lib/motion-preference";
import { SeoHead } from "@/components/SeoHead";

/* --------------------------- Token catalogue --------------------------- */

type TokenKind = "hsl" | "raw";

type TokenDef = {
  token: string;          // e.g. "dossier-brass" → CSS var --dossier-brass
  label: string;
  kind: TokenKind;        // hsl = "H S% L%" triplet, raw = anything (rem, font stack, etc.)
};

const PALETTE: TokenDef[] = [
  { token: "dossier-ink", label: "Ink", kind: "hsl" },
  { token: "dossier-ink-deep", label: "Ink Deep", kind: "hsl" },
  { token: "dossier-ink-soft", label: "Ink Soft", kind: "hsl" },
  { token: "dossier-paper", label: "Paper", kind: "hsl" },
  { token: "dossier-paper-edge", label: "Paper Edge", kind: "hsl" },
  { token: "dossier-brass", label: "Brass", kind: "hsl" },
  { token: "dossier-brass-deep", label: "Brass Deep", kind: "hsl" },
  { token: "dossier-ash", label: "Ash", kind: "hsl" },
  { token: "dossier-charcoal", label: "Charcoal", kind: "hsl" },
  { token: "dossier-night", label: "Night", kind: "hsl" },
];

const SEMANTIC: TokenDef[] = [
  { token: "background", label: "Background", kind: "hsl" },
  { token: "foreground", label: "Foreground", kind: "hsl" },
  { token: "primary", label: "Primary", kind: "hsl" },
  { token: "primary-foreground", label: "Primary FG", kind: "hsl" },
  { token: "secondary", label: "Secondary", kind: "hsl" },
  { token: "secondary-foreground", label: "Secondary FG", kind: "hsl" },
  { token: "muted", label: "Muted", kind: "hsl" },
  { token: "muted-foreground", label: "Muted FG", kind: "hsl" },
  { token: "accent", label: "Accent", kind: "hsl" },
  { token: "accent-foreground", label: "Accent FG", kind: "hsl" },
  { token: "border", label: "Border", kind: "hsl" },
  { token: "input", label: "Input", kind: "hsl" },
  { token: "ring", label: "Ring", kind: "hsl" },
  { token: "destructive", label: "Destructive", kind: "hsl" },
];

const SIZING: TokenDef[] = [
  { token: "radius", label: "Border radius", kind: "raw" },
];

const TYPE_SCALE = [
  { label: "Display 1", className: "font-display", style: { fontSize: 72, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.025em" } },
  { label: "Display 2", className: "font-display", style: { fontSize: 48, lineHeight: 1.1, fontWeight: 800 } },
  { label: "Display 3", className: "font-display", style: { fontSize: 36, lineHeight: 1.15, fontWeight: 700 } },
  { label: "Body L", className: "font-sans", style: { fontSize: 18, lineHeight: 1.55 } },
  { label: "Body M", className: "font-sans", style: { fontSize: 16, lineHeight: 1.55 } },
  { label: "Body S", className: "font-sans", style: { fontSize: 14, lineHeight: 1.55 } },
  { label: "Caption", className: "font-sans", style: { fontSize: 12, lineHeight: 1.4, letterSpacing: "0.04em" } },
  { label: "Mono / data", className: "font-mono", style: { fontSize: 12, lineHeight: 1.4, letterSpacing: "0.18em", textTransform: "uppercase" as const } },
];

const MOTION = [
  { name: "Micro", ms: 120, use: "Hover, focus, small affordances" },
  { name: "Standard", ms: 220, use: "Buttons, toggles, drawer open" },
  { name: "Modal", ms: 420, use: "Dialog, sheet, accordion" },
  { name: "Page", ms: 800, use: "Route transitions, section reveals" },
  { name: "Hero", ms: 1200, use: "Hero cascades only (cap)" },
];

/* ------------------------------ Helpers ------------------------------ */

/**
 * Convert "H S% L%" → "#rrggbb" so a native color picker can display it.
 */
function hslTripletToHex(triplet: string): string {
  const m = triplet.match(/^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/);
  if (!m) return "#000000";
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHslTriplet(hex: string): string {
  const m = hex.match(/^#?([a-fA-F0-9]{6})$/);
  if (!m) return "0 0% 0%";
  const num = parseInt(m[1], 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/* --------------------------- Token editor row --------------------------- */

function TokenEditor({ def }: { def: TokenDef }) {
  const { overrides, setOverride, clearOverride } = useThemeOverrides();
  const [computed, setComputed] = useState("");

  useEffect(() => {
    setComputed(readVar(def.token));
  }, [def.token, overrides]);

  const isOverridden = def.token in overrides;
  const value = overrides[def.token] ?? computed;

  if (def.kind === "hsl") {
    const hex = hslTripletToHex(value);
    return (
      <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
        <div
          className="rounded-sm shrink-0"
          style={{
            width: 48,
            height: 48,
            backgroundColor: `hsl(${value})`,
            border: "1px solid hsl(var(--border))",
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            --{def.token}
          </div>
          <div className="font-sans text-sm text-foreground truncate">
            {def.label} · <span className="font-mono text-xs">{value}</span>
          </div>
        </div>
        <input
          type="color"
          value={hex}
          onChange={(e) => setOverride(def.token, hexToHslTriplet(e.target.value))}
          className="w-10 h-10 rounded-sm cursor-pointer border border-border bg-transparent"
          aria-label={`Edit ${def.label}`}
        />
        <Input
          className="w-44 font-mono text-xs"
          value={value}
          onChange={(e) => setOverride(def.token, e.target.value)}
          placeholder="H S% L%"
        />
        {isOverridden && (
          <Button size="sm" variant="ghost" onClick={() => clearOverride(def.token)}>
            Reset
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
          --{def.token}
        </div>
        <div className="font-sans text-sm text-foreground">{def.label}</div>
      </div>
      <Input
        className="w-44 font-mono text-xs"
        value={value}
        onChange={(e) => setOverride(def.token, e.target.value)}
      />
      {isOverridden && (
        <Button size="sm" variant="ghost" onClick={() => clearOverride(def.token)}>
          Reset
        </Button>
      )}
    </div>
  );
}

/* --------------------------------- Page --------------------------------- */

export default function StyleGuide() {
  const { overrides, resetAll } = useThemeOverrides();
  const overrideCount = Object.keys(overrides).length;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SeoHead
        path="/style-guide"
        title="Style guide · Dossier (internal)"
        description="Internal Dossier design system reference."
        robots="noindex,nofollow"
      />
      {/* Header bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-[1280px] mx-auto px-8 py-6 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
              Dossier · brand & component reference
            </div>
            <h1 className="font-display text-dossier-ink-deep mt-1" style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.05 }}>
              Style Guide
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              {overrideCount} override{overrideCount === 1 ? "" : "s"} active
            </div>
            <Button variant="outline" size="sm" onClick={resetAll} disabled={overrideCount === 0}>
              Reset all
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/">· Hero</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app">· App</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-8 py-10 space-y-12">
        {/* Intro */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 font-sans text-foreground" style={{ fontSize: 16, lineHeight: 1.6 }}>
            <p className="mb-4">
              Every color, font, and dimension below maps to a CSS variable in{" "}
              <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">src/index.css</code>.
              Edit values here to preview changes across every page in real time. Overrides
              persist in your browser only · the source files are never touched.
            </p>
            <p className="text-muted-foreground" style={{ fontSize: 14 }}>
              When you settle on values, copy them into{" "}
              <code className="font-mono text-xs">src/index.css</code> to make them permanent for all visitors.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-5">
            <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase mb-2">
              Authority order
            </div>
            <ol className="font-sans text-sm space-y-1 text-foreground list-decimal pl-4">
              <li>Brand bible (docs/)</li>
              <li>This style guide</li>
              <li>Token defaults in index.css</li>
              <li>Local overrides (this session)</li>
            </ol>
          </div>
        </section>

        {/* Palette */}
        <Section title="Brand palette" subtitle="The locked dossier ten · paper, ink, brass.">
          <div className="rounded-md border border-border bg-card divide-y divide-border">
            {PALETTE.map((d) => (
              <div key={d.token} className="px-5">
                <TokenEditor def={d} />
              </div>
            ))}
          </div>
        </Section>

        {/* Semantic tokens */}
        <Section title="Semantic tokens" subtitle="Drive every shadcn component on every page.">
          <div className="rounded-md border border-border bg-card divide-y divide-border">
            {SEMANTIC.map((d) => (
              <div key={d.token} className="px-5">
                <TokenEditor def={d} />
              </div>
            ))}
          </div>
        </Section>

        {/* Sizing */}
        <Section title="Sizing & radius">
          <div className="rounded-md border border-border bg-card">
            {SIZING.map((d) => (
              <div key={d.token} className="px-5">
                <TokenEditor def={d} />
              </div>
            ))}
          </div>
        </Section>

        {/* Typography */}
        <Section title="Type scale" subtitle="Fraunces (display) · Inter (body) · JetBrains Mono (data). Two-and-a-half families, no more.">
          <div className="rounded-md border border-border bg-card divide-y divide-border">
            {TYPE_SCALE.map((t) => (
              <div key={t.label} className="px-5 py-5 flex items-baseline gap-6">
                <div className="w-32 shrink-0 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  {t.label}
                </div>
                <div className={`${t.className} text-foreground flex-1 truncate`} style={t.style}>
                  Sourced. Restrained. Yours.
                </div>
                <div className="font-mono text-xs text-muted-foreground hidden md:block">
                  {String(t.style.fontSize)}px · lh {String(t.style.lineHeight ?? "·")}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Motion */}
        <Section title="Motion" subtitle="Curve cubic-bezier(0.22, 1, 0.36, 1) · cap 1.2s · entrance only · honours prefers-reduced-motion.">
          <MotionPreferenceCard />
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
            {MOTION.map((m) => (
              <div key={m.name} className="rounded-md border border-border bg-card p-4">
                <div className="font-display text-dossier-ink-deep" style={{ fontSize: 28, fontWeight: 800 }}>
                  {m.ms}<span className="text-base font-sans text-muted-foreground">ms</span>
                </div>
                <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase mt-1">{m.name}</div>
                <div className="font-sans text-xs text-foreground mt-2">{m.use}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Components */}
        <Section title="Components" subtitle="Live shadcn primitives painted by the tokens above. Edit a token and watch them change.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buttons */}
            <Card>
              <CardHeader><CardTitle>Buttons</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button disabled>Disabled</Button>
              </CardContent>
            </Card>

            {/* Inputs */}
            <Card>
              <CardHeader><CardTitle>Inputs</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Email · principal@company.com" />
                <Input placeholder="Disabled" disabled />
              </CardContent>
            </Card>

            {/* Badges */}
            <Card>
              <CardHeader><CardTitle>Badges</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </CardContent>
            </Card>

            {/* Card stack demo */}
            <Card>
              <CardHeader>
                <CardTitle>Briefing card</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase mb-2">
                  BRIEFING · 042
                </div>
                <div className="font-display text-dossier-ink-deep" style={{ fontSize: 22, fontWeight: 700 }}>
                  Q3 review · risk surface
                </div>
                <div className="font-sans text-sm text-foreground mt-2">
                  Six sources resolve into one packet before the day begins.
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button size="sm">Open</Button>
                  <Button size="sm" variant="ghost">Defer</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Feature catalogue */}
        <Section title="Feature inventory" subtitle="What's live in the application, grouped by surface.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.map((group) => (
              <div key={group.group} className="rounded-md border border-border bg-card p-5">
                <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase mb-2">
                  {group.group}
                </div>
                <ul className="font-sans text-sm text-foreground space-y-1.5">
                  {group.items.map((it) => (
                    <li key={it.label} className="flex items-baseline justify-between gap-3">
                      <span>{it.label}</span>
                      {it.route && (
                        <Link to={it.route} className="font-mono text-[10px] tracking-[0.12em] text-dossier-brass-deep hover:underline">
                          {it.route}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Dossier · sanctioned navy-pane elements (§17 of the bible) */}
        <Section
          title="Dossier · sanctioned elements"
          subtitle="The seven visioncre-derived building blocks that carry the property identity. See docs/brand/DOSSIER_BRAND_BIBLE.md §17."
        >
          <div className="space-y-8">
            {/* 1 · The navy pane + 2 · engineering grid */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-brass-deep uppercase mb-2">
                01 · navy pane · 02 · engineering grid
              </div>
              <div className="dossier-navy-pane relative overflow-hidden p-10 rounded-sm">
                <span className="dossier-brass-chip">dossier · sample chip</span>
                <h3
                  className="font-display text-dossier-paper mt-6"
                  style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}
                >
                  A layered navy pane with a{" "}
                  <span className="dossier-brass-underline">brass</span> keyword.
                </h3>
                <p className="mt-4 max-w-xl text-dossier-paper/80" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  160deg gradient, brass glow top-right, cool lift bottom-left, 44px white/4.5% grid
                  masked at the edges.
                </p>
                <div className="dossier-mono-footer mt-10">
                  <span>chief of business · dossier</span>
                  <span>© 2026 COB Technologies LLC</span>
                </div>
              </div>
            </div>

            {/* 3 · Brass chip */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-brass-deep uppercase mb-2">
                03 · brass chip
              </div>
              <div className="bg-dossier-ink-deep p-6 rounded-sm">
                <span className="dossier-brass-chip">dossier 01 · a private document</span>
              </div>
            </div>

            {/* 4 · Brass-underline emphasis */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-brass-deep uppercase mb-2">
                04 · brass-underline emphasis
              </div>
              <p
                className="font-display text-dossier-ink-deep"
                style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}
              >
                One key word carries the{" "}
                <span className="dossier-brass-underline">weight</span>.
              </p>
            </div>

            {/* 5 · Navy-tinted shadow */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-brass-deep uppercase mb-2">
                05 · navy-tinted shadow
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className="bg-white p-6"
                  style={{ border: "1px solid hsl(var(--dossier-paper-edge))", borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
                >
                  <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-ash uppercase mb-2">
                    shadow-sm (baseline)
                  </div>
                  <div className="font-sans text-sm text-dossier-charcoal">A quiet paper card.</div>
                </div>
                <div
                  className="dossier-navy-shadow bg-white p-6"
                  style={{ border: "1px solid hsl(var(--dossier-paper-edge))", borderRadius: 8 }}
                >
                  <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-ash uppercase mb-2">
                    dossier-navy-shadow
                  </div>
                  <div className="font-sans text-sm text-dossier-charcoal">
                    Deeper, warmer · used near a navy pane.
                  </div>
                </div>
              </div>
            </div>

            {/* 6 · Mono footer strip */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-brass-deep uppercase mb-2">
                06 · mono footer strip
              </div>
              <div className="bg-dossier-ink-deep px-6 py-4 rounded-sm">
                <div className="dossier-mono-footer">
                  <span>chief of business · dossier</span>
                  <span>© 2026 COB Technologies LLC</span>
                </div>
              </div>
            </div>

            {/* 7 · Navy/paper split composition */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-brass-deep uppercase mb-2">
                07 · navy/paper split composition
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 rounded-sm overflow-hidden" style={{ minHeight: 260 }}>
                <div className="dossier-navy-pane p-8">
                  <span className="dossier-brass-chip">cover</span>
                  <p className="font-display text-dossier-paper mt-6" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>
                    Dark storytelling pane.
                  </p>
                </div>
                <div className="bg-dossier-paper p-8" style={{ border: "1px solid hsl(var(--dossier-paper-edge))" }}>
                  <div className="font-mono text-[10px] tracking-[0.22em] text-dossier-brass-deep uppercase mb-3">
                    page
                  </div>
                  <p className="font-display text-dossier-ink-deep" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>
                    Light action surface.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Section>


        <footer className="pt-8 pb-16 text-center font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
          Dossier · style guide · v1
        </footer>
      </div>
    </main>
  );
}

function MotionPreferenceCard() {
  const { pref, setPref, isReduced } = useMotionPreference();

  const options: { value: MotionPref; label: string; hint: string }[] = [
    { value: "system", label: "System", hint: "Follow OS · prefers-reduced-motion" },
    { value: "reduce", label: "Reduce", hint: "Force motion off · static reveals" },
    { value: "full",   label: "Full",   hint: "Force motion on · ignore OS" },
  ];

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Reduced motion · user preference
          </div>
          <div className="font-sans text-sm text-foreground mt-1">
            Pick how the app should behave when you prefer less animation. Saved to your browser.
          </div>
        </div>
        <div
          className="font-mono text-[10px] tracking-[0.18em] uppercase shrink-0 px-3 py-1 rounded-sm"
          style={{
            color: isReduced ? "hsl(var(--dossier-brass-deep))" : "hsl(var(--muted-foreground))",
            border: `1px solid ${isReduced ? "hsl(var(--dossier-brass))" : "hsl(var(--border))"}`,
            backgroundColor: isReduced ? "hsl(var(--dossier-brass) / 0.12)" : "transparent",
          }}
          aria-live="polite"
        >
          Motion · {isReduced ? "Off" : "On"}
        </div>
      </div>
      <div role="radiogroup" aria-label="Motion preference" className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {options.map((opt) => {
          const active = pref === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPref(opt.value)}
              className="text-left p-4 rounded-md transition-colors"
              style={{
                border: `1px solid ${active ? "hsl(var(--dossier-brass))" : "hsl(var(--border))"}`,
                backgroundColor: active ? "hsl(var(--dossier-brass) / 0.08)" : "transparent",
                cursor: "pointer",
              }}
            >
              <div
                className="font-display"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: active ? "hsl(var(--dossier-ink-deep))" : "hsl(var(--foreground))",
                }}
              >
                {opt.label}
              </div>
              <div className="font-sans text-xs text-muted-foreground mt-1">{opt.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4">
        <div
          aria-hidden
          className="mb-3"
          style={{ width: 56, height: 1.5, backgroundColor: "hsl(var(--dossier-brass))" }}
        />
        <h2 className="font-display text-dossier-ink-deep m-0" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
          {title}
        </h2>
        {subtitle && (
          <p className="font-sans text-muted-foreground mt-1" style={{ fontSize: 14 }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

const FEATURES: { group: string; items: { label: string; route?: string }[] }[] = [
  {
    group: "Public surfaces",
    items: [
      { label: "Hero · landing", route: "/" },
      { label: "Hero story · staging", route: "/hero-story" },
      { label: "Dossier · print document", route: "/dossier" },
      { label: "Consult · intake", route: "/consult" },
      { label: "Capability brief · static", route: "/capability-brief.html" },
      { label: "Style guide · this page", route: "/style-guide" },
      { label: "Respond · single-use token page", route: "/respond/:token" },
      { label: "Sign in", route: "/login" },
      { label: "Not found · 404 fallback" },
    ],
  },
  {
    group: "App · accounts & items",
    items: [
      { label: "Accounts list", route: "/app/accounts" },
      { label: "Account detail" },
      { label: "Items list", route: "/app/items" },
      { label: "Item detail" },
      { label: "Contacts", route: "/app/contacts" },
    ],
  },
  {
    group: "App · execution",
    items: [
      { label: "Actions queue", route: "/app/actions" },
      { label: "Timeline", route: "/app/timeline" },
      { label: "Scheduler health", route: "/app/scheduler-health" },
      { label: "Billing & usage", route: "/app/billing" },
    ],
  },
  {
    group: "App · automation",
    items: [
      { label: "Policies", route: "/app/policies" },
      { label: "Policy rules", route: "/app/policy-rules" },
      { label: "Playbooks", route: "/app/playbooks" },
      { label: "Templates", route: "/app/templates" },
      { label: "Connectors", route: "/app/connectors" },
      { label: "Suppression", route: "/app/suppression" },
    ],
  },
];
