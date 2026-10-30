(() => {
  'use strict';
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const N = 15, CELL = 30, MARGIN = 22;
  const statusEl = document.getElementById('status');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovText = document.getElementById('ovText');
  const ovBtns = document.getElementById('ovBtns');
  const recordEl = document.getElementById('record');

  const BLACK = 1, WHITE = 2;
  let board, history, turn, over;
  let stats = { w: 0, l: 0 };
  try { stats = Object.assign(stats, JSON.parse(localStorage.getItem('gomoku_stats') || '{}')); } catch (e) {}
  updateRecord();

  // ===== 工具 =====
  function inb(x, y) { return x >= 0 && x < N && y >= 0 && y < N; }

  function reset() {
    board = Array.from({ length: N }, () => Array(N).fill(0));
    history = [];
    turn = BLACK;
    over = false;
    hideOverlay();
    setStatus();
    draw();
  }

  function setStatus(msg) {
    if (msg) { statusEl.textContent = msg; return; }
    if (over) return;
    statusEl.textContent = turn === BLACK ? '轮到你（黑棋）' : 'AI 思考中…';
  }

  // ===== 落子 =====
  function place(x, y, color) {
    board[y][x] = color;
    history.push({ x, y, color });
    draw();
    if (checkWin(x, y, color)) {
      over = true;
      onWin(color);
      return true;
    }
    if (history.length === N * N) {
      over = true;
      showOverlay('🤝 平局', '棋盘已满', [['再来一局', reset, 'primary']]);
      return true;
    }
    return false;
  }

  function checkWin(x, y, color) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx, dy] of dirs) {
      let count = 1;
      for (const s of [1, -1]) {
        let i = 1;
        while (inb(x + dx * i * s, y + dy * i * s) && board[y + dy * i * s][x + dx * i * s] === color) { count++; i++; }
      }
      if (count >= 5) return true;
    }
    return false;
  }

  function onWin(color) {
    if (color === BLACK) {
      stats.w++; persistStats();
      showOverlay('🎉 你赢了！', `恭喜击败 AI · 共 ${history.length} 手`, [['再来一局', reset, 'primary']]);
    } else {
      stats.l++; persistStats();
      showOverlay('🤖 AI 获胜', '再接再厉，下次一定！', [['再来一局', reset, 'primary']]);
    }
  }

  function persistStats() {
    try { localStorage.setItem('gomoku_stats', JSON.stringify(stats)); } catch (e) {}
    updateRecord();
  }
  function updateRecord() { recordEl.textContent = `人机战绩：${stats.w}胜 ${stats.l}负`; }

  // ===== AI =====
  function lineScore(count, open) {
    if (count >= 5) return 1000000;
    if (open === 0) return 0;
    switch (count) {
      case 1: return open === 2 ? 20 : 6;
      case 2: return open === 2 ? 120 : 20;
      case 3: return open === 2 ? 1200 : 120;
      case 4: return open === 2 ? 30000 : 2500;
    }
    return 0;
  }

  // 评估在 (x,y) 落 color 的价值
  function evaluatePoint(x, y, color) {
    let total = 0;
    for (const [dx, dy] of [[1,0],[0,1],[1,1],[1,-1]]) {
      let count = 1, open = 0;
      let i = 1;
      while (inb(x + dx * i, y + dy * i) && board[y + dy * i][x + dx * i] === color) { count++; i++; }
      if (inb(x + dx * i, y + dy * i) && board[y + dy * i][x + dx * i] === 0) open++;
      i = 1;
      while (inb(x - dx * i, y - dy * i) && board[y - dy * i][x - dx * i] === color) { count++; i++; }
      if (inb(x - dx * i, y - dy * i) && board[y - dy * i][x - dx * i] === 0) open++;
      total += lineScore(count, open);
    }
    return total;
  }

  function aiMove() {
    if (over) return;
    // 候选：已有棋子附近 2 格内的空点
    const cand = new Set();
    let hasStone = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!board[y][x]) continue;
      hasStone = true;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (inb(nx, ny) && !board[ny][nx]) cand.add(ny * N + nx);
      }
    }
    if (!hasStone) { place(7, 7, WHITE); return; }

    let bestScore = -1, bestX = 7, bestY = 7;
    cand.forEach(v => {
      const x = v % N, y = Math.floor(v / N);
      const attack = evaluatePoint(x, y, WHITE);
      const defend = evaluatePoint(x, y, BLACK);
      const s = attack * 1.15 + defend;
      if (s > bestScore) { bestScore = s; bestX = x; bestY = y; }
    });
    const done = place(bestX, bestY, WHITE);
    if (!done) {
      turn = BLACK;          // Bug 修复：AI 落子后把回合交还给玩家
      setStatus();
    }
  }

  // ===== 交互 =====
  function onBoardClick(e) {
    if (over) return;
    if (turn !== BLACK) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const mx = (e.clientX - rect.left) * scale, my = (e.clientY - rect.top) * scale;
    const x = Math.round((mx - MARGIN) / CELL), y = Math.round((my - MARGIN) / CELL);
    if (!inb(x, y) || board[y][x]) return;
    const done = place(x, y, turn);
    if (done) return;
    turn = turn === BLACK ? WHITE : BLACK;
    setStatus();
    if (turn === WHITE) setTimeout(aiMove, 300);
  }

  function undo() {
    if (over || history.length === 0) return;
    // 人机模式一次撤销两步（AI + 玩家）
    const steps = 2;
    for (let s = 0; s < steps && history.length; s++) {
      const last = history.pop();
      board[last.y][last.x] = 0;
    }
    turn = BLACK;
    setStatus();
    draw();
  }

  // ===== 绘制 =====
  function draw() {
    // 棋盘底
    ctx.fillStyle = '#f7ecd4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 网格
    ctx.strokeStyle = 'rgba(110,80,50,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const p = MARGIN + i * CELL;
      ctx.beginPath(); ctx.moveTo(MARGIN, p); ctx.lineTo(MARGIN + (N - 1) * CELL, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, MARGIN); ctx.lineTo(p, MARGIN + (N - 1) * CELL); ctx.stroke();
    }
    // 星位
    ctx.fillStyle = 'rgba(110,80,50,0.7)';
    [[3,3],[11,3],[3,11],[11,11],[7,7]].forEach(([x,y]) => {
      ctx.beginPath();
      ctx.arc(MARGIN + x * CELL, MARGIN + y * CELL, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // 棋子
    history.forEach((m, i) => {
      const cx = MARGIN + m.x * CELL, cy = MARGIN + m.y * CELL;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      const g = ctx.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, 13);
      if (m.color === BLACK) { g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#111'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c8c8c8'); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (m.color === WHITE) {
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
      }
      // 最后一手标记
      if (i === history.length - 1) {
        ctx.fillStyle = '#e94560';
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      }
    });
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

  // ===== 事件 =====
  canvas.addEventListener('click', onBoardClick);
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('restartBtn').addEventListener('click', reset);

  reset();
})();
