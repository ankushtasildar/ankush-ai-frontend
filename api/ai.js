import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
function buildSystemPrompt({strategies,positions,marketContext,mode}) {
  const now = new Date();
  const timeStr = now.toLocaleString('en-US',{timeZone:'America/New_York',hour12:true});
  const stratBlock = strategies?.length>0 ? '\n## ACTIVE TRADING STRATEGIES\nThe user has '+strategies.length+' active strategies. Apply ALL of them.\n\n'+strategies.map((s,i)=>'### Strategy '+(i+1)+': '+s.name+'\n'+s.content).join('\n\n') : '\n## TRADING STRATEGIES\nNo custom strategies. Apply comprehensive technical + fundamental + macro analysis.';
  const posBlock = positions?.length>0 ? '\n## CURRENT POSITIONS\n'+positions.map(p=>'- '+p.symbol+': '+p.direction+' '+p.quantity+' @ $'+p.entry_price+' | P&L: $'+(p.pnl||'N/A')).join('\n') : '\n## CURRENT POSITIONS\nNo open positions.';
  const mktBlock = marketContext ? '\n## MARKET CONTEXT\n- Time: '+timeStr+' ET\n- Session: '+marketContext.session+'\n- SPY: '+(marketContext.spy||'N/A') : '\n## MARKET CONTEXT\n- Time: '+timeStr+' ET';
  const modes = {
    general: 'You are the primary trading intelligence assistant for AnkushAI. Deep expertise in technical analysis, fundamental analysis, options flow, macro economics, sector rotation, earnings, and tape reading. Think like a seasoned prop trader and hedge fund analyst simultaneously.',
    strategy_analysis: 'MAXIMUM ANALYSIS MODE. Apply every active strategy simultaneously. Cross-reference technical setups with macro, sector rotation, options flow, and fundamentals. Provide: (1) Setup quality 1-10 per strategy, (2) Confluence points, (3) Risk factors, (4) Entry/stop/target levels, (5) Position sizing %.',
    nl_query: 'You are answering a natural language historical analysis query. Be precise with numbers. Format like a quant analyst: state the finding, % frequency, conditions, and forward probability.',
    journal_coach: 'You are the trading journal coach. Analyze trades with precision of a risk manager and empathy of a mentor. Identify behavioral patterns, calculate statistics, praise what works, be direct about what does not.',
    earnings_setup: 'Analyze this earnings setup. Evaluate: (1) Historical reactions, (2) IV vs historical IV, (3) Technical setup, (4) Options flow, (5) Analyst sentiment, (6) Macro backdrop, (7) Sector strength. Output a structured earnings thesis.',
  };
  return (modes[mode]||modes.general)+'\n\nYou are integrated into AnkushAI, a professional trading intelligence platform.'+stratBlock+posBlock+mktBlock+'\n\n## RESPONSE STYLE\n- Direct, precise, actionable. No fluff.\n- Use specific price levels, percentages, timeframes.\n- For trade setups always include: entry zone, stop loss, target, risk/reward ratio.\n- Reference strategies by name when relevant.\n\n## RULES\n- NEVER guarantee predictions. Frame probabilistically.\n- Always acknowledge current market session.';
}
export default async function handler(req,res) {
  if (req.method==='OPTIONS') return res.status(200).set(cors).end();
  Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v));
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {messages,strategies=[],positions=[],marketContext=null,mode='general',historicalData=null} = req.body;
  if (!messages||!Array.isArray(messages)) return res.status(400).json({error:'messages array required'});
  const enriched = [...messages];
  if (historicalData&&mode==='nl_query') {
    const last = enriched[enriched.length-1];
    if (last.role==='user') enriched[enriched.length-1] = {...last,content:last.content+'\n\n[HISTORICAL DATA]\n'+JSON.stringify(historicalData,null,2)};
  }
  try {
    const system = buildSystemPrompt({strategies,positions,marketContext,mode});
    res.setHeader('Content-Type','text/event-stream');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Connection','keep-alive');
    Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v));
    const stream = client.messages.stream({model:'claude-sonnet-4-20250514',max_tokens:4096,system,messages:enriched.map(m=>({role:m.role,content:m.content}))});
    for await (const chunk of stream) {
      if (chunk.type==='content_block_delta'&&chunk.delta?.type==='text_delta') res.write('data: '+JSON.stringify({text:chunk.delta.text})+'\n\n');
    }
    const final = await stream.finalMessage();
    res.write('data: '+JSON.stringify({done:true,usage:final.usage})+'\n\n');
    res.end();
  } catch(err) {
    console.error('AI error:',err.message);
    if (!res.headersSent) return res.status(500).json({error:err.message});
    res.write('data: '+JSON.stringify({error:err.message})+'\n\n');
    res.end();
  }
}