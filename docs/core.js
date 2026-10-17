(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }

    const ADMIN_ID = 5410929450;

    const CURRENT_VERSION = "v0.9.0";
    const CHANGELOG = [
        {
            version: "v0.9.0",
            date: "17.10.2026",
            changes: [
                "🎰 Добавлено казино (Колесо фортуны) с шансом выбить редкий скин",
                "🌙 Ночной сон (до 8 часов, восстановление энергии +30/час)",
                "⏱ Таймер в Судоку",
                "🏆 Таблица лидеров для Судоку (по скорости решения)",
                "Исправление багов"
            ]
        },
        {
            version: "v0.8.0",
            date: "16.10.2026",
            changes: [
                "🔢 Добавлено Судоку (3 уровня сложности, режимы ввода, заметки)",
                "📝 Улучшен ввод в Судоку (авто-удаление ошибочных цифр)",
                "🎩 Добавлены скины и инвентарь",
                "Исправление багов"
            ]
        },
        {
            version: "v0.7.0",
            date: "15.10.2026",
            changes: [
                "🏆 Таблица лидеров для Block Blast и Кликера",
                "♾ Бесконечный режим в Block Blast",
                "🎯 3 уровня сложности в Block Blast",
                "Исправление багов"
            ]
        }
    ];

    function getMyUserId() {
        const unsafeId = tg?.initDataUnsafe?.user?.id;
        if (unsafeId) return parseInt(unsafeId, 10);
        const initData = tg?.initData;
        if (!initData) return null;
        try {
            const params = new URLSearchParams(initData);
            const u = params.get("user");
            if (!u) return null;
            const obj = JSON.parse(u);
            return obj.id ? parseInt(obj.id, 10) : null;
        } catch (e) { return null; }
    }
    function isAdmin() { return getMyUserId() === ADMIN_ID; }
    function isOnline() { return !!(tg?.initData && tg.initData.length > 0); }

    async function apiFetch(path, options = {}) {
        const initData = tg?.initData;
        if (!initData) throw new Error("OFFLINE");
        const headers = {
            "Content-Type": "application/json",
            "Authorization": "tma " + initData,
            ...(options.headers || {}),
        };
        const res = await fetch("https://tamagotchi.layero.app" + path, { ...options, headers });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json();
    }

    const STORAGE_KEY = "tamagotchi_demo_v5";
    const DECAY_PER_HOUR = { hunger: 5, happiness: 4, energy: 3, cleanliness: 3 };
    const ACTIONS = {
        feed: { hunger: +25, happiness: +3, cleanliness: -5, cost: 1 },
        wash: { cleanliness: +30, happiness: +2, energy: -3, cost: 0 },
    };
    const SLEEP_FAST_MS = 5 * 60 * 1000, SLEEP_DEEP_MS = 10 * 60 * 1000;
    const SLEEP_FAST_GAIN = 0.5, SLEEP_DEEP_GAIN = 1.0;
    const SLEEP_DECAY_PER_MIN = { hunger: 2.0, happiness: 1.5, cleanliness: 1.5 };

    const FOOD_ITEMS = {
        cola:     { name: "Кола",    emoji: "🥤", price: 3,  hunger: 7  },
        tea:      { name: "Чай",     emoji: "🍵", price: 4,  hunger: 5  },
        kitkat:   { name: "Кит-Кат", emoji: "🍫", price: 5,  hunger: 10 },
        donut:    { name: "Пончик",  emoji: "🍩", price: 6,  hunger: 12 },
        pizza:    { name: "Пицца",   emoji: "🍕", price: 7,  hunger: 14 },
        shawarma: { name: "Шаурма",  emoji: "🌯", price: 15, hunger: 35 },
    };

    const SHOP_ITEMS = {
        cap:        { name: "Кепка",            emoji: "🧢", price: 50 },
        bow:        { name: "Бантик",           emoji: "🎀", price: 40 },
        sunglasses: { name: "Очки",             emoji: "🕶️", price: 80 },
        crown:      { name: "Корона",           emoji: "👑", price: 200 },
        mask:       { name: "Маска анонимуса",  emoji: "🎭", price: 150 },
        wizard_hat: { name: "Шапка волшебника", emoji: "🧙", price: 0, hidden: true },
        wheel_face: { name: "Колесо на лице",   emoji: "🎡", price: 0, hidden: true },
        tea_mug:    { name: "Кружка чая",     emoji: "🍵", price: 0, hidden: true },
    };


    const defaultState = () => ({
        petName: null, coins: 100,
        stats: { hunger: 100, happiness: 100, energy: 100, cleanliness: 100 },
        lastUpdate: Date.now(), gamesPlayed: 0,
        sleepUntil: null, sleepGain: 0, sleepStartedAt: null,
        nightSleepStart: null,
        nightSleepWake: null,
        nightSleepEnergyBefore: 0,
        owned: [], equipped: null, food: {},
        casinoPool: null,
        teaCount: 0,
        achievements: [],

    });

    let state = load() || defaultState();

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            // Миграция старых сейвов
            if (!data.food) data.food = {};
            if (!data.owned) data.owned = [];
            if (!data.achievements) data.achievements = [];
            if (data.teaCount === undefined) data.teaCount = 0;
            if (!data.casinoPool) data.casinoPool = null;
            return data;
        } catch { return null; }
    }
    function save() {
        state.lastUpdate = Date.now();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
        catch (e) { console.warn(e); }
    }

    function applyDecay() {
        const hours = (Date.now() - (state.lastUpdate || Date.now())) / 3600000;
        if (hours <= 0) return;
        for (const [key, rate] of Object.entries(DECAY_PER_HOUR)) {
            const delta = Math.floor(rate * hours);
            if (delta > 0) state.stats[key] = Math.max(0, state.stats[key] - delta);
        }
    }
    function applySleepDecay() {
        if (!state.sleepStartedAt) return 0;
        const mins = (Date.now() - state.sleepStartedAt) / 60000;
        if (mins <= 0) { state.sleepStartedAt = null; return 0; }
        for (const [key, rate] of Object.entries(SLEEP_DECAY_PER_MIN)) {
            state.stats[key] = Math.max(0, state.stats[key] - rate * mins);
        }
        state.sleepStartedAt = null;
        return mins;
    }
    function checkSleepOnLoad() {
        // Обычный сон
        if (state.sleepUntil && Date.now() >= state.sleepUntil) {
            const gain = state.sleepGain || 0;
            state.stats.energy = Math.max(0, Math.min(100, state.stats.energy + Math.round(gain * 100)));
            applySleepDecay();
            state.sleepUntil = null; state.sleepGain = 0;
            save();
        }
        // Ночной сон — если wake-время наступило, питомец проснулся сам
        if (state.nightSleepStart && state.nightSleepWake) {
            const now = Date.now();
            if (now >= state.nightSleepWake) {
                const hours = (state.nightSleepWake - state.nightSleepStart) / 3600000;
                finishNightSleep(hours);
            }
        }
    }

    function finishNightSleep(hours) {
        const before = state.nightSleepEnergyBefore || 0;
        const restored = Math.min(100, Math.round(before + hours * 30));
        state.stats.energy = restored;
        // Медленный расход за время сна
        state.stats.hunger = Math.max(0, state.stats.hunger - hours * 0.5);
        state.stats.cleanliness = Math.max(0, state.stats.cleanliness - hours * 0.5);
        state.stats.happiness = Math.max(0, state.stats.happiness - hours * 0.5);
        state.nightSleepStart = null;
        state.nightSleepWake = null;
        state.nightSleepEnergyBefore = 0;
        save();
    }

    const $ = (id) => document.getElementById(id);

    function hideAll() {
        cleanupFns.forEach(fn => { try { fn(); } catch (e) {} });
        document.querySelectorAll(".screen, .mg-modal").forEach(el => {
            el.classList.add("hidden");
        });
    }

    const cleanupFns = [];
    function registerCleanup(fn) { cleanupFns.push(fn); }

    // ---------- Рефы ядра ----------

    const onboardingEl = $("onboarding");
    const gameEl = $("game");
    const shopEl = $("shop");
    const chooserEl = $("gameChooser");
    const feedModalEl = $("feedModal");
    const sleepModalEl = $("sleepModal");
    const adminPanelEl = $("adminPanel");
    const sleepBannerEl = $("sleepBanner");
    const sleepTimerEl = $("sleepTimer");
    const nameInput = $("nameInput");
    const nameConfirm = $("nameConfirm");
    const petNameEl = $("petName");
    const coinsEl = $("coins");
    const shopCoinsEl = $("shopCoins");
    const adminCoinsEl = $("adminCoins");
    const adminBtn = $("adminBtn");
    const adminListEl = $("adminList");
    const petSpriteEl = $("petSprite");
    const petHatEl = $("petHat");
    const actionButtons = document.querySelectorAll(".action[data-action]");

    const bars = {
        hunger: $("bar-hunger"), happiness: $("bar-happiness"),
        energy: $("bar-energy"), cleanliness: $("bar-cleanliness"),
    };
    const nums = {
        hunger: $("num-hunger"), happiness: $("num-happiness"),
        energy: $("num-energy"), cleanliness: $("num-cleanliness"),
    };

    function isSleeping() {
        if (state.nightSleepStart && state.nightSleepWake) {
            return Date.now() < state.nightSleepWake;
        }
        return state.sleepUntil && Date.now() < state.sleepUntil;
    }
    function isNightSleep() {
        return !!(state.nightSleepStart && state.nightSleepWake && Date.now() < state.nightSleepWake);
    }
    function canStartNightSleep() {
        const h = new Date().getHours();
        return h >= 22 || h < 1;
    }

    function tryWakeUp() {
        if (!state.nightSleepStart) return;
        const now = Date.now();
        const hours = (now - state.nightSleepStart) / 3600000;
        if (hours < 1) {
            const left = Math.ceil(60 - hours * 60);
            alert(`Пусть поспит ещё ${left} мин — минимум 1 час сна`);
            return;
        }
        if (!confirm("Разбудить? Энергия восстановится частично.")) return;
        finishNightSleep(hours);
        render();
        if (tg) tg.HapticFeedback?.notificationOccurred("success");
    }

    function checkAchievements() {
        if (state.teaCount >= 10 && !state.achievements.includes("tea_lover")) {
            state.achievements.push("tea_lover");
            save();
        }
    }

    function render() {
        const hour = new Date().getHours();
        const night = hour >= 22 || hour < 8;
        document.body.classList.toggle("night-mode", night || isNightSleep());

        petNameEl.textContent = state.petName || "Питомец";
        coinsEl.textContent = state.coins;
        if (shopCoinsEl) shopCoinsEl.textContent = state.coins;
        if (adminCoinsEl) adminCoinsEl.textContent = state.coins;

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
            const banner = sleepBannerEl.querySelector(".sleep-banner__text");
            if (banner) {
                if (isNightSleep()) {
                    const wakeAt = new Date(state.nightSleepWake);
                    const hh = String(wakeAt.getHours()).padStart(2, "0");
                    const mm = String(wakeAt.getMinutes()).padStart(2, "0");
                    banner.innerHTML = `🌙 Ночной сон · до ${hh}:${mm} · <span id="wakeBtn" style="color:#5288c1;text-decoration:underline;cursor:pointer;">Разбудить</span>`;
                    const wakeBtn = $("wakeBtn");
                    if (wakeBtn) wakeBtn.addEventListener("click", tryWakeUp);
                } else {
                    banner.textContent = "😴 Спит · " + sleepTimerEl.textContent;
                }
            }
        } else {
            sleepBannerEl.classList.add("hidden");
            let sprite = "idle";
            if (state.stats.hunger <= 30) sprite = "hungry";
            else if (state.stats.cleanliness <= 30) sprite = "dirty";
            else if (state.stats.energy <= 30) sprite = "sleeping";
            else if (state.stats.happiness >= 80) sprite = "happy";
            petSpriteEl.src = `public/sprites/${sprite}.png`;
        }

        if (state.equipped && SHOP_ITEMS[state.equipped]) {
            petHatEl.src = `public/items/${state.equipped}.png`;
            petHatEl.dataset.item = state.equipped;
            petHatEl.classList.remove("hidden");
        } else {
            petHatEl.classList.add("hidden");
            petHatEl.dataset.item = "";
        }

        if (adminBtn) adminBtn.classList.toggle("hidden", !isAdmin());
        actionButtons.forEach((btn) => { btn.disabled = sleeping; });
    }

    function showOnboarding() {
        hideAll();
        onboardingEl.classList.remove("hidden");
        nameConfirm.disabled = true;
        nameInput.addEventListener("input", () => {
            nameConfirm.disabled = nameInput.value.trim().length === 0;
        });
        const confirm = async () => {
            const name = nameInput.value.trim();
            if (!name) return;
            if (isOnline()) {
                try {
                    await apiFetch("/api/pet/name", { method: "POST", body: JSON.stringify({ name }) });
                } catch (e) {
                    if (e.message.includes("409")) alert("Это имя уже занято другим питомцем. Придумай другое.");
                    else alert("Не удалось сохранить имя. " + e.message);
                    return;
                }
            }
            state.petName = name;
            save();
            showGame();
        };
        nameConfirm.addEventListener("click", (e) => { e.preventDefault(); confirm(); });
        nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } });
    }

    function showGame() { hideAll(); gameEl.classList.remove("hidden"); render(); }
    function openGameChooser() {
        if (isSleeping()) return;
        hideAll();
        chooserEl.classList.remove("hidden");
    }

    async function applyAction(name) {
        const action = ACTIONS[name];
        if (!action || isSleeping()) return;
        if (action.cost > 0) {
            if (state.coins < action.cost) { alert(`Нужно ${action.cost} монет.`); return; }
            if (isOnline()) {
                try {
                    const res = await apiFetch("/api/coins/spend", { method: "POST", body: JSON.stringify({ amount: action.cost }) });
                    state.coins = res.coins;
                } catch (e) {
                    if (e.message === "OFFLINE") state.coins -= action.cost;
                    else { alert("Ошибка: " + e.message); return; }
                }
            } else state.coins -= action.cost;
        }
        for (const [key, delta] of Object.entries(action)) {
            if (key === "cost") continue;
            state.stats[key] = Math.max(0, Math.min(100, state.stats[key] + delta));
        }
        save(); render();
        if (tg) tg.HapticFeedback?.impactOccurred("light");
    }

    actionButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            if (action === "play") openGameChooser();
            else if (action === "sleep") openSleepModal();
            else if (action === "feed") openFeedModal();
            else applyAction(action);
        });
    });

        // Выход из меню выбора игр
    $("chooseCancel").addEventListener("click", () => showGame());

    // ---------- Магазин ----------

    let shopTab = "clothes";

    const openShopBtn = $("openShop");
    if (openShopBtn) {
        openShopBtn.addEventListener("click", () => {
            if (isSleeping()) return;
            hideAll();
            shopEl.classList.remove("hidden");
            shopTab = "clothes";
            updateShopTabs();
            renderShop();
        });
    }
    $("shopClose").addEventListener("click", () => showGame());
    document.querySelectorAll(".shop__tab[data-tab]").forEach(tab => {
        tab.addEventListener("click", () => { shopTab = tab.dataset.tab; updateShopTabs(); renderShop(); });
    });
    function updateShopTabs() {
        document.querySelectorAll(".shop__tab[data-tab]").forEach(t => {
            t.classList.toggle("shop__tab--active", t.dataset.tab === shopTab);
        });
    }
    function renderShop() {
        const list = $("shopList");
        list.innerHTML = "";
        shopCoinsEl.textContent = state.coins;
        if (shopTab === "clothes") renderClothesTab(list);
        else if (shopTab === "food") renderFoodTab(list);
    }
    function renderClothesTab(list) {
        const owned = state.owned;
        const equipped = state.equipped;
        if (owned.length > 0) {
            const h = document.createElement("div");
            h.className = "shop-section";
            h.textContent = "Мои предметы";
            list.appendChild(h);
            for (const id of owned) {
                const item = SHOP_ITEMS[id];
                if (!item) continue;
                const row = document.createElement("div");
                row.className = "shop-item shop-item--owned";
                if (equipped === id) row.classList.add("shop-item--equipped");
                const preview = document.createElement("div");
                preview.className = "shop-item__preview";
                preview.textContent = item.emoji;
                const info = document.createElement("div");
                info.className = "shop-item__info";
                info.innerHTML = `<div class="shop-item__name">${item.name}</div>
                    <div class="shop-item__price">${equipped === id ? "Надето" : "В инвентаре"}</div>`;
                const btn = document.createElement("button");
                btn.className = "shop-item__btn";
                if (equipped === id) {
                    btn.textContent = "Снять";
                    btn.classList.add("shop-item__btn--unequip");
                    btn.addEventListener("click", () => unequipItem());
                } else {
                    btn.textContent = "Надеть";
                    btn.classList.add("shop-item__btn--equip");
                    btn.addEventListener("click", () => equipItem(id));
                }
                row.appendChild(preview); row.appendChild(info); row.appendChild(btn);
                list.appendChild(row);
            }
        }
        const buyable = Object.entries(SHOP_ITEMS).filter(([id, item]) => !item.hidden && !owned.includes(id));
        if (buyable.length > 0) {
            const h = document.createElement("div");
            h.className = "shop-section";
            h.textContent = "Магазин";
            list.appendChild(h);
            for (const [id, item] of buyable) {
                const row = document.createElement("div");
                row.className = "shop-item";
                const preview = document.createElement("div");
                preview.className = "shop-item__preview";
                preview.textContent = item.emoji;
                const info = document.createElement("div");
                info.className = "shop-item__info";
                info.innerHTML = `<div class="shop-item__name">${item.name}</div>
                    <div class="shop-item__price">${item.price} 💰</div>`;
                const btn = document.createElement("button");
                btn.className = "shop-item__btn";
                btn.textContent = "Купить";
                btn.disabled = state.coins < item.price;
                btn.addEventListener("click", () => buyItem(id));
                row.appendChild(preview); row.appendChild(info); row.appendChild(btn);
                list.appendChild(row);
            }
        }
    }
    function renderFoodTab(list) {
        const h = document.createElement("div");
        h.className = "shop-section";
        h.textContent = "Еда";
        list.appendChild(h);
        for (const [id, food] of Object.entries(FOOD_ITEMS)) {
            const count = state.food[id] || 0;
            const row = document.createElement("div");
            row.className = "shop-item";
            const preview = document.createElement("div");
            preview.className = "shop-item__preview";
            preview.textContent = food.emoji;
            const info = document.createElement("div");
            info.className = "shop-item__info";
            info.innerHTML = `<div class="shop-item__name">${food.name} ${count > 0 ? `<span style="color:#5288c1">×${count}</span>` : ""}</div>
                <div class="shop-item__price">${food.price} 💰 · +${food.hunger} 🍖</div>`;
            const btn = document.createElement("button");
            btn.className = "shop-item__btn";
            btn.textContent = "Купить";
            btn.disabled = state.coins < food.price;
            btn.addEventListener("click", () => buyFood(id));
            row.appendChild(preview); row.appendChild(info); row.appendChild(btn);
            list.appendChild(row);
        }
    }
    async function buyFood(id) {
        const food = FOOD_ITEMS[id];
        if (!food) return;
        if (state.coins < food.price) { alert("Мало монет"); return; }
        if (isOnline()) {
            try {
                const res = await apiFetch("/api/coins/spend", { method: "POST", body: JSON.stringify({ amount: food.price }) });
                state.coins = res.coins;
            } catch (e) {
                if (e.message === "OFFLINE") state.coins -= food.price;
                else { alert("Ошибка: " + e.message); return; }
            }
        } else state.coins -= food.price;
        state.food[id] = (state.food[id] || 0) + 1;
        save(); renderShop();
        if (tg) tg.HapticFeedback?.notificationOccurred("success");
    }
    function buyItem(id) {
        const item = SHOP_ITEMS[id];
        if (!item) return;
        if (state.coins < item.price) { alert("Мало монет"); return; }
        if (state.owned.includes(id)) return;
        const doLocal = () => {
            state.coins -= item.price;
            state.owned.push(id);
            state.equipped = id;
            save(); renderShop();
            if (tg) tg.HapticFeedback?.notificationOccurred("success");
        };
        if (isOnline()) {
            apiFetch("/api/shop/buy", { method: "POST", body: JSON.stringify({ item_id: id }) })
                .then(res => {
                    state.coins = res.coins;
                    state.owned.push(id);
                    state.equipped = id;
                    save(); renderShop();
                    if (tg) tg.HapticFeedback?.notificationOccurred("success");
                })
                .catch(e => {
                    if (e.message === "OFFLINE") doLocal();
                    else alert("Ошибка покупки: " + e.message);
                });
        } else doLocal();
    }
    async function equipItem(id) {
        if (!state.owned.includes(id)) return;
        state.equipped = id;
        save(); renderShop();
        if (tg) tg.HapticFeedback?.impactOccurred("light");
        if (isOnline()) {
            try { await apiFetch("/api/inventory/equip", { method: "POST", body: JSON.stringify({ item_id: id }) }); }
            catch (e) { console.warn(e); }
        }
    }
    async function unequipItem() {
        const prev = state.equipped;
        state.equipped = null;
        save(); renderShop();
        if (isOnline() && prev) {
            try { await apiFetch("/api/inventory/equip", { method: "POST", body: JSON.stringify({ item_id: prev }) }); }
            catch (e) { console.warn(e); }
        }
    }

    // ---------- Кормление ----------

    function openFeedModal() {
        if (isSleeping()) return;
        renderFeedList();
        feedModalEl.classList.remove("hidden");
    }
    function renderFeedList() {
        const list = $("feedList");
        list.innerHTML = "";
        const ownedFoods = Object.entries(state.food).filter(([_, count]) => count > 0);
        if (ownedFoods.length === 0) {
            const empty = document.createElement("div");
            empty.className = "shop-empty";
            empty.textContent = "Холодильник пуст";
            list.appendChild(empty);
            return;
        }
        for (const [id, count] of ownedFoods) {
            const food = FOOD_ITEMS[id];
            if (!food) continue;
            const row = document.createElement("div");
            row.className = "feed-item";
            if (state.stats.hunger >= 100) row.classList.add("feed-item--disabled");
            row.innerHTML = `<div class="feed-item__emoji">${food.emoji}</div>
                <div class="feed-item__info">
                    <div class="feed-item__name">${food.name}</div>
                    <div class="feed-item__sub">+${food.hunger} 🍖</div>
                </div>
                <div class="feed-item__count">×${count}</div>`;
            row.addEventListener("click", () => eatFood(id));
            list.appendChild(row);
        }
    }
    function eatFood(id) {
        const food = FOOD_ITEMS[id];
        if (!food) return;
        if (!state.food[id] || state.food[id] <= 0) return;
        if (state.stats.hunger >= 100) { alert("Питомец не голоден!"); return; }
        state.food[id] -= 1;
        if (state.food[id] <= 0) delete state.food[id];
        state.stats.hunger = Math.min(100, state.stats.hunger + food.hunger);
        state.stats.happiness = Math.min(100, state.stats.happiness + 2);
        save();
        feedModalEl.classList.add("hidden");
        render();
        if (tg) tg.HapticFeedback?.impactOccurred("light");
        state.stats.hunger = Math.min(100, state.stats.hunger + food.hunger);
        state.stats.happiness = Math.min(100, state.stats.happiness + 2);
        
        // Логика чая
        if (id === "tea") {
            state.teaCount = (state.teaCount || 0) + 1;
        }

        save();
        feedModalEl.classList.add("hidden");
        render();
        checkAchievements(); // <--- Вызов проверки
        if (tg) tg.HapticFeedback?.impactOccurred("light");

    }
    $("feedCancel").addEventListener("click", () => feedModalEl.classList.add("hidden"));
    $("feedShop").addEventListener("click", () => {
        feedModalEl.classList.add("hidden");
        hideAll();
        shopEl.classList.remove("hidden");
        shopTab = "food";
        updateShopTabs();
        renderShop();
    });

    // ---------- Сон ----------

    function openSleepModal() {
        if (isSleeping()) return;
        // Показываем/скрываем кнопку ночного сна по времени
        const btn = $("sleepNight");
        if (btn) btn.style.display = canStartNightSleep() ? "block" : "none";
        sleepModalEl.classList.remove("hidden");
    }

    function startNightSleep() {
        if (isSleeping()) return;
        state.nightSleepStart = Date.now();
        state.nightSleepWake = state.nightSleepStart + 8 * 3600 * 1000;
        state.nightSleepEnergyBefore = state.stats.energy;
        save();
        sleepModalEl.classList.add("hidden");
        render();
        if (tg) tg.HapticFeedback?.notificationOccurred("success");
    }
    function startSleep(durationMs, gainRatio) {
        state.sleepUntil = Date.now() + durationMs;
        state.sleepGain = gainRatio;
        state.sleepStartedAt = Date.now();
        save();
        sleepModalEl.classList.add("hidden");
        render();
        startSleepTicker();
        notifyServerSleep(durationMs);
    }
    async function notifyServerSleep(durationMs) {
        const userId = tg?.initDataUnsafe?.user?.id;
        if (!userId) return;
        try {
            await fetch("https://tamagotchi.layero.app/api/sleep/schedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, pet_name: state.petName || "Питомец", duration_seconds: Math.round(durationMs / 1000) }),
            });
        } catch (e) { console.warn(e); }
    }
    let sleepTickerId = null;
    function startSleepTicker() {
        if (sleepTickerId) clearInterval(sleepTickerId);
        sleepTickerId = setInterval(() => {
            if (!isSleeping()) {
                clearInterval(sleepTickerId);
                sleepTickerId = null;
                const gain = state.sleepGain || 0;
                applySleepDecay();
                state.stats.energy = Math.max(0, Math.min(100, state.stats.energy + Math.round(gain * 100)));
                state.sleepUntil = null; state.sleepGain = 0;
                save(); render();
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
        const t = Math.ceil(left / 1000);
        const m = Math.floor(t / 60), s = t % 60;
        sleepTimerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    $("sleepFast").addEventListener("click", () => startSleep(SLEEP_FAST_MS, SLEEP_FAST_GAIN));
    $("sleepDeep").addEventListener("click", () => startSleep(SLEEP_DEEP_MS, SLEEP_DEEP_GAIN));
    $("sleepCancel").addEventListener("click", () => sleepModalEl.classList.add("hidden"));
    const nightBtn = $("sleepNight");
    if (nightBtn) nightBtn.addEventListener("click", startNightSleep);

    // ---------- Админка ----------

    let adminTab = "items";

    function renderAdmin() {
        const list = adminListEl;
        list.innerHTML = "";
        adminCoinsEl.textContent = state.coins;
        document.querySelectorAll("[data-atab]").forEach(t => {
            t.classList.toggle("shop__tab--active", t.dataset.atab === adminTab);
        });

        if (adminTab === "items") {
            for (const [id, item] of Object.entries(SHOP_ITEMS)) {
                const owned = state.owned.includes(id);
                const equipped = state.equipped === id;
                const row = document.createElement("div");
                row.className = "shop-item";
                if (owned) row.classList.add("shop-item--owned");
                if (equipped) row.classList.add("shop-item--equipped");
                const preview = document.createElement("div");
                preview.className = "shop-item__preview";
                preview.textContent = item.emoji;
                const info = document.createElement("div");
                info.className = "shop-item__info";
                info.innerHTML = `<div class="shop-item__name">${item.name}</div>
                    <div class="shop-item__price">${id}${owned ? " · в инвентаре" : ""}</div>`;
                const btn = document.createElement("button");
                btn.className = "shop-item__btn";
                if (owned) {
                    btn.textContent = "Забрать";
                    btn.classList.add("shop-item__btn--unequip");
                    btn.addEventListener("click", () => {
                        state.owned = state.owned.filter(x => x !== id);
                        if (state.equipped === id) state.equipped = null;
                        save(); renderAdmin(); render();
                    });
                } else {
                    btn.textContent = "Выдать";
                    btn.classList.add("shop-item__btn--equip");
                    btn.addEventListener("click", () => {
                        if (!state.owned.includes(id)) state.owned.push(id);
                        save(); renderAdmin(); render();
                    });
                }
                row.appendChild(preview); row.appendChild(info); row.appendChild(btn);
                list.appendChild(row);
            }
        } else if (adminTab === "food") {
            for (const [id, food] of Object.entries(FOOD_ITEMS)) {
                const count = state.food[id] || 0;
                const row = document.createElement("div");
                row.className = "shop-item";
                const preview = document.createElement("div");
                preview.className = "shop-item__preview";
                preview.textContent = food.emoji;
                const info = document.createElement("div");
                info.className = "shop-item__info";
                info.innerHTML = `<div class="shop-item__name">${food.name}</div>
                    <div class="shop-item__price">сейчас: ${count}</div>`;
                const btn = document.createElement("button");
                btn.className = "shop-item__btn shop-item__btn--equip";
                btn.textContent = "+10";
                btn.addEventListener("click", () => { state.food[id] = (state.food[id] || 0) + 10; save(); renderAdmin(); });
                row.appendChild(preview); row.appendChild(info); row.appendChild(btn);
                list.appendChild(row);
            }
        } else if (adminTab === "tools") {
            const coinsRow = document.createElement("div");
            coinsRow.className = "shop-item";
            coinsRow.innerHTML = `<div class="shop-item__preview">💰</div>
                <div class="shop-item__info"><div class="shop-item__name">Монеты</div>
                <div class="shop-item__price">сейчас: ${state.coins}</div></div>`;
            const btns = document.createElement("div");
            btns.style.display = "flex"; btns.style.gap = "6px";
            const minus = document.createElement("button");
            minus.className = "shop-item__btn shop-item__btn--unequip";
            minus.textContent = "−100";
            minus.addEventListener("click", () => { state.coins = Math.max(0, state.coins - 100); save(); renderAdmin(); render(); });
            const plus = document.createElement("button");
            plus.className = "shop-item__btn shop-item__btn--equip";
            plus.textContent = "+100";
            plus.addEventListener("click", () => { state.coins += 100; save(); renderAdmin(); render(); });
            btns.appendChild(minus); btns.appendChild(plus);
            coinsRow.appendChild(btns);
            list.appendChild(coinsRow);

            const sh = document.createElement("div");
            sh.className = "shop-section";
            sh.textContent = "Статы";
            list.appendChild(sh);

            const STAT_KEYS = [
                { key: "hunger", emoji: "🍖", name: "Голод" },
                { key: "happiness", emoji: "😊", name: "Радость" },
                { key: "energy", emoji: "⚡", name: "Энергия" },
                { key: "cleanliness", emoji: "🧼", name: "Чистота" },
            ];
            for (const s of STAT_KEYS) {
                const row = document.createElement("div");
                row.className = "shop-item";
                const val = Math.round(state.stats[s.key]);
                row.innerHTML = `<div class="shop-item__preview">${s.emoji}</div>
                    <div class="shop-item__info"><div class="shop-item__name">${s.name}</div>
                    <div class="shop-item__price">сейчас: ${val}</div></div>`;
                const b = document.createElement("div");
                b.style.display = "flex"; b.style.gap = "6px";
                const m = document.createElement("button");
                m.className = "shop-item__btn shop-item__btn--unequip";
                m.textContent = "−10";
                m.addEventListener("click", () => { state.stats[s.key] = Math.max(0, state.stats[s.key] - 10); save(); renderAdmin(); render(); });
                const r = document.createElement("button");
                r.className = "shop-item__btn";
                r.textContent = "MAX";
                r.addEventListener("click", () => { state.stats[s.key] = 100; save(); renderAdmin(); render(); });
                const p = document.createElement("button");
                p.className = "shop-item__btn shop-item__btn--equip";
                p.textContent = "+10";
                p.addEventListener("click", () => { state.stats[s.key] = Math.min(100, state.stats[s.key] + 10); save(); renderAdmin(); render(); });
                b.appendChild(m); b.appendChild(r); b.appendChild(p);
                row.appendChild(b);
                list.appendChild(row);
            }

            const sh2 = document.createElement("div");
            sh2.className = "shop-section";
            sh2.textContent = "Сброс";
            list.appendChild(sh2);

            const nukeRow = document.createElement("div");
            nukeRow.className = "shop-item";
            nukeRow.innerHTML = `<div class="shop-item__preview">💥</div>
                <div class="shop-item__info"><div class="shop-item__name">Полный сброс</div>
                <div class="shop-item__price">Стереть всё локально</div></div>`;
            const nukeBtn = document.createElement("button");
            nukeBtn.className = "shop-item__btn shop-item__btn--unequip";
            nukeBtn.textContent = "Стереть";
            nukeBtn.addEventListener("click", () => {
                if (confirm("Точно стереть всё?")) { localStorage.removeItem(STORAGE_KEY); location.reload(); }
            });
            nukeRow.appendChild(nukeBtn);
            list.appendChild(nukeRow);
        }
    }

    if (adminBtn) {
        adminBtn.addEventListener("click", () => {
            if (!isAdmin()) return;
            hideAll();
            adminPanelEl.classList.remove("hidden");
            renderAdmin();
        });
    }
    $("adminClose").addEventListener("click", () => showGame());
    document.querySelectorAll("[data-atab]").forEach(t => {
        t.addEventListener("click", () => { adminTab = t.dataset.atab; renderAdmin(); });
    });

    // Ченджлог
    const versionTag = $("versionTag");
    if (versionTag) {
        versionTag.textContent = CURRENT_VERSION;
        versionTag.addEventListener("click", () => {
            renderChangelog();
            $("changelogModal").classList.remove("hidden");
        });
    }
    $("changelogClose").addEventListener("click", () => {
        $("changelogModal").classList.add("hidden");
    });

    function renderChangelog() {
        const list = $("changelogList");
        list.innerHTML = "";
        for (const entry of CHANGELOG) {
            const div = document.createElement("div");
            div.className = "changelog-item";
            
            let html = `<div class="changelog-version"><span>${entry.version}</span><span class="changelog-date">${entry.date}</span></div>`;
            html += `<ul class="changelog-changes">`;
            for (const change of entry.changes) {
                html += `<li>${change}</li>`;
            }
            html += `</ul>`;
            
            div.innerHTML = html;
            list.appendChild(div);
        }
    }

    // ---------- Синк с сервером ----------

    async function syncFromServer() {
        if (!isOnline()) return;
        try { const me = await apiFetch("/api/me"); state.coins = me.coins; } catch (e) { console.warn(e); }
        try {
            const data = await apiFetch("/api/inventory/granted");
            for (const it of data.items) {
                if (!state.owned.includes(it.item_id)) state.owned.push(it.item_id);
                if (it.equipped && !state.equipped) state.equipped = it.item_id;
            }
        } catch (e) { console.warn(e); }
        let serverName = null;
        try { 
            const pet = await apiFetch("/api/pet"); 
            if (pet.name) serverName = pet.name; 
        } catch (e) { 
            console.warn(e); 
        }

        if (serverName && serverName.toLowerCase() !== "питомец") {
            state.petName = serverName;
        } else if (serverName === null) {
            // Сервер недоступен (или уснул) — НЕ трогаем локальное имя
            console.warn("API недоступен, используем локальное имя:", state.petName);
        } else {
            // Сервер ответил, и там дефолтное имя "Питомец"
            state.petName = null;
        }
        
        save();
        if (!state.petName) showOnboarding();
        else showGame();
    }

    // ---------- Экспорт для остальных модулей ----------

    window.App = {
        // tg
        tg,
        // API
        apiFetch, isOnline, getUserId: getMyUserId, isAdmin,
        // State
        getState: () => state,
        setState: (s) => { state = s; save(); },
        save, render, applySleepDecay,
        // UI
        hideAll, showGame, openGameChooser, showOnboarding,
        registerCleanup,
        // Utils
        notify: (msg) => alert(msg),
        confirm: (msg) => confirm(msg),
        hapticImpact: (style) => tg?.HapticFeedback?.impactOccurred(style || "light"),
        hapticNotify: (type) => tg?.HapticFeedback?.notificationOccurred(type || "success"),
        // Constants
        SHOP_ITEMS, FOOD_ITEMS, STORAGE_KEY,
    };

    // ---------- Старт ----------

    applyDecay();
    checkSleepOnLoad();
    if (isSleeping()) startSleepTicker();
    save();

    if (isOnline()) {
        document.body.style.opacity = "0.5";
        syncFromServer().finally(() => { document.body.style.opacity = "1"; });
    } else {
        if (!state.petName) showOnboarding();
        else showGame();
    }
})();