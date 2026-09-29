'use strict';
// 슥슥 우주 다리 규칙. DOM·canvas를 쓰지 않는다 (node 테스트가 vm으로 그대로 불러 돌린다: tests/bridge.test.js).
// 움직임 계산은 Planck.js(Box2D를 자바스크립트로 옮긴 무료 공개 물리 엔진, MIT, lib/planck.min.js)가 맡는다.
//
// 좌표: 판 하나는 논리 크기 1280×800 (y는 아래로). 물리 엔진 안에서는 PHYS.scale(px)로 나눈 미터를 쓴다.
// 흐름
//   ready : 판이 막 열렸다. 공·물건이 멈춰 있다. 아이가 첫 선을 다 그리고 손을 떼면 run
//   run   : 물리가 1/60초 고정 간격으로 돈다 (화면 주사율과 상관없이 같은 결과). 그리는 동안에도 계속 돈다
//   win   : 공이 외계인 친구에게 닿았다 (별 1 ~ 3개, 잉크를 적게 쓸수록 많이)
//   fall  : 공이 화면 밖으로 떨어졌다. 화면이 잠깐 보여 주고 reset으로 처음부터 (지는 일 없음, 기록도 안 깎임)
// 그린 선: 손가락 자국을 PHYS.step 간격 점으로 모아, 손을 떼면 그 모양 그대로 한 덩어리(몸체 하나, 네모 조각 + 둥근 이음매)가 된다.
// 벽·땅·공 속으로는 그려지지 않는다 (그 구간을 건너뛰고, 손가락이 빈 곳으로 돌아오면 이어서 그린다).
// 톡 누르기만 하면 작은 구슬(dot)이 생긴다.
(function (BR) {
  const D = BR.DATA;
  const PH = D.PHYS;
  const S = PH.scale;
  const DT = 1 / 60;
  const lib = () => (typeof planck !== 'undefined' ? planck : BR.planck);
  const V = (x, y) => new (lib().Vec2)(x / S, y / S);

  // ─── 판 만들기 ─────────────────────────────────────────────
  function create(level, opts) {
    const L = typeof level === 'string' ? D.levelById(level) : level;
    if (!L) throw new Error('없는 판: ' + level);
    opts = opts || {};
    const W = {
      level: L, char: opts.char || 'roll', phase: 'ready', t: 0, runT: 0, acc: 0, steps: 0,
      strokes: [],          // 그린 선 (판 좌표 점 목록, 그린 모양 그대로) · 몸체는 W.lines[i]
      lines: [], drawing: null,
      ink: { max: L.ink, used: 0 },
      events: [], stats: { lines: 0, dots: 0, undos: 0, falls: 0, springs: 0, seesaw: 0 },
      stars: 0, stuck: false, stillT: 0, springCd: 0, win: null, onSeesaw: false,
    };
    build(W);
    return W;
  }

  // 판 모양으로 물리 세계를 새로 만든다 (처음·다시 하기·떨어진 뒤)
  function build(W) {
    const pl = lib(), L = W.level;
    const w = new pl.World({ gravity: new pl.Vec2(0, PH.gravity) });
    W.pl = w;
    W.lines = []; W.strokes = []; W.drawing = null;
    W.ink.used = 0;
    W.phase = 'ready'; W.runT = 0; W.acc = 0; W.steps = 0; W.stuck = false; W.stillT = 0; W.win = null; W.onSeesaw = false;
    W.pending = [];
    // 땅: 윗면 점 목록을 화면 아래까지 닫은 모양. 속이 빈 테두리(chain)라 볼록하지 않아도 된다
    W.ground = [];
    for (const g of L.ground) {
      const poly = groundPoly(g);
      const b = w.createBody({ type: 'static' });
      b.createFixture(new pl.Chain(poly.map(p => V(p[0], p[1])), true), { friction: g.ice ? PH.iceFriction : PH.groundFriction, restitution: 0.05 });
      b.setUserData({ kind: 'ground', ice: !!g.ice });
      W.ground.push({ poly, ice: !!g.ice, top: g.top });
    }
    // 바위: 움직이지 않는 동그라미
    for (const r of L.rocks || []) {
      const b = w.createBody({ type: 'static', position: V(r[0], r[1]) });
      b.createFixture(new pl.Circle(r[2] / S), { friction: PH.groundFriction });
      b.setUserData({ kind: 'rock', r: r[2] });
    }
    // 상자: 밀리고 떨어진다
    W.boxes = (L.boxes || []).map(o => {
      const b = w.createBody({ type: 'dynamic', position: V(o.x, o.y), angle: o.a || 0 });
      b.createFixture(new pl.Box(o.w / 2 / S, o.h / 2 / S), { density: PH.boxDensity, friction: 0.6, restitution: 0.05 });
      b.setUserData({ kind: 'box', w: o.w, h: o.h });
      return b;
    });
    // 시소: 가운데 받침(움직이지 않음)에 판자 하나가 돌쪽으로 이어져 있다
    W.seesaws = (L.seesaws || []).map(o => {
      // shift: 판자 가운데가 받침에서 얼마나 떨어져 있나 (공 쪽 팔을 길게 하면 공이 더 빨리 튀어 오른다)
      const sh = o.shift || 0, a0 = o.a || 0;
      const base = w.createBody({ type: 'static', position: V(o.x, o.y) });
      const plank = w.createBody({ type: 'dynamic', position: V(o.x + sh * Math.cos(a0), o.y + sh * Math.sin(a0)), angle: a0 });
      plank.createFixture(new pl.Box(o.w / 2 / S, PH.plankHalf / S), { density: PH.plankDensity, friction: 0.8, restitution: 0 });
      plank.setUserData({ kind: 'seesaw', w: o.w });
      w.createJoint(new pl.RevoluteJoint({ enableLimit: true, lowerAngle: -PH.seesawLimit, upperAngle: PH.seesawLimit }, base, plank, V(o.x, o.y)));
      return { plank, x: o.x, y: o.y, w: o.w, shift: sh };
    });
    // 스프링: 공이 닿으면 위로 튕겨 올린다 (power px/초, kick 옆으로)
    W.springs = (L.springs || []).map(o => {
      const b = w.createBody({ type: 'static', position: V(o.x, o.y) });
      b.createFixture(new pl.Box(o.w / 2 / S, 10 / S), { friction: 0.6 });
      b.setUserData({ kind: 'spring', o });
      return { body: b, o, squash: 0 };
    });
    // 공
    const ball = w.createBody({ type: 'dynamic', position: V(L.ball[0], L.ball[1]), bullet: true, angularDamping: 0.05 });
    ball.createFixture(new pl.Circle(PH.ballR / S), { density: PH.ballDensity, friction: PH.ballFriction, restitution: PH.ballBounce });
    ball.setUserData({ kind: 'ball' });
    W.ball = ball;
    // 닿음 알림: 스프링, 소리 (쿵·통)
    w.on('begin-contact', c => {
      const a = c.getFixtureA().getBody(), b = c.getFixtureB().getBody();
      const ua = a.getUserData() || {}, ub = b.getUserData() || {};
      const other = ua.kind === 'ball' ? ub : ub.kind === 'ball' ? ua : null;
      if (other && other.kind === 'spring') W.pending.push({ spring: other.o });
      if (other && other.kind === 'seesaw') W.onSeesaw = true;
      if (other && (other.kind === 'line' || other.kind === 'ground' || other.kind === 'box' || other.kind === 'seesaw' || other.kind === 'rock')) W.pending.push({ bump: other.kind });
      if ((ua.kind === 'line' && ub.kind !== 'ball') || (ub.kind === 'line' && ua.kind !== 'ball')) W.pending.push({ thud: true });
    });
  }

  // 땅 모양: {top:[[x,y]...], bottom?} → 닫힌 다각형 (윗면 왼쪽→오른쪽, 아래는 bottom(기본 화면 아래 밖)까지)
  function groundPoly(g) {
    const top = g.top, bottom = g.bottom != null ? g.bottom : D.VIEW.h + 200;
    if (g.poly) return g.poly.map(p => p.slice());
    const first = top[0], last = top[top.length - 1];
    return top.map(p => p.slice()).concat([[last[0], bottom], [first[0], bottom]]);
  }

  // ─── 그리기 ───────────────────────────────────────────────
  const inkLeft = W => Math.max(0, W.ink.max - W.ink.used - (W.drawing ? W.drawing.len : 0));

  // 점이 땅 속인가 (다각형 안)
  function inPoly(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // 이 점에 선을 둘 수 있나: 땅 속·물건 속이 아니고, 화면 안
  function pointFree(W, x, y) {
    const r = PH.lineHalf + 2, V0 = D.VIEW;
    if (x < 4 || x > V0.w - 4 || y < 4 || y > V0.h - 4) return false;
    for (const g of W.ground) if (inPoly(g.poly, x, y)) return false;
    const pl = lib(), p = V(x, y), rr = r / S;
    let hit = false;
    W.pl.queryAABB(new pl.AABB(new pl.Vec2(p.x - rr, p.y - rr), new pl.Vec2(p.x + rr, p.y + rr)), f => {
      const u = f.getBody().getUserData() || {};
      if (u.kind === 'ground') return true;
      // 네 옆(선 굵기만큼)과 가운데를 재 본다
      for (const [dx, dy] of [[0, 0], [rr, 0], [-rr, 0], [0, rr], [0, -rr]]) {
        if (f.testPoint(new pl.Vec2(p.x + dx, p.y + dy))) { hit = true; return false; }
      }
      return true;
    });
    return !hit;
  }
  // 두 점 사이에 선을 그을 수 있나: 선 한가운데 줄이 아무것도 안 뚫는다.
  // 선 굵기만큼 모서리를 살짝 스치는 것은 봐준다 (아이 손은 정확하지 않다. 조금 겹친 것은 물리 엔진이 밀어낸다)
  function segFree(W, x0, y0, x1, y1) {
    if (Math.hypot(x1 - x0, y1 - y0) < 0.5) return true;
    let hit = false;
    W.pl.rayCast(V(x0, y0), V(x1, y1), () => { hit = true; return 0; });
    return !hit;
  }
  // 손 떨림 다듬기: 가운데 점들을 이웃과 부드럽게 (끝점은 그대로). 다듬은 점이 막힌 곳이면 원래 점
  function smooth(W, pts) {
    let a = pts;
    for (let pass = 0; pass < PH.smooth; pass++) {
      const b = a.map(p => p.slice());
      for (let i = 1; i < a.length - 1; i++) {
        const x = a[i - 1][0] * 0.25 + a[i][0] * 0.5 + a[i + 1][0] * 0.25, y = a[i - 1][1] * 0.25 + a[i][1] * 0.5 + a[i + 1][1] * 0.25;
        if (pointFree(W, x, y) && segFree(W, b[i - 1][0], b[i - 1][1], x, y)) b[i] = [x, y];
      }
      a = b;
    }
    return a;
  }

  function beginStroke(W, x, y) {
    if (W.phase === 'win' || W.phase === 'fall') return false;
    if (inkLeft(W) < PH.dotR * 2) { W.events.push('noInk'); return false; }
    W.drawing = { pts: [], len: 0, lastTry: [x, y] };
    if (pointFree(W, x, y)) W.drawing.pts.push([x, y]);
    return true;
  }
  // 손가락이 움직였다. 너무 가까우면 모으기만, 막힌 곳은 건너뛴다. 잉크가 떨어지면 거기서 멈춘다
  function drawTo(W, x, y) {
    const d = W.drawing;
    if (!d) return false;
    d.lastTry = [x, y];
    const pts = d.pts;
    if (!pts.length) { if (pointFree(W, x, y)) pts.push([x, y]); return true; }
    const [lx, ly] = pts[pts.length - 1];
    let dx = x - lx, dy = y - ly, len = Math.hypot(dx, dy);
    if (len < PH.step) return true;
    const left = inkLeft(W);
    if (left <= 0.5) { if (!d.empty) { d.empty = true; W.events.push('noInk'); } return false; }
    if (len > left) { dx *= left / len; dy *= left / len; len = left; x = lx + dx; y = ly + dy; }
    if (pts.length >= PH.maxPts) return false;
    // 긴 한 번의 움직임은 잘게 나눠 하나씩 확인한다 (빠르게 그어도 벽을 뚫지 않게)
    const n = Math.max(1, Math.ceil(len / (PH.step * 2)));
    let px = lx, py = ly;
    for (let i = 1; i <= n; i++) {
      const qx = lx + dx * i / n, qy = ly + dy * i / n;
      if (!pointFree(W, qx, qy) || !segFree(W, px, py, qx, qy)) { d.blocked = true; break; }
      if (i === n || Math.hypot(qx - px, qy - py) >= PH.step * 1.5) {
        d.len += Math.hypot(qx - px, qy - py);
        pts.push([qx, qy]); px = qx; py = qy;
      }
    }
    return true;
  }
  // 손을 뗐다: 선(또는 구슬)이 진짜 물건이 된다. 첫 선이면 물리가 돌기 시작한다
  function endStroke(W) {
    const d = W.drawing;
    W.drawing = null;
    if (!d || !d.pts.length) return null;
    let pts = d.pts, len = d.len, kind = 'line';
    // 모양만 다듬는다. 잉크는 그린 그대로의 길이로 센다 (잉크 막대가 손을 뗄 때 도로 늘지 않게)
    if (pts.length > 2) pts = smooth(W, pts);
    if (pts.length < 2 || len < PH.dotR * 1.5) {
      // 톡: 작은 구슬
      const [x, y] = pts[0];
      if (inkLeft(W) < PH.dotR * 2) return null;
      pts = [[x, y]]; len = PH.dotR * 2; kind = 'dot';
    }
    const body = makeBody(W, pts, kind);
    if (!body) return null;
    W.strokes.push({ pts, len, kind });
    W.lines.push(body);
    W.ink.used += len;
    if (kind === 'dot') W.stats.dots++; else W.stats.lines++;
    W.events.push(kind === 'dot' ? 'dot' : 'line');
    if (W.phase === 'ready') start(W);
    return W.strokes[W.strokes.length - 1];
  }

  function makeBody(W, pts, kind) {
    const pl = lib(), x0 = pts[0][0], y0 = pts[0][1];
    const b = W.pl.createBody({ type: 'dynamic', position: V(x0, y0), bullet: false });
    const fx = { density: PH.lineDensity, friction: PH.lineFriction, restitution: 0.05 };
    const T = PH.lineHalf / S;
    if (kind === 'dot') {
      // 구슬은 미끄럽게: 공 앞에 끼어 톱니처럼 맞물려 멈추지 않게
      b.createFixture(new pl.Circle(PH.dotR / S), Object.assign({}, fx, { friction: PH.dotFriction }));
    } else {
      for (let i = 0; i < pts.length; i++) {
        const ax = (pts[i][0] - x0) / S, ay = (pts[i][1] - y0) / S;
        b.createFixture(new pl.Circle(new pl.Vec2(ax, ay), T), fx);
        if (i === 0) continue;
        const bx = (pts[i - 1][0] - x0) / S, by = (pts[i - 1][1] - y0) / S;
        const l = Math.hypot(ax - bx, ay - by);
        if (l < 0.02) continue;
        b.createFixture(new pl.Box(l / 2, T, new pl.Vec2((ax + bx) / 2, (ay + by) / 2), Math.atan2(ay - by, ax - bx)), fx);
      }
    }
    b.setUserData({ kind: 'line', dot: kind === 'dot' });
    return b;
  }

  function start(W) {
    W.phase = 'run';
    const p = W.level.push;
    // 출발 빠르기 + 그만큼 구르는 회전 (미끄러지며 힘을 잃지 않게)
    if (p) { W.ball.setLinearVelocity(new (lib().Vec2)(p[0] / S, p[1] / S)); W.ball.setAngularVelocity(p[0] / PH.ballR); }
    W.events.push('go');
  }

  // 마지막 선 지우기 (잉크를 돌려받는다)
  function undo(W) {
    if (W.phase === 'win' || !W.lines.length) return false;
    const b = W.lines.pop(), s = W.strokes.pop();
    W.pl.destroyBody(b);
    W.ink.used = Math.max(0, W.ink.used - s.len);
    W.stats.undos++;
    W.stuck = false; W.stillT = 0;
    W.events.push('undo');
    return true;
  }
  // 처음부터 (선 모두 지움, 잉크 가득)
  function reset(W) {
    build(W);
    W.events.push('reset');
  }

  // ─── 흐르기 ───────────────────────────────────────────────
  function step(W, dt) {
    W.t += dt;
    for (const sp of W.springs) sp.squash = Math.max(0, sp.squash - dt * 4);
    if (W.phase !== 'run') return;
    W.acc += Math.min(dt, 0.1);
    while (W.acc >= DT - 1e-9 && W.phase === 'run') {
      W.acc -= DT;
      tick(W);
    }
  }
  function tick(W) {
    W.pl.step(DT, 8, 3);
    W.steps++; W.runT += DT;
    W.springCd = Math.max(0, W.springCd - DT);
    const pl = lib(), ball = W.ball;
    for (const e of W.pending.splice(0)) {
      if (e.spring && W.springCd <= 0) {
        const o = e.spring, v = ball.getLinearVelocity();
        ball.setLinearVelocity(new pl.Vec2(o.kick != null ? o.kick / S : v.x, -o.power / S));
        W.springCd = 0.3; W.stats.springs++;
        const sp = W.springs.find(s => s.o === o); if (sp) sp.squash = 1;
        W.events.push('spring');
      } else if (e.bump) W.events.push('bump');
      else if (e.thud) W.events.push('thud');
    }
    const p = ball.getPosition(), x = p.x * S, y = p.y * S, v = ball.getLinearVelocity();
    const speed = Math.hypot(v.x, v.y) * S;
    // 친구에게 닿음
    const L = W.level, gx = L.goal[0], gy = L.goal[1] - PH.ballR;
    if (Math.hypot(x - gx, y - gy) < PH.goalR) return winNow(W);
    // 떨어짐
    const V0 = D.VIEW;
    if (y > V0.h + PH.ballR * 2 || x < -PH.ballR * 2 || x > V0.w + PH.ballR * 2) {
      W.phase = 'fall'; W.stats.falls++; W.fallT = W.t;
      W.events.push('fall');
      return;
    }
    // 막혔나: 공이 오래 멈춰 있으면 한 번 알린다 (다시 움직이면 풀린다)
    if (speed < PH.stillV) {
      W.stillT += DT;
      if (W.stillT > PH.stuckSec && !W.stuck) { W.stuck = true; W.events.push('stuck'); }
    } else { W.stillT = 0; W.stuck = false; }
  }
  function winNow(W) {
    const L = W.level, used = W.ink.used;
    W.phase = 'win';
    W.stars = 1 + (used <= L.par[1] ? 1 : 0) + (used <= L.par[0] ? 1 : 0);
    if (W.onSeesaw) W.stats.seesaw = 1;   // 시소를 타고 만났다 (메달·스티커)
    W.win = { t: W.t, used, stars: W.stars };
    W.events.push('win');
  }

  // ─── 읽기 도우미 (그리기·테스트) ───────────────────────────
  function ballState(W) {
    const p = W.ball.getPosition(), v = W.ball.getLinearVelocity();
    return { x: p.x * S, y: p.y * S, a: W.ball.getAngle(), vx: v.x * S, vy: v.y * S };
  }
  // 몸체의 한 점(판 좌표)이 지금 어디 있나
  function bodyPoint(body, ox, oy, lx, ly) {
    const p = body.getWorldPoint(new (lib().Vec2)((lx - ox) / S, (ly - oy) / S));
    return [p.x * S, p.y * S];
  }
  // 그린 선의 지금 모양 (판 좌표 점 목록)
  function linePoints(W, i) {
    const s = W.strokes[i], b = W.lines[i];
    if (!s || !b) return [];
    const [ox, oy] = s.pts[0], pos = b.getPosition(), a = b.getAngle(), c = Math.cos(a), sn = Math.sin(a);
    return s.pts.map(([x, y]) => { const lx = (x - ox) / S, ly = (y - oy) / S; return [(pos.x + lx * c - ly * sn) * S, (pos.y + lx * sn + ly * c) * S]; });
  }
  function bodyState(b) { const p = b.getPosition(); return { x: p.x * S, y: p.y * S, a: b.getAngle() }; }

  // 판 요약 (상점·미션·메달·놀이 본부)
  function runStats(W) {
    return {
      level: W.level.id, planet: W.level.planet, win: W.phase === 'win', stars: W.phase === 'win' ? W.stars : 0,
      used: Math.round(W.ink.used), lines: W.stats.lines, dots: W.stats.dots, undos: W.stats.undos, falls: W.stats.falls,
      oneLine: W.phase === 'win' && W.strokes.length === 1 && W.strokes[0].kind === 'line' ? 1 : 0,
      springs: W.stats.springs, seesaw: W.stats.seesaw, time: W.t,
    };
  }

  // 한 판을 다 그린 선 목록으로 풀어 본다 (테스트·봇). strokes: [[[x,y]...], ...]. maxSec 안에 친구에게 닿으면 true
  function solve(level, strokes, opts) {
    opts = opts || {};
    const W = create(level, opts);
    for (const s of strokes) {
      if (!beginStroke(W, s[0][0], s[0][1])) continue;
      for (let i = 1; i < s.length; i++) {
        // 점 사이가 멀면 손가락처럼 잘게 나눠 움직인다
        const [ax, ay] = s[i - 1], [bx, by] = s[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
        for (let k = 1; k <= n; k++) drawTo(W, ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
      }
      endStroke(W);
      if (opts.gap) step(W, opts.gap);
    }
    const frame = opts.frame || DT, max = opts.maxSec || 14;
    while ((W.phase === 'run' || W.phase === 'ready') && W.runT < max) { if (W.phase === 'ready') break; step(W, frame); }
    return W;
  }

  BR.World = { create, build, reset, beginStroke, drawTo, endStroke, undo, step, inkLeft, pointFree, segFree, inPoly, groundPoly,
    ballState, bodyPoint, linePoints, bodyState, runStats, solve, DT };
})(BR);
