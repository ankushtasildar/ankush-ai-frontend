/**
 * /api/quotes — Yahoo Finance v8 chart, single-batch call for all symbols
 *
 * Key insight from debug: yahooV8 works fine individually but 10 parallel calls
 * from Vercel triggers rate limiting. Solution: use Yahoo's multi-symbol approach
 * via query2.finance.yahoo.com/v8/finance/spark (lightweight batch endpoint)
 * OR serialize requests with small delay.
 *
 * Best approach: Yahoo v8/finance/quote (NOT v7) — different rate limit bucket
 * from v7, supports multiple symbols in one call.
 */

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com',
  'Origin': 'https://finance.yahoo.com',
};

async function fetchBatch(symbols) {
  // Strategy 1: Yahoo Finance crumb-free quote endpoint via query2
  // This is what Yahoo's own mobile app uses — different rate limit from v7
  try {
    const fields = [
      'regularMarketPrice','regularMarketChange','regularMarketChangePercent',
      'regularMarketVolume','regularMarketOpen','regularMarketDayHigh','regularMarketDayLow',
      'regularMarketPreviousClose','preMarketPrice','preMarketChange','preMarketChangePercent',
      'postMarketPrice','postMarketChange','postMarketChangePercent',
      'shortName','marketState','regularMarketTime',
      'fiftyTwoWeekHigh','fiftyTwoWeekLow',
    ].join(',');

    const url = `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${symbols.join(',')}&fields=${fields}&formatted=false`;
    const r = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) });

    if (!r.ok) throw new Error(`Yahoo v8/quote HTTP ${r.status}`);
    const data = await r.json();
    const quotes = data?.quoteResponse?.result;
    if (!quotes?.length) throw new Error('No results');

    return quotes.map(q => buildQuote(q));
  } catch (e) {
    console.error('Yahoo v8/quote batch failed:', e.message);
    return null;
  }
}

async function fetchV8Chart(symbol) {
  // Per-symbol v8 chart — the one confirmed working in debug
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d&includePrePost=true`;
    const r = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) throw new Error('No price in meta');

    const marketState = meta.marketState || 'CLOSED';
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;

    // Extended hours
    let extPrice = null, extChange = null, extChangePct = null, session = 'closed';
    if      (marketState === 'REGULAR')                          { session = 'regular'; }
    else if ((marketState === 'PRE' || marketState === 'PREPRE') && meta.preMarketPrice)  { extPrice = meta.preMarketPrice; session = 'premarket'; }
    else if ((marketState === 'POST'|| marketState === 'POSTPOST')&& meta.postMarketPrice){ extPrice = meta.postMarketPrice; session = 'afterhours'; }

    if (extPrice) {
      extChange    = extPrice - price;
      extChangePct = price > 0 ? (extChange / price) * 100 : 0;
    }

    const quotes = result?.indicators?.quote?.[0];
    const lastIdx = (result?.timestamp?.length || 1) - 1;

    return {
      symbol:    symbol.toUpperCase(),
      name:      meta.shortName || meta.longName || symbol,
      price:     round(price),
      open:      round(quotes?.open?.[lastIdx]  || meta.regularMarketOpen || price),
      high:      round(quotes?.high?.[lastIdx]  || meta.regularMarketDayHigh || price),
      low:       round(quotes?.low?.[lastIdx]   || meta.regularMarketDayLow  || price),
      prevClose: round(prevClose),
      change:    round(price - prevClose),
      changePct: round(prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0),
      volume:    parseInt(quotes?.volume?.[lastIdx] || meta.regularMarketVolume || 0),
      extPrice:     extPrice    ? round(extPrice)     : null,
      extChange:    extChange   ? round(extChange)    : null,
      extChangePct: extChangePct? round(extChangePct) : null,
      session, marketState,
      currency: meta.currency || 'USD',
      source: 'yahoo_v8_chart',
    };
  } catch (e) {
    return null;
  }
}

async function fetchPolygonAgg(symbol) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;
  try {
    const to   = new Date(); const from = new Date(); from.setDate(from.getDate() - 5);
    const url  = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=desc&limit=1&apiKey=${key}`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d    = await r.json();
    const bar  = d?.results?.[0];
    if (!bar)  return null;
    return {
      symbol: symbol.toUpperCase(), name: symbol,
      price: round(bar.c), open: round(bar.o), high: round(bar.h), low: round(bar.l),
      prevClose: round(bar.c), change: 0, changePct: 0, volume: parseInt(bar.v),
      extPrice: null, extChange: null, extChangePct: null,
      session: 'closed', marketState: 'CLOSED', currency: 'USD',
      source: 'polygon_agg',
    };
  } catch (e) { return null; }
}

