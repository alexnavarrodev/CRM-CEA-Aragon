-- Documentación Bachillerato: checklist de papeles por alumna (se marca a mano).
-- Columnas de documentos: CURP, INE, FIRMA, ESTUDIOS, A.NACIMIENTO, 2 FOTOS.
-- Correr en Supabase → SQL Editor.

create table if not exists public.documentacion_bachillerato (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  nombre          text not null,
  grupo_id        uuid references public.grupos(id) on delete set null,
  curp            boolean not null default false,
  ine             boolean not null default false,
  firma           boolean not null default false,
  estudios        boolean not null default false,
  acta_nacimiento boolean not null default false,
  fotos           boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.documentacion_bachillerato enable row level security;

drop policy if exists "doc_bachi propio" on public.documentacion_bachillerato;
create policy "doc_bachi propio" on public.documentacion_bachillerato
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
