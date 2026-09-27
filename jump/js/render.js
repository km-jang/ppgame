'use strict';
// 캔버스 그리기. 게임 상태를 읽기만 하고 규칙은 바꾸지 않는다.
// 입자·흔들림 같은 꾸밈은 규칙 파일이 아니라 여기(R)에 둔다.
// 놀이 기둥: 가로 화면에서는 가운데 세로 기둥(약 3:4), 세로 화면에서는 가로 전체. 양옆은 우주 배경.
(function (JP) {
  const TAU = Math.PI * 2;
  const D = JP.DATA;
  const WW = D.WORLD.w;
  const NUM = '"Rajdhani", system-ui, sans-serif', DISP = '"Jua", system-ui, sans-serif';

  // ─── 배치 ─────────────────────────────────────────────────
  // 가로 화면: 기둥이 화면 높이를 다 쓰고 양옆(side)에 점수판·화살표. 옆자리가 좁으면 위 HUD 줄 아래로.
  // 세로 화면: 위 HUD 줄 아래에 가로 전체
  function layout(w, h, hudH) {
    const port = h > w * 1.1;
    let cw, ch, cy = 0, side = false;
    if (!port) {
      ch = h; cw = Math.round(ch * 0.75);
      if ((w - cw) / 2 >= 170) side = true;
      else { cy = hudH; ch = h - hudH; cw = Math.min(w - 16, Math.round(ch * 0.75)); }
    } else {
      cy = hudH; ch = h - hudH; cw = w;
    }
    const cx = Math.round((w - cw) / 2);
    const scale = cw / WW;
    return { cx, cy, cw, ch, scale, viewH: ch / scale, side, port };
  }

  // ─── 미리 그려 두는 것들 ───────────────────────────────────
  // 성운: 1/4 해상도에 흐릿한 빛 덩어리 + 가장자리 어둡게 (냠냠 뱀과 같은 색)
  function paintBackdrop(w, h) {
    const s = 0.25;
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * s)); c.height = Math.max(8, Math.round(h * s));
    const g = c.getContext('2d');
    g.scale(s, s);
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, w, h);
    const rand = JP.rng(2718);
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

  // 기둥: 어두운 유리 + 양옆 네온 선 + 모서리 꺾쇠. 발광은 여기서 한 번만 그린다
  const CM = 24;
  function paintColumn(v, dpr) {
    const c = document.createElement('canvas');
    c.width = Math.round((v.cw + CM * 2) * dpr); c.height = Math.round((v.ch + CM * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(CM, CM);
    const { cw, ch } = v;
    const bg = g.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, 'rgba(6,12,24,0.55)');
    bg.addColorStop(1, 'rgba(3,7,14,0.72)');
    g.fillStyle = bg;
    g.fillRect(0, 0, cw, ch);
    // 세로 가는 결 (유리 느낌)
    g.fillStyle = 'rgba(94,231,255,0.035)';
    for (let x = cw / 8; x < cw; x += cw / 8) g.fillRect(Math.round(x), 0, 1, ch);
    if (v.cw < v.w - 4) {
      g.shadowColor = 'rgba(94,231,255,0.9)';
      g.shadowBlur = 16;
      g.strokeStyle = 'rgba(94,231,255,0.6)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(-1, 0); g.lineTo(-1, ch); g.moveTo(cw + 1, 0); g.lineTo(cw + 1, ch); g.stroke();
      g.shadowBlur = 0;
      const k = Math.min(26, cw * 0.06);
      g.strokeStyle = '#bff8ff'; g.lineWidth = 3; g.lineCap = 'square';
      g.beginPath();
      for (const [x, y, sx, sy] of [[-5, 4, 1, 1], [cw + 5, 4, -1, 1], [-5, ch - 4, 1, -1], [cw + 5, ch - 4, -1, -1]]) {
        g.moveTo(x, y + sy * k); g.lineTo(x, y); g.lineTo(x + sx * k * 0.5, y);
      }
      g.stroke();
    }
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

  // 발판 모양 (종류·크기별 한 번). 가장자리 여백 PM에 발광이 번진다
  const PM = 14;
  const PCOL = {
    normal: ['#bff8ff', '#5ee7ff', '#1a8fb0', 'rgba(94,231,255,0.9)'],
    ground: ['#bff8ff', '#5ee7ff', '#15607a', 'rgba(94,231,255,0.9)'],
    moving: ['#eadfff', '#c7a6ff', '#6d43d6', 'rgba(199,166,255,0.9)'],
    crumble: ['#ffe0b8', '#ffa94d', '#b85410', 'rgba(255,159,67,0.85)'],
    spring: ['#caffdf', '#3dff8b', '#13964f', 'rgba(61,255,139,0.9)'],
  };
  const platCache = {};
  function platSprite(kind, w, h, dpr) {
    const key = kind + '|' + w + '|' + h + '|' + dpr;
    let c = platCache[key];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.round((w + PM * 2) * dpr); c.height = Math.round((h + PM * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(PM, PM);
    const rr = (x, y, ww, hh, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, ww, hh, r); else g.rect(x, y, ww, hh); };
    if (kind === 'cloud') {
      // 구름: 뭉게뭉게 둥근 덩어리. 밟을 수는 있지만 가끔 사라진다
      const n = Math.max(3, Math.round(w / (h * 1.1)));
      g.shadowColor = 'rgba(200,235,255,0.9)'; g.shadowBlur = 12;
      const grad = g.createLinearGradient(0, -h * 0.3, 0, h);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#9fc8e8');
      g.fillStyle = grad;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const x = h * 0.55 + (w - h * 1.1) * i / (n - 1), big = i % 2 ? 0.62 : 0.78;
        g.moveTo(x + h * big, h * 0.45); g.arc(x, h * 0.45, h * big, 0, TAU);
      }
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.ellipse(w * 0.35, h * 0.12, w * 0.12, h * 0.16, 0, 0, TAU); g.fill();
      platCache[key] = c;
      return c;
    }
    const C = PCOL[kind] || PCOL.normal;
    g.shadowColor = C[3]; g.shadowBlur = 12;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, C[0]); grad.addColorStop(0.35, C[1]); grad.addColorStop(1, C[2]);
    g.fillStyle = grad;
    rr(0, 0, w, h, h / 2); g.fill();
    g.shadowBlur = 0;
    // 광택 줄 (위) · 어두운 줄 (아래)
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(1.5, h * 0.12); g.lineCap = 'round';
    g.beginPath(); g.moveTo(h * 0.6, h * 0.24); g.lineTo(w - h * 0.6, h * 0.24); g.stroke();
    g.strokeStyle = 'rgba(0,10,30,0.35)'; g.lineWidth = Math.max(1, h * 0.1);
    g.beginPath(); g.moveTo(h * 0.5, h * 0.86); g.lineTo(w - h * 0.5, h * 0.86); g.stroke();
    if (kind === 'moving') {
      // 양 끝 화살표: 옆으로 움직이는 발판
      g.strokeStyle = 'rgba(40,12,90,0.8)'; g.lineWidth = Math.max(2, h * 0.16); g.lineJoin = 'round';
      const a = h * 0.26, m = h * 0.55;
      g.beginPath();
      g.moveTo(h * 0.55 + a, m - a); g.lineTo(h * 0.55, m); g.lineTo(h * 0.55 + a, m + a);
      g.moveTo(w - h * 0.55 - a, m - a); g.lineTo(w - h * 0.55, m); g.lineTo(w - h * 0.55 - a, m + a);
      g.stroke();
    } else if (kind === 'crumble') {
      // 금 간 자국: 한 번만 밟을 수 있다
      g.strokeStyle = 'rgba(70,22,0,0.85)'; g.lineWidth = Math.max(1.5, h * 0.1); g.lineJoin = 'miter';
      g.beginPath();
      for (const f of [0.3, 0.52, 0.74]) {
        const x = w * f;
        g.moveTo(x, 0); g.lineTo(x - h * 0.25, h * 0.35); g.lineTo(x + h * 0.15, h * 0.6); g.lineTo(x - h * 0.1, h);
      }
      g.stroke();
    } else if (kind === 'ground') {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = h; x < w - h; x += h * 1.6) g.fillRect(x, h * 0.5, h * 0.5, 2);
    }
    platCache[key] = c;
    return c;
  }

  // 주인공 몸통 (반지름·배율별 한 번): 광택 네온 공
  const bodyCache = {};
  function bodySprite(r, dpr) {
    const key = r + '|' + dpr;
    let c = bodyCache[key];
    if (c) return c;
    const m = 4, size = (r + m) * 2;
    c = document.createElement('canvas');
    c.width = c.height = Math.round(size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(r + m, r + m);
    const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#effdff'); grad.addColorStop(0.35, '#5ee7ff'); grad.addColorStop(1, '#1b5fd0');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    // 아래쪽 반사광 (주황 네온)
    const rim = g.createLinearGradient(0, r * 0.3, 0, r);
    rim.addColorStop(0, 'rgba(255,46,136,0)'); rim.addColorStop(1, 'rgba(255,90,170,0.55)');
    g.fillStyle = rim;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1, r * 0.06);
    g.beginPath(); g.arc(0, 0, r - g.lineWidth / 2, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.ellipse(-r * 0.38, -r * 0.55, r * 0.26, r * 0.14, -0.5, 0, TAU); g.fill();
    bodyCache[key] = c;
    return c;
  }

  function makeStars(w, h) {
    const rand = JP.rng(4242);
    const n = Math.max(30, Math.round(140 * (w * h) / (1280 * 800)));
    const stars = [];
    for (let i = 0; i < n; i++) {
      const far = rand() < 0.65;
      stars.push({ x: rand() * w, y: rand() * h, s: far ? 1 : 2, a: far ? 0.2 + rand() * 0.35 : 0.45 + rand() * 0.4, k: far ? 0.06 : 0.18, ph: rand() * TAU });
    }
    return stars;
  }

  // ─── 그리기 상태 (꾸밈 전용) ───────────────────────────────
  const R = { bgKey: '', backdrop: null, stars: null, colKey: '', col: null, parts: [], texts: [], clouds: [], shake: 0, flash: 0, world: null };
  const ITEM = D.ITEM.kinds;

  // 떠오르는 글자 (월드 좌표)
  function text(x, y, txt, color, size) {
    if (R.texts.length > 10) R.texts.shift();
    R.texts.push({ x, y, txt, color, size, life: 0.9, max: 0.9 });
  }
  function burst(x, y, n, colors, speed, size) {
    const P = R.parts;
    for (let i = 0; i < n; i++) {
      if (P.length >= D.FX.maxParticles) P.shift();
      const a = Math.random() * TAU, sp = speed * (0.35 + Math.random() * 0.65), life = 0.35 + Math.random() * 0.4;
      P.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color: colors[i % colors.length], size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  function ring(x, y, r, color, life) {
    if (R.parts.length >= D.FX.maxParticles) R.parts.shift();
    R.parts.push({ ring: true, x, y, r, color, life, max: life });
  }

  // 규칙이 남긴 연출 요청(W.fx)을 입자로 바꾼다. 좌표는 월드(점), 크기는 화면 픽셀
  function takeFx(W, v) {
    if (R.world !== W) { R.world = W; R.parts.length = 0; R.texts.length = 0; R.clouds.length = 0; R.shake = 0; R.flash = 0; }
    const s = v.scale, big = v.hud !== false;
    for (const f of W.fx) {
      if (f.kind === 'bounce') {
        if (big) burst(f.x, f.y, 5, ['#bff8ff', '#5ee7ff'], 140, 3 * s);
      } else if (f.kind === 'spring') {
        ring(f.x, f.y, 44 * s, '#3dff8b', 0.4);
        burst(f.x, f.y, D.FX.springSparks, ['#3dff8b', '#caffdf', '#ffe66d'], 320, 5 * s);
        if (big) text(f.x, f.y + 50, '통!', '#3dff8b', 30 * s);
      } else if (f.kind === 'crumble') {
        burst(f.x, f.y, 10, ['#ffa94d', '#b85410', '#ffe0b8'], 180, 5 * s);
        if (!v.calm && big) R.shake = Math.max(R.shake, D.FX.shake);
      } else if (f.kind === 'star') {
        ring(f.x, f.y, 26 * s, '#ffe66d', 0.35);
        burst(f.x, f.y, D.FX.starSparks, ['#ffe66d', '#fff4c2', '#ffcf3a'], 260, 4 * s);
        if (big) text(f.x, f.y + 26, '+' + D.STAR.points, '#ffe66d', 22 * s);
      } else if (f.kind === 'item') {
        const K = ITEM[f.item];
        ring(f.x, f.y, 60 * s, K.color, 0.5);
        burst(f.x, f.y, 22, [K.color, '#ffffff'], 380, 5 * s);
        if (big) text(f.x, f.y + 40, K.name + '!', K.color, 30 * s);
      } else if (f.kind === 'save' || f.kind === 'pop') {
        ring(f.x, f.y, 60 * s, '#7fd3ff', 0.5);
        burst(f.x, f.y, 18, ['#7fd3ff', '#ffffff', '#ff4d6d'], 360, 4 * s);
        if (f.kind === 'save' && big) text(f.x, f.y + 40, '방울이 지켜 줬어요!', '#7fd3ff', 24 * s);
      } else if (f.kind === 'rescue') {
        R.clouds.push({ x: f.x, y: f.y, life: 1.1, max: 1.1 });
        burst(f.x, f.y + 20, 16, ['#ffffff', '#bfe3ff', '#ffe66d'], 260, 5 * s);
        if (big) text(f.x, f.y + 110, '구름이 받아 줬어요!', '#ffffff', 26 * s);
      } else if (f.kind === 'die') {
        if (f.cause === 'mine') {
          ring(f.x, f.y, 90 * s, '#ff4d6d', 0.6);
          burst(f.x, f.y, 36, ['#ff4d6d', '#ff2e88', '#ffffff', '#ffe66d'], 520, 6 * s);
          if (!v.calm) { R.shake = D.FX.shake * 2; R.flash = D.FX.flash; }
        }
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
      if (!q.ring) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy = q.vy * 0.9 - 300 * dt; }
    }
    for (let i = R.texts.length - 1; i >= 0; i--) { const q = R.texts[i]; q.life -= dt; q.y += 40 * dt; if (q.life <= 0) R.texts.splice(i, 1); }
    for (let i = R.clouds.length - 1; i >= 0; i--) { const q = R.clouds[i]; q.life -= dt; q.y += 30 * dt; if (q.life <= 0) R.clouds.splice(i, 1); }
    R.shake = Math.max(0, R.shake - dt * 40);
    R.flash = Math.max(0, R.flash - dt);
  }

  // ─── 좌표 ─────────────────────────────────────────────────
  // 월드(점) → 화면(픽셀). cam = 화면 맨 아래의 높이
  let CAM = 0;
  const SX = (v, x) => v.cx + x * v.scale;
  const SY = (v, y) => v.cy + v.ch - (y - CAM) * v.scale;

  function drawFx(ctx, v) {
    ctx.globalCompositeOperation = 'lighter';
    for (const q of R.parts) {
      const a = q.life / q.max, x = SX(v, q.x), y = SY(v, q.y);
      ctx.globalAlpha = a;
      if (q.ring) {
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 2 + a * 4;
        ctx.beginPath(); ctx.arc(x, y, q.r * (1.1 - a * 0.8), 0, TAU); ctx.stroke();
      } else {
        const s = q.size * (0.5 + a * 0.5);
        ctx.fillStyle = q.color;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const q of R.texts) {
      ctx.globalAlpha = Math.min(1, q.life / q.max * 2);
      ctx.font = Math.round(Math.max(14, q.size)) + 'px ' + DISP;
      const x = Math.max(v.cx + 80, Math.min(v.cx + v.cw - 80, SX(v, q.x))), y = SY(v, q.y);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(q.txt, x, y);
      ctx.fillStyle = q.color; ctx.fillText(q.txt, x, y);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // ─── 배경 ─────────────────────────────────────────────────
  function drawBackground(ctx, W, v) {
    const bk = v.w + 'x' + v.h;
    if (R.bgKey !== bk) { R.bgKey = bk; R.backdrop = paintBackdrop(v.w, v.h); R.stars = makeStars(v.w, v.h); }
    ctx.drawImage(R.backdrop, 0, 0, v.w, v.h);
    // 별 두 겹: 먼 별은 느리게, 가까운 별은 빠르게 아래로 흘러 올라가는 느낌
    ctx.fillStyle = '#e8f7ff';
    const t = performance.now() / 1000, up = CAM * v.scale;
    for (const s of R.stars) {
      const y = ((s.y + up * s.k) % v.h + v.h) % v.h;
      ctx.globalAlpha = v.calm ? s.a : s.a * (0.65 + 0.35 * Math.sin(t * 1.4 + s.ph));
      ctx.fillRect(s.x, y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    const key = [v.cw, v.ch, v.w, v.dpr].join(',');
    if (R.colKey !== key) { R.colKey = key; R.col = paintColumn(v, v.dpr); }
    ctx.drawImage(R.col, v.cx - CM, v.cy - CM, v.cw + CM * 2, v.ch + CM * 2);
  }

  // 높이 눈금 (10m마다) + 최고 기록 선
  function drawMarks(ctx, W, v) {
    const M = D.METER, step = 10;
    const lo = Math.max(1, Math.ceil(CAM / M / step)), hi = Math.floor((CAM + v.ch / v.scale) / M / step);
    ctx.font = '700 ' + Math.round(Math.max(11, 13 * v.scale * 1.2)) + 'px ' + NUM;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (let k = lo; k <= hi; k++) {
      const y = Math.round(SY(v, k * step * M)) + 0.5;
      ctx.fillStyle = 'rgba(94,231,255,0.07)';
      ctx.fillRect(v.cx, y, v.cw, 1);
      ctx.fillStyle = 'rgba(138,164,184,0.45)';
      ctx.fillText(k * step + 'm', v.cx + 6, y - 2);
    }
    // 최고 기록 높이: 금색 점선 + 이름표
    const bh = v.bestH || 0;
    if (bh > 0 && v.hud !== false) {
      const y = SY(v, bh * M);
      if (y > v.cy - 10 && y < v.cy + v.ch + 10) {
        ctx.strokeStyle = 'rgba(255,230,109,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([8, 7]);
        ctx.beginPath(); ctx.moveTo(v.cx, y); ctx.lineTo(v.cx + v.cw, y); ctx.stroke();
        ctx.setLineDash([]);
        const fs = Math.round(Math.max(13, 16 * v.ui));
        ctx.font = fs + 'px ' + DISP;
        const txt = '최고 ' + bh + 'm', tw = ctx.measureText(txt).width + fs;
        const x = v.cx + v.cw - tw - 6;
        ctx.fillStyle = 'rgba(40,30,4,0.85)';
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y - fs * 1.4, tw, fs * 1.3, fs * 0.4); else ctx.rect(x, y - fs * 1.4, tw, fs * 1.3); ctx.fill();
        ctx.fillStyle = '#ffe66d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + tw / 2, y - fs * 0.72);
      }
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ─── 발판 ─────────────────────────────────────────────────
  function drawPlats(ctx, W, v, a) {
    const s = v.scale, hPx = Math.max(8, Math.round(D.PLAT.h * s));
    for (const p of W.plats) {
      const y = SY(v, p.y);
      if (y < v.cy - 40 || y > v.cy + v.ch + 60) continue;
      const wPx = Math.round(p.w * s);
      const px = p.kind === 'moving' ? p.px + (p.x - p.px) * a : p.x;
      const x = SX(v, px) - wPx / 2;
      const spr = platSprite(p.kind, wPx, hPx, v.dpr);
      if (p.broken) {
        // 부서진 발판: 두 조각이 기울며 떨어진다
        const k = (W.t - p.bt) / D.CRUMBLE.fall;
        if (k >= 1) continue;
        const dy = k * k * 140, rot = k * 0.6;
        ctx.globalAlpha = 1 - k;
        for (const side of [0, 1]) {
          ctx.save();
          ctx.translate(x + wPx * (side ? 0.75 : 0.25), y + hPx / 2 + dy);
          ctx.rotate(side ? rot : -rot);
          // 왼쪽 조각은 스프라이트 왼쪽 절반, 오른쪽 조각은 오른쪽 절반
          const sw = spr.width / 2, hw = (wPx + PM * 2) / 2;
          ctx.drawImage(spr, side * sw, 0, sw, spr.height, side ? -wPx * 0.25 : -(wPx * 0.25 + PM), -hPx / 2 - PM, hw, hPx + PM * 2);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      if (p.kind === 'cloud') {
        const al = JP.World.cloudAlpha(p);
        if (al <= 0.02) {
          // 사라진 동안: 흐린 점선 자리만
          ctx.strokeStyle = 'rgba(200,230,255,0.18)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
          ctx.beginPath(); ctx.moveTo(x + 4, y + hPx / 2); ctx.lineTo(x + wPx - 4, y + hPx / 2); ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }
        ctx.globalAlpha = al;
        ctx.drawImage(spr, x - PM, y - PM, wPx + PM * 2, hPx + PM * 2);
        ctx.globalAlpha = 1;
        continue;
      }
      if (p.kind === 'spring') drawSpring(ctx, W, x + wPx / 2, y, s, p);
      ctx.drawImage(spr, x - PM, y - PM, wPx + PM * 2, hPx + PM * 2);
    }
  }

  // 스프링: 발판 위 용수철. 밟으면 눌렸다가 튀어 오른다
  function drawSpring(ctx, W, cx, y, s, p) {
    const k = W.t - p.hit;
    let comp = 1;
    if (k >= 0 && k < 0.35) comp = k < 0.06 ? 0.45 : 1 + Math.sin((k - 0.06) / 0.29 * Math.PI) * 0.35;
    const h = 18 * s * comp, w = 11 * s;
    ctx.strokeStyle = '#e8f7ff'; ctx.lineWidth = Math.max(2, 2.6 * s); ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - w, y);
    for (let i = 1; i <= 4; i++) ctx.lineTo(cx + (i % 2 ? w : -w), y - h * i / 4);
    ctx.stroke();
    ctx.fillStyle = '#ffe66d';
    const pw = 30 * s, ph = 5 * s;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - pw / 2, y - h - ph, pw, ph, ph / 2); else ctx.rect(cx - pw / 2, y - h - ph, pw, ph); ctx.fill();
    glow(ctx, 'rgba(255,230,109,0.6)', cx, y - h, 18 * s, 0.6);
  }

  // ─── 별 · 아이템 · 가시 폭탄 ───────────────────────────────
  function starPath(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + TAU * i / 8, rr = i % 2 ? r * 0.42 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function drawStars(ctx, W, v) {
    const s = v.scale, r = D.STAR.r * s * 1.05;
    for (const st of W.stars) {
      if (st.got) continue;
      const x = SX(v, st.x), y = SY(v, st.y);
      if (y < v.cy - 30 || y > v.cy + v.ch + 30) continue;
      const pulse = v.calm ? 1 : 1 + Math.sin(W.t * 5 + st.id) * 0.08;
      glow(ctx, 'rgba(255,230,109,0.7)', x, y, r * 2.4, 0.8);
      ctx.fillStyle = '#ffe66d';
      starPath(ctx, x, y, r * pulse, v.calm ? 0 : W.t * 1.5 + st.id);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, r * 0.25, 0, TAU); ctx.fill();
    }
  }

  function label(ctx, txt, x, y, fs, color, bg, border) {
    ctx.font = fs + 'px ' + DISP;
    const tw = ctx.measureText(txt).width + fs * 0.9;
    ctx.fillStyle = bg;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - tw / 2, y - fs * 0.72, tw, fs * 1.44, fs * 0.4); else ctx.rect(x - tw / 2, y - fs * 0.72, tw, fs * 1.44); ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  function drawItems(ctx, W, v) {
    const s = v.scale, r = D.ITEM.r * s * 1.15;
    for (const it of W.items) {
      if (it.got) continue;
      const K = ITEM[it.kind];
      const bob = v.calm ? 0 : Math.sin(W.t * 4 + it.id) * 4 * s;
      const x = SX(v, it.x), y = SY(v, it.y) + bob;
      if (y < v.cy - 40 || y > v.cy + v.ch + 40) continue;
      glow(ctx, K.color, x, y, r * 2.3, 0.6);
      ctx.fillStyle = 'rgba(7,10,18,0.9)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = K.color; ctx.lineWidth = Math.max(2, r * 0.14); ctx.stroke();
      if (it.kind === 'rocket') drawRocketIcon(ctx, x, y, r * 0.62, K.color);
      else {
        ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = Math.max(1.5, r * 0.1);
        ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(127,211,255,0.35)'; ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x - r * 0.18, y - r * 0.2, r * 0.14, r * 0.08, -0.6, 0, TAU); ctx.fill();
      }
      // 나타난 뒤 3초 동안 이름표 (좋은 아이템이라는 것을 알 수 있게)
      const age = it.seen >= 0 ? W.t - it.seen : 0;
      if (age < 3 && v.hud !== false) {
        ctx.globalAlpha = Math.min(1, (3 - age) * 2);
        const fs = Math.round(Math.max(14, 16 * v.ui));
        label(ctx, K.name, Math.max(v.cx + fs * 2.5, Math.min(v.cx + v.cw - fs * 2.5, x)), Math.max(v.cy + fs, y - r - fs), fs, K.color, 'rgba(5,7,12,0.85)', null);
        ctx.globalAlpha = 1;
      }
    }
  }
  function drawRocketIcon(ctx, x, y, r, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ffe66d';
    ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.7); ctx.lineTo(0, r * 1.15); ctx.lineTo(r * 0.3, r * 0.7); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.75); ctx.lineTo(-r * 0.35, r * 0.1); ctx.lineTo(-r * 0.35, r * 0.75); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.75); ctx.lineTo(r * 0.35, r * 0.1); ctx.lineTo(r * 0.35, r * 0.75); ctx.fill();
    ctx.fillStyle = '#f2f6ff';
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.5, -r * 0.4, r * 0.38, r * 0.75); ctx.lineTo(-r * 0.38, r * 0.75); ctx.quadraticCurveTo(-r * 0.5, -r * 0.4, 0, -r); ctx.fill();
    ctx.fillStyle = '#1b5fd0';
    ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // 가시 폭탄: 빨간 가시 + 노랑·검정 줄무늬 (냠냠 뱀의 위험 벽과 같은 표시). 처음 보일 때와 가까울 때 "위험!"
  function drawMines(ctx, W, v) {
    const s = v.scale, r = D.MINE.r * s * 1.1, P = W.p;
    for (const m of W.mines) {
      if (m.gone) continue;
      const x = SX(v, m.x), y = SY(v, m.y);
      if (y < v.cy - 40 || y > v.cy + v.ch + 40) continue;
      const spin = v.calm ? 0 : W.t * 0.8 + m.id;
      glow(ctx, 'rgba(255,59,78,0.75)', x, y, r * 2.6, 0.75);
      ctx.fillStyle = '#ff3b4e';
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = spin + TAU * i / 20, rr = i % 2 ? r * 0.95 : r * 1.45;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, TAU); ctx.clip();
      ctx.fillStyle = '#2a070c'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.strokeStyle = 'rgba(255,200,40,0.8)'; ctx.lineWidth = Math.max(2, r * 0.28);
      ctx.beginPath();
      for (let k = -2 * r; k < 2 * r; k += r * 0.7) { ctx.moveTo(x + k - r, y + r); ctx.lineTo(x + k + r, y - r); }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#ff3b4e'; ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, TAU); ctx.stroke();
      const blink = v.calm ? 1 : 0.6 + Math.sin(W.t * 10 + m.id) * 0.4;
      ctx.fillStyle = 'rgba(255,220,225,' + (0.5 + blink * 0.5).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.fill();
      if (v.hud === false) continue;
      const age = m.seen >= 0 ? W.t - m.seen : 0;
      const near = Math.abs(JP.World.wrapDelta(P.x, m.x)) < 110 && m.y - P.y < 260 && m.y - P.y > -40;
      if ((age < 2.5 || near) && y > v.cy && y < v.cy + v.ch - r) {
        const fs = Math.round(Math.max(14, 16 * v.ui));
        ctx.globalAlpha = near ? (v.calm ? 1 : 0.7 + Math.sin(W.t * 16) * 0.3) : Math.min(1, (2.5 - age) * 2);
        label(ctx, '위험!', Math.max(v.cx + fs * 1.8, Math.min(v.cx + v.cw - fs * 1.8, x)), Math.max(v.cy + fs, y - r * 1.5 - fs), fs, '#ffd0d5', 'rgba(40,4,10,0.9)', '#ff3b4e');
        ctx.globalAlpha = 1;
      }
    }
  }

  // ─── 주인공: 광택 네온 공 로봇 (눈 두 개, 안테나) ───────────
  function drawPlayer(ctx, W, v, a) {
    const P = W.p, s = v.scale, r = D.PLAYER.r * s;
    const wx = P.px + (P.x - P.px) * a, wy = P.py + (P.y - P.py) * a;
    const x = SX(v, wx), y = SY(v, wy);
    // 착지 찌그러짐 · 오를 때 늘어남 (움직임 줄이기 설정이면 생략)
    let sx = 1, sy = 1;
    if (!v.calm) {
      const k = W.t - P.land;
      if (k >= 0 && k < 0.2) { const q = Math.sin((1 - k / 0.2) * Math.PI * 0.5) * 0.3; sx = 1 + q; sy = 1 - q; }
      else if (P.vy > 0) { const q = Math.min(0.14, P.vy / 7000); sx = 1 - q * 0.6; sy = 1 + q; }
    }
    const copies = [x];
    if (x - v.cx < r * 1.6) copies.push(x + v.cw);
    if (v.cx + v.cw - x < r * 1.6) copies.push(x - v.cw);
    for (const cx of copies) drawBot(ctx, W, v, cx, y, r, sx, sy);
  }

  function drawBot(ctx, W, v, x, y, r, sx, sy) {
    const P = W.p, dead = W.phase === 'over';
    // 로켓 불꽃
    if (W.rocket > 0) {
      const f = v.calm ? 1 : 0.8 + Math.random() * 0.4;
      glow(ctx, 'rgba(255,159,67,0.8)', x, y + r * 1.4, r * 2.2, 0.8);
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath(); ctx.moveTo(x - r * 0.45, y + r * 0.7); ctx.lineTo(x, y + r * (1.4 + 1.2 * f)); ctx.lineTo(x + r * 0.45, y + r * 0.7); ctx.fill();
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath(); ctx.moveTo(x - r * 0.28, y + r * 0.8); ctx.lineTo(x, y + r * (1.1 + 0.8 * f)); ctx.lineTo(x + r * 0.28, y + r * 0.8); ctx.fill();
    }
    glow(ctx, dead ? 'rgba(255,77,109,0.6)' : 'rgba(94,231,255,0.6)', x, y, r * 2.5, 0.8);
    ctx.save();
    ctx.translate(x, y + r);
    ctx.scale(sx, sy);
    ctx.translate(0, -r);
    // 안테나: 움직이는 반대쪽으로 살짝 휜다
    const lean = Math.max(-1, Math.min(1, P.vx / D.PLAYER.maxVx));
    const tipX = -lean * r * 0.45 + r * 0.15, tipY = -r * 1.55;
    ctx.strokeStyle = '#bff8ff'; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.9); ctx.quadraticCurveTo(r * 0.15, -r * 1.3, tipX, tipY); ctx.stroke();
    glow(ctx, 'rgba(255,230,109,0.9)', tipX, tipY, r * 0.55, 0.9);
    ctx.fillStyle = '#ffe66d'; ctx.beginPath(); ctx.arc(tipX, tipY, r * 0.16, 0, TAU); ctx.fill();
    // 몸통 (미리 그린 광택 공)
    const spr = bodySprite(Math.round(r), v.dpr), half = Math.round(r) + 4;
    ctx.drawImage(spr, -half, -half, half * 2, half * 2);
    // 얼굴 가리개 (어두운 유리) + 눈 두 개. 가는 쪽·오르내리는 쪽을 본다
    const lx = lean * r * 0.16, ly = -Math.max(-1, Math.min(1, P.vy / 1400)) * r * 0.1;
    const vw = r * 1.3, vh = r * 0.62;
    ctx.fillStyle = 'rgba(4,10,24,0.88)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-vw / 2 + lx * 0.5, -r * 0.34 + ly * 0.5, vw, vh, vh / 2); else ctx.rect(-vw / 2, -r * 0.34, vw, vh); ctx.fill();
    ctx.strokeStyle = 'rgba(94,231,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    const ey = -r * 0.03 + ly, blink = !v.calm && (W.t % 3.3) < 0.12;
    for (const ex of [-r * 0.27, r * 0.27]) {
      const cx = ex + lx;
      if (dead) {
        ctx.strokeStyle = W.cause === 'mine' ? '#ff8a96' : '#bff8ff'; ctx.lineWidth = Math.max(1.5, r * 0.1);
        ctx.beginPath();
        if (W.cause === 'mine') { const e = r * 0.12; ctx.moveTo(cx - e, ey - e); ctx.lineTo(cx + e, ey + e); ctx.moveTo(cx + e, ey - e); ctx.lineTo(cx - e, ey + e); }
        else { ctx.arc(cx, ey + r * 0.05, r * 0.12, Math.PI * 1.1, Math.PI * 1.9); }
        ctx.stroke();
        continue;
      }
      const eh = blink ? r * 0.05 : r * 0.3, ew = r * 0.17;
      ctx.fillStyle = '#bff8ff';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - ew / 2, ey - eh / 2, ew, eh, ew / 2); else ctx.rect(cx - ew / 2, ey - eh / 2, ew, eh); ctx.fill();
      if (!blink) { ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - ew * 0.15, ey - eh * 0.32, ew * 0.3, eh * 0.22); }
    }
    ctx.restore();
    // 방패 방울
    if (W.shield) {
      const t = W.t, wob = v.calm ? 0 : Math.sin(t * 6) * r * 0.05;
      glow(ctx, 'rgba(127,211,255,0.35)', x, y, r * 2.2, 0.8);
      ctx.strokeStyle = 'rgba(191,233,255,0.85)'; ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.beginPath(); ctx.ellipse(x, y - r * 0.1, r * 1.55 + wob, r * 1.55 - wob, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 1.3, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    }
  }

  // 구조 구름 (쉬움): 아래에서 받아 던져 올려 준 자리
  function drawRescue(ctx, v) {
    for (const q of R.clouds) {
      const k = q.life / q.max, x = SX(v, q.x), y = SY(v, q.y), s = v.scale;
      ctx.globalAlpha = Math.min(1, k * 2);
      glow(ctx, 'rgba(220,240,255,0.7)', x, y, 90 * s, 0.7);
      ctx.fillStyle = '#f4fbff';
      ctx.beginPath();
      for (const [dx, dy, rr] of [[-40, 0, 22], [-14, -12, 28], [16, -8, 26], [40, 2, 20], [0, 8, 26]]) {
        ctx.moveTo(x + (dx + rr) * s, y + dy * s); ctx.arc(x + dx * s, y + dy * s, rr * s, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // 기둥 아래 끝: 보통은 빨간 위험 띠 (떨어지면 끝), 쉬움은 남은 구조 구름
  function drawBottom(ctx, W, v) {
    const y0 = v.cy + v.ch;
    if (!W.easy) {
      const h = Math.max(18, v.ch * 0.05);
      const g = ctx.createLinearGradient(0, y0 - h, 0, y0);
      g.addColorStop(0, 'rgba(255,59,78,0)'); g.addColorStop(1, 'rgba(255,59,78,0.35)');
      ctx.fillStyle = g; ctx.fillRect(v.cx, y0 - h, v.cw, h);
      const sh = 6;
      ctx.save();
      ctx.beginPath(); ctx.rect(v.cx, y0 - sh, v.cw, sh); ctx.clip();
      ctx.fillStyle = '#2a070c'; ctx.fillRect(v.cx, y0 - sh, v.cw, sh);
      ctx.strokeStyle = 'rgba(255,200,40,0.8)'; ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = v.cx - 10; x < v.cx + v.cw + 10; x += 14) { ctx.moveTo(x, y0); ctx.lineTo(x + 8, y0 - sh); }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ff3b4e'; ctx.fillRect(v.cx, y0 - sh - 2, v.cw, 2);
      return;
    }
    const n = D.EASY.rescues, s = Math.max(0.55, Math.min(1.2, v.scale));
    for (let i = 0; i < n; i++) {
      const x = v.cx + v.cw * (i + 0.5) / n, y = y0 + 6 * s, on = i < W.rescues;
      ctx.globalAlpha = on ? 0.8 : 0.12;
      ctx.fillStyle = on ? '#e9f6ff' : '#8aa4b8';
      ctx.beginPath();
      for (const [dx, dy, rr] of [[-26, 0, 16], [-8, -10, 20], [14, -6, 18], [30, 2, 14]]) {
        ctx.moveTo(x + (dx + rr) * s, y + dy * s); ctx.arc(x + dx * s, y + dy * s, rr * s, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ─── HUD ──────────────────────────────────────────────────
  function cloudIcon(ctx, x, y, s, on) {
    ctx.fillStyle = on ? '#f4fbff' : 'rgba(138,164,184,0.35)';
    ctx.beginPath();
    for (const [dx, dy, rr] of [[-7, 2, 6], [0, -3, 8], [8, 1, 6]]) { ctx.moveTo(x + (dx + rr) * s, y + dy * s); ctx.arc(x + dx * s, y + dy * s, rr * s, 0, TAU); }
    ctx.fill();
  }
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

  // 가로 화면 옆자리 점수판 (오른쪽)
  function drawSideHud(ctx, W, v) {
    const s = v.ui, x0 = v.cx + v.cw + Math.round(24 * s), right = v.w - Math.round(18 * s);
    const sw = right - x0;
    let y = v.hudMid - 12 * s;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const big = Math.min(54 * s, sw * 0.3);
    ctx.font = Math.round(16 * s) + 'px ' + DISP; ctx.fillStyle = '#8aa4b8';
    ctx.fillText('점수', x0, y);
    ctx.font = '700 ' + Math.round(big) + 'px ' + NUM; ctx.fillStyle = '#e8f7ff';
    ctx.fillText(W.score.toLocaleString(), x0, y + 18 * s);
    y += 18 * s + big + 10 * s;
    // 높이 · 별
    ctx.font = '700 ' + Math.round(28 * s) + 'px ' + NUM; ctx.fillStyle = '#5ee7ff';
    const hTxt = W.height + ' m';
    ctx.fillText(hTxt, x0, y);
    const hw = ctx.measureText(hTxt).width;
    ctx.fillStyle = '#ffe66d';
    starPath(ctx, x0 + hw + 30 * s, y + 14 * s, 10 * s, 0); ctx.fill();
    ctx.fillText(String(W.starsGot), x0 + hw + 44 * s, y);
    y += 36 * s;
    ctx.font = '700 ' + Math.round(16 * s) + 'px ' + NUM; ctx.fillStyle = '#bcd3e2';
    ctx.fillText('BEST ' + Math.max(v.bestH || 0, W.height) + ' m', x0, y);
    y += 30 * s;
    if (W.easy) {
      ctx.font = Math.round(15 * s) + 'px ' + DISP; ctx.fillStyle = '#8aa4b8';
      ctx.fillText('구조 구름', x0, y);
      for (let i = 0; i < D.EASY.rescues; i++) cloudIcon(ctx, x0 + 12 * s + i * 30 * s, y + 34 * s, 1.2 * s, i < W.rescues);
      y += 56 * s;
    }
    if (W.shield) {
      ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x0 + 10 * s, y + 11 * s, 9 * s, 0, TAU); ctx.stroke();
      ctx.font = Math.round(16 * s) + 'px ' + DISP; ctx.fillStyle = '#7fd3ff';
      ctx.fillText('방패 방울', x0 + 26 * s, y + 1 * s);
      y += 30 * s;
    }
    if (W.rocket > 0) {
      ctx.font = Math.round(16 * s) + 'px ' + DISP; ctx.fillStyle = '#ff9f43';
      ctx.fillText('로켓', x0, y);
      const bw = Math.min(sw - 50 * s, 120 * s);
      ctx.fillStyle = 'rgba(255,159,67,0.2)'; ctx.fillRect(x0 + 44 * s, y + 6 * s, bw, 8 * s);
      ctx.fillStyle = '#ff9f43'; ctx.fillRect(x0 + 44 * s, y + 6 * s, bw * W.rocket / D.ROCKET.time, 8 * s);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 위 한 줄 HUD (세로 화면·옆자리가 좁을 때): 오른쪽 끝에 점수, 그 왼쪽에 작은 칸들
  function drawTopHud(ctx, W, v) {
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
    const items = [[W.height + ' m', '#5ee7ff'], ['★ ' + W.starsGot, '#ffe66d']];
    if (W.easy) items.push(['구름 ' + W.rescues, '#e9f6ff']);
    if (W.shield) items.push(['방울', '#7fd3ff']);
    items.push(['BEST ' + Math.max(v.bestH || 0, W.height) + ' m', '#bcd3e2']);
    for (const [txt, col] of items) {
      if (x - 70 * s < v.hudLeft) break; // 버튼 묶음과 겹치면 생략
      x -= chip(ctx, x, cy, ch, txt, col, s) + 6 * s;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 누르는 자리 안내: 양옆 큰 화살표. 누르고 있는 쪽이 밝아진다
  function drawControls(ctx, W, v) {
    const I = v.pad, side = I ? I.side : 0;
    const show = v.touch || (I && I.used) || W.t < D.HINT_TIME;
    if (!show) return;
    const pulse = W.t < D.HINT_TIME && !v.calm ? 0.12 + Math.sin(W.t * 5) * 0.08 : 0;
    let size, lx, rx, y;
    if (v.side) {
      size = Math.min(70, v.cx * 0.28) * Math.max(1, v.ui * 0.9);
      lx = v.cx / 2; rx = v.cx + v.cw + (v.w - v.cx - v.cw) / 2; y = v.h * 0.72;
    } else {
      size = Math.max(26, Math.min(44, v.cw * 0.07));
      lx = v.cx + size * 1.2; rx = v.cx + v.cw - size * 1.2; y = v.cy + v.ch - size * 1.8;
    }
    for (const d of [-1, 1]) {
      const on = side === d, x = d < 0 ? lx : rx;
      const a = (on ? 0.85 : v.side ? 0.22 : 0.14) + pulse;
      if (on) glow(ctx, 'rgba(94,231,255,0.5)', x, y, size * 1.8, 0.8);
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = 'rgba(12,22,38,0.6)';
      ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
      ctx.strokeStyle = on ? '#bff8ff' : '#5ee7ff'; ctx.lineWidth = Math.max(2, size * 0.06);
      ctx.stroke();
      ctx.strokeStyle = on ? '#ffffff' : '#bff8ff'; ctx.lineWidth = Math.max(3, size * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const k = size * 0.32;
      for (const off of [-0.18, 0.2]) {
        const cx = x + d * size * off;
        ctx.beginPath(); ctx.moveTo(cx - d * k * 0.6, y - k); ctx.lineTo(cx + d * k * 0.4, y); ctx.lineTo(cx - d * k * 0.6, y + k); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
  }

  // 처음 몇 초 조작 안내
  function drawIntro(ctx, W, v) {
    const a = Math.max(0, Math.min(1, D.HINT_TIME - W.t));
    if (a <= 0) return;
    const cx = v.cx + v.cw / 2, cy = v.cy + v.ch * 0.32;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.round(Math.max(17, Math.min(28, v.cw * 0.055)));
    ctx.font = fs + 'px ' + DISP;
    const lines = v.touch ? ['왼쪽·오른쪽을', '누르고 있으면 움직여요'] : ['← → 방향키로', '움직여요'];
    lines.forEach((t, i) => {
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.85)';
      ctx.strokeText(t, cx, cy + i * fs * 1.35);
      ctx.fillStyle = i ? '#bff8ff' : '#ffe66d'; ctx.fillText(t, cx, cy + i * fs * 1.35);
    });
    if (!W.easy && W.t < D.HINT_TIME) {
      ctx.font = Math.round(fs * 0.8) + 'px ' + DISP;
      ctx.strokeText('아래로 떨어지면 끝!', cx, cy + fs * 3);
      ctx.fillStyle = '#ff8a96'; ctx.fillText('아래로 떨어지면 끝!', cx, cy + fs * 3);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  // view: {dpr, w, h, cx, cy, cw, ch, scale, side, ui, hudMid, hudLeft, hudRight, hud, touch, calm, bestH, pad}
  function draw(ctx, W, v, dt) {
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const a = W.phase === 'play' ? W.alpha : 1;
    CAM = W.pcam + (W.cam - W.pcam) * a;
    takeFx(W, v);
    updateFx(dt || 0);
    drawBackground(ctx, W, v);
    ctx.save();
    if (R.shake > 0) ctx.translate((Math.random() - 0.5) * R.shake, (Math.random() - 0.5) * R.shake);
    ctx.beginPath(); ctx.rect(v.cx, v.cy, v.cw, v.ch); ctx.clip();
    drawMarks(ctx, W, v);
    drawPlats(ctx, W, v, a);
    drawStars(ctx, W, v);
    drawItems(ctx, W, v);
    drawMines(ctx, W, v);
    drawRescue(ctx, v);
    drawPlayer(ctx, W, v, a);
    drawFx(ctx, v);
    drawBottom(ctx, W, v);
    ctx.restore();
    if (R.flash > 0) {
      ctx.fillStyle = 'rgba(255,77,109,' + (R.flash * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
    if (v.hud !== false) {
      if (v.side) drawSideHud(ctx, W, v); else drawTopHud(ctx, W, v);
      if (W.phase === 'play') { drawControls(ctx, W, v); drawIntro(ctx, W, v); }
    }
  }

  // 멈춘 화면처럼 입자가 남아 있는지 (다 사라지면 그리기를 쉰다)
  const busy = () => R.parts.length > 0 || R.shake > 0 || R.flash > 0 || R.clouds.length > 0;

  JP.Render = { draw, layout, busy };
})(JP);
