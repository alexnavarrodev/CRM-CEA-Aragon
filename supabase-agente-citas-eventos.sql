-- Agente + citas, parte 2 (fase 3 del plan): respuestas del modo sombra y eventos automáticos para Meta.
-- Corrido en Aragón vía Management API. Requiere supabase-agente-citas.sql.

-- Lo que el agente nuevo HABRÍA respondido mientras n8n sigue atendiendo (para comparar antes del cambio)
create table if not exists public.agente_sombra (
  id           bigserial primary key,
  user_id      uuid not null default public.crm_duena() references auth.users(id) on delete cascade,
  telefono     text not null,
  conversacion integer,
  mensaje      text,
  respuesta    text,
  herramientas jsonb,
  error        text,
  created_at   timestamptz not null default now()
);
alter table public.agente_sombra enable row level security;
drop policy if exists "agente_sombra propios" on public.agente_sombra;
create policy "agente_sombra propios" on public.agente_sombra for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Eventos de cita para Meta: agendada (al crearla) y asistió (al marcar «llegó» en el CRM).
-- Las citas históricas migradas de n8n no generan eventos.
create or replace function public.citas_eventos_meta() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' and new.origen <> 'historico' then
    insert into public.eventos_meta (lead_id, cita_id, evento, event_id)
    values (new.lead_id, new.id, 'Schedule', 'cita_' || new.id) on conflict (event_id) do nothing;
  elsif tg_op = 'UPDATE' and new.estado = 'llego' and old.estado is distinct from 'llego' then
    new.llego_at := coalesce(new.llego_at, now());
    insert into public.eventos_meta (lead_id, cita_id, evento, event_id)
    values (new.lead_id, new.id, 'Asistio', 'asistio_' || new.id) on conflict (event_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists citas_eventos_meta_ins on public.citas;
create trigger citas_eventos_meta_ins after insert on public.citas for each row execute function public.citas_eventos_meta();
drop trigger if exists citas_eventos_meta_upd on public.citas;
create trigger citas_eventos_meta_upd before update on public.citas for each row execute function public.citas_eventos_meta();

-- Inscripción: al dar de alta (o completar el teléfono de) una alumna, se busca su lead por los últimos
-- 10 dígitos del teléfono. Si existe, el lead queda «inscrita», se enlaza la alumna y se avisa a Meta.
-- Nunca bloquea el alta de la alumna: cualquier error se ignora.
create or replace function public.alumna_vincular_lead() returns trigger language plpgsql security definer as $$
declare d text; l record;
begin
  d := right(regexp_replace(coalesce(new.telefono, ''), '\D', '', 'g'), 10);
  if length(d) < 10 or (tg_op = 'UPDATE' and old.telefono is not distinct from new.telefono) then return new; end if;
  begin
    select id into l from public.leads where right(telefono, 10) = d order by primer_mensaje limit 1;
    if found then
      update public.leads set alumna_id = new.id, estado = 'inscrita' where id = l.id;
      insert into public.eventos_meta (lead_id, evento, event_id, valor)
      values (l.id, 'Inscripcion', 'inscripcion_' || l.id, 500) on conflict (event_id) do nothing;
    end if;
  exception when others then
    raise warning 'alumna_vincular_lead: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists alumnas_vincular_lead on public.alumnas;
create trigger alumnas_vincular_lead after insert or update of telefono on public.alumnas
  for each row execute function public.alumna_vincular_lead();
