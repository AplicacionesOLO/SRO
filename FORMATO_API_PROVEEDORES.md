# FORMATO API PROVEEDORES — SRO

## Versión: 1.0 | Fecha: 2026-07-13

Este documento describe los formatos de API disponibles para alimentar el módulo de Proveedores del sistema SRO. Incluye campos obligatorios, opcionales, reglas de negocio, restricciones y ejemplos completos.

---

## 1. Tabla Destino: `providers`

| # | Campo | Tipo | Obligatorio | Default | Descripción |
|---|-------|------|:----------:|---------|-------------|
| 1 | `org_id` | UUID | ✅ SÍ | — | ID de la organización dueña del proveedor |
| 2 | `name` | TEXT | ✅ SÍ | — | Nombre del proveedor (se normaliza a MAYÚSCULAS automáticamente) |
| 3 | `provider_code` | TEXT | ✅ SÍ | — | Código único del proveedor en el sistema de origen (ej: `PROV-001`, `10245`). Es el campo de matching principal. |
| 4 | `provider_type` | TEXT | NO | `'almacenaje'` | Tipo de proveedor. Solo acepta: `'almacenaje'` o `'pesado'` |
| 5 | `source` | TEXT | NO | `null` | Sistema de origen de los datos. Ej: `'EPA'`, `'COFERSA'`, `'BEVAL'`, `'FEBECA'`, `'SILLACA'`. Se usa para auto-detectar el cliente. |
| 6 | `source_code` | TEXT | NO | `null` | Código del sistema de origen. Normalmente igual a `source`. |
| 7 | `client_id` | UUID | NO | `null` | UUID del cliente SRO al que pertenece este proveedor. Se auto-detecta por `source_code` si no se envía. |
| 8 | `active` | BOOLEAN | NO | `true` | Estado del proveedor. `false` = inactivo (no aparece en selectores, pero su historial se conserva). |

### Campos autogenerados (NO se envían en la API)

| Campo | Generado por |
|-------|-------------|
| `id` | `gen_random_uuid()` — UUID v4 automático |
| `created_at` | `now()` — timestamp automático |
| `updated_at` | `now()` — timestamp automático |
| `created_by` | Sistema — UUID del usuario autenticado |
| `updated_by` | Sistema — UUID del usuario autenticado |
| `name_normalized` | Trigger — `UPPER(TRIM(name))` |
| `code_normalized` | Trigger — `UPPER(TRIM(provider_code))` |
| `source_normalized` | Trigger — `UPPER(TRIM(source))` |

---

## 2. API #1: Sincronización Masiva por Código (`sync-providers`)

**Usar cuando:** tenés una fuente externa que te manda la lista completa de proveedores y querés que el sistema sincronice (crea nuevos, actualiza existentes, desactiva los que ya no vienen).

### Endpoint

```
POST {SUPABASE_URL}/functions/v1/sync-providers
```

### Autenticación

Bearer JWT de Supabase (usuario autenticado de la organización).

### Request Body

```json
{
  "org_id": "550e8400-e29b-41d4-a716-446655440000",
  "source": "EPA",
  "client_id": "f897b0e2-721f-498d-a5d2-800dd3755139",
  "providers": [
    {
      "code": "PROV-001",
      "name": "TRANSPORTES RÁPIDOS S.A.",
      "short_name": "TRASA",
      "provider_type": "pesado"
    },
    {
      "code": "PROV-002",
      "name": "LOGÍSTICA UNIDA C.A.",
      "provider_type": "almacenaje"
    },
    {
      "code": "PROV-003",
      "name": "CARGA EXPRESS S.R.L."
    }
  ]
}
```

### Campos del Request

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `org_id` | UUID | ✅ SÍ | ID de la organización |
| `source` | string | ✅ SÍ | Sistema de origen (EPA, COFERSA, BEVAL, etc.) |
| `client_id` | UUID | NO | ID del cliente. Si no se envía, se auto-detecta por `source` usando la tabla `origen_proveedores` |
| `providers` | array | ✅ SÍ | Lista de proveedores a sincronizar |

### Campos de cada provider en el array

