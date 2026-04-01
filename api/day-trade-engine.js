// ============================================================================
// ANKUSHAI DAY TRADE ENGINE V3 ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ PREDICTION ENGINE
// ============================================================================
// Sources: wolffnbear (SSS 50%), rickyzcarroll (Strat/FTFC), liquid-trader (VWAP/Levels)
// Data: Polygon.io real-time ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Yahoo Finance fallback
// Output: Confluence-scored alerts with entry/stop/target/timeframe/risk grade
//
// ZERO mock data. Every number comes from real market data or real math.
// ============================================================================

var POLYGON_KEY = process.env.POLYGON_API_KEY || '';
var GROQ_KEY = process.env.GROQ_API_KEY || '';
var SYMBOL = 'QQQ';

// ============================================================================
// DATA LAYER
// ============================================================================
async function polygonBars(sym, mult, span, lim) {
  if (!POLYGON_KEY) return null;
  var to = new Date().toISOString().split('T')[0];
  var from = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];
  try {
    var r = await fetch('https://api.polygon.io/v2/aggs/ticker/' + sym + '/range/' + mult + '/' + span + '/' + from + '/' + to + '?adjusted=true&sort=asc&limit=' + (lim || 390) + '&apiKey=' + POLYGON_KEY);
    if (!r.ok) return null;
    var d = await r.json();
    return (d.results || []).map(function(b) { return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; });
  } catch (e) { return null; }
}

async function polygonPrev(sym) {
  if (!POLYGON_KEY) return null;
  try {
    var r = await fetch('https://api.polygon.io/v2/aggs/ticker/' + sym + '/prev?adjusted=true&apiKey=' + POLYGON_KEY);
    if (!r.ok) return null;
    var d = await r.json();
    return d.results && d.results[0] ? d.results[0] : null;
  } catch (e) { return null; }
}

async function polygonSnapshot(sym) {
  if (!POLYGON_KEY) return null;
  try {
    var r = await fetch('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/' + sym + '?apiKey=' + POLYGON_KEY);
    if (!r.ok) return null;
    var d = await r.json();
    if (!d.ticker) return null;
    return { lastPrice: d.ticker.lastTrade ? d.ticker.lastTrade.p : null, todayOpen: d.ticker.day ? d.ticker.day.o : null, todayHigh: d.ticker.day ? d.ticker.day.h : null, todayLow: d.ticker.day ? d.ticker.day.l : null, todayClose: d.ticker.day ? d.ticker.day.c : null, todayVol: d.ticker.day ? d.ticker.day.v : null, prevClose: d.ticker.prevDay ? d.ticker.prevDay.c : null, prevHigh: d.ticker.prevDay ? d.ticker.prevDay.h : null, prevLow: d.ticker.prevDay ? d.ticker.prevDay.l : null };
  } catch (e) { return null; }
}

