
FROM node:20-alpine

LABEL description="HTTP SMTP Relay - Puente Supabase → SMTP interno"

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY server.js ./

RUN addgroup -g 1001 -S relay && \
    adduser -S relay -u 1001 && \
    chown -R relay:relay /app

USER relay

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode===200?0:1))"

CMD ["node", "server.js"]
</file>
