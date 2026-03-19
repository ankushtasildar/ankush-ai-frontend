/**
 * /api/options-chain — Real options chain via Yahoo Finance v7 options endpoint
 *
 * Yahoo v7 quote (for stock price) → 429 blocked from Vercel
 * Yahoo v8 chart (for stock price) → ✅ works
 * Yahoo v7 options endpoint (for chain) → different rate limit, usually works
 * 
 * Greeks: computed via Black-Scholes using real IV from Yahoo options data.
 */

// ── Black-Scholes ─────────────────────────────────────────────────────────────
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422820 * Math.exp(-x * x / 2);
  const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  const cdf = 1 - d * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

function bsGreeks(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return { delta: null, gamma: null, theta: null, vega: null };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normalCDF(d1);
  const nPrime = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);

  const delta = type === 'call' ? nd1 : nd1 - 1;
  const gamma = nPrime / (S * sigma * sqrtT);
  const theta = type === 'call'
    ? (-(S * nPrime * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365
    : (-(S * nPrime * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * (1 - normalCDF(d2))) / 365;
  const vega = S * nPrime * sqrtT / 100;

  return {
    delta: parseFloat(delta.toFixed(4)),
    gamma: parseFloat(gamma.toFixed(6)),
    theta: parseFloat(theta.toFixed(4)),
    vega:  parseFloat(vega.toFixed(4)),
  };
}

// ── Get underlying price via Yahoo v8 chart ───────────────────────────────────
async function getPrice(symbol) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://finance.yahoo.com',
        'Origin': 'https://finance.yahoo.com',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('No meta');
    // Use postMarket/preMarket price if active, otherwise regular
    const price = meta.postMarketPrice || meta.preMarketPrice || meta.regularMarketPrice;
    const marketState = meta.marketState || 'CLOSED';
    return { price: parseFloat(price), marketState, source: 'yahoo_v8' };
  } catch (e) {
    console.error(`Price fetch failed for ${symbol}:`, e.message);
    return null;
  }
}

