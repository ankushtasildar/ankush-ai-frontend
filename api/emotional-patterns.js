// ============================================================
// ANKUSHAI EMOTIONAL PATTERN ENGINE
// ============================================================
// GET /api/emotional-patterns?userId=xxx
// Correlates mood data with trading outcomes
// Identifies: mood vs win rate, mood vs position sizing,
//             tilt detection, trading sabbatical triggers
// Used by: Journal AI context, Weekly Report, Trader Profile
// ============================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supaGet(table, query) {
  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if (!res.ok) return [];
    return res.json();
  } catch (e) { return []; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var userId = req.query && req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    // Get last 60 days of chat data (contains mood info)
    var sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    var chats = await supaGet('journal_entries',
      'user_id=eq.' + userId + '&type=eq.ai_chat&created_at=gte.' + sixtyDaysAgo + '&select=content,created_at&order=created_at.asc&limit=500'
    );

    // Get trades for outcome correlation
    var trades = await supaGet('journal_entries',
      'user_id=eq.' + userId + '&type=eq.trade&created_at=gte.' + sixtyDaysAgo + '&select=content,symbol,created_at&order=created_at.asc&limit=200'
    );

    // Extract mood data from chat entries
    var moodSessions = [];
    for (var c = 0; c < (chats || []).length; c++) {
      try {
        var chatData = JSON.parse(chats[c].content || '{}');
        if (chatData.mood) {
          moodSessions.push({
            mood: chatData.mood,
            date: chats[c].created_at.split('T')[0],
            timestamp: chats[c].created_at
          });
        }
      } catch (e) { /* skip */ }
    }

    // Extract trade outcomes
    var tradeOutcomes = [];
    for (var t = 0; t < (trades || []).length; t++) {
      try {
        var td = JSON.parse(trades[t].content || '{}');
        var entry = parseFloat(td.entry);
        var exit = parseFloat(td.exit);
        var stop = parseFloat(td.stop);
        if (entry && exit && stop) {
          var pnl = td.direction === 'short' ? entry - exit : exit - entry;
          var risk = td.direction === 'short' ? stop - entry : entry - stop;
          if (risk > 0) {
            tradeOutcomes.push({
              date: trades[t].created_at.split('T')[0],
              symbol: trades[t].symbol || td.symbol,
              rMultiple: parseFloat((pnl / risk).toFixed(2)),
              won: pnl > 0,
              timestamp: trades[t].created_at
            });
          }
        }
      } catch (e) { /* skip */ }
    }

    // Correlate: for each mood, find trades taken on the same day
    var moodByDay = {};
    for (var m = 0; m < moodSessions.length; m++) {
      moodByDay[moodSessions[m].date] = moodSessions[m].mood;
    }

    var moodCorrelation = {};
    var moods = ['calm', 'confident', 'neutral', 'anxious', 'tilted'];
    for (var mi = 0; mi < moods.length; mi++) {
      moodCorrelation[moods[mi]] = { wins: 0, losses: 0, totalRR: 0, count: 0 };
    }

    for (var to = 0; to < tradeOutcomes.length; to++) {
      var tradeMood = moodByDay[tradeOutcomes[to].date];
      if (tradeMood && moodCorrelation[tradeMood]) {
        moodCorrelation[tradeMood].count++;
        moodCorrelation[tradeMood].totalRR += tradeOutcomes[to].rMultiple;
        if (tradeOutcomes[to].won) moodCorrelation[tradeMood].wins++;
        else moodCorrelation[tradeMood].losses++;
      }
    }

    // Build mood stats
    var moodStats = {};
    for (var mk = 0; mk < moods.length; mk++) {
      var mood = moods[mk];
      var mc = moodCorrelation[mood];
      var total = mc.wins + mc.losses;
      if (total > 0) {
        moodStats[mood] = {
          trades: total,
          winRate: Math.round((mc.wins / total) * 100),
          avgRR: parseFloat((mc.totalRR / mc.count).toFixed(2)),
          expectancy: parseFloat(((mc.wins / total) * (mc.totalRR > 0 ? mc.totalRR / mc.count : 0) - (mc.losses / total)).toFixed(2))
        };
      }
    }

    // Tilt detection: 3+ trades in one day with escalating frequency
    var tradesByDay = {};
    for (var td2 = 0; td2 < tradeOutcomes.length; td2++) {
      var day = tradeOutcomes[td2].date;
      if (!tradesByDay[day]) tradesByDay[day] = [];
      tradesByDay[day].push(tradeOutcomes[td2]);
    }

    var tiltDays = [];
    Object.keys(tradesByDay).forEach(function(day) {
      var dayTrades = tradesByDay[day];
      if (dayTrades.length >= 3) {
        var dayLosses = dayTrades.filter(function(t2) { return !t2.won; }).length;
        var dayMood = moodByDay[day];
        if (dayLosses >= 2 || dayMood === 'tilted' || dayMood === 'anxious') {
          tiltDays.push({ date: day, trades: dayTrades.length, losses: dayLosses, mood: dayMood || 'unknown' });
        }
      }
    });

    // Trading sabbatical trigger: 3 consecutive loss days + negative mood
    var sabbaticalWarning = false;
    var dayKeys = Object.keys(tradesByDay).sort();
    if (dayKeys.length >= 3) {
      var lastThree = dayKeys.slice(-3);
      var allLosing = lastThree.every(function(day) {
        return tradesByDay[day].filter(function(t3) { return !t3.won; }).length > tradesByDay[day].filter(function(t3) { return t3.won; }).length;
      });
      var recentMoodNeg = lastThree.some(function(day) {
        return moodByDay[day] === 'tilted' || moodByDay[day] === 'anxious';
      });
      sabbaticalWarning = allLosing && recentMoodNeg;
    }

    // Generate insights
    var insights = [];
    Object.keys(moodStats).forEach(function(mood) {
      var stats = moodStats[mood];
      if (stats.trades >= 3) {
        if (mood === 'calm' || mood === 'confident') {
          if (stats.winRate >= 55) insights.push('Your ' + mood + ' trades have a ' + stats.winRate + '% win rate — this is your optimal state.');
          else insights.push('Even when ' + mood + ', your win rate is ' + stats.winRate + '% — consider what else might be affecting execution.');
        }
        if (mood === 'anxious' || mood === 'tilted') {
          if (stats.winRate < 40) insights.push('When ' + mood + ', your win rate drops to ' + stats.winRate + '%. Consider reducing size or stepping away in this state.');
        }
      }
    });

    if (sabbaticalWarning) {
      insights.push('SABBATICAL SIGNAL: 3 consecutive losing days with negative mood detected. A 24-48 hour break may help reset your decision-making.');
    }

    return res.status(200).json({
      userId: userId.substring(0, 8) + '...',
      period: 'last_60_days',
      moodSessions: moodSessions.length,
      tradeOutcomes: tradeOutcomes.length,
      moodStats: moodStats,
      tiltDays: tiltDays,
      sabbaticalWarning: sabbaticalWarning,
      insights: insights
    });

  } catch (err) {
    console.error('[emotional-patterns]', err.message);
    return res.status(500).json({ error: 'Analysis failed' });
  }
};