| Campo | Tipo | Obligatorio | Valores válidos | Descripción |
|-------|------|:----------:|-----------------|-------------|
| `code` | string | ✅ SÍ | Cualquier string no vacío | Código único del proveedor. **Es el campo de matching.** |
| `name` | string | ✅ SÍ | Cualquier string no vacío | Nombre del proveedor |
| `short_name` | string | NO | — | Nombre corto (no se persiste actualmente, reservado para uso futuro) |
| `provider_type` | string | NO | `"almacenaje"` o `"pesado"` | Tipo de proveedor. Default: `"almacenaje"` |

### Lógica de Sincronización

```
Para cada provider en el array:
  └─ ¿Existe un provider con el mismo provider_code en la org?
       ├─ SÍ → Si cambió name o provider_type → UPDATE
       │       Si no cambió nada → PRESERVED (no se toca)
       └─ NO  → INSERT (se crea nuevo)

Después de procesar todos:
  └─ Providers en BD que NO están en el array recibido → DESACTIVADOS (active = false)
```

### Response (200 OK)

```json
{
  "summary": {
    "total_api": 150,
    "matched": 120,
    "updated": 8,
    "created": 5,
    "deactivated": 3,
    "preserved": 112,
    "errors": 0
  },
  "details": {
    "matched": [
      { "id": "uuid-1", "name": "TRANSPORTES RÁPIDOS S.A.", "code": "PROV-001" }
    ],
    "created": [
      { "id": "uuid-new", "name": "NUEVO PROVEEDOR", "code": "PROV-099" }
    ],
    "updated": [
      { "id": "uuid-2", "name": "LOGÍSTICA UNIDA C.A.", "code": "PROV-002" }
    ],
    "deactivated": [
      { "id": "uuid-old", "name": "PROVEEDOR OBSOLETO", "code": "PROV-OLD" }
    ],
    "preserved": [
      { "id": "uuid-1", "name": "TRANSPORTES RÁPIDOS S.A.", "code": "PROV-001" }
    ],
    "errors": []
  }
}
```

### Response Campos del Summary

| Campo | Significado |
|-------|-------------|
| `total_api` | Cantidad de proveedores recibidos en el request |
| `matched` | Proveedores que ya existían en BD (tengan o no cambios) |
| `updated` | Proveedores existentes que fueron actualizados (cambió name o provider_type) |
| `created` | Proveedores nuevos insertados |
| `deactivated` | Proveedores que estaban activos en BD pero NO venían en el request (se desactivaron) |
| `preserved` | Proveedores existentes sin cambios (no se tocaron) |
| `errors` | Cantidad de errores durante el proceso |

---

## 3. API #2: Carga Masiva desde Excel/CSV (`sync-providers-excel`)

**Usar cuando:** tenés un archivo Excel o CSV con proveedores, posiblemente con código, nombre, origen y tipo. Esta API está diseñada para importaciones manuales con reglas de validación estrictas.

### Endpoint

```
POST {SUPABASE_URL}/functions/v1/sync-providers-excel
```

### Autenticación

Bearer JWT de Supabase (usuario autenticado de la organización).

### Request Body

```json
{
  "org_id": "550e8400-e29b-41d4-a716-446655440000",
  "warehouse_id": "660e8400-e29b-41d4-a716-446655440001",
  "source": "BEVAL",
  "providers": [
    {
      "name": "TRANSPORTES RÁPIDOS S.A.",
      "provider_code": "PROV-001",
      "source": "BEVAL",
      "provider_type": "pesado"
    },
    {
      "name": "LOGÍSTICA UNIDA C.A.",
      "provider_code": "PROV-002",
      "source": "BEVAL",
      "provider_type": "almacenaje"
    },
    {
      "name": "CARGA EXPRESS S.R.L.",
      "provider_code": "PROV-003",
      "source": "BEVAL"
    }
  ]
}
```

### Campos del Request

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `org_id` | UUID | ✅ SÍ | ID de la organización |
| `warehouse_id` | UUID | NO | Si se envía, todos los proveedores se vinculan automáticamente a este almacén |
| `source` | string | NO | Sistema de origen general (se usa como fallback si un provider no tiene su propio source) |
| `providers` | array | ✅ SÍ | Lista de proveedores |

### Campos de cada provider en el array

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `name` | string | ✅ SÍ | Nombre del proveedor |
| `provider_code` | string | ✅ SÍ | Código del proveedor. **Filas sin código son RECHAZADAS.** |
| `source` | string | NO | Origen de este proveedor específico. Se usa para matching compuesto: `name + source` |
| `provider_type` | string | NO | `"almacenaje"` o `"pesado"`. Default: `"almacenaje"` |

