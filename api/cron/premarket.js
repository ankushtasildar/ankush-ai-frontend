// api/cron/premarket.js — Pre-market scan warmer (8:30am ET weekdays)
// Populates scan_cache so first user gets <100ms response instead of 30s scan
// Vercel cron: "30 13 * * 1-5"

import { createClient } from '@supabase/supabase-js';

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
  console.log('[premarket] Starting', new Date().toISOString());

  try {
    // Skip if cache already warm (within last hour)
    const { data: existing } = await supabase
      .from('scan_cache')
      .select('created_at,setup_count')
      .gte('created_at', new Date(Date.now() - 3600000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      console.log('[premarket] Cache warm, skipping', existing.created_at);
      return res.json({ status: 'skipped', reason: 'cache_warm', age_min: Math.round((Date.now()-new Date(existing.created_at).getTime())/60000) });
    }

    // Trigger scan to warm cache
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.ankushai.org';
    const r = await fetch(`${base}/api/analysis?type=scan`, { signal: AbortSignal.timeout(55000) });
    const data = await r.json();

    // Check macro events today
    const { data: macros } = await supabase
      .from('macro_events')
      .select('title,impact')
      .eq('event_date', new Date().toISOString().split('T')[0]);

    console.log(`[premarket] Done: ${data.setups?.length||0} setups, ${Date.now()-t0}ms`);
    return res.json({
      status: 'success',
      setups: data.setups?.length||0,
      mood: data.marketContext?.mood,
      vix: data.marketContext?.vix,
      macroEventsToday: macros?.length||0,
      ms: Date.now()-t0
    });
  } catch(e) {
    console.error('[premarket] Error:', e.message);
    return res.status(500).json({ error: e.message, ms: Date.now()-t0 });
  }
}
