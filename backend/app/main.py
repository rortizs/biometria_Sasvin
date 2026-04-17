from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"Starting {settings.app_name}...")
    yield
    # Shutdown
    print(f"Shutting down {settings.app_name}...")


openapi_tags = [
    {
        "name": "auth",
        "description": (
            "Autenticación y gestión de sesión. "
            "El login usa formato OAuth2 (`application/x-www-form-urlencoded`). "
            "Devuelve `access_token` (30 min) y `refresh_token` (7 días)."
        ),
    },
    {
        "name": "employees",
        "description": (
            "Gestión de catedráticos y empleados. "
            "El campo `has_face_registered` indica si el empleado ya puede hacer check-in."
        ),
    },
    {
        "name": "faces",
        "description": (
            "Registro y verificación de embeddings faciales. "
            "Usa `face_recognition` (dlib) para convertir fotos en vectores de 128 dimensiones "
            "almacenados en PostgreSQL con la extensión `pgvector`."
        ),
    },
    {
        "name": "attendance",
        "description": (
            "Registro de asistencia por reconocimiento facial. "
            "Los endpoints `check-in` y `check-out` **no requieren autenticación** — "
            "el rostro es la autenticación. La geolocalización se valida pero no bloquea el registro."
        ),
    },
    {
        "name": "departments",
        "description": "Gestión de facultades y departamentos. CRUD estándar.",
    },
    {
        "name": "positions",
        "description": (
            "Gestión de cargos y puestos. "
            "El nombre del puesto debe ser único."
        ),
    },
    {
        "name": "locations",
        "description": (
            "Sedes de trabajo con coordenadas GPS y radio de validación. "
            "Cada empleado puede tener asignada una sede. "
            "El `radius_meters` define cuántos metros alrededor de la sede son válidos para el registro."
        ),
    },
    {
        "name": "schedules",
        "description": (
            "Sistema de horarios. Incluye patrones reutilizables, "
            "asignaciones por fecha, asignaciones masivas y excepciones "
            "(vacaciones, feriados, permisos). La vista `/calendar` consolida todo."
        ),
    },
    {
        "name": "settings",
        "description": (
            "Configuración global del sistema (singleton). "
            "Solo puede existir un registro. Usar `PUT` para actualizar."
        ),
    },
]

app = FastAPI(
    title="Sistema Biométrico de Asistencia — API",
    description="""
API REST para el sistema de control de asistencia de catedráticos mediante reconocimiento facial y geolocalización.

## Autenticación

La mayoría de endpoints requieren un **JWT Bearer token**.

1. Hacer `POST /api/v1/auth/login` con email y password
2. Copiar el `access_token` de la respuesta
3. En Swagger: click en **Authorize** → ingresar `Bearer <token>`
4. En Postman/Insomnia: header `Authorization: Bearer <token>`

Los endpoints `POST /attendance/check-in` y `POST /attendance/check-out`
**no requieren token** — el reconocimiento facial es la autenticación.

## Reconocimiento facial

Las fotos deben enviarse en **base64** dentro del JSON.
Enviar entre 1 y 5 fotos por request. Se recomienda 3 fotos con 250ms de diferencia.

## Geolocalización

Las coordenadas GPS son **opcionales**. Si se envían, el backend calcula la distancia
a la sede asignada del empleado usando la fórmula de Haversine.
El resultado se guarda en `geo_validated` pero **no bloquea** el registro de asistencia.
""",
    version="1.0.0",
    contact={
        "name": "SistemasLab UMG",
        "email": "sistemas@sistemaslab.dev",
    },
    license_info={
        "name": "Privado — UMG",
    },
    openapi_tags=openapi_tags,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.app_name}


@app.get("/api/v1/health")
async def api_health_check():
    return {"status": "healthy", "app": settings.app_name}


@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs",
    }
