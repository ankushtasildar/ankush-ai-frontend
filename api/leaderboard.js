// ============================================================
// ANKUSHAI COMMUNITY LEADERBOARD API
// ============================================================
// GET /api/leaderboard — anonymous improvement metrics
// NOT P&L based — process improvement only
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

function hashId(id) {
  var h = 0;
  for (var i = 0; i < id.length; i++) { h = ((h << 5) - h) + id.charCodeAt(i); h = h & h; }
  return 'Trader-' + Math.abs(h).toString(36).substring(0, 6).toUpperCase();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    var trades = await supaGet('journal_entries', 'type=eq.trade&created_at=gte.' + thirtyDaysAgo + '&select=user_id,content,created_at&limit=1000');
    var chats = await supaGet('journal_entries', 'type=eq.ai_chat&created_at=gte.' + thirtyDaysAgo + '&select=user_id,created_at&limit=2000');

    var users = {};
    for (var t = 0; t < (trades || []).length; t++) {
      var uid = trades[t].user_id;
      if (!uid || uid.startsWith('system')) continue;
      if (!users[uid]) users[uid] = { trades: 0, chatDays: {}, wins: 0, losses: 0, totalRR: 0, counted: 0 };
      users[uid].trades++;
      try {
        var d = JSON.parse(trades[t].content || '{}');
        var entry = parseFloat(d.entry), exit = parseFloat(d.exit), stop = parseFloat(d.stop);
        if (entry && exit && stop) {
          var pnl = d.direction === 'short' ? entry - exit : exit - entry;
          var risk = d.direction === 'short' ? stop - entry : entry - stop;
          if (risk > 0) { users[uid].totalRR += pnl / risk; users[uid].counted++; if (pnl > 0) users[uid].wins++; else users[uid].losses++; }
        }
      } catch (e) {}
    }

    for (var c = 0; c < (chats || []).length; c++) {
      var cuid = chats[c].user_id;
      if (!cuid || cuid.startsWith('system')) continue;
      if (!users[cuid]) users[cuid] = { trades: 0, chatDays: {}, wins: 0, losses: 0, totalRR: 0, counted: 0 };
      users[cuid].chatDays[chats[c].created_at.split('T')[0]] = true;
    }

    var board = [];
    Object.keys(users).forEach(function(id) {
      var u = users[id];
      var days = Object.keys(u.chatDays).sort();
      var streak = 0, cur = 1;
      for (var i = 1; i < days.length; i++) {
        var diff = (new Date(days[i]) - new Date(days[i-1])) / 86400000;
        if (diff <= 1.5) cur++; else { if (cur > streak) streak = cur; cur = 1; }
      }
      if (cur > streak) streak = cur;
      var total = u.wins + u.losses;
      var wr = total > 0 ? Math.round(u.wins / total * 100) : null;
      var rr = u.counted > 0 ? parseFloat((u.totalRR / u.counted).toFixed(2)) : null;
      var grade = total < 5 ? 'N/A' : (wr >= 55 && rr >= 1.5) ? 'A' : (wr >= 50 && rr >= 1) ? 'B' : (wr >= 40) ? 'C' : 'D';

      if (days.length >= 2 || total >= 3) {
        board.push({ id: hashId(id), streak: streak, activeDays: days.length, trades: u.trades, completed: total, winRate: wr, avgRR: rr, grade: grade });
      }
    });

    board.sort(function(a, b) { return b.streak - a.streak; });

    return res.status(200).json({ period: 'last_30_days', total: board.length, leaderboard: board.slice(0, 20) });
  } catch (err) {
    console.error('[leaderboard]', err.message);
    return res.status(500).json({ error: 'Leaderboard unavailable' });
  }
};
