import asyncio
import logging
from pathlib import Path

import aiohttp
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import friends, pet, scores, shop, sleep, visit
from core.config import settings

logger = logging.getLogger("wake")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Tamagotchi API",
    version="0.2.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pet.router, prefix="/api")
app.include_router(friends.router, prefix="/api")
app.include_router(visit.router, prefix="/api")
app.include_router(scores.router, prefix="/api")
app.include_router(shop.router, prefix="/api")
app.include_router(sleep.router, prefix="/api")


@app.get("/health")
async def health():
    return {"ok": True}


WEBAPP_DIR = Path(__file__).resolve().parent.parent / "docs"
if WEBAPP_DIR.exists():
    app.mount("/app", StaticFiles(directory=WEBAPP_DIR, html=True), name="webapp")


# ---------- Планировщик уведомлений ----------

async def wake_checker() -> None:
    tg_url = f"https://api.telegram.org/bot{settings.bot_token}/sendMessage"
    logger.info("Wake checker started")
    while True:
        await asyncio.sleep(20)
        try:
            due = sleep.take_due_wakes()
            if not due:
                continue
            async with aiohttp.ClientSession() as http:
                for user_id, entry in due:
                    text = (
                        f"😴 <b>{entry['pet_name']}</b> уже проснулся!\n\n"
                        f"⚡ Энергия восстановлена. Загляни в игру!"
                    )
                    try:
                        await http.post(
                            tg_url,
                            json={
                                "chat_id": user_id,
                                "text": text,
                                "parse_mode": "HTML",
                            },
                        )
                        logger.info(f"Wake notified user {user_id}")
                    except Exception as e:
                        logger.warning(f"Failed to send to {user_id}: {e}")
        except Exception as e:
            logger.exception(f"wake_checker error: {e}")


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(wake_checker())