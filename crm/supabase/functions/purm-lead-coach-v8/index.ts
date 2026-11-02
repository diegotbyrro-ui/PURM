// PURM V8 — feedback da abordagem comercial. A IA nunca envia mensagens.
import {withSupabase} from 'npm:@supabase/server@1';
type J=Record<string,unknown>;
const json=(o:J,status=200)=>new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const str=(s:unknown,max=500)=>typeof s==='string'?s.trim().slice(0,max):'';
const redact=(value:unknown,max=500)=>str(value,max).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[e-mail omitido]').replace(/(?:\+?\d[\d\s().-]{8,}\d)/g,'[numero omitido]');
const pickText=(result:J)=>{
  if(typeof result.output_text==='string')return result.output_text;
  return (Array.isArray(result.output)?result.output:[]).flatMap((i:unknown)=>{const v=i as J;return Array.isArray(v.content)?v.content:[]}).filter((i:unknown)=>(i as J)?.type==='output_text').map((i:unknown)=>String((i as J)?.text||'')).join('\n');
};
export default {fetch:withSupabase({auth:'user'},async(req,ctx)=>{
  if(req.method!=='POST')return json({error:'Método não permitido'},405);
  if(Number(req.headers.get('content-length')||'0')>9000)return json({error:'Solicitação muito grande'},413);
  let body:J;try{body=await req.json() as J}catch{return json({error:'JSON inválido'},400)}
  const leadId=str(body.lead_id,50),pitch=str(body.pitch,2500);
  if(!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(leadId)||pitch.length<20||pitch.length>2500)return json({error:'Cliente ou abordagem inválidos'},400);
  const {data:permitted,error:permissionError}=await ctx.supabase.rpc('purm_can',{p_permission:'crm.edit'});
  if(permissionError||permitted!==true)return json({error:'Sem permissão de edição comercial'},403);
  const [leadResult,interactions,member]=await Promise.all([
    ctx.supabase.from('purm_crm_leads').select('id,company_name,origin_city,destination_city,cargo_description,priority,temperature,stage_id,quote_amount,notes').eq('id',leadId).maybeSingle(),
    ctx.supabase.from('purm_crm_interactions').select('kind,description,created_at').eq('lead_id',leadId).order('created_at',{ascending:false}).limit(10),
    ctx.supabase.auth.getUser(),
  ]);
  if(leadResult.error||!leadResult.data||interactions.error)return json({error:'Cliente ou histórico indisponível'},404);
  const userId=member.data.user?.id;
  if(member.error||!userId)return json({error:'Sessão inválida'},401);
  const {data:allowed,error:rateError}=await ctx.supabase.rpc('purm_ai_allow_call');
  if(rateError||!allowed)return json({error:'Limite de chamadas de IA ou configuração ausente'},429);
  if(!ctx.supabaseAdmin)return json({error:'Serviço administrativo indisponível'},503);
  const {data:secret,error:secretError}=await ctx.supabaseAdmin.rpc('purm_ai_secret_v5',{p_action:'get'});
  const key=str(secret?.key,300);
  if(secretError||!key.startsWith('sk-'))return json({error:'Chave OpenAI não configurada no cofre PURM'},503);
  const model=Deno.env.get('PURM_OPENAI_MODEL')||'gpt-4.1-mini';
  const lead=leadResult.data;
  const context={empresa:lead.company_name,origem:lead.origin_city,destino:lead.destination_city,carga:lead.cargo_description,etapa_id:lead.stage_id,temperatura:lead.temperature,prioridade:lead.priority,observacoes:redact(lead.notes,600),
    historico:(interactions.data||[]).map(e=>({tipo:e.kind,descricao:redact(e.description,450),data:e.created_at})),abordagem_do_comercial:redact(pitch,2500)};
  const instructions='Você é o treinador comercial da PURM Transportes e Cargas. Avalie uma abordagem comercial REAL informada pelo funcionário, considerando apenas o histórico e cadastro fornecidos. Destaque pontos fortes, pontos de melhoria específicos, uma mensagem de retorno sugerida e a próxima ação. Não presuma interesse do cliente, contrato, fretes, SLA, preços ou capacidade operacional. Se faltarem dados, peça confirmação. Seja claro e profissional, sem adjetivos vazios. Não envie mensagens nem altere CRM. Retorne APENAS objeto JSON com as chaves strengths, improvements, recommended_reply, next_action, quality_score (inteiro 0-100 de qualidade da abordagem; não uma probabilidade de conversão).';
  let res:Response;
  try{res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input:JSON.stringify(context),text:{format:{type:'json_object'}},max_output_tokens:1250,store:false}),signal:AbortSignal.timeout(60000)})}
  catch{return json({error:'Falha de rede ao consultar a OpenAI'},502)}
  if(!res.ok){console.error('PURM V8 Coach status',res.status);return json({error:'OpenAI indisponível. Confira crédito, modelo e configurações.'},502)}
  let result:J;try{result=await res.json() as J}catch{return json({error:'Resposta inválida da OpenAI'},502)}
  let answer:J;try{answer=JSON.parse(pickText(result)) as J}catch{return json({error:'A IA não retornou JSON válido'},502)}
  const safe={strengths:str(answer.strengths,1500),improvements:str(answer.improvements,1500),recommended_reply:str(answer.recommended_reply,1000),next_action:str(answer.next_action,1000),quality_score:Math.max(0,Math.min(100,Math.round(Number(answer.quality_score)||0)))};
  if(!safe.strengths||!safe.improvements||!safe.next_action)return json({error:'Resposta incompleta; nenhuma avaliação registrada'},502);
  const {error:writeError}=await ctx.supabaseAdmin.from('purm_lead_coaching_reviews').insert({lead_id:leadId,created_by:userId,pitch_text:pitch,model_used:model,...safe});
  if(writeError){console.error('PURM coach DB',writeError.code);return json({error:'Avaliação gerada, mas falhou ao salvar. Confira SQL V8.'},503)}
  return json({ok:true,review:safe});
})};
