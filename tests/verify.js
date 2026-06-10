/*
 * tests/verify.js —— 引擎与课程的离线验证
 * 运行：node tests/verify.js
 * 校验：围棋规则引擎的正确性，以及每一关的标准解法确实能达成目标。
 */
'use strict';
global.window = global;
require('../js/engine.js');
require('../js/ai.js');
require('../js/lessons.js');
const { GoBoard, BLACK, WHITE, EMPTY } = global.Go;
const AI = global.GoAI;
const LESSONS = global.GoLessons;

let pass = 0, fail = 0;
function ck(name, cond) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  cond ? pass++ : fail++;
}
function mk(size, blacks, whites) {
  const b = new GoBoard(size);
  for (const [x, y] of blacks) b.set(x, y, BLACK);
  for (const [x, y] of whites) b.set(x, y, WHITE);
  b.turn = BLACK;
  return b;
}
function les(id) { return LESSONS.find((l) => l.id === id); }
function setupBoard(l) { return mk(l.size, l.setup.black, l.setup.white); }

// 复刻 app.js 的成组眼数统计
function groupEyes(b, x, y) {
  if (b.get(x, y) === EMPTY) return 0;
  const g = b.group(x, y);
  const ss = new Set(g.stones.map((s) => s[0] + ',' + s[1]));
  let eyes = 0; const chk = new Set();
  for (const [sx, sy] of g.stones)
    for (const [nx, ny] of b.neighbors(sx, sy)) {
      if (b.get(nx, ny) !== EMPTY) continue;
      const k = nx + ',' + ny; if (chk.has(k)) continue; chk.add(k);
      if (b.neighbors(nx, ny).every(([ax, ay]) => ss.has(ax + ',' + ay))) eyes++;
    }
  return eyes;
}

console.log('\n== 引擎规则 ==');
(() => {
  // 提子
  let b = mk(9, [[3, 4], [5, 4], [4, 3]], [[4, 4]]);
  ck('单子被提', (() => { b.play(4, 5, BLACK); return b.get(4, 4) === EMPTY; })());
  // 禁着点（自杀）
  b = mk(5, [[1, 0], [0, 1], [2, 1], [1, 2]], []);
  ck('自杀手非法', b.isLegal(1, 1, WHITE) === false);
  // 提子后可下（非自杀）
  b = mk(5, [[1, 0], [0, 1], [2, 1], [1, 2]], [[1, 1]]);
  // 这里 (1,1) 是白，黑在其四周已布满 -> 此局面白(1,1)已无气? 重建一个吃子合法例子
  b = mk(5, [[2, 0], [0, 2], [2, 2], [1, 1]], [[1, 0], [0, 1]]);
  // 简化：劫争
  b = mk(9, [[5, 4], [4, 3], [4, 5]], [[4, 4], [2, 4], [3, 3], [3, 5]]);
  b.play(3, 4, BLACK);
  ck('打劫：不能立即回提', b.isLegal(4, 4, WHITE) === false);
  // 数子返回数值
  const s = b.score();
  ck('score() 返回数字', typeof s.black === 'number' && typeof s.white === 'number');
})();

console.log('\n== 课程标准解法 ==');
// 吃子
let b = setupBoard(les('c1l3')); b.play(4, 5, BLACK);
ck('c1l3 吃单子', b.get(4, 4) === EMPTY);

b = setupBoard(les('c1l4')); b.play(4, 6, BLACK);
ck('c1l4 吃一串', b.get(4, 4) === EMPTY && b.get(4, 5) === EMPTY);

b = setupBoard(les('c1l5')); b.play(5, 4, BLACK);
ck('c1l5 逃跑长气≥2', b.countLiberties(4, 4) >= 2);

b = setupBoard(les('c2l1'));
ck('c2l1 (5,4) 打吃成立', (() => { const c = b.clone(); c.play(5, 4, BLACK); return c.countLiberties(4, 4) === 1; })());

