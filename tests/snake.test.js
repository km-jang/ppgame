'use strict';
// N-SNAKE 규칙 테스트. 브라우저 없이 snake/js/world.js를 그대로 돌린다.
// 실행: node tests/snake.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON, Uint8Array });
// 공통 우주 여행 도감 (외계 행성 이름·색). index.html과 같은 차례로 data.js보다 먼저
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common', 'worlds.js'), 'utf8'), ctx, { filename: 'worlds.js' });
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
      // 대왕 뱀 단계는 구슬 목표 대신 대왕 뱀 하나 (goal 1)
      assert((def.boss ? W.goal === 1 && W.rival && W.rival.boss : W.goal === def.goal && !W.rival) && W.lv.walls === def.walls, 'level def');
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
  // 머리가 내 몸 위에서 유령이 끝나면 나올 때까지 조금 더 이어진다 (한 번 더 흘려 보내면 끝)
  step(W, D.ITEM.kinds.ghost.time + 0.1); step(W, 0.2);
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

// ─── 앞길 위험 경고 ───
test('위험 경고: 앞에 판 끝·벽·내 몸이 있으면 알려 주고, 쉬움·유령·빠질 꼬리는 위험이 아니다', () => {
  const dz = SN.World.dangerAhead;
  const W = create(20, 12, 1, { mode: 'endless' });
  W.wait = 0; W.dir = 'right'; W.queue = [];
  W.snake = [{ x: 18, y: 5 }, { x: 17, y: 5 }, { x: 16, y: 5 }, { x: 15, y: 5 }];
  const e = dz(W, 3);
  assert(e && e.cause === 'edge' && e.dist === 2, 'edge ' + JSON.stringify(e));
  W.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }];
  assert(dz(W, 3) === null, 'open road');
  W.walls = new Uint8Array(20 * 12); W.walls[5 * 20 + 7] = 1;
  const w = dz(W, 3);
  assert(w && w.cause === 'wall' && w.dist === 2 && w.x === 7, 'wall ' + JSON.stringify(w));
  W.queue = ['down'];
  assert(dz(W, 3) === null, 'looks where the queued turn goes');
  W.queue = []; W.walls = null;
  // 몸으로 둘러싼 고리: 머리 바로 앞 칸이 몸 가운데
  W.snake = [{ x: 5, y: 5 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 7, y: 6 }];
  const b = dz(W, 3);
  assert(b && b.cause === 'self' && b.dist === 1, 'body ' + JSON.stringify(b));
  W.snake = [{ x: 5, y: 5 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 5 }];
  assert(dz(W, 3) === null, 'tail leaves before we get there');
  W.eff = { ghost: 3 };
  W.snake = [{ x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }, { x: 16, y: 5 }];
  assert(dz(W, 3) === null, 'ghost passes');
  const E = create(20, 12, 1, { mode: 'endless', easy: true });
  E.wait = 0; E.dir = 'right'; E.queue = [];
  E.snake = [{ x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }, { x: 16, y: 5 }];
  assert(dz(E, 3) === null, 'easy wraps, no edge danger');
});


// ─── 라이벌 뱀 (무한 모드) ───
const { spawnRival, rivalAt, rivalResult, hubStats, adaptPerf, dangerAhead } = SN.World;
// 라이벌이 나올 때까지 (움직인 시간 intro + 예고) 봇으로 달린다
function untilRival(W) {
  W.wait = 0;
  for (let i = 0; i < 60 * 20 && W.phase === 'play' && W.rival.phase !== 'play'; i++) {
    if (!W.queue.length) turn(W, botDir(W));
    step(W, 1 / 60);
  }
  return W;
}
// 라이벌을 원하는 모양으로 바로 놓는다 (움직이는 중)
function placeRival(W, body, dir) {
  const V = W.rival;
  V.body = body.map(p => ({ x: p.x, y: p.y })); V.prev = V.body.map(p => ({ x: p.x, y: p.y }));
  V.dir = dir; V.phase = 'play'; V.met = true; V.stun = 0; V.acc = 0; V.grow = 0; V.blocked = false; V.target = null;
}
// 라이벌만 정확히 n칸 움직인다 (내 뱀은 멀리서 기다리게)
function rivalTicks(W, n) {
  const V = W.rival;
  W.wait = 0;
  for (let i = 0; i < n; i++) { W.acc = 0; step(W, 1 / V.speed + 1e-9); }
}

test('라이벌: 무한 모드에만, 처음 몇 초는 없다가 예고 깜빡임 뒤에 나온다 (끄면 없음)', () => {
  assert(create(COLS, ROWS, 1).rival === null, 'classic none');
  assert(create(COLS, ROWS, 1, { mode: 'stage', level: 1 }).rival === null, 'stage none');
  assert(create(COLS, ROWS, 1, { mode: 'endless', rival: false }).rival === null, 'off');
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  assert(W.rival && W.rival.phase === 'wait' && W.rival.level === 'normal', 'waits');
  W.wait = 0;
  let warnAt = -1, playAt = -1;
  for (let i = 0; i < 60 * 12 && W.phase === 'play'; i++) {
    if (!W.queue.length) turn(W, botDir(W));
    step(W, 1 / 60);
    if (W.rival.phase === 'warn' && warnAt < 0) warnAt = W.time;
    if (W.rival.phase === 'play' && playAt < 0) { playAt = W.time; break; }
  }
  assert(warnAt >= D.RIVAL.intro - 0.05 && warnAt < D.RIVAL.intro + 0.1, 'appears after intro ' + warnAt);
  assert(playAt - warnAt >= D.RIVAL.appear - 0.05, 'warning first ' + (playAt - warnAt));
  assert(W.rival.body.length === D.RIVAL.len && W.rival.met, 'body');
  assert(create(24, 15, 1, { mode: 'endless', easy: true }).rival.level === 'easy', 'easy follows difficulty');
});

test('라이벌: 절대 내 가까이에 나오지 않는다 (몸 모든 칸이 떨어져 있고, 내게서 멀어지는 방향)', () => {
  for (const [c, r, easy] of [[32, 20, false], [20, 32, false], [24, 15, true], [15, 24, true]]) for (let seed = 1; seed <= 40; seed++) {
    const W = create(c, r, seed, { mode: 'endless', easy });
    W.wait = 0; W.time = D.RIVAL.intro;
    const r0 = SN.rng(seed);
    W.snake = [{ x: Math.floor(r0() * (c - 6)) + 5, y: Math.floor(r0() * r) }];
    for (let i = 1; i < 4; i++) W.snake.push({ x: W.snake[0].x - i, y: W.snake[0].y });
    W.food = null; spawnFood(W);
    assert(spawnRival(W), 'spawned ' + seed);
    const h = W.snake[0], V = W.rival;
    const far = p => Math.abs(p.x - h.x) + Math.abs(p.y - h.y);
    for (const p of V.body) {
      assert(far(p) >= D.RIVAL.minDist, 'far enough ' + far(p));
      assert(p.x >= 0 && p.y >= 0 && p.x < c && p.y < r, 'in board');
      assert(!W.snake.some(q => q.x === p.x && q.y === p.y) && !(W.food.x === p.x && W.food.y === p.y), 'free cell');
    }
    const d = SN.World.DIRS[V.dir], hd = V.body[0];
    assert(far({ x: hd.x + d[0], y: hd.y + d[1] }) > far(hd), 'heads away');
  }
});

test('라이벌 난이도: 쉬움이 느리고 둔하다 (속도·알아채기·도망 차례)', () => {
  const E = D.RIVAL.levels;
  assert(E.easy.speed < E.normal.speed && E.normal.speed < E.hard.speed, 'speed order');
  assert(E.easy.react > E.normal.react && E.normal.react > E.hard.react, 'react order');
  assert(E.easy.flee < E.normal.flee && E.normal.flee < E.hard.flee, 'flee order');
  assert(E.easy.fleeDist <= E.normal.fleeDist && E.normal.fleeDist <= E.hard.fleeDist, 'flee dist order');
  assert(E.easy.speed < D.EASY.base && E.normal.speed < D.SPEED.base, 'slower than me');
});

test('라이벌 냠냠: 몸을 물면 그 칸부터 꼬리까지 먹고 그만큼 길어진다, 라이벌은 앞부분만 남고 멈칫 (모든 난이도)', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const W = create(COLS, ROWS, 1, { mode: 'endless', diff });
    W.wait = 0; W.itemT = 99; W.giftT = 1e9; W.food = { x: 0, y: 0, gold: false, born: 0 };
    W.snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }]; W.dir = 'right';
    // 라이벌: (6,3)이 머리, 아래로 꼬리 (6,9). 내가 (6,7)을 물면 7·8·9 세 칸
    placeRival(W, [{ x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }, { x: 6, y: 8 }, { x: 6, y: 9 }], 'up');
    assert(dangerAhead(W, 3) === null, 'no rival danger ' + diff);
    const len = W.snake.length, s0 = W.score;
    ticks(W, 1);
    const V = W.rival;
    assert(W.phase === 'play' && W.snake[0].x === 6, 'alive ' + diff);
    assert(V.body.length === 4 && V.body[3].y === 6, 'rival keeps front ' + V.body.length);
    assert(V.stun > 1 && W.rivalBites === 1 && W.rivalCells === 3 && W.events.includes('bite'), 'stunned, counted');
    assert(W.score - s0 === 3 * D.RIVAL.bitePts, 'points ' + (W.score - s0));
    ticks(W, 3);
    assert(W.snake.length === len + 3, 'grew by 3: ' + W.snake.length);
    assert(runStats(W).rivalBites === 1 && hubStats(W).rivalBites === 1, 'stats');
  }
  // 피버면 점수 두 배
  const F = create(COLS, ROWS, 1, { mode: 'endless' });
  F.wait = 0; F.itemT = 99; F.giftT = 1e9; F.food = { x: 0, y: 0, gold: false, born: 0 }; F.feverT = 5;
  F.snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }]; F.dir = 'right';
  placeRival(F, [{ x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }, { x: 6, y: 8 }], 'up');
  const f0 = F.score; ticks(F, 1);
  assert(F.score - f0 === 2 * D.RIVAL.bitePts * D.FEVER.mul, 'fever x2 ' + (F.score - f0));
});

