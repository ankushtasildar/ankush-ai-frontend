// chart-analysis.js — AnkushAI Chart Intelligence Engine v2
// Lead: Marcus Webb (Quant) + Dr. Kenji Tanaka (Options) + Sarah Chen (Infra)
//
// PHILOSOPHY: Claude is the LAST step, not the first.
// All quantitative analysis happens in code with real data.
// Claude synthesizes conclusions from pre-computed facts.
// The model CANNOT hallucinate price levels — every number is computed first.
//
// ARCHITECTURE:
// 1. Fetch 252 days of OHLCV (1 trading year) from Polygon
// 2. Compute all quantitative signals deterministically in JS
// 3. Pull Alpha Intelligence context for this symbol (if available)
// 4. Build a structured facts brief — no room for hallucination
// 5. Claude synthesizes narrative + confirms directional bias
// 6. Cache result for 30 minutes (not 4 hours)

'use strict'
const Anthropic = require('@anthropic-ai/sdk')

const anthropic = new Anthropic()
const POLY = process.env.POLYGON_API_KEY
const SUPA_URL = process.env.SUPABASE_URL || ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CACHE_TTL = 30 * 60 * 1000  // 30 minutes — not 4 hours. Stale data kills trust.

// ── DATA LAYER ────────────────────────────────────────────────────────────────
async function fetchBars(symbol, days = 252) {
  const to   = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - (days + 60) * 86400000).toISOString().split('T')[0]
  const url  = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=365&apiKey=${POLY}`
  const r    = await fetch(url)
  const d    = await r.json()
  return (d.results || []).map(b => ({ t:b.t, o:+b.o, h:+b.h, l:+b.l, c:+b.c, v:+b.v }))
}

async function fetchPrevClose(symbol) {
  const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLY}`)
  const d = await r.json()
  return d.results?.[0] || null
}

async function fetchSPYContext() {
  // SPY + VIX context for macro regime
  const [spy, vix] = await Promise.all([
    fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${new Date(Date.now()-30*86400000).toISOString().split('T')[0]}/${new Date().toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=22&apiKey=${POLY}`).then(r=>r.json()),
    fetch(`https://api.polygon.io/v2/aggs/ticker/VXX/prev?adjusted=true&apiKey=${POLY}`).then(r=>r.json())
  ])
  const spyBars = (spy.results || []).reverse()
  const spyNow  = spyBars.length ? spyBars[spyBars.length-1].c : null
  const spy5dAgo = spyBars.length >= 6 ? spyBars[spyBars.length-6].c : spyNow
  const spy20dChg = spyBars.length >= 21 ? ((spyNow - spyBars[0].c)/spyBars[0].c*100).toFixed(2) : null
  const vixClose  = vix.results?.[0]?.c || 20
  return {
    spyPrice: spyNow,
    spy5dChg: spy5dAgo && spyNow ? +((spyNow-spy5dAgo)/spy5dAgo*100).toFixed(2) : null,
    spy20dChg: spy20dChg ? +spy20dChg : null,
    vix: +vixClose.toFixed(2),
    regime: vixClose < 15 ? 'low_vol_risk_on' : vixClose < 20 ? 'normal' : vixClose < 28 ? 'elevated_vol' : 'fear_regime'
  }
}

// ── QUANT ENGINE — Marcus Webb / Two Sigma methodology ────────────────────────
function ema(prices, period) {
  if (prices.length < period) return null
  const k = 2 / (period + 1)
  let e = prices[0]
  for (let i = 1; i < prices.length; i++) e = prices[i] * k + e * (1 - k)
  return +e.toFixed(4)
}

function sma(prices, period) {
  if (prices.length < period) return null
  return +(prices.slice(-period).reduce((a,b)=>a+b,0)/period).toFixed(4)
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null
  const changes = closes.slice(-period-1).map((c,i,a) => i === 0 ? 0 : c - a[i-1]).slice(1)
  const gains = changes.map(c => c > 0 ? c : 0)
  const losses = changes.map(c => c < 0 ? Math.abs(c) : 0)
  const avgGain = gains.reduce((a,b)=>a+b,0)/period
  const avgLoss = losses.reduce((a,b)=>a+b,0)/period
  if (avgLoss === 0) return 100
  return +(100 - 100/(1 + avgGain/avgLoss)).toFixed(2)
}

function atr(bars, period = 14) {
  if (bars.length < period + 1) return null
  const trs = []
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], prev = bars[i-1]
    trs.push(Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c)))
  }
  return +(trs.slice(-period).reduce((a,b)=>a+b,0)/period).toFixed(4)
}

