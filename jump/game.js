(() => {
  'use strict';
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PLAYER_SCREEN_X = 150;      // 玩家在屏幕上的固定水平位置
  const GROUND_Y = 300;             // 方块顶面基准线

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovText = document.getElementById('ovText');
  const startBtn = document.getElementById('startBtn');

  const COLORS = ['#7ec8f7','#81c784','#ffd54f','#ba68c8','#ff8a65','#4db6ac'];

  let best = 0, combo = 0;
  try { best = parseInt(localStorage.getItem('jump_best') || '0', 10) || 0; } catch (e) {}
  bestEl.textContent = best;

  // ===== 状态 =====
  let state = 'ready';        // ready | charging | jumping | falling | over
  let blocks, curIdx, score, power, chargeT, jump, camX, animT, lastTime, t;

  function newBlock(x, w) { return { x, w, color: COLORS[Math.floor(Math.random() * COLORS.length)] }; }

  function reset() {
    blocks = [newBlock(100, 70)];
    curIdx = 0;
    score = 0; combo = 0;
    power = 0; chargeT = 0;
    jump = null;
    camX = 0;
    t = 0;
    scoreEl.textContent = '0';
    genNext();
    hideOverlay();
  }

  function cur() { return blocks[curIdx]; }
  function next() { return blocks[curIdx + 1]; }

  function genNext() {
    const prev = cur();
    const w = 40 + Math.random() * 24;
    const gap = 50 + Math.random() * 110;
    blocks.push(newBlock(prev.x + prev.w / 2 + gap + w / 2, w));
  }

  function start() {
    reset();
    state = 'ready';
  }

  function beginCharge() {
    if (state !== 'ready') return;   // Bug 修复：蓄力时不再重置场景（否则每按一次就换图/清分）
    state = 'charging';
    power = 0; chargeT = 0;
  }

  function release() {
    if (state !== 'charging') return;
    // 最小跳距 100px：保证轻点也能落在下一块上（最近块中心距约 90px）
    const dist = Math.max(100, power * 280);
    const startX = cur().x;
    const targetX = startX + dist;
    jump = { startX, targetX, dist, t: 0, dur: 420 + dist * 0.8 };
    state = 'jumping';
  }

  function land() {
    const target = jump.targetX;
    const nb = next();
    const half = nb.w / 2;
    const offset = Math.abs(target - nb.x);
    if (offset <= half + 6) {          // 轻微出界也宽容判定
      // 落上去了
      curIdx++;
      let gained = 1;
      if (offset <= 7) { combo++; gained += combo; showToast(combo > 1 ? `完美连击 x${combo}！+${gained}` : '完美！+2'); }
      else { combo = 0; }
      score += gained;
      scoreEl.textContent = score;
      if (score > best) { best = score; bestEl.textContent = best; try { localStorage.setItem('jump_best', String(best)); } catch (e) {} }
      genNext();
      state = 'ready';
    } else {
      // 掉落
      state = 'falling';
      animT = 0;
    }
  }

  function gameOver() {
    state = 'over';
    showOverlay('💀 掉下去了', `得分 <b>${score}</b><br>最高分 ${best}`, '再来一次');
  }

  // ===== 更新 =====
  function update(f, dt) {
    t += f;
    if (state === 'charging') {
      chargeT += dt;
      power = Math.min(1, chargeT / 900);
      // 蓄力到顶自动弹回循环，方便掌握节奏
      if (power >= 1) chargeT = -220;
    }
    if (state === 'jumping') {
      jump.t += dt;
      const p = Math.min(1, jump.t / jump.dur);
      if (p >= 1) land();
    }
    if (state === 'falling') {
      animT += f;
      if (animT > 40) gameOver();
    }
    // 镜头跟随
    const targetCam = cur().x - PLAYER_SCREEN_X;
    camX += (targetCam - camX) * Math.min(1, 0.12 * f);
  }

  // ===== 绘制 =====
  function playerWorldX() {
    if (state === 'jumping') {
      const p = Math.min(1, jump.t / jump.dur);
      return jump.startX + (jump.targetX - jump.startX) * p;
    }
    if (state === 'falling') return jump.targetX;
    return cur().x;
  }
  function playerLift() {
    if (state === 'jumping') {
      const p = Math.min(1, jump.t / jump.dur);
      return Math.sin(p * Math.PI) * 95;
    }
    if (state === 'falling') return -Math.min(200, animT * 4);
    return Math.abs(Math.sin(t / 20)) * (state === 'charging' ? 3 + power * 8 : 2);
  }

  function draw() {
    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#dff1fb'); sky.addColorStop(1, '#f7fbe9');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // 方块
    for (const b of blocks) {
      const sx = b.x - b.w / 2 - camX;
      if (sx + b.w < -40 || sx > W + 40) continue;
      const bodyH = 90;
      const top = GROUND_Y;
      // 柱体
      const g = ctx.createLinearGradient(sx, top, sx, top + bodyH);
      g.addColorStop(0, b.color); g.addColorStop(1, shade(b.color, -50));
      ctx.fillStyle = g;
      roundRect(ctx, sx, top, b.w, bodyH, 8); ctx.fill();
      // 顶面高光
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      roundRect(ctx, sx + 3, top + 3, b.w - 6, 10, 5); ctx.fill();
      // 中心标记
      ctx.fillStyle = 'rgba(233,69,96,0.8)';
      ctx.beginPath(); ctx.arc(sx + b.w / 2, top + 8, 2.6, 0, Math.PI * 2); ctx.fill();
    }

    const px = playerWorldX() - camX;
    const py = GROUND_Y - playerLift();

    // 蓄力条（画在角色上方）
    if (state === 'charging') {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      roundRect(ctx, px - 26, py - 34, 52, 8, 4); ctx.fill();
      const hue = 120 - power * 110;   // 绿→红
      ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
      roundRect(ctx, px - 24, py - 32, 48 * power, 4, 2); ctx.fill();
      // 预估落点虚线
      const target = cur().x + Math.max(24, power * 280);
      ctx.strokeStyle = 'rgba(60,100,140,0.4)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px, GROUND_Y - 14);
      ctx.lineTo(target - camX, GROUND_Y - 14);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 小人
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    const pg = ctx.createRadialGradient(px - 3, py - 16, 2, px, py - 10, 12);
    pg.addColorStop(0, '#ffd9a0'); pg.addColorStop(1, '#e67e22');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py - 10, 11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px + 3, py - 14, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(px + 4.2, py - 14, 1.7, 0, Math.PI * 2); ctx.fill();

    // 状态提示
    if (state === 'ready') {
      ctx.fillStyle = 'rgba(60,100,140,0.5)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('按住蓄力，松手起跳', W / 2, 56);
    }
    // 浮动提示
    if (toastMsg && performance.now() < toastUntil) {
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#e67e22';
      ctx.textAlign = 'center';
      ctx.fillText(toastMsg, W / 2, 100);
    }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return `rgb(${r},${g},${b})`;
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

  let toastMsg = '', toastUntil = 0;
  function showToast(text) {
    toastMsg = text;
    toastUntil = performance.now() + 900;
  }

  function loop(now) {
    const dt = Math.min(50, now - lastTime || 16.7);
    lastTime = now;
    update(dt / 16.7, dt);
    draw();
    requestAnimationFrame(loop);
  }

  function showOverlay(title, html, btnText) {
    ovTitle.innerHTML = title; ovText.innerHTML = html;
    startBtn.textContent = btnText || '开始游戏';
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  // ===== 控制 =====
  function down(e) {
    if (e.target === startBtn) return;
    if (overlay.classList.contains('hidden')) { e.preventDefault && e.preventDefault(); beginCharge(); }
  }
  function up() { release(); }

  startBtn.addEventListener('click', () => { reset(); state = 'ready'; });
  canvas.addEventListener('mousedown', down);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); down(e); }, { passive: false });
  window.addEventListener('touchend', up);
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) down(e);
    }
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') up(); });

  reset();
  requestAnimationFrame(loop);
})();
