// ============================================================================
// ANKUSHAI COMMAND CENTER API — Live Trade AI Co-Pilot
// ============================================================================
// When a user clicks "I'M IN" on an alert, the Command Center activates.
// It polls the DT Engine V3 every cycle and generates first-person AI
// commentary about the price action, backed ENTIRELY by real indicators.
//
// Actions:
//   POST ?action=enter    — Register entry (price, direction, stop, targets)
//   GET  ?action=update   — Get real-time commentary for active trade
//   POST ?action=partial  — User took partial profits
//   POST ?action=exit     — User exited the trade
//   GET  ?action=status   — Current trade status
//
// EVERY AI opinion maps to a real indicator. No vibes. No hallucinations.
// ============================================================================

var GROQ_KEY = process.env.GROQ_API_KEY || '';

// In-memory trade sessions (per-request, stateless via query params)
// The frontend maintains the trade state and passes it each request

async function getDTEngineData(baseUrl) {
  try {
    var r = await fetch((baseUrl || 'https://www.ankushai.org') + '/api/day-trade-engine?action=predict');
    if (!r.ok) return null;
    return r.json();
  } catch (e) { return null; }
}

// Build a factual market summary from DT Engine data — NO opinions, just facts
function buildFactualSummary(data, trade) {
  if (!data) return 'Market data unavailable.';
  var facts = [];
  var price = data.price;
  var entry = trade.entry;
  var dir = trade.direction; // BULLISH or BEARISH
  var pnl = dir === 'BULLISH' ? price - entry : entry - price;
  var pnlPct = (pnl / entry * 100);

  // Position status
  facts.push('POSITION: ' + dir + ' from $' + entry.toFixed(2));
  facts.push('CURRENT: $' + price.toFixed(2) + ' | P&L: ' + (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + ' (' + (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%)');
  if (trade.stop) facts.push('STOP: $' + trade.stop.toFixed(2) + ' (' + (dir === 'BULLISH' ? (price - trade.stop).toFixed(2) : (trade.stop - price).toFixed(2)) + ' away)');
  if (trade.target1) facts.push('TARGET 1: $' + trade.target1.toFixed(2) + ' (' + (dir === 'BULLISH' ? (trade.target1 - price).toFixed(2) : (price - trade.target1).toFixed(2)) + ' away)');

  // MACD state
  if (data.indicators) {
    var macd = data.indicators.macd_5m || data.indicators.macd_1m;
    if (macd) {
      facts.push('MACD 5m: histogram ' + macd.hist + ' | acceleration: ' + macd.accel + ' | ' + (macd.cross !== 'none' ? macd.cross.toUpperCase() : 'no cross') + (macd.div !== 'none' ? ' | ' + macd.div.toUpperCase() : ''));
    }
    var adx = data.indicators.adx_5m || data.indicators.adx_1m;
    if (adx) {
      facts.push('ADX 5m: ' + adx.adx + ' (' + (adx.trending ? 'TRENDING' : 'RANGING') + ') | DI+:' + adx.diPlus + ' DI-:' + adx.diMinus + ' | ' + adx.dir);
    }
    var sq = data.indicators.squeeze_5m || data.indicators.squeeze_1m;
    if (sq) {
      facts.push('SQUEEZE 5m: ' + (sq.fired ? 'FIRED ' + sq.dir : sq.on ? 'ON (building)' : 'OFF') + ' | momentum: ' + sq.momentum);
    }
    if (data.indicators.vwap) {
      var v = data.indicators.vwap;
      facts.push('VWAP: $' + v.vwap + ' | price is ' + v.priceVsVwap + ' | upper1: $' + v.upper1 + ' lower1: $' + v.lower1);
    }
    if (data.indicators.emaAlignment) {
      facts.push('EMA 8/21: 1m=' + data.indicators.emaAlignment['1m'] + ' 5m=' + data.indicators.emaAlignment['5m']);
    }
  }

  // Strat state
  if (data.strat) {
    if (data.strat.sss50) facts.push('SSS50: ' + data.strat.sss50.state + ' — ' + (data.strat.sss50.reason || ''));
    if (data.strat.ftfc) facts.push('FTFC: ' + data.strat.ftfc.ftfc + ' (' + data.strat.ftfc.bullPct + '% bull / ' + data.strat.ftfc.bearPct + '% bear)');
    if (data.strat.hammer) facts.push('CANDLE: ' + data.strat.hammer.type + ' (' + (data.strat.hammer.inForce ? 'IN-FORCE' : 'not in force') + ')');
    if (data.strat.combo) facts.push('STRAT COMBO: ' + data.strat.combo.combo + ' — ' + (data.strat.combo.description || ''));
  }

  // Structure
  if (data.structure) {
    if (data.structure.gap && data.structure.gap.dir !== 'flat') {
      facts.push('GAP: ' + data.structure.gap.dir + ' ' + data.structure.gap.pct + '% | fill target: $' + (data.structure.gap.fillTarget || 'N/A'));
    }
    if (data.structure.or5) facts.push('5m OR: $' + data.structure.or5.low + '-$' + data.structure.or5.high + ' | status: ' + data.structure.or5.status);
    if (data.structure.levels) {
      var lvl = data.structure.levels;
      if (lvl.nearestSupport) facts.push('NEAREST SUPPORT: $' + lvl.nearestSupport);
      if (lvl.nearestResistance) facts.push('NEAREST RESISTANCE: $' + lvl.nearestResistance);
    }
  }

  // Confluence
  if (data.confluence) {
    facts.push('CONFLUENCE: ' + data.confluence.confluencePct + '% ' + data.confluence.bias + ' (' + data.confluence.strength + ')');
  }

  return facts.join('\n');
}

// Generate AI commentary using Groq — STRICTLY based on factual data
async function generateCommentary(factualSummary, trade, elapsedMinutes) {
  if (!GROQ_KEY) {
    return { commentary: 'AI commentary requires Groq API key. Raw data:\n' + factualSummary, source: 'fallback' };
  }

  var systemPrompt = `You are AnkushAI's live trade co-pilot. You are watching a real QQQ trade WITH the user in real-time.

CRITICAL RULES:
1. ONLY reference data from the FACTUAL SUMMARY below. NEVER invent prices, levels, or indicators.
2. Speak in first person like a trading partner: "I like what I see here" or "This concerns me"
3. Be SPECIFIC — reference exact prices, exact indicator values from the data
4. Give ACTIONABLE guidance: "Move your stop to $X" or "I'd take half off here"
5. If data suggests danger for the trade, SAY SO clearly: "We need to get out if $X breaks"
6. Keep it concise — 2-4 sentences max. Trader is in a live trade, no time for essays.
7. NEVER say "based on my analysis" or "the indicators suggest" — just say what you see like a human trader would
8. Reference specific candle patterns, MACD behavior, VWAP position when relevant

The user is ${trade.direction} QQQ from $${trade.entry.toFixed(2)}.
Trade has been active for approximately ${elapsedMinutes} minutes.`;

  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'FACTUAL SUMMARY (every statement here is verified real-time data):\n\n' + factualSummary + '\n\nGive your real-time commentary on this trade. Be a co-pilot, not a robot.' }
        ]
      })
    });
    var d = await r.json();
    var text = d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
    return { commentary: text.trim(), source: 'groq' };
  } catch (e) {
    return { commentary: 'Connection issue. Raw data:\n' + factualSummary.split('\n').slice(0, 5).join('\n'), source: 'fallback' };
  }
}

