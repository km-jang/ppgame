'use strict';
// 놀이터 모드 규칙: 위에서 내려다보는 공원을 손가락 하나로 돌아다닌다. DOM 없음 → node 테스트에서 그대로 돌린다.
// 원칙: 지는 일이 없다. 연못·나무·분수에 닿으면 미끄러지듯 비켜 가고(멈춰 서지 않음),
// 미션을 못 끝내도 150초가 지나면 도착 문이 나오고, 그래도 안 가면 문이 차 쪽으로 천천히 다가온다.
(function (RC) {
  const D = RC.DATA;
  const TAU = Math.PI * 2;

  // 놀이터 수치 (논리 좌표: 화면 높이 600 기준. 공원은 가로 약 3화면 · 세로 2.2화면)
  const PK = {
    W: 3000, H: 1320, viewH: 600,
    step: 1 / 120,          // 규칙은 항상 이 간격 (60·90·120Hz 화면에서 같은 움직임)
    carR: 26,               // 차 부딪힘 반지름
    speed: 320,             // 최고 속도 (바퀴 speed 배율을 곱한다)
    accel: 520, brake: 900, coast: 620,   // 빨라지기 · 목표 앞에서 줄이기 · 손 떼면 멈추기
    turn: 3.6,              // 초당 최대 회전 (라디안)
    tapTime: 0.25,          // 이보다 짧게 누르면 "톡": 거기까지 가서 선다
    arrive: 20,
    starR: 60, magnetR: 125, magnetV: 520,
    friendSee: 300, friendR: 74,
    balloonR: 66,
    padR: 58, boostT: 1.1, boostMul: 1.55,
    splashR: 196,
    gateAfter: 150,         // 이만큼 놀면 미션과 상관없이 도착 문이 나온다
    gateR: 90, gateWait: 20, gateDrift: 70,
    wagonGap: 64,
    look: 0.45,             // 카메라가 앞을 내다보는 시간(초)
  };

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

  // 점과 선분 사이 거리
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, l = vx * vx + vy * vy;
    const t = l ? clamp(((px - ax) * vx + (py - ay) * vy) / l, 0, 1) : 0;
    return Math.hypot(px - ax - vx * t, py - ay - vy * t);
  }
  function pathDist(L, x, y) {
    let m = 1e9;
    for (const p of L.paths) for (let i = 1; i < p.length; i++) m = Math.min(m, segDist(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]));
    return m;
  }

  // 둥근 사각형 산책로 (모서리는 호로 잘게 나눈다)
  function loopPath(x0, y0, x1, y1, r) {
    const pts = [];
    const corner = (cx, cy, a0) => { for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    corner(x1 - r, y0 + r, -Math.PI / 2);
    corner(x1 - r, y1 - r, 0);
    corner(x0 + r, y1 - r, Math.PI / 2);
    corner(x0 + r, y0 + r, Math.PI);
    pts.push(pts[0].slice());
    return pts;
  }

  // ─── 공원 만들기 ──────────────────────────────────────────
  function buildPark(seed) {
    const rand = RC.rng(seed);
    const J = k => (rand() - 0.5) * 2 * k;
    const W = PK.W, H = PK.H;
    const L = {
      W, H, paths: [], obst: [], beds: [], trees: [], bushes: [], benches: [], pads: [],
      stars: [], balloons: [], friends: [],
    };
    // 산책로: 큰 고리 + 가로·세로 십자 길 (한가운데 분수 광장에서 만난다)
    const lx0 = 260, ly0 = 230, lx1 = 2740, ly1 = 1090;
    L.loop = { x0: lx0, y0: ly0, x1: lx1, y1: ly1, r: 160 };
    L.paths.push(loopPath(lx0, ly0, lx1, ly1, 160));
    L.paths.push([[lx0, 660], [lx1, 660]]);
    L.paths.push([[1500, ly0], [1500, ly1]]);
    L.pathW = 64;

    // 큰 것들 (자리는 고정, 조금씩만 흔든다)
    L.plaza = { x: 1500, y: 660, r: 220 };
    L.fountain = { x: 1500, y: 660, r: 100 };
    L.sandbox = { x: 850 + J(20), y: 880 + J(10), w: 330, h: 200 };
    L.pond = { x: 2140 + J(20), y: 880 + J(8), rx: 235, ry: 128 };
    L.slide = { x: 2130 + J(20), y: 430 + J(10) };
    L.garden = { x: 850 + J(20), y: 445, r: 92 };
    L.obst.push({ kind: 'c', x: L.fountain.x, y: L.fountain.y, r: L.fountain.r });
    L.obst.push({ kind: 'c', x: L.garden.x, y: L.garden.y, r: L.garden.r });
    L.obst.push({ kind: 'e', x: L.pond.x, y: L.pond.y, rx: L.pond.rx, ry: L.pond.ry });
    for (const dx of [-70, 0, 70]) L.obst.push({ kind: 'c', x: L.slide.x + dx, y: L.slide.y, r: 34 });

    // 작은 꽃밭 (꾸밈, 부딪힘 없음)
    for (const [x, y, r] of [[470, 430, 48], [1250, 470, 44], [1180, 910, 42], [1830, 460, 40], [2560, 440, 46], [470, 900, 44]]) L.beds.push({ x: x + J(12), y: y + J(12), r });

    // 벤치: 길가에 (부딪히면 미끄러짐)
    for (const [x, y, a] of [[1000, 302, 0], [2000, 158, 0], [1000, 1018, 0], [1760, 1162, 0], [332, 560, Math.PI / 2], [2668, 780, Math.PI / 2]]) {
      L.benches.push({ x, y, a });
      L.obst.push({ kind: 'c', x, y, r: 24 });
    }

    // 부스터 발판 (가로 길 위, 달리는 방향 화살표)
    L.pads.push({ x: 640, y: 660, a: 0, cd: 0 });
    L.pads.push({ x: 2360, y: 660, a: Math.PI, cd: 0 });

    // ─── 별: 길을 따라 줄·원으로 ───
    const star = (x, y) => L.stars.push({ x, y, got: false });
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + 0.3; star(L.plaza.x + Math.cos(a) * 168, L.plaza.y + Math.sin(a) * 168); }
    for (let k = 0; k < 6; k++) star(520 + k * 95, ly0);
    for (let k = 0; k < 6; k++) star(1780 + k * 95, ly1);
    for (let k = 0; k < 6; k++) star(lx0, 400 + k * 75 + (k > 2 ? 60 : 0));
    for (let k = 0; k < 6; k++) star(lx1, 420 + k * 75 + (k > 2 ? 60 : 0));
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; star(L.garden.x + Math.cos(a) * 150, L.garden.y + Math.sin(a) * 150); }
    // 모래밭 물결 줄
    for (let k = 0; k < 5; k++) star(L.sandbox.x - 120 + k * 60, L.sandbox.y + Math.sin(k * 1.4) * 45);
    // 연못 둘레 (위쪽 반원)
    for (let k = 0; k < 7; k++) { const a = Math.PI + 0.25 + k / 6 * (Math.PI - 0.5); star(L.pond.x + Math.cos(a) * (L.pond.rx + 70), L.pond.y + Math.sin(a) * (L.pond.ry + 62)); }
    // 세로 길 위쪽 · 가로 길 오른쪽
    for (let k = 0; k < 5; k++) star(1500, 300 + k * 58);
    for (let k = 0; k < 5; k++) star(1800 + k * 70, 660);
    // 미끄럼틀 둘레 호
    for (let k = 0; k < 5; k++) { const a = Math.PI * 0.15 + k / 4 * Math.PI * 0.7; star(L.slide.x + Math.cos(a) * 150, L.slide.y + Math.sin(a) * 110); }

    // ─── 풍선: 후보 자리 8곳 중 7곳 ───
    const bcols = ['#ff4d6d', '#ffd23a', '#39d8ff', '#a855f7', '#3aff9a', '#ff8a1a'];
    const bspots = [[560, 560], [1240, 340], [1860, 330], [2470, 560], [620, 1200], [1180, 780], [2420, 1200], [2880, 660]];
    const skip = Math.floor(rand() * bspots.length);
    bspots.forEach(([x, y], i) => { if (i !== skip) L.balloons.push({ x: x + J(25), y: y + J(20), color: bcols[L.balloons.length % bcols.length], popped: false, ph: rand() * TAU }); });

    // ─── 친구 3명: 하나는 모래밭 속, 둘은 덤불 뒤 ───
    const kinds = D.FRIENDS.map(f => f.id);
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
    const hide = [[150, 1200], [2860, 130], [2860, 1200], [150, 130], [1500, 1225]];
    for (let i = hide.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = hide[i]; hide[i] = hide[j]; hide[j] = t; }
    L.friends.push({ kind: kinds[0], where: 'sand', hx: L.sandbox.x + 100, hy: L.sandbox.y + 58, x: L.sandbox.x + 100, y: L.sandbox.y + 58, state: 'hide', t: 0 });
    for (let i = 0; i < 2; i++) {
      const [bx, by] = hide[i];
      const dx = 1500 - bx, dy = 660 - by, n = Math.hypot(dx, dy);
      L.friends.push({ kind: kinds[i + 1], where: 'bush', hx: bx, hy: by, x: bx + dx / n * 62, y: by + dy / n * 62, state: 'hide', t: 0 });
      L.bushes.push({ x: bx, y: by, r: 44, v: 0, hide: true });
    }

    // 모든 모을 것이 벽 안에 들어가지 않게 살짝 밀어 낸다
    for (const s of L.stars) pushOut(L, s, 14);
    for (const b of L.balloons) pushOut(L, b, 14);

    // ─── 나무: 길·큰 것·모을 것과 떨어진 곳에 (사이로 차가 넉넉히 지나가게 간격 170) ───
    const keep = [].concat(L.stars, L.balloons, L.friends.map(f => ({ x: f.x, y: f.y })), L.friends.map(f => ({ x: f.hx, y: f.hy })), L.pads);
    const okSpot = (x, y, rr) => {
      // 울타리와 나무 사이에 차가 끼지 않게 넉넉히 띄운다
      if (x < 150 || y < 150 || x > W - 150 || y > H - 150) return false;
      if (pathDist(L, x, y) < rr + 62) return false;
      if (Math.hypot(x - L.plaza.x, y - L.plaza.y) < L.plaza.r + rr + 40) return false;
      const sb = L.sandbox;
      if (Math.abs(x - sb.x) < sb.w / 2 + rr + 50 && Math.abs(y - sb.y) < sb.h / 2 + rr + 50) return false;
      for (const o of L.obst) if (colDist(o, x, y) < rr + 70) return false;
      for (const k of keep) if (d2(k.x, k.y, x, y) < (rr + 70) * (rr + 70)) return false;
      for (const b of L.beds) if (d2(b.x, b.y, x, y) < (b.r + rr + 20) * (b.r + rr + 20)) return false;
      return true;
    };
    for (let n = 0; n < 900 && L.trees.length < 36; n++) {
      const x = 70 + rand() * (W - 140), y = 70 + rand() * (H - 140);
      if (!okSpot(x, y, 34)) continue;
      if (L.trees.some(t => d2(t.x, t.y, x, y) < 170 * 170)) continue;
      const t = { x, y, r: 34, s: 0.85 + rand() * 0.35, v: Math.floor(rand() * 3), ph: rand() * TAU };
      L.trees.push(t);
      L.obst.push({ kind: 'c', x, y, r: 34, tree: true });
    }
    // 덤불 (꾸밈: 부딪힘 없이 스치면 흔들린다)
    for (let n = 0; n < 600 && L.bushes.length < 22; n++) {
      const x = 60 + rand() * (W - 120), y = 60 + rand() * (H - 120);
      if (pathDist(L, x, y) < 80) continue;
      if (L.obst.some(o => colDist(o, x, y) < 40)) continue;
      if (Math.hypot(x - L.plaza.x, y - L.plaza.y) < L.plaza.r + 40) continue;
      if (L.bushes.some(b => d2(b.x, b.y, x, y) < 120 * 120)) continue;
      L.bushes.push({ x, y, r: 26 + rand() * 12, v: 0, hide: false });
    }
    return L;
  }

  // 부딪힘 도형 가장자리까지 거리 (안쪽이면 음수)
  function colDist(o, x, y) {
    if (o.kind === 'c') return Math.hypot(x - o.x, y - o.y) - o.r;
    const u = (x - o.x) / o.rx, w = (y - o.y) / o.ry, q = Math.hypot(u, w);
    return (q - 1) * Math.min(o.rx, o.ry);
  }
  function pushOut(L, p, pad) {
    for (const o of L.obst) {
      if (o.kind === 'c') {
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1, m = o.r + PK.carR + pad;
        if (d < m) { p.x = o.x + dx / d * m; p.y = o.y + dy / d * m; }
      } else {
        const ax = o.rx + PK.carR + pad, ay = o.ry + PK.carR + pad;
        const u = (p.x - o.x) / ax, w = (p.y - o.y) / ay, q = Math.hypot(u, w) || 1;
        if (q < 1) { p.x = o.x + u / q * ax; p.y = o.y + w / q * ay; }
      }
    }
  }

  // ─── 시작 ────────────────────────────────────────────────
  // cfg: {body, wheel, gear, color}
  function create(cfg, seed) {
    cfg = Object.assign({}, cfg || {});
    const body = RC.find(D.BODIES, cfg.body), wheel = RC.find(D.WHEELS, cfg.wheel), gear = RC.find(D.GEAR, cfg.gear);
    const L = buildPark(seed == null ? 7 : seed);
    const P = {
      mode: 'park', cfg, body, wheel, gear, park: L, seed: seed == null ? 7 : seed,
      course: { id: 'park', name: '놀이터' },
      t: 0, done: false, doneT: 0, acc: 0, alpha: 0,
      car: { x: 1150, y: 660, a: 0, v: 0, px: 1150, py: 660, pa: 0, boost: 0, slideS: 1, hit: 0, detour: 0, prog: 0, bestD: 1e9, goalRef: null, onPath: true, odo: 0, still: 0 },
      goal: null, holding: false, holdT: 0, vw: 1000,
      cam: { x: 0, y: 0, px: 0, py: 0 },
      stars: 0, totalStars: L.stars.length, saved: 0, popped: 0, airBonus: 0, smashed: 0, transforms: 0,
      riders: [], followers: [], trail: [], flying: [],
      boosts: 0, splashes: 0, splashT: 0, splashCd: 0, inSplash: false,
      gate: null, lastStar: null, lastFriend: null, lastMission: null,
      missions: [
        { id: 'friends',  label: '친구 3명 찾기', got: 0, need: 3, done: false },
        { id: 'stars',    label: '별 40개',       got: 0, need: 40, done: false },
        { id: 'balloons', label: '풍선 5개',      got: 0, need: 5, done: false },
      ],
      events: [],
    };
    P.maxV = PK.speed * wheel.speed;
    camSnap(P);
    return P;
  }

  // 화면 좌표(보이는 vw × 600 안) → 공원 좌표
  function toWorld(P, sx, sy) {
    return { x: clamp(P.cam.x + sx, PK.carR + 12, PK.W - PK.carR - 12), y: clamp(P.cam.y + sy, PK.carR + 12, PK.H - PK.carR - 12) };
  }
  // 목표가 연못·나무 안이면 가장자리 바깥으로 옮긴다 (거기서 멈춰 서게)
  function fixGoal(P, g) { pushOut(P.park, g, 4); return g; }

  function camTarget(P) {
    const c = P.car, vw = P.vw;
    let x = c.x + Math.cos(c.a) * c.v * PK.look - vw / 2;
    let y = c.y + Math.sin(c.a) * c.v * PK.look - PK.viewH / 2;
    x = vw >= PK.W ? (PK.W - vw) / 2 : clamp(x, 0, PK.W - vw);
    y = PK.viewH >= PK.H ? (PK.H - PK.viewH) / 2 : clamp(y, 0, PK.H - PK.viewH);
    return { x, y };
  }
  function camSnap(P) { const t = camTarget(P); P.cam.x = P.cam.px = t.x; P.cam.y = P.cam.py = t.y; }

  // ─── 한 프레임 ────────────────────────────────────────────
  // input: { hold, tx, ty, tap, vw }  tx·ty = 화면 논리 좌표. tap은 선택(짧게 누른 것을 따로 알려 줄 때)
  function step(P, input, dt) {
    input = input || {};
    if (input.vw > 0 && Math.abs(input.vw - P.vw) > 0.5) { P.vw = input.vw; }
    if (input.tap && input.tx != null) P.pendTap = { x: input.tx, y: input.ty };
    P.acc = Math.min(0.1, P.acc + (dt > 0 ? dt : 0));
    while (P.acc >= PK.step - 1e-9) {
      P.acc -= PK.step;
      const c = P.car;
      c.px = c.x; c.py = c.y; c.pa = c.a;
      P.cam.px = P.cam.x; P.cam.py = P.cam.y;
      tick(P, input, PK.step);
      P.pendTap = null;
    }
    P.alpha = P.acc / PK.step;
  }

  function ev(P, name) { P.events.push(name); }

  function tick(P, inp, dt) {
    const L = P.park, c = P.car;
    P.t += dt;
    if (P.done) P.doneT += dt;

    // ─── 손가락 → 목표 ───
    if (!P.done) {
      if (inp.hold && inp.tx != null) {
        if (!P.holding) { P.holding = true; P.holdT = 0; }
        P.holdT += dt;
        P.goal = fixGoal(P, toWorld(P, inp.tx, inp.ty));
      } else if (P.holding) {
        P.holding = false;
        // 오래 누르다 떼면 부드럽게 멈춘다. 짧게 톡 눌렀으면 그 자리까지 가서 선다
        if (P.holdT > PK.tapTime) P.goal = null;
      }
      if (P.pendTap) P.goal = fixGoal(P, toWorld(P, P.pendTap.x, P.pendTap.y));
    } else { P.goal = null; P.holding = false; }

    // ─── 운전 ───
    c.boost = Math.max(0, c.boost - dt);
    const maxV = P.maxV * (c.boost > 0 ? PK.boostMul : 1);
    let want = 0, toGx = 0, toGy = 0;
    c.detour = Math.max(0, c.detour - dt);
    // 목표가 크게 바뀌면 "가까워지는 중인가" 기록을 새로 시작한다
    if (!P.goal) c.goalRef = null;
    else if (!c.goalRef || d2(P.goal.x, P.goal.y, c.goalRef.x, c.goalRef.y) > 80 * 80) { c.goalRef = { x: P.goal.x, y: P.goal.y }; c.bestD = 1e9; c.prog = 0; }
    if (P.goal) {
      const dx = P.goal.x - c.x, dy = P.goal.y - c.y, dist = Math.hypot(dx, dy);
      if (dist < PK.arrive && !P.holding) P.goal = null;
      else if (dist > 4) {
        toGx = dx / dist; toGy = dy / dist;
        // 가까워지지 않은 채 2초가 지나면 (나무와 울타리 사이 같은 곳) 옆으로 1초 돌아 나온다
        if (dist < c.bestD - 20) { c.bestD = dist; c.prog = 0; } else c.prog += dt;
        let aim = Math.atan2(dy, dx);
        if (c.prog > 2) { c.prog = 0; c.bestD = dist; c.detour = 1; c.slideS = -c.slideS; }
        if (c.detour > 0) aim += c.slideS * Math.PI * 0.6;
        const da = wrap(aim - c.a);
        const mt = PK.turn * dt;
        c.a = wrap(c.a + clamp(da, -mt, mt));
        // 뒤쪽을 가리키면 천천히 돌면서 간다 · 목표 앞에서는 미리 줄인다
        const face = 0.35 + 0.65 * Math.max(0, Math.cos(da));
        want = Math.min(maxV * face, Math.sqrt(2 * PK.brake * Math.max(0, dist - 6)) + 20);
        if (dist < 30) want = Math.min(want, dist * 3);
      }
    } else if (c.boost > 0 && !P.done) want = 0;
    if (want > c.v) c.v = Math.min(want, c.v + PK.accel * dt * (c.boost > 0 ? 2.5 : 1));
    else c.v = Math.max(want, c.v - (P.goal ? PK.brake : PK.coast) * dt);

    // ─── 움직이고 부딪힘 처리 (미끄러지듯 비켜 가기) ───
    c.x += Math.cos(c.a) * c.v * dt;
    c.y += Math.sin(c.a) * c.v * dt;
    collide(P, toGx, toGy);
    c.hit = Math.max(0, c.hit - dt);

    // 혹시 꽉 끼면 (거의 없음) 옆으로 방향을 틀어 빠져나온다
    const moved = Math.hypot(c.x - c.px, c.y - c.py);
    c.odo += moved;
    if (want > 40 && moved < 0.05) { c.still += dt; if (c.still > 0.8) { c.a = wrap(c.a + Math.PI / 2 * c.slideS); c.still = 0; } } else c.still = 0;

    c.onPath = pathDist(L, c.x, c.y) < L.pathW / 2 + 6 || Math.hypot(c.x - L.plaza.x, c.y - L.plaza.y) < L.plaza.r;

    // 기차: 차가 지나간 자리를 기억해 친구 수레가 그 길을 따라온다
    const tr = P.trail;
    if (!tr.length || d2(tr[0].x, tr[0].y, c.x, c.y) > 36) { tr.unshift({ x: c.x, y: c.y }); if (tr.length > 90) tr.pop(); }
    for (let i = 0; i < P.followers.length; i++) {
      const f = P.followers[i], slot = trailAt(P, PK.wagonGap * (i + 1));
      const k = Math.min(1, dt * (f.in < 1 ? 5 : 14));
      f.in = Math.min(1, f.in + dt * 1.6);
      const nx = f.x + (slot.x - f.x) * k, ny = f.y + (slot.y - f.y) * k;
      if (d2(nx, ny, f.x, f.y) > 0.25) f.a = Math.atan2(ny - f.y, nx - f.x);
      f.x = nx; f.y = ny;
    }

    // ─── 부스터 · 분수 ───
    for (const p of L.pads) {
      p.cd = Math.max(0, p.cd - dt);
      if (p.cd <= 0 && !P.done && d2(p.x, p.y, c.x, c.y) < PK.padR * PK.padR) {
        p.cd = 1.4; c.boost = PK.boostT; c.v = Math.max(c.v, P.maxV * 1.2); P.boosts++; ev(P, 'boost');
      }
    }
    P.splashCd = Math.max(0, P.splashCd - dt); P.splashT = Math.max(0, P.splashT - dt);
    const inS = Math.hypot(c.x - L.fountain.x, c.y - L.fountain.y) < PK.splashR;
    if (inS && !P.inSplash && P.splashCd <= 0) { P.splashCd = 2; P.splashT = 0.8; P.splashes++; ev(P, 'splash'); }
    P.inSplash = inS;

    // ─── 별 ───
    for (const s of L.stars) {
      if (s.got) continue;
      const q = d2(s.x, s.y, c.x, c.y);
      if (q < PK.starR * PK.starR) { s.got = true; takeStar(P, s.x, s.y); continue; }
      // 가까우면 차 쪽으로 쏙 끌려온다 (넉넉하게). 차가 멀어지면 제자리로 돌아가 줄 모양이 흐트러지지 않는다
      if (s.hx == null) { s.hx = s.x; s.hy = s.y; }
      if (d2(s.hx, s.hy, c.x, c.y) < PK.magnetR * PK.magnetR) { const d = Math.sqrt(q), m = Math.min(d, PK.magnetV * dt); s.x += (c.x - s.x) / d * m; s.y += (c.y - s.y) / d * m; }
      else if (s.x !== s.hx || s.y !== s.hy) { const dx = s.hx - s.x, dy = s.hy - s.y, d = Math.hypot(dx, dy), m = Math.min(d, 300 * dt); if (d < 0.5) { s.x = s.hx; s.y = s.hy; } else { s.x += dx / d * m; s.y += dy / d * m; } }
    }
    // 풍선에서 쏟아진 별: 잠깐 튀었다가 차로 날아온다
    for (const s of P.flying) {
      if (s.got) continue;
      s.t += dt;
      if (s.t < 0.3) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - dt * 4; s.vy *= 1 - dt * 4; }
      else {
        const dx = c.x - s.x, dy = c.y - s.y, d = Math.hypot(dx, dy) || 1, m = Math.min(d, (380 + s.t * 900) * dt);
        s.x += dx / d * m; s.y += dy / d * m;
      }
      if (d2(s.x, s.y, c.x, c.y) < 30 * 30) { s.got = true; takeStar(P, s.x, s.y); }
    }
    if (P.flying.length > 24 && P.flying.every(s => s.got)) P.flying.length = 0;

    // ─── 풍선 ───
    for (const b of L.balloons) {
      if (b.popped || P.done) continue;
      if (d2(b.x, b.y, c.x, c.y) < PK.balloonR * PK.balloonR) {
        b.popped = true; P.popped++; ev(P, 'balloon');
        for (let k = 0; k < 2; k++) {
          const a = c.a + (k ? 1 : -1) * 1.9;
          P.flying.push({ x: b.x, y: b.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, t: 0, got: false });
          P.totalStars++;
        }
      }
    }

    // ─── 친구 ───
    for (const f of L.friends) {
      f.t += dt;
      if (f.state === 'hide' && d2(f.x, f.y, c.x, c.y) < PK.friendSee * PK.friendSee) { f.state = 'out'; f.t = 0; ev(P, 'peek'); }
      if (f.state === 'out' && f.t > 0.15 && !P.done && d2(f.x, f.y, c.x, c.y) < PK.friendR * PK.friendR) {
        f.state = 'saved'; f.t = 0; P.saved++; P.riders.push(f.kind);
        P.followers.push({ kind: f.kind, x: f.x, y: f.y, a: c.a, in: 0 });
        P.lastFriend = { kind: f.kind };
        ev(P, 'rescue');
      }
    }
    for (const b of L.bushes) {
      b.v = Math.max(0, b.v - dt * 2);
      if (d2(b.x, b.y, c.x, c.y) < (b.r + PK.carR) * (b.r + PK.carR) && c.v > 60) b.v = 1;
    }

    // ─── 미션 ───
    const val = { friends: P.saved, stars: P.stars, balloons: P.popped };
    let all = true;
    for (const m of P.missions) {
      m.got = Math.min(m.need, val[m.id]);
      if (!m.done && m.got >= m.need) { m.done = true; P.lastMission = m.label; ev(P, 'mission'); }
      if (!m.done) all = false;
    }
    P.allDone = all;

    // ─── 도착 문 ───
    if (!P.gate && (all || P.t >= PK.gateAfter)) spawnGate(P);
    const g = P.gate;
    if (g) {
      g.t += dt;
      if (!P.done) {
        // 오래 안 오면 문이 차 쪽으로 천천히 다가온다 (언제나 끝난다)
        if (g.t > PK.gateWait) {
          const dx = c.x - g.x, dy = c.y - g.y, d = Math.hypot(dx, dy) || 1, m = Math.min(d, PK.gateDrift * dt);
          g.x += dx / d * m; g.y += dy / d * m;
        }
        if (d2(g.x, g.y, c.x, c.y) < PK.gateR * PK.gateR) { P.done = true; P.doneT = 0; P.goal = null; ev(P, 'finish'); }
      }
    }

    // ─── 카메라 (앞을 조금 내다보며 부드럽게) ───
    const ct = camTarget(P), ck = 1 - Math.exp(-dt * 4);
    P.cam.x += (ct.x - P.cam.x) * ck; P.cam.y += (ct.y - P.cam.y) * ck;
    if (P.vw < PK.W) P.cam.x = clamp(P.cam.x, 0, PK.W - P.vw); else P.cam.x = (PK.W - P.vw) / 2;
    P.cam.y = clamp(P.cam.y, 0, PK.H - PK.viewH);
  }

  function takeStar(P, x, y) { P.stars++; P.lastStar = { x, y }; ev(P, 'star'); }

  // 기차 자리: 차가 지나온 길을 따라 거리 d만큼 뒤
  function trailAt(P, d) {
    const tr = P.trail, c = P.car;
    let px = c.x, py = c.y, acc = 0;
    for (let i = 0; i < tr.length; i++) {
      const seg = Math.hypot(tr[i].x - px, tr[i].y - py);
      if (acc + seg >= d && seg > 0) { const k = (d - acc) / seg; return { x: px + (tr[i].x - px) * k, y: py + (tr[i].y - py) * k }; }
      acc += seg; px = tr[i].x; py = tr[i].y;
    }
    return { x: px - Math.cos(c.a) * (d - acc), y: py - Math.sin(c.a) * (d - acc) };
  }

  function collide(P, gx, gy) {
    const L = P.park, c = P.car, R = PK.carR;
    for (let pass = 0; pass < 2; pass++) {
      let nx = 0, ny = 0, hit = false;
      for (const o of L.obst) {
        if (o.kind === 'c') {
          const dx = c.x - o.x, dy = c.y - o.y, m = o.r + R;
          if (Math.abs(dx) > m || Math.abs(dy) > m) continue;
          const d = Math.hypot(dx, dy);
          if (d < m) {
            const ux = d > 1e-6 ? dx / d : Math.cos(c.a + Math.PI), uy = d > 1e-6 ? dy / d : Math.sin(c.a + Math.PI);
            c.x = o.x + ux * m; c.y = o.y + uy * m; nx += ux; ny += uy; hit = true;
          }
        } else {
          const ax = o.rx + R, ay = o.ry + R;
          const u = (c.x - o.x) / ax, w = (c.y - o.y) / ay, q = Math.hypot(u, w);
          if (q < 1) {
            const k = q > 1e-6 ? 1 / q : 1;
            c.x = o.x + (q > 1e-6 ? u : 1) * k * ax; c.y = o.y + (q > 1e-6 ? w : 0) * k * ay;
            // 타원 가장자리의 바깥 방향
            let ex = (c.x - o.x) / (ax * ax), ey = (c.y - o.y) / (ay * ay); const el = Math.hypot(ex, ey) || 1;
            nx += ex / el; ny += ey / el; hit = true;
          }
        }
      }
      // 공원 울타리
      const lo = R + 10;
      if (c.x < lo) { c.x = lo; nx += 1; hit = true; } else if (c.x > PK.W - lo) { c.x = PK.W - lo; nx -= 1; hit = true; }
      if (c.y < lo) { c.y = lo; ny += 1; hit = true; } else if (c.y > PK.H - lo) { c.y = PK.H - lo; ny -= 1; hit = true; }
      if (!hit) return;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-6) return;
      nx /= nl; ny /= nl;
      const hx = Math.cos(c.a), hy = Math.sin(c.a), into = hx * nx + hy * ny;
      if (into < 0) {
        // 벽을 따라 미끄러진다: 방향을 가장자리 쪽으로 돌리고 속도는 조금만 줄인다
        const tx = -ny, ty = nx;
        const pref = gx * tx + gy * ty;
        if (Math.abs(pref) > 0.2) c.slideS = pref > 0 ? 1 : -1;
        else if (Math.abs(hx * tx + hy * ty) > 0.2 && !(gx || gy)) c.slideS = hx * tx + hy * ty > 0 ? 1 : -1;
        let sx = hx - nx * into, sy = hy - ny * into;
        if (Math.hypot(sx, sy) < 0.3 || (sx * tx + sy * ty) * c.slideS < 0) { sx = tx * c.slideS; sy = ty * c.slideS; }
        c.a = Math.atan2(sy, sx);
        c.v *= 1 - Math.min(0.5, -into * 0.35);
        if (-into > 0.5 && c.hit <= 0) c.hit = 0.3;
      }
    }
  }

  // 도착 문: 차 앞쪽 빈 자리에 나온다
  function spawnGate(P) {
    const c = P.car, L = P.park;
    const tries = [];
    for (const dist of [340, 280, 420, 240]) for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) tries.push([dist, da]);
    let best = null;
    for (const [dist, da] of tries) {
      const a = c.a + da, x = c.x + Math.cos(a) * dist, y = c.y + Math.sin(a) * dist;
      if (x < 120 || y < 120 || x > PK.W - 120 || y > PK.H - 120) continue;
      if (L.obst.some(o => colDist(o, x, y) < 80)) continue;
      best = { x, y, a: a + Math.PI / 2 }; break;
    }
    if (!best) {
      // 빈 자리가 없으면 광장 쪽으로
      const dx = L.plaza.x - c.x, dy = L.plaza.y - c.y, d = Math.hypot(dx, dy) || 1;
      best = { x: c.x + dx / d * Math.min(300, d), y: c.y + dy / d * Math.min(300, d), a: Math.atan2(dy, dx) + Math.PI / 2 };
      pushOut(L, best, 30);
    }
    P.gate = { x: best.x, y: best.y, a: best.a, t: 0, early: !P.allDone };
    ev(P, 'gate');
  }

  RC.Park = { create, step, buildPark, PK, toWorld, colDist };
})(RC);