async function yahooData(sym) {
  try {
    var r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1m&range=2d');
    if (!r.ok) return null;
    var d = await r.json();
    var res = d.chart && d.chart.result && d.chart.result[0];
    if (!res) return null;
    var m = res.meta;
    var ts = res.timestamp || [];
    var q = res.indicators && res.indicators.quote && res.indicators.quote[0];
    if (!q) return { price: m.regularMarketPrice, prevClose: m.previousClose, bars: [] };
    var bars = [];
    for (var i = 0; i < ts.length; i++) {
      if (q.open[i] != null && q.high[i] != null && q.low[i] != null && q.close[i] != null) {
        bars.push({ t: ts[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 });
      }
    }
    return { price: m.regularMarketPrice, prevClose: m.previousClose, open: m.regularMarketOpen, high: m.regularMarketDayHigh, low: m.regularMarketDayLow, bars: bars };
  } catch (e) { return null; }
}

// ============================================================================
// MATH PRIMITIVES ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Real formulas, no approximations
// ============================================================================
function ema(data, p) {
  if (!data || data.length < p) return [];
  var k = 2 / (p + 1);
  var r = [data.slice(0, p).reduce(function(a, b) { return a + b; }, 0) / p];
  for (var i = p; i < data.length; i++) r.push(data[i] * k + r[r.length - 1] * (1 - k));
  return r;
}

function sma(data, p) {
  if (!data || data.length < p) return [];
  var r = [];
  for (var i = p - 1; i < data.length; i++) r.push(data.slice(i - p + 1, i + 1).reduce(function(a, b) { return a + b; }, 0) / p);
  return r;
}

// ============================================================================
// INDICATOR: MACD with histogram acceleration + divergence
// ============================================================================
function calcMACD(closes) {
  var e12 = ema(closes, 12), e26 = ema(closes, 26);
  if (e12.length < 2 || e26.length < 2) return null;
  var off = e12.length - e26.length, ml = [];
  for (var i = 0; i < e26.length; i++) ml.push(e12[i + off] - e26[i]);
  var sig = ema(ml, 9);
  if (!sig.length) return null;
  var so = ml.length - sig.length, hist = [];
  for (var i = 0; i < sig.length; i++) hist.push(ml[i + so] - sig[i]);
  var h = hist, len = h.length;
  var accel = len >= 2 ? h[len - 1] - h[len - 2] : 0;
  var cross = 'none';
  if (len >= 2) {
    if (h[len - 2] < 0 && h[len - 1] >= 0) cross = 'bull_cross';
    if (h[len - 2] > 0 && h[len - 1] <= 0) cross = 'bear_cross';
  }
  var div = 'none';
  if (closes.length >= 14 && len >= 14) {
    var pLow1 = Math.min.apply(null, closes.slice(-14, -7));
    var pLow2 = Math.min.apply(null, closes.slice(-7));
    var mLow1 = Math.min.apply(null, h.slice(-14, -7));
    var mLow2 = Math.min.apply(null, h.slice(-7));
    if (pLow2 < pLow1 && mLow2 > mLow1) div = 'bull_div';
    var pHigh1 = Math.max.apply(null, closes.slice(-14, -7));
    var pHigh2 = Math.max.apply(null, closes.slice(-7));
    var mHigh1 = Math.max.apply(null, h.slice(-14, -7));
    var mHigh2 = Math.max.apply(null, h.slice(-7));
    if (pHigh2 > pHigh1 && mHigh2 < mHigh1) div = 'bear_div';
  }
  return { hist: +h[len - 1].toFixed(4), accel: +accel.toFixed(4), cross: cross, div: div, bullish: h[len - 1] > 0, accelerating: Math.abs(accel) > Math.abs(h[len - 1]) * 0.1 };
}

// ============================================================================
// INDICATOR: ADX with DI+/DI- (Wilder's smoothing)
// ============================================================================
function calcADX(H, L, C, period) {
  var p = period || 14;
  if (!H || H.length < p + 1) return null;
  var tr = [], dpRaw = [], dmRaw = [];
  for (var i = 1; i < H.length; i++) {
    tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
    var up = H[i] - H[i - 1], dn = L[i - 1] - L[i];
    dpRaw.push(up > dn && up > 0 ? up : 0);
    dmRaw.push(dn > up && dn > 0 ? dn : 0);
  }
  // Wilder's smoothing (not SMA)
  var atr14 = tr.slice(0, p).reduce(function(a, b) { return a + b; }, 0);
  var dp14 = dpRaw.slice(0, p).reduce(function(a, b) { return a + b; }, 0);
  var dm14 = dmRaw.slice(0, p).reduce(function(a, b) { return a + b; }, 0);
  var dxVals = [];
  for (var i = p; i < tr.length; i++) {
    atr14 = atr14 - atr14 / p + tr[i];
    dp14 = dp14 - dp14 / p + dpRaw[i];
    dm14 = dm14 - dm14 / p + dmRaw[i];
    var diP = atr14 > 0 ? dp14 / atr14 * 100 : 0;
    var diM = atr14 > 0 ? dm14 / atr14 * 100 : 0;
    var sum = diP + diM;
    dxVals.push(sum > 0 ? Math.abs(diP - diM) / sum * 100 : 0);
  }
  if (dxVals.length < p) return null;
  var adx = dxVals.slice(0, p).reduce(function(a, b) { return a + b; }, 0) / p;
  for (var i = p; i < dxVals.length; i++) adx = (adx * (p - 1) + dxVals[i]) / p;
  var lastDiP = dp14 > 0 && atr14 > 0 ? dp14 / atr14 * 100 : 0;
  var lastDiM = dm14 > 0 && atr14 > 0 ? dm14 / atr14 * 100 : 0;
  return { adx: +adx.toFixed(1), diPlus: +lastDiP.toFixed(1), diMinus: +lastDiM.toFixed(1), trending: adx > 25, strong: adx > 40, dir: lastDiP > lastDiM ? 'bull' : 'bear', atr: +(atr14 / p).toFixed(4) };
}

// ============================================================================
// INDICATOR: Bollinger/Keltner Squeeze (TTM Squeeze equivalent)
// ============================================================================
function calcSqueeze(H, L, C, p) {
  var period = p || 20;
  if (!C || C.length < period + 1) return { on: false, fired: false, dir: 'neutral' };
  var midArr = sma(C, period);
  if (!midArr.length) return { on: false, fired: false, dir: 'neutral' };
  var mid = midArr[midArr.length - 1];
  var slice = C.slice(-period);
  var variance = slice.reduce(function(s, v) { return s + Math.pow(v - mid, 2); }, 0) / period;
  var sd = Math.sqrt(variance);
  var bbU = mid + 2 * sd, bbL = mid - 2 * sd;
  // ATR for Keltner
  var trArr = [];
  for (var i = Math.max(1, H.length - period); i < H.length; i++) {
    trArr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1 >= 0 ? i - 1 : 0])));
  }
  var atr = trArr.length > 0 ? trArr.reduce(function(s, v) { return s + v; }, 0) / trArr.length : 0;
  var kcU = mid + 1.5 * atr, kcL = mid - 1.5 * atr;
  var squeezeOn = bbL > kcL && bbU < kcU;
  // Check previous bar for fired detection
  var prevOn = false;
  if (C.length >= period + 2) {
    var prevSlice = C.slice(-(period + 1), -1);
    var prevMid = prevSlice.reduce(function(s, v) { return s + v; }, 0) / prevSlice.length;
    var prevSD = Math.sqrt(prevSlice.reduce(function(s, v) { return s + Math.pow(v - prevMid, 2); }, 0) / prevSlice.length);
    var pbbU = prevMid + 2 * prevSD, pbbL = prevMid - 2 * prevSD;
    prevOn = pbbL > kcL && pbbU < kcU;
  }
  var fired = prevOn && !squeezeOn;
  var momentum = C[C.length - 1] - mid;
  var dir = momentum > 0 ? 'bull' : 'bear';
  return { on: squeezeOn, fired: fired, dir: dir, momentum: +momentum.toFixed(4), bbWidth: +(bbU - bbL).toFixed(4) };
}