test('라이벌 통째로: 남는 앞부분이 3칸보다 짧거나 멈칫한 머리를 물면 통째로, 8~12초 뒤 안전한 자리에 처음 길이로', () => {
  const W = create(COLS, ROWS, 2, { mode: 'endless' });
  W.wait = 0; W.itemT = 99; W.giftT = 1e9; W.food = { x: 0, y: 0, gold: false, born: 0 };
  W.snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }]; W.dir = 'right';
  placeRival(W, [{ x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }, { x: 6, y: 8 }, { x: 6, y: 9 }, { x: 7, y: 9 }], 'up');
  ticks(W, 1);   // 2번 칸을 물면 앞부분 2칸만 남으니 통째로
  const V = W.rival;
  assert(W.rivalWholes === 1 && V.phase === 'gone' && V.body.length === 0 && W.events.includes('biteall'), 'whole');
  assert(V.t >= D.RIVAL.respawnMin && V.t <= D.RIVAL.respawnMax, 'respawn timer ' + V.t);
  assert(W.rivalCells === 6, 'grew by full length ' + W.rivalCells);
  const t0 = V.t;
  W.snake.forEach(p => { p.y = 12; }); W.snake.forEach((p, i) => { p.x = 10 - i; }); W.dir = 'right'; W.speedMul = 1e-6;
  step(W, t0 - 0.2);
  assert(V.phase === 'gone', 'still away');
  step(W, 0.4);
  assert(V.phase === 'warn' && V.body.length === D.RIVAL.len, 'back at start length');
  const h = W.snake[0];
  for (const p of V.body) assert(Math.abs(p.x - h.x) + Math.abs(p.y - h.y) >= D.RIVAL.minDist, 'safe spawn');
  // 멈칫한 머리를 물면 통째로
  const Q = create(COLS, ROWS, 3, { mode: 'endless' });
  Q.wait = 0; Q.itemT = 99; Q.giftT = 1e9; Q.food = { x: 0, y: 0, gold: false, born: 0 };
  Q.snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }]; Q.dir = 'right';
  placeRival(Q, [{ x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }], 'left');
  Q.rival.stun = 1;
  ticks(Q, 1);
  assert(Q.rivalWholes === 1 && Q.phase === 'play', 'stunned head eaten whole');
});

test('라이벌 한 번에 먹는 길이는 12칸까지, 긴 라이벌도', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  W.wait = 0; W.itemT = 99; W.giftT = 1e9; W.food = { x: 0, y: 0, gold: false, born: 0 };
  W.snake = [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 }]; W.dir = 'right';
  const body = [];
  for (let x = 3; x < 3 + 4; x++) body.push({ x: 6 - (x - 3), y: 0 });
  // 머리 (6,0)에서 왼쪽 (3,0), 아래로 내려와 (3,1)~(3,19): 내가 (3,1)을 물면 20칸 가까이
  body.length = 0;
  body.push({ x: 6, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 });
  for (let y = 1; y < 20; y++) body.push({ x: 3, y });
  placeRival(W, body, 'right');
  const l0 = W.snake.length;
  ticks(W, 1);
  assert(W.rivalCells === D.RIVAL.biteMax && W.rival.body.length === 4, 'capped ' + W.rivalCells);
  ticks(W, 1);
  assert(W.grow === D.RIVAL.biteMax - 2 && W.snake.length === l0 + 2, 'grow queue ' + W.grow);
});

test('머리끼리 마주 쿵: 어느 난이도에서도 안 끝나고 둘 다 잠깐 멈춘다, 라이벌 머리가 내 머리에 와도 같다', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const W = create(COLS, ROWS, 1, { mode: 'endless', diff });
    W.wait = 0; W.itemT = 99; W.giftT = 1e9; W.food = { x: 0, y: 0, gold: false, born: 0 };
    W.snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }]; W.dir = 'right';
    placeRival(W, [{ x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }], 'left');
    ticks(W, 1);
    assert(W.phase === 'play' && W.snake[0].x === 5, 'stopped, alive ' + diff);
    assert(W.hold > 0 && W.rival.stun > 0 && W.events.includes('headbump') && W.rival.body.length === 4, 'both stunned');
    const t = W.ticks;
    step(W, D.RIVAL.headHold * 0.8);
    assert(W.ticks === t, 'I hold briefly');
    // 라이벌 머리가 내 머리 칸으로
    const Q = create(COLS, ROWS, 1, { mode: 'endless', diff });
    Q.wait = 0; Q.itemT = 99; Q.giftT = 1e9; Q.food = { x: 0, y: 0, gold: false, born: 0 }; Q.speedMul = 1e-6;
    Q.snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }]; Q.dir = 'right';
    placeRival(Q, [{ x: 5, y: 6 }, { x: 5, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 3 }], 'down');
    Q.rival.clumsy = 1; Q.rival.flee = 0; Q.rival.wander = 0; Q.rival.smart = 0;
    Q.walls = new Uint8Array(COLS * ROWS); Q.walls[6 * COLS + 4] = 1; Q.walls[6 * COLS + 6] = 1;   // 옆길을 막아 곧장 내려오게
    rivalTicks(Q, 1);
    assert(Q.phase === 'play' && Q.hold > 0 && Q.rival.stun > 0 && Q.rival.body.length === 4, 'rival into my head: both stop ' + diff);
  }
});

test('라이벌이 가까우면 난이도만큼 도망간다 (어려움 > 보통 > 쉬움)', () => {
  const away = {};
  for (const diff of ['easy', 'normal', 'hard']) {
    let n = 0, tries = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const W = create(COLS, ROWS, seed, { mode: 'endless', diff });
      W.wait = 0; W.itemT = 99; W.giftT = 1e9; W.speedMul = 1e-6;
      W.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }]; W.dir = 'right';
      placeRival(W, [{ x: 11, y: 8 }, { x: 12, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 }], 'left');
      W.food = { x: 2, y: 8, gold: false, born: -9 };   // 먹이는 내 쪽 너머
      W.rival.wander = 0; W.rival.keepAway = 0;          // 도망만 따로 잰다
      const d0 = 3;
      rivalTicks(W, 1);
      const h = W.rival.body[0];
      tries++;
      if (Math.abs(h.x - 10) + Math.abs(h.y - 10) > d0) n++;
    }
    away[diff] = n / tries;
  }
  assert(away.hard > away.normal && away.normal > away.easy, 'flee ' + JSON.stringify(away));
});
test('라이벌 쉬움: 봇이 오래 놀아도 라이벌 때문에 끝나는 일은 한 번도 없다', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const W = create(24, 15, seed, { mode: 'endless', easy: true });
    W.wait = 0;
    const r = SN.rng(seed * 5 + 3);
    for (let i = 0; i < 60 * 120 && W.phase === 'play'; i++) {
      if (!W.queue.length) turn(W, r() < 0.1 ? ['up', 'down', 'left', 'right'][Math.floor(r() * 4)] : botDir(W));
      step(W, 1 / 60);
      W.events.length = 0; W.fx.length = 0;
    }
    assert(W.cause !== 'rival', 'easy rival killed on seed ' + seed);
    assert(W.rival.met || W.time < D.RIVAL.intro + 0.1, 'rival showed up');
  }
});

test('라이벌 몸은 위험이 아니다: 경고도 없고 라이벌 때문에 끝나지 않는다 (보통·어려움 봇으로 오래)', () => {
  for (const diff of ['normal', 'hard']) for (let seed = 1; seed <= 12; seed++) {
    const W = create(COLS, ROWS, seed, { mode: 'endless', diff });
    W.wait = 0;
    const r = SN.rng(seed * 3);
    for (let i = 0; i < 60 * 60 && W.phase === 'play'; i++) {
      if (!W.queue.length) turn(W, r() < 0.05 ? ['up', 'down', 'left', 'right'][Math.floor(r() * 4)] : botDir(W));
      step(W, 1 / 60);
      const d = dangerAhead(W, 3);
      assert(!d || d.cause !== 'rival', 'no rival danger');
      W.events.length = 0; W.fx.length = 0;
    }
    assert(W.cause !== 'rival', 'never ended by rival ' + diff + seed);
  }
});
test('라이벌 머리가 내 몸에 부딪히면: 라이벌만 멈칫(2초)하고 줄어든다, 나는 멀쩡', () => {
  for (const easy of [true, false]) {
    const W = create(COLS, ROWS, 1, { mode: 'endless', easy });
    W.wait = 0; W.itemT = 99; W.food = { x: 0, y: 0, gold: false, born: 0 };
    // 내 뱀: 세로 벽처럼 (움직이지 않게 속도를 아주 느리게)
    W.snake = [{ x: 10, y: 3 }, { x: 10, y: 4 }, { x: 10, y: 5 }, { x: 10, y: 6 }, { x: 10, y: 7 }, { x: 10, y: 8 }, { x: 10, y: 9 }]; W.dir = 'up';
    W.speedMul = 1e-6;
    placeRival(W, [{ x: 9, y: 6 }, { x: 8, y: 6 }, { x: 7, y: 6 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }], 'right');
    W.rival.clumsy = 1;   // 내 몸을 못 보고 들이받는다
    W.rival.wander = 0; W.rival.smart = 0;
    rivalTicks(W, 1);
    const V = W.rival;
    assert(W.phase === 'play', 'I am fine');
    assert(V.bumps === 1 && W.events.includes('bump'), 'bump');
    assert(Math.abs(V.stun - D.RIVAL.bumpStun) < 0.05, 'stun ' + V.stun);
    assert(V.body.length === 6 - D.RIVAL.bumpShrink, 'shrank ' + V.body.length);
    const h = { x: V.body[0].x, y: V.body[0].y };
    step(W, D.RIVAL.bumpStun * 0.9);
    assert(V.body[0].x === h.x && V.body[0].y === h.y, 'stays still while stunned');
    // 줄어도 minLen 밑으로는 안 간다
    V.stun = 0; V.body = V.body.slice(0, D.RIVAL.minLen); V.prev = V.body.slice(); V.dir = 'right'; V.acc = 0;
    V.body = [{ x: 9, y: 5 }, { x: 8, y: 5 }, { x: 7, y: 5 }];
    rivalTicks(W, 1);
    assert(V.body.length === D.RIVAL.minLen, 'min len ' + V.body.length);
  }
});

