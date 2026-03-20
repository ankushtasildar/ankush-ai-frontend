// api/market.js — Polygon.io with Yahoo Finance fallback
// Polygon for live quotes; Yahoo Finance for historical OHLCV (no rate limit)
// In-memory cache prevents redundant calls

const POLYGON = process.env.POLYGON_API_KEY;
const BASE = 'https://api.polygon.io';
const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type,Authorization'
};

// ── In-memory cache ──────────────────────────────────────────────
const cache = new Map();
function getCached(key, ttlMs) {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < ttlMs) return e.data;
  return null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

// ── Polygon fetch ────────────────────────────────────────────────
async function polyFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(BASE + path + sep + 'apiKey=' + POLYGON);
  if (!res.ok) throw new Error('Polygon ' + res.status + ': ' + path);
  return res.json();
}

// ── Yahoo Finance historical OHLCV (no auth, no rate limit) ──────
async function yahooAggs(symbol, days) {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - days * 86400;
  // Use Yahoo Finance v8 chart endpoint
  const interval = days <= 7 ? '15m' : days <= 60 ? '1d' : '1d';
  const range = days <= 1 ? '1d' : days <= 7 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : '2y';
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol.toUpperCase() +
    '?interval=' + interval + '&range=' + range + '&includePrePost=false';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('Yahoo ' + res.status);
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error('Yahoo: no data for ' + symbol);
  const { timestamp, indicators: { quote: [q] } } = result;
  const candles = [];
  for (let i = 0; i < timestamp.length; i++) {
    if (q.close[i] == null) continue;
    candles.push({
      time: timestamp[i],
      open: parseFloat((q.open[i]||q.close[i]).toFixed(4)),
      high: parseFloat((q.high[i]||q.close[i]).toFixed(4)),
      low: parseFloat((q.low[i]||q.close[i]).toFixed(4)),
      close: parseFloat(q.close[i].toFixed(4)),
      volume: q.volume[i] || 0
    });
  }
  return candles;
}

// ── Yahoo Finance search ─────────────────────────────────────────
async function yahooSearch(q) {
  const url = 'https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=10&newsCount=0';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.quotes || []).filter(r => r.isYahooFinance).map(r => ({
    symbol: r.symbol, name: r.longname || r.shortname || r.symbol,
    type: r.quoteType, exchange: r.exchange
  }));
}

