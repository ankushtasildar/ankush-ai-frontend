/**
 * /api/quotes — Real market data, zero mock
 *
 * Tier 1: Yahoo Finance v8/finance/quote (batch, different RL from v7) 
 * Tier 2: Yahoo Finance v8/finance/chart (per-symbol, serialized)
 * Tier 3: Polygon aggregates with 2 bars (so we can compute day change)
 * Error:  503 — never fake data
 */

const YH = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com',
  'Origin': 'https://finance.yahoo.com',
};

function r2(n) { return parseFloat((n || 0).toFixed(2)); }
function fmtDate(d) { return d.toISOString().split('T')[0]; }

// ── Tier 1: Yahoo v8/finance/quote batch ─────────────────────────────────────
async function fetchYahooQuoteBatch(symbols) {
  try {
    const fields = [
      'regularMarketPrice','regularMarketChange','regularMarketChangePercent',
      'regularMarketVolume','regularMarketOpen','regularMarketDayHigh',
      'regularMarketDayLow','regularMarketPreviousClose',
      'preMarketPrice','preMarketChange','preMarketChangePercent',
      'postMarketPrice','postMarketChange','postMarketChangePercent',
      'shortName','marketState','fiftyTwoWeekHigh','fiftyTwoWeekLow',
    ].join(',');

    const url = `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${symbols.join(',')}&fields=${fields}&formatted=false`;
    const r = await fetch(url, { headers: YH, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const results = data?.quoteResponse?.result;
    if (!results?.length) throw new Error('empty');
    return results.map(buildFromQuote);
  } catch (e) {
    console.error('Yahoo v8/quote batch:', e.message);
    return null;
  }
}

// ── Tier 2: Yahoo v8/chart per-symbol ────────────────────────────────────────
async function fetchYahooChart(symbol) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d&includePrePost=true`;
    const r = await fetch(url, { headers: YH, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const res = data?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta?.regularMarketPrice) throw new Error('no price');

    const ms = meta.marketState || 'CLOSED';
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose || price;

    let extPrice = null, extChange = null, extChangePct = null, session = 'closed';
    if      (ms === 'REGULAR')                          { session = 'regular'; }
    else if ((ms === 'PRE'||ms==='PREPRE')  && meta.preMarketPrice)  { extPrice = meta.preMarketPrice;  session = 'premarket'; }
    else if ((ms === 'POST'||ms==='POSTPOST')&& meta.postMarketPrice){ extPrice = meta.postMarketPrice; session = 'afterhours'; }
    if (extPrice) { extChange = extPrice - price; extChangePct = price > 0 ? (extChange/price)*100 : 0; }

    const q = res?.indicators?.quote?.[0];
    const li = (res?.timestamp?.length || 1) - 1;
    return {
      symbol: symbol.toUpperCase(),
      name: meta.shortName || meta.longName || symbol,
      price: r2(price), open: r2(q?.open?.[li] || meta.regularMarketOpen || price),
      high: r2(q?.high?.[li] || meta.regularMarketDayHigh || price),
      low: r2(q?.low?.[li]  || meta.regularMarketDayLow  || price),
      prevClose: r2(prev),
      change: r2(price - prev), changePct: r2(prev > 0 ? ((price-prev)/prev)*100 : 0),
      volume: parseInt(q?.volume?.[li] || meta.regularMarketVolume || 0),
      extPrice: extPrice ? r2(extPrice) : null,
      extChange: extChange ? r2(extChange) : null,
      extChangePct: extChangePct ? r2(extChangePct) : null,
      week52High: r2(meta.fiftyTwoWeekHigh), week52Low: r2(meta.fiftyTwoWeekLow),
      session, marketState: ms, currency: meta.currency || 'USD', source: 'yahoo_v8_chart',
    };
  } catch (e) { return null; }
}

// ── Tier 3: Polygon aggregates (2 bars → real change %) ──────────────────────
async function fetchPolygonAgg(symbol) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;
  try {
    const to   = new Date();
    const from = new Date(); from.setDate(from.getDate() - 7); // back 7 days to cover weekends
    const url  = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fmtDate(from)}/${fmtDate(to)}?adjusted=true&sort=desc&limit=2&apiKey=${key}`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d    = await r.json();
    const bars = d?.results;
    if (!bars?.length) return null;

    const today = bars[0];           // most recent session
    const prev  = bars[1] || today;  // previous session

    const price    = today.c;
    const prevClose= prev.c;
    const change   = price - prevClose;
    const changePct= prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: symbol.toUpperCase(), name: symbol,
      price: r2(price), open: r2(today.o), high: r2(today.h), low: r2(today.l),
      prevClose: r2(prevClose), change: r2(change), changePct: r2(changePct),
      volume: parseInt(today.v),
      extPrice: null, extChange: null, extChangePct: null,
      session: 'closed', marketState: 'CLOSED', currency: 'USD',
      source: 'polygon_agg',
    };
  } catch (e) { return null; }
}

