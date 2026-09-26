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

// ─── 손맛 (매끄러움) ───
function flat(cfg) {
  const R = createRun(cfg || { body: 'racer', wheel: 'normal', gear: 'drill' }, 1);
  R.level.items = [{ type: 'flag', x: 99999 }]; R.level.pits = [];
  return R;
}
function jumpHeight(dt) {
  const R = flat();
  stepRun(R, { tap: true }, dt);
  let top = R.car.y, n = 0;
  while (!R.car.onGround && n++ < 2000) { stepRun(R, NONE, dt); top = Math.min(top, R.car.y); }
  return D.RUN.groundY - top;
}

test('점프 높이는 화면이 30·60·90·120Hz여도 같다', () => {
  const hs = [1 / 30, 1 / 60, 1 / 90, 1 / 120].map(jumpHeight);
  assert(Math.max(...hs) - Math.min(...hs) < 1, 'heights ' + hs.map(h => h.toFixed(1)).join(' '));
  // 소유자 피드백(너무 높고 둥실)으로 낮춘 높이 범위
  assert(hs[1] > 100 && hs[1] < 130, 'jump height ' + hs[1].toFixed(1));
});

test('보통 점프 한 번으로 가장 넓은 구덩이를 넘는다', () => {
  // 구덩이 폭 110~155, 빠지는 구간은 양쪽 25씩 뺀 폭 (차가 길어서). 가장자리 바로 앞에서 뛰면 넘어야 한다
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'drill' }, 6);
  R.level.items = [{ type: 'flag', x: 1400 }];
  R.level.pits = [{ x: 500, w: 155 }];
  let jumped = false, fell = false, f = 0;
  while (!R.done && f++ < 60 * 20) {
    const tap = !jumped && R.car.x > 500 + 25 - 20;
    if (tap) jumped = true;
    stepRun(R, { tap }, DT);
    if (R.events.includes('fall')) fell = true;
    R.events.length = 0;
  }
  assert(R.done && !fell, 'cleared the widest pit');
});

test('땅에 닿기 직전에 누른 점프도 닿자마자 뛴다 (점프 기억)', () => {
  const R = flat();
  stepRun(R, { tap: true }, DT);
  while (R.car.vy < 0 || R.car.y < D.RUN.groundY - 25) stepRun(R, NONE, DT);   // 내려오는 중, 땅 바로 위
  stepRun(R, { tap: true }, DT);
  let jumped = false;
  for (let i = 0; i < 20; i++) { stepRun(R, NONE, DT); if (R.events.includes('jump')) jumped = true; }
  assert(jumped, 'buffered jump fired on landing');
});

test('구덩이에 막 빠지기 시작했을 때 눌러도 뛴다 (코요테 타임)', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'drill' }, 6);
  R.level.items = [{ type: 'flag', x: 1400 }];
  R.level.pits = [{ x: 400, w: 150 }];
  while (!R.car.fall) stepRun(R, NONE, DT);
  R.events.length = 0;
  stepRun(R, { tap: true }, DT);
  let popped = false, f = 0;
  while (!R.done && f++ < 60 * 20) { stepRun(R, NONE, DT); if (R.events.includes('pop')) popped = true; R.events.length = 0; }
  assert(!popped && R.done, 'jumped out from the edge instead of falling');
});

test('한 판 내내 순간 이동이 없다 (앞뒤로 튀지 않음)', () => {
  for (const course of ['city', 'site', 'neon']) {
    const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 3, course);
    let px = R.car.x, py = R.car.y, f = 0, worst = 0, worstY = 0;
    while (!R.done && f++ < 60 * 200) {
      stepRun(R, NONE, DT); R.events.length = 0;
      worst = Math.max(worst, Math.abs(R.car.x - px)); worstY = Math.max(worstY, Math.abs(R.car.y - py));
      px = R.car.x; py = R.car.y;
    }
    assert(worst < 20, course + ' x step ' + worst.toFixed(1));
    assert(worstY < 40, course + ' y step ' + worstY.toFixed(1));
  }
});

test('방호벽은 차가 부딪히지 않고 저절로 폴짝 넘는다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 2);
  R.level.items = [{ type: 'rock', x: 600, w: 90, h: 70, broken: false }, { type: 'flag', x: 1300 }];
  R.level.pits = [];
  const seen = [];
  let f = 0;
  while (!R.done && f++ < 60 * 20) { stepRun(R, NONE, DT); seen.push(...R.events); R.events.length = 0; }
  assert(R.done && seen.includes('hop') && !seen.includes('bump'), seen.join(','));
});

