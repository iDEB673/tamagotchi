from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# Один активный сон на пользователя: {user_id: {"wake_at": float, "pet_name": str}}
sleeping: dict[int, dict] = {}


class SleepRequest(BaseModel):
    user_id: int
    pet_name: str
    duration_seconds: int


@router.post("/sleep/schedule")
async def schedule_sleep(payload: SleepRequest):
    wake_at = datetime.now(timezone.utc).timestamp() + payload.duration_seconds

    # Перезаписываем — старый сон отменяется, если был
    sleeping[payload.user_id] = {
        "wake_at": wake_at,
        "pet_name": payload.pet_name,
    }

    return {"ok": True, "wake_at": wake_at}


def take_due_wakes() -> list[tuple[int, dict]]:
    now = datetime.now(timezone.utc).timestamp()
    due: list[tuple[int, dict]] = []

    for user_id in list(sleeping.keys()):
        entry = sleeping[user_id]
        if entry["wake_at"] <= now:
            due.append((user_id, entry))
            del sleeping[user_id]

    return due