// api/sector-composites.js — AnkushAI Sector Composite Engine
// Marcus Webb (Quant) — Equal-weight constituent basket per sector
// Each sector % = mean of all named stock changePercents
// Uses Polygon batch snapshot (50 tickers per call) for efficiency

const POLYGON = process.env.POLYGON_API_KEY || '';

// 12-sector taxonomy — constituent stocks per sector
const SECTOR_MAP = [
  { id:'technology', name:'Technology', emoji:'💻', constituents:[
    'MSFT','NVDA','AAPL','AVGO','ORCL','PLTR','MU','AMD','INTC','TXN',
    'ADI','NXPI','ANET','LRCX','KLAC','CRM','NOW','ADBE','IBM','ACN',
    'ADP','CSCO','MSI','APH','GLW','STX'
  ]},
  { id:'consumer-defensive', name:'Consumer Defensive', emoji:'🛒', constituents:[
    'WMT','COST','KO','PEP','PG','PM','MO','MDLZ','CL','KR','SYY'
  ]},
  { id:'consumer-cyclical', name:'Consumer Cyclical', emoji:'🛍️', constituents:[
    'AMZN','TSLA','HD','MCD','LOW','TJX','NKE','MAR','HLT','RCL','CCL'
  ]},
  { id:'communication', name:'Communication Services', emoji:'📡', constituents:[
    'GOOG','META','NFLX','DIS','TMUS','VZ','T','APP','EA','WBD'
  ]},
  { id:'industrials', name:'Industrials', emoji:'⚙️', constituents:[
    'GE','RTX','CAT','DE','UNP','CSX','NSC','LMT','NOC','GD','BA',
    'ETN','PH','ITW','HON','MMM','URI','VRT','JCI'
  ]},
  { id:'financial', name:'Financial', emoji:'🏦', constituents:[
    'BRK-B','JPM','BAC','WFC','C','GS','MS','BLK','BX','SCHW',
    'AXP','V','MA','PNC','USB','COF','CB','AON'
  ]},
  { id:'healthcare', name:'Healthcare', emoji:'🏥', constituents:[
    'LLY','JNJ','UNH','ABBV','MRK','PFE','ABT','AMGN','GILD','BMY',
    'TMO','DHR','ISRG','SYK','BSX','MCK','HCA','CVS','ELV'
  ]},
  { id:'real-estate', name:'Real Estate', emoji:'🏢', constituents:[
    'AMT','EQIX','PLD','PSA','WELL','SPG','O'
  ]},
  { id:'energy', name:'Energy', emoji:'⚡', constituents:[
    'XOM','CVX','COP','EOG','SLB','OXY','PSX','VLO','OKE'
  ]},
  { id:'utilities', name:'Utilities', emoji:'🔌', constituents:[
    'NEE','SO','DUK','CEG'
  ]},
  { id:'basic-materials', name:'Basic Materials', emoji:'⛏️', constituents:[
    'LIN','SHW','NEM','CRH'
  ]},
];

// All unique tickers across all sectors
const ALL_TICKERS = [...new Set(SECTOR_MAP.flatMap(s => s.constituents))];

// Fetch batch Polygon snapshots — 50 per call max
async function fetchBatchSnapshots(tickers) {
  if (!POLYGON) return {};
  const results = {};
  const BATCH = 50;
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    try {
      const url = 'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers='
        + batch.join(',') + '&apiKey=' + POLYGON;
      const resp = await fetch(url, { headers:{ 'User-Agent':'ankushai/1.0' } });
      const data = await resp.json();
      if (data.tickers) {
        data.tickers.forEach(t => {
          results[t.ticker] = {
            symbol: t.ticker,
            price: t.day?.c || t.prevDay?.c || 0,
            changePercent: t.todaysChangePerc || 0,
            change: t.todaysChange || 0,
            volume: t.day?.v || 0,
          };
        });
      }
    } catch(e) { console.error('[sector-composites] batch error', e.message); }
  }
  return results;
}

// Compute composite for each sector from ticker data
function computeComposites(tickerData) {
  return SECTOR_MAP.map(sector => {
    const stocks = sector.constituents
      .map(sym => ({ sym, data: tickerData[sym] }))
      .filter(x => x.data && x.data.changePercent !== undefined);
    
    if (stocks.length === 0) {
      return { ...sector, changePercent: 0, change: 0, price: 0, advancers: 0, decliners: 0, unchanged: 0, stocks: [], topMovers: [] };
    }

    const changes = stocks.map(x => x.data.changePercent);
    const avgChange = changes.reduce((s,c) => s+c, 0) / changes.length;
    const avgPrice = stocks.reduce((s,x) => s + (x.data.price||0), 0) / stocks.length;

    const advancers = stocks.filter(x => x.data.changePercent > 0.05).length;
    const decliners = stocks.filter(x => x.data.changePercent < -0.05).length;
    const unchanged = stocks.length - advancers - decliners;

    // Top 5 movers (by absolute change)
    const topMovers = [...stocks]
      .sort((a,b) => Math.abs(b.data.changePercent) - Math.abs(a.data.changePercent))
      .slice(0, 6)
      .map(x => ({ symbol: x.sym, changePercent: x.data.changePercent, price: x.data.price }));

    return {
      id: sector.id,
      name: sector.name,
      emoji: sector.emoji,
      constituents: sector.constituents,
      changePercent: +avgChange.toFixed(3),
      change: +(avgChange * avgPrice / 100).toFixed(2),
      price: +avgPrice.toFixed(2),
      advancers,
      decliners,
      unchanged,
      stocksScored: stocks.length,
      totalConstituents: sector.constituents.length,
      topMovers,
    };
  });
}

// In-memory cache
let cache = null;
let cacheTs = 0;
const CACHE_TTL = 60000; // 60s during market hours

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const force = req.query.force === '1';
  const now = Date.now();

  if (!force && cache && (now - cacheTs) < CACHE_TTL) {
    return res.json(cache);
  }

  try {
    const tickerData = await fetchBatchSnapshots(ALL_TICKERS);
    const composites = computeComposites(tickerData);
    cache = composites;
    cacheTs = now;
    return res.json(composites);
  } catch(e) {
    console.error('[sector-composites]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
