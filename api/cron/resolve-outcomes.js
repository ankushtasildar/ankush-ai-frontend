import Anthropic from '@anthropic-ai/sdk'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const POLY_KEY = process.env.POLYGON_API_KEY

async function supaGet(table, query='') {
  const r = await fetch(SUPA_URL+'/rest/v1/'+table+'?'+query, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer '+SUPA_KEY }
  })
  return r.json()
}

async function supaUpsert(table, rows) {
  return fetch(SUPA_URL+'/rest/v1/'+table, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer '+SUPA_KEY,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  })
}

async function getClosePrice(symbol) {
  // Get yesterday's close (most recent trading day)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  // Skip weekends
  while (yesterday.getDay() === 0 || yesterday.getDay() === 6) {
    yesterday.setDate(yesterday.getDate() - 1)
  }
  const d = yesterday.toISOString().split('T')[0]
  const r = await fetch(
    'https://api.polygon.io/v1/open-close/'+symbol+'/'+d+'?adjusted=true&apiKey='+POLY_KEY
  )
  const data = await r.json()
  return data.close || null
}

export default async function handler(req, res) {
  // Only allow cron invocations or admin
  const auth = req.headers.authorization
  if (req.method !== 'GET') return res.status(405).end()

  console.log('[outcome-cron] starting resolution run')

  try {
    // Get all unresolved predictions older than 1 day
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const cutoff = yesterday.toISOString()

    const records = await supaGet('setup_records',
      'select=id,symbol,bias,target_1,stop_loss,price_at_generation,created_at&resolved_at=is.null&created_at=lt.'+cutoff+'&limit=50'
    )

    if (!Array.isArray(records) || records.length === 0) {
      console.log('[outcome-cron] no unresolved records')
      return res.json({ resolved: 0 })
    }

    console.log('[outcome-cron] resolving', records.length, 'records')
    let resolved = 0

    for (const rec of records) {
      try {
        const closePrice = await getClosePrice(rec.symbol)
        if (!closePrice) continue

        const entry = rec.price_at_generation
        const target = rec.target_1
        const stop = rec.stop_loss

        let outcome = 'open'
        let pnlPct = null

        if (entry && target && closePrice >= target) {
          outcome = 'target_hit'
          pnlPct = ((target - entry) / entry * 100)
        } else if (entry && stop && closePrice <= stop) {
          outcome = 'stopped_out'
          pnlPct = ((stop - entry) / entry * 100)
        } else if (entry) {
          pnlPct = ((closePrice - entry) / entry * 100)
          outcome = 'open'
        }

        // Write to setup_outcomes
        await supaUpsert('setup_outcomes', [{
          setup_record_id: rec.id,
          symbol: rec.symbol,
          outcome,
          close_price: closePrice,
          pnl_pct: pnlPct ? parseFloat(pnlPct.toFixed(2)) : null,
          resolved_at: new Date().toISOString()
        }])

        // Mark as resolved in setup_records
        await fetch(SUPA_URL+'/rest/v1/setup_records?id=eq.'+rec.id, {
          method: 'PATCH',
          headers: { apikey: SUPA_KEY, Authorization: 'Bearer '+SUPA_KEY,
            'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ resolved_at: new Date().toISOString() })
        })

        resolved++
      } catch(e) {
        console.error('[outcome-cron] error for', rec.symbol, e.message)
      }
    }

    console.log('[outcome-cron] resolved', resolved, 'of', records.length)
    res.json({ resolved, total: records.length })
  } catch(e) {
    console.error('[outcome-cron] fatal:', e.message)
    res.status(500).json({ error: e.message })
  }
}