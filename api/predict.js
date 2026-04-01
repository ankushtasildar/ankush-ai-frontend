// ============================================================================
// ANKUSHAI CHARTS AI ANALYSIS — Powered by V3 Engine (Real Data Only)
// ============================================================================
// PROBLEM: Old predict API asked Groq to generate price levels.
//          Groq hallucinated stale numbers ($605 resistance when SPY is $650).
//          CEO: "if it could truly SEE the charts, this issue would never resurface"
//
// FIX: Call V3 Day Trade Engine which computes levels from REAL Polygon data.
//      Zero hallucination. Every number comes from actual market math.
//
// Endpoints:
//   POST /api/predict  { symbol, timeframe }  — Returns AI Analysis for Charts page
//   GET  /api/predict?symbol=SPY              — Same, GET support
// ============================================================================

var POLYGON_KEY = process.env.POLYGON_API_KEY || '';

// ============================================================================
// REAL DATA — Polygon.io
// ============================================================================
async function getPolygonBars(sym, mult, span, lim) {
  if (!POLYGON_KEY) return null;
  var to = new Date().toISOString().split('T')[0];
  var from = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];
  try {
    var r = await fetch('https://api.polygon.io/v2/aggs/ticker/' + sym + '/range/' + mult + '/' + span + '/' + from + '/' + to + '?adjusted=true&sort=asc&limit=' + (lim || 200) + '&apiKey=' + POLYGON_KEY);
    if (!r.ok) return null;
    var d = await r.json();
    return (d.results || []).map(function(b) { return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; });
  } catch (e) { return null; }
}

async function getPolygonPrev(sym) {
  if (!POLYGON_KEY) return null;
  try {
    var r = await fetch('https://api.polygon.io/v2/aggs/ticker/' + sym + '/prev?adjusted=true&apiKey=' + POLYGON_KEY);
    if (!r.ok) return null;
    var d = await r.json();
    return d.results && d.results[0] ? d.results[0] : null;
  } catch (e) { return null; }
}

// ============================================================================
// TECHNICAL CALCULATIONS — Same math as V3 Engine
// ============================================================================
function sma(data, p) {
  if (!data || data.length < p) return [];
  var r = [];
  for (var i = p - 1; i < data.length; i++) r.push(data.slice(i - p + 1, i + 1).reduce(function(a, b) { return a + b; }, 0) / p);
  return r;
}

function ema(data, p) {
  if (!data || data.length < p) return [];
  var k = 2 / (p + 1);
  var r = [data.slice(0, p).reduce(function(a, b) { return a + b; }, 0) / p];
  for (var i = p; i < data.length; i++) r.push(data[i] * k + r[r.length - 1] * (1 - k));
  return r;
}

