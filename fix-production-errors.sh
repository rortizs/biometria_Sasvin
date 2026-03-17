#!/bin/bash

echo "🔧 Script para arreglar errores de producción en Sistema Biométrico"
echo "============================================================"

# 1. Fix Frontend API URL
echo "1️⃣ Arreglando URL del API en Frontend..."

cd frontend/

# Asegurar que environment.prod.ts use /api/v1 (proxy)
cat > src/environments/environment.prod.ts << 'EOF'
export const environment = {
  production: true,
  apiUrl: '/api/v1',  // Usa proxy de nginx
};
EOF

# Build de producción
echo "Building frontend con configuración correcta..."
npm run build -- --configuration=production

echo "✅ Frontend build completado"

# 2. Fix Backend CORS
echo "2️⃣ Arreglando CORS en Backend..."

cd ../backend/

# Actualizar CORS en main.py
cat > fix_cors.py << 'EOF'
import os

# Leer el archivo main.py
with open('app/main.py', 'r') as f:
    content = f.read()

# Reemplazar CORS origins
old_cors = 'origins=["http://localhost:5173", "http://localhost:4200"]'
new_cors = '''origins=[
        "http://localhost:5173",
        "http://localhost:4200", 
        "https://asistencia.sistemaslab.dev",
        "https://dokploy.sistemaslab.dev"
    ]'''

content = content.replace(old_cors, new_cors)

# Guardar cambios
with open('app/main.py', 'w') as f:
    f.write(content)

print("✅ CORS actualizado")
EOF

python fix_cors.py

# 3. Crear docker-compose override para producción
echo "3️⃣ Creando configuración de producción..."

cat > docker-compose.prod.yml << 'EOF'
version: '3.8'

services:
  frontend:
    image: biometria_frontend:prod
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.biometria-frontend.rule=Host(`asistencia.sistemaslab.dev`)"
      - "traefik.http.services.biometria-frontend.loadbalancer.server.port=80"
    networks:
      - dokploy-network

  backend:
    image: biometria_backend:prod
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - ALLOWED_ORIGINS=https://asistencia.sistemaslab.dev
      - DATABASE_URL=postgresql://biometria:biometria123@db:5432/biometria
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.biometria-api.rule=Host(`asistencia.sistemaslab.dev`) && PathPrefix(`/api`)"
      - "traefik.http.services.biometria-api.loadbalancer.server.port=8000"
    networks:
      - dokploy-network

  db:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_USER=biometria
      - POSTGRES_PASSWORD=biometria123
      - POSTGRES_DB=biometria
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - dokploy-network

networks:
  dokploy-network:
    external: true

volumes:
  postgres_data:
EOF

echo "✅ Configuración de producción creada"

# 4. Nginx config para frontend
echo "4️⃣ Configurando Nginx para proxy del API..."

cat > frontend/nginx.conf << 'EOF'
server {
    listen 80;
    server_name asistencia.sistemaslab.dev;
    
    root /usr/share/nginx/html;
    index index.html;
    
    # PWA headers
    add_header Service-Worker-Allowed "/";
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Proxy para API
    location /api {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers (if needed)
        add_header 'Access-Control-Allow-Origin' 'https://asistencia.sistemaslab.dev' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
    }
    
    # Angular routes
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Service Worker
    location /ngsw-worker.js {
        add_header Cache-Control "no-cache";
        add_header Service-Worker-Allowed "/";
    }
    
    # Manifest
    location /manifest.webmanifest {
        add_header Content-Type "application/manifest+json";
    }
}
EOF

echo "✅ Nginx configurado"

echo ""
echo "============================================================"
echo "📋 RESUMEN DE CAMBIOS:"
echo ""
echo "1. Frontend ahora usa '/api/v1' en producción (proxy)"
echo "2. Backend CORS actualizado para permitir asistencia.sistemaslab.dev"
echo "3. Nginx configurado para hacer proxy al backend"
echo "4. Docker compose de producción creado"
echo ""
echo "🚀 PRÓXIMOS PASOS:"
echo ""
echo "1. Hacer commit y push de los cambios"
echo "2. En Dokploy, hacer redeploy del proyecto"
echo "3. O ejecutar manualmente:"
echo "   docker-compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "============================================================"