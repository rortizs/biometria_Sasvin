# 🚀 Arquitectura PWA para Sistema Biométrico SASVIN

## Stack Tecnológico Recomendado

### Frontend PWA
```typescript
// Stack Principal
- Next.js 14 (App Router)
- TypeScript 
- Tailwind CSS
- Zustand (estado global)
- React Query (data fetching)
- Workbox (service workers)
```

### Backend (Ya existente)
```python
- FastAPI
- PostgreSQL + pgvector
- Redis (cache)
- Docker (deployment)
```

## Estructura del Proyecto

```
biometria-pwa/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── (admin)/
│   │   ├── sedes/
│   │   │   ├── page.tsx         # Lista de sedes
│   │   │   ├── nueva/
│   │   │   │   └── page.tsx     # Crear sede
│   │   │   └── [id]/
│   │   │       └── edit/page.tsx # Editar sede
│   │   ├── reportes/
│   │   └── layout.tsx
│   │
│   ├── (catedratico)/
│   │   ├── asistencia/
│   │   │   ├── marcar/
│   │   │   │   └── page.tsx     # Marcar asistencia
│   │   │   └── historial/
│   │   │       └── page.tsx     # Ver historial
│   │   └── layout.tsx
│   │
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   ├── sedes/
│   │   └── asistencia/
│   │
│   ├── manifest.json
│   └── layout.tsx
│
├── components/
│   ├── GeoLocationValidator.tsx
│   ├── CameraCapture.tsx
│   ├── OfflineSync.tsx
│   └── InstallPrompt.tsx
│
├── hooks/
│   ├── useGeolocation.ts
│   ├── useCamera.ts
│   └── useOffline.ts
│
├── lib/
│   ├── db.ts
│   ├── auth.ts
│   └── pwa.ts
│
├── public/
│   ├── icons/
│   └── service-worker.js
│
└── package.json
```

## Componentes Clave

### 1. Validador de Geolocalización
```typescript
// components/GeoLocationValidator.tsx
import { useState, useEffect } from 'react';
import { calculateDistance } from '@/lib/geo';

interface Sede {
  id: string;
  nombre: string;
  latitud: number;
  longitud: number;
  radio_metros: number;
}

export function GeoLocationValidator({ 
  sedes, 
  onValidLocation, 
  onInvalidLocation 
}: Props) {
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const [nearestSede, setNearestSede] = useState<Sede | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation(position);
          validateLocation(position);
          setLoading(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          setLoading(false);
          onInvalidLocation('No se pudo obtener ubicación');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }
  }, []);

  const validateLocation = (position: GeolocationPosition) => {
    let closest = null;
    let minDistance = Infinity;

    sedes.forEach(sede => {
      const distance = calculateDistance(
        position.coords.latitude,
        position.coords.longitude,
        sede.latitud,
        sede.longitud
      );

      if (distance < minDistance) {
        minDistance = distance;
        closest = { ...sede, distance };
      }
    });

    if (closest && closest.distance <= closest.radio_metros) {
      setNearestSede(closest);
      setIsValid(true);
      onValidLocation(closest, position);
    } else {
      setIsValid(false);
      onInvalidLocation(
        `Estás a ${Math.round(minDistance)}m de la sede más cercana. 
         Debes estar a menos de ${closest?.radio_metros}m`
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-2">Obteniendo ubicación...</span>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg ${isValid ? 'bg-green-50' : 'bg-red-50'}`}>
      {isValid ? (
        <div>
          <p className="text-green-600 font-semibold">✅ Ubicación válida</p>
          <p className="text-sm">Sede: {nearestSede?.nombre}</p>
          <p className="text-xs text-gray-600">
            Precisión: ±{location?.coords.accuracy.toFixed(0)}m
          </p>
        </div>
      ) : (
        <div>
          <p className="text-red-600 font-semibold">❌ Fuera de rango</p>
          <p className="text-sm">Debes estar dentro del campus</p>
        </div>
      )}
    </div>
  );
}
```

### 2. Captura de Foto
```typescript
// components/CameraCapture.tsx
import { useRef, useState } from 'react';

export function CameraCapture({ onCapture }: { onCapture: (photo: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
    } catch (err) {
      console.error('Error accessing camera:', err);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        
        const photoData = canvasRef.current.toDataURL('image/jpeg', 0.8);
        setPhoto(photoData);
        onCapture(photoData);
        
        // Detener cámara
        stream?.getTracks().forEach(track => track.stop());
      }
    }
  };

  return (
    <div className="space-y-4">
      {!photo ? (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline
            className="w-full rounded-lg"
          />
          <div className="flex gap-2">
            {!stream ? (
              <button
                onClick={startCamera}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg"
              >
                📸 Abrir Cámara
              </button>
            ) : (
              <button
                onClick={capturePhoto}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg"
              >
                📷 Capturar Foto
              </button>
            )}
          </div>
        </>
      ) : (
        <div>
          <img src={photo} alt="Selfie" className="w-full rounded-lg" />
          <button
            onClick={() => {
              setPhoto(null);
              startCamera();
            }}
            className="mt-2 text-blue-600 underline"
          >
            Tomar otra foto
          </button>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
```

### 3. Service Worker para Offline
```javascript
// public/service-worker.js
const CACHE_NAME = 'biometria-v1';
const urlsToCache = [
  '/',
  '/asistencia/marcar',
  '/offline.html'
];

// Instalar SW
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activar SW
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interceptar requests
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/asistencia')) {
    // Si es POST de asistencia y estamos offline, guardar en IndexedDB
    event.respondWith(
      fetch(event.request.clone())
        .catch(() => {
          if (event.request.method === 'POST') {
            return event.request.json().then(data => {
              return saveOfflineAttendance(data);
            });
          }
        })
    );
  } else {
    // Cache first para assets
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
  }
});

