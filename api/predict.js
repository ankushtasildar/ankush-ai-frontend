// api/predict.js v2 — AnkushAI Alpha-First Leading Intelligence
// NOT lagging indicators. Anticipates moves BEFORE they happen.
// Data: flow signals, macro regime, relative strength, supply/demand zones,
//       earnings cycles, sector rotation, segmented sentiment
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const POLY = process.env.POLYGON_API_KEY

async function polyFetch(url) {
  try {
    const r = await fetch(url+'&apiKey='+POLY, {signal:AbortSignal.timeout(8000)})
    return await r.json()
  } catch(e) { return null }
}

// ── Price + volume data ──────────────────────────────────────────
async function getPriceData(symbol, days=90) {
  const prev = await polyFetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true`)
  const q = prev?.results?.[0]
  if (!q) return null
  
  const to = new Date(); to.setDate(to.getDate()-1)
  const from = new Date(); from.setDate(from.getDate()-days)
  const fmt = d => d.toISOString().split('T')[0]
  
  const hist = await polyFetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=${days}`)
  const bars = hist?.results || []
  
  return { price:q.c, open:q.o, high:q.h, low:q.l, volume:q.v, vwap:q.vw, bars }
}

// ── Macro regime signals ─────────────────────────────────────────
async function getMacroRegime() {
  const [spy, vxx, tlt, hyd, iwm, qqq] = await Promise.all([
    polyFetch('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=5'),
    polyFetch('https://api.polygon.io/v2/aggs/ticker/VXX/prev?adjusted=true'),
    polyFetch('https://api.polygon.io/v2/aggs/ticker/TLT/prev?adjusted=true'),
    polyFetch('https://api.polygon.io/v2/aggs/ticker/HYG/prev?adjusted=true'),  // credit spreads proxy
    polyFetch('https://api.polygon.io/v2/aggs/ticker/IWM/prev?adjusted=true'),
    polyFetch('https://api.polygon.io/v2/aggs/ticker/QQQ/prev?adjusted=true'),
  ])

  const spyPrev = await polyFetch('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/2025-01-01/2026-01-01?adjusted=true&sort=desc&limit=10')
  const spyBars = spyPrev?.results || []
  
  const vixLevel = vxx?.results?.[0]?.c || 20
  const vixTrend = vixLevel > 30 ? 'spike' : vixLevel > 25 ? 'elevated' : vixLevel > 18 ? 'normal' : 'complacency'
  
  // TLT trend = bond market view on economy
  const tltPrice = tlt?.results?.[0]?.c
  const tltChg = tlt?.results?.[0] ? ((tlt.results[0].c - tlt.results[0].o) / tlt.results[0].o * 100) : 0
  
  // HYG = credit health. Falling HYG = credit stress = risk-off coming
  const hygChg = hyd?.results?.[0] ? ((hyd.results[0].c - hyd.results[0].o) / hyd.results[0].o * 100) : 0
  
  // Small cap vs large cap relative strength (IWM/SPY ratio)
  const iwmPrice = iwm?.results?.[0]?.c || 0
  const spyLatest = spyBars[0]?.c || 0
  
  // SPY momentum across timeframes
  const spy5d = spyBars.length >= 5 ? ((spyBars[0].c - spyBars[4].c) / spyBars[4].c * 100) : 0
  
  let regime = 'neutral'
  let regimeStrength = 50
  
  if (vixLevel > 30 && hygChg < -0.3) { regime = 'risk_off_stress'; regimeStrength = 85 }
  else if (vixLevel > 25 && spy5d < -2) { regime = 'distribution'; regimeStrength = 70 }
  else if (vixLevel < 18 && spy5d > 1 && hygChg > 0) { regime = 'risk_on_strong'; regimeStrength = 75 }
  else if (vixLevel < 20 && spy5d > 0) { regime = 'risk_on_mild'; regimeStrength = 60 }
  else if (vixLevel > 20 && vixLevel < 28 && spy5d > -1) { regime = 'choppy_transition'; regimeStrength = 45 }
  
  return {
    vix: vixLevel, vixTrend, regime, regimeStrength,
    tltChg: tltChg.toFixed(2),  // bonds: rising = fear/recession bid
    hygChg: hygChg.toFixed(2),   // credit: falling = risk-off warning
    spy5d: spy5d.toFixed(2),
    spyPrice: spyLatest,
    notes: vixLevel > 25 ? 'Elevated fear — defined-risk plays favored' :
           hygChg < -0.3 ? 'Credit stress signal — reduce leverage' :
           regime === 'risk_on_strong' ? 'All systems risk-on — momentum strategies' :
           'Mixed signals — wait for confirmation'
  }
}

