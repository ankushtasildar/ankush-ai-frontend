// Options context layer - Dr. Kenji Tanaka, vol desk specialist
// Fetches IV rank, put/call ratio skew, 1SD expected move
// Used to enrich predict.js with options-aware intelligence

const POLY_KEY = process.env.POLYGON_API_KEY

export async function getOptionsContext(symbol, currentPrice) {
  try {
    // Get options chain snapshot from Polygon
    const snap = await fetch(
      'https://api.polygon.io/v3/snapshot/options/'+symbol+'?limit=50&apiKey='+POLY_KEY
    ).then(r=>r.json())

    if (!snap.results || snap.results.length === 0) {
      return { ivRank: null, pcRatio: null, expectedMove1SD: null, ivContext: 'insufficient data' }
    }

    const options = snap.results

    // Calculate put/call ratio from volume
    const calls = options.filter(o => o.details?.contract_type === 'call')
    const puts = options.filter(o => o.details?.contract_type === 'put')
    const callVol = calls.reduce((a,o) => a + (o.day?.volume||0), 0)
    const putVol = puts.reduce((a,o) => a + (o.day?.volume||0), 0)
    const pcRatio = callVol > 0 ? parseFloat((putVol/callVol).toFixed(2)) : null

    // Get ATM implied volatility for 1SD move calculation
    const atmOptions = options.filter(o => {
      const strike = o.details?.strike_price
      return strike && Math.abs(strike - currentPrice) / currentPrice < 0.03
    })

    let avgIV = null
    if (atmOptions.length > 0) {
      const ivs = atmOptions.map(o => o.greeks?.implied_volatility || o.implied_volatility).filter(Boolean)
      if (ivs.length > 0) avgIV = ivs.reduce((a,b)=>a+b,0)/ivs.length
    }

    // 1SD expected move over 5 days: price * IV * sqrt(5/252)
    const expectedMove1SD = avgIV && currentPrice
      ? parseFloat((currentPrice * avgIV * Math.sqrt(5/252)).toFixed(2))
      : null

    // IV rank: simplified (would need 52-week IV range for proper rank)
    const ivRank = avgIV ? Math.min(100, Math.round(avgIV * 200)) : null

    // Options sentiment interpretation
    let ivContext = 'neutral'
    if (pcRatio !== null) {
      if (pcRatio > 1.5) ivContext = 'heavy put buying - bearish positioning'
      else if (pcRatio > 1.1) ivContext = 'slight put skew - mild caution'
      else if (pcRatio < 0.7) ivContext = 'heavy call buying - bullish sentiment'
      else if (pcRatio < 0.9) ivContext = 'call skew - bullish lean'
    }

    return {
      ivRank,
      pcRatio,
      expectedMove1SD,
      ivContext,
      callVolume: callVol,
      putVolume: putVol,
      atmIV: avgIV ? parseFloat((avgIV*100).toFixed(1)) : null // as percentage
    }
  } catch(e) {
    console.error('[options-context]', symbol, e.message)
    return { ivRank: null, pcRatio: null, expectedMove1SD: null, ivContext: 'error fetching' }
  }
}

// Trade style specific output
export function formatOptionsAdvice(optCtx, symbol, price, bias, style) {
  if (!optCtx || !optCtx.atmIV) return null

  const move = optCtx.expectedMove1SD
  const iv = optCtx.atmIV
  const pc = optCtx.pcRatio

  let advice = null

  if (style === 'daytrade') {
    // Day trade: gamma play, need directional move > 1% to overcome theta
    const minMove = price * 0.012
    advice = {
      style: 'Day Trade',
      setup: bias === 'bullish'
        ? 'Buy ATM or 1-strike OTM call, 0-1 DTE if IV rank < 40'
        : 'Buy ATM or 1-strike OTM put, 0-1 DTE if IV rank < 40',
      ivWarning: iv > 40 ? 'HIGH IV (' + iv + '%) - options expensive, consider spread' : null,
      expectedMove: move ? '$' + move + ' (1SD in 5 days, intraday ~$' + (move/5*1.3).toFixed(2) + ')' : null,
      notes: pc > 1.3 ? 'Smart money buying puts - aligns with bearish bias' : pc < 0.8 ? 'Call flow dominant - aligns with bullish bias' : 'Neutral flow'
    }
  } else if (style === 'swing') {
    advice = {
      style: 'Swing Trade',
      setup: bias === 'bullish'
        ? 'Buy ATM call 30-60 DTE, or bull call spread to reduce IV risk'
        : 'Buy ATM put 30-60 DTE, or bear put spread',
      ivWarning: iv > 50 ? 'ELEVATED IV - use vertical spread to cap premium paid' : null,
      expectedMove: move ? '$' + (move * Math.sqrt(10)).toFixed(2) + ' (1SD in 10 days)' : null,
      notes: 'IV rank ' + (optCtx.ivRank||'N/A') + ' - ' + (optCtx.ivRank < 30 ? 'cheap premium, buy outright' : optCtx.ivRank > 60 ? 'expensive, use spreads' : 'fair value')
    }
  } else if (style === 'leap') {
    advice = {
      style: 'LEAP',
      setup: bias === 'bullish'
        ? 'Buy deep ITM call (0.70+ delta) 9-12 months out - acts like stock with leverage'
        : 'Buy deep ITM put (0.70+ delta) 9-12 months out',
      ivWarning: null,
      expectedMove: move ? '$' + (move * Math.sqrt(252/5 * 0.6)).toFixed(2) + ' (1SD annual estimate)' : null,
      notes: 'LEAPs favor lower IV environments. Current ATM IV: ' + iv + '%'
    }
  }

  return advice
}