from fastapi import APIRouter

from app.api.v1.endpoints import auth, employees, faces, attendance, settings, positions, departments, locations, schedules

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(employees.router, prefix="/employees", tags=["employees"])
api_router.include_router(faces.router, prefix="/faces", tags=["faces"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(positions.router, prefix="/positions", tags=["positions"])
api_router.include_router(departments.router, prefix="/departments", tags=["departments"])
api_router.include_router(locations.router, prefix="/locations", tags=["locations"])
api_router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
