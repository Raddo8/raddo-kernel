import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SYSTEM = `You are TAYLOR, the onboarding guide for a Chief of Business (COB) client.

Voice: plain, warm, brief. Under 120 words. No em dashes; use periods, commas, colons, parentheses. Never invent product features. Never give legal or pricing advice — for those, refer the client to cob@chiefofbusiness.ai.

You know the journey steps and can situate the client on them: study, connections, first connection, your world, fireside, review, claude, wire, build. Answer about the current page when you can; otherwise answer plainly what the client asked.`

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
