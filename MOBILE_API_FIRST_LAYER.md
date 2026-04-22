# Mobile API — Primera Capa v1

**Base URL:** `https://xypbohvarofufrdkfeaj.supabase.co/functions/v1`

**Versión:** 1.0  
**Fecha:** 2026-04-22  
**Autenticación:** JWT de Supabase (Bearer token)

---

## Índice

1. [Autenticación](#autenticación)
2. [Convenciones generales](#convenciones-generales)
3. [Endpoints](#endpoints)
   - [GET /api-v1-reservation-statuses](#1-get-api-v1-reservation-statuses)
   - [GET /api-v1-reservations-get](#2-get-api-v1-reservations-get)
   - [GET /api-v1-reservations-get-by-id/{id}](#3-get-api-v1-reservations-get-by-idid)
   - [PATCH /api-v1-reservations-patch-status/{id}/status](#4-patch-api-v1-reservations-patch-statusidstatus)
4. [Modelo de visibilidad y permisos](#modelo-de-visibilidad-y-permisos)
5. [Códigos de error comunes](#códigos-de-error-comunes)
6. [Orden recomendado para probar en Postman](#orden-recomendado-para-probar-en-postman)
7. [Variables de entorno para Postman](#variables-de-entorno-para-postman)

---

## Autenticación

Todos los endpoints requieren un JWT válido de Supabase en el header `Authorization`.

```
Authorization: Bearer <supabase_access_token>
```

**Cómo obtener el token:**

```http
POST https://xypbohvarofufrdkfeaj.supabase.co/auth/v1/token?grant_type=password
Content-Type: application/json
apikey: <supabase_anon_key>

{
  "email": "usuario@ejemplo.com",
  "password": "contraseña"
}
```

La respuesta incluye `access_token` — ese es el Bearer token a usar en todos los endpoints.

> **Nota:** El token expira. Si recibes `401 Invalid or expired token`, debes re-autenticarte.

---

## Convenciones generales

| Aspecto | Detalle |
|---------|---------|
| Formato | JSON (`Content-Type: application/json`) |
| Paginación | `page` (1-based) + `page_size` (máx 200) |
| Fechas | ISO 8601 con timezone (`2025-01-15T08:00:00+00:00`) |
| IDs | UUID v4 |
| Errores | `{ "error": "mensaje", "details": "..." }` |
| Éxito | `{ "data": ..., "meta": ... }` |

---

## Endpoints

---

### 1. GET /api-v1-reservation-statuses

**Propósito:** Obtener todos los estados activos de reserva disponibles para la organización del usuario autenticado.

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-reservation-statuses
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params opcionales:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `org_id` | UUID | Organización. Si se omite, se infiere del JWT automáticamente. |

**Ejemplo de request (Postman):**
```
GET {{base_url}}/api-v1-reservation-statuses
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Pendiente",
      "code": "PENDING",
      "color": "#F59E0B",
      "order_index": 1,
      "is_active": true
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "En proceso",
      "code": "IN_PROGRESS",
      "color": "#3B82F6",
      "order_index": 2,
      "is_active": true
    },
    {
      "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "name": "Completado",
      "code": "COMPLETED",
      "color": "#10B981",
      "order_index": 3,
      "is_active": true
    }
  ],
  "meta": {
    "org_id": "org-uuid-aqui",
    "count": 3
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | Invalid or expired token | JWT inválido o expirado |
| 403 | User does not belong to any organization | Usuario sin org asignada |
| 400 | Invalid org_id format | org_id no es UUID válido |

**Notas:**
- Solo devuelve estados con `is_active = true`.
- Ordenados por `order_index` ascendente.
- Usar estos IDs para filtrar reservas o para el PATCH de estado.

---

### 2. GET /api-v1-reservations-get

**Propósito:** Listar reservas visibles para el usuario autenticado, con datos enriquecidos (nombres de andén, almacén, cliente, estado).

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-reservations-get
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `org_id` | UUID | No | Se infiere del JWT si se omite |
| `from` | ISO datetime | No | Filtro: `start_datetime >= from` |
| `to` | ISO datetime | No | Filtro: `end_datetime <= to` |
| `warehouse_id` | UUID | No | Filtrar por almacén |
| `dock_id` | UUID | No | Filtrar por andén específico |
| `status_id` | UUID | No | Filtrar por estado |
| `is_cancelled` | boolean | No | `true` o `false` |
| `client_id` | UUID | No | Filtrar por cliente |
| `page` | integer | No | Página (default: 1) |
| `page_size` | integer | No | Items por página (default: 50, máx: 200) |

**Ejemplo de request (Postman):**
```
GET {{base_url}}/api-v1-reservations-get?from=2025-01-01T00:00:00Z&to=2025-01-31T23:59:59Z&page=1&page_size=20
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": [
    {
      "id": "res-uuid-001",
      "org_id": "org-uuid",
      "dock_id": "dock-uuid-001",
      "dock_name": "Andén A1",
      "dock_reference": "A1",
      "warehouse_id": "wh-uuid-001",
      "warehouse_name": "Almacén Central",
      "start_datetime": "2025-01-15T08:00:00+00:00",
      "end_datetime": "2025-01-15T10:00:00+00:00",
      "status_id": "status-uuid-001",
      "status_name": "Pendiente",
      "status_code": "PENDING",
      "status_color": "#F59E0B",
      "is_cancelled": false,
      "cancel_reason": null,
      "cancelled_by": null,
      "cancelled_at": null,
      "dua": "DUA-2025-001",
      "invoice": "FAC-001",
      "driver": "Juan Pérez",
      "truck_plate": "ABC-1234",
      "purchase_order": "PO-2025-001",
      "order_request_number": "ORD-001",
      "shipper_provider": "Transportes XYZ",
      "client_id": "client-uuid-001",
      "client_name": "Cliente Ejemplo S.A.",
      "operation_type": "IMPORT",
      "is_imported": true,
      "bl_number": "BL-2025-001",
      "quantity_value": 50,
      "notes": "Carga frágil",
      "transport_type": "TRUCK",
      "cargo_type": "GENERAL",
      "created_by": "user-uuid",
      "created_at": "2025-01-10T14:30:00+00:00",
      "updated_by": null,
      "updated_at": "2025-01-10T14:30:00+00:00"
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
| 400 | Invalid org_id format | UUID inválido |
| 500 | Error fetching reservations | Error de DB |

**Notas de visibilidad:**
- El sistema aplica automáticamente el scope del usuario (ver sección [Modelo de visibilidad](#modelo-de-visibilidad-y-permisos)).
- Si el usuario no tiene acceso a ningún andén, devuelve `data: []` con `total: 0`.
- Los filtros `warehouse_id`, `dock_id`, `client_id` se aplican **dentro** del scope del usuario — no pueden ampliar el acceso.

---

### 3. GET /api-v1-reservations-get-by-id/{id}

**Propósito:** Obtener el detalle completo de una reserva específica, incluyendo datos enriquecidos y log de actividad reciente.

**URL completa:**
```
GET https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-reservations-get-by-id/{reservation_id}
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Path params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `reservation_id` | UUID | Sí | ID de la reserva |

**Ejemplo de request (Postman):**
```
GET {{base_url}}/api-v1-reservations-get-by-id/res-uuid-001
Authorization: Bearer {{access_token}}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": {
    "id": "res-uuid-001",
    "org_id": "org-uuid",
    "dock_id": "dock-uuid-001",
    "dock_name": "Andén A1",
    "dock_reference": "A1",
    "warehouse_id": "wh-uuid-001",
    "warehouse_name": "Almacén Central",
    "warehouse_location": "Zona Industrial Norte",
    "warehouse_timezone": "America/Guatemala",
    "start_datetime": "2025-01-15T08:00:00+00:00",
    "end_datetime": "2025-01-15T10:00:00+00:00",
    "status_id": "status-uuid-001",
    "status_name": "Pendiente",
    "status_code": "PENDING",
    "status_color": "#F59E0B",
    "status_order_index": 1,
    "is_cancelled": false,
    "cancel_reason": null,
    "cancelled_by": null,
    "cancelled_at": null,
    "dua": "DUA-2025-001",
    "invoice": "FAC-001",
    "driver": "Juan Pérez",
    "truck_plate": "ABC-1234",
    "purchase_order": "PO-2025-001",
    "order_request_number": "ORD-001",
    "shipper_provider": "Transportes XYZ",
    "client_id": "client-uuid-001",
    "client_name": "Cliente Ejemplo S.A.",
    "client_email": "contacto@cliente.com",
    "client_phone": "+502 1234-5678",
    "operation_type": "IMPORT",
    "is_imported": true,
    "bl_number": "BL-2025-001",
    "quantity_value": 50,
    "notes": "Carga frágil",
    "transport_type": "TRUCK",
    "cargo_type": "GENERAL",
    "recurrence": null,
    "created_by": "user-uuid",
    "created_at": "2025-01-10T14:30:00+00:00",
    "updated_by": null,
    "updated_at": "2025-01-10T14:30:00+00:00",
    "activity_log": [
      {
        "id": "log-uuid-001",
        "event_type": "reservation_status_changed",
        "field_name": "status_id",
        "old_value": "status-uuid-000",
        "new_value": "status-uuid-001",
        "changed_by": "user-uuid",
        "changed_at": "2025-01-10T15:00:00+00:00"
      }
    ]
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | Invalid or missing reservation_id in path | UUID inválido en path |
| 401 | Invalid or expired token | JWT inválido |
| 403 | User does not belong to any organization | Sin org |
| 404 | Reservation not found or not accessible | No existe o fuera del scope |
| 500 | Error fetching reservation | Error de DB |

**Notas:**
- Incluye `activity_log` con los últimos 20 eventos de la reserva.
- Incluye datos extendidos del almacén (`warehouse_location`, `warehouse_timezone`).
- Incluye datos de contacto del cliente (`client_email`, `client_phone`).
- Si la reserva existe pero está fuera del scope del usuario, devuelve `404` (no `403`) para no revelar existencia.

---

### 4. PATCH /api-v1-reservations-patch-status/{id}/status

**Propósito:** Cambiar el estado de una reserva desde la app móvil.

**URL completa:**
```
PATCH https://xypbohvarofufrdkfeaj.supabase.co/functions/v1/api-v1-reservations-patch-status/{reservation_id}/status
```

**Headers requeridos:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Path params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `reservation_id` | UUID | Sí | ID de la reserva a actualizar |

**Body:**
```json
{
  "status_id": "uuid-del-nuevo-estado"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `status_id` | UUID | Sí | ID del nuevo estado (debe pertenecer a la org y estar activo) |

**Ejemplo de request (Postman):**
```
PATCH {{base_url}}/api-v1-reservations-patch-status/res-uuid-001/status
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "status_id": "status-uuid-002"
}
```

**Ejemplo de response exitoso (200):**
```json
{
  "data": {
    "id": "res-uuid-001",
    "status_id": "status-uuid-002",
    "updated_by": "user-uuid",
    "updated_at": "2025-01-15T10:30:00.000Z"
  }
}
```

**Errores posibles:**

| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | Missing or invalid status_id in body | status_id ausente o no UUID |
| 400 | status_id not found in this organization | Estado no pertenece a la org |
| 400 | Cannot assign an inactive status | Estado inactivo |
| 401 | Invalid or expired token | JWT inválido |
| 403 | User does not belong to any organization | Sin org |
| 404 | Reservation not found or not accessible | No existe o fuera del scope |
| 405 | Method not allowed | Método HTTP incorrecto |
| 409 | Cannot update status of a cancelled reservation | Reserva cancelada |
| 500 | Failed to update reservation status | Error de DB |

**Notas:**
- El cambio de estado queda registrado automáticamente en `reservation_activity_log`.
- No se puede cambiar el estado de una reserva cancelada (`is_cancelled = true`).
- El `status_id` debe pertenecer a la misma organización del usuario y estar activo.
- El campo `updated_by` se setea automáticamente con el `user_id` del JWT.

---

## Modelo de visibilidad y permisos

La API aplica automáticamente el scope del usuario en cada request. No es necesario enviar parámetros de scope — se resuelven desde el JWT.

### Lógica de resolución de andenes visibles

```
1. user_org_roles → verifica que el usuario pertenece a la org
2. user_warehouse_access (restricted=true) → si existen, solo esos almacenes
   Si no hay entradas restricted=true → el usuario ve todos los almacenes de la org
3. docks WHERE warehouse_id IN (almacenes permitidos) → andenes base
4. user_clients → si existen, filtra andenes via client_docks
5. user_providers → si existen, filtra andenes via provider_warehouses → docks
6. Si hay scope de cliente Y proveedor → se hace UNION de ambos
7. Resultado: solo reservas cuyo dock_id esté en el conjunto final
```

### Tabla de casos de scope

| Tipo de usuario | Acceso resultante |
|-----------------|-------------------|
| Admin / sin restricciones | Todas las reservas de la org |
| Usuario con `user_warehouse_access` restricted | Solo reservas en sus almacenes |
| Usuario con `user_clients` | Solo reservas en andenes de sus clientes |
| Usuario con `user_providers` | Solo reservas en almacenes de sus proveedores |
| Usuario con clientes + proveedores | Unión de ambos scopes |

### Importante

- Los filtros de query params (`warehouse_id`, `dock_id`, `client_id`) se aplican **dentro** del scope — no pueden ampliar el acceso.
- Si un usuario intenta acceder a una reserva fuera de su scope, recibe `404` (no `403`) para no revelar existencia de datos.

---

## Códigos de error comunes

| HTTP | Significado | Acción recomendada |
|------|-------------|-------------------|
| 400 | Bad Request — parámetro inválido | Revisar formato de UUIDs, body JSON |
| 401 | Unauthorized — token inválido/expirado | Re-autenticar y obtener nuevo token |
| 403 | Forbidden — sin acceso a la org | Verificar que el usuario tiene rol en la org |
| 404 | Not Found — recurso no existe o fuera de scope | Verificar ID y permisos del usuario |
| 405 | Method Not Allowed | Usar el método HTTP correcto |
| 409 | Conflict — operación no permitida en estado actual | Leer el mensaje de error |
| 500 | Internal Server Error | Reportar con `details` del response |

---

## Orden recomendado para probar en Postman

### Paso 1 — Autenticarse y obtener token

```http
POST https://xypbohvarofufrdkfeaj.supabase.co/auth/v1/token?grant_type=password
Content-Type: application/json
apikey: {{anon_key}}

{
  "email": "{{user_email}}",
  "password": "{{user_password}}"
}
```

Guardar `access_token` en variable de entorno `{{access_token}}`.

---

### Paso 2 — Obtener estados disponibles

```http
GET {{base_url}}/api-v1-reservation-statuses
Authorization: Bearer {{access_token}}
```

Guardar un `id` de estado en `{{status_id_pendiente}}` para usar en filtros y PATCH.

---

### Paso 3 — Listar reservas (sin filtros)

```http
GET {{base_url}}/api-v1-reservations-get?page=1&page_size=10
Authorization: Bearer {{access_token}}
```

Guardar un `id` de reserva en `{{reservation_id}}`.

---

### Paso 4 — Listar reservas con filtros

```http
GET {{base_url}}/api-v1-reservations-get?from=2025-01-01T00:00:00Z&to=2025-12-31T23:59:59Z&is_cancelled=false&page=1&page_size=20
Authorization: Bearer {{access_token}}
```

---

### Paso 5 — Obtener detalle de una reserva

```http
GET {{base_url}}/api-v1-reservations-get-by-id/{{reservation_id}}
Authorization: Bearer {{access_token}}
```

---

### Paso 6 — Cambiar estado de una reserva

```http
PATCH {{base_url}}/api-v1-reservations-patch-status/{{reservation_id}}/status
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "status_id": "{{status_id_nuevo}}"
}
```

---

### Paso 7 — Verificar el cambio

```http
GET {{base_url}}/api-v1-reservations-get-by-id/{{reservation_id}}
Authorization: Bearer {{access_token}}
```

Verificar que `status_id`, `status_name` y `activity_log` reflejan el cambio.

---

## Variables de entorno para Postman

Crear un Environment en Postman con estas variables:

| Variable | Valor |
|----------|-------|
| `base_url` | `https://xypbohvarofufrdkfeaj.supabase.co/functions/v1` |
| `anon_key` | `<tu_supabase_anon_key>` |
| `user_email` | `<email_de_prueba>` |
| `user_password` | `<password_de_prueba>` |
| `access_token` | *(se llena automáticamente en Paso 1)* |
| `reservation_id` | *(se llena en Paso 3)* |
| `status_id_nuevo` | *(se llena en Paso 2)* |

---

## Resumen de endpoints desplegados

| # | Método | Endpoint | Propósito |
|---|--------|----------|-----------|
| 1 | GET | `/api-v1-reservation-statuses` | Estados activos de la org |
| 2 | GET | `/api-v1-reservations-get` | Listado paginado con filtros |
| 3 | GET | `/api-v1-reservations-get-by-id/{id}` | Detalle completo + activity log |
| 4 | PATCH | `/api-v1-reservations-patch-status/{id}/status` | Cambiar estado |

---

## Notas de arquitectura

- Todos los endpoints usan `SUPABASE_SERVICE_ROLE_KEY` internamente pero validan el JWT del usuario antes de cualquier operación.
- El scope de visibilidad se resuelve en la Edge Function — no depende de RLS para la lógica de negocio (RLS sigue activo como capa de seguridad adicional).
- Los endpoints están diseñados para escalar: agregar nuevos filtros o campos no rompe el contrato existente.
- No se exponen funciones internas de correspondencia, SMTP ni administración de usuarios.
- Próxima capa recomendada: endpoints para casetilla (ingresos/salidas) y catálogos (andenes, almacenes, clientes).
