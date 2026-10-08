from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.db import get_session
from core.security import validate_init_data
from models import Pet, User


async def get_current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )

    init_data = authorization[4:]
    parsed = validate_init_data(init_data, settings.bot_token)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid initData",
        )

    tg_user = parsed.get("user")
    if not tg_user or "id" not in tg_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No user in initData",
        )

    tg_id = int(tg_user["id"])

    result = await session.execute(select(User).where(User.id == tg_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            id=tg_id,
            username=tg_user.get("username"),
            first_name=tg_user.get("first_name"),
            coins=100,
        )
        session.add(user)
        await session.flush()

        pet = Pet(user_id=tg_id, name="Питомец")
        session.add(pet)

        await session.commit()
        await session.refresh(user)

    return user