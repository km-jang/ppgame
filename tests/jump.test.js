'use strict';
// 통통 점프 규칙 테스트. 브라우저 없이 jump/js/world.js를 그대로 돌린다.
// 실행: node tests/jump.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
for (const f of ['util.js', 'data.js', 'world.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'jump', 'js', f), 'utf8'), ctx, { filename: f });
}
const JP = vm.runInContext('JP', ctx);
const D = JP.DATA;
const { create, step, tick, botDir, runStats, wrapDelta, jumpV } = JP.World;
const WW = D.WORLD.w, R = D.PLAYER.r, H = D.STEP;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

// 빈 하늘: 발판·별·아이템·폭탄을 모두 치우고 새로 만들지도 않게 한다
function empty(opts) {
  const W = create(1, Object.assign({ viewH: 600 }, opts));
  W.plats = []; W.stars = []; W.items = []; W.mines = [];
  W.genY = 1e9;
  return W;
}
function plat(W, kind, x, y, w) {
  const p = { id: ++W.ids, kind, x, y, w: w || D.PLAT.w, px: x, vx: 0, broken: false, bt: 0, on: true, t: 0, hit: -9 };
  W.plats.push(p);
  return p;
}
// 주인공을 (x, y)에 두고 속도를 준다
function put(W, x, y, vy) { const P = W.p; P.x = P.px = x; P.y = P.py = y; P.vx = 0; P.vy = vy || 0; }
function ticks(W, n) { for (let i = 0; i < n && W.phase === 'play'; i++) tick(W); }
// 주인공을 화면 가운데 공중에 붙잡아 두고 n칸 돌린다 (발판만 지켜볼 때)
function idle(W, n) { for (let i = 0; i < n && W.phase === 'play'; i++) { put(W, 20, W.cam + W.viewH * 0.3, 0); tick(W); } }
// 발판 바로 위에서 떨어뜨린다
function dropOn(W, p, dx) { put(W, p.x + (dx || 0), p.y + R + 1, -120); ticks(W, 3); }
function clear(W) { W.events.length = 0; W.fx.length = 0; }
// 발판에서 튀어 올라 가장 높이 간 곳
function apexFrom(W, n) {
  let top = -Infinity;
  for (let i = 0; i < n && W.phase === 'play'; i++) { tick(W); top = Math.max(top, W.p.y); }
  return top;
}

console.log('통통 점프 규칙 테스트');

test('처음 상태: 바닥 위에서 시작, 점수 0, 발판이 위로 넉넉히', () => {
  const W = create(1, { viewH: 600 });
  assert(W.phase === 'play' && W.score === 0 && W.height === 0, 'start');
  assert(W.plats[0].kind === 'ground' && W.plats[0].w === WW, 'ground');
  assert(W.plats.length > 10 && W.genY > W.cam + 600, 'generated ahead ' + W.genY);
  assert(W.rescues === 0 && !W.easy, 'normal has no rescues');
  assert(create(1, { easy: true }).rescues === 3, 'easy has 3 rescues');
});

test('발판에 내려앉으면 위로 튄다', () => {
  const W = empty();
  const p = plat(W, 'normal', 200, 100);
  dropOn(W, p);
  assert(W.events.includes('bounce'), 'bounce event');
  assert(W.p.vy > 0 && Math.abs(W.p.vy - jumpV(D.PLAYER.jump)) < 50, 'going up ' + W.p.vy);
  assert(W.bounces === 1 && p.hit >= 0, 'counted');
  const top = apexFrom(W, 120);
  assert(top > p.y + R + D.PLAYER.jump * 0.9, 'jump height ' + (top - p.y - R));
});

test('올라가는 중에는 발판을 그냥 통과한다', () => {
  const W = empty();
  plat(W, 'normal', 200, 100);
  put(W, 200, 100 + R - 30, 600);
  ticks(W, 20);
  assert(W.p.y > 100 + R + 20, 'passed through ' + W.p.y);
  assert(W.bounces === 0 && !W.events.includes('bounce'), 'no bounce');
});

test('발판 옆을 지나 떨어지면 튀지 않는다', () => {
  const W = empty();
  plat(W, 'normal', 100, 100);
  put(W, 300, 100 + R + 5, -100);
  ticks(W, 10);
  assert(W.bounces === 0 && W.p.vy < 0, 'kept falling');
});

test('한쪽 끝으로 나가면 반대쪽에서 들어온다', () => {
  const W = empty();
  put(W, 10, 300, 0);
  W.p.vx = -D.PLAYER.maxVx; W.input.dir = -1;
  ticks(W, 6);
  assert(W.p.x > WW - 30 && W.p.x < WW, 'wrapped to right ' + W.p.x);
  put(W, WW - 5, 300, 0);
  W.p.vx = D.PLAYER.maxVx; W.input.dir = 1;
  ticks(W, 6);
  assert(W.p.x >= 0 && W.p.x < 30, 'wrapped to left ' + W.p.x);
  assert(wrapDelta(390, 10) === 20 && wrapDelta(10, 390) === -20, 'wrap distance');
});

test('발판이 가장자리에 걸쳐도 반대편에서 밟힌다', () => {
  const W = empty();
  const p = plat(W, 'normal', 395, 100);
  dropOn(W, p, 10);
  assert(W.bounces === 1, 'landed across the edge');
});

test('좌우 입력: 누르는 쪽으로 움직이고 떼면 멈춘다', () => {
  const W = empty();
  put(W, 200, 300, 0);
  W.input.dir = 1; ticks(W, 30);
  assert(W.p.x > 250 && W.p.vx === D.PLAYER.maxVx && W.p.face === 1, 'moves right ' + W.p.x);
  W.input.dir = 0; ticks(W, 30);
  assert(W.p.vx === 0, 'stopped');
  W.input.dir = -1; ticks(W, 10);
  assert(W.p.vx < 0 && W.p.face === -1, 'moves left');
});

test('스프링은 훨씬 높이 튄다', () => {
  const A = empty(); dropOn(A, plat(A, 'normal', 200, 100));
  const B = empty(); dropOn(B, plat(B, 'spring', 200, 100));
  const a = apexFrom(A, 60), b = apexFrom(B, 120);
  assert(B.events.includes('spring') && B.springs === 1, 'spring event');
  assert(b - 100 > (a - 100) * 2.2, 'spring higher ' + (a - 100) + ' vs ' + (b - 100));
});

test('부서지는 발판은 한 번 튀면 부서진다', () => {
  const W = empty();
  const p = plat(W, 'crumble', 200, 100);
  dropOn(W, p);
  assert(W.bounces === 1 && p.broken && W.events.includes('crumble'), 'broke');
  // 다시 위에서 떨어뜨려도 밟히지 않는다
  dropOn(W, p);
  assert(W.bounces === 1 && W.p.vy < 0, 'no second bounce');
});

test('움직이는 발판은 옆으로 가다가 끝에서 돌아온다', () => {
  const W = empty();
  const p = plat(W, 'moving', 200, 100);
  p.vx = 100;
  idle(W, 120);
  assert(Math.abs(p.x - 300) < 1, 'moved ' + p.x);
  idle(W, 120);
  assert(p.vx < 0 && p.x <= WW - p.w / 2, 'turned back ' + p.x);
});

test('구름 발판은 잠깐 사라졌다가 다시 나온다 (사라진 동안은 빠진다)', () => {
  const W = empty();
  const p = plat(W, 'cloud', 200, 100);
  p.t = 0;
  idle(W, Math.round(D.CLOUD.on / H) + 2);
  assert(!p.on, 'gone after on time');
  dropOn(W, p);
  assert(W.bounces === 0, 'fell through');
  idle(W, Math.round(D.CLOUD.off / H));
  assert(p.on, 'back again');
  assert(JP.World.cloudAlpha(p) >= 0 && JP.World.cloudAlpha(p) <= 1, 'alpha 0..1');
});

test('카메라는 올라가기만 하고 내려오지 않는다', () => {
  const W = empty();
  put(W, 200, 900, 0);
  ticks(W, 1);
  const c1 = W.cam;
  assert(c1 > 500, 'followed up ' + c1);
  let low = Infinity;
  for (let i = 0; i < 40; i++) { tick(W); low = Math.min(low, W.cam); }
  assert(low >= c1, 'never down');
});

test('점수 = 가장 높이 올라간 m (별이 없으면)', () => {
  const W = empty();
  put(W, 200, 20 * D.METER + 3, 0);
  ticks(W, 1);
  assert(W.height === 20 && W.score === 20, 'score ' + W.score);
  put(W, 200, 5 * D.METER, 0);
  ticks(W, 1);
  assert(W.height === 20, 'height keeps the best');
});

test('별을 먹으면 점수가 오른다', () => {
  const W = empty();
  put(W, 200, 300, 0);
  W.stars.push({ id: 99, x: 205, y: 300, got: false });
  ticks(W, 1);
  assert(W.starsGot === 1 && W.events.includes('star'), 'star');
  assert(W.score === W.height + D.STAR.points, 'score ' + W.score);
});

test('보통: 화면 아래로 떨어지면 끝', () => {
  const W = empty();
  put(W, 200, W.cam + 10, -400);
  ticks(W, 60);
  assert(W.phase === 'over' && W.cause === 'fall' && W.events.includes('over'), 'fell');
});

test('쉬움: 구조 구름이 3번 받아 주고 그다음엔 끝', () => {
  const W = empty({ easy: true });
  for (let k = 0; k < 3; k++) {
    put(W, 200, W.cam + 10, -400);
    clear(W);
    ticks(W, 30);
    assert(W.phase === 'play' && W.events.includes('rescue'), 'rescued ' + k);
    assert(W.p.vy > 0 && W.rescues === 2 - k && W.rescued === k + 1, 'thrown up ' + k);
    assert(W.p.y >= W.cam, 'back on screen');
  }
  put(W, 200, W.cam + 10, -400);
  ticks(W, 30);
  assert(W.phase === 'over' && W.cause === 'fall' && W.rescues === 0, 'over after 3 rescues');
});

test('보통: 가시 폭탄에 닿으면 끝, 쉬움에는 가시 폭탄이 없다', () => {
  const W = empty();
  put(W, 200, 300, 0);
  W.mines.push({ id: 1, x: 200, y: 310, gone: false, seen: -1 });
  ticks(W, 1);
  assert(W.phase === 'over' && W.cause === 'mine', 'mine kills');
  const E = create(3, { easy: true, viewH: 600 });
  for (let i = 0; i < 60 * 60 && E.phase === 'play'; i++) { E.input.dir = botDir(E); step(E, 1 / 60); clear(E); assert(E.mines.length === 0, 'no mines in easy'); }
  const N = create(3, { viewH: 600 });
  N.cam = 400 * D.METER; for (let i = 0; i < 40; i++) JP.World.tick(N);
  assert(N.phase === 'over' || N.mines.length > 0 || N.genY > 0, 'normal generates');
});

test('방패 방울은 한 번 지켜 준다 (가시 폭탄·떨어짐)', () => {
  const W = empty();
  put(W, 200, 300, 0);
  W.items.push({ id: 5, kind: 'shield', x: 200, y: 300, got: false, seen: -1 });
  ticks(W, 1);
  assert(W.shield && W.events.includes('shield'), 'got shield');
  W.mines.push({ id: 6, x: W.p.x, y: W.p.y + 5, gone: false, seen: -1 });
  ticks(W, 1);
  assert(W.phase === 'play' && !W.shield && W.saves === 1 && W.events.includes('save'), 'saved once');
  W.mines.push({ id: 7, x: W.p.x, y: W.p.y + 5, gone: false, seen: -1 });
  ticks(W, 1);
  assert(W.phase === 'over' && W.cause === 'mine', 'second time over');
  // 떨어짐도 한 번 막는다 (보통 모드)
  const F = empty();
  F.shield = true;
  put(F, 200, F.cam + 10, -400);
  ticks(F, 30);
  assert(F.phase === 'play' && F.saves === 1 && F.p.vy > 0, 'fall saved');
});

test('로켓은 몇 초 동안 쭉 날아오르고 발판·폭탄을 무시한다', () => {
  const W = empty();
  put(W, 200, 300, 0);
  W.items.push({ id: 5, kind: 'rocket', x: 200, y: 300, got: false, seen: -1 });
  W.mines.push({ id: 6, x: 200, y: 500, gone: false, seen: -1 });
  ticks(W, 1);
  assert(W.rocket > 0 && W.rockets === 1 && W.events.includes('rocket'), 'rocket on');
  ticks(W, Math.round(D.ROCKET.time / H) - 2);
  assert(W.phase === 'play', 'mine ignored');
  assert(W.p.y > 300 + D.ROCKET.speed * D.ROCKET.time * 0.9, 'lifted ' + W.p.y);
  ticks(W, 4);
  assert(W.rocket === 0 && W.p.vy > 0 && W.p.vy <= D.ROCKET.after, 'ends with upward speed');
});

test('콤보: 이어서 더 높은 발판을 밟으면 오르고, 같거나 낮으면 끊긴다', () => {
  const W = empty();
  W.lastLand = 0;
  const ps = [1, 2, 3].map(k => plat(W, 'normal', 200, k * 100));
  for (const p of ps) dropOn(W, p);
  assert(W.combo === 3 && W.maxCombo === 3, 'combo ' + W.combo);
  dropOn(W, ps[1]);
  assert(W.combo === 0 && W.maxCombo === 3, 'reset');
});

test('주사율이 달라도 같은 결과 (1/120초 고정 칸)', () => {
  const run = fps => {
    const W = create(42, { viewH: 533 });
    W.input.dir = 1;
    const n = Math.round(3 * fps);
    for (let i = 0; i < n; i++) { if (i === Math.round(fps)) W.input.dir = -1; step(W, 1 / fps); }
    return W;
  };
  const a = run(60), b = run(120), c = run(90);
  assert(a.ticks === 360 && b.ticks === 360 && c.ticks === 360, 'ticks ' + a.ticks + ' ' + b.ticks + ' ' + c.ticks);
  assert(Math.abs(a.p.x - b.p.x) < 1e-6 && Math.abs(a.p.y - b.p.y) < 1e-6, 'same place 60/120');
  assert(Math.abs(a.p.x - c.p.x) < 1e-6 && Math.abs(a.p.y - c.p.y) < 1e-6, 'same place 60/90');
  assert(a.bounces === b.bounces && a.bounces === c.bounces, 'same bounces');
});

test('같은 시드면 같은 판 (결정적)', () => {
  const a = create(7, { viewH: 600 }), b = create(7, { viewH: 600 });
  assert(JSON.stringify(a.plats.map(p => [p.kind, p.x, p.y])) === JSON.stringify(b.plats.map(p => [p.kind, p.x, p.y])), 'same plats');
});

test('발판 간격은 늘 한 번 튀는 높이 안 (어느 높이에서도 올라갈 수 있다)', () => {
  for (const easy of [false, true]) for (let seed = 1; seed <= 5; seed++) {
    const W = create(seed, { easy, viewH: 600 });
    const rows = new Set();
    // 로켓으로 아주 높은 곳까지 날아가며 만들어진 줄 높이를 모두 모은다
    for (let i = 0; i < 400; i++) {
      W.rocket = 10; W.cam += 150; W.p.y = W.cam + 300; tick(W);
      for (const r of W.recent) rows.add(r.y);
    }
    assert(W.phase === 'play', 'alive while generating');
    const ys = [...rows].sort((x, y) => x - y);
    let maxGap = 0;
    for (let i = 1; i < ys.length; i++) maxGap = Math.max(maxGap, ys[i] - ys[i - 1]);
    assert(maxGap < D.PLAYER.jump * 0.9, 'gap ' + maxGap);
    assert(W.genY > 60000 && ys.length > 300, 'generated high ' + W.genY);
  }
});

test('가시 폭탄은 발판에서 튀어 오르는 길 위에 놓이지 않는다', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const W = create(seed, { viewH: 600 });
    const seenPlats = [];
    for (let i = 0; i < 300; i++) {
      W.rocket = 10; W.cam += 120; W.p.y = W.cam + 300; tick(W);
      for (const p of W.plats) if (!seenPlats.includes(p)) seenPlats.push(p);
      for (const m of W.mines) for (const p of seenPlats) {
        if (m.y > p.y && m.y < p.y + D.PLAYER.jump + R && p.kind !== 'moving' && p.kind !== 'ground') {
          assert(Math.abs(wrapDelta(m.x, p.x)) >= D.MINE.clear - 1, 'mine above plat ' + JSON.stringify([m.x, m.y, p.x, p.y]));
        }
      }
    }
    assert(W.phase === 'play' && seenPlats.length > 200, 'generated ' + seenPlats.length);
  }
});

