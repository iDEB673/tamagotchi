(() => {
    function waitForApp() {
        return new Promise((resolve) => {
            const check = () => { if (window.App) resolve(window.App); else setTimeout(check, 50); };
            check();
        });
    }

    const SPIN_COST = 50;
    const SECTOR_ANGLE = 45; // 360 / 8 секторов

    // Награды
    const PRIZES = [
        { type: "coins_small", weight: 35, emoji: "🪙", label: "+10 💰", coins: 10 },
        { type: "coins_med",   weight: 20, emoji: "💰", label: "+30 💰", coins: 30 },
        { type: "coins_big",   weight: 5,  emoji: "💎", label: "+100 💰", coins: 100 },
        { type: "food",        weight: 20, emoji: "🍕", label: "Пицца", food: "pizza" },
        { type: "food",        weight: 10, emoji: "🍫", label: "Кит-Кат", food: "kitkat" },
        { type: "skin",        weight: 2,  emoji: "🎁", label: "СКИН!", skin: true },
        { type: "empty",       weight: 5,  emoji: "💨", label: "Пусто", },
        { type: "coins_tiny",  weight: 3,  emoji: "🪙", label: "+5 💰", coins: 5 },
    ];

    // Пул скинов (по очереди)
    const SKIN_POOL = ["wheel_face", "mask", "crown", "sunglasses", "cap", "bow"];

    let App = null;
    let spinning = false;
    let currentRotation = 0;

    const $ = (id) => document.getElementById(id);

    function getWeightedPrize() {
        const total = PRIZES.reduce((s, p) => s + p.weight, 0);
        let r = Math.random() * total;
        for (const p of PRIZES) {
            r -= p.weight;
            if (r <= 0) return p;
        }
        return PRIZES[0];
    }

    function getNextSkin() {
        const state = App.getState();
        if (!state.casinoPool || state.casinoPool.length === 0) {
            // Создаём пул из доступных (которых ещё нет у юзера)
            const available = SKIN_POOL.filter(id => !state.owned.includes(id));
            state.casinoPool = available.length > 0 ? [...available] : [...SKIN_POOL];
            App.save();
        }
        return state.casinoPool[0];
    }

    function consumeSkin() {
        const state = App.getState();
        const skin = state.casinoPool.shift();
        if (state.casinoPool.length === 0) {
            // Перезаполняем пул, исключая то, что уже есть
            const available = SKIN_POOL.filter(id => !state.owned.includes(id) && id !== skin);
            state.casinoPool = available.length > 0 ? [...available] : [...SKIN_POOL.filter(id => id !== skin)];
        }
        App.save();
        return skin;
    }

    async function spin() {
        if (spinning) return;
        const state = App.getState();
        if (state.coins < SPIN_COST) {
            App.notify("Нужно 50 💰");
            return;
        }

        // Списываем монеты
        if (App.isOnline()) {
            try {
                const res = await App.apiFetch("/api/coins/spend", {
                    method: "POST",
                    body: JSON.stringify({ amount: SPIN_COST }),
                });
                state.coins = res.coins;
            } catch (e) {
                if (e.message !== "OFFLINE") { App.notify("Ошибка: " + e.message); return; }
                state.coins -= SPIN_COST;
            }
        } else {
            state.coins -= SPIN_COST;
        }
        App.save();
        $("casinoCoins").textContent = state.coins;

        spinning = true;
        $("spinBtn").disabled = true;

        // Выбираем приз
        const prize = getWeightedPrize();
        let skinId = null;
        if (prize.type === "skin") {
            skinId = getNextSkin();
        }

        // Определяем угол (сектор)
        const sectorIndex = Math.floor(Math.random() * 8);
        const targetAngle = currentRotation + 360 * 5 + (360 - sectorIndex * SECTOR_ANGLE);
        currentRotation = targetAngle;

        const wheel = $("wheel");
        wheel.style.transform = `rotate(${targetAngle}deg)`;
        App.playSound("spin", 0.5);

        // Ждём окончания анимации (4 сек)
        await new Promise(r => setTimeout(r, 4200));

        // Начисляем награду
        await grantPrize(prize, skinId);

        spinning = false;
        $("spinBtn").disabled = false;
    }

    async function grantPrize(prize, skinId) {
        const state = App.getState();
        let titleText = "Пусто";
        let emoji = prize.emoji;
        let subText = "Повезёт в следующий раз";

        if (prize.type === "coins_small" || prize.type === "coins_med" || prize.type === "coins_big" || prize.type === "coins_tiny") {
            const coins = prize.coins;
            if (App.isOnline()) {
                state.coins += coins;
            } else {
                state.coins += coins;
            }
            App.playSound("buy"); // <--- ЗВУК КАССЫ ПРИ ВЫИГРЫШЕ
            titleText = "Монеты!";
            subText = `Ты выиграл ${coins} 💰`;
        } else if (prize.type === "food") {
            state.food[prize.food] = (state.food[prize.food] || 0) + 1;
            titleText = "Еда!";
            subText = `В холодильник добавлено: ${prize.label}`;
        } else if (prize.type === "skin") {
            if (!state.owned.includes(skinId)) state.owned.push(skinId);
            consumeSkin();
            const item = App.SHOP_ITEMS[skinId];
            titleText = "🎁 РЕДКИЙ СКИН!";
            subText = `Выпало: ${item ? item.name : skinId}`;
            emoji = "🎁";
        }

        App.save();

        $("crEmoji").textContent = emoji;
        $("crTitle").textContent = titleText;
        $("crReward").textContent = prize.type === "coins_small" || prize.type === "coins_med" || prize.type === "coins_big" || prize.type === "coins_tiny" ? `+${prize.coins} 💰` : (prize.type === "skin" ? "Новый скин!" : prize.label);
        $("crReward").classList.toggle("loss", prize.type === "empty");
        $("crSub").textContent = subText;
        $("casinoResult").classList.remove("hidden");
        $("casinoCoins").textContent = state.coins;

        if (prize.type === "skin") App.hapticNotify("success");
    }

    function openCasino() {
        App.hideAll();
        $("casino").classList.remove("hidden");
        $("casinoCoins").textContent = App.getState().coins;
    }

    function bind() {
        const casinoBtn = $("openCasino");
        if (casinoBtn) casinoBtn.addEventListener("click", openCasino);
        $("casinoBack").addEventListener("click", () => App.showGame());
        $("spinBtn").addEventListener("click", spin);

        $("crBack").addEventListener("click", () => {
            $("casinoResult").classList.add("hidden");
        });
        $("crSpin").addEventListener("click", () => {
            $("casinoResult").classList.add("hidden");
            spin();
        });
    }

    function initWheelVisuals() {
        const wheel = $("wheel");
        if (!wheel) return;
        // Удаляем старые слайсы, если есть
        wheel.querySelectorAll(".wheel-slice").forEach(el => el.remove());

        // 8 секторов по 45 градусов. Центр сектора = index * 45 + 22.5
        PRIZES.forEach((prize, i) => {
            const slice = document.createElement("div");
            slice.className = "wheel-slice";
            slice.style.transform = `rotate(${i * 45 + 22.5}deg)`;

            const span = document.createElement("span");
            span.textContent = prize.emoji;
            slice.appendChild(span);
            wheel.appendChild(slice);
        });
    }

    async function init() {
        App = await waitForApp();
        initWheelVisuals();
        bind();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();