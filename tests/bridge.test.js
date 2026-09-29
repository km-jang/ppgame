'use strict';
// 슥슥 우주 다리 규칙·상점 테스트. 브라우저 없이 bridge/js/world.js·shop.js를 물리 엔진(Planck.js)과 함께 그대로 돌린다.
// 실행: node tests/bridge.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
const R = path.join(__dirname, '..', 'bridge');
for (const f of ['lib/planck.min.js', 'js/util.js', 'js/data.js', 'js/world.js', 'js/shop.js']) {
  vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), ctx, { filename: f });
}
const BR = vm.runInContext('BR', ctx);
const D = BR.DATA, PH = D.PHYS, Wd = BR.World, SH = BR.Shop;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

// 손가락처럼 선을 긋는다 (6px마다)
function stroke(W, pts) {
  Wd.beginStroke(W, pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
    for (let k = 1; k <= n; k++) Wd.drawTo(W, ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
  }
  return Wd.endStroke(W);
}
function run(W, sec, frame) { const f = frame || 1 / 60; for (let t = 0; t < sec && W.phase === 'run'; t += f) Wd.step(W, f); }
// 아이 손 떨림: 점을 잘게 나누고 부드럽게 흔든다 (씨앗으로 정해져 늘 같다)
function wobble(sol, seed, amt) {
  const r = BR.rng(seed);
  return sol.map(s => {
    const pts = [s[0].slice()];
    for (let i = 1; i < s.length; i++) { const [ax, ay] = s[i - 1], [bx, by] = s[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 25)); for (let k = 1; k <= n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); }
    const ox = (r() - 0.5) * amt, oy = (r() - 0.5) * amt;
    let wy = 0;
    return pts.map(([x, y]) => { wy += (r() - 0.5) * amt * 0.6; wy *= 0.8; return [x + ox * 0.5, y + oy * 0.5 + wy]; });
  });
}
// 메모리 저장소 · 가짜 지갑
function memStore() { const m = {}; return { m, get(k, f) { return k in m ? JSON.parse(m[k]) : f; }, set(k, v) { m[k] = JSON.stringify(v); } }; }

console.log('슥슥 우주 다리 규칙 테스트');

// ─── 판 모양 ───
test('판 20개: 달 10 · 화성 10, id가 겹치지 않고 번호가 차례대로', () => {
  assert(D.LEVELS.length === 20, 'count ' + D.LEVELS.length);
  assert(D.levelsOf('moon').length === 10 && D.levelsOf('mars').length === 10, 'per planet');
  assert(new Set(D.LEVELS.map(l => l.id)).size === 20, 'unique ids');
  for (const p of ['moon', 'mars']) D.levelsOf(p).forEach((l, i) => assert(l.n === i + 1 && l.id === p + '-' + (i + 1), l.id));
});

test('판마다: 공·친구가 땅 속이 아니고 화면 안, 잉크가 별 기준보다 많다, 친구 말풍선이 있다', () => {
  for (const L of D.LEVELS) {
    const W = Wd.create(L);
    const [bx, by] = L.ball, [gx, gy] = L.goal;
    assert(bx > 0 && bx < 1280 && by > 0 && by < 800, L.id + ' ball on screen');
    assert(gx > 60 && gx < 1220 && gy > 100 && gy <= 800, L.id + ' goal on screen');
    for (const g of W.ground) {
      assert(!Wd.inPoly(g.poly, bx, by), L.id + ' ball inside ground');
      assert(!Wd.inPoly(g.poly, gx, gy - 20), L.id + ' friend inside ground');
    }
    // 친구는 땅 위에 서 있다 (발 바로 아래가 땅)
    assert(W.ground.some(g => Wd.inPoly(g.poly, gx, gy + 6)), L.id + ' friend stands on ground');
    assert(L.par[0] < L.par[1] && L.par[1] < L.ink, L.id + ' par < ink');
    assert(typeof L.say === 'string' && L.say.length > 0 && typeof L.name === 'string', L.id + ' texts');
  }
});

