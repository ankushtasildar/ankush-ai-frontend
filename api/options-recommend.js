// ============================================================
// ANKUSHAI OPTIONS STRATEGY RECOMMENDER
// ============================================================
// Accepts: symbol, thesis (bullish/bearish/neutral), timeframe, risk_tolerance
// Returns: recommended strategy with specific parameters
// Uses: Real price data + IV estimation + Groq/Anthropic for strategy narrative
// ============================================================

const DataService = require('./lib/data-service');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    var body = req.body || {};
    var symbol = (body.symbol || '').toUpperCase();
    var thesis = body.thesis || 'neutral'; // bullish, bearish, neutral
    var timeframe = body.timeframe || '2-4 weeks';
    var riskTolerance = body.riskTolerance || 'moderate'; // conservative, moderate, aggressive

    if (!symbol) return res.status(400).json({ error: 'Symbol required' });

    // Get real price data
    var priceData = await DataService.getPrice(symbol);
    if (!priceData) return res.status(503).json({ error: 'Price data unavailable for ' + symbol });

    var bars = await DataService.getBars(symbol, 60);
    var sentiment = await DataService.getSentiment();

    // Estimate IV rank from historical volatility
    var ivEstimate = estimateIV(bars, priceData.price);

    // Determine optimal strategy based on thesis + IV + risk tolerance
    var strategy = selectStrategy(thesis, ivEstimate, riskTolerance, priceData.price);

    // Calculate specific parameters
    var params = calculateParams(strategy, priceData.price, ivEstimate, timeframe);

    // Build AI narrative using Groq (free) or Anthropic (fallback)
    var narrative = await getAINarrative(symbol, priceData, strategy, params, ivEstimate, thesis, timeframe);

    return res.status(200).json({
      symbol: symbol,
      currentPrice: priceData.price,
      thesis: thesis,
      timeframe: timeframe,
      ivEstimate: ivEstimate,
      strategy: strategy,
      params: params,
      narrative: narrative.text,
      model: narrative.model,
      provider: narrative.provider
    });

  } catch (err) {
    console.error('[options-recommend] Error:', err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

function estimateIV(bars, currentPrice) {
  if (!bars || bars.length < 20) return { rank: 50, level: 'moderate', hv20: 0 };
  // Calculate 20-day historical volatility
  var returns = [];
  for (var i = 1; i < bars.length; i++) {
    if (bars[i].close && bars[i-1].close) {
      returns.push(Math.log(bars[i].close / bars[i-1].close));
    }
  }
  var mean = returns.reduce(function(a,b){return a+b;}, 0) / returns.length;
  var variance = returns.reduce(function(a,b){return a + Math.pow(b - mean, 2);}, 0) / returns.length;
  var dailyVol = Math.sqrt(variance);
  var annualVol = dailyVol * Math.sqrt(252);
  var hv20 = Math.round(annualVol * 100);

  // Estimate IV rank (simplified — compare current HV to range)
  var rank = hv20 > 60 ? 85 : hv20 > 40 ? 65 : hv20 > 25 ? 45 : 25;
  var level = rank > 70 ? 'high' : rank > 40 ? 'moderate' : 'low';

  return { rank: rank, level: level, hv20: hv20 };
}

function selectStrategy(thesis, iv, risk, price) {
  if (thesis === 'bullish') {
    if (iv.level === 'high') return { name: 'Bull Put Spread', type: 'credit', description: 'Sell premium with defined risk — IV is elevated' };
    if (iv.level === 'low') return { name: 'Long Call', type: 'debit', description: 'Buy calls while IV is cheap — maximize upside exposure' };
    return { name: 'Bull Call Spread', type: 'debit', description: 'Defined risk bullish play with moderate IV' };
  }
  if (thesis === 'bearish') {
    if (iv.level === 'high') return { name: 'Bear Call Spread', type: 'credit', description: 'Sell premium with defined risk — IV is elevated' };
    if (iv.level === 'low') return { name: 'Long Put', type: 'debit', description: 'Buy puts while IV is cheap — maximize downside exposure' };
    return { name: 'Bear Put Spread', type: 'debit', description: 'Defined risk bearish play with moderate IV' };
  }
  // Neutral
  if (iv.level === 'high') return { name: 'Iron Condor', type: 'credit', description: 'Sell premium on both sides — IV is elevated, expect range-bound' };
  return { name: 'Straddle', type: 'debit', description: 'Bet on a big move in either direction — IV is low/moderate' };
}

function calculateParams(strategy, price, iv, timeframe) {
  var roundToStrike = function(p, dir) {
    var step = price > 200 ? 5 : price > 50 ? 2.5 : 1;
    return dir === 'up' ? Math.ceil(p / step) * step : Math.floor(p / step) * step;
  };

  var atr = price * (iv.hv20 / 100) / Math.sqrt(252) * 5; // ~5-day expected move
  var params = {};

  switch (strategy.name) {
    case 'Long Call':
      params.strike = roundToStrike(price * 1.02, 'up');
      params.expiry = timeframe;
      params.maxRisk = 'Premium paid';
      params.maxReward = 'Unlimited';
      params.breakeven = params.strike + ' + premium';
      break;
    case 'Long Put':
      params.strike = roundToStrike(price * 0.98, 'down');
      params.expiry = timeframe;
      params.maxRisk = 'Premium paid';
      params.maxReward = 'Strike - premium (to zero)';
      params.breakeven = params.strike + ' - premium';
      break;
    case 'Bull Call Spread':
      params.buyStrike = roundToStrike(price, 'down');
      params.sellStrike = roundToStrike(price + atr, 'up');
      params.expiry = timeframe;
      params.maxRisk = 'Net debit';
      params.maxReward = '$' + (params.sellStrike - params.buyStrike).toFixed(0) + ' - debit per share';
      params.breakeven = params.buyStrike + ' + net debit';
      break;
    case 'Bull Put Spread':
      params.sellStrike = roundToStrike(price - atr * 0.5, 'down');
      params.buyStrike = roundToStrike(price - atr * 1.5, 'down');
      params.expiry = timeframe;
      params.maxRisk = '$' + (params.sellStrike - params.buyStrike).toFixed(0) + ' - credit per share';
      params.maxReward = 'Net credit received';
      params.breakeven = params.sellStrike + ' - net credit';
      break;
    case 'Bear Put Spread':
      params.buyStrike = roundToStrike(price, 'up');
      params.sellStrike = roundToStrike(price - atr, 'down');
      params.expiry = timeframe;
      params.maxRisk = 'Net debit';
      params.maxReward = '$' + (params.buyStrike - params.sellStrike).toFixed(0) + ' - debit per share';
      break;
    case 'Bear Call Spread':
      params.sellStrike = roundToStrike(price + atr * 0.5, 'up');
      params.buyStrike = roundToStrike(price + atr * 1.5, 'up');
      params.expiry = timeframe;
      params.maxRisk = '$' + (params.buyStrike - params.sellStrike).toFixed(0) + ' - credit per share';
      params.maxReward = 'Net credit received';
      break;
    case 'Iron Condor':
      params.putSellStrike = roundToStrike(price - atr, 'down');
      params.putBuyStrike = roundToStrike(price - atr * 2, 'down');
      params.callSellStrike = roundToStrike(price + atr, 'up');
      params.callBuyStrike = roundToStrike(price + atr * 2, 'up');
      params.expiry = timeframe;
      params.maxRisk = 'Width of widest spread - net credit';
      params.maxReward = 'Total net credit';
      break;
    case 'Straddle':
      params.strike = roundToStrike(price, 'down');
      params.expiry = timeframe;
      params.maxRisk = 'Total premium paid';
      params.maxReward = 'Unlimited';
      params.breakeven = params.strike + ' +/- total premium';
      break;
  }
  return params;
}

async function getAINarrative(symbol, price, strategy, params, iv, thesis, timeframe) {
  var prompt = 'You are an options strategist. Give a 3-4 sentence recommendation for this setup:\n' +
    'Symbol: ' + symbol + ' at $' + price.price.toFixed(2) + '\n' +
    'Thesis: ' + thesis + ' over ' + timeframe + '\n' +
    'IV Estimate: ' + iv.rank + 'th percentile (' + iv.level + ')\n' +
    'Recommended Strategy: ' + strategy.name + '\n' +
    'Parameters: ' + JSON.stringify(params) + '\n' +
    'Explain WHY this strategy fits the thesis and IV environment. Be specific about risk/reward. Do not use section headers.';

  // Try Groq first (free)
  var GROQ_KEY = process.env.GROQ_API_KEY;
  if (GROQ_KEY) {
    try {
      var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 300, temperature: 0.7 })
      });
      if (res && res.ok) {
        var data = await res.json();
        if (data.choices && data.choices[0]) return { text: data.choices[0].message.content, model: 'llama-3.3-70b', provider: 'groq' };
      }
    } catch (e) { /* fallback */ }
  }

  // Fallback: Anthropic
  var ANTH_KEY = process.env.ANTHROPIC_API_KEY;
  if (ANTH_KEY) {
    try {
      var res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTH_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
      });
      if (res2 && res2.ok) {
        var data2 = await res2.json();
        if (data2.content && data2.content[0]) return { text: data2.content[0].text, model: 'claude-sonnet', provider: 'anthropic' };
      }
    } catch (e) { /* empty */ }
  }

  return { text: strategy.description, model: 'static', provider: 'none' };
}
