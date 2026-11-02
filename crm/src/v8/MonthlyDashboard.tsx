import { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { money, type Lead, type Stage } from '../data';
import './v8.css';

type Month = { key: string; name: string; count: number; potential: number; wonNow: number };
const ymdRecife = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const mkey = (date: Date) => ymdRecife(date).slice(0,7);
function monthsBack(count: number): Month[] {
  const now = new Date();
  const current = mkey(now).split('-').map(Number);
  return Array.from({length: count}, (_, index) => {
    const d = new Date(Date.UTC(current[0], current[1] - count + index, 1, 12));
    return {key: d.toISOString().slice(0,7),name: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(d).replace('.', ''),count:0,potential:0,wonNow:0};
  });
}
export default function MonthlyDashboard({leads,stages}: {leads: Lead[]; stages: Stage[]}) {
  const [view, setView] = useState<'volume'|'value'>('volume');
  const data = useMemo(() => {
    const result=monthsBack(12); const byMonth=new Map(result.map(m=>[m.key,m]));
    const winners=new Set(stages.filter(s=>s.kind==='won').map(s=>s.id));
    for (const lead of leads) {
      const row=byMonth.get(mkey(new Date(lead.created_at)));
      if (!row) continue;
      row.count += 1;
      row.potential += Number(lead.quote_amount || 0);
      if (winners.has(lead.stage_id)) row.wonNow++;
    }
    return result;
  },[leads,stages]);
  const max=Math.max(1,...data.map(r=>view==='volume'?r.count:r.potential));
  const current=data[data.length-1]; const last=data[data.length-2];
  const change=current.count-last.count;
  const open=new Set(stages.filter(s=>s.kind==='open').map(s=>s.id));
  const active=leads.filter(l=>open.has(l.stage_id));
  return <div className="v8-dashboard">
    <section className="v8-section-head"><div><span className="v8-eyebrow">DESEMPENHO COMERCIAL</span><h3>Comparativo dos últimos 12 meses</h3><p>Histórico das oportunidades pela data de entrada no CRM.</p></div><div className="v8-segment"><button type="button" className={view==='volume'?'active':''} onClick={()=>setView('volume')}>Quantidade</button><button type="button" className={view==='value'?'active':''} onClick={()=>setView('value')}>Valor cotado</button></div></section>
    <div className="v8-monthly-stats"><article><span>Cotações neste mês</span><strong>{current.count}</strong><small>{change>=0?<TrendingUp size={13}/>:<TrendingDown size={13}/>} {change>=0?'+':''}{change} frente ao mês anterior</small></article><article><span>Valor cotado neste mês</span><strong>{money(current.potential)}</strong><small>Valor registrado nas oportunidades criadas</small></article><article><span>Propostas abertas (atual)</span><strong>{money(active.reduce((sum,l)=>sum+Number(l.quote_amount||0),0))}</strong><small>Retrato do pipeline, sem previsão de receita</small></article></div>
    <section className="v8-chart-panel"><div className="v8-chart-title"><h4><BarChart3 size={17}/> {view==='volume'?'Oportunidades por mês':'Valor de cotações por mês'}</h4><span>Últimos 12 meses</span></div><div className="v8-chart" role="img" aria-label="Gráfico de barras dos últimos doze meses">
      {data.map((r,i)=>{const amount=view==='volume'?r.count:r.potential;const height=amount===0?0:Math.max(3,amount/max*100);return <div className="v8-chart-month" key={r.key} title={`${r.name}: ${view==='volume'?r.count+' oportunidades':money(r.potential)}`}><div className="v8-bar-area"><div className={'v8-chart-bar '+(i===data.length-1?'current':'')} style={{height:`${height}%`}}/></div><span>{r.name}</span></div>;})}
    </div>{data.every(m=>m.count===0)&&<p className="v8-chart-empty">Ainda não há registros no período. Os gráficos serão preenchidos conforme as cotações entrarem no CRM.</p>}</section>
    <section className="v8-month-table"><h4>Comparação mensal</h4><div className="v8-table-scroll"><table><thead><tr><th>Mês</th><th>Novas cotações</th><th>Valor cotado</th><th>Atualmente ganhas</th></tr></thead><tbody>{[...data].reverse().map(row=><tr key={row.key}><td>{row.name}</td><td>{row.count}</td><td>{money(row.potential)}</td><td>{row.wonNow}</td></tr>)}</tbody></table></div></section>
    <p className="v8-note"><Info size={15}/> A coluna “Atualmente ganhas” representa o estágio atual das propostas criadas em cada mês, não a data em que foram fechadas. Para analisar conversões históricas com precisão, será necessário registrar as mudanças de etapa.</p>
  </div>;
}
