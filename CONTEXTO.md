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
- `alumnas/` — alta/edición; **botón copiar enlace de pago**; sección Uniforme/Certificado
  (barras + ajuste manual + alerta vencido).
- `prospectos/`, `grupos/`, `egresadas/`, `reportes/`, `ajustes/`.
- **`app/pagar/[token]/`** (PÚBLICA, sin login) — estado de cuenta de la alumna por su token;
  3 secciones: **Mensualidad**, **Uniforme**, **Certificado**; cada una con su botón de pago.
- API: `app/api/pagos/checkout` (crea preferencia MP) y `app/api/pagos/webhook` (confirma).

## Módulo de pagos — arquitectura
- **`lib/acumulacion.ts`** (PURO, cliente+servidor): `colMonthSequence`/`bachiMonthSequence`,
  `mesToBachiTipo`, `saldoPagado`, `planColegiatura`/`planBachillerato` (acumulan al mes más
  antiguo pendiente y rebosan), `mesesAdeudadosCol`/`Bachi`, `aplicaDescuentoProntoPago`
  (+constantes `PRONTO_PAGO_MONTO=50`, `PRONTO_PAGO_DIA_LIMITE=20`).
- **`lib/extras.ts`** (PURO): uniforme/certificado. `EXTRA_TARGET` (uniforme 1500, certificado
  7000), `EXTRA_LABEL`, plazos (`UNIFORME_MESES_LIMITE=2`, `CERTIFICADO_MES_LIMITE=8`),
  `mesesTranscurridos`, `estadoExtra` (falta/completo/vencido/porVencer).
- **`lib/pagos-server.ts`** (SERVIDOR): `aplicarPagoAlumna` (col/bachi/ambos + descuento),
  `aplicarPagoExtra` (uniforme/certificado → pagos_extras + caja), `enviarAvisoPago` (Resend).
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
- **'ambos'** = $2000 = $1000 col + $1000 bachi (split 50/50).
- **Margen** (Panel y Caja): el bachillerato SÍ deja ganancia. Tramitarlo cuesta `BACHI_COSTO`
  ($5000) por alumna, así que los primeros $5000 ACUMULADOS de bachi de cada alumna son costo
  (no cuentan) y lo que pague de ahí en adelante es ganancia (lib/margen.ts → `gananciaBachiDelMes`).
  Colegiatura cuenta completa; en 'ambos' la mitad es col (completa) + mitad bachi (sólo ganancia).
  El margen mensual queda disparejo a propósito (meses iniciales bajos hasta cubrir el costo).
- **Descuento pronto pago $50**: programa colegiaturas Y ambos (solo lado colegiatura), si
  paga antes del día 20 y el mes actual está sin pagar. El mes queda 'pagado' mostrando $1000
  (la Caja registra el dinero real). En 'ambos': bachillerato completo, colegiatura −$50.
- **Uniforme $1500** (vence mes 2) y **Certificado $7000** (vence mes 8). Se pagan a plazos
  (aportaciones que acumulan). Inicio de curso = mes más antiguo con registro de la alumna.
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

## SQL que el usuario ya corrió (referencia)
`supabase-pago-token.sql`, `supabase-pagos-online.sql`, `supabase-pagos-extras.sql`
(en Aragón y Atenea). El esquema base está en `supabase-schema.sql`.
`supabase-app-kv.sql` (tabla app_kv) — corrido en Aragón; FALTA correrlo en Atenea al portar.
