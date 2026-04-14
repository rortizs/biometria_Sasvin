#!/usr/bin/env python3
"""
Script to create admin user in the Biometria database.
Run this directly on the server or through Docker.
"""

import asyncio
import sys
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import bcrypt

# Add the app directory to the path
sys.path.insert(0, "/app")  # For Docker container
# sys.path.insert(0, '.')    # For local development

from app.models.user import User
from app.db.base import Base

# Database URL - adjust as needed
DATABASE_URL = (
    "postgresql+asyncpg://biometria:biometria_secret@biometria_db:5432/biometria_db"
)
# For local testing:
# DATABASE_URL = "postgresql+asyncpg://richardortiz@localhost:5432/biometria_db"


async def create_admin():
    """Create admin user if it doesn't exist."""

    # Create engine
    engine = create_async_engine(DATABASE_URL, echo=True)

    # Create session
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            # Check if admin exists
            result = await session.execute(
                select(User).where(User.email == "admin@sistemaslab.dev")
            )
            existing_admin = result.scalar_one_or_none()

            if existing_admin:
                print("❌ Admin user already exists!")
                print(f"   Email: {existing_admin.email}")
                print(f"   Role: {existing_admin.role}")
                return

            # Hash the password
            password = "Admin2024!"  # Change this immediately after first login!
            password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())

            # Create admin user
            admin = User(
                email="admin@sistemaslab.dev",
                hashed_password=password_hash.decode("utf-8"),
                full_name="System Administrator",
                role="admin",
                is_active=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )

            session.add(admin)
            await session.commit()

            print("✅ Admin user created successfully!")
            print("   Email: admin@sistemaslab.dev")
            print("   Password: Admin2024!")
            print(
                "   ⚠️  IMPORTANT: Change this password immediately after first login!"
            )

        except Exception as e:
            print(f"❌ Error creating admin user: {e}")
            await session.rollback()
            raise
        finally:
            await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_admin())
