'use strict';
// 게임 규칙. DOM을 건드리지 않으므로 node 테스트에서 그대로 돌린다.
// 소리·흔들림처럼 화면 쪽이 반응할 일은 W.events에 이름만 쌓아 두고 main.js가 꺼내 간다.
(function (NG) {
  const D = NG.DATA;
  const TAU = Math.PI * 2;
  const MAX_PARTICLES = 700;

  // opts: {ship, upgrades:{hp,dmg,ultStart,magnet 단계}, loadout:{shield,barrel,fullult}} (생략하면 예전 기본 기체)
  function makePlayer(x, y, diff, opts) {
    const P = D.PLAYER;
    const o = opts || {};
    const ship = (D.SHIPS && D.SHIPS.find(s => s.id === o.ship)) || (D.SHIPS && D.SHIPS[0]) || null;
    const p = {
      x, y, r: P.r, vx: 0, vy: 0,
      hp: diff.hp, maxHp: diff.hp, iframe: 0, muzzle: 0,
      speed: P.speed,
      dashT: 0, dashCd: 0, dashCdMax: P.dashCd, dashX: 1, dashY: 0,
      aim: -Math.PI / 2, fireCd: 0,
      gun: Object.assign({}, D.GUN),
      drones: 0, droneAng: 0, vamp: 0, nova: 0,
      ult: 0, ultT: 0, // 필살기 게이지 (0 ~ D.ULT.need), 발동 연출 남은 시간
      lvl: {},
      // 기체·아이템 (상점)
      ship: ship ? ship.id : 'core', look: ship,
      passive: ship && ship.passive || null, healMul: 1, iframeMul: 1, ultMul: 1, magnetMul: 1,
      shield: 0, heatT: 0, magT: 0,
    };
    if (!opts) return p; // 예전과 똑같은 기본 상태 (시연 판·테스트)
    if (ship) {
      p.maxHp = Math.max(1, p.maxHp + (ship.hp || 0));
      p.speed *= ship.speed || 1;
      p.dashCdMax *= ship.dashCd || 1;
      const g = p.gun, sg = ship.gun || {};
      if (sg.barrels) g.barrels += sg.barrels;
      if (sg.rate) g.rate *= sg.rate;
      if (sg.dmg) g.dmg *= sg.dmg;
      if (sg.speed) g.speed *= sg.speed;
      if (sg.crit) g.crit += sg.crit;
      if (sg.critMul) g.critMul = sg.critMul;
      if (sg.pierce) g.pierce += sg.pierce;
      p.drones += ship.drones || 0;
      p.healMul = ship.healMul || 1;
      p.iframeMul = ship.iframeMul || 1;
      p.ultMul = ship.ultMul || 1;
    }
    const up = o.upgrades || {};
    const U = id => D.UPGRADES.find(u => u.id === id);
    const lv = id => Math.max(0, Math.min(D.UPGRADE_MAX, Math.floor(Number(up[id]) || 0)));
    p.maxHp += lv('hp') * U('hp').per;
    p.gun.dmg *= 1 + lv('dmg') * U('dmg').per;
    p.ult = D.ULT.need * Math.min(1, lv('ultStart') * U('ultStart').per);
    p.magnetMul = 1 + lv('magnet') * U('magnet').per;
    const lo = o.loadout || {};
    if (lo.shield) p.shield = 1;
    if (lo.barrel) p.gun.barrels += 1;
    if (lo.fullult) p.ult = D.ULT.need;
    p.hp = p.maxHp;
    return p;
  }

  // diff: 'easy' | 'normal' | 'hard' (생략하면 보통). opts: makePlayer 참고 (상점 기체·강화·시작 아이템)
  // 알아서 맞춰 주는 난이도: 난이도 수치를 복사해 압박 손잡이(적 수·운석 간격·적 연사)에 배율 m을 살짝 곱한다 (data.js ADAPT)
  // 적이 나오는 간격은 W.gapMul로 따로 (WAVE.spawnGap은 함수라서). m이 1이면 원래 난이도 그대로
  function adaptDiff(df, m) {
    const A = D.ADAPT;
    const mm = NG.clamp(Number(m) || 1, A.min, A.max);
    if (mm === 1) return { diff: df, gapMul: 1, mul: 1 };
    const k = w => 1 + (mm - 1) * w;
    return {
      diff: Object.assign({}, df, { count: df.count * k(A.count), meteorEvery: df.meteorEvery / k(A.meteor), fireRate: df.fireRate * k(A.fire) }),
      gapMul: 1 / k(A.gap), mul: mm,
    };
  }

  // 이번 판을 그 난이도 기준으로 얼마나 잘했나 (1 = 보통 잘한 판, 금방 지면 1 아래, 최대 ADAPT.maxPerf). HUB.adaptRun에 넘긴다
  function perfOf(W) {
    const A = D.ADAPT;
    const target = A.target[W.diff.id] || A.target.normal;
    return Math.max(0, Math.min(A.maxPerf, (W.stats.time || 0) / target));
  }

  // opts.adapt: 알아서 맞춰 주는 난이도 배율 (main.js가 HUB.adaptMul로 읽어 넘긴다. 없으면 1)
  function createWorld(w, h, seed, diff, opts) {
    const base = D.DIFFICULTY[diff] || D.DIFFICULTY.normal;
    const ad = adaptDiff(base, opts && opts.adapt);
    const df = ad.diff;
    const sd = seed == null ? (Date.now() & 0xffffffff) : seed;
    const W = {
      w, h, t: 0, diff: df, adapt: ad.mul, gapMul: ad.gapMul,
      rand: NG.rng(sd),
      // 선물 상자·동료 캡슐 뽑기용 난수: 규칙 난수(rand)와 따로 돌아서 적·카드·운석 차례를 바꾸지 않는다
      fun: NG.rng(((sd >>> 0) ^ 0x5bd1e995) + 7),
      phase: 'play', // play | cards | over
      wave: 0, banner: 0, bossWave: false, bossKills: 0,
      spawnQueue: [], spawnTimer: 0, clearT: -1,
      player: makePlayer(w / 2, h / 2, df, opts),
      enemies: [], bullets: [], eBullets: [], lasers: [], particles: [], drops: [], texts: [],
      // 태양계 여행·블랙홀·운석 (2026-09-27). place: 지금 행성(placeOf), hole: 이번 웨이브 블랙홀 {fx, fy, x, y} 또는 null
      place: null, hole: null, holes: 0, meteors: [], meteorT: 0,
      // 행성 적 (2026-09-27): mists 금성 안개 웅덩이, tags 처음 만난 적 이름표, met 이번 판에 만난 행성 적
      mists: [], tags: [], met: {},
      cards: null, events: [], shake: 0, flash: 0, whiteFlash: 0,
      hitstop: 0, lastStop: -1, slow: 0, pulse: 0, booms: [], shocks: [],
      score: 0, nextId: 1,
      combo: 0, comboT: 0, comboPop: 0, // 연속 처치 수, 끊기기까지 남은 시간, HUD 튀어 오름
      waveHit: false,                    // 이번 웨이브에 한 대라도 맞았나
      pendDash: false, pendUlt: false,   // 화면 멈춤(히트스톱) 중에 누른 대시·필살기는 멈춤이 풀린 뒤 쓴다
      // 깜짝 선물 상자 · 피버 타임 · 동료 우주선 (2026-09-27). waveT: 이번 웨이브가 시작된 뒤 흐른 시간
      waveT: 0, gift: null, giftT: 0, giftPop: null,
      fever: 0, feverT: 0, feverBanner: 0,
      capsule: null, capT: -1, capNext: 0, wing: null,
      stats: { kills: 0, shots: 0, time: 0, picks: [], ults: 0,
        dashes: 0, hurts: 0, cleanWaves: 0, cleanBoss: 0, bestCombo: 0, ultBoss: 0, ultBest: 0,
        coinPicks: 0, coins: 0, items: 0, blocks: 0, bombKills: 0, // 아이템: 주운 코인 수·코인 값·다른 아이템 수·방패로 막음·폭탄 처치
        planet: 0, holesCleared: 0,
        gifts: 0, giftCoins: 0, giftItems: [], fevers: 0, wingmen: 0 }, // 연 선물 상자 · 선물 코인 · 다음 판 시작 아이템 선물 · 피버 횟수 · 구한 동료 // 스티커: 가 본 가장 먼 행성(1 수성 … 9 명왕성, 2바퀴 수성 10 …) · 깬 블랙홀 웨이브 수 // 아이템: 주운 코인 수·코인 값·다른 아이템 수·방패로 막음·폭탄 처치
    };
    W.giftT = between(W.fun, D.GIFT.first);
    W.capNext = D.WINGMAN.firstWave;
    startWave(W);
    return W;
  }
  // [a, b] 사이 아무 값
  const between = (r, ab) => ab[0] + r() * (ab[1] - ab[0]);

  function resize(W, w, h) {
    W.w = w; W.h = h;
    if (W.hole) { W.hole.x = W.hole.fx * w; W.hole.y = W.hole.fy * h; }
    const p = W.player;
    p.x = NG.clamp(p.x, p.r, w - p.r);
    p.y = NG.clamp(p.y, p.r, h - p.r);
    for (const e of W.enemies) {
      e.x = NG.clamp(e.x, e.r, w - e.r);
      e.y = NG.clamp(e.y, e.r, h - e.r);
    }
  }

  // ─── 웨이브 ────────────────────────────────────────────────
  function buildWave(n, rand, diff) {
    const WV = D.WAVE;
    const df = diff || D.DIFFICULTY.normal;
    const boss = n % WV.bossEvery === 0;
    const count = Math.round((boss ? 4 + n : WV.baseCount + Math.floor(n * WV.perWave)) * df.count);
    const pool = D.WAVE_POOL.filter(p => n >= p.from);
    const q = [];
    if (boss) q.push('boss');
    for (let i = 0; i < count; i++) q.push(NG.weighted(pool, rand).type);
    // 그 행성의 적을 웨이브 안에 고르게 바꿔 넣는다 (앞쪽 보스는 그대로)
    const foe = foeOf(n);
    if (foe) {
      const PF = D.PLANET_FOE, s0 = boss ? 1 : 0, len = q.length - s0;
      const k = Math.min(len, boss ? PF.boss : Math.max(PF.min, Math.round(len * PF.share)));
      for (let j = 0; j < k; j++) q[s0 + Math.floor((j + 0.5) * len / k)] = foe;
    }
    return q;
  }
  // n웨이브의 행성 적 종류 (없으면 null)
  function foeOf(n) {
    const f = placeOf(n).planet.foe;
    return f && D.ENEMIES[f] ? f : null;
  }

  // ─── 태양계 여행 ───────────────────────────────────────────
  // n웨이브가 어느 행성인지. i: PLANETS 차례(0 수성 … 8 명왕성), lap: 몇 바퀴째(1부터), first: 그 행성의 첫 웨이브
  function placeOf(n) {
    const per = D.JOURNEY.perPlanet, k = Math.floor(Math.max(0, n - 1) / per), N = D.PLANETS.length;
    return { i: k % N, planet: D.PLANETS[k % N], lap: Math.floor(k / N) + 1, first: (Math.max(1, n) - 1) % per === 0 };
  }

  // 이번 웨이브에 블랙홀이 생기나. 보스 웨이브·바로 앞이 블랙홀이면 안 생긴다
  function rollHole(W) {
    const B = D.BLACKHOLE;
    const had = !!W.hole;
    W.hole = null;
    if (W.bossWave || had || W.wave < B.from) return;
    if (W.rand() >= B.chance) return;
    const p = W.player;
    let fx = 0.5, fy = 0.5;
    for (let i = 0; i < 10; i++) {
      fx = B.place[0] + W.rand() * (B.place[1] - B.place[0]);
      fy = B.place[0] + W.rand() * (B.place[1] - B.place[0]);
      if (NG.dist2(fx * W.w, fy * W.h, p.x, p.y) > B.minFromPlayer * B.minFromPlayer) break;
    }
    W.hole = { fx, fy, x: fx * W.w, y: fy * W.h };
    W.holes += 1;
  }

  // 블랙홀이 (x, y)를 끌어당기는 힘 (px/초 또는 px/초²). strength: 난이도 pull·bulletPull
  function holePull(W, x, y, strength) {
    const h = W.hole, B = D.BLACKHOLE;
    if (!h || !strength) return { x: 0, y: 0 };
    const dx = h.x - x, dy = h.y - y, d = Math.hypot(dx, dy);
    if (d < B.core) return { x: 0, y: 0 };
    const near = Math.max(0, 1 - d / (B.range * Math.max(W.w, W.h)));
    const f = strength * (B.near + (1 - B.near) * near);
    return { x: dx / d * f, y: dy / d * f };
  }

  function startWave(W) {
    W.wave += 1;
    W.bossWave = W.wave % D.WAVE.bossEvery === 0;
    W.place = placeOf(W.wave);
    W.stats.planet = Math.max(W.stats.planet, (W.place.lap - 1) * D.PLANETS.length + W.place.i + 1);
    rollHole(W);
    W.mists.length = 0; W.player.mist = false;
    W.meteors.length = 0;
    W.meteorT = D.METEOR.firstDelay;
    W.spawnQueue = buildWave(W.wave, W.rand, W.diff);
    W.spawnTimer = 0.8;
    W.clearT = -1;
    W.banner = D.WAVE.banner;
    W.eBullets.length = 0; W.lasers.length = 0;
    W.waveHit = false;
    W.pendDash = W.pendUlt = false;
    W.waveT = 0;
    // 동료 캡슐: 차례가 된 웨이브이고 동료·캡슐이 없으면 웨이브 시작 몇 초 뒤에 (있으면 다음 웨이브에 다시)
    const WM = D.WINGMAN;
    if (W.wave >= W.capNext && !W.wing && !W.capsule) {
      W.capT = between(W.fun, WM.delay);
      W.capNext = W.wave + WM.every[0] + Math.floor(W.fun() * (WM.every[1] - WM.every[0] + 1));
    }
    // 하이브 기체 특기: 5웨이브에 드론 하나 더
    if (W.player.passive === 'hive' && W.wave === 5 && W.player.look) W.player.drones += 1;
    W.events.push(W.bossWave ? 'boss' : 'wave');
    if (W.hole) W.events.push('hole');
    else if (W.place.first) W.events.push('planet');
  }

  // edges: 고를 수 있는 가장자리 (0 위 · 1 오른쪽 · 2 아래 · 3 왼쪽). 생략하면 네 곳 모두
  function spawnPoint(W, r, edges) {
    const p = W.player;
    const safe2 = D.WAVE.safeRadius * D.WAVE.safeRadius;
    let x = 0, y = 0;
    for (let i = 0; i < 8; i++) {
      const edge = edges ? edges[Math.floor(W.rand() * edges.length)] : Math.floor(W.rand() * 4);
      const t = W.rand();
      const m = r + 8;
      if (edge === 0) { x = m + t * (W.w - 2 * m); y = m; }
      else if (edge === 1) { x = W.w - m; y = m + t * (W.h - 2 * m); }
      else if (edge === 2) { x = m + t * (W.w - 2 * m); y = W.h - m; }
      else { x = m; y = m + t * (W.h - 2 * m); }
      if (NG.dist2(x, y, p.x, p.y) > safe2) break;
    }
    return { x, y };
  }

  function makeEnemy(W, type, x, y, warn) {
    const def = D.ENEMIES[type];
    const WV = D.WAVE;
    let hpMul = 1 + (W.wave - 1) * WV.hpPerWave;
    if (type === 'boss') hpMul = 1 + W.bossKills * WV.bossHpPerBoss;
    const spMul = 1 + Math.min(WV.speedMax, (W.wave - 1) * WV.speedPerWave);
    const hp = def.hp * hpMul * W.diff.enemyHp;
    const e = {
      id: W.nextId++, type, def, x, y, r: def.r,
      hp, maxHp: hp, speed: def.speed * spMul * W.diff.enemySpeed,
      vx: 0, vy: 0, spawnT: warn ? D.WAVE.spawnWarn : 0,
      flash: 0, droneHit: 0, dead: false, ang: 0,
      cd: def.fireCd ? def.fireCd * (0.5 + W.rand()) : 0,
      chRest: def.rest ? def.rest * (0.5 + W.rand()) : 0, chWarn: 0, chDash: 0, chA: 0,
      ringCd: def.ringCd || 0, aimCd: def.aimCd || 0, summonCd: def.summonCd || 0,
      strafe: W.rand() < 0.5 ? 1 : -1,
    };
    // 보스는 몇 번째 보스냐에 따라 모습·색이 다르다
    if (type === 'boss') { e.look = bossLook(W.bossKills); e.mk = Math.floor(W.bossKills / D.BOSSES.length) + 1; }
    initFoe(W, e);
    W.enemies.push(e);
    return e;
  }

  // 행성 적의 처음 상태. hide: 땅속·흐린 동안 true (못 맞히고, 닿아도 안 아프다)
  function initFoe(W, e) {
    const def = e.def, p = W.player, r = () => 0.5 + W.rand();
    switch (e.type) {
      case 'ember': e.emA = Math.atan2(p.y - e.y, p.x - e.x); break;              // 나오는 순간 내 쪽으로 방향을 정한다
      case 'acid': e.cd = def.mistCd * r(); break;
      case 'sat': e.cd = def.beamCd * r(); e.busy = 0; break;
      case 'zap': e.cd = def.zapCd * r(); e.busy = 0; break;
      case 'worm': e.wm = 'dig'; e.wmT = def.digMax; e.hide = true; break;
      case 'shard': e.sw = 'line'; e.swT = def.aim * r(); e.dir = e.x < W.w / 2 ? 1 : -1; e.swY = e.y; break;
      case 'ghost': e.ghT = W.rand() * def.on; e.vis = 1; break;
      case 'storm': e.ph = W.rand() * 6; break;
    }
  }

  // n번째(0부터) 보스의 모습. 적의 색은 colorOf로 읽는다 (보스는 모습 색)
  function bossLook(n) { return D.BOSSES[((n % D.BOSSES.length) + D.BOSSES.length) % D.BOSSES.length]; }
  const colorOf = e => (e.look ? e.look.color : e.def.color);

  // 태양 불씨는 해가 있는 쪽(위·왼쪽)에서, 고리 조각은 왼쪽·오른쪽 끝에서 나온다
  const FOE_EDGES = { ember: [0, 3], shard: [1, 3] };
  function spawnEnemy(W, type) {
    const pt = spawnPoint(W, D.ENEMIES[type].r, FOE_EDGES[type]);
    const e = makeEnemy(W, type, pt.x, pt.y, true);
    meetFoe(W, e);
    return e;
  }

  // 이번 판에 처음 만난 행성 적이면 그 위에 이름표 ("화성 모래 벌레!")
  function meetFoe(W, e) {
    if (W.met[e.type]) return;
    const pl = D.PLANETS.find(q => q.foe === e.type);
    if (!pl) return;
    W.met[e.type] = true;
    const T = D.PLANET_FOE.tag;
    W.tags.push({ id: e.id, x: e.x, y: e.y, txt: pl.name + ' ' + e.def.name + '!', col: e.def.color, life: T, max: T });
    W.events.push('foe');
  }

  function updateSpawns(W, dt) {
    if (W.spawnQueue.length) {
      W.spawnTimer -= dt;
      if (W.spawnTimer <= 0) {
        const n = D.WAVE.groupSize(W.wave);
        for (let i = 0; i < n && W.spawnQueue.length; i++) spawnEnemy(W, W.spawnQueue.shift());
        W.spawnTimer += D.WAVE.spawnGap(W.wave) * (W.gapMul || 1);
      }
      return;
    }
    // 보스 연쇄 폭발·느린 화면·필살기 충격파가 끝날 때까지 카드 화면을 미룬다
    // (큰 화면 구석에서 쓴 충격파는 1초 넘게 퍼져서, 안 기다리면 카드 화면에 멈춘 고리가 남고 다음 웨이브로 넘어갔다)
    if (W.enemies.length === 0 && !W.booms.length && W.slow <= 0 && !W.shocks.length) {
      if (W.clearT < 0) W.clearT = D.WAVE.clearDelay;
      W.clearT -= dt;
      if (W.clearT <= 0) openCards(W);
    }
  }

  // ─── 카드 ──────────────────────────────────────────────────
  function openCards(W) {
    W.phase = 'cards';
    W.cards = drawCards(W, 3);
    W.eBullets.length = 0; W.lasers.length = 0; W.meteors.length = 0; W.mists.length = 0;
    W.pendDash = W.pendUlt = false;
    // 캡슐이 나오기 전에 웨이브가 끝났으면 다음 웨이브에 다시
    if (W.capT > 0) { W.capT = -1; W.capNext = W.wave + 1; }
    if (W.hole) W.stats.holesCleared += 1;
    if (!W.waveHit) {
      W.stats.cleanWaves += 1;
      if (W.bossWave) W.stats.cleanBoss += 1;
    }
    W.events.push('clear');
  }

  function drawCards(W, n) {
    const p = W.player;
    const pool = D.CARDS.filter(c => (p.lvl[c.id] || 0) < c.max);
    const out = [];
    while (out.length < n && pool.length) {
      const c = NG.weighted(pool, W.rand);
      out.push(c);
      pool.splice(pool.indexOf(c), 1);
    }
    while (out.length < n) out.push(D.FALLBACK_CARD);
    return out;
  }

  function pickCard(W, index) {
    if (W.phase !== 'cards' || !W.cards) return false;
    const c = W.cards[index];
    if (!c) return false;
    const p = W.player;
    c.apply(p);
    p.lvl[c.id] = (p.lvl[c.id] || 0) + 1;
    W.stats.picks.push(c.id);
    W.cards = null;
    W.phase = 'play';
    W.events.push('pick');
    startWave(W);
    return true;
  }

  // ─── 전투 공통 ─────────────────────────────────────────────
  function burst(W, x, y, color, n, speed, size) {
    for (let i = 0; i < n; i++) {
      if (W.particles.length >= MAX_PARTICLES) W.particles.shift();
      const a = W.rand() * TAU;
      const s = speed * (0.3 + W.rand() * 0.9);
      const life = 0.3 + W.rand() * 0.45;
      W.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size * (0.6 + W.rand() * 0.8) });
    }
  }

  // 화면 멈춤. force면 간격 제한 없이
  function impact(W, sec, force) {
    if (!sec) return;
    if (!force && W.t - W.lastStop < D.IMPACT.gap) return;
    W.hitstop = Math.max(W.hitstop, sec);
    W.lastStop = W.t;
  }

  // 적 사망 연출: 몸체가 삼각 파편으로 쪼개져 맞은 방향으로 흩어지고, 흰 섬광과 충격파 고리
  function shatter(W, e, dx, dy) {
    const big = e.r >= 20;
    const n = Math.min(14, 4 + Math.round(e.r / 3));
    const dl = Math.hypot(dx, dy) || 1;
    const bx = dx / dl, by = dy / dl;
    for (let i = 0; i < n; i++) {
      if (W.particles.length >= MAX_PARTICLES) W.particles.shift();
      const a = W.rand() * TAU;
      const s = 90 + W.rand() * 260;
      const life = 0.45 + W.rand() * 0.45;
      W.particles.push({
        shard: true, x: e.x + Math.cos(a) * e.r * 0.4, y: e.y + Math.sin(a) * e.r * 0.4,
        vx: Math.cos(a) * s + bx * 180, vy: Math.sin(a) * s + by * 180,
        rot: W.rand() * TAU, vr: (W.rand() - 0.5) * 18,
        size: e.r * (0.35 + W.rand() * 0.35), life, max: life, color: colorOf(e),
      });
    }
    W.particles.push({ pop: true, x: e.x, y: e.y, r: e.r * 1.3, life: 0.12, max: 0.12, color: '#ffffff' });
    W.particles.push({ ring: true, x: e.x, y: e.y, r: e.r * (big ? 3.2 : 2.4), life: big ? 0.4 : 0.3, max: big ? 0.4 : 0.3, color: colorOf(e) });
    if (big) W.pulse = Math.max(W.pulse, 0.5);
  }

  // src가 'ult'면 필살기 피해라 게이지를 채우지 않는다
  function damageEnemy(W, e, amount, crit, dx, dy, src) {
    if (e.dead) return;
    if (src !== 'ult') chargeUlt(W, e, Math.min(amount, e.hp));
    e.hp -= amount;
    e.flash = 0.08;
    if (crit) {
      W.texts.push({ x: e.x, y: e.y - e.r, txt: Math.round(amount * 10) / 10 + '!', life: 0.7 });
      if (W.texts.length > 40) W.texts.shift();
    }
    if (e.hp <= 0) killEnemy(W, e, dx || 0, dy || 0);
    else W.events.push('hit');
  }

  function killEnemy(W, e, dx, dy) {
    e.dead = true;
    const p = W.player;
    const C = D.COMBO;
    W.combo += 1;
    W.comboT = C.window;
    if (W.combo > W.stats.bestCombo) W.stats.bestCombo = W.combo;
    if (W.combo >= C.show) W.comboPop = 1;
    if (C.marks.indexOf(W.combo) >= 0) W.events.push('combo');
    const mul = 1 + W.bossKills * 0.5;
    W.score += Math.round(e.def.score * mul * W.diff.score * D.comboMul(W.combo) * feverMul(W));
    fillFever(W, e);
    W.stats.kills += 1;
    shatter(W, e, dx, dy);
    burst(W, e.x, e.y, colorOf(e), e.type === 'boss' ? 60 : 4 + Math.round(e.r / 3), e.type === 'boss' ? 420 : 200, e.type === 'boss' ? 5 : 2.5);
    impact(W, D.IMPACT.stop[e.type], e.type === 'boss');

    if (e.def.splitInto) {
      const sn = e.def.splitN || 2;
      for (let i = 0; i < sn; i++) {
        const a = sn > 2 ? TAU * i / sn + W.rand() * 0.6 : W.rand() * TAU;
        const m = makeEnemy(W, e.def.splitInto, e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, false);
        m.vx = Math.cos(a) * 200; m.vy = Math.sin(a) * 200;
      }
    }
    if (e.type === 'ice') { W.events.push('crack'); W.particles.push({ ring: true, x: e.x, y: e.y, r: e.r * 3, life: 0.35, max: 0.35, color: '#e6fbff' }); }
    if (e.type === 'boss') {
      W.bossKills += 1;
      W.shake = Math.max(W.shake, 22);
      W.whiteFlash = 0.5;
      W.pulse = 1;
      W.slow = D.IMPACT.bossSlow;
      W.eBullets.length = 0; W.lasers.length = 0;
      // 연쇄 폭발: 보스 자리 주변에서 시간차로 터진다
      for (let i = 0; i < D.IMPACT.bossBooms; i++) {
        const a = W.rand() * TAU, r = e.r * (0.3 + W.rand() * 1.1);
        W.booms.push({ delay: 0.12 + i * 0.13, x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, color: i % 2 ? '#ffe66d' : colorOf(e) });
      }
      for (let i = 0; i < 2; i++) addDrop(W, e.x + (i ? 20 : -20), e.y);
      W.events.push('bossDown');
    } else {
      if (W.rand() < D.DROP.healChance * (p.healMul || 1)) addDrop(W, e.x, e.y);
      else rollItem(W, e.x, e.y);
      W.events.push('kill');
    }
    if (e.type === 'boss' && D.ITEMS) {
      // 보스는 코인을 흩뿌린다
      const n = D.ITEMS.coin.bossCoins;
      for (let i = 0; i < n; i++) { const a = TAU * i / n; addDrop(W, e.x + Math.cos(a) * 44, e.y + Math.sin(a) * 44, 'coin'); }
    }
    if (p.vamp > 0 && p.hp < p.maxHp && W.rand() < p.vamp) {
      p.hp += 1;
      W.texts.push({ x: p.x, y: p.y - 20, txt: '+1', life: 0.8, heal: true });
    }
  }

  // ─── 필살기 ────────────────────────────────────────────────
  // 준 피해를 "적 기본 체력" 단위로 바꿔 쌓는다 (웨이브·난이도로 단단해진 만큼 나눈다)
  function chargeUlt(W, e, amount) {
    const p = W.player, U = D.ULT;
    if (amount <= 0 || p.ult >= U.need) return;
    let gain = amount * e.def.hp / e.maxHp;
    if (e.type === 'boss') gain *= U.bossRate;
    p.ult = Math.min(U.need, p.ult + gain * (p.ultMul || 1));
    if (p.ult >= U.need) W.events.push('ultReady');
  }

  function ultDamage(W) {
    const g = W.player.gun, U = D.ULT;
    const waveMul = 1 + (W.wave - 1) * D.WAVE.hpPerWave;
    return Math.max(g.dmg * U.minMul, g.dmg * g.rate * g.barrels * U.sec) * waveMul * W.diff.enemyHp;
  }

  function useUlt(W) {
    const p = W.player, U = D.ULT;
    if (p.ult < U.need || W.phase !== 'play') return false;
    p.ult = 0;
    p.ultT = 0.6;
    p.iframe = Math.max(p.iframe, U.iframe);
    const max = Math.hypot(Math.max(p.x, W.w - p.x), Math.max(p.y, W.h - p.y)) + 60;
    W.shocks.push({ x: p.x, y: p.y, r: 0, max, dmg: ultDamage(W), hit: [], kills: 0, n: p.gun.barrels * U.spokes, rot: p.aim });
    W.stats.ults += 1;
    W.shake = Math.max(W.shake, 18);
    W.whiteFlash = Math.max(W.whiteFlash, 0.3);
    W.pulse = 1;
    impact(W, U.stop, true);
    W.events.push('ult');
    return true;
  }

  // 충격파가 퍼지며 닿은 적에게 한 번씩 피해, 닿은 적 탄은 지운다
  function updateShocks(W, dt) {
    if (!W.shocks.length) return;
    const U = D.ULT;
    for (const s of W.shocks) {
      s.r += U.speed * dt;
      for (const e of W.enemies) {
        if (e.dead || e.spawnT > 0 || e.hide || s.hit.indexOf(e.id) >= 0) continue;
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d - e.r > s.r) continue;
        s.hit.push(e.id);
        const dx = e.x - s.x, dy = e.y - s.y;
        damageEnemy(W, e, e.type === 'boss' ? Math.min(s.dmg * U.bossMul, e.maxHp * U.bossCap) : s.dmg, false, dx, dy, 'ult');
        if (e.dead) {
          s.kills += 1;
          if (s.kills > W.stats.ultBest) W.stats.ultBest = s.kills;
          if (e.type === 'boss') W.stats.ultBoss += 1;
        } else if (e.type !== 'boss') { const l = d || 1; e.vx += dx / l * 420; e.vy += dy / l * 420; }
      }
      W.eBullets = W.eBullets.filter(b => Math.hypot(b.x - s.x, b.y - s.y) > s.r);
    }
    W.shocks = W.shocks.filter(s => s.r < s.max);
  }

  // 게임 오버 뒤: 충격파는 모양만 끝까지 퍼지고 더는 피해를 주지 않는다 (예전엔 그 자리에 멈춘 고리가 남았다)
  function fadeShocks(W, dt) {
    if (!W.shocks.length) return;
    for (const s of W.shocks) s.r += D.ULT.speed * dt;
    W.shocks = W.shocks.filter(s => s.r < s.max);
  }

  // type: 'heal'(기본) | 'coin' | 'shield' | 'heat' | 'magnet' | 'bomb'
  function addDrop(W, x, y, type) {
    const t = type || 'heal';
    const life = t === 'heal' ? D.DROP.life : D.ITEMS[t].life;
    W.drops.push({ x, y, life, max: life, type: t, ph: W.drops.length * 0.7 });
  }

  // ─── 아이템 (상점과 함께, 2026-09-26) ─────────────────────
  // 일반 적 처치마다 한 번 굴려 ITEMS의 확률대로 하나 떨어뜨린다 (회복이 떨어지면 안 굴림)
  const ITEM_ORDER = ['coin', 'shield', 'heat', 'magnet', 'bomb'];
  function rollItem(W, x, y) {
    if (!D.ITEMS) return;
    let r = W.rand();
    for (const id of ITEM_ORDER) {
      r -= D.ITEMS[id].chance;
      if (r < 0) { addDrop(W, x, y, id); return; }
    }
  }

  function pickItem(W, d) {
    const p = W.player, I = D.ITEMS;
    const say = (txt, col) => { W.texts.push({ x: p.x, y: p.y - 22, txt, life: 0.9, col }); if (W.texts.length > 40) W.texts.shift(); };
    d.life = 0;
    if (d.type === 'coin') {
      W.stats.coinPicks += 1;
      W.stats.coins += I.coin.value;
      say('+' + I.coin.value, I.coin.color);
      W.events.push('coin');
      return;
    }
    W.stats.items += 1;
    if (d.type === 'shield') { p.shield = 1; say('방패', I.shield.color); W.events.push('shieldUp'); }
    else if (d.type === 'heat') { p.heatT = I.heat.time; say('과열!', I.heat.color); W.events.push('heat'); }
    else if (d.type === 'magnet') { p.magT = I.magnet.time; say('자석', I.magnet.color); W.events.push('magnet'); }
    else if (d.type === 'bomb') { say('폭탄!', I.bomb.color); bomb(W, d.x, d.y); }
  }

  // 폭탄: 화면의 적 탄을 모두 지우고, 둘레 안 적에게 큰 피해 (보스는 최대 체력의 bossCap까지)
  function bomb(W, x, y) {
    const B = D.ITEMS.bomb;
    W.eBullets.length = 0;
    const dmg = ultDamage(W) * B.dmgMul;
    for (const e of W.enemies) {
      if (e.dead || e.spawnT > 0 || e.hide) continue;
      if (NG.dist2(e.x, e.y, x, y) > (B.radius + e.r) * (B.radius + e.r)) continue;
      damageEnemy(W, e, e.type === 'boss' ? Math.min(dmg, e.maxHp * B.bossCap) : dmg, false, e.x - x, e.y - y, 'ult');
      if (e.dead) W.stats.bombKills += 1;
    }
    W.particles.push({ pop: true, x, y, r: 60, life: 0.16, max: 0.16, color: '#ffffff' });
    W.particles.push({ ring: true, x, y, r: B.radius, life: 0.5, max: 0.5, color: B.color });
    W.shake = Math.max(W.shake, 16);
    W.pulse = Math.max(W.pulse, 0.8);
    W.events.push('bomb');
  }

  // 아이템 줍기·끌어오기. 회복은 다쳤을 때만 끌려오고 주워진다 (예전 그대로)
  function updateDrops(W, dt) {
    const p = W.player;
    const magR = D.DROP.magnetR * (p.magnetMul || 1);
    const pick2 = D.DROP.pickR * D.DROP.pickR;
    for (const d of W.drops) {
      if (d.life <= 0) continue;
      const heal = d.type === 'heal';
      if (heal && p.hp >= p.maxHp) continue;
      const d2 = NG.dist2(d.x, d.y, p.x, p.y);
      const pulled = p.magT > 0 && !heal;
      if (pulled || d2 < (heal ? D.DROP.magnetR * D.DROP.magnetR : magR * magR)) {
        const dl = Math.sqrt(d2) || 1;
        const sp = Math.min(dl, (pulled ? D.ITEMS.magnet.speed : 260) * dt);
        d.x += (p.x - d.x) / dl * sp;
        d.y += (p.y - d.y) / dl * sp;
      }
      if (NG.dist2(d.x, d.y, p.x, p.y) < pick2) {
        if (heal) {
          p.hp += 1;
          d.life = 0;
          W.texts.push({ x: p.x, y: p.y - 20, txt: '+1', life: 0.8, heal: true });
          W.events.push('heal');
        } else pickItem(W, d);
      }
    }
    p.heatT = Math.max(0, p.heatT - dt);
    p.magT = Math.max(0, p.magT - dt);
  }

  function hurtPlayer(W, n) {
    const p = W.player;
    if (p.iframe > 0 || p.dashT > 0 || W.phase !== 'play') return;
    // 방패: 한 대를 대신 막고 깨진다
    if (p.shield > 0) {
      p.shield -= 1;
      p.iframe = D.PLAYER.iframe;
      W.stats.blocks += 1;
      W.shake = Math.max(W.shake, 6);
      W.particles.push({ ring: true, x: p.x, y: p.y, r: 46, life: 0.4, max: 0.4, color: '#5ee7ff' });
      W.eBullets = W.eBullets.filter(b => NG.dist2(b.x, b.y, p.x, p.y) > 140 * 140);
      W.events.push('block');
      return;
    }
    p.hp -= n;
    p.iframe = D.PLAYER.iframe * (p.iframeMul || 1);
    W.waveHit = true;
    W.stats.hurts += 1;
    if (D.COMBO.breakOnHurt) W.combo = 0;
    W.shake = Math.max(W.shake, 12);
    W.flash = 0.2;
    burst(W, p.x, p.y, '#ffffff', 16, 260, 3);
    impact(W, D.IMPACT.hurtStop, true);
    // 억울한 연속 피격 방지: 주변 적 탄 제거
    W.eBullets = W.eBullets.filter(b => NG.dist2(b.x, b.y, p.x, p.y) > 140 * 140);
    if (p.hp <= 0) {
      p.hp = 0;
      W.phase = 'over';
      W.events.push('over');
    } else {
      W.events.push('hurt');
    }
  }

  // ─── 플레이어 ──────────────────────────────────────────────
  function nearestEnemy(W, x, y) {
    let best = null, bd = Infinity;
    for (const e of W.enemies) {
      if (e.dead || e.spawnT > 0 || e.hide) continue;
      const d = NG.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function fire(W, p) {
    const g = p.gun;
    const n = g.barrels;
    const spread = Math.min(g.spreadStep * (n - 1), g.spreadMax);
    for (let i = 0; i < n; i++) {
      const a = p.aim + (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1));
      const cos = Math.cos(a), sin = Math.sin(a);
      W.bullets.push({
        x: p.x + cos * (p.r + 4), y: p.y + sin * (p.r + 4),
        vx: cos * g.speed, vy: sin * g.speed, r: g.size,
        dmg: g.dmg, life: g.life, pierce: g.pierce, bounce: g.bounce, hits: [],
      });
    }
    W.stats.shots += n;
    p.muzzle = 0.05;
    W.events.push('shoot');
  }

  function updatePlayer(W, input, dt) {
    const p = W.player;
    const P = D.PLAYER;

    // 이동 입력
    let mx = input.moveX || 0, my = input.moveY || 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }

    // 필살기
    p.ultT = Math.max(0, p.ultT - dt);
    if (input.ult) useUlt(W);

    // 대시
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (input.dash && p.dashCd <= 0 && p.dashT <= 0) {
      // 움직이는 중이면 그 방향, 서 있으면 조준 방향으로
      if (ml > 0.1) { p.dashX = mx / ml; p.dashY = my / ml; }
      else { p.dashX = Math.cos(p.aim); p.dashY = Math.sin(p.aim); }
      p.dashT = P.dashTime;
      p.dashCd = p.dashCdMax;
      p.iframe = Math.max(p.iframe, P.dashIframe);
      W.stats.dashes += 1;
      W.events.push('dash');
    }

    if (p.dashT > 0) {
      p.vx = p.dashX * p.speed * P.dashMul;
      p.vy = p.dashY * p.speed * P.dashMul;
      p.dashT -= dt;
      if (W.rand() < 0.8) burst(W, p.x, p.y, '#5ee7ff', 1, 40, 3);
      if (p.dashT <= 0 && p.nova > 0) nova(W, p);
    } else {
      // 속도를 바로 바꾸지 않고 빠르게 따라가게 해서 출발·정지가 부드럽다 (약 0.1초)
      // 금성 안개 웅덩이 안에서는 느려진다 (대시는 그대로)
      p.mist = inMist(W, p.x, p.y);
      const sp = p.speed * (p.mist ? D.ENEMIES.acid.slow : 1);
      const k = Math.min(1, dt * 16);
      p.vx += (mx * sp - p.vx) * k;
      p.vy += (my * sp - p.vy) * k;
    }
    // 블랙홀: 대시 중이 아니면 살살 끌려간다 (내 최고 속도보다 한참 약하다)
    let gx = 0, gy = 0;
    if (W.hole && p.dashT <= 0) { const f = holePull(W, p.x, p.y, W.diff.pull); gx = f.x; gy = f.y; }
    p.x = NG.clamp(p.x + (p.vx + gx) * dt, p.r, W.w - p.r);
    p.y = NG.clamp(p.y + (p.vy + gy) * dt, p.r, W.h - p.r);
    p.iframe = Math.max(0, p.iframe - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);

    // 조준: 입력이 있으면 그 방향, 없으면 가장 가까운 적
    let target = null;
    if (input.aimAngle != null) p.aim = input.aimAngle;
    else {
      target = nearestEnemy(W, p.x, p.y);
      // 선물 상자·구조 캡슐이 가장 가까운 적보다 가까우면 그쪽을 먼저 겨눈다 (자동 조준으로도 열 수 있게)
      const f = funTarget(W, p.x, p.y);
      if (f && (!target || NG.dist2(p.x, p.y, f.x, f.y) < NG.dist2(p.x, p.y, target.x, target.y))) target = f;
      if (target) p.aim = Math.atan2(target.y - p.y, target.x - p.x);
    }

    // 사격 (자동). 적이 없고 수동 조준도 없으면 쉰다
    p.fireCd -= dt;
    const hasTarget = input.aimAngle != null || target != null;
    if (p.fireCd <= 0 && hasTarget) {
      fire(W, p);
      p.fireCd += 1 / (p.gun.rate * (p.heatT > 0 ? D.ITEMS.heat.mul : 1)); // 과열 아이템: 연사 2배
      if (p.fireCd < 0) p.fireCd = 0;
    }
    if (p.fireCd < 0) p.fireCd = 0;

    // 드론
    if (p.drones > 0) {
      const DR = D.DRONE;
      p.droneAng += DR.spin * dt;
      for (let i = 0; i < p.drones; i++) {
        const a = p.droneAng + TAU * i / p.drones;
        const dx = p.x + Math.cos(a) * DR.radius, dy = p.y + Math.sin(a) * DR.radius;
        for (const e of W.enemies) {
          if (e.dead || e.spawnT > 0 || e.hide || e.droneHit > 0) continue;
          const rr = e.r + DR.r;
          if (NG.dist2(dx, dy, e.x, e.y) < rr * rr) {
            e.droneHit = DR.hitGap;
            damageEnemy(W, e, p.gun.dmg * DR.dmgMul, false, e.x - p.x, e.y - p.y);
          }
        }
      }
    }

    // 선물 드론: 시간이 다 되면 하나 뺀다
    if (p.giftDroneT > 0) { p.giftDroneT -= dt; if (p.giftDroneT <= 0) { p.giftDroneT = 0; p.drones = Math.max(0, p.drones - 1); } }

    // 아이템 (회복·코인·방패·과열·자석·폭탄)
    updateDrops(W, dt);
  }

  function nova(W, p) {
    const N = D.NOVA;
    const radius = N.radius * (1 + 0.25 * (p.nova - 1));
    for (const e of W.enemies) {
      if (e.dead || e.spawnT > 0 || e.hide) continue;
      if (NG.dist2(e.x, e.y, p.x, p.y) < (radius + e.r) * (radius + e.r)) {
        damageEnemy(W, e, p.gun.dmg * N.dmgMul * p.nova, false, e.x - p.x, e.y - p.y);
      }
    }
    W.particles.push({ ring: true, x: p.x, y: p.y, r: radius, life: 0.3, max: 0.3, color: '#5ee7ff' });
    W.shake = Math.max(W.shake, 6);
    W.events.push('nova');
  }

  // ─── 적 ────────────────────────────────────────────────────
  // o: {k 그림 종류, r 크기, curve 초당 휘는 각, home 따라오는 시간, turn 따라올 때 초당 도는 각, life}
  function enemyShoot(W, e, angle, speed, o) {
    speed *= W.diff.bulletSpeed;
    const b = { x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 5, life: 6 };
    if (o) { if (o.k) b.k = o.k; if (o.r) b.r = o.r; if (o.curve) b.curve = o.curve; if (o.home) { b.home = o.home; b.turn = o.turn; } if (o.life) b.life = o.life; }
    W.eBullets.push(b);
  }

  // ─── 보스 공격 (보스 모습마다 다르다, data.js BOSSES.atk) ───────────
  // 움직일 방향을 바꾸고 싶으면 {tx, ty}를 돌려준다. e.free면 조향 없이 제 속도로 난다 (돌진·튕기기)
  function bossAttack(W, e, dt, dx, dy, dist) {
    const def = e.def, L = e.look || D.BOSSES[0], A = L.atk || {};
    const enraged = e.hp < e.maxHp * 0.5;
    const rage = (enraged ? 0.65 : 1) / W.diff.fireRate;
    const mk = (e.mk || 1) - 1;                   // 한 바퀴 돌 때마다 조금씩 세진다
    const aim = Math.atan2(dy, dx);
    const cd = (k, v) => { e[k] = (e[k] == null ? v * 0.6 : e[k]) - dt; return e[k] <= 0; };
    switch (L.id) {
      case 'star': {
        // 소용돌이: 별 팔에서 도는 탄 (3초 쏘고 2초 쉼) + 예고선 뒤 돌진
        e.spin = (e.spin || 0) + A.spin * dt;
        e.phaseT = (e.phaseT || 0) + dt;
        const cyc = A.spiralOn + A.spiralOff;
        if (e.phaseT % cyc < A.spiralOn && !e.free && !e.warnT) {
          if (cd('spiralT', A.spiralGap * rage)) {
            const arms = A.arms + mk;
            for (let i = 0; i < arms; i++) enemyShoot(W, e, e.spin + TAU * i / arms, A.spiralSpeed, { k: 'star' });
            e.spiralT = A.spiralGap * rage;
            W.events.push('eshoot');
          }
        }
        if (e.free) {
          e.chargeLeft -= dt;
          if (e.chargeLeft <= 0) { e.free = false; e.vx *= 0.2; e.vy *= 0.2; }
        } else if (e.warnT > 0) {
          e.warnT -= dt;
          if (e.warnT <= 0) {
            e.warnT = 0; e.free = true; e.chargeLeft = A.chargeTime;
            e.vx = Math.cos(e.chargeA) * A.chargeSpeed; e.vy = Math.sin(e.chargeA) * A.chargeSpeed;
            W.events.push('dash');
          }
          return { tx: 0, ty: 0 };
        } else if (cd('chargeT', A.chargeCd * rage)) {
          e.chargeT = A.chargeCd * rage;
          e.warnT = A.chargeWarn; e.chargeA = aim;
          W.events.push('warn');
        }
        return null;
      }
      case 'hex': {
        // 방패는 규칙이 updateBullets에서 막는다. 여섯 방향 세 발씩, 쏠 때마다 30도 돌려서
        if (cd('volleyT', A.volleyCd * rage)) {
          e.volleyN = (e.volleyN || 0) + 1;
          const off = (e.volleyN % 2) * Math.PI / 6 + e.ang * 0.1;
          for (let i = 0; i < 6; i++) for (const sp of A.volleySpeeds) enemyShoot(W, e, off + TAU * i / 6, sp + mk * 15, { k: 'hex' });
          e.volleyT = A.volleyCd * rage;
          W.events.push('eshoot');
        }
        if (cd('sumT', A.summonCd)) { spawnEnemy(W, 'shooter'); e.sumT = A.summonCd; }
        return null;
      }
      case 'eye': {
        // 거리를 두고 떠 있다. 예고선을 보여 준 뒤 레이저, 따라오는 구슬
        if (cd('laserT', A.laserCd * rage)) {
          e.laserT = A.laserCd * rage;
          const n = enraged ? 2 : 1;
          for (let i = 0; i < n; i++) W.lasers.push({ boss: e.id, off: n > 1 ? (i ? 1 : -1) * A.rageSplit : 0, a: aim, t: 0, warn: A.laserWarn, track: A.laserTrack, on: A.laserOn, w: A.laserW, color: L.color, hit: false });
          W.events.push('warn');
        }
        if (cd('orbT', A.orbCd * rage)) {
          e.orbT = A.orbCd * rage;
          const n = A.orbs + mk;
          for (let i = 0; i < n; i++) enemyShoot(W, e, aim + (i - (n - 1) / 2) * 0.8, A.orbSpeed, { k: 'orb', r: 8, home: A.orbHome, turn: A.orbTurn, life: 7 });
          W.events.push('eshoot');
        }
        const ux = dx / dist, uy = dy / dist;
        if (dist < A.keep - 40) return { tx: -ux, ty: -uy };
        if (dist < A.keep + 40) return { tx: -uy * e.strafe, ty: ux * e.strafe };
        return null;
      }
      case 'saw': {
        // 벽에 튕기며 날아다니는 톱날. 휘어 도는 탄 고리 + 돌격병
        const sp = enraged ? A.rageSpeed : A.bounceSpeed;
        if (!e.free) { const a0 = W.rand() * TAU; e.vx = Math.cos(a0) * sp; e.vy = Math.sin(a0) * sp; e.free = true; }
        const cur = Math.hypot(e.vx, e.vy) || 1;
        e.vx *= sp / cur; e.vy *= sp / cur;
        if (cd('ringT', A.ringCd * rage)) {
          e.ringT = A.ringCd * rage;
          e.curveSign = -(e.curveSign || 1);
          const n = A.ring + mk * 2, off = W.rand() * TAU;
          for (let i = 0; i < n; i++) enemyShoot(W, e, off + TAU * i / n, A.ringSpeed, { k: 'blade', curve: A.curve * e.curveSign });
          W.events.push('eshoot');
        }
        if (cd('sumT', A.summonCd)) { for (let i = 0; i < 2; i++) spawnEnemy(W, 'runner'); e.sumT = A.summonCd; }
        return null;
      }
      default: {
        // 옥타 코어 (처음 보스): 둥근 탄막 + 세 갈래 조준 + 졸개
        e.ringCd -= dt; e.aimCd -= dt; e.summonCd -= dt;
        if (e.ringCd <= 0) {
          const n = def.ringCount + W.bossKills * 2;
          const off = W.rand() * TAU;
          for (let i = 0; i < n; i++) enemyShoot(W, e, off + TAU * i / n, def.ringSpeed);
          e.ringCd = def.ringCd * rage;
          W.events.push('eshoot');
        }
        if (e.aimCd <= 0) {
          for (let i = -1; i <= 1; i++) enemyShoot(W, e, aim + i * 0.2, def.aimSpeed);
          e.aimCd = def.aimCd * rage;
        }
        if (e.summonCd <= 0) {
          for (let i = 0; i < 2; i++) spawnEnemy(W, W.wave >= 10 ? 'runner' : 'grunt');
          e.summonCd = def.summonCd;
        }
        return null;
      }
    }
  }

  // 헥사 가디언 방패: 보스 둘레를 도는 조각 6개가 내 총알을 막는다
  function hexShieldBlocks(e, b) {
    if (!e.look || e.look.id !== 'hex') return false;
    const A = e.look.atk, d = Math.hypot(b.x - e.x, b.y - e.y);
    if (Math.abs(d - e.r * A.shieldR) > e.r * A.shieldBand) return false;
    const base = -e.ang * (A.shieldSpin / 2);   // 그림과 같은 각 (render.js bossBack)
    let a = Math.atan2(b.y - e.y, b.x - e.x) - base;
    a = ((a % TAU) + TAU) % TAU;
    return (a % (TAU / 6)) < A.shieldArc;
  }

  // 레이저: 예고(warn) 동안 처음 track초는 플레이어를 따라 겨누고, 그다음 굳힌다. on초 동안 닿으면 아프다
  function updateLasers(W, dt) {
    if (!W.lasers.length) return;
    const p = W.player;
    for (const L of W.lasers) {
      const e = W.enemies.find(x => x.id === L.boss && !x.dead);
      if (!e) { L.t = 1e9; continue; }
      L.x = e.x; L.y = e.y;
      L.t += dt;
      if (L.t < L.track) L.a = Math.atan2(p.y - e.y, p.x - e.x);
      L.ang = L.a + L.off;
      if (L.t >= L.warn && L.t < L.warn + L.on && !L.hit) {
        if (!L.fired) { L.fired = true; W.events.push(L.sfx || 'laser'); W.shake = Math.max(W.shake, L.len ? 3 : 6); }
        // 선분과 점 사이 거리
        const c = Math.cos(L.ang), s = Math.sin(L.ang);
        const along = (p.x - L.x) * c + (p.y - L.y) * s;
        const side = Math.abs(-(p.x - L.x) * s + (p.y - L.y) * c);
        // len이 있으면 짧은 빛줄기·번개 (행성 적), 없으면 화면 끝까지 (보스)
        if (along > 0 && (!L.len || along < L.len + p.r) && side < L.w / 2 + p.r - 3 && p.iframe <= 0 && p.dashT <= 0) { L.hit = true; hurtPlayer(W, 1); }
      }
    }
    W.lasers = W.lasers.filter(L => L.t < L.warn + L.on);
  }

  // ─── 행성 적 (2026-09-27, data.js ENEMIES ember ~ ghost) ─────────
  // 밀어내기에 안 밀리는 적: 보스, 예고·휙 지나가는 중인 고리 조각 (띠 예고와 실제 길이 어긋나지 않게)
  const pinned = e => e.type === 'boss' || (e.type === 'shard' && e.sw !== 'line');
  const fwOf = W => W.diff.foeWarn || 1;

  // 짧은 빛줄기·번개: 보스 레이저(W.lasers)를 같이 쓴다. track 0 = 예고 시작 때 방향이 굳는다. len = 길이
  function foeBeam(W, e, a, o) {
    W.lasers.push(Object.assign({ boss: e.id, off: 0, a, t: 0, track: 0, hit: false }, o));
  }

  // 금성 안개 웅덩이 안인가 (다 생긴 것만)
  function inMist(W, x, y) {
    for (const m of W.mists) if (m.t >= m.form && NG.dist2(x, y, m.x, m.y) < m.r * m.r) return true;
    return false;
  }
  function updateMists(W, dt) {
    if (!W.mists.length) return;
    for (const m of W.mists) m.t += dt;
    W.mists = W.mists.filter(m => m.t < m.form + m.life);
  }

  // 나를 가운데 두고 radius px 거리에서 도는 방향 (접선 + 거리 맞추기)
  function orbitDir(e, dx, dy, dist, radius, dir) {
    const ox = -dx / dist, oy = -dy / dist;               // 나 → 적
    const tx = -oy * dir, ty = ox * dir;                  // 접선
    const pull = NG.clamp((dist - radius) / 80, -1.2, 1.2); // 멀면 다가오고 가까우면 물러난다
    return { tx: tx - ox * pull, ty: ty - oy * pull };
  }

  const FOE_MOVE = {
    // 수성 태양 불씨: 방향을 천천히만 튼다 (초당 turn rad). 벽에서 튕기고, 나에게 닿으면 꺼진다
    ember(W, e, dt, dx, dy) {
      const def = e.def, p = W.player;
      let d = Math.atan2(dy, dx) - e.emA;
      while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      e.emA += NG.clamp(d, -def.turn * dt, def.turn * dt);
      e.vx = Math.cos(e.emA) * e.speed; e.vy = Math.sin(e.emA) * e.speed;
      const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
      e.x = NG.clamp(nx, e.r, W.w - e.r); e.y = NG.clamp(ny, e.r, W.h - e.r);
      if (e.x !== nx) e.emA = Math.PI - e.emA;
      if (e.y !== ny) e.emA = -e.emA;
      e.ang = e.emA;
      if (W.rand() < 0.35) burst(W, e.x, e.y, '#ffcf6b', 1, 30, 2);
      if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r - 2 && p.iframe <= 0 && p.dashT <= 0) {
        hurtPlayer(W, 1);
        e.dead = true; // 꺼진다 (점수 없음)
        burst(W, e.x, e.y, '#ffb347', 8, 160, 2.5);
      }
      return 'done';
    },
    // 금성 산성 구름: 느리게 쫓아오며 안개 웅덩이를 남긴다
    acid(W, e, dt) {
      const def = e.def;
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = def.mistCd / W.diff.fireRate;
        if (W.mists.length < def.mistMax) {
          W.mists.push({ x: e.x, y: e.y, r: def.mistR, t: 0, form: def.mistForm * fwOf(W), life: def.mistLife, seed: W.rand() * 100 });
          W.events.push('mist');
        }
      }
      return null;
    },
    // 지구 인공위성: 돌다가 멈춰서 예고 뒤 짧은 빛줄기
    sat(W, e, dt, dx, dy, dist) {
      const def = e.def;
      e.ang = Math.atan2(dy, dx);
      if (e.busy > 0) { e.busy -= dt; return { tx: 0, ty: 0 }; }
      e.cd -= dt;
      if (e.cd <= 0 && dist < def.beamLen + 40) {
        const warn = def.beamWarn * fwOf(W);
        foeBeam(W, e, e.ang, { warn, on: def.beamOn, w: def.beamW, len: def.beamLen, kind: 'beam', sfx: 'beam' });
        e.busy = warn + def.beamOn;
        e.cd = def.beamCd / W.diff.fireRate;
        W.events.push('beamWarn');
        return { tx: 0, ty: 0 };
      }
      return orbitDir(e, dx, dy, dist, def.orbit, e.strafe);
    },
    // 화성 모래 벌레: 땅속으로 따라와 → 예고 원 → 튀어나옴 → 잠깐 밖에서 쫓아옴 → 다시 땅속
    worm(W, e, dt, dx, dy, dist) {
      const def = e.def, p = W.player;
      e.wmT -= dt;
      if (e.wm === 'dig') {
        e.hide = true;
        const sp = Math.min(dist, def.digSpeed * W.diff.enemySpeed * dt);
        e.x = NG.clamp(e.x + dx / dist * sp, e.r, W.w - e.r); e.y = NG.clamp(e.y + dy / dist * sp, e.r, W.h - e.r);
        e.vx = e.vy = 0;
        if (W.rand() < 0.3) burst(W, e.x, e.y, '#b8744a', 1, 40, 3);
        if (dist < 16 || e.wmT <= 0) { e.wm = 'warn'; e.wmT = def.popWarn * fwOf(W); W.events.push('wormWarn'); }
        return 'done';
      }
      if (e.wm === 'warn') {
        e.hide = true;
        if (e.wmT > 0) return 'done';
        // 튀어나온다: 원 안에 있으면 아프다
        const rr = def.popR + p.r * 0.4;
        if (NG.dist2(e.x, e.y, p.x, p.y) < rr * rr) hurtPlayer(W, 1);
        e.wm = 'up'; e.wmT = def.upTime; e.hide = false;
        W.particles.push({ ring: true, x: e.x, y: e.y, r: def.popR * 1.2, life: 0.35, max: 0.35, color: '#e0824f' });
        burst(W, e.x, e.y, '#c98a5a', 12, 220, 3.5);
        W.shake = Math.max(W.shake, 5);
        W.events.push('wormPop');
        return 'done';
      }
      if (e.wmT <= 0) { e.wm = 'dig'; e.wmT = def.digMax; e.hide = true; burst(W, e.x, e.y, '#b8744a', 6, 120, 3); return 'done'; }
      return null;
    },
    // 목성 번개 구름: 거리를 두고 떠 있다가, 번개를 모아(예고) 내가 있던 자리까지 짧은 번개
    zap(W, e, dt, dx, dy, dist) {
      const def = e.def;
      if (e.busy > 0) { e.busy -= dt; return { tx: 0, ty: 0 }; }
      e.cd -= dt;
      if (e.cd <= 0 && dist < def.zapReach) {
        const warn = def.zapWarn * fwOf(W);
        foeBeam(W, e, Math.atan2(dy, dx), { warn, on: def.zapOn, w: def.zapW, len: Math.min(def.zapReach, dist + 30), kind: 'bolt', sfx: 'zap', seed: W.rand() * 100 });
        e.busy = warn + def.zapOn;
        e.cd = def.zapCd / W.diff.fireRate;
        W.events.push('zapWarn');
        return { tx: 0, ty: 0 };
      }
      const ux = dx / dist, uy = dy / dist;
      if (dist < def.keep - 40) return { tx: -ux, ty: -uy };
      if (dist < def.keep + 40) return { tx: -uy * e.strafe, ty: ux * e.strafe };
      return null;
    },
    // 토성 고리 조각: 끝에서 내 높이로 줄 맞추기 → 가로 띠 예고 → 반대쪽 끝까지 휙
    shard(W, e, dt, dx, dy) {
      const def = e.def, p = W.player;
      e.ang += dt * (e.sw === 'go' ? 9 : 2);
      if (e.sw === 'line') {
        e.swT -= dt;
        const sp = e.speed * dt;
        e.y = NG.clamp(e.y + NG.clamp(dy, -sp, sp), e.r, W.h - e.r);
        e.x = e.dir > 0 ? e.r + 8 : W.w - e.r - 8;
        e.vx = e.vy = 0;
        if (e.swT <= 0) { e.sw = 'warn'; e.swT = def.warn * fwOf(W); e.swY = e.y; W.events.push('bandWarn'); }
      } else if (e.sw === 'warn') {
        e.swT -= dt;
        e.y = e.swY;
        if (e.swT <= 0) { e.sw = 'go'; W.events.push('sweep'); }
      } else {
        e.y = e.swY;
        e.vx = e.dir * def.sweep * W.diff.enemySpeed; e.vy = 0;
        e.x += e.vx * dt;
        if (W.rand() < 0.5) burst(W, e.x, e.y, def.color, 1, 50, 2.5);
        if ((e.dir > 0 && e.x >= W.w - e.r - 8) || (e.dir < 0 && e.x <= e.r + 8)) {
          e.x = NG.clamp(e.x, e.r + 8, W.w - e.r - 8);
          e.dir = -e.dir; e.sw = 'line'; e.swT = def.aim * (0.8 + W.rand() * 0.5); e.vx = 0;
        }
      }
      if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r - 2 && p.iframe <= 0 && p.dashT <= 0) hurtPlayer(W, 1);
      return 'done';
    },
    // 해왕성 폭풍 드론: 멀어졌다 가까워졌다 하며 나를 둘러싸고 돈다 (내 총알 휘게 하기는 updateBullets)
    storm(W, e, dt, dx, dy, dist) {
      const def = e.def;
      e.ph += dt;
      e.ang += dt * 5;
      const radius = def.near + (def.far - def.near) * (0.5 + 0.5 * Math.sin(e.ph * 0.9));
      return orbitDir(e, dx, dy, dist, radius, e.strafe);
    },
    // 명왕성 하트 유령: 보임(on) → 흐려짐(fade) → 안 보임(off) → 나타남(fade). 흐릴 땐 나와 거리를 둔다
    ghost(W, e, dt, dx, dy, dist) {
      const def = e.def;
      const cyc = def.on + def.fade * 2 + def.off, offEnd = def.on + def.fade + def.off;
      e.ghT = (e.ghT + dt) % cyc;
      // 안 보이는 동안 내가 너무 가까이 있으면 나타나지 않고 기다린다 (내 코앞에서 갑자기 나타나지 않게)
      if (e.ghT >= offEnd - 0.05 && e.ghT < offEnd + dt && dist < def.keepOff * 0.75) e.ghT = offEnd - 0.05;
      const t = e.ghT;
      e.vis = t < def.on ? 1 : t < def.on + def.fade ? 1 - (t - def.on) / def.fade : t < def.on + def.fade + def.off ? 0 : (t - def.on - def.fade - def.off) / def.fade;
      e.hide = e.vis < 0.6;
      if (!e.hide) return null;
      const ux = dx / dist, uy = dy / dist;
      if (dist < def.keepOff) return { tx: -ux, ty: -uy };
      return { tx: -uy * e.strafe, ty: ux * e.strafe };
    },
  };

  function updateEnemies(W, dt) {
    const p = W.player;
    for (const e of W.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      e.droneHit = Math.max(0, e.droneHit - dt);
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }

      const dx = p.x - e.x, dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      let tx = ux, ty = uy; // 원하는 이동 방향
      const def = e.def;

      if (e.type === 'shooter') {
        if (dist < def.keep - 40) { tx = -ux; ty = -uy; }
        else if (dist < def.keep + 40) { tx = -uy * e.strafe; ty = ux * e.strafe; }
        e.cd -= dt;
        if (e.cd <= 0 && dist < 650) {
          // 내가 가는 쪽을 조금 앞질러 겨눈다 (난이도 lead). 가만히 있으면 그냥 내 자리
          const lt = dist / (def.bulletSpeed * W.diff.bulletSpeed) * (W.diff.lead || 0);
          enemyShoot(W, e, Math.atan2(dy + p.vy * lt, dx + p.vx * lt), def.bulletSpeed);
          e.cd = def.fireCd / W.diff.fireRate;
          W.events.push('eshoot');
        }
      } else if (e.type === 'charger') {
        // 돌진이: 쉬다가(rest) 가까우면 멈춰서 예고(warn, 방향은 예고 시작 때 굳음) → 돌진(dashTime)
        if (e.chDash > 0) {
          e.chDash -= dt;
          const sp = def.dashSpeed * W.diff.enemySpeed;
          e.vx = Math.cos(e.chA) * sp; e.vy = Math.sin(e.chA) * sp;
          const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
          e.x = NG.clamp(nx, e.r, W.w - e.r); e.y = NG.clamp(ny, e.r, W.h - e.r);
          if (e.x !== nx || e.y !== ny) e.chDash = 0; // 벽에 닿으면 멈춤
          if (e.chDash <= 0) { e.chRest = def.rest; e.vx *= 0.25; e.vy *= 0.25; }
          if (W.rand() < 0.5) burst(W, e.x, e.y, def.color, 1, 60, 2.5);
          if (dist < e.r + p.r - 2 && p.iframe <= 0 && p.dashT <= 0) hurtPlayer(W, 1);
          continue;
        }
        if (e.chWarn > 0) {
          e.chWarn -= dt;
          tx = 0; ty = 0;
          if (e.chWarn <= 0) { e.chWarn = 0; e.chDash = def.dashTime; W.events.push('charge'); }
        } else {
          e.chRest -= dt;
          if (e.chRest <= 0 && dist < def.range) { e.chWarn = def.warn; e.chA = Math.atan2(dy, dx); W.events.push('chargeWarn'); tx = 0; ty = 0; }
        }
      } else if (e.def.shape && FOE_MOVE[e.type]) {
        // 행성 적: 'done'이면 스스로 움직였다 (조향·박치기를 건너뜀), {tx, ty}면 그 방향으로 조향
        const mv = FOE_MOVE[e.type](W, e, dt, dx, dy, dist);
        if (mv === 'done') continue;
        if (mv) { tx = mv.tx; ty = mv.ty; }
      } else if (e.type === 'boss') {
        const mv = bossAttack(W, e, dt, dx, dy, dist);
        if (mv) { tx = mv.tx; ty = mv.ty; }
        if (e.free) {
          // 돌진·튕기기: 조향 없이 제 속도로 날아가고 벽에서 튕긴다
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.x < e.r || e.x > W.w - e.r) { e.vx = -e.vx; e.x = NG.clamp(e.x, e.r, W.w - e.r); if (e.look.id === 'star') W.shake = Math.max(W.shake, 8); }
          if (e.y < e.r || e.y > W.h - e.r) { e.vy = -e.vy; e.y = NG.clamp(e.y, e.r, W.h - e.r); if (e.look.id === 'star') W.shake = Math.max(W.shake, 8); }
          e.ang += dt * 2;
          if (dist < e.r + p.r - 2 && p.iframe <= 0 && p.dashT <= 0) hurtPlayer(W, 1);
          continue;
        }
      }

      // 관성 있는 조향 (넉백이 자연스럽게 풀리도록)
      const k = Math.min(1, dt * 6);
      e.vx += (tx * e.speed - e.vx) * k;
      e.vy += (ty * e.speed - e.vy) * k;
      e.x = NG.clamp(e.x + e.vx * dt, e.r, W.w - e.r);
      e.y = NG.clamp(e.y + e.vy * dt, e.r, W.h - e.r);
      e.ang += dt * (e.type === 'tank' ? 0.8 : 2);

      // 몸통 박치기 (땅속·흐린 행성 적은 안 아프다)
      const rr = e.r + p.r - 2;
      if (dist < rr && !e.hide) {
        if (p.iframe <= 0 && p.dashT <= 0) hurtPlayer(W, 1);
        if (e.type !== 'boss') { e.vx = -ux * 260; e.vy = -uy * 260; }
      }
    }

    // 서로 겹치지 않게 밀어내기
    const es = W.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.dead || b.spawnT > 0) continue;
        const rr = a.r + b.r;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / 2;
          const nx = dx / d, ny = dy / d;
          const wa = pinned(a) ? 0 : 1, wb = pinned(b) ? 0 : 1;
          const s = wa + wb || 1;
          a.x -= nx * push * 2 * wa / s; a.y -= ny * push * 2 * wa / s;
          b.x += nx * push * 2 * wb / s; b.y += ny * push * 2 * wb / s;
        }
      }
    }
  }

  // ─── 탄 ────────────────────────────────────────────────────
  function updateBullets(W, dt) {
    const p = W.player;
    const g = p.gun;
    // 해왕성 폭풍 드론 둘레의 바람이 내 총알을 옆으로 휘게 한다
    const storms = W.enemies.filter(e => e.type === 'storm' && !e.dead && e.spawnT <= 0);
    for (const b of W.bullets) {
      for (const e of storms) {
        const R = e.def.windR, d2 = NG.dist2(b.x, b.y, e.x, e.y);
        if (d2 > R * R) continue;
        const a = e.def.windTurn * dt * (1 - Math.sqrt(d2) / R) * e.strafe, c = Math.cos(a), s = Math.sin(a);
        const vx = b.vx * c - b.vy * s; b.vy = b.vx * s + b.vy * c; b.vx = vx;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < b.r || b.x > W.w - b.r) {
        if (b.bounce > 0) { b.bounce--; b.vx = -b.vx; b.x = NG.clamp(b.x, b.r, W.w - b.r); b.hits.length = 0; }
        else b.life = 0;
      }
      if (b.y < b.r || b.y > W.h - b.r) {
        if (b.bounce > 0) { b.bounce--; b.vy = -b.vy; b.y = NG.clamp(b.y, b.r, W.h - b.r); b.hits.length = 0; }
        else b.life = 0;
      }
      if (b.life <= 0) continue;
      if (funHit(W, b)) continue; // 선물 상자·구조 캡슐에 맞음
      for (const e of W.enemies) {
        if (e.dead || e.spawnT > 0 || e.hide) continue;
        if (e.look && hexShieldBlocks(e, b)) {
          b.life = 0; burst(W, b.x, b.y, e.look.color, 3, 120, 2); W.events.push('block');
          break;
        }
        const rr = e.r + b.r;
        if (NG.dist2(b.x, b.y, e.x, e.y) >= rr * rr) continue;
        if (b.hits.indexOf(e.id) >= 0) continue;
        const crit = W.rand() < g.crit;
        damageEnemy(W, e, crit ? b.dmg * g.critMul : b.dmg, crit, b.vx, b.vy);
        if (e.type !== 'boss' && !e.dead) { e.vx += b.vx * 0.08; e.vy += b.vy * 0.08; }
        b.hits.push(e.id);
        if (b.pierce > 0) b.pierce--;
        else { b.life = 0; break; }
      }
    }
    W.bullets = W.bullets.filter(b => b.life > 0);

    for (const b of W.eBullets) {
      if (b.curve) {
        // 휘어 도는 탄: 속도 방향을 조금씩 돌린다
        const c = Math.cos(b.curve * dt), s = Math.sin(b.curve * dt);
        const vx = b.vx * c - b.vy * s; b.vy = b.vx * s + b.vy * c; b.vx = vx;
      }
      if (b.home > 0) {
        // 따라오는 구슬: 정해진 시간 동안 플레이어 쪽으로 천천히 고개를 돌린다
        b.home -= dt;
        const want = Math.atan2(p.y - b.y, p.x - b.x), cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy);
        let d = want - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        const na = cur + NG.clamp(d, -b.turn * dt, b.turn * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
      if (W.hole) {
        // 블랙홀 쪽으로 휜다. 가운데에 닿으면 삼켜진다
        const f = holePull(W, b.x, b.y, W.diff.bulletPull);
        b.vx += f.x * dt; b.vy += f.y * dt;
        if (NG.dist2(b.x, b.y, W.hole.x, W.hole.y) < D.BLACKHOLE.swallow * D.BLACKHOLE.swallow) b.life = 0;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -20 || b.x > W.w + 20 || b.y < -20 || b.y > W.h + 20) b.life = 0;
      const rr = b.r + p.r - 3;
      if (b.life > 0 && NG.dist2(b.x, b.y, p.x, p.y) < rr * rr) {
        if (p.iframe <= 0 && p.dashT <= 0) { hurtPlayer(W, 1); b.life = 0; }
      }
    }
    W.eBullets = W.eBullets.filter(b => b.life > 0);
  }

  // ─── 깜짝 선물 상자 · 피버 타임 · 동료 우주선 (2026-09-27) ───────
  // 지금 선물 상자를 띄우면 안 되는 때: 웨이브 시작·보스 등장·블랙홀 시작, 웨이브 끝(다 잡음), 이미 떠 있음
  function giftBlocked(W) {
    const G = D.GIFT;
    if (W.phase !== 'play' || W.gift) return true;
    if (W.waveT < (W.bossWave ? G.bossQuiet : W.hole ? G.holeQuiet : G.quiet)) return true;
    if (W.bossWave && (W.spawnQueue.indexOf('boss') >= 0 || W.enemies.some(e => e.type === 'boss' && e.spawnT > 0))) return true;
    if (!W.spawnQueue.length && !W.enemies.some(e => !e.dead)) return true;
    return false;
  }

  // 선물 상자 띄우기: 왼쪽 또는 오른쪽 밖에서 들어와 life초 동안 반대쪽으로 둥실둥실
  function spawnGift(W) {
    const G = D.GIFT, fromLeft = W.fun() < 0.5;
    const x0 = fromLeft ? -G.margin : W.w + G.margin, x1 = fromLeft ? W.w + G.margin : -G.margin;
    const y = W.h * (G.band[0] + W.fun() * (G.band[1] - G.band[0]));
    W.gift = { x: x0, y, baseY: y, vx: (x1 - x0) / G.life, r: G.r, hits: 0, life: G.life, t: 0, flash: 0, ph: W.fun() * 6 };
    W.events.push('giftAppear');
    return W.gift;
  }

  // 선물 고르기 (가중치, 이미 있는 방패·가득 찬 필살기는 빼고). {id, n?, item?}
  function giftReward(W) {
    const G = D.GIFT, p = W.player;
    const pool = G.rewards.filter(r => !(r.id === 'shield' && p.shield > 0) && !(r.id === 'ult' && p.ult >= D.ULT.need));
    const r = NG.weighted(pool, W.fun);
    if (r.id === 'coins') {
      const steps = Math.floor((r.max - r.min) / r.step) + 1;
      return { id: 'coins', n: r.min + Math.floor(W.fun() * steps) * r.step };
    }
    if (r.id === 'item') return { id: 'item', item: D.START_ITEMS[Math.floor(W.fun() * D.START_ITEMS.length)].id };
    return { id: r.id };
  }

  // 선물 상자 열기: 색종이 + 선물 주기 + 큰 알림. reward를 주면 그걸로 (테스트)
  const CONFETTI = ['#ff4d6d', '#ffd23f', '#3dff8b', '#5ee7ff', '#c77dff', '#ff9f43'];
  function openGift(W, reward) {
    const g = W.gift;
    if (!g) return null;
    W.gift = null;
    const G = D.GIFT, p = W.player, rw = reward || giftReward(W);
    const per = Math.ceil(G.confetti / CONFETTI.length);
    for (const c of CONFETTI) burst(W, g.x, g.y, c, per, 340, 5);
    W.particles.push({ pop: true, x: g.x, y: g.y, r: 34, life: 0.16, max: 0.16, color: '#ffffff' });
    W.particles.push({ ring: true, x: g.x, y: g.y, r: 110, life: 0.5, max: 0.5, color: '#ffd23f' });
    W.stats.gifts += 1;
    let txt = '', col = '#ffd23f';
    if (rw.id === 'coins') {
      W.stats.coins += rw.n; W.stats.giftCoins += rw.n;
      txt = '코인 ' + rw.n + '개!';
    } else if (rw.id === 'shield') {
      p.shield = 1; txt = '방패!'; col = '#5ee7ff';
    } else if (rw.id === 'drone') {
      if (!(p.giftDroneT > 0)) p.drones += 1;
      p.giftDroneT = G.rewards.find(r => r.id === 'drone').time;
      txt = '드론 ' + Math.round(p.giftDroneT) + '초!'; col = '#a6ffc9';
    } else if (rw.id === 'ult') {
      p.ult = D.ULT.need; txt = '필살기 가득!'; col = '#ffcf3a';
      W.events.push('ultReady');
    } else if (rw.id === 'item') {
      const it = D.START_ITEMS.find(i => i.id === rw.item) || D.START_ITEMS[0];
      W.stats.giftItems.push(it.id);
      txt = '다음 판 ' + it.name + '!'; col = '#ff9ed8';
    }
    W.giftPop = { txt: '선물: ' + txt, col, life: G.popup, max: G.popup };
    W.events.push('gift');
    return rw;
  }

  // 구조 캡슐 띄우기: 가장자리에서 가운데 근처를 지나 반대쪽으로 천천히
  function spawnCapsule(W) {
    const WM = D.WINGMAN, R = WM.capR;
    const pt = spawnPoint(W, R);
    const tx = W.w * (0.3 + W.fun() * 0.4), ty = W.h * (0.3 + W.fun() * 0.4);
    const a = Math.atan2(ty - pt.y, tx - pt.x);
    // 동료는 내 기체가 아닌 다른 기체 모양 (작게)
    const others = D.SHIPS.filter(s => s.id !== W.player.ship);
    const look = others[Math.floor(W.fun() * others.length)] || D.SHIPS[0];
    W.capsule = { x: pt.x, y: pt.y, vx: Math.cos(a) * WM.capSpeed, vy: Math.sin(a) * WM.capSpeed, r: R, hits: 0, life: WM.capLife, t: 0, flash: 0, look };
    W.events.push('capsule');
    return W.capsule;
  }

  // 캡슐을 열면 동료가 나온다
  function freeCapsule(W) {
    const c = W.capsule;
    if (!c) return null;
    W.capsule = null;
    const WM = D.WINGMAN;
    burst(W, c.x, c.y, '#9fe8ff', 14, 220, 3);
    burst(W, c.x, c.y, c.look.color, 10, 180, 3);
    W.particles.push({ ring: true, x: c.x, y: c.y, r: 70, life: 0.4, max: 0.4, color: c.look.color });
    W.wing = { x: c.x, y: c.y, look: c.look, t: WM.time, bye: 0, cd: 0.4, aim: -Math.PI / 2, shots: 0, wave: 0 };
    W.stats.wingmen += 1;
    W.texts.push({ x: c.x, y: c.y - 24, txt: '도와줄게!', life: 1.2, col: c.look.color });
    W.events.push('wingman');
    return W.wing;
  }

  // 총알이 선물 상자·캡슐에 맞았나. 맞으면 총알은 사라지고 hits가 오른다
  function funHit(W, b) {
    for (const k of ['gift', 'capsule']) {
      const o = W[k];
      if (!o) continue;
      const rr = o.r + b.r;
      if (NG.dist2(b.x, b.y, o.x, o.y) >= rr * rr) continue;
      b.life = 0;
      o.hits += 1;
      o.flash = 0.1;
      burst(W, b.x, b.y, k === 'gift' ? '#ffd23f' : '#9fe8ff', 3, 120, 2);
      if (k === 'gift' && o.hits >= D.GIFT.hits) openGift(W);
      else if (k === 'capsule' && o.hits >= D.WINGMAN.capHits) freeCapsule(W);
      else W.events.push('giftHit');
      return true;
    }
    return false;
  }

  // 자동 조준이 겨눌 수 있는 선물 상자·캡슐 (화면 안에 들어온 것만)
  function funTarget(W, x, y) {
    let best = null, bd = Infinity;
    for (const o of [W.gift, W.capsule]) {
      if (!o || o.x < 0 || o.x > W.w || o.y < 0 || o.y > W.h) continue;
      const d = NG.dist2(x, y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // 동료가 쏠 적: 동료 자리에서 range 안의 가장 가까운 적
  function wingTarget(W) {
    const w = W.wing, R = D.WINGMAN.range;
    const e = w && nearestEnemy(W, w.x, w.y);
    return e && NG.dist2(e.x, e.y, w.x, w.y) <= R * R ? e : null;
  }

  function updateWing(W, dt) {
    const w = W.wing, WM = D.WINGMAN, p = W.player;
    if (!w) return;
    if (w.bye > 0) {
      // 손 흔들고 떠나기: 처음 절반은 제자리에서 흔들흔들, 그다음 위로 날아간다
      w.bye -= dt;
      w.wave += dt;
      if (w.bye < WM.bye * 0.5) { w.y -= 320 * dt; w.aim = -Math.PI / 2; }
      if (w.bye <= 0 || w.y < -40) W.wing = null;
      return;
    }
    // 내 옆(조준 반대쪽 비스듬히)을 부드럽게 따라온다
    const a = p.aim + Math.PI * 0.62;
    const tx = p.x + Math.cos(a) * WM.side, ty = p.y + Math.sin(a) * WM.side;
    const k = Math.min(1, dt * WM.follow);
    w.x += (tx - w.x) * k; w.y += (ty - w.y) * k;
    w.x = NG.clamp(w.x, 10, W.w - 10); w.y = NG.clamp(w.y, 10, W.h - 10);
    const e = wingTarget(W);
    if (e) w.aim = Math.atan2(e.y - w.y, e.x - w.x);
    w.cd -= dt;
    if (w.cd <= 0) {
      if (e) {
        const c = Math.cos(w.aim), s = Math.sin(w.aim);
        W.bullets.push({ x: w.x + c * 10, y: w.y + s * 10, vx: c * WM.bulletSpeed, vy: s * WM.bulletSpeed, r: 3,
          dmg: p.gun.dmg * WM.dmgMul, life: WM.range / WM.bulletSpeed, pierce: 0, bounce: 0, hits: [], wing: true });
        w.shots += 1;
        w.cd = 1 / WM.rate;
      } else w.cd = 0;
    }
    w.t -= dt;
    if (w.t <= 0) {
      w.t = 0;
      w.bye = WM.bye;
      W.texts.push({ x: w.x, y: w.y - 22, txt: '고마워!', life: 1.6, col: w.look.color });
      W.events.push('wingBye');
    }
  }

  // ─── 피버 타임 ─────────────────────────────────────────────
  const feverMul = W => (W.feverT > 0 ? D.FEVER.scoreMul : 1);
  // 콤보가 이어지는 처치마다 게이지가 찬다 (피버 중엔 안 참)
  function fillFever(W, e) {
    const F = D.FEVER;
    if (W.feverT > 0 || W.combo < F.fromCombo) return;
    W.fever += 1 + (e.type === 'boss' ? F.bossAdd : 0);
    if (W.fever >= F.need) startFever(W);
  }
  function startFever(W) {
    const F = D.FEVER;
    W.fever = F.need;
    W.feverT = F.time;
    W.feverBanner = F.banner;
    W.stats.fevers += 1;
    W.events.push('fever');
  }
  function updateFever(W, dt) {
    const F = D.FEVER;
    if (W.feverT > 0) {
      W.feverT -= dt;
      W.fever = F.need * Math.max(0, W.feverT / F.time); // 끝날 때까지 게이지가 줄어든다
      if (W.feverT <= 0) { W.feverT = 0; W.fever = 0; W.events.push('feverEnd'); }
    } else if (W.combo <= 0 && W.fever > 0) W.fever = Math.max(0, W.fever - F.idleDrain * dt);
  }

  // 한 프레임: 선물 상자·캡슐·동료·피버
  function updateFun(W, dt) {
    const G = D.GIFT, WM = D.WINGMAN, p = W.player;
    W.waveT += dt;
    // 선물 상자 차례
    W.giftT -= dt;
    if (W.giftT <= 0) {
      if (giftBlocked(W)) W.giftT = G.retry;
      else { spawnGift(W); W.giftT = between(W.fun, G.gap); }
    }
    const g = W.gift;
    if (g) {
      g.t += dt; g.life -= dt; g.flash = Math.max(0, g.flash - dt);
      g.x += g.vx * dt;
      g.y = g.baseY + Math.sin(g.t * 1.8 + g.ph) * G.bob;
      if (NG.dist2(g.x, g.y, p.x, p.y) < (g.r + p.r) * (g.r + p.r)) openGift(W);
      else if (g.life <= 0) W.gift = null;
    }
    // 구조 캡슐 차례 (웨이브의 적이 남아 있을 때만)
    if (W.capT > 0) {
      W.capT -= dt;
      if (W.capT <= 0) {
        W.capT = -1;
        if (!W.wing && !W.capsule && (W.spawnQueue.length || W.enemies.some(e => !e.dead))) spawnCapsule(W);
        else W.capNext = W.wave + 1;
      }
    }
    const c = W.capsule;
    if (c) {
      c.t += dt; c.life -= dt; c.flash = Math.max(0, c.flash - dt);
      c.x += c.vx * dt; c.y += c.vy * dt;
      const out = c.x < -60 || c.x > W.w + 60 || c.y < -60 || c.y > W.h + 60;
      if (NG.dist2(c.x, c.y, p.x, p.y) < (c.r + p.r) * (c.r + p.r)) freeCapsule(W);
      else if (c.life <= 0 || (out && c.t > 3)) { W.capsule = null; W.capNext = W.wave + 1; }
    }
    updateWing(W, dt);
    updateFever(W, dt);
  }

  // ─── 운석 (2026-09-27) ──────────────────────────────────────
  // 내 자리에 예고 원을 띄우고 warn초 뒤 떨어진다. 가만히 있으면 맞고, 원 밖으로 비키면 안 맞는다
  function meteorGap(W) {
    const M = D.METEOR;
    return W.diff.meteorEvery * Math.max(M.minMul, 1 - (W.wave - 1) * M.perWave) * (W.bossWave ? M.bossMul : 1);
  }
  function dropMeteors(W) {
    const M = D.METEOR, p = W.player;
    const n = 1 + Math.min(M.extraMax, Math.floor((W.wave - 1) / M.extraEvery));
    const warn = W.diff.meteorWarn;
    for (let i = 0; i < n; i++) {
      let x = p.x, y = p.y;
      if (i > 0) { const a = W.rand() * TAU, r = M.r * 1.4 + W.rand() * (M.spread - M.r * 1.4); x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r; }
      x = NG.clamp(x, M.r * 0.5, W.w - M.r * 0.5); y = NG.clamp(y, M.r * 0.5, W.h - M.r * 0.5);
      W.meteors.push({ x, y, r: M.r, t: -i * 0.25, warn, rot: W.rand() * TAU });
    }
    W.events.push('meteorWarn');
  }
  function updateMeteors(W, dt) {
    const M = D.METEOR, p = W.player;
    for (const m of W.meteors) {
      m.t += dt;
      if (m.t < m.warn) continue;
      m.done = true;
      const rr = m.r + p.r * 0.4;
      if (NG.dist2(m.x, m.y, p.x, p.y) < rr * rr) hurtPlayer(W, 1);
      const dmg = M.enemyDmg * (1 + (W.wave - 1) * D.WAVE.hpPerWave) * W.diff.enemyHp;
      for (const e of W.enemies) {
        if (e.dead || e.spawnT > 0 || e.hide || e.type === 'boss') continue;
        const er = m.r + e.r * 0.5;
        if (NG.dist2(m.x, m.y, e.x, e.y) < er * er) damageEnemy(W, e, dmg, false, e.x - m.x, e.y - m.y, 'ult');
      }
      W.particles.push({ pop: true, x: m.x, y: m.y, r: m.r * 0.7, life: 0.14, max: 0.14, color: '#fff1c9' });
      W.particles.push({ ring: true, x: m.x, y: m.y, r: m.r * 1.25, life: 0.4, max: 0.4, color: '#ff9a3c' });
      burst(W, m.x, m.y, '#ffb46b', 10, 240, 3.5);
      burst(W, m.x, m.y, '#8a6a52', 8, 180, 4);
      W.shake = Math.max(W.shake, 7);
      impact(W, M.stop);
      W.events.push('meteor');
    }
    W.meteors = W.meteors.filter(m => !m.done);
    // 웨이브의 적이 모두 나오고 다 잡혔으면 새 운석은 없다 (카드 화면 직전에 맞지 않게)
    if (!W.spawnQueue.length && !W.enemies.some(e => !e.dead)) return;
    if (!W.diff.meteorEvery) return;
    W.meteorT -= dt;
    if (W.meteorT <= 0) {
      W.meteorT = meteorGap(W) * (0.85 + W.rand() * 0.3);
      dropMeteors(W);
    }
  }

  function updateFx(W, dt) {
    for (const q of W.particles) {
      q.life -= dt;
      if (q.ring || q.pop) continue;
      q.x += q.vx * dt; q.y += q.vy * dt;
      const f = q.shard ? 0.94 : 0.9;
      q.vx *= f; q.vy *= f;
      if (q.shard) q.rot += q.vr * dt;
    }
    // 보스 연쇄 폭발
    if (W.booms.length) {
      for (const b of W.booms) {
        b.delay -= dt;
        if (b.delay <= 0) {
          W.particles.push({ pop: true, x: b.x, y: b.y, r: 34, life: 0.14, max: 0.14, color: '#ffffff' });
          W.particles.push({ ring: true, x: b.x, y: b.y, r: 120, life: 0.45, max: 0.45, color: b.color });
          burst(W, b.x, b.y, b.color, 18, 320, 4);
          W.shake = Math.max(W.shake, 14);
          W.pulse = Math.max(W.pulse, 0.7);
          W.events.push('kill');
        }
      }
      W.booms = W.booms.filter(b => b.delay > 0);
    }
    W.particles = W.particles.filter(q => q.life > 0);
    for (const t of W.texts) { t.life -= dt; t.y -= 30 * dt; }
    // 처음 만난 행성 적 이름표: 그 적을 따라다닌다
    if (W.tags.length) {
      for (const g of W.tags) {
        g.life -= dt;
        const e = W.enemies.find(x => x.id === g.id && !x.dead);
        if (e) { g.x = e.x; g.y = e.y; }
      }
      W.tags = W.tags.filter(g => g.life > 0);
    }
    W.texts = W.texts.filter(t => t.life > 0);
    for (const d of W.drops) d.life -= dt;
    W.drops = W.drops.filter(d => d.life > 0);
    W.shake = Math.max(0, W.shake - dt * 40);
    W.flash = Math.max(0, W.flash - dt);
    W.whiteFlash = Math.max(0, W.whiteFlash - dt);
    W.pulse = Math.max(0, W.pulse - dt * 1.6);
    W.banner = Math.max(0, W.banner - dt);
    W.comboPop = Math.max(0, W.comboPop - dt * 4);
    W.feverBanner = Math.max(0, W.feverBanner - dt);
    if (W.giftPop) { W.giftPop.life -= dt; if (W.giftPop.life <= 0) W.giftPop = null; }
  }

  function updateCombo(W, dt) {
    if (W.combo <= 0) return;
    W.comboT -= dt;
    if (W.comboT <= 0) { W.combo = 0; W.comboT = 0; }
  }

  // 한 프레임 진행. input: {moveX, moveY, aimAngle|null, dash, ult}
  function step(W, input, dt) {
    // 히트스톱: 화면이 멈춘 동안은 흔들림만 풀고 아무것도 움직이지 않는다
    // 멈춘 동안 누른 대시·필살기는 버리지 않고 기억했다가 멈춤이 풀리면 쓴다
    // (예전엔 적을 잡는 순간 누른 N-버스트가 씹혔다)
    if (W.hitstop > 0) {
      W.hitstop -= dt;
      if (W.phase === 'play') {
        if (input.dash) W.pendDash = true;
        if (input.ult) W.pendUlt = true;
      }
      return;
    }
    if (W.phase === 'over') { fadeShocks(W, dt); updateFx(W, dt); return; }
    if (W.phase !== 'play') return;
    if (W.pendDash || W.pendUlt) {
      input = Object.assign({}, input, { dash: input.dash || W.pendDash, ult: input.ult || W.pendUlt });
      W.pendDash = W.pendUlt = false;
    }
    // 보스 격파 직후 느린 화면
    if (W.slow > 0) { W.slow -= dt; dt *= D.IMPACT.slowRate; }
    W.t += dt;
    W.stats.time += dt;
    updateCombo(W, dt);
    updatePlayer(W, input, dt);
    updateEnemies(W, dt);
    updateBullets(W, dt);
    updateLasers(W, dt);
    updateMeteors(W, dt);
    updateMists(W, dt);
    updateShocks(W, dt);
    updateFun(W, dt);
    W.enemies = W.enemies.filter(e => !e.dead);
    updateSpawns(W, dt);
    updateFx(W, dt);
  }

  NG.World = { makePlayer, addDrop, bossLook, createWorld, step, pickCard, resize, buildWave, drawCards, useUlt, ultDamage, placeOf, holePull, meteorGap,
    foeOf, adaptDiff, perfOf, inMist, spawnEnemy,
    giftBlocked, spawnGift, giftReward, openGift, spawnCapsule, freeCapsule, wingTarget, startFever, killEnemy };
})(NG);
