# 🔑 Guía de Acceso Admin - Sistema Biométrico SASVIN

## URLs del Sistema

### Frontend - Interfaces de Usuario
- **Admin Panel:** https://asistencia.sistemaslab.dev/admin
- **Login:** https://asistencia.sistemaslab.dev/login
- **Kiosk Mode:** https://asistencia.sistemaslab.dev/kiosk
- **PWA Catedráticos:** https://asistencia.sistemaslab.dev

### Backend - API y Documentación
- **API Docs (Swagger):** https://asistencia.sistemaslab.dev/api/docs
- **API Redoc:** https://asistencia.sistemaslab.dev/api/redoc
- **API Base:** https://asistencia.sistemaslab.dev/api/v1

## Crear Usuario Admin (Si no existe)

### Opción 1: Usando la API directamente

```bash
# 1. Conectar al servidor
ssh root@190.56.14.34
pct enter 117

# 2. Ejecutar en el contenedor del backend
docker exec -it biometria_api python

# 3. Crear usuario admin en Python
```python
from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash
import uuid

db = SessionLocal()

# Crear usuario admin
admin_user = User(
    id=uuid.uuid4(),
    email="admin@sasvin.edu.gt",
    hashed_password=get_password_hash("Admin123!"),
    full_name="Administrador Sistema",
    role="admin",
    is_active=True
)

db.add(admin_user)
db.commit()
print("✅ Usuario admin creado")
print(f"Email: {admin_user.email}")
print("Password: Admin123!")
db.close()
exit()
```

### Opción 2: Script automatizado

```bash
# Crear script
cat > /tmp/create_admin.py << 'EOF'
import asyncio
import sys
sys.path.append('/app')

from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select
import uuid

async def create_admin():
    db = SessionLocal()
    
    # Verificar si ya existe
    existing = db.execute(
        select(User).where(User.email == "admin@sasvin.edu.gt")
    ).first()
    
    if existing:
        print("⚠️ Usuario admin ya existe")
        # Actualizar password
        existing[0].hashed_password = get_password_hash("Admin123!")
        db.commit()
        print("✅ Password actualizado")
    else:
        # Crear nuevo
        admin_user = User(
            id=uuid.uuid4(),
            email="admin@sasvin.edu.gt",
            hashed_password=get_password_hash("Admin123!"),
            full_name="Administrador Sistema",
            role="admin",
            is_active=True
        )
        db.add(admin_user)
        db.commit()
        print("✅ Usuario admin creado")
    
    print("\n📧 Email: admin@sasvin.edu.gt")
    print("🔑 Password: Admin123!")
    print("\n🌐 Login en: https://asistencia.sistemaslab.dev/login")
    
    db.close()

if __name__ == "__main__":
    asyncio.run(create_admin())
EOF

# Ejecutar
docker exec -it biometria_api python /tmp/create_admin.py
```

## Funciones del Admin Panel

Una vez que accedas con las credenciales, podrás:

### 1. **Gestión de Sedes/Ubicaciones** (`/admin/locations`)
- Crear nuevas sedes
- Definir coordenadas GPS (latitud, longitud)
- Establecer radio permitido (metros)
- Activar/desactivar sedes

### 2. **Gestión de Empleados/Catedráticos** (`/admin/employees`)
- Registrar nuevos catedráticos
- Asignar a departamentos
- Configurar horarios
- Cargar fotos para reconocimiento facial
- Ver historial de asistencia

### 3. **Configuración de Horarios** (`/admin/schedules`)
- Definir jornadas (matutina, vespertina, nocturna)
- Establecer horarios de entrada/salida
- Configurar tolerancias
- Asignar horarios a empleados

### 4. **Reportes de Asistencia** (`/admin/attendance`)
- Ver asistencias del día
- Exportar reportes
- Validar/corregir marcaciones
- Ver logs de geolocalización

### 5. **Configuración del Sistema** (`/admin/settings`)
- Parámetros de reconocimiento facial
- Configuración de geolocalización
- Notificaciones
- Backup/restore

## Flujo de Registro de Catedráticos

1. **Login como Admin**
   ```
   URL: https://asistencia.sistemaslab.dev/login
   Email: admin@sasvin.edu.gt
   Password: Admin123!
   ```

2. **Crear Sede** (si no existe)
   - Ir a `/admin/locations`
   - Click en "Nueva Ubicación"
   - Ingresar:
     - Nombre: "Campus Central UMG"
     - Latitud: (coordenada GPS)
     - Longitud: (coordenada GPS)
     - Radio: 100 (metros)
   - Guardar

3. **Registrar Catedrático**
   - Ir a `/admin/employees`
   - Click en "Nuevo Empleado"
   - Completar:
     - Nombre completo
     - Email
     - Código empleado
     - Departamento
     - Sede asignada
     - Horario
   - **Importante:** Tomar 3-5 fotos para reconocimiento facial
   - Guardar

4. **El catedrático ya puede:**
   - Instalar PWA desde https://asistencia.sistemaslab.dev
   - Marcar asistencia con reconocimiento facial
   - El sistema validará:
     - ✅ Rostro reconocido
     - ✅ Dentro del radio de la sede
     - ✅ Horario correcto

## Troubleshooting

### Si no puedes acceder al admin:

1. **Verificar que el backend esté corriendo:**
   ```bash
   docker ps | grep biometria_api
   ```

2. **Ver logs del backend:**
   ```bash
   docker logs biometria_api --tail 50
   ```

3. **Verificar la base de datos:**
   ```bash
   docker exec -it biometria_db psql -U biometria -d biometria -c "SELECT * FROM users;"
   ```

4. **Reset password de admin:**
   ```bash
   docker exec -it biometria_api python -c "
   from app.db.session import SessionLocal
   from app.models.user import User
   from app.core.security import get_password_hash
   
   db = SessionLocal()
   user = db.query(User).filter(User.email == 'admin@sasvin.edu.gt').first()
   if user:
       user.hashed_password = get_password_hash('NuevoPassword123!')
       db.commit()
       print('Password actualizado')
   db.close()
   "
   ```

## API Endpoints Principales

Para desarrollo o integración:

```bash
# Login
POST /api/v1/auth/login
{
  "email": "admin@sasvin.edu.gt",
  "password": "Admin123!"
}

# Listar sedes
GET /api/v1/locations
Authorization: Bearer {token}

# Crear sede
POST /api/v1/locations
{
  "name": "Campus Central",
  "latitude": 14.589267,
  "longitude": -90.551447,
  "radius": 100,
  "is_active": true
}

# Registrar empleado
POST /api/v1/employees
{
  "employee_code": "CAT001",
  "full_name": "Juan Pérez",
  "email": "juan.perez@umg.edu.gt",
  "department_id": 1,
  "location_id": 1,
  "schedule_id": 1
}

# Cargar fotos para reconocimiento
POST /api/v1/faces/register
{
  "employee_id": "uuid-del-empleado",
  "images": ["base64_image1", "base64_image2", "base64_image3"]
}
```

## Monitoreo del Sistema

```bash
# Ver estadísticas en tiempo real
docker stats biometria_api biometria_frontend biometria_db

# Ver logs en tiempo real
docker logs -f biometria_api

# Verificar espacio
df -h

# Ver conexiones activas
docker exec biometria_db psql -U biometria -c "SELECT count(*) FROM pg_stat_activity;"
```