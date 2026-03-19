/**
 * /api/macro-calendar — Upcoming macro events relevant to traders
 *
 * Sources (all free):
 * - Fed meeting dates: hardcoded 2026 schedule (FOMC publishes annually)
 * - Earnings: Yahoo Finance earnings calendar
 * - Key economic events: hardcoded major ones
 *
 * Returns events in the next 30 days, sorted by date
 */

// 2026 FOMC meeting dates (published by Federal Reserve)
const FOMC_2026 = [
  '2026-01-28', '2026-01-29', // Jan
  '2026-03-17', '2026-03-18', // Mar — decision day is 2nd day
  '2026-04-28', '2026-04-29', // Apr
  '2026-06-09', '2026-06-10', // Jun
  '2026-07-28', '2026-07-29', // Jul
  '2026-09-15', '2026-09-16', // Sep
  '2026-10-27', '2026-10-28', // Oct
  '2026-12-15', '2026-12-16', // Dec
].filter((_, i) => i % 2 === 1) // Keep decision days (2nd day of each pair)

// Key economic events (approximate dates — monthly recurring)
function getEconomicEvents(from, to) {
  const events = []
  const now = new Date(from)
  const end = new Date(to)

  // CPI typically releases around 10th-13th of each month
  // Jobs report first Friday of each month
  // PCE typically last Friday of each month
  // These are approximate — real platform would use FRED or Quandl
  for (let d = new Date(now); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay() // 0=Sun, 6=Sat
    const date = d.toISOString().split('T')[0]
    const dom = d.getDate() // day of month

    // First Friday = Jobs Report (Non-Farm Payrolls)
    if (day === 5 && dom <= 7) {
      events.push({ date, type:'economic', name:'Non-Farm Payrolls', importance:'high', description:'Monthly jobs report. Major market mover.' })
    }

    // ~10th-13th = CPI release (approximate)
    if (dom === 12 && day >= 1 && day <= 5) {
      events.push({ date, type:'economic', name:'CPI Report', importance:'high', description:'Consumer Price Index — core inflation gauge.' })
    }

    // Last Friday of month = PCE
    const nextWeek = new Date(d); nextWeek.setDate(dom + 7)
    if (day === 5 && nextWeek.getMonth() !== d.getMonth()) {
      events.push({ date, type:'economic', name:'PCE Inflation', importance:'high', description:'Fed\'s preferred inflation metric.' })
    }
  }
  return events
}

async function getUpcomingEarnings(symbols) {
  // Yahoo Finance earnings calendar for specific symbols
  try {
    const results = []
    for (const sym of symbols.slice(0, 5)) { // limit to avoid rate limits
      try {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=calendarEvents`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.yahoo.com' },
            signal: AbortSignal.timeout(4000)
          }
        )
        if (!r.ok) continue
        const d = await r.json()
        const earnings = d?.quoteSummary?.result?.[0]?.calendarEvents?.earnings
        const earningsDate = earnings?.earningsDate?.[0]?.raw
        if (earningsDate) {
          const date = new Date(earningsDate * 1000).toISOString().split('T')[0]
          results.push({ date, type:'earnings', name:`${sym} Earnings`, symbol: sym, importance:'high', description:`${sym} quarterly earnings report.` })
        }
      } catch(e) {}
    }
    return results
  } catch(e) { return [] }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=3600') // Cache 1 hour
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const { days = '30', symbols = 'AAPL,MSFT,NVDA,TSLA,META,AMZN,GOOGL,AMD' } = req.query
  const numDays = Math.min(90, parseInt(days) || 30)

  const now = new Date()
  const future = new Date(now); future.setDate(future.getDate() + numDays)
  const fromStr = now.toISOString().split('T')[0]
  const toStr = future.toISOString().split('T')[0]

  // FOMC dates in range
  const fomcEvents = FOMC_2026
    .filter(d => d >= fromStr && d <= toStr)
    .map(d => ({ date: d, type:'fomc', name:'FOMC Decision', importance:'critical', description:'Federal Reserve interest rate decision. Expect high volatility.' }))

  // Economic events
  const ecoEvents = getEconomicEvents(fromStr, toStr)

  // Earnings (async)
  const syms = symbols.split(',').map(s => s.trim().toUpperCase())
  const earningsEvents = await getUpcomingEarnings(syms)

  // Combine + sort
  const all = [...fomcEvents, ...ecoEvents, ...earningsEvents]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((e, i, arr) => arr.findIndex(x => x.date === e.date && x.name === e.name) === i) // dedupe

  return res.status(200).json({
    events: all,
    range: { from: fromStr, to: toStr, days: numDays },
    count: all.length,
    fetchedAt: new Date().toISOString(),
  })
}
