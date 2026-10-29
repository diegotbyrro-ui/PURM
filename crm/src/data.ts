export const DEFAULT_STAGES = [
  { key: 'novo', name: 'Nova solicitação', color: '#2868ff', kind: 'open' },
  { key: 'contato', name: 'Primeiro contato', color: '#0e9bcd', kind: 'open' },
  { key: 'analise', name: 'Em análise', color: '#8263e8', kind: 'open' },
  { key: 'cotacao', name: 'Cotação enviada', color: '#eda32f', kind: 'open' },
  { key: 'negociacao', name: 'Negociação', color: '#da7a42', kind: 'open' },
  { key: 'ganha', name: 'Ganha', color: '#179a70', kind: 'won' },
  { key: 'perdida', name: 'Perdida', color: '#d44e68', kind: 'lost' }
] as const;

export type Stage = { id: string; name: string; color: string; position: number; kind: 'open'|'won'|'lost' };
export type Lead = {
  id: string; company_name: string; contact_name: string; whatsapp: string; email: string;
  origin_city: string; destination_city: string; cargo_description: string;
  weight_kg: number|null; pickup_date: string|null; quote_amount: number|null;
  priority: 'low'|'medium'|'high'; temperature: 'cold'|'warm'|'hot';
  stage_id: string; assigned_to?: string|null; next_contact_at: string|null; branch: string; notes: string;
  created_at: string; updated_at: string;
};
export type Interaction = { id: string; lead_id: string; kind: string; description: string; created_at: string; created_by: string|null };
export const money = (n: number|null|undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n||0));
export const dateText = (date: string|null|undefined) => date ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date)) : 'A definir';
export const shortDate = (value: string|null|undefined) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '—';
