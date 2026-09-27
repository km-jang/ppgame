'use strict';
// 게임 규칙. DOM·canvas를 쓰지 않는다 (node 테스트가 그대로 불러 돌린다: tests/jump.test.js).
// 좌표 단위는 "점": 가로 0 ~ D.WORLD.w, 세로는 위로 갈수록 커진다 (y = 높이).
// 물리는 1/120초 칸(tick)으로 쪼개 돌아 화면 주사율과 상관없이 같은 결과가 나온다.
(function (JP) {
  const D = JP.DATA;
  const WW = D.WORLD.w;
  const P0 = D.PLAYER;
  const H = D.STEP;
  const jumpV = h => Math.sqrt(2 * P0.gravity * h);
  const lerp = (a, b, t) => a + (b - a) * t;

  // 좌우가 이어진 기둥에서 a에서 b까지 가장 짧은 가로 거리 (부호 있음)
  function wrapDelta(a, b) {
    let d = b - a;
    if (d > WW / 2) d -= WW; else if (d < -WW / 2) d += WW;
    return d;
  }

  // 높이(점)에 따른 어려움 0 ~ 1
  const diffAt = y => Math.max(0, Math.min(1, y / D.METER / D.DIFF.full));

  function pickKind(table, d, rand) {
    const items = Object.keys(table).map(k => ({ k, w: lerp(table[k][0], table[k][1], d) }));
    return JP.weighted(items, rand).k;
  }

  // ─── 만들기 ────────────────────────────────────────────────
  function addPlat(W, kind, x, y, w) {
    const p = { id: ++W.ids, kind, x, y, w, px: x, vx: 0, broken: false, bt: 0, on: true, t: 0, hit: -9 };
    if (kind === 'moving') {
      const S = W.easy ? D.EASY.moveSpeed : D.PLAT.moveSpeed, d = diffAt(y);
      p.vx = lerp(S[0], S[1], d) * (W.rand() < 0.5 ? -1 : 1);
    }
    if (kind === 'cloud') p.t = W.rand() * (D.CLOUD.on + D.CLOUD.off);   // 구름마다 박자가 다르다
    W.plats.push(p);
    return p;
  }

  // 한 줄: 길을 이루는 발판 하나 + 가끔 곁 발판·별·아이템·가시 폭탄
  function row(W) {
    const rand = W.rand, d = diffAt(W.genY);
    const G = W.easy ? D.EASY.gap : D.GAP;
    const gMin = lerp(G[0], G[2], d), gMax = lerp(G[1], G[3], d);
    const y = W.genY + gMin + rand() * (gMax - gMin);
    const w = W.easy ? D.EASY.w : D.PLAT.w;
    const kind = pickKind(D.PLAT.main, d, rand);
    const pw = kind === 'spring' ? w * 0.85 : w;
    const x = pw / 2 + rand() * (WW - pw);
    const main = addPlat(W, kind, x, y, pw);
    const xs = [x];
    // 곁 발판: 길 발판과 겹치지 않는 자리에
    const EC = W.easy ? D.EASY.extraChance : D.PLAT.extraChance;
    if (rand() < lerp(EC[0], EC[1], d)) {
      for (let k = 0; k < 6; k++) {
        const ex = w / 2 + rand() * (WW - w);
        if (Math.abs(wrapDelta(ex, x)) < w + 24) continue;
        // 길 발판이 움직이면 그 발판이 지나다니는 줄을 비우고 앞 줄과의 가운데 높이에
        const ey = kind === 'moving' ? (W.genY + y) / 2 + 8 : y + (rand() - 0.5) * 30;
        addPlat(W, pickKind(D.PLAT.extra, d, rand), ex, ey, w);
        xs.push(ex);
        break;
      }
    }
    // 별: 발판 위에 하나, 가끔 세로로 줄지어
    if (rand() < D.STAR.chance) {
      const n = rand() < D.STAR.lineChance ? D.STAR.line : 1;
      const sx = kind === 'moving' ? WW / 2 + (rand() - 0.5) * WW * 0.6 : x;
      for (let i = 0; i < n; i++) W.stars.push({ id: ++W.ids, x: sx, y: y + 70 + i * 55, got: false });
    }
    // 아이템: 정해 둔 높이를 지나면 길 발판 위에
    if (y >= W.nextItem) {
      const kinds = Object.keys(D.ITEM.kinds).map(k => ({ k, w: D.ITEM.kinds[k].w }));
      W.items.push({ id: ++W.ids, kind: JP.weighted(kinds, rand).k, x: main.kind === 'moving' ? WW / 2 : x, y: y + 60, got: false, seen: -1 });
      const IG = W.easy ? D.EASY.itemGap : [D.ITEM.gapMin, D.ITEM.gapMax];
      W.nextItem = y + (IG[0] + rand() * (IG[1] - IG[0])) * D.METER;
    }
    // 가시 폭탄 (보통만): 이번 줄과 앞 줄 사이, 두 발판에서 가로로 멀리
    const M = D.MINE;
    if (!W.easy && y / D.METER >= M.from && rand() < lerp(M.chance[0], M.chance[1], d)) {
      const my = (W.genY + y) / 2, reach = P0.jump + P0.r * 2 + M.r + 20;
      for (let k = 0; k < 6; k++) {
        const mx = 30 + rand() * (WW - 60);
        // 튀어 오르는 길에 걸리지 않게: 폭탄 아래 한 번 튀는 높이 안의 모든 발판에서 가로로 멀리
        if (W.recent.some(R => R.y > my - reach && R.xs.some(ax => Math.abs(wrapDelta(mx, ax)) < M.clear))) continue;
        if (xs.some(ax => Math.abs(wrapDelta(mx, ax)) < M.clear)) continue;
        // 앞 발판에서 이번 발판으로 건너가는 길목(가로 사이)에도 두지 않는다
        const span = wrapDelta(W.prevXs[0], x), dm = wrapDelta(W.prevXs[0], mx);
        if (Math.sign(dm) === Math.sign(span) && Math.abs(dm) < Math.abs(span) + M.clear * 0.5) continue;
        W.mines.push({ id: ++W.ids, x: mx, y: my, gone: false, seen: -1 });
        break;
      }
    }
    W.prevXs = xs;
    W.recent.push({ y, xs });
    if (W.recent.length > 4) W.recent.shift();
    W.genY = y;
  }

  // 화면 위로 두 화면만큼 미리 만들어 두고, 아래로 멀리 지나간 것은 버린다
  function generate(W) {
    const top = W.cam + W.viewH * 2.2;
    let guard = 0;
    while (W.genY < top && guard++ < 200) row(W);
    const low = W.cam - 260;
    const keep = o => o.y > low;
    if (W.plats.length && W.plats[0].y <= low) W.plats = W.plats.filter(keep);
    if (W.stars.length && W.stars[0].y <= low) W.stars = W.stars.filter(o => keep(o) && !o.got);
    if (W.items.length && W.items[0].y <= low) W.items = W.items.filter(o => keep(o) && !o.got);
    if (W.mines.length && W.mines[0].y <= low) W.mines = W.mines.filter(o => keep(o) && !o.gone);
  }

  // opts: {easy, viewH}
  function create(seed, opts) {
    opts = opts || {};
    const rand = JP.rng(seed == null ? (Date.now() ^ 0x5bd1e995) : seed);
    const easy = !!opts.easy;
    const viewH = opts.viewH || 600;
    const W = {
      rand, easy, viewH, ids: 0,
      p: { x: WW / 2, y: P0.r, vx: 0, vy: 0, px: WW / 2, py: P0.r, face: 1, land: -9 },
      input: { dir: 0 },          // -1 왼쪽 · 0 · 1 오른쪽 (main.js·봇이 채운다)
      cam: -viewH * D.CAM.start, pcam: 0,
      plats: [], stars: [], items: [], mines: [],
      genY: 0, prevXs: [WW / 2], recent: [{ y: 0, xs: [] }], nextItem: D.ITEM.first * D.METER,
      phase: 'play',              // play | over
      cause: null,                // fall | mine
      t: 0, acc: 0, alpha: 0, ticks: 0,
      maxY: 0, height: 0, score: 0,
      rescues: easy ? D.EASY.rescues : 0, rescued: 0,
      shield: false, rocket: 0,
      // 기록·메달용
      starsGot: 0, springs: 0, rockets: 0, saves: 0, bounces: 0, combo: 0, maxCombo: 0, lastLand: 0,
      botT: null,
      events: [],   // 소리·진동용: bounce spring star item rocket shield save crumble rescue over
      fx: [],       // 그리기 연출용: {kind, x, y}
    };
    W.pcam = W.cam;
    // 바닥: 기둥 가로 전체를 덮는 첫 발판
    addPlat(W, 'ground', WW / 2, 0, WW);
    generate(W);
    return W;
  }

  // ─── 한 칸 (1/120초) ───────────────────────────────────────
  function die(W, cause) {
    W.phase = 'over';
    W.cause = cause;
    W.events.push('over');
    W.fx.push({ kind: 'die', x: W.p.x, y: W.p.y, cause });
  }

  // 아래에서 위로 던져 올린다 (구조 구름 · 방패 방울)
  function throwUp(W, kind) {
    const P = W.p;
    P.y = W.cam + P0.r; P.py = P.y;
    P.vy = jumpV(Math.min(W.viewH * D.EASY.rescueJump, 520));
    W.combo = 0; W.lastLand = -Infinity;
    W.fx.push({ kind, x: P.x, y: W.cam });
  }

  function land(W, p) {
    const P = W.p;
    P.y = p.y + P0.r;
    const spring = p.kind === 'spring';
    P.vy = jumpV(spring ? D.SPRING.jump : P0.jump);
    P.land = W.t;
    p.hit = W.t;
    W.bounces++;
    if (p.y > W.lastLand + 1) W.combo++; else W.combo = 0;
    W.maxCombo = Math.max(W.maxCombo, W.combo);
    W.lastLand = p.y;
    if (spring) { W.springs++; W.events.push('spring'); W.fx.push({ kind: 'spring', x: P.x, y: p.y }); }
    else { W.events.push('bounce'); W.fx.push({ kind: 'bounce', x: P.x, y: p.y }); }
    if (p.kind === 'crumble') {
      p.broken = true; p.bt = W.t;
      W.events.push('crumble'); W.fx.push({ kind: 'crumble', x: p.x, y: p.y });
    }
  }

  function tick(W) {
    const P = W.p, r = P0.r;
    W.ticks++;
    W.t += H;
    P.px = P.x; P.py = P.y; W.pcam = W.cam;

    // 발판 움직이기
    for (const p of W.plats) {
      p.px = p.x;
      if (p.kind === 'moving') {
        p.x += p.vx * H;
        const lo = p.w / 2, hi = WW - p.w / 2;
        if (p.x < lo) { p.x = lo; p.vx = Math.abs(p.vx); } else if (p.x > hi) { p.x = hi; p.vx = -Math.abs(p.vx); }
      } else if (p.kind === 'cloud') {
        p.t += H;
        p.on = p.t % (D.CLOUD.on + D.CLOUD.off) < D.CLOUD.on;
      }
    }

    // 좌우: 누르는 쪽으로 빠르게 붙고, 떼면 곧 멈춘다
    const dir = W.input.dir > 0 ? 1 : W.input.dir < 0 ? -1 : 0;
    const target = dir * P0.maxVx;
    const a = (dir === 0 || Math.sign(target) !== Math.sign(P.vx) && P.vx !== 0 ? P0.decel : 0) + (dir ? P0.accel : 0);
    if (P.vx < target) P.vx = Math.min(target, P.vx + a * H); else if (P.vx > target) P.vx = Math.max(target, P.vx - a * H);
    if (dir) P.face = dir;
    P.x += P.vx * H;
    // 한쪽 끝으로 나가면 반대쪽에서 들어온다
    if (P.x < 0) { P.x += WW; P.px += WW; } else if (P.x >= WW) { P.x -= WW; P.px -= WW; }

    // 위아래
    const oldY = P.y;
    if (W.rocket > 0) {
      W.rocket -= H;
      P.vy = D.ROCKET.speed;
      if (W.rocket <= 0) { W.rocket = 0; P.vy = D.ROCKET.after; }
    } else {
      P.vy -= P0.gravity * H;
    }
    P.y += P.vy * H;

    // 발판에 내려앉기: 떨어지는 중에, 발이 발판 윗면을 이번 칸에 지나갔을 때만 (올라갈 때는 통과)
    if (P.vy < 0 && W.rocket <= 0) {
      let hit = null;
      for (const p of W.plats) {
        if (p.broken || !p.on) continue;
        if (oldY - r >= p.y - 0.001 && P.y - r <= p.y && Math.abs(wrapDelta(P.x, p.x)) <= p.w / 2 + r * 0.55) {
          if (!hit || p.y > hit.y) hit = p;
        }
      }
      if (hit) land(W, hit);
    }

    // 별
    const sr = (r + D.STAR.r) * (r + D.STAR.r);
    for (const s of W.stars) {
      if (s.got || Math.abs(s.y - P.y) > 40) continue;
      const dx = wrapDelta(P.x, s.x), dy = s.y - P.y;
      if (dx * dx + dy * dy < sr) {
        s.got = true; W.starsGot++;
        W.events.push('star'); W.fx.push({ kind: 'star', x: s.x, y: s.y });
      }
    }
    // 아이템
    const ir = (r + D.ITEM.r) * (r + D.ITEM.r);
    for (const it of W.items) {
      if (it.got) continue;
      if (it.seen < 0 && it.y < W.cam + W.viewH) { it.seen = W.t; W.events.push('item'); }
      const dx = wrapDelta(P.x, it.x), dy = it.y - P.y;
      if (dx * dx + dy * dy < ir) {
        it.got = true;
        if (it.kind === 'rocket') { W.rocket = D.ROCKET.time; W.rockets++; W.events.push('rocket'); }
        else { W.shield = true; W.events.push('shield'); }
        W.fx.push({ kind: 'item', item: it.kind, x: it.x, y: it.y });
      }
    }
    // 가시 폭탄: 로켓 중에는 부딪혀도 괜찮다. 방패가 있으면 폭탄만 터지고 살아남는다
    const mr = (r + D.MINE.r * 0.85) * (r + D.MINE.r * 0.85);
    for (const m of W.mines) {
      if (m.gone) continue;
      if (m.seen < 0 && m.y < W.cam + W.viewH) m.seen = W.t;
      const dx = wrapDelta(P.x, m.x), dy = m.y - P.y;
      if (dx * dx + dy * dy >= mr) continue;
      if (W.rocket > 0) { m.gone = true; W.fx.push({ kind: 'pop', x: m.x, y: m.y }); continue; }
      if (W.shield) {
        W.shield = false; W.saves++; m.gone = true;
        P.vy = Math.max(P.vy, jumpV(P0.jump));
        W.events.push('save'); W.fx.push({ kind: 'save', x: m.x, y: m.y });
        continue;
      }
      die(W, 'mine');
      return;
    }

    // 높이 · 점수 · 카메라 (카메라는 올라가기만 한다)
    if (P.y > W.maxY) W.maxY = P.y;
    W.height = Math.floor(W.maxY / D.METER);
    W.score = W.height + W.starsGot * D.STAR.points;
    W.cam = Math.max(W.cam, P.y - W.viewH * D.CAM.focus);

    // 화면 아래로 떨어짐: 방패 → 구조 구름(쉬움) → 끝
    if (P.y < W.cam - r * 1.5) {
      if (W.shield) { W.shield = false; W.saves++; W.events.push('save'); throwUp(W, 'save'); }
      else if (W.rescues > 0) { W.rescues--; W.rescued++; W.events.push('rescue'); throwUp(W, 'rescue'); }
      else { die(W, 'fall'); return; }
    }

    generate(W);
  }

  // 받은 시간을 1/120초 칸으로 쪼개 돈다. 남은 시간은 다음으로 넘기고 그리기 보간(alpha)에 쓴다
  function step(W, dt) {
    if (W.phase !== 'play') return;
    W.acc += dt;
    let guard = 0;
    while (W.acc >= H - 1e-9 && W.phase === 'play') {
      W.acc -= H;
      tick(W);
      if (++guard > 12) { W.acc = 0; break; }   // 멈췄다 돌아온 긴 프레임은 버린다
    }
    if (W.acc < 0) W.acc = 0;
    W.alpha = W.phase === 'play' ? Math.min(1, W.acc / H) : 1;
  }

  // 구름 발판이 지금 얼마나 보이는지 (그리기용, 0 ~ 1)
  function cloudAlpha(p) {
    const C = D.CLOUD, c = p.t % (C.on + C.off);
    if (c >= C.on) return 0;
    return Math.min(1, c / C.fade, (C.on - c) / C.fade);
  }

  // ─── 자동 운전 (시작 화면 시연·테스트용) ─────────────────────
  // 닿을 수 있는 발판 중 가장 높은 것(스프링은 더 좋게, 가시 폭탄 근처는 빼고)을 골라 그쪽으로 간다
  function botDir(W) {
    const P = W.p, g = P0.gravity;
    if (W.phase !== 'play') return 0;
    if (W.rocket > 0) return 0;
    const apex = P.y + (P.vy > 0 ? P.vy * P.vy / (2 * g) : 0);
    // 지금부터 높이 y에 (내려오며) 닿기까지 걸리는 시간. 닿지 못하면 -1
    const timeTo = y => {
      const q = P.vy * P.vy + 2 * g * (P.y - y);
      return q < 0 ? -1 : (P.vy + Math.sqrt(q)) / g;
    };
    const fromY = P.y - P0.r;
    let t = W.botT;
    const bad = p => !p || p.broken || W.plats.indexOf(p) < 0 || p.y + P0.r > apex - 8 || (P.vy <= 0 && fromY < p.y - 1);
    if (bad(t) || W.botB !== W.bounces) {
      W.botB = W.bounces;
      t = null; let best = -Infinity;
      for (const p of W.plats) {
        if (p.broken || p.y + P0.r > apex - 8 || (P.vy <= 0 && p.y > fromY + 1)) continue;
        if (p.y < W.cam - 10) continue;
        const tt = timeTo(p.y + P0.r);
        if (tt < 0) continue;
        const px = p.x + p.vx * tt;
        const need = Math.max(0, Math.abs(wrapDelta(P.x, px)) - p.w * 0.35);
        if (need > P0.maxVx * tt * 0.8 + 4) continue;
        if (p.kind === 'cloud') {
          const C = D.CLOUD, c = (p.t + tt) % (C.on + C.off);
          if (c > C.on - 0.25) continue;
        }
        let s = p.y;
        if (p.kind === 'spring') s += 150;
        if (p.kind === 'crumble') s -= 15;
        if (p.kind === 'cloud') s -= 30;
        if (p.kind === 'moving') s -= 10;
        // 가시 폭탄이 착지 자리 위쪽 가까이 있으면 피한다
        for (const m of W.mines) if (!m.gone && Math.abs(wrapDelta(px, m.x)) < 70 && m.y > p.y - 20 && m.y < p.y + 260) s -= 400;
        if (s > best) { best = s; t = p; }
      }
      W.botT = t;
    }
    if (!t) return 0;
    const tt = Math.max(0, timeTo(t.y + P0.r));
    const tx = t.x + t.vx * tt;
    const dx = wrapDelta(P.x, tx);
    // 가까우면 멈춘다 (멈추는 데 드는 거리만큼 미리)
    const brake = P.vx * P.vx / (2 * P0.decel);
    if (Math.abs(dx) < Math.max(6, t.w * 0.2) + (Math.sign(dx) === Math.sign(P.vx) ? brake * 0.5 : 0)) {
      return dodge(W, Math.abs(P.vx) > 60 ? -Math.sign(P.vx) : 0);
    }
    return dodge(W, dx > 0 ? 1 : -1);
  }

  // 고른 방향으로 잠깐(0.4초) 가 보면 가시 폭탄에 닿는지 살펴, 닿으면 다른 방향을 고른다
  function dodge(W, want) {
    if (!W.mines.length || W.shield) return want;
    const P = W.p, g = P0.gravity, lim = (P0.r + D.MINE.r + 10) * (P0.r + D.MINE.r + 10);
    const hits = dir => {
      for (let k = 1; k <= 8; k++) {
        const t = k * 0.05, x = P.x + (dir ? dir * P0.maxVx : P.vx * 0.3) * t, y = P.y + P.vy * t - g * t * t / 2;
        for (const m of W.mines) {
          if (m.gone) continue;
          const dx = wrapDelta(x, m.x), dy = m.y - y;
          if (dx * dx + dy * dy < lim) return true;
        }
      }
      return false;
    };
    for (const d of [want, 0, -want]) if (!hits(d)) return d;
    return want;
  }

  // 이번 판 기록 (메달 확인용)
  function runStats(W) {
    return {
      easy: W.easy, height: W.height, score: W.score, stars: W.starsGot, springs: W.springs,
      rockets: W.rockets, saves: W.saves, maxCombo: W.maxCombo, rescued: W.rescued, bounces: W.bounces, time: W.t,
    };
  }

  JP.World = { create, step, tick, botDir, runStats, wrapDelta, cloudAlpha, diffAt, jumpV };
})(JP);
