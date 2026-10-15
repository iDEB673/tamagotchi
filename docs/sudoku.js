(() => {
    // ---------- Ожидание window.App ----------

    function waitForApp() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.App) resolve(window.App);
                else setTimeout(check, 50);
            };
            check();
        });
    }

    // ---------- Судоку-логика ----------

    function sdShuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function sdGenerateSolved() {
        const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
        function isValid(g, r, c, v) {
            for (let i = 0; i < 9; i++) {
                if (g[r][i] === v || g[i][c] === v) return false;
            }
            const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                if (g[br + i][bc + j] === v) return false;
            }
            return true;
        }
        function fill(g) {
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (g[r][c] === 0) {
                        const nums = sdShuffle([1,2,3,4,5,6,7,8,9]);
                        for (const v of nums) {
                            if (isValid(g, r, c, v)) {
                                g[r][c] = v;
                                if (fill(g)) return true;
                                g[r][c] = 0;
                            }
                        }
                        return false;
                    }
                }
            }
            return true;
        }
        fill(grid);
        return grid;
    }

    function sdCountSolutions(grid, limit) {
        let count = 0;
        function isValidPlace(g, r, c, v) {
            for (let i = 0; i < 9; i++) {
                if (g[r][i] === v || g[i][c] === v) return false;
            }
            const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                if (g[br + i][bc + j] === v) return false;
            }
            return true;
        }
        function solve(g) {
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (g[r][c] === 0) {
                        for (let v = 1; v <= 9; v++) {
                            if (isValidPlace(g, r, c, v)) {
                                g[r][c] = v;
                                solve(g);
                                g[r][c] = 0;
                                if (count >= limit) return;
                            }
                        }
                        return;
                    }
                }
            }
            count++;
        }
        solve(grid.map(r => r.slice()));
        return count;
    }

    function sdRemoveCells(solved, keepCount) {
        const puzzle = solved.map(r => r.slice());
        const cells = [];
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cells.push([r, c]);
        sdShuffle(cells);
        let removed = 81 - keepCount;
        for (const [r, c] of cells) {
            if (removed <= 0) break;
            const backup = puzzle[r][c];
            puzzle[r][c] = 0;
            if (sdCountSolutions(puzzle, 2) !== 1) {
                puzzle[r][c] = backup;
            } else {
                removed--;
            }
        }
        return puzzle;
    }

    function sdGenerate(keepCount) {
        const solved = sdGenerateSolved();
        const puzzle = sdRemoveCells(solved, keepCount);
        return { solved, puzzle };
    }

    // ---------- Уровни ----------

    const SD_LEVELS = {
        easy:   { emoji: "🟢", keep: 40, maxMistakes: 5, reward: 10, code: 1 },
        normal: { emoji: "🟡", keep: 32, maxMistakes: 3, reward: 25, code: 2 },
        hard:   { emoji: "🔴", keep: 26, maxMistakes: 3, reward: 50, code: 3 },
    };
    const SD_ENERGY_COST = 15;
    const SD_HINT_COST = 20;

    // ---------- Состояние ----------

    let App = null;
    let sdCurrentLevel = "easy";
    let sdSolved = null;
    let sdPuzzle = null;
    let sdUserGrid = null;
    let sdNotes = null;
    let sdSelected = null;
    let sdMistakes = 0;
    let sdNotesMode = false;
    let sdHistory = [];
    let sdActive = false;

    const $ = (id) => document.getElementById(id);

    // ---------- Рендер ----------

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

    function sdRender() {
        const gridEl = $("sdGrid");
        gridEl.innerHTML = "";

        const selectedVal = sdSelected && sdUserGrid[sdSelected.r][sdSelected.c]
            ? sdUserGrid[sdSelected.r][sdSelected.c]
            : null;

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = document.createElement("div");
                cell.className = "sd-cell";
                if (c === 3 || c === 6) cell.classList.add("sd-cell--bl");
                if (r === 3 || r === 6) cell.classList.add("sd-cell--bt");

                const v = sdUserGrid[r][c];
                const isFixed = sdPuzzle[r][c] !== 0;

                if (isFixed) {
                    cell.classList.add("sd-cell--fixed");
                    cell.textContent = v;
                } else if (v !== 0) {
                    cell.classList.add("sd-cell--user");
                    if (selectedVal && v === selectedVal) cell.classList.add("sd-cell--highlight");
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

                if (!isFixed) {
                    cell.addEventListener("click", () => {
                        if (!sdActive) return;
                        sdSelected = { r, c };
                        sdRender();
                    });
                }

                gridEl.appendChild(cell);
            }
        }

        $("sdMistakes").textContent = sdMistakes;
        $("sdMax").textContent = SD_LEVELS[sdCurrentLevel].maxMistakes;
        $("sdLevel").textContent = SD_LEVELS[sdCurrentLevel].emoji;
    }

    // ---------- NumPad ----------

    function sdBuildNumpad() {
        const np = $("sdNumpad");
        np.innerHTML = "";
        for (let n = 1; n <= 9; n++) {
            const btn = document.createElement("button");
            btn.className = "sd-num";
            btn.textContent = n;
            btn.addEventListener("click", () => sdInputNumber(n));
            np.appendChild(btn);
        }
        const erase = document.createElement("button");
        erase.className = "sd-num sd-num--erase";
        erase.textContent = "⌫";
        erase.addEventListener("click", () => sdInputNumber(0));
        np.appendChild(erase);
    }

    function sdInputNumber(n) {
        if (!sdActive || !sdSelected) return;
        const { r, c } = sdSelected;
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

    function sdIsSolved() {
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
            if (sdUserGrid[r][c] !== sdSolved[r][c]) return false;
        }
        return true;
    }

    // ---------- Партия ----------

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

    // ---------- Кнопки ----------

    function sdBindUI() {
        // Открыть экран выбора сложности
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

        $("sdHint").addEventListener("click", async () => {
            if (!sdActive) return;
            const state = App.getState();
            if (state.coins < SD_HINT_COST) {
                App.notify(`Подсказка стоит ${SD_HINT_COST} 💰`);
                return;
            }
            const empties = [];
            for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
                if (sdUserGrid[r][c] !== sdSolved[r][c]) empties.push({ r, c });
            }
            if (empties.length === 0) return;
            const pick = empties[Math.floor(Math.random() * empties.length)];

            if (App.isOnline()) {
                try {
                    const res = await App.apiFetch("/api/coins/spend", {
                        method: "POST",
                        body: JSON.stringify({ amount: SD_HINT_COST }),
                    });
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

    // ---------- Init ----------

    async function init() {
        App = await waitForApp();
        sdBuildNumpad();
        sdBindUI();
    }

    window.Sudoku = { init };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();