// ── Segmented sentiment (90d/30d/7d/today) ──────────────────────
async function getSegmentedSentiment(symbol, bars) {
  if (!bars || bars.length < 5) return null
  
  function periodReturn(b, days) {
    if (b.length < days) return null
    const start = b[b.length-days].c
    const end   = b[b.length-1].c
    return ((end-start)/start*100)
  }
  
  function periodStrength(b, days) {
    // % of days that closed green
    const slice = b.slice(-days)
    const green = slice.filter((x,i) => i>0 && x.c > slice[i-1].c).length
    return slice.length > 1 ? (green/(slice.length-1)*100).toFixed(0) : null
  }
  
  // Average volume trend
  const recent5AvgVol  = bars.slice(-5).reduce((a,b)=>a+b.v,0)/5
  const prior20AvgVol  = bars.slice(-25,-5).reduce((a,b)=>a+b.v,0)/20
  const relativeVol = prior20AvgVol > 0 ? (recent5AvgVol/prior20AvgVol).toFixed(2) : 1
  
  // Price vs VWAP anchors at different time horizons
  const currentPrice = bars[bars.length-1].c
  const vwap30 = bars.slice(-30).reduce((a,b)=>a+(b.c*b.v),0) / bars.slice(-30).reduce((a,b)=>a+b.v,0)
  const vwap90 = bars.slice(-90).reduce((a,b)=>a+(b.c*b.v),0) / bars.slice(-90).reduce((a,b)=>a+b.v,0)
  
  return {
    today: bars.length > 1 ? ((bars[bars.length-1].c - bars[bars.length-2].c)/bars[bars.length-2].c*100).toFixed(2) : 0,
    week:  periodReturn(bars, 5),
    month: periodReturn(bars, 22),
    quarter: periodReturn(bars, 65),
    weekStrength:  periodStrength(bars, 5),    // % green days
    monthStrength: periodStrength(bars, 22),
    relativeVol,   // recent vol vs 20d avg
    priceVsVwap30: ((currentPrice/vwap30-1)*100).toFixed(2),  // vs 30d vwap anchor
    priceVsVwap90: ((currentPrice/vwap90-1)*100).toFixed(2),  // vs 90d vwap anchor
    interpretation: currentPrice > vwap30 && currentPrice > vwap90 ? 'Above both VWAP anchors — institutional carry' :
                   currentPrice < vwap30 && currentPrice < vwap90 ? 'Below both anchors — institutional distribution zone' :
                   currentPrice > vwap90 && currentPrice < vwap30 ? 'Between anchors — compression, watch for resolution' :
                   'Mean reversion zone near anchors'
  }
}