### Reglas de Validación (IMPORTANTE)

1. **Sin código = RECHAZADO**: Si `provider_code` está vacío o no se envía, la fila se rechaza con motivo `"Falta el código del proveedor"`.
2. **Duplicados en el mismo batch**: Si dos filas tienen el mismo `name + source`, solo se procesa la primera. Las demás se rechazan.
3. **Matching por name + source**: A diferencia de `sync-providers` que matchea por código, esta API matchea por la combinación `nombre + origen`. Dos proveedores con el mismo nombre pero distinto origen se consideran diferentes.
4. **Vínculo a almacén**: Si se envió `warehouse_id`, todos los proveedores (nuevos y existentes) se vinculan a ese almacén en `provider_warehouses`.

### Response (200 OK)

```json
{
  "total": 150,
  "processed": 145,
  "rejectedMissingCode": 2,
  "rejectedDuplicateInExcel": 3,
  "inserted": 5,
  "updated": 8,
  "preserved": 132,
  "errors": 0,
  "details": {
    "created": [
      { "id": "uuid-new", "name": "NUEVO PROVEEDOR", "code": "PROV-099", "source": "BEVAL" }
    ],
    "updated": [
      { "id": "uuid-2", "name": "LOGÍSTICA UNIDA C.A.", "code": "PROV-002", "source": "BEVAL" }
    ],
    "preserved": [
      { "id": "uuid-1", "name": "TRANSPORTES RÁPIDOS S.A.", "code": "PROV-001", "source": "BEVAL" }
    ],
    "rejectedMissingCode": [
      { "name": "SIN CODIGO S.A.", "provider_code": "", "source": "BEVAL", "reason": "Falta el código del proveedor" }
    ],
    "rejectedDuplicateInExcel": [
      { "name": "DUPLICADO S.A.", "provider_code": "PROV-999", "source": "BEVAL", "firstCode": "PROV-001", "reason": "Duplicado en Excel..." }
    ],
    "errors": []
  }
}
```

---

## 4. API #3: Consulta de Proveedores (`api-v1-providers`)

**Usar cuando:** necesitás leer/consultar los proveedores existentes desde un sistema externo.

### Endpoint

```
GET {SUPABASE_URL}/functions/v1/api-v1-providers
```

### Autenticación

Bearer JWT de Supabase (usuario autenticado de la organización).

### Query Parameters

| Parámetro | Tipo | Obligatorio | Default | Descripción |
|-----------|------|:----------:|---------|-------------|
| `org_id` | UUID | NO | Se infiere del usuario | ID de la organización |
| `page` | integer | NO | `1` | Número de página (mínimo 1) |
| `page_size` | integer | NO | `100` | Registros por página (mín 1, máx 500) |
| `warehouse_id` | UUID | NO | — | Filtra solo proveedores vinculados a este almacén |
| `active` | boolean | NO | — | `true` = solo activos, `false` = solo inactivos. Sin el param = todos |

### Ejemplo de Request

```
GET {SUPABASE_URL}/functions/v1/api-v1-providers?org_id=550e8400-e29b-41d4-a716-446655440000&page=1&page_size=50&active=true
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
```

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "TRANSPORTES RÁPIDOS S.A.",
      "active": true,
      "provider_type": "pesado",
      "provider_code": "PROV-001",
      "source": "EPA",
      "client_id": "f897b0e2-721f-498d-a5d2-800dd3755139"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "LOGÍSTICA UNIDA C.A.",
      "active": true,
      "provider_type": "almacenaje",
      "provider_code": "PROV-002",
      "source": "COFERSA",
      "client_id": "ae488aaf-706a-46fa-9251-d00a35e78384"
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 50,
    "total": 245,
    "total_pages": 5,
    "org_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## 5. Tablas Relacionadas (Referencia)

Estas tablas se usan para enriquecer al proveedor con almacenes, clientes, perfiles de tiempo, y clusters. No se alimentan directamente desde las APIs de sync (excepto el vínculo a almacén en `sync-providers-excel`).

### 5.1 `provider_warehouses` — Vínculo Proveedor → Almacén

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `org_id` | UUID | ✅ | ID de la organización |
| `provider_id` | UUID | ✅ | ID del proveedor |
| `warehouse_id` | UUID | ✅ | ID del almacén |

