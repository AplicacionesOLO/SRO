# Mobile API — Segunda Capa v1

**Base URL:** `https://xypbohvarofufrdkfeaj.supabase.co/functions/v1`

**Implementada:** 2026-04-24  
**Propósito:** Catálogos (andenes, almacenes, clientes, proveedores) y registros de casetilla para la app móvil.  
**Autenticación:** JWT de Supabase (Bearer token) — igual que la primera capa.

> Ver `MOBILE_API_FIRST_LAYER.md` para autenticación, convenciones generales y la primera capa (reservas y estados).

---

## Índice

1. [GET /api-v1-docks](#1-get-api-v1-docks)
2. [GET /api-v1-warehouses](#2-get-api-v1-warehouses)
3. [GET /api-v1-clients](#3-get-api-v1-clients)
4. [GET /api-v1-providers](#4-get-api-v1-providers)
5. [GET /api-v1-casetilla-ingresos](#5-get-api-v1-casetilla-ingresos)
6. [GET /api-v1-casetilla-salidas](#6-get-api-v1-casetilla-salidas)
7. [Modelo de visibilidad](#modelo-de-visibilidad)
8. [Orden recomendado para Postman](#orden-recomendado-para-postman)
9. [Resumen completo de endpoints (Capas 1 y 2)](#resumen-completo-de-endpoints-capas-1-y-2)
10. [Roadmap Tercera Capa](#roadmap-tercera-capa)

---

## 1. GET /api-v1-docks

**Propósito:** Devolver los andenes visibles para el usuario autenticado, enriquecidos con el nombre del almacén al que pertenecen.

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-docks
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params opcionales:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `org_id` | UUID | (del JWT) | Organización. Se infiere del JWT si se omite |
| `warehouse_id` | UUID | — | Filtrar solo andenes de ese almacén |
| `is_active` | boolean | — | `true` o `false` |
| `page` | integer | 1 | Número de página |
| `page_size` | integer | 100 | Items por página (máx: 500) |

**Ejemplo de request (Postman):**
```
GET {{base_url}}/api-v1-docks?is_active=true&page=1&page_size=50
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": [
    {
      "id": "dock-uuid-001",
      "org_id": "org-uuid",
      "name": "Anden A1",
      "reference": "A1",
      "warehouse_id": "wh-uuid-001",
      "warehouse_name": "Almacen Central",
      "category_id": "cat-uuid-001",
      "status_id": "dock-status-uuid-001",
      "is_active": true
    },
    {
      "id": "dock-uuid-002",
      "org_id": "org-uuid",
      "name": "Anden B1",
      "reference": "B1",
      "warehouse_id": "wh-uuid-001",
      "warehouse_name": "Almacen Central",
      "category_id": "cat-uuid-001",
      "status_id": "dock-status-uuid-001",
      "is_active": true
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 50,
    "total": 2,
    "total_pages": 1,
    "org_id": "org-uuid"
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | Invalid or expired token | JWT inválido o expirado |
| 403 | User does not belong to any organization | Usuario sin org |
| 400 | Invalid org_id format | org_id no es UUID válido |
| 500 | Error fetching docks | Error de DB |

**Visibilidad:**
- Respeta el mismo scope de la primera capa: `user_warehouse_access (restricted)` → `client_docks` → `provider_docks`.
- `warehouse_id` como filtro es una restricción **adicional dentro** del scope. No puede ampliar acceso.
- Si el usuario no tiene acceso a ningún andén, devuelve `data: []`.

---

## 2. GET /api-v1-warehouses

**Propósito:** Devolver los almacenes visibles para el usuario autenticado con toda la info operativa (horarios, timezone, intervalo de slots).

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-warehouses
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params opcionales:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `org_id` | UUID | (del JWT) | Se infiere del JWT si se omite |
| `country_id` | UUID | — | Filtrar por país |
| `page` | integer | 1 | Número de página |
| `page_size` | integer | 100 | Items por página (máx: 500) |

**Ejemplo de request (Postman):**
```
GET {{base_url}}/api-v1-warehouses
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": [
    {
      "id": "wh-uuid-001",
      "org_id": "org-uuid",
      "name": "Almacen Central",
      "location": "Zona Industrial Norte, Km 15",
      "country_id": "country-uuid-001",
      "business_start_time": "07:00:00",
      "business_end_time": "18:00:00",
      "slot_interval_minutes": 30,
      "timezone": "America/Guatemala"
    },
    {
      "id": "wh-uuid-002",
      "org_id": "org-uuid",
      "name": "Almacen Norte",
      "location": "Zona Franca Norte, Bodega 3",
      "country_id": "country-uuid-001",
      "business_start_time": "06:00:00",
      "business_end_time": "20:00:00",
      "slot_interval_minutes": 60,
      "timezone": "America/Guatemala"
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 100,
    "total": 2,
    "total_pages": 1,
    "org_id": "org-uuid"
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | Invalid or expired token | JWT inválido |
| 403 | User does not belong to any organization | Sin org |
| 500 | Error fetching warehouses | Error de DB |

**Visibilidad:**
- Si el usuario tiene entradas en `user_warehouse_access` con `restricted = true` → solo esos almacenes.
- Si NO tiene entradas restricted → ve todos los almacenes de la org (usuario sin restricción de almacén).

---

## 3. GET /api-v1-clients

**Propósito:** Devolver los clientes visibles para el usuario autenticado.

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-clients
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params opcionales:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `org_id` | UUID | (del JWT) | Se infiere del JWT si se omite |
| `warehouse_id` | UUID | — | Filtrar clientes asociados a ese almacén (via `warehouse_clients`) |
| `is_active` | boolean | — | `true` o `false` |
| `page` | integer | 1 | Número de página |
| `page_size` | integer | 100 | Items por página (máx: 500) |

**Ejemplo de request (Postman):**
```
GET {{base_url}}/api-v1-clients?is_active=true
Authorization: Bearer {{access_token}}
```

**Con filtro de almacén:**
```
GET {{base_url}}/api-v1-clients?warehouse_id={{warehouse_id}}&is_active=true
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": [
    {
      "id": "client-uuid-001",
      "org_id": "org-uuid",
      "name": "Importadora XYZ S.A.",
      "legal_id": "1234567-8",
      "email": "contacto@xyz.com",
      "phone": "+502 2200-0000",
      "is_active": true
    },
    {
      "id": "client-uuid-002",
      "org_id": "org-uuid",
      "name": "Distribuidora ABC Ltda.",
      "legal_id": "9876543-2",
      "email": "ops@abc.com",
      "phone": "+502 2300-1111",
      "is_active": true
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 100,
    "total": 2,
    "total_pages": 1,
    "org_id": "org-uuid"
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | Invalid or expired token | JWT inválido |
| 403 | User does not belong to any organization | Sin org |
| 500 | Error fetching clients | Error de DB |

**Visibilidad:**
- Si el usuario tiene entradas en `user_clients` → solo esos clientes.
- Si NO tiene entradas → ve todos los clientes de la org.
- El filtro `warehouse_id` se calcula vía `warehouse_clients` e intersecta con el scope del usuario.

---

## 4. GET /api-v1-providers

**Propósito:** Devolver los proveedores visibles para el usuario autenticado.

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-providers
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params opcionales:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `org_id` | UUID | (del JWT) | Se infiere del JWT si se omite |
| `warehouse_id` | UUID | — | Filtrar proveedores asociados a ese almacén (via `provider_warehouses`) |
| `active` | boolean | — | `true` o `false` |
| `page` | integer | 1 | Número de página |
| `page_size` | integer | 100 | Items por página (máx: 500) |

**Ejemplo de request (Postman):**
```
GET {{base_url}}/api-v1-providers?active=true
Authorization: Bearer {{access_token}}
```

**Con filtro de almacén:**
```
GET {{base_url}}/api-v1-providers?warehouse_id={{warehouse_id}}&active=true
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": [
    {
      "id": "provider-uuid-001",
      "org_id": "org-uuid",
      "name": "Transportes Rapidos S.A.",
      "active": true
    },
    {
      "id": "provider-uuid-002",
      "org_id": "org-uuid",
      "name": "Logistica Express Ltda.",
      "active": true
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 100,
    "total": 2,
    "total_pages": 1,
    "org_id": "org-uuid"
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | Invalid or expired token | JWT inválido |
| 403 | User does not belong to any organization | Sin org |
| 500 | Error fetching providers | Error de DB |

**Visibilidad:**
- Si el usuario tiene entradas en `user_providers` → solo esos proveedores.
- Si NO tiene entradas → ve todos los proveedores de la org.
- El filtro `warehouse_id` intersecta con el scope vía `provider_warehouses`.

---

## 5. GET /api-v1-casetilla-ingresos

**Propósito:** Devolver los registros de **ingreso de casetilla** visibles para el usuario autenticado.  
Enriquecidos con datos de la reserva asociada: estado, andén, almacén y cliente.

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-casetilla-ingresos
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params opcionales:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `org_id` | UUID | (del JWT) | Se infiere del JWT si se omite |
| `from` | ISO datetime | — | Filtro: `created_at >= from` |
| `to` | ISO datetime | — | Filtro: `created_at <= to` |
| `warehouse_id` | UUID | — | Filtrar por almacén (via reserva → andén → almacén) |
| `reservation_id` | UUID | — | Filtrar por reserva específica |
| `matricula` | string | — | Búsqueda parcial case-insensitive (ILIKE) |
| `dua` | string | — | Búsqueda parcial case-insensitive (ILIKE) |
| `page` | integer | 1 | Número de página |
| `page_size` | integer | 50 | Items por página (máx: 200) |

**Ejemplo de request — Ingresos del mes:**
```
GET {{base_url}}/api-v1-casetilla-ingresos?from=2025-01-01T00:00:00Z&to=2025-01-31T23:59:59Z&page=1&page_size=20
Authorization: Bearer {{access_token}}
```

**Ejemplo de request — Buscar por matrícula:**
```
GET {{base_url}}/api-v1-casetilla-ingresos?matricula=P-1234
Authorization: Bearer {{access_token}}
```

**Ejemplo de request — Ingresos de una reserva específica:**
```
GET {{base_url}}/api-v1-casetilla-ingresos?reservation_id={{reservation_id}}
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": [
    {
      "id": "ingreso-uuid-001",
      "org_id": "org-uuid",
      "reservation_id": "res-uuid-001",
      "chofer": "Carlos Mendoza",
      "matricula": "P-123456",
      "dua": "DUA-2025-0012",
      "factura": "FAC-001-2025",
      "orden_compra": "OC-2025-001",
      "numero_pedido": "NP-001",
      "created_by": "user-uuid",
      "created_at": "2025-01-15T07:45:00+00:00",
      "fotos": [
        "https://storage.supabase.co/object/public/casetilla/foto1.jpg"
      ],
      "cedula": "1234567890101",
      "observaciones": "Llego 15 minutos antes. Sin novedad.",
      "reservation_status_id": "status-uuid-002",
      "reservation_status_name": "En proceso",
      "reservation_status_code": "IN_PROGRESS",
      "dock_id": "dock-uuid-001",
      "dock_name": "Anden A1",
      "dock_reference": "A1",
      "warehouse_id": "wh-uuid-001",
      "warehouse_name": "Almacen Central",
      "client_id": "client-uuid-001",
      "client_name": "Importadora XYZ S.A."
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 1,
    "total_pages": 1,
    "org_id": "org-uuid"
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | Invalid or expired token | JWT inválido |
| 403 | User does not belong to any organization | Sin org |
| 500 | Error fetching casetilla_ingresos | Error de DB |

**Notas de visibilidad:**
- El scope se resuelve igual que en reservas: `resolveVisibleDockIds` → reservas visibles → ingresos de esas reservas.
- Ingresos sin `reservation_id` (nullable en DB) no aparecen en esta API (no hay forma de verificar su scope).
- `from/to` filtra sobre `created_at` del registro de ingreso.
- `warehouse_id` filtra por almacén de la reserva asociada (via dock).

---

## 6. GET /api-v1-casetilla-salidas

**Propósito:** Devolver los registros de **salida de casetilla** visibles para el usuario autenticado.  
Enriquecidos con datos de la reserva asociada: estado, andén, almacén y cliente.

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-casetilla-salidas
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params opcionales:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `org_id` | UUID | (del JWT) | Se infiere del JWT si se omite |
| `from` | ISO datetime | — | Filtro: `exit_at >= from` *(hora real de salida)* |
| `to` | ISO datetime | — | Filtro: `exit_at <= to` |
| `warehouse_id` | UUID | — | Filtrar por almacén (via reserva → andén) |
| `reservation_id` | UUID | — | Filtrar por reserva específica |
| `matricula` | string | — | Búsqueda parcial case-insensitive (ILIKE) |
| `dua` | string | — | Búsqueda parcial case-insensitive (ILIKE) |
| `page` | integer | 1 | Número de página |
| `page_size` | integer | 50 | Items por página (máx: 200) |

**Diferencia clave vs ingresos:** el filtro `from/to` aplica sobre `exit_at` (la hora real en que el vehículo salió), no sobre `created_at`.

**Ejemplo de request — Salidas del día:**
```
GET {{base_url}}/api-v1-casetilla-salidas?from=2025-01-15T00:00:00Z&to=2025-01-15T23:59:59Z
Authorization: Bearer {{access_token}}
```

**Ejemplo de request — Cruzar con ingreso de la misma reserva:**
```
GET {{base_url}}/api-v1-casetilla-salidas?reservation_id={{reservation_id}}
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": [
    {
      "id": "salida-uuid-001",
      "org_id": "org-uuid",
      "reservation_id": "res-uuid-001",
      "chofer": "Carlos Mendoza",
      "matricula": "P-123456",
      "dua": "DUA-2025-0012",
      "exit_at": "2025-01-15T11:30:00+00:00",
      "created_by": "user-uuid",
      "created_at": "2025-01-15T11:30:00+00:00",
      "fotos": [
        "https://storage.supabase.co/object/public/casetilla/salida1.jpg"
      ],
      "reservation_status_id": "status-uuid-003",
      "reservation_status_name": "Completado",
      "reservation_status_code": "COMPLETED",
      "dock_id": "dock-uuid-001",
      "dock_name": "Anden A1",
      "dock_reference": "A1",
      "warehouse_id": "wh-uuid-001",
      "warehouse_name": "Almacen Central",
      "client_id": "client-uuid-001",
      "client_name": "Importadora XYZ S.A."
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 50,
    "total": 1,
    "total_pages": 1,
    "org_id": "org-uuid"
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | Invalid or expired token | JWT inválido |
| 403 | User does not belong to any organization | Sin org |
| 500 | Error fetching casetilla_salidas | Error de DB |

**Notas de visibilidad:**
- Misma lógica de scope que casetilla_ingresos.
- `from/to` filtra sobre `exit_at` (hora de salida real), no `created_at`.
- `matricula` y `dua` son búsquedas parciales.

---

## Modelo de visibilidad

Todos los endpoints de la segunda capa aplican la misma lógica de scope de la primera:

### Para andenes y casetilla (vía reserva):
```
1. user_org_roles → verifica org del usuario
2. user_warehouse_access (restricted=true) → almacenes permitidos (o todos si no hay restricción)
3. docks WHERE warehouse_id IN (almacenes permitidos) → andenes base
4. user_clients → client_docks → docks visibles por cliente (si existen)
5. user_providers → provider_warehouses → docks visibles por proveedor (si existen)
6. UNION de client_docks + provider_docks si ambos existen
7. Resultado: solo andenes en la intersección con el scope de almacén
```

### Para clientes:
```
1. user_clients → si existen, solo esos client_ids
2. Si no existen → todos los clientes de la org
3. warehouse_id filter → warehouse_clients → intersecta con scope del usuario
```

### Para proveedores:
```
1. user_providers → si existen, solo esos provider_ids
2. Si no existen → todos los proveedores de la org
3. warehouse_id filter → provider_warehouses → intersecta con scope del usuario
```

### Para almacenes:
```
1. user_warehouse_access (restricted=true) → si existen, solo esos warehouse_ids
2. Si no existen → todos los almacenes de la org
```

### Tabla resumen de casos

| Tipo de usuario | Andenes | Almacenes | Clientes | Proveedores |
|-----------------|---------|-----------|----------|-------------|
| Admin (sin restricciones) | Todos de la org | Todos de la org | Todos de la org | Todos de la org |
| Con `user_warehouse_access` restricted | Solo en sus almacenes | Solo sus almacenes | Todos (salvo filtro) | Todos (salvo filtro) |
| Con `user_clients` | Andenes de sus clientes | Todos (salvo restricted) | Solo sus clientes | Todos (salvo filtro) |
| Con `user_providers` | Andenes de sus proveedores | Todos (salvo restricted) | Todos (salvo filtro) | Solo sus proveedores |

---

## Orden recomendado para Postman

### Fase 1 — Obtener catálogos base (sin filtros)

```
1. GET {{base_url}}/api-v1-warehouses
   → guardar {{warehouse_id}} de algún almacén

2. GET {{base_url}}/api-v1-docks
   → guardar {{dock_id}} de algún andén

3. GET {{base_url}}/api-v1-clients
   → guardar {{client_id}}

4. GET {{base_url}}/api-v1-providers
   → guardar {{provider_id}}
```

### Fase 2 — Probar filtros de catálogos

```
5. GET {{base_url}}/api-v1-docks?warehouse_id={{warehouse_id}}&is_active=true
   → verificar que solo devuelve andenes del almacén filtrado

6. GET {{base_url}}/api-v1-clients?warehouse_id={{warehouse_id}}&is_active=true
   → clientes asociados a ese almacén

7. GET {{base_url}}/api-v1-providers?warehouse_id={{warehouse_id}}&active=true
   → proveedores de ese almacén
```

### Fase 3 — Casetilla sin filtros

```
8. GET {{base_url}}/api-v1-casetilla-ingresos?page=1&page_size=20
   → listar ingresos recientes

9. GET {{base_url}}/api-v1-casetilla-salidas?page=1&page_size=20
   → listar salidas recientes
```

### Fase 4 — Casetilla con filtros

```
10. GET {{base_url}}/api-v1-casetilla-ingresos?from=2025-01-01T00:00:00Z&to=2025-01-31T23:59:59Z
    → ingresos del mes

11. GET {{base_url}}/api-v1-casetilla-ingresos?matricula=P-123
    → búsqueda por matrícula parcial

12. GET {{base_url}}/api-v1-casetilla-ingresos?reservation_id={{reservation_id}}
    → ingreso de una reserva específica

13. GET {{base_url}}/api-v1-casetilla-salidas?reservation_id={{reservation_id}}
    → salida de la misma reserva (cruzar ingreso vs salida)

14. GET {{base_url}}/api-v1-casetilla-salidas?warehouse_id={{warehouse_id}}&from=2025-01-15T00:00:00Z&to=2025-01-15T23:59:59Z
    → salidas del día en un almacén
```

---

## Resumen completo de endpoints (Capas 1 y 2)

| # | Método | Endpoint | Propósito | Capa |
|---|--------|----------|-----------|------|
| 1 | GET | `/api-v1-reservation-statuses` | Estados activos de la org | 1 |
| 2 | GET | `/api-v1-reservations-get` | Listado paginado de reservas con filtros | 1 |
| 3 | GET | `/api-v1-reservations-get-by-id/{id}` | Detalle completo + activity log | 1 |
| 4 | PATCH | `/api-v1-reservations-patch-status/{id}/status` | Cambiar estado de reserva | 1 |
| 5 | GET | `/api-v1-docks` | Andenes visibles para el usuario | 2 |
| 6 | GET | `/api-v1-warehouses` | Almacenes visibles para el usuario | 2 |
| 7 | GET | `/api-v1-clients` | Clientes visibles para el usuario | 2 |
| 8 | GET | `/api-v1-providers` | Proveedores visibles para el usuario | 2 |
| 9 | GET | `/api-v1-casetilla-ingresos` | Ingresos de casetilla enriquecidos | 2 |
| 10 | GET | `/api-v1-casetilla-salidas` | Salidas de casetilla enriquecidas | 2 |

---

## Roadmap Tercera Capa

| Endpoint sugerido | Propósito | Prioridad |
|-------------------|-----------|-----------|
| `POST /api-v1-casetilla-ingresos` | Crear registro de ingreso desde app movil | Alta |
| `POST /api-v1-casetilla-salidas` | Crear registro de salida desde app movil | Alta |
| `GET /api-v1-dashboard-stats` | Estadisticas agregadas (reservas por estado, ocupacion) | Media |
| `GET /api-v1-reservations-get?date=today` | Reservas del dia actual (shortcut) | Media |
| Webhooks salientes | Notificar a app externa cuando cambia estado de reserva | Baja |
| API Keys propias | Autenticacion sin depender de JWT de usuario | Baja |

---

## Variables de entorno Postman (actualizado con segunda capa)

| Variable | Valor |
|----------|-------|
| `base_url` | `https://xypbohvarofufrdkfeaj.supabase.co/functions/v1` |
| `anon_key` | `<tu_supabase_anon_key>` |
| `user_email` | `<email_de_prueba>` |
| `user_password` | `<password_de_prueba>` |
| `access_token` | *(del login)* |
| `reservation_id` | *(de /api-v1-reservations-get)* |
| `warehouse_id` | *(de /api-v1-warehouses)* |
| `dock_id` | *(de /api-v1-docks)* |
| `client_id` | *(de /api-v1-clients)* |
| `provider_id` | *(de /api-v1-providers)* |
| `status_id_nuevo` | *(de /api-v1-reservation-statuses)* |
