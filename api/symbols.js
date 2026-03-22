// api/symbols.js — Ticker search via Polygon Reference API
// Supports: ?q=NVD (prefix search), ?q=NVIDIA (name search), ?limit=8
// Used by Alpha Intelligence page for open ticker search

const POLYGON = process.env.POLYGON_API_KEY;
const cache = {};
const CACHE_TTL = 3600000; // 1 hour — ticker names don't change

// Curated popular tickers for instant results when query is short
const POPULAR = [
  {ticker:'SPY',name:'SPDR S&P 500 ETF Trust',market:'ETF'},
  {ticker:'QQQ',name:'Invesco QQQ Trust',market:'ETF'},
  {ticker:'NVDA',name:'NVIDIA Corporation',market:'NYSE'},
  {ticker:'AAPL',name:'Apple Inc.',market:'NASDAQ'},
  {ticker:'MSFT',name:'Microsoft Corporation',market:'NASDAQ'},
  {ticker:'META',name:'Meta Platforms Inc.',market:'NASDAQ'},
  {ticker:'TSLA',name:'Tesla Inc.',market:'NASDAQ'},
  {ticker:'AMZN',name:'Amazon.com Inc.',market:'NASDAQ'},
  {ticker:'GOOGL',name:'Alphabet Inc.',market:'NASDAQ'},
  {ticker:'AMD',name:'Advanced Micro Devices',market:'NASDAQ'},
  {ticker:'PLTR',name:'Palantir Technologies',market:'NYSE'},
  {ticker:'CRWD',name:'CrowdStrike Holdings',market:'NASDAQ'},
  {ticker:'COIN',name:'Coinbase Global',market:'NASDAQ'},
  {ticker:'MSTR',name:'MicroStrategy Inc.',market:'NASDAQ'},
  {ticker:'JPM',name:'JPMorgan Chase & Co.',market:'NYSE'},
  {ticker:'GS',name:'Goldman Sachs Group',market:'NYSE'},
  {ticker:'IWM',name:'iShares Russell 2000 ETF',market:'ETF'},
  {ticker:'AVGO',name:'Broadcom Inc.',market:'NASDAQ'},
  {ticker:'LLY',name:'Eli Lilly and Company',market:'NYSE'},
  {ticker:'NFLX',name:'Netflix Inc.',market:'NASDAQ'},
  {ticker:'V',name:'Visa Inc.',market:'NYSE'},
  {ticker:'MA',name:'Mastercard Inc.',market:'NYSE'},
  {ticker:'HOOD',name:'Robinhood Markets',market:'NASDAQ'},
  {ticker:'XOM',name:'Exxon Mobil Corporation',market:'NYSE'},
  {ticker:'ORCL',name:'Oracle Corporation',market:'NYSE'},
  {ticker:'ARM',name:'Arm Holdings',market:'NASDAQ'},
  {ticker:'TSM',name:'Taiwan Semiconductor',market:'NYSE'},
  {ticker:'BABA',name:'Alibaba Group',market:'NYSE'},
  {ticker:'NVO',name:'Novo Nordisk A/S',market:'NYSE'},
  {ticker:'SHOP',name:'Shopify Inc.',market:'NYSE'},
  {ticker:'UBER',name:'Uber Technologies',market:'NYSE'},
  {ticker:'ABNB',name:'Airbnb Inc.',market:'NASDAQ'},
  {ticker:'SQ',name:'Block Inc.',market:'NYSE'},
  {ticker:'PYPL',name:'PayPal Holdings',market:'NASDAQ'},
  {ticker:'MU',name:'Micron Technology',market:'NASDAQ'},
  {ticker:'INTC',name:'Intel Corporation',market:'NASDAQ'},
  {ticker:'CRM',name:'Salesforce Inc.',market:'NYSE'},
  {ticker:'NOW',name:'ServiceNow Inc.',market:'NYSE'},
  {ticker:'SNOW',name:'Snowflake Inc.',market:'NYSE'},
  {ticker:'DDOG',name:'Datadog Inc.',market:'NASDAQ'},
  {ticker:'NET',name:'Cloudflare Inc.',market:'NYSE'},
  {ticker:'ZS',name:'Zscaler Inc.',market:'NASDAQ'},
  {ticker:'PANW',name:'Palo Alto Networks',market:'NASDAQ'},
  {ticker:'SMCI',name:'Super Micro Computer',market:'NASDAQ'},
  {ticker:'APP',name:'Applovin Corporation',market:'NASDAQ'},
  {ticker:'RBLX',name:'Roblox Corporation',market:'NYSE'},
  {ticker:'RIVN',name:'Rivian Automotive',market:'NASDAQ'},
  {ticker:'SOFI',name:'SoFi Technologies',market:'NASDAQ'},
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600,stale-while-revalidate=7200');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q = '', limit = 8 } = req.query;
  const query = q.toUpperCase().trim();
  const lim = Math.min(parseInt(limit) || 8, 20);

  if (!query) {
    return res.json({ results: POPULAR.slice(0, lim) });
  }

  // Fast local search first — ticker prefix + name contains
  const local = POPULAR.filter(t =>
    t.ticker.startsWith(query) ||
    t.name.toUpperCase().includes(query)
  ).slice(0, lim);

  if (local.length >= lim) {
    return res.json({ results: local, source: 'local' });
  }

  // Fall back to Polygon reference API for less common tickers
  const cacheKey = 'sym:' + query;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL) {
    return res.json({ results: cache[cacheKey].data, source: 'cache' });
  }

  try {
    const url = `https://api.polygon.io/v3/reference/tickers?search=${encodeURIComponent(query)}&active=true&market=stocks&order=asc&limit=${lim}&apiKey=${POLYGON}`;
    const r = await fetch(url);
    const d = await r.json();
    const results = (d.results || []).map(t => ({
      ticker: t.ticker,
      name: t.name,
      market: t.primary_exchange || t.market || 'US',
      type: t.type
    }));

    // Merge local + polygon, dedupe by ticker
    const merged = [...local];
    for (const r of results) {
      if (!merged.find(m => m.ticker === r.ticker)) merged.push(r);
      if (merged.length >= lim) break;
    }

    cache[cacheKey] = { ts: Date.now(), data: merged };
    return res.json({ results: merged, source: 'polygon' });
  } catch (e) {
    // If Polygon fails, return local results
    return res.json({ results: local, source: 'local_fallback', error: e.message });
  }
};
