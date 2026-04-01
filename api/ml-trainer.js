// ============================================================================
// ANKUSHAI ML TRAINER V2 — PineCoders-Grade Analytics
// ============================================================================
// Upgrades from V1:
//   - Results in X (risk multiples) not dollars — PineCoders methodology
//   - APPT (Average Profitability Per Trade) = statistical expectancy
//   - Post-Exit Analysis (PEA) — what happened AFTER exit
//   - Sector confluence tracking (vtrader321 methodology)
//   - Enhanced signal tracking with combo detection
//
// Actions:
//   POST ?action=log_prediction  — Log prediction with all indicators
//   POST ?action=log_outcome     — Log outcome with exit details
//   GET  ?action=accuracy        — Stats with X-based results + APPT
//   GET  ?action=best_signals    — Signal win rates
//   GET  ?action=worst_signals   — Signal loss rates
//   GET  ?action=learn           — AI synthesizes learnings
//   POST ?action=auto_test       — Test thesis against history
//   GET  ?action=pea             — Post-Exit Analysis results
//   GET  ?action=health          — Health check
// ============================================================================

var GROQ_KEY = process.env.GROQ_API_KEY || '';
var SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
var SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

var predictions = [];

// Supabase helpers
async function sbPost(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try { var r = await fetch(SUPABASE_URL + '/rest/v1/' + table, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=representation' }, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch (e) { return null; }
}

async function sbGet(table, q) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try { var r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?select=*' + (q || '') + '&order=created_at.desc&limit=500', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }); return r.ok ? r.json() : null; } catch (e) { return null; }
}

// ============================================================================
// PREDICTION LOGGING — Full indicator snapshot
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
    risk_amount: data.entry && data.stop ? +Math.abs(data.entry - data.stop).toFixed(2) : null,
    confluence_pct: data.confluencePct || null,
    confluence_bias: data.bias || null,
    risk_grade: data.grade || null,
    // Full indicator snapshot
    macd_hist: data.macd_hist || null,
    macd_accel: data.macd_accel || null,
    macd_cross: data.macd_cross || null,
    macd_div: data.macd_div || null,
    adx_value: data.adx || null,
    adx_trending: data.adx_trending || false,
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
    sector_leader: data.sector_leader || null,
    sector_strength: data.sector_strength || null,
    reasons: data.reasons || [],
    // Outcome fields
    outcome: null,
    exit_price: null,
    pnl_dollars: null,
    pnl_x: null,           // PineCoders: result in risk multiples
    duration_min: null,
    outcome_logged_at: null,
    // Post-Exit Analysis fields
    pea_max_favorable: null,    // Max price move in trade direction after exit
    pea_max_adverse: null,      // Max price move against direction after exit
    pea_bars_to_max: null,      // Bars to reach max favorable after exit
    pea_5bar_result: null,      // P&L 5 bars after exit (in X)
    pea_10bar_result: null,     // P&L 10 bars after exit (in X)
    pea_15bar_result: null      // P&L 15 bars after exit (in X)
  };
  predictions.push(record);
  sbPost('ml_predictions', record);
  return record;
}

function logOutcome(predictionId, data) {
  var found = predictions.find(function(p) { return p.id === predictionId; });
  if (found) {
    found.outcome = data.outcome;
    found.exit_price = data.exit_price || null;
    found.pnl_dollars = data.pnl || null;
    found.duration_min = data.duration_min || null;
    found.outcome_logged_at = new Date().toISOString();
    // Calculate X (risk multiples) — PineCoders methodology
    if (found.risk_amount && found.risk_amount > 0 && found.pnl_dollars != null) {
      found.pnl_x = +(found.pnl_dollars / found.risk_amount).toFixed(2);
    }
    // Post-Exit Analysis data
    if (data.pea) {
      found.pea_max_favorable = data.pea.max_favorable || null;
      found.pea_max_adverse = data.pea.max_adverse || null;
      found.pea_bars_to_max = data.pea.bars_to_max || null;
      found.pea_5bar_result = data.pea.bar5 || null;
      found.pea_10bar_result = data.pea.bar10 || null;
      found.pea_15bar_result = data.pea.bar15 || null;
    }
  }
  if (SUPABASE_URL && SUPABASE_KEY && found) {
    fetch(SUPABASE_URL + '/rest/v1/ml_predictions?id=eq.' + predictionId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ outcome: found.outcome, exit_price: found.exit_price, pnl_dollars: found.pnl_dollars, pnl_x: found.pnl_x, duration_min: found.duration_min, outcome_logged_at: found.outcome_logged_at, pea_max_favorable: found.pea_max_favorable, pea_max_adverse: found.pea_max_adverse })
    }).catch(function() {});
  }
  return found || { id: predictionId, updated: true };
}

