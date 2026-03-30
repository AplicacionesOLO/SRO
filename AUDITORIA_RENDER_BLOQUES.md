# AUDITORÍA TÉCNICA — RENDER DE BLOQUES CLIENT_PICKUP
Fecha de auditoría: 2026-03-27  
Archivos analizados: `src/pages/calendario/page.tsx`, `src/services/calendarService.ts`, `supabase/functions/generate-client-pickup-blocks/index.ts`  
Datos reales de DB consultados durante la auditoría.

---

## RESULTADO EJECUTIVO

Se identificaron **2 bugs reales** que explican por qué los bloques no se ven correctamente.

| # | Severidad | Componente | Descripción |
|---|-----------|-----------|-------------|
| 1 | 🔴 CRÍTICO | `dock_time_blocks` (DB) | **No existen bloques para hoy ni los días cercanos.** Los bloques en DB empiezan desde 2026-03-30. La Edge Function fue invocada por última vez el 2026-03-17. Para el rango visible (hoy = 2026-03-27, vista 3 días = 26-28 Mar), NO hay registros en la tabla. |
| 2 | 🔴 CRÍTICO | `buildDateFromMinutes` / `getTopFromBusinessStart` | `dt.setHours(h, m, 0, 0)` y `date.getHours()` usan timezone LOCAL del browser. En browser UTC las horas de negocio y el top del bloque se calculan 6 horas desplazados. |

---

## 1. CARGA DE BLOQUES — TRAZA COMPLETA

### 1.1 Llamada a `getDockTimeBlocks`

**Archivo**: `src/pages/calendario/page.tsx` → función `loadData` (aprox línea 330)

```typescript
calendarService.getDockTimeBlocks(orgId, bufferStart.toISOString(), bufferEnd.toISOString())
```

- `orgId` = UUID de la organización ✓
- `bufferStart` = `dateRange.startDate - 2 días` (en UTC)
- `bufferEnd` = `dateRange.endDate + 2 días` (en UTC)

**Para hoy (2026-03-27) en vista de 3 días:**
- `startDate` = 2026-03-26T06:00:00Z (medianoche CR del 26)
- `endDate` = 2026-03-28T05:59:59.999Z (fin del 28 en CR)
- `bufferStart` ≈ 2026-03-24T06:00:00Z
- `bufferEnd` ≈ 2026-03-30T05:59:59Z

### 1.2 Query en `calendarService.ts`

```typescript
const { data, error } = await supabase
  .from('dock_time_blocks')
  .select('*')
  .eq('org_id', orgId)
  .eq('is_cancelled', false)      // ✅ ya está
  .lt('start_datetime', endDate)  // ✅ overlap real (fix anterior)
  .gt('end_datetime', startDate)  // ✅ overlap real (fix anterior)
  .order('start_datetime', { ascending: true });
```

La query es correcta post-fix anterior.

### 1.3 ¿Qué devuelve la query para hoy?

**Bloques CLIENT_PICKUP existentes en DB (resultado real):**

```
start_datetime        | end_datetime          | dock_id
2026-03-30 12:00 UTC  | 2026-03-30 14:00 UTC  | 9769d1c2-...
2026-03-31 12:00 UTC  | 2026-03-31 14:00 UTC  | 9769d1c2-...
... hasta 2026-04-16
```

- **Bloque más antiguo en DB**: `2026-03-30 12:00:00 UTC`
- **Creados el**: `2026-03-17` (created_at real de la DB)
- **`bufferEnd` del calendario hoy**: ≈ `2026-03-30T05:59:59Z`

**DIAGNÓSTICO 1 (CRÍTICO):**  
El `bufferEnd` es `~2026-03-30T05:59:59Z` y el primer bloque comienza en `2026-03-30T12:00:00Z`.  
`12:00 UTC > 05:59 UTC` → **EL BLOQUE QUEDA FUERA DEL RANGO DE FETCH.**  
La query devuelve `[]` vacío para el rango actual.  

**Causa raíz**: La Edge Function fue ejecutada el 2026-03-17. Generó bloques a partir de ese día por 30 días adelante. No hay bloques entre 2026-03-17 y 2026-03-29 porque o nunca se generaron para esos días o fueron eliminados (force_regenerate). Para hoy 2026-03-27 simplemente no hay registros.