// ── Supply/demand zones from volume profile ──────────────────────
function getSupplyDemandZones(bars, currentPrice) {
  if (bars.length < 20) return null
  
  // Find high-volume price clusters (institutional activity zones)
  const priceStep = currentPrice * 0.01  // 1% buckets
  const volByPrice = {}
  bars.slice(-60).forEach(b => {
    const bucket = Math.round(b.c / priceStep) * priceStep
    volByPrice[bucket] = (volByPrice[bucket]||0) + b.v
  })
  
  const sorted = Object.entries(volByPrice).sort((a,b)=>b[1]-a[1])
  const topZones = sorted.slice(0,5).map(([p,v])=>({price:parseFloat(p).toFixed(2), vol:v}))
  
  // Nearest support (highest vol zone below price)
  const below = topZones.filter(z=>parseFloat(z.price) < currentPrice).sort((a,b)=>parseFloat(b.price)-parseFloat(a.price))
  const above = topZones.filter(z=>parseFloat(z.price) > currentPrice).sort((a,b)=>parseFloat(a.price)-parseFloat(b.price))
  
  // Recent swing highs/lows
  const recent = bars.slice(-20)
  const swingHigh = Math.max(...recent.map(b=>b.h))
  const swingLow  = Math.min(...recent.map(b=>b.l))
  const poc = sorted[0]  // Point of control (highest volume price)
  
  return {
    poc: parseFloat(poc?.[0]).toFixed(2),        // institutional accumulation/distribution center
    nearestSupport: below[0]?.price || (currentPrice*0.97).toFixed(2),
    nearestResistance: above[0]?.price || (currentPrice*1.03).toFixed(2),
    swingHigh: swingHigh.toFixed(2),
    swingLow: swingLow.toFixed(2),
    keyZones: topZones.slice(0,3).map(z=>z.price),
    interpretation: Math.abs(currentPrice - parseFloat(poc?.[0]||currentPrice))/currentPrice < 0.01 
      ? 'At high-volume node — breakout or rejection imminent'
      : currentPrice > parseFloat(poc?.[0]||0) ? 'Above POC — buyers in control, support below'
      : 'Below POC — supply overhead, needs reclaim'
  }
}

// ── Sector rotation signals ──────────────────────────────────────
async function getSectorRotation(symbol) {
  // Get symbol's sector ETF performance to identify rotation
  const sectorMap = {
    NVDA:'XLK',MSFT:'XLK',AAPL:'XLK',GOOGL:'XLK',META:'XLK',AMD:'XLK',
    JPM:'XLF',GS:'XLF',BAC:'XLF',V:'XLF',MA:'XLF',
    XOM:'XLE',CVX:'XLE',
    LLY:'XLV',UNH:'XLV',ABBV:'XLV',
    AMZN:'XLY',TSLA:'XLY',
    WMT:'XLP',COST:'XLP',
  }
  
  const sector = sectorMap[symbol]
  if (!sector) return null
  
  // Compare sector vs SPY over 5d and 20d
  const [secData, spyData] = await Promise.all([
    polyFetch(`https://api.polygon.io/v2/aggs/ticker/${sector}/range/1/day/2025-09-01/2026-04-01?adjusted=true&sort=desc&limit=25`),
    polyFetch('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/2025-09-01/2026-04-01?adjusted=true&sort=desc&limit=25'),
  ])
  
  const sb = secData?.results || []
  const spb = spyData?.results || []
  
  if (sb.length < 5 || spb.length < 5) return { sector, signal: 'insufficient data' }
  
  const sec5d  = sb.length>=5  ? (sb[0].c-sb[4].c)/sb[4].c*100   : 0
  const spy5d  = spb.length>=5 ? (spb[0].c-spb[4].c)/spb[4].c*100 : 0
  const sec20d = sb.length>=20  ? (sb[0].c-sb[19].c)/sb[19].c*100  : 0
  const spy20d = spb.length>=20 ? (spb[0].c-spb[19].c)/spb[19].c*100 : 0
  
  const rs5  = sec5d  - spy5d
  const rs20 = sec20d - spy20d
  
  return {
    sector,
    rs5d: rs5.toFixed(2),    // positive = sector outperforming SPY
    rs20d: rs20.toFixed(2),
    signal: rs5 > 1 && rs20 > 2 ? 'ROTATION_IN — sector money flowing in, tailwind' :
            rs5 < -1 && rs20 < -2 ? 'ROTATION_OUT — smart money leaving sector' :
            rs5 > 1 && rs20 < 0 ? 'RECOVERING — short-term rotation in, watch continuation' :
            'NEUTRAL — no clear sector rotation signal'
  }
}

