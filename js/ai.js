/*
 * ai.js —— 教学用简易对弈 AI
 * 这不是强力引擎，而是一个遵循基本棋理的启发式对手，
 * 足以让初学者练习吃子、逃子与基本对局，并驱动征子等关卡的应手。
 */

(function (global) {
  'use strict';

  const { BLACK, WHITE, EMPTY, opposite } = global.Go;

  /*
   * 计算某色在某点落子后，吃掉的对方子数（用于评估）。
   */
  function capturesAfter(board, x, y, color) {
    const t = board.testMove(x, y, color);
    if (!t.legal) return -1;
    return t.captured ? t.captured.length : 0;
  }

  /*
   * 找出本方处于打吃（仅一气）的棋块，返回其唯一气位（逃跑点）。
   */
  function findAtariEscapes(board, color) {
    const escapes = [];
    const seen = new Set();
    for (let y = 0; y < board.size; y++) {
      for (let x = 0; x < board.size; x++) {
        if (board.get(x, y) !== color) continue;
        const key = x + ',' + y;
        if (seen.has(key)) continue;
        const g = board.group(x, y);
        for (const s of g.stones) seen.add(s[0] + ',' + s[1]);
        if (g.liberties.size === 1) {
          const lib = Array.from(g.liberties)[0].split(',').map(Number);
          escapes.push({ lib, size: g.stones.length });
        }
      }
    }
    return escapes;
  }

  /*
   * 找出可以打吃（让对方棋块只剩一气）的着点。
   */
  function findAtariMoves(board, color) {
    const enemy = opposite(color);
    const moves = [];
    for (const [x, y] of board.legalMoves(color)) {
      const clone = board.clone();
      if (!clone.play(x, y, color)) continue;
      for (const [nx, ny] of clone.neighbors(x, y)) {
        if (clone.get(nx, ny) === enemy && clone.countLiberties(nx, ny) === 1) {
          moves.push([x, y]);
          break;
        }
      }
    }
    return moves;
  }

  /*
   * 主决策函数。opts 可定制行为，用于不同关卡：
   *   opts.escapeOnly  —— 仅在被打吃时逃跑（用于征子防守方）
   *   opts.passIfIdle  —— 没有有价值的着手时停一手
   */
  function chooseMove(board, color, opts = {}) {
    const enemy = opposite(color);
    const legal = board.legalMoves(color);
    if (!legal.length) return { pass: true };

    // 1) 能直接提子就提（优先提子多者）
    let best = null;
    let bestCap = 0;
    for (const [x, y] of legal) {
      const cap = capturesAfter(board, x, y, color);
      if (cap > bestCap) {
        bestCap = cap;
        best = [x, y];
      }
    }
    if (best && bestCap > 0) return { x: best[0], y: best[1] };

    // 2) 本方被打吃 —— 尝试逃跑（逃到能增加气的点）
    const escapes = findAtariEscapes(board, color);
    if (escapes.length) {
      // 优先救最大块
      escapes.sort((a, b) => b.size - a.size);
      for (const e of escapes) {
        const [lx, ly] = e.lib;
        const clone = board.clone();
        if (clone.play(lx, ly, color)) {
          // 逃跑后气数 > 1 才有意义，否则可能是徒劳
          if (clone.countLiberties(lx, ly) > 1) {
            return { x: lx, y: ly };
          }
        }
      }
      // 逃不掉时，征子防守方仍会硬逃（制造教学征子）
      if (opts.escapeOnly) {
        const [lx, ly] = escapes[0].lib;
        if (board.isLegal(lx, ly, color)) return { x: lx, y: ly };
      }
    }

    if (opts.escapeOnly) return { pass: true };

    // 3) 主动打吃对方
    const ataris = findAtariMoves(board, color);
    if (ataris.length) {
      const m = ataris[Math.floor(Math.random() * ataris.length)];
      return { x: m[0], y: m[1] };
    }

    // 4) 普通行棋：偏好靠近已有棋子、避免自填一口气的点
    const scored = [];
    for (const [x, y] of legal) {
      // 避免自杀式自我减气：落子后自身气数太少则降权
      const clone = board.clone();
      clone.play(x, y, color);
      const libs = clone.countLiberties(x, y);
      if (libs <= 1) continue; // 跳过自送打吃的点

      let proximity = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (board.inBounds(nx, ny) && board.get(nx, ny) !== EMPTY) proximity++;
        }
      }
      // 略偏好棋盘中腹与已有棋子附近，加入随机扰动
      const center = board.size / 2;
      const distPenalty = (Math.abs(x - center) + Math.abs(y - center)) / board.size;
      const sc = proximity * 1.5 - distPenalty + Math.random();
      scored.push({ x, y, sc });
    }

    if (!scored.length) {
      if (opts.passIfIdle) return { pass: true };
      const m = legal[Math.floor(Math.random() * legal.length)];
      return { x: m[0], y: m[1] };
    }
    scored.sort((a, b) => b.sc - a.sc);
    return { x: scored[0].x, y: scored[0].y };
  }

  global.GoAI = { chooseMove, findAtariMoves, findAtariEscapes };
})(typeof window !== 'undefined' ? window : globalThis);
