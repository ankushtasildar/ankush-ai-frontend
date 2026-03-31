// predict.js ÃÂ¢ÃÂÃÂ Alpha Intelligence Engine v5
// CLEAN REWRITE ÃÂ¢ÃÂÃÂ no patches, no accumulated fragments
// Uses calendar dates (not tradingDate), proper error handling

const Anthropic = require('@anthropic-ai/sdk');

const POLY = process.env.POLYGON_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Helper: Supabase REST ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
async function supaGet(table, query) {
  if (!SUPA_URL || !SUPA_KEY) return [];
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/' + table + '?' + query, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

async function supaInsert(table, row) {
  if (!SUPA_URL || !SUPA_KEY) return;
  try {
    await fetch(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });
  } catch {}
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Helper: Polygon fetch ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ

// Utility: fetch from Polygon API with key
async function polyFetch(url) {
  const POLY = process.env.POLYGON_API_KEY;
  try {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(url + sep + "apiKey=" + POLY);
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    console.log("[polyFetch] failed:", e.message);
    return null;
  }
}

// FORTIFIED getPriceData v6 - NEVER FAILS
// Uses /api/market 4-source waterfall + Polygon bars + Yahoo bars fallback

async function getPriceData(symbol) {
  const POLY = process.env.POLYGON_API_KEY;
  let currentPrice = null;
  let priceSource = "unknown";

  // STEP 1: Current price from /api/market (4-source waterfall)
  try {
    const baseUrl = process.env.VERCEL_URL
      ? "https://" + process.env.VERCEL_URL
      : "https://www.ankushai.org";
    const marketRes = await fetch(baseUrl + "/api/market?action=quote&symbol=" + symbol);
    if (marketRes.ok) {
      const mkt = await marketRes.json();
      if (mkt.price) {
        currentPrice = mkt.price;
        priceSource = "market-api-" + (mkt.source || "unknown");
      }
    }
  } catch (e) {
    console.log("[getPriceData] market API failed:", e.message);
  }
  // STEP 1b: Fallback - direct Yahoo if /api/market fails
  if (!currentPrice) {
    try {
      const yUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" + symbol + "?interval=1d&range=1d";
      const yRes = await fetch(yUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (yRes.ok) {
        const yData = await yRes.json();
        const meta = yData && yData.chart && yData.chart.result && yData.chart.result[0] && yData.chart.result[0].meta;
        if (meta && meta.regularMarketPrice) {
          currentPrice = meta.regularMarketPrice;
          priceSource = "yahoo-direct";
        }
      }
    } catch (e) {
      console.log("[getPriceData] Yahoo direct failed:", e.message);
    }
  }

  // STEP 1c: Fallback - Polygon previous close
  if (!currentPrice && POLY) {
    try {
      const prevRes = await fetch("https://api.polygon.io/v2/aggs/ticker/" + symbol + "/prev?adjusted=true&apiKey=" + POLY);
      if (prevRes.ok) {
        const prevData = await prevRes.json();
        if (prevData.results && prevData.results.length > 0) {
          currentPrice = prevData.results[0].c;
          priceSource = "polygon-prev";
        }
      }
    } catch (e) {
      console.log("[getPriceData] Polygon prev failed:", e.message);
    }
  }

  if (!currentPrice) {
    console.log("[getPriceData] ALL price sources failed for " + symbol);
    return null;
  }
  // STEP 2: Historical bars from Polygon
  let bars = [];
  if (POLY) {
    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 200);
      const fromStr = from.toISOString().split("T")[0];
      const toStr = today.toISOString().split("T")[0];
      const aggsUrl = "https://api.polygon.io/v2/aggs/ticker/" + symbol + "/range/1/day/" + fromStr + "/" + toStr + "?adjusted=true&sort=asc&limit=200&apiKey=" + POLY;
      const aggsRes = await fetch(aggsUrl);
      if (aggsRes.ok) {
        const aggsData = await aggsRes.json();
        // Accept BOTH OK and DELAYED status - free tier returns DELAYED but data is valid
        if (aggsData.results && aggsData.results.length > 0) {
          bars = aggsData.results.map(function(b) {
            return { date: new Date(b.t).toISOString().split("T")[0], open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v };
          });
          priceSource += "+polygon-bars";
        }
      }
    } catch (e) {
      console.log("[getPriceData] Polygon aggs failed:", e.message);
    }
  }

  // STEP 3: Fallback bars from Yahoo Finance
  if (bars.length === 0) {
    try {
      const yChartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" + symbol + "?interval=1d&range=6mo";
      const yRes = await fetch(yChartUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (yRes.ok) {
        const yData = await yRes.json();
        var result = yData && yData.chart && yData.chart.result && yData.chart.result[0];
        if (result && result.timestamp && result.indicators && result.indicators.quote && result.indicators.quote[0]) {
          var ts = result.timestamp;
          var q = result.indicators.quote[0];
          for (var i = 0; i < ts.length; i++) {
            if (q.close[i] != null) {
              bars.push({ date: new Date(ts[i] * 1000).toISOString().split("T")[0], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] });
            }
          }
          priceSource += "+yahoo-bars";
        }
      }
    } catch (e) {
      console.log("[getPriceData] Yahoo bars failed:", e.message);
    }
  }

  console.log("[getPriceData] " + symbol + ": price=" + currentPrice + ", source=" + priceSource + ", bars=" + bars.length);
  return { currentPrice: currentPrice, source: priceSource, bars: bars };
}

