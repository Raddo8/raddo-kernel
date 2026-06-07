// Authorization Server (rnjqpw) Supabase client.
//
// Used exclusively by /login and /oauth/consent so that signInWithPassword
// and the oauth.* calls all run against the Supabase project that hosts the
// OAuth 2.1 Authorization Server. The vacpg client in
// `./client.ts` is the resource-server client and must NOT be used for the
// consent flow.
//
// Isolated `storageKey` keeps the AS session from colliding with the
// resource-server session in localStorage.

import { createClient } from "@supabase/supabase-js";

const AS_SUPABASE_URL = "https://rnjqpwmzmbnnaonppfkm.supabase.co";
// Publishable (anon) key — safe to ship in the client bundle.
const AS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FuTs2lSpzKLyt-x84L4oIg_YBsyyOYH";

export const asSupabase = createClient(AS_SUPABASE_URL, AS_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    storageKey: "raddo-as-auth",
    persistSession: true,
    autoRefreshToken: true,
  },
});
