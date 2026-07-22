import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const key = Deno.env.get('DEEPGRAM_API_KEY')
    if (!key) {
      return new Response(JSON.stringify({ error: 'DEEPGRAM_API_KEY missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const r = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    })

    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300)
      console.error('deepgram grant failed', r.status, detail)
      return new Response(JSON.stringify({ error: 'dg_token_failed', detail }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const j = await r.json().catch(() => ({} as Record<string, unknown>))
    const token = (j as any).access_token || (j as any).key || null
    const expires_in = (j as any).expires_in || (j as any).ttl_seconds || 60

    if (!token) {
      console.error('deepgram grant missing token field', JSON.stringify(j).slice(0, 300))
      return new Response(JSON.stringify({ error: 'dg_token_failed', detail: 'no token in response' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ token, expires_in }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
