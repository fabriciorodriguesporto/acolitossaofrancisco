-- Esquema inicial do sistema de escalas para Supabase.
-- Execute no SQL Editor usando uma conta com permissões de administrador.

create extension if not exists pgcrypto;

create table if not exists public.acolitos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.missas_editadas (
  chave_missa text primary key,
  data_original date,
  data_missa date not null,
  horario time not null,
  titulo text not null default 'Missa',
  tipo text not null check (tipo in ('alteracao', 'extra')),
  cancelada boolean not null default false,
  check (
    (tipo = 'alteracao' and data_original is not null) or
    (tipo = 'extra' and data_original is null)
  )
);

-- A chave também identifica missas automáticas que não têm uma linha em missas_editadas.
create table if not exists public.missas_funcoes (
  chave_missa text not null,
  funcao text not null,
  acolito_id uuid references public.acolitos(id) on delete set null,
  manual boolean not null default false,
  primary key (chave_missa, funcao)
);

create unique index if not exists missas_funcoes_acolito_unico_por_missa
  on public.missas_funcoes (chave_missa, acolito_id)
  where acolito_id is not null;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.acolitos enable row level security;
alter table public.missas_editadas enable row level security;
alter table public.missas_funcoes enable row level security;
alter table public.admin_users enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.acolitos, public.missas_editadas, public.missas_funcoes to anon, authenticated;
grant insert, update, delete on public.acolitos, public.missas_editadas, public.missas_funcoes to authenticated;
grant select on public.admin_users to authenticated;

drop policy if exists acolitos_read_active on public.acolitos;
create policy acolitos_read_active on public.acolitos
  for select to anon, authenticated
  using (ativo = true);

drop policy if exists acolitos_admin_manage on public.acolitos;
create policy acolitos_admin_manage on public.acolitos
  for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists missas_editadas_public_read on public.missas_editadas;
create policy missas_editadas_public_read on public.missas_editadas
  for select to anon, authenticated
  using (true);

drop policy if exists missas_editadas_admin_manage on public.missas_editadas;
create policy missas_editadas_admin_manage on public.missas_editadas
  for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists missas_funcoes_public_read on public.missas_funcoes;
create policy missas_funcoes_public_read on public.missas_funcoes
  for select to anon, authenticated
  using (true);

drop policy if exists missas_funcoes_admin_manage on public.missas_funcoes;
create policy missas_funcoes_admin_manage on public.missas_funcoes
  for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists admin_users_read_self on public.admin_users;
create policy admin_users_read_self on public.admin_users
  for select to authenticated
  using (user_id = auth.uid());

-- Recalcula somente as atribuições automáticas; linhas marcadas como manuais são preservadas.
create or replace function public.regenerar_funcoes_geradas(p_chaves text[], p_funcoes jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users where user_id = auth.uid()
  ) then
    raise exception 'Apenas administradores podem regenerar as escalas';
  end if;

  if p_chaves is null or p_funcoes is null or jsonb_typeof(p_funcoes) <> 'array' then
    raise exception 'Parâmetros inválidos para regenerar as escalas';
  end if;

  delete from public.missas_funcoes
  where chave_missa = any(p_chaves) and manual = false;

  insert into public.missas_funcoes (chave_missa, funcao, acolito_id, manual)
  select item.chave_missa, item.funcao, item.acolito_id, false
  from jsonb_to_recordset(p_funcoes) as item(
    chave_missa text,
    funcao text,
    acolito_id uuid,
    manual boolean
  )
  where item.manual = false and item.chave_missa = any(p_chaves);
end;
$$;

grant execute on function public.regenerar_funcoes_geradas(text[], jsonb) to authenticated;

-- Habilita as mudanças em tempo real usadas pela interface, sem adicionar uma tabela duas vezes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'acolitos'
    ) then
      execute 'alter publication supabase_realtime add table public.acolitos';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'missas_editadas'
    ) then
      execute 'alter publication supabase_realtime add table public.missas_editadas';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'missas_funcoes'
    ) then
      execute 'alter publication supabase_realtime add table public.missas_funcoes';
    end if;
  end if;
end
$$;

-- Depois de criar o usuário em Authentication > Users, autorize-o com:
-- insert into public.admin_users (user_id) values ('UUID_DO_USUARIO');
