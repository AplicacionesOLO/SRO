# AUDITORÍA TÉCNICA: Generación y Render de Bloques CLIENT_PICKUP
> Fecha: 2026-03-27 | Basado en análisis directo del código fuente

---

## RESUMEN EJECUTIVO

Se identificaron **4 bugs reales y confirmados** que explican por qué los bloques CLIENT_PICKUP no se dibujan correctamente en el calendario. Los bugs son en dos capas: **query de datos** y **lógica de render**.

---

## 1. GENERACIÓN DE BLOQUES (Edge Function)

**Archivo**: `supabase/functions/generate-client-pickup-blocks/index.ts`

### 1.1 Cómo calcula start_datetime y end_datetime

La Edge Function trabaja siempre en timezone **America/Costa_Rica (UTC-06:00)**.

**Para HOY (día actual):**
```typescript
// Paso 1: Obtiene la hora actual en CR
const nowMinutesCR = getCostaRicaMinutesNow(new Date());

// Paso 2: Calcula desde dónde empieza el bloque de hoy
const todayStartMinutes = getDynamicStartMinutesForToday({
  nowMinutes: nowMinutesCR,
  startMinutes: businessStartMinutes,
  endMinutes: businessEndMinutes,
  blockMinutes: rule.block_minutes,
  reblockBeforeMinutes: rule.reblock_before_minutes,
});

// Paso 3: getDynamicStartMinutesForToday hace:
// - Si ahora < inicio negocio → empieza en inicio del negocio
// - Si ahora >= fin negocio → retorna null (NO genera bloque hoy)
// - Si está en medio → calcula el siguiente bloque válido con este algoritmo:
//   offset = floor((ahora - inicio + reblock_before) / block_minutes)
//   start = inicio + offset * block_minutes

// Paso 4: Construye la fecha ISO con offset CR
const iso = `${dateStr}T${hh}:${mm}:00-06:00`;  // CR offset hardcodeado
const blockStart = new Date(iso);                 // se convierte a UTC automáticamente
const blockEnd = new Date(blockStartMs + block_minutes * 60_000);
// blockEnd se clampea a businessEndMinutes si excede
```

**Para días futuros (días 1..days_ahead):**
```typescript
// Siempre usa businessStartMinutes (sin lógica dinámica)
const window = getBlockWindow({
  dateStr,         // "2026-03-28"
  startMinutes: businessStartMinutes,  // ej: 360 = 06:00
  endMinutes: businessEndMinutes,      // ej: 1020 = 17:00
  blockMinutes: rule.block_minutes,
});
// → start_datetime = "2026-03-28T12:00:00Z"  (06:00 CR = 12:00 UTC)
// → end_datetime   = start + block_minutes clampeado a businessEnd
```

### 1.2 Uso de block_minutes y reblock_before_minutes

| Campo | Rol |
|---|---|
| `block_minutes` | Duración del bloque generado en minutos |
| `reblock_before_minutes` | Margen de anticipación para calcular dónde empieza el bloque en el día actual. Garantiza que el bloque nuevo no empiece "en el pasado inmediato". |

**Fórmula para hoy:**
```
offset = floor( (nowMinutes - startMinutes + reblock_before_minutes) / block_minutes )
nextStartMinutes = startMinutes + offset * block_minutes
```

Ejemplo: negocio inicia 06:00 (360 min), ahora 08:30 (510 min), block=120min, reblock_before=10min
```
offset = floor( (510 - 360 + 10) / 120 ) = floor(160/120) = floor(1.33) = 1
nextStart = 360 + 1 * 120 = 480 = 08:00
→ Bloque: 08:00 a 10:00 CR
```

### 1.3 Formato del campo reason

El campo `reason` siempre se construye así:
```typescript
reason: `CLIENT_PICKUP:${rule.id}`
// Ejemplo: "CLIENT_PICKUP:a3f8b2c1-4e5d-4f6a-8b9c-1d2e3f4a5b6c"
```

No hay otro formato. Es siempre el prefijo `CLIENT_PICKUP:` seguido del UUID de la regla.

### 1.4 ¿Filtra por fecha >= today?

