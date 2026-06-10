/*
 * lessons.js —— 系统性围棋教学课程
 * 由浅入深分为四章：入门规则 → 吃子技巧 → 死活基础 → 实战对局。
 * 每一关的题目坐标均已通过 engine.js 离线验证（见仓库 README）。
 *
 * 坐标约定：[x, y]，x 为列（左→右，0 起），y 为行（上→下，0 起）。
 *
 * goal.type 取值：
 *   placeCount  —— 在棋盘任意处落满 N 子（纯熟悉操作）
 *   atari       —— 使目标棋块只剩一口气（打吃）
 *   capture     —— 提掉指定的目标棋子
 *   escape      —— 使我方目标棋块的气≥minLibs（逃跑/长气）
 *   doubleAtari —— 一手同时打吃多块（双打吃）
 *   placeAt     —— 落子于指定的若干正确点之一
 *   ladder      —— 用征子吃掉目标（对手自动逃跑）
 *   twoEyes     —— 使我方目标棋块拥有≥2 只真眼（做活）
 *   freePlay    —— 自由对弈（对战 AI）
 */

(function (global) {
  'use strict';

  const LESSONS = [
    /* ============ 第一章 · 入门规则 ============ */
    {
      id: 'c1l1',
      chapter: '第一章 · 入门规则',
      title: '认识棋盘与落子',
      size: 9,
      setup: { black: [], white: [] },
      intro:
        '欢迎来到围棋世界！围棋下在<strong>线与线的交叉点</strong>上，而不是格子里。' +
        '黑白双方轮流落子，<strong>黑棋先行</strong>。<br><br>' +
        '现在请在棋盘上任意点击，落下 <strong>3 颗棋子</strong>，感受一下落子的位置。',
      goal: { type: 'placeCount', count: 3 },
      options: { noOpponent: true },
      hints: ['点击任意交叉点即可落子。', '注意：棋子落在线的交叉点上。'],
      success: '很好！你已经学会落子了。接下来认识围棋最重要的概念——“气”。',
    },
    {
      id: 'c1l2',
      chapter: '第一章 · 入门规则',
      title: '“气”与打吃',
      size: 9,
      setup: { black: [], white: [[4, 4]] },
      intro:
        '一颗棋子上下左右紧邻的<strong>空交叉点</strong>叫做它的“<strong>气</strong>”。' +
        '盘中央这颗白子有 <strong>4 口气</strong>（高亮显示）。<br><br>' +
        '当一块棋只剩 <strong>1 口气</strong> 时，称为被“<strong>打吃</strong>”。' +
        '请在白子周围连下黑子，把它逼到只剩 <strong>1 口气</strong>。',
      goal: { type: 'atari', target: [4, 4] },
      options: { noOpponent: true, showLiberties: [[4, 4]] },
      hints: [
        '在白子的上、下、左、右四个气位上落黑子。',
        '堵住其中 3 口气，白子就只剩最后 1 口气了。',
      ],
      success: '这就是“打吃”！再补上最后一口气就能把它提走——下一关就来吃子。',
    },
    {
      id: 'c1l3',
      chapter: '第一章 · 入门规则',
      title: '吃子：提走无气之子',
      size: 9,
      setup: { black: [[3, 4], [5, 4], [4, 3]], white: [[4, 4]] },
      intro:
        '当对方棋子<strong>一口气也没有</strong>时，就要被<strong>提</strong>（拿）出棋盘。<br><br>' +
        '这颗白子已被打吃，只剩 1 口气。请落下黑子，把它<strong>吃掉</strong>！',
      goal: { type: 'capture', target: [[4, 4]] },
      options: { noOpponent: true },
      hints: ['白子最后的一口气在它的正下方。', '在 E4（白子正下方）落子即可提掉白棋。'],
      answer: [4, 5],
      success: '漂亮！你完成了第一次吃子。被提掉的棋子算作你的俘虏。',
    },
    {
      id: 'c1l4',
      chapter: '第一章 · 入门规则',
      title: '吃一串棋',
      size: 9,
      setup: {
        black: [[3, 4], [5, 4], [4, 3], [3, 5], [5, 5]],
        white: [[4, 4], [4, 5]],
      },
      intro:
        '相邻的同色棋子连成一块，它们<strong>共享气</strong>，要被一起提掉。<br><br>' +
        '这两颗白子连成一串，已被围得只剩 1 口气。找到它的<strong>共同气</strong>并吃掉它们！',
      goal: { type: 'capture', target: [[4, 4], [4, 5]] },
      options: { noOpponent: true },
      hints: ['两颗白子作为一个整体，只剩最下面 1 口气。', '在 E3（这串白棋的正下方）落子。'],
      answer: [4, 6],
      success: '一次提掉两子！记住：相连的棋子生死与共。',
    },
    {
      id: 'c1l5',
      chapter: '第一章 · 入门规则',
      title: '逃跑：长气求生',
      size: 9,
      setup: { black: [[4, 4]], white: [[3, 4], [4, 3], [4, 5]] },
      intro:
        '轮到你时若己方棋子被打吃，可以<strong>长一手</strong>（向外延伸）来增加气数逃跑。<br><br>' +
        '中央这颗黑子被白棋打吃，只剩 1 口气。请<strong>向外逃跑</strong>，让它的气增加到 2 口以上。',
      goal: { type: 'escape', target: [4, 4], minLibs: 2 },
      options: { noOpponent: true, showLiberties: [[4, 4]] },
      hints: ['向唯一的空口方向延伸。', '在 F5（黑子右侧）落子，连出去就能多出几口气。'],
      answer: [5, 4],
      success: '成功逃出！但要小心——有时一味逃跑反而会被“征子”擒住，这是后面的内容。',
    },

    /* ============ 第二章 · 吃子技巧 ============ */
    {
      id: 'c2l1',
      chapter: '第二章 · 吃子技巧',
      title: '打吃的方向',
      size: 9,
      setup: { black: [[3, 4], [4, 3]], white: [[4, 4]] },
      intro:
        '打吃时<strong>方向</strong>很重要：要把对方往<strong>自己的厚势或棋盘边缘</strong>驱赶，' +
        '而不是放它逃向空旷处。<br><br>' +
        '这颗白子有 2 口气，请打吃它（让它只剩 1 口气）。',
      goal: { type: 'atari', target: [4, 4] },
      options: { noOpponent: true },
      hints: ['白子还剩右侧 F5 和下方 E4 两口气，堵掉其中一口即可打吃。', '把白子往边角方向赶通常更有利。'],
      answer: [5, 4],
      success: '打吃成功！方向感是吃子的关键，多体会“把对方往哪里赶”。',
    },
    {
      id: 'c2l2',
      chapter: '第二章 · 吃子技巧',
      title: '双打吃',
      size: 9,
      setup: {
        black: [[2, 4], [3, 3], [6, 4], [5, 3]],
        white: [[3, 4], [5, 4]],
      },
      intro:
        '“<strong>双打吃</strong>”是一手棋同时打吃两块棋，对方只能救一块，另一块必被吃。<br><br>' +
        '盘上两颗白子各剩 2 口气，且共用中间一个交叉点。找到那个<strong>关键点</strong>，一手同时打吃它们！',
      goal: { type: 'doubleAtari', targets: [[3, 4], [5, 4]] },
      options: { noOpponent: true },
      hints: ['两颗白子之间的那个交叉点是要害。', '在 E5——两颗白子正中间——落子。'],
      answer: [4, 4],
      success: '一子双吃，妙！实战中要时刻留意双打吃的机会。',
    },
    {
      id: 'c2l3',
      chapter: '第二章 · 吃子技巧',
      title: '征子（扭羊头）',
      size: 9,
      setup: { black: [[2, 1], [2, 3], [3, 3]], white: [[2, 2]] },
      intro:
        '“<strong>征子</strong>”是连续打吃：每次打吃逼对方只剩一口气，对方逃，你再打吃……' +
        '像走楼梯一样把对方一路追到边上吃掉。<br><br>' +
        '关键是<strong>每一步都要打在正确的方向</strong>，否则对方就逃出去了。' +
        '请连续打吃，把这颗白子征死！（推荐落点会高亮提示，白棋会自动逃跑）',
      goal: { type: 'ladder', target: [2, 2] },
      options: { responder: 'escapeOnly' },
      hints: [
        '沿着高亮的推荐点连续打吃。',
        '征子的要点：每次都把白棋逼回“只剩一口气”，直到它撞上棋盘边缘。',
        '若白棋的气变成 3 口以上，就是逃出去了——会提示重来。',
      ],
      success: '征子成功！白棋一路被追到边线提掉。这是围棋最重要的基本功之一。',
    },
    {
      id: 'c2l4',
      chapter: '第二章 · 吃子技巧',
      title: '枷（罩 / 网）',
      size: 9,
      setup: {
        black: [[3, 2], [2, 3], [5, 3], [3, 5]],
        white: [[3, 3]],
      },
      intro:
        '当征子行不通时，可以用“<strong>枷</strong>”——不直接贴着打吃，而是隔一路罩住，' +
        '像撒网一样让对方无论往哪逃都跑不掉。<br><br>' +
        '请下出那一手<strong>罩住</strong>白子的关键点（提示：在白子的右下方斜跳一手）。',
      goal: { type: 'placeAt', points: [[4, 4]] },
      options: { noOpponent: true },
      hints: ['不要贴着白子打吃，那样它会一路逃。', '在白子右下方斜一格的 E5 落子，罩住它。'],
      answer: [4, 4],
      success: '好棋！这就是“枷”。白子被罩住后，无论往哪长都会被吃，已是你的囊中之物。',
    },
    {
      id: 'c2l5',
      chapter: '第二章 · 吃子技巧',
      title: '打劫',
      size: 9,
      setup: {
        black: [[5, 4], [4, 3], [4, 5]],
        white: [[4, 4], [2, 4], [3, 3], [3, 5]],
      },
      intro:
        '“<strong>劫</strong>”是双方可以互相提取一子的反复局面。规则规定：' +
        '被提一方<strong>不能立即回提</strong>，必须先在别处下一手（“找劫材”）。<br><br>' +
        '请提掉中间这颗白子，体会打劫的形状。',
      goal: { type: 'capture', target: [[4, 4]] },
      options: { noOpponent: true },
      hints: ['白子只剩左边 D5 一口气，在那里落子提掉它。', '提掉后你会发现白棋无法马上提回——这就是劫。'],
      answer: [3, 4],
      success:
        '你提掉了白子，形成了“劫”。此时白棋<strong>不能立刻提回</strong>，' +
        '必须先在别处下劫材。打劫是高级对杀中的常见手段。',
    },

    /* ============ 第三章 · 死活基础 ============ */
    {
      id: 'c3l1',
      chapter: '第三章 · 死活基础',
      title: '两眼活棋',
      size: 9,
      setup: {
        black: [[1, 0], [3, 0], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]],
        white: [],
      },
      intro:
        '一块棋若拥有<strong>两只真眼</strong>，对方就永远无法填掉它的最后两口气，' +
        '因此<strong>永远活着</strong>。这是围棋的根本生存法则。<br><br>' +
        '上方这块黑棋已有一只眼（左边的 C9 处），但右边还差一手才能成第二只眼。' +
        '请补上关键的一手，让它<strong>做出两只眼</strong>！',
      goal: { type: 'twoEyes', ref: [2, 1] },
      options: { noOpponent: true },
      hints: ['观察右上方的缺口，补上它就能围出第二只眼。', '在 F9 落子，完成第二只眼。'],
      answer: [5, 0],
      success: '这块棋有了两只真眼，成为<strong>活棋</strong>，再也吃不掉了！',
    },
    {
      id: 'c3l2',
      chapter: '第三章 · 死活基础',
      title: '点杀：破解直三',
      size: 9,
      setup: {
        black: [],
        white: [[1, 0], [5, 0], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]],
      },
      intro:
        '一块只有<strong>一大块眼位</strong>的棋未必能活。' +
        '对于“<strong>直三</strong>”（三个相连的眼位），只要点在<strong>正中央</strong>的要害，' +
        '对方就做不出两只眼，整块皆死。<br><br>' +
        '请点在白棋眼位的<strong>中心要害</strong>，破坏它做活！',
      goal: { type: 'placeAt', points: [[3, 0]] },
      options: { noOpponent: true },
      hints: ['三个空点连成一排，要害在正中间。', '在正中间的 D9 落子，点死白棋。'],
      answer: [3, 0],
      success:
        '点中要害！白棋无法分出两只眼，已是<strong>死棋</strong>。' +
        '记住口诀：“直三点中央”。',
    },
    {
      id: 'c3l3',
      chapter: '第三章 · 死活基础',
      title: '做活：抢占要害',
      size: 9,
      setup: {
        black: [[1, 0], [5, 0], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]],
        white: [],
      },
      intro:
        '同样是“直三”的眼位，如果<strong>轮到你</strong>来防守，只要抢先占据<strong>正中央</strong>，' +
        '就能把一个大眼分成<strong>两只真眼</strong>而活棋。<br><br>' +
        '攻防要害往往是同一点！请抢占中心，让这块黑棋做活。',
      goal: { type: 'twoEyes', ref: [2, 1] },
      options: { noOpponent: true },
      hints: ['中心点既是杀棋的要害，也是做活的要点。', '在正中间的 D9 落子，分成两只眼。'],
      answer: [3, 0],
      success: '抢占要害，黑棋两眼做活！“敌之要点即我之要点”，攻防皆然。',
    },

    /* ============ 第四章 · 实战对局 ============ */
    {
      id: 'c4l1',
      chapter: '第四章 · 实战对局',
      title: '围地与数子',
      size: 9,
      setup: { black: [], white: [] },
      intro:
        '围棋的胜负在于<strong>谁围的地盘大</strong>。被你的棋子完全包围的空点就是你的“目”（地）。<br><br>' +
        '这是一盘 9 路自由对弈。试着<strong>占据棋盘的角和边</strong>来高效围空，' +
        '右上角会实时显示双方的形势（数子）。落子后点击“停一手”可虚手，双方连续停一手即终局。',
      goal: { type: 'freePlay' },
      options: { responder: 'simple', showScore: true },
      hints: ['金角银边草肚皮：角最易围空，其次是边。', '不必把对方全部吃光，围得比对方多即可获胜。'],
      success: '',
    },
    {
      id: 'c4l2',
      chapter: '第四章 · 实战对局',
      title: '九路实战对局',
      size: 9,
      setup: { black: [], white: [] },
      intro:
        '学以致用！这是一盘完整的 9 路对局，你执黑先行，对手是内置 AI。<br><br>' +
        '综合运用所学：<strong>占角围边、打吃吃子、做活两眼</strong>。' +
        '双方连续“停一手”后自动数子判定胜负。祝你旗开得胜！',
      goal: { type: 'freePlay' },
      options: { responder: 'simple', showScore: true },
      hints: ['开局先占空角，再守边、入侵或扩张。', '保证自己的大块有两只眼，再去攻击对方薄弱处。'],
      success: '',
    },
  ];

  global.GoLessons = LESSONS;
})(typeof window !== 'undefined' ? window : globalThis);
