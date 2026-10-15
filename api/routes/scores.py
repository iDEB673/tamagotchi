from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.db import get_session
from models import BlockblastScore, Pet, User

router = APIRouter()


VALID_LEVELS = ("easy", "normal", "hard")


class ScoreRequest(BaseModel):
    level: str
    score: int
    pet_name: str | None = None


class LeaderboardEntry(BaseModel):
    rank: int
    pet_name: str
    score: int
    is_me: bool


def _blur_username(username: str | None) -> str:
    """vk***ya -> маскируем середину"""
    if not username:
        return ""
    if len(username) <= 3:
        return username[0] + "**"
    return username[:2] + "***" + username[-2:]


@router.post("/blockblast/score")
async def save_score(
    payload: ScoreRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if payload.level not in VALID_LEVELS:
        raise HTTPException(400, "Invalid level")

    if payload.score < 0 or payload.score > 100000:
        raise HTTPException(400, "Invalid score")

    # Достаём имя питомца
    if payload.pet_name:
        pet_name = payload.pet_name[:20]
        # Обновим имя в БД, чтобы впредь было актуально
        pet_result = await session.execute(select(Pet).where(Pet.user_id == user.id))
        pet = pet_result.scalar_one_or_none()
        if pet:
            pet.name = pet_name
    else:
        pet_result = await session.execute(select(Pet).where(Pet.user_id == user.id))
        pet = pet_result.scalar_one_or_none()
        pet_name = pet.name if pet else "Питомец"

    entry = BlockblastScore(
        user_id=user.id,
        level=payload.level,
        score=payload.score,
        pet_name=pet_name,
    )
    session.add(entry)
    await session.commit()

    return {"ok": True, "score": payload.score, "level": payload.level}


@router.get("/blockblast/leaderboard")
async def get_leaderboard(
    level: str = "easy",
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if level not in VALID_LEVELS:
        raise HTTPException(400, "Invalid level")

    # Лучший счёт каждого юзера по уровню
    subq = (
        select(
            BlockblastScore.user_id,
            func.max(BlockblastScore.score).label("best_score"),
        )
        .where(BlockblastScore.level == level)
        .group_by(BlockblastScore.user_id)
        .subquery()
    )

    # Джойним с самими записями и с User, чтобы взять username
    rows = (
        await session.execute(
            select(
                BlockblastScore.user_id,
                BlockblastScore.pet_name,
                BlockblastScore.score,
                BlockblastScore.created_at,
                User.username,
            )
            .join(
                subq,
                (BlockblastScore.user_id == subq.c.user_id)
                & (BlockblastScore.score == subq.c.best_score),
            )
            .join(User, User.id == BlockblastScore.user_id)
            .where(BlockblastScore.level == level)
            .order_by(desc(BlockblastScore.score), BlockblastScore.created_at)
            .limit(50)
        )
    ).all()

    # Дедупликация (если у юзера несколько записей с одинаковым макс. счётом — берём первую)
    seen_users = set()
    top = []
    for r in rows:
        if r.user_id in seen_users:
            continue
        seen_users.add(r.user_id)
        top.append(r)
        if len(top) >= 20:
            break

    leaderboard = []
    my_rank = None
    for i, r in enumerate(top, start=1):
        entry = LeaderboardEntry(
            rank=i,
            pet_name=r.pet_name,
            score=r.score,
            is_me=(r.user_id == user.id),
        )
        leaderboard.append(entry)
        if entry.is_me:
            my_rank = i

    # Если меня нет в топ-20 — найдём моё место
    my_entry = None
    if my_rank is None:
        # Мой лучший счёт
        my_best_row = (
            await session.execute(
                select(func.max(BlockblastScore.score)).where(
                    BlockblastScore.level == level,
                    BlockblastScore.user_id == user.id,
                )
            )
        ).scalar_one_or_none()

        if my_best_row is not None:
            # Сколько юзеров имеют счёт больше моего
            better_count_row = (
                await session.execute(
                    select(func.count(func.distinct(subq.c.user_id))).select_from(subq).where(
                        subq.c.best_score > my_best_row
                    )
                )
            ).scalar_one()

            pet_result = await session.execute(select(Pet).where(Pet.user_id == user.id))
            pet = pet_result.scalar_one_or_none()

            my_entry = LeaderboardEntry(
                rank=better_count_row + 1,
                pet_name=pet.name if pet else "Питомец",
                score=my_best_row,
                is_me=True,
            )

    return {
        "level": level,
        "leaderboard": [e.model_dump() for e in leaderboard],
        "my_entry": my_entry.model_dump() if my_entry else None,
    }
# ---------- Кликер ----------

from models import ClickerScore


class ClickerScoreRequest(BaseModel):
    score: int
    pet_name: str | None = None


@router.post("/clicker/score")
async def save_clicker_score(
    payload: ClickerScoreRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if payload.score < 0 or payload.score > 1000:
        raise HTTPException(400, "Invalid score")

    if payload.pet_name:
        pet_name = payload.pet_name[:20]
        pet_result = await session.execute(select(Pet).where(Pet.user_id == user.id))
        pet = pet_result.scalar_one_or_none()
        if pet:
            pet.name = pet_name
    else:
        pet_result = await session.execute(select(Pet).where(Pet.user_id == user.id))
        pet = pet_result.scalar_one_or_none()
        pet_name = pet.name if pet else "Питомец"

    entry = ClickerScore(
        user_id=user.id,
        score=payload.score,
        pet_name=pet_name,
    )
    session.add(entry)
    await session.commit()
    return {"ok": True, "score": payload.score}


@router.get("/clicker/leaderboard")
async def get_clicker_leaderboard(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    subq = (
        select(
            ClickerScore.user_id,
            func.max(ClickerScore.score).label("best_score"),
        )
        .group_by(ClickerScore.user_id)
        .subquery()
    )

    rows = (
        await session.execute(
            select(
                ClickerScore.user_id,
                ClickerScore.pet_name,
                ClickerScore.score,
                ClickerScore.created_at,
                User.username,
            )
            .join(
                subq,
                (ClickerScore.user_id == subq.c.user_id)
                & (ClickerScore.score == subq.c.best_score),
            )
            .join(User, User.id == ClickerScore.user_id)
            .order_by(desc(ClickerScore.score), ClickerScore.created_at)
            .limit(50)
        )
    ).all()

    seen_users = set()
    top = []
    for r in rows:
        if r.user_id in seen_users:
            continue
        seen_users.add(r.user_id)
        top.append(r)
        if len(top) >= 20:
            break

    leaderboard = []
    my_rank = None
    for i, r in enumerate(top, start=1):
        entry = {
            "rank": i,
            "pet_name": r.pet_name,
            "score": r.score,
            "is_me": (r.user_id == user.id),
        }
        leaderboard.append(entry)
        if entry["is_me"]:
            my_rank = i

    my_entry = None
    if my_rank is None:
        my_best = (
            await session.execute(
                select(func.max(ClickerScore.score)).where(ClickerScore.user_id == user.id)
            )
        ).scalar_one_or_none()

        if my_best is not None:
            better = (
                await session.execute(
                    select(func.count(func.distinct(subq.c.user_id)))
                    .select_from(subq)
                    .where(subq.c.best_score > my_best)
                )
            ).scalar_one()

            pet_result = await session.execute(select(Pet).where(Pet.user_id == user.id))
            pet = pet_result.scalar_one_or_none()

            my_entry = {
                "rank": better + 1,
                "pet_name": pet.name if pet else "Питомец",
                "score": my_best,
                "is_me": True,
            }

    return {
        "leaderboard": leaderboard,
        "my_entry": my_entry,
    }