/**
 * /api/debug — Diagnose data source connectivity
 * Shows exactly which APIs are reachable and what they return
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // Test 1: Polygon API key present
  results.polygonKeyPresent = !!process.env.POLYGON_API_KEY;
  results.polygonKeyPrefix = process.env.POLYGON_API_KEY?.substring(0, 8) || 'MISSING';

  // Test 2: Polygon connectivity
  try {
    const start = Date.now();
    const r = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apiKey=${process.env.POLYGON_API_KEY || 'xoHj3Lx4HMcvNqNqaQRX_pj4HTNNHtta'}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const elapsed = Date.now() - start;
    if (r.ok) {
      const d = await r.json();
      const price = d?.ticker?.lastTrade?.p || d?.ticker?.day?.c || d?.ticker?.prevDay?.c;
      results.polygon = { ok: true, status: r.status, price, elapsed: elapsed+'ms' };
    } else {
      const body = await r.text();
      results.polygon = { ok: false, status: r.status, body: body.substring(0, 200), elapsed: elapsed+'ms' };
    }
  } catch (e) {
    results.polygon = { ok: false, error: e.message };
  }

  // Test 3: Yahoo Finance connectivity
  try {
    const start = Date.now();
    const r = await fetch(
      'https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL&fields=regularMarketPrice,marketState',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com',
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    const elapsed = Date.now() - start;
    if (r.ok) {
      const d = await r.json();
      const q = d?.quoteResponse?.result?.[0];
      results.yahoo = { ok: true, status: r.status, price: q?.regularMarketPrice, marketState: q?.marketState, elapsed: elapsed+'ms' };
    } else {
      const body = await r.text();
      results.yahoo = { ok: false, status: r.status, body: body.substring(0, 200), elapsed: elapsed+'ms' };
    }
  } catch (e) {
    results.yahoo = { ok: false, error: e.message };
  }

  // Test 4: Yahoo v8 (alternative endpoint)
  try {
    const start = Date.now();
    const r = await fetch(
      'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d',
      {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.yahoo.com' },
        signal: AbortSignal.timeout(5000),
      }
    );
    const elapsed = Date.now() - start;
    if (r.ok) {
      const d = await r.json();
      const meta = d?.chart?.result?.[0]?.meta;
      results.yahooV8 = { ok: true, status: r.status, price: meta?.regularMarketPrice, elapsed: elapsed+'ms' };
    } else {
      results.yahooV8 = { ok: false, status: r.status, elapsed: elapsed+'ms' };
    }
  } catch (e) {
    results.yahooV8 = { ok: false, error: e.message };
  }

  // Test 5: Alpha Vantage (free, no key needed for basic)
  try {
    const start = Date.now();
    const r = await fetch(
      'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=demo',
      { signal: AbortSignal.timeout(5000) }
    );
    const elapsed = Date.now() - start;
    results.alphaVantage = { ok: r.ok, status: r.status, elapsed: elapsed+'ms' };
  } catch (e) {
    results.alphaVantage = { ok: false, error: e.message };
  }

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    vercelRegion: process.env.VERCEL_REGION || 'unknown',
    nodeVersion: process.version,
    results
  });
}
