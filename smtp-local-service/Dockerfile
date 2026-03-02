FROM node:18-alpine

# Metadata
LABEL maintainer="OLogistics"
LABEL description="Servicio SMTP local para envío de correos desde backend corporativo"

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY src ./src

# Variables de entorno por defecto (sobrescribir con .env o docker-compose)
ENV NODE_ENV=production
ENV PORT=3100

# Exponer puerto
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usuario no-root
USER node

# Comando de inicio
CMD ["npm", "start"]