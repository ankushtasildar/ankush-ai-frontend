// analysis.js — Final unified version
// Self-contained: no external scan-cache module dependency
// Uses 'scan_cache' table (correct name, created in migration)
// Cache-first: serves all users from shared scan, falls back to live Claude call

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','AMD','ORCL',
  'JPM','GS','BAC','V','MA','XOM','CVX','LLY','UNH','JNJ',
  'PLTR','SNOW','NET','CRWD','DDOG','MDB','COIN','HOOD',
  'SPY','QQQ','IWM','XLK','XLE','XLF','GLD','TLT',
  'MSTR','RKLB','SMCI','ARM','DELL','MU','INTC','QCOM',
  'MRNA','GILD','ABBV','PFE','REGN','VRTX',
  'COST','WMT','TGT','HD','NKE','LULU','SBUX',
]

function isMarketHours() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const d = et.getDay(), m = et.getHours() * 60 + et.getMinutes()
  return d >= 1 && d <= 5 && m >= 570 && m < 960
}

function getCacheTTL() {
  return isMarketHours() ? 15 * 60 * 1000 : 60 * 60 * 1000
}

async function getCachedScan() {
  try {
    const { data, error } = await supabase
      .from('scan_cache')
      .select('scan_data, created_at, setup_count, market_mood, vix')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (error || !data) return null
    const age = Date.now() - new Date(data.created_at).getTime()
    if (age < getCacheTTL()) {
      return { ...data.scan_data, cached: true, cacheAge: Math.round(age / 60000), servedAt: new Date().toISOString() }
    }
    return null
  } catch(e) { console.warn('[analysis] cache read error:', e.message); return null }
}

async function saveScan(result) {
  try {
    await supabase.from('scan_cache').insert({
      scan_data: result,
      setup_count: result.setups?.length || 0,
      market_mood: result.marketContext?.mood || 'Unknown',
      vix: result.marketContext?.vix || null,
      spy_change: result.marketContext?.spyChange || null,
    })
  } catch(e) { console.warn('[analysis] cache save error:', e.message) }
}

async function recordSetups(setups) {
  if (!setups?.length) return
  try {
    const rows = setups.slice(0, 12).map(s => ({
      symbol: s.symbol,
      setup_type: s.setupType || s.setup_type || 'AI Scan',
      bias: s.bias,
      entry_high: s.entryHigh || s.entry_high || null,
      entry_low: s.entryLow || s.entry_low || null,
      stop_loss: s.stopLoss || s.stop_loss || null,
      target_1: s.target1 || s.target_1 || null,
      confidence: s.confidence || 7,
      frameworks: s.frameworks || [],
      rr_ratio: s.rrRatio || s.rr_ratio || null,
      scan_date: new Date().toISOString().split('T')[0],
    }))
    await supabase.from('setup_records').insert(rows)
  } catch(e) { console.warn('[analysis] record setups error:', e.message) }
}

async function getMarketContext() {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.ankushai.org'
    const r = await fetch(`${base}/api/market?action=context`, { signal: AbortSignal.timeout(8000) })
    return await r.json()
  } catch(e) { return { spy: 0, spyChange: 0, vix: 20, mood: 'Unknown', regime: 'neutral' } }
}

async function getPatterns() {
  try {
    const { data } = await supabase
      .from('ai_learned_patterns')
      .select('pattern_name, works_best_when, fails_when, recommended_iv_strategy, prompt_weight')
      .order('prompt_weight', { ascending: false })
      .limit(8)
    return data || []
  } catch(e) { return [] }
}

async function getMacroEvents() {
  try {
    const { data } = await supabase
      .from('macro_events')
      .select('event_date, title, impact')
      .gte('event_date', new Date().toISOString().split('T')[0])
      .order('event_date')
      .limit(5)
    return data || []
  } catch(e) { return [] }
}

