const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};

// ── EXPANDED UNIVERSE — 60 symbols across all market sectors ──────────────────
const UNIVERSE = [
  // Mega Cap Tech & AI
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','ORCL','CRM',
  // Semiconductors
  'AMD','INTC','QCOM','ARM','AMAT','LRCX','MRVL','SMCI','MU','TSM',
  // High Beta / Momentum
  'PLTR','COIN','MSTR','HOOD','RBLX','SNAP','UBER','LYFT','SOFI','SQ',
  // Large Cap Finance
  'JPM','GS','MS','BAC','V','MA','PYPL',
  // Energy & Commodities
  'XOM','CVX','OXY','BP','SLB',
  // Healthcare & Biotech
  'LLY','UNH','MRNA','BIIB','ABBV',
  // ETFs — macro and sector reads
  'SPY','QQQ','IWM','XLF','XLK','XLE','XLV','XLU','GLD','SLV','TLT','HYG',
  // Special situations
  'GME','AMC','BBBY',
];

// ── PENNY STOCK GATE — minimum quality thresholds ────────────────────────────
const PENNY_GATE = {
  minPrice: 5,          // No stocks under $5 (no liquid options)
  minAvgVol: 500000,    // Min 500K avg daily volume
  minMarketCap: 1e9,    // Min $1B market cap
};

function passesGate(td) {
  if (!td) return false;
  if (td.current < PENNY_GATE.minPrice) return false;
  const avgVol = td.avgVolume || 0;
  if (avgVol > 0 && avgVol < PENNY_GATE.minAvgVol) return false;
  if (td.marketCap && td.marketCap < PENNY_GATE.minMarketCap) return false;
  return true;
}

// ── Tier check — only Pro/Enterprise users get live AI scan ──────────────────
async function getUserTier(authHeader) {
  if (!authHeader) return 'free';
  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return 'free';
    const { data: profile } = await supabase.from('profiles').select('plan,subscription_status').eq('id', user.id).single();
    const plan = profile?.plan || 'free';
    const status = profile?.subscription_status || 'none';
    // Active Pro or Enterprise = Tier 1+
    if (['pro','enterprise','tier1','tier2'].includes(plan) || status === 'active') return 'pro';
    return 'free';
  } catch (e) {
    return 'free';
  }
}

