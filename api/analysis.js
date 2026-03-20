import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};

async function fetchTickerData(symbol) {
  const sym = symbol.toUpperCase();
  const [quote, opts, news] = await Promise.allSettled([
    fetch('https://query1.finance.yahoo.com/v8/finance/chart/'+sym+'?interval=1d&range=1y',{headers:{'User-Agent':'Mozilla/5.0'}}).then(r=>r.json()),
    fetch('https://query2.finance.yahoo.com/v7/finance/options/'+sym,{headers:{'User-Agent':'Mozilla/5.0'}}).then(r=>r.json()),
    fetch('https://query1.finance.yahoo.com/v1/finance/search?q='+sym+'&newsCount=5&quotesCount=0',{headers:{'User-Agent':'Mozilla/5.0'}}).then(r=>r.json()),
  ]);
  const qd = quote.status==='fulfilled'?quote.value:null;
  const od = opts.status==='fulfilled'?opts.value:null;
  const nd = news.status==='fulfilled'?news.value:null;
  const meta = qd?.chart?.result?.[0]?.meta||{};
  const res0 = qd?.chart?.result?.[0];
  const ts = res0?.timestamp||[];
  const ohlcv = res0?.indicators?.quote?.[0]||{};
  const hist = ts.slice(-252).map((t,i)=>({date:new Date(t*1000).toISOString().split('T')[0],close:ohlcv.close?.[ts.length-252+i],high:ohlcv.high?.[ts.length-252+i],low:ohlcv.low?.[ts.length-252+i],volume:ohlcv.volume?.[ts.length-252+i]})).filter(d=>d.close!=null);
  const closes=hist.map(d=>d.close), highs=hist.map(d=>d.high), lows=hist.map(d=>d.low);
  const cur=meta.regularMarketPrice||closes[closes.length-1];
  const h52=Math.max(...highs.slice(-252)), l52=Math.min(...lows.slice(-252));
  const h20=Math.max(...highs.slice(-20)), l20=Math.min(...lows.slice(-20));
  function ema(data,p){const k=2/(p+1);let e=data[0];for(let i=1;i<data.length;i++)e=data[i]*k+e*(1-k);return parseFloat(e.toFixed(4))}
  function rsi(data,p=14){let g=0,l=0;for(let i=data.length-p;i<data.length;i++){const d=data[i]-data[i-1];d>0?g+=d:l+=Math.abs(d)}const ag=g/p,al=l/p;return parseFloat((100-100/(1+(al===0?100:ag/al))).toFixed(2))}
  const e9=ema(closes.slice(-50),9),e21=ema(closes.slice(-50),21),e50=ema(closes.slice(-100),50),e200=ema(closes,200),r14=rsi(closes);
  const avgV=hist.slice(-20).reduce((s,d)=>s+(d.volume||0),0)/20;
  const volR=avgV>0?((hist[hist.length-1]?.volume||0)/avgV).toFixed(2):'N/A';
  const fr=h52-l52;
  const fib={'0%':l52,'23.6%':parseFloat((l52+fr*.236).toFixed(2)),'38.2%':parseFloat((l52+fr*.382).toFixed(2)),'50%':parseFloat((l52+fr*.5).toFixed(2)),'61.8%':parseFloat((l52+fr*.618).toFixed(2)),'78.6%':parseFloat((l52+fr*.786).toFixed(2)),'100%':h52};
  const pos52=parseFloat(((cur-l52)/(h52-l52)*100).toFixed(1));
  const optRes=od?.optionChain?.result?.[0];
  const calls=(optRes?.options?.[0]?.calls||[]).filter(c=>Math.abs(c.strike-cur)<cur*.05).slice(0,3);
  const puts=(optRes?.options?.[0]?.puts||[]).filter(p=>Math.abs(p.strike-cur)<cur*.05).slice(0,3);
  const exps=(optRes?.expirationDates||[]).slice(0,4).map(d=>new Date(d*1000).toISOString().split('T')[0]);
  const headlines=(nd?.news||[]).slice(0,5).map(n=>({title:n.title,publisher:n.publisher,age:Math.floor((Date.now()-n.providerPublishTime*1000)/3600000)+'h ago'}));
  return {symbol:sym,name:meta.longName||meta.shortName||sym,current:cur,change:parseFloat(((cur-meta.previousClose)||0).toFixed(2)),changePct:parseFloat(((cur/meta.previousClose-1)*100||0).toFixed(2)),volume:hist[hist.length-1]?.volume||0,volumeRatio:volR,marketCap:meta.marketCap,sector:meta.sector||'Unknown',industry:meta.industry||'Unknown',pricePosition52w:pos52,high52w:h52,low52w:l52,high20d:h20,low20d:l20,technicals:{ema9:e9,ema21:e21,ema50:e50,ema200:e200,rsi14:r14,emaAlignment:cur>e9&&e9>e21&&e21>e50?'bullish_stacked':cur<e9&&e9<e21&&e21<e50?'bearish_stacked':'mixed',distFromEMA50:parseFloat(((cur/e50-1)*100).toFixed(2)),distFromEMA200:parseFloat(((cur/e200-1)*100).toFixed(2))},fibonacci:fib,options:{expirations:exps,atmCalls:calls.map(c=>({strike:c.strike,ask:c.ask,bid:c.bid,iv:c.impliedVolatility,oi:c.openInterest})),atmPuts:puts.map(p=>({strike:p.strike,ask:p.ask,bid:p.bid,iv:p.impliedVolatility,oi:p.openInterest}))},news:headlines,priceHistory:hist.slice(-60)};
}

