// scan-cache.js — Shared scan result cache
// Architecture: One scan per N minutes serves ALL users from Supabase cache.
// This is the key scalability upgrade: at 100 users, we run 1 scan/15min not 100 scans.
// Users tap into AnkushAI's live database. Marginal cost per user → ~$0.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CACHE_MAX_AGE_MINUTES = 15; // How stale before triggering a fresh scan
const MARKET_HOURS_CACHE = 15;    // During market hours: 15 min cache
const AFTERHOURS_CACHE = 60;      // After hours: 60 min cache

function isMarketHours() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  return day >= 1 && day <= 5 && mins >= 570 && mins < 960;
}

function getCacheTTL() {
  return isMarketHours() ? MARKET_HOURS_CACHE : AFTERHOURS_CACHE;
}

export async function getCachedScan() {
  // Check Supabase for recent scan results
  const { data, error } = await supabase
    .from('scan_cache')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  const ageMinutes = (Date.now() - new Date(data.created_at).getTime()) / 60000;
  const ttl = getCacheTTL();

  if (ageMinutes < ttl) {
    console.log(`[scan-cache] Serving cached scan (${ageMinutes.toFixed(1)}min old, TTL=${ttl}min)`);
    return {
      ...data.scan_data,
      cached: true,
      cacheAge: Math.round(ageMinutes),
      cacheExpiry: Math.round(ttl - ageMinutes),
      servedAt: new Date().toISOString()
    };
  }

  console.log(`[scan-cache] Cache expired (${ageMinutes.toFixed(1)}min old). Fresh scan needed.`);
  return null;
}

export async function saveScanToCache(scanData) {
  const { error } = await supabase
    .from('scan_cache')
    .insert({
      scan_data: scanData,
      setup_count: scanData.setups?.length || 0,
      market_mood: scanData.marketContext?.mood || 'Unknown',
      vix: scanData.marketContext?.vix || null,
      spy_change: scanData.marketContext?.spyChange || null,
      created_at: new Date().toISOString()
    });

  if (error) console.error('[scan-cache] Save error:', error.message);
  else console.log(`[scan-cache] Saved ${scanData.setups?.length || 0} setups to cache`);
}

export async function getScanStats() {
  const { data } = await supabase
    .from('scan_cache')
    .select('created_at, setup_count, market_mood, vix, spy_change')
    .order('created_at', { ascending: false })
    .limit(10);

  return data || [];
}