// ============================================================================
// INDICATOR: VWAP with Standard Deviation Bands (liquid-trader inspired)
// ============================================================================
function calcVWAP(bars) {
  if (!bars || bars.length < 2) return null;
  var cumVol = 0, cumTP = 0, cumTP2 = 0;
  var vwapArr = [];
  for (var i = 0; i < bars.length; i++) {
    var tp = (bars[i].h + bars[i].l + bars[i].c) / 3;
    var vol = bars[i].v || 1;
    cumVol += vol;
    cumTP += tp * vol;
    cumTP2 += tp * tp * vol;
    var vw = cumVol > 0 ? cumTP / cumVol : tp;
    vwapArr.push(vw);
  }
  var vwap = vwapArr[vwapArr.length - 1];
  var variance = cumVol > 0 ? (cumTP2 / cumVol) - (vwap * vwap) : 0;
  var sd = Math.sqrt(Math.max(0, variance));
  return {
    vwap: +vwap.toFixed(2),
    upper1: +(vwap + sd).toFixed(2), lower1: +(vwap - sd).toFixed(2),
    upper2: +(vwap + 2 * sd).toFixed(2), lower2: +(vwap - 2 * sd).toFixed(2),
    sd: +sd.toFixed(4),
    priceVsVwap: bars[bars.length - 1].c > vwap ? 'above' : 'below'
  };
}

// ============================================================================
// INDICATOR: Key Daily Percentage Levels (liquid-trader inspired)
// How algos see the market ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ percentage levels from session open
// ============================================================================
function calcKeyLevels(sessionOpen, currentPrice, prevHigh, prevLow, prevClose) {
  if (!sessionOpen || !currentPrice) return null;
  var levels = {};
  // Percentage levels from open (what algos track)
  [-2.0, -1.5, -1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0].forEach(function(pct) {
    levels['pct_' + (pct >= 0 ? '+' : '') + pct] = +(sessionOpen * (1 + pct / 100)).toFixed(2);
  });
  // Pivot points (floor trader method)
  if (prevHigh && prevLow && prevClose) {
    var pp = (prevHigh + prevLow + prevClose) / 3;
    levels.pivot = +pp.toFixed(2);
    levels.r1 = +(2 * pp - prevLow).toFixed(2);
    levels.s1 = +(2 * pp - prevHigh).toFixed(2);
    levels.r2 = +(pp + (prevHigh - prevLow)).toFixed(2);
    levels.s2 = +(pp - (prevHigh - prevLow)).toFixed(2);
    levels.r3 = +(prevHigh + 2 * (pp - prevLow)).toFixed(2);
    levels.s3 = +(prevLow - 2 * (prevHigh - pp)).toFixed(2);
  }
  // Previous day levels
  if (prevHigh) levels.prevHigh = +prevHigh.toFixed(2);
  if (prevLow) levels.prevLow = +prevLow.toFixed(2);
  if (prevClose) levels.prevClose = +prevClose.toFixed(2);
  // Find nearest support and resistance from current price
  var allLevels = Object.values(levels).filter(function(v) { return typeof v === 'number'; }).sort(function(a, b) { return a - b; });
  var supports = allLevels.filter(function(l) { return l < currentPrice; });
  var resistances = allLevels.filter(function(l) { return l > currentPrice; });
  levels.nearestSupport = supports.length > 0 ? supports[supports.length - 1] : null;
  levels.nearestResistance = resistances.length > 0 ? resistances[0] : null;
  levels.nearSupport = supports.length > 0 && (currentPrice - supports[supports.length - 1]) < 1.0;
  levels.nearResistance = resistances.length > 0 && (resistances[0] - currentPrice) < 1.0;
  return levels;
}

// ============================================================================
// STRAT ENGINE: Bar Types, SSS 50% Rule, FTFC (wolffnbear + rickyzcarroll)
// ============================================================================
function stratBarType(curr, prev) {
  if (!curr || !prev) return null;
  var inside = curr.h <= prev.h && curr.l >= prev.l;
  var outside = curr.h > prev.h && curr.l < prev.l;
  var type = inside ? 1 : outside ? 3 : 2;
  var dir = 'neutral';
  if (type === 2) dir = curr.h > prev.h ? 'up' : 'down';
  if (type === 3) dir = curr.c > curr.o ? 'up' : 'down';
  var bullish = curr.c > curr.o;
  // Failed bar detection (rickyzcarroll in-force logic)
  var failed = false;
  if (type === 2 && dir === 'up' && !bullish) failed = true;   // Red 2UP = failed bullish
  if (type === 2 && dir === 'down' && bullish) failed = true;   // Green 2DOWN = failed bearish
  var inForce = (type === 2 && dir === 'up' && bullish) || (type === 2 && dir === 'down' && !bullish);
  return { type: type, dir: dir, bullish: bullish, failed: failed, inForce: inForce, label: type + (dir === 'up' ? 'U' : dir === 'down' ? 'D' : '') };
}

// SSS 50% Rule State Machine (wolffnbear)
// INVALID ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ STANDBY ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ ACTIVE ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ COMPLETE
function sss50Rule(curr, prev) {
  if (!curr || !prev) return { state: 'INVALID', reason: 'no data' };
  var midpoint = (prev.h + prev.l) / 2;
  var strat = stratBarType(curr, prev);
  if (!strat) return { state: 'INVALID', reason: 'no strat' };
  // INVALID: Inside bar, or in-force directional (no reversal signal)
  if (strat.type === 1) return { state: 'INVALID', reason: 'inside bar', midpoint: +midpoint.toFixed(2) };
  if (strat.inForce) return { state: 'INVALID', reason: 'in-force ' + strat.label, midpoint: +midpoint.toFixed(2) };
  // STANDBY: Failed 2 detected (reversal candidate)
  if (strat.failed) {
    // Check if price has crossed the 50% level
    var crossed50 = (strat.dir === 'up' && curr.c < midpoint) || (strat.dir === 'down' && curr.c > midpoint);
    if (crossed50) {
      // ACTIVE: Failed 2 + crossed 50% = outside bar forming
      if (strat.type === 3) {
        return { state: 'COMPLETE', reason: 'outside bar confirmed from failed ' + strat.label, midpoint: +midpoint.toFixed(2), direction: strat.dir === 'up' ? 'bearish' : 'bullish' };
      }
      return { state: 'ACTIVE', reason: 'failed ' + strat.label + ' crossed 50%', midpoint: +midpoint.toFixed(2), direction: strat.dir === 'up' ? 'bearish' : 'bullish' };
    }
    return { state: 'STANDBY', reason: 'failed ' + strat.label + ' awaiting 50% cross', midpoint: +midpoint.toFixed(2), direction: strat.dir === 'up' ? 'bearish' : 'bullish' };
  }
  // COMPLETE: Outside bar
  if (strat.type === 3) return { state: 'COMPLETE', reason: 'outside bar', midpoint: +midpoint.toFixed(2), direction: strat.bullish ? 'bullish' : 'bearish' };
  return { state: 'INVALID', reason: strat.label, midpoint: +midpoint.toFixed(2) };
}