function computeTechnicals(bars) {
  if (!bars || bars.length < 20) return {};
  const closes = bars.map(b => b.c);
  const n = closes.length;
  const last = closes[n - 1];

  // EMAs
  function ema(data, period) {
    const k = 2 / (period + 1);
    let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) val = data[i] * k + val * (1 - k);
    return val;
  }

  // RSI
  function rsi(data, period) {
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const d = data[i] - data[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - 100 / (1 + rs);
  }

  // ATR
  function atr(bars14) {
    let sum = 0;
    for (let i = 1; i < bars14.length; i++) {
      const tr = Math.max(bars14[i].h - bars14[i].l, Math.abs(bars14[i].h - bars14[i - 1].c), Math.abs(bars14[i].l - bars14[i - 1].c));
      sum += tr;
    }
    return sum / (bars14.length - 1);
  }

  const ema8 = ema(closes, 8);
  const ema21 = ema(closes, 21);
  const ema50 = n >= 50 ? ema(closes, 50) : null;
  const ema200 = n >= 200 ? ema(closes, 200) : null;
  const rsi14 = n >= 15 ? rsi(closes, 14) : null;
  const atr14 = bars.length >= 15 ? atr(bars.slice(-15)) : null;

  // Rate of change
  const roc = (period) => n > period ? ((last - closes[n - 1 - period]) / closes[n - 1 - period] * 100) : null;

  // Volume trend
  const vol5 = bars.slice(-5).reduce((a, b) => a + b.v, 0) / 5;
  const vol20 = bars.slice(-20).reduce((a, b) => a + b.v, 0) / Math.min(20, bars.length);

  // 52-week high/low
  const highs = bars.map(b => b.h);
  const lows = bars.map(b => b.l);
  const high52 = Math.max(...highs);
  const low52 = Math.min(...lows);

  return {
    price: last,
    ema8, ema21, ema50, ema200,
    rsi14,
    atr14,
    roc1d: roc(1), roc5d: roc(5), roc10d: roc(10), roc20d: roc(20),
    volumeTrend: vol5 / vol20,
    high52w: high52, low52w: low52,
    drawdownFromHigh: ((last - high52) / high52 * 100),
    bullStack: last > ema8 && ema8 > ema21 && (ema50 === null || ema21 > ema50),
    bearStack: last < ema8 && ema8 < ema21 && (ema50 === null || ema21 < ema50)
  };
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ GET MACRO CONTEXT ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
async function getMacroContext() {
  // SPY for market direction, VIX for fear
  const [spyData, vixPrev] = await Promise.all([
    getPriceData('SPY'),
    polyFetch('https://api.polygon.io/v2/aggs/ticker/VIX/prev')
  ]);
  const vix = vixPrev && vixPrev.results && vixPrev.results[0] ? vixPrev.results[0].c : null;
  const spyPrice = spyData ? spyData.currentPrice : null;
  const spyTech = spyData && spyData.bars ? computeTechnicals(spyData.bars) : {};

  // Upcoming events from Supabase
  const events = await supaGet('macro_events', 'event_date=gte.' + new Date().toISOString().split('T')[0] + '&order=event_date.asc&limit=5');

  return {
    spy: spyPrice, spyRoc5d: spyTech.roc5d, spyRoc20d: spyTech.roc20d,
    vix: vix,
    regime: vix > 30 ? 'high_fear' : vix > 20 ? 'elevated' : 'low_vol',
    upcomingEvents: events.map(e => e.title + ' ' + e.event_date).join('; ')
  };
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ GET HISTORICAL EDGE (learned patterns) ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
async function getHistoricalEdge(symbol) {
  const patterns = await supaGet('ai_learned_patterns', 'order=win_rate.desc&limit=5');
  const setupHistory = await supaGet('setup_records', 'symbol=eq.' + symbol + '&order=created_at.desc&limit=10');
  const total = setupHistory.length;
  const wins = setupHistory.filter(s => s.thesis_validated === true).length;
  return {
    patterns: patterns.map(p => p.pattern_name + ' (win:' + (p.win_rate || 0) + '%)').join(', '),
    winRate: total > 0 ? Math.round(wins / total * 100) : null,
    total: total,
    recentOutcomes: setupHistory.slice(0, 5).map(s => s.symbol + ':' + (s.thesis_validated ? 'W' : s.thesis_validated === false ? 'L' : '?')).join(', ')
  };
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ GET EARNINGS CONTEXT ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
async function getEarningsContext(symbol) {
  const today = new Date().toISOString().split('T')[0];
  const future = new Date();
  future.setDate(future.getDate() + 90);
  const futureStr = future.toISOString().split('T')[0];
  const events = await supaGet('macro_events', 'event_type=eq.earnings&symbol=eq.' + symbol + '&event_date=gte.' + today + '&event_date=lte.' + futureStr + '&order=event_date.asc&limit=1');
  if (events.length > 0) {
    const daysOut = Math.ceil((new Date(events[0].event_date) - new Date()) / 86400000);
    return { earningsDate: events[0].event_date, earningsDaysOut: daysOut };
  }
  return { earningsDate: null, earningsDaysOut: null };
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ BUILD THE ALPHA PROMPT ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
function buildAlphaPrompt(symbol, priceData, technicals, macro, edge, earnings, style, newsCtx) {
  const styleContext = style === 'daytrade' ? 'Focus on INTRADAY setups (0-2 days). Gamma risk, IV crush, delta decay matter enormously.'
    : style === 'leap' ? 'Focus on LONG-TERM setups (3-12 months). Fundamental catalysts, macro regime shifts, LEAPS premium decay.'
    : 'Focus on SWING setups (3 days to 9 months). Earnings cycles, sector rotation, technical breakout/breakdown patterns.';

  const earningsStr = earnings.earningsDaysOut ? 'UPCOMING EARNINGS: ' + earnings.earningsDaysOut + ' days out (' + earnings.earningsDate + ') - HIGH-ALPHA WINDOW. Factor this into time horizon and IV expectations.' : 'No imminent earnings.';

  return 'You are Marcus Webb, a senior institutional VP with 20 years at Goldman Sachs and Two Sigma. You provide LEADING indicators, not lagging confirmation. Your analysis must be forward-looking.\n\n'
    + 'SYMBOL: ' + symbol + '\n'
    + 'REAL PRICE: $' + (priceData.currentPrice || 0).toFixed(2) + '\n'
    + 'SOURCE: ' + (priceData.source || 'unknown') + '\n\n'
    + 'TECHNICALS:\n'
    + 'EMA8: ' + (technicals.ema8 || 0).toFixed(2) + ' | EMA21: ' + (technicals.ema21 || 0).toFixed(2)
    + (technicals.ema50 ? ' | EMA50: ' + technicals.ema50.toFixed(2) : '') + '\n'
    + 'RSI(14): ' + (technicals.rsi14 || 0).toFixed(1) + '\n'
    + 'ATR(14): ' + (technicals.atr14 || 0).toFixed(2) + '\n'
    + 'ROC 1d:' + (technicals.roc1d || 0).toFixed(2) + '% 5d:' + (technicals.roc5d || 0).toFixed(2) + '% 20d:' + (technicals.roc20d || 0).toFixed(2) + '%\n'
    + 'Stack: ' + (technicals.bullStack ? 'BULLISH' : technicals.bearStack ? 'BEARISH' : 'MIXED') + '\n'
    + 'Volume trend (5d/20d): ' + (technicals.volumeTrend || 0).toFixed(2) + 'x\n'
    + '52w High: ' + (technicals.high52w || 0).toFixed(2) + ' | Low: ' + (technicals.low52w || 0).toFixed(2) + ' | Drawdown: ' + (technicals.drawdownFromHigh || 0).toFixed(1) + '%\n\n'
    + 'MACRO: SPY $' + (macro.spy || 0).toFixed(2) + ' (5d:' + (macro.spyRoc5d || 0).toFixed(1) + '% 20d:' + (macro.spyRoc20d || 0).toFixed(1) + '%) | VIX: ' + (macro.vix || 0).toFixed(1) + ' (' + macro.regime + ')\n'
    + 'Events: ' + (macro.upcomingEvents || 'none') + '\n\n'
    + earningsStr + '\n\n'
    + 'HISTORICAL EDGE: ' + (edge.patterns || 'no patterns yet') + '\n'
    + 'Win rate on ' + symbol + ': ' + (edge.winRate !== null ? edge.winRate + '%' : 'N/A') + ' (' + edge.total + ' predictions)\n'
    + 'Recent: ' + (edge.recentOutcomes || 'none') + '\n\n'
    + ((newsCtx && newsCtx.total > 0) ? 'NEWS CONTEXT (21-day multi-horizon):\n' + (newsCtx.fresh && newsCtx.fresh.length ? 'Fresh (0-2d): ' + newsCtx.fresh.slice(0,3).map(function(n){return '['+n.type+'] '+n.title}).join(' | ') + '\n' : '') + (newsCtx.developing && newsCtx.developing.length ? 'Developing (3-7d): ' + newsCtx.developing.filter(function(n){return n.type!=='NOISE'}).slice(0,2).map(function(n){return '['+n.type+'] '+n.title}).join(' | ') + '\n' : '') + (newsCtx.thesis && newsCtx.thesis.length ? 'Thesis (8-21d catalysts): ' + newsCtx.thesis.filter(function(n){return n.type==='PREDICTIVE'}).slice(0,2).map(function(n){return '['+n.daysAgo+'d ago] '+n.title}).join(' | ') + '\n' : '') + 'NOTE: Older PREDICTIVE articles not yet reflected in price = potential undervalued catalyst.\n\n' : '') + 'TRADE STYLE: ' + (style || 'swing') + '\n' + styleContext + '\n\n'
    + 'Respond ONLY with valid JSON:\n'
    + '{"sentiment":{"overall":"bullish|bearish|neutral","confidence":0-100,"timeframe":"short|medium|long"},'
    + '"leadingThesis":"2-3 sentence FORWARD-LOOKING thesis",'
    + '"institutionalEdge":"what smart money sees that retail misses",'
    + '"scenarios":[{"name":"Primary Alpha Play","probability":0-100,"target":0.00,"timeframe":"Xd-Yd","whatToWatch":"...","positionStrategy":"specific options or equity strategy"},'
    + '{"name":"Base Case","probability":0-100,"target":0.00,"timeframe":"..."},'
    + '{"name":"Bear/Hedge Case","probability":0-100,"target":0.00,"timeframe":"...","hedgeStrategy":"..."}],'
    + '"institutionalLevels":{"accumulation":0.00,"distribution":0.00,"breakoutAbove":0.00,"breakdownBelow":0.00},'
    + '"optionsAlpha":{"ivEnvironment":"low|moderate|high","recommendedStrategy":"...","strikeSelection":"...","expiryGuidance":"...","maxRiskPercent":0,"exitRules":"..."},'
    + '"sectorRotation":{"signal":"...","relativeStrength":"..."},'
    + '"riskFactors":["..."],'
    + '"edgeScore":0-100}';
}


// ========================================================================
// ADAPTIVE CATALYST DETECTION + MULTI-HORIZON NEWS
// Dr. Sanjay Iyer (Catalyst Lifecycle) + Dr. Lena Kovac (Temporal Intel)
// Dr. Elena Rossi (Sector Context) + Raj Mehta (NLP Classification)
// ========================================================================

var CATALYST_WINDOWS = {
  momentum:{days:10,freshD:2,devD:5,label:"momentum/breakout"},
  earnings:{days:45,freshD:3,devD:14,label:"earnings cycle"},
  fda:{days:90,freshD:5,devD:21,label:"FDA/regulatory"},
  ma:{days:60,freshD:3,devD:14,label:"M&A/activist"},
  macro:{days:90,freshD:3,devD:14,label:"macro/rate sensitive"},
  commodity:{days:90,freshD:5,devD:21,label:"commodity cycle"},
  product:{days:60,freshD:3,devD:14,label:"product cycle"},
  restructure:{days:120,freshD:5,devD:21,label:"restructuring"},
  general:{days:21,freshD:2,devD:7,label:"general"}
};

var SECTOR_HINT = {LLY:"fda",JNJ:"fda",PFE:"fda",ABBV:"fda",MRK:"fda",AMGN:"fda",GILD:"fda",BMY:"fda",MRNA:"fda",BIIB:"fda",XBI:"fda",XOM:"commodity",CVX:"commodity",COP:"commodity",SLB:"commodity",OXY:"commodity",XLE:"commodity",TLT:"macro",HYG:"macro",XLF:"macro",JPM:"macro",BAC:"macro",GS:"macro",WFC:"macro"};

var CAT_KW = {
  fda:["fda","trial","phase","pdufa","approval","nda","clinical","drug","therapy","efficacy"],
  earnings:["earnings","eps","revenue","guidance","quarter","beat","miss","outlook","forecast","estimate"],
  ma:["acquisition","merger","takeover","activist","13d","proxy","bid","buyout","deal"],
  commodity:["opec","inventory","barrel","crude","production","supply","drilling"],
  product:["launch","product","release","unveil","iphone","chip","partnership","contract"],
  restructure:["restructur","layoff","cost cut","ceo change","turnaround","spin off","divest"]
};

function detectCatalyst(sym, headlines) {
  if (SECTOR_HINT[sym]) return SECTOR_HINT[sym];
  var txt = headlines.map(function(h){return(h.title||"").toLowerCase()}).join(" ");
  var best = "general", bestN = 0;
  Object.keys(CAT_KW).forEach(function(t){
    var n = 0; CAT_KW[t].forEach(function(k){if(txt.includes(k))n++});
    if(n > bestN){best = t; bestN = n;}
  });
  return best;
}

async function fetchNewsContext(symbol) {
  var POLY = process.env.POLYGON_API_KEY || "";
  var empty = {fresh:[],developing:[],thesis:[],catalyst:"general",windowDays:21,label:"general",total:0};
  if (!POLY) return empty;
  try {
    var now = new Date().toISOString().split("T")[0];
    var from120 = new Date(Date.now() - 120*86400000).toISOString().split("T")[0];
    var r = await fetch("https://api.polygon.io/v2/reference/news?ticker="+symbol+"&published_utc.gte="+from120+"&published_utc.lte="+now+"&limit=30&apiKey="+POLY);
    if (!r.ok) return empty;
    var d = await r.json();
    var articles = d.results || [];
    var cat = detectCatalyst(symbol, articles);
    var w = CATALYST_WINDOWS[cat] || CATALYST_WINDOWS.general;
    var pred = ["expected","forecast","plan","announce","launch","target","upgrade","downgrade","outlook","guidance","raise","expand","could","may","trial","phase","fda"];
    var recap = ["rose","fell","drop","surge","tumble","after","posted","beat","miss","gained","lost","closed","reported"];
    var fresh=[],developing=[],thesis=[];
    articles.forEach(function(n){
      var pub = n.published_utc ? n.published_utc.split("T")[0] : now;
      var ago = Math.round((new Date(now)-new Date(pub))/86400000);
      if (ago > w.days) return;
      var t = (n.title||"").toLowerCase(), type = "NOISE";
      for(var p=0;p<pred.length;p++){if(t.includes(pred[p])){type="PREDICTIVE";break}}
      if(type==="NOISE"){for(var rc=0;rc<recap.length;rc++){if(t.includes(recap[rc])){type="RECAP";break}}}
      var e = {title:n.title,date:pub,daysAgo:ago,type:type};
      if(ago<=w.freshD) fresh.push(e); else if(ago<=w.devD) developing.push(e); else thesis.push(e);
    });
    return {fresh:fresh,developing:developing,thesis:thesis,catalyst:cat,windowDays:w.days,label:w.label,total:articles.length};
  } catch(e) { return empty; }
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ MAIN HANDLER ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');

  const symbol = (req.query.symbol || 'SPY').toUpperCase();
  const style = req.query.style || 'swing';

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // Fetch all data in parallel
    const [priceData, macro, edge, earnings, newsCtx] = await Promise.all([
      getPriceData(symbol),
      getMacroContext(),
      getHistoricalEdge(symbol),
      getEarningsContext(symbol),
      fetchNewsContext(symbol)
    ]);

    if (!priceData) {
      return res.status(503).json({
        error: 'No market data available for ' + symbol,
        suggestion: 'Market may be closed. Try again during trading hours or check if the ticker symbol is correct.'
      });
    }

    const technicals = priceData.bars ? computeTechnicals(priceData.bars) : {};
    const prompt = buildAlphaPrompt(symbol, priceData, technicals, macro, edge, earnings, style, newsCtx);

    // Groq-first LLM call (Yusuf Okafor: per CEO directive, $0 cost)
    const GROQ_KEY = process.env.GROQ_API_KEY || '';
    const sysPrompt = 'You are Marcus Webb, ex-Goldman Sachs Strats and Two Sigma. 20 years institutional experience. Your analysis uses LEADING indicators, not lagging. All price levels MUST be derived from the real data provided. Never invent prices. Respond ONLY with valid JSON, no markdown, no preamble.';
    let raw;
    if (GROQ_KEY) {
      const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 4096, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: prompt }] })
      });
      const gd = await gr.json();
      raw = gd.choices && gd.choices[0] && gd.choices[0].message ? gd.choices[0].message.content : '';
    } else {
      // Anthropic fallback
      const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
      const msg = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 4096, system: sysPrompt, messages: [{ role: 'user', content: prompt }] });
      raw = msg.content[0].text;
    }

    // Parse JSON - handle potential wrapping
    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      // Try extracting JSON from text
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
      } else {
        return res.status(500).json({ error: 'Failed to parse AI response', raw: raw.substring(0, 200) });
      }
    }

    // Save to setup_records for backtesting
    supaInsert('setup_records', {
      symbol: symbol,
      name: symbol + ' Alpha Prediction',
      setup_type: 'alpha_prediction',
      computed_bias: analysis.sentiment ? analysis.sentiment.overall : 'neutral',
      confidence: analysis.sentiment ? analysis.sentiment.confidence : null,
      price_at_generation: priceData.currentPrice,
      engine_version: 'v5'
    }).catch(function() {});

    return res.json({
      symbol: symbol,
      currentPrice: priceData.currentPrice,
      priceSource: priceData.source,
      barsUsed: priceData.bars ? priceData.bars.length : 0,
      style: style,
      ...analysis,
      historicalEdge: edge,
      earningsContext: earnings,
      macroContext: { vix: macro.vix, regime: macro.regime, spyPrice: macro.spy },
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('[predict] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