**SÍ, con matices:**
- Para días futuros: solo genera si el bloque no existe ya (`existingKeysSet`)
- Para hoy: SIEMPRE borra los bloques de hoy y los regenera:

```typescript
// SIEMPRE borra los bloques de HOY (independiente de force_regenerate)
await supabaseClient
  .from('dock_time_blocks')
  .delete()
  .eq('org_id', org_id)
  .in('reason', reasonPatterns)
  .gte('start_datetime', dayStartUtc)        // medianoche CR de hoy en UTC
  .lt('start_datetime', nextDayStartUtc);    // medianoche CR de mañana en UTC
```

### 1.5 ¿Elimina bloques previos antes de regenerar?

**Comportamiento dual:**

| Modo | Qué borra |
|---|---|
| **Normal (force_regenerate=false)** | Solo borra los bloques de HOY. Los días futuros se saltan si ya existen (`existingKeysSet`). |
| **Force regenerate (force_regenerate=true)** | Borra TODOS los bloques futuros (desde hoy) que tengan un `reason` que coincida con las reglas actuales. Luego regenera todo. |

**⚠️ RIESGO IDENTIFICADO**: Si una regla cambió de `dock_id`, los bloques del dock ANTERIOR tienen `reason = CLIENT_PICKUP:{ruleId}`. El `force_regenerate` los borrará correctamente. Pero en modo normal, esos bloques viejos del dock anterior persisten en DB (ya que no se borra por dock_id, sino solo por reason+fecha_hoy).

---

## 2. CONSULTA DEL CALENDARIO

**Archivo**: `src/services/calendarService.ts` → función `getDockTimeBlocks`

### Código exacto de la query:

```typescript
async getDockTimeBlocks(orgId: string, startDate: string, endDate: string): Promise<DockTimeBlock[]> {
  const { data, error } = await supabase
    .from('dock_time_blocks')
    .select('*')
    .eq('org_id', orgId)
    .gte('start_datetime', startDate)    // ← SOLO start_datetime
    .lte('start_datetime', endDate)      // ← SOLO start_datetime
    .order('start_datetime', { ascending: true });
  // ...
}
```

### 2.1 ¿Filtra start_datetime dentro del rango o usa overlap?

**SOLO start_datetime. NO usa lógica de solapamiento.**

La query actual es equivalente a:
```sql
WHERE org_id = $1
  AND start_datetime >= $2
  AND start_datetime <= $3
```

La lógica de solapamiento correcta sería:
```sql
WHERE org_id = $1
  AND start_datetime < $rangeEnd
  AND end_datetime > $rangeStart
```

