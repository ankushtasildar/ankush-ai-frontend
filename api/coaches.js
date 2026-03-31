// ============================================================================
// ANKUSHAI COACHING MARKETPLACE API
// ============================================================================
// Phase 2 of the Coaching Marketplace vision.
// Coaches register with their expertise, pricing, and bio.
// Users browse, filter, and eventually hire coaches.
// AnkushAI earns revenue share on coaching fees.
//
// Actions:
//   POST ?action=register       — Coach registers their profile
//   GET  ?action=browse          — Browse/search coaches (with filters)
//   GET  ?action=profile&id=X    — View a specific coach profile
//   POST ?action=rate            — Rate a coach after session
//   GET  ?action=match           — AI recommends best coach for user's needs
// ============================================================================

var SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var GROQ_KEY = process.env.GROQ_API_KEY || '';

async function supaInsert(table, row) {
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(row)
    });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

async function supaGet(table, query) {
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    return r.ok ? r.json() : [];
  } catch (e) { return []; }
}

// REGISTER: Coach creates their profile
async function registerCoach(body) {
  var name = body.name || '';
  var bio = body.bio || '';
  var specialties = body.specialties || []; // e.g. ['options', 'day_trading', 'the_strat']
  var experience = body.experience || '';   // e.g. '5 years', 'institutional'
  var pricing = body.pricing || {};         // e.g. { monthly: 99, hourly: 50 }
  var contact = body.contact || '';         // discord, twitter, etc
  var userId = body.userId || '';

  if (!name || !bio || specialties.length === 0) {
    return { error: 'name, bio, and specialties[] are required' };
  }

  var profile = {
    name: name,
    bio: bio.substring(0, 1000),
    specialties: specialties,
    experience: experience,
    pricing: pricing,
    contact: contact,
    rating: 0,
    ratingCount: 0,
    students: 0,
    verified: false,
    createdAt: new Date().toISOString()
  };

  var row = {
    user_id: userId || 'coach_' + Date.now(),
    type: 'coach_profile',
    symbol: 'marketplace',
    content: JSON.stringify(profile),
    created_at: new Date().toISOString()
  };

  var result = await supaInsert('journal_entries', row);
  return { success: !!result, profile: profile };
}

// BROWSE: List coaches with optional filters
async function browseCoaches(query) {
  var specialty = query.specialty || '';
  var sortBy = query.sort || 'rating'; // rating, students, newest

  var coaches = await supaGet('journal_entries', 'type=eq.coach_profile&select=id,user_id,content,created_at&order=created_at.desc&limit=50');

  var parsed = coaches.map(function(c) {
    try {
      var d = JSON.parse(c.content || '{}');
      d.id = c.id;
      d.userId = c.user_id;
      return d;
    } catch(e) { return null; }
  }).filter(function(c) { return c && c.name; });

  // Filter by specialty
  if (specialty) {
    parsed = parsed.filter(function(c) {
      return c.specialties && c.specialties.some(function(s) {
        return s.toLowerCase().includes(specialty.toLowerCase());
      });
    });
  }

  // Sort
  if (sortBy === 'rating') parsed.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
  if (sortBy === 'students') parsed.sort(function(a, b) { return (b.students || 0) - (a.students || 0); });

  return { coaches: parsed, total: parsed.length, filters: { specialty: specialty, sort: sortBy } };
}

// PROFILE: Get a specific coach
async function getProfile(id) {
  var coaches = await supaGet('journal_entries', 'id=eq.' + id + '&type=eq.coach_profile&select=content,user_id');
  if (!coaches || coaches.length === 0) return { error: 'Coach not found' };
  try {
    var d = JSON.parse(coaches[0].content || '{}');
    d.userId = coaches[0].user_id;
    d.id = id;
    return d;
  } catch(e) { return { error: 'Parse error' }; }
}

