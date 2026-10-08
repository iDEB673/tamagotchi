(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
    }

    const state = {
        pet: null,
        coins: 0,
        user: null,
    };

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

    async function api(path, options = {}) {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        };
        if (tg?.initData) {
            headers["Authorization"] = "tma " + tg.initData;
        }
        const res = await fetch(path, { ...options, headers });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`${res.status} ${text}`);
        }
        return res.json();
    }

    async function loadMe() {
        state.user = await api("/api/me");
        state.coins = state.user.coins;
    }

    async function loadPet() {
        state.pet = await api("/api/pet");
    }

    async function setName(name) {
        state.pet = await api("/api/pet/name", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
    }

    async function doAction(action) {
        const res = await api("/api/action", {
            method: "POST",
            body: JSON.stringify({ action }),
        });
        state.pet = res.pet;
        state.coins = res.coins;
        render();
        if (tg) tg.HapticFeedback?.impactOccurred("light");
    }

    function render() {
        if (!state.pet) return;

        petNameEl.textContent = state.pet.name || "Питомец";
        coinsEl.textContent = state.coins;

        for (const key of Object.keys(bars)) {
            const value = Math.max(0, Math.min(100, state.pet[key]));
            bars[key].style.width = value + "%";
            bars[key].classList.remove("warn", "crit");
            if (value <= 20) bars[key].classList.add("crit");
            else if (value <= 50) bars[key].classList.add("warn");
        }

        let sprite = "idle";
        if (state.pet.hunger <= 30) sprite = "hungry";
        else if (state.pet.cleanliness <= 30) sprite = "dirty";
        else if (state.pet.energy <= 30) sprite = "sleeping";
        else if (state.pet.happiness >= 80) sprite = "happy";

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

        const confirm = async () => {
            const name = nameInput.value.trim();
            if (!name) return;
            try {
                await setName(name);
                showGame();
            } catch (e) {
                alert("Ошибка: " + e.message);
            }
        };

        nameConfirm.addEventListener("click", confirm);
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") confirm();
        });
    }

    function showGame() {
        onboardingEl.classList.add("hidden");
        gameEl.classList.remove("hidden");
        render();
    }

    actionButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            doAction(btn.dataset.action).catch((e) => alert(e.message));
        });
    });

    function fatal(msg) {
        const info = tg
            ? `platform: ${tg.platform || "?"}, version: ${tg.version || "?"}, initData длина: ${(tg.initData || "").length}`
            : "tg не определён";
        document.body.innerHTML =
            '<div style="padding:24px;color:#fff;font-family:sans-serif;font-size:14px;">' +
            '<h2>⚠️ ' + msg + '</h2>' +
            '<p style="color:#7d8b99;">' + info + '</p>' +
            '<p style="color:#7d8b99;margin-top:8px;">Открой Mini App из бота в Telegram.</p>' +
            "</div>";
    }

    async function init() {
        if (!tg?.initData) {
            fatal("Нет данных Telegram");
            return;
        }
        try {
            await loadMe();
            await loadPet();
            if (!state.pet || state.pet.name === "Питомец") {
                showOnboarding();
            } else {
                showGame();
            }
        } catch (e) {
            fatal("Ошибка: " + e.message);
        }
    }

    init();
})();