// ── Yahoo Finance quote ──────────────────────────────────────────
async function yahooQuote(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol.toUpperCase() + '?interval=1d&range=5d';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('Yahoo quote ' + res.status);
  const json = await res.json();
  const r = json.chart?.result?.[0];
  if (!r) throw new Error('No Yahoo quote data');
  const meta = r.meta;
  return {
    symbol: symbol.toUpperCase(),
    price: meta.regularMarketPrice || meta.previousClose || 0,
    change: (meta.regularMarketPrice||0) - (meta.previousClose||0),
    changePct: meta.regularMarketPrice && meta.previousClose ?
      ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) : 0,
    volume: meta.regularMarketVolume || 0,
    vwap: 0,
    high52w: meta.fiftyTwoWeekHigh || null,
    low52w: meta.fiftyTwoWeekLow || null,
    marketCap: meta.marketCap || null,
    name: meta.longName || meta.shortName || symbol,
    description: '',
    sic: ''
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(cors).end();
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v));
  const { type, symbols, symbol, from, to, timespan='day', multiplier=1, limit=200 } = req.query;

  try {
    // ── AGGS: Yahoo Finance primary (no rate limit), Polygon fallback ──
    if (type === 'aggs') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const cacheKey = 'aggs:'+symbol.toUpperCase()+':'+timespan+':'+from+':'+to;
      const ttl = (timespan==='day'||timespan==='week') ? 4*60*60_000 : 5*60_000;
      const cached = getCached(cacheKey, ttl);
      if (cached) return res.json(cached);

      // Calculate days range
      const frDate = from || new Date(Date.now()-365*24*60*60*1000).toISOString().split('T')[0];
      const toDate = to || new Date().toISOString().split('T')[0];
      const daysDiff = Math.ceil((new Date(toDate) - new Date(frDate)) / 86400000);

      let candles;
      try {
        // Try Yahoo Finance first — no rate limits
        candles = await yahooAggs(symbol.toUpperCase(), daysDiff);
      } catch(yahooErr) {
        console.log('Yahoo failed, trying Polygon:', yahooErr.message);
        // Fall back to Polygon
        const data = await polyFetch('/v2/aggs/ticker/'+symbol.toUpperCase()+'/range/'+multiplier+'/'+timespan+'/'+frDate+'/'+toDate+'?adjusted=true&sort=asc&limit='+limit);
        candles = (data.results||[]).map(r => ({time:Math.floor(r.t/1000),open:r.o,high:r.h,low:r.l,close:r.c,volume:r.v}));
      }
      const result = {symbol:symbol.toUpperCase(),candles,count:candles.length};
      setCache(cacheKey, result);
      return res.json(result);
    }

    // ── SEARCH: Yahoo Finance (no rate limit) with Polygon fallback ──
    if (type === 'search') {
      const q = req.query.q||'';
      if (!q) return res.json({results:[]});
      const cacheKey = 'search:'+q.toLowerCase();
      const cached = getCached(cacheKey, 24*60*60_000);
      if (cached) return res.json(cached);
      let results;
      try {
        results = await yahooSearch(q);
        if (!results.length) throw new Error('no results');
      } catch(e) {
        const data = await polyFetch('/v3/reference/tickers?search='+encodeURIComponent(q)+'&active=true&market=stocks&order=asc&limit=20').catch(()=>({results:[]}));
        results = (data.results||[]).map(t => ({symbol:t.ticker,name:t.name,type:t.type,exchange:t.primary_exchange}));
      }
      const result = {results};
      setCache(cacheKey, result);
      return res.json(result);
    }

    // ── SNAPSHOT: Yahoo Finance with Polygon fallback ──
    if (type === 'snapshot') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const cacheKey = 'snap:'+symbol.toUpperCase();
      const cached = getCached(cacheKey, 60_000);
      if (cached) return res.json(cached);
      let result;
      try {
        result = await yahooQuote(symbol);
      } catch(e) {
        const [snap,details] = await Promise.allSettled([
          polyFetch('/v2/snapshot/locale/us/markets/stocks/tickers/'+symbol.toUpperCase()),
          polyFetch('/v3/reference/tickers/'+symbol.toUpperCase())
        ]);
        const t = snap.status==='fulfilled' ? snap.value.ticker : {};
        const d = details.status==='fulfilled' ? details.value.results : {};
        result = {symbol:symbol.toUpperCase(),price:t.day?.c||t.prevDay?.c||0,change:t.todaysChange||0,changePct:t.todaysChangePerc||0,volume:t.day?.v||0,vwap:t.day?.vw||0,high52w:d.high_price||null,low52w:d.low_price||null,marketCap:d.market_cap||null,description:d.description||'',name:d.name||symbol,sic:d.sic_description||''};
      }
      setCache(cacheKey, result);
      return res.json(result);
    }

    // ── QUOTES: Polygon snapshots (live batch), Yahoo fallback per-ticker ──
    if (type === 'quotes') {
      const tickers = (symbols||'').split(',').filter(Boolean).slice(0,100);
      if (!tickers.length) return res.json({quotes:{}});
      const cacheKey = 'quotes:'+tickers.sort().join(',');
      const cached = getCached(cacheKey, 60_000);
      if (cached) return res.json(cached);
      let quotes = {};
      try {
        const data = await polyFetch('/v2/snapshot/locale/us/markets/stocks/tickers?tickers='+tickers.join(','));
        (data.tickers||[]).forEach(t => { quotes[t.ticker] = {symbol:t.ticker,price:t.day?.c||t.prevDay?.c||0,open:t.day?.o||0,high:t.day?.h||0,low:t.day?.l||0,close:t.day?.c||0,prevClose:t.prevDay?.c||0,change:t.todaysChange||0,changePct:t.todaysChangePerc||0,volume:t.day?.v||0,vwap:t.day?.vw||0,updated:Date.now()}; });
      } catch(e) {
        // Yahoo fallback for each ticker
        await Promise.allSettled(tickers.map(async ticker => {
          try {
            const q = await yahooQuote(ticker);
            quotes[ticker] = {...q,open:0,high:0,low:0,prevClose:q.price-q.change,vwap:0,updated:Date.now()};
          } catch(e2) {}
        }));
      }
      const result = {quotes};
      setCache(cacheKey, result);
      return res.json(result);
    }

    // ── MOVERS: Polygon only (no Yahoo equivalent) ──
    if (type === 'movers') {
      const direction = req.query.direction||'gainers';
      const cacheKey = 'movers:'+direction;
      const cached = getCached(cacheKey, 2*60_000);
      if (cached) return res.json(cached);
      const data = await polyFetch('/v2/snapshot/locale/us/markets/stocks/'+direction+'?include_otc=false');
      const result = {movers:(data.tickers||[]).slice(0,30).map(t => ({symbol:t.ticker,price:t.day?.c||0,change:t.todaysChange||0,changePct:t.todaysChangePerc||0,volume:t.day?.v||0,prevClose:t.prevDay?.c||0}))};
      setCache(cacheKey, result);
      return res.json(result);
    }

    // ── EARNINGS GAPS ──
    if (type === 'earnings_gaps') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const cacheKey = 'eg:'+symbol.toUpperCase();
      const cached = getCached(cacheKey, 6*60*60_000);
      if (cached) return res.json(cached);
      let candles = [];
      try { candles = await yahooAggs(symbol.toUpperCase(), 730); } catch(e) {}
      const result = {symbol:symbol.toUpperCase(),candles:candles.map(c=>({t:c.time*1000,o:c.open,h:c.high,l:c.low,c:c.close,v:c.volume})),financials:[]};
      setCache(cacheKey, result);
      return res.json(result);
    }

    return res.status(400).json({error:'Unknown type: '+type});
  } catch(err) {
    console.error('market API:', err.message);
    return res.status(500).json({error:err.message});
  }
}