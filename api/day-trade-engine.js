// Stateful squeeze fire detection (Dr. Wei Chen fix)
  var wasSqueeze=false,justFired=false;
  if(bars.length>=22){var pc2=bars.slice(0,-1).map(function(b){return b.c}),ps2=pc2.slice(-20),pm2=ps2.reduce(function(a,b){return a+b},0)/20,psd2=Math.sqrt(ps2.reduce(function(a,b){return a+Math.pow(b-pm2,2)},0)/20),pbbw2=psd2>0?(4*psd2/pm2*100):0,pa2=0;for(var pi=bars.length-21;pi<bars.length-1;pi++){if(pi>0)pa2+=Math.max(bars[pi].h-bars[pi].l,Math.abs(bars[pi].h-bars[pi-1].c),Math.abs(bars[pi].l-bars[pi-1].c))}pa2/=20;wasSqueeze=pbbw2<(pa2>0?(3*pa2/pm2*100):0);justFired=wasSqueeze&&!squeeze}
  // ============================================================================
// ANKUSHAI DAY TRADE ENGINE v2
// ============================================================================
// 19 specialists + 2 advisors. The revenue engine of AnkushAI.
// CEO Vision: Learn from real QQQ options trades, discover strategies,
// give live intraday calls: "Enter QQQ 480C at $1.50, target $4.80 by 1:30 PM PST"
//
// V2 UPGRADES over V1:
//   1. The Strat combos (Mia Thornton)
//   2. Bollinger Squeeze detection (Dr. Wei Chen)
//   3. Fibonacci extensions + harmonic patterns (Dr. Amir Patel)
//   4. Multi-Timeframe Confluence scoring (Dr. Lisa Park)
//   5. EMA crossover + dynamic S/R (Nina Kowalski)
//   6. Time-of-Day statistical edge (Rachel Torres)
//
// All timestamps PST. Multi-TF: 1m, 5m, 15m, 1h, daily.
// ============================================================================

var SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var POLYGON = process.env.POLYGON_API_KEY || '';
var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

