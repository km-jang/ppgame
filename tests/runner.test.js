'use strict';
// 슝슝 우주 달리기 규칙 테스트. 브라우저 없이 runner/js/world.js를 그대로 돌린다.
// 실행: node tests/runner.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
for (const f of ['util.js', 'data.js', 'world.js', 'shop.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'runner', 'js', f), 'utf8'), ctx, { filename: f });
}
const RN = vm.runInContext('RN', ctx);
const D = RN.DATA;
const { create, step, tick, move, speed, makeRow, runStats } = RN.World;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

// 빈 길: 출발 대기 없이, 미리 만든 물체를 모두 치우고 새 줄도 만들지 않는다
function empty(opts) {
  const W = create(1, Object.assign({ wait: 0 }, opts));
  W.obs.length = 0;
  W.nextZ = 1e9;
  W.itemT = 1e9;
  return W;
}
function run(W, sec) { for (let i = 0, n = Math.round(sec / D.TICK); i < n && W.phase === 'play'; i++) tick(W); }
// 우주선 앞 dz m, lane 줄에 물체를 놓는다
function put(W, kind, lane, dz, extra) {
  const o = Object.assign({ kind, x: lane, z: W.dist + dz }, extra || {});
  W.obs.push(o);
  return o;
}

console.log('슝슝 우주 달리기 규칙 테스트');

test('처음 상태: 가운데 줄, 쉬움 하트 3 · 보통 2 · 어려움 1 (옛 방식 easy:false는 보통)', () => {
  const E = create(1), N = create(1, { easy: false }), H = create(1, { diff: 'hard' });
  assert(E.p.lane === 1 && E.p.x === 1 && E.phase === 'play', 'middle lane');
  assert(E.easy && E.diff === 'easy' && E.hearts === D.DIFFICULTY.easy.hearts && E.hearts === 3, 'easy hearts ' + E.hearts);
  assert(!N.easy && N.diff === 'normal' && N.hearts === 2, 'normal hearts ' + N.hearts);
  assert(!H.easy && H.diff === 'hard' && H.hearts === 1, 'hard hearts ' + H.hearts);
  assert(create(1, { diff: 'normal' }).diff === 'normal' && create(1, { diff: 'zzz' }).diff === 'easy', 'diff ids');
  assert(E.obs.length > 0, 'rows made ahead');
});

test('출발 대기 동안은 앞으로 가지 않는다', () => {
  const W = create(1);
  run(W, D.START.wait * 0.5);
  assert(W.dist === 0, 'dist ' + W.dist);
  run(W, D.START.wait);
  assert(W.dist > 0, 'moving after wait');
});

test('줄 바꾸기: 왼쪽·오른쪽, 끝에서는 더 못 간다', () => {
  const W = empty();
  assert(move(W, 'left') && W.p.lane === 0, 'left');
  assert(!move(W, 'left') && W.p.lane === 0, 'clamp left');
  run(W, 0.3);
  assert(W.p.x === 0, 'slid to lane 0: ' + W.p.x);
  assert(move(W, 'right') && move(W, 'right') && W.p.lane === 2, 'right twice');
  assert(!move(W, 'right') && W.p.lane === 2, 'clamp right');
  run(W, 0.4);
  assert(W.p.x === 2, 'slid to lane 2: ' + W.p.x);
  assert(W.events.filter(e => e === 'lane').length === 3, 'lane events');
});

test('줄 바꾸기는 부드럽게 미끄러진다 (한 번에 순간 이동 안 함)', () => {
  const W = empty();
  move(W, 'right');
  tick(W);
  assert(W.p.x > 1 && W.p.x < 1.2, 'x after one tick ' + W.p.x);
});

test('점프는 레이저 문을 넘지만 운석은 못 넘는다', () => {
  const W = empty();
  const v = speed(W);
  const g = put(W, 'gate', 1, v * D.PLAYER.jumpT * 0.5);
  move(W, 'jump');
  run(W, D.PLAYER.jumpT + 0.3);
  assert(W.hits === 0 && W.hearts === 3, 'gate cleared by jump');
  assert(g.over && W.gates === 1, 'gate counted ' + W.gates);
  // 운석은 점프해도 부딪힌다
  const m = put(W, 'meteor', 1, speed(W) * D.PLAYER.jumpT * 0.5);
  move(W, 'jump');
  run(W, D.PLAYER.jumpT + 0.3);
  assert(W.hits === 1 && m.done, 'meteor hits even when jumping');
});

test('점프 안 하면 레이저 문에 걸린다', () => {
  const W = empty();
  put(W, 'gate', 1, 5);
  run(W, 1);
  assert(W.hits === 1 && W.hearts === 2, 'gate hit ' + W.hits);
});

test('운석: 쉬움·보통은 하트 하나를 잃고 계속, 어려움은 끝', () => {
  const E = empty();
  put(E, 'meteor', 1, 5);
  run(E, 1);
  assert(E.phase === 'play' && E.hearts === 2 && E.events.includes('hit'), 'easy heart lost');
  const N = empty({ diff: 'normal' });
  put(N, 'meteor', 1, 5);
  run(N, 1);
  assert(N.phase === 'play' && N.hearts === 1, 'normal heart lost');
  const H = empty({ diff: 'hard' });
  put(H, 'meteor', 1, 5);
  run(H, 1);
  assert(H.phase === 'over' && H.hearts === 0 && H.cause === 'meteor' && H.events.includes('over'), 'hard over');
});

test('쉬움: 하트가 0이 되면 끝', () => {
  const W = empty();
  for (let k = 0; k < 3; k++) { put(W, 'meteor', 1, 5); run(W, D.DIFFICULTY.easy.inv + 0.6); }
  assert(W.phase === 'over' && W.hits === 3, 'over after 3 hits: ' + W.phase + ' ' + W.hits);
});

test('옆 줄의 운석은 부딪히지 않는다', () => {
  const W = empty({ easy: false });
  put(W, 'meteor', 0, 5); put(W, 'meteor', 2, 8);
  run(W, 1.5);
  assert(W.phase === 'play' && W.hits === 0, 'no hit');
});

test('부딪힌 뒤 깜빡이는 동안은 또 부딪혀도 괜찮다', () => {
  const W = empty();
  put(W, 'meteor', 1, 3);
  run(W, 0.4);
  assert(W.hearts === 2 && W.inv > 0, 'hit, inv ' + W.inv);
  put(W, 'meteor', 1, 3);
  run(W, 0.4);
  assert(W.hearts === 2 && W.hits === 1, 'no second hit during blink');
  run(W, D.DIFFICULTY.easy.inv);
  assert(W.inv === 0, 'blink ends');
  put(W, 'meteor', 1, 3);
  run(W, 0.4);
  assert(W.hearts === 1, 'hit again after blink');
});

test('방패는 한 번 막아 준다 (하트 1개인 어려움에서도 안 끝남)', () => {
  const W = empty({ diff: 'hard' });
  put(W, 'item', 1, 3, { item: 'shield', y: 0.7 });
  run(W, 0.3);
  assert(W.shield && W.items === 1, 'shield on');
  put(W, 'meteor', 1, 3);
  run(W, 0.3);
  assert(W.phase === 'play' && !W.shield && W.blocks === 1 && W.hits === 0, 'shield absorbed');
  assert(W.events.includes('shield'), 'shield event');
  run(W, D.HIT.shieldInv + 0.1);
  put(W, 'meteor', 1, 3);
  run(W, 0.3);
  assert(W.phase === 'over', 'second hit ends hard game');
});

test('별을 먹으면 점수가 오르고 이어 먹으면 연속 수가 오른다', () => {
  const W = empty();
  for (let i = 0; i < 4; i++) put(W, 'star', 1, 3 + i * 2, { y: 0.5 });
  run(W, 1);
  assert(W.stars === 4, 'stars ' + W.stars);
  assert(W.chain === 4, 'chain ' + W.chain);
  assert(W.score === Math.floor(W.dist) + 4 * D.STAR.value, 'score ' + W.score);
});

test('다른 줄의 별은 못 먹는다 · 자석이면 모든 줄에서 끌어온다', () => {
  const W = empty();
  put(W, 'star', 0, 6, { y: 0.5 }); put(W, 'star', 2, 7, { y: 0.5 });
  run(W, 1);
  assert(W.stars === 0, 'no magnet: 0 stars');
  put(W, 'item', 1, 2, { item: 'magnet', y: 0.7 });
  run(W, 0.3);
  assert(W.eff.magnet > 0, 'magnet on');
  put(W, 'star', 0, 10, { y: 0.5 }); put(W, 'star', 2, 12, { y: 0.5 });
  run(W, 1.2);
  assert(W.stars === 2, 'magnet pulled ' + W.stars);
  run(W, D.ITEM.kinds.magnet.time);
  assert(W.eff.magnet === 0, 'magnet ends');
});

test('부스트: 빨라지고 부딪혀도 부수며 지나간다 · 별 비', () => {
  const W = empty({ easy: false });
  const v0 = speed(W);
  put(W, 'item', 1, 2, { item: 'boost', y: 0.7 });
  run(W, 0.2);
  assert(W.eff.boost > 0 && W.boosts === 1, 'boost on');
  assert(speed(W) > v0 * 1.5, 'faster ' + speed(W));
  put(W, 'meteor', 1, 6); put(W, 'gate', 1, 20);
  run(W, 1);
  assert(W.phase === 'play' && W.hits === 0 && W.smashes === 2, 'smashed ' + W.smashes);
  assert(W.obs.some(o => o.rain), 'star rain');
  run(W, W.eff.boost + 0.1);
  assert(W.eff.boost === 0 && W.inv > 0, 'grace blink after boost');
});

test('속도: 몸풀기 동안 그대로, 그 뒤 부드럽게 오르고 상한에서 멈춘다 (세 난이도)', () => {
  for (const id of D.DIFF_ORDER) {
    const C = D.DIFFICULTY[id], W = empty({ diff: id });
    const at = t => { W.runT = t; return speed(W); };
    assert(at(0) === C.speed.base, id + ' base');
    if (C.speed.warm > 0) assert(at(C.speed.warm - 0.1) === C.speed.base, id + ' warm-up keeps base');
    // 부드럽게: 1초 사이 변화가 작고 줄어들지 않는다
    let prev = at(0), maxStep = 0;
    for (let t = 1; t < C.speed.warm + C.speed.ramp + 20; t++) {
      const v = at(t);
      assert(v >= prev - 1e-9, id + ' never slows at ' + t);
      maxStep = Math.max(maxStep, v - prev); prev = v;
    }
    assert(maxStep < (C.speed.max - C.speed.base) * 2 / C.speed.ramp, id + ' smooth ramp, max step ' + maxStep.toFixed(3));
    assert(at(1e6) === C.speed.max, id + ' cap');
  }
  const E = D.DIFFICULTY.easy, N = D.DIFFICULTY.normal, H = D.DIFFICULTY.hard;
  assert(E.speed.base < N.speed.base && N.speed.base < H.speed.base, 'start speed order');
  assert(E.speed.max < N.speed.max && N.speed.max < H.speed.max, 'max speed order');
  assert(E.gap.end[0] > N.gap.end[0] && N.gap.end[0] > H.gap.end[0], 'density order');
  assert(E.hearts > N.hearts && N.hearts > H.hearts, 'hearts order');
  assert(E.inv > N.inv && N.inv > H.inv, 'blink order');
});

test('쉬움 몸풀기: 처음 20초에 닿는 줄은 운석 하나 줄과 별 줄뿐, 별이 넉넉하다', () => {
  const C = D.DIFFICULTY.easy;
  assert(C.speed.warm >= 20, 'warm ' + C.speed.warm);
  let rows = 0, starRows = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const W = create(seed, { wait: 0 });
    let last = null;
    const check = row => {
      // 이 줄에 닿는 시간 (몸풀기 동안은 속도가 그대로)
      if (row.z / C.speed.base >= C.speed.warm) return;
      rows++;
      assert(row.pat === 'one' || row.pat === 'stars', 'warm row ' + row.pat + ' seed ' + seed);
      if (row.pat === 'stars' || W.obs.some(o => o.row === row.id && o.kind === 'star')) starRows++;
    };
    // 처음에 미리 만든 줄 + 달리며 만드는 줄
    const first = new Set(W.obs.filter(o => o.row != null).map(o => o.row));
    for (const id of first) {
      const os = W.obs.filter(o => o.row === id);
      assert(os.filter(o => o.kind === 'meteor').length <= 1 && !os.some(o => o.kind === 'gate'), 'first rows simple');
    }
    while (W.runT < C.speed.warm) { tick(W); if (W.lastRow !== last) { last = W.lastRow; check(last); } }
  }
  assert(rows > 40 && starRows / rows >= 0.6, 'plenty of stars ' + starRows + '/' + rows);
  // 움직이는 운석: 쉬움에는 없고, 어려움은 처음부터, 보통은 나중에 많아진다
  const w = (id, t) => { const W = create(1, { diff: id }); const r = RN.World.rowWeights(W, t); const g = k => (r.find(x => x.k === k) || { w: 0 }).w; return g('mover') / r.reduce((a, x) => a + x.w, 0); };
  assert(w('easy', 1e6) === 0, 'easy no movers');
  assert(w('hard', 0) > w('normal', 0), 'hard movers earlier');
  assert(w('normal', 1e6) > w('normal', 5), 'normal movers ramp');
});

