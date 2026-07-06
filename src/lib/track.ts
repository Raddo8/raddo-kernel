// First-party analytics · fire-and-forget writes to public.site_events.
// No PII beyond what a browser exposes on its own address bar and referrer.
// Never throws · never awaits on caller path.
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "cob-session-id";
const UTM_KEY = "cob-session-utm";

type Utm = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      (crypto?.randomUUID?.() as string | undefined) ??
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return "";
  }
}

function getUtm(): Utm {
  if (typeof window === "undefined") return {};
  try {
    const cached = window.sessionStorage.getItem(UTM_KEY);
    if (cached) return JSON.parse(cached) as Utm;
    const p = new URLSearchParams(window.location.search);
    const utm: Utm = {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
    };
    window.sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    return utm;
  } catch {
    return {};
  }
}

export function track(event: string, route?: string): void {
  if (typeof window === "undefined") return;
  const utm = getUtm();
  const payload = {
    event,
    route: route ?? window.location.pathname,
    referrer: document.referrer || null,
    session_id: getSessionId() || null,
    utm_source: utm.utm_source ?? null,
    utm_medium: utm.utm_medium ?? null,
    utm_campaign: utm.utm_campaign ?? null,
  };
  // Fire-and-forget · swallow any error so analytics can never break the UI.
  void supabase
    .from("site_events")
    .insert(payload)
    .then(() => undefined, () => undefined);
}