b = setupBoard(les('c2l2')); b.play(4, 4, BLACK);
ck('c2l2 双打吃', b.countLiberties(3, 4) === 1 && b.countLiberties(5, 4) === 1);

// 征子（引擎动态求解推荐点，白棋按 escapeOnly 自动逃）
b = setupBoard(les('c2l3'));
let captured = false;
for (let i = 0; i < 30; i++) {
  const m = AI.ladderMove(b, [2, 2]);
  if (!m) break;
  b.play(m[0], m[1], BLACK);
  if (b.get(2, 2) !== WHITE) { captured = true; break; }
  if (b.countLiberties(2, 2) === 1) {
    const mv = AI.chooseMove(b, WHITE, { escapeOnly: true });
    if (!mv.pass) b.play(mv.x, mv.y, WHITE);
  }
  if (b.get(2, 2) !== WHITE) { captured = true; break; }
}
ck('c2l3 征子动态求解并吃掉白棋', captured);

// 征子：第一手必须是 (1,2)——往黑棋墙的方向打，(3,2) 是错误方向
b = setupBoard(les('c2l3'));
const firstLadder = AI.ladderMove(b, [2, 2]);
ck('c2l3 首手推荐为正确方向 (1,2)', firstLadder && firstLadder[0] === 1 && firstLadder[1] === 2);

// 枷
b = setupBoard(les('c2l4'));
ck('c2l4 枷点 (4,4) 合法且保持松罩', (() => {
  const c = b.clone(); c.play(4, 4, BLACK);
  return c.get(3, 3) === WHITE && c.countLiberties(3, 3) === 2;
})());

// 打劫提子
b = setupBoard(les('c2l5')); b.play(3, 4, BLACK);
ck('c2l5 提白子形成劫', b.get(4, 4) === EMPTY);

// 死活：两眼活棋
b = setupBoard(les('c3l1')); b.play(5, 0, BLACK);
ck('c3l1 做出第二只眼', groupEyes(b, 2, 1) >= 2);

// 点杀直三
b = setupBoard(les('c3l2'));
ck('c3l2 要害 (3,0) 合法', b.isLegal(3, 0, BLACK));

// 做活直三
b = setupBoard(les('c3l3')); b.play(3, 0, BLACK);
ck('c3l3 中心做两眼', groupEyes(b, 2, 1) >= 2);

console.log('\n== AI 与引擎增强 ==');
// AI 不填自己的真眼
b = mk(9, [[0, 1], [2, 1], [1, 0], [1, 2], [4, 1], [3, 0], [3, 2]], []);
// 眼位 (1,1) 与 (3,1)：四周皆黑
ck('isOwnEye 识别真眼', AI.isOwnEye(b, 1, 1, BLACK) && AI.isOwnEye(b, 3, 1, BLACK));
{
  const mv = AI.chooseMove(b, BLACK, {});
  const fillsEye = !mv.pass && ((mv.x === 1 && mv.y === 1) || (mv.x === 3 && mv.y === 1));
  ck('AI 不自填真眼', !fillsEye);
}

// undo 保留关卡预设棋子
{
  const b2 = mk(9, [[3, 4]], [[4, 4]]);
  b2.markSetup();
  b2.play(5, 4, BLACK);
  b2.play(6, 6, WHITE);
  b2.undo();
  ck('undo 撤销最后一手且保留预设棋子',
    b2.get(6, 6) === EMPTY && b2.get(5, 4) === BLACK &&
    b2.get(3, 4) === BLACK && b2.get(4, 4) === WHITE);
}

// 所有关卡布局合法
let setupOk = true;
for (const l of LESSONS) {
  const seen = new Set();
  for (const [x, y] of [...l.setup.black, ...l.setup.white]) {
    const k = x + ',' + y;
    if (seen.has(k) || x < 0 || y < 0 || x >= l.size || y >= l.size) setupOk = false;
    seen.add(k);
  }
}
ck('所有关卡初始布局合法且不重叠', setupOk);

console.log('\n==== ' + pass + ' 通过, ' + fail + ' 失败 ====\n');
process.exit(fail ? 1 : 0);
