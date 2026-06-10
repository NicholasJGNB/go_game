/*
 * render.js —— 棋盘绘制模块（与运行环境无关）
 * 浏览器中由 app.js 调用，Node 中由截图脚本复用同一套绘制逻辑。
 * 只依赖一个标准的 CanvasRenderingContext2D 接口与 engine.js 的常量。
 */
(function (global) {
  'use strict';

  const { BLACK, WHITE, EMPTY } = global.Go;

  const CELL = 56;   // 每路像素
  const MARGIN = 42; // 边距

  function boardToPixel(x, y) {
    return [MARGIN + x * CELL, MARGIN + y * CELL];
  }

  function canvasSize(n) {
    return MARGIN * 2 + CELL * (n - 1);
  }

  function starPoints(n) {
    if (n === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    if (n === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
    if (n === 19)
      return [
        [3, 3], [9, 3], [15, 3],
        [3, 9], [9, 9], [15, 9],
        [3, 15], [9, 15], [15, 15],
      ];
    return [];
  }

  function drawStoneAt(ctx, px, py, color, alpha) {
    const r = CELL * 0.46;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const grad = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
    if (color === BLACK) {
      grad.addColorStop(0, '#555'); grad.addColorStop(1, '#0a0a0a');
    } else {
      grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#cfcfcf');
    }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function markPoint(ctx, x, y, color) {
    const [px, py] = boardToPixel(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, CELL * 0.34, 0, Math.PI * 2); ctx.stroke();
  }

  /*
   * 绘制整张棋盘。
   * opts:
   *   showLiberties: [[x,y]...]   高亮这些棋块的气
   *   ladderRecommend: [x,y]      征子推荐落点（红圈）
   *   hover: {x,y,color}          落子预览
   */
  function draw(ctx, board, opts) {
    opts = opts || {};
    const n = board.size;
    const W = canvasSize(n);

    // 木纹底
    ctx.fillStyle = '#e9b96e';
    ctx.fillRect(0, 0, W, W);

    // 网格线
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = boardToPixel(0, i);
      const [x1] = boardToPixel(n - 1, i);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
      const [vx0, vy0] = boardToPixel(i, 0);
      const [, vy1] = boardToPixel(i, n - 1);
      ctx.beginPath(); ctx.moveTo(vx0, vy0); ctx.lineTo(vx0, vy1); ctx.stroke();
    }

    // 星位
    ctx.fillStyle = '#5a3a1a';
    for (const [sx, sy] of starPoints(n)) {
      const [px, py] = boardToPixel(sx, sy);
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    }

    // 坐标
    ctx.fillStyle = '#6b4a26';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = 'ABCDEFGHJKLMNOPQRST';
    for (let i = 0; i < n; i++) {
      const [px] = boardToPixel(i, 0);
      ctx.fillText(letters[i], px, 16);
      ctx.fillText(letters[i], px, W - 16);
      const [, py] = boardToPixel(0, i);
      ctx.fillText(String(n - i), 16, py);
      ctx.fillText(String(n - i), W - 16, py);
    }

    // 高亮气
    if (opts.showLiberties) {
      for (const [gx, gy] of opts.showLiberties) {
        if (board.get(gx, gy) === EMPTY) continue;
        for (const key of board.group(gx, gy).liberties) {
          const [lx, ly] = key.split(',').map(Number);
          const [px, py] = boardToPixel(lx, ly);
          ctx.fillStyle = 'rgba(60,160,90,0.35)';
          ctx.beginPath(); ctx.arc(px, py, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // 征子推荐点
    if (opts.ladderRecommend) {
      const [rx, ry] = opts.ladderRecommend;
      if (board.get(rx, ry) === EMPTY) markPoint(ctx, rx, ry, 'rgba(220,70,70,0.85)');
    }

    // 提示答案点（点提示到最后一条时显示）
    if (opts.answerPoint) {
      const [ax, ay] = opts.answerPoint;
      if (board.get(ax, ay) === EMPTY) markPoint(ctx, ax, ay, 'rgba(40,110,220,0.9)');
    }

    // 棋子
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = board.get(x, y);
        if (v !== EMPTY) {
          const [px, py] = boardToPixel(x, y);
          drawStoneAt(ctx, px, py, v);
        }
      }
    }

    // 最后一手标记
    if (board.lastMove) {
      const [px, py] = boardToPixel(board.lastMove.x, board.lastMove.y);
      ctx.strokeStyle = board.lastMove.color === BLACK ? '#fff' : '#000';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, CELL * 0.18, 0, Math.PI * 2); ctx.stroke();
    }

    // 落子预览
    if (opts.hover && board.get(opts.hover.x, opts.hover.y) === EMPTY) {
      const [px, py] = boardToPixel(opts.hover.x, opts.hover.y);
      drawStoneAt(ctx, px, py, opts.hover.color, 0.4);
    }
  }

  global.GoRender = { draw, drawStoneAt, boardToPixel, canvasSize, starPoints, CELL, MARGIN };
})(typeof window !== 'undefined' ? window : globalThis);
