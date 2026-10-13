from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo


def main_menu() -> InlineKeyboardMarkup:
    row = [
        InlineKeyboardButton(
            text="🐾 Открыть питомца",
            web_app=WebAppInfo(url="https://ideb673.github.io/tamagotchi/"),
        )
    ]
    return InlineKeyboardMarkup(inline_keyboard=[row])