**Unique constraint:** `(org_id, provider_id, warehouse_id)`

### 5.2 `client_providers` — Vínculo Proveedor → Cliente

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `org_id` | UUID | ✅ | ID de la organización |
| `provider_id` | UUID | ✅ | ID del proveedor |
| `client_id` | UUID | ✅ | ID del cliente |
| `is_default` | BOOLEAN | ✅ | ¿Es el cliente principal de este proveedor? |

### 5.3 `provider_cargo_time_profiles` — Perfil de Tiempo por Tipo de Carga

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `org_id` | UUID | ✅ | ID de la organización |
| `provider_id` | UUID | ✅ | ID del proveedor |
| `cargo_type_id` | UUID | ✅ | ID del tipo de carga |
| `warehouse_id` | UUID | NO | ID del almacén (null = aplica a todos) |
| `avg_minutes` | INTEGER | ✅ | Minutos promedio para este tipo de carga |
| `p90_minutes` | INTEGER | NO | Percentil 90 de duración |
| `sample_size` | INTEGER | ✅ | Tamaño de la muestra estadística |
| `seconds_per_unit` | NUMERIC | NO | Segundos por unidad (para tipos de carga dinámicos) |
| `source` | TEXT | ✅ | Origen de los datos (ej: `'calculated'`, `'manual'`) |
| `confidence` | TEXT | ✅ | Nivel de confianza (ej: `'high'`, `'medium'`, `'low'`) |

### 5.4 `provider_clusters` + `provider_cluster_items` — Agrupación de Proveedores

**`provider_clusters`:**
| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `id` | UUID | ✅ | ID del cluster |
| `org_id` | UUID | ✅ | ID de la organización |
| `client_id` | UUID | ✅ | Cliente dueño del cluster |
| `name` | TEXT | ✅ | Nombre del cluster (ej: `"Transportistas优先"`) |
| `is_active` | BOOLEAN | ✅ | Estado del cluster |

**`provider_cluster_items`:**
| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `org_id` | UUID | ✅ | ID de la organización |
| `cluster_id` | UUID | ✅ | ID del cluster |
| `provider_id` | UUID | ✅ | ID del proveedor miembro |

### 5.5 `origen_proveedores` — Mapeo Source Code → Cliente

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:----------:|-------------|
| `org_id` | UUID | ✅ | ID de la organización |
| `source_code` | TEXT | ✅ | Código de origen (ej: `'029'`, `'0109'`, `'0001'`) |
| `client_id` | UUID | ✅ | Cliente asociado a ese código de origen |
| `description` | TEXT | NO | Descripción legible |
| `is_active` | BOOLEAN | NO | Estado del mapeo |

---

## 6. Valores de `provider_type` y `source`

### `provider_type` (ENUM implícito)

| Valor | Significado |
|-------|-------------|
| `almacenaje` | Proveedor de almacenaje / carga general |
| `pesado` | Proveedor de carga pesada / maquinaria |

### `source` (valores típicos usados en el sistema)

| Código | Sistema de Origen | Cliente asociado |
|--------|-------------------|------------------|
| `EPA` | Sistema EPA | Cofersa |
| `COFERSA` | Sistema Cofersa | EPA |
| `BEVAL` | Sistema BEVAL | BEVAL |
| `FEBECA` | Sistema FEBECA | Febeca C.A. |
| `SILLACA` | Sistema SILLACA | Sillaca S.A. |
| `029` / `0029` | Código numérico EPA | Cofersa |
| `0109` | Código numérico COFERSA | EPA |
| `0001` / `001` | Código numérico FEBECA | Febeca C.A. |
| `0002` / `002` | Código numérico SILLACA | Sillaca S.A. |
| `0003` / `003` | Código numérico BEVAL | BEVAL |

---

## 7. Ejemplos Prácticos

### Ejemplo A: Sincronización diaria desde ERP (usando `sync-providers`)

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/sync-providers" \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "source": "EPA",
    "providers": [
      {"code": "00102", "name": "TRANSPORTES EL TREBOL S.A.", "provider_type": "pesado"},
      {"code": "00103", "name": "CARGA PESADA EXPRESS C.A.", "provider_type": "pesado"},
      {"code": "00104", "name": "LOGÍSTICA INTEGRAL S.R.L.", "provider_type": "almacenaje"}
    ]
  }'
