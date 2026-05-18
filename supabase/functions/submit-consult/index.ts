// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type DiscStyle = "D" | "I" | "S" | "C";

type DiscResponse = {
  rowId: string;
  selections: string[];
};

type ConsultSubmissionPayload = {
  email: string;
  name: string;
  phone?: string;
  occupation?: string;
  currentStateWordIds: string[];
  aspirationWordIds: string[];
  appSelections: string[];
  otherAppsText?: string;
  discResponses: DiscResponse[];
  discAllowMultiSelect: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const themePrefixMap = [
  "clarity",
  "cash",
  "delivery",
  "sales",
  "people",
  "systems",
  "leadership",
  "capacity",
  "visibility",
  "strategy",
] as const;

function analyzeThemeGap(payload: ConsultSubmissionPayload) {
  return themePrefixMap.map((theme) => {
    const currentSelections = payload.currentStateWordIds.filter((id) => id.startsWith(`${theme}-`));
    const aspirationSelections = payload.aspirationWordIds.filter((id) => id.startsWith(`${theme}-`));
    const currentPositive = currentSelections.filter((id) => id.includes("-positive-")).length;
    const currentNegative = currentSelections.filter((id) => id.includes("-negative-")).length;

    return {
      theme,
      currentPositive,
      currentNegative,
      aspiration: aspirationSelections.length,
      growthGap: aspirationSelections.length - currentPositive,
      frictionLoad: currentNegative,
    };
  });
}

function analyzeDisc(payload: ConsultSubmissionPayload) {
  const scores: Record<DiscStyle, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const response of payload.discResponses) {
    for (const selection of response.selections) {
      const style = selection.slice(-1).toUpperCase() as DiscStyle;
      if (style in scores) {
        scores[style] += 1;
      }
    }
  }

  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([style]) => style as DiscStyle);
  const primaryStyle = ranked[0] ?? "C";
  const secondaryStyle = ranked[1] ?? primaryStyle;
  const isHybrid = Math.abs(scores[primaryStyle] - scores[secondaryStyle]) <= 2;

  return {
    scores,
    primaryStyle,
    secondaryStyle,
    isHybrid,
    personaNameCandidates: [
      `${primaryStyle}-${secondaryStyle}`,
      `${primaryStyle} lead`,
      `${secondaryStyle} support`,
    ],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const payload = (await request.json().catch(() => null)) as ConsultSubmissionPayload | null;

  if (!payload?.email || typeof payload.email !== "string") {
    return jsonResponse({ error: "A valid email is required." }, 400);
  }

  if (!payload.name || typeof payload.name !== "string" || payload.name.trim().length === 0) {
    return jsonResponse({ error: "Name is required." }, 400);
  }

  // Defensive shape checks
  payload.currentStateWordIds = Array.isArray(payload.currentStateWordIds) ? payload.currentStateWordIds : [];
  payload.aspirationWordIds = Array.isArray(payload.aspirationWordIds) ? payload.aspirationWordIds : [];
  payload.appSelections = Array.isArray(payload.appSelections) ? payload.appSelections : [];
  payload.discResponses = Array.isArray(payload.discResponses) ? payload.discResponses : [];

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Backend not configured." }, 500);
  }

  const themeGapAnalysis = analyzeThemeGap(payload);
  const disc = analyzeDisc(payload);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const insertResult = await supabase
    .from("consult_submissions")
    .insert({
      email: payload.email,
      name: payload.name.trim(),
      phone: payload.phone?.trim() || null,
      occupation: payload.occupation?.trim() || null,
      current_state_words: payload.currentStateWordIds,
      aspiration_state_words: payload.aspirationWordIds,
      theme_gap_analysis: themeGapAnalysis,
      app_inventory: payload.appSelections,
      other_apps_text: payload.otherAppsText ?? null,
      disc_responses: payload.discResponses,
      disc_scores: disc.scores,
      primary_style: disc.primaryStyle,
      secondary_style: disc.secondaryStyle,
      is_hybrid: disc.isHybrid,
      persona_name_candidates: disc.personaNameCandidates,
    })
    .select("id")
    .single();

  if (insertResult.error) {
    console.error("[submit-consult] insert error:", insertResult.error);
    return jsonResponse({ error: "Could not record submission." }, 502);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendTarget = Deno.env.get("RESEND_TO_EMAIL") ?? "cob.brahan@gmail.com";

  if (resendApiKey) {
    const summaryLines = [
      `Email: ${payload.email}`,
      payload.name ? `Name: ${payload.name}` : null,
      ``,
      `Primary style: ${disc.primaryStyle}`,
      `Secondary style: ${disc.secondaryStyle}`,
      `Hybrid: ${disc.isHybrid ? "Yes" : "No"}`,
      `DISC scores: D=${disc.scores.D} I=${disc.scores.I} S=${disc.scores.S} C=${disc.scores.C}`,
      ``,
      `Current-state words selected: ${payload.currentStateWordIds.length}`,
      `Aspiration words selected: ${payload.aspirationWordIds.length}`,
      `Apps tagged: ${payload.appSelections.length}`,
      payload.otherAppsText ? `Other apps: ${payload.otherAppsText}` : null,
      ``,
      `Theme gap analysis:`,
      ...themeGapAnalysis.map(
        (t) =>
          `  ${t.theme}: now+${t.currentPositive}/-${t.currentNegative} · next ${t.aspiration} · growth gap ${t.growthGap} · friction ${t.frictionLoad}`,
      ),
      ``,
      `Submission id: ${insertResult.data?.id}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "RADDO Consult <onboarding@resend.dev>",
          to: [resendTarget],
          subject: `New consult submission · ${payload.email}`,
          text: summaryLines,
        }),
      });
      if (!resendResponse.ok) {
        const errText = await resendResponse.text();
        console.error("[submit-consult] resend send failed:", resendResponse.status, errText);
      }
    } catch (e) {
      console.error("[submit-consult] resend exception:", e);
    }
  } else {
    console.warn("[submit-consult] RESEND_API_KEY not set · skipping notification email");
  }

  return jsonResponse({ ok: true, id: insertResult.data?.id });
});