// ─── 참고 게임에서 가져온 것 ───
function events(R, bot, sec) {
  const seen = {}; let f = 0;
  while (!R.done && f++ < 60 * sec) { stepRun(R, bot(R, f), DT); for (const e of R.events) seen[e] = (seen[e] || 0) + 1; R.events.length = 0; }
  for (let i = 0; i < 90; i++) stepRun(R, NONE, DT);
  return seen;
}

test('두 코스 모두 친구 두 명을 그냥 지나가기만 해도 구한다 (로보카폴리식 구조)', () => {
  for (const course of ['city', 'site']) {
    const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 5, course);
    assert(R.level.items.filter(o => o.type === 'friend').length === 2, course + ' has 2 friends');
    const seen = events(R, () => NONE, 400);
    assert(R.saved === 2 && seen.rescue === 2 && R.riders.length === 2, course + ' saved ' + R.saved);
    assert(seen.check === 1, course + ' halfway gate once');
  }
});

test('풍선은 닿으면 펑 하고 별이 나온다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 4);
  R.level.items = [{ type: 'balloon', x: 500, y: D.RUN.groundY - 150, color: '#ff4d6d', popped: false }, { type: 'flag', x: 1100 }];
  R.level.pits = [];
  const seen = events(R, (R) => ({ tap: R.car.x > 420 && R.car.x < 430, hold: false }), 30);
  assert(seen.balloon === 1 && R.stars >= 2, 'popped, stars ' + R.stars);
});

test('오래 날면 공중 보너스 별, 보통 점프는 보너스 없음', () => {
  const plain = flat();
  stepRun(plain, { tap: true }, DT);
  const a = events(plain, () => NONE, 3);
  assert(!a.airbonus, 'no bonus for a normal jump');
  const jet = flat({ body: 'racer', wheel: 'normal', gear: 'jet' });
  stepRun(jet, { tap: true }, DT);
  const b = events(jet, () => ({ tap: false, hold: true }), 4);
  assert(b.airbonus === 1 && jet.airBonus >= 2, 'jet flight bonus ' + jet.airBonus);
});

// ─── 네온 시티 ───
test('네온 시티: 아무것도 안 눌러도, 모든 부품 조합으로도 끝까지 간다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 4, 'neon');
  const sec = drive(R, () => NONE, 400);
  assert(R.done && sec < 180, 'idle finish ' + sec);
  for (const b of D.BODIES) for (const w of D.WHEELS) for (const g of D.GEAR) {
    const Q = createRun({ body: b.id, wheel: w.id, gear: g.id }, 6, 'neon');
    drive(Q, smartBot, 400);
    assert(Q.done, b.id + '/' + w.id + '/' + g.id + ' did not finish neon');
  }
});

test('네온 시티: 가속 발판과 불빛 터널이 나오고, 발판을 밟으면 빨라진다', () => {
  const R = createRun({ body: 'police', wheel: 'normal', gear: 'wing' }, 8, 'neon');
  const types = new Set(R.level.items.map(o => o.type));
  assert(types.has('boost') && types.has('tunnel'), 'neon pieces: ' + [...types].join(','));
  const pad = R.level.items.find(o => o.type === 'boost');
  let f = 0, fast = 0;
  const events = [];
  while (!pad.used && f++ < 60 * 60) { stepRun(R, NONE, DT); events.push(...R.events); R.events.length = 0; }
  for (let i = 0; i < 30; i++) { stepRun(R, NONE, DT); fast = Math.max(fast, RC.Run.speedOf(R)); R.events.length = 0; }
  assert(pad.used && events.includes('boost'), 'boost pad used');
  assert(fast > D.RUN.speed * 1.3, 'faster on boost: ' + fast.toFixed(0));
});

// ─── 슈퍼 변신 ───
test('슈퍼 변신: 별로 게이지가 차고, 가득 차면 변신 버튼이 슈퍼 변신이 된다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 1);
  let f = 0; const events = [];
  while (R.superG < D.RUN.superNeed && f++ < 60 * 60) { stepRun(R, NONE, DT); events.push(...R.events); R.events.length = 0; }
  assert(R.superG === D.RUN.superNeed && events.includes('superReady'), 'gauge full after ' + (f / 60).toFixed(1) + 's');
  assert(f / 60 < 25, 'fills within about 20 seconds of play: ' + (f / 60).toFixed(1));
  stepRun(R, { tap: false, hold: false, transform: true }, DT);
  assert(R.car.super > 0 && R.car.form === 'robot' && R.superG === 0 && R.supers === 1, 'super on');
  assert(R.events.includes('super'), 'super event');
});

