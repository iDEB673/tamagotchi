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


class SpendRequest(BaseModel):
    amount: int


class GameRewardRequest(BaseModel):
    game: str
    score: int


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
    if name.lower() == "питомец":
        raise HTTPException(status_code=400, detail="Это имя зарезервировано")

    existing = await session.execute(
        select(Pet).where(Pet.name == name, Pet.user_id != user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Это имя уже занято другим питомцем. Придумай другое.",
        )

    result = await session.execute(select(Pet).where(Pet.user_id == user.id))
    pet = result.scalar_one_or_none()
    if pet is None:
        pet = Pet(user_id=user.id, name=name)
        session.add(pet)
    else:
        pet.name = name

    await session.commit()
    await session.refresh(pet)
    return pet_logic.pet_to_dict(pet)

@router.post("/coins/spend")
async def spend_coins(
    payload: SpendRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if payload.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if user.coins < payload.amount:
        raise HTTPException(400, "Not enough coins")

    user.coins -= payload.amount
    await session.commit()
    await session.refresh(user)
    return {"ok": True, "coins": user.coins}


@router.post("/game/reward")
async def game_reward(
    payload: GameRewardRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    reward = 0
    if payload.game == "clicker":
        reward = 5 if payload.score >= 30 else 0
    elif payload.game == "blockblast":
        if payload.score >= 300:
            reward = 20
        elif payload.score >= 150:
            reward = 10
        elif payload.score >= 50:
            reward = 5
        else:
            reward = 2
    else:
        raise HTTPException(400, f"Unknown game: {payload.game}")

    user.coins += reward
    await session.commit()
    await session.refresh(user)
    return {"ok": True, "reward": reward, "coins": user.coins}