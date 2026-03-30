// predict.js — Alpha Intelligence Engine v5
// CLEAN REWRITE — no patches, no accumulated fragments
// Uses calendar dates (not tradingDate), proper error handling

const Anthropic = require('@anthropic-ai/sdk');

const POLY = process.env.POLYGON_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// ── Helper: Supabase REST ──
async function supaGet(table, query) {
  if (!SUPA_URL || !SUPA_KEY) return [];
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/' + table + '?' + query, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

async function supaInsert(table, row) {
  if (!SUPA_URL || !SUPA_KEY) return;
  try {
    await fetch(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });
  } catch {}
}

// ── Helper: Polygon fetch ──
async function polyFetch(url) {
  if (!POLY) return null;
  try {
    const sep = url.includes('?') ? '&' : '?';
    const r = await fetch(url + sep + 'apiKey=' + POLY);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── GET PRICE DATA — uses calendar dates, NEVER fails on weekends ──
async function getPriceData(symbol) {
  // Use simple calendar dates — Polygon automatically skips non-trading days
  const now = new Date();
  const to = now.toISOString().split('T')[0]; // today YYYY-MM-DD
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 150); // 150 calendar days = ~100 trading days
  const from = fromDate.toISOString().split('T')[0];

  // Fetch daily bars
  const aggs = await polyFetch(
    'https://api.polygon.io/v2/aggs/ticker/' + symbol + '/range/1/day/' + from + '/' + to + '?adjusted=true&sort=asc&limit=200'
  );

  const bars = aggs && aggs.results && aggs.results.length > 0 ? aggs.results : null;

  if (!bars || bars.length < 5) {
    // Fallback: try prev endpoint which always works
    const prev = await polyFetch('https://api.polygon.io/v2/aggs/ticker/' + symbol + '/prev');
    if (prev && prev.results && prev.results.length > 0) {
      const p = prev.results[0];
      return {
        currentPrice: p.c,
        bars: [{ t: p.t, o: p.o, h: p.h, l: p.l, c: p.c, v: p.v }],
        source: 'polygon-prev'
      };
    }
    return null; // truly no data
  }

  return {
    currentPrice: bars[bars.length - 1].c,
    bars: bars,
    source: 'polygon-aggs'
  };
}

// ── COMPUTE TECHNICALS from bars ──
function computeTechnicals(bars) {
  if (!bars || bars.length < 20) return {};
  const closes = bars.map(b => b.c);
  const n = closes.length;
  const last = closes[n - 1];

  // EMAs
  function ema(data, period) {
    const k = 2 / (period + 1);
    let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) val = data[i] * k + val * (1 - k);
    return val;
  }

  // RSI
  function rsi(data, period) {
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const d = data[i] - data[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - 100 / (1 + rs);
  }

  // ATR
  function atr(bars14) {
    let sum = 0;
    for (let i = 1; i < bars14.length; i++) {
      const tr = Math.max(bars14[i].h - bars14[i].l, Math.abs(bars14[i].h - bars14[i - 1].c), Math.abs(bars14[i].l - bars14[i - 1].c));
      sum += tr;
    }
    return sum / (bars14.length - 1);
  }

  const ema8 = ema(closes, 8);
  const ema21 = ema(closes, 21);
  const ema50 = n >= 50 ? ema(closes, 50) : null;
  const ema200 = n >= 200 ? ema(closes, 200) : null;
  const rsi14 = n >= 15 ? rsi(closes, 14) : null;
  const atr14 = bars.length >= 15 ? atr(bars.slice(-15)) : null;

  // Rate of change
  const roc = (period) => n > period ? ((last - closes[n - 1 - period]) / closes[n - 1 - period] * 100) : null;

  // Volume trend
  const vol5 = bars.slice(-5).reduce((a, b) => a + b.v, 0) / 5;
  const vol20 = bars.slice(-20).reduce((a, b) => a + b.v, 0) / Math.min(20, bars.length);

  // 52-week high/low
  const highs = bars.map(b => b.h);
  const lows = bars.map(b => b.l);
  const high52 = Math.max(...highs);
  const low52 = Math.min(...lows);

  return {
    price: last,
    ema8, ema21, ema50, ema200,
    rsi14,
    atr14,
    roc1d: roc(1), roc5d: roc(5), roc10d: roc(10), roc20d: roc(20),
    volumeTrend: vol5 / vol20,
    high52w: high52, low52w: low52,
    drawdownFromHigh: ((last - high52) / high52 * 100),
    bullStack: last > ema8 && ema8 > ema21 && (ema50 === null || ema21 > ema50),
    bearStack: last < ema8 && ema8 < ema21 && (ema50 === null || ema21 < ema50)
  };
}

// ── GET MACRO CONTEXT ──
async function getMacroContext() {
  // SPY for market direction, VIX for fear
  const [spyData, vixPrev] = await Promise.all([
    getPriceData('SPY'),
    polyFetch('https://api.polygon.io/v2/aggs/ticker/VIX/prev')
  ]);
  const vix = vixPrev && vixPrev.results && vixPrev.results[0] ? vixPrev.results[0].c : null;
  const spyPrice = spyData ? spyData.currentPrice : null;
  const spyTech = spyData && spyData.bars ? computeTechnicals(spyData.bars) : {};

  // Upcoming events from Supabase
  const events = await supaGet('macro_events', 'event_date=gte.' + new Date().toISOString().split('T')[0] + '&order=event_date.asc&limit=5');

  return {
    spy: spyPrice, spyRoc5d: spyTech.roc5d, spyRoc20d: spyTech.roc20d,
    vix: vix,
    regime: vix > 30 ? 'high_fear' : vix > 20 ? 'elevated' : 'low_vol',
    upcomingEvents: events.map(e => e.title + ' ' + e.event_date).join('; ')
  };
}

// ── GET HISTORICAL EDGE (learned patterns) ──
async function getHistoricalEdge(symbol) {
  const patterns = await supaGet('ai_learned_patterns', 'order=win_rate.desc&limit=5');
  const setupHistory = await supaGet('setup_records', 'symbol=eq.' + symbol + '&order=created_at.desc&limit=10');
  const total = setupHistory.length;
  const wins = setupHistory.filter(s => s.thesis_validated === true).length;
  return {
    patterns: patterns.map(p => p.pattern_name + ' (win:' + (p.win_rate || 0) + '%)').join(', '),
    winRate: total > 0 ? Math.round(wins / total * 100) : null,
    total: total,
    recentOutcomes: setupHistory.slice(0, 5).map(s => s.symbol + ':' + (s.thesis_validated ? 'W' : s.thesis_validated === false ? 'L' : '?')).join(', ')
  };
}

// ── GET EARNINGS CONTEXT ──
async function getEarningsContext(symbol) {
  const today = new Date().toISOString().split('T')[0];
  const future = new Date();
  future.setDate(future.getDate() + 90);
  const futureStr = future.toISOString().split('T')[0];
  const events = await supaGet('macro_events', 'event_type=eq.earnings&symbol=eq.' + symbol + '&event_date=gte.' + today + '&event_date=lte.' + futureStr + '&order=event_date.asc&limit=1');
  if (events.length > 0) {
    const daysOut = Math.ceil((new Date(events[0].event_date) - new Date()) / 86400000);
    return { earningsDate: events[0].event_date, earningsDaysOut: daysOut };
  }
  return { earningsDate: null, earningsDaysOut: null };
}

// ── BUILD THE ALPHA PROMPT ──
function buildAlphaPrompt(symbol, priceData, technicals, macro, edge, earnings, style) {
  const styleContext = style === 'daytrade' ? 'Focus on INTRADAY setups (0-2 days). Gamma risk, IV crush, delta decay matter enormously.'
    : style === 'leap' ? 'Focus on LONG-TERM setups (3-12 months). Fundamental catalysts, macro regime shifts, LEAPS premium decay.'
    : 'Focus on SWING setups (3 days to 9 months). Earnings cycles, sector rotation, technical breakout/breakdown patterns.';

  const earningsStr = earnings.earningsDaysOut ? 'UPCOMING EARNINGS: ' + earnings.earningsDaysOut + ' days out (' + earnings.earningsDate + ') - HIGH-ALPHA WINDOW. Factor this into time horizon and IV expectations.' : 'No imminent earnings.';

  return 'You are Marcus Webb, a senior institutional VP with 20 years at Goldman Sachs and Two Sigma. You provide LEADING indicators, not lagging confirmation. Your analysis must be forward-looking.\n\n'
    + 'SYMBOL: ' + symbol + '\n'
    + 'REAL PRICE: $' + (priceData.currentPrice || 0).toFixed(2) + '\n'
    + 'SOURCE: ' + (priceData.source || 'unknown') + '\n\n'
    + 'TECHNICALS:\n'
    + 'EMA8: ' + (technicals.ema8 || 0).toFixed(2) + ' | EMA21: ' + (technicals.ema21 || 0).toFixed(2)
    + (technicals.ema50 ? ' | EMA50: ' + technicals.ema50.toFixed(2) : '') + '\n'
    + 'RSI(14): ' + (technicals.rsi14 || 0).toFixed(1) + '\n'
    + 'ATR(14): ' + (technicals.atr14 || 0).toFixed(2) + '\n'
    + 'ROC 1d:' + (technicals.roc1d || 0).toFixed(2) + '% 5d:' + (technicals.roc5d || 0).toFixed(2) + '% 20d:' + (technicals.roc20d || 0).toFixed(2) + '%\n'
    + 'Stack: ' + (technicals.bullStack ? 'BULLISH' : technicals.bearStack ? 'BEARISH' : 'MIXED') + '\n'
    + 'Volume trend (5d/20d): ' + (technicals.volumeTrend || 0).toFixed(2) + 'x\n'
    + '52w High: ' + (technicals.high52w || 0).toFixed(2) + ' | Low: ' + (technicals.low52w || 0).toFixed(2) + ' | Drawdown: ' + (technicals.drawdownFromHigh || 0).toFixed(1) + '%\n\n'
    + 'MACRO: SPY $' + (macro.spy || 0).toFixed(2) + ' (5d:' + (macro.spyRoc5d || 0).toFixed(1) + '% 20d:' + (macro.spyRoc20d || 0).toFixed(1) + '%) | VIX: ' + (macro.vix || 0).toFixed(1) + ' (' + macro.regime + ')\n'
    + 'Events: ' + (macro.upcomingEvents || 'none') + '\n\n'
    + earningsStr + '\n\n'
    + 'HISTORICAL EDGE: ' + (edge.patterns || 'no patterns yet') + '\n'
    + 'Win rate on ' + symbol + ': ' + (edge.winRate !== null ? edge.winRate + '%' : 'N/A') + ' (' + edge.total + ' predictions)\n'
    + 'Recent: ' + (edge.recentOutcomes || 'none') + '\n\n'
    + 'TRADE STYLE: ' + (style || 'swing') + '\n' + styleContext + '\n\n'
    + 'Respond ONLY with valid JSON:\n'
    + '{"sentiment":{"overall":"bullish|bearish|neutral","confidence":0-100,"timeframe":"short|medium|long"},'
    + '"leadingThesis":"2-3 sentence FORWARD-LOOKING thesis",'
    + '"institutionalEdge":"what smart money sees that retail misses",'
    + '"scenarios":[{"name":"Primary Alpha Play","probability":0-100,"target":0.00,"timeframe":"Xd-Yd","whatToWatch":"...","positionStrategy":"specific options or equity strategy"},'
    + '{"name":"Base Case","probability":0-100,"target":0.00,"timeframe":"..."},'
    + '{"name":"Bear/Hedge Case","probability":0-100,"target":0.00,"timeframe":"...","hedgeStrategy":"..."}],'
    + '"institutionalLevels":{"accumulation":0.00,"distribution":0.00,"breakoutAbove":0.00,"breakdownBelow":0.00},'
    + '"optionsAlpha":{"ivEnvironment":"low|moderate|high","recommendedStrategy":"...","strikeSelection":"...","expiryGuidance":"...","maxRiskPercent":0,"exitRules":"..."},'
    + '"sectorRotation":{"signal":"...","relativeStrength":"..."},'
    + '"riskFactors":["..."],'
    + '"edgeScore":0-100}';
}

// ── MAIN HANDLER ──
module.exports = async function handler(req, res) {
  const symbol = (req.query.symbol || 'SPY').toUpperCase();
  const style = req.query.style || 'swing';

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // Fetch all data in parallel
    const [priceData, macro, edge, earnings] = await Promise.all([
      getPriceData(symbol),
      getMacroContext(),
      getHistoricalEdge(symbol),
      getEarningsContext(symbol)
    ]);

    if (!priceData) {
      return res.status(503).json({
        error: 'No market data available for ' + symbol,
        suggestion: 'Market may be closed. Try again during trading hours or check if the ticker symbol is correct.'
      });
    }

    const technicals = priceData.bars ? computeTechnicals(priceData.bars) : {};
    const prompt = buildAlphaPrompt(symbol, priceData, technicals, macro, edge, earnings, style);

    // Call Claude
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'You are Marcus Webb, ex-Goldman Sachs Strats and Two Sigma. 20 years institutional experience. Your analysis uses LEADING indicators, not lagging. All price levels MUST be derived from the real data provided. Never invent prices. Respond ONLY with valid JSON, no markdown, no preamble.',
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = msg.content[0].text;

    // Parse JSON - handle potential wrapping
    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      // Try extracting JSON from text
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
      } else {
        return res.status(500).json({ error: 'Failed to parse AI response', raw: raw.substring(0, 200) });
      }
    }

    // Save to setup_records for backtesting
    supaInsert('setup_records', {
      symbol: symbol,
      name: symbol + ' Alpha Prediction',
      setup_type: 'alpha_prediction',
      computed_bias: analysis.sentiment ? analysis.sentiment.overall : 'neutral',
      confidence: analysis.sentiment ? analysis.sentiment.confidence : null,
      price_at_generation: priceData.currentPrice,
      engine_version: 'v5'
    }).catch(function() {});

    return res.json({
      symbol: symbol,
      currentPrice: priceData.currentPrice,
      priceSource: priceData.source,
      barsUsed: priceData.bars ? priceData.bars.length : 0,
      style: style,
      ...analysis,
      historicalEdge: edge,
      earningsContext: earnings,
      macroContext: { vix: macro.vix, regime: macro.regime, spyPrice: macro.spy },
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('[predict] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
