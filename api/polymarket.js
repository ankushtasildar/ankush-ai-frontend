// api/polymarket.js - Prediction Market Intelligence
const Anthropic = require('@anthropic-ai/sdk');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store,no-cache,must-revalidate');
  var action=req.query.action||'markets';
  try{
    if(action==='markets'){
      var r=await fetch('https://gamma-api.polymarket.com/markets?closed=false&order=volume&ascending=false&limit=20');
      var markets=await r.json();
      var fmt=markets.map(function(m){return{id:m.id,question:m.question,description:(m.description||'').substring(0,200),outcomes:m.outcomes?JSON.parse(m.outcomes):['Yes','No'],outcomePrices:m.outcomePrices?JSON.parse(m.outcomePrices):[],volume:parseFloat(m.volume||0),liquidity:parseFloat(m.liquidity||0),endDate:m.endDate,category:m.category||'General'};});
      return res.json({markets:fmt,count:fmt.length,fetchedAt:new Date().toISOString()});
    }
    if(action==='score'){
      if(!ANTHROPIC_KEY) return res.status(500).json({error:'API key not configured'});
      var id=req.query.id; if(!id) return res.status(400).json({error:'market id required'});
      var mr=await fetch('https://gamma-api.polymarket.com/markets/'+id); var market=await mr.json();
      if(!market||!market.question) return res.status(404).json({error:'Market not found'});
      var outcomes=market.outcomes?JSON.parse(market.outcomes):['Yes','No'];
      var prices=market.outcomePrices?JSON.parse(market.outcomePrices):[];
      var client=new Anthropic({apiKey:ANTHROPIC_KEY});
      var msg=await client.messages.create({model:'claude-sonnet-4-20250514',max_tokens:2048,system:'You are a Superforecaster. Decompose questions, consider base rates, update on evidence. Respond ONLY with valid JSON.',messages:[{role:'user',content:'Estimate probability: Q='+market.question+' Desc='+(market.description||'').substring(0,300)+' Outcomes='+outcomes.join(',')+' CurrentPrices='+prices.join(',')+' EndDate='+(market.endDate||'unknown')+' Return JSON: {question:str,myEstimate:{yes:0-1,no:0-1},marketPrice:{yes:num,no:num},edge:num,confidence:0-100,analysis:str,recommendation:"BUY YES|BUY NO|NO EDGE|PASS",keyFactors:[]}'}]});
      var raw=msg.content[0].text,analysis;
      try{analysis=JSON.parse(raw)}catch(e){var m2=raw.match(/\{[\s\S]*\}/);if(m2)analysis=JSON.parse(m2[0]);else return res.status(500).json({error:'Parse failed'});}
      return res.json({market:{id:market.id,question:market.question,volume:market.volume},...analysis,engine:'polymarket-v1',generatedAt:new Date().toISOString()});
    }
    return res.status(400).json({error:'Use ?action=markets or ?action=score&id=...'});
  }catch(err){console.error('[polymarket]',err.message);return res.status(500).json({error:err.message});}
};
