'use strict';
// 달리기 규칙. DOM 없음 → node 테스트에서 그대로 돌린다.
// 원칙: 지는 일이 없다. 부딪히거나 빠져도 웃긴 연출 뒤 계속 달린다.
(function (RC) {
  const D = RC.DATA;
  const R0 = D.RUN;
  const GY = R0.groundY;

  // ─── 코스 만들기 ──────────────────────────────────────────
  // 조각(패턴)을 이어 붙인다. 모든 조각은 어떤 부품 조합으로도 지나갈 수 있다
  function buildLevel(seed) {
    const rand = RC.rng(seed);
    const L = { length: R0.length, pits: [], items: [] };
    const star = (x, y) => L.items.push({ type: 'star', x, y, got: false });
    const arc = (x0, w, h, n) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; star(x0 + t * w, GY - 40 - Math.sin(t * Math.PI) * h); } };
    const PATTERNS = ['stars', 'pit', 'boxes', 'rock', 'fire', 'ramp', 'high', 'monkey', 'boxes', 'pit'];
    let x = 700;
    // 처음 몇 조각은 쉬운 순서로 고정 (별 → 상자 → 구덩이)
    const first = ['stars', 'boxes', 'pit', 'stars'];
    let i = 0;
    while (x < L.length - 900) {
      const kind = i < first.length ? first[i] : PATTERNS[Math.floor(rand() * PATTERNS.length)];
      i++;
      switch (kind) {
        case 'stars':
          for (let k = 0; k < 6; k++) star(x + k * 60, GY - 40);
          x += 480; break;
        case 'pit': {
          const w = 130 + Math.round(rand() * 60);
          L.pits.push({ x: x + 60, w });
          arc(x, w + 120, 110, 5);
          x += w + 320; break;
        }
        case 'boxes': {
          const n = rand() < 0.5 ? 1 : 2;
          L.items.push({ type: 'box', x: x + 80, w: 64, h: 64 * n, n, broken: false });
          for (let k = 0; k < n; k++) star(x + 112, GY - 40 - 64 * n - 30 - k * 50);
          x += 420; break;
        }
        case 'rock':
          L.items.push({ type: 'rock', x: x + 80, w: 90, h: 70, broken: false });
          arc(x + 40, 180, 170, 4);
          x += 460; break;
        case 'fire':
          L.items.push({ type: 'fire', x: x + 60, w: 110, out: false });
          arc(x + 20, 190, 120, 4);
          x += 440; break;
        case 'ramp':
          L.items.push({ type: 'ramp', x: x + 40, w: 150, h: 60 });
          arc(x + 200, 360, 190, 7);
          x += 640; break;
        case 'high':
          // 높은 별: 제트팩·날개·스프링·몬스터 바퀴면 닿는다 (보너스)
          for (let k = 0; k < 5; k++) star(x + 60 + k * 55, GY - 230 - (k % 2) * 20);
          for (let k = 0; k < 3; k++) star(x + 100 + k * 70, GY - 40);
          x += 480; break;
        case 'monkey':
          L.items.push({ type: 'monkey', x: x + 260, state: 'wait', threw: false, flee: 0 });
          for (let k = 0; k < 4; k++) star(x + 20 + k * 60, GY - 40);
          x += 520; break;
      }
    }
    L.items.push({ type: 'flag', x: L.length });
    return L;
  }

  // ─── 시작 ────────────────────────────────────────────────
  // cfg: {body, wheel, gear, color}
  function createRun(cfg, seed) {
    const body = RC.find(D.BODIES, cfg.body), wheel = RC.find(D.WHEELS, cfg.wheel), gear = RC.find(D.GEAR, cfg.gear);
    const L = buildLevel(seed == null ? 7 : seed);
    return {
      cfg, body, wheel, gear, level: L, rand: RC.rng((seed || 7) * 13 + 1),
      t: 0, done: false, doneT: 0,
      car: {
        x: 200, y: GY, vy: 0, onGround: true, airJumps: 0,
        form: 'car', robotT: 0, cd: 0, morph: 0,
        fuel: R0.jetFuel, thrusting: false, gliding: false,
        spin: 0, bump: 0, hot: 0, fall: false, punch: 0,
      },
      stars: 0, totalStars: L.items.filter(o => o.type === 'star').length,
      smashed: 0, transforms: 0,
      fx: [], events: [], flying: [],
    };
  }

  function speedOf(R) {
    const c = R.car;
    let v = R0.speed * R.wheel.speed;
    if (c.form === 'robot' && R.body.ability === 'dash') v *= R0.dashMul;
    if (c.bump > 0) v *= 0.25;
    if (c.spin > 0) v *= 0.55;
    if (c.hop > 0) v *= 1.5;
    if (R.done) v *= Math.max(0, 1 - R.doneT);
    return v;
  }

  function puff(R, x, y, color, n, speed, size, kind) {
    for (let i = 0; i < n; i++) {
      if (R.fx.length > 400) R.fx.shift();
      const a = R.rand() * Math.PI * 2, s = speed * (0.3 + R.rand() * 0.9), life = 0.4 + R.rand() * 0.5;
      R.fx.push({ kind: kind || 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life, max: life, color, size: size * (0.6 + R.rand() * 0.8), rot: R.rand() * 6, vr: (R.rand() - 0.5) * 10 });
    }
  }

  // 상자·바위에서 나온 별은 차 쪽으로 날아와 저절로 모인다
  function spill(R, x, y, n) {
    for (let i = 0; i < n; i++) {
      R.flying.push({ x, y, vx: -60 + R.rand() * 260, vy: -380 - R.rand() * 200, t: 0 });
      R.totalStars += 1;
    }
  }

  function smash(R, o, stars) {
    o.broken = true;
    R.smashed += 1;
    spill(R, o.x + o.w / 2, GY - o.h / 2, stars);
    puff(R, o.x + o.w / 2, GY - o.h / 2, o.type === 'rock' ? '#c3c8d2' : '#c98a4b', 16, 380, 12, 'chunk');
    puff(R, o.x + o.w / 2, GY - 20, '#c9c2b4', 8, 140, 18, 'dust');
    R.freeze = 0.06;
    R.events.push('smash');
  }

  // ─── 한 프레임 ────────────────────────────────────────────
  // input: {tap: 이번 프레임에 눌렀나, hold: 누르고 있나, transform: 변신 버튼 눌렀나}
  function stepRun(R, input, dt) {
    const c = R.car;
    // 타격 멈춤: 부수는 순간 아주 잠깐 정지 (손맛)
    if (R.freeze > 0) { R.freeze -= dt; return; }
    // 변신하는 동안은 느린 화면
    if (c.morph > 0) dt *= R0.morphSlow;
    R.t += dt;
    if (R.done) R.doneT += dt;

    // 변신
    c.cd = Math.max(0, c.cd - dt);
    c.morph = Math.max(0, c.morph - dt);
    c.landT = Math.max(0, (c.landT || 0) - dt);
    c.punch = Math.max(0, c.punch - dt);
    if (input.transform && c.form === 'car' && c.cd <= 0 && !R.done) {
      c.form = 'robot'; c.robotT = R0.robotTime; c.morph = R0.morph;
      R.transforms += 1;
      R.events.push('transform');
      puff(R, c.x, c.y - 50, '#ffffff', 20, 300, 6, 'spark');
      if (R.body.ability === 'water') {
        // 물대포: 앞에 있는 불을 모두 끈다
        for (const o of R.level.items) {
          if (o.type === 'fire' && !o.out && o.x > c.x - 50 && o.x < c.x + R0.waterRange) {
            o.out = true; spill(R, o.x + o.w / 2, GY - 30, 2);
            puff(R, o.x + o.w / 2, GY - 20, '#bfe9ff', 14, 200, 14, 'steam');
          }
        }
        R.events.push('water');
      }
      if (R.body.ability === 'siren') {
        for (const o of R.level.items) if (o.type === 'monkey' && o.x > c.x && o.x < c.x + 900) o.flee = 1;
        R.events.push('siren');
      }
    }
    if (c.form === 'robot') {
      c.robotT -= dt;
      if (c.robotT <= 0) { c.form = 'car'; c.cd = R0.transformCd; c.morph = R0.morph; R.events.push('untransform'); }
    }

    // 점프·공중
    if (!R.done && !c.fall) {
      if (input.tap) {
        if (c.onGround) {
          c.vy = -R0.jumpV * R.wheel.jump; c.onGround = false; c.airJumps = R.wheel.double ? 1 : 0;
          R.events.push('jump');
        } else if (c.airJumps > 0) {
          c.vy = -R0.jumpV * 0.9; c.airJumps -= 1;
          R.events.push('jump2');
        }
      }
      c.thrusting = false; c.gliding = false;
      if (!c.onGround && input.hold) {
        if (R.gear.id === 'jet' && c.fuel > 0) {
          c.fuel -= dt; c.thrusting = true;
          c.vy = Math.max(-R0.jetMaxUp, c.vy - R0.jetThrust * dt);
        } else if (R.gear.id === 'wing' && c.vy > R0.glideFall) {
          c.vy = R0.glideFall; c.gliding = true;
        }
      }
    }

    // 앞으로
    c.x += speedOf(R) * dt;
    c.bump = Math.max(0, c.bump - dt);
    c.spin = Math.max(0, c.spin - dt);
    c.hot = Math.max(0, c.hot - dt);
    c.hop = Math.max(0, (c.hop || 0) - dt);

    // 구덩이
    const pit = R.level.pits.find(p => c.x > p.x + 10 && c.x < p.x + p.w - 10);
    // 경사로
    let floor = GY;
    for (const o of R.level.items) {
      if (o.type === 'ramp' && c.x >= o.x && c.x <= o.x + o.w) floor = GY - o.h * (c.x - o.x) / o.w;
    }

    c.vy += R0.gravity * dt;
    c.y += c.vy * dt;
    if (c.fall) {
      // 구덩이에 빠짐 → 아래로 떨어졌다가 "뿅" 하고 건너편으로 튀어나온다
      if (c.y > GY + 160) {
        const p = c.fall;
        c.fall = false;
        c.x = p.x + p.w + 30; c.y = GY - 10; c.vy = -900; c.onGround = false;
        puff(R, c.x, GY, '#ffe66d', 18, 320, 6, 'spark');
        R.events.push('pop');
      }
    } else if (pit && c.y >= GY - 1 && c.vy >= 0) {
      c.fall = pit; c.onGround = false;
      R.events.push('fall');
    } else if (c.y >= floor) {
      const wasAir = !c.onGround;
      const onRamp = floor < GY;
      c.y = floor;
      if (wasAir && c.vy > 300) { R.events.push('land'); puff(R, c.x, GY, '#d6d0c4', 6, 120, 8, 'dust'); }
      c.vy = 0; c.onGround = true; c.fuel = R0.jetFuel;
      if (onRamp && c.x > 0) {
        const ramp = R.level.items.find(o => o.type === 'ramp' && c.x >= o.x && c.x <= o.x + o.w);
        if (ramp && c.x > ramp.x + ramp.w - speedOf(R) * dt * 1.5) { c.vy = -760; c.onGround = false; R.events.push('ramp'); }
      }
    } else {
      c.onGround = false;
    }

    // 장애물·별
    const robot = c.form === 'robot';
    const front = c.x + 50;
    for (const o of R.level.items) {
      if (o.x > c.x + 900) break;
      if (o.type === 'star' && !o.got) {
        let dx = o.x - c.x, dy = o.y - (c.y - 35);
        const magnet = robot && R.body.ability === 'siren';
        if (magnet && dx * dx + dy * dy < R0.magnetR * R0.magnetR) { o.x -= dx * 6 * dt; o.y -= dy * 6 * dt; dx = o.x - c.x; dy = o.y - (c.y - 35); }
        if (dx * dx + dy * dy < R0.starR * R0.starR * (robot ? 1.6 : 1)) {
          o.got = true; R.stars += 1; R.events.push('star'); R.lastStar = { x: o.x, y: o.y };
          puff(R, o.x, o.y, '#ffe66d', 6, 160, 5, 'spark');
        }
      } else if ((o.type === 'box' || o.type === 'rock') && !o.broken && !o.hopped) {
        const hitX = front > o.x && c.x - 40 < o.x + o.w;
        const hitY = c.y > GY - o.h + 4;
        if (hitX && hitY) {
          if (robot || R.gear.id === 'drill') {
            c.punch = 0.25;
            smash(R, o, o.type === 'rock' ? 3 : 2 + o.n);
          } else if (o.type === 'box') {
            // 차로 박으면 "쿵" 튕기고 상자는 그래도 부서진다 (막히는 일 없음). 별은 적게
            c.bump = 0.45; c.x -= 20;
            R.events.push('bump');
            smash(R, o, 1);
          } else {
            // 바위: "쿵" 한 뒤 저절로 폴짝 넘어간다
            o.hopped = true;
            c.x = o.x - 55; c.vy = -950; c.onGround = false; c.hop = 0.8;
            R.events.push('bump');
          }
        }
      } else if (o.type === 'fire' && !o.out) {
        if (c.x > o.x && c.x < o.x + o.w && c.onGround && c.hot <= 0) {
          // 앗 뜨거! 폴짝 뛰며 연기 (벌칙 없음)
          c.hot = 0.8; c.vy = -520; c.onGround = false;
          puff(R, c.x, GY - 20, '#555a66', 10, 120, 16, 'steam');
          R.events.push('hot');
        }
      } else if (o.type === 'monkey') {
        if (o.flee > 0) { o.flee += dt; o.x += 500 * dt; continue; }
        if (!o.threw && o.x - c.x < 650) {
          o.threw = true; o.state = 'throw';
          R.level.items.push({ type: 'banana', x: o.x - 180, y: GY, hit: false });
          R.level.items.sort((a, b) => a.x - b.x);
          R.events.push('monkey');
        }
        if (Math.abs(o.x - c.x) < 40 && o.state !== 'jump') { o.state = 'jump'; o.jumpT = 0; R.events.push('boing'); }
        if (o.state === 'jump') o.jumpT += dt;
      } else if (o.type === 'banana' && !o.hit) {
        if (Math.abs(o.x - c.x) < 30 && c.onGround && !robot) {
          o.hit = true; c.spin = 0.9; R.events.push('slip');
        } else if (Math.abs(o.x - c.x) < 30 && robot) { o.hit = true; }
      } else if (o.type === 'flag' && !R.done && c.x >= o.x) {
        R.done = true; R.events.push('finish');
        for (let k = 0; k < 4; k++) puff(R, c.x + 100, GY - 250, ['#ff3b3b', '#ffd21a', '#22c55e', '#2f6bff'][k], 14, 420, 9, 'confetti');
      }
    }

    // 날아오는 별 (상자에서 나온 것) → 잠시 뒤 차에 빨려 들어온다
    for (const f of R.flying) {
      f.t += dt;
      if (f.t < 0.35) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 1500 * dt; }
      else {
        const tx = c.x, ty = c.y - 40;
        f.x += (tx - f.x) * Math.min(1, dt * 9); f.y += (ty - f.y) * Math.min(1, dt * 9);
        if (Math.abs(tx - f.x) < 20 && Math.abs(ty - f.y) < 20) { f.got = true; R.stars += 1; R.events.push('star'); R.lastStar = { x: f.x, y: f.y }; }
      }
    }
    R.flying = R.flying.filter(f => !f.got);

    // 효과
    if (c.thrusting && R.rand() < 0.9) R.fx.push({ kind: 'flame', x: c.x - 55, y: c.y - 30, vx: -200, vy: 120, life: 0.25, max: 0.25, color: '#ffb020', size: 10 });
    for (const q of R.fx) {
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.kind === 'confetti' || q.kind === 'chunk') { q.vy += 900 * dt; q.rot += q.vr * dt; }
      else if (q.kind === 'steam') { q.vy -= 60 * dt; q.size += 20 * dt; }
      else { q.vx *= 0.94; q.vy *= 0.94; }
    }
    R.fx = R.fx.filter(q => q.life > 0);
  }

  RC.Run = { buildLevel, createRun, stepRun, speedOf };
})(RC);