### 1.4 Filtrado post-fetch

```typescript
const dockIds = new Set(docksData.map((d) => d.id));
const filteredBlocks = blocksData.filter((b) => dockIds.has(b.dock_id));
setBlocks(filteredBlocks);
```

Si el dock `9769d1c2` está en el warehouse seleccionado → pasa. Si se filtra por otro warehouse → no pasa.  
El andén "0101" pertenece al warehouse "OLO" (confirmado en DB).

---

## 2. TRAZA COMPLETA DEL RENDER (cuando hay un bloque)

Supongamos el usuario navega al 2026-03-30 donde SÍ hay bloque. Aquí el segundo bug:

### 2.1 Filtro por día (CORRECTO ✅)

```typescript
blocks.filter((b) => {
  if (b.dock_id !== dock.id) return false;
  const bStart = new Date(b.start_datetime);
  return isSameDayInCR(bStart, day);  // ← usa Intl API, correcto
})
```

Para bloque `2026-03-30T12:00:00Z` y `day = 2026-03-30T06:00:00Z` (medianoche CR en UTC):
- `bStart.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' })` → `'2026-03-30'` ✓
- `day.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' })` → `'2026-03-30'` ✓
- **Resultado: bloque pasa el filtro.** ✅

### 2.2 Cálculo visual — `clampEventToBusinessHours` (BUG 🔴)

```typescript
const clampEventToBusinessHours = (day, start, end) => {
  const dayBusinessStart = buildDateFromMinutes(day, businessStartMinutes);
  const dayBusinessEnd   = buildDateFromMinutes(day, businessEndMinutes);
  ...
}
```

**El bug está en `buildDateFromMinutes`:**

```typescript
const buildDateFromMinutes = (day, minutesFromMidnight) => {
  const dayStartTz = getStartOfDay(day, TIMEZONE); // ← correcto: 2026-03-30T06:00:00Z
  const dt = new Date(dayStartTz);
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  dt.setHours(h, m, 0, 0);  // ← 🔴 BUG: usa LOCAL timezone del browser
  return dt;
};
```

**En browser UTC con businessStart="06:00" (businessStartMinutes=360):**

| Paso | Valor | Esperado |
|------|-------|----------|
| `dayStartTz` | `2026-03-30T06:00:00Z` (medianoche CR) | ✓ |
| `dt = new Date(dayStartTz)` | `06:00 UTC` | ✓ |
| `dt.setHours(6, 0, 0, 0)` en browser UTC | `2026-03-30T06:00:00Z` (medianoche CR!) | ❌ Debería ser `2026-03-30T12:00:00Z` (06:00 CR) |
| `dayBusinessStart` | `06:00 UTC = medianoche CR` | ❌ |
| Esperado | `12:00 UTC = 06:00 CR` | — |

**En browser UTC con businessEnd="17:30" (businessEndMinutes=1050):**

| `dt.setHours(17, 30, 0, 0)` en UTC | `17:30 UTC = 11:30 CR` | ❌ Debería ser `23:30 UTC = 17:30 CR` |

**Resultado del clamp para el bloque (start=12:00 UTC, end=14:00 UTC):**

- `clampedStart = max(12:00, 06:00) = 12:00 UTC` ✓ (no clipea)
- `clampedEnd = min(14:00, 17:30) = 14:00 UTC` ✓ (no clipea)
- Clamp **NO devuelve null** → bloque tiene geometría calculada

Pero el top estará mal:

### 2.3 Cálculo de `top` — `getTopFromBusinessStart` (BUG 🔴)

```typescript
const getTopFromBusinessStart = (date: Date): number => {
  const minutesFromMidnight = date.getHours() * 60 + date.getMinutes();  // 🔴 browser local
  const minutesFromStart = minutesFromMidnight - businessStartMinutes;
  return minutesFromStart * PX_PER_MINUTE_DYNAMIC;
};
```

Para `clampedStart = 2026-03-30T12:00:00Z`:

| Browser | `getHours()` | `minutesFromMidnight` | `minutesFromStart` | `top` |
|---------|-------------|----------------------|---------------------|-------|
| **UTC** | 12 | 720 | 720 - 360 = **360** | 720px |
| **CR (UTC-6)** | 6 | 360 | 360 - 360 = **0** | **0px ✓** |

