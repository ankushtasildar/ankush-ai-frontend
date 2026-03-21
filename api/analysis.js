// api/analysis.js v5 — Cache-first scan architecture
// Reads from global_scan_cache (pre-computed) for instant response
// Falls back to live scan only when cache is stale or empty

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// L1 in-memory cache
let L1 = null, L1_TS = 0
const L1_TTL = 4 * 60 * 1000

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { type = 'scan', symbol, force } = req.query
  const authHeader = req.headers.authorization || ''

  // ── SINGLE SYMBOL ANALYSIS ──────────────────────────────────────
  if (type === 'single' && symbol) {
    try {
      // Check cache first
      const { data: cached } = await supabase
        .from('global_scan_cache')
        .select('setups, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (cached?.setups) {
        const setup = cached.setups.find(s => s.symbol?.toUpperCase() === symbol.toUpperCase())
        if (setup) {
          return res.json({ ...setup, source: 'cache', cached_at: cached.created_at })
        }
      }

      // Live single-symbol analysis
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Analyze ${symbol.toUpperCase()} for options trading. Return ONLY JSON:
{"symbol":"${symbol}","setupType":"","bias":"bullish|bearish","confidence":7,"entryLow":0,"entryHigh":0,"stopLoss":0,"target1":0,"target2":0,"rrRatio":2.5,"ivRank":35,"recommendedTrade":"","urgency":"medium","frameworks":["momentum"],"analysis":"","keyLevels":"","catalysts":[]}`
        }]
      })
      const text = msg.content[0]?.text || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) return res.json({ ...JSON.parse(match[0]), source: 'live' })
      return res.status(500).json({ error: 'Parse failed' })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── FULL SCAN — cache-first ──────────────────────────────────────
  if (type === 'scan') {
    // L1: in-memory
    if (!force && L1 && Date.now() - L1_TS < L1_TTL) {
      res.setHeader('X-Cache', 'L1')
      return res.json({ setups: L1.setups, market_context: L1.market_context, source: 'cache-l1', age_minutes: Math.floor((Date.now() - L1_TS)/60000) })
    }

    // L2: Supabase global scan cache
    try {
      const { data } = await supabase
        .from('global_scan_cache')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        const age = (Date.now() - new Date(data.created_at).getTime()) / 60000
        // Serve from cache if < 35 min old
        if (!force && age < 35) {
          L1 = data; L1_TS = Date.now()
          res.setHeader('X-Cache', 'L2')
          res.setHeader('X-Cache-Age', Math.floor(age) + 'min')
          return res.json({
            setups: data.setups,
            market_context: data.market_context,
            source: 'cache',
            age_minutes: Math.floor(age),
            setup_count: data.setups?.length || 0
          })
        }
      }
    } catch (e) {
      console.error('Cache read error:', e.message)
    }

    // L3: Live scan (only when cache is truly stale or forced)
    try {
      console.log('[analysis] Running live scan...')
      const startTime = Date.now()

      // Get patterns
      const { data: patterns } = await supabase
        .from('ai_learned_patterns')
        .select('*')
        .order('prompt_weight', { ascending: false })
        .limit(10)

      const patternCtx = (patterns || []).map(p =>
        `• ${p.pattern_name}: Works when ${p.works_best_when}. Weight: ${p.prompt_weight}x`
      ).join('\n')

      const SYMBOLS = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AMD','CRM','NFLX',
        'ADBE','QCOM','AVGO','TXN','MU','INTC','NOW','PANW','SNOW','PLTR',
        'COIN','MSTR','HOOD','RBLX','UBER','SPY','QQQ','IWM','GLD','TLT',
        'XLK','XLF','XLE','XLV','XLY','ARKK','SMH','SOXX','JPM','BAC',
        'GS','MS','WFC','C','BLK','COST','HD','WMT','TGT','LOW',
        'PFE','JNJ','LLY','MRK','ABBV','UNH','CVS','GILD','BIIB','REGN',
        'RKLB','ASTS','IONQ','RGTI','SOUN','AISP','BBAI']

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: `You are AnkushAI's institutional scan engine.

Learned patterns (apply with listed weight multiplier):
${patternCtx}

Rules:
- Only stocks > $5 (no penny stocks)
- Need options liquidity (avg volume > 500k)  
- Always include: entry zone, stop, target, R/R, recommended option play
- Return 12-18 setups maximum`,
        messages: [{
          role: 'user',
          content: `Analyze: ${SYMBOLS.join(', ')}. Return ONLY valid JSON:
{"scan_summary":"brief overview","setups":[{"symbol":"","setupType":"","bias":"bullish","confidence":7,"entryLow":0,"entryHigh":0,"stopLoss":0,"target1":0,"rrRatio":2.5,"ivRank":35,"recommendedTrade":"","urgency":"medium","frameworks":[],"analysis":"","keyLevels":"","catalysts":[]}]}`
        }]
      })

      const text = msg.content[0]?.text || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in response')
      const result = JSON.parse(match[0])
      const duration = Date.now() - startTime

      // Store in global cache
      const mktCtx = { scan_summary: result.scan_summary, scanned_count: SYMBOLS.length }
      const { data: saved } = await supabase
        .from('global_scan_cache')
        .insert({ setups: result.setups || [], market_context: mktCtx, scan_duration_ms: duration, symbols_scanned: SYMBOLS.length, setup_count: result.setups?.length || 0 })
        .select().single()

      // Store individual setups in setup_records
      if (result.setups?.length > 0) {
        const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
        await supabase.from('setup_records').insert(
          result.setups.map(s => ({
            symbol: s.symbol,
            setup_type: s.setupType,
            bias: s.bias,
            confidence: s.confidence,
            entry_low: s.entryLow,
            entry_high: s.entryHigh,
            stop_loss: s.stopLoss,
            target_1: s.target1,
            target_2: s.target2,
            rr_ratio: s.rrRatio,
            iv_rank: s.ivRank,
            frameworks: s.frameworks,
            analysis: s.analysis,
            status: 'open',
            scan_id: saved?.id
          }))
        ).catch(e => console.error('setup_records insert error:', e.message))
      }

      L1 = saved; L1_TS = Date.now()
      res.setHeader('X-Cache', 'MISS')
      return res.json({ setups: result.setups || [], market_context: mktCtx, source: 'live', duration_ms: duration })

    } catch (e) {
      console.error('[analysis] Live scan error:', e.message)
      return res.status(500).json({ error: e.message, setups: [] })
    }
  }

  return res.status(400).json({ error: 'Invalid type' })
}
