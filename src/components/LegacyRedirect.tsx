import { Navigate, useLocation } from "react-router-dom";

/**
 * Old /app/* paths must keep working · links already sent to humans.
 * Longest prefix wins so /app/onboarding/kernel beats /app/onboarding.
 */
const APP_MAP: ReadonlyArray<readonly [string, string]> = [
  ["/app/onboarding/kernel", "/control/kernel"],
  ["/app/onboarding/builds", "/control/builds/projects"],
  ["/app/scheduler-health", "/control/system"],
  ["/app/surfaces", "/control/publish"],
  ["/app/builds", "/control/builds"],
  ["/app/revenue", "/control/money/revenue"],
  ["/app/invoices", "/control/money/invoices"],
  ["/app/billing", "/control/money/billing"],
  ["/app/clients", "/control/fleet/clients"],
  ["/app/approvals", "/control/fleet/approvals"],
  ["/app", "/control/desk"],
];

export function mapLegacyAppPath(pathname: string): string {
  for (const [from, to] of APP_MAP) {
    if (pathname === from) return to;
    if (pathname.startsWith(from + "/")) return to + pathname.slice(from.length);
  }
  return "/control/desk";
}

/** Redirects any legacy /app/* URL (including params) to its /control home. */
export function LegacyAppRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={mapLegacyAppPath(pathname) + search + hash} replace />;
}

/** Generic path-rewriting redirect for one-to-one renames with params. */
export function PrefixRedirect({ from, to }: { from: string; to: string }) {
  const { pathname, search, hash } = useLocation();
  const rest = pathname.startsWith(from) ? pathname.slice(from.length) : "";
  return <Navigate to={to + rest + search + hash} replace />;
}
