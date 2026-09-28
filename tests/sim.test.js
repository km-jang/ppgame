'use strict';
// 게임 규칙 테스트. 브라우저 없이 world.js를 그대로 돌린다.
// 실행: node tests/sim.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
// 우주 여행 도감 (외계 행성 여덟, 날씨). index.html처럼 data.js보다 먼저
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common', 'worlds.js'), 'utf8'), ctx, { filename: 'worlds.js' });
for (const f of ['util.js', 'data.js', 'world.js', 'shop.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game', 'js', f), 'utf8'), ctx, { filename: f });
}
const NG = vm.runInContext('NG', ctx);
const { createWorld, step, pickCard, buildWave, drawCards } = NG.World;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

const DT = 1 / 60;
const IDLE = { moveX: 0, moveY: 0, aimAngle: null, dash: false };

// 원을 그리며 도망다니고 가끔 대시하는 봇
function bot(W) {
  const t = W.t;
  return { moveX: Math.cos(t * 0.7), moveY: Math.sin(t * 0.9), aimAngle: null, dash: Math.floor(t * 60) % 90 === 0 };
}

function finite(W) {
  const p = W.player;
  for (const v of [p.x, p.y, p.hp, p.aim, W.score]) if (!Number.isFinite(v)) return false;
  for (const e of W.enemies) if (!Number.isFinite(e.x + e.y + e.hp)) return false;
  for (const b of W.bullets) if (!Number.isFinite(b.x + b.y)) return false;
  return true;
}

// 무적 봇: 체력을 계속 채워 오래 돌려 본다
function runLong(seed, frames, pickFirst) {
  const W = createWorld(800, 600, seed);
  for (let i = 0; i < frames; i++) {
    if (W.phase === 'cards') pickCard(W, pickFirst ? 0 : i % 3);
    W.player.hp = W.player.maxHp;
    step(W, bot(W), DT);
    W.events.length = 0;
    if (!finite(W)) throw new Error('NaN at frame ' + i);
  }
  return W;
}

console.log('N-GUN 규칙 테스트');

test('처음 상태', () => {
  const W = createWorld(800, 600, 1);
  assert(W.phase === 'play' && W.wave === 1, 'wave 1 play');
  assert(W.player.x === 400 && W.player.y === 300, 'player centered');
  assert(W.spawnQueue.length === Math.round(8 * NG.DATA.DIFFICULTY.normal.count), '1웨이브 적 수 ' + W.spawnQueue.length);
});

test('웨이브 구성: 보스는 5의 배수에서만, 등장 웨이브 지킴', () => {
  const rand = NG.rng(7);
  for (let n = 1; n <= 20; n++) {
    const q = buildWave(n, rand);
    assert(q.includes('boss') === (n % 5 === 0), 'boss at ' + n);
    if (n < 2) assert(!q.includes('runner'), 'runner early');
    if (n < 3) assert(!q.includes('shooter'), 'shooter early');
    if (n < 6) assert(!q.includes('splitter'), 'splitter early');
  }
});

test('같은 시드면 같은 결과 (결정적)', () => {
  const a = runLong(42, 3000, true), b = runLong(42, 3000, true);
  assert(a.score === b.score && a.wave === b.wave && a.stats.kills === b.stats.kills, 'determinism');
});

test('가만히 있어도 사격하고 적을 잡는다', () => {
  const W = createWorld(800, 600, 3);
  for (let i = 0; i < 60 * 8; i++) { W.player.hp = 5; step(W, IDLE, DT); }
  assert(W.stats.shots > 0, 'shots');
  assert(W.stats.kills > 0, 'kills');
  assert(W.score > 0, 'score');
});

test('웨이브 클리어 → 카드 3장 → 선택 → 다음 웨이브', () => {
  const W = createWorld(800, 600, 5);
  let guard = 0;
  while (W.phase !== 'cards' && guard++ < 60 * 120) { W.player.hp = 5; step(W, bot(W), DT); }
  assert(W.phase === 'cards', '카드 화면 도달');
  assert(W.cards.length === 3 && new Set(W.cards.map(c => c.id)).size === 3, '서로 다른 3장');
  const id = W.cards[0].id;
  assert(pickCard(W, 0), 'pick ok');
  assert(W.phase === 'play' && W.wave === 2 && W.player.lvl[id] === 1, 'next wave');
  assert(!pickCard(W, 0), '플레이 중엔 선택 불가');
});

test('보스 웨이브까지 진행하고 보스를 잡는다', () => {
  const W = runLong(11, 60 * 60 * 6, false);
  assert(W.wave > 5, 'wave ' + W.wave);
  assert(W.bossKills >= 1, 'boss kills ' + W.bossKills);
});

test('모든 카드를 최대까지 적용해도 안전', () => {
  const W = createWorld(800, 600, 9);
  const p = W.player;
  for (const c of NG.DATA.CARDS) for (let i = 0; i < c.max; i++) { c.apply(p); p.lvl[c.id] = (p.lvl[c.id] || 0) + 1; }
  assert(p.gun.barrels === 12, 'barrels ' + p.gun.barrels);
  for (let i = 0; i < 60 * 30; i++) {
    if (W.phase === 'cards') pickCard(W, 0);
    p.hp = p.maxHp;
    step(W, bot(W), DT);
    if (!finite(W)) throw new Error('NaN');
  }
  // 다 찍은 뒤엔 보충 카드만 나온다
  const cards = drawCards(W, 3);
  assert(cards.every(c => c.id === 'patch'), 'fallback cards');
});

test('카드 최대치를 넘겨 나오지 않는다', () => {
  const W = createWorld(800, 600, 13);
  W.player.lvl.barrel = NG.DATA.CARDS.find(c => c.id === 'barrel').max;
  for (let i = 0; i < 200; i++) assert(!drawCards(W, 3).some(c => c.id === 'barrel'), 'maxed card offered');
});

test('맞으면 체력이 줄고 무적 시간 동안은 안 줄어든다', () => {
  const W = createWorld(800, 600, 17);
  const p = W.player;
  W.eBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, life: 5 });
  step(W, IDLE, DT);
  assert(p.hp === 4, 'hp ' + p.hp);
  W.eBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, life: 5 });
  step(W, IDLE, DT);
  assert(p.hp === 4, 'iframe');
});

test('대시 중엔 무적', () => {
  const W = createWorld(800, 600, 19);
  const p = W.player;
  step(W, { moveX: 1, moveY: 0, aimAngle: null, dash: true }, DT);
  assert(p.dashT > 0, 'dashing');
  W.eBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, life: 5 });
  step(W, IDLE, DT);
  assert(p.hp === p.maxHp, 'no damage while dashing');
});

test('체력 0이면 게임 오버, 이후 진행 멈춤', () => {
  const W = createWorld(800, 600, 23);
  let guard = 0;
  while (W.phase !== 'over' && guard++ < 60 * 600) {
    if (W.phase === 'cards') pickCard(W, 0);
    step(W, IDLE, DT);
  }
  assert(W.phase === 'over' && W.player.hp === 0, 'game over reached');
  const t = W.t;
  step(W, IDLE, DT);
  assert(W.t === t, 'time frozen');
});

