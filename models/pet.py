from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.db import get_session
from models import InventoryItem, Pet, User
from services import pet_logic

router = APIRouter()
if TYPE_CHECKING:
    from models.user import User


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    name: Mapped[str] = mapped_column(String(64), default="Питомец")
    hunger: Mapped[int] = mapped_column(default=100)
    happiness: Mapped[int] = mapped_column(default=100)
    energy: Mapped[int] = mapped_column(default=100)
    cleanliness: Mapped[int] = mapped_column(default=100)
    health: Mapped[int] = mapped_column(default=100)
    last_petted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_update: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    owner: Mapped["User"] = relationship(back_populates="pet")