'use strict';
// 슝슝 우주 달리기 규칙 테스트. 브라우저 없이 runner/js/world.js를 그대로 돌린다.
// 실행: node tests/runner.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
for (const f of ['util.js', 'data.js', 'world.js']) {
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

test('처음 상태: 가운데 줄, 쉬움 하트 3 · 보통 하트 1', () => {
  const E = create(1), N = create(1, { easy: false });
  assert(E.p.lane === 1 && E.p.x === 1 && E.phase === 'play', 'middle lane');
  assert(E.easy && E.hearts === D.EASY.hearts && E.hearts === 3, 'easy hearts ' + E.hearts);
  assert(!N.easy && N.hearts === 1, 'normal hearts ' + N.hearts);
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

test('운석: 쉬움은 하트 하나를 잃고 계속, 보통은 끝', () => {
  const E = empty();
  put(E, 'meteor', 1, 5);
  run(E, 1);
  assert(E.phase === 'play' && E.hearts === 2 && E.events.includes('hit'), 'easy heart lost');
  const N = empty({ easy: false });
  put(N, 'meteor', 1, 5);
  run(N, 1);
  assert(N.phase === 'over' && N.hearts === 0 && N.cause === 'meteor' && N.events.includes('over'), 'normal over');
});

test('쉬움: 하트가 0이 되면 끝', () => {
  const W = empty();
  for (let k = 0; k < 3; k++) { put(W, 'meteor', 1, 5); run(W, D.HIT.inv + 0.6); }
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
  run(W, D.HIT.inv);
  assert(W.inv === 0, 'blink ends');
  put(W, 'meteor', 1, 3);
  run(W, 0.4);
  assert(W.hearts === 1, 'hit again after blink');
});

test('방패는 한 번 막아 준다 (보통에서도 안 끝남)', () => {
  const W = empty({ easy: false });
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
  assert(W.phase === 'over', 'second hit ends normal game');
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

test('속도는 천천히 오르고 상한에서 멈춘다', () => {
  const W = empty();
  const a = speed(W);
  run(W, 10);
  const b = speed(W);
  assert(b > a, 'faster ' + a + ' -> ' + b);
  W.runT = 1e6;
  assert(speed(W) === D.EASY.speed.max, 'cap easy');
  const N = empty({ easy: false });
  N.runT = 1e6;
  assert(speed(N) === D.NORMAL.speed.max && D.NORMAL.speed.max > D.EASY.speed.max, 'cap normal');
});

test('거리는 늘고 점수 = 거리 + 별 × 값', () => {
  const W = empty();
  run(W, 5);
  assert(W.dist > D.EASY.speed.base * 5 * 0.99, 'dist ' + W.dist);
  assert(W.score === Math.floor(W.dist), 'score = dist');
});

test('어떤 줄이든 비어 있는 줄이 하나 이상, 줄 사이 간격은 피할 수 있을 만큼', () => {
  let rows = 0;
  for (const easy of [true, false]) {
    const C = easy ? D.EASY : D.NORMAL;
    for (let seed = 1; seed <= 60; seed++) {
      const W = create(seed, { easy });
      W.runT = 1e6;   // 가장 빠를 때
      let prev = null;
      for (let i = 0; i < 80; i++) {
        const row = makeRow(W);
        const blocked = [false, false, false];
        for (const o of W.obs) {
          if (o.row !== row.id) continue;
          if (o.kind === 'meteor') { blocked[o.x] = true; if (o.moving) { blocked[o.from] = true; blocked[o.to] = true; } }
          if (o.kind === 'gate') blocked[o.x] = true;
          if (o.kind === 'item') assert(!row.lanes[o.x], 'item in a free lane');
        }
        assert(blocked.some(b => !b), 'row has a free lane: seed ' + seed + ' ' + row.pat);
        assert(row.free.length >= 1, 'free list');
        if (!easy) assert(true); else assert(row.pat !== 'mover', 'easy: no movers');
        if (prev) {
          // 두 줄 건너기(0.25초) + 여유 0.2초 이상
          const sec = (row.z - prev.z) / C.speed.max;
          assert(sec >= 2 / D.PLAYER.laneSpeed + 0.2, 'gap ' + sec.toFixed(2) + 's');
        }
        prev = row; rows++;
      }
    }
  }
  assert(rows === 2 * 60 * 80, 'rows ' + rows);
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
    assert(W.stars > 50 && W.dist > 3000, 'seed ' + seed + ' stars ' + W.stars + ' dist ' + Math.floor(W.dist));
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
