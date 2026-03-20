import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ','');
  if (!token) return null;
  const {data} = await supabase.auth.getUser(token);
  return data?.user||null;
}
export default async function handler(req,res) {
  if (req.method==='OPTIONS') return res.status(200).set(cors).end();
  Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v));
  const user = await getUser(req);
  if (!user) return res.status(401).json({error:'Unauthorized'});
  if (req.method==='GET') {
    const {data,error} = await supabase.from('strategies').select('*').or('user_id.is.null,user_id.eq.'+user.id).eq('is_active',true).order('created_at',{ascending:false});
    if (error) return res.status(500).json({error:error.message});
    return res.json({strategies:data||[]});
  }
  if (req.method==='POST') {
    const {name,description,content,is_global=false} = req.body;
    if (!name||!content) return res.status(400).json({error:'name and content required'});
    const {data,error} = await supabase.from('strategies').insert({name,description,content,user_id:is_global?null:user.id,is_active:true}).select().single();
    if (error) return res.status(500).json({error:error.message});
    return res.status(201).json({strategy:data});
  }
  if (req.method==='PUT') {
    const {id,name,description,content,is_active} = req.body;
    if (!id) return res.status(400).json({error:'id required'});
    const {data,error} = await supabase.from('strategies').update({name,description,content,is_active}).eq('id',id).or('user_id.is.null,user_id.eq.'+user.id).select().single();
    if (error) return res.status(500).json({error:error.message});
    return res.json({strategy:data});
  }
  if (req.method==='DELETE') {
    const {id} = req.query;
    if (!id) return res.status(400).json({error:'id required'});
    const {error} = await supabase.from('strategies').update({is_active:false}).eq('id',id).eq('user_id',user.id);
    if (error) return res.status(500).json({error:error.message});
    return res.json({success:true});
  }
  return res.status(405).json({error:'Method not allowed'});
}