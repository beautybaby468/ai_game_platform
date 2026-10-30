(() => {
  'use strict';
  const board = document.getElementById('board');
  const mineLeftEl = document.getElementById('mineLeft');
  const timerEl = document.getElementById('timer');
  const scoreEl = document.getElementById('score');
  const faceBtn = document.getElementById('faceBtn');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovText = document.getElementById('ovText');
  const ovBtns = document.getElementById('ovBtns');
  const bestInfo = document.getElementById('bestInfo');

  // 难度：建议通关时间 / 基础分
  const DIFFS = {
    easy:   { name: '初级', rows: 9,  cols: 9,  mines: 10, time: 60,  base: 1000 },
    medium: { name: '中级', rows: 16, cols: 16, mines: 40, time: 180, base: 3000 },
    hard:   { name: '高级', rows: 16, cols: 30, mines: 99, time: 400, base: 8000 },
  };
  // 自定义配置（时间/基础分按规模自动推算）
  let customCfg = { rows: 12, cols: 16, mines: 30 };
  function getCfg() {
    if (diff !== 'custom') return DIFFS[diff];
    const cells = customCfg.rows * customCfg.cols;
    return {
      name: '自定义',
      rows: customCfg.rows, cols: customCfg.cols, mines: customCfg.mines,
      time: Math.max(30, Math.round(customCfg.mines * 4 + cells / 2)),
      base: Math.round(customCfg.mines * 70 + cells * 4),
    };
  }

  let diff = 'easy';
  let cells = [];          // {mine, num, revealed, flag}
  let rows, cols, mines;
  let started = false, over = false;
  let timer = 0, timerInt = null;
  let revealedCount = 0;

  // 最佳成绩：{easy: {score, time}, ...}
  let best = {};
  try { best = JSON.parse(localStorage.getItem('minesweeper_best') || '{}'); } catch (e) {}

  function curScore() {
    // 得分 = 基础分 + 时间奖励（比建议时间每快 1 秒 +10）
    const d = getCfg();
    return d.base + Math.max(0, d.time - timer) * 10;
  }

  // ===== 构建 =====
  function newGame() {
    const c = getCfg();
    rows = c.rows; cols = c.cols; mines = c.mines;
    cells = Array.from({ length: rows * cols }, () => ({ mine: false, num: 0, revealed: false, flag: false }));
    started = false; over = false;
    timer = 0; clearInterval(timerInt);
    timerEl.textContent = '0';
    scoreEl.textContent = '0';
    revealedCount = 0;
    mineLeftEl.textContent = mines;
    faceBtn.textContent = '🙂';
    hideOverlay();
    updateBestInfo();
    render();
  }

  function idx(r, c) { return r * cols + c; }
  function neighbors(i) {
    const r = Math.floor(i / cols), c = i % cols;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(idx(nr, nc));
    }
    return out;
  }

  // 首次点击后布雷（首击及其周围不放雷）
  function placeMines(safe) {
    const banned = new Set([safe, ...neighbors(safe)]);
    let placed = 0;
    while (placed < mines) {
      const i = Math.floor(Math.random() * rows * cols);
      if (banned.has(i) || cells[i].mine) continue;
      cells[i].mine = true;
      placed++;
    }
    cells.forEach((cell, i) => {
      cell.num = neighbors(i).filter(n => cells[n].mine).length;
    });
  }

  function startTimer() {
    clearInterval(timerInt);
    timerInt = setInterval(() => {
      timer++;
      timerEl.textContent = timer;
      // 实时显示潜在得分（基础分 + 剩余建议时间奖励）
      scoreEl.textContent = curScore();
    }, 1000);
  }

  // ===== 交互 =====
  function reveal(i) {
    if (over) return;
    const cell = cells[i];
    if (cell.flag || cell.revealed) return;

    if (!started) { placeMines(i); started = true; startTimer(); }

    if (cell.mine) return boom(i);

    // BFS 翻开
    const queue = [i];
    while (queue.length) {
      const j = queue.pop();
      const c = cells[j];
      if (c.revealed || c.flag) continue;
      c.revealed = true;
      revealedCount++;
      if (c.num === 0 && !c.mine) neighbors(j).forEach(n => { if (!cells[n].revealed) queue.push(n); });
    }
    render();
    checkWin();
  }

  function chord(i) {
    const cell = cells[i];
    if (!cell.revealed || !cell.num) return;
    const ns = neighbors(i);
    const flags = ns.filter(n => cells[n].flag).length;
    if (flags !== cell.num) return;
    for (const n of ns) {
      if (!cells[n].flag && !cells[n].revealed) {
        if (cells[n].mine) return boom(n);
        reveal(n);
      }
    }
  }

  function toggleFlag(i) {
    if (over) return;
    const cell = cells[i];
    if (cell.revealed) return;
    if (!started) { /* 未开始也允许插旗，但不启动计时 */ }
    cell.flag = !cell.flag;
    const left = mines - cells.filter(c => c.flag).length;
    mineLeftEl.textContent = left;
    render();
  }

  function boom(i) {
    over = true;
    clearInterval(timerInt);
    cells.forEach(c => { if (c.mine) c.revealed = true; });
    faceBtn.textContent = '😵';
    scoreEl.textContent = 0;
    render(i);
    showOverlay('💥 踩到地雷了', `用时 ${timer} 秒 · 得分 0`, [['再来一局', newGame, 'primary']]);
  }

  function checkWin() {
    if (revealedCount === rows * cols - mines) {
      over = true;
      clearInterval(timerInt);
      faceBtn.textContent = '😎';
      // 剩余雷自动插旗
      cells.forEach(c => { if (c.mine) c.flag = true; });
      mineLeftEl.textContent = 0;
      // 得分 = 基础分 + 时间奖励（比建议时间每快 1 秒 +10）
      const d = getCfg();
      const finalScore = curScore();
      scoreEl.textContent = finalScore;
      let record = false;
      if (diff !== 'custom') {
        const prev = best[diff];
        if (!prev || finalScore > (prev.score || 0)) {
          best[diff] = { score: finalScore, time: prev ? Math.min(timer, prev.time || timer) : timer };
          try { localStorage.setItem('minesweeper_best', JSON.stringify(best)); } catch (e) {}
          record = true;
        }
      }
      const prev = best[diff];
      const timeRecord = diff !== 'custom' && (!prev || timer < (prev.time || Infinity));
      updateBestInfo();
      render();
      const bonus = finalScore - d.base;
      showOverlay('🎉 扫雷成功！',
        `${d.name} · 用时 <b>${timer}</b> 秒（建议 ${d.time} 秒）<br>` +
        `基础分 ${d.base} + 时间奖励 ${bonus} = <b>${finalScore}</b> 分` +
        (record ? '<br>🏆 得分新纪录！' : '') + (timeRecord && !record ? '<br>⏱ 用时新纪录！' : '') +
        (diff === 'custom' ? '<br>（自定义模式不计入纪录）' : ''),
        [['再玩一次', newGame, 'primary']]);
    }
  }

  // ===== 渲染 =====
  function render(boomIdx) {
    board.className = 'board ' + diff;
    if (diff === 'custom') {
      // 自定义：按列数自适应格子尺寸
      const cell = Math.max(14, Math.min(30, Math.floor(580 / cols)));
      board.style.setProperty('--cell', cell + 'px');
    }
    board.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    // 复用子元素
    while (board.children.length > cells.length) board.removeChild(board.lastChild);
    while (board.children.length < cells.length) {
      const b = document.createElement('button');
      b.className = 'cell';
      b.addEventListener('click', onCellClick);
      b.addEventListener('contextmenu', onCellRightClick);
      board.appendChild(b);
    }
    cells.forEach((cell, i) => {
      const el = board.children[i];
      let cls = 'cell';
      let text = '';
      if (cell.revealed) {
        cls += ' revealed';
        if (cell.mine) { text = '💣'; if (i === boomIdx) cls += ' mine-boom'; }
        else if (cell.num) { text = cell.num; cls += ' n' + cell.num; }
      } else if (cell.flag) {
        cls += ' flag'; text = '🚩';
      }
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== text) el.textContent = text;
    });
  }

  function onCellClick(e) {
    const i = [...board.children].indexOf(e.currentTarget);
    if (cells[i].revealed) chord(i);
    else reveal(i);
  }
  function onCellRightClick(e) {
    e.preventDefault();
    const i = [...board.children].indexOf(e.currentTarget);
    toggleFlag(i);
  }

  // ===== 覆盖层 =====
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
    if (diff === 'custom') { bestInfo.textContent = '自定义模式不计入纪录'; return; }
    const t = best[diff];
    bestInfo.textContent = t && t.score ? `🏆 ${DIFFS[diff].name}最高分：${t.score}（${t.time}s）` : '';
  }

  // ===== 自定义面板 =====
  const customPanel = document.getElementById('customPanel');
  function applyCustom() {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const cells = clamp(parseInt(document.getElementById('cRows').value, 10) || 12, 5, 24) *
                  clamp(parseInt(document.getElementById('cCols').value, 10) || 16, 5, 40);
    const r = clamp(parseInt(document.getElementById('cRows').value, 10) || 12, 5, 24);
    const c = clamp(parseInt(document.getElementById('cCols').value, 10) || 16, 5, 40);
    let m = clamp(parseInt(document.getElementById('cMines').value, 10) || 30, 1, Math.floor(cells * 0.35));
    document.getElementById('cRows').value = r;
    document.getElementById('cCols').value = c;
    document.getElementById('cMines').value = m;
    customCfg = { rows: r, cols: c, mines: m };
    newGame();
  }
  document.getElementById('customApply').addEventListener('click', applyCustom);

  // ===== 事件 =====
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      diff = b.dataset.d;
      if (diff === 'custom') {
        customPanel.classList.remove('hidden');   // 展开面板，等玩家点"开始"
        return;
      }
      customPanel.classList.add('hidden');
      newGame();
    });
  });
  faceBtn.addEventListener('click', () => { if (diff !== 'custom') newGame(); else applyCustom(); });
  board.addEventListener('contextmenu', e => e.preventDefault());

  newGame();
})();
