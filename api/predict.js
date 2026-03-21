// api/predict.js — AnkushAI Predictive Modeling Engine
// Analyzes macro + technical + historical factors to produce
// probabilistic outcome scenarios, not simple buy/sell signals
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const POLYGON_KEY = process.env.POLYGON_API_KEY

async function getRealPrice(symbol) {
  try {
    const r = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`,
      {signal: AbortSignal.timeout(6000)}
    )
    const d = await r.json()
    const res = d.results?.[0]
    if (!res) return null
    return { price: res.c, open: res.o, high: res.h, low: res.l, volume: res.v, vwap: res.vw }
  } catch(e) { return null }
}

async function getHistoricalBars(symbol, days=90) {
  try {
    const to = new Date(); to.setDate(to.getDate()-1)
    const from = new Date(); from.setDate(from.getDate()-days)
    const fmt = d => d.toISOString().split('T')[0]
    const r = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=${days}&apiKey=${POLYGON_KEY}`,
      {signal: AbortSignal.timeout(10000)}
    )
    const d = await r.json()
    return d.results || []
  } catch(e) { return [] }
}

async function getMarketContext() {
  try {
    const [spyR, vixR] = await Promise.all([
      fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/prev?adjusted=true&apiKey=${POLYGON_KEY}`, {signal:AbortSignal.timeout(5000)}).then(r=>r.json()),
      fetch(`https://api.polygon.io/v2/aggs/ticker/VXX/prev?adjusted=true&apiKey=${POLYGON_KEY}`, {signal:AbortSignal.timeout(5000)}).then(r=>r.json()),
    ])
    const spy = spyR.results?.[0]
    const vxx = vixR.results?.[0]
    const spyChg = spy ? ((spy.c - spy.o) / spy.o * 100) : 0
    const vixApprox = vxx?.c || 25
    return {
      spy: spy?.c || 0, spyChange: spyChg,
      vix: vixApprox,
      regime: vixApprox > 30 ? 'high_fear' : vixApprox > 20 ? 'elevated_risk' : 'normal',
      mood: vixApprox > 30 ? 'Fear' : vixApprox > 20 ? 'Caution' : 'Neutral'
    }
  } catch(e) { return { spy: 0, spyChange: 0, vix: 20, regime: 'normal', mood: 'Unknown' } }
}

async function getOutcomeHistory(symbol) {
  try {
    const { data } = await supabase.from('setup_records')
      .select('bias, outcome, confidence, rr_ratio, created_at')
      .eq('symbol', symbol)
      .not('outcome', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!data?.length) return null
    const wins = data.filter(r => r.outcome === 'win').length
    return { total: data.length, winRate: (wins / data.length * 100).toFixed(0), recentOutcomes: data.slice(0,5).map(r=>r.outcome) }
  } catch(e) { return null }
}

// Technical calculations
function calcEMAs(bars) {
  if (bars.length < 20) return { ema20: null, ema50: null, ema200: null, trend: 'insufficient data' }
  const closes = bars.map(b => b.c)
  function ema(period) {
    const k = 2/(period+1)
    let val = closes.slice(0,period).reduce((a,b)=>a+b)/period
    for (let i = period; i < closes.length; i++) val = closes[i]*k + val*(1-k)
    return val
  }
  const ema20 = ema(20), ema50 = Math.min(bars.length, 50) >= 50 ? ema(50) : null
  const ema200 = bars.length >= 200 ? ema(200) : null
  const price = closes[closes.length-1]
  const trend = price > ema20 && ema20 > (ema50||ema20) ? 'bullish_stack' : price < ema20 ? 'bearish' : 'neutral'
  return { ema20: ema20.toFixed(2), ema50: ema50?.toFixed(2), ema200: ema200?.toFixed(2), trend, currentPrice: price }
}

function calcRSI(bars, period=14) {
  if (bars.length < period+1) return null
  const closes = bars.map(b => b.c)
  let gains=0, losses=0
  for (let i=1; i<=period; i++) {
    const d = closes[i]-closes[i-1]
    if (d>0) gains+=d; else losses+=-d
  }
  let avgGain=gains/period, avgLoss=losses/period
  for (let i=period+1; i<closes.length; i++) {
    const d = closes[i]-closes[i-1]
    avgGain = (avgGain*(period-1)+(d>0?d:0))/period
    avgLoss = (avgLoss*(period-1)+(d<0?-d:0))/period
  }
  if (avgLoss===0) return 100
  const rs = avgGain/avgLoss
  return parseFloat((100 - 100/(1+rs)).toFixed(1))
}

function calcVolatility(bars, period=20) {
  if (bars.length < period) return null
  const returns = bars.slice(-period).map((b,i,arr) => i>0 ? Math.log(b.c/arr[i-1].c) : 0).slice(1)
  const mean = returns.reduce((a,b)=>a+b)/returns.length
  const variance = returns.reduce((a,b)=>a+(b-mean)**2,0)/returns.length
  return parseFloat((Math.sqrt(variance*252)*100).toFixed(1))
}

