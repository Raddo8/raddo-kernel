/*
 * onboarding-bridge.js
 * Injected into public/onboarding-v1.html AFTER its own <script> runs.
 * Circuit 1 + Circuit 2: auth, persistence, uploads, deletion (schema-correct),
 * TAYLOR live (taylor-chat edge fn), realtime briefcase stream from intake_facts.
 * Never edits the HTML file's bytes.
 */
(function () {
  function getCOB() {
    try { return new Function("return typeof COB!=='undefined'?COB:null")(); } catch(e){ return null; }
  }
  var tries = 0;
  function boot() {
    var COB = getCOB();
    if (!COB || !window.__SB) {
      if (++tries > 100) return;
      return setTimeout(boot, 50);
    }
    window.COB = COB;
    install(window.__SB);
  }
  boot();

  function install(sb) {
    var HYDRATED = false;
    var TENANT = null;
    var SAVE_T = null;
    var FACTS_CHAN = null;
    var TAY_CHAN = null;

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

    function rerender() {
      try { COB.render(); } catch (e) {}
      try { COB.sideRender && COB.sideRender(); } catch (e) {}
      try { COB.dockRender && COB.dockRender(); } catch (e) {}
    }

    // --- realtime: briefcase from intake_facts, and answers to taylor_questions ---
    async function loadFactsInitial() {
      if (!TENANT) return;
      var r = await sb.from("intake_facts").select("section,fact,created_at").eq("tenant_id", TENANT.id).order("created_at", { ascending: true });
      if (r.error || !r.data) return;
      applyFacts(r.data);
    }
    function applyFacts(rows) {
      COB.state.briefcase = COB.state.briefcase || [];
      var i = COB.state.briefcase.findIndex(function (d) { return d && d.title === "FIRST_CONVERSATION"; });
      if ((!rows || rows.length === 0) && i === -1) return;
      if (i > -1 && COB.state.briefcase[i] && COB.state.briefcase[i].facts === rows.length) return;
      var sectionsMap = {};
      rows.forEach(function (row) {
        var k = row.section || "notes";
        sectionsMap[k] = sectionsMap[k] || [];
        sectionsMap[k].push(row.fact);
      });
      var sections = Object.keys(sectionsMap).map(function (k) { return { name: k, items: sectionsMap[k] }; });
      var deliv = { title: "FIRST_CONVERSATION", facts: rows.length, sections: sections };
      if (i > -1) COB.state.briefcase[i] = deliv;
      else COB.state.briefcase.push(deliv);
      try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
      rerender();
    }

    function subscribeRealtime() {
      if (!TENANT) return;
      if (FACTS_CHAN) { try { sb.removeChannel(FACTS_CHAN); } catch(e){} }
      FACTS_CHAN = sb.channel("intake_facts_" + TENANT.id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "intake_facts", filter: "tenant_id=eq." + TENANT.id }, function () {
          loadFactsInitial();
        })
        .subscribe();
      if (TAY_CHAN) { try { sb.removeChannel(TAY_CHAN); } catch(e){} }
      TAY_CHAN = sb.channel("taylor_q_" + TENANT.id)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "taylor_questions", filter: "tenant_id=eq." + TENANT.id }, function (payload) {
          var row = payload && payload.new;
          if (!row || !row.answer) return;
          applyTaylorAnswer(row.id, row.answer);
        })
        .subscribe();
    }

    function applyTaylorAnswer(qid, answer) {
      var qs = COB.state.taylor_qs || [];
      var hit = false;
      for (var i = qs.length - 1; i >= 0; i--) {
        if (qs[i]._id === qid && !qs[i].a) { qs[i].a = answer; hit = true; break; }
      }
      if (!hit) {
        // fallback: attach to most recent unanswered
        for (var j = qs.length - 1; j >= 0; j--) {
          if (!qs[j].a) { qs[j].a = answer; hit = true; break; }
        }
      }
      if (hit) {
        try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
        rerender();
      }
    }

    async function askTaylorLive(ctx, question) {
      try {
        var s = await sb.auth.getSession();
        var user = s.data.session && s.data.session.user;
        if (!user) return;
        if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
        if (!TENANT) return;

        // insert row so admin can see the trail, and to get an id
        var ins = await sb.from("taylor_questions")
          .insert({ tenant_id: TENANT.id, context: ctx || "", question: question.slice(0, 2000) })
          .select("id").single();
        var qid = ins.data && ins.data.id;

        // attach id to the last pushed local entry (the file just pushed it before calling save)
        var qs = COB.state.taylor_qs || [];
        for (var i = qs.length - 1; i >= 0; i--) {
          if (qs[i] && qs[i].q === question.slice(0, 500) && !qs[i]._id) { qs[i]._id = qid; break; }
        }
        try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}

        // invoke edge function
        var r = await sb.functions.invoke("taylor-chat", {
          body: { question: question, page_ctx: ctx || "", tenant_id: TENANT.id, question_id: qid },
        });
        var answer = r && r.data && r.data.answer;
        if (answer && qid) applyTaylorAnswer(qid, answer);
      } catch (e) { /* silent per brand */ }
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
      if (!COB.state.user) {
        COB.state.user = { email: user.email, first: (user.user_metadata||{}).first_name||"", last: (user.user_metadata||{}).last_name||"", name: (user.user_metadata||{}).full_name || (user.email||"") };
      }
      HYDRATED = true;
      rerender();
      subscribeRealtime();
      loadFactsInitial();
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
            emailRedirectTo: window.location.origin + "/onboarding",
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

    // --- TAYLOR wrappers ---
    var origSideSend = COB.sideSend && COB.sideSend.bind(COB);
    var origDockSend = COB.dockSend && COB.dockSend.bind(COB);
    var origAsk = COB.askTaylor && COB.askTaylor.bind(COB);

    COB.sideSend = function () {
      var el = document.getElementById("tside-in");
      var v = (el && el.value || "").trim();
      var ctx = "page:" + (COB.route ? COB.route().p : "");
      if (origSideSend) { try { origSideSend(); } catch (e) {} }
      if (v) askTaylorLive(ctx, v);
    };
    COB.dockSend = function () {
      var el = document.getElementById("tdock-in");
      var v = (el && el.value || "").trim();
      var ctx = "page:" + (COB.route ? COB.route().p : "");
      if (origDockSend) { try { origDockSend(); } catch (e) {} }
      if (v) askTaylorLive(ctx, v);
    };
    COB.askTaylor = function (ctx, id) {
      var el = document.getElementById(id);
      var v = (el && el.value || "").trim();
      if (origAsk) { try { origAsk(ctx, id); } catch (e) {} }
      if (v) askTaylorLive(ctx || "", v);
    };

    // --- deletion request (schema: tenant_id, requested_by, status) ---
    var origClearConfirm = COB.clearConfirm.bind(COB);
    COB.clearConfirm = async function () {
      var vEl = document.getElementById("clr-in");
      var v = (vEl && vEl.value || "").trim();
      if (v === "ERASE") {
        try {
          var s = await sb.auth.getSession();
          var user = s.data.session && s.data.session.user;
          if (user) {
            if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
            if (TENANT) {
              await sb.from("deletion_requests").insert({
                tenant_id: TENANT.id,
                requested_by: user.id,
                status: "open",
              });
            }
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
  }
})();