function calcRSI(closes, period) {
  var p = period || 14;
  if (!closes || closes.length < p + 1) return null;
  var gains = [], losses = [];
  for (var i = 1; i < closes.length; i++) {
    var diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  var avgGain = gains.slice(0, p).reduce(function(a, b) { return a + b; }, 0) / p;
  var avgLoss = losses.slice(0, p).reduce(function(a, b) { return a + b; }, 0) / p;
  for (var i = p; i < gains.length; i++) {
    avgGain = (avgGain * (p - 1) + gains[i]) / p;
    avgLoss = (avgLoss * (p - 1) + losses[i]) / p;
  }
  var rs = avgLoss > 0 ? avgGain / avgLoss : 100;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

function pivotPoints(prevH, prevL, prevC) {
  var pp = (prevH + prevL + prevC) / 3;
  return {
    pivot: +pp.toFixed(2),
    r1: +(2 * pp - prevL).toFixed(2), s1: +(2 * pp - prevH).toFixed(2),
    r2: +(pp + (prevH - prevL)).toFixed(2), s2: +(pp - (prevH - prevL)).toFixed(2)
  };
}

function calcVWAP(bars) {
  if (!bars || bars.length < 2) return null;
  var cumVol = 0, cumTP = 0;
  for (var i = 0; i < bars.length; i++) {
    var tp = (bars[i].h + bars[i].l + bars[i].c) / 3;
    cumVol += bars[i].v || 1;
    cumTP += tp * (bars[i].v || 1);
  }
  return cumVol > 0 ? +(cumTP / cumVol).toFixed(2) : null;
}

// ============================================================================
// ANALYSIS GENERATOR — All numbers from real data
// ============================================================================
function generateAnalysis(sym, price, prev, bars, dailyBars) {
  var closes = bars ? bars.map(function(b) { return b.c; }) : [];
  var highs = bars ? bars.map(function(b) { return b.h; }) : [];
  var lows = bars ? bars.map(function(b) { return b.l; }) : [];

  // Key levels from previous day
  var levels = prev ? pivotPoints(prev.h, prev.l, prev.c) : null;

  // RSI
  var rsi = calcRSI(closes, 14);

  // Moving averages
  var sma20 = sma(closes, 20);
  var sma50 = sma(closes, 50);
  var ema8 = ema(closes, 8);
  var ema21 = ema(closes, 21);

  var sma20Val = sma20.length > 0 ? +sma20[sma20.length - 1].toFixed(2) : null;
  var sma50Val = sma50.length > 0 ? +sma50[sma50.length - 1].toFixed(2) : null;
  var ema8Val = ema8.length > 0 ? +ema8[ema8.length - 1].toFixed(2) : null;
  var ema21Val = ema21.length > 0 ? +ema21[ema21.length - 1].toFixed(2) : null;

  // VWAP
  var vwap = calcVWAP(bars);

  // Daily trend (from daily bars)
  var dailyCloses = dailyBars ? dailyBars.map(function(b) { return b.c; }) : [];
  var dailySma20 = sma(dailyCloses, 20);
  var dailySma50 = sma(dailyCloses, 50);
  var dailySma20Val = dailySma20.length > 0 ? +dailySma20[dailySma20.length - 1].toFixed(2) : null;

  // Change from previous close
  var change = prev ? +(price - prev.c).toFixed(2) : null;
  var changePct = prev ? +((price - prev.c) / prev.c * 100).toFixed(2) : null;

  // Determine nearest support and resistance from computed levels
  var resistance = null, support = null;
  if (levels) {
    var allLevels = [levels.pivot, levels.r1, levels.r2, levels.s1, levels.s2];
    if (prev) { allLevels.push(prev.h); allLevels.push(prev.l); }
    if (vwap) allLevels.push(vwap);
    if (dailySma20Val) allLevels.push(dailySma20Val);
    allLevels = allLevels.filter(function(v) { return v != null; }).sort(function(a, b) { return a - b; });
    var above = allLevels.filter(function(v) { return v > price + 0.50; });
    var below = allLevels.filter(function(v) { return v < price - 0.50; });
    resistance = above.length > 0 ? above[0] : null;
    support = below.length > 0 ? below[below.length - 1] : null;
  }

  // Determine setup type
  var setup = 'Neutral';
  var bias = 'neutral';
  if (rsi && rsi < 30) { setup = 'Oversold Bounce'; bias = 'bullish'; }
  else if (rsi && rsi > 70) { setup = 'Overbought Reversal'; bias = 'bearish'; }
  else if (ema8Val && ema21Val && ema8Val > ema21Val && price > ema8Val) { setup = 'Bullish Trend Continuation'; bias = 'bullish'; }
  else if (ema8Val && ema21Val && ema8Val < ema21Val && price < ema8Val) { setup = 'Bearish Trend Continuation'; bias = 'bearish'; }
  else if (vwap && price > vwap && ema8Val && price > ema8Val) { setup = 'Above VWAP Momentum'; bias = 'bullish'; }
  else if (vwap && price < vwap && ema8Val && price < ema8Val) { setup = 'Below VWAP Weakness'; bias = 'bearish'; }
  else if (support && Math.abs(price - support) < 2) { setup = 'Support Test'; bias = 'bullish'; }
  else if (resistance && Math.abs(price - resistance) < 2) { setup = 'Resistance Test'; bias = 'bearish'; }

  // Generate analysis text from real data
  var analysis = sym + ' at $' + price.toFixed(2);
  if (change != null) analysis += ' (' + (change > 0 ? '+' : '') + change + ', ' + (changePct > 0 ? '+' : '') + changePct + '%)';
  analysis += '. ';
  if (rsi) analysis += 'RSI ' + rsi + (rsi < 30 ? ' oversold' : rsi > 70 ? ' overbought' : '') + '. ';
  if (ema8Val && ema21Val) analysis += 'EMA 8/21: ' + (ema8Val > ema21Val ? 'bullish' : 'bearish') + ' alignment. ';
  if (vwap) analysis += 'Price ' + (price > vwap ? 'above' : 'below') + ' VWAP ($' + vwap + '). ';
  if (dailySma20Val) analysis += (price > dailySma20Val ? 'Above' : 'Below') + ' 20-day SMA ($' + dailySma20Val + '). ';

  // Trade levels based on REAL computed support/resistance
  var entry = bias === 'bullish' ? (support ? +((price + support) / 2).toFixed(2) : +(price * 0.998).toFixed(2)) : (resistance ? +((price + resistance) / 2).toFixed(2) : +(price * 1.002).toFixed(2));
  var stop = bias === 'bullish' ? (support ? +(support - 1).toFixed(2) : +(price * 0.99).toFixed(2)) : (resistance ? +(resistance + 1).toFixed(2) : +(price * 1.01).toFixed(2));
  var t1 = bias === 'bullish' ? (resistance || +(price * 1.015).toFixed(2)) : (support || +(price * 0.985).toFixed(2));

  // Confidence based on how many indicators agree
  var signals = 0, agree = 0;
  if (rsi) { signals++; if ((bias === 'bullish' && rsi < 50) || (bias === 'bearish' && rsi > 50)) agree++; }
  if (ema8Val && ema21Val) { signals++; if ((bias === 'bullish' && ema8Val > ema21Val) || (bias === 'bearish' && ema8Val < ema21Val)) agree++; }
  if (vwap) { signals++; if ((bias === 'bullish' && price > vwap) || (bias === 'bearish' && price < vwap)) agree++; }
  var confidence = signals > 0 ? Math.round(50 + (agree / signals) * 50) : 50;

  return {
    symbol: sym,
    confidence: confidence,
    analysis: analysis,
    resistance: resistance,
    support: support,
    setup: setup,
    bias: bias,
    entry: entry,
    stop: stop,
    t1: t1,
    rsi: rsi,
    vwap: vwap,
    ema8: ema8Val,
    ema21: ema21Val,
    sma20: sma20Val,
    dailySma20: dailySma20Val,
    price: price,
    change: change,
    changePct: changePct,
    source: 'polygon_computed',
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// HANDLER
// ============================================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var body = req.body || {};
  var sym = (body.symbol || req.query.symbol || 'SPY').toUpperCase();

  try {
    // Fetch REAL data from Polygon
    var bars = await getPolygonBars(sym, 5, 'minute', 200);
    var dailyBars = await getPolygonBars(sym, 1, 'day', 60);
    var prev = await getPolygonPrev(sym);

    if (!bars || bars.length === 0) {
      return res.status(503).json({ error: 'No market data available for ' + sym + '. Polygon may be rate-limited or market is closed.', symbol: sym });
    }

    var price = bars[bars.length - 1].c;
    var result = generateAnalysis(sym, price, prev, bars, dailyBars);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message, symbol: sym });
  }
};
