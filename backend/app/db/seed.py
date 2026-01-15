"""
Seed script to populate initial data for the biometric attendance system.
Run with: python -m app.db.seed
"""
import asyncio
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker
from app.models.settings import Settings
from app.models.position import Position
from app.models.department import Department
from app.models.location import Location


async def seed_positions(db: AsyncSession) -> None:
    """Create initial positions."""
    positions = [
        {"name": "Coordinador", "description": "Coordinador de área"},
        {"name": "Catedrático", "description": "Docente/Profesor"},
        {"name": "Alumno", "description": "Estudiante"},
    ]

    for pos_data in positions:
        result = await db.execute(select(Position).where(Position.name == pos_data["name"]))
        if not result.scalar_one_or_none():
            position = Position(
                name=pos_data["name"],
                description=pos_data["description"],
                is_active=True,
                created_at=datetime.utcnow(),
            )
            db.add(position)
            print(f"✓ Created position: {pos_data['name']}")
        else:
            print(f"  Position already exists: {pos_data['name']}")


async def seed_settings(db: AsyncSession) -> None:
    """Create initial settings."""
    result = await db.execute(select(Settings).limit(1))
    existing = result.scalar_one_or_none()

    if not existing:
        settings = Settings(
            company_name="Universidad Mariano Gálvez",
            company_address="3a. Avenida 9-00 zona 2, Guatemala",
            slogan="Educación que transforma",
            email_domain="miumg.edu.gt",
            logo_url=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(settings)
        print("✓ Created initial settings")
    else:
        print("  Settings already exist")


async def seed_sample_departments(db: AsyncSession) -> None:
    """Create sample departments."""
    departments = [
        {"name": "Ingeniería en Sistemas", "description": "Facultad de Ingeniería"},
        {"name": "Administración de Empresas", "description": "Facultad de Ciencias Económicas"},
        {"name": "Derecho", "description": "Facultad de Derecho"},
    ]

    for dept_data in departments:
        result = await db.execute(select(Department).where(Department.name == dept_data["name"]))
        if not result.scalar_one_or_none():
            department = Department(
                name=dept_data["name"],
                description=dept_data["description"],
                is_active=True,
                created_at=datetime.utcnow(),
            )
            db.add(department)
            print(f"✓ Created department: {dept_data['name']}")
        else:
            print(f"  Department already exists: {dept_data['name']}")


async def seed_sample_location(db: AsyncSession) -> None:
    """Create a sample location (sede) - Campus Central UMG."""
    result = await db.execute(select(Location).where(Location.name == "Campus Central"))
    if not result.scalar_one_or_none():
        location = Location(
            name="Campus Central",
            address="3a. Avenida 9-00 zona 2, Ciudad de Guatemala",
            latitude=14.6349,  # Approximate coordinates for Guatemala City
            longitude=-90.5069,
            radius_meters=100,  # 100 meter radius
            is_active=True,
            created_at=datetime.utcnow(),
        )
        db.add(location)
        print("✓ Created sample location: Campus Central")
    else:
        print("  Location already exists: Campus Central")


async def seed_all() -> None:
    """Run all seed functions."""
    print("\n🌱 Seeding database...\n")

    async with async_session_maker() as db:
        await seed_settings(db)
        await seed_positions(db)
        await seed_sample_departments(db)
        await seed_sample_location(db)

        await db.commit()

    print("\n✅ Seeding completed!\n")


if __name__ == "__main__":
    asyncio.run(seed_all())
