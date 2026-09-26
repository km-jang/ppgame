'use strict';
// 게임 규칙 테스트. 브라우저 없이 world.js를 그대로 돌린다.
// 실행: node tests/sim.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
for (const f of ['util.js', 'data.js', 'world.js']) {
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

test('어려움이 보통보다 빨리 끝난다 (가만히 있는 봇, 시드 8개 평균)', () => {
  const survive = d => {
    let total = 0;
    for (let s = 1; s <= 8; s++) {
      const W = createWorld(900, 650, s, d);
      let i = 0;
      while (W.phase !== 'over' && i++ < 60 * 600) { if (W.phase === 'cards') pickCard(W, 0); step(W, IDLE, DT); W.events.length = 0; }
      total += W.t;
    }
    return total / 8;
  };
  const e = survive('easy'), n = survive('normal'), h = survive('hard');
  console.log('       생존 평균(초) 쉬움 ' + e.toFixed(0) + ' / 보통 ' + n.toFixed(0) + ' / 어려움 ' + h.toFixed(0));
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
