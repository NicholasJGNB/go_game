/*
 * engine.js —— 围棋核心引擎
 * 负责棋盘状态、落子、气的计算、提子、禁着点（自杀）与打劫判定。
 * 与界面完全解耦，方便测试与复用。
 */

(function (global) {
  'use strict';

  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  function opposite(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  class GoBoard {
    constructor(size = 19) {
      this.size = size;
      this.reset();
    }

    reset() {
      const n = this.size;
      this.grid = [];
      for (let y = 0; y < n; y++) {
        this.grid.push(new Array(n).fill(EMPTY));
      }
      this.turn = BLACK;
      this.captures = { [BLACK]: 0, [WHITE]: 0 };
      this.koPoint = null;          // 简单劫：禁止立即回提的点
      this.history = [];            // 着手历史 {x,y,color,captured}
      this.lastMove = null;
      this.positionHashes = new Set();
      this.positionHashes.add(this._hash());
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.size && y < this.size;
    }

    get(x, y) {
      return this.grid[y][x];
    }

    set(x, y, color) {
      this.grid[y][x] = color;
    }

    neighbors(x, y) {
      const res = [];
      if (x > 0) res.push([x - 1, y]);
      if (x < this.size - 1) res.push([x + 1, y]);
      if (y > 0) res.push([x, y - 1]);
      if (y < this.size - 1) res.push([x, y + 1]);
      return res;
    }

    /* 返回 (x,y) 所在棋块的所有坐标与气数 */
    group(x, y) {
      const color = this.get(x, y);
      if (color === EMPTY) return { stones: [], liberties: new Set() };
      const stones = [];
      const liberties = new Set();
      const seen = new Set();
      const stack = [[x, y]];
      seen.add(x + ',' + y);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        stones.push([cx, cy]);
        for (const [nx, ny] of this.neighbors(cx, cy)) {
          const v = this.get(nx, ny);
          if (v === EMPTY) {
            liberties.add(nx + ',' + ny);
          } else if (v === color) {
            const key = nx + ',' + ny;
            if (!seen.has(key)) {
              seen.add(key);
              stack.push([nx, ny]);
            }
          }
        }
      }
      return { stones, liberties };
    }

    countLiberties(x, y) {
      return this.group(x, y).liberties.size;
    }

    /* 判断某步是否合法，返回 {legal, reason, captured:[...]}（不改变棋盘） */
    testMove(x, y, color) {
      if (!this.inBounds(x, y)) return { legal: false, reason: '超出棋盘' };
      if (this.get(x, y) !== EMPTY) return { legal: false, reason: '该点已有棋子' };

      // 模拟落子
      this.set(x, y, color);
      const enemy = opposite(color);
      let captured = [];

      // 先看是否能提掉对方无气的棋块
      for (const [nx, ny] of this.neighbors(x, y)) {
        if (this.get(nx, ny) === enemy) {
          const g = this.group(nx, ny);
          if (g.liberties.size === 0) {
            captured = captured.concat(g.stones);
          }
        }
      }
      // 去重
      const capKeys = new Set(captured.map((s) => s[0] + ',' + s[1]));
      captured = Array.from(capKeys).map((k) => k.split(',').map(Number));

      // 临时移除被提子，判断自身是否有气
      for (const [cx, cy] of captured) this.set(cx, cy, EMPTY);
      const selfLibs = this.countLiberties(x, y);

      let result;
      if (captured.length === 0 && selfLibs === 0) {
        result = { legal: false, reason: '禁着点（自杀）' };
      } else {
        // 简单劫争判定：提一子且形成单子互提的局面
        const koKey = this.koPoint ? this.koPoint[0] + ',' + this.koPoint[1] : null;
        if (captured.length === 1 && koKey === x + ',' + y) {
          // 进一步确认：本手只落单子且自身只有一气，构成劫
          const isSingle = this.group(x, y).stones.length === 1 && selfLibs === 1;
          if (isSingle) {
            result = { legal: false, reason: '打劫：不能立即回提' };
          } else {
            result = { legal: true, captured };
          }
        } else {
          result = { legal: true, captured };
        }
      }

      // 还原棋盘
      this.set(x, y, EMPTY);
      for (const [cx, cy] of captured) this.set(cx, cy, enemy);
      return result;
    }

    isLegal(x, y, color) {
      return this.testMove(x, y, color).legal;
    }

    /* 正式落子，成功返回 {captured}，失败返回 null */
    play(x, y, color) {
      if (color == null) color = this.turn;
      const test = this.testMove(x, y, color);
      if (!test.legal) return null;

      const enemy = opposite(color);
      this.set(x, y, color);
      const captured = test.captured || [];
      for (const [cx, cy] of captured) this.set(cx, cy, EMPTY);
      this.captures[color] += captured.length;

      // 更新劫点：当且仅当提一子且自身成单子单气时，劫点为被提的位置
      if (captured.length === 1) {
        const selfGroup = this.group(x, y);
        if (selfGroup.stones.length === 1 && selfGroup.liberties.size === 1) {
          this.koPoint = captured[0];
        } else {
          this.koPoint = null;
        }
      } else {
        this.koPoint = null;
      }

      this.lastMove = { x, y, color };
      this.history.push({ x, y, color, captured });
      this.turn = enemy;
      this.positionHashes.add(this._hash());
      return { captured };
    }

    pass(color) {
      if (color == null) color = this.turn;
      this.koPoint = null;
      this.lastMove = null;
      this.history.push({ pass: true, color });
      this.turn = opposite(color);
    }

    /* 记录当前盘面为"初始布局"，undo 重放时以此为基线（否则预设棋子会被清掉） */
    markSetup() {
      this.baseGrid = this.grid.map((row) => row.slice());
    }

    undo() {
      if (!this.history.length) return false;
      // 简单做法：回到初始布局后，重放除最后一手以外的全部历史
      const hist = this.history.slice(0, -1);
      const base = this.baseGrid;
      this.reset();
      if (base) {
        this.baseGrid = base;
        this.grid = base.map((row) => row.slice());
      }
      for (const h of hist) {
        if (h.pass) this.pass(h.color);
        else this.play(h.x, h.y, h.color);
      }
      return true;
    }

    /* 列出某方所有合法着点 */
    legalMoves(color) {
      const moves = [];
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          if (this.get(x, y) === EMPTY && this.isLegal(x, y, color)) {
            moves.push([x, y]);
          }
        }
      }
      return moves;
    }

    /*
     * 中国规则简易形势判断（用于教学示范，非严格胜负）。
     * 数子：空点若四周（经连通的空区）只接触一种颜色，则归该方。
     */
    score() {
      const n = this.size;
      const visited = [];
      for (let y = 0; y < n; y++) visited.push(new Array(n).fill(false));
      let blackArea = 0;
      let whiteArea = 0;

      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (this.get(x, y) !== EMPTY || visited[y][x]) continue;
          // 泛洪整片空区
          const region = [];
          const borders = new Set();
          const stack = [[x, y]];
          visited[y][x] = true;
          while (stack.length) {
            const [cx, cy] = stack.pop();
            region.push([cx, cy]);
            for (const [nx, ny] of this.neighbors(cx, cy)) {
              const v = this.get(nx, ny);
              if (v === EMPTY) {
                if (!visited[ny][nx]) {
                  visited[ny][nx] = true;
                  stack.push([nx, ny]);
                }
              } else {
                borders.add(v);
              }
            }
          }
          if (borders.size === 1) {
            if (borders.has(BLACK)) blackArea += region.length;
            else whiteArea += region.length;
          }
        }
      }

      let blackStones = 0;
      let whiteStones = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (this.get(x, y) === BLACK) blackStones++;
          else if (this.get(x, y) === WHITE) whiteStones++;
        }
      }
      const black = blackArea + blackStones;
      const white = whiteArea + whiteStones;
      return { black, white, blackArea, whiteArea, blackStones, whiteStones };
    }

    _hash() {
      let s = '';
      for (let y = 0; y < this.size; y++) {
        s += this.grid[y].join('');
      }
      return s;
    }

    clone() {
      const b = new GoBoard(this.size);
      b.grid = this.grid.map((row) => row.slice());
      b.baseGrid = this.baseGrid ? this.baseGrid.map((row) => row.slice()) : null;
      b.turn = this.turn;
      b.captures = { [BLACK]: this.captures[BLACK], [WHITE]: this.captures[WHITE] };
      b.koPoint = this.koPoint ? this.koPoint.slice() : null;
      b.lastMove = this.lastMove ? Object.assign({}, this.lastMove) : null;
      b.history = this.history.map((h) => Object.assign({}, h));
      return b;
    }
  }

  global.Go = { GoBoard, EMPTY, BLACK, WHITE, opposite };
})(typeof window !== 'undefined' ? window : globalThis);
