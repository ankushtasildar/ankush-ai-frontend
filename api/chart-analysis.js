const Anthropic = require('@anthropic-ai/sdk')

const anthropic = new Anthropic()
const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const OVERLAY_TTL_MS = 4 * 60 * 60 * 1000

async function getPolygonBars(symbol, days) {
  const key = process.env.POLYGON_API_KEY
  const to = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - (days||90) * 86400000).toISOString().split('T')[0]
  const url = 'https://api.polygon.io/v2/aggs/ticker/' + symbol + '/range/1/day/' + from + '/' + to + '?adjusted=true&sort=asc&limit=120&apiKey=' + key
  const r = await fetch(url)
  const d = await r.json()
  return (d.results || []).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }))
}

async function getPrevClose(symbol) {
  const key = process.env.POLYGON_API_KEY
  const r = await fetch('https://api.polygon.io/v2/aggs/ticker/' + symbol + '/prev?adjusted=true&apiKey=' + key)
  const d = await r.json()
  return d.results && d.results[0] ? d.results[0].c : null
}

function calcSwingLevels(bars) {
  if (!bars || bars.length < 20) return { highs: [], lows: [] }
  const highs = [], lows = [], win = 5
  for (let i = win; i < bars.length - win; i++) {
    const sl = bars.slice(i - win, i + win + 1)
    const maxH = Math.max(...sl.map(b => b.h))
    const minL = Math.min(...sl.map(b => b.l))
    if (bars[i].h === maxH) highs.push(bars[i].h)
    if (bars[i].l === minL) lows.push(bars[i].l)
  }
  return { highs: highs.slice(-4), lows: lows.slice(-4) }
}

function calcEMAs(bars) {
  function ema(data, p) { const k=2/(p+1); let e=data[0]; for(let i=1;i<data.length;i++) e=data[i]*k+e*(1-k); return e }
  const c = bars.map(b => b.c)
  return {
    ema20:  c.length >= 20  ? +ema(c.slice(-20),20).toFixed(2)   : null,
    ema50:  c.length >= 50  ? +ema(c.slice(-50),50).toFixed(2)   : null,
    ema200: c.length >= 200 ? +ema(c.slice(-200),200).toFixed(2) : null,
  }
}

function calcVWAP(bars, p) {
  const sl = bars.slice(-(p||20))
  const tpv = sl.reduce((s,b) => s + ((b.h+b.l+b.c)/3)*b.v, 0)
  const tv  = sl.reduce((s,b) => s + b.v, 0)
  return tv > 0 ? tpv / tv : null
}

function calcFibonacci(high, low) {
  const d = high - low
  return {
    fib_0:    +low.toFixed(2),
    fib_236:  +(low+d*0.236).toFixed(2),
    fib_382:  +(low+d*0.382).toFixed(2),
    fib_500:  +(low+d*0.500).toFixed(2),
    fib_618:  +(low+d*0.618).toFixed(2),
    fib_786:  +(low+d*0.786).toFixed(2),
    fib_1000: +high.toFixed(2),
    fib_1272: +(high+d*0.272).toFixed(2),
    fib_1618: +(high+d*0.618).toFixed(2),
  }
}

function calcSDZones(bars) {
  const recent = bars.slice(-60)
  const avgVol = recent.reduce((s,b) => s+b.v, 0) / recent.length
  const supply = [], demand = []
  for (let i = 3; i < recent.length - 3; i++) {
    const b = recent[i]
    const range = b.h - b.l || 0.01
    const isHV = b.v > avgVol * 1.4
    if (isHV && b.c < b.o && (b.h - b.c) / range > 0.45) supply.push({ top: +b.h.toFixed(2), bottom: +b.o.toFixed(2), strength: +(b.v/avgVol).toFixed(1) })
    if (isHV && b.c > b.o && (b.c - b.l) / range > 0.45) demand.push({ top: +b.c.toFixed(2), bottom: +b.l.toFixed(2), strength: +(b.v/avgVol).toFixed(1) })
  }
  return {
    supply: supply.sort((a,b) => b.strength - a.strength).slice(0,3),
    demand: demand.sort((a,b) => b.strength - a.strength).slice(0,3)
  }
}

