// analysis.js v8 — REAL PRICES, direct data source (no self-call)
// Fetches prices directly from Polygon/Yahoo — not through /api/market
// This avoids the Vercel serverless-to-serverless self-call failure
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const POLYGON_KEY = process.env.POLYGON_API_KEY

const UNIVERSE = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','AMD','ORCL',
  'JPM','GS','V','MA','XOM','LLY','UNH','PLTR','NET','CRWD','COIN',
  'SPY','QQQ','IWM','XLK','XLE','XLF','GLD','TLT',
  'MU','INTC','QCOM','MRNA','GILD','ABBV','COST','WMT','HD','NKE','ARM']

function isMarketHours() {
  const et = new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}))
  const m = et.getHours()*60+et.getMinutes(), d = et.getDay()
  return d>=1&&d<=5&&m>=570&&m<960
}

async function getCache() {
  try {
    const {data,error} = await supabase.from('scan_cache').select('scan_data,created_at').order('created_at',{ascending:false}).limit(1).single()
    if(error||!data) return null
    const age = Date.now()-new Date(data.created_at).getTime()
    if(age < (isMarketHours()?15*60000:60*60000)) return {...data.scan_data,cached:true,cacheAge:Math.round(age/60000)}
    return null
  } catch(e){return null}
}

async function saveCache(result) {
  try { await supabase.from('scan_cache').insert({scan_data:result,setup_count:result.setups?.length||0,market_mood:result.marketContext?.mood,vix:result.marketContext?.vix,spy_change:result.marketContext?.spyChange}) } catch(e){}
}

async function recordSetups(setups) {
  if(!setups?.length) return
  try {
    await supabase.from('setup_records').insert(setups.slice(0,12).map(s=>({
      symbol:s.symbol, setup_type:s.setupType||'AI', bias:s.bias,
      entry_high:s.entryHigh||null, entry_low:s.entryLow||null,
      stop_loss:s.stopLoss||null, target_1:s.target1||null,
      confidence:s.confidence||7, frameworks:s.frameworks||[],
      rr_ratio:s.rrRatio||null, scan_date:new Date().toISOString().split('T')[0]
    })))
  } catch(e){}
}

// Fetch real prices DIRECTLY from Polygon (no self-call)
async function fetchRealPrices(symbols) {
  const prices = {}
  try {
    if (!POLYGON_KEY) throw new Error('No POLYGON_API_KEY')
    // Polygon snapshot endpoint — gets all tickers in one call
    const tickers = symbols.join(',')
    const r = await fetch(
      'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers='+tickers+'&apiKey='+POLYGON_KEY,
      {signal: AbortSignal.timeout(12000)}
    )
    const data = await r.json()
    if (data.tickers) {
      data.tickers.forEach(t => {
        const price = t.day?.c || t.prevDay?.c || t.lastTrade?.p
        if (price > 0) {
          prices[t.ticker] = {
            symbol: t.ticker,
            price: price,
            changePercent: t.todaysChangePerc || 0,
            volume: t.day?.v || t.prevDay?.v || 0,
            high: t.day?.h || t.prevDay?.h || price,
            low: t.day?.l || t.prevDay?.l || price,
            source: 'polygon'
          }
        }
      })
    }
    console.log('[analysis] Polygon prices fetched:', Object.keys(prices).length)
  } catch(e) {
    console.warn('[analysis] Polygon fetch failed:', e.message, '— trying Yahoo fallback')
    // Yahoo Finance fallback for key symbols
    try {
      const keySymbols = ['SPY','QQQ','NVDA','AAPL','MSFT','META','GOOGL','AMZN','TSLA','AMD']
      await Promise.all(keySymbols.map(async sym => {
        try {
          const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/'+sym+'?interval=1d&range=1d',{signal:AbortSignal.timeout(5000)})
          const d = await r.json()
          const q = d.chart?.result?.[0]
          if (q) {
            const price = q.meta?.regularMarketPrice || q.meta?.previousClose
            const prevClose = q.meta?.previousClose || price
            if (price > 0) prices[sym] = {symbol:sym, price, changePercent:prevClose?((price-prevClose)/prevClose*100):0, source:'yahoo'}
          }
        } catch(e2) {}
      }))
      console.log('[analysis] Yahoo fallback prices:', Object.keys(prices).length)
    } catch(e2) {}
  }
  return prices
}