// RATE: User rates a coach
async function rateCoach(body) {
  var coachId = body.coachId;
  var rating = Math.min(5, Math.max(1, parseInt(body.rating) || 0));
  var review = (body.review || '').substring(0, 500);

  if (!coachId || !rating) return { error: 'coachId and rating (1-5) required' };

  // Store the rating
  await supaInsert('journal_entries', {
    user_id: body.userId || 'anon',
    type: 'coach_rating',
    symbol: String(coachId),
    content: JSON.stringify({ coachId: coachId, rating: rating, review: review, date: new Date().toISOString() }),
    created_at: new Date().toISOString()
  });

  // Recalculate average rating
  var ratings = await supaGet('journal_entries', 'type=eq.coach_rating&symbol=eq.' + coachId + '&select=content');
  var total = 0, count = 0;
  ratings.forEach(function(r) {
    try { var d = JSON.parse(r.content || '{}'); total += d.rating || 0; count++; } catch(e) {}
  });
  var avgRating = count > 0 ? +(total / count).toFixed(1) : 0;

  return { success: true, newRating: avgRating, totalRatings: count };
}

// MATCH: AI recommends the best coach for a user
async function matchCoach(query) {
  var userId = query.userId || 'ankush';
  var need = query.need || ''; // e.g. 'options day trading', 'psychology help', 'the strat'

  // Get user's recent trade data for context
  var trades = await supaGet('journal_entries', 'type=eq.trade&user_id=eq.' + userId + '&order=created_at.desc&limit=20&select=content');
  var tradeContext = trades.map(function(t) {
    try { return JSON.parse(t.content || '{}'); } catch(e) { return {}; }
  }).filter(function(t) { return t.symbol; });

  // Get all coaches
  var coachResult = await browseCoaches({});
  if (!coachResult.coaches || coachResult.coaches.length === 0) {
    return { recommendation: null, reason: 'No coaches available yet. Be the first to register!', registrationUrl: '/app/coaches?action=register' };
  }

  if (!GROQ_KEY) return { coaches: coachResult.coaches.slice(0, 3), reason: 'Top 3 coaches by rating (AI matching unavailable)' };

  var prompt = 'Given this trader profile and available coaches, recommend the best match.\n\n' +
    'TRADER NEED: ' + (need || 'general improvement') + '\n' +
    'RECENT TRADES: ' + JSON.stringify(tradeContext.slice(0, 5)) + '\n' +
    'AVAILABLE COACHES:\n' + coachResult.coaches.map(function(c, i) {
      return (i+1) + '. ' + c.name + ' - Specialties: ' + (c.specialties || []).join(', ') + ' - Rating: ' + (c.rating || 'new') + ' - ' + c.bio.substring(0, 100);
    }).join('\n') + '\n\n' +
    'Return JSON: {"topMatch":{"name":"...","reason":"why this coach fits"},"alternatives":[{"name":"...","reason":"..."}]}';

  try {
    var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 400, messages: [{ role: 'system', content: 'You match traders with coaches. Return JSON only.' }, { role: 'user', content: prompt }] })
    });
    var d = await r.json();
    var txt = d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
    try { return JSON.parse(txt.replace(/```json\n?/g, '').replace(/```/g, '').trim()); }
    catch(e) { var m = txt.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { raw: txt.substring(0, 300) }; }
  } catch(e) { return { coaches: coachResult.coaches.slice(0, 3), reason: 'AI matching error: ' + e.message }; }
}

// MAIN HANDLER
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    if (action === 'register' && req.method === 'POST') return res.json(await registerCoach(req.body));
    if (action === 'browse') return res.json(await browseCoaches(req.query));
    if (action === 'profile' && req.query.id) return res.json(await getProfile(req.query.id));
    if (action === 'rate' && req.method === 'POST') return res.json(await rateCoach(req.body));
    if (action === 'match') return res.json(await matchCoach(req.query));
    return res.status(400).json({
      error: 'action required: register, browse, profile, rate, match',
      usage: {
        register: 'POST {name, bio, specialties:[], experience, pricing:{monthly,hourly}, contact}',
        browse: 'GET ?specialty=options&sort=rating',
        profile: 'GET ?id=coach_id',
        rate: 'POST {coachId, rating:1-5, review}',
        match: 'GET ?userId=X&need=options day trading'
      }
    });
  } catch (err) {
    console.error('[coaches]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
