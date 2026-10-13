(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
    }

    const STORAGE_KEY = "tamagotchi_demo_v2";

    const DECAY_PER_HOUR = {
        hunger: 5,
        happiness: 4,
        energy: 3,
        cleanliness: 3,
    };

    const ACTIONS = {
        feed: { hunger: +25, happiness: +3, cleanliness: -5, cost: 1 },
        play: { happiness: +20, energy: -10, hunger: -5, cost: 1 },
        sleep: { energy: +30, hunger: -5, cost: 0 },
        wash: { cleanliness: +30, happiness: +2, energy: -3, cost: 0 },
    };

    const defaultState = () => ({
        petName: null,
        coins: 100,
        stats: { hunger: 100, happiness: 100, energy: 100, cleanliness: 100 },
        lastUpdate: Date.now(),
        gamesPlayed: 0,
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

    const $ = (id) => document.getElementById(id);
    const onboardingEl = $("onboarding");
    const gameEl = $("game");
    const minigameEl = $("minigame");
    const mgResultEl = $("mgResult");
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

    function render() {
        petNameEl.textContent = state.petName || "Питомец";
        coinsEl.textContent = state.coins;
        for (const key of Object.keys(bars)) {
            const value = Math.max(0, Math.min(100, state.stats[key]));
            bars[key].style.width = value + "%";
            bars[key].classList.remove("warn", "crit");
            if (value <= 20) bars[key].classList.add("crit");
            else if (value <= 50) bars[key].classList.add("warn");
        }
        let sprite = "idle";
        if (state.stats.hunger <= 30) sprite = "hungry";
        else if (state.stats.cleanliness <= 30) sprite = "dirty";
        else if (state.stats.energy <= 30) sprite = "sleeping";
        else if (state.stats.happiness >= 80) sprite = "happy";
        petSpriteEl.src = `public/sprites/${sprite}.png`;
    }

    function showOnboarding() {
        onboardingEl.classList.remove("hidden");
        gameEl.classList.add("hidden");
        minigameEl.classList.add("hidden");
        mgResultEl.classList.add("hidden");
        nameInput.focus();
        nameConfirm.disabled = true;
        nameInput.addEventListener("input", () => {
            nameConfirm.disabled = nameInput.value.trim().length === 0;
        });
        const confirm = () => {
            const name = nameInput.value.trim();
            if (!name) return;
            state.petName = name;
            save();
            showGame();
        };
        nameConfirm.addEventListener("click", confirm);
        nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirm(); });
    }

    function showGame() {
        onboardingEl.classList.add("hidden");
        gameEl.classList.remove("hidden");
        minigameEl.classList.add("hidden");
        mgResultEl.classList.add("hidden");
        render();
    }

    function applyAction(name) {
        const action = ACTIONS[name];
        if (!action) return;

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
                startMinigame();
            } else {
                applyAction(action);
            }
        });
    });

    // ---------- Мини-игра: кликер ----------

    const MG_DURATION = 10;
    const MG_GOAL = 30;
    const MG_REWARD = 5;
    const MG_LOSS_PENALTY = 5;

    let mgTimerId = null;
    let mgTimeLeft = 0;
    let mgScore = 0;
    let mgActive = false;

    const mgTimerEl = $("mgTimer");
    const mgScoreEl = $("mgScore");
    const mgClickBtn = $("mgClickBtn");
    const mgCancel = $("mgCancel");

    function startMinigame() {
        gameEl.classList.add("hidden");
        mgResultEl.classList.add("hidden");
        minigameEl.classList.remove("hidden");

        mgScore = 0;
        mgTimeLeft = MG_DURATION;
        mgActive = true;

        mgScoreEl.textContent = "0";
        mgTimerEl.textContent = MG_DURATION;

        mgTimerId = setInterval(() => {
            mgTimeLeft -= 1;
            mgTimerEl.textContent = mgTimeLeft;
            if (mgTimeLeft <= 0) endMinigame();
        }, 1000);
    }

    function endMinigame() {
        if (!mgActive) return;
        mgActive = false;
        clearInterval(mgTimerId);
        mgTimerId = null;

        const win = mgScore >= MG_GOAL;
        const reward = win ? MG_REWARD : 0;
        state.coins += reward;

        if (!win) {
            state.stats.happiness = Math.max(0, state.stats.happiness - MG_LOSS_PENALTY);
        }

        state.gamesPlayed = (state.gamesPlayed || 0) + 1;
        save();

        $("mgResultEmoji").textContent = win ? "🎉" : "😔";
        $("mgResultTitle").textContent = win ? "Победа!" : "Не вышло";
        $("mgResultText").textContent = win
            ? `Ты накликал ${mgScore} раз. Награда: +${reward} монет`
            : `Ты накликал ${mgScore} из ${MG_GOAL}. Радость −${MG_LOSS_PENALTY}`;
    }

    mgClickBtn.addEventListener("click", () => {
        if (!mgActive) return;
        mgScore += 1;
        mgScoreEl.textContent = mgScore;
        if (tg) tg.HapticFeedback?.impactOccurred("light");
    });

    mgCancel.addEventListener("click", () => {
        if (mgTimerId) clearInterval(mgTimerId);
        mgActive = false;
        showGame();
    });

    $("mgResultOk").addEventListener("click", () => {
        showGame();
    });

    // ---------- Старт ----------

    applyDecay();
    if (!state.petName) showOnboarding();
    else showGame();
    save();
})();