// Sincronización cuando vuelve online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncOfflineAttendance());
  }
});

// Guardar asistencia offline
async function saveOfflineAttendance(data) {
  const db = await openDB();
  const tx = db.transaction('pending_attendance', 'readwrite');
  await tx.objectStore('pending_attendance').add({
    ...data,
    timestamp: new Date().toISOString(),
    synced: false
  });
  
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    message: 'Asistencia guardada. Se enviará cuando haya conexión.'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Sincronizar cuando hay conexión
async function syncOfflineAttendance() {
  const db = await openDB();
  const tx = db.transaction('pending_attendance', 'readwrite');
  const store = tx.objectStore('pending_attendance');
  const pending = await store.getAll();
  
  for (const record of pending) {
    try {
      const response = await fetch('/api/asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      
      if (response.ok) {
        await store.delete(record.id);
      }
    } catch (error) {
      console.error('Error syncing:', error);
    }
  }
}
```

### 4. Página Principal de Marcar Asistencia
```typescript
// app/(catedratico)/asistencia/marcar/page.tsx
'use client';

import { useState } from 'react';
import { GeoLocationValidator } from '@/components/GeoLocationValidator';
import { CameraCapture } from '@/components/CameraCapture';
import { useAuth } from '@/hooks/useAuth';
import { useSedes } from '@/hooks/useSedes';
import { useAsistencia } from '@/hooks/useAsistencia';

export default function MarcarAsistencia() {
  const { user } = useAuth();
  const { sedes } = useSedes();
  const { marcarAsistencia, loading } = useAsistencia();
  
  const [step, setStep] = useState<'location' | 'photo' | 'confirm' | 'done'>('location');
  const [locationData, setLocationData] = useState(null);
  const [photoData, setPhotoData] = useState(null);
  const [sede, setSede] = useState(null);

  const handleValidLocation = (validSede, position) => {
    setSede(validSede);
    setLocationData({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    });
    setStep('photo');
  };

  const handlePhotoCapture = (photo) => {
    setPhotoData(photo);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    try {
      await marcarAsistencia({
        catedratico_id: user.id,
        sede_id: sede.id,
        ubicacion: locationData,
        foto: photoData,
        timestamp: new Date().toISOString()
      });
      setStep('done');
    } catch (error) {
      alert('Error al marcar asistencia');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white p-4">
        <h1 className="text-xl font-bold">Marcar Asistencia</h1>
        <p className="text-sm opacity-90">{user?.nombre}</p>
      </header>

      <div className="p-4 max-w-lg mx-auto">
        {/* Step 1: Validar Ubicación */}
        {step === 'location' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Paso 1: Verificar Ubicación</h2>
            <GeoLocationValidator
              sedes={sedes}
              onValidLocation={handleValidLocation}
              onInvalidLocation={(msg) => {
                alert(msg);
              }}
            />
          </div>
        )}

        {/* Step 2: Tomar Foto */}
        {step === 'photo' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Paso 2: Tomar Selfie</h2>
            <CameraCapture onCapture={handlePhotoCapture} />
          </div>
        )}

        {/* Step 3: Confirmar */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Paso 3: Confirmar Asistencia</h2>
            
            <div className="bg-white p-4 rounded-lg shadow">
              <p><strong>Sede:</strong> {sede?.nombre}</p>
              <p><strong>Hora:</strong> {new Date().toLocaleTimeString()}</p>
              <p><strong>Fecha:</strong> {new Date().toLocaleDateString()}</p>
            </div>

            <div className="bg-white p-2 rounded-lg shadow">
              <img src={photoData} alt="Tu foto" className="w-32 h-32 mx-auto rounded-full" />
            </div>

            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold"
            >
              {loading ? 'Enviando...' : '✅ Confirmar Asistencia'}
            </button>
          </div>
        )}

        {/* Step 4: Éxito */}
        {step === 'done' && (
          <div className="text-center space-y-4">
            <div className="text-6xl">✅</div>
            <h2 className="text-2xl font-bold text-green-600">
              ¡Asistencia Marcada!
            </h2>
            <p className="text-gray-600">
              Tu asistencia ha sido registrada exitosamente
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg"
            >
              Marcar otra asistencia
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

## Configuración PWA

### manifest.json
```json
{
  "name": "Sistema Biométrico SASVIN",
  "short_name": "SASVIN",
  "description": "Control de asistencia para catedráticos",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "categories": ["business", "education", "productivity"]
}
```

### next.config.js con PWA
```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

module.exports = withPWA({
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'api.sasvin.com']
  }
});
```

## API Endpoints Necesarios

### Backend FastAPI
```python
# Sedes
POST   /api/admin/sedes          # Crear sede
PUT    /api/admin/sedes/{id}     # Editar sede
GET    /api/sedes                 # Listar sedes activas
GET    /api/sedes/nearest?lat=&lng=  # Sede más cercana

# Asistencia
POST   /api/asistencia            # Marcar asistencia
GET    /api/asistencia/historial  # Historial del catedrático
GET    /api/asistencia/validar    # Validar si puede marcar

# Reportes (Admin)
GET    /api/admin/reportes/diario
GET    /api/admin/reportes/semanal
GET    /api/admin/reportes/por-sede
```

## Deployment

### Vercel (Recomendado para PWA)
```bash
npm install -g vercel
vercel --prod
```

### Docker para self-host
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
RUN npm ci --production
EXPOSE 3000
CMD ["npm", "start"]
```