async function getMarketContext(prices) {
  // Derive context from real prices we already have
  const spy = prices['SPY']
  const vix_approx = 20 // fallback if no VIX data
  try {
    // Try to get VIX from Yahoo
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d',{signal:AbortSignal.timeout(5000)})
    const d = await r.json()
    const vixPrice = d.chart?.result?.[0]?.meta?.regularMarketPrice || vix_approx
    const mood = vixPrice > 30 ? 'Fear' : vixPrice > 20 ? 'Caution' : vixPrice > 15 ? 'Neutral' : 'Greed'
    const regime = vixPrice > 25 ? 'risk_off' : 'neutral'
    return {spy: spy?.price||0, spyChange: spy?.changePercent||0, vix: vixPrice, mood, regime}
  } catch(e) {
    return {spy:spy?.price||0, spyChange:spy?.changePercent||0, vix:vix_approx, mood:'Unknown', regime:'neutral'}
  }
}

async function getPatterns() {
  try {
    const {data} = await supabase.from('ai_learned_patterns').select('pattern_name,works_best_when,fails_when,prompt_weight').order('prompt_weight',{ascending:false}).limit(6)
    return data||[]
  } catch(e){return[]}
}

function validateSetups(setups, prices) {
  const valid=[], rejected=[]
  for (const s of setups) {
    const real = prices[s.symbol]
    if (!real?.price) { rejected.push({symbol:s.symbol,reason:'no price data'}); continue }
    const entry = s.entryHigh && s.entryLow ? (s.entryHigh+s.entryLow)/2 : s.entryHigh||s.entryLow
    if (entry) {
      const dev = Math.abs(entry-real.price)/real.price
      if (dev > 0.15) { rejected.push({symbol:s.symbol,reason:'entry '+entry.toFixed(2)+' vs real '+real.price.toFixed(2)+' ('+( dev*100).toFixed(1)+'% off)'}); continue }
    }
    valid.push({...s, currentPrice:real.price, priceChange:real.changePercent||0, priceVerified:true})
  }
  if (rejected.length) console.warn('[analysis] REJECTED',rejected.length,'setups:',JSON.stringify(rejected))
  console.log('[analysis] VALIDATED',valid.length,'/',setups.length,'setups')
  return valid
}