async function fetchTickerData(symbol) {
  const sym = symbol.toUpperCase();
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  const [quote, opts, news] = await Promise.allSettled([
    fetch('https://query2.finance.yahoo.com/v8/finance/chart/'+sym+'?interval=1d&range=1y', { headers }).then(r => r.json()),
    fetch('https://query2.finance.yahoo.com/v7/finance/options/'+sym, { headers }).then(r => r.json()),
    fetch('https://query1.finance.yahoo.com/v1/finance/search?q='+sym+'&newsCount=5&quotesCount=0', { headers }).then(r => r.json()),
  ]);
  const qd = quote.status === 'fulfilled' ? quote.value : null;
  const od = opts.status === 'fulfilled' ? opts.value : null;
  const nd = news.status === 'fulfilled' ? news.value : null;
  const meta = qd?.chart?.result?.[0]?.meta || {};
  const res0 = qd?.chart?.result?.[0];
  const ts = res0?.timestamp || [];
  const ohlcv = res0?.indicators?.quote?.[0] || {};
  const hist = ts.slice(-252).map((t,i) => ({
    date: new Date(t*1000).toISOString().split('T')[0],
    close: ohlcv.close?.[ts.length-252+i],
    high: ohlcv.high?.[ts.length-252+i],
    low: ohlcv.low?.[ts.length-252+i],
    volume: ohlcv.volume?.[ts.length-252+i],
  })).filter(d => d.close != null);
  const closes = hist.map(d => d.close);
  const highs = hist.map(d => d.high);
  const lows = hist.map(d => d.low);
  const cur = meta.regularMarketPrice || closes[closes.length-1] || 0;
  const h52 = highs.length ? Math.max(...highs) : cur;
  const l52 = lows.length ? Math.min(...lows) : cur;
  const h20 = highs.slice(-20).length ? Math.max(...highs.slice(-20)) : cur;
  const l20 = lows.slice(-20).length ? Math.min(...lows.slice(-20)) : cur;
  function calcEMA(data,p){if(!data.length)return 0;const k=2/(p+1);let e=data[0];for(let i=1;i<data.length;i++)e=data[i]*k+e*(1-k);return parseFloat(e.toFixed(4))}
  function calcRSI(data,p=14){if(data.length<p+1)return 50;let g=0,l=0;for(let i=data.length-p;i<data.length;i++){const d=data[i]-data[i-1];d>0?g+=d:l+=Math.abs(d)}const ag=g/p,al=l/p;return parseFloat((100-100/(1+(al===0?9999:ag/al))).toFixed(2))}
  const e9=calcEMA(closes.slice(-50),9),e21=calcEMA(closes.slice(-50),21),e50=calcEMA(closes.slice(-100),50),e200=calcEMA(closes,200),r14=calcRSI(closes);
  const avgV = hist.slice(-20).reduce((s,d)=>s+(d.volume||0),0)/20;
  const lastVol = hist[hist.length-1]?.volume||0;
  const volR = avgV>0?(lastVol/avgV).toFixed(2):'1.00';
  const fr=h52-l52||1;
  const fib={'0%':parseFloat(l52.toFixed(2)),'23.6%':parseFloat((l52+fr*.236).toFixed(2)),'38.2%':parseFloat((l52+fr*.382).toFixed(2)),'50%':parseFloat((l52+fr*.5).toFixed(2)),'61.8%':parseFloat((l52+fr*.618).toFixed(2)),'78.6%':parseFloat((l52+fr*.786).toFixed(2)),'100%':parseFloat(h52.toFixed(2))};
  const pos52=h52>l52?parseFloat(((cur-l52)/(h52-l52)*100).toFixed(1)):50;
  const optRes=od?.optionChain?.result?.[0];
  const calls=(optRes?.options?.[0]?.calls||[]).filter(c=>Math.abs(c.strike-cur)<cur*.05).slice(0,3);
  const puts=(optRes?.options?.[0]?.puts||[]).filter(p=>Math.abs(p.strike-cur)<cur*.05).slice(0,3);
  const exps=(optRes?.expirationDates||[]).slice(0,4).map(d=>new Date(d*1000).toISOString().split('T')[0]);
  const headlines=(nd?.news||[]).slice(0,5).map(n=>({title:n.title,publisher:n.publisher,age:Math.floor((Date.now()-n.providerPublishTime*1000)/3600000)+'h ago'}));
  return {
    symbol:sym,name:meta.longName||meta.shortName||sym,
    current:cur,change:parseFloat(((cur-meta.previousClose)||0).toFixed(2)),
    changePct:parseFloat(((cur/(meta.previousClose||cur)-1)*100).toFixed(2)),
    volume:lastVol,avgVolume:Math.round(avgV),volumeRatio:volR,
    marketCap:meta.marketCap,sector:meta.sector||'Unknown',industry:meta.industry||'Unknown',
    pricePosition52w:pos52,high52w:h52,low52w:l52,high20d:h20,low20d:l20,
    technicals:{ema9:e9,ema21:e21,ema50:e50,ema200:e200,rsi14:r14,
      emaAlignment:cur>e9&&e9>e21&&e21>e50?'bullish_stacked':cur<e9&&e9<e21&&e21<e50?'bearish_stacked':'mixed',
      distFromEMA50:parseFloat(((cur/(e50||cur)-1)*100).toFixed(2)),
      distFromEMA200:parseFloat(((cur/(e200||cur)-1)*100).toFixed(2))},
    fibonacci:fib,
    options:{expirations:exps,atmCalls:calls.map(c=>({strike:c.strike,ask:c.ask,bid:c.bid,iv:c.impliedVolatility,oi:c.openInterest})),atmPuts:puts.map(p=>({strike:p.strike,ask:p.ask,bid:p.bid,iv:p.impliedVolatility,oi:p.openInterest}))},
    news:headlines,priceHistory:hist.slice(-60),
  };
}

