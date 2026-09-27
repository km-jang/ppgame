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

  const clamp01 = v => Math.max(0, Math.min(1, v));
  // 캐릭터 고르기 (D.CHARS). 모르는 id면 첫 캐릭터(통통 로봇)
  const charOf = id => D.CHARS.find(c => c.id === id) || D.CHARS[0];
  // 캐릭터의 몸 움직임 값: 튀는 높이·스프링 높이·오를 때/내려올 때 중력·별 먹는 거리 배율
  function physOf(ch) {
    const T = charOf(ch).trait || {};
    return {
      jump: P0.jump * (T.jump || 1), spring: D.SPRING.jump * (T.spring || 1),
      gUp: P0.gravity, gDown: P0.gravity * (T.fall || 1), magnet: T.magnet || 1,
    };
  }
  // 지금 (높이 y0, 세로 속도 vy)에서 t초 뒤 높이. 오를 때와 내려올 때 중력이 다를 수 있다 (펭귄)
  function yAfter(y0, vy, t, F) {
    if (vy > 0) {
      const up = vy / F.gUp;
      if (t <= up) return y0 + vy * t - F.gUp * t * t / 2;
      const top = y0 + vy * vy / (2 * F.gUp), k = t - up;
      return top - F.gDown * k * k / 2;
    }
    return y0 + vy * t - F.gDown * t * t / 2;
  }
  // 지금부터 높이 y에 (내려오며) 닿기까지 걸리는 시간. 닿지 못하면 -1
  function fallTime(y0, vy, y, F) {
    let t0 = 0, top = y0, v = vy;
    if (vy > 0) { t0 = vy / F.gUp; top = y0 + vy * vy / (2 * F.gUp); v = 0; }
    const q = v * v + 2 * F.gDown * (top - y);
    return q < 0 ? -1 : t0 + (v + Math.sqrt(q)) / F.gDown;
  }
  // 난이도 표 고르기: opts.diff가 먼저, 없으면 예전 방식 opts.easy (true 쉬움 · 그 밖 보통)
  function levelOf(opts) {
    opts = opts || {};
    if (opts.diff && D.DIFFICULTY[opts.diff]) return D.DIFFICULTY[opts.diff];
    return D.DIFFICULTY[opts.easy ? 'easy' : 'normal'];
  }
  // 높이(점)에 따른 어려움 0 ~ 1: 몸풀기(warm)까지 0, full에서 1, 그 사이는 곧게 이어진다
  const diffAt = (y, L) => { L = L || D.DIFFICULTY.normal; return clamp01((y / D.METER - L.warm) / Math.max(1, L.full - L.warm)); };
  // 몸풀기가 얼마나 끝났는지 0 ~ 1 (몸풀기 간격·폭에서 본 값으로 부드럽게 넘어간다)
  const warmAt = (y, L) => (L.warm > 0 ? clamp01(y / D.METER / L.warm) : 1);
  // 높이(m)에 있는 구역 번호 (D.ZONES)
  function zoneAt(m) {
    let z = 0;
    for (let i = 0; i < D.ZONES.length; i++) if (m >= D.ZONES[i].from) z = i;
    return z;
  }
  // 높이(m)까지 지나온 행성 수 (0 = 아직, 1 수성 … 9 명왕성)
  function planetAt(m) {
    let n = 0;
    for (const p of D.PLANETS) if (m >= p.at) n++;
    return n;
  }
  // 높이(m)까지 지나온 여정 배너 수 (D.SKY.legs: 구름 속 · 높은 하늘 · 대기권 돌파). 그림 전용이라 놀이에는 영향 없음
  function legAt(m) {
    let n = 0;
    for (const g of D.SKY.legs) if (m >= g.at) n++;
    return n;
  }
  // 블랙홀 구간 목록을 높이 upto(m)까지 미리 정해 둔다 (판마다 따로 도는 난수 W.hrand, 발판 자리와는 상관없다).
  // 구간 {id, from, to, side(-1 왼쪽 · 1 오른쪽)}. 두 구간 사이는 늘 gap 최소보다 멀다 (연달아 오지 않는다)
  function holesUpTo(W, upto) {
    const B = D.BLACKHOLE, L = W.holeList;
    let last = L[L.length - 1];
    while (!last || last.to < upto) {
      const from = last ? last.to + B.gap[0] + W.hrand() * (B.gap[1] - B.gap[0]) : W.holeFirst + W.hrand() * (B.gap[1] - B.gap[0]) * 0.5;
      last = { id: L.length + 1, from, to: from + B.len, side: W.hrand() < 0.5 ? -1 : 1 };
      L.push(last);
    }
    return L;
  }
  // 높이 m(m)가 들어 있는 블랙홀 구간 (없으면 null)
  function holeAt(W, m) {
    if (m < W.holeFirst) return null;
    for (const h of holesUpTo(W, m + 1)) if (m >= h.from && m < h.to) return h;
    return null;
  }

  // 콤보에 따른 별 점수 배율 (step번마다 add씩, max까지)
  const comboMul = c => { const C = D.COMBO; return Math.min(C.max, 1 + Math.floor(Math.max(0, c) / C.step) * C.add); };

  // 알아서 맞춰 주는 난이도 배율(common/hub.js adaptMul)을 규칙 값 배율로 (D.ADAPT 지수). 이상한 값이면 1
  function adaptOf(mul) {
    const X = D.ADAPT, n = Number(mul);
    const m = Number.isFinite(n) && n > 0 ? Math.max(0.8, Math.min(1.2, n)) : 1;
    return { mul: m, ramp: Math.pow(m, X.ramp), mix: Math.pow(m, X.mix), monster: Math.pow(m, X.monster), storm: Math.pow(m, X.storm) };
  }
  // 먹구름이 지금 오르는 빠르기 (m/초): 높이에 따라 처음 → 끝, 맞춤 배율을 곱한다
  function stormSpeed(W, h) {
    const S = W.L.storm;
    if (!S) return 0;
    return lerp(S.speed[0], S.speed[1], clamp01((h == null ? W.height : h) / S.ramp)) * W.A.storm;
  }

  // 가중치 표에서 하나 뽑기. mix: 구역별 배율, only: 이 종류들만 (몸풀기)
  function pickKind(table, d, rand, mix, only) {
    const items = Object.keys(table).filter(k => !only || only.includes(k))
      .map(k => ({ k, w: lerp(table[k][0], table[k][1], d) * ((mix && mix[k]) || 1) }));
    return JP.weighted(items, rand).k;
  }

  // ─── 만들기 ────────────────────────────────────────────────
  function addPlat(W, kind, x, y, w) {
    const p = { id: ++W.ids, kind, x, y, w, px: x, vx: 0, broken: false, bt: 0, on: true, t: 0, hit: -9 };
    if (kind === 'moving') {
      const S = W.L.moveSpeed, d = diffAt(y, W.L);
      p.vx = lerp(S[0], S[1], d) * (W.rand() < 0.5 ? -1 : 1);
    }
    if (kind === 'cloud') p.t = W.rand() * (D.CLOUD.on + D.CLOUD.off);   // 구름마다 박자가 다르다
    W.plats.push(p);
    return p;
  }

  // 한 줄: 길을 이루는 발판 하나 + 가끔 곁 발판·별·아이템·가시 폭탄
  function row(W) {
    const rand = W.rand, L = W.L, d = diffAt(W.genY, L), k = warmAt(W.genY, L), warm = k < 1;
    const zi = zoneAt(W.genY / D.METER), Z = D.ZONES[zi], mix = W.mixes[zi];
    const G = L.gap;
    const gMin = lerp(L.warmGap[0], lerp(G[0], G[2], d), k), gMax = lerp(L.warmGap[1], lerp(G[1], G[3], d), k);
    const y = W.genY + gMin + rand() * (gMax - gMin);
    const w = Math.round(lerp(L.warmW, lerp(L.w[0], L.w[1], d), k));
    // 몸풀기에는 보통 발판과 스프링만
    const kind = pickKind(L.main, d, rand, mix, warm ? ['normal', 'spring'] : null);
    const pw = kind === 'spring' ? w * 0.85 : w;
    const x = pw / 2 + rand() * (WW - pw);
    const main = addPlat(W, kind, x, y, pw);
    main.main = true;   // 길을 이루는 발판 (몬스터가 이 길을 막지 않게)
    const xs = [x];
    let extra = null;
    // 곁 발판: 길 발판과 겹치지 않는 자리에
    const EC = L.extraChance;
    if (rand() < lerp(EC[0], EC[1], d)) {
      for (let k = 0; k < 6; k++) {
        const ex = w / 2 + rand() * (WW - w);
        if (Math.abs(wrapDelta(ex, x)) < w + 24) continue;
        // 길 발판이 움직이면 그 발판이 지나다니는 줄을 비우고 앞 줄과의 가운데 높이에
        const ey = kind === 'moving' ? (W.genY + y) / 2 + 8 : y + (rand() - 0.5) * 30;
        const ek = pickKind(L.extra, d, rand, mix, warm ? ['normal'] : null);
        // 먼저 놓인 몬스터와 겹쳐 보이면 곁 발판은 놓지 않는다 (곁 발판은 길이 아니라 없어도 된다. 난수는 똑같이 쓴다)
        // 몬스터 바로 위를 덮어 밟을 수 없게 만드는 자리(지붕)도 피한다
        const MO = D.MONSTER, hit = W.monsters.some(m => !m.gone && ey > m.y0 - MO.r - m.float - 4 && ey - D.PLAT.h < m.y0 + MO.r + m.float + MO.roof &&
          Math.abs(wrapDelta(ex, m.x0)) < w / 2 + m.range + MO.r + 6);
        if (!hit) extra = addPlat(W, ek, ex, ey, w);
        xs.push(ex);
        break;
      }
    }
    // 별: 발판 위에 하나, 가끔 세로로 줄지어
    if (rand() < D.STAR.chance + (mix.star || 0)) {
      const n = rand() < D.STAR.lineChance ? D.STAR.line : 1;
      const sx = kind === 'moving' ? WW / 2 + (rand() - 0.5) * WW * 0.6 : x;
      for (let i = 0; i < n; i++) W.stars.push({ id: ++W.ids, x: sx, y: y + 70 + i * 55, got: false });
    }
    // 아이템: 정해 둔 높이를 지나면 길 발판 위에
    if (y >= W.nextItem) {
      const kinds = Object.keys(D.ITEM.kinds).map(k => ({ k, w: D.ITEM.kinds[k].w }));
      W.items.push({ id: ++W.ids, kind: JP.weighted(kinds, rand).k, x: main.kind === 'moving' ? WW / 2 : x, y: y + 60, got: false, seen: -1 });
      const IG = L.itemGap;
      W.nextItem = y + (IG[0] + rand() * (IG[1] - IG[0])) * D.METER;
    }
    // 가시 폭탄 (보통·어려움): 이번 줄과 앞 줄 사이, 두 발판에서 가로로 멀리
    const M = D.MINE, LM = L.mine;
    if (LM && y / D.METER >= LM.from && rand() < lerp(LM.chance[0], LM.chance[1], d)) {
      const my = (W.genY + y) / 2, reach = W.phys.jump + P0.r * 2 + M.r + 20;
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
    // 피버 중에 새로 생기는 줄: 길 발판 위에 별 하나 더 (따로 도는 난수 W.grand, 발판 자리는 그대로)
    if (W.feverT > 0 && W.grand() < D.FEVER.extra) W.stars.push({ id: ++W.ids, x: main.kind === 'moving' ? WW / 2 : x, y: y + 60, got: false });
    // 비밀 방 문: 정해 둔 높이를 지나면 보통 길 발판 위에 (블랙홀 구간이 아닐 때)
    if (y >= W.nextDoor && main.kind === 'normal' && !warm && !holeAt(W, y / D.METER)) {
      W.doors.push({ id: ++W.ids, x, y: y + D.ROOM.r, used: false, seen: -1 });
      const RE = D.ROOM.every;
      W.nextDoor = y + (RE[0] + W.grand() * (RE[1] - RE[0])) * D.METER;
    }
    // 밟는 몬스터: 따로 도는 난수(W.mrand)를 써서 발판 자리는 몬스터가 있든 없든 같다
    const LO = L.monster;
    if (LO && !warm && y / D.METER >= LO.from && W.mrand() < lerp(LO.chance[0], LO.chance[1], d) * W.A.monster * (Z.mix.monster || 1)) {
      const m = placeMonster(W, LO, d, main, extra, y);
      if (m && m.perch) xs.push(m.x0);   // 받침 발판도 다음 줄 가시 폭탄이 피해 가게
    }
    W.prevXs = xs;
    W.recent.push({ y, xs, w: pw, kind });
    if (W.recent.length > 4) W.recent.shift();
    W.genY = y;
  }

  // 몬스터 자리 확인. 길을 막지 않게 (닿지 못하는 틈이 없다를 지킨다):
  //   길 발판(main)에서 튀어 오르는 길: 몬스터가 오가는 범위(x ± hr)가 길 발판 가운데에서 가로로 pad 넘게 떨어져 있어야 한다
  //     (발판 가운데에 내려앉아 곧게 튀면 절대 닿지 않는다),
  //   앞 길 발판에서 이번 길 발판으로 건너가는 길목에도 두지 않는다.
  //   곁 발판·가시 폭탄·다른 몬스터와는 겹쳐 보이지 않게 조금 떨어뜨린다.
  // host: 슬라임이 앉은 곁 발판 (그 발판은 빼고 잰다. 위에서 내려오면 밟기라 괜찮다)
  function monsterSpotOk(W, x, hr, my, host, main, fl) {
    fl = fl || 0;   // 둥실거리는 폭 (위아래로 이만큼 더 차지한다)
    const M = D.MONSTER, r = P0.r;
    // 위쪽은 그 발판에 내려앉은 주인공 몸이 몬스터에 닿을 수 있는 높이까지만 (발판 윗면이 몬스터 가운데보다 몸 반지름 넘게 위면 안 닿는다)
    const below = W.phys.jump + r * 2 + M.r + 10, above = M.r + 4;
    // 스프링은 훨씬 높이 튀므로 그만큼 아래까지 본다
    const belowSpring = W.phys.spring + r * 2 + M.r + 10;
    for (const p of W.plats) {
      if (p === host || p.broken) continue;
      const dx = Math.abs(wrapDelta(x, p.x)) - hr;
      if (p.kind === 'spring' && p.y >= my - belowSpring && p.y <= my + above && dx < M.pad) return false;
      // 어느 발판과도 겹쳐 보이지 않게 (발판은 윗면 p.y에서 아래로 두께 D.PLAT.h)
      if (p.y > my - M.r - fl - 4 && p.y - D.PLAT.h < my + M.r + fl + 6 && dx < p.w / 2 + M.r + 6) return false;
      // 바로 위를 발판이 덮고 있으면 위에서 밟을 수 없으니 놓지 않는다 (지붕)
      if (p.y > my && p.y - D.PLAT.h < my + M.r + fl + M.roof && dx < p.w / 2 + M.r * 0.5) return false;
      if (p.main) {
        if (p.y < my - below || p.y > my + above) continue;
        // 움직이는 길 발판은 오가는 범위 전체를 막는다 (어디서 튀어 오를지 모르니까)
        if (p.kind === 'moving' || dx < M.pad) return false;
      } else {
        // 곁 발판: 겹쳐 보이지 않게, 그리고 그 발판에서 곧게 튀어 올라도 닿지 않게
        if (!W.easy && p.y > my - below && p.y < my + above && dx < p.w / 2 + r + M.r * M.hurt + 4) return false;
      }
    }
    // 앞 길 발판 → 이번 길 발판 사이 가로 길목
    const span = wrapDelta(W.prevXs[0], main.x);
    for (const e of [-hr, 0, hr]) {
      const dm = wrapDelta(W.prevXs[0], x + e);
      if (Math.sign(dm) === Math.sign(span) && Math.abs(dm) < Math.abs(span) + M.pad * 0.5 && my < main.y + above) return false;
    }
    for (const m of W.mines) if (!m.gone && Math.abs(wrapDelta(x, m.x)) - hr < D.MINE.r + M.r + 40 && Math.abs(m.y - my) < 80) return false;
    // 다른 몬스터: 겹치지 않게, 그리고 아래 몬스터를 밟고 크게 튀어 오른 길(stomp)에도 두지 않는다
    const belowStomp = W.phys.jump * M.stomp + r * 2 + M.r + 10;
    for (const o of W.monsters) {
      if (o.gone) continue;
      const dx = Math.abs(wrapDelta(x, o.x0)) - hr - o.range;
      if (dx < M.r * 2 + 30 && Math.abs(o.y0 - my) < 70) return false;
      if (o.y0 < my && o.y0 > my - belowStomp && dx < M.pad) return false;
    }
    return true;
  }

  function placeMonster(W, LO, d, main, extra, y) {
    const M = D.MONSTER, rand = W.mrand;
    const items = Object.keys(LO.kinds).map(k => ({ k, w: lerp(LO.kinds[k][0], LO.kinds[k][1], d) }));
    // 슬라임은 곁 발판(보통 발판)에만 앉는다. 길 발판에는 절대 앉지 않는다 (길을 막지 않게).
    // 앉을 곁 발판이 있으면 슬라임이 잘 나오고(slime 확률), 없으면 풍선 괴물·로봇 새 중에서
    // 곁 발판이 길 발판보다 조금이라도 높으면 앉히지 않는다 (다음 줄 길 발판이 바로 위에 와서 몬스터와 겹쳐 보이지 않게)
    const seat = extra && extra.kind === 'normal' && extra.y <= main.y - M.seatBelow;
    let kind = JP.weighted(items, rand).k;
    if (seat && rand() < M.seat) kind = 'slime';
    const K = M.kinds[kind];
    let x = 0, my = 0, hr = 0, host = null, ok = false;
    if (kind === 'slime' && !seat) {
      // 앉을 곁 발판이 없으면 두 줄 사이에 작은 받침 발판(perch)을 하나 놓고 그 위에 앉힌다 (길 발판은 그대로)
      const pw = M.perch, py = (W.genY + y) / 2, room = Math.max(0, pw / 2 - M.r * 0.8);
      my = py + M.r;
      for (let k = 0; k < 8 && !ok; k++) {
        x = pw / 2 + rand() * (WW - pw);
        hr = rand() < lerp(LO.walk[0], LO.walk[1], d) ? room : 0;
        ok = monsterSpotOk(W, x, hr, my, null, main) && W.plats.every(p => p.broken || Math.abs(p.y - py) > 34 || Math.abs(wrapDelta(x, p.x)) > (p.w + pw) / 2 + 12) &&
          W.mines.every(q => q.gone || q.y < py || q.y > py + W.phys.jump + P0.r * 2 + D.MINE.r || Math.abs(wrapDelta(x, q.x)) >= D.MINE.clear);
      }
      if (!ok) return null;
      host = addPlat(W, 'normal', x, py, pw);
      host.perch = true;
    } else if (kind === 'slime') {
      host = extra;
      const walk = rand() < lerp(LO.walk[0], LO.walk[1], d);
      const room = Math.max(0, host.w / 2 - M.r * 0.8);
      my = host.y + M.r;
      // 걸어 다니는 슬라임이 길을 막으면, 발판 한쪽 끝에 가만히 앉혀 본다
      const tries = walk ? [[0, room], [-room, 0], [room, 0]] : rand() < 0.5 ? [[-room, 0], [room, 0]] : [[room, 0], [-room, 0]];
      for (const [off, h] of tries) {
        x = host.x + off; hr = h;
        if ((ok = monsterSpotOk(W, x, hr, my, host, main))) break;
      }
    } else {
      hr = K.range;
      my = (W.genY + y) / 2;
      for (let k = 0; k < 8 && !ok; k++) {
        x = 30 + rand() * (WW - 60);
        ok = monsterSpotOk(W, x, hr, my, null, main, K.float);
      }
    }
    if (!ok) return null;
    // 받침 발판을 줄 끝에 넣었으니 아래에서 버릴 때 순서가 어긋나지 않게 높이 순으로 다시 둔다
    if (host && host.perch) W.plats.sort((a, b) => a.y - b.y);
    const sp = K.speed * (0.8 + rand() * 0.4) * (rand() < 0.5 ? -1 : 1);
    const m = { id: ++W.ids, kind, x: x, px: x, x0: x, y: my, y0: my, off: 0, range: hr, vx: hr > 0 ? sp : 0,
      float: K.float || 0, host: host ? host.id : 0, perch: !!(host && host.perch), gone: false, cool: 0, seen: -1, hit: -9 };
    W.monsters.push(m);
    return m;
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
    if (W.monsters.length && W.monsters[0].y0 <= low) W.monsters = W.monsters.filter(o => o.y0 > low);
    if (W.doors.length && W.doors[0].y <= low) W.doors = W.doors.filter(o => o.y > low && !o.used);
    if (W.gifts.length && W.gifts[0].y <= low) W.gifts = W.gifts.filter(o => o.y > low && !o.got);
  }

  // 상점 강화와 캐릭터 장점을 적용한 값 (upgrades: {speed, rocket, cloud: 0~5}, ch: 캐릭터 id). 없으면 그대로
  function applyUpgrades(L, up, ch) {
    up = up || {};
    const T = charOf(ch).trait || {};
    const U = id => { const d = D.UPGRADES.find(u => u.id === id); const lv = Math.max(0, Math.min(D.UPGRADE_MAX, Math.floor(Number(up[id]) || 0))); return d ? lv * d.per : 0; };
    return {
      ctl: Object.assign({}, L.ctl, { maxVx: L.ctl.maxVx * (1 + U('speed')) * (T.speed || 1), accel: L.ctl.accel * (T.accel || 1), decel: L.ctl.decel * (T.decel || 1) }),
      rocketTime: D.ROCKET.time * (1 + U('rocket')) * (T.rocket || 1),
      rescues: L.rescues > 0 ? L.rescues + Math.round(U('cloud')) : 0,   // 구조 구름 강화는 쉬움만
    };
  }

  // opts: {diff: 'easy'|'normal'|'hard', easy (예전 방식), viewH, tutorial,
  //        upgrades: {speed, rocket, cloud} (상점 강화), loadout: {rocket, shield} (시작 아이템),
  //        char: 캐릭터 id (D.CHARS, 없으면 통통 로봇)}
  //        adapt: 알아서 맞춰 주는 난이도 배율 (common/hub.js adaptMul, 없으면 1)}
  function create(seed, opts) {
    opts = opts || {};
    const s0 = seed == null ? (Date.now() ^ 0x5bd1e995) : seed;
    const rand = JP.rng(s0);
    const A = adaptOf(opts.adapt);
    const L0 = levelOf(opts);
    // 맞춤 배율은 어려워지는 빠르기(full)만 바꾼다. 간격·폭의 끝값은 그대로 (닿지 못하는 틈이 없다)
    const L = Object.assign({}, L0, { full: L0.warm + (L0.full - L0.warm) / A.ramp });
    const easy = L.id === 'easy';
    const viewH = opts.viewH || 600;
    const ch = charOf(opts.char);
    const UP = applyUpgrades(L, opts.upgrades, ch.id);
    const W = {
      rand, mrand: JP.rng((s0 ^ 0x2c1b3c6d) + 7), hrand: JP.rng((s0 ^ 0x51ed2701) + 3), grand: JP.rng((s0 ^ 0x6a09e667) + 11), A, adapt: A.mul,
      // 깜짝 선물 (D.GIFT): 놓인 상자 · 다음 선물 시각(오른 시간 초) · 이번 판 선물 코인 · 다음 판 시작 아이템
      gifts: [], giftAt: 0, giftCoins: 0, giftItems: [], giftsGot: 0,
      // 피버 타임 (D.FEVER): 게이지 0 ~ 1 · 남은 시간 · 횟수
      fever: 0, feverT: 0, fevers: 0,
      // 비밀 방 (D.ROOM): 문 목록 · 다음 문 높이(점) · 지금 방 · 들어간 횟수
      doors: [], nextDoor: 0, room: null, rooms: 0,
      // 블랙홀 구간 (D.BLACKHOLE): 목록 · 처음 나올 수 있는 높이 · 끄는 힘 · 지금 들어 있는 구간
      holeList: [], holeFirst: D.BLACKHOLE.first[L.id] || 300, pull: D.BLACKHOLE.pull[L.id] || 0, hole: null, holes: 0,
      planet: 0,   /* 지나온 가장 먼 행성 (1 수성 … 9 명왕성, 10 ~ 17 외계 행성) */
      leg: 0,      /* 지나온 여정 배너 수 (D.SKY.legs) */
      easy, diff: L.id, L, ctl: UP.ctl, char: ch.id, phys: physOf(ch.id), rocketTime: UP.rocketTime, rescueMax: UP.rescues, viewH, ids: 0,
      p: { x: WW / 2, y: P0.r, vx: 0, vy: 0, px: WW / 2, py: P0.r, face: 1, land: -9 },
      input: { dir: 0 },          // -1 왼쪽 · 0 · 1 오른쪽 (main.js·봇이 채운다)
      cam: -viewH * D.CAM.start, pcam: 0,
      plats: [], stars: [], items: [], mines: [], monsters: [],
      // 구역별 발판 섞임 (구역 배율 × 맞춤 배율: 움직이는·부서지는·구름 발판)
      mixes: D.ZONES.map(Z => { const m = Object.assign({}, Z.mix); for (const k of ['moving', 'crumble', 'cloud']) m[k] = (m[k] || 1) * A.mix; return m; }),
      // 쫓아오는 먹구름 (보통·어려움): y = 구름 윗면 높이, rest = 쉬는 시간, seen = 처음 화면에 보인 때
      storm: L.storm ? { on: false, y: -1e9, py: -1e9, rest: 0, seen: -1, speed: 0 } : null,
      genY: 0, prevXs: [WW / 2], recent: [{ y: 0, xs: [] }], nextItem: D.ITEM.first * D.METER,
      phase: 'play',              // play | over
      cause: null,                // fall | mine
      t: 0, acc: 0, alpha: 0, ticks: 0,
      maxY: 0, height: 0, score: 0, starPts: 0,
      zone: 0, mile: 0,           // 지금 구역 번호 · 지나간 100m 눈금 수
      // 처음 해 보는 판: 왼쪽·오른쪽을 한 번씩 눌러 볼 때까지 큰 안내 (main.js가 기억한다)
      tut: opts.tutorial ? { left: false, right: false, done: false, at: 0 } : null,
      rescues: UP.rescues, rescued: 0,
      shield: false, rocket: 0,
      // 기록·메달용
      starsGot: 0, stomps: 0, bumps: 0, springs: 0, rockets: 0, saves: 0, bounces: 0, crumbles: 0, combo: 0, maxCombo: 0, lastLand: 0,
      botT: null,
      events: [],   // 소리·진동용: bounce spring star item rocket shield save crumble rescue over zone mile tut stomp bump storm leg
      fx: [],       // 그리기 연출용: {kind, x, y}
    };
    W.pcam = W.cam;
    { const G = D.GIFT.every, RE = D.ROOM.every;
      W.giftAt = G[0] + W.grand() * (G[1] - G[0]);
      W.nextDoor = (D.ROOM.first + W.grand() * (RE[1] - RE[0]) * 0.5) * D.METER; }
    // 바닥: 기둥 가로 전체를 덮는 첫 발판
    addPlat(W, 'ground', WW / 2, 0, WW);
    generate(W);
    // 시작 아이템: 로켓 출발 · 방패 방울
    const lo = opts.loadout || {};
    if (lo.shield) { W.shield = true; W.events.push('shield'); }
    if (lo.rocket) { W.rocket = W.rocketTime; W.rockets++; W.events.push('rocket'); }
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
    P.vy = jumpV(Math.min(W.viewH * D.RESCUE.jump, D.RESCUE.max));
    W.combo = 0; W.lastLand = -Infinity;
    W.fx.push({ kind, x: P.x, y: W.cam });
    // 먹구름도 물러나 잠깐 쉰다 (던져 올린 곳에서 곧바로 다시 잡히지 않게)
    const S = W.storm;
    if (S && S.on) { S.y = Math.min(S.y, W.cam - W.viewH * D.STORM.back); S.py = S.y; S.rest = D.STORM.rest; }
  }

  // 몬스터를 위에서 밟았다: 꾹 눌리고 크게 튀어 오른다 (점수는 콤보 배율)
  function stomp(W, m) {
    const P = W.p, M = D.MONSTER;
    m.gone = true; m.hit = W.t;
    P.vy = jumpV(W.phys.jump * M.stomp);
    P.land = W.t;
    W.stomps++;
    feverAdd(W, D.FEVER.stomp);
    const pts = Math.round(M.points * comboMul(W.combo) * (W.feverT > 0 ? D.FEVER.starMul : 1));
    W.starPts += pts;
    W.events.push('stomp');
    W.fx.push({ kind: 'stomp', x: m.x, y: m.y, mk: m.kind, pts });
  }

  // 피버 게이지를 채운다. 가득 차면 FEVER (보이는 길 발판 위에 별이 더 생긴다)
  function feverAdd(W, v) {
    if (W.feverT > 0 || W.room) return;
    W.fever += v;
    if (W.fever < 1) return;
    const F = D.FEVER;
    W.fever = 0; W.feverT = F.time; W.fevers++;
    W.events.push('fever'); W.fx.push({ kind: 'fever', x: W.p.x, y: W.p.y });
    for (const p of W.plats) {
      if (!p.main || p.y < W.cam + 40 || p.y > W.genY) continue;
      if (W.grand() < F.spawn && !W.stars.some(s => !s.got && Math.abs(s.y - p.y - 60) < 30 && Math.abs(wrapDelta(s.x, p.x)) < 40)) {
        W.stars.push({ id: ++W.ids, x: p.kind === 'moving' ? WW / 2 : p.x, y: p.y + 60, got: false });
      }
    }
  }

  // 깜짝 선물 놓기: 화면 바로 위의 길 발판 위에 (블랙홀 구간·처음 안내 중에는 미룬다). 놓으면 다음 선물 시각을 정한다
  function placeGift(W) {
    if (W.tut && !W.tut.done) return false;
    const G = D.GIFT;
    for (const p of W.plats) {
      if (!p.main || p.kind === 'moving' || p.kind === 'cloud' || p.y < W.cam + W.viewH * 1.05 || p.y > W.cam + W.viewH * 1.9) continue;
      if (holeAt(W, p.y / D.METER) || W.doors.some(d => Math.abs(d.y - p.y) < 60)) continue;
      W.gifts.push({ id: ++W.ids, x: p.x, y: p.y + G.r + 4, got: false, seen: -1 });
      W.giftAt = W.t + G.every[0] + W.grand() * (G.every[1] - G.every[0]);
      return true;
    }
    return false;
  }
  // 선물 열기: 모두 좋은 것만 (코인 · 로켓 · 방패 방울 · 다음 판 시작 아이템)
  function openGift(W, g) {
    const G = D.GIFT;
    g.got = true; W.giftsGot++;
    const items = Object.keys(G.kinds).map(k => ({ k, w: G.kinds[k] }));
    let kind = JP.weighted(items, W.grand).k;
    if (kind === 'shield' && W.shield) kind = 'coins';
    const f = { kind: 'gift', reward: kind, x: g.x, y: g.y, n: 0, item: '' };
    if (kind === 'coins') { f.n = G.coins[0] + Math.floor(W.grand() * (G.coins[1] - G.coins[0] + 1)); W.giftCoins += f.n; }
    else if (kind === 'rocket') { W.rocket = W.rocketTime; W.rockets++; W.events.push('rocket'); }
    else if (kind === 'shield') { W.shield = true; W.events.push('shield'); }
    else { f.item = W.grand() < 0.5 ? 'rocketStart' : 'shieldStart'; W.giftItems.push(f.item); }
    W.events.push('gift'); W.fx.push(f);
  }

  // 비밀 방: 들어가면 지금 판(발판·별·아이템·폭탄·몬스터·카메라)을 잠시 넣어 두고, 화면 한 칸짜리 방을 만든다
  function enterRoom(W, door) {
    const P = W.p, RM = D.ROOM, base = W.cam, top = base + W.viewH;
    door.used = true;
    W.rooms++;
    W.room = { t: RM.time, door, base, top, saved: { plats: W.plats, stars: W.stars, items: W.items, mines: W.mines, monsters: W.monsters, gifts: W.gifts, doors: W.doors, rocket: W.rocket } };
    W.plats = []; W.stars = []; W.items = []; W.mines = []; W.monsters = []; W.gifts = []; W.doors = [];
    W.rocket = 0;
    const floor = addPlat(W, 'ground', WW / 2, base + 24, WW);
    floor.room = true;
    const rr = JP.rng(door.id * 7 + 1);
    // 스프링 몇 개와 쉬어 가는 발판, 별이 가득
    for (let i = 0; i < RM.springs; i++) addPlat(W, 'spring', WW * (i + 0.5) / RM.springs, base + 110 + (i % 2) * 70, 70);
    for (let i = 0; i < 4; i++) addPlat(W, 'normal', WW * (0.15 + rr() * 0.7), base + W.viewH * (0.45 + i * 0.12), 80);
    for (let i = 0; i < RM.stars; i++) {
      const col = i % 6, row = Math.floor(i / 6);
      W.stars.push({ id: ++W.ids, x: WW * (col + 0.5) / 6 + (row % 2) * 20, y: base + 90 + row * (W.viewH - 150) / Math.max(1, Math.ceil(RM.stars / 6) - 1), got: false });
    }
    P.x = P.px = WW / 2; P.y = P.py = floor.y + P0.r; P.vx = 0; P.vy = jumpV(W.phys.jump);
    W.combo = 0; W.lastLand = floor.y;
    W.events.push('room'); W.fx.push({ kind: 'room', x: door.x, y: door.y });
  }
  function leaveRoom(W) {
    const Rm = W.room, S = Rm.saved, P = W.p;
    W.plats = S.plats; W.stars = S.stars; W.items = S.items; W.mines = S.mines; W.monsters = S.monsters; W.gifts = S.gifts; W.doors = S.doors;
    W.rocket = 0;
    W.room = null;
    // 문 자리로 돌아와 한 번 튄다
    P.x = P.px = Rm.door.x; P.y = P.py = Rm.door.y - D.ROOM.r + P0.r; P.vx = 0; P.vy = jumpV(W.phys.jump);
    W.cam = W.pcam = Rm.base;
    W.combo = 0; W.lastLand = Rm.door.y - D.ROOM.r;
    if (W.storm) W.storm.py = W.storm.y;
    W.events.push('roomEnd'); W.fx.push({ kind: 'roomEnd', x: P.x, y: P.y });
  }

  function land(W, p) {
    const P = W.p;
    P.y = p.y + P0.r;
    const spring = p.kind === 'spring';
    P.vy = jumpV(spring ? W.phys.spring : W.phys.jump);
    P.land = W.t;
    p.hit = W.t;
    W.bounces++;
    if (p.y > W.lastLand + 1) { W.combo++; feverAdd(W, D.FEVER.add + D.FEVER.perCombo * Math.min(D.FEVER.cap, W.combo)); } else W.combo = 0;
    W.maxCombo = Math.max(W.maxCombo, W.combo);
    W.lastLand = p.y;
    if (spring) { W.springs++; W.events.push('spring'); W.fx.push({ kind: 'spring', x: P.x, y: p.y }); }
    else { W.events.push('bounce'); W.fx.push({ kind: 'bounce', x: P.x, y: p.y, combo: W.combo }); }
    if (p.kind === 'crumble') {
      p.broken = true; p.bt = W.t; W.crumbles++;
      W.events.push('crumble'); W.fx.push({ kind: 'crumble', x: p.x, y: p.y });
    }
  }

  function tick(W) {
    const P = W.p, r = P0.r;
    W.ticks++;
    W.t += H;
    P.px = P.x; P.py = P.y; W.pcam = W.cam;
    const room = W.room;
    // 피버 시간
    if (W.feverT > 0 && (W.feverT -= H) <= 0) { W.feverT = 0; W.events.push('feverEnd'); }

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

    // 몬스터 움직이기: 제자리에서 오가기(range) · 둥실(float)
    for (const m of W.monsters) {
      m.px = m.x;
      if (m.cool > 0) m.cool -= H;
      if (m.gone) continue;
      if (m.range > 0) {
        m.off += m.vx * H;
        if (m.off > m.range) { m.off = m.range; m.vx = -Math.abs(m.vx); } else if (m.off < -m.range) { m.off = -m.range; m.vx = Math.abs(m.vx); }
        m.x = m.x0 + m.off;
        if (m.x < 0) m.x += WW; else if (m.x >= WW) m.x -= WW;
        if (Math.abs(m.x - m.px) > WW / 2) m.px = m.x;
      }
      if (m.float) m.y = m.y0 + Math.sin(W.t * 2.2 + m.id) * m.float;
    }

    // 좌우: 누르는 쪽으로 빠르게 붙고, 떼면 곧 멈춘다
    const dir = W.input.dir > 0 ? 1 : W.input.dir < 0 ? -1 : 0;
    const C = W.ctl;
    const target = dir * C.maxVx;
    const a = (dir === 0 || Math.sign(target) !== Math.sign(P.vx) && P.vx !== 0 ? C.decel : 0) + (dir ? C.accel : 0);
    if (P.vx < target) P.vx = Math.min(target, P.vx + a * H); else if (P.vx > target) P.vx = Math.max(target, P.vx - a * H);
    if (dir) P.face = dir;
    // 처음 해 보는 판: 양쪽을 다 눌러 보면 안내 끝
    const T = W.tut;
    if (T && !T.done && dir) {
      if (dir < 0) T.left = true; else T.right = true;
      if (T.left && T.right) { T.done = true; T.at = W.t; W.events.push('tut'); }
    }
    P.x += P.vx * H;
    // 블랙홀 구간: 그쪽으로 살짝 끌린다 (로켓 중에는 괜찮다). 처음 들어설 때 한 번 알린다
    const hole = room ? null : holeAt(W, P.y / D.METER);
    if (hole && hole !== W.hole) { W.holes++; W.events.push('hole'); W.fx.push({ kind: 'hole', side: hole.side, x: P.x, y: P.y }); }
    W.hole = hole;
    if (hole && W.rocket <= 0) P.x += hole.side * W.pull * H;
    // 한쪽 끝으로 나가면 반대쪽에서 들어온다
    if (P.x < 0) { P.x += WW; P.px += WW; } else if (P.x >= WW) { P.x -= WW; P.px -= WW; }

    // 위아래
    const oldY = P.y;
    if (W.rocket > 0) {
      W.rocket -= H;
      P.vy = D.ROCKET.speed;
      if (W.rocket <= 0) { W.rocket = 0; P.vy = D.ROCKET.after; }
    } else {
      P.vy -= (P.vy > 0 ? W.phys.gUp : W.phys.gDown) * H;
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
    const sd = (r + D.STAR.r) * W.phys.magnet, sr = sd * sd;
    for (const s of W.stars) {
      if (s.got || Math.abs(s.y - P.y) > sd) continue;
      const dx = wrapDelta(P.x, s.x), dy = s.y - P.y;
      if (dx * dx + dy * dy < sr) {
        s.got = true; W.starsGot++;
        // 콤보 중이면 별 점수가 조금 더 (배율 상한 D.COMBO.max), 피버 중이면 × starMul
        const pts = Math.round(D.STAR.points * comboMul(W.combo) * (W.feverT > 0 ? D.FEVER.starMul : 1));
        W.starPts += pts;
        W.events.push('star'); W.fx.push({ kind: 'star', x: s.x, y: s.y, pts });
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
        if (it.kind === 'rocket') { W.rocket = W.rocketTime; W.rockets++; W.events.push('rocket'); }
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
        P.vy = Math.max(P.vy, jumpV(W.phys.jump));
        W.events.push('save'); W.fx.push({ kind: 'save', x: m.x, y: m.y });
        continue;
      }
      die(W, 'mine');
      return;
    }
    // 몬스터: 위에서 내려오며 닿으면 밟기. 옆·아래에서 닿으면 쉬움은 살짝 밀려나고(다치지 않음), 보통·어려움은 끝 (방패·로켓이면 괜찮다)
    // 밟기는 넉넉한 거리(몸 반지름 합)로, 부딪힘은 조금 좁은 거리(몬스터 몸 × hurt)로 잰다 (아이에게 너그럽게)
    const MO = D.MONSTER, gr = (r + MO.r) * (r + MO.r), hr2 = (r + MO.r * MO.hurt) * (r + MO.r * MO.hurt);
    for (const m of W.monsters) {
      if (m.gone) continue;
      if (m.seen < 0 && m.y < W.cam + W.viewH) m.seen = W.t;
      const dx = wrapDelta(P.x, m.x), dy = P.y - m.y, d2 = dx * dx + dy * dy;
      if (d2 >= gr) continue;
      if (W.rocket > 0) { m.gone = true; m.hit = W.t; W.fx.push({ kind: 'pop', x: m.x, y: m.y }); continue; }
      if (P.vy <= 0 && dy > MO.r * MO.top) { stomp(W, m); continue; }
      if (m.cool > 0 || d2 >= hr2) continue;
      if (W.easy) {
        // 쉬움: "앗" 하고 옆으로 살짝 밀려난다. 잠깐 동안은 다시 부딪히지 않는다
        m.cool = MO.cool;
        P.vx = (dx > 0 ? -1 : 1) * MO.push;
        W.bumps++;
        W.events.push('bump'); W.fx.push({ kind: 'bump', x: m.x, y: m.y });
        continue;
      }
      if (W.shield) {
        W.shield = false; W.saves++; m.gone = true; m.hit = W.t;
        P.vy = Math.max(P.vy, jumpV(W.phys.jump));
        W.events.push('save'); W.fx.push({ kind: 'save', x: m.x, y: m.y });
        continue;
      }
      die(W, 'monster');
      return;
    }

    // 깜짝 선물 · 비밀 방 문
    const gr2 = (r + D.GIFT.r + D.GIFT.grab) * (r + D.GIFT.r + D.GIFT.grab);
    for (const g of W.gifts) {
      if (g.got) continue;
      if (g.seen < 0 && g.y < W.cam + W.viewH) g.seen = W.t;
      const dx = wrapDelta(P.x, g.x), dy = g.y - P.y;
      if (dx * dx + dy * dy < gr2) openGift(W, g);
    }
    const dr2 = (r + D.ROOM.r) * (r + D.ROOM.r);
    for (const d of W.doors) {
      if (d.used) continue;
      if (d.seen < 0 && d.y < W.cam + W.viewH) d.seen = W.t;
      const dx = wrapDelta(P.x, d.x), dy = d.y - P.y;
      if (dx * dx + dy * dy < dr2 && W.rocket <= 0) { enterRoom(W, d); return; }
    }

    // 비밀 방 안: 높이·카메라·먹구름·떨어짐이 멈춘다. 바닥에서 튀고 천장에 닿으면 살짝 되돌아온다. 시간이 다 되면 문 자리로
    if (room) {
      if (P.y > room.top - r) { P.y = room.top - r; if (P.vy > 0) P.vy = -P.vy * 0.3; }
      if (P.y < room.base + r) { P.y = room.base + 24 + r; P.vy = jumpV(W.phys.jump); }
      W.score = W.height + W.starPts;
      if ((room.t -= H) <= 0) leaveRoom(W);
      return;
    }

    // 깜짝 선물: 오른 시간이 되면 화면 바로 위 길 발판에 놓는다
    if (W.t >= W.giftAt) placeGift(W);

    // 높이 · 점수 · 카메라 (카메라는 올라가기만 한다)
    if (P.y > W.maxY) W.maxY = P.y;
    W.height = Math.floor(W.maxY / D.METER);
    W.score = W.height + W.starPts;
    // 구역이 바뀌면 배너, 100m마다 축하 (한 번씩만)
    const zi = zoneAt(W.height);
    if (zi > W.zone) { W.zone = zi; W.events.push('zone'); W.fx.push({ kind: 'zone', zone: zi, x: P.x, y: P.y }); }
    // 행성에 닿으면 한 번씩 알린다 (구역 배너와 같은 때면 render.js가 하나로 합친다)
    const pn = planetAt(W.height);
    if (pn > W.planet) { W.planet = pn; W.events.push('planet'); W.fx.push({ kind: 'planet', i: pn - 1, x: P.x, y: P.y }); }
    // 땅에서 우주까지 여정 배너 (구름 속 · 높은 하늘 · 대기권 돌파)
    const lg = legAt(W.height);
    if (lg > W.leg) { W.leg = lg; W.events.push('leg'); W.fx.push({ kind: 'leg', i: lg - 1, x: P.x, y: P.y }); }
    const mb = Math.floor(W.height / D.MILE.big);
    if (mb > W.mile) { W.mile = mb; W.events.push('mile'); W.fx.push({ kind: 'mile', m: mb * D.MILE.big, x: P.x, y: mb * D.MILE.big * D.METER }); }
    // 카메라: 부드럽게 따라 올라가되(ease), 주인공이 화면 위쪽으로 너무 가지 않게(lead). 내려가지는 않는다
    const want = P.y - W.viewH * D.CAM.focus;
    if (want > W.cam) W.cam = Math.max(W.cam + (want - W.cam) * Math.min(1, D.CAM.ease * H), want - W.viewH * D.CAM.lead);

    // 쫓아오는 먹구름 (보통·어려움): 정해 둔 높이부터 아래에서 올라온다. 로켓이 끝난 뒤·방울이 막아 준 뒤에는 잠깐 쉰다.
    // 화면 아래 끝에서 lag보다 멀리 처지지 않는다. 닿으면 떨어진 것과 같다
    const S = W.storm;
    let caught = false;
    if (S) {
      S.py = S.y;
      if (!S.on) {
        if (W.height >= W.L.storm.from) { S.on = true; S.y = S.py = W.cam - W.viewH * D.STORM.lag; }
      } else {
        S.speed = stormSpeed(W);
        if (W.rocket > 0) S.rest = D.STORM.rest;
        else if (S.rest > 0) S.rest -= H;
        else S.y += S.speed * D.METER * H;
        S.y = Math.max(S.y, W.cam - W.viewH * D.STORM.lag);
        if (S.seen < 0 && S.y > W.cam - W.viewH * D.STORM.lag * 0.5) { S.seen = W.t; W.events.push('storm'); }   // 가까워지면 한 번 알린다
        caught = P.y - r < S.y;
      }
    }

    // 화면 아래로 떨어짐(또는 먹구름에 잡힘): 방패 → 구조 구름(쉬움) → 끝
    if (caught || P.y < W.cam - r * 1.5) {
      if (W.shield) { W.shield = false; W.saves++; W.events.push('save'); throwUp(W, 'save'); }
      else if (W.rescues > 0) { W.rescues--; W.rescued++; W.events.push('rescue'); throwUp(W, 'rescue'); }
      else { die(W, caught ? 'storm' : 'fall'); return; }
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
    const P = W.p, F = W.phys, C = W.ctl;
    if (W.phase !== 'play') return 0;
    if (W.rocket > 0) return 0;
    const apex = P.y + (P.vy > 0 ? P.vy * P.vy / (2 * F.gUp) : 0);
    // 지금부터 높이 y에 (내려오며) 닿기까지 걸리는 시간. 닿지 못하면 -1
    const timeTo = y => fallTime(P.y, P.vy, y, F);
    const fromY = P.y - P0.r;
    let t = W.botT;
    // 몬스터를 밟으러 갈 때는 몬스터를 발판처럼 본다 (자리·빠르기는 매번 몬스터에서 다시 읽는다)
    if (t && t.mon) { const m = t.mon; t.x = m.x; t.y = m.y + D.MONSTER.r * 0.6; t.vx = m.range > 0 ? m.vx : 0; t.broken = m.gone; }
    const bad = p => !p || p.broken || (!p.mon && W.plats.indexOf(p) < 0) || p.y + P0.r > apex - 8 || (P.vy <= 0 && fromY < p.y - 1);
    const key = W.bounces + W.stomps * 1e4;
    if (bad(t) || W.botB !== key) {
      W.botB = key;
      t = null; let best = -Infinity;
      for (const p of W.plats) {
        if (p.broken || p.y + P0.r > apex - 8 || (P.vy <= 0 && p.y > fromY + 1)) continue;
        if (p.y < W.cam - 10) continue;
        const tt = timeTo(p.y + P0.r);
        if (tt < 0) continue;
        const px = p.x + p.vx * tt;
        const need = Math.max(0, Math.abs(wrapDelta(P.x, px)) - p.w * 0.35);
        if (need > C.maxVx * tt * 0.8 + 4) continue;
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
        // 몬스터가 튀어 오르는 길이나 건너가는 길을 막으면 피한다 (쉬움은 부딪혀도 괜찮다)
        if (!W.easy && W.monsters.length) {
          for (const m of W.monsters) if (!m.gone && Math.abs(wrapDelta(px, m.x)) < 50 + m.range && m.y > p.y + D.MONSTER.r * 2 && m.y < p.y + 260) s -= 300;
          if (pathHitsMonster(W, px, tt)) s -= 300;
        }
        if (s > best) { best = s; t = p; }
      }
      // 밟을 수 있는 몬스터: 발판보다 조금 더 좋게 (쉬움은 더 좋게)
      for (const m of W.monsters) {
        if (m.gone) continue;
        const y = m.y + D.MONSTER.r * 0.6;
        if (y + P0.r > apex - 8 || (P.vy <= 0 && y > fromY + 1) || y < W.cam + 20) continue;
        const tt = timeTo(y + P0.r);
        if (tt < 0.15) continue;
        const px = m.x + (m.range > 0 ? m.vx : 0) * tt;
        const need = Math.max(0, Math.abs(wrapDelta(P.x, px)) - D.MONSTER.r * 0.5);
        if (need > C.maxVx * tt * 0.7) continue;
        // 아래에서 올라가다 부딪히는 길이면 밟으러 가지 않는다 (위로 넘어간 뒤 내려오며 밟는 길만)
        if (!W.easy && pathHitsMonster(W, px, tt)) continue;
        const s = y + 30;
        if (s > best) { best = s; t = { mon: m, x: m.x, y, w: D.MONSTER.r * 1.6, vx: m.range > 0 ? m.vx : 0, broken: false, kind: 'monster' }; }
      }
      W.botT = t;
    }
    if (!t) return 0;
    const tt = Math.max(0, timeTo(t.y + P0.r));
    // 블랙홀에 끌리는 만큼 미리 반대쪽을 겨냥한다
    const drift = W.hole && W.rocket <= 0 ? W.hole.side * W.pull : 0;
    const tx = t.x + t.vx * tt - drift * tt;
    const dx = wrapDelta(P.x, tx);
    // 가까우면 멈춘다 (멈추는 데 드는 거리만큼 미리)
    const brake = P.vx * P.vx / (2 * C.decel);
    if (Math.abs(dx) < Math.max(6, t.w * 0.2) + (Math.sign(dx) === Math.sign(P.vx) ? brake * 0.5 : 0)) {
      return dodge(W, Math.abs(P.vx) > 60 ? -Math.sign(P.vx) : 0);
    }
    return dodge(W, dx > 0 ? 1 : -1);
  }

  // 지금 자리에서 tt초 뒤 가로 px에 닿도록 곧게 옮겨 가면 몬스터에 옆·아래로 부딪히는지 (자동 운전용 어림)
  function pathHitsMonster(W, px, tt) {
    const P = W.p, MO = D.MONSTER, lim = (P0.r + MO.r + 6) * (P0.r + MO.r + 6), dxAll = wrapDelta(P.x, px);
    for (let k = 1; k <= 10; k++) {
      const t = tt * k / 10, x = P.x + dxAll * k / 10, y = yAfter(P.y, P.vy, t, W.phys);
      const down = yAfter(P.y, P.vy, t + 0.01, W.phys) < y;
      for (const m of W.monsters) {
        if (m.gone) continue;
        const dx = wrapDelta(x, m.x), dy = y - m.y;
        if (Math.abs(dx) < P0.r + MO.r + 6 + m.range && dx * dx + dy * dy < lim + m.range * m.range && !(down && dy > MO.r * MO.top + 4)) return true;
      }
    }
    return false;
  }

  // 고른 방향으로 잠깐(0.4초) 가 보면 가시 폭탄에 닿는지 살펴, 닿으면 다른 방향을 고른다
  function dodge(W, want) {
    const mons = W.easy ? [] : W.monsters;
    if ((!W.mines.length && !mons.length) || W.shield) return want;
    const P = W.p, lim = (P0.r + D.MINE.r + 10) * (P0.r + D.MINE.r + 10);
    const MO = D.MONSTER, ml = (P0.r + MO.r + 8) * (P0.r + MO.r + 8);
    const hits = dir => {
      for (let k = 1; k <= 8; k++) {
        const t = k * 0.05, x = P.x + (dir ? dir * W.ctl.maxVx : P.vx * 0.3) * t, y = yAfter(P.y, P.vy, t, W.phys);
        for (const m of W.mines) {
          if (m.gone) continue;
          const dx = wrapDelta(x, m.x), dy = m.y - y;
          if (dx * dx + dy * dy < lim) return true;
        }
        // 몬스터는 위에서 내려오며 닿는 것(밟기)만 괜찮다
        if (mons.length) {
          const down = yAfter(P.y, P.vy, t + 0.01, W.phys) < y;
          for (const m of mons) {
            if (m.gone) continue;
            const dx = wrapDelta(x, m.x), dy = m.y - y;
            if (dx * dx + dy * dy < ml && !(down && -dy > MO.r * MO.top + 4)) return true;
          }
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
      diff: W.diff, easy: W.easy, height: W.height, score: W.score, stars: W.starsGot, springs: W.springs,
      rockets: W.rockets, saves: W.saves, maxCombo: W.maxCombo, rescued: W.rescued, bounces: W.bounces, time: W.t,
      zone: W.zone, crumbles: W.crumbles, char: W.char, stomps: W.stomps, bumps: W.bumps, adapt: W.adapt, planet: W.planet, holes: W.holes,
      gifts: W.giftsGot, giftCoins: W.giftCoins, giftItems: W.giftItems.slice(), fevers: W.fevers, rooms: W.rooms,
    };
  }

  // 테스트·봇용: W에서 높이 y에 내려와 닿기까지 시간
  const timeTo = (W, y) => fallTime(W.p.y, W.p.vy, y, W.phys);

  JP.World = { create, applyUpgrades, charOf, physOf, yAfter, fallTime, timeTo, step, tick, botDir, runStats, wrapDelta, cloudAlpha, diffAt, warmAt, zoneAt, comboMul, levelOf, jumpV, adaptOf, stormSpeed, monsterSpotOk, planetAt, legAt, holeAt, holesUpTo, feverAdd, placeGift, openGift, enterRoom, leaveRoom };
})(JP);