function buildFromQuote(q) {
  const ms = q.marketState || 'CLOSED';
  const price = q.regularMarketPrice || 0;
  const prev  = q.regularMarketPreviousClose || price;
  let extPrice = null, extChange = null, extChangePct = null, session = 'closed';
  if      (ms === 'REGULAR')                                     { session = 'regular'; }
  else if ((ms==='PRE'||ms==='PREPRE')  && q.preMarketPrice)     { extPrice=q.preMarketPrice; extChange=q.preMarketChange; extChangePct=q.preMarketChangePercent; session='premarket'; }
  else if ((ms==='POST'||ms==='POSTPOST')&& q.postMarketPrice)   { extPrice=q.postMarketPrice; extChange=q.postMarketChange; extChangePct=q.postMarketChangePercent; session='afterhours'; }
  return {
    symbol: q.symbol, name: q.shortName || q.symbol,
    price: r2(price), open: r2(q.regularMarketOpen), high: r2(q.regularMarketDayHigh),
    low: r2(q.regularMarketDayLow), prevClose: r2(prev),
    change: r2(q.regularMarketChange || 0), changePct: r2(q.regularMarketChangePercent || 0),
    volume: parseInt(q.regularMarketVolume || 0),
    extPrice: extPrice ? r2(extPrice) : null,
    extChange: extChange ? r2(extChange) : null,
    extChangePct: extChangePct ? r2(extChangePct) : null,
    week52High: r2(q.fiftyTwoWeekHigh), week52Low: r2(q.fiftyTwoWeekLow),
    session, marketState: ms, currency: q.currency || 'USD', source: 'yahoo_v8_quote',
  };
}

function addMeta(q) {
  const chgPct = q.extChangePct ?? q.changePct;
  const effectivePrice = q.extPrice ?? q.price;
  let signalColor, trend;
  if      (chgPct >  2)  { signalColor='#10b981'; trend='up_strong'; }
  else if (chgPct >  0.5){ signalColor='#34d399'; trend='up'; }
  else if (chgPct < -2)  { signalColor='#ef4444'; trend='down_strong'; }
  else if (chgPct < -0.5){ signalColor='#f87171'; trend='down'; }
  else                   { signalColor='#f59e0b'; trend='flat'; }
  const sl = { regular:'Market Open', premarket:'Pre-Market', afterhours:'After Hours', closed:'Market Closed' }[q.session] || 'Market Closed';
  return { ...q, effectivePrice, effectiveChangePct: chgPct, trend, signalColor,
    signal:'WATCH', reason:sl, strength: Math.abs(chgPct)>2?'HIGH':Math.abs(chgPct)>0.5?'MODERATE':'LOW',
    updatedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { symbols = 'SPY,QQQ,AAPL,NVDA,TSLA,MSFT,META,AMZN,AMD,GOOGL' } = req.query;
  const syms = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  // Tier 1: Yahoo batch
  let quotes = await fetchYahooQuoteBatch(syms);

  // Tier 2: Yahoo chart (serialized with delay to avoid RL)
  if (!quotes) {
    const results = [];
    for (const sym of syms) {
      const q = await fetchYahooChart(sym);
      if (q) results.push(q);
      if (syms.length > 3) await new Promise(r => setTimeout(r, 120));
    }
    if (results.length > 0) quotes = results;
  }

  // Tier 3: Fill any missing with Polygon agg (2 bars = real change)
  if (!quotes || quotes.length < syms.length) {
    const have = new Set(quotes?.map(q => q.symbol) || []);
    const missing = syms.filter(s => !have.has(s));
    const poly = await Promise.all(missing.map(fetchPolygonAgg));
    quotes = [...(quotes || []), ...poly.filter(Boolean)];
  }

  if (!quotes?.length) {
    return res.status(503).json({
      error: 'Market data unavailable',
      message: 'All data sources failed. Please try again shortly.',
      symbols: syms, timestamp: new Date().toISOString(),
    });
  }

  return res.status(200).json(quotes.map(addMeta));
}