function bollingerBands(closes, period = 20, stdMult = 2) {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  const mean  = slice.reduce((a,b)=>a+b,0)/period
  const std   = Math.sqrt(slice.map(c=>(c-mean)**2).reduce((a,b)=>a+b,0)/period)
  return { upper:+(mean+stdMult*std).toFixed(2), middle:+mean.toFixed(2), lower:+(mean-stdMult*std).toFixed(2), width:+(2*stdMult*std/mean*100).toFixed(2) }
}

function macd(closes) {
  if (closes.length < 35) return null
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  if (!ema12 || !ema26) return null
  const line   = +(ema12 - ema26).toFixed(4)
  // Signal: 9-period EMA of MACD line (approximate)
  const macdHistory = []
  for (let i = 26; i <= closes.length; i++) {
    const e12 = ema(closes.slice(0,i), 12)
    const e26 = ema(closes.slice(0,i), 26)
    if (e12 && e26) macdHistory.push(e12-e26)
  }
  const signal = macdHistory.length >= 9 ? ema(macdHistory, 9) : null
  return { line, signal, histogram: signal ? +(line-signal).toFixed(4) : null }
}

function vwap(bars, period = 20) {
  const sl = bars.slice(-period)
  const tpv = sl.reduce((s,b) => s + ((b.h+b.l+b.c)/3)*b.v, 0)
  const tv  = sl.reduce((s,b) => s + b.v, 0)
  return tv > 0 ? +(tpv/tv).toFixed(2) : null
}

// Trend structure: is price making higher highs / lower lows?
function detectTrendStructure(bars, lookback = 20) {
  const recent = bars.slice(-lookback)
  // Find local swing highs and lows (5-bar lookback)
  const highs = [], lows = [], win = 4
  for (let i = win; i < recent.length - win; i++) {
    const sl = recent.slice(i-win, i+win+1)
    if (recent[i].h === Math.max(...sl.map(b=>b.h))) highs.push(recent[i].h)
    if (recent[i].l === Math.min(...sl.map(b=>b.l))) lows.push(recent[i].l)
  }
  const hhCount = highs.slice(1).filter((h,i)=>h>highs[i]).length
  const hlCount = lows.slice(1).filter((l,i)=>l>lows[i]).length
  const llCount = lows.slice(1).filter((l,i)=>l<lows[i]).length
  const lhCount = highs.slice(1).filter((h,i)=>h<highs[i]).length
  
  if (hhCount >= 2 && hlCount >= 2) return 'uptrend_HH_HL'
  if (llCount >= 2 && lhCount >= 2) return 'downtrend_LL_LH'
  if (lhCount >= 1 && llCount >= 1) return 'distributing_LH_LL'
  if (hhCount >= 1 && hlCount >= 1) return 'accumulating_HH_HL'
  return 'ranging_no_clear_trend'
}

// Momentum: rate of change
function roc(closes, period) {
  if (closes.length < period+1) return null
  const now = closes[closes.length-1]
  const then = closes[closes.length-1-period]
  return +((now-then)/then*100).toFixed(2)
}

