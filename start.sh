#!/bin/bash

# Запускаем API в фоне
uvicorn api.main:app --host 0.0.0.0 --port $PORT &
API_PID=$!

# Запускаем бота
python -m bot.main

# Ждём, пока работает API (чтобы контейнер не закрылся, если бот упадет)
wait $API_PID