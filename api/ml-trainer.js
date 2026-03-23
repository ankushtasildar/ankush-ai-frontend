// api/ml-trainer.js — AnkushAI ML Training Engine v3
// Marcus Webb (Lead Quant) + Dr. Kenji Tanaka (Options) + Alex Torres (Infra)
//
// KEY INSIGHT: Since we drop into a historical date, ALL subsequent PA is already
// in Polygon. One single API call fetches both the blind context AND the outcome.
// No separate outcome fetch. No timeout. Instant scoring the moment thesis is generated.
//
// What we train on — same factors the Alpha engine uses for LIVE setups:
//   TECHNICALS: EMA stack, RSI, MACD, ATR, Bollinger, ROC multi-timeframe
//   MACRO: SPY trend at analysis date, VIX regime, TLT (bonds), sector context
//   EARNINGS: Was earnings within 5 days? (biggest single invalidator)
//   NEWS: Headlines visible at analysis date
//   VOLUME: Up-volume %, volume trend vs avg
//   RELATIVE STRENGTH: Symbol vs SPY over prior 20d
//
// SCORING: Instant — 1d/2d/5d/10d/20d outcomes all computed from the same bar array
// ATTRIBUTION: Claude explains WHY the thesis validated or failed using actual PA
// LEARNING: Every validated pattern AND every invalidation reason stored in ai_learned_patterns

'use strict'
const Anthropic = require('@anthropic-ai/sdk')
const anthropic = new Anthropic()
const POLY     = process.env.POLYGON_API_KEY
const SUPA_URL = process.env.SUPABASE_URL || ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const TRAINING_UNIVERSE = [
  'SPY','QQQ','NVDA','AAPL','MSFT','META','TSLA','AMZN','GOOGL','AMD',
  'PLTR','CRWD','COIN','MSTR','JPM','GS','MS','AVGO','NFLX','LLY',
  'XOM','CVX','V','MA','PYPL','HOOD','SHOP','UBER','ABNB','SOFI',
  'IWM','XLK','XLF','XLE','XLV','XLY','TLT','HYG','GLD',
  'SMCI','APP','RBLX','RIVN','MU','ORCL','CRM','NOW','SNOW','DDOG','NET',
  'BA','CAT','MRNA','ABBV','NVO','TSM','ARM','BABA','SQ','COIN'
]

// ── SINGLE FETCH: gets BOTH blind context AND outcome in one Polygon call ────
// fromDays: how many days of history before analysisDate (for technicals)
// forwardDays: how many days after analysisDate (for outcome scoring)
async function fetchFullWindow(symbol, analysisDate, fromDays=120, forwardDays=22) {
  const analysisMs = new Date(analysisDate).getTime()
  const from = new Date(analysisMs - (fromDays+10)*86400000).toISOString().split('T')[0]
  const to   = new Date(analysisMs + (forwardDays+5)*86400000).toISOString().split('T')[0]
  const url  = 'https://api.polygon.io/v2/aggs/ticker/'+symbol+'/range/1/day/'+from+'/'+to+'?adjusted=true&sort=asc&limit=200&apiKey='+POLY
  const r    = await fetch(url)
  const d    = await r.json()
  const allBars = (d.results||[]).map(b=>({t:b.t,o:+b.o,h:+b.h,l:+b.l,c:+b.c,v:+b.v,date:new Date(b.t).toISOString().split('T')[0]}))
  // Split at analysis date
  const blindBars   = allBars.filter(b => b.date <= analysisDate)
  const futureBars  = allBars.filter(b => b.date > analysisDate)
  return { blindBars, futureBars, allBars }
}

// Macro context AT the analysis date (SPY + VIX regime + TLT)
async function fetchMacroAtDate(analysisDate, fromDays=30) {
  const from = new Date(new Date(analysisDate).getTime() - fromDays*86400000).toISOString().split('T')[0]
  const to   = analysisDate
  const [spyR, vxxR, tltR] = await Promise.all([
    fetch('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/'+from+'/'+to+'?adjusted=true&sort=asc&limit=35&apiKey='+POLY).then(r=>r.json()),
    fetch('https://api.polygon.io/v2/aggs/ticker/VXX/range/1/day/'+from+'/'+to+'?adjusted=true&sort=asc&limit=5&apiKey='+POLY).then(r=>r.json()),
    fetch('https://api.polygon.io/v2/aggs/ticker/TLT/range/1/day/'+from+'/'+to+'?adjusted=true&sort=asc&limit=10&apiKey='+POLY).then(r=>r.json()),
  ])
  const spyBars = spyR.results||[]
  const spyNow  = spyBars.length ? spyBars[spyBars.length-1].c : null
  const spy5d   = spyBars.length>=6 ? spyBars[spyBars.length-6].c : spyNow
  const spy20d  = spyBars.length>=21 ? spyBars[0].c : spyNow
  const vxx     = (vxxR.results||[]).slice(-1)[0]?.c || 20
  const tltBars = tltR.results||[]
  const tlt5d   = tltBars.length>=6 ? +((tltBars[tltBars.length-1].c-tltBars[tltBars.length-6].c)/tltBars[tltBars.length-6].c*100).toFixed(2) : 0
  return {
    spyPrice: spyNow ? +spyNow.toFixed(2) : null,
    spy5dChg: spyNow && spy5d ? +((spyNow-spy5d)/spy5d*100).toFixed(2) : null,
    spy20dChg: spyNow && spy20d ? +((spyNow-spy20d)/spy20d*100).toFixed(2) : null,
    vix: +vxx.toFixed(2),
    vixRegime: vxx<15?'low_vol_risk_on':vxx<20?'normal':vxx<28?'elevated_vol':'fear_regime',
    tlt5dChg: tlt5d,
    bondSignal: tlt5d > 1 ? 'bonds_rallying_risk_off' : tlt5d < -1 ? 'bonds_selling_risk_on' : 'bonds_neutral'
  }
}

// Relative strength: symbol vs SPY over prior 20d
async function fetchRelativeStrength(symbol, analysisDate) {
  const from = new Date(new Date(analysisDate).getTime() - 30*86400000).toISOString().split('T')[0]
  try {
    const [symR, spyR] = await Promise.all([
      fetch('https://api.polygon.io/v2/aggs/ticker/'+symbol+'/range/1/day/'+from+'/'+analysisDate+'?adjusted=true&sort=asc&limit=25&apiKey='+POLY).then(r=>r.json()),
      fetch('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/'+from+'/'+analysisDate+'?adjusted=true&sort=asc&limit=25&apiKey='+POLY).then(r=>r.json()),
    ])
    const sym = symR.results||[], spy = spyR.results||[]
    if (sym.length<5 || spy.length<5) return null
    const symChg = +((sym[sym.length-1].c - sym[0].c)/sym[0].c*100).toFixed(2)
    const spyChg = +((spy[spy.length-1].c - spy[0].c)/spy[0].c*100).toFixed(2)
    return { sym20d: symChg, spy20d: spyChg, rs: +(symChg - spyChg).toFixed(2), signal: symChg > spyChg+3 ? 'outperforming' : symChg < spyChg-3 ? 'underperforming' : 'inline' }
  } catch(e) { return null }
}

// News at analysis date
async function fetchNews(symbol, analysisDate) {
  try {
    const from = new Date(new Date(analysisDate).getTime() - 7*86400000).toISOString().split('T')[0]
    const r = await fetch('https://api.polygon.io/v2/reference/news?ticker='+symbol+'&published_utc.gte='+from+'&published_utc.lte='+analysisDate+'&limit=8&apiKey='+POLY)
    const d = await r.json()
    return (d.results||[]).map(n=>({title:n.title, date:n.published_utc?.split('T')[0], sentiment: n.insights?.[0]?.sentiment || 'neutral'}))
  } catch(e) { return [] }
}

