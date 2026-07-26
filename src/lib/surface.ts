import { supabase } from "@/integrations/supabase/client";

export type SurfaceKey = "hq" | "panel";

export type SurfaceResult = {
  /** Blob object URL for the decoded document, or null when nothing resolved. */
  url: string | null;
  version: string | null;
  /** Client-safe reason code. Never a database message. */
  error: "no-pin" | "no-version" | "decode-failed" | null;
};

/** base64 → bytes, without pulling in a dependency. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gunzipToText(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder("utf-8").decode(buf);
}

/** Gzip + base64 encode a UTF-8 string. Mirror of the decode path. */
export async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/</g, "\\u003c");
}

/**
 * Inject the tenant bootstrap before the document's own scripts run.
 * The documents read these globals with `window.X = window.X || default`,
 * so setting them first is what makes the substitution take.
 */
function injectBootstrap(
  html: string,
  cid: string,
  cobName: string,
  isOperator: boolean,
): string {
  const script =
    `<script>window.TENANT_ID='${escapeJs(cid)}';` +
    `window.COB_NAME='${escapeJs(cobName)}';` +
    `window.CID='${escapeJs(cid)}';` +
    `window.IS_OPERATOR=${isOperator ? "true" : "false"};</script>`;
  const match = html.match(/<head[^>]*>/i);
  if (!match || match.index === undefined) return script + html;
  const at = match.index + match[0].length;
  return html.slice(0, at) + script + html.slice(at);
}

/**
 * Resolve the tenant's pinned surface document and return a blob: URL.
 * The blob indirection is required — the upstream sandbox CSP would
 * otherwise block the document's own JavaScript.
 */
export async function loadSurface(surfaceKey: SurfaceKey): Promise<SurfaceResult> {
  const pin = await supabase
    .from("surface_pin")
    .select("version")
    .eq("surface_key", surfaceKey)
    .maybeSingle();

  if (pin.error || !pin.data?.version) return { url: null, version: null, error: "no-pin" };

  const row = await supabase
    .from("surface_version")
    .select("body, encoding, version, sha256")
    .eq("surface_key", surfaceKey)
    .eq("version", pin.data.version)
    .maybeSingle();

  if (row.error || !row.data?.body) {
    return { url: null, version: pin.data.version, error: "no-version" };
  }

  const tenant = await supabase
    .from("tenants")
    .select("cid, cob_name")
    .limit(1)
    .maybeSingle();

  const operator = await supabase.rpc("is_cob_operator");

  try {
    const raw =
      row.data.encoding === "gzip+base64"
        ? await gunzipToText(base64ToBytes(row.data.body))
        : row.data.body;

    const html = injectBootstrap(
      raw,
      tenant.data?.cid ?? "",
      tenant.data?.cob_name ?? "",
      operator.data === true,
    );

    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    return { url, version: row.data.version, error: null };
  } catch {
    return { url: null, version: row.data.version, error: "decode-failed" };
  }
}

/** Decode a stored surface body to plain HTML text (operator tooling). */
export async function decodeSurfaceBody(body: string, encoding: string | null): Promise<string> {
  if (encoding === "gzip+base64") return gunzipToText(base64ToBytes(body));
  return body;
}
