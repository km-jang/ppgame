'use strict';
// N-SNAKE 규칙 테스트. 브라우저 없이 snake/js/world.js를 그대로 돌린다.
// 실행: node tests/snake.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON, Uint8Array });
for (const f of ['util.js', 'data.js', 'world.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'snake', 'js', f), 'utf8'), ctx, { filename: f });
}
const SN = vm.runInContext('SN', ctx);
const D = SN.DATA;
const { create, step, turn, speed, spawnFood, botDir, nextLevel, levelDef, buildWalls, spawnItem, runStats } = SN.World;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

const COLS = 32, ROWS = 20;
// 출발 대기를 건너뛰고 정확히 n칸 전진시킨다
function ticks(W, n) {
  W.wait = 0;
  for (let i = 0; i < n && W.phase === 'play'; i++) step(W, 1 / speed(W) + 1e-9);
}
// 머리 바로 앞에 먹이를 놓는다
function foodAhead(W, gold) {
  const d = SN.World.DIRS[W.dir], h = W.snake[0];
  W.food = { x: h.x + d[0], y: h.y + d[1], gold: !!gold, born: W.t };
}
const key = p => p.x + ',' + p.y;

console.log('N-SNAKE 규칙 테스트');

test('처음 상태', () => {
  const W = create(COLS, ROWS, 1);
  assert(W.phase === 'play' && W.dir === 'right', 'play, right');
  assert(W.snake.length === D.START.len, 'start len ' + W.snake.length);
  assert(W.score === 0 && W.eaten === 0, 'score 0');
  for (let i = 1; i < W.snake.length; i++) assert(W.snake[i].x === W.snake[i - 1].x - 1 && W.snake[i].y === W.snake[0].y, 'straight body');
  assert(W.food && !W.food.gold, 'first food normal');
});

test('출발 대기 동안은 움직이지 않는다', () => {
  const W = create(COLS, ROWS, 1);
  const h = key(W.snake[0]);
  step(W, D.START.wait * 0.5);
  assert(key(W.snake[0]) === h && W.ticks === 0, 'no move during wait');
});

test('전진하면 머리가 한 칸 나아간다', () => {
  const W = create(COLS, ROWS, 1);
  W.food = { x: 0, y: 0, gold: false, born: 0 };
  const h = W.snake[0], len = W.snake.length;
  ticks(W, 3);
  assert(W.snake[0].x === h.x + 3 && W.snake[0].y === h.y, 'head moved 3');
  assert(W.snake.length === len, 'len same');
});

test('먹으면 한 칸 길어지고 점수가 오른다', () => {
  const W = create(COLS, ROWS, 1);
  const len = W.snake.length;
  foodAhead(W);
  ticks(W, 1);
  assert(W.snake.length === len + 1, 'len +1: ' + W.snake.length);
  assert(W.score === D.FOOD.points, 'score ' + W.score);
  assert(W.eaten === 1 && W.events.includes('eat'), 'eat event');
  assert(W.food && !(W.food.x === W.snake[0].x && W.food.y === W.snake[0].y), 'new food');
});

test('5번째 먹이마다 황금 구슬', () => {
  const W = create(200, ROWS, 1); // 넓은 판: 곧장 달려도 벽에 닿지 않는다
  const golds = [];
  for (let i = 0; i < 10; i++) {
    golds.push(W.food.gold);
    foodAhead(W, W.food.gold); // 새로 놓인 먹이의 종류 그대로 머리 앞으로 옮겨 먹는다
    ticks(W, 1);
  }
  const expect = [false, false, false, false, true, false, false, false, false, true];
  assert(JSON.stringify(golds) === JSON.stringify(expect), 'gold pattern ' + JSON.stringify(golds));
  assert(W.golds === 2, 'golds ' + W.golds);
  assert(W.score === D.FOOD.points * 8 + D.FOOD.goldPoints * 2, 'score ' + W.score);
});

test('황금 구슬은 큰 점수 + gold 이벤트', () => {
  const W = create(COLS, ROWS, 1);
  foodAhead(W, true);
  ticks(W, 1);
  assert(W.score === D.FOOD.goldPoints, 'gold points');
  assert(W.events.includes('gold') && W.fx.some(f => f.kind === 'gold'), 'gold event + fx');
});

test('벽에 부딪히면 끝', () => {
  const W = create(COLS, ROWS, 1);
  W.food = { x: 0, y: 0, gold: false, born: 0 };
  ticks(W, COLS);
  assert(W.phase === 'over' && W.cause === 'wall', 'wall over');
  assert(W.snake[0].x === COLS - 1, 'head stays inside: ' + W.snake[0].x);
  assert(W.events.includes('over'), 'over event');
  const t = W.ticks;
  step(W, 1);
  assert(W.ticks === t, 'no more ticks after over');
});

test('내 몸에 부딪히면 끝', () => {
  const W = create(COLS, ROWS, 1);
  W.food = { x: 0, y: 0, gold: false, born: 0 };
  // 길이 6짜리 뱀을 만들어 제자리 네모를 돈다
  W.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }];
  W.prev = W.snake.slice();
  turn(W, 'down'); ticks(W, 1);
  turn(W, 'left'); ticks(W, 1);
  turn(W, 'up'); ticks(W, 1);
  assert(W.phase === 'over' && W.cause === 'self', 'self over: ' + W.phase + ' ' + W.cause);
});

