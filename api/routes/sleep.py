from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# Хранилище "спящих": {user_id: [{"wake_at": timestamp, "pet_name": str}]}
sleeping: dict[int, list[dict]] = {}


class SleepRequest(BaseModel):
    user_id: int
    pet_name: str
    duration_seconds: int


@router.post("/sleep/schedule")
async def schedule_sleep(payload: SleepRequest):
    wake_at = datetime.now(timezone.utc).timestamp() + payload.duration_seconds
    entry = {"wake_at": wake_at, "pet_name": payload.pet_name}
    sleeping.setdefault(payload.user_id, []).append(entry)
    return {"ok": True, "wake_at": wake_at}


def take_due_wakes() -> list[tuple[int, dict]]:
    """Возвращает всех, кто уже проснулся, и удаляет их из очереди."""
    now = datetime.now(timezone.utc).timestamp()
    due: list[tuple[int, dict]] = []
    for user_id in list(sleeping.keys()):
        entries = sleeping[user_id]
        remaining = []
        for entry in entries:
            if entry["wake_at"] <= now:
                due.append((user_id, entry))
            else:
                remaining.append(entry)
        if remaining:
            sleeping[user_id] = remaining
        else:
            sleeping.pop(user_id, None)
    return due