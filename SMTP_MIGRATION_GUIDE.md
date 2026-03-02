# Guía de Migración: Gmail OAuth → SMTP Centralizado

## 📋 Resumen

Este documento describe la migración del sistema de envío de correos desde Gmail OAuth (por usuario) a un servicio SMTP centralizado usando `no-reply-sro@ologistics.com`.

**Objetivo:** Los clientes externos NO deben conectar su correo. El sistema siempre envía desde la cuenta centralizada.

---

## 🔐 Configuración de Secrets en Supabase

### Secrets Requeridos

Configurar los siguientes secrets en Supabase Dashboard → Edge Functions → Secrets:

| Secret Name | Descripción | Ejemplo | Requerido |
|------------|-------------|---------|-----------|
| `SMTP_HOST` | Servidor SMTP | `smtp.gmail.com` o `smtp.office365.com` | ✅ Sí |
| `SMTP_PORT` | Puerto SMTP | `587` (TLS) o `465` (SSL) | ✅ Sí |
| `SMTP_SECURE` | Usar SSL/TLS | `true` o `false` | ✅ Sí |
| `SMTP_USER` | Usuario SMTP (email completo) | `no-reply-sro@ologistics.com` | ⚠️ Opcional* |
| `SMTP_PASS` | Contraseña o App Password | `xxxx xxxx xxxx xxxx` | ⚠️ Opcional* |
| `SMTP_FROM` | Email remitente (FROM) | `no-reply-sro@ologistics.com` | ✅ Sí |
| `MAIL_INTERNAL_SECRET` | Secret para llamadas server-to-server | `random-uuid-or-strong-password` | ✅ Sí |

\* **Nota:** `SMTP_USER` y `SMTP_PASS` son opcionales solo si el servidor SMTP permite envío sin autenticación (raro). En producción, siempre configurarlos.

### Comandos para Configurar Secrets

```bash
# Instalar Supabase CLI si no está instalado
npm install -g supabase

# Login a Supabase
supabase login

# Link al proyecto
supabase link --project-ref YOUR_PROJECT_REF

# Configurar secrets
supabase secrets set SMTP_HOST=smtp.gmail.com
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_SECURE=true
supabase secrets set SMTP_USER=no-reply-sro@ologistics.com
supabase secrets set SMTP_PASS="your-app-password-here"
supabase secrets set SMTP_FROM=no-reply-sro@ologistics.com
supabase secrets set MAIL_INTERNAL_SECRET="$(openssl rand -hex 32)"

# Verificar secrets configurados
supabase secrets list
```

### Configuración Específica para Gmail

Si usas Gmail como servidor SMTP:

1. **Habilitar autenticación de 2 factores** en la cuenta `no-reply-sro@ologistics.com`
2. **Generar App Password:**
   - Ir a: https://myaccount.google.com/apppasswords
   - Crear nueva contraseña de aplicación
   - Usar esa contraseña en `SMTP_PASS`

3. **Configuración:**
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=true
   SMTP_USER=no-reply-sro@ologistics.com
   SMTP_PASS=xxxx xxxx xxxx xxxx  # App Password de 16 caracteres
   ```

### Configuración para Office 365 / Outlook

```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=no-reply-sro@ologistics.com
SMTP_PASS=your-password-here
```

---

## 🚀 Deploy de Edge Functions

### 1. Deploy de la nueva función SMTP

```bash
# Deploy smtp-send
supabase functions deploy smtp-send

# Verificar deploy
supabase functions list
```

### 2. Re-deploy de funciones modificadas

```bash
# Re-deploy correspondence-process-event
supabase functions deploy correspondence-process-event

# Re-deploy correspondence-dispatch-event
supabase functions deploy correspondence-dispatch-event

# Verificar todas las funciones
supabase functions list
```

### 3. Verificar logs

```bash
# Ver logs en tiempo real
supabase functions logs smtp-send --tail

