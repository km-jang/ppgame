'use strict';
// 냠냠 뱀 코인 · 상점 · 미션 테스트. 브라우저 없이 snake/js/shop.js를 그대로 돌린다.
// 지갑은 가짜(memWallet)를 끼운다. 공통 지갑(common/hub.js)과 이어 붙인 것도 한 번 확인한다.
// 실행: node tests/snakeshop.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(withHub) {
  const ctx = vm.createContext({ console, Math, Date, JSON, Number, String, Object, Array, Set, Uint8Array, Int16Array });
  if (withHub) {
    const mem = {};
    ctx.HUB = { store: { get: (k, f) => (k in mem ? JSON.parse(mem[k]) : f), set: (k, v) => { mem[k] = JSON.stringify(v); } } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common', 'hub.js'), 'utf8'), ctx, { filename: 'hub.js' });
  }
  for (const f of ['util.js', 'data.js', 'world.js', 'shop.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'snake', 'js', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}
const SN = vm.runInContext('SN', load(false));
const D = SN.DATA, SH = SN.Shop, WD = SN.World;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }
function fakeStore(init) {
  const mem = Object.assign({}, init || {});
  return { mem, get: (k, f) => (k in mem ? JSON.parse(mem[k]) : f), set: (k, v) => { mem[k] = JSON.stringify(v); } };
}
// 가짜 지갑을 끼운 새 상점
function fresh(coins) { const w = SH.useWallet(SH.memWallet(coins || 0)); return { st: SH.blank(), w }; }
const run = o => Object.assign({ mode: 'endless', score: 0, golds: 0, eaten: 0, maxLen: 4, maxCombo: 0, powers: 0, portals: 0, wraps: 0, levelsCleared: 0, lvlTop: 0, normalLen: 0, time: 0, games: 1 }, o);

console.log('냠냠 뱀 상점 · 미션 테스트');

test('수치: 꾸미기 6개(기본 무료, 황금이 가장 비쌈) · 강화 5단계 · 시작 아이템 3개까지 · 미션 15개 안팎', () => {
  assert(D.SKINS.length === 6 && D.SKINS[0].price === 0, 'skins');
  const gold = D.SKINS.find(s => s.id === 'gold');
  assert(D.SKINS.every(s => s.price <= gold.price), 'gold most expensive');
  for (const u of D.UPGRADES) assert(u.prices.length === D.UPGRADE_MAX && u.prices.every((p, i) => !i || p > u.prices[i - 1]), 'upgrade prices rise ' + u.id);
  for (const it of D.START_ITEMS) assert(it.max === 3 && D.ITEM.kinds[it.eff], 'start item ' + it.id);
  assert(D.MISSIONS.length >= 14 && D.MISSIONS.length <= 18, 'missions count ' + D.MISSIONS.length);
  const ids = new Set(D.MISSIONS.map(m => m.id));
  assert(ids.size === D.MISSIONS.length, 'mission ids unique');
  // 미션이 읽는 칸은 모두 판 요약에 있다
  const r = SH.runOf(WD.create(32, 20, 1, { mode: 'endless' }));
  for (const m of D.MISSIONS) assert(m.stat in r, 'run has ' + m.stat);
  assert(SN.Render === undefined, 'no render in node');
});

test('처음 상태: 기본 네온만 가짐, 미션 3개, 강화 0', () => {
  const { st } = fresh();
  assert(st.skin === 'neon' && st.skins.neon && !st.skins.gold, 'skins');
  assert(st.missions.length === D.MISSION_SLOTS && new Set(st.missions.map(m => m.id)).size === 3, 'missions 3 unique');
  assert(D.UPGRADES.every(u => st.up[u.id] === 0), 'up 0');
  assert(D.START_ITEMS.every(it => st.items[it.id] === 0), 'items 0');
});

test('코인 공식: 점수/20 + 황금 ×3 + 스테이지 깬 레벨 ×15 + 코인 보너스 강화', () => {
  const { st } = fresh();
  let c = SH.coinsFor(run({ score: 610, golds: 3 }), st);
  assert(c.parts.score === 30 && c.parts.gold === 9 && c.parts.level === 0 && c.total === 39, JSON.stringify(c));
  c = SH.coinsFor(run({ mode: 'stage', score: 400, golds: 2, levelsCleared: 2 }), st);
  assert(c.parts.level === 30 && c.total === 20 + 6 + 30, JSON.stringify(c));
  // 무한 모드는 레벨 코인 없음 (levelsCleared가 잘못 들어와도)
  assert(SH.coinsFor(run({ levelsCleared: 3 }), st).parts.level === 0, 'no level coins in endless');
  st.up.coin = 3;
  c = SH.coinsFor(run({ score: 1000 }), st);
  assert(c.parts.bonus === 15 && c.total === 65, 'bonus 30% ' + JSON.stringify(c));
  assert(SH.coinsFor(run({ score: -5, golds: NaN }), st).total === 0, 'junk run = 0');
});

test('보통 한 판은 코인 20~60개쯤 (봇으로 확인)', () => {
  const got = [];
  for (const seed of [3, 9, 21]) {
    const W = WD.create(24, 15, seed, { mode: 'endless', easy: true });
    W.wait = 0;
    for (let i = 0; i < 60 * 60 && W.phase === 'play'; i++) { if (!W.queue.length) WD.turn(W, WD.botDir(W)); WD.step(W, 1 / 60); }
    got.push(SH.coinsFor(SH.runOf(W), null).total);
  }
  const avg = got.reduce((a, b) => a + b, 0) / got.length;
  assert(avg >= 15 && avg <= 120, 'minute of play coins ' + got.join(','));
});

test('판이 끝나면 지갑에 코인이 들어오고 판 수가 오른다', () => {
  const { st, w } = fresh(10);
  const r = SH.finishRun(st, run({ score: 200, golds: 1 }));
  assert(r.coins === 13 && w.coins() === 23, 'wallet ' + w.coins());
  assert(st.life.games === 1 && st.life.earned === 13, 'life');
});

test('꾸미기 사기: 코인이 있으면 사고 바로 입음, 모자라면 못 삼, 두 번은 못 삼', () => {
  const { st, w } = fresh(350);
  let r = SH.buy(st, 'fire');
  assert(!r.ok && r.reason === 'coins' && w.coins() === 350 && !st.skins.fire, 'not enough');
  r = SH.buy(st, 'rainbow');
  assert(r.ok && r.cost === 300 && w.coins() === 50 && st.skins.rainbow && st.skin === 'rainbow', 'bought');
  r = SH.buy(st, 'rainbow');
  assert(!r.ok && r.reason === 'owned' && w.coins() === 50, 'owned');
  assert(SH.price(st, 'neon') === null, 'free one owned');
  assert(SH.buy(st, 'nope').reason === 'unknown', 'unknown');
});

test('꾸미기 고르기는 가진 것만', () => {
  const { st } = fresh(0);
  assert(!SH.selectSkin(st, 'gold') && st.skin === 'neon', 'not owned');
  assert(!SH.selectSkin(st, 'zzz'), 'unknown');
  st.skins.ice = true;
  assert(SH.selectSkin(st, 'ice') && st.skin === 'ice', 'owned');
  assert(SH.selectSkin(st, 'neon') && st.skin === 'neon', 'back to neon');
});

test('강화 사기: 단계마다 값이 오르고 5단계에서 멈춤', () => {
  const { st, w } = fresh(5000);
  const u = D.UPGRADES.find(x => x.id === 'goldTime');
  let spent = 0;
  for (let i = 0; i < D.UPGRADE_MAX; i++) {
    assert(SH.price(st, 'goldTime') === u.prices[i], 'price ' + i);
    const r = SH.buy(st, 'goldTime');
    assert(r.ok, 'buy ' + i);
    spent += r.cost;
  }
  assert(st.up.goldTime === 5 && w.coins() === 5000 - spent, 'lv5');
  const r = SH.buy(st, 'goldTime');
  assert(!r.ok && r.reason === 'max' && SH.price(st, 'goldTime') === null, 'max');
});

test('시작 아이템 사기: 3개까지, 모자라면 못 삼', () => {
  const { st, w } = fresh(200);
  assert(SH.buy(st, 'slow').ok && SH.buy(st, 'slow').ok && SH.buy(st, 'slow').ok, 'three');
  assert(st.items.slow === 3 && w.coins() === 50, 'count');
  assert(SH.buy(st, 'slow').reason === 'max', 'max 3');
  assert(SH.buy(st, 'double').reason === 'coins', 'poor');
});

test('강화가 규칙에 들어간다: 황금 시간 · 아이템 간격 · 콤보 시간', () => {
  const base = WD.create(32, 20, 5, { mode: 'endless' });
  assert(base.goldLife === D.FOOD.goldLife && base.comboWindow === D.COMBO.window && base.itemGapMul === 1, 'defaults');
  const { st } = fresh();
  st.up.goldTime = 2; st.up.itemFreq = 5; st.up.comboTime = 3;
  const W = WD.create(32, 20, 5, SH.worldOpts(st, {}, { mode: 'endless' }));
  assert(W.mode === 'endless', 'mode kept');
  assert(W.goldLife === D.FOOD.goldLife + 2, 'gold +2s ' + W.goldLife);
  assert(Math.abs(W.itemGapMul - 0.6) < 1e-9 && Math.abs(W.itemT - D.ITEM.first * 0.6) < 1e-9, 'items sooner');
  assert(Math.abs(W.comboWindow - (D.COMBO.window + 1.2)) < 1e-9, 'combo +1.2s');
  // 황금 구슬이 기본 시간이 지나도 식지 않는다 (넓은 판에서 곧장 달린다)
  const G = WD.create(400, 20, 5, SH.worldOpts(st, {}, { mode: 'endless' }));
  G.wait = 0; G.item = null; G.itemT = 999;
  G.food = { x: 0, y: 0, gold: true, born: G.t };
  for (let i = 0; i < (D.FOOD.goldLife + 1) * 20; i++) WD.step(G, 0.05);
  assert(G.phase === 'play' && G.food.gold, 'gold still gold after base life');
  for (let i = 0; i < 2 * 20; i++) WD.step(G, 0.05);
  assert(!G.food.gold, 'cools after upgraded life');
  // 콤보: 기본 창보다 늦게 먹어도 이어진다
  const C = WD.create(200, 20, 2, SH.worldOpts(st, {}, { mode: 'endless' }));
  C.wait = 0; C.item = null; C.itemT = 999;
  const eatAhead = () => { const d = WD.DIRS[C.dir], h = C.snake[0]; C.food = { x: h.x + d[0], y: h.y + d[1], gold: false, born: C.t }; C.acc = 1 / WD.speed(C); WD.step(C, 1e-6); };
  eatAhead();
  C.time += D.COMBO.window + 0.5;
  eatAhead();
  assert(C.combo === 2, 'combo kept with longer window: ' + C.combo);
  // 망가진 강화 값은 무시하고 상한은 5
  const J = WD.create(32, 20, 5, { mode: 'endless', up: { goldTime: 99, itemFreq: 'x', comboTime: -3 } });
  assert(J.goldLife === D.FOOD.goldLife + 5 && J.itemGapMul === 1 && J.comboWindow === D.COMBO.window, 'junk up clamp');
});

test('시작 아이템은 판 시작 때 하나씩 쓰이고 효과가 켜진다', () => {
  const { st } = fresh(1000);
  SH.buy(st, 'ghost'); SH.buy(st, 'ghost'); SH.buy(st, 'double');
  const lo = SH.takeLoadout(st);
  assert(lo.ghost && lo.double && !lo.slow, 'loadout');
  assert(st.items.ghost === 1 && st.items.double === 0, 'consumed one each');
  const W = WD.create(32, 20, 1, SH.worldOpts(st, lo, { mode: 'endless' }));
  const g = D.START_ITEMS.find(i => i.id === 'ghost'), d = D.START_ITEMS.find(i => i.id === 'double');
  assert(W.eff.ghost === g.time && W.eff.double === d.time && W.eff.slow === 0, 'effects on ' + JSON.stringify(W.eff));
  assert(W.startItems.length === 2, 'startItems');
  // 출발 대기 동안은 줄지 않는다
  WD.step(W, D.START.wait * 0.5);
  assert(W.eff.ghost === g.time, 'no drain while waiting');
  // 다음 판: 남은 유령 하나만
  const lo2 = SH.takeLoadout(st);
  assert(lo2.ghost && !lo2.double && st.items.ghost === 0, 'second run');
  assert(Object.keys(SH.takeLoadout(st)).length === 0, 'empty third');
  // 유령 시작: 판 끝을 넘어 반대편으로
  const G = WD.create(32, 20, 1, { mode: 'endless', start: { ghost: true } });
  G.wait = 0; G.item = null; G.itemT = 999; G.food = { x: 0, y: 0, gold: false, born: 0 };
  G.snake = G.snake.map((p, i) => ({ x: 31 - i, y: 5 })); G.prev = G.snake.slice(); G.dir = 'right';
  WD.step(G, 1 / WD.speed(G) + 1e-9);
  assert(G.phase === 'play' && G.snake[0].x === 0 && G.wraps === 1, 'ghost start wraps');
});

test('미션: 누적은 더하고, 한 판은 가장 큰 값, 채우면 끝', () => {
  const { st } = fresh();
  st.missions = [{ id: 'gold5', prog: 0, done: false }, { id: 'len25', prog: 0, done: false }, { id: 'stage4', prog: 0, done: false }];
  let done = SH.progressMissions(st, run({ golds: 3, maxLen: 20 }));
  assert(done.length === 0 && st.missions[0].prog === 3 && st.missions[1].prog === 20, 'partial');
  done = SH.progressMissions(st, run({ golds: 1, maxLen: 12 }));
  assert(st.missions[0].prog === 4 && st.missions[1].prog === 20, 'life adds, run keeps max');
  done = SH.progressMissions(st, run({ golds: 9, maxLen: 30, mode: 'stage', lvlTop: 4 }));
  assert(done.length === 3 && st.missions.every(m => m.done), 'all done ' + done);
  assert(st.missions[0].prog === 5 && st.missions[1].prog === 25, 'clamped to goal');
});

test('미션 받기: 지갑에 보상, 같은 자리에 새 미션, 끝나지 않은 것은 못 받음', () => {
  const { st, w } = fresh(0);
  st.missions = [{ id: 'games5', prog: 5, done: true }, { id: 'len25', prog: 3, done: false }, { id: 'combo8', prog: 0, done: false }];
  assert(SH.claim(st, 1) === 0 && w.coins() === 0, 'not done');
  const got = SH.claim(st, 0);
  const def = SH.missionDef('games5');
  assert(got === def.reward && w.coins() === def.reward, 'reward');
  assert(st.missions.length === 3 && st.missions[0].id !== 'games5' && !st.missions[0].done && st.missions[0].prog === 0, 'replaced in place');
  assert(st.missions[1].id === 'len25' && st.missions[2].id === 'combo8', 'others stay');
  assert(new Set(st.missions.map(m => m.id)).size === 3, 'unique');
  assert(SH.claim(st, 7) === 0, 'bad index');
});

test('보통 미션·스테이지 레벨 미션은 판 요약에서 맞게 잰다', () => {
  const E = WD.create(24, 15, 1, { mode: 'endless', easy: true });
  E.maxLen = 30;
  assert(SH.runOf(E).normalLen === 0, 'easy does not count');
  const N = WD.create(32, 20, 1, { mode: 'endless' });
  N.maxLen = 18;
  assert(SH.runOf(N).normalLen === 18 && SH.runOf(N).games === 1, 'normal counts');
  const S = WD.create(32, 20, 1, { mode: 'stage', level: 3 });
  assert(SH.runOf(S).lvlTop === 0, 'nothing cleared');
  S.levelsCleared = 2;
  assert(SH.runOf(S).lvlTop === 4, 'cleared 3 and 4');
});

test('망가진 저장본도 올바른 모양으로 (가지지 않은 꾸미기는 못 입음)', () => {
  for (const junk of [null, 5, 'x', [], { skins: 'a' }, { missions: [1, null, { id: 'nope' }] }]) {
    const st = SH.load(fakeStore({ 'snake.shop1': JSON.stringify(junk) }));
    assert(st.skin === 'neon' && st.missions.length === 3, 'junk ' + JSON.stringify(junk));
  }
  const st = SH.load(fakeStore({ 'snake.shop1': JSON.stringify({ skin: 'gold', skins: { gold: 'yes', ice: true }, up: { coin: 9, goldTime: 2.7, zzz: 4 }, items: { ghost: 8, slow: -1 },
    missions: [{ id: 'len25', prog: 99 }, { id: 'len25', prog: 1 }, { id: 'gold5', prog: 2 }, { id: 'combo8', prog: 1 }, { id: 't120' }] }) }));
  assert(st.skin === 'neon' && !st.skins.gold && st.skins.ice, 'skin not owned falls back');
  assert(st.up.coin === 5 && st.up.goldTime === 2 && !('zzz' in st.up), 'up clamp');
  assert(st.items.ghost === 3 && st.items.slow === 0, 'items clamp');
  assert(st.missions.length === 3 && st.missions[0].id === 'len25' && st.missions[0].done && st.missions[0].prog === 25, 'missions cleaned');
  assert(st.missions.map(m => m.id).join() === 'len25,gold5,combo8', 'dedupe and slots');
  // 저장하고 다시 읽으면 같다
  const fs2 = fakeStore();
  SH.save(st, fs2);
  const back = SH.load(fs2);
  assert(JSON.stringify(back) === JSON.stringify(st), 'round trip');
});

test('공통 지갑(HUB)과 이어 붙이면 네 게임이 같은 코인을 쓴다', () => {
  const ctx = load(true);
  const H = vm.runInContext('HUB', ctx), SH2 = vm.runInContext('SN', ctx).Shop;
  const st = SH2.blank();
  SH2.finishRun(st, run({ score: 400 }));
  assert(SH2.coins() === 20, 'coins via hub ' + SH2.coins());
  assert(H && H.coins() === 20, 'hub sees it');
  H.addCoins(300);   // 다른 게임이 번 코인
  assert(SH2.buy(st, 'rainbow').ok && H.coins() === 20, 'spent from shared wallet');
  assert(!SH2.buy(st, 'gold').ok && H.coins() === 20, 'not enough in shared wallet');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
