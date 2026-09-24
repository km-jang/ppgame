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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
