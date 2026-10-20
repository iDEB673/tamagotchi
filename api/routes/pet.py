from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.db import get_session
from models import InventoryItem, Pet, User
from services import pet_logic

router = APIRouter()


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _serialize_pet(pet: Pet) -> dict:
    data = pet_logic.pet_to_dict(pet)
    sleep_until = _as_utc(pet.sleep_until)
    sleep_started_at = _as_utc(pet.sleep_started_at)
    night_sleep_start = _as_utc(pet.night_sleep_start)
    night_sleep_wake = _as_utc(pet.night_sleep_wake)
    data.update(
        {
            "sleep_until": sleep_until.isoformat() if sleep_until else None,
            "sleep_started_at": (
                sleep_started_at.isoformat() if sleep_started_at else None
            ),
            "sleep_gain": pet.sleep_gain,
            "night_sleep_start": (
                night_sleep_start.isoformat() if night_sleep_start else None
            ),
            "night_sleep_wake": (
                night_sleep_wake.isoformat() if night_sleep_wake else None
            ),
        }
    )
    return data


class ActionRequest(BaseModel):
    action: str


class NameRequest(BaseModel):
    name: str


class SpendRequest(BaseModel):
    amount: int


class GameRewardRequest(BaseModel):
    game: str
    score: int
    level: str | None = None


class SyncStats(BaseModel):
    hunger: float = Field(ge=0, le=100)
    happiness: float = Field(ge=0, le=100)
    energy: float = Field(ge=0, le=100)
    cleanliness: float = Field(ge=0, le=100)


class SyncRequest(BaseModel):
    stats: SyncStats
    equipped_item_id: str | None = None
    sleep_until: datetime | None = None
    sleep_started_at: datetime | None = None
    sleep_gain: float | None = None
    night_sleep_start: datetime | None = None
    night_sleep_wake: datetime | None = None


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
    return _serialize_pet(pet)


@router.post("/pet/sync")
async def sync_pet(
    payload: SyncRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Pet).where(Pet.user_id == user.id))
    pet = result.scalar_one_or_none()
    if pet is None:
        raise HTTPException(status_code=404, detail="Pet not found")

    pet.hunger = round(payload.stats.hunger)
    pet.happiness = round(payload.stats.happiness)
    pet.energy = round(payload.stats.energy)
    pet.cleanliness = round(payload.stats.cleanliness)
    pet.last_update = datetime.now(timezone.utc)

    if "sleep_until" in payload.model_fields_set:
        pet.sleep_until = _as_utc(payload.sleep_until)
    if "sleep_started_at" in payload.model_fields_set:
        pet.sleep_started_at = _as_utc(payload.sleep_started_at)
    if "sleep_gain" in payload.model_fields_set:
        pet.sleep_gain = payload.sleep_gain
    if "night_sleep_start" in payload.model_fields_set:
        pet.night_sleep_start = _as_utc(payload.night_sleep_start)
    if "night_sleep_wake" in payload.model_fields_set:
        pet.night_sleep_wake = _as_utc(payload.night_sleep_wake)

    items = (
        await session.execute(
            select(InventoryItem).where(InventoryItem.user_id == user.id)
        )
    ).scalars().all()

    equipped_item = None
    if payload.equipped_item_id is not None:
        equipped_item = next(
            (it for it in items if it.item_id == payload.equipped_item_id), None
        )
        if equipped_item is None:
            raise HTTPException(status_code=400, detail="Item not owned")

    for item in items:
        item.equipped = item is equipped_item

    await session.commit()
    await session.refresh(pet)

    return {
        "ok": True,
        "stats": _serialize_pet(pet),
        "equipped_item_id": equipped_item.item_id if equipped_item else None,
    }


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
        select(Pet.id)
        .where(func.lower(Pet.name) == name.lower(), Pet.user_id != user.id)
        .limit(1)
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
        if payload.level == "hard":
            reward = 75 if payload.score >= 500 else 50 if payload.score >= 300 else 35 if payload.score >= 200 else 22 if payload.score >= 150 else 14 if payload.score >= 100 else 8 if payload.score >= 50 else 3
        elif payload.level == "normal":
            reward = 40 if payload.score >= 500 else 25 if payload.score >= 300 else 17 if payload.score >= 200 else 11 if payload.score >= 150 else 7 if payload.score >= 100 else 4 if payload.score >= 50 else 1
        else: # easy
            reward = 15 if payload.score >= 500 else 10 if payload.score >= 300 else 7 if payload.score >= 200 else 5 if payload.score >= 150 else 3 if payload.score >= 100 else 2 if payload.score >= 50 else 0
    elif payload.game == "sudoku":
        if payload.score == 1:
            reward = 10
        elif payload.score == 2:
            reward = 25
        elif payload.score == 3:
            reward = 50
        else:
            reward = 0
    elif payload.game == "casino":
        # Ограничиваем сверху, чтобы нельзя было накрутить читами
        reward = min(payload.score, 500)    
    else:
        raise HTTPException(400, f"Unknown game: {payload.game}")
    

    user.coins += reward
    await session.commit()
    await session.refresh(user)
    return {"ok": True, "reward": reward, "coins": user.coins}