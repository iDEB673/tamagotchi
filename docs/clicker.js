(() => {
    // ---------- Ожидание ядра ----------

    function waitForApp() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.App) resolve(window.App);
                else setTimeout(check, 50);
            };
            check();
        });
    }

    // ---------- Константы ----------

    const DURATION = 10;
    const GOAL = 30;
    const REWARD = 5;
    const LOSS_PENALTY = 5;
    const ENERGY_COST = 10;

    // ---------- Состояние ----------

    let App = null;
    let endAt = 0;
    let score = 0;
    let active = false;
    let tickerId = null;
    let timeoutId = null;

    const $ = (id) => document.getElementById(id);

    // ---------- Превью ----------

    function openIntro() {
        const state = App.getState();
        if (state.sleepUntil && Date.now() < state.sleepUntil) return;

        const e = Math.round(state.stats.energy);
        $("introEnergy").textContent = e;
        const b = $("introStart");
        if (e < ENERGY_COST) { b.disabled = true; b.textContent = `Нужно ${ENERGY_COST} ⚡`; }
        else { b.disabled = false; b.textContent = `Начать (−${ENERGY_COST} ⚡)`; }

        App.hideAll();
        $("minigameIntro").classList.remove("hidden");
    }

    // ---------- Игра ----------

    function start() {
        App.hideAll();
        $("minigame").classList.remove("hidden");

        score = 0;
        active = true;
        endAt = Date.now() + DURATION * 1000;

        $("mgScore").textContent = "0";
        $("mgTimer").textContent = DURATION;
        $("mgEnergy").textContent = Math.round(App.getState().stats.energy);

        if (tickerId) clearInterval(tickerId);
        tickerId = setInterval(() => {
            if (!active) return;
            const leftMs = endAt - Date.now();
            if (leftMs <= 0) { $("mgTimer").textContent = "0"; end(); return; }
            $("mgTimer").textContent = Math.ceil(leftMs / 1000);
        }, 100);

        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => { if (active) end(); }, DURATION * 1000 + 50);
    }

    async function end() {
        if (!active) return;
        active = false;
        if (tickerId) { clearInterval(tickerId); tickerId = null; }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

        const state = App.getState();
        const win = score >= GOAL;
        let reward = win ? REWARD : 0;

        if (App.isOnline()) {
            try {
                const res = await App.apiFetch("/api/game/reward", {
                    method: "POST",
                    body: JSON.stringify({ game: "clicker", score }),
                });
                state.coins = res.coins;
                reward = res.reward;
            } catch (e) {
                if (e.message === "OFFLINE") state.coins += reward;
            }
            try {
                await App.apiFetch("/api/clicker/score", {
                    method: "POST",
                    body: JSON.stringify({ score, pet_name: state.petName || "Питомец" }),
                });
            } catch (e) { console.warn("clicker score save:", e); }
        } else {
            state.coins += reward;
        }

        const titleEl = $("mgResultTitle");
        const rewardEl = $("mgResultReward");
        const subEl = $("mgResultSub");

        if (win) {
            titleEl.textContent = "Ты выиграл:";
            rewardEl.textContent = `+${reward} 💰`;
            rewardEl.classList.remove("loss");
            subEl.textContent = `Накликал ${score} раз`;
        } else {
            state.stats.happiness = Math.max(0, state.stats.happiness - LOSS_PENALTY);
            titleEl.textContent = "Ты проиграл:";
            rewardEl.textContent = `−${LOSS_PENALTY} 😢`;
            rewardEl.classList.add("loss");
            subEl.textContent = `Накликал ${score} из ${GOAL}`;
        }

        state.gamesPlayed += 1;
        App.save();

        $("mgResultRepeat").disabled = state.stats.energy < ENERGY_COST;
        $("mgResult").classList.remove("hidden");
    }

    // ---------- UI-привязки ----------

    function bind() {
        $("introStart").addEventListener("click", () => {
            const state = App.getState();
            if (state.stats.energy < ENERGY_COST) return;
            state.stats.energy -= ENERGY_COST;
            App.save();
            start();
        });

        $("introCancel").addEventListener("click", () => App.showGame());

        $("mgClickBtn").addEventListener("click", () => {
            if (!active) return;
            score += 1;
            $("mgScore").textContent = score;
            App.playSound("click", 0.2);
            App.hapticImpact("light");
        });

        $("mgResultBack").addEventListener("click", () => App.showGame());

        $("mgResultRepeat").addEventListener("click", () => {
            const state = App.getState();
            if (state.stats.energy < ENERGY_COST) return;
            state.stats.energy -= ENERGY_COST;
            App.save();
            $("mgResult").classList.add("hidden");
            start();
        });

        $("chooseClicker").addEventListener("click", openIntro);
    }

    // ---------- Cleanup (на hideAll) ----------

    function cleanup() {
        if (tickerId) { clearInterval(tickerId); tickerId = null; }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        active = false;
    }

    // ---------- Init ----------

    async function init() {
        App = await waitForApp();
        bind();
        App.registerCleanup(cleanup);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();