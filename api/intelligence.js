const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization' };

// ── Price fetch for outcome resolution ──────────────────────────────────────
async function getCurrentPrice(symbol) {
  const polyKey = process.env.POLYGON_API_KEY;
  if (polyKey) {
    try {
      const r = await fetch(`https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${polyKey}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) { const d = await r.json(); if (d.results?.p) return d.results.p; }
    } catch (e) {}
    // Try previous close
    try {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const r = await fetch(`https://api.polygon.io/v1/open-close/${symbol}/${yesterday.toISOString().split('T')[0]}?adjusted=true&apiKey=${polyKey}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) { const d = await r.json(); if (d.close) return d.close; }
    } catch (e) {}
  }
  return null;
}

// ── Macro context during a hold period ──────────────────────────────────────
async function getMacroEventsDuring(startDate, endDate) {
  const { data } = await supabase
    .from('macro_events')
    .select('event_type, title, event_date, impact_level')
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .order('event_date');
  return data || [];
}

// ── Market-moving events during hold ────────────────────────────────────────
async function getMarketEventsDuring(startDate, endDate) {
  const { data } = await supabase
    .from('market_moving_events')
    .select('event_type, headline, occurred_at, impact_magnitude, sentiment')
    .gte('occurred_at', startDate)
    .lte('occurred_at', endDate)
    .order('occurred_at');
  return data || [];
}

// ── Days to next FOMC from a date ───────────────────────────────────────────
async function getDaysToNextFOMC(fromDate) {
  const { data } = await supabase
    .from('macro_events')
    .select('event_date')
    .eq('event_type', 'fomc')
    .gte('event_date', fromDate)
    .order('event_date')
    .limit(1);
  if (!data?.length) return 999;
  const next = new Date(data[0].event_date);
  const from = new Date(fromDate);
  return Math.ceil((next - from) / (1000 * 60 * 60 * 24));
}

// ── Record a new scan + its setups ──────────────────────────────────────────
async function recordScan(scanData) {
  const { setups, tier, spyPrice, vixLevel, marketRegime, dataSource, symbolsScanned, symbolsQualified, symbolsFiltered, userId } = scanData;
  
  // Insert scan record
  const { data: scan, error: scanErr } = await supabase
    .from('scan_records')
    .insert({
      symbols_scanned: symbolsScanned || [],
      symbols_qualified: symbolsQualified || 0,
      symbols_filtered: symbolsFiltered || 0,
      setups_generated: setups?.length || 0,
      spy_price: spyPrice,
      vix_level: vixLevel,
      market_regime: marketRegime,
      data_source: dataSource,
      data_quality: dataSource === 'polygon' ? 'eod' : dataSource === 'live' ? 'live' : 'failed',
      user_id: userId,
      tier
    })
    .select('id')
    .single();
  
  if (scanErr || !scan) { console.error('Scan record error:', scanErr?.message); return null; }
  
  // Insert each setup
  if (setups?.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const daysToFomc = await getDaysToNextFOMC(today);
    
    const setupRecords = setups.map(s => {
      // Parse entry range "$858.00–$865.00" or "$858.00-$865.00"
      const entryStr = s.entry || s.entry_zone || '';
      const entryParts = entryStr.replace(/[$]/g, '').split(/[–\-—]/);
      const entryLow = parseFloat(entryParts[0]?.trim()) || null;
      const entryHigh = parseFloat(entryParts[1]?.trim()) || entryLow;
      
      // Parse target — take first number
      const target1 = parseFloat((s.target || '').replace(/[^0-9.]/g, '').split(' ')[0]) || null;
      
      // Parse stop
      const stopLoss = parseFloat((s.stop || s.stop_loss || '').replace(/[^0-9.]/g, '')) || null;
      
      return {
        symbol: s.symbol,
        name: s.name,
        setup_type: s.setupType || s.setup_type || 'Unknown',
        bias: s.bias || 'neutral',
        confidence: Math.min(10, Math.max(1, s.confidence || 5)),
        price_at_generation: s.currentPrice || s.price_at_generation || 0,
        entry_low: entryLow,
        entry_high: entryHigh,
        target_1: target1,
        stop_loss: stopLoss,
        rr_ratio: parseFloat((s.rrRatio || s.rr_ratio || '0').toString().replace(':1','')) || null,
        options_trade: s.optionsTrade || s.options_trade,
        options_iv_rank: s.ivRank || s.iv_rank,
        options_cost_per_contract: parseFloat((s.optionCost || '').replace(/[^0-9.]/g, '')) || null,
        options_delta: s.deltaAtEntry || s.delta,
        options_theta_per_day: parseFloat((s.thetaPerDay || '').toString().replace(/[^0-9.\-]/g, '')) || null,
        time_horizon: s.timeHorizon || s.time_horizon,
        urgency: s.urgency,
        spy_price: spyPrice,
        vix_at_generation: vixLevel,
        vix_regime: vixLevel < 15 ? 'very_low' : vixLevel < 20 ? 'low' : vixLevel < 30 ? 'elevated' : 'high',
        days_to_next_fomc: daysToFomc,
        fomc_this_week: daysToFomc <= 5,
        frameworks: s.frameworks || [],
        analyst_agreement: s.analystAgreement || s.analyst_agreement,
        news_headlines_json: s.news ? JSON.stringify(s.news) : null,
        sector: s.sector,
        scan_id: scan.id,
        status: 'open'
      };
    });
    
    const { error: setupErr } = await supabase.from('setup_records').insert(setupRecords);
    if (setupErr) console.error('Setup insert error:', setupErr.message);
    else console.log(`Recorded ${setupRecords.length} setups for scan ${scan.id}`);
  }
  
  return scan.id;
}

// ── Resolve open setup outcomes (called by cron daily) ──────────────────────
async function resolveOutcomes() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14); // Resolve setups older than 14 days

  // Get all open setups
  const { data: openSetups } = await supabase
    .from('setup_records')
    .select('*')
    .eq('status', 'open')
    .lt('created_at', new Date().toISOString())
    .order('created_at');

  if (!openSetups?.length) return { resolved: 0, message: 'No open setups' };

  let resolved = 0;
  const results = [];

  for (const setup of openSetups) {
    const currentPrice = await getCurrentPrice(setup.symbol);
    if (!currentPrice) continue;

    const entryPrice = setup.entry_high || setup.price_at_generation;
    const ageHours = (Date.now() - new Date(setup.created_at).getTime()) / 3600000;
    const ageDays = Math.floor(ageHours / 24);

    // Check outcomes
    const hitTarget = setup.target_1 && (
      (setup.bias === 'bullish' && currentPrice >= setup.target_1) ||
      (setup.bias === 'bearish' && currentPrice <= setup.target_1)
    );
    const hitStop = setup.stop_loss && (
      (setup.bias === 'bullish' && currentPrice <= setup.stop_loss) ||
      (setup.bias === 'bearish' && currentPrice >= setup.stop_loss)
    );
    const expired = ageDays >= 14;

    if (!hitTarget && !hitStop && !expired) continue;

    // Get macro events during hold
    const macroEvents = await getMacroEventsDuring(
      setup.created_at.split('T')[0],
      new Date().toISOString().split('T')[0]
    );
    const marketEvents = await getMarketEventsDuring(setup.created_at, new Date().toISOString());

    // Calculate return
    const returnPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice * 100) * (setup.bias === 'bearish' ? -1 : 1) : 0;

    const outcome = hitTarget ? 'target_hit' : hitStop ? 'stop_hit' : returnPct > 0 ? 'expired_profit' : 'expired_loss';

    // Estimate options return from delta/theta
    let optionsReturnPct = null;
    if (setup.options_delta && setup.options_cost_per_contract && setup.options_cost_per_contract > 0) {
      const underlyingMove = currentPrice - entryPrice;
      const estimatedOptionMove = underlyingMove * setup.options_delta * 100; // per contract
      const thetaLoss = (setup.options_theta_per_day || 0) * ageDays;
      const totalOptionMove = estimatedOptionMove + thetaLoss;
      optionsReturnPct = (totalOptionMove / setup.options_cost_per_contract) * 100;
    }

    // Insert outcome
    const { error: outErr } = await supabase.from('setup_outcomes').insert({
      setup_id: setup.id,
      outcome,
      hit_target_1: hitTarget || false,
      hit_stop: hitStop || false,
      price_at_exit: currentPrice,
      exit_date: new Date().toISOString().split('T')[0],
      underlying_return_pct: parseFloat(returnPct.toFixed(4)),
      hold_days_actual: ageDays,
      estimated_options_return_pct: optionsReturnPct ? parseFloat(optionsReturnPct.toFixed(2)) : null,
      fomc_occurred: macroEvents.some(e => e.event_type === 'fomc'),
      earnings_occurred: macroEvents.some(e => e.event_type === 'earnings_season'),
      major_news_occurred: marketEvents.length > 0,
      news_during_json: marketEvents.length > 0 ? JSON.stringify(marketEvents.slice(0, 5)) : null,
      trump_tweet_impact: marketEvents.some(e => e.event_type === 'trump_tweet'),
      data_quality_score: currentPrice ? 8 : 3
    });

    if (!outErr) {
      // Update setup status
      await supabase.from('setup_records').update({
        status: outcome === 'target_hit' ? 'target_hit' : outcome === 'stop_hit' ? 'stop_hit' : 'expired',
        outcome_locked_at: new Date().toISOString()
      }).eq('id', setup.id);

      resolved++;
      results.push({ symbol: setup.symbol, outcome, return: returnPct.toFixed(2) + '%' });
    }
  }

  return { resolved, results };
}

