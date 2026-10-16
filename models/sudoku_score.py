from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class SudokuScore(Base):
    __tablename__ = "sudoku_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[str] = mapped_column(String(16), index=True)
    time_seconds: Mapped[int] = mapped_column(Integer)
    pet_name: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_sudoku_level_time", "level", "time_seconds"),
    )