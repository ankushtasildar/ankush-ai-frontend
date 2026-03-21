// analysis.js v7 — REAL PRICES MANDATORY
// Architecture:
// 1. Fetch real prices for ALL universe symbols via /api/market
// 2. Inject real prices into Claude prompt — Claude is FORBIDDEN from making up prices
// 3. Claude picks which symbols have setups and derives % levels from REAL price
// 4. We VALIDATE output: any setup whose entry deviates >15% from real price is rejected
// 5. Save validated setups to scan_cache and setup_records

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','AMD','ORCL',
  'JPM','GS','BAC','V','MA','XOM','LLY','UNH','JNJ',
  'PLTR','NET','CRWD','COIN',
  'SPY','QQQ','IWM','XLK','XLE','XLF','GLD','TLT',
  'MSTR','RKLB','ARM','MU','INTC','QCOM',
  'MRNA','GILD','ABBV','COST','WMT','HD','NKE',
]

function isMarketHours() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const m = et.getHours() * 60 + et.getMinutes(), d = et.getDay()
  return d >= 1 && d <= 5 && m >= 570 && m < 960
}

async function getCache() {
  try {
    const { data, error } = await supabase.from('scan_cache')
      .select('scan_data,created_at').order('created_at', { ascending: false }).limit(1).single()
    if (error || !data) return null
    const age = Date.now() - new Date(data.created_at).getTime()
    const ttl = isMarketHours() ? 15 * 60000 : 60 * 60000
    if (age < ttl) return { ...data.scan_data, cached: true, cacheAge: Math.round(age / 60000) }
    return null
  } catch(e) { return null }
}

async function saveCache(result) {
  try {
    await supabase.from('scan_cache').insert({
      scan_data: result,
      setup_count: result.setups?.length || 0,
      market_mood: result.marketContext?.mood,
      vix: result.marketContext?.vix,
      spy_change: result.marketContext?.spyChange,
    })
  } catch(e) { console.warn('[analysis] cache save:', e.message) }
}

async function recordSetups(setups, prices) {
  if (!setups?.length) return
  try {
    const rows = setups.map(s => {
      const realPrice = prices[s.symbol]
      return {
        symbol: s.symbol,
        setup_type: s.setupType || 'AI Scan',
        bias: s.bias,
        entry_high: s.entryHigh || null,
        entry_low: s.entryLow || null,
        stop_loss: s.stopLoss || null,
        target_1: s.target1 || null,
        confidence: s.confidence || 7,
        frameworks: s.frameworks || [],
        rr_ratio: s.rrRatio || null,
        scan_date: new Date().toISOString().split('T')[0],
      }
    })
    await supabase.from('setup_records').insert(rows)
  } catch(e) { console.warn('[analysis] record setups:', e.message) }
}

// Fetch real prices for all symbols
async function fetchRealPrices(symbols) {
  try {
    const base = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://www.ankushai.org'
    // Fetch in batches of 20
    const batches = []
    for (let i = 0; i < symbols.length; i += 20) {
      batches.push(symbols.slice(i, i + 20))
    }
    const results = {}
    await Promise.all(batches.map(async batch => {
      const r = await fetch(base + '/api/market?action=quotes&symbols=' + batch.join(','), { signal: AbortSignal.timeout(12000) })
      const data = await r.json()
      if (Array.isArray(data)) {
        data.forEach(q => { if (q.symbol && q.price > 0) results[q.symbol] = q })
      }
    }))
    return results
  } catch(e) { console.warn('[analysis] fetchRealPrices error:', e.message); return {} }
}

async function getMarketContext() {
  try {
    const base = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://www.ankushai.org'
    return await fetch(base + '/api/market?action=context', { signal: AbortSignal.timeout(8000) }).then(r => r.json())
  } catch(e) { return { spy: 0, spyChange: 0, vix: 20, mood: 'Unknown', regime: 'neutral' } }
}