test('거리는 늘고 점수 = 거리 + 별 × 값', () => {
  const W = empty();
  run(W, 5);
  assert(W.dist > D.EASY.speed.base * 5 * 0.99, 'dist ' + W.dist);
  assert(W.score === Math.floor(W.dist), 'score = dist');
});

// 두 줄 건너기(줄 바꾸기 두 번) + 여유 0.1초. 장애물 앞뒤 부딪힘 칸(hitZ)을 빼고 잰다
const MIN_ROW_SEC = 2 * D.PLAYER.laneT + 0.1;
function checkRows(W, count, speedOf) {
  let prev = null;
  for (let i = 0; i < count; i++) {
    const row = makeRow(W);
    const blocked = [false, false, false];
    for (const o of W.obs) {
      if (o.row !== row.id) continue;
      if (o.kind === 'meteor') { blocked[o.x] = true; if (o.moving) { blocked[o.from] = true; blocked[o.to] = true; } }
      if (o.kind === 'gate') blocked[o.x] = true;
      if (o.kind === 'item') assert(!row.lanes[o.x], 'item in a free lane');
    }
    assert(blocked.some(b => !b), 'row has a free lane: ' + row.pat);
    assert(row.free.length >= 1, 'free list');
    if (W.diff === 'easy') assert(row.pat !== 'mover', 'easy: no movers');
    if (prev) {
      const v = speedOf(row);
      const sec = (row.z - prev.z - 2 * D.PLAYER.hitZ) / v;
      assert(sec >= MIN_ROW_SEC, W.diff + ' gap ' + sec.toFixed(2) + 's at ' + v.toFixed(1) + 'm/s');
    }
    prev = row;
  }
}
test('어떤 줄이든 비어 있는 줄이 하나 이상, 줄 사이는 가장 빠를 때도 두 줄 건너갈 시간 (세 난이도)', () => {
  let rows = 0;
  for (const id of D.DIFF_ORDER) {
    for (let seed = 1; seed <= 60; seed++) {
      const W = create(seed, { diff: id });
      W.runT = 1e6;   // 가장 빠를 때
      checkRows(W, 80, () => D.DIFFICULTY[id].speed.max);
      rows += 80;
    }
  }
  assert(rows === 3 * 60 * 80, 'rows ' + rows);
});

