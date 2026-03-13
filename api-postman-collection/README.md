# Reservations API Module - Documentation

## 📋 Overview

This is a **NEW and INDEPENDENT** API module for the dock reservations system. It provides RESTful endpoints for reading and updating reservations via Supabase Edge Functions.

**Important:** This module does NOT modify any existing code, tables, RLS policies, triggers, or UI components. It only adds new Edge Functions and routes.

---

## 🏗️ Architecture

### File Structure

```
project-root/
├── supabase/functions/
│   ├── api-v1-reservations-get/
│   │   └── index.ts                    # GET endpoint for reading reservations
│   └── api-v1-reservations-patch-status/
│       └── index.ts                    # PATCH endpoint for updating status
├── api-postman-collection/
│   ├── Reservations_API.postman_collection.json  # Postman collection
│   └── README.md                       # This file
```

### Data Model (Read-Only Reference)

**Main Table:** `public.reservations`

Fields: `id`, `org_id`, `dock_id`, `start_datetime`, `end_datetime`, `dua`, `invoice`, `driver`, `status_id`, `notes`, `transport_type`, `cargo_type`, `is_cancelled`, `cancel_reason`, `cancelled_by`, `cancelled_at`, `created_by`, `created_at`, `updated_by`, `updated_at`, `purchase_order`, `truck_plate`, `order_request_number`, `shipper_provider`, `recurrence`

**Related Tables (for enrichment):**
- `docks` - Dock information
- `warehouses` - Warehouse information  
- `reservation_statuses` - Status catalog

**Activity Log:** `public.reservation_activity_log` - Mandatory logging for status changes

---

## 🔐 Authentication & Authorization

### JWT Token Requirement

All endpoints require a valid Supabase JWT token in the Authorization header:

```
Authorization: Bearer <JWT_TOKEN>
```

### How to Obtain JWT Token

1. **Via Supabase Auth UI (for testing):**
   - Login to your application
   - Open browser DevTools → Application → Local Storage
   - Find `sb-<project-ref>-auth-token` key
   - Extract the `access_token` value

2. **Via Supabase Client (programmatic):**
   ```javascript
   const { data, error } = await supabase.auth.signInWithPassword({
     email: 'user@example.com',
     password: 'password'
   });
   const token = data.session.access_token;
   ```

3. **Via API (direct):**
   ```bash
   curl -X POST 'https://<project-ref>.supabase.co/auth/v1/token?grant_type=password' \
     -H "apikey: <anon-key>" \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password"}'
   ```

### Permission Validation

**Required Permission:** `casetilla.view`

The API validates permissions using:
1. First attempts to use `can(org_id, 'casetilla.view')` function if it exists
2. Falls back to manual validation via `user_org_roles` + `role_permissions` + `permissions.name='casetilla.view'`
3. Returns `403 Forbidden` if user lacks permission

### Organization Access

- `org_id` must be provided (query param or body)
- User must belong to the organization via `user_org_roles` table
- Returns `403 Forbidden` if user doesn't have access to the organization

---

## 📡 API Endpoints

### Base URL

```
https://<project-ref>.supabase.co/functions/v1
```

Replace `<project-ref>` with your Supabase project reference ID.

---

## 🔍 Endpoint 1: GET Reservations

### Request

```
GET /api-v1-reservations-get
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `org_id` | UUID | Yes | - | Organization ID |
| `from` | ISO 8601 | No | - | Filter by start_datetime >= from |
| `to` | ISO 8601 | No | - | Filter by start_datetime <= to |
| `dock_id` | UUID | No | - | Filter by specific dock |
| `status_id` | UUID | No | - | Filter by specific status |
| `is_cancelled` | boolean | No | - | Filter by cancellation status |
| `limit` | integer | No | 50 | Results per page (1-500) |
| `offset` | integer | No | 0 | Pagination offset |
| `include` | string | No | - | Comma-separated: `dock`, `warehouse` |

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "dock_id": "uuid",
      "start_datetime": "2024-01-15T10:00:00Z",
      "end_datetime": "2024-01-15T12:00:00Z",
      "dua": "DUA123456",
      "invoice": "INV-2024-001",
      "driver": "John Doe",
      "status_id": "uuid",
      "notes": "Special handling required",
      "transport_type": "truck",
      "cargo_type": "pallets",
      "is_cancelled": false,
      "cancel_reason": null,
      "cancelled_by": null,
      "cancelled_at": null,
      "created_by": "uuid",
      "created_at": "2024-01-10T08:00:00Z",
      "updated_by": "uuid",
      "updated_at": "2024-01-10T08:00:00Z",
      "purchase_order": "PO-2024-001",
      "truck_plate": "ABC-123",
      "order_request_number": "ORD-001",
      "shipper_provider": "Provider Inc",
      "recurrence": null,
      "dock": {
        "id": "uuid",
        "name": "Dock A1",
        "warehouse_id": "uuid"
      },
      "warehouse": {
        "id": "uuid",
        "name": "Main Warehouse",
        "location": "Building 1"
      }
    }
  ],
  "meta": {
    "limit": 50,
    "offset": 0,
    "count": null
  }
}
```

