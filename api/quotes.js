/**
 * /api/quotes — Real market data via Yahoo Finance v8 chart API
 *
 * Yahoo v7 quote endpoint gets 429-blocked from Vercel IPs.
 * Yahoo v8 chart endpoint (query2.finance.yahoo.com/v8/finance/chart) works reliably.
 * It returns: regularMarketPrice, preMarket/postMarket prices, OHLCV, marketState.
 *
 * Polygon snapshot endpoint requires paid plan (403 on free tier).
 * Polygon aggregates endpoint IS available on free tier — used as secondary check.
 *
 * Priority: Yahoo v8 chart → Polygon aggregates → 503 error (no mock data)
 */

async function fetchYahooV8(symbol) {
  try {
    // v8/finance/chart returns full quote metadata including extended hours
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d&includePrePost=true`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
        'Origin': 'https://finance.yahoo.com',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!r.ok) throw new Error(`Yahoo v8 HTTP ${r.status}`);
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No chart result');

    const meta = result.meta;
    if (!meta) throw new Error('No meta in chart result');

    const marketState = meta.marketState || 'CLOSED'; // PRE, REGULAR, POST, CLOSED, PREPRE, POSTPOST
    const regularPrice = meta.regularMarketPrice || 0;
    const prevClose = meta.chartPreviousClose || meta.previousClose || regularPrice;
    const regularChange = regularPrice - prevClose;
    const regularChangePct = prevClose > 0 ? (regularChange / prevClose) * 100 : 0;

    // Extended hours prices
    let extPrice = null, extChange = null, extChangePct = null, session = 'closed';

    if (marketState === 'REGULAR') {
      session = 'regular';
    } else if ((marketState === 'PRE' || marketState === 'PREPRE') && meta.preMarketPrice) {
      extPrice = meta.preMarketPrice;
      extChange = extPrice - regularPrice;
      extChangePct = regularPrice > 0 ? (extChange / regularPrice) * 100 : 0;
      session = 'premarket';
    } else if ((marketState === 'POST' || marketState === 'POSTPOST') && meta.postMarketPrice) {
      extPrice = meta.postMarketPrice;
      extChange = extPrice - regularPrice;
      extChangePct = regularPrice > 0 ? (extChange / regularPrice) * 100 : 0;
      session = 'afterhours';
    }

    // OHLCV from latest bar
    const quotes = result.indicators?.quote?.[0];
    const lastIdx = (result.timestamp?.length || 1) - 1;
    const open  = quotes?.open?.[lastIdx]  || meta.regularMarketOpen || regularPrice;
    const high  = quotes?.high?.[lastIdx]  || meta.regularMarketDayHigh || regularPrice;
    const low   = quotes?.low?.[lastIdx]   || meta.regularMarketDayLow  || regularPrice;
    const volume= quotes?.volume?.[lastIdx]|| meta.regularMarketVolume  || 0;

    return {
      symbol: symbol.toUpperCase(),
      name: meta.shortName || meta.longName || symbol,
      price: parseFloat(regularPrice.toFixed(2)),
      open:  parseFloat((open || 0).toFixed(2)),
      high:  parseFloat((high || 0).toFixed(2)),
      low:   parseFloat((low  || 0).toFixed(2)),
      prevClose: parseFloat(prevClose.toFixed(2)),
      change:    parseFloat(regularChange.toFixed(2)),
      changePct: parseFloat(regularChangePct.toFixed(2)),
      volume:    parseInt(volume),
      // Extended hours
      extPrice:     extPrice    ? parseFloat(extPrice.toFixed(2))     : null,
      extChange:    extChange   ? parseFloat(extChange.toFixed(2))    : null,
      extChangePct: extChangePct? parseFloat(extChangePct.toFixed(2)) : null,
      session,
      marketState,
      currency: meta.currency || 'USD',
      exchange: meta.exchangeName || '',
      source: 'yahoo_v8',
      updatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error(`Yahoo v8 failed for ${symbol}:`, e.message);
    return null;
  }
}

async function fetchPolygonPrev(symbol) {
  // Polygon /v2/aggs (aggregates) — available on free tier unlike snapshot
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;
  try {
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 5);
    const fromStr = from.toISOString().split('T')[0];
    const toStr   = today.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=1&apiKey=${key}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    const bar = d?.results?.[0];
    if (!bar) return null;

    return {
      symbol: symbol.toUpperCase(),
      name: symbol,
      price: parseFloat(bar.c.toFixed(2)),
      open:  parseFloat(bar.o.toFixed(2)),
      high:  parseFloat(bar.h.toFixed(2)),
      low:   parseFloat(bar.l.toFixed(2)),
      prevClose: parseFloat(bar.c.toFixed(2)),
      change: 0, changePct: 0,
      volume: parseInt(bar.v),
      extPrice: null, extChange: null, extChangePct: null,
      session: 'closed',
      marketState: 'CLOSED',
      currency: 'USD',
      source: 'polygon_agg',
      updatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return null;
  }
}

function addSignalMeta(q) {
  const chgPct = q.extChangePct ?? q.changePct;
  const effectivePrice = q.extPrice ?? q.price;

  let signalColor, trend;
  if      (chgPct >  2)  { signalColor = '#10b981'; trend = 'up_strong'; }
  else if (chgPct >  0.5){ signalColor = '#34d399'; trend = 'up'; }
  else if (chgPct < -2)  { signalColor = '#ef4444'; trend = 'down_strong'; }
  else if (chgPct < -0.5){ signalColor = '#f87171'; trend = 'down'; }
  else                   { signalColor = '#f59e0b'; trend = 'flat'; }

  const sessionLabel = {
    regular:    'Market Open',
    premarket:  'Pre-Market',
    afterhours: 'After Hours',
    closed:     'Market Closed',
  }[q.session] || 'Market Closed';

  return {
    ...q,
    effectivePrice,
    effectiveChangePct: chgPct,
    trend,
    signalColor,
    signal: 'WATCH',
    reason: sessionLabel,
    strength: Math.abs(chgPct) > 2 ? 'HIGH' : Math.abs(chgPct) > 0.5 ? 'MODERATE' : 'LOW',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { symbols = 'SPY,QQQ,AAPL,NVDA,TSLA,MSFT,META,AMZN,AMD,GOOGL' } = req.query;
  const syms = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  // Fetch all symbols in parallel via Yahoo v8
  const results = await Promise.all(
    syms.map(async sym => {
      const q = await fetchYahooV8(sym);
      if (q) return q;
      // Fallback to Polygon aggregates
      return await fetchPolygonPrev(sym);
    })
  );

  const valid = results.filter(Boolean);

  if (valid.length === 0) {
    return res.status(503).json({
      error: 'Market data unavailable',
      message: 'Could not fetch data from Yahoo Finance or Polygon. Please try again shortly.',
      symbols: syms,
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(200).json(valid.map(addSignalMeta));
}
