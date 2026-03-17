# 🚀 Estrategia de Deployment PWA para Sistema Biométrico

## Configuración Actual

El proyecto YA está configurado como PWA con Angular. Solo necesitas optimizar y deployar.

## Pasos para Deploy PWA

### 1. Optimizar el Build de Producción

```bash
# En frontend/
npm run build -- --configuration=production
```

### 2. Configurar el Service Worker (ya existe)

Verificar `frontend/ngsw-config.json`:

```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app",
      "installMode": "prefetch",
      "resources": {
        "files": [
          "/favicon.ico",
          "/index.html",
          "/manifest.webmanifest",
          "/*.css",
          "/*.js"
        ]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/assets/**",
          "/icons/**"
        ]
      }
    }
  ],
  "dataGroups": [
    {
      "name": "api-attendance",
      "urls": ["/api/attendance/**"],
      "cacheConfig": {
        "strategy": "freshness",
        "maxSize": 100,
        "maxAge": "1h",
        "timeout": "10s"
      }
    }
  ]
}
```

### 3. Actualizar el Manifest para Catedráticos

```json
{
  "name": "SASVIN - Control de Asistencia",
  "short_name": "SASVIN",
  "description": "Sistema de control de asistencia para catedráticos",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0a0e17",
  "theme_color": "#3b82f6",
  "icons": [
    // ... iconos existentes
  ],
  "screenshots": [
    {
      "src": "/screenshots/login.png",
      "type": "image/png",
      "sizes": "540x1200"
    },
    {
      "src": "/screenshots/scan.png",
      "type": "image/png",
      "sizes": "540x1200"
    }
  ],
  "categories": ["business", "productivity", "education"],
  "prefer_related_applications": false
}
```

### 4. Configurar Headers de Seguridad

Para el servidor (nginx o el que uses):

```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name app.sasvin.edu.gt;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # Headers de seguridad
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # PWA headers
    add_header Service-Worker-Allowed "/";
    
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
        
        # Cache para assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    location /api {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 5. Prompt de Instalación Personalizado

Agregar en tu componente principal:

```typescript
// app.component.ts
import { Component, OnInit, inject } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
    <!-- Banner de instalación -->
    @if (showInstallPrompt) {
      <div class="install-banner">
        <p>📱 Instalá la app para acceso rápido</p>
        <button (click)="installApp()">Instalar</button>
        <button (click)="dismissInstall()">Ahora no</button>
      </div>
    }
    
    <router-outlet />
  `
})
export class AppComponent implements OnInit {
  showInstallPrompt = false;
  deferredPrompt: any;
  
  ngOnInit() {
    // Detectar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return; // Ya está instalada
    }
    
    // Capturar el evento de instalación
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallPrompt = true;
    });
    
    // Para iOS (no tiene prompt automático)
    if (this.isIOS() && !this.isInStandaloneMode()) {
      this.showIOSInstallInstructions();
    }
  }
  
  installApp() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((result: any) => {
        if (result.outcome === 'accepted') {
          console.log('App instalada');
        }
        this.deferredPrompt = null;
        this.showInstallPrompt = false;
      });
    }
  }
  
  dismissInstall() {
    this.showInstallPrompt = false;
    // Guardar en localStorage para no molestar
    localStorage.setItem('install-dismissed', 'true');
  }
  
  isIOS() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent);
  }
  
  isInStandaloneMode() {
    return ('standalone' in navigator) && navigator['standalone'];
  }
  
  showIOSInstallInstructions() {
    // Mostrar instrucciones para iOS
    if (!localStorage.getItem('ios-instructions-shown')) {
      alert('Para instalar: Tocá el botón compartir y luego "Agregar a pantalla de inicio"');
      localStorage.setItem('ios-instructions-shown', 'true');
    }
  }
}
```

## Deployment con Docker

### Frontend Dockerfile

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration=production

FROM nginx:alpine
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### docker-compose.yml actualizado

```yaml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
    networks:
      - sasvin-network
    
  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/sasvin
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    networks:
      - sasvin-network
      
  db:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=sasvin
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - sasvin-network
      
  redis:
    image: redis:7-alpine
    networks:
      - sasvin-network

volumes:
  postgres_data:

networks:
  sasvin-network:
```