test('빨라지는 중에도 줄 사이 시간이 모자라지 않는다 (실제로 달리며 잰다)', () => {
  for (const id of D.DIFF_ORDER) {
    const C = D.DIFFICULTY[id];
    for (const seed of [3, 8]) {
      const W = create(seed, { diff: id, wait: 0 });
      const seen = new Map();   // 줄 id → z
      let worst = 99;
      const until = C.speed.warm + C.speed.ramp + 30;
      while (W.runT < until) {
        W.inv = 99; W.hearts = 9;   // 부딪혀도 계속 (간격만 잰다)
        tick(W);
        for (const o of W.obs) if (o.row != null && (o.kind === 'meteor' || o.kind === 'gate') && !seen.has(o.row)) seen.set(o.row, o.z);
        // 지금 우주선 앞을 지나는 줄과 다음 줄 사이 시간
        const zs = [...seen.values()].filter(z => z > W.dist - 1 && z < W.dist + 60).sort((a, b) => a - b);
        if (zs.length >= 2 && zs[0] - W.dist < 1) worst = Math.min(worst, (zs[1] - zs[0] - 2 * D.PLAYER.hitZ) / speed(W));
      }
      assert(worst >= MIN_ROW_SEC, id + ' seed ' + seed + ' worst ' + worst.toFixed(2));
    }
  }
});

test('움직이는 운석은 보통에만, 가까이 오면 옆 줄로 미끄러진다', () => {
  const W = empty({ easy: false });
  const o = put(W, 'meteor', 0, D.OBST.moverAt + 20, { from: 0, to: 1, moving: true });
  W.p.lane = 2; W.p.x = 2;
  run(W, 0.5);
  assert(o.x === 0, 'not yet');
  run(W, 2);
  assert(o.x === 1, 'slid to 1: ' + o.x);
  run(W, 2);
  assert(W.hits === 0 && W.phase === 'play', 'lane 2 was safe');
});

test('화면 주사율이 달라도 결과가 같다 (60·90·144Hz)', () => {
  const res = [60, 90, 144].map(hz => {
    const W = create(4242, { easy: false, auto: true });
    for (let i = 0; i < hz * 30; i++) step(W, 1 / hz);
    return [W.ticks, W.dist.toFixed(6), W.stars, W.hits, W.score, W.phase].join(',');
  });
  assert(res[0] === res[1] && res[1] === res[2], res.join(' | '));
});

test('자동 운전은 쉬움에서 오래 버틴다 (3분)', () => {
  for (const seed of [1, 7, 99]) {
    const W = create(seed, { auto: true });
    run(W, 180);
    assert(W.phase === 'play', 'seed ' + seed + ' over at ' + Math.floor(W.dist) + 'm');
    assert(W.hits <= 1, 'seed ' + seed + ' hits ' + W.hits);
    assert(W.stars > 50 && W.dist > 2400, 'seed ' + seed + ' stars ' + W.stars + ' dist ' + Math.floor(W.dist));
  }
});

test('자동 운전은 보통에서도 한참 간다', () => {
  let total = 0;
  for (const seed of [2, 3, 5]) {
    const W = create(seed, { easy: false, auto: true });
    run(W, 90);
    total += W.dist;
  }
  assert(total / 3 > 1500, 'avg dist ' + Math.floor(total / 3));
});

test('아이템이 가끔 나타나고 먹을 수 있다', () => {
  const W = create(11, { auto: true });
  run(W, 120);
  assert(W.items >= 3, 'items ' + W.items);
  assert(Object.keys(W.kinds).length >= 2, 'kinds ' + Object.keys(W.kinds).join(','));
});

test('기록 · 메달 판정', () => {
  const W = empty({ easy: false });
  W.dist = 1600; W.stars = 60; W.gates = 10; W.blocks = 1; W.boosts = 3; W.hits = 0; W.score = 2200;
  const r = runStats(W);
  assert(r.dist === 1600 && r.stars === 60 && !r.easy, 'stats');
  const rec = { best: { dist: 0, score: 0 }, total: { games: 10, stars: 1000, dist: 0 }, medals: {} };
  const got = D.MEDALS.filter(m => m.check(r, rec)).map(m => m.id);
  for (const id of ['d500', 'd1500', 's50', 'gate10', 'shield', 'boost3', 'normal', 'games10', 'stars1k']) assert(got.includes(id), 'medal ' + id);
  for (const id of ['d3000', 's150', 'clean']) assert(!got.includes(id), 'not ' + id);
  // 무사고: 방패도 안 쓰고 1,000m
  const r2 = runStats(Object.assign(empty(), { dist: 1200, hits: 0, blocks: 0 }));
  assert(D.MEDALS.find(m => m.id === 'clean').check(r2, rec), 'clean run');
  const ids = new Set(D.MEDALS.map(m => m.id));
  assert(ids.size === D.MEDALS.length && D.MEDALS.length >= 10, 'unique medals');
  assert(D.MEDALS.every(m => m.tier >= 1 && m.tier <= 3 && m.name && m.desc), 'medal fields');
});

test('같은 시드면 같은 길이 나온다', () => {
  const a = create(77), b = create(77);
  run(a, 20); run(b, 20);
  assert(JSON.stringify(a.obs.map(o => [o.kind, o.x, o.z])) === JSON.stringify(b.obs.map(o => [o.kind, o.x, o.z])), 'same');
});


