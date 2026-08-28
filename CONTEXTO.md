# CRM CEA Aragón — Contexto del proyecto

> Lo lee Claude Code al iniciar cada sesión. Mantenerlo al día. NO poner secretos aquí
> (se commitea a git). Las claves viven en `.env.local` (local) y en Netlify (prod).

## Qué es
CRM para la **Escuela de Enfermería CEA Aragón** (Colegio de Enfermería Ángeles, plantel
Aragón), México. Gestiona alumnas, colegiaturas, bachillerato, caja, prospectos, cobranza
y **pagos en línea**. Idioma es-MX, moneda MXN. Marca en la UI: logo "CEA" + "CEA Aragón".

## Stack
- **Next.js 16.2.6** + Turbopack + TypeScript estricto (⚠️ versión con breaking changes,
  ver AGENTS.md; params/searchParams son async: `await params`).
- Tailwind v4, lucide-react, recharts.
- **Supabase** (`@supabase/ssr`) auth + DB con RLS por `user_id`.
- PWA instalable + captura por voz (OpenAI) + pagos (Mercado Pago Checkout Pro).

## Dónde vive
| Cosa | Valor |
|------|-------|
| Código fuente | `C:\Users\Alex\Desktop\Claude Code\crm-florencia` |
| Carpeta deploy (sin espacios) | `C:\deploy\crm` (tiene node_modules instalado) |
| Web producción | https://crm-cea-aragon.netlify.app |
| Repo | github.com/alexnavarrodev/CRM-CEA-Aragon (rama `main`) |
| Supabase | `ouhikbqtwadppsuspsst.supabase.co` |
| Netlify Site ID | `78d02971-7e98-4bbb-b462-ce3f50342d49` |
| Supabase User ID (directora) | `f758905b-9729-4e40-ad58-45e50e545380` |

## Secretos (NUNCA commitear; pedir/leer donde toca)
- **`.env.local`** (local, gitignored): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.
  Para scripts de datos: leer la service key de ahí.
- **Netlify env vars** (prod): las de Supabase + `OPENAI_API_KEY` + **`MP_ACCESS_TOKEN`**
  (producción, `APP_USR-…`) + **`MP_WEBHOOK_SECRET`**. Opcionales aún sin poner:
  `RESEND_API_KEY`, `NOTIFY_EMAIL` (avisos por correo), `NEXT_PUBLIC_SITE_URL`.
- **Token de Netlify para desplegar** (`nfp_…`): es de la cuenta del usuario, **caduca**;
  pedírselo cada sesión (Netlify → User settings → Applications → Personal access tokens).
  NO guardarlo en archivos.
- Regla histórica: el access token de Supabase se filtró una vez por estar en `.env.local`
  dentro del ZIP de Netlify. Mantener secretos fuera de git y del bundle.

## Flujo de despliegue (PowerShell)
```powershell
cd "C:\Users\Alex\Desktop\Claude Code\crm-florencia"; npm run build   # verificar
# git add/commit/push (mensajes terminan con Co-Authored-By: Claude ...)
robocopy "C:\Users\Alex\Desktop\Claude Code\crm-florencia" "C:\deploy\crm" /MIR /XD .git node_modules .next .netlify /XF "*.log" /NJH /NJS /NFL | Out-Null
Set-Location "C:\deploy\crm"
$env:NETLIFY_AUTH_TOKEN = "<token nfp_ del usuario>"
$env:NETLIFY_SITE_ID = "78d02971-7e98-4bbb-b462-ce3f50342d49"
netlify deploy --build --prod
```
- robocopy exit 1-3 = OK. Carpeta deploy sin espacios (lo exige Netlify CLI en Windows).
- Para tocar datos: script Node con `@supabase/supabase-js` + service key de `.env.local`,
  ejecutado DESDE la carpeta del proyecto (`cd` primero). DDL (CREATE/ALTER) NO se puede por
  API: el usuario lo corre en Supabase → SQL Editor (hay archivos `supabase-*.sql`).

## Versiones — V1 / V2
- **V1** = estable antes del módulo de pagos. Congelada: rama `v1` + tag `v1.0` (`e1de2c2`).
- **V2** = `main` (actual, con todo el módulo de pagos). Volver a V1 = redeploy desde `v1`.