test('라이벌은 같은 구슬을 두고 겨룬다: 먹으면 늘어나고, 구슬은 새 자리(라이벌 위가 아님)에', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  W.wait = 0; W.itemT = 99;
  W.snake = [{ x: 3, y: 17 }, { x: 2, y: 17 }, { x: 1, y: 17 }, { x: 0, y: 17 }]; W.dir = 'right'; W.speedMul = 1e-6;
  placeRival(W, [{ x: 20, y: 5 }, { x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }], 'right');
  W.rival.smart = 1; W.rival.wander = 0;
  W.food = { x: 25, y: 5, gold: false, born: W.t - 5 };
  rivalTicks(W, 5);
  const V = W.rival;
  assert(V.eaten === 1 && W.eaten === 0, 'rival ate ' + V.eaten);
  assert(W.events.includes('rivaleat'), 'event');
  rivalTicks(W, 1);
  assert(V.body.length === D.RIVAL.len + 1, 'grew ' + V.body.length);
  assert(W.food && !V.body.some(p => p.x === W.food.x && p.y === W.food.y), 'new food off rival');
  // 새 구슬은 react초 뒤에야 알아챈다
  W.food = { x: 0, y: 0, gold: false, born: W.t };
  V.target = null;
  rivalTicks(W, 1);
  assert(V.target === null || W.t - W.food.born >= V.react, 'reacts late');
  // 게으른 아이(구슬을 안 쫓음)와 1분: 라이벌이 구슬을 꽤 먹는다 (쉬움 < 보통)
  const got = {};
  for (const easy of [true, false]) {
    let sum = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const Q = create(easy ? 24 : 32, easy ? 15 : 20, seed, { mode: 'endless', easy });
      Q.wait = 0;
      const r = SN.rng(seed);
      for (let i = 0; i < 60 * 65 && Q.phase === 'play'; i++) {
        if (!Q.queue.length && (r() < 0.03 || dangerAhead(Q, 1))) { const f = Q.food; Q.food = null; turn(Q, botDir(Q)); Q.food = f; }
        step(Q, 1 / 60);
        Q.events.length = 0; Q.fx.length = 0;
      }
      sum += Q.rival.eaten;
    }
    got[easy ? 'easy' : 'normal'] = sum / 8;
  }
  assert(got.easy >= 2 && got.normal > got.easy, 'rival competes ' + JSON.stringify(got));
});

test('라이벌: 황금 구슬도 먹고, 황금 순서는 모두 먹은 수로 센다 (아이템은 안 먹음)', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  W.wait = 0; W.itemT = 99;
  W.snake = [{ x: 3, y: 17 }, { x: 2, y: 17 }, { x: 1, y: 17 }, { x: 0, y: 17 }]; W.speedMul = 1e-6;
  placeRival(W, [{ x: 20, y: 5 }, { x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }], 'right');
  W.eaten = 3; W.rival.eaten = 0;
  W.food = { x: 21, y: 5, gold: true, born: W.t - 5 };
  W.item = { kind: 'slow', x: 22, y: 5, life: 99, born: W.t };
  W.rival.smart = 1; W.rival.wander = 0;
  rivalTicks(W, 1);
  assert(W.rival.golds === 1 && W.rival.eaten === 1 && W.golds === 0, 'rival gold');
  assert(W.food.gold === ((W.eaten + W.rival.eaten + 1) % D.FOOD.goldEvery === 0), 'gold cadence counts both');
  rivalTicks(W, 1);
  assert(W.item && W.item.kind === 'slow' && W.powers === 0, 'items are mine only');
});

test('라이벌: 막히면 멈칫, 그래도 막혀 있으면 사라졌다가 다른 자리에서 다시 나온다', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  W.wait = 0; W.itemT = 99; W.food = { x: 30, y: 18, gold: false, born: 0 };
  W.snake = [{ x: 20, y: 15 }, { x: 19, y: 15 }, { x: 18, y: 15 }, { x: 17, y: 15 }]; W.speedMul = 1e-6;
  // 왼쪽 위 구석, 위·왼쪽은 판 끝이고 아래는 자기 몸
  placeRival(W, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 2 }], 'left');
  W.walls = new Uint8Array(COLS * ROWS);
  rivalTicks(W, 1);
  assert(W.rival.stun > 0 && W.rival.blocked, 'stunned when blocked');
  step(W, D.RIVAL.blockStun + 0.3);
  assert(W.rival.phase === 'gone' && W.rival.body.length === 0, 'vanished');
  for (let i = 0; i < 60 * (D.RIVAL.back + D.RIVAL.appear + 1); i++) step(W, 1 / 60);
  assert(W.rival.phase === 'play' && W.rival.body.length === D.RIVAL.len, 'back again ' + W.rival.phase);
  assert(W.phase === 'play', 'never hurts me');
});

test('라이벌: 무한 봇을 오래 돌려도 몸이 판 안, 라이벌과 먹이가 겹치지 않고, 라이벌 몸은 스스로 겹치지 않는다', () => {
  for (const easy of [false, true]) for (let seed = 1; seed <= 10; seed++) {
    const c = easy ? 24 : COLS, r0 = easy ? 15 : ROWS;
    const W = create(c, r0, seed, { mode: 'endless', easy, rivalLevel: seed % 3 === 0 ? 'hard' : undefined });
    W.wait = 0;
    const r = SN.rng(seed * 11);
    for (let i = 0; i < 60 * 90 && W.phase === 'play'; i++) {
      if (!W.queue.length) turn(W, r() < 0.05 ? ['up', 'down', 'left', 'right'][Math.floor(r() * 4)] : botDir(W));
      step(W, r() * 0.04);
      W.events.length = 0; W.fx.length = 0;
      const V = W.rival, seen = new Set();
      for (const p of V.body) {
        assert(p.x >= 0 && p.y >= 0 && p.x < c && p.y < r0, 'rival in board');
        assert(!seen.has(key(p)), 'rival no self overlap'); seen.add(key(p));
      }
      if (W.food && (V.phase === 'play' || V.phase === 'warn')) assert(!seen.has(key(W.food)), 'food off rival');
      assert(V.body.length <= V.maxLen, 'max len');
      assert(Number.isFinite(V.acc + V.alpha + V.stun), 'finite');
    }
    if (easy) assert(W.cause !== 'rival', 'easy never killed by rival');
  }
});

test('알아서 맞춰 주는 난이도: 배율이 속도 오름·황금 시간·라이벌 실력에 조금씩 (기본 1, 범위 밖은 자름)', () => {
  const A = D.ADAPT;
  const base = create(COLS, ROWS, 1, { mode: 'endless' });
  assert(base.adapt === 1 && base.growMul === 1 && base.goldLife === D.FOOD.goldLife, 'default 1');
  const hard = create(COLS, ROWS, 1, { mode: 'endless', adapt: 1.12 });
  const soft = create(COLS, ROWS, 1, { mode: 'endless', adapt: 0.85 });
  for (const W of [base, hard, soft]) for (let i = 0; i < 10; i++) W.snake.push({ x: 0, y: 0 });
  assert(speed(hard) > speed(base) && speed(base) > speed(soft), 'speed ramp ' + [speed(soft), speed(base), speed(hard)]);
  assert(Math.abs(hard.growMul - Math.pow(1.12, A.perGrow)) < 1e-9, 'perGrow pow');
  assert(hard.goldLife < base.goldLife && soft.goldLife > base.goldLife, 'gold time');
  assert(hard.rival.speed > base.rival.speed && soft.rival.speed < base.rival.speed, 'rival speed');
  assert(hard.rival.react < base.rival.react && hard.rival.smart >= base.rival.smart, 'rival react/smart');
  assert(hard.rival.smart <= 1, 'smart <= 1');
  // 처음 길이일 때 속도는 같다 (오르는 정도만 달라진다)
  const h0 = create(COLS, ROWS, 1, { mode: 'endless', adapt: 1.12 });
  assert(speed(h0) === speed(create(COLS, ROWS, 1, { mode: 'endless' })), 'same start speed');
  assert(create(COLS, ROWS, 1, { adapt: 9 }).adapt === 1.3 && create(COLS, ROWS, 1, { adapt: 'x' }).adapt === 1, 'clamped');
  const e1 = create(24, 15, 1, { mode: 'endless', easy: true, adapt: 1.12 }), e0 = create(24, 15, 1, { mode: 'endless', easy: true });
  for (const W of [e1, e0]) for (let i = 0; i < 10; i++) W.snake.push({ x: 0, y: 0 });
  assert(speed(e1) > speed(e0), 'easy ramp too');
  const s1 = create(COLS, ROWS, 1, { mode: 'stage', level: 3, adapt: 0.85 }), s0 = create(COLS, ROWS, 1, { mode: 'stage', level: 3 });
  for (const W of [s1, s0]) for (let i = 0; i < 10; i++) W.snake.push({ x: 0, y: 0 });
  assert(speed(s1) < speed(s0), 'stage ramp too');
});

test('놀이 본부 값: 길이·황금·구슬·깬 레벨·라이벌 이김, 알아서 맞추기 perf', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  W.maxLen = 27; W.golds = 2; W.eaten = 23;
  let h = hubStats(W);
  assert(h.len === 27 && h.golds === 2 && h.orbs === 23 && h.level === 0 && h.rivalWin === 0, 'no rival met yet ' + JSON.stringify(h));
  assert(rivalResult(W) === null, 'no result before rival');
  W.rival.met = true; W.rival.eaten = 20;
  h = hubStats(W);
  assert(h.rivalWin === 1 && rivalResult(W).diff === 3, 'win');
  W.rival.eaten = 23;
  assert(hubStats(W).rivalWin === 0 && rivalResult(W).diff === 0, 'tie is not a win');
  assert(Math.abs(adaptPerf(W) - 23 / D.ADAPT.target.normal) < 1e-9, 'perf normal');
  const E = create(24, 15, 1, { mode: 'endless', easy: true }); E.eaten = D.ADAPT.target.easy;
  assert(adaptPerf(E) === 1, 'perf easy 1');
  const S = create(COLS, ROWS, 1, { mode: 'stage', level: 4 });
  assert(hubStats(S).level === 0, 'none cleared');
  S.levelsCleared = 2;
  assert(hubStats(S).level === 5 && hubStats(S).rivalWin === 0, 'cleared 4 and 5');
});

