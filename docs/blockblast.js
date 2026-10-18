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

    const ENERGY_COST = 15;
    const LEVELS = {
        easy:   { emoji: "🟢", size: 6,  winScore: 300,
            rewards: [{min:500,coins:15},{min:300,coins:10},{min:200,coins:7},{min:150,coins:5},{min:100,coins:3},{min:50,coins:2},{min:0,coins:0}] },
        normal: { emoji: "🟡", size: 8,  winScore: 500,
            rewards: [{min:500,coins:40},{min:300,coins:25},{min:200,coins:17},{min:150,coins:11},{min:100,coins:7},{min:50,coins:4},{min:0,coins:1}] },
        hard:   { emoji: "🔴", size: 10, winScore: 700,
            rewards: [{min:500,coins:75},{min:300,coins:50},{min:200,coins:35},{min:150,coins:22},{min:100,coins:14},{min:50,coins:8},{min:0,coins:3}] },
    };

    const SHAPES_EASY = [
        [[0,0]],[[0,0],[1,0]],[[0,0],[0,1]],
        [[0,0],[1,0],[2,0]],[[0,0],[0,1],[0,2]],
        [[0,0],[1,0],[0,1]],[[0,0],[0,1],[1,1]],[[0,0],[1,0],[1,1]],
    ];
    const SHAPES_MEDIUM = [...SHAPES_EASY,
        [[0,0],[1,0],[2,0],[3,0]],[[0,0],[0,1],[0,2],[0,3]],
        [[0,0],[1,0],[0,1],[1,1]],[[0,0],[1,0],[2,0],[0,1]],[[0,0],[0,1],[0,2],[1,2]],
    ];
    const SHAPES_HARD = [...SHAPES_MEDIUM,
        [[0,0],[1,0],[2,0],[3,0],[4,0]],[[0,0],[0,1],[0,2],[0,3],[0,4]],
        [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],[[0,0],[1,0],[2,0],[3,0],[0,1]],[[0,0],[1,0],[2,0],[2,1],[2,2]],
    ];

    const COLORS = ["#ff6b6b","#feca57","#48dbfb","#1dd1a1","#a29bfe","#fd79a8","#54a0ff","#26de81"];

    function getShapePool(levelKey, sc) {
        if (levelKey === "easy") return SHAPES_EASY;
        if (levelKey === "normal") return sc < 150 ? SHAPES_EASY : SHAPES_MEDIUM;
        if (sc < 150) return SHAPES_EASY;
        if (sc < 350) return SHAPES_MEDIUM;
        return SHAPES_HARD;
    }
    function calcReward(levelKey, sc) {
        const lvl = LEVELS[levelKey];
        if (!lvl) return 0;
        for (const r of lvl.rewards) if (sc >= r.min) return r.coins;
        return 0;
    }

    let App = null;
    let grid = [], shapes = [], score = 0, active = false;
    let drag = null, ghostEl = null;
    let level = "normal", size = 8;
    let infinite = false, finished = false;

    const $ = (id) => document.getElementById(id);

    function newShape() {
        const pool = getShapePool(level, score);
        const cells = pool[Math.floor(Math.random() * pool.length)];
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        return { cells, color };
    }
    function reset() {
        size = LEVELS[level].size;
        grid = Array.from({ length: size }, () => Array(size).fill(null));
        shapes = [newShape(), newShape(), newShape()];
        score = 0; active = true; drag = null; finished = false;
    }
    function cleanupGhosts() {
        document.querySelectorAll(".bb-ghost").forEach(el => el.remove());
        document.querySelectorAll(".bb-shape--dragging").forEach(el => el.classList.remove("bb-shape--dragging"));
        ghostEl = null; drag = null;
    }

    function render() {
        const g = $("bbGrid");
        g.innerHTML = "";
        g.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
        g.style.gridTemplateRows = `repeat(${size}, 1fr)`;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const c = document.createElement("div");
            c.className = "bb-cell";
            c.dataset.x = x; c.dataset.y = y;
            if (grid[y][x]) { c.classList.add("bb-cell--filled"); c.style.background = grid[y][x]; }
            g.appendChild(c);
        }
        const s = $("bbShapes");
        s.innerHTML = "";
        shapes.forEach((sh, i) => {
            const slot = document.createElement("div");
            slot.className = "bb-shape";
            if (!sh) { slot.classList.add("bb-shape--used"); s.appendChild(slot); return; }
            const maxX = Math.max(...sh.cells.map(c => c[0])) + 1;
            const maxY = Math.max(...sh.cells.map(c => c[1])) + 1;
            const occ = new Set(sh.cells.map(c => `${c[0]},${c[1]}`));
            const inner = document.createElement("div");
            inner.className = "bb-shape__grid";
            inner.style.gridTemplateColumns = `repeat(${maxX}, var(--bb-mini, 16px))`;
            inner.style.gridTemplateRows = `repeat(${maxY}, var(--bb-mini, 16px))`;
            for (let y = 0; y < maxY; y++) for (let x = 0; x < maxX; x++) {
                const mini = document.createElement("div");
                mini.className = "bb-mini";
                if (occ.has(`${x},${y}`)) { mini.classList.add("bb-mini--filled"); mini.style.background = sh.color; }
                inner.appendChild(mini);
            }
            slot.appendChild(inner);
            slot.addEventListener("pointerdown", (e) => startDrag(i, e));
            s.appendChild(slot);
        });
        $("bbScore").textContent = score;
        $("bbEnergy").textContent = Math.round(App.getState().stats.energy);
        const modeEl = $("bbLevelIcon");
        if (modeEl) modeEl.textContent = infinite ? "♾" : LEVELS[level].emoji;
    }

    function canPlace(cells, ox, oy) {
        for (const [dx, dy] of cells) {
            const x = ox + dx, y = oy + dy;
            if (x < 0 || y < 0 || x >= size || y >= size) return false;
            if (grid[y][x]) return false;
        }
        return true;
    }
    function getCell(cx, cy) {
        const el = document.elementFromPoint(cx, cy);
        if (!el || !el.classList.contains("bb-cell")) return null;
        const x = parseInt(el.dataset.x, 10), y = parseInt(el.dataset.y, 10);
        if (isNaN(x) || isNaN(y)) return null;
        return { x, y };
    }
    function clearPreview() {
        document.querySelectorAll(".bb-cell--preview-ok, .bb-cell--preview-bad").forEach(el => {
            el.classList.remove("bb-cell--preview-ok", "bb-cell--preview-bad");
            const x = parseInt(el.dataset.x, 10), y = parseInt(el.dataset.y, 10);
            el.style.background = grid[y] && grid[y][x] ? grid[y][x] : "";
        });
    }
    function showPreview(cells, ox, oy, valid, color) {
        clearPreview();
        for (const [dx, dy] of cells) {
            const x = ox + dx, y = oy + dy;
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            const el = document.querySelector(`.bb-cell[data-x="${x}"][data-y="${y}"]`);
            if (!el) continue;
            el.classList.add(valid ? "bb-cell--preview-ok" : "bb-cell--preview-bad");
            if (valid) el.style.background = color;
        }
    }

    function startDrag(idx, evt) {
        if (!active) return;
        const sh = shapes[idx];
        if (!sh) return;
        evt.preventDefault();
        const slotEl = evt.currentTarget;
        const miniEl = slotEl.querySelector(".bb-mini--filled");
        const miniSize = miniEl ? miniEl.getBoundingClientRect().width + 2 : 16;
        const maxX = Math.max(...sh.cells.map(c => c[0])) + 1;
        const maxY = Math.max(...sh.cells.map(c => c[1])) + 1;
        const mins = slotEl.querySelectorAll(".bb-shape__grid .bb-mini");
        let gx = Math.floor((maxX - 1) / 2), gy = maxY - 1;
        const arr = [];
        for (let y = 0; y < maxY; y++) for (let x = 0; x < maxX; x++) arr.push({ x, y });
        for (let i = 0; i < mins.length; i++) {
            const r = mins[i].getBoundingClientRect();
            if (evt.clientX >= r.left && evt.clientX <= r.right && evt.clientY >= r.top && evt.clientY <= r.bottom) {
                gx = arr[i].x; gy = arr[i].y; break;
            }
        }
        drag = { idx, shape: sh, miniSize, gx, gy, lastHover: null };
        const ghost = document.createElement("div");
        ghost.className = "bb-ghost";
        const occ = new Set(sh.cells.map(c => `${c[0]},${c[1]}`));
        ghost.style.gridTemplateColumns = `repeat(${maxX}, ${miniSize}px)`;
        ghost.style.gridTemplateRows = `repeat(${maxY}, ${miniSize}px)`;
        for (let y = 0; y < maxY; y++) for (let x = 0; x < maxX; x++) {
            const mini = document.createElement("div");
            mini.className = "bb-mini";
            if (occ.has(`${x},${y}`)) { mini.classList.add("bb-mini--filled"); mini.style.background = sh.color; }
            ghost.appendChild(mini);
        }
        document.body.appendChild(ghost);
        ghostEl = ghost;
        moveGhost(evt.clientX, evt.clientY);
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onEnd);
        document.addEventListener("pointercancel", onEnd);
        slotEl.classList.add("bb-shape--dragging");
        App.hapticImpact("light");
    }
    function moveGhost(cx, cy) {
        if (!ghostEl || !drag) return;
        const { miniSize, gx, gy } = drag;
        ghostEl.style.left = (cx - gx * miniSize - miniSize / 2) + "px";
        ghostEl.style.top = (cy - gy * miniSize - miniSize / 2) + "px";
    }
    function onMove(evt) {
        if (!drag || !ghostEl) return;
        moveGhost(evt.clientX, evt.clientY);
        const cell = getCell(evt.clientX, evt.clientY);
        if (!cell) { clearPreview(); drag.lastHover = null; return; }
        const ox = cell.x - drag.gx;
        const oy = cell.y - drag.gy;
        const valid = canPlace(drag.shape.cells, ox, oy);
        showPreview(drag.shape.cells, ox, oy, valid, drag.shape.color);
        drag.lastHover = { ox, oy, valid };
    }
    function onEnd() {
        if (!drag) return;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onEnd);
        document.removeEventListener("pointercancel", onEnd);
        document.querySelectorAll(".bb-shape--dragging").forEach(el => el.classList.remove("bb-shape--dragging"));
        if (ghostEl) { ghostEl.remove(); ghostEl = null; }
        clearPreview();
        const hover = drag.lastHover;
        const idx = drag.idx;
        drag = null;
        if (hover && hover.valid) placeShape(idx, hover.ox, hover.oy);
    }

    function placeShape(idx, ox, oy) {
        const sh = shapes[idx];
        if (!sh) return;
        if (!canPlace(sh.cells, ox, oy)) return;
        for (const [dx, dy] of sh.cells) grid[oy + dy][ox + dx] = sh.color;
        score += sh.cells.length;
        shapes[idx] = null;
        clearLines();
        if (shapes.every(s => s === null)) shapes = [newShape(), newShape(), newShape()];
        render();
        App.playSound("place", 0.4);
        App.hapticImpact("light");
        const winScore = LEVELS[level].winScore;
        if (!infinite && score >= winScore && !finished) {
            finished = true;
            active = false;
            onWin();
            return;
        }
        if (!anyFits()) onGameOver();
    }
    function clearLines() {
        const toClear = new Set();
        for (let y = 0; y < size; y++) if (grid[y].every(c => c)) for (let x = 0; x < size; x++) toClear.add(`${x},${y}`);
        for (let x = 0; x < size; x++) {
            let full = true;
            for (let y = 0; y < size; y++) if (!grid[y][x]) { full = false; break; }
            if (full) for (let y = 0; y < size; y++) toClear.add(`${x},${y}`);
        }
        if (toClear.size === 0) return;
        let lines = 0;
        for (let y = 0; y < size; y++) { let f = true; for (let x = 0; x < size; x++) if (!toClear.has(`${x},${y}`)) { f = false; break; } if (f) lines++; }
        for (let x = 0; x < size; x++) { let f = true; for (let y = 0; y < size; y++) if (!toClear.has(`${x},${y}`)) { f = false; break; } if (f) lines++; }
        for (const key of toClear) { const [x, y] = key.split(",").map(Number); grid[y][x] = null; }
        score += lines * 50;
        if (lines > 0) App.hapticNotify("success");
    }
    function anyFits() {
        for (const sh of shapes) {
            if (!sh) continue;
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (canPlace(sh.cells, x, y)) return true;
        }
        return false;
    }

    async function finishAndReward() {
        cleanupGhosts();
        active = false;
        let coins = calcReward(level, score);
        const state = App.getState();
        if (App.isOnline()) {
            try {
                const res = await App.apiFetch("/api/game/reward", { method: "POST", body: JSON.stringify({ game: "blockblast", score, level }) });
                coins = res.reward;
                state.coins = res.coins;
            } catch (e) { if (e.message === "OFFLINE") state.coins += coins; }
        } else state.coins += coins;
        state.gamesPlayed += 1;
        App.save();
        return coins;
    }
    async function submitInfiniteScore() {
        if (!App.isOnline() || score === 0) return;
        try {
            await App.apiFetch("/api/blockblast/score", {
                method: "POST",
                body: JSON.stringify({ level, score, pet_name: App.getState().petName || "Питомец" }),
            });
        } catch (e) { console.warn(e); }
    }
    async function onGameOver() {
        const coins = await finishAndReward();
        if (infinite) { await submitInfiniteScore(); infinite = false; }
        $("bbResultReward").textContent = `+${coins} 💰`;
        $("bbResultSub").textContent = `Счёт: ${score}`;
        $("bbResult").classList.remove("hidden");
    }
    async function onWin() {
        App.playSound("win");
        const coins = await finishAndReward();
        const winScore = LEVELS[level].winScore;
        $("bbWinReward").textContent = `+${coins} 💰`;
        $("bbWinSub").textContent = `Счёт: ${score} (цель: ${winScore})`;
        $("bbWinModal").classList.remove("hidden");
    }

    function openLevels() {
        if (App.getState().sleepUntil && Date.now() < App.getState().sleepUntil) return;
        App.hideAll();
        $("bbLevels").classList.remove("hidden");
    }
    function start(levelKey, inf) {
        cleanupGhosts();
        const state = App.getState();
        if (state.sleepUntil && Date.now() < state.sleepUntil) return;
        if (state.stats.energy < ENERGY_COST) { App.notify(`Нужно ${ENERGY_COST} энергии.`); return; }
        state.stats.energy -= ENERGY_COST;
        level = levelKey;
        infinite = !!inf;
        App.save();
        App.hideAll();
        $("blockblast").classList.remove("hidden");
        reset();
        render();
    }

    function bind() {
        document.querySelectorAll(".level-btn[data-level]").forEach(btn => {
            btn.addEventListener("click", () => start(btn.dataset.level, false));
        });
        $("bbLevelsCancel").addEventListener("click", () => App.openGameChooser());
        $("chooseBlock").addEventListener("click", openLevels);

        $("bbCancel").addEventListener("click", () => {
            cleanupGhosts();
            if (!active || score === 0) { App.showGame(); return; }
            const reward = calcReward(level, score);
            $("bbExitReward").textContent = `+${reward} 💰`;
            $("bbExitSub").textContent = `Счёт: ${score}` + (infinite ? " · счёт уйдёт в лидерборд" : "");
            $("bbExitModal").classList.remove("hidden");
        });
        $("bbExitNo").addEventListener("click", () => $("bbExitModal").classList.add("hidden"));
        $("bbExitYes").addEventListener("click", async () => {
            $("bbExitModal").classList.add("hidden");
            await finishAndReward();
            if (infinite) { await submitInfiniteScore(); infinite = false; }
            App.showGame();
        });
        $("bbResultBack").addEventListener("click", () => App.showGame());
        $("bbResultRepeat").addEventListener("click", () => {
            const state = App.getState();
            if (state.stats.energy < ENERGY_COST) { App.notify(`Нужно ${ENERGY_COST} энергии.`); return; }
            state.stats.energy -= ENERGY_COST;
            App.save();
            $("bbResult").classList.add("hidden");
            infinite = false;
            reset();
            render();
        });
        $("bbWinExit").addEventListener("click", () => { $("bbWinModal").classList.add("hidden"); App.showGame(); });
        $("bbWinRepeat").addEventListener("click", () => {
            const state = App.getState();
            if (state.stats.energy < ENERGY_COST) { App.notify(`Нужно ${ENERGY_COST} энергии.`); return; }
            state.stats.energy -= ENERGY_COST;
            App.save();
            $("bbWinModal").classList.add("hidden");
            infinite = false;
            reset();
            render();
        });
        $("bbWinInfinite").addEventListener("click", () => {
            const state = App.getState();
            if (state.stats.energy < ENERGY_COST) { App.notify(`Нужно ${ENERGY_COST} энергии.`); return; }
            state.stats.energy -= ENERGY_COST;
            App.save();
            $("bbWinModal").classList.add("hidden");
            infinite = true;
            reset();
            render();
        });

        window.addEventListener("pointercancel", cleanupGhosts);
        window.addEventListener("blur", cleanupGhosts);
    }

    function cleanup() { cleanupGhosts(); active = false; }

    async function init() {
        App = await waitForApp();
        bind();
        App.registerCleanup(cleanup);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();