# Ver logs de una función específica
supabase functions logs correspondence-process-event --tail
```

---

## ✅ Checklist de Pruebas Manuales

### Pre-requisitos
- [ ] Todos los secrets SMTP configurados en Supabase
- [ ] Edge Functions deployadas correctamente
- [ ] Frontend actualizado con nuevo componente `SmtpServiceTab`
- [ ] Usuario con rol admin para pruebas

---

### 🧪 Prueba 1: Envío de Correo de Prueba desde UI

**Objetivo:** Verificar que el envío manual desde el panel "Servicio de correo" funciona correctamente.

**Pasos:**
1. [ ] Login como usuario admin
2. [ ] Ir a: **Administración → Correspondencia → Servicio de correo**
3. [ ] Verificar que se muestra el mensaje: "Los correos se envían desde no-reply-sro@ologistics.com"
4. [ ] Hacer clic en **"Enviar correo de prueba"**
5. [ ] Ingresar un email válido (ej: tu email personal)
6. [ ] Hacer clic en **"Enviar"**
7. [ ] Verificar que aparece mensaje de éxito
8. [ ] Revisar bandeja de entrada del email destino
9. [ ] Verificar que el correo llegó con:
   - **FROM:** no-reply-sro@ologistics.com
   - **Subject:** Correo de prueba - Sistema OLogistics
   - **Body:** Contenido HTML correcto

**Verificación en Base de Datos:**
```sql
-- Ver último registro en outbox
SELECT 
  id, 
  sender_email, 
  to_emails, 
  subject, 
  status, 
  sent_at, 
  error,
  created_at
FROM correspondence_outbox
ORDER BY created_at DESC
LIMIT 1;

-- Debe mostrar:
-- sender_email = 'no-reply-sro@ologistics.com'
-- status = 'sent'
-- sent_at = timestamp reciente
-- error = null
```

**Casos de Error a Probar:**
- [ ] Email destino inválido (ej: `invalid-email`) → debe mostrar error
- [ ] Email destino vacío → debe mostrar error de validación

---

### 🧪 Prueba 2: Trigger de Regla por Evento (reservation_created)

**Objetivo:** Verificar que al crear una reserva, se dispara el envío automático según las reglas configuradas.

**Pre-requisitos:**
- [ ] Existe al menos 1 regla activa con `event_type = 'reservation_created'`
- [ ] La regla tiene destinatarios configurados (to_emails, cc_emails, o bcc_emails)

**Pasos:**
1. [ ] Ir a: **Calendario → Crear nueva reserva**
2. [ ] Completar formulario de reserva:
   - Seleccionar cliente
   - Seleccionar proveedor
   - Seleccionar fecha/hora
   - Seleccionar andén
3. [ ] Hacer clic en **"Guardar"**
4. [ ] Esperar 5-10 segundos (procesamiento asíncrono)
5. [ ] Ir a: **Administración → Correspondencia → Bitácora**
6. [ ] Verificar que aparece nuevo registro con:
   - **Event Type:** reservation_created
   - **Status:** sent
   - **Sender:** no-reply-sro@ologistics.com

**Verificación en Base de Datos:**
```sql
-- Ver correos enviados por reservation_created
SELECT 
  co.id,
  co.event_type,
  co.reservation_id,
  co.sender_email,
  co.to_emails,
  co.subject,
  co.status,
  co.sent_at,
  co.error,
  r.folio
FROM correspondence_outbox co
LEFT JOIN reservations r ON r.id = co.reservation_id
WHERE co.event_type = 'reservation_created'
ORDER BY co.created_at DESC
LIMIT 5;

-- Verificar que sender_email = 'no-reply-sro@ologistics.com'
```

**Verificación en Email:**
- [ ] Revisar bandeja de entrada de los destinatarios configurados en la regla
- [ ] Verificar que el correo llegó con datos correctos de la reserva

---

### 🧪 Prueba 3: Trigger de Regla por Cambio de Estado

**Objetivo:** Verificar que al cambiar el estado de una reserva, se dispara el envío automático.

**Pre-requisitos:**
- [ ] Existe al menos 1 regla activa con `event_type = 'reservation_status_changed'`
- [ ] Existe una reserva en estado inicial (ej: "Pendiente")

**Pasos:**
1. [ ] Ir a: **Calendario**
2. [ ] Seleccionar una reserva existente
3. [ ] Cambiar estado (ej: de "Pendiente" a "Confirmada")
4. [ ] Guardar cambios
5. [ ] Esperar 5-10 segundos
6. [ ] Ir a: **Administración → Correspondencia → Bitácora**
7. [ ] Verificar nuevo registro con:
   - **Event Type:** reservation_status_changed
   - **Status:** sent
   - **Sender:** no-reply-sro@ologistics.com

**Verificación en Base de Datos:**
```sql
-- Ver correos enviados por cambio de estado
SELECT 
  co.id,
  co.event_type,
  co.reservation_id,
  co.sender_email,
  co.to_emails,
  co.subject,
  co.status,
  co.sent_at,
  r.folio,
  rs.name as status_name
