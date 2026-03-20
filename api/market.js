// api/market.js — Polygon.io universal market data proxy
const POLYGON = process.env.POLYGON_API_KEY;
const BASE = 'https://api.polygon.io';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
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
    if (type === 'quotes') {
      const tickers = (symbols||'').split(',').filter(Boolean).slice(0,100);
      if (!tickers.length) return res.json({quotes:{}});
      const data = await polyFetch('/v2/snapshot/locale/us/markets/stocks/tickers?tickers=' + tickers.join(','));
      const quotes = {};
      (data.tickers||[]).forEach(t => { quotes[t.ticker] = {symbol:t.ticker,price:t.day?.c||t.prevDay?.c||0,open:t.day?.o||0,high:t.day?.h||0,low:t.day?.l||0,close:t.day?.c||0,prevClose:t.prevDay?.c||0,change:t.todaysChange||0,changePct:t.todaysChangePerc||0,volume:t.day?.v||0,vwap:t.day?.vw||0,updated:Date.now()}; });
      return res.json({quotes});
    }
    if (type === 'aggs') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const fromDate = from || new Date(Date.now()-365*24*60*60*1000).toISOString().split('T')[0];
      const toDate = to || new Date().toISOString().split('T')[0];
      const data = await polyFetch('/v2/aggs/ticker/'+symbol.toUpperCase()+'/range/'+multiplier+'/'+timespan+'/'+fromDate+'/'+toDate+'?adjusted=true&sort=asc&limit='+limit);
      const candles = (data.results||[]).map(r => ({time:Math.floor(r.t/1000),open:r.o,high:r.h,low:r.l,close:r.c,volume:r.v}));
      return res.json({symbol:symbol.toUpperCase(),candles,count:candles.length});
    }
    if (type === 'search') {
      const q = req.query.q||'';
      if (!q) return res.json({results:[]});
      const data = await polyFetch('/v3/reference/tickers?search='+encodeURIComponent(q)+'&active=true&market=stocks&order=asc&limit=20');
      return res.json({results:(data.results||[]).map(t => ({symbol:t.ticker,name:t.name,type:t.type,exchange:t.primary_exchange}))});
    }
    if (type === 'snapshot') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const [snap,details] = await Promise.allSettled([polyFetch('/v2/snapshot/locale/us/markets/stocks/tickers/'+symbol.toUpperCase()),polyFetch('/v3/reference/tickers/'+symbol.toUpperCase())]);
      const t = snap.status==='fulfilled' ? snap.value.ticker : {};
      const d = details.status==='fulfilled' ? details.value.results : {};
      return res.json({symbol:symbol.toUpperCase(),price:t.day?.c||t.prevDay?.c||0,change:t.todaysChange||0,changePct:t.todaysChangePerc||0,volume:t.day?.v||0,vwap:t.day?.vw||0,high52w:d.high_price||null,low52w:d.low_price||null,marketCap:d.market_cap||null,description:d.description||'',name:d.name||symbol,sic:d.sic_description||''});
    }
    if (type === 'movers') {
      const direction = req.query.direction||'gainers';
      const data = await polyFetch('/v2/snapshot/locale/us/markets/stocks/'+direction+'?include_otc=false');
      return res.json({movers:(data.tickers||[]).slice(0,30).map(t => ({symbol:t.ticker,price:t.day?.c||0,change:t.todaysChange||0,changePct:t.todaysChangePerc||0,volume:t.day?.v||0,prevClose:t.prevDay?.c||0}))});
    }
    if (type === 'earnings_gaps') {
      if (!symbol) return res.status(400).json({error:'symbol required'});
      const fromDate = new Date(Date.now()-730*24*60*60*1000).toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];
      const [aggs,earnings] = await Promise.allSettled([polyFetch('/v2/aggs/ticker/'+symbol.toUpperCase()+'/range/1/day/'+fromDate+'/'+toDate+'?adjusted=true&sort=asc&limit=730'),polyFetch('/vX/reference/financials?ticker='+symbol.toUpperCase()+'&timeframe=quarterly&limit=12')]);
      return res.json({symbol:symbol.toUpperCase(),candles:(aggs.value?.results||[]).map(r => ({t:r.t,o:r.o,h:r.h,l:r.l,c:r.c,v:r.v})),financials:earnings.value?.results||[]});
    }
    return res.status(400).json({error:'Unknown type: '+type});
  } catch(err) {
    console.error('market API error:', err.message);
    return res.status(500).json({error:err.message});
  }
}