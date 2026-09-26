'use strict';
// 게임 규칙. DOM·canvas를 쓰지 않는다 (node 테스트가 그대로 불러 돌린다: tests/snake.test.js).
// 좌표는 칸 단위 정수. snake[0]이 머리다.
(function (SN) {
  const D = SN.DATA;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

  const copy = s => s.map(p => ({ x: p.x, y: p.y }));

  function create(cols, rows, seed) {
    const rand = SN.rng(seed == null ? (Date.now() ^ 0x5bd1e995) : seed);
    const len = D.START.len;
    // 왼쪽 가운데쯤에서 오른쪽을 보고 출발
    const hx = Math.max(len, Math.floor(cols * 0.3)), hy = Math.floor(rows / 2);
    const snake = [];
    for (let i = 0; i < len; i++) snake.push({ x: hx - i, y: hy });
    const W = {
      cols, rows, rand,
      snake, prev: copy(snake),
      dir: 'right',
      queue: [],          // 아직 적용 안 된 방향 (최대 D.TURN_QUEUE개)
      grow: 0,            // 앞으로 늘어날 칸 수
      food: null,         // {x, y, gold, born}
      eaten: 0,
      golds: 0,
      score: 0,
      phase: 'play',      // play | over
      won: false,         // 판을 가득 채우면 true
      cause: null,        // wall | self
      t: 0,               // 흐른 시간 (출발 대기 포함, 연출용)
      time: 0,            // 실제로 움직인 시간 (기록용)
      wait: D.START.wait, // 출발 전 대기
      acc: 0,             // 다음 칸까지 모은 시간
      alpha: 0,           // 칸 사이 보간 비율 (그리기용)
      ticks: 0,
      turns: 0,
      events: [],         // 소리·진동용: 'eat' 'gold' 'turn' 'over' 'win'
      fx: [],             // 그리기 연출용: {kind, x, y}
    };
    spawnFood(W);
    return W;
  }

  // 한 칸 길어질 때마다 빨라지고 상한에서 멈춘다 (초당 칸 수)
  function speed(W) {
    return Math.min(D.SPEED.max, D.SPEED.base + (W.snake.length - D.START.len) * D.SPEED.perGrow);
  }

  // 빈 칸 중 하나에 먹이를 놓는다. 빈 칸이 없으면 판을 다 채운 것
  function spawnFood(W) {
    const used = new Uint8Array(W.cols * W.rows);
    for (const p of W.snake) used[p.y * W.cols + p.x] = 1;
    const free = [];
    for (let i = 0; i < used.length; i++) if (!used[i]) free.push(i);
    if (!free.length) { W.food = null; return false; }
    const i = free[Math.floor(W.rand() * free.length)];
    W.food = { x: i % W.cols, y: Math.floor(i / W.cols), gold: (W.eaten + 1) % D.FOOD.goldEvery === 0, born: W.t };
    return true;
  }

  // 방향 넣기. 같은 방향·정반대(내 몸으로 들어가기)·줄이 가득 찬 경우는 무시한다
  function turn(W, dir) {
    if (!DIRS[dir] || W.phase !== 'play') return false;
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

  // 한 칸 전진
  function tick(W) {
    W.ticks++;
    if (W.queue.length) {
      const d = W.queue.shift();
      if (d !== W.dir && d !== OPP[W.dir]) { W.dir = d; W.turns++; W.events.push('turn'); }
    }
    const [dx, dy] = DIRS[W.dir];
    const h = W.snake[0], nx = h.x + dx, ny = h.y + dy;
    if (nx < 0 || ny < 0 || nx >= W.cols || ny >= W.rows) return die(W, 'wall');

    const eat = !!W.food && W.food.x === nx && W.food.y === ny;
    // 이번에 꼬리가 빠지면 꼬리 끝 칸으로는 들어가도 된다
    const tailMoves = W.grow === 0 && !eat;
    const n = W.snake.length - (tailMoves ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const p = W.snake[i];
      if (p.x === nx && p.y === ny) return die(W, 'self');
    }

    W.prev = copy(W.snake);
    W.snake.unshift({ x: nx, y: ny });
    if (eat) {
      const gold = W.food.gold;
      W.grow++;
      W.eaten++;
      const bonus = Math.floor((W.snake.length - 1 - D.START.len) / D.FOOD.bonusPer) * D.FOOD.bonus;
      W.score += (gold ? D.FOOD.goldPoints : D.FOOD.points) + bonus;
      if (gold) W.golds++;
      W.events.push(gold ? 'gold' : 'eat');
      W.fx.push({ kind: gold ? 'gold' : 'eat', x: nx, y: ny });
    }
    if (W.grow > 0) W.grow--; else W.snake.pop();
    if (eat && !spawnFood(W)) {
      // 판을 가득 채웠다: 이긴 것으로 끝낸다
      W.phase = 'over';
      W.won = true;
      W.prev = copy(W.snake);
      W.events.push('win');
    }
  }

  // 시간을 모아 두었다가 칸 간격만큼 찰 때마다 한 칸씩 전진한다
  function step(W, dt) {
    if (W.phase !== 'play') return;
    W.t += dt;
    if (W.wait > 0) {
      W.wait -= dt;
      if (W.wait > 0) { W.alpha = 0; return; }
      dt = -W.wait;
      W.wait = 0;
    }
    W.time += dt;
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

  SN.World = { create, step, turn, speed, spawnFood, botDir, DIRS, OPP };
})(SN);
