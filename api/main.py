from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import pet

app = FastAPI(title="Tamagotchi API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pet.router, prefix="/api")


@app.get("/health")
async def health():
    return {"ok": True}


# Раздача Mini App (фронта) с того же домена
WEBAPP_DIR = Path(__file__).resolve().parent.parent / "webapp"
if WEBAPP_DIR.exists():
    app.mount("/app", StaticFiles(directory=WEBAPP_DIR, html=True), name="webapp")