// ─── 우주 여행 배경 (그림만, 규칙은 그대로) ───
const { spaceScene, stageScene, sceneInfo } = SN.World;
const SPD = D.SPACE;
// 넓은 판에서 n개를 먹는다 (머리 앞에 먹이를 놓고 한 칸)
function eatN(W, n) {
  for (let i = 0; i < n && W.phase === 'play'; i++) { foodAhead(W, false); ticks(W, 1); }
}

test('우주 여행 무한: 수성에서 출발, 내가 구슬 12개 먹을 때마다 다음 행성 (행성 차례는 건너뛰지 않음)', () => {
  const W = create(2000, 5, 3, { mode: 'endless', rival: false });
  W.itemT = 1e9;
  assert(W.space.scene === 'mercury' && spaceScene(W).name === '수성' && W.space.max === 1, 'start mercury');
  eatN(W, SPD.perOrbs - 1);
  assert(W.space.step === 0 && W.space.scene === 'mercury', 'not yet');
  eatN(W, 1);
  assert(W.space.step === 1 && W.space.scene === 'venus' && W.events.includes('planet'), 'venus after 12 ' + W.space.scene);
  // 오래 먹으며 장면 차례 기록
  const seq = [W.space.scene];
  for (let k = 0; k < 40; k++) { eatN(W, SPD.perOrbs); seq.push(W.space.scene); }
  const planets = seq.filter(id => id !== 'hole');
  const ids = SPD.planets.map(p => p.id);
  for (let i = 0; i < planets.length; i++) assert(planets[i] === ids[(i + 1) % ids.length], 'planet order at ' + i + ' ' + planets.join(','));
  assert(W.space.lap === Math.floor(W.space.planet / ids.length) + 1 && W.space.planet >= ids.length, 'second lap ' + W.space.planet);
  assert(W.space.max === W.space.planet + 1 && hubStats(W).planet === W.space.max, 'max planet in stats');
});

test('우주 여행 블랙홀: 가끔 행성 대신 끼어들고, 두 번 연달아는 없고, 처음 장면들에는 없다', () => {
  let holes = 0, chances = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const W = create(2000, 5, seed, { mode: 'endless', rival: false });
    W.itemT = 1e9;
    let prev = W.space.scene;
    for (let k = 1; k <= 20; k++) {
      eatN(W, SPD.perOrbs);
      const cur = W.space.scene;
      if (k < SPD.holeFrom) assert(cur !== 'hole', 'no hole too early');
      if (cur === 'hole') { holes++; assert(prev !== 'hole', 'never twice in a row'); assert(spaceScene(W).kind === 'hole', 'kind'); }
      if (k >= SPD.holeFrom && prev !== 'hole') chances++;
      prev = cur;
    }
  }
  const rate = holes / chances;
  assert(rate > SPD.holeChance * 0.6 && rate < SPD.holeChance * 1.4, 'hole rate ' + rate.toFixed(3));
});

test('우주 여행: 라이벌이 먹은 구슬로는 넘어가지 않고, 하늘 차례는 먹이 자리를 흔들지 않는다', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  W.rival.met = true; W.rival.eaten = 40;
  W.eaten = 5; foodAhead(W); W.wait = 0; ticks(W, 1);
  assert(W.space.step === 0, 'rival orbs do not count');
  // 같은 씨앗이면 하늘 난수를 써도 먹이 자리는 같다
  const A = create(200, ROWS, 9, { mode: 'endless', rival: false }), B = create(200, ROWS, 9, { mode: 'endless', rival: false });
  for (let i = 0; i < 30; i++) B.space.rng();
  for (let i = 0; i < 30; i++) { foodAhead(A); ticks(A, 1); foodAhead(B); ticks(B, 1); }
  assert(A.food.x === B.food.x && A.food.y === B.food.y, 'food independent of sky');
});

test('우주 여행 스테이지: 레벨 1~9는 수성~명왕성, 10 블랙홀 · 11 은하수 · 12 은하 중심, 13~20 외계 행성, 그다음은 다시', () => {
  const want = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'hole', 'galaxy', 'core',
    'frost', 'lava', 'ocean', 'glass', 'gem', 'twin', 'shroom', 'rogue'];
  for (let n = 1; n <= 44; n++) {
    assert(stageScene(n) === want[(n - 1) % 20], 'level ' + n);
    const S = create(COLS, ROWS, 1, { mode: 'stage', level: n });
    assert(S.space.scene === want[(n - 1) % 20], 'world scene ' + n);
  }
  // 외계 행성 레벨은 10~17번째 행성으로 센다
  const X = create(COLS, ROWS, 1, { mode: 'stage', level: 13 });
  assert(X.space.max === 10 && hubStats(X).planet === 10 && spaceScene(X).kind === 'planet', 'frost is planet 10');
  assert(create(COLS, ROWS, 1, { mode: 'stage', level: 20 }).space.max === 17, 'rogue is planet 17');
  // 스테이지는 그냥 놀기 출발 행성을 따르지 않는다
  assert(create(COLS, ROWS, 1, { mode: 'stage', level: 2, skyStart: 12 }).space.scene === 'venus', 'stage ignores skyStart');
  assert(sceneInfo('mars').name === '화성' && sceneInfo('mars').index === 4, 'mars info');
  assert(sceneInfo('hole').kind === 'hole' && sceneInfo('galaxy').kind === 'galaxy' && sceneInfo('core').kind === 'core', 'other kinds');
  for (const id of want) assert(sceneInfo(id).name && sceneInfo(id).color, 'has name ' + id);
  // 다음 레벨로 가면 하늘도 바뀌고, 이번 판에 간 가장 먼 행성이 남는다
  const S = create(COLS, ROWS, 1, { mode: 'stage', level: 3 });
  assert(S.space.scene === 'earth' && S.space.max === 3, 'earth');
  S.got = S.goal - 1; foodAhead(S); S.wait = 0; ticks(S, 1);
  assert(S.phase === 'clear', 'cleared');
  nextLevel(S);
  assert(S.space.scene === 'mars' && S.space.max === 4 && hubStats(S).planet === 4, 'mars next');
  const H = create(COLS, ROWS, 1, { mode: 'stage', level: 10 });
  assert(H.space.scene === 'hole' && H.space.max === 9, 'beyond pluto counts as 9');
  // 스테이지는 구슬 수로 넘어가지 않는다
  const Q = create(COLS, ROWS, 1, { mode: 'stage', level: 1 });
  Q.eaten = 30; foodAhead(Q); Q.wait = 0; ticks(Q, 1);
  assert(Q.space.scene === 'mercury', 'stage fixed');
});

test('우주 여행 17행성: 명왕성 다음은 공통 도감의 외계 행성 여덟 (도감 차례 그대로), 떠돌이 행성 다음은 다시 수성', () => {
  const WORLDS = vm.runInContext('WORLDS', ctx);
  const ids = SPD.planets.map(p => p.id);
  assert(ids.length === 17 && SPD.solar === 9, 'seventeen ' + ids.length);
  assert(ids.slice(0, 9).join() === 'mercury,venus,earth,mars,jupiter,saturn,uranus,neptune,pluto', 'solar first');
  assert(ids.slice(9).join() === WORLDS.EXO.map(p => p.id).join(), 'exo order same as catalogue ' + ids.slice(9).join());
  for (const p of SPD.planets.slice(9)) {
    const e = WORLDS.exo(p.id);
    assert(p.exo && p.name === e.name && p.fact === e.line && p.color === e.color, 'catalogue text ' + p.id);
    assert(sceneInfo(p.id).kind === 'planet' && sceneInfo(p.id).index === ids.indexOf(p.id) + 1, 'info ' + p.id);
  }
  // 모든 행성에 날씨가 있다 (그림이 날씨를 찾는다)
  for (const id of ids) assert(WORLDS.weatherOf(id), 'weather ' + id);
  // 블랙홀 없이 끝까지: 씨앗을 골라 블랙홀이 한 번도 안 끼게 난수를 막는다
  const W = create(4000, 5, 3, { mode: 'endless', rival: false });
  W.itemT = 1e9; W.space.rng = () => 0.99;
  const seq = [W.space.scene];
  for (let k = 0; k < 18; k++) { eatN(W, SPD.perOrbs); seq.push(W.space.scene); }
  assert(seq.slice(0, 17).join() === ids.join(), 'journey ' + seq.join());
  assert(seq[9] === 'frost' && seq[16] === 'rogue' && seq[17] === 'mercury' && seq[18] === 'venus', 'after rogue comes mercury');
  assert(W.space.lap === 2 && W.space.max === 19, 'lap 2 max ' + W.space.max);
});

