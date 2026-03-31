// ============================================================
// ANKUSHAI EARNINGS PLAY ANALYZER
// ============================================================
// GET /api/earnings-analyzer?symbol=NVDA
// Returns: expected move, vol assessment, strategy recommendation
// Uses: DataService + Groq ($0) for AI narrative
// ============================================================

const DataService = require('./lib/data-service');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var symbol = ((req.query && req.query.symbol) || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    var priceData = await DataService.getPrice(symbol);
    if (!priceData) return res.status(503).json({ error: 'Price unavailable for ' + symbol });

    var bars = await DataService.getBars(symbol, 120);
    if (!bars || bars.length < 30) return res.status(503).json({ error: 'Insufficient data for ' + symbol });

    // 20-day historical volatility
    var returns = [];
    for (var i = 1; i < Math.min(bars.length, 21); i++) {
      if (bars[i].close && bars[i-1].close) returns.push(Math.log(bars[i].close / bars[i-1].close));
    }
    var mean = returns.reduce(function(a,b){return a+b;}, 0) / returns.length;
    var variance = returns.reduce(function(a,b){return a + Math.pow(b - mean, 2);}, 0) / returns.length;
    var dailyVol = Math.sqrt(variance);
    var hv20 = Math.round(dailyVol * Math.sqrt(252) * 100);

    // Expected earnings move (1.5x daily vol)
    var expectedMovePct = parseFloat((dailyVol * 100 * 1.5).toFixed(2));
    var expectedMoveAbs = parseFloat((priceData.price * expectedMovePct / 100).toFixed(2));

    // Recent price action
    var last5 = bars.slice(-5);
    var recentTrend = last5.length >= 2 ? ((last5[last5.length-1].close - last5[0].close) / last5[0].close * 100).toFixed(2) : '0';

    // Vol assessment and strategy
    var volLevel = hv20 > 50 ? 'very_high' : hv20 > 35 ? 'high' : hv20 < 20 ? 'low' : 'moderate';
    var strategy = {};

    if (volLevel === 'very_high' || volLevel === 'high') {
      strategy = { play: 'SELL_PREMIUM', name: 'Iron Condor', rationale: 'Vol elevated at ' + hv20 + '% — options overpriced. Sell premium with defined risk.' };
    } else if (volLevel === 'low') {
      strategy = { play: 'BUY_PREMIUM', name: 'Long Straddle', rationale: 'Vol low at ' + hv20 + '% — options cheap. Buy both sides for surprise moves.' };
    } else {
      strategy = { play: 'SELECTIVE', name: 'Directional only with thesis', rationale: 'Vol moderate at ' + hv20 + '% — fair pricing. Only play with strong conviction.' };
    }

    // AI narrative via Groq
    var narrative = await getAINarrative(symbol, priceData, hv20, expectedMovePct, recentTrend, strategy, volLevel);

    return res.status(200).json({
      symbol: symbol,
      price: priceData.price,
      hv20: hv20,
      volLevel: volLevel,
      expectedMove: { pct: expectedMovePct, dollars: expectedMoveAbs, up: parseFloat((priceData.price + expectedMoveAbs).toFixed(2)), down: parseFloat((priceData.price - expectedMoveAbs).toFixed(2)) },
      recentTrend: parseFloat(recentTrend),
      strategy: strategy,
      narrative: narrative.text,
      provider: narrative.provider
    });
  } catch (err) {
    console.error('[earnings-analyzer]', err.message);
    return res.status(500).json({ error: 'Analysis failed' });
  }
};

async function getAINarrative(symbol, price, hv, move, trend, strategy, vol) {
  var prompt = 'Earnings analyst: 3 sentences on ' + symbol + ' at $' + price.price.toFixed(2) + '. HV20=' + hv + '% (' + vol + '), expected move +/-' + move + '%, recent trend ' + trend + '%. Recommend: ' + strategy.name + '. Be specific with numbers. No headers.';
  var KEY = process.env.GROQ_API_KEY;
  if (KEY) {
    try {
      var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 200, temperature: 0.7 })
      });
      if (r.ok) { var d = await r.json(); if (d.choices && d.choices[0]) return { text: d.choices[0].message.content, provider: 'groq' }; }
    } catch (e) { /* fallback */ }
  }
  return { text: strategy.rationale, provider: 'static' };
}
