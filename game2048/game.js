(() => {
  'use strict';
  const N = 4;
  const board = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const undoLeftEl = document.getElementById('undoLeft');
  const undoBtn = document.getElementById('undoBtn');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovText = document.getElementById('ovText');
  const ovBtns = document.getElementById('ovBtns');

  const MILESTONES = [2048, 4096, 8192];
  let grid, score, best = 0, over;
  let undoLeft, history, milestones;   // 撤销限 3 步 · 里程碑
  try { best = parseInt(localStorage.getItem('2048_best') || '0', 10) || 0; } catch (e) {}
  bestEl.textContent = best;

  function emptyGrid() { return Array.from({ length: N }, () => Array(N).fill(0)); }

  function addRandom() {
    const empties = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) empties.push([r, c]);
    if (!empties.length) return;
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    changed.add(r * N + c);
  }

  const changed = new Set();

  function reset() {
    grid = emptyGrid();
    score = 0; over = false;
    undoLeft = 3; history = []; milestones = new Set();
    changed.clear();
    addRandom(); addRandom();
    scoreEl.textContent = '0';
    updateUndoUI();
    hideOverlay();
    render();
  }

  // ===== 撤销（限 3 步）=====
  function updateUndoUI() {
    undoLeftEl.textContent = undoLeft;
    undoBtn.style.opacity = (undoLeft > 0 && history.length) ? '1' : '.45';
  }

  function undo() {
    if (undoLeft <= 0 || history.length === 0) return;
    const snap = history.pop();
    grid = snap.grid;
    score = snap.score;
    undoLeft--;
    over = false;
    changed.clear();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) changed.add(r * N + c);
    scoreEl.textContent = score;
    updateUndoUI();
    hideOverlay();
    render();
  }

  // 单行向左滑 + 合并
  function slideLine(line) {
    const arr = line.filter(v => v);
    const out = [];
    let gained = 0;
    for (let i = 0; i < arr.length; i++) {
      if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
        out.push(arr[i] * 2);
        gained += arr[i] * 2;
        i++;
      } else out.push(arr[i]);
    }
    while (out.length < N) out.push(0);
    const moved = out.some((v, i) => v !== line[i]);
    return { out, gained, moved };
  }

  function move(dir) {
    if (over) return;
    let movedAny = false, gainedTotal = 0;
    changed.clear();

    // 移动前快照（供撤销）
    const snapshot = { grid: grid.map(r => r.slice()), score };

    const get = (i) => {
      // 抽取第 i 行/列，统一为"向索引 0 滑动"的方向
      const line = [];
      for (let j = 0; j < N; j++) {
        let r, c;
        if (dir === 'left')      { r = i; c = j; }
        else if (dir === 'right'){ r = i; c = N - 1 - j; }
        else if (dir === 'up')   { r = j; c = i; }
        else                     { r = N - 1 - j; c = i; }
        line.push(grid[r][c]);
      }
      return line;
    };
    const set = (i, line) => {
      for (let j = 0; j < N; j++) {
        let r, c;
        if (dir === 'left')      { r = i; c = j; }
        else if (dir === 'right'){ r = i; c = N - 1 - j; }
        else if (dir === 'up')   { r = j; c = i; }
        else                     { r = N - 1 - j; c = i; }
        if (grid[r][c] !== line[j]) changed.add(r * N + c);
        grid[r][c] = line[j];
      }
    };

    for (let i = 0; i < N; i++) {
      const { out, gained, moved } = slideLine(get(i));
      if (moved) movedAny = true;
      gainedTotal += gained;
      set(i, out);
    }

    if (!movedAny) return;
    history.push(snapshot);
    updateUndoUI();
    score += gainedTotal;
    scoreEl.textContent = score;
    if (score > best) { best = score; bestEl.textContent = best; try { localStorage.setItem('2048_best', String(best)); } catch (e) {} }

    addRandom();
    render();
    checkEnd();
  }

  function render() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const idx = r * N + c;
      const el = board.children[idx];
      const v = grid[r][c];
      const cls = 'tile' + (v ? (v <= 2048 ? ' v' + v : ' vmax') : '');
      if (el.className !== cls) el.className = cls;
      el.textContent = v || '';
      if (changed.has(idx)) {
        el.classList.remove('pop');
        void el.offsetWidth;           // 重启动画
        el.classList.add('pop');
      }
    }
  }

  function canMove() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!grid[r][c]) return true;
      if (c + 1 < N && grid[r][c] === grid[r][c + 1]) return true;
      if (r + 1 < N && grid[r][c] === grid[r + 1][c]) return true;
    }
    return false;
  }

  function checkEnd() {
    // 里程碑：合成 2048 / 4096 / 8192 各弹一次，达成后可继续冲击更高
    for (const m of MILESTONES) {
      if (!milestones.has(m) && grid.some(row => row.includes(m))) {
        milestones.add(m);
        const next = MILESTONES[MILESTONES.indexOf(m) + 1];
        showOverlay(`🎉 达成 ${m}！`,
          `当前分数 <b>${score}</b><br>${next ? `继续冲击 ${next}！` : '你已经登峰造极！'}`,
          [['继续游戏', hideOverlay, ''], ['新游戏', reset, 'btn-sec']]);
        return;
      }
    }
    // 失败：棋盘满且无相邻可合并
    if (!canMove()) {
      over = true;
      showOverlay('💥 无路可走', `最终分数 <b>${score}</b><br>最高分 ${best}`,
        [['再来一局', reset, ''], ...(history.length && undoLeft > 0 ? [['撤销一步', undo, 'btn-sec']] : [])]);
    }
  }

  function showOverlay(title, html, btns) {
    ovTitle.innerHTML = title; ovText.innerHTML = html;
    ovBtns.innerHTML = '';
    btns.forEach(([label, fn, cls]) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', fn);
      ovBtns.appendChild(b);
    });
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  // 16 个格子
  for (let i = 0; i < N * N; i++) {
    const d = document.createElement('div');
    d.className = 'tile';
    board.appendChild(d);
  }

  document.addEventListener('keydown', (e) => {
    const map = {
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
    };
    const dir = map[e.key];
    if (dir) { e.preventDefault(); move(dir); }
    if (e.key === 'z' || e.key === 'Z') undo();
  });

  // 触摸滑动
  let tsx = 0, tsy = 0;
  document.addEventListener('touchstart', (e) => {
    tsx = e.touches[0].clientX; tsy = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tsx;
    const dy = e.changedTouches[0].clientY - tsy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  document.getElementById('newBtn').addEventListener('click', reset);
  undoBtn.addEventListener('click', undo);

  reset();
})();