// ── Weekly pattern analysis ──────────────────────────────────────────────────
async function runPatternAnalysis() {
  // Get all resolved setups with outcomes from last 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { data: resolvedSetups } = await supabase
    .from('setup_records')
    .select(`
      *,
      setup_outcomes (
        outcome, underlying_return_pct, hold_days_actual, max_favorable_pct, max_adverse_pct,
        fomc_occurred, earnings_occurred, trump_tweet_impact, vix_change_during
      )
    `)
    .neq('status', 'open')
    .gte('created_at', cutoff.toISOString())
    .limit(500);

  if (!resolvedSetups?.length) return { patterns_updated: 0, message: 'Insufficient data' };

  // Build analytics by framework
  const frameworkStats = {};
  const vixRegimeStats = {};
  const confidenceCalibration = {};

  for (const setup of resolvedSetups) {
    const outcome = setup.setup_outcomes?.[0];
    if (!outcome) continue;

    const isWin = outcome.outcome === 'target_hit' || (outcome.outcome === 'expired_profit' && outcome.underlying_return_pct > 0);
    const returnPct = outcome.underlying_return_pct || 0;
    const conf = setup.confidence;

    // Per-framework stats
    for (const fw of (setup.frameworks || [])) {
      if (!frameworkStats[fw]) frameworkStats[fw] = { wins: 0, losses: 0, returns: [], holdDays: [] };
      isWin ? frameworkStats[fw].wins++ : frameworkStats[fw].losses++;
      frameworkStats[fw].returns.push(returnPct);
      frameworkStats[fw].holdDays.push(outcome.hold_days_actual || 0);
    }

    // VIX regime stats
    const regime = setup.vix_regime || 'unknown';
    if (!vixRegimeStats[regime]) vixRegimeStats[regime] = { wins: 0, losses: 0, returns: [] };
    isWin ? vixRegimeStats[regime].wins++ : vixRegimeStats[regime].losses++;
    vixRegimeStats[regime].returns.push(returnPct);

    // Confidence calibration
    if (!confidenceCalibration[conf]) confidenceCalibration[conf] = { wins: 0, total: 0 };
    if (isWin) confidenceCalibration[conf].wins++;
    confidenceCalibration[conf].total++;
  }

  // Build summary for AI analysis
  const frameworkSummary = Object.entries(frameworkStats).map(([fw, s]) => {
    const total = s.wins + s.losses;
    const winRate = total > 0 ? (s.wins / total * 100).toFixed(1) : 'N/A';
    const avgReturn = s.returns.length > 0 ? (s.returns.reduce((a,b)=>a+b,0)/s.returns.length).toFixed(2) : 'N/A';
    return `${fw}: ${winRate}% win rate, avg return ${avgReturn}%, ${total} setups`;
  }).join('\n');

  const regimeSummary = Object.entries(vixRegimeStats).map(([regime, s]) => {
    const total = s.wins + s.losses;
    const winRate = total > 0 ? (s.wins / total * 100).toFixed(1) : 'N/A';
    return `VIX ${regime}: ${winRate}% win rate, ${total} setups`;
  }).join('\n');

  const calibrationSummary = Object.entries(confidenceCalibration).map(([conf, s]) => {
    const actual = (s.wins / s.total * 100).toFixed(1);
    return `Confidence ${conf}/10: claimed ${conf*10}%, actual ${actual}% (${s.total} setups)`;
  }).join('\n');

  // Ask Claude to analyze patterns and generate insights
  const analysisPrompt = `Analyze AnkushAI trading performance data from the last 90 days and extract actionable insights.

FRAMEWORK PERFORMANCE:
${frameworkSummary}

VIX REGIME PERFORMANCE:
${regimeSummary}

CONFIDENCE CALIBRATION (claimed vs actual win rate):
${calibrationSummary}

Total setups analyzed: ${resolvedSetups.length}

Generate a concise intelligence report with:
1. Which frameworks are performing above/below expectations
2. Confidence calibration issues (is AI overconfident or underconfident?)
3. VIX regime strategy adjustments needed
4. 3 specific prompt adjustments to improve future accuracy
5. Win rate and avg return statistics

Output as JSON:
{
  "key_learnings": {
    "top_frameworks": [],
    "underperforming_frameworks": [],
    "confidence_bias": "overconfident/underconfident/calibrated",
    "regime_insights": "",
    "prompt_adjustments": []
  },
  "overall_win_rate": 0.0,
  "overall_avg_return": 0.0,
  "report_summary": ""
}`;

  let reportData = {};
  try {
    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: analysisPrompt }]
    });
    const raw = result.content[0].text.replace(/```json|```/g, '').trim();
    reportData = JSON.parse(raw);
  } catch (e) {
    console.error('Pattern analysis AI error:', e.message);
    reportData = { key_learnings: {}, overall_win_rate: 0, report_summary: 'Analysis failed: ' + e.message };
  }

  // Update pattern win rates in ai_learned_patterns
  let patternsUpdated = 0;
  for (const [fw, stats] of Object.entries(frameworkStats)) {
    const total = stats.wins + stats.losses;
    if (total < 3) continue; // Need minimum sample

    const winRate = (stats.wins / total * 100);
    const avgReturn = stats.returns.reduce((a,b)=>a+b,0) / stats.returns.length;
    const avgWin = stats.returns.filter(r=>r>0).reduce((a,b)=>a+b,0) / (stats.returns.filter(r=>r>0).length || 1);
    const avgLoss = stats.returns.filter(r=>r<0).reduce((a,b)=>a+b,0) / (stats.returns.filter(r=>r<0).length || 1);

    const { error } = await supabase
      .from('ai_learned_patterns')
      .update({
        sample_size: total,
        win_count: stats.wins,
        loss_count: stats.losses,
        win_rate: parseFloat(winRate.toFixed(2)),
        avg_return_pct: parseFloat(avgReturn.toFixed(4)),
        avg_win_pct: parseFloat(avgWin.toFixed(4)),
        avg_loss_pct: parseFloat(avgLoss.toFixed(4)),
        avg_hold_days: parseFloat((stats.holdDays.reduce((a,b)=>a+b,0)/stats.holdDays.length).toFixed(1)),
        is_validated: total >= 10,
        updated_at: new Date().toISOString()
      })
      .ilike('pattern_name', `%${fw}%`);

    if (!error) patternsUpdated++;
  }

  // Save the intelligence report
  const weekStr = `week_${new Date().toISOString().split('T')[0].replace(/-/g,'_')}`;
  await supabase.from('intelligence_reports').insert({
    report_period: weekStr,
    report_type: 'weekly',
    total_setups_evaluated: resolvedSetups.length,
    win_rate_this_period: reportData.overall_win_rate,
    avg_return_this_period: reportData.overall_avg_return,
    key_learnings_json: reportData.key_learnings,
    confidence_calibration_json: confidenceCalibration,
    full_report_text: reportData.report_summary,
    patterns_updated: patternsUpdated
  });

  return { patterns_updated: patternsUpdated, setups_analyzed: resolvedSetups.length, report: reportData };
}

