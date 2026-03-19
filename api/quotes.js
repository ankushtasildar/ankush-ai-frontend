/**
 * /api/quotes — Real market data, zero mock data
 * 
 * Priority chain:
 * 1. Polygon/Massive snapshot — returns last trade price 24/7 including after-hours
 * 2. Yahoo Finance v7 quote — includes preMarket/postMarket prices
 * 3. If both fail → return error, NEVER fake data
 *
 * After-hours handling:
 * - Polygon snapshot always has the last trade (even if from market close)
 * - Yahoo returns preMarketPrice/postMarketPrice when active
 * - We surface whichever extended-hours price is most recent
 */

const POLYGON_KEY = process.env.POLYGON_API_KEY || '';

async function fetchPolygon(symbols) {
  if (!POLYGON_KEY) return null;
  try {
    // Use the grouped daily endpoint for batch — or individual snapshots
    // Snapshot returns last trade + day OHLCV + prev day — works 24/7
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${POLYGON_KEY}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) return null;
        const data = await r.json();
        const t = data?.ticker;
        if (!t) return null;

        const day = t.day || {};
        const prev = t.prevDay || {};
        const lastTrade = t.lastTrade || {};
        const lastQuote = t.lastQuote || {};
        const fmv = t.fmv; // Fair market value — available on some tiers

        // Best price: last trade > day close > prev close
        const price = lastTrade.p || day.c || prev.c;
        if (!price) return null;

        const prevClose = prev.c || 0;
        const change = prevClose > 0 ? price - prevClose : t.todaysChange || 0;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : t.todaysChangePerc || 0;

        // Determine market session
        const now = new Date();
        const etHour = now.getUTCHours() - 5; // rough ET (ignores DST)
        let session = 'closed';
        if (etHour >= 9.5 && etHour < 16) session = 'regular';
        else if (etHour >= 4 && etHour < 9.5) session = 'premarket';
        else if (etHour >= 16 && etHour < 20) session = 'afterhours';

        return {
          symbol: sym,
          name: sym,
          price: parseFloat(price.toFixed(2)),
          open: parseFloat((day.o || 0).toFixed(2)),
          high: parseFloat((day.h || 0).toFixed(2)),
          low: parseFloat((day.l || 0).toFixed(2)),
          close: parseFloat((day.c || 0).toFixed(2)),
          prevClose: parseFloat(prevClose.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          changePct: parseFloat(changePct.toFixed(2)),
          volume: parseInt(day.v || 0),
          vwap: parseFloat((day.vw || 0).toFixed(2)),
          lastTradeTime: lastTrade.t ? new Date(lastTrade.t).toISOString() : null,
          session,
          source: 'polygon',
          updatedAt: new Date().toISOString(),
        };
      })
    );
    const valid = results.filter(Boolean);
    return valid.length > 0 ? valid : null;
  } catch (e) {
    console.error('Polygon fetch error:', e.message);
    return null;
  }
}

