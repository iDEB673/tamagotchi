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
    const $ = (id) => document.getElementById(id);

    function makeAvatar(text) {
        const avatar = document.createElement("div");
        avatar.className = "friend-card__avatar";
        const value = (text || "🐾").trim();
        avatar.textContent = value.charAt(0).toUpperCase() || "🐾";
        avatar.title = value;
        return avatar;
    }

    function renderEmpty(container, text) {
        container.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "shop-empty";
        empty.textContent = text;
        container.appendChild(empty);
    }

    function renderFriends(friends) {
        const list = $("friendsList");
        list.innerHTML = "";

        if (!friends.length) {
            renderEmpty(list, "Пока нет друзей");
            return;
        }

        for (const friend of friends) {
            const petName = friend.pet_name || "Питомец";
            const row = document.createElement("div");
            row.className = "friend-card";
            row.style.cursor = "pointer";
            row.addEventListener("click", () => {
                App.openGuestScreen(friend.id);
            });

            const info = document.createElement("div");
            info.className = "friend-card__info";

            const name = document.createElement("div");
            name.className = "friend-card__name";
            name.textContent = friend.username || "Игрок";

            const sub = document.createElement("div");
            sub.className = "friend-card__sub";
            sub.textContent = `🐾 ${petName}`;

            info.appendChild(name);
            info.appendChild(sub);
            row.appendChild(makeAvatar(petName));
            row.appendChild(info);
            list.appendChild(row);
        }
    }

    function renderRequests(requests) {
        const list = $("requestsList");
        list.innerHTML = "";

        if (!requests.length) {
            renderEmpty(list, "Новых заявок нет");
            return;
        }

        for (const request of requests) {
            const petName = request.pet_name || "Питомец";
            const row = document.createElement("div");
            row.className = "friend-card";

            const info = document.createElement("div");
            info.className = "friend-card__info";

            const name = document.createElement("div");
            name.className = "friend-card__name";
            name.textContent = request.sender_name || "Игрок";

            const sub = document.createElement("div");
            sub.className = "friend-card__sub";
            sub.textContent = `🐾 ${petName}`;

            info.appendChild(name);
            info.appendChild(sub);

            const actions = document.createElement("div");
            actions.className = "friend-card__actions";

            const acceptBtn = document.createElement("button");
            acceptBtn.className = "friend-card__btn friend-card__btn--accept";
            acceptBtn.textContent = "✅ Принять";
            acceptBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                await acceptRequest(request.request_id);
            });

            const declineBtn = document.createElement("button");
            declineBtn.className = "friend-card__btn friend-card__btn--decline";
            declineBtn.textContent = "❌ Отклонить";
            declineBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                await declineRequest(request.request_id);
            });

            actions.appendChild(acceptBtn);
            actions.appendChild(declineBtn);
            row.appendChild(makeAvatar(request.sender_name || petName));
            row.appendChild(info);
            row.appendChild(actions);
            list.appendChild(row);
        }
    }

    async function loadFriends() {
        try {
            const data = await App.apiFetch("/api/friends");
            renderFriends(data.friends || []);
            renderRequests(data.requests || []);
        } catch (e) {
            App.notify("Не удалось загрузить друзей: " + e.message);
        }
    }

    function setTab(tabName) {
        document.querySelectorAll(".shop__tab[data-ftab]").forEach((tab) => {
            tab.classList.toggle(
                "shop__tab--active",
                tab.dataset.ftab === tabName
            );
        });

        $("friendsList").style.display = tabName === "friends" ? "" : "none";
        $("requestsList").style.display = tabName === "requests" ? "" : "none";

        const formBlock = $("requestFormBlock");
        if (formBlock) {
            formBlock.style.display = tabName === "requests" ? "block" : "none";
        }
    }

    async function acceptRequest(id) {
        try {
            await App.apiFetch(`/api/friends/accept/${id}`, { method: "POST" });
            await loadFriends();
            setTab("friends");
            App.hapticNotify?.("success");
        } catch (e) {
            App.notify("Не удалось принять заявку: " + e.message);
        }
    }

    async function declineRequest(id) {
        try {
            await App.apiFetch(`/api/friends/decline/${id}`, { method: "POST" });
            await loadFriends();
            App.hapticNotify?.("success");
        } catch (e) {
            App.notify("Не удалось отклонить заявку: " + e.message);
        }
    }

    function openFriends() {
        App.hideAll();
        $("friendsScreen").classList.remove("hidden");
        setTab("friends");
        loadFriends();
    }
    
    async function sendFriendRequest() {
        const input = $("friendPetNameInput");
        const btn = $("sendFriendRequestBtn");

        if (btn.disabled) return;

        const name = input.value.trim();

        if (!name) {
            App.notify("Введи имя питомца");
            return;
        }

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "...";

        try {
            // 1. Ищем питомца по имени
            const searchRes = await App.apiFetch(`/api/visit/search/${encodeURIComponent(name)}`);
            const targetId = searchRes.user_id;

            // 2. Отправляем заявку
            await App.apiFetch(`/api/friends/request/${targetId}`, {
                method: "POST",
            });

            App.notify("Заявка отправлена!");
            App.hapticNotify?.("success");
            input.value = "";
            await loadFriends();
        } catch (e) {
            if (e.message.includes("404")) {
                App.notify("Питомец с таким именем не найден");
            } else if (e.message.includes("409")) {
                App.notify("Заявка уже отправлена или вы уже друзья");
            } else if (e.message.includes("400")) {
                App.notify("Это твой питомец 🙂");
            } else {
                App.notify("Ошибка: " + e.message);
            }
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    function bind() {
        $("menuFriends").addEventListener("click", openFriends);

        $("friendsBackBtn").addEventListener("click", () => {
            App.hideAll();
            $("menuScreen").classList.remove("hidden");
        });

        document.querySelectorAll(".shop__tab[data-ftab]").forEach((tab) => {
            tab.addEventListener("click", () => setTab(tab.dataset.ftab));
        });

        $("sendFriendRequestBtn").addEventListener("click", sendFriendRequest);

        $("friendPetNameInput").addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                sendFriendRequest();
            }
        });
    }

    async function init() {
        App = await waitForApp();
        window.App.openFriends = openFriends;
        bind();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
