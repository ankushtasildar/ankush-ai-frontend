// ============================================================================
// ANKUSHAI DAY TRADE ENGINE v1
// ============================================================================
// CEO Vision: AI that learns from real QQQ options day trades, discovers
// patterns across multiple timeframes, builds strategies autonomously,
// and gives live intraday calls with specific entry/exit/time targets.
//
// Team: Jake Morrison (S/D), Dr. Wei Chen (Bollinger), Carlos Vega (Trendlines),
//   Mia Thornton (The Strat), Dr. Amir Patel (Fibs), Nina Kowalski (EMA),
//   Tomas Guerrero (S/R), Dr. Yuki Sato (Candles), Derrick Woods (Options Flow),
//   Sophie Laurent (Gap/OR), Ryan Kim (Intraday Data), Dr. Priya Sharma (ML)
//
// Actions:
//   POST ?action=log_trade   — Log a past QQQ options day trade
//   POST ?action=backtest    — Analyze a trade with multi-TF context + AI
//   GET  ?action=strategies  — List discovered strategies
//   GET  ?action=live_scan   — Real-time QQQ multi-TF scan
//
// All timestamps in PST (America/Los_Angeles)
// ============================================================================

var SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var POLYGON = process.env.POLYGON_API_KEY || '';
var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

async function fetchJson(url) {
  var r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function supaInsert(table, row) {
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(row)
    });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

async function supaGet(table, query) {
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    return r.ok ? r.json() : [];
  } catch (e) { return []; }
}

function toPST(d) { return new Date(d).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }); }

// == MULTI-TIMEFRAME DATA (Ryan Kim) =========================================
async function fetchMultiTimeframe(symbol, dateStr) {
  var results = { symbol: symbol, date: dateStr, timeframes: {} };
  if (!POLYGON) return results;
  var tfs = [
    { label: '1m', mult: 1, span: 'minute', lim: 390 },
    { label: '5m', mult: 5, span: 'minute', lim: 78 },
    { label: '15m', mult: 15, span: 'minute', lim: 26 },
    { label: '1h', mult: 1, span: 'hour', lim: 7 }
  ];
  var fetches = tfs.map(function(tf) {
    return fetchJson('https://api.polygon.io/v2/aggs/ticker/' + symbol + '/range/' + tf.mult + '/' + tf.span + '/' + dateStr + '/' + dateStr + '?adjusted=true&sort=asc&limit=' + tf.lim + '&apiKey=' + POLYGON)
    .then(function(d) { return { label: tf.label, bars: (d.results || []).map(function(b) { return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; }) }; })
    .catch(function() { return { label: tf.label, bars: [] }; });
  });
  var from20 = new Date(new Date(dateStr).getTime() - 20*86400000).toISOString().split('T')[0];
  fetches.push(
    fetchJson('https://api.polygon.io/v2/aggs/ticker/' + symbol + '/range/1/day/' + from20 + '/' + dateStr + '?adjusted=true&sort=asc&limit=20&apiKey=' + POLYGON)
    .then(function(d) { return { label: 'daily', bars: (d.results || []).map(function(b) { return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; }) }; })
    .catch(function() { return { label: 'daily', bars: [] }; })
  );
  var tfR = await Promise.allSettled(fetches);
  tfR.forEach(function(r) { if (r.status === 'fulfilled' && r.value) results.timeframes[r.value.label] = r.value.bars; });
  return results;
}

