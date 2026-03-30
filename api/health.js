// ============================================================
// ANKUSHAI HEALTH DASHBOARD API
// ============================================================
// Returns status of all API endpoints + provider health
// Used by: /app/admin/health dashboard
// ============================================================

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var results = {
    timestamp: new Date().toISOString(),
    endpoints: {},
    providers: {},
    envVars: {}
  };

  // Check env vars exist (never expose values)
  var envKeys = ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'NVIDIA_API_KEY', 'POLYGON_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY'];
  for (var i = 0; i < envKeys.length; i++) {
    results.envVars[envKeys[i]] = !!process.env[envKeys[i]];
  }

  // Test endpoints with timeout
  async function testEndpoint(name, url, method, body) {
    var start = Date.now();
    try {
      var opts = { method: method || 'GET' };
      if (body) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
      var controller = new AbortController();
      var timer = setTimeout(function() { controller.abort(); }, 9000);
      opts.signal = controller.signal;
      var r = await fetch(url, opts);
      clearTimeout(timer);
      var ms = Date.now() - start;
      results.endpoints[name] = { status: r.status, ms: ms, ok: r.status >= 200 && r.status < 400 };
    } catch (e) {
      results.endpoints[name] = { status: 0, ms: Date.now() - start, ok: false, error: e.message.substring(0, 60) };
    }
  }

  var baseUrl = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://www.ankushai.org';

  // Test all endpoints in parallel
  await Promise.all([
    testEndpoint('market', baseUrl + '/api/market?action=quote&symbol=SPY', 'GET'),
    testEndpoint('sentiment', baseUrl + '/api/sentiment', 'GET'),
    testEndpoint('journal-ai', baseUrl + '/api/journal-ai', 'POST', { message: 'health check', history: [], userId: 'health-monitor' }),
  ]);

  // Test LLM providers directly
  // Groq
  var groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    var gs = Date.now();
    try {
      var gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'ok' }], max_tokens: 5 })
      });
      results.providers.groq = { status: gr.status, ms: Date.now() - gs, ok: gr.ok };
    } catch (e) {
      results.providers.groq = { status: 0, ms: Date.now() - gs, ok: false, error: e.message.substring(0, 60) };
    }
  } else {
    results.providers.groq = { status: 0, ok: false, error: 'No API key' };
  }

  // Overall health
  var allOk = true;
  var keys = Object.keys(results.endpoints);
  for (var k = 0; k < keys.length; k++) {
    if (!results.endpoints[keys[k]].ok) allOk = false;
  }
  results.healthy = allOk;

  return res.status(200).json(results);
};