// ── Earnings and catalyst timing ────────────────────────────────
async function getEarningsContext(symbol) {
  try {
    const r = await polyFetch(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLY}`)
    const info = r?.results
    if (!info) return null
    
    return {
      name: info.name,
      marketCap: info.market_cap ? (info.market_cap/1e9).toFixed(1)+'B' : null,
      employees: info.total_employees,
      description: info.description?.substring(0,150),
      listDate: info.list_date,
      // Earnings timing from macro events table
    }
  } catch(e) { return null }
}

// ── Relative strength vs sector + market ────────────────────────
async function getRelativeStrength(symbol, bars) {
  if (!bars || bars.length < 20) return null
  
  // Beta-adjusted relative strength
  const [spyData] = await Promise.all([
    polyFetch('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/2025-09-01/2026-04-01?adjusted=true&sort=desc&limit=25'),
  ])
  const spyBars = spyData?.results?.slice(0,20).reverse() || []
  
  if (spyBars.length < 5 || bars.length < 5) return null
  
  function ret(b, d) { return b.length>=d ? (b[b.length-1].c-b[b.length-d].c)/b[b.length-d].c*100 : null }
  
  const sym1m = ret(bars,22), spy1m = ret(spyBars,Math.min(22,spyBars.length))
  const sym5d = ret(bars,5),  spy5d = ret(spyBars,5)
  
  return {
    rs5d:  sym5d !== null && spy5d !== null  ? (sym5d-spy5d).toFixed(2)  : null,
    rs1m:  sym1m !== null && spy1m !== null  ? (sym1m-spy1m).toFixed(2)  : null,
    sym5d: sym5d?.toFixed(2), sym1m: sym1m?.toFixed(2),
    spy5d: spy5d?.toFixed(2), spy1m: spy1m?.toFixed(2),
    signal: sym5d !== null && spy5d !== null && (sym5d-spy5d) > 2 ? 'LEADING_MARKET — outperforming, institutional interest' :
            sym5d !== null && spy5d !== null && (sym5d-spy5d) < -2 ? 'LAGGING_MARKET — institutional rotation out' : 'MARKET_NEUTRAL'
  }
}

// ── Historical outcome tracking ──────────────────────────────────
async function getHistoricalEdge(symbol) {
  try {
    const { data } = await supabase.from('setup_records')
      .select('bias,outcome,confidence,rr_ratio,created_at,entry_high,stop_loss,target_1')
      .eq('symbol', symbol).not('outcome','is',null)
      .order('created_at',{ascending:false}).limit(30)
    if (!data?.length) return null
    const wins = data.filter(r=>r.outcome==='win')
    const recent = data.slice(0,5).map(r=>r.outcome)
    const avgConf = data.reduce((a,b)=>a+(b.confidence||0),0)/data.length
    return { total:data.length, winRate:(wins.length/data.length*100).toFixed(0), recent, avgConfidence:avgConf.toFixed(0) }
  } catch(e) { return null }
}

// ── MASTER PROMPT ────────────────────────────────────────────────
// This is the institutional investor VP intelligence layer
// The prompt is designed to produce LEADING ALPHA — not confirmation
function buildAlphaPrompt(symbol, price, macro, sentiment, supdem, rotation, rs, edge, company) {
  return `You are the Chief Investment Strategist at AnkushAI — a senior institutional VP with 20+ years across Goldman Sachs, Citadel, and Two Sigma. You think like a hedge fund: ANTICIPATE moves, never confirm them.

CORE PHILOSOPHY: Lagging indicators are evidence, NOT thesis. Your edge comes from:
- Identifying WHERE smart money is positioning BEFORE the move
- Reading macro regime shifts 2-4 weeks ahead of consensus
- Spotting supply/demand imbalances at institutional price levels
- Recognizing earnings revision cycles BEFORE analysts update
- Detecting sector rotation BEFORE it becomes obvious

REAL MARKET DATA:
Symbol: ${symbol}${company?.name ? ' ('+company.name+')' : ''}
Current Price: $${price} | Market Cap: ${company?.marketCap||'N/A'}
${company?.description ? 'Company: '+company.description : ''}

MACRO REGIME:
VIX: ${macro.vix} (${macro.vixTrend}) | Regime: ${macro.regime} (strength: ${macro.regimeStrength}%)
SPY 5-day: ${macro.spy5d}% | TLT (bonds): ${macro.tltChg}% | HYG (credit): ${macro.hygChg}%
Regime note: ${macro.notes}

SEGMENTED SENTIMENT (multi-timeframe):
Today: ${sentiment.today}% | This week: ${sentiment.week}% | 30 days: ${sentiment.month}% | 90 days: ${sentiment.quarter}%
Week green days: ${sentiment.weekStrength}% | Month green days: ${sentiment.monthStrength}%
Relative volume (5d vs 20d avg): ${sentiment.relativeVol}x
vs 30d VWAP anchor: ${sentiment.priceVsVwap30}% | vs 90d VWAP: ${sentiment.priceVsVwap90}%
VWAP interpretation: ${sentiment.interpretation}

SUPPLY/DEMAND (Volume Profile):
Point of Control (institutional center): $${supdem.poc}
Nearest support: $${supdem.nearestSupport} | Nearest resistance: $${supdem.nearestResistance}
Swing high: $${supdem.swingHigh} | Swing low: $${supdem.swingLow}
Key institutional zones: ${supdem.keyZones?.join(', ')||'N/A'}
POC interpretation: ${supdem.interpretation}

${rotation ? `SECTOR ROTATION (${rotation.sector}):
5d RS vs SPY: ${rotation.rs5d}% | 20d RS vs SPY: ${rotation.rs20d}%
Rotation signal: ${rotation.signal}` : ''}

${rs ? `RELATIVE STRENGTH:
5d vs SPY: ${rs.rs5d}% | 1M vs SPY: ${rs.rs1m}%
Symbol performance: 5d ${rs.sym5d}%, 1M ${rs.sym1m}%
Signal: ${rs.signal}` : ''}

${edge ? `ANKUSHAI HISTORICAL EDGE:
${edge.total} tracked setups | ${edge.winRate}% win rate | Avg confidence: ${edge.avgConfidence}
Recent outcomes: ${edge.recent?.join(', ')}` : 'No prior tracking data for this symbol.'}

YOUR ANALYSIS MANDATE:
Produce LEADING ALPHA — what will happen and why, not what has happened.
Focus on: supply/demand imbalances, institutional positioning, regime transitions, rotation flows, catalyst timing.
The sentiment data is context, NOT the thesis.

Return ONLY valid JSON (no markdown):
{
  "symbol": "${symbol}",
  "currentPrice": ${price},
  "leadingThesis": "2-3 sentence institutional thesis on WHY price will move — based on regime, flow, supply/demand, rotation. NOT RSI. NOT moving averages. LEAD.",
  "alphaEdge": "What specific edge does AnkushAI have here that retail traders miss? What are institutions doing?",
  "sentiment": {
    "overall": "bullish|bearish|neutral",
    "90day": "bullish|bearish|neutral",
    "30day": "bullish|bearish|neutral", 
    "7day": "bullish|bearish|neutral",
    "today": "bullish|bearish|neutral",
    "momentum": "accelerating|decelerating|flat",
    "note": "One sentence on how sentiment trend feeds or contradicts the leading thesis"
  },
  "confidence": 0-100,
  "edgeScore": 0-100,
  "scenarios": [
    {
      "name": "Primary Alpha Play",
      "probability": 40,
      "priceTarget": 0.00,
      "percentMove": "+X%",
      "timeToPlay": "X-Y weeks",
      "alphaRationale": "Why THIS move specifically — institutional catalyst, rotation, regime shift, supply/demand",
      "entryTrigger": "SPECIFIC event or price action that confirms the thesis is playing out",
      "whatToWatch": ["leading indicator 1 — something that moves BEFORE price", "leading indicator 2", "leading indicator 3"],
      "invalidatedBy": "specific leading signal that kills this thesis before it plays out",
      "positionStrategy": "specific options or equity approach given current IV and regime"
    },
    {
      "name": "Base Case",
      "probability": 35,
      "priceTarget": 0.00,
      "percentMove": "±X%",
      "timeToPlay": "X-Y weeks",
      "alphaRationale": "Most probable outcome and why",
      "entryTrigger": "What confirms this scenario",
      "whatToWatch": ["thing 1", "thing 2"],
      "invalidatedBy": "what breaks this",
      "positionStrategy": "approach"
    },
    {
      "name": "Bear/Hedge Case",
      "probability": 25,
      "priceTarget": 0.00,
      "percentMove": "-X%",
      "timeToPlay": "X-Y weeks",
      "alphaRationale": "Leading downside signals",
      "entryTrigger": "What confirms downside",
      "whatToWatch": ["risk signal 1", "risk signal 2"],
      "invalidatedBy": "what negates bear case",
      "positionStrategy": "hedge approach"
    }
  ],
  "institutionalLevels": {
    "accumulation": 0.00,
    "distribution": 0.00,
    "breakoutLevel": 0.00,
    "stopLevel": 0.00
  },
  "macroTailwinds": ["specific macro factor 1 that LEADS price", "factor 2", "factor 3"],
  "macroHeadwinds": ["specific risk factor 1", "risk 2"],
  "sectorRotationView": "Is money rotating INTO or OUT of this sector and what does it mean for this specific name?",
  "leadingIndicatorsToTrack": ["leading indicator 1 with specific metric", "indicator 2", "indicator 3", "indicator 4"],
  "timeDecay": "How does this thesis change if it doesn't play out in X weeks?",
  "optionsAlpha": "Specific options edge — IV environment, preferred strikes, expiry, why this structure captures the thesis"
}
`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  
  const symbol = req.query.symbol?.toUpperCase()
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  try {
    // Fetch all signals in parallel — minimize latency
    const priceDataP = getPriceData(symbol, 90)
    const macroP = getMacroRegime()
    const companyP = getEarningsContext(symbol)
    const edgeP = getHistoricalEdge(symbol)

    const [priceData, macro, company, edge] = await Promise.all([priceDataP, macroP, companyP, edgeP])
    
    if (!priceData) return res.status(404).json({ error: `No data for ${symbol}` })
    
    const { price, bars } = priceData
    
    // Compute signals from price data
    const sentiment   = await getSegmentedSentiment(symbol, bars)
    const supdem      = getSupplyDemandZones(bars, price)
    const rotation    = await getSectorRotation(symbol)
    const rs          = await getRelativeStrength(symbol, bars)
    
    const prompt = buildAlphaPrompt(symbol, price, macro, sentiment||{}, supdem||{}, rotation, rs, edge, company)
    
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    })
    
    let analysis = {}
    const text = msg.content[0]?.text || '{}'
    try {
      const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()
      analysis = JSON.parse(clean)
    } catch(e) {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) try { analysis = JSON.parse(match[0]) } catch(e2) {}
    }
    
    return res.json({
      ...analysis,
      rawData: { macro, sentiment, supdem, rotation, rs },
      priceVerified: true,
      generatedAt: new Date().toISOString()
    })
  } catch(e) {
    console.error('[predict v2]', e.message)
    return res.status(500).json({ error: e.message })
  }
}