```

**Resultado esperado:**
- Proveedores `00102`, `00103`, `00104` se crean o actualizan según existan.
- Cualquier proveedor activo de EPA que NO esté en esta lista se desactiva automáticamente.

---

### Ejemplo B: Importación desde Excel (usando `sync-providers-excel`)

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/sync-providers-excel" \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "warehouse_id": "660e8400-e29b-41d4-a716-446655440001",
    "source": "BEVAL",
    "providers": [
      {"name": "TRANS DEL NORTE", "provider_code": "TDN-001", "source": "BEVAL", "provider_type": "almacenaje"},
      {"name": "FLETES UNIDOS",   "provider_code": "FLU-002", "source": "BEVAL", "provider_type": "pesado"},
      {"name": "CARGA RAPIDA",    "provider_code": "CAR-003", "source": "BEVAL"}
    ]
  }'
```

**Resultado esperado:**
- Los 3 proveedores se crean/actualizan y se vinculan al almacén `660e8400-...`.
- Si alguno viniera sin `provider_code`, sería rechazado.
- Si hubiera duplicados `name + source` dentro del mismo batch, solo el primero se procesa.

---

### Ejemplo C: Consulta paginada de proveedores activos (usando `api-v1-providers`)

```bash
curl -X GET "{SUPABASE_URL}/functions/v1/api-v1-providers?org_id=550e8400-e29b-41d4-a716-446655440000&page=1&page_size=25&active=true" \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

---

## 8. Diferencia entre `sync-providers` y `sync-providers-excel`

| Característica | `sync-providers` | `sync-providers-excel` |
|---------------|------------------|------------------------|
| **Campo de matching** | `provider_code` | `name + source` |
| **Desactiva ausentes** | ✅ Sí (los que no vienen se ponen `active = false`) | ❌ No (solo crea/actualiza, nunca desactiva) |
| **Rechaza sin código** | ❌ No (el código es obligatorio en el payload) | ✅ Sí (filas sin código se rechazan explícitamente) |
| **Detección de duplicados** | ❌ No | ✅ Sí (name + source repetido en el mismo batch) |
| **Vínculo a almacén** | ❌ No | ✅ Sí (si se envía `warehouse_id`) |
| **Uso típico** | Sincronización automatizada periódica desde ERP | Importación manual única desde archivo Excel/CSV |
| **Cliente auto-detectado** | Por `source` global del request | Por `source` de cada provider individual |

---

## 9. Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `"Invalid or expired token"` | JWT inválido o expirado | Renovar el token de acceso |
| `"User does not belong to the specified organization"` | El usuario no es miembro de esa org | Verificar `user_org_roles` |
| `"Invalid org_id format"` | UUID mal formado | Usar formato UUID v4 estándar |
| `"Falta el código del proveedor"` (excel) | `provider_code` vacío | Todas las filas deben tener código |
| `"Duplicado en Excel"` (excel) | Mismo `name + source` repetido | Eliminar duplicados del archivo origen |
| Proveedores desaparecen después de sync | `sync-providers` desactiva los que no vienen | Usar `sync-providers-excel` si no querés desactivar |
| `400 Bad Request` por URL muy larga en consultas | Demasiados IDs en `WHERE IN` | Usar paginación o filtros más específicos |

---

## 10. Resumen Rápido para Integración

Si estás armando una integración desde cero, este es el camino recomendado:

1. **Para sync automatizado periódico** → usá `POST /sync-providers`
   - Mandá todos los proveedores activos de tu sistema
   - El sistema matchea por `code`, actualiza nombres/tipos, y desactiva los que ya no existen

2. **Para carga manual desde archivo** → usá `POST /sync-providers-excel`
   - Mandá `warehouse_id` si querés vincularlos a un almacén automáticamente
   - El sistema matchea por `name + source`, rechaza duplicados y filas sin código

3. **Para consultar proveedores** → usá `GET /api-v1-providers`
   - Paginado, filtrable por almacén y estado activo/inactivo

4. **Para alimentar `origen_proveedores`** (mapeo source_code → cliente):
   - Se gestiona desde el panel de administración: Catálogos → Origen Proveedores
   - Si necesitás una API para esto, solicitá el desarrollo del endpoint

---

*Fin del documento — FORMATO_API_PROVEEDORES.md*