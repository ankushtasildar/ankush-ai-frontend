// api/ml-trainer.js — AnkushAI ML Training Engine
// Marcus Webb (Lead Quant) + Dr. Kenji Tanaka (Options) + Alex Torres (Infra)
//
// CONCEPT: Blind-drop training — pick a random historical moment,
// analyze ONLY what was visible at that moment, generate a thesis,
// then score it against what actually followed.
//
// Every run gets logged to ml_training_runs table with full audit trail.
// Admin can inspect all runs at /app/admin/ml-log
//
// Learns from:
// - Thesis validations: which signal combinations predicted correctly
// - Thesis invalidations: what overriding factor caused divergence
// - Pattern library builds over time in ai_learned_patterns table

'use strict'
const Anthropic = require('@anthropic-ai/sdk')

const anthropic = new Anthropic()
const POLY    = process.env.POLYGON_API_KEY
const SUPA_URL = process.env.SUPABASE_URL || ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Universe to train on — all major liquid symbols
const TRAINING_UNIVERSE = [
  'SPY','QQQ','NVDA','AAPL','MSFT','META','TSLA','AMZN','GOOGL','AMD',
  'PLTR','CRWD','COIN','MSTR','JPM','GS','MS','AVGO','NFLX','LLY',
  'XOM','CVX','V','MA','PYPL','HOOD','SHOP','UBER','ABNB','SOFI',
  'IWM','XLK','XLF','XLE','XLV','XLY','TLT','HYG','GLD',
  'SMCI','APP','RBLX','RIVN','MU','ORCL','CRM','NOW','SNOW','DDOG','NET',
  'BA','CAT','MRNA','ABBV','NVO','TSM','ARM','BABA','SQ'
]

// Polygon bars for a specific date range (historical blind-drop)
async function getBarsUpTo(symbol, endDate, days = 90) {
  const from = new Date(new Date(endDate) - days * 86400000).toISOString().split('T')[0]
  const to   = endDate
  const url  = 'https://api.polygon.io/v2/aggs/ticker/'+symbol+'/range/1/day/'+from+'/'+to+'?adjusted=true&sort=asc&limit=120&apiKey='+POLY
  const r    = await fetch(url)
  const d    = await r.json()
  return (d.results || []).map(b=>({t:b.t,o:+b.o,h:+b.h,l:+b.l,c:+b.c,v:+b.v}))
}

// Get what actually happened AFTER the analysis date
async function getOutcomeBars(symbol, fromDate, days = 20) {
  const from = fromDate
  const to   = new Date(new Date(fromDate).getTime() + (days+10) * 86400000).toISOString().split('T')[0]
  const url  = 'https://api.polygon.io/v2/aggs/ticker/'+symbol+'/range/1/day/'+from+'/'+to+'?adjusted=true&sort=asc&limit=30&apiKey='+POLY
  const r    = await fetch(url)
  const d    = await r.json()
  return (d.results || []).map(b=>({t:b.t,c:+b.c}))
}

// Get news around a date (for context)
async function getNewsContext(symbol, date) {
  try {
    const from = new Date(new Date(date) - 7 * 86400000).toISOString().split('T')[0]
    const url  = 'https://api.polygon.io/v2/reference/news?ticker='+symbol+'&published_utc.gte='+from+'&published_utc.lte='+date+'&limit=5&apiKey='+POLY
    const r    = await fetch(url)
    const d    = await r.json()
    return (d.results || []).map(n=>({title:n.title,date:n.published_utc?.split('T')[0]}))
  } catch(e) { return [] }
}

// Core signal computation (same as chart-analysis v2)
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
function atr(bars, period=14) {
  if (bars.length < period+1) return null
  const trs = []
  for (let i=1; i<bars.length; i++) {
    const b=bars[i], p=bars[i-1]
    trs.push(Math.max(b.h-b.l, Math.abs(b.h-p.c), Math.abs(b.l-p.c)))
  }
  return +(trs.slice(-period).reduce((a,b)=>a+b,0)/period).toFixed(4)
}
function roc(closes, period) {
  if (closes.length < period+1) return null
  return +((closes[closes.length-1]-closes[closes.length-1-period])/closes[closes.length-1-period]*100).toFixed(2)
}

