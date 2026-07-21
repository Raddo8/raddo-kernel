/*
 * onboarding-bridge.js
 * Injected into public/onboarding-v1.html AFTER its own <script> runs.
 * Purpose (Circuit 1): wire COB.signup / COB.signin / COB.save / uploads /
 * deletion to the project Supabase, without editing the HTML file's bytes.
 * OAuth providers are left on their current in-file preview behavior.
 */
(function () {
  if (!window.COB || !window.__SB) return;
  var sb = window.__SB;

  var HYDRATED = false;
  var TENANT = null;
  var SAVE_T = null;

  (function init() {


    function slugify(s) {
      var b = (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      var suf = Math.random().toString(36).slice(2, 8);
      return (b || "client") + "-" + suf;
    }

    async function loadOrCreateTenant(userId, email) {
      var r = await sb.from("onboarding_tenants").select("*").eq("user_id", userId).maybeSingle();
      if (r.data) return r.data;
      var ins = await sb.from("onboarding_tenants")
        .insert({ user_id: userId, tenant_key: slugify((email || "").split("@")[0]), status: "intake", current_step: "welcome" })
        .select("*").single();
      return ins.data;
    }

    async function hydrateFromServer() {
      var s = await sb.auth.getSession();
      var user = s.data.session && s.data.session.user;
      if (!user) return;
      TENANT = await loadOrCreateTenant(user.id, user.email || "");
      if (TENANT && TENANT.state && typeof TENANT.state === "object") {
        var local = COB.state || {};
        var localTs = local._savedAt || 0;
        var serverTs = TENANT.state._savedAt || 0;
        if (!localTs || serverTs >= localTs) {
          Object.assign(COB.state, TENANT.state);
          try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
        }
      }
      // reflect session user in COB
      if (!COB.state.user) {
        COB.state.user = { email: user.email, first: (user.user_metadata||{}).first_name||"", last: (user.user_metadata||{}).last_name||"", name: (user.user_metadata||{}).full_name || (user.email||"") };
      }
      HYDRATED = true;
      try { COB.render(); } catch (e) {}
    }

    // --- persistence bridge ---
    var origSave = COB.save.bind(COB);
    COB.save = function () {
      COB.state._savedAt = Date.now();
      origSave();
      clearTimeout(SAVE_T);
      SAVE_T = setTimeout(async function () {
        try {
          var s = await sb.auth.getSession();
          var user = s.data.session && s.data.session.user;
          if (!user) return;
          if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
          if (!TENANT) return;
          await sb.from("onboarding_tenants").update({ state: COB.state }).eq("id", TENANT.id);
        } catch (e) { /* silent */ }
      }, 1000);
    };

    // --- auth bridge ---
    COB.signup = async function () {
      var f = document.getElementById("f-first"), l = document.getElementById("f-last"), p = document.getElementById("f-pass");
      var first = (f && f.value || "").trim(), last = (l && l.value || "").trim(), pass = (p && p.value || "");
      var email = COB._authEmail || "";
      if (!first || !last) return COB.toast("First and last name aim your study. Both, please.");
      if (pass.length < 10) return COB.toast("Give the password at least 10 characters.");
      try {
        var r = await sb.auth.signUp({
          email: email, password: pass,
          options: {
            emailRedirectTo: window.location.origin + "/onboarding-v1.html",
            data: { first_name: first, last_name: last, full_name: first + " " + last },
          },
        });
        if (r.error) throw r.error;
        var uid = r.data.user && r.data.user.id;
        if (uid) TENANT = await loadOrCreateTenant(uid, email);
        COB.state.user = { first: first, last: last, name: first + " " + last, email: email };
        COB.save();
        COB.go("#/consent");
      } catch (e) {
        COB.toast(e && e.message ? e.message : "Sign-up failed.");
      }
    };

    COB.signin = async function () {
      var p = document.getElementById("f-pass");
      var pass = (p && p.value || "");
      var email = COB._authEmail || "";
      if (pass.length < 10) return COB.toast("That password looks short.");
      try {
        var r = await sb.auth.signInWithPassword({ email: email, password: pass });
        if (r.error) throw r.error;
        var u = r.data.user;
        COB.state.user = COB.state.user || { email: u.email, first: (u.user_metadata||{}).first_name||"", last: (u.user_metadata||{}).last_name||"", name: (u.user_metadata||{}).full_name||u.email };
        COB.save();
        await hydrateFromServer();
        COB.toast("Welcome back.");
        COB.resume();
      } catch (e) {
        COB.toast(e && e.message ? e.message : "Sign-in failed.");
      }
    };

    // Providers: preview-only for now (OAuth apps not registered). Keep file's toast.
    // COB.provider is left as-is.

    // --- file uploads ---
    var origOnDrop = COB.onDrop && COB.onDrop.bind(COB);
    var origOnFile = COB.onFileSelected && COB.onFileSelected.bind(COB);
    async function uploadOne(kind, file) {
      try {
        var s = await sb.auth.getSession();
        var user = s.data.session && s.data.session.user;
        if (!user) return;
        if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
        if (!TENANT) return;
        var path = user.id + "/" + TENANT.id + "/" + Date.now() + "-" + file.name;
        var up = await sb.storage.from("onboarding-files").upload(path, file);
        if (up.error) throw up.error;
        await sb.from("intake_files").insert({
          tenant_id: TENANT.id, kind: kind || "upload", file_name: file.name,
          storage_path: path, size_bytes: file.size,
        });
      } catch (e) { /* silent per brand */ }
    }
    COB.onDrop = function (file) { uploadOne("harvest", file); if (origOnDrop) try { origOnDrop(file); } catch (e) {} };
    COB.onFileSelected = function (kind, file) { uploadOne(kind, file); if (origOnFile) try { origOnFile(kind, file); } catch (e) {} };

    // --- deletion request ---
    var origClearConfirm = COB.clearConfirm.bind(COB);
    COB.clearConfirm = async function () {
      var vEl = document.getElementById("clr-in");
      var v = (vEl && vEl.value || "").trim();
      if (v === "ERASE") {
        try {
          var s = await sb.auth.getSession();
          var user = s.data.session && s.data.session.user;
          if (user) {
            await sb.from("deletion_requests").insert({ user_id: user.id, reason: "onboarding clear-my-data" });
          }
        } catch (e) {}
      }
      return origClearConfirm();
    };

    // --- boot ---
    hydrateFromServer();
    sb.auth.onAuthStateChange(function (_evt, sess) {
      if (sess && !HYDRATED) hydrateFromServer();
    });
  }).catch(function () { /* offline; file behavior only */ });
})();