test('꼬리 끝 칸으로는 들어갈 수 있다 (꼬리가 빠지므로)', () => {
  const W = create(COLS, ROWS, 1);
  W.food = { x: 0, y: 0, gold: false, born: 0 };
  W.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 9, y: 11 }, { x: 10, y: 11 }];
  W.dir = 'right';
  turn(W, 'down'); ticks(W, 1);
  assert(W.phase === 'play', 'chase own tail ok');
});

test('정반대 방향은 무시한다', () => {
  const W = create(COLS, ROWS, 1);
  assert(turn(W, 'left') === false, 'reverse ignored');
  assert(turn(W, 'right') === false, 'same ignored');
  assert(W.queue.length === 0, 'queue empty');
  W.food = { x: 0, y: 0, gold: false, born: 0 };
  ticks(W, 1);
  assert(W.phase === 'play' && W.dir === 'right', 'still alive');
});

test('빠른 두 번 입력은 줄을 서서 차례로 적용', () => {
  const W = create(COLS, ROWS, 1);
  W.food = { x: 0, y: 0, gold: false, born: 0 };
  const h = W.snake[0];
  // 오른쪽으로 가다가 위 → 왼쪽: 한 칸 사이에 넣어도 둘 다 살아야 한다 (U턴)
  assert(turn(W, 'up') && turn(W, 'left'), 'both queued');
  assert(turn(W, 'down') === false, 'third ignored (queue full)');
  ticks(W, 1);
  assert(W.dir === 'up' && W.snake[0].x === h.x && W.snake[0].y === h.y - 1, 'first applied');
  ticks(W, 1);
  assert(W.dir === 'left' && W.snake[0].x === h.x - 1, 'second applied');
  assert(W.phase === 'play', 'alive after U-turn');
});

test('줄 선 방향 기준으로 정반대를 판단한다', () => {
  const W = create(COLS, ROWS, 1);
  assert(turn(W, 'up'), 'up');
  assert(turn(W, 'down') === false, 'down after up ignored');
  assert(turn(W, 'left'), 'left after up ok (reverse of current, not of queued)');
});

test('먹이는 절대 뱀 위에 생기지 않는다', () => {
  const W = create(8, 6, 5);
  // 판의 대부분을 뱀으로 채운 뒤 여러 번 다시 놓아 본다
  W.snake = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) if (!(y === 5 && x > 4)) W.snake.push({ x, y });
  const body = new Set(W.snake.map(key));
  for (let i = 0; i < 200; i++) {
    assert(spawnFood(W), 'has free cell');
    assert(!body.has(key(W.food)), 'food on snake at ' + key(W.food));
  }
  W.snake.push({ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 });
  assert(spawnFood(W) === false && W.food === null, 'full board = no food');
});

test('길어질수록 빨라지고 상한에서 멈춘다', () => {
  const W = create(COLS, ROWS, 1);
  const s0 = speed(W);
  assert(s0 === D.SPEED.base, 'base ' + s0);
  for (let i = 0; i < 10; i++) W.snake.push({ x: 0, y: 0 });
  const s1 = speed(W);
  assert(s1 > s0, 'faster ' + s1);
  for (let i = 0; i < 500; i++) W.snake.push({ x: 0, y: 0 });
  assert(speed(W) === D.SPEED.max, 'capped ' + speed(W));
});

