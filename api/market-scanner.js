// ============================================================================
// ANKUSHAI MARKET SCANNER — Multi-Ticker Opportunity Finder
// ============================================================================
// Scans 40 tickers across all major sectors using:
//   - Yahoo Finance real-time quotes (no rate limit)
//   - Polygon prev-day data (gap calc, pivot levels)
//   - Qualification engine: gap %, price momentum, sector strength, key levels
//
// Phase 1: Quick-scan all 40 tickers (2-3 seconds)
// Phase 2: Return qualified + disqualified with reasons
//
// Endpoints:
//   GET  ?action=scan       — Run full market scan
//   GET  ?action=health     — Health check
// ============================================================================

var POLYGON_KEY = process.env.POLYGON_API_KEY || '';

// The 40 tickers — same universe as rickyzcarroll Strat Screener
var UNIVERSE = [
  // Mega-cap tech
  'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA',
  // Indices
  'SPY', 'IWM', 'DIA',
  // Semis
  'AMD', 'SMCI', 'AVGO', 'MU',
  // High-beta growth
  'PLTR', 'CRWD', 'COIN', 'MSTR', 'NET',
  // Financials
  'JPM', 'GS', 'BAC',
  // Healthcare
  'UNH', 'LLY', 'JNJ',
  // Energy
  'XOM', 'CVX',
  // Consumer
  'NFLX', 'DIS', 'NKE', 'SBUX',
  // Sector ETFs (vtrader321 methodology)
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'XLRE', 'XLU'
];

// ============================================================================
// DATA FETCHERS
// ============================================================================
async function yahooQuote(sym) {
  try {
    var r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=5d');
    if (!r.ok) return null;
    var d = await r.json();
    var res = d.chart && d.chart.result && d.chart.result[0];
    if (!res || !res.meta) return null;
    var m = res.meta;
    var ts = res.timestamp || [];
    var q = res.indicators && res.indicators.quote && res.indicators.quote[0];
    // Get today's and previous day's data
    var prevClose = m.chartPreviousClose || m.previousClose;
    var price = m.regularMarketPrice;
    var dayOpen = null;
    var dayHigh = null;
    var dayLow = null;
    var dayVol = null;
    // Extract today's OHLCV from the last entry
    if (q && ts.length > 0) {
      var lastIdx = ts.length - 1;
      dayOpen = q.open ? q.open[lastIdx] : null;
      dayHigh = q.high ? q.high[lastIdx] : null;
      dayLow = q.low ? q.low[lastIdx] : null;
      dayVol = q.volume ? q.volume[lastIdx] : null;
    }
    // Also get previous day H/L for pivots
    var prevH = null, prevL = null, prevC = prevClose;
    if (q && ts.length >= 2) {
      var pi = ts.length - 2;
      prevH = q.high ? q.high[pi] : null;
      prevL = q.low ? q.low[pi] : null;
      prevC = q.close ? q.close[pi] : prevClose;
    }
    return {
      symbol: sym,
      price: price,
      prevClose: prevClose,
      open: dayOpen || m.regularMarketOpen,
      high: dayHigh || m.regularMarketDayHigh,
      low: dayLow || m.regularMarketDayLow,
      volume: dayVol || m.regularMarketVolume,
      prevH: prevH,
      prevL: prevL,
      prevC: prevC
    };
  } catch (e) { return null; }
}

async function batchYahooQuotes(symbols) {
  // Fetch all in parallel — Yahoo has no rate limit for quotes
  var promises = symbols.map(function(sym) { return yahooQuote(sym); });
  var results = await Promise.allSettled(promises);
  var quotes = {};
  results.forEach(function(r, i) {
    if (r.status === 'fulfilled' && r.value) {
      quotes[symbols[i]] = r.value;
    }
  });
  return quotes;
}

