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

test('수치: 캐릭터 5종(기본 무료, 값이 오름) · 강화 5단계 · 시작 아이템 3개까지 · 미션 15개 안팎', () => {
  assert(D.CHARS.length === 5 && D.CHARS[0].price === 0 && D.CHARS[0].id === 'neon', 'chars');
  assert(new Set(D.CHARS.map(c => c.id)).size === 5, 'char ids unique');
  assert(new Set(D.CHARS.map(c => c.price)).size === 5 && D.CHARS.every((c, i) => !i || c.price > D.CHARS[i - 1].price), 'prices unique and rising');
  for (const c of D.CHARS) assert(c.name && c.look && c.trait && c.traits && Object.keys(c.traits).length >= 1 && /^#[0-9a-f]{6}$/i.test(c.color), 'char fields ' + c.id);
  assert(D.SKINS === undefined, 'old skins removed');
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

test('처음 상태: 네온 뱀만 가짐, 미션 3개, 강화 0', () => {
  const { st } = fresh();
  assert(st.v === 2 && st.char === 'neon' && st.chars.neon && Object.keys(st.chars).length === 1, 'chars');
  assert(!('skin' in st) && !('skins' in st), 'no old keys');
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

test('캐릭터 사기: 코인이 있으면 사고 바로 고름, 모자라면 못 삼, 두 번은 못 삼', () => {
  const { st, w } = fresh(350);
  let r = SH.buy(st, 'dragon');
  assert(!r.ok && r.reason === 'coins' && w.coins() === 350 && !st.chars.dragon, 'not enough');
  r = SH.buy(st, 'robot');
  assert(r.ok && r.cost === 300 && w.coins() === 50 && st.chars.robot && st.char === 'robot', 'bought');
  r = SH.buy(st, 'robot');
  assert(!r.ok && r.reason === 'owned' && w.coins() === 50, 'owned');
  assert(SH.price(st, 'neon') === null, 'free one owned');
  assert(SH.buy(st, 'nope').reason === 'unknown', 'unknown');
  assert(SH.buy(st, 'rainbow').reason === 'unknown', 'old skin id not for sale');
});

test('캐릭터 고르기는 가진 것만 (selectSkin은 같은 것)', () => {
  const { st } = fresh(0);
  assert(!SH.selectChar(st, 'galaxy') && st.char === 'neon', 'not owned');
  assert(!SH.selectChar(st, 'zzz') && !SH.selectChar(st, 'gold'), 'unknown');
  st.chars.bug = true;
  assert(SH.selectChar(st, 'bug') && st.char === 'bug', 'owned');
  assert(SH.selectSkin(st, 'neon') && st.char === 'neon', 'alias back to neon');
  // 고른 캐릭터가 판 옵션으로 들어간다
  st.char = 'bug';
  assert(SH.worldOpts(st, {}, { mode: 'endless' }).char === 'bug', 'worldOpts char');
  assert(WD.create(32, 20, 1, SH.worldOpts(st, {}, { mode: 'endless' })).char === 'bug', 'world char');
});

test('예전 꾸미기 저장본: 비슷한 캐릭터로 바꾸고, 맞는 것이 없으면 값을 한 번만 돌려준다', () => {
  const w = SH.useWallet(SH.memWallet(10));
  const store = fakeStore({ 'snake.shop1': JSON.stringify({ v: 1, skin: 'fire', skins: { neon: true, rainbow: true, fire: true, ice: true, gold: true }, up: { coin: 2 }, items: { slow: 1 }, missions: [], mseed: 5, life: { earned: 900, games: 4 } }) });
  const st = SH.load(store);
  assert(st.chars.neon && st.chars.bug && st.chars.dragon && !st.chars.galaxy && !st.chars.robot, 'mapped ' + JSON.stringify(st.chars));
  assert(st.char === 'dragon', 'selected fire becomes dragon ' + st.char);
  assert(w.coins() === 10 + 900 + 1400, 'ice and gold refunded ' + w.coins());
  assert(st.up.coin === 2 && st.items.slow === 1 && st.life.games === 4, 'other things kept');
  assert(!('refund' in st) && !('migrated' in st) && !('skins' in st), 'no leftovers');
  const m = SH.takeMigration();
  assert(m && m.refund === 2300 && m.from.length === 4 && SH.takeMigration() === null, 'migration note once');
  // 바로 저장되어 다시 읽어도 두 번 돌려주지 않는다
  const saved = JSON.parse(store.mem['snake.shop1']);
  assert(saved.v === 2 && saved.chars.dragon && !saved.skins, 'saved as v2');
  const again = SH.load(store);
  assert(w.coins() === 2310 && again.char === 'dragon' && SH.takeMigration() === null, 'no second refund');
  // 고르던 꾸미기가 돌려받은 것(얼음)이면 네온 뱀으로
  const w2 = SH.useWallet(SH.memWallet(0));
  const st2 = SH.load(fakeStore({ 'snake.shop1': JSON.stringify({ skin: 'ice', skins: { neon: true, ice: true, star: true } }) }));
  assert(st2.char === 'neon' && st2.chars.galaxy && w2.coins() === 900, 'ice refunded, star becomes galaxy');
  assert(SH.takeMigration().refund === 900, 'note for second');
  // 꾸미기를 산 적 없는 옛 저장본: 바뀌는 것 없음
  const w3 = SH.useWallet(SH.memWallet(0));
  const st3 = SH.load(fakeStore({ 'snake.shop1': JSON.stringify({ skin: 'neon', skins: { neon: true } }) }));
  assert(st3.char === 'neon' && Object.keys(st3.chars).length === 1 && w3.coins() === 0 && SH.takeMigration() === null, 'plain old save');
  // 옛 id 표는 없는 캐릭터를 가리키지 않고, 맞는 캐릭터가 없는 것은 돌려줄 값이 있다
  for (const [id, m2] of Object.entries(D.OLD_SKINS)) assert(m2.to ? !!SH.charDef(m2.to) : m2.refund > 0, 'old map ' + id);
});

test('캐릭터 특기가 규칙에 들어간다 (char를 안 넘기면 특기 없음)', () => {
  const base = WD.create(32, 20, 5, { mode: 'endless' });
  const mk = id => WD.create(32, 20, 5, { mode: 'endless', char: id });
  const C = id => D.CHARS.find(c => c.id === id).traits;
  assert(base.speedMul === 1 && base.startGhost === 0 && base.ghostMul === 1 && base.char === 'neon', 'no char = no trait');
  // 네온 뱀: 조금 느긋하게
  const N = mk('neon');
  assert(Math.abs(WD.speed(N) - WD.speed(base) * C('neon').speedMul) < 1e-9 && WD.speed(N) < WD.speed(base), 'neon slower');
  // 로봇 뱀: 아이템이 더 자주
  const R = mk('robot');
  assert(Math.abs(R.itemGapMul - C('robot').itemMul) < 1e-9 && R.itemT < base.itemT, 'robot items sooner');
  // 꼬마 용: 콤보 시간 +
  const G = mk('dragon');
  assert(Math.abs(G.comboWindow - (D.COMBO.window + C('dragon').comboPlus)) < 1e-9, 'dragon combo');
  G.wait = 0; G.item = null; G.itemT = 999;
  const eatAhead = () => { const d = WD.DIRS[G.dir], h = G.snake[0]; G.food = { x: h.x + d[0], y: h.y + d[1], gold: false, born: G.t }; G.acc = 1 / WD.speed(G); WD.step(G, 1e-6); };
  eatAhead(); G.time += D.COMBO.window + 0.5; eatAhead();
  assert(G.combo === 2, 'dragon keeps combo past base window');
  // 무지개 애벌레: 황금 구슬이 더 오래
  assert(mk('bug').goldLife === D.FOOD.goldLife + C('bug').goldPlus, 'bug gold life');
  // 은하 해룡: 출발 유령 (대기 동안 줄지 않음) + 유령 아이템 더 오래, 다음 레벨에도 출발 유령
  const X = mk('galaxy');
  assert(X.eff.ghost === C('galaxy').startGhost && X.eff.slow === 0, 'galaxy start ghost');
  WD.step(X, D.START.wait * 0.5);
  assert(X.eff.ghost === C('galaxy').startGhost, 'no drain while waiting');
  const Y = mk('galaxy'); Y.wait = 0; Y.eff.ghost = 0; Y.food = { x: 0, y: 0, gold: false, born: 0 };
  const h = Y.snake[0]; Y.item = { kind: 'ghost', x: h.x + 1, y: h.y, life: 8, born: 0 };
  WD.step(Y, 1 / WD.speed(Y) + 1e-9);
  assert(Math.abs(Y.eff.ghost - D.ITEM.kinds.ghost.time * C('galaxy').ghostMul) < 1e-6, 'galaxy ghost item longer ' + Y.eff.ghost);
  const S = WD.create(32, 20, 5, { mode: 'stage', level: 1, char: 'galaxy' });
  S.eff.ghost = 0; WD.nextLevel(S);
  assert(S.eff.ghost === C('galaxy').startGhost, 'start ghost again on next level');
  // 강화와 함께: 강화 위에 특기를 더한다
  const U = WD.create(32, 20, 5, { mode: 'endless', char: 'bug', up: { goldTime: 2 } });
  assert(U.goldLife === D.FOOD.goldLife + 2 + C('bug').goldPlus, 'upgrade + trait stack');
  const V = WD.create(32, 20, 5, { mode: 'endless', char: 'robot', up: { itemFreq: 5 } });
  assert(V.itemGapMul >= 0.3 && V.itemGapMul < 0.6, 'item floor ' + V.itemGapMul);
  // 모르는 캐릭터는 특기 없이
  const Z = WD.create(32, 20, 5, { mode: 'endless', char: 'zzz' });
  assert(Z.char === 'neon' && Z.speedMul === 1 && Z.itemGapMul === 1, 'unknown char no trait');
  // 특기는 서로 다른 한 가지 쪽만 돕는다 (어느 하나가 모두 낫지 않게)
  const keys = D.CHARS.map(c => Object.keys(c.traits).sort().join());
  assert(new Set(keys).size === 5, 'different traits');
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

test('망가진 저장본도 올바른 모양으로 (가지지 않은 캐릭터는 못 고름)', () => {
  SH.useWallet(SH.memWallet(0));
  for (const junk of [null, 5, 'x', [], { skins: 'a' }, { chars: 'a', char: 7 }, { chars: [], skins: [] }, { missions: [1, null, { id: 'nope' }] }]) {
    const st = SH.load(fakeStore({ 'snake.shop1': JSON.stringify(junk) }));
    assert(st.char === 'neon' && st.chars.neon && Object.keys(st.chars).length === 1 && st.missions.length === 3, 'junk ' + JSON.stringify(junk));
  }
  assert(SH.coins() === 0, 'junk refunds nothing');
  const st = SH.load(fakeStore({ 'snake.shop1': JSON.stringify({ v: 2, char: 'galaxy', chars: { galaxy: 'yes', bug: true, zzz: true }, up: { coin: 9, goldTime: 2.7, zzz: 4 }, items: { ghost: 8, slow: -1 },
    missions: [{ id: 'len25', prog: 99 }, { id: 'len25', prog: 1 }, { id: 'gold5', prog: 2 }, { id: 'combo8', prog: 1 }, { id: 't120' }] }) }));
  assert(st.char === 'neon' && !st.chars.galaxy && st.chars.bug && !st.chars.zzz, 'char not owned falls back');
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
  assert(SH2.buy(st, 'robot').ok && H.coins() === 20, 'spent from shared wallet');
  assert(!SH2.buy(st, 'galaxy').ok && H.coins() === 20, 'not enough in shared wallet');
});

test('놀이 본부: 판 값(hubStats)으로 스티커가 붙고, 알아서 맞추기 배율이 판에 들어간다', () => {
  const ctx = load(true);
  const H = vm.runInContext('HUB', ctx), S2 = vm.runInContext('SN', ctx), W2 = S2.World, SH2 = S2.Shop;
  // 무한: 라이벌보다 많이 먹고 길이 31, 황금 5
  const W = W2.create(32, 20, 1, { mode: 'endless' });
  W.maxLen = 31; W.golds = 5; W.eaten = 30; W.rival.met = true; W.rival.eaten = 12;
  H.reportRun('snake', W2.hubStats(W), 60);
  const got = H.stickers().filter(t => t.got).map(t => t.id).sort();
  assert(JSON.stringify(got) === JSON.stringify(['sn_first', 'sn_gold', 'sn_len30', 'sn_rival']), 'stickers ' + got.join(','));
  // 스테이지 레벨 5까지 깸 → 스테이지 스티커
  const S = W2.create(32, 20, 1, { mode: 'stage', level: 1 });
  S.levelsCleared = 5;
  H.reportRun('snake', W2.hubStats(S), 60);
  assert(H.stickers().find(t => t.id === 'sn_stage').got, 'stage sticker');
  // 오늘의 미션 값 이름도 맞다 (len · golds · orbs)
  for (const m of H.DAILY.snake) assert(m.stat === 'games' || m.stat in W2.hubStats(W), 'daily stat ' + m.stat);
  // 판 값 이름: len · golds · orbs · level · rivalWin · planet · gifts · fevers · giants
  assert(JSON.stringify(Object.keys(W2.hubStats(W)).sort()) === JSON.stringify(['fevers', 'giants', 'gifts', 'golds', 'len', 'level', 'orbs', 'planet', 'rivalWin']), 'hub stat keys');
  assert(W2.hubStats(W).planet === 1, 'planet starts at mercury');
  // 알아서 맞추기: 처음 두 판은 1, 잘하면 올라가고 판 옵션으로 들어간다
  assert(H.adaptMul('snake', 'normal') === 1, 'warm');
  W.eaten = D.ADAPT.target.normal * 2;
  for (let i = 0; i < 4; i++) H.adaptRun('snake', 'normal', W2.adaptPerf(W));
  const mul = H.adaptMul('snake', 'normal');
  assert(mul > 1 && mul <= 1.12, 'harder after good runs ' + mul);
  assert(H.adaptMul('snake', 'easy') === 1, 'easy separate');
  const st = SH2.blank();
  const G = W2.create(32, 20, 2, SH2.worldOpts(st, {}, { mode: 'endless', adapt: mul }));
  assert(G.adapt === mul && G.rival.speed > D.RIVAL.levels.normal.speed, 'adapt reaches world');
  const E = W2.create(24, 15, 2, { mode: 'endless', easy: true });
  E.eaten = 1;
  for (let i = 0; i < 6; i++) H.adaptRun('snake', 'easy', W2.adaptPerf(E));
  assert(H.adaptMul('snake', 'easy') < 1 && H.adaptMul('snake', 'easy') >= 0.85, 'easier after short runs');
});

test('난이도 저장: snake.diff가 있으면 그것, 없으면 예전 snake.easy(true 쉬움 · false 보통), 처음은 쉬움', () => {
  assert(SH.diffFrom(null, null) === 'easy' && SH.diffFrom(undefined, true) === 'easy' && SH.diffFrom(null, false) === 'normal', 'old easy');
  for (const d of ['easy', 'normal', 'hard']) assert(SH.diffFrom(d, false) === d && SH.diffFrom(d, true) === d, 'new key wins ' + d);
  assert(SH.diffFrom('super', false) === 'normal', 'bad value falls back');
});

test('난이도별 최고 기록: 고른 난이도만 오르고 다른 난이도는 그대로', () => {
  const best = { easy: { score: 0, len: 0 }, normal: { score: 0, len: 0 }, hard: { score: 0, len: 0 } };
  let r = SH.recordBest(best, 'hard', 300, 12);
  assert(r.score && r.len && best.hard.score === 300 && best.hard.len === 12, 'hard best');
  assert(best.easy.score === 0 && best.normal.score === 0, 'others untouched');
  r = SH.recordBest(best, 'hard', 200, 15);
  assert(!r.score && r.len && best.hard.score === 300 && best.hard.len === 15, 'only len');
  r = SH.recordBest(best, 'normal', 0, 3);
  assert(!r.score && r.len, 'zero score is no record');
  // 알아서 맞추기 열쇠도 난이도별 (어려움 따로)
  const ctx = load(true), H = vm.runInContext('HUB', ctx);
  for (let i = 0; i < 4; i++) H.adaptRun('snake', 'hard', 2);
  assert(H.adaptMul('snake', 'hard') > 1 && H.adaptMul('snake', 'normal') === 1, 'hard key separate');
});

test('선물 상자: 코인은 판 끝 코인에 더하고, 다음 판 시작 아이템은 가방에 (가득이면 코인)', () => {
  const { st, w } = fresh(0);
  const r = SH.finishRun(st, run({ score: 400, giftCoins: 25, giftStart: ['slow'] }));
  assert(r.parts.gift === 25 && r.coins === 20 + 25 && w.coins() === 45, 'gift coins ' + JSON.stringify(r));
  assert(st.items.slow === 1, 'start item added');
  st.items.ghost = 3;
  const r2 = SH.finishRun(st, run({ giftStart: ['ghost'] }));
  assert(st.items.ghost === 3 && r2.parts.gift === D.GIFT.fullCoins && r2.coins === D.GIFT.fullCoins, 'full bag gives coins');
  // 실제 판에서 연 선물이 판 요약으로 이어진다
  const W = WD.create(200, 20, 3, { mode: 'endless', rival: false });
  W.gift = { x: 5, y: 5, life: 5, born: 0 };
  WD.openGift(W);
  const ro = SH.runOf(W);
  assert(ro.gifts === 1 && (ro.giftCoins > 0 || ro.giftStart.length === 1 || W.powers === 1), 'run has gift');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
