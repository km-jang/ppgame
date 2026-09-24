'use strict';
// 뚝딱 로봇카 달리기 규칙 테스트. 실행: node tests/robocar.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
for (const f of ['data.js', 'run.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'robocar', 'js', f), 'utf8'), ctx, { filename: f });
}
const RC = vm.runInContext('RC', ctx);
const { createRun, stepRun } = RC.Run;
const D = RC.DATA;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

const DT = 1 / 60;
const NONE = { tap: false, hold: false, transform: false };

function drive(R, bot, maxSec) {
  let f = 0;
  while (!R.done && f++ < 60 * maxSec) {
    stepRun(R, bot(R, f), DT);
    R.events.length = 0;
    const c = R.car;
    if (!Number.isFinite(c.x + c.y + c.vy)) throw new Error('NaN at frame ' + f);
  }
  return f / 60;
}

// 앞에 뭔가 있으면 점프하고, 변신 버튼은 쓸 수 있을 때마다 누르는 봇
function smartBot(R, f) {
  const c = R.car;
  const ahead = R.level.pits.some(p => p.x - c.x > 0 && p.x - c.x < 90)
    || R.level.items.some(o => (o.type === 'rock' || o.type === 'fire' || o.type === 'mud') && o.x - c.x > 0 && o.x - c.x < 90);
  return { tap: ahead, hold: !c.onGround && f % 2 === 0, transform: c.cd <= 0 && f % 30 === 0 };
}

console.log('뚝딱 로봇카 규칙 테스트');

test('아무것도 안 눌러도 결승선까지 간다 (지는 일 없음)', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 1);
  const sec = drive(R, () => NONE, 400);
  assert(R.done, 'finished');
  assert(sec < 180, 'too slow: ' + sec.toFixed(0) + 's');
  assert(R.stars > 0, 'some stars even when idle');
});

test('부품 27가지 조합 모두 끝까지 간다', () => {
  for (const b of D.BODIES) for (const w of D.WHEELS) for (const g of D.GEAR) {
    const R = createRun({ body: b.id, wheel: w.id, gear: g.id }, 3);
    drive(R, smartBot, 400);
    assert(R.done, b.id + '/' + w.id + '/' + g.id + ' did not finish');
  }
});

test('한 판 길이는 약 1분 (보통 조합, 똑똑한 봇)', () => {
  const R = createRun({ body: 'fire', wheel: 'normal', gear: 'wing' }, 5);
  const sec = drive(R, smartBot, 400);
  console.log('       완주 ' + sec.toFixed(0) + '초, 별 ' + R.stars + '/' + R.totalStars);
  assert(sec > 40 && sec < 110, 'length ' + sec);
});

test('잘 하면 별을 더 많이 모은다', () => {
  const a = createRun({ body: 'police', wheel: 'monster', gear: 'jet' }, 9);
  const b = createRun({ body: 'police', wheel: 'monster', gear: 'jet' }, 9);
  drive(a, () => NONE, 400);
  drive(b, smartBot, 400);
  assert(b.stars > a.stars, 'smart ' + b.stars + ' vs idle ' + a.stars);
});

test('변신하면 로봇이 되고, 시간이 지나면 차로 돌아온다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 2);
  stepRun(R, { tap: false, hold: false, transform: true }, DT);
  assert(R.car.form === 'robot', 'robot');
  const v = RC.Run.speedOf(R);
  for (let i = 0; i < 60 * 5; i++) stepRun(R, NONE, DT);
  assert(R.car.form === 'car' && R.car.cd > 0, 'back to car with cooldown');
  assert(v > RC.Run.speedOf(R), 'racer robot is faster');
});

test('로봇은 상자를 부수고 별을 더 받는다, 차는 튕기지만 막히지 않는다', () => {
  const mk = () => {
    const R = createRun({ body: 'fire', wheel: 'normal', gear: 'wing' }, 4);
    R.level.items = [{ type: 'box', x: 400, w: 64, h: 64, n: 1, broken: false }, { type: 'flag', x: 900 }];
    R.level.pits = [];
    return R;
  };
  const car = mk();
  drive(car, () => NONE, 30);
  assert(car.done && car.smashed === 1, 'car still passes box');
  const robo = mk();
  drive(robo, (R) => ({ tap: false, hold: false, transform: R.car.x > 250 && R.car.form === 'car' && R.car.cd <= 0 }), 30);
  assert(robo.stars > car.stars, 'robot gets more stars ' + robo.stars + ' vs ' + car.stars);
});

