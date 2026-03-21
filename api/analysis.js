// analysis.js v5 — Shared scan cache + fixed auth + intelligence loop
// Key upgrade: Uses scan_cache so all users share one scan per 15 min
// Fixes: "Could not resolve authentication method" — now uses service role properly

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getCachedScan, saveScanToCache } from './scan-cache.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Use service role for server-side Supabase operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SCAN_UNIVERSE = [
  // Mega-cap leaders
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','AMD','ORCL',
  // Sector leaders
  'JPM','GS','BAC','V','MA','XOM','CVX','LLY','UNH','JNJ',
  // Growth & momentum
  'PLTR','SNOW','NET','CRWD','DDOG','MDB','ZS','PANW','COIN','HOOD',
  // ETFs
  'SPY','QQQ','IWM','XLK','XLE','XLF','ARKK','SOXX','GLD','TLT',
  // High-beta/options-friendly
  'MSTR','RKLB','SMCI','ARM','DELL','HPE','WDC','MU','INTC','QCOM',
  // Retail favorites
  'GME','AMC','BBBY','RIVN','LUCID','NIO','UBER','LYFT','ABNB','DASH',
  // Healthcare/Biotech
  'MRNA','BNTX','GILD','ABBV','PFE','REGN','VRTX','BIIB',
  // Consumer
  'COST','WMT','TGT','HD','LOW','NKE','LULU','SBUX',
  // Real estate & utilities
  'REIT','AMT','PLD',
];

// Load patterns from intelligence DB
async function loadPatterns() {
  try {
    const { data } = await supabase
      .from('ai_learned_patterns')
      .select('pattern_name, pattern_type, works_best_when, fails_when, recommended_iv_strategy, prompt_weight, win_rate, sample_size')
      .order('prompt_weight', { ascending: false })
      .limit(10);
    return data || [];
  } catch(e) {
    console.warn('Pattern load failed:', e.message);
    return [];
  }
}

// Load macro context
async function loadMacroContext() {
  try {
    const { data } = await supabase
      .from('macro_events')
      .select('event_date, title, impact, event_type')
      .gte('event_date', new Date().toISOString().split('T')[0])
      .order('event_date')
      .limit(5);
    return data || [];
  } catch(e) { return []; }
}

// Record setup to intelligence loop
async function recordSetups(setups) {
  if (!setups?.length) return;
  try {
    const rows = setups.slice(0, 10).map(s => ({
      symbol: s.symbol,
      setup_type: s.setupType || 'AI Scan',
      bias: s.bias,
      entry_high: s.entryHigh || null,
      entry_low: s.entryLow || null,
      stop_loss: s.stopLoss || null,
      target_1: s.target1 || null,
      confidence: s.confidence || 7,
      frameworks: s.frameworks || [],
      scan_date: new Date().toISOString().split('T')[0],
      rr_ratio: s.rrRatio || null,
    }));
    await supabase.from('setup_records').insert(rows);
  } catch(e) {
    console.warn('Setup record failed:', e.message);
  }
}

