'use strict';
// 통통 점프 규칙 테스트. 브라우저 없이 jump/js/world.js를 그대로 돌린다.
// 실행: node tests/jump.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
for (const f of ['util.js', 'data.js', 'world.js', 'records.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'jump', 'js', f), 'utf8'), ctx, { filename: f });
}
const JP = vm.runInContext('JP', ctx);
const D = JP.DATA;
const { create, step, tick, botDir, runStats, wrapDelta, jumpV, zoneAt, comboMul } = JP.World;
const RC = JP.Records;
const LEVELS = D.DIFF_ORDER;
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
  const p = { id: ++W.ids, kind, x, y, w: w || 84, px: x, vx: 0, broken: false, bt: 0, on: true, t: 0, hit: -9 };
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
// 가짜 저장소 (localStorage 대신)
function memStore(init) {
  const m = Object.assign({}, init || {});
  return { m, get: (k, f) => (k in m ? JSON.parse(JSON.stringify(m[k])) : f), set: (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } };
}

// ─── 사람 닮은 봇 ────────────────────────────────────────────
// 자동 운전 봇(botDir)이 고른 발판을 따라가되 사람처럼: 새 목표가 생기면 반응 시간(약 0.25초) 뒤에 움직이고,
// 겨냥이 조금 빗나가고(aim 점), 가끔(late 확률) 더 늦게 누른다. kid는 5~7살 아이 흉내 (더 느리고 더 빗나감)
const HUMAN = { delay: 0.25, aim: 22, late: 0.15, lateMax: 0.3 };
const KID = { delay: 0.35, aim: 34, late: 0.3, lateMax: 0.4 };
function makeHuman(seed, cfg) {
  cfg = cfg || HUMAN;
  const rand = JP.rng(seed * 7919 + 13);
  let target = null, wait = 0, aimOff = 0, prev = 0;
  return function (W, dt) {
    const P = W.p, C = W.ctl;
    botDir(W);
    const t = W.botT;
    if (t !== target) {
      target = t;
      aimOff = (rand() * 2 - 1) * cfg.aim;
      wait = cfg.delay * (0.7 + rand() * 0.6) + (rand() < cfg.late ? rand() * cfg.lateMax : 0);
    }
    if (wait > 0) { wait -= dt; return prev; }
    if (!t || W.rocket > 0) { prev = 0; return 0; }
    const g = D.PLAYER.gravity, q = P.vy * P.vy + 2 * g * (P.y - t.y - R);
    const tt = q < 0 ? 0 : (P.vy + Math.sqrt(q)) / g;
    const dx = wrapDelta(P.x, t.x + t.vx * tt + aimOff);
    const brake = P.vx * P.vx / (2 * C.decel);
    prev = Math.abs(dx) < Math.max(6, t.w * 0.2) + (Math.sign(dx) === Math.sign(P.vx) ? brake * 0.5 : 0) ? 0 : dx > 0 ? 1 : -1;
    return prev;
  };
}
// 여러 판을 돌려 처음 떨어질 때(구조 구름이 받거나 끝날 때)까지의 높이·시간과 끝 높이를 잰다
function measure(diff, cfg, seeds, maxSec) {
  const out = { first: [], time: [], final: [], reach100: 0, over60: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const W = create(seed, { diff, viewH: 600 });
    const bot = makeHuman(seed, cfg);
    let fh = null, ft = null;
    for (let i = 0; i < 60 * maxSec && W.phase === 'play'; i++) {
      W.input.dir = bot(W, 1 / 60);
      const r0 = W.rescued;
      step(W, 1 / 60);
      clear(W);
      if (fh == null && (W.rescued > r0 || W.phase !== 'play')) { fh = W.height; ft = W.t; }
    }
    if (fh == null) { fh = W.height; ft = W.t; }
    out.first.push(fh); out.time.push(ft); out.final.push(W.height);
    if (W.height >= 100) out.reach100++;
    if (W.phase !== 'play' && W.t < 60) out.over60++;
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  out.avgFirst = avg(out.first); out.avgTime = avg(out.time); out.avgFinal = avg(out.final);
  out.line = diff + ' 처음 떨어질 때까지 평균 ' + out.avgFirst.toFixed(0) + 'm·' + out.avgTime.toFixed(0) + '초, 끝 높이 평균 ' + out.avgFinal.toFixed(0) +
    'm, 100m 넘은 판 ' + out.reach100 + '/' + seeds + ', 1분 안에 끝난 판 ' + out.over60 + '/' + seeds;
  return out;
}

console.log('통통 점프 규칙 테스트');

test('처음 상태: 바닥 위에서 시작, 점수 0, 발판이 위로 넉넉히', () => {
  const W = create(1, { viewH: 600 });
  assert(W.phase === 'play' && W.score === 0 && W.height === 0, 'start');
  assert(W.plats[0].kind === 'ground' && W.plats[0].w === WW, 'ground');
  assert(W.plats.length > 10 && W.genY > W.cam + 600, 'generated ahead ' + W.genY);
  assert(W.rescues === 0 && !W.easy && W.diff === 'normal', 'normal has no rescues');
  assert(create(1, { easy: true }).rescues === 3, 'easy has 3 rescues');
  const E = create(1, { diff: 'easy' }), X = create(1, { diff: 'hard' });
  assert(E.easy && E.diff === 'easy' && E.rescues === 3, 'diff easy');
  assert(!X.easy && X.diff === 'hard' && X.rescues === 0, 'diff hard');
  assert(create(1, { diff: 'hard', easy: true }).diff === 'hard', 'diff wins over easy');
  assert(create(1, { diff: 'nope' }).diff === 'normal', 'unknown diff falls back');
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

test('카메라는 부드럽게 따라 올라가기만 하고 내려오지 않는다', () => {
  const W = empty();
  put(W, 200, 900, 0);
  ticks(W, 1);
  // 한 칸 만에 다 따라가지는 않지만, 주인공이 화면 위쪽(focus + lead)을 넘지는 않는다
  assert(W.cam >= 900 - W.viewH * (D.CAM.focus + D.CAM.lead) - 1, 'lead limit ' + W.cam);
  assert(W.cam < 900 - W.viewH * D.CAM.focus - 5, 'eased, not snapped ' + W.cam);
  for (let i = 0; i < 60; i++) { put(W, 200, 900, 0); tick(W); }
  const c1 = W.cam;
  assert(Math.abs(c1 - (900 - W.viewH * D.CAM.focus)) < 2, 'caught up ' + c1);
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

test('주사율이 달라도 같은 결과 (1/120초 고정 칸, 세 난이도)', () => {
  for (const diff of LEVELS) {
    const run = fps => {
      const W = create(42, { diff, viewH: 533 });
      W.input.dir = 1;
      const n = Math.round(3 * fps);
      for (let i = 0; i < n; i++) { if (i === Math.round(fps)) W.input.dir = -1; step(W, 1 / fps); }
      return W;
    };
    const a = run(60), b = run(120), c = run(90);
    assert(a.cam === b.cam && a.cam === c.cam, 'same camera');
    assert(a.ticks === 360 && b.ticks === 360 && c.ticks === 360, 'ticks ' + a.ticks + ' ' + b.ticks + ' ' + c.ticks);
    assert(Math.abs(a.p.x - b.p.x) < 1e-6 && Math.abs(a.p.y - b.p.y) < 1e-6, 'same place 60/120');
    assert(Math.abs(a.p.x - c.p.x) < 1e-6 && Math.abs(a.p.y - c.p.y) < 1e-6, 'same place 60/90');
    assert(a.bounces === b.bounces && a.bounces === c.bounces, 'same bounces');
  }
});

test('같은 시드면 같은 판 (결정적)', () => {
  const a = create(7, { viewH: 600 }), b = create(7, { viewH: 600 });
  assert(JSON.stringify(a.plats.map(p => [p.kind, p.x, p.y])) === JSON.stringify(b.plats.map(p => [p.kind, p.x, p.y])), 'same plats');
});

// 로켓으로 아주 높은 곳까지 날아가며 만들어진 길(줄)을 모두 모은다
function rowsOf(diff, seed, n) {
  const W = create(seed, { diff, viewH: 600 });
  const rows = new Map();
  for (let i = 0; i < (n || 400); i++) {
    W.rocket = 10; W.cam += 150; W.p.y = W.cam + 300; tick(W);
    for (const r of W.recent) rows.set(r.y, r);
  }
  assert(W.phase === 'play', 'alive while generating');
  return { W, rows: [...rows.values()].sort((a, b) => a.y - b.y) };
}

test('닿지 못하는 틈이 없다: 세 난이도 모두 위로도 옆으로도 한 번에 닿는다', () => {
  const g = D.PLAYER.gravity, top = D.PLAYER.jump;
  for (const diff of LEVELS) {
    let maxGap = 0, worst = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const { W, rows } = rowsOf(diff, seed);
      assert(W.genY > 60000 && rows.length > 300, 'generated high ' + W.genY);
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1], b = rows[i], gap = b.y - a.y;
        maxGap = Math.max(maxGap, gap);
        if (!a.kind || b.kind === 'moving' || a.kind === 'moving') continue;
        // 앞 길 발판에서 튀어 오른 뒤 다음 길 발판 높이로 내려오기까지 옆으로 갈 수 있는 거리 (최고 속도의 80%만 친다)
        const t = Math.sqrt(2 * top / g) + Math.sqrt(2 * Math.max(0, top - gap) / g);
        const need = Math.abs(wrapDelta(a.xs[0], b.xs[0])) - b.w / 2;
        worst = Math.max(worst, need / (W.ctl.maxVx * t * 0.8));
      }
    }
    console.log('       ' + diff + ': 가장 넓은 세로 틈 ' + maxGap.toFixed(0) + '점 (한 번 튀는 높이 ' + top + '), 가로 여유 최악 ' + (worst * 100).toFixed(0) + '%');
    assert(maxGap < top * 0.9, diff + ' gap ' + maxGap);
    assert(worst < 1, diff + ' sideways ' + worst);
  }
});

test('난이도 표: 쉬움 → 보통 → 어려움 순서로 좁고 멀고 폭탄이 빠르다', () => {
  const [E, N, X] = LEVELS.map(d => D.DIFFICULTY[d]);
  assert(LEVELS.join() === 'easy,normal,hard', 'order');
  for (const L of [E, N, X]) {
    assert(L.full > L.warm && L.gap[3] < D.PLAYER.jump * 0.9 && L.warmGap[1] <= L.gap[1] + 1, L.id + ' shape');
    for (const k of ['id', 'name', 'hint', 'main', 'extra', 'extraChance', 'moveSpeed', 'rescues', 'itemGap', 'ctl']) assert(k in L, L.id + ' has ' + k);
  }
  assert(E.w[0] > N.w[0] && N.w[0] > X.w[0] && E.w[1] > N.w[1] && N.w[1] > X.w[1], 'width');
  assert(E.gap[3] < N.gap[3] && N.gap[3] < X.gap[3] && E.gap[1] < N.gap[1] && N.gap[1] < X.gap[1], 'gap');
  assert(E.full > N.full && N.full > X.full, 'ramp speed');
  assert(E.mine === null && N.mine.from > X.mine.from && N.mine.chance[1] < X.mine.chance[1], 'mines');
  assert(E.rescues === 3 && N.rescues === 0 && X.rescues === 0, 'rescues');
});

test('쉬움 몸풀기: 처음 30m는 넓고 가까운 발판, 특별한 발판은 스프링뿐', () => {
  const L = D.DIFFICULTY.easy;
  for (let seed = 1; seed <= 20; seed++) {
    const W = create(seed, { diff: 'easy', viewH: 600 });
    const early = W.plats.filter(p => p.kind !== 'ground' && p.y < L.warm * D.METER);
    assert(early.length > 10, 'plats ' + early.length);
    for (const p of early) {
      assert(p.kind === 'normal' || p.kind === 'spring', 'kind ' + p.kind + ' at ' + (p.y / D.METER).toFixed(0) + 'm');
      assert(p.w >= L.w[0] * (p.kind === 'spring' ? 0.85 : 1) - 1, 'wide ' + p.w);
    }
    assert(W.mines.length === 0, 'no mines');
  }
  const { rows } = rowsOf('easy', 3, 40);
  const warmRows = rows.filter(r => r.y < L.warm * D.METER);
  for (let i = 1; i < warmRows.length; i++) assert(warmRows[i].y - warmRows[i - 1].y <= L.gap[1] + 1, 'close ' + (warmRows[i].y - warmRows[i - 1].y));
});

test('높이에 따라 부드럽게 어려워진다 (갑자기 벽처럼 바뀌지 않는다)', () => {
  for (const diff of LEVELS) {
    const bins = new Map();
    for (let seed = 1; seed <= 8; seed++) {
      const { rows } = rowsOf(diff, seed, 250);
      for (let i = 1; i < rows.length; i++) {
        const b = Math.floor(rows[i].y / D.METER / 25);
        const e = bins.get(b) || { n: 0, gap: 0, w: 0 };
        e.n++; e.gap += rows[i].y - rows[i - 1].y; e.w += rows[i].w; bins.set(b, e);
      }
    }
    const keys = [...bins.keys()].sort((a, b) => a - b).filter(k => bins.get(k).n >= 20);
    let prev = null, jump = 0;
    for (const k of keys) {
      const e = bins.get(k), gap = e.gap / e.n;
      if (prev != null) jump = Math.max(jump, gap - prev);
      prev = gap;
    }
    const first = bins.get(keys[0]), last = bins.get(keys[keys.length - 1]);
    assert(first.gap / first.n < last.gap / last.n - 20, diff + ' gets harder');
    assert(jump < 14, diff + ' step in average gap per 25m ' + jump.toFixed(1));
  }
});

test('사람 닮은 봇: 쉬움 > 보통 > 어려움 (숫자를 찍는다)', () => {
  const r = LEVELS.map(d => measure(d, HUMAN, 16, 180));
  for (const x of r) console.log('       ' + x.line);
  const [E, N, X] = r;
  assert(E.avgFirst > N.avgFirst && N.avgFirst > X.avgFirst, 'order ' + r.map(x => x.avgFirst.toFixed(0)).join(' > '));
  assert(N.avgFirst >= 150 && N.avgFirst <= 320, 'normal about 150 to 300 m: ' + N.avgFirst.toFixed(0));
  assert(X.avgFirst < N.avgFirst * 0.75, 'hard well below normal ' + X.avgFirst.toFixed(0));
  assert(E.reach100 === 16 && E.over60 === 0, 'easy human always 100m, never over in a minute');
});

test('5~7살 아이 흉내 봇: 쉬움은 거의 늘 100m, 1분 안에 끝나는 일이 드물다', () => {
  const E = measure('easy', KID, 24, 90);
  console.log('       아이 ' + E.line);
  assert(E.reach100 >= 22, 'reach 100m ' + E.reach100 + '/24');
  assert(E.over60 <= 2, 'over in a minute ' + E.over60 + '/24');
  assert(E.avgTime > 25, 'first fall not too early ' + E.avgTime.toFixed(0));
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
  assert(JSON.stringify(got) === JSON.stringify(['cloudz', 'h150', 'h50', 'n100', 'rocket', 'spring5', 'star20'].sort()), 'medals ' + got.join(','));
  const easyRun = Object.assign({}, run, { easy: true });
  assert(!D.MEDALS.find(m => m.id === 'n100').check(easyRun, rec), 'n100 needs normal');
  const M = id => D.MEDALS.find(m => m.id === id);
  assert(!M('n100').check({ diff: 'easy', height: 300 }, rec) && M('n100').check({ diff: 'hard', height: 100 }, rec), 'n100 by diff');
  assert(M('hard100').check({ diff: 'hard', height: 100 }, rec) && !M('hard100').check({ diff: 'normal', height: 300 }, rec), 'hard100');
  assert(M('spacez').check({ height: 250 }, rec) && !M('spacez').check({ height: 249 }, rec), 'space zone');
  assert(M('starz').check({ height: 500 }, rec) && M('combo20').check({ maxCombo: 20 }, rec) && !M('combo20').check({ maxCombo: 19 }, rec), 'stars zone · combo');
  assert(D.MEDALS.find(m => m.id === 'games10').check(run, { total: { games: 10, stars: 0 } }), 'games10');
  assert(new Set(D.MEDALS.map(m => m.id)).size === D.MEDALS.length && D.MEDALS.length >= 10, 'unique ids');
  const W = create(1, { easy: true });
  const s = runStats(W);
  for (const k of ['diff', 'easy', 'height', 'score', 'stars', 'springs', 'rockets', 'saves', 'maxCombo', 'zone']) assert(k in s, 'runStats has ' + k);
});

test('높이 구역: 0 하늘 · 100 구름 위 · 250 우주 · 500 별나라, 넘을 때 한 번씩 알린다', () => {
  assert(zoneAt(0) === 0 && zoneAt(99) === 0 && zoneAt(100) === 1 && zoneAt(249) === 1 && zoneAt(250) === 2 && zoneAt(499) === 2 && zoneAt(500) === 3 && zoneAt(9999) === 3, 'zoneAt');
  assert(D.ZONES.map(z => z.id).join() === 'sky,cloud,space,stars', 'zone ids');
  for (let i = 1; i < D.ZONES.length; i++) assert(D.ZONES[i].banner && D.ZONES[i].from > D.ZONES[i - 1].from, 'banner ' + i);
  const W = empty();
  const zones = [], miles = [];
  for (let m = 0; m <= 620; m += 5) {
    put(W, 200, m * D.METER + 10, 0); clear(W); tick(W);
    if (W.events.includes('zone')) zones.push(W.height);
    for (const f of W.fx) if (f.kind === 'mile') miles.push(f.m);
  }
  assert(JSON.stringify(zones) === JSON.stringify([100, 250, 500]), 'zones at ' + zones.join(','));
  assert(JSON.stringify(miles) === JSON.stringify([100, 200, 300, 400, 500, 600]), 'miles at ' + miles.join(','));
  assert(W.zone === 3 && runStats(W).zone === 3, 'zone kept');
  // 구역에 따라 발판 섞임이 조금 바뀐다 (구름 위에는 구름 발판이 더 많다 등)
  assert(Object.keys(D.ZONES[1].mix).length > 0, 'cloud zone has a mix');
});

test('콤보: 별 점수 배율이 단계마다 조금씩 오르고 상한에서 멈춘다', () => {
  const C = D.COMBO;
  assert(comboMul(0) === 1 && comboMul(C.step - 1) === 1, 'no bonus at first');
  assert(comboMul(C.step) === 1 + C.add && comboMul(C.step * 2) === 1 + C.add * 2, 'steps');
  assert(comboMul(999) === C.max && comboMul(-3) === 1, 'cap ' + comboMul(999));
  for (let c = 0; c < 60; c++) assert(comboMul(c + 1) >= comboMul(c), 'never goes down');
  const W = empty();
  W.combo = C.step * 2;
  put(W, 200, 300, 0);
  W.stars.push({ id: 99, x: 200, y: 300, got: false });
  ticks(W, 1);
  const pts = Math.round(D.STAR.points * (1 + C.add * 2));
  assert(W.starPts === pts && W.score === W.height + pts, 'star with combo ' + W.starPts);
  assert(W.fx.some(f => f.kind === 'star' && f.pts === pts), 'fx carries points');
  W.combo = 999;
  W.stars.push({ id: 100, x: W.p.x, y: W.p.y, got: false });
  ticks(W, 1);
  assert(W.starPts === pts + Math.round(D.STAR.points * C.max), 'capped ' + W.starPts);
});

test('처음 안내: 양쪽을 다 눌러 봐야 끝나고, 한 번 끝나면 다시 안 나온다', () => {
  const store = memStore();
  assert(RC.needTutorial(store), 'first time');
  const W = create(1, { diff: 'easy', viewH: 600, tutorial: RC.needTutorial(store) });
  assert(W.tut && !W.tut.done, 'tutorial on');
  W.input.dir = 1; ticks(W, 5);
  assert(W.tut.right && !W.tut.left && !W.tut.done, 'right only');
  clear(W);
  W.input.dir = -1; ticks(W, 1);
  assert(W.tut.done && W.events.includes('tut') && W.tut.at > 0, 'done after both');
  RC.tutorialDone(store);
  assert(!RC.needTutorial(store), 'saved');
  assert(create(1, { tutorial: RC.needTutorial(store) }).tut === null, 'not again');
  assert(create(1, {}).tut === null, 'off by default (demo, tests)');
});

test('난이도 기억: 예전 쉬움 키를 이어받는다', () => {
  assert(RC.loadDiff(memStore()) === 'easy', 'default easy');
  assert(RC.loadDiff(memStore({ 'jump.easy': true })) === 'easy', 'old true → easy');
  assert(RC.loadDiff(memStore({ 'jump.easy': false })) === 'normal', 'old false → normal');
  assert(RC.loadDiff(memStore({ 'jump.easy': false, 'jump.diff': 'hard' })) === 'hard', 'new key wins');
  assert(RC.loadDiff(memStore({ 'jump.diff': 'bogus', 'jump.easy': false })) === 'normal', 'bad new key → old key');
  const s = memStore();
  RC.saveDiff('hard', s);
  assert(RC.loadDiff(s) === 'hard', 'round trip');
});

test('기록 장부: 난이도별로 적고, 옛 기록은 쉬움 칸으로 옮긴다', () => {
  const old = { best: { height: 120, score: 300, stars: 18 }, total: { games: 7, stars: 90, height: 500, rescues: 4 }, medals: { h50: '2026-09-27', nope: 'x' } };
  const r = RC.load(memStore({ 'jump.rec': old }));
  assert(r.v === 2 && r.byDiff.easy.height === 120 && r.byDiff.easy.score === 300 && r.byDiff.easy.games === 7, 'old → easy');
  assert(r.byDiff.normal.height === 0 && r.byDiff.hard.score === 0, 'others empty');
  assert(r.total.games === 7 && r.medals.h50 && !('nope' in r.medals), 'totals and medals kept');
  const broken = RC.load(memStore({ 'jump.rec': { best: 'x', byDiff: { hard: { height: -5, score: 'NaN' } } } }));
  assert(broken.byDiff.hard.height === 0 && broken.best.height === 0, 'broken is safe');
  const a = RC.finish(r, { diff: 'hard', height: 40, score: 90, stars: 5, rescued: 0 });
  assert(a.isBest && r.byDiff.hard.height === 40 && r.byDiff.hard.games === 1 && a.chips.length === 2 && /어려움/.test(a.chips[0]), 'hard record ' + a.chips.join('|'));
  assert(r.best.height === 120 && r.total.games === 8, 'overall best stays');
  const b = RC.finish(r, { diff: 'easy', height: 100, score: 250, stars: 20, rescued: 2 });
  assert(!b.isBest && b.chips.length === 1 && r.byDiff.easy.stars === 20 && r.total.rescues === 6, 'easy stars only');
  const s = memStore();
  RC.save(r, s);
  assert(JSON.stringify(RC.load(s)) === JSON.stringify(r), 'round trip');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