// ============================================================================
// ANALYTICS — PineCoders-Grade
// ============================================================================
function calculateAccuracy(preds) {
  var resolved = preds.filter(function(p) { return p.outcome && p.outcome !== 'pending'; });
  if (resolved.length === 0) return { total: preds.length, resolved: 0, message: 'No resolved predictions yet.' };
  var wins = resolved.filter(function(p) { return p.outcome === 'win'; });
  var losses = resolved.filter(function(p) { return p.outcome === 'loss'; });
  var winRate = Math.round(wins.length / resolved.length * 100);

  // X-based results (PineCoders methodology)
  var xResults = resolved.filter(function(p) { return p.pnl_x != null; });
  var avgWinX = wins.filter(function(p) { return p.pnl_x != null; });
  var avgLossX = losses.filter(function(p) { return p.pnl_x != null; });
  var avgWinXVal = avgWinX.length > 0 ? +(avgWinX.reduce(function(s, p) { return s + p.pnl_x; }, 0) / avgWinX.length).toFixed(2) : 0;
  var avgLossXVal = avgLossX.length > 0 ? +(avgLossX.reduce(function(s, p) { return s + Math.abs(p.pnl_x); }, 0) / avgLossX.length).toFixed(2) : 0;

  // APPT (Average Profitability Per Trade) = statistical expectancy
  // APPT = (Win% x AvgWin) - (Loss% x AvgLoss) — expressed in X
  var winPct = wins.length / resolved.length;
  var lossPct = losses.length / resolved.length;
  var appt = +((winPct * avgWinXVal) - (lossPct * avgLossXVal)).toFixed(3);

  // By grade
  var byGrade = {};
  resolved.forEach(function(p) {
    var g = p.risk_grade || 'unknown';
    if (!byGrade[g]) byGrade[g] = { total: 0, wins: 0, totalX: 0, appt: 0 };
    byGrade[g].total++;
    if (p.outcome === 'win') byGrade[g].wins++;
    if (p.pnl_x != null) byGrade[g].totalX += p.pnl_x;
  });
  Object.keys(byGrade).forEach(function(g) {
    byGrade[g].winRate = Math.round(byGrade[g].wins / byGrade[g].total * 100);
    byGrade[g].avgX = +(byGrade[g].totalX / byGrade[g].total).toFixed(2);
  });

  // By confluence range
  var byConf = { high: { t: 0, w: 0, x: 0 }, medium: { t: 0, w: 0, x: 0 }, low: { t: 0, w: 0, x: 0 } };
  resolved.forEach(function(p) {
    var b = p.confluence_pct >= 75 ? 'high' : p.confluence_pct >= 55 ? 'medium' : 'low';
    byConf[b].t++; if (p.outcome === 'win') byConf[b].w++; if (p.pnl_x) byConf[b].x += p.pnl_x;
  });
  Object.keys(byConf).forEach(function(b) { byConf[b].winRate = byConf[b].t > 0 ? Math.round(byConf[b].w / byConf[b].t * 100) : 0; byConf[b].avgX = byConf[b].t > 0 ? +(byConf[b].x / byConf[b].t).toFixed(2) : 0; });

  return {
    total: preds.length, resolved: resolved.length, pending: preds.length - resolved.length,
    wins: wins.length, losses: losses.length,
    winRate: winRate,
    appt: appt, apptNote: appt > 0 ? 'Positive expectancy — system has edge' : appt < 0 ? 'Negative expectancy — system needs improvement' : 'Breakeven',
    avgWinX: avgWinXVal, avgLossX: avgLossXVal,
    totalPnlX: xResults.length > 0 ? +(xResults.reduce(function(s, p) { return s + p.pnl_x; }, 0)).toFixed(2) : 0,
    byGrade: byGrade, byConfluence: byConf,
    methodology: 'PineCoders — results in X (risk multiples), APPT statistical expectancy'
  };
}

