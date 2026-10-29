import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent, type CSSProperties } from 'react';
import {
  LayoutDashboard, Columns3, CalendarDays, ChartNoAxesCombined, UsersRound, Settings2,
  Search, Plus, LogOut, Truck, Building2, Flame, CircleDollarSign, CalendarClock,
  MapPin, MessageCircle, Pencil, X, ChevronRight, GripVertical, ArrowUpRight,
  ClipboardList, CheckCircle2, ShieldCheck, LoaderCircle, RefreshCw, FileText, Send, WalletCards, Bot
} from 'lucide-react';
import { configured, supabase } from './supabase';
import FinancePage from './finance/FinancePage';
import CarlaPage from './finance/CarlaPage';
import { money, dateText, shortDate, type Lead, type Stage, type Interaction } from './data';

type Page = 'dashboard' | 'pipeline' | 'clientes' | 'agenda' | 'relatorios' | 'configuracoes' | 'financeiro' | 'carla';
type Member = { user_id: string; full_name: string; role: string; branch: string };
type FormFields = Pick<Lead, 'company_name'|'contact_name'|'whatsapp'|'email'|'origin_city'|'destination_city'|'cargo_description'|'weight_kg'|'pickup_date'|'quote_amount'|'priority'|'temperature'|'stage_id'|'next_contact_at'|'branch'|'notes'>;
const MENU: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  {id:'dashboard', label:'Dashboard', icon:LayoutDashboard},
  {id:'pipeline', label:'Pipeline comercial', icon:Columns3},
  {id:'clientes', label:'Clientes e cotações', icon:UsersRound},
  {id:'agenda', label:'Agenda', icon:CalendarDays},
  {id:'relatorios', label:'Relatórios', icon:ChartNoAxesCombined},
  {id:'financeiro', label:'Financeiro', icon:WalletCards},
  {id:'carla', label:'Secretária Carla', icon:Bot},
  {id:'configuracoes', label:'Configurações', icon:Settings2}
];
const PRIORITY: Record<Lead['priority'],string> = {high:'Alta',medium:'Média',low:'Baixa'};
const TEMP: Record<Lead['temperature'],string> = {hot:'Quente',warm:'Morno',cold:'Frio'};
const inputDateTime = (value: string|null) => {
  if (!value) return '';
  const d = new Date(value); if (Number.isNaN(d.getTime())) return '';
  const date = new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return date.toISOString().slice(0,16);
};
const prettyError=(err:unknown)=>err instanceof Error?err.message:String(err);
function kpis(leads:Lead[],stages:Stage[]){
  const open = new Set(stages.filter(s=>s.kind==='open').map(s=>s.id));
  const won = new Set(stages.filter(s=>s.kind==='won').map(s=>s.id));
  const active=leads.filter(l=>open.has(l.stage_id));
  return {active:active.length,hot:active.filter(l=>l.temperature==='hot').length,
    potential:active.reduce((t,l)=>t+Number(l.quote_amount||0),0),
    followups:active.filter(l=>Boolean(l.next_contact_at)).length,
    won:leads.filter(l=>won.has(l.stage_id)).length};
}

