// api/cron/eod.js - EOD Debrief generator (CommonJS + plain fetch)
const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPA_URL = process.env.SUPABASE_URL || '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const POLY = process.env.POLYGON_API_KEY;

async function supaGet(table, query) {
  if (!SUPA_URL || !SUPA_KEY) return [];
  try { const r = await fetch(SUPA_URL + '/rest/v1/' + table + '?' + query, { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY } }); return r.ok ? await r.json() : []; } catch { return []; }
}
async function supaInsert(table, row) {
  if (!SUPA_URL || !SUPA_KEY) return;
  try { await fetch(SUPA_URL + '/rest/v1/' + table, { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) }); } catch {}
}

async function getMarketData() {
  try {
    const [spyR, vixR] = await Promise.all([
      fetch('https://api.polygon.io/v2/aggs/ticker/SPY/prev?apiKey=' + POLY).then(r => r.json()),
      fetch('https://api.polygon.io/v2/aggs/ticker/VIX/prev?apiKey=' + POLY).then(r => r.json())
    ]);
    const spy = spyR?.results?.[0];
    const vix = vixR?.results?.[0];
    return {
      spy: spy ? { price: spy.c, change: ((spy.c - spy.o) / spy.o * 100).toFixed(2) + '%', high: spy.h, low: spy.l, volume: spy.v } : null,
      vix: vix ? { price: vix.c } : null
    };
  } catch { return { spy: null, vix: null }; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const market = await getMarketData();
    const today = new Date().toISOString().split('T')[0];

    // Check if we already have today's debrief
    const existing = await supaGet('daily_recaps', 'select=*&recap_date=eq.' + today + '&limit=1');
    if (existing.length > 0) {
      return res.json({ ...existing[0], _cached: true });
    }

    // Get recent setups for context
    const recentSetups = await supaGet('setup_records', 'select=symbol,computed_bias,confidence&order=created_at.desc&limit=10');

    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You are Marcus Webb, institutional market analyst. Generate a concise end-of-day market debrief. Respond ONLY with valid JSON.',
      messages: [{ role: 'user', content: 'Generate EOD debrief for ' + today + '. Market data: SPY ' + JSON.stringify(market.spy) + ', VIX ' + JSON.stringify(market.vix) + '. Recent AI setups: ' + JSON.stringify(recentSetups.slice(0,5)) + '. Return JSON: {"date":"' + today + '","headline":"...","marketSummary":"2-3 sentences","keyLevels":{"spy":{"support":0,"resistance":0}},"sectorHighlights":"...","setupRecap":"...","tomorrowOutlook":"...","riskLevel":"low|medium|high","keyEvents":"upcoming events"}' }]
    });

    const raw = msg.content[0].text;
    var analysis;
    try { analysis = JSON.parse(raw); } catch {
      var m = raw.match(/\{[\s\S]*\}/);
      if (m) analysis = JSON.parse(m[0]);
      else return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Save to daily_recaps
    await supaInsert('daily_recaps', {
      recap_date: today,
      headline: analysis.headline,
      content: analysis,
      spy_close: market.spy?.price,
      vix_close: market.vix?.price,
      created_at: new Date().toISOString()
    });

    return res.json({ ...analysis, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[cron/eod] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};