async function getPatterns() {
  try {
    const { data } = await supabase.from('ai_learned_patterns')
      .select('pattern_name,works_best_when,fails_when,prompt_weight').order('prompt_weight', { ascending: false }).limit(6)
    return data || []
  } catch(e) { return [] }
}

// Validate setups — reject any with prices far from real
function validateSetups(setups, prices) {
  const valid = []
  const rejected = []
  
  for (const s of setups) {
    const real = prices[s.symbol]
    if (!real || !real.price) {
      rejected.push({ symbol: s.symbol, reason: 'no real price available' })
      continue
    }
    
    const realPrice = real.price
    const entryMid = s.entryHigh && s.entryLow ? (s.entryHigh + s.entryLow) / 2 : s.entryHigh || s.entryLow
    
    if (entryMid) {
      const deviation = Math.abs(entryMid - realPrice) / realPrice
      if (deviation > 0.15) {
        rejected.push({ symbol: s.symbol, reason: 'entry ' + entryMid.toFixed(2) + ' deviates ' + (deviation*100).toFixed(1) + '% from real price ' + realPrice.toFixed(2) })
        continue
      }
    }
    
    // Attach real price data to setup
    valid.push({
      ...s,
      currentPrice: realPrice,
      priceChange: real.changePercent || 0,
      volume: real.volume || 0,
      priceSource: real.source || 'unknown',
      priceVerified: true,
    })
  }
  
  if (rejected.length > 0) console.warn('[analysis] REJECTED', rejected.length, 'setups with wrong prices:', JSON.stringify(rejected))
  console.log('[analysis] VALIDATED', valid.length, '/', setups.length, 'setups')
  return valid
}

async function runFullScan() {
  // 1. Check cache
  const cached = await getCache()
  if (cached) { console.log('[analysis] cache hit, age:', cached.cacheAge, 'min'); return cached }

  console.log('[analysis] cache miss — running live scan with REAL PRICES')

  // 2. Fetch everything in parallel: real prices, market context, patterns
  const [prices, marketContext, patterns] = await Promise.all([
    fetchRealPrices(SCAN_UNIVERSE),
    getMarketContext(),
    getPatterns(),
  ])

  const priceCount = Object.keys(prices).length
  console.log('[analysis] fetched', priceCount, 'real prices')

  if (priceCount < 10) {
    console.error('[analysis] insufficient price data — only', priceCount, 'prices fetched')
    return { setups: [], error: 'Could not fetch sufficient real price data', marketContext }
  }

  // 3. Build price table for prompt — ALL real prices injected
  const priceTable = SCAN_UNIVERSE
    .filter(sym => prices[sym])
    .map(sym => {
      const q = prices[sym]
      const chg = q.changePercent != null ? (q.changePercent >= 0 ? '+' : '') + q.changePercent.toFixed(2) + '%' : 'N/A'
      return sym + ': $' + q.price.toFixed(2) + ' (' + chg + ')'
    }).join(' | ')

  const patternCtx = patterns.length > 0
    ? '\nLEARNED PATTERNS: ' + patterns.map(p => p.pattern_name + '[w:' + p.prompt_weight + ']').join(', ')
    : ''

  // 4. Build prompt with real prices embedded
  const prompt = `You are AnkushAI, an institutional options trading intelligence system.

CRITICAL RULE: You MUST use ONLY the exact prices provided below. DO NOT invent, estimate, or recall prices from memory. Every single price level in your output (entry, stop, target) MUST be derived mathematically from the REAL CURRENT PRICES listed here.

REAL CURRENT PRICES (live market data as of scan time):
${priceTable}

MARKET CONTEXT: SPY $${(marketContext.spy||0).toFixed(2)} (${(marketContext.spyChange||0)>=0?'+':''}${(marketContext.spyChange||0).toFixed(2)}%), VIX ${marketContext.vix||20} (${marketContext.mood}), Regime: ${marketContext.regime}${patternCtx}

TASK: Analyze these real prices and identify 6-10 stocks with HIGH-CONVICTION setups RIGHT NOW.

RULES FOR PRICE LEVELS:
- entryLow and entryHigh: within 2% of current real price (this is where to BUY near current price)
- stopLoss: 3-8% below current price for longs, 3-8% above for shorts
- target1: 8-15% from current price (realistic, not fantasy)
- target2: 15-25% from current price
- R/R must be ≥ 2:1 calculated from REAL prices

SELECTION CRITERIA: Pick symbols showing clear technical setups (EMA alignment, volume confirmation, breakout/breakdown, support/resistance). Consider VIX regime ${marketContext.vix > 25 ? '(HIGH VIX — prefer defined-risk spreads)' : '(normal — directional plays ok)'}.

Return ONLY a JSON array with NO markdown:
[{
  "symbol": "NVDA",
  "setupType": "EMA Stack Momentum",
  "bias": "bullish",
  "confidence": 8,
  "entryLow": 170.50,
  "entryHigh": 174.00,
  "stopLoss": 164.00,
  "target1": 185.00,
  "target2": 195.00,
  "rrRatio": 2.8,
  "ivRank": 45,
  "recommendedTrade": "Buy May 175 calls ~$4.20",
  "frameworks": ["ema_stack", "momentum"],
  "analysis": "NVDA at $172.70, EMA20 holding, volume above average. Entry near current price with stop below recent low at $164.",
  "urgency": "today"
}]`

  // 5. Call Claude
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  })

  // 6. Parse
  let rawSetups = []
  const text = msg.content[0]?.text || '[]'
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    rawSetups = Array.isArray(parsed) ? parsed : (parsed.setups || [])
  } catch(e) {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) { try { rawSetups = JSON.parse(match[0]) } catch(e2) {} }
    console.error('[analysis] JSON parse error:', e.message)
  }

  // 7. VALIDATE — reject any setup with prices far from reality
  const setups = validateSetups(rawSetups, prices)

  const result = {
    setups,
    marketContext,
    patterns: patterns.length,
    pricesUsed: priceCount,
    generatedAt: new Date().toISOString(),
    cached: false,
    rejected: rawSetups.length - setups.length,
  }

  // 8. Save validated results
  Promise.all([saveCache(result), recordSetups(setups, prices)]).catch(e => console.warn('[analysis] post-scan save:', e.message))
  return result
}