export default function App(){
  const [session,setSession]=useState<string|null>(null);
  const [member,setMember]=useState<Member|null>(null);
  const [booting,setBooting]=useState(true);
  const [page,setPage]=useState<Page>('dashboard');
  const [stages,setStages]=useState<Stage[]>([]);
  const [leads,setLeads]=useState<Lead[]>([]);
  const [interactions,setInteractions]=useState<Interaction[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [filter,setFilter]=useState('');
  const [priorityFilter,setPriorityFilter]=useState('all');
  const [tempFilter,setTempFilter]=useState('all');
  const [editor,setEditor]=useState<Lead|null|'new'>(null);
  const [detailId,setDetailId]=useState<string|null>(null);
  const [dragId,setDragId]=useState<string|null>(null);
  const [dragOver,setDragOver]=useState<string|null>(null);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [loginEmail,setLoginEmail]=useState('');
  const [loginPassword,setLoginPassword]=useState('');
  const [interactionText,setInteractionText]=useState('');
  const [interactionKind,setInteractionKind]=useState('note');

  const fetchData=useCallback(async()=>{
    if(!supabase) return;
    const [s,l,i]=await Promise.all([
      supabase.from('purm_crm_stages').select('*').order('position'),
      supabase.from('purm_crm_leads').select('*').order('created_at',{ascending:false}),
      supabase.from('purm_crm_interactions').select('*').order('created_at',{ascending:false})
    ]);
    if(s.error||l.error||i.error) throw new Error(s.error?.message||l.error?.message||i.error?.message);
    setStages((s.data||[]) as Stage[]);
    setLeads((l.data||[]) as Lead[]);
    setInteractions((i.data||[]) as Interaction[]);
  },[]);
  const checkSession=useCallback(async()=>{
    if(!supabase){setBooting(false);return;}
    try{
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user){setSession(null);setMember(null);setBooting(false);return;}
      setSession(user.id);
      const {data:m,error:membershipError}=await supabase.from('purm_crm_members').select('user_id,full_name,role,branch').eq('user_id',user.id).maybeSingle();
      if(membershipError)throw membershipError;
      setMember(m as Member|null);
      if(m)await fetchData();
    }catch(err){setError('Não foi possível carregar a conta: '+prettyError(err));}
    finally{setBooting(false);}
  },[fetchData]);
  useEffect(()=>{
    void checkSession();
    const {data}=supabase?.auth.onAuthStateChange((event)=>{
      if(event==='SIGNED_IN'||event==='SIGNED_OUT') void checkSession();
    })||{data:null};
    return ()=>data?.subscription.unsubscribe();
  },[checkSession]);

  const detail=leads.find(l=>l.id===detailId)||null;
  const metrics=useMemo(()=>kpis(leads,stages),[leads,stages]);
  const filtered=useMemo(()=>{
    const q=filter.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    return leads.filter(l=>{
      if(priorityFilter!=='all'&&l.priority!==priorityFilter)return false;
      if(tempFilter!=='all'&&l.temperature!==tempFilter)return false;
      if(!q)return true;
      return [l.company_name,l.contact_name,l.whatsapp,l.email,l.origin_city,l.destination_city,l.branch,l.cargo_description]
        .join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q);
    });
  },[leads,filter,priorityFilter,tempFilter]);
  const stageById=useMemo(()=>new Map(stages.map(s=>[s.id,s])),[stages]);
  const selectedInteraction=interactions.filter(i=>i.lead_id===detailId);

  async function login(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase)return;
    setBusy(true);setError('');
    const {error:e}=await supabase.auth.signInWithPassword({email:loginEmail.trim(),password:loginPassword});
    if(e)setError('Não foi possível entrar. Verifique suas credenciais.');
    else await checkSession();
    setBusy(false);
  }
  async function logout(){
    await supabase?.auth.signOut();setSession(null);setMember(null);setLeads([]);setInteractions([]);
  }
  async function refresh(){setBusy(true);setError('');try{await fetchData();}catch(err){setError(prettyError(err));}finally{setBusy(false);}}

  async function saveLead(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase||busy)return;
    const form=event.currentTarget, d=new FormData(form);
    const str=(key:string)=>String(d.get(key)||'').trim();
    const num=(key:string)=>str(key)===''?null:Number(str(key));
    const stage_id=str('stage_id');
    if(!stages.some(s=>s.id===stage_id)){setError('Etapa inválida.');return;}
    const payload:FormFields={
      company_name:str('company_name'),contact_name:str('contact_name'),whatsapp:str('whatsapp'),email:str('email'),
      origin_city:str('origin_city'),destination_city:str('destination_city'),cargo_description:str('cargo_description'),
      weight_kg:num('weight_kg'),pickup_date:str('pickup_date')||null,quote_amount:num('quote_amount'),
      priority:str('priority') as Lead['priority'],temperature:str('temperature') as Lead['temperature'],
      stage_id,next_contact_at:str('next_contact_at')?new Date(str('next_contact_at')).toISOString():null,
      branch:str('branch')||'Recife',notes:str('notes')
    };
    if(payload.company_name.length<2||payload.company_name.length>160){setError('Informe uma empresa com 2 a 160 caracteres.');return;}
    if(payload.weight_kg!==null&&(!Number.isFinite(payload.weight_kg)||payload.weight_kg<0)||
       payload.quote_amount!==null&&(!Number.isFinite(payload.quote_amount)||payload.quote_amount<0)){setError('Peso e valor devem ser números positivos.');return;}
    setBusy(true);setError('');
    try{
      const result=editor==='new'
        ? await supabase.from('purm_crm_leads').insert(payload)
        : await supabase.from('purm_crm_leads').update(payload).eq('id',(editor as Lead).id);
      if(result.error)throw result.error;
      setEditor(null);await fetchData();
    }catch(err){setError('Não foi possível salvar: '+prettyError(err));}
    finally{setBusy(false);}
  }
  async function moveLead(leadId:string,stageId:string){
    if(!supabase||busy||!stages.some(s=>s.id===stageId))return;
    const original=leads.find(l=>l.id===leadId);
    if(!original||original.stage_id===stageId)return;
    setLeads(prev=>prev.map(l=>l.id===leadId?{...l,stage_id:stageId}:l));
    setBusy(true);setError('');
    const {error:e}=await supabase.from('purm_crm_leads').update({stage_id:stageId}).eq('id',leadId);
    if(e){setLeads(prev=>prev.map(l=>l.id===leadId?original:l));setError('Não foi possível mover o card: '+e.message);}
    setBusy(false);
  }
  function drop(event:DragEvent<HTMLDivElement>,stageId:string){
    event.preventDefault();setDragOver(null);
    const id=event.dataTransfer.getData('text/purm-lead-id');
    if(id&&leads.some(l=>l.id===id))void moveLead(id,stageId);
    setDragId(null);
  }
  async function addInteraction(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase||!detailId||!interactionText.trim()||busy)return;
    setBusy(true);setError('');
    const {error:e}=await supabase.from('purm_crm_interactions').insert({lead_id:detailId,kind:interactionKind,description:interactionText.trim()});
    if(e)setError('Não foi possível registrar atividade: '+e.message);
    else{setInteractionText('');await fetchData();}
    setBusy(false);
  }
  const openEditor=(lead:Lead|null|'new')=>{setError('');setDetailId(null);setEditor(lead===null?'new':lead);};
  const nav=(next:Page)=>{setPage(next);setMobileOpen(false);setError('');};

  if(!configured)return <div className="gate-page"><div className="gate-card"><span className="logo-block">PURM</span><h1>CRM PURM</h1><p>A aplicação foi instalada, mas o banco de dados exclusivo da PURM ainda não está configurado.</p><div className="notice">Configure <code>crm/.env.local</code> e execute manualmente os arquivos SQL após revisão. Nenhuma informação comercial é salva neste estado.</div></div></div>;
  if(booting)return <div className="gate-page"><LoaderCircle className="spin" size={32}/><p>Verificando acesso...</p></div>;
  if(!session)return <div className="gate-page"><div className="gate-card"><span className="logo-block">PURM</span><p className="eyebrow">TRANSPORTES E CARGAS</p><h1>Bem-vindo ao CRM.</h1><p>Entre com a conta corporativa autorizada pela PURM.</p><form onSubmit={login} className="login-form"><label>E-mail<input type="email" required autoComplete="username" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="voce@empresa.com.br"/></label><label>Senha<input type="password" required autoComplete="current-password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Sua senha"/></label>{error&&<div role="alert" className="error">{error}</div>}<button disabled={busy} className="primary">{busy?'Entrando...':'Entrar no CRM'} <ArrowUpRight size={16}/></button></form><small>Sem cadastro público. Contas são habilitadas pelo administrador.</small></div></div>;
  if(!member)return <div className="gate-page"><div className="gate-card"><ShieldCheck size={36}/><h1>Acesso não autorizado.</h1><p>Esta conta existe, mas ainda não foi incluída na equipe do CRM PURM. Solicite liberação ao administrador.</p><button className="primary" onClick={()=>void logout()}>Sair</button></div></div>;

  const metricCards=[
    {label:'Leads ativos',value:String(metrics.active),small:'no funil comercial',icon:Building2,kind:'blue'},
    {label:'Oportunidades quentes',value:String(metrics.hot),small:'prioridade de contato',icon:Flame,kind:'orange'},
    {label:'Potencial de cotações',value:money(metrics.potential),small:'estimativas em aberto',icon:CircleDollarSign,kind:'cyan'},
    {label:'Próximas ações',value:String(metrics.followups),small:'contatos programados',icon:CalendarClock,kind:'purple'}
  ];
  const metricView=<section className="summary-grid">{metricCards.map(item=>{
    const Icon=item.icon;return <article className="summary-card" key={item.label}><div className={'metric-icon '+item.kind}><Icon size={21}/></div><div><span>{item.label}</span><strong>{item.value}</strong><small>{item.small}</small></div></article>;
  })}</section>;
  const board=<><div className="toolbar"><div className="search"><Search size={18}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Buscar empresa, contato, origem, destino ou carga..." aria-label="Pesquisar oportunidades"/></div><select aria-label="Filtrar por temperatura" value={tempFilter} onChange={e=>setTempFilter(e.target.value)}><option value="all">Todas as temperaturas</option><option value="hot">Quentes</option><option value="warm">Mornos</option><option value="cold">Frios</option></select><select aria-label="Filtrar por prioridade" value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}><option value="all">Todas as prioridades</option><option value="high">Alta prioridade</option><option value="medium">Média prioridade</option><option value="low">Baixa prioridade</option></select><span className="result-num">{filtered.length} oportunidades</span></div>
    <div className="kanban" aria-label="Funil comercial da PURM">{stages.map(stage=>{
      const items=filtered.filter(l=>l.stage_id===stage.id);
      return <div className={'stage '+(dragOver===stage.id?'drag-over':'')} key={stage.id} onDragOver={e=>{e.preventDefault();setDragOver(stage.id)}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragOver(null)}} onDrop={e=>drop(e,stage.id)} style={{'--stage-color':stage.color} as CSSProperties}>
        <div className="stage-accent"/><div className="stage-head"><div><i className="stage-dot"/><strong>{stage.name}</strong><span>{items.length}</span></div><small>{money(items.reduce((s,l)=>s+Number(l.quote_amount||0),0))}</small></div>
        <div className="stage-list">{items.length===0&&<div className="empty-stage">Arraste uma cotação para cá</div>}{items.map(lead=><article key={lead.id} draggable={!busy} onDragStart={e=>{setDragId(lead.id);e.dataTransfer.setData('text/purm-lead-id',lead.id);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragId(null);setDragOver(null)}} className={'lead-card '+(dragId===lead.id?'dragging':'')}>
          <div className="lead-card-top"><span className="lead-avatar">{lead.company_name.slice(0,2).toUpperCase()}</span><div><strong>{lead.company_name}</strong><small>{lead.contact_name||'Contato a identificar'}</small></div><GripVertical size={16}/></div>
          <div className="route"><MapPin size={14}/><span>{lead.origin_city||'Origem?'} → {lead.destination_city||'Destino?'}</span></div><div className="description">{lead.cargo_description||'Carga a detalhar'}</div><div className="lead-badges"><span className={'badge '+lead.temperature}>{TEMP[lead.temperature]}</span><span className={'badge priority-'+lead.priority}>{PRIORITY[lead.priority]}</span></div><div className="card-bottom"><strong>{money(lead.quote_amount)}</strong><button aria-label={'Abrir cotação de '+lead.company_name} onClick={()=>setDetailId(lead.id)}><ChevronRight size={17}/></button></div>
        </article>)}</div></div>;
    })}</div></>;

  return <div className="app-shell">
    <aside className={'sidebar '+(mobileOpen?'mobile-open':'')}>
      <div className="sidebar-brand"><span className="brand-mark"><Truck size={25}/></span><span><b>PURM</b><small>TRANSPORTES E CARGAS</small></span></div>
      <div className="sidebar-title">GESTÃO COMERCIAL</div>
      <nav>{MENU.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>nav(item.id)} className={'sidebar-link '+(page===item.id?'active':'')}><Icon size={18}/><span>{item.label}</span></button>;})}</nav>
      <div className="sidebar-footer"><div className="user-summary"><span className="user-avatar">{member.full_name.slice(0,2).toUpperCase()}</span><div><strong>{member.full_name}</strong><small>{member.role} · {member.branch}</small></div></div><button className="logout" onClick={()=>void logout()}><LogOut size={16}/> Sair</button></div>
    </aside>
    <main className="main-area">
      <header className="top-header"><button className="mobile-toggle" onClick={()=>setMobileOpen(v=>!v)}>☰</button><div><span className="top-eyebrow">PURM / ÁREA INTERNA</span><h1>{MENU.find(x=>x.id===page)?.label}</h1><p>Gestão comercial de transportes e cotações</p></div><div className="header-actions"><span className="welcome">{member.branch}</span><button className="icon-button" title="Atualizar" aria-label="Atualizar dados" onClick={()=>void refresh()} disabled={busy}><RefreshCw size={18} className={busy?'spin':''}/></button><span className="header-avatar">{member.full_name.slice(0,1).toUpperCase()}</span></div></header>
      <div className="content">
        {error&&<div className="error content-error" role="alert">{error}<button aria-label="Dispensar aviso" onClick={()=>setError('')}><X size={16}/></button></div>}
        {(page==='financeiro'||page==='carla')&&member.role!=='admin'&&member.role!=='gestor'&&<div className='finance-panel'><h3>Acesso restrito</h3><p>Somente administradores e gestores podem acessar este módulo.</p></div>}
        {page==='financeiro'&&(member.role==='admin'||member.role==='gestor')&&<FinancePage onNavigateToCarla={()=>nav('carla')}/>}
        {page==='carla'&&(member.role==='admin'||member.role==='gestor')&&<CarlaPage/>}
        {page==='dashboard'&&<><section className="hero"><div><span className="eyebrow">VISÃO GERAL</span><h2>Seu comercial em movimento.</h2><p>Uma visão clara das oportunidades, cotações e próximos contatos da PURM.</p></div><button className="primary" onClick={()=>nav('pipeline')}>Abrir pipeline <ArrowUpRight size={17}/></button></section>{metricView}<div className="split"><section className="panel"><h3>Pipeline por etapa</h3><p>Acompanhe onde cada cotação está.</p>{stages.map(s=>{const count=leads.filter(l=>l.stage_id===s.id).length;return <div className="progress-row" key={s.id}><span>{s.name}</span><div><i style={{background:s.color,width:`${Math.max(0,count/Math.max(1,leads.length)*100)}%`}}/></div><strong>{count}</strong></div>;})}</section><section className="panel"><h3>Próximos contatos</h3><p>Não deixe nenhuma oportunidade sem retorno.</p>{leads.filter(l=>l.next_contact_at).sort((a,b)=>String(a.next_contact_at).localeCompare(String(b.next_contact_at))).slice(0,6).map(l=><button className="activity-row" key={l.id} onClick={()=>setDetailId(l.id)}><CalendarClock size={18}/><span><strong>{l.company_name}</strong><small>{shortDate(l.next_contact_at)}</small></span><ChevronRight size={16}/></button>)}{!leads.some(l=>l.next_contact_at)&&<div className="empty">Nenhum retorno agendado.</div>}</section></div></>}
        {page==='pipeline'&&<><section className="hero"><div><span className="eyebrow">PIPELINE COMERCIAL</span><h2>Oportunidades</h2><p>O mesmo modelo de Kanban do APROVUP, adaptado ao transporte de cargas.</p></div><button className="primary" onClick={()=>openEditor('new')}><Plus size={17}/> Nova cotação</button></section>{metricView}{stages.length?board:<div className="panel empty">O pipeline está sem etapas. Revise e execute manualmente o arquivo <code>supabase/stages.sql</code> no projeto PURM.</div>}</>}
        {page==='clientes'&&<><section className="hero"><div><span className="eyebrow">BASE COMERCIAL</span><h2>Empresas e cotações</h2><p>Consulte as empresas, dados de carga e rotas cadastradas.</p></div><button className="primary" onClick={()=>openEditor('new')}><Plus size={17}/> Novo cadastro</button></section><div className="toolbar"><div className="search"><Search size={18}/><input aria-label="Pesquisar clientes" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Pesquisar empresa, origem, destino..."/></div><span className="result-num">{filtered.length} registros</span></div><div className="table-scroll"><table><thead><tr><th>Empresa / Contato</th><th>Rota</th><th>Etapa</th><th>Valor cotado</th><th>Retorno</th><th></th></tr></thead><tbody>{filtered.map(l=><tr key={l.id}><td><strong>{l.company_name}</strong><small>{l.contact_name||'—'}</small></td><td>{l.origin_city||'—'} → {l.destination_city||'—'}</td><td><span className="table-stage" style={{borderLeftColor:stageById.get(l.stage_id)?.color}}>{stageById.get(l.stage_id)?.name||'—'}</span></td><td>{money(l.quote_amount)}</td><td>{shortDate(l.next_contact_at)}</td><td><button className="text-action" onClick={()=>setDetailId(l.id)}>Abrir <ArrowUpRight size={15}/></button></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty">Nenhuma cotação encontrada.</div>}</div></>}
        {page==='agenda'&&<><section className="hero"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Agenda comercial</h2><p>Retornos programados para clientes e solicitações de frete.</p></div></section><section className="panel"><h3>Próximos compromissos</h3>{leads.filter(l=>l.next_contact_at).sort((a,b)=>String(a.next_contact_at).localeCompare(String(b.next_contact_at))).map(l=><button className="agenda-row" key={l.id} onClick={()=>setDetailId(l.id)}><span className={'date-pill '+(new Date(l.next_contact_at!).getTime()<Date.now()?'overdue':'')}><CalendarDays size={17}/>{shortDate(l.next_contact_at)}</span><span><strong>{l.company_name}</strong><small>{l.origin_city||'Origem'} → {l.destination_city||'Destino'} · {l.contact_name||'Contato pendente'}</small></span><ChevronRight size={18}/></button>)}{!leads.some(l=>l.next_contact_at)&&<div className="empty">Nenhum retorno agendado. Defina uma data em uma cotação.</div>}</section></>}
        {page==='relatorios'&&<><section className="hero"><div><span className="eyebrow">PERFORMANCE COMERCIAL</span><h2>Relatórios</h2><p>Indicadores extraídos das cotações cadastradas no CRM.</p></div></section>{metricView}<div className="split"><section className="panel"><h3>Distribuição do funil</h3><div className="report-bars">{stages.map(s=>{const count=leads.filter(l=>l.stage_id===s.id).length;return <div key={s.id} className="bar-row"><div><span>{s.name}</span><strong>{count}</strong></div><div className="bar-rail"><i style={{width:`${count/Math.max(1,leads.length)*100}%`,background:s.color}}/></div></div>;})}</div></section><section className="panel"><h3>Resumo de oportunidades</h3><div className="report-value"><span>Quantidade total</span><strong>{leads.length}</strong></div><div className="report-value"><span>Oportunidades ganhas</span><strong>{metrics.won}</strong></div><div className="report-value"><span>Taxa de ganho (todas as cotações)</span><strong>{leads.length?Math.round(metrics.won/leads.length*100):0}%</strong></div><div className="report-value"><span>Valor de propostas abertas</span><strong>{money(metrics.potential)}</strong></div></section></div></>}
        {page==='configuracoes'&&<><section className="hero"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h2>Configurações</h2><p>Informações de acesso e estrutura do CRM PURM.</p></div></section><div className="split"><section className="panel"><ShieldCheck size={30} color="#2868ff"/><h3>Meu acesso</h3><div className="report-value"><span>Usuário</span><strong>{member.full_name}</strong></div><div className="report-value"><span>Perfil</span><strong>{member.role}</strong></div><div className="report-value"><span>Filial</span><strong>{member.branch}</strong></div><p className="hint">Alterações de usuários e permissões exigem administração segura no Supabase. Esta tela não concede acesso automaticamente.</p></section><section className="panel"><ClipboardList size={30} color="#2868ff"/><h3>Etapas do funil</h3>{stages.map(s=><div key={s.id} className="report-value"><span><i className="mini-dot" style={{background:s.color}}/>{s.name}</span><strong>{s.kind==='open'?'Aberta':s.kind==='won'?'Ganha':'Perdida'}</strong></div>)}<p className="hint">Na primeira versão, a gestão das etapas é feita administrativamente no banco dedicado.</p></section></div></>}
      </div>
    </main>

    {editor&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditor(null)}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="lead-editor-title"><div className="modal-head"><div><span className="eyebrow">COTAÇÃO DE TRANSPORTE</span><h2 id="lead-editor-title">{editor==='new'?'Nova cotação':'Editar cotação'}</h2><p>Cadastre empresa, rota, carga e acompanhamento.</p></div><button className="modal-close" onClick={()=>setEditor(null)} aria-label="Fechar"><X size={20}/></button></div><form className="lead-form" onSubmit={saveLead}><h3><Building2 size={17}/> Dados do cliente</h3><div className="form-grid"><label className="full">Nome da empresa *<input name="company_name" required minLength={2} maxLength={160} defaultValue={editor==='new'?'':editor.company_name} placeholder="Nome da empresa"/></label><label>Contato<input name="contact_name" maxLength={160} defaultValue={editor==='new'?'':editor.contact_name}/></label><label>Filial<select name="branch" defaultValue={editor==='new'?member.branch:editor.branch}><option>Recife</option><option>Salvador</option><option>Fortaleza</option></select></label><label>WhatsApp<input name="whatsapp" type="tel" maxLength={50} defaultValue={editor==='new'?'':editor.whatsapp}/></label><label>E-mail<input name="email" type="email" maxLength={200} defaultValue={editor==='new'?'':editor.email}/></label></div><h3><Truck size={18}/> Informações da carga</h3><div className="form-grid"><label>Origem (cidade/UF)<input name="origin_city" maxLength={160} defaultValue={editor==='new'?'':editor.origin_city}/></label><label>Destino (cidade/UF)<input name="destination_city" maxLength={160} defaultValue={editor==='new'?'':editor.destination_city}/></label><label>Peso (kg)<input name="weight_kg" type="number" min="0" step="0.01" defaultValue={editor==='new'?'':editor.weight_kg??''}/></label><label>Data de coleta<input name="pickup_date" type="date" defaultValue={editor==='new'?'':editor.pickup_date??''}/></label><label className="full">Descrição da carga<textarea name="cargo_description" rows={3} maxLength={3000} defaultValue={editor==='new'?'':editor.cargo_description}/></label></div><h3><CircleDollarSign size={17}/> Acompanhamento comercial</h3><div className="form-grid"><label>Valor estimado (R$)<input name="quote_amount" type="number" step="0.01" min="0" defaultValue={editor==='new'?'':editor.quote_amount??''}/></label><label>Etapa<select name="stage_id" required defaultValue={editor==='new'?stages[0]?.id:editor.stage_id}>{stages.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>Prioridade<select name="priority" defaultValue={editor==='new'?'medium':editor.priority}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label><label>Temperatura<select name="temperature" defaultValue={editor==='new'?'warm':editor.temperature}><option value="cold">Frio</option><option value="warm">Morno</option><option value="hot">Quente</option></select></label><label className="full">Próximo contato<input name="next_contact_at" type="datetime-local" defaultValue={editor==='new'?'':inputDateTime(editor.next_contact_at)}/></label><label className="full">Observações<textarea name="notes" rows={3} maxLength={3000} defaultValue={editor==='new'?'':editor.notes}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEditor(null)}>Cancelar</button><button type="submit" className="primary" disabled={busy||!stages.length}>{busy?'Salvando...':'Salvar cotação'} <CheckCircle2 size={16}/></button></div></form></section></div>}

    {detail&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailId(null)}}><section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="modal-head"><div><span className="eyebrow">HISTÓRICO COMERCIAL</span><h2 id="detail-title">{detail.company_name}</h2><p>{detail.contact_name||'Contato não informado'} · {detail.branch}</p></div><button aria-label="Fechar" className="modal-close" onClick={()=>setDetailId(null)}><X size={20}/></button></div><div className="detail-body"><div className="detail-facts"><div><span>Origem → Destino</span><strong>{detail.origin_city||'—'} → {detail.destination_city||'—'}</strong></div><div><span>Cotação</span><strong>{money(detail.quote_amount)}</strong></div><div><span>Data de coleta</span><strong>{detail.pickup_date?dateText(detail.pickup_date+'T12:00:00Z'):'A combinar'}</strong></div><div><span>Próximo contato</span><strong>{shortDate(detail.next_contact_at)}</strong></div><div><span>Peso</span><strong>{detail.weight_kg??'—'} kg</strong></div><div><span>Etapa atual</span><select aria-label="Alterar etapa da cotação" value={detail.stage_id} disabled={busy} onChange={e=>void moveLead(detail.id,e.target.value)}>{stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div><p className="detail-description"><FileText size={17}/> {detail.cargo_description||'Descrição de carga não informada'}</p>{detail.notes&&<div className="detail-notes"><strong>Observações</strong><p>{detail.notes}</p></div>}<div className="detail-actions"><button className="secondary" onClick={()=>openEditor(detail)}><Pencil size={16}/> Editar cotação</button>{detail.whatsapp&&<a className="primary" href={'https://wa.me/'+detail.whatsapp.replace(/\D/g,'')} target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/> WhatsApp <ArrowUpRight size={15}/></a>}</div><h3>Histórico de atividades</h3><form className="interaction-form" onSubmit={addInteraction}><select aria-label="Tipo de atividade" value={interactionKind} onChange={e=>setInteractionKind(e.target.value)}><option value="note">Observação</option><option value="call">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="meeting">Reunião</option></select><textarea aria-label="Registrar atividade" value={interactionText} onChange={e=>setInteractionText(e.target.value)} maxLength={3000} required placeholder="Registre o atendimento, o retorno ou a negociação..."/><button type="submit" disabled={busy||!interactionText.trim()} className="primary"><Send size={16}/> Registrar</button></form><div className="history">{selectedInteraction.map(i=><article key={i.id}><span className="history-mark"/><div><strong>{({note:'Observação',call:'Ligação',whatsapp:'WhatsApp',email:'E-mail',meeting:'Reunião'} as Record<string,string>)[i.kind]||i.kind}</strong><small>{shortDate(i.created_at)}</small><p>{i.description}</p></div></article>)}{!selectedInteraction.length&&<div className="empty">Nenhum registro de atividade ainda.</div>}</div></div></section></div>}
  </div>;
}
