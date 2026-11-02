// PURM V8 — Espelho de Google Agenda. Somente usuarios autenticados.
// Necessita secrets GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e PURM_GOOGLE_TOKEN_KEY.
// Publicar com validacao de usuario em @supabase/server; nunca expor refresh token.
import { withSupabase } from 'npm:@supabase/server@1';

type J = Record<string,unknown>;
const reply=(body:J,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const str=(value:unknown,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const env=(key:string)=>Deno.env.get(key)?.trim()||'';
const isId=(s:string)=>/^[a-z0-9_-]{5,200}$/i.test(s);
async function decrypt(encrypted:string):Promise<string>{
  const secret=env('PURM_GOOGLE_TOKEN_KEY');let key:Uint8Array,raw:Uint8Array;
  try{key=Uint8Array.from(atob(secret),v=>v.charCodeAt(0));raw=Uint8Array.from(atob(encrypted),v=>v.charCodeAt(0))}catch{throw new Error('Chave ou token criptografado inválido')}
  if(key.length!==32||raw.length<29)throw new Error('Credenciais de criptografia ausentes');
  const cryptoKey=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:raw.subarray(0,12)},cryptoKey,raw.subarray(12)));
}
async function accessToken(refreshTokenEncrypted:string){
  const refresh=await decrypt(refreshTokenEncrypted);
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET'),grant_type:'refresh_token',refresh_token:refresh}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Google OAuth HTTP ${response.status}. Reconecte a conta se necessario.`);
  const body=await response.json() as J;
  if(typeof body.access_token!=='string')throw new Error('Google não retornou token de acesso');
  return body.access_token;
}
async function callGoogle(token:string,method:string,path:string,body?:unknown){
  const response=await fetch(`https://www.googleapis.com/calendar/v3/${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(response.status===404)return {status:404,data:null};
  if(!response.ok)throw new Error(`Google Calendar HTTP ${response.status}. Confira permissões e disponibilidade da agenda.`);
  return {status:response.status,data:response.status===204?null:await response.json() as J};
}
function mapped(item:J){const start=(item.start||{}) as J,end=(item.end||{}) as J;
  const allDay=typeof start.date==='string';
  return {id:str(item.id,200),summary:str(item.summary,180)||'Sem título',description:str(item.description,1500),
    start:str(start.dateTime||start.date,40),end:str(end.dateTime||end.date,40),allDay,
    recurring:Boolean(item.recurringEventId||item.recurrence),htmlLink:str(item.htmlLink,400),status:str(item.status,30)};
}
export default {fetch:withSupabase({auth:'user'},async(req,ctx)=>{
  if(req.method!=='POST')return reply({error:'Metodo não permitido'},405);
  if(Number(req.headers.get('content-length')||'0')>12000)return reply({error:'Solicitação muito grande'},413);
  let body:J;try{body=await req.json() as J}catch{return reply({error:'JSON inválido'},400)}
  const action=str(body.action,30);
  if(!['list','create','update','delete'].includes(action))return reply({error:'Ação inválida'},400);
  const permission=action==='list'?'crm.view':'crm.edit';
  const [can,admin,userResult]=await Promise.all([
    ctx.supabase.rpc('purm_can',{p_permission:permission}),
    ctx.supabase.rpc('purm_is_admin'),ctx.supabase.auth.getUser(),
  ]);
  if(can.error||admin.error)return reply({error:'Falha na validação de permissões'},503);
  if(can.data!==true&&admin.data!==true)return reply({error:'Permissão insuficiente'},403);
  const userId=userResult.data.user?.id;
  if(!userId||userResult.error)return reply({error:'Sessão inválida'},401);
  if(!ctx.supabaseAdmin)return reply({error:'Serviço administrativo indisponível'},503);
  const {data:connection,error:connError}=await ctx.supabaseAdmin.from('purm_google_connections').select('calendar_id,refresh_token_encrypted').eq('id',1).maybeSingle();
  if(connError)return reply({error:'Estrutura da agenda não encontrada'},503);
  if(!connection)return reply({error:'Conecte a agenda Google em Configurações.'},409);
  let token:string;
  try{token=await accessToken(connection.refresh_token_encrypted)}catch(e){return reply({error:e instanceof Error?e.message:'Falha OAuth'},503)}
  const root=`calendars/${encodeURIComponent(connection.calendar_id||'primary')}/events`;
  try{
    if(action==='list'){
      const from=new Date(str(body.timeMin,40)),to=new Date(str(body.timeMax,40));
      if(Number.isNaN(+from)||Number.isNaN(+to)||+to<=+from||+to-+from>70*86400000)return reply({error:'Intervalo inválido; máximo 70 dias'},400);
      const events:J[]=[];let pageToken='';let partial=false;
      for(let page=0;page<4;page++){
        const params=new URLSearchParams({timeMin:from.toISOString(),timeMax:to.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250',showDeleted:'false',...(pageToken?{pageToken}:{})});
        const response=await callGoogle(token,'GET',root+'?'+params.toString());
        const data=(response.data||{}) as J;
        if(Array.isArray(data.items))for(const item of data.items)if(item&&typeof item==='object')events.push(item as J);
        pageToken=str(data.nextPageToken,500);
        if(!pageToken)break;
        if(page===3)partial=true;
      }
      return reply({ok:true,connected:true,events:events.map(mapped),partial});
    }
    const eventId=str(body.eventId,200);
    if(action==='create'){
      const title=str(body.title,180),description=str(body.description,1500);
      const start=new Date(str(body.startAt,50)),end=new Date(str(body.endAt,50));
      if(title.length<2||Number.isNaN(+start)||Number.isNaN(+end)||end<=start||end.getTime()-start.getTime()>86400000)return reply({error:'Título ou horário inválidos'},400);
      const google={summary:title,description,start:{dateTime:start.toISOString(),timeZone:'America/Recife'},end:{dateTime:end.toISOString(),timeZone:'America/Recife'},reminders:{useDefault:false,overrides:[{method:'popup',minutes:1440},{method:'popup',minutes:60}]}};
      const result=await callGoogle(token,'POST',root,google);
      const id=str(result.data?.id,200);
      await ctx.supabaseAdmin.from('purm_google_calendar_audit').insert({actor_id:userId,action:'create',google_event_id:id||null});
      return reply({ok:true,eventId:id});
    }
    if(!isId(eventId))return reply({error:'Identificador de evento inválido'},400);
    if(body.confirm!==true)return reply({error:'Confirmação explícita exigida'},400);
    const existing=await callGoogle(token,'GET',root+'/'+encodeURIComponent(eventId));
    if(existing.status===404)return reply({error:'Evento não encontrado no Google. Atualize a agenda.'},404);
    const evt=existing.data||{};const begin=(evt.start||{}) as J;
    if(evt.recurringEventId||evt.recurrence||begin.date)return reply({error:'Evento recorrente ou de dia inteiro: edite no Google Agenda para preservar a série.'},409);
    const {data:internal,error:internalError}=await ctx.supabaseAdmin.from('purm_secretary_events').select('id').eq('google_event_id',eventId).maybeSingle();
    if(internalError)return reply({error:'Falha ao consultar vínculo com a agenda interna. Nenhuma alteração foi feita.'},503);
    if(action==='update'){
      const title=str(body.title,180),description=str(body.description,1500);
      const start=new Date(str(body.startAt,50)),end=new Date(str(body.endAt,50));
      if(title.length<2||Number.isNaN(+start)||Number.isNaN(+end)||end<=start||end.getTime()-start.getTime()>86400000)return reply({error:'Dados inválidos'},400);
      await callGoogle(token,'PATCH',root+'/'+encodeURIComponent(eventId),{summary:title,description,start:{dateTime:start.toISOString(),timeZone:'America/Recife'},end:{dateTime:end.toISOString(),timeZone:'America/Recife'}});
      if(internal){const saved=await ctx.supabaseAdmin.from('purm_secretary_events').update({title,notes:description,start_at:start.toISOString(),end_at:end.toISOString()}).eq('id',internal.id);if(saved.error)return reply({error:'Google alterado, mas falhou ao atualizar agenda interna. Solicite reconciliação.'},502)}
      await ctx.supabaseAdmin.from('purm_google_calendar_audit').insert({actor_id:userId,action:'update',local_event_id:internal?.id||null,google_event_id:eventId});
      return reply({ok:true});
    }
    if(action==='delete'){
      await callGoogle(token,'DELETE',root+'/'+encodeURIComponent(eventId));
      if(internal){const deleted=await ctx.supabaseAdmin.from('purm_secretary_events').delete().eq('id',internal.id);if(deleted.error)return reply({error:'Google excluído, mas compromisso interno ainda existe. Solicite reconciliação.'},502)}
      await ctx.supabaseAdmin.from('purm_google_calendar_audit').insert({actor_id:userId,action:'delete',local_event_id:internal?.id||null,google_event_id:eventId});
      return reply({ok:true});
    }
  }catch(e){return reply({error:e instanceof Error?e.message:'Falha ao consultar Google Agenda'},502)}
  return reply({error:'Ação inválida'},400);
})};
