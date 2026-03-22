const Anthropic = require('@anthropic-ai/sdk')
const anthropic = new Anthropic()

// Supabase REST helpers — no SDK, no ESM issues
const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CACHE_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

async function supaGet(table, query) {
  if (!SUPA_URL || !SUPA_KEY) return null
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/' + table + '?' + query + '&limit=1', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
    })
    const rows = await r.json()
    return Array.isArray(rows) && rows.length ? rows[0] : null
  } catch(e) { return null }
}

async function supaUpsert(table, row) {
  if (!SUPA_URL || !SUPA_KEY) return
  try {
    await fetch(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(row)
    })
  } catch(e) { console.error('[supaUpsert]', e.message) }
}

async function getCachedAnalysis(symbol) {
  const row = await supaGet('symbol_analysis', 'symbol=eq.' + symbol.toUpperCase() + '&select=result,updated_at')
  if (!row) return null
  const age = Date.now() - new Date(row.updated_at).getTime()
  if (age > CACHE_TTL_MS) return null
  return { ...row.result, _cached: true, _cacheAge: Math.round(age / 60000) + 'm' }
}

async function setCachedAnalysis(symbol, result) {
  await supaUpsert('symbol_analysis', {
    symbol: symbol.toUpperCase(),
    result,
    price: result.price || null,
    sentiment: result.sentiment || null,
    confidence: result.confidence || null,
    updated_at: new Date().toISOString()
  })
}

async function analyzeSingleCached(symbol, force) {
  if (!force) {
    const cached = await getCachedAnalysis(symbol)
    if (cached) return cached
  }
  const result = await analyzeSingle(symbol)
  await setCachedAnalysis(symbol, result)
  return result
}

function tradingDate(daysBack) {
  const d = new Date()
  // Move to most recent trading day first
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  // Then go back daysBack additional trading days
  let count = 0
  while (count < daysBack) {
    d.setDate(d.getDate() - 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) count++
  }
  return d.toISOString().split('T')[0]
}

async function fetchRealPrices(symbols) {
  const POLYGON_KEY = process.env.POLYGON_API_KEY || process.env.POLYGON_KEY
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
  const priceTag = rp ? symbol + '=$' + rp.toFixed(2) : symbol + '=unknown'
  const priceWarn = rp
    ? 'REAL PRICE: ' + priceTag + '. ALL levels MUST be within 15% of ' + rp.toFixed(2) + '. Do NOT use prices from training data.'
    : 'WARNING: real price unavailable, use recent market prices for ' + symbol
  const jsonSchema = '{"sentiment":"bullish|bearish|neutral","confidence":50-95,"price":' + (rp ? rp.toFixed(2) : 'null') + ',"summary":"2-3 sentences","setup":"setup name","entry":0,"target":0,"target2":0,"stop":0,"rr":"2:1","support":0,"resistance":0,"optionsPlay":"strategy","timeframe":"days","catalyst":"driver"}'
  const userMsg = priceWarn + '\n\nAnalyze ' + symbol + ' for a swing trade. Current price is ' + (rp ? '$' + rp.toFixed(2) : 'unknown') + '. Entry within 2% of current price, stop 3-8% away, target 2x+ risk. Respond ONLY with valid JSON:\n' + jsonSchema
  const msg = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: userMsg }] })
  const raw = (msg.content[0]?.text || '{}').replace(/```json|```/g, '').trim()
  let parsed = {}
  try { parsed = JSON.parse(raw) } catch(e) { console.error('[parse err]', e.message) }
  return { symbol, currentPrice: rp, price: parsed.price || rp, sentiment: parsed.sentiment || 'neutral', confidence: parsed.confidence || 50, summary: parsed.summary || '', setup: parsed.setup || '', entry: parsed.entry || null, target: parsed.target || null, target2: parsed.target2 || null, stop: parsed.stop || null, rr: parsed.rr || '', support: parsed.support || null, resistance: parsed.resistance || null, optionsPlay: parsed.optionsPlay || '', timeframe: parsed.timeframe || '', catalyst: parsed.catalyst || '', generatedAt: new Date().toISOString() }
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

const WARM_SYMBOLS = ['SPY','QQQ','NVDA','AAPL','MSFT','META','TSLA','AMZN','GOOGL','AMD','PLTR','CRWD','JPM','GS','IWM','XLK','MSTR','COIN','AVGO','CRM','NFLX','MU','V','MA']

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60,stale-while-revalidate=300')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const type = (req.query.type || req.query.action || 'scan').toLowerCase()
  const symbol = req.query.symbol?.toUpperCase()
  try {
    if (type === 'scan') return res.json(await runScan())
    if ((type === 'single' || type === 'snapshot') && symbol) return res.json(await analyzeSingleCached(symbol, req.query.force === '1'))
    if (type === 'cache_status') { const c = await getCache(); return res.json({ hasCachedScan: !!c, cacheAge: c?.cacheAge, setupCount: c?.setups?.length || 0 }) }
    if (type === 'warm') {
      const results = {}
      for (const s of WARM_SYMBOLS.slice(0, 8)) {
        try { const r = await analyzeSingleCached(s, false); results[s] = r._cached ? 'cached' : 'fresh' } catch(e) { results[s] = 'err' }
      }
      return res.json({ warmed: Object.keys(results).length, results })
    }
    return res.status(400).json({ error: 'Use: scan, single, snapshot, cache_status, warm' })
  } catch(e) { console.error('[analysis]', e.message); return res.status(500).json({ error: e.message }) }
}