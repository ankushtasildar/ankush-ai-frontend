/**
 * /api/ai — Unified AI proxy for AnkushAI
 *
 * All AI calls route through here. Benefits:
 * - Single place to add per-user rate limiting
 * - Can inject platform system context
 * - Anthropic API key server-side only
 * - Usage logging if needed
 *
 * POST { messages, system?, max_tokens?, model? }
 * Returns Anthropic message response
 */

const ANTHROPIC_MODELS = {
  fast:     'claude-haiku-4-5-20251001',    // quick responses, cost-effective
  standard: 'claude-sonnet-4-20250514',     // default — analysis, coaching
  powerful: 'claude-opus-4-20250514',       // deep analysis (future)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const {
    messages,
    system,
    max_tokens = 1000,
    model = 'standard',
    context,  // optional: 'journal_coach' | 'position_analysis' | 'signals' | 'eod_debrief'
  } = req.body || {}

  if (!messages?.length) {
    return res.status(400).json({ error: 'messages required' })
  }

  // Resolve model tier
  const resolvedModel = ANTHROPIC_MODELS[model] || ANTHROPIC_MODELS.standard

  // Inject platform-wide system context
  const platformContext = `You are an AI assistant embedded in AnkushAI, a professional trading intelligence platform. You provide educational market analysis and trading coaching. You never give specific buy/sell recommendations or price targets. All analysis is for educational purposes.`

  const finalSystem = system
    ? `${platformContext}\n\n${system}`
    : platformContext

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: Math.min(max_tokens, 2000), // cap at 2000
        system: finalSystem,
        messages,
      }),
    })

    if (!r.ok) {
      const err = await r.text()
      console.error('Anthropic API error:', r.status, err.substring(0, 200))
      return res.status(502).json({ error: 'AI service error', status: r.status })
    }

    const data = await r.json()
    return res.status(200).json(data)
  } catch (e) {
    console.error('AI proxy error:', e.message)
    return res.status(503).json({ error: 'AI service unavailable' })
  }
}
