import { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, ClipboardCheck, Sparkles, RefreshCw, MessageSquareText } from 'lucide-react';
import type { Lead, Stage, Interaction } from '../data';
import { supabase } from '../supabase';
import './v8.css';

type Analysis={id:string;executive_summary:string;cargo_diagnosis:string;commercial_opportunities:string;recommended_approach:string;whatsapp_message:string;probable_objections:string;next_step:string;commercial_score:number;created_at:string};
type Review={id:string;created_at:string;pitch_text:string;strengths:string;improvements:string;recommended_reply:string;next_action:string;quality_score:number};
export default function ClientIntelligence({lead,stage,interactions,canEdit}:{lead:Lead;stage:Stage|undefined;interactions:Interaction[];canEdit:boolean}) {
  const [analyses,setAnalyses]=useState<Analysis[]>([]);const [reviews,setReviews]=useState<Review[]>([]);
  const [pitch,setPitch]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [historyProblem,setHistoryProblem]=useState('');
  const load=useCallback(async()=>{
    if(!supabase)return;
    const [analysis,review]=await Promise.all([
      supabase.from('purm_lead_ai_analyses').select('*').eq('lead_id',lead.id).order('created_at',{ascending:false}).limit(15),
      supabase.from('purm_lead_coaching_reviews').select('*').eq('lead_id',lead.id).order('created_at',{ascending:false}).limit(15),
    ]);
    setHistoryProblem(analysis.error?'IA Analista V6: tabela de análises indisponível. Verifique o SQL V6.':'');
    if(!analysis.error)setAnalyses((analysis.data||[]) as Analysis[]);
    if(!review.error)setReviews((review.data||[]) as Review[]);
    if(review.error)setHistoryProblem(v=>[v,'Feedback V8: execute e valide o SQL V8 antes de usar.'].filter(Boolean).join(' '));
  },[lead.id]);
  useEffect(()=>{setAnalyses([]);setReviews([]);setPitch('');void load()},[load]);
  async function run(mode:'analyze'|'review'){
    if(!supabase||!canEdit||busy)return;
    if(mode==='review'&&(pitch.trim().length<20||pitch.trim().length>2500)){setError('Descreva a abordagem feita pelo comercial (20 a 2.500 caracteres).');return;}
    const ok=window.confirm(mode==='analyze'
      ?`Analisar ${lead.company_name}? O cadastro e o histórico comercial serão enviados à API OpenAI.`
      :`Avaliar abordagem de ${lead.company_name}? O texto enviado e o histórico serão processados pela OpenAI.`);
    if(!ok)return;
    setBusy(true);setError('');setNotice('');
    try{
      const target=mode==='analyze'?'purm-sales-ai':'purm-lead-coach-v8';
      const payload=mode==='analyze'?{mode:'analyze',lead_id:lead.id}:{lead_id:lead.id,pitch:pitch.trim()};
      const {data,error}=await supabase.functions.invoke<{error?:string}>(target,{body:payload});
      if(error||data?.error){let message=data?.error||error?.message||'Falha na IA.';
        const ctx=(error as {context?:Response}|null)?.context;
        if(ctx&&typeof ctx.json==='function')try{const value=await ctx.json() as {error?:string};if(value?.error)message=value.error;}catch{ /* mensagem padrão */ }
        throw new Error(message);
      }
      await load();setNotice(mode==='analyze'?'Diagnóstico atualizado.':'Feedback registrado no histórico de abordagens.');
      if(mode==='review')setPitch('');
    }catch(e){setError(e instanceof Error?e.message:'Erro ao analisar');}
    finally{setBusy(false);}
  }
  const analysis=analyses[0];const review=reviews[0];
  return <section className="v8-client-ai"><div className="v8-section-head"><div><span className="v8-eyebrow">INTELIGÊNCIA NO CADASTRO</span><h3><BrainCircuit size={18}/> IA Analista · {lead.company_name}</h3><p>Etapa atual: {stage?.name||'Não definida'}. Analise o potencial e refine a abordagem com base no histórico.</p></div>{canEdit&&<button type="button" className="primary" onClick={()=>void run('analyze')} disabled={busy}><Sparkles size={15}/>{analysis?'Atualizar diagnóstico':'Gerar diagnóstico'}</button>}</div>
    {historyProblem&&<p className="v8-warning" role="status">{historyProblem}</p>}{notice&&<p className="v8-notice" role="status">{notice}</p>}{error&&<p className="v8-warning" role="alert">{error}</p>}
    {analysis?<div className="v8-ai-result"><div className="v8-ai-score"><strong>{analysis.commercial_score}/100</strong><small>Indicador qualitativo da negociação; não é probabilidade de venda</small></div>{([
      ['Resumo',analysis.executive_summary],['Oportunidades',analysis.commercial_opportunities],['Abordagem sugerida',analysis.recommended_approach],['Objeções',analysis.probable_objections],['Próxima ação',analysis.next_step],['Rascunho de WhatsApp',analysis.whatsapp_message]
    ] as [string,string][]).map(([label,value])=><article key={label}><b>{label}</b><p>{value||'Sem informação suficiente.'}</p></article>)}</div>:<p className="v8-empty">Nenhum diagnóstico registrado para este cliente. O Prospector poderá cadastrá-lo no pipeline e você poderá analisá-lo aqui.</p>}
    <div className="v8-coaching"><h4><MessageSquareText size={17}/> Avaliar abordagem do comercial</h4><p>Descreva o que foi dito na ligação, mensagem ou negociação. A IA apontará o que manter, o que melhorar e qual deve ser o próximo contato.</p>
      <p className="v8-note">O histórico de {interactions.length} atividade(s) vinculada(s) a este cadastro já é considerado pela IA. Evite dados pessoais desnecessários.</p>
      {canEdit&&<><textarea value={pitch} onChange={e=>setPitch(e.target.value)} maxLength={2500} rows={4} placeholder="Ex.: Apresentei nossos serviços de transporte, perguntei quais rotas a empresa utiliza e propus um contato com o responsável pela logística..."/><button className="secondary" type="button" disabled={busy||pitch.trim().length<20} onClick={()=>void run('review')}><ClipboardCheck size={16}/> {busy?'Analisando...':'Avaliar minha abordagem'}</button></>}
      {review?<div className="v8-review"><div className="v8-review-head"><strong>Última avaliação: {review.quality_score}/100</strong><small>{new Date(review.created_at).toLocaleDateString('pt-BR')}</small></div>{([['Pontos positivos',review.strengths],['O que melhorar',review.improvements],['Próxima mensagem sugerida',review.recommended_reply],['Próxima ação',review.next_action]] as [string,string][]).map(([label,value])=><div key={label}><b>{label}</b><p>{value}</p></div>)}</div>:<p className="v8-empty">O feedback da abordagem aparecerá aqui após a primeira avaliação.</p>}
      {reviews.length>1&&<details className="v8-review-history"><summary><RefreshCw size={13}/> Avaliações anteriores ({reviews.length-1})</summary>{reviews.slice(1).map(r=><article key={r.id}><b>{new Date(r.created_at).toLocaleString('pt-BR')} · {r.quality_score}/100</b><p>{r.improvements}</p></article>)}</details>}
    </div>
  </section>;
}
