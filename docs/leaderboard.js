(() => {
    function waitForApp() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.App) resolve(window.App);
                else setTimeout(check, 50);
            };
            check();
        });
    }

    let App = null;
    let game = "blockblast";
    let level = "easy";

    const $ = (id) => document.getElementById(id);

    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function updateTabs() {
        document.querySelectorAll("[data-lgame]").forEach(t => {
            t.classList.toggle("shop__tab--active", t.dataset.lgame === game);
        });
        document.querySelectorAll("[data-ltab]").forEach(t => {
            t.classList.toggle("shop__tab--active", t.dataset.ltab === level);
        });
        const levelTabs = $("lbLevelTabs");
        if (levelTabs) {
            levelTabs.style.display = (game === "clicker") ? "none" : "grid";
        }
    }

    async function load() {
        const list = $("leaderboardList");
        list.innerHTML = '<div class="shop-empty">Загрузка…</div>';
        if (!App.isOnline()) {
            list.innerHTML = '<div class="shop-empty">Открой через Telegram</div>';
            return;
        }

        let url;
        if (game === "blockblast") url = "/api/blockblast/leaderboard?level=" + level;
        else if (game === "clicker") url = "/api/clicker/leaderboard";
        else if (game === "sudoku") url = "/api/sudoku/leaderboard?level=" + level;

        try {
            const data = await App.apiFetch(url);
            list.innerHTML = "";
            if (!data.leaderboard || data.leaderboard.length === 0) {
                list.innerHTML = '<div class="shop-empty">Пока никого. Будь первым!</div>';
                return;
            }
            for (const e of data.leaderboard) {
                const row = document.createElement("div");
                row.className = "lb-item";
                if (e.is_me) row.classList.add("lb-item--me");
                if (e.rank === 1) row.classList.add("lb-item--top1");
                if (e.rank === 2) row.classList.add("lb-item--top2");
                if (e.rank === 3) row.classList.add("lb-item--top3");
                const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : e.rank;

                let scoreText;
                if (game === "sudoku") scoreText = formatTime(e.score);
                else scoreText = e.score;

                row.innerHTML = `<div class="lb-item__rank">${medal}</div>
                    <div class="lb-item__info"><div class="lb-item__name">${e.pet_name}${e.is_me ? ' <span class="lb-item__you">(ты)</span>' : ""}</div></div>
                    <div class="lb-item__score">${scoreText}</div>`;
                list.appendChild(row);
            }
            if (data.my_entry) {
                const sep = document.createElement("div");
                sep.className = "lb-separator";
                list.appendChild(sep);
                const row = document.createElement("div");
                row.className = "lb-item lb-item--me";
                let scoreText;
                if (game === "sudoku") scoreText = formatTime(data.my_entry.score);
                else scoreText = data.my_entry.score;
                row.innerHTML = `<div class="lb-item__rank">${data.my_entry.rank}</div>
                    <div class="lb-item__info"><div class="lb-item__name">${data.my_entry.pet_name} <span class="lb-item__you">(ты)</span></div></div>
                    <div class="lb-item__score">${scoreText}</div>`;
                list.appendChild(row);
            }
        } catch (e) {
            list.innerHTML = '<div class="shop-empty">Ошибка: ' + e.message + '</div>';
        }
    }

    function open() {
        App.hideAll();
        $("leaderboard").classList.remove("hidden");
        game = "blockblast";
        level = "easy";
        updateTabs();
        load();
    }

    function bind() {
        $("chooseLeaderboard").addEventListener("click", open);
        $("leaderboardClose").addEventListener("click", () => App.openGameChooser());

        document.querySelectorAll("[data-lgame]").forEach(t => {
            t.addEventListener("click", () => {
                game = t.dataset.lgame;
                updateTabs();
                load();
            });
        });
        document.querySelectorAll("[data-ltab]").forEach(t => {
            t.addEventListener("click", () => {
                level = t.dataset.ltab;
                updateTabs();
                load();
            });
        });
    }

    async function init() {
        App = await waitForApp();
        bind();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();