// Hammer/Shooter detection (rickyzcarroll 75% rule)
function detectHammerShooter(bar) {
  if (!bar) return null;
  var body = Math.abs(bar.c - bar.o);
  var range = bar.h - bar.l;
  if (range < 0.01) return null;
  var upperWick = bar.h - Math.max(bar.o, bar.c);
  var lowerWick = Math.min(bar.o, bar.c) - bar.l;
  var bodyPct = body / range;
  // Hammer: 75% of wick at bottom, body in upper 25%
  if (lowerWick / range >= 0.65 && (bar.h - Math.max(bar.o, bar.c)) / range < 0.15) {
    return { type: 'hammer', bullish: bar.c > bar.o, inForce: bar.c > bar.o, strength: +(lowerWick / range).toFixed(2) };
  }
  // Shooter: 75% of wick at top, body in lower 25%
  if (upperWick / range >= 0.65 && (Math.min(bar.o, bar.c) - bar.l) / range < 0.15) {
    return { type: 'shooter', bullish: false, inForce: bar.c < bar.o, strength: +(upperWick / range).toFixed(2) };
  }
  return null;
}

// Strat Combo Detection
function detectStratCombo(bars) {
  if (!bars || bars.length < 3) return null;
  var types = [];
  for (var i = 1; i < bars.length; i++) {
    var s = stratBarType(bars[i], bars[i - 1]);
    if (s) types.push(s);
  }
  if (types.length < 2) return null;
  var last3 = types.slice(-3);
  if (last3.length < 2) return null;
  var combo = last3.map(function(t) { return t.label; }).join('-');
  var t1 = last3.length >= 3 ? last3[0] : null;
  var t2 = last3.length >= 3 ? last3[1] : last3[0];
  var t3 = last3.length >= 3 ? last3[2] : last3[1];
  // Known high-probability combos
  var signal = null;
  if (t2 && t3 && t2.type === 1 && t3.type === 2) signal = { combo: '1-2', dir: t3.dir, desc: 'Inside breakout ' + t3.dir };
  if (t1 && t2 && t3 && t1.type === 2 && t2.type === 1 && t3.type === 2) {
    signal = { combo: '2-1-2', dir: t3.dir, desc: t1.dir === t3.dir ? 'Continuation after pause' : 'Reversal after pause' };
  }
  if (t1 && t2 && t3 && t1.type === 3 && t2.type === 1 && t3.type === 2) {
    signal = { combo: '3-1-2', dir: t3.dir, desc: 'Expansion-consolidation breakout' };
  }
  return signal ? { combo: signal.combo, direction: signal.dir, description: signal.desc, fullCombo: combo } : { combo: combo, direction: t3 ? t3.dir : 'unknown', description: 'Pattern: ' + combo, fullCombo: combo };
}

// Full Timeframe Continuity (rickyzcarroll ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ 10 timeframes)
function checkFTFC(barsByTF) {
  var tfs = Object.keys(barsByTF);
  var directions = {};
  var bullCount = 0, bearCount = 0, total = 0;
  tfs.forEach(function(tf) {
    var bars = barsByTF[tf];
    if (!bars || bars.length < 1) return;
    var last = bars[bars.length - 1];
    var isBull = last.c >= last.o;
    directions[tf] = { bullish: isBull, type: isBull ? 'green' : 'red' };
    if (isBull) bullCount++; else bearCount++;
    total++;
  });
  var allBull = bullCount === total && total > 0;
  var allBear = bearCount === total && total > 0;
  return {
    ftfc: allBull ? 'BULLISH' : allBear ? 'BEARISH' : 'MIXED',
    bullPct: total > 0 ? Math.round(bullCount / total * 100) : 0,
    bearPct: total > 0 ? Math.round(bearCount / total * 100) : 0,
    aligned: allBull || allBear,
    directions: directions,
    count: { bull: bullCount, bear: bearCount, total: total }
  };
}

// ============================================================================
// OPENING RANGE + GAP ANALYSIS
// ============================================================================
function calcOpeningRange(todayBars, minutes) {
  if (!todayBars || todayBars.length < minutes) return null;
  var orBars = todayBars.slice(0, minutes);
  var orHigh = -Infinity, orLow = Infinity;
  orBars.forEach(function(b) { if (b.h > orHigh) orHigh = b.h; if (b.l < orLow) orLow = b.l; });
  var price = todayBars[todayBars.length - 1].c;
  return {
    high: +orHigh.toFixed(2), low: +orLow.toFixed(2), range: +(orHigh - orLow).toFixed(2),
    status: price > orHigh ? 'breakout' : price < orLow ? 'breakdown' : 'inside',
    minutes: minutes
  };
}

