
# HTTP SMTP Relay v2.0

Puente HTTP entre Supabase Edge Functions (nube pública) y el SMTP corporativo interno (10.48.19.10:25).

## Arquitectura

```
Supabase Edge Function (smtp-send)
        │
        │  HTTPS POST /send-email
        │  Header: X-Relay-Secret
        ▼
┌──────────────────────┐
│  HTTP Relay (DMZ)    │  ← Este servicio
│  Node.js + Express   │
│  Puerto 3000         │
└──────────┬───────────┘
           │  SMTP plain, puerto 25
           │  Sin auth, sin TLS
           ▼
┌──────────────────────┐
│  SMTP Interno        │
│  10.48.19.10:25      │
└──────────────────────┘
```

**Requisito clave:** Este relay debe estar accesible públicamente vía HTTPS desde Supabase (usar nginx/traefik con certificado SSL como reverse proxy).

---

## Deploy con Docker

```bash
cd smtp-relay

# 1. Configurar variables
cp .env.example .env
nano .env   # Cambiar RELAY_SECRET por un valor fuerte

# 2. Build
docker build -t smtp-relay:latest .

# 3. Run
docker run -d \
  --name smtp-relay \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  smtp-relay:latest

# 4. Verificar
docker logs -f smtp-relay
```

## Deploy con Node.js directo

```bash
cd smtp-relay
npm install
cp .env.example .env
nano .env
npm start

# Producción con PM2:
pm2 start server.js --name smtp-relay
```

---

## Pruebas curl

### Health check
```bash
curl http://localhost:3000/health
```

### Enviar email
```bash
curl -X POST http://localhost:3000/send-email \
  -H "Content-Type: application/json" \
  -H "X-Relay-Secret: TU_SECRET_AQUI" \
  -d '{
    "from": "no-reply-sro@ologistics.com",
    "to": ["destino@ejemplo.com"],
    "subject": "Test desde relay",
    "body": "<p>Correo de prueba</p>",
    "eventType": "smtp_test"
  }'
```

### Sin secret (debe dar 401)
```bash
curl -X POST http://localhost:3000/send-email \
  -H "Content-Type: application/json" \
  -d '{"from":"a@b.com","to":["c@d.com"],"subject":"x","body":"y"}'
```

---

## Secrets en Supabase

Configurar estos 3 secrets en **Supabase → Project Settings → Edge Functions → Secrets**:

| Secret | Valor | Descripción |
|--------|-------|-------------|
| `SMTP_RELAY_URL` | `https://relay.tudominio.com/send-email` | URL pública HTTPS del relay |
| `SMTP_RELAY_SECRET` | *(mismo que RELAY_SECRET del .env)* | Secret compartido |
| `SMTP_FROM` | `no-reply-sro@ologistics.com` | Remitente de todos los correos |

**Opcional** (solo para logs/fallback, no se usan en modo relay):

| Secret | Valor |
|--------|-------|
| `SMTP_HOST` | `relay-smtp.ologistics.com` |
| `SMTP_PORT` | `25` |
| `SMTP_SECURE` | `false` |

### Comando CLI:
```bash
supabase secrets set \
  SMTP_RELAY_URL=https://relay.tudominio.com/send-email \
  SMTP_RELAY_SECRET=TU_SECRET_FUERTE \
  SMTP_FROM=no-reply-sro@ologistics.com
```

---

## Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| Relay HTTP 401 | Secret no coincide | Verificar SMTP_RELAY_SECRET = RELAY_SECRET |
| Relay HTTP 500 + ECONNREFUSED | Relay no llega a SMTP | Verificar red/firewall desde DMZ a 10.48.19.10:25 |
| smtp-send: "failed to lookup" | No hay SMTP_RELAY_URL | Configurar secret SMTP_RELAY_URL en Supabase |
| SMTP 550 relay denied | IP no en allowlist | Agregar IP del relay en el servidor SMTP |

---

## Seguridad producción

1. **HTTPS obligatorio**: Usar nginx/traefik como reverse proxy con certificado SSL
2. **Firewall**: Restringir acceso al puerto 3000 solo desde el reverse proxy
3. **Secret fuerte**: `openssl rand -hex 32` (mínimo 64 caracteres)
4. **Monitoreo**: Revisar logs `[RELAY][AUTH_FAIL]` para detectar intentos no autorizados
</file>
