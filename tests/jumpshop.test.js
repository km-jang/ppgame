'use strict';
// 통통 점프 코인 · 상점 · 미션 테스트. 브라우저 없이 jump/js/shop.js를 그대로 돌린다 (지갑·저장소는 가짜).
// 실행: node tests/jumpshop.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
for (const f of ['util.js', 'data.js', 'world.js', 'records.js', 'shop.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'jump', 'js', f), 'utf8'), ctx, { filename: f });
}
const JP = vm.runInContext('JP', ctx);
const D = JP.DATA, SH = JP.Shop;
const { create, step, tick, botDir } = JP.World;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

function memStore(init) {
  const m = Object.assign({}, init || {});
  return { m, get: (k, f) => (k in m ? JSON.parse(JSON.stringify(m[k])) : f), set: (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } };
}
// 가짜 별코인 지갑 (common/hub.js 흉내)
function fakeWallet(coins) {
  const w = { c: coins || 0, moved: {}, coins: () => w.c, setCoins: n => { w.c = n; return n; }, moveIn: (g, n) => { if (w.moved[g]) return false; w.moved[g] = true; w.c += n; return true; } };
  return w;
}
const run = o => Object.assign({ diff: 'easy', height: 0, stars: 0, springs: 0, rockets: 0, saves: 0, crumbles: 0, bounces: 0, maxCombo: 0, time: 0, zone: 0, games: 1 }, o);

console.log('통통 점프 상점 테스트');

test('자료: 꾸미기 6개 · 강화 4개(5단계) · 시작 아이템 2개 · 미션 15개 이상, 값이 80 ~ 1,200', () => {
  assert(D.SKINS.length >= 6 && D.SKINS[0].price === 0 && D.SKINS.filter(s => !s.price).length === 1, 'skins');
  assert(D.UPGRADES.map(u => u.id).join() === 'speed,rocket,coin,cloud' && D.UPGRADES.every(u => u.prices.length === D.UPGRADE_MAX), 'upgrades');
  assert(D.START_ITEMS.map(i => i.id).join() === 'rocket,shield' && D.START_ITEMS.every(i => i.max === 3), 'items');
  assert(D.MISSIONS.length >= 15 && new Set(D.MISSIONS.map(m => m.id)).size === D.MISSIONS.length, 'missions');
  const prices = [...D.SKINS.filter(s => s.price).map(s => s.price), ...D.UPGRADES.flatMap(u => u.prices), ...D.START_ITEMS.map(i => i.price)];
  assert(Math.min(...prices) >= 80 && Math.max(...prices) <= 1200, 'price range ' + Math.min(...prices) + ' ~ ' + Math.max(...prices));
  for (const m of D.MISSIONS) assert(['life', 'run'].includes(m.kind) && m.goal > 0 && m.reward > 0 && m.text, 'mission ' + m.id);
  const runKeys = Object.keys(SH.runOf(create(1, {})));
  for (const m of D.MISSIONS) assert(runKeys.includes(m.stat), 'mission stat exists ' + m.stat);
});

test('코인 계산: 높이 ÷ 10 + 별 ÷ 2 + 도착한 구역 보너스, 강화면 +10%씩', () => {
  const st = SH.blank();
  const a = SH.coinsFor(run({ height: 150, stars: 41, zone: 1 }), st);
  assert(a.parts.height === 15 && a.parts.stars === 20 && a.parts.zone === 5 && a.total === 40, JSON.stringify(a));
  const b = SH.coinsFor(run({ height: 520, stars: 100, zone: 3 }), st);
  assert(b.parts.zone === 35 && b.total === 52 + 50 + 35, 'all zones ' + JSON.stringify(b));
  st.up.coin = 3;
  const c = SH.coinsFor(run({ height: 150, stars: 41, zone: 1 }), st);
  assert(c.parts.bonus === 12 && c.total === 52, 'bonus ' + JSON.stringify(c));
  assert(SH.coinsFor(run({ height: -5, stars: NaN, zone: 99 }), SH.blank()).total >= 0, 'bad input safe');
});

test('코인 크기: 사람 닮은 봇의 보통 한 판은 20 ~ 100코인쯤 (숫자를 찍는다)', () => {
  const out = {};
  for (const diff of D.DIFF_ORDER) {
    let sum = 0;
    const n = 10;
    for (let seed = 1; seed <= n; seed++) {
      const W = create(seed, { diff, viewH: 600 });
      const r = JP.rng(seed * 31);
      // 사람처럼: 가끔 엉뚱한 쪽을 누른다
      for (let i = 0; i < 60 * 150 && W.phase === 'play'; i++) {
        W.input.dir = r() < 0.06 ? Math.floor(r() * 3) - 1 : botDir(W);
        step(W, 1 / 60); W.events.length = 0; W.fx.length = 0;
      }
      sum += SH.coinsFor(SH.runOf(W), SH.blank()).total;
    }
    out[diff] = Math.round(sum / n);
  }
  console.log('       한 판 평균 코인 (강화 없음, 2분 30초 안): ' + JSON.stringify(out));
  assert(out.normal >= 10 && out.normal <= 120, 'normal ' + out.normal);
});

test('지갑: 불러올 때 지갑 잔액을 쓰고, 저장하면 지갑에 맞춘다', () => {
  const store = memStore({ 'jump.shop1': { coins: 40 } });
  const w = fakeWallet(100);
  const st = SH.load(store, w);
  assert(st.coins === 140 && w.moved.jump, 'moved old coins once ' + st.coins);
  st.coins -= 30;
  SH.save(st, store, w);
  assert(w.c === 110, 'wallet updated ' + w.c);
  assert(SH.load(store, w).coins === 110, 'not moved twice');
  w.c = 500;
  assert(SH.sync(st, w).coins === 500, 'sync');
  const noW = SH.load(memStore({ 'jump.shop1': { coins: 7 } }), null);
  assert(noW.coins === 7, 'no wallet');
});

test('사기: 모자라면 못 사고, 모으면 꾸미기·강화·시작 아이템을 산다', () => {
  const st = SH.blank();
  const skin = D.SKINS[1];
  let r = SH.buy(st, skin.id);
  assert(!r.ok && r.reason === 'coins' && !st.skins[skin.id], 'poor');
  st.coins = 5000;
  r = SH.buy(st, skin.id);
  assert(r.ok && st.skins[skin.id] && st.skin === skin.id && st.coins === 5000 - skin.price, 'bought skin');
  assert(SH.buy(st, skin.id).reason === 'owned', 'owned');
  assert(SH.selectSkin(st, 'basic') && st.skin === 'basic', 'select owned');
  assert(!SH.selectSkin(st, 'gold') && st.skin === 'basic', 'cannot select locked');
  for (let k = 0; k < D.UPGRADE_MAX; k++) assert(SH.buy(st, 'speed').ok, 'upgrade ' + k);
  assert(st.up.speed === D.UPGRADE_MAX && SH.buy(st, 'speed').reason === 'max' && SH.price(st, 'speed') === null, 'upgrade max');
  for (let k = 0; k < 3; k++) assert(SH.buy(st, 'rocket').ok, 'item ' + k);
  assert(st.items.rocket === 3 && SH.buy(st, 'rocket').reason === 'max', 'item max');
  assert(SH.buy(st, 'nope').reason === 'unknown', 'unknown');
});

test('강화가 판에 적용된다: 좌우 속도 · 로켓 시간 · 쉬움 구조 구름 (보통은 그대로)', () => {
  const up = { speed: 5, rocket: 5, cloud: 2 };
  const base = create(1, { diff: 'easy' }), E = create(1, Object.assign({ diff: 'easy' }, SH.worldOpts({ up }, {})));
  assert(Math.abs(E.ctl.maxVx - base.ctl.maxVx * 1.2) < 1e-6, 'speed ' + E.ctl.maxVx);
  assert(Math.abs(E.rocketTime - D.ROCKET.time * 1.6) < 1e-6, 'rocket ' + E.rocketTime);
  assert(E.rescues === 5 && E.rescueMax === 5, 'easy clouds ' + E.rescues);
  const N = create(1, { diff: 'normal', upgrades: up });
  assert(N.rescues === 0 && N.rescueMax === 0, 'no clouds in normal');
  assert(D.DIFFICULTY.easy.ctl.maxVx === 400, 'table untouched');
  // 로켓 아이템을 먹으면 늘어난 시간만큼
  N.items.push({ id: 999, kind: 'rocket', x: N.p.x, y: N.p.y, got: false, seen: -1 });
  tick(N);
  assert(Math.abs(N.rocket - N.rocketTime) < 0.02, 'rocket uses upgraded time');
  // 망가진 강화 값은 무시
  const X = create(1, { diff: 'easy', upgrades: { speed: 'x', cloud: 99 } });
  assert(X.ctl.maxVx === 400 && X.rescues === 3 + D.UPGRADE_MAX, 'clamped');
});

test('시작 아이템: 판 시작에 하나씩 쓰고, 로켓 출발·방패 방울이 켜진 채 시작', () => {
  const st = SH.blank();
  st.items.rocket = 2; st.items.shield = 1;
  const lo = SH.takeLoadout(st);
  assert(lo.rocket && lo.shield && st.items.rocket === 1 && st.items.shield === 0, 'took one each');
  const W = create(1, Object.assign({ diff: 'normal' }, SH.worldOpts(st, lo)));
  assert(W.rocket > 0 && W.shield && W.rockets === 1 && W.events.includes('rocket'), 'started with both');
  const lo2 = SH.takeLoadout(st);
  assert(lo2.rocket && !lo2.shield && st.items.rocket === 0, 'second');
  assert(Object.keys(SH.takeLoadout(st)).length === 0, 'empty');
  const P = create(1, { diff: 'normal' });
  assert(!P.rocket && !P.shield && P.rockets === 0, 'no loadout by default');
});

test('미션: 늘 3개, 누적은 더하고 한 판은 가장 큰 값, 받으면 코인과 새 미션', () => {
  const st = SH.blank();
  assert(st.missions.length === D.MISSION_SLOTS, 'three');
  // 정해진 미션으로 바꿔 시험
  st.missions = [{ id: 'star200', prog: 0, done: false }, { id: 'h100', prog: 0, done: false }, { id: 'n150', prog: 0, done: false }];
  SH.progressMissions(st, run({ stars: 120, height: 60 }));
  SH.progressMissions(st, run({ stars: 90, height: 40 }));
  const v = SH.missionView(st);
  assert(v[0].prog === 200 && v[0].done, 'life sums and caps ' + v[0].prog);
  assert(v[1].prog === 60 && !v[1].done, 'run keeps best ' + v[1].prog);
  assert(v[2].prog === 0, 'diff mission ignores easy runs');
  SH.progressMissions(st, run({ diff: 'normal', height: 160 }));
  assert(st.missions[2].done && st.missions[1].done, 'normal run counts');
  const coins = st.coins, reward = D.MISSIONS.find(m => m.id === 'star200').reward;
  assert(SH.claim(st, 0) === reward && st.coins === coins + reward, 'claimed');
  assert(st.missions.length === 3 && st.missions[0].id !== 'star200' && !st.missions[0].done, 'replaced in place ' + st.missions[0].id);
  assert(SH.claim(st, 0) === 0, 'cannot claim unfinished');
});

test('미션: 해 보지 않은 난이도 미션은 나오지 않고, 해 보면 나올 수 있다', () => {
  const st = SH.blank();
  for (let k = 0; k < 200; k++) { st.missions = []; st.mseed = k + 1; SH.fillMissions(st); for (const m of st.missions) assert(!SH.missionDef(m.id).diff, 'no diff mission yet ' + m.id); }
  st.life.diffs.hard = true;
  let seen = false;
  for (let k = 0; k < 400 && !seen; k++) { st.missions = []; st.mseed = k + 1; SH.fillMissions(st); seen = st.missions.some(m => m.id === 'x80'); }
  assert(seen, 'hard mission appears after playing hard');
});

test('판이 끝나면: 코인 지급 + 미션 진행 + 해 본 난이도 기록', () => {
  const st = SH.blank();
  st.missions = [{ id: 'games5', prog: 4, done: false }, { id: 'h100', prog: 0, done: false }, { id: 'bnc300', prog: 0, done: false }];
  const W = create(3, { diff: 'hard', viewH: 600 });
  for (let i = 0; i < 60 * 20 && W.phase === 'play'; i++) { W.input.dir = botDir(W); step(W, 1 / 60); W.events.length = 0; W.fx.length = 0; }
  const r = SH.runOf(W);
  const e = SH.finishRun(st, r);
  assert(e.coins === SH.coinsFor(r, st).total && st.coins === e.coins && st.life.games === 1, 'coins ' + e.coins);
  assert(e.done.includes('games5') && st.life.diffs.hard && !st.life.diffs.normal, 'progress ' + e.done.join(','));
  assert(st.missions[2].prog === Math.min(300, r.bounces), 'bounces ' + st.missions[2].prog);
});

test('망가진 저장본도 올바른 모양으로 (없는 꾸미기·음수·모르는 미션·겹친 미션)', () => {
  const raw = {
    coins: -50, skin: 'gold', skins: { berry: true, gold: 'yes', nope: true }, up: { speed: 99, rocket: -3, coin: '2', cloud: null },
    items: { rocket: 10, shield: 'x' }, missions: [{ id: 'h100', prog: 999 }, { id: 'h100', prog: 3 }, { id: 'zzz' }, 5, { id: 'star30', prog: 'a' }],
    life: { earned: 'x', games: 3, diffs: { normal: true, hard: 'y' } }, mseed: -1,
  };
  const st = SH.clean(raw);
  assert(st.coins === 0 && st.skins.berry && !st.skins.gold && !('nope' in st.skins) && st.skin === 'basic', 'skins');
  assert(st.up.speed === D.UPGRADE_MAX && st.up.rocket === 0 && st.up.coin === 2 && st.up.cloud === 0, 'upgrades ' + JSON.stringify(st.up));
  assert(st.items.rocket === 3 && st.items.shield === 0, 'items');
  assert(st.missions.length === 3 && st.missions[0].id === 'h100' && st.missions[0].done && st.missions[0].prog === 100, 'missions ' + JSON.stringify(st.missions));
  assert(st.missions.filter(m => m.id === 'h100').length === 1 && st.missions[1].id === 'star30' && st.missions[1].prog === 0, 'dedupe');
  assert(st.life.diffs.normal && !st.life.diffs.hard && st.life.games === 3 && st.mseed >= 1, 'life');
  for (const bad of [null, 'x', 42, [], { missions: 'x' }]) { const b = SH.clean(bad); assert(b.missions.length === 3 && b.skin === 'basic', 'bad ' + JSON.stringify(bad)); }
  const store = memStore();
  SH.save(st, store, null);
  assert(JSON.stringify(SH.load(store, null)) === JSON.stringify(st), 'round trip');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