function findBestSignals(preds) {
  var resolved = preds.filter(function(p) { return p.outcome && p.outcome !== 'pending'; });
  if (resolved.length < 3) return { message: 'Need 3+ resolved predictions.', count: resolved.length };
  var signals = {};
  function tr(name, present, isWin, pnlX) {
    if (!present) return;
    if (!signals[name]) signals[name] = { total: 0, wins: 0, totalX: 0 };
    signals[name].total++;
    if (isWin) signals[name].wins++;
    if (pnlX != null) signals[name].totalX += pnlX;
  }
  resolved.forEach(function(p) {
    var w = p.outcome === 'win';
    var x = p.pnl_x;
    tr('squeeze_fired', p.squeeze_fired, w, x);
    tr('squeeze_on', p.squeeze_on, w, x);
    tr('macd_bull_cross', p.macd_cross === 'bull_cross', w, x);
    tr('macd_bear_cross', p.macd_cross === 'bear_cross', w, x);
    tr('macd_divergence', p.macd_div && p.macd_div !== 'none', w, x);
    tr('adx_trending', p.adx_trending, w, x);
    tr('ftfc_aligned', p.ftfc_status === 'BULLISH' || p.ftfc_status === 'BEARISH', w, x);
    tr('sss50_active', p.sss50_state === 'ACTIVE', w, x);
    tr('sss50_complete', p.sss50_state === 'COMPLETE', w, x);
    tr('hammer_inforce', p.hammer_shooter && String(p.hammer_shooter).indexOf('IN-FORCE') >= 0, w, x);
    tr('above_vwap', p.vwap_position === 'above', w, x);
    tr('below_vwap', p.vwap_position === 'below', w, x);
    tr('gap_up', p.gap_dir === 'gap_up', w, x);
    tr('gap_down', p.gap_dir === 'gap_down', w, x);
    tr('or_breakout', p.or_status === 'breakout', w, x);
    tr('or_breakdown', p.or_status === 'breakdown', w, x);
    tr('sector_strong', p.sector_strength === 'leading', w, x);
    tr('sector_weak', p.sector_strength === 'lagging', w, x);
    // Combo signals — highest edge
    tr('squeeze_fired+ftfc', p.squeeze_fired && (p.ftfc_status === 'BULLISH' || p.ftfc_status === 'BEARISH'), w, x);
    tr('sss50_active+squeeze', p.sss50_state === 'ACTIVE' && (p.squeeze_on || p.squeeze_fired), w, x);
    tr('ftfc+above_vwap', (p.ftfc_status === 'BULLISH') && p.vwap_position === 'above', w, x);
    tr('macd_div+support', p.macd_div === 'bull_div' && p.or_status !== 'breakdown', w, x);
  });
  var ranked = Object.keys(signals).map(function(n) {
    var s = signals[n];
    return { signal: n, total: s.total, wins: s.wins, winRate: s.total >= 2 ? Math.round(s.wins / s.total * 100) : null, avgX: s.total > 0 ? +(s.totalX / s.total).toFixed(2) : 0, appt: s.total >= 2 ? +((s.wins / s.total) * (s.totalX > 0 ? s.totalX / Math.max(s.wins, 1) : 0)).toFixed(2) : null };
  }).filter(function(s) { return s.winRate !== null; }).sort(function(a, b) { return (b.avgX || 0) - (a.avgX || 0); });
  return { best: ranked.slice(0, 7), worst: ranked.slice(-5).reverse(), all: ranked, methodology: 'Ranked by avgX (PineCoders risk-multiple approach)' };
}

// Post-Exit Analysis
function postExitAnalysis(preds) {
  var withPEA = preds.filter(function(p) { return p.pea_max_favorable != null || p.pea_5bar_result != null; });
  if (withPEA.length === 0) return { message: 'No PEA data yet. Log outcomes with pea field to enable.', count: 0 };
  var avgMaxFav = withPEA.filter(function(p) { return p.pea_max_favorable; });
  var avgMaxAdv = withPEA.filter(function(p) { return p.pea_max_adverse; });
  return {
    count: withPEA.length,
    avgMaxFavorable: avgMaxFav.length > 0 ? +(avgMaxFav.reduce(function(s, p) { return s + p.pea_max_favorable; }, 0) / avgMaxFav.length).toFixed(2) : null,
    avgMaxAdverse: avgMaxAdv.length > 0 ? +(avgMaxAdv.reduce(function(s, p) { return s + p.pea_max_adverse; }, 0) / avgMaxAdv.length).toFixed(2) : null,
    insight: 'If avgMaxFavorable > 2X and avgMaxAdverse < 0.5X, exits are too early. If avgMaxFavorable < 1X, exits are well-timed.',
    methodology: 'PineCoders Post-Exit Analysis — evaluates if exit strategy is too aggressive or conservative'
  };
}