async function getTraining(){
  try{const{data}=await supabase.from('ai_training').select('*').eq('is_active',true).order('priority',{ascending:false});return data||[];}catch(e){return[];}
}

function buildPrompt(training){
  const blocks=training.map((t,i)=>'### Module '+(i+1)+': '+t.title+' ['+t.category+']'+'
'+t.content).join('

');
  return 'You are AnkushAI — the combined intelligence of 100 professional traders simultaneously thinking as: Technical traders (trendlines, all patterns, all timeframes), Fibonacci traders (exact retracement/extension targets), The Strat traders (1/2U/2D/3 candle types, broadening formations), Supply & Demand traders (origin candles, fresh zones), Breakout traders (consolidation, volume dry-up), Macro traders (Fed/yields/VIX/dollar), Options traders (IV rank, expected moves, skew, gamma), Earnings traders (historical reactions, guidance, whisper), Sector Rotation traders (relative strength, money flow), Momentum traders (RS rank, MACD), Index traders (SPX/QQQ structure), Sympathy Play traders (sector contagion), Value/Mean Reversion traders.

You give NO strategy more weight than another — you synthesize ALL simultaneously.

PENNY STOCK GATE: You NEVER recommend stocks under $5 or with thin options chains. Every trade recommendation must have liquid options available.

'+(training.length>0?'## ADMIN-TRAINED INTELLIGENCE
'+blocks:'')+'

YOUR MISSION: Produce COMPREHENSIVE analysis that: (1) synthesizes ALL frameworks, (2) identifies the single best options trade with SPECIFIC strike + expiration, (3) assigns confidence 1-10 based on confluence count, (4) gives PRECISE dollar levels not ranges, (5) states exact invalidation level.

Format: ### VERDICT [BULLISH/BEARISH/NEUTRAL] | Confidence X/10
### TECHNICAL STRUCTURE
### KEY LEVELS
### OPTIONS RECOMMENDATION
### MACRO & SECTOR CONTEXT
### CATALYST CALENDAR
### NEWS SENTIMENT
### THESIS
### INVALIDATION
### STRATEGY DIVERGENCE

Be direct. Dollar amounts. Specific dates. No hedging.';
}

module.exports = async function handler(req,res){
  if(req.method==='OPTIONS'){Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v));return res.status(200).end();}
  Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v));
  const{type}=req.query;

  if(req.method==='GET'&&type==='analyze'){
    const{symbol}=req.query;
    if(!symbol)return res.status(400).json({error:'symbol required'});
    try{
      const[td,tr]=await Promise.all([fetchTickerData(symbol),getTraining()]);
      
      // Penny stock gate on analyze
      if(!passesGate(td)){
        return res.status(400).json({error:'Symbol does not meet quality thresholds',reason:'Price, volume, or market cap below minimum for options trading',symbol:td?.symbol,current:td?.current});
      }
      
      const sys=buildPrompt(tr);
      const msg='Analyze '+td.symbol+' ('+td.name+'). Price: $'+td.current+' ('+td.changePct+'%). 52W: $'+td.low52w+'-$'+td.high52w+' ('+td.pricePosition52w+'% pos). Vol: '+td.volumeRatio+'x avg. Avg daily vol: '+Math.round((td.avgVolume||0)/1e6*10)/10+'M. Sector: '+td.sector+'. EMAs: $'+td.technicals.ema9+'/$'+td.technicals.ema21+'/$'+td.technicals.ema50+'/$'+td.technicals.ema200+'. RSI: '+td.technicals.rsi14+'. Alignment: '+td.technicals.emaAlignment+'. EMA50 dist: '+td.technicals.distFromEMA50+'%. EMA200 dist: '+td.technicals.distFromEMA200+'%. Fib levels: '+Object.entries(td.fibonacci).map(([k,v])=>k+':$'+v).join(', ')+'. Next exps: '+td.options.expirations.slice(0,2).join(', ')+'. ATM calls: '+JSON.stringify(td.options.atmCalls.slice(0,2))+'. News: '+td.news.slice(0,3).map(n=>n.title).join('; ')+'. Last 20 closes: '+td.priceHistory.slice(-20).map(d=>d.close?.toFixed(2)).join(',')+'. Run full 100-analyst synthesis.';
      res.setHeader('Content-Type','text/event-stream');
      res.setHeader('Cache-Control','no-cache');
      res.setHeader('Connection','keep-alive');
      res.write('data: '+JSON.stringify({type:'data',tickerData:td})+'

');
      const stream=client.messages.stream({model:'claude-sonnet-4-20250514',max_tokens:3000,system:sys,messages:[{role:'user',content:msg}]});
      for await(const chunk of stream)if(chunk.type==='content_block_delta'&&chunk.delta?.type==='text_delta')res.write('data: '+JSON.stringify({type:'text',text:chunk.delta.text})+'

');
      res.write('data: '+JSON.stringify({type:'done'})+'

');
      res.end();
    }catch(err){console.error(err.message);if(!res.headersSent)return res.status(500).json({error:err.message});res.write('data: '+JSON.stringify({type:'error',error:err.message})+'

');res.end();}
    return;
  }

  if(req.method==='GET'&&type==='scan'){
    try{
      // Tier check — Tier 1+ (Pro) required for live AI scan
      const tier=await getUserTier(req.headers.authorization);
      const tr=await getTraining();
      const sys=buildPrompt(tr);
      
      // Shuffle universe and pick a diverse 20-symbol batch to scan each time
      const shuffled=[...UNIVERSE].sort(()=>Math.random()-0.5).slice(0,20);
      // Always include core indices and highest-priority symbols
      const core=['SPY','QQQ','NVDA','AAPL','MSFT','TSLA','AMD'];
      const batch=[...new Set([...core,...shuffled])].slice(0,18);
      
      const list=await Promise.all(batch.map(s=>fetchTickerData(s).catch(()=>null)));
      const valid=list.filter(Boolean);
      
      // Apply Penny Stock Gate — filter out garbage
      const qualified=valid.filter(d=>{
        if(!passesGate(d))return false;
        return true;
      });
      
      const snap=qualified.map(d=>d.symbol+': $'+d.current+' ('+d.changePct+'%) RSI:'+d.technicals.rsi14+' Vol:'+d.volumeRatio+'x Mkt:$'+(d.marketCap?(d.marketCap/1e9).toFixed(0):'?')+'B EMAs:'+d.technicals.emaAlignment+' 52W:'+d.pricePosition52w+'% Fib50:$'+d.fibonacci['50%']+' AvgVol:'+(d.avgVolume?(d.avgVolume/1e6).toFixed(1):'?')+'M').join('
');
      
      let tierNote='';
      if(tier==='free'){
        tierNote='Note: User is on free tier. Still provide high-quality setups but note that Pro members get deeper analysis and more setups. ';
      }
      
      const scanMsg='You are scanning '+qualified.length+' qualified stocks (all passed penny stock gate: price >$5, volume >500K, market cap >$1B) for the 6 BEST options trading opportunities right now.

'+snap+'

Active training modules: '+tr.length+'. Use ALL frameworks.

'+tierNote+'For each setup: specific symbol, setup type, bias, confidence 1-10, exact options trade with strike+expiration, entry/target/stop, and the single compelling factor RIGHT NOW. Focus on highest confluence, most actionable trades.

Output ONLY JSON array: [{symbol,setupType,bias,confidence,optionsTrade,entry,target,stop,keyFactor,frameworks,urgency}]';
      
      const result=await client.messages.create({model:'claude-sonnet-4-20250514',max_tokens:2000,system:sys,messages:[{role:'user',content:scanMsg}]});
      let setups=[];
      try{setups=JSON.parse(result.content[0].text.replace(/```json|```/g,'').trim())}catch(e){console.error('parse error:',e.message);}
      
      return res.json({setups,scanned:batch.length,qualified:qualified.length,filtered:batch.length-qualified.length,tier,timestamp:new Date().toISOString()});
    }catch(err){console.error('Scan error:',err.message);return res.status(500).json({error:err.message});}
  }

  return res.status(400).json({error:'Unknown type. Use type=analyze&symbol=X or type=scan'});
};