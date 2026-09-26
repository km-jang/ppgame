'use strict';
// 캔버스 그리기. 게임 상태를 읽기만 하고 규칙은 바꾸지 않는다.
// 입자·흔들림 같은 꾸밈은 규칙 파일이 아니라 여기(R)에 둔다.
(function (SN) {
  const TAU = Math.PI * 2;
  const D = SN.DATA;
  const NUM = '"Rajdhani", system-ui, sans-serif', DISP = '"Black Han Sans", system-ui, sans-serif';

  // 판 배치: 위쪽 HUD 줄(top) 아래 남는 자리에 판을 가운데 맞춰 넣는다. 칸은 정수 픽셀
  // right·bottom: 방향 버튼 자리만큼 비운다 (판이 버튼 밑에 깔리지 않게)
  function layout(cols, rows, w, h, top, right, bottom) {
    right = right || 0; bottom = bottom || 0;
    const pad = Math.max(8, Math.round(Math.min(w, h) * 0.015));
    const availW = w - pad * 2 - right, availH = h - top - pad - bottom;
    const cell = Math.max(6, Math.floor(Math.min(availW / cols, availH / rows)));
    const bw = cell * cols, bh = cell * rows;
    return { cell, bw, bh, bx: Math.round(pad + (availW - bw) / 2), by: Math.round(top + (availH - bh) / 2) };
  }

  // ─── 미리 그려 두는 것들 ───────────────────────────────────
  // 성운: 1/4 해상도에 흐릿한 빛 덩어리 + 가장자리 어둡게 (N-GUN 첫 테마와 같은 색)
  function paintBackdrop(w, h) {
    const s = 0.25;
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * s)); c.height = Math.max(8, Math.round(h * s));
    const g = c.getContext('2d');
    g.scale(s, s);
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, w, h);
    const rand = SN.rng(2718);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = rand() * w, y = rand() * h, rad = Math.max(w, h) * (0.25 + rand() * 0.35);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, i % 2 ? '#0d4a6b' : i === 2 ? '#3a1450' : '#10284f');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.5 + rand() * 0.4;
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    return c;
  }

  // 판: 어두운 유리 바닥 + 칸 격자 + 네온 테두리 + 모서리 꺾쇠. 테두리 발광은 여기서 한 번만 그린다
  const BM = 28; // 발광이 번질 여백
  function paintBoard(L, cols, rows, dpr, W) {
    const c = document.createElement('canvas');
    c.width = Math.round((L.bw + BM * 2) * dpr); c.height = Math.round((L.bh + BM * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(BM, BM);
    const { bw, bh, cell } = L;
    g.fillStyle = 'rgba(3,7,14,0.62)';
    g.fillRect(0, 0, bw, bh);
    // 칸 격자 (4칸마다 조금 더 밝게)
    for (const strong of [false, true]) {
      g.strokeStyle = strong ? 'rgba(94,231,255,0.13)' : 'rgba(94,231,255,0.055)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < cols; x++) if ((x % 4 === 0) === strong) { g.moveTo(x * cell + 0.5, 0); g.lineTo(x * cell + 0.5, bh); }
      for (let y = 1; y < rows; y++) if ((y % 4 === 0) === strong) { g.moveTo(0, y * cell + 0.5); g.lineTo(bw, y * cell + 0.5); }
      g.stroke();
    }
    // 칸 교차점에 작은 점
    g.fillStyle = 'rgba(94,231,255,0.22)';
    for (let x = 4; x < cols; x += 4) for (let y = 4; y < rows; y += 4) g.fillRect(x * cell - 1, y * cell - 1, 3, 3);
    // 안쪽 벽 (스테이지): 분홍 네온 블록. 발광은 여기서 한 번만
    if (W && W.walls) {
      const pad = Math.max(1, Math.round(cell * 0.08));
      g.shadowColor = 'rgba(255,46,136,0.85)';
      g.shadowBlur = cell * 0.6;
      g.fillStyle = '#3a0f2c';
      for (let i = 0; i < W.walls.length; i++) if (W.walls[i]) g.fillRect((i % cols) * cell + pad, Math.floor(i / cols) * cell + pad, cell - pad * 2, cell - pad * 2);
      g.shadowBlur = 0;
      for (let i = 0; i < W.walls.length; i++) {
        if (!W.walls[i]) continue;
        const x = (i % cols) * cell + pad, y = Math.floor(i / cols) * cell + pad, w = cell - pad * 2;
        const gr = g.createLinearGradient(0, y, 0, y + w);
        gr.addColorStop(0, '#7a1f5c'); gr.addColorStop(1, '#2a0a20');
        g.fillStyle = gr; g.fillRect(x, y, w, w);
        g.strokeStyle = '#ff5fa8'; g.lineWidth = Math.max(1, cell * 0.07); g.strokeRect(x + 0.5, y + 0.5, w - 1, w - 1);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 2, y + 2, w - 4, Math.max(1, w * 0.12));
      }
    }
    // 네온 테두리
    g.shadowColor = 'rgba(94,231,255,0.9)';
    g.shadowBlur = 18;
    g.strokeStyle = 'rgba(94,231,255,0.7)';
    g.lineWidth = 2;
    g.strokeRect(-1, -1, bw + 2, bh + 2);
    g.shadowBlur = 0;
    // 모서리 꺾쇠
    const k = Math.min(28, cell * 1.4);
    g.strokeStyle = '#bff8ff';
    g.lineWidth = 3;
    g.lineCap = 'square';
    g.beginPath();
    for (const [x, y, sx, sy] of [[-4, -4, 1, 1], [bw + 4, -4, -1, 1], [-4, bh + 4, 1, -1], [bw + 4, bh + 4, -1, -1]]) {
      g.moveTo(x, y + sy * k); g.lineTo(x, y); g.lineTo(x + sx * k, y);
    }
    g.stroke();
    return c;
  }

  // 발광 스프라이트: 색·크기별로 한 번 그려 두고 찍기만 한다 (매 프레임 shadowBlur 금지)
  const glowCache = {};
  function glow(ctx, color, x, y, radius, alpha) {
    radius = Math.max(2, Math.round(radius));
    const key = color + radius;
    let c = glowCache[key];
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = radius * 2;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, radius * 2, radius * 2);
      glowCache[key] = c;
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, x - radius, y - radius);
    ctx.globalAlpha = 1;
  }

  function makeStars(w, h) {
    const rand = SN.rng(4242);
    const n = Math.max(20, Math.round(110 * (w * h) / (1280 * 800)));
    const stars = [];
    for (let i = 0; i < n; i++) stars.push({ x: rand() * w, y: rand() * h, s: rand() < 0.2 ? 2 : 1, a: 0.25 + rand() * 0.5, ph: rand() * TAU });
    return stars;
  }

  // ─── 그리기 상태 (꾸밈 전용) ───────────────────────────────
  const R = { bgKey: '', backdrop: null, stars: null, boardKey: '', board: null, parts: [], texts: [], shake: 0, flash: 0, world: null };
  const ITEM = D.ITEM.kinds;
  // 떠오르는 글자 (+30 ×3, 아이템 이름)
  function text(x, y, txt, color, size) {
    if (R.texts.length > 12) R.texts.shift();
    R.texts.push({ x, y, txt, color, size, life: 0.9, max: 0.9 });
  }

  function toPx(v, gx, gy) { return { x: v.bx + (gx + 0.5) * v.cell, y: v.by + (gy + 0.5) * v.cell }; }

  function burst(x, y, n, colors, speed, size) {
    const P = R.parts;
    for (let i = 0; i < n; i++) {
      if (P.length >= D.FX.maxParticles) P.shift();
      const a = Math.random() * TAU, sp = speed * (0.35 + Math.random() * 0.65), life = 0.35 + Math.random() * 0.4;
      P.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color: colors[i % colors.length], size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  function ring(x, y, r, color, life) {
    R.parts.push({ ring: true, x, y, r, color, life, max: life });
  }

  // 규칙이 남긴 연출 요청(W.fx)을 입자로 바꾼다
  function takeFx(W, v) {
    if (R.world !== W) { R.world = W; R.parts.length = 0; R.texts.length = 0; R.shake = 0; R.flash = 0; }
    for (const f of W.fx) {
      const p = toPx(v, f.x, f.y), c = v.cell;
      if (W.fun && f.pts && (f.kind === 'eat' || f.kind === 'gold') && (W.mult > 1 || (W.eff && W.eff.double > 0) || f.kind === 'gold')) {
        text(p.x, p.y - c * 0.8, '+' + f.pts + (W.mult > 1 ? ' ×' + W.mult : ''), f.kind === 'gold' ? '#ffe66d' : W.mult >= 3 ? '#ff9f43' : '#ffd6e8', c * 0.7);
      }
      if (f.kind === 'eat') {
        ring(p.x, p.y, c * 1.3, '#ff2e88', 0.35);
        burst(p.x, p.y, D.FX.eatSparks, ['#ff2e88', '#ffd6e8', '#5ee7ff'], c * 7, c * 0.16);
      } else if (f.kind === 'portal') {
        ring(p.x, p.y, c * 1.8, '#c7a6ff', 0.4);
        burst(p.x, p.y, 10, ['#c7a6ff', '#5ee7ff', '#ffffff'], c * 6, c * 0.14);
      } else if (f.kind === 'power') {
        const K = ITEM[f.item];
        ring(p.x, p.y, c * 2.2, K.color, 0.5);
        burst(p.x, p.y, 22, [K.color, '#ffffff'], c * 9, c * 0.18);
        text(p.x, p.y - c, K.name + '!', K.color, c * 0.8);
      } else if (f.kind === 'cut') {
        ring(p.x, p.y, c * 2, '#3dff8b', 0.45);
        burst(p.x, p.y, 20, ['#3dff8b', '#ffffff'], c * 9, c * 0.18);
        text(p.x, p.y - c, '싹둑! -' + f.n, '#3dff8b', c * 0.8);
      } else if (f.kind === 'cool') {
        ring(p.x, p.y, c * 1.2, '#8aa4b8', 0.4);
      } else if (f.kind === 'gold') {
        ring(p.x, p.y, c * 1.6, '#ffe66d', 0.45);
        ring(p.x, p.y, c * 2.6, '#fff4c2', 0.6);
        burst(p.x, p.y, D.FX.goldSparks, ['#ffe66d', '#fff4c2', '#ffcf3a'], c * 10, c * 0.2);
      } else if (f.kind === 'die') {
        // 벽에 부딪혔으면 부딪힌 자리(머리 앞 테두리)에서 튄다
        const hx = p.x + f.dx * c * 0.5, hy = p.y + f.dy * c * 0.5;
        ring(hx, hy, c * 3, '#ff4d6d', 0.6);
        burst(hx, hy, D.FX.deathSparks, ['#ff4d6d', '#ff2e88', '#ffffff', '#5ee7ff'], c * 12, c * 0.22);
        if (!v.calm) R.shake = D.FX.shake;
        R.flash = D.FX.flash;
      }
    }
    W.fx.length = 0;
  }

  function updateFx(dt) {
    const P = R.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life -= dt;
      if (q.life <= 0) { P.splice(i, 1); continue; }
      if (!q.ring) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9; }
    }
    for (let i = R.texts.length - 1; i >= 0; i--) { const q = R.texts[i]; q.life -= dt; q.y -= 28 * dt; if (q.life <= 0) R.texts.splice(i, 1); }
    R.shake = Math.max(0, R.shake - dt * 40);
    R.flash = Math.max(0, R.flash - dt);
  }

  function drawFx(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const q of R.parts) {
      const a = q.life / q.max;
      ctx.globalAlpha = a;
      if (q.ring) {
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 2 + a * 4;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.1 - a * 0.8), 0, TAU); ctx.stroke();
      } else {
        const s = q.size * (0.5 + a * 0.5);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const q of R.texts) {
      ctx.globalAlpha = Math.min(1, q.life / q.max * 2);
      ctx.font = Math.round(Math.max(12, q.size)) + 'px ' + DISP;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(q.txt, q.x, q.y);
      ctx.fillStyle = q.color; ctx.fillText(q.txt, q.x, q.y);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // ─── 배경 ─────────────────────────────────────────────────
  function drawBackground(ctx, W, v) {
    const bk = v.w + 'x' + v.h;
    if (R.bgKey !== bk) { R.bgKey = bk; R.backdrop = paintBackdrop(v.w, v.h); R.stars = makeStars(v.w, v.h); }
    ctx.drawImage(R.backdrop, 0, 0, v.w, v.h);
    ctx.fillStyle = '#e8f7ff';
    const t = performance.now() / 1000;
    for (const s of R.stars) {
      ctx.globalAlpha = v.calm ? s.a : s.a * (0.6 + 0.4 * Math.sin(t * 1.6 + s.ph));
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    const key = [v.w, v.h, v.dpr, v.cell, W.cols, W.rows, W.mode, W.level, W.walls ? W.walls.length : 0].join(',');
    if (R.boardKey !== key || R.boardWalls !== W.walls) { R.boardKey = key; R.boardWalls = W.walls; R.board = paintBoard(v, W.cols, W.rows, v.dpr, W); }
    ctx.drawImage(R.board, v.bx - BM, v.by - BM, v.bw + BM * 2, v.bh + BM * 2);
  }

  // ─── 먹이 ─────────────────────────────────────────────────
  function drawFood(ctx, W, v) {
    const f = W.food;
    if (!f) return;
    const p = toPx(v, f.x, f.y), c = v.cell;
    const age = W.t - f.born;
    // 나타날 때 톡 튀어나온다
    const k = Math.min(1, age / 0.28), pop = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.35 : 1;
    const pulse = (v.calm ? 1 : 1 + Math.sin(W.t * 6) * 0.08) * pop * k;
    if (f.gold) {
      glow(ctx, 'rgba(255,230,109,0.75)', p.x, p.y, c * 1.7, 0.85 * k);
      if (W.fun) {
        // 남은 시간 고리: 줄어들수록 급하다
        const left = Math.max(0, 1 - age / D.FOOD.goldLife);
        ctx.strokeStyle = left < 0.3 && Math.floor(W.t * 8) % 2 ? '#ff4d6d' : '#ffe66d';
        ctx.lineWidth = Math.max(2, c * 0.1);
        ctx.beginPath(); ctx.arc(p.x, p.y, c * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke();
      }
      const r = c * 0.42 * pulse, rot = v.calm ? 0 : W.t * 2;
      // 네 갈래 별
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = rot + TAU * i / 8, rr = i % 2 ? r * 0.42 : r;
        const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.28, 0, TAU); ctx.fill();
      // 주위를 도는 반짝이 둘
      ctx.fillStyle = '#fff4c2';
      for (let i = 0; i < 2; i++) {
        const a = -rot * 1.5 + Math.PI * i;
        ctx.fillRect(p.x + Math.cos(a) * c * 0.7 - 1.5, p.y + Math.sin(a) * c * 0.7 - 1.5, 3, 3);
      }
    } else {
      glow(ctx, 'rgba(255,46,136,0.7)', p.x, p.y, c * 1.25, 0.8 * k);
      ctx.fillStyle = '#ff2e88';
      ctx.beginPath(); ctx.arc(p.x, p.y, c * 0.3 * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd6e8';
      ctx.beginPath(); ctx.arc(p.x - c * 0.07, p.y - c * 0.07, c * 0.11 * pulse, 0, TAU); ctx.fill();
    }
  }

  // ─── 포털 · 아이템 ─────────────────────────────────────────
  const PORTAL_C = ['#c7a6ff', '#5ee7ff', '#ffe66d'];
  function drawPortals(ctx, W, v) {
    if (!W.portals || !W.portals.length) return;
    const c = v.cell, t = W.t;
    W.portals.forEach((P, i) => {
      const col = PORTAL_C[i % PORTAL_C.length];
      for (const q of [P.a, P.b]) {
        const p = toPx(v, q.x, q.y);
        glow(ctx, col, p.x, p.y, c * 1.3, 0.55);
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, c * 0.09);
        for (let k = 0; k < 3; k++) {
          const a0 = (v.calm ? 0 : t * (2 + k)) + k * 2.1, r = c * (0.18 + k * 0.12);
          ctx.beginPath(); ctx.arc(p.x, p.y, r, a0, a0 + 4.2); ctx.stroke();
        }
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, c * 0.08, 0, TAU); ctx.fill();
      }
    });
  }
  function drawItem(ctx, W, v) {
    const it = W.item;
    if (!it) return;
    if (it.life < 2 && Math.floor(it.life * 8) % 2 === 0) return;   // 곧 사라진다: 깜빡
    const K = ITEM[it.kind], p = toPx(v, it.x, it.y), c = v.cell;
    const bob = v.calm ? 0 : Math.sin(W.t * 5) * c * 0.06;
    glow(ctx, K.color, p.x, p.y + bob, c * 1.4, 0.7);
    ctx.fillStyle = 'rgba(7,10,18,0.9)';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, c * 0.46, 0, TAU); ctx.fill();
    ctx.strokeStyle = K.color; ctx.lineWidth = Math.max(2, c * 0.1); ctx.stroke();
    ctx.fillStyle = K.color;
    ctx.font = '700 ' + Math.round(c * (K.glyph.length > 1 ? 0.46 : 0.6)) + 'px ' + NUM;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(K.glyph, p.x, p.y + bob + c * 0.03);
    ctx.textBaseline = 'alphabetic';
  }

  // ─── 뱀 ───────────────────────────────────────────────────
  // 머리(밝은 청록) → 꼬리(푸른 보라)로 색이 흐르고 굵기가 가늘어진다. 칸 사이는 보간해서 미끄러지듯
  const HEAD = [94, 231, 255], TAIL = [52, 96, 255];
  function drawSnake(ctx, W, v) {
    const S = W.snake, P = W.prev, n = S.length, c = v.cell;
    const a = W.phase === 'play' ? W.alpha : 0;
    const dead = W.phase === 'over' && !W.won;
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = S[i];
      let q = P[i] || s;
      if (Math.abs(q.x - s.x) + Math.abs(q.y - s.y) > 1) q = s;   // 포털·벽 넘기: 건너뛴 칸은 이어 그리지 않는다
      pts[i] = { x: v.bx + (q.x + (s.x - q.x) * a + 0.5) * c, y: v.by + (q.y + (s.y - q.y) * a + 0.5) * c };
    }
    const ghost = W.eff && W.eff.ghost > 0;
    if (ghost) ctx.globalAlpha = 0.45 + (v.calm ? 0 : Math.sin(W.t * 12) * 0.12);
    // 바닥 발광 (미리 그린 스프라이트를 겹쳐 찍기)
    ctx.globalCompositeOperation = 'lighter';
    const gr = c * 1.05, step = n > 120 ? 2 : 1;
    for (let i = n - 1; i >= 0; i -= step) glow(ctx, dead ? 'rgba(255,77,109,0.5)' : 'rgba(94,231,255,0.45)', pts[i].x, pts[i].y, gr, 0.42 * (1 - i / n * 0.6));
    ctx.globalCompositeOperation = 'source-over';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 포털·벽 넘기로 떨어진 마디 사이는 잇지 않는다
    const far = i => Math.abs(S[i].x - S[i - 1].x) + Math.abs(S[i].y - S[i - 1].y) > 1;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[n - 1].x, pts[n - 1].y);
      for (let i = n - 2; i >= 0; i--) { if (far(i + 1)) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y); }
    };
    // 어두운 테두리 한 번 (몸이 판 위에 떠 보이게)
    ctx.strokeStyle = 'rgba(0,4,12,0.55)';
    ctx.lineWidth = c * 0.86;
    path();
    ctx.stroke();
    // 마디마다 색·굵기
    for (let i = n - 1; i >= 1; i--) {
      const t = i / Math.max(1, n - 1);
      let r = Math.round(HEAD[0] + (TAIL[0] - HEAD[0]) * t), g = Math.round(HEAD[1] + (TAIL[1] - HEAD[1]) * t), b = Math.round(HEAD[2] + (TAIL[2] - HEAD[2]) * t);
      if (dead) { r = Math.round(r * 0.5 + 128); g = Math.round(g * 0.35); b = Math.round(b * 0.45); }
      ctx.strokeStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.lineWidth = c * (0.74 - 0.26 * t);
      if (far(i)) continue;
      ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
    }
    // 광택 줄
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(1, c * 0.12);
    path();
    ctx.stroke();

    // 머리: N-GUN 주인공처럼 둥근 몸에 숫자(길이), 앞쪽에 노란 총열
    const h = pts[0], d = SN.World.DIRS[W.dir];
    if (W.eff && W.eff.double > 0) glow(ctx, 'rgba(255,230,109,0.8)', h.x, h.y, c * 2.2, 0.7);
    glow(ctx, dead ? 'rgba(255,77,109,0.8)' : 'rgba(94,231,255,0.7)', h.x, h.y, c * 1.5, 0.9);
    ctx.strokeStyle = '#ffe66d';
    ctx.lineWidth = Math.max(2, c * 0.16);
    ctx.beginPath();
    ctx.moveTo(h.x + d[0] * c * 0.25, h.y + d[1] * c * 0.25);
    ctx.lineTo(h.x + d[0] * c * 0.7, h.y + d[1] * c * 0.7);
    ctx.stroke();
    ctx.fillStyle = dead ? '#ff4d6d' : '#5ee7ff';
    ctx.beginPath(); ctx.arc(h.x, h.y, c * 0.46, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(h.x - c * 0.12, h.y - c * 0.14, c * 0.14, 0, TAU); ctx.fill();
    const txt = String(n);
    ctx.fillStyle = '#07080d';
    ctx.font = '700 ' + Math.round(c * (txt.length > 2 ? 0.44 : 0.58)) + 'px ' + NUM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, h.x, h.y + c * 0.04);
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  // ─── HUD: 위쪽 한 줄. 오른쪽 끝에 점수, 그 왼쪽에 작은 칸들 ─────
  function chip(ctx, x, y, h, txt, color, s) {
    const w = ctx.measureText(txt).width + 16 * s;
    ctx.fillStyle = 'rgba(12,16,26,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w, y, w, h, 6 * s); else ctx.rect(x - w, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94,231,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(txt, x - 8 * s, y + h / 2 + 1);
    return w;
  }

  function drawHud(ctx, W, v) {
    const s = v.ui, mid = v.hudMid, right = v.w - v.hudRight;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8f7ff';
    ctx.font = '700 ' + Math.round(30 * s) + 'px ' + NUM;
    const sc = W.score.toLocaleString();
    ctx.fillText(sc, right, mid + 2 * s);
    let x = right - ctx.measureText(sc).width - 12 * s;
    ctx.font = '700 ' + Math.round(14 * s) + 'px ' + NUM;
    const ch = 22 * s, cy = mid - ch / 2;
    const items = [];
    if (W.mode === 'stage') items.push(['LV ' + W.level + '  ' + Math.min(W.got, W.goal) + '/' + W.goal, '#5ee7ff']);
    if (W.fun && W.mult > 1 && W.time - W.lastEat <= D.COMBO.window) items.push(['COMBO ×' + W.mult, W.mult >= 3 ? '#ff9f43' : '#ffd6e8']);
    if (W.eff) for (const k of ['double', 'slow', 'ghost']) if (W.eff[k] > 0) items.push([ITEM[k].glyph + ' ' + Math.ceil(W.eff[k]), ITEM[k].color]);
    items.push(['LEN ' + W.snake.length, '#ffe66d'], ['BEST ' + Math.max(v.best || 0, W.score).toLocaleString(), '#bcd3e2']);
    if (v.w >= 560 && W.mode !== 'stage') items.push([SN.fmtTime(W.time), '#8aa4b8']);
    for (const [txt, col] of items) {
      if (x - 90 * s < v.hudLeft) break; // 버튼 묶음과 겹치면 생략
      x -= chip(ctx, x, cy, ch, txt, col, s) + 6 * s;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 출발 대기(READY)와 처음 몇 초 조작 안내
  function drawIntro(ctx, W, v) {
    const cx = v.bx + v.bw / 2, cy = v.by + v.bh * 0.3;
    // 스테이지: 레벨을 깼을 때 큰 글자, 레벨 시작 때 이름과 목표
    if (W.phase === 'clear') {
      const k = Math.min(1, W.clearT * 4), fs = Math.round(Math.min(72, v.bw / 7));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = k;
      glow(ctx, 'rgba(94,231,255,0.4)', cx, v.by + v.bh * 0.42, fs * 2, 0.9);
      ctx.font = 'italic 700 ' + fs + 'px ' + NUM;
      ctx.fillStyle = '#e8f7ff';
      ctx.fillText('LEVEL ' + W.level + ' CLEAR', cx + (1 - k) * 40, v.by + v.bh * 0.4);
      ctx.font = Math.round(fs * 0.36) + 'px ' + DISP;
      ctx.fillStyle = '#ffe66d';
      ctx.fillText('보너스 +' + (D.STAGE.clearBonus * W.level), cx, v.by + v.bh * 0.4 + fs * 0.75);
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
      return;
    }
    if (W.mode === 'stage' && W.wait > 0) {
      const fs = Math.round(Math.min(56, v.bw / 9));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      glow(ctx, 'rgba(94,231,255,0.35)', cx, cy, fs * 1.8, 0.8);
      ctx.font = 'italic 700 ' + fs + 'px ' + NUM;
      ctx.fillStyle = '#e8f7ff';
      ctx.fillText('LEVEL ' + W.level, cx, cy - fs * 0.2);
      ctx.font = Math.round(fs * 0.42) + 'px ' + DISP;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.9)';
      ctx.strokeText(W.lv.name + ' · 구슬 ' + W.goal + '개' + (W.portals.length ? ' · 포털 조심' : ''), cx, cy + fs * 0.55);
      ctx.fillStyle = '#5ee7ff';
      ctx.fillText(W.lv.name + ' · 구슬 ' + W.goal + '개' + (W.portals.length ? ' · 포털 조심' : ''), cx, cy + fs * 0.55);
      if (W.easy) {
        const hint = v.touch ? '화살표를 누르면 출발!' : '방향키를 누르면 출발!';
        ctx.globalAlpha = 0.75 + (v.calm ? 0 : Math.sin(W.t * 5) * 0.25);
        ctx.strokeText(hint, cx, cy + fs * 1.2);
        ctx.fillStyle = '#ffe66d'; ctx.fillText(hint, cx, cy + fs * 1.2);
        ctx.globalAlpha = 1;
      }
      ctx.textBaseline = 'alphabetic';
      return;
    }
    const hintA = W.wait > 0 ? 1 : W.turns === 0 ? Math.max(0, Math.min(1, D.HINT_TIME - W.t)) : 0;
    if (hintA <= 0) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (W.wait > 0) {
      const fs = Math.round(Math.min(64, v.bw / 8));
      ctx.font = 'italic 700 ' + fs + 'px ' + NUM;
      ctx.fillStyle = '#e8f7ff';
      glow(ctx, 'rgba(94,231,255,0.35)', cx, cy, fs * 1.6, 0.8);
      ctx.fillText('READY', cx, cy);
    }
    ctx.globalAlpha = W.easy && W.wait > 0 ? 0.75 + (v.calm ? 0 : Math.sin(W.t * 5) * 0.25) : hintA * 0.85;
    ctx.font = Math.round(Math.max(16, Math.min(26, v.cell * 0.7))) + 'px ' + DISP;
    ctx.fillStyle = '#bff8ff';
    const hint = W.easy && W.wait > 0 ? (v.touch ? '화살표를 누르면 출발!' : '방향키를 누르면 출발!') : v.touch ? '화살표를 누르거나 화면을 밀어요' : '방향키 또는 WASD로 방향 바꾸기';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.85)';
    if (W.easy && W.wait > 0) ctx.fillStyle = '#ffe66d';
    ctx.strokeText(hint, cx, cy + Math.min(64, v.bw / 8) * 0.85);
    ctx.fillText(hint, cx, cy + Math.min(64, v.bw / 8) * 0.85);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  // view: {dpr, w, h, bx, by, bw, bh, cell, ui, hudMid, hudLeft, hudRight, hud, touch, calm, best}
  function draw(ctx, W, v, dt) {
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    takeFx(W, v);
    updateFx(dt || 0);
    drawBackground(ctx, W, v);
    ctx.save();
    if (R.shake > 0) ctx.translate((Math.random() - 0.5) * R.shake, (Math.random() - 0.5) * R.shake);
    drawPortals(ctx, W, v);
    drawFood(ctx, W, v);
    drawItem(ctx, W, v);
    drawSnake(ctx, W, v);
    drawFx(ctx);
    ctx.restore();
    if (R.flash > 0) {
      ctx.fillStyle = 'rgba(255,77,109,' + (R.flash * 0.7).toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
    // 느린 시계: 화면 가장자리가 푸르게
    if (W.eff && W.eff.slow > 0) { ctx.fillStyle = 'rgba(127,211,255,' + (0.06 + Math.min(1, W.eff.slow) * 0.05) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    if (v.hud !== false) { drawHud(ctx, W, v); drawIntro(ctx, W, v); }
  }

  // 멈춘 화면처럼 입자가 남아 있는지 (다 사라지면 그리기를 쉰다)
  const busy = () => R.parts.length > 0 || R.shake > 0 || R.flash > 0;

  SN.Render = { draw, layout, busy };
})(SN);
