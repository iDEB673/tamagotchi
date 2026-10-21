(() => {
    function waitForApp() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.App) resolve(window.App);
                else setTimeout(check, 50);
            };
            check();
        });
    }

    const $ = (id) => document.getElementById(id);

    const GRID = 15;
    const CELL = 20;
    const ENERGY_COST = 10;
    const START_SPEED = 150;
    const MIN_SPEED = 70;
    const SPEED_STEP = 5;

    const DIRECTIONS = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    };

    const KEY_DIRECTIONS = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
    };

    let App = null;
    let canvas = null;
    let ctx = null;
    let snake = [];
    let direction = DIRECTIONS.right;
    let nextDirection = DIRECTIONS.right;
    let apple = null;
    let score = 0;
    let speed = START_SPEED;
    let timerId = null;
    let active = false;

    function isVisible() {
        const screen = $("snake");
        return screen && !screen.classList.contains("hidden");
    }

    function updateHud() {
        $("snakeScore").textContent = score;
        $("snakeEnergy").textContent = Math.round(App.getState().stats.energy);
    }

    function draw() {
        ctx.clearRect(0, 0, GRID * CELL, GRID * CELL);

        for (let i = 0; i < snake.length; i++) {
            const segment = snake[i];
            ctx.fillStyle = i === 0 ? "#2e7d32" : "#4fc26a";
            ctx.fillRect(
                segment.x * CELL + 1,
                segment.y * CELL + 1,
                CELL - 2,
                CELL - 2
            );
        }

        if (apple) {
            ctx.fillStyle = "#e05a5a";
            ctx.fillRect(
                apple.x * CELL + 2,
                apple.y * CELL + 2,
                CELL - 4,
                CELL - 4
            );
        }
    }

    function spawnApple() {
        const free = [];
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                if (!snake.some((part) => part.x === x && part.y === y)) {
                    free.push({ x, y });
                }
            }
        }
        if (free.length === 0) return null;
        return free[Math.floor(Math.random() * free.length)];
    }

    function stopTicker() {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    function restartTicker() {
        stopTicker();
        if (!active) return;
        timerId = setInterval(tick, speed);
    }

    function setDirection(name) {
        if (!active) return;
        const next = DIRECTIONS[name];
        if (!next) return;
        if (next.x === -direction.x && next.y === -direction.y) return;
        nextDirection = next;
    }

    function tick() {
        if (!active) return;

        direction = nextDirection;
        const head = {
            x: snake[0].x + direction.x,
            y: snake[0].y + direction.y,
        };

        const hitsWall =
            head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID;
        const hitsSelf = snake.some(
            (part) => part.x === head.x && part.y === head.y
        );

        if (hitsWall || hitsSelf) {
            endGame();
            return;
        }

        snake.unshift(head);
        const ate = apple && head.x === apple.x && head.y === apple.y;

        if (ate) {
            score += 10;
            speed = Math.max(MIN_SPEED, speed - SPEED_STEP);
            apple = spawnApple();
            App.playSound("win");
            App.hapticImpact("light");
            updateHud();
            restartTicker();
        } else {
            snake.pop();
        }

        draw();
    }

    function endGame() {
        if (!active) return;
        active = false;
        stopTicker();

        const reward = Math.max(0, Math.min(Math.floor(score / 2), 20));
        const state = App.getState();

        state.coins += reward;
        state.gamesPlayed = (state.gamesPlayed || 0) + 1;
        App.save();

        App.playSound("error");
        App.hapticImpact("heavy");
        App.notify(`Игра окончена!\nСчёт: ${score}\nМонеты: +${reward}`);

        if (App.isOnline && App.isOnline()) {
            App.apiFetch("/api/game/reward", {
                method: "POST",
                body: JSON.stringify({ game: "snake", score }),
            })
                .then((res) => {
                    if (res && typeof res.coins === "number") {
                        state.coins = res.coins;
                        App.save();
                    }
                })
                .catch((e) => console.warn("snake reward:", e));
        }

        App.showGame();
    }

    function startGame() {
        score = 0;
        speed = START_SPEED;
        direction = DIRECTIONS.right;
        nextDirection = DIRECTIONS.right;
        snake = [
            { x: 7, y: 7 },
            { x: 6, y: 7 },
            { x: 5, y: 7 },
        ];
        apple = spawnApple();
        active = true;

        updateHud();
        draw();
        restartTicker();
    }

    function openSnake() {
        const state = App.getState();

        if (state.sleepUntil && Date.now() < state.sleepUntil) {
            App.notify("Питомец спит");
            return;
        }

        if (state.stats.energy < ENERGY_COST) {
            App.notify(`Нужно ${ENERGY_COST} энергии.`);
            App.showGame();
            return;
        }

        state.stats.energy -= ENERGY_COST;
        App.save();
        if (App.pushStatsToServer) App.pushStatsToServer();

        App.hideAll();
        $("snake").classList.remove("hidden");
        startGame();
    }

    function exitGame() {
        active = false;
        stopTicker();
        App.showGame();
    }

    function onKeyDown(event) {
        if (!active || !isVisible()) return;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        const name = KEY_DIRECTIONS[key];
        if (!name) return;
        event.preventDefault();
        setDirection(name);
        App.hapticImpact("light");
    }

    function bind() {
        $("chooseSnake").addEventListener("click", openSnake);
        $("snakeBack").addEventListener("click", exitGame);

        document.querySelectorAll(".dpad-btn").forEach((button) => {
            button.addEventListener("click", () => {
                setDirection(button.dataset.dir);
                App.hapticImpact("light");
            });
        });

        document.addEventListener("keydown", onKeyDown);
    }

    async function init() {
        App = await waitForApp();
        canvas = $("snakeCanvas");
        ctx = canvas ? canvas.getContext("2d") : null;
        if (!canvas || !ctx) return;

        bind();
        if (App.registerCleanup) App.registerCleanup(stopTicker);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
