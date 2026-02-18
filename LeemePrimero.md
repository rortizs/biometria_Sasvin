# Sistema de Control de Asistencia Biométrica — Sasvin

## ¿Qué es este proyecto?

Sistema de **control de asistencia biométrico** para instituciones (originalmente orientado a MIUMG). Permite registrar la asistencia de empleados mediante **reconocimiento facial** en tiempo real, con validaciones de:

- **Anti-spoofing** (detección de vida, evita fotos/videos)
- **Geolocalización GPS** (el empleado debe estar físicamente en la sede)
- **Detección de fraude** (viaje imposible, check-ins concurrentes, anomalías de dispositivo)

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│         Angular 20 · Standalone Components           │
│              Signals · Lazy Loading                  │
│                  puerto: 4200                        │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP / REST
┌─────────────────────▼───────────────────────────────┐
│                    Backend                           │
│          FastAPI (Python 3.11) · Async               │
│     Face Recognition · Anti-Spoofing · PostGIS       │
│                  puerto: 8000                        │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
┌──────────▼──────┐    ┌──────────▼──────────────────┐
│   PostgreSQL    │    │          Redis               │
│   + PostGIS     │    │  Rate Limiting · Cache       │
│   puerto: 5432  │    │       puerto: 6379           │
└─────────────────┘    └─────────────────────────────┘
```

**Stack completo:**
- **Frontend**: Angular 20, Standalone Components, Signals, Leaflet (mapas)
- **Backend**: FastAPI, SQLAlchemy async, Alembic, asyncpg
- **Face Recognition**: `face_recognition` (dlib), OpenCV headless, ONNX Runtime
- **Geolocalización**: GeoAlchemy2, Shapely, PostGIS (Geography POINT WGS84)
- **Seguridad**: JWT (python-jose), bcrypt, Rate Limiting (fastapi-limiter + Redis)
- **Infraestructura**: Docker, Docker Compose, PostgreSQL + PostGIS

---

## Módulos del sistema

### Backend — Endpoints (`/api/v1/`)

| Módulo | Ruta | Descripción |
|---|---|---|
| Auth | `/auth` | Login, Register, Refresh token, /me |
| Empleados | `/employees` | CRUD de empleados |
| Rostros | `/faces` | Registro y gestión de embeddings faciales |
| Asistencia | `/attendance` | Check-in/check-out con validación biométrica completa |
| Ubicaciones | `/locations` | CRUD de sedes (con coordenadas PostGIS) |
| Departamentos | `/departments` | CRUD de departamentos |
| Cargos | `/positions` | CRUD de cargos/puestos |
| Horarios | `/schedules` | Patrones de horario y asignaciones |
| Configuración | `/settings` | Configuración global de la institución (singleton) |

### Frontend — Rutas

| Ruta | Descripción |
|---|---|
| `/kiosk` | Quiosco biométrico (vista del empleado para fichar) |
| `/auth/login` | Login de administradores |
| `/admin/dashboard` | Panel principal |
| `/admin/employees` | Gestión de empleados |
| `/admin/attendance` | Historial de asistencia |
| `/admin/locations` | Gestión de sedes |
| `/admin/schedules` | Gestión de horarios |
| `/admin/settings` | Configuración del sistema |

---

## Cómo levantar el proyecto

### Requisitos
- Docker Desktop corriendo
- Node.js (para el frontend)
- Python 3.11+ con venv (para correr el backend local)

### Opción A — Backend en Docker (recomendado para producción)
```bash
# Desde la raíz del proyecto
docker-compose up -d

# Verificar que todos los servicios estén healthy
docker-compose ps
```

### Opción B — Backend manual (recomendado para desarrollo)
```bash
# Infraestructura (DB + Redis) en Docker
docker-compose up -d db redis

# Backend manual con hot-reload
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (siempre manual)
```bash
cd frontend
npm start -- --host 0.0.0.0
```

