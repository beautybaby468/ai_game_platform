(() => {
  'use strict';
  const sudokuEl = document.getElementById('sudoku');
  const timerEl = document.getElementById('timer');
  const remainEl = document.getElementById('remain');
  const bestInfo = document.getElementById('bestInfo');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovText = document.getElementById('ovText');
  const ovBtns = document.getElementById('ovBtns');

  const DIFFS = { easy: 38, normal: 48, hard: 55 };
  let diff = 'easy';
  let puzzle, solution, fixed;   // puzzle 当前值(0=空), solution 全解, fixed 是否题面
  let selected = -1;
  let timer = 0, timerInt = null, started = false, over = false;

  let best = {};
  try { best = JSON.parse(localStorage.getItem('sudoku_best') || '{}'); } catch (e) {}

  // ===== 生成 =====
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function valid(m, r, c, n) {
    for (let i = 0; i < 9; i++) {
      if (m[r][i] === n || m[i][c] === n) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (m[br + i][bc + j] === n) return false;
    }
    return true;
  }

  function generateFull() {
    const m = Array.from({ length: 9 }, () => Array(9).fill(0));
    function fill(pos) {
      if (pos === 81) return true;
      const r = Math.floor(pos / 9), c = pos % 9;
      for (const n of shuffle([1,2,3,4,5,6,7,8,9])) {
        if (valid(m, r, c, n)) {
          m[r][c] = n;
          if (fill(pos + 1)) return true;
          m[r][c] = 0;
        }
      }
      return false;
    }
    fill(0);
    return m;
  }

  function makePuzzle(holes) {
    const m = solution.map(r => r.slice());
    let count = 0, guard = 0;
    while (count < holes && guard < 2000) {
      guard++;
      const r = Math.floor(Math.random() * 9), c = Math.floor(Math.random() * 9);
      if (m[r][c] === 0) continue;
      m[r][c] = 0;
      count++;
    }
    return m;
  }

  // ===== 游戏 =====
  function newGame() {
    solution = generateFull();               // 2D 完整解
    puzzle = makePuzzle(DIFFS[diff]);        // 2D 题面（挖洞基于 2D 解）
    solution = solution.flat();              // 摊平为 81 格一维数组
    puzzle = puzzle.flat();
    fixed = puzzle.map(v => v !== 0);
    selected = -1;
    over = false;
    timer = 0; clearInterval(timerInt); started = false;
    timerEl.textContent = '0';
    hideOverlay();
    updateRemain();
    updateBestInfo();
    render();
  }

  function updateRemain() {
    remainEl.textContent = puzzle.flat().filter(v => v === 0).length;
  }

  function conflicts() {
    const set = new Set();
    const groups = [];
    for (let i = 0; i < 9; i++) groups.push([...Array(9).keys()].map(j => i * 9 + j));           // 行
    for (let c = 0; c < 9; c++) groups.push([...Array(9).keys()].map(r => r * 9 + c));           // 列
    for (let b = 0; b < 9; b++) {                                                                // 宫
      const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3, g = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.push((br + i) * 9 + bc + j);
      groups.push(g);
    }
    for (const g of groups) {
      const seen = {};
      for (const i of g) {
        const v = puzzle[i];
        if (!v) continue;
        if (seen[v] !== undefined) { set.add(seen[v]); set.add(i); }
        else seen[v] = i;
      }
    }
    return set;
  }

  function input(n) {
    if (over || selected < 0) return;
    if (fixed[selected]) return;
    if (n === 0) {
      puzzle[selected] = 0;
    } else {
      puzzle[selected] = n;
      started = true;
      if (!timerInt) timerInt = setInterval(() => { timer++; timerEl.textContent = timer; }, 1000);
    }
    updateRemain();
    render();
    checkWin();
  }

  function hint() {
    if (over) return;
    let idx = selected >= 0 && !fixed[selected] && !puzzle[selected] ? selected : -1;
    if (idx < 0) {
      const empties = puzzle.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
      if (!empties.length) return;
      idx = empties[Math.floor(Math.random() * empties.length)];
    }
    puzzle[idx] = solution[idx];
    selected = idx;
    started = true;
    if (!timerInt) timerInt = setInterval(() => { timer++; timerEl.textContent = timer; }, 1000);
    updateRemain();
    render(idx);
    checkWin();
  }

  function checkWin() {
    if (puzzle.some(v => v === 0)) return;
    if (conflicts().size) return;    // 有冲突不算赢
    over = true;
    clearInterval(timerInt);
    let record = false;
    if (!best[diff] || timer < best[diff]) {
      best[diff] = timer;
      try { localStorage.setItem('sudoku_best', JSON.stringify(best)); } catch (e) {}
      record = true;
    }
    updateBestInfo();
    showOverlay('🎉 数独完成！',
      `${diffName()} · 用时 <b>${timer}</b> 秒${record ? '<br>🏆 新纪录！' : ''}`,
      [['再来一局', newGame, 'primary']]);
  }

  function diffName() { return { easy: '简单', normal: '普通', hard: '困难' }[diff]; }

  // ===== 渲染 =====
  function render(hintIdx) {
    const conf = conflicts();
    const selVal = selected >= 0 ? puzzle[selected] : 0;
    while (sudokuEl.children.length < 81) {
      const d = document.createElement('div');
      d.className = 'sc';
      d.addEventListener('click', () => {
        selected = [...sudokuEl.children].indexOf(d);
        render();
      });
      sudokuEl.appendChild(d);
    }
    for (let i = 0; i < 81; i++) {
      const el = sudokuEl.children[i];
      const v = puzzle[i];
      // 防御：v 必须是单个数字，避免数组等异常值被渲染成整行文本
      el.textContent = (typeof v === 'number' && v) ? v : '';
      let cls = 'sc';
      if (fixed[i]) cls += ' fixed';
      if (i === selected) cls += ' selected';
      else if (selVal && v === selVal) cls += ' same';
      if (conf.has(i)) cls += ' conflict';
      if (el.className !== cls) el.className = cls;
      if (i === hintIdx) { el.classList.remove('hinted'); void el.offsetWidth; el.classList.add('hinted'); }
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

  function updateBestInfo() {
    const t = best[diff];
    bestInfo.textContent = t != null ? `🏆 ${diffName()}最快：${t} 秒` : '';
  }

  // ===== 事件 =====
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      diff = b.dataset.d;
      newGame();
    });
  });
  document.querySelectorAll('.num-btn').forEach(b => {
    b.addEventListener('click', () => input(+b.dataset.n));
  });
  document.getElementById('hintBtn').addEventListener('click', hint);
  document.getElementById('newBtn').addEventListener('click', newGame);

  document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9') input(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') input(0);
    else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (selected < 0) { selected = 40; }
      else {
        const r = Math.floor(selected / 9), c = selected % 9;
        const nr = e.key === 'ArrowUp' ? Math.max(0, r - 1) : e.key === 'ArrowDown' ? Math.min(8, r + 1) : r;
        const nc = e.key === 'ArrowLeft' ? Math.max(0, c - 1) : e.key === 'ArrowRight' ? Math.min(8, c + 1) : c;
        selected = nr * 9 + nc;
      }
      render();
    }
  });

  newGame();
})();