### cURL Example

```bash
curl -X GET 'https://<project-ref>.supabase.co/functions/v1/api-v1-reservations-get?org_id=<org-uuid>&limit=50&offset=0&include=dock,warehouse' \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

### Error Responses

| Status | Description | Example |
|--------|-------------|---------|
| 400 | Invalid parameters | `{"error":"limit must be between 1 and 500"}` |
| 401 | Missing or invalid token | `{"error":"Unauthorized"}` |
| 403 | No permission or org access | `{"error":"User does not have casetilla.view permission"}` |
| 500 | Server error | `{"error":"Internal server error"}` |

---

## 🔄 Endpoint 2: PATCH Reservation Status

### Request

```
PATCH /api-v1-reservations-patch-status/{id}
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Reservation ID |

### Request Body

```json
{
  "status_id": "uuid",
  "org_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status_id` | UUID | Yes | New status ID (must exist in reservation_statuses) |
| `org_id` | UUID | Yes* | Organization ID (*optional if inferred from token) |

### Business Rules

1. ✅ Reservation must exist for the given `id` and `org_id`
2. ✅ Reservation must NOT be cancelled (`is_cancelled = false`)
3. ✅ New `status_id` must exist in `reservation_statuses` table
4. ✅ New status must be active (`is_active = true`)
5. ✅ New status must belong to the same `org_id`
6. ✅ Activity log entry is **mandatory** (transaction fails if log fails)

### Response (200 OK)

```json
{
  "data": {
    "id": "uuid",
    "org_id": "uuid",
    "status_id": "uuid",
    "updated_by": "uuid",
    "updated_at": "2024-01-15T14:30:00Z"
  }
}
```

### Activity Log Entry

Automatically creates an entry in `reservation_activity_log`:

```json
{
  "org_id": "uuid",
  "reservation_id": "uuid",
  "event_type": "reservation_status_changed",
  "field_name": "status_id",
  "old_value": "previous-status-uuid",
  "new_value": "new-status-uuid",
  "changed_by": "user-uuid",
  "changed_at": "2024-01-15T14:30:00Z"
}
```

### cURL Example

```bash
curl -X PATCH 'https://<project-ref>.supabase.co/functions/v1/api-v1-reservations-patch-status/<reservation-uuid>' \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status_id": "<new-status-uuid>",
    "org_id": "<org-uuid>"
  }'
```

### Error Responses

| Status | Description | Example |
|--------|-------------|---------|
| 400 | Invalid parameters | `{"error":"status_id must be a valid UUID"}` |
| 400 | Invalid status | `{"error":"Status does not exist or is not active"}` |
| 401 | Missing or invalid token | `{"error":"Unauthorized"}` |
| 403 | No permission or org access | `{"error":"User does not have casetilla.view permission"}` |
| 404 | Reservation not found | `{"error":"Reservation not found"}` |
| 409 | Reservation cancelled | `{"error":"Cannot update status of cancelled reservation"}` |
| 500 | Server error | `{"error":"Internal server error"}` |

---

## 🚀 Deployment

### Prerequisites

- Supabase CLI installed: `npm install -g supabase`
- Supabase project linked: `supabase link --project-ref <project-ref>`
- Valid Supabase access token

### Deploy Edge Functions

```bash
# Deploy GET endpoint
supabase functions deploy api-v1-reservations-get

# Deploy PATCH endpoint
supabase functions deploy api-v1-reservations-patch-status

# Deploy both at once
supabase functions deploy
```

### Verify Deployment

```bash
# List deployed functions
supabase functions list

# Check function logs
supabase functions logs api-v1-reservations-get
supabase functions logs api-v1-reservations-patch-status
```

---

## 📮 Postman Collection

### Import Collection

1. Open Postman
2. Click **File** → **Import**
3. Select `Reservations_API.postman_collection.json`
4. Collection will appear in your workspace

### Configure Environment Variables

Click on the collection → **Variables** tab → Set values:

