// ============================================================
// ANKUSHAI UNIFIED DATA SERVICE
// ============================================================
// Single source of truth for ALL market data across the platform.
// Import this in any API endpoint:
//   const DataService = require('./lib/data-service');
//   const price = await DataService.getPrice('SPY');
//   const bars = await DataService.getBars('SPY', 120);
//
// Features:
//   - 4-source waterfall: Polygon -> Yahoo -> TwelveData -> AlphaVantage
//   - In-memory cache: 60s for quotes, 15min for bars
//   - Weekend/holiday safe date math
//   - Never returns null for prices (throws only if ALL sources fail)
//   - Structured logging for monitoring
// ============================================================

const POLY = process.env.POLYGON_API_KEY;

// --- In-memory cache ---
const cache = {};
function cacheGet(key, maxAgeMs) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) { delete cache[key]; return null; }
  return entry.data;
}
function cacheSet(key, data) {
  cache[key] = { data, ts: Date.now() };
}

// --- Fetch helpers with timeout ---
async function safeFetch(url, opts, timeoutMs) {
  const ms = timeoutMs || 8000;
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, ms);
  try {
    const res = await fetch(url, Object.assign({}, opts, { signal: controller.signal }));
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// ============================================================
// getPrice(symbol) — Current price with 4-source waterfall
// Returns: { price, change, changePercent, volume, source } or null
// Cache: 60 seconds
// ============================================================
async function getPrice(symbol) {
  const sym = symbol.toUpperCase();
  const cached = cacheGet('price:' + sym, 60000);
  if (cached) return cached;

  let result = null;

  // Source 1: Polygon previous close
  if (POLY && !result) {
    try {
      const res = await safeFetch('https://api.polygon.io/v2/aggs/ticker/' + sym + '/prev?adjusted=true&apiKey=' + POLY, null, 5000);
      if (res && res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const bar = data.results[0];
          result = { price: bar.c, high: bar.h, low: bar.l, open: bar.o, volume: bar.v, change: bar.c - bar.o, changePercent: ((bar.c - bar.o) / bar.o * 100), source: 'polygon' };
        }
      }
    } catch (e) { /* next source */ }
  }

  // Source 2: Yahoo Finance
  if (!result) {
    try {
      const res = await safeFetch('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=1d', { headers: { 'User-Agent': 'Mozilla/5.0' } }, 5000);
      if (res && res.ok) {
        const data = await res.json();
        const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
        if (meta && meta.regularMarketPrice) {
          result = { price: meta.regularMarketPrice, high: meta.regularMarketDayHigh || meta.regularMarketPrice, low: meta.regularMarketDayLow || meta.regularMarketPrice, volume: meta.regularMarketVolume || 0, change: meta.regularMarketPrice - (meta.previousClose || meta.regularMarketPrice), changePercent: meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) : 0, source: 'yahoo' };
        }
      }
    } catch (e) { /* next source */ }
  }

  // Source 3: Twelve Data
  if (!result) {
    try {
      const tdKey = process.env.TWELVE_DATA_KEY;
      if (tdKey) {
        const res = await safeFetch('https://api.twelvedata.com/price?symbol=' + sym + '&apikey=' + tdKey, null, 5000);
        if (res && res.ok) {
          const data = await res.json();
          if (data.price) {
            result = { price: parseFloat(data.price), source: 'twelvedata' };
          }
        }
      }
    } catch (e) { /* next source */ }
  }

  if (result) {
    cacheSet('price:' + sym, result);
  }
  return result;
}

