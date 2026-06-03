# CRM Florencia Nightingale — Contexto del proyecto

> Este archivo lo lee Claude Code automáticamente al iniciar cualquier sesión.
> Sirve para no perder contexto entre chats. Mantenerlo actualizado.

## Qué es

CRM para la **Escuela de Enfermería Florencia Nightingale** (Aragón, México).
Gestiona alumnas, pagos de colegiatura y bachillerato, caja, prospectos y reportes.
Idioma de la interfaz: **español (es-MX)**. Moneda: **MXN ($)**.

## Stack

- **Next.js 16.2.6** con Turbopack + TypeScript estricto (⚠️ versión con breaking changes, ver AGENTS.md)
- **Tailwind CSS v4**
- **Supabase** (`@supabase/ssr`) — auth + base de datos con Row Level Security en todas las tablas
- **lucide-react** (iconos), **recharts** (gráficos)
- PWA instalable (manifest + service worker) + captura por voz con OpenAI

## Dónde vive

| Cosa | Ubicación |
|------|-----------|
| Código fuente (principal) | `C:\Users\Alex\Desktop\Claude Code\crm-florencia` |
| Carpeta de despliegue (copia sin espacios) | `C:\deploy\crm` |
| Web en producción | https://crm-cea-aragon.netlify.app |
| Repositorio | github.com/alexnavarrodev/CRM-CEA-Aragon (rama `main`) |
| Base de datos | Supabase: `ouhikbqtwadppsuspsst.supabase.co` |

### IDs de despliegue
- Netlify Site ID: `78d02971-7e98-4bbb-b462-ce3f50342d49`
- Supabase User ID (la directora): `f758905b-9729-4e40-ad58-45e50e545380`

### ⚠️ Seguridad — NUNCA romper esta regla
- **NUNCA** poner `SUPABASE_ACCESS_TOKEN` ni la `OPENAI_API_KEY` en `.env.local`
  con intención de producción. El access token se filtró una vez porque `.env.local`
  quedó embebido en el ZIP de funciones de Netlify.
- `.env.local` = SOLO desarrollo local.
- Producción = variables de entorno en Netlify (ya configurada `OPENAI_API_KEY` ahí).

## Flujo de despliegue (PowerShell en Windows)

```powershell
# 1. Build local de verificación
cd "C:\Users\Alex\Desktop\Claude Code\crm-florencia"; npm run build

# 2. git add/commit/push (mensajes terminan con Co-Authored-By: Claude ...)

# 3. Copiar a carpeta sin espacios + desplegar
Set-Location "C:\deploy\crm"
robocopy "C:\Users\Alex\Desktop\Claude Code\crm-florencia" "C:\deploy\crm" /MIR /XD .git node_modules .next /XF "*.log" /NJH /NJS /NFL | Out-Null
$env:NETLIFY_AUTH_TOKEN = "<token de Netlify>"
$env:NETLIFY_SITE_ID = "78d02971-7e98-4bbb-b462-ce3f50342d49"
netlify deploy --build --prod
```
- `robocopy` devuelve exit code 1-3 en éxito (no es error).
- La carpeta de deploy debe estar sin espacios (Netlify CLI lo exige en Windows).

## Estructura de páginas (`app/(dashboard)/`)

Sidebar en `components/Sidebar.tsx` → `components/DashboardShell.tsx` (drawer móvil responsive).

**OPERACIÓN**
- `dashboard/` — **Panel**. Client-side. KPIs del mes con filtro de mes (flechas). Margen, ingresos, gastos, y **Cobranza pendiente** (clickable → modal con lista de alumnas que deben).
- `colegiaturas/` — Grid multi-año (Nov 2025→Dic 2027) de pagos de colegiatura. Filas agrupadas por grupo. Filtros pagado/parcial/pendiente. Header colapsable.
- `bachillerato/` — Igual que colegiaturas pero para bachillerato. Celdas muestran monto. Estados pagado/parcial/pendiente.
- `caja/` — Ingresos/egresos. Filtro por mes y categoría. Gestión de categorías (localStorage). Header colapsable. Registrar movimiento liga pagos automáticos.
- `transferencias/` — Wallet de control interno (saldo + Agregar/Descontar). Guardado en `user_metadata.payment_calendars` — independiente de la caja.
- `calendario/` — Tabla de fechas de pago por grupo (datos en `user_metadata.payment_calendars_v2`) + resumen mensual por grupo. Botón "Nuevo calendario".
- `voz/` — Captura por voz (PWA móvil). Web Speech API + `/api/voice` (OpenAI GPT-4o-mini) → parsea a movimiento de caja con confirmación.

