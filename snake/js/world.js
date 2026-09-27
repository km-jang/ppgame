'use strict';
// 게임 규칙. DOM·canvas를 쓰지 않는다 (node 테스트가 그대로 불러 돌린다: tests/snake.test.js).
// 좌표는 칸 단위 정수. snake[0]이 머리다.
// 모드: classic(기본 규칙만) · endless(무한: 콤보·아이템·황금 시간 제한 + 라이벌 뱀) · stage(스테이지: 레벨마다 벽·포털·목표)
(function (SN) {
  const D = SN.DATA;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const ITEM_KINDS = Object.keys(D.ITEM.kinds);

  const copy = s => s.map(p => ({ x: p.x, y: p.y }));

  // ─── 레벨 ──────────────────────────────────────────────────
  // n번째 레벨의 설정. 12를 넘으면 모양을 처음부터 다시 돌고, 한 바퀴마다 빨라지고 목표가 늘어난다
  function levelDef(n) {
    const L = D.LEVELS, i = (n - 1) % L.length, loop = Math.floor((n - 1) / L.length);
    const b = L[i];
    return Object.assign({}, b, { n, speed: b.speed + loop * D.STAGE.loopSpeed, goal: b.goal + loop * 4 });
  }

  // 벽 모양. 판 크기(가로·세로 화면)가 달라도 비율로 놓는다
  function buildWalls(kind, C, R) {
    const w = new Uint8Array(C * R);
    const set = (x, y) => { if (x >= 0 && y >= 0 && x < C && y < R) w[y * C + x] = 1; };
    const h = (y, x0, x1, gaps) => { for (let x = x0; x <= x1; x++) if (!(gaps && gaps(x))) set(x, y); };
    const v = (x, y0, y1, gaps) => { for (let y = y0; y <= y1; y++) if (!(gaps && gaps(y))) set(x, y); };
    const near = (c, w2) => k => Math.abs(k - c) <= w2;
    const cx = Math.floor(C / 2), cy = Math.floor(R / 2);
    const ring = (i, gap) => {
      h(i, i, C - 1 - i, gap.top); h(R - 1 - i, i, C - 1 - i, gap.bottom);
      v(i, i, R - 1 - i, gap.left); v(C - 1 - i, i, R - 1 - i, gap.right);
    };
    switch (kind) {
      case 'pillars':
        for (const fx of [0.2, 0.4, 0.6, 0.8]) for (const fy of [0.25, 0.75]) {
          const x = Math.round(C * fx) - 1, y = Math.round(R * fy) - 1;
          set(x, y); set(x + 1, y); set(x, y + 1); set(x + 1, y + 1);
        }
        break;
      case 'bar':
        h(cy, Math.round(C * 0.25), Math.round(C * 0.75) - 1);
        break;
      case 'cross':
        v(cx, Math.round(R * 0.2), Math.round(R * 0.8) - 1, near(cy, 1));
        h(cy, Math.round(C * 0.2), Math.round(C * 0.8) - 1, near(cx, 1));
        break;
      case 'rooms': {
        const qy = Math.floor(R / 4), qx = Math.floor(C / 4);
        v(cx, 0, R - 1, y => near(qy, 1)(y) || near(R - 1 - qy, 1)(y));
        h(cy, 0, C - 1, x => near(qx, 1)(x) || near(C - 1 - qx, 1)(x) || x === cx);
        break;
      }
      case 'stripes':
        [0.25, 0.5, 0.75].forEach((f, i) => {
          const y = Math.round(R * f);
          if (i % 2 === 0) h(y, 0, Math.round(C * 0.7)); else h(y, Math.round(C * 0.3), C - 1);
        });
        break;
      case 'box': {
        const x0 = Math.round(C * 0.3), x1 = Math.round(C * 0.7), y0 = Math.round(R * 0.3), y1 = Math.round(R * 0.7);
        h(y0, x0, x1, near(Math.floor((x0 + x1) / 2), 1)); h(y1, x0, x1, near(Math.floor((x0 + x1) / 2), 1));
        v(x0, y0, y1); v(x1, y0, y1);
        break;
      }
      case 'spiral':
        ring(3, { right: near(cy, 1) });
        ring(6, { left: near(cy, 1) });
        break;
      case 'fort':
        ring(2, { top: near(cx, 1), bottom: near(cx, 1), left: near(cy, 1), right: near(cy, 1) });
        for (let x = cx - 2; x <= cx + 1; x++) for (let y = cy - 1; y <= cy; y++) set(x, y);
        break;
    }
    return w;
  }

  // 뱀이 출발할 자리: 벽 없는 가로줄에서 len+6칸이 비어 있는 곳 (가운데 줄부터 찾는다)
  function startSpot(W) {
    const len = D.START.len, need = len + 6, C = W.cols, R = W.rows;
    const order = [];
    const cy = Math.floor(R / 2);
    for (let k = 0; k < R; k++) { const y = cy + (k % 2 ? -1 : 1) * Math.ceil(k / 2); if (y >= 0 && y < R) order.push(y); }
    const x0 = Math.max(1, Math.min(Math.floor(C * 0.3) - len + 1, C - need));
    for (const y of order) {
      for (let s = x0; s + need <= C; s++) {
        let ok = true;
        for (let x = s; x < s + need && ok; x++) if (W.walls[y * C + x] || W.portalAt[y * C + x] >= 0) ok = false;
        if (ok) return { x: s + len - 1, y };
      }
    }
    // 어디에도 없으면(아주 작은 판) 가운데 줄 벽을 치운다
    for (let x = 0; x < C; x++) { W.walls[cy * C + x] = 0; W.portalAt[cy * C + x] = -1; }
    return { x: Math.max(len - 1, Math.floor(C * 0.3)), y: cy };
  }

  // 포털 쌍: 벽·출발 줄에서 떨어진 빈 칸 두 곳을 멀리 떨어뜨려 잇는다
  function placePortals(W, n, avoidY) {
    const C = W.cols, R = W.rows;
    const free = i => !W.walls[i] && W.portalAt[i] < 0;
    const ok = (x, y) => {
      if (x < 1 || y < 1 || x >= C - 1 || y >= R - 1 || Math.abs(y - avoidY) <= 1) return false;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (!free((y + dy) * C + x + dx)) return false;
      return true;
    };
    const pick = () => { for (let k = 0; k < 400; k++) { const x = Math.floor(W.rand() * C), y = Math.floor(W.rand() * R); if (ok(x, y)) return { x, y }; } return null; };
    for (let i = 0; i < n; i++) {
      const a = pick();
      if (!a) break;
      let b = null;
      for (let k = 0; k < 60; k++) { const c = pick(); if (c && Math.abs(c.x - a.x) + Math.abs(c.y - a.y) > (C + R) / 3) { b = c; break; } }
      if (!b) break;
      const id = W.portals.length;
      W.portals.push({ a, b });
      W.portalAt[a.y * C + a.x] = id; W.portalAt[b.y * C + b.x] = id;
    }
  }

  // ─── 재미 셋: 선물 상자 · 피버 · 거대 뱀 ─────────────────────
  const GF = D.GIFT;
  function giftGap(W, first) {
    const a = first ? GF.firstMin : GF.gapMin, b = first ? GF.firstMax : GF.gapMax;
    return a + W.funRng() * (b - a);
  }
  // 선물 상자 놓기: 빈 칸 중 내 머리에서 minDist칸 넘게 떨어진 곳 (없으면 아무 빈 칸)
  function spawnGift(W) {
    const free = freeCells(W), h = W.snake[0];
    const far = free.filter(i => Math.abs(i % W.cols - h.x) + Math.abs(Math.floor(i / W.cols) - h.y) > GF.minDist);
    const pool = far.length ? far : free;
    if (!pool.length) return false;
    const i = pool[Math.floor(W.funRng() * pool.length)];
    W.gift = { x: i % W.cols, y: Math.floor(i / W.cols), life: GF.life, born: W.t };
    W.events.push('gift');
    W.fx.push({ kind: 'giftIn', x: W.gift.x, y: W.gift.y });
    return true;
  }
  // 선물 열기: 상 하나 (코인 · 바로 켜지는 아이템 · 다음 판 시작 아이템)
  function openGift(W) {
    const g = W.gift;
    W.gift = null; W.gifts++;
    const r = SN.weighted(GF.rewards, W.funRng);
    let out;
    if (r.kind === 'coins') {
      const n = r.min + Math.floor(W.funRng() * (r.max - r.min + 1));
      W.giftCoins += n;
      out = { kind: 'coins', n, text: '선물: 코인 ' + n + '개!' };
    } else {
      const id = r.items[Math.floor(W.funRng() * r.items.length)];
      if (r.kind === 'power') {
        usePower(W, { kind: id, x: g.x, y: g.y });
        out = { kind: 'power', id, text: '선물: ' + D.ITEM.kinds[id].name + '!' };
      } else {
        W.giftStart.push(id);
        const it = (D.START_ITEMS || []).find(x => x.id === id);
        out = { kind: 'start', id, text: '선물: 다음 판 ' + (it ? it.name : id) + '!' };
      }
    }
    W.lastGift = out;
    W.events.push('giftopen');
    W.fx.push({ kind: 'gift', x: g.x, y: g.y, text: out.text });
    return out;
  }
  // 피버 보너스 구슬 (보통 구슬과 같지만 황금 차례와 상관없음)
  function spawnBonus(W) {
    const free = freeCells(W);
    if (!free.length) { W.bonus = null; return false; }
    const i = free[Math.floor(W.funRng() * free.length)];
    W.bonus = { x: i % W.cols, y: Math.floor(i / W.cols), born: W.t };
    return true;
  }
  function startFever(W) {
    W.fever = 0; W.feverT = D.FEVER.time; W.fevers++;
    W.events.push('fever');
    const h = W.snake[0];
    W.fx.push({ kind: 'fever', x: h.x, y: h.y });
    spawnBonus(W);
  }
  function startGiant(W) {
    W.eff.giant = D.GIANT.time; W.giants++; W.goldTimes = [];
    W.events.push('giant');
    const h = W.snake[0];
    W.fx.push({ kind: 'giant', x: h.x, y: h.y });
    // 라이벌은 겁먹고 도망간다 (사라졌다가 조금 뒤 다른 자리에서)
    const V = W.rival;
    if (V && (V.phase === 'play' || V.phase === 'warn') && V.body.length) {
      W.fx.push({ kind: 'rivalOut', x: V.body[0].x, y: V.body[0].y, scared: true });
      V.phase = 'gone'; V.t = D.GIANT.time + D.GIANT.back; V.body = []; V.prev = [];
    }
  }

  // ─── 우주 여행 배경 (그림만, 규칙에는 영향 없음) ────────────────
  // W.space: {scene: 지금 하늘 id, step: 장면 차례(무한), planet: 지나온 행성 수 - 1, lap, hole: 지금 블랙홀인가,
  //           max: 이번 판에 간 가장 먼 행성 번호(1 = 수성, 2바퀴면 10부터), changedAt: 장면이 바뀐 시각(W.t), rng: 따로 쓰는 난수}
  const SP = D.SPACE;
  function sceneInfo(id) {
    const p = SP.planets.find(q => q.id === id);
    if (p) return Object.assign({ kind: 'planet', index: SP.planets.indexOf(p) + 1 }, p);
    const o = SP.others[id] || SP.others.hole;
    return Object.assign({ kind: id === 'galaxy' ? 'galaxy' : id === 'core' ? 'core' : 'hole', index: 0, id }, o);
  }
  // 스테이지 n번째 레벨의 하늘 (1~9 수성~명왕성, 10 블랙홀, 11 은하수, 12 은하 중심, 그다음은 다시 돈다)
  function stageScene(n) { return SP.stage[(Math.max(1, n) - 1) % SP.stage.length]; }
  function spaceInit(W, seed0) {
    W.space = { scene: SP.planets[0].id, step: 0, planet: 0, lap: 1, hole: false, max: 1, changedAt: 0,
      rng: SN.rng(((seed0 >>> 0) ^ 0x2545f491) * 7 + 3) };
  }
  // 스테이지: 레벨을 시작할 때 그 레벨 하늘로
  function spaceStage(W) {
    const S = W.space, id = stageScene(W.level), info = sceneInfo(id);
    S.scene = id; S.hole = info.kind !== 'planet'; S.changedAt = W.t;
    S.max = Math.max(S.max, info.kind === 'planet' ? info.index : SP.planets.length);
  }
  // 무한·기본: 내가 먹은 구슬 수로 장면 차례를 맞춘다 (라이벌이 먹은 것은 세지 않는다)
  function spaceAdvance(W) {
    const S = W.space, want = Math.floor(W.eaten / SP.perOrbs);
    while (S.step < want) {
      S.step++;
      if (!S.hole && S.step >= SP.holeFrom && S.rng() < SP.holeChance) { S.hole = true; S.scene = 'hole'; }
      else {
        S.hole = false; S.planet++;
        S.scene = SP.planets[S.planet % SP.planets.length].id;
        S.lap = Math.floor(S.planet / SP.planets.length) + 1;
        S.max = Math.max(S.max, S.planet + 1);
      }
      S.changedAt = W.t;
      W.events.push('planet');
    }
  }
  // 지금 하늘 설명 (그리기·알림용)
  function spaceScene(W) {
    const S = W.space;
    return Object.assign(sceneInfo(S.scene), { lap: S.hole ? 1 : S.lap, since: W.t - S.changedAt });
  }

  // 판 준비: 벽·포털·뱀·먹이. 스테이지는 레벨을 넘길 때마다 다시 부른다 (점수는 그대로)
  function setup(W) {
    const C = W.cols, R = W.rows;
    W.walls = new Uint8Array(C * R);
    W.portalAt = new Int16Array(C * R).fill(-1);
    W.portals = [];
    W.lv = null;
    if (W.mode === 'stage') {
      W.lv = levelDef(W.level);
      W.walls = buildWalls(W.lv.walls, C, R);
      W.goal = W.lv.goal; W.got = 0;
    }
    const s = startSpot(W);
    if (W.lv && W.lv.portals) placePortals(W, W.lv.portals, s.y);
    const snake = [];
    for (let i = 0; i < D.START.len; i++) snake.push({ x: s.x - i, y: s.y });
    W.snake = snake; W.prev = copy(snake);
    W.dir = 'right'; W.queue = []; W.grow = 0;
    W.wait = W.easy ? Infinity : D.START.wait; W.acc = 0; W.alpha = 0;   // 쉬움: 방향을 누를 때까지 기다린다
    W.item = null; W.itemT = D.ITEM.first * W.itemGapMul;
    W.eff = { slow: 0, double: 0, ghost: 0, giant: 0 };
    // 재미 셋: 선물 상자 · 피버 보너스 구슬 · 부서진 벽 표시 (레벨마다 새로)
    W.gift = null; W.bonus = null; W.wallVer = (W.wallVer || 0) + 1;
    W.feverT = 0; W.goldTimes = [];
    W.giftT = W.mode === 'endless' ? (W.giftT > 0 && W.giftT < Infinity ? W.giftT : giftGap(W, true))
      : W.mode === 'stage' && D.GIFT.stageLevels.includes(((W.level - 1) % D.LEVELS.length) + 1) ? D.GIFT.stageAt : Infinity;
    // 캐릭터 특기: 판(레벨)마다 처음 몇 초 유령
    if (W.startGhost > 0) W.eff.ghost = W.startGhost;
    W.lastEat = -99; W.combo = 0; W.mult = 1;
    W.food = null;
    if (W.rival) resetRival(W);
    if (W.mode === 'stage') spaceStage(W);
    spawnFood(W);
  }

  // 강화 단계(opts.up)를 규칙 수치로. 없는 강화는 0단계
  function upLevel(up, id) {
    const n = up && Number(up[id]);
    return Number.isFinite(n) && n > 0 ? Math.min(D.UPGRADE_MAX || 5, Math.floor(n)) : 0;
  }
  function upPer(id) { const u = (D.UPGRADES || []).find(x => x.id === id); return u ? u.per : 0; }

  // 캐릭터(opts.char: id)의 특기 수치. 모르는 id는 첫 캐릭터(네온 뱀)
  function charDef(id) {
    const L = D.CHARS || [];
    return L.find(c => c.id === id) || L[0] || { id: 'neon', traits: {} };
  }

  // 알아서 맞춰 주는 난이도 배율(opts.adapt)을 값 하나에: 값 × 배율^지수 (D.ADAPT)
  function adaptPow(W, k) { return Math.pow(W.adapt, (D.ADAPT && D.ADAPT[k]) || 0); }

  // 난이도 id: opts.diff가 있으면 그것, 없으면 옛 opts.easy (true 쉬움 · 아니면 보통)
  function diffOf(opts) {
    if (opts && (opts.diff === 'easy' || opts.diff === 'normal' || opts.diff === 'hard')) return opts.diff;
    return opts && opts.easy ? 'easy' : 'normal';
  }

  // opts: {mode: 'classic' | 'endless' | 'stage', level, diff: 'easy' | 'normal' | 'hard' (옛 호출은 easy: true), char: 캐릭터 id,
  //        up: {goldTime, itemFreq, comboTime: 0~5단계} (상점 강화), start: {ghost, slow, double: true} (시작 아이템),
  //        rival: false면 라이벌 없음 (무한 모드만, 기본 있음), rivalLevel: 'easy' | 'normal' | 'hard' (기본은 쉬움·보통을 따름),
  //        adapt: 알아서 맞춰 주는 난이도 배율 (HUB.adaptMul, 기본 1)}
  function create(cols, rows, seed, opts) {
    opts = opts || {};
    const seed0 = seed == null ? (Date.now() ^ 0x5bd1e995) : seed;
    const rand = SN.rng(seed0);
    const mode = opts.mode === 'endless' || opts.mode === 'stage' ? opts.mode : 'classic';
    const W = {
      cols, rows, rand, mode, fun: mode !== 'classic', diff: diffOf(opts),
      level: mode === 'stage' ? Math.max(1, opts.level || 1) : 0,
      snake: [], prev: [], dir: 'right',
      queue: [],          // 아직 적용 안 된 방향 (최대 D.TURN_QUEUE개)
      grow: 0,            // 앞으로 늘어날 칸 수
      food: null,         // {x, y, gold, born}
      eaten: 0, golds: 0, score: 0,
      phase: 'play',      // play | clear(스테이지 레벨 깸) | over
      won: false,         // 판을 가득 채우면 true
      cause: null,        // wall | self | rival (보통에서 라이벌 몸)
      t: 0,               // 흐른 시간 (출발 대기 포함, 연출용)
      time: 0,            // 실제로 움직인 시간 (기록용)
      wait: 0, acc: 0, alpha: 0, ticks: 0, turns: 0,
      clearT: 0, levelsCleared: 0, startLevel: 0,
      // 메달·기록용
      maxLen: D.START.len, maxCombo: 0, powers: 0, powerSeen: {}, portalsUsed: 0, wraps: 0,
      events: [],         // 소리·진동용: eat gold turn over win combo item power portal wrap cool clear level
      fx: [],             // 그리기 연출용: {kind, x, y}
    };
    W.startLevel = W.level;
    W.easy = W.diff === 'easy'; W.hard = W.diff === 'hard';
    const am = Number(opts.adapt);
    W.adapt = Number.isFinite(am) && am > 0 ? Math.max(0.7, Math.min(1.3, am)) : 1;
    W.growMul = adaptPow(W, 'perGrow');
    // 상점 강화: 황금 구슬 시간 · 아이템 간격 · 콤보 시간 (규칙 수치는 W에 들고 다닌다)
    const up = opts.up || {};
    // 캐릭터 특기는 강화 위에 더한다 (char를 안 넘기면 특기 없음: 규칙 테스트·옛 호출)
    const ch = charDef(opts.char), T = (opts.char && ch.id === opts.char && ch.traits) || {};
    W.char = ch.id;
    W.goldLife = (D.FOOD.goldLife + upLevel(up, 'goldTime') * upPer('goldTime') + (T.goldPlus || 0)) * adaptPow(W, 'goldLife') * (W.hard ? D.HARD.goldMul : 1);
    W.itemGapMul = Math.max(0.3, Math.max(0.4, 1 - upLevel(up, 'itemFreq') * upPer('itemFreq')) * (T.itemMul || 1)) * (W.hard ? D.HARD.itemMul : 1);
    W.comboWindow = D.COMBO.window + upLevel(up, 'comboTime') * upPer('comboTime') + (T.comboPlus || 0);
    W.speedMul = T.speedMul || 1;
    W.startGhost = T.startGhost || 0;
    W.ghostMul = T.ghostMul || 1;
    spaceInit(W, seed0);
    W.funRng = SN.rng(((seed0 >>> 0) ^ 0x68e31da4) * 13 + 5);   // 선물 자리·상 (먹이 흐름을 흔들지 않게 따로)
    W.gifts = 0; W.giftCoins = 0; W.giftStart = []; W.lastGift = null; W.giftT = 0;
    W.fever = 0; W.fevers = 0; W.giants = 0; W.smashed = 0;
    // 라이벌 뱀: 무한 모드에만. 규칙용 난수는 따로 써서 내 판(먹이 자리)의 흐름을 흔들지 않는다
    W.rival = null;
    if (mode === 'endless' && opts.rival !== false) {
      const lvId = D.RIVAL.levels[opts.rivalLevel] ? opts.rivalLevel : W.diff;
      const L = D.RIVAL.levels[lvId];
      W.rival = {
        level: lvId, rng: SN.rng(((seed0 >>> 0) * 2654435761 + 97) >>> 0),
        speed: L.speed * adaptPow(W, 'rivalSpeed'), react: L.react * adaptPow(W, 'rivalReact'),
        smart: Math.min(1, L.smart * adaptPow(W, 'rivalSmart')), wander: L.wander, clumsy: L.clumsy,
        keepAway: L.keepAway, maxLen: L.maxLen,
        met: false, eaten: 0, golds: 0, bumps: 0, passes: 0,
      };
    }
    setup(W);
    // 시작 아이템: 첫 레벨에만 효과를 켜 둔다 (출발 대기 동안은 줄지 않는다)
    W.startItems = [];
    const st = opts.start || {};
    for (const it of D.START_ITEMS || []) {
      if (!st[it.id]) continue;
      W.eff[it.eff] = Math.max(W.eff[it.eff] || 0, it.time);
      W.startItems.push(it.id);
    }
    return W;
  }

  // 초당 칸 수. 길어질수록 빨라지고 상한에서 멈춘다. 느린 시계를 먹으면 잠깐 느려진다
  function speed(W) {
    const len = W.snake.length - D.START.len, E = D.EASY, H = D.HARD;
    let s = W.hard
      ? (W.mode === 'stage'
        ? Math.min(H.max, W.lv.speed * H.stageMul + len * H.stagePerGrow * (W.growMul || 1))
        : Math.min(H.max, H.base + len * H.perGrow * (W.growMul || 1)))
      : W.easy
      ? Math.min(E.max, (W.mode === 'stage' ? W.lv.speed * E.stageMul : E.base) + len * E.perGrow * (W.growMul || 1))
      : W.mode === 'stage'
      ? Math.min(D.SPEED.max, W.lv.speed + len * D.SPEED.stagePerGrow * (W.growMul || 1))
      : Math.min(D.SPEED.max, D.SPEED.base + len * D.SPEED.perGrow * (W.growMul || 1));
    if (W.eff && W.eff.slow > 0) s *= D.ITEM.slowMul;
    return s * (W.speedMul || 1);
  }

  function freeCells(W) {
    const used = new Uint8Array(W.cols * W.rows);
    for (const p of W.snake) used[p.y * W.cols + p.x] = 1;
    if (rivalShown(W)) for (const p of W.rival.body) used[p.y * W.cols + p.x] = 1;
    if (W.walls) for (let i = 0; i < used.length; i++) if (W.walls[i] || W.portalAt[i] >= 0) used[i] = 1;
    if (W.food) used[W.food.y * W.cols + W.food.x] = 1;
    if (W.item) used[W.item.y * W.cols + W.item.x] = 1;
    if (W.gift) used[W.gift.y * W.cols + W.gift.x] = 1;
    if (W.bonus) used[W.bonus.y * W.cols + W.bonus.x] = 1;
    const free = [];
    for (let i = 0; i < used.length; i++) if (!used[i]) free.push(i);
    return free;
  }

  // 빈 칸 중 하나에 먹이를 놓는다. 빈 칸이 없으면 판을 다 채운 것
  function spawnFood(W) {
    W.food = null;
    const free = freeCells(W);
    if (!free.length) return false;
    const i = free[Math.floor(W.rand() * free.length)];
    W.food = { x: i % W.cols, y: Math.floor(i / W.cols), gold: (W.eaten + (W.rival ? W.rival.eaten : 0) + 1) % D.FOOD.goldEvery === 0, born: W.t };
    return true;
  }

  function spawnItem(W) {
    const free = freeCells(W);
    if (!free.length) return false;
    const i = free[Math.floor(W.rand() * free.length)];
    const kind = ITEM_KINDS[Math.floor(W.rand() * ITEM_KINDS.length)];
    W.item = { kind, x: i % W.cols, y: Math.floor(i / W.cols), life: D.ITEM.life, born: W.t };
    W.events.push('item');
    return true;
  }
  const itemsOn = W => W.mode === 'endless' || (W.mode === 'stage' && W.lv && W.lv.items);

  // 방향 넣기. 같은 방향·정반대(내 몸으로 들어가기)·줄이 가득 찬 경우는 무시한다
  function turn(W, dir) {
    if (!DIRS[dir] || W.phase !== 'play') return false;
    // 쉬움: 출발 전이면 지금 방향을 눌러도 출발 (옆 방향은 아래에서 꺾으며 출발, 정반대는 무시)
    if (W.easy && W.wait > 0 && dir === W.dir) { W.wait = 0; return true; }
    const last = W.queue.length ? W.queue[W.queue.length - 1] : W.dir;
    if (dir === last || dir === OPP[last]) return false;
    if (W.queue.length >= D.TURN_QUEUE) return false;
    W.queue.push(dir);
    W.wait = 0; // 방향을 넣으면 기다리지 않고 바로 출발
    return true;
  }

  function die(W, cause) {
    W.phase = 'over';
    W.cause = cause;
    W.prev = copy(W.snake);
    W.alpha = 0;
    W.events.push('over');
    const h = W.snake[0], d = DIRS[W.dir];
    W.fx.push({ kind: 'die', x: h.x, y: h.y, dx: d[0], dy: d[1] });
  }

  // 아이템 먹기
  function usePower(W, it) {
    const K = D.ITEM.kinds[it.kind];
    W.powers++; W.powerSeen[it.kind] = true;
    if (it.kind === 'cut') {
      const cut = Math.min(Math.floor(W.snake.length / 3), W.snake.length - D.START.len);
      for (let i = 0; i < cut; i++) W.snake.pop();
      W.grow = 0;
      W.score += K.points;
      W.fx.push({ kind: 'cut', x: it.x, y: it.y, n: cut });
    } else {
      W.eff[it.kind] = K.time * (it.kind === 'ghost' ? W.ghostMul || 1 : 1);
      W.fx.push({ kind: 'power', x: it.x, y: it.y, item: it.kind });
    }
    W.lastPower = it.kind;
    W.events.push('power');
  }

  // 한 칸 전진
  function tick(W) {
    W.ticks++;
    if (W.queue.length) {
      const d = W.queue.shift();
      if (d !== W.dir && d !== OPP[W.dir]) { W.dir = d; W.turns++; W.events.push('turn'); }
    }
    const [dx, dy] = DIRS[W.dir];
    const C = W.cols, R = W.rows, ghost = W.eff && W.eff.ghost > 0;
    const h = W.snake[0];
    let nx = h.x + dx, ny = h.y + dy;
    if (nx < 0 || ny < 0 || nx >= C || ny >= R) {
      if (!ghost && !W.easy) return die(W, 'wall');
      // 유령·쉬움: 판 가장자리를 넘으면 반대편에서 나온다
      nx = (nx + C) % C; ny = (ny + R) % R;
      if (ghost) W.wraps++;
      W.events.push('wrap');
    }
    if (W.walls && W.walls[ny * C + nx]) {
      if (W.eff && W.eff.giant > 0) {
        // 거대 뱀: 안쪽 벽을 부수고 지나간다 (이 레벨 동안 부서진 채)
        W.walls[ny * C + nx] = 0; W.wallVer++; W.smashed++;
        W.events.push('smash'); W.fx.push({ kind: 'smash', x: nx, y: ny });
      } else if (!ghost) return die(W, 'wall');
      else { W.wraps++; W.events.push('wrap'); }
    }
    // 포털: 들어간 칸의 짝으로 순간 이동 (같은 방향으로 계속)
    const pid = W.portalAt ? W.portalAt[ny * C + nx] : -1;
    if (pid >= 0) {
      const P = W.portals[pid], from = { x: nx, y: ny };
      const to = P.a.x === nx && P.a.y === ny ? P.b : P.a;
      nx = to.x; ny = to.y;
      W.portalsUsed++; W.events.push('portal');
      W.fx.push({ kind: 'portal', x: from.x, y: from.y }, { kind: 'portal', x: nx, y: ny });
    }

    const eatMain = !!W.food && W.food.x === nx && W.food.y === ny;
    const eatBonus = !eatMain && !!W.bonus && W.bonus.x === nx && W.bonus.y === ny;
    const eat = eatMain || eatBonus;
    if (!ghost) {
      // 이번에 꼬리가 빠지면 꼬리 끝 칸으로는 들어가도 된다
      const tailMoves = W.grow === 0 && !eat;
      const n = W.snake.length - (tailMoves ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const p = W.snake[i];
        if (p.x === nx && p.y === ny) return die(W, 'self');
      }
      // 라이벌 몸: 보통은 내 몸처럼 위험, 쉬움은 그냥 지나가고 라이벌이 멈칫 (꼬리 끝 칸은 곧 빠지니 괜찮다)
      if (rivalAt(W, nx, ny, true)) {
        if (!W.easy && !(W.eff.giant > 0)) return die(W, 'rival');
        const V = W.rival;
        if (!(V.stun > 0)) { V.passes++; W.events.push('pass'); W.fx.push({ kind: 'pass', x: nx, y: ny }); }
        V.stun = Math.max(V.stun, D.RIVAL.passStun);
      }
    }

    W.prev = copy(W.snake);
    W.snake.unshift({ x: nx, y: ny });
    if (eat) {
      const gold = eatMain && W.food.gold;
      W.grow++;
      W.eaten++;
      const bonus = Math.floor((W.snake.length - 1 - D.START.len) / D.FOOD.bonusPer) * D.FOOD.bonus;
      let pts = (gold ? D.FOOD.goldPoints : D.FOOD.points) + bonus;
      if (W.fun) {
        // 콤보: 빨리 이어 먹을수록 배율이 오른다
        W.combo = W.time - W.lastEat <= W.comboWindow ? W.combo + 1 : 1;
        W.lastEat = W.time;
        W.maxCombo = Math.max(W.maxCombo, W.combo);
        const m = Math.min(D.COMBO.max, 1 + Math.floor((W.combo - 1) / D.COMBO.step));
        if (m > W.mult) W.events.push('combo');
        W.mult = m;
        pts *= m * (W.eff.double > 0 ? 2 : 1) * (W.feverT > 0 ? D.FEVER.mul : 1);
        // 피버 게이지: 콤보 2 이상으로 먹을 때마다 찬다
        if (W.feverT <= 0 && W.combo >= 2) { W.fever = Math.min(1, W.fever + D.FEVER.perCombo); if (W.fever >= 1) startFever(W); }
        // 거대 뱀: 황금 구슬 셋을 짧은 시간 안에
        if (gold) {
          W.goldTimes = W.goldTimes.filter(t => W.time - t <= D.GIANT.window);
          W.goldTimes.push(W.time);
          if (W.goldTimes.length >= D.GIANT.golds && !(W.eff.giant > 0)) startGiant(W);
        }
      }
      W.score += pts;
      W.lastPts = pts;
      if (gold) W.golds++;
      if (W.mode !== 'stage') spaceAdvance(W);
      W.events.push(gold ? 'gold' : 'eat');
      W.fx.push({ kind: gold ? 'gold' : 'eat', x: nx, y: ny, pts });
      if (W.mode === 'stage') W.got++;
    }
    if (W.grow > 0) W.grow--; else W.snake.pop();
    W.maxLen = Math.max(W.maxLen, W.snake.length);
    if (W.item && W.item.x === nx && W.item.y === ny) { const it = W.item; W.item = null; usePower(W, it); }
    if (W.gift && W.gift.x === nx && W.gift.y === ny) openGift(W);
    if (eatBonus) { W.bonus = null; if (W.feverT > 0) spawnBonus(W); }
    if (W.mode === 'stage' && W.got >= W.goal) {
      // 레벨 깸: 잠깐 멈추고 다음 레벨로 (main.js가 clearTime 뒤 nextLevel을 부른다)
      W.phase = 'clear'; W.clearT = 0; W.levelsCleared++;
      W.score += D.STAGE.clearBonus * W.level;
      W.prev = copy(W.snake); W.alpha = 0;
      W.events.push('clear');
      return;
    }
    if (eatMain && !spawnFood(W)) {
      // 판을 가득 채웠다: 이긴 것으로 끝낸다
      W.phase = 'over';
      W.won = true;
      W.prev = copy(W.snake);
      W.events.push('win');
    }
  }

  // 스테이지: 다음 레벨 (점수·기록은 그대로, 뱀은 처음 길이로)
  function nextLevel(W) {
    if (W.mode !== 'stage') return false;
    W.level++;
    W.phase = 'play';
    setup(W);
    W.events.push('level');
    return true;
  }

  // 시간 흐름에 따른 것들: 황금 구슬 식기, 아이템 나타남·사라짐, 효과 시간
  function timers(W, dt) {
    if (!W.fun) return;
    if (W.food && W.food.gold && W.t - W.food.born > W.goldLife) {
      W.food.gold = false; W.food.born = W.t;
      W.fx.push({ kind: 'cool', x: W.food.x, y: W.food.y });
      W.events.push('cool');
    }
    for (const k in W.eff) W.eff[k] = Math.max(0, W.eff[k] - dt);
    // 피버: 도는 동안 줄고, 끝나면 보너스 구슬도 사라진다. 쉬는 동안 게이지가 천천히 준다
    if (W.feverT > 0) { W.feverT -= dt; if (W.feverT <= 0) { W.feverT = 0; W.bonus = null; W.events.push('feverend'); } }
    else W.fever = Math.max(0, W.fever - D.FEVER.decay * dt);
    // 선물 상자
    if (W.gift) { W.gift.life -= dt; if (W.gift.life <= 0) { W.gift = null; W.events.push('giftgone'); } }
    else if (W.giftT < Infinity) {
      W.giftT -= dt;
      if (W.giftT <= 0) { spawnGift(W); W.giftT = W.mode === 'endless' ? giftGap(W, false) : Infinity; }
    }
    if (!itemsOn(W)) return;
    if (W.item) {
      W.item.life -= dt;
      if (W.item.life <= 0) W.item = null;
    } else {
      W.itemT -= dt;
      if (W.itemT <= 0) {
        spawnItem(W);
        W.itemT = (D.ITEM.gapMin + W.rand() * (D.ITEM.gapMax - D.ITEM.gapMin)) * W.itemGapMul;
      }
    }
  }

  // ─── 라이벌 뱀 (무한 모드) ─────────────────────────────────
  // W.rival: {phase: wait(아직) | warn(나오기 전 깜빡임) | play | gone(사라졌다가 다시 나올 때까지),
  //           body, prev, dir, acc, alpha, stun, t, target, eaten, golds, bumps(내게 부딪혀 멈칫), passes(쉬움: 내가 지나감), met(한 번이라도 나옴)}
  const rivalShown = W => !!(W.rival && (W.rival.phase === 'warn' || W.rival.phase === 'play'));
  const rivalLive = W => !!(W.rival && W.rival.phase === 'play');

  // 판(레벨)을 새로 준비할 때: 처음 상태로. 나오는 시각은 판에서 움직인 시간 기준
  function resetRival(W) {
    const V = W.rival;
    V.phase = 'wait'; V.body = []; V.prev = []; V.dir = 'right'; V.acc = 0; V.alpha = 0;
    V.stun = 0; V.t = 0; V.grow = 0; V.target = null; V.blocked = false;
  }

  // (x, y)가 라이벌 몸인가. skipTail: 곧 빠질 꼬리 끝 칸은 빼고 (자랄 때·멈칫할 때는 꼬리가 안 빠진다)
  function rivalAt(W, x, y, skipTail) {
    if (!rivalLive(W)) return false;
    const V = W.rival, B = V.body;
    const n = B.length - (skipTail && V.grow === 0 && !(V.stun > 0) ? 1 : 0);
    for (let i = 0; i < n; i++) if (B[i].x === x && B[i].y === y) return true;
    return false;
  }
  const onPlayer = (W, x, y) => { for (const p of W.snake) if (p.x === x && p.y === y) return true; return false; };

  // 나올 자리 찾기: 몸 모든 칸이 비어 있고 내 머리에서 멀며, 앞 3칸도 비어 있고, 내게서 멀어지는 방향
  function spawnRival(W) {
    const V = W.rival, C = W.cols, R = W.rows, len = D.RIVAL.len, h = W.snake[0];
    const used = new Uint8Array(C * R);
    for (const p of W.snake) used[p.y * C + p.x] = 1;
    if (W.walls) for (let i = 0; i < used.length; i++) if (W.walls[i] || W.portalAt[i] >= 0) used[i] = 1;
    if (W.food) used[W.food.y * C + W.food.x] = 1;
    if (W.item) used[W.item.y * C + W.item.x] = 1;
    const far = (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y);
    const keys = Object.keys(DIRS);
    for (let k = 0; k < 400; k++) {
      const x = Math.floor(V.rng() * C), y = Math.floor(V.rng() * R), dir = keys[Math.floor(V.rng() * 4)];
      const [dx, dy] = DIRS[dir];
      let ok = far(x + dx, y + dy) > far(x, y);
      for (let i = -3; i < len && ok; i++) {          // i < 0: 머리 앞 3칸, 0..len-1: 몸
        const cx = x - dx * i, cy = y - dy * i;
        if (cx < 0 || cy < 0 || cx >= C || cy >= R || used[cy * C + cx]) ok = false;
        else if (i >= 0 && far(cx, cy) < D.RIVAL.minDist) ok = false;
      }
      if (!ok) continue;
      V.body = [];
      for (let i = 0; i < len; i++) V.body.push({ x: x - dx * i, y: y - dy * i });
      V.prev = copy(V.body); V.dir = dir; V.acc = 0; V.alpha = 0; V.stun = 0; V.grow = 0; V.target = null; V.blocked = false;
      V.phase = 'warn'; V.t = D.RIVAL.appear; V.met = true;
      W.fx.push({ kind: 'rivalIn', x, y });
      W.events.push('rivalwarn');
      return true;
    }
    V.phase = 'gone'; V.t = 1;   // 자리가 없으면 1초 뒤 다시 찾는다
    return false;
  }

  // 라이벌 머리가 dir로 가면 닿는 칸 (쉬움은 판 끝을 넘어 반대편, 보통은 판 밖이면 null)
  function rivalNext(W, h, dir) {
    let x = h.x + DIRS[dir][0], y = h.y + DIRS[dir][1];
    const C = W.cols, R = W.rows;
    if (x < 0 || y < 0 || x >= C || y >= R) { if (!W.easy) return null; x = (x + C) % C; y = (y + R) % R; }
    return { x, y };
  }

  // 한 칸 전진: 갈 수 있는 방향 중 (구슬 쪽 / 그냥 앞 / 아무 데) 하나. 내 머리 둘레는 피하고, 빈 곳이 넉넉한 쪽
  function rivalTick(W) {
    const V = W.rival, C = W.cols, R = W.rows, B = V.body, h = B[0];
    // 새 구슬은 react초 뒤에야 알아챈다 (그동안 아이가 먼저 갈 수 있다). 옛 자리에 닿으면 잊는다
    if (W.food && W.t - W.food.born >= V.react) V.target = { x: W.food.x, y: W.food.y };
    if (V.target && V.target.x === h.x && V.target.y === h.y) V.target = null;
    const clumsy = V.rng() < V.clumsy;
    const block = new Uint8Array(C * R);   // 라이벌이 피하는 칸: 벽 · 자기 몸(빠질 꼬리 빼고) · 내 몸
    for (let i = 0; i < B.length - (V.grow ? 0 : 1); i++) block[B[i].y * C + B[i].x] = 1;
    if (W.walls) for (let i = 0; i < block.length; i++) if (W.walls[i] || W.portalAt[i] >= 0) block[i] = 1;
    if (W.gift) block[W.gift.y * C + W.gift.x] = 1;   // 선물 상자는 내 것 (라이벌은 비켜 간다)
    const mine = new Uint8Array(C * R);
    for (const p of W.snake) mine[p.y * C + p.x] = 1;
    const reach = (sx, sy, limit) => {
      const seen = new Uint8Array(C * R), st = [sy * C + sx];
      seen[st[0]] = 1;
      let n = 0;
      while (st.length && n < limit) {
        const c = st.pop(); n++;
        const x = c % C, y = (c - x) / C;
        for (const k in DIRS) {
          let ax = x + DIRS[k][0], ay = y + DIRS[k][1];
          if (ax < 0 || ay < 0 || ax >= C || ay >= R) { if (!W.easy) continue; ax = (ax + C) % C; ay = (ay + R) % R; }
          const j = ay * C + ax;
          if (!seen[j] && !block[j] && !mine[j]) { seen[j] = 1; st.push(j); }
        }
      }
      return n;
    };
    const ph = W.snake[0], pd = DIRS[W.queue.length && W.queue[0] !== OPP[W.dir] ? W.queue[0] : W.dir];
    const aheadX = ph.x + pd[0], aheadY = ph.y + pd[1];
    const need = B.length + 2;
    const mode = V.rng() < V.wander ? 'wander' : V.target && V.rng() < V.smart ? 'food' : 'straight';
    const cand = [];
    let forced = null;
    for (const k in DIRS) {
      if (k === OPP[V.dir]) continue;
      const c = rivalNext(W, h, k);
      if (!c || block[c.y * C + c.x]) continue;
      const onMe = !!mine[c.y * C + c.x];
      if (onMe && !clumsy) { if (!forced) forced = { k, c }; continue; }
      const room = onMe ? need : reach(c.x, c.y, need);   // 덜렁댈 때(clumsy)는 내 몸을 빈 칸으로 안다
      const pd2 = Math.abs(c.x - ph.x) + Math.abs(c.y - ph.y);
      let sc = room >= need ? 1000 : room * 10;
      if (pd2 < V.keepAway) sc -= (V.keepAway - pd2) * 60;          // 내 머리 가까이는 되도록 안 간다
      if (pd2 <= 1) sc -= 400;                                       // 내 머리 바로 옆 칸은 거의 안 간다
      if (c.x === aheadX && c.y === aheadY) sc -= 800;               // 내 바로 앞 칸은 막지 않는다
      for (let j = 2; j <= 4; j++) if (c.x === ph.x + pd[0] * j && c.y === ph.y + pd[1] * j) sc -= 300 / j;   // 내 앞길 몇 칸도 되도록 비켜 준다
      if (mode === 'food') sc -= Math.abs(c.x - V.target.x) + Math.abs(c.y - V.target.y);
      else if (mode === 'wander') sc += V.rng() * 8;
      if (k === V.dir) sc += mode === 'straight' ? 3 : 0.5;
      cand.push({ k, c, s: sc });
    }
    let pick = null;
    for (const q of cand) if (!pick || q.s > pick.s) pick = q;
    if (!pick && forced) pick = forced;   // 내 몸 말고는 갈 데가 없다: 부딪혀 멈칫
    if (!pick) {
      // 막혔다: 멈칫, 그래도 막혀 있으면 사라졌다가 다른 자리에서 다시
      if (V.blocked) { W.fx.push({ kind: 'rivalOut', x: h.x, y: h.y }); V.phase = 'gone'; V.t = D.RIVAL.back; V.body = []; V.prev = []; return; }
      V.blocked = true; V.stun = D.RIVAL.blockStun; V.prev = copy(B);
      return;
    }
    V.blocked = false;
    const c = pick.c;
    V.dir = pick.k;
    V.prev = copy(B);
    if (mine[c.y * C + c.x]) {
      // 라이벌 머리가 내 몸에 쿵: 라이벌만 멈칫하고 조금 줄어든다 (내가 이긴 것)
      V.stun = D.RIVAL.bumpStun; V.bumps++;
      const cut = Math.max(0, Math.min(D.RIVAL.bumpShrink, B.length - D.RIVAL.minLen));
      for (let i = 0; i < cut; i++) B.pop();
      V.grow = 0; V.prev = copy(B);
      W.events.push('bump');
      W.fx.push({ kind: 'bump', x: c.x, y: c.y, hx: h.x, hy: h.y, n: cut });
      return;
    }
    B.unshift({ x: c.x, y: c.y });
    const eat = !!W.food && W.food.x === c.x && W.food.y === c.y;
    if (eat) {
      V.eaten++;
      if (W.food.gold) V.golds++;
      if (B.length < V.maxLen) V.grow++;
      V.target = null;
      W.events.push('rivaleat');
      W.fx.push({ kind: 'rivalEat', x: c.x, y: c.y, gold: W.food.gold });
      spawnFood(W);
    }
    if (V.grow > 0) V.grow--; else B.pop();
  }

  // 라이벌 시간 흐름: 나오기 · 예고 깜빡임 · 멈칫 · 자기 속도로 전진
  function rivalStep(W, dt) {
    const V = W.rival;
    if (!V || W.phase !== 'play') return;
    if (V.phase === 'wait') { if (W.time >= D.RIVAL.intro) spawnRival(W); return; }
    if (V.phase === 'gone') { V.t -= dt; if (V.t <= 0) spawnRival(W); return; }
    if (V.phase === 'warn') { V.t -= dt; if (V.t <= 0) { V.phase = 'play'; V.acc = 0; V.shownAt = W.time; W.events.push('rival'); } return; }
    if (V.stun > 0) {
      V.stun -= dt; V.alpha = 0;
      if (V.stun > 0) return;
      dt = -V.stun; V.stun = 0; V.acc = 0;
    }
    V.acc += dt;
    const iv = 1 / V.speed;
    let guard = 0;
    while (V.acc >= iv && V.phase === 'play' && !(V.stun > 0) && W.phase === 'play') {
      V.acc -= iv;
      rivalTick(W);
      if (++guard > 8) { V.acc = 0; break; }
    }
    V.alpha = V.phase === 'play' && !(V.stun > 0) ? Math.min(1, V.acc / iv) : 0;
  }

  // 판이 끝났을 때 라이벌과 비교 (라이벌이 한 번도 안 나왔으면 null). diff > 0 이면 내가 더 먹었다
  function rivalResult(W) {
    if (!W.rival || !W.rival.met) return null;
    return { me: W.eaten, rival: W.rival.eaten, diff: W.eaten - W.rival.eaten, bumps: W.rival.bumps };
  }

  // 놀이 본부(common/hub.js) reportRun에 보낼 이번 판 값 (스티커북·오늘의 미션)
  function hubStats(W) {
    const r = rivalResult(W);
    return {
      len: W.maxLen, golds: W.golds, orbs: W.eaten, planet: W.space.max,
      level: W.mode === 'stage' && W.levelsCleared > 0 ? W.startLevel + W.levelsCleared - 1 : 0,
      rivalWin: r && r.diff > 0 ? 1 : 0,
      gifts: W.gifts, fevers: W.fevers, giants: W.giants,
    };
  }
  // 알아서 맞춰 주는 난이도: 이번 판이 그 난이도 기준으로 얼마나 잘했나 (1이 보통, HUB.adaptRun이 0~3으로 자른다)
  function adaptPerf(W) {
    const t = D.ADAPT.target[W.diff] || D.ADAPT.target.normal;
    return t > 0 ? W.eaten / t : 1;
  }

  // 시간을 모아 두었다가 칸 간격만큼 찰 때마다 한 칸씩 전진한다
  function step(W, dt) {
    if (W.phase === 'clear') { W.t += dt; W.clearT += dt; return; }
    if (W.phase !== 'play') return;
    W.t += dt;
    if (W.wait > 0) {
      W.wait -= dt;
      if (W.wait > 0) { W.alpha = 0; return; }
      dt = -W.wait;
      W.wait = 0;
    }
    W.time += dt;
    timers(W, dt);
    W.acc += dt;
    let iv = 1 / speed(W), guard = 0;
    while (W.acc >= iv && W.phase === 'play') {
      W.acc -= iv;
      tick(W);
      iv = 1 / speed(W);
      if (++guard > 8) { W.acc = 0; break; } // 멈췄다 돌아온 긴 프레임은 버린다
    }
    if (W.rival) rivalStep(W, dt);
    W.alpha = W.phase === 'play' ? Math.min(1, W.acc / iv) : 0;
  }

  // 자동 운전: 시작 화면 시연과 테스트용.
  // 죽지 않는 방향 중에서, 갈 수 있는 빈 칸이 넉넉하고 먹이에 가까운 쪽을 고른다
  function botDir(W) {
    const h = W.snake[0], cols = W.cols, rows = W.rows;
    const block = new Uint8Array(cols * rows);
    for (let i = 0; i < W.snake.length - 1; i++) block[W.snake[i].y * cols + W.snake[i].x] = 1;
    if (W.walls) for (let i = 0; i < block.length; i++) if (W.walls[i]) block[i] = 1;
    if (rivalLive(W) && !W.easy) for (const p of W.rival.body) block[p.y * cols + p.x] = 1;
    const reach = (sx, sy, limit) => {
      const seen = new Uint8Array(cols * rows), st = [sy * cols + sx];
      seen[st[0]] = 1;
      let n = 0;
      while (st.length && n < limit) {
        const c = st.pop(); n++;
        const x = c % cols, y = (c - x) / cols;
        for (const k in DIRS) {
          const ax = x + DIRS[k][0], ay = y + DIRS[k][1];
          if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue;
          const j = ay * cols + ax;
          if (!seen[j] && !block[j]) { seen[j] = 1; st.push(j); }
        }
      }
      return n;
    };
    const need = W.snake.length + 2;
    let best = null, bestScore = -Infinity;
    for (const k in DIRS) {
      if (k === OPP[W.dir]) continue;
      const nx = h.x + DIRS[k][0], ny = h.y + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || block[ny * cols + nx]) continue;
      const room = reach(nx, ny, need);
      const f = W.food ? Math.abs(W.food.x - nx) + Math.abs(W.food.y - ny) : 0;
      const s = (room >= need ? 1000 : room * 10) - f + (k === W.dir ? 0.5 : 0);
      if (s > bestScore) { bestScore = s; best = k; }
    }
    return best || W.dir;
  }

  // 앞길 위험 살피기 (그리기용 경고): 지금 방향(줄 선 방향이 있으면 그 방향)으로 max칸 안에
  // 부딪히면 끝나는 칸(벽·판 끝·내 몸·보통일 때 라이벌 몸)이 있으면 {dist, x, y, cause}, 없으면 null.
  // 몸은 그 칸에 닿을 때쯤 꼬리가 빠져 있으면 위험이 아니다. 유령일 때는 늘 null
  function dangerAhead(W, max) {
    if (!W || W.phase !== 'play' || (W.eff && W.eff.ghost > 0)) return null;
    let dir = W.dir;
    if (W.queue.length && W.queue[0] !== OPP[W.dir]) dir = W.queue[0];
    const [dx, dy] = DIRS[dir], C = W.cols, R = W.rows, n = W.snake.length;
    let x = W.snake[0].x, y = W.snake[0].y;
    for (let k = 1; k <= (max || 3); k++) {
      x += dx; y += dy;
      if (x < 0 || y < 0 || x >= C || y >= R) {
        if (!W.easy) return { dist: k, x: Math.max(0, Math.min(C - 1, x)), y: Math.max(0, Math.min(R - 1, y)), cause: 'edge' };
        x = (x + C) % C; y = (y + R) % R;
      }
      if (W.walls && W.walls[y * C + x] && !(W.eff && W.eff.giant > 0)) return { dist: k, x, y, cause: 'wall' };
      if (W.portalAt && W.portalAt[y * C + x] >= 0) return null;   // 포털 너머는 살피지 않는다
      for (let i = 0; i < n - k; i++) if (W.snake[i].x === x && W.snake[i].y === y) return { dist: k, x, y, cause: 'self' };
      // 라이벌 몸 (보통만. 쉬움은 지나가도 괜찮다). 곧 빠질 꼬리 끝 칸은 빼고
      if (!W.easy && !(W.eff && W.eff.giant > 0) && rivalAt(W, x, y, true)) return { dist: k, x, y, cause: 'rival' };
    }
    return null;
  }

  // 이번 판 기록 (메달 확인용)
  function runStats(W) {
    return {
      mode: W.mode, score: W.score, golds: W.golds, eaten: W.eaten, maxLen: W.maxLen, maxCombo: W.maxCombo,
      powers: W.powers, powerKinds: Object.keys(W.powerSeen).length, portals: W.portalsUsed, wraps: W.wraps,
      levelsCleared: W.levelsCleared, level: W.level, time: W.time, easy: W.easy, diff: W.diff,
      // 이번 판에 깬 가장 높은 레벨 (스테이지만, 못 깼으면 0) · 보통 난이도일 때만 센 길이 (미션용)
      lvlTop: W.mode === 'stage' && W.levelsCleared > 0 ? W.startLevel + W.levelsCleared - 1 : 0,
      normalLen: W.easy ? 0 : W.maxLen,
      // 어려움으로 한 판 (미션용)
      hardLen: W.hard ? W.maxLen : 0, hardTime: W.hard ? W.time : 0,
      // 재미 셋: 선물 상자 · 선물 코인 · 다음 판 시작 아이템 선물 · 피버 · 거대 뱀
      gifts: W.gifts, giftCoins: W.giftCoins, giftStart: W.giftStart.slice(), fevers: W.fevers, giants: W.giants,
      rivalMet: !!(W.rival && W.rival.met), rivalEaten: W.rival ? W.rival.eaten : 0,
    };
  }

  SN.World = { create, step, turn, speed, spawnFood, spawnItem, nextLevel, levelDef, buildWalls, botDir, runStats, dangerAhead, charDef, spawnRival, rivalAt, rivalResult, hubStats, adaptPerf, sceneInfo, stageScene, spaceScene, diffOf, spawnGift, openGift, startFever, startGiant, DIRS, OPP };
})(SN);
