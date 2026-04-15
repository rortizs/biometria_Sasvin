# Guía de desarrollo local — Sistema Biométrico

Esta guía explica cómo levantar el proyecto en tu computadora para desarrollar y probar cambios.

---

## Requisitos previos

Instalá estas herramientas antes de empezar. Los links llevan a la descarga oficial.

| Herramienta | Versión mínima | Link |
|-------------|---------------|------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | cualquiera reciente | Necesario para la base de datos y el backend con dlib |
| [Node.js](https://nodejs.org/) | 20+ | Solo para correr el frontend en modo dev |
| [Git](https://git-scm.com/) | cualquiera | Para clonar el proyecto |

> **¿Por qué Docker para el backend?**
> El backend usa `face_recognition` que depende de `dlib`, una librería C++ que tarda
> 10-20 minutos en compilar desde cero. Con Docker solo se compila una vez y queda cacheado.

---

## Opción A — Todo con Docker (recomendado para empezar)

La forma más simple. Levanta los 3 servicios (db, backend, frontend) en una sola línea.

### 1. Clonar e ir a la carpeta

```bash
git clone <url-del-repo>
cd biometria_Sasvin
```

### 2. Crear el archivo de variables de entorno

El archivo `.env` ya existe en el proyecto con valores para desarrollo local. No necesitás cambiarlo para empezar.

Verificá que el contenido sea este:

```bash
# Ver el contenido del .env
cat .env
```

Debería verse así:
```
POSTGRES_USER=biometria
POSTGRES_PASSWORD=biometria_secret
POSTGRES_DB=biometria_db
SECRET_KEY=your-super-secret-key-change-in-production-please
DATABASE_URL=postgresql+asyncpg://biometria:biometria_secret@localhost:5432/biometria_db
CORS_ORIGINS=http://localhost:4200
FACE_RECOGNITION_THRESHOLD=0.6
```

### 3. Levantar todos los servicios

```bash
docker compose up --build
```

> ⏳ **La primera vez tarda entre 10 y 20 minutos.** Esto es normal.
> Docker está compilando `dlib` (la librería de reconocimiento facial en C++).
> Las veces siguientes es mucho más rápido porque usa el cache.

Cuando veas esto en los logs, el backend está listo:

```
biometria_api  | INFO:     Application startup complete.
biometria_api  | INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 4. Crear las tablas en la base de datos

Abrí **otra terminal** (sin cerrar la anterior) y ejecutá:

```bash
docker exec biometria_api alembic upgrade head
```

Deberías ver algo como:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 34e172e6e8db, initial_tables
INFO  [alembic.runtime.migration] Running upgrade 34e172e6e8db -> ..., add settings...
INFO  [alembic.runtime.migration] Done
```

### 5. Crear el usuario administrador

```bash
docker exec biometria_api python create_admin_user.py
```

Salida esperada:
```
✅ Admin user created successfully!
   Email: admin@sistemaslab.dev
   Password: Admin2024!
```

### 6. Verificar que todo funciona

Abrí estas URLs en el navegador:

| URL | Qué es |
|-----|--------|
| http://localhost | Frontend Angular (el kiosco) |
| http://localhost:8000/docs | Swagger UI — documentación interactiva de la API |
| http://localhost:8000/health | Health check del backend (debería responder `{"status":"healthy"}`) |

---

## Opción B — Frontend en modo dev + Backend en Docker (recomendado para desarrollar)

Esta opción es mejor cuando estás modificando el frontend, porque:
- Los cambios en el código Angular se reflejan **instantáneamente** en el navegador (hot reload)
- Con Docker, tendrías que hacer `docker compose up --build` cada vez que cambiás algo

### 1. Levantar SOLO base de datos y backend con Docker

```bash
# Solo levantar db y backend (no el frontend)
docker compose up db backend --build
```

### 2. Levantar el frontend con Node.js (en otra terminal)

```bash
cd frontend
npm install          # solo la primera vez, instala las dependencias
npm start            # equivale a: ng serve
```

El frontend queda disponible en: **http://localhost:4200**

> El `environment.ts` ya tiene configurada la URL del backend como `http://localhost:8000/api/v1`,
> así que el frontend se conecta directamente al backend de Docker sin configuración extra.

---

## Opción C — Backend local sin Docker (avanzado)

Solo si necesitás debuggear el backend directamente. Requiere tener Python 3.11 instalado.

> ⚠️ **Advertencia**: instalar `dlib` localmente puede fallar en Windows y macOS con versiones nuevas de Python. Si no funciona, usá la Opción A.

### 1. Levantar solo la base de datos con Docker

```bash
docker compose up db
```

### 2. Crear y activar el entorno virtual Python

```bash
cd backend

# Crear entorno virtual
python3.11 -m venv venv

# Activar (Mac/Linux)
source venv/bin/activate

# Activar (Windows)
venv\Scripts\activate
```

### 3. Instalar dependencias

```bash
pip install -r requirements.txt
```

> Esto va a tardar porque compila dlib. Si falla en este paso, usá la Opción A.

### 4. Crear un .env local para el backend

El `backend/.env` tiene la URL apuntando al container `biometria_db`.
Para correr localmente necesitás que apunte a `localhost`:

```bash
# Crear un .env.local solo para desarrollo
cat > .env.local << 'EOF'
DATABASE_URL=postgresql+asyncpg://biometria:biometria_secret@localhost:5432/biometria_db
CORS_ORIGINS=http://localhost:4200
SECRET_KEY=dev-secret-key-local
FACE_RECOGNITION_THRESHOLD=0.6
DEBUG=true
EOF
```

### 5. Correr las migraciones

```bash
DATABASE_URL=postgresql+asyncpg://biometria:biometria_secret@localhost:5432/biometria_db \
  alembic upgrade head
```

### 6. Levantar el servidor

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

`--reload` hace que el servidor se reinicie automáticamente cuando cambiás un archivo Python.

---

## Comandos del día a día

### Ver qué está corriendo

```bash
# Ver los containers activos
docker ps

# Ver uso de memoria de cada container
docker stats --no-stream
```

### Ver logs en tiempo real

```bash
# Logs del backend (ver errores de Python, requests, etc.)
docker logs biometria_api -f

# Logs de la base de datos
docker logs biometria_db -f

# Logs del frontend (nginx)
docker logs biometria_frontend -f

# Logs de todos los servicios juntos
docker compose logs -f
```

### Reiniciar un servicio sin bajar los demás

```bash
# Reiniciar solo el backend (útil si hiciste cambios en el Dockerfile o requirements.txt)
docker compose restart backend

# Reconstruir y reiniciar solo el backend
docker compose up backend --build -d
```

### Parar todo

```bash
# Parar los containers pero conservar los datos de la DB
docker compose stop

# Parar Y borrar los containers (los datos de la DB se conservan en el volumen)
docker compose down

# Parar, borrar containers Y borrar los datos de la DB (empezar desde cero)
docker compose down -v
```

### Entrar al container del backend

```bash
# Abrir una terminal dentro del container
docker exec -it biometria_api bash

# Desde adentro podés correr Python, ver archivos, etc.
python -c "from app.core.config import get_settings; print(get_settings())"
exit
```

### Entrar a la base de datos

```bash
# Abrir psql dentro del container de la DB
docker exec -it biometria_db psql -U biometria -d biometria_db

# Algunos comandos útiles dentro de psql:
\dt                        -- listar todas las tablas
\d employees               -- ver estructura de la tabla employees
SELECT * FROM users;       -- ver usuarios admin
SELECT * FROM employees;   -- ver empleados
SELECT COUNT(*) FROM face_embeddings;  -- cuántos rostros hay registrados
\q                         -- salir
```

---

## Migraciones de la base de datos

Cuando modificás un archivo en `backend/app/models/` necesitás crear y aplicar una migración.

```bash
# 1. Crear la migración automáticamente (Alembic detecta los cambios en los modelos)
docker exec biometria_api alembic revision --autogenerate -m "descripcion del cambio"

# Ejemplo:
docker exec biometria_api alembic revision --autogenerate -m "agregar columna telefono a employees"

# 2. Revisar el archivo generado en backend/alembic/versions/
# Es importante LEERLO antes de aplicarlo para verificar que sea correcto

# 3. Aplicar la migración
docker exec biometria_api alembic upgrade head

# Ver el estado actual de las migraciones
docker exec biometria_api alembic current

# Ver historial de migraciones
docker exec biometria_api alembic history

# Revertir la última migración (cuidado: puede borrar datos)
docker exec biometria_api alembic downgrade -1
```

---

## Correr los tests del backend

Los tests están en `backend/tests/`. Usan `pytest` con mocks de `face_recognition`
(para no necesitar dlib en los tests).

```bash
# Correr todos los tests
docker exec biometria_api pytest tests/ -v

# Correr un archivo de tests específico
docker exec biometria_api pytest tests/test_attendance_endpoints.py -v

# Correr con más detalle (ver prints y logs)
docker exec biometria_api pytest tests/ -v -s

# Ver cobertura de código
docker exec biometria_api pytest tests/ --cov=app --cov-report=term-missing
```

> **Nota**: Los tests mockean `face_recognition` automáticamente (ver `tests/conftest.py`).
> Esto significa que los tests de attendance no hacen reconocimiento facial real,
> sino que simulan la respuesta. Así los tests son rápidos y no necesitan dlib.

---

## Probar la API con Swagger UI

Con el proyecto corriendo, abrí **http://localhost:8000/docs** en el navegador.

Ahí podés probar todos los endpoints sin necesitar Postman ni nada extra.

### Flujo de prueba manual completo:

**Paso 1 — Hacer login y obtener el token:**
1. Buscá el endpoint `POST /api/v1/auth/login`
2. Hacé click en "Try it out"
3. Poné:
   ```
   username: admin@sistemaslab.dev
   password: Admin2024!
   ```
4. Ejecutá — copiá el `access_token` de la respuesta

**Paso 2 — Autorizar Swagger con el token:**
1. Hacé click en el botón **Authorize** (arriba a la derecha, con un candado)
2. Pegá el token en el campo `Value`: `Bearer eyJhbGci...`
3. Hacé click en Authorize

A partir de ahora todos los endpoints que requieren auth van a funcionar.

**Paso 3 — Crear un empleado:**
1. `POST /api/v1/employees/`
2. Body de ejemplo:
   ```json
   {
     "employee_code": "CATED-001",
     "first_name": "Juan",
     "last_name": "Pérez",
     "email": "jperez@umg.edu.gt"
   }
   ```
3. Copiá el `id` de la respuesta

**Paso 4 — Registrar el rostro del empleado:**
1. `POST /api/v1/faces/register`
2. Necesitás una foto en base64. Podés convertir una imagen con esta herramienta online: https://www.base64-image.de/
3. Body:
   ```json
   {
     "employee_id": "uuid-del-empleado",
     "images": ["data:image/jpeg;base64,/9j/4AAQ..."]
   }
   ```

**Paso 5 — Probar el check-in:**
1. `POST /api/v1/attendance/check-in` (este endpoint NO requiere auth)
2. Body:
   ```json
   {
     "images": ["data:image/jpeg;base64,/9j/4AAQ..."],
     "latitude": null,
     "longitude": null
   }
   ```

---

## Probar el frontend

Con todo corriendo, abrí **http://localhost:4200** (modo dev) o **http://localhost** (Docker).

### Rutas principales para probar:

| URL | Qué probar |
|-----|-----------|
| `http://localhost:4200/kiosk` | Pantalla del kiosco — necesita cámara |
| `http://localhost:4200/auth/login` | Login del admin |
| `http://localhost:4200/admin/dashboard` | Panel admin (requiere login primero) |
| `http://localhost:4200/admin/employees` | Gestión de empleados |
| `http://localhost:4200/admin/attendance` | Reportes de asistencia |
| `http://localhost:4200/admin/locations` | Configurar sedes GPS |

### Credenciales del admin:
```
Email:    admin@sistemaslab.dev
Password: Admin2024!
```

---

## Problemas frecuentes al iniciar

### "Port 5432 is already in use"
Ya tenés PostgreSQL instalado localmente corriendo en el mismo puerto.

```bash
# Opción 1: parar el PostgreSQL local (Mac)
brew services stop postgresql

# Opción 2: cambiar el puerto en docker-compose.yml
# Buscar "5432:5432" y cambiar a "5433:5432"
# Luego actualizar el DATABASE_URL en .env a puerto 5433
```

### "Port 80 is already in use"
Otro servicio usa el puerto 80 (nginx local, Apache, etc.).

```bash
# Ver qué está usando el puerto 80
sudo lsof -i :80

# Parar nginx local (Mac)
sudo nginx -s stop

# O cambiar el puerto del frontend en docker-compose.yml de 80 a 8080
```

### El backend falla con "connection refused" a la DB
La base de datos tarda unos segundos en iniciar. El backend tiene un `healthcheck` que espera a que la DB esté lista. Si falla igual:

```bash
# Reiniciar el backend después de que la DB esté lista
docker compose restart backend
```

### "No space left on device" en Docker
Docker acumuló imágenes y containers viejos.

```bash
# Limpiar todo lo que no se usa (imágenes, containers, cache de builds)
docker system prune -a

# Ojo: esto borra el cache de dlib → la próxima vez tarda 15-20 min en compilar
```

### El frontend carga pero no conecta con el backend (CORS error)
El `.env` de la raíz tiene `CORS_ORIGINS=http://localhost:4200`.
Si el frontend corre en otro puerto, hay que actualizarlo:

```bash
# Si el frontend corre en puerto 4200 (ng serve default) → está bien
# Si corre en otro puerto, editar .env:
CORS_ORIGINS=http://localhost:TU_PUERTO
# Luego reiniciar el backend:
docker compose restart backend
```
