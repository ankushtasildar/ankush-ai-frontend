// Marcus Webb + Dr. Kenji Tanaka: QQQ Pulse
// Real-time directional signal for QQQ based on mega-cap constituent momentum
// NVDA (6.8% weight), AAPL (8.9%), MSFT (8.7%) drive ~24% of QQQ alone
// When these diverge from QQQ, mean reversion trade exists

const POLY_KEY = process.env.POLYGON_API_KEY

async function getSnapshot(symbol) {
  const r = await fetch(
    'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/' + symbol + '?apiKey=' + POLY_KEY
  )
  const d = await r.json()
  return d.ticker
}

async function getMinuteBars(symbol, limit=15) {
  const r = await fetch(
    'https://api.polygon.io/v2/aggs/ticker/' + symbol + '/range/1/minute/2020-01-01/' +
    new Date().toISOString().split('T')[0] + '?adjusted=true&sort=desc&limit=' + limit + '&apiKey=' + POLY_KEY
  )
  const d = await r.json()
  return d.results || []
}

function momentum(bars) {
  if (!bars || bars.length < 2) return 0
  const first = bars[bars.length-1].c
  const last = bars[0].c
  return parseFloat(((last - first) / first * 100).toFixed(3))
}

function trend(bars, periods=5) {
  if (!bars || bars.length < periods) return 'flat'
  const closes = bars.slice(0, periods).map(b => b.c)
  const up = closes.filter((c,i) => i > 0 && c > closes[i-1]).length
  const down = closes.filter((c,i) => i > 0 && c < closes[i-1]).length
  if (up >= 4) return 'strong_up'
  if (up >= 3) return 'up'
  if (down >= 4) return 'strong_down'
  if (down >= 3) return 'down'
  return 'flat'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // Fetch all 4 tickers in parallel
    const [qqqBars, nvdaBars, aaplBars, msftBars, amznBars] = await Promise.all([
      getMinuteBars('QQQ', 20),
      getMinuteBars('NVDA', 20),
      getMinuteBars('AAPL', 20),
      getMinuteBars('MSFT', 20),
      getMinuteBars('AMZN', 20),
    ])

    const qqqMom = momentum(qqqBars)
    const nvdaMom = momentum(nvdaBars)
    const aaplMom = momentum(aaplBars)
    const msftMom = momentum(msftBars)
    const amznMom = momentum(amznBars)

    // Weighted composite of big tech (approx QQQ weights)
    const bigTechScore = (nvdaMom * 0.29) + (aaplMom * 0.37) + (msftMom * 0.36) + (amznMom * 0.08) // normalized
    const divergence = parseFloat((bigTechScore - qqqMom).toFixed(3))

    // QQQ trend
    const qqqTrend = trend(qqqBars)
    const nvdaTrend = trend(nvdaBars)

    // Signal logic
    let signal = 'neutral'
    let confidence = 50
    let rationale = ''

    if (divergence > 0.15 && bigTechScore > 0) {
      signal = 'bullish_catchup'
      confidence = Math.min(85, 55 + Math.abs(divergence) * 50)
      rationale = 'Big tech leading QQQ higher - catchup trade favors QQQ upside'
    } else if (divergence < -0.15 && bigTechScore < 0) {
      signal = 'bearish_catchup'
      confidence = Math.min(85, 55 + Math.abs(divergence) * 50)
      rationale = 'QQQ lagging big tech weakness - downside likely imminent'
    } else if (nvdaMom > 0.5 && aaplMom > 0.2 && msftMom > 0.2) {
      signal = 'broadly_bullish'
      confidence = 70
      rationale = 'NVDA + AAPL + MSFT all up - broad tech strength'
    } else if (nvdaMom < -0.5 && (aaplMom < 0 || msftMom < 0)) {
      signal = 'broadly_bearish'
      confidence = 70
      rationale = 'NVDA leading lower with AAPL/MSFT confirming - avoid longs'
    } else if (Math.abs(qqqMom) < 0.05) {
      signal = 'choppy'
      confidence = 40
      rationale = 'QQQ flat/choppy - avoid directional bets, wait for breakout'
    }

    // Options implication
    const optionsPlay = {
      'bullish_catchup': 'Consider QQQ ATM call 0-1 DTE on confirmed breakout above recent high',
      'bearish_catchup': 'Consider QQQ ATM put 0-1 DTE on break below intraday support',
      'broadly_bullish': 'QQQ calls favored - target +0.5% move from current for 2-4x on 0DTE',
      'broadly_bearish': 'QQQ puts favored - momentum confirms downside',
      'choppy': 'Avoid directional options - sell premium or wait for VIX spike'
    }[signal] || 'No clear options trade - monitor for setup'

    res.json({
      signal,
      confidence: Math.round(confidence),
      rationale,
      optionsPlay,
      constituents: {
        QQQ: { mom15m: qqqMom, trend: qqqTrend },
        NVDA: { mom15m: nvdaMom, trend: nvdaTrend },
        AAPL: { mom15m: aaplMom, trend: trend(aaplBars) },
        MSFT: { mom15m: msftMom, trend: trend(msftBars) },
        AMZN: { mom15m: amznMom, trend: trend(amznBars) }
      },
      divergence,
      bigTechScore: parseFloat(bigTechScore.toFixed(3)),
      generatedAt: new Date().toISOString()
    })
  } catch(e) {
    console.error('[qqq-pulse]', e.message)
    res.status(500).json({ error: e.message })
  }
}