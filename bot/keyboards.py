from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from core.config import settings


def main_menu() -> InlineKeyboardMarkup:
    if settings.webapp_url:
        row = [
            InlineKeyboardButton(
                text="🐾 Открыть питомца",
                web_app=WebAppInfo(url=settings.webapp_url),
            )
        ]
    else:
        row = [
            InlineKeyboardButton(
                text="🐾 Открыть питомца (скоро)",
                callback_data="not_ready",
            )
        ]
    return InlineKeyboardMarkup(inline_keyboard=[row])