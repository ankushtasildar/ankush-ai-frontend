// ============================================================================
// ANKUSHAI CHART VISION API — AI That Truly Sees Charts
// ============================================================================
// Two modes:
//   1. ANALYZE: AI analyzes chart data + detected patterns, provides insights
//   2. COACH: AI reviews user's analysis/markings, provides teaching feedback
//
// Uses: Anthropic Claude API for intelligent analysis
//       V3 Engine pattern data for grounding (no hallucination)
//
// Endpoints:
//   POST ?action=analyze   — Analyze current chart with all pattern data
//   POST ?action=coach     — Review user's charting decisions and teach
//   GET  ?action=health    — Health check
// ============================================================================

var GROQ_KEY = process.env.GROQ_API_KEY || '';

// ============================================================================
// CHART DATA FORMATTER — Converts raw data into a visual description
// ============================================================================
function formatChartDescription(data) {
  var desc = [];
  
  // Price action summary
  if (data.price && data.symbol) {
    desc.push('CURRENT: ' + data.symbol + ' at $' + data.price.toFixed(2));
  }
  
  // Recent price action (last 20 bars summary)
  if (data.recentBars && data.recentBars.length > 0) {
    var first = data.recentBars[0];
    var last = data.recentBars[data.recentBars.length - 1];
    var high = Math.max.apply(null, data.recentBars.map(function(b) { return b.h; }));
    var low = Math.min.apply(null, data.recentBars.map(function(b) { return b.l; }));
    var priceChange = last.c - first.o;
    desc.push('RECENT ' + data.recentBars.length + ' BARS: Range $' + low.toFixed(2) + ' to $' + high.toFixed(2) + ', net move ' + (priceChange > 0 ? '+' : '') + priceChange.toFixed(2));
    
    // Describe the shape of price action
    var midIdx = Math.floor(data.recentBars.length / 2);
    var firstHalf = data.recentBars.slice(0, midIdx);
    var secondHalf = data.recentBars.slice(midIdx);
    var firstHalfAvg = firstHalf.reduce(function(s, b) { return s + b.c; }, 0) / firstHalf.length;
    var secondHalfAvg = secondHalf.reduce(function(s, b) { return s + b.c; }, 0) / secondHalf.length;
    if (secondHalfAvg > firstHalfAvg * 1.002) desc.push('SHAPE: Price trending UP in recent bars');
    else if (secondHalfAvg < firstHalfAvg * 0.998) desc.push('SHAPE: Price trending DOWN in recent bars');
    else desc.push('SHAPE: Price FLAT/CHOPPY in recent bars');
  }
  
  // Key levels visible on chart
  if (data.levels) {
    var levelsStr = [];
    if (data.levels.pivot) levelsStr.push('Pivot $' + data.levels.pivot);
    if (data.levels.r1) levelsStr.push('R1 $' + data.levels.r1);
    if (data.levels.s1) levelsStr.push('S1 $' + data.levels.s1);
    if (data.levels.nearestSupport) levelsStr.push('Support $' + data.levels.nearestSupport);
    if (data.levels.nearestResistance) levelsStr.push('Resistance $' + data.levels.nearestResistance);
    desc.push('KEY LEVELS: ' + levelsStr.join(', '));
  }
  
  // VWAP position
  if (data.vwap) {
    desc.push('VWAP: $' + data.vwap.vwap + ' (price ' + data.vwap.priceVsVwap + ')');
  }
  
  // Detected patterns
  if (data.patterns) {
    if (data.patterns.candlestick && data.patterns.candlestick.length > 0) {
      desc.push('CANDLESTICK PATTERNS: ' + data.patterns.candlestick.map(function(p) { return p.pattern + ' (' + p.direction + ')'; }).join(', '));
    }
    if (data.patterns.chart && data.patterns.chart.length > 0) {
      desc.push('CHART PATTERNS: ' + data.patterns.chart.map(function(p) { return p.pattern + ' — ' + p.signal; }).join(', '));
    }
  }
  
  // Indicators
  if (data.indicators) {
    var indStr = [];
    if (data.indicators.macd_1m) indStr.push('MACD 1m: hist ' + data.indicators.macd_1m.hist + (data.indicators.macd_1m.cross !== 'none' ? ' ' + data.indicators.macd_1m.cross : ''));
    if (data.indicators.adx_1m) indStr.push('ADX 1m: ' + data.indicators.adx_1m.adx + ' (' + data.indicators.adx_1m.dir + ')');
    if (data.indicators.squeeze_1m) indStr.push('Squeeze 1m: ' + (data.indicators.squeeze_1m.fired ? 'FIRED ' + data.indicators.squeeze_1m.dir : data.indicators.squeeze_1m.on ? 'ON (building)' : 'off'));
    desc.push('INDICATORS: ' + indStr.join(' | '));
  }
  
  // Strat analysis
  if (data.strat) {
    var stratStr = [];
    if (data.strat.sss50) stratStr.push('SSS50: ' + data.strat.sss50.state);
    if (data.strat.ftfc) stratStr.push('FTFC: ' + data.strat.ftfc.ftfc);
    if (data.strat.combo) stratStr.push('Combo: ' + data.strat.combo.combo);
    desc.push('STRAT: ' + stratStr.join(' | '));
  }
  
  // Confluence
  if (data.confluence) {
    desc.push('CONFLUENCE: ' + data.confluence.confluencePct + '% ' + data.confluence.bias + ' (' + data.confluence.strength + ')');
    if (data.confluence.reasons && data.confluence.reasons.length > 0) {
      desc.push('REASONS: ' + data.confluence.reasons.slice(0, 8).join(', '));
    }
  }
  
  return desc.join('\n');
}

