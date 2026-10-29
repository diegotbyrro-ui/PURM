import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, CircleDollarSign, Download, FileUp, Plus, RefreshCw, WalletCards } from 'lucide-react';
import { supabase } from '../supabase';
import { calculateFinance, categories, cents, dateKey, defaultDraft, numericBR, readStatement, rowFingerprint,
  type FinanceDraft, type FinanceEntry, type FinanceKind, type StatementRow } from './financeCore';

type Props={onNavigateToCarla?:()=>void;canEdit?:boolean;secretaryName?:string};
const kindLabel:Record<FinanceKind,string>={income:'Receita',expense:'Despesa',transfer_in:'Entrada entre contas',transfer_out:'Saída entre contas'};
const todayPeriod=()=>dateKey().slice(0,7);
const getError=(e:unknown)=>e instanceof Error?e.message:String(e);

export default function FinancePage({onNavigateToCarla,canEdit=true,secretaryName='Assistente'}:Props){
  const [items,setItems]=useState<FinanceEntry[]>([]);
  const [period,setPeriod]=useState(todayPeriod);
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState('');
  const [formOpen,setFormOpen]=useState(false);
  const [draft,setDraft]=useState<FinanceDraft>(defaultDraft());
  const [amountText,setAmountText]=useState('');
  const [statementType,setStatementType]=useState<'bank'|'card'>('bank');
  const [account,setAccount]=useState('Conta principal');
  const [importPeriod,setImportPeriod]=useState(todayPeriod);
  const [preview,setPreview]=useState<StatementRow[]>([]);
  const [importOpen,setImportOpen]=useState(false);
  const [filename,setFilename]=useState('');
  const [importing,setImporting]=useState(false);

  const reload=useCallback(async()=>{
    if(!supabase)return;
    setLoading(true);
    const {data,error}=await supabase.from('purm_finance_entries').select('*').order('occurrence_date',{ascending:false}).limit(2000);
    if(error)setNotice('Financeiro ainda não habilitado: '+error.message+' Execute o SQL de instalação quando for aprovado.');
    else {setItems((data||[]) as FinanceEntry[]);setNotice('');}
    setLoading(false);
  },[]);
  useEffect(()=>{void reload();},[reload]);
  const metrics=useMemo(()=>calculateFinance(items,period),[items,period]);
  const filtered=useMemo(()=>items.filter(x=>x.occurrence_date.startsWith(period)),[items,period]);

  async function save(e:FormEvent){e.preventDefault();if(!supabase||loading||!canEdit)return;
    if(!draft.description.trim()||draft.amount_cents<=0||draft.amount_cents>1_000_000_000_00){setNotice('Confira a descrição e o valor.');return;}
    const payload={...draft,description:draft.description.trim(),category:draft.category.trim(),account_label:draft.account_label.trim(),
      settled_date:draft.status==='settled'?(draft.settled_date||draft.occurrence_date):null,
      cash_effect:draft.status==='settled'&&draft.payment_method!=='Cartão de crédito'};
    setLoading(true);
    const {error}=await supabase.from('purm_finance_entries').insert(payload);
    setLoading(false);
    if(error){setNotice('Não foi possível registrar: '+error.message);return;}
    setNotice('Lançamento registrado com sucesso.');setFormOpen(false);setDraft(defaultDraft());setAmountText('');void reload();
  }
  async function settle(item:FinanceEntry){if(!supabase||loading||!canEdit)return;
    if(!window.confirm('Confirmar baixa de '+item.description+'?'))return;
    setLoading(true);const {error}=await supabase.from('purm_finance_entries').update({status:'settled',settled_date:dateKey(),cash_effect:item.payment_method!=='Cartão de crédito'}).eq('id',item.id);
    setLoading(false);if(error)setNotice(error.message);else void reload();
  }
  async function openFile(file:File|null){if(!file)return;
    setPreview([]);setFilename(file.name);setNotice('');
    if(file.size>8*1024*1024){setNotice('Limite de 8 MB por arquivo.');return;}
    if(/\.pdf$/i.test(file.name)){setNotice('PDF com texto selecionável será adicionado na próxima etapa. Nesta versão exporte a fatura em CSV ou o extrato em OFX. Nenhum dado foi importado.');return;}
    if(!/\.(csv|tsv|txt|ofx|qfx|qbo)$/i.test(file.name)){setNotice('Use CSV, TSV, OFX, QFX ou QBO.');return;}
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());
      let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
      const result=readStatement(text,file.name,statementType,importPeriod);
      if(!result.length){setNotice('Nenhum lançamento reconhecido. Confira se a exportação contém data, descrição e valor.');return;}
      setPreview(result);setNotice(`${result.length} linhas identificadas. Revise os dados e selecione o que importar.`);
    }catch(error){setNotice('Falha ao ler arquivo: '+getError(error));}
  }
  async function importRows(){if(!supabase||importing||!canEdit)return;
    const active=preview.filter(x=>x.selected);if(!active.length){setNotice('Selecione pelo menos uma linha.');return;}
    if(!window.confirm(`Importar ${active.length} lançamento(s) revisado(s) de ${filename}?`))return;
    setImporting(true);let ok=0,duplicados=0;const failures:string[]=[];const occurrence=new Map<string,number>();
    for(const row of active){
      const signature=[row.date,row.description,row.amount_cents,row.kind].join('|');
      const occurrenceIndex=(occurrence.get(signature)||0)+1;occurrence.set(signature,occurrenceIndex);
      const fp=rowFingerprint(account,row,occurrenceIndex);
      const cashEffect=statementType==='bank';
      const body={description:row.description,kind:row.kind,amount_cents:row.amount_cents,category:row.category,
        account_label:account.trim()||'Conta principal',payment_method:statementType==='card'?'Cartão de crédito':'Conta bancária',
        occurrence_date:row.date,due_date:row.date,settled_date:row.date,status:'settled',cash_effect:cashEffect,
        source:statementType==='card'?'import_card':'import_bank',import_fingerprint:fp,notes:`Importação revisada: ${filename.slice(0,100)}`};
      const {error}=await supabase.from('purm_finance_entries').insert(body);
      if(error){if(error.code==='23505')duplicados++;else{failures.push(`Linha ${row.index+1}: ${error.message}`);break;}}else ok++;
    }
    setImporting(false);setNotice(`${ok} importado(s); ${duplicados} repetido(s). ${failures.join(' ')}`);
    if(!failures.length){setPreview([]);setFilename('');setImportOpen(false);}void reload();
  }
  function updatePreview(index:number,patch:Partial<StatementRow>){setPreview(old=>old.map(x=>x.index===index?{...x,...patch}:x));}
  function exportCSV(){const esc=(s:unknown)=>`"${String(s??'').replace(/"/g,'""')}"`;
    const lines=[['Data','Descrição','Tipo','Categoria','Valor (R$)','Conta','Status','Origem'].map(esc).join(';'),
      ...filtered.map(x=>[x.occurrence_date,x.description,kindLabel[x.kind],x.category,(x.amount_cents/100).toFixed(2).replace('.',','),x.account_label,x.status,x.source].map(esc).join(';'))];
    const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const u=URL.createObjectURL(blob),link=document.createElement('a');link.href=u;link.download=`purm-financeiro-${period}.csv`;link.click();URL.revokeObjectURL(u);
  }
  return <div className="finance-module">
    <section className="hero"><div><span className="eyebrow">FINANCEIRO PURM • BASEADO NO APROVUP</span><h2>Controle financeiro</h2><p>Faturamento, despesas, contas a pagar e receber, fluxo de caixa e importação revisada de extratos.</p></div>
      <div className="finance-actions"><button className="secondary" onClick={exportCSV}><Download size={16}/> Exportar CSV</button><button className="secondary" disabled={!canEdit} onClick={()=>{setImportOpen(v=>!v);setNotice('')}}><FileUp size={16}/> Importar extrato/fatura</button><button className="primary" disabled={!canEdit} onClick={()=>{setDraft(defaultDraft());setAmountText('');setFormOpen(true)}}><Plus size={16}/> Novo lançamento</button></div></section>
    <div className="finance-toolbar"><label>Competência <input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/></label><button className="secondary" onClick={()=>void reload()} disabled={loading}><RefreshCw size={15}/> Atualizar</button><span>Valores de faturamento por competência; caixa por data de liquidação</span></div>
    {notice&&<div className="finance-notice" role="status">{notice}</div>}
    <div className="finance-stats">
      {([['Faturamento',metrics.revenue],['Despesas',metrics.expense],['Resultado competência',metrics.accrualResult],['Entradas no caixa',metrics.cashIn],['Saídas do caixa',metrics.cashOut],['Movimentação líquida',metrics.netCashFlow],['A receber',metrics.receivable],['A pagar',metrics.payable]] as [string,number][]).map(([label,value])=><article className="finance-stat" key={label}><small>{label}</small><strong>{cents(value)}</strong></article>)}
    </div>
    <div className="finance-info"><CircleDollarSign size={17}/><span>Compra no cartão entra em <b>despesas por competência</b>, mas não movimenta o caixa imediatamente. O pagamento da fatura deve ser lançado como <b>saída entre contas</b> para evitar duplicidade.</span></div>
    {importOpen&&<section className="finance-panel"><h3><FileUp size={19}/> Importar extrato ou fatura</h3><p>Leitura local no navegador: arquivo não é armazenado. Revise cada linha antes de registrar.</p>
      <div className="finance-grid"><label>Tipo<select value={statementType} onChange={e=>{setStatementType(e.target.value as 'bank'|'card');setPreview([])}}><option value="bank">Extrato bancário</option><option value="card">Fatura do cartão</option></select></label>
      <label>Conta / cartão<input value={account} onChange={e=>setAccount(e.target.value)} maxLength={80}/></label>
      <label>Período de referência<input type="month" value={importPeriod} onChange={e=>setImportPeriod(e.target.value)}/></label>
      <label>Arquivo CSV, OFX, QFX, QBO, TSV ou TXT<input type="file" accept=".csv,.tsv,.txt,.ofx,.qfx,.qbo,.pdf" onChange={e=>void openFile(e.target.files?.[0]||null)} /></label></div>
      <p className="finance-muted">PDF: suporte em desenvolvimento. PDFs digitalizados precisarão de OCR. Valores e categorias extraídos de extratos podem variar de banco para banco.</p>
      {preview.length>0&&<><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Usar</th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>{preview.map(r=><tr key={r.index}><td><input type="checkbox" checked={r.selected} onChange={e=>updatePreview(r.index,{selected:e.target.checked})}/></td><td>{r.date}</td><td><input value={r.description} maxLength={220} onChange={e=>updatePreview(r.index,{description:e.target.value})}/></td><td><select value={r.kind} onChange={e=>updatePreview(r.index,{kind:e.target.value as FinanceKind})}>{Object.entries(kindLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td><td><select value={r.category} onChange={e=>updatePreview(r.index,{category:e.target.value})}>{categories.map(x=><option key={x}>{x}</option>)}</select></td><td><strong>{cents(r.amount_cents)}</strong></td></tr>)}</tbody></table></div>
      <button className="primary" disabled={!canEdit||importing||!preview.some(x=>x.selected)} onClick={()=>void importRows()}>{importing?'Importando...':`Confirmar ${preview.filter(x=>x.selected).length} lançamento(s)`}</button></>}
    </section>}
    <section className="finance-panel"><div className="finance-title"><div><h3><WalletCards size={20}/> Lançamentos do mês</h3><p>As baixas e importações são registradas no Supabase com permissões e auditoria.</p></div><strong>{filtered.length} registro(s)</strong></div>
      <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Ação</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td>{x.occurrence_date}</td><td><strong>{x.description}</strong><small>{x.source==='manual'?'Manual':x.source==='secretary'?secretaryName:'Importado'}</small></td><td>{x.category}</td><td>{x.account_label}</td><td>{kindLabel[x.kind]}</td><td><span className={'fin-status '+x.status}>{x.status==='settled'?'Baixado':'Pendente'}</span></td><td className={x.kind==='expense'||x.kind==='transfer_out'?'negative':''}>{cents(x.amount_cents)}</td><td>{x.status==='pending'?<button className="finance-link" onClick={()=>void settle(x)} disabled={loading||!canEdit}>Baixar</button>:'—'}</td></tr>)}{!filtered.length&&<tr><td colSpan={8} className="finance-empty">Nenhum lançamento neste mês.</td></tr>}</tbody></table></div>
    </section>
    <section className="finance-panel finance-carla-tease"><CalendarClock size={20}/><div><h3>Secretária {secretaryName}</h3><p>Prepare um lançamento por mensagem, confirme e registre com histórico de auditoria.</p></div>{onNavigateToCarla&&<button className="secondary" onClick={onNavigateToCarla}>Conversar com {secretaryName}</button>}</section>
    {formOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false)}}><section className="modal finance-dialog" role="dialog" aria-modal="true" aria-label="Novo lançamento financeiro"><div className="modal-head"><div><span className="eyebrow">FINANCEIRO</span><h2>Novo lançamento</h2><p>Revisar descrição, competência e impacto no caixa.</p></div><button className="modal-close" onClick={()=>setFormOpen(false)} aria-label="Fechar">×</button></div>
      <form className="lead-form" onSubmit={e=>void save(e)}><div className="finance-grid"><label className="full">Descrição *<input value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} required maxLength={220}/></label>
      <label>Tipo<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as FinanceKind})}>{Object.entries(kindLabel).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
      <label>Valor (R$) *<input type="text" inputMode="decimal" placeholder="Ex.: 20.000,00" value={amountText} onChange={e=>{setAmountText(e.target.value);setDraft({...draft,amount_cents:Math.max(0,numericBR(e.target.value)||0)})}} required/></label>
      <label>Categoria<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Conta / cartão<input value={draft.account_label} maxLength={80} onChange={e=>setDraft({...draft,account_label:e.target.value})}/></label>
      <label>Forma de pagamento<select value={draft.payment_method} onChange={e=>setDraft({...draft,payment_method:e.target.value})}>{['Pix','Conta bancária','Cartão de crédito','Boleto','Dinheiro','Outro'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as 'pending'|'settled'})}><option value="pending">Pendente</option><option value="settled">Liquidado / pago</option></select></label>
      <label>Data competência<input type="date" value={draft.occurrence_date} onChange={e=>setDraft({...draft,occurrence_date:e.target.value})}/></label>
      <label>Vencimento<input type="date" value={draft.due_date} onChange={e=>setDraft({...draft,due_date:e.target.value})}/></label>
      <label className="full">Observações<textarea value={draft.notes} maxLength={1500} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></div>
      <div className="modal-actions"><button className="secondary" type="button" onClick={()=>setFormOpen(false)}>Cancelar</button><button className="primary" type="submit" disabled={loading||!canEdit}>{loading?'Salvando...':'Registrar lançamento'}</button></div></form></section></div>}
  </div>;
}
