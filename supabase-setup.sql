-- Añade la tabla que necesita Gestión Clientes al proyecto Supabase existente.
-- No modifica ni borra la tabla ivory37_sync de Control Laboral.
-- Se puede ejecutar más de una vez sin borrar datos.

create table if not exists public.gestion_clientes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gestion_clientes
  add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.gestion_clientes
  add column if not exists updated_at timestamptz not null default now();
alter table public.gestion_clientes enable row level security;

revoke all on table public.gestion_clientes from public, anon, authenticated;
grant select, insert, update on table public.gestion_clientes to authenticated;

drop policy if exists "Users can read their own company data" on public.gestion_clientes;
drop policy if exists "Users can create their own company data" on public.gestion_clientes;
drop policy if exists "Users can update their own company data" on public.gestion_clientes;
drop policy if exists "Users can read their own Gestión Clientes data" on public.gestion_clientes;
drop policy if exists "Users can create their own Gestión Clientes data" on public.gestion_clientes;
drop policy if exists "Users can update their own Gestión Clientes data" on public.gestion_clientes;

create policy "Users can read their own Gestión Clientes data"
  on public.gestion_clientes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own Gestión Clientes data"
  on public.gestion_clientes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own Gestión Clientes data"
  on public.gestion_clientes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Actualiza la caché de esquema de PostgREST inmediatamente.
notify pgrst, 'reload schema';
