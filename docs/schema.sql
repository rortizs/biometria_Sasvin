-- ============================================================
-- Sistema Biométrico de Asistencia — UMG Guastatoya
-- Schema completo de PostgreSQL
--
-- Generado desde la DB de producción local el 2026-03-25
-- Motor: PostgreSQL 16
-- Extensiones requeridas: pgvector, uuid-ossp, postgis
--
-- USO:
--   1. Crear una DB nueva en PostgreSQL
--   2. Habilitar las extensiones (sección 1)
--   3. Ejecutar el resto del script
--
-- ORDEN DE EJECUCIÓN (importante por las FK):
--   1. Extensiones
--   2. Tipos ENUM
--   3. Tablas independientes (sin FK): settings, departments,
--      positions, locations, users, schedules, devices
--   4. Tablas con FK: employees
--   5. Tablas dependientes de employees: face_embeddings,
--      attendance_records, employee_schedules,
--      schedule_assignments, schedule_exceptions
--   6. Constraints, índices
-- ============================================================


-- ============================================================
-- 1. EXTENSIONES
-- ============================================================

-- pgvector: permite el tipo VECTOR(128) para embeddings faciales
-- Operador <=> calcula distancia coseno entre vectores
CREATE EXTENSION IF NOT EXISTS vector;

-- uuid-ossp: permite generar UUIDs con uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 2. TIPOS ENUM
-- ============================================================

-- Tipos de excepción en el módulo de horarios
CREATE TYPE exceptiontype AS ENUM (
    'day_off',      -- Día libre genérico
    'vacation',     -- Vacaciones del empleado
    'sick_leave',   -- Incapacidad médica
    'holiday',      -- Feriado nacional o institucional
    'permission',   -- Permiso especial
    'other'         -- Otro
);


-- ============================================================
-- 3. TABLAS INDEPENDIENTES (sin claves foráneas)
-- ============================================================

