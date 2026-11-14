-- Tabla independiente para sincronizar Gestión Clientes.
-- Ejecuta este archivo en Supabase → SQL Editor.
create table if not exists public.gestion_clientes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gestion_clientes enable row level security;

drop policy if exists "Users can read their own company data" on public.gestion_clientes;
create policy "Users can read their own company data"
  on public.gestion_clientes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own company data" on public.gestion_clientes;
create policy "Users can create their own company data"
  on public.gestion_clientes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own company data" on public.gestion_clientes;
create policy "Users can update their own company data"
  on public.gestion_clientes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.gestion_clientes to authenticated;
