const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization' };

// ── Universe ─────────────────────────────────────────────────────────────────
const UNIVERSE = [
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','ORCL','CRM',
  'AMD','QCOM','ARM','AMAT','LRCX','MRVL','MU',
  'PLTR','COIN','HOOD','UBER','SOFI','SQ',
  'JPM','GS','MS','BAC','V','MA',
  'XOM','CVX','OXY',
  'LLY','UNH','MRNA',
  'SPY','QQQ','IWM','XLF','XLK','XLE','GLD','TLT',
];

// ── Penny gate ────────────────────────────────────────────────────────────────
function passesGate(td) {
  if (!td || !td.current || td.current < 5) return false;
  if ((td.avgVolume||0) > 0 && td.avgVolume < 500000) return false;
  if (td.marketCap && td.marketCap < 1e9) return false;
  return true;
}

// ── Tier check ────────────────────────────────────────────────────────────────
async function getUserTier(authHeader) {
  if (!authHeader) return 'free';
  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return 'free';
    const { data: profile } = await supabase.from('profiles').select('plan,subscription_status').eq('id', user.id).single();
    if (!profile) return 'free';
    const plan = (profile.plan || 'free').toLowerCase();
    const status = (profile.subscription_status || 'none').toLowerCase();
    if (['pro','enterprise','tier1','tier2','premium'].includes(plan)) return 'pro';
    if (['active','trialing'].includes(status)) return 'pro';
    return 'free';
  } catch (e) { return 'free'; }
}

// ── Market data fetch — multi-strategy with serialized requests ──────────────
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com',
  'Origin': 'https://finance.yahoo.com',
};

async function fetchYahooChart(symbol) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y&includePrePost=true`;
    const r = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) throw new Error('No price');

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    const ts = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0] || {};

    // Build full price history
    const hist = ts.map((t, i) => ({
      date: new Date(t * 1000).toISOString().split('T')[0],
      open: ohlcv.open?.[i],
      high: ohlcv.high?.[i],
      low: ohlcv.low?.[i],
      close: ohlcv.close?.[i],
      volume: ohlcv.volume?.[i],
    })).filter(d => d.close != null);

    return { symbol, meta, price, prevClose, hist };
  } catch (e) {
    console.error(`Yahoo chart failed ${symbol}: ${e.message}`);
    return null;
  }
}

async function fetchOptionsChain(symbol, currentPrice) {
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}`;
    const r = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const data = await r.json();
    const chain = data?.optionChain?.result?.[0];
    if (!chain) return null;

    const expirations = (chain.expirationDates || []).slice(0, 6).map(d => new Date(d * 1000).toISOString().split('T')[0]);
    const opts = chain.options?.[0];
    if (!opts) return { expirations, atmCalls: [], atmPuts: [] };

    // Get ATM options (within 2% of current price)
    const atmCalls = (opts.calls || [])
      .filter(c => Math.abs(c.strike - currentPrice) / currentPrice < 0.03)
      .sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))
      .slice(0, 4)
      .map(c => ({
        strike: c.strike,
        expiry: new Date(c.expiration * 1000).toISOString().split('T')[0],
        bid: c.bid, ask: c.ask, last: c.lastPrice,
        iv: parseFloat((c.impliedVolatility * 100).toFixed(1)),
        delta: c.delta || null,
        theta: c.theta || null,
        oi: c.openInterest,
        volume: c.volume,
        midpoint: parseFloat(((c.bid + c.ask) / 2).toFixed(2)),
        // Cost per contract (100 shares)
        contractCost: parseFloat(((c.bid + c.ask) / 2 * 100).toFixed(0)),
      }));

    const atmPuts = (opts.puts || [])
      .filter(p => Math.abs(p.strike - currentPrice) / currentPrice < 0.03)
      .sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))
      .slice(0, 4)
      .map(p => ({
        strike: p.strike,
        expiry: new Date(p.expiration * 1000).toISOString().split('T')[0],
        bid: p.bid, ask: p.ask, last: p.lastPrice,
        iv: parseFloat((p.impliedVolatility * 100).toFixed(1)),
        delta: p.delta || null,
        theta: p.theta || null,
        oi: p.openInterest,
        volume: p.volume,
        midpoint: parseFloat(((p.bid + p.ask) / 2).toFixed(2)),
        contractCost: parseFloat(((p.bid + p.ask) / 2 * 100).toFixed(0)),
      }));

    return { expirations, atmCalls, atmPuts };
  } catch (e) {
    return null;
  }
}