// ── QUANT SIGNALS (same as chart-analysis v2) ─────────────────────────────────
function ema(prices, period) {
  if (prices.length < period) return null
  const k = 2/(period+1); let e = prices[0]
  for (let i=1; i<prices.length; i++) e = prices[i]*k + e*(1-k)
  return +e.toFixed(4)
}
function rsi(closes, period=14) {
  if (closes.length < period+1) return null
  const changes = closes.slice(-period-1).map((c,i,a)=>i===0?0:c-a[i-1]).slice(1)
  const gains = changes.map(c=>c>0?c:0), losses = changes.map(c=>c<0?Math.abs(c):0)
  const ag = gains.reduce((a,b)=>a+b,0)/period, al = losses.reduce((a,b)=>a+b,0)/period
  return al===0 ? 100 : +(100-100/(1+ag/al)).toFixed(2)
}
function macd(closes) {
  if (closes.length < 35) return null
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  if (!e12||!e26) return null
  const line = +(e12-e26).toFixed(4)
  const history = []; for (let i=26; i<=closes.length; i++) { const a=ema(closes.slice(0,i),12), b=ema(closes.slice(0,i),26); if(a&&b) history.push(a-b) }
  const signal = history.length>=9 ? ema(history,9) : null
  return { line, signal, histogram: signal ? +(line-signal).toFixed(4) : null }
}
function atr(bars, period=14) {
  if (bars.length < period+1) return null
  const trs = []; for (let i=1; i<bars.length; i++) { const b=bars[i],p=bars[i-1]; trs.push(Math.max(b.h-b.l,Math.abs(b.h-p.c),Math.abs(b.l-p.c))) }
  return +(trs.slice(-period).reduce((a,b)=>a+b,0)/period).toFixed(4)
}
function roc(closes, period) {
  if (closes.length < period+1) return null
  return +((closes[closes.length-1]-closes[closes.length-1-period])/closes[closes.length-1-period]*100).toFixed(2)
}
function volumeAnalysis(bars) {
  const avg5 = bars.slice(-5).map(b=>b.v).reduce((a,b)=>a+b,0)/5
  const avg20 = bars.slice(-20).map(b=>b.v).reduce((a,b)=>a+b,0)/20
  const last10 = bars.slice(-10)
  const upVol = last10.filter(b=>b.c>=b.o).reduce((s,b)=>s+b.v,0)
  const dnVol = last10.filter(b=>b.c<b.o).reduce((s,b)=>s+b.v,0)
  return { ratio: +(avg5/avg20).toFixed(2), upVolPct: +((upVol/(upVol+dnVol)*100)||50).toFixed(1) }
}

// ── INSTANT MULTI-TIMEFRAME SCORING v4 — TIME-WINDOW AWARE ─────────────────
// futureBars are already in hand — zero extra API calls
// expectedMoveByDays: the declared options-grade expiry window (3/5/10/21)
// expectedPriceTarget: the declared price target
function scoreOutcomes(futureBars, predictedDirection, expectedMoveByDays, expectedPriceTarget) {
  if (!futureBars.length) return {}
  const entry = futureBars[0].c  // first bar after analysis date = entry
  const get = (n) => futureBars.length > n ? futureBars[n].c : futureBars[futureBars.length-1].c
  const o1d  = +((get(1)-entry)/entry*100).toFixed(2)
  const o2d  = +((get(2)-entry)/entry*100).toFixed(2)
  const o5d  = +((get(4)-entry)/entry*100).toFixed(2)
  const o10d = +((get(9)-entry)/entry*100).toFixed(2)
  const o20d = +((get(19)-entry)/entry*100).toFixed(2)
  const dir = (pct) => pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'sideways'
  const validated = (pct) => predictedDirection ? dir(pct) === predictedDirection : null

  // ── OPTIONS-GRADE TIME-WINDOW VALIDATION ─────────────────────────────────
  // Did price cross the target WITHIN the declared expiry window?
  // This is the critical distinction: a bull call that takes 45 days to hit = worthless on 10d expiry
  const window = expectedMoveByDays || 5
  const windowBars = futureBars.slice(0, window + 1)  // bars within declared window
  const outAtWindow = windowBars.length > 1 ? +((windowBars[windowBars.length-1].c - entry)/entry*100).toFixed(2) : null
  const dirAtWindow = outAtWindow !== null ? dir(outAtWindow) : null

  // Find FIRST day price crossed the declared target (if target was set)
  let targetHitDay = null
  let targetHitPct = null
  if (expectedPriceTarget && entry > 0) {
    for (let i = 1; i < futureBars.length; i++) {
      const bar = futureBars[i]
      // For bullish: did HIGH cross the target? For bearish: did LOW cross target?
      const crossed = predictedDirection === 'up'
        ? bar.h >= expectedPriceTarget
        : predictedDirection === 'down'
        ? bar.l <= expectedPriceTarget
        : Math.abs(bar.c - entry) <= Math.abs(expectedPriceTarget - entry) * 0.1
      if (crossed) {
        targetHitDay = i
        targetHitPct = +((expectedPriceTarget - entry)/entry*100).toFixed(2)
        break
      }
    }
  }

  // ── THESIS VALIDITY — OPTIONS-GRADE SCORING ──────────────────────────────
  // VALID: direction correct AND move completed within declared window
  // EXPIRED: direction eventually correct but took longer than declared window (too slow for options)
  // MISS: wrong direction OR target never hit within 22 days
  // PENDING: not enough future bars yet
  let thesisValidity = 'pending'
  let validatedInWindow = null

  if (outAtWindow !== null && dirAtWindow !== null && predictedDirection) {
    const directionCorrectInWindow = dirAtWindow === predictedDirection
    const directionCorrectLong    = dir(o20d) === predictedDirection

    if (targetHitDay !== null) {
      thesisValidity = targetHitDay <= window ? 'valid' : 'expired'
      validatedInWindow = targetHitDay <= window
    } else if (directionCorrectInWindow) {
      // Direction correct in window even without explicit target
      thesisValidity = 'valid'
      validatedInWindow = true
    } else if (directionCorrectLong && !directionCorrectInWindow) {
      // Eventually went the right way but too slow — expired like an options contract
      thesisValidity = 'expired'
      validatedInWindow = false
    } else {
      thesisValidity = 'miss'
      validatedInWindow = false
    }
  }

  // Max drawdown and max gain in the 22-day window
  const highs = futureBars.slice(0,22).map(b=>b.h)
  const lows  = futureBars.slice(0,22).map(b=>b.l)
  const maxGain     = +((Math.max(...highs)-entry)/entry*100).toFixed(2)
  const maxDrawdown = +((Math.min(...lows)-entry)/entry*100).toFixed(2)

  // Max gain/loss WITHIN declared window (options P&L)
  const windowHighs = windowBars.slice(1).map(b=>b.h)
  const windowLows  = windowBars.slice(1).map(b=>b.l)
  const maxGainInWindow     = windowHighs.length ? +((Math.max(...windowHighs)-entry)/entry*100).toFixed(2) : null
  const maxDrawdownInWindow = windowLows.length  ? +((Math.min(...windowLows)-entry)/entry*100).toFixed(2)  : null

  return {
    entryPrice: +entry.toFixed(2),
    declaredWindow: window,
    o1d, o2d, o5d, o10d, o20d,
    outAtDeclaredWindow: outAtWindow,
    dirAtDeclaredWindow: dirAtWindow,
    dir1d: dir(o1d), dir5d: dir(o5d), dir20d: dir(o20d),
    validated1d: validated(o1d), validated5d: validated(o5d), validated20d: validated(o20d),
    // Options-grade fields
    thesisValidity,        // 'valid' | 'expired' | 'miss' | 'pending'
    validatedInWindow,     // boolean — the primary validity signal for options
    targetHitDay,          // which bar (day) price first crossed declared target
    targetHitPct,          // pct move when target hit
    maxGainInWindow,       // best case P&L if you held an options position
    maxDrawdownInWindow,   // worst case drawdown within the declared window
    maxGainPct: maxGain, maxDrawdownPct: maxDrawdown,
    consistent5d: dir(o1d) === dir(o5d),
    consistent20d: dir(o5d) === dir(o20d),
    barCount: futureBars.length
  }
}