test('시간을 모아 속도만큼 전진한다 (프레임과 무관)', () => {
  const a = create(COLS, ROWS, 1), b = create(COLS, ROWS, 1);
  a.food = { x: 0, y: 0, gold: false, born: 0 }; b.food = { x: 0, y: 0, gold: false, born: 0 };
  a.wait = b.wait = 0;
  for (let i = 0; i < 60; i++) step(a, 1 / 60);
  for (let i = 0; i < 120; i++) step(b, 1 / 120);
  assert(Math.abs(a.ticks - D.SPEED.base) <= 1 && Math.abs(a.ticks - b.ticks) <= 1, 'ticks ' + a.ticks + ' / ' + b.ticks);
  assert(a.alpha >= 0 && a.alpha <= 1, 'alpha range');
});

function botRun(seed, frames) {
  const W = create(COLS, ROWS, seed);
  for (let i = 0; i < frames && W.phase === 'play'; i++) {
    if (!W.queue.length) turn(W, botDir(W));
    step(W, 1 / 60);
    W.events.length = 0; W.fx.length = 0;
  }
  return W;
}

test('같은 시드면 같은 결과 (결정적)', () => {
  const a = botRun(42, 60 * 60), b = botRun(42, 60 * 60);
  assert(a.score === b.score && a.eaten === b.eaten && a.ticks === b.ticks, 'determinism');
  assert(JSON.stringify(a.snake) === JSON.stringify(b.snake), 'same body');
  const c = botRun(43, 60 * 60);
  assert(JSON.stringify(a.snake) !== JSON.stringify(c.snake) || a.score !== c.score, 'other seed differs');
});

test('자동 운전 봇은 먹이를 먹으며 오래 산다', () => {
  const W = botRun(7, 60 * 30);
  assert(W.eaten >= 10, 'bot ate ' + W.eaten);
});

test('무작위 봇 오래 돌려도 값이 망가지지 않는다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const W = create(COLS, ROWS, seed);
    const r = SN.rng(seed * 7 + 1);
    const dirs = ['up', 'down', 'left', 'right'];
    for (let i = 0; i < 60 * 120 && W.phase === 'play'; i++) {
      if (r() < 0.08) turn(W, dirs[Math.floor(r() * 4)]);
      else if (!W.queue.length && r() < 0.5) turn(W, botDir(W));
      step(W, r() * 0.05);
      W.events.length = 0; W.fx.length = 0;
      assert(Number.isFinite(W.score + W.t + W.acc + W.alpha), 'finite');
      const seen = new Set();
      for (const p of W.snake) {
        assert(p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS, 'in bounds');
        assert(!seen.has(key(p)), 'no overlap'); seen.add(key(p));
      }
      if (W.food) assert(!seen.has(key(W.food)), 'food off snake');
    }
  }
});

