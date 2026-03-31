// ============================================================
// ANKUSHAI ML BLIND-DROP BATCH TRAINER (CRON)
// ============================================================
// Schedule: Nightly 11:30 PM ET (3:30 AM UTC) via Vercel cron
// Process: Pick 10 symbols -> blind-drop AI into historical data ->
//          generate thesis -> score against actual outcome -> store
// Cost: $0 (Groq free tier)
// Timeout: Processes with 50s safety cutoff
// ============================================================

const DataService = require('../lib/data-service');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const UNIVERSE = [
  'SPY','QQQ','IWM','AAPL','MSFT','NVDA','TSLA','META','AMZN','GOOGL',
  'AMD','NFLX','JPM','GS','BA','DIS','PLTR','COIN','XOM','LLY',
  'V','MA','AVGO','ORCL','CRM','INTC','MU','SOFI','ARM','TSM',
  'SMCI','CRWD','XLE','XLF','XLK','XLV','TLT','HYG','GLD','SLV'
];

async function supaInsert(table, row) {
  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(row)
    });
    return res.ok;
  } catch (e) { return false; }
}

function pickRandom(arr, n) {
  var shuffled = arr.slice();
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
  }
  return shuffled.slice(0, n);
}

async function callGroq(prompt) {
  var KEY = process.env.GROQ_API_KEY;
  if (!KEY) return null;
  try {
    var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.5
      })
    });
    if (!res.ok) return null;
    var data = await res.json();
    if (data.choices && data.choices[0]) return data.choices[0].message.content;
    return null;
  } catch (e) { return null; }
}

async function runBlindDrop(symbol, bars) {
  if (!bars || bars.length < 40) return null;

  // Pick random cutoff: at least 30 bars from end (never peek at recent data)
  var maxCutoff = bars.length - 10;
  var minCutoff = 20;
  if (maxCutoff <= minCutoff) return null;
  var cutoff = minCutoff + Math.floor(Math.random() * (maxCutoff - minCutoff));

  var visible = bars.slice(Math.max(0, cutoff - 20), cutoff);
  var future = bars.slice(cutoff, cutoff + 5);

  if (visible.length < 10 || future.length < 3) return null;

  var lastBar = visible[visible.length - 1];
  var futureEnd = future[future.length - 1];

  // Build blind-drop prompt
  var barSummary = visible.slice(-10).map(function(b) {
    return b.date + ': O=' + b.open.toFixed(2) + ' H=' + b.high.toFixed(2) + ' L=' + b.low.toFixed(2) + ' C=' + b.close.toFixed(2);
  }).join('\n');

  var prompt = 'You are a quantitative analyst. You see the last 10 daily bars for ' + symbol + ':\n\n' +
    barSummary + '\n\n' +
    'Current price: $' + lastBar.close.toFixed(2) + ' as of ' + lastBar.date + '.\n' +
    'You do NOT know what happens next. Based ONLY on this price action:\n' +
    '1. Direction prediction for next 5 trading days: UP or DOWN\n' +
    '2. Confidence: LOW, MEDIUM, or HIGH\n' +
    '3. Expected magnitude: percentage move\n' +
    '4. Key signal you see in the bars (1 sentence)\n\n' +
    'Respond in EXACTLY this format:\n' +
    'DIRECTION: UP or DOWN\nCONFIDENCE: LOW or MEDIUM or HIGH\nMAGNITUDE: X.X%\nSIGNAL: your one-sentence reasoning';

  var response = await callGroq(prompt);
  if (!response) return null;

  // Parse response
  var dirMatch = response.match(/DIRECTION:\s*(UP|DOWN)/i);
  var confMatch = response.match(/CONFIDENCE:\s*(LOW|MEDIUM|HIGH)/i);
  var magMatch = response.match(/MAGNITUDE:\s*([0-9.]+)%/i);
  var sigMatch = response.match(/SIGNAL:\s*(.+)/i);

  var predicted = {
    direction: dirMatch ? dirMatch[1].toUpperCase() : 'UNKNOWN',
    confidence: confMatch ? confMatch[1].toUpperCase() : 'MEDIUM',
    magnitude: magMatch ? parseFloat(magMatch[1]) : 0,
    signal: sigMatch ? sigMatch[1].trim() : 'No signal parsed'
  };

  // Score against actual
  var actualMove = ((futureEnd.close - lastBar.close) / lastBar.close) * 100;
  var actualDirection = actualMove >= 0 ? 'UP' : 'DOWN';
  var directionCorrect = predicted.direction === actualDirection;

  // Magnitude accuracy: within 1 ATR
  var avgRange = visible.slice(-10).reduce(function(sum, b) { return sum + (b.high - b.low); }, 0) / 10;
  var atrPct = (avgRange / lastBar.close) * 100;
  var magnitudeAccurate = Math.abs(Math.abs(actualMove) - predicted.magnitude) <= atrPct;

  return {
    symbol: symbol,
    cutoffDate: lastBar.date,
    endDate: futureEnd.date,
    entryPrice: lastBar.close,
    exitPrice: futureEnd.close,
    predicted: predicted,
    actual: {
      direction: actualDirection,
      movePct: parseFloat(actualMove.toFixed(2)),
      moveAbs: parseFloat((futureEnd.close - lastBar.close).toFixed(2))
    },
    score: {
      directionCorrect: directionCorrect,
      magnitudeAccurate: magnitudeAccurate,
      grade: directionCorrect && magnitudeAccurate ? 'A' : directionCorrect ? 'B' : 'F'
    }
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var isAdmin = req.query && req.query.admin === 'true';
  var isCron = req.headers && req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET;
  if (!isAdmin && !isCron) return res.status(401).json({ error: 'Unauthorized' });

  var startTime = Date.now();
  var results = [];
  var errors = [];

  try {
    var symbols = pickRandom(UNIVERSE, 10);

    for (var i = 0; i < symbols.length; i++) {
      if (Date.now() - startTime > 50000) {
        errors.push('Timeout safety at symbol ' + (i + 1) + '/' + symbols.length);
        break;
      }

      var sym = symbols[i];
      try {
        var bars = await DataService.getBars(sym, 120);
        if (!bars || bars.length < 40) {
          errors.push(sym + ': insufficient bars (' + (bars ? bars.length : 0) + ')');
          continue;
        }

        var result = await runBlindDrop(sym, bars);
        if (!result) { errors.push(sym + ': blind drop returned null'); continue; }

        await supaInsert('journal_entries', {
          user_id: 'system-ml-trainer',
          type: 'ml_training',
          symbol: sym,
          content: JSON.stringify(result),
          created_at: new Date().toISOString()
        });

        results.push({
          symbol: sym,
          predicted: result.predicted.direction,
          actual: result.actual.direction,
          correct: result.score.directionCorrect,
          grade: result.score.grade
        });
      } catch (e) { errors.push(sym + ': ' + e.message); }
    }

    var totalCorrect = results.filter(function(r) { return r.correct; }).length;

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      attempted: symbols.length,
      completed: results.length,
      accuracy: results.length > 0 ? Math.round((totalCorrect / results.length) * 100) + '%' : 'N/A',
      results: results,
      errors: errors,
      durationMs: Date.now() - startTime
    });
  } catch (err) {
    console.error('[ml-batch] Error:', err.message);
    return res.status(500).json({ error: err.message, partial: results });
  }
};
