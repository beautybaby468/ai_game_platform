(() => {
  'use strict';
  // ============================================================
  // 记忆翻牌 · 20 关
  // 牌阵五段：入门4x3 → 基础4x4 → 进阶5x4 → 高阶6x4 → 挑战6x5
  // 主题四段：易(水果动物) → 中(几何表情) → 难(同色系/字母数字) → 特殊(镜像旋转)
  // ============================================================
  const board = document.getElementById('board');
  const levelEl = document.getElementById('level');
  const movesEl = document.getElementById('moves');
  const pairsEl = document.getElementById('pairs');
  const timerEl = document.getElementById('timer');
  const tierInfo = document.getElementById('tierInfo');
  const overlay = document.getElementById('overlay');

  // ===== 牌阵规格（按关卡段）=====
  const TIER = [
    { name: '入门', rows: 3, cols: 4, pairs: 6 },
    { name: '基础', rows: 4, cols: 4, pairs: 8 },
    { name: '进阶', rows: 4, cols: 5, pairs: 10 },
    { name: '高阶', rows: 4, cols: 6, pairs: 12 },
    { name: '挑战', rows: 5, cols: 6, pairs: 15 },
  ];
  const MAX_LEVEL = 20;

  // ===== 图案主题（按 5 关递进）=====
  const THEMES = [
    { name: '易', desc: '水果 · 动物' },
    { name: '中', desc: '几何 · 表情' },
    { name: '难', desc: '同色系 · 字母数字' },
    { name: '特殊', desc: '镜像 / 旋转' },
  ];

  const POOL_EASY = ['🍎','🍌','🍇','🍓','🐶','🐱','🐼','🦊','🐸','🐷','🐰','🐵','🐔','🦁','🐙','🐮'];
  const POOL_MID  = ['🔵','🔺','🟩','⬛','🟠','⭐','💠','🔶','😀','😎','😢','😡','🤖','😴','🤩','🥳'];
  const POOL_HARD = ['O','0','1','l','I','6','9','S','5','2','Z','B','8','Q','D','G'];
  // 特殊主题：成对的镜像 / 旋转图案（配对 = 互为镜像的两张）
  const MIRROR_PAIRS = [
    ['b','d'], ['p','q'], ['6','9'], ['M','W'], ['⟲','⟳'],
    ['◀','▶'], ['🔺','🔻'], ['↖','↗'], ['↘','↙'], ['⬅','➡'],
    ['⬆','⬇'], ['(', ')'], ['⊂','⊃'], ['«','»'], ['∴','∵'],
  ];

  const $ = id => document.getElementById(id);

  // ===== 存档 =====
  const SAVE_KEY = 'memory2_save';
  let save = { unlocked: 1, best: {} };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

  // ===== 状态 =====
  let level = 1, deck = [], moves = 0, matched = 0, totalPairs = 6;
  let first = null, lock = false, started = false, over = false;
  let timer = 0, timerInt = null;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function tierOf(lvl) { return TIER[Math.floor((lvl - 1) / 4)]; }
  function themeIdx(lvl) { return Math.min(3, Math.floor((lvl - 1) / 5)); }

  // ===== 开局 =====
  function startLevel(lvl) {
    level = lvl;
    const tier = tierOf(lvl);
    const theme = THEMES[themeIdx(lvl)];
    totalPairs = tier.pairs;

    // 构建牌堆
    let cards;
    if (themeIdx(lvl) === 3) {
      // 特殊主题：镜像 / 旋转对（同 pid，不同图案）
      const pairs = shuffle(MIRROR_PAIRS.slice()).slice(0, tier.pairs);
      cards = pairs.flatMap((p, i) => [
        { emoji: p[0], pid: i },
        { emoji: p[1], pid: i },
      ]);
    } else {
      const pool = themeIdx(lvl) === 0 ? POOL_EASY : themeIdx(lvl) === 1 ? POOL_MID : POOL_HARD;
      const picked = shuffle(pool.slice()).slice(0, tier.pairs);
      cards = picked.flatMap((e, i) => [
        { emoji: e, pid: i },
        { emoji: e, pid: i },
      ]);
    }
    deck = shuffle(cards).map(c => ({ ...c, matched: false, flipped: false }));

    moves = 0; matched = 0;
    first = null; lock = false;
    started = false; over = false;
    timer = 0; clearInterval(timerInt);
    $('level').textContent = lvl;
    $('moves').textContent = '0';
    $('pairs').textContent = `0/${tier.pairs}`;
    $('timer').textContent = '0';
    tierInfo.textContent = `${tier.name}牌阵 ${tier.rows}×${tier.cols}（${tier.pairs} 对） · 主题【${theme.name}】${theme.desc}`;
    hideOverlay();
    render(tier);
  }

  function render(tier) {
    board.className = 'board t' + Math.floor((level - 1) / 4);
    board.style.gridTemplateColumns = `repeat(${tier.cols}, var(--cs))`;
    board.innerHTML = '';
    deck.forEach((card, i) => {
      const b = document.createElement('button');
      b.className = 'mcard';
      b.innerHTML = `<div class="inner">
        <div class="face front">?</div>
        <div class="face back">${card.emoji}</div>
      </div>`;
      if (card.flipped || card.matched) b.classList.add('flipped');
      if (card.matched) b.classList.add('matched');
      b.addEventListener('click', () => onFlip(i));
      board.appendChild(b);
    });
  }

  function startTimer() {
    clearInterval(timerInt);
    timerInt = setInterval(() => { timer++; $('timer').textContent = timer; }, 1000);
  }

  function onFlip(i) {
    if (over || lock) return;
    const card = deck[i];
    if (card.matched || card.flipped) return;
    if (!started) { started = true; startTimer(); }

    card.flipped = true;
    board.children[i].classList.add('flipped');

    if (first == null) { first = i; return; }

    // 第二张：按配对 id 判定（特殊主题两张图案不同但互为镜像）
    moves++;
    $('moves').textContent = moves;
    const j = first;
    first = null;

    if (deck[j].pid === card.pid) {
      deck[j].matched = card.matched = true;
      matched++;
      $('pairs').textContent = `${matched}/${totalPairs}`;
      board.children[j].classList.add('matched');
      board.children[i].classList.add('matched');
      if (matched === totalPairs) win();
    } else {
      lock = true;
      setTimeout(() => {
        deck[j].flipped = card.flipped = false;
        board.children[j].classList.remove('flipped');
        board.children[i].classList.remove('flipped');
        lock = false;
      }, 700);
    }
  }

  function win() {
    over = true;
    clearInterval(timerInt);
    const prev = save.best[level];
    let record = false;
    if (!prev || moves < prev.moves) {
      save.best[level] = { moves, time: prev ? Math.min(timer, prev.time || timer) : timer };
      persist();
      record = true;
    }

    // 通关节点：每 4 关一个牌阵段，每 5 关一个主题段
    const tier = tierOf(level);
    const theme = THEMES[themeIdx(level)];
    const milestone = level % 4 === 0 && level % 5 === 0 ? `<br>✨ ${tier.name}牌阵 · ${theme.name}主题挑战完成！` : '';

    if (level >= save.unlocked && level < MAX_LEVEL) save.unlocked = level + 1;
    persist();

    const isLast = level === MAX_LEVEL;
    showOverlay(isLast ? '🏆 全部 20 关通关！' : '🎉 配对完成！',
      `${tier.name} · ${theme.name}主题 · 步数 <b>${moves}</b> · 用时 ${timer} 秒` +
      (record ? '<br>🏆 步数新纪录！' : '') + milestone,
      isLast
        ? [['选关回看', showSelect, 'primary'], ['重玩', () => startLevel(level), '']]
        : [['下一关 ▶', () => startLevel(level + 1), 'primary'], ['选关', showSelect, '']]);
  }

  // ===== 选关 =====
  function showSelect() {
    over = true;
    clearInterval(timerInt);
    tierInfo.textContent = '请选择关卡开始 · 通关当前关解锁下一关';
    let chips = '';
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const locked = n > save.unlocked;
      const tier = tierOf(n);
      const theme = THEMES[themeIdx(n)];
      const bm = save.best[n];
      chips += `<div class="lvl${locked ? ' locked' : ''}${bm ? ' cleared' : ''}" data-n="${n}">
        ${locked ? '' : n}
        ${locked ? '' : `<div class="tn">${theme.name}·${tier.pairs}对</div>`}
        ${bm && !locked ? `<div class="bm">${bm.moves}步</div>` : ''}
      </div>`;
    }
    overlay.innerHTML = `<h2>🃏 选择关卡</h2>
      <p>牌阵五段递增 · 主题四段变化（易→中→难→特殊镜像）<br>点击卡片开始对应关卡</p>
      <div class="lvl-grid">${chips}</div>
      <div class="pin"><button class="primary" id="continueBtn">继续闯关 ▶</button></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelectorAll('.lvl:not(.locked)').forEach(el => {
      el.addEventListener('click', () => startLevel(+el.dataset.n));
    });
    overlay.querySelector('#continueBtn').addEventListener('click', () => startLevel(Math.min(save.unlocked, MAX_LEVEL)));
  }

  function showOverlay(title, html, btns, stars) {
    const starHtml = stars ? `<div class="stars">${stars}</div>` : '';
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

  // ===== 控制 =====
  $('selectBtn').addEventListener('click', showSelect);
  $('restartBtn').addEventListener('click', () => startLevel(level));

  showSelect();
})();