// ============================================================================
// QUALIFICATION ENGINE
// ============================================================================
function qualifyTicker(quote) {
  if (!quote || !quote.price || !quote.prevClose) return null;
  var signals = [];
  var score = 0;
  var maxScore = 0;

  // 1. GAP ANALYSIS (max 20 points)
  maxScore += 20;
  var gapPct = (quote.open - quote.prevClose) / quote.prevClose * 100;
  var changePct = (quote.price - quote.prevClose) / quote.prevClose * 100;
  if (Math.abs(gapPct) > 1.5) {
    score += 15;
    signals.push('Large gap ' + (gapPct > 0 ? '+' : '') + gapPct.toFixed(2) + '%');
  } else if (Math.abs(gapPct) > 0.5) {
    score += 8;
    signals.push('Moderate gap ' + (gapPct > 0 ? '+' : '') + gapPct.toFixed(2) + '%');
  }
  // Gap fill potential
  if (gapPct > 0.5 && quote.price < quote.open) {
    score += 5;
    signals.push('Gap filling (bearish)');
  }
  if (gapPct < -0.5 && quote.price > quote.open) {
    score += 5;
    signals.push('Gap filling (bullish)');
  }

  // 2. MOMENTUM (max 20 points)
  maxScore += 20;
  if (Math.abs(changePct) > 2.0) {
    score += 15;
    signals.push('Strong move ' + (changePct > 0 ? '+' : '') + changePct.toFixed(2) + '%');
  } else if (Math.abs(changePct) > 1.0) {
    score += 8;
    signals.push('Moderate move ' + (changePct > 0 ? '+' : '') + changePct.toFixed(2) + '%');
  }

  // 3. KEY LEVEL PROXIMITY (max 20 points)
  maxScore += 20;
  if (quote.prevH && quote.prevL && quote.prevC) {
    var pp = (quote.prevH + quote.prevL + quote.prevC) / 3;
    var r1 = 2 * pp - quote.prevL;
    var s1 = 2 * pp - quote.prevH;
    var proximity = Math.min(
      Math.abs(quote.price - pp),
      Math.abs(quote.price - r1),
      Math.abs(quote.price - s1),
      Math.abs(quote.price - quote.prevH),
      Math.abs(quote.price - quote.prevL)
    );
    var pctFromLevel = proximity / quote.price * 100;
    if (pctFromLevel < 0.3) {
      score += 15;
      var nearestLevel = 'pivot';
      if (Math.abs(quote.price - r1) === proximity) nearestLevel = 'R1 $' + r1.toFixed(2);
      else if (Math.abs(quote.price - s1) === proximity) nearestLevel = 'S1 $' + s1.toFixed(2);
      else if (Math.abs(quote.price - quote.prevH) === proximity) nearestLevel = 'Prev High $' + quote.prevH.toFixed(2);
      else if (Math.abs(quote.price - quote.prevL) === proximity) nearestLevel = 'Prev Low $' + quote.prevL.toFixed(2);
      signals.push('At key level: ' + nearestLevel);
    } else if (pctFromLevel < 0.8) {
      score += 5;
      signals.push('Near key level');
    }
  }

  // 4. RANGE POSITION (max 15 points)
  maxScore += 15;
  if (quote.high && quote.low && quote.high > quote.low) {
    var range = quote.high - quote.low;
    var rangePos = (quote.price - quote.low) / range;
    if (rangePos > 0.85) {
      score += 10;
      signals.push('Near day high (breakout potential)');
    } else if (rangePos < 0.15) {
      score += 10;
      signals.push('Near day low (bounce potential)');
    }
  }

  // 5. VOLUME (max 10 points) — placeholder, will improve with real vol comparison
  maxScore += 10;
  if (quote.volume && quote.volume > 0) {
    score += 3; // Base points for having volume data
  }

  // Calculate qualification
  var pct = maxScore > 0 ? Math.round(score / maxScore * 100) : 0;
  var direction = changePct > 0.3 ? 'BULLISH' : changePct < -0.3 ? 'BEARISH' : 'NEUTRAL';
  var status = pct >= 50 ? 'QUALIFIED' : pct >= 30 ? 'WATCHING' : 'DISQUALIFIED';

  return {
    symbol: quote.symbol,
    price: +quote.price.toFixed(2),
    change: +changePct.toFixed(2),
    gap: +gapPct.toFixed(2),
    score: pct,
    direction: direction,
    status: status,
    signals: signals,
    open: quote.open ? +quote.open.toFixed(2) : null,
    high: quote.high ? +quote.high.toFixed(2) : null,
    low: quote.low ? +quote.low.toFixed(2) : null,
    prevClose: +quote.prevClose.toFixed(2)
  };
}

// ============================================================================
// HANDLER
// ============================================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = req.query.action || 'scan';

  try {
    if (action === 'scan') {
      var startTime = Date.now();

      // Phase 1: Quick-scan all tickers via Yahoo
      var quotes = await batchYahooQuotes(UNIVERSE);
      var fetchTime = Date.now() - startTime;

      // Phase 2: Qualify each ticker
      var results = [];
      UNIVERSE.forEach(function(sym) {
        var quote = quotes[sym];
        var q = qualifyTicker(quote);
        if (q) results.push(q);
      });

      // Sort by score (highest first)
      results.sort(function(a, b) { return b.score - a.score; });

      // Categorize
      var qualified = results.filter(function(r) { return r.status === 'QUALIFIED'; });
      var watching = results.filter(function(r) { return r.status === 'WATCHING'; });
      var disqualified = results.filter(function(r) { return r.status === 'DISQUALIFIED'; });

      var totalTime = Date.now() - startTime;

      return res.json({
        timestamp: new Date().toISOString(),
        scanned: results.length,
        qualified: qualified.length,
        watching: watching.length,
        disqualified: disqualified.length,
        fetchTimeMs: fetchTime,
        totalTimeMs: totalTime,
        // Top opportunities
        opportunities: qualified.slice(0, 10),
        // Watching list
        watchlist: watching.slice(0, 10),
        // Full results (abbreviated)
        all: results.map(function(r) {
          return { symbol: r.symbol, price: r.price, change: r.change, gap: r.gap, score: r.score, status: r.status, direction: r.direction, topSignal: r.signals.length > 0 ? r.signals[0] : null };
        }),
        universe: UNIVERSE.length,
        methodology: 'Yahoo real-time quotes + gap/momentum/key-level/range qualification',
        note: 'Qualified tickers recommended for full V3 deep scan via /api/day-trade-engine?action=predict&symbol=TICKER'
      });
    }

    if (action === 'health') {
      return res.json({ status: 'ok', version: 'v1', universe: UNIVERSE.length, tickers: UNIVERSE, methodology: 'Phase 1 quick-scan (Yahoo) + Phase 2 qualification (gap/momentum/levels/range)', note: 'Qualified tickers get deep-scanned by V3 engine' });
    }

    return res.status(400).json({ error: 'action required: scan, health' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