test('분열체는 죽으면 새끼 2마리', () => {
  const W = createWorld(800, 600, 29);
  W.spawnQueue.length = 0;
  W.enemies.length = 0;
  W.wave = 6;
  const before = W.stats.kills;
  // 직접 만들고 바로 죽인다
  const e = { id: 999, type: 'splitter', def: NG.DATA.ENEMIES.splitter, x: 100, y: 100, r: 20, hp: 0.5, maxHp: 8, speed: 60,
    vx: 0, vy: 0, spawnT: 0, flash: 0, droneHit: 0, dead: false, ang: 0, cd: 0, ringCd: 0, aimCd: 0, summonCd: 0, strafe: 1 };
  W.enemies.push(e);
  W.bullets.push({ x: 100, y: 100, vx: 0, vy: 0, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
  step(W, { moveX: 0, moveY: 0, aimAngle: 0, dash: false }, DT);
  assert(W.stats.kills === before + 1, 'killed');
  assert(W.enemies.filter(x => x.type === 'mini').length === 2, 'two minis');
});

test('관통탄은 여러 마리를, 도탄은 벽에서 튕긴다', () => {
  const W = createWorld(800, 600, 31);
  W.spawnQueue.length = 0;
  const mk = (x) => ({ id: W.nextId++, type: 'tank', def: NG.DATA.ENEMIES.tank, x, y: 50, r: 10, hp: 100, maxHp: 100, speed: 0,
    vx: 0, vy: 0, spawnT: 0, flash: 0, droneHit: 0, dead: false, ang: 0, cd: 0, ringCd: 0, aimCd: 0, summonCd: 0, strafe: 1 });
  W.enemies = [mk(200), mk(260), mk(320)];
  W.player.gun.crit = 0;
  W.bullets.push({ x: 170, y: 50, vx: 3000, vy: 0, r: 4, dmg: 1, life: 1, pierce: 2, bounce: 0, hits: [] });
  for (let i = 0; i < 16; i++) step(W, { moveX: 0, moveY: 0, aimAngle: Math.PI, dash: false }, 1 / 240);
  const hit = W.enemies.filter(e => e.hp < 100).length;
  assert(hit === 3, 'pierce hits ' + hit);

  const b = { x: 790, y: 300, vx: 500, vy: 0, r: 4, dmg: 1, life: 1, pierce: 0, bounce: 1, hits: [] };
  W.enemies = [];
  W.bullets = [b];
  step(W, IDLE, DT);
  assert(b.vx < 0 && b.bounce === 0, 'bounced');
});


test('난이도: 체력·적 수·적 체력·점수 배율이 반영된다', () => {
  const E = createWorld(800, 600, 1, 'easy'), N = createWorld(800, 600, 1), H = createWorld(800, 600, 1, 'hard');
  assert(E.player.maxHp === 8 && N.player.maxHp === 5 && H.player.maxHp === 4, 'hp');
  assert(E.spawnQueue.length < N.spawnQueue.length && N.spawnQueue.length < H.spawnQueue.length, 'count');
  for (const W of [E, N, H]) { W.spawnTimer = 0; step(W, IDLE, DT); }
  const hp = W => W.enemies[0].maxHp;
  assert(hp(E) < hp(N) && hp(N) < hp(H), 'enemy hp');
  assert(createWorld(800, 600, 1, 'nope').diff.id === 'normal', 'unknown -> normal');
});

// 생존 시간은 카드 운(총열이 몇 번 나오나)과 진행 속도(쉬움은 빨리 잡아 보스를 일찍 만남)에 흔들리고,
// 맞은 횟수는 맞은 뒤 무적 시간 때문에 천장이 있다. 그래서 첫 웨이브에 붙잡아 두고(위력 0)
// 처음 맞기까지 걸린 시간을 잰다 (가만히 있는 봇, 시드 16개 평균)
test('어려울수록 빨리 맞는다 (첫 웨이브에 가만히 있는 봇, 처음 맞기까지 걸린 시간)', () => {
  const first = d => {
    let total = 0;
    for (let s = 1; s <= 16; s++) {
      const W = createWorld(900, 650, s, d);
      const p = W.player, hp0 = p.hp;
      p.gun.dmg = 0;
      let i = 0;
      while (p.hp === hp0 && W.phase !== 'over' && i++ < 60 * 120) { step(W, IDLE, DT); W.events.length = 0; }
      total += W.t;
    }
    return total / 16;
  };
  const e = first('easy'), n = first('normal'), h = first('hard');
  console.log('       처음 맞기까지(초) 쉬움 ' + e.toFixed(1) + ' / 보통 ' + n.toFixed(1) + ' / 어려움 ' + h.toFixed(1));
  assert(e > n && n > h, 'ordering');
});


test('히트스톱: 중장갑 처치 순간 시간이 멈췄다가 다시 흐른다', () => {
  const W = createWorld(800, 600, 41);
  W.spawnQueue.length = 0;
  W.enemies = [{ id: 900, type: 'tank', def: NG.DATA.ENEMIES.tank, x: 100, y: 100, r: 26, hp: 0.5, maxHp: 18, speed: 0,
    vx: 0, vy: 0, spawnT: 0, flash: 0, droneHit: 0, dead: false, ang: 0, cd: 0, ringCd: 0, aimCd: 0, summonCd: 0, strafe: 1 }];
  W.bullets.push({ x: 100, y: 100, vx: 500, vy: 0, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
  step(W, IDLE, DT);
  assert(W.hitstop > 0, 'hitstop set');
  assert(W.particles.some(q => q.shard) && W.particles.some(q => q.pop), 'shards + pop');
  const t = W.t;
  step(W, IDLE, DT);
  assert(W.t === t, 'frozen during hitstop');
  for (let i = 0; i < 10; i++) step(W, IDLE, DT);
  assert(W.t > t, 'time resumes');
});

test('보스 처치: 느린 화면 + 연쇄 폭발이 끝난 뒤에 카드 화면', () => {
  const W = createWorld(800, 600, 43);
  W.spawnQueue.length = 0;
  W.wave = 5; W.bossWave = true;
  W.enemies = [{ id: 901, type: 'boss', def: NG.DATA.ENEMIES.boss, x: 400, y: 100, r: 58, hp: 0.5, maxHp: 320, speed: 0,
    vx: 0, vy: 0, spawnT: 0, flash: 0, droneHit: 0, dead: false, ang: 0, cd: 0, ringCd: 99, aimCd: 99, summonCd: 99, strafe: 1 }];
  W.bullets.push({ x: 400, y: 100, vx: 0, vy: -500, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
  step(W, IDLE, DT);
  assert(W.bossKills === 1 && W.slow > 0 && W.booms.length === NG.DATA.IMPACT.bossBooms, 'boss death sequence');
  let frames = 0;
  while (W.phase === 'play' && frames++ < 60 * 20) step(W, IDLE, DT);
  assert(W.phase === 'cards', 'cards eventually');
  assert(W.booms.length === 0, 'all booms done before cards');
});

// 필살기
const U = NG.DATA.ULT;
function clearWorld(seed) {
  const W = createWorld(800, 600, seed);
  W.spawnQueue.length = 0; W.enemies.length = 0; W.banner = 0;
  W.meteorT = 1e9; // 운석은 따로 시험한다
  return W;
}
function putEnemy(W, type, x, y, hp) {
  const def = NG.DATA.ENEMIES[type];
  const e = { id: W.nextId++, type, def, x, y, r: def.r, hp: hp == null ? def.hp : hp, maxHp: hp == null ? def.hp : hp, speed: 0,
    vx: 0, vy: 0, spawnT: 0, flash: 0, droneHit: 0, dead: false, ang: 0, cd: 99, ringCd: 99, aimCd: 99, summonCd: 99, strafe: 1 };
  W.enemies.push(e);
  return e;
}

test('필살기: 적을 때리면 게이지가 차고, 가득 차기 전엔 안 나간다', () => {
  const W = createWorld(800, 600, 50);
  assert(W.player.ult === 0, 'starts empty');
  assert(!NG.World.useUlt(W), 'empty gauge cannot fire');
  let frames = 0;
  while (W.player.ult < U.need && frames++ < 60 * 120) {
    if (W.phase === 'cards') pickCard(W, 0);
    W.player.hp = W.player.maxHp;
    step(W, bot(W), DT);
    W.events.length = 0;
  }
  assert(W.player.ult >= U.need, 'gauge fills from attacks: ' + W.player.ult.toFixed(1));
  // 첫 보스(5웨이브) 전에 한 번은 쓸 수 있어야 한다
  assert(W.wave <= 4, 'ready by wave 4, got wave ' + W.wave);
});

test('필살기: 웨이브가 올라 적이 단단해져도 한 마리당 차는 양은 같다', () => {
  const W = clearWorld(51);
  const a = putEnemy(W, 'grunt', 100, 100, 3);
  W.bullets.push({ x: 100, y: 100, vx: 0, vy: -1, r: 4, dmg: 100, life: 1, pierce: 0, bounce: 0, hits: [] });
  step(W, IDLE, DT);
  const g1 = W.player.ult;
  const W2 = clearWorld(52);
  W2.wave = 12;
  putEnemy(W2, 'grunt', 100, 100, 3 * 2.65);
  W2.bullets.push({ x: 100, y: 100, vx: 0, vy: -1, r: 4, dmg: 100, life: 1, pierce: 0, bounce: 0, hits: [] });
  step(W2, IDLE, DT);
  assert(a.dead && Math.abs(g1 - 3) < 1e-6, 'grunt = 3: ' + g1);
  assert(Math.abs(W2.player.ult - g1) < 1e-6, 'same gain: ' + W2.player.ult);
});

test('필살기: 발동하면 충격파가 퍼져 화면의 적을 치고 적 탄을 지운다, 게이지는 0으로', () => {
  const W = clearWorld(53);
  const p = W.player;
  p.ult = U.need;
  p.fireCd = 1e9; // 총은 쉬게 해서 충격파 피해만 잰다
  const near = putEnemy(W, 'grunt', p.x + 60, p.y);
  const far = putEnemy(W, 'tank', 20 + 26, 20 + 26);
  const boss = putEnemy(W, 'boss', 700, 500, 1000);
  for (let i = 0; i < 10; i++) W.eBullets.push({ x: 50 + i * 70, y: 560, vx: 0, vy: 0, r: 5, life: 6 });
  step(W, Object.assign({}, IDLE, { ult: true }), DT);
  assert(p.ult === 0 && W.shocks.length === 1 && W.stats.ults === 1, 'fired');
  assert(p.iframe > 0.5, 'invulnerable while it goes');
  for (let i = 0; i < 90; i++) step(W, IDLE, DT);
  assert(near.dead && far.dead, 'all normal enemies on screen hit');
  const dmg = NG.World.ultDamage(W);
  assert(Math.abs((1000 - boss.hp) - dmg * U.bossMul) < 1e-6, 'boss takes reduced damage once: ' + (1000 - boss.hp));
  assert(W.eBullets.length === 0, 'enemy bullets cleared');
  assert(W.shocks.length === 0, 'shock done');
  assert(p.ult === 0, 'ult damage does not refill the gauge: ' + p.ult);
});

test('필살기: 피해는 총이 셀수록, 웨이브가 오를수록 크다', () => {
  const W = createWorld(800, 600, 54);
  const base = NG.World.ultDamage(W);
  const eh = W.diff.enemyHp;
  assert(base === NG.DATA.GUN.dmg * U.minMul * eh, 'min damage at start: ' + base);
  assert(base > NG.DATA.ENEMIES.tank.hp, 'first special clears a wave-1 heavy');
  W.player.gun.barrels = 6; W.player.gun.rate = 8; W.player.gun.dmg = 2;
  assert(Math.abs(NG.World.ultDamage(W) - 2 * 8 * 6 * U.sec * eh) < 1e-9, 'scales with gun');
  W.wave = 11;
  assert(Math.abs(NG.World.ultDamage(W) - 2 * 8 * 6 * U.sec * 2.5 * eh) < 1e-9, 'and with wave');
});

test('점검: 총이 커져도 필살기 한 번에 보스 체력의 bossCap까지만 깎는다', () => {
  const W = clearWorld(56);
  const p = W.player;
  p.gun.barrels = 12; p.gun.rate = 20; p.gun.dmg = 50; p.fireCd = 1e9; p.ult = U.need;
  const boss = putEnemy(W, 'boss', 600, 400, 2000);
  step(W, Object.assign({}, IDLE, { ult: true }), DT);
  for (let i = 0; i < 60; i++) step(W, IDLE, DT);
  assert(!boss.dead && Math.abs((2000 - boss.hp) - 2000 * U.bossCap) < 1e-6, 'capped: ' + (2000 - boss.hp));
});

test('필살기: 보스에게 준 피해는 덜 찬다', () => {
  const W = clearWorld(55);
  putEnemy(W, 'boss', 100, 100, 320);
  W.bullets.push({ x: 100, y: 100, vx: 0, vy: -1, r: 4, dmg: 10, life: 1, pierce: 0, bounce: 0, hits: [] });
  step(W, IDLE, DT);
  assert(Math.abs(W.player.ult - 10 * U.bossRate) < 1e-6, 'boss rate: ' + W.player.ult);
});

// ─── 점검(2026-09-26)에서 찾은 규칙 버그 재발 방지 ─────────────
test('점검: 화면 멈춤(히트스톱) 중에 누른 필살기·대시는 멈춤이 풀리면 나간다', () => {
  const W = clearWorld(60);
  const p = W.player;
  p.ult = U.need;
  putEnemy(W, 'grunt', 100, 100);
  W.hitstop = 0.1;
  step(W, Object.assign({}, IDLE, { ult: true, dash: true }), DT);
  assert(W.stats.ults === 0, 'nothing during hitstop');
  for (let i = 0; i < 10 && W.stats.ults === 0; i++) step(W, IDLE, DT);
  assert(W.stats.ults === 1 && W.stats.dashes === 1, 'fired after hitstop: ults ' + W.stats.ults + ' dashes ' + W.stats.dashes);
  // 한 번만 나간다
  for (let i = 0; i < 10; i++) step(W, IDLE, DT);
  assert(W.stats.dashes === 1, 'no repeat');
});

test('필살기: 멈춤 중 누른 필살기는 카드 화면·다음 웨이브로 넘어가지 않는다', () => {
  const W = clearWorld(61);
  W.player.ult = U.need;
  W.hitstop = 0.1;
  step(W, Object.assign({}, IDLE, { ult: true }), DT);
  W.phase = 'cards'; W.cards = drawCards(W, 3);
  W.hitstop = 0;
  pickCard(W, 0);
  step(W, IDLE, DT);
  assert(W.stats.ults === 0 && W.player.ult === U.need, 'queued press dropped at wave change');
});

test('점검: 큰 화면 구석에서 쓴 충격파가 다 퍼진 뒤에야 카드 화면', () => {
  const W = createWorld(1600, 1000, 62);
  W.spawnQueue.length = 0; W.enemies.length = 0; W.banner = 0;
  const p = W.player;
  p.x = 20; p.y = 20; p.ult = U.need;
  putEnemy(W, 'grunt', 60, 20, 1);
  step(W, Object.assign({}, IDLE, { ult: true }), DT);
  let frames = 0;
  while (W.phase === 'play' && frames++ < 60 * 10) step(W, IDLE, DT);
  assert(W.phase === 'cards', 'cards');
  assert(W.shocks.length === 0, 'shock finished before cards: ' + W.shocks.length);
});

test('점검: 게임 오버 뒤 충격파는 모양만 퍼지고 피해·점수는 없다', () => {
  const W = clearWorld(63);
  const p = W.player;
  p.ult = U.need;
  step(W, Object.assign({}, IDLE, { ult: true }), DT);
  const far = putEnemy(W, 'grunt', 780, 580, 100);
  W.phase = 'over';
  const score = W.score;
  for (let i = 0; i < 60; i++) step(W, IDLE, DT);
  assert(W.shocks.length === 0, 'shock faded out');
  assert(far.hp === 100 && W.score === score, 'no damage after over');
});

test('필살기: 분열체가 충격파에 죽으면 새끼도 같은 충격파에 쓸린다 (한 방 처치 수 기록)', () => {
  const W = clearWorld(64);
  W.wave = 6;
  const p = W.player;
  p.ult = U.need; p.fireCd = 1e9;
  putEnemy(W, 'splitter', p.x + 100, p.y);
  step(W, Object.assign({}, IDLE, { ult: true }), DT);
  for (let i = 0; i < 40; i++) step(W, IDLE, DT);
  assert(W.enemies.filter(e => e.type === 'mini').length === 0, 'minis cleared');
  assert(W.stats.ultBest === 3, 'one shock took 3: ' + W.stats.ultBest);
});

// ─── 콤보·기록 ───────────────────────────────────────────────
test('콤보: 연달아 잡으면 오르고 점수 배율이 붙고, 시간이 지나거나 맞으면 끊긴다', () => {
  const C = NG.DATA.COMBO;
  const W = clearWorld(70);
  const p = W.player; p.fireCd = 1e9;
  putEnemy(W, 'tank', 780, 580, 1e9); // 웨이브가 끝나지 않게 붙잡아 두는 적
  const kill = () => {
    const e = putEnemy(W, 'grunt', 100, 100, 0.5);
    W.bullets.push({ x: 100, y: 100, vx: 0, vy: -1, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
    step(W, IDLE, DT);
    return e;
  };
  for (let i = 0; i < 10; i++) kill();
  assert(W.combo === 10 && W.stats.bestCombo === 10, 'combo ' + W.combo);
  assert(NG.DATA.comboMul(10) > NG.DATA.comboMul(4) && NG.DATA.comboMul(4) === 1, 'multiplier');
  assert(NG.DATA.comboMul(10000) === 1 + C.maxBonus, 'capped');
  const s0 = W.score; kill();
  assert(W.score - s0 === Math.round(10 * NG.DATA.comboMul(11)), 'score uses multiplier: ' + (W.score - s0));
  for (let i = 0; i < 60 * (C.window + 0.2); i++) step(W, IDLE, DT);
  assert(W.combo === 0 && W.stats.bestCombo === 11, 'timed out');
  kill(); kill();
  W.eBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, life: 5 });
  step(W, IDLE, DT);
  assert(W.combo === 0, 'hurt breaks combo');
});

test('기록용 통계: 대시·무피격 웨이브·보스 무피격·필살기 보스 마무리', () => {
  const W = clearWorld(71);
  W.wave = 5; W.bossWave = true;
  const p = W.player; p.fireCd = 1e9;
  step(W, Object.assign({}, IDLE, { dash: true }), DT);
  assert(W.stats.dashes === 1, 'dash counted');
  const boss = putEnemy(W, 'boss', 700, 500, 320);
  boss.hp = 1; // 거의 다 잡은 보스
  p.ult = U.need;
  for (let i = 0; i < 20; i++) step(W, IDLE, DT);
  step(W, Object.assign({}, IDLE, { ult: true }), DT);
  let frames = 0;
  while (W.phase === 'play' && frames++ < 60 * 20) step(W, IDLE, DT);
  assert(boss.dead && W.stats.ultBoss === 1, 'ult finished the boss');
  assert(W.phase === 'cards' && W.stats.cleanWaves === 1 && W.stats.cleanBoss === 1, 'clean boss wave');
  pickCard(W, 0);
  W.eBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, life: 5 });
  step(W, IDLE, DT);
  W.spawnQueue.length = 0; W.enemies.length = 0;
  frames = 0;
  while (W.phase === 'play' && frames++ < 60 * 20) step(W, IDLE, DT);
  assert(W.stats.cleanWaves === 1 && W.stats.hurts === 1, 'hit wave is not clean');
});

// records.js: 가짜 저장소로 돌린다
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'records.js'), 'utf8'), ctx, { filename: 'records.js' });
const R = NG.Records;
function fakeStore(init) {
  const m = Object.assign({}, init);
  return { m, get: (k, f) => (k in m ? JSON.parse(m[k]) : f), set: (k, v) => { m[k] = JSON.stringify(v); } };
}

test('메달 목록: 12~20개, id 중복 없음, 이름·조건·등급·검사 함수', () => {
  const M = NG.DATA.MEDALS;
  assert(M.length >= 12 && M.length <= 20, 'count ' + M.length);
  assert(new Set(M.map(m => m.id)).size === M.length, 'unique ids');
  for (const m of M) assert(m.name && m.desc && m.icon && [1, 2, 3].includes(m.tier) && typeof m.check === 'function', 'shape ' + m.id);
  // 빈 판으로는 아무것도 못 딴다
  const W = createWorld(800, 600, 72);
  assert(R.newMedals(R.blank(), R.runOf(W), false).length === 0, 'nothing for nothing');
});

test('기록: 옛 최고 기록(ngun.best2, ngun.best)을 이어받고 망가진 저장본에도 안 멈춘다', () => {
  const a = R.load(fakeStore({ 'ngun.best2': JSON.stringify({ normal: { score: 1234, wave: 7 }, hard: 'x' }) }));
  assert(a.best.normal.score === 1234 && a.best.normal.wave === 7 && a.best.hard.score === 0, 'best2 merged');
  const b = R.load(fakeStore({ 'ngun.best': JSON.stringify({ score: 50, wave: 2 }) }));
  assert(b.best.normal.score === 50, 'oldest merged into normal');
  for (const junk of ['"abc"', '42', 'null', '[1,2]', '{"best":{"easy":{"score":"NaN","wave":-3}},"life":{"games":"7"},"medals":{"boss1":"2026-09-26","fake":1}}']) {
    const r = R.load(fakeStore({ 'ngun.rec1': junk, 'ngun.best2': junk }));
    for (const d of R.DIFFS) for (const k of Object.keys(r.best[d])) assert(Number.isFinite(r.best[d][k]) && r.best[d][k] >= 0, 'finite ' + junk);
    assert(!('fake' in r.medals), 'unknown medal dropped');
  }
  const c = R.load(fakeStore({ 'ngun.rec1': '{"life":{"games":"7"},"medals":{"boss1":"2026-09-26"}}' }));
  assert(c.life.games === 7 && c.medals.boss1 === '2026-09-26', 'keeps good values');
});

test('기록: 판이 끝나면 난이도별 최고·평생 합계·깬 기록 목록, 저장하면 옛 키도 갱신', () => {
  const st = fakeStore({});
  const rec = R.load(st);
  const run = { diff: 'hard', score: 500, wave: 6, kills: 80, time: 120, bestCombo: 12, bossKills: 1, ults: 2, maxN: 2 };
  const broken = R.finish(rec, run);
  assert(broken.join() === 'score', 'first game: only score chip ' + broken);
  assert(rec.best.hard.wave === 6 && rec.best.hard.combo === 12 && rec.best.normal.score === 0, 'per difficulty');
  assert(rec.life.games === 1 && rec.life.kills === 80 && rec.life.bosses === 1 && rec.life.ults === 2, 'lifetime');
  const broken2 = R.finish(rec, Object.assign({}, run, { score: 400, wave: 8, kills: 90 }));
  assert(broken2.join() === 'wave,kills', 'second: ' + broken2);
  R.save(rec, st);
  assert(JSON.parse(st.m['ngun.best2']).hard.wave === 8, 'old key kept in sync');
  assert(R.load(st).life.games === 2, 'round trip');
});

test('메달: 조건을 채우면 한 번만 주고, 평생 기록 메달은 판 수를 센다', () => {
  const rec = R.blank();
  const run = { diff: 'normal', score: 0, wave: 10, kills: 120, time: 300, bossKills: 1, maxN: 3, ults: 3, cleanBoss: 0, bestCombo: 10, ultBoss: 0, ultBest: 0 };
  const got = R.newMedals(rec, run, false).map(m => m.id);
  for (const id of ['boss1', 'n3', 'k100', 'c10', 'ult3', 'w10', 'w10n']) assert(got.includes(id), 'has ' + id + ' in ' + got);
  assert(!got.includes('w15h') && !got.includes('games10'), 'not yet');
  R.award(rec, R.newMedals(rec, run, false), '2026-09-26');
  assert(R.newMedals(rec, run, false).length === 0, 'only once');
  assert(rec.medals.boss1 === '2026-09-26', 'dated');
  rec.life.games = 9;
  assert(R.newMedals(rec, run, false).length === 0 && R.newMedals(rec, run, true).map(m => m.id).join() === 'games10', '10th game finishes');
});

test('긴 판: 봇으로 돌려도 통계가 숫자로 남고 메달 검사가 안 멈춘다', () => {
  const W = runLong(73, 60 * 60 * 3, false);
  const run = R.runOf(W);
  for (const k of Object.keys(run)) if (k !== 'diff') assert(Number.isFinite(run[k]), 'finite ' + k);
  assert(run.bestCombo >= 1 && run.dashes > 0, 'combo/dash tracked');
  const rec = R.blank();
  R.finish(rec, run);
  R.newMedals(rec, run, true);
});

test('보스는 웨이브마다 모습·색이 다르고, 한 바퀴 돌면 MK2', () => {
  const B = NG.DATA.BOSSES;
  assert(new Set(B.map(b => b.shape)).size === B.length && new Set(B.map(b => b.color)).size === B.length, 'all different');
  const looks = [];
  for (let k = 0; k < B.length + 1; k++) {
    const W = createWorld(800, 600, 60 + k);
    W.bossKills = k;
    W.spawnQueue.length = 0; W.enemies.length = 0;
    W.wave = 5 * (k + 1) - 1; W.clearT = -1;
    for (let f = 0; f < 60 * 3 && W.phase === 'play'; f++) step(W, IDLE, DT);
    if (W.phase === 'cards') pickCard(W, 0);
    let boss = null;
    for (let f = 0; f < 60 * 3 && !boss; f++) { step(W, IDLE, DT); boss = W.enemies.find(e => e.type === 'boss'); }
    assert(boss && boss.look, 'boss spawned with look at wave ' + W.wave);
    looks.push(boss.look.id + ':' + boss.mk);
  }
  assert(looks.slice(0, B.length).join(',') === B.map(b => b.id + ':1').join(','), 'order ' + looks.join(','));
  assert(looks[B.length] === B[0].id + ':2', 'mk2 ' + looks[B.length]);
});

// ─── 보스마다 다른 공격 ───
function bossWorld(k, seed) {
  const W = createWorld(1280, 800, seed || 70 + k);
  W.spawnQueue.length = 0; W.enemies.length = 0; W.banner = 0;
  W.bossKills = k; W.wave = 5; W.bossWave = true;
  const e = { id: W.nextId++, type: 'boss', def: NG.DATA.ENEMIES.boss, look: NG.World.bossLook(k), mk: 1, x: 900, y: 300, r: 58, hp: 1e6, maxHp: 1e6, speed: 42,
    vx: 0, vy: 0, spawnT: 0, flash: 0, droneHit: 0, dead: false, ang: 0, cd: 0, ringCd: 3, aimCd: 1.4, summonCd: 6.5, strafe: 1 };
  W.enemies.push(e);
  W.player.hp = W.player.maxHp = 1e6; W.player.x = 300; W.player.y = 500; W.player.fireCd = 1e9;
  W.meteorT = 1e9; W.hole = null;
  return { W, e };
}
const HOLD = { moveX: 0, moveY: 0, aimAngle: 0, dash: false };
function runFor(W, sec, fn) { for (let i = 0; i < sec * 60; i++) { step(W, HOLD, DT); if (fn) fn(W); W.events.length = 0; W.player.hp = W.player.maxHp; } }

test('보스 공격: 스타 크러셔는 소용돌이 별 탄을 쏘고, 예고선 뒤 빠르게 돌진한다', () => {
  const { W, e } = bossWorld(1);
  let kinds = new Set(), warned = false, maxV = 0, warns = [];
  runFor(W, 9, W => { for (const b of W.eBullets) kinds.add(b.k); if (e.warnT > 0) warned = true; maxV = Math.max(maxV, Math.hypot(e.vx, e.vy)); });
  assert(kinds.has('star'), 'star bullets');
  assert(warned, 'charge warning shown');
  assert(maxV > 400, 'charged fast: ' + maxV.toFixed(0));
});

test('보스 공격: 헥사 가디언 방패는 내 총알 일부를 막고, 여섯 방향 연발을 쏜다', () => {
  const { W, e } = bossWorld(2);
  let blocked = 0, hitHp = e.hp, kinds = new Set();
  W.player.fireCd = 0;
  for (let i = 0; i < 60 * 6; i++) {
    step(W, { moveX: 0, moveY: 0, aimAngle: Math.atan2(e.y - W.player.y, e.x - W.player.x), dash: false }, DT);
    blocked += W.events.filter(x => x === 'hexBlock').length; W.events.length = 0; W.player.hp = W.player.maxHp;
    for (const b of W.eBullets) kinds.add(b.k);
  }
  assert(blocked > 3, 'shield blocked ' + blocked);
  assert(e.hp < hitHp, 'but some bullets get through');
  assert(kinds.has('hex'), 'hex volley');
});

test('보스 공격: 보이드 아이 레이저는 예고 뒤 줄 위에 있으면 맞고, 비키면 안 맞는다', () => {
  const a = bossWorld(3, 91);
  let hurtA = 0;
  a.e.laserT = 0.01; a.e.orbT = 99;
  for (let i = 0; i < 60 * 2; i++) { step(a.W, HOLD, DT); hurtA += a.W.events.filter(x => x === 'hurt').length; a.W.events.length = 0; a.W.player.iframe = 0; a.W.eBullets.length = 0; }
  assert(hurtA >= 1, 'standing in the beam hurts');
  const b = bossWorld(3, 92);
  let hurtB = 0;
  b.e.laserT = 0.01; b.e.orbT = 99;
  for (let i = 0; i < 60 * 2; i++) {
    // 예고가 굳은 뒤(0.6초) 옆으로 비킨다
    const mv = b.W.lasers.length && b.W.lasers[0].t > 0.65 ? 1 : 0;
    step(b.W, { moveX: 0, moveY: mv, aimAngle: 0, dash: false }, DT);
    hurtB += b.W.events.filter(x => x === 'hurt').length; b.W.events.length = 0; b.W.player.iframe = 0; b.W.eBullets.length = 0;
  }
  assert(hurtB === 0, 'dodged the locked beam: ' + hurtB);
});

test('보스 공격: 보이드 아이 구슬은 플레이어 쪽으로 휘어 온다', () => {
  const { W, e } = bossWorld(3, 93);
  e.laserT = 99; e.orbT = 0.01;
  runFor(W, 0.2);
  const orb = W.eBullets.find(b => b.k === 'orb');
  assert(orb, 'orb fired');
  const d0 = Math.hypot(orb.x - W.player.x, orb.y - W.player.y);
  W.player.x = 300; W.player.y = 700;
  runFor(W, 2);
  const d1 = Math.hypot(orb.x - W.player.x, orb.y - W.player.y);
  assert(d1 < d0, 'homing closes in: ' + d0.toFixed(0) + ' -> ' + d1.toFixed(0));
});

test('보스 공격: 톱날 군주는 벽에 튕기며 날고, 휘어 도는 톱날 고리를 쏜다', () => {
  const { W, e } = bossWorld(4);
  let bounces = 0, lastVx = null, curved = false;
  runFor(W, 12, () => {
    if (lastVx != null && Math.sign(lastVx) !== Math.sign(e.vx)) bounces++;
    lastVx = e.vx;
    for (const b of W.eBullets) if (b.k === 'blade' && b.curve) curved = true;
  });
  assert(e.free && bounces >= 1, 'bounced ' + bounces);
  assert(curved, 'curving blades');
  assert(e.x >= e.r && e.x <= W.w - e.r && e.y >= e.r && e.y <= W.h - e.r, 'stays inside');
});

test('보스 공격: 다섯 보스 모두 오래 싸워도 값이 망가지지 않고 잡을 수 있다', () => {
  for (let k = 0; k < NG.DATA.BOSSES.length; k++) {
    const { W, e } = bossWorld(k, 200 + k);
    e.hp = e.maxHp = 400;
    W.player.fireCd = 0; W.player.gun.dmg = 3; W.player.gun.barrels = 3;
    let f = 0;
    while (!e.dead && f++ < 60 * 90) {
      const p = W.player;
      step(W, { moveX: Math.cos(W.t * 0.7), moveY: Math.sin(W.t * 0.9), aimAngle: null, dash: f % 90 === 0 }, DT);
      W.events.length = 0; p.hp = p.maxHp;
      assert(Number.isFinite(e.x + e.y + e.vx + e.vy), 'finite boss ' + k);
      for (const b of W.eBullets) assert(Number.isFinite(b.x + b.y), 'finite bullet');
    }
    assert(e.dead, NG.DATA.BOSSES[k].id + ' killable (hp ' + e.hp.toFixed(0) + ')');
  }
});

// ─── 기체 · 상점 · 미션 · 아이템 (shop.js, 2026-09-26) ─────────────
const SH = NG.Shop;
const DA = NG.DATA;
// 적이 안 나오지만 웨이브도 안 끝나게 (대기열에 하나를 아주 늦게)
function clearArena(W) { W.spawnQueue = ['grunt']; W.spawnTimer = 1e9; W.enemies.length = 0; W.eBullets.length = 0; if (W.lasers) W.lasers.length = 0; W.banner = 0; W.meteorT = 1e9; W.meteors.length = 0; W.hole = null; }

test('기체: 6종, 이름·설명·모양·색이 모두 다르고 무료는 2종', () => {
  const S = DA.SHIPS;
  assert(S.length === 6, 'six ships');
  assert(new Set(S.map(s => s.id)).size === 6 && new Set(S.map(s => s.shape)).size === 6 && new Set(S.map(s => s.color)).size === 6, 'distinct');
  for (const s of S) assert(s.name && s.desc && s.glow, 'shape ' + s.id);
  assert(S.filter(s => !s.price).length === 2, 'two free');
});

test('기체: 고른 기체의 능력치가 makePlayer에 들어간다', () => {
  const df = DA.DIFFICULTY.normal, G = DA.GUN;
  for (const s of DA.SHIPS) {
    const p = NG.World.makePlayer(400, 300, df, { ship: s.id });
    const g = s.gun || {};
    assert(p.ship === s.id && p.look === s, 'ship ' + s.id);
    assert(p.maxHp === df.hp + s.hp && p.hp === p.maxHp, 'hp ' + s.id + ' ' + p.maxHp);
    assert(Math.abs(p.speed - DA.PLAYER.speed * s.speed) < 1e-9, 'speed ' + s.id);
    assert(Math.abs(p.dashCdMax - DA.PLAYER.dashCd * s.dashCd) < 1e-9, 'dash ' + s.id);
    assert(p.gun.barrels === G.barrels + (g.barrels || 0), 'barrels ' + s.id);
    assert(Math.abs(p.gun.rate - G.rate * (g.rate || 1)) < 1e-9 && Math.abs(p.gun.dmg - G.dmg * (g.dmg || 1)) < 1e-9, 'rate/dmg ' + s.id);
    assert(p.gun.pierce === G.pierce + (g.pierce || 0) && p.gun.critMul === (g.critMul || G.critMul), 'pierce/crit ' + s.id);
    assert(p.drones === (s.drones || 0), 'drones ' + s.id);
  }
  // 특기
  const P = id => NG.World.makePlayer(0, 0, df, { ship: id });
  assert(P('lancer').gun.critMul === 3.5 && P('lancer').gun.pierce === 1, 'lancer');
  assert(P('titan').iframeMul === 1.5 && P('nova').ultMul === DA.SHIPS.find(s => s.id === 'nova').ultMul && P('nova').gun.barrels === 2 && P('core').healMul === 1.5, 'passives');
  // 너무 센 기체가 없게: 체력·속도·화력 어림 곱이 코어의 0.7~1.5배 (실제 비교는 봇 실측, PLAN.md 5.10)
  const power = s => (5 + s.hp) * s.speed * (1 + ((s.gun.barrels) || 0)) * (s.gun.rate || 1) * (s.gun.dmg || 1) * (1 + 0.15 * ((s.gun.pierce || 0) + (s.drones || 0)));
  const base = power(DA.SHIPS[0]);
  for (const s of DA.SHIPS) { const k = power(s) / base; assert(k > 0.7 && k < 1.5, 'balance ' + s.id + ' ' + k.toFixed(2)); }
});

test('기체 특기: 타이탄은 맞은 뒤 무적이 길고, 노바는 게이지가 빨리 차고(ultMul배), 하이브는 5웨이브에 드론 +1', () => {
  const W = createWorld(800, 600, 301, 'normal', { ship: 'titan' });
  clearArena(W);
  W.eBullets.push({ x: W.player.x, y: W.player.y, vx: 0, vy: 0, r: 5, life: 5 });
  step(W, IDLE, DT);
  assert(W.player.hp === W.player.maxHp - 1 && Math.abs(W.player.iframe - DA.PLAYER.iframe * 1.5) < 0.05, 'titan iframe ' + W.player.iframe);
  const a = createWorld(800, 600, 302, 'normal', { ship: 'core' }), b = createWorld(800, 600, 302, 'normal', { ship: 'nova' });
  for (const X of [a, b]) { clearArena(X); X.enemies.push({ id: 999, type: 'grunt', def: DA.ENEMIES.grunt, x: 100, y: 100, r: 14, hp: 1e9, maxHp: 3, spawnT: 0, flash: 0, droneHit: 0, vx: 0, vy: 0, ang: 0, cd: 0 }); }
  // 같은 피해를 주면 노바 게이지가 1.3배
  const gain = X => { const e = X.enemies[0]; const before = X.player.ult; X.player.fireCd = 99; X.bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 4, dmg: 3, life: 1, pierce: 0, bounce: 0, hits: [] }); X.rand = () => 0.99; step(X, { moveX: 0, moveY: 0, aimAngle: 0, dash: false }, 1e-4); return X.player.ult - before; };
  const ga = gain(a), gb = gain(b);
  assert(ga > 0 && Math.abs(gb / ga - DA.SHIPS.find(s => s.id === 'nova').ultMul) < 1e-6, 'nova ult ' + ga + ' ' + gb);
  const H = createWorld(800, 600, 303, 'normal', { ship: 'hive' });
  assert(H.player.drones === 2, 'hive start');
  H.wave = 4; clearArena(H); H.spawnQueue.length = 0; H.clearT = -1;
  for (let f = 0; f < 60 * 3 && H.phase === 'play'; f++) step(H, IDLE, DT);
  pickCard(H, 0);
  assert(H.wave === 5 && H.player.drones >= 3, 'hive wave 5 drones ' + H.player.drones);
});

