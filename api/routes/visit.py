from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.db import get_session
from models import InventoryItem, Pet, User

router = APIRouter()


async def _get_pet_owner(
    target_user_id: int, session: AsyncSession
) -> tuple[Pet, User]:
    result = await session.execute(
        select(Pet, User)
        .join(User, User.id == Pet.user_id)
        .where(Pet.user_id == target_user_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet not found",
        )
    pet, owner = row
    return pet, owner


async def _get_equipped_item_id(user_id: int, session: AsyncSession) -> str | None:
    result = await session.execute(
        select(InventoryItem.item_id)
        .where(InventoryItem.user_id == user_id, InventoryItem.equipped.is_(True))
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/visit/search/{pet_name}")
async def search_pet_by_name(
    pet_name: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    name = pet_name.strip()
    if not name or name.lower() == "питомец":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet not found",
        )

    result = await session.execute(
        select(Pet.user_id)
        .where(func.lower(Pet.name) == name.lower())
        .order_by(Pet.id)
        .limit(1)
    )
    user_id = result.scalar_one_or_none()
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet not found",
        )

    return {"user_id": user_id}


@router.get("/visit/{target_user_id}")
async def visit_pet(
    target_user_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    pet, owner = await _get_pet_owner(target_user_id, session)
    hat_item_id = await _get_equipped_item_id(owner.id, session)

    return {
        "name": pet.name,
        "hunger": pet.hunger,
        "happiness": pet.happiness,
        "energy": pet.energy,
        "cleanliness": pet.cleanliness,
        "hat_item_id": hat_item_id,
        "owner_username": owner.username or owner.first_name,
    }


@router.post("/visit/{target_user_id}/pet")
async def pet_friend_pet(
    target_user_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if target_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя гладить собственного питомца",
        )

    pet, owner = await _get_pet_owner(target_user_id, session)

    now = datetime.now(timezone.utc)
    if pet.last_petted_at is not None:
        last_petted_at = pet.last_petted_at
        if last_petted_at.tzinfo is None:
            last_petted_at = last_petted_at.replace(tzinfo=timezone.utc)
        if now - last_petted_at < timedelta(hours=1):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Слишком часто",
            )

    pet.last_petted_at = now
    pet.happiness = min(100, pet.happiness + 5)
    owner.coins += 1

    await session.commit()
    await session.refresh(pet)

    return {"ok": True, "new_happiness": pet.happiness}
