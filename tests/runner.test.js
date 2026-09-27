'use strict';
// 슝슝 우주 달리기 규칙 테스트. 브라우저 없이 runner/js/world.js를 그대로 돌린다.
// 실행: node tests/runner.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
// 우주 여행 도감(외계 행성·날씨)을 브라우저와 같은 차례로 먼저 불러온다 (index.html: hub.js 다음 worlds.js)
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common', 'worlds.js'), 'utf8'), ctx, { filename: 'worlds.js' });
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
    while (W.runT < C.speed.warm) { W.inv = 99; tick(W); if (W.lastRow !== last) { last = W.lastRow; check(last); } }
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
    // 운석(움직이는 운석은 지나가는 두 줄)만 못 지나간다. 문은 점프, 막대는 미끄러지기로 지나간다
    const blocked = [false, false, false], empty = [true, true, true];
    for (const o of W.obs) {
      if (o.row !== row.id) continue;
      if (o.kind === 'meteor') { blocked[o.x] = true; empty[o.x] = false; if (o.moving) { blocked[o.from] = blocked[o.to] = true; empty[o.from] = empty[o.to] = false; } }
      if (o.kind === 'gate' || o.kind === 'bar') empty[o.x] = false;
      if (o.kind === 'item') assert(!row.lanes[o.x], 'item in a free lane');
    }
    assert(blocked.some(b => !b), 'row has a passable lane: ' + row.pat);
    assert(row.open.length >= 1 && row.open.every(l => !blocked[l]), 'open list');
    assert(row.free.length === empty.filter(Boolean).length, 'free list');
    // 빈 줄이 없는 줄은 벽 모양뿐 (점프나 미끄러지기로 지나간다), 그다음 줄까지는 숨 돌릴 틈
    if (!row.free.length) assert(['g3', 'b3', 'mgb'].includes(row.pat), 'no free lane only for walls: ' + row.pat);
    if (W.diff === 'easy') assert(row.pat !== 'mover', 'easy: no movers');
    if (prev) {
      const v = speedOf(row);
      const sec = (row.z - prev.z - 2 * D.PLAYER.hitZ) / v;
      assert(sec >= MIN_ROW_SEC, W.diff + ' gap ' + sec.toFixed(2) + 's at ' + v.toFixed(1) + 'm/s');
      if (!prev.free.length) assert((row.z - prev.z) / v >= D.GEN.actGap - 1e-9, 'breather after a wall ' + ((row.z - prev.z) / v).toFixed(2));
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
        W.inv = 99; W.hearts = 9; W.eff.boost = 0;   // 부딪혀도 계속 (간격만 잰다. 부스트는 다 부수고 가니 빼고)
        tick(W);
        for (const o of W.obs) if (o.row != null && (o.kind === 'meteor' || o.kind === 'gate' || o.kind === 'bar') && !seen.has(o.row)) seen.set(o.row, o.z);
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
//     장애물을 아예 못 보기도 한다(3%). 문이 오면 뛰고 막대가 오면 미끄러진다 (때를 맞추는 것도 조금씩 틀린다).
//     블랙홀이 끌어당기면 반응해서 반대로 민다(늦으면 끌려간다). 난이도 조절의 근거 (PLAN.md 6절 표의 숫자)
//     lazy: 옆으로만 피하는 로봇 (점프·미끄러지기를 안 하고 문·막대도 운석처럼 피한다) ───
function makeHuman(seed, o) {
  const P = D.PLAYER;
  o = Object.assign({ react: 0.3, jitter: 0.15, lookS: 1.4, lookM: 32, late: 0.08, lateBy: 0.35, wrong: 0.04, jumpErr: 0.07, greedy: 0.35, lapse: 0.03, counter: 0.85, lazy: false }, o || {});
  const r = RN.rng(seed * 7919 + 13);
  const S = { q: [], target: null, next: 0, seen: new Set(), pullSeen: null };
  const delay = () => o.react + r() * o.jitter + (r() < o.late ? o.lateBy : 0);
  const isLane = a => a.dir === 'left' || a.dir === 'right';
  function think(W) {
    const v = speed(W), look = Math.min(o.lookM, v * o.lookS);
    if (S.target == null) S.target = W.p.lane;
    const cur = S.target, near = [1e9, 1e9, 1e9], gain = [0, 0, 0];
    for (const ob of W.obs) {
      if (ob.done || ob.kind === 'arch') continue;
      const rel = ob.z - W.dist;
      if (rel < -P.hitZ || rel > look) continue;
      if (ob.kind === 'meteor' || ob.kind === 'gate' || ob.kind === 'bar' || ob.kind === 'bomb') {
        if (ob._h === undefined) ob._h = r() < o.lapse;   // 딴생각: 못 봤다
        if (ob._h) continue;
      }
      const act = ob.kind === 'gate' || ob.kind === 'bar' || ob.kind === 'bomb';
      if (ob.kind === 'meteor' || (o.lazy && act)) {
        for (const l of (ob.moving && ob.x !== ob.to ? [ob.from, ob.to] : [Math.round(ob.x)])) near[l] = Math.min(near[l], rel);
      } else if (act) {
        if (ob.x === cur && !S.seen.has(ob)) {
          S.seen.add(ob);
          const T = ob.kind === 'bar' ? P.slideT : P.jumpT;
          const want = rel / v - T * 0.5 + (r() - 0.5) * 2 * o.jumpErr;
          S.q.push({ at: W.t + Math.max(delay(), want), dir: ob.kind === 'bar' ? 'slide' : 'jump' });
        }
      } else if (ob.kind === 'star') gain[Math.round(ob.x)] += 1;
      else if (ob.kind === 'item') gain[Math.round(ob.x)] += 3;
    }
    // 해적 레이저가 빛나는 줄: 알아챈 뒤(반응 시간)부터는 운석처럼 피한다
    const Z = W.pir && W.pir.laser;
    if (Z) {
      if (S.laserSeen !== Z) { S.laserSeen = Z; S.laserAt = W.t + delay(); S.laserLapse = r() < o.lapse; }
      if (W.t >= S.laserAt && !S.laserLapse) near[Z.lane] = 0;
    }
    if (S.q.some(isLane)) return;
    // 블랙홀이 끌어당기려 한다: 반대쪽이 괜찮으면(또는 끝 줄이면) 반대로 민다
    if (W.pull && !W.pull.done && S.pullSeen !== W.pull) {
      S.pullSeen = W.pull;
      const opp = cur - W.pull.dir;
      if (r() < o.counter && (opp < 0 || opp > 2 || near[opp] >= look)) {
        S.q.push({ at: W.t + delay(), dir: W.pull.dir > 0 ? 'left' : 'right' });
        if (opp >= 0 && opp <= 2) S.target = opp;
        return;
      }
    }
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
    if (W.p.lane !== S.target && !S.q.some(isLane)) S.target = W.p.lane;
    if (W.t >= S.next) { S.next = W.t + 0.1; think(W); }
  };
}
function playHuman(diff, seeds, cap, prof, wopts) {
  let dist = 0, time = 0;
  const times = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const W = create(seed, Object.assign({ diff }, wopts)), h = makeHuman(seed, prof);
    while (W.phase === 'play' && W.runT < cap) { h(W); tick(W); }
    dist += W.dist; time += W.runT; times.push(W.runT);
  }
  times.sort((a, b) => a - b);
  return { dist: dist / seeds, time: time / seeds, median: times[seeds >> 1] };
}

