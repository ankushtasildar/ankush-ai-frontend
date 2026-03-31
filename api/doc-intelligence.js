// ============================================================================
// ANKUSHAI DOCUMENT INTELLIGENCE API
// ============================================================================
// CEO uploads past weekly recap / watchlist PDFs. The AI:
//   1. Analyzes the FORMAT, structure, sections, and style
//   2. Stores the template pattern in Supabase
//   3. Generates NEW versions with current market data
//
// Actions:
//   POST ?action=upload_template   — Store a document template (text content)
//   GET  ?action=list_templates    — List all stored templates
//   POST ?action=generate          — Generate a new doc from template + live data
//   GET  ?action=preview&id=X      — Preview a specific template
// ============================================================================

var SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var GROQ_KEY = process.env.GROQ_API_KEY || '';
var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
var POLYGON = process.env.POLYGON_API_KEY || '';

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

// Fetch current market data for document generation
async function getMarketContext() {
  var ctx = { spy: null, qqq: null, vix: null, sectors: [], topMovers: [], date: new Date().toISOString().split('T')[0] };
  try {
    var r = await fetch('https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/' + ctx.date + '?adjusted=true&apiKey=' + POLYGON);
    if (r.ok) {
      var d = await r.json();
      var results = d.results || [];
      var tickers = {};
      results.forEach(function(t) { tickers[t.T] = t; });
      if (tickers['SPY']) ctx.spy = { price: tickers['SPY'].c, change: tickers['SPY'].c - tickers['SPY'].o, changePct: +((tickers['SPY'].c - tickers['SPY'].o) / tickers['SPY'].o * 100).toFixed(2) };
      if (tickers['QQQ']) ctx.qqq = { price: tickers['QQQ'].c, change: tickers['QQQ'].c - tickers['QQQ'].o, changePct: +((tickers['QQQ'].c - tickers['QQQ'].o) / tickers['QQQ'].o * 100).toFixed(2) };
    }
  } catch (e) {}
  // VIX
  try {
    var vr = await fetch('https://api.polygon.io/v2/aggs/ticker/VIX/prev?adjusted=true&apiKey=' + POLYGON);
    if (vr.ok) { var vd = await vr.json(); if (vd.results && vd.results[0]) ctx.vix = vd.results[0].c; }
  } catch (e) {}
  return ctx;
}

// LLM call (Groq-first)
async function llmCall(system, prompt, maxTokens) {
  maxTokens = maxTokens || 2000;
  if (GROQ_KEY) {
    try {
      var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] })
      });
      var d = await r.json();
      return d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
    } catch (e) {}
  }
  if (ANTHROPIC_KEY) {
    try {
      var r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system: system, messages: [{ role: 'user', content: prompt }] })
      });
      var d = await r.json();
      return d.content && d.content[0] ? d.content[0].text : '';
    } catch (e) {}
  }
  return '';
}

// UPLOAD TEMPLATE: Analyze a document's structure and store the pattern
async function uploadTemplate(body) {
  var content = body.content || '';
  var title = body.title || 'Untitled Template';
  var docType = body.type || 'weekly_recap'; // weekly_recap, watchlist, market_brief

  if (!content || content.length < 100) return { error: 'Content too short. Paste the full text of your document.' };

  // Use AI to analyze the document structure
  var analysis = await llmCall(
    'You analyze document templates for financial newsletters. Identify the exact structure, sections, formatting patterns, and tone. Return JSON only.',
    'Analyze this document template. Identify every section, its purpose, the data it uses, and the writing style.\n\nDOCUMENT:\n' + content.substring(0, 8000) + '\n\nReturn JSON:\n{"sections":[{"name":"section name","purpose":"what this section does","dataNeeded":"what market data this section requires","format":"how it is formatted (bullet points, paragraphs, tables, etc)","sampleLength":"approximate word count"}],"overallTone":"professional/casual/analytical/etc","targetAudience":"who this is for","frequency":"daily/weekly/monthly","keyMetrics":["list of specific metrics referenced"],"uniqueStyle":"what makes this document distinctive"}',
    1000
  );

  var parsedAnalysis = {};
  try { parsedAnalysis = JSON.parse(analysis.replace(/```json\n?/g, '').replace(/```/g, '').trim()); }
  catch (e) { var m = analysis.match(/\{[\s\S]*\}/); if (m) try { parsedAnalysis = JSON.parse(m[0]); } catch (e2) {} }

  // Store in Supabase
  var row = {
    user_id: body.userId || 'ankush',
    type: 'doc_template',
    symbol: docType,
    content: JSON.stringify({
      title: title,
      docType: docType,
      originalContent: content.substring(0, 15000),
      analysis: parsedAnalysis,
      uploadedAt: new Date().toISOString()
    }),
    created_at: new Date().toISOString()
  };

  var result = await supaInsert('journal_entries', row);
  return { success: !!result, title: title, type: docType, analysis: parsedAnalysis };
}