## Páginas (`app/(dashboard)/` salvo `/pagar`)
- `hoy/` — **"Mi día"** (28 ago 2026), primera del menú. Guion de lo que hay que resolver
  ese día, para abrirlo al llegar a las 9:00. Tres bloques:
  1. **Recordatorios** (tabla `recordatorios`): notas con fecha que Alex apunta a mano
     ("hablar de sus faltas"), opcionalmente ligadas a una alumna. Salen el día elegido; si
     no se marcan como hechas siguen apareciendo como **atrasadas** (no se pierden). Se
     crean desde el botón «Recordatorio» o desde el icono 🔔 de cada alumna deudora.
  2. **Sueldos a pagar hoy**: salen **solo en las fechas de pago del calendario del grupo**
     (`grupos.calendario_id` → `payment_calendars_v2`), no cada día de clase. El monto es
     **exacto**, ver `lib/nomina.ts`. Además los fijos de sábado (Alex $3,000 / Isela $1,500).
     Se marcan como pagados **solos** al registrar el egreso en Caja con categoría `sueldos`
     (match por nombre de pila, tolera "Isela"/"Isella"); sin doble captura.
  3. **Grupos con clase ese día** (`grupos.dia`) con las alumnas que deben colegiatura /
     bachillerato, meses y montos faltantes, días de atraso, botón WhatsApp + enlace de pago
     (reusa la lógica de `por-cobrar`). Las que están al corriente solo se cuentan.
  Incluye navegación ◀▶ por día (para preparar el día siguiente) y **"Copiar guion"** que
  vuelca todo como texto plano.
- `dashboard/` (Panel, client) — KPIs por mes con filtro ◀▶; **Margen** (bachillerato sólo
  por su ganancia >$5000 acumulado por alumna; ambos cuenta col completo + bachi-ganancia);
  **Cobranza pendiente** clickable → modal con alumnas que deben.
- `colegiaturas/` — grid Nov2025→Dic2027, agrupado por grupo, filtros estado, header colapsable.
- `bachillerato/` — igual; celdas muestran monto; estados pagado/parcial/pendiente; acepta $0/Pagado.
- `caja/` — ingresos/egresos; filtro mes y categoría; gestión categorías (localStorage);
  registrar movimiento de alumna acumula en colegiatura/bachi/uniforme/certificado.
- `por-cobrar/` — alumnas con adeudo ordenadas por días de atraso + uniforme/certificado
  (vencidos primero); botón "Recordar por WhatsApp" (wa.me) + copiar enlace.
- `transferencias/` — wallet de control interno (app_kv key `wallet_entries`, vía lib/kv.ts).
- `calendario/` — fechas de pago por grupo (app_kv key `payment_calendars_v2`) + resumen mensual.
- `voz/` — captura por voz → `/api/voice` (OpenAI) → movimiento de caja.
- `alumnas/` — alta/edición; **botón copiar enlace de pago**; sección RCP/Uniforme/Certificado
  (barras + ajuste manual + alerta vencido).
- `pagos-extra/` (16 jul 2026) — vista de tabla con TODAS las alumnas y sus 3 conceptos extra
  (RCP $1,200 / Uniforme $1,500 / Certificado $7,000): botón "Falta $X" o "✓ Liquidado" por
  columna, clic para ajustar el monto inline; la fila se pone verde cuando las 3 están
  liquidadas. Enlace en el menú (Sidebar, "RCP/Unif./Cert.").
- `documentacion/` (27 jun 2026, arreglada de raíz 11 ago 2026) — checklist de papeles de
  Bachillerato por alumna: alta manual con su grupo, columnas CURP/INE/FIRMA/ESTUDIOS/
  A.NACIMIENTO/2 FOTOS con casillas clicables; la fila se pone verde cuando están los 6
  documentos. Tabla `documentacion_bachillerato` (RLS por user_id, SQL en
  `supabase-documentacion-bachillerato.sql`). Enlace en el menú (Sidebar).
  **⚠️ Bug corregido (11 ago 2026):** "Agregar alumna" se quedaba en blanco sin agregar nada —
  la tabla `documentacion_bachillerato` NUNCA se había creado en producción (a pesar de que
  este archivo decía lo contrario) y el código no mostraba ningún error al fallar el insert
  (`if (data) ...` silencioso, cerraba el modal igual). Corregido: se corrió el SQL de verdad
  en Aragón vía Management API, y `handleAdd`/`AddModal` ahora propagan y muestran el error si
  algo falla, con estado "Guardando…" mientras espera.
  **Pendiente portar a Atenea** (aún no se ha copiado, y ahí tampoco se ha corrido el SQL).
