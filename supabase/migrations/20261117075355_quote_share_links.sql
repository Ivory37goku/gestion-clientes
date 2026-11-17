-- Enlaces individuales para compartir presupuestos. El acceso público pasa por
-- la Edge Function; anon y authenticated no reciben permisos directos a la tabla.
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