// ── Technical indicators computed from OHLCV ─────────────────────────────────
function computeTechnicals(hist, currentPrice) {
  const closes = hist.map(d => d.close);
  const highs = hist.map(d => d.high);
  const lows = hist.map(d => d.low);
  const volumes = hist.map(d => d.volume || 0);

  function ema(data, period) {
    if (data.length < period) return data[data.length - 1] || 0;
    const k = 2 / (period + 1);
    let e = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) e = data[i] * k + e * (1 - k);
    return parseFloat(e.toFixed(2));
  }

  function rsi(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const d = data[i] - data[i - 1];
      if (d > 0) gains += d; else losses += Math.abs(d);
    }
    const ag = gains / period, al = losses / period;
    return parseFloat((100 - 100 / (1 + (al === 0 ? 999 : ag / al))).toFixed(1));
  }

  function atr(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return 0;
    const trs = [];
    for (let i = 1; i < closes.length; i++) {
      trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
    }
    return parseFloat((trs.slice(-period).reduce((a,b) => a+b, 0) / period).toFixed(2));
  }

  // VWAP approximation (20-day)
  function vwap20() {
    const slice = hist.slice(-20);
    const totalVol = slice.reduce((s, d) => s + (d.volume || 0), 0);
    if (!totalVol) return currentPrice;
    return parseFloat((slice.reduce((s, d) => s + ((d.high + d.low + d.close) / 3) * (d.volume || 0), 0) / totalVol).toFixed(2));
  }

  // Key levels: recent swing highs/lows (supply/demand zones)
  function swingLevels() {
    const levels = [];
    const recent = hist.slice(-60);
    for (let i = 2; i < recent.length - 2; i++) {
      // Swing high
      if (recent[i].high > recent[i-1].high && recent[i].high > recent[i-2].high &&
          recent[i].high > recent[i+1].high && recent[i].high > recent[i+2].high) {
        levels.push({ type: 'resistance', price: parseFloat(recent[i].high.toFixed(2)), date: recent[i].date });
      }
      // Swing low
      if (recent[i].low < recent[i-1].low && recent[i].low < recent[i-2].low &&
          recent[i].low < recent[i+1].low && recent[i].low < recent[i+2].low) {
        levels.push({ type: 'support', price: parseFloat(recent[i].low.toFixed(2)), date: recent[i].date });
      }
    }
    // Return the 3 nearest levels above and below current price
    const above = levels.filter(l => l.price > currentPrice).sort((a,b) => a.price - b.price).slice(0, 3);
    const below = levels.filter(l => l.price < currentPrice).sort((a,b) => b.price - a.price).slice(0, 3);
    return { resistance: above, support: below };
  }

  // Fibonacci levels from the most significant recent swing
  function fibLevels() {
    const recent = hist.slice(-90);
    const high = Math.max(...recent.map(d => d.high));
    const low = Math.min(...recent.map(d => d.low));
    const range = high - low;
    // Both retracement (from high) and extension (from low)
    return {
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      fib236: parseFloat((high - range * 0.236).toFixed(2)),
      fib382: parseFloat((high - range * 0.382).toFixed(2)),
      fib500: parseFloat((high - range * 0.500).toFixed(2)),
      fib618: parseFloat((high - range * 0.618).toFixed(2)),
      fib786: parseFloat((high - range * 0.786).toFixed(2)),
      ext127: parseFloat((high + range * 0.272).toFixed(2)),
      ext161: parseFloat((high + range * 0.618).toFixed(2)),
      // Upside extensions from low (for bullish setups)
      upExt127: parseFloat((low + range * 1.272).toFixed(2)),
      upExt161: parseFloat((low + range * 1.618).toFixed(2)),
    };
  }

  // Average volume
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const latestVol = volumes[volumes.length - 1] || 0;

  const e9 = ema(closes.slice(-50), 9);
  const e21 = ema(closes.slice(-50), 21);
  const e50 = ema(closes.slice(-100), 50);
  const e200 = ema(closes, 200);
  const rsi14 = rsi(closes);
  const atr14 = atr(highs, lows, closes);
  const vwap = vwap20();
  const swings = swingLevels();
  const fibs = fibLevels();

  const h52 = parseFloat(Math.max(...highs).toFixed(2));
  const l52 = parseFloat(Math.min(...lows).toFixed(2));
  const pos52 = h52 > l52 ? parseFloat(((currentPrice - l52) / (h52 - l52) * 100).toFixed(1)) : 50;

  return {
    ema9: e9, ema21: e21, ema50: e50, ema200: e200,
    rsi14, atr14,
    vwap20: vwap,
    emaAlignment: currentPrice > e9 && e9 > e21 && e21 > e50 ? 'bullish_stacked'
      : currentPrice < e9 && e9 < e21 && e21 < e50 ? 'bearish_stacked' : 'mixed',
    distFromEma50: parseFloat(((currentPrice / (e50 || currentPrice) - 1) * 100).toFixed(2)),
    distFromEma200: parseFloat(((currentPrice / (e200 || currentPrice) - 1) * 100).toFixed(2)),
    h52w: h52, l52w: l52, pos52w: pos52,
    avgVolume: Math.round(avgVol20),
    volumeRatio: avgVol20 > 0 ? parseFloat((latestVol / avgVol20).toFixed(2)) : 1,
    swingLevels: swings,
    fibonacci: fibs,
    // ATR-based stop sizing: 1.5x ATR = realistic stop for options
    atrStop1x: parseFloat((currentPrice - atr14).toFixed(2)),
    atrStop15x: parseFloat((currentPrice - atr14 * 1.5).toFixed(2)),
    atrStop2x: parseFloat((currentPrice - atr14 * 2).toFixed(2)),
  };
}


