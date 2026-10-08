#!/bin/bash
# Запускаем API на порту, который даст Layero
uvicorn api.main:app --host 0.0.0.0 --port $PORT &

# Запускаем бота
python -m bot.main