async function fetchYahoo(symbols) {
  try {
    const fields = [
      'regularMarketPrice',
      'regularMarketChange',
      'regularMarketChangePercent',
      'regularMarketVolume',
      'regularMarketOpen',
      'regularMarketDayHigh',
      'regularMarketDayLow',
      'regularMarketPreviousClose',
      'preMarketPrice',
      'preMarketChange',
      'preMarketChangePercent',
      'postMarketPrice',
      'postMarketChange',
      'postMarketChangePercent',
      'shortName',
      'regularMarketTime',
      'marketState',
    ].join(',');

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=${fields}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const data = await r.json();
    const quotes = data?.quoteResponse?.result;
    if (!quotes?.length) throw new Error('No results from Yahoo');

    return quotes.map(q => {
      const marketState = q.marketState || 'REGULAR'; // PRE, REGULAR, POST, CLOSED
      
      // Determine best current price based on market state
      let price = q.regularMarketPrice;
      let change = q.regularMarketChange;
      let changePct = q.regularMarketChangePercent;
      let session = 'regular';
      let extPrice = null;
      let extChange = null;
      let extChangePct = null;

      if (marketState === 'PRE' && q.preMarketPrice) {
        extPrice = q.preMarketPrice;
        extChange = q.preMarketChange;
        extChangePct = q.preMarketChangePercent;
        session = 'premarket';
      } else if ((marketState === 'POST' || marketState === 'POSTPOST') && q.postMarketPrice) {
        extPrice = q.postMarketPrice;
        extChange = q.postMarketChange;
        extChangePct = q.postMarketChangePercent;
        session = 'afterhours';
      } else if (marketState === 'CLOSED') {
        session = 'closed';
        // Still use last regular market price — it's real
      }

      return {
        symbol: q.symbol,
        name: q.shortName || q.symbol,
        price: parseFloat((price || 0).toFixed(2)),
        open: parseFloat((q.regularMarketOpen || 0).toFixed(2)),
        high: parseFloat((q.regularMarketDayHigh || 0).toFixed(2)),
        low: parseFloat((q.regularMarketDayLow || 0).toFixed(2)),
        prevClose: parseFloat((q.regularMarketPreviousClose || 0).toFixed(2)),
        change: parseFloat((change || 0).toFixed(2)),
        changePct: parseFloat((changePct || 0).toFixed(2)),
        volume: parseInt(q.regularMarketVolume || 0),
        // Extended hours data
        extPrice: extPrice ? parseFloat(extPrice.toFixed(2)) : null,
        extChange: extChange ? parseFloat(extChange.toFixed(2)) : null,
        extChangePct: extChangePct ? parseFloat(extChangePct.toFixed(2)) : null,
        session,
        marketState,
        source: 'yahoo',
        updatedAt: new Date().toISOString(),
      };
    });
  } catch (e) {
    console.error('Yahoo fetch error:', e.message);
    return null;
  }
}

function addSignalMetadata(quotes) {
  return quotes.map(q => {
    // Use extended hours price for signal if available
    const effectiveChangePct = q.extChangePct ?? q.changePct;
    const effectivePrice = q.extPrice ?? q.price;

    // Signal is purely directional context — NOT a recommendation
    let signalColor, trend;
    if (effectiveChangePct > 2)       { signalColor = '#10b981'; trend = 'up_strong'; }
    else if (effectiveChangePct > 0.5){ signalColor = '#34d399'; trend = 'up'; }
    else if (effectiveChangePct < -2) { signalColor = '#ef4444'; trend = 'down_strong'; }
    else if (effectiveChangePct < -0.5){ signalColor = '#f87171'; trend = 'down'; }
    else                              { signalColor = '#f59e0b'; trend = 'flat'; }

    return {
      ...q,
      effectivePrice,
      effectiveChangePct,
      trend,
      signalColor,
      // Legacy fields for compatibility with existing UI
      signal: 'WATCH',
      reason: q.session === 'premarket' ? 'Pre-market' : q.session === 'afterhours' ? 'After hours' : q.session === 'closed' ? 'Market closed' : 'Market open',
      strength: Math.abs(effectiveChangePct) > 2 ? 'HIGH' : Math.abs(effectiveChangePct) > 0.5 ? 'MODERATE' : 'LOW',
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store'); // always fresh
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { symbols = 'SPY,QQQ,AAPL,NVDA,TSLA,MSFT,META,AMZN,AMD,GOOGL' } = req.query;
  const syms = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  // Try Polygon first
  let quotes = await fetchPolygon(syms);

  // Fallback to Yahoo Finance
  if (!quotes) {
    quotes = await fetchYahoo(syms);
  }

  // If both fail — return error, no mock data
  if (!quotes || quotes.length === 0) {
    return res.status(503).json({
      error: 'Market data unavailable',
      message: 'Both Polygon and Yahoo Finance are unreachable. Please try again shortly.',
      symbols: syms,
      timestamp: new Date().toISOString(),
    });
  }

  // Add signal metadata and return
  const enriched = addSignalMetadata(quotes);
  return res.status(200).json(enriched);
}
