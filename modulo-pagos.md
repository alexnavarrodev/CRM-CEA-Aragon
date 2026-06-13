# Módulo de Pagos en Línea — Plan de implementación

> Plan para agregar cobro en línea (SPEI + tarjeta) y cobranza automatizada al CRM
> Florencia Nightingale. Pensado para implementarse DENTRO de este proyecto, no como
> app aparte. Leer junto con `CONTEXTO.md` y `AGENTS.md`.

## Objetivo

Que las alumnas puedan pagar su colegiatura/bachillerato desde el celular (SPEI o
tarjeta) sin pasar al despacho, y que el sistema **persiga el pago por mí** con
recordatorios automáticos. Mantener el pago en efectivo en despacho como hoy.

El problema real es de **cobranza**, no técnico: la gente deja en visto, dice "ahorita"
y se tarda 2-3 semanas. La estrategia es (1) quitar fricción para capturar la intención
de pago en el momento, y (2) automatizar el seguimiento para no perseguir a mano.

---

## Lo que YA existe y se reutiliza (no rehacer)

| Pieza | En el CRM |
|---|---|
| Adeudos por mes | `pagos_colegiaturas`, `pagos_bachillerato` |
| Pago efectivo / transferencia / tarjeta | `movimientos_caja` (`canal`) |
| Quién debe y cuánto | "Cobranza pendiente" del Panel |
| Acumulación parcial ($1000, 50/50, rebose) | `caja/page.tsx` → `upsertCol`/`upsertBachi` |
| App instalable | PWA (manifest + SW) |
| Auth + aislamiento de datos | Supabase + RLS por `user_id` |

Conclusión: ~70% ya está. Lo nuevo es estrecho (abajo).

---

## Decisión de arquitectura: SIN login para alumnas

El modelo es single-user por directora (RLS por `user_id`). Darle cuenta a cada alumna
obligaría a rehacer RLS/auth → caro y riesgoso (afecta la app compartida con CEA Roma).

**Solución: link de pago permanente por alumna, sin sesión.**

- Cada alumna tiene UN token fijo → página pública `/pagar/[token]`.
- La página **calcula en vivo** lo que debe hoy (reusa la lógica de cobranza pendiente).
- El "recordatorio" es solo volver a mandar el mismo link. No se regenera nada.
- Si ya pagó: muestra "✅ estás al corriente". Si debe varios meses: los lista.
- Login para alumnas se descarta (un portal completo sería otro proyecto).

Token: columna nueva `alumnas.pago_token` (string aleatorio, único, indexado).
La página `/pagar/[token]` NO usa la sesión de la directora; lee por token vía una
RPC/endpoint con `service_role` del lado servidor (nunca exponer service key al cliente).

---

## Punto técnico delicado ⚠️ (hacer PRIMERO)

La lógica de acumulación (límite $1000, división 50/50 de `ambos`, rebose al mes
siguiente, saltar meses previos al inicio del grupo, bug de zona horaria con
`fecha.slice(0,7)`) vive **client-side** en `caja/page.tsx`.

El webhook de la pasarela corre en **servidor**, sin esa lógica. Si entra un pago
"crudo" rompe toda la contabilidad.

→ **Refactor previo obligatorio:** extraer `upsertCol`/`upsertBachi` y sus helpers
(`colMonthSequence`/`bachiMonthSequence`) a `lib/acumulacion.ts`, puro y sin React,
usable desde cliente Y servidor. `caja/page.tsx` y el webhook lo comparten. Es refactor,
no reescritura, pero es el trabajo más fino: cubrir con cuidado los meses de inicio por
grupo y el bug de zona horaria.

---

## Pasarela de pago

**Mercado Pago** (más fácil de arrancar en MX; SPEI + tarjeta en un mismo checkout).
Conekta es alternativa válida. Decisión final al implementar.

- SPEI es el canal barato y el que más usa la gente → priorizarlo en el checkout.
- Tarjeta como conveniencia (comisión ~2.9% + IVA).
- Webhook de confirmación → escribe el pago vía `lib/acumulacion.ts`.

---

## Descuento por pronto pago: $50

Estrategia elegida (premiar > castigar).

- Si la alumna paga **antes de la fecha de vencimiento** de su grupo (día 1 o 15 según
  `payment_calendars_v2`), su cuota baja **$50**.
- La página `/pagar/[token]` muestra: "Paga antes del [fecha] y ahorras $50 →
  pagas $950 en vez de $1000".
- Pasada la fecha, el descuento desaparece (precio normal). No hay recargo.