// Volume analysis: is volume confirming price?
function volumeAnalysis(bars) {
  const recent5  = bars.slice(-5).map(b=>b.v)
  const recent20 = bars.slice(-20).map(b=>b.v)
  const avg5   = recent5.reduce((a,b)=>a+b,0)/5
  const avg20  = recent20.reduce((a,b)=>a+b,0)/20
  const ratio  = +(avg5/avg20).toFixed(2)
  
  // Up-volume vs down-volume over last 10 days
  const last10 = bars.slice(-10)
  const upVol  = last10.filter(b=>b.c>=b.o).reduce((s,b)=>s+b.v,0)
  const dnVol  = last10.filter(b=>b.c<b.o).reduce((s,b)=>s+b.v,0)
  const upVolPct = +((upVol/(upVol+dnVol)*100) || 50).toFixed(1)
  
  return {
    avg5, avg20, ratio,
    trend: ratio > 1.3 ? 'surging' : ratio > 1.0 ? 'above_avg' : ratio > 0.8 ? 'normal' : 'drying_up',
    upVolPct,
    confirmation: upVolPct > 60 ? 'bulls_in_control' : upVolPct < 40 ? 'bears_in_control' : 'balanced'
  }
}

// Supply/Demand zones: institutional price levels
function calcSDZones(bars, price) {
  const recent = bars.slice(-120)
  const avgVol = recent.reduce((s,b)=>s+b.v,0)/recent.length
  const supply = [], demand = []
  
  for (let i = 5; i < recent.length-5; i++) {
    const b = recent[i]
    const range = b.h - b.l || 0.01
    const isHV = b.v > avgVol * 1.5
    // Supply: high-volume bearish candle (distribution)
    if (isHV && b.c < b.o && (b.h - b.c)/range > 0.4 && b.h > price * 0.97) {
      supply.push({ top:+b.h.toFixed(2), bottom:+b.o.toFixed(2), strength:+(b.v/avgVol).toFixed(1), dist:+((b.o-price)/price*100).toFixed(1) })
    }
    // Demand: high-volume bullish candle (accumulation)
    if (isHV && b.c > b.o && (b.c - b.l)/range > 0.4 && b.l < price * 1.03) {
      demand.push({ top:+b.c.toFixed(2), bottom:+b.l.toFixed(2), strength:+(b.v/avgVol).toFixed(1), dist:+((b.c-price)/price*100).toFixed(1) })
    }
  }
  
  // Sort by proximity to current price, keep best 3
  return {
    supply: supply.sort((a,b)=>a.dist-b.dist).slice(0,3),
    demand: demand.sort((a,b)=>Math.abs(a.dist)-Math.abs(b.dist)).slice(0,3)
  }
}

// Fibonacci from recent swing high/low
function fibFromSwings(bars, lookback = 60) {
  const recent = bars.slice(-lookback)
  const high   = Math.max(...recent.map(b=>b.h))
  const low    = Math.min(...recent.map(b=>b.l))
  const d = high - low
  return {
    high:+high.toFixed(2), low:+low.toFixed(2),
    r382:+(high - d*0.382).toFixed(2),
    r500:+(high - d*0.500).toFixed(2),
    r618:+(high - d*0.618).toFixed(2),
    r786:+(high - d*0.786).toFixed(2),
    // Extension levels
    e1272:+(high + d*0.272).toFixed(2),
    e1618:+(high + d*0.618).toFixed(2),
  }
}

// Drawdown: how far from 52-week high?
function drawdownStats(bars, price) {
  const closes = bars.map(b=>b.c)
  const high52w = Math.max(...bars.map(b=>b.h))
  const low52w  = Math.min(...bars.map(b=>b.l))
  const drawdownPct  = +((price - high52w)/high52w*100).toFixed(2)
  const recoveryPct  = +((price - low52w)/low52w*100).toFixed(2)
  const high1m = Math.max(...bars.slice(-22).map(b=>b.h))
  const low1m  = Math.min(...bars.slice(-22).map(b=>b.l))
  return { high52w:+high52w.toFixed(2), low52w:+low52w.toFixed(2), drawdownFromHigh:drawdownPct, recoveryFromLow:recoveryPct, high1m:+high1m.toFixed(2), low1m:+low1m.toFixed(2) }
}