test('판마다 정답 선(힌트)으로 친구를 만난다, 별 3개', () => {
  for (const L of D.LEVELS) {
    const W = Wd.solve(L, L.sol, { maxSec: 14 });
    assert(W.phase === 'win', L.id + ' ' + L.name + ' ' + W.phase + ' ball ' + JSON.stringify(Wd.ballState(W)));
    assert(W.stars === 3, L.id + ' stars ' + W.stars);
    // 정답 선이 거의 다 그려졌다 (땅에 막혀 잘리지 않았다)
    const drawn = W.strokes.reduce((a, s) => a + s.len, 0);
    assert(drawn > L.solLen * 0.9, L.id + ' drawn ' + Math.round(drawn) + ' / ' + Math.round(L.solLen));
  }
});

test('선 없이는 못 푼다 (아무 데나 구슬 하나로 출발만 해도 친구에게 가지 않는다)', () => {
  for (const L of D.LEVELS) {
    const W = Wd.solve(L, [[[40, 40], [41, 41]]], { maxSec: 14 });
    assert(W.phase !== 'win', L.id + ' solved without a line');
  }
});

test('아이 손처럼 흔들린 정답 선으로도 대부분 풀린다 (판마다 12번 중 8번 이상)', () => {
  for (const L of D.LEVELS) {
    let ok = 0;
    for (let k = 0; k < 12; k++) if (Wd.solve(L, wobble(L.sol, 100 + k, 14), { maxSec: 14 }).phase === 'win') ok++;
    assert(ok >= 8, L.id + ' ' + L.name + ' wobbly ' + ok + '/12');
  }
});

test('화면 주사율이 달라도(30·60·120·144Hz) 같은 결과', () => {
  for (const id of ['moon-1', 'mars-2', 'mars-5']) {
    const L = D.levelById(id), res = [];
    for (const hz of [30, 60, 120, 144]) {
      const W = Wd.solve(L, L.sol, { frame: 1 / hz, maxSec: 14 });
      const b = Wd.ballState(W);
      res.push([W.phase, W.steps, Math.round(b.x * 100), Math.round(b.y * 100)].join());
    }
    assert(new Set(res).size === 1, id + ' ' + res.join(' | '));
  }
});

// ─── 그리기 ───
test('처음엔 멈춰 있다가 첫 선을 다 그리고 손을 떼면 출발 (그리는 동안은 안 움직임)', () => {
  const L = D.levelById('moon-3'), W = Wd.create(L);
  const y0 = Wd.ballState(W).y;
  Wd.step(W, 1);
  assert(W.phase === 'ready' && Wd.ballState(W).y === y0, 'frozen while ready');
  Wd.beginStroke(W, 380, 426); Wd.drawTo(W, 500, 470);
  Wd.step(W, 0.5);
  assert(W.phase === 'ready', 'still ready while drawing');
  Wd.endStroke(W);
  assert(W.phase === 'run' && W.events.includes('go'), 'run after first line');
  run(W, 0.3);
  assert(Wd.ballState(W).y > y0 + 10, 'ball falls');
});

test('땅 속에서는 선을 시작하지 못하고, 땅을 가로지르면 그 부분은 그려지지 않는다', () => {
  const L = D.levelById('moon-1'), W = Wd.create(L);
  assert(!Wd.pointFree(W, 100, 600), 'inside ground not free');
  assert(Wd.pointFree(W, 600, 300), 'sky free');
  // 땅 속에서 시작: 점이 안 찍힌다. 빈 곳으로 나오면 거기서부터
  Wd.beginStroke(W, 100, 600);
  assert(W.drawing.pts.length === 0, 'no start point in ground');
  Wd.drawTo(W, 600, 300);
  assert(W.drawing.pts.length === 1 && W.drawing.pts[0][0] === 600, 'starts in the open');
  Wd.endStroke(W);
  // 오른쪽 땅(830~)을 뚫고 지나가는 선: 땅 앞에서 멈춘다
  const W2 = Wd.create(L);
  stroke(W2, [[700, 600], [1000, 600]]);
  const s = W2.strokes[0];
  assert(s && Math.max(...s.pts.map(p => p[0])) < 830, 'cut before ground ' + (s && Math.max(...s.pts.map(p => p[0]))));
});

