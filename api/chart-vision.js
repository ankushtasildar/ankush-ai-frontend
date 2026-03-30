// chart-vision.js — AI Chart Vision Analysis v1
// Receives chart screenshot (base64), sends to Claude Vision for analysis
const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { image, symbol, timeframe, context } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) required' });

    const b64 = image.replace(/^data:image\/[a-z]+;base64,/, '');
    const bytes = Buffer.from(b64, 'base64').length;
    if (bytes > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large. Max 5MB.' });

    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const sys = 'You are Marcus Webb, a 20-year institutional chart analyst from Goldman Sachs and Two Sigma. You are looking at a TradingView chart screenshot. Analyze ONLY what you can SEE. Read actual price levels from the Y-axis. Read dates from the X-axis. Identify REAL candle patterns. If indicators are visible (RSI, MACD, EMA), read their actual values. Note pre/post market data if visible. Respond ONLY with valid JSON, no markdown.';

    const prompt = 'Analyze this ' + (symbol || 'stock') + ' chart (' + (timeframe || 'unknown') + ' timeframe).' + (context ? ' Context: ' + context : '') + ' Return JSON: {"symbol":"...","timeframe":"...","priceRange":{"high":0,"low":0,"current":0},"trend":{"direction":"bullish|bearish|sideways","strength":"strong|moderate|weak","description":"..."},"candlePatterns":[{"name":"...","location":"...","significance":"bullish|bearish|neutral"}],"keyLevels":{"resistance":[{"price":0,"type":"major|minor","reason":"..."}],"support":[{"price":0,"type":"major|minor","reason":"..."}]},"indicators":[{"name":"...","value":"...","signal":"bullish|bearish|neutral"}],"extendedHours":{"visible":false,"premarket":"...","afterhours":"..."},"volumeAnalysis":{"trend":"...","notable":"..."},"tradeSetup":{"bias":"long|short|neutral","entry":0,"stopLoss":0,"target1":0,"target2":0,"riskReward":"...","rationale":"..."},"drawingRecommendations":[{"type":"horizontalLine|trendline|rectangle|label","description":"...","price":0,"color":"#hex"}],"summary":"..."}';

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: sys,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
        { type: 'text', text: prompt }
      ]}]
    });

    const raw = msg.content[0].text;
    var analysis;
    try { analysis = JSON.parse(raw); } catch(e) {
      var m = raw.match(/\{[\s\S]*\}/);
      if (m) analysis = JSON.parse(m[0]);
      else return res.status(500).json({ error: 'Failed to parse AI response', raw: raw.substring(0, 200) });
    }

    return res.json({ ...analysis, engine: 'chart-vision-v1', imageSize: bytes, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[chart-vision] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};