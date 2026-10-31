import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bot, CalendarPlus, CheckCircle2, MessageCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabase';
import CarlaAiPanel from '../ai/CarlaAiPanel';
import { cents, dateKey, numericBR, suggestCategory, type FinanceDraft } from './financeCore';

type Event={id:string;title:string;start_at:string;end_at:string;notes:string;remind_day_before:boolean;remind_hour_before:boolean;google_event_id:string|null};
type Proposed={mode:'finance';payload:FinanceDraft;message:string}|{mode:'event';title:string;start_at:string;end_at:string;notes:string;message:string};
const currencyInSpeech=(v:string)=>{
 const match=v.match(/(?:R\$\s*)?((?:\d{1,3}(?:[. ]\d{3})+|\d+)(?:,\d{1,2})?)\s*(mil|reais|real)?/i);
 if(!match)return null;let centsValue=numericBR(match[1]);if(centsValue===null)return null;if((match[2]||'').toLowerCase()==='mil')centsValue*=1000;return {amount:centsValue,phrase:match[0]};
};
export function parseCarlaCommand(text:string,now:Date=new Date(),assistantName='Assistente'):Proposed|null{
 const raw=text.trim();
 const comma=raw.indexOf(',');
 const input=comma>0&&comma<65&&raw.slice(0,comma).trim().toLocaleLowerCase('pt-BR')===assistantName.toLocaleLowerCase('pt-BR')?raw.slice(comma+1).trim():raw;
 if(!input)return null;
 const lower=input.toLocaleLowerCase('pt-BR');
 if(/agend|compromisso|reuni[aã]o|marcar hor[aá]rio/.test(lower)){
   const dt=input.match(/(?:dia\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s*(?:[àa]s?|as)?\s*(\d{1,2})(?::(\d{2}))?\s*h?/i);
   const hourOnly=input.match(/(?:[àa]s?|as)\s*(\d{1,2})(?::(\d{2}))?\s*h?/i);
   let day=dateKey(now),hour=hourOnly?+hourOnly[1]:-1,minute=hourOnly?+(hourOnly[2]||0):0;
   if(dt){let y=dt[3]?+(dt[3].length===2?'20'+dt[3]:dt[3]):+day.slice(0,4);
     const month=+dt[2],d=+dt[1];hour=+dt[4];minute=+(dt[5]||0);
     const date=new Date(Date.UTC(y,month-1,d));if(date.getUTCMonth()!==month-1||date.getUTCDate()!==d)return null;
     day=`${y}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
   }else if(/amanh[aã]/i.test(lower)){const d=new Date(`${day}T12:00:00-03:00`);d.setUTCDate(d.getUTCDate()+1);day=dateKey(d);}
   else return null;
   if(hour<0||hour>23||minute>59)return null;
   const start=new Date(`${day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00-03:00`);
   if(Number.isNaN(start.getTime()))return null;
   let title=input.replace(/(?:dia\s*)?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s*(?:[àa]s?|as)?\s*\d{1,2}(?::\d{2})?\s*h?/i,'').replace(/amanh[aã]/gi,'').replace(/(?:[àa]s?|as)\s*\d{1,2}(?::\d{2})?\s*h?/i,'').replace(/^(agendar|agenda|marcar|uma?|reuni[aã]o|compromisso|com)\s*/gi,'').trim();
   title=title||'Compromisso PURM';
   return {mode:'event',title:title.slice(0,180),start_at:start.toISOString(),end_at:new Date(start.getTime()+3600000).toISOString(),notes:input,message:'Encontrei um compromisso. Confira título e horário antes de registrar.'};
 }
 if(/comprei|comprar|gastei|pag(ar|uei)|recebi|fatur|entrada|despesa|registr(ar|e)/.test(lower)){
   const extracted=currencyInSpeech(input);if(!extracted||extracted.amount<=0)return null;
   const kind= /recebi|fatur|entrada|cliente pagou/.test(lower)?'income':'expense';
   const description=input.replace(/(?:R\$\s*)?(?:\d{1,3}(?:[. ]\d{3})+|\d+)(?:,\d{1,2})?\s*(?:mil|reais|real)?/i,'')
    .replace(/\b(acabei de|registr(ar|e|a)|nas finan[cç]as|eu|de|uma?|o|a|por favor)\b/gi,'').replace(/\s+/g,' ').trim();
   const clean=description?description[0].toUpperCase()+description.slice(1):kind==='expense'?'Despesa informada à secretária':'Receita informada à secretária';
   const today=dateKey(now);
   return {mode:'finance',message:'Preparei um lançamento financeiro. Confirme os dados para salvar.',payload:{
     description:clean.slice(0,220),kind,amount_cents:extracted.amount,
     category:kind==='income'?'Outras receitas':suggestCategory(clean),account_label:'Conta principal',
     payment_method:'Pix',occurrence_date:today,due_date:today,settled_date:null,status:'pending',cash_effect:false,source:'secretary',import_fingerprint:null,notes:'Proposto pela secretária após comando do usuário; confirmado manualmente.'}};
 }
 return null;
}
export default function CarlaPage(){
 const [identity,setIdentity]=useState<{name:string;avatar_url:string|null}>({name:'Assistente',avatar_url:null});
 const [prompt,setPrompt]=useState('');const [proposal,setProposal]=useState<Proposed|null>(null);
 const [amountText,setAmountText]=useState('');
 const [events,setEvents]=useState<Event[]>([]);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const reload=useCallback(async()=>{if(!supabase)return;const {data,error}=await supabase.from('purm_secretary_events').select('*').order('start_at',{ascending:true}).limit(120);
   if(error){setMessage('Agenda interna ainda indisponível: '+error.message);return;}setEvents((data||[]) as Event[]);},[]);
 useEffect(()=>{void reload();
  void supabase?.from('purm_secretary_settings').select('name,avatar_url').eq('id',1).maybeSingle().then(({data})=>{if(data)setIdentity(data);});
 },[reload]);
 const nextEvents=useMemo(()=>events.filter(e=>new Date(e.end_at).getTime()>Date.now()).slice(0,20),[events]);
 async function syncEvent(e:Event){if(!supabase||busy)return;setBusy(true);setMessage('');
  try{const {data,error}=await supabase.functions.invoke<{ok?:boolean;error?:string}>('purm-google-calendar',{body:{action:'create',eventId:e.id}});
    if(error||!data?.ok)throw new Error(data?.error||'Falha na sincronizacao Google.');
    setMessage('Compromisso sincronizado com Google Agenda.');await reload();}
  catch(err){setMessage('Google Agenda: '+(err instanceof Error?err.message:String(err)));}finally{setBusy(false);}}
 async function deleteEvent(e:Event){if(!supabase||busy)return;
  if(!window.confirm('Excluir definitivamente "'+e.title+'" da agenda PURM e do Google Agenda (se vinculado)?'))return;
  setBusy(true);setMessage('');try{
    const {data,error}=await supabase.functions.invoke<{ok?:boolean;error?:string}>('purm-google-calendar',{body:{action:'delete',eventId:e.id,confirm:true}});
    if(error||!data?.ok)throw new Error(data?.error||'Falha na exclusao.');
    setMessage('Compromisso excluido apos confirmacao.');await reload();}
  catch(err){setMessage('Nao foi possivel excluir: '+(err instanceof Error?err.message:String(err)));}finally{setBusy(false);}}
 function prepare(ev:FormEvent){ev.preventDefault();const parsed=parseCarlaCommand(prompt,new Date(),identity.name);setProposal(parsed);if(parsed?.mode==='finance')setAmountText(String(parsed.payload.amount_cents/100).replace('.',','));
   setMessage(parsed?parsed.message:'Não consegui interpretar. Para finanças experimente “Comprei um baú de 20 mil reais”. Para agenda experimente “Agendar reunião dia 30/10 às 14h”. Não fiz nenhuma alteração.');}
 async function confirm(){if(!supabase||!proposal||busy)return;setBusy(true);setMessage('');try{
   if(proposal.mode==='finance'){
     const p=proposal.payload;if(!p.description.trim()||p.amount_cents<=0)throw new Error('Descrição ou valor inválido.');
     const {error}=await supabase.from('purm_finance_entries').insert({...p,description:p.description.trim()});if(error)throw error;
     setMessage(identity.name+': lançamento registrado. Confira na aba Financeiro.');
   }else{
     const {data:saved,error}=await supabase.from('purm_secretary_events').insert({title:proposal.title,notes:proposal.notes,start_at:proposal.start_at,end_at:proposal.end_at,
       remind_day_before:true,remind_hour_before:true,source:'carla'}).select('id').single();
     if(error||!saved)throw error||new Error('Nao foi possivel salvar compromisso interno.');
     const synced=await supabase.functions.invoke<{ok?:boolean;error?:string}>('purm-google-calendar',{body:{action:'create',eventId:saved.id}});
     setMessage(synced.error||!synced.data?.ok
       ? identity.name+': salvo na agenda interna, mas Google nao sincronizou. Use o botao Sincronizar na lista apos conectar a agenda.'
       : identity.name+': compromisso salvo na PURM e no Google Agenda, com lembretes 24h e 1h.');
     await reload();
   }
   setProposal(null);setPrompt('');
  }catch(e){setMessage('Não consegui salvar: '+(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}}
 return <div className="carla-page"><CarlaAiPanel assistantName={identity.name}/>
   <section className="hero"><div><span className="eyebrow">SECRETÁRIA PURM • {identity.name}</span><h2>Organização e finanças em conversa.</h2><p>Uma versão reduzida da LIV do APROVUP, com rascunhos de lançamentos e compromissos confirmados por você.</p></div><Bot size={46} color="#2868ff"/></section>
   <div className="carla-layout"><section className="finance-panel"><div className="carla-header"><span className="carla-avatar">{identity.avatar_url?<img src={identity.avatar_url} alt="Foto da secretária"/>:<Bot size={25}/>}</span><div><h3>{identity.name}</h3><p>Assistente de finanças e agenda • comandos guiados</p></div></div>
    <div className="carla-bubble">Olá! Posso preparar uma despesa, uma receita ou um compromisso. <b>Eu só registro depois da sua confirmação.</b></div>
    <div className="carla-examples"><button onClick={()=>setPrompt('Comprei um baú de 20 mil reais, registra nas finanças')}>“Comprei um baú de R$ 20 mil”</button><button onClick={()=>setPrompt('Agendar reunião dia 30/10 às 14h com o financeiro')}>“Agendar reunião dia 30/10 às 14h”</button></div>
    <form onSubmit={prepare} className="carla-compose"><textarea value={prompt} maxLength={600} onChange={e=>setPrompt(e.target.value)} placeholder="Comprei um baú de 20 mil reais..." rows={3}/><button className="primary" disabled={!prompt.trim()||busy}>Preparar ação</button></form>
    {message&&<div role="status" className="finance-notice">{message}</div>}
    {proposal&&<div className="carla-proposal"><h3><ShieldCheck size={18}/> Revisar antes de confirmar</h3>
      {proposal.mode==='finance'?<div className="finance-grid"><label>Descrição<input value={proposal.payload.description} onChange={e=>setProposal({...proposal,payload:{...proposal.payload,description:e.target.value}})}/></label><label>Valor<input value={amountText} onChange={e=>{setAmountText(e.target.value);setProposal({...proposal,payload:{...proposal.payload,amount_cents:Math.max(0,numericBR(e.target.value)||0)}})}}/></label><label>Categoria<input value={proposal.payload.category} onChange={e=>setProposal({...proposal,payload:{...proposal.payload,category:e.target.value}})}/></label><label>Data<input type="date" value={proposal.payload.occurrence_date} onChange={e=>setProposal({...proposal,payload:{...proposal.payload,occurrence_date:e.target.value,due_date:e.target.value}})}/></label><p className="finance-muted full">Valor: <b>{cents(proposal.payload.amount_cents)}</b>. Status inicial: pendente. Não serão registrados pagamentos no banco automaticamente.</p></div>
        :<div className="finance-grid"><label className="full">Título<input value={proposal.title} onChange={e=>setProposal({...proposal,title:e.target.value})}/></label><label>Início<input type="datetime-local" value={new Date(new Date(proposal.start_at).getTime()-3*3600000).toISOString().slice(0,16)} onChange={e=>{const d=new Date(e.target.value+':00-03:00');if(!Number.isNaN(d.getTime()))setProposal({...proposal,start_at:d.toISOString(),end_at:new Date(d.getTime()+3600000).toISOString()});}}/></label><label>Duração <input readOnly value="1 hora (V1)"/></label><p className="finance-muted full">Avisos D-1 e H-1 são registrados como preferências. O envio automático exigirá conectar Google e configurar uma rotina segura de notificações.</p></div>}
      <div className="finance-actions"><button className="secondary" onClick={()=>setProposal(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={()=>void confirm()}><CheckCircle2 size={17}/> {busy?'Salvando...':'Confirmar e registrar'}</button></div></div>}
   </section><section className="finance-panel"><h3><CalendarPlus size={19}/> Compromissos PURM</h3><p>Compromissos da PURM com sincronizacao direta para o Google Agenda autorizado.</p>
     <p className="finance-muted">Google Agenda: notificacoes popup 24h e 1h antes, se ativadas na conta. WhatsApp continua separado.</p>
     {nextEvents.map(e=><div className="carla-event" key={e.id}><div><strong>{e.title}</strong><span>{new Date(e.start_at).toLocaleString('pt-BR',{timeZone:'America/Recife',dateStyle:'short',timeStyle:'short'})}</span></div><div className="finance-actions">{e.google_event_id?<span className="finance-muted">Google sincronizado</span>:<button type="button" className="secondary" disabled={busy} onClick={()=>void syncEvent(e)}>Sincronizar Google</button>}<button type="button" className="secondary" disabled={busy} onClick={()=>void deleteEvent(e)}>Excluir</button></div></div>)}
     {!nextEvents.length&&<div className="finance-empty">Nenhum compromisso futuro cadastrado.</div>}
     <div className="finance-info"><MessageCircle size={16}/><span>Para criar e excluir eventos no Google, um administrador deve conectar a conta em Configuracoes. Exclusoes exigem confirmacao. WhatsApp e alertas externos nao estao conectados.</span></div>
   </section></div>
 </div>;
}