// ── Get options chain via Yahoo v7 options ────────────────────────────────────
async function getChain(symbol, expiration) {
  try {
    const base = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}`;
    const url = expiration
      ? `${base}?date=${Math.floor(new Date(expiration).getTime() / 1000)}`
      : base;

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://finance.yahoo.com',
        'Origin': 'https://finance.yahoo.com',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) throw new Error('No options result');

    return {
      expirationDates: result.expirationDates || [],
      options: result.options?.[0] || null,
      quotePrice: result.quote?.regularMarketPrice || null,
    };
  } catch (e) {
    console.error(`Chain fetch failed for ${symbol}:`, e.message);
    return null;
  }
}

// ── Process raw contracts ─────────────────────────────────────────────────────
function processContracts(contracts, type, underlyingPrice, T, r_rate) {
  if (!contracts?.length) return [];
  return contracts
    .filter(c => c.strike > 0 && (c.bid > 0 || c.ask > 0 || c.lastPrice > 0))
    .map(c => {
      const iv = c.impliedVolatility || 0.30; // decimal
      const ivPct = parseFloat((iv * 100).toFixed(1));
      const bid  = parseFloat((c.bid || 0).toFixed(2));
      const ask  = parseFloat((c.ask || 0).toFixed(2));
      const last = parseFloat((c.lastPrice || 0).toFixed(2));
      const mid  = parseFloat(((bid + ask) / 2 || last).toFixed(2));
      const oi   = parseInt(c.openInterest || 0);
      const vol  = parseInt(c.volume || 0);
      const volOiRatio = oi > 0 ? parseFloat((vol / oi).toFixed(2)) : 0;
      const greeks = bsGreeks(underlyingPrice, c.strike, T, r_rate, iv, type);

      return {
        contractSymbol: c.contractSymbol || '',
        strike: c.strike,
        type,
        expiration: c.expiration ? new Date(c.expiration * 1000).toISOString().split('T')[0] : null,
        bid, ask, last, mid,
        iv: ivPct,
        volume: vol,
        openInterest: oi,
        volOiRatio,
        isUnusualVol: volOiRatio > 3 && vol > 200,
        inTheMoney: c.inTheMoney || false,
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega:  greeks.vega,
      };
    })
    .sort((a, b) => a.strike - b.strike);
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { symbol, expiration } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const sym = symbol.toUpperCase();

  // 1. Get price — required
  const priceData = await getPrice(sym);
  if (!priceData?.price) {
    return res.status(503).json({
      error: 'Price unavailable',
      message: `Cannot fetch current price for ${sym}. Market data sources are unavailable.`,
      symbol: sym,
    });
  }

  const { price, marketState, source: priceSource } = priceData;

  // 2. Get options chain
  const chainData = await getChain(sym, expiration);
  if (!chainData?.options) {
    return res.status(503).json({
      error: 'Options chain unavailable',
      message: `Current price: $${price}. Options chain data could not be fetched — market may be closed or ${sym} has no listed options.`,
      symbol: sym,
      underlyingPrice: price,
      priceSource,
      marketState,
    });
  }

  const { expirationDates, options, quotePrice } = chainData;
  const effectivePrice = quotePrice || price;

  // Build expiration list
  const expirations = expirationDates.slice(0, 16).map(ts =>
    new Date(ts * 1000).toISOString().split('T')[0]
  );
  const targetExp = expiration || expirations[0];
  const now = new Date();
  const dte = targetExp
    ? Math.max(0, Math.round((new Date(targetExp) - now) / (1000 * 60 * 60 * 24)))
    : 0;
  const T = Math.max(1/365, dte / 365);
  const r_rate = 0.05;

  const calls = processContracts(options.calls, 'call', effectivePrice, T, r_rate);
  const puts  = processContracts(options.puts,  'put',  effectivePrice, T, r_rate);

  if (!calls.length && !puts.length) {
    return res.status(503).json({
      error: 'No valid contracts',
      message: `Options chain returned but no contracts with valid pricing for ${sym} exp ${targetExp}.`,
      symbol: sym, underlyingPrice: effectivePrice, expirations,
    });
  }

  // Chain metrics
  const atmIdx   = calls.findIndex(c => c.strike >= effectivePrice);
  const callOI   = calls.reduce((s, c) => s + c.openInterest, 0);
  const putOI    = puts.reduce((s, c)  => s + c.openInterest, 0);
  const pcRatio  = callOI > 0 ? parseFloat((putOI / callOI).toFixed(3)) : null;
  const callWalls= [...calls].sort((a,b) => b.openInterest-a.openInterest).slice(0,3).map(c=>c.strike);
  const putWalls = [...puts].sort((a,b)  => b.openInterest-a.openInterest).slice(0,3).map(c=>c.strike);

  const atmCall  = calls[atmIdx >= 0 ? atmIdx : Math.floor(calls.length/2)];
  const atmPut   = puts.find(p => p.strike === atmCall?.strike) || puts[Math.floor(puts.length/2)];
  const impliedMove = (atmCall && atmPut && effectivePrice > 0)
    ? parseFloat(((atmCall.mid + atmPut.mid) / effectivePrice * 100).toFixed(2))
    : null;
  const ivRank = atmCall?.iv
    ? parseFloat(Math.min(100, Math.max(0, (atmCall.iv - 15) / 65 * 100)).toFixed(1))
    : null;

  const unusualVol = [...calls, ...puts]
    .filter(c => c.isUnusualVol)
    .sort((a,b) => b.volOiRatio - a.volOiRatio)
    .slice(0, 10);

  return res.status(200).json({
    symbol: sym,
    underlyingPrice: parseFloat(effectivePrice.toFixed(2)),
    marketState,
    priceSource,
    expiration: targetExp,
    expirations,
    dte,
    calls,
    puts,
    metrics: { putCallRatio: pcRatio, callWalls, putWalls, impliedMovePct: impliedMove, ivRank, unusualVolContracts: unusualVol.length, totalCallOI: callOI, totalPutOI: putOI },
    unusualVol,
    atmIdx: atmIdx >= 0 ? atmIdx : Math.floor(calls.length / 2),
    greeksNote: 'Greeks computed via Black-Scholes using real IV from Yahoo Finance.',
    fetchedAt: new Date().toISOString(),
    source: `price:${priceSource}+chain:yahoo_v7_options`,
  });
}