test('상점 없이 만든 판(시연·옛 테스트)은 예전과 같은 기본 기체', () => {
  const W = createWorld(800, 600, 11);
  const p = W.player, G = DA.GUN;
  assert(p.maxHp === 5 && p.hp === 5 && p.speed === DA.PLAYER.speed && p.dashCdMax === DA.PLAYER.dashCd, 'base');
  for (const k of Object.keys(G)) assert(p.gun[k] === G[k], 'gun ' + k);
  assert(p.drones === 0 && p.ult === 0 && p.shield === 0 && p.heatT === 0 && p.magT === 0 && p.healMul === 1, 'no extras');
  const E = createWorld(800, 600, 11, 'easy');
  assert(E.player.maxHp === 8, 'easy hp');
});

test('코인: 점수÷40 + (웨이브-1)×5 + 보스×40 + 주운 코인, 코인 보너스 강화는 10%씩', () => {
  const run = { score: 4000, wave: 6, bosses: 1, runCoins: 21 };
  const c = SH.coinsFor(run, SH.blank());
  assert(c.parts.score === 100 && c.parts.wave === 25 && c.parts.boss === 40 && c.parts.pickup === 21 && c.parts.bonus === 0 && c.total === 186, JSON.stringify(c));
  const st = SH.blank(); st.up.coin = 3;
  assert(SH.coinsFor(run, st).total === 186 + Math.floor(186 * 0.3), 'bonus');
  assert(SH.coinsFor({ score: -5, wave: 0 }, st).total === 0, 'no negatives');
});

test('상점: 사면 코인이 줄고, 모자라면 못 사며 음수가 되지 않는다', () => {
  const st = SH.blank();
  assert(st.coins === 0 && st.ships.core && st.ships.viper && !st.ships.titan && st.ship === 'core', 'blank');
  let r = SH.buy(st, 'titan');
  assert(!r.ok && r.reason === 'coins' && st.coins === 0 && !st.ships.titan, 'poor');
  st.coins = 650;
  r = SH.buy(st, 'titan');
  assert(r.ok && st.coins === 50 && st.ships.titan && st.ship === 'titan', 'bought and selected');
  assert(SH.buy(st, 'titan').reason === 'owned' && st.coins === 50, 'no double buy');
  assert(!SH.buy(st, 'nope').ok, 'unknown');
  assert(SH.selectShip(st, 'viper') && st.ship === 'viper' && !SH.selectShip(st, 'nova') && st.ship === 'viper', 'select only owned');
  st.coins = 100;
  assert(!SH.buy(st, 'dmg').ok && st.coins === 100, 'upgrade too expensive');
});

test('강화: 5단계에서 멈추고 값이 오르며, 판을 만들 때 적용된다', () => {
  const st = SH.blank();
  st.coins = 1e6;
  const paid = [];
  for (let i = 0; i < 7; i++) { const r = SH.buy(st, 'hp'); if (r.ok) paid.push(r.cost); }
  assert(st.up.hp === 5 && paid.length === 5 && SH.price(st, 'hp') == null, 'cap 5');
  for (let i = 1; i < paid.length; i++) assert(paid[i] > paid[i - 1], 'rising prices');
  for (const id of ['dmg', 'ultStart', 'magnet']) for (let i = 0; i < 5; i++) SH.buy(st, id);
  const W = createWorld(800, 600, 5, 'normal', SH.worldOpts(st, {}));
  const p = W.player;
  assert(p.maxHp === 10 && p.hp === 10, 'hp +5 ' + p.maxHp);
  assert(Math.abs(p.gun.dmg - 1.3) < 1e-9, 'dmg +30%');
  assert(Math.abs(p.ult - DA.ULT.need * 0.6) < 1e-9, 'ult start 60%');
  assert(Math.abs(p.magnetMul - 2.25) < 1e-9, 'magnet');
  // 망가진 단계 값도 5를 못 넘는다
  const q = NG.World.makePlayer(0, 0, DA.DIFFICULTY.normal, { upgrades: { hp: 99, dmg: 'x' } });
  assert(q.maxHp === 10 && q.gun.dmg === 1, 'clamped');
});

test('시작 아이템: 사 둔 만큼 판마다 하나씩 쓰이고, 한 번만 적용된다', () => {
  const st = SH.blank();
  st.coins = 1000;
  assert(SH.buy(st, 'shield').ok && SH.buy(st, 'barrel').ok && SH.buy(st, 'fullult').ok && SH.buy(st, 'shield').ok, 'buy');
  assert(st.items.shield === 2 && st.coins === 1000 - 80 * 2 - 150 - 120, 'counts');
  const lo1 = SH.takeLoadout(st);
  assert(lo1.shield && lo1.barrel && lo1.fullult, 'first run gets all');
  const W = createWorld(800, 600, 9, 'normal', SH.worldOpts(st, lo1));
  assert(W.player.shield === 1 && W.player.gun.barrels === 2 && W.player.ult === DA.ULT.need, 'applied');
  const lo2 = SH.takeLoadout(st);
  assert(lo2.shield && !lo2.barrel && !lo2.fullult, 'second run: only the extra shield');
  assert(Object.keys(SH.takeLoadout(st)).length === 0 && st.items.shield === 0, 'then none');
  st.coins = 1000;
  for (let i = 0; i < 5; i++) SH.buy(st, 'barrel');
  assert(st.items.barrel === 3, 'stack max 3');
});

test('미션: 늘 3개, 누적은 판마다 더하고 한 판 미션은 그 판 값으로, 받으면 코인 + 새 미션', () => {
  const st = SH.blank();
  assert(st.missions.length === DA.MISSION_SLOTS && new Set(st.missions.map(m => m.id)).size === 3, 'three');
  st.missions = [{ id: 'k300', prog: 0, done: false }, { id: 'c20', prog: 0, done: false }, { id: 'lancer8', prog: 0, done: false }];
  const run = (o) => Object.assign({ ship: 'core', kills: 0, bestCombo: 0, wave: 1 }, o);
  SH.progressMissions(st, run({ kills: 120, bestCombo: 12, wave: 9 }));
  SH.progressMissions(st, run({ kills: 150, bestCombo: 8 }));
  assert(st.missions[0].prog === 270 && !st.missions[0].done, 'cumulative adds');
  assert(st.missions[1].prog === 12 && !st.missions[1].done, 'single run keeps best, no sum');
  assert(st.missions[2].prog === 0, 'ship mission ignores other ships');
  const fresh = SH.progressMissions(st, run({ kills: 40, bestCombo: 20 }));
  assert(fresh.join() === 'k300,c20' && st.missions[0].done && st.missions[0].prog === 300, 'done ' + fresh);
  SH.progressMissions(st, run({ ship: 'lancer', wave: 8 }));
  assert(st.missions[2].done, 'lancer mission');
  const coins = st.coins;
  assert(SH.claim(st, 0) === 120 && st.coins === coins + 120, 'claim reward');
  assert(st.missions.length === 3 && st.missions[0].id !== 'k300' && !st.missions[0].done && st.missions[0].prog === 0, 'replaced in same slot');
  assert(SH.claim(st, 0) === 0, 'cannot claim unfinished');
  assert(new Set(st.missions.map(m => m.id)).size === 3, 'no duplicates');
  // 기체 미션은 가진 기체만
  for (let k = 0; k < 40; k++) { const s2 = SH.blank(); s2.mseed = k * 7919 + 1; s2.missions = []; SH.fillMissions(s2); for (const m of s2.missions) { const d = SH.missionDef(m.id); assert(!d.ship || s2.ships[d.ship], 'owned ship only ' + m.id); } }
});

test('판 끝: finishRun이 코인을 주고 미션을 진행한다 (runOf는 판 통계를 읽는다)', () => {
  const st = SH.blank();
  st.missions = [{ id: 'games5', prog: 4, done: false }, { id: 'coin20', prog: 0, done: false }, { id: 'boss2', prog: 0, done: false }];
  const W = createWorld(800, 600, 17, 'normal', SH.worldOpts(st, {}));
  W.score = 800; W.wave = 3; W.stats.coinPicks = 5; W.stats.coins = 15;
  const res = SH.finishRun(st, SH.runOf(W));
  assert(res.coins === 20 + 10 + 15 && st.coins === res.coins && st.life.games === 1, 'coins ' + res.coins);
  assert(res.done.join() === 'games5' && st.missions[1].prog === 5, 'missions');
});

test('저장: 망가진 상점 저장본은 기본값으로, 정상 값은 그대로 되살아난다', () => {
  for (const junk of ['"x"', '123', '[1,2]', 'null', '{"coins":"abc","ships":7,"up":{"hp":-3},"items":{"shield":1e9},"missions":[5,{"id":"zzz"}]}']) {
    const s = SH.load(fakeStore({ 'ngun.shop1': junk }));
    assert(s.coins === 0 && s.ship === 'core' && s.up.hp === 0 && s.items.shield <= 3 && s.missions.length === 3, 'junk ' + junk);
  }
  const bad = SH.load(fakeStore({ 'ngun.shop1': '{"coins":50.7,"ship":"nova","ships":{"nova":"yes"},"up":{"dmg":9}}' }));
  assert(bad.coins === 50 && bad.ship === 'core' && !bad.ships.nova && bad.up.dmg === 5, 'sanitized');
  const st = fakeStore({});
  const a = SH.blank(); a.coins = 777; a.ships.lancer = true; a.ship = 'lancer'; a.up.coin = 2; a.items.fullult = 1;
  SH.save(a, st);
  const b = SH.load(st);
  assert(b.coins === 777 && b.ship === 'lancer' && b.up.coin === 2 && b.items.fullult === 1 && JSON.stringify(b.missions) === JSON.stringify(a.missions), 'round trip');
});

test('아이템: 코인을 주우면 수·값이 쌓이고, 코인은 자석 범위에서 끌려온다', () => {
  const W = createWorld(800, 600, 21, 'normal', {});
  clearArena(W);
  const p = W.player;
  NG.World.addDrop(W, p.x + 10, p.y, 'coin');
  NG.World.addDrop(W, p.x + 70, p.y, 'coin');   // 자석 범위(90) 안: 끌려와서 주워진다
  NG.World.addDrop(W, p.x + 300, p.y, 'coin');  // 멀리: 그대로
  for (let f = 0; f < 60; f++) step(W, IDLE, DT);
  assert(W.stats.coinPicks === 2 && W.stats.coins === 2 * DA.ITEMS.coin.value, 'picked ' + W.stats.coinPicks);
  assert(W.drops.length === 1 && W.drops[0].x === p.x + 300, 'far coin stays');
  assert(W.events.includes('coin'), 'event');
});

