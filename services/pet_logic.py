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