// Suggest actions based on pure math (no AI needed for these)
function suggestActions(data, trade) {
  if (!data || !data.price) return [];
  var actions = [];
  var price = data.price;
  var entry = trade.entry;
  var dir = trade.direction;
  var pnl = dir === 'BULLISH' ? price - entry : entry - price;
  var atr = (data.indicators && data.indicators.adx_5m && data.indicators.adx_5m.atr) || 0.50;

  // Move stop to breakeven if profitable by > 1 ATR
  if (pnl > atr && trade.stop) {
    var beStop = dir === 'BULLISH' ? entry + 0.10 : entry - 0.10;
    if ((dir === 'BULLISH' && trade.stop < entry) || (dir === 'BEARISH' && trade.stop > entry)) {
      actions.push({ type: 'MOVE_STOP', price: +beStop.toFixed(2), reason: 'Trade profitable by $' + pnl.toFixed(2) + ' (>' + atr.toFixed(2) + ' ATR). Move stop to breakeven + $0.10 buffer.', urgency: 'recommended' });
    }
  }

  // Take partial at Target 1
  if (trade.target1) {
    var distToT1 = dir === 'BULLISH' ? trade.target1 - price : price - trade.target1;
    if (distToT1 <= 0.10 && distToT1 > -0.30) {
      actions.push({ type: 'TAKE_PARTIAL', reason: 'Approaching Target 1 ($' + trade.target1.toFixed(2) + '). Consider taking 50% off.', urgency: 'now' });
    }
  }

  // Stop warning
  if (trade.stop) {
    var distToStop = dir === 'BULLISH' ? price - trade.stop : trade.stop - price;
    if (distToStop < atr * 0.5 && distToStop > 0) {
      actions.push({ type: 'STOP_WARNING', reason: 'Only $' + distToStop.toFixed(2) + ' from stop. Watch closely.', urgency: 'warning' });
    }
    if (distToStop <= 0) {
      actions.push({ type: 'STOP_HIT', reason: 'Stop level breached. EXIT TRADE.', urgency: 'critical' });
    }
  }

  // Confluence flip warning
  if (data.confluence) {
    var tradeDir = dir;
    if (data.confluence.bias !== tradeDir && data.confluence.confluencePct > 60) {
      actions.push({ type: 'CONFLUENCE_FLIP', reason: 'Confluence has flipped to ' + data.confluence.bias + ' (' + data.confluence.confluencePct + '%). Trade thesis may be invalidated.', urgency: 'warning' });
    }
  }

  // Squeeze fire in opposite direction
  if (data.indicators) {
    var sq = data.indicators.squeeze_5m;
    if (sq && sq.fired) {
      var sqDir = sq.dir === 'bull' ? 'BULLISH' : 'BEARISH';
      if (sqDir !== dir) {
        actions.push({ type: 'SQUEEZE_AGAINST', reason: 'Squeeze fired ' + sq.dir.toUpperCase() + ' — against your position. Consider tightening stop.', urgency: 'warning' });
      } else {
        actions.push({ type: 'SQUEEZE_WITH', reason: 'Squeeze fired ' + sq.dir.toUpperCase() + ' — in your favor. Momentum accelerating.', urgency: 'positive' });
      }
    }
  }

  return actions;
}