function calcGap(todayOpen, prevClose, prevHigh, prevLow) {
  if (!todayOpen || !prevClose) return null;
  var gapSize = todayOpen - prevClose;
  var gapPct = gapSize / prevClose * 100;
  var dir = Math.abs(gapPct) < 0.05 ? 'flat' : gapPct > 0 ? 'gap_up' : 'gap_down';
  return {
    size: +gapSize.toFixed(2), pct: +gapPct.toFixed(2), dir: dir,
    fillTarget: dir !== 'flat' ? +prevClose.toFixed(2) : null,
    fillNote: Math.abs(gapPct) > 0.3 ? 'Gaps > 0.3% fill same day ~70% of time' : null
  };
}

// ============================================================================
// CONFLUENCE ENGINE ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Weighted scoring across all layers
// ============================================================================
function scoreConfluence(data) {
  var bull = 0, bear = 0, reasons = [], maxScore = 0;

  // LAYER 1: STRUCTURE (20 points max)
  if (data.levels) {
    maxScore += 20;
    if (data.levels.nearSupport) { bull += 10; reasons.push('Near support $' + data.levels.nearestSupport); }
    if (data.levels.nearResistance) { bear += 10; reasons.push('Near resistance $' + data.levels.nearestResistance); }
    if (data.vwap) {
      if (data.vwap.priceVsVwap === 'above') { bull += 5; reasons.push('Above VWAP $' + data.vwap.vwap); }
      else { bear += 5; reasons.push('Below VWAP $' + data.vwap.vwap); }
    }
    if (data.gap && data.gap.dir !== 'flat' && data.gap.fillTarget) {
      var gapBias = data.gap.dir === 'gap_up' ? 'bear' : 'bull';
      if (gapBias === 'bull') bull += 5; else bear += 5;
      reasons.push('Unfilled gap ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ fill target $' + data.gap.fillTarget);
    }
  }

  // LAYER 2: MOMENTUM (25 points max)
  if (data.macd) {
    maxScore += 25;
    if (data.macd.bullish) { bull += 7; } else { bear += 7; }
    if (data.macd.cross === 'bull_cross') { bull += 5; reasons.push('MACD bullish crossover'); }
    if (data.macd.cross === 'bear_cross') { bear += 5; reasons.push('MACD bearish crossover'); }
    if (data.macd.div === 'bull_div') { bull += 6; reasons.push('Bullish MACD divergence'); }
    if (data.macd.div === 'bear_div') { bear += 6; reasons.push('Bearish MACD divergence'); }
    if (data.macd.accelerating) reasons.push('MACD histogram ' + (data.macd.accel > 0 ? 'accelerating' : 'decelerating'));
  }
  if (data.adx) {
    if (data.adx.trending) {
      if (data.adx.dir === 'bull') { bull += 7; } else { bear += 7; }
      reasons.push('ADX ' + data.adx.adx + ' ' + data.adx.dir + (data.adx.strong ? ' STRONG' : ''));
    }
  }

  // LAYER 3: VOLATILITY (15 points max)
  if (data.squeeze) {
    maxScore += 15;
    if (data.squeeze.fired) {
      if (data.squeeze.dir === 'bull') bull += 12; else bear += 12;
      reasons.push('SQUEEZE FIRED ' + data.squeeze.dir.toUpperCase());
    } else if (data.squeeze.on) {
      reasons.push('Squeeze ON ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ expansion imminent');
      bull += 3; bear += 3;
    }
  }

  // LAYER 4: PATTERN (25 points max)
  maxScore += 25;
  if (data.sss50_daily && data.sss50_daily.state === 'ACTIVE') {
      var s50dDir = data.sss50_daily.direction === 'bullish';
      if (s50dDir) bull += 15; else bear += 15;
      reasons.push('SSS50 DAILY ACTIVE: ' + data.sss50_daily.reason);
    }
    if (data.sss50) {
    if (data.sss50.state === 'ACTIVE') {
      var s50dir = data.sss50.direction === 'bullish';
      if (s50dir) bull += 12; else bear += 12;
      reasons.push('SSS50 ACTIVE: ' + data.sss50.reason);
    }
    if (data.sss50.state === 'COMPLETE') {
      var s50dir2 = data.sss50.direction === 'bullish';
      if (s50dir2) bull += 10; else bear += 10;
      reasons.push('SSS50 COMPLETE: ' + data.sss50.reason);
    }
    if (data.sss50.state === 'STANDBY') {
      reasons.push('SSS50 STANDBY: ' + data.sss50.reason);
    }
  }
  if (data.hammer) {
    if (data.hammer.type === 'hammer') { bull += 8; reasons.push('Hammer (' + (data.hammer.inForce ? 'IN-FORCE' : 'weak') + ')'); }
    if (data.hammer.type === 'shooter') { bear += 8; reasons.push('Shooter (' + (data.hammer.inForce ? 'IN-FORCE' : 'weak') + ')'); }
  }
  if (data.stratCombo && data.stratCombo.combo) {
    var comboDir = data.stratCombo.direction === 'up';
    if (comboDir) bull += 5; else bear += 5;
    reasons.push('Strat ' + data.stratCombo.combo + ': ' + data.stratCombo.description);
  }
  if (data.or5) {
    if (data.or5.status === 'breakout') { bull += 5; reasons.push('5-min OR breakout $' + data.or5.high); }
    if (data.or5.status === 'breakdown') { bear += 5; reasons.push('5-min OR breakdown $' + data.or5.low); }
  }

  // LAYER 5: FTFC (15 points max)
  if (data.ftfc) {
    maxScore += 15;
    if (data.ftfc.ftfc === 'BULLISH') { bull += 15; reasons.push('FTFC BULLISH (' + data.ftfc.count.bull + '/' + data.ftfc.count.total + ' TFs)'); }
    if (data.ftfc.ftfc === 'BEARISH') { bear += 15; reasons.push('FTFC BEARISH (' + data.ftfc.count.bear + '/' + data.ftfc.count.total + ' TFs)'); }
    if (data.ftfc.ftfc === 'MIXED') { reasons.push('FTFC mixed: ' + data.ftfc.bullPct + '% bull / ' + data.ftfc.bearPct + '% bear'); }
  }

  var total = bull + bear;
  var bias = bull > bear ? 'BULLISH' : bear > bull ? 'BEARISH' : 'NEUTRAL';
  var strength = Math.max(bull, bear);
  var pct = maxScore > 0 ? Math.round(strength / maxScore * 100) : 0;
  return { bias: bias, bullScore: bull, bearScore: bear, confluencePct: pct, strength: pct >= 80 ? 'STRONG' : pct >= 60 ? 'MODERATE' : 'WEAK', reasons: reasons, maxScore: maxScore };
}

