-- Exenciones puntuales del recargo por pago tardío.
-- Una fila = "a esta alumna no se le cobra recargo por ESTE mes de colegiatura".
-- Nació porque el recargo del 10% se implantó el 28 ago 2026 sin haberlo avisado
-- antes a las alumnas, así que Alex perdonó el mes en curso a quienes estaban a
-- punto de pasarse del plazo. No es un "sin recargo para siempre": es por mes,
-- para que a partir del siguiente les vuelva a aplicar.
-- Corrido en Aragón el 28 ago 2026 vía Management API. FALTA en Atenea.

create table if not exists public.recargo_exenciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  alumna_id  uuid not null references public.alumnas(id) on delete cascade,
  anio       integer not null,
  mes        integer not null,
  motivo     text,
  created_at timestamptz not null default now(),
  unique (alumna_id, anio, mes)
);

alter table public.recargo_exenciones enable row level security;

drop policy if exists "recargo_exenciones propias" on public.recargo_exenciones;
create policy "recargo_exenciones propias" on public.recargo_exenciones
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists recargo_exenciones_alumna_idx
  on public.recargo_exenciones (alumna_id, anio, mes);
