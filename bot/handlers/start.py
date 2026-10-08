from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message

from bot.keyboards import main_menu

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    await message.answer(
        f"Привет, {message.from_user.first_name}! 🐾\n\n"
        "Это твой виртуальный питомец. Заботься о нём: корми, играй, "
        "следи за настроением. Скоро здесь появится игра.",
        reply_markup=main_menu(),
    )


@router.callback_query(lambda c: c.data == "not_ready")
async def not_ready_cb(callback: CallbackQuery) -> None:
    await callback.answer("Mini App ещё в разработке 🚧", show_alert=True)