async function getTraining(){
  const{data}=await supabase.from('ai_training').select('*').eq('is_active',true).order('priority',{ascending:false});
  return data||[];
}

function buildPrompt(training){
  const blocks=training.map((t,i)=>'### Module '+(i+1)+': '+t.title+' ['+t.category+']
'+t.content).join('

');
  return 'You are AnkushAI's core intelligence engine — the combined expertise of 100 professional traders simultaneously thinking as: Technical traders (trendlines, patterns, all timeframes), Fibonacci traders (exact retracement/extension targets), The Strat traders (1/2U/2D/3 candle classification, broadening formations), Supply & Demand traders (origin candles, fresh vs tested zones), Breakout traders (consolidation, compression, volume dry-up), Macro traders (Fed, yields, VIX regime, rate cycles), Options traders (IV rank, expected moves, skew, gamma exposure), Earnings traders (historical reactions, whisper numbers, guidance), Sector Rotation traders (relative strength, money flow), Momentum traders (RS rank, MACD, trend strength), Index traders (SPX/QQQ structure), Sympathy Play traders (sector contagion, peer moves), Value Disparity traders (mean reversion).

You do NOT put one strategy above another — all have merit and you synthesize ALL of them.

'+(training.length>0?'## ADMIN-TRAINED INTELLIGENCE
'+blocks+'

':'')+'

YOUR MISSION: Given ticker data, produce COMPREHENSIVE analysis that: (1) synthesizes ALL frameworks, (2) identifies the single best options trade with specific strike + expiration, (3) assigns confidence 1-10, (4) gives precise dollar levels, (5) states exact invalidation.

Structure with: ### VERDICT | ### TECHNICAL STRUCTURE | ### KEY LEVELS | ### OPTIONS RECOMMENDATION | ### MACRO & SECTOR | ### CATALYST CALENDAR | ### NEWS SENTIMENT | ### THESIS | ### INVALIDATION | ### STRATEGY DIVERGENCE

Be direct. Use dollar amounts. Use dates. No hedging.';
}

export default async function handler(req,res){
  if(req.method==='OPTIONS')return res.status(200).set(cors).end();
  Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v));
  const{type}=req.query;

  if(req.method==='GET'&&type==='analyze'){
    const{symbol}=req.query;
    if(!symbol)return res.status(400).json({error:'symbol required'});
    try{
      const[td,tr]=await Promise.all([fetchTickerData(symbol),getTraining()]);
      const sys=buildPrompt(tr);
      const msg='Analyze '+td.symbol+' ('+td.name+'). Price: $'+td.current+' ('+td.changePct+'%). 52W: $'+td.low52w+'-$'+td.high52w+' ('+td.pricePosition52w+'% pos). Vol: '+td.volumeRatio+'x avg. Sector: '+td.sector+'. EMAs: $'+td.technicals.ema9+'/$'+td.technicals.ema21+'/$'+td.technicals.ema50+'/$'+td.technicals.ema200+'. RSI: '+td.technicals.rsi14+'. Alignment: '+td.technicals.emaAlignment+'. Fib levels: '+Object.entries(td.fibonacci).map(([k,v])=>k+':$'+v).join(', ')+'. Next exps: '+td.options.expirations.slice(0,2).join(', ')+'. ATM calls: '+JSON.stringify(td.options.atmCalls.slice(0,2))+'. News: '+td.news.slice(0,3).map(n=>n.title).join('; ')+'. Last 20 closes: '+td.priceHistory.slice(-20).map(d=>d.close?.toFixed(2)).join(', ')+'. Run full 100-analyst synthesis.';
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
      const tr=await getTraining();
      const sys=buildPrompt(tr);
      const syms=['SPY','QQQ','AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','AMD','PLTR','COIN'];
      const list=await Promise.all(syms.map(s=>fetchTickerData(s).catch(()=>null)));
      const valid=list.filter(Boolean);
      const snap=valid.map(d=>d.symbol+': $'+d.current+' ('+d.changePct+'%) RSI:'+d.technicals.rsi14+' Vol:'+d.volumeRatio+'x EMAs:'+d.technicals.emaAlignment+' 52W:'+d.pricePosition52w+'%').join('
');
      const scanMsg='Scan these stocks and identify the 6 BEST options trading opportunities RIGHT NOW:
'+snap+'

Active training modules: '+tr.length+'. Consider ALL frameworks: breakout, momentum, fibonacci, macro, earnings, sympathy, value, options IV, The Strat, technical, sector rotation.

Output ONLY a JSON array: [{symbol,setupType,bias,confidence,optionsTrade,entry,target,stop,keyFactor,frameworks,urgency}]';
      const result=await client.messages.create({model:'claude-sonnet-4-20250514',max_tokens:2000,system:sys,messages:[{role:'user',content:scanMsg}]});
      let setups=[];try{setups=JSON.parse(result.content[0].text.replace(/```json|```/g,'').trim())}catch(e){}
      return res.json({setups,scanned:syms.length,timestamp:new Date().toISOString()});
    }catch(err){return res.status(500).json({error:err.message});}
  }
  return res.status(400).json({error:'Unknown type'});
}