async function runFullScan() {
  // 1. Check cache first
  const cached = await getCachedScan()
  if (cached) { console.log('[analysis] Serving from cache, age:', cached.cacheAge, 'min'); return cached }

  console.log('[analysis] Cache miss — running live scan')
  const [marketContext, patterns, macroEvents] = await Promise.all([getMarketContext(), getPatterns(), getMacroEvents()])

  const patternCtx = patterns.length > 0
    ? `\n\nLEARNED PATTERNS (calibrate confidence accordingly):\n${patterns.map(p => `• ${p.pattern_name} [weight:${p.prompt_weight}]: works when ${p.works_best_when} | fails when ${p.fails_when}`).join('\n')}`
    : ''
  const macroCtx = macroEvents.length > 0
    ? `\n\nUPCOMING MACRO EVENTS:\n${macroEvents.map(e => `• ${e.event_date}: ${e.title} [${e.impact}]`).join('\n')}`
    : ''

  const prompt = `You are AnkushAI — institutional options trading intelligence running 100 analyst frameworks.

MARKET NOW: SPY $${(marketContext.spy||0).toFixed(2)} (${(marketContext.spyChange||0) >= 0 ? '+' : ''}${(marketContext.spyChange||0).toFixed(2)}%), VIX ${marketContext.vix||20} (${marketContext.mood}), Regime: ${marketContext.regime}
${patternCtx}${macroCtx}

SCAN UNIVERSE: ${SCAN_UNIVERSE.slice(0, 45).join(', ')}

Find 8-12 highest-conviction trading setups RIGHT NOW. Apply:
- Technical: EMA stack (20/50/200), RSI, MACD, volume, breakout/breakdown patterns
- Options: IV rank, earnings proximity, unusual activity, spread vs directional
- Macro: sector momentum, VIX regime ${marketContext.regime === 'risk_off' ? '⚠️ RISK-OFF — be selective, prefer hedged plays' : ''}
- Patterns: use learned weights above to bias confidence scores

RULES:
1. NO penny stocks (price < $5), no <$500M market cap
2. Every setup needs EXACT dollar levels — no vague ranges  
3. R/R ≥ 2:1 minimum. VIX > 25 → prefer spreads over naked longs
4. Confidence 1-10 based on setup quality + regime fit + learned patterns

Return ONLY a JSON array, no markdown:
[{
  "symbol": "NVDA",
  "setupType": "EMA Breakout + Volume Confirmation",
  "bias": "bullish",
  "confidence": 8,
  "entryLow": 870,
  "entryHigh": 885,
  "stopLoss": 855,
  "target1": 920,
  "target2": 960,
  "rrRatio": 3.2,
  "ivRank": 38,
  "recommendedTrade": "Buy June 900 calls at ~$3.50",
  "frameworks": ["ema_breakout", "momentum", "volume"],
  "analysis": "Clear EMA stack with 3x volume surge on breakout. RSI 58 — room to run. VIX at 27 warrants defined-risk via calls rather than stock.",
  "urgency": "today"
}]`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  })

  let setups = []
  const text = msg.content[0]?.text || '[]'
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    setups = Array.isArray(parsed) ? parsed : (parsed.setups || [])
  } catch(e) {
    console.error('[analysis] JSON parse error:', e.message, 'text[:200]:', text.substring(0, 200))
    // Try to extract array from response
    const match = text.match(/\[[\s\S]*\]/)
    if (match) { try { setups = JSON.parse(match[0]) } catch(e2) {} }
  }

  const result = { setups, marketContext, patterns: patterns.length, generatedAt: new Date().toISOString(), cached: false }

  // Save to cache + record setups (non-blocking)
  Promise.all([saveScan(result), recordSetups(setups)]).catch(e => console.warn('[analysis] post-scan save:', e.message))

  return result
}

async function analyzeSingle(symbol) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    messages: [{ role: 'user', content: `Analyze ${symbol} for a trade RIGHT NOW. Provide: current technical setup (EMA stack, RSI, MACD), exact entry zone, stop loss, two targets, R/R ratio, and recommended options play with strike/expiry. Be specific with dollar levels.` }]
  })
  return { symbol, analysis: msg.content[0]?.text, generatedAt: new Date().toISOString() }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const type = (req.query.type || req.query.action || 'scan').toLowerCase()
  const symbol = req.query.symbol?.toUpperCase()

  try {
    if (type === 'scan') {
      const result = await runFullScan()
      return res.json(result)
    }
    if (type === 'single' && symbol) return res.json(await analyzeSingle(symbol))
    if (type === 'cache_status') {
      const cached = await getCachedScan()
      return res.json({ hasCachedScan: !!cached, cacheAge: cached?.cacheAge, cacheExpiry: cached ? Math.round((getCacheTTL()/60000) - (cached.cacheAge||0)) : 0 })
    }
    return res.status(400).json({ error: 'Unknown type. Use: scan, single, cache_status' })
  } catch(e) {
    console.error('[analysis] handler error:', e.message)
    return res.status(500).json({ error: e.message, type })
  }
}
