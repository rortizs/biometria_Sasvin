# API Reference — Sistema Biométrico de Asistencia

**Base URL local:** `http://localhost:8000/api/v1`  
**Base URL producción:** `https://asistencia.sistemaslab.dev/api/v1`  
**Swagger UI:** `http://localhost:8000/docs`  
**OpenAPI JSON:** `http://localhost:8000/openapi.json`

---

## Índice

- [Configurar Postman / Insomnia](#configurar-postman--insomnia)
- [Autenticación](#autenticación)
- [Auth](#auth-endpoints)
- [Employees](#employees-endpoints)
- [Faces](#faces-endpoints)
- [Attendance](#attendance-endpoints)
- [Departments](#departments-endpoints)
- [Positions](#positions-endpoints)
- [Locations](#locations-endpoints)
- [Schedules](#schedules-endpoints)
- [Settings](#settings-endpoints)
- [Códigos de error](#códigos-de-error)

---

## Configurar Postman / Insomnia

### Opción A — Importar desde OpenAPI (recomendado)

Con el proyecto corriendo localmente:

**Postman:**
1. Click en **Import**
2. Seleccionar **Link**
3. Pegar: `http://localhost:8000/openapi.json`
4. Click **Continue** → **Import**
5. Se crean automáticamente todos los endpoints organizados por carpetas

**Insomnia:**
1. Click en **Create** → **Import from URL**
2. Pegar: `http://localhost:8000/openapi.json`
3. Click **Fetch and Import**

### Opción B — Variable de entorno para la base URL

Configurar una variable de entorno en tu gestor para no repetir la URL base:

**Postman** — crear un Environment con:
```
BASE_URL = http://localhost:8000/api/v1
TOKEN    = (se llena después del login)
```

**Insomnia** — crear un Environment con:
```json
{
  "BASE_URL": "http://localhost:8000/api/v1",
  "TOKEN": ""
}
```

Usar en los requests como `{{ BASE_URL }}/auth/login` o `{{ _.BASE_URL }}/auth/login`.

---

## Autenticación

La API usa **JWT Bearer tokens**.

### Flujo completo

```
1. POST /auth/login → obtenés access_token y refresh_token
2. Usar access_token en el header de cada request: Authorization: Bearer <token>
3. El access_token dura 30 minutos
4. Cuando expira, usar POST /auth/refresh con el refresh_token para obtener uno nuevo
5. El refresh_token dura 7 días
```

### Configurar token en Postman

Después del login, hay dos formas:

**Forma 1 — Por colección (aplica a todos los requests):**
1. Click en la colección → **Edit** → tab **Authorization**
2. Type: **Bearer Token**
3. Token: `{{TOKEN}}`
4. Después del login, actualizar la variable `TOKEN` con el valor del `access_token`

**Forma 2 — Por request individual:**
1. Tab **Authorization**
2. Type: **Bearer Token**
3. Pegar el token directamente

### Configurar token en Insomnia

1. En el request → tab **Auth**
2. Seleccionar **Bearer Token**
3. Token: `{{ TOKEN }}` (o pegar el valor directo)

---

## Auth Endpoints

### `POST /auth/login`

Obtener tokens de acceso.

> ⚠️ **Formato especial**: este endpoint usa `application/x-www-form-urlencoded`, **NO JSON**.

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
```

**Body (form-data o x-www-form-urlencoded):**
```
username = admin@sistemaslab.dev
password = Admin2024!
```

**Postman:** En el tab **Body**, seleccionar `x-www-form-urlencoded` y agregar los dos campos.

**Insomnia:** En el tab **Body**, seleccionar `Form URL Encoded`.

**Respuesta exitosa `200`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Errores:**
| Código | Motivo |
|--------|--------|
| `401` | Email o contraseña incorrectos |
| `403` | Usuario desactivado |

---

### `POST /auth/register`

Crear un nuevo usuario administrador.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "nuevo@sistemaslab.dev",
  "password": "MiPassword123!",
  "full_name": "Nombre Completo",
  "role": "admin"
}
```

> `role` puede ser `"admin"` o `"supervisor"`.

**Respuesta exitosa `201`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "nuevo@sistemaslab.dev",
  "full_name": "Nombre Completo",
  "role": "admin",
  "is_active": true,
  "created_at": "2026-03-24T10:00:00"
}
```

**Errores:**
| Código | Motivo |
|--------|--------|
| `400` | El email ya está registrado |

---

### `POST /auth/refresh`

Obtener un nuevo `access_token` usando el `refresh_token`.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Respuesta exitosa `200`:** igual que `/auth/login`.

**Errores:**
| Código | Motivo |
|--------|--------|
| `401` | Refresh token inválido o expirado |

---

### `GET /auth/me`

Ver los datos del usuario logueado actualmente.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Respuesta exitosa `200`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@sistemaslab.dev",
  "full_name": "System Administrator",
  "role": "admin",
  "is_active": true,
  "created_at": "2026-01-15T08:00:00"
}
```

---

## Employees Endpoints

Todos requieren `Authorization: Bearer <token>` excepto donde se indique.

### `GET /employees/`

Listar todos los empleados/catedráticos.

**Query params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `skip` | int | `0` | Cuántos registros saltar (paginación) |
| `limit` | int | `100` | Cuántos registros devolver (máx 1000) |
| `active_only` | bool | `true` | Solo empleados activos |

**Ejemplo de URL:**
```
GET /employees/?active_only=true&limit=50&skip=0
```

**Respuesta exitosa `200`:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "employee_code": "CATED-001",
    "first_name": "Juan",
    "last_name": "Pérez",
    "email": "jperez@umg.edu.gt",
    "phone": "5555-1234",
    "hire_date": "2024-01-15",
    "is_active": true,
    "created_at": "2026-01-15T08:00:00",
    "has_face_registered": true,
    "department_id": null,
    "position_id": null,
    "location_id": null
  }
]
```

> `has_face_registered: true` significa que el empleado puede hacer check-in.

---

### `POST /employees/`

Crear un nuevo empleado.

**Body:**
```json
{
  "employee_code": "CATED-001",
  "first_name": "Juan",
  "last_name": "Pérez",
  "email": "jperez@umg.edu.gt",
  "phone": "5555-1234",
  "hire_date": "2024-01-15",
  "department_id": null,
  "position_id": null,
  "location_id": "uuid-de-la-sede"
}
```

> `employee_code` debe ser único.  
> `location_id` es importante: define en qué sede se valida la geolocalización del catedrático.

**Respuesta exitosa `201`:** igual que el objeto en el listado con `has_face_registered: false`.

**Errores:**
| Código | Motivo |
|--------|--------|
| `400` | `employee_code` ya existe |

---

### `GET /employees/{employee_id}`

Obtener un empleado por su UUID.

**URL param:** `employee_id` — UUID del empleado.

**Ejemplo:**
```
GET /employees/550e8400-e29b-41d4-a716-446655440000
```

**Errores:**
| Código | Motivo |
|--------|--------|
| `404` | Empleado no encontrado |

---

### `PATCH /employees/{employee_id}`

Actualizar parcialmente un empleado. Solo se modifican los campos enviados.

**Body (solo los campos a cambiar):**
```json
{
  "phone": "5555-9999",
  "location_id": "uuid-de-nueva-sede",
  "is_active": false
}
```

**Errores:**
| Código | Motivo |
|--------|--------|
| `404` | Empleado no encontrado |

---

### `DELETE /employees/{employee_id}`

Eliminar un empleado permanentemente.

> ⚠️ **Cascada**: eliminar un empleado borra también todos sus `face_embeddings` y `attendance_records`.

**Respuesta exitosa:** `204 No Content` (sin body).

---

## Faces Endpoints

### `POST /faces/register`

Registrar el rostro de un empleado. Requiere autenticación admin.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "employee_id": "550e8400-e29b-41d4-a716-446655440000",
  "images": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
  ]
}
```

> **Cómo convertir una foto a base64:**
> - Online: https://www.base64-image.de/ — subir la foto y copiar el resultado
> - En Postman: no hay conversión automática, necesitás hacerlo antes
> - Se recomienda entre 2 y 5 fotos con distintos ángulos para mejor precisión

> **Si el empleado ya tiene fotos registradas**, se reemplazan todas. No se acumulan.

**Respuesta exitosa `200`:**
```json
{
  "success": true,
  "message": "Registered 2 face embedding(s) for Juan Pérez",
  "embeddings_count": 2
}
```

**Errores:**
| Código | Motivo |
|--------|--------|
| `400` | Ninguna de las fotos tenía un rostro detectable |
| `404` | El `employee_id` no existe |

---

### `POST /faces/verify`

Verificar si un rostro coincide con algún empleado. **No registra asistencia.**  
Útil para probar si el reconocimiento funciona antes de ir al kiosco.

**No requiere autenticación.**

**Body:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
}
```

**Respuesta — coincidencia encontrada:**
```json
{
  "success": true,
  "employee_id": "550e8400-e29b-41d4-a716-446655440000",
  "employee_name": "Juan Pérez",
  "confidence": 0.87,
  "message": "Welcome, Juan Pérez!"
}
```

**Respuesta — sin coincidencia:**
```json
{
  "success": false,
  "employee_id": null,
  "employee_name": null,
  "confidence": null,
  "message": "No matching employee found"
}
```

> `confidence` va de 0 a 1. Valores mayores a 0.75 son reconocimientos confiables.

---

### `DELETE /faces/{employee_id}`

Borrar todos los embeddings faciales de un empleado. Requiere autenticación admin.

**URL param:** `employee_id` — UUID del empleado.

> Después de esto el empleado no podrá hacer check-in hasta registrar el rostro nuevamente.

**Respuesta exitosa `200`:**
```json
{
  "success": true,
  "message": "Deleted 2 face embedding(s)"
}
```

---

## Attendance Endpoints

### `POST /attendance/check-in`

Registrar la entrada de un catedrático por reconocimiento facial.

> ✅ **No requiere autenticación** — el rostro es la credencial.

**Body:**
```json
{
  "images": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
  ],
  "latitude": 14.6407,
  "longitude": -90.5133
}
```

> `latitude` y `longitude` son opcionales. Si no se mandan, `geo_validated` será `false`.

**Respuesta exitosa `200` — primer check-in del día:**
```json
{
  "id": "uuid-del-registro",
  "employee_id": "550e8400-e29b-41d4-a716-446655440000",
  "employee_name": "Juan Pérez",
  "record_date": "2026-03-24",
  "check_in": "2026-03-24T08:05:33",
  "check_out": null,
  "status": "present",
  "confidence": 0.87,
  "geo_validated": true,
  "distance_meters": 28.5,
  "message": "Welcome, Juan Pérez! Check-in at 08:05"
}
```

**Respuesta `200` — ya hizo check-in hoy:**
```json
{
  ...
  "message": "Already checked in at 08:05"
}
```

**Errores:**
| Código | Motivo |
|--------|--------|
| `400` | No se detectó rostro en la imagen |
| `404` | El rostro no coincide con ningún empleado registrado |
| `422` | Coordenadas GPS inválidas o lista de imágenes vacía |

---

### `POST /attendance/check-out`

Registrar la salida. Igual que check-in pero requiere que exista check-in previo del mismo día.

**Body:** idéntico a `check-in`.

**Respuesta exitosa `200`:**
```json
{
  "id": "uuid-del-registro",
  "employee_name": "Juan Pérez",
  "record_date": "2026-03-24",
  "check_in": "2026-03-24T08:05:33",
  "check_out": "2026-03-24T17:02:11",
  "status": "present",
  "confidence": 0.85,
  "geo_validated": true,
  "distance_meters": 31.2,
  "message": "Goodbye, Juan Pérez! Check-out at 17:02"
}
```

**Errores:**
| Código | Motivo |
|--------|--------|
| `400` | No hay check-in registrado hoy para este empleado |
| `400` | No se detectó rostro |
| `404` | Rostro no reconocido |

---

### `GET /attendance/`

Listar registros de asistencia con filtros. Requiere autenticación.

**Query params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `record_date` | date | Filtrar por fecha exacta (`2026-03-24`) |
| `date_from` | date | Rango desde esta fecha |
| `date_to` | date | Rango hasta esta fecha |
| `employee_id` | UUID | Filtrar por empleado |
| `status` | string | `present`, `late`, `absent` |
| `skip` | int | Paginación (default 0) |
| `limit` | int | Registros por página (default 100, máx 1000) |

**Ejemplos de URL:**
```
# Todos los registros de hoy
GET /attendance/?record_date=2026-03-24

# Registros de una semana
GET /attendance/?date_from=2026-03-18&date_to=2026-03-24

# Registros de un empleado específico
GET /attendance/?employee_id=550e8400-e29b-41d4-a716-446655440000

# Combinado
GET /attendance/?date_from=2026-03-01&date_to=2026-03-31&status=present&limit=200
```

---

### `GET /attendance/today`

Atajo para ver todos los registros del día de hoy, ordenados por hora de entrada.

```
GET /attendance/today
```

---

## Departments Endpoints

Todos requieren autenticación. GET (listado y por ID) son públicos a autenticados, el resto solo admins.

### `GET /departments/`

```
GET /departments/?active_only=true&limit=100&skip=0
```

**Respuesta `200`:**
```json
[
  {
    "id": "uuid",
    "name": "Facultad de Ingeniería en Sistemas",
    "description": "Departamento de sistemas e informática",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00"
  }
]
```

### `POST /departments/`

```json
{
  "name": "Facultad de Ingeniería en Sistemas",
  "description": "Descripción opcional"
}
```

### `GET /departments/{department_id}`
### `PATCH /departments/{department_id}`

Body con los campos a actualizar (todos opcionales):
```json
{
  "name": "Nuevo nombre",
  "is_active": false
}
```

### `DELETE /departments/{department_id}`

Respuesta: `204 No Content`.

---

## Positions Endpoints

### `GET /positions/`

```
GET /positions/?active_only=true
```

### `POST /positions/`

```json
{
  "name": "Catedrático Titular",
  "description": "Docente de planta a tiempo completo"
}
```

> El `name` debe ser único. Error `400` si ya existe.

### `GET /positions/{position_id}`
### `PATCH /positions/{position_id}`
### `DELETE /positions/{position_id}`

---

## Locations Endpoints

Las sedes son el corazón de la validación GPS. Cada empleado puede tener una sede asignada.

### `GET /locations/`

```
GET /locations/?active_only=true
```

**Respuesta `200`:**
```json
[
  {
    "id": "uuid",
    "name": "Campus Central UMG",
    "address": "6a Calle 22-38 Zona 10, Guatemala",
    "latitude": 14.6407,
    "longitude": -90.5133,
    "radius_meters": 100,
    "is_active": true,
    "created_at": "2026-01-01T00:00:00"
  }
]
```

### `POST /locations/`

```json
{
  "name": "Campus Central UMG",
  "address": "6a Calle 22-38 Zona 10, Ciudad de Guatemala",
  "latitude": 14.6407,
  "longitude": -90.5133,
  "radius_meters": 100
}
```

> **`radius_meters`**: cuántos metros alrededor de `latitude`/`longitude` se consideran válidos para el check-in. Default: 50 metros. Para campus grandes usar 100-200.
>
> **Cómo obtener las coordenadas**: abrí Google Maps, hacé click derecho en el punto exacto → aparecen las coordenadas. El primer número es latitud, el segundo longitud.

### `GET /locations/{location_id}`
### `PATCH /locations/{location_id}`
### `DELETE /locations/{location_id}`

---

## Schedules Endpoints

El módulo de horarios tiene 4 sub-recursos: patrones, asignaciones, excepciones y calendario.

### Patrones de horario

Un patrón define una franja horaria reutilizable (ej: "Jornada Matutina: 07:00 - 13:00").

#### `GET /schedules/patterns/`
#### `POST /schedules/patterns/`

```json
{
  "name": "Jornada Matutina",
  "check_in_time": "07:00:00",
  "check_out_time": "13:00:00",
  "color": "#3b82f6",
  "description": "Horario de mañana para catedráticos de primer turno"
}
```

> `color` es un hex color para mostrar en el calendario visual.

#### `GET /schedules/patterns/{pattern_id}`
#### `PATCH /schedules/patterns/{pattern_id}`
#### `DELETE /schedules/patterns/{pattern_id}`

---

### Asignaciones de horario

Asignar un patrón específico a un empleado en una fecha específica.

#### `GET /schedules/assignments/`

**Query params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `employee_id` | UUID | Filtrar por empleado |
| `date_from` | date | Rango desde |
| `date_to` | date | Rango hasta |

#### `POST /schedules/assignments/`

```json
{
  "employee_id": "uuid-del-empleado",
  "assignment_date": "2026-03-25",
  "schedule_id": "uuid-del-patron",
  "is_day_off": false,
  "custom_check_in": null,
  "custom_check_out": null
}
```

> Si ya existe una asignación para ese empleado y fecha, se actualiza en lugar de crear una nueva.

#### `POST /schedules/assignments/bulk`

Asignar el mismo horario a **múltiples empleados** en **múltiples fechas** de una sola vez.

```json
{
  "employee_ids": [
    "uuid-empleado-1",
    "uuid-empleado-2",
    "uuid-empleado-3"
  ],
  "dates": [
    "2026-04-01",
    "2026-04-02",
    "2026-04-03"
  ],
  "schedule_id": "uuid-del-patron",
  "is_day_off": false
}
```

**Respuesta `201`:**
```json
{
  "created": 7,
  "updated": 2
}
```

#### `DELETE /schedules/assignments/{assignment_id}`

---

### Excepciones de horario

Vacaciones, feriados, permisos, días libres.

#### `GET /schedules/exceptions/`

**Query params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `employee_id` | UUID | Empleado (también trae excepciones globales) |
| `exception_type` | string | `vacation`, `holiday`, `sick_leave`, `permission`, `other` |
| `date_from` | date | Rango |
| `date_to` | date | Rango |

#### `POST /schedules/exceptions/`

```json
{
  "employee_id": null,
  "exception_type": "holiday",
  "start_date": "2026-04-01",
  "end_date": "2026-04-01",
  "description": "Día del Trabajo",
  "has_work_hours": false,
  "work_check_in": null,
  "work_check_out": null
}
```

> `employee_id: null` = excepción global (aplica a TODOS los empleados, ej: feriado nacional).
> `employee_id: uuid` = excepción individual (ej: vacaciones de un empleado específico).
>
> `has_work_hours: true` = tiene horario especial ese día (ej: jornada reducida). Se llena `work_check_in` y `work_check_out`.

#### `PATCH /schedules/exceptions/{exception_id}`
#### `DELETE /schedules/exceptions/{exception_id}`

---

### `GET /schedules/calendar`

Vista de calendario consolidada. Muestra para cada empleado, para cada día del rango, qué horario tiene (con lógica de prioridad: excepción > asignación específica > horario default).

**Query params (requeridos):**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `start_date` | date | **Requerido** — inicio del rango |
| `end_date` | date | **Requerido** — fin del rango |
| `department_id` | UUID | Filtrar por departamento |
| `employee_id` | UUID | Ver solo un empleado |

**Ejemplo:**
```
GET /schedules/calendar?start_date=2026-03-24&end_date=2026-03-30
```

**Respuesta `200`:**
```json
{
  "start_date": "2026-03-24",
  "end_date": "2026-03-30",
  "employees": [
    {
      "employee_id": "uuid",
      "employee_code": "CATED-001",
      "first_name": "Juan",
      "last_name": "Pérez",
      "department_name": "Facultad de Ingeniería",
      "default_schedule_name": "Jornada Matutina",
      "days": [
        {
          "date": "2026-03-24",
          "schedule_name": "Jornada Matutina",
          "check_in": "07:00:00",
          "check_out": "13:00:00",
          "color": "#3b82f6",
          "is_day_off": false,
          "exception_type": null,
          "exception_description": null
        },
        {
          "date": "2026-03-25",
          "schedule_name": null,
          "check_in": null,
          "check_out": null,
          "color": "#6b7280",
          "is_day_off": true,
          "exception_type": "holiday",
          "exception_description": "Feriado nacional"
        }
      ]
    }
  ]
}
```

---

## Settings Endpoints

Configuración global del sistema (singleton — solo existe un registro).

### `GET /settings/`

No requiere autenticación.

**Respuesta `200`:**
```json
{
  "id": "uuid",
  "company_name": "Universidad Mariano Gálvez",
  "email_domain": "umg.edu.gt",
  "company_address": "Guatemala",
  "slogan": "Sistema de Control de Asistencia",
  "logo_url": null,
  "created_at": "2026-01-01T00:00:00",
  "updated_at": "2026-03-01T00:00:00"
}
```

**Errores:**
| Código | Motivo |
|--------|--------|
| `404` | No se ha configurado aún. Correr el seed. |

### `POST /settings/`

Crear la configuración inicial. Error si ya existe.

```json
{
  "company_name": "Universidad Mariano Gálvez",
  "email_domain": "umg.edu.gt",
  "company_address": "6a Calle 22-38 Zona 10, Guatemala",
  "slogan": "Sistema de Control de Asistencia"
}
```

### `PUT /settings/`

Actualizar la configuración. Si no existe, la crea.

```json
{
  "company_name": "Nuevo nombre",
  "logo_url": "https://cdn.ejemplo.com/logo.png"
}
```

---

## Códigos de error

| Código | Nombre | Cuándo ocurre |
|--------|--------|---------------|
| `200` | OK | Request exitoso |
| `201` | Created | Recurso creado exitosamente |
| `204` | No Content | Eliminación exitosa |
| `400` | Bad Request | Datos inválidos, duplicados o restricción de negocio |
| `401` | Unauthorized | Token ausente, inválido o expirado |
| `403` | Forbidden | Token válido pero sin permisos (no es admin) |
| `404` | Not Found | Recurso no encontrado |
| `422` | Unprocessable Entity | Error de validación de Pydantic (tipos incorrectos, campos requeridos faltantes) |

**Formato estándar de error:**
```json
{
  "detail": "Descripción del error en inglés"
}
```

**Ejemplo de error 422 (validación):**
```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "images"],
      "msg": "Field required",
      "input": {}
    }
  ]
}
```

---

## Flujo completo de prueba en Postman / Insomnia

Seguí estos pasos en orden para probar el sistema de punta a punta:

### Paso 1 — Login
```
POST /auth/login
username=admin@sistemaslab.dev
password=Admin2024!
```
Guardar el `access_token`.

### Paso 2 — Crear un departamento
```
POST /departments/
{"name": "Facultad de Ingeniería en Sistemas"}
```
Guardar el `id`.

### Paso 3 — Crear una sede
```
POST /locations/
{
  "name": "Campus Central",
  "latitude": 14.6407,
  "longitude": -90.5133,
  "radius_meters": 200
}
```
Guardar el `id`.

### Paso 4 — Crear un empleado
```
POST /employees/
{
  "employee_code": "TEST-001",
  "first_name": "Test",
  "last_name": "Usuario",
  "email": "test@umg.edu.gt",
  "department_id": "<id del paso 2>",
  "location_id": "<id del paso 3>"
}
```
Guardar el `id`.

### Paso 5 — Registrar el rostro
Convertir una foto a base64 en https://www.base64-image.de/
```
POST /faces/register
{
  "employee_id": "<id del paso 4>",
  "images": ["data:image/jpeg;base64,<tu foto en base64>"]
}
```

### Paso 6 — Verificar reconocimiento
```
POST /faces/verify
{
  "image": "data:image/jpeg;base64,<misma foto>"
}
```
Debería devolver `success: true` con el nombre del empleado.

### Paso 7 — Hacer check-in
```
POST /attendance/check-in
{
  "images": ["data:image/jpeg;base64,<la foto>"],
  "latitude": null,
  "longitude": null
}
```

### Paso 8 — Ver el registro
```
GET /attendance/today
```
Deberías ver el registro con `check_in` y `check_out: null`.

### Paso 9 — Hacer check-out
```
POST /attendance/check-out
{
  "images": ["data:image/jpeg;base64,<la foto>"],
  "latitude": null,
  "longitude": null
}
```
Ahora el registro debería tener ambos `check_in` y `check_out`.
