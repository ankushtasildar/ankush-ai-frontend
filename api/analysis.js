// analysis.js v9 — Polygon grouped daily + last trade fallback, no self-call
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const POLYGON_KEY = process.env.POLYGON_API_KEY

const UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','AMD','ORCL',
  'JPM','GS','V','MA','XOM','LLY','UNH','PLTR','NET','CRWD','COIN',
  'SPY','QQQ','IWM','XLK','XLE','XLF','GLD','TLT',
  'MU','INTC','QCOM','MRNA','GILD','ABBV','COST','WMT','HD','NKE','ARM'
]

function isMarketHours() {
  const et = new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}))
  const m = et.getHours()*60+et.getMinutes(), d = et.getDay()
  return d>=1&&d<=5&&m>=570&&m<960
}

async function getCache() {
  try {
    const {data} = await supabase.from('scan_cache').select('scan_data,created_at').order('created_at',{ascending:false}).limit(1).single()
    if (!data) return null
    const age = Date.now()-new Date(data.created_at).getTime()
    if (age < (isMarketHours()?15*60000:60*60000)) return {...data.scan_data,cached:true,cacheAge:Math.round(age/60000)}
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
      symbol:s.symbol,setup_type:s.setupType||'AI',bias:s.bias,
      entry_high:s.entryHigh||null,entry_low:s.entryLow||null,
      stop_loss:s.stopLoss||null,target_1:s.target1||null,
      confidence:s.confidence||7,frameworks:s.frameworks||[],
      rr_ratio:s.rrRatio||null,scan_date:new Date().toISOString().split('T')[0]
    })))
  } catch(e){}
}

// Get date string for N days ago (skip weekends)
function tradingDate(daysBack=0) {
  const d = new Date()
  d.setDate(d.getDate()-daysBack)
  // If Saturday (6) go back 1 more, if Sunday (0) go back 2 more
  if (d.getDay()===6) d.setDate(d.getDate()-1)
  if (d.getDay()===0) d.setDate(d.getDate()-2)
  return d.toISOString().split('T')[0]
}