test('판을 가득 채우면 이긴 것으로 끝난다', () => {
  const W = create(4, 2, 1);
  // 칸 8개 중 7칸을 채우고 마지막 칸의 먹이를 먹는다
  W.snake = [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
  W.dir = 'right';
  W.food = { x: 3, y: 1, gold: false, born: 0 };
  ticks(W, 1);
  assert(W.phase === 'over' && W.won && W.events.includes('win'), 'win');
});

// ─── 무한 · 스테이지 모드 ───────────────────────────────────
const wallsOf = W => { const n = []; for (let i = 0; i < W.walls.length; i++) if (W.walls[i]) n.push(i); return n; };

test('스테이지: 레벨 12개 모두 가로·세로 판에서 출발 자리가 비어 있고 벽이 판 안에 있다', () => {
  for (const [c, r] of [D.BOARD.land, D.BOARD.port]) {
    for (let lv = 1; lv <= D.LEVELS.length + 2; lv++) {
      const W = create(c, r, lv, { mode: 'stage', level: lv });
      const def = levelDef(lv);
      assert(W.goal === def.goal && W.lv.walls === def.walls, 'level def');
      if (def.walls !== 'none') assert(wallsOf(W).length > 0, 'walls for ' + def.walls);
      const h = W.snake[0];
      for (let k = 0; k <= 5; k++) assert(!W.walls[h.y * c + h.x + k], 'lane clear lv' + lv + ' ' + c + 'x' + r);
      for (const p of W.snake) assert(!W.walls[p.y * c + p.x], 'body not in wall');
      assert(W.portals.length === (def.portals || 0), 'portals lv' + lv + ': ' + W.portals.length);
      assert(W.food && !W.walls[W.food.y * c + W.food.x] && W.portalAt[W.food.y * c + W.food.x] < 0, 'food on free cell');
    }
  }
});

test('스테이지: 목표만큼 먹으면 레벨 깸 → 다음 레벨은 새 벽·처음 길이, 점수는 그대로', () => {
  const W = create(COLS, ROWS, 3, { mode: 'stage', level: 1 });
  for (let i = 0; i < W.goal; i++) { foodAhead(W); ticks(W, 1); if (W.phase !== 'play') break; }
  assert(W.phase === 'clear' && W.events.includes('clear'), 'clear: ' + W.phase + ' got ' + W.got + '/' + W.goal);
  const sc = W.score;
  assert(sc >= W.goal * D.FOOD.points + D.STAGE.clearBonus, 'clear bonus');
  step(W, 0.5);
  assert(W.phase === 'clear' && W.clearT > 0.4, 'waits in clear');
  nextLevel(W);
  assert(W.level === 2 && W.phase === 'play' && W.snake.length === D.START.len && W.score === sc && W.got === 0, 'next level');
  assert(wallsOf(W).length > 0, 'level 2 has pillars');
  assert(runStats(W).levelsCleared === 1, 'stats');
});

test('스테이지: 벽에 부딪히면 끝, 12를 넘으면 더 빨라진다', () => {
  const W = create(COLS, ROWS, 1, { mode: 'stage', level: 3 }); // 가운데 벽
  const [c] = [COLS];
  const idx = wallsOf(W)[0], wx = idx % c, wy = Math.floor(idx / c);
  W.snake = [{ x: wx - 1, y: wy }, { x: wx - 2, y: wy }, { x: wx - 3, y: wy }, { x: wx - 4, y: wy }];
  W.dir = 'right'; W.food = { x: 0, y: 0, gold: false, born: 0 };
  ticks(W, 1);
  assert(W.phase === 'over' && W.cause === 'wall', 'inner wall kills');
  assert(levelDef(13).speed > levelDef(1).speed && levelDef(13).goal > levelDef(1).goal, 'loop harder');
});

test('포털: 들어가면 짝 포털로 나온다', () => {
  const W = create(COLS, ROWS, 5, { mode: 'stage', level: 4 });
  const P = W.portals[0];
  W.snake = [{ x: P.a.x - 1, y: P.a.y }, { x: P.a.x - 2, y: P.a.y }, { x: P.a.x - 3, y: P.a.y }, { x: P.a.x - 4, y: P.a.y }];
  W.dir = 'right'; W.food = { x: 0, y: 0, gold: false, born: 0 };
  ticks(W, 1);
  assert(W.snake[0].x === P.b.x && W.snake[0].y === P.b.y, 'teleported to ' + JSON.stringify(W.snake[0]) + ' expected ' + JSON.stringify(P.b));
  assert(W.portalsUsed === 1 && W.events.includes('portal'), 'portal counted');
  ticks(W, 1);
  assert(W.phase === 'play' && W.snake[0].x === P.b.x + 1, 'keeps going same way');
});

test('무한: 빨리 이어 먹으면 콤보 배율, 늦으면 끊긴다', () => {
  const W = create(200, ROWS, 1, { mode: 'endless' });
  const pts = [];
  for (let i = 0; i < 6; i++) { const s0 = W.score; foodAhead(W, false); ticks(W, 1); pts.push(W.score - s0); }
  assert(JSON.stringify(pts) === JSON.stringify([10, 10, 20, 20, 30, 30]), 'combo points ' + JSON.stringify(pts));
  assert(W.maxCombo === 6 && W.events.includes('combo'), 'max combo');
  W.lastEat = W.time - D.COMBO.window - 1;
  const s0 = W.score; foodAhead(W, false); ticks(W, 1);
  assert(W.combo === 1 && W.score - s0 === 10, 'combo reset');
});

test('무한: 황금 구슬은 시간이 지나면 보통 구슬로 식는다 (기본 규칙은 그대로)', () => {
  const W = create(COLS, 200, 1, { mode: 'endless' });
  W.food = { x: 0, y: 0, gold: true, born: W.t }; W.wait = 0; W.item = null; W.itemT = 99;
  W.snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }, { x: 2, y: 10 }]; W.dir = 'down';
  step(W, D.FOOD.goldLife * 0.5);
  assert(W.food.gold, 'still gold');
  for (let i = 0; i < 50 && W.food.gold; i++) step(W, 0.1);
  assert(!W.food.gold && W.events.includes('cool'), 'cooled');
  const C0 = create(COLS, ROWS, 1);
  C0.food = { x: 0, y: 0, gold: true, born: 0 }; C0.wait = 0;
  C0.snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }, { x: 2, y: 10 }]; C0.dir = 'down';
  step(C0, D.FOOD.goldLife + 1);
  assert(C0.food.gold, 'classic keeps gold');
});

