const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

async function fetchTickerData(symbol) {
  const sym = symbol.toUpperCase();
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  const [quote, opts, news] = await Promise.allSettled([
    fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=1y', { headers }).then(r => r.json()),
    fetch('https://query2.finance.yahoo.com/v7/finance/options/' + sym, { headers }).then(r => r.json()),
    fetch('https://query1.finance.yahoo.com/v1/finance/search?q=' + sym + '&newsCount=5&quotesCount=0', { headers }).then(r => r.json()),
  ]);
  const qd = quote.status === 'fulfilled' ? quote.value : null;
  const od = opts.status === 'fulfilled' ? opts.value : null;
  const nd = news.status === 'fulfilled' ? news.value : null;
  const meta = qd?.chart?.result?.[0]?.meta || {};
  const res0 = qd?.chart?.result?.[0];
  const ts = res0?.timestamp || [];
  const ohlcv = res0?.indicators?.quote?.[0] || {};
  const hist = ts.slice(-252).map((t, i) => ({
    date: new Date(t * 1000).toISOString().split('T')[0],
    close: ohlcv.close?.[ts.length - 252 + i],
    high: ohlcv.high?.[ts.length - 252 + i],
    low: ohlcv.low?.[ts.length - 252 + i],
    volume: ohlcv.volume?.[ts.length - 252 + i],
  })).filter(d => d.close != null);
  const closes = hist.map(d => d.close);
  const highs = hist.map(d => d.high);
  const lows = hist.map(d => d.low);
  const cur = meta.regularMarketPrice || closes[closes.length - 1] || 0;
  const h52 = highs.length ? Math.max(...highs) : cur;
  const l52 = lows.length ? Math.min(...lows) : cur;
  const h20 = highs.slice(-20).length ? Math.max(...highs.slice(-20)) : cur;
  const l20 = lows.slice(-20).length ? Math.min(...lows.slice(-20)) : cur;
  function calcEMA(data, p) {
    if (!data.length) return 0;
    const k = 2 / (p + 1); let e = data[0];
    for (let i = 1; i < data.length; i++) e = data[i] * k + e * (1 - k);
    return parseFloat(e.toFixed(4));
  }
  function calcRSI(data, p = 14) {
    if (data.length < p + 1) return 50;
    let g = 0, l = 0;
    for (let i = data.length - p; i < data.length; i++) {
      const d = data[i] - data[i - 1]; d > 0 ? g += d : l += Math.abs(d);
    }
    const ag = g / p, al = l / p;
    return parseFloat((100 - 100 / (1 + (al === 0 ? 9999 : ag / al))).toFixed(2));
  }
  const e9 = calcEMA(closes.slice(-50), 9);
  const e21 = calcEMA(closes.slice(-50), 21);
  const e50 = calcEMA(closes.slice(-100), 50);
  const e200 = calcEMA(closes, 200);
  const r14 = calcRSI(closes);
  const avgV = hist.slice(-20).reduce((s, d) => s + (d.volume || 0), 0) / 20;
  const lastVol = hist[hist.length - 1]?.volume || 0;
  const volR = avgV > 0 ? (lastVol / avgV).toFixed(2) : '1.00';
  const fr = h52 - l52 || 1;
  const fib = {
    '0%': parseFloat(l52.toFixed(2)),
    '23.6%': parseFloat((l52 + fr * .236).toFixed(2)),
    '38.2%': parseFloat((l52 + fr * .382).toFixed(2)),
    '50%': parseFloat((l52 + fr * .5).toFixed(2)),
    '61.8%': parseFloat((l52 + fr * .618).toFixed(2)),
    '78.6%': parseFloat((l52 + fr * .786).toFixed(2)),
    '100%': parseFloat(h52.toFixed(2)),
  };
  const pos52 = h52 > l52 ? parseFloat(((cur - l52) / (h52 - l52) * 100).toFixed(1)) : 50;
  const optRes = od?.optionChain?.result?.[0];
  const calls = (optRes?.options?.[0]?.calls || []).filter(c => Math.abs(c.strike - cur) < cur * .05).slice(0, 3);
  const puts = (optRes?.options?.[0]?.puts || []).filter(p => Math.abs(p.strike - cur) < cur * .05).slice(0, 3);
  const exps = (optRes?.expirationDates || []).slice(0, 4).map(d => new Date(d * 1000).toISOString().split('T')[0]);
  const headlines = (nd?.news || []).slice(0, 5).map(n => ({ title: n.title, publisher: n.publisher, age: Math.floor((Date.now() - n.providerPublishTime * 1000) / 3600000) + 'h ago' }));
  return {
    symbol: sym, name: meta.longName || meta.shortName || sym,
    current: cur, change: parseFloat(((cur - meta.previousClose) || 0).toFixed(2)),
    changePct: parseFloat(((cur / (meta.previousClose || cur) - 1) * 100).toFixed(2)),
    volume: lastVol, volumeRatio: volR, marketCap: meta.marketCap,
    sector: meta.sector || 'Unknown', industry: meta.industry || 'Unknown',
    pricePosition52w: pos52, high52w: h52, low52w: l52, high20d: h20, low20d: l20,
    technicals: {
      ema9: e9, ema21: e21, ema50: e50, ema200: e200, rsi14: r14,
      emaAlignment: cur > e9 && e9 > e21 && e21 > e50 ? 'bullish_stacked' : cur < e9 && e9 < e21 && e21 < e50 ? 'bearish_stacked' : 'mixed',
      distFromEMA50: parseFloat(((cur / (e50 || cur) - 1) * 100).toFixed(2)),
      distFromEMA200: parseFloat(((cur / (e200 || cur) - 1) * 100).toFixed(2)),
    },
    fibonacci: fib, options: { expirations: exps, atmCalls: calls.map(c => ({ strike: c.strike, ask: c.ask, bid: c.bid, iv: c.impliedVolatility, oi: c.openInterest })), atmPuts: puts.map(p => ({ strike: p.strike, ask: p.ask, bid: p.bid, iv: p.impliedVolatility, oi: p.openInterest })) },
    news: headlines, priceHistory: hist.slice(-60),
  };
}

