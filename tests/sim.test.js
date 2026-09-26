'use strict';
// 게임 규칙 테스트. 브라우저 없이 world.js를 그대로 돌린다.
// 실행: node tests/sim.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
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
  assert(W.spawnQueue.length === 8, '1웨이브 적 수 ' + W.spawnQueue.length);
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
  assert(base === NG.DATA.GUN.dmg * U.minMul, 'min damage at start: ' + base);
  assert(base > NG.DATA.ENEMIES.tank.hp, 'first special clears a wave-1 heavy');
  W.player.gun.barrels = 6; W.player.gun.rate = 8; W.player.gun.dmg = 2;
  assert(NG.World.ultDamage(W) === 2 * 8 * 6 * U.sec, 'scales with gun');
  W.wave = 11;
  assert(Math.abs(NG.World.ultDamage(W) - 2 * 8 * 6 * U.sec * 2.5) < 1e-9, 'and with wave');
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
    blocked += W.events.filter(x => x === 'block').length; W.events.length = 0; W.player.hp = W.player.maxHp;
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
function clearArena(W) { W.spawnQueue = ['grunt']; W.spawnTimer = 1e9; W.enemies.length = 0; W.eBullets.length = 0; if (W.lasers) W.lasers.length = 0; W.banner = 0; }

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

test('코인: 점수÷40 + (웨이브-1)×4 + 보스×40 + 주운 코인, 코인 보너스 강화는 10%씩', () => {
  const run = { score: 4000, wave: 6, bosses: 1, runCoins: 21 };
  const c = SH.coinsFor(run, SH.blank());
  assert(c.parts.score === 100 && c.parts.wave === 20 && c.parts.boss === 40 && c.parts.pickup === 21 && c.parts.bonus === 0 && c.total === 181, JSON.stringify(c));
  const st = SH.blank(); st.up.coin = 3;
  assert(SH.coinsFor(run, st).total === 181 + Math.floor(181 * 0.3), 'bonus');
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
  assert(res.coins === 20 + 8 + 15 && st.coins === res.coins && st.life.games === 1, 'coins ' + res.coins);
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
  assert(p.hp === hp && p.shield === 0 && W.stats.blocks === 1 && W.events.includes('block') && !W.waveHit, 'blocked');
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
