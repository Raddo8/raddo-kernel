// One-shot admin password reset. DELETE THIS FUNCTION AFTER USE.
// Guarded by ADMIN_RESET_SECRET header + hardcoded target email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TARGET_EMAIL = "jdb1203@gmail.com";
const TARGET_USER_ID = "760b2da9-f507-47f1-9dd3-e205446bd3da";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const providedSecret = req.headers.get("x-admin-secret");
  const expected = Deno.env.get("ADMIN_RESET_SECRET");
  if (!expected || providedSecret !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: { password?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }
  if (!body.password || body.password.length < 8) {
    return new Response(JSON.stringify({ error: "password_too_short" }), { status: 400 });
  }
  if (body.email && body.email !== TARGET_EMAIL) {
    return new Response(JSON.stringify({ error: "email_locked" }), { status: 403 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.auth.admin.updateUserById(TARGET_USER_ID, {
    password: body.password,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, user_id: data.user?.id, email: data.user?.email }),
    { headers: { "content-type": "application/json" } },
  );
});