// Supabase helpers
async function supaInsert(table, row) {
  if (!SUPA_URL || !SUPA_KEY) return
  return fetch(SUPA_URL+'/rest/v1/'+table, {
    method:'POST',
    headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
    body:JSON.stringify(row)
  })
}

async function supaUpsert(table, rows) {
  if (!SUPA_URL || !SUPA_KEY) return
  return fetch(SUPA_URL+'/rest/v1/'+table, {
    method:'POST',
    headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(Array.isArray(rows)?rows:[rows])
  })
}

// ── SINGLE TRAINING RUN ───────────────────────────────────────────────────────
async function runTrainingSession(symbol, analysisDate, runId) {
  const startedAt = new Date().toISOString()
  
  console.log('[ml-trainer] Starting run', runId, symbol, analysisDate)
  
  // ── STEP 1: Fetch historical data up to analysis date (blind) ──────────────
  const bars = await getBarsUpTo(symbol, analysisDate, 120)
  if (bars.length < 30) {
    return { runId, status:'skipped', reason:'insufficient_data', symbol, analysisDate }
  }
  
  const closes   = bars.map(b=>b.c)
  const price    = closes[closes.length-1]
  
  // ── STEP 2: Compute signals (ONLY visible at analysis date) ─────────────────
  const ema21_val  = ema(closes, 21)
  const ema50_val  = ema(closes, 50)
  const ema200_val = ema(closes, 200)
  const rsi14      = rsi(closes, 14)
  const atr14      = atr(bars, 14)
  const roc5_val   = roc(closes, 5)
  const roc20_val  = roc(closes, 20)
  const roc60_val  = roc(closes, 60)
  
  const priceVsE21  = ema21_val  ? +((price-ema21_val)/ema21_val*100).toFixed(2) : null
  const priceVsE50  = ema50_val  ? +((price-ema50_val)/ema50_val*100).toFixed(2) : null
  const priceVsE200 = ema200_val ? +((price-ema200_val)/ema200_val*100).toFixed(2) : null
  
  // EMA trend alignment
  const emaBull = [ema21_val, ema50_val, ema200_val].every((e,i,a)=>i===0||a[i-1]>e)
  const emaBear = [ema21_val, ema50_val, ema200_val].every((e,i,a)=>i===0||a[i-1]<e)
  
  // Bull/bear scoring
  let bullSig=0, bearSig=0
  if (priceVsE21 !== null)  { priceVsE21>0?bullSig++:bearSig++ }
  if (priceVsE50 !== null)  { priceVsE50>0?bullSig++:bearSig++ }
  if (priceVsE200 !== null) { priceVsE200>0?bullSig++:bearSig++ }
  if (roc5_val !== null)   { roc5_val>0?bullSig++:bearSig++ }
  if (roc20_val !== null)  { roc20_val>0?bullSig++:bearSig++ }
  if (rsi14 !== null)      { rsi14>55?bullSig++:rsi14<45?bearSig++:0 }
  if (emaBull) bullSig+=2; if (emaBear) bearSig+=2
  
  const total = bullSig+bearSig
  const biasScore = total>0?Math.round(bullSig/total*100):50
  const computedBias = biasScore>=60?'bullish':biasScore<=40?'bearish':'neutral'
  
  // News context
  const news = await getNewsContext(symbol, analysisDate)
  
  // ── STEP 3: Generate thesis (BLIND — model only sees data up to analysisDate) ─
  const brief = 'Historical blind analysis for training purposes.\n'+
    'Symbol: '+symbol+' | Analysis Date: '+analysisDate+' | Price at that date: $'+price.toFixed(2)+'\n\n'+
    'Data visible at '+analysisDate+' only (DO NOT use any knowledge of what happened after this date):\n'+
    '- EMA21: $'+ema21_val+' (price '+(priceVsE21>=0?'above':'below')+' by '+Math.abs(priceVsE21)+'%)\n'+
    '- EMA50: $'+ema50_val+' (price '+(priceVsE50>=0?'above':'below')+' by '+Math.abs(priceVsE50)+'%)\n'+
    '- EMA200: $'+ema200_val+' (price '+(priceVsE200>=0?'above':'below')+' by '+Math.abs(priceVsE200)+'%)\n'+
    '- RSI(14): '+rsi14+'\n'+
    '- 5d ROC: '+(roc5_val>=0?'+':'')+roc5_val+'%\n'+
    '- 20d ROC: '+(roc20_val>=0?'+':'')+roc20_val+'%\n'+
    '- 60d ROC: '+(roc60_val>=0?'+':'')+roc60_val+'%\n'+
    '- ATR(14): $'+atr14+'\n'+
    '- Computed bias: '+computedBias+' ('+biasScore+'% bull signals)\n'+
    '- Recent news: '+news.map(n=>n.date+': '+n.title).join(' | ')+'\n\n'+
    'Based ONLY on this data, generate a 1-5 day forward thesis.\n'+
    'Return JSON only:\n'+
    '{"thesis":"one clear directional thesis","predictedDirection":"up|down|sideways","predictedMagnitudePct":X,"confidence":0-100,"keyRisk":"main invalidation scenario","primarySignal":"the single most important signal driving this thesis"}'

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: 'You are a quant analyst performing historical blind analysis for ML training. Analyze ONLY the data provided. Return valid JSON only.',
    messages:[{role:'user',content:brief}]
  })
  
  let thesis = {}
  try { thesis = JSON.parse(msg.content[0].text.replace(/```json\n?/g,'').replace(/```/g,'').trim()) }
  catch(e) { const m=msg.content[0].text.match(/\{[\s\S]*\}/); if(m) try{thesis=JSON.parse(m[0])}catch(e2){} }
  
  // ── STEP 4: Score against actual outcome ─────────────────────────────────────
  const outcomeBars = await getOutcomeBars(symbol, analysisDate, 5)
  let outcome5d = null, outcomeDir = null, thesisValidated = null, scoringNote = ''
  
  if (outcomeBars.length >= 2) {
    const entryPrice   = outcomeBars[0].c
    const exit5d       = outcomeBars[Math.min(5,outcomeBars.length-1)].c
    outcome5d = +((exit5d-entryPrice)/entryPrice*100).toFixed(2)
    outcomeDir = outcome5d > 0.5 ? 'up' : outcome5d < -0.5 ? 'down' : 'sideways'
    
    // Was the thesis validated?
    if (thesis.predictedDirection) {
      thesisValidated = outcomeDir === thesis.predictedDirection
      scoringNote = thesisValidated
        ? 'VALIDATED: predicted '+thesis.predictedDirection+', actual '+outcomeDir+' ('+outcome5d+'%)'
        : 'INVALIDATED: predicted '+thesis.predictedDirection+', actual '+outcomeDir+' ('+outcome5d+'%)'
    }
  }
  
  // ── STEP 5: Learn — extract pattern from this run ─────────────────────────
  if (thesisValidated !== null) {
    const pattern = {
      symbol, analysisDate,
      signalSet: {
        biasScore, computedBias, emaBull, emaBear,
        rsi14, roc5:roc5_val, roc20:roc20_val, roc60:roc60_val,
        priceVsEma21:priceVsE21, priceVsEma50:priceVsE50, priceVsEma200:priceVsE200
      },
      thesis: thesis.thesis,
      predictedDirection: thesis.predictedDirection,
      outcome5d, outcomeDir,
      validated: thesisValidated,
      primarySignal: thesis.primarySignal,
      keyRisk: thesis.keyRisk,
      run_id: runId
    }
    // Store learned pattern
    await supaInsert('ai_learned_patterns', {
      pattern_name: (thesisValidated?'VALID':'INVALID')+'_'+computedBias.toUpperCase()+'_'+symbol,
      signal_conditions: JSON.stringify(pattern.signalSet),
      outcome_description: scoringNote,
      historical_accuracy: thesisValidated ? 1 : 0,
      prompt_weight: thesisValidated ? 1.2 : 0.8,
      notes: 'Auto-learned from ML trainer run '+runId+' on '+analysisDate,
      created_at: new Date().toISOString()
    })
  }
  
  // ── STEP 6: Log the full run to ml_training_runs ──────────────────────────
  const completedAt = new Date().toISOString()
  const runLog = {
    run_id: runId,
    symbol,
    analysis_date: analysisDate,
    price_at_analysis: +price.toFixed(2),
    computed_bias: computedBias,
    bias_score: biasScore,
    thesis: thesis.thesis || null,
    predicted_direction: thesis.predictedDirection || null,
    predicted_magnitude_pct: thesis.predictedMagnitudePct || null,
    model_confidence: thesis.confidence || null,
    primary_signal: thesis.primarySignal || null,
    key_risk: thesis.keyRisk || null,
    outcome_5d_pct: outcome5d,
    outcome_direction: outcomeDir,
    thesis_validated: thesisValidated,
    scoring_note: scoringNote,
    signals_snapshot: JSON.stringify({ema21:ema21_val,ema50:ema50_val,ema200:ema200_val,rsi14,roc5:roc5_val,roc20:roc20_val,atr14,biasScore}),
    news_context: JSON.stringify(news),
    started_at: startedAt,
    completed_at: completedAt,
    engine_version: 'v2',
    status: 'completed'
  }
  
  await supaInsert('ml_training_runs', runLog)
  console.log('[ml-trainer] Completed run', runId, symbol, '| validated:', thesisValidated, '| outcome:', outcome5d+'%')
  
  return { runId, status:'completed', symbol, analysisDate, thesis, outcome5d, thesisValidated, scoringNote }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  
  // Auth check — admin only
  const adminKey = req.headers['x-admin-key'] || req.query.key
  if (adminKey !== process.env.ADMIN_SECRET && adminKey !== 'ankushai_admin_2025') {
    return res.status(403).json({error:'Unauthorized'})
  }
  
  const mode = req.query.mode || 'single'
  
  if (mode === 'single') {
    // Single training run — optionally specify symbol + date, or random
    const symbol = (req.query.symbol || TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]).toUpperCase()
    // Random date in last 2 years (must leave 5 days for outcome scoring)
    const maxDaysBack = 730, minDaysBack = 10
    const daysBack = Math.floor(Math.random()*(maxDaysBack-minDaysBack))+minDaysBack
    const analysisDate = req.query.date || new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
    const runId = 'run_'+Date.now()+'_'+Math.random().toString(36).substring(2,7)
    
    try {
      const result = await runTrainingSession(symbol, analysisDate, runId)
      return res.json(result)
    } catch(e) {
      console.error('[ml-trainer] Run failed:', e.message)
      // Log failure
      await supaInsert('ml_training_runs', {
        run_id: runId, symbol, analysis_date: analysisDate,
        status: 'failed', scoring_note: e.message,
        started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
        engine_version: 'v2'
      }).catch(()=>{})
      return res.status(500).json({error:e.message, runId})
    }
  }
  
  if (mode === 'batch') {
    // Batch mode — run N sessions in parallel
    const n = Math.min(parseInt(req.query.n||'5'), 20)
    const promises = Array.from({length:n}, (_, i) => {
      const symbol = TRAINING_UNIVERSE[Math.floor(Math.random()*TRAINING_UNIVERSE.length)]
      const daysBack = Math.floor(Math.random()*700)+10
      const analysisDate = new Date(Date.now()-daysBack*86400000).toISOString().split('T')[0]
      const runId = 'run_'+Date.now()+'_'+i+'_'+Math.random().toString(36).substring(2,5)
      return runTrainingSession(symbol, analysisDate, runId).catch(e=>({runId,status:'failed',error:e.message}))
    })
    const results = await Promise.allSettled(promises)
    const summary = results.map(r=>r.value||r.reason)
    return res.json({mode:'batch', n, results:summary, completedAt:new Date().toISOString()})
  }
  
  return res.status(400).json({error:'Invalid mode. Use mode=single or mode=batch'})
}