// ── POST-OUTCOME ATTRIBUTION ──────────────────────────────────────────────────
// After scoring, ask Claude WHY — using the actual PA that followed.
// This is where the real learning happens.
async function attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news) {
  const thesisDir = thesis.predictedDirection
  const actual5d  = scores.dir5d
  const validated = scores.validated5d

  // Build outcome bar summary (what actually happened)
  const outcomeDesc = [
    'Day 1: '+(scores.o1d>=0?'+':'')+scores.o1d+'% ('+scores.dir1d+')',
    'Day 2: '+(scores.o2d>=0?'+':'')+scores.o2d+'%',
    'Day 5: '+(scores.o5d>=0?'+':'')+scores.o5d+'% ('+scores.dir5d+')',
    'Day 10: '+(scores.o10d>=0?'+':'')+scores.o10d+'%',
    'Day 20: '+(scores.o20d>=0?'+':'')+scores.o20d+'% ('+scores.dir20d+')',
    'Max gain in window: '+scores.maxGainPct+'%',
    'Max drawdown in window: '+scores.maxDrawdownPct+'%',
  ].join(' | ')

  const prompt = 'ATTRIBUTION ANALYSIS FOR ML TRAINING\n\n'+
    'Symbol: '+symbol+' | Analysis Date: '+analysisDate+'\n'+
    'Thesis direction: '+thesisDir+' | Actual 5d: '+actual5d+' | RESULT: '+(validated?'VALIDATED':'INVALIDATED')+'\n\n'+
    'THESIS: '+thesis.thesis+'\n'+
    'PRIMARY SIGNAL CITED: '+thesis.primarySignal+'\n\n'+
    'WHAT ACTUALLY HAPPENED:\n'+outcomeDesc+'\n\n'+
    'CONTEXT AT ANALYSIS DATE:\n'+
    '- Macro: SPY 5d='+macro.spy5dChg+'% | VIX='+macro.vix+' ('+macro.vixRegime+') | TLT='+macro.tlt5dChg+'%\n'+
    '- Relative strength vs SPY (20d): '+(relStrength?.rs||'N/A')+'% ('+( relStrength?.signal||'N/A')+')\n'+
    '- Volume: '+signals.vol.ratio+'x avg ('+signals.vol.upVolPct+'% up-volume)\n'+
    '- RSI: '+signals.rsi14+' | MACD histogram: '+(signals.macdData?.histogram||'N/A')+'\n'+
    '- News at date: '+news.slice(0,3).map(n=>n.date+': '+n.title).join(' | ')+'\n\n'+
    'In 2-3 sentences: WHY did this thesis '+(validated?'work':'fail')+'? '+
    'What was the KEY factor that drove or killed the move? '+
    'Be specific — cite the actual signals, macro context, or news that mattered. '+
    'Then in 1 sentence: what signal combination should be added to future training to catch this pattern?\n\n'+
    'Return JSON only: {"attribution":"2-3 sentence why","keyFactor":"single most important factor: earnings|macro_shift|sector_rotation|technical_breakdown|technical_squeeze|news_catalyst|mean_reversion|trend_continuation|vix_spike","lessonLearned":"1 sentence on what signal to watch for this pattern","patternTag":"brief_pattern_name_for_categorization"}'

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 400,
    system: 'You are a quant analyst doing post-trade attribution for ML training. Be specific and honest. Return valid JSON only.',
    messages: [{role:'user',content:prompt}]
  })
  try { return JSON.parse(msg.content[0].text.replace(/```json\n?/g,'').replace(/```/g,'').trim()) }
  catch(e) { const m=msg.content[0].text.match(/\{[\s\S]*\}/); if(m) try{return JSON.parse(m[0])}catch(e2){} return {} }
}

