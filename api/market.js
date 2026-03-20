// api/market.js — Polygon.io market data proxy with caching
const POLYGON = process.env.POLYGON_API_KEY;
const BASE = 'https://api.polygon.io';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};

// In-memory cache — survives within a single serverless function instance
const cache = new Map();
function getCached(key, ttlMs) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

async function polyFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = BASE + path + sep + 'apiKey=' + POLYGON;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Polygon ' + res.status + ': ' + path);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).set(cors).end();
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v));
  const { type, symbols, symbol, from, to, timespan='day', multiplier=1, limit=200 } = req.query;

  try {
    // QUOTES — 60s cache (short, prices change during market hours)
    if (type === 'quotes') {
      const tickers = (symbols||'').split(',').filter(Boolean).slice(0,100);
      if (!tickers.length) return res.json({quotes:{}});
      const cacheKey = 'quotes:'+tickers.sort().join(',');
      const cached = getCached(cacheKey, 60_000);
      if (cached) return res.json(cached);
      const data = await polyFetch('/v2/snapshot/locale/us/markets/stocks/tickers?tickers='+tickers.join(','));
      const quotes = {};
      (data.tickers||[]).forEach(t => { quotes[t.ticker] = {symbol:t.ticker,price:t.day?.c||t.prevDay?.c||0,open:t.day?.o||0,high:t.day?.h||0,low:t.day?.l||0,close:t.day?.c||0,prevClose:t.prevDay?.c||0,change:t.todaysChange||0,changePct:t.todaysChangePerc||0,volume:t.day?.v||0,vwap:t.day?.vw||0,updated:Date.now()}; });
      const result = {quotes};
      setCache(cacheKey, result);
      return res.json(result);
    }

    // AGGS — 4h cache for daily/weekly, 5m for intraday
    if (type === 'aggs') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const cacheKey = 'aggs:'+symbol+':'+timespan+':'+multiplier+':'+from+':'+to;
      const ttl = (timespan === 'day' || timespan === 'week') ? 4*60*60_000 : 5*60_000;
      const cached = getCached(cacheKey, ttl);
      if (cached) return res.json(cached);
      const fromDate = from || new Date(Date.now()-365*24*60*60*1000).toISOString().split('T')[0];
      const toDate = to || new Date().toISOString().split('T')[0];
      const data = await polyFetch('/v2/aggs/ticker/'+symbol.toUpperCase()+'/range/'+multiplier+'/'+timespan+'/'+fromDate+'/'+toDate+'?adjusted=true&sort=asc&limit='+limit);
      const candles = (data.results||[]).map(r => ({time:Math.floor(r.t/1000),open:r.o,high:r.h,low:r.l,close:r.c,volume:r.v}));
      const result = {symbol:symbol.toUpperCase(),candles,count:candles.length};
      setCache(cacheKey, result);
      return res.json(result);
    }

    // SEARCH — 24h cache (ticker names don't change)
    if (type === 'search') {
      const q = req.query.q||'';
      if (!q) return res.json({results:[]});
      const cacheKey = 'search:'+q.toLowerCase();
      const cached = getCached(cacheKey, 24*60*60_000);
      if (cached) return res.json(cached);
      const data = await polyFetch('/v3/reference/tickers?search='+encodeURIComponent(q)+'&active=true&market=stocks&order=asc&limit=20');
      const result = {results:(data.results||[]).map(t => ({symbol:t.ticker,name:t.name,type:t.type,exchange:t.primary_exchange}))};
      setCache(cacheKey, result);
      return res.json(result);
    }

    // SNAPSHOT — 60s cache
    if (type === 'snapshot') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const cacheKey = 'snap:'+symbol.toUpperCase();
      const cached = getCached(cacheKey, 60_000);
      if (cached) return res.json(cached);
      const [snap,details] = await Promise.allSettled([
        polyFetch('/v2/snapshot/locale/us/markets/stocks/tickers/'+symbol.toUpperCase()),
        polyFetch('/v3/reference/tickers/'+symbol.toUpperCase())
      ]);
      const t = snap.status==='fulfilled' ? snap.value.ticker : {};
      const d = details.status==='fulfilled' ? details.value.results : {};
      const result = {symbol:symbol.toUpperCase(),price:t.day?.c||t.prevDay?.c||0,change:t.todaysChange||0,changePct:t.todaysChangePerc||0,volume:t.day?.v||0,vwap:t.day?.vw||0,high52w:d.high_price||null,low52w:d.low_price||null,marketCap:d.market_cap||null,description:d.description||'',name:d.name||symbol,sic:d.sic_description||''};
      setCache(cacheKey, result);
      return res.json(result);
    }

    // MOVERS — 2m cache
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

    // EARNINGS GAPS — 6h cache
    if (type === 'earnings_gaps') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const cacheKey = 'earnings:'+symbol.toUpperCase();
      const cached = getCached(cacheKey, 6*60*60_000);
      if (cached) return res.json(cached);
      const fromDate = new Date(Date.now()-730*24*60*60*1000).toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];
      const [aggs,earnings] = await Promise.allSettled([
        polyFetch('/v2/aggs/ticker/'+symbol.toUpperCase()+'/range/1/day/'+fromDate+'/'+toDate+'?adjusted=true&sort=asc&limit=730'),
        polyFetch('/vX/reference/financials?ticker='+symbol.toUpperCase()+'&timeframe=quarterly&limit=12')
      ]);
      const result = {symbol:symbol.toUpperCase(),candles:(aggs.value?.results||[]).map(r=>({t:r.t,o:r.o,h:r.h,l:r.l,c:r.c,v:r.v})),financials:earnings.value?.results||[]};
      setCache(cacheKey, result);
      return res.json(result);
    }

    return res.status(400).json({error:'Unknown type: '+type});
  } catch(err) {
    console.error('market API error:', err.message);
    // On 429, return cached data if available (even stale)
    if (err.message.includes('429')) {
      const staleKey = type+':'+symbol;
      const stale = cache.get(staleKey);
      if (stale) {
        console.log('Returning stale cache for 429');
        return res.json(stale.data);
      }
    }
    return res.status(500).json({error:err.message});
  }
}