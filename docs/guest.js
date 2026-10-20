(() => {
    function waitForApp() {
        return new Promise((resolve) => {
            const check = () => { if (window.App) resolve(window.App); else setTimeout(check, 50); };
            check();
        });
    }

    let App = null;
    const $ = (id) => document.getElementById(id);

    async function openGuestScreen(targetUserId) {
        const screen = $("guestScreen");
        const ownerEl = $("guestOwnerName");
        const spriteEl = $("guestPetSprite");
        const hatEl = $("guestPetHat");
        const stackEl = $("guestPetStack");
        const petBtn = $("guestPetBtn");
        const backBtn = $("guestBackBtn");

        const setStat = (key, value) => {
            const clamped = Math.max(0, Math.min(100, value));
            const bar = $(`guest-bar-${key}`);
            const num = $(`guest-num-${key}`);
            bar.style.width = `${clamped}%`;
            bar.classList.toggle("warn", clamped <= 30 && clamped > 15);
            bar.classList.toggle("crit", clamped <= 15);
            num.textContent = clamped;
            num.classList.toggle("warn", clamped <= 30 && clamped > 15);
            num.classList.toggle("crit", clamped <= 15);
            return clamped;
        };

        backBtn.onclick = () => {
            $("menuScreen").classList.remove("hidden");
            screen.classList.add("hidden");
        };

        try {
            const data = await App.apiFetch(`/api/visit/${targetUserId}`);

            ownerEl.textContent = data.owner_username || "Гость";
            setStat("hunger", data.hunger);
            setStat("happiness", data.happiness);
            setStat("energy", data.energy);
            setStat("cleanliness", data.cleanliness);

            spriteEl.src = data.happiness >= 80
                ? "public/sprites/happy.png"
                : data.hunger <= 30
                    ? "public/sprites/hungry.png"
                    : data.cleanliness <= 30
                        ? "public/sprites/dirty.png"
                        : "public/sprites/idle.png";

            if (data.hat_item_id) {
                hatEl.src = `public/items/${data.hat_item_id}.png`;
                hatEl.classList.remove("hidden");
            } else {
                hatEl.removeAttribute("src");
                hatEl.classList.add("hidden");
            }

            App.hideAll();
            screen.classList.remove("hidden");
        } catch (e) {
            App.notify("Не удалось открыть питомца: " + e.message);
            return;
        }

        petBtn.onclick = async () => {
            if (petBtn.disabled) return;
            petBtn.disabled = true;

            try {
                const result = await App.apiFetch(`/api/visit/${targetUserId}/pet`, {
                    method: "POST",
                });

                setStat("happiness", result.new_happiness);
                App.playSound("pet");

                const heart = document.createElement("div");
                heart.className = "floating-heart";
                heart.textContent = ["❤️", "💖", "✨"][Math.floor(Math.random() * 3)];
                heart.style.left = `${45 + Math.random() * 10}%`;
                heart.style.top = "45%";
                stackEl.appendChild(heart);
                setTimeout(() => heart.remove(), 1000);
            } catch (e) {
                App.notify("Не удалось погладить: " + e.message);
            } finally {
                petBtn.disabled = false;
            }
        };
    }

    function bind() {
        $("visitFriendBtn").addEventListener("click", async () => {
            const name = $("guestNameInput").value.trim();
            if (!name) return App.notify("Введи имя питомца");
            
            const btn = $("visitFriendBtn");
            const originalText = btn.textContent;
            btn.textContent = "...";
            btn.disabled = true;

            try {
                // Стучимся в новый эндпоинт поиска по имени
                const res = await App.apiFetch(`/api/visit/search/${encodeURIComponent(name)}`);
                $("guestNameInput").value = ""; // Очищаем поле
                openGuestScreen(res.user_id);   // Открываем гостя по ID
            } catch (e) {
                if (e.message.includes("404")) {
                    App.notify("Питомец с таким именем не найден");
                } else {
                    App.notify("Ошибка: " + e.message);
                }
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    async function init() {
        App = await waitForApp();
        bind();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();