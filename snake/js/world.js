'use strict';
// 게임 규칙. DOM·canvas를 쓰지 않는다 (node 테스트가 그대로 불러 돌린다: tests/snake.test.js).
// 좌표는 칸 단위 정수. snake[0]이 머리다.
// 모드: classic(기본 규칙만) · endless(무한: 콤보·아이템·황금 시간 제한) · stage(스테이지: 레벨마다 벽·포털·목표)
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
    W.item = null; W.itemT = D.ITEM.first;
    W.eff = { slow: 0, double: 0, ghost: 0 };
    W.lastEat = -99; W.combo = 0; W.mult = 1;
    W.food = null;
    spawnFood(W);
  }

  // opts: {mode: 'classic' | 'endless' | 'stage', level}
  function create(cols, rows, seed, opts) {
    opts = opts || {};
    const rand = SN.rng(seed == null ? (Date.now() ^ 0x5bd1e995) : seed);
    const mode = opts.mode === 'endless' || opts.mode === 'stage' ? opts.mode : 'classic';
    const W = {
      cols, rows, rand, mode, fun: mode !== 'classic', easy: !!opts.easy,
      level: mode === 'stage' ? Math.max(1, opts.level || 1) : 0,
      snake: [], prev: [], dir: 'right',
      queue: [],          // 아직 적용 안 된 방향 (최대 D.TURN_QUEUE개)
      grow: 0,            // 앞으로 늘어날 칸 수
      food: null,         // {x, y, gold, born}
      eaten: 0, golds: 0, score: 0,
      phase: 'play',      // play | clear(스테이지 레벨 깸) | over
      won: false,         // 판을 가득 채우면 true
      cause: null,        // wall | self
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
    setup(W);
    return W;
  }

  // 초당 칸 수. 길어질수록 빨라지고 상한에서 멈춘다. 느린 시계를 먹으면 잠깐 느려진다
  function speed(W) {
    const len = W.snake.length - D.START.len, E = D.EASY;
    let s = W.easy
      ? Math.min(E.max, (W.mode === 'stage' ? W.lv.speed * E.stageMul : E.base) + len * E.perGrow)
      : W.mode === 'stage'
      ? Math.min(D.SPEED.max, W.lv.speed + len * D.SPEED.stagePerGrow)
      : Math.min(D.SPEED.max, D.SPEED.base + len * D.SPEED.perGrow);
    if (W.eff && W.eff.slow > 0) s *= D.ITEM.slowMul;
    return s;
  }

  function freeCells(W) {
    const used = new Uint8Array(W.cols * W.rows);
    for (const p of W.snake) used[p.y * W.cols + p.x] = 1;
    if (W.walls) for (let i = 0; i < used.length; i++) if (W.walls[i] || W.portalAt[i] >= 0) used[i] = 1;
    if (W.food) used[W.food.y * W.cols + W.food.x] = 1;
    if (W.item) used[W.item.y * W.cols + W.item.x] = 1;
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
    W.food = { x: i % W.cols, y: Math.floor(i / W.cols), gold: (W.eaten + 1) % D.FOOD.goldEvery === 0, born: W.t };
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
      W.eff[it.kind] = K.time;
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
      if (!ghost) return die(W, 'wall');
      W.wraps++; W.events.push('wrap');
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

    const eat = !!W.food && W.food.x === nx && W.food.y === ny;
    if (!ghost) {
      // 이번에 꼬리가 빠지면 꼬리 끝 칸으로는 들어가도 된다
      const tailMoves = W.grow === 0 && !eat;
      const n = W.snake.length - (tailMoves ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const p = W.snake[i];
        if (p.x === nx && p.y === ny) return die(W, 'self');
      }
    }

    W.prev = copy(W.snake);
    W.snake.unshift({ x: nx, y: ny });
    if (eat) {
      const gold = W.food.gold;
      W.grow++;
      W.eaten++;
      const bonus = Math.floor((W.snake.length - 1 - D.START.len) / D.FOOD.bonusPer) * D.FOOD.bonus;
      let pts = (gold ? D.FOOD.goldPoints : D.FOOD.points) + bonus;
      if (W.fun) {
        // 콤보: 빨리 이어 먹을수록 배율이 오른다
        W.combo = W.time - W.lastEat <= D.COMBO.window ? W.combo + 1 : 1;
        W.lastEat = W.time;
        W.maxCombo = Math.max(W.maxCombo, W.combo);
        const m = Math.min(D.COMBO.max, 1 + Math.floor((W.combo - 1) / D.COMBO.step));
        if (m > W.mult) W.events.push('combo');
        W.mult = m;
        pts *= m * (W.eff.double > 0 ? 2 : 1);
      }
      W.score += pts;
      W.lastPts = pts;
      if (gold) W.golds++;
      W.events.push(gold ? 'gold' : 'eat');
      W.fx.push({ kind: gold ? 'gold' : 'eat', x: nx, y: ny, pts });
      if (W.mode === 'stage') W.got++;
    }
    if (W.grow > 0) W.grow--; else W.snake.pop();
    W.maxLen = Math.max(W.maxLen, W.snake.length);
    if (W.item && W.item.x === nx && W.item.y === ny) { const it = W.item; W.item = null; usePower(W, it); }
    if (W.mode === 'stage' && W.got >= W.goal) {
      // 레벨 깸: 잠깐 멈추고 다음 레벨로 (main.js가 clearTime 뒤 nextLevel을 부른다)
      W.phase = 'clear'; W.clearT = 0; W.levelsCleared++;
      W.score += D.STAGE.clearBonus * W.level;
      W.prev = copy(W.snake); W.alpha = 0;
      W.events.push('clear');
      return;
    }
    if (eat && !spawnFood(W)) {
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
    if (W.food && W.food.gold && W.t - W.food.born > D.FOOD.goldLife) {
      W.food.gold = false; W.food.born = W.t;
      W.fx.push({ kind: 'cool', x: W.food.x, y: W.food.y });
      W.events.push('cool');
    }
    for (const k in W.eff) W.eff[k] = Math.max(0, W.eff[k] - dt);
    if (!itemsOn(W)) return;
    if (W.item) {
      W.item.life -= dt;
      if (W.item.life <= 0) W.item = null;
    } else {
      W.itemT -= dt;
      if (W.itemT <= 0) {
        spawnItem(W);
        W.itemT = D.ITEM.gapMin + W.rand() * (D.ITEM.gapMax - D.ITEM.gapMin);
      }
    }
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
    W.alpha = W.phase === 'play' ? Math.min(1, W.acc / iv) : 0;
  }

  // 자동 운전: 시작 화면 시연과 테스트용.
  // 죽지 않는 방향 중에서, 갈 수 있는 빈 칸이 넉넉하고 먹이에 가까운 쪽을 고른다
  function botDir(W) {
    const h = W.snake[0], cols = W.cols, rows = W.rows;
    const block = new Uint8Array(cols * rows);
    for (let i = 0; i < W.snake.length - 1; i++) block[W.snake[i].y * cols + W.snake[i].x] = 1;
    if (W.walls) for (let i = 0; i < block.length; i++) if (W.walls[i]) block[i] = 1;
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
  // 부딪히면 끝나는 칸(벽·판 끝·내 몸)이 있으면 {dist, x, y, cause}, 없으면 null.
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
      if (W.walls && W.walls[y * C + x]) return { dist: k, x, y, cause: 'wall' };
      if (W.portalAt && W.portalAt[y * C + x] >= 0) return null;   // 포털 너머는 살피지 않는다
      for (let i = 0; i < n - k; i++) if (W.snake[i].x === x && W.snake[i].y === y) return { dist: k, x, y, cause: 'self' };
    }
    return null;
  }

  // 이번 판 기록 (메달 확인용)
  function runStats(W) {
    return {
      mode: W.mode, score: W.score, golds: W.golds, eaten: W.eaten, maxLen: W.maxLen, maxCombo: W.maxCombo,
      powers: W.powers, powerKinds: Object.keys(W.powerSeen).length, portals: W.portalsUsed, wraps: W.wraps,
      levelsCleared: W.levelsCleared, level: W.level, time: W.time,
    };
  }

  SN.World = { create, step, turn, speed, spawnFood, spawnItem, nextLevel, levelDef, buildWalls, botDir, runStats, dangerAhead, DIRS, OPP };
})(SN);
