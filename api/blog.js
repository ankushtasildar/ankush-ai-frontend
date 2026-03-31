// ============================================================
// ANKUSHAI BLOG API
// ============================================================
// GET /api/blog — all articles (summaries)
// GET /api/blog?slug=article-slug — full article
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
    content: 'Every professional trader will tell you the same thing: journaling is the single highest-leverage habit for improving your trading. Yet studies show fewer than 15% of active traders maintain a consistent journal.\n\nThe problem is not discipline. Traditional journaling feels like homework. You finish a trading day, emotionally drained, and the last thing you want to do is open a spreadsheet.\n\nAI-powered trading journals solve this by meeting you where you are. Describe your trade in natural language: "Bought 200 shares of NVDA at 165, stop at 155, target 185." The AI parses this automatically. Your trade is logged without friction.\n\nBut the real transformation happens in the coaching layer. An AI coach analyzes your patterns across hundreds of trades. It notices your win rate drops 40% when you trade while anxious. It catches revenge trading patterns before you blow up your account.\n\nThe key insight: a human coach sees you once a week. An AI coach is available every session, remembers every trade, and never judges. It combines analytical precision with emotional intelligence.\n\nAnkushAI integrates real-time market data into the coaching context. When you mention a stock, the AI knows the current price and what its Alpha Intelligence system thinks about the setup.\n\nThe habit loop has three components. First, a personalized morning briefing creates the trigger. Second, frictionless logging creates the routine. Third, the weekly performance report creates the reward.\n\nTraders who journal consistently for 30 days see measurable improvements. With AI eliminating the friction, that habit becomes achievable for the first time.'
  },
  {
    slug: 'trading-psychology-ai-coach',
    title: 'Trading Psychology: Why Your Brain Sabotages Your Trades',
    description: 'Fear, greed, FOMO, revenge trading. Your brain is not wired for markets. AI coaching can rewire your approach.',
    author: 'AnkushAI Team',
    date: '2026-03-25',
    readTime: '7 min',
    tags: ['trading psychology', 'AI coach', 'emotional control'],
    content: 'Your brain evolved to survive on the savanna, not to trade financial markets. The same instincts that kept your ancestors alive now actively sabotage your trading account.\n\nWhen a trade goes against you, your amygdala fires the fight-or-flight response. Cortisol floods your system. Your prefrontal cortex shuts down. You are not making calculated decisions. This is why traders move their stops, average down, and hold past invalidation.\n\nThe reverse is equally dangerous. When a trade works, dopamine surges. Your brain wants more. This is the neurological basis of overtrading and FOMO.\n\nAI coaching operates at the point of decision. When you log a trade and mention feeling anxious, the AI catches it: "I notice you are feeling anxious. What specific signal confirmed your entry? Are you sized appropriately for your emotional state?"\n\nOver time, the AI builds a psychological profile from your data. It correlates mood with outcomes. When anxious trades show 28% win rate versus 61% when calm, the AI presents this as YOUR data showing YOUR patterns.\n\nThe Trading Sabbatical feature detects dangerous patterns: consecutive losses plus escalating size plus negative mood. It suggests stepping away. Not forcing. Suggesting. Like a trusted mentor.\n\nThe traders who improve fastest are not those who learn the most technical analysis. They are those who develop emotional awareness. AI makes this accessible to everyone.'
  }
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var slug = req.query && req.query.slug;
  if (slug) {
    var article = ARTICLES.find(function(a) { return a.slug === slug; });
    if (!article) return res.status(404).json({ error: 'Article not found' });
    return res.status(200).json(article);
  }

  var summaries = ARTICLES.map(function(a) {
    return { slug: a.slug, title: a.title, description: a.description, author: a.author, date: a.date, readTime: a.readTime, tags: a.tags };
  });
  return res.status(200).json({ articles: summaries, total: summaries.length });
};