// == CANDLE PATTERN DETECTION (Dr. Yuki Sato) =================================
function detectCandlePatterns(bars) {
  if (!bars || bars.length < 3) return [];
  var pats = [];
  for (var i = 2; i < bars.length; i++) {
    var c = bars[i], p = bars[i-1];
    var body = Math.abs(c.c - c.o), range = c.h - c.l, pBody = Math.abs(p.c - p.o);
    var bull = c.c > c.o, pBull = p.c > p.o;
    if (range > 0 && body / range < 0.1) pats.push({ bar: i, pattern: 'doji', signal: 'reversal' });
    if (bull && (c.o - c.l) > body*2 && (c.h - c.c) < body*0.3) pats.push({ bar: i, pattern: 'hammer', signal: 'bullish_reversal' });
    if (!bull && (c.h - c.o) > body*2 && (c.o - c.l) < body*0.3) pats.push({ bar: i, pattern: 'shooting_star', signal: 'bearish_reversal' });
    if (bull && !pBull && c.o < p.c && c.c > p.o && body > pBody) pats.push({ bar: i, pattern: 'bullish_engulfing', signal: 'bullish' });
    if (!bull && pBull && c.o > p.c && c.c < p.o && body > pBody) pats.push({ bar: i, pattern: 'bearish_engulfing', signal: 'bearish' });
    if (i >= 2 && bars[i].c>bars[i].o && bars[i-1].c>bars[i-1].o && bars[i-2].c>bars[i-2].o && bars[i].c>bars[i-1].c && bars[i-1].c>bars[i-2].c) pats.push({ bar: i, pattern: 'three_white_soldiers', signal: 'strong_bullish' });
    if (i >= 2 && bars[i].c<bars[i].o && bars[i-1].c<bars[i-1].o && bars[i-2].c<bars[i-2].o && bars[i].c<bars[i-1].c && bars[i-1].c<bars[i-2].c) pats.push({ bar: i, pattern: 'three_black_crows', signal: 'strong_bearish' });
  }
  return pats.slice(-10);
}

// == KEY LEVELS (Jake Morrison S/D + Tomas Guerrero S/R + Sophie Laurent OR) ==
function detectKeyLevels(dailyBars, intradayBars) {
  var lv = {};
  if (dailyBars && dailyBars.length >= 2) {
    var prev = dailyBars[dailyBars.length - 2];
    lv.prevDayHigh = prev.h; lv.prevDayLow = prev.l; lv.prevDayClose = prev.c;
  }
  if (intradayBars && intradayBars.length > 0) {
    var cumVol = 0, cumTP = 0;
    intradayBars.forEach(function(b) { var tp = (b.h+b.l+b.c)/3; cumTP += tp*(b.v||1); cumVol += (b.v||1); });
    lv.vwap = cumVol > 0 ? +(cumTP/cumVol).toFixed(2) : null;
  }
  if (intradayBars && intradayBars.length >= 30) {
    var f30 = intradayBars.slice(0, 30);
    lv.orHigh = Math.max.apply(null, f30.map(function(b){return b.h}));
    lv.orLow = Math.min.apply(null, f30.map(function(b){return b.l}));
  }
  if (dailyBars && dailyBars.length >= 10) {
    lv.resistance10d = Math.max.apply(null, dailyBars.slice(-10).map(function(b){return b.h}));
    lv.support10d = Math.min.apply(null, dailyBars.slice(-10).map(function(b){return b.l}));
  }
  return lv;
}

// == INDICATORS (Nina Kowalski EMA + Dr. Wei Chen BB + Dr. Amir Patel Fibs) ===
function computeIndicators(bars) {
  if (!bars || bars.length < 10) return {};
  var closes = bars.map(function(b){return b.c}), last = closes[closes.length-1];
  function ema(arr, p) { if(arr.length<p) return null; var k=2/(p+1),e=arr[0]; for(var i=1;i<arr.length;i++) e=arr[i]*k+e*(1-k); return +e.toFixed(4); }
  var ema9 = ema(closes,9), ema21 = ema(closes,21), ema50 = ema(closes,50);
  var gains=0,losses=0,per=Math.min(14,closes.length-1);
  for(var i=closes.length-per;i<closes.length;i++){var diff=closes[i]-closes[i-1];if(diff>0)gains+=diff;else losses-=diff;}
  var rs=losses>0?gains/losses:100, rsi=+(100-100/(1+rs)).toFixed(1);
  var bb={};
  if(closes.length>=20){var s20=closes.slice(-20),mn=s20.reduce(function(a,b){return a+b},0)/20,vr=s20.reduce(function(a,b){return a+Math.pow(b-mn,2)},0)/20,sd=Math.sqrt(vr);bb={upper:+(mn+2*sd).toFixed(2),mid:+mn.toFixed(2),lower:+(mn-2*sd).toFixed(2),pctB:sd>0?+((last-(mn-2*sd))/(4*sd)*100).toFixed(1):50};}
  return { ema9:ema9, ema21:ema21, ema50:ema50, rsi:rsi, bb:bb, last:last };
}

