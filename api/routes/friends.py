from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.db import get_session
from models import Friendship, InventoryItem, Pet, User

router = APIRouter()


@router.post("/friends/request/{target_id}")
async def send_friend_request(
    target_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if target_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя добавить себя в друзья",
        )

    target = await session.get(User, target_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    existing = await session.execute(
        select(Friendship.id)
        .where(
            or_(
                (Friendship.sender_id == user.id)
                & (Friendship.receiver_id == target_id),
                (Friendship.sender_id == target_id)
                & (Friendship.receiver_id == user.id),
            ),
            Friendship.status.in_(("pending", "accepted")),
        )
        .limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Запрос уже отправлен или вы уже друзья",
        )

    friendship = Friendship(
        sender_id=user.id,
        receiver_id=target_id,
        status="pending",
    )
    session.add(friendship)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Запрос уже отправлен",
        )

    return {"ok": True}


@router.post("/friends/accept/{request_id}")
async def accept_friend_request(
    request_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    friendship = await session.get(Friendship, request_id)
    if friendship is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    if friendship.receiver_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только получатель может принять запрос",
        )

    if friendship.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request is not pending",
        )

    friendship.status = "accepted"
    await session.commit()

    return {"ok": True}


@router.post("/friends/decline/{request_id}")
async def decline_friend_request(
    request_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    friendship = await session.get(Friendship, request_id)
    if friendship is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    if friendship.receiver_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только получатель может отклонить запрос",
        )

    if friendship.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request is not pending",
        )

    await session.delete(friendship)
    await session.commit()

    return {"ok": True}


@router.get("/friends")
async def get_friends(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    other_user_id = case(
        (Friendship.sender_id == user.id, Friendship.receiver_id),
        else_=Friendship.sender_id,
    )

    equipped_item_id = (
        select(InventoryItem.item_id)
        .where(
            InventoryItem.user_id == User.id,
            InventoryItem.equipped.is_(True),
        )
        .limit(1)
        .correlate(User)
        .scalar_subquery()
    )

    friends_result = await session.execute(
        select(
            User.id,
            User.username,
            User.first_name,
            Pet.name.label("pet_name"),
            equipped_item_id.label("equipped_item_id"),
        )
        .select_from(Friendship)
        .join(User, User.id == other_user_id)
        .outerjoin(Pet, Pet.user_id == User.id)
        .where(
            Friendship.status == "accepted",
            or_(
                Friendship.sender_id == user.id,
                Friendship.receiver_id == user.id,
            ),
        )
        .order_by(User.id)
    )

    friends = [
        {
            "id": row.id,
            "username": row.username or row.first_name,
            "pet_name": row.pet_name,
            "equipped_item_id": row.equipped_item_id,
        }
        for row in friends_result
    ]

    requests_result = await session.execute(
        select(
            Friendship.id.label("request_id"),
            User.id.label("sender_id"),
            User.username,
            User.first_name,
            Pet.name.label("pet_name"),
        )
        .select_from(Friendship)
        .join(User, User.id == Friendship.sender_id)
        .outerjoin(Pet, Pet.user_id == Friendship.sender_id)
        .where(
            Friendship.receiver_id == user.id,
            Friendship.status == "pending",
        )
        .order_by(Friendship.created_at.desc())
    )

    requests = [
        {
            "request_id": row.request_id,
            "sender_id": row.sender_id,
            "sender_name": row.username or row.first_name,
            "pet_name": row.pet_name,
        }
        for row in requests_result
    ]

    return {"friends": friends, "requests": requests}