FROM correspondence_outbox co
LEFT JOIN reservations r ON r.id = co.reservation_id
LEFT JOIN reservation_statuses rs ON rs.id = r.status_id
WHERE co.event_type = 'reservation_status_changed'
ORDER BY co.created_at DESC
LIMIT 5;
```

---

### 🧪 Prueba 4: Verificar Outbox con sender_email Correcto

**Objetivo:** Confirmar que TODOS los correos nuevos usan `no-reply-sro@ologistics.com` como remitente.

**Query SQL:**
```sql
-- Ver todos los correos enviados en las últimas 24 horas
SELECT 
  id,
  event_type,
  sender_email,
  to_emails,
  subject,
  status,
  sent_at,
  error,
  created_at
FROM correspondence_outbox
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ✅ TODOS deben tener sender_email = 'no-reply-sro@ologistics.com'
-- ❌ Si alguno tiene otro email, hay un bug
```

**Verificación:**
- [ ] Todos los registros tienen `sender_email = 'no-reply-sro@ologistics.com'`
- [ ] No hay registros con emails de usuarios (ej: `user@example.com`)

---

### 🧪 Prueba 5: Casos de Error - SMTP Down

**Objetivo:** Verificar que el sistema maneja correctamente errores de conexión SMTP.

**Simulación:**
1. [ ] Cambiar temporalmente el secret `SMTP_HOST` a un valor inválido:
   ```bash
   supabase secrets set SMTP_HOST=invalid-smtp-server.com
   ```
2. [ ] Intentar enviar correo de prueba desde UI
3. [ ] Verificar que:
   - [ ] Aparece mensaje de error en UI
   - [ ] No se cuelga la aplicación
   - [ ] El error es descriptivo

**Verificación en Base de Datos:**
```sql
-- Ver correos fallidos
SELECT 
  id,
  sender_email,
  to_emails,
  subject,
  status,
  error,
  created_at
FROM correspondence_outbox
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 5;

-- Verificar que error contiene información útil
```

**Restaurar configuración:**
```bash
supabase secrets set SMTP_HOST=smtp.gmail.com
```

---

### 🧪 Prueba 6: Casos de Error - Credenciales Inválidas

**Objetivo:** Verificar manejo de errores de autenticación SMTP.

**Simulación:**
1. [ ] Cambiar temporalmente el secret `SMTP_PASS` a un valor inválido:
   ```bash
   supabase secrets set SMTP_PASS=invalid-password
   ```
2. [ ] Intentar enviar correo de prueba
3. [ ] Verificar que:
   - [ ] Aparece error de autenticación
   - [ ] El registro en outbox tiene `status = 'failed'`
   - [ ] El campo `error` contiene "authentication" o "invalid credentials"

**Restaurar configuración:**
```bash
supabase secrets set SMTP_PASS="your-correct-app-password"
```

---

### 🧪 Prueba 7: Casos de Error - Destinatarios Vacíos

**Objetivo:** Verificar validación de destinatarios.

**Pasos:**
1. [ ] Intentar enviar correo de prueba sin ingresar email destino
2. [ ] Verificar que aparece error de validación en UI
3. [ ] Verificar que NO se crea registro en outbox

**Verificación en Código:**
```typescript
// En SmtpServiceTab.tsx debe haber validación:
if (!testEmail || !testEmail.trim()) {
  setTestResult({ success: false, message: 'Ingresá un email válido' });
  return;
}
```

---

### 🧪 Prueba 8: Verificar que Clientes NO Necesitan Conectar Correo

**Objetivo:** Confirmar que el sistema funciona sin que los usuarios conecten Gmail.

**Pasos:**
1. [ ] Login como usuario NO admin (cliente externo)
2. [ ] Ir a: **Administración → Correspondencia**
3. [ ] Verificar que:
   - [ ] NO aparece tab "Cuenta Gmail"
   - [ ] Solo aparece tab "Servicio de correo" (si tiene permisos)
   - [ ] El mensaje indica que los correos se envían desde cuenta centralizada
4. [ ] Crear una reserva como cliente
5. [ ] Verificar que el correo se envía correctamente desde `no-reply-sro@ologistics.com`

**Verificación:**
- [ ] Los clientes NO ven opciones de conectar Gmail
- [ ] Los correos se envían correctamente sin intervención del cliente
- [ ] El remitente siempre es `no-reply-sro@ologistics.com`

---

## 🔍 Verificación de Logs en Supabase

### Ver logs de smtp-send

```bash
# Logs en tiempo real
supabase functions logs smtp-send --tail

