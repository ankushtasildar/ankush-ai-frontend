/**
 * /api/eod-debrief — End-of-day journal debrief trigger
 * 
 * Called by the Journal page or a scheduled trigger.
 * For each closed position today, AI analyzes:
 *   1. What the market was doing at entry/exit time
 *   2. Whether the decision was technically sound
 *   3. Key cognitive bias patterns detected
 *   4. What to watch for tomorrow
 * 
 * POST { positions: [...], userContext: "..." }
 * Returns AI debrief narrative
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { positions = [], userContext = '' } = req.body || {};

  if (!positions.length) {
    return res.status(200).json({
      debrief: "No positions to debrief today. Come back after you've made some trades.",
      type: 'empty'
    });
  }

  // Format positions for AI
  const positionSummary = positions.map((p, i) => {
    const isOpts = p.assetType === 'Options';
    const pnl = parseFloat(p.pnl || 0);
    return `Trade ${i+1}: ${p.ticker} (${p.assetType})
  ${isOpts ? `${p.optionType?.toUpperCase()} $${p.strike} exp ${p.expiration} | ${p.contracts} contracts` : `${p.direction || 'Long'} ${p.quantity} shares`}
  Entry: $${p.entryPrice} on ${p.entryDate}${p.exitPrice ? ` → Exit: $${p.exitPrice} on ${p.exitDate || 'today'}` : ' (still open)'}
  P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
  Strategy: ${p.strategy || 'Not specified'}
  Emotion at entry: ${p.emotion || 'Not recorded'}
  Thesis: ${p.notes || 'None recorded'}
  Setup: ${p.setup || 'Not specified'}
  Lesson noted: ${p.lessonLearned || 'None'}`;
  }).join('\n\n');

  const prompt = `You are an elite trading coach conducting a rigorous end-of-day debrief. Be direct, educational, and specific. No empty praise.

TODAY'S TRADING ACTIVITY:
${positionSummary}

${userContext ? `Trader context: ${userContext}` : ''}

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Provide a structured end-of-day debrief covering:

**TRADE-BY-TRADE BREAKDOWN**
For each trade: Was the thesis valid? Was the execution tight? What did the market context say at that time?

**COGNITIVE PATTERNS DETECTED**
Identify any behavioral patterns across these trades: FOMO, revenge trading, cutting winners early, holding losers too long, overconfidence, fear-based exits, etc. Be specific — reference the trades.

**WHAT THE MARKET WAS TELLING YOU**
Based on the tickers and timeframes traded today, what was the macro/sector context? Was the trader aligned with it or fighting it?

**3 THINGS TO IMPROVE TOMORROW**
Specific, actionable. Not generic. Based on what actually happened today.

**MINDSET CHECK**
One direct observation about the emotional patterns you see in the trade log.

Tone: Like a respected trading mentor — honest, focused on growth, never condescending. 4-6 sentences per section. This is not therapy; this is craft improvement.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) throw new Error(`Anthropic API error: ${r.status}`);
    const data = await r.json();
    const debrief = data.content?.[0]?.text || 'Debrief unavailable.';

    return res.status(200).json({
      debrief,
      type: 'full',
      tradeCount: positions.length,
      generatedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, type: 'error' });
  }
}
