-- PURM V3: ACESSOS, AVISOS DE LEADS E IDENTIDADE DA SECRETARIA.
-- SOMENTE SQL EDITOR DO PROJETO PURM, REVISAO MANUAL E BACKUP PREVIO.
-- Este arquivo substitui apenas as politicas RLS listadas da V1/V2, para aplicar permissoes reais.
-- NAO cria contas Auth, nao dispara WhatsApp, nao concede OAuth, nao executa cron e nao apaga leads.

begin;

-- Ampliar cargo: Financeiro, sem remover usuarios existentes.
alter table public.purm_crm_members drop constraint if exists purm_crm_members_role_check;
alter table public.purm_crm_members add constraint purm_crm_members_role_check
  check(role in ('admin','gestor','comercial','financeiro'));
alter table public.purm_crm_members add column if not exists permissions text[] not null default '{}'::text[];
alter table public.purm_crm_members add column if not exists phone_e164 text not null default '';
alter table public.purm_crm_members add column if not exists notify_whatsapp_leads boolean not null default false;
update public.purm_crm_members set permissions=case role
  when 'admin' then array['crm.view','crm.edit','finance.view','finance.edit','secretary.use','settings.manage']::text[]
  when 'gestor' then array['crm.view','crm.edit','finance.view','finance.edit','secretary.use']::text[]
  when 'comercial' then array['crm.view','crm.edit']::text[]
  else array['finance.view','finance.edit']::text[] end
where cardinality(permissions)=0;

create or replace function public.purm_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.purm_crm_members m
                where m.user_id=(select auth.uid()) and m.role='admin');
$$;
create or replace function public.purm_can(p_permission text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.purm_crm_members m
  where m.user_id=(select auth.uid())
    and (m.role='admin' or p_permission=any(m.permissions)));
$$;
revoke all on function public.purm_is_admin() from public;
revoke all on function public.purm_can(text) from public;
grant execute on function public.purm_is_admin() to authenticated;
grant execute on function public.purm_can(text) to authenticated;

-- Administrador ve equipe inteira. Escrita apenas pela funcao controlada a seguir.
drop policy if exists purm_members_admin_read on public.purm_crm_members;
create policy purm_members_admin_read on public.purm_crm_members
  for select to authenticated using(public.purm_is_admin());