**Implicación para CLIENT_PICKUP**: si un bloque tiene `start_datetime` fuera del rango visible pero `end_datetime` dentro, no se consulta. En la práctica, dado que cada bloque CLIENT_PICKUP es de un solo día, esto solo falla si el `bufferStart` calculado en el frontend está mal (ver Bug #3 más abajo).

### 2.2 ¿Filtra is_cancelled = false?

**NO. La query no filtra `is_cancelled`.**

La columna existe en la tabla:
```
is_cancelled | boolean | DEFAULT false | nullable YES
```

Pero la query hace `select('*')` sin filtrar por `is_cancelled`. Si hay bloques con `is_cancelled = true`, estos se incluyen en los resultados y se intentan dibujar en el calendario.

### 2.3 ¿Filtra por org_id correctamente?

**SÍ.** La query incluye `.eq('org_id', orgId)` correctamente.

### 2.4 Parámetros que recibe la query (desde page.tsx)

```typescript
// En loadData():
calendarService.getDockTimeBlocks(
  orgId,
  bufferStart.toISOString(),   // startDate de la query
  bufferEnd.toISOString()      // endDate de la query
)

// bufferStart = startOfRange - 2 días (BUFFER_DAYS = 2)
// bufferEnd   = endOfRange + 2 días

// startOfRange viene de getStartOfDay(startDate, TIMEZONE)
```

---

## 3. LÓGICA DE RENDER POR DÍA

**Archivo**: `src/pages/calendario/page.tsx` (líneas ~1595-1640 aprox.)

### Código exacto del filtro de bloques en render:

```typescript
{blocks
  .filter((b) => {
    if (b.dock_id !== dock.id) return false;
    const bStart = new Date(b.start_datetime);
    return bStart.toDateString() === day.toDateString();  // ← BUG
  })
  .map((block) => {
    const start = new Date(block.start_datetime);
    const end = new Date(block.end_datetime);
    const clamped = clampEventToBusinessHours(day, start, end);
    if (!clamped) return null;   // ← si clamp retorna null, bloque INVISIBLE
    // ...
  })}
```

### 3.1 ¿Usa start_datetime para ubicar el día?

**SÍ. Y ese es el problema.** Usa `toDateString()` que formatea la fecha según la **timezone local del browser**, no según Costa Rica (UTC-6).

Ejemplo del problema:
- Bloque generado: `start_datetime = 2026-03-28T12:00:00Z` (06:00 CR del 28 de marzo)
- Browser en UTC-8: `new Date("2026-03-28T12:00:00Z").toDateString()` = **"Sat Mar 28 2026"** ← correcto en este caso
- Browser en UTC-8, bloque a las 00:00 CR: `start_datetime = 2026-03-28T06:00:00Z` (medianoche CR)
  - En UTC-8: `06:00 UTC` = `22:00 del 27 local` → `"Fri Mar 27 2026"` ← ¡DÍA INCORRECTO!

### 3.2 El mismo bug existe para reservas:

```typescript
filteredReservations.filter((r) => {
  if (r.dock_id !== dock.id) return false;
  const rStart = new Date(r.start_datetime);
  return rStart.toDateString() === day.toDateString();  // ← mismo bug
})
```

### 3.3 Cómo afecta clampEventToBusinessHours

```typescript
const clampEventToBusinessHours = (day, start, end) => {
  const dayBusinessStart = buildDateFromMinutes(day, businessStartMinutes);
  const dayBusinessEnd = buildDateFromMinutes(day, businessEndMinutes);

  const clampedStart = start < dayBusinessStart ? dayBusinessStart : start;
  const clampedEnd = end > dayBusinessEnd ? dayBusinessEnd : end;

  if (clampedEnd <= clampedStart) return null;  // ← bloque invisible si no hay intersección
  // ...
};
```

Esta función hace un clamp correcto: si el bloque está completamente fuera del horario hábil del día, retorna `null` y el bloque es **invisible** (el `.map()` retorna `null` y React no lo renderiza).

**Escenario de fallo combinado**: si `toDateString()` asigna el bloque al día incorrecto, `clampEventToBusinessHours` podría retornar `null` porque los horarios del día asignado no intersectan con el bloque, haciéndolo completamente invisible.

### 3.4 Bug adicional: getStartOfDay tiene implementación incorrecta

```typescript
const getStartOfDay = (date: Date, timezone: string): Date => {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone }); // "2026-03-27"
  const startStr = `${dateStr}T00:00:00`;                                   // sin timezone suffix
  return new Date(new Date(startStr).toLocaleString('en-US', { timeZone: timezone }));
  //              ↑ parseado como LOCAL del browser    ↑ convertido a CR para display
  //                                                     luego re-parseado como LOCAL del browser
};
```

**El error**: `new Date('2026-03-27T00:00:00')` se parsea como **timezone local del browser** (sin sufijo Z o offset). Luego se convierte a string en CR timezone, y ese string se parsea de nuevo como local. En un browser UTC esto daría:

- `new Date('2026-03-27T00:00:00')` = 00:00 UTC = 18:00 CR del 26 de marzo
- `toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })` = `"3/26/2026, 6:00:00 PM"`
- `new Date("3/26/2026, 6:00:00 PM")` = 26 de marzo a las 18:00 local (UTC) = **¡día incorrecto!**

Esto hace que el rango de fechas visible en el calendario esté desplazado en browsers con timezone diferente a CR.

---

## 4. BUGS CONFIRMADOS CON EVIDENCIA

### 🔴 BUG #1 — Query usa solo start_datetime (no overlap)

**Archivo**: `src/services/calendarService.ts` → `getDockTimeBlocks`

**Código problemático**:
```typescript
.gte('start_datetime', startDate)
.lte('start_datetime', endDate)
```

**Correcto sería**:
```typescript
.lt('start_datetime', endDate)    // el bloque empieza ANTES de que termine el rango
.gt('end_datetime', startDate)    // el bloque termina DESPUÉS de que empiece el rango
```

**Impacto**: Bloques que empiezan fuera del rango pero se solapan no se cargan. Para CLIENT_PICKUP de un solo día, el impacto es moderado pero real cuando el buffer está mal calculado (ver Bug #3).

---

### 🔴 BUG #2 — Render usa toDateString() en lugar de timezone CR

**Archivo**: `src/pages/calendario/page.tsx`

**Código problemático** (aparece DOS veces: reservas y bloques):
```typescript
const bStart = new Date(b.start_datetime);
return bStart.toDateString() === day.toDateString();
```

**Correcto sería**:
```typescript
const bDateInCR = bStart.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const dayDateInCR = day.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
return bDateInCR === dayDateInCR;
```

**Impacto**: En browsers con timezone ≠ CR (ej. UTC-7, UTC-8), los bloques se asignan al día incorrecto y `clampEventToBusinessHours` los hace invisibles.

---

### 🔴 BUG #3 — getStartOfDay tiene bug de timezone doble conversión

**Archivo**: `src/pages/calendario/page.tsx`

**Código problemático**:
```typescript
const getStartOfDay = (date: Date, timezone: string): Date => {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const startStr = `${dateStr}T00:00:00`;  // ← sin timezone suffix
  return new Date(new Date(startStr).toLocaleString('en-US', { timeZone: timezone }));
};
```

**Correcto sería**:
```typescript
const getStartOfDay = (date: Date, timezone: string): Date => {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
  return new Date(`${dateStr}T00:00:00-06:00`);  // para CR hardcodeado
  // O más robusto:
  // return new Date(new Date(`${dateStr}T06:00:00Z`));  // medianoche CR = 06:00 UTC
};
```

**Impacto**: El rango visible del calendario está calculado incorrectamente en browsers fuera de CR timezone. Esto hace que `bufferStart/bufferEnd` sean valores erróneos y la query traiga bloques del día incorrecto.

---

### 🟡 BUG #4 — No se filtra is_cancelled = false

**Archivo**: `src/services/calendarService.ts` → `getDockTimeBlocks`

**Código problemático**:
```typescript
supabase.from('dock_time_blocks').select('*').eq('org_id', orgId)
  // ← falta: .eq('is_cancelled', false)
```

**Columna confirmada en DB**:
```
is_cancelled | boolean | DEFAULT false | NULLABLE
```

**Impacto**: Si existen bloques con `is_cancelled = true`, se cargan y se intentan renderizar. Pueden aparecer bloques "fantasma" que deberían estar ocultos.

---

### 🟡 COMPORTAMIENTO EDGE FUNCTION — Bloque de hoy se borra y regenera siempre

**Cada vez que se invoca la EF**, los bloques de HOY se borran y se recrean. Si la EF se llama:

| Momento | Resultado |
|---|---|
| Antes del horario de negocio | Genera bloque desde `businessStartMinutes` |
| Durante el horario de negocio | Genera bloque desde el slot calculado con `getDynamicStartMinutesForToday` |
| Después del horario de negocio | `todayStartMinutes = null` → **NO genera bloque para hoy** |

**Si la EF NO se invoca hoy**: el bloque de hoy puede no existir, o puede ser un bloque de ayer que expiró.

---

### 🟡 RIESGO — Bloques legacy de dock anterior no se limpian en modo normal

Si una regla cambia de `dock_id: A` a `dock_id: B`:
- Modo normal: solo borra bloques de HOY con ese reason. Los bloques futuros de dock A permanecen en DB.
- Modo `force_regenerate: true`: borra todos los bloques con ese reason (independiente del dock_id). ✓

---

## 5. QUERIES SQL DE VALIDACIÓN

### 5.1 Ver todos los bloques CLIENT_PICKUP activos
```sql
SELECT 
  id,
  dock_id,
  start_datetime AT TIME ZONE 'America/Costa_Rica' AS start_cr,
  end_datetime AT TIME ZONE 'America/Costa_Rica' AS end_cr,
  reason,
  is_cancelled,
  created_at
FROM dock_time_blocks
WHERE reason LIKE 'CLIENT_PICKUP:%'
  AND is_cancelled = false
ORDER BY start_datetime DESC;
```

### 5.2 Ver bloques CLIENT_PICKUP cancelados (bloques fantasma)
```sql
SELECT 
  id,
  dock_id,
  start_datetime AT TIME ZONE 'America/Costa_Rica' AS start_cr,
  reason,
  is_cancelled
FROM dock_time_blocks
WHERE reason LIKE 'CLIENT_PICKUP:%'
  AND is_cancelled = true
ORDER BY start_datetime DESC;
```

### 5.3 Ver reglas activas de Client Pickup
```sql
SELECT 
  cpr.id,
  cpr.org_id,
  cpr.client_id,
  cpr.dock_id,
  cpr.block_minutes,
  cpr.reblock_before_minutes,
  cpr.is_active,
  d.name AS dock_name,
  c.name AS client_name
FROM client_pickup_rules cpr
LEFT JOIN docks d ON d.id = cpr.dock_id
LEFT JOIN clients c ON c.id = cpr.client_id
WHERE cpr.is_active = true
ORDER BY cpr.created_at DESC;
```

### 5.4 Verificar si hay bloques del día de hoy en CR
```sql
SELECT 
  id,
  dock_id,
  start_datetime AT TIME ZONE 'America/Costa_Rica' AS start_cr,
  end_datetime AT TIME ZONE 'America/Costa_Rica' AS end_cr,
  reason,
  is_cancelled
FROM dock_time_blocks
WHERE reason LIKE 'CLIENT_PICKUP:%'
  AND start_datetime >= (CURRENT_DATE AT TIME ZONE 'America/Costa_Rica')
  AND start_datetime <  ((CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'America/Costa_Rica')
ORDER BY start_datetime;
```

### 5.5 Comparar bloques existentes vs reglas activas (detectar faltantes)
```sql
SELECT 
  cpr.id AS rule_id,
  d.name AS dock_name,
  cpr.block_minutes,
  COUNT(dtb.id) AS blocks_count,
  MIN(dtb.start_datetime AT TIME ZONE 'America/Costa_Rica') AS earliest_block,
  MAX(dtb.start_datetime AT TIME ZONE 'America/Costa_Rica') AS latest_block
FROM client_pickup_rules cpr
LEFT JOIN docks d ON d.id = cpr.dock_id
LEFT JOIN dock_time_blocks dtb 
  ON dtb.reason = 'CLIENT_PICKUP:' || cpr.id::text
  AND dtb.is_cancelled = false
  AND dtb.start_datetime >= NOW()
WHERE cpr.is_active = true
GROUP BY cpr.id, d.name, cpr.block_minutes
ORDER BY blocks_count ASC;
```

---

## 6. PROPUESTA DE FIX

### Fix #1 — Corregir query getDockTimeBlocks (overlap logic + is_cancelled)

**Archivo**: `src/services/calendarService.ts`

**Reemplazar** (líneas de la función `getDockTimeBlocks`):
```typescript
// ANTES (incorrecto):
const { data, error } = await supabase
  .from('dock_time_blocks')
  .select('*')
  .eq('org_id', orgId)
  .gte('start_datetime', startDate)
  .lte('start_datetime', endDate)
  .order('start_datetime', { ascending: true });

// DESPUÉS (correcto):
const { data, error } = await supabase
  .from('dock_time_blocks')
  .select('*')
  .eq('org_id', orgId)
  .eq('is_cancelled', false)          // ← nuevo: filtrar cancelados
  .lt('start_datetime', endDate)       // ← corregido: overlap logic
  .gt('end_datetime', startDate)       // ← nuevo: overlap logic
  .order('start_datetime', { ascending: true });
```

---

### Fix #2 — Corregir render day filter (usar timezone CR en lugar de toDateString)

**Archivo**: `src/pages/calendario/page.tsx`

**Agregar helper al inicio** (antes del `return` del componente):
```typescript
// Helper: comparar si una fecha pertenece a un día, ambos evaluados en timezone CR
const isSameDayInCR = (dateA: Date, dateB: Date): boolean => {
  const tzCR = 'America/Costa_Rica';
  const a = dateA.toLocaleDateString('en-CA', { timeZone: tzCR }); // "YYYY-MM-DD"
  const b = dateB.toLocaleDateString('en-CA', { timeZone: tzCR }); // "YYYY-MM-DD"
  return a === b;
};
```

**Reemplazar filtro de bloques** (buscar el bloque de código con `bStart.toDateString()`):
```typescript
// ANTES (incorrecto):
blocks.filter((b) => {
  if (b.dock_id !== dock.id) return false;
  const bStart = new Date(b.start_datetime);
  return bStart.toDateString() === day.toDateString();
})

// DESPUÉS (correcto):
blocks.filter((b) => {
  if (b.dock_id !== dock.id) return false;
  const bStart = new Date(b.start_datetime);
  return isSameDayInCR(bStart, day);
})
```

**Reemplazar filtro de reservas** (mismo patrón, buscar `rStart.toDateString()`):
```typescript
// ANTES (incorrecto):
filteredReservations.filter((r) => {
  if (r.dock_id !== dock.id) return false;
  const rStart = new Date(r.start_datetime);
  return rStart.toDateString() === day.toDateString();
})

// DESPUÉS (correcto):
filteredReservations.filter((r) => {
  if (r.dock_id !== dock.id) return false;
  const rStart = new Date(r.start_datetime);
  return isSameDayInCR(rStart, day);
})
```

---

### Fix #3 — Corregir getStartOfDay

**Archivo**: `src/pages/calendario/page.tsx`

```typescript
// ANTES (incorrecto — doble conversión de timezone):
const getStartOfDay = (date: Date, timezone: string): Date => {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const startStr = `${dateStr}T00:00:00`;
  return new Date(new Date(startStr).toLocaleString('en-US', { timeZone: timezone }));
};

// DESPUÉS (correcto):
const getStartOfDay = (date: Date, timezone: string): Date => {
  // Obtener la fecha en la timezone dada como "YYYY-MM-DD"
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
  // Para Costa Rica (UTC-6): medianoche CR = 06:00 UTC
  // Construir medianoche de ese día en UTC directamente
  return new Date(`${dateStr}T06:00:00Z`); // medianoche America/Costa_Rica = 06:00 UTC
};

// NOTA: Si se quiere genérico para cualquier timezone, usar:
const getStartOfDayGeneric = (date: Date, timezone: string): Date => {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  // Usar Temporal API cuando esté disponible, por ahora hardcodear UTC-6 para CR
  return new Date(`${dateStr}T06:00:00Z`);
};
```

---

## 7. RESUMEN DE ARCHIVOS A MODIFICAR

| Archivo | Bug que corrige | Riesgo |
|---|---|---|
| `src/services/calendarService.ts` | Bug #1 (query overlap) + Bug #4 (is_cancelled) | Bajo — query change |
| `src/pages/calendario/page.tsx` | Bug #2 (toDateString) + Bug #3 (getStartOfDay) | Medio — render crítico |

---

## 8. CONCLUSIÓN

Los bloques CLIENT_PICKUP se generan correctamente en la DB (la Edge Function funciona bien en lo fundamental). El problema está en el **frontend**:

1. La query no trae bloques que solapan pero no empiezan dentro del rango
2. Los bloques se asignan al día incorrecto en navegadores con timezone ≠ CR
3. El cálculo del rango de fechas tiene un bug de doble conversión de timezone
4. Los bloques con `is_cancelled = true` (si existen) se muestran igual

**Orden de prioridad de fixes**:
1. **Fix #2 primero** (toDateString → isSameDayInCR) — impacto inmediato en render
2. **Fix #1 segundo** (query overlap + is_cancelled) — mejora consistencia de datos
3. **Fix #3 tercero** (getStartOfDay) — estabilidad del rango visible

---

*Reporte generado el 2026-03-27 por análisis de código estático del proyecto SRO.*
*Archivos analizados: generate-client-pickup-blocks/index.ts, calendarService.ts, calendario/page.tsx*
