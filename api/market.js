// market.js v6 â Unified market data API
// Fixes: parameter routing (action= AND type= both work), VIX, sectors, context
// Architecture: in-memory cache + 4-source waterfall + shared cache for scalability

const cache = {};
const CACHE_TTL = { quote: 60000, vix: 120000, sectors: 300000, context: 120000, history: 180000 };

const POLYGON = process.env.POLYGON_API_KEY || '';
const TWELVE = process.env.TWELVE_DATA_API_KEY || '';
const AV = process.env.ALPHA_VANTAGE_API_KEY || '';

function cached(key, ttl, fn) {
  const now = Date.now();
  if (cache[key] && now - cache[key].ts < ttl) return Promise.resolve(cache[key].data);
  return fn().then(d => { cache[key] = { data: d, ts: now }; return d; });
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ââ Quote (4-source waterfall) ââââââââââââââââââââââââââââââââââââââââââââââ
async function getQuote(symbol) {
  return cached(`quote:${symbol}`, CACHE_TTL.quote, async () => {
    const s = symbol.toUpperCase();

    // 1. Polygon
    if (POLYGON) {
      try {
        const d = await fetchJson(`https://api.polygon.io/v2/aggs/ticker/${s}/prev?adjusted=true&apiKey=${POLYGON}`);
        if (d.results?.[0]) {
          const r = d.results[0];
          const prev = r.c;
          // Get today's snapshot for more current price
          try {
            const snap = await fetchJson(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${s}?apiKey=${POLYGON}`);
            const t = snap.ticker;
            if (t?.day) return {
              symbol: s, price: t.day.c || t.prevDay.c, open: t.day.o,
              high: t.day.h, low: t.day.l, close: t.day.c || t.prevDay.c,
              change: t.todaysChange || 0, changePercent: t.todaysChangePerc || 0,
              volume: t.day.v || 0, source: 'polygon'
            };
          } catch(e) {}
          // Polygon-prev has price but no change data — store as fallback, try Yahoo for change
          var polyFallback = { symbol: s, price: r.c, high: r.h, low: r.l, close: r.c, change: 0, changePercent: 0, volume: r.v || 0, source: 'polygon-prev' };
          // Try Yahoo for change data before returning zero-change result
          try {
            var yd = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/' + s + '?interval=1d&range=1d');
            var ym = yd.chart && yd.chart.result && yd.chart.result[0] && yd.chart.result[0].meta;
            if (ym && ym.regularMarketPrice) {
              var yPrice = ym.regularMarketPrice;
              var yPrev = ym.chartPreviousClose || ym.previousClose;
              if (yPrev) {
                return { symbol: s, price: yPrice, high: ym.regularMarketDayHigh || yPrice, low: ym.regularMarketDayLow || yPrice, close: yPrice, change: yPrice - yPrev, changePercent: (yPrice - yPrev) / yPrev * 100, volume: ym.regularMarketVolume || polyFallback.volume, source: 'yahoo' };
              }
            }
          } catch(yErr) {}
          return polyFallback;
        }
      } catch(e) {}
    }

    // 2. Twelve Data
    if (TWELVE) {
      try {
        const d = await fetchJson(`https://api.twelvedata.com/quote?symbol=${s}&apikey=${TWELVE}`);
        if (d.close) return {
          symbol: s, price: parseFloat(d.close), open: parseFloat(d.open || 0),
          high: parseFloat(d.high || 0), low: parseFloat(d.low || 0),
          close: parseFloat(d.close), change: parseFloat(d.change || 0),
          changePercent: parseFloat(d.percent_change || 0), volume: parseInt(d.volume || 0),
          source: 'twelvedata'
        };
      } catch(e) {}
    }

    // 3. Alpha Vantage
    if (AV) {
      try {
        const d = await fetchJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s}&apikey=${AV}`);
        const q = d['Global Quote'];
        if (q?.['05. price']) return {
          symbol: s, price: parseFloat(q['05. price']), high: parseFloat(q['03. high'] || 0),
          low: parseFloat(q['04. low'] || 0), close: parseFloat(q['05. price']),
          change: parseFloat(q['09. change'] || 0), changePercent: parseFloat(q['10. change percent'] || 0),
          volume: parseInt(q['06. volume'] || 0), source: 'alphavantage'
        };
      } catch(e) {}
    }

    // 4. Yahoo Finance (best effort)
    try {
      const d = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=1d`);
      const meta = d.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) {
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose || meta.previousClose;
        return {
          symbol: s, price, high: meta.regularMarketDayHigh || price, low: meta.regularMarketDayLow || price,
          close: price, change: prev ? price - prev : 0, changePercent: prev ? (price - prev) / prev * 100 : 0,
          volume: meta.regularMarketVolume || 0, source: 'yahoo'
        };
      }
    } catch(e) {}

    throw new Error(`All sources failed for ${s}`);
  });
}

// ââ VIX ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function getVIX() {
  return cached('vix', CACHE_TTL.vix, async () => {
    // Try $VIX.X or VIXY as proxy
    for (const sym of ['$VIX.X', '^VIX', 'VIXY']) {
      try {
        if (POLYGON) {
          const d = await fetchJson(`https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${POLYGON}`);
          if (d.results?.[0]?.c) return { vix: d.results[0].c, source: 'polygon' };
        }
      } catch(e) {}
    }
    // Yahoo VIX
    try {
      const d = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d`);
      const price = d.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) return { vix: price, source: 'yahoo' };
    } catch(e) {}
    return { vix: 20, source: 'fallback' };
  });
}

// ââ Sectors ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology' },
  { symbol: 'XLF', name: 'Financials' },
  { symbol: 'XLV', name: 'Healthcare' },
  { symbol: 'XLE', name: 'Energy' },
  { symbol: 'XLY', name: 'Consumer Disc' },
  { symbol: 'XLP', name: 'Consumer Stpl' },
  { symbol: 'XLI', name: 'Industrials' },
  { symbol: 'XLB', name: 'Materials' },
  { symbol: 'XLRE', name: 'Real Estate' },
  { symbol: 'XLU', name: 'Utilities' },
  { symbol: 'XLC', name: 'Comm Services' },
];

async function getSectors() {
  return cached('sectors', CACHE_TTL.sectors, async () => {
    const results = await Promise.allSettled(SECTOR_ETFS.map(s => getQuote(s.symbol)));
    return SECTOR_ETFS.map((s, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        return { ...s, price: r.value.price, change: r.value.change, changePercent: r.value.changePercent, volume: r.value.volume };
      }
      return { ...s, price: 0, change: 0, changePercent: 0, volume: 0, error: true };
    });
  });
}

// ââ Market Context ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function getContext() {
  return cached('context', CACHE_TTL.context, async () => {
    const [spy, vixData, sectors] = await Promise.allSettled([
      getQuote('SPY'), getVIX(), getSectors()
    ]);

    const spyData = spy.status === 'fulfilled' ? spy.value : null;
    const vix = vixData.status === 'fulfilled' ? vixData.value.vix : 20;
    const sectorList = sectors.status === 'fulfilled' ? sectors.value : [];

    const mood = vix > 30 ? 'Fear' : vix > 20 ? 'Caution' : vix < 15 ? 'Greed' : 'Neutral';
    const spyChange = spyData?.changePercent || 0;

    const advancing = sectorList.filter(s => s.changePercent > 0);
    const declining = sectorList.filter(s => s.changePercent < 0);
    const leader = advancing.sort((a, b) => b.changePercent - a.changePercent)[0];
    const laggard = declining.sort((a, b) => a.changePercent - b.changePercent)[0];

    const regime = spyChange > 1 ? 'risk_on' : spyChange < -1 ? 'risk_off' : vix > 25 ? 'defensive' : 'neutral';

    return {
      spy: spyData?.price || 0, spyChange,
      vix, mood, regime,
      leader: leader?.name || 'N/A', leaderChange: leader?.changePercent || 0,
      laggard: laggard?.name || 'N/A', laggardChange: laggard?.changePercent || 0,
      advancing: advancing.length, declining: declining.length,
      marketOpen: isMarketOpen(), session: getSessionStatus(),
    };
  });
}

// ââ History ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function getHistory(symbol, timespan = 'day', multiplier = 1, days = 90, limit = 90) {
  const cacheKey = `history:${symbol}:${timespan}:${multiplier}:${days}`;
  return cached(cacheKey, CACHE_TTL.history, async () => {
    const s = symbol.toUpperCase();
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    if (POLYGON) {
      try {
        const d = await fetchJson(`https://api.polygon.io/v2/aggs/ticker/${s}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=${limit}&apiKey=${POLYGON}`);
        if (d.results?.length > 0) {
          return { bars: d.results.map(r => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v })), source: 'polygon' };
        }
      } catch(e) {}
    }

    if (TWELVE) {
      try {
        const intervalMap = { minute: '1min', hour: '1h', day: '1day', week: '1week' };
        const interval = intervalMap[timespan] || '1day';
        const d = await fetchJson(`https://api.twelvedata.com/time_series?symbol=${s}&interval=${interval}&outputsize=${limit}&apikey=${TWELVE}`);
        if (d.values?.length > 0) {
          return { bars: d.values.reverse().map(r => ({ t: new Date(r.datetime).getTime(), o: parseFloat(r.open), h: parseFloat(r.high), l: parseFloat(r.low), c: parseFloat(r.close), v: parseInt(r.volume || 0) })), source: 'twelvedata' };
        }
      } catch(e) {}
    }

    // Yahoo fallback
    try {
      const range = days <= 1 ? '1d' : days <= 5 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : '1y';
      const interval = timespan === 'minute' ? '1m' : timespan === 'hour' ? '1h' : '1d';
      const d = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=${interval}&range=${range}`);
      const result = d.chart?.result?.[0];
      if (result?.timestamp) {
        const q = result.indicators.quote[0];
        return { bars: result.timestamp.map((t, i) => ({ t: t * 1000, o: q.open?.[i] || 0, h: q.high?.[i] || 0, l: q.low?.[i] || 0, c: q.close?.[i] || 0, v: q.volume?.[i] || 0 })).filter(b => b.c > 0), source: 'yahoo' };
      }
    } catch(e) {}

    return { bars: [], source: 'failed' };
  });
}


// ââ Session-aware price selection ââââââââââââââââââââââââââââââââââââââââââââ
function getSessionPrice(snap, session) {
  // snap is the Polygon ticker snapshot result
  if (!snap) return null;
  const day = snap.day || {};
  const prevDay = snap.prevDay || {};
  const s = session?.session || 'regular';
  // During premarket: use preMarket price if available, else prevDay close
  if (s === 'premarket') {
    return { price: snap.lastQuote?.P || snap.lastTrade?.p || prevDay.c, changePercent: null, isPremarket: true };
  }
  // During postmarket: use afterHours or day close
  if (s === 'postmarket') {
    return { price: snap.lastTrade?.p || day.c, changePercent: day.c && prevDay.c ? ((day.c - prevDay.c)/prevDay.c)*100 : null, isPostmarket: true };
  }
  // Weekend/closed: use prevDay close, compare to day before that (change from last session)
  if (s === 'weekend' || s === 'closed') {
    return { price: prevDay.c || day.c, changePercent: prevDay.c && day.o ? ((prevDay.c - day.o)/day.o)*100 : null, isStale: true, sessionNote: 'Last session close' };
  }
  // Regular: use day's current price
  return { price: day.c || snap.lastTrade?.p, changePercent: day.c && prevDay.c ? ((day.c - prevDay.c)/prevDay.c)*100 : null };
}

function getSessionStatus() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  const h = et.getHours(), m = et.getMinutes();
  const mins = h * 60 + m;
  const isWeekend = day === 0 || day === 6;
  // NYSE premarket: 4:00am ET (240 mins) to 9:30am ET (570 mins)
  // NYSE regular:  9:30am ET to 4:00pm ET (960 mins)
  // NYSE postmarket: 4:00pm ET to 8:00pm ET (1200 mins)
  // TradingView shows premarket from 1am PST = 4am ET
  if (isWeekend) return { session: 'weekend', label: 'Weekend', labelShort: 'WKND', isLive: false, usePrevClose: true, day };
  if (mins < 240) return { session: 'closed', label: 'Closed', labelShort: 'CLOSED', isLive: false, usePrevClose: true };
  if (mins < 570) return { session: 'premarket', label: 'Pre-Market', labelShort: 'PRE', isLive: true, usePrevClose: false };
  if (mins < 960) return { session: 'regular', label: 'Market Open', labelShort: 'LIVE', isLive: true, usePrevClose: false };
  if (mins < 1200) return { session: 'postmarket', label: 'Post-Market', labelShort: 'POST', isLive: true, usePrevClose: false };
  return { session: 'closed', label: 'Closed', labelShort: 'CLOSED', isLive: false, usePrevClose: true };
}
function isMarketOpen() { const s = getSessionStatus(); return s.session === 'regular'; }

// ââ Handler âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Support both ?action= and ?type= for backward compatibility
  const action = (req.query.action || req.query.type || '').toLowerCase();
  const symbol = (req.query.symbol || 'SPY').toUpperCase();

  try {
    switch (action) {
      case 'quote':
        return res.json(await getQuote(symbol));

      case 'quotes': {
        const symbols = (req.query.symbols || 'SPY,QQQ,IWM').split(',').map(s => s.trim().toUpperCase());
        const quotes = await Promise.allSettled(symbols.map(s => getQuote(s)));
        return res.json(quotes.map((r, i) => r.status === 'fulfilled' ? r.value : { symbol: symbols[i], error: true }));
      }

      case 'vix':
        return res.json(await getVIX());

      case 'sectors':
        return res.json(await getSectors());

      case 'context':
        return res.json(await getContext());

      case 'history': {
        const { timespan = 'day', multiplier = 1, days = 90, limit = 90 } = req.query;
        return res.json(await getHistory(symbol, timespan, parseInt(multiplier), parseInt(days), parseInt(limit)));
      }

      case 'options':
        // Placeholder â return empty with structure
        return res.json({ symbol, options: [], note: 'Options data requires Polygon premium' });

      case 'earnings':
        // Use hardcoded upcoming earnings calendar (scalable: will pull from Supabase earnings_intelligence)
        return res.json({ symbol, earnings: [] });

      default:
        // No action provided â return all core data in one call (most efficient for Overview page)
        const [q, v, s, ctx] = await Promise.allSettled([getQuote(symbol), getVIX(), getSectors(), getContext()]);
        return res.json({
          quote: q.status === 'fulfilled' ? q.value : null,
          vix: v.status === 'fulfilled' ? v.value : null,
          sectors: s.status === 'fulfilled' ? s.value : [],
          context: ctx.status === 'fulfilled' ? ctx.value : null,
          marketOpen: isMarketOpen(),
        });
    }
  } catch (e) {
    console.error('market.js error:', action, e.message);
    return res.status(500).json({ error: e.message, action });
  }
}