// ─── 사람 같은 로봇: 반응이 0.3초 남짓 늦고, 앞 일정 거리(32m, 1.4초)만 보고, 가끔 늦거나(8%) 엉뚱한 줄로 가고(4%),
//     장애물을 아예 못 보기도 한다(3%). 난이도 조절의 근거 (PLAN.md 6절 표의 숫자) ───
function makeHuman(seed, o) {
  const P = D.PLAYER;
  o = Object.assign({ react: 0.3, jitter: 0.15, lookS: 1.4, lookM: 32, late: 0.08, lateBy: 0.35, wrong: 0.04, jumpErr: 0.07, greedy: 0.35, lapse: 0.03 }, o || {});
  const r = RN.rng(seed * 7919 + 13);
  const S = { q: [], target: null, next: 0, seen: new Set() };
  const delay = () => o.react + r() * o.jitter + (r() < o.late ? o.lateBy : 0);
  function think(W) {
    const v = speed(W), look = Math.min(o.lookM, v * o.lookS);
    if (S.target == null) S.target = W.p.lane;
    const cur = S.target, near = [1e9, 1e9, 1e9], gain = [0, 0, 0];
    for (const ob of W.obs) {
      if (ob.done || ob.kind === 'arch') continue;
      const rel = ob.z - W.dist;
      if (rel < -P.hitZ || rel > look) continue;
      if (ob.kind === 'meteor' || ob.kind === 'gate') {
        if (ob._h === undefined) ob._h = r() < o.lapse;   // 딴생각: 못 봤다
        if (ob._h) continue;
      }
      if (ob.kind === 'meteor') {
        for (const l of (ob.moving && ob.x !== ob.to ? [ob.from, ob.to] : [Math.round(ob.x)])) near[l] = Math.min(near[l], rel);
      } else if (ob.kind === 'gate') {
        if (ob.x === cur && !S.seen.has(ob)) {
          S.seen.add(ob);
          const want = rel / v - P.jumpT * 0.5 + (r() - 0.5) * 2 * o.jumpErr;
          S.q.push({ at: W.t + Math.max(delay(), want), dir: 'jump' });
        }
      } else if (ob.kind === 'star') gain[Math.round(ob.x)] += 1;
      else if (ob.kind === 'item') gain[Math.round(ob.x)] += 3;
    }
    if (S.q.some(a => a.dir !== 'jump')) return;
    let best = cur;
    if (near[cur] < look) {
      const c = [0, 1, 2].filter(l => l !== cur).sort((a, b) => (near[b] - near[a]) || (Math.abs(a - cur) - Math.abs(b - cur)));
      best = c[0];
      if (Math.abs(best - cur) === 2 && near[1] < v * 0.35 && Math.abs(c[1] - cur) === 1) best = c[1];
      if (r() < o.wrong) best = [0, 1, 2].filter(l => l !== cur)[Math.floor(r() * 2)];
    } else if (r() < o.greedy * 0.1) {
      for (const l of [cur - 1, cur + 1]) if (l >= 0 && l <= 2 && gain[l] > gain[best] + 1 && near[l] >= look) best = l;
    }
    if (best === cur) return;
    const at = W.t + delay(), dir = best < cur ? 'left' : 'right';
    for (let k = 0; k < Math.abs(best - cur); k++) S.q.push({ at: at + k * 0.12, dir });
    S.target = best;
  }
  return W => {
    for (let i = 0; i < S.q.length; i++) if (S.q[i].at <= W.t) { move(W, S.q[i].dir); S.q.splice(i--, 1); }
    if (W.p.lane !== S.target && !S.q.some(a => a.dir !== 'jump')) S.target = W.p.lane;
    if (W.t >= S.next) { S.next = W.t + 0.1; think(W); }
  };
}
function playHuman(diff, seeds, cap, prof) {
  let dist = 0, time = 0;
  const times = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const W = create(seed, { diff }), h = makeHuman(seed, prof);
    while (W.phase === 'play' && W.runT < cap) { h(W); tick(W); }
    dist += W.dist; time += W.runT; times.push(W.runT);
  }
  times.sort((a, b) => a - b);
  return { dist: dist / seeds, time: time / seeds, median: times[seeds >> 1] };
}

test('난이도 차례: 사람 같은 로봇이 쉬움 > 보통 > 어려움 순으로 오래 간다 (숫자 출력)', () => {
  const N = 24, CAP = 480;
  const res = {};
  for (const id of D.DIFF_ORDER) res[id] = playHuman(id, N, CAP);
  const kid = playHuman('easy', N, CAP, { react: 0.45, jitter: 0.25, lapse: 0.06, wrong: 0.08, late: 0.15, lateBy: 0.45, lookM: 28, jumpErr: 0.1 });
  for (const id of D.DIFF_ORDER) console.log('       ' + D.DIFFICULTY[id].name + ': 평균 ' + Math.round(res[id].dist) + 'm · ' + res[id].time.toFixed(0) + '초 (가운데 ' + res[id].median.toFixed(0) + '초, 최대 ' + CAP + '초까지)');
  console.log('       쉬움 (더 서툰 아이 로봇): 평균 ' + Math.round(kid.dist) + 'm · ' + kid.time.toFixed(0) + '초');
  const E = res.easy, M = res.normal, H = res.hard;
  assert(E.time > M.time * 2 && M.time > H.time * 1.5, 'order ' + [E.time, M.time, H.time].map(x => x.toFixed(0)).join(' > '));
  assert(E.time >= 300, 'easy several minutes: ' + E.time.toFixed(0));
  assert(kid.time >= 180, 'kid on easy several minutes: ' + kid.time.toFixed(0));
  assert(M.time >= 60 && M.time <= 150, 'normal about 1 to 2 minutes: ' + M.time.toFixed(0));
  assert(H.time <= M.time * 0.6, 'hard clearly shorter: ' + H.time.toFixed(0));
});

test('옛 키 옮기기: runner.easy → runner.diff, 옛 최고 기록 → 그때 고른 난이도', () => {
  const mem = init => { const m = Object.assign({}, init); return { m, get: (k, f) => (k in m ? m[k] : f), set: (k, v) => { m[k] = v; } }; };
  const Pf = RN.Prefs;
  assert(Pf.diff(mem({})) === 'easy', 'default easy');
  const a = mem({ 'runner.easy': false });
  assert(Pf.diff(a) === 'normal' && a.m['runner.diff'] === 'normal', 'old false -> normal');
  assert(Pf.diff(mem({ 'runner.easy': true })) === 'easy', 'old true -> easy');
  assert(Pf.diff(mem({ 'runner.easy': true, 'runner.diff': 'hard' })) === 'hard', 'new key wins');
  assert(Pf.diff(mem({ 'runner.diff': 'zzz' })) === 'easy', 'bad value');
  const old = { best: { dist: 900, score: 1500, stars: 60 }, total: { games: 4, stars: 120, dist: 2000 }, medals: { d500: '2026-09-27' } };
  const b = mem({ 'runner.easy': false, 'runner.rec': old });
  const r = Pf.rec(b);
  assert(r.v === 2 && r.best.normal.dist === 900 && r.best.normal.score === 1500 && r.best.easy.dist === 0 && r.best.hard.dist === 0, 'old best -> normal');
  assert(r.total.games === 4 && r.medals.d500, 'totals and medals kept');
  assert(b.m['runner.rec'].v === 2, 'saved in new shape');
  const c = mem({ 'runner.rec': old });
  assert(Pf.rec(c).best.easy.score === 1500, 'old best -> easy by default');
  assert(Pf.rec(mem({ 'runner.rec': Pf.rec(c) })).best.easy.score === 1500, 'new shape reloads');
  assert(Pf.rec(mem({ 'runner.rec': 'garbage' })).best.hard.dist === 0, 'broken record');
});

test('우주 구역: 거리에 따라 노을 우주 → 얼음 행성 → 초록 성운 → 은하 중심', () => {
  const Z = D.ZONES;
  assert(Z.length === 4 && Z[0].at === 0, 'four zones');
  for (let i = 1; i < Z.length; i++) assert(Z[i].at > Z[i - 1].at, 'increasing');
  assert(Z[1].name === '얼음 행성', 'ice');
  const zoneAt = RN.World.zoneAt;
  assert(zoneAt(0) === 0 && zoneAt(Z[1].at - 0.1) === 0 && zoneAt(Z[1].at) === 1 && zoneAt(Z[2].at + 1) === 2 && zoneAt(99999) === 3, 'thresholds');
  const W = empty();
  W.dist = Z[1].at - 1;
  run(W, 0.5);
  assert(W.zone === 1 && W.events.includes('zone') && W.fx.some(f => f.kind === 'zone' && f.i === 1), 'zone event');
  const n = W.events.filter(e => e === 'zone').length;
  run(W, 0.5);
  assert(W.events.filter(e => e === 'zone').length === n, 'only once');
  assert(runStats(W).zone === 1, 'run stats zone');
});

test('기념 아치: 250m마다 지나가면 작은 보너스', () => {
  const W = empty();
  const E = D.MILESTONE.every;
  W.dist = E - 30; W.nextArch = E; RN.World.fill(W);
  const arch = W.obs.find(o => o.kind === 'arch');
  assert(arch && arch.m === E && arch.z === E, 'arch placed at ' + E);
  run(W, 40 / speed(W));
  assert(W.milestones === 1 && W.bonus === D.MILESTONE.bonus && W.events.includes('milestone'), 'bonus ' + W.bonus);
  assert(W.score === Math.floor(W.dist) + D.MILESTONE.bonus, 'score has bonus');
  assert(W.hits === 0, 'arch never hurts');
  assert(W.nextArch === 2 * E, 'next arch ' + W.nextArch);
});