- `prospectos/`, `grupos/`, `egresadas/`, `reportes/`, `ajustes/`.
- **`app/pagar/[token]/`** (PÚBLICA, sin login) — estado de cuenta de la alumna por su token;
  3 secciones: **Mensualidad**, **Uniforme**, **Certificado**; cada una con su botón de pago.
- API: `app/api/pagos/checkout` (crea preferencia MP) y `app/api/pagos/webhook` (confirma).

## Módulo de pagos — arquitectura
- **`lib/acumulacion.ts`** (PURO, cliente+servidor): `colMonthSequence`/`bachiMonthSequence`,
  `mesToBachiTipo`, `saldoPagado`, `planColegiatura`/`planBachillerato` (acumulan al mes más
  antiguo pendiente y rebosan), `mesesAdeudadosCol`/`Bachi`, `inicioCobro`.
  El descuento de pronto pago se ELIMINÓ el 28 ago 2026 (ver Reglas de negocio).
- **`lib/extras.ts`** (PURO): rcp/uniforme/certificado. `EXTRA_TARGET` (rcp 1200, uniforme 1500,
  certificado 7000), `EXTRA_LABEL`, plazos (`UNIFORME_MESES_LIMITE=2`, `CERTIFICADO_MES_LIMITE=8`,
  RCP sin plazo), `mesesTranscurridos`, `estadoExtra` (falta/completo/vencido/porVencer).
- **`lib/nomina.ts`** (PURO): sueldo de docentes ($75 × alumnas × semanas al siguiente pago).
- **`lib/recargos.ts`** (PURO): recargo por pago tardío (10% por mes de colegiatura con más
  de 14 días de retraso), `proximaFechaPago`, `fechaPagoDeMes`. Se alimenta del calendario
  del grupo (`grupos.calendario_id`).
- **`lib/pagos-server.ts`** (SERVIDOR): `aplicarPagoAlumna` (col/bachi/ambos + recargo),
  `aplicarPagoExtra` (uniforme/certificado → pagos_extras + caja, **RCP aún NO incluido aquí**
  — no está en el checkout público, solo se registra desde Caja/Alumnas/pagos-extra),
  `enviarAvisoPago` (Resend).
- **checkout**: body `{ token, concepto, monto? }`. concepto ∈ mensualidad|uniforme|certificado.
  Calcula importe en servidor; uniforme/certificado aceptan aportación parcial (`monto`).
  `external_reference = "<alumnaId>|<concepto>"`.
- **webhook**: verifica firma (MP_WEBHOOK_SECRET), consulta el pago, **idempotente**
  (tabla pagos_online, mp_payment_id único), aplica según concepto + avisa por correo.

## Reglas de negocio CLAVE
- **"Pagado" se mide por ESTADO**, no por monto (pagado=lleno, parcial=su monto, pendiente=0
  aunque tenga monto placeholder).
- **Acumulación**: el pago va al mes más antiguo sin pagar y rebosa; límite $1000/mes
  (colegiatura ambos=1000, colegiatura pura=cuota; bachillerato=1000).
- **Desde cuándo se le cobra a una alumna** (`inicioCobro` en `lib/acumulacion.ts`): el mes
  **más tardío** entre el inicio de su grupo y el mes de su `created_at` (alta en el CRM), y
  si además tiene un registro de pago aún más antiguo, ese. Las tres piezas son necesarias:
  · Sin el inicio del grupo, una alumna recién inscrita **sin ningún registro de pago** daba
    lista vacía y salía como "al corriente" debiendo (Daniela Bazán y María Guadalupe
    Rodríguez de SMA, 28 ago 2026). Antes lo tapaban las filas placeholder de $0.
  · Sin la fecha de alta, a quien entra con el curso empezado se le inventarían meses de
    deuda anteriores a su ingreso (Sandra Vera entró en ago a MMLC, que arrancó en feb:
    le habría salido $6,000 falsos). Se comprobó sobre las 9 alumnas afectadas.
  Lo usan `hoy/`, `por-cobrar/`, `pagar/[token]`, `api/pagos/checkout` y `pagos-server.ts`
  — si se añade otro cálculo de adeudo, tiene que pasar por aquí también.
