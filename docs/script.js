(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
    }

    const STORAGE_KEY = "tamagotchi_demo_v1";

    const defaultState = () => ({
        petName: null,
        coins: 100,
        stats: { hunger: 100, happiness: 100, energy: 100, cleanliness: 100 },
    });

    let state = load() || defaultState();

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }
    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    const onboardingEl = document.getElementById("onboarding");
    const gameEl = document.getElementById("game");
    const nameInput = document.getElementById("nameInput");
    const nameConfirm = document.getElementById("nameConfirm");
    const petNameEl = document.getElementById("petName");
    const coinsEl = document.getElementById("coins");
    const petSpriteEl = document.getElementById("petSprite");
    const actionButtons = document.querySelectorAll(".action");

    const bars = {
        hunger: document.getElementById("bar-hunger"),
        happiness: document.getElementById("bar-happiness"),
        energy: document.getElementById("bar-energy"),
        cleanliness: document.getElementById("bar-cleanliness"),
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
        render();
    }

    const ACTIONS = {
        feed: { hunger: +25, happiness: +3, cleanliness: -5 },
        play: { happiness: +20, energy: -10, hunger: -5 },
        sleep: { energy: +30, hunger: -5 },
        wash: { cleanliness: +30, happiness: +2, energy: -3 },
    };

    function applyAction(name) {
        const deltas = ACTIONS[name];
        if (!deltas) return;
        for (const [key, delta] of Object.entries(deltas)) {
            state.stats[key] = Math.max(0, Math.min(100, state.stats[key] + delta));
        }
        state.coins = Math.max(0, state.coins - 1);
        save();
        render();
        if (tg) tg.HapticFeedback?.impactOccurred("light");
    }

    actionButtons.forEach((btn) => {
        btn.addEventListener("click", () => applyAction(btn.dataset.action));
    });

    if (!state.petName) showOnboarding();
    else showGame();
})();