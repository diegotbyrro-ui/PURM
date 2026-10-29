// PURM V6 - Prospector e Analista usando a mesma chave OpenAI protegida no Vault.
// O endpoint exige JWT de funcionario e permissão crm.edit. Não dispara mensagens.
import {withSupabase} from 'npm:@supabase/server@1';

type J = Record<string,unknown>;
const response=(body:J,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const str=(x:unknown,max=300)=>typeof x==='string'?x.trim().slice(0,max):'';
const score=(x:unknown)=>Math.max(0,Math.min(100,Math.round(Number(x)||0)));
const priority=(x:unknown):'low'|'medium'|'high'=>x==='high'||x==='low'?x:'medium';
const level=(x:unknown):'low'|'medium'|'high'|'very_high'=>x==='low'||x==='high'||x==='very_high'?x:'medium';
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const source=(s:unknown)=>{try{const u=new URL(str(s,500));return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return ''}};
const text=(result:J)=>{
 if(typeof result.output_text==='string')return result.output_text;
 const arr=Array.isArray(result.output)?result.output:[];
 return arr.flatMap((item:unknown)=>{const x=item as J;return Array.isArray(x.content)?x.content:[];})
 .filter((item:unknown)=>{const x=item as J;return x?.type==='output_text'&&typeof x.text==='string';})
 .map((item:unknown)=>String((item as J).text)).join('\n');
};
const instructionsProspect=`Você é o Prospector IA comercial da PURM Transportes e Cargas. Pesquise na web empresas REAIS que podem contratar serviços de transporte de cargas. Priorize embarcadores, distribuidores, industrias, atacadistas e operadores que contratem transportadoras, não transportadoras concorrentes. Não afirme que existe contrato, volume de carga, frequência de frete ou orçamento sem prova: rotule estimativas como hipóteses. Contatos somente profissionais PUBLICAMENTE divulgados; não forneça números pessoais, e-mails presumidos, CPF nem dados vazados. Não invente dados, fontes ou pessoas. Só apresente decisores cuja função atual esteja verificada publicamente. Considere rotas de Nordeste, Recife, Salvador, Simões Filho e Fortaleza, mas respeite a localidade solicitada. Cada empresa deve ter pelo menos uma URL pública relevante. Retorne APENAS JSON válido contendo objeto companies com array de até 8 objetos com chaves: company_name,segment,city,state,website,phone,email,whatsapp,decision_maker_name,decision_maker_role,opportunity,recommended_approach,estimated_monthly_shipments,likely_cargo,prospecting_score,priority,sources. Campos não confirmados devem ser strings vazias. sources é array de URLs, prioridade low/medium/high, score inteiro 0-100. Trate nomes de empresas excluídas como não elegíveis e jamais gere contato não publicado.`;
const instructionsAnalyst=`Você é a IA Analista Comercial da PURM Transportes e Cargas. Analise SOMENTE os dados fornecidos do CRM: cliente, origem, destino, carga, peso, valor cotado, etapa e histórico de atendimentos. Nunca afirme ter feito pesquisa externa, nem invente preços, frete, custo, viabilidade operacional, frota, SLA, distância, prazo, capacidade de transporte, disponibilidade ou aceite de contrato. Ausência de informação deve gerar uma pergunta ou alerta, não um fato. O score de 0 a 100 deve refletir sinais de negociação e qualidade dos dados, não uma previsão estatística. Gere apenas JSON válido com chaves: executive_summary, cargo_diagnosis, commercial_opportunities, recommended_approach, whatsapp_message, probable_objections, next_step, interest_level, commercial_score. interest_level é low/medium/high/very_high. A mensagem de WhatsApp deve ser curta, humana, sem valores não confirmados; é só um rascunho. Não exponha informações privadas desnecessárias.`;

export default {fetch:withSupabase({auth:'user'},async(req,ctx)=>{
 if(req.method!=='POST')return response({error:'Método não permitido.'},405);
 if(Number(req.headers.get('content-length')||'0')>9000)return response({error:'Requisição muito grande.'},413);
 let body:J;try{body=await req.json() as J;}catch{return response({error:'JSON inválido.'},400)}
 const mode=body.mode;
 if(mode!=='prospect'&&mode!=='analyze')return response({error:'Modo inválido.'},400);
 const {data:permitted,error:permissionError}=await ctx.supabase.rpc('purm_can',{p_permission:'crm.edit'});
 if(permissionError||permitted!==true)return response({error:'Somente usuários com permissão de edição comercial podem usar a IA.'},403);
 const {data:allowed,error:limitError}=await ctx.supabase.rpc('purm_ai_allow_call');
 if(limitError)return response({error:'Limitador da IA não configurado. Execute SQL V4 antes de usar.'},503);
 if(allowed!==true)return response({error:'Limite de 6 chamadas/minuto atingido.'},429);
 const {data:secret,error:secretError}=await ctx.supabaseAdmin.rpc('purm_ai_secret_v5',{p_action:'get'});
 const key=typeof secret?.key==='string'?secret.key:'';
 if(secretError||!key.startsWith('sk-'))return response({error:'Configure a chave OpenAI nas Configurações após publicar as Edge Functions da V5.'},503);
 const model=Deno.env.get('PURM_OPENAI_MODEL')||'gpt-4.1-mini';
 let input='';let leadId='';let requested=5;
 if(mode==='prospect'){
   const query=str(body.query,220),region=str(body.region,120);
   requested=Math.max(3,Math.min(8,Math.trunc(Number(body.quantity)||5)));
   if(query.length<3)return response({error:'Descreva o segmento ou oportunidade.'},400);
   const [leads,blocked]=await Promise.all([
     ctx.supabase.from('purm_crm_leads').select('company_name').limit(800),
     ctx.supabase.from('purm_prospect_blocklist').select('company_name').limit(800)
   ]);
   if(leads.error||blocked.error)return response({error:'Não foi possível conferir duplicatas e bloqueios.'},503);
   const excluded=[...(leads.data||[]),...(blocked.data||[])].map(x=>str(x.company_name,160));
   input=`Pesquise na web ${requested} empresas ativas relacionadas a: ${query}. Região de preferência: ${region||'Nordeste brasileiro'}. Exclua estas organizações e suas variações: ${excluded.slice(0,220).join('; ')||'nenhuma'}. Use fontes públicas verificáveis. Responda APENAS JSON.`;
 }else{
   leadId=str(body.lead_id,50);
   if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(leadId))return response({error:'Lead inválido.'},400);
   const [leadResult,activityResult]=await Promise.all([
     ctx.supabase.from('purm_crm_leads').select('id,company_name,origin_city,destination_city,cargo_description,weight_kg,pickup_date,quote_amount,priority,temperature,stage_id,next_contact_at,notes,created_at').eq('id',leadId).maybeSingle(),
     ctx.supabase.from('purm_crm_interactions').select('kind,description,created_at').eq('lead_id',leadId).order('created_at',{ascending:false}).limit(12)
   ]);
   if(leadResult.error||activityResult.error||!leadResult.data)return response({error:'Lead não encontrado ou sem acesso.'},404);
   const {data:stages}=await ctx.supabase.from('purm_crm_stages').select('id,name');
   const stage=(stages||[]).find(x=>x.id===leadResult.data.stage_id)?.name||'Não identificado';
   // Não enviar nomes de pessoas, números, e-mails ou segredos. Retirar possíveis dados de contato das notas/histórico.
   const clean=(value:unknown)=>str(value,450).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email omitido]').replace(/(?:\+?\d[\d\s().-]{8,}\d)/g,'[numero omitido]');
   const lead={...leadResult.data,notes:clean(leadResult.data.notes),stage_name:stage};
   const history=(activityResult.data||[]).map(x=>({kind:x.kind,description:clean(x.description),date:x.created_at}));
   input='Analise os dados abaixo. Não invente fatos. Responda APENAS JSON.\n'+JSON.stringify({lead,history});
 }
 let api:Response;
 try{api=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({model,instructions:mode==='prospect'?instructionsProspect:instructionsAnalyst,input,
   ...(mode==='prospect'?{tools:[{type:'web_search'}],tool_choice:'required'}:{}),
   text:{format:{type:'json_object'}},max_output_tokens:mode==='prospect'?4800:1500,store:false})});}
 catch{return response({error:'Sem conexão com a OpenAI ou tempo esgotado.'},502)}
 if(!api.ok){console.error('PURM Sales AI status',api.status);return response({error:api.status===401?'Chave OpenAI recusada.':'Falha na OpenAI. Confira crédito, modelo e logs da função.'},502)}
 let payload:J;try{payload=await api.json() as J;}catch{return response({error:'Resposta inválida da API.'},502)}
 let answer:J;try{answer=JSON.parse(text(payload)) as J;}catch{return response({error:'Pesquisa/análise retornou formato inesperado. Repita com menos empresas.'},502)}
 if(mode==='prospect'){
   const raw=Array.isArray(answer.companies)?answer.companies:[];
   const [exists,blocked]=await Promise.all([ctx.supabase.from('purm_crm_leads').select('company_name').limit(800),ctx.supabase.from('purm_prospect_blocklist').select('company_name').limit(800)]);
   const excluded=new Set([...(exists.data||[]),...(blocked.data||[])].map(x=>normalize(String(x.company_name))));
   const unique=new Set<string>();
   const companies=raw.slice(0,requested).flatMap((v:unknown)=>{
     const p=v as J;const name=str(p?.company_name,160),key=normalize(name);
     if(name.length<2||excluded.has(key)||unique.has(key))return [];
     const urls=Array.isArray(p.sources)?p.sources.map(source).filter(Boolean).slice(0,8):[];
     if(!urls.length)return [];unique.add(key);
     return [{company_name:name,segment:str(p.segment,140),city:str(p.city,100),state:str(p.state,50),
       website:source(p.website),phone:str(p.phone,70),email:str(p.email,160),whatsapp:str(p.whatsapp,70),
       decision_maker_name:str(p.decision_maker_name,140),decision_maker_role:str(p.decision_maker_role,140),
       opportunity:str(p.opportunity,800),recommended_approach:str(p.recommended_approach,700),
       likely_cargo:str(p.likely_cargo,240),estimated_monthly_shipments:str(p.estimated_monthly_shipments,200),
       prospecting_score:score(p.prospecting_score),priority:priority(p.priority),sources:urls}];
   });
   return response({companies,model});
 }
 const a={executive_summary:str(answer.executive_summary,1000),cargo_diagnosis:str(answer.cargo_diagnosis,1000),
   commercial_opportunities:str(answer.commercial_opportunities,1000),recommended_approach:str(answer.recommended_approach,1000),
   whatsapp_message:str(answer.whatsapp_message,750),probable_objections:str(answer.probable_objections,1000),
   next_step:str(answer.next_step,800),interest_level:level(answer.interest_level),commercial_score:score(answer.commercial_score)};
 if(!a.executive_summary||!a.next_step)return response({error:'Análise incompleta. Nenhuma gravação realizada.'},502);
 const {data:{user},error:userError}=await ctx.supabase.auth.getUser();
 if(userError||!user)return response({error:'Sessão inválida.'},401);
 const {error:saveError}=await ctx.supabaseAdmin.from('purm_lead_ai_analyses').insert({lead_id:leadId,created_by:user.id,model_used:model,...a});
 if(saveError){console.error('PURM Analyst write status',saveError.code);return response({error:'Análise concluída, mas não foi possível salvar no banco. Confira SQL V6.'},503)}
 return response({ok:true,analysis:a});
})};
