-- PURM CRM V1 — EXECUÇÃO SOMENTE MANUAL, após revisão, em projeto Supabase NOVO exclusivo da PURM.
-- Não executar no banco APROVUP. Não criar usuários automaticamente nem inserir leads fictícios.
create extension if not exists pgcrypto;

create table if not exists public.purm_crm_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'comercial' check (role in ('admin','gestor','comercial')),
  branch text not null default 'Recife',
  created_at timestamptz not null default now()
);

create table if not exists public.purm_crm_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position integer not null unique,
  color text not null default '#2868ff',
  kind text not null default 'open' check (kind in ('open','won','lost')),
  created_at timestamptz not null default now()
);

create table if not exists public.purm_crm_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(btrim(company_name)) between 2 and 160),
  contact_name text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  origin_city text not null default '',
  destination_city text not null default '',
  cargo_description text not null default '',
  weight_kg numeric(14,2) check (weight_kg is null or weight_kg>=0),
  pickup_date date,
  quote_amount numeric(14,2) check (quote_amount is null or quote_amount>=0),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  temperature text not null default 'warm' check (temperature in ('cold','warm','hot')),
  stage_id uuid not null references public.purm_crm_stages(id),
  next_contact_at timestamptz,
  branch text not null default 'Recife',
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purm_crm_leads_stage_idx on public.purm_crm_leads(stage_id);
create index if not exists purm_crm_leads_next_idx on public.purm_crm_leads(next_contact_at);
create index if not exists purm_crm_leads_created_idx on public.purm_crm_leads(created_at desc);

create table if not exists public.purm_crm_interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.purm_crm_leads(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','call','whatsapp','email','meeting')),
  description text not null check (char_length(btrim(description)) between 1 and 3000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists purm_crm_interactions_lead_idx on public.purm_crm_interactions(lead_id,created_at desc);

create or replace function public.purm_crm_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at=now();
  new.created_by=old.created_by;
  new.created_at=old.created_at;
  return new;
end $$;
drop trigger if exists purm_crm_leads_updated on public.purm_crm_leads;
create trigger purm_crm_leads_updated before update on public.purm_crm_leads
for each row execute function public.purm_crm_set_updated_at();

alter table public.purm_crm_members enable row level security;
alter table public.purm_crm_stages enable row level security;
alter table public.purm_crm_leads enable row level security;
alter table public.purm_crm_interactions enable row level security;

-- Usuários só veem sua própria associação. Não há política de escrita em members.
create policy "PURM member read self" on public.purm_crm_members
for select to authenticated using (user_id = (select auth.uid()));

-- Todos os funcionários explicitamente cadastrados podem ver o funil.
create policy "PURM stages member read" on public.purm_crm_stages
for select to authenticated using (
  exists(select 1 from public.purm_crm_members m where m.user_id=(select auth.uid()))
);

-- V1: equipe da PURM compartilha o pipeline. Isolamento por filial ainda não é aplicado.
create policy "PURM leads member select" on public.purm_crm_leads
for select to authenticated using (
  exists(select 1 from public.purm_crm_members m where m.user_id=(select auth.uid()))
);
create policy "PURM leads member insert" on public.purm_crm_leads
for insert to authenticated with check (
  created_by=(select auth.uid()) and
  exists(select 1 from public.purm_crm_members m where m.user_id=(select auth.uid()))
);
create policy "PURM leads member update" on public.purm_crm_leads
for update to authenticated using (
  exists(select 1 from public.purm_crm_members m where m.user_id=(select auth.uid()))
) with check (
  exists(select 1 from public.purm_crm_members m where m.user_id=(select auth.uid()))
);
-- Sem DELETE de leads por design: evita exclusão acidental e preserva histórico.

create policy "PURM interactions member select" on public.purm_crm_interactions
for select to authenticated using (
  exists(select 1 from public.purm_crm_members m where m.user_id=(select auth.uid()))
);
create policy "PURM interactions member insert" on public.purm_crm_interactions
for insert to authenticated with check (
  created_by=(select auth.uid()) and
  exists(select 1 from public.purm_crm_members m where m.user_id=(select auth.uid()))
);

-- Atribuir equipe manualmente após criar usuário no Auth:
-- insert into public.purm_crm_members(user_id,full_name,role,branch)
-- values ('UUID_REAL_DO_USUARIO', 'Nome do funcionário', 'admin', 'Recife');
-- Execute supabase/stages.sql após revisar os nomes de etapas. NÃO é executado pelo instalador.
