export type FinanceKind = 'income' | 'expense' | 'transfer_in' | 'transfer_out';
export type FinanceStatus = 'pending' | 'settled';
export type FinanceEntry = {
  id: string; description: string; kind: FinanceKind; amount_cents: number;
  category: string; account_label: string; payment_method: string;
  occurrence_date: string; due_date: string; settled_date: string | null;
  status: FinanceStatus; cash_effect: boolean; source: string;
  import_fingerprint: string | null; notes: string; created_at: string;
};
export type FinanceDraft = Omit<FinanceEntry,'id'|'created_at'>;
export const categories = [
  'Fretes e serviços', 'Outras receitas', 'Combustível', 'Pedágio', 'Manutenção',
  'Peças e equipamentos', 'Veículos e implementos', 'Motoristas e pessoal',
  'Aluguel', 'Seguros', 'Impostos e taxas', 'Software e assinaturas',
  'Marketing', 'Alimentação', 'Serviços terceirizados', 'Outras despesas',
  'Transferência entre contas', 'Pagamento de fatura'
];
export function cents(n: number) { return new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(n/100); }
export function dateKey(d: Date = new Date()) {
  const x = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Recife',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  return `${x.find(p=>p.type==='year')?.value}-${x.find(p=>p.type==='month')?.value}-${x.find(p=>p.type==='day')?.value}`;
}
export function numericBR(text:string):number|null {
  let s=text.replace(/R\$/gi,'').replace(/\s|\u00a0/g,'').replace(/[()]/g,c=>c==='('?'-':'');
  if(!/^-?[\d.,]+$/.test(s)) return null;
  const negative=s.startsWith('-'); if(negative)s=s.slice(1);
  if(s.includes('.')&&s.includes(',')) s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  const value=Number(s);return Number.isFinite(value)&&value<1e10?Math.round(value*100)*(negative?-1:1):null;
}
export function validDate(text:string, referenceYear?:number):string|null {
  const t=text.trim();let y:number,m:number,d:number;
  let match=t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(match){y=+match[1];m=+match[2];d=+match[3];}
  else {match=t.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);if(!match)return null;
    d=+match[1];m=+match[2];y=match[3]?(match[3].length===2?2000+ +match[3]:+match[3]):referenceYear||new Date().getFullYear();}
  const date=new Date(Date.UTC(y,m-1,d));
  return y>=2000&&y<=2100&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
}
export function suggestCategory(description:string):string {
  const s=description.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const rules:[string,RegExp][]=[
    ['Pagamento de fatura',/pagamento.*fatura|liquidacao.*cartao/],
    ['Veículos e implementos',/\bbau\b|bau refrigerado|carreta|caminhao|implemento|veiculo/],
    ['Combustível',/posto|diesel|combustivel|gasolina|etanol|ipiranga|shell/],
    ['Pedágio',/pedagio|sem parar|conectcar/],
    ['Manutenção',/oficina|reparo|manutencao|pneu|alinhamento|oleo motor/],
    ['Peças e equipamentos',/peca|ferramenta|equipamento|acessorio/],
    ['Motoristas e pessoal',/salario|folha|motorista|diaria|funcionario|fgts/],
    ['Aluguel',/aluguel|locacao|imobiliaria/],
    ['Seguros',/seguradora|seguro|apolice/],
    ['Impostos e taxas',/imposto|tributo|icms|ipva|taxa bancaria|tarifa|iof/],
    ['Software e assinaturas',/adobe|canva|hostinger|google workspace|microsoft|software|assinatura/],
    ['Marketing',/meta ads|google ads|publicidade|marketing/],
    ['Alimentação',/restaurante|refeicao|ifood|padaria|lanchonete/],
    ['Serviços terceirizados',/terceirizad|consultoria|prestacao/]
  ];return rules.find(([,r])=>r.test(s))?.[0]||'Outras despesas';
}
export function calculateFinance(rows:FinanceEntry[],period:string) {
  const selected=rows.filter(x=>x.occurrence_date.startsWith(period));
  const settled=rows.filter(x=>x.status==='settled'&&x.cash_effect&&x.settled_date?.startsWith(period));
  const revenue=selected.filter(x=>x.kind==='income').reduce((v,x)=>v+x.amount_cents,0);
  const expense=selected.filter(x=>x.kind==='expense').reduce((v,x)=>v+x.amount_cents,0);
  const cashIn=settled.filter(x=>x.kind==='income'||x.kind==='transfer_in').reduce((v,x)=>v+x.amount_cents,0);
  const cashOut=settled.filter(x=>x.kind==='expense'||x.kind==='transfer_out').reduce((v,x)=>v+x.amount_cents,0);
  return { revenue,expense,accrualResult:revenue-expense,cashIn,cashOut,netCashFlow:cashIn-cashOut,
    receivable:rows.filter(x=>x.kind==='income'&&x.status==='pending').reduce((v,x)=>v+x.amount_cents,0),
    payable:rows.filter(x=>x.kind==='expense'&&x.status==='pending').reduce((v,x)=>v+x.amount_cents,0)};
}
export function defaultDraft():FinanceDraft {
  const today=dateKey();return {description:'',kind:'expense',amount_cents:0,category:'Outras despesas',account_label:'Conta principal',payment_method:'Pix',occurrence_date:today,due_date:today,settled_date:null,status:'pending',cash_effect:false,source:'manual',import_fingerprint:null,notes:''};
}
// Leitura de texto sem sair do navegador. O arquivo original nao e enviado ao servidor.
export type StatementRow={index:number,date:string,description:string,amount_cents:number,kind:FinanceKind,category:string,selected:boolean};
function csvCells(line:string,delim:string){let out:string[]=[],s='',quoted=false;for(let i=0;i<line.length;i++){
 const c=line[i];if(c==='"'&&line[i+1]==='"'&&quoted){s+='"';i++;}else if(c==='"'){quoted=!quoted;}else if(c===delim&&!quoted){out.push(s.trim());s='';}else s+=c;
}out.push(s.trim());return out;}
export function readStatement(text:string,filename:string,statementType:'bank'|'card',period:string):StatementRow[]{
 const rows:StatementRow[]=[];const ext=filename.split('.').pop()?.toLowerCase();const refYear=+period.slice(0,4);
 const classify=(date:string,description:string,rawAmount:number,ofx=false)=>{
  if(!description||rawAmount===0)return;
  const clean=description.replace(/\s+/g,' ').trim().slice(0,220);
  const n=clean.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  // Nao importar saldos/resumos. Pagamento de fatura vai como saida de caixa, nao como nova despesa.
  if(/saldo anterior|saldo final|total da fatura|limite disponivel|resumo da fatura|pagamento recebido|estorno|reembolso/.test(n))return;
  let kind:FinanceKind;
  if(/pagamento.*fatura|liquidacao.*cartao/.test(n))kind='transfer_out';
  else if(statementType==='card')kind='expense';
  else kind=rawAmount<0?'expense':'income';
  // Em OFX o sinal e explicito; nas faturas CSV positivas normalmente representam debitos.
  if(statementType==='card'&&ofx&&rawAmount>0)return;
  const amount=Math.abs(rawAmount);
  if(amount<1||amount>1_000_000_000_00)return;
  rows.push({index:rows.length,date,description:clean,amount_cents:amount,kind,
   category:kind==='transfer_out'?'Pagamento de fatura':kind==='income'?'Outras receitas':suggestCategory(clean),selected:true});
 };
 if(ext==='ofx'||ext==='qfx'||ext==='qbo'){
   const blocks=text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>|$)/gi)||[];
   const tag=(block:string,name:string)=>block.match(new RegExp('<'+name+'>([^<\\r\\n]+)','i'))?.[1]?.trim()||'';
   for(const b of blocks){const dt=tag(b,'DTPOSTED');const date=validDate(dt.slice(0,4)+'-'+dt.slice(4,6)+'-'+dt.slice(6,8));
    const n=numericBR(tag(b,'TRNAMT'));const desc=tag(b,'MEMO')||tag(b,'NAME');if(date&&n!==null)classify(date,desc,n,true);}
 } else if(ext==='csv'||ext==='tsv'||ext==='txt'){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return [];
  const delim=ext==='tsv'?'\t':([';',',','\t'].sort((a,b)=>(lines[0].split(b).length-lines[0].split(a).length)))[0];
  const head=csvCells(lines[0],delim).map(x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
  const col=(regex:RegExp)=>head.findIndex(x=>regex.test(x));
  const dIdx=col(/data|date|lan[cç]amento/), descIdx=col(/descri|historico|estabelecimento|memo|detalhe|favorecido/);
  const valueIdx=col(/^valor$|amount|total|valor da transacao|valor \(r\$\)/);
  const debitIdx=col(/debito|debit/), creditIdx=col(/credito|credit/);
  const hasHeader=dIdx>=0&&descIdx>=0&&(valueIdx>=0||debitIdx>=0||creditIdx>=0);
  const start=hasHeader?1:0;
  for(let i=start;i<lines.length&&rows.length<1200;i++){
   const cells=csvCells(lines[i],delim);if(cells.length<3)continue;
   const date=validDate(cells[hasHeader?dIdx:0]||'',refYear);
   const desc=cells[hasHeader?descIdx:1]||'';
   const debit=debitIdx>=0?numericBR(cells[debitIdx]||''):null;
   const credit=creditIdx>=0?numericBR(cells[creditIdx]||''):null;
   const amount=debit!==null&&debit!==0?-Math.abs(debit):credit!==null&&credit!==0?Math.abs(credit):numericBR(cells[hasHeader?valueIdx:2]||'');
   if(date&&amount!==null)classify(date,desc,amount);
  }
 }
 return rows.slice(0,1000);
}
// Fingerprint deterministico por conta/linha, evitando repetir a mesma importacao.
export function rowFingerprint(account:string,row:StatementRow,occurrence:number){
 const raw=[account.trim().toLowerCase(),row.date,row.description.trim().toLowerCase(),row.amount_cents,row.kind,occurrence].join('|');
 let h1=0x811c9dc5,h2=0x811c9dc5;for(let i=0;i<raw.length;i++){h1=Math.imul(h1^raw.charCodeAt(i),16777619);h2=Math.imul(h2^(raw.charCodeAt(i)+i),16777619);}
 return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
}