async function fetchJ(url) { var r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
async function supaInsert(t, row) { try { var r = await fetch(SUPABASE_URL+'/rest/v1/'+t, { method:'POST', headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation'}, body:JSON.stringify(row) }); return r.ok ? r.json() : null; } catch(e) { return null; } }
async function supaGet(t, q) { try { var r = await fetch(SUPABASE_URL+'/rest/v1/'+t+'?'+q, { headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY} }); return r.ok ? r.json() : []; } catch(e) { return []; } }
function toPST(d) { return new Date(d).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }); }


// == RATE LIMITER (Ryan Kim + Kai Chen) =======================================
var _rateCache = {};
function rateLimitCheck(action, maxPerMin) {
  var now = Date.now();
  if (!_rateCache[action]) _rateCache[action] = [];
  // Clean old entries (older than 60s)
  _rateCache[action] = _rateCache[action].filter(function(t) { return now - t < 60000; });
  if (_rateCache[action].length >= maxPerMin) return false;
  _rateCache[action].push(now);
  return true;
}

// == MULTI-TIMEFRAME DATA (Ryan Kim) =========================================
async function fetchMultiTF(symbol, dateStr) {
  var res = { symbol:symbol, date:dateStr, tf:{} };
  if (!POLYGON) return res;
  var tfs = [{l:'1m',m:1,s:'minute',n:390},{l:'5m',m:5,s:'minute',n:78},{l:'15m',m:15,s:'minute',n:26},{l:'1h',m:1,s:'hour',n:7}];
  var fetches = tfs.map(function(tf) {
    return fetchJ('https://api.polygon.io/v2/aggs/ticker/'+symbol+'/range/'+tf.m+'/'+tf.s+'/'+dateStr+'/'+dateStr+'?adjusted=true&sort=asc&limit='+tf.n+'&apiKey='+POLYGON)
    .then(function(d){return{l:tf.l,bars:(d.results||[]).map(function(b){return{t:b.t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v}})}})
    .catch(function(){return{l:tf.l,bars:[]}});
  });
  var from60=new Date(new Date(dateStr).getTime()-60*86400000).toISOString().split('T')[0];
  fetches.push(fetchJ('https://api.polygon.io/v2/aggs/ticker/'+symbol+'/range/1/day/'+from60+'/'+dateStr+'?adjusted=true&sort=asc&limit=60&apiKey='+POLYGON).then(function(d){return{l:'daily',bars:(d.results||[]).map(function(b){return{t:b.t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v}})}}).catch(function(){return{l:'daily',bars:[]}}));
  var r=await Promise.allSettled(fetches);
  r.forEach(function(x){if(x.status==='fulfilled'&&x.value)res.tf[x.value.l]=x.value.bars});
  return res;
}

// == CANDLE PATTERNS V2 (Dr. Yuki Sato) ======================================
function detectCandles(bars) {
  if (!bars||bars.length<3) return [];
  var p=[];
  for (var i=2;i<bars.length;i++) {
    var c=bars[i],pr=bars[i-1],pp=bars[i-2];
    var body=Math.abs(c.c-c.o),rng=c.h-c.l,pBody=Math.abs(pr.c-pr.o);
    var bull=c.c>c.o,pBull=pr.c>pr.o;
    if(rng>0&&body/rng<0.1)p.push({i:i,p:'doji',s:'reversal'});
    if(bull&&(c.o-c.l)>body*2&&(c.h-c.c)<body*0.3)p.push({i:i,p:'hammer',s:'bull_rev'});
    if(!bull&&(c.h-c.o)>body*2&&(c.o-c.l)<body*0.3)p.push({i:i,p:'shooting_star',s:'bear_rev'});
    if(bull&&!pBull&&c.o<pr.c&&c.c>pr.o&&body>pBody)p.push({i:i,p:'bull_engulf',s:'bullish'});
    if(!bull&&pBull&&c.o>pr.c&&c.c<pr.o&&body>pBody)p.push({i:i,p:'bear_engulf',s:'bearish'});
    if(bars[i].c>bars[i].o&&bars[i-1].c>bars[i-1].o&&pp.c>pp.o&&bars[i].c>bars[i-1].c)p.push({i:i,p:'3_white',s:'strong_bull'});
    if(bars[i].c<bars[i].o&&bars[i-1].c<bars[i-1].o&&pp.c<pp.o&&bars[i].c<bars[i-1].c)p.push({i:i,p:'3_black',s:'strong_bear'});
    // V2: Morning/Evening star
    if(i>=2&&pBody<body*0.3&&Math.abs(pp.c-pp.o)>body*0.5&&!bull===false&&(pp.c<pp.o)&&c.c>pp.o)p.push({i:i,p:'morning_star',s:'bull_rev'});
    if(i>=2&&pBody<body*0.3&&Math.abs(pp.c-pp.o)>body*0.5&&bull===false&&(pp.c>pp.o)&&c.c<pp.o)p.push({i:i,p:'evening_star',s:'bear_rev'});
  }
  return p.slice(-12);
}

// == THE STRAT COMBOS (Mia Thornton) =========================================
function detectStrat(bars) {
  if (!bars||bars.length<3) return [];
  var combos=[];
  // Classify each bar: 1=inside, 2=directional (2u/2d), 3=outside
  function classify(curr, prev) {
    if(!prev) return {type:'2',dir:curr.c>curr.o?'u':'d'};
    var inside = curr.h<=prev.h && curr.l>=prev.l;
    var outside = curr.h>prev.h && curr.l<prev.l;
    if(inside) return {type:'1',dir:'n'};
    if(outside) return {type:'3',dir:curr.c>curr.o?'u':'d'};
    return {type:'2',dir:curr.h>prev.h?'u':'d'};
  }
  var classes=[];
  for(var i=0;i<bars.length;i++) classes.push(classify(bars[i],i>0?bars[i-1]:null));
  // Detect combos
  for(var j=2;j<classes.length;j++) {
    var a=classes[j-2],b=classes[j-1],c=classes[j];
    var combo=a.type+'-'+b.type+'-'+c.type;
    // 2-1-2 reversal (most powerful Strat setup)
    if(a.type==='2'&&b.type==='1'&&c.type==='2'&&a.dir!==c.dir) combos.push({i:j,combo:'2-1-2_reversal',dir:c.dir,strength:'high'});
    // 2-1-2 continuation
    if(a.type==='2'&&b.type==='1'&&c.type==='2'&&a.dir===c.dir) combos.push({i:j,combo:'2-1-2_continuation',dir:c.dir,strength:'medium'});
    // 3-1-2 (outside bar -> inside -> directional)
    if(a.type==='3'&&b.type==='1'&&c.type==='2') combos.push({i:j,combo:'3-1-2',dir:c.dir,strength:'high'});
    // 3-2-2 continuation
    if(a.type==='3'&&b.type==='2'&&c.type==='2'&&b.dir===c.dir) combos.push({i:j,combo:'3-2-2_continuation',dir:c.dir,strength:'medium'});
    // 1-2-2 expansion
    if(a.type==='1'&&b.type==='2'&&c.type==='2'&&b.dir===c.dir) combos.push({i:j,combo:'1-2-2_expansion',dir:c.dir,strength:'medium'});
  }
  return combos.slice(-8);
}


// == FTFC Ã¢ÂÂ Full Timeframe Continuity (Mia Thornton + Rob Smith Advisory) ====
// The Strat core: when ALL timeframes point same direction = highest probability
function computeFTFC(allTfStrat) {
  var tfs = ["daily","1h","15m","5m","1m"];
  var directions = {};
  var ftfc = {tfs:{},continuity:"none",direction:"neutral",strength:0,actionable:false,summary:""};
  tfs.forEach(function(tf) {
    var strats = allTfStrat[tf] || [];
    var bars = allTfStrat[tf + "_bars"] || [];
    // Get the LAST bar classification for this timeframe
    if (bars.length >= 2) {
      var curr = bars[bars.length-1], prev = bars[bars.length-2];
      var inside = curr.h<=prev.h && curr.l>=prev.l;
      var outside = curr.h>prev.h && curr.l<prev.l;
      var type, dir;
      if (inside) { type="1"; dir="n"; }
      else if (outside) { type="3"; dir=curr.c>curr.o?"u":"d"; }
      else { type="2"; dir=curr.h>prev.h?"u":"d"; }
      ftfc.tfs[tf] = {type:type,dir:dir,label:type+(dir!=="n"?dir:"")};
      directions[tf] = dir;
    }
  });
  // Count alignment
  var ups=0,downs=0,total=0;
  Object.keys(directions).forEach(function(tf) {
    if (directions[tf]==="u") ups++;
    if (directions[tf]==="d") downs++;
    if (directions[tf]!=="n") total++;
  });
  ftfc.strength = total > 0 ? Math.max(ups, downs) : 0;
  if (ups >= 4) { ftfc.continuity="full_bull"; ftfc.direction="bullish"; ftfc.actionable=true; }
  else if (downs >= 4) { ftfc.continuity="full_bear"; ftfc.direction="bearish"; ftfc.actionable=true; }
  else if (ups >= 3) { ftfc.continuity="partial_bull"; ftfc.direction="bullish"; ftfc.actionable=true; }
  else if (downs >= 3) { ftfc.continuity="partial_bear"; ftfc.direction="bearish"; ftfc.actionable=true; }
  else { ftfc.continuity="mixed"; ftfc.direction="neutral"; }
  // Build summary string: "D-2u H-2u 15m-1 5m-2u 1m-2d"
  var labels = {daily:"D","1h":"H","15m":"15m","5m":"5m","1m":"1m"};
  ftfc.summary = tfs.map(function(tf) {
    return (labels[tf]||tf) + "-" + (ftfc.tfs[tf] ? ftfc.tfs[tf].label : "?");
  }).join(" ");
  return ftfc;
}

// == BOLLINGER SQUEEZE (Dr. Wei Chen) ========================================
function detectSqueeze(bars) {
  if(!bars||bars.length<20) return {squeeze:false};
  var closes=bars.map(function(b){return b.c});
  // Bollinger Band Width
  var s20=closes.slice(-20),mn=s20.reduce(function(a,b){return a+b},0)/20;
  var sd=Math.sqrt(s20.reduce(function(a,b){return a+Math.pow(b-mn,2)},0)/20);
  var bbw=sd>0?(4*sd/mn*100):0;
  // Keltner Channel (1.5 ATR)
  var atrSum=0;
  for(var i=bars.length-20;i<bars.length;i++){
    if(i>0) atrSum+=Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-bars[i-1].c),Math.abs(bars[i].l-bars[i-1].c));
  }
  var atr=atrSum/20;
  var kcWidth=atr>0?(3*atr/mn*100):0;
  var squeeze=bbw<kcWidth; // BB inside KC = squeeze
  // Historical BBW for percentile
  var bbwHist=[];
  for(var j=20;j<=closes.length;j++){
    var sl=closes.slice(j-20,j),m=sl.reduce(function(a,b){return a+b},0)/20;
    var s=Math.sqrt(sl.reduce(function(a,b){return a+Math.pow(b-m,2)},0)/20);
    bbwHist.push(s>0?4*s/m*100:0);
  }
  bbwHist.sort(function(a,b){return a-b});
  var pctile=bbwHist.length>0?Math.round(bbwHist.filter(function(x){return x<=bbw}).length/bbwHist.length*100):50;
  // Direction hint: momentum from last 3 bars
  var last3=closes.slice(-3);
  var momDir=last3[2]>last3[0]?'bullish':'bearish';
  return {squeeze:squeeze,bbw:+bbw.toFixed(3),kcw:+kcWidth.toFixed(3),pctile:pctile,momDir:momDir,fired:justFired,wasSqueeze:wasSqueeze};
}