// ============================================================================
// AI ANALYSIS — Using Groq (free) for chart analysis
// ============================================================================
async function analyzeChart(chartDesc, question) {
  if (!GROQ_KEY) return { insight: 'GROQ_API_KEY required for chart vision analysis.', source: 'none' };
  
  var systemPrompt = 'You are AnkushAI Chart Vision — an expert technical analyst who can see and interpret charts. You have been given a detailed description of what is currently visible on the chart including price action, key levels, detected patterns, indicators, and confluence scoring. Your job is to provide actionable trading insights as if you are looking at the actual chart. Be specific about price levels, patterns you see, and what they mean for the next 15-60 minutes of price action. Never hallucinate levels — only reference the numbers provided to you. If asked about patterns, explain what you see and why it matters.';
  
  var userPrompt = 'Here is what I see on the chart right now:\n\n' + chartDesc;
  if (question) userPrompt += '\n\nUser question: ' + question;
  else userPrompt += '\n\nProvide a concise analysis: What is the chart telling us? What is the most likely next move? What should a trader watch for in the next 15-60 minutes?';
  
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    var d = await r.json();
    return { insight: d.choices && d.choices[0] ? d.choices[0].message.content : 'No analysis available', source: 'groq_vision' };
  } catch (e) { return { insight: 'Analysis error: ' + e.message, source: 'error' }; }
}

async function coachUserAnalysis(chartDesc, userAnalysis) {
  if (!GROQ_KEY) return { feedback: 'GROQ_API_KEY required for coaching.', source: 'none' };
  
  var systemPrompt = 'You are AnkushAI Chart Coach — a patient, expert trading teacher. A student has drawn their analysis on a chart and is asking you to review it. You have been given the actual chart data (what is objectively on the chart) AND the student\'s analysis (what they think they see). Your job is to: 1) Acknowledge what they got RIGHT, 2) Point out what they got WRONG with specific reasoning, 3) Teach them the correct interpretation, 4) Suggest what they should practice. Be encouraging but honest. Use specific price levels from the chart data.';
  
  var userPrompt = 'ACTUAL CHART DATA:\n' + chartDesc + '\n\nSTUDENT\'S ANALYSIS:\n' + userAnalysis + '\n\nPlease review their work and provide constructive coaching feedback.';
  
  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    var d = await r.json();
    return { feedback: d.choices && d.choices[0] ? d.choices[0].message.content : 'No feedback available', source: 'groq_coach' };
  } catch (e) { return { feedback: 'Coaching error: ' + e.message, source: 'error' }; }
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
    if (action === 'analyze' && req.method === 'POST') {
      var body = req.body || {};
      // First, fetch fresh V3 data for the symbol
      var sym = body.symbol || 'QQQ';
      var v3Url = (req.headers.host ? 'https://' + req.headers.host : 'https://www.ankushai.org') + '/api/day-trade-engine?action=predict&symbol=' + sym;
      
      var v3Data = null;
      try {
        var v3r = await fetch(v3Url);
        if (v3r.ok) v3Data = await v3r.json();
      } catch (e) { /* fallback to provided data */ }
      
      var chartData = v3Data || body.chartData || {};
      
      // Get recent bars for shape analysis
      if (v3Data && v3Data.price) {
        chartData.recentBars = body.recentBars || null;
        chartData.symbol = sym;
      }
      
      var chartDesc = formatChartDescription(chartData);
      var analysis = await analyzeChart(chartDesc, body.question || null);
      
      return res.json({
        symbol: sym,
        chartDescription: chartDesc,
        analysis: analysis.insight,
        source: analysis.source,
        patterns: chartData.patterns || null,
        confluence: chartData.confluence || null,
        timestamp: new Date().toISOString()
      });
    }
    
    if (action === 'coach' && req.method === 'POST') {
      var body2 = req.body || {};
      if (!body2.userAnalysis) return res.status(400).json({ error: 'userAnalysis required — describe what you drew/see on the chart' });
      
      var sym2 = body2.symbol || 'QQQ';
      var v3Url2 = (req.headers.host ? 'https://' + req.headers.host : 'https://www.ankushai.org') + '/api/day-trade-engine?action=predict&symbol=' + sym2;
      
      var v3Data2 = null;
      try {
        var v3r2 = await fetch(v3Url2);
        if (v3r2.ok) v3Data2 = await v3r2.json();
      } catch (e) { /* use provided data */ }
      
      var chartDesc2 = formatChartDescription(v3Data2 || body2.chartData || {});
      var coaching = await coachUserAnalysis(chartDesc2, body2.userAnalysis);
      
      return res.json({
        symbol: sym2,
        feedback: coaching.feedback,
        source: coaching.source,
        actualData: { patterns: (v3Data2 || {}).patterns, confluence: (v3Data2 || {}).confluence },
        timestamp: new Date().toISOString()
      });
    }
    
    if (action === 'health') {
      return res.json({
        status: 'ok', version: 'v1',
        modes: ['analyze', 'coach'],
        analyzeDesc: 'AI analyzes chart patterns + indicators, provides trading insights grounded in real data',
        coachDesc: 'AI reviews user-drawn analysis, teaches correct interpretation, suggests improvements',
        dataSource: 'V3 Engine real-time data (Polygon + Yahoo + computed indicators)',
        llm: 'Groq llama-3.3-70b-versatile',
        note: 'AI sees chart through computed data — same math that renders the chart'
      });
    }
    
    return res.status(400).json({ error: 'action required: analyze, coach, health' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