async function analyzeSingle(symbol) {
  // Fetch real price first
  const base = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://www.ankushai.org'
  let realPrice = null
  try {
    const r = await fetch(base + '/api/market?action=quote&symbol=' + symbol, { signal: AbortSignal.timeout(8000) })
    const d = await r.json()
    realPrice = d.price || d[0]?.price
  } catch(e) {}

  const priceCtx = realPrice ? `REAL CURRENT PRICE: ${symbol} = $${realPrice.toFixed(2)}. ALL levels must be derived from this price.` : 'WARNING: Could not fetch real price. Do NOT invent prices.'

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    messages: [{ role: 'user', content: priceCtx + '\n\nAnalyze ' + symbol + ' for a trade right now. Provide exact entry zone (within 2% of real price), stop loss (3-8% away), two targets, R/R, and recommended options play with strike/expiry. Show your math.' }]
  })
  return { symbol, currentPrice: realPrice, analysis: msg.content[0]?.text, generatedAt: new Date().toISOString() }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const type = (req.query.type || req.query.action || 'scan').toLowerCase()
  const symbol = req.query.symbol?.toUpperCase()

  try {
    if (type === 'scan') return res.json(await runFullScan())
    if (type === 'single' && symbol) return res.json(await analyzeSingle(symbol))
    if (type === 'cache_status') {
      const c = await getCache()
      return res.json({ hasCachedScan: !!c, cacheAge: c?.cacheAge, setupCount: c?.setups?.length || 0 })
    }
    return res.status(400).json({ error: 'Use: scan, single, cache_status' })
  } catch(e) {
    console.error('[analysis] handler error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