// == FIBONACCI (Dr. Amir Patel) ==============================================
function detectFibs(bars) {
  if(!bars||bars.length<20) return {};
  // Find swing high and swing low in recent bars
  var highs=bars.map(function(b){return b.h}),lows=bars.map(function(b){return b.l});
  var swingHigh=Math.max.apply(null,highs.slice(-20));
  var swingLow=Math.min.apply(null,lows.slice(-20));
  var range=swingHigh-swingLow;
  if(range<=0) return {};
  var last=bars[bars.length-1].c;
  var trending=last>((swingHigh+swingLow)/2)?'up':'down';
  // Retracement levels (from the trend)
  var fibs;
  if(trending==='up'){
    fibs={
      '0%':+swingLow.toFixed(2),'23.6%':+(swingLow+range*0.236).toFixed(2),
      '38.2%':+(swingLow+range*0.382).toFixed(2),'50%':+(swingLow+range*0.5).toFixed(2),
      '61.8%':+(swingLow+range*0.618).toFixed(2),'78.6%':+(swingLow+range*0.786).toFixed(2),
      '100%':+swingHigh.toFixed(2),
      // Extensions
      '127.2%':+(swingHigh+range*0.272).toFixed(2),'161.8%':+(swingHigh+range*0.618).toFixed(2)
    };
  } else {
    fibs={
      '100%':+swingLow.toFixed(2),'78.6%':+(swingHigh-range*0.786).toFixed(2),
      '61.8%':+(swingHigh-range*0.618).toFixed(2),'50%':+(swingHigh-range*0.5).toFixed(2),
      '38.2%':+(swingHigh-range*0.382).toFixed(2),'23.6%':+(swingHigh-range*0.236).toFixed(2),
      '0%':+swingHigh.toFixed(2),
      '127.2%':+(swingLow-range*0.272).toFixed(2),'161.8%':+(swingLow-range*0.618).toFixed(2)
    };
  }
  // Nearest fib to current price
  var nearest=null,nearDist=Infinity;
  Object.keys(fibs).forEach(function(k){var d=Math.abs(last-fibs[k]);if(d<nearDist){nearDist=d;nearest=k}});
  return {trend:trending,swingHigh:+swingHigh.toFixed(2),swingLow:+swingLow.toFixed(2),levels:fibs,nearestFib:nearest,nearestPrice:fibs[nearest],distToNearest:+nearDist.toFixed(2)};
}


// == HARMONIC PATTERNS (Dr. Amir Patel) ======================================
// Gartley, Butterfly, Bat â XABCD point identification
function detectHarmonics(bars) {
  if (!bars || bars.length < 20) return [];
  var harmonics = [];
  // Find swing points (local highs and lows)
  var swings = [];
  for (var i = 2; i < bars.length - 2; i++) {
    if (bars[i].h > bars[i-1].h && bars[i].h > bars[i-2].h && bars[i].h > bars[i+1].h && bars[i].h > bars[i+2].h)
      swings.push({idx:i, type:"high", price:bars[i].h});
    if (bars[i].l < bars[i-1].l && bars[i].l < bars[i-2].l && bars[i].l < bars[i+1].l && bars[i].l < bars[i+2].l)
      swings.push({idx:i, type:"low", price:bars[i].l});
  }
  if (swings.length < 5) return [];
  // Check last 5 swing points for XABCD pattern
  var recent = swings.slice(-5);
  var X=recent[0].price,A=recent[1].price,B=recent[2].price,C=recent[3].price,D=recent[4].price;
  var XA=Math.abs(A-X),AB=Math.abs(B-A),BC=Math.abs(C-B),CD=Math.abs(D-C);
  if (XA===0) return [];
  var abRatio=AB/XA,bcRatio=BC/AB,cdRatio=CD/BC;
  // Gartley: AB=0.618 of XA, BC=0.382-0.886 of AB, CD=1.27-1.618 of BC
  if (abRatio>0.55&&abRatio<0.72&&bcRatio>0.3&&bcRatio<0.95&&cdRatio>1.1&&cdRatio<1.8)
    harmonics.push({pattern:"gartley",direction:D>C?"bullish":"bearish",completion:+D.toFixed(2),confidence:70});
  // Butterfly: AB=0.786 of XA, CD=1.618-2.618 of BC
  if (abRatio>0.7&&abRatio<0.88&&cdRatio>1.5&&cdRatio<2.8)
    harmonics.push({pattern:"butterfly",direction:D>C?"bullish":"bearish",completion:+D.toFixed(2),confidence:60});
  // Bat: AB=0.382-0.50 of XA, CD=1.618-2.618 of BC
  if (abRatio>0.33&&abRatio<0.55&&cdRatio>1.5&&cdRatio<2.8)
    harmonics.push({pattern:"bat",direction:D>C?"bullish":"bearish",completion:+D.toFixed(2),confidence:65});
  return harmonics;
}

// == EMA CROSSOVER + DYNAMIC S/R (Nina Kowalski) =============================
function emaAnalysis(bars) {
  if(!bars||bars.length<21) return {};
  var closes=bars.map(function(b){return b.c}),last=closes[closes.length-1];
  function ema(arr,p){if(arr.length<p)return null;var k=2/(p+1),e=arr[0];for(var i=1;i<arr.length;i++)e=arr[i]*k+e*(1-k);return+e.toFixed(4)}
  var e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50);
  // Crossover detection (look at last 2 bars)
  var prev=closes.slice(0,-1);
  var pe9=ema(prev,9),pe21=ema(prev,21);
  var cross='none';
  if(pe9&&pe21&&e9&&e21){
    if(pe9<pe21&&e9>e21)cross='golden_cross_9_21';
    if(pe9>pe21&&e9<e21)cross='death_cross_9_21';
  }
  // Cloud position
  var cloud='mixed';
  if(e9&&e21&&e50){
    if(last>e9&&e9>e21&&e21>e50)cloud='strong_bull';
    else if(last>e9&&e9>e21)cloud='bull';
    else if(last<e9&&e9<e21&&(e50===null||e21<e50))cloud='strong_bear';
    else if(last<e9&&e9<e21)cloud='bear';
    else if(last>e21&&last<e9)cloud='pullback_in_uptrend';
    else if(last<e21&&last>e9)cloud='bounce_in_downtrend';
  }
  return {ema9:e9,ema21:e21,ema50:e50,cross:cross,cloud:cloud,priceVs9:e9?+((last-e9)/e9*100).toFixed(2):null,priceVs21:e21?+((last-e21)/e21*100).toFixed(2):null};
}

// == KEY LEVELS V2 (Jake Morrison + Tomas Guerrero + Sophie Laurent + Anika Rao)
function detectLevels(dailyBars, intradayBars) {
  var lv={};
  if(dailyBars&&dailyBars.length>=2){
    var prev=dailyBars[dailyBars.length-2];
    lv.pdH=prev.h;lv.pdL=prev.l;lv.pdC=prev.c;lv.pdO=prev.o;
    // Pivot points (classic floor trader)
    var pivot=+(( prev.h+prev.l+prev.c)/3).toFixed(2);
    lv.pivot=pivot;lv.r1=+(2*pivot-prev.l).toFixed(2);lv.s1=+(2*pivot-prev.h).toFixed(2);
    lv.r2=+(pivot+(prev.h-prev.l)).toFixed(2);lv.s2=+(pivot-(prev.h-prev.l)).toFixed(2);
  }
  if(intradayBars&&intradayBars.length>0){
    var cumV=0,cumTP=0;
    intradayBars.forEach(function(b){var tp=(b.h+b.l+b.c)/3;cumTP+=tp*(b.v||1);cumV+=(b.v||1)});
    lv.vwap=cumV>0?+(cumTP/cumV).toFixed(2):null;
    // VWAP upper/lower bands (1 std dev)
    if(lv.vwap&&intradayBars.length>10){
      var vwapVar=0;
      intradayBars.forEach(function(b){var tp=(b.h+b.l+b.c)/3;vwapVar+=Math.pow(tp-lv.vwap,2)*(b.v||1)});
      var vwapStd=Math.sqrt(vwapVar/cumV);
      lv.vwapUpper=+(lv.vwap+vwapStd).toFixed(2);
      lv.vwapLower=+(lv.vwap-vwapStd).toFixed(2);
    }
  }
  if(intradayBars&&intradayBars.length>=30){
    var f30=intradayBars.slice(0,30);
    lv.orH=Math.max.apply(null,f30.map(function(b){return b.h}));
    lv.orL=Math.min.apply(null,f30.map(function(b){return b.l}));
  }
  if(dailyBars&&dailyBars.length>=5){
    lv.weekH=Math.max.apply(null,dailyBars.slice(-5).map(function(b){return b.h}));
    lv.weekL=Math.min.apply(null,dailyBars.slice(-5).map(function(b){return b.l}));
  }
  return lv;
}