test('우주 여행 이어 가기: 그냥 놀기는 지난 판에 닿은 행성에서 출발 (skyStart), 이상한 값은 수성', () => {
  const { skyStartOf, skyNext } = SN.World;
  const ids = SPD.planets.map(p => p.id);
  const W = create(4000, 5, 3, { mode: 'endless', rival: false, skyStart: 9 });
  W.itemT = 1e9; W.space.rng = () => 0.99;
  assert(W.space.scene === 'frost' && W.space.max === 10 && W.space.lap === 1 && spaceScene(W).name === '꽁꽁 얼음 행성', 'start frost');
  eatN(W, SPD.perOrbs);
  assert(W.space.scene === 'lava' && W.space.max === 11 && skyNext(W) === 10, 'lava next');
  for (let k = 0; k < 7; k++) eatN(W, SPD.perOrbs);
  assert(W.space.scene === 'mercury' && W.space.lap === 1 && skyNext(W) === 0, 'wraps to mercury, still first lap from frost');
  for (let k = 0; k < 9; k++) eatN(W, SPD.perOrbs);
  assert(W.space.scene === 'frost' && W.space.lap === 2, 'lap 2 back at frost');
  // 블랙홀 하늘이면 바로 앞 행성에서 이어 간다
  const H = create(4000, 5, 3, { mode: 'endless', rival: false, skyStart: 3 });
  H.itemT = 1e9; H.space.rng = () => 0.99; eatN(H, SPD.perOrbs);
  H.space.rng = () => 0; eatN(H, SPD.perOrbs);
  assert(H.space.scene === 'hole' && skyNext(H) === 4, 'hole keeps jupiter ' + skyNext(H));
  // 값 다듬기: 음수·글자·빈 값은 0, 큰 값은 바퀴 안으로
  assert(skyStartOf(-3) === 0 && skyStartOf('abc') === 0 && skyStartOf(undefined) === 0 && skyStartOf(null) === 0, 'bad to 0');
  assert(skyStartOf(20) === 3 && skyStartOf('5') === 5 && skyStartOf(16.7) === 16, 'wrap and floor');
  assert(create(COLS, ROWS, 1, { mode: 'endless', skyStart: 40 }).space.scene === ids[40 % 17], 'create wraps');
  // 출발 행성은 먹이 자리를 흔들지 않는다
  const A = create(200, ROWS, 9, { mode: 'endless', rival: false }), B = create(200, ROWS, 9, { mode: 'endless', rival: false, skyStart: 14 });
  for (let i = 0; i < 30; i++) { foodAhead(A); ticks(A, 1); foodAhead(B); ticks(B, 1); }
  assert(A.food.x === B.food.x && A.food.y === B.food.y && A.score === B.score, 'rules same');
});

// ─── 어려움 ───
test('난이도 세 가지: 쉬움 < 보통 < 어려움 (출발 속도·빨라지는 정도·황금 시간·아이템·스테이지)', () => {
  const E = create(24, 15, 1, { mode: 'endless', diff: 'easy' }), N = create(COLS, ROWS, 1, { mode: 'endless', diff: 'normal' }), H = create(COLS, ROWS, 1, { mode: 'endless', diff: 'hard' });
  assert(E.easy && !E.hard && N.diff === 'normal' && !N.easy && H.hard && !H.easy, 'flags');
  assert(speed(E) < speed(N) && speed(N) < speed(H), 'start speed ' + [speed(E), speed(N), speed(H)]);
  for (const W of [E, N, H]) for (let i = 0; i < 20; i++) W.snake.push({ x: 0, y: 0 });
  assert(speed(E) < speed(N) && speed(N) < speed(H), 'long speed');
  const n0 = create(COLS, ROWS, 1, { mode: 'endless', diff: 'normal' }), h0 = create(COLS, ROWS, 1, { mode: 'endless', diff: 'hard' });
  assert(speed(H) - speed(h0) > speed(N) - speed(n0), 'hard ramps faster');
  for (let i = 0; i < 200; i++) { H.snake.push({ x: 0, y: 0 }); N.snake.push({ x: 0, y: 0 }); }
  assert(speed(H) === D.HARD.max && D.HARD.max > D.SPEED.max, 'hard cap');
  assert(H.goldLife < N.goldLife && H.itemGapMul > N.itemGapMul, 'gold shorter, items rarer');
  for (const n of [1, 6, 12]) {
    const sE = create(24, 15, 1, { mode: 'stage', level: n, diff: 'easy' }), sN = create(COLS, ROWS, 1, { mode: 'stage', level: n }), sH = create(COLS, ROWS, 1, { mode: 'stage', level: n, diff: 'hard' });
    assert(speed(sE) < speed(sN) && speed(sN) < speed(sH), 'stage speed ' + n);
  }
  // 옛 호출: easy: true 는 쉬움, 없으면 보통. diff가 이긴다
  assert(create(COLS, ROWS, 1, { easy: true }).diff === 'easy' && create(COLS, ROWS, 1, {}).diff === 'normal', 'old easy opt');
  assert(create(COLS, ROWS, 1, { easy: true, diff: 'hard' }).diff === 'hard' && create(COLS, ROWS, 1, { diff: 'x' }).diff === 'normal', 'diff wins, bad id');
  assert(D.DIFFS.map(d => d.id).join() === 'easy,normal,hard', 'three buttons');
});

test('어려움: 판 끝은 끝, 센 라이벌(빠르고 잘 도망), 경고 켜짐, 출발 대기는 보통처럼', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless', diff: 'hard' });
  assert(W.wait === D.START.wait, 'normal wait');
  assert(W.rival.level === 'hard' && W.rival.speed === D.RIVAL.levels.hard.speed && W.rival.flee === D.RIVAL.levels.hard.flee, 'hard rival');
  assert(D.RIVAL.levels.hard.speed > D.RIVAL.levels.normal.speed && D.RIVAL.levels.hard.react < D.RIVAL.levels.normal.react, 'stronger');
  const E = create(COLS, ROWS, 1, { mode: 'endless', diff: 'hard' });
  E.wait = 0; E.dir = 'right'; E.queue = []; E.itemT = 99;
  E.snake = [{ x: COLS - 2, y: 5 }, { x: COLS - 3, y: 5 }, { x: COLS - 4, y: 5 }, { x: COLS - 5, y: 5 }];
  const e = dangerAhead(E, 3);
  assert(e && e.cause === 'edge', 'edge warning');
  ticks(E, 3);
  assert(E.phase === 'over' && E.cause === 'wall', 'edge deadly');
});
test('어려움은 분명히 더 어렵다: 아이 흉내 봇이 버틴 시간·먹은 구슬 쉬움 > 보통 > 어려움', () => {
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const out = {};
  for (const diff of ['easy', 'normal', 'hard']) {
    const [c, r0] = diff === 'easy' ? [24, 15] : [COLS, ROWS];
    const ts = [], es = [];
    for (let seed = 1; seed <= 16; seed++) {
      const W = create(c, r0, seed, { mode: 'endless', diff });
      W.wait = 0;
      const r = SN.rng(seed * 13 + 1);
      let lag = 0;
      for (let i = 0; i < 60 * 120 && W.phase === 'play'; i++) {
        if ((lag -= 1 / 60) <= 0) {
          lag = 0.12;
          if (r() < 0.04) turn(W, ['up', 'down', 'left', 'right'][Math.floor(r() * 4)]);
          else if (!dangerAhead(W, 1) || r() < 0.85) turn(W, botDir(W));
        }
        step(W, 1 / 60);
        W.events.length = 0; W.fx.length = 0;
      }
      ts.push(W.time); es.push(W.eaten);
    }
    out[diff] = { t: med(ts), e: med(es) };
  }
  assert(out.easy.t > out.normal.t && out.normal.t > out.hard.t, 'time ' + JSON.stringify(out));
  assert(out.easy.e > out.normal.e && out.normal.e >= out.hard.e, 'orbs ' + JSON.stringify(out));
  // 그래도 공평하다: 잘 피하는 봇은 어려움에서도 1분 넘게 버틴다
  const long = [];
  for (let seed = 1; seed <= 8; seed++) {
    const W = create(COLS, ROWS, seed, { mode: 'endless', diff: 'hard' });
    W.wait = 0;
    for (let i = 0; i < 60 * 90 && W.phase === 'play'; i++) { if (!W.queue.length) turn(W, botDir(W)); step(W, 1 / 60); W.events.length = 0; W.fx.length = 0; }
    long.push(W.time);
  }
  assert(med(long) >= 60, 'fair for a careful player ' + med(long));
});

test('어려움 메달·미션 값·알아서 맞추기 기준', () => {
  const H = create(COLS, ROWS, 1, { mode: 'endless', diff: 'hard' });
  H.maxLen = 31; H.time = 70;
  const r = runStats(H);
  assert(r.diff === 'hard' && r.hardLen === 31 && r.hardTime === 70 && r.normalLen === 31, 'run stats');
  const got = D.MEDALS.filter(m => m.id.startsWith('hard') && m.check(r, {})).map(m => m.id).sort();
  assert(got.join() === 'hard20,hard30', 'hard medals ' + got);
  const N = create(COLS, ROWS, 1, { mode: 'endless' }); N.maxLen = 40;
  assert(!D.MEDALS.filter(m => m.id.startsWith('hard')).some(m => m.check(runStats(N), {})), 'normal does not count');
  assert(runStats(N).hardLen === 0 && runStats(N).hardTime === 0, 'normal hard stats 0');
  assert(D.MISSIONS.some(m => m.stat === 'hardLen') && D.MISSIONS.some(m => m.stat === 'hardTime'), 'hard missions');
  assert(D.ADAPT.target.hard > 0 && D.ADAPT.target.hard < D.ADAPT.target.normal, 'hard target');
  H.eaten = D.ADAPT.target.hard;
  assert(adaptPerf(H) === 1, 'hard perf');
});

// ─── 재미 셋: 선물 상자 · 피버 · 거대 뱀 ───
const { spawnGift, openGift, startFever, startGiant } = SN.World;
const GFT = D.GIFT;
// 판을 오래 돌리는 봇 (쉬움, 판 끝을 넘어도 괜찮게), 조건이 맞으면 멈춘다
function runUntil(W, cond, sec) {
  W.wait = 0;
  for (let i = 0; i < 60 * sec && W.phase === 'play'; i++) {
    if (!W.queue.length) turn(W, botDir(W));
    step(W, 1 / 60);
    if (cond(W)) return true;
    W.fx.length = 0;
  }
  return false;
}

