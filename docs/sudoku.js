(() => {
    function waitForApp() {
        return new Promise((resolve) => {
            const check = () => { if (window.App) resolve(window.App); else setTimeout(check, 50); };
            check();
        });
    }

    function sdShuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function sdGenSolved() {
        const g = Array.from({ length: 9 }, () => Array(9).fill(0));
        function ok(r, c, v) {
            for (let i = 0; i < 9; i++) if (g[r][i] === v || g[i][c] === v) return false;
            const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (g[br+i][bc+j] === v) return false;
            return true;
        }
        function fill() {
            for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
                if (g[r][c] === 0) {
                    const nums = sdShuffle([1,2,3,4,5,6,7,8,9]);
                    for (const v of nums) {
                        if (ok(r, c, v)) {
                            g[r][c] = v;
                            if (fill()) return true;
                            g[r][c] = 0;
                        }
                    }
                    return false;
                }
            }
            return true;
        }
        fill();
        return g;
    }

    function sdCountSol(grid, limit) {
        let count = 0;
        function ok(g, r, c, v) {
            for (let i = 0; i < 9; i++) if (g[r][i] === v || g[i][c] === v) return false;
            const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (g[br+i][bc+j] === v) return false;
            return true;
        }
        function solve(g) {
            for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
                if (g[r][c] === 0) {
                    for (let v = 1; v <= 9; v++) {
                        if (ok(g, r, c, v)) {
                            g[r][c] = v;
                            solve(g);
                            g[r][c] = 0;
                            if (count >= limit) return;
                        }
                    }
                    return;
                }
            }
            count++;
        }
        solve(grid.map(r => r.slice()));
        return count;
    }

    function sdRemoveCells(solved, keep) {
        const p = solved.map(r => r.slice());
        const cells = [];
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cells.push([r, c]);
        sdShuffle(cells);
        let removed = 81 - keep;
        for (const [r, c] of cells) {
            if (removed <= 0) break;
            const b = p[r][c];
            p[r][c] = 0;
            if (sdCountSol(p, 2) !== 1) p[r][c] = b;
            else removed--;
        }
        return p;
    }

    function sdGenerate(keep) {
        const solved = sdGenSolved();
        return { solved, puzzle: sdRemoveCells(solved, keep) };
    }

    const SD_LEVELS = {
        easy:   { emoji: "🟢", keep: 40, maxMistakes: 5, reward: 10, code: 1 },
        normal: { emoji: "🟡", keep: 32, maxMistakes: 3, reward: 25, code: 2 },
        hard:   { emoji: "🔴", keep: 26, maxMistakes: 3, reward: 50, code: 3 },
    };
    const SD_ENERGY_COST = 15;
    const SD_HINT_COST = 20;

    let App = null;
    let sdCurrentLevel = "easy";
    let sdSolved = null, sdPuzzle = null, sdUserGrid = null, sdNotes = null;
    let sdSelected = null;         // {r, c} для cell-first
    let sdSelectedNum = null;      // 1..9 для num-first
    let sdInputMode = "cell-first"; // "cell-first" | "num-first"
    let sdMistakes = 0, sdNotesMode = false, sdHistory = [], sdActive = false;

    const $ = (id) => document.getElementById(id);

    function sdIsConflict(r, c, v) {
        for (let i = 0; i < 9; i++) {
            if (i !== c && sdUserGrid[r][i] === v) return true;
            if (i !== r && sdUserGrid[i][c] === v) return true;
        }
        const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            const rr = br + i, cc = bc + j;
            if ((rr !== r || cc !== c) && sdUserGrid[rr][cc] === v) return true;
        }
        return false;
    }

    function sdIsSolved() {
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
            if (sdUserGrid[r][c] !== sdSolved[r][c]) return false;
        }
        return true;
    }

    function sdRender() {
        const gridEl = $("sdGrid");
        gridEl.innerHTML = "";

        // Активная цифра для подсветки
        let activeNum = null;
        if (sdInputMode === "num-first" && sdSelectedNum !== null) {
            activeNum = sdSelectedNum;
        } else if (sdInputMode === "cell-first" && sdSelected) {
            const v = sdUserGrid[sdSelected.r][sdSelected.c];
            if (v !== 0) activeNum = v;
        }

        const selR = sdSelected ? sdSelected.r : -1;
        const selC = sdSelected ? sdSelected.c : -1;
        const selBr = selR >= 0 ? Math.floor(selR / 3) * 3 : -1;
        const selBc = selC >= 0 ? Math.floor(selC / 3) * 3 : -1;

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = document.createElement("div");
                cell.className = "sd-cell";
                if (c === 3 || c === 6) cell.classList.add("sd-cell--bl");
                if (r === 3 || r === 6) cell.classList.add("sd-cell--bt");

                // Крестовина выбранной клетки
                if (selR >= 0) {
                    if (r === selR || c === selC) cell.classList.add("sd-cell--crosshair");
                    if (r >= selBr && r < selBr + 3 && c >= selBc && c < selBc + 3) {
                        cell.classList.add("sd-cell--crosshair");
                    }
                }

                const v = sdUserGrid[r][c];
                const isFixed = sdPuzzle[r][c] !== 0;

                // Все клетки с активной цифрой — ярко
                if (activeNum !== null && v === activeNum) {
                    cell.classList.add("sd-cell--same-num");
                }

                if (isFixed) {
                    cell.classList.add("sd-cell--fixed");
                    cell.textContent = v;
                } else if (v !== 0) {
                    cell.classList.add("sd-cell--user");
                    if (sdIsConflict(r, c, v)) cell.classList.add("sd-cell--wrong");
                    cell.textContent = v;
                } else if (sdNotes[r][c].size > 0) {
                    const notesDiv = document.createElement("div");
                    notesDiv.className = "sd-cell__notes";
                    for (let n = 1; n <= 9; n++) {
                        const span = document.createElement("span");
                        span.textContent = sdNotes[r][c].has(n) ? n : "";
                        notesDiv.appendChild(span);
                    }
                    cell.appendChild(notesDiv);
                }

                if (sdSelected && sdSelected.r === r && sdSelected.c === c) {
                    cell.style.boxShadow = "inset 0 0 0 2px #5288c1";
                }

                cell.addEventListener("click", () => sdCellClick(r, c));
                gridEl.appendChild(cell);
            }
        }

        $("sdMistakes").textContent = sdMistakes;
        $("sdMax").textContent = SD_LEVELS[sdCurrentLevel].maxMistakes;
        $("sdLevel").textContent = SD_LEVELS[sdCurrentLevel].emoji;

        sdUpdateNumpad();
    }

    function sdUpdateNumpad() {
        const np = $("sdNumpad");
        const btns = np.querySelectorAll(".sd-num[data-n]");
        // Считаем, сколько раз каждая цифра стоит на поле
        const counts = { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0 };
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
            const v = sdUserGrid[r][c];
            if (v >= 1 && v <= 9) counts[v]++;
        }
        btns.forEach(btn => {
            const n = parseInt(btn.dataset.n, 10);
            if (counts[n] >= 9) {
                btn.classList.add("sd-num--done");
                btn.disabled = true;
            } else {
                btn.classList.remove("sd-num--done");
                btn.disabled = false;
            }
            if (sdInputMode === "num-first" && sdSelectedNum === n) {
                btn.classList.add("sd-num--active");
            } else {
                btn.classList.remove("sd-num--active");
            }
        });
    }

    function sdBuildNumpad() {
        const np = $("sdNumpad");
        np.innerHTML = "";
        for (let n = 1; n <= 9; n++) {
            const btn = document.createElement("button");
            btn.className = "sd-num";
            btn.dataset.n = n;
            btn.textContent = n;
            btn.addEventListener("click", () => sdNumpadClick(n));
            np.appendChild(btn);
        }
        const erase = document.createElement("button");
        erase.className = "sd-num sd-num--erase";
        erase.dataset.n = "0";
        erase.textContent = "⌫";
        erase.addEventListener("click", () => sdNumpadClick(0));
        np.appendChild(erase);
    }

    function sdCellClick(r, c) {
        if (!sdActive) return;
        const isFixed = sdPuzzle[r][c] !== 0;

        if (sdInputMode === "num-first") {
            if (sdSelectedNum === null) return;
            if (isFixed) return;
            sdInsertNum(r, c, sdSelectedNum);
        } else {
            if (isFixed) return;
            sdSelected = { r, c };
            sdRender();
        }
    }

    function sdNumpadClick(n) {
        if (!sdActive) return;
        if (sdInputMode === "num-first") {
            if (n === 0) {
                // В num-first "⌫" — снять выделение цифры
                sdSelectedNum = null;
                sdRender();
                return;
            }
            sdSelectedNum = (sdSelectedNum === n) ? null : n;
            sdRender();
        } else {
            if (!sdSelected) return;
            sdInsertNum(sdSelected.r, sdSelected.c, n);
        }
    }

    function sdInsertNum(r, c, n) {
        if (!sdActive) return;
        if (sdPuzzle[r][c] !== 0) return;

        if (sdNotesMode && n !== 0) {
            sdHistory.push({ r, c, prev: sdUserGrid[r][c], prevNotes: new Set(sdNotes[r][c]) });
            if (sdNotes[r][c].has(n)) sdNotes[r][c].delete(n);
            else sdNotes[r][c].add(n);
            sdRender();
            return;
        }

        sdHistory.push({ r, c, prev: sdUserGrid[r][c], prevNotes: new Set(sdNotes[r][c]) });
        sdNotes[r][c].clear();

        if (n === 0) {
            sdUserGrid[r][c] = 0;
        } else {
            sdUserGrid[r][c] = n;
            if (sdIsConflict(r, c, n)) {
                sdMistakes++;
                if (sdMistakes >= SD_LEVELS[sdCurrentLevel].maxMistakes) {
                    sdRender();
                    sdLose();
                    return;
                }
            } else if (sdIsSolved()) {
                sdRender();
                sdWin();
                return;
            }
        }
        App.hapticImpact("light");
        sdRender();
    }

    async function sdStart(levelKey) {
        if (!App) return;
        const state = App.getState();
        if (state.sleepUntil && Date.now() < state.sleepUntil) return;
        if (state.stats.energy < SD_ENERGY_COST) {
            App.notify(`Нужно ${SD_ENERGY_COST} энергии.`);
            return;
        }
        state.stats.energy -= SD_ENERGY_COST;
        App.save();

        sdCurrentLevel = levelKey;
        sdMistakes = 0;
        sdNotesMode = false;
        sdSelected = null;
        sdSelectedNum = null;
        sdHistory = [];

        const cfg = SD_LEVELS[levelKey];
        const { solved, puzzle } = sdGenerate(cfg.keep);
        sdSolved = solved;
        sdPuzzle = puzzle;
        sdUserGrid = puzzle.map(r => r.slice());
        sdNotes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));

        sdActive = true;
        App.hideAll();
        $("sudoku").classList.remove("hidden");
        $("sdMode").textContent = sdInputMode === "cell-first" ? "🎯 Клетка" : "🔢 Цифра";
        sdRender();
    }

    function sdWin() {
        sdActive = false;
        const cfg = SD_LEVELS[sdCurrentLevel];
        const reward = cfg.reward;
        const state = App.getState();
        state.coins += reward;
        App.save();
        App.hapticNotify("success");

        if (App.isOnline()) {
            App.apiFetch("/api/game/reward", {
                method: "POST",
                body: JSON.stringify({ game: "sudoku", score: cfg.code }),
            }).then(res => { state.coins = res.coins; App.save(); }).catch(() => {});
        }

        $("sdModalTitle").textContent = "🎉 Решено!";
        $("sdModalReward").textContent = `+${reward} 💰`;
        $("sdModalReward").classList.remove("loss");
        $("sdModalSub").textContent = `Ошибок: ${sdMistakes}`;
        $("sdModal").classList.remove("hidden");
    }

    function sdLose() {
        sdActive = false;
        App.hapticNotify("error");
        $("sdModalTitle").textContent = "😔 Проигрыш";
        $("sdModalReward").textContent = `Ошибок: ${sdMistakes}`;
        $("sdModalReward").classList.add("loss");
        $("sdModalSub").textContent = `Награда не начислена`;
        $("sdModal").classList.remove("hidden");
    }

    function sdBindUI() {
        $("chooseSudoku").addEventListener("click", () => {
            if (!App) return;
            const state = App.getState();
            if (state.sleepUntil && Date.now() < state.sleepUntil) return;
            App.hideAll();
            $("sudokuLevels").classList.remove("hidden");
        });

        $("sudokuLevelsCancel").addEventListener("click", () => App.openGameChooser());

        document.querySelectorAll(".level-btn[data-slevel]").forEach(btn => {
            btn.addEventListener("click", () => sdStart(btn.dataset.slevel));
        });

        $("sdBack").addEventListener("click", () => {
            if (!sdActive) { App.openGameChooser(); return; }
            if (confirm("Выйти? Прогресс этой партии потеряется.")) {
                sdActive = false;
                App.openGameChooser();
            }
        });

        $("sdUndo").addEventListener("click", () => {
            if (!sdActive || sdHistory.length === 0) return;
            const last = sdHistory.pop();
            sdUserGrid[last.r][last.c] = last.prev;
            sdNotes[last.r][last.c] = last.prevNotes;
            sdRender();
            App.hapticImpact("light");
        });

        $("sdNotes").addEventListener("click", () => {
            sdNotesMode = !sdNotesMode;
            $("sdNotes").classList.toggle("sd-action--active", sdNotesMode);
            App.hapticImpact("light");
        });

        // ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА
        $("sdMode").addEventListener("click", () => {
            if (sdInputMode === "cell-first") {
                sdInputMode = "num-first";
                sdSelectedNum = null;
            } else {
                sdInputMode = "cell-first";
                sdSelected = null;
            }
            $("sdMode").textContent = sdInputMode === "cell-first" ? "🎯 Клетка" : "🔢 Цифра";
            sdRender();
            App.hapticImpact("light");
        });

        $("sdHint").addEventListener("click", async () => {
            if (!sdActive) return;
            const state = App.getState();
            if (state.coins < SD_HINT_COST) { App.notify(`Подсказка стоит ${SD_HINT_COST} 💰`); return; }
            const empties = [];
            for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
                if (sdUserGrid[r][c] !== sdSolved[r][c]) empties.push({ r, c });
            }
            if (empties.length === 0) return;
            const pick = empties[Math.floor(Math.random() * empties.length)];

            if (App.isOnline()) {
                try {
                    const res = await App.apiFetch("/api/coins/spend", { method: "POST", body: JSON.stringify({ amount: SD_HINT_COST }) });
                    state.coins = res.coins;
                } catch (e) {
                    if (e.message !== "OFFLINE") { App.notify("Ошибка: " + e.message); return; }
                    state.coins -= SD_HINT_COST;
                }
            } else state.coins -= SD_HINT_COST;

            sdHistory.push({ r: pick.r, c: pick.c, prev: sdUserGrid[pick.r][pick.c], prevNotes: new Set(sdNotes[pick.r][pick.c]) });
            sdUserGrid[pick.r][pick.c] = sdSolved[pick.r][pick.c];
            sdNotes[pick.r][pick.c].clear();
            App.save();

            if (sdIsSolved()) { sdRender(); sdWin(); return; }
            sdRender();
            App.hapticImpact("light");
        });

        $("sdModalBack").addEventListener("click", () => {
            $("sdModal").classList.add("hidden");
            App.openGameChooser();
        });
        $("sdModalRepeat").addEventListener("click", () => {
            $("sdModal").classList.add("hidden");
            sdStart(sdCurrentLevel);
        });
    }

    async function init() {
        App = await waitForApp();
        sdBuildNumpad();
        sdBindUI();
    }

    window.Sudoku = { init };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();