// == INDICATORS V2 (all specialists) ==========================================
function indicators(bars) {
  if(!bars||bars.length<10)return{};
  var closes=bars.map(function(b){return b.c}),last=closes[closes.length-1];
  function ema(a,p){if(a.length<p)return null;var k=2/(p+1),e=a[0];for(var i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return+e.toFixed(4)}
  var e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50);
  var gains=0,losses=0,per=Math.min(14,closes.length-1);
  for(var i=closes.length-per;i<closes.length;i++){var d=closes[i]-closes[i-1];if(d>0)gains+=d;else losses-=d}
  var rs=losses>0?gains/losses:100,rsi=+(100-100/(1+rs)).toFixed(1);
  var bb={};
  if(closes.length>=20){var s=closes.slice(-20),m=s.reduce(function(a,b){return a+b},0)/20,v=s.reduce(function(a,b){return a+Math.pow(b-m,2)},0)/20,sd=Math.sqrt(v);bb={u:+(m+2*sd).toFixed(2),m:+m.toFixed(2),l:+(m-2*sd).toFixed(2),pctB:sd>0?+((last-(m-2*sd))/(4*sd)*100).toFixed(1):50}}
  return{ema9:e9,ema21:e21,ema50:e50,rsi:rsi,bb:bb,last:last};
}

// == MULTI-TIMEFRAME CONFLUENCE (Dr. Lisa Park) ===============================
function confluenceScore(allTfData) {
  // Day-trade optimized weights: 5m/15m are primary signal TFs
  // Daily provides context, but intraday TFs drive entries
  var tfWeights={'1m':1.5,'5m':3,'15m':4,'1h':3,'daily':2};
  var bullScore=0,bearScore=0,totalWeight=0;
  Object.keys(allTfData).forEach(function(tf){
    var d=allTfData[tf];
    var w=tfWeights[tf]||1;
    if(!d||!d.indicators)return;
    var ind=d.indicators;
    // EMA alignment
    if(ind.ema9&&ind.ema21&&ind.last>ind.ema9&&ind.ema9>ind.ema21)bullScore+=w*2;
    if(ind.ema9&&ind.ema21&&ind.last<ind.ema9&&ind.ema9<ind.ema21)bearScore+=w*2;
    // RSI
    if(ind.rsi>55)bullScore+=w;if(ind.rsi<45)bearScore+=w;
    // Candle patterns
    if(d.candles){d.candles.forEach(function(c){
      if(c.s&&c.s.includes('bull'))bullScore+=w;
      if(c.s&&c.s.includes('bear'))bearScore+=w;
    })}
    // Strat combos
    if(d.strat){d.strat.forEach(function(s){
      if(s.dir==='u')bullScore+=w*1.5;
      if(s.dir==='d')bearScore+=w*1.5;
    })}
    // Squeeze fired
    // MACD
    if(d.macd&&d.macd.cross==='bullish_cross')bullScore+=w*2;
    if(d.macd&&d.macd.cross==='bearish_cross')bearScore+=w*2;
    if(d.macd&&d.macd.divergence==='bullish_divergence')bullScore+=w*2.5;
    if(d.macd&&d.macd.divergence==='bearish_divergence')bearScore+=w*2.5;
    // ADX-weighted signals (stronger trends = higher weight)
    var adxMult=d.adx&&d.adx.strong?1.5:d.adx&&d.adx.trending?1.2:1;
    bullScore*=adxMult;bearScore*=adxMult;
    if(d.squeeze&&d.squeeze.fired){
      if(d.squeeze.momDir==='bullish')bullScore+=w*2;else bearScore+=w*2;
    }
    totalWeight+=w;
  });
  var total=bullScore+bearScore;
  // FTFC bonus: full continuity adds significant weight
  // (computed separately but reported alongside confluence)
  return{bullPct:total>0?Math.round(bullScore/total*100):50,bearPct:total>0?Math.round(bearScore/total*100):50,raw:{bull:+bullScore.toFixed(1),bear:+bearScore.toFixed(1)},bias:bullScore>bearScore*1.3?'BULLISH':bearScore>bullScore*1.3?'BEARISH':'NEUTRAL',strength:total>20?'strong':total>10?'moderate':'weak'};
}

// == TIME-OF-DAY EDGE (Rachel Torres) =========================================
function timeOfDayEdge(entryTimePST) {
  var edges = {
    '6:30-7:00': {label:'Pre-open momentum',edge:'high_vol_breakouts',note:'Gap continuation or reversal. Most volatile 30 min.'},
    '7:00-7:30': {label:'Opening range formation',edge:'OR_breakout',note:'Wait for OR to form. Breakout above/below is directional.'},
    '7:30-8:00': {label:'OR continuation',edge:'trend_following',note:'If OR breakout held, ride the trend. If failed, fade.'},
    '8:00-9:00': {label:'Mid-morning chop',edge:'mean_reversion',note:'Lowest edge window. Chop between levels. Reduce size.'},
    '9:00-10:00': {label:'European close overlap',edge:'reversal_watch',note:'European close can trigger reversals. Watch for exhaustion.'},
    '10:00-11:00': {label:'Lunch lull',edge:'avoid',note:'Lowest volume. Worst time to trade. Sit on hands.'},
    '11:00-12:00': {label:'Afternoon setup',edge:'positioning',note:'Smart money repositions for close. Watch for accumulation.'},
    '12:00-13:00': {label:'Power hour',edge:'trend_acceleration',note:'Highest conviction moves. If trend is clear, add size.'}
  };
  if(!entryTimePST) return {current:'unknown',edges:edges};
  var parts=entryTimePST.split(':');
  var h=parseInt(parts[0]),m=parseInt(parts[1]||0);
  var totalMin=h*60+m;
  var current='outside_hours';
  if(totalMin>=390&&totalMin<420)current='6:30-7:00';
  else if(totalMin>=420&&totalMin<450)current='7:00-7:30';
  else if(totalMin>=450&&totalMin<480)current='7:30-8:00';
  else if(totalMin>=480&&totalMin<540)current='8:00-9:00';
  else if(totalMin>=540&&totalMin<600)current='9:00-10:00';
  else if(totalMin>=600&&totalMin<660)current='10:00-11:00';
  else if(totalMin>=660&&totalMin<720)current='11:00-12:00';
  else if(totalMin>=720&&totalMin<780)current='12:00-13:00';
  return {current:current,info:edges[current]||{label:'Outside hours',edge:'none',note:'Market closed'},allEdges:edges};
}


