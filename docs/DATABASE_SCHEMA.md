# Database Schema — Sistema Biométrico de Asistencia

**Motor:** PostgreSQL 16  
**Extensiones requeridas:** `pgvector`, `uuid-ossp`  
**Total de tablas:** 11

---

## Índice

1. [Diagrama de relaciones](#diagrama-de-relaciones)
2. [Tablas de configuración base](#tablas-de-configuración-base)
   - [settings](#settings)
   - [departments](#departments)
   - [positions](#positions)
   - [locations](#locations)
3. [Tablas de personas](#tablas-de-personas)
   - [users](#users)
   - [employees](#employees)
4. [Tablas biométricas](#tablas-biométricas)
   - [face_embeddings](#face_embeddings)
   - [devices](#devices)
5. [Tablas de asistencia](#tablas-de-asistencia)
   - [attendance_records](#attendance_records)
6. [Tablas de horarios](#tablas-de-horarios)
   - [schedules](#schedules)
   - [employee_schedules](#employee_schedules)
   - [schedule_assignments](#schedule_assignments)
   - [schedule_exceptions](#schedule_exceptions)
7. [Tipos de datos especiales](#tipos-de-datos-especiales)
8. [Reglas de negocio implementadas en la DB](#reglas-de-negocio-implementadas-en-la-db)

---

## Diagrama de relaciones

```
┌──────────┐     ┌─────────────┐     ┌───────────┐
│ settings │     │ departments │     │ positions │
│(singleton│     └──────┬──────┘     └─────┬─────┘
└──────────┘            │ 1:N               │ 1:N
                        │                   │
┌───────────┐           ▼                   ▼
│ locations │──────► employees ◄────────────┘
└─────┬─────┘  1:N    │   │
      │               │   │ 1:N            1:N
      │         1:N   ▼   ▼
      │      face_    attendance_
      │      embeddings  records
      │
      └──── (validación GPS en check-in/out)

┌──────────┐
│  users   │ (admins del panel)
└──────────┘
      │ created_by
      ▼
schedule_assignments
schedule_exceptions

┌───────────┐     ┌──────────────────┐     ┌────────────────────┐
│ schedules │◄────│ employee_schedules│     │schedule_assignments│
│ (patrones)│     │ (horario default) │     │ (asignación puntual│
└───────────┘     └──────────────────┘     │  por fecha)        │
      ▲                                     └────────────────────┘
      └─────────────────────────────────────┘
```

---

## Tablas de configuración base

### `settings`

Configuración global de la institución. Solo puede existir **un registro** (singleton). Si no existe, el sistema devuelve 404 en `GET /settings/`.

```sql
CREATE TABLE settings (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name  VARCHAR(200)  NOT NULL,
  company_address TEXT        NULL,
  slogan        VARCHAR(500)  NULL,
  email_domain  VARCHAR(100)  NOT NULL,     -- ej: "umg.edu.gt"
  logo_url      VARCHAR(500)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria generada automáticamente |
| `company_name` | VARCHAR(200) | NO | Nombre de la institución. Ej: "UMG Guastatoya" |
| `company_address` | TEXT | SÍ | Dirección física |
| `slogan` | VARCHAR(500) | SÍ | Eslogan o descripción corta |
| `email_domain` | VARCHAR(100) | NO | Dominio de correos institucionales. Ej: "umg.edu.gt" |
| `logo_url` | VARCHAR(500) | SÍ | URL del logotipo (CDN o ruta pública) |
| `created_at` | TIMESTAMP | NO | Fecha de creación |
| `updated_at` | TIMESTAMP | NO | Fecha de última modificación (se actualiza automáticamente) |

**Ejemplo de fila:**
```
id:              1e5f9c11-1bf5-4a16-95cf-db8a9a55ad03
company_name:    UMG Guastatoya
email_domain:    umg.edu.gt
slogan:          Sistema de Control de Asistencia
```

---

### `departments`

Facultades o departamentos de la institución. Los empleados se asignan opcionalmente a un departamento.

```sql
CREATE TABLE departments (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200)  NOT NULL,
  description TEXT          NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `name` | VARCHAR(200) | NO | Nombre del departamento. Ej: "Ingeniería en Sistemas" |
| `description` | TEXT | SÍ | Descripción opcional |
| `is_active` | BOOLEAN | NO | `true` = aparece en los selects del formulario de empleados |
| `created_at` | TIMESTAMP | NO | Fecha de creación |

**Relacionado con:** `employees.department_id`

---

### `positions`

Cargos o puestos. Los empleados se asignan opcionalmente a un puesto.

```sql
CREATE TABLE positions (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,  -- el nombre debe ser único
  description TEXT         NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `name` | VARCHAR(100) | NO | Nombre del puesto. Ej: "Catedrático Titular". **ÚNICO** |
| `description` | TEXT | SÍ | Descripción opcional |
| `is_active` | BOOLEAN | NO | Soft delete |
| `created_at` | TIMESTAMP | NO | Fecha de creación |

**Relacionado con:** `employees.position_id`

---

### `locations`

Sedes de trabajo con coordenadas GPS. Se usan para validar que el catedrático está en el lugar correcto al marcar asistencia.

```sql
CREATE TABLE locations (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(200) NOT NULL,
  address        TEXT         NULL,
  latitude       FLOAT        NOT NULL,   -- ej: 14.8561
  longitude      FLOAT        NOT NULL,   -- ej: -90.0688
  radius_meters  INTEGER      NOT NULL DEFAULT 50,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `name` | VARCHAR(200) | NO | Nombre de la sede. Ej: "Campus Central UMG" |
| `address` | TEXT | SÍ | Dirección textual |
| `latitude` | FLOAT | NO | Latitud GPS. Rango: -90 a 90. Guatemala: ~14.x |
| `longitude` | FLOAT | NO | Longitud GPS. Rango: -180 a 180. Guatemala: ~-90.x |
| `radius_meters` | INTEGER | NO | Radio en metros. Un empleado dentro de este radio = geo_validated = true. Mínimo 10, máximo 5000 |
| `is_active` | BOOLEAN | NO | Soft delete |
| `created_at` | TIMESTAMP | NO | Fecha de creación |

**Relacionado con:** `employees.location_id`

**¿Cómo se usa el radio?** El backend calcula la distancia entre las coordenadas del dispositivo y las de la sede usando la fórmula de Haversine. Si `distancia <= radius_meters` → `geo_validated = true`.

---

## Tablas de personas

### `users`

Administradores del sistema. Solo los usuarios de esta tabla pueden acceder al panel admin.

```sql
CREATE TABLE users (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  email            VARCHAR(255) NOT NULL UNIQUE,
  hashed_password  VARCHAR(255) NOT NULL,   -- bcrypt hash, NUNCA texto plano
  full_name        VARCHAR(200) NULL,
  role             VARCHAR(50)  NOT NULL DEFAULT 'admin',
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ix_users_email ON users(email);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `email` | VARCHAR(255) | NO | Email único. Se usa como username para el login |
| `hashed_password` | VARCHAR(255) | NO | Hash bcrypt de la contraseña. NUNCA se guarda la contraseña en texto plano |
| `full_name` | VARCHAR(200) | SÍ | Nombre completo del administrador |
| `role` | VARCHAR(50) | NO | `'admin'` o `'supervisor'`. Los admins tienen acceso completo |
| `is_active` | BOOLEAN | NO | `false` = usuario bloqueado, no puede hacer login |
| `created_at` | TIMESTAMP | NO | Fecha de creación |
| `updated_at` | TIMESTAMP | NO | Última modificación |

**Usuario inicial creado por `create_admin_user.py`:**
```
email:    admin@sistemaslab.dev
password: Admin2024!  (cambiar después del primer login)
role:     admin
```

---

### `employees`

Catedráticos y personal de la institución. Son los que usan el kiosco para marcar asistencia.

```sql
CREATE TABLE employees (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_code   VARCHAR(50)  NOT NULL UNIQUE,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(50)  NULL,
  hire_date       DATE         NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),

  -- Claves foráneas (todas opcionales)
  department_id   UUID         NULL REFERENCES departments(id),
  position_id     UUID         NULL REFERENCES positions(id),
  location_id     UUID         NULL REFERENCES locations(id)
);

CREATE UNIQUE INDEX ix_employees_code ON employees(employee_code);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `employee_code` | VARCHAR(50) | NO | Código interno único. Ej: "CATED-001", "13721" |
| `first_name` | VARCHAR(100) | NO | Nombre(s) |
| `last_name` | VARCHAR(100) | NO | Apellido(s) |
| `email` | VARCHAR(255) | NO | Correo electrónico |
| `phone` | VARCHAR(50) | SÍ | Teléfono opcional |
| `hire_date` | DATE | SÍ | Fecha de ingreso a la institución |
| `is_active` | BOOLEAN | NO | `false` = no puede marcar asistencia, no aparece en búsquedas |
| `department_id` | UUID | SÍ | FK → departments. Puede ser NULL |
| `position_id` | UUID | SÍ | FK → positions. Puede ser NULL |
| `location_id` | UUID | SÍ | FK → locations. Define en qué sede se valida su GPS |

**Propiedad calculada (no es columna):**
`has_face_registered` — el backend consulta si existen filas en `face_embeddings` para este empleado. Si hay al menos 1 → `true`.

---

## Tablas biométricas

### `face_embeddings`

Vectores matemáticos del rostro de cada empleado. Cada fila representa UNA foto procesada. Un empleado puede tener hasta 5 embeddings (uno por cada ángulo del flujo de registro).

```sql
CREATE TABLE face_embeddings (
  id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID      NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  embedding   VECTOR(128) NOT NULL,  -- requiere extensión pgvector
  is_primary  BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `employee_id` | UUID | NO | FK → employees. **CASCADE DELETE**: si se borra el empleado, se borran sus embeddings |
| `embedding` | VECTOR(128) | NO | Array de 128 números decimales que representan matemáticamente el rostro. Tipo especial de `pgvector` |
| `is_primary` | BOOLEAN | NO | `true` en la primera foto (ángulo frontal). Las demás son `false` |
| `created_at` | TIMESTAMP | NO | Fecha de registro |

**¿Qué es VECTOR(128)?**  
Un tipo de dato de la extensión `pgvector`. Almacena exactamente 128 números decimales en una sola columna. Permite búsquedas de similitud con el operador `<=>` (distancia coseno):
```sql
-- "¿Cuál empleado se parece más a este rostro?"
SELECT employee_id, embedding <=> '[0.12, -0.34, ...]' AS distancia
FROM face_embeddings
ORDER BY distancia
LIMIT 1;
```
Cuanto más cercana a 0 es la distancia, más parecidos son los rostros.

**ON DELETE CASCADE** significa que si se elimina un empleado de la tabla `employees`, todas sus filas en `face_embeddings` se eliminan automáticamente sin necesidad de hacerlo manualmente.

---

### `devices`

Dispositivos kiosco registrados (tablets, PCs). Actualmente no se usa en el flujo principal pero está preparado para autenticación de dispositivos.

```sql
CREATE TABLE devices (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100) NOT NULL,
  device_token VARCHAR(255) NOT NULL UNIQUE,
  location     VARCHAR(200) NULL,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  last_seen    TIMESTAMP    NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `name` | VARCHAR(100) | NO | Nombre descriptivo del dispositivo. Ej: "Kiosco Sala Principal" |
| `device_token` | VARCHAR(255) | NO | Token único para identificar el dispositivo en los requests |
| `location` | VARCHAR(200) | SÍ | Descripción de dónde está el dispositivo |
| `is_active` | BOOLEAN | NO | Si `false`, el dispositivo no puede hacer check-in |
| `last_seen` | TIMESTAMP | SÍ | Última vez que hizo una request al servidor |
| `created_at` | TIMESTAMP | NO | Fecha de registro |

---

## Tablas de asistencia

### `attendance_records`

El corazón del sistema. Cada fila = una jornada laboral de un empleado. Contiene check-in, check-out, confianza del reconocimiento y datos GPS.

```sql
CREATE TABLE attendance_records (
  id                       UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id              UUID    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  record_date              DATE    NOT NULL,
  check_in                 TIMESTAMP NULL,
  check_out                TIMESTAMP NULL,
  check_in_photo_url       VARCHAR(500) NULL,
  check_out_photo_url      VARCHAR(500) NULL,
  check_in_confidence      FLOAT   NULL,
  check_out_confidence     FLOAT   NULL,
  status                   VARCHAR(50) NOT NULL DEFAULT 'present',
  notes                    TEXT    NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),

  -- GPS check-in
  check_in_latitude        FLOAT   NULL,
  check_in_longitude       FLOAT   NULL,
  check_in_distance_meters FLOAT   NULL,

  -- GPS check-out
  check_out_latitude        FLOAT  NULL,
  check_out_longitude       FLOAT  NULL,
  check_out_distance_meters FLOAT  NULL,

  -- Validación geográfica
  geo_validated             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Restricción: un empleado = un registro por día
  CONSTRAINT uq_employee_date UNIQUE (employee_id, record_date)
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `employee_id` | UUID | NO | FK → employees. CASCADE DELETE |
| `record_date` | DATE | NO | Fecha del registro (sin hora). Ej: `2026-03-25` |
| `check_in` | TIMESTAMP | SÍ | Hora exacta de entrada. NULL si no ha marcado entrada |
| `check_out` | TIMESTAMP | SÍ | Hora exacta de salida. NULL si no ha marcado salida |
| `check_in_photo_url` | VARCHAR(500) | SÍ | URL de foto de entrada (reservado, actualmente no se guarda) |
| `check_out_photo_url` | VARCHAR(500) | SÍ | URL de foto de salida (reservado) |
| `check_in_confidence` | FLOAT | SÍ | Confianza del reconocimiento en entrada. Valor entre 0 y 1. Ej: `0.87` = 87% |
| `check_out_confidence` | FLOAT | SÍ | Confianza del reconocimiento en salida |
| `status` | VARCHAR(50) | NO | `'present'`, `'late'`, `'absent'` |
| `notes` | TEXT | SÍ | Notas adicionales opcionales |
| `check_in_latitude` | FLOAT | SÍ | Coordenada GPS al momento del check-in |
| `check_in_longitude` | FLOAT | SÍ | Coordenada GPS al momento del check-in |
| `check_in_distance_meters` | FLOAT | SÍ | Metros entre el dispositivo y la sede asignada al empleado |
| `check_out_latitude` | FLOAT | SÍ | Coordenada GPS al momento del check-out |
| `check_out_longitude` | FLOAT | SÍ | Coordenada GPS al momento del check-out |
| `check_out_distance_meters` | FLOAT | SÍ | Metros entre el dispositivo y la sede en el check-out |
| `geo_validated` | BOOLEAN | NO | `true` si el empleado estaba dentro del radio de su sede al marcar |
| `created_at` | TIMESTAMP | NO | Cuando se creó el registro |

**Restricción clave:**
```sql
CONSTRAINT uq_employee_date UNIQUE (employee_id, record_date)
```
Un empleado solo puede tener **un registro por día**. Si intenta hacer check-in dos veces el mismo día, el sistema devuelve el registro existente en vez de crear uno nuevo.

---

## Tablas de horarios

### `schedules`

Patrones de horario reutilizables. Define franjas horarias con nombre y colores para el calendario.

```sql
CREATE TABLE schedules (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(100) NOT NULL UNIQUE,
  description       VARCHAR(255) NULL,
  check_in_time     TIME         NOT NULL,   -- hora de entrada esperada
  check_out_time    TIME         NOT NULL,   -- hora de salida esperada
  tolerance_minutes INTEGER      NOT NULL DEFAULT 15,
  color             VARCHAR(7)   NOT NULL DEFAULT '#f97316',  -- color hex para el calendario
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `name` | VARCHAR(100) | NO | Nombre único. Ej: "Jornada Matutina", "Jornada Vespertina" |
| `description` | VARCHAR(255) | SÍ | Descripción opcional |
| `check_in_time` | TIME | NO | Hora esperada de entrada. Ej: `07:00:00` |
| `check_out_time` | TIME | NO | Hora esperada de salida. Ej: `13:00:00` |
| `tolerance_minutes` | INTEGER | NO | Minutos de tolerancia para no marcar como tardanza. Default: 15 |
| `color` | VARCHAR(7) | NO | Color hexadecimal para el calendario visual. Ej: `#3b82f6` |
| `is_active` | BOOLEAN | NO | Soft delete |
| `created_at` | TIMESTAMP | NO | Fecha de creación |

---

### `employee_schedules`

Horario **default** de un empleado por día de la semana. Define qué horario tiene un empleado los lunes, los martes, etc.

```sql
CREATE TABLE employee_schedules (
  id             UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    UUID      NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  schedule_id    UUID      NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  day_of_week    INTEGER   NOT NULL,   -- 0=Lunes, 1=Martes, ..., 6=Domingo
  effective_from DATE      NOT NULL,   -- desde cuándo aplica este horario
  effective_to   DATE      NULL,       -- hasta cuándo aplica (NULL = indefinido)

  CONSTRAINT uq_employee_day_effective UNIQUE (employee_id, day_of_week, effective_from)
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `employee_id` | UUID | NO | FK → employees |
| `schedule_id` | UUID | NO | FK → schedules (qué horario aplica) |
| `day_of_week` | INTEGER | NO | `0`=Lunes, `1`=Martes, `2`=Miércoles, `3`=Jueves, `4`=Viernes, `5`=Sábado, `6`=Domingo |
| `effective_from` | DATE | NO | Fecha desde la cual aplica este horario |
| `effective_to` | DATE | SÍ | Fecha hasta la cual aplica. NULL = sigue vigente indefinidamente |

**Ejemplo:** Juan Pérez tiene "Jornada Matutina" los lunes, miércoles y viernes desde el 2026-01-01.

---

### `schedule_assignments`

Asignación **específica por fecha** para un empleado. Tiene prioridad sobre el horario default. Permite manejar casos especiales como horario diferente un día puntual.

```sql
CREATE TABLE schedule_assignments (
  id              UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID      NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assignment_date DATE      NOT NULL,
  schedule_id     UUID      NULL REFERENCES schedules(id) ON DELETE SET NULL,
  custom_check_in  TIME     NULL,   -- hora personalizada (si no usa un patrón)
  custom_check_out TIME     NULL,
  is_day_off      BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by      UUID      NULL REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT uq_employee_assignment_date UNIQUE (employee_id, assignment_date)
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `employee_id` | UUID | NO | FK → employees |
| `assignment_date` | DATE | NO | Fecha exacta de la asignación |
| `schedule_id` | UUID | SÍ | FK → schedules. Si se usa un patrón existente |
| `custom_check_in` | TIME | SÍ | Hora personalizada de entrada (si no usa patrón) |
| `custom_check_out` | TIME | SÍ | Hora personalizada de salida |
| `is_day_off` | BOOLEAN | NO | `true` = día libre para este empleado en esta fecha |
| `created_by` | UUID | SÍ | FK → users. Quién creó esta asignación |

**Prioridad del calendario:**
```
schedule_exceptions > schedule_assignments > employee_schedules (default)
```

---

### `schedule_exceptions`

Excepciones globales o individuales: feriados, vacaciones, permisos, incapacidades.

```sql
CREATE TABLE schedule_exceptions (
  id             UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    UUID      NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- NULL = excepción global (aplica a TODOS los empleados, ej: feriado nacional)
  exception_type VARCHAR   NOT NULL,  -- enum: day_off, vacation, sick_leave, holiday, permission, other
  start_date     DATE      NOT NULL,
  end_date       DATE      NOT NULL,
  description    TEXT      NULL,
  has_work_hours BOOLEAN   NOT NULL DEFAULT FALSE,
  work_check_in  TIME      NULL,
  work_check_out TIME      NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by     UUID      NULL REFERENCES users(id) ON DELETE SET NULL
);
```

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | UUID | NO | Clave primaria |
| `employee_id` | UUID | **SÍ** | FK → employees. Si es **NULL** = aplica a todos los empleados (ej: feriado nacional) |
| `exception_type` | ENUM | NO | Ver valores abajo |
| `start_date` | DATE | NO | Inicio del período |
| `end_date` | DATE | NO | Fin del período (puede ser igual a start_date para un solo día) |
| `description` | TEXT | SÍ | Descripción. Ej: "Día de la Revolución" |
| `has_work_hours` | BOOLEAN | NO | `true` si hay horario especial ese día (ej: jornada reducida en feriado) |
| `work_check_in` | TIME | SÍ | Hora de entrada especial (solo si `has_work_hours = true`) |
| `work_check_out` | TIME | SÍ | Hora de salida especial |
| `created_by` | UUID | SÍ | Quién creó la excepción |

**Valores del enum `exception_type`:**
| Valor | Descripción |
|-------|-------------|
| `day_off` | Día libre genérico |
| `vacation` | Vacaciones del empleado |
| `sick_leave` | Incapacidad médica |
| `holiday` | Feriado nacional o institucional |
| `permission` | Permiso especial |
| `other` | Otro tipo de excepción |

---

## Tipos de datos especiales

### UUID
Todas las claves primarias son **UUID versión 4** (generadas aleatoriamente). Ventajas sobre enteros secuenciales:
- Se pueden generar en el cliente sin consultar la DB
- No revelan cuántos registros hay en la tabla
- Seguros para exponer en URLs

Formato: `550e8400-e29b-41d4-a716-446655440000`

### VECTOR(128)
Tipo especial de la extensión `pgvector`. Almacena un arreglo de exactamente 128 números decimales. Solo se usa en `face_embeddings.embedding`.

Para buscarlo, se usa el operador `<=>` (distancia coseno):
```sql
-- Buscar el rostro más similar
SELECT employee_id, embedding <=> '[0.12, -0.34, 0.89, ...]'::vector AS distancia
FROM face_embeddings
ORDER BY distancia ASC
LIMIT 1;
-- Resultado: el empleado cuyo rostro es más parecido al vector de consulta
```

### TIMESTAMP vs DATE
- `TIMESTAMP`: fecha Y hora. Ej: `2026-03-25 08:05:33`
- `DATE`: solo fecha, sin hora. Ej: `2026-03-25`

En `attendance_records`:
- `record_date` es DATE → identifica el día de trabajo
- `check_in` y `check_out` son TIMESTAMP → guardan la hora exacta

---

## Reglas de negocio implementadas en la DB

### 1. Un registro de asistencia por empleado por día
```sql
CONSTRAINT uq_employee_date UNIQUE (employee_id, record_date)
```
Si intentás insertar dos registros para el mismo empleado el mismo día, PostgreSQL lanza un error. El backend maneja esto devolviendo el registro existente.

### 2. Nombres de posiciones únicos
```sql
name VARCHAR(100) NOT NULL UNIQUE
```
No puede haber dos posiciones con el mismo nombre.

### 3. Código de empleado único
```sql
employee_code VARCHAR(50) NOT NULL UNIQUE
```
El código interno de cada empleado debe ser único en toda la institución.

### 4. Cascada al eliminar empleados
```sql
REFERENCES employees(id) ON DELETE CASCADE
```
Al eliminar un empleado, se eliminan automáticamente:
- Sus embeddings faciales (`face_embeddings`)
- Sus registros de asistencia (`attendance_records`)
- Sus asignaciones de horario (`employee_schedules`, `schedule_assignments`)
- Sus excepciones individuales (`schedule_exceptions`)

### 5. Excepciones globales con employee_id NULL
Un `schedule_exception` con `employee_id = NULL` aplica a todos los empleados. Esto permite crear feriados nacionales en una sola fila sin necesidad de crear una fila por cada empleado.

---

## Consultas SQL útiles para familiarizarse

```sql
-- Ver todos los empleados con su departamento y puesto
SELECT
  e.employee_code,
  e.first_name || ' ' || e.last_name AS nombre,
  d.name AS departamento,
  p.name AS puesto,
  l.name AS sede,
  e.is_active
FROM employees e
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN positions   p ON e.position_id   = p.id
LEFT JOIN locations   l ON e.location_id   = l.id
ORDER BY e.last_name;

-- Ver asistencia de hoy con confianza del reconocimiento
SELECT
  e.first_name || ' ' || e.last_name AS nombre,
  ar.check_in,
  ar.check_out,
  ROUND(ar.check_in_confidence * 100) || '%' AS confianza,
  ar.geo_validated,
  ar.check_in_distance_meters || 'm' AS distancia_sede
FROM attendance_records ar
JOIN employees e ON ar.employee_id = e.id
WHERE ar.record_date = CURRENT_DATE
ORDER BY ar.check_in;

-- Empleados sin rostro registrado (no pueden marcar asistencia)
SELECT
  e.employee_code,
  e.first_name || ' ' || e.last_name AS nombre
FROM employees e
WHERE e.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM face_embeddings fe WHERE fe.employee_id = e.id
  );

-- Cuántos embeddings tiene cada empleado
SELECT
  e.first_name || ' ' || e.last_name AS nombre,
  COUNT(fe.id) AS total_fotos_registradas
FROM employees e
LEFT JOIN face_embeddings fe ON e.id = fe.employee_id
GROUP BY e.id, e.first_name, e.last_name
ORDER BY total_fotos_registradas DESC;

-- Resumen de asistencia por mes
SELECT
  DATE_TRUNC('month', ar.record_date) AS mes,
  COUNT(*) AS total_registros,
  COUNT(ar.check_in) AS con_entrada,
  COUNT(ar.check_out) AS con_salida,
  ROUND(AVG(ar.check_in_confidence) * 100, 1) || '%' AS confianza_promedio
FROM attendance_records ar
GROUP BY DATE_TRUNC('month', ar.record_date)
ORDER BY mes DESC;
```
