'use strict';
// 게임 규칙. DOM·canvas를 쓰지 않는다 (node 테스트가 그대로 불러 돌린다: tests/runner.test.js).
// 좌표: 줄 x (0·1·2, 왼쪽부터. 줄을 바꾸는 중에는 소수), 앞뒤 z (출발점부터 m), 높이 y (m).
// 우주선은 늘 z = W.dist에 있고, 앞에 놓인 물체는 W.dist가 커지면서 다가온다.
(function (RN) {
  const D = RN.DATA;
  const TICK = D.TICK;
  const P = D.PLAYER;
  const G = 8 * P.jumpH / (P.jumpT * P.jumpT);   // 점프 중력: jumpT초 동안 jumpH까지 올랐다 내려온다
  const V0 = 4 * P.jumpH / P.jumpT;
  const ITEM_KINDS = Object.keys(D.ITEM.kinds);

  const cfg = W => (W.easy ? D.EASY : D.NORMAL);

  // 지금 속도(초당 m): 천천히 빨라지고 상한에서 멈춘다. 부스트 중엔 더 빠르다
  function speed(W) {
    const S = cfg(W).speed;
    const v = Math.min(S.max, S.base + S.accel * W.runT);
    return W.eff && W.eff.boost > 0 ? v * D.ITEM.boostMul : v;
  }

  // opts: { easy (기본 true), auto (자동 운전), wait (출발 대기 초) }
  function create(seed, opts) {
    opts = opts || {};
    const easy = opts.easy !== false;
    const W = {
      seed, easy, rand: RN.rng(seed == null ? (Date.now() >>> 0) : seed),
      phase: 'play', t: 0, runT: 0, overT: 0, ticks: 0, acc: 0, alpha: 0,
      wait: opts.wait != null ? opts.wait : D.START.wait,
      dist: 0, pdist: 0, stars: 0, score: 0,
      hearts: (easy ? D.EASY : D.NORMAL).hearts,
      shield: false, inv: 0, eff: { magnet: 0, boost: 0 }, rainT: 0,
      p: { lane: 1, x: 1, px: 1, y: 0, py: 0, vy: 0, buf: 0 },
      obs: [], nextZ: D.START.firstRow, rowId: 0, itemT: D.ITEM.first, itemReady: false,
      chain: 0, lastStar: -9,
      // 이번 판 기록 (메달·결과 화면)
      jumps: 0, gates: 0, hits: 0, blocks: 0, boosts: 0, smashes: 0, items: 0, kinds: {}, laneMoves: 0,
      cause: '', auto: !!opts.auto,
      events: [],   // 소리·진동 (main.js가 비운다)
      fx: [],       // 입자·글자 연출 (render.js가 비운다)
    };
    W.maxHearts = W.hearts;
    fill(W);
    return W;
  }

  // ─── 줄 만들기 ─────────────────────────────────────────────
  // 한 줄 = 같은 z에 놓인 장애물 묶음. 어떤 줄이든 장애물이 전혀 없는 줄이 하나 이상 남는다.
  // 줄 사이 간격은 지금 속도 × gap초라서, 빨라져도 피할 시간은 같다
  function shuffle3(r) {
    const a = [0, 1, 2];
    for (let i = 2; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function makeRow(W) {
    const C = cfg(W), r = W.rand, z = W.nextZ, id = ++W.rowId;
    const pat = RN.weighted(C.rows, r).k;
    const L = shuffle3(r);
    const row = { id, z, pat, lanes: [null, null, null], mover: null };
    const meteor = l => { row.lanes[l] = 'meteor'; W.obs.push({ kind: 'meteor', x: l, z, row: id }); };
    const gate = l => { row.lanes[l] = 'gate'; W.obs.push({ kind: 'gate', x: l, z, row: id }); };
    switch (pat) {
      case 'one': meteor(L[0]); break;
      case 'two': meteor(L[0]); meteor(L[1]); break;
      case 'gate': gate(L[0]); break;
      case 'mg': meteor(L[0]); gate(L[1]); break;
      case 'gg': gate(L[0]); gate(L[1]); break;
      case 'mover': {
        // 가운데 줄에서 출발하면 양옆 중 하나로, 가장자리면 가운데로 미끄러진다. 나머지 한 줄은 늘 비어 있다
        const from = L[0], to = from === 1 ? (r() < 0.5 ? 0 : 2) : 1;
        row.lanes[from] = 'mover'; row.lanes[to] = 'mover'; row.mover = { from, to };
        W.obs.push({ kind: 'meteor', x: from, from, to, z, row: id, moving: true });
        break;
      }
    }
    row.free = [0, 1, 2].filter(l => !row.lanes[l]);
    const guide = row.free[Math.floor(r() * row.free.length)];
    const gapM = Math.max(D.GEN.minGap, speed(W) * (C.gap[0] + (C.gap[1] - C.gap[0]) * r()));
    // 별: 안전한 줄에 한 줄로 늘어서서 길을 알려 준다. 별만 있는 줄은 옆 줄로 비스듬히 건너간다
    const n = D.STAR.lineN, span = Math.min(gapM * 0.55, 12);
    if (pat === 'stars') {
      const a = guide, b = a === 1 ? (r() < 0.5 ? 0 : 2) : 1;
      for (let i = 0; i < n * 2; i++) W.obs.push({ kind: 'star', x: i < n ? a : b, y: 0.5, z: z - span + (span * 2) * i / (n * 2 - 1), row: id });
    } else if (r() < C.starLine) {
      for (let i = 0; i < n; i++) W.obs.push({ kind: 'star', x: guide, y: 0.5, z: z - span + span * i / (n - 1) - 1.5, row: id });
    }
    // 레이저 문 위에는 가끔 무지개 모양 별: 뛰어넘으면 먹는다
    for (let l = 0; l < 3; l++) {
      if (row.lanes[l] !== 'gate' || r() < 0.5) continue;
      for (const [dz, y] of [[-3, 1.2], [0, 1.9], [3, 1.2]]) W.obs.push({ kind: 'star', x: l, y, z: z + dz, row: id });
    }
    // 아이템: 때가 됐으면 안전한 줄, 장애물과 같은 자리에 (피하면 선물)
    if (W.itemReady) {
      W.itemReady = false;
      const ks = ITEM_KINDS.filter(k => !(k === 'shield' && W.shield)).map(k => ({ k, w: D.ITEM.kinds[k].w }));
      const item = RN.weighted(ks, r).k;
      W.obs.push({ kind: 'item', item, x: guide, y: 0.7, z, row: id });
      row.item = item;
      W.events.push('item');
    }
    W.nextZ = z + gapM;
    W.lastRow = row;
    return row;
  }

  // 앞쪽 VIEW m까지 줄을 채운다
  function fill(W) {
    while (W.nextZ < W.dist + D.VIEW) makeRow(W);
  }

  // ─── 조작 ─────────────────────────────────────────────────
  // dir: 'left' | 'right' | 'jump'. 출발 대기 중에도 된다. 바뀌었으면 true
  function move(W, dir) {
    if (W.phase !== 'play') return false;
    const p = W.p;
    if (dir === 'jump' || dir === 'up') return jump(W);
    const to = dir === 'left' ? p.lane - 1 : dir === 'right' ? p.lane + 1 : p.lane;
    if (to < 0 || to > 2 || to === p.lane) return false;
    p.lane = to;
    W.laneMoves++;
    W.events.push('lane');
    return true;
  }

  // 땅에 있으면 바로 뛰고, 떠 있으면 잠깐 기억했다가 닿자마자 뛴다
  function jump(W) {
    if (W.phase !== 'play') return false;
    const p = W.p;
    if (p.y <= 0 && p.vy <= 0) {
      p.vy = V0; p.buf = 0; W.jumps++;
      W.events.push('jump');
      return true;
    }
    p.buf = P.buffer;
    return false;
  }

  // ─── 부딪힘 · 줍기 ─────────────────────────────────────────
  function hit(W, o) {
    if (W.eff.boost > 0) {
      // 부스트: 부딪히는 것을 모두 부순다
      o.done = true; W.smashes++;
      W.fx.push({ kind: 'smash', x: o.x, z: o.z, what: o.kind });
      W.events.push('smash');
      return;
    }
    if (W.inv > 0) return;   // 깜빡이는 동안은 그냥 지나간다
    o.done = true;
    if (W.shield) {
      W.shield = false; W.blocks++; W.inv = D.HIT.shieldInv;
      W.fx.push({ kind: 'shield', x: o.x, z: o.z, what: o.kind });
      W.events.push('shield');
      return;
    }
    W.hearts--; W.hits++; W.inv = D.HIT.inv; W.chain = 0;
    W.fx.push({ kind: 'hit', x: o.x, z: o.z, what: o.kind });
    if (W.hearts <= 0) {
      W.hearts = 0; W.phase = 'over'; W.cause = o.kind; W.inv = 0;
      W.events.push('over');
      W.fx.push({ kind: 'crash', x: W.p.x, z: W.dist });
    } else W.events.push('hit');
  }

  function usePower(W, o) {
    const K = D.ITEM.kinds[o.item];
    o.done = true; W.items++; W.kinds[o.item] = true;
    if (o.item === 'shield') W.shield = true;
    else W.eff[o.item] = K.time;
    if (o.item === 'boost') { W.boosts++; W.events.push('boost'); } else W.events.push('power');
    W.fx.push({ kind: 'power', x: o.x, z: o.z, y: o.y, item: o.item });
  }

  function takeStar(W, o) {
    o.done = true; W.stars++;
    W.chain = W.t - W.lastStar <= D.STAR.chainGap ? W.chain + 1 : 1;
    W.lastStar = W.t;
    W.events.push('star');
    W.fx.push({ kind: 'star', x: o.x, z: o.z, y: o.y });
  }

  // ─── 한 칸(1/120초) ───────────────────────────────────────
  function tick(W) {
    const dt = TICK, p = W.p;
    W.t += dt;
    p.px = p.x; p.py = p.y; W.pdist = W.dist;
    if (W.phase !== 'play') { W.overT += dt; return; }
    if (W.auto) bot(W);

    // 줄 바꾸기: 목표 줄까지 일정한 빠르기로 미끄러진다
    const dx = p.lane - p.x, sx = P.laneSpeed * dt;
    p.x = Math.abs(dx) <= sx ? p.lane : p.x + Math.sign(dx) * sx;
    // 점프
    if (p.y > 0 || p.vy > 0) {
      p.vy -= G * dt; p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0; p.vy = 0;
        W.events.push('land');
        if (p.buf > 0) jump(W);
      }
    }
    p.buf = Math.max(0, p.buf - dt);

    if (W.wait > 0) { W.wait -= dt; return; }   // 출발 전: 줄 바꾸기·점프만 된다
    W.runT += dt;

    // 효과 시간
    if (W.inv > 0) W.inv = Math.max(0, W.inv - dt);
    if (W.eff.magnet > 0) W.eff.magnet = Math.max(0, W.eff.magnet - dt);
    if (W.eff.boost > 0) {
      W.eff.boost = Math.max(0, W.eff.boost - dt);
      if (W.eff.boost === 0) W.inv = Math.max(W.inv, D.HIT.boostGrace);   // 끝나자마자 부딪히지 않게 잠깐 깜빡
      // 별 비: 부스트 동안 앞쪽 아무 줄에나 별이 쏟아진다
      if ((W.rainT -= dt) <= 0) {
        W.rainT = D.STAR.rainEvery;
        W.obs.push({ kind: 'star', x: Math.floor(W.rand() * 3), y: 0.5, z: W.dist + 25 + W.rand() * 20, rain: true });
      }
    }
    if ((W.itemT -= dt) <= 0) { W.itemReady = true; W.itemT = D.ITEM.gapMin + (D.ITEM.gapMax - D.ITEM.gapMin) * W.rand(); }

    const v = speed(W);
    W.dist += v * dt;

    const mag = W.eff.magnet > 0, cy = p.y + 0.5;
    for (let i = W.obs.length - 1; i >= 0; i--) {
      const o = W.obs[i];
      let rel = o.z - W.dist;
      if (rel < -D.GEN.behind) { W.obs.splice(i, 1); continue; }
      if (o.done) continue;
      if (o.kind === 'star' || o.kind === 'item') {
        // 자석: 가까운 별을 모든 줄에서 끌어온다
        if (mag && o.kind === 'star' && rel < D.ITEM.magnetRange && rel > -1.5) {
          const k = Math.min(1, dt * 12);
          o.x += (p.x - o.x) * k; o.y += (cy - o.y) * k;
          o.z -= rel * Math.min(1, dt * 4); rel = o.z - W.dist;
          o.mag = true;
        }
        if (Math.abs(rel) < 1.3 && Math.abs(o.x - p.x) < 0.6 && Math.abs(o.y - cy) < 1.1) {
          if (o.kind === 'star') takeStar(W, o); else usePower(W, o);
        }
        continue;
      }
      // 움직이는 운석: 가까이 오면 옆 줄로 미끄러진다
      if (o.moving && o.x !== o.to && rel < D.OBST.moverAt) {
        const s = D.OBST.moverSpeed * dt, d = o.to - o.x;
        o.x = Math.abs(d) <= s ? o.to : o.x + Math.sign(d) * s;
      }
      if (Math.abs(o.x - p.x) < P.hitW) {
        if (Math.abs(rel) < P.hitZ) {
          if (o.kind === 'gate' && p.y >= D.OBST.gateH) o.over = true;   // 뛰어서 넘는 중
          else { hit(W, o); if (W.phase !== 'play') break; }
        }
      }
      // 레이저 문을 무사히 넘었다
      if (o.kind === 'gate' && o.over && !o.done && !o.counted && rel < -P.hitZ) {
        o.counted = true; W.gates++;
        W.events.push('gate');
      }
    }
    W.score = Math.floor(W.dist) + W.stars * D.STAR.value;
    fill(W);
  }

  // 화면 한 번 사이에 흐른 시간만큼 1/120초 칸을 돌린다. 남은 시간 비율(W.alpha)은 그리기 보간용
  function step(W, dt) {
    W.acc += Math.min(0.1, Math.max(0, dt));
    while (W.acc >= TICK - 1e-9) { W.acc -= TICK; tick(W); W.ticks++; }
    W.alpha = Math.max(0, Math.min(1, W.acc / TICK));
  }

  // ─── 자동 운전 (테스트·시작 화면 시연) ──────────────────────
  // 앞쪽 1초 남짓을 보고 줄마다 가장 가까운 운석까지 거리를 잰다. 지금 줄이 위험하면 가장 여유 있는 줄로,
  // 안전하면 별·아이템이 있는 줄로. 레이저 문은 알맞은 때에 뛴다
  function bot(W) {
    const p = W.p, v = speed(W), look = v * 1.2 + 6;
    const near = [look, look, look], gain = [0, 0, 0];
    for (const o of W.obs) {
      if (o.done) continue;
      const rel = o.z - W.dist;
      if (rel < -P.hitZ || rel > look) continue;
      if (o.kind === 'meteor') {
        const ls = o.moving && o.x !== o.to ? [o.from, o.to] : [Math.round(o.x)];
        for (const l of ls) near[l] = Math.min(near[l], Math.max(0, rel));
      } else if (o.kind === 'gate') {
        if (Math.abs(o.x - p.x) < P.hitW && rel > P.hitZ * 0.5 && rel < v * P.jumpT * 0.4 && p.y <= 0) jump(W);
        gain[o.x] -= 0.5;
      } else if (o.kind === 'star') gain[Math.round(o.x)] += 1;
      else if (o.kind === 'item') gain[Math.round(o.x)] += 4;
    }
    if (Math.abs(p.x - p.lane) > 0.1) return;   // 옮기는 중
    const cur = p.lane;
    const score = l => near[l] * 2 + gain[l] - Math.abs(l - cur) * 1.5;
    let best = cur;
    for (let l = 0; l < 3; l++) {
      // 두 줄을 건너가려면 가운데 줄이 당장 막혀 있지 않아야 한다
      if (Math.abs(l - cur) === 2 && near[1] < v * 0.25) continue;
      if (score(l) > score(best)) best = l;
    }
    const danger = near[cur] < look;
    if (best !== cur && (danger || score(best) > score(cur) + 2)) move(W, best < cur ? 'left' : 'right');
  }

  // 지금 줄(목표 줄) 앞의 가장 가까운 장애물. 그리기(위험·점프 표시)용
  function dangerAhead(W, sec) {
    const p = W.p, v = speed(W);
    let best = null;
    for (const o of W.obs) {
      if (o.done || (o.kind !== 'meteor' && o.kind !== 'gate')) continue;
      const rel = o.z - W.dist;
      if (rel < P.hitZ || rel > v * sec) continue;
      const lanes = o.moving && o.x !== o.to ? [o.from, o.to] : [Math.round(o.x)];
      if (lanes.indexOf(p.lane) < 0) continue;
      if (!best || rel < best.rel) best = { o, rel, t: rel / v };
    }
    return best;
  }

  // 메달 확인용 이번 판 기록
  function runStats(W) {
    return {
      dist: Math.floor(W.dist), stars: W.stars, score: W.score, gates: W.gates, blocks: W.blocks,
      boosts: W.boosts, hits: W.hits, smashes: W.smashes, items: W.items, kinds: Object.keys(W.kinds).length,
      jumps: W.jumps, easy: W.easy, time: W.runT,
    };
  }

  RN.World = { create, step, tick, move, jump, speed, makeRow, fill, bot, dangerAhead, runStats, G, V0 };
})(RN);
