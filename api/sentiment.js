// ============================================================
// ANKUSHAI SENTIMENT API
// ============================================================
// Returns market-wide sentiment indicators:
//   - VIX level and trend
//   - SPY/QQQ direction
//   - Market breadth estimate
//   - Sector rotation signals
// Used by: Alpha Intelligence, Options Recommender, Journal AI, Overview
// ============================================================

const DataService = require('./lib/data-service');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=120'); // Cache 2 min

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const symbols = ['SPY', 'QQQ', 'IWM', 'VIX', 'TLT', 'HYG', 'XLK', 'XLF', 'XLE', 'XLV'];
    const quotes = await DataService.getMultipleQuotes(symbols);

    var vix = quotes.VIX || {};
    var spy = quotes.SPY || {};
    var qqq = quotes.QQQ || {};
    var iwm = quotes.IWM || {};
    var tlt = quotes.TLT || {};
    var hyg = quotes.HYG || {};

    // VIX regime
    var vixLevel = vix.price || 0;
    var vixRegime = vixLevel > 35 ? 'panic' : vixLevel > 25 ? 'fear' : vixLevel > 18 ? 'cautious' : 'calm';

    // Credit spread proxy: HYG vs TLT
    var creditStress = 'normal';
    if (hyg.changePercent && tlt.changePercent) {
      var spread = hyg.changePercent - tlt.changePercent;
      creditStress = spread < -1 ? 'stress' : spread < -0.3 ? 'widening' : 'normal';
    }

    // Breadth: small caps vs large caps
    var breadth = 'neutral';
    if (iwm.changePercent && spy.changePercent) {
      var diff = iwm.changePercent - spy.changePercent;
      breadth = diff > 0.5 ? 'risk_on' : diff < -0.5 ? 'risk_off' : 'neutral';
    }

    // Sector rotation
    var sectors = {};
    ['XLK', 'XLF', 'XLE', 'XLV'].forEach(function(s) {
      if (quotes[s]) sectors[s] = { price: quotes[s].price, change: quotes[s].changePercent };
    });

    var sentiment = {
      timestamp: new Date().toISOString(),
      vix: { level: vixLevel, regime: vixRegime },
      indices: {
        SPY: { price: spy.price, change: spy.changePercent },
        QQQ: { price: qqq.price, change: qqq.changePercent },
        IWM: { price: iwm.price, change: iwm.changePercent }
      },
      credit: { stress: creditStress },
      breadth: breadth,
      sectors: sectors,
      summary: buildSummary(vixRegime, breadth, creditStress, spy)
    };

    return res.status(200).json(sentiment);
  } catch (err) {
    console.error('[sentiment] Error:', err.message);
    return res.status(500).json({ error: 'Sentiment data unavailable' });
  }
};

function buildSummary(vixRegime, breadth, credit, spy) {
  var parts = [];
  if (vixRegime === 'panic') parts.push('VIX in panic territory — extreme caution warranted');
  else if (vixRegime === 'fear') parts.push('VIX elevated — hedging demand is high');
  else if (vixRegime === 'calm') parts.push('VIX calm — low fear environment');

  if (breadth === 'risk_on') parts.push('Small caps outperforming — risk appetite is healthy');
  else if (breadth === 'risk_off') parts.push('Large caps leading — defensive positioning');

  if (credit === 'stress') parts.push('Credit spreads widening — institutional stress signal');

  if (spy && spy.changePercent) {
    if (spy.changePercent > 1) parts.push('SPY up ' + spy.changePercent.toFixed(1) + '% — strong bullish session');
    else if (spy.changePercent < -1) parts.push('SPY down ' + Math.abs(spy.changePercent).toFixed(1) + '% — selling pressure');
  }

  return parts.join('. ') || 'Markets in a neutral state.';
}