// == MACD + DIVERGENCE (Marcus Webb + Carlos Vega) ============================
function macdAnalysis(bars) {
  if(!bars||bars.length<26)return{};
  var closes=bars.map(function(b){return b.c});
  function ema(arr,p){if(arr.length<p)return null;var k=2/(p+1),e=arr[0];for(var i=1;i<arr.length;i++)e=arr[i]*k+e*(1-k);return e}
  // MACD Line = EMA(12) - EMA(26)
  var ema12=ema(closes,12),ema26=ema(closes,26);
  if(!ema12||!ema26)return{};
  var macdLine=ema12-ema26;
  // Signal Line = EMA(9) of MACD line (approximate with recent)
  var macdHist=[];
  for(var i=26;i<=closes.length;i++){
    var e12=ema(closes.slice(0,i),12),e26=ema(closes.slice(0,i),26);
    if(e12&&e26)macdHist.push(e12-e26);
  }
  var signal=macdHist.length>=9?ema(macdHist,9):null;
  var histogram=signal?+(macdLine-signal).toFixed(4):null;
  // Crossover detection
  var cross="none";
  if(macdHist.length>=2&&signal){
    var prevMacd=macdHist[macdHist.length-2],prevSig=macdHist.length>=10?ema(macdHist.slice(0,-1),9):null;
    if(prevSig&&prevMacd<prevSig&&macdLine>signal)cross="bullish_cross";
    if(prevSig&&prevMacd>prevSig&&macdLine<signal)cross="bearish_cross";
  }
  // RSI divergence (price vs RSI)
  var divergence="none";
  if(bars.length>=20){
    var recent10=closes.slice(-10),prev10=closes.slice(-20,-10);
    var recentHigh=Math.max.apply(null,recent10),prevHigh=Math.max.apply(null,prev10);
    var recentLow=Math.min.apply(null,recent10),prevLow=Math.min.apply(null,prev10);
    // Compute RSI for both periods
    function quickRsi(arr){var g=0,l=0;for(var i=1;i<arr.length;i++){var d=arr[i]-arr[i-1];if(d>0)g+=d;else l-=d}var rs=l>0?g/l:100;return 100-100/(1+rs)}
    var rsiRecent=quickRsi(recent10),rsiPrev=quickRsi(prev10);
    if(recentHigh>prevHigh&&rsiRecent<rsiPrev)divergence="bearish_divergence";
    if(recentLow<prevLow&&rsiRecent>rsiPrev)divergence="bullish_divergence";
  }
  return{macd:+macdLine.toFixed(4),signal:signal?+signal.toFixed(4):null,histogram:histogram,cross:cross,divergence:divergence};
}

// == PRE-MARKET + GAP ANALYSIS (Omar Hassan + Sophie Laurent) ================
function gapAnalysis(dailyBars, intradayBars) {
  if(!dailyBars||dailyBars.length<2)return{};
  var prev=dailyBars[dailyBars.length-2],today=dailyBars[dailyBars.length-1];
  var gapPct=prev.c>0?+((today.o-prev.c)/prev.c*100).toFixed(2):0;
  var gapDir=gapPct>0.1?"gap_up":gapPct<-0.1?"gap_down":"flat_open";
  // Gap fill check: did price retrace to prev close?
  var gapFilled=false;
  if(intradayBars&&intradayBars.length>0){
    if(gapDir==="gap_up")gapFilled=intradayBars.some(function(b){return b.l<=prev.c});
    if(gapDir==="gap_down")gapFilled=intradayBars.some(function(b){return b.h>=prev.c});
  }
  // Pre-market levels (from first bar if available)
  var pmHigh=null,pmLow=null;
  if(intradayBars&&intradayBars.length>0){
    // Bars before 9:30 ET (6:30 PST) = pre-market
    var pmBars=intradayBars.filter(function(b){
      var d=new Date(b.t);var h=d.getUTCHours();return h<13||(h===13&&d.getUTCMinutes()<30);
    });
    if(pmBars.length>0){
      pmHigh=Math.max.apply(null,pmBars.map(function(b){return b.h}));
      pmLow=Math.min.apply(null,pmBars.map(function(b){return b.l}));
    }
  }
  return{gapPct:gapPct,gapDir:gapDir,gapFilled:gapFilled,prevClose:prev.c,todayOpen:today.o,pmHigh:pmHigh,pmLow:pmLow,
    gapFillProb:Math.abs(gapPct)<0.5?"high (small gap)":Math.abs(gapPct)<1?"moderate":"low (large gap)"};
}

// == ADX ÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ TREND STRENGTH (Dr. Lisa Park) ====================================
function adxCalc(bars) {
  if(!bars||bars.length<28)return{adx:null,trending:false};
  var period=14,pDM=[],nDM=[],tr=[];
  for(var i=1;i<bars.length;i++){
    var upMove=bars[i].h-bars[i-1].h,downMove=bars[i-1].l-bars[i].l;
    pDM.push(upMove>downMove&&upMove>0?upMove:0);
    nDM.push(downMove>upMove&&downMove>0?downMove:0);
    tr.push(Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-bars[i-1].c),Math.abs(bars[i].l-bars[i-1].c)));
  }
  if(tr.length<period)return{adx:null,trending:false};
  // Smoothed averages
  var sPDM=pDM.slice(0,period).reduce(function(a,b){return a+b},0);
  var sNDM=nDM.slice(0,period).reduce(function(a,b){return a+b},0);
  var sTR=tr.slice(0,period).reduce(function(a,b){return a+b},0);
  var dx=[];
  for(var j=period;j<tr.length;j++){
    sPDM=sPDM-sPDM/period+pDM[j];sNDM=sNDM-sNDM/period+nDM[j];sTR=sTR-sTR/period+tr[j];
    var pDI=sTR>0?sPDM/sTR*100:0,nDI=sTR>0?sNDM/sTR*100:0;
    dx.push(pDI+nDI>0?Math.abs(pDI-nDI)/(pDI+nDI)*100:0);
  }
  if(dx.length<period)return{adx:null,trending:false};
  var adx=dx.slice(0,period).reduce(function(a,b){return a+b},0)/period;
  for(var k=period;k<dx.length;k++)adx=(adx*(period-1)+dx[k])/period;
  return{adx:+adx.toFixed(1),trending:adx>25,strong:adx>40,choppy:adx<20,signal:adx>40?"strong_trend":adx>25?"trending":adx>20?"weak_trend":"choppy_range"};
}

// == ANCHORED VWAP (Anika Rao) ===============================================
function anchoredVWAP(bars, anchorIndex) {
  if(!bars||anchorIndex<0||anchorIndex>=bars.length)return null;
  var cumVol=0,cumTP=0;
  for(var i=anchorIndex;i<bars.length;i++){var tp=(bars[i].h+bars[i].l+bars[i].c)/3;cumTP+=tp*(bars[i].v||1);cumVol+=(bars[i].v||1)}
  return cumVol>0?+(cumTP/cumVol).toFixed(2):null;
}
function computeAVWAPs(dailyBars) {
  if(!dailyBars||dailyBars.length<5)return{};
  var avwaps={};
  // Anchor from swing low (lowest low in last 10 bars)
  var minIdx=0,minVal=Infinity;
  for(var i=Math.max(0,dailyBars.length-10);i<dailyBars.length;i++){if(dailyBars[i].l<minVal){minVal=dailyBars[i].l;minIdx=i}}
  avwaps.fromSwingLow=anchoredVWAP(dailyBars,minIdx);
  // Anchor from swing high
  var maxIdx=0,maxVal=0;
  for(var j=Math.max(0,dailyBars.length-10);j<dailyBars.length;j++){if(dailyBars[j].h>maxVal){maxVal=dailyBars[j].h;maxIdx=j}}
  avwaps.fromSwingHigh=anchoredVWAP(dailyBars,maxIdx);
  // Anchor from 5 days ago (weekly AVWAP)
  if(dailyBars.length>=5)avwaps.weekly=anchoredVWAP(dailyBars,dailyBars.length-5);
  return avwaps;
}