test('아슬아슬: 운석 줄에서 막 비켜 지나가면 +5, 그냥 옆 줄은 아님', () => {
  const W = empty();
  put(W, 'meteor', 1, 6);
  run(W, 0.1);
  move(W, 'left');   // 막 비킨다
  run(W, 0.7);
  assert(W.hits === 0 && W.nears === 1 && W.bonus === D.NEAR.bonus && W.events.includes('near'), 'near miss ' + W.nears);
  // 멀리서 미리 옮겨 둔 줄 옆을 지나가는 것은 아슬아슬이 아니다
  const V = empty();
  move(V, 'left');
  run(V, 2);
  put(V, 'meteor', 1, 8);
  run(V, 1.2);
  assert(V.nears === 0 && V.hits === 0, 'calm pass is not near');
  // 두 줄 떨어진 곳은 아니다
  const X = empty();
  put(X, 'meteor', 2, 6);
  run(X, 0.1); move(X, 'left'); run(X, 0.8);
  assert(X.nears === 0, 'far lane');
  // 부딪히면 아니다
  const Y = empty();
  put(Y, 'meteor', 1, 3);
  run(Y, 1);
  assert(Y.nears === 0 && Y.hits === 1, 'hit is not near');
  assert(D.NEAR.bonus <= 5, 'small bonus');
});

test('별 한 줄을 모두 먹으면 "완벽!" 보너스, 하나라도 놓치면 없음', () => {
  const W = empty();
  const line = { n: 5, got: 0 };
  for (let i = 0; i < 5; i++) put(W, 'star', 1, 3 + i * 2, { y: 0.5, line });
  run(W, 1.2);
  assert(W.stars === 5 && W.perfects === 1 && W.bonus === W.perfectPts && W.perfectPts >= D.STAR.perfect && W.events.includes('perfect'), 'perfect ' + W.perfects);
  assert(W.score === Math.floor(W.dist) + 5 * D.STAR.value + W.perfectPts, 'score');
  const V = empty();
  const l2 = { n: 5, got: 0 };
  for (let i = 0; i < 5; i++) put(V, 'star', i === 2 ? 0 : 1, 3 + i * 2, { y: 0.5, line: l2 });
  run(V, 1.2);
  assert(V.stars === 4 && V.perfects === 0, 'missed one');
  // 만든 줄의 별은 한 줄 묶음을 들고 있다
  const R = create(5);
  const lines = new Set(R.obs.filter(o => o.kind === 'star').map(o => o.line));
  assert(lines.size > 0 && [...lines].every(l => l && l.n >= 3), 'lines tagged');
});

test('하트 아이템: 하트 하나 채우기, 가득이면 더 안 늘고 나오지도 않는다 (어려움엔 없음)', () => {
  const W = empty();
  W.hearts = 1;
  put(W, 'item', 1, 2, { item: 'heart', y: 0.7 });
  run(W, 0.3);
  assert(W.hearts === 2 && W.heals === 1 && W.events.includes('heal'), 'heal ' + W.hearts);
  put(W, 'item', 1, 2, { item: 'heart', y: 0.7 });
  put(W, 'item', 1, 5, { item: 'heart', y: 0.7 });
  run(W, 0.6);
  assert(W.hearts === W.maxHearts && W.hearts === 3, 'capped ' + W.hearts);
  // 가득이면 하트 아이템을 만들지 않는다 / 어려움은 하트 아이템 없음
  for (const [id, hearts, can] of [['easy', 3, false], ['easy', 1, true], ['hard', 1, false]]) {
    let got = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const V = create(seed, { diff: id });
      V.hearts = hearts;
      for (let k = 0; k < 30; k++) { V.itemReady = true; const row = makeRow(V); if (row.item === 'heart') got++; }
    }
    assert(can ? got > 0 : got === 0, id + ' hearts ' + hearts + ': heart items ' + got);
  }
  assert(D.DIFFICULTY.easy.item.w.heart < D.DIFFICULTY.easy.item.w.shield, 'rare');
});

test('처음 안내: 옆으로 밀기 → 안내용 문에서 위로 밀기, 그동안 느려지고 부딪혀도 괜찮다, 한 번만', () => {
  const W = create(3, { tutorial: true, wait: 0 });
  assert(W.tut.step === 'lane', 'lane first');
  run(W, 1);
  assert(W.tut.show === 'lane', 'lane hint');
  move(W, 'right');
  assert(W.tut.step === 'jump' && W.tut.want, 'then jump');
  // 안내용 문이 다가올 때까지 달린다 (부딪혀도 계속)
  let slowed = false, shown = false;
  for (let i = 0; i < 120 * 30 && W.tut.step !== 'done'; i++) {
    W.inv = 99;
    tick(W);
    if (W.tut.show === 'jump') {
      shown = true;
      if (W.slow < 0.8) slowed = true;
      // 문 바로 앞에서 뛴다
      const g = W.obs.find(o => o.tut && !o.done && o.x === 1);
      if (g && g.z - W.dist < speed(W) * D.PLAYER.jumpT * 0.5 && W.p.y === 0) move(W, 'jump');
    }
  }
  assert(shown && slowed, 'jump hint and slow ' + shown + ' ' + slowed);
  assert(W.tut.step === 'done' && W.tut.ok && W.events.includes('tutDone'), 'tutorial done');
  assert(W.hits === 0, 'no hits from tutorial gate');
  run(W, 2);
  assert(W.slow > 0.97, 'speed back ' + W.slow);
  // 안 뛰면: 하트를 잃지 않고 다시 한 번, tries번 뒤에는 끝낸다
  const V = create(4, { tutorial: true, wait: 0, diff: 'hard' });
  move(V, 'left');
  for (let i = 0; i < 120 * 90 && V.tut.step !== 'done' && V.phase === 'play'; i++) { V.inv = 99; V.hearts = 1; tick(V); }
  assert(V.phase === 'play' && V.hits === 0, 'tutorial gate never hurts');
  assert(V.tut.step === 'done' && !V.tut.ok && V.tut.tries === D.TUTORIAL.tries, 'gave up after tries ' + V.tut.tries);
  // 안내 없는 판에는 안내용 문이 없다
  const X = create(3, { wait: 0 });
  move(X, 'right'); run(X, 20);
  assert(!X.tut && !X.obs.some(o => o.tut), 'no tutorial by default');
  // 저장: 한 번 보면 다음부터 안 나온다
  const m = {}, st = { get: (k, f) => (k in m ? m[k] : f), set: (k, v) => { m[k] = v; } };
  assert(RN.Prefs.tutorialPending(st), 'pending first');
  RN.Prefs.markTutorial(st);
  assert(!RN.Prefs.tutorialPending(st), 'shown once');
});

test('화면 주사율이 달라도 결과가 같다 (세 난이도 · 처음 안내 · 60·90·120·144Hz)', () => {
  for (const id of D.DIFF_ORDER) {
    const res = [60, 90, 120, 144].map(hz => {
      const W = create(99, { diff: id, auto: true, tutorial: id === 'easy' });
      for (let i = 0; i < hz * 40; i++) step(W, 1 / hz);
      return [W.ticks, W.dist.toFixed(6), W.stars, W.hits, W.score, W.nears, W.perfects, W.zone, W.phase, W.p.x.toFixed(6), W.p.y.toFixed(6)].join(',');
    });
    assert(res.every(x => x === res[0]), id + ': ' + res.join(' | '));
  }
});

