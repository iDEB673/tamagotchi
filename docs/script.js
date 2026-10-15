(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }

    const ADMIN_ID = 5410929450;

    function getMyUserId() {
        // Пробуем initDataUnsafe
        const unsafeId = tg?.initDataUnsafe?.user?.id;
        if (unsafeId) return parseInt(unsafeId, 10);

        // Парсим initData вручную
        const initData = tg?.initData;
        if (!initData) return null;
        try {
            const params = new URLSearchParams(initData);
            const userStr = params.get("user");
            if (!userStr) return null;
            const user = JSON.parse(userStr);
            return user.id ? parseInt(user.id, 10) : null;
        } catch (e) {
            return null;
        }
    }

    function isAdmin() {
        return getMyUserId() === ADMIN_ID;
    }

    function isOnline() {
        return !!(tg?.initData && tg.initData.length > 0);
    }

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
    const MG_DURATION = 10, MG_GOAL = 30, MG_REWARD = 5, MG_LOSS_PENALTY = 5, MG_ENERGY_COST = 10;
    const SLEEP_FAST_MS = 5 * 60 * 1000, SLEEP_DEEP_MS = 10 * 60 * 1000;
    const SLEEP_FAST_GAIN = 0.5, SLEEP_DEEP_GAIN = 1.0;
    const SLEEP_DECAY_PER_MIN = { hunger: 2.0, happiness: 1.5, cleanliness: 1.5 };

    // ---------- Block Blast: конфиг ----------

    const BB_ENERGY_COST = 15;

    const BB_LEVELS = {
        easy: {
            label: "Лёгкий", emoji: "🟢", size: 6,
            rewards: [
                { min: 500, coins: 15 },
                { min: 300, coins: 10 },
                { min: 200, coins: 7 },
                { min: 150, coins: 5 },
                { min: 100, coins: 3 },
                { min: 50,  coins: 2 },
                { min: 0,   coins: 0 },
            ],
        },
        normal: {
            label: "Средний", emoji: "🟡", size: 8,
            rewards: [
                { min: 500, coins: 40 },
                { min: 300, coins: 25 },
                { min: 200, coins: 17 },
                { min: 150, coins: 11 },
                { min: 100, coins: 7 },
                { min: 50,  coins: 4 },
                { min: 0,   coins: 1 },
            ],
        },
        hard: {
            label: "Сложный", emoji: "🔴", size: 10,
            rewards: [
                { min: 500, coins: 75 },
                { min: 300, coins: 50 },
                { min: 200, coins: 35 },
                { min: 150, coins: 22 },
                { min: 100, coins: 14 },
                { min: 50,  coins: 8 },
                { min: 0,   coins: 3 },
            ],
        },
    };

    function bbCalcReward(levelKey, score) {
        const lvl = BB_LEVELS[levelKey];
        if (!lvl) return 0;
        for (const r of lvl.rewards) {
            if (score >= r.min) return r.coins;
        }
        return 0;
    }

    const BB_SHAPES_EASY = [
        [[0,0]],
        [[0,0],[1,0]],
        [[0,0],[0,1]],
        [[0,0],[1,0],[2,0]],
        [[0,0],[0,1],[0,2]],
        [[0,0],[1,0],[0,1]],
        [[0,0],[0,1],[1,1]],
        [[0,0],[1,0],[1,1]],
    ];

    const BB_SHAPES_MEDIUM = [
        ...BB_SHAPES_EASY,
        [[0,0],[1,0],[2,0],[3,0]],
        [[0,0],[0,1],[0,2],[0,3]],
        [[0,0],[1,0],[0,1],[1,1]],
        [[0,0],[1,0],[2,0],[0,1]],
        [[0,0],[0,1],[0,2],[1,2]],
    ];

    const BB_SHAPES_HARD = [
        ...BB_SHAPES_MEDIUM,
        [[0,0],[1,0],[2,0],[3,0],[4,0]],
        [[0,0],[0,1],[0,2],[0,3],[0,4]],
        [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],
        [[0,0],[1,0],[2,0],[3,0],[0,1]],
        [[0,0],[1,0],[2,0],[2,1],[2,2]],
    ];

    function bbGetShapePool(levelKey, score) {
        if (levelKey === "easy") return BB_SHAPES_EASY;
        if (levelKey === "normal") {
            return score < 150 ? BB_SHAPES_EASY : BB_SHAPES_MEDIUM;
        }
        if (score < 150) return BB_SHAPES_EASY;
        if (score < 350) return BB_SHAPES_MEDIUM;
        return BB_SHAPES_HARD;
    }

    const BB_COLORS = [
        "#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1",
        "#a29bfe", "#fd79a8", "#54a0ff", "#26de81",
    ];

    // ---------- Еда ----------

    const FOOD_ITEMS = {
        cola:     { name: "Кола",     emoji: "🥤", price: 3,  hunger: 7  },
        kitkat:   { name: "Кит-Кат",  emoji: "🍫", price: 5,  hunger: 10 },
        donut:    { name: "Пончик",   emoji: "🍩", price: 6,  hunger: 12 },
        pizza:    { name: "Пицца",    emoji: "🍕", price: 7,  hunger: 14 },
        shawarma: { name: "Шаурма",   emoji: "🌯", price: 15, hunger: 35 },
    };

    // ---------- Одежда ----------

    const SHOP_ITEMS = {
        cap:        { name: "Кепка",            emoji: "🧢", price: 50 },
        bow:        { name: "Бантик",           emoji: "🎀", price: 40 },
        sunglasses: { name: "Очки",             emoji: "🕶️", price: 80 },
        crown:      { name: "Корона",           emoji: "👑", price: 200 },
        mask:       { name: "Маска анонимуса",  emoji: "🎭", price: 150 },
        wizard_hat: { name: "Шапка волшебника", emoji: "🧙", price: 0, hidden: true },
    };

    const defaultState = () => ({
        petName: null, coins: 100,
        stats: { hunger: 100, happiness: 100, energy: 100, cleanliness: 100 },
        lastUpdate: Date.now(), gamesPlayed: 0,
        sleepUntil: null, sleepGain: 0, sleepStartedAt: null,
        owned: [],
        equipped: null,
        food: {},
    });

    let state = load() || defaultState();

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data.food) data.food = {};
            if (!data.owned) data.owned = [];
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
        if (!state.sleepUntil) return;
        if (Date.now() >= state.sleepUntil) {
            const gain = state.sleepGain || 0;
            state.stats.energy = Math.max(0, Math.min(100, state.stats.energy + Math.round(gain * 100)));
            applySleepDecay();
            state.sleepUntil = null; state.sleepGain = 0;
            save();
        }
    }

    const $ = (id) => document.getElementById(id);
    const onboardingEl = $("onboarding");
    const gameEl = $("game");
    const shopEl = $("shop");
    const chooserEl = $("gameChooser");
    const bbLevelsEl = $("bbLevels");
    const introEl = $("minigameIntro");
    const minigameEl = $("minigame");
    const bbEl = $("blockblast");
    const mgModalEl = $("mgResult");
    const bbModalEl = $("bbResult");
    const bbExitModalEl = $("bbExitModal");
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

    function hideAll() {
        if (typeof bbCleanupGhosts === "function") bbCleanupGhosts();
        [onboardingEl, gameEl, shopEl, chooserEl, bbLevelsEl, introEl, minigameEl, bbEl,
         sleepModalEl, mgModalEl, bbModalEl, bbExitModalEl, feedModalEl, adminPanelEl]
            .forEach(el => el && el.classList.add("hidden"));
    }

    function isSleeping() { return state.sleepUntil && Date.now() < state.sleepUntil; }

    function render() {
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

        if (adminBtn) {
            adminBtn.classList.toggle("hidden", !isAdmin());
        }

        actionButtons.forEach((btn) => { btn.disabled = sleeping; });
    }

    function showOnboarding() {
        hideAll();
        onboardingEl.classList.remove("hidden");
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
        nameConfirm.addEventListener("click", (e) => { e.preventDefault(); confirm(); });
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); confirm(); }
        });
    }

    function showGame() { hideAll(); gameEl.classList.remove("hidden"); render(); }
    function openGameChooser() { if (isSleeping()) return; hideAll(); chooserEl.classList.remove("hidden"); }
    function openBbLevels() { if (isSleeping()) return; hideAll(); bbLevelsEl.classList.remove("hidden"); }

    async function applyAction(name) {
        const action = ACTIONS[name];
        if (!action || isSleeping()) return;

        if (action.cost > 0) {
            if (state.coins < action.cost) {
                alert(`Нужно ${action.cost} монет. Заработай в мини-игре!`);
                return;
            }
            if (isOnline()) {
                try {
                    const res = await apiFetch("/api/coins/spend", {
                        method: "POST",
                        body: JSON.stringify({ amount: action.cost }),
                    });
                    state.coins = res.coins;
                } catch (e) {
                    if (e.message === "OFFLINE") state.coins -= action.cost;
                    else { alert("Ошибка: " + e.message); return; }
                }
            } else {
                state.coins -= action.cost;
            }
        }

        for (const [key, delta] of Object.entries(action)) {
            if (key === "cost") continue;
            state.stats[key] = Math.max(0, Math.min(100, state.stats[key] + delta));
        }
        save();
        render();
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

    // ---------- Магазин ----------

    let shopTab = "clothes";

    $("openShop").addEventListener("click", () => {
        if (isSleeping()) return;
        hideAll();
        shopEl.classList.remove("hidden");
        shopTab = "clothes";
        updateShopTabs();
        renderShop();
    });

    $("shopClose").addEventListener("click", () => showGame());

    document.querySelectorAll(".shop__tab[data-tab]").forEach(tab => {
        tab.addEventListener("click", () => {
            shopTab = tab.dataset.tab;
            updateShopTabs();
            renderShop();
        });
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
            const head1 = document.createElement("div");
            head1.className = "shop-section";
            head1.textContent = "Мои предметы";
            list.appendChild(head1);

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
                info.innerHTML = `
                    <div class="shop-item__name">${item.name}</div>
                    <div class="shop-item__price">${equipped === id ? "Надето" : "В инвентаре"}</div>
                `;

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

                row.appendChild(preview);
                row.appendChild(info);
                row.appendChild(btn);
                list.appendChild(row);
            }
        }

        const buyable = Object.entries(SHOP_ITEMS)
            .filter(([id, item]) => !item.hidden && !owned.includes(id));

        if (buyable.length > 0) {
            const head2 = document.createElement("div");
            head2.className = "shop-section";
            head2.textContent = "Магазин";
            list.appendChild(head2);

            for (const [id, item] of buyable) {
                const row = document.createElement("div");
                row.className = "shop-item";

                const preview = document.createElement("div");
                preview.className = "shop-item__preview";
                preview.textContent = item.emoji;

                const info = document.createElement("div");
                info.className = "shop-item__info";
                info.innerHTML = `
                    <div class="shop-item__name">${item.name}</div>
                    <div class="shop-item__price">${item.price} 💰</div>
                `;

                const btn = document.createElement("button");
                btn.className = "shop-item__btn";
                btn.textContent = "Купить";
                btn.disabled = state.coins < item.price;
                btn.addEventListener("click", () => buyItem(id));

                row.appendChild(preview);
                row.appendChild(info);
                row.appendChild(btn);
                list.appendChild(row);
            }
        }
    }

    function renderFoodTab(list) {
        const head = document.createElement("div");
        head.className = "shop-section";
        head.textContent = "Еда";
        list.appendChild(head);

        for (const [id, food] of Object.entries(FOOD_ITEMS)) {
            const count = state.food[id] || 0;

            const row = document.createElement("div");
            row.className = "shop-item";

            const preview = document.createElement("div");
            preview.className = "shop-item__preview";
            preview.textContent = food.emoji;

            const info = document.createElement("div");
            info.className = "shop-item__info";
            info.innerHTML = `
                <div class="shop-item__name">${food.name} ${count > 0 ? `<span style="color:#5288c1">×${count}</span>` : ""}</div>
                <div class="shop-item__price">${food.price} 💰 · +${food.hunger} 🍖</div>
            `;

            const btn = document.createElement("button");
            btn.className = "shop-item__btn";
            btn.textContent = "Купить";
            btn.disabled = state.coins < food.price;
            btn.addEventListener("click", () => buyFood(id));

            row.appendChild(preview);
            row.appendChild(info);
            row.appendChild(btn);
            list.appendChild(row);
        }
    }

    async function buyFood(id) {
        const food = FOOD_ITEMS[id];
        if (!food) return;
        if (state.coins < food.price) { alert("Мало монет"); return; }

        if (isOnline()) {
            try {
                const res = await apiFetch("/api/coins/spend", {
                    method: "POST",
                    body: JSON.stringify({ amount: food.price }),
                });
                state.coins = res.coins;
            } catch (e) {
                if (e.message === "OFFLINE") state.coins -= food.price;
                else { alert("Ошибка: " + e.message); return; }
            }
        } else {
            state.coins -= food.price;
        }

        state.food[id] = (state.food[id] || 0) + 1;
        save();
        renderShop();
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
            save();
            renderShop();
            if (tg) tg.HapticFeedback?.notificationOccurred("success");
        };

        if (isOnline()) {
            apiFetch("/api/shop/buy", {
                method: "POST",
                body: JSON.stringify({ item_id: id }),
            }).then(res => {
                state.coins = res.coins;
                state.owned.push(id);
                state.equipped = id;
                save();
                renderShop();
                if (tg) tg.HapticFeedback?.notificationOccurred("success");
            }).catch(e => {
                if (e.message === "OFFLINE") doLocal();
                else alert("Ошибка покупки: " + e.message);
            });
        } else {
            doLocal();
        }
    }

    function equipItem(id) {
        if (!state.owned.includes(id)) return;
        state.equipped = id;
        save();
        renderShop();
        if (tg) tg.HapticFeedback?.impactOccurred("light");
    }

    function unequipItem() {
        state.equipped = null;
        save();
        renderShop();
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

            row.innerHTML = `
                <div class="feed-item__emoji">${food.emoji}</div>
                <div class="feed-item__info">
                    <div class="feed-item__name">${food.name}</div>
                    <div class="feed-item__sub">+${food.hunger} 🍖</div>
                </div>
                <div class="feed-item__count">×${count}</div>
            `;

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

    // ---------- Кликер ----------

    let mgEndAt = 0, mgScore = 0, mgActive = false, mgTickerId = null, mgTimeoutId = null;
    const mgTimerEl = $("mgTimer"), mgEnergyEl = $("mgEnergy"), mgScoreEl = $("mgScore");
    const mgClickBtn = $("mgClickBtn"), mgModalTitle = $("mgResultTitle");
    const mgModalReward = $("mgResultReward"), mgModalSub = $("mgResultSub");
    const mgModalBack = $("mgResultBack"), mgModalRepeat = $("mgResultRepeat");

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
        hideAll();
        introEl.classList.remove("hidden");
    }
    $("introStart").addEventListener("click", () => {
        if (state.stats.energy < MG_ENERGY_COST) return;
        state.stats.energy -= MG_ENERGY_COST;
        save();
        startMinigame();
    });
    $("introCancel").addEventListener("click", () => showGame());

    function startMinigame() {
        hideAll();
        minigameEl.classList.remove("hidden");
        mgScore = 0; mgActive = true;
        mgEndAt = Date.now() + MG_DURATION * 1000;
        mgScoreEl.textContent = "0";
        mgTimerEl.textContent = MG_DURATION;
        mgEnergyEl.textContent = Math.round(state.stats.energy);

        if (mgTickerId) clearInterval(mgTickerId);
        mgTickerId = setInterval(() => {
            if (!mgActive) return;
            const leftMs = mgEndAt - Date.now();
            if (leftMs <= 0) { mgTimerEl.textContent = "0"; endMinigame(); return; }
            mgTimerEl.textContent = Math.ceil(leftMs / 1000);
        }, 100);

        if (mgTimeoutId) clearTimeout(mgTimeoutId);
        mgTimeoutId = setTimeout(() => { if (mgActive) endMinigame(); }, MG_DURATION * 1000 + 50);
    }

    async function endMinigame() {
        if (!mgActive) return;
        mgActive = false;
        if (mgTickerId) { clearInterval(mgTickerId); mgTickerId = null; }
        if (mgTimeoutId) { clearTimeout(mgTimeoutId); mgTimeoutId = null; }

        const win = mgScore >= MG_GOAL;
        let reward = win ? MG_REWARD : 0;

        if (isOnline()) {
            try {
                const res = await apiFetch("/api/game/reward", {
                    method: "POST",
                    body: JSON.stringify({ game: "clicker", score: mgScore }),
                });
                state.coins = res.coins;
                reward = res.reward;
            } catch (e) {
                if (e.message === "OFFLINE") state.coins += reward;
            }
        } else {
            state.coins += reward;
        }

        if (win) {
            mgModalTitle.textContent = "Ты выиграл:";
            mgModalReward.textContent = `+${reward} 💰`;
            mgModalReward.classList.remove("loss");
            mgModalSub.textContent = `Накликал ${mgScore} раз`;
        } else {
            state.stats.happiness = Math.max(0, state.stats.happiness - MG_LOSS_PENALTY);
            mgModalTitle.textContent = "Ты проиграл:";
            mgModalReward.textContent = `−${MG_LOSS_PENALTY} 😢`;
            mgModalReward.classList.add("loss");
            mgModalSub.textContent = `Накликал ${mgScore} из ${MG_GOAL}`;
        }

        state.gamesPlayed += 1;
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
        state.stats.energy -= MG_ENERGY_COST;
        save();
        startMinigame();
    });

    // ---------- Block Blast ----------

    let bbGrid = [], bbShapes = [], bbScore = 0, bbActive = false, bbDrag = null, bbGhostEl = null;
    let bbCurrentLevel = "normal";
    let bbSize = 8;

    function bbNewShape() {
        const pool = bbGetShapePool(bbCurrentLevel, bbScore);
        const cells = pool[Math.floor(Math.random() * pool.length)];
        const color = BB_COLORS[Math.floor(Math.random() * BB_COLORS.length)];
        return { cells, color };
    }
    function bbReset() {
        bbSize = BB_LEVELS[bbCurrentLevel].size;
        bbGrid = Array.from({ length: bbSize }, () => Array(bbSize).fill(null));
        bbShapes = [bbNewShape(), bbNewShape(), bbNewShape()];
        bbScore = 0; bbActive = true; bbDrag = null;
    }
    function bbCleanupGhosts() {
        document.querySelectorAll(".bb-ghost").forEach(el => el.remove());
        document.querySelectorAll(".bb-shape--dragging").forEach(el => el.classList.remove("bb-shape--dragging"));
        bbGhostEl = null; bbDrag = null;
    }
    window.addEventListener("pointercancel", bbCleanupGhosts);
    window.addEventListener("blur", bbCleanupGhosts);

    function bbRender() {
        const gridEl = $("bbGrid");
        gridEl.innerHTML = "";
        gridEl.style.gridTemplateColumns = `repeat(${bbSize}, 1fr)`;
        gridEl.style.gridTemplateRows = `repeat(${bbSize}, 1fr)`;
        for (let y = 0; y < bbSize; y++) {
            for (let x = 0; x < bbSize; x++) {
                const cell = document.createElement("div");
                cell.className = "bb-cell";
                cell.dataset.x = x; cell.dataset.y = y;
                if (bbGrid[y][x]) {
                    cell.classList.add("bb-cell--filled");
                    cell.style.background = bbGrid[y][x];
                }
                gridEl.appendChild(cell);
            }
        }
        const shapesEl = $("bbShapes");
        shapesEl.innerHTML = "";
        bbShapes.forEach((shape, i) => {
            const slot = document.createElement("div");
            slot.className = "bb-shape";
            if (!shape) { slot.classList.add("bb-shape--used"); shapesEl.appendChild(slot); return; }
            const maxX = Math.max(...shape.cells.map(c => c[0])) + 1;
            const maxY = Math.max(...shape.cells.map(c => c[1])) + 1;
            const occupied = new Set(shape.cells.map(c => `${c[0]},${c[1]}`));
            const inner = document.createElement("div");
            inner.className = "bb-shape__grid";
            inner.style.gridTemplateColumns = `repeat(${maxX}, var(--bb-mini, 16px))`;
            inner.style.gridTemplateRows = `repeat(${maxY}, var(--bb-mini, 16px))`;
            for (let y = 0; y < maxY; y++) {
                for (let x = 0; x < maxX; x++) {
                    const mini = document.createElement("div");
                    mini.className = "bb-mini";
                    if (occupied.has(`${x},${y}`)) {
                        mini.classList.add("bb-mini--filled");
                        mini.style.background = shape.color;
                    }
                    inner.appendChild(mini);
                }
            }
            slot.appendChild(inner);
            slot.addEventListener("pointerdown", (e) => bbStartDrag(i, e));
            shapesEl.appendChild(slot);
        });
        $("bbScore").textContent = bbScore;
        $("bbEnergy").textContent = Math.round(state.stats.energy);
    }

    function bbCanPlace(cells, ox, oy) {
        for (const [dx, dy] of cells) {
            const x = ox + dx, y = oy + dy;
            if (x < 0 || y < 0 || x >= bbSize || y >= bbSize) return false;
            if (bbGrid[y][x]) return false;
        }
        return true;
    }
    function bbGetCellFromPoint(cx, cy) {
        const el = document.elementFromPoint(cx, cy);
        if (!el || !el.classList.contains("bb-cell")) return null;
        const x = parseInt(el.dataset.x, 10), y = parseInt(el.dataset.y, 10);
        if (isNaN(x) || isNaN(y)) return null;
        return { x, y };
    }
    function bbClearPreview() {
        document.querySelectorAll(".bb-cell--preview-ok, .bb-cell--preview-bad")
            .forEach(el => {
                el.classList.remove("bb-cell--preview-ok", "bb-cell--preview-bad");
                const x = parseInt(el.dataset.x, 10), y = parseInt(el.dataset.y, 10);
                el.style.background = bbGrid[y] && bbGrid[y][x] ? bbGrid[y][x] : "";
            });
    }
    function bbShowPreview(cells, ox, oy, valid, color) {
        bbClearPreview();
        for (const [dx, dy] of cells) {
            const x = ox + dx, y = oy + dy;
            if (x < 0 || y < 0 || x >= bbSize || y >= bbSize) continue;
            const el = document.querySelector(`.bb-cell[data-x="${x}"][data-y="${y}"]`);
            if (!el) continue;
            el.classList.add(valid ? "bb-cell--preview-ok" : "bb-cell--preview-bad");
            if (valid) el.style.background = color;
        }
    }
    function bbStartDrag(shapeIndex, evt) {
        if (!bbActive) return;
        const shape = bbShapes[shapeIndex];
        if (!shape) return;
        evt.preventDefault();
        const slotEl = evt.currentTarget;
        const miniEl = slotEl.querySelector(".bb-mini--filled");
        const miniSize = miniEl ? miniEl.getBoundingClientRect().width + 2 : 16;
        const maxX = Math.max(...shape.cells.map(c => c[0])) + 1;
        const maxY = Math.max(...shape.cells.map(c => c[1])) + 1;
        const mins = slotEl.querySelectorAll(".bb-shape__grid .bb-mini");
        let grabCellX = Math.floor((maxX - 1) / 2), grabCellY = maxY - 1;
        const cellArr = [];
        for (let y = 0; y < maxY; y++) for (let x = 0; x < maxX; x++) cellArr.push({ x, y });
        for (let i = 0; i < mins.length; i++) {
            const r = mins[i].getBoundingClientRect();
            if (evt.clientX >= r.left && evt.clientX <= r.right && evt.clientY >= r.top && evt.clientY <= r.bottom) {
                grabCellX = cellArr[i].x; grabCellY = cellArr[i].y;
                break;
            }
        }
        bbDrag = { shapeIndex, shape, miniSize, grabCellX, grabCellY, lastHoverCell: null };
        const ghost = document.createElement("div");
        ghost.className = "bb-ghost";
        const occupied = new Set(shape.cells.map(c => `${c[0]},${c[1]}`));
        ghost.style.gridTemplateColumns = `repeat(${maxX}, ${miniSize}px)`;
        ghost.style.gridTemplateRows = `repeat(${maxY}, ${miniSize}px)`;
        for (let y = 0; y < maxY; y++) for (let x = 0; x < maxX; x++) {
            const mini = document.createElement("div");
            mini.className = "bb-mini";
            if (occupied.has(`${x},${y}`)) { mini.classList.add("bb-mini--filled"); mini.style.background = shape.color; }
            ghost.appendChild(mini);
        }
        document.body.appendChild(ghost);
        bbGhostEl = ghost;
        bbMoveGhost(evt.clientX, evt.clientY);
        document.addEventListener("pointermove", bbOnDragMove);
        document.addEventListener("pointerup", bbOnDragEnd);
        document.addEventListener("pointercancel", bbOnDragEnd);
        slotEl.classList.add("bb-shape--dragging");
        if (tg) tg.HapticFeedback?.impactOccurred("light");
    }
    function bbMoveGhost(cx, cy) {
        if (!bbGhostEl || !bbDrag) return;
        const { miniSize, grabCellX, grabCellY } = bbDrag;
        bbGhostEl.style.left = (cx - grabCellX * miniSize - miniSize / 2) + "px";
        bbGhostEl.style.top = (cy - grabCellY * miniSize - miniSize / 2) + "px";
    }
    function bbOnDragMove(evt) {
        if (!bbDrag || !bbGhostEl) return;
        bbMoveGhost(evt.clientX, evt.clientY);
        const cell = bbGetCellFromPoint(evt.clientX, evt.clientY);
        if (!cell) { bbClearPreview(); bbDrag.lastHoverCell = null; return; }
        const ox = cell.x - bbDrag.grabCellX;
        const oy = cell.y - bbDrag.grabCellY;
        const valid = bbCanPlace(bbDrag.shape.cells, ox, oy);
        bbShowPreview(bbDrag.shape.cells, ox, oy, valid, bbDrag.shape.color);
        bbDrag.lastHoverCell = { ox, oy, valid };
    }
    function bbOnDragEnd() {
        if (!bbDrag) return;
        document.removeEventListener("pointermove", bbOnDragMove);
        document.removeEventListener("pointerup", bbOnDragEnd);
        document.removeEventListener("pointercancel", bbOnDragEnd);
        document.querySelectorAll(".bb-shape--dragging").forEach(el => el.classList.remove("bb-shape--dragging"));
        if (bbGhostEl) { bbGhostEl.remove(); bbGhostEl = null; }
        bbClearPreview();
        const hover = bbDrag.lastHoverCell;
        const shapeIndex = bbDrag.shapeIndex;
        bbDrag = null;
        if (hover && hover.valid) bbPlaceShape(shapeIndex, hover.ox, hover.oy);
    }
    function bbPlaceShape(shapeIndex, ox, oy) {
        const shape = bbShapes[shapeIndex];
        if (!shape) return;
        if (!bbCanPlace(shape.cells, ox, oy)) return;
        for (const [dx, dy] of shape.cells) bbGrid[oy + dy][ox + dx] = shape.color;
        bbScore += shape.cells.length;
        bbShapes[shapeIndex] = null;
        bbClearLines();
        if (bbShapes.every(s => s === null)) bbShapes = [bbNewShape(), bbNewShape(), bbNewShape()];
        bbRender();
        if (tg) tg.HapticFeedback?.impactOccurred("light");
        if (!bbAnyShapeFits()) bbGameOver();
    }
    function bbClearLines() {
        const toClear = new Set();
        for (let y = 0; y < bbSize; y++) if (bbGrid[y].every(c => c)) for (let x = 0; x < bbSize; x++) toClear.add(`${x},${y}`);
        for (let x = 0; x < bbSize; x++) {
            let full = true;
            for (let y = 0; y < bbSize; y++) if (!bbGrid[y][x]) { full = false; break; }
            if (full) for (let y = 0; y < bbSize; y++) toClear.add(`${x},${y}`);
        }
        if (toClear.size === 0) return;
        let lines = 0;
        for (let y = 0; y < bbSize; y++) { let f = true; for (let x = 0; x < bbSize; x++) if (!toClear.has(`${x},${y}`)) { f = false; break; } if (f) lines++; }
        for (let x = 0; x < bbSize; x++) { let f = true; for (let y = 0; y < bbSize; y++) if (!toClear.has(`${x},${y}`)) { f = false; break; } if (f) lines++; }
        for (const key of toClear) { const [x, y] = key.split(",").map(Number); bbGrid[y][x] = null; }
        bbScore += lines * 50;
        if (lines > 0 && tg) tg.HapticFeedback?.notificationOccurred("success");
    }
    function bbAnyShapeFits() {
        for (const shape of bbShapes) {
            if (!shape) continue;
            for (let y = 0; y < bbSize; y++) for (let x = 0; x < bbSize; x++) if (bbCanPlace(shape.cells, x, y)) return true;
        }
        return false;
    }

    async function bbFinishAndReward() {
        bbCleanupGhosts();
        bbActive = false;

        let coins = bbCalcReward(bbCurrentLevel, bbScore);

        if (isOnline()) {
            try {
                const res = await apiFetch("/api/game/reward", {
                    method: "POST",
                    body: JSON.stringify({ game: "blockblast", score: bbScore }),
                });
                coins = res.reward;
                state.coins = res.coins;
            } catch (e) {
                if (e.message === "OFFLINE") state.coins += coins;
            }
        } else {
            state.coins += coins;
        }

        state.gamesPlayed += 1;
        save();
        return coins;
    }

    async function bbGameOver() {
        const coins = await bbFinishAndReward();
        $("bbResultReward").textContent = `+${coins} 💰`;
        $("bbResultSub").textContent = `Счёт: ${bbScore}`;
        bbModalEl.classList.remove("hidden");
    }

    document.querySelectorAll(".level-btn").forEach(btn => {
        btn.addEventListener("click", () => startBlockBlast(btn.dataset.level));
    });
    $("bbLevelsCancel").addEventListener("click", () => openGameChooser());

    function startBlockBlast(levelKey) {
        bbCleanupGhosts();
        if (isSleeping()) return;
        if (state.stats.energy < BB_ENERGY_COST) {
            alert(`Нужно ${BB_ENERGY_COST} энергии.`);
            return;
        }
        state.stats.energy -= BB_ENERGY_COST;
        bbCurrentLevel = levelKey;
        save();

        hideAll();
        bbEl.classList.remove("hidden");
        $("bbLevelIcon").textContent = BB_LEVELS[levelKey].emoji;
        bbReset();
        bbRender();
    }

    $("bbCancel").addEventListener("click", () => {
        bbCleanupGhosts();
        if (!bbActive || bbScore === 0) { showGame(); return; }
        const reward = bbCalcReward(bbCurrentLevel, bbScore);
        $("bbExitReward").textContent = `+${reward} 💰`;
        $("bbExitSub").textContent = `Счёт: ${bbScore}`;
        bbExitModalEl.classList.remove("hidden");
    });

    $("bbExitNo").addEventListener("click", () => bbExitModalEl.classList.add("hidden"));
    $("bbExitYes").addEventListener("click", async () => {
        bbExitModalEl.classList.add("hidden");
        await bbFinishAndReward();
        showGame();
    });

    $("bbResultBack").addEventListener("click", () => showGame());
    $("bbResultRepeat").addEventListener("click", () => {
        if (state.stats.energy < BB_ENERGY_COST) { alert(`Нужно ${BB_ENERGY_COST} энергии.`); return; }
        state.stats.energy -= BB_ENERGY_COST;
        save();
        bbModalEl.classList.add("hidden");
        bbReset();
        bbRender();
    });

    // ---------- Обработчики выбора игры ----------

    $("chooseClicker").addEventListener("click", () => openMinigameIntro());
    $("chooseBlock").addEventListener("click", () => openBbLevels());
    $("chooseCancel").addEventListener("click", () => showGame());

    // ---------- Сон ----------

    function openSleepModal() { if (isSleeping()) return; sleepModalEl.classList.remove("hidden"); }
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
                body: JSON.stringify({
                    user_id: userId,
                    pet_name: state.petName || "Питомец",
                    duration_seconds: Math.round(durationMs / 1000),
                }),
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

    // ---------- Админ-панель ----------

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
                info.innerHTML = `
                    <div class="shop-item__name">${item.name}</div>
                    <div class="shop-item__price">${id}${owned ? " · в инвентаре" : ""}</div>
                `;

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

                row.appendChild(preview);
                row.appendChild(info);
                row.appendChild(btn);
                list.appendChild(row);
            }
        }

        if (adminTab === "food") {
            for (const [id, food] of Object.entries(FOOD_ITEMS)) {
                const count = state.food[id] || 0;

                const row = document.createElement("div");
                row.className = "shop-item";

                const preview = document.createElement("div");
                preview.className = "shop-item__preview";
                preview.textContent = food.emoji;

                const info = document.createElement("div");
                info.className = "shop-item__info";
                info.innerHTML = `
                    <div class="shop-item__name">${food.name}</div>
                    <div class="shop-item__price">сейчас: ${count}</div>
                `;

                const btn = document.createElement("button");
                btn.className = "shop-item__btn shop-item__btn--equip";
                btn.textContent = "+10";
                btn.addEventListener("click", () => {
                    state.food[id] = (state.food[id] || 0) + 10;
                    save(); renderAdmin();
                });

                row.appendChild(preview);
                row.appendChild(info);
                row.appendChild(btn);
                list.appendChild(row);
            }
        }

        if (adminTab === "tools") {
            const coinsRow = document.createElement("div");
            coinsRow.className = "shop-item";
            coinsRow.innerHTML = `
                <div class="shop-item__preview">💰</div>
                <div class="shop-item__info">
                    <div class="shop-item__name">Монеты</div>
                    <div class="shop-item__price">сейчас: ${state.coins}</div>
                </div>
            `;
            const coinsBtn = document.createElement("button");
            coinsBtn.className = "shop-item__btn shop-item__btn--equip";
            coinsBtn.textContent = "+100";
            coinsBtn.addEventListener("click", () => {
                state.coins += 100;
                save(); renderAdmin(); render();
            });
            coinsRow.appendChild(coinsBtn);
            list.appendChild(coinsRow);

            const resetRow = document.createElement("div");
            resetRow.className = "shop-item";
            resetRow.innerHTML = `
                <div class="shop-item__preview">♻️</div>
                <div class="shop-item__info">
                    <div class="shop-item__name">Сбросить статы</div>
                    <div class="shop-item__price">Все статы = 100</div>
                </div>
            `;
            const resetBtn = document.createElement("button");
            resetBtn.className = "shop-item__btn shop-item__btn--equip";
            resetBtn.textContent = "Сброс";
            resetBtn.addEventListener("click", () => {
                state.stats = { hunger: 100, happiness: 100, energy: 100, cleanliness: 100 };
                save(); renderAdmin(); render();
            });
            resetRow.appendChild(resetBtn);
            list.appendChild(resetRow);

            const nukeRow = document.createElement("div");
            nukeRow.className = "shop-item";
            nukeRow.innerHTML = `
                <div class="shop-item__preview">💥</div>
                <div class="shop-item__info">
                    <div class="shop-item__name">Полный сброс</div>
                    <div class="shop-item__price">Стереть всё локально</div>
                </div>
            `;
            const nukeBtn = document.createElement("button");
            nukeBtn.className = "shop-item__btn shop-item__btn--unequip";
            nukeBtn.textContent = "Стереть";
            nukeBtn.addEventListener("click", () => {
                if (confirm("Точно стереть всё?")) {
                    localStorage.removeItem(STORAGE_KEY);
                    location.reload();
                }
            });
            nukeRow.appendChild(nukeBtn);
            list.appendChild(nukeRow);
        }
    }

    if (adminBtn) {
        adminBtn.addEventListener("click", () => {
            const uid = getMyUserId();
            if (uid !== ADMIN_ID) {
                alert(`Не админ\n\nТвой ID: ${uid}\nADMIN_ID: ${ADMIN_ID}\n\nЕсли ID верный — значит Telegram не передаёт данные`);
                return;
            }
            hideAll();
            adminPanelEl.classList.remove("hidden");
            renderAdmin();
        });
    }

    $("adminClose").addEventListener("click", () => showGame());

    document.querySelectorAll("[data-atab]").forEach(t => {
        t.addEventListener("click", () => {
            adminTab = t.dataset.atab;
            renderAdmin();
        });
    });

    // ---------- Синк с сервером ----------

    async function syncFromServer() {
        if (!isOnline()) return;

        try {
            const me = await apiFetch("/api/me");
            state.coins = me.coins;
        } catch (e) { console.warn("me:", e); }

        try {
            const data = await apiFetch("/api/inventory/granted");
            for (const it of data.items) {
                if (!state.owned.includes(it.item_id)) state.owned.push(it.item_id);
                if (it.equipped && !state.equipped) state.equipped = it.item_id;
            }
        } catch (e) { console.warn("inv:", e); }

        save();
        render();
    }

    // ---------- Старт ----------

    applyDecay();
    checkSleepOnLoad();
    if (!state.petName) showOnboarding();
    else showGame();
    if (isSleeping()) startSleepTicker();
    save();
    syncFromServer();
})();