test('아이템: 때가 되면 나타나고, 안 먹으면 사라진다', () => {
  const W = create(COLS, ROWS, 2, { mode: 'endless' });
  W.wait = 0; W.snake = [{ x: 3, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }];
  W.food = { x: 31, y: 19, gold: false, born: 0 };
  let seen = false;
  for (let i = 0; i < 60 * 12 && W.phase === 'play'; i++) {
    if (!W.queue.length) turn(W, botDir(W));
    step(W, 1 / 60);
    if (W.item) seen = true;
  }
  assert(seen && W.events.includes('item'), 'item appeared');
  const Q = create(200, ROWS, 2, { mode: 'endless' });
  spawnItem(Q);
  const it = Q.item;
  Q.wait = 0; it.x = 0; it.y = 0;
  Q.food = { x: 0, y: 1, gold: false, born: 0 };
  for (let i = 0; i < (D.ITEM.life + 0.5) * 10; i++) step(Q, 0.1);
  assert(Q.phase === 'play' && Q.item !== it, 'expired item gone');
});

function eatItem(kind, setupFn) {
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  W.itemT = 99; W.wait = 0;
  if (setupFn) setupFn(W);
  const d = SN.World.DIRS[W.dir], h = W.snake[0];
  W.item = { kind, x: h.x + d[0], y: h.y + d[1], life: 5, born: W.t };
  W.food = { x: 0, y: 0, gold: false, born: 0 };
  ticks(W, 1);
  return W;
}

test('아이템 느린 시계: 잠깐 느려졌다가 돌아온다', () => {
  const W = eatItem('slow');
  assert(W.eff.slow > 0 && W.events.includes('power'), 'slow on');
  const s = speed(W);
  assert(Math.abs(s - D.SPEED.base * D.ITEM.slowMul) < 1e-9, 'slower ' + s);
  step(W, D.ITEM.kinds.slow.time + 0.1);
  assert(W.eff.slow === 0 || W.phase !== 'play', 'slow ends');
});

test('아이템 점수 두 배: 구슬 점수가 두 배', () => {
  const W = eatItem('double');
  const s0 = W.score; foodAhead(W, false); ticks(W, 1);
  assert(W.score - s0 === D.FOOD.points * 2, 'double ' + (W.score - s0));
});

test('아이템 유령: 벽을 넘어 반대편으로, 몸도 통과', () => {
  const W = eatItem('ghost');
  W.snake = [{ x: COLS - 1, y: 5 }, { x: COLS - 2, y: 5 }, { x: COLS - 3, y: 5 }, { x: COLS - 4, y: 5 }];
  W.dir = 'right'; W.queue = [];
  ticks(W, 1);
  assert(W.phase === 'play' && W.snake[0].x === 0 && W.wraps === 1, 'wrapped');
  W.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }];
  W.dir = 'right';
  turn(W, 'down'); ticks(W, 1); turn(W, 'left'); ticks(W, 1); turn(W, 'up'); ticks(W, 1);
  assert(W.phase === 'play', 'passes own body');
  step(W, D.ITEM.kinds.ghost.time + 0.1);
  assert(W.eff.ghost === 0 || W.phase === 'over', 'ghost ends');
});