async function runScan() {
  const cached = await getCache()
  if (cached) { console.log('[analysis] cache hit age:',cached.cacheAge,'min'); return cached }

  console.log('[analysis] cache miss — fetching real prices directly from Polygon')
  const [prices, patterns] = await Promise.all([fetchRealPrices(UNIVERSE), getPatterns()])
  const priceCount = Object.keys(prices).length
  console.log('[analysis]',priceCount,'real prices fetched')

  if (priceCount < 5) {
    console.error('[analysis] Too few prices:',priceCount)
    return {setups:[],error:'Could not fetch real market data ('+priceCount+' prices)',priceCount}
  }

  const marketContext = await getMarketContext(prices)
  const patternCtx = patterns.length>0 ? '\nPATTERNS: '+patterns.map(p=>p.pattern_name+'[w:'+p.prompt_weight+']').join(', ') : ''

  const priceTable = UNIVERSE.filter(s=>prices[s]).map(s=>{
    const q=prices[s]; const chg=q.changePercent!=null?(q.changePercent>=0?'+':'')+q.changePercent.toFixed(2)+'%':'N/A'
    return s+'=$'+q.price.toFixed(2)+'('+chg+')'
  }).join(' | ')

  const prompt = `You are AnkushAI, institutional options trading intelligence.

CRITICAL: Use ONLY the exact real prices below. Do NOT use memory or training data for prices.

LIVE PRICES: ${priceTable}

MARKET: SPY=${(marketContext.spy||0).toFixed(2)}(${(marketContext.spyChange||0)>=0?'+':''}${(marketContext.spyChange||0).toFixed(2)}%) VIX=${marketContext.vix?.toFixed(1)} ${marketContext.mood} Regime:${marketContext.regime}${patternCtx}

Select 6-10 symbols with HIGH-CONVICTION setups. Rules:
- entryLow/entryHigh: within 2% of the real price shown above
- stopLoss: 3-8% from real price
- target1: 8-15% move from real price  
- target2: 15-25% move
- R/R must be ≥2:1 using real prices
- VIX>${marketContext.vix>25?'25: prefer spreads/defined-risk':'20: directional ok'}

Return ONLY JSON array:
[{"symbol":"NVDA","setupType":"EMA Breakout","bias":"bullish","confidence":8,"entryLow":170.00,"entryHigh":174.00,"stopLoss":164.00,"target1":185.00,"target2":195.00,"rrRatio":2.8,"ivRank":45,"recommendedTrade":"Buy May 175 calls ~$4.20","frameworks":["ema_breakout","momentum"],"analysis":"NVDA at $172.70, EMA20 holding...","urgency":"today"}]`

  const msg = await anthropic.messages.create({model:'claude-sonnet-4-20250514',max_tokens:4000,messages:[{role:'user',content:prompt}]})
  let raw=[]
  const text=msg.content[0]?.text||'[]'
  try{const c=text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();const p=JSON.parse(c);raw=Array.isArray(p)?p:(p.setups||[])}
  catch(e){const m=text.match(/\[[\s\S]*\]/);if(m)try{raw=JSON.parse(m[0])}catch(e2){}}

  const setups = validateSetups(raw, prices)
  const result = {setups,marketContext,pricesUsed:priceCount,patterns:patterns.length,generatedAt:new Date().toISOString(),cached:false,rejected:raw.length-setups.length}
  Promise.all([saveCache(result),recordSetups(setups)]).catch(e=>console.warn('[analysis] save:',e.message))
  return result
}

async function analyzeSingle(symbol) {
  const prices = await fetchRealPrices([symbol])
  const realPrice = prices[symbol]?.price
  const priceCtx = realPrice ? 'REAL PRICE: '+symbol+'=$'+realPrice.toFixed(2)+'. ALL levels from this price.' : 'Could not fetch real price — do NOT invent prices.'
  const msg = await anthropic.messages.create({model:'claude-sonnet-4-20250514',max_tokens:1200,messages:[{role:'user',content:priceCtx+'\n\nAnalyze '+symbol+' for a trade now. Entry within 2% of real price, stop 3-8% away, two targets, R/R, options play with strike/expiry.'}]})
  return {symbol,currentPrice:realPrice,analysis:msg.content[0]?.text,generatedAt:new Date().toISOString()}
}

export default async function handler(req,res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Cache-Control','s-maxage=60,stale-while-revalidate=300')
  if(req.method==='OPTIONS') return res.status(200).end()
  const type=(req.query.type||req.query.action||'scan').toLowerCase()
  const symbol=req.query.symbol?.toUpperCase()
  try {
    if(type==='scan') return res.json(await runScan())
    if(type==='single'&&symbol) return res.json(await analyzeSingle(symbol))
    if(type==='cache_status'){const c=await getCache();return res.json({hasCachedScan:!!c,cacheAge:c?.cacheAge,setupCount:c?.setups?.length||0})}
    return res.status(400).json({error:'Use: scan, single, cache_status'})
  } catch(e){console.error('[analysis]',e.message);return res.status(500).json({error:e.message})}
}