// == OPTIONS PRICING + GREEKS (Victoria Chang + Dr. Nikolai Petrov) ===========
// Black-Scholes estimator + Polygon chain data + Yahoo fallback
// Enables: "the 480C at $1.50 could reach $X if QQQ moves to $Y"

// Standard normal CDF approximation (Abramowitz & Stegun)
function normCDF(x) {
  var a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  var sign=x<0?-1:1; x=Math.abs(x)/Math.sqrt(2);
  var t=1/(1+p*x);
  var y=1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5*(1+sign*y);
}

// Black-Scholes pricing + Greeks
function blackScholes(S, K, T, r, sigma, type) {
  // S=spot, K=strike, T=years to expiry, r=risk-free rate, sigma=annual vol, type="call"|"put"
  if (T <= 0 || sigma <= 0) return { price: Math.max(0, type==="call" ? S-K : K-S), delta: type==="call"?1:(-1), gamma: 0, theta: 0, vega: 0, iv: sigma };
  var d1 = (Math.log(S/K) + (r + sigma*sigma/2)*T) / (sigma*Math.sqrt(T));
  var d2 = d1 - sigma*Math.sqrt(T);
  var price, delta;
  if (type === "call") {
    price = S*normCDF(d1) - K*Math.exp(-r*T)*normCDF(d2);
    delta = normCDF(d1);
  } else {
    price = K*Math.exp(-r*T)*normCDF(-d2) - S*normCDF(-d1);
    delta = normCDF(d1) - 1;
  }
  // Greeks
  var nd1 = Math.exp(-d1*d1/2) / Math.sqrt(2*Math.PI); // PDF of d1
  var gamma = nd1 / (S*sigma*Math.sqrt(T));
  var theta = -(S*nd1*sigma)/(2*Math.sqrt(T)) - (type==="call"?1:-1)*r*K*Math.exp(-r*T)*normCDF((type==="call"?1:-1)*d2);
  theta = theta / 365; // daily theta
  var vega = S*nd1*Math.sqrt(T) / 100; // per 1% vol change
  return { price: +price.toFixed(4), delta: +delta.toFixed(4), gamma: +gamma.toFixed(6), theta: +theta.toFixed(4), vega: +vega.toFixed(4), iv: sigma };
}

// Scenario calculator: if QQQ moves to targetPrice, what happens to the option?
function optionScenario(currentQQQ, strike, dte, vol, type, targetQQQ, targetDte) {
  var r = 0.053; // ~5.3% risk-free rate
  var T_now = dte / 365;
  var T_target = (targetDte !== undefined ? targetDte : Math.max(0, dte - 1)) / 365;
  var now = blackScholes(currentQQQ, strike, T_now, r, vol, type);
  var then = blackScholes(targetQQQ, strike, T_target, r, vol, type);
  return {
    current: { qqqPrice: currentQQQ, optionPrice: now.price, delta: now.delta, gamma: now.gamma, theta: now.theta },
    projected: { qqqPrice: targetQQQ, optionPrice: then.price, delta: then.delta, gamma: then.gamma, theta: then.theta },
    change: { qqqMove: +(targetQQQ - currentQQQ).toFixed(2), qqqMovePct: +((targetQQQ - currentQQQ) / currentQQQ * 100).toFixed(2),
      optionMove: +(then.price - now.price).toFixed(4), optionMovePct: now.price > 0 ? +((then.price - now.price) / now.price * 100).toFixed(1) : 0 }
  };
}

// Fetch QQQ options chain via Yahoo Finance (server-side, free)
async function fetchOptionsChain(symbol) {
  try {
    var r = await fetch("https://query1.finance.yahoo.com/v7/finance/options/" + symbol, {signal: AbortSignal.timeout(5000)}).then(function(res){if(!res.ok)throw new Error("HTTP "+res.status);return res.json()});
    var chain = r.optionChain && r.optionChain.result && r.optionChain.result[0];
    if (!chain) return { available: false };
    var calls = chain.options && chain.options[0] ? chain.options[0].calls || [] : [];
    var puts = chain.options && chain.options[0] ? chain.options[0].puts || [] : [];
    var expirations = (chain.expirationDates || []).map(function(ts) { return new Date(ts * 1000).toISOString().split("T")[0]; });
    // Find ATM strike (closest to current price)
    var quote = chain.quote || {};
    var price = quote.regularMarketPrice || 0;
    // Get calls near the money (5 strikes above and below)
    var atmCalls = calls.filter(function(c) { return Math.abs(c.strike - price) <= 10; }).slice(0, 10);
    var atmPuts = puts.filter(function(p) { return Math.abs(p.strike - price) <= 10; }).slice(0, 10);
    return {
      available: true,
      price: price,
      expirations: expirations.slice(0, 8),
      nearestExpiry: expirations[0],
      atmCalls: atmCalls.map(function(c) { return { strike: c.strike, last: c.lastPrice, bid: c.bid, ask: c.ask, iv: c.impliedVolatility ? +(c.impliedVolatility * 100).toFixed(1) : null, vol: c.volume, oi: c.openInterest }; }),
      atmPuts: atmPuts.map(function(p) { return { strike: p.strike, last: p.lastPrice, bid: p.bid, ask: p.ask, iv: p.impliedVolatility ? +(p.impliedVolatility * 100).toFixed(1) : null, vol: p.volume, oi: p.openInterest }; }),
      totalCalls: calls.length,
      totalPuts: puts.length
    };
  } catch (e) { return { available: false, error: e.message }; }
}

// Compute historical volatility from daily bars (for Black-Scholes input)
function historicalVol(dailyBars, lookback) {
  if (!dailyBars || dailyBars.length < (lookback || 20) + 1) return 0.3; // default 30%
  var n = lookback || 20;
  var returns = [];
  for (var i = dailyBars.length - n; i < dailyBars.length; i++) {
    if (dailyBars[i - 1] && dailyBars[i - 1].c > 0) returns.push(Math.log(dailyBars[i].c / dailyBars[i - 1].c));
  }
  if (returns.length < 5) return 0.3;
  var mean = returns.reduce(function(a, b) { return a + b; }, 0) / returns.length;
  var variance = returns.reduce(function(a, b) { return a + Math.pow(b - mean, 2); }, 0) / (returns.length - 1);
  return +((Math.sqrt(variance) * Math.sqrt(252))).toFixed(4); // annualized
}

// Full options analysis for a QQQ trade
async function optionsAnalysis(dailyBars, trade) {
  trade = trade || {};
  var qqqPrice = dailyBars && dailyBars.length > 0 ? dailyBars[dailyBars.length - 1].c : 0;
  var hv = historicalVol(dailyBars, 20);
  var result = { qqqPrice: qqqPrice, historicalVol: +(hv * 100).toFixed(1) + "%", chain: null, estimates: {} };
  // Try to get real chain data
  result.chain = await fetchOptionsChain("QQQ");
  // If trade has strike info, compute estimates
  if (trade && trade.strike) {
    var dte = trade.expiry ? Math.max(0, Math.ceil((new Date(trade.expiry) - new Date()) / 86400000)) : 1;
    if (trade.date && trade.expiry) dte = Math.max(0, Math.ceil((new Date(trade.expiry) - new Date(trade.date)) / 86400000));
    var type = (trade.direction || "call").toLowerCase().includes("put") ? "put" : "call";
    var iv = hv * 1.15; // IV typically 15% above HV
    // Use chain IV if available
    if (result.chain && result.chain.available && result.chain.atmCalls) {
      var matching = (type === "call" ? result.chain.atmCalls : result.chain.atmPuts).find(function(c) { return c.strike === trade.strike; });
      if (matching && matching.iv) iv = matching.iv / 100;
    }
    var atEntry = blackScholes(trade.qqqAtEntry || qqqPrice, trade.strike, dte / 365, 0.053, iv, type);
    result.estimates.atEntry = atEntry;
    result.estimates.iv = +(iv * 100).toFixed(1) + "%";
    result.estimates.dte = dte;
    // Scenario: if QQQ moves ÃÂÃÂ±$2, ÃÂÃÂ±$5
    var base = trade.qqqAtEntry || qqqPrice;
    result.estimates.scenarios = [
      { label: "QQQ +$2", result: optionScenario(base, trade.strike, dte, iv, type, base + 2) },
      { label: "QQQ +$5", result: optionScenario(base, trade.strike, dte, iv, type, base + 5) },
      { label: "QQQ -$2", result: optionScenario(base, trade.strike, dte, iv, type, base - 2) },
      { label: "QQQ -$5", result: optionScenario(base, trade.strike, dte, iv, type, base - 5) },
    ];
  }
  return result;
}

