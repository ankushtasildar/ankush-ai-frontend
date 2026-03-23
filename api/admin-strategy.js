import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization' };

// Admin-only auth check
function isAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token === 'ankushai_admin_2025') return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email === 'ankushtasildar2@gmail.com';
  } catch { return false; }
}

// Sanitize input
function sanitize(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/ignore (all |previous |above )?(instructions?|prompts?|rules?)/gi, '[filtered]')
    .replace(/you are now|act as|pretend (you are|to be)|jailbreak/gi, '[filtered]')
    .substring(0, 6000);
}

export default async function handler(req, res) {
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAdmin(req)) return res.status(401).json({ error: 'Admin only' });

  const { message, history = [], action } = req.body || {};

  try {
    // Fetch live context to ground the strategy discussion
    const [mlRuns, patterns, setups] = await Promise.all([
      supabase.from('ml_training_runs')
        .select('symbol,analysis_date,engine_version,predicted_direction,thesis_validity,outcome_5d_pct,scoring_note')
        .order('started_at', { ascending: false })
        .limit(20)
        .then(r => r.data || []),
      supabase.from('ai_learned_patterns')
        .select('pattern_tag,lesson_learned,prompt_weight,occurrence_count')
        .order('prompt_weight', { ascending: false })
        .limit(10)
        .then(r => r.data || []),
      supabase.from('setup_records')
        .select('symbol,bias,confidence,setup_type,scan_date')
        .order('scan_date', { ascending: false })
        .limit(10)
        .then(r => r.data || [])
    ]);

    const systemPrompt = `You are AnkushAI's Chief Strategy Intelligence engine — a senior institutional trading strategist advising the platform founder directly.

LIVE PLATFORM DATA:
ML Training Runs (last 20): ${JSON.stringify(mlRuns, null, 2)}
Top AI Learned Patterns: ${JSON.stringify(patterns, null, 2)}
Recent Top Setups: ${JSON.stringify(setups, null, 2)}

YOUR ROLE:
- Analyze strategy discussions and provide actionable intelligence
- Reference specific patterns, symbols, and data points from the live platform data above
- When strategy decisions are made, identify which platform features and data inputs they should affect
- Flag conflicting signals between what the ML is learning vs what the setups suggest
- Propose specific changes to prompts, weights, or scan criteria when relevant

REAL-TIME IMPLEMENTATION:
When asked to implement a strategy decision, respond with:
1. The strategic reasoning
2. Specific code/config changes needed (as JSON in a "implementation" field)
3. Which Supabase tables or API endpoints need updating

Respond in JSON: { "response": "your analysis", "implementation": null | { "type": "prompt_weight|scan_param|pattern_boost", "changes": [...] }, "flags": [] }`;

    const msgs = [
      ...history.map(m => ({ role: m.role, content: sanitize(m.content) })),
      { role: 'user', content: sanitize(message) }
    ];

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: msgs
    });

    const raw = completion.content[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { response: raw, implementation: null, flags: [] }; }

    // If implementation changes requested, apply them
    if (parsed.implementation && action === 'apply') {
      const impl = parsed.implementation;
      if (impl.type === 'pattern_boost' && impl.changes) {
        for (const change of impl.changes) {
          await supabase.from('ai_learned_patterns')
            .update({ prompt_weight: change.weight })
            .eq('pattern_tag', change.pattern_tag);
        }
        parsed.applied = true;
      }
    }

    return res.status(200).json(parsed);

  } catch (e) {
    console.error('[admin-strategy]', e.message);
    return res.status(500).json({ error: e.message });
  }
}