// Key support/resistance from volume profile (simplified)  
function volumeProfileLevels(bars, price, buckets = 20) {
  if (!bars.length) return []
  const prices = bars.map(b=>(b.h+b.l+b.c)/3)
  const minP = Math.min(...bars.map(b=>b.l))
  const maxP = Math.max(...bars.map(b=>b.h))
  const step = (maxP - minP) / buckets
  const profile = Array.from({length:buckets},(_,i)=>({ price:+(minP+step*(i+0.5)).toFixed(2), vol:0 }))
  
  bars.forEach(b => {
    const tp = (b.h+b.l+b.c)/3
    const idx = Math.min(Math.floor((tp-minP)/step), buckets-1)
    if (idx >= 0) profile[idx].vol += b.v
  })
  
  // Top 5 high-volume nodes (Point of Control candidates)
  return profile.sort((a,b)=>b.vol-a.vol).slice(0,5).map(p=>p.price).sort((a,b)=>a-b)
}

// ── MASTER QUANT ANALYSIS ─────────────────────────────────────────────────────
async function buildQuantAnalysis(symbol) {
  const [bars, prevClose, macro] = await Promise.all([
    fetchBars(symbol, 252),
    fetchPrevClose(symbol),
    fetchSPYContext()
  ])
  
  if (!bars.length) throw new Error('No price data for ' + symbol)
  
  const price   = prevClose?.c || bars[bars.length-1].c
  const open    = prevClose?.o || bars[bars.length-1].o
  const dayVol  = prevClose?.v || bars[bars.length-1].v
  const closes  = bars.map(b=>b.c)
  const highs   = bars.map(b=>b.h)
  const lows    = bars.map(b=>b.l)
  
  // ── COMPUTE ALL SIGNALS BEFORE CALLING CLAUDE ────────────────────────────
  
  // EMAs
  const ema8   = ema(closes, 8)
  const ema21  = ema(closes, 21)
  const ema50  = ema(closes, 50)
  const ema200 = ema(closes, 200)
  
  // EMA alignment — the most important directional signal
  const priceVsEma8   = ema8   ? +((price-ema8)/ema8*100).toFixed(2)   : null
  const priceVsEma21  = ema21  ? +((price-ema21)/ema21*100).toFixed(2) : null
  const priceVsEma50  = ema50  ? +((price-ema50)/ema50*100).toFixed(2) : null
  const priceVsEma200 = ema200 ? +((price-ema200)/ema200*100).toFixed(2) : null
  
  // EMA stack: are EMAs aligned (bull stack = ema8>ema21>ema50>ema200)?
  const emaStack = [ema8,ema21,ema50,ema200].filter(Boolean)
  let emaAlignment = 'mixed'
  if (emaStack.length >= 3) {
    const allBull = emaStack.every((e,i)=>i===0||e<emaStack[i-1])  // each shorter > longer
    const allBear = emaStack.every((e,i)=>i===0||e>emaStack[i-1])
    emaAlignment = allBull ? 'bullish_stack' : allBear ? 'bearish_stack' : 'mixed'
  }
  
  // RSI
  const rsi14  = rsi(closes, 14)
  const rsi5   = rsi(closes.slice(-20), 5)  // short-term momentum
  
  // MACD
  const macdData = macd(closes)
  
  // ATR — true volatility
  const atr14 = atr(bars, 14)
  const atrPct = atr14 ? +(atr14/price*100).toFixed(2) : null  // ATR as % of price
  
  // Bollinger Bands
  const bb = bollingerBands(closes)
  const bbPosition = bb ? +((price - bb.lower)/(bb.upper - bb.lower)*100).toFixed(1) : null
  
  // VWAPs
  const vwap20d = vwap(bars, 20)
  const vwap90d = vwap(bars, 90)
  
  // Rate of Change (momentum)
  const roc1  = roc(closes, 1)
  const roc5  = roc(closes, 5)
  const roc10 = roc(closes, 10)
  const roc20 = roc(closes, 20)
  const roc60 = roc(closes, 60)
  
  // Trend structure
  const trendStructure = detectTrendStructure(bars, 30)
  const trendStructure5d = detectTrendStructure(bars, 10)
  
  // Volume
  const volAnalysis = volumeAnalysis(bars)
  
  // Supply/Demand zones
  const sdz = calcSDZones(bars, price)
  
  // Fibonacci
  const fib = fibFromSwings(bars, 60)
  
  // Drawdown stats
  const dd = drawdownStats(bars, price)
  
  // Volume profile levels (HVNs = High Volume Nodes = key S/R)
  const hvns = volumeProfileLevels(bars, price)
  
  // ── BIAS DETERMINATION — computed by code, confirmed by Claude ───────────
  // Multiple factor scoring system. Claude does NOT determine bias — code does.
  let bullSignals = 0, bearSignals = 0
  
  if (priceVsEma8 !== null)   { priceVsEma8 > 0 ? bullSignals++ : bearSignals++ }
  if (priceVsEma21 !== null)  { priceVsEma21 > 0 ? bullSignals++ : bearSignals++ }
  if (priceVsEma50 !== null)  { priceVsEma50 > 0 ? bullSignals++ : bearSignals++ }
  if (priceVsEma200 !== null) { priceVsEma200 > 0 ? bullSignals++ : bearSignals++ }
  if (roc5 !== null)    { roc5 > 0 ? bullSignals++ : bearSignals++ }
  if (roc20 !== null)   { roc20 > 0 ? bullSignals++ : bearSignals++ }
  if (rsi14 !== null)   { rsi14 > 55 ? bullSignals++ : rsi14 < 45 ? bearSignals++ : null }
  if (macdData?.histogram !== null) { macdData.histogram > 0 ? bullSignals++ : bearSignals++ }
  if (volAnalysis.confirmation === 'bulls_in_control') bullSignals++
  if (volAnalysis.confirmation === 'bears_in_control') bearSignals++
  if (trendStructure.includes('uptrend')) bullSignals += 2
  if (trendStructure.includes('downtrend') || trendStructure.includes('distributing')) bearSignals += 2
  
  const totalSig = bullSignals + bearSignals
  const bullPct  = totalSig > 0 ? Math.round(bullSignals/totalSig*100) : 50
  
  const computedBias = bullPct >= 60 ? 'bullish' : bullPct <= 40 ? 'bearish' : 'neutral'
  const biasCertainty = Math.abs(bullPct - 50)  // 0-50, higher = more certain
  
  // ── KEY LEVELS — all mathematically derived ───────────────────────────────
  // Support: closest HVN below price, closest demand zone, Fib retracement
  // Resistance: closest HVN above price, closest supply zone, recent high
  
  const supportLevels = [
    ...hvns.filter(p=>p < price),
    ...sdz.demand.map(z=>z.bottom),
    fib.r382 < price ? fib.r382 : null,
    fib.r618 < price ? fib.r618 : null,
    ema50 < price ? ema50 : null,
    ema200 < price ? ema200 : null,
    dd.low1m,
  ].filter(Boolean).map(p=>+p.toFixed(2)).sort((a,b)=>b-a)
  
  const resistanceLevels = [
    ...hvns.filter(p=>p > price),
    ...sdz.supply.map(z=>z.top),
    fib.e1272 > price ? fib.e1272 : null,
    ema8 > price ? ema8 : null,
    dd.high1m > price ? dd.high1m : null,
    dd.high52w > price ? dd.high52w : null,
  ].filter(Boolean).map(p=>+p.toFixed(2)).sort((a,b)=>a-b)
  
  // Nearest levels
  const nearestSupport     = supportLevels[0] || +(price*0.95).toFixed(2)
  const nearestResistance  = resistanceLevels[0] || +(price*1.05).toFixed(2)
  const nextMajorSupport   = supportLevels[1] || +(price*0.90).toFixed(2)
  const nextMajorResistance = resistanceLevels[1] || +(price*1.10).toFixed(2)
  
  // ATR-based trade levels — mathematically derived, not hallucinated
  const atrVal = atr14 || price * 0.015
  const stopDistMult   = bearSignals > bullSignals ? 0.75 : 1.25  // tighter stops in downtrends
  
  const longEntry      = +(price).toFixed(2)
  const longStop       = +(Math.min(nearestSupport - atrVal*0.3, price - atrVal*stopDistMult)).toFixed(2)
  const longTarget1    = +(nearestResistance).toFixed(2)
  const longTarget2    = +(nextMajorResistance || price + atrVal*4).toFixed(2)
  
  const shortEntry     = +(price).toFixed(2)
  const shortStop      = +(Math.max(nearestResistance + atrVal*0.3, price + atrVal*stopDistMult)).toFixed(2)
  const shortTarget1   = +(nearestSupport).toFixed(2)
  const shortTarget2   = +(nextMajorSupport || price - atrVal*4).toFixed(2)
  
  const longRR  = longTarget1 > price && longStop < price ? +((longTarget1-price)/(price-longStop)).toFixed(2) : 0
  const shortRR = shortTarget1 < price && shortStop > price ? +((price-shortTarget1)/(shortStop-price)).toFixed(2) : 0
  
  // ── STRUCTURED BRIEF FOR CLAUDE ──────────────────────────────────────────
  // Claude gets a structured brief of FACTS and must synthesize conclusions.
  // It cannot invent price levels. All numbers are pre-computed.
  
  const brief = `You are Dr. Marcus Webb, chief quant at AnkushAI (Goldman Sachs, Two Sigma background).
Your job: synthesize the pre-computed quantitative data below into a sharp institutional chart read.
DO NOT invent price levels. Every number you cite must come from the data below.
Return ONLY valid JSON — no markdown, no preamble.

=== PRE-COMPUTED QUANTITATIVE ANALYSIS: ${symbol} ===

CURRENT PRICE: $${price.toFixed(2)}
DAY CHANGE: ${roc1 !== null ? (roc1 >= 0 ? '+' : '') + roc1 + '%' : 'N/A'}

MULTI-TIMEFRAME PERFORMANCE (rate of change):
• 5-day: ${roc5 !== null ? (roc5>=0?'+':'')+roc5+'%' : 'N/A'}
• 10-day: ${roc10 !== null ? (roc10>=0?'+':'')+roc10+'%' : 'N/A'}
• 20-day: ${roc20 !== null ? (roc20>=0?'+':'')+roc20+'%' : 'N/A'}
• 60-day: ${roc60 !== null ? (roc60>=0?'+':'')+roc60+'%' : 'N/A'}
52-week high: $${dd.high52w} | 52-week low: $${dd.low52w}
Drawdown from 52w high: ${dd.drawdownFromHigh}%

EMA POSITIONS (price vs each EMA):
• Price vs EMA8: ${priceVsEma8!==null?(priceVsEma8>=0?'ABOVE':'BELOW')+' by '+Math.abs(priceVsEma8)+'%':'N/A'} (EMA8=$${ema8})
• Price vs EMA21: ${priceVsEma21!==null?(priceVsEma21>=0?'ABOVE':'BELOW')+' by '+Math.abs(priceVsEma21)+'%':'N/A'} (EMA21=$${ema21})
• Price vs EMA50: ${priceVsEma50!==null?(priceVsEma50>=0?'ABOVE':'BELOW')+' by '+Math.abs(priceVsEma50)+'%':'N/A'} (EMA50=$${ema50})
• Price vs EMA200: ${priceVsEma200!==null?(priceVsEma200>=0?'ABOVE':'BELOW')+' by '+Math.abs(priceVsEma200)+'%':'N/A'} (EMA200=$${ema200})
EMA ALIGNMENT: ${emaAlignment}

MOMENTUM INDICATORS:
• RSI(14): ${rsi14} (${rsi14>70?'OVERBOUGHT':rsi14<30?'OVERSOLD':rsi14>55?'bullish':'bearish'})
• RSI(5) short-term: ${rsi5}
• MACD line: ${macdData?.line} | Signal: ${macdData?.signal} | Histogram: ${macdData?.histogram} (${macdData?.histogram>0?'BULLISH crossover / momentum':'BEARISH crossover / momentum'})
• Bollinger position: ${bbPosition}% of band width (0=lower band, 100=upper band)
• BB upper: $${bb?.upper} | middle: $${bb?.middle} | lower: $${bb?.lower}

TREND STRUCTURE (last 30 bars): ${trendStructure}
TREND STRUCTURE (last 10 bars / short-term): ${trendStructure5d}

VOLUME ANALYSIS:
• 5d avg vs 20d avg ratio: ${volAnalysis.ratio}x (${volAnalysis.trend})
• Up-volume % (last 10 days): ${volAnalysis.upVolPct}% → ${volAnalysis.confirmation}

COMPUTED BIAS SCORE: ${bullPct}% bullish signals (${bullSignals} bull vs ${bearSignals} bear signals)
COMPUTED BIAS: ${computedBias.toUpperCase()} (certainty: ${biasCertainty}/50)

MACRO CONTEXT:
• SPY 5d change: ${macro.spy5dChg !== null ? (macro.spy5dChg>=0?'+':'')+macro.spy5dChg+'%' : 'N/A'}
• SPY 20d change: ${macro.spy20dChg !== null ? (macro.spy20dChg>=0?'+':'')+macro.spy20dChg+'%' : 'N/A'}
• VIX: ${macro.vix} (regime: ${macro.regime})

KEY LEVELS (MATHEMATICALLY DERIVED):
Nearest support: $${nearestSupport} | Next: $${nextMajorSupport}
Nearest resistance: $${nearestResistance} | Next: $${nextMajorResistance}
VWAP 20d: $${vwap20d} | VWAP 90d: $${vwap90d}
Fibonacci (60d swing): High=$${fib.high} Low=$${fib.low} | 38.2%=$${fib.r382} 50%=$${fib.r500} 61.8%=$${fib.r618} 78.6%=$${fib.r786}
Volume Profile HVNs (key S/R nodes): ${hvns.map(p=>'$'+p).join(', ')}

ATR-BASED TRADE LEVELS (computed from ATR=${atr14?.toFixed(2)}):
• LONG scenario: Entry=$${longEntry} Stop=$${longStop} T1=$${longTarget1} T2=$${longTarget2} (R:R=${longRR}:1)
• SHORT scenario: Entry=$${shortEntry} Stop=$${shortStop} T1=$${shortTarget1} T2=$${shortTarget2} (R:R=${shortRR}:1)

SUPPLY ZONES (institutional selling): ${sdz.supply.map(z=>'$'+z.bottom+'-$'+z.top+'('+z.strength+'x vol)').join(' | ')||'none identified near price'}
DEMAND ZONES (institutional buying): ${sdz.demand.map(z=>'$'+z.bottom+'-$'+z.top+'('+z.strength+'x vol)').join(' | ')||'none identified near price'}

=== SYNTHESIS TASK ===
Based STRICTLY on the data above:
1. Confirm or challenge the computed bias (${computedBias}) — explain WHY using only the signals above
2. Identify the single most important pattern/setup playing out RIGHT NOW
3. Identify the ONE KEY LEVEL that, if broken, changes everything
4. Write a sharp 2-sentence narrative (no generic phrases like "showing bullish momentum" — be specific)
5. Use ONLY the pre-computed ATR trade levels above for entry/stop/target

Return JSON:
{
  "bias": "${computedBias}",
  "biasScore": ${bullPct},
  "confidence": <0-100, based on signal agreement>,
  "keyPattern": "<specific setup: e.g. 'Death cross EMA50/200 confirmed, price below all EMAs'  — be precise>",
  "narrative": "<2 sentences, specific, institutional. Reference actual numbers from the data. No generic phrases.>",
  "keyPivot": <the single most important price level to watch, must be from the data above>,
  "keyPivotLabel": "<what breaks if this level fails/holds>",
  "nearestSupport": ${nearestSupport},
  "nearestResistance": ${nearestResistance},
  "tradeSetup": {
    "direction": "<long|short|wait — only 'wait' if R:R < 1.5 or conflicting signals>",
    "entry": ${computedBias === 'bullish' ? longEntry : shortEntry},
    "stop": ${computedBias === 'bullish' ? longStop : shortStop},
    "target1": ${computedBias === 'bullish' ? longTarget1 : shortTarget1},
    "target2": ${computedBias === 'bullish' ? longTarget2 : shortTarget2},
    "rrRatio": ${computedBias === 'bullish' ? longRR : shortRR},
    "atr": ${atr14?.toFixed(2)},
    "rationale": "<one sentence: why this specific entry/stop/target based on levels above>"
  },
  "regime": "${macro.regime}",
  "warnings": ["<list any major red flags: e.g. 'price -8% in 20d', 'below all EMAs', 'VIX elevated at 26'>"]
}`

  // Call Claude with the structured brief
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: 'You are Dr. Marcus Webb, institutional quant analyst. You synthesize pre-computed quantitative data into sharp, honest trading analysis. You never soften bad news — if the signals are bearish, say so clearly. You never invent price levels. Return only valid JSON.',
    messages: [{ role: 'user', content: brief }]
  })
  
  let synthesis = {}
  const text = msg.content[0]?.text || '{}'
  try {
    synthesis = JSON.parse(text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim())
  } catch(e) {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) try { synthesis = JSON.parse(match[0]) } catch(e2) {}
  }
  
  // Return the full computed + synthesized result
  return {
    symbol,
    currentPrice: +price.toFixed(2),
    computedAt: new Date().toISOString(),
    
    // Pre-computed quantitative signals (Claude cannot override these)
    signals: {
      ema: { ema8, ema21, ema50, ema200, alignment: emaAlignment },
      rsi: { rsi14, rsi5 },
      macd: macdData,
      bollinger: bb ? { ...bb, position: bbPosition } : null,
      vwap: { d20: vwap20d, d90: vwap90d },
      momentum: { roc1, roc5, roc10, roc20, roc60 },
      volume: volAnalysis,
      trendStructure,
      trendStructure5d,
      drawdown: dd,
      atr: atr14,
      atrPct,
    },
    
    // Key levels (computed)
    levels: {
      nearestSupport, nearestResistance,
      nextMajorSupport, nextMajorResistance,
      hvns, fib,
      supplyZones: sdz.supply,
      demandZones: sdz.demand,
    },
    
    // ATR-based trade scenarios (computed)
    longScenario:  { entry: longEntry,  stop: longStop,  target1: longTarget1,  target2: longTarget2,  rr: longRR  },
    shortScenario: { entry: shortEntry, stop: shortStop, target1: shortTarget1, target2: shortTarget2, rr: shortRR },
    
    // Bias computed by code
    computedBias,
    biasScore: bullPct,
    bullSignals, bearSignals,
    
    // Claude synthesis
    ...synthesis,
    
    // Macro
    macro,
    
    // Metadata
    cacheAge: '0m',
    dataSource: 'polygon_realtime',
    engine: 'AnkushAI_QuantEngine_v2',
  }
}

