from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Ensure models are imported so Alembic autogeneration can discover them
import app.models  # noqa: F401,E402
