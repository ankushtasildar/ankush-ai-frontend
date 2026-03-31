// api/sector-composites.js v2 â AnkushAI Sector Composite Engine
// Marcus Webb â Equal-weight constituent basket per sector
// Uses same per-ticker Polygon approach as market.js (proven working)

const POLYGON = process.env.POLYGON_API_KEY || '';
const TWELVE  = process.env.TWELVE_DATA_API_KEY || '';

const SECTOR_MAP = [
  { id:'technology',          name:'Technology',          emoji:'ð»', constituents:['MSFT','NVDA','AAPL','AVGO','ORCL','PLTR','MU','AMD','INTC','TXN','ADI','NXPI','ANET','LRCX','KLAC','CRM','NOW','ADBE','IBM','ACN','ADP','CSCO','MSI','APH','GLW','STX'] },
  { id:'consumer-defensive',  name:'Consumer Defensive',  emoji:'ð', constituents:['WMT','COST','KO','PEP','PG','PM','MO','MDLZ','CL','KR','SYY'] },
  { id:'consumer-cyclical',   name:'Consumer Cyclical',   emoji:'ðï¸', constituents:['AMZN','TSLA','HD','MCD','LOW','TJX','NKE','MAR','HLT','RCL','CCL'] },
  { id:'communication',       name:'Communication Services',emoji:'ð¡', constituents:['GOOG','META','NFLX','DIS','TMUS','VZ','T','APP','EA','WBD'] },
  { id:'industrials',         name:'Industrials',         emoji:'âï¸', constituents:['GE','RTX','CAT','DE','UNP','CSX','NSC','LMT','NOC','GD','BA','ETN','PH','ITW','HON','MMM','URI','VRT','JCI'] },
  { id:'financial',           name:'Financial',           emoji:'ð¦', constituents:['BRK-B','JPM','BAC','WFC','C','GS','MS','BLK','BX','SCHW','AXP','V','MA','PNC','USB','COF','CB','AON'] },
  { id:'healthcare',          name:'Healthcare',          emoji:'ð¥', constituents:['LLY','JNJ','UNH','ABBV','MRK','PFE','ABT','AMGN','GILD','BMY','TMO','DHR','ISRG','SYK','BSX','MCK','HCA','CVS','ELV'] },
  { id:'real-estate',         name:'Real Estate',         emoji:'ð¢', constituents:['AMT','EQIX','PLD','PSA','WELL','SPG','O'] },
  { id:'energy',              name:'Energy',              emoji:'â¡', constituents:['XOM','CVX','COP','EOG','SLB','OXY','PSX','VLO','OKE'] },
  { id:'utilities',           name:'Utilities',           emoji:'ð', constituents:['NEE','SO','DUK','CEG'] },
  { id:'basic-materials',     name:'Basic Materials',     emoji:'âï¸', constituents:['LIN','SHW','NEM','CRH'] },
];

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function getTickerQuote(symbol) {
  var s = symbol.toUpperCase();
  // Yahoo first — it correctly computes change from regularMarketPrice - chartPreviousClose
  try {
    var yd = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/' + s + '?interval=1d&range=1d');
    var ym = yd.chart && yd.chart.result && yd.chart.result[0] && yd.chart.result[0].meta;
    if (ym && ym.regularMarketPrice) {
      var yp = ym.regularMarketPrice;
      var ypc = ym.chartPreviousClose || ym.previousClose;
      return { symbol: s, price: yp, changePercent: ypc ? (yp - ypc) / ypc * 100 : 0, change: ypc ? yp - ypc : 0, volume: ym.regularMarketVolume || 0 };
    }
  } catch(e) {}
  // Polygon snapshot fallback
  if (POLYGON) {
    try {
      var snap = await fetchJson('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/' + s + '?apiKey=' + POLYGON);
      var t = snap.ticker;
      if (t && (t.day || t.prevDay)) {
        return { symbol: s, price: (t.day && t.day.c) || t.prevDay.c || 0, changePercent: t.todaysChangePerc || 0, change: t.todaysChange || 0, volume: (t.day && t.day.v) || 0 };
      }
    } catch(e) {}
    // Polygon prev — price only, no change
    try {
      var d = await fetchJson('https://api.polygon.io/v2/aggs/ticker/' + s + '/prev?adjusted=true&apiKey=' + POLYGON);
      if (d.results && d.results[0]) return { symbol: s, price: d.results[0].c, changePercent: 0, change: 0, volume: d.results[0].v || 0 };
    } catch(e) {}
  }
  return null;
}

let cache = null;
let cacheTs = 0;
const CACHE_TTL = 120000; // 2 min cache â 130 individual calls, don't hammer the API

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const force = req.query.force === '1';
  const now = Date.now();
  if (!force && cache && (now - cacheTs) < CACHE_TTL) return res.json(cache);

  try {
    // Get all unique tickers
    const ALL = [...new Set(SECTOR_MAP.flatMap(s => s.constituents))];

    // Fetch all in parallel â 130 concurrent requests, each uses individual Polygon endpoint
    const quotes = {};
    const results = await Promise.allSettled(ALL.map(sym => getTickerQuote(sym)));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        quotes[ALL[i]] = r.value;
      }
    });

    // Compute composite per sector
    const composites = SECTOR_MAP.map(sector => {
      const stocks = sector.constituents
        .map(sym => ({ sym, data: quotes[sym] }))
        .filter(x => x.data);

      if (stocks.length === 0) {
        return { ...sector, changePercent: 0, change: 0, price: 0, advancers: 0, decliners: 0, unchanged: 0, stocksScored: 0, topMovers: [] };
      }

      const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
      const changes = stocks.map(x => x.data.changePercent || 0);
      const avgChange = avg(changes);
      const avgPrice = avg(stocks.map(x => x.data.price || 0));

      const advancers = stocks.filter(x => (x.data.changePercent || 0) > 0.05).length;
      const decliners = stocks.filter(x => (x.data.changePercent || 0) < -0.05).length;

      const topMovers = [...stocks]
        .sort((a, b) => Math.abs(b.data.changePercent || 0) - Math.abs(a.data.changePercent || 0))
        .slice(0, 6)
        .map(x => ({ symbol: x.sym, changePercent: +(x.data.changePercent || 0).toFixed(3), price: x.data.price || 0 }));

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
        unchanged: stocks.length - advancers - decliners,
        stocksScored: stocks.length,
        totalConstituents: sector.constituents.length,
        topMovers,
      };
    });

    cache = composites;
    cacheTs = now;
    return res.json(composites);
  } catch(e) {
    console.error('[sector-composites v2]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