async function fetchRealPrices(symbols) {
  const prices = {}
  if (!POLYGON_KEY) { console.error('[v9] No POLYGON_API_KEY'); return prices }

  // Try Polygon grouped daily for last 3 trading dates
  for (const daysBack of [0,1,2,3,4]) {
    const date = tradingDate(daysBack)
    try {
      const r = await fetch(
        `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${POLYGON_KEY}`,
        {signal:AbortSignal.timeout(12000)}
      )
      const data = await r.json()
      if (data.resultsCount > 0 && data.results?.length > 0) {
        data.results.forEach(t => {
          if (symbols.includes(t.T) && t.c > 0) {
            prices[t.T] = {symbol:t.T, price:t.c, changePercent:t.o>0?((t.c-t.o)/t.o*100):0, volume:t.v||0, high:t.h||t.c, low:t.l||t.c, open:t.o||t.c, source:'polygon-'+date}
          }
        })
        const found = Object.keys(prices).length
        console.log(`[v9] Polygon grouped ${date}: ${found} prices`)
        if (found >= 10) break
      }
    } catch(e) { console.warn('[v9] grouped',date,'failed:',e.message) }
  }

  // Fill any missing with individual Polygon prev-close
  const missing = symbols.filter(s => !prices[s])
  if (missing.length && POLYGON_KEY) {
    await Promise.all(missing.slice(0,20).map(async sym => {
      try {
        const r = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${POLYGON_KEY}`,
          {signal:AbortSignal.timeout(5000)}
        )
        const d = await r.json()
        const res = d.results?.[0]
        if (res?.c > 0) prices[sym] = {symbol:sym, price:res.c, changePercent:res.o>0?((res.c-res.o)/res.o*100):0, volume:res.v||0, source:'polygon-prev'}
      } catch(e2) {}
    }))
    console.log('[v9] After prev-close fill:', Object.keys(prices).length)
  }
  return prices
}

async function getMarketContext(prices) {
  const spy = prices['SPY']
  let vix = 20, mood = 'Unknown', regime = 'neutral'
  try {
    const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/VXX/prev?adjusted=true&apiKey=${POLYGON_KEY}`,{signal:AbortSignal.timeout(5000)})
    const d = await r.json()
    vix = d.results?.[0]?.c || 20
    mood = vix>30?'Fear':vix>20?'Caution':vix>15?'Neutral':'Greed'
    regime = vix>25?'risk_off':'neutral'
  } catch(e) {
    // Use a reasonable default
    vix = 25; mood = 'Caution'; regime = 'neutral'
  }
  return {spy:spy?.price||0, spyChange:spy?.changePercent||0, vix, mood, regime}
}

async function getPatterns() {
  try {
    const {data} = await supabase.from('ai_learned_patterns').select('pattern_name,prompt_weight').order('prompt_weight',{ascending:false}).limit(6)
    return data||[]
  } catch(e){return[]}
}

function validateSetups(setups, prices) {
  const valid=[], rejected=[]
  for (const s of setups) {
    const real = prices[s.symbol]
    if (!real?.price) { rejected.push({sym:s.symbol,reason:'no price'}); continue }
    const entry = s.entryHigh&&s.entryLow?(s.entryHigh+s.entryLow)/2:s.entryHigh||s.entryLow
    if (entry) {
      const dev = Math.abs(entry-real.price)/real.price
      if (dev>0.15) { rejected.push({sym:s.symbol,reason:entry.toFixed(2)+'vs real '+real.price.toFixed(2)+'('+( dev*100).toFixed(1)+'%)'}); continue }
    }
    valid.push({...s, currentPrice:real.price, priceChange:real.changePercent||0, priceVerified:true})
  }
  if (rejected.length) console.warn('[v9] REJECTED',rejected.length,'setups:',JSON.stringify(rejected))
  console.log('[v9] VALIDATED',valid.length,'/',setups.length)
  return valid
}

async function runScan() {
  const cached = await getCache()
  if (cached) { console.log('[v9] cache hit age:',cached.cacheAge,'min'); return cached }

  console.log('[v9] cache miss — fetching real prices via Polygon')
  const [prices, patterns] = await Promise.all([fetchRealPrices(UNIVERSE), getPatterns()])
  const priceCount = Object.keys(prices).length
  console.log('[v9]',priceCount,'real prices fetched')

  if (priceCount < 5) {
    return {setups:[],error:'Could not fetch real market data ('+priceCount+' prices)',priceCount,cached:false}
  }

  const marketContext = await getMarketContext(prices)
  const priceTable = UNIVERSE.filter(s=>prices[s]).map(s=>{
    const q=prices[s]; const chg=q.changePercent!=null?(q.changePercent>=0?'+':'')+q.changePercent.toFixed(2)+'%':'N/A'
    return s+'=$'+q.price.toFixed(2)+'('+chg+')'
  }).join(' | ')
  const patternCtx = patterns.length>0?'\nPATTERNS:'+patterns.map(p=>p.pattern_name+'[w:'+p.prompt_weight+']').join(','):''

  const prompt = `You are AnkushAI, institutional options trading intelligence.

CRITICAL RULE: Use ONLY the exact prices listed below. Every price level you output (entry, stop, target) MUST be derived mathematically from these real current prices. Do NOT use memory or training data.

LIVE PRICES: ${priceTable}

MARKET: SPY=${(marketContext.spy||0).toFixed(2)}(${(marketContext.spyChange||0)>=0?'+':''}${(marketContext.spyChange||0).toFixed(2)}%) VIX=${(marketContext.vix||20).toFixed(1)}(${marketContext.mood}) Regime:${marketContext.regime}${patternCtx}

Select 6-10 symbols with HIGH-CONVICTION setups. Rules:
- entryLow/entryHigh: within 2% of the REAL price shown above
- stopLoss: 3-8% from real price
- target1: 8-15% from real price
- target2: 15-25% from real price
- R/R must be >=2:1 using real prices only

Return ONLY valid JSON array, no markdown:
[{"symbol":"NVDA","setupType":"EMA Breakout","bias":"bullish","confidence":8,"entryLow":170.00,"entryHigh":174.00,"stopLoss":164.00,"target1":185.00,"target2":195.00,"rrRatio":2.8,"ivRank":45,"recommendedTrade":"Buy May 175 calls ~$4.20","frameworks":["ema_breakout","momentum"],"analysis":"Brief technical reason using the real price shown above","urgency":"today"}]`

  const msg = await anthropic.messages.create({model:'claude-sonnet-4-20250514',max_tokens:4000,messages:[{role:'user',content:prompt}]})
  let raw=[]
  const text=msg.content[0]?.text||'[]'
  try{const c=text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();raw=Array.isArray(JSON.parse(c))?JSON.parse(c):(JSON.parse(c).setups||[])}
  catch(e){const m=text.match(/\[[\s\S]*\]/);if(m)try{raw=JSON.parse(m[0])}catch(e2){}}

  const setups = validateSetups(raw, prices)
  const result = {setups,marketContext,pricesUsed:priceCount,patterns:patterns.length,generatedAt:new Date().toISOString(),cached:false,rejected:raw.length-setups.length}
  Promise.all([saveCache(result),recordSetups(setups)]).catch(()=>{})
  return result
}

async function analyzeSingle(symbol) {
  const prices = await fetchRealPrices([symbol])
  const rp = prices[symbol]?.price
  const ctx = rp?'REAL PRICE: '+symbol+'=$'+rp.toFixed(2)+'. ALL levels from this price.':'WARNING: real price unavailable — do NOT invent prices.'
  const msg = await anthropic.messages.create({model:'claude-sonnet-4-20250514',max_tokens:1200,messages:[{role:'user',content:ctx+'\n\nAnalyze '+symbol+' for a trade now. Entry within 2% of real price, stop 3-8% away, two targets, R/R, recommended options play.'}]})
  return {symbol,currentPrice:rp,analysis:msg.content[0]?.text,generatedAt:new Date().toISOString()}
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
  } catch(e){console.error('[v9]',e.message);return res.status(500).json({error:e.message})}
}