test('톡 누르면 작은 구슬, 공 위에는 그려지지 않는다', () => {
  const L = D.levelById('moon-8'), W = Wd.create(L);
  const s = stroke(W, [[500, 200], [501, 200]]);
  assert(s && s.kind === 'dot' && W.stats.dots === 1 && W.events.includes('dot'), 'dot');
  assert(Math.abs(W.ink.used - PH.dotR * 2) < 1e-6, 'dot ink ' + W.ink.used);
  const b = Wd.ballState(W);
  assert(!Wd.pointFree(W, b.x, b.y), 'ball is not free');
});

test('잉크가 떨어지면 더 그려지지 않고, 되돌리기로 돌려받는다', () => {
  const L = D.levelById('moon-2'), W = Wd.create(L);
  Wd.beginStroke(W, 500, 100);
  for (let x = 500; x < 1200; x += 5) Wd.drawTo(W, x, 100 + (x % 40));
  for (let x = 1200; x > 400; x -= 5) Wd.drawTo(W, x, 180 + (x % 40));
  for (let x = 400; x < 1200; x += 5) Wd.drawTo(W, x, 260 + (x % 40));
  assert(W.events.includes('noInk'), 'no ink event');
  Wd.endStroke(W);
  assert(Wd.inkLeft(W) < 1, 'ink used up ' + Wd.inkLeft(W));
  assert(W.ink.used <= W.ink.max + 1e-6, 'never over max');
  assert(!Wd.beginStroke(W, 600, 100), 'cannot start with no ink');
  assert(Wd.undo(W), 'undo');
  assert(W.ink.used === 0 && W.lines.length === 0 && W.stats.undos === 1, 'ink back');
});

test('다시 하기: 선이 모두 지워지고 잉크 가득, 멈춘 처음 모습으로', () => {
  const L = D.levelById('moon-1'), W = Wd.create(L);
  stroke(W, L.sol[0]);
  run(W, 1);
  Wd.reset(W);
  assert(W.phase === 'ready' && W.lines.length === 0 && W.strokes.length === 0 && W.ink.used === 0, 'reset');
  const b = Wd.ballState(W);
  assert(Math.abs(b.x - L.ball[0]) < 0.01 && Math.abs(b.y - L.ball[1]) < 0.01, 'ball back');
});

test('떨어지면 fall (지는 화면 없음, 다시 하기로 처음부터)', () => {
  const L = D.levelById('moon-1'), W = Wd.create(L);
  stroke(W, [[600, 100], [601, 100]]);   // 구슬만 하나: 공이 골짜기로
  run(W, 10);
  assert(W.phase === 'fall' && W.stats.falls === 1 && W.events.includes('fall'), 'fall ' + W.phase);
  Wd.reset(W);
  assert(W.phase === 'ready' && W.stats.falls === 1, 'falls kept after reset');
});

test('공이 오래 멈춰 있으면 한 번 "막혔나요?"', () => {
  const L = D.levelById('moon-8'), W = Wd.create(L);
  stroke(W, [[1000, 200], [1001, 200]]);   // 공과 먼 곳에 구슬: 공은 가만히
  run(W, PH.stuckSec + 1);
  assert(W.stuck && W.events.filter(e => e === 'stuck').length === 1, 'stuck once');
});

test('별: 잉크를 적게 쓸수록 많다 (3·2·1)', () => {
  const L = D.levelById('moon-1');
  const W3 = Wd.solve(L, L.sol);
  assert(W3.stars === 3, '3 stars');
  // 정답 선에 더해 잉크를 더 썼다면 별이 준다 (쓴 잉크만 늘린다: 선이 떨어져 길을 막지 않게)
  const withExtra = add => { const W = Wd.create(L); stroke(W, L.sol[0]); W.ink.used += add; run(W, 14); return W; };
  const W2 = withExtra(L.par[0] - L.solLen + 20);
  const W1 = withExtra(L.par[1] - L.solLen + 20);
  assert(W2.phase === 'win' && W2.stars === 2, '2 stars ' + W2.stars + ' used ' + Math.round(W2.ink.used) + ' par ' + L.par);
  assert(W1.phase === 'win' && W1.stars === 1, '1 star ' + W1.stars + ' used ' + Math.round(W1.ink.used));
});

