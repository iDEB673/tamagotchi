from datetime import datetime, timezone

from models import Pet


DECAY_PER_HOUR = {
    "hunger": 5,
    "happiness": 4,
    "energy": 3,
    "cleanliness": 3,
}

ACTIONS = {
    "feed": {"hunger": +25, "happiness": +3, "cleanliness": -5},
    "play": {"happiness": +20, "energy": -10, "hunger": -5},
    "sleep": {"energy": +30, "hunger": -5},
    "wash": {"cleanliness": +30, "happiness": +2, "energy": -3},
}


def _to_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _sleep_hours(
    started_at: datetime | None,
    wake_at: datetime,
    gain: float | None = None,
) -> float:
    if started_at is not None:
        return max(0.0, (wake_at - started_at).total_seconds() / 3600)
    if gain is not None:
        return max(1.0, gain * 100 / 30)
    return 1.0


def process_sleep(pet: Pet, now: datetime | None = None) -> bool:
    """Восстанавливает энергию за завершившиеся периоды сна."""
    now = _to_utc(now) or datetime.now(timezone.utc)
    sleep_gain = pet.sleep_gain
    changed = False

    sleep_until = _to_utc(pet.sleep_until)
    if sleep_until is not None and now >= sleep_until:
        sleep_started_at = _to_utc(pet.sleep_started_at)
        if sleep_started_at is None:
            pet.energy = 100
        else:
            # Если передан sleep_gain (быстрый/глубокий сон), используем проценты
            if sleep_gain is not None:
                pet.energy = min(100, round(pet.energy + sleep_gain * 100))
            else:
                # Иначе считаем по часам (30 в час)
                hours = max(0.0, (sleep_until - sleep_started_at).total_seconds() / 3600)
                pet.energy = min(100, round(pet.energy + hours * 30))
        
        pet.sleep_until = None
        pet.sleep_started_at = None
        pet.sleep_gain = None
        changed = True

    night_sleep_wake = _to_utc(pet.night_sleep_wake)
    if night_sleep_wake is not None and now >= night_sleep_wake:
        night_sleep_start = _to_utc(pet.night_sleep_start)
        hours = 0.0
        if night_sleep_start is not None:
            hours = max(0.0, (night_sleep_wake - night_sleep_start).total_seconds() / 3600)
        pet.energy = min(100, round(pet.energy + hours * 30))
        pet.night_sleep_start = None
        pet.night_sleep_wake = None
        changed = True

    if changed:
        pet.last_update = now

    return changed


def apply_decay(pet: Pet) -> None:
    """Считает, сколько статов утекло с момента last_update."""
    now = datetime.now(timezone.utc)
    last = pet.last_update
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    elapsed_hours = (now - last).total_seconds() / 3600
    if elapsed_hours <= 0:
        pet.last_update = now
        return

    for key, rate in DECAY_PER_HOUR.items():
        delta = int(rate * elapsed_hours)
        if delta <= 0:
            continue
        setattr(pet, key, max(0, getattr(pet, key) - delta))

    pet.last_update = now


def apply_action(pet: Pet, action: str) -> bool:
    deltas = ACTIONS.get(action)
    if not deltas:
        return False

    for key, delta in deltas.items():
        new_value = getattr(pet, key) + delta
        setattr(pet, key, max(0, min(100, new_value)))

    _recompute_health(pet)
    return True


def _recompute_health(pet: Pet) -> None:
    if pet.hunger == 0 or pet.cleanliness == 0:
        pet.health = max(0, pet.health - 5)
    elif pet.hunger > 50 and pet.cleanliness > 50 and pet.happiness > 50:
        pet.health = min(100, pet.health + 1)


def pet_to_dict(pet: Pet) -> dict:
    return {
        "id": pet.id,
        "name": pet.name,
        "hunger": pet.hunger,
        "happiness": pet.happiness,
        "energy": pet.energy,
        "cleanliness": pet.cleanliness,
        "health": pet.health,
        "last_update": pet.last_update.isoformat(),
    }