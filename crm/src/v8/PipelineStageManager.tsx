import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Save, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../supabase';
import type { Stage, Lead } from '../data';
import './v8.css';

type Form = { name: string; color: string; kind: 'open'|'won'|'lost' };
const DEFAULT:Form={name:'',color:'#2868ff',kind:'open'};
export default function PipelineStageManager({stages,leads,enabled,onRefresh}:{stages:Stage[];leads:Lead[];enabled:boolean;onRefresh:()=>Promise<void>}) {
  const [open,setOpen]=useState(false); const [editing,setEditing]=useState<string|null>(null);
  const [form,setForm]=useState<Form>(DEFAULT);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const reset=()=>{setEditing(null);setForm(DEFAULT);setMessage('');};
  async function save(){
    if(!supabase||!enabled||busy)return;
    const name=form.name.trim();
    if(name.length<2||name.length>55){setMessage('O nome deve ter entre 2 e 55 caracteres.');return;}
    if(stages.some(s=>s.id!==editing&&s.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))){setMessage('Já existe uma coluna com esse nome.');return;}
    setBusy(true);setMessage('');
    try{
      const result=editing
        ? await supabase.from('purm_crm_stages').update({name,color:form.color,kind:form.kind}).eq('id',editing)
        : await supabase.from('purm_crm_stages').insert({name,color:form.color,kind:form.kind,position:Math.max(0,...stages.map(s=>s.position))+1});
      if(result.error)throw result.error;
      await onRefresh();reset();setMessage('Coluna salva.');
    }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar a coluna.');}
    finally{setBusy(false);}
  }
  async function remove(stage:Stage){
    if(!supabase||!enabled||busy)return;
    const count=leads.filter(l=>l.stage_id===stage.id).length;
    if(count){setMessage(`A coluna “${stage.name}” possui ${count} card(s). Mova-os para outra etapa antes de excluí-la.`);setOpen(true);return;}
    if(!window.confirm(`Excluir a coluna vazia “${stage.name}”? A exclusão não poderá ser desfeita.`))return;
    setBusy(true);setMessage('');
    try{const {error}=await supabase.from('purm_crm_stages').delete().eq('id',stage.id);
      if(error)throw error;await onRefresh();reset();setMessage('Coluna vazia excluída.');}
    catch(e){setMessage(e instanceof Error?e.message:'Não foi possível excluir.');}
    finally{setBusy(false);}
  }
  if(!enabled)return null;
  return <div className="v8-stage-manager">
    <button type="button" className="secondary" onClick={()=>setOpen(v=>!v)}><SlidersHorizontal size={16}/> Gerenciar colunas</button>
    {open&&<section className="v8-stage-config"><div className="v8-section-head"><div><h3>Etapas do pipeline</h3><p>Edite nomes, cores e tipos de coluna. Colunas com cards não podem ser excluídas.</p></div><button className="v8-icon-button" title="Fechar" onClick={()=>{setOpen(false);reset()}}><X size={18}/></button></div>
      <div className="v8-stage-rows">{stages.map(stage=><div className="v8-stage-row" key={stage.id}><span className="v8-stage-bullet" style={{background:stage.color}}/><div><b>{stage.name}</b><small>{({open:'Em andamento',won:'Ganha',lost:'Perdida'} as const)[stage.kind]} · {leads.filter(l=>l.stage_id===stage.id).length} card(s)</small></div><button type="button" className="v8-icon-button" title={'Editar '+stage.name} onClick={()=>{setEditing(stage.id);setForm({name:stage.name,color:stage.color,kind:stage.kind});setMessage('')}}><Pencil size={15}/></button><button type="button" className="v8-icon-button danger" title={'Excluir '+stage.name} onClick={()=>void remove(stage)}><Trash2 size={15}/></button></div>)}</div>
      <div className="v8-stage-form"><h4>{editing?'Editar coluna':'Nova coluna'}</h4><label>Nome<input value={form.name} maxLength={55} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex.: Aguardando retorno"/></label><label>Tipo<select value={form.kind} onChange={e=>setForm(f=>({...f,kind:e.target.value as Form['kind']}))}><option value="open">Em andamento</option><option value="won">Ganha</option><option value="lost">Perdida</option></select></label><label>Cor<input type="color" value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))}/></label><div className="v8-stage-buttons"><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>{editing?<Save size={15}/>:<Plus size={15}/>} Salvar coluna</button>{editing&&<button type="button" className="secondary" onClick={reset}>Cancelar edição</button>}</div></div>
      {message&&<p role="status" className="v8-notice">{message}</p>}
    </section>}
  </div>;
}
