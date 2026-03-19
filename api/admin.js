import { createClient } from '@supabase/supabase-js';

const ADMIN_SECRET = 'ankushai-admin-2024';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify admin secret from header
  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { action } = req.query;

  try {
    if (action === 'users' || !action) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (action === 'toggle-plan') {
      const { userId, plan } = req.body || JSON.parse(req.body || '{}');
      const newPlan = plan === 'pro' ? 'free' : 'pro';
      const { error } = await supabase
        .from('profiles')
        .update({ plan: newPlan, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
      return res.status(200).json({ ok: true, newPlan });
    }

    if (action === 'create-code') {
      const { code } = req.body || JSON.parse(req.body || '{}');
      const { error } = await supabase
        .from('access_codes')
        .insert({ code: code.toUpperCase(), created_by: 'admin', is_active: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, code });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
