/*
 * app.js —— 界面与教学流程控制
 * 负责：Canvas 棋盘绘制、交互落子、课程目标判定、AI 应手、自由对弈与数子。
 */

(function (global) {
  'use strict';

  const { GoBoard, BLACK, WHITE, EMPTY } = global.Go;
  const AI = global.GoAI;
  const LESSONS = global.GoLessons;

  /* ---------------- 状态 ---------------- */
  const state = {
    board: null,
    lesson: null,
    lessonIndex: 0,
    placedThisLesson: 0,
    completed: loadProgress(),
    busy: false,           // AI 思考 / 动画期间锁定输入
    hoverPt: null,
    ladderStep: 0,
    consecutivePasses: 0,
    mode: 'lesson',        // 'lesson' | 'sandbox'
    sandboxVsAI: true,
    humanColor: BLACK,
  };

  /* ---------------- DOM ---------------- */
  let canvas, ctx, els;
  const CELL = global.GoRender.CELL;     // 每路像素
  const MARGIN = global.GoRender.MARGIN; // 边距

  function $(sel) {
    return document.querySelector(sel);
  }

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem('go_progress') || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveProgress() {
    try {
      localStorage.setItem('go_progress', JSON.stringify(state.completed));
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    canvas = $('#board');
    ctx = canvas.getContext('2d');
    els = {
      lessonList: $('#lesson-list'),
      title: $('#panel-title'),
      chapter: $('#panel-chapter'),
      intro: $('#panel-intro'),
      status: $('#panel-status'),
      hintBtn: $('#btn-hint'),
      hintBox: $('#hint-box'),
      resetBtn: $('#btn-reset'),
      prevBtn: $('#btn-prev'),
      nextBtn: $('#btn-next'),
      passBtn: $('#btn-pass'),
      undoBtn: $('#btn-undo'),
      score: $('#score-box'),
      sandboxBtn: $('#btn-sandbox'),
      sizeSel: $('#size-select'),
      aiToggle: $('#ai-toggle'),
      sandboxControls: $('#sandbox-controls'),
      turnDot: $('#turn-dot'),
    };

    buildLessonList();

    canvas.addEventListener('click', onBoardClick);
    canvas.addEventListener('mousemove', onBoardHover);
    canvas.addEventListener('mouseleave', () => {
      state.hoverPt = null;
      render();
    });

    els.hintBtn.addEventListener('click', toggleHint);
    els.resetBtn.addEventListener('click', () => loadLesson(state.lessonIndex));
    els.prevBtn.addEventListener('click', () => {
      if (state.lessonIndex > 0) { exitSandbox(); loadLesson(state.lessonIndex - 1); }
    });
    els.nextBtn.addEventListener('click', () => {
      if (state.lessonIndex < LESSONS.length - 1) { exitSandbox(); loadLesson(state.lessonIndex + 1); }
    });
    els.passBtn.addEventListener('click', onPass);
    els.undoBtn.addEventListener('click', onUndo);
    els.sandboxBtn.addEventListener('click', toggleSandbox);
    els.sizeSel.addEventListener('change', () => { if (state.mode === 'sandbox') startSandbox(); });
    els.aiToggle.addEventListener('change', () => { state.sandboxVsAI = els.aiToggle.checked; });

    loadLesson(0);
    window.addEventListener('resize', render);
  }

  /* ---------------- 课程列表 ---------------- */
  function buildLessonList() {
    els.lessonList.innerHTML = '';
    let currentChapter = '';
    LESSONS.forEach((les, i) => {
      if (les.chapter !== currentChapter) {
        currentChapter = les.chapter;
        const h = document.createElement('div');
        h.className = 'chapter-head';
        h.textContent = les.chapter;
        els.lessonList.appendChild(h);
      }
      const item = document.createElement('button');
      item.className = 'lesson-item';
      item.dataset.index = i;
      const done = state.completed[les.id];
      item.innerHTML =
        '<span class="dot ' + (done ? 'done' : '') + '">' + (done ? '✓' : i + 1) + '</span>' +
        '<span class="lname">' + les.title + '</span>';
      item.addEventListener('click', () => { exitSandbox(); loadLesson(i); });
      els.lessonList.appendChild(item);
    });
  }

  function refreshLessonList() {
    [...els.lessonList.querySelectorAll('.lesson-item')].forEach((item) => {
      const i = +item.dataset.index;
      item.classList.toggle('active', i === state.lessonIndex && state.mode === 'lesson');
      const les = LESSONS[i];
      const dot = item.querySelector('.dot');
      if (state.completed[les.id]) {
        dot.classList.add('done');
        dot.textContent = '✓';
      }
    });
  }

  /* ---------------- 加载关卡 ---------------- */
  function loadLesson(index) {
    state.mode = 'lesson';
    state.lessonIndex = index;
    const les = LESSONS[index];
    state.lesson = les;
    state.board = new GoBoard(les.size);
    for (const [x, y] of les.setup.black) state.board.set(x, y, BLACK);
    for (const [x, y] of les.setup.white) state.board.set(x, y, WHITE);
    state.board.turn = BLACK;
    state.placedThisLesson = 0;
    state.ladderStep = 0;
    state.consecutivePasses = 0;
    state.busy = false;
    state.hoverPt = null;

    els.chapter.textContent = les.chapter;
    els.title.textContent = (index + 1) + '. ' + les.title;
    els.intro.innerHTML = les.intro;
    els.hintBox.classList.add('hidden');
    els.hintBox.innerHTML = '';
    setStatus('', '');

    const isFree = les.goal.type === 'freePlay';
    els.passBtn.classList.toggle('hidden', !isFree);
    els.undoBtn.classList.toggle('hidden', !isFree);
    els.sandboxControls.classList.add('hidden');
    els.score.classList.toggle('hidden', !(les.options && les.options.showScore));

    els.prevBtn.disabled = index === 0;
    els.nextBtn.disabled = index === LESSONS.length - 1;

    resizeCanvas();
    refreshLessonList();
    updateScore();
    render();
  }

  /* ---------------- 沙盘自由对弈 ---------------- */
  function toggleSandbox() {
    if (state.mode === 'sandbox') {
      exitSandbox();
      loadLesson(state.lessonIndex);
    } else {
      startSandbox();
    }
  }
  function exitSandbox() {
    state.mode = 'lesson';
    els.sandboxBtn.classList.remove('active');
    els.sandboxControls.classList.add('hidden');
  }
  function startSandbox() {
    state.mode = 'sandbox';
    els.sandboxBtn.classList.add('active');
    const size = +els.sizeSel.value;
    state.board = new GoBoard(size);
    state.consecutivePasses = 0;
    state.busy = false;
    state.humanColor = BLACK;
    state.sandboxVsAI = els.aiToggle.checked;

    els.chapter.textContent = '自由模式';
    els.title.textContent = '沙盘 / 自由对弈（' + size + ' 路）';
    els.intro.innerHTML =
      '在这里自由练习。可切换棋盘大小、是否对战 AI。' +
      '点击落子，使用“停一手”虚手、“悔棋”撤销。双方连续停一手即终局数子。';
    els.hintBox.classList.add('hidden');
    setStatus('', '');
    els.passBtn.classList.remove('hidden');
    els.undoBtn.classList.remove('hidden');
    els.sandboxControls.classList.remove('hidden');
    els.score.classList.remove('hidden');

    refreshLessonList();
    resizeCanvas();
    updateScore();
    render();
  }

  /* ---------------- 画布尺寸 ---------------- */
  function resizeCanvas() {
    const n = state.board.size;
    const px = MARGIN * 2 + CELL * (n - 1);
    canvas.width = px;
    canvas.height = px;
    // 自适应缩放（CSS 控制显示大小）
    const maxDisp = Math.min(620, window.innerWidth - 380);
    const disp = Math.max(300, maxDisp);
    canvas.style.width = disp + 'px';
    canvas.style.height = disp + 'px';
  }

  function boardToPixel(x, y) {
    return [MARGIN + x * CELL, MARGIN + y * CELL];
  }
  function pixelToBoard(px, py) {
    const x = Math.round((px - MARGIN) / CELL);
    const y = Math.round((py - MARGIN) / CELL);
    if (!state.board.inBounds(x, y)) return null;
    // 命中容差
    const [cx, cy] = boardToPixel(x, y);
    if (Math.hypot(px - cx, py - cy) > CELL * 0.5) return null;
    return [x, y];
  }

  /* ---------------- 渲染（委托给 GoRender） ---------------- */
  function render() {
    const b = state.board;
    const les = state.lesson;
    const opts = {};

    // 教学高亮：气 / 征子推荐点
    if (state.mode === 'lesson' && les && les.options) {
      if (les.options.showLiberties) opts.showLiberties = les.options.showLiberties;
      if (les.goal.type === 'ladder' && les.goal.recommend) {
        opts.ladderRecommend = les.goal.recommend[state.ladderStep];
      }
    }

    // 落子预览
    if (state.hoverPt && !state.busy && canPlayNow()) {
      const [hx, hy] = state.hoverPt;
      if (b.get(hx, hy) === EMPTY) {
        opts.hover = { x: hx, y: hy, color: currentHumanColor() };
      }
    }

    global.GoRender.draw(ctx, b, opts);
    updateTurnDot();
  }

  function updateTurnDot() {
    if (!els.turnDot) return;
    const color = currentHumanColor();
    els.turnDot.className = 'turn-dot ' + (state.board.turn === BLACK ? 'black' : 'white');
  }

  /* ---------------- 交互 ---------------- */
  function currentHumanColor() {
    if (state.mode === 'sandbox') return state.board.turn;
    return BLACK; // 教学关卡中玩家恒执黑
  }

  function canPlayNow() {
    if (state.busy) return false;
    if (state.mode === 'sandbox') {
      if (state.sandboxVsAI && state.board.turn !== state.humanColor) return false;
      return true;
    }
    // 教学：完成的关卡不再接受落子（除自由对弈外）
    if (state.lesson.goal.type !== 'freePlay' && state.completed[state.lesson.id] && state.lessonDone) {
      return false;
    }
    return true;
  }

  function onBoardHover(e) {
    const pt = eventToBoard(e);
    const changed = JSON.stringify(pt) !== JSON.stringify(state.hoverPt);
    state.hoverPt = pt;
    if (changed) render();
  }

  function eventToBoard(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return pixelToBoard(px, py);
  }

  function onBoardClick(e) {
    if (!canPlayNow()) return;
    const pt = eventToBoard(e);
    if (!pt) return;
    const color = currentHumanColor();
    const b = state.board;

    if (b.get(pt[0], pt[1]) !== EMPTY) return;
    if (!b.isLegal(pt[0], pt[1], color)) {
      flashIllegal(pt);
      return;
    }

    if (state.mode === 'sandbox') {
      b.play(pt[0], pt[1], color);
      state.consecutivePasses = 0;
      render();
      updateScore();
      if (state.sandboxVsAI && b.turn !== state.humanColor) {
        scheduleAI(state.humanColor === BLACK ? WHITE : BLACK);
      }
      return;
    }

    handleLessonMove(pt, color);
  }

  function flashIllegal(pt) {
    const [px, py] = boardToPixel(pt[0], pt[1]);
    ctx.strokeStyle = 'rgba(220,40,40,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, CELL * 0.4, 0, Math.PI * 2); ctx.stroke();
    let reason = state.board.testMove(pt[0], pt[1], currentHumanColor()).reason || '此处不可下';
    setStatus(reason, 'warn');
    setTimeout(render, 350);
  }

  /* ---------------- 教学落子处理 ---------------- */
  function handleLessonMove(pt, color) {
    const les = state.lesson;
    const goal = les.goal;
    const b = state.board;

    // 征子专属流程
    if (goal.type === 'ladder') {
      return handleLadderMove(pt);
    }

    const res = b.play(pt[0], pt[1], color);
    if (!res) { flashIllegal(pt); return; }
    state.placedThisLesson++;
    state.consecutivePasses = 0;

    // freePlay：交给 AI
    if (goal.type === 'freePlay') {
      render(); updateScore();
      if (les.options && les.options.responder) scheduleAI(WHITE);
      return;
    }

    // 非自由关卡：若设置了对手应手则让其回应（多数教学关 noOpponent）
    render();

    if (checkGoal()) {
      onLessonSuccess();
      return;
    }

    // noOpponent 关卡：玩家继续落黑（保持黑方行棋）
    if (les.options && les.options.noOpponent) {
      b.turn = BLACK;
      render();
    } else if (les.options && les.options.responder) {
      scheduleAI(WHITE);
    }
  }

  function handleLadderMove(pt) {
    const les = state.lesson;
    const b = state.board;
    const target = les.goal.target;

    if (!b.isLegal(pt[0], pt[1], BLACK)) { flashIllegal(pt); return; }
    b.play(pt[0], pt[1], BLACK);
    render();

    // 目标是否已被提
    if (!targetAlive(target)) { onLessonSuccess(); return; }

    // 找到被追白块的代表坐标
    const ws = findChasedWhite(target);
    if (!ws) { onLessonSuccess(); return; }

    const libs = b.countLiberties(ws[0], ws[1]);
    if (libs >= 3) {
      setStatus('白棋逃出了（气≥3）。征子失败，点击“重来”再试一次。', 'warn');
      state.busy = true;
      return;
    }
    if (libs === 1) {
      // 白棋被打吃 → 自动逃跑（escapeOnly）
      state.busy = true;
      setTimeout(() => {
        const mv = AI.chooseMove(b, WHITE, { escapeOnly: true });
        if (mv.pass || !b.play(mv.x, mv.y, WHITE)) {
          // 无法逃 → 玩家下一手即可提，保持现状
        }
        state.ladderStep = Math.min(state.ladderStep + 1, (les.goal.recommend || []).length - 1);
        state.busy = false;
        render();
        if (!targetAlive(target)) onLessonSuccess();
      }, 320);
    } else {
      // 玩家这手没有形成打吃
      setStatus('这一手没有打吃到白棋。请打在让白棋只剩一口气的点上（见红圈提示）。', 'warn');
    }
  }

  function findChasedWhite(target) {
    const b = state.board;
    if (b.get(target[0], target[1]) === WHITE) {
      const g = b.group(target[0], target[1]);
      return g.stones[0];
    }
    return null;
  }

  function targetAlive(target) {
    return state.board.get(target[0], target[1]) === WHITE;
  }

  /* ---------------- 目标判定 ---------------- */
  function checkGoal() {
    const b = state.board;
    const goal = state.lesson.goal;
    switch (goal.type) {
      case 'placeCount':
        return state.placedThisLesson >= goal.count;
      case 'atari': {
        const [x, y] = goal.target;
        return b.get(x, y) !== EMPTY && b.countLiberties(x, y) === 1;
      }
      case 'capture':
        return goal.target.every(([x, y]) => b.get(x, y) === EMPTY);
      case 'escape': {
        const [x, y] = goal.target;
        return b.get(x, y) !== EMPTY && b.countLiberties(x, y) >= goal.minLibs;
      }
      case 'doubleAtari':
        return goal.targets.every(
          ([x, y]) => b.get(x, y) !== EMPTY && b.countLiberties(x, y) === 1
        );
      case 'placeAt': {
        const lm = b.lastMove;
        return lm && goal.points.some(([x, y]) => x === lm.x && y === lm.y);
      }
      case 'twoEyes': {
        const [x, y] = goal.ref;
        return countGroupEyes(x, y) >= 2;
      }
      default:
        return false;
    }
  }

  /* 统计 (x,y) 所在棋块完全包围的单点眼数 */
  function countGroupEyes(x, y) {
    const b = state.board;
    if (b.get(x, y) === EMPTY) return 0;
    const color = b.get(x, y);
    const g = b.group(x, y);
    const stoneSet = new Set(g.stones.map((s) => s[0] + ',' + s[1]));
    let eyes = 0;
    const checked = new Set();
    for (const [sx, sy] of g.stones) {
      for (const [nx, ny] of b.neighbors(sx, sy)) {
        if (b.get(nx, ny) !== EMPTY) continue;
        const key = nx + ',' + ny;
        if (checked.has(key)) continue;
        checked.add(key);
        // 该空点四周必须全部属于本棋块
        const surround = b.neighbors(nx, ny);
        const ok = surround.every(([ax, ay]) => stoneSet.has(ax + ',' + ay));
        if (ok) eyes++;
      }
    }
    return eyes;
  }

  /* ---------------- 成功 / 失败 ---------------- */
  function onLessonSuccess() {
    const les = state.lesson;
    state.lessonDone = true;
    state.busy = true;
    if (!state.completed[les.id]) {
      state.completed[les.id] = true;
      saveProgress();
      refreshLessonList();
    }
    setStatus('✅ ' + (les.success || '完成！'), 'success');
    render();

    // 自动提示进入下一关
    if (state.lessonIndex < LESSONS.length - 1) {
      els.nextBtn.classList.add('pulse');
      setTimeout(() => els.nextBtn.classList.remove('pulse'), 2400);
    }
    setTimeout(() => { state.busy = false; }, 400);
  }

  /* ---------------- AI 应手 ---------------- */
  function scheduleAI(color) {
    state.busy = true;
    setStatus('对手思考中…', '');
    setTimeout(() => {
      const opts = {};
      const les = state.lesson;
      if (state.mode === 'lesson' && les.options && les.options.responder === 'escapeOnly') {
        opts.escapeOnly = true;
      }
      opts.passIfIdle = state.mode === 'sandbox' || (les && les.goal.type === 'freePlay');
      const mv = AI.chooseMove(state.board, color, opts);
      if (mv.pass) {
        state.board.pass(color);
        state.consecutivePasses++;
      } else {
        state.board.play(mv.x, mv.y, color);
        state.consecutivePasses = 0;
      }
      state.busy = false;
      setStatus('', '');
      render();
      updateScore();
      maybeEndGame();
    }, 420);
  }

  /* ---------------- 停一手 / 悔棋 ---------------- */
  function onPass() {
    if (state.busy) return;
    const color = currentHumanColor();
    state.board.pass(color);
    state.consecutivePasses++;
    render();
    if (maybeEndGame()) return;
    if ((state.mode === 'sandbox' && state.sandboxVsAI) ||
        (state.mode === 'lesson' && state.lesson.goal.type === 'freePlay')) {
      scheduleAI(color === BLACK ? WHITE : BLACK);
    }
  }

  function onUndo() {
    if (state.busy) return;
    state.board.undo();
    // 对战 AI 时再撤一手，回到人类回合
    if ((state.sandboxVsAI && state.mode === 'sandbox') ||
        (state.mode === 'lesson' && state.lesson.goal.type === 'freePlay')) {
      if (state.board.turn !== currentHumanColor() && state.board.history.length) {
        state.board.undo();
      }
    }
    state.consecutivePasses = 0;
    render();
    updateScore();
  }

  function maybeEndGame() {
    if (state.consecutivePasses < 2) return false;
    const s = state.board.score();
    const diff = s.black - s.white;
    let msg;
    if (diff > 0) msg = '终局！黑 ' + s.black + ' 比 白 ' + s.white + '，黑棋胜 ' + diff + ' 子。';
    else if (diff < 0) msg = '终局！白 ' + s.white + ' 比 黑 ' + s.black + '，白棋胜 ' + (-diff) + ' 子。';
    else msg = '终局！双方 ' + s.black + ' 子，和棋。';
    setStatus('🏁 ' + msg, 'success');
    state.busy = true;
    if (state.mode === 'lesson' && state.lesson.goal.type === 'freePlay' && diff > 0) {
      if (!state.completed[state.lesson.id]) {
        state.completed[state.lesson.id] = true;
        saveProgress();
        refreshLessonList();
      }
    }
    return true;
  }

  /* ---------------- 形势/数子 ---------------- */
  function updateScore() {
    const showScore =
      (state.mode === 'sandbox') ||
      (state.lesson && state.lesson.options && state.lesson.options.showScore);
    if (!showScore) { els.score.classList.add('hidden'); return; }
    els.score.classList.remove('hidden');
    const s = state.board.score();
    els.score.innerHTML =
      '<div class="score-row"><span class="chip black"></span>黑：' +
      s.black + ' 子（含俘 ' + state.board.captures[BLACK] + '）</div>' +
      '<div class="score-row"><span class="chip white"></span>白：' +
      s.white + ' 子（含俘 ' + state.board.captures[WHITE] + '）</div>';
  }

  /* ---------------- 提示 / 状态栏 ---------------- */
  let hintIdx = 0;
  function toggleHint() {
    const les = state.lesson;
    if (!les.hints || !les.hints.length) return;
    els.hintBox.classList.remove('hidden');
    els.hintBox.innerHTML = '💡 ' + les.hints[hintIdx % les.hints.length];
    hintIdx++;
  }

  function setStatus(msg, cls) {
    els.status.className = 'panel-status ' + (cls || '');
    els.status.innerHTML = msg;
  }

  // 切换关卡时重置提示指针
  const _origLoad = loadLesson;
  loadLesson = function (i) { hintIdx = 0; state.lessonDone = false; _origLoad(i); };

  global.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : globalThis);
