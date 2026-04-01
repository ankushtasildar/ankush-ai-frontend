// ============================================================================
// ANKUSHAI ML TRAINING API — Self-Improving Intelligence
// ============================================================================
// Every prediction is logged. Every outcome is tracked. Every pattern is learned.
// The system gets smarter with every trade.
//
// Actions:
//   POST ?action=log_prediction  — Log a V3 prediction with all indicators
//   POST ?action=log_outcome     — Log what actually happened (price hit target/stop)
//   GET  ?action=accuracy        — Get accuracy stats across all predictions
//   GET  ?action=best_signals    — Which indicator combos have highest win rate
//   GET  ?action=worst_signals   — Which combos lose most (avoid these)
//   GET  ?action=learn           — AI synthesizes learnings into strategy insights
//   POST ?action=auto_test       — Run a thesis against historical data
//
// Storage: Supabase (persistent) with in-memory fallback
// ============================================================================

var GROQ_KEY = process.env.GROQ_API_KEY || '';
var SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
var SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// In-memory prediction store (fallback when Supabase unavailable)
var predictions = [];

// ============================================================================
// SUPABASE HELPERS
// ============================================================================
async function supabasePost(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

async function supabaseGet(table, query) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?select=*' + (query || '') + '&order=created_at.desc&limit=500', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

// ============================================================================
// PREDICTION LOGGING
// ============================================================================
function logPrediction(data) {
  var record = {
    id: 'pred_' + Date.now() + '_' + Math.random().toString(36).substring(7),
    created_at: new Date().toISOString(),
    symbol: data.symbol || 'QQQ',
    direction: data.direction || null,
    entry_price: data.entry || null,
    stop_price: data.stop || null,
    target1_price: data.target1 || null,
    target2_price: data.target2 || null,
    confluence_pct: data.confluencePct || null,
    confluence_bias: data.bias || null,
    risk_grade: data.grade || null,
    // Indicator snapshot at time of prediction
    macd_hist: data.macd_hist || null,
    macd_accel: data.macd_accel || null,
    macd_cross: data.macd_cross || null,
    macd_div: data.macd_div || null,
    adx_value: data.adx || null,
    adx_trending: data.adx_trending || false,
    adx_direction: data.adx_dir || null,
    squeeze_on: data.squeeze_on || false,
    squeeze_fired: data.squeeze_fired || false,
    squeeze_dir: data.squeeze_dir || null,
    vwap_position: data.vwap_position || null,
    sss50_state: data.sss50_state || null,
    ftfc_status: data.ftfc_status || null,
    ftfc_bull_pct: data.ftfc_bull_pct || null,
    hammer_shooter: data.hammer || null,
    strat_combo: data.strat_combo || null,
    or_status: data.or_status || null,
    gap_dir: data.gap_dir || null,
    reasons: data.reasons || [],
    // Outcome fields (filled later)
    outcome: null,        // 'win', 'loss', 'breakeven', 'pending'
    exit_price: null,
    pnl: null,
    duration_min: null,
    outcome_logged_at: null
  };
  predictions.push(record);
  // Try Supabase
  supabasePost('ml_predictions', record);
  return record;
}

function logOutcome(predictionId, outcomeData) {
  // Update in-memory
  var found = predictions.find(function(p) { return p.id === predictionId; });
  if (found) {
    found.outcome = outcomeData.outcome;
    found.exit_price = outcomeData.exit_price || null;
    found.pnl = outcomeData.pnl || null;
    found.duration_min = outcomeData.duration_min || null;
    found.outcome_logged_at = new Date().toISOString();
  }
  // Try Supabase update
  if (SUPABASE_URL && SUPABASE_KEY) {
    fetch(SUPABASE_URL + '/rest/v1/ml_predictions?id=eq.' + predictionId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ outcome: outcomeData.outcome, exit_price: outcomeData.exit_price, pnl: outcomeData.pnl, duration_min: outcomeData.duration_min, outcome_logged_at: new Date().toISOString() })
    }).catch(function() {});
  }
  return found || { id: predictionId, updated: true };
}

