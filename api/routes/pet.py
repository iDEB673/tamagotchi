from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.db import get_session
from models import Pet, User
from services import pet_logic

router = APIRouter()


class ActionRequest(BaseModel):
    action: str


class NameRequest(BaseModel):
    name: str


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "coins": user.coins,
    }


@router.get("/pet")
async def get_pet(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Pet).where(Pet.user_id == user.id))
    pet = result.scalar_one_or_none()
    if pet is None:
        raise HTTPException(status_code=404, detail="Pet not found")

    pet_logic.apply_decay(pet)
    await session.commit()
    await session.refresh(pet)

    return pet_logic.pet_to_dict(pet)


@router.post("/pet/name")
async def set_pet_name(
    payload: NameRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    name = payload.name.strip()[:20]
    if not name:
        raise HTTPException(status_code=400, detail="Name is empty")

    result = await session.execute(select(Pet).where(Pet.user_id == user.id))
    pet = result.scalar_one_or_none()
    if pet is None:
        raise HTTPException(status_code=404, detail="Pet not found")

    pet.name = name
    await session.commit()
    await session.refresh(pet)
    return pet_logic.pet_to_dict(pet)


@router.post("/action")
async def do_action(
    payload: ActionRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Pet).where(Pet.user_id == user.id))
    pet = result.scalar_one_or_none()
    if pet is None:
        raise HTTPException(status_code=404, detail="Pet not found")

    pet_logic.apply_decay(pet)

    ok = pet_logic.apply_action(pet, payload.action)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action: {payload.action}",
        )

    if user.coins > 0:
        user.coins -= 1

    await session.commit()
    await session.refresh(pet)
    await session.refresh(user)

    return {
        "pet": pet_logic.pet_to_dict(pet),
        "coins": user.coins,
    }