test('선물 상자 무한: 60~100초 사이에 처음 나오고, 내 머리에서 떨어진 빈 칸, 10초 뒤 사라지고, 다음은 다시 60~100초 뒤', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const W = create(24, 15, seed, { mode: 'endless', diff: 'easy', rival: false });
    assert(W.giftT >= GFT.firstMin && W.giftT <= GFT.firstMax, 'first timer ' + W.giftT);
    W.eff.ghost = 1e9;   // 오래 살아 있게
    assert(runUntil(W, Q => !!Q.gift, 120), 'gift appeared');
    assert(W.time >= GFT.firstMin - 0.05 && W.time <= GFT.firstMax + 0.1, 'appear time ' + W.time);
    const h = W.snake[0];
    assert(Math.abs(W.gift.x - h.x) + Math.abs(W.gift.y - h.y) > GFT.minDist, 'far from head');
    assert(!W.snake.some(p => p.x === W.gift.x && p.y === W.gift.y) && !(W.food.x === W.gift.x && W.food.y === W.gift.y), 'free cell');
    assert(W.events.includes('gift'), 'event');
    assert(W.giftT >= GFT.gapMin && W.giftT <= GFT.gapMax, 'next gap ' + W.giftT);
    const g = W.gift;
    W.gift.x = 0; W.gift.y = 0; W.snake.forEach((p, i) => { p.x = 10 + i; p.y = 10; }); W.dir = 'left';   // 안 먹게 멀리
    step(W, GFT.life + 0.1);
    assert(!W.gift && W.gifts === 0 && g, 'vanished after life');
  }
  assert(create(COLS, ROWS, 1).giftT === Infinity, 'classic none');
});

test('선물 상자 스테이지: 3·6·9·12레벨에서 한 번, 다른 레벨은 없음', () => {
  for (let n = 1; n <= 14; n++) {
    const S = create(COLS, ROWS, 1, { mode: 'stage', level: n });
    const on = GFT.stageLevels.includes(((n - 1) % 12) + 1);
    assert(on ? S.giftT === GFT.stageAt : S.giftT === Infinity, 'level ' + n + ' ' + S.giftT);
  }
  const S = create(COLS, ROWS, 1, { mode: 'stage', level: 3 });
  S.wait = 0; S.itemT = 99;
  step(S, GFT.stageAt + 0.01);
  assert(S.gift && S.giftT === Infinity, 'once in the level');
});

test('선물 상자 열기: 코인 15~40 · 바로 켜지는 아이템 · 다음 판 시작 아이템, 셋 다 나온다', () => {
  const W = create(200, ROWS, 5, { mode: 'endless', rival: false });
  const kinds = {};
  let coins = 0;
  for (let i = 0; i < 200; i++) {
    W.gift = { x: 50, y: 5, life: 5, born: 0 };
    const r = openGift(W);
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    if (r.kind === 'coins') { assert(r.n >= 15 && r.n <= 40, 'coin range ' + r.n); coins += r.n; assert(r.text === '선물: 코인 ' + r.n + '개!', 'text'); }
    if (r.kind === 'power') assert(W.eff[r.id] > 0, 'power on ' + r.id);
  }
  assert(kinds.coins && kinds.power && kinds.start, 'all kinds ' + JSON.stringify(kinds));
  assert(kinds.coins > kinds.start, 'coins most common');
  assert(W.gifts === 200 && W.giftCoins === coins && W.giftStart.length === kinds.start, 'counted');
  const rs = runStats(W);
  assert(rs.gifts === 200 && rs.giftCoins === coins && hubStats(W).gifts === 200, 'stats');
  // 머리 앞에 선물 → 한 칸 가면 연다
  const Q = create(200, ROWS, 2, { mode: 'endless', rival: false });
  Q.wait = 0; Q.itemT = 99;
  const d = SN.World.DIRS[Q.dir], h = Q.snake[0];
  Q.gift = { x: h.x + d[0], y: h.y + d[1], life: 5, born: 0 };
  ticks(Q, 1);
  assert(Q.gifts === 1 && !Q.gift && Q.events.includes('giftopen') && Q.lastGift, 'eaten');
});

test('선물 상자는 라이벌이 못 먹는다 (라이벌은 비켜 간다)', () => {
  for (let k = 0; k < 20; k++) {
    const W = create(COLS, ROWS, k + 1, { mode: 'endless' });
    W.wait = 0; W.itemT = 99; W.giftT = 1e9;
    W.snake = [{ x: 3, y: 17 }, { x: 2, y: 17 }, { x: 1, y: 17 }, { x: 0, y: 17 }]; W.speedMul = 1e-6;
    placeRival(W, [{ x: 20, y: 5 }, { x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }], 'right');
    W.rival.smart = 1; W.rival.wander = 0;
    W.gift = { x: 21, y: 5, life: 99, born: 0 };
    W.food = { x: 25, y: 5, gold: false, born: W.t - 9 };
    rivalTicks(W, 8);
    assert(W.gift && W.gifts === 0, 'gift still there');
    assert(!W.rival.body.some(p => p.x === 21 && p.y === 5), 'rival not on gift');
  }
});

test('피버 타임: 콤보로 게이지가 차면 10초 동안 점수 ×2 · 구슬이 하나 더, 끝나면 보너스 구슬도 사라진다', () => {
  const W = create(400, ROWS, 1, { mode: 'endless', rival: false });
  W.itemT = 1e9; W.giftT = 1e9;
  const need = Math.ceil(1 / D.FEVER.perCombo) + 1;
  for (let i = 0; i < need && W.feverT <= 0; i++) { foodAhead(W); ticks(W, 1); }
  assert(W.feverT > 0 && W.fevers === 1 && W.events.includes('fever'), 'fever started ' + W.fever);
  assert(W.bonus && !(W.bonus.x === W.food.x && W.bonus.y === W.food.y), 'bonus orb');
  // 점수 두 배
  W.lastEat = -99; W.combo = 0; W.mult = 1;
  let s0 = W.score; foodAhead(W); ticks(W, 1);
  const bonusLen = Math.floor((W.snake.length - 1 - D.START.len) / D.FOOD.bonusPer) * D.FOOD.bonus;
  assert(W.score - s0 === (D.FOOD.points + bonusLen) * D.FEVER.mul, 'x2 ' + (W.score - s0));
  // 보너스 구슬 먹기: 길어지고 새 보너스 구슬
  const len = W.snake.length, e0 = W.eaten;
  const d = SN.World.DIRS[W.dir], h = W.snake[0];
  W.bonus = { x: h.x + d[0], y: h.y + d[1], born: W.t };
  W.food = { x: 0, y: 0, gold: false, born: W.t };
  ticks(W, 1);
  assert(W.eaten === e0 + 1 && W.bonus && !(W.bonus.x === h.x + d[0] && W.bonus.y === h.y + d[1]), 'bonus eaten, new one');
  ticks(W, 1);
  assert(W.snake.length === len + 1, 'grew');
  // 끝
  step(W, D.FEVER.time + 0.5);
  assert(W.feverT === 0 && !W.bonus && W.events.includes('feverend'), 'ended');
  s0 = W.score; W.lastEat = -99; W.combo = 0; W.mult = 1; foodAhead(W); ticks(W, 1);
  assert(W.score - s0 < (D.FOOD.points + 20) * D.FEVER.mul && W.fever < 0.2, 'normal again');
  // 기본 모드는 피버 없음, 게이지는 쉬면 줄어든다
  const C0 = create(400, ROWS, 1);
  for (let i = 0; i < 20; i++) { foodAhead(C0); ticks(C0, 1); }
  assert(C0.fevers === 0 && C0.feverT === 0, 'classic none');
  const Q = create(400, ROWS, 1, { mode: 'endless', rival: false });
  Q.fever = 0.5; Q.wait = 0; Q.itemT = 1e9; Q.giftT = 1e9; Q.snake.forEach(p => { p.y = 3; }); Q.dir = 'right';
  step(Q, 2);
  assert(Q.fever < 0.5 && Q.fever > 0.3, 'decays ' + Q.fever);
  assert(hubStats(W).fevers === 1, 'stats');
});

test('거대 뱀: 황금 구슬 셋을 12초 안에 먹으면 6초 변신, 벽을 부수고 라이벌은 도망, 끝나면 벽이 다시 위험', () => {
  const W = create(400, ROWS, 1, { mode: 'endless' });
  W.itemT = 1e9; W.giftT = 1e9;
  for (let i = 0; i < 3; i++) { foodAhead(W, true); ticks(W, 1); }
  assert(W.eff.giant > 0 && W.giants === 1 && W.events.includes('giant'), 'giant on');
  assert(Math.abs(W.eff.giant - D.GIANT.time) < 0.5, 'time ' + W.eff.giant);
  step(W, D.GIANT.time + 0.2);
  assert(!(W.eff.giant > 0) || W.phase !== 'play', 'ends');
  // 느리게 먹으면 안 된다
  const S = create(400, ROWS, 1, { mode: 'endless', rival: false });
  S.itemT = 1e9; S.giftT = 1e9;
  for (let i = 0; i < 3; i++) { foodAhead(S, true); ticks(S, 1); S.time += D.GIANT.window * 0.6; }
  assert(S.giants === 0, 'spread out: no giant');
  // 라이벌은 도망간다
  const R2 = create(COLS, ROWS, 1, { mode: 'endless' });
  placeRival(R2, [{ x: 25, y: 15 }, { x: 24, y: 15 }, { x: 23, y: 15 }, { x: 22, y: 15 }], 'right');
  startGiant(R2);
  assert(R2.rival.phase === 'gone' && R2.rival.t > D.GIANT.time, 'rival scared away');
  // 스테이지 벽 부수기
  const T = create(COLS, ROWS, 1, { mode: 'stage', level: 3 });
  T.wait = 0; T.itemT = 1e9; T.food = { x: 0, y: 0, gold: false, born: 0 };
  const d = SN.World.DIRS[T.dir], h = T.snake[0], wi = (h.y + d[1]) * COLS + h.x + d[0];
  T.walls[wi] = 1;
  startGiant(T);
  const ver = T.wallVer;
  ticks(T, 1);
  assert(T.phase === 'play' && T.walls[wi] === 0 && T.smashed === 1 && T.wallVer > ver && T.events.includes('smash'), 'smashed');
  assert(dangerAhead(T, 3) === null || dangerAhead(T, 3).cause !== 'wall', 'no wall danger while giant');
  T.eff.giant = 0;
  const h2 = T.snake[0], wj = (h2.y + d[1]) * COLS + h2.x + d[0];
  T.walls[wj] = 1;
  ticks(T, 1);
  assert(T.phase === 'over' && T.cause === 'wall', 'walls deadly again');
  assert(hubStats(W).giants === 1, 'stats');
});

