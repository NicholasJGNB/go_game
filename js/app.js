/*
 * app.js —— 界面与教学流程控制
 * 负责：交互落子、课程目标判定、AI 应手、自由对弈与数子。
 * 棋盘绘制委托给 render.js（GoRender），规则委托给 engine.js（Go）。
 */

(function (global) {
  'use strict';

  const { GoBoard, BLACK, WHITE, EMPTY, opposite } = global.Go;
  const AI = global.GoAI;
  const R = global.GoRender;
  const LESSONS = global.GoLessons;

  /* ---------------- 状态 ---------------- */
  const state = {
    board: null,
    lesson: null,
    lessonIndex: 0,
    placedThisLesson: 0,
    completed: loadProgress(),
    busy: false,           // AI 思考 / 动画期间锁定输入
    lessonDone: false,
    hoverPt: null,
    ladderHint: null,      // 征子关：引擎实时求解的下一手
    answerPt: null,        // 点提示到最后一条时，在棋盘上标出的答案点
    consecutivePasses: 0,
    mode: 'lesson',        // 'lesson' | 'sandbox'
    sandboxVsAI: true,
    humanColor: BLACK,
    logicalSize: 0,        // 当前棋盘的逻辑像素边长（用于坐标换算）
  };

  /* ---------------- DOM ---------------- */
  let canvas, ctx, els;

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

  /* ---------------- 音效 ---------------- */
  let audioCtx = null;
  let soundOn = localStorage.getItem('go_sound') !== 'off';

  function sound(type) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (global.AudioContext || global.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      if (type === 'capture') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.exponentialRampToValueAtTime(990, t + 0.1);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.18);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(340, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.start(t); osc.stop(t + 0.07);
      }
    } catch (e) {
      /* 音频不可用则静默 */
    }
  }

  /* 落子（带音效与提子动画）。返回 play() 的结果 */
  function playWithFx(x, y, color) {
    const res = state.board.play(x, y, color);
    if (!res) return res;
    if (res.captured && res.captured.length) {
      sound('capture');
      animateCaptures(res.captured, opposite(color));
    } else {
      sound('place');
    }
    return res;
  }

  /* 被提的棋子淡出消失 */
  function animateCaptures(stones, color) {
    const start = performance.now();
    const dur = 300;
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      render();
      for (const [sx, sy] of stones) {
        const [px, py] = R.boardToPixel(sx, sy);
        R.drawStoneAt(ctx, px, py, color, 1 - t);
      }
      if (t < 1) requestAnimationFrame(frame);
      else render();
    }
    requestAnimationFrame(frame);
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
      soundBtn: $('#btn-sound'),
      score: $('#score-box'),
      sandboxBtn: $('#btn-sandbox'),
      sizeSel: $('#size-select'),
      aiToggle: $('#ai-toggle'),
      sandboxControls: $('#sandbox-controls'),
      turnDot: $('#turn-dot'),
      resetProgressBtn: $('#btn-reset-progress'),
    };

    buildLessonList();

    canvas.addEventListener('click', onBoardClick);
    canvas.addEventListener('mousemove', onBoardHover);
    canvas.addEventListener('mouseleave', () => {
      state.hoverPt = null;
      render();
    });

    els.hintBtn.addEventListener('click', showNextHint);
    els.resetBtn.addEventListener('click', () => {
      if (state.mode === 'sandbox') startSandbox();
      else loadLesson(state.lessonIndex);
    });
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
    els.aiToggle.addEventListener('change', () => {
      state.sandboxVsAI = els.aiToggle.checked;
      // 中途打开 AI 且轮到 AI 行棋时，立刻接管
      if (state.sandboxVsAI && state.mode === 'sandbox' &&
          state.board.turn !== state.humanColor && !state.busy) {
        scheduleAI(state.board.turn);
      }
    });
    if (els.soundBtn) {
      els.soundBtn.textContent = soundOn ? '🔊' : '🔇';
      els.soundBtn.addEventListener('click', () => {
        soundOn = !soundOn;
        els.soundBtn.textContent = soundOn ? '🔊' : '🔇';
        try { localStorage.setItem('go_sound', soundOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
      });
    }
    if (els.resetProgressBtn) {
      els.resetProgressBtn.addEventListener('click', () => {
        if (!global.confirm('确定要清除全部学习进度吗？')) return;
        state.completed = {};
        saveProgress();
        buildLessonList();
        refreshLessonList();
      });
    }

    loadLesson(0);
    global.addEventListener('resize', () => { resizeCanvas(); render(); });
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
      } else {
        dot.classList.remove('done');
        dot.textContent = i + 1;
      }
    });
  }

  /* ---------------- 加载关卡 ---------------- */
  let hintIdx = 0;

  function loadLesson(index) {
    state.mode = 'lesson';
    state.lessonIndex = index;
    const les = LESSONS[index];
    state.lesson = les;
    state.board = new GoBoard(les.size);
    for (const [x, y] of les.setup.black) state.board.set(x, y, BLACK);
    for (const [x, y] of les.setup.white) state.board.set(x, y, WHITE);
    state.board.turn = BLACK;
    state.board.markSetup();
    state.placedThisLesson = 0;
    state.consecutivePasses = 0;
    state.busy = false;
    state.lessonDone = false;
    state.hoverPt = null;
    state.answerPt = null;
    hintIdx = 0;

    // 征子关：用引擎实时求解推荐点
    state.ladderHint =
      les.goal.type === 'ladder' ? AI.ladderMove(state.board, les.goal.target) : null;

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
    state.board.markSetup();
    state.consecutivePasses = 0;
    state.busy = false;
    state.humanColor = BLACK;
    state.sandboxVsAI = els.aiToggle.checked;
    state.answerPt = null;
    state.ladderHint = null;

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

  /* ---------------- 画布尺寸（高清 + 自适应） ---------------- */
  function resizeCanvas() {
    const n = state.board.size;
    const logical = R.canvasSize(n);
    state.logicalSize = logical;

    // 显示尺寸：桌面三栏布局留出侧栏空间；窄屏用接近全宽
    let disp;
    if (global.innerWidth > 1080) {
      disp = Math.min(620, Math.max(320, global.innerWidth - 720));
    } else {
      disp = Math.min(620, global.innerWidth - 44);
    }
    disp = Math.max(260, disp);

    // 物理分辨率按 devicePixelRatio 放大，避免高分屏发虚
    const dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(disp * dpr);
    canvas.height = Math.round(disp * dpr);
    canvas.style.width = disp + 'px';
    canvas.style.height = disp + 'px';
    const s = canvas.width / logical;
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }

  function pixelToBoard(px, py) {
    const x = Math.round((px - R.MARGIN) / R.CELL);
    const y = Math.round((py - R.MARGIN) / R.CELL);
    if (!state.board.inBounds(x, y)) return null;
    // 命中容差
    const [cx, cy] = R.boardToPixel(x, y);
    if (Math.hypot(px - cx, py - cy) > R.CELL * 0.5) return null;
    return [x, y];
  }

  /* ---------------- 渲染（委托给 GoRender） ---------------- */
  function render() {
    const b = state.board;
    const les = state.lesson;
    const opts = {};

    if (state.mode === 'lesson' && les) {
      if (les.options && les.options.showLiberties) opts.showLiberties = les.options.showLiberties;
      if (les.goal.type === 'ladder') opts.ladderRecommend = state.ladderHint;
      if (state.answerPt) opts.answerPoint = state.answerPt;
    }

    // 落子预览
    if (state.hoverPt && !state.busy && canPlayNow()) {
      const [hx, hy] = state.hoverPt;
      if (b.get(hx, hy) === EMPTY) {
        opts.hover = { x: hx, y: hy, color: currentHumanColor() };
      }
    }

    R.draw(ctx, b, opts);
    updateTurnDot();
  }

  function updateTurnDot() {
    if (!els.turnDot) return;
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
    if (state.lesson.goal.type !== 'freePlay' && state.lessonDone) return false;
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
    const scale = state.logicalSize / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
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
      playWithFx(pt[0], pt[1], color);
      state.consecutivePasses = 0;
      render();
      updateScore();
      if (state.sandboxVsAI && b.turn !== state.humanColor) {
        scheduleAI(b.turn);
      }
      return;
    }

    handleLessonMove(pt, color);
  }

  function flashIllegal(pt) {
    const [px, py] = R.boardToPixel(pt[0], pt[1]);
    ctx.strokeStyle = 'rgba(220,40,40,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, R.CELL * 0.4, 0, Math.PI * 2); ctx.stroke();
    const reason = state.board.testMove(pt[0], pt[1], currentHumanColor()).reason || '此处不可下';
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

    // 找要害类题目：下错点直接驳回，保持盘面干净
    if (goal.type === 'placeAt' &&
        !goal.points.some((p) => p[0] === pt[0] && p[1] === pt[1])) {
      flashIllegal(pt);
      setStatus('这一点不是要害，再想想。可点 💡提示。', 'warn');
      return;
    }

    const res = playWithFx(pt[0], pt[1], color);
    if (!res) { flashIllegal(pt); return; }
    state.placedThisLesson++;
    state.consecutivePasses = 0;

    // freePlay：交给 AI
    if (goal.type === 'freePlay') {
      render(); updateScore();
      if (les.options && les.options.responder) scheduleAI(WHITE);
      return;
    }

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
    playWithFx(pt[0], pt[1], BLACK);
    render();

    if (!targetAlive(target)) { onLessonSuccess(); return; }

    const libs = b.countLiberties(target[0], target[1]);
    if (libs >= 3) {
      ladderFailed();
      return;
    }
    if (libs === 1) {
      // 白棋被打吃 → 自动逃跑
      state.busy = true;
      setTimeout(() => {
        const mv = AI.chooseMove(b, WHITE, { escapeOnly: true });
        if (!mv.pass) playWithFx(mv.x, mv.y, WHITE);
        state.busy = false;
        if (!targetAlive(target)) { render(); onLessonSuccess(); return; }
        // 白逃跑后重新求解：解不出来即征子已失败
        state.ladderHint = AI.ladderMove(b, target);
        if (b.countLiberties(target[0], target[1]) >= 3 || !state.ladderHint) {
          ladderFailed();
          return;
        }
        render();
      }, 320);
    } else {
      // 玩家这手没有形成打吃；提示并刷新推荐
      state.ladderHint = AI.ladderMove(b, target);
      if (!state.ladderHint) { ladderFailed(); return; }
      setStatus('这一手没有打吃到白棋。请打在让白棋只剩一口气的点上（见红圈提示）。', 'warn');
      render();
    }
  }

  function ladderFailed() {
    state.ladderHint = null;
    state.busy = true;
    setStatus('白棋逃出去了，征子失败。点击“重来本题”再试一次。', 'warn');
    render();
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
        const ok = b.neighbors(nx, ny).every(([ax, ay]) => stoneSet.has(ax + ',' + ay));
        if (ok) eyes++;
      }
    }
    return eyes;
  }

  /* ---------------- 成功 ---------------- */
  function onLessonSuccess() {
    const les = state.lesson;
    state.lessonDone = true;
    state.busy = true;
    state.answerPt = null;
    if (!state.completed[les.id]) {
      state.completed[les.id] = true;
      saveProgress();
      refreshLessonList();
    }

    const allDone = LESSONS.every((l) => state.completed[l.id]);
    if (allDone && state.lessonIndex === LESSONS.length - 1) {
      setStatus('🎉 恭喜你完成了全部课程！你已经掌握围棋的基本功，去“自由对弈”里大展身手吧！', 'success');
    } else {
      setStatus('✅ ' + (les.success || '完成！'), 'success');
    }
    render();

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
        playWithFx(mv.x, mv.y, color);
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
  function showNextHint() {
    const les = state.lesson;
    if (!les || !les.hints || !les.hints.length) return;
    const idx = Math.min(hintIdx, les.hints.length - 1);
    els.hintBox.classList.remove('hidden');
    els.hintBox.innerHTML = '💡 ' + les.hints[idx] +
      (idx < les.hints.length - 1 ? '<span class="hint-more">（再点一次有更具体的提示）</span>' : '');
    // 看到最后一条提示时，在棋盘上用蓝圈标出答案点
    if (idx === les.hints.length - 1 && les.answer) {
      state.answerPt = les.answer;
      render();
    }
    hintIdx = Math.min(hintIdx + 1, les.hints.length - 1);
  }

  function setStatus(msg, cls) {
    els.status.className = 'panel-status ' + (cls || '');
    els.status.innerHTML = msg;
  }

  global.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : globalThis);