test('슈퍼 변신: 앞의 장애물이 별로 바뀌고, 날아서 구덩이에 안 빠지고, 끝나면 차로 돌아온다', () => {
  const R = createRun({ body: 'police', wheel: 'normal', gear: 'wing' }, 3);
  const c = R.car;
  const pit = R.level.pits[1];
  c.x = pit.x - 500;
  const ahead = R.level.items.filter(o => (o.type === 'box' || o.type === 'rock' || o.type === 'fire') && o.x > c.x && o.x < c.x + D.RUN.superRange);
  R.superG = D.RUN.superNeed;
  const stars0 = R.totalStars;
  stepRun(R, { transform: true }, DT);
  assert(ahead.every(o => o.broken || o.out), 'obstacles turned into stars');
  assert(R.totalStars > stars0 || !ahead.length, 'stars spilled');
  let fell = false, maxY = 0, f = 0;
  while (c.super > 0 && f++ < 60 * 10) { stepRun(R, NONE, DT); if (c.fall) fell = true; if (f > 40) maxY = Math.max(maxY, c.y); R.events.length = 0; }
  assert(!fell, 'did not fall while flying');
  assert(maxY < D.RUN.groundY - 100, 'flying high: ' + maxY.toFixed(0));
  for (let i = 0; i < 60 * 3; i++) { stepRun(R, NONE, DT); R.events.length = 0; }
  assert(c.form === 'car' && !(c.super > 0), 'back to car');
});

test('슈퍼 변신: 게이지가 안 찼으면 보통 변신, 슈퍼 중에는 게이지가 안 찬다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 2);
  R.superG = 5;
  stepRun(R, { transform: true }, DT);
  assert(R.car.form === 'robot' && !(R.car.super > 0) && R.superG === 5, 'normal transform keeps gauge');
  const Q = createRun({ body: 'racer', wheel: 'normal', gear: 'jet' }, 2);
  Q.superG = D.RUN.superNeed;
  stepRun(Q, { transform: true }, DT);
  for (let i = 0; i < 60 * 3; i++) { stepRun(Q, NONE, DT); Q.events.length = 0; }
  assert(Q.stars > 0 && Q.superG === 0, 'no gain during super: ' + Q.superG);
});

// ─── 물대포 장비 ───
test('물대포: 앞에 불이 보이면 저절로 쏴서 끄고 별이 나온다', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'hose' }, 3);
  const fire = R.level.items.find(o => o.type === 'fire');
  assert(fire, 'course has fire');
  R.car.x = fire.x - 700;
  let f = 0; const ev = [];
  while (!fire.out && R.car.x < fire.x && f++ < 60 * 10) { stepRun(R, NONE, DT); ev.push(...R.events); R.events.length = 0; }
  assert(fire.out, 'fire put out before reaching it');
  assert(ev.includes('spray') && ev.includes('douse'), 'spray + douse events');
});

test('물대포: 아무것도 없으면 안 쏘고, 친구를 구할수록 물줄기가 늘어난다 (최대 3)', () => {
  const R = createRun({ body: 'racer', wheel: 'normal', gear: 'hose' }, 3);
  R.level.items = R.level.items.filter(o => o.type === 'star' || o.type === 'flag');
  for (let i = 0; i < 120; i++) { stepRun(R, NONE, DT); R.events.length = 0; }
  assert(R.shots.length === 0, 'no targets, no shots');
  R.level.items.push({ type: 'fire', x: R.car.x + 500, w: 110, out: false });
  R.level.items.sort((a, b) => a.x - b.x);
  R.saved = 5;
  let n = 0;
  for (let i = 0; i < 60; i++) { stepRun(R, NONE, DT); n = Math.max(n, R.shots.length); R.events.length = 0; }
  assert(R.streams === D.RUN.shotMax && n >= 3, 'three streams: ' + R.streams + ' shots ' + n);
});

// ─── 선물 상자 ───
test('선물 상자: 아직 없는 선물 3개가 나오고, 다 모으면 별 보너스로 채운다', () => {
  const rnd = RC.rng(3);
  const a = RC.giftChoices([], rnd);
  assert(a.length === 3 && new Set(a.map(g => g.id)).size === 3 && a.every(g => g.kind !== 'bonus'), 'three different gifts');
  const owned = D.GIFTS.slice(0, D.GIFTS.length - 1).map(g => g.id);
  const b = RC.giftChoices(owned, rnd);
  assert(b[0].id === D.GIFTS[D.GIFTS.length - 1].id && b[1].kind === 'bonus' && b[2].kind === 'bonus', 'last gift + bonus');
  for (let i = 0; i < 50; i++) assert(RC.giftChoices(owned.slice(0, 5), rnd).every(g => !owned.slice(0, 5).includes(g.id)), 'never an owned gift');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