- **'ambos'** = $2000 = $1000 col + $1000 bachi (split 50/50).
- **Margen** (Panel y Caja): el bachillerato SÍ deja ganancia. Tramitarlo cuesta `BACHI_COSTO`
  ($5000) por alumna, así que los primeros $5000 ACUMULADOS de bachi de cada alumna son costo
  (no cuentan) y lo que pague de ahí en adelante es ganancia (lib/margen.ts → `gananciaBachiDelMes`).
  Colegiatura cuenta completa; en 'ambos' la mitad es col (completa) + mitad bachi (sólo ganancia).
  El margen mensual queda disparejo a propósito (meses iniciales bajos hasta cubrir el costo).
- **Descuento pronto pago $50: ELIMINADO** el 28 ago 2026 a petición de Alex. No reponerlo.
- **Recargo por pago tardío (28 ago 2026)**: si pasan **más de 14 días** desde la fecha de
  pago que le toca a su grupo (la del calendario), esa mensualidad suma un **10%**.
  · Es **por cada mes** atrasado, no una vez sobre el total.
  · **Solo colegiatura**: el bachillerato nunca genera recargo (en 'ambos', el 10% se calcula
    sobre los $1,000 de colegiatura, no sobre los $2,000).
  · Se calcula sobre lo que queda a deber de ese mes, así que si ya abonó parte, baja.
  · Si el grupo no tiene calendario, o el mes no está en él, **no se cobra recargo** (nunca se
    inventa una fecha límite).
  · ⚠️ El recargo **no es colegiatura**: `aplicarPagoAlumna` lo aparta antes de repartir el
    pago entre los meses, porque si no el 10% rebosaría al mes siguiente dándolo por
    parcialmente pagado. En Caja entra el total, con el recargo anotado en el concepto.
  · El panel (`pagar/[token]`) y el checkout usan **el mismo cálculo**, para que el importe
    cobrado coincida siempre con el que la alumna vio.
  · **Exenciones** (tabla `recargo_exenciones`, una fila = alumna + año + mes): perdonan el
    recargo de ESE mes concreto, no para siempre. Se creó porque el recargo se implantó sin
    aviso previo: Alex perdonó agosto 2026 a Jacqueline Ocaña y Jenifer García. En octubre
    su agosto sigue exento pero septiembre ya les cobra, que es justo lo buscado.
    Hoy se dan de alta por script; **no hay UI todavía**.
  · El panel lleva un **aviso permanente** de que a partir de la próxima colegiatura se
    aplica el 10% — para que nadie pueda decir que no se le informó.
- **Sueldo de las docentes** (`lib/nomina.ts`): **$75 × alumnas activas del grupo × semanas
  hasta el siguiente pago**. Las semanas salen del calendario del grupo (distancia entre la
  fecha de pago y la siguiente: 4 o 5 según el mes), y se paga **el día de la fecha de pago**,
  no cada día de clase. Es **por grupo**, no por docente: Lizbeth cobra por separado MMLC y
  VMLC. Comprobado contra Caja: VMX 6×4=$1,800 · SMX 8×4=$2,400 · VMLC 11×5=$4,125 ·
  SVLE 8×5=$3,000 · SMA 7×4=$2,100 (8/8 casos exactos).
  ⚠️ El enlace grupo→calendario **NO se puede deducir por el nombre** (el grupo `SVLE` usa el
  calendario `SMLE`, `VMLC` usa `VML`, `SMA` usa `SMAC`): vive explícito en
  `grupos.calendario_id` y se edita en el modal de Grupos.
- **Sueldos fijos de sábado**: Alex $3,000 e Isela $1,500 (constante `SUELDOS_SABADO` en
  `app/(dashboard)/hoy/page.tsx`; cambiarlos requiere deploy).
- **Uniforme $1500** (vence mes 2), **Certificado $7000** (vence mes 8) y **RCP $1200** (sin
  plazo/vencido). Se pagan a plazos (aportaciones que acumulan). Inicio de curso = mes más
  antiguo con registro de la alumna.
- **Inicio de curso por grupo** (no meter pagos antes): JMT=Nov2025, VMX=Ene2026, MML=Feb2026,
  SMX=Feb2026, VML=Abr2026, SML=May2026. Meses previos se marcan **$0/Pagado** (ya hecho).