test('라이벌 냠냠 기록: 메달 "라이벌 통째로" · 미션 값 · 라이벌 이김은 구슬 + 물어 먹은 칸으로', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless' });
  W.rival.met = true; W.rival.eaten = 10; W.eaten = 6; W.rivalCells = 5; W.rivalBites = 2; W.rivalWholes = 1;
  const r = runStats(W);
  assert(r.rivalBites === 2 && r.rivalWholes === 1 && r.rivalCells === 5, 'run stats');
  assert(D.MEDALS.find(m => m.id === 'rivalAll').check(r, {}), 'medal');
  assert(!D.MEDALS.find(m => m.id === 'rivalAll').check(runStats(create(COLS, ROWS, 1, { mode: 'endless' })), {}), 'no medal without');
  assert(D.MISSIONS.some(m => m.stat === 'rivalBites'), 'mission');
  const rr = rivalResult(W);
  assert(rr.me === 11 && rr.diff === 1 && rr.bites === 2 && hubStats(W).rivalWin === 1, 'win counts bites ' + JSON.stringify(rr));
});

// ─── 점검 고침 (2026-09-27): 한 번 더 · 유령 끝 · 첫 밀기 · 포털 너머 경고 · 먹이 다시 놓기 · 단계 이름 ───
const W2 = SN.World;
test('한 번 더: 한 판에 한 번, 길이 그대로 되살아나고 3초 유령, 벽을 보지 않는 방향 (쉬움은 밀면 출발)', () => {
  const W = create(COLS, ROWS, 3, { mode: 'endless', rival: false });
  W.wait = 0; W.item = null; W.itemT = 99;
  W.snake = [{ x: COLS - 1, y: 5 }, { x: COLS - 2, y: 5 }, { x: COLS - 3, y: 5 }, { x: COLS - 4, y: 5 }, { x: COLS - 5, y: 5 }];
  W.dir = 'right'; W.queue = []; W.food = { x: 0, y: 0, gold: false, born: 0 };
  ticks(W, 1);
  assert(W.phase === 'over' && W.cause === 'wall', 'died');
  assert(W2.canContinue(W), 'can continue');
  assert(W2.revive(W) && W.phase === 'play' && W.continued, 'revived');
  assert(W.snake.length === 5, 'length kept ' + W.snake.length);
  assert(W.eff.ghost >= D.CONTINUE.ghost, 'ghost ' + W.eff.ghost);
  assert(W.dir !== 'right', 'not heading into the edge: ' + W.dir);
  const d = SN.World.DIRS[W.dir], h = W.snake[0];
  const nx = h.x + d[0], ny = h.y + d[1];
  assert(nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && !W.snake.some(p => p.x === nx && p.y === ny), 'safe next cell');
  assert(W.wait > 0 && W.wait < 5, 'normal: short wait then go');
  // 두 번째는 없다
  W.phase = 'over';
  assert(!W2.canContinue(W) && !W2.revive(W), 'only once');
  // 판을 다 채워 이긴 것 · 기본 규칙(classic)은 없음
  const V = create(COLS, ROWS, 1); V.phase = 'over';
  assert(!W2.canContinue(V), 'classic none');
  const Wn = create(COLS, ROWS, 1, { mode: 'endless' }); Wn.phase = 'over'; Wn.won = true;
  assert(!W2.canContinue(Wn), 'won none');
  // 쉬움: 되살아나면 밀 때까지 기다린다
  const E = create(24, 15, 2, { mode: 'stage', level: 3, diff: 'easy' });
  E.phase = 'over';
  assert(W2.revive(E) && E.wait === Infinity, 'easy waits for a swipe');
  assert(runStats(E).revives === 1, 'stats');
});

test('한 번 더: 벽에 둘러싸여 앞이 모두 막혀도 뒤집어서 안전한 쪽으로, 벽 칸으로는 절대 안 간다 (여러 번)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const W = create(COLS, ROWS, seed, { mode: 'stage', level: 1 + (seed % 12) });
    W.wait = 0;
    for (let i = 0; i < 60 * 60 && W.phase === 'play'; i++) {
      if (W.phase === 'clear') break;
      if (!W.queue.length) turn(W, seed % 3 ? botDir(W) : ['up', 'down', 'left', 'right'][i % 4]);
      step(W, 1 / 60); W.events.length = 0; W.fx.length = 0;
    }
    if (W.phase !== 'over') continue;
    assert(W2.revive(W), 'revive ' + seed);
    const d = SN.World.DIRS[W.dir], h = W.snake[0];
    const nx = h.x + d[0], ny = h.y + d[1];
    const out = nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS;
    assert(!out && !W.walls[ny * COLS + nx], 'seed ' + seed + ' heads into a wall/edge ' + W.dir);
  }
});

test('유령이 벽 속에서 끝나면 머리가 나올 때까지 이어지고, 끝나기 전에 앞길 경고가 다시 켜진다', () => {
  const W = create(COLS, ROWS, 1, { mode: 'stage', level: 3 });   // 가운데 벽 (가로 한 줄)
  const idx = wallsOf(W)[3], wx = idx % COLS, wy = Math.floor(idx / COLS);
  W.wait = 0; W.item = null; W.itemT = 99; W.food = { x: 0, y: 0, gold: false, born: 0 };
  // 벽 한가운데로 위에서 내려오는 중, 유령이 곧 끝난다
  W.snake = [{ x: wx, y: wy }, { x: wx, y: wy - 1 }, { x: wx, y: wy - 2 }, { x: wx, y: wy - 3 }];
  W.prev = W.snake.map(p => ({ x: p.x, y: p.y }));
  W.dir = 'down'; W.queue = []; W.eff.ghost = 0.01;
  step(W, 0.02);
  assert(W.eff.ghost > 0 && W.phase === 'play', 'ghost held while inside a wall');
  ticks(W, 1);
  step(W, 0.2);
  assert(W.phase === 'play' && W.eff.ghost === 0, 'ghost ends once out, alive');
  // 유령이 1초 남짓 남으면 앞길 경고가 다시 나온다 (그 전에는 조용)
  const G = create(COLS, ROWS, 1, { mode: 'endless', rival: false });
  G.wait = 0; G.dir = 'right'; G.queue = [];
  G.snake = [{ x: COLS - 2, y: 5 }, { x: COLS - 3, y: 5 }, { x: COLS - 4, y: 5 }, { x: COLS - 5, y: 5 }];
  G.eff.ghost = 3;
  assert(dangerAhead(G, 3) === null, 'quiet while ghost has time');
  G.eff.ghost = D.GHOST_WARN - 0.1;
  const e = dangerAhead(G, 3);
  assert(e && e.cause === 'edge' && e.ghostEnd, 'warns before ghost ends ' + JSON.stringify(e));
});

test('쉬움: 기다리는 동안 첫 밀기는 어느 쪽이든 된다 (반대쪽이면 뱀을 뒤집어 출발)', () => {
  const W = create(24, 15, 1, { mode: 'endless', diff: 'easy', rival: false });
  const tail = { x: W.snake[W.snake.length - 1].x, y: W.snake[W.snake.length - 1].y };
  assert(W.wait > 0 && W.dir === 'right', 'waiting');
  assert(turn(W, 'left'), 'left accepted');
  assert(W.wait === 0 && W.dir === 'left' && W.snake[0].x === tail.x && W.snake[0].y === tail.y, 'flipped, going left');
  W.item = null; W.itemT = 99; W.food = { x: 0, y: 0, gold: false, born: 0 };
  ticks(W, 1);
  assert(W.phase === 'play' && W.snake[0].x === tail.x - 1, 'moved left');
  // 보통은 그대로 (정반대 무시)
  const N = create(COLS, ROWS, 1, { mode: 'endless', rival: false });
  assert(!turn(N, 'left') && N.dir === 'right', 'normal ignores reverse');
});

test('위험 경고는 포털 너머도 살핀다 (나오는 쪽 바로 앞 벽)', () => {
  const W = create(COLS, ROWS, 5, { mode: 'stage', level: 4 });
  const P = W.portals[0];
  W.wait = 0; W.dir = 'right'; W.queue = [];
  W.snake = [{ x: P.a.x - 1, y: P.a.y }, { x: P.a.x - 2, y: P.a.y }, { x: P.a.x - 3, y: P.a.y }, { x: P.a.x - 4, y: P.a.y }];
  W.walls[P.b.y * COLS + P.b.x + 1] = 1;
  const e = dangerAhead(W, 3);
  assert(e && e.cause === 'wall' && e.x === P.b.x + 1 && e.y === P.b.y && e.dist === 2, 'through portal ' + JSON.stringify(e));
});

test('먹이를 놓을 자리가 없었다가 생기면 다시 놓는다 (먹이가 영영 사라지지 않게)', () => {
  const W = create(COLS, ROWS, 1, { mode: 'endless', rival: false });
  W.wait = 0; W.food = null;
  step(W, 0.01);
  assert(W.food, 'food back');
});

test('단계 이름: 두 번째 바퀴(13~)는 제 이름, 대왕 뱀 단계는 4·8·12·16·20', () => {
  assert(levelDef(13).name !== levelDef(1).name && levelDef(20).name !== levelDef(8).name, 'names ' + levelDef(13).name);
  const names = new Set();
  for (let n = 1; n <= 24; n++) names.add(levelDef(n).name);
  assert(names.size === 24, 'all 24 names differ');
  const boss = [];
  for (let n = 1; n <= 20; n++) if (levelDef(n).boss) boss.push(n);
  assert(boss.join() === '4,8,12,16,20', 'boss levels ' + boss);
  assert(levelDef(4).bossNo === 1 && levelDef(12).bossNo === 3 && levelDef(20).bossNo === 5, 'boss numbers');
});

test('나선(10단계)은 쉬움 작은 판에서도 출발 줄이 막다른 길이 아니다 (봇이 깬다)', () => {
  for (const [c, r] of [[24, 15], [15, 24], [32, 20]]) {
    const W = create(c, r, 1, { mode: 'stage', level: 10, diff: c < 32 ? 'easy' : 'normal' });
    W.wait = 0;
    for (let i = 0; i < 60 * 120 && W.phase === 'play'; i++) { if (!W.queue.length) turn(W, botDir(W)); step(W, 1 / 60); W.events.length = 0; W.fx.length = 0; }
    assert(W.phase === 'clear', c + 'x' + r + ' ' + W.phase + ' ' + W.cause + ' ' + W.got + '/' + W.goal);
  }
});