# Logs de las últimas 100 líneas
supabase functions logs smtp-send --limit 100
```

### Logs esperados (éxito)

```
[smtp-send] Request received { orgId: '...', to: ['user@example.com'], subject: '...' }
[smtp-send] SMTP config loaded { host: 'smtp.gmail.com', port: 587, secure: true }
[smtp-send] Email sent successfully { messageId: '<...@...>', outboxId: '...' }
[smtp-send] Outbox updated { outboxId: '...', status: 'sent' }
```

### Logs esperados (error)

```
[smtp-send] Request received { orgId: '...', to: ['user@example.com'], subject: '...' }
[smtp-send] SMTP config loaded { host: 'smtp.gmail.com', port: 587, secure: true }
[smtp-send] Error sending email { error: 'Invalid login: 535-5.7.8 Username and Password not accepted' }
[smtp-send] Outbox updated { outboxId: '...', status: 'failed', error: '...' }
```

---

## 📊 Queries SQL Útiles para Debugging

### Ver estadísticas de envío

```sql
-- Resumen de correos por estado
SELECT 
  status,
  COUNT(*) as total,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h
FROM correspondence_outbox
GROUP BY status
ORDER BY total DESC;
```

### Ver correos fallidos recientes

```sql
-- Últimos 10 correos fallidos con detalle de error
SELECT 
  id,
  event_type,
  sender_email,
  to_emails,
  subject,
  error,
  created_at
FROM correspondence_outbox
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

### Ver correos por remitente

```sql
-- Verificar que todos usan no-reply
SELECT 
  sender_email,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
FROM correspondence_outbox
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY sender_email
ORDER BY total DESC;

-- ✅ Debe mostrar solo 'no-reply-sro@ologistics.com'
```

### Ver reglas activas

```sql
-- Listar reglas de correspondencia activas
SELECT 
  id,
  name,
  event_type,
  sender_mode,
  sender_user_id,
  to_emails,
  cc_emails,
  bcc_emails,
  is_active,
  created_at
FROM correspondence_rules
WHERE is_active = true
ORDER BY event_type, name;
```

---

## 🚨 Troubleshooting

### Problema: Correos no se envían

**Diagnóstico:**
1. Verificar secrets configurados:
   ```bash
   supabase secrets list
   ```
2. Ver logs de smtp-send:
   ```bash
   supabase functions logs smtp-send --tail
   ```
3. Verificar outbox:
   ```sql
   SELECT * FROM correspondence_outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5;
   ```

**Soluciones comunes:**
- [ ] Verificar que `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` están configurados
- [ ] Verificar que `SMTP_USER` y `SMTP_PASS` son correctos
- [ ] Si usas Gmail, verificar que usás App Password (no contraseña normal)
- [ ] Verificar que la cuenta SMTP no está bloqueada

---

### Problema: Error "Invalid login" en Gmail

**Causa:** Contraseña incorrecta o no se usa App Password.

**Solución:**
1. Ir a: https://myaccount.google.com/apppasswords
2. Generar nueva App Password
3. Actualizar secret:
   ```bash
   supabase secrets set SMTP_PASS="xxxx xxxx xxxx xxxx"
   ```
4. Re-deploy función:
   ```bash
   supabase functions deploy smtp-send
   ```

---

### Problema: Correos van a spam

**Causa:** Falta configuración SPF/DKIM/DMARC en el dominio.

**Solución:**
1. Configurar registros DNS del dominio `ologistics.com`:
   - **SPF:** Permitir servidor SMTP
   - **DKIM:** Firmar correos
   - **DMARC:** Política de autenticación
