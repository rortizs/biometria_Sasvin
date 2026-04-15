# Sistema Biométrico de Asistencia — UMG / SistemasLab

Sistema web para registrar la asistencia de catedráticos usando **reconocimiento facial** y **geolocalización**. Los catedráticos se acercan a un kiosco (tablet/PC con cámara), el sistema reconoce su rostro y registra su entrada o salida automáticamente.

---

## 📋 Índice

1. [¿Qué hace este sistema?](#qué-hace-este-sistema)
2. [Arquitectura general](#arquitectura-general)
3. [Estructura de carpetas](#estructura-de-carpetas)
4. [Backend — FastAPI](#backend--fastapi)
5. [Frontend — Angular PWA](#frontend--angular-pwa)
6. [Base de datos](#base-de-datos)
7. [Cómo correr el proyecto localmente](#cómo-correr-el-proyecto-localmente)
8. [Variables de entorno](#variables-de-entorno)
9. [Migraciones de base de datos](#migraciones-de-base-de-datos)
10. [API — Endpoints disponibles](#api--endpoints-disponibles)
11. [Flujo de autenticación](#flujo-de-autenticación)
12. [Flujo de reconocimiento facial](#flujo-de-reconocimiento-facial)
13. [Deploy en producción](#deploy-en-producción)

---

## ¿Qué hace este sistema?

El sistema tiene **dos roles principales**:

### 👤 Catedrático (usuario del kiosco)
1. Se para frente a la cámara del kiosco
2. Presiona el botón "Marcar Asistencia"
3. El sistema toma una foto, detecta su rostro y lo compara con los registrados
4. Si hay coincidencia → registra su entrada o salida con hora y ubicación GPS

### 🔧 Administrador (panel web)
- Registra empleados/catedráticos
- Registra el rostro de cada empleado (sube 1-5 fotos)
- Ve el reporte de asistencia por día
- Configura sedes (ubicaciones permitidas con radio en metros)
- Gestiona departamentos, puestos y horarios

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────┐
│                    INTERNET                          │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────┐
│              Traefik (reverse proxy)                 │
│  asistencia.sistemaslab.dev → frontend/backend       │
└───────────┬─────────────────────────┬───────────────┘
            │                         │
            ▼                         ▼
┌───────────────────┐      ┌─────────────────────┐
│  Frontend         │      │  Backend             │
│  Angular 20 PWA   │      │  FastAPI (Python)    │
│  nginx:alpine     │      │  uvicorn             │
│  puerto 80        │      │  puerto 8000         │
└───────────────────┘      └──────────┬──────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │  PostgreSQL + pgvector│
                           │  puerto 5432          │
                           │  Guarda embeddings   │
                           │  faciales como       │
                           │  vectores de 128D    │
                           └─────────────────────┘
```

> **¿Qué es pgvector?** Es una extensión de PostgreSQL que permite guardar y buscar **vectores matemáticos** de forma eficiente. Un "embedding facial" es básicamente un arreglo de 128 números que representa matemáticamente un rostro. pgvector permite comparar miles de rostros en milisegundos usando distancia coseno.

---

## Estructura de carpetas

```
biometria_Sasvin/
│
├── backend/                    # API en Python/FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py         # Dependencias compartidas (auth, db session)
│   │   │   └── v1/
│   │   │       ├── router.py   # Registra todos los endpoints
│   │   │       └── endpoints/  # Un archivo por recurso
│   │   │           ├── auth.py
│   │   │           ├── employees.py
│   │   │           ├── faces.py
│   │   │           ├── attendance.py
│   │   │           ├── departments.py
│   │   │           ├── positions.py
│   │   │           ├── locations.py
│   │   │           ├── schedules.py
│   │   │           └── settings.py
│   │   ├── core/
│   │   │   ├── config.py       # Variables de entorno (lee el .env)
│   │   │   └── security.py     # JWT tokens + bcrypt passwords
│   │   ├── db/
│   │   │   ├── base.py         # Clase Base de SQLAlchemy
│   │   │   └── session.py      # Conexión async a PostgreSQL
│   │   ├── models/             # Tablas de la base de datos
│   │   │   ├── user.py
│   │   │   ├── employee.py
│   │   │   ├── face_embedding.py
│   │   │   ├── attendance.py
│   │   │   ├── department.py
│   │   │   ├── position.py
│   │   │   ├── location.py
│   │   │   ├── schedule.py
│   │   │   └── settings.py
│   │   ├── schemas/            # Validación de datos de entrada/salida (Pydantic)
│   │   ├── services/
│   │   │   ├── face_recognition.py  # Lógica de reconocimiento facial
│   │   │   └── geolocation.py       # Validación de ubicación GPS
│   │   └── main.py             # Punto de entrada de FastAPI
│   ├── alembic/                # Migraciones de base de datos
│   ├── requirements.txt        # Dependencias Python
│   └── Dockerfile
│
├── frontend/                   # App Angular 20
│   └── src/app/
│       ├── core/
│       │   ├── guards/         # authGuard, adminGuard, guestGuard
│       │   ├── interceptors/   # Agrega el token JWT a cada request
│       │   ├── models/         # Interfaces TypeScript
│       │   └── services/       # Servicios HTTP y utilidades
│       └── features/
│           ├── kiosk/          # Pantalla principal del kiosco (tablet)
│           ├── attendance/     # Escaneo de asistencia (móvil)
│           ├── auth/           # Login del administrador
│           └── admin/          # Panel de administración
│               └── pages/
│                   ├── dashboard/
│                   ├── employees/
│                   ├── attendance/
│                   ├── locations/
│                   ├── schedules/
│                   └── settings/
│
├── docker-compose.yml          # Orquesta los 3 servicios (db, backend, frontend)
└── .env                        # Variables de entorno (NO subir a git)
```

---

## Backend — FastAPI

### ¿Por qué FastAPI?

FastAPI es un framework moderno de Python para construir APIs. Las razones de usarlo aquí:
- Soporte **async/await** nativo → ideal para operaciones de base de datos concurrentes
- Validación automática con **Pydantic** → si mandan datos incorrectos, devuelve error claro
- Documentación automática en `/docs` → el dev puede probar todos los endpoints desde el navegador

### Capas del backend

```
Request HTTP
    ↓
Middleware CORS (permite peticiones del frontend)
    ↓
Router → endpoint específico (ej: POST /api/v1/attendance/check-in)
    ↓
Dependencias (deps.py):
  - get_db → abre sesión de base de datos
  - get_current_user → valida el JWT token
    ↓
Lógica del endpoint (llama services si es necesario)
    ↓
Service (ej: FaceRecognitionService)
    ↓
SQLAlchemy → PostgreSQL
    ↓
Response JSON
```

### Autenticación (JWT)

El sistema usa **JSON Web Tokens (JWT)**. Así funciona:

1. Admin hace POST `/api/v1/auth/login` con email y password
2. Backend verifica con bcrypt que la contraseña es correcta
3. Devuelve dos tokens:
   - `access_token`: válido 30 minutos, se usa en cada request
   - `refresh_token`: válido 7 días, se usa para renovar el access_token
4. El frontend guarda el token y lo manda en el header: `Authorization: Bearer <token>`

> **Nota importante**: Los endpoints del kiosco (`/attendance/check-in` y `/attendance/check-out`) **NO requieren autenticación** — cualquiera puede hacer check-in porque el rostro es la autenticación. Los endpoints del panel admin SÍ requieren token.

### Reconocimiento facial

El flujo completo de un check-in:

```
1. Frontend captura 3 fotos con 250ms de diferencia (anti-spoofing básico)
2. Las fotos se convierten a base64 y se mandan al backend

3. Backend recibe la primera imagen
4. face_recognition.face_locations() → detecta si hay un rostro en la imagen
5. face_recognition.face_encodings() → extrae el vector de 128 números del rostro
6. Se hace una query a PostgreSQL con pgvector:
      SELECT embedding <=> :query_vector AS distance
      FROM face_embeddings
      ORDER BY distance LIMIT 1
   El operador <=> calcula la distancia coseno entre vectores
7. Si la distancia es menor al umbral (0.6 por defecto) → hay coincidencia
8. Se guarda el registro de asistencia con hora, confianza y GPS
```

### Validación de geolocalización

Usa la **fórmula de Haversine** para calcular la distancia entre dos coordenadas GPS en metros. Si el catedrático está a más metros del radio configurado para su sede → el registro se guarda pero se marca como `geo_validated = false`.

---

## Frontend — Angular PWA

### ¿Qué es una PWA?

Una Progressive Web App es una página web que se puede "instalar" en el dispositivo y funciona como aplicación nativa. En este sistema significa:
- La tablet del kiosco puede tener el sistema "instalado" sin App Store
- Funciona con pantalla completa (fullscreen)
- Se actualiza automáticamente (el kiosco revisa actualizaciones cada 6 horas)

### Rutas de la aplicación

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/` | → redirige a `/kiosk` | |
| `/kiosk` | `KioskComponent` | Pantalla del kiosco (tablet, modo horizontal) |
| `/attendance` | `AttendanceScanComponent` | Escaneo desde móvil personal |
| `/auth/login` | `LoginComponent` | Login del administrador |
| `/admin/dashboard` | `DashboardComponent` | Panel admin — solo accesible con token |
| `/admin/employees` | `EmployeesComponent` | Gestión de empleados |
| `/admin/attendance` | `AttendanceComponent` | Reportes de asistencia |
| `/admin/locations` | `LocationsComponent` | Gestión de sedes |
| `/admin/schedules` | `SchedulesComponent` | Horarios |
| `/admin/settings` | `SettingsComponent` | Configuración del sistema |

### Guards de rutas

- `authGuard` → redirige a `/auth/login` si no hay token válido
- `adminGuard` → verifica que el rol sea `admin` o `supervisor`
- `guestGuard` → redirige a `/admin/dashboard` si ya estás logueado (evita ir al login dos veces)

### Servicios principales

| Servicio | Función |
|---------|---------|
| `api.service.ts` | Base para todos los HTTP requests (URL base, headers) |
| `auth.service.ts` | Login, logout, manejo del token JWT en localStorage |
| `attendance.service.ts` | checkIn(), checkOut() |
| `camera.service.ts` | Accede a la cámara del dispositivo, captura frames |
| `geolocation.service.ts` | Obtiene coordenadas GPS del navegador |
| `employee.service.ts` | CRUD de empleados |
| `platform.service.ts` | Detecta si es tablet, móvil, o si corre en Capacitor |

---

## Base de datos

### Tablas principales

```sql
users                    -- Administradores del sistema
  id UUID PK
  email VARCHAR UNIQUE
  hashed_password VARCHAR
  full_name VARCHAR
  role VARCHAR            -- 'admin' | 'supervisor'
  is_active BOOLEAN

employees                -- Catedráticos
  id UUID PK
  employee_code VARCHAR UNIQUE  -- código interno
  first_name, last_name VARCHAR
  email VARCHAR
  department_id UUID FK → departments
  position_id UUID FK → positions
  location_id UUID FK → locations  -- sede asignada para geo-validación
  is_active BOOLEAN

face_embeddings          -- Vectores faciales de cada empleado
  id UUID PK
  employee_id UUID FK → employees
  embedding Vector(128)  -- el rostro en formato matemático
  is_primary BOOLEAN     -- si hay varios, cuál es el principal

attendance_records       -- Registro de asistencia
  id UUID PK
  employee_id UUID FK → employees
  record_date DATE
  check_in DATETIME
  check_out DATETIME
  check_in_confidence FLOAT    -- qué tan seguro estuvo el reconocimiento (0-1)
  geo_validated BOOLEAN        -- si estaba dentro del radio de su sede
  check_in_latitude FLOAT
  check_in_longitude FLOAT
  -- Constraint: un empleado solo puede tener un registro por día

locations                -- Sedes / lugares permitidos
  id UUID PK
  name VARCHAR
  latitude, longitude FLOAT
  radius_meters INT      -- radio en metros dentro del cual es válido el registro

departments              -- Facultades / departamentos
positions                -- Cargos
schedules                -- Horarios de entrada/salida por sede
```

---

## Cómo correr el proyecto localmente

### Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado
- Git instalado
- No necesitás tener Python ni Node.js instalados — Docker lo maneja todo

### Pasos

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd biometria_Sasvin

# 2. Crear el archivo de variables de entorno
cp .env.example .env
# Editar .env con tus valores (ver sección Variables de entorno)

# 3. Levantar todos los servicios
docker compose up --build

# La primera vez tarda ~5-10 minutos porque:
# - Descarga las imágenes base (Python, PostgreSQL, Node)
# - Compila dlib (librería de reconocimiento facial) — esto es lo más lento
# - Instala dependencias npm y hace el build de Angular

# 4. En otra terminal, correr las migraciones de base de datos
docker exec biometria_api alembic upgrade head

# 5. Crear el usuario administrador inicial
docker exec biometria_api python create_admin_user.py
```

### ¿Qué levanta docker compose?

| Servicio | URL local | Descripción |
|---------|-----------|-------------|
| frontend | http://localhost | Angular app |
| backend API | http://localhost/api/v1 | FastAPI (a través del proxy nginx) |
| backend docs | http://localhost:8000/docs | Swagger UI para probar endpoints |
| PostgreSQL | localhost:5432 | Solo accesible internamente |

### Verificar que todo funciona

```bash
# Ver los containers corriendo
docker ps

# Ver los logs del backend
docker logs biometria_api -f

# Ver los logs del frontend
docker logs biometria_frontend -f
```

---

## Variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# Base de datos
POSTGRES_USER=biometria
POSTGRES_PASSWORD=cambia_esto_en_produccion
POSTGRES_DB=biometria_db

# Backend
SECRET_KEY=una_clave_secreta_larga_y_aleatoria_minimo_32_caracteres
CORS_ORIGINS=http://localhost,http://localhost:4200

# En producción cambiar CORS_ORIGINS por el dominio real:
# CORS_ORIGINS=https://asistencia.sistemaslab.dev
```

> ⚠️ **Nunca subas el archivo `.env` a git.** Ya está en `.gitignore`. Si accidentalmente lo subís, cambiá todas las contraseñas inmediatamente.

---

## Migraciones de base de datos

Las migraciones son archivos que describen los cambios en la estructura de la base de datos. Usamos **Alembic** para esto.

```bash
# Aplicar todas las migraciones pendientes (crear/actualizar tablas)
docker exec biometria_api alembic upgrade head

# Ver el historial de migraciones
docker exec biometria_api alembic history

# Crear una nueva migración cuando modificás un model
docker exec biometria_api alembic revision --autogenerate -m "descripcion del cambio"
# Esto genera un archivo en backend/alembic/versions/
# Revisá el archivo generado antes de aplicarlo

# Revertir la última migración (¡cuidado en producción!)
docker exec biometria_api alembic downgrade -1
```

**¿Cuándo crear una migración?**
Cada vez que modificás un archivo en `backend/app/models/` (agregás una columna, cambiás un tipo, creás una tabla nueva), tenés que crear una migración nueva para que el cambio se aplique a la base de datos.

### Backend: correr tests unitarios sin Docker (macOS)

> ⚙️ *Motivación:* a veces necesitás validar una migración o un servicio sin levantar Docker. Con macOS 14/15 y Python 3.14 podés ejecutar el backend directamente siempre que instales las dependencias nativas (dlib tarda ~2 min en compilar la primera vez).

1. **Crear el entorno virtual** (una sola vez):

   ```bash
   cd biometria_Sasvin
   python3 -m venv backend/.venv
   backend/.venv/bin/pip install -r backend/requirements.txt
   ```

2. **Ejecutar los tests** (necesario correrlos desde la carpeta `backend/` para que tome `backend/.env` y no la raíz):

   ```bash
   cd backend
   source .venv/bin/activate   # opcional si preferís usar `python` directo
   .venv/bin/python -m pytest  # o simplemente `python -m pytest` si activaste el venv
   ```

   Alternativa sin `source`:

   ```bash
   cd backend
   ../backend/.venv/bin/python -m pytest
   ```

3. **Notas importantes**

   - macOS te va a pedir las Xcode Command Line Tools la primera vez que compile `dlib`.
   - Correr Pytest desde la raíz rompe porque toma el `.env` del root (tiene variables `POSTGRES_*` que Pydantic no conoce). Siempre ejecutá `pytest` con `workdir=backend`.
   - El archivo `tests/test_face_resolution.py` contiene pruebas “documentales”. Tres tests (`test_image_size_reduction`, `test_face_recognition_with_reduced_resolution`, `test_three_frame_payload_size`) hoy fallan porque dependen de capturas de cámara reales. Usalos como guía manual (o marcá `-k "not face_resolution"` si querés omitirlos).

---

## API — Endpoints disponibles

La documentación interactiva completa está en `http://localhost:8000/docs` cuando el proyecto está corriendo localmente.

### Autenticación

| Método | Endpoint | Descripción | Auth |
|--------|---------|-------------|------|
| POST | `/api/v1/auth/login` | Login con email y password | No |
| POST | `/api/v1/auth/register` | Crear usuario admin | No |
| POST | `/api/v1/auth/refresh` | Renovar access token | No |
| GET | `/api/v1/auth/me` | Ver datos del usuario logueado | Sí |

### Asistencia (kiosco — sin auth)

| Método | Endpoint | Descripción | Auth |
|--------|---------|-------------|------|
| POST | `/api/v1/attendance/check-in` | Registrar entrada por reconocimiento facial | **No** |
| POST | `/api/v1/attendance/check-out` | Registrar salida por reconocimiento facial | **No** |
| GET | `/api/v1/attendance/` | Listar registros (filtros por fecha, empleado) | Sí |
| GET | `/api/v1/attendance/today` | Registros del día de hoy | Sí |

### Reconocimiento facial

| Método | Endpoint | Descripción | Auth |
|--------|---------|-------------|------|
| POST | `/api/v1/faces/register` | Registrar rostro de un empleado (1-5 fotos) | Sí admin |
| POST | `/api/v1/faces/verify` | Verificar si un rostro coincide con algún empleado | No |
| DELETE | `/api/v1/faces/{employee_id}` | Borrar embeddings de un empleado | Sí admin |

### Empleados

| Método | Endpoint | Descripción | Auth |
|--------|---------|-------------|------|
| GET | `/api/v1/employees/` | Listar empleados | Sí |
| POST | `/api/v1/employees/` | Crear empleado | Sí admin |
| GET | `/api/v1/employees/{id}` | Ver empleado por ID | Sí |
| PUT | `/api/v1/employees/{id}` | Actualizar empleado | Sí admin |
| DELETE | `/api/v1/employees/{id}` | Desactivar empleado | Sí admin |

### Otros recursos (CRUD estándar)

- `/api/v1/departments/` — Departamentos/Facultades
- `/api/v1/positions/` — Puestos/Cargos
- `/api/v1/locations/` — Sedes con coordenadas GPS
- `/api/v1/schedules/` — Horarios
- `/api/v1/settings/` — Configuración del sistema

---

## Flujo de autenticación

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Frontend  │         │   Backend    │         │   Base datos │
└──────┬──────┘         └──────┬───────┘         └──────┬───────┘
       │                       │                        │
       │  POST /auth/login     │                        │
       │  {email, password}    │                        │
       │──────────────────────>│                        │
       │                       │  SELECT user WHERE     │
       │                       │  email = ?             │
       │                       │───────────────────────>│
       │                       │<───────────────────────│
       │                       │  bcrypt.verify(pass)   │
       │                       │  create_access_token() │
       │                       │  create_refresh_token()│
       │  {access_token,       │                        │
       │   refresh_token}      │                        │
       │<──────────────────────│                        │
       │                       │                        │
       │  Guarda tokens en     │                        │
       │  localStorage         │                        │
       │                       │                        │
       │  GET /admin/dashboard │                        │
       │  Header: Bearer token │                        │
       │──────────────────────>│                        │
       │                       │  decode_token(JWT)     │
       │                       │  SELECT user WHERE id  │
       │                       │───────────────────────>│
       │                       │<───────────────────────│
       │  200 OK + datos       │                        │
       │<──────────────────────│                        │
```

---

## Flujo de reconocimiento facial

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│  Cámara      │    │  Frontend    │    │  Backend     │    │ PostgreSQL│
│  (browser)   │    │  Angular     │    │  FastAPI     │    │ pgvector │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └────┬─────┘
       │                   │                   │                  │
       │  stream video     │                   │                  │
       │──────────────────>│                   │                  │
       │                   │                   │                  │
       │            captura 3 frames           │                  │
       │            (250ms entre c/u)          │                  │
       │                   │                   │                  │
       │            convierte a base64         │                  │
       │                   │                   │                  │
       │                   │  POST /attendance/check-in           │
       │                   │  {images: [b64_1, b64_2, b64_3],    │
       │                   │   latitude, longitude}              │
       │                   │──────────────────>│                  │
       │                   │                   │                  │
       │                   │         decodifica imagen[0]         │
       │                   │         face_recognition             │
       │                   │         .face_locations()            │
       │                   │         .face_encodings()            │
       │                   │         → vector de 128 números      │
       │                   │                   │                  │
       │                   │                   │  SELECT con <=>  │
       │                   │                   │  (distancia      │
       │                   │                   │   coseno)        │
       │                   │                   │─────────────────>│
       │                   │                   │<─────────────────│
       │                   │                   │  empleado + dist │
       │                   │                   │                  │
       │                   │         valida geolocalización       │
       │                   │         (Haversine formula)          │
       │                   │                   │                  │
       │                   │         INSERT attendance_record     │
       │                   │                   │─────────────────>│
       │                   │                   │<─────────────────│
       │                   │                   │                  │
       │                   │  {employee_name,  │                  │
       │                   │   check_in time,  │                  │
       │                   │   confidence,     │                  │
       │                   │   geo_validated}  │                  │
       │                   │<──────────────────│                  │
       │                   │                   │                  │
       │            muestra resultado          │                  │
       │            (5 seg y resetea)          │                  │
```

---

## Deploy en producción

El sistema está desplegado en:
- **URL**: https://asistencia.sistemaslab.dev
- **Servidor**: Proxmox PVE → LXC 117 (sistemaslab-dev) → Docker via Dokploy
- **Deploy automático**: al hacer push a `main` en el repo de la organización (`sistemaslab-umg/sistema-biometrico`), Dokploy hace deploy automático

### Repos de GitHub

El proyecto tiene **dos remotos**:

```bash
# Ver los remotos configurados
git remote -v

# origin → repo personal (para desarrollo)
# org    → repo de la organización (el que usa Dokploy para deployar)
```

### Para deployar cambios

```bash
# 1. Hacer tus cambios y commitear
git add .
git commit -m "descripcion del cambio"

# 2. Push al repo personal
git push origin main

# 3. Push al repo de la organización (dispara el deploy automático)
git push org main

# Dokploy detecta el push y hace el deploy automáticamente en ~2-3 minutos
```

### Comandos útiles en producción

```bash
# Ver los logs del backend en tiempo real
docker logs biometria_api -f

# Correr migraciones en producción
docker exec biometria_api alembic upgrade head

# Entrar al container del backend
docker exec -it biometria_api bash

# Ver el uso de memoria de todos los containers
docker stats --no-stream
```

### Backups de docker-compose

Cada vez que se modifica un docker-compose, se guarda backup automático en:
```
/etc/dokploy/backups/<timestamp>/
```

---

## ⚠️ Cosas importantes a saber

### 1. dlib tarda en compilar
La primera vez que hacés `docker compose up --build`, el paso de instalar `face_recognition` (que usa dlib) puede tardar **10-20 minutos** porque compila código C++ desde cero. Es normal. Las veces siguientes usa el cache de Docker y es más rápido.

### 2. El reconocimiento facial necesita buena iluminación
El sistema usa `face_recognition` que es preciso pero sensible a condiciones de luz. Si el kiosco está en un lugar oscuro, registrará errores 400 "No face detected".

### 3. Un empleado por día, un registro
Hay una restricción en la base de datos (`UNIQUE constraint`) que impide dos registros para el mismo empleado en el mismo día. Si un catedrático ya hizo check-in, el sistema le devuelve el registro existente en vez de crear uno nuevo.

### 4. Las fotos NO se guardan
El sistema extrae el vector matemático del rostro (embedding) y descarta la imagen original. En la base de datos no hay fotos, solo números. Esto es intencional por privacidad y para ahorrar espacio.

### 5. Geolocalización no bloquea el registro
Si el catedrático está fuera del radio de su sede, el sistema **igual registra la asistencia** pero con `geo_validated = false`. El administrador puede ver esto en el reporte.

---

## 🆘 Problemas frecuentes

### "No face detected" al hacer check-in
- Verificar iluminación del kiosco
- Asegurar que el catedrático tiene el rostro registrado
- El rostro debe estar centrado en el óvalo guía

### Error 401 Unauthorized en el panel admin
- El access_token expiró (válido 30 min)
- Hacer logout y login nuevamente
- Si persiste, verificar que `SECRET_KEY` en el .env es la misma que en producción

### Backend no conecta con la base de datos
- Verificar que el container `biometria_db` está corriendo: `docker ps`
- Verificar que las variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` coinciden en el `.env`
- Ver logs: `docker logs biometria_db`

### Las migraciones fallan
- El error más común es que la tabla ya existe → `alembic stamp head` para marcar el estado actual
- Si la DB está vacía y las tablas no existen: `alembic upgrade head`
