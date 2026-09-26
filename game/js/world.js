'use strict';
// 게임 규칙. DOM을 건드리지 않으므로 node 테스트에서 그대로 돌린다.
// 소리·흔들림처럼 화면 쪽이 반응할 일은 W.events에 이름만 쌓아 두고 main.js가 꺼내 간다.
(function (NG) {
  const D = NG.DATA;
  const TAU = Math.PI * 2;
  const MAX_PARTICLES = 700;

  function makePlayer(x, y, diff) {
    const P = D.PLAYER;
    return {
      x, y, r: P.r, vx: 0, vy: 0,
      hp: diff.hp, maxHp: diff.hp, iframe: 0, muzzle: 0,
      speed: P.speed,
      dashT: 0, dashCd: 0, dashCdMax: P.dashCd, dashX: 1, dashY: 0,
      aim: -Math.PI / 2, fireCd: 0,
      gun: Object.assign({}, D.GUN),
      drones: 0, droneAng: 0, vamp: 0, nova: 0,
      ult: 0, ultT: 0, // 필살기 게이지 (0 ~ D.ULT.need), 발동 연출 남은 시간
      lvl: {},
    };
  }

  // diff: 'easy' | 'normal' | 'hard' (생략하면 보통)
  function createWorld(w, h, seed, diff) {
    const df = D.DIFFICULTY[diff] || D.DIFFICULTY.normal;
    const W = {
      w, h, t: 0, diff: df,
      rand: NG.rng(seed == null ? (Date.now() & 0xffffffff) : seed),
      phase: 'play', // play | cards | over
      wave: 0, banner: 0, bossWave: false, bossKills: 0,
      spawnQueue: [], spawnTimer: 0, clearT: -1,
      player: makePlayer(w / 2, h / 2, df),
      enemies: [], bullets: [], eBullets: [], particles: [], drops: [], texts: [],
      cards: null, events: [], shake: 0, flash: 0, whiteFlash: 0,
      hitstop: 0, lastStop: -1, slow: 0, pulse: 0, booms: [], shocks: [],
      score: 0, nextId: 1,
      stats: { kills: 0, shots: 0, time: 0, picks: [], ults: 0 },
    };
    startWave(W);
    return W;
  }

  function resize(W, w, h) {
    W.w = w; W.h = h;
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
    return q;
  }

  function startWave(W) {
    W.wave += 1;
    W.bossWave = W.wave % D.WAVE.bossEvery === 0;
    W.spawnQueue = buildWave(W.wave, W.rand, W.diff);
    W.spawnTimer = 0.8;
    W.clearT = -1;
    W.banner = D.WAVE.banner;
    W.eBullets.length = 0;
    W.events.push(W.bossWave ? 'boss' : 'wave');
  }

  function spawnPoint(W, r) {
    const p = W.player;
    const safe2 = D.WAVE.safeRadius * D.WAVE.safeRadius;
    let x = 0, y = 0;
    for (let i = 0; i < 8; i++) {
      const edge = Math.floor(W.rand() * 4);
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
      ringCd: def.ringCd || 0, aimCd: def.aimCd || 0, summonCd: def.summonCd || 0,
      strafe: W.rand() < 0.5 ? 1 : -1,
    };
    W.enemies.push(e);
    return e;
  }

  function spawnEnemy(W, type) {
    const pt = spawnPoint(W, D.ENEMIES[type].r);
    return makeEnemy(W, type, pt.x, pt.y, true);
  }

  function updateSpawns(W, dt) {
    if (W.spawnQueue.length) {
      W.spawnTimer -= dt;
      if (W.spawnTimer <= 0) {
        const n = D.WAVE.groupSize(W.wave);
        for (let i = 0; i < n && W.spawnQueue.length; i++) spawnEnemy(W, W.spawnQueue.shift());
        W.spawnTimer += D.WAVE.spawnGap(W.wave);
      }
      return;
    }
    // 보스 연쇄 폭발·느린 화면이 끝날 때까지 카드 화면을 미룬다
    if (W.enemies.length === 0 && !W.booms.length && W.slow <= 0) {
      if (W.clearT < 0) W.clearT = D.WAVE.clearDelay;
      W.clearT -= dt;
      if (W.clearT <= 0) openCards(W);
    }
  }

  // ─── 카드 ──────────────────────────────────────────────────
  function openCards(W) {
    W.phase = 'cards';
    W.cards = drawCards(W, 3);
    W.eBullets.length = 0;
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
        size: e.r * (0.35 + W.rand() * 0.35), life, max: life, color: e.def.color,
      });
    }
    W.particles.push({ pop: true, x: e.x, y: e.y, r: e.r * 1.3, life: 0.12, max: 0.12, color: '#ffffff' });
    W.particles.push({ ring: true, x: e.x, y: e.y, r: e.r * (big ? 3.2 : 2.4), life: big ? 0.4 : 0.3, max: big ? 0.4 : 0.3, color: e.def.color });
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
    const mul = 1 + W.bossKills * 0.5;
    W.score += Math.round(e.def.score * mul * W.diff.score);
    W.stats.kills += 1;
    shatter(W, e, dx, dy);
    burst(W, e.x, e.y, e.def.color, e.type === 'boss' ? 60 : 4 + Math.round(e.r / 3), e.type === 'boss' ? 420 : 200, e.type === 'boss' ? 5 : 2.5);
    impact(W, D.IMPACT.stop[e.type], e.type === 'boss');

    if (e.def.splitInto) {
      for (let i = 0; i < 2; i++) {
        const a = W.rand() * TAU;
        const m = makeEnemy(W, e.def.splitInto, e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, false);
        m.vx = Math.cos(a) * 200; m.vy = Math.sin(a) * 200;
      }
    }
    if (e.type === 'boss') {
      W.bossKills += 1;
      W.shake = Math.max(W.shake, 22);
      W.whiteFlash = 0.5;
      W.pulse = 1;
      W.slow = D.IMPACT.bossSlow;
      W.eBullets.length = 0;
      // 연쇄 폭발: 보스 자리 주변에서 시간차로 터진다
      for (let i = 0; i < D.IMPACT.bossBooms; i++) {
        const a = W.rand() * TAU, r = e.r * (0.3 + W.rand() * 1.1);
        W.booms.push({ delay: 0.12 + i * 0.13, x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, color: i % 2 ? '#ffe66d' : e.def.color });
      }
      for (let i = 0; i < 2; i++) addDrop(W, e.x + (i ? 20 : -20), e.y);
      W.events.push('bossDown');
    } else {
      if (W.rand() < D.DROP.healChance) addDrop(W, e.x, e.y);
      W.events.push('kill');
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
    p.ult = Math.min(U.need, p.ult + gain);
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
    W.shocks.push({ x: p.x, y: p.y, r: 0, max, dmg: ultDamage(W), hit: [], n: p.gun.barrels * U.spokes, rot: p.aim });
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
        if (e.dead || e.spawnT > 0 || s.hit.indexOf(e.id) >= 0) continue;
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d - e.r > s.r) continue;
        s.hit.push(e.id);
        const dx = e.x - s.x, dy = e.y - s.y;
        damageEnemy(W, e, e.type === 'boss' ? s.dmg * U.bossMul : s.dmg, false, dx, dy, 'ult');
        if (!e.dead && e.type !== 'boss') { const l = d || 1; e.vx += dx / l * 420; e.vy += dy / l * 420; }
      }
      W.eBullets = W.eBullets.filter(b => Math.hypot(b.x - s.x, b.y - s.y) > s.r);
    }
    W.shocks = W.shocks.filter(s => s.r < s.max);
  }

  function addDrop(W, x, y) {
    W.drops.push({ x, y, life: D.DROP.life, type: 'heal' });
  }

  function hurtPlayer(W, n) {
    const p = W.player;
    if (p.iframe > 0 || p.dashT > 0 || W.phase !== 'play') return;
    p.hp -= n;
    p.iframe = D.PLAYER.iframe;
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
      if (e.dead || e.spawnT > 0) continue;
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
      const k = Math.min(1, dt * 16);
      p.vx += (mx * p.speed - p.vx) * k;
      p.vy += (my * p.speed - p.vy) * k;
    }
    p.x = NG.clamp(p.x + p.vx * dt, p.r, W.w - p.r);
    p.y = NG.clamp(p.y + p.vy * dt, p.r, W.h - p.r);
    p.iframe = Math.max(0, p.iframe - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);

    // 조준: 입력이 있으면 그 방향, 없으면 가장 가까운 적
    let target = null;
    if (input.aimAngle != null) p.aim = input.aimAngle;
    else {
      target = nearestEnemy(W, p.x, p.y);
      if (target) p.aim = Math.atan2(target.y - p.y, target.x - p.x);
    }

    // 사격 (자동). 적이 없고 수동 조준도 없으면 쉰다
    p.fireCd -= dt;
    const hasTarget = input.aimAngle != null || target != null;
    if (p.fireCd <= 0 && hasTarget) {
      fire(W, p);
      p.fireCd += 1 / p.gun.rate;
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
          if (e.dead || e.spawnT > 0 || e.droneHit > 0) continue;
          const rr = e.r + DR.r;
          if (NG.dist2(dx, dy, e.x, e.y) < rr * rr) {
            e.droneHit = DR.hitGap;
            damageEnemy(W, e, p.gun.dmg * DR.dmgMul, false, e.x - p.x, e.y - p.y);
          }
        }
      }
    }

    // 회복 아이템
    for (const d of W.drops) {
      const d2 = NG.dist2(d.x, d.y, p.x, p.y);
      if (d2 < D.DROP.magnetR * D.DROP.magnetR && p.hp < p.maxHp) {
        const dl = Math.sqrt(d2) || 1;
        d.x += (p.x - d.x) / dl * 260 * dt;
        d.y += (p.y - d.y) / dl * 260 * dt;
      }
      if (d2 < D.DROP.pickR * D.DROP.pickR && p.hp < p.maxHp) {
        p.hp += 1;
        d.life = 0;
        W.texts.push({ x: p.x, y: p.y - 20, txt: '+1', life: 0.8, heal: true });
        W.events.push('heal');
      }
    }
  }

  function nova(W, p) {
    const N = D.NOVA;
    const radius = N.radius * (1 + 0.25 * (p.nova - 1));
    for (const e of W.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (NG.dist2(e.x, e.y, p.x, p.y) < (radius + e.r) * (radius + e.r)) {
        damageEnemy(W, e, p.gun.dmg * N.dmgMul * p.nova, false, e.x - p.x, e.y - p.y);
      }
    }
    W.particles.push({ ring: true, x: p.x, y: p.y, r: radius, life: 0.3, max: 0.3, color: '#5ee7ff' });
    W.shake = Math.max(W.shake, 6);
    W.events.push('nova');
  }

  // ─── 적 ────────────────────────────────────────────────────
  function enemyShoot(W, e, angle, speed) {
    speed *= W.diff.bulletSpeed;
    W.eBullets.push({ x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 5, life: 6 });
  }

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
          enemyShoot(W, e, Math.atan2(dy, dx), def.bulletSpeed);
          e.cd = def.fireCd / W.diff.fireRate;
          W.events.push('eshoot');
        }
      } else if (e.type === 'boss') {
        const rage = (e.hp < e.maxHp * 0.5 ? 0.65 : 1) / W.diff.fireRate;
        e.ringCd -= dt; e.aimCd -= dt; e.summonCd -= dt;
        if (e.ringCd <= 0) {
          const n = def.ringCount + W.bossKills * 2;
          const off = W.rand() * TAU;
          for (let i = 0; i < n; i++) enemyShoot(W, e, off + TAU * i / n, def.ringSpeed);
          e.ringCd = def.ringCd * rage;
          W.events.push('eshoot');
        }
        if (e.aimCd <= 0) {
          const a = Math.atan2(dy, dx);
          for (let i = -1; i <= 1; i++) enemyShoot(W, e, a + i * 0.2, def.aimSpeed);
          e.aimCd = def.aimCd * rage;
        }
        if (e.summonCd <= 0) {
          for (let i = 0; i < 2; i++) spawnEnemy(W, W.wave >= 10 ? 'runner' : 'grunt');
          e.summonCd = def.summonCd;
        }
      }

      // 관성 있는 조향 (넉백이 자연스럽게 풀리도록)
      const k = Math.min(1, dt * 6);
      e.vx += (tx * e.speed - e.vx) * k;
      e.vy += (ty * e.speed - e.vy) * k;
      e.x = NG.clamp(e.x + e.vx * dt, e.r, W.w - e.r);
      e.y = NG.clamp(e.y + e.vy * dt, e.r, W.h - e.r);
      e.ang += dt * (e.type === 'tank' ? 0.8 : 2);

      // 몸통 박치기
      const rr = e.r + p.r - 2;
      if (dist < rr) {
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
          const wa = a.type === 'boss' ? 0 : 1, wb = b.type === 'boss' ? 0 : 1;
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
    for (const b of W.bullets) {
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
      for (const e of W.enemies) {
        if (e.dead || e.spawnT > 0) continue;
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
    W.texts = W.texts.filter(t => t.life > 0);
    for (const d of W.drops) d.life -= dt;
    W.drops = W.drops.filter(d => d.life > 0);
    W.shake = Math.max(0, W.shake - dt * 40);
    W.flash = Math.max(0, W.flash - dt);
    W.whiteFlash = Math.max(0, W.whiteFlash - dt);
    W.pulse = Math.max(0, W.pulse - dt * 1.6);
    W.banner = Math.max(0, W.banner - dt);
  }

  // 한 프레임 진행. input: {moveX, moveY, aimAngle|null, dash, ult}
  function step(W, input, dt) {
    // 히트스톱: 화면이 멈춘 동안은 흔들림만 풀고 아무것도 움직이지 않는다
    if (W.hitstop > 0) {
      W.hitstop -= dt;
      return;
    }
    if (W.phase === 'over') { updateFx(W, dt); return; }
    if (W.phase !== 'play') return;
    // 보스 격파 직후 느린 화면
    if (W.slow > 0) { W.slow -= dt; dt *= D.IMPACT.slowRate; }
    W.t += dt;
    W.stats.time += dt;
    updatePlayer(W, input, dt);
    updateEnemies(W, dt);
    updateBullets(W, dt);
    updateShocks(W, dt);
    W.enemies = W.enemies.filter(e => !e.dead);
    updateSpawns(W, dt);
    updateFx(W, dt);
  }

  NG.World = { createWorld, step, pickCard, resize, buildWave, drawCards, useUlt, ultDamage };
})(NG);