### Migraciones (primera vez o después de cambios de modelo)
```bash
cd backend
source venv/bin/activate
alembic upgrade head
```

### Primer usuario admin
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@biometria.com",
    "password": "admin123",
    "full_name": "Administrador",
    "role": "admin"
  }'
```

---

## Estado del repositorio

| Campo | Valor |
|---|---|
| **Repositorio** | https://github.com/rortizs/biometria_Sasvin |
| **Rama activa** | `feature/anti-spoofing-postgis` |
| **Último commit** | `ab3ca42` — fix(settings,employees): first-setup UI + trailing slash fixes |
| **Estado** | ✅ Sincronizado con `origin` |

### Historial reciente
| Commit | Descripción |
|---|---|
| `214b83c` | fix(locations): build PostGIS location_point from lat/lon on create + LeemePrimero.md |
| `fa07d1b` | feat: integrate complete anti-fraud stack in attendance endpoints |
| `3dd5611` | feat: implement anti-spoofing service with liveness detection |
| `b3a2949` | feat: implement PostGIS geolocation and fraud detection services |
| `ffcce82` | feat: update SQLAlchemy models and Pydantic schemas for PostGIS and anti-spoofing |
| `ff73de2` | feat: add PostGIS geography columns and anti-spoofing database fields |

---

## URLs útiles

| Servicio | URL |
|---|---|
| Frontend | http://localhost:4200 |
| Backend API | http://localhost:8000 |
| Swagger / Docs | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Health check | http://localhost:8000/health |

---

## Plan de desarrollo

### Infraestructura y setup
- [x] Docker Compose (PostgreSQL + PostGIS, Redis, Backend)
- [x] Dockerfile del backend con dlib/face_recognition compilado
- [x] Migraciones Alembic (4 migraciones, schema completo)
- [x] CORS configurado para Angular
- [x] JWT auth (access token + refresh token)
- [x] Rate limiting con Redis
- [ ] Docker Compose para frontend (producción)
- [ ] Variables de entorno documentadas (`.env.example`)
- [ ] CI/CD pipeline

### Backend — Módulos
- [x] Auth (login, register, refresh, /me)
- [x] Empleados (CRUD)
- [x] Ubicaciones/Sedes (CRUD con PostGIS Geography)
- [x] Departamentos (CRUD)
- [x] Cargos/Posiciones (CRUD)
- [x] Horarios (patrones y asignaciones)
- [x] Configuración global (singleton)
- [x] Face Recognition Service (dlib embeddings)
- [x] Anti-Spoofing Service (ONNX Runtime)
- [x] Fraud Detection Service (viaje imposible, check-ins concurrentes, anomalías)
- [x] Geolocalización PostGIS (validación de proximidad)
- [x] Asistencia — Check-in con stack completo (anti-spoofing + face + geo + fraude)
- [x] Asistencia — Check-out
- [ ] Asistencia — Reportes y exportación (CSV/Excel)
- [ ] Notificaciones (email/push al detectar fraude)
- [ ] Endpoint de estadísticas del dashboard
- [ ] Seed data inicial (configuración + ubicación por defecto)

### Frontend — Módulos
- [x] Auth (login con JWT)
- [x] Guards (authGuard, adminGuard, guestGuard)
- [x] Interceptor de autenticación (Bearer token + refresh automático)
- [x] Kiosk (vista de check-in biométrico)
- [x] Dashboard admin
- [x] Gestión de empleados
- [x] Gestión de ubicaciones (con mapa Leaflet)
- [x] Gestión de horarios
- [x] Historial de asistencia
- [x] Configuración del sistema
- [ ] Registro facial de empleados (UI para capturar rostro)
- [x] Dashboard con estadísticas reales (employees + attendance/today conectados al backend)
- [ ] Reportes de asistencia (filtros, exportación)
- [ ] Gestión de departamentos (UI)
- [ ] Gestión de cargos (UI)
- [ ] Manejo de errores global (toast/snackbar)
- [ ] Tests unitarios (Jasmine/Karma)

### Seguridad y calidad
- [x] Anti-spoofing (liveness detection)
- [x] Detección de fraude multi-capa
- [x] Roles (admin / supervisor / employee)
- [ ] 2FA para administradores
- [ ] Auditoría de acciones admin (logs)
- [ ] Tests del backend (pytest)
- [ ] Tests E2E

---

## Registro de Issues

### Resueltos ✅

| # | Fecha | Issue | Causa | Fix |
|---|---|---|---|---|
| 1 | 2026-02-17 | Módulo `geoalchemy2` faltante al iniciar el backend en Docker | Imagen de 2 semanas sin el módulo instalado. Capa de pip cacheada con versión vieja | Rebuild completo con `--no-cache`. Liberado espacio de Docker primero (prune de imágenes viejas) |
| 2 | 2026-02-17 | `ERR_CONNECTION_REFUSED` en frontend | `ng serve` escuchaba en IPv6 (`::1`) y el browser no conectaba | Reiniciado con `--host 0.0.0.0` |
| 3 | 2026-02-17 | `405 Method Not Allowed` en `/api/v1/auth/login` | App Laravel corriendo en el mismo puerto 8000 pisaba al FastAPI | Killed el proceso PHP (`kill <PID>`) |
| 4 | 2026-02-17 | `500 Internal Server Error` en `POST /locations/` | Campo `location_point` (PostGIS Geography NOT NULL) no se construía. El endpoint hacía `Location(**location_in.model_dump())` sin armar el WKT Point | Fix en `locations.py`: construir `location_point` con `from_shape(Point(lon, lat), srid=4326)` antes de crear el objeto |
| 5 | 2026-02-17 | CORS bloqueando response del 500 de locations | FastAPI no agrega headers CORS en excepciones no manejadas (500 puro) | Resuelto al corregir el issue #4 |
| 6 | 2026-02-17 | `404 GET /settings/` | DB vacía, no hay registro de configuración inicial | Comportamiento esperado. Pendiente: seed data o UI para crear settings desde cero |

| 7 | 2026-02-17 | `POST /employees` (sin trailing slash) devolvía 307 redirect | Inconsistencia trailing slash entre frontend y backend | Fix en `employee.service.ts` y `attendance.service.ts`: agregar `/` a las rutas de listado y creación |
| 8 | 2026-02-17 | `GET /settings/` devuelve 404 → frontend mostraba solo "No se pudo cargar" sin forma de crear | Frontend no manejaba el 404 como primer setup | Fix en `settings.component.ts`: detectar 404 → mostrar formulario vacío con botón "Crear Configuración". Fix en `settings.service.ts`: agregar `createSettings()`. Fix en `settings.model.ts`: agregar interfaz `SettingsCreate`. Config inicial creada en DB. |

### Pendientes / En investigación 🔍

| # | Fecha | Issue | Estado |
|---|---|---|---|
| 9 | 2026-02-18 | Registro facial de empleados — UI no implementada | Pendiente: UI para capturar rostro via webcam y llamar a `POST /faces/register` |
| 10 | 2026-02-18 | Dashboard: `withFaceRegistered` correcta (de `has_face_registered` en empleados) pero `presentToday` depende de check-ins reales | Funcionando con datos reales. Pendiente probar con check-in real |

---

## Notas de entorno

- El proyecto tiene **DOS PostgreSQL** en la misma máquina: uno local de macOS (puerto 5432 IPv6) y el de Docker (puerto 5432 IPv4 vía Docker Desktop). Alembic conecta al local via `localhost`. Si se cambia a Docker-only, actualizar `DATABASE_URL` en el `.env` del backend para apuntar a `127.0.0.1` con las credenciales del Docker DB.
- La imagen Docker del backend pesa ~5GB por dlib compilado. El rebuild sin cache tarda ~15 minutos.
- El frontend usa Angular 20 con standalone components y signals (sin NgModules, sin Zone.js en el futuro).