// == FULL ANALYSIS PIPELINE ===================================================
async function fullAnalysis(symbol, dateStr, entryTimePST, trade) {
  var mtf = await fetchMultiTF(symbol, dateStr);
  var allTfData = {};
  Object.keys(mtf.tf).forEach(function(tf) {
    allTfData[tf] = {
      bars: mtf.tf[tf].length,
      candles: detectCandles(mtf.tf[tf]),
      strat: detectStrat(mtf.tf[tf]),
      squeeze: detectSqueeze(mtf.tf[tf]),
      fibs: detectFibs(mtf.tf[tf]),
      ema: emaAnalysis(mtf.tf[tf]),
      indicators: indicators(mtf.tf[tf]),
      macd: macdAnalysis(mtf.tf[tf]),
      harmonics: detectHarmonics(mtf.tf[tf]),
      adx: adxCalc(mtf.tf[tf])
    };
  });
  var levels = detectLevels(mtf.tf['daily']||[], mtf.tf['1m']||[]);
  var gap = gapAnalysis(mtf.tf['daily']||[], mtf.tf['1m']||[]);
  var avwaps = computeAVWAPs(mtf.tf['daily']||[]);
  var confluence = confluenceScore(allTfData);
  var todEdge = timeOfDayEdge(entryTimePST);
  // Sector leaders
  var leaders={};
  try{
    var lr=await Promise.allSettled(['AAPL','MSFT','NVDA'].map(function(s){
      return fetchJ('https://api.polygon.io/v2/aggs/ticker/'+s+'/range/5/minute/'+dateStr+'/'+dateStr+'?adjusted=true&sort=asc&limit=78&apiKey='+POLYGON)
      .then(function(d){var b=d.results||[];return{sym:s,chg:b.length>=2?+((b[b.length-1].c-b[0].o)/b[0].o*100).toFixed(2):0}});
    }));
    lr.forEach(function(r){if(r.status==='fulfilled')leaders[r.value.sym]=r.value.chg+'%'});
  }catch(e){}
  var options = await optionsAnalysis(mtf.tf['daily']||[], trade);
  // FTFC computation
  var ftfcInput = {};
  Object.keys(allTfData).forEach(function(tf) { ftfcInput[tf] = allTfData[tf].strat; ftfcInput[tf+'_bars'] = mtf.tf[tf] || []; });
  var ftfc = computeFTFC(ftfcInput);
  return{allTfData:allTfData,levels:levels,gap:gap,avwaps:avwaps,confluence:confluence,ftfc:ftfc,todEdge:todEdge,leaders:leaders,options:options};
}

// == LOG TRADE ================================================================
async function logTrade(body) {
  var td={date:body.date,entryTime:body.entryTime,exitTime:body.exitTime,direction:body.direction||'call',strike:body.strike,expiry:body.expiry,entryPrice:body.entryPrice,exitPrice:body.exitPrice,contracts:body.contracts||1,pnl:body.exitPrice&&body.entryPrice?+((body.exitPrice-body.entryPrice)*(body.contracts||1)*100).toFixed(2):null,pnlPct:body.exitPrice&&body.entryPrice?+(((body.exitPrice-body.entryPrice)/body.entryPrice)*100).toFixed(1):null,notes:body.notes||'',qqqAtEntry:body.qqqAtEntry,qqqAtExit:body.qqqAtExit,status:'logged'};
  var r=await supaInsert('journal_entries',{user_id:body.userId||'ankush',type:'day_trade_backlog',symbol:'QQQ',content:JSON.stringify(td),created_at:new Date().toISOString()});
  return{success:!!r,trade:td};
}

// == BACKTEST + AI (Claude strategy discovery) ================================
async function backtest(body) {
  var td=typeof body==='string'?JSON.parse(body):body;
  var analysis=await fullAnalysis('QQQ',td.date,td.entryTime,td);

  if(!ANTHROPIC_KEY)return{analysis:analysis,trade:td,ai:{error:'No API key'}};

  // Build V2 prompt with ALL specialist data
  var prompt='You are 19 elite QQQ day trade specialists. You have:\n'+
  '- The Strat combos (2-1-2, 3-1-2, etc)\n- Bollinger Squeeze detection\n- Fibonacci extensions\n- Multi-TF Confluence scoring\n- EMA crossover analysis\n- Time-of-Day edge modeling\n- Candle patterns across 5 timeframes\n- Key levels (VWAP, OR, Pivot, S/R)\n- Sector leader context\n\n'+
  'TRADE: '+td.date+' | '+td.direction.toUpperCase()+' '+td.strike+' | Entry $'+td.entryPrice+' at '+td.entryTime+' PST -> Exit $'+td.exitPrice+' at '+td.exitTime+' PST\n'+
  'QQQ: $'+td.qqqAtEntry+' -> $'+td.qqqAtExit+' | Contract P&L: '+(td.pnlPct>=0?'+':'')+td.pnlPct+'%\n'+
  'Notes: '+td.notes+'\n\n'+
  'CONFLUENCE: '+JSON.stringify(analysis.confluence)+'\n'+
  'TIME-OF-DAY: '+JSON.stringify(analysis.todEdge.current)+' - '+(analysis.todEdge.info?analysis.todEdge.info.note:'')+'\n'+
  'LEVELS: '+JSON.stringify(analysis.levels)+'\n'+
  'GAP: '+JSON.stringify(analysis.gap)+'\n'+
  'ANCHORED VWAPs: '+JSON.stringify(analysis.avwaps)+'\n'+
  'FTFC: '+JSON.stringify(analysis.ftfc)+'\n'+
  'LEADERS: '+JSON.stringify(analysis.leaders)+'\n'+
  'OPTIONS: HV='+JSON.stringify(analysis.options?analysis.options.historicalVol:'N/A')+' | Chain available: '+(analysis.options&&analysis.options.chain?analysis.options.chain.available:'N/A')+'\n'+
  (analysis.options&&analysis.options.estimates?'ESTIMATES: Entry Greeks='+JSON.stringify(analysis.options.estimates.atEntry)+' | IV='+analysis.options.estimates.iv+' | Scenarios='+JSON.stringify(analysis.options.estimates.scenarios)+'\n':'')+'\n'+
  'PER-TIMEFRAME DATA:\n';

  Object.keys(analysis.allTfData).forEach(function(tf){
    var d=analysis.allTfData[tf];
    prompt+=tf.toUpperCase()+': bars='+d.bars+' candles='+JSON.stringify(d.candles.slice(-3))+' strat='+JSON.stringify(d.strat.slice(-2))+' squeeze='+JSON.stringify(d.squeeze)+' ema='+JSON.stringify(d.ema)+' macd='+JSON.stringify(d.macd)+' adx='+JSON.stringify(d.adx)+'\n';
  });

  prompt+='\nDISCOVER the strategy. Return JSON:\n'+
  '{"strategyName":"unique name for this pattern","whyItWorked":"specific multi-TF explanation referencing levels, candles, strat combos, squeeze, confluence","entrySignals":["signal1","signal2","signal3"],"exitSignals":["signal1","signal2"],"keyTimeframe":"which TF was primary","stratCombo":"if applicable, which Strat combo triggered","squeezeState":"was BB squeeze involved","fibLevel":"nearest fib at entry","confluenceAtEntry":"bull/bear % at entry time","todEdge":"time-of-day window and its typical behavior","strategyRules":{"entry":"SPECIFIC conditions to replicate","exit":"SPECIFIC exit rules","stopLoss":"where to place stop","profitTarget":"expected contract % gain","timeWindow":"PST time window","qqqMoveExpected":"expected QQQ % move","contractMoveExpected":"expected contract % move"},"confidence":0-100,"gradeThisTrade":"A+ to F","lessonsLearned":"what to do differently next time"}';

  try{
    var r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1200,messages:[{role:'user',content:prompt}]})});
    var d=await r.json();var txt=d.content&&d.content[0]?d.content[0].text:'';
    try{var ai=JSON.parse(txt.replace(/```json\n?/g,'').replace(/```/g,'').trim());return{analysis:analysis,trade:td,ai:ai}}
    catch(e){var m=txt.match(/\{[\s\S]*\}/);return{analysis:analysis,trade:td,ai:m?JSON.parse(m[0]):{raw:txt.substring(0,500)}}}
  }catch(e){return{analysis:analysis,trade:td,ai:{error:e.message}}}
}

