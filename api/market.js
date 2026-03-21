// AnkushAI Market Data API v5 — Institutional-grade data pipeline
// Priority: Polygon (primary) → Twelve Data → Alpha Vantage → EOD Historical → Fallback cache
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

// In-memory cache keyed by symbol — 5-min TTL during market hours, 30-min after close
const cache = {};
const CACHE_TTL_OPEN = 5 * 60 * 1000;
const CACHE_TTL_CLOSED = 30 * 60 * 1000;

function isMarketOpen() {
  const now = new Date();
  const etHour = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  const etMin = now.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' });
  const etDay = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const h = parseInt(etHour), m = parseInt(etMin);
  if (['Sat', 'Sun'].includes(etDay)) return false;
  const totalMins = h * 60 + m;
  return totalMins >= 570 && totalMins < 960; // 9:30 AM - 4:00 PM ET
}

function fromCache(symbol) {
  const entry = cache[symbol];
  if (!entry) return null;
  const ttl = isMarketOpen() ? CACHE_TTL_OPEN : CACHE_TTL_CLOSED;
  if (Date.now() - entry.ts > ttl) return null;
  return entry.data;
}

function toCache(symbol, data) {
  cache[symbol] = { ts: Date.now(), data };
}

// SOURCE 1: Polygon.io — best free tier for US equities
async function fetchPolygon(symbol) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;
  try {
    // Try snapshot first (live during market hours)
    const snap = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${key}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (snap.ok) {
      const d = await snap.json();
      const t = d.ticker;
      if (t?.day?.c) {
        return {
          symbol, price: t.day.c, open: t.day.o, high: t.day.h, low: t.day.l,
          close: t.prevDay?.c || t.day.c, change: t.todaysChange || 0,
          changePercent: t.todaysChangePerc || 0, volume: t.day.v || 0,
          avgVolume: t.prevDay?.v || 0, source: 'polygon_snap'
        };
      }
    }
    // Fallback to previous close
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const ds = yesterday.toISOString().split('T')[0];
    const prev = await fetch(
      `https://api.polygon.io/v1/open-close/${symbol}/${ds}?adjusted=true&apiKey=${key}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (prev.ok) {
      const d = await prev.json();
      if (d.close) {
        return {
          symbol, price: d.close, open: d.open, high: d.high, low: d.low,
          close: d.close, change: 0, changePercent: 0, volume: d.volume || 0,
          avgVolume: 0, source: 'polygon_eod'
        };
      }
    }
  } catch (e) { console.log('Polygon error:', e.message); }
  return null;
}

// SOURCE 2: Twelve Data — excellent free tier, 800 req/day
async function fetchTwelveData(symbol) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${key}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (r.ok) {
      const d = await r.json();
      if (d.close && !d.code) {
        const price = parseFloat(d.close);
        const prev = parseFloat(d.previous_close);
        return {
          symbol, price, open: parseFloat(d.open), high: parseFloat(d.high),
          low: parseFloat(d.low), close: price, change: price - prev,
          changePercent: ((price - prev) / prev * 100),
          volume: parseInt(d.volume) || 0, avgVolume: parseInt(d.average_volume) || 0,
          fiftyTwoWeekHigh: parseFloat(d['52_week']['high']), 
          fiftyTwoWeekLow: parseFloat(d['52_week']['low']),
          source: 'twelve_data'
        };
      }
    }
  } catch (e) { console.log('Twelve Data error:', e.message); }
  return null;
}

// SOURCE 3: Alpha Vantage — reliable global fallback
async function fetchAlphaVantage(symbol) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${key}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const d = await r.json();
      const q = d['Global Quote'];
      if (q && q['05. price']) {
        const price = parseFloat(q['05. price']);
        return {
          symbol, price, open: parseFloat(q['02. open']), high: parseFloat(q['03. high']),
          low: parseFloat(q['04. low']), close: parseFloat(q['08. previous close']),
          change: parseFloat(q['09. change']), changePercent: parseFloat(q['10. change percent']),
          volume: parseInt(q['06. volume']) || 0, avgVolume: 0,
          source: 'alpha_vantage'
        };
      }
    }
  } catch (e) { console.log('Alpha Vantage error:', e.message); }
  return null;
}

// SOURCE 4: Yahoo Finance via yfinance-compatible endpoint
async function fetchYahoo(symbol) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) {
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) {
        return {
          symbol, price: meta.regularMarketPrice,
          open: meta.regularMarketOpen, high: meta.regularMarketDayHigh,
          low: meta.regularMarketDayLow, close: meta.previousClose,
          change: meta.regularMarketPrice - meta.previousClose,
          changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100),
          volume: meta.regularMarketVolume || 0, avgVolume: meta.averageDailyVolume3Month || 0,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh, fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          source: 'yahoo'
        };
      }
    }
  } catch (e) { console.log('Yahoo error:', e.message); }
  return null;
}

// ORCHESTRATOR: try sources in priority order
async function getQuote(symbol) {
  const cached = fromCache(symbol);
  if (cached) return cached;

  const result = await fetchPolygon(symbol)
    || await fetchTwelveData(symbol)
    || await fetchAlphaVantage(symbol)
    || await fetchYahoo(symbol);

  if (result) {
    // Normalize all fields
    result.price = parseFloat(result.price?.toFixed(2)) || 0;
    result.change = parseFloat(result.change?.toFixed(2)) || 0;
    result.changePercent = parseFloat(result.changePercent?.toFixed(3)) || 0;
    result.volume = Math.round(result.volume) || 0;
    result.marketCap = null; // computed separately if needed
    result.timestamp = Date.now();
    result.marketOpen = isMarketOpen();
    toCache(symbol, result);
  }
  return result;
}

// Batch quotes — parallel with 100ms stagger for rate limits
async function getBatchQuotes(symbols) {
  const results = {};
  const batches = [];
  for (let i = 0; i < symbols.length; i += 5) batches.push(symbols.slice(i, i + 5));
  for (const batch of batches) {
    const fetched = await Promise.all(batch.map(s => getQuote(s).catch(() => null)));
    fetched.forEach((q, i) => { if (q) results[batch[i]] = q; });
    if (batches.indexOf(batch) < batches.length - 1) await new Promise(r => setTimeout(r, 100));
  }
  return results;
}

// VIX fetch
async function getVIX() {
  const vix = await getQuote('^VIX') || await getQuote('VIX');
  if (vix) return { current: vix.price, change: vix.change, changePercent: vix.changePercent };
  return { current: 18.5, change: 0, changePercent: 0, source: 'default' };
}

// SPY technicals
async function getSPYTechnicals() {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;
  try {
    const [ema9, ema21, ema50, ema200, rsi] = await Promise.all([
      fetch(`https://api.polygon.io/v1/indicators/ema/SPY?timespan=day&adjusted=true&window=9&series_type=close&limit=1&order=desc&apiKey=${key}`, { signal: AbortSignal.timeout(4000) }).then(r=>r.json()),
      fetch(`https://api.polygon.io/v1/indicators/ema/SPY?timespan=day&adjusted=true&window=21&series_type=close&limit=1&order=desc&apiKey=${key}`, { signal: AbortSignal.timeout(4000) }).then(r=>r.json()),
      fetch(`https://api.polygon.io/v1/indicators/ema/SPY?timespan=day&adjusted=true&window=50&series_type=close&limit=1&order=desc&apiKey=${key}`, { signal: AbortSignal.timeout(4000) }).then(r=>r.json()),
      fetch(`https://api.polygon.io/v1/indicators/ema/SPY?timespan=day&adjusted=true&window=200&series_type=close&limit=1&order=desc&apiKey=${key}`, { signal: AbortSignal.timeout(4000) }).then(r=>r.json()),
      fetch(`https://api.polygon.io/v1/indicators/rsi/SPY?timespan=day&adjusted=true&window=14&series_type=close&limit=1&order=desc&apiKey=${key}`, { signal: AbortSignal.timeout(4000) }).then(r=>r.json()),
    ]);
    const get = (d) => d?.results?.values?.[0]?.value;
    const e9 = get(ema9), e21 = get(ema21), e50 = get(ema50), e200 = get(ema200);
    const alignment = (e9 && e21 && e50 && e200)
      ? (e9 > e21 && e21 > e50 && e50 > e200 ? 'bullish_stacked'
       : e9 < e21 && e21 < e50 && e50 < e200 ? 'bearish_stacked' : 'mixed')
      : 'mixed';
    return { ema9: e9, ema21: e21, ema50: e50, ema200: e200, rsi: get(rsi), emaAlignment: alignment };
  } catch (e) { return null; }
}