En CR browser → top=0px (inicio del horario, correcto).  
En UTC browser → top=720px (6 horas hacia abajo, visualmente en la franja de 12:00 CR aunque el bloque es de 06:00 CR).

**Warehouse OLO: slotInterval=30, PX_PER_MINUTE_DYNAMIC=2. Grid height = (1050-360) × 2 = 1380px. Top=720px < 1380px → bloque SÍ aparece en DOM, pero desplazado 360 minutos hacia abajo.**

### 2.4 ¿Puede el clamp devolver null?

Sí, en escenarios donde businessEnd es corto. Ejemplo:  
Si businessEnd = "08:00" (480 min) en UTC browser → `dayBusinessEnd = 08:00 UTC`.  
Bloque end = 14:00 UTC. `clampedEnd = min(14:00, 08:00) = 08:00 UTC`.  
`clampedStart = 12:00 UTC`. `08:00 <= 12:00` → **returns null**.

Para el warehouse OLO con businessEnd="17:30" esto no ocurre.

---

## 3. RESPUESTA EXACTA POR BLOQUE DE PRUEBA

**Bloque**: `id=bdec492d`, dock `9769d1c2` (andén 0101), `2026-04-16 12:00-14:00 UTC`, warehouse OLO.

| Punto de control | Hoy (Mar 27) | Al navegar a Mar 30 (CR browser) | Al navegar a Mar 30 (UTC browser) |
|-----------------|:---:|:---:|:---:|
| Existe en DB | ✅ | ✅ | ✅ |
| Llega al servicio | ❌ (fuera de rango) | ✅ | ✅ |
| Entra al estado React (`blocks`) | ❌ | ✅ | ✅ |
| Pasa filtro de dock | — | ✅ | ✅ |
| Pasa filtro de día (`isSameDayInCR`) | — | ✅ | ✅ |
| Pasa clamp (no null) | — | ✅ | ✅ |
| Entra al render DOM | ❌ | ✅ | ✅ |
| Top correcto | — | ✅ (0px) | ❌ (720px = 6h desplazado) |
| **Causa del fallo** | Edge Fn no regeneró bloques para Mar 26-29 | OK | Posición incorrecta |

---

## 4. CAUSA RAÍZ #1 — BRECHA DE DATOS EN DB

**La Edge Function `generate-client-pickup-blocks` no está siendo invocada con frecuencia.**

- `created_at` de todos los bloques: `2026-03-17`
- Bloques existen desde: `2026-03-30` (el 17 Mar + 13 días porque los primeros 13 días ya tienen bloques históricos o fueron eliminados)
- Hoy: `2026-03-27`
- Días sin bloque: 2026-03-17 a 2026-03-29

**La Edge Function debe ser re-ejecutada para generar bloques para los días actuales.**

Comando de re-ejecución:
```bash
curl -X POST https://<supabase-project>.supabase.co/functions/v1/generate-client-pickup-blocks \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"org_id": "<ORG_ID>", "days_ahead": 30, "force_regenerate": true}'
```

---

## 5. CAUSA RAÍZ #2 — `buildDateFromMinutes` y `getTopFromBusinessStart` USAN BROWSER LOCAL TIME

**Archivo**: `src/pages/calendario/page.tsx`

### Bug A: `buildDateFromMinutes`
```typescript
// ANTES (buggy):
const dt = new Date(dayStartTz);
dt.setHours(h, m, 0, 0);  // ← browser local tz → incorrecto en no-CR browsers

// DESPUÉS (fix):
return new Date(dayStartTz.getTime() + minutesFromMidnight * 60_000);
// → suma directa en ms, timezone-agnostic, siempre correcto
```

### Bug B: `getTopFromBusinessStart`
```typescript
// ANTES (buggy):
const minutesFromMidnight = date.getHours() * 60 + date.getMinutes();  // browser local

// DESPUÉS (fix):
const dayStart = getStartOfDay(date, TIMEZONE);  // medianoche CR en UTC
const minutesFromCRMidnight = (date.getTime() - dayStart.getTime()) / 60_000;  // offset real
const minutesFromStart = minutesFromCRMidnight - businessStartMinutes;
```

---

## 6. QUERIES SQL DE VALIDACIÓN

