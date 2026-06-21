-- Tabla clave/valor por usuario. Reemplaza el uso de auth user_metadata para
-- datos grandes (transferencias y calendario), que inflaban el JWT/cookie de
-- sesión y provocaban HTTP 400 ("Bad Request") en el CDN.
-- Correr en Supabase → SQL Editor.

create table if not exists public.app_kv (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null,
  value      jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.app_kv enable row level security;

drop policy if exists "app_kv propio" on public.app_kv;
create policy "app_kv propio" on public.app_kv
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