// ── Get learned patterns for prompt injection ────────────────────────────────
async function getLearnedPatterns(marketContext) {
  const { vixLevel, spyTrend, daysToFomc } = marketContext;

  // Get active validated patterns, ordered by relevance
  const { data: patterns } = await supabase
    .from('ai_learned_patterns')
    .select('pattern_name, win_rate, avg_return_pct, works_best_when, fails_when, recommended_iv_strategy, sample_size, is_validated, prompt_weight, conditions_json')
    .eq('active', true)
    .order('prompt_weight', { ascending: false })
    .limit(15);

  if (!patterns?.length) return '';

  // Score and rank patterns by current market conditions
  const scored = patterns.map(p => {
    let relevanceScore = p.prompt_weight || 1.0;
    const conds = p.conditions_json || {};

    // Boost if VIX matches
    if (conds.vix_range && vixLevel) {
      const [vMin, vMax] = conds.vix_range;
      if (vixLevel >= vMin && vixLevel <= vMax) relevanceScore += 0.5;
    }
    // Boost if EMA trend matches
    if (conds.ema_alignment && spyTrend === conds.ema_alignment) relevanceScore += 0.4;
    // Boost FOMC filter if FOMC nearby
    if (p.pattern_type === 'risk_filter' && daysToFomc <= 3) relevanceScore += 1.0;

    return { ...p, relevanceScore };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 8);

  // Build pattern injection text
  const patternText = scored.map(p => {
    const wr = p.win_rate ? `${p.win_rate}% win rate` : 'unvalidated';
    const ret = p.avg_return_pct ? `, ${p.avg_return_pct > 0 ? '+' : ''}${(p.avg_return_pct * 100).toFixed(1)}% avg return` : '';
    const n = p.sample_size > 0 ? ` (n=${p.sample_size})` : '';
    const validated = p.is_validated ? ' ✓' : ' (unvalidated)';
    return `• ${p.pattern_name}: ${wr}${ret}${n}${validated}
  Best when: ${p.works_best_when || 'unknown'}
  Avoid when: ${p.fails_when || 'unknown'}
  IV strategy: ${p.recommended_iv_strategy || 'buy_calls'}`;
  }).join('\n\n');

  return `## ANKUSHAI LEARNED INTELLIGENCE (from live trading history)
${patternText}

Apply these validated patterns to adjust confidence scores and IV strategies. FOMC within ${daysToFomc} days — use risk filters accordingly.`;
}

// ── Log a market-moving event ────────────────────────────────────────────────
async function logMarketEvent(eventData) {
  const { error } = await supabase.from('market_moving_events').insert({
    occurred_at: eventData.occurred_at || new Date().toISOString(),
    event_type: eventData.event_type,
    source: eventData.source,
    headline: eventData.headline,
    full_text: eventData.full_text,
    url: eventData.url,
    impact_magnitude: eventData.impact_magnitude || 'moderate',
    sentiment: eventData.sentiment || 'mixed',
    impact_summary: eventData.impact_summary,
    affected_tickers: eventData.affected_tickers || [],
    affected_sectors: eventData.affected_sectors || [],
    tags: eventData.tags || []
  });
  if (error) console.error('Event log error:', error.message);
  return !error;
}

// ── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k,v));

  const { action } = req.query;

  // Record a scan + its setups
  if (req.method === 'POST' && action === 'record_scan') {
    try {
      const scanId = await recordScan(req.body);
      return res.json({ success: true, scan_id: scanId });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Resolve outcomes (called by cron or admin)
  if (req.method === 'GET' && action === 'resolve_outcomes') {
    try {
      const result = await resolveOutcomes();
      return res.json({ success: true, ...result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Run weekly pattern analysis
  if (req.method === 'GET' && action === 'pattern_analysis') {
    try {
      const result = await runPatternAnalysis();
      return res.json({ success: true, ...result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Get current learned patterns for injection
  if (req.method === 'GET' && action === 'patterns') {
    try {
      const vixLevel = parseFloat(req.query.vix) || 18;
      const spyTrend = req.query.trend || 'mixed';
      const daysToFomc = parseInt(req.query.fomc) || 30;
      const patterns = await getLearnedPatterns({ vixLevel, spyTrend, daysToFomc });
      return res.json({ success: true, patterns });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Log a market event
  if (req.method === 'POST' && action === 'log_event') {
    try {
      const success = await logMarketEvent(req.body);
      return res.json({ success });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Dashboard stats
  if (req.method === 'GET' && action === 'stats') {
    try {
      const [setupsRes, outcomesRes, patternsRes, reportsRes, eventsRes] = await Promise.all([
        supabase.from('setup_records').select('id, status, bias, confidence, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
        supabase.from('setup_outcomes').select('outcome, underlying_return_pct, hold_days_actual').order('recorded_at', { ascending: false }).limit(200),
        supabase.from('ai_learned_patterns').select('pattern_name, win_rate, sample_size, is_validated').eq('active', true).order('win_rate', { ascending: false }),
        supabase.from('intelligence_reports').select('*').order('generated_at', { ascending: false }).limit(5),
        supabase.from('macro_events').select('event_date, event_type, title').gte('event_date', new Date().toISOString().split('T')[0]).order('event_date').limit(10)
      ]);

      const setups = setupsRes.data || [];
      const outcomes = outcomesRes.data || [];
      const resolvedOutcomes = outcomes.filter(o => o.outcome !== 'still_open');
      const winRate = resolvedOutcomes.length > 0
        ? (resolvedOutcomes.filter(o => o.outcome === 'target_hit').length / resolvedOutcomes.length * 100).toFixed(1)
        : null;
      const avgReturn = resolvedOutcomes.length > 0
        ? (resolvedOutcomes.reduce((s, o) => s + (o.underlying_return_pct || 0), 0) / resolvedOutcomes.length * 100).toFixed(2)
        : null;

      return res.json({
        overview: {
          total_setups: setupsRes.count || setups.length,
          open_setups: setups.filter(s => s.status === 'open').length,
          resolved_setups: resolvedOutcomes.length,
          win_rate_pct: winRate,
          avg_return_pct: avgReturn,
          bullish_setups: setups.filter(s => s.bias === 'bullish').length,
          bearish_setups: setups.filter(s => s.bias === 'bearish').length
        },
        patterns: patternsRes.data || [],
        recent_reports: reportsRes.data || [],
        upcoming_events: eventsRes.data || [],
        recent_outcomes: resolvedOutcomes.slice(0, 20)
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use: record_scan, resolve_outcomes, pattern_analysis, patterns, log_event, stats' });
};

module.exports.recordScan = recordScan;
module.exports.getLearnedPatterns = getLearnedPatterns;
module.exports.getDaysToNextFOMC = getDaysToNextFOMC;