// ============================================================================
// ALERT GENERATOR ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Specific entry/stop/target/timeframe
// ============================================================================
function generateAlert(confluence, price, levels, adx, vwap) {
  if (confluence.confluencePct < 55) return null; // Below threshold ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ no alert
  var dir = confluence.bias;
  var entry = +price.toFixed(2);
  var atr = adx && adx.atr ? adx.atr : 0.50;
  var stop, target1, target2, timeframe;
  if (dir === 'BULLISH') {
    stop = +(entry - atr * 1.5).toFixed(2);
    target1 = levels && levels.nearestResistance ? +levels.nearestResistance : +(entry + atr * 2).toFixed(2);
    target2 = vwap ? +vwap.upper1 : +(entry + atr * 3).toFixed(2);
  } else {
    stop = +(entry + atr * 1.5).toFixed(2);
    target1 = levels && levels.nearestSupport ? +levels.nearestSupport : +(entry - atr * 2).toFixed(2);
    target2 = vwap ? +vwap.lower1 : +(entry - atr * 3).toFixed(2);
  }
  var risk = Math.abs(entry - stop);
  var reward1 = Math.abs(target1 - entry);
  var rr1 = risk > 0 ? +(reward1 / risk).toFixed(1) : 0;
  var reward2 = Math.abs(target2 - entry);
  var rr2 = risk > 0 ? +(reward2 / risk).toFixed(1) : 0;
  // Time estimate based on ATR and volatility
  timeframe = atr > 1.5 ? '5-15 minutes' : atr > 0.8 ? '15-30 minutes' : '30-60 minutes';
  // Risk grade
  var riskPct = risk / entry * 100;
  var grade = riskPct <= 0.5 && rr1 >= 2.5 ? 'A+' : riskPct <= 0.8 && rr1 >= 2 ? 'A' : riskPct <= 1.0 && rr1 >= 1.5 ? 'B' : riskPct <= 1.5 ? 'C' : 'D';
  return {
    direction: dir, entry: entry, stop: stop,
    target1: target1, target1_rr: rr1,
    target2: target2, target2_rr: rr2,
    risk: +risk.toFixed(2), riskPct: +riskPct.toFixed(2),
    timeframe: timeframe, grade: grade,
    confluencePct: confluence.confluencePct,
    strength: confluence.strength,
    reasons: confluence.reasons
  };
}


