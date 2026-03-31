// ============================================================
// ANKUSHAI WEEKLY AUTO-REPORT CRON
// ============================================================
// Runs: Sunday 6 PM ET via Vercel cron
// For each active trader: queries week's trades, computes stats,
// generates AI synthesis, stores as journal_entry
// ============================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supaGet(table, query) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if (!res.ok) return [];
    return res.json();
  } catch (e) { return []; }
}

async function supaInsert(table, row) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(row)
    });
    return res.ok;
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Verify this is a cron call or admin
  const authHeader = req.headers.authorization;
  const isCron = authHeader === 'Bearer ' + process.env.CRON_SECRET;
  const isAdmin = req.query && req.query.admin === 'true';

  if (!isCron && !isAdmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get week boundaries (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    // Find active users (anyone who logged trades or chat this week)
    const recentEntries = await supaGet('journal_entries',
      'created_at=gte.' + weekAgoStr + '&select=user_id&limit=500'
    );

    if (!recentEntries || recentEntries.length === 0) {
      return res.status(200).json({ message: 'No active users this week', reports: 0 });
    }

    // Get unique user IDs
    const userIds = [];
    const seen = {};
    for (var i = 0; i < recentEntries.length; i++) {
      var uid = recentEntries[i].user_id;
      if (uid && !seen[uid]) {
        seen[uid] = true;
        userIds.push(uid);
      }
    }

    var reportsGenerated = 0;

    for (var u = 0; u < userIds.length; u++) {
      var userId = userIds[u];

      // Get this week's trades
      var trades = await supaGet('journal_entries',
        'user_id=eq.' + userId + '&type=eq.trade&created_at=gte.' + weekAgoStr + '&order=created_at.asc&select=content,symbol,created_at'
      );

      if (!trades || trades.length === 0) continue;

      // Compute stats
      var wins = 0, losses = 0, totalRR = 0, counted = 0;
      var symbols = {};
      var tradeDetails = [];

      for (var t = 0; t < trades.length; t++) {
        var data = {};
        try { data = JSON.parse(trades[t].content || '{}'); } catch (e) { continue; }

        var sym = (trades[t].symbol || data.symbol || '').toUpperCase();
        if (sym) symbols[sym] = (symbols[sym] || 0) + 1;

        var entry = parseFloat(data.entry);
        var exit = parseFloat(data.exit);
        var stop = parseFloat(data.stop);
        var dir = data.direction || 'long';

        if (entry && exit && stop) {
          var pnl = dir === 'long' ? exit - entry : entry - exit;
          var risk = dir === 'long' ? entry - stop : stop - entry;
          if (risk > 0) {
            var rr = pnl / risk;
            totalRR += rr;
            counted++;
            if (pnl > 0) wins++;
            else losses++;
            tradeDetails.push(sym + ' ' + dir + ': ' + (pnl > 0 ? '+' : '') + rr.toFixed(1) + 'R');
          }
        } else {
          tradeDetails.push(sym + ' ' + dir + ' (open)');
        }
      }

      var totalTrades = trades.length;
      var completedTrades = wins + losses;
      var winRate = completedTrades > 0 ? ((wins / completedTrades) * 100).toFixed(0) : 'N/A';
      var avgRR = counted > 0 ? (totalRR / counted).toFixed(2) : 'N/A';
      var topSymbols = Object.entries(symbols).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3).map(function(s) { return s[0]; }).join(', ');

      // Get mood data from chat entries this week
      var chats = await supaGet('journal_entries',
        'user_id=eq.' + userId + '&type=eq.ai_chat&created_at=gte.' + weekAgoStr + '&select=content&limit=50'
      );
      var moods = {};
      for (var c = 0; c < (chats || []).length; c++) {
        try {
          var chatData = JSON.parse(chats[c].content || '{}');
          if (chatData.mood) moods[chatData.mood] = (moods[chatData.mood] || 0) + 1;
        } catch (e) { /* skip */ }
      }
      var moodSummary = Object.entries(moods).sort(function(a, b) { return b[1] - a[1]; }).map(function(m) { return m[0] + '(' + m[1] + ')'; }).join(', ');

      // Generate AI summary using Groq
      var reportText = await generateReport(totalTrades, completedTrades, wins, losses, winRate, avgRR, topSymbols, tradeDetails, moodSummary);

      // Store the report
      await supaInsert('journal_entries', {
        user_id: userId,
        type: 'weekly_report',
        content: JSON.stringify({
          week_ending: now.toISOString().split('T')[0],
          total_trades: totalTrades,
          completed: completedTrades,
          wins: wins,
          losses: losses,
          win_rate: winRate,
          avg_rr: avgRR,
          top_symbols: topSymbols,
          mood_summary: moodSummary,
          report: reportText
        }),
        created_at: now.toISOString()
      });

      reportsGenerated++;
    }

    return res.status(200).json({
      message: 'Weekly reports generated',
      users: userIds.length,
      reports: reportsGenerated,
      timestamp: now.toISOString()
    });

  } catch (err) {
    console.error('[weekly-report] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function generateReport(total, completed, wins, losses, winRate, avgRR, topSymbols, details, moodSummary) {
  var prompt = 'You are an AI trading coach writing a weekly performance review. Be encouraging but honest. No section headers. Use short paragraphs.\n\n' +
    'Stats this week:\n' +
    '- Total trades: ' + total + '\n' +
    '- Completed: ' + completed + ' (Wins: ' + wins + ', Losses: ' + losses + ')\n' +
    '- Win rate: ' + winRate + '%\n' +
    '- Average R/R: ' + avgRR + '\n' +
    '- Top symbols: ' + topSymbols + '\n' +
    '- Trade log: ' + details.join('; ') + '\n' +
    (moodSummary ? '- Mood patterns: ' + moodSummary + '\n' : '') +
    '\nWrite a 4-5 sentence weekly summary highlighting one strength, one area to improve, and one goal for next week.';

  var GROQ_KEY = process.env.GROQ_API_KEY;
  if (GROQ_KEY) {
    try {
      var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 400, temperature: 0.7 })
      });
      if (r.ok) {
        var data = await r.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
      }
    } catch (e) { /* fallback */ }
  }

  // Static fallback
  return 'This week you took ' + total + ' trades with a ' + winRate + '% win rate and ' + avgRR + ' average R/R. ' +
    'Focus on consistency and sticking to your process next week.';
}
