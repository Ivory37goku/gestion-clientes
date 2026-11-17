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

-- Enlaces individuales de presupuestos. La Edge Function usa service_role;
-- anon y authenticated no reciben permisos directos sobre la tabla.
create table if not exists public.gestion_clientes_quote_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  quote_id text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.gestion_clientes_quote_shares enable row level security;
revoke all on table public.gestion_clientes_quote_shares from public, anon, authenticated;
grant select, insert, update, delete on table public.gestion_clientes_quote_shares to service_role;
create index if not exists gestion_clientes_quote_shares_owner_quote_idx
  on public.gestion_clientes_quote_shares (owner_id, quote_id, created_at desc);
notify pgrst, 'reload schema';
