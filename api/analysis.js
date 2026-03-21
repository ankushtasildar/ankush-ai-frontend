// analysis.js v6 — AnkushAI Scan Engine
// Reads from scan_cache table. Self-contained. No broken imports.
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const UNIVERSE = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','ORCL','JPM','GS','V','MA','XOM','LLY','UNH','PLTR','NET','CRWD','COIN','SPY','QQQ','IWM','XLK','XLE','XLF','GLD','MU','INTC','QCOM','MRNA','GILD','ABBV','COST','WMT','HD','NKE','LULU','RKLB','MSTR','ARM']

function marketOpen() {
  const et = new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}))
  const m = et.getHours()*60+et.getMinutes(), d = et.getDay()
  return d>=1&&d<=5&&m>=570&&m<960
}

async function getCache() {
  try {
    const {data,error} = await supabase.from('scan_cache').select('scan_data,created_at').order('created_at',{ascending:false}).limit(1).single()
    if(error||!data) return null
    const age = Date.now()-new Date(data.created_at).getTime()
    const ttl = marketOpen()?15*60000:60*60000
    if(age<ttl) return {...data.scan_data, cached:true, cacheAge:Math.round(age/60000)}
    return null
  } catch(e){return null}
}

async function saveCache(result) {
  try { await supabase.from('scan_cache').insert({scan_data:result,setup_count:result.setups?.length||0,market_mood:result.marketContext?.mood,vix:result.marketContext?.vix,spy_change:result.marketContext?.spyChange}) } catch(e){}
}

async function recordSetups(setups) {
  if(!setups?.length) return
  try {
    await supabase.from('setup_records').insert(setups.slice(0,10).map(s=>({symbol:s.symbol,setup_type:s.setupType||'AI',bias:s.bias,entry_high:s.entryHigh||null,stop_loss:s.stopLoss||null,target_1:s.target1||null,confidence:s.confidence||7,frameworks:s.frameworks||[],rr_ratio:s.rrRatio||null,scan_date:new Date().toISOString().split('T')[0]})))
  } catch(e){}
}

async function getMktCtx() {
  try { const base=process.env.VERCEL_URL?'https://'+process.env.VERCEL_URL:'https://www.ankushai.org'; return await fetch(base+'/api/market?action=context',{signal:AbortSignal.timeout(8000)}).then(r=>r.json()) } catch(e){return{spy:0,spyChange:0,vix:20,mood:'Unknown',regime:'neutral'}}
}

async function getPatterns() {
  try { const {data}=await supabase.from('ai_learned_patterns').select('pattern_name,works_best_when,fails_when,prompt_weight').order('prompt_weight',{ascending:false}).limit(8); return data||[] } catch(e){return[]}
}

async function scan() {
  const cached = await getCache()
  if(cached){console.log('[scan] serving cache age:',cached.cacheAge,'min'); return cached}
  console.log('[scan] cache miss — running live scan')
  const [ctx,patterns] = await Promise.all([getMktCtx(),getPatterns()])
  const pc = patterns.length>0?'\nPATTERNS: '+patterns.map(p=>p.pattern_name+' ['+p.prompt_weight+']').join(', '):''
  const prompt = 'You are AnkushAI institutional trading intelligence.\nMARKET: SPY $'+(ctx.spy||0).toFixed(2)+' ('+(ctx.spyChange>=0?'+':''+(ctx.spyChange||0).toFixed(2))+'%), VIX '+(ctx.vix||20)+' ('+ctx.mood+'), Regime: '+ctx.regime+pc+'\nUNIVERSE: '+UNIVERSE.join(', ')+'\n\nFind 8-12 highest-conviction setups. Rules: no penny stocks, exact dollar levels, R/R>=2:1, VIX>25 prefer spreads.\n\nReturn ONLY JSON array:\n[{"symbol":"NVDA","setupType":"EMA Breakout","bias":"bullish","confidence":8,"entryLow":870,"entryHigh":885,"stopLoss":855,"target1":920,"target2":960,"rrRatio":3.2,"ivRank":38,"recommendedTrade":"Buy June 900 calls ~$3.50","frameworks":["ema_breakout","momentum"],"analysis":"Setup thesis here","urgency":"today"}]'
  const msg = await anthropic.messages.create({model:'claude-sonnet-4-20250514',max_tokens:4000,messages:[{role:'user',content:prompt}]})
  let setups = []
  const text = msg.content[0]?.text||'[]'
  try { const c=text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim(); setups=JSON.parse(c); if(!Array.isArray(setups))setups=setups.setups||[] } catch(e){const m=text.match(/\[[\s\S]*\]/);if(m)try{setups=JSON.parse(m[0])}catch(e2){}}
  const result = {setups,marketContext:ctx,patterns:patterns.length,generatedAt:new Date().toISOString(),cached:false}
  Promise.all([saveCache(result),recordSetups(setups)]).catch(()=>{})
  return result
}

export default async function handler(req,res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Cache-Control','s-maxage=60,stale-while-revalidate=300')
  if(req.method==='OPTIONS') return res.status(200).end()
  const type=(req.query.type||req.query.action||'scan').toLowerCase()
  try {
    if(type==='scan') return res.json(await scan())
    if(type==='single'&&req.query.symbol) {
      const msg=await anthropic.messages.create({model:'claude-sonnet-4-20250514',max_tokens:1200,messages:[{role:'user',content:'Analyze '+req.query.symbol.toUpperCase()+' for a trade right now. Exact entry, stop, two targets, R/R, options play with strike/expiry.'}]})
      return res.json({symbol:req.query.symbol,analysis:msg.content[0]?.text,generatedAt:new Date().toISOString()})
    }
    if(type==='cache_status'){const c=await getCache();return res.json({hasCachedScan:!!c,cacheAge:c?.cacheAge})}
    return res.status(400).json({error:'Use: scan, single, cache_status'})
  } catch(e){console.error('[analysis]',e.message);return res.status(500).json({error:e.message})}
}