// ── Batch price fetch via Yahoo spark (single API call for all symbols) ───────
async function fetchBatchPrices(symbols) {
  const prices = {};
  try {
    // Yahoo v8/finance/spark - batch endpoint, different rate limit from chart
    const url = `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(',')}&range=1d&interval=1d`;
    const r = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const data = await r.json();
      const spark = data?.spark?.result || [];
      for (const item of spark) {
        if (item?.symbol && item?.response?.[0]?.meta?.regularMarketPrice) {
          prices[item.symbol] = item.response[0].meta.regularMarketPrice;
        }
      }
      console.log(`Batch prices fetched: ${Object.keys(prices).length}/${symbols.length} symbols`);
      return prices;
    }
  } catch (e) {
    console.error('Batch price fetch failed:', e.message);
  }
  
  // Fallback: try Yahoo v7 quote batch
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice,regularMarketPreviousClose`;
    const r = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const data = await r.json();
      const quotes = data?.quoteResponse?.result || [];
      for (const q of quotes) {
        if (q.symbol && q.regularMarketPrice) prices[q.symbol] = q.regularMarketPrice;
      }
      console.log(`Fallback batch prices: ${Object.keys(prices).length}/${symbols.length}`);
    }
  } catch (e) {
    console.error('Fallback batch failed:', e.message);
  }
  
  // Last resort: return empty dict (will trigger individual fetches for all)
  return prices;
}

// ── Full ticker data assembly ─────────────────────────────────────────────────
async function fetchTickerData(symbol) {
  const sym = symbol.toUpperCase();

  const chartData = await fetchYahooChart(sym);
  if (!chartData) return null;

  const { meta, price, prevClose, hist } = chartData;
  if (!price || price < 1) return null;

  const tech = computeTechnicals(hist, price);
  const optData = await fetchOptionsChain(sym, price);

  // Recent news headlines
  let news = [];
  try {
    const nr = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${sym}&newsCount=4&quotesCount=0`, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(4000) });
    if (nr.ok) {
      const nd = await nr.json();
      news = (nd?.news || []).slice(0, 4).map(n => ({
        title: n.title,
        publisher: n.publisher,
        ageHours: Math.floor((Date.now() - n.providerPublishTime * 1000) / 3600000),
      }));
    }
  } catch (e) {}

  return {
    symbol: sym,
    name: meta.longName || meta.shortName || sym,
    current: price,
    prevClose,
    change: parseFloat((price - prevClose).toFixed(2)),
    changePct: parseFloat(((price / prevClose - 1) * 100).toFixed(2)),
    marketCap: meta.marketCap,
    sector: meta.sector || 'Unknown',
    industry: meta.industry || 'Unknown',
    marketState: meta.marketState || 'CLOSED',
    extPrice: meta.preMarketPrice || meta.postMarketPrice || null,
    // Last 5 closes for sparkline
    spark: hist.slice(-5).map(d => d.close),
    technicals: tech,
    options: optData || { expirations: [], atmCalls: [], atmPuts: [] },
    news,
    // Last 30 OHLCV for context
    recentBars: hist.slice(-30).map(d => ({
      d: d.date, o: parseFloat(d.open?.toFixed(2)), h: parseFloat(d.high?.toFixed(2)),
      l: parseFloat(d.low?.toFixed(2)), c: parseFloat(d.close?.toFixed(2)), v: d.volume
    })),
  };
}