## Optimizaciones Específicas para Catedráticos

### 1. Modo Offline Robusto

```typescript
// attendance.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private http = inject(HttpClient);
  private db: IDBDatabase | null = null;
  
  constructor() {
    this.initIndexedDB();
  }
  
  private async initIndexedDB() {
    const request = indexedDB.open('sasvin-offline', 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as any).result;
      if (!db.objectStoreNames.contains('pending_attendance')) {
        db.createObjectStore('pending_attendance', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
      }
    };
    
    request.onsuccess = (event) => {
      this.db = (event.target as any).result;
    };
  }
  
  checkIn(data: any) {
    return this.http.post('/api/attendance/check-in', data).pipe(
      catchError(error => {
        // Si falla, guardar offline
        if (!navigator.onLine) {
          return from(this.saveOffline(data));
        }
        throw error;
      })
    );
  }
  
  private async saveOffline(data: any) {
    if (!this.db) await this.initIndexedDB();
    
    const transaction = this.db!.transaction(['pending_attendance'], 'readwrite');
    const store = transaction.objectStore('pending_attendance');
    
    const record = {
      ...data,
      timestamp: new Date().toISOString(),
      synced: false
    };
    
    store.add(record);
    
    return { 
      success: true, 
      offline: true,
      message: 'Guardado offline. Se sincronizará cuando haya conexión.' 
    };
  }
  
  async syncOfflineRecords() {
    if (!this.db || !navigator.onLine) return;
    
    const transaction = this.db.transaction(['pending_attendance'], 'readwrite');
    const store = transaction.objectStore('pending_attendance');
    const records = await store.getAll();
    
    for (const record of records.result) {
      try {
        await this.http.post('/api/attendance/check-in', record).toPromise();
        store.delete(record.id);
      } catch (error) {
        console.error('Failed to sync record:', record.id);
      }
    }
  }
}

// Agregar listener para sync cuando vuelve online
window.addEventListener('online', () => {
  const service = inject(AttendanceService);
  service.syncOfflineRecords();
});
```

### 2. Validación de Geolocalización Mejorada

```typescript
// geo-validator.service.ts
interface Sede {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

@Injectable({ providedIn: 'root' })
export class GeoValidatorService {
  
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }
  
  findNearestSede(position: GeoPosition, sedes: Sede[]): Sede & { distance: number } | null {
    let nearest = null;
    let minDistance = Infinity;
    
    for (const sede of sedes) {
      const distance = this.calculateDistance(
        position.latitude,
        position.longitude,
        sede.latitude,
        sede.longitude
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = { ...sede, distance };
      }
    }
    
    return nearest;
  }
  
  isWithinSede(position: GeoPosition, sede: Sede): boolean {
    const distance = this.calculateDistance(
      position.latitude,
      position.longitude,
      sede.latitude,
      sede.longitude
    );
    
    return distance <= sede.radius_meters;
  }
}
```

## Testing PWA

### En Desktop (Chrome/Edge)
1. Abrir Chrome DevTools
2. Application > Service Workers - verificar que esté activo
3. Application > Manifest - verificar que esté correcto
4. Lighthouse > Generate report - debe dar 100% en PWA

### En Android
1. Chrome Android > Menú > "Agregar a pantalla de inicio"
2. Verificar que abra en modo standalone
3. Probar offline mode

### En iOS
1. Safari > Compartir > "Agregar a pantalla de inicio"
2. Verificar que funcione la cámara y GPS
3. Limitación: no hay notificaciones push

## URLs de Deploy

```
# Producción
https://app.sasvin.edu.gt

# Staging
https://staging.sasvin.edu.gt

# Kiosko mode (pantalla completa)
https://app.sasvin.edu.gt/kiosk
```

## Métricas a Monitorear

1. **Instalación PWA**: % de usuarios que instalan
2. **Uso offline**: Frecuencia de guardado offline
3. **Performance**: Tiempo de carga inicial
4. **Engagement**: Sesiones por usuario
5. **GPS accuracy**: Precisión promedio obtenida