// ============================================================================
// ANALYTICS — Learn from history
// ============================================================================
function calculateAccuracy(preds) {
  var resolved = preds.filter(function(p) { return p.outcome && p.outcome !== 'pending'; });
  if (resolved.length === 0) return { total: 0, resolved: 0, message: 'No resolved predictions yet. Log trades to start learning.' };
  var wins = resolved.filter(function(p) { return p.outcome === 'win'; }).length;
  var losses = resolved.filter(function(p) { return p.outcome === 'loss'; }).length;
  var be = resolved.filter(function(p) { return p.outcome === 'breakeven'; }).length;
  var totalPnl = resolved.reduce(function(s, p) { return s + (p.pnl || 0); }, 0);
  var avgDuration = resolved.reduce(function(s, p) { return s + (p.duration_min || 0); }, 0) / resolved.length;
  // Win rate by grade
  var byGrade = {};
  resolved.forEach(function(p) {
    var g = p.risk_grade || 'unknown';
    if (!byGrade[g]) byGrade[g] = { total: 0, wins: 0 };
    byGrade[g].total++;
    if (p.outcome === 'win') byGrade[g].wins++;
  });
  Object.keys(byGrade).forEach(function(g) { byGrade[g].winRate = Math.round(byGrade[g].wins / byGrade[g].total * 100); });
  // Win rate by confluence range
  var byConfluence = { high: { total: 0, wins: 0 }, medium: { total: 0, wins: 0 }, low: { total: 0, wins: 0 } };
  resolved.forEach(function(p) {
    var bucket = p.confluence_pct >= 75 ? 'high' : p.confluence_pct >= 55 ? 'medium' : 'low';
    byConfluence[bucket].total++;
    if (p.outcome === 'win') byConfluence[bucket].wins++;
  });
  Object.keys(byConfluence).forEach(function(b) { byConfluence[b].winRate = byConfluence[b].total > 0 ? Math.round(byConfluence[b].wins / byConfluence[b].total * 100) : 0; });
  return {
    total: preds.length, resolved: resolved.length, pending: preds.length - resolved.length,
    wins: wins, losses: losses, breakeven: be,
    winRate: Math.round(wins / resolved.length * 100),
    totalPnl: +totalPnl.toFixed(2),
    avgPnl: +(totalPnl / resolved.length).toFixed(2),
    avgDuration: +avgDuration.toFixed(1),
    byGrade: byGrade,
    byConfluence: byConfluence
  };
}

function findBestSignals(preds) {
  var resolved = preds.filter(function(p) { return p.outcome && p.outcome !== 'pending'; });
  if (resolved.length < 5) return { message: 'Need at least 5 resolved predictions to identify patterns.', count: resolved.length };
  // Track win rate by signal presence
  var signals = {};
  function track(name, present) {
    if (!present) return;
    if (!signals[name]) signals[name] = { total: 0, wins: 0 };
    signals[name].total++;
  }
  function trackWin(name, present) {
    if (!present || !signals[name]) return;
    signals[name].wins++;
  }
  resolved.forEach(function(p) {
    var isWin = p.outcome === 'win';
    track('squeeze_fired', p.squeeze_fired); if (isWin) trackWin('squeeze_fired', p.squeeze_fired);
    track('squeeze_on', p.squeeze_on); if (isWin) trackWin('squeeze_on', p.squeeze_on);
    track('macd_cross_bull', p.macd_cross === 'bull_cross'); if (isWin) trackWin('macd_cross_bull', p.macd_cross === 'bull_cross');
    track('macd_cross_bear', p.macd_cross === 'bear_cross'); if (isWin) trackWin('macd_cross_bear', p.macd_cross === 'bear_cross');
    track('macd_divergence', p.macd_div && p.macd_div !== 'none'); if (isWin) trackWin('macd_divergence', p.macd_div && p.macd_div !== 'none');
    track('adx_trending', p.adx_trending); if (isWin) trackWin('adx_trending', p.adx_trending);
    track('ftfc_full', p.ftfc_status === 'BULLISH' || p.ftfc_status === 'BEARISH'); if (isWin) trackWin('ftfc_full', p.ftfc_status === 'BULLISH' || p.ftfc_status === 'BEARISH');
    track('sss50_active', p.sss50_state === 'ACTIVE'); if (isWin) trackWin('sss50_active', p.sss50_state === 'ACTIVE');
    track('sss50_complete', p.sss50_state === 'COMPLETE'); if (isWin) trackWin('sss50_complete', p.sss50_state === 'COMPLETE');
    track('hammer_inforce', p.hammer_shooter && p.hammer_shooter.indexOf('IN-FORCE') >= 0); if (isWin) trackWin('hammer_inforce', p.hammer_shooter && p.hammer_shooter.indexOf('IN-FORCE') >= 0);
    track('above_vwap', p.vwap_position === 'above'); if (isWin) trackWin('above_vwap', p.vwap_position === 'above');
    track('below_vwap', p.vwap_position === 'below'); if (isWin) trackWin('below_vwap', p.vwap_position === 'below');
    track('gap_up', p.gap_dir === 'gap_up'); if (isWin) trackWin('gap_up', p.gap_dir === 'gap_up');
    track('gap_down', p.gap_dir === 'gap_down'); if (isWin) trackWin('gap_down', p.gap_dir === 'gap_down');
    track('or_breakout', p.or_status === 'breakout'); if (isWin) trackWin('or_breakout', p.or_status === 'breakout');
    track('or_breakdown', p.or_status === 'breakdown'); if (isWin) trackWin('or_breakdown', p.or_status === 'breakdown');
  });
  // Calculate win rates and sort
  var ranked = Object.keys(signals).map(function(name) {
    return { signal: name, total: signals[name].total, wins: signals[name].wins, winRate: signals[name].total >= 3 ? Math.round(signals[name].wins / signals[name].total * 100) : null };
  }).filter(function(s) { return s.winRate !== null; }).sort(function(a, b) { return b.winRate - a.winRate; });
  return { best: ranked.slice(0, 5), worst: ranked.slice(-5).reverse(), all: ranked };
}