test('스프링은 공을 튕겨 올린다 (화성 1판)', () => {
  const L = D.levelById('mars-1'), W = Wd.solve(L, L.sol);
  assert(W.phase === 'win' && W.stats.springs >= 1, 'spring used ' + W.stats.springs);
});

test('시소는 공이 올라타면 기울어진다 (화성 2판)', () => {
  const L = D.levelById('mars-2'), W = Wd.create(L);
  const a0 = Wd.bodyState(W.seesaws[0].plank).a;
  stroke(W, L.sol[0]);
  run(W, 14);
  const a1 = Wd.bodyState(W.seesaws[0].plank).a;
  assert(W.phase === 'win' && a1 > a0 + 0.3, 'tilted ' + a0.toFixed(2) + ' -> ' + a1.toFixed(2));
  assert(Wd.runStats(W).seesaw === 1, 'seesaw stat');
});

test('판 요약: 선 하나로 깼나 · 깬 행성', () => {
  const L = D.levelById('mars-3'), W = Wd.solve(L, L.sol);
  const r = SH.runOf(W);
  assert(r.win === 1 && r.clears === 1 && r.oneLine === 1 && r.marsClears === 1 && r.three === 1 && r.lines === 1, JSON.stringify(r));
});

// ─── 상점 · 기록 ───
test('상점: 처음엔 데굴이·파란 빛, 사면 바로 고른다, 코인이 모자라면 못 산다', () => {
  const st = SH.blank();
  assert(st.char === 'roll' && st.chars.roll && st.pen === 'cyan' && st.pens.cyan, 'defaults');
  assert(!SH.buy(st, 'sun').ok && SH.buy(st, 'sun').reason === 'coins', 'poor');
  st.coins = 1000;
  assert(SH.buy(st, 'sun').ok && st.char === 'sun' && st.coins === 750, 'buy char');
  assert(SH.buy(st, 'gold').ok && st.pen === 'gold' && st.coins === 500, 'buy pen');
  assert(SH.buy(st, 'sun').reason === 'owned', 'owned');
  assert(SH.select(st, 'roll') && st.char === 'roll', 'select owned');
  assert(!SH.select(st, 'berry'), 'cannot select unowned');
  assert(SH.buy(st, 'zzz').reason === 'unknown', 'unknown');
});

test('상점 저장본: 망가진 값은 기본값, 가진 것만 고를 수 있다, 지갑(HUB)과 코인을 맞춘다', () => {
  const st = SH.clean({ coins: -5, char: 'berry', chars: { berry: 'yes' }, pen: 'nope', missions: 'x' });
  assert(st.coins === 0 && st.char === 'roll' && st.pen === 'cyan' && st.missions.length === D.MISSION_SLOTS, 'clean');
  const S = memStore(); let coins = 300;
  const wallet = { coins: () => coins, setCoins: n => { coins = n; } };
  const a = SH.load(S, wallet);
  assert(a.coins === 300, 'from wallet');
  a.coins = 120; SH.save(a, S, wallet);
  assert(coins === 120 && S.get(SH.KEY).coins === 120, 'to wallet');
});

test('코인: 처음 깬 판은 크게, 다시 깬 판은 작게, 별이 늘면 덤', () => {
  const C = D.COINS;
  const first = SH.coinsFor({ win: 1, stars: 2 }, null);
  assert(first.total === C.base + C.perStar * 2 && first.first, 'first ' + first.total);
  const again = SH.coinsFor({ win: 1, stars: 2 }, { stars: 2 });
  assert(again.total === C.again + C.againStar * 2 && !again.first, 'again ' + again.total);
  const better = SH.coinsFor({ win: 1, stars: 3 }, { stars: 1 });
  assert(better.total === C.again + C.againStar * 3 + C.better * 2, 'better ' + better.total);
  assert(SH.coinsFor({ win: 0, stars: 0 }, null).total === 0, 'no win no coins');
});