async function buildOverlays(symbol) {
  const [bars, price] = await Promise.all([ getPolygonBars(symbol, 90), getPrevClose(symbol) ])
  if (!bars.length) throw new Error('No price data for ' + symbol)
  const cp = price || bars[bars.length-1].c
  const h90 = Math.max(...bars.map(b => b.h))
  const l90 = Math.min(...bars.map(b => b.l))
  const swings = calcSwingLevels(bars)
  const emas   = calcEMAs(bars)
  const fib    = calcFibonacci(h90, l90)
  const sdz    = calcSDZones(bars)
  const vwap20 = calcVWAP(bars, 20)
  const vwap90 = calcVWAP(bars, 90)

  const prompt = 'Symbol: ' + symbol + ' | Price: $' + cp.toFixed(2) + '\n' +
    '90d Range: $' + l90.toFixed(2) + ' - $' + h90.toFixed(2) + '\n' +
    'EMAs: 20=$' + (emas.ema20||'N/A') + ' 50=$' + (emas.ema50||'N/A') + ' 200=$' + (emas.ema200||'N/A') + '\n' +
    'VWAP 20d=$' + (vwap20||0).toFixed(2) + ' 90d=$' + (vwap90||0).toFixed(2) + '\n' +
    'Swing Highs: ' + swings.highs.map(h=>h.toFixed(2)).join(', ') + '\n' +
    'Swing Lows: ' + swings.lows.map(l=>l.toFixed(2)).join(', ') + '\n' +
    'Supply Zones: ' + sdz.supply.map(z=>z.bottom+'-'+z.top+'('+z.strength+'x)').join(' | ') + '\n' +
    'Demand Zones: ' + sdz.demand.map(z=>z.bottom+'-'+z.top+'('+z.strength+'x)').join(' | ') + '\n' +
    'Fibonacci: ' + JSON.stringify(fib) + '\n\n' +
    'Return JSON ONLY:\n{"bias":"bullish|bearish|neutral","keyResistance":[p1,p2,p3],"keySupport":[p1,p2,p3],"supplyZones":[{"top":n,"bottom":n,"label":"Supply 1"}],"demandZones":[{"top":n,"bottom":n,"label":"Demand 1"}],"fibonacci":{"high":n,"low":n,"levels":[0,0.236,0.382,0.5,0.618,0.786,1]},"emas":[{"period":20,"value":n}],"vwap":{"20d":n,"90d":n},"priceVsLevels":"brief description","immediateTarget":n,"invalidationLevel":n}'

  const msg = await anthropic.messages.create({ model:'claude-sonnet-4-20250514', max_tokens:1000, messages:[{role:'user',content:prompt}] })
  let overlay
  try {
    overlay = JSON.parse(msg.content[0].text.replace(/```json|```/g,'').trim())
  } catch(e) {
    overlay = { bias:'neutral', keyResistance:[h90], keySupport:[l90], supplyZones:sdz.supply, demandZones:sdz.demand, fibonacci:{high:h90,low:l90,levels:[0,0.236,0.382,0.5,0.618,0.786,1]}, emas:Object.entries(emas).filter(([,v])=>v).map(([k,v])=>({period:parseInt(k.replace('ema','')),value:v})), vwap:{'20d':vwap20,'90d':vwap90} }
  }
  return { symbol, currentPrice:cp, high90:h90, low90:l90, ...overlay, generatedAt:new Date().toISOString() }
}

async function getCached(symbol) {
  try {
    if (!SUPA_URL || !SUPA_KEY) return null
    const r = await fetch(SUPA_URL + '/rest/v1/symbol_analysis?symbol=eq.' + encodeURIComponent(symbol+'_overlay') + '&select=result,updated_at&limit=1', { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } })
    const rows = await r.json()
    if (!rows || !rows[0]) return null
    const age = Date.now() - new Date(rows[0].updated_at).getTime()
    if (age > OVERLAY_TTL_MS) return null
    return { ...rows[0].result, _cached:true, _cacheAge: Math.round(age/60000)+'m' }
  } catch(e) { return null }
}

async function setCache(symbol, result) {
  try {
    if (!SUPA_URL || !SUPA_KEY) return
    await fetch(SUPA_URL + '/rest/v1/symbol_analysis', { method: 'POST', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ symbol: symbol+'_overlay', result, updated_at: new Date().toISOString() }) })
  } catch(e) { console.error('[overlay cache]', e.message) }
}

module.exports = async function handler(req, res) {
  const symbol = (req.query.symbol || 'SPY').toUpperCase()
  const force  = req.query.force === '1'
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=14400')
  try {
    if (!force) { const c = await getCached(symbol); if (c) return res.json(c) }
    const result = await buildOverlays(symbol)
    await setCache(symbol, result)
    return res.json(result)
  } catch(e) {
    console.error('[chart-analysis]', symbol, e.message)
    return res.status(500).json({ error: e.message, symbol })
  }
}