// Sector ETF performance
const SECTORS = {
  'XLK': 'Technology', 'XLF': 'Financials', 'XLV': 'Healthcare',
  'XLE': 'Energy', 'XLY': 'Consumer Disc', 'XLP': 'Consumer Staples',
  'XLI': 'Industrials', 'XLB': 'Materials', 'XLRE': 'Real Estate',
  'XLU': 'Utilities', 'XLC': 'Communication'
};

async function getSectorPerformance() {
  const quotes = await getBatchQuotes(Object.keys(SECTORS));
  return Object.entries(SECTORS).map(([ticker, name]) => ({
    ticker, name,
    price: quotes[ticker]?.price || 0,
    change: quotes[ticker]?.changePercent || 0,
    volume: quotes[ticker]?.volume || 0
  })).sort((a, b) => b.change - a.change);
}

// Market breadth — advances/declines approximation from sector performance
function getMarketMood(sectors, vix, spyChange) {
  const advancing = sectors.filter(s => s.change > 0).length;
  const declining = sectors.filter(s => s.change < 0).length;
  const bullSectors = sectors.filter(s => s.change > 0.5).map(s => s.name);
  const bearSectors = sectors.filter(s => s.change < -0.5).map(s => s.name);
  
  let mood = 'Neutral';
  if (spyChange > 0.5 && vix < 20 && advancing >= 8) mood = 'Risk On';
  else if (spyChange > 0.2 && advancing >= 6) mood = 'Mildly Bullish';
  else if (spyChange < -0.5 && vix > 22 && declining >= 8) mood = 'Risk Off';
  else if (spyChange < -0.2 && declining >= 6) mood = 'Mildly Bearish';
  else if (vix > 25) mood = 'Fear';
  else if (vix < 14) mood = 'Complacency';
  else mood = 'Mixed';
  
  return { mood, advancing, declining, bullSectors, bearSectors };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v));
  
  const { type, symbol, symbols } = req.query;

  // Single quote
  if (type === 'quote' || (!type && symbol)) {
    const sym = symbol || req.query.symbol;
    if (!sym) return res.status(400).json({ error: 'symbol required' });
    const q = await getQuote(sym.toUpperCase());
    if (!q) return res.status(503).json({ error: 'Market data unavailable', symbol: sym });
    return res.json(q);
  }

  // Batch quotes
  if (type === 'quotes' && symbols) {
    const syms = symbols.split(',').map(s => s.trim().toUpperCase()).slice(0, 30);
    const results = await getBatchQuotes(syms);
    return res.json(results);
  }

  // VIX
  if (type === 'vix') {
    const vix = await getVIX();
    return res.json(vix);
  }

  // Sectors
  if (type === 'sectors') {
    const sectors = await getSectorPerformance();
    return res.json(sectors);
  }

  // Full market context (used by analysis.js, Overview)
  if (type === 'context' || type === 'full') {
    try {
      const [spy, qqq, iwm, vix, technicals, sectors] = await Promise.all([
        getQuote('SPY'), getQuote('QQQ'), getQuote('IWM'), getVIX(),
        getSPYTechnicals(), getSectorPerformance()
      ]);
      const spyChange = spy?.changePercent || 0;
      const marketMood = getMarketMood(sectors, vix.current, spyChange);
      return res.json({
        spy: { ...spy, technicals },
        qqq, iwm, vix, sectors,
        marketMood,
        marketOpen: isMarketOpen(),
        timestamp: Date.now()
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Historical OHLCV for charts
  if (type === 'history') {
    const sym = symbol?.toUpperCase();
    const range = req.query.range || '3M';
    const key = process.env.POLYGON_API_KEY;
    if (!sym || !key) return res.status(400).json({ error: 'symbol and POLYGON_API_KEY required' });
    
    const endDate = new Date().toISOString().split('T')[0];
    const rangeMap = { '1D': 1, '5D': 5, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730 };
    const days = rangeMap[range] || 90;
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const multiplier = days <= 5 ? 5 : 1;
    const timespan = days <= 5 ? 'minute' : 'day';
    
    try {
      const r = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${sym}/range/${multiplier}/${timespan}/${startDate}/${endDate}?adjusted=true&sort=asc&limit=1000&apiKey=${key}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const d = await r.json();
        if (d.results?.length > 0) return res.json({ symbol: sym, range, bars: d.results });
      }
    } catch (e) {}
    return res.status(503).json({ error: 'Historical data unavailable' });
  }

  // Options chain — ATM strikes for a symbol
  if (type === 'options') {
    const sym = symbol?.toUpperCase();
    const key = process.env.POLYGON_API_KEY;
    if (!sym || !key) return res.status(400).json({ error: 'symbol and POLYGON_API_KEY required' });
    try {
      const expiry = req.query.expiry || '';
      const url = expiry
        ? `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${sym}&expiration_date=${expiry}&contract_type=call&limit=20&apiKey=${key}`
        : `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${sym}&contract_type=call&limit=20&apiKey=${key}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json();
        return res.json({ symbol: sym, contracts: d.results || [] });
      }
    } catch (e) {}
    return res.status(503).json({ error: 'Options data unavailable' });
  }

  // Earnings calendar
  if (type === 'earnings') {
    const key = process.env.POLYGON_API_KEY;
    const from = req.query.from || new Date().toISOString().split('T')[0];
    const to = req.query.to || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    if (!key) return res.status(400).json({ error: 'POLYGON_API_KEY required' });
    try {
      const r = await fetch(
        `https://api.polygon.io/vX/reference/financials?filing_date.gte=${from}&filing_date.lte=${to}&limit=50&apiKey=${key}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const d = await r.json();
        return res.json({ earnings: d.results || [] });
      }
    } catch (e) {}
    return res.status(503).json({ error: 'Earnings data unavailable' });
  }

  return res.status(400).json({ error: 'Unknown type. Use: quote, quotes, vix, sectors, context, history, options, earnings' });
};