| Variable | Description | Example |
|----------|-------------|---------|
| `baseUrl` | Supabase functions base URL | `https://<project-ref>.supabase.co/functions/v1` |
| `token` | JWT authentication token | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `orgId` | Organization UUID | `123e4567-e89b-12d3-a456-426614174000` |
| `reservationId` | Reservation UUID (for PATCH) | `123e4567-e89b-12d3-a456-426614174001` |
| `newStatusId` | New status UUID (for PATCH) | `123e4567-e89b-12d3-a456-426614174002` |

### Run Requests

1. **GET Reservations:**
   - Select "GET Reservations" request
   - Click **Send**
   - View response and test results

2. **PATCH Reservation Status:**
   - Select "PATCH Reservation Status" request
   - Ensure `reservationId` and `newStatusId` are set
   - Click **Send**
   - View response and test results

### Automated Tests

Both requests include automated tests that verify:

**GET Tests:**
- ✅ Status code is 200
- ✅ Response has `data` array
- ✅ Response has `meta` object
- ✅ `org_id` matches request parameter
- ✅ Reservations contain required fields
- ✅ Include parameter returns nested objects

**PATCH Tests:**
- ✅ Status code is 200
- ✅ Response has `data` object
- ✅ `org_id` matches request
- ✅ `status_id` was updated to new value
- ✅ Response contains required fields
- ✅ `updated_at` timestamp is recent

---

## 🔧 Troubleshooting

### Common Issues

**1. 401 Unauthorized**
- Verify JWT token is valid and not expired
- Check Authorization header format: `Bearer <token>`
- Ensure token belongs to an active user

**2. 403 Forbidden**
- Verify user has `casetilla.view` permission
- Check user belongs to the organization via `user_org_roles`
- Confirm role has permission in `role_permissions` table

**3. 404 Not Found**
- Verify reservation ID exists in database
- Check `org_id` matches the reservation's organization
- Ensure reservation is not soft-deleted

**4. 409 Conflict**
- Reservation is cancelled (`is_cancelled = true`)
- Cannot update status of cancelled reservations
- Use different endpoint to uncancel if needed

**5. 500 Internal Server Error**
- Check Edge Function logs: `supabase functions logs <function-name>`
- Verify database connection is working
- Check for database constraint violations

### Debug Mode

Enable detailed logging in Edge Functions:

```typescript
// Add to function code temporarily
console.log('Request:', JSON.stringify(req));
console.log('User ID:', userId);
console.log('Query result:', result);
```

View logs:
```bash
supabase functions logs api-v1-reservations-get --tail
```

---

## 📊 Performance Considerations

### Pagination

- Default limit: 50 records
- Maximum limit: 500 records
- Use `offset` for pagination: `offset = page * limit`

### Filtering

- Apply filters to reduce result set size
- Use date ranges (`from`, `to`) for time-based queries
- Filter by `dock_id` or `status_id` for specific subsets

### Include Parameter

- Only request nested objects when needed
- `include=dock` adds ~10% overhead
- `include=dock,warehouse` adds ~20% overhead

### Indexing

Recommended indexes (if not already present):

```sql
CREATE INDEX IF NOT EXISTS idx_reservations_org_start 
  ON reservations(org_id, start_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_reservations_dock 
  ON reservations(dock_id);

CREATE INDEX IF NOT EXISTS idx_reservations_status 
  ON reservations(status_id);
```

---

## 🛡️ Security Notes

### Zero Changes to Existing System

This module:
- ✅ Does NOT modify existing tables
- ✅ Does NOT alter RLS policies
- ✅ Does NOT change triggers or functions
- ✅ Does NOT modify UI components
- ✅ Does NOT require database migrations

### Data Access

- All queries filtered by `org_id` (mandatory)
- User must have explicit permission (`casetilla.view`)
- JWT token validated on every request
- Activity logging for audit trail

### Rate Limiting

Consider implementing rate limiting at the API gateway level:
- Recommended: 100 requests/minute per user
- Burst: 200 requests/minute

---

## 📝 Changelog

### Version 1.0.0 (Initial Release)

- ✅ GET endpoint for reading reservations with filters
- ✅ PATCH endpoint for updating reservation status
- ✅ JWT authentication and permission validation
- ✅ Activity logging for status changes
- ✅ Postman collection with automated tests
- ✅ Comprehensive documentation

---

## 📞 Support

For issues or questions:
1. Check Edge Function logs: `supabase functions logs <function-name>`
2. Review this documentation
3. Verify authentication and permissions
4. Contact system administrator

---

## 📄 License

Internal use only. Part of the dock reservations management system.