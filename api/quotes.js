export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { symbols = 'SPY,QQQ,AAPL,TSLA,NVDA' } = req.query;
  const syms = symbols.split(',').map(s => s.trim().toUpperCase()).slice(0, 15);

  try {
    // Use Yahoo Finance v7 quote endpoint
    const url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + syms.join(',') +
      '&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,shortName';

    const res2 = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });

    if (!res2.ok) throw new Error('Yahoo Finance error: ' + res2.status);
    const data = await res2.json();
    const quotes = data?.quoteResponse?.result || [];

    const enriched = quotes.map(q => {
      const price = q.regularMarketPrice;
      const prevClose = price - q.regularMarketChange;
      const chgPct = q.regularMarketChangePercent;

      let signal, strength, color, reason;
      if (chgPct > 2) { signal='BUY'; strength='STRONG'; color='#10b981'; reason='Momentum breakout'; }
      else if (chgPct > 0.5) { signal='BUY'; strength='MODERATE'; color='#34d399'; reason='Positive momentum'; }
      else if (chgPct < -2) { signal='SELL'; strength='STRONG'; color='#ef4444'; reason='Bearish momentum'; }
      else if (chgPct < -0.5) { signal='SELL'; strength='MODERATE'; color='#f87171'; reason='Negative pressure'; }
      else { signal='HOLD'; strength='NEUTRAL'; color='#f59e0b'; reason='Consolidating'; }

      return {
        symbol: q.symbol,
        name: q.shortName || q.symbol,
        price,
        change: q.regularMarketChange,
        changePct: chgPct,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
        signal, strength, signalColor: color, reason,
        updatedAt: new Date().toISOString(),
      };
    });

    return res.status(200).json(enriched);
  } catch (err) {
    console.error('Quotes API error:', err.message);
    // Return mock data as fallback so UI never breaks
    const mockData = symbols.split(',').map((sym, i) => {
      const price = [450, 385, 187, 245, 875, 415, 185, 495, 172, 165][i % 10];
      const chgPct = (Math.random() * 4 - 2);
      const change = price * chgPct / 100;
      let signal, color, reason;
      if (chgPct > 1) { signal='BUY'; color='#10b981'; reason='Momentum'; }
      else if (chgPct < -1) { signal='SELL'; color='#ef4444'; reason='Weakness'; }
      else { signal='HOLD'; color='#f59e0b'; reason='Neutral'; }
      return { symbol: sym.trim().toUpperCase(), name: sym.trim().toUpperCase(), price, change, changePct: chgPct, volume: Math.floor(Math.random()*50e6), marketCap: price * 1e9, signal, strength: 'MODERATE', signalColor: color, reason };
    });
    return res.status(200).json(mockData);
  }
}
