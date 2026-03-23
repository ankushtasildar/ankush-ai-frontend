// api/cron/cleanup-cache.js
// Alex Torres / DevOps — runs every 6 hours via Vercel cron
// Deletes stale symbol_analysis overlay rows older than 30 minutes
// Prevents the QQQ $500-entry incident from ever happening again via stale cache

const SUPA_URL = process.env.SUPABASE_URL || ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  try {
    // Delete chart v1 overlay caches (old format) and anything older than 30 min
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const r = await fetch(SUPA_URL + '/rest/v1/symbol_analysis?or=(symbol.like.*_overlay*,updated_at.lt.' + cutoff + ')', {
      method: 'DELETE',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, Prefer: 'return=representation' }
    })
    const deleted = await r.json().catch(() => [])
    const count = Array.isArray(deleted) ? deleted.length : 0
    console.log('[cache-cleanup] deleted', count, 'stale entries')
    return res.json({ deleted: count, cutoff, ts: new Date().toISOString() })
  } catch(e) {
    console.error('[cache-cleanup]', e.message)
    return res.status(500).json({ error: e.message })
  }
}