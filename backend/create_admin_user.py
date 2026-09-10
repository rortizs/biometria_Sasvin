#!/usr/bin/env python3
"""Repair or create the hidden bootstrap ADMIN user from environment settings."""

import asyncio
import os
import sys
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, "/app")

from app.core.config import Settings, get_settings
from app.core.security import get_password_hash
from app.models.role import Role
from app.models.role_permission import UserRoleAssignment
from app.models.user import User, UserRole


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://biometria:biometria_secret@biometria_db:5432/biometria_db",
)


def build_bootstrap_admin_values(settings: Settings, *, hashed_password: str) -> dict:
    return {
        "email": settings.bootstrap_admin_email.casefold(),
        "hashed_password": hashed_password,
        "full_name": settings.bootstrap_admin_full_name,
        "role": UserRole.ADMIN,
        "is_active": True,
        "must_change_password": True,
    }


def repair_bootstrap_admin_instance(
    admin: User,
    settings: Settings,
    *,
    hashed_password: str | None = None,
) -> User:
    admin.email = settings.bootstrap_admin_email.casefold()
    admin.full_name = settings.bootstrap_admin_full_name
    admin.role = UserRole.ADMIN
    admin.is_active = True
    admin.must_change_password = True
    admin.updated_at = datetime.utcnow()
    if hashed_password:
        admin.hashed_password = hashed_password
    return admin


async def _ensure_admin_role(session: AsyncSession) -> Role:
    result = await session.execute(select(Role).where(Role.name == UserRole.ADMIN.value))
    role = result.scalar_one_or_none()
    if role:
        return role

    role = Role(
        name=UserRole.ADMIN.value,
        description="Hidden bootstrap system administrator",
        is_active=True,
    )
    session.add(role)
    await session.flush()
    return role


async def _ensure_admin_assignment(session: AsyncSession, admin: User, role: Role) -> None:
    result = await session.execute(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == admin.id,
            UserRoleAssignment.role_id == role.id,
        )
    )
    if result.scalar_one_or_none():
        return
    session.add(UserRoleAssignment(user_id=admin.id, role_id=role.id, assigned_by=admin.id))


async def create_admin() -> None:
    settings = get_settings()
    if not settings.bootstrap_admin_password:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD is required for bootstrap recovery")

    password_hash = get_password_hash(settings.bootstrap_admin_password)
    engine = create_async_engine(DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            email = settings.bootstrap_admin_email.casefold()
            result = await session.execute(select(User).where(User.email == email))
            admin = result.scalar_one_or_none()

            if admin:
                repair_bootstrap_admin_instance(admin, settings, hashed_password=password_hash)
                print(f"✅ Bootstrap ADMIN repaired: {email}")
            else:
                admin = User(**build_bootstrap_admin_values(settings, hashed_password=password_hash))
                session.add(admin)
                await session.flush()
                print(f"✅ Bootstrap ADMIN created: {email}")

            role = await _ensure_admin_role(session)
            await _ensure_admin_assignment(session, admin, role)
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_admin())
