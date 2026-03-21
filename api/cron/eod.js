// api/cron/eod.js — End-of-day debrief at 5pm ET weekdays
// Generates AI market recap, saves to daily_recaps, updates performance snapshots
// Vercel cron: "0 22 * * 1-5" (5pm ET = 10pm UTC) — replaces old daily.js

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const t0 = Date.now();
  const today = new Date().toISOString().split('T')[0];
  console.log('[eod-cron] Starting for', today);

  try {
    // Check if already run today
    const { data: existing } = await supabase
      .from('daily_recaps')
      .select('id')
      .eq('date', today)
      .single();

    if (existing) {
      return res.json({ status: 'skipped', reason: 'already_ran_today', date: today });
    }

    // Get market data
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.ankushai.org';
    const [contextRes, sectorsRes] = await Promise.all([
      fetch(`${base}/api/market?action=context`).then(r => r.json()),
      fetch(`${base}/api/market?action=sectors`).then(r => r.json()),
    ]);

    // Get today's setups that were tracked
    const { data: setupsToday } = await supabase
      .from('setup_records')
      .select('symbol, bias, confidence, setup_type')
      .eq('scan_date', today)
      .limit(10);

    // Get upcoming macro events (next 5 days)
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const { data: upcomingMacro } = await supabase
      .from('macro_events')
      .select('event_date, title, impact')
      .gte('event_date', today)
      .lte('event_date', nextWeek)
      .order('event_date')
      .limit(5);

    const sectorSummary = Array.isArray(sectorsRes)
      ? sectorsRes.map(s => `${s.name}: ${s.changePercent > 0 ? '+' : ''}${(s.changePercent || 0).toFixed(2)}%`).join(', ')
      : 'Data unavailable';

    const prompt = `You are AnkushAI's end-of-day market analyst. Write a concise, professional market debrief for ${today}.

MARKET DATA:
- SPY: ${contextRes.spy?.toFixed(2) || 'N/A'} (${contextRes.spyChange > 0 ? '+' : ''}${contextRes.spyChange?.toFixed(2) || 0}%)
- VIX: ${contextRes.vix || 'N/A'} (${contextRes.mood || 'Unknown'})
- Market Regime: ${contextRes.regime || 'Unknown'}
- Advancing Sectors: ${contextRes.advancing || 0} | Declining: ${contextRes.declining || 0}
- Leader: ${contextRes.leader || 'N/A'} (${contextRes.leaderChange > 0 ? '+' : ''}${(contextRes.leaderChange || 0).toFixed(2)}%)
- Laggard: ${contextRes.laggard || 'N/A'}

SECTOR PERFORMANCE: ${sectorSummary}

AI SETUPS TRACKED TODAY: ${setupsToday?.length || 0} setups (${setupsToday?.map(s => s.symbol).join(', ') || 'none'})

UPCOMING MACRO: ${upcomingMacro?.map(e => `${e.event_date}: ${e.title} [${e.impact}]`).join(' | ') || 'None in next 7 days'}

Write a structured debrief covering:
1. **Market Summary** — what happened today in 2-3 sentences
2. **Key Observations** — 3 bullet points of important technicals/macro observations  
3. **Sector Rotation** — what's leading/lagging and what it signals
4. **Tomorrow's Focus** — 2-3 specific things to watch for
5. **Options Positioning** — what the VIX level implies for options strategy

Keep it professional, institutional-grade, data-driven. 250-350 words total.`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = msg.content[0]?.text || 'Unable to generate recap';

    // Save to daily_recaps
    await supabase.from('daily_recaps').upsert({
      date: today,
      content,
      market_mood: contextRes.mood || 'Unknown',
      spy_change: contextRes.spyChange || 0,
      vix_close: contextRes.vix || 0,
      sector_summary: sectorSummary,
      tomorrow_focus: 'See full recap above',
    }, { onConflict: 'date' });

    // Resolve open setups outcomes (did they work?)
    await resolveSetupOutcomes(today, base);

    console.log(`[eod-cron] Done in ${Date.now() - t0}ms`);
    return res.json({
      status: 'success',
      date: today,
      mood: contextRes.mood,
      vix: contextRes.vix,
      ms: Date.now() - t0
    });

  } catch(e) {
    console.error('[eod-cron] Error:', e.message);
    return res.status(500).json({ error: e.message, ms: Date.now() - t0 });
  }
}

async function resolveSetupOutcomes(date, base) {
  try {
    // Get setups from 1-5 days ago that haven't been resolved
    const cutoff = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];
    const { data: setups } = await supabase
      .from('setup_records')
      .select('*')
      .gte('scan_date', cutoff)
      .lt('scan_date', date)
      .is('outcome', null)
      .limit(20);

    if (!setups?.length) return;

    for (const setup of setups.slice(0, 10)) {
      try {
        const q = await fetch(`${base}/api/market?action=quote&symbol=${setup.symbol}`)
          .then(r => r.json());
        if (!q.price || !setup.entry_high) continue;

        const hitTarget = setup.target_1 && q.price >= setup.target_1;
        const hitStop = setup.stop_loss && q.price <= setup.stop_loss;
        const outcome = hitTarget ? 'win' : hitStop ? 'loss' : 'open';

        if (outcome !== 'open') {
          await supabase.from('setup_records').update({
            outcome,
            exit_price: q.price,
            resolved_at: new Date().toISOString()
          }).eq('id', setup.id);

          await supabase.from('setup_outcomes').insert({
            setup_id: setup.id,
            symbol: setup.symbol,
            outcome,
            entry_price: setup.entry_high,
            exit_price: q.price,
            pnl_percent: setup.entry_high ? (q.price - setup.entry_high) / setup.entry_high * 100 : 0,
            days_held: Math.round((Date.now() - new Date(setup.created_at).getTime()) / 86400000),
          }).catch(() => {});
        }
      } catch(e) { /* skip individual failures */ }
    }
  } catch(e) {
    console.warn('[eod-cron] resolve outcomes error:', e.message);
  }
}
