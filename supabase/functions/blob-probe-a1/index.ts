Deno.serve(() => new Response(
  JSON.stringify({ ok: true, fn: "blob-probe-a1", at: new Date().toISOString() }),
  { status: 200, headers: { "Content-Type": "application/json" } },
));