// AI synthesis of learnings
async function synthesizeLearnings(accuracy, bestSignals) {
  if (!GROQ_KEY) return { insight: 'AI synthesis requires Groq API key. Raw stats available in accuracy and signals endpoints.' };
  var prompt = 'You are AnkushAI\'s ML training system. Analyze these trading performance stats and provide 3-5 specific, actionable insights for improving prediction accuracy.\n\n' +
    'ACCURACY:\n' + JSON.stringify(accuracy, null, 2) + '\n\n' +
    'SIGNAL PERFORMANCE:\n' + JSON.stringify(bestSignals, null, 2) + '\n\n' +
    'Provide insights like: "Squeeze-fired setups win 78% — increase their weight in confluence scoring." or "Grade C trades lose money overall — consider raising the minimum grade threshold to B."';
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 500, temperature: 0.3, messages: [{ role: 'user', content: prompt }] })
    });
    var d = await r.json();
    return { insight: d.choices && d.choices[0] ? d.choices[0].message.content : 'No insight generated', source: 'groq' };
  } catch (e) { return { insight: 'Error generating insights: ' + e.message, source: 'error' }; }
}

// Auto-test a thesis against recent predictions
function autoTest(thesis, preds) {
  // thesis: { signal: 'squeeze_fired', direction: 'BEARISH', minConfluence: 70 }
  var matching = preds.filter(function(p) {
    var match = true;
    if (thesis.signal === 'squeeze_fired' && !p.squeeze_fired) match = false;
    if (thesis.signal === 'ftfc_full' && p.ftfc_status !== 'BULLISH' && p.ftfc_status !== 'BEARISH') match = false;
    if (thesis.signal === 'sss50_active' && p.sss50_state !== 'ACTIVE') match = false;
    if (thesis.signal === 'macd_divergence' && (!p.macd_div || p.macd_div === 'none')) match = false;
    if (thesis.direction && p.confluence_bias !== thesis.direction) match = false;
    if (thesis.minConfluence && p.confluence_pct < thesis.minConfluence) match = false;
    return match;
  });
  var resolved = matching.filter(function(p) { return p.outcome && p.outcome !== 'pending'; });
  var wins = resolved.filter(function(p) { return p.outcome === 'win'; }).length;
  return {
    thesis: thesis,
    matched: matching.length,
    resolved: resolved.length,
    wins: wins,
    winRate: resolved.length > 0 ? Math.round(wins / resolved.length * 100) : null,
    avgPnl: resolved.length > 0 ? +(resolved.reduce(function(s, p) { return s + (p.pnl || 0); }, 0) / resolved.length).toFixed(2) : null,
    conclusion: resolved.length < 3 ? 'Insufficient data — need more trades matching this thesis' : (wins / resolved.length >= 0.65 ? 'THESIS SUPPORTED — this setup has edge' : wins / resolved.length >= 0.45 ? 'THESIS INCONCLUSIVE — near breakeven' : 'THESIS REJECTED — this setup loses money')
  };
}

// ============================================================================
// HANDLER
// ============================================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    if (action === 'log_prediction' && req.method === 'POST') {
      var record = logPrediction(req.body || {});
      return res.json({ success: true, prediction: record });
    }

    if (action === 'log_outcome' && req.method === 'POST') {
      var b = req.body || {};
      if (!b.predictionId) return res.status(400).json({ error: 'predictionId required' });
      var updated = logOutcome(b.predictionId, b);
      return res.json({ success: true, prediction: updated });
    }

    if (action === 'accuracy') {
      var allPreds = (await supabaseGet('ml_predictions')) || predictions;
      var acc = calculateAccuracy(allPreds);
      return res.json(acc);
    }

    if (action === 'best_signals' || action === 'worst_signals') {
      var allPreds2 = (await supabaseGet('ml_predictions')) || predictions;
      var signals = findBestSignals(allPreds2);
      return res.json(signals);
    }

    if (action === 'learn') {
      var allPreds3 = (await supabaseGet('ml_predictions')) || predictions;
      var acc2 = calculateAccuracy(allPreds3);
      var sig2 = findBestSignals(allPreds3);
      var insights = await synthesizeLearnings(acc2, sig2);
      return res.json({ accuracy: acc2, signals: sig2, insights: insights });
    }

    if (action === 'auto_test' && req.method === 'POST') {
      var thesis = req.body || {};
      var allPreds4 = (await supabaseGet('ml_predictions')) || predictions;
      var result = autoTest(thesis, allPreds4);
      return res.json(result);
    }

    if (action === 'health') {
      return res.json({ status: 'ok', version: 'v1', predictions_in_memory: predictions.length, features: ['log_prediction', 'log_outcome', 'accuracy', 'best_signals', 'worst_signals', 'learn', 'auto_test'], supabase: SUPABASE_URL ? 'configured' : 'not_configured' });
    }

    return res.status(400).json({ error: 'action required', actions: ['log_prediction', 'log_outcome', 'accuracy', 'best_signals', 'worst_signals', 'learn', 'auto_test', 'health'] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
