(() => {
  'use strict';
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GROUND = 80;
  const R = 14;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovText = document.getElementById('ovText');
  const startBtn = document.getElementById('startBtn');

  let best = 0;
  try { best = parseInt(localStorage.getItem('flappy_best') || '0', 10) || 0; } catch (e) {}
  bestEl.textContent = best;

  let state = 'ready';       // ready | play | over
  let bird, pipes, score, speed, spawnT, groundX;
  let t = 0;                 // 动画时钟（必须初始化，否则 NaN 污染小鸟坐标）

  function reset() {
    bird = { x: W / 2, y: H / 2, vy: 0 };   // 小鸟位于界面水平中央
    pipes = [];
    score = 0;
    speed = 2.4;
    spawnT = 0;
    groundX = 0;
    t = 0;
    scoreEl.textContent = '0';
  }

  function gapSize() { return Math.max(118, 165 - score * 1.6); }

  function spawnPipe() {
    const g = gapSize();
    const minC = 90 + g / 2, maxC = H - GROUND - 90 - g / 2;
    pipes.push({ x: W + 40, gapY: minC + Math.random() * (maxC - minC), w: 64, passed: false });
  }

  function flap() {
    if (state === 'ready') { reset(); hideOverlay(); state = 'play'; }
    if (state === 'play') bird.vy = -7.4;
  }

  function die() {
    state = 'over';
    if (score > best) { best = score; bestEl.textContent = best; try { localStorage.setItem('flappy_best', String(best)); } catch (e) {} }
    showOverlay('💥 撞到了！', `得分 <b>${score}</b><br>最高分 ${best}`, '再来一次');
  }

  function update(f) {
    t += f;
    groundX = (groundX - speed * f) % 24;
    if (state !== 'play') {
      if (state === 'ready') bird.y = H / 2 + Math.sin(t / 12) * 8;
      return;
    }

    bird.vy += 0.45 * f;
    bird.y += bird.vy * f;
    if (bird.y - R < 0) { bird.y = R; bird.vy = 0; }

    speed = Math.min(4.2, 2.4 + score * 0.03);

    // 生成管道
    spawnT -= f;
    if (spawnT <= 0 && (pipes.length === 0 || pipes[pipes.length - 1].x < W - 230)) {
      spawnPipe();
      spawnT = 60;
    }
    pipes.forEach(p => { p.x -= speed * f; });
    pipes = pipes.filter(p => p.x + p.w > -20);

    // 计分
    pipes.forEach(p => {
      if (!p.passed && p.x + p.w < bird.x - R) { p.passed = true; score++; scoreEl.textContent = score; }
    });

    // 碰撞
    if (bird.y + R > H - GROUND) { bird.y = H - GROUND - R; return die(); }
    for (const p of pipes) {
      if (bird.x + R > p.x && bird.x - R < p.x + p.w) {
        const top = p.gapY - gapSize() / 2, bot = p.gapY + gapSize() / 2;
        if (bird.y - R < top || bird.y + R > bot) return die();
      }
    }
  }

  function draw() {
    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#cfeafd'); sky.addColorStop(1, '#eafaf0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // 云（简单装饰）
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 3; i++) {
      const cx = (i * 160 + (t * 0.3) % 480) % (W + 120) - 60;
      const cy = 70 + i * 55;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.arc(cx + 20, cy + 4, 14, 0, Math.PI * 2);
      ctx.arc(cx - 20, cy + 5, 13, 0, Math.PI * 2);
      ctx.fill();
    }

    // 管道
    const g = gapSize();
    pipes.forEach(p => {
      const top = p.gapY - g / 2, bot = p.gapY + g / 2;
      drawPipe(p.x, 0, top);
      drawPipe(p.x, bot, H - GROUND - bot);
    });

    // 地面
    ctx.fillStyle = '#dcd0a8';
    ctx.fillRect(0, H - GROUND, W, GROUND);
    ctx.fillStyle = '#8fce6e';
    ctx.fillRect(0, H - GROUND, W, 16);
    ctx.fillStyle = 'rgba(120,170,90,0.5)';
    for (let x = groundX; x < W; x += 24) ctx.fillRect(x, H - GROUND + 4, 12, 4);

    // 小鸟（旋转跟随速度）
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(Math.max(-0.5, Math.min(1.1, bird.vy / 12)));
    const bg = ctx.createRadialGradient(-4, -4, 2, 0, 0, R);
    bg.addColorStop(0, '#ffe9a0'); bg.addColorStop(1, '#f5b940');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c98a1e'; ctx.lineWidth = 1.5; ctx.stroke();
    // 翅膀
    const wingY = Math.sin(t / 4) * 4;
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath(); ctx.ellipse(-4, wingY, 8, 5, -0.4, 0, Math.PI * 2); ctx.fill();
    // 眼睛 + 嘴
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(6, -5, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(7.5, -5, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9722e';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(20, 2); ctx.lineTo(12, 5); ctx.fill();
    ctx.restore();
  }

  function drawPipe(x, y, h) {
    if (h <= 0) return;
    const grad = ctx.createLinearGradient(x, 0, x + 64, 0);
    grad.addColorStop(0, '#7fce6a'); grad.addColorStop(0.5, '#5cb84a'); grad.addColorStop(1, '#3e9e35');
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, 64, h, 6); ctx.fill();
    // 管口加宽
    const capY = (y === 0) ? y + h - 22 : y;
    ctx.fillStyle = '#4fae3e';
    roundRect(ctx, x - 4, capY, 72, 22, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, x + 6, y + (y === 0 ? 6 : 0), 10, Math.max(0, h - 6), 4); ctx.fill();
  }

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

  let lastTime = 0;
  function loop(now) {
    const dt = Math.min(50, now - lastTime || 16.7);
    lastTime = now;
    update(dt / 16.7);
    draw();
    requestAnimationFrame(loop);
  }

  function showOverlay(title, html, btnText) {
    ovTitle.innerHTML = title; ovText.innerHTML = html;
    startBtn.textContent = btnText || '开始游戏';
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  startBtn.addEventListener('click', () => { reset(); hideOverlay(); state = 'ready'; });
  canvas.addEventListener('mousedown', flap);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); flap(); }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); flap(); }
    if (e.key === 'Enter' && state === 'over') { reset(); state = 'play'; }
  });

  reset();
  requestAnimationFrame(loop);
})();
