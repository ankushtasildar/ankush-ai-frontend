/**
 * /api/chart — OHLCV chart data for a symbol
 * Returns daily bars for sparklines and price charts
 *
 * Source: Polygon aggregates (free tier, always works)
 * Fallback: Yahoo v8 finance chart (also confirmed working)
 *
 * ?symbol=AAPL&days=30&interval=1day
 */

const POLYGON_KEY = process.env.POLYGON_API_KEY || '';

function fmtDate(d) { return d.toISOString().split('T')[0]; }
function r2(n) { return parseFloat((n || 0).toFixed(2)); }

async function fetchPolygonBars(symbol, days) {
  if (!POLYGON_KEY) return null;
  try {
    const to   = new Date();
    const from = new Date(); from.setDate(from.getDate() - days - 10); // extra buffer for weekends
    const url  = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fmtDate(from)}/${fmtDate(to)}?adjusted=true&sort=asc&limit=${days + 15}&apiKey=${POLYGON_KEY}`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d    = await r.json();
    if (!d?.results?.length) return null;

    const bars = d.results.slice(-days).map(b => ({
      date:   new Date(b.t).toISOString().split('T')[0],
      open:   r2(b.o), high: r2(b.h), low: r2(b.l), close: r2(b.c),
      volume: parseInt(b.v), vwap: r2(b.vw),
    }));
    return { bars, source: 'polygon' };
  } catch (e) {
    return null;
  }
}

async function fetchYahooChart(symbol, days) {
  try {
    const range = days <= 7 ? '7d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : '6mo';
    const url   = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
    const r     = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://finance.yahoo.com',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const res  = data?.chart?.result?.[0];
    if (!res?.timestamp) throw new Error('no data');

    const q = res.indicators.quote[0];
    const bars = res.timestamp.map((ts, i) => ({
      date:   new Date(ts * 1000).toISOString().split('T')[0],
      open:   r2(q.open?.[i]), high: r2(q.high?.[i]),
      low:    r2(q.low?.[i]),  close: r2(q.close?.[i]),
      volume: parseInt(q.volume?.[i] || 0),
    })).filter(b => b.close > 0).slice(-days);

    return { bars, source: 'yahoo_v8' };
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5min cache for chart data
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { symbol, days: daysParam = '30' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const sym  = symbol.toUpperCase();
  const days = Math.min(365, Math.max(5, parseInt(daysParam) || 30));

  // Try Polygon first (free tier aggregates always work)
  let result = await fetchPolygonBars(sym, days);

  // Fallback to Yahoo v8
  if (!result) result = await fetchYahooChart(sym, days);

  if (!result?.bars?.length) {
    return res.status(503).json({
      error: 'Chart data unavailable',
      symbol: sym,
    });
  }

  const bars = result.bars;
  const closes = bars.map(b => b.close);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const periodChange = first > 0 ? ((last - first) / first) * 100 : 0;
  const high52w = Math.max(...closes);
  const low52w  = Math.min(...closes);

  return res.status(200).json({
    symbol: sym,
    bars,
    meta: {
      periodDays:    bars.length,
      periodChange:  r2(periodChange),
      firstClose:    r2(first),
      lastClose:     r2(last),
      periodHigh:    r2(high52w),
      periodLow:     r2(low52w),
      source:        result.source,
      fetchedAt:     new Date().toISOString(),
    },
  });
}
