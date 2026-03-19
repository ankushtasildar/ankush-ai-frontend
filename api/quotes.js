export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { symbols = 'SPY,QQQ,AAPL,TSLA,NVDA,MSFT,META,AMZN,AMD,GOOGL' } = req.query;
  const syms = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 15);
  const POLYGON_KEY = process.env.POLYGON_API_KEY || 'xoHj3Lx4HMcvNqNqaQRX_pj4HTNNHtta';

  // Try Polygon/Massive first
  try {
    const results = await Promise.all(syms.map(async sym => {
      try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${POLYGON_KEY}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Polygon ${r.status}`);
        const data = await r.json();
        const t = data?.ticker;
        if (!t) throw new Error('No ticker data');

        const day = t.day || {};
        const prev = t.prevDay || {};
        const lastTrade = t.lastTrade || {};
        const price = lastTrade.p || day.c || prev.c || 0;
        const prevClose = prev.c || day.o || 0;
        const change = price - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : t.todaysChangePerc || 0;

        let signal, signalColor, reason, strength;
        if (changePct > 2)       { signal='WATCH'; signalColor='#10b981'; reason='Strong upside momentum'; strength='HIGH' }
        else if (changePct > 0.5){ signal='WATCH'; signalColor='#34d399'; reason='Positive momentum';     strength='MODERATE' }
        else if (changePct < -2) { signal='WATCH'; signalColor='#ef4444'; reason='Significant weakness';  strength='HIGH' }
        else if (changePct < -0.5){signal='WATCH'; signalColor='#f87171'; reason='Negative pressure';     strength='MODERATE' }
        else                     { signal='WATCH'; signalColor='#f59e0b'; reason='Consolidating';          strength='LOW' }

        return {
          symbol: sym,
          name: sym,
          price: parseFloat(price.toFixed(2)),
          open: parseFloat((day.o || 0).toFixed(2)),
          high: parseFloat((day.h || 0).toFixed(2)),
          low: parseFloat((day.l || 0).toFixed(2)),
          close: parseFloat((day.c || 0).toFixed(2)),
          volume: parseInt(day.v || 0),
          prevClose: parseFloat(prevClose.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          changePct: parseFloat(changePct.toFixed(2)),
          vwap: parseFloat((day.vw || 0).toFixed(2)),
          signal, signalColor, reason, strength,
          source: 'polygon',
          updatedAt: new Date().toISOString(),
        };
      } catch (e) {
        return null;
      }
    }));

    const valid = results.filter(Boolean);
    if (valid.length > 0) {
      return res.status(200).json(valid);
    }
  } catch (e) {}

  // Fallback: Yahoo Finance
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketPreviousClose,shortName`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const data = await r.json();
    const quotes = data?.quoteResponse?.result || [];

    const enriched = quotes.map(q => {
      const changePct = q.regularMarketChangePercent || 0;
      let signal, signalColor, reason, strength;
      if (changePct > 2)        { signal='WATCH'; signalColor='#10b981'; reason='Strong upside momentum'; strength='HIGH' }
      else if (changePct > 0.5) { signal='WATCH'; signalColor='#34d399'; reason='Positive momentum'; strength='MODERATE' }
      else if (changePct < -2)  { signal='WATCH'; signalColor='#ef4444'; reason='Significant weakness'; strength='HIGH' }
      else if (changePct < -0.5){ signal='WATCH'; signalColor='#f87171'; reason='Negative pressure'; strength='MODERATE' }
      else                      { signal='WATCH'; signalColor='#f59e0b'; reason='Consolidating'; strength='LOW' }

      return {
        symbol: q.symbol,
        name: q.shortName || q.symbol,
        price: q.regularMarketPrice,
        open: q.regularMarketOpen,
        high: q.regularMarketDayHigh,
        low: q.regularMarketDayLow,
        prevClose: q.regularMarketPreviousClose,
        change: q.regularMarketChange,
        changePct,
        volume: q.regularMarketVolume,
        signal, signalColor, reason, strength,
        source: 'yahoo',
        updatedAt: new Date().toISOString(),
      };
    });

    if (enriched.length > 0) return res.status(200).json(enriched);
  } catch (e) {}

  // Final fallback: mock with realistic prices
  const MOCK_PRICES = { SPY:575, QQQ:480, AAPL:222, NVDA:890, TSLA:245, MSFT:415, META:620, AMZN:215, AMD:170, GOOGL:185 };
  const mock = syms.map(sym => {
    const base = MOCK_PRICES[sym] || 100;
    const changePct = (Math.random() - 0.48) * 4;
    const price = parseFloat((base * (1 + changePct/100)).toFixed(2));
    const change = parseFloat((price - base).toFixed(2));
    return {
      symbol: sym, name: sym, price, open: base, high: price*1.01, low: price*0.99,
      prevClose: base, change, changePct: parseFloat(changePct.toFixed(2)),
      volume: Math.round(Math.random() * 50e6),
      signal: 'WATCH', signalColor: changePct > 0 ? '#10b981' : '#ef4444',
      reason: 'Market closed', strength: 'LOW',
      source: 'mock', updatedAt: new Date().toISOString(),
    };
  });
  return res.status(200).json(mock);
}