test('아이템: 방패는 딱 한 대를 막고, 두 번째는 맞는다', () => {
  const W = createWorld(800, 600, 22, 'normal', {});
  clearArena(W);
  const p = W.player;
  NG.World.addDrop(W, p.x, p.y, 'shield');
  step(W, IDLE, DT);
  assert(p.shield === 1 && W.stats.items === 1, 'got shield');
  const hp = p.hp;
  W.eBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, life: 5 });
  step(W, IDLE, DT);
  assert(p.hp === hp && p.shield === 0 && W.stats.blocks === 1 && W.events.includes('shieldBlock') && !W.waveHit, 'blocked');
  p.iframe = 0;
  W.eBullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, life: 5 });
  step(W, IDLE, DT);
  assert(p.hp === hp - 1 && W.stats.blocks === 1, 'second hit hurts');
});

test('아이템: 과열은 정해진 시간 동안 연사를 2배로', () => {
  const shots = heat => {
    const W = createWorld(800, 600, 23, 'normal', {});
    clearArena(W);
    if (heat) NG.World.addDrop(W, W.player.x, W.player.y, 'heat');
    let n = 0;
    for (let f = 0; f < 60 * 3; f++) { W.player.hp = 5; step(W, { moveX: 0, moveY: 0, aimAngle: 0, dash: false }, DT); }
    n = W.stats.shots;
    return { n, W };
  };
  const a = shots(false), b = shots(true);
  assert(Math.abs(b.n / a.n - 2) < 0.1, 'double rate ' + a.n + ' ' + b.n);
  assert(Math.abs(b.W.player.heatT - (DA.ITEMS.heat.time - 3)) < 0.05, 'timer runs ' + b.W.player.heatT);
  for (let f = 0; f < 60 * 4; f++) step(b.W, IDLE, DT);
  assert(b.W.player.heatT === 0, 'ends');
});

test('아이템: 자석은 화면 어디의 아이템이든 끌어온다 (시간이 지나면 끝)', () => {
  const W = createWorld(800, 600, 24, 'normal', {});
  clearArena(W);
  const p = W.player;
  NG.World.addDrop(W, p.x, p.y, 'magnet');
  NG.World.addDrop(W, 20, 20, 'coin');
  NG.World.addDrop(W, 780, 580, 'bomb');
  step(W, IDLE, DT);
  assert(p.magT > 0, 'magnet on');
  for (let f = 0; f < 60 * 2; f++) step(W, IDLE, DT);
  assert(W.stats.coinPicks === 1 && W.stats.items === 2 && W.drops.length === 0, 'all pulled ' + W.drops.length);
  p.magT = 0;
  NG.World.addDrop(W, 20, 20, 'coin');
  for (let f = 0; f < 60; f++) step(W, IDLE, DT);
  assert(W.drops.length === 1, 'no pull after magnet ends');
});

test('아이템: 폭탄은 적 탄을 모두 지우고 둘레 안 적을 쓸어 낸다 (먼 적은 멀쩡)', () => {
  const W = createWorld(800, 600, 25, 'normal', {});
  clearArena(W);
  const p = W.player;
  for (let i = 0; i < 12; i++) W.eBullets.push({ x: 50 + i * 60, y: 40, vx: 0, vy: 0, r: 5, life: 5 });
  const mk = (x, y) => { const e = { id: W.nextId++, type: 'grunt', def: DA.ENEMIES.grunt, x, y, r: 14, hp: 3, maxHp: 3, spawnT: 0, flash: 0, droneHit: 0, vx: 0, vy: 0, ang: 0, cd: 0, dead: false }; W.enemies.push(e); return e; };
  const near = [mk(p.x + 120, p.y), mk(p.x - 150, p.y + 60)], far = mk(p.x + 395, p.y + 290);
  NG.World.addDrop(W, p.x, p.y, 'bomb');
  step(W, { moveX: 0, moveY: 0, aimAngle: Math.PI, dash: false }, DT);
  assert(W.eBullets.length === 0, 'bullets cleared');
  assert(near.every(e => e.dead) && !far.dead && W.stats.bombKills === 2 && W.events.includes('bomb'), 'bomb radius');
});

