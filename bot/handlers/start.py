import logging

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bot.keyboards import main_menu
from core.db import async_session
from models import User

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    tg_user = message.from_user

    # Сохраняем юзера в БД (если новый)
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == tg_user.id))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                id=tg_user.id,
                username=tg_user.username,
                first_name=tg_user.first_name,
                coins=100,
            )
            session.add(user)
            await session.commit()
            logging.info(f"NEW USER: @{tg_user.username} id={tg_user.id}")

    await message.answer(
        f"Привет, {tg_user.first_name}! 🐾\n\n"
        "Это твой виртуальный питомец.",
        reply_markup=main_menu(),
    )


@router.callback_query(lambda c: c.data == "not_ready")
async def not_ready_cb(callback: CallbackQuery) -> None:
    await callback.answer("Mini App ещё в разработке 🚧", show_alert=True)