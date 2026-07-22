import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json().catch(() => ({}))
    const text = String(body?.text || '').trim().slice(0, 4000)
    if (!text) {
      return new Response(JSON.stringify({ error: 'text required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const key = Deno.env.get('ELEVENLABS_API_KEY')
    if (!key) {
      return new Response(JSON.stringify({ error: 'ELEVENLABS_API_KEY missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM'
    const model = Deno.env.get('ELEVENLABS_MODEL') || 'eleven_turbo_v2_5'

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`
    const payload = JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    })

    let r: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'content-type': 'application/json',
          'accept': 'audio/mpeg',
        },
        body: payload,
      })
      if (r.status !== 429) break
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1) + Math.random() * 300))
    }

    if (!r || !r.ok) {
      const detail = r ? (await r.text()).slice(0, 300) : 'no response'
      console.error('elevenlabs tts failed', r?.status, detail)
      return new Response(JSON.stringify({ error: 'tts_failed', detail }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const audio = await r.arrayBuffer()
    return new Response(audio, {
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
