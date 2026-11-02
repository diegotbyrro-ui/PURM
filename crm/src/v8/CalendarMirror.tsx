import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, X, Pencil, Trash2, ShieldCheck, ExternalLink } from 'lucide-react';
import { supabase } from '../supabase';
import './v8.css';

type GoogleEvent={id:string;summary:string;description:string;start:string;end:string;allDay:boolean;recurring:boolean;htmlLink:string;status:string};
type Draft={id:string|null;title:string;description:string;day:string;start:string;end:string};
const zone='America/Recife';
const dateBR=(date:Date,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('pt-BR',{timeZone:zone,...options}).format(date);
const pad=(n:number)=>String(n).padStart(2,'0');
const dayKey=(d:Date)=>`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
const shift=(d:Date,n:number)=>new Date(d.getTime()+n*86_400_000);
const monthStart=(d:Date)=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1,12));
const monthDays=(d:Date)=>{const first=monthStart(d);const day=first.getUTCDay();return Array.from({length:42},(_,i)=>shift(first,i-day));};
const emptyDraft=(date:string):Draft=>({id:null,title:'',description:'',day:date,start:'09:00',end:'10:00'});
const errorText=async(error:unknown,raw?:{error?:string}|null)=>{
  if(raw?.error)return raw.error;
  const err=error as {message?:string;context?:Response}|null;
  if(err?.context&&typeof err.context.json==='function')try{const p=await err.context.json() as {error?:string};if(p?.error)return p.error}catch{ /* fallback */ }
  return err?.message||'Operação não concluída.';
};
const isoFrom=(day:string,time:string)=>new Date(`${day}T${time}:00-03:00`).toISOString();
const displayDay=(event:GoogleEvent)=>event.allDay?event.start.slice(0,10):dateBR(new Date(event.start),{year:'numeric',month:'2-digit',day:'2-digit'}).split('/').reverse().join('-');
const displayTime=(event:GoogleEvent)=>event.allDay?'Dia inteiro':dateBR(new Date(event.start),{hour:'2-digit',minute:'2-digit'});
const todayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function CalendarMirror({canEdit}:{canEdit:boolean}){
  const [current,setCurrent]=useState(()=>monthStart(new Date()));const [mode,setMode]=useState<'month'|'week'|'list'>('month');
  const [items,setItems]=useState<GoogleEvent[]>([]);const [connected,setConnected]=useState(false);const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');const [draft,setDraft]=useState<Draft|null>(null);
  const [weekOffset,setWeekOffset]=useState(()=>Math.floor((new Date().getUTCDate()-1+monthStart(new Date()).getUTCDay())/7));
  const month=dayKey(current).slice(0,7);
  const range=useMemo(()=>{
    const start=monthStart(current);
    return {from:shift(start,-7).toISOString(),to:new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+1,8)).toISOString()};
  },[current]);
  const reload=useCallback(async()=>{
    if(!supabase)return;
    setBusy(true);setMessage('');
    const {data,error}=await supabase.functions.invoke<{ok?:boolean;connected?:boolean;events?:GoogleEvent[];error?:string}>('purm-calendar-v8',{body:{action:'list',timeMin:range.from,timeMax:range.to}});
    if(error||data?.error){setMessage(await errorText(error,data));setItems([]);setConnected(false)}
    else{setConnected(Boolean(data?.connected));setItems(data?.events||[]);}
    setBusy(false);
  },[range.from,range.to]);
  useEffect(()=>{void reload()},[reload]);
  const byDay=useMemo(()=>{const m=new Map<string,GoogleEvent[]>();for(const e of items){if(e.status==='cancelled')continue;const key=displayDay(e);m.set(key,[...(m.get(key)||[]),e])}return m},[items]);
  const weeks=monthDays(current);
  const shownDays=mode==='month'?weeks:mode==='week'?weeks.slice(weekOffset*7,weekOffset*7+7):weeks;
  const dateTitle=dateBR(current,{month:'long',year:'numeric'});
  const go=(direction:number)=>{if(mode==='week'){const next=weekOffset+direction;if(next>=0&&next<=5){setWeekOffset(next);return}setCurrent(new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+(next<0?-1:1),1,12)));setWeekOffset(next<0?5:0);return;}setCurrent(new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+direction,1,12)));setWeekOffset(0)};
  const edit=(event:GoogleEvent)=>{
    if(event.recurring||event.allDay){setMessage('Para preservar a recorrência ou os horários de eventos de dia inteiro, edite este compromisso diretamente no Google Agenda.');return;}
    const d=displayDay(event),start=dateBR(new Date(event.start),{hour:'2-digit',minute:'2-digit'}),end=dateBR(new Date(event.end),{hour:'2-digit',minute:'2-digit'});
    setDraft({id:event.id,title:event.summary,description:event.description,day:d,start,end});setMessage('');
  };
  async function save(event:FormEvent){event.preventDefault();if(!supabase||!draft||busy||!canEdit)return;
    const start=isoFrom(draft.day,draft.start),end=isoFrom(draft.day,draft.end);
    if(new Date(end)<=new Date(start)){setMessage('O término deve ser posterior ao início.');return;}
    setBusy(true);setMessage('');
    const {data,error}=await supabase.functions.invoke<{ok?:boolean;error?:string}>('purm-calendar-v8',{body:{action:draft.id?'update':'create',eventId:draft.id||undefined,title:draft.title,description:draft.description,startAt:start,endAt:end,confirm:true}});
    if(error||data?.error||!data?.ok){setMessage(await errorText(error,data));setBusy(false);return;}
    setDraft(null);setBusy(false);await reload();
  }
  async function remove(){if(!supabase||!draft?.id||busy||!canEdit)return;
    if(!window.confirm(`Excluir “${draft.title}” da agenda Google da PURM? Esta ação é permanente e não pode ser desfeita pelo CRM.`))return;
    setBusy(true);setMessage('');
    const {data,error}=await supabase.functions.invoke<{ok?:boolean;error?:string}>('purm-calendar-v8',{body:{action:'delete',eventId:draft.id,confirm:true}});
    if(error||data?.error||!data?.ok){setMessage(await errorText(error,data));setBusy(false);return;}
    setDraft(null);setBusy(false);await reload();
  }
  return <section className="v8-calendar"><div className="v8-cal-header"><div><span className="v8-eyebrow">AGENDA CORPORATIVA</span><h2><CalendarDays size={24}/> Agenda PURM</h2><p>Compromissos reais da conta Google autorizada, sem sair do CRM.</p></div><div className="v8-cal-actions"><button type="button" className="secondary" onClick={()=>void reload()} disabled={busy}><RefreshCw size={16}/> Atualizar</button>{canEdit&&<button type="button" className="primary" onClick={()=>setDraft(emptyDraft(todayKey().startsWith(month)?todayKey():month+'-01'))} disabled={!connected||busy}><Plus size={16}/> Novo evento</button>}</div></div>
    {!connected&&<p className="v8-warning">Google Agenda indisponível ou não conectada. Confirme a conexão em Configurações e a publicação da função `purm-calendar-v8`.</p>}
    {message&&<p role="status" className="v8-notice">{message}</p>}
    <div className="v8-cal-toolbar"><div className="v8-cal-move"><button className="v8-icon-button" aria-label="Anterior" onClick={()=>go(-1)}><ChevronLeft size={18}/></button><button type="button" className="secondary" onClick={()=>{setCurrent(monthStart(new Date()));setWeekOffset(Math.floor((new Date().getUTCDate()-1+monthStart(new Date()).getUTCDay())/7))}}>Hoje</button><button className="v8-icon-button" aria-label="Próximo" onClick={()=>go(1)}><ChevronRight size={18}/></button><h3>{dateTitle}</h3></div><div className="v8-segment"><button type="button" className={mode==='month'?'active':''} onClick={()=>setMode('month')}>Mês</button><button type="button" className={mode==='week'?'active':''} onClick={()=>setMode('week')}>Semana</button><button type="button" className={mode==='list'?'active':''} onClick={()=>setMode('list')}>Lista</button></div></div>
    {mode==='list'?<div className="v8-cal-list">{items.filter(e=>e.status!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start)).map(e=><button key={e.id} type="button" onClick={()=>edit(e)} className="v8-cal-list-item"><span>{dateBR(new Date(e.start),{day:'2-digit',month:'short'})}</span><div><strong>{e.summary||'Sem título'}</strong><small>{displayTime(e)} {e.recurring?'· Recorrente':''}</small></div>{e.htmlLink&&<ExternalLink size={14}/>}</button>)}{!items.length&&<p className="v8-empty">Nenhum evento retornado no período.</p>}</div>
      :<div className={'v8-cal-grid '+(mode==='week'?'week':'')}><div className="v8-cal-weekdays">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=><span key={d}>{d}</span>)}</div><div className="v8-cal-days">{shownDays.map(d=>{const key=dayKey(d),events=byDay.get(key)||[];return <div key={key} className={'v8-day '+(key.startsWith(month)?'':'outside')+(key===todayKey()?' today':'')}><div className="v8-day-label"><span>{d.getUTCDate()}</span>{canEdit&&<button type="button" title={'Novo compromisso em '+key} onClick={()=>setDraft(emptyDraft(key))}><Plus size={12}/></button>}</div><div className="v8-day-events">{events.slice(0,mode==='week'?12:4).map(e=><button key={e.id} type="button" title={e.summary} className="v8-event" onClick={()=>edit(e)}><span>{displayTime(e)}</span> {e.summary||'Sem título'}</button>)}{events.length>(mode==='week'?12:4)&&<small>+{events.length-(mode==='week'?12:4)} eventos</small>}</div></div>})}</div></div>}
    <p className="v8-note"><ShieldCheck size={15}/> Compromissos recorrentes e eventos de dia inteiro são exibidos para consulta; edite-os no Google Agenda para evitar alterar uma série inteira sem querer. Não há envio automático de mensagens pelo WhatsApp.</p>
    {draft&&<div className="v8-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDraft(null)}}><form className="v8-modal" onSubmit={e=>void save(e)} role="dialog" aria-modal="true" aria-label={draft.id?'Editar evento':'Novo evento'}><div className="v8-section-head"><h3>{draft.id?'Editar compromisso':'Novo compromisso'}</h3><button type="button" className="v8-icon-button" onClick={()=>setDraft(null)} aria-label="Fechar"><X size={18}/></button></div><label>Assunto<input required minLength={2} maxLength={180} value={draft.title} onChange={e=>setDraft(p=>p&&({...p,title:e.target.value}))}/></label><label>Data<input required type="date" value={draft.day} onChange={e=>setDraft(p=>p&&({...p,day:e.target.value}))}/></label><div className="v8-modal-times"><label>Início<input required type="time" value={draft.start} onChange={e=>setDraft(p=>p&&({...p,start:e.target.value}))}/></label><label>Término<input required type="time" value={draft.end} onChange={e=>setDraft(p=>p&&({...p,end:e.target.value}))}/></label></div><label>Descrição<textarea maxLength={1500} rows={3} value={draft.description} onChange={e=>setDraft(p=>p&&({...p,description:e.target.value}))}/></label><p className="v8-note">Horários no fuso da PURM (Recife, UTC−3). Lembretes popup: 24h e 1h.</p><div className="v8-modal-actions">{draft.id&&<button type="button" className="secondary danger" onClick={()=>void remove()} disabled={busy}><Trash2 size={15}/> Excluir</button>}<button type="button" className="secondary" onClick={()=>setDraft(null)}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{draft.id?<Pencil size={15}/>:<Plus size={15}/>} {busy?'Salvando...':'Salvar no Google'}</button></div></form></div>}
  </section>;
}