// Main scan function
async function runFullScan(req) {
  // First: check shared cache
  const cached = await getCachedScan();
  if (cached) return cached;

  // Cache miss — run fresh scan
  const [patterns, macroEvents] = await Promise.all([loadPatterns(), loadMacroContext()]);

  // Get market context
  let marketContext = { spy: 0, vix: 20, mood: 'Unknown', regime: 'neutral' };
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const mkt = await fetch(`${base}/api/market?action=context`).then(r => r.json());
    marketContext = mkt;
  } catch(e) {}

  const patternContext = patterns.length > 0
    ? `\n\nLEARNED PATTERNS (use to calibrate confidence):\n${patterns.map(p => `• ${p.pattern_name}: works when ${p.works_best_when}, fails when ${p.fails_when} [weight: ${p.prompt_weight}]`).join('\n')}`
    : '';

  const macroContext = macroEvents.length > 0
    ? `\n\nUPCOMING MACRO EVENTS:\n${macroEvents.map(e => `• ${e.event_date}: ${e.title} [${e.impact} impact]`).join('\n')}`
    : '';

  const prompt = `You are AnkushAI — an institutional options trading intelligence system running on 100 analyst frameworks.

CURRENT MARKET: SPY $${marketContext.spy} (${marketContext.spyChange > 0 ? '+' : ''}${marketContext.spyChange?.toFixed(2) || 0}%), VIX ${marketContext.vix} (${marketContext.mood}), Regime: ${marketContext.regime}
${patternContext}${macroContext}

UNIVERSE: ${SCAN_UNIVERSE.slice(0, 50).join(', ')}

TASK: Identify the TOP 8-12 highest-conviction setups RIGHT NOW. For each, apply:
- Technical: EMA stack (20/50/200), RSI, MACD, volume, breakout patterns, Fibonacci levels
- Options: IV rank, earnings proximity, unusual activity, spread positioning
- Macro: sector momentum, VIX regime, market breadth
- Sentiment: short interest, analyst revisions, institutional flows

CRITICAL RULES:
1. NO penny stocks (price < $5), NO sub-$100M market cap
2. Every setup needs EXACT dollar entry zone, stop loss, TWO targets
3. R/R must be ≥ 2:1 minimum, aim for 3:1+
4. If VIX > 25, bias toward spread selling over directional longs
5. Respect the macro regime: ${marketContext.regime === 'risk_off' ? 'RISK-OFF — be selective on longs' : 'acceptable for directional plays'}

Return JSON array of setups:
[{
  "symbol": "NVDA",
  "setupType": "EMA Breakout + Volume Surge",
  "bias": "bullish",
  "confidence": 8,
  "entryLow": 875,
  "entryHigh": 885,
  "stopLoss": 860,
  "target1": 920,
  "target2": 960,
  "rrRatio": 3.5,
  "ivRank": 42,
  "recommendedTrade": "Buy June 900 calls at $3.20, target $8+",
  "frameworks": ["ema_breakout", "momentum", "options"],
  "analysis": "2-3 sentence thesis",
  "urgency": "today"
}]

Return ONLY the JSON array, no markdown.`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  let setups = [];
  const text = msg.content[0]?.text || '[]';
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    setups = JSON.parse(clean);
    if (!Array.isArray(setups)) setups = [];
  } catch(e) {
    console.error('Parse error:', e.message, 'Text:', text.substring(0, 200));
  }

  const result = {
    setups,
    marketContext,
    patterns: patterns.length,
    generatedAt: new Date().toISOString(),
    cached: false,
    scanDuration: Date.now()
  };

  // Save to shared cache + intelligence loop in parallel (don't await)
  Promise.all([
    saveScanToCache(result),
    recordSetups(setups)
  ]).catch(e => console.warn('Post-scan save error:', e.message));

  return result;
}

// Single symbol analysis
async function analyzeSingle(symbol) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Analyze ${symbol} for options trading RIGHT NOW. Apply EMA stack, RSI, MACD, volume, IV rank. Give concrete entry/stop/target levels and recommended options trade. Be specific with dollar levels.`
    }]
  });
  return { symbol, analysis: msg.content[0]?.text, generatedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = (req.query.type || req.query.action || 'scan').toLowerCase();
  const symbol = req.query.symbol?.toUpperCase();

  try {
    if (type === 'scan') {
      const result = await runFullScan(req);
      // Cache headers: tell Vercel edge to cache for 60s
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.json(result);
    }

    if (type === 'single' && symbol) {
      return res.json(await analyzeSingle(symbol));
    }

    if (type === 'cache_status') {
      const cached = await getCachedScan();
      return res.json({ hasCachedScan: !!cached, cacheAge: cached?.cacheAge, cacheExpiry: cached?.cacheExpiry });
    }

    return res.status(400).json({ error: 'Unknown type. Use: scan, single, cache_status' });
  } catch(e) {
    console.error('Analysis error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