**Interacción con la acumulación (cuidado):** el descuento reduce el MONTO, no el
estado. Si la cuota del mes es $1000 y paga $950 con descuento, ese mes debe quedar
`pagado` (lleno), no `parcial`. Es decir: el descuento aplica un crédito de $50 que
"completa" el límite del mes. Manejar esto explícitamente en `lib/acumulacion.ts`
(p.ej. el límite efectivo del mes baja a $950 cuando aplica pronto pago, o se registra
un ajuste de $50). Definir el mecanismo exacto al implementar y cubrirlo con pruebas.

---

## Recordatorios — cadencia escalonada

No un solo aviso: una secuencia que llega antes y da seguimiento.

| Momento | Tono | Mensaje |
|---|---|---|
| −3 días | amable | "Tu colegiatura vence el [fecha]. Paga antes y ahorra $50: [link]" |
| Día de pago | recordatorio | "Hoy vence tu colegiatura. Aquí tu link: [link]" |
| +3 días | directo | "Quedó pendiente tu pago de [mes]. [link]" |
| +7 días | firme | "Tu colegiatura de [mes] sigue pendiente. [link]" |

- Disparador: tarea programada (Supabase Edge Function con `pg_cron`, o Netlify
  Scheduled Function). Con este stack, Edge Function programada es lo natural.
- Corre diario, evalúa quién cae en cada escalón según su fecha de grupo y estado.

### Nivel de automatización (por fases)

1. **Asistido (fase 1):** el cron arma la lista "Por cobrar"; cada renglón con botón
   "Recordar por WhatsApp" → abre `wa.me` con mensaje + link pre-llenados. Yo aprieto
   enviar. Costo $0, sin trámites. Sirve para validar los mensajes que funcionan.
2. **Automático (fase 2, objetivo real):** WhatsApp Business API (Meta / Twilio /
   360dialog) manda la cadencia solo. Requiere alta de cuenta + plantillas aprobadas +
   costo por mensaje (centavos). WhatsApp porque es donde sí te leen (email lo ignoran).
   El salto NO rehace nada: link y adeudo ya existen, solo cambia quién aprieta enviar.

Meta: "el sistema persigue, yo solo cobro".

---

## Cambios concretos en el CRM

### Datos
- `alumnas.pago_token` — token único para la página pública.
- Tabla o campos para registrar **intentos/links enviados** y resultado del webhook
  (idempotencia: no duplicar pago si el webhook llega dos veces).
- (Opcional) `pagos_*`: marca de si se aplicó descuento pronto pago.

### Código nuevo
- `lib/acumulacion.ts` — lógica compartida extraída de `caja/page.tsx` (refactor).
- `app/pagar/[token]/page.tsx` — página pública (server-side, lee por token).
- `app/api/pagos/checkout` — crea la preferencia de pago en Mercado Pago.
- `app/api/pagos/webhook` — confirma pago → escribe vía `lib/acumulacion.ts`
  + inserta `movimientos_caja` (`canal: transferencia|tarjeta`). Idempotente.
- Edge Function programada (cron) — evalúa cadencia de recordatorios.

### UI existente
- `colegiaturas/` y modal de Cobranza pendiente → botón "Cobrar en línea" (copiar link /
  abrir WhatsApp con "ahorita te mando el link").
- Lista "Por cobrar" ordenada por **días de atraso** (ver a quién perseguir de verdad).

---

## Seguridad (respetar reglas de CONTEXTO.md)

- NUNCA exponer `service_role` ni claves de Mercado Pago al cliente. Solo en endpoints
  server-side y en variables de entorno de Netlify (no en `.env.local` de producción).
- Verificar la **firma del webhook** de Mercado Pago antes de escribir nada.
- El token de `/pagar/[token]` da acceso solo a esa alumna; no debe permitir listar
  otras. Acceso por token vía server, no client con anon key amplia.

## Notas de implementación
- **Next.js 16.2.6 con breaking changes** (ver AGENTS.md): el webhook, las rutas de API
  y la página server-side se escriben según `node_modules/next/dist/docs/`, no de memoria.
- Probar la acumulación + descuento con casos: `ambos` 50/50, rebose entre meses, meses
  previos al inicio del grupo, y pago con $950 que debe quedar `pagado`.

---

## Orden de trabajo sugerido

1. Refactor: `lib/acumulacion.ts` (compartido cliente+servidor) + pruebas.
2. `alumnas.pago_token` + página pública `/pagar/[token]` (mostrar adeudo en vivo).
3. Integrar Mercado Pago: checkout + webhook idempotente con firma verificada.
4. Descuento pronto pago $50 en cálculo y en la página.
5. Botón "Cobrar en línea" en colegiaturas / Cobranza pendiente + lista por días atraso.
6. Cron de recordatorios (fase 1 asistido por `wa.me`).
7. (Fase 2) WhatsApp Business API para cadencia automática.