- **Fechas**: NUNCA `new Date('YYYY-MM-DD')` para comparar meses (UTC desfasa en UTC-6). Usar
  `fecha.slice(0,7)` o parsear el string. La "hora de México" se calcula `Date.now()-6h`.
  Para la fecha de HOY en formularios usar `hoyMX()` (lib/fecha.ts), NO
  `new Date().toISOString().slice(0,10)` (después de las 6pm MX da el día siguiente).

## Tablas Supabase (RLS por user_id)
- `grupos`, `alumnas` (+ `pago_token` único), `pagos_colegiaturas` (anio,mes,monto,estado),
  `pagos_bachillerato` (anio,tipo,monto,estado), `movimientos_caja`, `prospectos`,
  `pagos_online` (mp_payment_id único, idempotencia), `pagos_extras` (alumna+concepto, único).
- `app_kv` (user_id+key, value jsonb): clave/valor por usuario para datos grandes —
  `wallet_entries` (transferencias) y `payment_calendars_v2` (calendario). Antes vivían en
  `auth user_metadata`, pero inflaban el JWT/cookie de sesión y el CDN devolvía HTTP 400 en
  dispositivos con sesión iniciada. Acceso vía `lib/kv.ts` (`kvGet`/`kvSet`). NO volver a meter
  datos que crecen en user_metadata. SQL: `supabase-app-kv.sql`.
- `documentacion_bachillerato` (27 jun 2026, RLS por user_id): checklist de papeles por alumna
  para la página `documentacion/`. SQL: `supabase-documentacion-bachillerato.sql`.
- `recargo_exenciones` (28 ago 2026, RLS por user_id): perdona el recargo de un mes concreto
  a una alumna (único por alumna+año+mes). SQL: `supabase-recargo-exenciones.sql`. FALTA en Atenea.
- `recordatorios` (28 ago 2026, RLS por user_id): notas con fecha para la página `hoy/`
  (`alumna_id` opcional, `hecho` bool). SQL: `supabase-recordatorios.sql` (ese archivo añade
  también `grupos.calendario_id`). Corrido en Aragón; FALTA en Atenea.
- localStorage: `crm_categorias` (categorías de caja, por navegador).

## Mercado Pago
- Checkout Pro, **producción activa**. App MP del usuario; webhook configurado a
  `…/api/pagos/webhook`. Comisión MP ≈ 3.5-4% tarjeta (es %, no fija).
- Pago en línea probado OK (registra solo en Caja + colegiatura/bachi/extras).

## Relación con Atenea (la otra escuela)
Atenea (CEA Roma) es un fork independiente (repo `CRM-CEA-Roma`, sitio `crm-cea-roma`,
Supabase `rbgqbwrttjfsuefbbatv`, carpeta `...\crm-cea-roma`). **Mismo código, ramas separadas**.
Al hacer un cambio aquí, normalmente se porta a Atenea (los archivos de pagos/lib son iguales;
solo difieren en marca: "CEA Aragón"→"Atenea", logo CEA→A, URL del sitio, statement_descriptor,
y el remitente del correo). Atenea aún NO tiene Mercado Pago configurado (cuenta de la esposa).

## Pendiente / próximos pasos
- **Paso 6**: WhatsApp **automático** (WhatsApp Business API) — requiere alta + costo por msg.
- Avisos por correo (Resend): código listo, faltan `RESEND_API_KEY` + `NOTIFY_EMAIL` en Netlify.
- Atenea: configurar su Mercado Pago cuando la esposa tenga cuenta.
- Portar a Atenea la página `documentacion/` (checklist de Bachillerato, ver §Páginas) — aún no
  se ha copiado, es lo único de código no fusionado a fecha 9 jul 2026.

## SQL que el usuario ya corrió (referencia)
`supabase-pago-token.sql`, `supabase-pagos-online.sql`, `supabase-pagos-extras.sql`
(en Aragón y Atenea). El esquema base está en `supabase-schema.sql`.
`supabase-app-kv.sql` (tabla app_kv) — corrido en Aragón; FALTA correrlo en Atenea al portar.
`supabase-documentacion-bachillerato.sql` — **corrido de verdad en Aragón el 11 ago 2026**
(la nota anterior de "corrido 27 jun" era incorrecta: la tabla nunca se había creado en
producción, por eso "Agregar alumna" fallaba en silencio — ver §Páginas/documentación y la
lección de abajo). FALTA en Atenea.