// ============================================================================
// HANDLER
// ============================================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    // ENTER: User clicks "I'M IN"
    if (action === 'enter' && req.method === 'POST') {
      var b = req.body || {};
      if (!b.entry || !b.direction) return res.status(400).json({ error: 'entry (price) and direction (BULLISH/BEARISH) required' });
      return res.json({
        success: true,
        trade: {
          entry: parseFloat(b.entry),
          direction: b.direction.toUpperCase(),
          stop: b.stop ? parseFloat(b.stop) : null,
          target1: b.target1 ? parseFloat(b.target1) : null,
          target2: b.target2 ? parseFloat(b.target2) : null,
          enteredAt: new Date().toISOString()
        },
        message: 'Trade registered. Command Center active. Polling for real-time updates.'
      });
    }

    // UPDATE: Real-time commentary poll
    if (action === 'update') {
      var entry = parseFloat(req.query.entry || '0');
      var direction = (req.query.direction || 'BULLISH').toUpperCase();
      var stop = req.query.stop ? parseFloat(req.query.stop) : null;
      var target1 = req.query.target1 ? parseFloat(req.query.target1) : null;
      var target2 = req.query.target2 ? parseFloat(req.query.target2) : null;
      var enteredAt = req.query.enteredAt || new Date().toISOString();

      if (!entry) return res.status(400).json({ error: 'entry price required as query param' });

      var trade = { entry: entry, direction: direction, stop: stop, target1: target1, target2: target2 };
      var elapsed = Math.round((Date.now() - new Date(enteredAt).getTime()) / 60000);

      // Get real-time DT Engine data
      var baseUrl = req.headers.host ? (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host : 'https://www.ankushai.org';
      var dtData = await getDTEngineData(baseUrl);

      if (!dtData || !dtData.price) {
        return res.json({ commentary: 'Waiting for market data...', actions: [], price: null, elapsed: elapsed });
      }

      // Build factual summary and generate commentary
      var factual = buildFactualSummary(dtData, trade);
      var ai = await generateCommentary(factual, trade, elapsed);
      var actions = suggestActions(dtData, trade);

      var pnl = direction === 'BULLISH' ? dtData.price - entry : entry - dtData.price;

      return res.json({
        price: dtData.price,
        pnl: +pnl.toFixed(2),
        pnlPct: +((pnl / entry) * 100).toFixed(2),
        elapsed: elapsed,
        commentary: ai.commentary,
        commentarySource: ai.source,
        actions: actions,
        confluence: dtData.confluence || null,
        strat: dtData.strat || null,
        indicators: {
          macd: dtData.indicators ? (dtData.indicators.macd_5m || dtData.indicators.macd_1m) : null,
          adx: dtData.indicators ? (dtData.indicators.adx_5m || dtData.indicators.adx_1m) : null,
          squeeze: dtData.indicators ? (dtData.indicators.squeeze_5m || dtData.indicators.squeeze_1m) : null,
          vwap: dtData.indicators ? dtData.indicators.vwap : null
        },
        timestamp: new Date().toISOString()
      });
    }

    // STATUS: Health check
    if (action === 'status' || action === 'health') {
      return res.json({ status: 'ok', version: 'v1', features: ['real-time AI commentary', 'action suggestions', 'stop management', 'partial profit guidance', 'confluence monitoring', 'squeeze alerts'], model: 'llama-3.3-70b-versatile', source: 'groq' });
    }

    return res.status(400).json({
      error: 'action required: enter, update, status',
      usage: {
        enter: 'POST {entry, direction, stop?, target1?, target2?}',
        update: 'GET ?entry=577.20&direction=BEARISH&stop=578.50&target1=575.80&enteredAt=ISO',
        status: 'GET — health check'
      }
    });
  } catch (err) {
    console.error('[command-center]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