function calcSupRes(bars, lookback=20) {
  const recent = bars.slice(-lookback)
  const highs = recent.map(b=>b.h)
  const lows = recent.map(b=>b.l)
  return {
    resistance: parseFloat(Math.max(...highs).toFixed(2)),
    support: parseFloat(Math.min(...lows).toFixed(2)),
    midpoint: parseFloat(((Math.max(...highs)+Math.min(...lows))/2).toFixed(2))
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const symbol = req.query.symbol?.toUpperCase()
  const timeframe = req.query.timeframe || '3m'

  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  try {
    const days = timeframe === '1m' ? 30 : timeframe === '3m' ? 90 : timeframe === '6m' ? 180 : 365

    // Fetch everything in parallel
    const [quote, bars, market, history] = await Promise.all([
      getRealPrice(symbol),
      getHistoricalBars(symbol, Math.min(days, 365)),
      getMarketContext(),
      getOutcomeHistory(symbol),
    ])

    if (!quote) return res.status(404).json({ error: `Could not fetch real price for ${symbol}` })

    // Calculate technicals
    const emas = calcEMAs(bars)
    const rsi = calcRSI(bars)
    const volatility = calcVolatility(bars)
    const supRes = calcSupRes(bars)
    const avgVolume = bars.length > 20 ? bars.slice(-20).reduce((a,b)=>a+b.v,0)/20 : quote.volume
    const relVolume = quote.volume > 0 && avgVolume > 0 ? (quote.volume/avgVolume).toFixed(2) : 'N/A'

    const technicals = { ...emas, rsi, volatility, relVolume, ...supRes, barsAvailable: bars.length }

    // Build Claude prompt with ALL real data
    const prompt = `You are AnkushAI's Predictive Modeling Engine. Analyze ${symbol} and produce probabilistic outcome scenarios.

REAL CURRENT DATA:
- Price: $${quote.price} | Open: $${quote.open} | High: $${quote.high} | Low: $${quote.low}
- Volume: ${(quote.volume/1e6).toFixed(1)}M | RelVol: ${relVolume}x avg
- EMA20: $${technicals.ema20 || 'N/A'} | EMA50: $${technicals.ema50 || 'N/A'} | EMA200: $${technicals.ema200 || 'N/A'}
- EMA Trend: ${technicals.trend} | RSI(14): ${rsi || 'N/A'}
- Annualized Volatility: ${volatility || 'N/A'}%
- Recent Resistance: $${supRes.resistance} | Support: $${supRes.support}
- Historical bars analyzed: ${bars.length}

MARKET CONTEXT:
- SPY: $${market.spy} (${market.spyChange.toFixed(2)}%) | VIX: ${market.vix} | Regime: ${market.regime}

${history ? `ANKUSHAI TRACK RECORD FOR ${symbol}: ${history.total} past setups, ${history.winRate}% win rate, recent: ${history.recentOutcomes.join(', ')}` : 'No prior AnkushAI setup history for this symbol.'}

TASK: Produce a comprehensive probabilistic analysis. Return ONLY valid JSON:
{
  "symbol": "${symbol}",
  "currentPrice": ${quote.price},
  "sentiment": "bullish|bearish|neutral",
  "confidence": 0-100,
  "timeframe": "${timeframe}",
  "scenarios": [
    {
      "name": "Bull Case",
      "probability": 35,
      "priceTarget": 0.00,
      "percentMove": "+X%",
      "catalyst": "specific technical/macro catalyst using real data",
      "timeToPlay": "1-3 weeks",
      "whatToWatch": ["specific level 1 with real price", "specific condition 2"],
      "invalidatedBy": "specific price level that breaks this thesis"
    },
    {
      "name": "Base Case",
      "probability": 45,
      "priceTarget": 0.00,
      "percentMove": "±X%",
      "catalyst": "most likely outcome with real data context",
      "timeToPlay": "1-2 weeks",
      "whatToWatch": ["specific thing 1", "specific thing 2"],
      "invalidatedBy": "what would break base case"
    },
    {
      "name": "Bear Case",
      "probability": 20,
      "priceTarget": 0.00,
      "percentMove": "-X%",
      "catalyst": "downside scenario with real data",
      "timeToPlay": "1-4 weeks",
      "whatToWatch": ["risk 1 with real levels", "risk 2"],
      "invalidatedBy": "what invalidates the bear thesis"
    }
  ],
  "keyLevels": {
    "criticalSupport": 0.00,
    "criticalResistance": 0.00,
    "breakoutLevel": 0.00,
    "breakdownLevel": 0.00
  },
  "macroContext": "2-3 sentences on how current macro/vix/spy context affects this specific setup",
  "technicalSummary": "2-3 sentences on EMA, RSI, volume context using real numbers",
  "riskFactors": ["specific risk 1", "specific risk 2", "specific risk 3"],
  "optionsContext": "implied vol context and preferred options strategy given current conditions",
  "edgeScore": 0-100
}`

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })

    let analysis
    const text = msg.content[0]?.text || '{}'
    try {
      const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()
      analysis = JSON.parse(clean)
    } catch(e) {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) try { analysis = JSON.parse(match[0]) } catch(e2) { analysis = { error: 'parse failed', raw: text.substring(0,200) } }
      else analysis = { error: 'no json found' }
    }

    return res.json({
      ...analysis,
      technicals,
      marketContext: market,
      priceVerified: true,
      generatedAt: new Date().toISOString()
    })
  } catch(e) {
    console.error('[predict]', e.message)
    return res.status(500).json({ error: e.message })
  }
}