import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../supabase';

type Alert={id:string;title:string;body:string;lead_id:string|null;read_at:string|null;created_at:string};
export default function LeadAlerts({onOpenLead}:{onOpenLead:(id:string)=>void}){
 const [alerts,setAlerts]=useState<Alert[]>([]),[open,setOpen]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{if(!supabase)return;
   const {data,error:e}=await supabase.from('purm_notifications').select('id,title,body,lead_id,read_at,created_at').order('created_at',{ascending:false}).limit(30);
   if(e){setError('Avisos indisponíveis. Revise o SQL V3.');return;}
   setError('');setAlerts((data||[]) as Alert[]);
 },[]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},45000);return()=>clearInterval(timer);},[load]);
 const unread=alerts.filter(x=>!x.read_at).length;
 async function markRead(id:string){if(!supabase)return;
   const {error}=await supabase.rpc('purm_mark_notification_read',{p_notification_id:id});
   if(error)setError(error.message);else await load();
 }
 return <div className="lead-alerts"><button type="button" className="icon-button" aria-label={`Avisos de leads: ${unread} não lidos`} title="Avisos de leads" onClick={()=>setOpen(x=>!x)}><Bell size={19}/>{unread>0&&<span className="alert-count">{unread}</span>}</button>
  {open&&<div className="alert-popover"><div className="alert-heading"><strong>Novos leads e avisos</strong><button className="secondary" onClick={()=>void load()}><RefreshCw size={13}/> Atualizar</button></div>
   <p className="finance-muted">Avisos internos enquanto você usa o CRM. Alertas por WhatsApp chegarão após conectar a Meta.</p>
   {error&&<p role="alert" className="finance-notice">{error}</p>}
   {alerts.map(a=><div key={a.id} className={'alert-item '+(!a.read_at?'unread':'')}><div><strong>{a.title}</strong><p>{a.body}</p><small>{new Date(a.created_at).toLocaleString('pt-BR',{timeZone:'America/Recife'})}</small></div><div className="alert-actions">{a.lead_id&&<button onClick={()=>{onOpenLead(a.lead_id!);setOpen(false);}}>Abrir lead</button>}{!a.read_at&&<button onClick={()=>void markRead(a.id)}><CheckCheck size={14}/> Lido</button>}</div></div>)}
   {!alerts.length&&!error&&<p className="finance-empty">Nenhum aviso recebido.</p>}
  </div>}
 </div>;
}