// ── Fetch VIX for macro context ───────────────────────────────────────────────
async function fetchVIX() {
  try {
    const r = await fetch('https://query2.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d', { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    return {
      current: meta?.regularMarketPrice,
      regime: meta?.regularMarketPrice < 15 ? 'very_low_fear' : meta?.regularMarketPrice < 20 ? 'low_fear' : meta?.regularMarketPrice < 30 ? 'elevated_fear' : 'high_fear',
    };
  } catch (e) { return null; }
}

// ── Training data ─────────────────────────────────────────────────────────────
async function getTraining() {
  try {
    const { data } = await supabase.from('ai_training').select('*').eq('is_active', true).order('priority', { ascending: false });
    return data || [];
  } catch (e) { return []; }
}

// ── Build the master system prompt ───────────────────────────────────────────
function buildSystemPrompt(training) {
  const trainingBlocks = training.map((t, i) => `### Module ${i+1}: ${t.title} [${t.category}]\n${t.content}`).join('\n\n');
  return `You are AnkushAI — a professional options trading intelligence system combining 100 institutional analyst frameworks simultaneously: Technical Analysis (all patterns/timeframes), Fibonacci (precise retracement & extension targets), The Strat (1/2U/2D/3 candle types), Supply & Demand (origin candles, fresh zones), Breakout (volume confirmation), Macro (Fed/rates/VIX/dollar), Options (IV rank, expected move, delta/gamma/theta, skew), Earnings (historical reactions, guidance whisper), Sector Rotation (relative strength), Momentum (RS rank), Index Structure (SPX/QQQ key levels), Sympathy Plays (sector contagion), Mean Reversion.

CRITICAL RULES FOR LEVEL GENERATION:
1. ALL levels (entry, target, stop) MUST be anchored to ACTUAL prices from the data provided. Never invent numbers.
2. ENTRY ZONE = nearest support zone, EMA level, or demand zone BELOW current price for longs. NOT current price.
3. TARGET = next actual resistance level, fibonacci extension, or supply zone ABOVE entry. Anchored to real levels.
4. STOP LOSS = 1.0-1.5x ATR below the entry zone. Never more than 2x ATR from entry.
5. OPTIONS STOP THINKING: A $5 stop on a $500 stock with delta 0.40 = $2 move in the option. A $2 option = 100% loss at $5 drop. Options stops must be stated in OPTION VALUE terms, not just underlying.
6. TARGETS must be realistic for the timeframe: 3-7 day swing = 1-3% move max on major indices. 2-4 week = 3-7%.
7. NEVER generate levels that were valid months ago. Use only the live price data provided.

${training.length > 0 ? '## ADMIN TRAINING INTELLIGENCE\n' + trainingBlocks + '\n\n' : ''}

OUTPUT FORMAT FOR SCAN (JSON array only, no markdown):
[{
  "symbol": "NVDA",
  "setupType": "EMA21 reclaim after pullback to demand zone",
  "bias": "bullish",
  "confidence": 8,
  "optionsTrade": "Buy NVDA $895 calls expiring Apr 17",
  "entry": "$887.50-$892.00",
  "target": "$912.00 (fib ext) → $928.50 (prior high)",
  "stop": "$879.00 (1.5x ATR below entry / option down ~45%)",
  "rrRatio": "2.8:1",
  "timeHorizon": "5-8 days",
  "ivRank": 38,
  "optionCost": "$485 per contract",
  "deltaAtEntry": 0.42,
  "thetaPerDay": -$12,
  "breakEvenPrice": "$900.85",
  "keyFactor": "NVDA reclaimed EMA21 at $887 demand zone after 8% pullback from $962 highs. Volume dried up at this level 3 sessions ago (supply absorption). RSI bouncing from 44. ATR14 = $14.20 so 1.5x ATR stop = $21.30 below entry = $879 stop. IV rank at 38 = cheap premium window. Target $912 = 61.8% fib extension of the current base-to-peak move. AI infrastructure demand cycle still intact.",
  "technicalLevels": {"nearSupport": 887.50, "nearResistance": 912.00, "ema21": 889.30, "fibTarget": 912.00},
  "frameworks": ["fibonacci", "supply_demand", "momentum"],
  "urgency": "high",
  "analystAgreement": 82
}]`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v));
  const { type } = req.query;

  // ── ANALYZE single symbol ──────────────────────────────────────────────────
  if (req.method === 'GET' && type === 'analyze') {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    try {
      const [td, training] = await Promise.all([fetchTickerData(symbol), getTraining()]);
      if (!td) return res.status(503).json({ error: 'Could not fetch market data for ' + symbol });
      if (!passesGate(td)) return res.status(400).json({ error: 'Symbol below quality threshold', current: td.current });

      const sys = buildSystemPrompt(training);
      const optsSummary = td.options.atmCalls.length > 0
        ? `ATM CALLS: ${td.options.atmCalls.slice(0,2).map(c => `$${c.strike} exp ${c.expiry} ask:$${c.ask} IV:${c.iv}% delta:${c.delta||'?'} theta:${c.theta||'?'} cost/contract:$${c.contractCost}`).join(' | ')}`
        : 'Options data unavailable';
      const swings = td.technicals.swingLevels;
      const fibs = td.technicals.fibonacci;

      const msg = `LIVE MARKET DATA for ${td.symbol} (${td.name}):
Price: $${td.current} (prev close: $${td.prevClose}, change: ${td.changePct}%)
Market state: ${td.marketState}${td.extPrice ? ` | Extended hours: $${td.extPrice}` : ''}
52W Range: $${td.technicals.l52w} - $${td.technicals.h52w} (at ${td.technicals.pos52w}%)
ATR(14): $${td.technicals.atr14} — this defines realistic stop distances
EMAs: 9=$${td.technicals.ema9} 21=$${td.technicals.ema21} 50=$${td.technicals.ema50} 200=$${td.technicals.ema200}
EMA alignment: ${td.technicals.emaAlignment}
RSI(14): ${td.technicals.rsi14}
VWAP(20): $${td.technicals.vwap20}
Volume ratio: ${td.technicals.volumeRatio}x avg (avg daily: ${(td.technicals.avgVolume/1e6).toFixed(1)}M)
Sector: ${td.sector}

KEY LEVELS (use these for entries/targets/stops):
Resistance above: ${swings.resistance.map(l => `$${l.price}`).join(', ') || 'none found'}
Support below: ${swings.support.map(l => `$${l.price}`).join(', ') || 'none found'}

FIBONACCI LEVELS (90-day range $${fibs.low} - $${fibs.high}):
Retracements: 23.6%=$${fibs.fib236}, 38.2%=$${fibs.fib382}, 50%=$${fibs.fib500}, 61.8%=$${fibs.fib618}, 78.6%=$${fibs.fib786}
Upside extensions: 127%=$${fibs.upExt127}, 161.8%=$${fibs.upExt161}

ATR-based stop levels from current price:
1x ATR stop: $${td.technicals.atrStop1x}
1.5x ATR stop: $${td.technicals.atrStop15x}
2x ATR stop: $${td.technicals.atrStop2x}

${optsSummary}
Options expirations: ${td.options.expirations.slice(0,4).join(', ')}

Recent news: ${td.news.slice(0,3).map(n => `"${n.title}" (${n.ageHours}h ago)`).join(' | ')}

Last 20 bars (OHLCV): ${td.recentBars.slice(-20).map(b => `${b.d}: O${b.o} H${b.h} L${b.l} C${b.c}`).join(' | ')}

Run full 100-analyst synthesis. ALL price levels must come from the actual data above.`;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write('data: ' + JSON.stringify({ type: 'data', tickerData: td }) + '\n\n');
      const stream = client.messages.stream({ model: 'claude-sonnet-4-20250514', max_tokens: 3500, system: sys, messages: [{ role: 'user', content: msg }] });
      for await (const chunk of stream) {
        if (res.writableEnded) break;
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          res.write('data: ' + JSON.stringify({ type: 'text', text: chunk.delta.text }) + '\n\n');
        }
      }
      res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
      res.end();
    } catch (err) {
      console.error('analyze error:', err.message);
      if (!res.headersSent) return res.status(500).json({ error: err.message });
      res.write('data: ' + JSON.stringify({ type: 'error', error: err.message }) + '\n\n');
      res.end();
    }
    return;
  }

  // ── SCAN universe ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && type === 'scan') {
    try {
      const [tier, training] = await Promise.all([getUserTier(req.headers.authorization), getTraining()]);

      // Core always-included symbols + random rotation
      const core = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD', 'PLTR'];
      const rotation = [...UNIVERSE].filter(s => !core.includes(s)).sort(() => Math.random() - 0.5).slice(0, 10);
      const batch = [...core, ...rotation].slice(0, 16);

      // Batch fetch prices via Yahoo spark endpoint (single call, different rate limit bucket)
      // Then fetch full chart data only for promising symbols
      const batchPrices = await fetchBatchPrices(batch);
      
      // For symbols with valid prices, fetch full chart data sequentially with delays
      const tickerDataList = [];
      for (const sym of batch) {
        const price = batchPrices[sym];
        if (!price || price < 5) continue;
        const td = await fetchTickerData(sym).catch(() => null);
        if (td) tickerDataList.push(td);
        await new Promise(r => setTimeout(r, 300)); // 300ms between chart requests
      }

      const qualified = tickerDataList.filter(td => passesGate(td));
      if (qualified.length === 0) {
        return res.json({ setups: [], tier, error: 'Market data unavailable — all sources failed', timestamp: new Date().toISOString() });
      }

      // Fetch VIX for macro context
      const vix = await fetchVIX();
      const spyData = qualified.find(d => d.symbol === 'SPY');
      const marketCtx = {
        spyPrice: spyData?.current,
        spyRsi: spyData?.technicals?.rsi14,
        spyTrend: spyData?.technicals?.emaAlignment,
        spyAtr: spyData?.technicals?.atr14,
        vix: vix?.current,
        vixRegime: vix?.regime || 'unknown',
      };

      // Build rich scan context — every symbol gets REAL current price + key levels
      const scanContext = qualified.map(td => {
        const t = td.technicals;
        const sr = t.swingLevels;
        const fibs = t.fibonacci;
        const bestCall = td.options.atmCalls[0];
        return `${td.symbol} ($${td.current}, ${td.changePct}%, RSI:${t.rsi14}, ATR:${t.atr14}):
  EMAs: 9=$${t.ema9} 21=$${t.ema21} 50=$${t.ema50} | Align: ${t.emaAlignment}
  52W: $${t.l52w}-$${t.h52w} (pos:${t.pos52w}%) | VolRatio: ${t.volumeRatio}x
  Support: ${sr.support.slice(0,2).map(l=>`$${l.price}`).join('/')||'none'} | Resistance: ${sr.resistance.slice(0,2).map(l=>`$${l.price}`).join('/')||'none'}
  Fibs: 38.2%=$${fibs.fib382} 50%=$${fibs.fib500} 61.8%=$${fibs.fib618} | Ext127=$${fibs.upExt127}
  ATR stops: 1x=$${t.atrStop1x} 1.5x=$${t.atrStop15x}
  ${bestCall ? `ATM call: $${bestCall.strike} exp ${bestCall.expiry} ask:$${bestCall.ask} IV:${bestCall.iv}% delta:${bestCall.delta||'?'} cost:$${bestCall.contractCost}` : 'No options data'}
  News: ${td.news.slice(0,1).map(n=>n.title).join('') || 'none'}`;
      }).join('\n\n');

      const sys = buildSystemPrompt(training);
      const scanMsg = `MARKET CONTEXT RIGHT NOW:
SPY: $${marketCtx.spyPrice} RSI:${marketCtx.spyRsi} Trend:${marketCtx.spyTrend} ATR:${marketCtx.spyAtr}
VIX: ${marketCtx.vix || 'unavailable'} (${marketCtx.vixRegime})
Date: ${new Date().toISOString().split('T')[0]}

LIVE DATA FOR ${qualified.length} QUALIFIED SYMBOLS (all passed penny gate):
${scanContext}

Find the 6 BEST options trading setups right now. For each:
- Entry MUST be at a real support/demand/EMA level from the data above (not current price)
- Target MUST be at a real resistance/fibonacci/supply level from the data above  
- Stop MUST be 1-1.5x ATR below entry (use the ATR values above)
- Options stop: state what % option loss triggers exit (typically 40-50% of premium)
- Calculate: if buying the ATM call shown, what underlying move is needed to break even?
- Account for theta: holding 5 days costs X per contract in time decay
- Consider VIX regime: VIX ${marketCtx.vix} means options are ${vix?.current < 20 ? 'relatively cheap — buying premium is ok' : 'expensive — consider spreads'}

Output ONLY valid JSON array. Use ONLY prices from the data provided above.`;

      const result = await client.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 2800,
        system: sys, messages: [{ role: 'user', content: scanMsg }]
      });

      let setups = [];
      try {
        const raw = result.content[0].text.replace(/```json|```/g, '').trim();
        setups = JSON.parse(raw);
      } catch (e) {
        console.error('Parse error:', e.message, result.content[0].text.substring(0, 300));
      }

      // Enrich each setup with live ticker data
      setups = setups.map(s => {
        const td = qualified.find(d => d.symbol === s.symbol);
        if (td) {
          s.currentPrice = td.current;
          s.changePct = td.changePct;
          s.spark = td.spark;
          s.marketCap = td.marketCap;
          s.volume = td.technicals?.avgVolume;
          s.rsi = td.technicals?.rsi14;
          s.atr = td.technicals?.atr14;
          s.sector = td.sector;
        }
        return s;
      });

      return res.json({
        setups,
        tier,
        scanned: batch.length,
        qualified: qualified.length,
        filtered: batch.length - qualified.length,
        marketContext: marketCtx,
        dataQuality: qualified.length > 0 ? 'live' : 'failed',
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      console.error('Scan error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown type. Use type=analyze&symbol=X or type=scan' });
};
