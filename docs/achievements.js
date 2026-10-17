(() => {
    function waitForApp() {
        return new Promise((resolve) => {
            const check = () => { if (window.App) resolve(window.App); else setTimeout(check, 50); };
            check();
        });
    }

    let App = null;
    const $ = (id) => document.getElementById(id);

    function renderAchievements() {
        const state = App.getState();
        const list = $("achList");
        list.innerHTML = "";

        // На всякий случай проверяем массивы
        const achievements = state.achievements || [];
        const teaCount = state.teaCount || 0;

        const ACHS = [
            {
                id: "tea_lover",
                title: "Чайный магнат",
                desc: "Выпить 10 кружек чая",
                icon: "🍵",
                progress: `${Math.min(10, teaCount)}/10`,
            }
        ];

        for (const ach of ACHS) {
            const unlocked = achievements.includes(ach.id);
            const row = document.createElement("div");
            row.className = "ach-item " + (unlocked ? "ach-item--unlocked" : "ach-item--locked");
            row.innerHTML = `
                <div class="ach-icon">${ach.icon}</div>
                <div class="ach-info">
                    <div class="ach-title">${ach.title}</div>
                    <div class="ach-desc">${ach.desc}</div>
                </div>
                <div class="ach-status">${unlocked ? "✅" : ach.progress}</div>
            `;
            list.appendChild(row);
        }
    }
    function bind() {
        $("openMenu").addEventListener("click", () => {
            App.hideAll();
            $("menuScreen").classList.remove("hidden");
        });
        
        $("menuCancel").addEventListener("click", () => App.showGame());
        
        $("menuShop").addEventListener("click", () => {
            App.hideAll();
            $("shop").classList.remove("hidden");
            // Триггерим рендер магазина (вызываем клик по скрытой кнопке или просто вызываем логику, если экспортирована)
            // Проще всего кликнуть по кнопке магазина, если она скрыта, но лучше вызвать функцию. 
            // Пока просто откроем экран, core.js сделает рендер через слушатель.
            document.querySelector(".shop__tab[data-tab='clothes']").click();
        });

        $("menuCasino").addEventListener("click", () => {
            App.hideAll();
            $("casino").classList.remove("hidden");
            $("casinoCoins").textContent = App.getState().coins;
        });

        $("menuAch").addEventListener("click", () => {
            App.hideAll();
            $("achievements").classList.remove("hidden");
            renderAchievements();
        });

        $("achClose").addEventListener("click", () => {
            $("menuScreen").classList.remove("hidden");
            $("achievements").classList.add("hidden");
        });
    }

    async function init() {
        App = await waitForApp();
        bind();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();