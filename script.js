(() => {
  const $ = id => document.getElementById(id);

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function readInt(key) {
    try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function set(id, text) { const el = $(id); if (el) el.textContent = text; }
  function clearLoading() {
    document.querySelectorAll('.stat').forEach(el => {
      if (el.textContent === '加载中…') el.textContent = '暂无纪录 · 快去创造！';
    });
  }

  // 贪吃蛇
  const snakeSave = readJSON('snake_v2');
  const endlessBest = snakeSave && snakeSave.endlessBest ? snakeSave.endlessBest : 0;
  const cleared = snakeSave && snakeSave.cleared ? Object.keys(snakeSave.cleared).length : 0;
  set('snakeStat', `无限最高 ${endlessBest} 分 · 通关 ${cleared} 关`);

  // 俄罗斯方块
  set('tetrisStat', `最高分：${readInt('tetris_high')}`);

  // 2048
  set('g2048Stat', `最高分：${readInt('2048_best')}`);

  // 打砖块（20 关进度）
  const boSave = readJSON('breakout2_save');
  const boCleared = boSave && boSave.stars ? Object.keys(boSave.stars).length : 0;
  set('breakoutStat', `已通关 ${boCleared}/20 关`);

  // 扫雷（最高分）
  const minesBest = readJSON('minesweeper_best') || {};
  const mineScores = Object.values(minesBest).filter(v => v && typeof v.score === 'number').map(v => v.score);
  set('minesStat', mineScores.length ? `扫雷最高分：${Math.max(...mineScores)}` : '');

  // 记忆翻牌（20 关进度）
  const memSave = readJSON('memory2_save');
  const memCleared = memSave && memSave.best ? Object.keys(memSave.best).length : 0;
  set('memoryStat', `已通关 ${memCleared}/20 关`);

  // Flappy
  set('flappyStat', `最高分：${readInt('flappy_best')}`);

  // 五子棋（人机战绩）
  const gomoku = readJSON('gomoku_stats') || { w: 0, l: 0 };
  if (gomoku.w || gomoku.l) set('gomokuStat', `人机战绩：${gomoku.w}胜 ${gomoku.l}负`);

  // 数独（最快用时）
  const sudokuBest = readJSON('sudoku_best') || {};
  const sudokuTimes = Object.values(sudokuBest).filter(v => typeof v === 'number');
  set('sudokuStat', sudokuTimes.length ? `最快完成：${Math.min(...sudokuTimes)} 秒` : '');

  // 跳一跳
  set('jumpStat', `最高分：${readInt('jump_best')}`);

  clearLoading();
})();
