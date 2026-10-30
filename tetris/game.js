(() => {
  'use strict';

  // ===== 常量 =====
  const COLS = 10, ROWS = 20;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const CELL = canvas.width / COLS;   // 30px

  const nextCanvas = document.getElementById('next');
  const nextCtx = nextCanvas.getContext('2d');
  const holdCanvas = document.getElementById('hold');
  const holdCtx = holdCanvas.getContext('2d');
  const PCELL = 20; // 预览格尺寸

  const COLORS = {
    I: '#4fc3f7', O: '#ffd54f', T: '#ba68c8', S: '#81c784',
    Z: '#e57373', J: '#7986cb', L: '#ffb74d',
  };

  const BASE = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
  };
  const TYPES = Object.keys(BASE);

  const $ = id => document.getElementById(id);
  const scoreEl = $('score'), highEl = $('high'), linesEl = $('lines'), levelEl = $('level');
  const overlay = $('overlay'), ovTitle = $('ovTitle'), ovText = $('ovText');
  const toast = $('toast');
  const startBtn = $('startBtn'), pauseBtn = $('pauseBtn'), restartBtn = $('restartBtn');

  // ===== 状态 =====
  let board, cur, hold, canHold, bag, nextType;
  let score = 0, lines = 0, level = 1, combo = 0;
  let high = 0;
  try { high = parseInt(localStorage.getItem('tetris_high') || '0', 10) || 0; } catch (e) {}
  highEl.textContent = high;

  let running = false, paused = false, over = false;
  let dropAcc = 0, lastTime = 0;

  // ===== 等级表：累计消行每 10 行升一级，下落间隔按表（毫秒）=====
  const DROP_TABLE = [800, 720, 640, 560, 480, 400, 340, 280, 220, 160];
  function dropInterval() { return DROP_TABLE[Math.min(DROP_TABLE.length - 1, level - 1)]; }

  // ===== 工具 =====
  function rotateCW(m) {
    const n = m.length;
    return m.map((row, r) => row.map((_, c) => m[n - 1 - c][r]));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function nextFromBag() {
    if (bag.length === 0) bag = shuffle(TYPES.slice());
    return bag.pop();
  }

  function makePiece(type) {
    const mat = BASE[type].map(r => r.slice());
    return { type, mat, x: Math.floor((COLS - mat.length) / 2), y: -1 };
  }

  function collide(mat, px, py) {
    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        if (!mat[r][c]) continue;
        const bx = px + c, by = py + r;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  // ===== 游戏流程 =====
  function reset() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = [];
    hold = null;
    canHold = true;
    score = 0; lines = 0; level = 1; combo = 0;
    over = false; paused = false;
    scoreEl.textContent = '0'; linesEl.textContent = '0'; levelEl.textContent = '1';
    nextType = nextFromBag();
    spawn();
    draw();
    drawMini(holdCtx, null);
  }

  function spawn() {
    cur = makePiece(nextType);
    nextType = nextFromBag();
    canHold = true;
    drawMini(nextCtx, nextType);
    if (collide(cur.mat, cur.x, cur.y)) gameOver();
  }

  function lock() {
    let topOut = false;
    cur.mat.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      const by = cur.y + r;
      if (by < 0) { topOut = true; return; }
      board[by][cur.x + c] = cur.type;
    }));
    if (topOut) return gameOver();

    // 消行
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(v => v)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      // 得分规则：单行100 / 双行300 / 三行500 / 四行800；连击加成 ×1.2 / ×1.5 / ×2
      const table = [0, 100, 300, 500, 800];
      combo++;
      const mult = [1, 1.2, 1.5, 2][Math.min(combo - 1, 3)];
      score += Math.round(table[cleared] * mult);
      lines += cleared;
      const newLevel = Math.min(10, Math.floor(lines / 10) + 1);
      if (newLevel > level) { level = newLevel; showToast(`升级！Lv.${level}`); }
      else if (mult > 1) { showToast(`连击 x${mult}！`); }
      scoreEl.textContent = score;
      linesEl.textContent = lines;
      levelEl.textContent = level;
      if (score > high) { high = score; highEl.textContent = high; try { localStorage.setItem('tetris_high', String(high)); } catch (e) {} }
    } else {
      combo = 0;    // 一块未消行，连击中断
    }
    spawn();
    draw();
  }

  function move(dx) {
    if (!playable()) return;
    if (!collide(cur.mat, cur.x + dx, cur.y)) { cur.x += dx; draw(); }
  }

  function softDrop() {
    if (!playable()) return;
    if (!collide(cur.mat, cur.x, cur.y + 1)) { cur.y++; score++; scoreEl.textContent = score; draw(); }
    else lock();
  }

  function hardDrop() {
    if (!playable()) return;
    let dist = 0;
    while (!collide(cur.mat, cur.x, cur.y + 1)) { cur.y++; dist++; }
    score += dist * 2;
    scoreEl.textContent = score;
    lock();
  }

  function rotate() {
    if (!playable()) return;
    const m = rotateCW(cur.mat);
    // 简易踢墙
    for (const k of [0, -1, 1, -2, 2]) {
      if (!collide(m, cur.x + k, cur.y)) { cur.mat = m; cur.x += k; draw(); return; }
    }
  }

  function holdPiece() {
    if (!playable() || !canHold) return;
    const t = cur.type;
    if (hold) {
      cur = makePiece(hold);
      if (collide(cur.mat, cur.x, cur.y)) return gameOver();
    } else {
      cur = makePiece(nextType);
      nextType = nextFromBag();
      drawMini(nextCtx, nextType);
    }
    hold = t;
    canHold = false;
    drawMini(holdCtx, hold);
    draw();
  }

  function ghostY() {
    let y = cur.y;
    while (!collide(cur.mat, cur.x, y + 1)) y++;
    return y;
  }

  function playable() { return running && !paused && !over; }

  function gameOver() {
    over = true; running = false;
    if (score > high) { high = score; highEl.textContent = high; try { localStorage.setItem('tetris_high', String(high)); } catch (e) {} }
    showOverlay('💥 游戏结束', `得分 <b style="color:#3a6ea5">${score}</b> · 消行 ${lines}<br>最高分 ${high}`, '再来一局');
  }

  function showOverlay(title, html, btnText) {
    ovTitle.innerHTML = title;
    ovText.innerHTML = html;
    startBtn.textContent = btnText || '开始游戏';
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function start() {
    reset();
    running = true;
    hideOverlay();
    pauseBtn.textContent = '暂停';
    lastTime = performance.now();
    dropAcc = 0;
    requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!running || over) return;
    paused = !paused;
    pauseBtn.textContent = paused ? '继续' : '暂停';
    if (paused) showOverlay('⏸ 已暂停', '按 P 或点击继续', '继续游戏');
    else { hideOverlay(); lastTime = performance.now(); }
  }

  function loop(t) {
    if (!running) return;
    const dt = t - lastTime;
    lastTime = t;
    if (!paused && !over) {
      dropAcc += dt;
      if (dropAcc >= dropInterval()) {
        dropAcc = 0;
        if (!collide(cur.mat, cur.x, cur.y + 1)) { cur.y++; draw(); }
        else lock();
      }
    }
    if (running) requestAnimationFrame(loop);
  }

  // ===== 绘制 =====
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawBlock(c, x, y, size, color, alpha) {
    c.save();
    if (alpha != null) c.globalAlpha = alpha;
    const g = c.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, color);
    g.addColorStop(1, shade(color, -28));
    c.fillStyle = g;
    roundRect(c, x + 1, y + 1, size - 2, size - 2, 5);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 1;
    c.stroke();
    // 顶部高光
    c.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(c, x + 3, y + 3, size - 6, (size - 6) / 3, 3);
    c.fill();
    c.restore();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return `rgb(${r},${g},${b})`;
  }

  function draw() {
    // 背景
    ctx.fillStyle = '#eef6fb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 细网格
    ctx.strokeStyle = 'rgba(60,120,160,0.08)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x*CELL, 0); ctx.lineTo(x*CELL, canvas.height); ctx.stroke(); }
    for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y*CELL); ctx.lineTo(canvas.width, y*CELL); ctx.stroke(); }

    // 已落方块
    board.forEach((row, r) => row.forEach((v, c) => {
      if (v) drawBlock(ctx, c*CELL, r*CELL, CELL, COLORS[v]);
    }));

    if (cur && !over) {
      // 投影
      const gy = ghostY();
      if (gy !== cur.y) {
        cur.mat.forEach((row, r) => row.forEach((v, c) => {
          if (!v || gy + r < 0) return;
          ctx.strokeStyle = 'rgba(90,130,170,0.4)';
          ctx.lineWidth = 1.5;
          roundRect(ctx, (cur.x+c)*CELL + 2, (gy+r)*CELL + 2, CELL-4, CELL-4, 5);
          ctx.stroke();
        }));
      }
      // 当前方块
      cur.mat.forEach((row, r) => row.forEach((v, c) => {
        if (!v || cur.y + r < 0) return;
        drawBlock(ctx, (cur.x+c)*CELL, (cur.y+r)*CELL, CELL, COLORS[cur.type]);
      }));
    }
  }

  function drawMini(c, type) {
    c.clearRect(0, 0, 96, 96);
    if (!type) return;
    const mat = BASE[type];
    const w = mat[0].length * PCELL, h = mat.length * PCELL;
    const ox = (96 - w) / 2, oy = (96 - h) / 2;
    mat.forEach((row, r) => row.forEach((v, cc) => {
      if (v) drawBlock(c, ox + cc*PCELL, oy + r*PCELL, PCELL, COLORS[type]);
    }));
  }

  // 提示气泡
  let toastTimer = null;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
  }

  // ===== 控制 =====
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (['ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
    if (!running && !over && (k === ' ' || k === 'Enter')) { start(); return; }
    if (over && (k === ' ' || k === 'Enter')) { hideOverlay(); start(); return; }
    if (k === 'p' || k === 'P') { togglePause(); return; }
    if (!playable()) return;
    switch (k) {
      case 'ArrowLeft': move(-1); break;
      case 'ArrowRight': move(1); break;
      case 'ArrowDown': softDrop(); break;
      case 'q': case 'Q': rotate(); break;
      case ' ': hardDrop(); break;
      case 'c': case 'C': holdPiece(); break;
    }
  });

  startBtn.addEventListener('click', () => {
    if (paused) { togglePause(); return; }   // 暂停时点击 = 继续
    hideOverlay();
    start();
  });
  pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', () => { hideOverlay(); start(); });

  // 手机按键
  document.querySelectorAll('.tb').forEach(b => {
    b.addEventListener('click', () => {
      if (!playable()) return;
      switch (b.dataset.act) {
        case 'left': move(-1); break;
        case 'right': move(1); break;
        case 'down': softDrop(); break;
        case 'rotate': rotate(); break;
        case 'drop': hardDrop(); break;
      }
    });
  });

  // 初始画面（空棋盘 + 预览）
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bag = [];
  draw();
  drawMini(nextCtx, nextFromBag());
})();