-- ------------------------------------------------------------
-- settings: Configuración global de la institución (SINGLETON)
-- Solo puede existir UN registro. Usar PUT para actualizar.
-- ------------------------------------------------------------
CREATE TABLE settings (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name    VARCHAR(200)    NOT NULL,
    company_address TEXT,
    slogan          VARCHAR(500),
    email_domain    VARCHAR(100)    NOT NULL,   -- ej: "umg.edu.gt"
    logo_url        VARCHAR(500),
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- departments: Facultades o departamentos de la institución
-- ------------------------------------------------------------
CREATE TABLE departments (
    id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(200)    NOT NULL,
    description TEXT,
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- positions: Cargos y puestos (Catedrático Titular, etc.)
-- El nombre debe ser único en toda la tabla.
-- ------------------------------------------------------------
CREATE TABLE positions (
    id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100)    NOT NULL,
    description TEXT,
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW(),
    CONSTRAINT positions_name_key UNIQUE (name)
);


-- ------------------------------------------------------------
-- locations: Sedes con coordenadas GPS y radio de validación
-- radius_meters: metros de tolerancia para geo_validated
-- ------------------------------------------------------------
CREATE TABLE locations (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           VARCHAR(200) NOT NULL,
    address        TEXT,
    latitude       FLOAT       NOT NULL,    -- ej: 14.8561
    longitude      FLOAT       NOT NULL,    -- ej: -90.0688  (negativo = Oeste)
    radius_meters  INTEGER     NOT NULL DEFAULT 50,  -- mín 10, máx 5000
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- users: Administradores del panel web
-- hashed_password: hash bcrypt. NUNCA texto plano.
-- role: 'admin' | 'supervisor'
-- ------------------------------------------------------------
CREATE TABLE users (
    id               UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    email            VARCHAR(255)    NOT NULL,
    hashed_password  VARCHAR(255)    NOT NULL,
    full_name        VARCHAR(200),
    role             VARCHAR(50)     NOT NULL DEFAULT 'admin',
    is_active        BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ix_users_email ON users (email);


-- ------------------------------------------------------------
-- schedules: Patrones de horario reutilizables
-- tolerance_minutes: minutos de tolerancia para no marcar tardanza
-- color: hex para el calendario visual, ej: '#3b82f6'
-- ------------------------------------------------------------
CREATE TABLE schedules (
    id                UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(100)    NOT NULL UNIQUE,
    description       VARCHAR(255),
    check_in_time     TIME            NOT NULL,   -- ej: '07:00:00'
    check_out_time    TIME            NOT NULL,   -- ej: '13:00:00'
    tolerance_minutes INTEGER         NOT NULL DEFAULT 15,
    color             VARCHAR(7)      NOT NULL DEFAULT '#f97316',
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP       NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- devices: Kioscos y tablets registrados
-- device_token: token único para identificar el dispositivo
-- Actualmente preparado para uso futuro (auth de dispositivos)
-- ------------------------------------------------------------
CREATE TABLE devices (
    id           UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(100)    NOT NULL,
    device_token VARCHAR(255)    NOT NULL,
    location     VARCHAR(200),
    is_active    BOOLEAN         NOT NULL DEFAULT TRUE,
    last_seen    TIMESTAMP,
    created_at   TIMESTAMP       NOT NULL DEFAULT NOW(),
    CONSTRAINT devices_device_token_key UNIQUE (device_token)
);


-- ============================================================
-- 4. TABLAS CON CLAVES FORÁNEAS — NIVEL 1
-- ============================================================

-- ------------------------------------------------------------
-- employees: Catedráticos y personal de la institución
-- Es la tabla central del sistema.
-- department_id, position_id, location_id son todos opcionales.
-- location_id define en qué sede se valida el GPS del empleado.
-- ------------------------------------------------------------
CREATE TABLE employees (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_code   VARCHAR(50)     NOT NULL,
    first_name      VARCHAR(100)    NOT NULL,
    last_name       VARCHAR(100)    NOT NULL,
    email           VARCHAR(255)    NOT NULL,
    phone           VARCHAR(50),
    hire_date       DATE,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP       NOT NULL DEFAULT NOW(),

    -- Claves foráneas opcionales
    department_id   UUID            REFERENCES departments(id),
    position_id     UUID            REFERENCES positions(id),
    location_id     UUID            REFERENCES locations(id),

    CONSTRAINT employees_employee_code_key UNIQUE (employee_code)
);

CREATE UNIQUE INDEX ix_employees_employee_code ON employees (employee_code);


-- ============================================================
-- 5. TABLAS DEPENDIENTES DE employees
-- ============================================================

-- ------------------------------------------------------------
-- face_embeddings: Vectores matemáticos del rostro de cada empleado
--
-- embedding VECTOR(128): arreglo de 128 números decimales que
-- representa el rostro. Se usa para búsquedas de similitud con
-- el operador <=> (distancia coseno).
--
-- Un empleado puede tener hasta 5 embeddings (un ángulo por foto).
-- is_primary = TRUE en el primer embedding (foto frontal).
--
-- ON DELETE CASCADE: al eliminar el empleado se borran sus embeddings.
-- ------------------------------------------------------------
CREATE TABLE face_embeddings (
    id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID            NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    embedding   VECTOR(128)     NOT NULL,
    is_primary  BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- attendance_records: Registros de asistencia diaria
--
-- REGLA CLAVE: un empleado solo puede tener UN registro por día.
-- Implementado con UNIQUE (employee_id, record_date).
--
-- check_in_confidence / check_out_confidence:
--   Nivel de confianza del reconocimiento facial. Rango 0.0 - 1.0.
--   Ejemplo: 0.87 = 87% de confianza de que es el empleado correcto.
--
-- geo_validated:
--   TRUE si el empleado estaba dentro del radio (radius_meters)
--   de su sede asignada al momento del check-in. FALSE si no
--   tenía sede asignada, no mandó GPS, o estaba fuera del radio.
--   No bloquea el registro — solo lo marca.
--
-- ON DELETE CASCADE: al eliminar el empleado se borran sus registros.
-- ------------------------------------------------------------
CREATE TABLE attendance_records (
    id                          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id                 UUID            NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    record_date                 DATE            NOT NULL,

    -- Hora de entrada y salida
    check_in                    TIMESTAMP,
    check_out                   TIMESTAMP,

    -- URLs de fotos (reservado para uso futuro, actualmente no se guarda)
    check_in_photo_url          VARCHAR(500),
    check_out_photo_url         VARCHAR(500),

    -- Confianza del reconocimiento facial (0.0 a 1.0)
    check_in_confidence         FLOAT,
    check_out_confidence        FLOAT,

    -- Estado: 'present' | 'late' | 'absent'
    status                      VARCHAR(50)     NOT NULL DEFAULT 'present',
    notes                       TEXT,
    created_at                  TIMESTAMP       NOT NULL DEFAULT NOW(),

    -- Coordenadas GPS del check-in
    check_in_latitude           FLOAT,
    check_in_longitude          FLOAT,
    check_in_distance_meters    FLOAT,          -- metros desde su sede asignada

    -- Coordenadas GPS del check-out
    check_out_latitude          FLOAT,
    check_out_longitude         FLOAT,
    check_out_distance_meters   FLOAT,

    -- Resultado de la validación geográfica
    geo_validated               BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Un empleado = un registro por día (regla de negocio crítica)
    CONSTRAINT uq_employee_date UNIQUE (employee_id, record_date)
);


-- ------------------------------------------------------------
-- employee_schedules: Horario DEFAULT por día de semana
--
-- Define qué patrón de horario tiene un empleado los lunes,
-- los martes, etc. Es el horario "normal" del empleado.
--
-- day_of_week: 0=Lunes, 1=Martes, 2=Miércoles, 3=Jueves,
--              4=Viernes, 5=Sábado, 6=Domingo
--
-- effective_from / effective_to: permite cambiar el horario
-- de un empleado a partir de una fecha sin perder el historial.
-- ------------------------------------------------------------
CREATE TABLE employee_schedules (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    schedule_id     UUID        NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    day_of_week     INTEGER     NOT NULL,    -- 0=Lunes ... 6=Domingo
    effective_from  DATE        NOT NULL,
    effective_to    DATE,                    -- NULL = sigue vigente indefinidamente

    CONSTRAINT uq_employee_day_effective UNIQUE (employee_id, day_of_week, effective_from)
);


-- ------------------------------------------------------------
-- schedule_assignments: Asignación PUNTUAL por fecha
--
-- Tiene PRIORIDAD sobre employee_schedules para esa fecha.
-- Permite manejar casos como: "el martes 25 Juan tiene horario
-- vespertino en lugar de su horario normal matutino".
--
-- También permite marcar días libres individuales (is_day_off = TRUE).
-- Si schedule_id es NULL y custom_check_in/out tienen valor →
-- horario completamente personalizado para esa fecha.
-- ------------------------------------------------------------
CREATE TABLE schedule_assignments (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    assignment_date DATE        NOT NULL,
    schedule_id     UUID        REFERENCES schedules(id) ON DELETE SET NULL,
    custom_check_in TIME,                   -- horario personalizado (opcional)
    custom_check_out TIME,
    is_day_off      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_employee_assignment_date UNIQUE (employee_id, assignment_date)
);

-- Índice para acelerar búsquedas por empleado + rango de fechas
CREATE INDEX ix_schedule_assignments_employee_date
    ON schedule_assignments (employee_id, assignment_date);


-- ------------------------------------------------------------
-- schedule_exceptions: Vacaciones, feriados, permisos, incapacidades
--
-- PRIORIDAD MÁS ALTA sobre los demás horarios.
-- Lógica del calendario: exceptions > assignments > employee_schedules
--
-- employee_id = NULL → excepción GLOBAL (aplica a TODOS los
-- empleados). Se usa para feriados nacionales o institucionales.
-- Un solo registro cubre a toda la institución.
--
-- has_work_hours = TRUE → ese día hay horario especial
-- (ej: jornada reducida). Se llenan work_check_in/work_check_out.
-- ------------------------------------------------------------
CREATE TABLE schedule_exceptions (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID            REFERENCES employees(id) ON DELETE CASCADE,
    -- NULL = aplica a todos los empleados
    exception_type  exceptiontype   NOT NULL,
    start_date      DATE            NOT NULL,
    end_date        DATE            NOT NULL,
    description     TEXT,
    has_work_hours  BOOLEAN         NOT NULL DEFAULT FALSE,
    work_check_in   TIME,
    work_check_out  TIME,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    created_by      UUID            REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para acelerar búsquedas de excepciones por rango de fechas
CREATE INDEX ix_schedule_exceptions_employee_dates
    ON schedule_exceptions (employee_id, start_date, end_date);

CREATE INDEX ix_schedule_exceptions_type
    ON schedule_exceptions (exception_type);


-- ============================================================
-- FIN DEL SCHEMA
-- ============================================================
--
-- Tablas del sistema: 11
--   settings, departments, positions, locations, users,
--   schedules, devices, employees, face_embeddings,
--   attendance_records, employee_schedules,
--   schedule_assignments, schedule_exceptions
--
-- Notas importantes:
--   - Todas las PKs son UUID v4 (generados automáticamente)
--   - Las contraseñas en 'users.hashed_password' son hash bcrypt
--   - 'face_embeddings.embedding' requiere extensión pgvector
--   - Las tablas tiger/* y topology/* son de PostGIS, no del proyecto
--   - La tabla 'alembic_version' la crea Alembic para control de migraciones
-- ============================================================
