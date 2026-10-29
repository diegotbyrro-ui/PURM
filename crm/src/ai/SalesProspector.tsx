import { useEffect, useState, type FormEvent } from 'react';
import './salesAI.css';
import { Ban, Building2, ExternalLink, LoaderCircle, Search, Sparkles, Plus, ShieldCheck, MapPin } from 'lucide-react';
import { supabase } from '../supabase';
import type { Lead, Stage } from '../data';

type Prospect = {
  company_name: string; segment: string; city: string; state: string;
  website: string; phone: string; email: string; whatsapp: string;
  decision_maker_name: string; decision_maker_role: string;
  opportunity: string; recommended_approach: string;
  estimated_monthly_shipments: string; likely_cargo: string;
  prospecting_score: number; priority: 'low'|'medium'|'high';
  sources: string[];
};
type Props = { stages: Stage[]; existingLeads: Lead[]; branch: string; canEdit: boolean; onLeadSaved: () => void };
const safeUrl = (value: string) => {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : ''; }
  catch { return ''; }
};
const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const problem = (e: unknown) => e instanceof Error ? e.message : String(e);

export default function SalesProspector({stages,existingLeads,branch,canEdit,onLeadSaved}:Props){
  const [term,setTerm]=useState(''); const [region,setRegion]=useState('');
  const [quantity,setQuantity]=useState(5);const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');const [results,setResults]=useState<Prospect[]>([]);
  const [saved,setSaved]=useState<string[]>([]); const [blocked,setBlocked]=useState<string[]>([]);
  const [blocking,setBlocking]=useState('');
  useEffect(()=>{let alive=true;void supabase?.from('purm_prospect_blocklist').select('normalized_name').then(({data})=>{
    if(alive&&data)setBlocked(data.map(x=>String(x.normalized_name)));
  });return()=>{alive=false};},[]);
  const known=new Set([...existingLeads.map(l=>normalized(l.company_name)),...blocked]);
  async function search(e:FormEvent){e.preventDefault();if(!supabase||!canEdit)return;
    if(term.trim().length<3){setNotice('Descreva o segmento que deseja prospectar.');return;}
    setBusy(true);setNotice('Pesquisando empresas e fontes públicas...');setResults([]);setSaved([]);
    try {
      const {data,error}=await supabase.functions.invoke('purm-sales-ai',{body:{mode:'prospect',query:term.trim(),region:region.trim(),quantity}});
      if(error)throw error; if(data?.error)throw new Error(String(data.error));
      if(!Array.isArray(data?.companies))throw new Error('Resposta inesperada da pesquisa.');
      const found=(data.companies as Prospect[]).filter(p=>p.company_name&&!known.has(normalized(p.company_name)));
      setResults(found);setNotice(found.length?`${found.length} oportunidade(s) encontradas. Confira as fontes antes de cadastrar.`:'Nenhuma empresa nova foi confirmada. Tente outra região ou segmento.');
    }catch(e){setNotice('Pesquisa não concluída: '+problem(e));}finally{setBusy(false)}
  }
  async function save(p:Prospect){if(!supabase||!canEdit)return;
    const n=normalized(p.company_name);if(known.has(n)||saved.includes(n)){setNotice('Esta empresa já está registrada ou bloqueada.');return;}
    const stage=stages.find(s=>s.name==='Nova solicitação')||stages.find(s=>s.kind==='open');
    if(!stage){setNotice('Configure as etapas do pipeline primeiro.');return;}
    if(!window.confirm(`Cadastrar ${p.company_name} no CRM da PURM? Nenhum contato será enviado.`))return;
    setBusy(true);
    const {data:duplicate,error:checkError}=await supabase.from('purm_crm_leads').select('id,company_name');
    if(checkError){setNotice(checkError.message);setBusy(false);return;}
    if(duplicate?.some(row=>normalized(row.company_name)===n)){setNotice('Empresa já cadastrada no CRM.');setBusy(false);return;}
    const notes=[`Prospecção IA — segmento: ${p.segment||'Não confirmado'}`,`Localidade: ${[p.city,p.state].filter(Boolean).join('/')}`,
      `Potencial: ${p.opportunity}`,`Carga provável (hipótese): ${p.likely_cargo||'Não identificada'}`,
      `Recorrência (hipótese): ${p.estimated_monthly_shipments||'Não identificada'}`,
      `Decisor público: ${p.decision_maker_name||'Não identificado'} ${p.decision_maker_role||''}`,
      `Abordagem: ${p.recommended_approach}`,
      `Score de prospecção (estimado): ${p.prospecting_score}/100`,
      `Fontes: ${(p.sources||[]).join(' | ')}`].join('\n').slice(0,2900);
    const {error}=await supabase.from('purm_crm_leads').insert({company_name:p.company_name.slice(0,160),
      contact_name:p.decision_maker_name||'',whatsapp:p.whatsapp||p.phone||'',email:p.email||'',
      origin_city:'',destination_city:'',cargo_description:'',weight_kg:null,pickup_date:null,quote_amount:null,
      priority:p.priority||'medium',temperature:'warm',stage_id:stage.id,branch,notes});
    setBusy(false);if(error){setNotice('Não foi possível cadastrar: '+error.message);return;}
    setSaved(old=>[...old,n]);onLeadSaved();setNotice(`${p.company_name} cadastrada para qualificação manual no pipeline.`);
  }
  async function block(p:Prospect){if(!supabase||!canEdit)return;
    const n=normalized(p.company_name);if(!window.confirm(`Bloquear ${p.company_name} nas próximas pesquisas?`))return;
    setBlocking(n);
    const {error}=await supabase.from('purm_prospect_blocklist').upsert({company_name:p.company_name.slice(0,160),normalized_name:n,reason:'Bloqueada manualmente na pesquisa'}, {onConflict:'normalized_name'});
    setBlocking('');if(error)setNotice(error.message);else{setBlocked(old=>[...old,n]);setResults(old=>old.filter(x=>normalized(x.company_name)!==n));setNotice('Empresa adicionada à lista de exclusão.');}
  }
  return <div className="purm-ai-module">
    <section className="hero"><div><span className="eyebrow"><Sparkles size={15}/> PROSPECÇÃO INTELIGENTE</span><h2>Prospector IA para transportes</h2><p>Encontre empresas com potencial de contratação de frete, verifique contatos profissionais e decida o que cadastrar.</p></div></section>
    <section className="panel"><h3><Search size={17}/> Pesquisar empresas reais</h3>
      <form className="purm-ai-form" onSubmit={search}><label>Segmento ou oportunidade<input required minLength={3} maxLength={220} value={term} onChange={e=>setTerm(e.target.value)} placeholder="Ex.: indústrias que enviam cargas entre Bahia e Pernambuco"/></label>
        <label>Cidade / região<input value={region} onChange={e=>setRegion(e.target.value)} maxLength={120} placeholder="Ex.: Recife, Salvador, Fortaleza"/></label>
        <label>Quantidade<select value={quantity} onChange={e=>setQuantity(Number(e.target.value))}>{[3,5,8].map(n=><option key={n} value={n}>{n} empresas</option>)}</select></label>
        <button className="primary" disabled={busy||!canEdit}>{busy?<><LoaderCircle className="spin" size={16}/> Pesquisando...</>:<><Search size={16}/> Pesquisar na web</>}</button>
      </form><p className="purm-ai-hint"><ShieldCheck size={15}/> Pesquisa usa fontes públicas. Score e frequência de embarques são hipóteses, não garantias; a API pode gerar custos.</p>
      {notice&&<p className="purm-ai-notice" role="status">{notice}</p>}</section>
    <div className="purm-ai-results">{results.map((p,i)=>{const n=normalized(p.company_name);const isSaved=known.has(n)||saved.includes(n);return <article className="panel purm-ai-company" key={n+'-'+i}>
      <div className="purm-ai-company-head"><div><span className="eyebrow">OPORTUNIDADE {i+1}</span><h3><Building2 size={18}/> {p.company_name}</h3><small><MapPin size={13}/> {[p.city,p.state].filter(Boolean).join(' / ')||'Região não confirmada'} · {p.segment||'Segmento não confirmado'}</small></div><div className="purm-ai-score"><small>Score estimado</small><strong>{p.prospecting_score}/100</strong><span>{p.priority==='high'?'Alta prioridade':p.priority==='low'?'Baixa prioridade':'Média prioridade'}</span></div></div>
      <div className="purm-ai-info"><div><strong>Potencial de transporte</strong><p>{p.opportunity||'Não identificado'}</p></div><div><strong>Carga e frequência (hipóteses)</strong><p>{p.likely_cargo||'Não identificado'} · {p.estimated_monthly_shipments||'Sem confirmação'}</p></div><div><strong>Decisor / contato público</strong><p>{p.decision_maker_name||'Não identificado'} {p.decision_maker_role?`(${p.decision_maker_role})`:''} · {p.phone||p.whatsapp||p.email||'Sem contato profissional público confirmado'}</p></div><div><strong>Abordagem recomendada</strong><p>{p.recommended_approach||'Não informada'}</p></div></div>
      <div className="purm-ai-sources"><strong>Fontes públicas</strong>{(p.sources||[]).map((url,j)=>safeUrl(url)?<a key={j} href={safeUrl(url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Fonte {j+1}</a>:null)}{!p.sources?.length&&<small>Nenhuma fonte fornecida. Não cadastre sem verificação.</small>}</div>
      <div className="purm-ai-buttons">{p.website&&safeUrl(p.website)&&<a className="secondary" href={safeUrl(p.website)} target="_blank" rel="noopener noreferrer">Site da empresa <ExternalLink size={14}/></a>}<button className="secondary" onClick={()=>void block(p)} disabled={busy||!canEdit||blocking===n}><Ban size={15}/> Não prospectar</button><button className="primary" disabled={busy||!canEdit||isSaved||!p.sources?.length} onClick={()=>void save(p)}><Plus size={15}/>{isSaved?'Já cadastrada/bloqueada':'Cadastrar no CRM'}</button></div>
    </article>})}</div>
  </div>;
}