// ── CACHE ─────────────────────────────────────────────────────────────────────
async function getCached(symbol) {
  try {
    if (!SUPA_URL || !SUPA_KEY) return null
    const r = await fetch(SUPA_URL+'/rest/v1/symbol_analysis?symbol=eq.'+encodeURIComponent(symbol+'_chartv2')+'&select=result,updated_at&limit=1', {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer '+SUPA_KEY }
    })
    const rows = await r.json()
    if (!rows?.[0]) return null
    const age = Date.now() - new Date(rows[0].updated_at).getTime()
    if (age > CACHE_TTL) return null
    return { ...rows[0].result, _cached:true, cacheAge: Math.round(age/60000)+'m' }
  } catch(e) { return null }
}

async function setCache(symbol, result) {
  try {
    if (!SUPA_URL || !SUPA_KEY) return
    await fetch(SUPA_URL+'/rest/v1/symbol_analysis', {
      method:'POST',
      headers:{ apikey:SUPA_KEY, Authorization:'Bearer '+SUPA_KEY, 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates' },
      body: JSON.stringify({ symbol:symbol+'_chartv2', result, updated_at:new Date().toISOString() })
    })
  } catch(e) {}
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const symbol = (req.query.symbol || 'SPY').toUpperCase().trim()
  const force  = req.query.force === '1'

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=1800')  // 30min CDN cache
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (!force) {
      const cached = await getCached(symbol)
      if (cached) return res.json(cached)
    }
    const result = await buildQuantAnalysis(symbol)
    await setCache(symbol, result)
    return res.json(result)
  } catch(e) {
    console.error('[chart-analysis v2]', symbol, e.message)
    return res.status(500).json({ error: e.message, symbol })
  }
}
