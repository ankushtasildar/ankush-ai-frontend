// Priya: Scan limit enforcement - free users get 2 scans/day, Pro = unlimited
const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const FREE_DAILY_LIMIT = 2

async function supaFetch(path, opts={}) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  })
  return r.json()
}

export async function checkScanLimit(userId) {
  if (!userId) return { allowed: true, remaining: FREE_DAILY_LIMIT } // unauthenticated - let through, gate elsewhere

  // Check if Pro subscriber
  const subs = await supaFetch('subscriptions?user_id=eq.' + userId + '&status=eq.active&select=id')
  if (Array.isArray(subs) && subs.length > 0) return { allowed: true, remaining: 999, isPro: true }

  // Check today's scan count
  const today = new Date().toISOString().split('T')[0]
  const usage = await supaFetch('scan_usage?user_id=eq.' + userId + '&date=eq.' + today + '&select=scan_count')
  const count = Array.isArray(usage) && usage.length > 0 ? usage[0].scan_count : 0

  if (count >= FREE_DAILY_LIMIT) {
    return { allowed: false, remaining: 0, used: count, limit: FREE_DAILY_LIMIT }
  }
  return { allowed: true, remaining: FREE_DAILY_LIMIT - count, used: count, limit: FREE_DAILY_LIMIT }
}

export async function incrementScanCount(userId) {
  if (!userId) return
  const today = new Date().toISOString().split('T')[0]
  // Upsert scan_usage row
  await fetch(SUPA_URL + '/rest/v1/scan_usage', {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ user_id: userId, date: today, scan_count: 1, updated_at: new Date().toISOString() })
  })
  // If row existed, increment it
  await fetch(SUPA_URL + '/rest/v1/rpc/increment_scan_count', {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId, p_date: today })
  }).catch(() => {}) // RPC may not exist yet - upsert handles creation
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const userId = req.query.userId || req.headers['x-user-id']
  const action = req.query.action

  if (action === 'check') {
    const result = await checkScanLimit(userId)
    return res.json(result)
  }
  if (action === 'increment') {
    await incrementScanCount(userId)
    return res.json({ ok: true })
  }
  res.status(400).json({ error: 'action required: check | increment' })
}