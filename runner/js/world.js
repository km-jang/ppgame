'use strict';
// 게임 규칙. DOM·canvas를 쓰지 않는다 (node 테스트가 그대로 불러 돌린다: tests/runner.test.js).
// 좌표: 줄 x (0·1·2, 왼쪽부터. 줄을 바꾸는 중에는 소수), 앞뒤 z (출발점부터 m), 높이 y (m).
// 우주선은 늘 z = W.dist에 있고, 앞에 놓인 물체는 W.dist가 커지면서 다가온다.
(function (RN) {
  const D = RN.DATA;
  const TICK = D.TICK;
  const P = D.PLAYER;
  const ITEM_KINDS = Object.keys(D.ITEM.kinds);
  const ROW_KINDS = ['one', 'two', 'gate', 'mg', 'gg', 'mover', 'stars'];

  // 난이도 이름 고르기: 'easy' | 'normal' | 'hard'. 옛 방식 { easy: false }는 보통
  function diffId(opts) {
    if (opts && D.DIFFICULTY[opts.diff]) return opts.diff;
    if (opts && opts.easy === false) return 'normal';
    return 'easy';
  }
  const cfg = W => D.DIFFICULTY[W.diff] || D.DIFFICULTY.easy;
  const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

  // 얼마나 어려워졌나 (0 → 1): 몸풀기 동안 0, 그 뒤 ramp초에 걸쳐 부드럽게 1까지
  function level(C, t) { return smooth((t - C.speed.warm) / C.speed.ramp); }
  function baseSpeed(C, t) { const S = C.speed; return S.base + (S.max - S.base) * level(C, t); }

  // 지금 속도(초당 m). 부스트 중엔 더 빠르고, 처음 안내 중엔 잠깐 느리다
  function speed(W) {
    const v = baseSpeed(cfg(W), W.runT) * (W.slow == null ? 1 : W.slow);
    return W.eff && W.eff.boost > 0 ? v * D.ITEM.boostMul : v;
  }

  // 몇 번째 우주 구역인가 (0부터)
  function zoneAt(dist) {
    let i = 0;
    while (i + 1 < D.ZONES.length && dist >= D.ZONES[i + 1].at) i++;
    return i;
  }

  // 상점 강화 한 단계 효과 (data.js UPGRADES)
  const upPer = id => { const u = (D.UPGRADES || []).find(x => x.id === id); return u ? u.per : 0; };

  // opts: { diff ('easy'|'normal'|'hard') 또는 easy (옛 방식, 기본 true), auto (자동 운전), wait (출발 대기 초),
  //         tutorial (처음 한 번 안내), up (상점 강화 단계 {magnet, shield, boost, coin}),
  //         loadout (시작 아이템 {shield, boost, heart}), skin (꾸미기 id, 그리기만) }
  function create(seed, opts) {
    opts = opts || {};
    const diff = diffId(opts), C = D.DIFFICULTY[diff];
    const W = {
      seed, diff, easy: diff === 'easy', rand: RN.rng(seed == null ? (Date.now() >>> 0) : seed),
      phase: 'play', t: 0, runT: 0, overT: 0, ticks: 0, acc: 0, alpha: 0,
      wait: opts.wait != null ? opts.wait : D.START.wait,
      dist: 0, pdist: 0, stars: 0, score: 0, bonus: 0, slow: 1,
      hearts: C.hearts,
      shield: false, inv: 0, eff: { magnet: 0, boost: 0 }, rainT: 0,
      p: { lane: 1, x: 1, px: 1, y: 0, py: 0, vy: 0, buf: 0, from: 1, lt: 1, jt: -1, fromLane: 1, fromT: -9 },
      obs: [], nextZ: D.START.firstRow, rowId: 0, itemT: C.item.first, itemReady: false,
      nextArch: D.MILESTONE.every, zone: 0,
      chain: 0, lastStar: -9, lastNear: -9,
      // 이번 판 기록 (메달·결과 화면)
      jumps: 0, gates: 0, hits: 0, blocks: 0, boosts: 0, smashes: 0, items: 0, kinds: {}, laneMoves: 0,
      nears: 0, perfects: 0, milestones: 0, heals: 0,
      cause: '', auto: !!opts.auto,
      tut: opts.tutorial ? { step: 'lane', tries: 0, want: false, show: '', rows: 0 } : null,
      events: [],   // 소리·진동 (main.js가 비운다)
      fx: [],       // 입자·글자 연출 (render.js가 비운다)
    };
    // 상점 강화: 자석·부스트 시간, 방패가 막은 뒤 깜빡이는 시간
    const up = opts.up || {};
    W.skin = opts.skin || 'basic';
    W.magnetTime = D.ITEM.kinds.magnet.time + Math.min(5, up.magnet || 0) * upPer('magnet');
    W.boostTime = D.ITEM.kinds.boost.time + Math.min(5, up.boost || 0) * upPer('boost');
    W.shieldInv = D.HIT.shieldInv + Math.min(5, up.shield || 0) * upPer('shield');
    // 시작 아이템
    const lo = opts.loadout || {};
    if (lo.shield) W.shield = true;
    if (lo.heart && diff !== 'hard') W.hearts += 1;
    if (lo.boost) { W.eff.boost = W.boostTime; W.events.push('boost'); }
    W.loadout = Object.keys(lo).filter(k => lo[k]);
    W.maxHearts = W.hearts;
    W.hitAt = 0; W.clean = 0;   // 안 부딪히고 간 가장 긴 거리 (미션)
    fill(W);
    return W;
  }

  // ─── 줄 만들기 ─────────────────────────────────────────────
  // 한 줄 = 같은 z에 놓인 장애물 묶음. 어떤 줄이든 장애물이 전혀 없는 줄이 하나 이상 남는다.
  // 줄 사이 간격은 그 줄에 닿을 때의 속도 × gap초라서, 빨라져도 피할 시간은 같다
  function shuffle3(r) {
    const a = [0, 1, 2];
    for (let i = 2; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // 지금 난이도에서 줄 모양 가중치 (몸풀기 → 시작 → 끝으로 부드럽게)
  function rowWeights(W, t) {
    const C = cfg(W);
    if (C.warmRows && t < C.speed.warm) return C.warmRows;
    const k = level(C, t), a = C.rows.start, b = C.rows.end;
    return ROW_KINDS.map(kk => ({ k: kk, w: (a[kk] || 0) + ((b[kk] || 0) - (a[kk] || 0)) * k })).filter(x => x.w > 0);
  }
  function gapSec(C, t, r) {
    const k = level(C, t), g0 = C.gap.start, g1 = C.gap.end;
    const lo = g0[0] + (g1[0] - g0[0]) * k, hi = g0[1] + (g1[1] - g0[1]) * k;
    return lo + (hi - lo) * r;
  }

  function makeRow(W) {
    const C = cfg(W), r = W.rand, z = W.nextZ, id = ++W.rowId;
    // 이 줄에 닿을 때쯤의 시간으로 모양·간격을 정한다 (빨라지는 중에도 피할 시간이 줄지 않게)
    const vNow = Math.max(1, baseSpeed(C, W.runT));
    const tArrive = W.runT + Math.max(0, z - W.dist) / vNow;
    let pat = RN.weighted(rowWeights(W, tArrive), r).k;
    const tut = W.tut;
    if (tut && tut.step === 'jump' && tut.want) { pat = 'tut'; tut.want = false; }
    const L = shuffle3(r);
    const row = { id, z, pat, lanes: [null, null, null], mover: null };
    const meteor = l => { row.lanes[l] = 'meteor'; W.obs.push({ kind: 'meteor', x: l, z, row: id }); };
    const gate = (l, extra) => { row.lanes[l] = 'gate'; W.obs.push(Object.assign({ kind: 'gate', x: l, z, row: id }, extra)); };
    switch (pat) {
      case 'one': meteor(L[0]); break;
      case 'two': meteor(L[0]); meteor(L[1]); break;
      case 'gate': gate(L[0]); break;
      case 'mg': meteor(L[0]); gate(L[1]); break;
      case 'gg': gate(L[0]); gate(L[1]); break;
      case 'tut': for (let l = 0; l < 3; l++) gate(l, { tut: true }); break;   // 처음 안내: 모두 막지만 부딪혀도 괜찮다
      case 'mover': {
        // 가운데 줄에서 출발하면 양옆 중 하나로, 가장자리면 가운데로 미끄러진다. 나머지 한 줄은 늘 비어 있다
        const from = L[0], to = from === 1 ? (r() < 0.5 ? 0 : 2) : 1;
        row.lanes[from] = 'mover'; row.lanes[to] = 'mover'; row.mover = { from, to };
        W.obs.push({ kind: 'meteor', x: from, from, to, z, row: id, moving: true });
        break;
      }
    }
    row.free = [0, 1, 2].filter(l => !row.lanes[l]);
    const guide = row.free.length ? row.free[Math.floor(r() * row.free.length)] : 1;
    const vArrive = Math.max(1, baseSpeed(C, tArrive));
    const gapM = Math.max(D.GEN.minGap, vArrive * gapSec(C, tArrive, r()));
    // 별: 안전한 줄에 한 줄로 늘어서서 길을 알려 준다. 별만 있는 줄은 옆 줄로 비스듬히 건너간다.
    // 같은 줄의 별은 line을 함께 들고 있어, 모두 먹으면 "완벽!"
    const n = D.STAR.lineN, span = Math.min(gapM * 0.55, 12);
    if (pat === 'stars') {
      const a = guide, b = a === 1 ? (r() < 0.5 ? 0 : 2) : 1, line = { n: n * 2, got: 0 };
      for (let i = 0; i < n * 2; i++) W.obs.push({ kind: 'star', x: i < n ? a : b, y: 0.5, z: z - span + (span * 2) * i / (n * 2 - 1), row: id, line });
    } else if (pat !== 'tut' && r() < C.starLine) {
      const line = { n, got: 0 };
      for (let i = 0; i < n; i++) W.obs.push({ kind: 'star', x: guide, y: 0.5, z: z - span + span * i / (n - 1) - 1.5, row: id, line });
    }
    // 레이저 문 위에는 가끔 무지개 모양 별: 뛰어넘으면 먹는다
    for (let l = 0; l < 3; l++) {
      if (row.lanes[l] !== 'gate' || (pat !== 'tut' && r() < 0.5)) continue;
      const line = { n: 3, got: 0 };
      for (const [dz, y] of [[-3, 1.2], [0, 1.9], [3, 1.2]]) W.obs.push({ kind: 'star', x: l, y, z: z + dz, row: id, line });
    }
    // 아이템: 때가 됐으면 안전한 줄, 장애물과 같은 자리에 (피하면 선물)
    if (W.itemReady && pat !== 'tut') {
      W.itemReady = false;
      const ws = C.item.w;
      const ks = ITEM_KINDS.filter(k => (ws[k] || 0) > 0 && !(k === 'shield' && W.shield) && !(k === 'heart' && W.hearts >= W.maxHearts))
        .map(k => ({ k, w: ws[k] }));
      if (ks.length) {
        const item = RN.weighted(ks, r).k;
        W.obs.push({ kind: 'item', item, x: guide, y: 0.7, z, row: id });
        row.item = item;
        W.events.push('item');
      }
    }
    W.nextZ = z + gapM;
    W.lastRow = row;
    return row;
  }

  // 앞쪽 VIEW m까지 줄과 기념 아치를 채운다
  function fill(W) {
    while (W.nextZ < W.dist + D.VIEW) makeRow(W);
    while (W.nextArch < W.dist + D.VIEW) {
      W.obs.push({ kind: 'arch', x: 1, z: W.nextArch, m: W.nextArch, zone: zoneAt(W.nextArch + 1) });
      W.nextArch += D.MILESTONE.every;
    }
  }

  // ─── 조작 ─────────────────────────────────────────────────
  // dir: 'left' | 'right' | 'jump'. 출발 대기 중에도 된다. 바뀌었으면 true
  function move(W, dir) {
    if (W.phase !== 'play') return false;
    const p = W.p;
    if (dir === 'jump' || dir === 'up') return jump(W);
    const to = dir === 'left' ? p.lane - 1 : dir === 'right' ? p.lane + 1 : p.lane;
    if (to < 0 || to > 2 || to === p.lane) return false;
    p.fromLane = p.lane; p.fromT = W.t;
    p.lane = to; p.from = p.x; p.lt = 0;
    W.laneMoves++;
    W.events.push('lane');
    if (W.tut && W.tut.step === 'lane') { W.tut.step = 'jump'; W.tut.want = true; W.events.push('tutStep'); }
    return true;
  }

  // 땅에 있으면 바로 뛰고, 떠 있으면 잠깐 기억했다가 닿자마자 뛴다
  function jump(W) {
    if (W.phase !== 'play') return false;
    const p = W.p;
    if (p.jt < 0) {
      p.jt = 0; p.buf = 0; W.jumps++;
      W.events.push('jump');
      return true;
    }
    p.buf = P.buffer;
    return false;
  }
  // 점프 높이: 빨리 오르고 꼭대기에서 잠깐 머물다 내려온다 (u = 0 → 1)
  const jumpY = u => P.jumpH * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), P.arc);
  // 줄 바꾸기 곡선: 처음 빠르고 끝이 부드럽게 멈춘다
  const laneEase = u => 1 - Math.pow(1 - u, 3);

  // ─── 부딪힘 · 줍기 ─────────────────────────────────────────
  function hit(W, o) {
    if (o.tut) {
      // 처음 안내용 문: 부딪혀도 괜찮다. 다시 한 번 기회
      o.done = true;
      const T = W.tut;
      if (T && T.step === 'jump') { T.tries++; if (T.tries >= D.TUTORIAL.tries) finishTut(W, false); else T.want = true; }
      W.fx.push({ kind: 'tutmiss', x: o.x, z: o.z });
      W.events.push('tutMiss');
      return;
    }
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
      W.shield = false; W.blocks++; W.inv = W.shieldInv; W.hitAt = W.dist;
      W.fx.push({ kind: 'shield', x: o.x, z: o.z, what: o.kind });
      W.events.push('shield');
      return;
    }
    W.hearts--; W.hits++; W.inv = cfg(W).inv; W.chain = 0; W.hitAt = W.dist;
    W.fx.push({ kind: 'hit', x: o.x, z: o.z, what: o.kind });
    if (W.hearts <= 0) {
      W.hearts = 0; W.phase = 'over'; W.cause = o.kind; W.inv = 0;
      W.events.push('over');
      W.fx.push({ kind: 'crash', x: W.p.x, z: W.dist });
    } else W.events.push('hit');
  }

  function finishTut(W, ok) {
    const T = W.tut;
    if (!T || T.step === 'done') return;
    T.step = 'done'; T.show = ''; T.ok = ok;
    W.events.push('tutDone');
    if (ok) W.fx.push({ kind: 'tutok', x: W.p.x, z: W.dist });
  }

  function usePower(W, o) {
    const K = D.ITEM.kinds[o.item];
    o.done = true; W.items++; W.kinds[o.item] = true;
    if (o.item === 'shield') W.shield = true;
    else if (o.item === 'heart') { W.hearts = Math.min(W.maxHearts, W.hearts + 1); W.heals++; }
    else W.eff[o.item] = o.item === 'magnet' ? W.magnetTime : o.item === 'boost' ? W.boostTime : K.time;
    if (o.item === 'boost') { W.boosts++; W.events.push('boost'); } else if (o.item === 'heart') W.events.push('heal'); else W.events.push('power');
    W.fx.push({ kind: 'power', x: o.x, z: o.z, y: o.y, item: o.item });
  }

  function takeStar(W, o) {
    o.done = true; W.stars++;
    W.chain = W.t - W.lastStar <= D.STAR.chainGap ? W.chain + 1 : 1;
    W.lastStar = W.t;
    W.events.push('star');
    W.fx.push({ kind: 'star', x: o.x, z: o.z, y: o.y });
    const line = o.line;
    if (line && ++line.got === line.n) {
      W.perfects++; W.bonus += D.STAR.perfect;
      W.events.push('perfect');
      W.fx.push({ kind: 'perfect', x: o.x, z: o.z, y: o.y, pts: D.STAR.perfect });
    }
  }

  // ─── 한 칸(1/120초) ───────────────────────────────────────
  function tick(W) {
    const dt = TICK, p = W.p;
    W.t += dt;
    p.px = p.x; p.py = p.y; W.pdist = W.dist;
    if (W.phase !== 'play') { W.overT += dt; return; }
    if (W.auto) bot(W);

    // 줄 바꾸기: laneT초 동안 곡선을 따라 미끄러진다 (도중에 또 바꾸면 지금 자리에서 다시)
    if (p.lt < 1) {
      p.lt = Math.min(1, p.lt + dt / P.laneT);
      p.x = p.from + (p.lane - p.from) * laneEase(p.lt);
      if (p.lt >= 1) p.x = p.lane;
    }
    // 점프
    if (p.jt >= 0) {
      p.jt += dt;
      const u = p.jt / P.jumpT, y0 = p.y;
      if (u >= 1) {
        p.y = 0; p.vy = 0; p.jt = -1;
        W.events.push('land');
        if (p.buf > 0) jump(W);
      } else { p.y = jumpY(u); p.vy = (p.y - y0) / dt; }
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
    const IC = cfg(W).item;
    if ((W.itemT -= dt) <= 0) { W.itemReady = true; W.itemT = IC.gap[0] + (IC.gap[1] - IC.gap[0]) * W.rand(); }

    // 처음 안내: 안내용 문이 다가오면 "위로 밀어서 점프"를 띄우고 천천히
    const T = W.tut;
    let slowTo = 1;
    if (T && T.step !== 'done') {
      T.show = T.step === 'lane' ? 'lane' : '';
      if (T.step === 'jump') {
        const v0 = baseSpeed(cfg(W), W.runT);
        for (const o of W.obs) {
          if (!o.tut || o.done || o.x !== 1) continue;
          const rel = o.z - W.dist;
          if (rel > -P.hitZ && rel < v0 * D.TUTORIAL.showSec) { T.show = 'jump'; slowTo = D.TUTORIAL.slow; }
        }
      }
    }
    W.slow += (slowTo - W.slow) * Math.min(1, dt * 4);

    const v = speed(W);
    W.dist += v * dt;
    if (W.dist - W.hitAt > W.clean) W.clean = W.dist - W.hitAt;

    // 우주 구역
    const zi = zoneAt(W.dist);
    if (zi !== W.zone) { W.zone = zi; W.events.push('zone'); W.fx.push({ kind: 'zone', i: zi }); }

    const mag = W.eff.magnet > 0, cy = p.y + 0.5;
    for (let i = W.obs.length - 1; i >= 0; i--) {
      const o = W.obs[i];
      let rel = o.z - W.dist;
      if (rel < -D.GEN.behind) { W.obs.splice(i, 1); continue; }
      if (o.done) continue;
      if (o.kind === 'arch') {
        // 기념 아치를 지나감
        if (rel <= 0 && !o.got) {
          o.got = true; W.milestones++; W.bonus += D.MILESTONE.bonus;
          W.events.push('milestone');
          W.fx.push({ kind: 'milestone', m: o.m, pts: D.MILESTONE.bonus });
        }
        continue;
      }
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
      if (rel < -P.hitZ && !o.passed && !o.done) {
        o.passed = true;
        // 레이저 문을 무사히 넘었다
        if (o.kind === 'gate' && o.over) {
          o.counted = true; W.gates++;
          W.events.push('gate');
          if (o.tut) finishTut(W, true);
        } else if (!o.tut) nearMiss(W, o);
      }
    }
    W.score = Math.floor(W.dist) + W.stars * D.STAR.value + W.bonus;
    fill(W);
  }

  // 아슬아슬: 이 장애물이 있던 줄에서 방금(window초 안) 옆 줄로 비켜 지나갔다
  function nearMiss(W, o) {
    const p = W.p, N = D.NEAR, side = Math.abs(o.x - p.x);
    if (W.eff.boost > 0 || W.inv > 0 || side < P.hitW || side > N.side) return false;
    if (Math.round(o.x) !== p.fromLane || W.t - p.fromT > N.window || W.t - W.lastNear < N.cool) return false;
    W.lastNear = W.t; W.nears++; W.bonus += N.bonus;
    W.events.push('near');
    W.fx.push({ kind: 'near', x: p.x, z: W.dist, pts: N.bonus });
    return true;
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
      jumps: W.jumps, easy: W.diff === 'easy', diff: W.diff, time: W.runT,
      zone: zoneAt(W.dist), nears: W.nears, perfects: W.perfects, milestones: W.milestones, heals: W.heals,
    };
  }

  RN.World = { create, step, tick, move, jump, speed, baseSpeed, level, rowWeights, makeRow, fill, bot, dangerAhead, runStats, zoneAt, diffId, cfg, jumpY };
})(RN);
