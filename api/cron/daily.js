// Vercel Cron Job — runs daily at 5:00 PM ET (market close + 30min)
// Resolves open setup outcomes, fetches macro news, updates market events
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function fetchCurrentPricePolygon(symbol) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;
  try {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    const r = await fetch(`https://api.polygon.io/v1/open-close/${symbol}/${dateStr}?adjusted=true&apiKey=${key}`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) { const d = await r.json(); return d.close || null; }
  } catch (e) {}
  return null;
}

async function fetchMarketNewsSentiment() {
  try {
    // Use Claude with web search to get today's market-moving news
    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Search for today's top 5 market-moving news events. Include: Fed/FOMC statements, Trump economic announcements, tariff news, major earnings surprises, geopolitical events affecting markets. For each, classify: event_type (fomc/trump_tweet/tariff/earnings/geopolitical/economic_data), impact_magnitude (extreme/high/moderate/low), sentiment (risk_on/risk_off/mixed). Output ONLY JSON array: [{"headline":"...","event_type":"...","impact_magnitude":"...","sentiment":"...","trading_implications":"...","affected_sectors":[]}]`
      }]
    });
    const textBlock = result.content.find(b => b.type === 'text');
    if (!textBlock) return [];
    const raw = textBlock.text.replace(/```json|```/g, '').trim();
    const startIdx = raw.indexOf('[');
    const endIdx = raw.lastIndexOf(']') + 1;
    if (startIdx === -1) return [];
    return JSON.parse(raw.slice(startIdx, endIdx));
  } catch (e) {
    console.error('News fetch error:', e.message);
    return [];
  }
}

module.exports = async function handler(req, res) {
  // Allow manual trigger from admin, or Vercel cron
  const authHeader = req.headers.authorization;
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET && !authHeader?.includes('Bearer')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { outcomes_resolved: 0, news_logged: 0, errors: [] };

  try {
    // 1. Fetch today's market news
    const newsEvents = await fetchMarketNewsSentiment();
    for (const event of newsEvents) {
      if (!event.headline) continue;
      const { error } = await supabase.from('market_moving_events').insert({
        occurred_at: new Date().toISOString(),
        event_type: event.event_type || 'economic_data',
        headline: event.headline,
        impact_magnitude: event.impact_magnitude || 'moderate',
        sentiment: event.sentiment || 'mixed',
        trading_implications: event.trading_implications,
        affected_sectors: event.affected_sectors || [],
        source: 'ai_web_search',
        tags: [event.event_type, new Date().toISOString().split('T')[0]]
      });
      if (!error) results.news_logged++;
    }

    // 2. Resolve open setups
    const { data: openSetups } = await supabase
      .from('setup_records')
      .select('id, symbol, bias, target_1, stop_loss, price_at_generation, entry_high, created_at, options_delta, options_cost_per_contract, options_theta_per_day')
      .eq('status', 'open');

    if (openSetups?.length) {
      // Batch fetch prices for all unique symbols
      const symbols = [...new Set(openSetups.map(s => s.symbol))];
      const prices = {};
      for (const sym of symbols) {
        const price = await fetchCurrentPricePolygon(sym);
        if (price) prices[sym] = price;
        await new Promise(r => setTimeout(r, 200)); // rate limit
      }

      // Get today's macro events
      const today = new Date().toISOString().split('T')[0];
      const { data: todayEvents } = await supabase
        .from('macro_events')
        .select('event_type, title')
        .eq('event_date', today);

      const fomcToday = todayEvents?.some(e => e.event_type === 'fomc') || false;
      const cpiToday = todayEvents?.some(e => e.event_type === 'cpi') || false;

      for (const setup of openSetups) {
        const currentPrice = prices[setup.symbol];
        if (!currentPrice) continue;

        const entryPrice = setup.entry_high || setup.price_at_generation;
        const ageDays = Math.floor((Date.now() - new Date(setup.created_at).getTime()) / 86400000);

        const hitTarget = setup.target_1 && setup.bias === 'bullish' && currentPrice >= setup.target_1;
        const hitStopBull = setup.stop_loss && setup.bias === 'bullish' && currentPrice <= setup.stop_loss;
        const hitTargetBear = setup.target_1 && setup.bias === 'bearish' && currentPrice <= setup.target_1;
        const hitStopBear = setup.stop_loss && setup.bias === 'bearish' && currentPrice >= setup.stop_loss;
        const expired = ageDays >= 14;

        if (!hitTarget && !hitStopBull && !hitTargetBear && !hitStopBear && !expired) continue;

        const returnPct = entryPrice > 0
          ? ((currentPrice - entryPrice) / entryPrice * 100) * (setup.bias === 'bearish' ? -1 : 1)
          : 0;

        const outcome = (hitTarget || hitTargetBear) ? 'target_hit'
          : (hitStopBull || hitStopBear) ? 'stop_hit'
          : returnPct > 0 ? 'expired_profit' : 'expired_loss';

        // Estimate options P&L
        let optPnl = null;
        if (setup.options_delta && setup.options_cost_per_contract) {
          const move = (currentPrice - entryPrice) * (setup.bias === 'bearish' ? -1 : 1);
          const optMove = move * setup.options_delta * 100;
          const thetaCost = (setup.options_theta_per_day || 0) * ageDays;
          optPnl = ((optMove + thetaCost) / setup.options_cost_per_contract * 100);
        }

        await supabase.from('setup_outcomes').insert({
          setup_id: setup.id,
          outcome,
          hit_target_1: hitTarget || hitTargetBear || false,
          hit_stop: hitStopBull || hitStopBear || false,
          price_at_exit: currentPrice,
          exit_date: today,
          underlying_return_pct: parseFloat(returnPct.toFixed(4)),
          hold_days_actual: ageDays,
          estimated_options_return_pct: optPnl ? parseFloat(optPnl.toFixed(2)) : null,
          fomc_occurred: fomcToday,
          major_news_occurred: newsEvents.length > 0,
          news_during_json: newsEvents.length > 0 ? JSON.stringify(newsEvents.slice(0, 3)) : null,
          data_quality_score: 8
        });

        await supabase.from('setup_records').update({
          status: outcome.replace('_profit','').replace('_loss','expired'),
          outcome_locked_at: new Date().toISOString()
        }).eq('id', setup.id);

        results.outcomes_resolved++;
      }
    }
  } catch (e) {
    results.errors.push(e.message);
    console.error('Daily cron error:', e.message);
  }

  return res.json({ success: true, date: new Date().toISOString().split('T')[0], ...results });
};
