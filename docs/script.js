(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
    }

    const STORAGE_KEY = "tamagotchi_demo_v4";

    const DECAY_PER_HOUR = {
        hunger: 5,
        happiness: 4,
        energy: 3,
        cleanliness: 3,
    };

    const ACTIONS = {
        feed: { hunger: +25, happiness: +3, cleanliness: -5, cost: 1 },
        wash: { cleanliness: +30, happiness: +2, energy: -3, cost: 0 },
    };

    const MG_DURATION = 10;
    const MG_GOAL = 30;
    const MG_REWARD = 5;
    const MG_LOSS_PENALTY = 5;
    const MG_ENERGY_COST = 10;

    const SLEEP_FAST_MS = 5 * 60 * 1000;
    const SLEEP_DEEP_MS = 10 * 60 * 1000;
    const SLEEP_FAST_GAIN = 0.5;
    const SLEEP_DEEP_GAIN = 1.0;

    const defaultState = () => ({
        petName: null,
        coins: 100,
        stats: { hunger: 100, happiness: 100, energy: 100, cleanliness: 100 },
        lastUpdate: Date.now(),
        gamesPlayed: 0,
        sleepUntil: null,
        sleepGain: 0,
    });

    let state = load() || defaultState();

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }
    function save() {
        state.lastUpdate = Date.now();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn("localStorage недоступен:", e);
        }
    }

    function applyDecay() {
        const now = Date.now();
        const elapsedMs = now - (state.lastUpdate || now);
        const hours = elapsedMs / (1000 * 60 * 60);
        if (hours <= 0) return;
        for (const [key, rate] of Object.entries(DECAY_PER_HOUR)) {
            const delta = Math.floor(rate * hours);
            if (delta > 0) {
                state.stats[key] = Math.max(0, state.stats[key] - delta);
            }
        }
    }

    function checkSleepOnLoad() {
        if (!state.sleepUntil) return;
        const now = Date.now();
        if (now >= state.sleepUntil) {
            const gain = state.sleepGain || 0;
            state.stats.energy = Math.max(0, Math.min(100, state.stats.energy + Math.round(gain * 100)));
            state.sleepUntil = null;
            state.sleepGain = 0;
            save();
        }
    }

    const $ = (id) => document.getElementById(id);
    const onboardingEl = $("onboarding");
    const gameEl = $("game");
    const introEl = $("minigameIntro");
    const minigameEl = $("minigame");
    const mgModalEl = $("mgResult");
    const sleepModalEl = $("sleepModal");
    const sleepBannerEl = $("sleepBanner");
    const sleepTimerEl = $("sleepTimer");
    const nameInput = $("nameInput");
    const nameConfirm = $("nameConfirm");
    const petNameEl = $("petName");
    const coinsEl = $("coins");
    const petSpriteEl = $("petSprite");
    const actionButtons = document.querySelectorAll(".action[data-action]");

    const bars = {
        hunger: $("bar-hunger"),
        happiness: $("bar-happiness"),
        energy: $("bar-energy"),
        cleanliness: $("bar-cleanliness"),
    };
    const nums = {
        hunger: $("num-hunger"),
        happiness: $("num-happiness"),
        energy: $("num-energy"),
        cleanliness: $("num-cleanliness"),
    };

    function isSleeping() {
        return state.sleepUntil && Date.now() < state.sleepUntil;
    }

    function render() {
        petNameEl.textContent = state.petName || "Питомец";
        coinsEl.textContent = state.coins;

        for (const key of Object.keys(bars)) {
            const value = Math.max(0, Math.min(100, Math.round(state.stats[key])));
            bars[key].style.width = value + "%";
            bars[key].classList.remove("warn", "crit");
            if (nums[key]) {
                nums[key].textContent = value;
                nums[key].classList.remove("warn", "crit");
            }
            if (value <= 20) {
                bars[key].classList.add("crit");
                if (nums[key]) nums[key].classList.add("crit");
            } else if (value <= 50) {
                bars[key].classList.add("warn");
                if (nums[key]) nums[key].classList.add("warn");
            }
        }

        const sleeping = isSleeping();
        if (sleeping) {
            sleepBannerEl.classList.remove("hidden");
            petSpriteEl.src = `public/sprites/sleeping.png`;
        } else {
            sleepBannerEl.classList.add("hidden");
            let sprite = "idle";
            if (state.stats.hunger <= 30) sprite = "hungry";
            else if (state.stats.cleanliness <= 30) sprite = "dirty";
            else if (state.stats.energy <= 30) sprite = "sleeping";
            else if (state.stats.happiness >= 80) sprite = "happy";
            petSpriteEl.src = `public/sprites/${sprite}.png`;
        }

        actionButtons.forEach((btn) => {
            btn.disabled = sleeping;
        });
    }

    function showOnboarding() {
        onboardingEl.classList.remove("hidden");
        gameEl.classList.add("hidden");
        introEl.classList.add("hidden");
        minigameEl.classList.add("hidden");
        sleepModalEl.classList.add("hidden");

        nameConfirm.disabled = true;
        nameInput.addEventListener("input", () => {
            nameConfirm.disabled = nameInput.value.trim().length === 0;
        });

        const confirm = () => {
            try {
                const name = nameInput.value.trim();
                if (!name) return;
                state.petName = name;
                save();
                showGame();
            } catch (e) {
                alert("Ошибка: " + e.message);
            }
        };

        nameConfirm.addEventListener("click", (e) => {
            e.preventDefault();
            confirm();
        });
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); confirm(); }
        });
    }

    function showGame() {
        onboardingEl.classList.add("hidden");
        gameEl.classList.remove("hidden");
        introEl.classList.add("hidden");
        minigameEl.classList.add("hidden");
        sleepModalEl.classList.add("hidden");
        render();
    }

    function applyAction(name) {
        const action = ACTIONS[name];
        if (!action) return;

        if (isSleeping()) return;

        if (action.cost > 0 && state.coins < action.cost) {
            alert(`Нужно ${action.cost} монет. Заработай в мини-игре!`);
            return;
        }

        for (const [key, delta] of Object.entries(action)) {
            if (key === "cost") continue;
            state.stats[key] = Math.max(0, Math.min(100, state.stats[key] + delta));
        }
        state.coins = Math.max(0, state.coins - action.cost);
        save();
        render();
        if (tg) tg.HapticFeedback?.impactOccurred("light");
    }

    actionButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            if (action === "play") {
                openMinigameIntro();
            } else if (action === "sleep") {
                openSleepModal();
            } else {
                applyAction(action);
            }
        });
    });

    // ---------- Превью мини-игры ----------

    function openMinigameIntro() {
        if (isSleeping()) return;

        const energyNow = Math.round(state.stats.energy);
        $("introEnergy").textContent = energyNow;

        const startBtn = $("introStart");
        if (energyNow < MG_ENERGY_COST) {
            startBtn.disabled = true;
            startBtn.textContent = `Нужно ${MG_ENERGY_COST} ⚡`;
        } else {
            startBtn.disabled = false;
            startBtn.textContent = `Начать (−${MG_ENERGY_COST} ⚡)`;
        }

        gameEl.classList.add("hidden");
        minigameEl.classList.add("hidden");
        mgModalEl.classList.add("hidden");
        introEl.classList.remove("hidden");
    }

    $("introStart").addEventListener("click", () => {
        if (state.stats.energy < MG_ENERGY_COST) return;
        state.stats.energy = Math.max(0, state.stats.energy - MG_ENERGY_COST);
        save();
        startMinigame();
    });

    $("introCancel").addEventListener("click", () => {
        showGame();
    });

    // ---------- Мини-игра ----------

    let mgEndAt = 0;
    let mgScore = 0;
    let mgActive = false;
    let mgTickerId = null;
    let mgTimeoutId = null;

    const mgTimerEl = $("mgTimer");
    const mgEnergyEl = $("mgEnergy");
    const mgScoreEl = $("mgScore");
    const mgClickBtn = $("mgClickBtn");
    const mgModalTitle = $("mgResultTitle");
    const mgModalReward = $("mgResultReward");
    const mgModalSub = $("mgResultSub");
    const mgModalBack = $("mgResultBack");
    const mgModalRepeat = $("mgResultRepeat");

    function startMinigame() {
        gameEl.classList.add("hidden");
        introEl.classList.add("hidden");
        mgModalEl.classList.add("hidden");
        minigameEl.classList.remove("hidden");

        mgScore = 0;
        mgActive = true;
        mgEndAt = Date.now() + MG_DURATION * 1000;

        mgScoreEl.textContent = "0";
        mgTimerEl.textContent = MG_DURATION;
        mgEnergyEl.textContent = Math.round(state.stats.energy);

        if (mgTickerId) clearInterval(mgTickerId);
        mgTickerId = setInterval(() => {
            if (!mgActive) return;
            const leftMs = mgEndAt - Date.now();
            if (leftMs <= 0) {
                mgTimerEl.textContent = "0";
                endMinigame();
                return;
            }
            mgTimerEl.textContent = Math.ceil(leftMs / 1000);
        }, 100);

        // Жёсткая гарантия окончания, даже если setInterval заморожен
        if (mgTimeoutId) clearTimeout(mgTimeoutId);
        mgTimeoutId = setTimeout(() => {
            if (mgActive) endMinigame();
        }, MG_DURATION * 1000 + 50);
    }

    function endMinigame() {
        if (!mgActive) return;
        mgActive = false;
        if (mgTickerId) { clearInterval(mgTickerId); mgTickerId = null; }
        if (mgTimeoutId) { clearTimeout(mgTimeoutId); mgTimeoutId = null; }

        const win = mgScore >= MG_GOAL;

        if (win) {
            state.coins += MG_REWARD;
            mgModalTitle.textContent = "Ты выиграл:";
            mgModalReward.textContent = `+${MG_REWARD} 💰`;
            mgModalReward.classList.remove("loss");
            mgModalSub.textContent = `Накликал ${mgScore} раз`;
        } else {
            state.stats.happiness = Math.max(0, state.stats.happiness - MG_LOSS_PENALTY);
            mgModalTitle.textContent = "Ты проиграл:";
            mgModalReward.textContent = `−${MG_LOSS_PENALTY} 😢`;
            mgModalReward.classList.add("loss");
            mgModalSub.textContent = `Накликал ${mgScore} из ${MG_GOAL}`;
        }

        state.gamesPlayed = (state.gamesPlayed || 0) + 1;
        save();

        mgModalRepeat.disabled = state.stats.energy < MG_ENERGY_COST;
        mgModalEl.classList.remove("hidden");
    }

    mgClickBtn.addEventListener("click", () => {
        if (!mgActive) return;
        mgScore += 1;
        mgScoreEl.textContent = mgScore;
        if (tg) tg.HapticFeedback?.impactOccurred("light");
    });

    mgModalBack.addEventListener("click", () => showGame());

    mgModalRepeat.addEventListener("click", () => {
        if (state.stats.energy < MG_ENERGY_COST) return;
        state.stats.energy = Math.max(0, state.stats.energy - MG_ENERGY_COST);
        save();
        startMinigame();
    });

    // ---------- Сон ----------

    function openSleepModal() {
        if (isSleeping()) return;
        sleepModalEl.classList.remove("hidden");
    }

    function startSleep(durationMs, gainRatio) {
        state.sleepUntil = Date.now() + durationMs;
        state.sleepGain = gainRatio;
        save();
        sleepModalEl.classList.add("hidden");
        render();
        startSleepTicker();
    }

    let sleepTickerId = null;
    function startSleepTicker() {
        if (sleepTickerId) clearInterval(sleepTickerId);
        sleepTickerId = setInterval(() => {
            if (!isSleeping()) {
                clearInterval(sleepTickerId);
                sleepTickerId = null;
                const gain = state.sleepGain || 0;
                state.stats.energy = Math.max(0, Math.min(100, state.stats.energy + Math.round(gain * 100)));
                state.sleepUntil = null;
                state.sleepGain = 0;
                save();
                render();
                if (tg) tg.HapticFeedback?.notificationOccurred("success");
                alert("Питомец проснулся! Энергия восстановлена.");
                return;
            }
            updateSleepTimer();
        }, 500);
        updateSleepTimer();
    }

    function updateSleepTimer() {
        if (!state.sleepUntil) return;
        const left = Math.max(0, state.sleepUntil - Date.now());
        const totalSec = Math.ceil(left / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        sleepTimerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    $("sleepFast").addEventListener("click", () => startSleep(SLEEP_FAST_MS, SLEEP_FAST_GAIN));
    $("sleepDeep").addEventListener("click", () => startSleep(SLEEP_DEEP_MS, SLEEP_DEEP_GAIN));
    $("sleepCancel").addEventListener("click", () => sleepModalEl.classList.add("hidden"));

    // ---------- Старт ----------

    applyDecay();
    checkSleepOnLoad();
    if (!state.petName) showOnboarding();
    else showGame();
    if (isSleeping()) startSleepTicker();
    save();
})();