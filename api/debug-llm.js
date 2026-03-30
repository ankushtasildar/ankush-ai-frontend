module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const results = {};

  // Check env vars exist
  results.groqKeyExists = !!process.env.GROQ_API_KEY;
  results.groqKeyPrefix = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.substring(0, 8) : 'missing';
  results.nvidiaKeyExists = !!process.env.NVIDIA_API_KEY;
  results.anthropicKeyExists = !!process.env.ANTHROPIC_API_KEY;

  // Test Groq
  try {
    const start = Date.now();
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Say hi in 3 words' }], max_tokens: 20 })
    });
    results.groqStatus = r.status;
    results.groqMs = Date.now() - start;
    const body = await r.text();
    results.groqBody = body.substring(0, 300);
  } catch (e) {
    results.groqError = e.message;
  }

  // Test NVIDIA
  try {
    const start = Date.now();
    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.NVIDIA_API_KEY },
      body: JSON.stringify({ model: 'meta/llama-3.3-70b-instruct', messages: [{ role: 'user', content: 'Say hi in 3 words' }], max_tokens: 20 })
    });
    results.nvidiaStatus = r.status;
    results.nvidiaMs = Date.now() - start;
    const body = await r.text();
    results.nvidiaBody = body.substring(0, 300);
  } catch (e) {
    results.nvidiaError = e.message;
  }

  res.status(200).json(results);
};