test('자동 운전 봇: 쉬움에서 1분 넘게 살아 높이 오른다', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const W = create(seed, { easy: true, viewH: 533 });
    for (let i = 0; i < 60 * 70 && W.phase === 'play'; i++) { W.input.dir = botDir(W); step(W, 1 / 60); clear(W); }
    assert(W.phase === 'play', 'alive seed ' + seed);
    assert(W.height > 200, 'height ' + W.height + ' seed ' + seed);
    assert(W.rescued <= 2, 'few rescues ' + W.rescued);
  }
});

test('자동 운전 봇: 보통에서도 한참 오르고 값이 망가지지 않는다', () => {
  let total = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const W = create(seed, { viewH: 600 });
    const r = JP.rng(seed);
    for (let i = 0; i < 60 * 40 && W.phase === 'play'; i++) {
      W.input.dir = r() < 0.03 ? Math.floor(r() * 3) - 1 : botDir(W);
      step(W, r() * 0.04);
      clear(W);
      assert(Number.isFinite(W.p.x + W.p.y + W.p.vx + W.p.vy + W.cam + W.score + W.alpha), 'finite');
      assert(W.p.x >= 0 && W.p.x < WW, 'x in column ' + W.p.x);
      assert(W.plats.length < 80 && W.stars.length < 80, 'lists stay small');
    }
    total += W.height;
  }
  assert(total / 6 > 100, 'average height ' + total / 6);
});

test('메달 확인 함수: 이번 판 기록과 평생 기록으로 판정', () => {
  const run = { easy: false, height: 160, score: 400, stars: 25, springs: 5, rockets: 1, saves: 0, maxCombo: 4 };
  const rec = { total: { games: 3, stars: 120 } };
  const got = D.MEDALS.filter(m => m.check(run, rec)).map(m => m.id).sort();
  assert(JSON.stringify(got) === JSON.stringify(['h150', 'h50', 'n100', 'rocket', 'spring5', 'star20'].sort()), 'medals ' + got.join(','));
  const easyRun = Object.assign({}, run, { easy: true });
  assert(!D.MEDALS.find(m => m.id === 'n100').check(easyRun, rec), 'n100 needs normal');
  assert(D.MEDALS.find(m => m.id === 'games10').check(run, { total: { games: 10, stars: 0 } }), 'games10');
  assert(new Set(D.MEDALS.map(m => m.id)).size === D.MEDALS.length && D.MEDALS.length >= 10, 'unique ids');
  const W = create(1, { easy: true });
  const s = runStats(W);
  for (const k of ['easy', 'height', 'score', 'stars', 'springs', 'rockets', 'saves', 'maxCombo']) assert(k in s, 'runStats has ' + k);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