test('줄 바꾸기는 곡선으로 laneT초에 끝나고, 점프는 빨리 오르고 꼭대기에서 머문다', () => {
  const W = empty();
  move(W, 'right');
  const xs = [];
  for (let i = 0; i < Math.ceil(D.PLAYER.laneT / D.TICK) + 1; i++) { tick(W); xs.push(W.p.x); }
  assert(W.p.x === 2, 'arrived');
  const d1 = xs[1] - xs[0], dl = xs[xs.length - 3] - xs[xs.length - 4];
  assert(d1 > dl * 2, 'eases out ' + d1.toFixed(3) + ' ' + dl.toFixed(3));
  const y = RN.World.jumpY, H = D.PLAYER.jumpH;
  assert(y(0.25) > H * 0.8, 'quick rise (faster than a plain arc 0.75) ' + y(0.25).toFixed(2));
  assert(y(0.4) > H * 0.95 && y(0.6) > H * 0.95, 'hang at top');
  assert(y(0) === 0 && y(1) < 1e-9, 'lands');
  // 뛰고 나면 jumpT초 뒤에 땅
  const J = empty();
  move(J, 'jump');
  run(J, D.PLAYER.jumpT * 0.5);
  assert(J.p.y > H * 0.95, 'apex');
  run(J, D.PLAYER.jumpT * 0.5 + 0.02);
  assert(J.p.y === 0 && J.events.includes('land'), 'landed');
});

test('메달: 새 메달 (어려움 · 성운 · 아슬아슬 · 완벽한 별길)', () => {
  const rec = { total: { games: 0, stars: 0, dist: 0 } };
  const get = id => D.MEDALS.find(m => m.id === id);
  const W = empty({ diff: 'hard' });
  W.dist = 1300; W.nears = 10; W.perfects = 5;
  const r = runStats(W);
  assert(r.zone === 2 && r.diff === 'hard', 'stats');
  for (const id of ['hard', 'nebula', 'near10', 'perfect5', 'normal']) assert(get(id).check(r, rec), 'medal ' + id);
  const E = runStats(Object.assign(empty(), { dist: 1300 }));
  assert(!get('hard').check(E, rec) && !get('normal').check(E, rec), 'easy does not get level medals');
  assert(D.MEDALS.length === 16, 'medal count ' + D.MEDALS.length);
});


