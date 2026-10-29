// PURM V5 - configuracao segura de OpenAI via Supabase Vault.
// Exige Supabase Auth, cargo admin, secret key do Supabase em ctx.supabaseAdmin.
// NAO retorna a chave ao navegador e nunca grava logs contendo o segredo.
import { withSupabase } from 'npm:@supabase/server@1';

const answer=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});

export default {
 fetch: withSupabase({auth:'user'},async(req,ctx)=>{
  if(req.method!=='POST')return answer({error:'Metodo nao permitido'},405);
  const {data:admin,error:accessError}=await ctx.supabase.rpc('purm_is_admin');
  if(accessError||admin!==true)return answer({error:'Somente administradores podem configurar a OpenAI.'},403);
  let payload:Record<string,unknown>;
  try{payload=await req.json() as Record<string,unknown>;}catch{return answer({error:'JSON invalido'},400);}
  const action=payload.action;
  if(action!=='status'&&action!=='set')return answer({error:'Acao invalida'},400);
  const key=action==='set'&&typeof payload.key==='string'?payload.key.trim():null;
  if(action==='set'&&(!key||!/^sk-[A-Za-z0-9_-]{20,300}$/.test(key)))
   return answer({error:'Cole uma chave OpenAI valida (sk-...).'},400);
  const {data,error}=await ctx.supabaseAdmin.rpc('purm_ai_secret_v5',{p_action:action,p_secret:key});
  if(error){console.error('PURM Vault: falha de operacao',error.code);
    return answer({error:'Nao foi possivel acessar o Vault. Revise SQL V5 e permissao service_role.'},503);}
  return answer({configured:data?.configured===true});
 })
};
