import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const MAX_BYTES = 15 * 1024 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const blob = await req.blob()
    if (!blob || !blob.size) {
      return new Response(JSON.stringify({ error: 'audio required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (blob.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'audio too large' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const fd = new FormData()
    fd.append('file', blob, 'audio.webm')
    fd.append('model', 'whisper-1')

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    })
    if (!r.ok) {
      const t = await r.text()
      console.error('[taylor-ear] upstream failure', r.status, t.slice(0, 300))
      return new Response(JSON.stringify({ error: 'ear_failed', status: r.status, detail: t.slice(0, 300) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const j = await r.json()
    return new Response(JSON.stringify({ text: (j && j.text) || '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
