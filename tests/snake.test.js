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
const { create, step, turn, speed, spawnFood, botDir } = SN.World;

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
