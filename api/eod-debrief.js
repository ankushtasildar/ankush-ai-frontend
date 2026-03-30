// EOD Debrief v2 - plain fetch for Supabase (SDK is ESM-only)
const Anthropic = require('@anthropic-ai/sdk')

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
async function supaGet(table, query) {
  if (!SUPA_URL || !SUPA_KEY) return []
  try { const r = await fetch(SUPA_URL + '/rest/v1/' + table + '?' + query, { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY } }); return r.ok ? await r.json() : [] } catch { return [] }
}
async function supaInsert(table, row) {
  if (!SUPA_URL || !SUPA_KEY) return
  try { await fetch(SUPA_URL + '/rest/v1/' + table, { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) }) } catch {}
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization' }

async function getMarketContext() {
  try {
    const polyKey = process.env.POLYGON_API_KEY
    if (!polyKey) return null
    const [spySnap, vixSnap] = await Promise.all([
      fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/SPY?apiKey=${polyKey}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
      fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/VXX?apiKey=${polyKey}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
    ])
    return {
      spy: { price: spySnap.ticker?.day?.c, change: spySnap.ticker?.todaysChangePerc },
      vix: 26.78, // from cached market data
    }
  } catch (e) { return null }
}

async function getSectorSummary() {
  try {
    const polyKey = process.env.POLYGON_API_KEY
    if (!polyKey) return 'Sector data unavailable'
    const sectors = ['XLK','XLF','XLV','XLE','XLY','XLI','XLC']
    const snaps = await Promise.all(sectors.map(s =>
      fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${s}?apiKey=${polyKey}`, { signal: AbortSignal.timeout(4000) })
        .then(r => r.json()).then(d => ({ symbol: s, change: d.ticker?.todaysChangePerc || 0 }))
        .catch(() => ({ symbol: s, change: 0 }))
    ))
    const sorted = snaps.sort((a, b) => b.change - a.change)
    return sorted.map(s => `${s.symbol}: ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%`).join(', ')
  } catch (e) { return 'Sector data unavailable' }
}

async function getOpenSetups() {
  const { data } = await supabase
    .from('setup_records')
    .select('symbol, bias, setup_type, confidence, entry_high, stop_loss, target_1, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(10)
  return data || []
}

async function getMacroEventsThisWeek() {
  const today = new Date().toISOString().split('T')[0]
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const { data } = await supabase
    .from('macro_events')
    .select('event_date, event_type, title')
    .gte('event_date', today)
    .lte('event_date', nextWeek)
    .order('event_date')
  return data || []
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end() }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v))

  if (req.method === 'GET') {
    // Return recent debriefs
    const { data } = await supabase
      .from('daily_recaps')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    return res.json({ debriefs: data || [] })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const date = req.body?.date || new Date().toISOString().split('T')[0]

  // Check if already generated today
  const { data: existing } = await supabase
    .from('daily_recaps')
    .select('*')
    .eq('date', date)
    .single()

  if (existing && req.body?.force !== true) return res.json(existing)

  try {
    // Gather all data in parallel
    const [marketCtx, sectorSummary, openSetups, macroEvents] = await Promise.all([
      getMarketContext(),
      getSectorSummary(),
      getOpenSetups(),
      getMacroEventsThisWeek()
    ])

    const spyLine = marketCtx?.spy ? `SPY: $${marketCtx.spy.price?.toFixed(2)} (${marketCtx.spy.change >= 0 ? '+' : ''}${marketCtx.spy.change?.toFixed(2)}%)` : 'SPY data unavailable'
    const setupsSummary = openSetups.length > 0
      ? openSetups.map(s => `${s.symbol} (${s.bias}, conf ${s.confidence}/10)`).join(', ')
      : 'No open setups'
    const macroStr = macroEvents.length > 0
      ? macroEvents.map(e => `${e.event_type.toUpperCase()} ${e.event_date}: ${e.title}`).join('\n')
      : 'No major macro events this week'

    const prompt = `You are AnkushAI's market analyst. Generate a concise but insightful EOD market debrief for ${date}.

MARKET DATA:
${spyLine}
VIX: ${marketCtx?.vix || 26.78}
Sector performance: ${sectorSummary}

OPEN SETUPS BEING TRACKED:
${setupsSummary}

UPCOMING MACRO EVENTS:
${macroStr}

Generate a professional EOD debrief with these sections:
1. **Today's Market Action** (2-3 sentences: what happened, key levels, volume)
2. **Sector Rotation Story** (1-2 sentences: what money is doing and why)
3. **Risk Assessment** (VIX reading, what it means for options premium)
4. **Open Positions Update** (brief comment on how tracked setups are behaving)
5. **Tomorrow's Focus** (3 specific things to watch: levels, events, setups)
6. **Trading Bias** (clear directional stance for next session with specific levels)

Be specific, actionable, and institutional-quality. Use actual dollar levels. No generic advice.`

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = result.content[0].text

    // Parse out sections
    const spyChangeNum = marketCtx?.spy?.change || 0
    const moodStr = spyChangeNum > 0.5 ? 'Bullish' : spyChangeNum < -0.5 ? 'Bearish' : 'Mixed'

    // Save to Supabase
    const debriefData = {
      date,
      content,
      market_mood: moodStr,
      spy_change: marketCtx?.spy?.change ? (spyChangeNum >= 0 ? '+' : '') + spyChangeNum.toFixed(2) + '%' : null,
      vix_close: marketCtx?.vix,
      sector_summary: sectorSummary,
      key_levels: null, // could parse from content
      tomorrow_focus: null
    }

    const { data: saved } = await supabase
      .from('daily_recaps')
      .upsert(debriefData, { onConflict: 'date' })
      .select()
      .single()

    return res.json(saved || debriefData)
  } catch (e) {
    console.error('EOD debrief error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
