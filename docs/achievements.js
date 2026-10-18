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

        const achievements = state.achievements || [];
        const teaCount = state.teaCount || 0;
        const owned = state.owned || [];

        const ACHS = [
            {
                id: "tea_lover",
                title: "Чайный магнат",
                desc: "Выпить 10 кружек чая",
                icon: "🍵",
                progress: `${Math.min(10, teaCount)}/10`,
                rewardId: "tea_mug",
            }
        ];

        for (const ach of ACHS) {
            const unlocked = achievements.includes(ach.id);
            const hasReward = owned.includes(ach.rewardId);
            
            const row = document.createElement("div");
            row.className = "ach-item " + (unlocked ? "ach-item--unlocked" : "ach-item--locked");
            
            let actionHtml = "";
            if (unlocked) {
                if (hasReward) {
                    actionHtml = `<div class="ach-status">✅</div>`;
                } else {
                    actionHtml = `<button class="shop-item__btn shop-item__btn--equip" id="claim_${ach.id}">Забрать</button>`;
                }
            } else {
                actionHtml = `<div class="ach-status">${ach.progress}</div>`;
            }

            row.innerHTML = `
                <div class="ach-icon">${ach.icon}</div>
                <div class="ach-info">
                    <div class="ach-title">${ach.title}</div>
                    <div class="ach-desc">${ach.desc}</div>
                </div>
                ${actionHtml}
            `;

            list.appendChild(row);

            if (unlocked && !hasReward) {
                const btn = document.getElementById(`claim_${ach.id}`);
                if (btn) {
                    btn.addEventListener("click", () => {
                        if (!state.owned.includes(ach.rewardId)) {
                            state.owned.push(ach.rewardId);
                            App.save();
                            App.notify("🎁 Награда получена! Скин добавлен в инвентарь.");
                            App.hapticNotify("success");
                            renderAchievements();
                        }
                    });
                }
            }
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