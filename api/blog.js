// ============================================================
// ANKUSHAI BLOG API — Expanded for SEO Growth
// ============================================================
// GET /api/blog              — all articles (summaries)
// GET /api/blog?action=list  — same as above
// GET /api/blog?action=read&slug=article-slug — full article
// ============================================================

var ARTICLES = [
  {
    slug: 'ai-trading-journal-how-it-works',
    title: 'How an AI Trading Journal Actually Improves Your Performance',
    description: 'Most traders know they should journal. Few do. AI changes that equation entirely.',
    author: 'AnkushAI Team',
    date: '2026-03-28',
    readTime: '6 min',
    tags: ['trading journal', 'AI coaching', 'performance'],
    content: "## Why Most Traders Fail at Journaling\n\nTrading journals have been a cornerstone of professional trading for decades. Yet studies show that fewer than 15% of retail traders maintain one consistently. The problem isn't motivation — it's friction.\n\n## How AI Removes the Friction\n\nAnkushAI's journal uses natural language processing to extract trade data from your entries automatically. Just describe your trade in plain English: 'Bought 5 QQQ 480 calls at 3.20, sold at 4.80 after the FOMC reaction.' The AI extracts the symbol, direction, entry, exit, P&L, and strategy — then asks follow-up questions about your emotional state and decision process.\n\n## Pattern Recognition at Scale\n\nThe real power emerges over time. After 50+ entries, the AI identifies patterns you can't see: 'You win 73% of trades taken before 10:30 AM but only 38% after 2 PM.' Or: 'Your options trades perform 2.1x better when VIX is above 20.' These insights are impossible to extract manually.\n\n## The Coaching Loop\n\nEvery EOD debrief session synthesizes your recent performance, emotional patterns, and market conditions into actionable recommendations. It's like having a trading psychologist and performance coach available 24/7."
  },
  {
    slug: 'trading-psychology-why-your-brain-sabotages',
    title: "Trading Psychology: Why Your Brain Sabotages Your Trades",
    description: 'Fear, greed, FOMO, revenge trading. Your brain is not wired for markets. AI coaching can rewire your approach.',
    author: 'AnkushAI Team',
    date: '2026-03-25',
    readTime: '7 min',
    tags: ['trading psychology', 'AI coach', 'emotional control'],
    content: "## The Evolutionary Mismatch\n\nYour brain evolved to detect threats in the savannah, not to manage risk in volatile markets. The amygdala — your fear center — triggers fight-or-flight responses when you see a position going against you. This is why most traders cut winners short and let losers run.\n\n## The Five Emotional Traps\n\n### 1. FOMO (Fear of Missing Out)\nYou see a stock running 8% and chase it at the top. The AI flags this pattern: 'You've entered 12 FOMO trades in the last month. Win rate: 25%. Average loss: -2.3%.'\n\n### 2. Revenge Trading\nAfter a loss, the urge to 'make it back' leads to oversized, impulsive trades. The journal tracks consecutive-loss sequences and alerts you when you're in revenge mode.\n\n### 3. Tilt\nLike poker players, traders go on tilt — making irrational decisions driven by emotion rather than analysis. Your journal can detect tilt patterns by analyzing trade frequency and sizing changes.\n\n### 4. Overconfidence After Wins\nA winning streak makes you feel invincible. Position sizes creep up. The Risk Calculator grades every trade — an A+ during your streak quickly becomes a D when you double your usual size.\n\n### 5. Analysis Paralysis\nSo many indicators, so many timeframes. FTFC says bullish, but RSI is overbought. The Day Trade Engine synthesizes 29 analysis functions into a single confluence score so you can act decisively."
  },
  {
    slug: 'options-greeks-explained-simply',
    title: 'Options Greeks Explained: Delta, Theta, Gamma, Vega in Plain English',
    description: 'Stop memorizing formulas. Understand what the Greeks actually mean for your P&L with real examples.',
    author: 'AnkushAI Team',
    date: '2026-03-22',
    readTime: '8 min',
    tags: ['options', 'education', 'Greeks'],
    content: "## Think of Options Like Insurance\n\nBefore diving into Greeks, understand this: every option is an insurance contract. Calls insure against missing upside. Puts insure against downside. The Greeks tell you how sensitive that insurance premium is to different factors.\n\n## Delta: Your Directional Exposure\n\nDelta tells you how much your option moves per $1 move in the stock. A 0.50 delta call gains $0.50 when the stock goes up $1. Think of delta as the probability the option expires in-the-money.\n\n## Theta: The Daily Tax\n\nTheta is how much value your option loses each day from time decay. If theta is -0.05, your option loses $5 per contract per day — even if the stock doesn't move. This is why option sellers love high theta.\n\n## Gamma: Delta's Accelerator\n\nGamma measures how fast delta changes. Near expiration, gamma explodes for at-the-money options. This is why 0DTE options can go from $0.10 to $5.00 in minutes — gamma is cranked to maximum.\n\n## Vega: The Volatility Play\n\nVega measures sensitivity to implied volatility. Before earnings, IV rises (options get expensive). After earnings, IV crashes. This 'IV crush' is why buying options before earnings is usually a losing trade — even if you get the direction right.\n\n## How AnkushAI Uses the Greeks\n\nOur Earnings Calendar shows IV Rank for every stock. Our Options Recommender factors in all four Greeks when suggesting trades. And our Risk Calculator shows you the Greeks of your specific position before you enter."
  },
  {
    slug: 'risk-management-position-sizing-guide',
    title: 'Risk Management: The Position Sizing Guide That Saves Accounts',
    description: 'The 1% rule, Kelly Criterion, and R:R ratios. How professional traders protect capital while maximizing returns.',
    author: 'AnkushAI Team',
    date: '2026-03-19',
    readTime: '6 min',
    tags: ['risk management', 'position sizing', 'strategy'],
    content: "## Rule Number One: Don't Lose Money\n\nWarren Buffett's first rule applies doubly to trading. A 50% loss requires a 100% gain to recover. Risk management isn't about limiting upside — it's about ensuring you survive long enough for your edge to play out.\n\n## The 1% Rule\n\nNever risk more than 1-2% of your total account on a single trade. On a $25,000 account, that's $250-$500 maximum loss per trade. This means your stop loss determines your position size, not the other way around.\n\n## R:R Ratio: The Quality Filter\n\nReward-to-Risk ratio (R:R) is the potential profit divided by potential loss. Professional traders rarely take trades below 2:1 R:R. At 2:1, you only need to win 34% of your trades to break even.\n\n## Kelly Criterion: Optimal Sizing\n\nKelly = (Win Rate x Average Win - Loss Rate x Average Loss) / Average Win. This formula gives you the mathematically optimal position size. Most pros use 'half Kelly' for safety.\n\n## AnkushAI's Risk Grade System\n\nOur Risk Calculator grades every trade from A+ to F based on position size percentage and R:R ratio. An A+ trade risks under 1% with a 3:1 R:R. An F risks over 5% with poor R:R. Track your average grade over time — it should be B or better."
  },
  {
    slug: 'the-strat-methodology-beginners-guide',
    title: 'The Strat Methodology: A Complete Guide for Beginners',
    description: 'Rob Smith\'s The Strat simplified. Inside bars, outside bars, combos, FTFC, and actionable setups explained.',
    author: 'AnkushAI Team',
    date: '2026-03-16',
    readTime: '9 min',
    tags: ['The Strat', 'technical analysis', 'strategy'],
    content: "## What is The Strat?\n\nThe Strat is a trading methodology created by Rob Smith that categorizes every candlestick into one of three types based on its relationship to the previous candle. This simplification cuts through indicator noise and gives you clear, actionable signals.\n\n## The Three Bar Types\n\n### Type 1: Inside Bar\nThe high is lower AND the low is higher than the previous bar. This represents consolidation — a coiled spring ready to expand.\n\n### Type 2: Directional Bar\nEither the high OR the low exceeds the previous bar (but not both). This shows directional commitment.\n\n### Type 3: Outside Bar\nBoth the high AND the low exceed the previous bar. This is maximum expansion — often a reversal or continuation signal depending on context.\n\n## Key Combos\n\nThe power of The Strat comes from combos — sequences of bar types that signal high-probability setups:\n\n- 2-1-2: Directional move, pause, then continuation or reversal\n- 3-1-2: Expansion, consolidation, then breakout\n- 1-2-2: Coil, initial move, then continuation\n\n## Full Timeframe Continuity (FTFC)\n\nWhen all timeframes (monthly, weekly, daily, hourly, 5-min) show the same directional bias, you have FTFC. These are the highest-probability setups in The Strat because every level of market participation agrees on direction.\n\n## How AnkushAI Implements The Strat\n\nOur Day Trade Engine analyzes Strat bar types and combos across all 5 timeframes automatically. The FTFC indicator shows you when full continuity is achieved, and the confluence score weights Strat signals alongside MACD, ADX, and other technical factors."
  },
  {
    slug: 'earnings-season-playbook-options-strategies',
    title: 'Earnings Season Playbook: Options Strategies That Actually Work',
    description: 'IV crush, straddles, iron condors, and calendar spreads. How to trade earnings without getting destroyed.',
    author: 'AnkushAI Team',
    date: '2026-03-13',
    readTime: '7 min',
    tags: ['earnings', 'options', 'IV crush', 'strategy'],
    content: "## The Earnings Trap\n\nEarnings announcements are the most exciting — and most dangerous — events in options trading. Implied volatility (IV) inflates 2-3 weeks before the report, then crashes immediately after. This 'IV crush' destroys option buyers who get the direction right but still lose money.\n\n## Strategy 1: Sell Premium Before Earnings\n\nWhen IV Rank is above 50, selling premium is statistically favorable. Iron condors profit when the stock stays within the expected move range. Our Earnings Calendar shows IV Rank for every stock so you can identify the best opportunities.\n\n## Strategy 2: Calendar Spreads\n\nBuy a longer-dated option and sell a shorter-dated one at the same strike. The short option gets crushed by IV while the long option retains most of its value. Best when you have a directional bias but want IV crush protection.\n\n## Strategy 3: Post-Earnings Drift\n\nStudies show that stocks tend to continue moving in the direction of the earnings reaction for 1-3 weeks. Wait for the dust to settle, then enter a directional trade with reduced IV and clearer technicals.\n\n## The AnkushAI Edge\n\nOur Earnings Calendar V2 shows pre-earnings entry windows with ENTER NOW badges. Each stock displays EPS estimates, expected moves, IV Rank, and historical beat rates. The AI generates specific play recommendations like 'High IV — sell iron condor' or 'Strong beat history — buy calls 2 weeks before, close before earnings.'"
  },
  {
    slug: 'day-trading-qqqq-complete-setup',
    title: 'Day Trading QQQ: The Complete Technical Setup',
    description: 'How to use confluence scoring, MACD, ADX, VWAP, and key levels to day trade the Nasdaq 100 ETF.',
    author: 'AnkushAI Team',
    date: '2026-03-10',
    readTime: '8 min',
    tags: ['day trading', 'QQQ', 'technical analysis'],
    content: "## Why QQQ?\n\nQQQ (Invesco Nasdaq 100 ETF) is the most popular day trading vehicle for options traders. It has tight spreads, massive liquidity, predictable volatility patterns, and options that expire every day (0DTE). The key is having a systematic approach rather than guessing.\n\n## The 29-Function Analysis Framework\n\nAnkushAI's Day Trade Engine runs 29 analysis functions across 5 timeframes (1-min, 5-min, 15-min, 1-hour, daily) to give you a complete picture:\n\n### Trend Assessment\n- EMA Cloud (8/21 EMA relationship per timeframe)\n- ADX for trend strength (above 25 = trending)\n- Full Timeframe Continuity check\n\n### Momentum\n- MACD histogram and crossovers\n- Divergence detection between price and MACD\n- Squeeze indicator (Bollinger Bands inside Keltner Channels)\n\n### Structure\n- Key levels (pivot points, R1/R2/S1/S2)\n- Anchored VWAPs from swing highs and lows\n- Gap analysis (gap up/down, filled or unfilled)\n\n### Pattern Recognition\n- Strat bar types and combos per timeframe\n- Candlestick patterns (hammer, engulfing, doji)\n- Volume confirmation\n\n## The Confluence Score\n\nAll 29 functions vote bullish or bearish. A confluence score of 80%+ in either direction is a high-probability setup. Scores near 50/50 mean conflicting signals — no trade.\n\n## How to Use the Dashboard\n\n1. Check FTFC first — if all timeframes align, you have the wind at your back\n2. Look at the confluence score — 70%+ is tradeable\n3. Identify key levels for your entry and stop\n4. Use the Risk Calculator to size your position (aim for A or B grade)\n5. Log the trade in your Journal for the AI to learn from"
  },
  {
    slug: 'building-trading-edge-with-ai',
    title: 'Building a Trading Edge: How AI Amplifies Human Decision-Making',
    description: 'AI doesn\'t replace traders. It removes cognitive biases, processes more data, and enforces discipline. Here\'s how.',
    author: 'AnkushAI Team',
    date: '2026-03-07',
    readTime: '5 min',
    tags: ['AI', 'trading edge', 'performance'],
    content: "## What is a Trading Edge?\n\nA trading edge is a statistical advantage that, applied consistently over many trades, produces positive expected value. It could be a specific setup, timing pattern, or information processing advantage. Without an edge, trading is gambling.\n\n## The Three Pillars of Edge\n\n### 1. Information Processing\nMarkets move on information. The trader who processes information faster and more accurately has an advantage. AI can scan 40+ tickers for institutional setups in seconds, analyze earnings data across 500 companies, and detect technical patterns across multiple timeframes simultaneously.\n\n### 2. Emotional Discipline\nKnowing the right trade and executing it are different skills. Fear and greed cause even experienced traders to deviate from their plans. An AI journal that tracks your emotional patterns and flags when you're trading on tilt provides a guardrail that human willpower alone can't match.\n\n### 3. Continuous Improvement\nMost traders repeat the same mistakes because they don't systematically review their performance. AI-powered debriefs that analyze your trades, identify patterns, and provide specific recommendations create a feedback loop that accelerates improvement.\n\n## The AnkushAI Ecosystem\n\nEvery tool in our platform is designed to amplify one of these three pillars. Alpha Intelligence processes information. The Journal and EOD Debrief enforce discipline. The Learning Center and Strategies pages drive continuous improvement. Together, they create a compounding edge that grows stronger with every trade you log."
  }
];

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var slug = req.query.slug || '';
  var action = req.query.action || '';

  // Single article by slug
  if (slug || action === 'read') {
    var s = slug || req.query.slug || '';
    var article = ARTICLES.find(function(a) { return a.slug === s; });
    if (article) return res.json(article);
    return res.status(404).json({ error: 'Article not found', slug: s });
  }

  // List all articles (summaries without full content)
  var summaries = ARTICLES.map(function(a) {
    return { slug: a.slug, title: a.title, description: a.description, author: a.author, date: a.date, readTime: a.readTime, tags: a.tags };
  });

  return res.json({ articles: summaries, total: summaries.length });
};