// == LOG TRADE ================================================================
async function logTrade(body) {
  var trade = {
    user_id: body.userId || 'ankush',
    type: 'day_trade_backlog',
    symbol: 'QQQ',
    content: JSON.stringify({
      date: body.date, entryTime: body.entryTime, exitTime: body.exitTime,
      direction: body.direction || 'call', strike: body.strike, expiry: body.expiry,
      entryPrice: body.entryPrice, exitPrice: body.exitPrice, contracts: body.contracts || 1,
      pnl: body.exitPrice && body.entryPrice ? +((body.exitPrice - body.entryPrice) * (body.contracts||1) * 100).toFixed(2) : null,
      pnlPct: body.exitPrice && body.entryPrice ? +(((body.exitPrice - body.entryPrice) / body.entryPrice) * 100).toFixed(1) : null,
      notes: body.notes || '', qqqAtEntry: body.qqqAtEntry, qqqAtExit: body.qqqAtExit, status: 'logged'
    }),
    created_at: new Date().toISOString()
  };
  var result = await supaInsert('journal_entries', trade);
  return { success: !!result, trade: JSON.parse(trade.content) };
}

// == BACKTEST + AI ANALYSIS ===================================================
async function backtestTrade(body) {
  var td = typeof body === 'string' ? JSON.parse(body) : body;
  var mtf = await fetchMultiTimeframe('QQQ', td.date);
  var patterns = {}, indicators = {};
  Object.keys(mtf.timeframes).forEach(function(tf) {
    patterns[tf] = detectCandlePatterns(mtf.timeframes[tf]);
    indicators[tf] = computeIndicators(mtf.timeframes[tf]);
  });
  var levels = detectKeyLevels(mtf.timeframes['daily']||[], mtf.timeframes['1m']||[]);

  // Sector leaders
  var leaders = {};
  try {
    var lr = await Promise.allSettled(['AAPL','MSFT','NVDA'].map(function(sym) {
      return fetchJson('https://api.polygon.io/v2/aggs/ticker/'+sym+'/range/5/minute/'+td.date+'/'+td.date+'?adjusted=true&sort=asc&limit=78&apiKey='+POLYGON)
      .then(function(d) { var b=d.results||[]; return { sym:sym, bars:b.length, change: b.length>=2 ? +((b[b.length-1].c-b[0].o)/b[0].o*100).toFixed(2) : 0 }; });
    }));
    lr.forEach(function(r) { if(r.status==='fulfilled') leaders[r.value.sym] = r.value; });
  } catch(e) {}

  var backtest = { trade: td, barCounts: {}, candlePatterns: patterns, indicators: indicators, keyLevels: levels, sectorLeaders: leaders };
  Object.keys(mtf.timeframes).forEach(function(k) { backtest.barCounts[k] = mtf.timeframes[k].length; });

  // AI analysis
  if (!ANTHROPIC_KEY) return { backtest: backtest, analysis: { error: 'No API key' } };
  var prompt = 'You are 12 elite QQQ day trade specialists (S/D zones, Bollinger, Trendlines, The Strat, Fibs, EMA, S/R, Candles, Options Flow, Gap/OR, ML, Intraday Data).\n\n' +
    'TRADE: ' + td.date + ' | ' + td.direction + ' ' + td.strike + 'C/P | Entry $' + td.entryPrice + ' at ' + td.entryTime + ' PST | Exit $' + td.exitPrice + ' at ' + td.exitTime + ' PST\n' +
    'QQQ: $' + td.qqqAtEntry + ' -> $' + td.qqqAtExit + ' | P&L: ' + (td.pnlPct >= 0 ? '+' : '') + td.pnlPct + '%\n\n' +
    'DATA:\nCandles: ' + JSON.stringify(patterns) + '\nIndicators: ' + JSON.stringify(indicators) + '\nLevels: ' + JSON.stringify(levels) + '\nLeaders: ' + JSON.stringify(leaders) + '\n\n' +
    'Analyze WHY this trade worked/failed. Return JSON:\n' +
    '{"whyItWorked":"...","entrySignals":["..."],"exitSignals":["..."],"keyTimeframe":"1m|5m|15m|1h","candleSetup":"...","levelInteraction":"...","sectorContext":"...","strategyName":"name this pattern","strategyRules":{"entry":"...","exit":"...","timeOfDay":"PST window","expectedMove":"QQQ % move","contractTarget":"expected contract % gain"},"confidence":0-100,"similarSetups":"when this pattern typically appears"}';

  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    var d = await r.json();
    var txt = d.content && d.content[0] ? d.content[0].text : '';
    try { var analysis = JSON.parse(txt.replace(/```json\n?/g,'').replace(/```/g,'').trim()); return { backtest:backtest, analysis:analysis }; }
    catch(e) { var m = txt.match(/\{[\s\S]*\}/); return { backtest:backtest, analysis: m ? JSON.parse(m[0]) : { raw: txt.substring(0,500) } }; }
  } catch(e) { return { backtest:backtest, analysis: { error: e.message } }; }
}