```sql
-- 1. ¿Cuántos bloques CLIENT_PICKUP hay para los próximos 7 días?
SELECT 
  start_datetime AT TIME ZONE 'America/Costa_Rica' AS start_cr,
  end_datetime   AT TIME ZONE 'America/Costa_Rica' AS end_cr,
  reason, dock_id
FROM dock_time_blocks
WHERE reason LIKE 'CLIENT_PICKUP%'
  AND is_cancelled = false
  AND start_datetime >= NOW()
  AND start_datetime <= NOW() + INTERVAL '7 days'
ORDER BY start_datetime;

-- 2. ¿El andén 9769d1c2 tiene bloque HOY?
SELECT count(*) FROM dock_time_blocks
WHERE dock_id = '9769d1c2-6ae7-406a-80b8-c214993599d6'
  AND reason LIKE 'CLIENT_PICKUP%'
  AND start_datetime >= date_trunc('day', NOW() AT TIME ZONE 'America/Costa_Rica') AT TIME ZONE 'America/Costa_Rica'
  AND start_datetime < (date_trunc('day', NOW() AT TIME ZONE 'America/Costa_Rica') + INTERVAL '1 day') AT TIME ZONE 'America/Costa_Rica';

-- 3. Ver rango completo de bloques generados
SELECT 
  MIN(start_datetime) AS primer_bloque,
  MAX(start_datetime) AS ultimo_bloque,
  COUNT(*) AS total
FROM dock_time_blocks
WHERE reason LIKE 'CLIENT_PICKUP%' AND is_cancelled = false;
```

---

## 7. FIX MÍNIMO — CÓDIGO LISTO

### Fix 1: `buildDateFromMinutes` (page.tsx)

```typescript
// REEMPLAZAR:
const buildDateFromMinutes = useCallback(
  (day: Date, minutesFromMidnight: number) => {
    const dayStartTz = getStartOfDay(day, TIMEZONE);
    const dt = new Date(dayStartTz);
    const h = Math.floor(minutesFromMidnight / 60);
    const m = minutesFromMidnight % 60;
    dt.setHours(h, m, 0, 0);
    return dt;
  },
  []
);

// POR:
const buildDateFromMinutes = useCallback(
  (day: Date, minutesFromMidnight: number) => {
    const dayStartTz = getStartOfDay(day, TIMEZONE); // medianoche CR en UTC
    return new Date(dayStartTz.getTime() + minutesFromMidnight * 60_000);
  },
  []
);
```

### Fix 2: `getTopFromBusinessStart` (page.tsx)

```typescript
// REEMPLAZAR:
const getTopFromBusinessStart = useCallback(
  (date: Date): number => {
    const minutesFromMidnight = date.getHours() * 60 + date.getMinutes();
    const minutesFromStart = minutesFromMidnight - businessStartMinutes;
    return minutesFromStart * PX_PER_MINUTE_DYNAMIC;
  },
  [businessStartMinutes, PX_PER_MINUTE_DYNAMIC]
);

// POR:
const getTopFromBusinessStart = useCallback(
  (date: Date): number => {
    const dayStart = getStartOfDay(date, TIMEZONE);
    const minutesFromCRMidnight = (date.getTime() - dayStart.getTime()) / 60_000;
    const minutesFromStart = minutesFromCRMidnight - businessStartMinutes;
    return minutesFromStart * PX_PER_MINUTE_DYNAMIC;
  },
  [businessStartMinutes, PX_PER_MINUTE_DYNAMIC]
);
```

### Fix 3: Re-ejecutar la Edge Function para generar bloques del período actual

Sin esto, aunque el código esté perfecto, no hay bloques que mostrar para los días 2026-03-27 a 2026-03-29.

---

## 8. LOGS DE DIAGNÓSTICO IMPLEMENTADOS (ver page.tsx)

Se agregaron logs en 3 puntos críticos:

1. **Al finalizar `getDockTimeBlocks`** → muestra cuántos bloques totales llegaron y cuántos son CLIENT_PICKUP
2. **Al filtrar por dock y día** → muestra cada bloque que pasa o falla el filtro
3. **Al calcular el clamp** → muestra si devuelve null y por qué, o el top/height final

Abre DevTools → Console y filtra por `[CALENDAR-BLOCK]` para ver la traza completa.

---

*Auditoría generada con análisis directo del código fuente y datos reales de la base de datos.*