create or replace function public.purm_admin_list_members()
returns table(user_id uuid,email text,full_name text,role text,branch text,permissions text[],phone_e164 text,notify_whatsapp_leads boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.purm_is_admin() then raise exception 'Acesso de administrador necessario'; end if;
  return query select m.user_id,u.email::text,m.full_name,m.role,m.branch,m.permissions,m.phone_e164,m.notify_whatsapp_leads
  from public.purm_crm_members m join auth.users u on u.id=m.user_id order by m.full_name;
end;$$;
revoke all on function public.purm_admin_list_members() from public;
grant execute on function public.purm_admin_list_members() to authenticated;

create or replace function public.purm_admin_save_member(
 p_email text,p_name text,p_role text,p_branch text,p_permissions text[],p_phone text,p_notify boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_permissions text[];
begin
 if not public.purm_is_admin() then raise exception 'Acesso de administrador necessario'; end if;
 if p_email is null or length(btrim(p_email))>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 then raise exception 'E-mail invalido'; end if;
 if p_name is null or length(btrim(p_name))<2 or length(btrim(p_name))>120 then raise exception 'Nome invalido'; end if;
 if p_role not in ('admin','gestor','comercial','financeiro') then raise exception 'Cargo invalido'; end if;
 if p_branch not in ('Recife','Salvador','Fortaleza') then raise exception 'Filial invalida'; end if;
 if coalesce(p_phone,'')<>'' and p_phone !~ '^[0-9]{10,15}$' then raise exception 'WhatsApp do funcionario invalido';end if;
 v_permissions:=coalesce(p_permissions,array[]::text[]);
 if not v_permissions <@ array['crm.view','crm.edit','finance.view','finance.edit','secretary.use','settings.manage']::text[]
 then raise exception 'Permissoes desconhecidas'; end if;
 if p_role<>'admin' and 'settings.manage'=any(v_permissions) then raise exception 'Administracao somente para admin'; end if;
 if p_role='admin' then v_permissions:=array['crm.view','crm.edit','finance.view','finance.edit','secretary.use','settings.manage']::text[];end if;
 if 'crm.edit'=any(v_permissions) and not 'crm.view'=any(v_permissions) then raise exception 'Editar CRM exige visualizar CRM';end if;
 if 'finance.edit'=any(v_permissions) and not 'finance.view'=any(v_permissions) then raise exception 'Editar Financeiro exige visualizar Financeiro';end if;
 select u.id into v_user from auth.users u where lower(u.email)=lower(btrim(p_email)) limit 1;
 if v_user is null then raise exception 'Conta nao encontrada no Supabase Authentication. Crie a conta primeiro no Auth Users.';end if;
 -- Impede que um administrador se rebaixe nesta tela.
 if v_user=(select auth.uid()) and p_role<>'admin' then raise exception 'Nao e permitido remover seu proprio cargo admin';end if;
 insert into public.purm_crm_members(user_id,full_name,role,branch,permissions,phone_e164,notify_whatsapp_leads)
 values(v_user,btrim(p_name),p_role,p_branch,v_permissions,coalesce(p_phone,''),coalesce(p_notify,false))
 on conflict(user_id) do update set full_name=excluded.full_name,role=excluded.role,
 branch=excluded.branch,permissions=excluded.permissions,phone_e164=excluded.phone_e164,notify_whatsapp_leads=excluded.notify_whatsapp_leads;
end;$$;
revoke all on function public.purm_admin_save_member(text,text,text,text,text[],text,boolean) from public;
grant execute on function public.purm_admin_save_member(text,text,text,text,text[],text,boolean) to authenticated;

-- Lista curta de responsaveis disponivel para quem pode editar cotacoes.
create or replace function public.purm_team_crm_users()
returns table(user_id uuid,full_name text,branch text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.purm_can('crm.edit') then raise exception 'Acesso comercial necessario';end if;
 return query select m.user_id,m.full_name,m.branch from public.purm_crm_members m
 where m.role='admin' or 'crm.view'=any(m.permissions) order by m.full_name;
end;$$;
revoke all on function public.purm_team_crm_users() from public;
grant execute on function public.purm_team_crm_users() to authenticated;

-- Substitui as politicas amplas de CRM por permissoes reais.
drop policy if exists "PURM leads member select" on public.purm_crm_leads;
drop policy if exists "PURM leads member insert" on public.purm_crm_leads;
drop policy if exists "PURM leads member update" on public.purm_crm_leads;
create policy purm_leads_select_v3 on public.purm_crm_leads for select to authenticated using(public.purm_can('crm.view'));
create policy purm_leads_insert_v3 on public.purm_crm_leads for insert to authenticated with check(
 created_by=(select auth.uid()) and public.purm_can('crm.edit'));
create policy purm_leads_update_v3 on public.purm_crm_leads for update to authenticated
 using(public.purm_can('crm.edit')) with check(public.purm_can('crm.edit'));

drop policy if exists "PURM interactions member select" on public.purm_crm_interactions;
drop policy if exists "PURM interactions member insert" on public.purm_crm_interactions;
create policy purm_interactions_select_v3 on public.purm_crm_interactions for select to authenticated using(public.purm_can('crm.view'));
create policy purm_interactions_insert_v3 on public.purm_crm_interactions for insert to authenticated with check(
 created_by=(select auth.uid()) and public.purm_can('crm.edit'));

-- Financeiro: troca politica por permissao, preservando auditoria e nenhuma exclusao.
drop policy if exists purm_finance_read_admin on public.purm_finance_entries;
drop policy if exists purm_finance_insert_admin on public.purm_finance_entries;
drop policy if exists purm_finance_update_admin on public.purm_finance_entries;
create policy purm_finance_read_v3 on public.purm_finance_entries for select to authenticated using(public.purm_can('finance.view'));
create policy purm_finance_insert_v3 on public.purm_finance_entries for insert to authenticated with check(
 created_by=(select auth.uid()) and public.purm_can('finance.edit'));
create policy purm_finance_update_v3 on public.purm_finance_entries for update to authenticated
 using(public.purm_can('finance.edit')) with check(public.purm_can('finance.edit'));
-- Permanece a politica de auditoria (somente admin).

drop policy if exists purm_secretary_read_admin on public.purm_secretary_events;
drop policy if exists purm_secretary_insert_admin on public.purm_secretary_events;
create policy purm_events_read_v3 on public.purm_secretary_events for select to authenticated using(public.purm_can('secretary.use'));
create policy purm_events_insert_v3 on public.purm_secretary_events for insert to authenticated with check(
 created_by=(select auth.uid()) and public.purm_can('secretary.use'));

-- Atribuir responsavel ao lead para avisos internos.
alter table public.purm_crm_leads add column if not exists assigned_to uuid references public.purm_crm_members(user_id);
create table if not exists public.purm_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.purm_crm_members(user_id) on delete cascade,
 lead_id uuid references public.purm_crm_leads(id) on delete set null,
 title text not null, body text not null default '',
 read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists purm_notifications_recipient_idx on public.purm_notifications(recipient_id,created_at desc);
alter table public.purm_notifications enable row level security;
drop policy if exists purm_notifications_select_self on public.purm_notifications;
create policy purm_notifications_select_self on public.purm_notifications
 for select to authenticated using(recipient_id=(select auth.uid()));
-- Sem INSERT/UPDATE/DELETE diretos pelo navegador: notificacoes somente pelo trigger e RPC.
create or replace function public.purm_mark_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.purm_notifications set read_at=coalesce(read_at,now())
 where id=p_notification_id and recipient_id=(select auth.uid());
end;$$;
revoke all on function public.purm_mark_notification_read(uuid) from public;
grant execute on function public.purm_mark_notification_read(uuid) to authenticated;

create or replace function public.purm_notify_lead() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or (tg_op='UPDATE' and new.assigned_to is distinct from old.assigned_to) then
  if new.assigned_to is not null then
   if not exists(select 1 from public.purm_crm_members m where m.user_id=new.assigned_to
      and (m.role='admin' or 'crm.view'=any(m.permissions))) then
     raise exception 'Responsavel sem acesso ao CRM';
   end if;
   insert into public.purm_notifications(recipient_id,lead_id,title,body)
   values(new.assigned_to,new.id,'Lead atribuido: '||left(new.company_name,120),
     'Novo contato para acompanhamento: '||left(coalesce(new.contact_name,''),100));
  elsif tg_op='INSERT' then
   insert into public.purm_notifications(recipient_id,lead_id,title,body)
   select m.user_id,new.id,'Nova cotacao: '||left(new.company_name,120),
      'Solicitacao ainda sem responsavel definido.'
   from public.purm_crm_members m where m.role='admin';
  end if;
 end if;
 return new;
end;$$;
drop trigger if exists purm_lead_notify_v3 on public.purm_crm_leads;
create trigger purm_lead_notify_v3 after insert or update of assigned_to on public.purm_crm_leads
 for each row execute function public.purm_notify_lead();

-- Perfil da Secretaria: metadata publica, nenhum token, nenhuma chave secreta.
create table if not exists public.purm_secretary_settings(
 id integer primary key default 1 check(id=1),
 name text not null default 'Carla' check(length(btrim(name)) between 2 and 60),
 avatar_url text,
 whatsapp_number text not null default '',
 notify_new_leads boolean not null default false,
 google_status text not null default 'nao_conectado' check(google_status='nao_conectado'),
 whatsapp_status text not null default 'nao_conectado' check(whatsapp_status='nao_conectado'),
 updated_at timestamptz not null default now()
);
insert into public.purm_secretary_settings(id) values(1) on conflict(id) do nothing;
alter table public.purm_secretary_settings enable row level security;
drop policy if exists purm_secretary_settings_read_v3 on public.purm_secretary_settings;
drop policy if exists purm_secretary_settings_update_v3 on public.purm_secretary_settings;
create policy purm_secretary_settings_read_v3 on public.purm_secretary_settings for select to authenticated
 using(public.purm_can('secretary.use') or public.purm_is_admin());
create policy purm_secretary_settings_update_v3 on public.purm_secretary_settings for update to authenticated
 using(public.purm_is_admin()) with check(public.purm_is_admin());
-- A atualização no navegador é restrita a campos não sensíveis via permissao de coluna.
revoke update on public.purm_secretary_settings from authenticated;
grant update(name,avatar_url,whatsapp_number,notify_new_leads) on public.purm_secretary_settings to authenticated;

-- Bucket PUBLICO somente para avatar: imagem destinada a ser publica no futuro WhatsApp.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('purm-secretary-avatars','purm-secretary-avatars',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
drop policy if exists purm_secretary_avatar_public_read on storage.objects;
drop policy if exists purm_secretary_avatar_admin_upload on storage.objects;
create policy purm_secretary_avatar_public_read on storage.objects for select to public
 using(bucket_id='purm-secretary-avatars');
create policy purm_secretary_avatar_admin_upload on storage.objects for insert to authenticated
 with check(bucket_id='purm-secretary-avatars' and public.purm_is_admin());

commit;

-- Conferencia manual apos a aplicacao:
-- select role, cardinality(permissions),count(*) from public.purm_crm_members group by 1,2;
-- select relname,relrowsecurity from pg_class where relname in('purm_notifications','purm_secretary_settings');