test('판 열기: 달 1판부터 차례로, 화성은 달 5판을 깨면', () => {
  const rec = SH.blankRec();
  assert(SH.levelOpen(rec, 'moon-1') && !SH.levelOpen(rec, 'moon-2'), 'first open');
  assert(!SH.planetOpen(rec, 'mars') && !SH.levelOpen(rec, 'mars-1'), 'mars locked');
  assert(SH.nextLevel(rec).id === 'moon-1', 'next moon-1');
  for (let i = 1; i <= 5; i++) rec.levels['moon-' + i] = { stars: 1, best: 1, clears: 1 };
  assert(SH.levelOpen(rec, 'moon-6') && !SH.levelOpen(rec, 'moon-7'), 'moon-6 open');
  assert(SH.planetOpen(rec, 'mars') && SH.levelOpen(rec, 'mars-1') && !SH.levelOpen(rec, 'mars-2'), 'mars opens');
  assert(SH.nextLevel(rec).id === 'moon-6' && SH.nextLevel(rec, 'mars').id === 'mars-1', 'next');
  for (const L of D.LEVELS) rec.levels[L.id] = { stars: 3, best: 1, clears: 1 };
  rec.levels['mars-4'].stars = 2;
  assert(SH.nextLevel(rec).id === 'mars-4', 'all cleared: first not-3-star');
});

test('판을 깨면: 장부·코인·미션·메달 (첫 판 메달)', () => {
  const st = SH.blank(), rec = SH.blankRec();
  const L = D.levelById('moon-1'), W = Wd.solve(L, L.sol);
  const r = SH.finishLevel(st, rec, SH.runOf(W));
  assert(r.coins === D.COINS.base + D.COINS.perStar * 3 && st.coins === r.coins, 'coins ' + r.coins);
  assert(rec.levels['moon-1'].stars === 3 && rec.levels['moon-1'].clears === 1 && rec.total.clears === 1, 'rec');
  assert(r.medals.some(m => m.id === 'first') && rec.medals.first, 'first medal');
  const again = SH.finishLevel(st, rec, SH.runOf(W));
  assert(again.coins === D.COINS.again + D.COINS.againStar * 3 && !again.medals.length, 'again');
  assert(rec.levels['moon-1'].clears === 2 && rec.total.three === 2, 'counts');
});

test('미션: 여러 판에 걸쳐 모으고, 받으면 코인 + 새 미션', () => {
  const st = SH.blank();
  const m = st.missions[0], def = SH.missionDef(m.id);
  const run = { clears: 0, three: 0, lines: 0, oneLine: 0, marsClears: 0, dots: 0, springs: 0 };
  run[def.stat] = def.goal;
  const done = SH.progressMissions(st, run);
  assert(done.includes(m.id) && st.missions[0].done, 'done');
  const c0 = st.coins, got = SH.claim(st, 0);
  assert(got === def.reward && st.coins === c0 + got, 'claim');
  assert(st.missions.length === D.MISSION_SLOTS && st.missions[0].id !== m.id, 'refilled');
  assert(SH.claim(st, 0) === 0, 'cannot claim unfinished');
});

test('메달: 달 10판 · 별 3개 모든 판', () => {
  const rec = SH.blankRec();
  for (const L of D.levelsOf('moon')) rec.levels[L.id] = { stars: 3, best: 1, clears: 1 };
  const got = SH.checkMedals(rec, '2026-09-29').map(m => m.id);
  assert(got.includes('moon10') && got.includes('moon5') && got.includes('three5') && got.includes('stars30') && !got.includes('three20'), got.join());
  for (const L of D.LEVELS) rec.levels[L.id] = { stars: 3, best: 1, clears: 1 };
  assert(SH.checkMedals(rec).map(m => m.id).includes('three20'), 'all three');
});

test('기록 장부: 망가진 값은 버린다', () => {
  const r = SH.cleanRec({ levels: { 'moon-1': { stars: 9 }, 'zz-1': { stars: 3 } }, total: { clears: 'x', lines: 5 }, medals: { first: 1, moon5: '2026-09-29' } });
  assert(r.levels['moon-1'].stars === 3 && !r.levels['zz-1'], 'levels');
  assert(r.total.clears === 0 && r.total.lines === 5, 'total');
  assert(!r.medals.first && r.medals.moon5 === '2026-09-29', 'medals');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