test('아이템 드롭: 일반 적 처치에서 코인이 가장 흔하고 다섯 종류가 모두 나온다, 보스는 코인을 흩뿌린다', () => {
  const W = runLong(88, 60 * 60 * 3, false);
  assert(W.stats.coinPicks + W.drops.filter(d => d.type === 'coin').length > 0, 'coins dropped');
  const seen = {};
  const V = createWorld(800, 600, 90, 'normal', {});
  for (let i = 0; i < 4000; i++) {
    clearArena(V); V.drops.length = 0;
    const e = { id: V.nextId++, type: 'grunt', def: DA.ENEMIES.grunt, x: 100, y: 100, r: 14, hp: 1, maxHp: 1, spawnT: 0, flash: 0, droneHit: 0, vx: 0, vy: 0, ang: 0, cd: 0, dead: false };
    V.enemies.push(e);
    V.bullets.push({ x: 100, y: 100, vx: 0, vy: 0, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
    V.hitstop = 0; step(V, { moveX: 0, moveY: 0, aimAngle: 0, dash: false }, 1e-4);
    for (const d of V.drops) seen[d.type] = (seen[d.type] || 0) + 1;
  }
  for (const t of ['heal', 'coin', 'shield', 'heat', 'magnet', 'bomb']) assert(seen[t] > 0, 'dropped ' + t + ' ' + JSON.stringify(seen));
  assert(seen.coin > seen.heal && seen.coin > seen.shield * 4, 'coin most common ' + JSON.stringify(seen));
  assert(Math.abs(seen.coin / 4000 - DA.ITEMS.coin.chance * (1 - DA.DROP.healChance)) < 0.02, 'coin rate');
  const B = createWorld(800, 600, 91, 'normal', {});
  clearArena(B);
  const boss = { id: 1, type: 'boss', def: DA.ENEMIES.boss, look: DA.BOSSES[0], x: 400, y: 200, r: 58, hp: 1, maxHp: 100, spawnT: 0, flash: 0, droneHit: 0, vx: 0, vy: 0, ang: 0, dead: false };
  B.enemies.push(boss);
  B.bullets.push({ x: 400, y: 200, vx: 0, vy: 0, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
  step(B, { moveX: 0, moveY: 0, aimAngle: 0, dash: false }, 1e-4);
  assert(B.drops.filter(d => d.type === 'coin').length === DA.ITEMS.coin.bossCoins, 'boss coins');
});

test('미션 목록: 15개 안팎, id 중복 없음, 누적·한 판이 섞이고 칸 이름이 runOf에 있다', () => {
  const M = DA.MISSIONS;
  assert(M.length >= 15 && new Set(M.map(m => m.id)).size === M.length, 'count ' + M.length);
  assert(M.some(m => m.kind === 'life') && M.some(m => m.kind === 'run'), 'both kinds');
  const run = SH.runOf(createWorld(800, 600, 1));
  for (const m of M) {
    assert(m.stat in run, 'stat ' + m.stat);
    assert(m.goal > 0 && m.reward > 0 && m.text, 'shape ' + m.id);
    if (m.ship) assert(DA.SHIPS.some(s => s.id === m.ship), 'ship ' + m.id);
  }
});

// ─── 태양계 여행 · 블랙홀 · 운석 · 돌진이 · 난이도 (2026-09-27) ─────────────
// 다음 웨이브로 바로 넘긴다 (카드 화면을 거쳐 startWave가 불린다)
function nextWave(W) { W.phase = 'cards'; W.cards = drawCards(W, 3); pickCard(W, 0); }

test('태양계 여행: 웨이브 2개마다 수성 → 금성 → … → 명왕성 → 외계 행성 여덟, 그다음은 2바퀴 수성', () => {
  const P = DA.PLANETS, per = DA.JOURNEY.perPlanet;
  assert(P.slice(0, 9).map(p => p.name).join('') === '수성금성지구화성목성토성천왕성해왕성명왕성', 'order ' + P.map(p => p.name).join(','));
  assert(P.length === 17, 'seventeen stops ' + P.length);
  for (const p of P) assert(p.id && p.fact && /^#[0-9a-f]{6}$/i.test(p.color), 'shape ' + p.id);
  for (let n = 1; n <= per * P.length; n++) {
    const pl = NG.World.placeOf(n);
    assert(pl.planet === P[Math.floor((n - 1) / per)] && pl.lap === 1, 'wave ' + n + ' ' + pl.planet.name);
    assert(pl.first === ((n - 1) % per === 0), 'first ' + n);
  }
  const lap2 = NG.World.placeOf(per * P.length + 1);
  assert(lap2.planet.id === 'mercury' && lap2.lap === 2 && lap2.first, 'lap 2');
  // 판 안에서도: 웨이브가 바뀌면 W.place가 따라가고, 새 행성 첫 웨이브엔 'planet' 소식
  const W = createWorld(800, 600, 400);
  assert(W.place.planet.id === 'mercury', 'starts at mercury');
  const seen = [];
  for (let n = 2; n <= 20; n++) {
    W.events.length = 0; nextWave(W);
    assert(W.place.planet === NG.World.placeOf(n).planet, 'place follows wave ' + n);
    if (W.events.includes('planet')) seen.push(W.place.planet.id);
  }
  // 블랙홀 웨이브는 'hole' 소식이 대신 나오므로 도착 소식은 행성 수 이하
  assert(seen.length >= 5 && seen.every((id, i) => i === 0 || id !== seen[i - 1]), 'arrivals ' + seen.join(','));
});

test('블랙홀: from 웨이브부터, 보스 웨이브엔 없고, 두 번 연달아 안 나오며, 확률은 chance 안팎', () => {
  const B = DA.BLACKHOLE;
  let eligible = 0, holes = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const W = createWorld(1280, 800, 500 + seed);
    let prev = !!W.hole;
    assert(!prev, 'no hole on wave 1');
    for (let n = 2; n <= 40; n++) {
      nextWave(W);
      const h = !!W.hole;
      if (n < B.from) assert(!h, 'too early ' + n);
      if (n % DA.WAVE.bossEvery === 0) assert(!h, 'boss wave ' + n);
      if (prev) assert(!h, 'twice in a row at ' + n);
      if (n >= B.from && n % DA.WAVE.bossEvery !== 0 && !prev) { eligible++; if (h) holes++; }
      if (h) {
        assert(W.hole.fx >= B.place[0] && W.hole.fx <= B.place[1] && W.hole.fy >= B.place[0] && W.hole.fy <= B.place[1], 'inside');
        assert(W.events.includes('hole'), 'hole event');
      }
      prev = h;
    }
  }
  const rate = holes / eligible;
  console.log('       블랙홀 확률(가능한 웨이브 중) ' + (rate * 100).toFixed(1) + '% (' + holes + '/' + eligible + ')');
  assert(Math.abs(rate - B.chance) < 0.05, 'rate ' + rate);
});

test('블랙홀: 끌어당김은 쉬움 < 보통 < 어려움, 가장 센 곳도 가장 느린 기체 속도의 절반 아래', () => {
  const df = DA.DIFFICULTY, slow = DA.PLAYER.speed * Math.min(...DA.SHIPS.map(s => s.speed));
  assert(df.easy.pull < df.normal.pull && df.normal.pull < df.hard.pull, 'pull order');
  assert(df.easy.bulletPull < df.normal.bulletPull && df.normal.bulletPull < df.hard.bulletPull, 'bullet pull order');
  for (const d of ['easy', 'normal', 'hard']) {
    const W = createWorld(1280, 800, 600, d);
    W.hole = { fx: 0.5, fy: 0.5, x: 640, y: 400 };
    const max = Math.hypot(...Object.values(NG.World.holePull(W, 640 + DA.BLACKHOLE.core + 1, 400, W.diff.pull)));
    const far = Math.hypot(...Object.values(NG.World.holePull(W, 5, 5, W.diff.pull)));
    assert(max <= W.diff.pull + 1e-9 && far < max && far > 0, d + ' falloff ' + max + ' ' + far);
    assert(max < slow * 0.5, d + ' pull ' + max + ' vs slowest ship ' + slow);
  }
});

test('블랙홀: 가만히 있으면 끌려가고, 반대로 움직이면 빠져나간다. 적은 끌려가지 않고 적 탄은 휘다 삼켜진다', () => {
  const W = createWorld(800, 600, 610);
  clearArena(W); // 웨이브가 끝나지 않게
  W.hole = { fx: 0.5, fy: 0.5, x: 400, y: 300 };
  const p = W.player; p.x = 250; p.y = 300; p.fireCd = 1e9;
  for (let i = 0; i < 60; i++) step(W, IDLE, DT);
  assert(p.x > 250 + W.diff.pull * 0.4, 'idle drifts toward hole: ' + p.x.toFixed(1));
  p.x = 330; p.y = 300;
  for (let i = 0; i < 60; i++) step(W, { moveX: -1, moveY: 0, aimAngle: 0, dash: false }, DT);
  assert(p.x < 330 - 100, 'escapes at full speed: ' + p.x.toFixed(1));
  const e = putEnemy(W, 'tank', 600, 300, 1e9); e.speed = 0;
  W.eBullets.push({ x: 400, y: 120, vx: 120, vy: 0, r: 5, life: 6 });
  const b = W.eBullets[0];
  for (let i = 0; i < 30; i++) step(W, IDLE, DT);
  assert(b.vy > 5, 'bullet bends toward hole: vy ' + b.vy.toFixed(1));
  assert(Math.abs(e.x - 600) < 1e-6, 'enemy not pulled');
  W.eBullets.push({ x: 400, y: 300 - DA.BLACKHOLE.swallow + 4, vx: 0, vy: 0, r: 5, life: 6 });
  const n0 = W.eBullets.length;
  step(W, IDLE, DT);
  assert(W.eBullets.length === n0 - 1, 'swallowed');
});

test('운석: 내 자리에 예고 원이 먼저 뜨고, 가만히 있으면 맞고, 예고를 보고 비키면 안 맞는다 (예고 시간 안에 넉넉히)', () => {
  const M = DA.METEOR;
  for (const d of ['easy', 'normal', 'hard']) {
    const df = DA.DIFFICULTY[d];
    // 원 밖으로 나가는 데 걸리는 시간이 예고의 절반도 안 된다 (가장 느린 기체 기준)
    const slow = DA.PLAYER.speed * Math.min(...DA.SHIPS.map(s => s.speed));
    assert((M.r + DA.PLAYER.r) / slow < df.meteorWarn * 0.5, d + ' fair warn ' + df.meteorWarn);
    for (const move of [false, true]) {
      const W = createWorld(800, 600, 620, d);
      clearArena(W); W.enemies.push({ id: 1, type: 'tank', def: DA.ENEMIES.tank, x: 780, y: 580, r: 26, hp: 1e9, maxHp: 1e9, speed: 0, spawnT: 0, flash: 0, droneHit: 0, vx: 0, vy: 0, ang: 0, cd: 0, dead: false });
      W.player.fireCd = 1e9;
      W.meteorT = 0.01;
      const hp = W.player.hp;
      let warned = false;
      for (let i = 0; i < 60 * 2.5; i++) {
        if (W.meteors.length) warned = true;
        step(W, move && warned ? { moveX: 1, moveY: 0, aimAngle: 0, dash: false } : IDLE, DT);
        if (i > 5) W.meteorT = 1e9; // 한 번만
      }
      assert(warned, 'warning first');
      assert(move ? W.player.hp === hp : W.player.hp === hp - 1, d + (move ? ' dodged' : ' idle hit') + ' hp ' + W.player.hp);
    }
  }
  // 운석 간격: 웨이브가 오를수록 짧아지지만 minMul 아래로는 안 줄고, 보스 웨이브엔 길다. 여러 개는 extraEvery 웨이브마다
  const W = createWorld(800, 600, 621, 'normal');
  const g1 = NG.World.meteorGap(W); W.wave = 99; const g99 = NG.World.meteorGap(W);
  W.bossWave = true; const gb = NG.World.meteorGap(W);
  assert(g99 < g1 && Math.abs(g99 - W.diff.meteorEvery * M.minMul) < 1e-9 && gb > g99, 'gap ' + g1 + ' ' + g99 + ' ' + gb);
});

test('운석: 떨어진 자리의 일반 적도 피해를 입는다 (보스는 안 맞음)', () => {
  const W = clearWorld(630);
  const p = W.player; p.fireCd = 1e9;
  const g = putEnemy(W, 'grunt', p.x + 20, p.y); g.speed = 0; g.def = Object.assign({}, g.def, { speed: 0 });
  const boss = putEnemy(W, 'boss', p.x - 30, p.y, 1000);
  W.meteors.push({ x: p.x, y: p.y, r: DA.METEOR.r, t: 0, warn: 0.05, rot: 0 });
  p.iframe = 5; // 나는 안 맞게
  for (let i = 0; i < 6; i++) step(W, IDLE, DT);
  assert(g.dead, 'grunt crushed');
  assert(boss.hp === 1000, 'boss untouched');
});

test('돌진이: 멈춰서 예고선을 보인 뒤 돌진한다. 가만히 있으면 맞고 옆으로 비키면 안 맞는다', () => {
  const C = DA.ENEMIES.charger;
  assert(DA.WAVE_POOL.some(w => w.type === 'charger'), 'in wave pool');
  for (const move of [false, true]) {
    const W = clearWorld(640 + (move ? 1 : 0));
    const p = W.player; p.fireCd = 1e9; p.x = 400; p.y = 300;
    const e = putEnemy(W, 'charger', 150, 300, 1e9);
    e.speed = C.speed; e.chRest = 0;
    let warned = false, dashed = false, hurt = 0;
    for (let i = 0; i < 60 * 2; i++) {
      if (e.chWarn > 0) warned = true;
      if (e.chDash > 0) dashed = true;
      step(W, move && warned ? { moveX: 0, moveY: 1, aimAngle: 0, dash: false } : IDLE, DT);
      hurt += W.events.filter(x => x === 'hurt').length; W.events.length = 0;
      if (hurt) break;
    }
    assert(warned && dashed, 'warn then dash');
    assert(move ? hurt === 0 : hurt === 1, (move ? 'sidestep safe' : 'idle hit') + ' ' + hurt);
  }
});

test('사수는 난이도만큼 내가 가는 쪽을 앞질러 쏜다 (가만히 있으면 그대로 겨눔)', () => {
  const shotAngle = (d, vy) => {
    const W = createWorld(800, 600, 650, d);
    clearArena(W);
    const p = W.player; p.x = 400; p.y = 300; p.vx = 0; p.vy = vy; p.fireCd = 1e9;
    const e = { id: 9, type: 'shooter', def: DA.ENEMIES.shooter, x: 100, y: 300, r: 15, hp: 1e9, maxHp: 1e9, speed: 0, spawnT: 0, flash: 0, droneHit: 0, vx: 0, vy: 0, ang: 0, cd: 0.0001, dead: false, strafe: 1 };
    W.enemies.push(e);
    step(W, { moveX: 0, moveY: vy ? 1 : 0, aimAngle: 0, dash: false }, 1e-4);
    const b = W.eBullets[0];
    return Math.atan2(b.vy, b.vx);
  };
  assert(Math.abs(shotAngle('normal', 0)) < 1e-6, 'straight when still');
  const e = shotAngle('easy', 220), n = shotAngle('normal', 220), h = shotAngle('hard', 220);
  assert(e > 0 && e < n && n < h, 'lead ' + e.toFixed(3) + ' ' + n.toFixed(3) + ' ' + h.toFixed(3));
});

// 피하는 봇: 가까운 적·탄·운석 예고·돌진 예고선·블랙홀에서 멀어지고, 벽을 피하며, 가운데를 돈다. 필살기는 차면 쓴다
function dodgeBot(W) {
  const p = W.player;
  let fx = 0, fy = 0;
  for (const e of W.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, R = 260 + e.r;
    if (d < R) { const k = (R - d) / R * (e.spawnT > 0 ? 0.5 : 1.6); fx += dx / d * k; fy += dy / d * k; }
    const a = e.chWarn > 0 ? e.chA : e.warnT > 0 ? e.chargeA : null;
    if (a != null) { const qx = -Math.sin(a), qy = Math.cos(a), side = Math.sign(dx * qx + dy * qy) || 1; fx += qx * side * 2.5; fy += qy * side * 2.5; }
  }
  let danger = false;
  for (const b of W.eBullets) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (d > 190) continue;
    const vl = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / vl, uy = b.vy / vl, along = dx * ux + dy * uy;
    if (along < -10) continue;
    const sx = dx - ux * along, sy = dy - uy * along, sd = Math.hypot(sx, sy) || 1, k = (190 - d) / 190 * 3 * (sd < 30 ? 1.5 : 0.6);
    fx += sx / sd * k; fy += sy / sd * k;
    if (d < 45 && sd < 18) danger = true;
  }
  for (const m of W.meteors) {
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
    if (d < m.r + p.r + 30) { fx += (d < 2 ? 1 : dx / d) * 6; fy += (d < 2 ? 0 : dy / d) * 6; }
  }
  if (W.hole) { const dx = p.x - W.hole.x, dy = p.y - W.hole.y, d = Math.hypot(dx, dy) || 1; if (d < 260) { fx += dx / d * 1.2; fy += dy / d * 1.2; } }
  // 행성 적 예고 (2026-09-27): 빛줄기·번개·보스 레이저 예고선에서 옆으로, 모래 벌레 예고 원 밖으로, 고리 조각 띠에서 위아래로, 안개 웅덩이 피하기
  for (const L of W.lasers || []) {
    if (L.x == null || L.t >= L.warn) continue;
    const a = L.ang != null ? L.ang : L.a, c = Math.cos(a), s = Math.sin(a), dx = p.x - L.x, dy = p.y - L.y;
    const along = dx * c + dy * s, side = -dx * s + dy * c;
    if (along > -20 && (!L.len || along < L.len + 30) && Math.abs(side) < L.w + 40) { const k = side >= 0 ? 1 : -1; fx += -s * k * 4; fy += c * k * 4; }
  }
  for (const e of W.enemies) {
    if (e.wm === 'warn') { const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1; if (d < e.def.popR + 30) { fx += (d < 2 ? 1 : dx / d) * 6; fy += (d < 2 ? 0 : dy / d) * 6; } }
    if (e.type === 'shard' && e.sw !== 'line') { const dy = p.y - e.swY; if (Math.abs(dy) < e.r + 50) fy += (dy >= 0 ? 1 : -1) * 5; }
  }
  for (const m of W.mists || []) { const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1; if (d < m.r + 30) { fx += dx / d * 1.5; fy += dy / d * 1.5; } }
  const m = 110;
  if (p.x < m) fx += (m - p.x) / m * 3; if (p.x > W.w - m) fx -= (p.x - W.w + m) / m * 3;
  if (p.y < m) fy += (m - p.y) / m * 3; if (p.y > W.h - m) fy -= (p.y - W.h + m) / m * 3;
  const ox = p.x - W.w / 2, oy = p.y - W.h / 2, od = Math.hypot(ox, oy) || 1, want = Math.min(W.w, W.h) * 0.28;
  fx += -oy / od * 0.7 + (want - od) / want * ox / od * 0.8;
  fy += ox / od * 0.7 + (want - od) / want * oy / od * 0.8;
  const l = Math.hypot(fx, fy) || 1;
  return { moveX: fx / l, moveY: fy / l, aimAngle: null, dash: danger && p.dashCd <= 0, ult: p.ult >= DA.ULT.need };
}

// 가만히 있는 봇(움직이지 않고 자동 사격만)과 피하는 봇을 난이도마다 시드 여러 개로 돌려 버틴 시간을 잰다
test('난이도: 쉬움부터 가만히 있으면 금방 지고, 피해 다니면 몇 배 오래 버틴다 (쉬움 < 보통 < 어려움)', () => {
  const CAP = 240, SEEDS = 6;
  const survive = (d, bot) => {
    let total = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const W = createWorld(1280, 800, 700 + s, d);
      while (W.phase !== 'over' && W.stats.time < CAP) {
        if (W.phase === 'cards') pickCard(W, (s + W.wave) % 3);
        step(W, bot(W), DT); W.events.length = 0;
      }
      total += W.stats.time;
    }
    return total / SEEDS;
  };
  const r = {};
  for (const d of ['easy', 'normal', 'hard']) r[d] = { idle: survive(d, () => IDLE), dodge: survive(d, dodgeBot) };
  console.log('       버틴 시간(초, 상한 ' + CAP + ') 가만히: 쉬움 ' + r.easy.idle.toFixed(0) + ' / 보통 ' + r.normal.idle.toFixed(0) + ' / 어려움 ' + r.hard.idle.toFixed(0) +
    ' · 피하기: ' + r.easy.dodge.toFixed(0) + ' / ' + r.normal.dodge.toFixed(0) + ' / ' + r.hard.dodge.toFixed(0));
  assert(r.easy.idle > 25 && r.easy.idle < 70, 'easy idle ' + r.easy.idle);
  assert(r.easy.idle > r.normal.idle && r.normal.idle > r.hard.idle, 'idle ordering');
  for (const d of ['easy', 'normal', 'hard']) assert(r[d].dodge > r[d].idle * 3, d + ' dodge ' + r[d].dodge.toFixed(0) + ' vs idle ' + r[d].idle.toFixed(0));
  assert(r.easy.dodge >= r.hard.dodge, 'dodge easy >= hard');
});

// ─── 행성마다 다른 적 (2026-09-27) ───────────────────────────
// 적 하나만 둔 빈 판. 내 총은 멈춰 두고(쏘지 않음) 적 체력은 크게
function foeWorld(seed, type, x, y, d) {
  const W = createWorld(1280, 800, seed, d);
  clearArena(W);
  const p = W.player; p.fireCd = 1e9; p.gun.rate = 1e-9; p.x = 640; p.y = 400; p.vx = p.vy = 0;
  const e = NG.World.spawnEnemy(W, type);
  e.x = x; e.y = y; e.spawnT = 0; e.hp = e.maxHp = 1e9;
  if (type === 'ember') e.emA = Math.atan2(p.y - y, p.x - x);
  if (type === 'shard') { e.dir = x < 640 ? 1 : -1; e.swY = y; }
  W.events.length = 0; W.tags.length = 0;
  return { W, p, e };
}
// sec초 동안 input으로 돌리며 맞은 횟수·경고가 먼저 떴는지 센다. input은 함수(W)여도 된다. 체력은 계속 채운다
function foeRun(W, sec, input, onFrame) {
  let hurt = 0, firstHurtAt = -1;
  for (let i = 0; i < sec * 60; i++) {
    const inp = typeof input === 'function' ? input(W) : input;
    step(W, inp, DT);
    const h = W.events.filter(x => x === 'hurt' || x === 'over').length;
    if (h && firstHurtAt < 0) firstHurtAt = W.t;
    hurt += h;
    if (onFrame) onFrame(W);
    W.events.length = 0;
    W.player.hp = W.player.maxHp;
  }
  return { hurt, firstHurtAt };
}
const STILL = { moveX: 0, moveY: 0, aimAngle: 0, dash: false };

test('행성 적: 행성마다 하나씩 9종, 이름·색·모양이 모두 다르고 그 행성 웨이브에만 섞여 나온다', () => {
  // 태양계 아홉 행성은 적이 모두 다르다 (외계 행성은 이 아홉 가운데 어울리는 것을 다시 쓴다, 다음 테스트)
  const foes = DA.PLANETS.slice(0, 9).map(p => p.foe);
  assert(foes.length === 9 && new Set(foes).size === 9, '9 distinct');
  for (const f of foes) assert(DA.ENEMIES[f] && DA.ENEMIES[f].name && DA.ENEMIES[f].color, f);
  assert(new Set(foes.map(f => DA.ENEMIES[f].color)).size === 9 && new Set(foes.map(f => DA.ENEMIES[f].shape)).size === 9, 'looks differ');
  const rand = NG.rng(5);
  for (let n = 1; n <= 70; n++) {
    const q = buildWave(n, rand, DA.DIFFICULTY.normal), foe = NG.World.foeOf(n);
    assert(foe === DA.PLANETS[Math.floor((n - 1) / 2) % DA.PLANETS.length].foe, 'foe of ' + n);
    const k = q.filter(t => t === foe).length;
    if (n % 5 === 0) assert(q[0] === 'boss' && k === DA.PLANET_FOE.boss, 'boss wave ' + n + ' k ' + k);
    else assert(k >= DA.PLANET_FOE.min && k >= Math.round((q.length) * DA.PLANET_FOE.share) - 1, 'share ' + n + ' k ' + k + '/' + q.length);
    for (const other of foes) if (other !== foe) assert(!q.includes(other), 'no other foe ' + other + ' at ' + n);
  }
});

test('행성 적: 처음 만나면 그 적 위에 "행성 이름 + 적 이름!" 이름표 (한 판에 한 번)', () => {
  const W = createWorld(1280, 800, 71);
  clearArena(W);
  NG.World.spawnEnemy(W, 'worm');
  assert(W.tags.length === 1 && W.tags[0].txt === '화성 모래 벌레!' && W.events.includes('foe'), 'tag ' + (W.tags[0] && W.tags[0].txt));
  NG.World.spawnEnemy(W, 'worm');
  assert(W.tags.length === 1, 'only first time');
  NG.World.spawnEnemy(W, 'grunt');
  assert(W.tags.length === 1, 'plain enemies have no tag');
  for (let i = 0; i < 60 * 3; i++) { step(W, STILL, DT); W.player.hp = W.player.maxHp; }
  assert(W.tags.length === 0, 'tag fades');
});

test('수성 태양 불씨: 해가 있는 위·왼쪽에서 나오고, 가만히 있으면 맞고(불씨는 꺼짐), 옆으로 비키면 스쳐 간다', () => {
  const W0 = createWorld(1280, 800, 72); clearArena(W0);
  for (let i = 0; i < 40; i++) { const e = NG.World.spawnEnemy(W0, 'ember'); assert(e.x <= 20 || e.y <= 20, 'sun side ' + e.x.toFixed(0) + ',' + e.y.toFixed(0)); }
  for (const move of [false, true]) {
    const { W, e } = foeWorld(73, 'ember', 640, 60);
    const r = foeRun(W, 3, move ? { moveX: 1, moveY: 0, aimAngle: 0, dash: false } : STILL);
    if (move) assert(r.hurt === 0, 'sidestep safe ' + r.hurt);
    else assert(r.hurt === 1 && e.dead, 'idle hit and ember burns out');
  }
});

test('금성 산성 구름: 안개 웅덩이를 남기고(점선으로 생기는 동안은 괜찮음) 그 안에선 느려진다, 아프지는 않다', () => {
  const A = DA.ENEMIES.acid;
  const { W, p, e } = foeWorld(74, 'acid', 300, 400);
  e.cd = 0.01; e.speed = 0;
  step(W, STILL, DT);
  assert(W.mists.length === 1 && W.events.includes('mist'), 'mist dropped');
  const m = W.mists[0];
  assert(!NG.World.inMist(W, m.x, m.y), 'not active while forming');
  W.enemies.length = 0; // 구름은 치우고 웅덩이만
  for (let i = 0; i < Math.ceil(m.form * 60) + 12; i++) step(W, STILL, DT);
  assert(NG.World.inMist(W, m.x, m.y), 'active after forming');
  // 웅덩이 안과 밖에서 1초 동안 간 거리
  const go = (x) => { p.x = x; p.y = 400; p.vx = p.vy = 0; const x0 = p.x; for (let i = 0; i < 30; i++) step(W, { moveX: 1, moveY: 0, aimAngle: 0, dash: false }, DT); return p.x - x0; };
  const slow = go(m.x - 20), fast = go(100);
  assert(slow < fast * 0.7 && slow > fast * A.slow * 0.8, 'slowed ' + slow.toFixed(1) + ' vs ' + fast.toFixed(1));
  assert(W.stats.hurts === 0, 'no damage');
  for (let i = 0; i < 60 * (A.mistLife + 1); i++) step(W, STILL, DT);
  assert(W.mists.length === 0, 'mist fades');
});

test('지구 인공위성: 나를 둘레로 돌고, 멈춰서 점선 예고 뒤 짧은 빛줄기. 가만히 있으면 맞고 비키면 안 맞는다, 길이 밖은 안전', () => {
  const S = DA.ENEMIES.sat;
  { // 돌기: 거리가 orbit 쪽으로 가고, 각도가 돈다
    const { W, p, e } = foeWorld(75, 'sat', 640, 100);
    e.cd = 1e9;
    const a0 = Math.atan2(e.y - p.y, e.x - p.x);
    foeRun(W, 4, STILL);
    const d = Math.hypot(e.x - p.x, e.y - p.y), a1 = Math.atan2(e.y - p.y, e.x - p.x);
    assert(Math.abs(d - S.orbit) < 50, 'orbit dist ' + d.toFixed(0));
    assert(Math.abs(a1 - a0) > 0.3, 'moved around');
  }
  for (const move of [false, true]) {
    const { W, e } = foeWorld(76, 'sat', 640, 160);
    e.cd = 0.01;
    let warnedBeforeHit = false;
    const r = foeRun(W, 2, w => (move && w.lasers.length ? { moveX: 1, moveY: 0, aimAngle: 0, dash: false } : STILL),
      w => { if (w.lasers.length && w.lasers[0].t < w.lasers[0].warn && w.stats.hurts === 0) warnedBeforeHit = true; });
    assert(warnedBeforeHit, 'warning first');
    if (move) assert(r.hurt === 0, 'sidestep safe ' + r.hurt);
    else assert(r.hurt === 1 && r.firstHurtAt >= S.beamWarn * 0.95, 'idle hit after warn ' + r.firstHurtAt.toFixed(2));
  }
  { // 빛줄기 길이 밖
    const { W, e } = foeWorld(77, 'sat', 640 - S.beamLen - 80, 400);
    e.cd = 0.01; e.speed = 0;
    // 사거리 밖이면 쏘지 않는다
    foeRun(W, 0.5, STILL);
    assert(W.lasers.length === 0, 'no beam out of range');
  }
});

test('화성 모래 벌레: 땅속에선 못 맞히고 안 아프다, 내 밑에서 둥근 예고 뒤 튀어나온다. 가만히 있으면 맞고 비키면 안 맞는다, 나오면 맞힐 수 있다', () => {
  const Wm = DA.ENEMIES.worm;
  for (const move of [false, true]) {
    const { W, p, e } = foeWorld(78, 'worm', 640, 200);
    e.hp = e.maxHp = 1e9;
    // 땅속: 내 총알이 그냥 지나간다
    W.bullets.push({ x: e.x - 30, y: e.y, vx: 500, vy: 0, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
    let hitWhileHidden = false, warned = false, warnAt = -1;
    const r = foeRun(W, 3, w => (move && e.wm === 'warn' ? { moveX: 1, moveY: 0, aimAngle: 0, dash: false } : STILL), w => {
      if (e.hide && e.hp < e.maxHp) hitWhileHidden = true;
      if (e.wm === 'warn' && !warned) { warned = true; warnAt = w.t; }
    });
    assert(!hitWhileHidden, 'bullets pass while hidden');
    assert(warned, 'warned');
    if (move) assert(r.hurt === 0, 'sidestep safe ' + r.hurt);
    else assert(r.hurt === 1 && r.firstHurtAt - warnAt >= Wm.popWarn * 0.95, 'idle hit after warn');
    assert(e.wm === 'up' && !e.hide, 'surfaced');
    W.bullets.push({ x: e.x - 30, y: e.y, vx: 500, vy: 0, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
    const hp0 = e.hp; step(W, STILL, DT); step(W, STILL, DT); step(W, STILL, DT);
    assert(e.hp < hp0, 'hittable when up');
  }
});

test('목성 번개 구름: 불꽃을 모으며 내가 있던 자리까지 점선 예고, 그다음 짧은 번개. 가만히 있으면 맞고 비키면 안 맞는다', () => {
  const Z = DA.ENEMIES.zap;
  for (const move of [false, true]) {
    const { W, p, e } = foeWorld(79, 'zap', 380, 400);
    e.cd = 0.01;
    let bolt = null;
    const r = foeRun(W, 2, w => (move && w.lasers.length ? { moveX: 0, moveY: 1, aimAngle: 0, dash: false } : STILL), w => { if (!bolt && w.lasers.length) bolt = Object.assign({}, w.lasers[0]); });
    assert(bolt && bolt.kind === 'bolt' && bolt.warn >= Z.zapWarn * 0.99, 'bolt warn');
    assert(bolt.len <= Z.zapReach && Math.abs(bolt.len - (260 + 30)) < 5, 'reaches just past where I was ' + bolt.len);
    if (move) assert(r.hurt === 0, 'sidestep safe ' + r.hurt);
    else assert(r.hurt === 1 && r.firstHurtAt >= Z.zapWarn * 0.95, 'idle hit after warn');
  }
  { // 번개 끝보다 멀리 있으면 안 맞는다 (짧은 번개)
    const { W, p, e } = foeWorld(80, 'zap', 380, 400);
    e.cd = 0.01;
    step(W, STILL, DT);
    const L = W.lasers[0];
    p.x = e.x + (L.len + 60); // 번개 방향(오른쪽)으로 끝보다 더 멀리
    const r = foeRun(W, 1.5, STILL);
    assert(r.hurt === 0, 'beyond bolt safe');
  }
});

test('토성 고리 조각: 끝에서 내 높이로 줄을 맞추고, 가로 띠 예고 뒤 휙 지나간다. 가만히 있으면 맞고 위아래로 비키면 안 맞는다', () => {
  const SD = DA.ENEMIES.shard;
  const W0 = createWorld(1280, 800, 81); clearArena(W0);
  for (let i = 0; i < 30; i++) { const e = NG.World.spawnEnemy(W0, 'shard'); assert(e.x <= 30 || e.x >= 1250, 'side edges'); }
  for (const move of [false, true]) {
    const { W, p, e } = foeWorld(82, 'shard', 30, 250);
    e.swT = SD.aim;
    let lined = false, band = -1;
    const r = foeRun(W, 5, w => (move && e.sw !== 'line' ? { moveX: 0, moveY: -1, aimAngle: 0, dash: false } : STILL), w => {
      if (e.sw === 'warn' && band < 0) { band = w.t; lined = Math.abs(e.swY - 400) < 5; }
    });
    assert(band > 0 && lined, 'lined up with me then band');
    if (move) assert(r.hurt === 0, 'dodge vertically ' + r.hurt);
    else assert(r.hurt >= 1 && r.firstHurtAt - band >= SD.warn * 0.95, 'idle hit after band');
  }
});

test('천왕성 얼음 결정: 부수면 작은 얼음 조각 3개로 쪼개진다', () => {
  const { W, e } = foeWorld(83, 'ice', 300, 300);
  e.hp = 0.5;
  W.bullets.push({ x: 300, y: 300, vx: 500, vy: 0, r: 4, dmg: 5, life: 1, pierce: 0, bounce: 0, hits: [] });
  step(W, STILL, DT);
  const bits = W.enemies.filter(x => x.type === 'iceBit');
  assert(e.dead && bits.length === DA.ENEMIES.ice.splitN && W.events.includes('crack'), 'split into ' + bits.length);
  const angs = bits.map(b => Math.atan2(b.vy, b.vx));
  assert(Math.max(...angs) - Math.min(...angs) > 2, 'fly apart');
});

test('해왕성 폭풍 드론: 나를 둘러싸고 소용돌이치며 돌고, 둘레 바람이 내 총알을 휘게 한다', () => {
  const ST = DA.ENEMIES.storm;
  const { W, p, e } = foeWorld(84, 'storm', 640, 150);
  const ds = [];
  foeRun(W, 8, STILL, w => ds.push(Math.hypot(e.x - p.x, e.y - p.y)));
  const late = ds.slice(120);
  assert(Math.min(...late) > ST.near - 60 && Math.max(...late) < ST.far + 80, 'stays in swirl band ' + Math.min(...late).toFixed(0) + '~' + Math.max(...late).toFixed(0));
  assert(Math.max(...late) - Math.min(...late) > 60, 'swirls in and out');
  // 바람: 드론 옆을 지나는 총알이 휜다 (드론을 멀리 치우면 곧게 간다)
  const bend = (near) => {
    const B = foeWorld(85, 'storm', 640, 300);
    B.e.speed = 0; if (!near) { B.e.x = 100; B.e.y = 700; }
    B.W.bullets.push({ x: 560, y: 300 - 40, vx: 500, vy: 0, r: 4, dmg: 0, life: 1, pierce: 99, bounce: 0, hits: [] });
    const b = B.W.bullets[0];
    for (let i = 0; i < 20; i++) step(B.W, STILL, DT);
    return Math.abs(Math.atan2(b.vy, b.vx));
  };
  assert(bend(true) > 0.1 && bend(false) < 1e-6, 'bullets bend near storm ' + bend(true).toFixed(3));
});

test('명왕성 하트 유령: 보였다 흐려졌다 하고, 흐릴 땐 못 맞히고 닿아도 안 아프며 나와 거리를 둔다', () => {
  const G = DA.ENEMIES.ghost;
  const { W, p, e } = foeWorld(86, 'ghost', 700, 400);
  let sawHidden = false, sawVisible = false, hurtHidden = 0, hitHidden = false, minAppearDist = 1e9;
  const hp0 = e.hp;
  for (let i = 0; i < 60 * 12; i++) {
    const hid = e.hide;
    if (hid) {
      sawHidden = true;
      // 흐릴 때 총알을 몸에 대 본다
      W.bullets.push({ x: e.x, y: e.y, vx: 1, vy: 0, r: 4, dmg: 1, life: 0.05, pierce: 0, bounce: 0, hits: [] });
    } else sawVisible = true;
    const hpBefore = e.hp;
    step(W, STILL, DT);
    if (hid && e.hide && e.hp < hpBefore) hitHidden = true;
    if (hid && !e.hide) minAppearDist = Math.min(minAppearDist, Math.hypot(e.x - p.x, e.y - p.y)); // 다시 나타나는 순간 거리
    if (hid) hurtHidden += W.events.filter(x => x === 'hurt').length;
    W.events.length = 0; p.hp = p.maxHp;
  }
  assert(sawHidden && sawVisible, 'cycles');
  assert(!hitHidden, 'cannot hit while faded');
  assert(hurtHidden === 0, 'harmless while faded');
  assert(minAppearDist > G.keepOff * 0.6, 'reappears away from me ' + minAppearDist.toFixed(0));
  // 보일 때는 맞는다
  e.ghT = 0; e.hide = false; e.vis = 1;
  W.bullets.push({ x: e.x - 20, y: e.y, vx: 500, vy: 0, r: 4, dmg: 1, life: 1, pierce: 0, bounce: 0, hits: [] });
  const h1 = e.hp; step(W, STILL, DT); step(W, STILL, DT);
  assert(e.hp < h1, 'hittable when visible');
});

test('행성 적: 아홉 행성을 모두 지나는 긴 판도 값이 망가지지 않고 모든 웨이브를 깬다', () => {
  const W = createWorld(1280, 800, 87, 'easy');
  const seen = new Set();
  for (let i = 0; i < 60 * 60 * 12 && W.wave < 19; i++) {
    if (W.phase === 'cards') pickCard(W, 0);
    W.player.hp = W.player.maxHp;
    W.player.gun.dmg = Math.max(W.player.gun.dmg, 3 + W.wave);
    step(W, dodgeBot(W), DT);
    for (const e of W.enemies) seen.add(e.type);
    W.events.length = 0;
    if (!finite(W)) throw new Error('NaN at ' + i);
  }
  assert(W.wave >= 19, 'reached lap 2: wave ' + W.wave);
  for (const f of DA.PLANETS.map(p => p.foe)) assert(seen.has(f), 'met ' + f);
  assert(seen.has('iceBit'), 'ice split in play');
});

// ─── 태양계 밖 외계 행성 (2026-09-27) ─────────────────────────
test('외계 행성: 명왕성 다음 도감(WORLDS.EXO) 순서대로 여덟, 이름·한 줄·색은 도감 것, 17곳을 돌면 2바퀴 수성', () => {
  const WL = vm.runInContext('WORLDS', ctx), P = DA.PLANETS, per = DA.JOURNEY.perPlanet;
  const exo = P.slice(9);
  assert(exo.length === 8 && exo.every(p => p.exo), 'eight exo');
  assert(exo.map(p => p.id).join() === WL.EXO.map(e => e.id).join(), 'order ' + exo.map(p => p.id).join());
  for (const p of exo) {
    const e = WL.exo(p.id);
    assert(p.name === e.name && p.fact === e.line && p.color === e.color, 'from catalogue ' + p.id);
    assert(WL.weatherOf(p.id), 'weather ' + p.id);
  }
  for (const p of P.slice(0, 9)) assert(!p.exo && WL.weatherOf(p.id), 'solar weather ' + p.id);
  assert(new Set(P.map(p => p.id)).size === 17, 'ids unique');
  // 웨이브 19 = 첫 외계 행성, 34 = 떠돌이, 35 = 2바퀴 수성, 69 = 3바퀴 수성
  const at = n => NG.World.placeOf(n);
  assert(at(18).planet.id === 'pluto' && at(19).planet.id === 'frost' && at(19).first && at(19).lap === 1, 'after pluto');
  assert(at(34).planet.id === 'rogue' && !at(34).first && at(34).lap === 1, 'last stop');
  assert(at(35).planet.id === 'mercury' && at(35).lap === 2 && at(35).first, 'lap 2');
  assert(at(per * 17 * 2 + 1).planet.id === 'mercury' && at(per * 17 * 2 + 1).lap === 3, 'lap 3');
  for (let n = 1; n <= 102; n++) {
    const k = Math.floor((n - 1) / per);
    assert(at(n).i === k % 17 && at(n).planet === P[k % 17] && at(n).lap === Math.floor(k / 17) + 1, 'place ' + n);
  }
});

test('외계 행성 적: 새 적 없이 어울리는 태양계 적을 다시 쓴다 (얼음=얼음 결정, 용암=불씨, 사막=모래 벌레 …)', () => {
  const want = { frost: 'ice', lava: 'ember', ocean: 'acid', glass: 'storm', gem: 'shard', twin: 'worm', shroom: 'ghost', rogue: 'zap' };
  const solarFoes = new Set(DA.PLANETS.slice(0, 9).map(p => p.foe));
  for (const p of DA.PLANETS.slice(9)) {
    assert(p.foe === want[p.id], 'foe ' + p.id + ' ' + p.foe);
    assert(solarFoes.has(p.foe) && DA.ENEMIES[p.foe], 'reuses a solar foe ' + p.id);
  }
  assert(new Set(DA.PLANETS.slice(9).map(p => p.foe)).size === 8, 'eight different foes');
  // 판 안: 외계 행성 웨이브엔 그 적만 섞이고, 이름표는 처음 만난 태양계 행성 이름 그대로 한 번만
  const W = createWorld(1280, 800, 501);
  while (W.wave < 19) nextWave(W);
  assert(W.place.planet.id === 'frost' && NG.World.foeOf(W.wave) === 'ice', 'frost wave has ice');
  assert(W.spawnQueue.includes('ice') && !W.spawnQueue.includes('storm'), 'queue ' + W.spawnQueue.join());
});

test('외계 행성: 도감(worlds.js)이 없어도 태양계 아홉만으로 돈다', () => {
  const c2 = vm.createContext({ console, Math, Date, JSON });
  for (const f of ['util.js', 'data.js', 'world.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game', 'js', f), 'utf8'), c2, { filename: f });
  const N2 = vm.runInContext('NG', c2);
  assert(N2.DATA.PLANETS.length === 9, 'nine ' + N2.DATA.PLANETS.length);
  assert(N2.World.placeOf(19).planet.id === 'mercury' && N2.World.placeOf(19).lap === 2, 'loops after pluto');
});

test('외계 행성: 쉬움 봇이 34웨이브(떠돌이 행성)까지 가도 값이 멀쩡하고 17곳을 모두 지난다', () => {
  const W = createWorld(1280, 800, 88, 'easy');
  const visited = new Set();
  for (let i = 0; i < 60 * 60 * 30 && W.wave < 35; i++) {
    if (W.phase === 'cards') pickCard(W, 0);
    W.player.hp = W.player.maxHp;
    W.player.gun.dmg = Math.max(W.player.gun.dmg, 3 + W.wave);
    step(W, dodgeBot(W), DT);
    visited.add(W.place.planet.id);
    W.events.length = 0;
    if (!finite(W)) throw new Error('NaN at ' + i);
  }
  assert(W.wave >= 35 && visited.size === 17, 'wave ' + W.wave + ' visited ' + visited.size);
});

// ─── 알아서 맞춰 주는 난이도 ─────────────────────────────────
test('알아서 맞춰 주는 난이도: 배율이 적 수·적이 나오는 간격·운석 간격·적 연사를 살짝 바꾸고, 1이면 그대로', () => {
  const A = DA.ADAPT;
  const base = createWorld(1280, 800, 90, 'normal'), one = createWorld(1280, 800, 90, 'normal', { adapt: 1 });
  assert(one.diff === DA.DIFFICULTY.normal && one.gapMul === 1, 'mul 1 keeps diff');
  const easy = createWorld(1280, 800, 90, 'normal', { adapt: 0.85 }), hard = createWorld(1280, 800, 90, 'normal', { adapt: 1.12 });
  assert(easy.diff.count < base.diff.count && base.diff.count < hard.diff.count, 'count');
  assert(easy.spawnQueue.length <= base.spawnQueue.length && base.spawnQueue.length <= hard.spawnQueue.length, 'queue');
  assert(easy.gapMul > 1 && hard.gapMul < 1, 'spawn gap');
  assert(easy.diff.meteorEvery > base.diff.meteorEvery && hard.diff.meteorEvery < base.diff.meteorEvery, 'meteor');
  assert(easy.diff.fireRate < base.diff.fireRate && hard.diff.fireRate > base.diff.fireRate, 'fire');
  assert(Math.abs(hard.diff.count / base.diff.count - 1.12) < 1e-9, 'count x1.12');
  assert(hard.diff.id === 'normal' && hard.diff.name === '보통' && hard.diff.hp === base.diff.hp, 'keeps id·name·hp');
  assert(DA.DIFFICULTY.normal.count === base.diff.count, 'original untouched');
  assert(createWorld(1280, 800, 90, 'normal', { adapt: 5 }).adapt === A.max && createWorld(1280, 800, 90, 'normal', { adapt: 'x' }).adapt === 1, 'clamped');
  // 간격 배율은 실제 생성에 쓰인다: 쉬운 판이 20초 동안 적을 덜 내보낸다
  const spawned = W => { W.meteorT = 1e9; W.player.gun.dmg = 0; let n = 0; for (let i = 0; i < 60 * 20; i++) { W.player.hp = W.player.maxHp; step(W, STILL, DT); W.events.length = 0; } return W.enemies.length; };
  assert(spawned(createWorld(1280, 800, 91, 'hard', { adapt: 0.85 })) < spawned(createWorld(1280, 800, 91, 'hard', { adapt: 1.12 })), 'fewer enemies when easier');
});

test('알아서 맞춰 주는 난이도: 판 성적 perf는 버틴 시간 ÷ 난이도 목표, 목표에서 1, 최대 3', () => {
  const A = DA.ADAPT;
  const W = createWorld(1280, 800, 92, 'easy');
  const at = (d, t) => { W.diff = DA.DIFFICULTY[d]; W.stats.time = t; return NG.World.perfOf(W); };
  assert(at('easy', 0) === 0 && Math.abs(at('easy', A.target.easy) - 1) < 1e-9 && at('easy', 1e6) === A.maxPerf, 'range');
  assert(at('easy', 60) < at('easy', 120), 'monotonic');
  assert(A.target.easy > A.target.normal && A.target.normal >= A.target.hard, 'targets by difficulty');
  // 가만히 봇(금방 짐)은 1 아래, 피하는 봇은 1 위 (쉬움, 시드 3개)
  for (let s = 1; s <= 3; s++) {
    const run = bot => { const V = createWorld(1280, 800, 930 + s, 'easy'); while (V.phase !== 'over' && V.stats.time < 400) { if (V.phase === 'cards') pickCard(V, 0); step(V, bot(V), DT); V.events.length = 0; } return NG.World.perfOf(V); };
    const idle = run(() => IDLE), dodge = run(dodgeBot);
    assert(idle < 0.6 && dodge > 1.2, 'perf idle ' + idle.toFixed(2) + ' dodge ' + dodge.toFixed(2));
  }
});

// ─── 스티커북 통계 ────────────────────────────────────────────
test('스티커 통계: 가 본 가장 먼 행성(1 수성 … 9 명왕성, 10~17 외계 행성, 2바퀴 수성 18)과 깬 블랙홀 웨이브 수', () => {
  const W = createWorld(1280, 800, 94);
  assert(W.stats.planet === 1 && W.stats.holesCleared === 0, 'start at mercury');
  while (W.wave < 7) nextWave(W);
  assert(W.stats.planet === 4, 'mars at wave 7: ' + W.stats.planet);
  while (W.wave < 17) nextWave(W);
  assert(W.stats.planet === 9, 'pluto ' + W.stats.planet);
  while (W.wave < 19) nextWave(W);
  assert(W.stats.planet === 10, 'first exoplanet ' + W.stats.planet);
  while (W.wave < 35) nextWave(W);
  assert(W.stats.planet === 18 && W.place.planet.id === 'mercury' && W.place.lap === 2, 'lap 2 mercury ' + W.stats.planet);
  // 블랙홀 웨이브를 깨면 하나 는다 (카드 화면이 열릴 때)
  clearArena(W);
  W.hole = { fx: 0.5, fy: 0.5, x: 640, y: 400 };
  W.spawnQueue.length = 0;
  for (let i = 0; i < 120 && W.phase === 'play'; i++) step(W, STILL, DT);
  assert(W.phase === 'cards' && W.stats.holesCleared === 1, 'hole cleared ' + W.stats.holesCleared);
});

test('스티커 통계: 놀이 본부가 행성·블랙홀 스티커를 붙이고, 판 성적으로 난이도 배율이 움직인다 (common/hub.js)', () => {
  const mem = {};
  const hctx = vm.createContext({ console, Math, Date, JSON, Number, String, Object, Array, Set });
  hctx.HUB = { store: { get: (k, f) => (k in mem ? JSON.parse(mem[k]) : f), set: (k, v) => { mem[k] = JSON.stringify(v); } } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common', 'hub.js'), 'utf8'), hctx, { filename: 'hub.js' });
  const H = vm.runInContext('HUB', hctx);
  const W = createWorld(1280, 800, 95);
  while (W.wave < 17) nextWave(W);
  W.stats.holesCleared = 1;
  H.reportRun('ngun', { wave: W.wave, bosses: W.bossKills, kills: W.stats.kills, planet: W.stats.planet, blackholes: W.stats.holesCleared }, 100);
  const got = H.stickers().filter(s => s.game === 'ngun' && s.got).map(s => s.id);
  for (const id of ['ng_mars', 'ng_saturn', 'ng_pluto', 'ng_hole']) assert(got.includes(id), 'sticker ' + id + ' ' + got.join(','));
  // 금방 지는 판이 이어지면 배율이 1 아래로, 아주 잘하면 1 위로
  assert(H.adaptMul('ngun', 'easy') === 1, 'starts at 1');
  for (let i = 0; i < 4; i++) H.adaptRun('ngun', 'easy', NG.World.perfOf({ diff: DA.DIFFICULTY.easy, stats: { time: 30 } }));
  const low = H.adaptMul('ngun', 'easy');
  for (let i = 0; i < 4; i++) H.adaptRun('ngun', 'hard', NG.World.perfOf({ diff: DA.DIFFICULTY.hard, stats: { time: 400 } }));
  const high = H.adaptMul('ngun', 'hard');
  assert(low < 1 && high > 1, 'mul ' + low.toFixed(3) + ' ' + high.toFixed(3));
  assert(createWorld(1280, 800, 96, 'easy', { adapt: low }).diff.count < DA.DIFFICULTY.easy.count, 'applied to world');
});

// ─── 깜짝 선물 상자 · 피버 타임 · 동료 우주선 (2026-09-27) ─────────
const GF = DA.GIFT, FV = DA.FEVER, WM = DA.WINGMAN;
// 적이 한 마리 남아 있는(웨이브가 안 끝나는) 조용한 판. 내 총은 멈춤
function funWorld(seed, d) {
  const W = createWorld(1280, 800, seed, d);
  clearArena(W);
  const p = W.player; p.fireCd = 1e9; p.gun.rate = 1e-9; p.x = 640; p.y = 400;
  const e = NG.World.spawnEnemy(W, 'grunt');
  e.x = 60; e.y = 60; e.spawnT = 0; e.hp = e.maxHp = 1e9; e.speed = 0;
  W.events.length = 0;
  return { W, p, e };
}
function giftAt(W, x, y) {
  const g = NG.World.spawnGift(W);
  g.x = x; g.y = g.baseY = y; g.vx = 0;
  return g;
}

test('선물 상자: 첫 상자는 first초 안, 그다음은 gap초마다 (규칙 난수와 따로 돌아 적 차례는 그대로)', () => {
  // 적 차례가 선물 난수와 무관한지: 같은 시드의 웨이브 구성이 예전과 같다
  const a = createWorld(800, 600, 5), b = createWorld(800, 600, 5);
  b.fun(); b.fun(); b.fun();
  nextWave(a); nextWave(b);
  assert(a.spawnQueue.join() === b.spawnQueue.join(), 'rule rand untouched');
  let seen = 0;
  for (let s = 1; s <= 8; s++) {
    const W = runLongTimes(300 + s, 60 * 400);
    assert(W.appear.length >= 3, 'gifts appeared ' + W.appear.length);
    assert(W.appear[0] >= GF.first[0] - 0.01 && W.appear[0] <= GF.first[1] + 12, 'first ' + W.appear[0].toFixed(1));
    for (let i = 1; i < W.appear.length; i++) {
      const gap = W.appear[i] - W.appear[i - 1];
      assert(gap >= GF.gap[0] - 0.01 && gap <= GF.gap[1] + 12, 'gap ' + gap.toFixed(1));
    }
    seen += W.appear.length;
  }
  console.log('       선물 상자 400초에 평균 ' + (seen / 8).toFixed(1) + '개');
});
// 무적 봇으로 오래 돌리며 선물 상자가 나온 시각(플레이 시간)을 모은다. 상자가 열려도 되고 지나가도 된다
function runLongTimes(seed, frames) {
  const W = createWorld(1280, 800, seed);
  W.appear = [];
  for (let i = 0; i < frames; i++) {
    if (W.phase === 'cards') pickCard(W, i % 3);
    W.player.hp = W.player.maxHp;
    step(W, bot(W), DT);
    if (W.events.indexOf('giftAppear') >= 0) {
      W.appear.push(W.stats.time);
      // 나오는 순간은 막힌 때가 아니어야 한다
      assert(W.waveT >= GF.quiet - 1e-6, 'not at wave start');
      assert(!(W.bossWave && W.waveT < GF.bossQuiet), 'not at boss intro');
      assert(!(W.hole && W.waveT < GF.holeQuiet), 'not at black hole start');
      assert(!W.enemies.some(e => e.type === 'boss' && e.spawnT > 0), 'not while boss appears');
    }
    W.events.length = 0;
  }
  return W;
}

test('선물 상자: 웨이브 시작·보스 등장·블랙홀 시작·웨이브 끝·이미 떠 있을 때는 안 나온다', () => {
  const { W } = funWorld(401);
  W.waveT = 1; assert(NG.World.giftBlocked(W), 'wave start');
  W.waveT = 20; assert(!NG.World.giftBlocked(W), 'free mid wave');
  W.bossWave = true; W.waveT = GF.bossQuiet - 1; assert(NG.World.giftBlocked(W), 'boss intro');
  W.waveT = 20; W.spawnQueue = ['boss']; assert(NG.World.giftBlocked(W), 'boss still to come');
  W.spawnQueue = ['grunt']; W.bossWave = false;
  W.hole = { fx: 0.5, fy: 0.5, x: 640, y: 400 }; W.waveT = GF.holeQuiet - 1; assert(NG.World.giftBlocked(W), 'hole start');
  W.hole = null; W.waveT = 20;
  const q = W.spawnQueue, es = W.enemies; W.spawnQueue = []; W.enemies = [];
  assert(NG.World.giftBlocked(W), 'wave over');
  W.spawnQueue = q; W.enemies = es;
  NG.World.spawnGift(W); assert(NG.World.giftBlocked(W), 'one at a time');
  // 막혀 있을 때 차례가 오면 조금 뒤 다시 본다
  W.gift = null; W.waveT = 0; W.giftT = 0.001;
  step(W, STILL, DT);
  assert(!W.gift && W.giftT > 1, 'retry later ' + W.giftT);
});

test('선물 상자: 약 life초 동안 화면을 가로질러 떠 가고, 안 열면 사라진다', () => {
  const { W } = funWorld(402);
  W.player.x = 640; W.player.y = 40; // 상자가 지나가는 줄 밖
  const g = NG.World.spawnGift(W);
  assert(g.x < 0 || g.x > W.w, 'starts outside');
  const x0 = g.x;
  let inside = 0;
  for (let i = 0; i < 60 * (GF.life + 1) && W.gift; i++) {
    step(W, { moveX: 0, moveY: 0, aimAngle: Math.PI / 2 * -1, dash: false }, DT);
    if (W.gift && W.gift.x > 0 && W.gift.x < W.w) inside += DT;
  }
  assert(!W.gift && W.stats.gifts === 0, 'gone unopened');
  assert(inside > GF.life * 0.8, 'visible ' + inside.toFixed(1) + 's');
  assert(Math.sign(x0 - 640) !== 0, 'crossed');
});

test('선물 상자: 총알 hits발(또는 닿기)로 열리고 색종이와 "선물:" 알림, gifts가 센다', () => {
  const { W, p } = funWorld(403);
  const g = giftAt(W, 900, 400);
  p.gun.rate = 20; p.fireCd = 0;
  let hits = 0;
  for (let i = 0; i < 120 && W.gift; i++) { step(W, { moveX: 0, moveY: 0, aimAngle: 0, dash: false }, DT); hits += W.events.filter(x => x === 'giftHit').length; W.events.length = 0; }
  assert(!W.gift && W.stats.gifts === 1, 'opened by shots');
  assert(hits === GF.hits - 1, 'hit sounds ' + hits);
  assert(W.giftPop && /^선물: /.test(W.giftPop.txt), 'popup ' + (W.giftPop && W.giftPop.txt));
  assert(W.particles.length >= GF.confetti, 'confetti');
  assert(g.hits === GF.hits, 'hits ' + g.hits);
  // 닿아도 열린다
  giftAt(W, p.x + 10, p.y);
  step(W, STILL, DT);
  assert(!W.gift && W.stats.gifts === 2, 'opened by touch');
  // 자동 조준은 가까운 상자를 겨눈다
  const { W: W2, p: p2 } = funWorld(404);
  giftAt(W2, 640, 250);
  p2.gun.rate = 5; p2.fireCd = 0;
  step(W2, IDLE, DT);
  assert(Math.abs(p2.aim + Math.PI / 2) < 1e-6, 'auto aim at gift ' + p2.aim);
});

test('선물 상자 선물: 코인 15~40(판 끝 코인에 "선물 상자"로) · 방패 · 드론 20초 · 필살기 가득 · 다음 판 시작 아이템', () => {
  const { W, p } = funWorld(405);
  const seen = {};
  for (let i = 0; i < 400; i++) {
    const r = NG.World.giftReward(W);
    seen[r.id] = (seen[r.id] || 0) + 1;
    if (r.id === 'coins') assert(r.n >= 15 && r.n <= 40 && r.n % 5 === 0, 'coins ' + r.n);
    if (r.id === 'item') assert(DA.START_ITEMS.some(it => it.id === r.item), 'item ' + r.item);
  }
  for (const id of ['coins', 'shield', 'drone', 'ult', 'item']) assert(seen[id] > 10, 'reward ' + id + ' ' + seen[id]);
  assert(seen.coins > seen.shield, 'coins most common');
  // 이미 있는 방패, 가득 찬 필살기는 안 뽑는다
  p.shield = 1; p.ult = DA.ULT.need;
  for (let i = 0; i < 200; i++) { const r = NG.World.giftReward(W); assert(r.id !== 'shield' && r.id !== 'ult', 'skip owned ' + r.id); }
  p.shield = 0; p.ult = 0;
  // 코인
  const open = rw => { NG.World.spawnGift(W); return NG.World.openGift(W, rw); };
  open({ id: 'coins', n: 25 });
  assert(W.stats.coins === 25 && W.stats.giftCoins === 25 && W.giftPop.txt === '선물: 코인 25개!', 'coins ' + W.giftPop.txt);
  // 방패
  open({ id: 'shield' }); assert(p.shield === 1 && W.giftPop.txt === '선물: 방패!', 'shield');
  // 필살기
  open({ id: 'ult' }); assert(p.ult === DA.ULT.need, 'ult');
  // 드론: 20초 뒤 사라진다. 또 받으면 시간만 늘고 개수는 그대로
  const d0 = p.drones;
  open({ id: 'drone' }); assert(p.drones === d0 + 1 && p.giftDroneT === 20, 'drone');
  for (let i = 0; i < 60 * 10; i++) step(W, STILL, DT);
  open({ id: 'drone' }); assert(p.drones === d0 + 1 && p.giftDroneT === 20, 'drone extend');
  for (let i = 0; i < 60 * 20 + 5; i++) step(W, STILL, DT);
  assert(p.drones === d0 && p.giftDroneT === 0, 'drone gone ' + p.drones);
  // 다음 판 시작 아이템 (칸이 가득이면 코인으로)
  open({ id: 'item', item: 'shield' }); open({ id: 'item', item: 'barrel' });
  assert(W.giftPop.txt === '선물: 다음 판 총열 +1 시작!', 'item text ' + W.giftPop.txt);
  assert(W.stats.gifts === 7, 'count ' + W.stats.gifts);
  const st = SH.blank(); st.items.barrel = DA.START_ITEMS.find(i => i.id === 'barrel').max;
  const run = SH.runOf(W);
  assert(run.gifts === 7 && run.giftCoins === 25 && run.giftItems.join() === 'shield,barrel', 'runOf ' + JSON.stringify(run.giftItems));
  const before = SH.coinsFor(SH.runOf(W), st).total;
  const res = SH.finishRun(st, run);
  assert(st.items.shield === 1 && res.items.join() === 'shield', 'item given');
  assert(res.parts.gift === 25 + GF.itemFullCoins && res.parts.pickup === 0, 'parts ' + JSON.stringify(res.parts));
  assert(res.coins === before + GF.itemFullCoins, 'full slot -> coins');
});

test('피버: 콤보가 이어지는 처치로 게이지가 차고, need에서 time초 동안 점수 두 배, 끝나면 0부터', () => {
  const { W } = funWorld(406);
  const kill = () => { const e = NG.World.spawnEnemy(W, 'grunt'); e.spawnT = 0; NG.World.killEnemy(W, e, 0, 0); W.enemies = W.enemies.filter(x => !x.dead); };
  // 콤보가 fromCombo가 되기 전 처치는 안 찬다
  for (let i = 1; i < FV.fromCombo; i++) kill();
  assert(W.fever === 0, 'no fill before combo ' + FV.fromCombo);
  for (let i = 0; i < FV.need - 1; i++) kill();
  assert(W.fever === FV.need - 1 && W.feverT === 0, 'filling ' + W.fever);
  const sc0 = W.score; kill(); const plain = W.score - sc0;
  assert(W.feverT === FV.time && W.stats.fevers === 1 && W.events.indexOf('fever') >= 0, 'fever on');
  const sc1 = W.score; kill(); const doubled = W.score - sc1;
  assert(doubled === 2 * plain, 'score x2 ' + plain + ' -> ' + doubled);
  // 피버 중엔 게이지가 줄어들며 안 찬다
  for (let i = 0; i < 60 * 5; i++) { step(W, STILL, DT); W.combo = 5; W.comboT = 1; }
  assert(Math.abs(W.fever - FV.need / 2) < 1, 'draining ' + W.fever.toFixed(1));
  for (let i = 0; i < 60 * 5 + 5; i++) step(W, STILL, DT);
  assert(W.feverT === 0 && W.fever === 0 && W.events.indexOf('feverEnd') >= 0, 'fever off');
  // 콤보가 끊겨 있으면 조금씩 줄어든다
  W.combo = 0; W.fever = 10;
  for (let i = 0; i < 60 * 5; i++) step(W, STILL, DT);
  assert(Math.abs(W.fever - (10 - FV.idleDrain * 5)) < 0.1, 'idle drain ' + W.fever);
});

test('피버: 봇 판에서도 가끔 온다 (적·탄·체력은 그대로, 어려워지지 않음)', () => {
  let n = 0;
  for (let s = 1; s <= 4; s++) {
    const W = createWorld(1280, 800, 520 + s);
    for (let i = 0; i < 60 * 300; i++) { if (W.phase === 'cards') pickCard(W, i % 3); W.player.hp = W.player.maxHp; step(W, bot(W), DT); W.events.length = 0; }
    n += W.stats.fevers;
  }
  assert(n >= 4 && n <= 24, 'fevers ' + n);
  // 피버 중에도 적 속도·탄 속도·체력은 그대로
  const A = funWorld(411).W, B = funWorld(411).W;
  NG.World.startFever(B);
  for (let i = 0; i < 60; i++) { step(A, STILL, DT); step(B, STILL, DT); }
  assert(A.enemies[0].x === B.enemies[0].x && A.player.hp === B.player.hp && A.diff.enemySpeed === B.diff.enemySpeed, 'same game');
  console.log('       피버 300초 봇 판 4개에 ' + n + '번');
});

test('동료 캡슐: firstWave부터 2~3웨이브마다, 웨이브 시작 몇 초 뒤, 한 번에 하나', () => {
  const W = createWorld(1280, 800, 407);
  const waves = [];
  for (let n = 0; n < 30; n++) {
    nextWave(W);
    if (W.capT > 0) { waves.push(W.wave); assert(W.capT >= WM.delay[0] && W.capT <= WM.delay[1], 'delay ' + W.capT); }
    W.capT = -1;
  }
  assert(waves[0] === WM.firstWave, 'first wave ' + waves[0]);
  for (let i = 1; i < waves.length; i++) { const g = waves[i] - waves[i - 1]; assert(g >= WM.every[0] && g <= WM.every[1], 'every ' + g); }
  // 동료가 있으면 캡슐 차례가 미뤄진다
  const { W: V } = funWorld(408);
  V.capNext = V.wave; V.wing = { x: 0, y: 0, t: 5, bye: 0, look: DA.SHIPS[1], aim: 0, cd: 1, wave: 0 };
  V.capT = 0.01; step(V, STILL, DT);
  assert(!V.capsule, 'no capsule while wingman');
  V.wing = null; V.capT = 0.01; step(V, STILL, DT);
  assert(V.capsule, 'capsule spawns');
  assert(V.capsule.look.id !== V.player.ship, 'looks like another ship');
});

test('동료 우주선: 캡슐을 쏘거나 닿으면 나와 time초 동안 옆을 따라다니며 가장 가까운 적을 쏘고, "고마워!" 뒤 떠난다', () => {
  const { W, p, e } = funWorld(409);
  const c = NG.World.spawnCapsule(W);
  c.x = 900; c.y = 400; c.vx = c.vy = 0;
  p.gun.rate = 20; p.fireCd = 0;
  for (let i = 0; i < 120 && W.capsule; i++) step(W, { moveX: 0, moveY: 0, aimAngle: 0, dash: false }, DT);
  assert(!W.capsule && W.wing && W.stats.wingmen === 1, 'freed');
  p.gun.rate = 1e-9; p.fireCd = 1e9; W.bullets.length = 0;
  // 가까운 적과 먼 적: 가까운 쪽을 쏜다
  const near = NG.World.spawnEnemy(W, 'grunt'); near.spawnT = 0; near.hp = near.maxHp = 1e9; near.speed = 0;
  for (let i = 0; i < 30; i++) step(W, STILL, DT);
  const w = W.wing;
  near.x = w.x + 150; near.y = w.y + 10; e.x = w.x - 400; e.y = w.y;
  assert(NG.World.wingTarget(W) === near, 'nearest target');
  W.bullets.length = 0;
  for (let i = 0; i < 40; i++) { near.x = w.x + 150; near.y = w.y + 10; step(W, STILL, DT); }
  const shots = W.bullets.filter(b => b.wing);
  assert(shots.length >= 1, 'shots ' + shots.length);
  for (const b of shots) assert(b.vx > 0 && Math.abs(b.vy) < Math.abs(b.vx) * 0.3, 'toward near');
  assert(shots[0].dmg === p.gun.dmg * WM.dmgMul, 'small gun');
  // 사거리 밖 적만 있으면 안 쏜다
  near.x = w.x + WM.range + 200; e.x = w.x - WM.range - 200;
  W.bullets.length = 0;
  for (let i = 0; i < 30; i++) { near.x = w.x + WM.range + 200; step(W, STILL, DT); }
  assert(!W.bullets.some(b => b.wing), 'out of range');
  // 옆을 따라다닌다
  assert(Math.hypot(w.x - p.x, w.y - p.y) < WM.side + 20, 'beside player');
  // time초 뒤 인사하고 떠난다
  let bye = false;
  for (let i = 0; i < 60 * (WM.time + WM.bye + 1) && W.wing; i++) {
    step(W, STILL, DT);
    if (W.events.indexOf('wingBye') >= 0) { bye = true; assert(W.texts.some(t => t.txt === '고마워!'), 'thanks'); assert(Math.abs(W.t - (WM.time + 0.5)) < 2.5 || W.t > WM.time, 'lifetime ' + W.t); }
    W.events.length = 0;
  }
  assert(bye && !W.wing, 'left');
  // 닿아도 열린다
  const c2 = NG.World.spawnCapsule(W); c2.x = p.x + 5; c2.y = p.y; c2.vx = c2.vy = 0;
  step(W, STILL, DT);
  assert(W.wing && W.stats.wingmen === 2, 'freed by touch');
});

test('동료 캡슐: 안 열면 지나가 사라지고, 다음 웨이브에 다시 기회', () => {
  const { W } = funWorld(410);
  W.player.x = 20; W.player.y = 780;
  const c = NG.World.spawnCapsule(W);
  for (let i = 0; i < 60 * (WM.capLife + 1) && W.capsule; i++) step(W, { moveX: 0, moveY: 0, aimAngle: Math.PI, dash: false }, DT);
  assert(!W.capsule && !W.wing, 'gone');
  assert(W.capNext === W.wave + 1, 'retry next wave');
  assert(c.hits === 0, 'untouched');
});

test('놀이 본부 통계: 선물·피버·동료 수를 runOf와 판 통계에 남긴다', () => {
  const W = runLong(78, 60 * 300, false);
  const r = SH.runOf(W);
  for (const k of ['gifts', 'fevers', 'wingmen']) assert(Number.isInteger(r[k]) && r[k] === W.stats[k], k);
  assert(W.stats.wingmen >= 1, 'wingmen ' + W.stats.wingmen);
  console.log('       300초 봇 판: 선물 ' + W.stats.gifts + ' · 피버 ' + W.stats.fevers + ' · 동료 ' + W.stats.wingmen);
});


// ─── 아이 눈높이 점검 (2026-09-27) ──────────────────────────
// 한 번 더!: 지고 나서 되살아나는 규칙이 world.js 안에 있어야 main.js 없이도 믿을 수 있다
function deadWorld(seed, d) {
  const W = createWorld(1280, 800, seed, d || 'easy', {});
  for (let i = 0; i < 60; i++) step(W, IDLE, DT);
  W.player.hp = 1; W.player.iframe = 0; W.player.dashT = 0; W.player.shield = 0;
  const e = NG.World.spawnEnemy(W, 'grunt'); e.spawnT = 0; e.x = W.player.x; e.y = W.player.y;
  for (let i = 0; i < 30 && W.phase === 'play'; i++) { e.x = W.player.x; e.y = W.player.y; step(W, IDLE, DT); }
  return W;
}

test('한 번 더!: 지면 한 번 되살아날 수 있고, 되살아나면 체력 절반·3초 무적·주변 적 탄과 적이 치워진다', () => {
  const RV = NG.DATA.REVIVE;
  const W = deadWorld(501);
  assert(W.phase === 'over' && W.canRevive, 'can revive after first death');
  const p = W.player;
  // 주변에 적 탄 · 멀리에 적 탄 · 바로 옆 적
  W.eBullets.push({ x: p.x + 30, y: p.y, vx: 0, vy: 0, r: 5, life: 5 }, { x: p.x + RV.clearR + 200, y: p.y, vx: 0, vy: 0, r: 5, life: 5 });
  const near = NG.World.spawnEnemy(W, 'grunt'); near.spawnT = 0; near.x = p.x + 10; near.y = p.y;
  // 지고 나면 세상은 멈춘다 (한 번 더를 기다리는 동안 더 맞지 않음)
  const t0 = W.t;
  for (let i = 0; i < 60; i++) step(W, IDLE, DT);
  assert(W.t === t0 && W.phase === 'over', 'frozen while waiting');
  assert(NG.World.revive(W) === true, 'revive ok');
  assert(W.phase === 'play' && W.revives === 1 && W.stats.revives === 1 && !W.canRevive, 'state');
  assert(p.hp === Math.min(p.maxHp, Math.max(RV.hpMin, Math.ceil(p.maxHp * RV.hpShare))), 'hp ' + p.hp);
  assert(Math.abs(p.iframe - RV.iframe) < 1e-9 && p.iframe >= 2.5, 'invulnerable about 3 s');
  assert(W.eBullets.length === 1 && W.eBullets[0].x > p.x + RV.clearR, 'nearby bullets cleared, far kept');
  assert(Math.hypot(near.x - p.x, near.y - p.y) >= RV.pushR - 1, 'near enemy pushed away');
  assert(W.events.indexOf('revive') >= 0, 'event');
  // 무적 동안은 적이 붙어도 안 아프다
  const hp = p.hp;
  for (let i = 0; i < 60; i++) { near.x = p.x; near.y = p.y; step(W, IDLE, DT); }
  assert(p.hp === hp && W.phase === 'play', 'no damage while invulnerable');
});

test('한 번 더!: 한 판에 한 번뿐, 안 쓰면(giveUp) 그대로 끝, 판 기록은 이어진다', () => {
  const W = deadWorld(502);
  const kills = W.stats.kills, time = W.stats.time;
  assert(NG.World.revive(W), 'first');
  for (let i = 0; i < 60 * 4; i++) step(W, IDLE, DT);
  W.player.hp = 1; W.player.iframe = 0; W.player.shield = 0;
  const e = NG.World.spawnEnemy(W, 'grunt'); e.spawnT = 0;
  for (let i = 0; i < 60 && W.phase === 'play'; i++) { e.x = W.player.x; e.y = W.player.y; step(W, IDLE, DT); }
  assert(W.phase === 'over' && !W.canRevive, 'second death cannot revive');
  assert(NG.World.revive(W) === false && W.phase === 'over', 'revive refused');
  assert(W.stats.time > time && W.stats.kills >= kills, 'run continued');
  // giveUp: 한 번 더를 안 쓰면 막힌다
  const V = deadWorld(503);
  NG.World.giveUp(V);
  assert(!V.canRevive && NG.World.revive(V) === false && V.phase === 'over', 'give up');
  // 판 도중(살아 있을 때)엔 revive가 아무것도 안 한다
  const A = createWorld(800, 600, 504);
  assert(NG.World.revive(A) === false && A.phase === 'play' && A.revives === 0, 'no revive while alive');
});

test('카드 글: 모든 카드에 큰 그림과 아이 말 두세 마디 (퍼센트·영어 없음), 수치는 작게 남는다', () => {
  for (const c of NG.DATA.CARDS.concat([NG.DATA.FALLBACK_CARD])) {
    const t = NG.World.cardText(c);
    assert(t.pic && t.pic !== c.icon, 'picture ' + c.id);
    const words = t.words.split(' ');
    assert(words.length >= 2 && words.length <= 3, 'two or three words ' + c.id + ' ' + t.words);
    assert(!/[%×A-Za-z0-9+]/.test(t.words), 'no numbers or jargon ' + c.id + ' ' + t.words);
    assert(t.small === c.desc, 'small numbers kept ' + c.id);
  }
});

test('추천 카드: 체력이 절반 이하면 체력 카드, 아니면 대포 추가 먼저, 없으면 차례대로', () => {
  const W = createWorld(800, 600, 510, 'easy');
  const C = id => NG.DATA.CARDS.find(c => c.id === id) || NG.DATA.FALLBACK_CARD;
  W.cards = [C('rate'), C('vital'), C('barrel')];
  W.player.hp = W.player.maxHp;
  assert(NG.World.recommendCard(W) === 2, 'barrel when healthy');
  W.player.hp = 1;
  assert(NG.World.recommendCard(W) === 1, 'vital when hurt');
  W.cards = [C('bounce'), C('crit'), C('move')];
  W.player.hp = W.player.maxHp;
  assert(NG.World.recommendCard(W) === 2, 'first in order (move) ' + NG.World.recommendCard(W));
  W.cards = null;
  assert(NG.World.recommendCard(W) === -1, 'no cards');
  // 웨이브를 넘기면 카드와 함께 추천도 정해진다
  const V = createWorld(800, 600, 511, 'easy');
  V.player.hp = 1e9;
  for (let i = 0; i < 60 * 120 && V.phase !== 'cards'; i++) { for (const e of V.enemies) e.hp = 0; step(V, IDLE, DT); }
  assert(V.phase === 'cards' && V.recommend >= 0 && V.recommend < V.cards.length, 'recommend set ' + V.recommend);
});

test('보스 스티커: 이긴 보스 종류를 판 기록에 남기고, 기록은 처음 이긴 종류만 새로 넣는다', () => {
  const W = createWorld(1280, 800, 520, 'easy', {});
  W.bossKills = 1; // 두 번째 보스 모습 (스타 크러셔)
  const b = NG.World.spawnEnemy(W, 'boss'); b.spawnT = 0;
  const id = b.look.id;
  NG.World.killEnemy(W, b, 0, 0);
  assert(W.stats.bossTypes.length === 1 && W.stats.bossTypes[0] === id && W.lastBoss === id, 'recorded ' + id);
  const again = NG.World.spawnEnemy(W, 'boss'); again.spawnT = 0; again.look = b.look;
  NG.World.killEnemy(W, again, 0, 0);
  assert(W.stats.bossTypes.length === 1, 'no duplicate in run');
  const rec = R.blank();
  assert(R.bossKindCount(rec) === 0, 'empty');
  assert(R.addBossKinds(rec, W.stats.bossTypes, '2026-09-27').join() === id, 'fresh');
  assert(R.addBossKinds(rec, [id, 'octa', 'nope']).join() === 'octa', 'only new known kinds');
  assert(R.bossKindCount(rec) === 2, 'count');
  // 저장본을 거쳐도 남고, 모르는 보스 id는 버린다
  const st = fakeStore();
  rec.bossKinds.fake = 'x';
  R.save(rec, st);
  const back = R.load(st);
  assert(R.bossKindCount(back) === 2 && back.bossKinds[id] === '2026-09-27' && !('fake' in back.bossKinds), 'saved');
  // 예전 저장본(bossKinds 없음)도 빈 칸으로
  assert(R.bossKindCount(R.load(fakeStore({ 'ngun.rec1': JSON.stringify({ v: 1 }) }))) === 0, 'old save');
});

test('화면 크기 바꾸기: 아이템·동료 캡슐·선물 상자·안개·운석 예고도 새 화면 안으로', () => {
  const W = createWorld(1280, 800, 530, 'easy', {});
  NG.World.addDrop(W, 1250, 780, 'coin');
  const c = NG.World.spawnCapsule(W); c.x = 1260; c.y = 790;
  const g = NG.World.spawnGift(W); g.baseY = g.y = 780;
  W.mists.push({ x: 1200, y: 760, r: 58, t: 0, form: 0.6, life: 4.5 });
  W.meteors.push({ x: 1220, y: 770, r: 58, t: 0, warn: 1, rot: 0 });
  NG.World.resize(W, 600, 400);
  const d = W.drops[W.drops.length - 1];
  assert(d.x <= 600 && d.y <= 400, 'drop inside ' + d.x + ',' + d.y);
  assert(c.x <= 600 - c.r && c.y <= 400 - c.r, 'capsule inside');
  assert(g.y <= 400 - g.r && g.baseY <= 400, 'gift height inside');
  assert(W.mists[0].x <= 600 && W.mists[0].y <= 400 && W.meteors[0].x <= 600 && W.meteors[0].y <= 400, 'mist and meteor inside');
});

test('처음 난이도는 쉬움, 행성 도착 글은 도감의 재미 한 줄 (사실 설명 없음)', () => {
  assert(NG.DATA.DEFAULT_DIFF === 'easy' && NG.DATA.DIFFICULTY[NG.DATA.DEFAULT_DIFF], 'default easy');
  const SW = vm.runInContext('WORLDS', ctx).SOLAR_WEATHER;
  for (const p of NG.DATA.PLANETS.filter(q => !q.exo)) assert(p.fact === SW[p.id].line, 'fun line ' + p.id + ' ' + p.fact);
  for (const p of NG.DATA.PLANETS) assert(!/가장|행성입니다|태양과/.test(p.fact), 'no fact ' + p.fact);
});

test('파편은 상한을 넘지 않고, 내 기체 위 글자는 겹치지 않게 쌓인다', () => {
  const W = createWorld(800, 600, 540, 'easy', {});
  const cap = NG.DATA.VIEW.particles;
  for (let i = 0; i < 80; i++) { const e = NG.World.spawnEnemy(W, 'tank'); e.spawnT = 0; NG.World.killEnemy(W, e, 1, 0); }
  assert(W.particles.length <= cap, 'cap ' + W.particles.length);
  W.texts.length = 0; W.hitstop = 0; W.enemies.length = 0; W.drops.length = 0;
  NG.World.addDrop(W, W.player.x, W.player.y, 'shield');
  NG.World.addDrop(W, W.player.x, W.player.y, 'heat');
  step(W, IDLE, DT);
  const mine = W.texts.filter(t => t.mine);
  assert(mine.length === 2 && Math.abs(mine[0].y - mine[1].y) >= 16, 'stacked ' + mine.map(t => t.y).join());
  for (const t of mine) assert(t.y < W.player.y - W.player.r * 2, 'above the ship');
});

// ─── 소리 (audio.js, 공통 SND) ─────────────────────────────
// AudioContext가 없는 node에서 audio.js를 불러 이름·연결만 검사한다 (실제 크기는 크로미움으로 재서 game/PLAN.md 소리 절에 적음)
const AUDIO_SRC = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'audio.js'), 'utf8');
function audioCtx() {
  const c = vm.createContext({ console, Math, Date, JSON, setTimeout, clearTimeout });
  vm.runInContext('var HUB = { store: { get: (k, f) => f, set() {} } };', c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common', 'sound.js'), 'utf8'), c, { filename: 'sound.js' });
  vm.runInContext('var NG = {};', c);
  for (const f of ['samples.js', 'audio.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'game', 'js', f), 'utf8'), c, { filename: f });
  return { A: vm.runInContext('NG.Audio', c), S: vm.runInContext('SND', c) };
}

test('소리: 효과음 이름이 겹치지 않는다 (옛 block 두 번 정의 → shieldBlock·hexBlock)', () => {
  const body = AUDIO_SRC.slice(AUDIO_SRC.indexOf('const SFX = {'), AUDIO_SRC.indexOf('\n  };', AUDIO_SRC.indexOf('const SFX = {')));
  const keys = [...body.matchAll(/^    ([A-Za-z]+) ?:/mg)].map(m => m[1]);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert(keys.length > 40 && !dup.length, 'dup ' + dup.join());
  assert(!keys.includes('block') && keys.includes('shieldBlock') && keys.includes('hexBlock'), 'block split');
  const { A } = audioCtx();
  assert(A.names.length === keys.length, 'names ' + A.names.length + ' vs ' + keys.length);
});

test('소리: 판 이벤트마다 소리가 있다 (방패 막기 shieldBlock, 헥사 방패 hexBlock, 터짐 down, 되살아남 continueGo)', () => {
  const { A, S } = audioCtx();
  const src = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'world.js'), 'utf8');
  const evs = new Set([...src.matchAll(/events\.push\('([A-Za-z]+)'\)/g)].map(m => m[1]).concat(['laser', 'beam', 'zap']));
  for (const ev of evs) {
    const s = A.soundOf(ev);
    assert(s, 'no sound for ' + ev);
    if (s.startsWith('ui.')) assert(S.UI_NAMES.includes(s.slice(3)), 'ui ' + s);
  }
  assert(A.soundOf('shieldBlock') === 'shieldBlock' && A.soundOf('hexBlock') === 'hexBlock', 'blocks');
  assert(A.soundOf('over') === 'down' && A.soundOf('revive') === 'ui.continueGo' && A.soundOf('pick') === 'ui.tap', 'aliases');
  // 방패 막기를 부르는 곳이 실제로 world.js에 있다
  assert(evs.has('shieldBlock') && evs.has('hexBlock') && !evs.has('block'), 'world events');
});

test('소리: main.js가 부르는 공통 효과음(SND.ui)은 모두 있는 이름', () => {
  const { S } = audioCtx();
  const main = fs.readFileSync(path.join(__dirname, '..', 'game', 'js', 'main.js'), 'utf8');
  const used = new Set([...main.matchAll(/NG\.Audio\.ui\('([A-Za-z]+)'/g)].map(m => m[1]));
  for (const n of ['start', 'tap', 'open', 'close', 'buy', 'deny', 'claim', 'coin', 'medal', 'sticker', 'continueAsk', 'tick', 'fanfare']) assert(used.has(n), 'main.js uses ' + n);
  assert(/'overSoft' : 'over'/.test(main), 'over / overSoft by difficulty');
  for (const n of used) assert(S.UI_NAMES.includes(n), 'unknown ui ' + n);
  // 옛 소리 설정 키는 SND가 이어받으므로 main.js가 더는 쓰지 않는다
  assert(!/ngun\.muted|ngun\.audio|AUDIO_KEY|MUTE_KEY/.test(main.replace(/\/\/.*$/mg, '')), 'old keys');
});

test('소리: 날카로운 네모파·아주 높은 쉿 소리가 없다, 총소리 크기는 총열 수와 무관', () => {
  assert(!/'square'/.test(AUDIO_SRC), 'square wave');
  assert(!/noise\([^;]*'highpass'/.test(AUDIO_SRC), 'highpass noise sparkle');
  const shoot = AUDIO_SRC.slice(AUDIO_SRC.indexOf('    shoot: {'), AUDIO_SRC.indexOf('    hit:'));
  assert(/\[1, 0\.93, 1\.07\]/.test(shoot), 'three pitch variants');
  // 크기(4번째 뒤 숫자)에 n이 들어가지 않는다
  for (const m of shoot.matchAll(/(?:noise|tone)\(([^;]*)\);/g)) { const args = m[1].split(','); assert(!/\bn\b/.test(args.slice(6).join(',')), 'volume uses n: ' + m[1]); }
  assert(!/ac\.createDynamicsCompressor|new AC\b|AudioContext/.test(AUDIO_SRC.replace(/\/\/.*$/mg, '')), 'no own context or compressor');
});

test('소리: AudioContext가 없어도 소리 함수가 조용히 아무것도 안 한다', () => {
  const { A } = audioCtx();
  A.unlock(); A.play('shoot', { n: 3 }); A.event('over'); A.event('revive'); A.event('shieldBlock'); A.ui('tap');
  A.title(); A.startPlay('mars'); A.planet('saturn', true); A.boss(false); A.fever(true); A.duck(true); A.duck(false); A.stopMusic();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
