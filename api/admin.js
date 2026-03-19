import { createClient } from '@supabase/supabase-js';

const ADMIN_SECRET = 'ankushai-admin-2024';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { action } = req.query;

  try {
    if (!action || action === 'users') {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // Parse body for POST actions
    let body = {};
    if (req.method === 'POST') {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch(e) { body = {}; }
    }

    if (action === 'toggle-plan') {
      const { userId, plan } = body;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const newPlan = plan === 'pro' ? 'free' : 'pro';
      const { error } = await supabase
        .from('profiles')
        .update({ plan: newPlan, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
      return res.status(200).json({ ok: true, newPlan });
    }

    if (action === 'create-code') {
      const { code } = body;
      if (!code) return res.status(400).json({ error: 'code required' });
      const { error } = await supabase
        .from('access_codes')
        .insert({ code: code.toUpperCase(), created_by: 'admin', is_active: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, code });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch(err) {
    console.error('Admin API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
