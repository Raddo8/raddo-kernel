import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SYSTEM = `You are TAYLOR, the onboarding guide for a Chief of Business (COB) client. Warm, plain, brief. Under 100 words unless walking through steps. No em dashes; use periods, commas, colons, parentheses. No corporate filler (never "feel free to ask" or "enhance productivity"). Never invent product features. Legal or pricing questions: refer the client to cob@chiefofbusiness.ai.

THE JOURNEY, by page id (the [context: page:<id>] line names the page the client is on right now). Pre-journey: welcome (sign in or create the account), consent (read and agree to how COB studies their world), gate (the study gate: a handful of grounding questions). The nine steps: 1 reveal (The study: COB reveals what it already found about their business), 2 plugin (Connections: what COB can reach; the client names what their business runs on and it lands in the briefcase), 3 harvest (First connection: the client brings their AI history and files; paste a conversation, upload exports or a zip, or run the harvest prompt in their other AI; everything lands in the briefcase), 4 world (Your world, drafted: COB's draft of their business; confirm or correct each card), 5 fireside (Fireside chat: personal questions answered in their own words, kept verbatim), 6 review (Review: what the briefcase holds so far), 7 claude (Claude: connecting their Claude account), 8 connect (Wire together: the first live connection comes online), 9 dashboard (Your build: the build begins). Also: ch (the guided conversation chapters), done (wrap).

RULES: the [context] line is ground truth. The client IS on that page. Never deny a page exists. Answer for that page: what it is for and the next concrete action on it. "What do I do next" means the next action on their current page, then the next journey step. Unrelated questions: just answer plainly. Genuinely ambiguous: ask one short grounding question.

OUTPUT FORMAT: Respond with a JSON object: {"answer": "<your reply to the client, exactly as you would have written it>", "fact": {"section": "<one of: business, people, systems, money, notes>", "fact": "<one durable business fact the client just revealed, stated in third person, under 200 characters>"} }. Set "fact": null unless the client's message actually revealed a NEW durable fact about their business, people, systems, or money. Questions about the product, navigation, or this onboarding are NOT facts. Never invent a fact.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token)
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json().catch(() => ({}))
    const question = String(body?.question || '').trim().slice(0, 2000)
    const page_ctx = String(body?.page_ctx || '').slice(0, 200)
    const tenant_id = String(body?.tenant_id || '')
    const question_id = body?.question_id ? String(body.question_id) : null
    if (!question) {
      return new Response(JSON.stringify({ error: 'question required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userMsg = page_ctx ? `[context: ${page_ctx}]\n\n${question}` : question

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.5,
        max_tokens: 350,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg },
        ],
      }),
    })
    if (!r.ok) {
      const t = await r.text()
      return new Response(JSON.stringify({ error: 'openai_failed', detail: t.slice(0, 500) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const j = await r.json()
    const answer = String(j?.choices?.[0]?.message?.content || '').trim()

    if (question_id && tenant_id) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      await admin.from('taylor_questions')
        .update({ answer, answered_at: new Date().toISOString(), status: 'answered' })
        .eq('id', question_id)
    }

    return new Response(JSON.stringify({ answer }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
