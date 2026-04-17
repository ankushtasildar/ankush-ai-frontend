// api/options-scoring.js - Options Scoring Engine v1
// 4 filters: disposition ratio, category dominance, capital velocity, volume exit triggers
const Anthropic = require('@anthropic-ai/sdk');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const POLY = process.env.POLYGON_API_KEY;

function getDateRange(days) { var e=new Date(),s=new Date(e-days*86400000); return s.toISOString().split('T')[0]+'/'+e.toISOString().split('T')[0]; }
function avg(arr) { return arr.length ? arr.reduce(function(a,b){return a+b},0)/arr.length : 0; }

function computeFilters(bars, price) {
  var n=bars.length, vols=bars.map(function(b){return b.v});
  var avgVol5d=avg(vols.slice(-5)), avgVol20d=avg(vols.slice(-20));
  var volTrend=avgVol5d>avgVol20d*1.2?'expanding':avgVol5d<avgVol20d*0.8?'contracting':'stable';
  var priceChange5d=n>=5?((price-bars[n-5].c)/bars[n-5].c)*100:0;
  var priceChange20d=n>=20?((price-bars[n-20].c)/bars[n-20].c)*100:0;
  var atrBars=bars.slice(-15),atrSum=0;
  for(var i=1;i<atrBars.length;i++){var tr=Math.max(atrBars[i].h-atrBars[i].l,Math.abs(atrBars[i].h-atrBars[i-1].c),Math.abs(atrBars[i].l-atrBars[i-1].c));atrSum+=tr;}
  var atr=atrSum/(atrBars.length-1),atrPct=(atr/price)*100;
  var closes=bars.slice(-15).map(function(b){return b.c}),gains=0,losses=0;
  for(var i=1;i<closes.length;i++){var d=closes[i]-closes[i-1];if(d>0)gains+=d;else losses-=d;}
  var rsi=losses===0?100:100-(100/(1+gains/14/(losses/14)));
  var highs=bars.map(function(b){return b.h}),lows=bars.map(function(b){return b.l});
  var high52w=Math.max.apply(null,highs),low52w=Math.min.apply(null,lows),distFromHigh=((price-high52w)/high52w)*100;
  var last10=bars.slice(-10),upVols=0,totalVols=0;
  for(var i=0;i<last10.length;i++){totalVols+=last10[i].v;if(last10[i].c>last10[i].o)upVols+=last10[i].v;}
  var upVolRatio=totalVols>0?upVols/totalVols:0.5;
  var last5=bars.slice(-5),expandingVolBars=0;
  for(var i=0;i<last5.length;i++){if(last5[i].v>avgVol20d)expandingVolBars++;}
  var trend=priceChange5d>0?1:-1,trendVol=0,counterVol=0;
  for(var i=0;i<last10.length;i++){var dd=last10[i].c>last10[i].o?1:-1;if(dd===trend)trendVol+=last10[i].v;else counterVol+=last10[i].v;}
  var dispositionProxy=trendVol>0?Math.min(trendVol/(trendVol+counterVol),1):0.5;
  var categoryDominance=Math.min(avgVol5d/(avgVol20d*1.5),1);
  var vol1d=vols[n-1]||avgVol5d,capitalVelocity=Math.min(vol1d/avgVol20d,2)/2;
  var volDecay=vols.slice(-3),isDecaying=volDecay[2]<volDecay[1]&&volDecay[1]<volDecay[0];
  var volumeExitSignal=isDecaying?0.3:(vol1d>avgVol5d?0.8:0.6);
  return{avgVol5d:avgVol5d,avgVol20d:avgVol20d,volTrend:volTrend,priceChange5d:priceChange5d,priceChange20d:priceChange20d,atr:atr,atrPct:atrPct,rsi:rsi,high52w:high52w,low52w:low52w,distFromHigh:distFromHigh,upVolRatio:upVolRatio,expandingVolBars:expandingVolBars,dispositionProxy:dispositionProxy,categoryDominance:categoryDominance,capitalVelocity:capitalVelocity,volumeExitSignal:volumeExitSignal};
}