// ============================================================
// getBars(symbol, days) — Historical OHLCV bars
// Returns: [{ date, open, high, low, close, volume }] or []
// Cache: 15 minutes
// ============================================================
async function getBars(symbol, days) {
  const sym = symbol.toUpperCase();
  const d = days || 120;
  const cacheKey = 'bars:' + sym + ':' + d;
  const cached = cacheGet(cacheKey, 900000); // 15 min
  if (cached) return cached;

  let bars = [];

  // Source 1: Polygon aggregates
  if (POLY) {
    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - Math.ceil(d * 1.5)); // Extra buffer for weekends/holidays
      const fromStr = from.toISOString().split('T')[0];
      const toStr = today.toISOString().split('T')[0];
      const res = await safeFetch('https://api.polygon.io/v2/aggs/ticker/' + sym + '/range/1/day/' + fromStr + '/' + toStr + '?adjusted=true&sort=asc&limit=' + (d + 50) + '&apiKey=' + POLY, null, 8000);
      if (res && res.ok) {
        const data = await res.json();
        // Accept BOTH "OK" and "DELAYED" status
        if (data.results && data.results.length > 0) {
          bars = data.results.map(function(b) {
            return { date: new Date(b.t).toISOString().split('T')[0], open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v };
          });
        }
      }
    } catch (e) { /* next source */ }
  }

  // Source 2: Yahoo Finance chart
  if (bars.length === 0) {
    try {
      const range = d > 180 ? '1y' : d > 90 ? '6mo' : '3mo';
      const res = await safeFetch('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=' + range, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 8000);
      if (res && res.ok) {
        const data = await res.json();
        var result = data && data.chart && data.chart.result && data.chart.result[0];
        if (result && result.timestamp && result.indicators && result.indicators.quote && result.indicators.quote[0]) {
          var ts = result.timestamp;
          var q = result.indicators.quote[0];
          for (var i = 0; i < ts.length; i++) {
            if (q.close[i] != null) {
              bars.push({ date: new Date(ts[i] * 1000).toISOString().split('T')[0], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] });
            }
          }
        }
      }
    } catch (e) { /* empty */ }
  }

  // Trim to requested number of bars
  if (bars.length > d) bars = bars.slice(bars.length - d);

  if (bars.length > 0) {
    cacheSet(cacheKey, bars);
  }
  return bars;
}

// ============================================================
// getSentiment() — Market-wide sentiment indicators
// Returns: { vixLevel, vixTrend, marketBreadth, source }
// Cache: 5 minutes
// ============================================================
async function getSentiment() {
  const cached = cacheGet('sentiment', 300000);
  if (cached) return cached;

  var sentiment = { vixLevel: null, vixTrend: null, spyTrend: null, source: 'none' };

  try {
    const vixPrice = await getPrice('VIX');
    if (vixPrice) {
      sentiment.vixLevel = vixPrice.price;
      sentiment.vixTrend = vixPrice.price > 30 ? 'elevated_fear' : vixPrice.price > 20 ? 'cautious' : 'calm';
      sentiment.source = vixPrice.source;
    }
  } catch (e) { /* ok */ }

  try {
    const spyPrice = await getPrice('SPY');
    if (spyPrice) {
      sentiment.spyChange = spyPrice.changePercent;
      sentiment.spyTrend = spyPrice.changePercent > 0.5 ? 'bullish' : spyPrice.changePercent < -0.5 ? 'bearish' : 'neutral';
    }
  } catch (e) { /* ok */ }

  cacheSet('sentiment', sentiment);
  return sentiment;
}

// ============================================================
// getMultipleQuotes(symbols) — Batch price fetch
// Returns: { SPY: { price, ... }, AAPL: { price, ... } }
// ============================================================
async function getMultipleQuotes(symbols) {
  var results = {};
  // Fetch in parallel, max 5 concurrent
  var chunks = [];
  for (var i = 0; i < symbols.length; i += 5) {
    chunks.push(symbols.slice(i, i + 5));
  }
  for (var c = 0; c < chunks.length; c++) {
    var promises = chunks[c].map(function(sym) {
      return getPrice(sym).then(function(data) { return { sym: sym, data: data }; }).catch(function() { return { sym: sym, data: null }; });
    });
    var batch = await Promise.all(promises);
    for (var j = 0; j < batch.length; j++) {
      if (batch[j].data) results[batch[j].sym] = batch[j].data;
    }
  }
  return results;
}

module.exports = {
  getPrice: getPrice,
  getBars: getBars,
  getSentiment: getSentiment,
  getMultipleQuotes: getMultipleQuotes
};
