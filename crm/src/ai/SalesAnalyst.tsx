import {useEffect,useMemo,useState} from 'react';
import {BrainCircuit,LoaderCircle,RefreshCw,MessageCircle,ArrowRight,CheckCircle2} from 'lucide-react';
import {supabase} from '../supabase';
import {money,type Lead,type Stage} from '../data';

type Analysis = {id:string;lead_id:string;executive_summary:string;cargo_diagnosis:string;commercial_opportunities:string;recommended_approach:string;whatsapp_message:string;probable_objections:string;next_step:string;interest_level:'low'|'medium'|'high'|'very_high';commercial_score:number;model_used:string;created_at:string};
type Props={leads:Lead[];stages:Stage[];canEdit:boolean;onOpenLead:(id:string)=>void};
const interest={low:'Baixo',medium:'Médio',high:'Alto',very_high:'Muito alto'};
export default function SalesAnalyst({leads,stages,canEdit,onOpenLead}:Props){
  const [selected,setSelected]=useState('');const [all,setAll]=useState<Analysis[]>([]);
  const [loading,setLoading]=useState(false);const [notice,setNotice]=useState('');
  const active=selected||leads[0]?.id||'';const lead=leads.find(l=>l.id===active);
  const current=useMemo(()=>all.filter(a=>a.lead_id===active).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0],[all,active]);
  async function reload(){if(!supabase)return;const {data,error}=await supabase.from('purm_lead_ai_analyses').select('*').order('created_at',{ascending:false}).limit(250);if(error)setNotice('Banco da IA Analista não habilitado: '+error.message);else setAll((data||[]) as Analysis[]);}
  useEffect(()=>{void reload();},[]);
  async function analyze(){if(!supabase||!lead||loading||!canEdit)return;if(!window.confirm(`Gerar análise IA de ${lead.company_name}? Os dados comerciais relevantes serão processados pela OpenAI.`))return;
    setLoading(true);setNotice('Analisando cadastro, etapa e histórico de atendimento...');
    try{const {data,error}=await supabase.functions.invoke('purm-sales-ai',{body:{mode:'analyze',lead_id:lead.id}});
      if(error)throw error;if(data?.error)throw new Error(String(data.error));await reload();setNotice('Análise registrada com sucesso. Revise as recomendações antes de agir.');
    }catch(e){setNotice('Falha na análise: '+(e instanceof Error?e.message:String(e)));}finally{setLoading(false)}
  }
  return <div className="purm-ai-module"><section className="hero"><div><span className="eyebrow"><BrainCircuit size={15}/> INTELIGÊNCIA COMERCIAL</span><h2>IA Analista</h2><p>Diagnóstico das cotações e clientes com base nas informações reais do CRM, histórico e estágio atual.</p></div></section>
    <section className="panel"><div className="purm-ai-analyst-toolbar"><label>Selecione a empresa<select value={active} onChange={e=>setSelected(e.target.value)}><option value="">Selecione</option>{leads.map(l=><option key={l.id} value={l.id}>{l.company_name}</option>)}</select></label><button className="secondary" onClick={()=>void reload()}><RefreshCw size={15}/> Atualizar histórico</button><button className="primary" onClick={()=>void analyze()} disabled={!canEdit||!lead||loading}>{loading?<LoaderCircle className="spin" size={16}/>:<BrainCircuit size={16}/>} {current?'Atualizar análise IA':'Analisar com IA'}</button></div>
      {lead&&<div className="purm-ai-lead-meta"><strong>{lead.company_name}</strong><span>{lead.origin_city||'Origem indefinida'} → {lead.destination_city||'Destino indefinido'}</span><span>{money(lead.quote_amount)} · {stages.find(s=>s.id===lead.stage_id)?.name||'Etapa não identificada'}</span><button className="secondary" onClick={()=>onOpenLead(lead.id)}>Abrir cotação <ArrowRight size={14}/></button></div>}
      {notice&&<div className="purm-ai-notice" role="status">{notice}</div>}</section>
    {current?<><div className="purm-ai-analyst-kpis"><article><small>Score da negociação</small><strong>{current.commercial_score}/100</strong></article><article><small>Interesse estimado</small><strong>{interest[current.interest_level]||'Não informado'}</strong></article><article><small>Última análise</small><strong>{new Date(current.created_at).toLocaleDateString('pt-BR')}</strong></article></div>
      <div className="purm-ai-analysis-grid">{([
        ['Resumo executivo',current.executive_summary],['Diagnóstico da carga e rota',current.cargo_diagnosis],
        ['Oportunidades comerciais',current.commercial_opportunities],['Abordagem recomendada',current.recommended_approach],
        ['Objeções prováveis',current.probable_objections],['Próxima ação',current.next_step]
      ] as [string,string][]).map(([name,body])=><article className="panel" key={name}><h3>{name}</h3><p>{body||'Não identificado.'}</p></article>)}
      <article className="panel purm-ai-whatsapp"><h3><MessageCircle size={17}/> Mensagem sugerida para WhatsApp</h3><blockquote>{current.whatsapp_message}</blockquote><button className="secondary" onClick={()=>void navigator.clipboard.writeText(current.whatsapp_message)}>Copiar mensagem</button><p className="purm-ai-hint">A mensagem não é enviada automaticamente. Confira as informações e obtenha autorização para o contato.</p></article></div>
      <p className="purm-ai-hint"><CheckCircle2 size={14}/> Análise registrada. Modelo: {current.model_used}. Score é estimativa, não previsão garantida de fechamento.</p>
    </>:<section className="panel"><p>Nenhuma análise cadastrada para esta empresa. Selecione um lead e clique em “Analisar com IA”.</p></section>}
  </div>;
}
