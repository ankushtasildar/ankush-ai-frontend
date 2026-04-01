// ============================================================================
// ANKUSHAI SCAN CACHE — Server-side persistent scan results
// ============================================================================
// This API provides a CACHE LAYER over the V3 engine and market scanner.
// 
// WHY: The DT Dashboard currently scans on each browser tab independently.
//      CEO wants: unified results across ALL users, no restart on navigation.
//
// HOW: This API caches the last scan result in server memory (module scope).
//      When any user requests data, they get the cached result instantly.
//      If cache is stale (>10s), it triggers a fresh scan transparently.
//
// Endpoints:
//   GET ?action=latest       — Instant: returns last cached QQQ scan + market scan
//   GET ?action=force_scan   — Forces a fresh QQQ scan (ignores cache)
//   GET ?action=health       — Cache health and stats
// ============================================================================

// Module-scope cache — persists across requests on Vercel (same instance)
var cache = {
  qqq: null,
  qqqTime: 0,
  market: null,
  marketTime: 0,
  scanCount: 0,
  log: []
};

var QQQ_TTL = 10000;    // 10 seconds for QQQ deep scan
var MARKET_TTL = 30000; // 30 seconds for 40-ticker market scan

function addLog(msg) {
  cache.log.unshift({ time: new Date().toLocaleTimeString(), msg: msg });
  if (cache.log.length > 30) cache.log = cache.log.slice(0, 30);
}

// ============================================================================
// INTERNAL: Run scans via our own APIs
// ============================================================================
async function runQQQScan(host) {
  try {
    var url = (host.indexOf('localhost') >= 0 ? 'http://' : 'https://') + host + '/api/day-trade-engine?action=predict';
    var r = await fetch(url);
    if (!r.ok) return null;
    var d = await r.json();
    cache.qqq = d;
    cache.qqqTime = Date.now();
    cache.scanCount++;
    // Generate intelligent log entry
    var conf = d.confluence ? d.confluence.confluencePct : 0;
    var bias = d.confluence ? d.confluence.bias : '';
    var price = d.price ? d.price.toFixed(2) : '?';
    if (d.alert) {
      addLog('ALERT: QQQ $' + price + ' ' + d.alert.direction + ' ' + conf + '% Grade ' + d.alert.grade);
    } else if (conf >= 40) {
      addLog('QQQ $' + price + ': ' + conf + '% ' + bias + ' — approaching threshold');
    } else {
      addLog('QQQ $' + price + ': ' + conf + '% ' + bias + ' — scanning');
    }
    return d;
  } catch (e) { addLog('QQQ scan error: ' + e.message); return null; }
}

async function runMarketScan(host) {
  try {
    var url = (host.indexOf('localhost') >= 0 ? 'http://' : 'https://') + host + '/api/market-scanner?action=scan';
    var r = await fetch(url);
    if (!r.ok) return null;
    var d = await r.json();
    cache.market = d;
    cache.marketTime = Date.now();
    if (d.opportunities && d.opportunities.length > 0) {
      var top = d.opportunities[0];
      addLog('MARKET: ' + d.scanned + ' scanned, ' + d.qualified + ' qualified. Top: ' + top.symbol + ' (' + (top.change > 0 ? '+' : '') + top.change + '%)');
    }
    return d;
  } catch (e) { addLog('Market scan error: ' + e.message); return null; }
}

// ============================================================================
// HANDLER
// ============================================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = req.query.action || 'latest';
  var host = req.headers.host || 'www.ankushai.org';

  try {
    if (action === 'latest') {
      var now = Date.now();
      var qqqStale = !cache.qqq || (now - cache.qqqTime) > QQQ_TTL;
      var marketStale = !cache.market || (now - cache.marketTime) > MARKET_TTL;

      // If QQQ is stale, trigger a fresh scan (but still return whatever we have)
      if (qqqStale) {
        // Don't await — fire and forget, return cached data immediately
        runQQQScan(host).catch(function() {});
      }
      if (marketStale) {
        runMarketScan(host).catch(function() {});
      }

      return res.json({
        qqq: cache.qqq || { status: 'warming', message: 'First scan in progress...' },
        qqqAge: cache.qqqTime > 0 ? now - cache.qqqTime : null,
        market: cache.market || { status: 'warming', message: 'Market scan starting...' },
        marketAge: cache.marketTime > 0 ? now - cache.marketTime : null,
        scanCount: cache.scanCount,
        log: cache.log,
        cached: !!cache.qqq,
        serverTime: new Date().toISOString()
      });
    }

    if (action === 'force_scan') {
      var qqq = await runQQQScan(host);
      var mkt = await runMarketScan(host);
      return res.json({
        qqq: qqq,
        market: mkt,
        scanCount: cache.scanCount,
        log: cache.log,
        cached: false,
        serverTime: new Date().toISOString()
      });
    }

    if (action === 'health') {
      return res.json({
        status: 'ok',
        version: 'v1',
        scanCount: cache.scanCount,
        qqqCached: !!cache.qqq,
        qqqAge: cache.qqqTime > 0 ? Date.now() - cache.qqqTime : null,
        marketCached: !!cache.market,
        marketAge: cache.marketTime > 0 ? Date.now() - cache.marketTime : null,
        logEntries: cache.log.length,
        ttl: { qqq: QQQ_TTL, market: MARKET_TTL },
        note: 'Server-side cache — unified across all users. No client-side polling needed for instant page loads.'
      });
    }

    return res.status(400).json({ error: 'action required: latest, force_scan, health' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