test('아이템 가위: 꼬리 3분의 1을 자르고 점수 (처음 길이 밑으로는 안 줄어든다)', () => {
  const W = eatItem('cut', Q => { for (let i = 0; i < 11; i++) Q.snake.push({ x: Q.snake[Q.snake.length - 1].x, y: Q.snake[Q.snake.length - 1].y + 1 }); });
  assert(W.snake.length === 15 - 5 + 0 || W.snake.length === 10, 'cut to ' + W.snake.length);
  assert(W.score === D.ITEM.kinds.cut.points, 'cut points');
  const S = eatItem('cut');
  assert(S.snake.length === D.START.len, 'min length kept ' + S.snake.length);
});

test('메달 확인 함수: 이번 판 기록과 평생 기록으로 판정', () => {
  const run = { mode: 'endless', score: 1200, golds: 1, maxLen: 41, maxCombo: 5, powerKinds: 4, portals: 0, wraps: 3 };
  const rec = { stage: { max: 6 }, total: { games: 3, orbs: 120 } };
  const got = D.MEDALS.filter(m => m.check(run, rec)).map(m => m.id).sort();
  assert(JSON.stringify(got) === JSON.stringify(['combo5', 'ghost3', 'gold1', 'len20', 'len40', 'lvl3', 'lvl6', 'power4', 'score1k'].sort()), 'medals ' + got.join(','));
  assert(new Set(D.MEDALS.map(m => m.id)).size === D.MEDALS.length, 'unique ids');
});

test('무한·스테이지 봇을 오래 돌려도 값이 망가지지 않는다', () => {
  for (const mode of ['endless', 'stage']) for (let seed = 1; seed <= 12; seed++) {
    const W = create(COLS, ROWS, seed, { mode, level: 1 + (seed % 12) });
    const r = SN.rng(seed * 3 + 7);
    for (let i = 0; i < 60 * 90 && W.phase !== 'over'; i++) {
      if (W.phase === 'clear') { if (W.clearT > D.STAGE.clearTime) nextLevel(W); step(W, 1 / 60); continue; }
      if (!W.queue.length) turn(W, r() < 0.05 ? ['up', 'down', 'left', 'right'][Math.floor(r() * 4)] : botDir(W));
      step(W, r() * 0.04);
      W.events.length = 0; W.fx.length = 0;
      assert(Number.isFinite(W.score + W.t + W.acc + W.alpha + speed(W)), 'finite');
      const seen = new Set();
      for (const p of W.snake) { assert(p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS, 'in bounds'); seen.add(key(p)); }
      if (!(W.eff.ghost > 0)) for (const p of W.snake.slice(0, 1)) assert(!W.walls[p.y * COLS + p.x] || W.phase === 'over', 'head not in wall');
    }
  }
});

// ─── 쉬움 ───
test('쉬움: 느리고, 방향을 누를 때까지 기다리고, 판 끝에서 반대편으로 나온다', () => {
  const W = create(24, 15, 1, { mode: 'endless', easy: true });
  assert(speed(W) === D.EASY.base && speed(W) < D.SPEED.base, 'slower ' + speed(W));
  step(W, 5);
  assert(W.ticks === 0 && W.wait > 0, 'waits for input');
  assert(turn(W, 'right'), 'same direction starts');
  assert(W.wait === 0, 'started');
  W.food = { x: 0, y: 0, gold: false, born: W.t }; W.itemT = 99;
  W.snake = [{ x: 23, y: 7 }, { x: 22, y: 7 }, { x: 21, y: 7 }, { x: 20, y: 7 }];
  ticks(W, 1);
  assert(W.phase === 'play' && W.snake[0].x === 0 && W.snake[0].y === 7, 'wrapped to ' + JSON.stringify(W.snake[0]));
  assert(W.wraps === 0, 'easy wrap is not the ghost medal');
  const S = create(24, 15, 1, { mode: 'stage', level: 12, easy: true });
  assert(speed(S) < levelDef(12).speed, 'stage slower in easy');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