async function getTraining() {
  try {
    const { data } = await supabase.from('ai_training').select('*').eq('is_active', true).order('priority', { ascending: false });
    return data || [];
  } catch (e) { return []; }
}

function buildPrompt(training) {
  const blocks = training.map((t, i) => '### Module ' + (i + 1) + ': ' + t.title + ' [' + t.category + ']' + '\n' + t.content).join('\n\n');
  return 'You are AnkushAI — the combined intelligence of 100 professional traders spanning every discipline: Technical (trendlines, all patterns, all timeframes), Fibonacci (exact retracement/extension targets), The Strat (1/2U/2D/3 candle types, broadening formations), Supply & Demand (origin candles, fresh zones), Breakout (consolidation, volume dry-up), Macro (Fed/yields/VIX/dollar), Options (IV rank, expected moves, skew, gamma), Earnings (historical reactions, guidance, whisper), Sector Rotation (relative strength, money flow), Momentum (RS rank, MACD), Index (SPX/QQQ structure), Sympathy Plays (sector contagion), Value/Mean Reversion.' +
    '\n\nYou give NO strategy more weight than another — you synthesize ALL simultaneously.' +
    (training.length > 0 ? '\n\n## ADMIN-TRAINED INTELLIGENCE\n' + blocks : '') +
    '\n\nYOUR MISSION: Produce COMPREHENSIVE analysis that: (1) synthesizes ALL frameworks, (2) identifies the single best options trade with SPECIFIC strike + expiration, (3) assigns confidence 1-10 based on confluence count, (4) gives PRECISE dollar levels not ranges, (5) states exact invalidation level.\n\nFormat: ### VERDICT [BULLISH/BEARISH/NEUTRAL] | Confidence X/10\n### TECHNICAL STRUCTURE\n### KEY LEVELS\n### OPTIONS RECOMMENDATION\n### MACRO & SECTOR CONTEXT\n### CATALYST CALENDAR\n### NEWS SENTIMENT\n### THESIS\n### INVALIDATION\n### STRATEGY DIVERGENCE\n\nBe direct. Dollar amounts. Specific dates. No hedging.';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v)); return res.status(200).end(); }
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  const { type } = req.query;

  if (req.method === 'GET' && type === 'analyze') {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    try {
      const [td, tr] = await Promise.all([fetchTickerData(symbol), getTraining()]);
      const sys = buildPrompt(tr);
      const msg = 'Analyze ' + td.symbol + ' (' + td.name + '). Price: $' + td.current + ' (' + (td.changePct > 0 ? '+' : '') + td.changePct + '%). 52W: $' + td.low52w + '-$' + td.high52w + ' (' + td.pricePosition52w + '% pos). Vol: ' + td.volumeRatio + 'x avg. Sector: ' + td.sector + '. EMAs: $' + td.technicals.ema9 + '/$' + td.technicals.ema21 + '/$' + td.technicals.ema50 + '/$' + td.technicals.ema200 + '. RSI: ' + td.technicals.rsi14 + '. Alignment: ' + td.technicals.emaAlignment + '. Dist EMA50: ' + td.technicals.distFromEMA50 + '%. Dist EMA200: ' + td.technicals.distFromEMA200 + '%. Fib levels: ' + Object.entries(td.fibonacci).map(([k, v]) => k + ':$' + v).join(', ') + '. Next exps: ' + td.options.expirations.slice(0, 2).join(', ') + '. ATM calls: ' + JSON.stringify(td.options.atmCalls.slice(0, 2)) + '. News: ' + td.news.slice(0, 3).map(n => n.title).join('; ') + '. Last 20 closes: ' + td.priceHistory.slice(-20).map(d => d.close?.toFixed(2)).join(',') + '. Run full 100-analyst synthesis.';
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write('data: ' + JSON.stringify({ type: 'data', tickerData: td }) + '\n\n');
      const stream = client.messages.stream({ model: 'claude-sonnet-4-20250514', max_tokens: 3000, system: sys, messages: [{ role: 'user', content: msg }] });
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          res.write('data: ' + JSON.stringify({ type: 'text', text: chunk.delta.text }) + '\n\n');
        }
      }
      res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
      res.end();
    } catch (err) {
      console.error('Analysis error:', err.message);
      if (!res.headersSent) return res.status(500).json({ error: err.message });
      res.write('data: ' + JSON.stringify({ type: 'error', error: err.message }) + '\n\n');
      res.end();
    }
    return;
  }

  if (req.method === 'GET' && type === 'scan') {
    try {
      const tr = await getTraining();
      const sys = buildPrompt(tr);
      const syms = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'PLTR', 'COIN'];
      const list = await Promise.all(syms.map(s => fetchTickerData(s).catch(() => null)));
      const valid = list.filter(Boolean);
      const snap = valid.map(d => d.symbol + ': $' + d.current + ' (' + (d.changePct > 0 ? '+' : '') + d.changePct + '%) RSI:' + d.technicals.rsi14 + ' Vol:' + d.volumeRatio + 'x EMAs:' + d.technicals.emaAlignment + ' 52Wpos:' + d.pricePosition52w + '% Fib50:$' + d.fibonacci['50%']).join('\n');
      const scanMsg = 'You are scanning ' + valid.length + ' stocks for the 6 BEST options trading opportunities. Market data:\n' + snap + '\n\nActive training modules: ' + tr.length + '. Use ALL frameworks: breakout, momentum, fibonacci, macro, earnings, sympathy plays, value, options IV, The Strat, technical, sector rotation, supply/demand zones.\n\nFor each setup identify: why this stock NOW above all others, the exact setup type, the specific options trade with strike + expiration, confidence 1-10, entry/target/stop levels, and the single key factor making it compelling today.\n\nOutput ONLY a valid JSON array:\n[{"symbol":"X","setupType":"...","bias":"bullish","confidence":8,"optionsTrade":"Buy X $XXX calls, 3 weeks out","entry":"$XXX","target":"$XXX","stop":"$XXX","keyFactor":"...","frameworks":["breakout","momentum"],"urgency":"high"}]';
      const result = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system: sys, messages: [{ role: 'user', content: scanMsg }] });
      let setups = [];
      try { setups = JSON.parse(result.content[0].text.replace(/```json|```/g, '').trim()); } catch (e) { console.error('parse error:', e.message, result.content[0].text.substring(0, 100)); }
      return res.json({ setups, scanned: syms.length, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('Scan error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown type. Use type=analyze&symbol=X or type=scan' });
};