2. Contactar al administrador del dominio para configurar estos registros

---

### Problema: Modal de Gmail sigue apareciendo

**Causa:** El `GmailConnectionGuard` todavía está activo.

**Solución:**
1. Eliminar `<GmailConnectionGuard />` de `src/App.tsx`
2. Eliminar archivo `src/components/guards/GmailConnectionGuard.tsx`
3. Eliminar servicio `src/services/gmailAccountService.ts`

---

## 📝 Checklist Final de Migración

### Backend
- [ ] Secret `SMTP_HOST` configurado
- [ ] Secret `SMTP_PORT` configurado
- [ ] Secret `SMTP_SECURE` configurado
- [ ] Secret `SMTP_USER` configurado
- [ ] Secret `SMTP_PASS` configurado
- [ ] Secret `SMTP_FROM` configurado
- [ ] Secret `MAIL_INTERNAL_SECRET` configurado
- [ ] Edge Function `smtp-send` deployada
- [ ] Edge Function `correspondence-process-event` actualizada y deployada
- [ ] Edge Function `correspondence-dispatch-event` actualizada y deployada

### Frontend
- [ ] Componente `SmtpServiceTab` creado
- [ ] Tab "Cuenta Gmail" eliminado de Correspondencia
- [ ] Servicio `correspondenceService.ts` actualizado con método `sendTestEmail`
- [ ] `GmailConnectionGuard` eliminado de `App.tsx`
- [ ] Archivo `GmailConnectionGuard.tsx` eliminado
- [ ] Servicio `gmailAccountService.ts` marcado como DEPRECATED

### Pruebas
- [ ] ✅ Prueba 1: Envío de correo de prueba desde UI
- [ ] ✅ Prueba 2: Trigger de regla por evento (reservation_created)
- [ ] ✅ Prueba 3: Trigger de regla por cambio de estado
- [ ] ✅ Prueba 4: Verificar outbox con sender_email correcto
- [ ] ✅ Prueba 5: Casos de error - SMTP down
- [ ] ✅ Prueba 6: Casos de error - Credenciales inválidas
- [ ] ✅ Prueba 7: Casos de error - Destinatarios vacíos
- [ ] ✅ Prueba 8: Verificar que clientes NO necesitan conectar correo

### Verificación Final
- [ ] Todos los correos nuevos usan `no-reply-sro@ologistics.com` como remitente
- [ ] No hay errores en logs de Edge Functions
- [ ] No hay registros con `status = 'failed'` en outbox (o son casos esperados)
- [ ] Clientes externos NO ven opciones de conectar Gmail
- [ ] El sistema funciona sin intervención de usuarios

---

## 🎯 Próximos Pasos (Post-Migración)

### Corto plazo (1-2 semanas)
1. [ ] Monitorear logs de `smtp-send` diariamente
2. [ ] Verificar que no hay correos fallidos inesperados
3. [ ] Recopilar feedback de usuarios sobre recepción de correos

### Mediano plazo (1-2 meses)
1. [ ] Eliminar Edge Functions Gmail deprecated:
   - `gmail-auth-url`
   - `gmail-callback`
   - `gmail-connection-status`
   - `gmail-disconnect`
   - `gmail-send`
2. [ ] Eliminar componente `GmailAccountTab.tsx`
3. [ ] Eliminar servicio `gmailAccountService.ts`

### Largo plazo (3-6 meses)
1. [ ] Hacer backup de tabla `gmail_accounts`
2. [ ] DROP tabla `gmail_accounts` (después de confirmar que no hay dependencias)
3. [ ] Limpiar referencias en código legacy

---

## 📞 Soporte

Si encontrás problemas durante la migración:

1. **Revisar logs:**
   ```bash
   supabase functions logs smtp-send --tail
   ```

2. **Verificar secrets:**
   ```bash
   supabase secrets list
   ```

3. **Consultar outbox:**
   ```sql
   SELECT * FROM correspondence_outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;
   ```

4. **Contactar al equipo de desarrollo** con:
   - Logs de la función
   - Query de outbox con errores
   - Pasos para reproducir el problema

---

**Fecha de creación:** 2024
**Versión:** 1.0
**Autor:** Tech Lead - Sistema OLogistics