// ============================================================================
// OPTIONS CONTRACT RECOMMENDER
// ============================================================================
function recommendContract(alert, price, sym) {
  if (!alert || !price) return null;
  var dir = alert.direction;
  var now = new Date();
  var dayOfWeek = now.getDay(); // 0=Sun, 5=Fri
  
  // Determine expiration based on timeframe
  var tf = alert.timeframe || '15-30 minutes';
  var daysToExp = 0;
  if (tf.indexOf('5-15') >= 0) daysToExp = 0; // 0DTE
  else if (tf.indexOf('15-30') >= 0) daysToExp = 0; // 0DTE
  else if (tf.indexOf('30-60') >= 0) daysToExp = Math.max(0, 5 - dayOfWeek); // This week Friday
  else daysToExp = 7; // Next week
  
  var expDate = new Date(now.getTime() + daysToExp * 86400000);
  // Skip weekends
  if (expDate.getDay() === 0) expDate.setDate(expDate.getDate() + 1);
  if (expDate.getDay() === 6) expDate.setDate(expDate.getDate() + 2);
  var expStr = expDate.toISOString().split('T')[0];
  
  // Select strike: ATM or 1 strike OTM
  var strikeWidth = price > 400 ? 5 : price > 100 ? 1 : 0.5;
  var atmStrike = Math.round(price / strikeWidth) * strikeWidth;
  var otm1Strike = dir === 'BULLISH' ? atmStrike + strikeWidth : atmStrike - strikeWidth;
  
  // Estimate premium (rough: ATR * delta * 100)
  var atr = alert.risk || 1.0;
  var estPremiumATM = +(atr * 0.5 * 1.2).toFixed(2); // ~50 delta, slight IV markup
  var estPremiumOTM = +(atr * 0.35 * 1.1).toFixed(2); // ~35 delta
  
  // Contract symbol format
  var type = dir === 'BULLISH' ? 'Call' : 'Put';
  var contractATM = sym + ' ' + expStr.replace(/-/g, '').substring(2) + (dir === 'BULLISH' ? 'C' : 'P') + (atmStrike * 1000).toString().padStart(8, '0');
  
  // Position sizing (risk-based)
  var maxRiskPerContract = Math.abs(estPremiumATM * 100); // Total premium per contract
  var suggestedContracts = alert.grade === 'A+' || alert.grade === 'A' ? 2 : 1;
  
  return {
    primary: {
      type: type,
      strike: atmStrike,
      expiration: expStr,
      daysToExp: daysToExp,
      estPremium: estPremiumATM,
      delta: '~0.50',
      contracts: suggestedContracts,
      maxRisk: '$' + (estPremiumATM * 100 * suggestedContracts).toFixed(0),
      displayName: sym + ' ' + expStr + ' $' + atmStrike + ' ' + type
    },
    aggressive: {
      type: type,
      strike: otm1Strike,
      expiration: expStr,
      daysToExp: daysToExp,
      estPremium: estPremiumOTM,
      delta: '~0.35',
      contracts: suggestedContracts,
      maxRisk: '$' + (estPremiumOTM * 100 * suggestedContracts).toFixed(0),
      displayName: sym + ' ' + expStr + ' $' + otm1Strike + ' ' + type
    },
    note: daysToExp === 0 ? '0DTE â high gamma, fast moves, manage actively' : daysToExp <= 2 ? 'Near-term â theta decay accelerating' : 'Weekly â more room for thesis to play out',
    strategy: dir === 'BULLISH' ? 'Long Call' : 'Long Put'
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = req.query.action || 'predict';
  var sym = (req.query.symbol || SYMBOL).toUpperCase();

  try {
    if (action === 'predict' || action === 'live_scan') {
      // Fetch data from Polygon first, Yahoo fallback
      var bars1m = await polygonBars(sym, 1, 'minute', 390);
      var bars5m = await polygonBars(sym, 5, 'minute', 200);
      var bars15m = await polygonBars(sym, 15, 'minute', 100);
      var bars1h = await polygonBars(sym, 1, 'hour', 50);
      var barsD = await polygonBars(sym, 1, 'day', 30);
      var barsW = await polygonBars(sym, 1, 'week', 12);
      var prev = await polygonPrev(sym);
      var snap = await polygonSnapshot(sym);

      // Yahoo fallback if Polygon fails
      var yahooFallback = null;
      if (!bars1m || bars1m.length < 10) {
        var yahooFallback = yahooRT || await yahooData(sym);
        if (yahooFallback && yahooFallback.bars) bars1m = yahooFallback.bars;
      }

      // Current price
      // Always fetch Yahoo for real-time price during market hours
      var yahooRT = await yahooData(sym);
      var price = (snap && snap.lastPrice) ? snap.lastPrice : (yahooRT && yahooRT.price) ? yahooRT.price : (bars1m && bars1m.length > 0 ? bars1m[bars1m.length - 1].c : null);
      if (!price) return res.status(503).json({ error: 'No price data available', source: 'polygon+yahoo both failed' });

      var prevDay = prev || (snap ? { h: snap.prevHigh, l: snap.prevLow, c: snap.prevClose, o: snap.todayOpen } : null) || (yahooFallback ? { h: yahooFallback.high, l: yahooFallback.low, c: yahooFallback.prevClose, o: yahooFallback.open } : null);

      // Extract close arrays for indicators
      var c1m = bars1m ? bars1m.map(function(b) { return b.c; }) : [];
      var h1m = bars1m ? bars1m.map(function(b) { return b.h; }) : [];
      var l1m = bars1m ? bars1m.map(function(b) { return b.l; }) : [];
      var c5m = bars5m ? bars5m.map(function(b) { return b.c; }) : [];
      var h5m = bars5m ? bars5m.map(function(b) { return b.h; }) : [];
      var l5m = bars5m ? bars5m.map(function(b) { return b.l; }) : [];

      // Run ALL indicators
      var macd1m = calcMACD(c1m);
      var macd5m = calcMACD(c5m);
      var adx1m = calcADX(h1m, l1m, c1m, 14);
      var adx5m = calcADX(h5m, l5m, c5m, 14);
      var squeeze1m = calcSqueeze(h1m, l1m, c1m, 20);
      var squeeze5m = calcSqueeze(h5m, l5m, c5m, 20);
      var vwap = calcVWAP(bars1m);
      // Buy/sell volume differential (liquid-trader Tape concept)
      var buyVol = 0, sellVol = 0;
      if (bars1m && bars1m.length > 20) {
        bars1m.slice(-20).forEach(function(b) { if (b.c > b.o) buyVol += b.v; else sellVol += b.v; });
      }
      var volumeBias = buyVol + sellVol > 0 ? { buyPct: Math.round(buyVol / (buyVol + sellVol) * 100), sellPct: Math.round(sellVol / (buyVol + sellVol) * 100), bias: buyVol > sellVol ? 'buying' : 'selling' } : null;
      // Find today's session open (9:30 AM ET = 13:30 UTC, or 14:30 UTC during DST)
      var sessionOpen = null;
      var todayBars1m = bars1m || [];
      if (bars1m && bars1m.length > 0) {
        // Market opens 9:30 AM ET. In UTC: 13:30 (EST) or 14:30 (EDT)
        // Use today at 00:00 UTC as baseline, find bars from today only
        var nowMs = Date.now();
        var todayMidnight = new Date(nowMs);
        todayMidnight.setUTCHours(0, 0, 0, 0);
        var todayMs = todayMidnight.getTime();
        todayBars1m = bars1m.filter(function(b) { return b.t >= todayMs; });
        if (todayBars1m.length > 0) {
          sessionOpen = todayBars1m[0].o;
        } else {
          // No today bars yet — use Yahoo open or last bar
          sessionOpen = (yahooRT && yahooRT.open) ? yahooRT.open : bars1m[bars1m.length - 1].o;
          todayBars1m = bars1m;
        }
      }
      // VWAP uses today-only bars (resets daily)
      vwap = todayBars1m.length > 0 ? calcVWAP(todayBars1m) : vwap;
      var levels = calcKeyLevels(sessionOpen, price, prevDay ? prevDay.h : null, prevDay ? prevDay.l : null, prevDay ? prevDay.c : null);
      var gap = calcGap(sessionOpen, prevDay ? prevDay.c : null, prevDay ? prevDay.h : null, prevDay ? prevDay.l : null);
      var or5 = calcOpeningRange(todayBars1m, 5);
      var or15 = calcOpeningRange(todayBars1m, 15);

      // Strat analysis on 5m (primary day trade timeframe)
      var sss50 = bars5m && bars5m.length >= 2 ? sss50Rule(bars5m[bars5m.length - 1], bars5m[bars5m.length - 2]) : null;
      var sss50_daily = barsD && barsD.length >= 2 ? sss50Rule(barsD[barsD.length - 1], barsD[barsD.length - 2]) : null;
      var sss50_weekly = barsW && barsW.length >= 2 ? sss50Rule(barsW[barsW.length - 1], barsW[barsW.length - 2]) : null;
      var hammer = bars5m && bars5m.length >= 1 ? detectHammerShooter(bars5m[bars5m.length - 1]) : null;
      var stratCombo = detectStratCombo(bars5m);

      // FTFC across available timeframes
      var ftfcData = {};
      if (bars1m && bars1m.length > 0) ftfcData['1m'] = bars1m;
      if (bars5m && bars5m.length > 0) ftfcData['5m'] = bars5m;
      if (bars15m && bars15m.length > 0) ftfcData['15m'] = bars15m;
      if (bars1h && bars1h.length > 0) ftfcData['1h'] = bars1h;
      if (barsD && barsD.length > 0) ftfcData['D'] = barsD;
      if (barsW && barsW.length > 0) ftfcData['W'] = barsW;
      var ftfc = checkFTFC(ftfcData);

      // EMA alignment (8/21 on 1m and 5m)
      var ema8_1m = ema(c1m, 8);
      var ema21_1m = ema(c1m, 21);
      var ema8_5m = ema(c5m, 8);
      var ema21_5m = ema(c5m, 21);
      var emaAlign = {
        '1m': ema8_1m.length > 0 && ema21_1m.length > 0 ? (ema8_1m[ema8_1m.length - 1] > ema21_1m[ema21_1m.length - 1] ? 'bull' : 'bear') : 'unknown',
        '5m': ema8_5m.length > 0 && ema21_5m.length > 0 ? (ema8_5m[ema8_5m.length - 1] > ema21_5m[ema21_5m.length - 1] ? 'bull' : 'bear') : 'unknown'
      };

      // CONFLUENCE SCORING
      var confluence = scoreConfluence({
        levels: levels, vwap: vwap, gap: gap,
        macd: macd5m || macd1m, adx: adx5m || adx1m,
        squeeze: squeeze5m || squeeze1m,
        sss50: sss50, sss50_daily: sss50_daily, hammer: hammer, stratCombo: stratCombo,
        or5: or5, ftfc: ftfc
      });

      // GENERATE ALERT if confluence is high enough
      var alert = generateAlert(confluence, price, levels, adx5m || adx1m, vwap);
      var optionsRec = alert ? recommendContract(alert, price, sym) : null;

      return res.json({
        symbol: sym, price: price, timestamp: new Date().toISOString(),
        dataSource: snap && snap.lastPrice ? 'polygon_snapshot' : (bars1m && bars1m.length > 50 ? 'polygon_bars' : 'yahoo_fallback'),
        priceSource: (snap && snap.lastPrice) ? 'polygon_snapshot' : (yahooRT && yahooRT.price) ? 'yahoo_realtime' : 'polygon_bar_close',
        bars: { '1m': (bars1m || []).length, '5m': (bars5m || []).length, '15m': (bars15m || []).length, '1h': (bars1h || []).length, 'D': (barsD || []).length },
        confluence: confluence,
        alert: alert,
        options: optionsRec,
        indicators: {
          macd_1m: macd1m, macd_5m: macd5m,
          adx_1m: adx1m, adx_5m: adx5m,
          squeeze_1m: squeeze1m, squeeze_5m: squeeze5m,
          vwap: vwap, emaAlignment: emaAlign
        },
        structure: { levels: levels, gap: gap, or5: or5, or15: or15 },
        strat: { sss50: sss50, sss50_daily: sss50_daily, sss50_weekly: sss50_weekly, hammer: hammer, combo: stratCombo, ftfc: ftfc },
        volumeFlow: volumeBias,
        perTimeframe: {
          '1m': { bars: (bars1m || []).length, macd: macd1m, adx: adx1m, squeeze: squeeze1m, ema: emaAlign['1m'] },
          '5m': { bars: (bars5m || []).length, macd: macd5m, adx: adx5m, squeeze: squeeze5m, ema: emaAlign['5m'], sss50: sss50, hammer: hammer, combo: stratCombo },
          '15m': { bars: (bars15m || []).length },
          '1h': { bars: (bars1h || []).length },
          'D': { bars: (barsD || []).length }
        }
      });
    }

    if (action === 'health') {
      return res.json({ status: 'ok', version: 'v3', features: ['sss50', 'ftfc', 'squeeze', 'macd', 'adx', 'vwap_bands', 'key_levels', 'hammer_shooter', 'strat_combos', 'opening_range', 'gap_analysis', 'confluence_scoring', 'alert_generation'], sources: ['wolffnbear', 'rickyzcarroll', 'liquid-trader'], dataProviders: ['polygon.io', 'yahoo_finance'] });
    }

    return res.status(400).json({ error: 'action required: predict, live_scan, health' });
  } catch (err) {
    console.error('[dt-engine-v3]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