// ─── 단계 별 ───
test('단계 별: 깨면 하나, par 시간 안이면 둘, 게다가 황금 구슬을 먹었으면 셋', () => {
  const clearWith = (secs, gold) => {
    const W = create(COLS, ROWS, 3, { mode: 'stage', level: 1 });
    W.wait = 0; W.lvT = secs;
    for (let i = 0; i < W.goal; i++) { foodAhead(W, gold && i === 2); ticks(W, 1); if (W.phase !== 'play') break; }
    assert(W.phase === 'clear', 'cleared');
    return W;
  };
  const par = SN.World.parOf(levelDef(1), 'normal');
  assert(par > 10 && par < SN.World.parOf(levelDef(1), 'easy'), 'par normal < easy ' + par);
  assert(clearWith(par + 30, true).lastStars.stars === 1, 'slow = 1');
  assert(clearWith(1, false).lastStars.stars === 2, 'fast = 2');
  const W = clearWith(1, true);
  assert(W.lastStars.stars === 3 && W.stars.length === 1 && W.stars[0].level === 1, '3 stars ' + JSON.stringify(W.lastStars));
  nextLevel(W);
  assert(W.lvT === 0 && W.lvGolds === 0, 'reset per level');
  assert(runStats(W).stars.length === 1, 'stats keep stars');
  assert(SN.World.parOf(levelDef(13), 'easy') > SN.World.parOf(levelDef(1), 'easy'), 'longer goal, longer par');
});

// ─── 대왕 뱀 ───
test('대왕 뱀: 4단계에 나오고 목표는 대왕 뱀 하나, 구슬을 먹어도 목표는 안 찬다', () => {
  const W = create(COLS, ROWS, 2, { mode: 'stage', level: 4 });
  assert(W.boss && W.rival && W.rival.boss && W.goal === 1 && W.got === 0, 'boss level');
  assert(W2.bossLeft(W) === 1, 'full');
  W.wait = 0;
  foodAhead(W); ticks(W, 1);
  assert(W.got === 0 && W.phase === 'play', 'orb does not count');
  assert(runStats(W).rivalMet === false && rivalResult(W) === null, 'not a rival race');
  const S = create(COLS, ROWS, 2, { mode: 'stage', level: 3 });
  assert(!S.boss && S.rival === null, 'no boss on level 3');
});

test('대왕 뱀: 몸을 물면 조각씩 줄고 게이지가 차며, 쉬는 동안 다시 자란다. 다 물면 쓰러지고 단계 성공', () => {
  const W = create(COLS, ROWS, 2, { mode: 'stage', level: 4 });
  W.wait = 0; W.item = null; W.itemT = 99;
  const V = W.rival;
  const body = []; for (let i = 0; i < 12; i++) body.push({ x: 25 - i, y: 3 });
  placeRival(W, body, 'right');
  V.hp = 12;
  // 내 머리를 꼬리에서 3번째 칸 바로 아래에
  W.snake = [{ x: 16, y: 4 }, { x: 16, y: 5 }, { x: 16, y: 6 }, { x: 16, y: 7 }];
  W.prev = W.snake.map(p => ({ x: p.x, y: p.y })); W.dir = 'up'; W.queue = []; W.food = { x: 0, y: 19, gold: false, born: 0 };
  const idx = V.body.findIndex(p => p.x === 16 && p.y === 3);
  ticks(W, 1);
  assert(V.body.length === idx && V.bitten === 12 - idx, 'bit the tail chunk ' + V.body.length + ' bitten ' + V.bitten);
  assert(W.phase === 'play' && W.grow <= D.BOSS.growMax, 'me fine, grow capped');
  const left = W2.bossLeft(W);
  assert(left < 1 && left > 0, 'gauge ' + left);
  // 쉬면 다시 자란다 (게이지는 그대로)
  V.stun = 0;
  const hp = V.hp;
  for (let i = 0; i < 60 * D.BOSS.regrow * 2; i++) { W.snake = [{ x: 1, y: 18 }, { x: 1, y: 19 }, { x: 2, y: 19 }, { x: 3, y: 19 }]; W.dir = 'up'; W.acc = 0; step(W, 1 / 60); }
  assert(V.hp > hp && W2.bossLeft(W) === left, 'regrows, gauge kept ' + V.hp + ' ' + hp);
  // 게이지가 다 차게 물면 쓰러지고 단계 성공
  V.bitten = V.need - 1;
  const b2 = V.body.slice(); const t = b2[b2.length - 1];
  const up = V.dir === 'up' || V.dir === 'down';
  W.snake = up ? [{ x: t.x - 1, y: t.y }, { x: t.x - 2, y: t.y }, { x: t.x - 3, y: t.y }, { x: t.x - 4, y: t.y }] : [{ x: t.x, y: t.y + 1 }, { x: t.x, y: t.y + 2 }, { x: t.x, y: t.y + 3 }, { x: t.x, y: t.y + 4 }];
  W.snake = W.snake.map(p => ({ x: Math.max(0, Math.min(COLS - 1, p.x)), y: Math.max(0, Math.min(ROWS - 1, p.y)) }));
  W.dir = up ? 'right' : 'up'; W.queue = []; W.acc = 0; V.stun = 5;
  W.prev = W.snake.map(p => ({ x: p.x, y: p.y }));
  step(W, 1 / SN.World.speed(W) + 1e-9);
  assert(V.down && W.bossWins === 1 && W.phase === 'clear' && W.events.includes('bossdown'), 'boss down ' + W.phase + ' ' + V.bitten + '/' + V.need);
  assert(runStats(W).bossWins === 1 && hubStats(W).bossWins === 1, 'stats');
  assert(D.MEDALS.find(m => m.id === 'boss1').check(runStats(W), { stage: { stars: {} } }), 'medal');
});

test('대왕 뱀은 나를 끝내지 않는다: 몸에 부딪혀도 물어 먹는 것, 오래 돌려도 대왕 뱀 때문에 끝나는 일 없음', () => {
  for (const diff of ['easy', 'normal', 'hard']) for (let seed = 1; seed <= 4; seed++) {
    const [c, r] = diff === 'easy' ? [24, 15] : [COLS, ROWS];
    const W = create(c, r, seed, { mode: 'stage', level: 4, diff });
    W.wait = 0;
    for (let i = 0; i < 60 * 60 && W.phase === 'play'; i++) {
      // 봇이 먹이만 보게 (대왕 뱀과 자주 부딪힌다)
      if (!W.queue.length) turn(W, ['up', 'left', 'down', 'right'][Math.floor(i / 40) % 4]);
      W.eff.ghost = 0;
      const was = W.snake.length;
      step(W, 1 / 60); W.events.length = 0; W.fx.length = 0;
      if (W.phase === 'over') assert(W.cause === 'wall' || W.cause === 'self', 'ended by ' + W.cause);
    }
  }
});

test('대왕 뱀 균형: 쉬움 아이 흉내 봇이 (한 번 더 한 번으로) 대왕 뱀 단계를 깬다, 대왕 뱀이 같은 벽 모양 단계보다 어렵지 않다', () => {
  const kid = (level, diff, seed) => {
    const [c, r] = diff === 'easy' ? [24, 15] : [COLS, ROWS];
    const W = create(c, r, seed, { mode: 'stage', level, diff });
    W.wait = 0;
    const rr = SN.rng(seed * 13 + 1);
    let lag = 0;
    for (let i = 0; i < 60 * 180 && (W.phase === 'play' || (W.phase === 'over' && W2.revive(W))); i++) {
      if (W.wait > 0) W.wait = 0;
      if ((lag -= 1 / 60) <= 0) {
        lag = 0.12;
        if (rr() < 0.04) turn(W, ['up', 'down', 'left', 'right'][Math.floor(rr() * 4)]);
        else if (!dangerAhead(W, 1) || rr() < 0.85) turn(W, botDir(W));
      }
      step(W, 1 / 60); W.events.length = 0; W.fx.length = 0;
    }
    return W.phase === 'clear' ? W.lvT : null;
  };
  const rate = (lv, diff) => { let ok = 0; const ts = []; for (let s = 1; s <= 10; s++) { const t = kid(lv, diff, s); if (t != null) { ok++; ts.push(t); } } return { ok, t: ts.sort((a, b) => a - b)[ts.length >> 1] }; };
  const b4 = rate(4, 'easy'), b16 = rate(16, 'easy');
  assert(b4.ok >= 9 && b16.ok >= 9, 'easy boss clears ' + JSON.stringify([b4, b16]));
  assert(b4.t <= SN.World.parOf(levelDef(4), 'easy'), 'kid-bot beats par on boss 4 ' + b4.t);
  // 같은 벽 모양: 8단계(상자) · 12단계(네 방)
  const b8 = rate(8, 'easy'), b12 = rate(12, 'easy'), r6 = rate(6, 'easy');
  assert(b8.ok >= 6, 'boss 8 ' + JSON.stringify(b8));
  assert(b12.ok >= Math.min(r6.ok, 6) - 2, 'boss 12 no harder than rooms ' + JSON.stringify([b12, r6]));
});

test('놀이 본부·메달: 대왕 뱀 이김, 별 메달 (별 셋 · 별 부자)', () => {
  const R = { stage: { max: 5, stars: { 1: 3, 2: 1 } }, total: { games: 1, orbs: 0 } };
  assert(D.MEDALS.find(m => m.id === 'star3').check({}, R), 'star3');
  assert(!D.MEDALS.find(m => m.id === 'stars30').check({}, R), 'not yet 30');
  const many = {}; for (let n = 1; n <= 12; n++) many[n] = 3;
  assert(D.MEDALS.find(m => m.id === 'stars30').check({}, { stage: { stars: many } }), 'stars30');
  assert(D.MEDALS.find(m => m.id === 'star3').check({}, { stage: {} }) === false, 'old record without stars ok');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