**PERSONAS**: `prospectos/`, `alumnas/`, `grupos/`, `egresadas/`
**MÁS**: `reportes/`, `ajustes/`

## Reglas de negocio CLAVE

### Programas de alumna (`alumnas.programa`)
- `colegiaturas` — solo colegiatura
- `bachillerato` — solo bachillerato
- `ambos` — Col.+Bachi. Cuota $2000/mes = **$1000 colegiatura + $1000 bachillerato**.

### Categoría "ambos" (Col.+Bachi) en Caja
- Un pago de categoría `ambos` se **divide 50/50**: mitad a colegiatura, mitad a bachillerato.

### Pagos parciales ACUMULABLES (importante)
- **Límite $1000 por mes** tanto en colegiatura (para `ambos`) como en bachillerato.
- Para colegiatura pura, el límite = `cuota_mensual` de la alumna.
- Un pago se acumula llenando el mes en curso y **rebosa al siguiente** cuando llega al límite.
  - Ej: María paga $500 ambos → $250 col + $250 bachi. Si el mes de bachi tenía $750, sube a $1000 = **pagado**. Si solo llega a $250 = **parcial**.
- Estado `parcial` si el mes < límite, `pagado` si llega al límite.
- Lógica en `caja/page.tsx` → `handleAdd` → `upsertCol` / `upsertBachi` (usan `colMonthSequence` / `bachiMonthSequence`).

### Margen (Panel y Caja)
- El **margen NO incluye bachillerato** (no es beneficio propio de la escuela).
- Categoría `bachillerato` → se excluye completa.
- Categoría `ambos` → solo cuenta **la mitad** (la parte de colegiatura).

### Cobranza pendiente (Panel)
- El número grande = **suma real de las deudas de la lista** (coincide con el modal).
- Por alumna: meses sin pagar desde su primer pago registrado hasta el mes seleccionado.

### Fechas — evitar bug de zona horaria
- **NUNCA** usar `new Date('YYYY-MM-DD')` para comparar meses (UTC desplaza el día 1 al mes anterior en UTC-6).
- Usar string slicing: `fecha.slice(0,7)` para `'YYYY-MM'`, o `parseFecha()` que parte el string.

## Tablas Supabase (todas con RLS por `user_id`)

- `alumnas` — id, user_id, nombre, telefono, email, grupo_id, cuota_mensual, programa, status, promedio, asistencia_pct, ...
- `grupos` — id, user_id, nombre, dia (LUN..DOM), horario, color, maestra
- `pagos_colegiaturas` — alumna_id, anio, mes (1-12), monto, estado (pagado|parcial|pendiente), fecha_pago
- `pagos_bachillerato` — alumna_id, anio, tipo (ene..dic | inscripcion | materiales), monto, estado (pagado|parcial|pendiente), fecha_pago
- `movimientos_caja` — tipo (ingreso|egreso), concepto, monto, canal (efectivo|transferencia|tarjeta|mixto), categoria, fecha, alumna_id
- `prospectos` — nombre, telefono, email, interes, status, fecha_contacto

Datos no-tabla guardados en `auth user_metadata`:
- `wallet_entries` — movimientos de Transferencias
- `payment_calendars_v2` — calendarios de pago por grupo
- `crm_categorias` — en localStorage del navegador (categorías de caja)

## Colores de día (DIA_COLORS en lib/types.ts)
LUN #6366F1, MAR #3B82F6, MIE #06B6D4, JUE #D97706, VIE #10B981, SAB #8B5CF6, DOM #EC4899

## Notas de scripts puntuales
- Para tocar datos directamente: script Node con `@supabase/supabase-js` y la
  `SUPABASE_SERVICE_ROLE_KEY` (está en `.env.local`), ejecutado desde la carpeta
  del proyecto (`cd` primero para que resuelva el módulo).