test('구덩이에 빠지면 건너편으로 튀어나온다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 6);
  R.level.items = [{ type: 'flag', x: 1200 }];
  R.level.pits = [{ x: 400, w: 150 }];
  let popped = false, f = 0;
  while (!R.done && f++ < 60 * 30) { stepRun(R, NONE, DT); if (R.events.includes('pop')) popped = true; R.events.length = 0; }
  assert(popped && R.done, 'popped out and finished');
});

test('소방 로봇 물대포는 앞의 불을 끈다', () => {
  const R = createRun({ body: 'fire', wheel: 'normal', gear: 'jet' }, 8);
  R.level.items = [{ type: 'fire', x: 500, w: 110, out: false }, { type: 'flag', x: 1500 }];
  R.level.pits = [];
  stepRun(R, { tap: false, hold: false, transform: true }, DT);
  assert(R.level.items[0].out, 'fire out');
});

// ─── 공사장 코스 ───
test('공사장: 아무것도 안 눌러도 결승선까지 간다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 1, 'site');
  assert(R.course.id === 'site', 'course');
  const sec = drive(R, () => NONE, 400);
  assert(R.done && sec < 180, 'finished in ' + sec.toFixed(0) + 's');
});

test('공사장: 부품 27가지 조합 모두 끝까지 간다', () => {
  for (const b of D.BODIES) for (const w of D.WHEELS) for (const g of D.GEAR) {
    const R = createRun({ body: b.id, wheel: w.id, gear: g.id }, 3, 'site');
    drive(R, smartBot, 400);
    assert(R.done, b.id + '/' + w.id + '/' + g.id + ' did not finish');
  }
});

test('공사장: 한 판 길이도 약 1분이고 공사장 조각이 나온다', () => {
  const R = createRun({ body: 'fire', wheel: 'normal', gear: 'wing' }, 5, 'site');
  const types = new Set(R.level.items.map(o => o.style || o.type));
  for (const t of ['cone', 'pipe', 'dirt']) assert(types.has(t), 'has ' + t);
  const sec = drive(R, smartBot, 400);
  console.log('       완주 ' + sec.toFixed(0) + '초, 별 ' + R.stars + '/' + R.totalStars);
  assert(sec > 40 && sec < 110, 'length ' + sec);
});

test('고깔은 쓰러뜨리면 별이 나오고 막히지 않는다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 4, 'site');
  R.level.items = [0, 1, 2].map(k => ({ type: 'cone', x: 400 + k * 70, w: 30, down: false })).concat([{ type: 'flag', x: 1100 }]);
  R.level.pits = [];
  drive(R, () => NONE, 30);
  for (let i = 0; i < 90; i++) stepRun(R, NONE, DT);   // 날아오던 별이 다 들어올 때까지
  assert(R.done, 'finished');
  assert(R.level.items.filter(o => o.type === 'cone' && o.down).length === 3, 'all cones down');
  assert(R.stars === 3, 'one star per cone, got ' + R.stars);
});

test('진흙은 차를 느리게 하지만 점프하면 피하고, 소방 로봇은 씻어 낸다', () => {
  const mk = () => {
    const R = createRun({ body: 'fire', wheel: 'normal', gear: 'jet' }, 4, 'site');
    R.level.items = [{ type: 'mud', x: 400, w: 150, out: false, hit: false }, { type: 'flag', x: 1200 }];
    R.level.pits = [];
    return R;
  };
  const slow = mk(), jumpy = mk();
  const a = drive(slow, () => NONE, 30);
  const b = drive(jumpy, R => ({ tap: R.car.onGround && R.car.x > 330 && R.car.x < 380, hold: false, transform: false }), 30);
  assert(slow.done && jumpy.done, 'both finish');
  assert(a > b, 'mud slows: ' + a.toFixed(2) + ' vs ' + b.toFixed(2));
  const wash = mk();
  stepRun(wash, { tap: false, hold: false, transform: true }, DT);
  assert(wash.level.items[0].out, 'mud washed');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