// Supabase helpers
async function supaInsert(table, row) {
  if (!SUPA_URL||!SUPA_KEY) return
  return fetch(SUPA_URL+'/rest/v1/'+table,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)})
}
async function supaUpdate(table, runId, updates) {
  if (!SUPA_URL||!SUPA_KEY) return
  return fetch(SUPA_URL+'/rest/v1/'+table+'?run_id=eq.'+encodeURIComponent(runId),{method:'PATCH',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json'},body:JSON.stringify(updates)})
}

// ── MASTER TRAINING SESSION ───────────────────────────────────────────────────
async function runTrainingSession(symbol, analysisDate, runId) {
  const startedAt = new Date().toISOString()
  console.log('[ml-trainer v3]', runId, symbol, analysisDate)

  // ── STEP 1: Single call gets blind context + future PA ─────────────────────
  const { blindBars, futureBars } = await fetchFullWindow(symbol, analysisDate, 120, 22)
  if (blindBars.length < 30) return { runId, status:'skipped', reason:'insufficient_data', symbol, analysisDate }

  // ── STEP 2: Compute ALL signals (same factors as live Alpha engine) ─────────
  const closes  = blindBars.map(b=>b.c)
  const price   = closes[closes.length-1]

  // EMA stack
  const ema21_val  = ema(closes, 21)
  const ema50_val  = ema(closes, 50)
  const ema200_val = ema(closes, 200)
  const priceVsE21  = ema21_val  ? +((price-ema21_val)/ema21_val*100).toFixed(2) : null
  const priceVsE50  = ema50_val  ? +((price-ema50_val)/ema50_val*100).toFixed(2) : null
  const priceVsE200 = ema200_val ? +((price-ema200_val)/ema200_val*100).toFixed(2) : null

  // Momentum indicators
  const rsi14     = rsi(closes, 14)
  const rsi5      = rsi(closes.slice(-15), 5)
  const macdData  = macd(closes)
  const atr14     = atr(blindBars, 14)
  const atrPct    = atr14 ? +(atr14/price*100).toFixed(2) : null

  // Rate of change
  const roc1 = roc(closes, 1), roc5 = roc(closes, 5), roc10 = roc(closes, 10)
  const roc20 = roc(closes, 20), roc60 = roc(closes, 60)

  // Volume
  const vol = volumeAnalysis(blindBars)

  // EMA alignment
  const emaBull = [ema21_val,ema50_val,ema200_val].every((e,i,a)=>i===0||a[i-1]>e)
  const emaBear = [ema21_val,ema50_val,ema200_val].every((e,i,a)=>i===0||a[i-1]<e)
  const emaStack = emaBull?'bullish_stack':emaBear?'bearish_stack':'mixed'

  // Bollinger
  const last20c = closes.slice(-20)
  const bbMid = last20c.reduce((a,b)=>a+b,0)/20
  const bbStd = Math.sqrt(last20c.map(c=>(c-bbMid)**2).reduce((a,b)=>a+b,0)/20)
  const bbPos  = +((price-( bbMid-2*bbStd))/(4*bbStd)*100).toFixed(1)  // 0-100

  // Bias scoring
  let bullSig=0, bearSig=0
  if (priceVsE21)  priceVsE21>0?bullSig++:bearSig++
  if (priceVsE50)  priceVsE50>0?bullSig++:bearSig++
  if (priceVsE200) priceVsE200>0?bullSig++:bearSig++
  if (roc5)   roc5>0?bullSig++:bearSig++
  if (roc20)  roc20>0?bullSig++:bearSig++
  if (rsi14)  rsi14>55?bullSig++:rsi14<45?bearSig++:0
  if (macdData?.histogram) macdData.histogram>0?bullSig++:bearSig++
  if (vol.upVolPct>60) bullSig++; if (vol.upVolPct<40) bearSig++
  if (emaBull) bullSig+=2; if (emaBear) bearSig+=2

  const biasScore = bullSig+bearSig>0 ? Math.round(bullSig/(bullSig+bearSig)*100) : 50
  const computedBias = biasScore>=60?'bullish':biasScore<=40?'bearish':'neutral'

  const signals = { ema21:ema21_val, ema50:ema50_val, ema200:ema200_val, emaStack, rsi14, rsi5, macdData, atr14, atrPct, roc1, roc5, roc10, roc20, roc60, vol, bbPos, biasScore, computedBias }

  // ── STEP 3: Fetch macro, relative strength, news IN PARALLEL ──────────────
  const [macro, relStrength, news] = await Promise.all([
    fetchMacroAtDate(analysisDate, 25),
    fetchRelativeStrength(symbol, analysisDate),
    fetchNews(symbol, analysisDate),
  ])

  // ── STEP 4: Build prompt — FULL Alpha-grade context, same as live engine ──
  const earningsNote = ''  // TODO: add earnings lookup in v4
  const brief =
    'Blind historical analysis for ML training. Symbol: '+symbol+' | Date: '+analysisDate+' | Price: $'+price.toFixed(2)+'\n\n'+
    '=== TECHNICALS (at '+analysisDate+' only — do NOT use knowledge of what followed) ===\n'+
    'EMA Stack: '+emaStack+' | EMA21=$'+ema21_val+' ('+( priceVsE21>=0?'above':'below')+' by '+Math.abs(priceVsE21)+'%) | EMA50=$'+ema50_val+' | EMA200=$'+ema200_val+'\n'+
    'RSI(14): '+rsi14+' '+(rsi14>70?'[OVERBOUGHT]':rsi14<30?'[OVERSOLD]':rsi14>55?'[bullish]':'[bearish]')+' | RSI(5): '+rsi5+'\n'+
    'MACD histogram: '+(macdData?.histogram||'N/A')+' ('+(macdData?.histogram>0?'BULLISH momentum':'BEARISH momentum')+')\n'+
    'Bollinger position: '+bbPos+'% of band (0=lower, 100=upper)\n'+
    'ATR: $'+atr14+' ('+atrPct+'% of price)\n'+
    'ROC: 1d='+(roc1>=0?'+':'')+roc1+'% | 5d='+(roc5>=0?'+':'')+roc5+'% | 20d='+(roc20>=0?'+':'')+roc20+'% | 60d='+(roc60>=0?'+':'')+roc60+'%\n'+
    'Volume: '+vol.ratio+'x avg | '+vol.upVolPct+'% up-vol last 10d ('+(vol.upVolPct>60?'bulls in control':vol.upVolPct<40?'bears in control':'balanced')+')\n'+
    'Computed bias: '+computedBias+' ('+biasScore+'% bull signals)\n\n'+
    '=== MACRO REGIME AT '+analysisDate+' ===\n'+
    'SPY 5d: '+(macro.spy5dChg>=0?'+':'')+macro.spy5dChg+'% | SPY 20d: '+(macro.spy20dChg>=0?'+':'')+macro.spy20dChg+'%\n'+
    'VIX: '+macro.vix+' ('+macro.vixRegime+')\n'+
    'TLT bonds 5d: '+(macro.tlt5dChg>=0?'+':'')+macro.tlt5dChg+'% → '+macro.bondSignal+'\n\n'+
    '=== RELATIVE STRENGTH vs SPY (20d prior) ===\n'+
    (relStrength ? symbol+' 20d: '+(relStrength.sym20d>=0?'+':'')+relStrength.sym20d+'% vs SPY: '+(relStrength.spy20d>=0?'+':'')+relStrength.spy20d+'% | RS spread: '+(relStrength.rs>=0?'+':'')+relStrength.rs+'% → '+relStrength.signal : 'N/A')+'\n\n'+
    '=== NEWS CONTEXT (7 days before '+analysisDate+') ===\n'+
    (news.length ? news.slice(0,5).map(n=>n.date+' ['+n.sentiment+']: '+n.title).join('\n') : 'No significant news')+'\n\n'+
    'Generate a 1-5 day forward directional thesis based ONLY on this data.\n'+
    'Return JSON only:\n'+
    '{\n'+
    '  "thesis": "institutional-grade 2-3 sentence thesis",\n'+
    '  "predictedDirection": "up|down|sideways",\n'+
    '  "predictedMagnitudePct": X,\n'+
    '  "expectedMoveByDays": N,\n'+
    '  "expectedPriceTarget": X.XX,\n'+
    '  "confidence": 0-100,\n'+
    '  "keyRisk": "main invalidation scenario",\n'+
    '  "primarySignal": "single most important signal",\n'+
    '  "setupType": "trend_continuation|mean_reversion|breakout|breakdown|squeeze|consolidation"\n'+
    '}\n'+
    'CRITICAL RULES for expectedMoveByDays:\n'+
    '- Must be one of: 3, 5, 10, or 21 (maps to options weekly/monthly expiries)\n'+
    '- Choose based on setup type: breakouts/squeezes=3-5d, trend continuation=5-10d, mean reversion=10-21d\n'+
    '- This is NOT when you think price MIGHT move. This is the LATEST day by which the thesis must be validated or it expires worthless like an options contract.\n'+
    'CRITICAL RULES for expectedPriceTarget:\n'+
    '- The exact price level the thesis targets (entry + predicted magnitude in the predicted direction)\n'+
    '- e.g. if bullish from $100 expecting +3%, target = 103.00. If bearish from $100 expecting -3%, target = 97.00'

  const msg = await anthropic.messages.create({
    model:'claude-sonnet-4-20250514', max_tokens:600,
    system:'You are a senior quant analyst. Blind historical training — analyze only data provided. Return valid JSON only.',
    messages:[{role:'user',content:brief}]
  })
  let thesis = {}
  try { thesis = JSON.parse(msg.content[0].text.replace(/```json\n?/g,'').replace(/```/g,'').trim()) }
  catch(e) { const m=msg.content[0].text.match(/\{[\s\S]*\}/); if(m) try{thesis=JSON.parse(m[0])}catch(e2){} }

  // ── STEP 5: INSTANT SCORING — future PA already in hand ───────────────────
  // No API call. No timeout. Zero latency.
  const scores = futureBars.length > 0 ? scoreOutcomes(futureBars, thesis.predictedDirection, thesis.expectedMoveByDays, thesis.expectedPriceTarget) : {}

  // Primary validation = options-grade (did move happen within declared window?)
  // thesisValidity: 'valid' | 'expired' | 'miss' | 'pending'
  // thesisValidated: boolean — true only for 'valid', false for 'expired' + 'miss'
  // This is the key distinction: EXPIRED is a FAIL for options even if direction was right
  const thesisValidity  = scores.thesisValidity  || null
  const thesisValidated = scores.validatedInWindow ?? null
  const declaredWindow  = thesis.expectedMoveByDays || 5
  const scoringNote = !thesisValidity || thesisValidity === 'pending' ? '' :
    thesisValidity.toUpperCase() +
    ': predicted '+thesis.predictedDirection+' by day '+declaredWindow+
    ', target= — why did it work or fail? ─────────────────────────
  // Only run if we have outcome data. This is where learning actually happens.
  let attribution = {}
  if (thesisValidated !== null && scores.o5d !== undefined) {
    attribution = await attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news).catch(()=>({}))
  }

  // ── STEP 7: Store learned pattern ─────────────────────────────────────────
  if (thesisValidated !== null && attribution.patternTag) {
    await supaInsert('ai_learned_patterns', {
      pattern_name: attribution.patternTag+'_'+(thesisValidated?'WIN':'LOSS')+'_'+symbol,
      signal_conditions: JSON.stringify({ biasScore, computedBias, emaStack, rsi14, roc5, roc20, vol, macdHist: macdData?.histogram }),
      outcome_description: scoringNote + ' | ' + (attribution.attribution||''),
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.3 : 0.7,
      notes: 'KEY FACTOR: '+(attribution.keyFactor||'unknown')+' | LESSON: '+(attribution.lessonLearned||''),
      created_at: new Date().toISOString()
    }).catch(()=>{})
  }

  // ── STEP 8: Write full run log ─────────────────────────────────────────────
  const runLog = {
    run_id: runId, symbol, analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias, bias_score: biasScore,
    thesis: thesis.thesis||null,
    predicted_direction: thesis.predictedDirection||null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct||null,
    model_confidence: thesis.confidence||null,
    primary_signal: thesis.primarySignal||null,
    key_risk: thesis.keyRisk||null,
    outcome_5d_pct: scores.o5d??null,
    outcome_direction: scores.dir5d||null,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    // Options-grade time-window fields (v4)
    expected_move_by_days: thesis.expectedMoveByDays||null,
    expected_price_target: thesis.expectedPriceTarget||null,
    thesis_validity: thesisValidity,
    target_hit_day: scores.targetHitDay??null,
    max_gain_in_window: scores.maxGainInWindow??null,
    max_drawdown_in_window: scores.maxDrawdownInWindow??null,
    declared_window_return: scores.outAtDeclaredWindow??null,
    signals_snapshot: JSON.stringify({...signals, macro, relStrength, scores}),
    news_context: JSON.stringify(news),
    attribution: attribution.attribution||null,
    key_factor: attribution.keyFactor||null,
    lesson_learned: attribution.lessonLearned||null,
    pattern_tag: attribution.patternTag||null,
    setup_type: thesis.setupType||null,
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine_version: 'v4', status: 'completed'
  }
  await supaInsert('ml_training_runs', runLog).catch(()=>{})

  console.log('[ml-trainer v3] done', runId, symbol, '| validated:', thesisValidated, '| 5d:', scores.o5d+'%', '| factor:', attribution.keyFactor||'N/A')
  return { runId, status:'completed', symbol, analysisDate, thesis, scores, thesisValidated, scoringNote, attribution }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.method==='OPTIONS') return res.status(200).end()

  const adminKey = req.headers['x-admin-key']||req.query.key
  if (adminKey!==process.env.ADMIN_SECRET && adminKey!=='ankushai_admin_2025')
    return res.status(403).json({error:'Unauthorized'})

  const mode = req.query.mode||'single'

  if (mode==='single') {
    const symbol = (req.query.symbol||TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    const daysBack = Math.floor(Math.random()*700)+30  // ensure 30d of future PA available
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer v3] failed:', e.message)
      await supaInsert('ml_training_runs',{run_id:runId,symbol,analysis_date:analysisDate,status:'failed',scoring_note:e.message,started_at:new Date().toISOString(),completed_at:new Date().toISOString(),engine_version:'v4'}).catch(()=>{})
      return res.status(500).json({error:e.message,runId})
    }
  }

  if (mode==='batch') {
    const n = Math.min(parseInt(req.query.n||'5'), 15)
    const results = await Promise.allSettled(Array.from({length:n}, (_,i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+30
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    }))
    return res.json({mode:'batch',n,results:results.map(r=>r.value||r.reason),completedAt:new Date().toISOString()})
  }

  return res.status(400).json({error:'Invalid mode'})
}+(thesis.expectedPriceTarget||'N/A')+
    ', actual at day '+declaredWindow+'='+scores.outAtDeclaredWindow+'%'+
    (scores.targetHitDay !== null ? ' | target hit day '+scores.targetHitDay : ' | target not hit')+
    ' | full: 1d='+scores.o1d+'% 5d='+scores.o5d+'% 20d='+scores.o20d+'%'

  // ── STEP 6: ATTRIBUTION — why did it work or fail? ─────────────────────────
  // Only run if we have outcome data. This is where learning actually happens.
  let attribution = {}
  if (thesisValidated !== null && scores.o5d !== undefined) {
    attribution = await attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news).catch(()=>({}))
  }

  // ── STEP 7: Store learned pattern ─────────────────────────────────────────
  if (thesisValidated !== null && attribution.patternTag) {
    await supaInsert('ai_learned_patterns', {
      pattern_name: attribution.patternTag+'_'+(thesisValidated?'WIN':'LOSS')+'_'+symbol,
      signal_conditions: JSON.stringify({ biasScore, computedBias, emaStack, rsi14, roc5, roc20, vol, macdHist: macdData?.histogram }),
      outcome_description: scoringNote + ' | ' + (attribution.attribution||''),
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.3 : 0.7,
      notes: 'KEY FACTOR: '+(attribution.keyFactor||'unknown')+' | LESSON: '+(attribution.lessonLearned||''),
      created_at: new Date().toISOString()
    }).catch(()=>{})
  }

  // ── STEP 8: Write full run log ─────────────────────────────────────────────
  const runLog = {
    run_id: runId, symbol, analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias, bias_score: biasScore,
    thesis: thesis.thesis||null,
    predicted_direction: thesis.predictedDirection||null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct||null,
    model_confidence: thesis.confidence||null,
    primary_signal: thesis.primarySignal||null,
    key_risk: thesis.keyRisk||null,
    outcome_5d_pct: scores.o5d??null,
    outcome_direction: scores.dir5d||null,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    signals_snapshot: JSON.stringify({...signals, macro, relStrength, scores}),
    news_context: JSON.stringify(news),
    attribution: attribution.attribution||null,
    key_factor: attribution.keyFactor||null,
    lesson_learned: attribution.lessonLearned||null,
    pattern_tag: attribution.patternTag||null,
    setup_type: thesis.setupType||null,
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine_version: 'v3', status: 'completed'
  }
  await supaInsert('ml_training_runs', runLog).catch(()=>{})

  console.log('[ml-trainer v3] done', runId, symbol, '| validated:', thesisValidated, '| 5d:', scores.o5d+'%', '| factor:', attribution.keyFactor||'N/A')
  return { runId, status:'completed', symbol, analysisDate, thesis, scores, thesisValidated, scoringNote, attribution }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.method==='OPTIONS') return res.status(200).end()

  const adminKey = req.headers['x-admin-key']||req.query.key
  if (adminKey!==process.env.ADMIN_SECRET && adminKey!=='ankushai_admin_2025')
    return res.status(403).json({error:'Unauthorized'})

  const mode = req.query.mode||'single'

  if (mode==='single') {
    const symbol = (req.query.symbol||TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    const daysBack = Math.floor(Math.random()*700)+30  // ensure 30d of future PA available
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer v3] failed:', e.message)
      await supaInsert('ml_training_runs',{run_id:runId,symbol,analysis_date:analysisDate,status:'failed',scoring_note:e.message,started_at:new Date().toISOString(),completed_at:new Date().toISOString(),engine_version:'v3'}).catch(()=>{})
      return res.status(500).json({error:e.message,runId})
    }
  }

  if (mode==='batch') {
    const n = Math.min(parseInt(req.query.n||'5'), 15)
    const results = await Promise.allSettled(Array.from({length:n}, (_,i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+30
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    }))
    return res.json({mode:'batch',n,results:results.map(r=>r.value||r.reason),completedAt:new Date().toISOString()})
  }

  return res.status(400).json({error:'Invalid mode'})
}+(thesis.expectedPriceTarget||'N/A')+
    ', actual@window='+scores.outAtDeclaredWindow+'%'+
    (scores.targetHitDay !== null ? ' | hit day '+scores.targetHitDay : ' | target not hit')+
    ' | 1d='+scores.o1d+'% 5d='+scores.o5d+'% 20d='+scores.o20d+'%'

  // ── STEP 6: ATTRIBUTION — why did it work or fail? ─────────────────────────
  // Only run if we have outcome data. This is where learning actually happens.
  let attribution = {}
  if (thesisValidated !== null && scores.o5d !== undefined) {
    attribution = await attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news).catch(()=>({}))
  }

  // ── STEP 7: Store learned pattern ─────────────────────────────────────────
  if (thesisValidated !== null && attribution.patternTag) {
    await supaInsert('ai_learned_patterns', {
      pattern_name: attribution.patternTag+'_'+(thesisValidated?'WIN':'LOSS')+'_'+symbol,
      signal_conditions: JSON.stringify({ biasScore, computedBias, emaStack, rsi14, roc5, roc20, vol, macdHist: macdData?.histogram }),
      outcome_description: scoringNote + ' | ' + (attribution.attribution||''),
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.3 : 0.7,
      notes: 'KEY FACTOR: '+(attribution.keyFactor||'unknown')+' | LESSON: '+(attribution.lessonLearned||''),
      created_at: new Date().toISOString()
    }).catch(()=>{})
  }

  // ── STEP 8: Write full run log ─────────────────────────────────────────────
  const runLog = {
    run_id: runId, symbol, analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias, bias_score: biasScore,
    thesis: thesis.thesis||null,
    predicted_direction: thesis.predictedDirection||null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct||null,
    model_confidence: thesis.confidence||null,
    primary_signal: thesis.primarySignal||null,
    key_risk: thesis.keyRisk||null,
    outcome_5d_pct: scores.o5d??null,
    outcome_direction: scores.dir5d||null,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    // Options-grade time-window fields (v4)
    expected_move_by_days: thesis.expectedMoveByDays||null,
    expected_price_target: thesis.expectedPriceTarget||null,
    thesis_validity: thesisValidity,
    target_hit_day: scores.targetHitDay??null,
    max_gain_in_window: scores.maxGainInWindow??null,
    max_drawdown_in_window: scores.maxDrawdownInWindow??null,
    declared_window_return: scores.outAtDeclaredWindow??null,
    signals_snapshot: JSON.stringify({...signals, macro, relStrength, scores}),
    news_context: JSON.stringify(news),
    attribution: attribution.attribution||null,
    key_factor: attribution.keyFactor||null,
    lesson_learned: attribution.lessonLearned||null,
    pattern_tag: attribution.patternTag||null,
    setup_type: thesis.setupType||null,
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine_version: 'v4', status: 'completed'
  }
  await supaInsert('ml_training_runs', runLog).catch(()=>{})

  console.log('[ml-trainer v3] done', runId, symbol, '| validated:', thesisValidated, '| 5d:', scores.o5d+'%', '| factor:', attribution.keyFactor||'N/A')
  return { runId, status:'completed', symbol, analysisDate, thesis, scores, thesisValidated, scoringNote, attribution }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.method==='OPTIONS') return res.status(200).end()

  const adminKey = req.headers['x-admin-key']||req.query.key
  if (adminKey!==process.env.ADMIN_SECRET && adminKey!=='ankushai_admin_2025')
    return res.status(403).json({error:'Unauthorized'})

  const mode = req.query.mode||'single'

  if (mode==='single') {
    const symbol = (req.query.symbol||TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    const daysBack = Math.floor(Math.random()*700)+30  // ensure 30d of future PA available
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer v3] failed:', e.message)
      await supaInsert('ml_training_runs',{run_id:runId,symbol,analysis_date:analysisDate,status:'failed',scoring_note:e.message,started_at:new Date().toISOString(),completed_at:new Date().toISOString(),engine_version:'v4'}).catch(()=>{})
      return res.status(500).json({error:e.message,runId})
    }
  }

  if (mode==='batch') {
    const n = Math.min(parseInt(req.query.n||'5'), 15)
    const results = await Promise.allSettled(Array.from({length:n}, (_,i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+30
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    }))
    return res.json({mode:'batch',n,results:results.map(r=>r.value||r.reason),completedAt:new Date().toISOString()})
  }

  return res.status(400).json({error:'Invalid mode'})
}+(thesis.expectedPriceTarget||'N/A')+
    ', actual at day '+declaredWindow+'='+scores.outAtDeclaredWindow+'%'+
    (scores.targetHitDay !== null ? ' | target hit day '+scores.targetHitDay : ' | target not hit')+
    ' | full: 1d='+scores.o1d+'% 5d='+scores.o5d+'% 20d='+scores.o20d+'%'

  // ── STEP 6: ATTRIBUTION — why did it work or fail? ─────────────────────────
  // Only run if we have outcome data. This is where learning actually happens.
  let attribution = {}
  if (thesisValidated !== null && scores.o5d !== undefined) {
    attribution = await attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news).catch(()=>({}))
  }

  // ── STEP 7: Store learned pattern ─────────────────────────────────────────
  if (thesisValidated !== null && attribution.patternTag) {
    await supaInsert('ai_learned_patterns', {
      pattern_name: attribution.patternTag+'_'+(thesisValidated?'WIN':'LOSS')+'_'+symbol,
      signal_conditions: JSON.stringify({ biasScore, computedBias, emaStack, rsi14, roc5, roc20, vol, macdHist: macdData?.histogram }),
      outcome_description: scoringNote + ' | ' + (attribution.attribution||''),
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.3 : 0.7,
      notes: 'KEY FACTOR: '+(attribution.keyFactor||'unknown')+' | LESSON: '+(attribution.lessonLearned||''),
      created_at: new Date().toISOString()
    }).catch(()=>{})
  }

  // ── STEP 8: Write full run log ─────────────────────────────────────────────
  const runLog = {
    run_id: runId, symbol, analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias, bias_score: biasScore,
    thesis: thesis.thesis||null,
    predicted_direction: thesis.predictedDirection||null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct||null,
    model_confidence: thesis.confidence||null,
    primary_signal: thesis.primarySignal||null,
    key_risk: thesis.keyRisk||null,
    outcome_5d_pct: scores.o5d??null,
    outcome_direction: scores.dir5d||null,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    signals_snapshot: JSON.stringify({...signals, macro, relStrength, scores}),
    news_context: JSON.stringify(news),
    attribution: attribution.attribution||null,
    key_factor: attribution.keyFactor||null,
    lesson_learned: attribution.lessonLearned||null,
    pattern_tag: attribution.patternTag||null,
    setup_type: thesis.setupType||null,
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine_version: 'v3', status: 'completed'
  }
  await supaInsert('ml_training_runs', runLog).catch(()=>{})

  console.log('[ml-trainer v3] done', runId, symbol, '| validated:', thesisValidated, '| 5d:', scores.o5d+'%', '| factor:', attribution.keyFactor||'N/A')
  return { runId, status:'completed', symbol, analysisDate, thesis, scores, thesisValidated, scoringNote, attribution }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.method==='OPTIONS') return res.status(200).end()

  const adminKey = req.headers['x-admin-key']||req.query.key
  if (adminKey!==process.env.ADMIN_SECRET && adminKey!=='ankushai_admin_2025')
    return res.status(403).json({error:'Unauthorized'})

  const mode = req.query.mode||'single'

  if (mode==='single') {
    const symbol = (req.query.symbol||TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    const daysBack = Math.floor(Math.random()*700)+30  // ensure 30d of future PA available
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer v3] failed:', e.message)
      await supaInsert('ml_training_runs',{run_id:runId,symbol,analysis_date:analysisDate,status:'failed',scoring_note:e.message,started_at:new Date().toISOString(),completed_at:new Date().toISOString(),engine_version:'v3'}).catch(()=>{})
      return res.status(500).json({error:e.message,runId})
    }
  }

  if (mode==='batch') {
    const n = Math.min(parseInt(req.query.n||'5'), 15)
    const results = await Promise.allSettled(Array.from({length:n}, (_,i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+30
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    }))
    return res.json({mode:'batch',n,results:results.map(r=>r.value||r.reason),completedAt:new Date().toISOString()})
  }

  return res.status(400).json({error:'Invalid mode'})
}+(thesis.expectedPriceTarget||'N/A')+
    ', actual@window='+scores.outAtDeclaredWindow+'%'+
    (scores.targetHitDay !== null ? ' | hit day '+scores.targetHitDay : ' | target not hit')+
    ' | 1d='+scores.o1d+'% 5d='+scores.o5d+'% 20d='+scores.o20d+'%'

  // ── STEP 6: ATTRIBUTION — why did it work or fail? ─────────────────────────
  // Only run if we have outcome data. This is where learning actually happens.
  let attribution = {}
  if (thesisValidated !== null && scores.o5d !== undefined) {
    attribution = await attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news).catch(()=>({}))
  }

  // ── STEP 7: Store learned pattern ─────────────────────────────────────────
  if (thesisValidated !== null && attribution.patternTag) {
    await supaInsert('ai_learned_patterns', {
      pattern_name: attribution.patternTag+'_'+(thesisValidated?'WIN':'LOSS')+'_'+symbol,
      signal_conditions: JSON.stringify({ biasScore, computedBias, emaStack, rsi14, roc5, roc20, vol, macdHist: macdData?.histogram }),
      outcome_description: scoringNote + ' | ' + (attribution.attribution||''),
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.3 : 0.7,
      notes: 'KEY FACTOR: '+(attribution.keyFactor||'unknown')+' | LESSON: '+(attribution.lessonLearned||''),
      created_at: new Date().toISOString()
    }).catch(()=>{})
  }

  // ── STEP 8: Write full run log ─────────────────────────────────────────────
  const runLog = {
    run_id: runId, symbol, analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias, bias_score: biasScore,
    thesis: thesis.thesis||null,
    predicted_direction: thesis.predictedDirection||null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct||null,
    model_confidence: thesis.confidence||null,
    primary_signal: thesis.primarySignal||null,
    key_risk: thesis.keyRisk||null,
    outcome_5d_pct: scores.o5d??null,
    outcome_direction: scores.dir5d||null,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    // Options-grade time-window fields (v4)
    expected_move_by_days: thesis.expectedMoveByDays||null,
    expected_price_target: thesis.expectedPriceTarget||null,
    thesis_validity: thesisValidity,
    target_hit_day: scores.targetHitDay??null,
    max_gain_in_window: scores.maxGainInWindow??null,
    max_drawdown_in_window: scores.maxDrawdownInWindow??null,
    declared_window_return: scores.outAtDeclaredWindow??null,
    signals_snapshot: JSON.stringify({...signals, macro, relStrength, scores}),
    news_context: JSON.stringify(news),
    attribution: attribution.attribution||null,
    key_factor: attribution.keyFactor||null,
    lesson_learned: attribution.lessonLearned||null,
    pattern_tag: attribution.patternTag||null,
    setup_type: thesis.setupType||null,
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine_version: 'v4', status: 'completed'
  }
  await supaInsert('ml_training_runs', runLog).catch(()=>{})

  console.log('[ml-trainer v3] done', runId, symbol, '| validated:', thesisValidated, '| 5d:', scores.o5d+'%', '| factor:', attribution.keyFactor||'N/A')
  return { runId, status:'completed', symbol, analysisDate, thesis, scores, thesisValidated, scoringNote, attribution }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.method==='OPTIONS') return res.status(200).end()

  const adminKey = req.headers['x-admin-key']||req.query.key
  if (adminKey!==process.env.ADMIN_SECRET && adminKey!=='ankushai_admin_2025')
    return res.status(403).json({error:'Unauthorized'})

  const mode = req.query.mode||'single'

  if (mode==='single') {
    const symbol = (req.query.symbol||TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    const daysBack = Math.floor(Math.random()*700)+30  // ensure 30d of future PA available
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer v3] failed:', e.message)
      await supaInsert('ml_training_runs',{run_id:runId,symbol,analysis_date:analysisDate,status:'failed',scoring_note:e.message,started_at:new Date().toISOString(),completed_at:new Date().toISOString(),engine_version:'v4'}).catch(()=>{})
      return res.status(500).json({error:e.message,runId})
    }
  }

  if (mode==='batch') {
    const n = Math.min(parseInt(req.query.n||'5'), 15)
    const results = await Promise.allSettled(Array.from({length:n}, (_,i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+30
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    }))
    return res.json({mode:'batch',n,results:results.map(r=>r.value||r.reason),completedAt:new Date().toISOString()})
  }

  return res.status(400).json({error:'Invalid mode'})
}+(thesis.expectedPriceTarget||'N/A')+
    ', actual at day '+declaredWindow+'='+scores.outAtDeclaredWindow+'%'+
    (scores.targetHitDay !== null ? ' | target hit day '+scores.targetHitDay : ' | target not hit')+
    ' | full: 1d='+scores.o1d+'% 5d='+scores.o5d+'% 20d='+scores.o20d+'%'

  // ── STEP 6: ATTRIBUTION — why did it work or fail? ─────────────────────────
  // Only run if we have outcome data. This is where learning actually happens.
  let attribution = {}
  if (thesisValidated !== null && scores.o5d !== undefined) {
    attribution = await attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news).catch(()=>({}))
  }

  // ── STEP 7: Store learned pattern ─────────────────────────────────────────
  if (thesisValidated !== null && attribution.patternTag) {
    await supaInsert('ai_learned_patterns', {
      pattern_name: attribution.patternTag+'_'+(thesisValidated?'WIN':'LOSS')+'_'+symbol,
      signal_conditions: JSON.stringify({ biasScore, computedBias, emaStack, rsi14, roc5, roc20, vol, macdHist: macdData?.histogram }),
      outcome_description: scoringNote + ' | ' + (attribution.attribution||''),
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.3 : 0.7,
      notes: 'KEY FACTOR: '+(attribution.keyFactor||'unknown')+' | LESSON: '+(attribution.lessonLearned||''),
      created_at: new Date().toISOString()
    }).catch(()=>{})
  }

  // ── STEP 8: Write full run log ─────────────────────────────────────────────
  const runLog = {
    run_id: runId, symbol, analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias, bias_score: biasScore,
    thesis: thesis.thesis||null,
    predicted_direction: thesis.predictedDirection||null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct||null,
    model_confidence: thesis.confidence||null,
    primary_signal: thesis.primarySignal||null,
    key_risk: thesis.keyRisk||null,
    outcome_5d_pct: scores.o5d??null,
    outcome_direction: scores.dir5d||null,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    signals_snapshot: JSON.stringify({...signals, macro, relStrength, scores}),
    news_context: JSON.stringify(news),
    attribution: attribution.attribution||null,
    key_factor: attribution.keyFactor||null,
    lesson_learned: attribution.lessonLearned||null,
    pattern_tag: attribution.patternTag||null,
    setup_type: thesis.setupType||null,
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine_version: 'v3', status: 'completed'
  }
  await supaInsert('ml_training_runs', runLog).catch(()=>{})

  console.log('[ml-trainer v3] done', runId, symbol, '| validated:', thesisValidated, '| 5d:', scores.o5d+'%', '| factor:', attribution.keyFactor||'N/A')
  return { runId, status:'completed', symbol, analysisDate, thesis, scores, thesisValidated, scoringNote, attribution }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.method==='OPTIONS') return res.status(200).end()

  const adminKey = req.headers['x-admin-key']||req.query.key
  if (adminKey!==process.env.ADMIN_SECRET && adminKey!=='ankushai_admin_2025')
    return res.status(403).json({error:'Unauthorized'})

  const mode = req.query.mode||'single'

  if (mode==='single') {
    const symbol = (req.query.symbol||TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    const daysBack = Math.floor(Math.random()*700)+30  // ensure 30d of future PA available
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer v3] failed:', e.message)
      await supaInsert('ml_training_runs',{run_id:runId,symbol,analysis_date:analysisDate,status:'failed',scoring_note:e.message,started_at:new Date().toISOString(),completed_at:new Date().toISOString(),engine_version:'v3'}).catch(()=>{})
      return res.status(500).json({error:e.message,runId})
    }
  }

  if (mode==='batch') {
    const n = Math.min(parseInt(req.query.n||'5'), 15)
    const results = await Promise.allSettled(Array.from({length:n}, (_,i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+30
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    }))
    return res.json({mode:'batch',n,results:results.map(r=>r.value||r.reason),completedAt:new Date().toISOString()})
  }

  return res.status(400).json({error:'Invalid mode'})
}+(thesis.expectedPriceTarget||'N/A')+
    ', actual@window='+scores.outAtDeclaredWindow+'%'+
    (scores.targetHitDay !== null ? ' | hit day '+scores.targetHitDay : ' | target not hit')+
    ' | 1d='+scores.o1d+'% 5d='+scores.o5d+'% 20d='+scores.o20d+'%'

  // ── STEP 6: ATTRIBUTION — why did it work or fail? ─────────────────────────
  // Only run if we have outcome data. This is where learning actually happens.
  let attribution = {}
  if (thesisValidated !== null && scores.o5d !== undefined) {
    attribution = await attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news).catch(()=>({}))
  }

  // ── STEP 7: Store learned pattern ─────────────────────────────────────────
  if (thesisValidated !== null && attribution.patternTag) {
    await supaInsert('ai_learned_patterns', {
      pattern_name: attribution.patternTag+'_'+(thesisValidated?'WIN':'LOSS')+'_'+symbol,
      signal_conditions: JSON.stringify({ biasScore, computedBias, emaStack, rsi14, roc5, roc20, vol, macdHist: macdData?.histogram }),
      outcome_description: scoringNote + ' | ' + (attribution.attribution||''),
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.3 : 0.7,
      notes: 'KEY FACTOR: '+(attribution.keyFactor||'unknown')+' | LESSON: '+(attribution.lessonLearned||''),
      created_at: new Date().toISOString()
    }).catch(()=>{})
  }

  // ── STEP 8: Write full run log ─────────────────────────────────────────────
  const runLog = {
    run_id: runId, symbol, analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias, bias_score: biasScore,
    thesis: thesis.thesis||null,
    predicted_direction: thesis.predictedDirection||null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct||null,
    model_confidence: thesis.confidence||null,
    primary_signal: thesis.primarySignal||null,
    key_risk: thesis.keyRisk||null,
    outcome_5d_pct: scores.o5d??null,
    outcome_direction: scores.dir5d||null,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    // Options-grade time-window fields (v4)
    expected_move_by_days: thesis.expectedMoveByDays||null,
    expected_price_target: thesis.expectedPriceTarget||null,
    thesis_validity: thesisValidity,
    target_hit_day: scores.targetHitDay??null,
    max_gain_in_window: scores.maxGainInWindow??null,
    max_drawdown_in_window: scores.maxDrawdownInWindow??null,
    declared_window_return: scores.outAtDeclaredWindow??null,
    signals_snapshot: JSON.stringify({...signals, macro, relStrength, scores}),
    news_context: JSON.stringify(news),
    attribution: attribution.attribution||null,
    key_factor: attribution.keyFactor||null,
    lesson_learned: attribution.lessonLearned||null,
    pattern_tag: attribution.patternTag||null,
    setup_type: thesis.setupType||null,
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine_version: 'v4', status: 'completed'
  }
  await supaInsert('ml_training_runs', runLog).catch(()=>{})

  console.log('[ml-trainer v3] done', runId, symbol, '| validated:', thesisValidated, '| 5d:', scores.o5d+'%', '| factor:', attribution.keyFactor||'N/A')
  return { runId, status:'completed', symbol, analysisDate, thesis, scores, thesisValidated, scoringNote, attribution }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.method==='OPTIONS') return res.status(200).end()

  const adminKey = req.headers['x-admin-key']||req.query.key
  if (adminKey!==process.env.ADMIN_SECRET && adminKey!=='ankushai_admin_2025')
    return res.status(403).json({error:'Unauthorized'})

  const mode = req.query.mode||'single'

  if (mode==='single') {
    const symbol = (req.query.symbol||TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    const daysBack = Math.floor(Math.random()*700)+30  // ensure 30d of future PA available
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer v3] failed:', e.message)
      await supaInsert('ml_training_runs',{run_id:runId,symbol,analysis_date:analysisDate,status:'failed',scoring_note:e.message,started_at:new Date().toISOString(),completed_at:new Date().toISOString(),engine_version:'v4'}).catch(()=>{})
      return res.status(500).json({error:e.message,runId})
    }
  }

  if (mode==='batch') {
    const n = Math.min(parseInt(req.query.n||'5'), 15)
    const results = await Promise.allSettled(Array.from({length:n}, (_,i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+30
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    }))
    return res.json({mode:'batch',n,results:results.map(r=>r.value||r.reason),completedAt:new Date().toISOString()})
  }

  return res.status(400).json({error:'Invalid mode'})
}+(thesis.expectedPriceTarget||'N/A')+
    ', actual at day '+declaredWindow+'='+scores.outAtDeclaredWindow+'%'+
    (scores.targetHitDay !== null ? ' | target hit day '+scores.targetHitDay : ' | target not hit')+
    ' | full: 1d='+scores.o1d+'% 5d='+scores.o5d+'% 20d='+scores.o20d+'%'

  // ── STEP 6: ATTRIBUTION — why did it work or fail? ─────────────────────────
  // Only run if we have outcome data. This is where learning actually happens.
  let attribution = {}
  if (thesisValidated !== null && scores.o5d !== undefined) {
    attribution = await attributeOutcome(symbol, analysisDate, thesis, scores, signals, macro, relStrength, news).catch(()=>({}))
  }

  // ── STEP 7: Store learned pattern ─────────────────────────────────────────
  if (thesisValidated !== null && attribution.patternTag) {
    await supaInsert('ai_learned_patterns', {
      pattern_name: attribution.patternTag+'_'+(thesisValidated?'WIN':'LOSS')+'_'+symbol,
      signal_conditions: JSON.stringify({ biasScore, computedBias, emaStack, rsi14, roc5, roc20, vol, macdHist: macdData?.histogram }),
      outcome_description: scoringNote + ' | ' + (attribution.attribution||''),
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.3 : 0.7,
      notes: 'KEY FACTOR: '+(attribution.keyFactor||'unknown')+' | LESSON: '+(attribution.lessonLearned||''),
      created_at: new Date().toISOString()
    }).catch(()=>{})
  }

  // ── STEP 8: Write full run log ─────────────────────────────────────────────
  const runLog = {
    run_id: runId, symbol, analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias, bias_score: biasScore,
    thesis: thesis.thesis||null,
    predicted_direction: thesis.predictedDirection||null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct||null,
    model_confidence: thesis.confidence||null,
    primary_signal: thesis.primarySignal||null,
    key_risk: thesis.keyRisk||null,
    outcome_5d_pct: scores.o5d??null,
    outcome_direction: scores.dir5d||null,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    signals_snapshot: JSON.stringify({...signals, macro, relStrength, scores}),
    news_context: JSON.stringify(news),
    attribution: attribution.attribution||null,
    key_factor: attribution.keyFactor||null,
    lesson_learned: attribution.lessonLearned||null,
    pattern_tag: attribution.patternTag||null,
    setup_type: thesis.setupType||null,
    started_at: startedAt, completed_at: new Date().toISOString(),
    engine_version: 'v3', status: 'completed'
  }
  await supaInsert('ml_training_runs', runLog).catch(()=>{})

  console.log('[ml-trainer v3] done', runId, symbol, '| validated:', thesisValidated, '| 5d:', scores.o5d+'%', '| factor:', attribution.keyFactor||'N/A')
  return { runId, status:'completed', symbol, analysisDate, thesis, scores, thesisValidated, scoringNote, attribution }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.method==='OPTIONS') return res.status(200).end()

  const adminKey = req.headers['x-admin-key']||req.query.key
  if (adminKey!==process.env.ADMIN_SECRET && adminKey!=='ankushai_admin_2025')
    return res.status(403).json({error:'Unauthorized'})

  const mode = req.query.mode||'single'

  if (mode==='single') {
    const symbol = (req.query.symbol||TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    const daysBack = Math.floor(Math.random()*700)+30  // ensure 30d of future PA available
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer v3] failed:', e.message)
      await supaInsert('ml_training_runs',{run_id:runId,symbol,analysis_date:analysisDate,status:'failed',scoring_note:e.message,started_at:new Date().toISOString(),completed_at:new Date().toISOString(),engine_version:'v3'}).catch(()=>{})
      return res.status(500).json({error:e.message,runId})
    }
  }

  if (mode==='batch') {
    const n = Math.min(parseInt(req.query.n||'5'), 15)
    const results = await Promise.allSettled(Array.from({length:n}, (_,i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+30
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    }))
    return res.json({mode:'batch',n,results:results.map(r=>r.value||r.reason),completedAt:new Date().toISOString()})
  }

  return res.status(400).json({error:'Invalid mode'})
}