function getSectorPeers(sym){
  var s={Tech:['AAPL','MSFT','NVDA','GOOGL','META','AMD','AVGO','ORCL','CRM','PLTR'],Semi:['NVDA','AMD','AVGO','MU','INTC','QCOM','TXN','MRVL'],Fin:['JPM','BAC','GS','MS','WFC','V','MA'],Energy:['XOM','CVX','COP','SLB','OXY'],Health:['LLY','UNH','JNJ','ABBV','MRK','PFE'],Consumer:['AMZN','TSLA','HD','MCD','NKE'],Macro:['SPY','QQQ','IWM','DIA','TLT','GLD']};
  for(var k in s){if(s[k].indexOf(sym)>-1)return{sector:k,peers:s[k].filter(function(x){return x!==sym}).slice(0,5)};}
  return{sector:'Other',peers:['SPY','QQQ']};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store,no-cache,must-revalidate');
  res.setHeader('CDN-Cache-Control','no-store');
  if(!ANTHROPIC_KEY) return res.status(500).json({error:'API key not configured'});
  var symbol=(req.query.symbol||'SPY').toUpperCase();
  try{
    var priceR=await fetch('https://api.polygon.io/v2/aggs/ticker/'+symbol+'/prev?apiKey='+POLY).then(function(r){return r.json()});
    var barsR=await fetch('https://api.polygon.io/v2/aggs/ticker/'+symbol+'/range/1/day/'+getDateRange(30)+'?adjusted=true&sort=asc&apiKey='+POLY).then(function(r){return r.json()});
    var price=priceR&&priceR.results&&priceR.results[0]?priceR.results[0].c:null;
    var bars=barsR&&barsR.results?barsR.results:[];
    if(!price||bars.length<5) return res.status(400).json({error:'No market data for '+symbol});
    var f=computeFilters(bars,price),sp=getSectorPeers(symbol);
    var client=new Anthropic({apiKey:ANTHROPIC_KEY});
    var sys='You are Dr. Kenji Tanaka, head of options intelligence. 20yr experience at Citadel and Susquehanna. You achieve 83% win rate using a proprietary 4-filter scoring system for options trades. FILTERS: 1) DISPOSITION RATIO (0-1): accumulation vs day-trading. NEVER trade below 0.70. 2) CATEGORY DOMINANCE (0-1): sector flow concentration. Need >0.60. 3) CAPITAL VELOCITY (0-1): speed of capital deployment. 4) VOLUME EXIT TRIGGER (0-1): below 0.30 = move exhausted, exit. RULES: Only recommend when ALL 4 filters >0.60. Max 30% premium risk. Min 2:1 R/R. Prefer spreads over naked. Respond ONLY with valid JSON.';
    var prompt='Score '+symbol+' at $'+price+' with 4 filters. 5dVol='+f.avgVol5d.toFixed(0)+' 20dVol='+f.avgVol20d.toFixed(0)+' trend='+f.volTrend+' 5dChg='+f.priceChange5d.toFixed(2)+'% 20dChg='+f.priceChange20d.toFixed(2)+'% ATR=$'+f.atr.toFixed(2)+'('+f.atrPct.toFixed(2)+'%) RSI='+f.rsi.toFixed(1)+' 52wH=$'+f.high52w.toFixed(2)+' 52wL=$'+f.low52w.toFixed(2)+' distHigh='+f.distFromHigh.toFixed(1)+'% upVol='+(f.upVolRatio*100).toFixed(0)+'% expVol='+f.expandingVolBars+'/5 sector='+sp.sector+' peers='+sp.peers.join(',')+' | FILTERS: disp='+f.dispositionProxy.toFixed(2)+' dom='+f.categoryDominance.toFixed(2)+' vel='+f.capitalVelocity.toFixed(2)+' exit='+f.volumeExitSignal.toFixed(2)+' | Return JSON: {symbol,price,filterScores:{disposition,categoryDominance,capitalVelocity,volumeExitTrigger,composite},passesFilters:bool,setup:{direction,strategy,entry:{strike,expiry,type,premium},spread:{longStrike,shortStrike,maxRisk,maxReward},stopLoss,target,riskReward,confidence:0-100,thesis},exitTriggers:[],warnings:[]}';
    var msg=await client.messages.create({model:'claude-sonnet-4-20250514',max_tokens:4096,system:sys,messages:[{role:'user',content:prompt}]});
    var raw=msg.content[0].text,analysis;
    try{analysis=JSON.parse(raw)}catch(e){var m=raw.match(/\{[\s\S]*\}/);if(m)analysis=JSON.parse(m[0]);else return res.status(500).json({error:'Parse failed'});}
    return res.json({...analysis,engine:'options-scoring-v1',dataPoints:bars.length,generatedAt:new Date().toISOString()});
  }catch(err){console.error('[options-scoring]',err.message);return res.status(500).json({error:err.message});}
};