// ─── 상점 · 미션 (shop.js) ───────────────────────────────────
const SH = RN.Shop;
const memStore = init => { const m = Object.assign({}, init); return { m, get: (k, f) => (k in m ? JSON.parse(JSON.stringify(m[k])) : f), set: (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; };
const fakeWallet = c => ({ c, coins() { return this.c; }, setCoins(n) { this.c = n; } });

test('코인 계산: 거리·별·아치·구역, 난이도 배율, 보통 한 판 20~60개', () => {
  const st = SH.blank();
  const typical = SH.coinsFor({ diff: 'easy', dist: 800, stars: 50, milestones: 3, zone: 1 }, st);
  assert(typical.total >= 20 && typical.total <= 60, 'typical ' + typical.total);
  assert(typical.parts.dist === 20 && typical.parts.stars === 12 && typical.parts.arch === 6 && typical.parts.zone === 10, JSON.stringify(typical.parts));
  const short = SH.coinsFor({ diff: 'easy', dist: 300, stars: 20, milestones: 1, zone: 0 }, st);
  assert(short.total >= 5 && short.total < typical.total, 'short ' + short.total);
  const hard = SH.coinsFor({ diff: 'hard', dist: 800, stars: 50, milestones: 3, zone: 1 }, st);
  assert(hard.total > typical.total && hard.parts.diff > 0, 'hard pays more ' + hard.total);
  st.up.coin = 5;
  const bonus = SH.coinsFor({ diff: 'easy', dist: 800, stars: 50, milestones: 3, zone: 1 }, st);
  assert(bonus.parts.bonus === Math.floor(typical.total * 0.5) && bonus.total === typical.total + bonus.parts.bonus, 'coin upgrade ' + JSON.stringify(bonus));
  // 사람 같은 로봇 한 판 (보통) 값도 20~200 안
  const W = create(3, { diff: 'normal' }), h = makeHuman(3);
  while (W.phase === 'play' && W.runT < 120) { h(W); tick(W); }
  const c = SH.coinsFor(SH.runOf(W), SH.blank());
  console.log('       보통 2분 (로봇 ' + Math.floor(W.dist) + 'm, 별 ' + W.stars + '): 코인 ' + c.total);
  assert(c.total > 0 && c.total < W.dist / 8, 'bot game coins ' + c.total);
  // 값: 80 ~ 1,200
  const prices = [].concat(D.CHARS.map(x => x.price).filter(Boolean), ...D.UPGRADES.map(u => u.prices), D.START_ITEMS.map(i => i.price));
  assert(Math.min(...prices) >= 80 && Math.max(...prices) <= 1200, 'price range ' + Math.min(...prices) + '..' + Math.max(...prices));
});

test('상점: 가짜 지갑으로 사기 · 모자라면 못 삼 · 캐릭터 고르기 · 저장했다 다시 읽기', () => {
  const store = memStore({}), wal = fakeWallet(0);
  let st = SH.load(store, wal);
  assert(st.coins === 0 && st.char === 'jet' && st.chars.jet && !st.chars.ufo, 'blank');
  assert(SH.buy(st, 'ufo').reason === 'coins', 'poor');
  wal.c = 1000; st = SH.load(store, wal);
  assert(st.coins === 1000, 'wallet coins');
  const r = SH.buy(st, 'ufo');
  assert(r.ok && r.cost === 300 && st.coins === 700 && st.chars.ufo && st.char === 'ufo', 'bought char');
  assert(SH.buy(st, 'ufo').reason === 'owned', 'owned');
  assert(SH.selectChar(st, 'jet') && st.char === 'jet' && !SH.selectChar(st, 'phoenix') && !SH.selectChar(st, 'zzz'), 'select');
  assert(SH.buy(st, 'magnet').ok && st.up.magnet === 1 && SH.price(st, 'magnet') === D.UPGRADES[0].prices[1], 'upgrade 1');
  assert(SH.buy(st, 'sshield').ok && st.items.sshield === 1 && SH.buy(st, 'shield').ok && st.up.shield === 1, 'start item and upgrade');
  assert(SH.buy(st, 'nope').reason === 'unknown', 'unknown');
  SH.save(st, store, wal);
  assert(wal.c === st.coins, 'wallet updated ' + wal.c);
  const again = SH.load(store, wal);
  assert(again.chars.ufo && again.v === 2 && again.up.magnet === 1 && again.items.sshield === 1 && again.coins === wal.c, 'reload');
  // 5단계가 끝, 시작 아이템은 3개까지
  st.coins = 1e6;
  for (let i = 0; i < 7; i++) SH.buy(st, 'boost');
  assert(st.up.boost === D.UPGRADE_MAX && SH.buy(st, 'boost').reason === 'max', 'upgrade max');
  for (let i = 0; i < 5; i++) SH.buy(st, 'sheart');
  assert(st.items.sheart === 3 && SH.price(st, 'sheart') === null, 'item max');
  // 지갑이 없으면(null) 저장본의 coins
  const solo = memStore({});
  const s2 = SH.load(solo, null); s2.coins = 77; SH.save(s2, solo, null);
  assert(SH.load(solo, null).coins === 77, 'no wallet');
});

test('강화가 판에 적용된다 (자석·부스트 시간, 방패 여유)', () => {
  const st = SH.blank();
  st.up = { magnet: 3, shield: 5, boost: 2, coin: 0 };
  const W = create(1, Object.assign({ wait: 0 }, SH.worldOpts(st, {})));
  assert(W.magnetTime === D.ITEM.kinds.magnet.time + 3 && Math.abs(W.boostTime - (D.ITEM.kinds.boost.time + 1.2)) < 1e-9, 'times');
  assert(Math.abs(W.shieldInv - (D.HIT.shieldInv + 2)) < 1e-9, 'shield inv ' + W.shieldInv);
  W.obs.length = 0; W.nextZ = 1e9; W.itemT = 1e9;
  put(W, 'item', 1, 2, { item: 'magnet', y: 0.7 });
  run(W, 0.3);
  assert(W.eff.magnet > D.ITEM.kinds.magnet.time + 2, 'magnet longer ' + W.eff.magnet);
  put(W, 'item', 1, 2, { item: 'shield', y: 0.7 });
  run(W, 0.3);
  put(W, 'meteor', 1, 3);
  run(W, 0.3);
  assert(W.blocks === 1 && W.inv > D.HIT.shieldInv + 1, 'shield blink longer ' + W.inv);
  const plain = create(1);
  assert(plain.magnetTime === D.ITEM.kinds.magnet.time && plain.char === 'jet', 'no upgrades by default');
});

test('시작 아이템: 다음 판에 하나씩 쓰고 줄어든다 (하트는 어려움에서 안 씀)', () => {
  const st = SH.blank();
  st.items = { sshield: 2, sboost: 1, sheart: 1 };
  const lo = SH.takeLoadout(st, 'easy');
  assert(lo.shield && lo.boost && lo.heart && st.items.sshield === 1 && st.items.sboost === 0 && st.items.sheart === 0, 'consumed');
  const W = create(1, Object.assign({ diff: 'easy' }, SH.worldOpts(st, lo)));
  assert(W.shield && W.hearts === 4 && W.maxHearts === 4 && W.eff.boost > 0, 'applied ' + W.hearts);
  const lo2 = SH.takeLoadout(st, 'easy');
  assert(lo2.shield && !lo2.boost && !lo2.heart && st.items.sshield === 0, 'second game');
  assert(Object.keys(SH.takeLoadout(st, 'easy')).length === 0, 'empty');
  const h = SH.blank(); h.items.sheart = 2;
  const lo3 = SH.takeLoadout(h, 'hard');
  assert(!lo3.heart && h.items.sheart === 2, 'heart kept on hard');
  const H = create(1, Object.assign({ diff: 'hard' }, SH.worldOpts(h, { heart: true })));
  assert(H.hearts === 1, 'hard ignores heart');
});

test('미션: 3개, 판마다 진행 · 끝나면 받기 · 새 미션으로 바뀜', () => {
  assert(D.MISSIONS.length >= 15 && new Set(D.MISSIONS.map(m => m.id)).size === D.MISSIONS.length, 'missions ' + D.MISSIONS.length);
  const st = SH.blank();
  assert(st.missions.length === 3 && new Set(st.missions.map(m => m.id)).size === 3, 'three');
  st.missions = [{ id: 'st300', prog: 0, done: false }, { id: 'r1000', prog: 0, done: false }, { id: 'g5', prog: 0, done: false }];
  const run1 = { diff: 'easy', dist: 700, stars: 200, games: 1 };
  let res = SH.finishRun(st, run1);
  assert(res.coins > 0 && st.coins === res.coins && st.life.games === 1, 'coins in');
  assert(st.missions[0].prog === 200 && st.missions[1].prog === 700 && st.missions[2].prog === 1 && !res.done.length, 'progress');
  res = SH.finishRun(st, { diff: 'easy', dist: 600, stars: 150, games: 1 });
  assert(st.missions[0].done && res.done[0] === 'st300', 'life done');
  assert(st.missions[1].prog === 700, 'run keeps best');
  res = SH.finishRun(st, { diff: 'easy', dist: 1200, stars: 0, games: 1 });
  assert(st.missions[1].done, 'run done');
  const before = st.coins;
  assert(SH.claim(st, 2) === 0, 'not done yet');
  const got = SH.claim(st, 0);
  assert(got === 100 && st.coins === before + 100, 'claimed');
  assert(st.missions.length === 3 && st.missions[0].id !== 'st300' && !st.missions[0].done, 'replaced in place');
  assert(st.missions[1].id === 'r1000', 'others stay');
  const v = SH.missionView(st);
  assert(v.length === 3 && v.every(m => m.text && m.goal > 0 && m.pct >= 0 && m.pct <= 1), 'view');
  // 실제 판 요약에도 미션 칸이 모두 있다
  const W = create(1, { auto: true }); run(W, 60);
  const ro = SH.runOf(W);
  for (const m of D.MISSIONS) assert(typeof ro[m.stat] === 'number', 'runOf has ' + m.stat);
  assert(ro.clean > 0 && ro.clean <= ro.dist + 1, 'clean dist ' + ro.clean);
});

test('망가진 상점 저장본은 깨끗하게', () => {
  for (const bad of [null, 'x', 5, [], { coins: -5, skin: 'gold', skins: { gold: 'yes', bolt: true }, up: { magnet: 99, coin: 'a' }, items: { sshield: 50, sheart: -1 }, missions: [{ id: 'zzz' }, { id: 'g5', prog: 999 }, { id: 'g5' }, 7], life: 3 },
    { v: 2, char: 'phoenix', chars: { phoenix: 1, zzz: true, ufo: true }, coins: 'lots' }, { v: 2, char: 5, chars: [] }]) {
    const st = SH.clean(bad);
    assert(st.coins >= 0 && st.chars.jet && D.CHARS.some(s => s.id === st.char) && st.chars[st.char], 'char ok');
    assert(Object.keys(st.chars).every(id => D.CHARS.some(c => c.id === id)), 'only real chars');
    assert(st.char !== 'phoenix', 'not owned phoenix not selected');
    assert(Object.values(st.up).every(v => v >= 0 && v <= D.UPGRADE_MAX), 'up ok');
    assert(D.START_ITEMS.every(it => st.items[it.id] >= 0 && st.items[it.id] <= it.max), 'items ok');
    assert(st.missions.length === 3 && new Set(st.missions.map(m => m.id)).size === 3, 'missions ok');
  }
  const st = SH.clean({ skin: 'gold', skins: { bolt: true }, up: { magnet: 99 }, items: { sshield: 50 }, missions: [{ id: 'g5', prog: 999 }] });
  assert(st.char === 'jet' && st.chars.fox && st.up.magnet === 5 && st.items.sshield === 3, 'clamped');
  assert(st.missions[0].id === 'g5' && st.missions[0].done && st.missions[0].prog === 5, 'mission clamped');
  const store = memStore({ 'runner.shop1': 'garbage' });
  assert(SH.load(store, null).missions.length === 3, 'garbage load');
});

// ─── 캐릭터 5종 ───
test('캐릭터 5종: id·값이 다 다르고, 첫 캐릭터는 공짜로 처음부터 있다', () => {
  assert(D.CHARS.length === 5, 'five ' + D.CHARS.length);
  assert(new Set(D.CHARS.map(c => c.id)).size === 5 && new Set(D.CHARS.map(c => c.price)).size === 5, 'unique ids and prices');
  assert(new Set(D.CHARS.map(c => c.shape)).size === 5, 'five different shapes');
  assert(D.CHARS[0].price === 0 && D.CHARS.slice(1).every(c => c.price >= 300 && c.price <= 1200), 'prices');
  for (let i = 1; i < 5; i++) assert(D.CHARS[i].price > D.CHARS[i - 1].price, 'price order');
  for (const c of D.CHARS) {
    assert(c.name && c.desc && c.look && c.trait && Object.keys(c.trait).length > 0, 'trait ' + c.id);
    assert(!/[\u2014\u2013]/.test(c.name + c.desc + c.look), 'no dashes ' + c.id);
  }
  const st = SH.blank();
  assert(st.chars.jet && Object.keys(st.chars).length === 1 && st.char === 'jet', 'only jet owned');
  // 가진 것만 고른다 · 사면 바로 고른 것이 된다 · 모자라면 안 산다
  assert(!SH.selectChar(st, 'whale') && st.char === 'jet', 'cannot pick unowned');
  st.coins = 499;
  assert(SH.buy(st, 'whale').reason === 'coins' && !st.chars.whale, 'poor');
  st.coins = 500;
  assert(SH.buy(st, 'whale').ok && st.coins === 0 && st.char === 'whale', 'bought');
  assert(SH.selectChar(st, 'jet') && SH.selectChar(st, 'whale'), 'switch');
  assert(SH.worldOpts(st, {}).char === 'whale' && create(1, SH.worldOpts(st, {})).char === 'whale', 'goes to world');
  assert(create(1, { char: 'zzz' }).char === 'jet' && create(1, { skin: 'fox' }).char === 'fox', 'unknown char, old option name');
});

test('특기: 캐릭터마다 맞는 규칙이 바뀐다', () => {
  const base = create(1, { char: 'jet' });
  const C = id => create(1, { char: id, wait: 0 });
  // 제트: 완벽 보너스 1.5배
  assert(base.perfectPts === Math.round(D.STAR.perfect * 1.5), 'jet perfect ' + base.perfectPts);
  // 비행접시: 자석 더 오래, 더 멀리
  const U = C('ufo');
  assert(U.magnetTime === base.magnetTime + 3 && U.magnetRange > D.ITEM.magnetRange, 'ufo magnet');
  const u2 = empty({ char: 'ufo' }), j2 = empty({ char: 'jet' });
  for (const W of [u2, j2]) { W.eff.magnet = 5; put(W, 'star', 0, 20, { y: 0.5 }); run(W, 0.1); }
  assert(u2.obs[0].mag && !j2.obs[0].mag, 'ufo pulls from further');
  // 고래: 하트 +1 (쉬움·보통), 어려움은 방패
  assert(create(1, { char: 'whale' }).hearts === 4 && create(1, { char: 'whale', diff: 'normal' }).hearts === 3, 'whale hearts');
  const wh = create(1, { char: 'whale', diff: 'hard' });
  assert(wh.hearts === 1 && wh.shield && !create(1, { diff: 'hard' }).shield, 'whale hard shield');
  assert(create(1, { char: 'whale', loadout: { heart: true } }).maxHearts === 5, 'whale + start heart');
  // 여우: 줄 바꾸기가 빠르고 아슬아슬 두 배
  const F = empty({ char: 'fox' }), J = empty({ char: 'jet' });
  assert(F.laneT < D.PLAYER.laneT && J.laneT === D.PLAYER.laneT, 'fox lane time');
  move(F, 'left'); move(J, 'left');
  run(F, F.laneT + 0.01); run(J, F.laneT + 0.01);
  assert(F.p.x === 0 && J.p.x > 0, 'fox arrives first ' + J.p.x);
  const F2 = empty({ char: 'fox' });
  put(F2, 'meteor', 1, 6); run(F2, 0.1); move(F2, 'left'); run(F2, 0.7);
  assert(F2.nears === 1 && F2.bonus === D.NEAR.bonus * 2, 'fox near ' + F2.bonus);
  // 불사조: 부스트 더 길고, 한 판에 한 번 다시 산다
  const P = empty({ char: 'phoenix', diff: 'hard' });
  assert(P.boostTime === base.boostTime + 1.5, 'phoenix boost');
  put(P, 'meteor', 1, 3); run(P, 0.5);
  assert(P.phase === 'play' && P.hearts === 1 && P.revived === 1 && P.inv > 1 && P.events.includes('revive'), 'revived');
  run(P, 3);
  put(P, 'meteor', 1, 3); run(P, 0.5);
  assert(P.phase === 'over', 'only once');
  const J3 = empty({ char: 'jet', diff: 'hard' });
  put(J3, 'meteor', 1, 3); run(J3, 0.5);
  assert(J3.phase === 'over', 'jet does not revive');
  // 어느 하나가 모든 특기를 다 갖지 않는다 (서로 다른 쪽을 돕는다)
  const keys = D.CHARS.map(c => Object.keys(c.trait).join());
  assert(new Set(keys).size === 5, 'different traits');
});

test('캐릭터마다: 어떤 줄이든 빈 줄이 있고, 줄 사이는 그 캐릭터가 두 줄 건너갈 시간보다 길다 (세 난이도, 가장 빠를 때)', () => {
  const slowest = Math.max(...D.CHARS.map(c => c.trait.laneT || D.PLAYER.laneT));
  assert(slowest <= D.PLAYER.laneT, 'no character is slower than the base ship');
  for (const c of D.CHARS) {
    for (const id of D.DIFF_ORDER) {
      for (let seed = 1; seed <= 12; seed++) {
        const W = create(seed, { diff: id, char: c.id });
        W.runT = 1e6;
        const need = 2 * W.laneT + 0.1, vmax = D.DIFFICULTY[id].speed.max * (W.eff.boost > 0 ? D.ITEM.boostMul : 1);
        let prev = null;
        for (let i = 0; i < 40; i++) {
          const row = makeRow(W);
          assert(row.free.length >= 1, 'free lane ' + c.id);
          if (prev) { const sec = (row.z - prev.z - 2 * D.PLAYER.hitZ) / vmax; assert(sec >= need, c.id + ' ' + id + ' gap ' + sec.toFixed(2)); }
          prev = row;
        }
      }
    }
  }
});

test('옛 꾸미기 저장본 옮기기: 비슷한 캐릭터를 주고, 없는 것은 값을 한 번 돌려준다', () => {
  const old = { v: 1, coins: 0, skin: 'bolt', skins: { basic: true, bolt: true, whale: true, comet: true, gold: true }, up: { magnet: 2 }, items: { sshield: 1 }, missions: [], mseed: 7, life: { earned: 900, games: 4 } };
  const store = memStore({ 'runner.shop1': old }), wal = fakeWallet(100);
  const st = SH.load(store, wal);
  assert(st.chars.jet && st.chars.fox && st.chars.whale && !st.chars.phoenix && !st.chars.ufo, 'mapped ' + JSON.stringify(st.chars));
  assert(st.char === 'fox', 'selected mapped ' + st.char);
  assert(st.coins === 100 + 500 + 1200 && wal.c === 1800 && st.refunded === 1700, 'refund ' + st.coins);
  assert(st.up.magnet === 2 && st.items.sshield === 1 && st.life.games === 4, 'other things kept');
  const saved = store.m['runner.shop1'];
  assert(saved.v === 2 && saved.chars.fox && !saved.skins, 'saved as v2');
  // 다시 읽어도 두 번 돌려주지 않는다
  const again = SH.load(store, wal);
  assert(again.coins === 1800 && wal.c === 1800 && !again.refunded && again.char === 'fox', 'refund once');
  // 옛 고른 것이 돌려받은 꾸미기면 기본 캐릭터
  const s2 = SH.load(memStore({ 'runner.shop1': { v: 1, skin: 'gold', skins: { basic: true, gold: true, phoenix: true } } }), fakeWallet(0));
  assert(s2.char === 'jet' && s2.chars.phoenix && s2.coins === 1200, 'gold refund, phoenix kept');
  // 옛 기본만 가진 저장본은 그대로 기본 (돌려줄 것 없음)
  const s3 = SH.load(memStore({ 'runner.shop1': { v: 1, skin: 'basic', skins: { basic: true } } }), fakeWallet(40));
  assert(s3.char === 'jet' && s3.coins === 40 && !s3.refunded, 'plain old save');
  // 지갑이 없을 때는 저장본 코인에 더한다
  const s4 = SH.load(memStore({ 'runner.shop1': { v: 1, coins: 10, skins: { comet: true } } }), null);
  assert(s4.coins === 510, 'no wallet refund ' + s4.coins);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
