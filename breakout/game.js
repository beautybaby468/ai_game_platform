(() => {
  'use strict';
  // ============================================================
  // 打砖块 · 20 关（五段式 / 波浪难度 / 穿越通关）
  // ============================================================
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const overlay = document.getElementById('overlay');
  const toastEl = document.getElementById('toast');
  const pauseBtn = document.getElementById('pauseBtn');

  const COLS = 10, PAD = 18, GAP = 4, BH = 18, TOP = 54;
  const BW = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;

  // ===== 存档 =====
  const SAVE_KEY = 'breakout2_save';
  let save = { unlocked: 1, stars: {} };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

  // ===== 关卡配置 =====
  // speed: px/s；paddle: 挡板宽；h2/h3/boom/steel/regen/moving: 数量或比例
  const CFG = [
    { rows: 3, speed: 300, paddle: 110 },                                                              // 1 教学
    { rows: 4, speed: 315, paddle: 110, h2: 0.35 },                                                    // 2 硬砖
    { rows: 4, speed: 330, paddle: 110, h2: 0.3,  boom: 3 },                                           // 3 爆炸+道具
    { rows: 5, speed: 347, paddle: 92,  h2: 0.35, layout: 'diamond' },                                 // 4 菱形缺口
    { rows: 5, speed: 365, paddle: 92,  boom: 6 },                                                     // 5 爽关
    { rows: 6, speed: 382, paddle: 92,  h2: 0.5 },                                                     // 6 压力
    { rows: 5, speed: 351, paddle: 92,  h2: 0.35, steel: 8 },                                          // 7 钢砖
    { rows: 6, speed: 365, paddle: 92,  h2: 0.35, steel: 5,  moving: 6 },                              // 8 移动砖
    { rows: 6, speed: 442, paddle: 92,  boom: 5,  moving: 5 },                                         // 9 爽关
    { rows: 7, speed: 464, paddle: 92,  h2: 0.4,  steel: 6,  moving: 4, life: true },                  // 10 压力+奖命
    { rows: 7, speed: 487, paddle: 84,  h3: 0.3,  h2: 0.2,  steel: 5 },                                // 11 三级硬砖
    { rows: 7, speed: 419, paddle: 84,  boom: 6,  steel: 5 },                                          // 12 激光
    { rows: 8, speed: 537, paddle: 84,  boom: 9,  moving: 6 },                                         // 13 中期最大爽点
    { rows: 8, speed: 560, paddle: 84,  h2: 0.35, h3: 0.15, steel: 6, moving: 6 },                     // 14 压力
    { rows: 7, speed: 459, paddle: 84,  h2: 0.3,  regen: 8, life: true },                              // 15 再生+奖命
    { rows: 8, speed: 473, paddle: 84,  h2: 0.3,  regen: 6, steel: 5 },                                // 16 粘性
    { rows: 8, speed: 560, paddle: 84,  boom: 6,  regen: 6, moving: 6 },                               // 17 前哨
    { rows: 7, speed: 510, paddle: 92,  h2: 0.3,  steel: 5,  regen: 5, moving: 5 },                    // 18 高难关
    { rows: 8, speed: 560, paddle: 84,  h2: 0.3,  h3: 0.2, steel: 6, regen: 6, moving: 6 },            // 19 终极综合
    { rows: 9, speed: 585, paddle: 84,  h2: 0.35, h3: 0.2, steel: 6, regen: 6, moving: 8 },            // 20 终局
  ];

  const ROW_COLORS = ['#e57373', '#ffb74d', '#ffd54f', '#81c784', '#4fc3f7', '#ba68c8', '#7986cb', '#f48fb1'];
  const DROP_DEFS = {
    extend: { label: 'E', color: '#5c8ae6', name: '加长挡板！', unlock: 3 },
    multi:  { label: 'M', color: '#ba68c8', name: '多球！',     unlock: 5 },
    slow:   { label: 'S', color: '#4fc3f7', name: '慢速球！',   unlock: 9 },
    laser:  { label: 'L', color: '#e94560', name: '激光挡板！', unlock: 12 },
    sticky: { label: 'C', color: '#27ae60', name: '粘性挡板！', unlock: 16 },
  };
  const DROP_WEIGHTS = { extend: 30, multi: 25, slow: 20, laser: 15, sticky: 10 };

  // ===== 状态 =====
  let state = 'select';       // select | ready | play | over | clear
  let level = 1, lives = 3, score = 0;
  let paddle, balls, bricks, powerups, lasers, effects;
  let keys = { left: false, right: false };
  let paused = false, lastTime = 0, t = 0;
  let dropCooldown = 0, laserCd = 0, stickyLaunch = false;
  let tutorialShown = {};

  const $ = id => document.getElementById(id);

  // ===== 工具 =====
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return `rgb(${r},${g},${b})`;
  }
  let toastTimer = null;
  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  // ===== 关卡搭建 =====
  function makeBrick(c, r, type) {
    return {
      x: PAD + c * (BW + GAP), y: TOP + r * (BH + GAP),
      w: BW, h: BH, c, r,
      type, hp: type === 'h2' ? 2 : type === 'h3' || type === 'shield' ? 3 : 1,
      maxHp: type === 'h2' ? 2 : type === 'h3' || type === 'shield' ? 3 : 1,
      alive: true,
      color: ROW_COLORS[r % ROW_COLORS.length],
      moving: false, baseX: 0, amp: 0, mSpeed: 0, phase: Math.random() * 6.28,
      regenLeft: 0, regenTimer: 0,
    };
  }

  function buildLevel(n) {
    const cfg = CFG[n - 1];
    bricks = []; powerups = []; lasers = [];
    effects = { extend: 0, slow: 0, laserRounds: 0, sticky: 0 };
    paddle = { x: (W - cfg.paddle) / 2, y: H - 34, w: cfg.paddle, h: 12 };
    balls = [];
    resetBall();
    dropCooldown = 0; laserCd = 0;

    for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < COLS; c++) {
          if (cfg.layout === 'diamond' && Math.abs(c - 4.5) + Math.abs(r - (cfg.rows - 1) / 2) < 4) continue;
          const b = makeBrick(c, r, 'n');
          bricks.push(b);
        }
      }
      // 类型分配：硬砖 / 三级硬砖 / 钢砖 / 爆炸 / 再生 / 移动
      const destructible = bricks.filter(b => b.type === 'n');
      const assign = (countOrRatio, type, regen) => {
        let count = countOrRatio < 1 ? Math.round(destructible.length * countOrRatio) : countOrRatio;
        for (let i = 0; i < count; i++) {
          const pool = destructible.filter(b => b.type === 'n' && !b.moving);
          if (!pool.length) break;
          const b = pool[Math.floor(Math.random() * pool.length)];
          b.type = type;
          b.hp = type === 'h2' ? 2 : type === 'h3' ? 3 : 1;
          b.maxHp = b.hp;
          if (type === 'boom') b.color = '#d3543a';
          if (type === 'regen') { b.color = '#3aa66a'; b.regenLeft = 2; }
        }
      };
      if (cfg.h2) assign(cfg.h2, 'h2');
      if (cfg.h3) assign(cfg.h3, 'h3');
      if (cfg.boom) assign(cfg.boom, 'boom');
      if (cfg.regen) assign(cfg.regen, 'regen');
      if (cfg.steel) {
        for (let i = 0; i < cfg.steel; i++) {
          const pool = bricks.filter(b => b.type === 'n' && !b.moving);
          if (!pool.length) break;
          const b = pool[Math.floor(Math.random() * pool.length)];
          b.type = 'steel'; b.hp = Infinity;
        }
      }
      if (cfg.moving) {
        const pool = bricks.filter(b => (b.type === 'n' || b.type === 'h2') && !b.moving);
        for (let i = 0; i < Math.min(cfg.moving, pool.length); i++) {
          const b = pool[Math.floor(Math.random() * pool.length)];
          b.moving = true; b.baseX = b.x;
          b.amp = 30 + Math.random() * 14;
          b.mSpeed = 45 + n * 3;
        }
      }
      // 保证每列至少一块砖，防止开局存在直通顶部的空列
      for (let c = 0; c < COLS; c++) {
        if (!bricks.some(b => b.c === c)) bricks.push(makeBrick(c, 0, 'n'));
      }
    levelEl.textContent = n;
    scoreEl.textContent = score;
    livesEl.textContent = lives;
  }

  function resetBall() {
    balls = [{ x: paddle.x + paddle.w / 2, y: paddle.y - 7, dx: 0, dy: 0, r: 6, stuck: true, off: 0 }];
  }

  function ballSpeed() {
    let sp = CFG[level - 1].speed;
    if (effects.slow > 0) sp *= 0.7;
    return sp;
  }

  function launch() {
    if (state !== 'ready') return;
    let launched = false;
    for (const b of balls) {
      if (!b.stuck) continue;
      const sp = ballSpeed();
      const off = b.off !== undefined ? b.off : 0;
      const a = (off / (paddle.w / 2)) * 60 * Math.PI / 180;
      b.dx = sp * Math.sin(a);
      b.dy = -sp * Math.cos(a);
      b.stuck = false;
      launched = true;
    }
    if (launched) state = 'play';
  }

  function startLevel(n) {
    level = n;
    score = 0;
    lives = 3;
    buildLevel(n);
    state = 'ready';
    paused = false;
    pauseBtn.textContent = '暂停';
    hideOverlay();
  }

  // ===== 选中关 / 覆盖层 =====
  function showSelect() {
    state = 'select';
    let chips = '';
    for (let n = 1; n <= 20; n++) {
      const locked = n > save.unlocked;
      const st = save.stars[n] || 0;
      const cfg = CFG[n - 1];
      chips += `<div class="lvl${locked ? ' locked' : ''}${st ? ' cleared' : ''}" data-n="${n}">
        ${locked ? '' : n}${st ? `<div class="st">${'★'.repeat(st)}</div>` : ''}</div>`;
    }
    overlay.innerHTML = `<h2>🧱 选择关卡</h2>
      <p>把小球打穿所有砖行即可通关 · 20 关 · 通关第 10 关奖励 1 命</p>
      <div class="lvl-grid">${chips}</div>
      <div class="pin"><button class="primary" id="continueBtn">继续闯关 ▶</button></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelectorAll('.lvl:not(.locked)').forEach(el => {
      el.addEventListener('click', () => startLevel(+el.dataset.n));
    });
    overlay.querySelector('#continueBtn').addEventListener('click', () => startLevel(Math.min(save.unlocked, 20)));
  }

  function showOverlay(title, html, btns, stars) {
    const starHtml = stars ? `<div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>` : '';
    overlay.innerHTML = `<h2>${title}</h2>${starHtml}<p>${html}</p><div class="pin"></div>`;
    const pin = overlay.querySelector('.pin');
    btns.forEach(([label, fn, cls]) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', fn);
      pin.appendChild(b);
    });
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  // ===== 主循环 =====
  function loop(now) {
    const dt = Math.min(50, now - lastTime || 16.7);
    lastTime = now;
    if (!paused && state !== 'select') { t += dt; update(dt); }
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // 挡板
    if (keys.left) paddle.x -= 0.42 * dt;
    if (keys.right) paddle.x += 0.42 * dt;
    paddle.x = Math.max(4, Math.min(W - paddle.w - 4, paddle.x));

    if (dropCooldown > 0) dropCooldown -= dt;

    // 效果计时
    if (effects.extend > 0) {
      effects.extend -= dt;
      if (effects.extend <= 0) { paddle.w = CFG[level - 1].paddle; paddle.x = Math.min(paddle.x, W - paddle.w - 4); }
    }
    if (effects.slow > 0) effects.slow -= dt;
    if (laserCd > 0) laserCd -= dt;

    // 移动砖
    for (const b of bricks) {
      if (!b.moving || !b.alive) continue;
      b.phase += dt / 1000;
      b.x = b.baseX + Math.sin(b.phase * b.mSpeed / 60) * b.amp;
      b.x = Math.max(PAD, Math.min(W - PAD - b.w, b.x));
    }

    // 再生
    for (const b of bricks) {
      if (b.type === 'regen' && !b.alive && b.regenLeft > 0) {
        b.regenTimer -= dt;
        if (b.regenTimer <= 0) {
          b.alive = true; b.hp = 1; b.regenLeft--;
          showToast('再生砖复活了！');
        }
      }
    }

    // 球
    if (state === 'ready') {
      for (const b of balls) { b.x = paddle.x + paddle.w / 2 + (b.off || 0); b.y = paddle.y - b.r - 1; }
    } else if (state === 'play') {
      for (const ball of balls) {
        if (ball.stuck) { ball.x = paddle.x + paddle.w / 2 + (ball.off || 0); ball.y = paddle.y - ball.r - 1; continue; }
        const steps = Math.ceil(Math.max(Math.abs(ball.dx), Math.abs(ball.dy)) * dt / 1000 / 4) || 1;
        for (let s = 0; s < steps; s++) {
          ball.x += ball.dx * dt / 1000 / steps;
          ball.y += ball.dy * dt / 1000 / steps;
          ballCollide(ball);
          if (state !== 'play') break;
          checkPass(ball);          // 穿越判定：越过所有砖行即通关
          if (state !== 'play') break;
        }
      }
      balls = balls.filter(b => b.y - b.r < H + 20);
      if (balls.length === 0) loseLife();
    }

    // 道具下落
    for (const p of powerups) p.y += 0.14 * dt;
    powerups = powerups.filter(p => {
      if (p.y > H + 20) return false;
      if (p.y + 10 > paddle.y && p.y - 10 < paddle.y + paddle.h &&
          p.x > paddle.x - 8 && p.x < paddle.x + paddle.w + 8) {
        applyDrop(p.type);
        return false;
      }
      return true;
    });

    // 激光
    for (const l of lasers) l.y -= 0.55 * dt;
    lasers = lasers.filter(l => {
      if (l.y < -10) return false;
      // 打砖
      for (const b of bricks) {
        if (!b.alive || b.type === 'steel') continue;
        if (l.x > b.x && l.x < b.x + b.w && l.y > b.y && l.y < b.y + b.h) {
          hitBrick(b, 1);
          return false;
        }
      }
      return true;
    });
  }

  // 穿越判定：球的顶边越过最高砖行的顶边 = 穿过所有砖行
  function checkPass(ball) {
    const alive = bricks.filter(b => b.alive);
    if (!alive.length) { levelClear(); return; }
    const minTop = Math.min(...alive.map(b => b.y));
    if (ball.y + ball.r < minTop) levelClear();
  }

  function ballCollide(ball) {
    const r = ball.r;
    if (ball.x - r < 0) { ball.x = r; ball.dx = Math.abs(ball.dx); }
    if (ball.x + r > W) { ball.x = W - r; ball.dx = -Math.abs(ball.dx); }
    if (ball.y - r < 0) { ball.y = r; ball.dy = Math.abs(ball.dy); }

    // 挡板
    if (ball.dy > 0 && ball.y + r >= paddle.y && ball.y - r <= paddle.y + paddle.h &&
        ball.x >= paddle.x - r && ball.x <= paddle.x + paddle.w + r) {
      const sp = Math.hypot(ball.dx, ball.dy) || ballSpeed();
      if (effects.sticky > 0) {
        ball.stuck = true;
        ball.off = ball.x - (paddle.x + paddle.w / 2);
        effects.sticky--;
        state = 'ready';   // 等待玩家瞄准发射
        return;
      }
      const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const a = hit * 60 * Math.PI / 180;
      ball.dx = sp * Math.sin(a);
      ball.dy = -Math.abs(sp * Math.cos(a));
      ball.y = paddle.y - r;
    }

    // 落底
    if (ball.y - r > H) return;

    // 砖块
    for (const b of bricks) {
      if (!b.alive) continue;
      if (ball.x + r > b.x && ball.x - r < b.x + b.w && ball.y + r > b.y && ball.y - r < b.y + b.h) {
        const overlapL = ball.x + r - b.x, overlapR = b.x + b.w - (ball.x - r);
        const overlapT = ball.y + r - b.y, overlapB = b.y + b.h - (ball.y - r);
        if (Math.min(overlapL, overlapR) < Math.min(overlapT, overlapB)) ball.dx = -ball.dx;
        else ball.dy = -ball.dy;
        if (b.type !== 'steel') hitBrick(b, 1);
        break;
      }
    }
  }

  function hitBrick(b, dmg) {
    b.hp -= dmg;
    if (b.hp > 0) return;
    b.alive = false;
    const pts = { n: 10, h2: 20, h3: 30, boom: 15, regen: 15, shield: 15 }[b.type] || 10;
    score += pts;
    scoreEl.textContent = score;
    // 爆炸连锁（3×3，可递归）
    if (b.type === 'boom') {
      const queue = [];
      for (const o of bricks) {
        if (!o.alive || o === b || o.type === 'steel') continue;
        if (Math.abs(o.c - b.c) <= 1 && Math.abs(o.r - b.r) <= 1) queue.push(o);
      }
      for (const o of queue) {
        o.alive = false;
        score += { n: 10, h2: 20, h3: 30, boom: 15, regen: 15, shield: 15 }[o.type] || 10;
        if (o.type === 'boom') hitBrickChain(o);
        if (o.type === 'regen' && o.regenLeft > 0) { /* 被炸的再生砖不再重生 */ o.regenLeft = 0; }
      }
      scoreEl.textContent = score;
    }
    if (b.type === 'regen' && b.regenLeft > 0) {
      b.regenTimer = 8000;   // 8 秒后重生
    }
    maybeDrop(b);
    if (!bricks.some(x => x.alive)) levelClear();   // 砖块全清也算穿越成功
  }

  function hitBrickChain(b) {
    // 爆炸砖被连锁引爆时再次扩散（递归）
    for (const o of bricks) {
      if (!o.alive || o === b || o.type === 'steel') continue;
      if (Math.abs(o.c - b.c) <= 1 && Math.abs(o.r - b.r) <= 1) {
        o.alive = false;
        score += { n: 10, h2: 20, h3: 30, boom: 15, regen: 15, shield: 15 }[o.type] || 10;
        if (o.type === 'boom') hitBrickChain(o);
        if (o.type === 'regen') o.regenLeft = 0;
      }
    }
  }

  function maybeDrop(b) {
    if (b.type === 'steel' || b.type === 'shield') return;
    if (dropCooldown > 0 || powerups.length >= 2) return;
    if (Math.random() > 0.09) return;
    const pool = Object.keys(DROP_DEFS).filter(k => level >= DROP_DEFS[k].unlock);
    if (!pool.length) return;
    const total = pool.reduce((s, k) => s + DROP_WEIGHTS[k], 0);
    let r = Math.random() * total, type = pool[0];
    for (const k of pool) { r -= DROP_WEIGHTS[k]; if (r <= 0) { type = k; break; } }
    dropCooldown = 1500;
    powerups.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, type });
  }

  function applyDrop(type) {
    const def = DROP_DEFS[type];
    showToast(def.name);
    if (type === 'extend') { effects.extend = 12000; paddle.w = Math.min(CFG[level - 1].paddle * 1.4, W - 40); }
    if (type === 'slow') effects.slow = 10000;
    if (type === 'laser') effects.laserRounds += 5;
    if (type === 'sticky') effects.sticky += 3;
    if (type === 'multi') {
      const cur = balls.filter(b => !b.stuck);
      for (const b of cur) {
        if (balls.length >= 6) break;
        const sp = Math.hypot(b.dx, b.dy) || ballSpeed();
        for (const ang of [-0.5, 0.5]) {
          if (balls.length >= 6) break;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          balls.push({ x: b.x, y: b.y, dx: b.dx * ca - b.dy * sa, dy: b.dx * sa + b.dy * ca, r: 6, stuck: false });
        }
      }
    }
  }

  function fireLaser() {
    if (effects.laserRounds <= 0 || laserCd > 0 || state !== 'play') return;
    effects.laserRounds--;
    laserCd = 350;
    lasers.push({ x: paddle.x + 8, y: paddle.y });
    lasers.push({ x: paddle.x + paddle.w - 8, y: paddle.y });
  }

  // ===== 生命 / 胜负 =====
  function loseLife() {
    lives--;
    livesEl.textContent = lives;
    if (lives <= 0) {
      state = 'over';
      showOverlay('💥 游戏结束', `第 ${level} 关 · 得分 <b>${score}</b>`,
        [['重试本关', () => startLevel(level), 'primary'], ['选择关卡', showSelect, '']]);
      return;
    }
    effects.laserRounds = 0; effects.sticky = 0;
    resetBall();
    state = 'ready';
  }

  // 通关：小球穿过所有砖行（由 checkPass 触发）
  function levelClear() {
    if (state !== 'play') return;

    state = 'clear';
    const stars = lives >= 3 ? 3 : lives === 2 ? 2 : 1;
    save.stars[level] = Math.max(save.stars[level] || 0, stars);
    if (level === 10 || level === 15) { if (lives < 5) { lives++; showToast('奖励 1 命！'); } }
    if (level >= save.unlocked && level < 20) save.unlocked = level + 1;
    persist();
    livesEl.textContent = lives;

    const isLast = level === 20;
    showOverlay(isLast ? '🏆 终局胜利！' : '🚀 穿越成功！',
      `第 ${level} 关 · 得分 <b>${score}</b>`,
      isLast
        ? [['选关回看', showSelect, 'primary'], ['重玩', () => startLevel(level), '']]
        : [['下一关 ▶', () => startLevel(level + 1), 'primary'], ['选关', showSelect, '']],
      stars);
  }

  // ===== 绘制 =====
  function draw() {
    // 背景
    ctx.fillStyle = '#eef6fb';
    ctx.fillRect(0, 0, W, H);

    // 砖块
    for (const b of bricks) {
      if (!b.alive) continue;
      drawBrick(b);
    }

    // 道具
    for (const p of powerups) {
      const def = DROP_DEFS[p.type];
      ctx.fillStyle = def.color;
      roundRect(ctx, p.x - 11, p.y - 11, 22, 22, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      roundRect(ctx, p.x - 8, p.y - 8, 16, 7, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.label, p.x, p.y + 1);
    }

    // 激光
    ctx.fillStyle = '#e94560';
    for (const l of lasers) ctx.fillRect(l.x - 1.5, l.y - 10, 3, 14);

    // 挡板
    const pg = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
    if (effects.sticky > 0) { pg.addColorStop(0, '#6fdc8c'); pg.addColorStop(1, '#27ae60'); }
    else { pg.addColorStop(0, '#7ec8f7'); pg.addColorStop(1, '#5c8ae6'); }
    ctx.fillStyle = pg;
    roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6); ctx.fill();
    if (effects.laserRounds > 0) {
      ctx.fillStyle = '#e94560';
      ctx.fillRect(paddle.x + 5, paddle.y - 5, 6, 5);
      ctx.fillRect(paddle.x + paddle.w - 11, paddle.y - 5, 6, 5);
      ctx.fillStyle = '#5a6b60';
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`激光 ×${effects.laserRounds}`, W / 2, paddle.y - 8);
    }

    // 球
    for (const b of balls) {
      ctx.save();
      ctx.shadowColor = 'rgba(230,126,34,0.5)'; ctx.shadowBlur = 8;
      const bg = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
      bg.addColorStop(0, '#ffd9a0'); bg.addColorStop(1, '#e67e22');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ready 提示
    if (state === 'ready' && !paused) {
      ctx.fillStyle = 'rgba(60,100,140,0.55)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(effects.sticky > 0 ? '粘住球了 · 点击 / 空格 瞄准发射' : '点击 / 空格 发射', W / 2, H - 66);
    }
  }

  function drawBrick(b) {
    let color = b.color;
    if (b.type === 'steel') color = '#9aa5b1';
    if (b.type === 'shield') color = '#8d99ae';
    if (b.type === 'boom') color = '#d3543a';
    if (b.type === 'regen') color = '#3aa66a';
    const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, color); g.addColorStop(1, shade(color, -40));
    ctx.fillStyle = g;
    roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, (b.h - 4) / 2.6, 3); ctx.fill();
    // 类型标记
    if (b.type === 'steel') {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(b.x + 5, b.y + b.h / 2, 1.5, 0, Math.PI * 2); ctx.arc(b.x + b.w - 5, b.y + b.h / 2, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    if (b.type === 'boom') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💥', b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    if (b.type === 'regen') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('↻', b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    if (b.type === 'h2' || b.type === 'h3' || (b.type !== 'n' && b.hp < b.maxHp)) {
      // 受损裂纹 / 剩余血量点
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < b.hp; i++) {
        ctx.beginPath(); ctx.arc(b.x + b.w / 2 + (i - (b.hp - 1) / 2) * 6, b.y + b.h / 2, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ===== 控制 =====
  function movePaddle(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (W / rect.width);
    paddle.x = Math.max(4, Math.min(W - paddle.w - 4, x - paddle.w / 2));
  }
  canvas.addEventListener('mousemove', e => movePaddle(e.clientX));
  canvas.addEventListener('touchmove', e => { e.preventDefault(); movePaddle(e.touches[0].clientX); }, { passive: false });

  function primaryAction() {
    if (state === 'ready') {
      if (balls.some(b => b.stuck) && effects.sticky > 0) { launch(); return; }
      launch();
    }
    else if (state === 'play') fireLaser();
  }
  canvas.addEventListener('mousedown', primaryAction);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); primaryAction(); }, { passive: false });

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    if (e.key === ' ') {
      e.preventDefault();
      if (state === 'ready') launch();
      else if (state === 'play') fireLaser();
    }
    if (e.key === 'p' || e.key === 'P') togglePause();
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
  });

  function togglePause() {
    if (state !== 'play' && state !== 'ready') return;
    paused = !paused;
    pauseBtn.textContent = paused ? '继续' : '暂停';
    if (paused) showOverlay('⏸ 已暂停', '按 P 或点击继续', [['继续游戏', () => togglePause(), 'primary']]);
    else hideOverlay();
  }

  pauseBtn.addEventListener('click', togglePause);
  document.getElementById('selectBtn').addEventListener('click', () => {
    if (state !== 'select') showSelect();
  });
  document.getElementById('restartBtn').addEventListener('click', () => startLevel(level));

  // ===== 启动 =====
  buildLevel(1);
  showSelect();
  requestAnimationFrame(loop);
})();
