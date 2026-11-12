-- Agente de WhatsApp + citas dentro del CRM (migración desde n8n, nov 2026).
-- Ver PLAN-MIGRACION-CITAS-CRM.md (fase 1). Corrido en Aragón vía Management API. NO aplica a Atenea.
-- Las funciones de Supabase (entrada-twilio, agente, tareas) escriben con service role;
-- el CRM lee y edita con la sesión de la directora (RLS por user_id, como el resto de tablas).

-- Dueña de los datos: la directora del CRM de Aragón (las funciones no tienen sesión de usuario)
create or replace function public.crm_duena() returns uuid
  language sql immutable as $$ select 'f758905b-9729-4e40-ad58-45e50e545380'::uuid $$;

-- Cada persona que escribe por WhatsApp. telefono en formato Twilio sin '+': 5215512345678
create table if not exists public.leads (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default public.crm_duena() references auth.users(id) on delete cascade,
  telefono                text not null unique,
  nombre                  text,
  fuente                  text not null default 'organico' check (fuente in ('anuncio', 'organico', 'web', 'manual')),
  ctwa_clid               text,
  anuncio_id              text,
  anuncio_titulo          text,
  estado                  text not null default 'nuevo'
                          check (estado in ('nuevo', 'platicando', 'cita', 'inscrita', 'descartado')),
  opt_out                 boolean not null default false,
  mensajes                integer not null default 0,
  primer_mensaje          timestamptz not null default now(),
  ultimo_mensaje          timestamptz,
  interes_visita_at       timestamptz,
  chatwoot_contact_id     integer,
  chatwoot_conversation_id integer,
  alumna_id               uuid references public.alumnas(id) on delete set null,
  notas                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists leads_user_estado_idx on public.leads (user_id, estado);
create index if not exists leads_anuncio_idx on public.leads (anuncio_id);

-- Citas de visita al plantel. Una cita activa por lead y una por horario (cupo 1).
create table if not exists public.citas (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default public.crm_duena() references auth.users(id) on delete cascade,
  lead_id                 uuid not null references public.leads(id) on delete cascade,
  inicio                  timestamptz not null,
  fin                     timestamptz not null,
  modalidad               text,
  estado                  text not null default 'agendada'
                          -- sin_registro: citas históricas de n8n de las que nunca se supo si llegaron
                          check (estado in ('agendada', 'confirmada', 'llego', 'no_llego', 'cancelada', 'reagendada', 'sin_registro')),
  origen                  text not null default 'agente' check (origen in ('agente', 'crm', 'historico')),
  reagendada_de           uuid references public.citas(id) on delete set null,
  confirmada_at           timestamptz,
  recordatorio_24h_at     timestamptz,
  aviso_sin_confirmar_at  timestamptz,
  audio_enviado_at        timestamptz,
  llego_at                timestamptz,
  notas                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (fin > inicio)
);
create unique index if not exists citas_una_activa_por_lead on public.citas (lead_id)
  where estado in ('agendada', 'confirmada');
create unique index if not exists citas_un_lead_por_horario on public.citas (inicio)
  where estado in ('agendada', 'confirmada');
create index if not exists citas_user_inicio_idx on public.citas (user_id, inicio);

-- Memoria de la conversación para la IA (reemplaza n8n_chat_histories)
create table if not exists public.chat_mensajes (
  id          bigserial primary key,
  user_id     uuid not null default public.crm_duena() references auth.users(id) on delete cascade,
  lead_id     uuid references public.leads(id) on delete cascade,
  telefono    text not null,
  rol         text not null check (rol in ('user', 'assistant', 'tool', 'humano')),
  contenido   jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_mensajes_tel_idx on public.chat_mensajes (telefono, created_at);

-- Cola de eventos para la API de conversiones de Meta. event_id evita mandar dos veces el mismo.
create table if not exists public.eventos_meta (
  id          bigserial primary key,
  user_id     uuid not null default public.crm_duena() references auth.users(id) on delete cascade,
  lead_id     uuid references public.leads(id) on delete cascade,
  cita_id     uuid references public.citas(id) on delete set null,
  evento      text not null check (evento in ('Lead', 'Schedule', 'Asistio', 'Inscripcion')),
  event_id    text not null unique,
  valor       numeric,
  creado_at   timestamptz not null default now(),
  enviado_at  timestamptz,
  intentos    integer not null default 0,
  respuesta   jsonb
);
create index if not exists eventos_meta_pendientes_idx on public.eventos_meta (creado_at) where enviado_at is null;

-- Datos que el agente usa y Alex edita desde el CRM (grupo, promoción, precios, horario de citas)
create table if not exists public.agente_config (
  user_id     uuid primary key default public.crm_duena() references auth.users(id) on delete cascade,
  datos       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- RLS: la directora ve y edita lo suyo; las funciones usan service role
do $$
declare t text;
begin
  foreach t in array array['leads', 'citas', 'chat_mensajes', 'eventos_meta', 'agente_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s propios" on public.%I', t, t);
    execute format('create policy "%s propios" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- updated_at automático
create or replace function public.tocar_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists leads_updated on public.leads;
create trigger leads_updated before update on public.leads for each row execute function public.tocar_updated_at();
drop trigger if exists citas_updated on public.citas;
create trigger citas_updated before update on public.citas for each row execute function public.tocar_updated_at();

-- Tareas programadas (recordatorios, eventos para Meta) — se programan en la fase 3
create extension if not exists pg_cron;
create extension if not exists pg_net;
