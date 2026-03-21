// api/intelligence.js — Intelligence engine stats endpoint
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action || 'stats'

  try {
    if (action === 'stats') {
      const [patternsR, setupsR, outcomesR, cacheR] = await Promise.all([
        supabase.from('ai_learned_patterns').select('*').order('prompt_weight', { ascending: false }),
        supabase.from('setup_records').select('id, outcome, bias, symbol, scan_date'),
        supabase.from('setup_outcomes').select('id, outcome'),
        supabase.from('scan_cache').select('id, setup_count, market_mood, created_at').order('created_at', { ascending: false }).limit(1),
      ])

      const setups = setupsR.data || []
      const outcomes = setups.filter(s => s.outcome)
      const wins = outcomes.filter(s => s.outcome === 'win')

      return res.json({
        patterns: patternsR.data || [],
        overview: {
          total_setups: setups.length,
          open_setups: setups.filter(s => !s.outcome).length,
          resolved_setups: outcomes.length,
          win_rate_pct: outcomes.length > 0 ? (wins.length / outcomes.length * 100) : null,
          wins: wins.length,
          losses: outcomes.filter(s => s.outcome === 'loss').length,
        },
        latest_cache: cacheR.data?.[0] || null,
        generated_at: new Date().toISOString()
      })
    }

    if (action === 'patterns') {
      const { data } = await supabase.from('ai_learned_patterns').select('*').order('prompt_weight', { ascending: false })
      return res.json({ patterns: data || [] })
    }

    return res.status(400).json({ error: 'Unknown action. Use: stats, patterns' })
  } catch(e) {
    console.error('[intelligence]', e.message)
    return res.status(500).json({ error: e.message })
  }
}