const HUMAN = {};
test('난이도 차례: 사람 같은 로봇이 쉬움 > 보통 > 어려움 순으로 오래 간다 (숫자 출력)', () => {
  const N = 24, CAP = 480;
  const res = {};
  for (const id of D.DIFF_ORDER) res[id] = playHuman(id, N, CAP);
  HUMAN.easy = res.easy;
  const kid = playHuman('easy', N, CAP, { react: 0.45, jitter: 0.25, lapse: 0.06, wrong: 0.08, late: 0.15, lateBy: 0.45, lookM: 28, jumpErr: 0.1 });
  for (const id of D.DIFF_ORDER) console.log('       ' + D.DIFFICULTY[id].name + ': 평균 ' + Math.round(res[id].dist) + 'm · ' + res[id].time.toFixed(0) + '초 (가운데 ' + res[id].median.toFixed(0) + '초, 최대 ' + CAP + '초까지)');
  console.log('       쉬움 (더 서툰 아이 로봇): 평균 ' + Math.round(kid.dist) + 'm · ' + kid.time.toFixed(0) + '초');
  const E = res.easy, M = res.normal, H = res.hard;
  assert(E.time > M.time * 2 && M.time > H.time * 1.5, 'order ' + [E.time, M.time, H.time].map(x => x.toFixed(0)).join(' > '));
  assert(E.time >= 300, 'easy several minutes: ' + E.time.toFixed(0));
  assert(kid.time >= 180, 'kid on easy several minutes: ' + kid.time.toFixed(0));
  // 보통은 사람 같은 로봇이 2분 남짓 (2026-09-27 점검: 83초로 쉬움과 차이가 너무 커서 조금 풀었다)
  assert(M.time >= 110 && M.time <= 160, 'normal about 2 minutes: ' + M.time.toFixed(0));
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

test('우주 여행: 수성 → … → 명왕성 → 외계 행성 여덟(도감 차례) → 은하 너머 → 다시 수성 (바퀴를 돌아도 같은 차례)', () => {
  const Z = D.ZONES, leg = D.ROUTE.leg, zoneAt = RN.World.zoneAt, placeOf = RN.World.placeOf;
  const WX = vm.runInContext('WORLDS', ctx);
  const solar = ['수성', '금성', '지구', '화성', '목성', '토성', '천왕성', '해왕성', '명왕성'];
  const names = solar.concat(WX.EXO.map(e => e.name), ['은하 너머']);
  const N = names.length;
  assert(N === 18 && Z.length === N && Z.map(z => z.name).join() === names.join(), 'order ' + Z.map(z => z.name).join());
  assert(Z.slice(9, 17).map(z => z.id).join() === WX.EXO.map(e => e.id).join() && Z.slice(9, 17).every(z => z.exo), 'exo after pluto');
  assert(Z.every((z, i) => z.at === i * leg && z.line && !/[\u2014\u2013]/.test(z.name + z.line)), 'at and lines');
  assert(new Set(Z.map(z => z.id)).size === N, 'ids unique');
  assert(leg >= 300 && leg <= 400 && Z[8].at >= 2800 && Z[8].at <= 3200, 'pluto at ' + Z[8].at);
  // 짝수 번째 도착은 기념 아치 자리와 겹친다 (아치에 이름이 적힌다)
  assert(Z[2].at % D.MILESTONE.every === 0 && Z[8].at % D.MILESTONE.every === 0, 'arches line up');
  for (let i = 0; i < N * 2 + 5; i++) {
    const d = i * leg;
    assert(zoneAt(d) === i && zoneAt(d - 0.1) === Math.max(0, i - 1) && zoneAt(d + leg - 0.1) === i, 'threshold ' + i);
    const pl = placeOf(i);
    assert(pl.name === names[i % N] && pl.stop === i % N && pl.lap === Math.floor(i / N) + 1, 'place ' + i + ' ' + pl.name);
  }
  assert(zoneAt(0) === 0 && placeOf(N).name === '수성' && placeOf(N).lap === 2 && placeOf(N + 9).name === WX.EXO[0].name, 'second lap');
  const W = empty();
  W.dist = leg - 1;
  run(W, 0.5);
  assert(W.zone === 1 && W.events.includes('zone') && W.fx.some(f => f.kind === 'zone' && f.i === 1), 'zone event');
  const n = W.events.filter(e => e === 'zone').length;
  run(W, 0.5);
  assert(W.events.filter(e => e === 'zone').length === n, 'only once');
  assert(runStats(W).zone === 1, 'run stats zone');
  // 한 판에 여러 바퀴도: 거리와 도착 수가 함께 는다
  const V = empty();
  V.dist = N * leg + 5; run(V, 0.1);
  assert(runStats(V).zone === N && runStats(V).lap === 2, 'lap 2 stats');
  // 외계 행성 구간에서도 도착 글자가 한 번씩 (명왕성 → 꽁꽁 얼음 행성)
  const X = empty();
  X.dist = 9 * leg - 1; run(X, 0.5);
  assert(X.zone === 9 && placeOf(X.zone).id === WX.EXO[0].id && X.fx.some(f => f.kind === 'zone' && f.i === 9), 'exo arrival');
});

test('행성 날씨: 태양계 아홉·외계 여덟 모두 도감의 날씨, 은하 너머는 없음 (그림 전용이라 규칙은 그대로)', () => {
  const Z = D.ZONES, WX = vm.runInContext('WORLDS', ctx);
  for (const z of Z) {
    if (z.id === 'beyond') { assert(z.weather === null, 'beyond has none'); continue; }
    assert(z.weather && z.weather === WX.weatherOf(z.id) && WX.KINDS.indexOf(z.weather.kind) >= 0, 'weather ' + z.id);
    assert(z.weather.amount > 0 && z.weather.amount <= 1 && Math.abs(z.weather.wind) <= 1, 'amount/wind ' + z.id);
  }
  const kinds = new Set(Z.filter(z => z.weather).map(z => z.weather.kind));
  for (const k of ['snow', 'ember', 'rain', 'glass', 'sparkle', 'sand', 'spore', 'aurora', 'bolt', 'haze']) assert(kinds.has(k), 'kind used ' + k);
  // 얼음 행성은 눈, 불 행성은 불씨
  assert(Z.find(z => z.id === 'neptune').weather.kind === 'snow' && Z.find(z => z.id === 'frost').weather.kind === 'snow', 'ice -> snow');
  assert(Z.find(z => z.id === 'mercury').weather.kind === 'ember' && Z.find(z => z.id === 'lava').weather.kind === 'ember', 'fire -> ember');
  assert(D.WEATHER.max >= 60 && D.WEATHER.max <= 90 && D.WEATHER.calm < 1, 'particle cap');
  // 날씨는 길을 바꾸지 않는다: 같은 씨앗이면 날씨 정보를 지워도 같은 줄
  const a = create(7, { wait: 0 }), saved = Z.map(z => z.weather);
  Z.forEach(z => { z.weather = null; });
  const b = create(7, { wait: 0 });
  Z.forEach((z, i) => { z.weather = saved[i]; });
  run(a, 20); run(b, 20);
  assert(a.dist === b.dist && a.obs.length === b.obs.length && a.obs.every((o, i) => o.kind === b.obs[i].kind && o.x === b.obs[i].x), 'same road');
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

test('처음 안내: 옆으로 밀기 → 안내용 문에서 위로 밀기 → 안내용 막대에서 아래로 밀기, 그동안 느려지고 부딪혀도 괜찮다, 한 번만', () => {
  const W = create(3, { tutorial: true, wait: 0 });
  assert(W.tut.step === 'lane', 'lane first');
  run(W, 1);
  assert(W.tut.show === 'lane', 'lane hint');
  move(W, 'right');
  assert(W.tut.step === 'jump' && W.tut.want, 'then jump');
  // 안내용 문·막대가 다가올 때까지 달린다 (부딪혀도 계속). 문 앞에서 뛰고, 막대 앞에서 미끄러진다
  const shown = { jump: false, slide: false }, order = [];
  let slowed = false, slideRows = 0;
  const tutRows = new Set();
  for (let i = 0; i < 120 * 60 && W.tut.step !== 'done'; i++) {
    W.inv = 99;
    tick(W);
    for (const o of W.obs) if (o.tut && !tutRows.has(o.row)) { tutRows.add(o.row); if (o.kind === 'bar') slideRows++; }
    const sh = W.tut.show;
    if (sh === 'jump' || sh === 'slide') {
      if (!shown[sh]) order.push(sh);
      shown[sh] = true;
      if (W.slow < 0.8) slowed = true;
      const kind = sh === 'jump' ? 'gate' : 'bar', T = sh === 'jump' ? D.PLAYER.jumpT : D.PLAYER.slideT;
      const g = W.obs.find(o => o.tut && !o.done && o.x === 1 && o.kind === kind);
      if (g && g.z - W.dist < speed(W) * T * 0.5) {
        if (sh === 'jump' && W.p.y === 0) move(W, 'jump');
        if (sh === 'slide' && W.p.sl <= 0) move(W, 'slide');
      }
    }
  }
  assert(shown.jump && shown.slide && order.join() === 'jump,slide', 'jump then slide hints ' + order.join());
  assert(slowed, 'slowed');
  assert(W.tut.step === 'done' && W.tut.ok && W.tut.jumpOk && W.tut.slideOk && W.events.includes('tutDone'), 'tutorial done');
  assert(slideRows === 1 && W.bars >= 1 && W.slides >= 1, 'slide step once ' + slideRows);
  assert(W.hits === 0, 'no hits from tutorial gate or bar');
  run(W, 2);
  assert(W.slow > 0.97, 'speed back ' + W.slow);
  // 아무것도 안 하면: 하트를 잃지 않고 다시 한 번, 단계마다 tries번 뒤에는 다음 단계로, 마지막엔 끝
  const V = create(4, { tutorial: true, wait: 0, diff: 'hard' });
  move(V, 'left');
  let sawSlide = false;
  for (let i = 0; i < 120 * 150 && V.tut.step !== 'done' && V.phase === 'play'; i++) { V.inv = 99; V.hearts = 1; tick(V); if (V.tut.step === 'slide') sawSlide = true; }
  assert(V.phase === 'play' && V.hits === 0, 'tutorial gate never hurts');
  assert(sawSlide && V.tut.step === 'done' && !V.tut.ok && !V.tut.jumpOk && !V.tut.slideOk && V.tut.tries === D.TUTORIAL.tries, 'gave up after tries ' + V.tut.tries);
  // 안내 없는 판에는 안내용 문·막대가 없다
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

test('메달: 새 메달 (어려움 · 화성 · 아슬아슬 · 완벽한 별길 · 명왕성 · 블랙홀 · 미끄럼), 옛 id는 그대로', () => {
  const rec = { total: { games: 0, stars: 0, dist: 0 } };
  const get = id => D.MEDALS.find(m => m.id === id);
  const W = empty({ diff: 'hard' });
  W.dist = 1300; W.nears = 10; W.perfects = 5;
  const r = runStats(W);
  assert(r.zone === 3 && r.diff === 'hard', 'stats zone ' + r.zone);
  for (const id of ['hard', 'nebula', 'near10', 'perfect5', 'normal']) assert(get(id).check(r, rec), 'medal ' + id);
  assert(!get('nebula').check(runStats(Object.assign(empty(), { dist: D.ZONES[3].at - 1 })), rec), 'mars medal needs mars');
  const E = runStats(Object.assign(empty(), { dist: 1300 }));
  assert(!get('hard').check(E, rec) && !get('normal').check(E, rec), 'easy does not get level medals');
  const far = runStats(Object.assign(empty(), { dist: D.ZONES[8].at + 1, bhPassed: 1, bars: 10 }));
  for (const id of ['pluto', 'bhole', 'slide10']) assert(get(id).check(far, rec), 'medal ' + id);
  // d3000은 명왕성 메달과 똑같았다: 이제 여행의 끝 은하 너머 (id 그대로)
  const beyond = D.ZONES[D.ZONES.length - 1];
  assert(beyond.id === 'beyond' && !get('d3000').check(far, rec), 'd3000 is not the same as pluto');
  assert(get('d3000').check(runStats(Object.assign(empty(), { dist: beyond.at + 1 })), rec) && !get('d3000').check(runStats(Object.assign(empty(), { dist: beyond.at - 1 })), rec), 'd3000 at the galaxy beyond ' + beyond.at);
  assert(get('d3000').desc !== get('pluto').desc && get('d3000').name !== get('pluto').name, 'different words');
  assert(!get('pluto').check(E, rec) && !get('bhole').check(E, rec) && !get('slide10').check(E, rec), 'new medals need their thing');
  // 예전에 딴 메달이 사라지지 않게 옛 id는 모두 남아 있다
  for (const id of ['d500', 'd1500', 'd3000', 's50', 's150', 'gate10', 'shield', 'boost3', 'clean', 'normal', 'hard', 'nebula', 'near10', 'perfect5', 'games10', 'stars1k']) assert(get(id), 'old id ' + id);
  assert(D.MEDALS.length === 20, 'medal count ' + D.MEDALS.length);
});


// ─── 상점 · 미션 (shop.js) ───────────────────────────────────
const SH = RN.Shop;
const memStore = init => { const m = Object.assign({}, init); return { m, get: (k, f) => (k in m ? JSON.parse(JSON.stringify(m[k])) : f), set: (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } }; };
const fakeWallet = c => ({ c, coins() { return this.c; }, setCoins(n) { this.c = n; } });

test('코인 계산: 거리·별·아치·도착한 행성, 난이도 배율, 보통 한 판 20~60개', () => {
  const st = SH.blank();
  const typical = SH.coinsFor({ diff: 'easy', dist: 800, stars: 50, milestones: 3, zone: 2 }, st);
  assert(typical.total >= 20 && typical.total <= 60, 'typical ' + typical.total);
  assert(typical.parts.dist === 20 && typical.parts.stars === 12 && typical.parts.arch === 6 && typical.parts.zone === 10, JSON.stringify(typical.parts));
  const short = SH.coinsFor({ diff: 'easy', dist: 300, stars: 20, milestones: 1, zone: 0 }, st);
  assert(short.total >= 5 && short.total < typical.total, 'short ' + short.total);
  const hard = SH.coinsFor({ diff: 'hard', dist: 800, stars: 50, milestones: 3, zone: 1 }, st);
  assert(hard.total > typical.total && hard.parts.diff > 0, 'hard pays more ' + hard.total);
  st.up.coin = 5;
  const bonus = SH.coinsFor({ diff: 'easy', dist: 800, stars: 50, milestones: 3, zone: 2 }, st);
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
          assert(row.open.length >= 1, 'passable lane ' + c.id);
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


// ─── 상하좌우 네 방향 (2026-09-27: 아래로 밀기 = 미끄러지기, 위쪽 막대) ───
test('미끄러지기: 위쪽 막대는 미끄러지면 지나가고, 뛰거나 그냥 가면 부딪힌다. 레이저 문은 그 반대', () => {
  const P = D.PLAYER;
  const W = empty();
  const b = put(W, 'bar', 1, speed(W) * P.slideT * 0.5);
  assert(move(W, 'slide') && W.p.sl > 0 && W.slides === 1 && W.events.includes('slide'), 'slide starts');
  run(W, P.slideT + 0.3);
  assert(W.hits === 0 && b.under && W.bars === 1 && W.events.includes('bar'), 'slid under the bar');
  assert(W.p.sl === 0, 'slide ends ' + W.p.sl);
  // 뛰면 머리를 콩
  const J = empty();
  put(J, 'bar', 1, speed(J) * P.jumpT * 0.4);
  move(J, 'jump');
  run(J, P.jumpT + 0.3);
  assert(J.hits === 1 && J.bars === 0, 'jumping into a bar hits');
  // 그냥 가도 부딪힌다 · 어려움이면 끝, 까닭은 막대
  const H = empty({ diff: 'hard' });
  put(H, 'bar', 1, 5);
  run(H, 1);
  assert(H.phase === 'over' && H.cause === 'bar', 'bar ends hard game ' + H.cause);
  // 레이저 문은 미끄러져도 부딪힌다 (뛰어야 한다)
  const G = empty();
  put(G, 'gate', 1, speed(G) * P.slideT * 0.5);
  move(G, 'slide');
  run(G, P.slideT + 0.3);
  assert(G.hits === 1 && G.gates === 0, 'sliding into a low gate hits');
  // 옆 줄의 막대는 상관없다
  const X = empty();
  put(X, 'bar', 0, 5); put(X, 'bar', 2, 8);
  run(X, 1.5);
  assert(X.hits === 0, 'bar in another lane');
});

test('미끄러지기 손맛: 떠 있을 때 아래로 밀면 빠르게 내려와 미끄러지고, 미끄러지다 위로 밀면 바로 뛴다', () => {
  const P = D.PLAYER;
  const W = empty();
  move(W, 'jump');
  run(W, P.jumpT * 0.4);
  assert(W.p.y > 1, 'in the air ' + W.p.y);
  assert(move(W, 'slide') && W.p.drop, 'drop');
  run(W, P.jumpH / P.dropV + 0.03);
  assert(W.p.y === 0 && !W.p.drop && W.p.sl > 0 && W.slides === 1, 'dropped and sliding');
  // 바로 뒤의 막대도 지나간다 (점프 → 막대: 뛰는 중에 아래로 밀면 된다)
  const V = empty();
  put(V, 'gate', 1, speed(V) * P.jumpT * 0.5);
  const bar = put(V, 'bar', 1, speed(V) * (P.jumpT * 0.5 + 0.45));
  move(V, 'jump');
  run(V, P.jumpT * 0.5 + 0.1);
  move(V, 'slide');
  run(V, 1);
  assert(V.hits === 0 && V.gates === 1 && bar.under, 'gate then bar ' + V.hits);
  // 미끄러지다 뛰기
  const S = empty();
  move(S, 'slide'); run(S, 0.1);
  assert(S.p.sl > 0 && move(S, 'jump') && S.p.sl === 0 && S.p.jt >= 0, 'jump cancels slide');
  // 뜬 채로 내려오는 중에 위로 밀면 닿자마자 뛴다
  const U = empty();
  move(U, 'jump'); run(U, 0.2); move(U, 'slide'); move(U, 'jump');
  run(U, 0.2);
  assert(U.p.jt >= 0 && U.p.sl === 0 && U.jumps === 2, 'buffered jump after drop');
  // 'down'도 미끄러지기
  const Dn = empty();
  assert(move(Dn, 'down') && Dn.p.sl > 0, 'down = slide');
});

test('쉬움부터 네 방향: 몸풀기(운석 하나·별) 뒤에 레이저 문·위쪽 막대·레이저 벽·막대 벽이 나온다', () => {
  for (const id of D.DIFF_ORDER) {
    const C = D.DIFFICULTY[id];
    for (const t of [C.speed.warm + 1, C.speed.warm + C.speed.ramp + 1]) {
      const W = create(1, { diff: id });
      const ws = RN.World.rowWeights(W, t), g = k => (ws.find(x => x.k === k) || { w: 0 }).w;
      for (const k of ['one', 'gate', 'bar', 'g3', 'b3']) assert(g(k) > 0, id + ' ' + k + ' at ' + t);
    }
  }
  // 실제 줄: 쉬움 첫 2분 안에 문·막대와 벽(레이저 벽이나 막대 벽)이 나온다 (씨앗마다), 모두 합치면 두 벽 다
  const all = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const W = create(seed, { wait: 0 });
    const seen = new Set();
    for (let i = 0; i < 120 * 120; i++) { W.inv = 99; W.hearts = 9; tick(W); if (W.lastRow) { seen.add(W.lastRow.pat); all.add(W.lastRow.pat); } }
    // 문이 든 줄·막대가 든 줄 (한 줄짜리든 둘 섞인 줄이든)
    const has = ks => ks.some(k => seen.has(k));
    assert(has(['gate', 'mg', 'gg', 'gb', 'g3', 'mgb']), 'seed ' + seed + ' no gate in 2 min: ' + [...seen].join());
    assert(has(['bar', 'mb', 'bb', 'gb', 'b3', 'mgb']), 'seed ' + seed + ' no bar in 2 min: ' + [...seen].join());
    assert(seen.has('g3') || seen.has('b3'), 'seed ' + seed + ' no wall in 2 min');
  }
  assert(all.has('g3') && all.has('b3'), 'both walls');
  // 벽 줄: 옆으로만은 못 지나간다
  const W = create(2, { diff: 'normal' });
  W.runT = 1e6;
  let walls = 0;
  for (let i = 0; i < 400; i++) { const row = makeRow(W); if (!row.free.length) { walls++; assert(row.open.length >= 1, 'wall still passable'); } }
  assert(walls > 20, 'walls ' + walls);
});

test('자동 운전: 문에서 뛰고 막대에서 미끄러진다 (쉬움 2분, 거의 안 부딪힘)', () => {
  let gates = 0, bars = 0, slides = 0;
  for (const seed of [4, 12, 21]) {
    const W = create(seed, { auto: true, warp: 0 });   // 워프로 건너뛰는 200m가 없게 (문·막대를 만나는 수를 재는 것이라)
    run(W, 120);
    assert(W.phase === 'play' && W.hits <= 1, 'seed ' + seed + ' hits ' + W.hits);
    gates += W.gates; bars += W.bars; slides += W.slides;
  }
  assert(gates >= 8 && bars >= 8 && slides >= 8, 'gates ' + gates + ' bars ' + bars + ' slides ' + slides);
});

test('옆으로만 피하는 로봇은 쉬움에서도 멀리 못 간다 (다 쓰는 로봇의 절반도 안 됨, 숫자 출력)', () => {
  const lazy = playHuman('easy', 24, 480, { lazy: true });
  const full = HUMAN.easy || playHuman('easy', 24, 480);
  console.log('       쉬움: 네 방향 로봇 평균 ' + full.time.toFixed(0) + '초 · 옆으로만 피하는 로봇 평균 ' + lazy.time.toFixed(0) + '초 (' + Math.round(lazy.dist) + 'm)');
  assert(lazy.time <= full.time * 0.5, 'lazy ' + lazy.time.toFixed(0) + ' vs full ' + full.time.toFixed(0));
});

// ─── 블랙홀 ───
test('도감(worlds.js)을 못 불러와도 태양계 열 곳으로 그대로 돈다', () => {
  const c2 = vm.createContext({ console, Math, Date, JSON });
  for (const f of ['util.js', 'data.js', 'world.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'runner', 'js', f), 'utf8'), c2, { filename: f });
  const R2 = vm.runInContext('RN', c2), Z2 = R2.DATA.ZONES;
  assert(Z2.length === 10 && Z2[8].id === 'pluto' && Z2[9].id === 'beyond' && Z2.every(z => z.weather === null), 'fallback ' + Z2.map(z => z.id).join());
  assert(R2.World.placeOf(10).stop === 0 && R2.World.placeOf(10).lap === 2, 'fallback loop');
});

test('블랙홀 구간: 지구 다음부터, 행성 구간마다 약 15% (두 구간 연달아 없음), 구간 안에 알맞은 길이', () => {
  const B = D.BLACKHOLE, leg = D.ROUTE.leg;
  let eligible = 0, got = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const W = create(seed, { wait: 0 });
    RN.World.planBlackHoles(W, 40 * leg);
    let prev = -9;
    for (const b of W.bhs) {
      assert(RN.World.placeOf(b.leg).stop >= B.from, 'after earth ' + b.leg);
      assert(b.leg !== prev + 1, 'not twice in a row');
      prev = b.leg;
      const len = b.end - b.start;
      assert(len >= B.len[0] && len <= B.len[1], 'len ' + len);
      assert(b.start >= b.leg * leg + B.pad[0] - 1e-9 && b.end <= (b.leg + 1) * leg - B.pad[1] + 1e-9, 'inside its leg');
      assert(b.side === 0 || b.side === 2, 'side');
    }
    for (let k = 0; k < 40; k++) if (RN.World.placeOf(k).stop >= B.from) eligible++;
    got += W.bhs.length;
  }
  const rate = got / eligible;
  console.log('       블랙홀이 나온 행성 구간: ' + (rate * 100).toFixed(1) + '% (연달아 없음 규칙 포함)');
  assert(B.chance >= 0.1 && B.chance <= 0.2 && rate > 0.09 && rate < 0.17, 'rate ' + rate.toFixed(3));
  // 같은 씨앗이면 같은 곳, 블랙홀이 있든 없든 같은 길(줄)이 나온다
  const a = create(9, { bh: 1 }), b = create(9, { bh: 0 });
  RN.World.planBlackHoles(a, 30 * leg); RN.World.planBlackHoles(b, 30 * leg);
  assert(a.bhs.length > 0 && b.bhs.length === 0, 'forced on and off');
  for (let i = 0; i < 50; i++) { const ra = makeRow(a), rb = makeRow(b); assert(ra.pat === rb.pat && ra.z === rb.z, 'same rows'); }
  const c = create(9, { bh: 1 }); RN.World.planBlackHoles(c, 30 * leg);
  assert(JSON.stringify(c.bhs) === JSON.stringify(a.bhs), 'same plan');
});

test('블랙홀은 처음 안내 중에는 나오지 않는다', () => {
  const leg = D.ROUTE.leg;
  const W = create(5, { tutorial: true, bh: 1, wait: 0 });
  RN.World.planBlackHoles(W, 12 * leg);
  assert(W.tut.step !== 'done' && W.bhs.length === 0, 'none while tutorial runs');
  // 안내가 끝난 뒤에 정하는 구간에는 나온다
  W.tut.step = 'done';
  RN.World.planBlackHoles(W, 30 * leg);
  assert(W.bhs.length > 0 && W.bhs.every(b => b.leg >= 12), 'after tutorial');
  // 안내 중에 블랙홀 구간에 있어도 끌어당기지 않는다
  const V = empty({ tutorial: true });
  V.bhs = [{ leg: 3, start: V.dist + 1, end: V.dist + 500, side: 0 }]; V.bhLeg = 1e9;
  run(V, 8);
  assert(V.bh && !V.pull && V.pulls === 0, 'no pull during tutorial');
});

// 블랙홀 구간 하나를 바로 앞에 놓는다 (행성 구간 계획은 멈춘다)
function withHole(W, side, len) {
  W.bhs = [{ leg: 3, start: W.dist + 0.5, end: W.dist + (len || 2000), side }]; W.bhLeg = 1e9;
  return W;
}
test('블랙홀 끌어당기기: 화살표로 알린 뒤 한 줄 끌려가고, 반대로 밀면 버틴다, 끝 줄이면 더 안 끌려간다', () => {
  const B = D.DIFFICULTY.easy.bh;
  const W = withHole(empty(), 0);
  run(W, 0.1);
  assert(W.bh && W.events.includes('bh') && W.fx.some(f => f.kind === 'bh' && f.side === 0), 'entered');
  run(W, B.first);
  assert(W.pull && W.pull.dir === -1 && W.events.includes('pullWarn'), 'warning first');
  assert(W.p.lane === 1, 'not yet pulled during warning');
  run(W, B.warn);
  assert(W.p.lane === 0 && W.pulls === 1 && W.events.includes('pull') && W.laneMoves === 0, 'pulled one lane toward the hole');
  // 반대로 밀면 버틴다 (한 줄 옮겨 가고 끌려가지 않는다)
  run(W, B.every[1] - 0.2);
  assert(W.pull, 'next warning');
  move(W, 'right');
  run(W, W.pull.t + 0.05);
  assert(W.p.lane === 1 && W.resists === 1 && W.pulls === 1 && W.events.includes('resist'), 'resisted');
  // 끝 줄이면 더 안 끌려간다
  const E = withHole(empty(), 2);
  move(E, 'right'); run(E, 0.3);
  run(E, B.first + B.warn + 0.1);
  assert(E.p.lane === 2 && E.pulls === 0 && E.events.includes('pullHold'), 'edge holds');
  // 끝 줄에서 반대로 밀면(더 못 가도) 버틴 것으로 친다
  const F = withHole(empty(), 2);
  move(F, 'left'); run(F, 0.3);
  run(F, B.first + 0.05); move(F, 'left'); run(F, B.warn);
  assert(F.p.lane === 0 && F.resists === 1, 'edge counter-swipe counts');
  // 구간을 빠져나오면 보너스, 블랙홀 탈출 기록
  const G = withHole(empty(), 0, 30);
  run(G, 4);
  assert(!G.bh && G.bhPassed === 1 && G.bonus === D.BLACKHOLE.bonus && runStats(G).bhs === 1, 'passed');
  // 세기: 쉬움은 드물고 알림이 길다, 어려움은 자주, 알림이 짧다
  const e = D.DIFFICULTY.easy.bh, n = D.DIFFICULTY.normal.bh, h = D.DIFFICULTY.hard.bh;
  assert(e.warn > n.warn && n.warn > h.warn && e.every[0] > n.every[0] && n.every[0] > h.every[0], 'strength order');
  assert(e.warn >= 1.2, 'easy gives time to react');
});

test('블랙홀 안전한 줄 약속: 곧 장애물이 닿는 줄로는 끌지 않는다 (세 난이도, 캐릭터마다 실제로 달리며)', () => {
  const leg = D.ROUTE.leg;
  // 한 가지 상황: 끌려갈 줄에 운석이 가까이 있으면 그대로
  const W = withHole(empty(), 0);
  run(W, D.DIFFICULTY.easy.bh.first + 0.05);
  put(W, 'meteor', 0, speed(W) * (W.pull.t + 0.6));
  run(W, W.pull.t + 0.05);
  assert(W.p.lane === 1 && W.pulls === 0 && W.events.includes('pullHold'), 'held because lane 0 is busy');
  let pulls = 0;
  for (const c of D.CHARS) {
    for (const id of D.DIFF_ORDER) {
      const B = D.DIFFICULTY[id].bh;
      for (let seed = 1; seed <= 3; seed++) {
        const V = create(seed, { diff: id, char: c.id, wait: 0, bh: 1 });
        V.runT = 200; V.tut = null;
        // 블랙홀이 있는 곳 가까이로 건너뛴다
        V.obs.length = 0; V.dist = 3 * leg - 40; V.nextZ = V.dist + 50; V.nextArch = Math.ceil(V.dist / 250) * 250; RN.World.fill(V);
        while (V.dist < 9 * leg) {
          V.inv = 99; V.hearts = 9; V.eff.boost = 0;
          tick(V);
          if (V.events.includes('pull')) {
            pulls++;
            assert(RN.World.laneClear(V, V.p.lane, B.safe - 0.02), c.id + ' ' + id + ' pulled into a busy lane at ' + Math.floor(V.dist));
            // 그 뒤로도 모든 줄에 지나갈 줄이 있다 (끌려가도 두 줄 건너갈 시간이 남는다: safe가 두 줄 건너기보다 길다)
            assert(B.safe >= 2 * V.laneT + 0.3, 'safe time ' + B.safe);
          }
          V.events.length = 0; V.fx.length = 0;
        }
      }
    }
  }
  assert(pulls > 30, 'pulls ' + pulls);
});


// ─── 우주 해적선 추격전 ───
// 해적선이 곧 나오게: 1분이 지난 것으로 치고 바로
function pirateSoon(W) { W.runT = Math.max(W.runT, D.PIRATE.minT + 1); W.pirT = 0; return W; }
test('우주 해적선: 처음 1분·처음 안내·블랙홀 구간에는 안 나온다, 쉬움이 가장 드물고 알림이 길다', () => {
  const E = D.DIFFICULTY.easy.pirate, N = D.DIFFICULTY.normal.pirate, H = D.DIFFICULTY.hard.pirate;
  assert(E.every[0] > N.every[0] && N.every[0] > H.every[0] && E.first[0] >= N.first[0], 'easy rarer');
  assert(E.warn > N.warn && N.warn > H.warn && E.warn >= 1.2, 'warning order');
  for (const C of [E, N, H]) assert(C.first[0] >= D.PIRATE.minT, 'not in the first minute');
  // 처음 1분에는 안 나온다
  const W = create(3, { wait: 0, pirateAt: 5 });
  let first = -1;
  for (let i = 0; i < 120 * 70 && first < 0; i++) { W.inv = 99; W.hearts = 9; tick(W); if (W.pir) first = W.runT; }
  assert(first >= D.PIRATE.minT && first < D.PIRATE.minT + 1, 'appears right after a minute ' + first.toFixed(1));
  assert(W.events.includes('pirate') && W.fx.some(f => f.kind === 'pirate'), 'banner');
  // 처음 안내 중에는 안 나온다
  const T = pirateSoon(create(4, { wait: 0, tutorial: true }));
  for (let i = 0; i < 120 * 5; i++) { T.inv = 99; tick(T); }
  assert(!T.pir && T.tut.step !== 'done', 'not during tutorial');
  // 블랙홀 구간이 앞에 있으면 안 나오고, 없어지면 나온다
  const B = pirateSoon(create(5, { wait: 0 }));
  B.bhs = [{ leg: 9, start: B.dist + 80, end: B.dist + 300, side: 0 }]; B.bhLeg = 1e9;
  for (let i = 0; i < 120 * 2; i++) { B.inv = 99; tick(B); }
  assert(!B.pir, 'no pirate before a black hole');
  B.bhs = [];
  for (let i = 0; i < 120; i++) { B.inv = 99; tick(B); }
  assert(B.pir, 'pirate once the way is clear');
  // 해적선이 있는 동안 정하는 블랙홀 구간은 해적선이 지나갈 거리와 겹치지 않는다
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const V = pirateSoon(create(seed, { wait: 0, bh: 1 }));
    V.bhs = []; V.bhLeg = Math.floor(V.dist / D.ROUTE.leg);
    tick(V);
    assert(V.pir, 'pirate up');
    const from = V.dist;
    RN.World.planBlackHoles(V, V.pirGuard + 2000);
    for (const b of V.bhs) { checked++; assert(b.start >= V.pirGuard || b.end <= from, 'hole overlaps pirate'); }
  }
  assert(checked > 20, 'holes checked ' + checked);
});

test('해적 레이저: 줄을 빛내 알린 뒤 쏜다. 그 줄에 있으면 부딪히고, 옆 줄로 피하면 괜찮다. 피할 옆 줄이 없으면 안 쏜다', () => {
  const C = D.DIFFICULTY.hard.pirate;
  const W = pirateSoon(empty({ diff: 'hard' }));
  W.pir = null;
  tick(W);
  assert(W.pir && !W.pir.laser, 'pirate, no laser yet');
  let i = 0;
  while (!W.pir.laser && i++ < 120 * 5) tick(W);
  const Z = W.pir.laser;
  assert(Z && Z.phase === 'warn' && Z.lane === W.p.lane && W.events.includes('laserWarn'), 'aims at the ship with a warning');
  run(W, C.warn - 0.05);
  assert(W.phase === 'play' && W.hits === 0, 'warning does not hurt');
  run(W, 0.3);
  assert(W.phase === 'over' && W.cause === 'laser', 'beam hits ' + W.cause);
  // 옆 줄로 피하면 괜찮다
  const V = pirateSoon(empty({ diff: 'hard' }));
  tick(V);
  while (!V.pir.laser) tick(V);
  move(V, 'left');
  run(V, C.warn + C.beam + 0.1);
  assert(V.phase === 'play' && V.hits === 0 && V.lasers === 1 && !V.pir.laser, 'dodged');
  // 피할 줄이 없으면 쏘지 않는다
  const X = pirateSoon(empty({ diff: 'hard' }));
  for (const l of [0, 1, 2]) put(X, 'meteor', l, 10);
  assert(RN.World.pickLaserLane(X, C.warn + C.beam) === -1, 'no safe lane, no shot');
  X.obs.length = 0;
  put(X, 'meteor', 0, 10); put(X, 'meteor', 2, 10);
  const l = RN.World.pickLaserLane(X, C.warn + C.beam);
  assert(l === 0 || l === 2, 'only shoots where the ship can stay safe: ' + l);
});

test('해적선을 따돌리면 보너스 + 별 소나기, 기록(pirates)과 메달·미션·스티커 값', () => {
  const W = pirateSoon(create(8, { wait: 0, auto: true }));
  W.nextZ = W.dist + 40;
  run(W, 0.1);
  assert(W.pir, 'pirate up');
  const b0 = W.bonus;
  for (let i = 0; i < 120 * (D.PIRATE.dur + 2) && W.pir; i++) { W.inv = Math.max(W.inv, 0); tick(W); }
  assert(!W.pir && W.pirates === 1 && W.events.includes('pirOut') && W.bonus >= b0 + D.PIRATE.bonus, 'escaped ' + W.pirates);
  assert(W.shower > 0, 'star shower');
  run(W, 1);
  assert(W.obs.some(o => o.rain), 'stars fall');
  assert(W.phase === 'play', 'autopilot survived the pirate');
  const r = runStats(W), ro = SH.runOf(W);
  assert(r.pirates === 1 && ro.pirates === 1 && r.planet >= 1 && r.planet <= 9, 'stats');
  assert(D.MEDALS.find(m => m.id === 'pirate').check(r, {}) && D.MISSIONS.some(m => m.stat === 'pirates'), 'medal and mission');
  // 가장 멀리 간 행성: 1 수성 ~ 9 명왕성 (더 가도 9)
  const at = d => runStats(Object.assign(empty(), { dist: d })).planet;
  assert(at(10) === 1 && at(D.ZONES[5].at + 1) === 6 && at(D.ZONES[8].at + 1) === 9 && at(D.ZONES[9].at + 1) === 9 && at(99999) === 9, 'planet index');
});

test('해적선 안전한 줄 약속: 레이저를 쏠 때마다 바로 옆(또는 제자리)에 비어 있는 줄, 폭탄은 다른 장애물과 떨어져서 (세 난이도, 캐릭터마다, 가장 어렵게 맞춘 난이도까지)', () => {
  let shots = 0, bombs = 0, pirates = 0;
  for (const c of D.CHARS) {
    for (const id of D.DIFF_ORDER) {
      const C = D.DIFFICULTY[id].pirate;
      for (const adapt of [1, D.ADAPT.max]) {
        const W = create(11 + shots % 7, { diff: id, char: c.id, wait: 0, adapt, bh: 0 });
        W.runT = D.PIRATE.minT + 1;
        for (let i = 0; i < 120 * 40; i++) {
          if (!W.pir && W.pirT > 1) W.pirT = 1;
          W.inv = 99; W.hearts = 9; W.eff.boost = 0;
          const had = W.pir && W.pir.laser;
          tick(W);
          if (W.events.includes('pirate')) pirates++;
          const Z = W.pir && W.pir.laser;
          if (Z && Z !== had) {
            shots++;
            const p = Z.from, sec = C.warn + C.beam;
            const ok = [0, 1, 2].some(q => q !== Z.lane && Math.abs(q - p) <= 1 && RN.World.laneClear(W, q, sec));
            assert(ok, c.id + ' ' + id + ' laser without a safe lane');
          }
          if (W.events.includes('bomb')) {
            bombs++;
            // 방금 떨어진 폭탄 (같은 칸에 새 줄이 뒤에 붙을 수 있어 맨 끝이 아닐 수도 있다)
            const b = W.obs.filter(o => o.kind === 'bomb' && o.born === W.t).pop(), gap = speed(W) * D.PIRATE.bombGap;
            assert(b && b.z - W.dist >= speed(W) * 1.4, 'bomb far enough');
            for (const o of W.obs) if (o !== b && !o.done && ['meteor', 'gate', 'bar', 'bomb'].includes(o.kind) && Math.round(o.x) === b.x) assert(Math.abs(o.z - b.z) >= gap, 'bomb too close to ' + o.kind);
          }
          W.events.length = 0; W.fx.length = 0;
        }
      }
    }
  }
  console.log('       해적선 ' + pirates + '번 · 레이저 ' + shots + '번 · 폭탄 ' + bombs + '개 모두 피할 줄 있음');
  assert(shots > 100 && bombs > 50, 'shots ' + shots + ' bombs ' + bombs);
});

// ─── 알아서 맞춰 주는 난이도 ───
test('알아서 맞춰 주는 난이도: 1이면 그대로, 크면 조금 빠르고 촘촘하고 해적선이 자주, 작으면 그 반대 (0.85 ~ 1.12로 묶임)', () => {
  const A = D.ADAPT;
  assert(A.min === 0.85 && A.max === 1.12, 'range');
  assert(create(1).adapt === 1 && !create(1).C, 'default 1');
  assert(create(1, { adapt: 5 }).adapt === A.max && create(1, { adapt: 0.1 }).adapt === A.min && create(1, { adapt: 'x' }).adapt === 1, 'clamped');
  for (const id of D.DIFF_ORDER) {
    const B = D.DIFFICULTY[id], hi = RN.World.cfg(create(1, { diff: id, adapt: A.max })), lo = RN.World.cfg(create(1, { diff: id, adapt: A.min }));
    assert(hi.speed.max > B.speed.max && lo.speed.max < B.speed.max && hi.speed.max < B.speed.max * 1.06, id + ' speed subtle');
    assert(hi.speed.ramp < B.speed.ramp && lo.speed.ramp > B.speed.ramp, id + ' ramp');
    assert(hi.gap.end[0] < B.gap.end[0] && lo.gap.end[0] > B.gap.end[0] && hi.gap.end[0] > B.gap.end[0] * 0.9, id + ' gap subtle');
    assert(hi.rows.end.two > B.rows.end.two && hi.rows.end.one < B.rows.end.one, id + ' mix');
    assert(hi.pirate.every[0] < B.pirate.every[0] && lo.pirate.every[0] > B.pirate.every[0] && hi.pirate.first[0] >= D.PIRATE.minT, id + ' pirate');
    assert(hi.hearts === B.hearts && B.speed.max === D.DIFFICULTY[id].speed.max, id + ' original untouched');
    // 난이도 순서는 그대로: 쉬움을 가장 어렵게 맞춰도 보통을 가장 쉽게 맞춘 것보다 느리다
  }
  const eHi = RN.World.cfg(create(1, { diff: 'easy', adapt: A.max })), nLo = RN.World.cfg(create(1, { diff: 'normal', adapt: A.min }));
  assert(eHi.speed.max < nLo.speed.max && eHi.gap.end[0] > nLo.gap.end[0], 'levels stay in order');
});

test('알아서 맞춰 주는 난이도: 가장 어렵게(1.12) 맞춰도 빈 줄 약속과 두 줄 건너갈 시간 (세 난이도, 캐릭터마다, 가장 빠를 때와 달리며)', () => {
  for (const c of D.CHARS) {
    for (const id of D.DIFF_ORDER) {
      for (let seed = 1; seed <= 6; seed++) {
        const W = create(seed, { diff: id, char: c.id, adapt: D.ADAPT.max });
        W.runT = 1e6;
        const vmax = RN.World.cfg(W).speed.max, need = 2 * W.laneT + 0.1;
        let prev = null;
        for (let i = 0; i < 60; i++) {
          const row = makeRow(W);
          assert(row.open.length >= 1, 'passable lane');
          if (prev) { const sec = (row.z - prev.z - 2 * D.PLAYER.hitZ) / vmax; assert(sec >= need, c.id + ' ' + id + ' gap ' + sec.toFixed(2)); }
          prev = row;
        }
      }
    }
  }
  for (const id of D.DIFF_ORDER) {
    const W = create(3, { diff: id, wait: 0, adapt: D.ADAPT.max });
    const C = RN.World.cfg(W), seen = new Map();
    let worst = 99;
    while (W.runT < C.speed.warm + C.speed.ramp + 20) {
      W.inv = 99; W.hearts = 9; W.eff.boost = 0;
      tick(W);
      for (const o of W.obs) if (o.row != null && ['meteor', 'gate', 'bar'].includes(o.kind) && !seen.has(o.row)) seen.set(o.row, o.z);
      const zs = [...seen.values()].filter(z => z > W.dist - 1 && z < W.dist + 60).sort((a, b) => a - b);
      if (zs.length >= 2 && zs[0] - W.dist < 1) worst = Math.min(worst, (zs[1] - zs[0] - 2 * D.PLAYER.hitZ) / speed(W));
    }
    assert(worst >= MIN_ROW_SEC, id + ' adapt max worst ' + worst.toFixed(2));
  }
});

test('알아서 맞춰 주는 난이도: 사람 같은 로봇이 쉽게 맞춘 판(0.85)에서 더 오래, 어렵게 맞춘 판(1.12)에서 덜 간다, 차이는 살짝 (보통, 숫자 출력)', () => {
  const lo = playHuman('normal', 24, 480, null, { adapt: D.ADAPT.min }), mid = playHuman('normal', 24, 480), hi = playHuman('normal', 24, 480, null, { adapt: D.ADAPT.max });
  console.log('       보통: 0.85배 ' + lo.time.toFixed(0) + '초 · 1배 ' + mid.time.toFixed(0) + '초 · 1.12배 ' + hi.time.toFixed(0) + '초');
  assert(lo.time >= mid.time * 0.97 && lo.time > hi.time * 1.1 && mid.time > hi.time, 'easier when lower');
  assert(hi.time > mid.time * 0.6 && lo.time < mid.time * 1.6, 'subtle');
  // 성적 기준: 보통 잘하는 아이 = 1 (서툰 아이 로봇보다 멀고, 사람 같은 로봇보다 가깝다)
  const T = D.ADAPT.target;
  assert(T.easy > T.normal && T.normal > T.hard, 'targets by level');
  assert(mid.dist / T.normal > 1 && mid.dist / T.normal < 2.5, 'normal perf of the human bot ' + (mid.dist / T.normal).toFixed(2));
});


// ─── 깜짝 선물 상자 · 피버 타임 · 워프 관문 (2026-09-27) ───
const GF = D.GIFT, FV = D.FEVER, WP = D.WARP;
// 우주선 앞 물체가 dz m 안으로 올 때까지 달린다
function runTo(W, o, dz) { for (let i = 0; i < 120 * 20 && W.phase === 'play' && o.z - W.dist > dz; i++) tick(W); }

test('깜짝 선물 상자: 처음 35~55초, 그 뒤 60~100초마다. 처음 안내·해적선·블랙홀 근처에는 안 놓이고, 선물이 앞에 있으면 해적선이 기다린다', () => {
  for (let seed = 1; seed <= 40; seed++) { const W = create(seed); assert(W.giftT >= GF.first[0] && W.giftT <= GF.first[1], 'first ' + W.giftT); }
  let gifts = 0, pir = 0;
  for (const id of D.DIFF_ORDER) {
    for (let seed = 1; seed <= 4; seed++) {
      const W = create(seed, { diff: id, wait: 0, bh: 1, pirateAt: 61, warp: 0 });   // 워프가 앞의 선물을 치우면 곧 다시 나오므로 간격은 워프 없이 잰다
      let lastAt = -1, firstAt = -1;
      while (W.runT < 420 && W.phase === 'play') {
        W.inv = 99; W.hearts = 9;
        tick(W);
        if (W.events.includes('giftHere')) {
          gifts++;
          const g = W.obs.filter(o => o.kind === 'gift').pop();
          assert(!W.pir && W.pirGuard == null, id + ' gift during pirate');
          assert(!W.bhs.some(b => g.z > b.start - GF.bhPad && g.z < b.end + GF.bhPad), id + ' gift near a black hole at ' + Math.floor(g.z));
          if (firstAt < 0) { firstAt = W.runT; assert(firstAt >= GF.first[0] - 0.01, 'first gift at ' + firstAt.toFixed(1)); }
          if (lastAt >= 0) assert(W.runT - lastAt >= GF.every[0] - 0.01, id + ' gifts too close: ' + (W.runT - lastAt).toFixed(1));
          lastAt = W.runT;
        }
        if (W.events.includes('pirate')) pir++;
        if (W.pir) assert(!W.obs.some(o => !o.done && (o.kind === 'gift' || o.kind === 'warp') && o.z > W.dist + 1), id + ' gift or warp gate ahead during a pirate chase');
        if (W.bh) assert(!W.obs.some(o => !o.done && o.kind === 'gift' && o.z >= W.bh.start && o.z < W.bh.end), 'gift inside a black hole');
        W.events.length = 0; W.fx.length = 0;
      }
    }
  }
  assert(gifts >= 30 && pir >= 5, 'gifts ' + gifts + ' pirates ' + pir);
  // 처음 안내 중에는 시계가 멈추고 선물도 없다
  const T = create(3, { tutorial: true, wait: 0 });
  T.giftT = 0;
  for (let i = 0; i < 120 * 20 && T.tut.step !== 'done'; i++) { T.inv = 99; tick(T); assert(!T.giftReady && !T.obs.some(o => o.kind === 'gift'), 'no gift in tutorial'); }
});

test('선물 상자 안전한 줄 약속: 빈 줄 바닥 · 문 위(뛰어서) · 빈 줄 높이(뛰어서) · 막대 밑(미끄러져서)만, 그 줄에는 늘 빈 줄이 따로 있다 (세 난이도, 캐릭터마다, 가장 어렵게 맞춘 난이도까지)', () => {
  const seen = { lane: 0, gate: 0, high: 0, bar: 0 };
  for (const c of D.CHARS) {
    for (const id of D.DIFF_ORDER) {
      for (const adapt of [1, D.ADAPT.max]) {
        for (let seed = 1; seed <= 4; seed++) {
          const W = create(seed, { diff: id, char: c.id, adapt });
          W.runT = 1e6;
          const vmax = RN.World.cfg(W).speed.max, need = 2 * W.laneT + 0.1;
          let prev = null;
          for (let i = 0; i < 60; i++) {
            W.giftReady = true;
            const row = makeRow(W);
            assert(row.open.length >= 1, 'passable lane');
            if (prev) assert((row.z - prev.z - 2 * D.PLAYER.hitZ) / vmax >= need, 'gap with gifts');
            prev = row;
            const g = W.obs.find(o => o.kind === 'gift' && o.row === row.id);
            if (!g) continue;
            assert(row.free.length >= 1, 'gift row keeps a free lane: ' + row.pat);
            const k = row.lanes[g.x];
            assert(k !== 'meteor' && k !== 'mover', 'gift on a meteor lane');
            if (k === 'gate') { assert(g.need === 'jump' && g.y > D.OBST.gateH + 0.5, 'gift over a gate needs a jump'); seen.gate++; }
            else if (k === 'bar') { assert(g.need === 'slide' && g.y < D.OBST.barLo, 'gift under a bar needs a slide'); seen.bar++; }
            else if (g.need === 'jump') seen.high++;
            else { assert(g.need === '', 'plain gift'); seen.lane++; }
            if (row.item) assert(W.obs.find(o => o.kind === 'item' && o.row === row.id).x !== g.x, 'gift and item in different lanes');
          }
        }
      }
    }
  }
  assert(seen.lane > 50 && seen.gate > 10 && seen.high > 5 && seen.bar > 10, JSON.stringify(seen));
});

test('선물 상자 줍기: 바닥 선물은 지나가면, 문 위 선물은 뛰어서, 막대 밑 선물은 미끄러져서. 알맞게 하면 안 부딪힌다', () => {
  // 바닥
  let W = empty(); W.giftT = 1e9;
  put(W, 'gift', 1, 8, { y: GF.y, need: '' });
  run(W, 1.2);
  assert(W.gifts === 1 && W.hits === 0 && W.events.includes('gift'), 'plain gift');
  // 문 위: 안 뛰면 문에 걸리고 선물도 못 먹는다
  W = empty(); W.giftT = 1e9;
  put(W, 'gate', 1, 8); put(W, 'gift', 1, 8, { y: GF.jumpY, need: 'jump' });
  run(W, 1.2);
  assert(W.gifts === 0 && W.hits === 1, 'no jump: hit gate, no gift');
  W = empty(); W.giftT = 1e9;
  const g1 = put(W, 'gift', 1, 8, { y: GF.jumpY, need: 'jump' }); put(W, 'gate', 1, 8);
  runTo(W, g1, speed(W) * 0.3); move(W, 'jump'); run(W, 1);
  assert(W.gifts === 1 && W.hits === 0 && W.gates === 1, 'jump: gift and gate');
  // 빈 줄 높이: 안 뛰면 그냥 지나가고(안 부딪힘), 뛰면 먹는다
  W = empty(); W.giftT = 1e9;
  put(W, 'gift', 1, 8, { y: GF.jumpY, need: 'jump' });
  run(W, 1.2);
  assert(W.gifts === 0 && W.hits === 0, 'high gift: missing is fine');
  // 막대 밑: 미끄러지면 먹고 안 부딪힌다, 그냥 가면 막대에 콩
  W = empty(); W.giftT = 1e9;
  const g2 = put(W, 'gift', 1, 8, { y: GF.slideY, need: 'slide' }); put(W, 'bar', 1, 8);
  runTo(W, g2, speed(W) * 0.3); move(W, 'slide'); run(W, 1);
  assert(W.gifts === 1 && W.hits === 0 && W.bars === 1, 'slide: gift and bar');
  W = empty(); W.giftT = 1e9;
  put(W, 'gift', 1, 8, { y: GF.slideY, need: 'slide' }); put(W, 'bar', 1, 8);
  run(W, 1.2);
  assert(W.gifts === 0 && W.hits === 1, 'no slide: bar, no gift');
});

test('선물: 코인(15~40, 판이 끝날 때 받는 코인에 더해짐) · 바로 쓰는 아이템 · 다음 판 시작 아이템 (가득이면 코인)', () => {
  const kinds = {}, items = {};
  for (let seed = 1; seed <= 80; seed++) {
    const W = empty({ diff: seed % 3 === 0 ? 'hard' : 'easy' });
    W.grand = RN.rng(seed * 7919 + 1);   // empty()는 늘 같은 씨앗이라 선물 난수만 바꾼다
    W.shield = seed % 2 === 0;
    const hadShield = W.shield;
    const got = RN.World.takeGift(W, { x: 1, z: W.dist, y: GF.y });
    kinds[got.kind] = (kinds[got.kind] || 0) + 1;
    if (got.kind === 'coins') assert(got.n >= GF.coins[0] && got.n <= GF.coins[1] && W.giftCoins === got.n, 'coins ' + got.n);
    if (got.kind === 'power') {
      assert(GF.powers.includes(got.item) && !(hadShield && got.item === 'shield'), 'power ' + got.item);
      assert(got.item === 'shield' ? W.shield : W.eff[got.item] > 0, 'power applied');
    }
    if (got.kind === 'item') { items[got.id] = true; assert(D.START_ITEMS.some(it => it.id === got.id) && W.giftItems[0] === got.id, 'item ' + got.id); if (W.diff === 'hard') assert(got.id !== 'sheart', 'no heart start item on hard'); }
    assert(W.gifts === 1 && W.fx.some(f => f.kind === 'gift'), 'counted and shown');
  }
  assert(kinds.coins > kinds.power && kinds.power > 5 && kinds.item > 5, JSON.stringify(kinds));
  // 코인 흐름: 선물 코인은 배율 없이 그대로, 판 요약·결과 화면 부분에 '선물'
  const W = empty({ diff: 'normal' });
  W.dist = 800; W.stars = 40; W.giftCoins = 25; W.gifts = 2; W.giftItems = ['sboost', 'sshield'];
  const run1 = SH.runOf(W);
  assert(run1.giftCoins === 25 && run1.gifts === 2 && run1.giftItems.length === 2, 'runOf');
  const base = SH.coinsFor(Object.assign({}, run1, { giftCoins: 0 }));
  const c = SH.coinsFor(run1);
  assert(c.parts.gift === 25 && c.total === base.total + 25, 'gift coins added: ' + c.total + ' vs ' + base.total);
  const st = SH.blank(); st.items.sshield = 3;   // 방패 출발은 가득
  const r = SH.finishRun(st, run1);
  assert(st.items.sboost === 1 && st.items.sshield === 3, 'start item given (full one not)');
  assert(r.parts.gift === 25 + GF.fullCoins && r.coins === c.total + GF.fullCoins && st.coins === r.coins, 'full item becomes coins: ' + r.coins);
  const s = runStats(W);
  assert(s.gifts === 2 && s.fevers === 0 && s.warps === 0, 'runStats');
});

test('피버 타임: 별·완벽한 별길·아슬아슬로 게이지가 차고, 가득 차면 10초 동안 별 점수 2배, 끝나면 원래대로 (피버 중·처음 안내 중에는 안 참)', () => {
  const W = empty(); W.giftT = 1e9;
  // 별 한 줄(5개)을 다 먹는다
  const line = { n: 5, got: 0 };
  for (let i = 0; i < 5; i++) put(W, 'star', 1, 6 + i * 1.5, { y: 0.5, line });
  run(W, 1.5);
  const want = 5 * FV.star + (5 - FV.chainFrom + 1) * FV.chain + FV.perfect;
  assert(W.stars === 5 && W.perfects === 1 && Math.abs(W.feverM - want) < 1e-9, 'meter ' + W.feverM + ' want ' + want);
  // 가득 차기 직전 → 별 하나로 피버
  W.feverM = 0.999;
  put(W, 'star', 1, 5, { y: 0.5 });
  run(W, 0.6);
  assert(W.fever > FV.dur - 0.6 && W.fevers === 1 && W.feverM === 0 && W.events.includes('fever'), 'fever on ' + W.fever);
  // 피버 중: 별 하나 = 20점, 게이지는 그대로
  const b0 = W.bonus, s0 = W.stars;
  put(W, 'star', 1, 5, { y: 0.5 });
  run(W, 0.6);
  assert(W.stars === s0 + 1 && W.bonus - b0 === D.STAR.value * (FV.mul - 1), 'double stars: +' + (W.bonus - b0));
  assert(W.feverM === 0, 'meter does not fill during fever');
  run(W, FV.dur);
  assert(W.fever === 0 && W.events.includes('feverEnd'), 'fever ends after ' + FV.dur + 's');
  const b1 = W.bonus;
  put(W, 'star', 1, 5, { y: 0.5 });
  run(W, 0.6);
  assert(W.bonus === b1 && W.feverM > 0, 'normal again');
  // 아슬아슬도 채운다
  const N = empty(); N.giftT = 1e9;
  put(N, 'meteor', 1, 3);
  move(N, 'right');
  run(N, 1);
  assert(N.nears === 1 && Math.abs(N.feverM - FV.near) < 1e-9, 'near fills ' + N.feverM);
  // 처음 안내 중에는 안 찬다
  const T = create(1, { tutorial: true });
  RN.World.feverAdd(T, 2);
  assert(T.fever === 0 && T.feverM === 0, 'no fever in tutorial');
  const st = runStats(Object.assign(W, {}));
  assert(st.fevers === 1, 'fevers in runStats');
});

test('피버 타임: 빈 줄마다 별 한 줄 더, 처음 별 소나기는 부딪히는 것이 없는 곳에만 (세 난이도)', () => {
  for (const id of D.DIFF_ORDER) {
    const W = create(5, { diff: id, wait: 0 });
    W.runT = 50;
    RN.World.startFever(W);
    W.fever = 1e3;   // 앞으로 만들 줄이 모두 피버 중에 닿게
    let rows = 0;
    for (let i = 0; i < 12; i++) {
      const row = makeRow(W);
      if (row.pat === 'stars' || !row.free.length) continue;
      for (const l of row.free) assert(W.obs.some(o => o.kind === 'star' && o.row === row.id && o.x === l), id + ' fever stars in free lane ' + l + ' of ' + row.pat);
      rows++;
    }
    assert(rows >= 2, id + ' rows ' + rows);
    // 별 소나기: 실제로 달리며
    const V = create(9, { diff: id, wait: 0 });
    for (let i = 0; i < 120 * 20; i++) { V.inv = 99; V.hearts = 9; tick(V); }
    RN.World.startFever(V);
    let rain = 0;
    const known = new Set(V.obs);
    for (let i = 0; i < 120 * FV.rain; i++) {
      V.inv = 99; V.hearts = 9; tick(V);
      for (const o of V.obs) {
        if (known.has(o)) continue;
        known.add(o);
        if (!o.rain) continue;
        rain++;
        for (const q of V.obs) if (!q.done && ['meteor', 'gate', 'bar', 'bomb'].includes(q.kind) && Math.abs(q.z - o.z) < 4 && (q.moving ? [q.from, q.to].includes(o.x) : Math.round(q.x) === o.x)) assert(false, id + ' rain star next to a ' + q.kind);
      }
    }
    assert(rain >= 5, id + ' rain ' + rain);
  }
});

test('워프 관문: 행성 구간마다 약 80% (수성 구간은 없음), 빈 줄에만, 그 줄의 안전한 줄 약속은 그대로. 해적선·블랙홀·처음 안내 중에는 없음', () => {
  let legs = 0, warps = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const W = create(seed, { bh: 0 });
    W.runT = 1e6;
    const byLeg = {};
    while (W.nextZ < 12 * D.ROUTE.leg) {
      const row = makeRow(W);
      assert(row.open.length >= 1, 'passable');
      const g = W.obs.find(o => o.kind === 'warp' && o.row === row.id);
      if (!g) continue;
      assert(row.free.indexOf(g.x) >= 0, 'warp gate stands in a free lane');
      const k = Math.floor(g.z / D.ROUTE.leg);
      assert(k >= WP.from && !byLeg[k], 'one per leg from leg ' + WP.from);
      byLeg[k] = true;
      const into = g.z - k * D.ROUTE.leg;
      assert(into >= WP.pos[0] && into <= WP.pos[1] + WP.slack, 'position in leg ' + into.toFixed(0));
    }
    legs += 11; warps += Object.keys(byLeg).length;
  }
  const rate = warps / legs;
  assert(rate > WP.chance - 0.15 && rate <= WP.chance + 0.1, 'warp rate ' + rate.toFixed(2));
  // 해적선 · 처음 안내 · 블랙홀 중에는 없다
  const P0 = create(2, { bh: 0 }); P0.runT = 1e6; P0.pir = { t: 99 };
  for (let i = 0; i < 200; i++) makeRow(P0);
  assert(!P0.obs.some(o => o.kind === 'warp'), 'no warp during a pirate chase');
  const T0 = create(2, { tutorial: true, bh: 0 }); T0.runT = 1e6;
  for (let i = 0; i < 200; i++) makeRow(T0);
  assert(!T0.obs.some(o => o.kind === 'warp'), 'no warp during the tutorial');
  const B0 = create(2, { bh: 0 }); B0.runT = 1e6;
  B0.bhs = [{ leg: 0, start: 0, end: 1e6, side: 0 }]; B0.bhLeg = 1e9;
  for (let i = 0; i < 200; i++) makeRow(B0);
  assert(!B0.obs.some(o => o.kind === 'warp'), 'no warp near a black hole');
});

test('워프: 고리 문을 지나면 2초 동안 장애물 없는 터널로 200m 앞으로 (+50점), 행성을 넘으면 도착 글자, 놓쳐도 괜찮다 (세 난이도, 실제로 달리며)', () => {
  for (const id of D.DIFF_ORDER) {
    const W = create(7, { diff: id, wait: 0, bh: 0 });
    for (let i = 0; i < 120 * 12; i++) { W.inv = 99; W.hearts = 9; tick(W); }
    W.inv = 0; W.hearts = 9; W.shield = false; W.eff.boost = 0;
    // 지금 줄 바로 앞에 워프 관문 (그 자리 장애물은 치운다)
    W.obs = W.obs.filter(o => !(Math.abs(o.z - (W.dist + 4)) < 3 && Math.round(o.x) === W.p.lane));
    const zone0 = W.zone, leg = D.ROUTE.leg;
    W.dist = Math.max(W.dist, (zone0 + 1) * leg - 120);   // 워프 중에 다음 행성으로 넘어가게
    W.pdist = W.dist;
    W.obs = W.obs.filter(o => o.kind !== 'arch');
    put(W, 'warp', W.p.lane, 3);
    const b0 = W.bonus, hits0 = W.hits;
    let from = -1, zoneEv = false;
    for (let i = 0; i < 120 * 4 && W.phase === 'play'; i++) {
      tick(W);
      if (W.events.includes('warp')) from = W.warp.from;
      if (W.events.includes('zone')) zoneEv = true;
      if (W.warp) {
        // 터널 안: 부딪히는 것이 하나도 없다 (나온 뒤 clear m까지)
        assert(!W.obs.some(o => !o.done && ['meteor', 'gate', 'bar', 'bomb'].includes(o.kind) && o.z > W.dist - D.PLAYER.hitZ && o.z < W.warp.to + WP.clear), id + ' obstacle inside the warp');
        assert(W.nextZ >= W.warp.to + WP.clear - 1e-6, 'rows resume after the landing');
      }
      W.events.length = 0; W.fx.length = 0;
      if (from >= 0 && !W.warp) break;
    }
    assert(from >= 0 && W.warps === 1, id + ' warped');
    assert(W.dist >= from + WP.dist && W.dist < from + WP.dist + 3, id + ' jumped ' + (W.dist - from).toFixed(1) + 'm');
    assert(W.bonus - b0 >= WP.bonus && W.hits === hits0, id + ' bonus and no hits');
    assert(zoneEv && W.zone === zone0 + 1, id + ' planet banner after crossing');
    assert(W.clean >= WP.dist, 'distance counts for the clean-run mission');
  }
  // 놓친 워프: 아무 일 없다
  const M = empty(); M.giftT = 1e9;
  put(M, 'warp', 0, 5);
  run(M, 1.5);
  assert(M.warps === 0 && !M.warp && M.hits === 0 && M.phase === 'play', 'missed warp is fine');
});

test('선물·피버·워프가 있어도 같은 씨앗이면 같은 길, 주사율이 달라도 같은 결과', () => {
  const a = create(4242, { easy: false, auto: true }), b = create(4242, { easy: false, auto: true });
  run(a, 150); run(b, 150);
  assert(a.gifts + a.warps + a.fevers > 0, 'something happened');
  assert([a.dist, a.stars, a.gifts, a.warps, a.fevers, a.score].join() === [b.dist, b.stars, b.gifts, b.warps, b.fevers, b.score].join(), 'same seed same run');
  const res = [60, 90, 144].map(hz => {
    const W = create(99, { auto: true });
    for (let i = 0; i < hz * 150; i++) step(W, 1 / hz);
    return [W.ticks, W.dist.toFixed(6), W.stars, W.gifts, W.warps, W.fevers, W.score].join(',');
  });
  assert(res[0] === res[1] && res[1] === res[2], res.join(' | '));
});


// ─── 2026-09-27 점검 권고 (소유자 승인) ───────────────────────────
// 처음 안내를 아이처럼: 글자가 뜨고 delay초 뒤에 민다. lane: 옆으로 밀기 단계에서 밀 때(초, null이면 안 민다)
function tutKid(seed, diff, delay, lane) {
  const W = create(seed, { tutorial: true, wait: 0, diff });
  const T = W.tut, pats = new Set(), log = { showRel: {}, maxSpeed: 0 };
  let due = null, lastRow = null;
  const hearts0 = W.hearts;
  for (let i = 0; i < 120 * 120 && T.step !== 'done' && W.phase === 'play'; i++) {
    if (lane != null && T.step === 'lane' && W.runT >= lane) move(W, 'right');
    const sh = T.show;
    if ((sh === 'jump' || sh === 'slide') && !due) {
      const g = RN.World.tutTarget(W, sh);
      if (g && log.showRel[sh] == null) log.showRel[sh] = g.rel / speed(W);
      due = { dir: sh, at: W.t + delay };
    }
    if (due && W.t >= due.at) { move(W, due.dir); due = null; }
    if (due && T.step !== due.dir) due = null;
    tick(W);
    if (T.step !== 'done') log.maxSpeed = Math.max(log.maxSpeed, speed(W));
    if (W.lastRow !== lastRow) { lastRow = W.lastRow; if (T.step !== 'done') pats.add(lastRow.pat); }
  }
  return { W, T, pats, log, hearts0 };
}
test('처음 안내 (a)(b)(e): 글자가 뜨고 0 ~ 0.9초 안에 밀면 늘 성공한다, 글자는 지금 속도로 1초 남짓 앞, 늘 쉬움 속도, 하트는 그대로', () => {
  const TU = D.TUTORIAL;
  for (const diff of D.DIFF_ORDER) {
    for (const delay of [0, 0.15, 0.3, 0.5, 0.7, 0.9]) {
      for (const seed of [1, 2, 3]) {
        const { W, T, log, hearts0 } = tutKid(seed, diff, delay, 1);
        const tag = diff + ' delay ' + delay + ' seed ' + seed;
        assert(T.step === 'done' && T.jumpOk && T.slideOk && T.ok, tag + ': passed ' + JSON.stringify({ step: T.step, j: T.jumpOk, s: T.slideOk, tries: T.tries }));
        assert(W.hits === 0 && W.hearts === hearts0 && W.phase === 'play', tag + ': no heart lost');
        for (const k of ['jump', 'slide']) assert(log.showRel[k] > TU.showSec * 0.8 && log.showRel[k] < TU.showSec * 1.3, tag + ': ' + k + ' prompt ' + (log.showRel[k] || 0).toFixed(2) + 's ahead');
        assert(log.maxSpeed <= D.DIFFICULTY.easy.speed.base + 1e-6, tag + ': easy speed during tutorial ' + log.maxSpeed.toFixed(2));
      }
    }
  }
  // 옛 문제: 느린 속도에서 문 앞뒤 부딪힘 칸이 넓어 뛸 틈이 0.27초뿐이었다. 이제 안내용 문은 좁은 칸
  assert(TU.hitZ < D.PLAYER.hitZ, 'narrow tutorial hit zone');
});

test('처음 안내 (c)(d): 안내 동안 길에는 별 줄과 안내용 문·막대만, 글자는 한 번에 하나 (옆 → 점프 → 미끄러지기 차례, 거꾸로 안 감)', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { T, pats } = tutKid(seed, seed % 2 ? 'easy' : 'normal', 0.3, 1.5);
    for (const p of pats) assert(p === 'stars' || p === 'tut' || p === 'tuts', 'seed ' + seed + ' row ' + p);
    assert(T.step === 'done', 'done');
  }
  // 글자 차례: lane → (빈칸) → jump → (빈칸) → slide, 다른 글자와 겹치지 않는다
  const W = create(5, { tutorial: true, wait: 0 }), seq = [];
  for (let i = 0; i < 120 * 90 && W.tut.step !== 'done'; i++) {
    if (W.runT > 1 && W.tut.step === 'lane') move(W, 'left');
    const sh = W.tut.show;
    if (sh && seq[seq.length - 1] !== sh) seq.push(sh);
    if (sh === 'jump' || sh === 'slide') move(W, sh);
    tick(W);
    assert(!W.obs.some(o => !o.done && !o.tut && (o.kind === 'meteor' || o.kind === 'gate' || o.kind === 'bar' || o.kind === 'bomb')), 'no real obstacles');
  }
  assert(seq.join() === 'lane,jump,slide', 'prompt order ' + seq.join());
});

test('처음 안내 버그 2: 옆으로 안 밀어도 laneSec초 뒤 다음 단계로, 안내가 끝나면 선물·피버·워프·해적선이 다시 돈다, 두 판 뒤에는 안 나온다', () => {
  const TU = D.TUTORIAL;
  const W = create(8, { tutorial: true, wait: 0 });
  run(W, TU.laneSec - 0.5);
  assert(W.tut.step === 'lane', 'still lane');
  run(W, 1);
  assert(W.tut.step === 'jump' && W.events.includes('tutStep'), 'lane step timed out');
  // 아무것도 안 해도 끝난다 (놓치면 tries번 뒤 다음 단계)
  for (let i = 0; i < 120 * 120 && W.tut.step !== 'done'; i++) tick(W);
  assert(W.tut.step === 'done' && W.phase === 'play' && W.hits === 0, 'ends without touching');
  const g0 = W.giftT;
  run(W, 2);
  assert(W.giftT < g0, 'gift timer runs after the tutorial');
  RN.World.feverAdd(W, 1);
  assert(W.fever > 0, 'fever can start after the tutorial');
  // 해적선: 안내가 끝난 뒤 1분(안내 시간은 빼고 잰다)
  assert(W.runT - W.tutT < D.PIRATE.minT, 'level clock excludes the tutorial');
  // 저장: 안내를 두 판 시작하면 다 못 마쳐도 더는 안 나온다
  const m = {}, st = { get: (k, f) => (k in m ? m[k] : f), set: (k, v) => { m[k] = v; } };
  assert(RN.Prefs.tutorialPending(st), 'first');
  RN.Prefs.startTutorial(st);
  assert(RN.Prefs.tutorialPending(st), 'second try');
  RN.Prefs.startTutorial(st);
  assert(!RN.Prefs.tutorialPending(st), 'no third time');
  const old = { get: (k, f) => (k === 'runner.tut' ? false : f), set() {} };
  assert(RN.Prefs.tutorialPending(old), 'old false value = not seen');
});

test('한 번 더!: 하트가 다하면 한 판에 한 번, 부딪힌 자리에서 하트 1개·앞 장애물 치움·3초 깜빡, 두 번째는 없다', () => {
  const CT = D.CONTINUE;
  const W = empty({ diff: 'normal' });
  W.hearts = 1;
  put(W, 'meteor', 1, 3);
  run(W, 1);
  assert(W.phase === 'over' && RN.World.canContinue(W), 'can continue');
  const d0 = W.dist, stars0 = W.stars;
  const near = put(W, 'meteor', 1, 10), gate = put(W, 'gate', 0, 20), far = put(W, 'meteor', 1, CT.clear + 20);
  const st = put(W, 'star', 1, 12);
  assert(RN.World.continueRun(W), 'continued');
  assert(W.phase === 'play' && W.hearts === CT.hearts && W.inv === CT.inv && W.conts === 1, 'hearts and blink');
  assert(W.dist === d0 && W.stars === stars0, 'same place, same stars');
  assert(near.done && gate.done && !far.done && !st.done, 'cleared only obstacles just ahead');
  assert(W.wait > 0 && W.p.y === 0 && W.p.x === W.p.lane, 'ready pose');
  run(W, CT.wait + 0.2);
  assert(W.inv > 0 && W.inv < CT.inv, 'blinking after the ready time');
  // 두 번째로 다하면: 한 번 더 없음
  W.inv = 0; W.hearts = 1; put(W, 'meteor', W.p.lane, 3);
  run(W, 1);
  assert(W.phase === 'over' && !RN.World.canContinue(W) && !RN.World.continueRun(W), 'only once');
  assert(runStats(W).continues === 1, 'stats');
  assert(!RN.World.canContinue(create(1)), 'not while playing');
  // 해적 레이저 중에 끝나도 이어 하면 레이저가 사라진다
  const P2 = empty(); P2.hearts = 1; P2.pir = { t: 5, laser: { lane: 1, phase: 'beam', t: 0.3, max: 0.45 } };
  P2.phase = 'over';
  assert(RN.World.continueRun(P2) && !P2.pir.laser, 'laser cleared');
});

test('버그 5: 부스트 별 비는 길과 따로 굴린다 (부스트가 있어도 같은 씨앗이면 같은 길)', () => {
  const rowsOf = W => {
    const out = [];
    for (let i = 0; i < 120 * 40; i++) {
      W.inv = 99; W.hearts = 9; tick(W);
      const r = W.lastRow;
      if (r && out[out.length - 1] !== r) out.push(r);
    }
    return out.map(r => r.pat + ':' + r.lanes.join('/'));
  };
  // 부스트가 빠르기까지 바꾸면 줄에 닿는 때가 달라지므로, 여기서는 별 비만 보려고 빠르기 배율을 잠깐 1로
  const mul = D.ITEM.boostMul;
  D.ITEM.boostMul = 1;
  let a, b;
  try {
    a = rowsOf(create(31, { wait: 0 }));
    const B = create(31, { wait: 0 });
    B.eff.boost = 30;   // 30초 내내 별 비
    b = rowsOf(B);
    assert(B.obs.some(o => o.rain) || B.stars > 0, 'star rain fell');
  } finally { D.ITEM.boostMul = mul; }
  const n = Math.min(a.length, b.length);
  assert(n >= 8, 'rows ' + n);
  assert(a.slice(0, n).join() === b.slice(0, n).join(), 'same road with a boost\n' + a.slice(0, n).join() + '\n' + b.slice(0, n).join());
});

test('행성 도착 한 줄: 태양계는 도감(worlds.js)의 재미 한 줄, 배우는 사실 줄 없음 (도감이 없어도)', () => {
  const WX = vm.runInContext('WORLDS', ctx);
  for (const z of D.ZONES.slice(0, 9)) assert(z.line === WX.SOLAR_WEATHER[z.id].line, z.id + ' ' + z.line);
  const facts = /가장 가까운|제일 큰|누운|태양과/;
  assert(!D.ZONES.some(z => facts.test(z.line)), 'no fact lines');
  const src = fs.readFileSync(path.join(__dirname, '..', 'runner', 'js', 'data.js'), 'utf8');
  assert(!facts.test(src.slice(src.indexOf('const ZONES'), src.indexOf('BLACKHOLE ='))), 'fallback lines are fun too');
});

test('아이 말: 미션 글에 "(누적)" 같은 말 없음, 처음 몇 판은 쉬운 미션만, 상점 설명에 % 없음', () => {
  for (const m of D.MISSIONS) assert(!/누적|%/.test(m.text), m.id + ' ' + m.text);
  assert(D.MISSIONS.find(m => m.id === 'nm15').text.includes('운석'), 'near miss explained');
  const st = SH.blank();
  assert(st.missions.length === 3 && st.missions.every(m => D.MISSIONS.find(d => d.id === m.id).starter), 'starter missions ' + st.missions.map(m => m.id));
  const old = SH.blank(); old.missions = []; old.life.games = D.MISSION_STARTER + 3; SH.fillMissions(old);
  assert(old.missions.length === 3, 'later all missions');
  for (const x of [].concat(D.UPGRADES, D.CHARS, D.START_ITEMS)) assert(!/%|\d+(\.\d+)?\s*배|\+\d/.test(x.desc), 'kid words ' + x.desc);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
