import Stripe from 'stripe';
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const PLANS={starter:{amount:2900,name:'AnkushAI Starter'},pro:{amount:9900,name:'AnkushAI Pro'}};
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  const{plan,userId,email,successUrl,cancelUrl}=req.body;
  const pc=PLANS[plan];
  if(!pc)return res.status(400).json({error:'Invalid plan'});
  if(!userId||!email)return res.status(400).json({error:'Missing userId or email'});
  try{
    const session=await stripe.checkout.sessions.create({
      payment_method_types:['card'],mode:'subscription',customer_email:email,
      line_items:[{price_data:{currency:'usd',product_data:{name:pc.name},unit_amount:pc.amount,recurring:{interval:'month'}},quantity:1}],
      metadata:{user_id:userId,plan},allow_promotion_codes:true,
      success_url:(successUrl||'https://www.ankushai.org/app')+'?subscribed=1&plan='+plan,
      cancel_url:cancelUrl||'https://www.ankushai.org/#pricing',
      subscription_data:{metadata:{user_id:userId,plan}},
    });
    res.json({url:session.url,sessionId:session.id});
  }catch(e){console.error('Stripe error:',e);res.status(500).json({error:e.message});}
}