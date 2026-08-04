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
    var SB_FN = "https://vacpgxxgdfhgvkduljgs.supabase.co/functions/v1";
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

    const TAYLOR_SNAG = "I hit a snag just now. Ask me again in a moment.";
    function applyTaylorAnswer(qid, answer) {
      var qs = COB.state.taylor_qs || [];
      var i;
      if (qid) {
        for (i = qs.length - 1; i >= 0; i--) {
          if (qs[i] && qs[i]._id === qid) {
            if (qs[i].a && qs[i].a !== TAYLOR_SNAG) return; // duplicate delivery (invoke + realtime): already applied, never fall through
            qs[i].a = answer; // fills empty or replaces a snag placeholder with the late real answer
            commitTaylorAnswer(answer);
            return;
          }
        }
        return; // qid known but no matching local row: drop rather than mis-attach to a different question
      }
      for (i = qs.length - 1; i >= 0; i--) { if (qs[i] && qs[i].a === answer) return; } // no qid: text-dedupe
      for (i = qs.length - 1; i >= 0; i--) {
        if (qs[i] && !qs[i].a) { qs[i].a = answer; commitTaylorAnswer(answer); return; }
      }
    }
    function commitTaylorAnswer(answer) {
      try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
      rerender();
      try { if (typeof COB.speak === "function") COB.speak(answer); } catch (e) {}
    }

    function markMostRecentUnanswered(text) {
      var qs = COB.state.taylor_qs || [];
      for (var i = qs.length - 1; i >= 0; i--) {
        if (qs[i] && !qs[i].a) { qs[i].a = text; break; }
      }
      try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
      rerender();
    }

    async function askTaylorLive(ctx, question) {
      var qid = null;
      var TIMEOUT_MS = 15000;
      var timedOut = false;
      var timer = setTimeout(function () {
        timedOut = true;
        markMostRecentUnanswered(TAYLOR_SNAG);
      }, TIMEOUT_MS);
      try {
        var s = await sb.auth.getSession();
        var user = s.data.session && s.data.session.user;
        if (!user) { clearTimeout(timer); markMostRecentUnanswered("Sign in first, then I'm all yours."); return; }
        if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
        if (!TENANT) { clearTimeout(timer); return; }

        // Log row (best-effort; must NOT block the answer)
        try {
          var ins = await sb.from("taylor_questions")
            .insert({ tenant_id: TENANT.id, context: ctx || "", question: question.slice(0, 2000) })
            .select("id").single();
          qid = ins && ins.data && ins.data.id;
          if (qid) {
            var qs = COB.state.taylor_qs || [];
            for (var i = qs.length - 1; i >= 0; i--) {
              if (qs[i] && qs[i].q === question.slice(0, 500) && !qs[i]._id) { qs[i]._id = qid; break; }
            }
            try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
          }
        } catch (e) { /* logging failure must not drop the answer */ }

        var st = COB.state || {};
        var study = st.study || {};
        var bc = (st.briefcase || []).map(function(d){ return d.title + " (" + (d.facts||0) + ")"; });
        var page_state = {
          page: (COB.route ? COB.route().p : ""),
          first: (st.user && st.user.first) || "",
          entered: { area: study.area||"", role: study.prof||"", website: study.web||"", linkedin: study.li||"" },
          systems_named: (st.wishlist || []).slice(0, 20),
          briefcase: bc,
          briefcase_facts: (st.briefcase||[]).reduce(function(a,d){return a+(d.facts||0);},0),
          deep_dive: (st.dive && st.dive.status) || "not started",
          fireside_answered: Object.keys(st.answers||{}).filter(function(k){return !k.startsWith("fix_") && String((st.answers||{})[k]||"").trim();}).length
        };
        var r = await sb.functions.invoke("taylor-chat", {
          body: { question: question, page_ctx: ctx || "", tenant_id: TENANT ? TENANT.id : null, question_id: qid, page_state: page_state },
        });
        clearTimeout(timer);
        if (timedOut) return;
        var answer = r && r.data && r.data.answer;
        if (answer) {
          applyTaylorAnswer(qid, answer);
        } else {
          markMostRecentUnanswered(TAYLOR_SNAG);
        }
      } catch (e) {
        clearTimeout(timer);
        if (!timedOut) markMostRecentUnanswered(TAYLOR_SNAG);
      }
    }

    // --- real voice: OpenAI TTS via edge fn, fallback to speechSynthesis ---
    var VOICE_AUDIO = null;
    function speakDone(){ try { if (window.COB && typeof COB._afterSpeak === "function") COB._afterSpeak(); } catch (e) {} }
    async function speakLive(text) {
      var t = String(text || "").trim();
      if (!t) return false;
      try {
        var s = await sb.auth.getSession();
        var token = s.data.session && s.data.session.access_token;
        if (!token) return false;
        var url = SB_FN + "/taylor-voice";
        var resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ text: t.slice(0, 4000) }),
        });
        if (!resp.ok) return false;
        var blob = await resp.blob();
        if (!blob || !blob.size) return false;
        try { if (VOICE_AUDIO) { VOICE_AUDIO.pause(); VOICE_AUDIO.src = ""; } } catch (e) {}
        VOICE_AUDIO = new Audio(URL.createObjectURL(blob));
        VOICE_AUDIO.onended = speakDone; VOICE_AUDIO.onerror = speakDone;
        try { await VOICE_AUDIO.play(); } catch (e) { return false; }
        return true;
      } catch (e) { return false; }
    }
    // Override the ENGINE (_speakImpl), not the POLICY (COB.speak). The client's
    // voice toggle lives in COB.speak; overriding it would bypass the toggle.
    try {
      var origSpeakImpl = (typeof COB._speakImpl === "function") ? COB._speakImpl.bind(COB) : null;
      COB._speakImpl = function (text) {
        speakLive(text).then(function (ok) {
          if (ok) return; // onended will fire speakDone
          if (typeof window.speechSynthesis !== "undefined") {
            try {
              window.speechSynthesis.cancel();
              var u = new SpeechSynthesisUtterance(String(text || ""));
              u.onend = speakDone;
              window.speechSynthesis.speak(u);
              return;
            } catch (e) {}
          }
          if (origSpeakImpl) { try { origSpeakImpl(text); } catch (e) {} }
          setTimeout(speakDone, Math.min(9000, 1200 + String(text || "").length * 55));
        });
      };
    } catch (e) { /* never block install */ }

    // --- TAYLOR's ear: MediaRecorder blob -> taylor-ear transcription ---
    try {
      window.COB_EAR = async function (blob) {
        const s = await sb.auth.getSession();
        const token = s.data.session && s.data.session.access_token;
        if (!token) throw new Error("no_session");
        const resp = await fetch(SB_FN + "/taylor-ear", {
          method: "POST",
          headers: { "Content-Type": blob.type || "audio/webm", Authorization: "Bearer " + token },
          body: blob,
        });
        if (!resp.ok) throw new Error("ear_failed");
        const j = await resp.json();
        return (j && j.text) || "";
      };
    } catch (e) { /* never block install */ }

    // --- Deepgram short-lived token: enables browser-side streaming dictation ---
    try {
      window.COB_DGTOKEN = async function () {
        try {
          var s = await sb.auth.getSession();
          var token = s.data.session && s.data.session.access_token;
          if (!token) return null;
          var resp = await fetch(SB_FN + "/deepgram-token", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: "{}" });
          if (!resp.ok) return null;
          var j = await resp.json();
          return (j && j.token) ? j : null;
        } catch (e) { return null; }
      };
    } catch (e) { /* never block install */ }

    // --- COB DEEPDIVE: reveal-page dossier fan-out ---
    try {
      window.COB_DEEPDIVE = async function (payload) {
        const r = await sb.functions.invoke("deepdive-cob", { body: payload });
        if (r.error) throw new Error("deepdive_failed");
        return (r.data && r.data.brief) || null;
      };
    } catch (e) { /* never block install */ }

    function cobKnowledge() {
      var st = COB.state || {}; var out = [];
      (st.briefcase || []).forEach(function(d){
        (d.sections || []).forEach(function(s){
          if (s && s.items && s.items.length) out.push((s.name || s.label || "notes") + ": " + s.items.slice(0,8).join(" | "));
        });
      });
      var u = st.understanding || {};
      if (u.biz) out.push("who they are: " + u.biz);
      if (u.entities) out.push("entities: " + u.entities.map(function(e){return e.n+" ("+(e.d||"")+")";}).join(", "));
      if (u.people) out.push("people: " + u.people.map(function(e){return e.n+" ("+(e.d||"")+")";}).join(", "));
      if (st.wishlist && st.wishlist.length) out.push("systems they named: " + st.wishlist.slice(0,20).join(", "));
      var study = st.study || {};
      if (study.prof) out.push("role: " + study.prof);
      if (study.area) out.push("location: " + study.area);
      return out.join("\n").slice(0, 2500);
    }

    try {
      window.COB_ASK = async function (question, ctx) {
        try {
          var s = await sb.auth.getSession();
          var user = s.data.session && s.data.session.user;
          if (!user) return "Sign in first and I'm all yours.";
          if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
          var st = COB.state || {}; var study = st.study || {};
          var page_state = {
            page: (COB.route ? COB.route().p : ""), first: (st.user && st.user.first) || "",
            entered: { area: study.area||"", role: study.prof||"", website: study.web||"", linkedin: study.li||"" },
            systems_named: (st.wishlist || []).slice(0,20),
            briefcase: (st.briefcase||[]).map(function(d){return d.title+" ("+(d.facts||0)+")";}),
            briefcase_facts: (st.briefcase||[]).reduce(function(a,d){return a+(d.facts||0);},0),
            deep_dive: (st.dive && st.dive.status) || "not started",
            fireside_answered: Object.keys(st.answers||{}).filter(function(k){return !k.startsWith("fix_") && String((st.answers||{})[k]||"").trim();}).length
          };
          var r = await sb.functions.invoke("taylor-chat", { body: { question: question, page_ctx: "page:"+(ctx||"fireside"), tenant_id: TENANT ? TENANT.id : null, page_state: page_state, knowledge: cobKnowledge() } });
          return (r && r.data && r.data.answer) || "I'm here. Tell me what's going on, or answer the question above when you're ready.";
        } catch (e) { return "I'm here with you. Type it for now and let's keep going."; }
      };
    } catch (e) { /* never block install */ }

    try {
      window.COB_FIRE = async function (history, latest) {
        try {
          var s = await sb.auth.getSession(); var user = s.data.session && s.data.session.user;
          if (!user) return "Sign in first and I'm all yours.";
          if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
          var st = COB.state || {};
          var r = await sb.functions.invoke("taylor-chat", { body: {
            mode: "fireside",
            history: history || [],
            question: latest || "",
            page_ctx: "page:fireside",
            tenant_id: TENANT ? TENANT.id : null,
            knowledge: cobKnowledge(),
            first: (st.user && st.user.first) || ""
          }});
          return (r && r.data && r.data.answer) || "I'm right here with you. Keep going.";
        } catch (e) { return "I'm here with you. Say more when you're ready."; }
      };
    } catch (e) { /* never block install */ }





    // 2R4 · connector truth is the SERVER record. The connector-success signal
    // writes connector_connected_at / connector_first_client on onboarding_tenants;
    // the surface renders from that, never from a local "mark connected" click.
    function applyServerRecord(t) {
      if (!t) return;
      var prev = COB.state.server || {};
      var next = {
        connector_connected_at: t.connector_connected_at || null,
        connector_first_client: t.connector_first_client || null,
        status: t.status || null,
      };
      if (prev.connector_connected_at === next.connector_connected_at &&
          prev.connector_first_client === next.connector_first_client &&
          prev.status === next.status) return false;
      COB.state.server = next;
      if (next.connector_connected_at) {
        COB.state.connectors = COB.state.connectors || {};
        COB.state.connectors.cob = "done";
        if (!COB.state.connectedAt) COB.state.connectedAt = next.connector_connected_at;
      }
      try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
      return true;
    }

    async function pollServerRecord() {
      if (!TENANT) return;
      try {
        var r = await sb.from("onboarding_tenants")
          .select("status,connector_connected_at,connector_first_client")
          .eq("id", TENANT.id).maybeSingle();
        if (r && r.data && applyServerRecord(r.data)) rerender();
      } catch (e) {}
    }

    async function hydrateFromServer() {
      if (HYDRATED) return;
      HYDRATED = true;
      var s = await sb.auth.getSession();
      var user = s.data.session && s.data.session.user;
      if (!user) { HYDRATED = false; return; }
      TENANT = await loadOrCreateTenant(user.id, user.email || "");
      applyServerRecord(TENANT);

      // Pull the authoritative onboarding_state row.
      var serverState = null;
      var serverTs = 0;
      try {
        var row = await sb.from("onboarding_state").select("state,updated_at").eq("user_id", user.id).maybeSingle();
        if (row && row.data && row.data.state && typeof row.data.state === "object") {
          serverState = row.data.state;
          serverTs = row.data.state._savedAt || (row.data.updated_at ? Date.parse(row.data.updated_at) : 0);
        }
      } catch (e) {}

      var local = COB.state || {};
      var localTs = local._savedAt || 0;
      var localEmail = (local.user && local.user.email || "").toLowerCase();
      var signedInEmail = (user.email || "").toLowerCase();
      var replace = false;
      if (serverState) {
        if (!localTs) replace = true;
        else if (localEmail && signedInEmail && localEmail !== signedInEmail) replace = true;
        else if (serverTs && serverTs > localTs) replace = true;
      }
      if (replace) {
        // Wipe first so stale keys from a different user do not leak through.
        for (var k in COB.state) { if (Object.prototype.hasOwnProperty.call(COB.state, k)) delete COB.state[k]; }
        Object.assign(COB.state, serverState);
        try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
      } else if (TENANT && TENANT.state && typeof TENANT.state === "object" && !serverState) {
        // Legacy fallback: onboarding_tenants.state was the old home before onboarding_state.
        var tTs = TENANT.state._savedAt || 0;
        if (!localTs || tTs >= localTs) {
          Object.assign(COB.state, TENANT.state);
          try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
        }
      }

      // The signed-in identity is authoritative. It comes from the React layer
      // (already resolved against resolve_tenant_context) or from the session.
      // START-0H: first-run vs returning is decided on SERVER truth only.
      // Any doubt resolves to first-time · showing "welcome back" to a brand
      // new client is the defect being fixed here.
      try {
        var prog = serverState || (TENANT && TENANT.state) || null;
        var reached = prog && typeof prog.reached === "number" ? prog.reached : 0;
        var hasProgress = !!(prog && (prog.consentAt || reached >= 1));
        COB.state.__progress = { returning: hasProgress, reached: reached };
      } catch (e) {
        COB.state.__progress = { returning: false, reached: 0 };
      }

      var ident = (window.__COB_IDENTITY || {});
      var meta = user.user_metadata || {};
      COB.state.user = {
        email: ident.email || user.email,
        first: meta.first_name || (COB.state.user && COB.state.user.first) || "",
        last: meta.last_name || (COB.state.user && COB.state.user.last) || "",
        name: meta.full_name || (COB.state.user && COB.state.user.name) || ident.email || user.email || "",
      };
      if (ident.cid) COB.state.cid = ident.cid;
      try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}

      rerender();
      subscribeRealtime();
      loadFactsInitial();
      setInterval(pollServerRecord, 20000);

      // Tell the host the record is hydrated so it can reveal the surface.
      try {
        if (window.parent && typeof window.parent.__COB_ONBOARDING_READY === "function") {
          window.parent.__COB_ONBOARDING_READY();
        }
      } catch (e) {}
    }


    // --- account control bridge ---
    // Presentation-only exit hatch for the legacy surface. Signs the person out
    // and returns them to the single front door. No routing or gate logic here.
    window.COB_SIGNOUT = async function () {
      try { window.COB_PERSIST && window.COB_PERSIST(); } catch (e) {}
      try { await sb.auth.signOut(); } catch (e) {}
      try {
        var top = window.top || window.parent || window;
        top.location.href = "/signin";
      } catch (e) {
        window.location.href = "/signin";
      }
    };

    // --- persistence bridge ---

    // Debounced (1500ms) full-state upsert into onboarding_state for the signed-in user.
    var PERSIST_T = null;
    window.COB_PERSIST = function () {
      clearTimeout(PERSIST_T);
      PERSIST_T = setTimeout(async function () {
        try {
          var s = await sb.auth.getSession();
          var user = s.data.session && s.data.session.user;
          if (!user) return;
          COB.state._savedAt = Date.now();
          try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
          await sb.from("onboarding_state").upsert({
            user_id: user.id,
            email: user.email || null,
            state: COB.state,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          // Legacy mirror kept during transition.
          try {
            if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
            if (TENANT) await sb.from("onboarding_tenants").update({ state: COB.state }).eq("id", TENANT.id);
          } catch (e) {}
        } catch (e) { /* silent */ }
      }, 1500);
    };

    // COB.save monkey-patch is deferred to the very end of install() so a
    // failure here can never abort any preceding wiring (see bottom of install).

    // --- auth bridge (START-0G) ---
    // ONE authentication. The React layer authenticates at /signin and hands the
    // resolved identity down. Every legacy credential path is hard-disabled here:
    // Google OAuth never creates an email/password credential, so those screens
    // could only ever fail. Connector identity mirroring is gone with them.
    COB.signup = function () { /* disabled: no second door */ };
    COB.signin = function () { /* disabled: no second door */ };
    COB.emailContinue = function () { /* disabled: no second door */ };
    COB.provider = function () { /* disabled: no second door */ };

    // Hash navigation must never leave a legacy screen in browser history.
    COB.go = function (h) {
      try { location.replace(location.pathname + location.search + h); }
      catch (e) { location.hash = h; }
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

    // --- FIRESIDE reactions: wrap fireSend so TAYLOR reacts in one grounded sentence ---
    var origFireSend = COB.fireSend && COB.fireSend.bind(COB);
    COB.fireSend = function (k) {
      var before = (COB.state.answers && COB.state.answers[k]) || "";
      if (origFireSend) { try { origFireSend(k); } catch (e) {} }
      var after = (COB.state.answers && COB.state.answers[k]) || "";
      if (!after || after === before) return; // nudge/frustration/no-op
      (async function () {
        try {
          var s = await sb.auth.getSession();
          var user = s.data.session && s.data.session.user;
          if (!user) return;
          if (!TENANT) TENANT = await loadOrCreateTenant(user.id, user.email || "");
          var instr = "React in ONE grounded sentence (under 25 words) to what the client just shared, as TAYLOR: specific to their words, warm, no questions, no advice, no em dashes. Client said: " + after;
          var r = await sb.functions.invoke("taylor-chat", {
            body: { question: instr, page_ctx: "fireside-reaction:" + k, tenant_id: TENANT ? TENANT.id : null },
          });
          var reaction = r && r.data && r.data.answer;
          if (!reaction) return;
          COB.state.fireReactions = COB.state.fireReactions || {};
          COB.state.fireReactions[k] = String(reaction).trim();
          try { localStorage.setItem(COB.KEY, JSON.stringify(COB.state)); } catch (e) {}
          try { COB.save(); } catch (e) {}
          try { COB.render(); } catch (e) {}
        } catch (e) { /* silent per spec */ }
      })();
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

    // --- COB.save monkey-patch: LAST, defensively wrapped so a throw here
    // cannot prevent boot / auth-listener wiring below. ---
    try {
      if (COB && typeof COB.save === "function") {
        var origSave = COB.save.bind(COB);
        COB.save = function () {
          try { COB.state._savedAt = Date.now(); } catch (e) {}
          origSave();
          try { window.COB_PERSIST && window.COB_PERSIST(); } catch (e) {}
        };
      }
    } catch (e) { /* never block install */ }

    // --- boot ---
    hydrateFromServer();
    sb.auth.onAuthStateChange(function (_evt, sess) {
      if (sess && !HYDRATED) hydrateFromServer();
    });

    try {
      console.log("[COB bridge] installed", {
        speak: typeof COB._speakImpl,
        ear: typeof window.COB_EAR,
        dg: typeof window.COB_DGTOKEN,
        ask: typeof window.COB_ASK,
        fire: typeof window.COB_FIRE,
        persist: typeof window.COB_PERSIST
      });
    } catch (e) {}
  }
})();
