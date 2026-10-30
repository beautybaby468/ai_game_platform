(() => {
  const SIZE = 20;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const CELL = canvas.width / SIZE;
  const MAX_LEVEL = 60;

  // ===== 速度：表内"移动速度"1~5，线性映射到 170ms ~ 55ms =====
  function speedToInterval(sp) { return Math.round(170 - (sp - 1) * (115 / 4)); }

  // ===== 关卡参数表（来自《贪吃蛇.xlsx》：[移动速度, 时间限制秒(-1=无限), 障碍物数量, 通关目标分]）=====
  const LEVEL_TABLE = [
    // 青青草原 1-10
    [1,   -1, 10,  50], [1.2,120,  2,  55], [1.4,120,  3,  60], [1.6,115,  4,  65], [1.8,115,  5,  70],
    [2,  110,   6,  75], [2.2,110,  7,  80], [2.4,105,  8,  85], [2.6,105,  9,  95], [2.8,100, 10, 100],
    // 金色沙漠 11-20
    [2,  120,   4,  80], [2.2,120,  5,  85], [2.4,115,  6,  90], [2.6,115,  7,  95], [2.8,110,  8, 100],
    [3,  110,   9, 105], [3.2,105, 10, 110], [3.4,105, 11, 120], [3.6,100, 12, 130], [3.8, 95, 13, 140],
    // 冰雪世界 21-30
    [3,  110,   6, 105], [3.1,110,  7, 110], [3.2,105,  8, 115], [3.3,105,  9, 120], [3.4,100, 10, 130],
    [3.5,100, 11, 135], [3.6, 95, 12, 145], [3.7, 95, 13, 155], [3.8, 90, 14, 165], [4,   85, 15, 175],
    // 熔岩地狱 31-40
    [3.6,100,   8, 135], [3.7,100,  9, 140], [3.8, 95, 10, 145], [3.9, 95, 11, 155], [4,   90, 12, 165],
    [4.1, 90,  13, 170], [4.2, 85, 14, 180], [4.3, 85, 15, 190], [4.4, 80, 16, 200], [4.5, 75, 17, 215],
    // 星空夜幕 41-50
    [4,   90,  10, 170], [4.1, 90, 11, 175], [4.2, 85, 12, 185], [4.3, 85, 13, 190], [4.4, 80, 14, 200],
    [4.5, 80,  15, 210], [4.6, 75, 16, 220], [4.7, 75, 17, 230], [4.8, 70, 18, 245], [4.9, 65, 19, 260],
    // 神秘深渊 51-60
    [4.5, 80,  12, 190], [4.6, 80, 13, 195], [4.7, 75, 14, 205], [4.75,75, 15, 210], [4.8, 70, 16, 220],
    [4.85,70,  17, 225], [4.9, 65, 18, 235], [4.95,65, 19, 245], [4.98,60, 20, 255], [5,   55, 21, 270],
  ];

  function levelCfg(n) {
    const t = LEVEL_TABLE[n - 1];
    return {
      n,
      mapIdx: Math.floor((n - 1) / 10),
      inMap: (n - 1) % 10 + 1,
      speed: t[0],
      time: t[1] === -1 ? null : t[1],
      obstacles: t[2],
      target: t[3],
      hard: n % 10 === 0,
    };
  }

  // ===== 水果：苹果5 / 西瓜6 / 草莓8 / 金苹果15 =====
  const FRUITS = [
    { type:'apple',      pts:5,  p:0.70 },
    { type:'watermelon', pts:6,  p:0.15 },
    { type:'strawberry', pts:8,  p:0.10 },
    { type:'golden',     pts:15, p:0.05 },
  ];
  function rollFruit() {
    const r = Math.random();
    let acc = 0;
    for (const f of FRUITS) { acc += f.p; if (r < acc) return { type: f.type }; }
    return { type: 'apple' };
  }
  function fruitPts(type) { return FRUITS.find(f => f.type === type).pts; }

  // ===== 无限模式地图（每 100 分切换，循环）——与参数表地图同名 =====
  const MAPS = [
    { name:'青青草原', bg:'#dcf2d3', obs:0,  obsColor:'#7a9d6b' },
    { name:'金色沙漠', bg:'#f8e9c5', obs:6,  obsColor:'#c2955c' },
    { name:'冰雪世界', bg:'#ddeffb', obs:12, obsColor:'#74b3dc' },
    { name:'熔岩地狱', bg:'#fde4d4', obs:18, obsColor:'#e0703a' },
    { name:'星空夜幕', bg:'#e8e4fa', obs:24, obsColor:'#8f82cf' },
    { name:'神秘深渊', bg:'#d3f2e3', obs:30, obsColor:'#3ea878' },
  ];

  // ===== 存档（v3：60 关 + 星级）=====
  const SAVE_KEY = 'snake_v3';
  let save = { unlocked:1, cleared:{}, bestLevel:{}, endlessBest:0 };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch(e){}
  if (save.unlocked < 1) save.unlocked = 1;
  // 兼容：cleared 值统一为星数 1-3
  for (const k of Object.keys(save.cleared)) {
    const v = save.cleared[k];
    save.cleared[k] = typeof v === 'number' ? Math.max(1, Math.min(3, v)) : 1;
  }
  function persist(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch(e){} }
  function starsOf(n) { return save.cleared[n] || 0; }

  // ===== 全局状态 =====
  let G = null;
  let stepTimer = null, countTimer = null;

  // ===== 主页渲染 =====
  const mapList = document.getElementById('mapList');
  const $ = id => document.getElementById(id);

  function renderHome() {
    mapList.innerHTML = '';
    let clearedTotal = 0;
    for (let m = 0; m < 6; m++) {
      const sec = document.createElement('div');
      sec.className = 'map-sec';
      const firstOfMap = m * 10 + 1;
      const mapLocked = firstOfMap > save.unlocked;
      let mapCleared = 0;
      let chips = '';
      for (let k = 1; k <= 10; k++) {
        const n = m * 10 + k;
        const st = starsOf(n);
        if (st > 0) clearedTotal++;
        const locked = n > save.unlocked;
        const cfg = levelCfg(n);
        if (st > 0) mapCleared++;
        const starStr = st > 0 ? `<div class="st">${'★'.repeat(st)}</div>` : '';
        const cls = 'chip' + (locked ? ' locked' : '') + (cfg.hard ? ' hard' : '') + (st > 0 ? ' cleared' : '');
        chips += `<div class="${cls}" data-n="${n}" title="${locked ? '未解锁' : `第${n}关 · ${cfg.obstacles}障碍${cfg.time ? ' · 限时' + cfg.time + 's' : ' · 无限时'} · 目标${cfg.target}分`}">${locked ? '' : k}${starStr}</div>`;
      }
      const head = `<div class="map-head${mapLocked ? ' locked' : ''}">
        <span>${mapLocked ? '🔒 ' : ''}${MAPS[m].name} · 第 ${firstOfMap}-${m*10+10} 关</span>
        <span class="prog">${mapCleared}/10 通关</span>
      </div>`;
      sec.innerHTML = head + `<div class="chips">${chips}</div>`;
      mapList.appendChild(sec);
    }
    // 绑定点击
    mapList.querySelectorAll('.chip:not(.locked)').forEach(el => {
      el.addEventListener('click', () => startLevel(+el.dataset.n));
    });
    $('endlessBest').textContent = '无限模式最高分：' + save.endlessBest;
    return clearedTotal;
  }

  $('modeLevel').addEventListener('click', () => startLevel(Math.min(save.unlocked, MAX_LEVEL)));
  $('modeEndless').addEventListener('click', startEndless);
  $('resetProgress').addEventListener('click', () => {
    if (confirm('确定要重置所有进度吗？')) {
      save = { unlocked:1, cleared:{}, bestLevel:{}, endlessBest:0 };
      persist(); renderHome();
    }
  });

  const homeEl = $('home'), gameEl = $('game');
  function showHome(){ homeEl.classList.remove('hidden'); gameEl.classList.add('hidden'); renderHome(); }

  // ===== 通用工具 =====
  function randFree(snake, obstacles) {
    let p, guard = 0;
    do {
      p = { x: Math.floor(Math.random()*SIZE), y: Math.floor(Math.random()*SIZE) };
      guard++;
    } while (guard < 500 && (
      snake.some(s => s.x===p.x && s.y===p.y) ||
      obstacles.some(o => o.x===p.x && o.y===p.y)
    ));
    return p;
  }

  function genObstacles(count, snake, food) {
    const blocked = new Set();
    snake.forEach(s => blocked.add(s.x + ',' + s.y));
    blocked.add(food.x + ',' + food.y);
    const head = snake[0];
    [[1,0],[2,0],[3,0],[0,1],[1,1],[-1,0],[0,-1]].forEach(([dx,dy]) =>
      blocked.add((head.x+dx) + ',' + (head.y+dy)));
    const obs = [];
    let guard = 0;
    while (obs.length < count && guard < count * 200) {
      guard++;
      const p = { x: Math.floor(Math.random()*SIZE), y: Math.floor(Math.random()*SIZE) };
      const key = p.x + ',' + p.y;
      if (blocked.has(key)) continue;
      blocked.add(key);
      obs.push(p);
    }
    return obs;
  }

  // ===== 开局 =====
  function newGame(mode, levelN, mapIdx) {
    const snake = [{x:9,y:10},{x:8,y:10},{x:7,y:10}];
    const food = randFree(snake, []);
    const cfg = mode === 'level' ? levelCfg(levelN) : null;
    const map = MAPS[mapIdx % MAPS.length];

    // 速度：闯关用表内数值；无限模式按地图序号 1~5 档
    const speedVal = mode === 'level' ? cfg.speed : Math.min(5, mapIdx + 1);
    const interval = mode === 'level' ? speedToInterval(cfg.speed) : speedToInterval(speedVal);

    G = {
      mode, levelN, cfg,
      mapIdx, map,
      speedInterval: interval,
      snake, dir:{x:1,y:0}, nextDir:{x:1,y:0},
      food: Object.assign(food, rollFruit()),
      obstacles: genObstacles(mode==='level' ? cfg.obstacles : map.obs, snake, food),
      score: 0,
      timeLeft: cfg && cfg.time != null ? cfg.time : null,
      running: true, paused: false, over: false,
    };

    // 顶栏
    if (mode === 'level') {
      $('lvTitle').innerHTML = `第 ${levelN} 关 <small>· ${map.name} ${cfg.inMap}/10</small>` + (cfg.hard ? '<span class="hardtag">难关</span>' : '');
      $('targetBox').classList.remove('hidden');
      $('target').textContent = cfg.target;
      const tb = $('timeBox');
      if (cfg.time != null) { tb.classList.remove('hidden'); tb.classList.remove('time-warn'); $('time').textContent = cfg.time; }
      else tb.classList.add('hidden');
      $('mapInfo').classList.add('hidden');
    } else {
      $('lvTitle').innerHTML = `♾️ 无限模式 <small>· 无时间限制</small>`;
      $('targetBox').classList.add('hidden');
      $('timeBox').classList.add('hidden');
      $('mapInfo').classList.remove('hidden');
    }
    $('score').textContent = '0';
    updateMapInfo();
    hideOverlay();
    $('pauseBtn').textContent = '暂停';

    draw();
    loopStep();
    if (G.timeLeft != null) startCountdown();
  }

  function startLevel(n) {
    homeEl.classList.add('hidden');
    gameEl.classList.remove('hidden');
    // 地图由关卡表决定：第 n 关固定属于第 floor((n-1)/10) 张地图
    newGame('level', n, Math.floor((n - 1) / 10));
  }
  function startEndless() {
    homeEl.classList.add('hidden');
    gameEl.classList.remove('hidden');
    newGame('endless', 0, 0);
  }

  function updateMapInfo() {
    if (G.mode !== 'endless') return;
    const next = (G.mapIdx + 1) * 100;
    $('mapInfo').textContent = `🗺️ 当前地图：${G.map.name}（${G.mapIdx+1}） · 再得 ${next - G.score} 分切换下一张地图`;
  }

  // ===== 绘制 =====
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h ^ (h >> 16)) >>> 0;
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    const t = G.map;
    const now = performance.now();
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const light = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 20, canvas.width/2, canvas.height/2, canvas.width*0.72);
    light.addColorStop(0, 'rgba(255,255,255,0.5)');
    light.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawDecor(now);
    G.obstacles.forEach(o => {
      const x = o.x*CELL, y = o.y*CELL;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      rr(x+2, y+4, CELL-4, CELL-4, 5); ctx.fill();
      ctx.fillStyle = t.obsColor;
      rr(x+1, y+1, CELL-2, CELL-2, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      rr(x+3, y+3, CELL-6, (CELL-6)/2.6, 4); ctx.fill();
    });
    drawFruit(G.food, now);
    drawSnake(now);
  }

  function drawDecor(now) {
    const m = G.mapIdx % MAPS.length;
    for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) {
      const h = hash2(x, y);
      if (h % 11 !== 0) continue;
      const cx = x*CELL + CELL/2, cy = y*CELL + CELL/2;
      const v = (h >> 5) % 3;
      switch (m) {
        case 0:
          ctx.strokeStyle = 'rgba(70,165,100,0.5)'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(cx-2, cy+3); ctx.lineTo(cx-2, cy-3);
          ctx.moveTo(cx+1, cy+3); ctx.lineTo(cx+3, cy-2);
          ctx.stroke();
          break;
        case 1:
          ctx.strokeStyle = 'rgba(190,148,78,0.4)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(cx, cy+4, 4, Math.PI*1.15, Math.PI*1.85); ctx.stroke();
          break;
        case 2:
          ctx.fillStyle = v===0 ? 'rgba(110,170,225,0.55)' : 'rgba(150,200,240,0.4)';
          ctx.beginPath(); ctx.arc(cx, cy, v===0 ? 1.6 : 1.1, 0, Math.PI*2); ctx.fill();
          break;
        case 3:
          ctx.fillStyle = `rgba(240,120,50,${0.3 + 0.3*Math.sin(now/300 + h%10)})`;
          ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI*2); ctx.fill();
          break;
        case 4:
          ctx.fillStyle = `rgba(125,105,210,${0.25 + 0.35*Math.abs(Math.sin(now/700 + h%10))})`;
          ctx.beginPath(); ctx.arc(cx, cy, v===0 ? 1.8 : 1.1, 0, Math.PI*2); ctx.fill();
          break;
        case 5:
          ctx.strokeStyle = 'rgba(45,160,110,0.4)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(cx, cy, 2.4 + (h>>7)%2, 0, Math.PI*2); ctx.stroke();
          break;
      }
    }
  }

  function snakeCenter(s) { return { x: s.x*CELL + CELL/2, y: s.y*CELL + CELL/2 }; }

  function strokeWrap(a, b, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) > CELL || Math.abs(dy) > CELL) {
      let wx = dx, wy = dy;
      if (wx > CELL) wx -= SIZE*CELL; else if (wx < -CELL) wx += SIZE*CELL;
      if (wy > CELL) wy -= SIZE*CELL; else if (wy < -CELL) wy += SIZE*CELL;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + wx*0.5, a.y + wy*0.5);
      ctx.moveTo(b.x - wx*0.5, b.y - wy*0.5);
      ctx.lineTo(b.x, b.y);
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  function drawSnake(now) {
    const n = G.snake.length;
    const pts = G.snake.map(snakeCenter);
    for (let i = n - 1; i >= 1; i--) {
      strokeWrap(pts[i], pts[i-1], CELL - 1, 'rgba(22,90,52,0.32)');
    }
    for (let i = n - 1; i >= 1; i--) {
      const light = Math.max(32, 50 - i * 1.8);
      strokeWrap(pts[i], pts[i-1], CELL - 4, `hsl(150, 58%, ${light}%)`);
    }
    const hc = pts[0];
    ctx.save();
    ctx.shadowColor = 'rgba(46,204,113,0.45)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath(); ctx.arc(hc.x, hc.y, CELL/2 - 1, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#1c7a44';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hc.x, hc.y, CELL/2 - 1, 0, Math.PI*2); ctx.stroke();
    const d = G.dir;
    const cx = hc.x, cy = hc.y;
    const f = CELL*0.18, s = CELL*0.21;
    [[-1],[1]].forEach(([side]) => {
      const ex = cx + d.x*f - d.y*s*side;
      const ey = cy + d.y*f + d.x*s*side;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, 2.7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(ex + d.x*1, ey + d.y*1, 1.4, 0, Math.PI*2); ctx.fill();
    });
    if (Math.floor(now / 260) % 3 !== 0) {
      const tx = cx + d.x*(CELL/2 - 2), ty = cy + d.y*(CELL/2 - 2);
      const mx = cx + d.x*(CELL/2 + 3), my = cy + d.y*(CELL/2 + 3);
      ctx.strokeStyle = '#ff5d7a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty); ctx.lineTo(mx, my);
      ctx.moveTo(mx, my); ctx.lineTo(mx + d.x*2 - d.y*1.6, my + d.y*2 + d.x*1.6);
      ctx.moveTo(mx, my); ctx.lineTo(mx + d.x*2 + d.y*1.6, my + d.y*2 - d.x*1.6);
      ctx.stroke();
    }
  }

  // ===== 水果绘制：苹果 / 西瓜 / 草莓 / 金苹果 =====
  function drawFruit(a, now) {
    const cx = a.x*CELL + CELL/2, cy = a.y*CELL + CELL/2;
    if (a.type === 'golden') {
      const r = CELL/2 - 2;
      ctx.save();
      ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14;
      const g = ctx.createRadialGradient(cx-r*0.35, cy-r*0.4, r*0.2, cx, cy, r);
      g.addColorStop(0, '#fff3c4'); g.addColorStop(0.5, '#ffd166'); g.addColorStop(1, '#d99a1e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      const a2 = 0.5 + 0.5*Math.sin(now/220);
      ctx.strokeStyle = `rgba(255,255,255,${a2})`;
      ctx.lineWidth = 1.4;
      const sx = cx + r*0.55, sy = cy - r*0.6;
      ctx.beginPath();
      ctx.moveTo(sx-3, sy); ctx.lineTo(sx+3, sy);
      ctx.moveTo(sx, sy-3); ctx.lineTo(sx, sy+3);
      ctx.stroke();
    } else if (a.type === 'watermelon') {
      const r = CELL/2 - 2.5;
      // 瓜身
      const g = ctx.createRadialGradient(cx-r*0.3, cy-r*0.35, r*0.2, cx, cy, r);
      g.addColorStop(0, '#9be27d'); g.addColorStop(0.6, '#4fbb4a'); g.addColorStop(1, '#2e8b3a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
      // 深绿条纹
      ctx.strokeStyle = 'rgba(24,90,40,0.75)';
      ctx.lineWidth = 1.6;
      for (const ang of [-0.9, -0.3, 0.3, 0.9]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r*0.95, r*0.95, 0, 0, 0); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang - 0.22)*r*0.9, cy + Math.sin(ang - 0.22)*r*0.9);
        ctx.quadraticCurveTo(cx + Math.cos(ang)*r*1.02, cy + Math.sin(ang)*r*1.02,
                             cx + Math.cos(ang + 0.22)*r*0.9, cy + Math.sin(ang + 0.22)*r*0.9);
        ctx.stroke();
      }
      // 卷曲瓜藤
      ctx.strokeStyle = '#5a8a2a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 1);
      ctx.quadraticCurveTo(cx - 2, cy - r - 3, cx + 2, cy - r - 3.5);
      ctx.stroke();
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(cx - r*0.35, cy - r*0.4, 2, 0, Math.PI*2); ctx.fill();
    } else if (a.type === 'strawberry') {
      const r = CELL/2 - 2.5;
      // 心形果身（上宽下尖）
      ctx.save();
      ctx.shadowColor = 'rgba(233,69,96,0.4)'; ctx.shadowBlur = 6;
      const g = ctx.createRadialGradient(cx - r*0.3, cy - r*0.35, r*0.2, cx, cy, r);
      g.addColorStop(0, '#ffb3c1'); g.addColorStop(0.55, '#ff5d7a'); g.addColorStop(1, '#c9274d');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy + r);
      ctx.bezierCurveTo(cx - r*1.15, cy + r*0.25, cx - r*0.95, cy - r*0.75, cx, cy - r*0.55);
      ctx.bezierCurveTo(cx + r*0.95, cy - r*0.75, cx + r*1.15, cy + r*0.25, cx, cy + r);
      ctx.fill();
      ctx.restore();
      // 籽
      ctx.fillStyle = '#ffe9a0';
      [[-3,-1],[3,-1],[0,2],[-2,4],[2,4],[0,-4]].forEach(([dx,dy]) => {
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, 0.9, 1.3, 0, 0, Math.PI*2);
        ctx.fill();
      });
      // 蒂叶
      ctx.fillStyle = '#3dc46f';
      for (const ang of [-1.1, -0.45, 0.45, 1.1]) {
        ctx.save();
        ctx.translate(cx, cy - r*0.5);
        ctx.rotate(ang);
        ctx.beginPath(); ctx.ellipse(0, -2.5, 1.6, 3.2, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    } else {
      // 苹果
      const r = CELL/2 - 4;
      const g = ctx.createRadialGradient(cx-r*0.35, cy-r*0.4, r*0.2, cx, cy, r);
      g.addColorStop(0, '#ff7a8c'); g.addColorStop(0.55, '#e94560'); g.addColorStop(1, '#9c1c31');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy+0.5, r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#7a4a21';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 1);
      ctx.quadraticCurveTo(cx + 1.5, cy - r - 2.5, cx + 3, cy - r - 3.5);
      ctx.stroke();
      ctx.fillStyle = '#3dc46f';
      ctx.save();
      ctx.translate(cx + 4.5, cy - r - 2);
      ctx.rotate(-0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 1.7, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(cx - r*0.4, cy - r*0.42, 1.6, 0, Math.PI*2); ctx.fill();
    }
  }

  // ===== 主循环 =====
  function loopStep() {
    if (G && G.running && !G.paused && !G.over) {
      step();
      if (G && !G.over) stepTimer = setTimeout(loopStep, G.speedInterval);
    }
  }

  function step() {
    G.dir = G.nextDir;
    let head = { x: G.snake[0].x + G.dir.x, y: G.snake[0].y + G.dir.y };
    if (head.x < 0) head.x = SIZE-1; else if (head.x >= SIZE) head.x = 0;
    if (head.y < 0) head.y = SIZE-1; else if (head.y >= SIZE) head.y = 0;

    if (G.obstacles.some(o => o.x===head.x && o.y===head.y)) return lose('撞上了障碍物！');
    if (G.snake.some(s => s.x===head.x && s.y===head.y)) return lose('咬到自己了！');

    G.snake.unshift(head);

    if (head.x===G.food.x && head.y===G.food.y) {
      G.score += fruitPts(G.food.type);
      $('score').textContent = G.score;
      if (G.mode === 'endless') {
        while (G.score >= (G.mapIdx + 1) * 100) switchMap();
      }
      // 通关判定：基础分达到目标分
      if (G.mode === 'level' && G.score >= G.cfg.target) return win();
      G.food = Object.assign(randFree(G.snake, G.obstacles), rollFruit());
    } else {
      G.snake.pop();
    }
    draw();
  }

  function switchMap() {
    G.mapIdx++;
    G.map = MAPS[G.mapIdx % MAPS.length];
    G.speedInterval = speedToInterval(Math.min(5, G.mapIdx + 1));
    G.obstacles = genObstacles(G.map.obs, G.snake, G.food);
    updateMapInfo();
    const tip = G.mapIdx + 1 > 1 ? ' · 速度提升！' : '';
    showToast(`进入地图：${G.map.name}！${tip}`);
  }

  const toast = $('toast');
  let toastTimer = null;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function startCountdown() {
    clearInterval(countTimer);
    countTimer = setInterval(() => {
      if (!G || G.paused || G.over || G.timeLeft == null) return;
      G.timeLeft--;
      $('time').textContent = G.timeLeft;
      if (G.timeLeft <= 10) $('timeBox').classList.add('time-warn');
      if (G.timeLeft <= 0) { clearInterval(countTimer); lose('时间到！'); }
    }, 1000);
  }

  // ===== 胜负 =====
  function starsFor(cfg, timeLeft) {
    if (cfg.time == null || timeLeft == null) return 1;   // 无限时只有 1 星
    const ratio = timeLeft / cfg.time;
    if (ratio >= 0.7) return 3;
    if (ratio >= 0.3) return 2;
    return 1;
  }

  function win() {
    G.over = true; G.running = false;
    clearTimeout(stepTimer); clearInterval(countTimer);
    const n = G.levelN;
    const base = G.score;
    const bonus = G.timeLeft != null ? G.timeLeft : 0;
    const total = base + bonus;
    const stars = starsFor(G.cfg, G.timeLeft);

    save.cleared[n] = Math.max(starsOf(n), stars);
    if (!save.bestLevel[n] || total > save.bestLevel[n]) save.bestLevel[n] = total;
    if (n === save.unlocked && n < MAX_LEVEL) save.unlocked = n + 1;
    persist();

    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const last = n === MAX_LEVEL;
    showOverlay(
      last ? '🏆 全部 60 关通关！' : (stars === 3 ? '⭐⭐⭐ 完美通关！' : '🎉 过关！'),
      `${'　'}<span style="color:#d4a017;font-size:18px">${starStr}</span><br>` +
      `基础分 <b>${base}</b> + 时间奖励 <b>${bonus}</b> = 总分 <b>${total}</b><br>` +
      (last ? '恭喜你征服全部 6 张地图！' :
       (G.cfg.hard ? '难关征服成功！' : '') +
       `${n + 1 > save.unlocked - 1 ? (n < MAX_LEVEL ? '下一关已解锁' : '') : ''}`),
      last
        ? [['返回主页', showHome, 'btn-sec'], ['重玩本关', () => startLevel(n), '']]
        : [['下一关 ▶', () => startLevel(n + 1), ''], ['返回主页', showHome, 'btn-sec']]
    );
  }

  function lose(reason) {
    G.over = true; G.running = false;
    clearTimeout(stepTimer); clearInterval(countTimer);
    let extra = '';
    if (G.mode === 'endless') {
      if (G.score > save.endlessBest) { save.endlessBest = G.score; persist(); extra = '<br>🏆 新纪录！'; }
      else extra = `<br>最高分 ${save.endlessBest}`;
    } else {
      const n = G.levelN;
      if (!save.bestLevel[n] || G.score > save.bestLevel[n]) { save.bestLevel[n] = G.score; persist(); }
    }
    showOverlay('💀 游戏结束', `${reason}<br>得分 <b>${G.score}</b>${extra}`,
      [['再来一次', retry, ''], ['返回主页', showHome, 'btn-sec']]);
  }

  function retry() {
    if (G.mode === 'level') startLevel(G.levelN);
    else startEndless();
  }

  // ===== 覆盖层 =====
  const overlay = $('overlay'), ovTitle = $('ovTitle'), ovText = $('ovText'), ovBtns = $('ovBtns');
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
  function hideOverlay(){ overlay.classList.add('hidden'); }

  // ===== 控制 =====
  function setDir(d) {
    if (!G || !G.running || G.paused || G.over) return;
    if (d.x === -G.dir.x && d.y === -G.dir.y) return;
    G.nextDir = d;
  }

  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k) || ['w','a','s','d','p'].includes(k)) e.preventDefault();
    if (gameEl.classList.contains('hidden')) return;
    if (k === ' ' || k === 'p') { togglePause(); return; }
    if (k === 'arrowup' || k === 'w') setDir({x:0,y:-1});
    else if (k === 'arrowdown' || k === 's') setDir({x:0,y:1});
    else if (k === 'arrowleft' || k === 'a') setDir({x:-1,y:0});
    else if (k === 'arrowright' || k === 'd') setDir({x:1,y:0});
  });

  $('pauseBtn').addEventListener('click', togglePause);
  $('quitBtn').addEventListener('click', () => {
    if (G) { G.running = false; clearTimeout(stepTimer); clearInterval(countTimer); }
    showHome();
  });

  function togglePause() {
    if (!G || G.over || !G.running) return;
    G.paused = !G.paused;
    $('pauseBtn').textContent = G.paused ? '继续' : '暂停';
    if (G.paused) clearTimeout(stepTimer);
    else loopStep();
  }

  document.querySelectorAll('.dpad button').forEach(b => {
    b.addEventListener('click', () => {
      const d = b.dataset.dir;
      if (d==='up') setDir({x:0,y:-1});
      if (d==='down') setDir({x:0,y:1});
      if (d==='left') setDir({x:-1,y:0});
      if (d==='right') setDir({x:1,y:0});
    });
  });

  showHome();
})();