// == STRATEGIES ===============================================================
async function getStrategies() {
  var trades=await supaGet('journal_entries','type=eq.day_trade_backlog&select=content,created_at&order=created_at.desc&limit=200');
  var strats={};
  trades.forEach(function(t){try{var d=JSON.parse(t.content||'{}');if(d.ai&&d.ai.strategyName){var n=d.ai.strategyName;if(!strats[n])strats[n]={name:n,trades:0,wins:0,totalPnl:0,rules:d.ai.strategyRules,grade:[]};strats[n].trades++;if(d.pnlPct>0)strats[n].wins++;strats[n].totalPnl+=d.pnlPct||0;if(d.ai.gradeThisTrade)strats[n].grade.push(d.ai.gradeThisTrade)}}catch(e){}});
  return{total:trades.length,strategies:Object.values(strats).map(function(s){s.winRate=s.trades>0?Math.round(s.wins/s.trades*100):0;s.avgPnl=s.trades>0?+(s.totalPnl/s.trades).toFixed(1):0;return s}).sort(function(a,b){return b.winRate-a.winRate})};
}

// == LIVE SCAN V2 =============================================================
async function liveScan() {
  var today=new Date().toISOString().split('T')[0];
  var now=new Date();
  var pstH=parseInt(now.toLocaleString('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',hour12:false}));
  var pstM=parseInt(now.toLocaleString('en-US',{timeZone:'America/Los_Angeles',minute:'numeric'}));
  var entryTime=pstH+':'+String(pstM).padStart(2,'0');
  var analysis=await fullAnalysis('QQQ',today,entryTime,null);
  // Load learned strategies for matching
  var strats=await getStrategies();
  return{symbol:'QQQ',timestamp:toPST(now),confluence:analysis.confluence,todEdge:analysis.todEdge,levels:analysis.levels,leaders:analysis.leaders,
    perTimeframe:Object.keys(analysis.allTfData).reduce(function(a,k){var d=analysis.allTfData[k];a[k]={bars:d.bars,topCandle:d.candles.length>0?d.candles[d.candles.length-1]:null,topStrat:d.strat.length>0?d.strat[d.strat.length-1]:null,squeeze:d.squeeze,emaCloud:d.ema.cloud||'unknown',macd:d.macd?{cross:d.macd.cross,divergence:d.macd.divergence,histogram:d.macd.histogram}:null,adx:d.adx};return a},{}),
    gap:analysis.gap,avwaps:analysis.avwaps,ftfc:analysis.ftfc,options:analysis.options?{qqqPrice:analysis.options.qqqPrice,hv:analysis.options.historicalVol,chainAvailable:analysis.options.chain?analysis.options.chain.available:false,atmCalls:analysis.options.chain&&analysis.options.chain.atmCalls?analysis.options.chain.atmCalls.slice(0,5):null,atmPuts:analysis.options.chain&&analysis.options.chain.atmPuts?analysis.options.chain.atmPuts.slice(0,5):null}:null,learnedStrategies:strats.strategies.length,note:strats.strategies.length>0?'Strategy matching active with '+strats.strategies.length+' learned patterns':'Log trades via backtest to build strategy library'};
}

// == MAIN HANDLER =============================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var action = (req.query && req.query.action) || (req.body && req.body.action) || '';
  try {
    if (action === 'log_trade' && req.method === 'POST') return res.json(await logTrade(req.body));
    if (action === 'backtest' && req.method === 'POST') {
      if (!rateLimitCheck('backtest', 5)) return res.status(429).json({error:'Rate limit: max 5 backtests per minute. Please wait.'});
      return res.json(await backtest(req.body));
    }
    if (action === 'strategies') return res.json(await getStrategies());
    if (action === 'live_scan') {
      if (!rateLimitCheck('live_scan', 10)) return res.status(429).json({error:'Rate limit: max 10 scans per minute.'});
      return res.json(await liveScan());
    }
    if (action === 'self_test') {
      // Automated self-test: runs a sample backtest through the full pipeline
      var testTrade = {date:'2026-03-28',entryTime:'7:15',exitTime:'9:45',direction:'call',strike:480,expiry:'2026-03-28',entryPrice:1.50,exitPrice:4.80,contracts:1,qqqAtEntry:478.50,qqqAtExit:482.30,notes:'self_test'};
      var testResult = await backtest(testTrade);
      var checks = {
        hasAnalysis: !!testResult.analysis,
        hasLevels: !!(testResult.analysis && testResult.analysis.levels),
        hasFTFC: !!(testResult.analysis && testResult.analysis.ftfc),
        hasConfluence: !!(testResult.analysis && testResult.analysis.confluence),
        hasGap: !!(testResult.analysis && testResult.analysis.gap),
        hasOptions: !!(testResult.analysis && testResult.analysis.options),
        hasAI: !!(testResult.ai && (testResult.ai.strategyName || testResult.ai.whyItWorked || testResult.ai.raw)),
        barCounts: testResult.analysis ? Object.keys(testResult.analysis.allTfData || {}).reduce(function(a,k){a[k]=(testResult.analysis.allTfData[k]||{}).bars||0;return a},{}) : {},
      };
      checks.allPassed = checks.hasAnalysis && checks.hasLevels && checks.hasConfluence;
      return res.json({test:'self_test',trade:testTrade,checks:checks,fullResult:testResult});
    }
    return res.status(400).json({ error: 'action required: log_trade, backtest, strategies, live_scan, self_test', v: 2 });
  } catch(err) {
    console.error('[day-trade-engine-v2]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
