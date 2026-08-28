-- Recordatorios con fecha, para la página "Mi día".
-- Alex apunta a mano un tema de una alumna concreta ("hablar de sus faltas") con la
-- fecha en que quiere que se lo recuerde; ese día aparece en Mi día. Si la fecha ya
-- pasó y no se marcó como hecho, sigue apareciendo como atrasado (no se pierde).
-- alumna_id es opcional: permite recordatorios generales, no atados a una alumna.
-- Corrido en Aragón el 28 ago 2026 vía Management API. FALTA en Atenea.

create table if not exists public.recordatorios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  alumna_id  uuid references public.alumnas(id) on delete cascade,
  titulo     text not null,
  fecha      date not null,
  hecho      boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.recordatorios enable row level security;

drop policy if exists "recordatorios propios" on public.recordatorios;
create policy "recordatorios propios" on public.recordatorios
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists recordatorios_user_fecha_idx
  on public.recordatorios (user_id, fecha);

-- Enlace explícito grupo → calendario de pagos (app_kv `payment_calendars_v2`).
-- NO se puede deducir por nombre: el grupo "SVLE" usa el calendario "SMLE", "VMLC"
-- usa "VML", "SMA" usa "SMAC". Como de esa fecha depende el sueldo de la docente,
-- el enlace se guarda explícito en vez de adivinarse.
alter table public.grupos add column if not exists calendario_id text;