function buildQuote(q) {
  const marketState = q.marketState || 'CLOSED';
  const price = q.regularMarketPrice || 0;
  const prevClose = q.regularMarketPreviousClose || price;
  let extPrice = null, extChange = null, extChangePct = null, session = 'closed';

  if      (marketState === 'REGULAR')                                    { session = 'regular'; }
  else if ((marketState === 'PRE'||marketState==='PREPRE') && q.preMarketPrice)  { extPrice = q.preMarketPrice; extChange = q.preMarketChange; extChangePct = q.preMarketChangePercent; session = 'premarket'; }
  else if ((marketState === 'POST'||marketState==='POSTPOST') && q.postMarketPrice) { extPrice = q.postMarketPrice; extChange = q.postMarketChange; extChangePct = q.postMarketChangePercent; session = 'afterhours'; }

  return {
    symbol:    q.symbol,
    name:      q.shortName || q.symbol,
    price:     round(price),
    open:      round(q.regularMarketOpen    || 0),
    high:      round(q.regularMarketDayHigh || 0),
    low:       round(q.regularMarketDayLow  || 0),
    prevClose: round(prevClose),
    change:    round(q.regularMarketChange  || 0),
    changePct: round(q.regularMarketChangePercent || 0),
    volume:    parseInt(q.regularMarketVolume || 0),
    extPrice:     extPrice    ? round(extPrice)     : null,
    extChange:    extChange   ? round(extChange)    : null,
    extChangePct: extChangePct? round(extChangePct) : null,
    week52High: round(q.fiftyTwoWeekHigh || 0),
    week52Low:  round(q.fiftyTwoWeekLow  || 0),
    session, marketState,
    currency: q.currency || 'USD',
    source: 'yahoo_v8_quote',
  };
}

function round(n) { return parseFloat((n || 0).toFixed(2)); }
function fmt(d)   { return d.toISOString().split('T')[0]; }

function addSignalMeta(q) {
  const chgPct = q.extChangePct ?? q.changePct;
  const effectivePrice = q.extPrice ?? q.price;
  let signalColor, trend;
  if      (chgPct >  2) { signalColor='#10b981'; trend='up_strong'; }
  else if (chgPct >  0.5){ signalColor='#34d399'; trend='up'; }
  else if (chgPct < -2) { signalColor='#ef4444'; trend='down_strong'; }
  else if (chgPct < -0.5){ signalColor='#f87171'; trend='down'; }
  else                  { signalColor='#f59e0b'; trend='flat'; }
  const sessionLabel = { regular:'Market Open', premarket:'Pre-Market', afterhours:'After Hours', closed:'Market Closed' }[q.session] || 'Market Closed';
  return { ...q, effectivePrice, effectiveChangePct: chgPct, trend, signalColor,
    signal:'WATCH', reason:sessionLabel, strength: Math.abs(chgPct)>2?'HIGH':Math.abs(chgPct)>0.5?'MODERATE':'LOW',
    updatedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { symbols = 'SPY,QQQ,AAPL,NVDA,TSLA,MSFT,META,AMZN,AMD,GOOGL' } = req.query;
  const syms = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  // Strategy 1: Yahoo v8/finance/quote — batch, different rate limit than v7
  let quotes = await fetchBatch(syms);

  // Strategy 2: Per-symbol v8 chart (confirmed working in debug, serialize to avoid rate limit)
  if (!quotes) {
    const results = [];
    for (const sym of syms) {
      const q = await fetchV8Chart(sym);
      if (q) results.push(q);
      // Small delay between requests to avoid rate limiting
      if (syms.length > 3) await new Promise(r => setTimeout(r, 150));
    }
    if (results.length > 0) quotes = results;
  }

  // Strategy 3: Polygon aggregates (end-of-day, always available on free tier)
  if (!quotes || quotes.length < syms.length) {
    const missing = syms.filter(s => !quotes?.find(q => q.symbol === s));
    const polygonResults = await Promise.all(missing.map(fetchPolygonAgg));
    const valid = polygonResults.filter(Boolean);
    quotes = [...(quotes || []), ...valid];
  }

  if (!quotes?.length) {
    return res.status(503).json({
      error: 'Market data unavailable',
      message: 'All data sources failed. Please try again shortly.',
      symbols: syms,
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(200).json(quotes.map(addSignalMeta));
}
