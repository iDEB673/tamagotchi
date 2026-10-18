from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.db import get_session
from models import InventoryItem, User

router = APIRouter()


# ---------- Каталог предметов (хардкод) ----------

SHOP_ITEMS = {
    "wizard_hat": {
        "name": "Шапка волшебника",
        "emoji": "🧙",
        "price": 0,
        "special": True,
    },
    "crown": {
        "name": "Корона",
        "emoji": "👑",
        "price": 200,
        "special": False,
    },
    "cap": {
        "name": "Кепка",
        "emoji": "🧢",
        "price": 50,
        "special": False,
    },
    "sunglasses": {
        "name": "Очки",
        "emoji": "🕶️",
        "price": 80,
        "special": False,
    },
    "bow": {
        "name": "Бантик",
        "emoji": "🎀",
        "price": 40,
        "special": False,
    },
    "mask": {
        "name": "Маска анонимуса",
        "emoji": "🎭",
        "price": 150,
        "special": False,
    },
        "wheel_face": {
        "name": "Колесо на лице",
        "emoji": "🎡",
        "price": 0,
        "special": True,
    },
}


class BuyRequest(BaseModel):
    item_id: str


class EquipRequest(BaseModel):
    item_id: str


@router.get("/shop/items")
async def list_items():
    """Список предметов для магазина (без special)."""
    return [
        {"item_id": k, **v}
        for k, v in SHOP_ITEMS.items()
        if not v["special"]
    ]

@router.get("/inventory/granted")
async def get_granted_items(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Возвращает предметы, выданные юзеру через БД (выдал админ через SQL)."""
    result = await session.execute(
        select(InventoryItem).where(InventoryItem.user_id == user.id)
    )
    items = result.scalars().all()
    return {
        "items": [
            {"item_id": it.item_id, "equipped": it.equipped}
            for it in items
        ]
    }

@router.get("/inventory")
async def get_inventory(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(InventoryItem).where(InventoryItem.user_id == user.id)
    )
    items = result.scalars().all()
    return [
        {
            "item_id": it.item_id,
            "equipped": it.equipped,
            "name": SHOP_ITEMS.get(it.item_id, {}).get("name", it.item_id),
            "emoji": SHOP_ITEMS.get(it.item_id, {}).get("emoji", "❓"),
        }
        for it in items
    ]


@router.post("/shop/buy")
async def buy_item(
    payload: BuyRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    item = SHOP_ITEMS.get(payload.item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if item["special"]:
        raise HTTPException(403, "Этот предмет нельзя купить")

    # Уже куплено?
    result = await session.execute(
        select(InventoryItem).where(
            InventoryItem.user_id == user.id,
            InventoryItem.item_id == payload.item_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(400, "Уже куплено")

    if user.coins < item["price"]:
        raise HTTPException(400, "Недостаточно монет")

    user.coins -= item["price"]
    session.add(InventoryItem(user_id=user.id, item_id=payload.item_id))
    await session.commit()
    await session.refresh(user)

    return {"ok": True, "coins": user.coins}


@router.post("/inventory/equip")
async def equip_item(
    payload: EquipRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(InventoryItem).where(
            InventoryItem.user_id == user.id,
            InventoryItem.item_id == payload.item_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "У тебя нет этого предмета")

    # Снимаем всё остальное
    all_items = (await session.execute(
        select(InventoryItem).where(InventoryItem.user_id == user.id)
    )).scalars().all()

    # Если этот уже надет — снимаем
    if item.equipped:
        item.equipped = False
    else:
        for it in all_items:
            it.equipped = False
        item.equipped = True

    await session.commit()
    return {"ok": True, "equipped": item.item_id if item.equipped else None}


@router.post("/earn")
async def earn_coins(
    payload: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Начислить монеты за игру. Простая проверка: 0..100 за раз."""
    amount = int(payload.get("amount", 0))
    if amount <= 0 or amount > 100:
        raise HTTPException(400, "Неверная сумма")
    user.coins += amount
    await session.commit()
    await session.refresh(user)
    return {"ok": True, "coins": user.coins}