// == STRATEGIES ===============================================================
async function getStrategies() {
  var trades = await supaGet('journal_entries', 'type=eq.day_trade_backlog&select=content,created_at&order=created_at.desc&limit=100');
  var strats = {};
  trades.forEach(function(t) {
    try {
      var d = JSON.parse(t.content || '{}');
      if (d.analysis && d.analysis.strategyName) {
        var n = d.analysis.strategyName;
        if (!strats[n]) strats[n] = { name:n, trades:0, wins:0, totalPnl:0, rules:d.analysis.strategyRules };
        strats[n].trades++; if(d.pnlPct>0) strats[n].wins++; strats[n].totalPnl += d.pnlPct||0;
      }
    } catch(e) {}
  });
  return { totalTrades: trades.length, strategies: Object.values(strats).map(function(s) { s.winRate = s.trades>0 ? Math.round(s.wins/s.trades*100) : 0; return s; }).sort(function(a,b){return b.winRate-a.winRate}) };
}

// == LIVE SCAN ================================================================
async function liveScan() {
  var today = new Date().toISOString().split('T')[0];
  var mtf = await fetchMultiTimeframe('QQQ', today);
  var patterns = {}, indicators = {};
  Object.keys(mtf.timeframes).forEach(function(tf) {
    patterns[tf] = detectCandlePatterns(mtf.timeframes[tf]);
    indicators[tf] = computeIndicators(mtf.timeframes[tf]);
  });
  var levels = detectKeyLevels(mtf.timeframes['daily']||[], mtf.timeframes['1m']||[]);
  return { symbol:'QQQ', timestamp:toPST(new Date().toISOString()), barCounts:Object.keys(mtf.timeframes).reduce(function(a,k){a[k]=mtf.timeframes[k].length;return a},{}), candlePatterns:patterns, indicators:indicators, keyLevels:levels };
}

// == MAIN HANDLER =============================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var action = (req.query && req.query.action) || (req.body && req.body.action) || '';
  try {
    if (action === 'log_trade' && req.method === 'POST') return res.json(await logTrade(req.body));
    if (action === 'backtest' && req.method === 'POST') return res.json(await backtestTrade(req.body));
    if (action === 'strategies') return res.json(await getStrategies());
    if (action === 'live_scan') return res.json(await liveScan());
    return res.status(400).json({ error: 'action required: log_trade, backtest, strategies, live_scan' });
  } catch(err) {
    console.error('[day-trade-engine]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
