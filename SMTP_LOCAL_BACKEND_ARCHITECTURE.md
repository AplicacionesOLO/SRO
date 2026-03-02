# Arquitectura de Envío SMTP - Backend Local

## ⚠️ CAMBIO ARQUITECTÓNICO IMPORTANTE

**Fecha:** 2025-01-XX  
**Versión:** 637+

---

## 📋 Resumen del Cambio

Se ha eliminado completamente el envío de correos desde **Supabase Edge Functions**.

**Antes (v636):**
```
Frontend → Supabase Edge Function (smtp-send) → HTTP Relay → SMTP 10.48.19.10
```

**Ahora (v637+):**
```
Frontend → Backend Local → SMTP 10.48.19.10:25 (directo)
```

---

## 🗑️ Componentes Eliminados

### Edge Functions
- ❌ `supabase/functions/smtp-send/index.ts` - **ELIMINADO**

### Secrets de Supabase (ya no necesarios)
- ❌ `SMTP_RELAY_URL` - **NO USAR**
- ❌ `SMTP_RELAY_SECRET` - **NO USAR**
- ❌ `SMTP_FROM` - **NO USAR**

### Proyecto HTTP Relay
- ❌ `smtp-relay/` - **NO NECESARIO** (puede eliminarse)

---

## ✅ Nueva Arquitectura

### Responsabilidades

| Componente | Responsabilidad |
|------------|-----------------|
| **Supabase** | Base de datos (`correspondence_outbox`, `correspondence_rules`, `correspondence_logs`) |
| **Backend Local** | Envío SMTP directo a `10.48.19.10:25` |
| **Frontend** | Crear registros en `correspondence_outbox` con `status='queued'` |

---

## 🔧 Configuración SMTP (Backend Local)

### Variables de Entorno (.env del backend)

```env
# SMTP Interno Corporativo
SMTP_HOST=10.48.19.10
SMTP_PORT=25
SMTP_SECURE=false
SMTP_IGNORE_TLS=true
SMTP_REQUIRE_TLS=false
SMTP_FROM=no-reply-sro@ologistics.com

# Supabase (para acceso a DB)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Características del SMTP

- **Host:** `10.48.19.10` (IP privada, accesible desde backend local)
- **Puerto:** `25`
- **Autenticación:** ❌ NO (sin usuario/contraseña)
- **TLS/SSL:** ❌ NO (`secure=false`, `ignoreTLS=true`)
- **From fijo:** `no-reply-sro@ologistics.com`

---

## 📊 Flujo de Envío

### 1. Frontend/Sistema crea registro en DB

```typescript
// Desde cualquier parte del sistema
const { data, error } = await supabase
  .from('correspondence_outbox')
  .insert({
    event_type: 'reservation_confirmation',
    sender_email: 'no-reply-sro@ologistics.com',
    recipient_email: 'cliente@example.com',
    cc_emails: ['supervisor@ologistics.com'],
    subject: 'Confirmación de Reserva #12345',
    body: '<html>...</html>',
    status: 'queued', // ← Estado inicial
    metadata: { reservation_id: 12345 }
  })
  .select()
  .single();
```

### 2. Backend Local procesa la cola

El backend local debe implementar:

```javascript
// Pseudo-código
async function processEmailQueue() {
  // 1. Obtener emails pendientes
  const pendingEmails = await supabase
    .from('correspondence_outbox')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(10);

  for (const email of pendingEmails) {
    try {
      // 2. Enviar por SMTP
      const messageId = await sendEmailViaSMTP({
        from: 'no-reply-sro@ologistics.com',
        to: email.recipient_email,
        cc: email.cc_emails,
        bcc: email.bcc_emails,
        subject: email.subject,
        html: email.body
      });

      // 3. Actualizar a 'sent'
      await supabase
        .from('correspondence_outbox')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: messageId
        })
        .eq('id', email.id);

    } catch (error) {
      // 4. Actualizar a 'failed'
      await supabase
        .from('correspondence_outbox')
        .update({
          status: 'failed',
          error: error.message
        })
        .eq('id', email.id);
    }
  }
}

// Ejecutar cada 30 segundos
setInterval(processEmailQueue, 30000);
```

---

## 🚀 Implementación del Backend

### Tecnología Recomendada

**Node.js + Nodemailer** (más simple y directo)

### Estructura de Archivos

```
backend-local/
├── .env                    # Variables SMTP + Supabase
├── package.json
├── src/
│   ├── services/
│   │   └── emailService.js # Lógica de envío SMTP
│   ├── workers/
│   │   └── emailWorker.js  # Procesador de cola
│   └── api/
│       └── emailRoutes.js  # Endpoint de prueba manual
└── README.md
```

---

## 📝 Próximos Pasos (Planes Siguientes)

1. ✅ **Plan 1 (Actual):** Eliminar Edge Function smtp-send - **COMPLETADO**
2. ⏳ **Plan 2:** Crear servicio SMTP local (Node.js + nodemailer)
3. ⏳ **Plan 3:** Implementar lógica de `correspondence_outbox`
4. ⏳ **Plan 4:** Crear endpoint de prueba manual
5. ⏳ **Plan 5:** Actualizar documentación y configuración

---

## ⚠️ Importante

- **NO usar servicios externos** (SendGrid, SES, Mailgun)
- **NO usar HTTP Relay**
- **NO usar puerto 587**
- **NO usar autenticación SMTP**
- **NO depender de Supabase Edge Functions para envío**

El envío SMTP es **exclusivamente desde el backend local** que corre en la misma red que `10.48.19.10`.

---

## 🔍 Verificación

Para confirmar que la migración está completa:

```bash
# 1. Verificar que smtp-send no existe
ls supabase/functions/smtp-send/  # Debe dar error "No such file"

# 2. Verificar que no hay referencias en el código
grep -r "smtp-send" src/  # No debe encontrar nada
grep -r "SMTP_RELAY" src/  # No debe encontrar nada

# 3. Verificar secrets de Supabase (opcional)
# Eliminar SMTP_RELAY_URL, SMTP_RELAY_SECRET, SMTP_FROM
```

---

## 📞 Soporte

Si necesitas ayuda con la implementación del backend local, consulta los siguientes planes que se implementarán a continuación.