// AI synthesis
async function synthesizeLearnings(accuracy, signals, pea) {
  if (!GROQ_KEY) return { insight: 'Add GROQ_API_KEY for AI synthesis. Raw stats available.' };
  var prompt = 'You are AnkushAI ML Training system. Analyze these trading stats and provide 5 specific actionable insights. Use PineCoders methodology: express results in X (risk multiples). Focus on which signal COMBOS produce the best edge.\n\nACCURACY:\n' + JSON.stringify(accuracy) + '\n\nSIGNAL PERFORMANCE:\n' + JSON.stringify(signals) + '\n\nPOST-EXIT ANALYSIS:\n' + JSON.stringify(pea) + '\n\nProvide insights like: "Squeeze-fired + FTFC aligned averages +2.3X — increase weight" or "Grade C trades have negative APPT — raise minimum grade to B"';
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 600, temperature: 0.3, messages: [{ role: 'user', content: prompt }] }) });
    var d = await r.json();
    return { insight: d.choices && d.choices[0] ? d.choices[0].message.content : 'No insight', source: 'groq' };
  } catch (e) { return { insight: 'Error: ' + e.message }; }
}

function autoTest(thesis, preds) {
  var matching = preds.filter(function(p) {
    var match = true;
    if (thesis.signal === 'squeeze_fired' && !p.squeeze_fired) match = false;
    if (thesis.signal === 'ftfc_aligned' && p.ftfc_status !== 'BULLISH' && p.ftfc_status !== 'BEARISH') match = false;
    if (thesis.signal === 'sss50_active' && p.sss50_state !== 'ACTIVE') match = false;
    if (thesis.signal === 'squeeze_fired+ftfc' && !(p.squeeze_fired && (p.ftfc_status === 'BULLISH' || p.ftfc_status === 'BEARISH'))) match = false;
    if (thesis.direction && p.confluence_bias !== thesis.direction) match = false;
    if (thesis.minConfluence && p.confluence_pct < thesis.minConfluence) match = false;
    if (thesis.minGrade && thesis.minGrade !== p.risk_grade) match = false;
    return match;
  });
  var resolved = matching.filter(function(p) { return p.outcome && p.outcome !== 'pending'; });
  var wins = resolved.filter(function(p) { return p.outcome === 'win'; }).length;
  var avgX = resolved.length > 0 ? +(resolved.filter(function(p) { return p.pnl_x != null; }).reduce(function(s, p) { return s + p.pnl_x; }, 0) / resolved.length).toFixed(2) : null;
  return {
    thesis: thesis, matched: matching.length, resolved: resolved.length, wins: wins,
    winRate: resolved.length > 0 ? Math.round(wins / resolved.length * 100) : null,
    avgX: avgX,
    conclusion: resolved.length < 3 ? 'Insufficient data' : (avgX > 0.5 ? 'THESIS SUPPORTED +' + avgX + 'X avg' : avgX > 0 ? 'THESIS MARGINAL +' + avgX + 'X avg' : 'THESIS REJECTED ' + avgX + 'X avg')
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
    if (action === 'log_prediction' && req.method === 'POST') return res.json({ success: true, prediction: logPrediction(req.body || {}) });
    if (action === 'log_outcome' && req.method === 'POST') {
      var b = req.body || {};
      if (!b.predictionId) return res.status(400).json({ error: 'predictionId required' });
      return res.json({ success: true, prediction: logOutcome(b.predictionId, b) });
    }
    if (action === 'accuracy') { var all = (await sbGet('ml_predictions')) || predictions; return res.json(calculateAccuracy(all)); }
    if (action === 'best_signals' || action === 'worst_signals') { var all2 = (await sbGet('ml_predictions')) || predictions; return res.json(findBestSignals(all2)); }
    if (action === 'pea') { var all3 = (await sbGet('ml_predictions')) || predictions; return res.json(postExitAnalysis(all3)); }
    if (action === 'learn') {
      var all4 = (await sbGet('ml_predictions')) || predictions;
      var acc = calculateAccuracy(all4);
      var sig = findBestSignals(all4);
      var pea = postExitAnalysis(all4);
      var insights = await synthesizeLearnings(acc, sig, pea);
      return res.json({ accuracy: acc, signals: sig, pea: pea, insights: insights });
    }
    if (action === 'auto_test' && req.method === 'POST') { var all5 = (await sbGet('ml_predictions')) || predictions; return res.json(autoTest(req.body || {}, all5)); }
    if (action === 'health') return res.json({ status: 'ok', version: 'v2', predictions_in_memory: predictions.length, methodology: 'PineCoders (X-based results, APPT, PEA)', features: ['log_prediction', 'log_outcome', 'accuracy', 'best_signals', 'worst_signals', 'learn', 'auto_test', 'pea'], signals_tracked: 22, combo_signals: ['squeeze_fired+ftfc', 'sss50_active+squeeze', 'ftfc+above_vwap', 'macd_div+support'], authors: ['PineCoders (methodology)', 'vtrader321 (sector signals)'] });
    return res.status(400).json({ error: 'action required', actions: ['log_prediction', 'log_outcome', 'accuracy', 'best_signals', 'worst_signals', 'learn', 'auto_test', 'pea', 'health'] });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