// LIST TEMPLATES
async function listTemplates(userId) {
  var templates = await supaGet('journal_entries', 'type=eq.doc_template&user_id=eq.' + (userId || 'ankush') + '&select=id,symbol,content,created_at&order=created_at.desc&limit=20');
  return templates.map(function(t) {
    try {
      var d = JSON.parse(t.content || '{}');
      return { id: t.id, title: d.title, type: d.docType, sections: d.analysis && d.analysis.sections ? d.analysis.sections.length : 0, uploadedAt: d.uploadedAt };
    } catch (e) { return { id: t.id, title: 'Unknown', type: t.symbol }; }
  });
}

// GENERATE: Create a new document from template + live market data
async function generateFromTemplate(body) {
  var templateId = body.templateId;
  if (!templateId) return { error: 'templateId required' };

  // Fetch the template
  var templates = await supaGet('journal_entries', 'id=eq.' + templateId + '&type=eq.doc_template&select=content');
  if (!templates || templates.length === 0) return { error: 'Template not found' };

  var template;
  try { template = JSON.parse(templates[0].content || '{}'); } catch (e) { return { error: 'Invalid template' }; }

  // Fetch current market data
  var marketCtx = await getMarketContext();

  // Fetch user's recent trades for personalization
  var recentTrades = await supaGet('journal_entries', 'type=eq.trade&user_id=eq.' + (body.userId || 'ankush') + '&order=created_at.desc&limit=10&select=content,created_at');
  var tradesContext = recentTrades.map(function(t) {
    try { return JSON.parse(t.content || '{}'); } catch (e) { return {}; }
  }).filter(function(t) { return t.symbol; });

  // Generate the document
  var prompt = 'Generate a new document following this EXACT template structure and style.\n\n' +
    'TEMPLATE ANALYSIS:\n' + JSON.stringify(template.analysis) + '\n\n' +
    'ORIGINAL DOCUMENT (for style reference):\n' + (template.originalContent || '').substring(0, 5000) + '\n\n' +
    'CURRENT MARKET DATA:\n' +
    'Date: ' + marketCtx.date + '\n' +
    'SPY: ' + JSON.stringify(marketCtx.spy) + '\n' +
    'QQQ: ' + JSON.stringify(marketCtx.qqq) + '\n' +
    'VIX: ' + marketCtx.vix + '\n\n' +
    'USER RECENT TRADES:\n' + JSON.stringify(tradesContext.slice(0, 5)) + '\n\n' +
    'Generate the FULL document matching the template structure, tone, and style exactly. Use CURRENT market data. Be specific with real prices and levels. If the template has watchlist picks, provide current actionable picks with specific entry/exit levels.';

  var generated = await llmCall(
    'You are a professional financial content writer. You replicate document templates perfectly, substituting current market data while maintaining the exact style, structure, and tone of the original.',
    prompt,
    3000
  );

  // Store the generated document
  var genRow = {
    user_id: body.userId || 'ankush',
    type: 'generated_doc',
    symbol: template.docType || 'weekly_recap',
    content: JSON.stringify({
      templateId: templateId,
      templateTitle: template.title,
      generatedContent: generated,
      marketContext: marketCtx,
      generatedAt: new Date().toISOString()
    }),
    created_at: new Date().toISOString()
  };
  await supaInsert('journal_entries', genRow);

  return { success: true, title: template.title, type: template.docType, content: generated, marketData: marketCtx };
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
    if (action === 'upload_template' && req.method === 'POST') return res.json(await uploadTemplate(req.body));
    if (action === 'list_templates') return res.json(await listTemplates(req.query.userId));
    if (action === 'generate' && req.method === 'POST') return res.json(await generateFromTemplate(req.body));
    if (action === 'preview' && req.query.id) {
      var templates = await supaGet('journal_entries', 'id=eq.' + req.query.id + '&type=eq.doc_template&select=content');
      if (templates && templates.length > 0) {
        try { return res.json(JSON.parse(templates[0].content || '{}')); }
        catch (e) { return res.json({ error: 'Parse error' }); }
      }
      return res.status(404).json({ error: 'Template not found' });
    }
    return res.status(400).json({
      error: 'action required: upload_template, list_templates, generate, preview',
      usage: {
        upload_template: 'POST {title, content, type: "weekly_recap"|"watchlist"|"market_brief"}',
        list_templates: 'GET ?userId=ankush',
        generate: 'POST {templateId, userId}',
        preview: 'GET ?id=template_id'
      }
    });
  } catch (err) {
    console.error('[doc-intelligence]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
