'use strict';
// 캔버스 그리기. 게임 상태를 읽기만 하고 규칙은 바꾸지 않는다.
// 입자·흔들림 같은 꾸밈은 규칙 파일이 아니라 여기(R)에 둔다.
(function (SN) {
  const TAU = Math.PI * 2;
  const D = SN.DATA;
  const NUM = '"Rajdhani", system-ui, sans-serif', DISP = '"Jua", system-ui, sans-serif';

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
    // 안쪽 벽 (스테이지): 부딪히면 끝나는 위험 블록. 빨간 테두리 + 노랑·검정 사선 줄무늬로
    // 먹이·아이템(둥근 구슬)과 한눈에 구별되게. 발광은 여기서 한 번만
    if (W && W.walls) {
      const pad = Math.max(1, Math.round(cell * 0.06));
      g.shadowColor = 'rgba(255,59,78,0.9)';
      g.shadowBlur = cell * 0.6;
      g.fillStyle = '#3a0a10';
      for (let i = 0; i < W.walls.length; i++) if (W.walls[i]) g.fillRect((i % cols) * cell + pad, Math.floor(i / cols) * cell + pad, cell - pad * 2, cell - pad * 2);
      g.shadowBlur = 0;
      for (let i = 0; i < W.walls.length; i++) {
        if (!W.walls[i]) continue;
        const x = (i % cols) * cell + pad, y = Math.floor(i / cols) * cell + pad, w = cell - pad * 2;
        g.fillStyle = '#2a070c'; g.fillRect(x, y, w, w);
        g.save();
        g.beginPath(); g.rect(x, y, w, w); g.clip();
        g.strokeStyle = 'rgba(255,200,40,0.55)'; g.lineWidth = Math.max(2, w * 0.16);
        g.beginPath();
        for (let k = -w; k < w * 2; k += w * 0.45) { g.moveTo(x + k, y + w); g.lineTo(x + k + w, y); }
        g.stroke();
        g.restore();
        g.strokeStyle = '#ff3b4e'; g.lineWidth = Math.max(1.5, cell * 0.09); g.strokeRect(x + 0.5, y + 0.5, w - 1, w - 1);
      }
    }
    // 네온 테두리
    const deadly = W && !W.easy;   // 보통·어려움: 판 끝에 닿으면 끝 → 빨간 테두리
    g.shadowColor = deadly ? 'rgba(255,59,78,0.9)' : 'rgba(94,231,255,0.9)';
    g.shadowBlur = 18;
    g.strokeStyle = deadly ? 'rgba(255,90,105,0.8)' : 'rgba(94,231,255,0.7)';
    g.lineWidth = 2;
    g.strokeRect(-1, -1, bw + 2, bh + 2);
    g.shadowBlur = 0;
    // 모서리 꺾쇠
    const k = Math.min(28, cell * 1.4);
    g.strokeStyle = deadly ? '#ffc2c8' : '#bff8ff';
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
    // 지금 투명도(유령 등) 위에 곱하고 되돌린다
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * alpha;
    ctx.drawImage(c, x - radius, y - radius);
    ctx.globalAlpha = a0;
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
  // 라이벌 뱀 색: 주황·보라 줄무늬 (어느 캐릭터와도 헷갈리지 않게) + 보라 가면
  const RIVAL_ORANGE = '#ff8a1f', RIVAL_PURPLE = '#8b4dff';
  // 떠오르는 글자 (+30 ×3, 아이템 이름). 뱀 머리·앞길을 가리지 않게 머리 뒤쪽(몸 쪽)에서 뒤로 흘러가고,
  // 다른 글자와 겹치면 비켜 놓고, 판 밖으로 잘리지 않게 판 안에 넣는다 (그릴 때 폭을 재서 맞춘다)
  function text(x, y, txt, color, size, dir) {
    if (R.texts.length > 12) R.texts.shift();
    const d = dir || [0, 1];
    const q = { x, y, txt, color, size, life: 0.9, max: 0.9, vx: -d[0] * 26, vy: d[1] !== 0 ? -d[1] * 26 : -26 };
    for (let k = 0; k < 4; k++) {
      const hit = R.texts.find(o => Math.abs(o.x - q.x) < size * 3 && Math.abs(o.y - q.y) < size * 1.05);
      if (!hit) break;
      q.y += (q.y > hit.y ? 1 : -1) * size * 1.1;
    }
    R.texts.push(q);
  }
  // 머리 뒤쪽 칸 (먹은 자리에서 몸 쪽으로 한 칸 반)
  function behind(W, p, c) {
    const d = SN.World.DIRS[W.dir] || [1, 0];
    return { x: p.x - d[0] * c * 1.5, y: p.y - d[1] * c * 1.5 - (d[1] === 0 ? c * 0.9 : 0), d };
  }

  // 큰 글자 (선물 · 피버 · 거대 뱀 · 대왕 뱀). 하나만, 새로 오면 바꾼다.
  // 뱀을 가리지 않게 판 위쪽에 짧게, 머리가 그 줄 가까이 있으면 판 아래쪽으로 옮기고 흐리게
  function banner(txt, color, life) { R.banner = { txt, color, life, max: life }; }
  function drawBanner(ctx, v, W) {
    const B = R.banner;
    if (!B || B.life <= 0) return;
    const k = B.life / B.max;
    let a = Math.min(1, k * 3, (1 - k) * 8 + 0.2) * 0.92;
    const fs = Math.round(Math.max(22, Math.min(48, v.bw / 15)));
    const x = v.bx + v.bw / 2;
    // 알림(토스트)이 판 위쪽에 떠 있으면 그 아래로
    let y = v.by + fs * 1.1 - (v.calm ? 0 : (1 - k) * 8) + (v.toastUntil && performance.now() < v.toastUntil ? 52 : 0);
    const h = W && W.snake && W.snake[0] ? v.by + (W.snake[0].y + 0.5) * v.cell : -1e9;
    if (Math.abs(h - y) < fs * 1.6) { y = v.by + v.bh - fs * 1.6; a *= 0.6; }
    if (Math.abs(h - y) < fs * 1.2) a *= 0.5;
    ctx.globalAlpha = a;
    ctx.font = fs + 'px ' + DISP; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(5,7,12,0.9)'; ctx.strokeText(B.txt, x, y);
    ctx.fillStyle = B.color; ctx.fillText(B.txt, x, y);
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  function toPx(v, gx, gy) { return { x: v.bx + (gx + 0.5) * v.cell, y: v.by + (gy + 0.5) * v.cell }; }

  // 절약 모드(view.low, 느린 기기)면 입자 절반
  const low = n => (R.low ? Math.ceil(n / 2) : n);
  function burst(x, y, n, colors, speed, size) {
    const P = R.parts;
    n = low(n);
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
    R.low = !!v.low;
    if (R.world !== W) { R.world = W; R.parts.length = 0; R.texts.length = 0; R.shake = 0; R.flash = 0; R.banner = null; }
    for (const f of W.fx) {
      const p = toPx(v, f.x, f.y), c = v.cell;
      if (W.fun && f.pts && (f.kind === 'eat' || f.kind === 'gold') && (W.mult > 1 || (W.eff && W.eff.double > 0) || f.kind === 'gold')) {
        const b = behind(W, p, c);
        text(b.x, b.y, '+' + f.pts + (W.mult > 1 ? ' ×' + W.mult : ''), f.kind === 'gold' ? '#ffe66d' : W.mult >= 3 ? '#ff9f43' : '#ffd6e8', c * 0.7, b.d);
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
        { const b = behind(W, p, c); text(b.x, b.y, K.name + '!', K.color, c * 0.8, b.d); }
      } else if (f.kind === 'cut') {
        ring(p.x, p.y, c * 2, '#3dff8b', 0.45);
        burst(p.x, p.y, 20, ['#3dff8b', '#ffffff'], c * 9, c * 0.18);
        { const b = behind(W, p, c); text(b.x, b.y, '싹둑! -' + f.n, '#3dff8b', c * 0.8, b.d); }
      } else if (f.kind === 'cool') {
        ring(p.x, p.y, c * 1.2, '#8aa4b8', 0.4);
      } else if (f.kind === 'gold') {
        ring(p.x, p.y, c * 1.6, '#ffe66d', 0.45);
        ring(p.x, p.y, c * 2.6, '#fff4c2', 0.6);
        burst(p.x, p.y, D.FX.goldSparks, ['#ffe66d', '#fff4c2', '#ffcf3a'], c * 10, c * 0.2);
      } else if (f.kind === 'bossIn') {
        ring(p.x, p.y, c * 3, RIVAL_ORANGE, 0.8);
        ring(p.x, p.y, c * 4.4, RIVAL_PURPLE, 1);
        banner('대왕 뱀 등장!', '#ffb35c', 1.4);
      } else if (f.kind === 'bossDown') {
        ring(p.x, p.y, c * 4, '#ffe66d', 0.9);
        burst(p.x, p.y, low(60), [RIVAL_ORANGE, RIVAL_PURPLE, '#ffe66d', '#ffffff', '#5ee7ff'], c * 15, c * 0.28);
        banner('대왕 뱀을 쓰러뜨렸어요!', '#ffe66d', 1.8);
        if (!v.calm) R.shake = D.FX.shake * 0.6;
      } else if (f.kind === 'revive') {
        ring(p.x, p.y, c * 2.6, '#5ee7ff', 0.7);
        ring(p.x, p.y, c * 4, '#c7a6ff', 0.9);
        burst(p.x, p.y, low(28), ['#5ee7ff', '#c7a6ff', '#ffffff'], c * 10, c * 0.2);
        banner('한 번 더! 잠깐 유령이에요', '#8ff6ff', 1.4);
      } else if (f.kind === 'rivalIn') {
        ring(p.x, p.y, c * 2.4, RIVAL_ORANGE, 0.6);
        ring(p.x, p.y, c * 3.4, RIVAL_PURPLE, 0.8);
      } else if (f.kind === 'rivalOut') {
        ring(p.x, p.y, c * 1.8, RIVAL_PURPLE, 0.45);
        burst(p.x, p.y, 14, [RIVAL_ORANGE, RIVAL_PURPLE, '#ffffff'], c * 7, c * 0.16);
        text(p.x, p.y - c, f.scared ? '으악! 도망!' : '뿅! 다시 올게', '#ffcf9a', c * 0.62);
      } else if (f.kind === 'bite' || f.kind === 'biteAll') {
        // 라이벌 냠냠: 주황·보라 조각이 튀고 "라이벌 냠냠! +N"
        const all = f.kind === 'biteAll';
        ring(p.x, p.y, c * (all ? 3 : 1.8), RIVAL_ORANGE, all ? 0.7 : 0.45);
        burst(p.x, p.y, all ? 40 : 20, [RIVAL_ORANGE, RIVAL_PURPLE, '#ffe66d', '#ffffff'], c * (all ? 13 : 9), c * 0.24);
        // 잇달아 물면(대왕 뱀을 따라가며) 글자 하나로 모아 센다
        const last = R.texts[R.texts.length - 1];
        if (last && last.bite && last.life > 0.45) { last.bite += f.n; last.txt = '냠! +' + last.bite; last.life = last.max; }
        else { const b = behind(W, p, c); text(b.x, b.y, '냠! +' + f.n, '#ffe66d', c * 0.8, b.d); R.texts[R.texts.length - 1].bite = f.n; }
        banner(f.boss ? (all ? '대왕 뱀이 도망갔다! 곧 다시 와요' : '대왕 뱀 냠냠!') : all ? '라이벌을 통째로 냠냠!' : '라이벌 냠냠! +' + f.n, all ? '#ffb35c' : '#ffe66d', all ? 1.4 : 0.9);
        if (all && !v.calm) R.shake = D.FX.shake * 0.5;
      } else if (f.kind === 'headbump') {
        ring(p.x, p.y, c * 1.5, '#ffe66d', 0.4);
        burst(p.x, p.y, 12, ['#ffe66d', '#ffffff'], c * 7, c * 0.16);
        text(p.x, p.y - c, '쿵!', '#ffe66d', c * 0.75);
      } else if (f.kind === 'giftIn') {
        ring(p.x, p.y, c * 2, '#ff9ad5', 0.6);
        text(p.x, p.y - c, '선물 상자!', '#ffc8e8', c * 0.62);
      } else if (f.kind === 'gift') {
        // 색종이 + 판 가운데 큰 글자
        ring(p.x, p.y, c * 2.6, '#ffe66d', 0.6);
        burst(p.x, p.y, 40, ['#ff5fa8', '#ffe66d', '#5ee7ff', '#7dff6a', '#c7a6ff', '#ffffff'], c * 13, c * 0.24);
        banner(f.text, '#ffe66d', 1.8);
      } else if (f.kind === 'fever') {
        burst(p.x, p.y, 30, ['#ff5fa8', '#ffe66d', '#5ee7ff', '#7dff6a'], c * 12, c * 0.2);
        banner('피버! 점수 두 배', '#ff9ad5', 1.2);
      } else if (f.kind === 'giant') {
        ring(p.x, p.y, c * 3.2, '#ffe66d', 0.7);
        burst(p.x, p.y, 30, ['#ffe66d', '#ffffff', '#ff9f43'], c * 12, c * 0.24);
        banner('거대 뱀 변신!', '#ffe66d', 1.2);
        if (!v.calm) R.shake = D.FX.shake * 0.6;
      } else if (f.kind === 'smash') {
        ring(p.x, p.y, c * 1.6, '#ff9f43', 0.4);
        burst(p.x, p.y, 18, ['#ff3b4e', '#ffc828', '#3a0a10', '#ffffff'], c * 10, c * 0.26);
        text(p.x, p.y - c * 0.7, '쾅!', '#ffc828', c * 0.8);
        if (!v.calm) R.shake = Math.max(R.shake, D.FX.shake * 0.4);
      } else if (f.kind === 'rivalEat') {
        ring(p.x, p.y, c * 1.2, RIVAL_ORANGE, 0.35);
        burst(p.x, p.y, 8, [RIVAL_ORANGE, RIVAL_PURPLE], c * 5, c * 0.14);
        text(p.x, p.y - c * 0.8, f.gold ? '라이벌 황금 냠!' : '라이벌 냠!', '#ffb35c', c * 0.56);
      } else if (f.kind === 'bump') {
        // 라이벌 머리가 내 몸에 쿵: 라이벌만 어질어질 (내가 이긴 것)
        const q = toPx(v, f.hx, f.hy), bx = (p.x + q.x) / 2, by = (p.y + q.y) / 2;
        ring(bx, by, c * 1.8, '#ffe66d', 0.45);
        burst(bx, by, 16, ['#ffe66d', '#ffffff', RIVAL_ORANGE], c * 8, c * 0.18);
        text(bx, by - c, '쿵! 라이벌 멈칫', '#ffe66d', c * 0.7);
      } else if (f.kind === 'pass') {
        // 쉬움: 라이벌 몸을 슝 지나감 (아무 일 없음)
        ring(p.x, p.y, c * 1.6, '#8ff6ff', 0.4);
        burst(p.x, p.y, 10, ['#8ff6ff', '#ffffff'], c * 6, c * 0.14);
        text(p.x, p.y - c, '슝 통과!', '#8ff6ff', c * 0.66);
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
    for (let i = R.texts.length - 1; i >= 0; i--) { const q = R.texts[i]; q.life -= dt; q.x += (q.vx || 0) * dt; q.y += (q.vy == null ? -28 : q.vy) * dt; if (q.life <= 0) R.texts.splice(i, 1); }
    R.shake = Math.max(0, R.shake - dt * 40);
    if (R.banner) { R.banner.life -= dt; if (R.banner.life <= 0) R.banner = null; }
    R.flash = Math.max(0, R.flash - dt);
  }

  function drawFx(ctx, v) {
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
      const fs = Math.round(Math.max(14, q.size));
      ctx.font = fs + 'px ' + DISP;
      const hw = ctx.measureText(q.txt).width / 2 + 4;
      const x = v ? Math.max(v.bx + hw, Math.min(v.bx + v.bw - hw, q.x)) : q.x;
      const y = v ? Math.max(v.by + fs * 0.6, Math.min(v.by + v.bh - fs * 0.6, q.y)) : q.y;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(q.txt, x, y);
      ctx.fillStyle = q.color; ctx.fillText(q.txt, x, y);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // ─── 배경 ─────────────────────────────────────────────────
  // 판 뒤 하늘: 우주 여행(space.js, 행성·블랙홀·은하). 없으면 예전 성운
  function drawBackground(ctx, W, v, dt) {
    if (SN.Space) SN.Space.draw(ctx, W, v, dt);
    else {
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
    }
    const key = [v.w, v.h, v.dpr, v.cell, W.cols, W.rows, W.mode, W.level, W.walls ? W.walls.length : 0, W.diff || (W.easy ? 1 : 0), W.wallVer || 0].join(',');
    if (R.boardKey !== key || R.boardWalls !== W.walls) { R.boardKey = key; R.boardWalls = W.walls; R.board = paintBoard(v, W.cols, W.rows, v.dpr, W); }
    ctx.drawImage(R.board, v.bx - BM, v.by - BM, v.bw + BM * 2, v.bh + BM * 2);
    // 행성 날씨가 테두리에 닿은 모습 (쌓인 눈·달아오른 용암 빛 등, 판 바깥에만)
    if (SN.Space && SN.Space.drawFrame) SN.Space.drawFrame(ctx, W, v);
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
        const left = Math.max(0, 1 - age / (W.goldLife || D.FOOD.goldLife));
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

  // ─── 재미 셋 그리기 ───────────────────────────────────────
  // 피버 보너스 구슬: 무지개 고리를 두른 구슬
  function drawBonus(ctx, W, v) {
    const f = W.bonus;
    if (!f) return;
    const p = toPx(v, f.x, f.y), c = v.cell, k = Math.min(1, (W.t - f.born) / 0.25);
    const hue = v.calm ? 320 : (W.t * 200) % 360;
    glow(ctx, 'rgba(255,120,220,0.7)', p.x, p.y, c * 1.3, 0.8 * k);
    ctx.strokeStyle = 'hsl(' + hue + ',100%,70%)'; ctx.lineWidth = Math.max(2, c * 0.09);
    ctx.beginPath(); ctx.arc(p.x, p.y, c * 0.42 * k, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ff5fd0';
    ctx.beginPath(); ctx.arc(p.x, p.y, c * 0.28 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe0f6';
    ctx.beginPath(); ctx.arc(p.x - c * 0.07, p.y - c * 0.07, c * 0.1 * k, 0, TAU); ctx.fill();
  }
  // 선물 상자: 분홍 상자에 노란 리본. 사라지기 전 blink초는 깜빡 (움직임 줄이기면 흐리게만)
  function giftSprite(c) {
    const px = Math.round(c);
    return sprite('gift' + px, px, (g, s) => {
      const m = s * 0.12, w = s - m * 2;
      rrect(g, m, m + s * 0.12, w, w - s * 0.12, s * 0.12);
      const gr = g.createLinearGradient(0, m, 0, s - m);
      gr.addColorStop(0, '#ff8ed0'); gr.addColorStop(1, '#c3237f');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = '#5a0a38'; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
      // 뚜껑
      rrect(g, m * 0.6, m + s * 0.04, s - m * 1.2, s * 0.2, s * 0.06);
      g.fillStyle = '#ffb3e0'; g.fill(); g.stroke();
      // 리본
      g.fillStyle = '#ffe66d';
      g.fillRect(s / 2 - s * 0.07, m + s * 0.04, s * 0.14, w - s * 0.04);
      g.fillRect(m, s * 0.5, w, s * 0.12);
      g.beginPath(); g.ellipse(s / 2 - s * 0.14, m, s * 0.14, s * 0.09, -0.5, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(s / 2 + s * 0.14, m, s * 0.14, s * 0.09, 0.5, 0, TAU); g.fill();
    });
  }
  function drawGift(ctx, W, v) {
    const G = W.gift;
    if (!G) return;
    const p = toPx(v, G.x, G.y), c = v.cell;
    const k = Math.min(1, (W.t - G.born) / 0.3), end = G.life < D.GIFT.blink;
    const a = end ? (v.calm ? 0.55 : (Math.floor(W.t * 8) % 2 ? 0.35 : 1)) : 1;
    const bob = v.calm ? 0 : Math.sin(W.t * 4) * c * 0.06;
    ctx.globalAlpha = a;
    glow(ctx, 'rgba(255,150,220,0.75)', p.x, p.y, c * 1.8, 0.85 * k);
    const sp = giftSprite(c * 1.1), sz = c * 1.1 * k;
    ctx.drawImage(sp, p.x - sz / 2, p.y - sz / 2 + bob, sz, sz);
    ctx.globalAlpha = 1;
  }
  // 피버: 판 테두리가 무지개 (움직임 줄이기면 고정된 금빛)
  function drawFeverBorder(ctx, W, v) {
    if (!(W.feverT > 0)) return;
    const x = v.bx - 3, y = v.by - 3, w = v.bw + 6, h = v.bh + 6;
    ctx.lineWidth = 5;
    if (v.calm) { ctx.strokeStyle = '#ffd84a'; ctx.strokeRect(x, y, w, h); return; }
    const t = W.t * 160, seg = 12, per = 2 * (w + h) / seg;
    for (let i = 0; i < seg; i++) {
      ctx.strokeStyle = 'hsl(' + ((t + i * 30) % 360) + ',100%,62%)';
      ctx.beginPath();
      // 둘레를 따라 한 토막
      const d0 = i * per, d1 = d0 + per + 1;
      const at = d => d < w ? [x + d, y] : d < w + h ? [x + w, y + d - w] : d < 2 * w + h ? [x + w - (d - w - h), y + h] : [x, y + h - (d - 2 * w - h)];
      const pts = [d0];
      for (const c2 of [w, w + h, 2 * w + h]) if (c2 > d0 && c2 < d1) pts.push(c2);
      pts.push(Math.min(d1, 2 * (w + h)));
      const q0 = at(pts[0]); ctx.moveTo(q0[0], q0[1]);
      for (let j = 1; j < pts.length; j++) { const q = at(pts[j]); ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
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
    // 나타난 뒤 3초 동안 이름표 (좋은 아이템이라는 것을 알 수 있게)
    const age = W.t - it.born;
    if (age < 3) {
      ctx.globalAlpha = Math.min(1, (3 - age) * 2);
      ctx.font = Math.round(Math.max(13, c * 0.42)) + 'px ' + DISP;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.9)';
      ctx.strokeText(K.name, p.x, p.y + bob - c * 0.95);
      ctx.fillStyle = K.color; ctx.fillText(K.name, p.x, p.y + bob - c * 0.95);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ─── 위험 경고: 머리 앞 3칸 안에 부딪힐 것(벽·판 끝·내 몸)이 있으면 그 칸에 빨간 X와 "위험!" ───
  const WARN_TXT = { wall: '위험! 벽', edge: '위험! 끝', self: '위험! 내 몸', rival: '위험! 라이벌' };
  function drawDanger(ctx, W, v) {
    const d = v.danger;
    if (!d || W.phase !== 'play' || W.wait > 0) return;
    const c = v.cell, p = toPx(v, d.x, d.y);
    const near = d.dist === 1, blink = v.calm ? 1 : 0.6 + Math.sin(W.t * (near ? 22 : 12)) * 0.4;
    const a = (near ? 1 : d.dist === 2 ? 0.75 : 0.45) * blink;
    ctx.globalAlpha = a;
    glow(ctx, '#ff3b4e', p.x, p.y, c * 1.6, 0.8);
    ctx.strokeStyle = '#ff3b4e'; ctx.lineWidth = Math.max(2, c * 0.12); ctx.lineCap = 'round';
    const r = c * 0.32;
    ctx.beginPath(); ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r); ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r); ctx.stroke();
    ctx.strokeRect(p.x - c / 2 + 1, p.y - c / 2 + 1, c - 2, c - 2);
    if (d.dist <= 2) {
      // 말풍선: 머리 쪽이 아닌 방향으로, 판 안에 들어오게
      const fs = Math.round(Math.max(15, Math.min(26, c * 0.62)));
      ctx.font = fs + 'px ' + DISP;
      const txt = WARN_TXT[d.cause] || '위험!';
      const tw = ctx.measureText(txt).width + fs;
      let tx = Math.max(v.bx + tw / 2, Math.min(v.bx + v.bw - tw / 2, p.x));
      let ty = p.y - c * 1.2;
      if (ty - fs < v.by) ty = p.y + c * 1.25;
      ctx.fillStyle = 'rgba(40,4,10,0.88)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tx - tw / 2, ty - fs * 0.75, tw, fs * 1.5, fs * 0.4); else ctx.rect(tx - tw / 2, ty - fs * 0.75, tw, fs * 1.5);
      ctx.fill();
      ctx.strokeStyle = '#ff3b4e'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffd0d5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, tx, ty + 1);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  }

  // ─── 밀기 표시: 손가락으로 민 자리에 그 방향 화살표가 잠깐 떴다 사라진다 (알아들었다는 표시) ───
  const SWIPE_TIME = 380;
  function drawSwipe(ctx, W, v) {
    const I = v.pad, sw = I && I.swipe;
    if (!sw || W.phase === 'over') return;
    const age = performance.now() - sw.t;
    if (age > SWIPE_TIME) { I.swipe = null; return; }
    const k = age / SWIPE_TIME, d = SN.World.DIRS[sw.dir];
    const r = Math.max(22, Math.min(40, v.cell * 0.9)), push = v.calm ? 0 : k * r * 0.8;
    const x = sw.x + d[0] * push, y = sw.y + d[1] * push;
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.fillStyle = 'rgba(12,22,38,0.5)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = Math.max(3, r * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 꺾쇠 화살표 두 겹
    for (const off of [-0.22, 0.2]) {
      const cx = x + d[0] * r * off, cy = y + d[1] * r * off, a = r * 0.38;
      ctx.beginPath();
      ctx.moveTo(cx - d[0] * a + d[1] * a, cy - d[1] * a + d[0] * a);
      ctx.lineTo(cx + d[0] * a * 0.2, cy + d[1] * a * 0.2);
      ctx.lineTo(cx - d[0] * a - d[1] * a, cy - d[1] * a - d[0] * a);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  // ─── 뱀 · 캐릭터 5종 ─────────────────────────────────────────
  // 캐릭터(data.js CHARS)마다 몸 모양(body)과 머리 모양(head)이 다르다.
  //   tube: 매끈한 네온 관 (네온 뱀·꼬마 용) · plates: 쇠 마디 (로봇 뱀)
  //   beads: 동글동글 구슬 마디 + 다리 (무지개 애벌레) · nebula: 속이 비치는 몸 + 별 + 지느러미 (은하 해룡)
  // 마디 색(col): t 머리 0 → 꼬리 1. 발광·마디 무늬는 미리 그린 스프라이트만 찍는다 (매 프레임 shadowBlur 없음)
  const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  const rgb = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  const LOOKS = {
    neon:   { body: 'tube',   head: 'neon',   glow: 'rgba(94,231,255,0.45)',  headGlow: 'rgba(94,231,255,0.7)',  gloss: 0.22, col: t => mix([94, 231, 255], [52, 96, 255], t) },
    robot:  { body: 'plates', head: 'robot',  glow: 'rgba(140,200,255,0.32)', headGlow: 'rgba(94,231,255,0.6)' },
    dragon: { body: 'tube',   head: 'dragon', glow: 'rgba(255,130,40,0.45)',  headGlow: 'rgba(255,170,60,0.7)',  gloss: 0.2, deco: 'dragon', col: t => mix([255, 196, 72], [196, 44, 36], t) },
    bug:    { body: 'beads',  head: 'bug',    glow: 'rgba(255,122,217,0.36)', headGlow: 'rgba(255,160,230,0.6)' },
    galaxy: { body: 'nebula', head: 'galaxy', glow: 'rgba(140,110,255,0.45)', headGlow: 'rgba(199,166,255,0.7)' },
  };
  const lookOf = id => LOOKS[id] || LOOKS.neon;

  // 스프라이트: 칸 크기별로 한 번 그려 두고 찍기만 한다. 선명하게 2배로 그린다
  const SPR = 2;
  const sprCache = {};
  function sprite(key, px, paint) {
    let c = sprCache[key];
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = Math.max(4, Math.ceil(px * SPR));
      const g = c.getContext('2d');
      g.scale(SPR, SPR);
      paint(g, px);
      sprCache[key] = c;
    }
    return c;
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  }
  // 로봇 마디: 은빛 둥근 네모 판. 짝수는 가운데 청록 불빛, 홀수는 네 귀퉁이 나사
  function plateSprite(c, odd) {
    const px = Math.round(c);
    return sprite('plate' + px + (odd ? 'b' : 'a'), px, (g, s) => {
      const m = s * 0.06, w = s - m * 2;
      const gr = g.createLinearGradient(0, m, 0, s - m);
      gr.addColorStop(0, odd ? '#dfe8f2' : '#f2f7fc'); gr.addColorStop(0.5, odd ? '#9aa9bb' : '#b7c4d3'); gr.addColorStop(1, '#5d6b7e');
      rrect(g, m, m, w, w, s * 0.22); g.fillStyle = gr; g.fill();
      g.lineWidth = Math.max(1, s * 0.05); g.strokeStyle = '#2b3645'; g.stroke();
      rrect(g, m + s * 0.12, m + s * 0.12, w - s * 0.24, w - s * 0.24, s * 0.14);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
      if (odd) {
        g.fillStyle = '#3a4656';
        for (const [x, y] of [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]]) { g.beginPath(); g.arc(s * x, s * y, s * 0.055, 0, TAU); g.fill(); }
      } else {
        const lg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.26);
        lg.addColorStop(0, '#e9fdff'); lg.addColorStop(0.35, '#5ee7ff'); lg.addColorStop(1, 'rgba(94,231,255,0)');
        g.fillStyle = lg; g.fillRect(0, 0, s, s);
      }
    });
  }
  // 애벌레 구슬 마디: 색(hue 칸)마다 광택 구슬
  const BUG_HUES = 18;
  function beadSprite(c, k) {
    const px = Math.round(c);
    return sprite('bead' + px + '_' + k, px, (g, s) => {
      const h = k * (360 / BUG_HUES), r = s / 2;
      const gr = g.createRadialGradient(r * 0.72, r * 0.62, r * 0.08, r, r, r);
      gr.addColorStop(0, 'hsl(' + h + ',100%,88%)'); gr.addColorStop(0.45, 'hsl(' + h + ',95%,62%)'); gr.addColorStop(1, 'hsl(' + h + ',80%,34%)');
      g.fillStyle = gr; g.beginPath(); g.arc(r, r, r * 0.96, 0, TAU); g.fill();
      g.strokeStyle = 'hsla(' + h + ',80%,22%,0.8)'; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
      // 가운데 띠 (마디 무늬)
      g.strokeStyle = 'hsla(' + h + ',100%,90%,0.45)'; g.lineWidth = Math.max(1, s * 0.05);
      g.beginPath(); g.arc(r, r, r * 0.62, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    });
  }

  // 네온 뱀 마디 구슬: 머리 0 → 꼬리 1 색을 NEON_STEPS 단계로 미리 그려 둔다
  const NEON_STEPS = 12;
  function neonBeadSprite(c, k, col) {
    const px = Math.round(c);
    return sprite('neonbead' + px + '_' + k, px, (g, s) => {
      const q = col(k / (NEON_STEPS - 1)), r = s / 2;
      const gr = g.createRadialGradient(r * 0.65, r * 0.6, r * 0.08, r, r, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.38, rgb(q)); gr.addColorStop(1, rgb(mix(q, [8, 18, 60], 0.5)));
      g.fillStyle = gr; g.beginPath(); g.arc(r, r, r * 0.95, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(210,250,255,0.75)'; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
    });
  }
  function paintNeonBeads(ctx, pts, c, lk) {
    const n = pts.length;
    for (let i = n - 1; i >= 1; i--) {
      const t = i / Math.max(1, n - 1), r = c * (0.42 - 0.12 * t);
      const k = Math.round(t * (NEON_STEPS - 1));
      ctx.drawImage(neonBeadSprite(c, k, lk.col), pts[i].x - r, pts[i].y - r, r * 2, r * 2);
    }
  }

  // 작은 네 갈래 반짝이
  function sparkle(ctx, x, y, r) {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25);
    ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25);
    ctx.closePath();
  }

  // 마디마다 머리 쪽을 향한 방향 (다리·날개·지느러미·불꽃용). 떨어진 마디는 앞 마디 방향을 쓴다
  let dirBuf = [];
  function segDirs(pts, far, d0) {
    const n = pts.length;
    if (dirBuf.length < n) dirBuf = new Array(n);
    dirBuf[0] = d0;
    for (let i = 1; i < n; i++) {
      let dx = 0, dy = 0;
      if (!far(i)) { dx = pts[i - 1].x - pts[i].x; dy = pts[i - 1].y - pts[i].y; }
      const L = Math.hypot(dx, dy);
      dirBuf[i] = L > 0.01 ? [dx / L, dy / L] : dirBuf[i - 1];
    }
    return dirBuf;
  }

  function bodyPath(ctx, pts, far) {
    const n = pts.length;
    ctx.beginPath();
    ctx.moveTo(pts[n - 1].x, pts[n - 1].y);
    for (let i = n - 2; i >= 0; i--) { if (far(i + 1)) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y); }
  }
  // 매끈한 관 (네온 뱀·꼬마 용). 죽으면 붉게
  function paintTube(ctx, pts, far, c, lk, tm, dead) {
    const n = pts.length;
    ctx.strokeStyle = 'rgba(0,4,12,0.55)';
    ctx.lineWidth = c * 0.86;
    bodyPath(ctx, pts, far); ctx.stroke();
    for (let i = n - 1; i >= 1; i--) {
      if (far(i)) continue;
      const t = i / Math.max(1, n - 1);
      const q = lk.col(t, i, tm);
      ctx.strokeStyle = dead ? rgb([Math.round(q[0] * 0.5 + 128), Math.round(q[1] * 0.35), Math.round(q[2] * 0.45)]) : rgb(q);
      ctx.lineWidth = c * (0.74 - 0.26 * t);
      ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,' + (dead ? 0.22 : lk.gloss) + ')';
    ctx.lineWidth = Math.max(1, c * 0.12);
    bodyPath(ctx, pts, far); ctx.stroke();
  }

  // 꼬마 용: 등 가시 · 날개 한 쌍 · 꼬리 불꽃
  function paintDragonDeco(ctx, pts, far, c, tm, dirs, calm) {
    const n = pts.length;
    // 비늘: 마디마다 꼬리 쪽으로 둥글게 휜 줄
    ctx.strokeStyle = 'rgba(110,18,8,0.5)'; ctx.lineWidth = Math.max(1, c * 0.07);
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1), s = c * (1 - 0.35 * t), [ux, uy] = dirs[i], p = pts[i];
      const a0 = Math.atan2(-uy, -ux), cx = p.x + ux * s * 0.2, cy = p.y + uy * s * 0.2;
      ctx.moveTo(cx + Math.cos(a0 - 0.95) * s * 0.3, cy + Math.sin(a0 - 0.95) * s * 0.3);
      ctx.arc(cx, cy, s * 0.3, a0 - 0.95, a0 + 0.95);
    }
    ctx.stroke();
    // 옆 가시: 두 마디마다 양옆으로 뒤를 향한 작은 가시
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    for (let i = 3; i < n - 1; i += 2) {
      const t = i / (n - 1), s = c * (1 - 0.45 * t), [ux, uy] = dirs[i], px = -uy, py = ux, p = pts[i];
      for (const sd of [1, -1]) {
        const bx = p.x + px * sd * s * 0.3, by = p.y + py * sd * s * 0.3;
        ctx.moveTo(bx + ux * s * 0.14, by + uy * s * 0.14);
        ctx.lineTo(bx + px * sd * s * 0.26 - ux * s * 0.2, by + py * sd * s * 0.26 - uy * s * 0.2);
        ctx.lineTo(bx - ux * s * 0.16, by - uy * s * 0.16);
        ctx.closePath();
      }
    }
    ctx.fill();
    // 날개: 머리 뒤 두 번째 마디에서 양옆으로 (천천히 파닥)
    if (n > 3) {
      const k = 2, p = pts[k], [ux, uy] = dirs[k], px = -uy, py = ux;
      const flap = calm ? 1 : 0.82 + 0.18 * Math.sin(tm * 7);
      for (const sd of [1, -1]) {
        const ox = px * sd, oy = py * sd;
        const tipX = p.x + ox * c * 1.05 * flap - ux * c * 0.45, tipY = p.y + oy * c * 1.05 * flap - uy * c * 0.45;
        ctx.beginPath();
        ctx.moveTo(p.x + ox * c * 0.25 + ux * c * 0.3, p.y + oy * c * 0.25 + uy * c * 0.3);
        ctx.quadraticCurveTo(p.x + ox * c * 0.9 * flap + ux * c * 0.25, p.y + oy * c * 0.9 * flap + uy * c * 0.25, tipX, tipY);
        ctx.quadraticCurveTo(p.x + ox * c * 0.55 * flap - ux * c * 0.35, p.y + oy * c * 0.55 * flap - uy * c * 0.35, p.x + ox * c * 0.22 - ux * c * 0.55, p.y + oy * c * 0.22 - uy * c * 0.55);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,110,60,0.82)'; ctx.fill();
        ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = Math.max(1, c * 0.06); ctx.stroke();
        // 날개 뼈
        ctx.beginPath(); ctx.moveTo(p.x + ox * c * 0.25, p.y + oy * c * 0.25); ctx.lineTo(tipX, tipY); ctx.stroke();
      }
    }
    // 꼬리 불꽃: 꼬리 끝에서 뒤로 (살랑살랑)
    const t = pts[n - 1], [ux, uy] = dirs[n - 1], px = -uy, py = ux;
    const fl = calm ? 1 : 0.85 + 0.15 * Math.sin(tm * 17) + 0.08 * Math.sin(tm * 29);
    glow(ctx, 'rgba(255,140,40,0.8)', t.x - ux * c * 0.4, t.y - uy * c * 0.4, c * 0.9, 0.8);
    for (const [len, wid, col] of [[0.95, 0.3, '#ff5a1f'], [0.6, 0.17, '#ffe66d']]) {
      const L = c * len * fl, Wd = c * wid;
      ctx.beginPath();
      ctx.moveTo(t.x + px * Wd, t.y + py * Wd);
      ctx.quadraticCurveTo(t.x - ux * L * 0.5 + px * Wd * 1.1, t.y - uy * L * 0.5 + py * Wd * 1.1, t.x - ux * L, t.y - uy * L);
      ctx.quadraticCurveTo(t.x - ux * L * 0.5 - px * Wd * 1.1, t.y - uy * L * 0.5 - py * Wd * 1.1, t.x - px * Wd, t.y - py * Wd);
      ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    }
  }

  // 로봇 뱀: 전선 위에 은빛 쇠 마디
  function paintPlates(ctx, pts, far, c) {
    const n = pts.length;
    ctx.strokeStyle = '#2b3645'; ctx.lineWidth = c * 0.46;
    bodyPath(ctx, pts, far); ctx.stroke();
    ctx.strokeStyle = 'rgba(94,231,255,0.7)'; ctx.lineWidth = Math.max(1, c * 0.08);
    bodyPath(ctx, pts, far); ctx.stroke();
    const sa = plateSprite(c, false), sb = plateSprite(c, true);
    for (let i = n - 1; i >= 1; i--) {
      const t = i / Math.max(1, n - 1), s = c * (0.84 - 0.24 * t);
      ctx.drawImage(i % 2 ? sb : sa, pts[i].x - s / 2, pts[i].y - s / 2, s, s);
    }
  }

  // 무지개 애벌레: 짧은 다리 + 무지개 구슬 마디 (색이 머리에서 꼬리로 천천히 흐른다)
  function paintBeads(ctx, pts, c, tm, dirs, calm) {
    const n = pts.length;
    ctx.strokeStyle = 'rgba(255,214,240,0.8)'; ctx.lineWidth = Math.max(1.5, c * 0.09); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const t = i / Math.max(1, n - 1), s = c * (1 - 0.3 * t), [ux, uy] = dirs[i], px = -uy, py = ux, p = pts[i];
      const wig = calm ? 0 : Math.sin(tm * 12 + i * 1.3) * s * 0.12;
      for (const sd of [1, -1]) {
        ctx.moveTo(p.x + px * sd * s * 0.3, p.y + py * sd * s * 0.3);
        ctx.lineTo(p.x + px * sd * s * 0.6 + ux * wig * sd, p.y + py * sd * s * 0.6 + uy * wig * sd);
      }
    }
    ctx.stroke();
    const shift = calm ? 0 : tm * 50;
    for (let i = n - 1; i >= 1; i--) {
      const t = i / Math.max(1, n - 1), r = c * (0.5 - 0.13 * t);
      const k = Math.floor((((i * 26 + shift) % 360) + 360) % 360 / (360 / BUG_HUES)) % BUG_HUES;
      ctx.drawImage(beadSprite(c, k), pts[i].x - r, pts[i].y - r, r * 2, r * 2);
    }
  }

  // 은하 해룡: 속이 비치는 짙은 몸 + 잎 지느러미 + 몸속 별
  function paintNebula(ctx, pts, far, c, tm, dirs, calm) {
    const n = pts.length;
    // 잎 지느러미 (세 마디마다)
    ctx.fillStyle = 'rgba(199,166,255,0.32)'; ctx.strokeStyle = 'rgba(225,210,255,0.65)'; ctx.lineWidth = Math.max(1, c * 0.05);
    ctx.beginPath();
    for (let i = 3; i < n - 1; i += 3) {
      const t = i / (n - 1), s = c * (1 - 0.35 * t), [ux, uy] = dirs[i], px = -uy, py = ux, p = pts[i];
      const sway = calm ? 1 : 0.9 + 0.1 * Math.sin(tm * 4 + i);
      for (const sd of [1, -1]) {
        ctx.moveTo(p.x + px * sd * s * 0.28 + ux * s * 0.2, p.y + py * sd * s * 0.28 + uy * s * 0.2);
        ctx.quadraticCurveTo(p.x + px * sd * s * 0.8 * sway, p.y + py * sd * s * 0.8 * sway, p.x + px * sd * s * 0.62 * sway - ux * s * 0.5, p.y + py * sd * s * 0.62 * sway - uy * s * 0.5);
        ctx.lineTo(p.x + px * sd * s * 0.26 - ux * s * 0.3, p.y + py * sd * s * 0.26 - uy * s * 0.3);
        ctx.closePath();
      }
    }
    ctx.fill(); ctx.stroke();
    // 바깥 빛 테두리 → 짙은 몸 → 가운데 은하수 줄
    ctx.strokeStyle = 'rgba(170,130,255,0.55)'; ctx.lineWidth = c * 0.84;
    bodyPath(ctx, pts, far); ctx.stroke();
    for (let i = n - 1; i >= 1; i--) {
      if (far(i)) continue;
      const t = i / Math.max(1, n - 1);
      ctx.strokeStyle = rgb(mix([52, 34, 150], [16, 22, 70], t));
      ctx.lineWidth = c * (0.7 - 0.24 * t);
      ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,220,255,0.22)'; ctx.lineWidth = c * 0.22;
    bodyPath(ctx, pts, far); ctx.stroke();
    // 몸속 별: 세 무리로 나눠 번갈아 반짝
    const a0 = ctx.globalAlpha;
    for (let grp = 0; grp < 3; grp++) {
      ctx.globalAlpha = a0 * (calm ? 0.85 : 0.45 + 0.55 * Math.abs(Math.sin(tm * 2.4 + grp * 2.1)));
      ctx.fillStyle = grp === 1 ? '#ffe9a8' : '#ffffff';
      ctx.beginPath();
      for (let i = 1 + grp; i < n; i += 3) {
        const t = i / (n - 1), s = c * (1 - 0.35 * t), [ux, uy] = dirs[i], p = pts[i];
        const off = (((i * 37) % 7) - 3) / 12 * s, along = (((i * 53) % 5) - 2) / 10 * s;
        sparkle(ctx, p.x - uy * off + ux * along, p.y + ux * off + uy * along, s * (0.1 + ((i * 11) % 3) * 0.03));
      }
      ctx.fill();
    }
    ctx.globalAlpha = a0;
  }

  // 몸 그리기. pts: 화면 좌표(머리가 0), far(i): i와 i-1 사이를 잇지 않을지, tm: 시간(움직임 줄이기면 0), d0: 머리 방향
  function paintBody(ctx, pts, far, c, lk, tm, dead, d0, calm) {
    const n = pts.length;
    // 바닥 발광 (미리 그린 스프라이트를 겹쳐 찍기)
    ctx.globalCompositeOperation = 'lighter';
    const gr = c * 1.05, step = n > 120 ? 2 : 1;
    for (let i = n - 1; i >= 0; i -= step) glow(ctx, dead ? 'rgba(255,77,109,0.5)' : lk.glow, pts[i].x, pts[i].y, gr, 0.42 * (1 - i / n * 0.6));
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const dirs = lk.body === 'tube' && !lk.deco ? null : segDirs(pts, far, d0 || [1, 0]);
    if (lk.body === 'plates') paintPlates(ctx, pts, far, c);
    else if (lk.body === 'beads') paintBeads(ctx, pts, c, tm, dirs, calm);
    else if (lk.body === 'nebula') paintNebula(ctx, pts, far, c, tm, dirs, calm);
    else paintTube(ctx, pts, far, c, lk, tm, dead);
    if (lk.head === 'neon' && !dead) paintNeonBeads(ctx, pts, c, lk);
    if (lk.deco === 'dragon' && !dead) paintDragonDeco(ctx, pts, far, c, tm, dirs, calm);
    // 부딪혔다: 모양은 두고 붉게 덮는다 (네온 관은 이미 붉게 그렸다)
    if (dead && lk.body !== 'tube') {
      ctx.strokeStyle = 'rgba(255,60,85,0.5)'; ctx.lineWidth = c * 0.8;
      bodyPath(ctx, pts, far); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // 머리를 가는 방향으로 돌린다 (앞 = +x). 왼쪽은 뒤집기만 해서 위아래가 거꾸로 되지 않게
  function faceTo(ctx, h, d) {
    ctx.translate(h.x, h.y);
    if (d[0] < 0) ctx.scale(-1, 1);
    else if (d[1] < 0) ctx.rotate(-Math.PI / 2);
    else if (d[1] > 0) ctx.rotate(Math.PI / 2);
  }

  // 머리. 네온 뱀은 광택 청록 머리에 눈·웃는 입·노란 코, 길이 숫자는 머리 바로 뒤 첫 마디(neck)에 쓴다
  function paintHead(ctx, h, d, c, lk, tm, dead, txt, dbl, neck) {
    if (dbl) glow(ctx, 'rgba(255,230,109,0.8)', h.x, h.y, c * 2.2, 0.7);
    glow(ctx, dead ? 'rgba(255,77,109,0.8)' : lk.headGlow, h.x, h.y, c * 1.5, 0.9);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (lk.head === 'neon') {
      if (neck) {
        ctx.fillStyle = '#07080d';
        ctx.font = '700 ' + Math.round(c * (txt.length > 2 ? 0.34 : 0.44)) + 'px ' + NUM;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, neck.x, neck.y + c * 0.03);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.save();
      faceTo(ctx, h, d);
      ctx.scale(c, c);
      ctx.fillStyle = '#ffe66d'; rrect(ctx, 0.36, -0.1, 0.3, 0.2, 0.09); ctx.fill();
      const g = ctx.createRadialGradient(-0.14, -0.18, 0.04, 0, 0, 0.56);
      g.addColorStop(0, dead ? '#ffd6dc' : '#e6fdff'); g.addColorStop(0.45, dead ? '#ff4d6d' : '#5ee7ff'); g.addColorStop(1, dead ? '#8a1020' : '#1f5fd0');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.54, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(6,30,70,0.8)'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-0.2, -0.26, 0.14, 0.08, -0.5, 0, TAU); ctx.fill();
      for (const s of [1, -1]) {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0.16, s * 0.21, 0.13, 0.12, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#062036'; ctx.beginPath(); ctx.arc(0.21, s * 0.21, 0.07, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0.235, s * 0.21 - 0.03, 0.025, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#06324d'; ctx.lineWidth = 0.045;
      ctx.beginPath(); ctx.arc(0.3, 0, 0.1, -0.9, 0.9); ctx.stroke();
      ctx.restore();
      ctx.lineCap = 'butt';
      return;
    }
    ctx.save();
    faceTo(ctx, h, d);
    ctx.scale(c, c);   // 여기부터 칸 = 1
    ctx.lineWidth = 0.06;
    if (lk.head === 'robot') {
      // 안테나 · 둥근 네모 투구 · 앞쪽 눈 가리개(청록 불빛 줄)
      ctx.strokeStyle = '#9aa9bb'; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.moveTo(-0.2, -0.36); ctx.lineTo(-0.38, -0.7); ctx.stroke();
      ctx.fillStyle = '#ff5ec8'; ctx.beginPath(); ctx.arc(-0.38, -0.72, 0.1, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(0, -0.46, 0, 0.46);
      g.addColorStop(0, '#f4f8fc'); g.addColorStop(0.55, '#aebccb'); g.addColorStop(1, '#5d6b7e');
      rrect(ctx, -0.48, -0.46, 0.94, 0.92, 0.24); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#2b3645'; ctx.lineWidth = 0.06; ctx.stroke();
      rrect(ctx, -0.02, -0.36, 0.42, 0.72, 0.14); ctx.fillStyle = '#0a1826'; ctx.fill();
      ctx.fillStyle = dead ? '#ff4d6d' : '#5ee7ff';
      rrect(ctx, 0.14, -0.26, 0.12, 0.52, 0.05); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(0.17, -0.2, 0.04, 0.14);
      ctx.fillStyle = '#3a4656';
      for (const y of [-0.28, 0.28]) { ctx.beginPath(); ctx.arc(-0.3, y, 0.06, 0, TAU); ctx.fill(); }
    } else if (lk.head === 'dragon') {
      // 뒤로 휜 뿔 두 개 · 둥근 주둥이 · 가는 눈 · 콧구멍
      for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(-0.08, s * 0.28);
        ctx.quadraticCurveTo(-0.45, s * 0.46, -0.78, s * 0.66);
        ctx.quadraticCurveTo(-0.5, s * 0.3, -0.34, s * 0.12);
        ctx.closePath();
        ctx.fillStyle = '#fff0c8'; ctx.fill();
        ctx.strokeStyle = '#b8743a'; ctx.lineWidth = 0.04; ctx.stroke();
      }
      const g = ctx.createRadialGradient(-0.1, -0.15, 0.05, 0, 0, 0.6);
      g.addColorStop(0, '#ffd27a'); g.addColorStop(0.6, '#ff8c3a'); g.addColorStop(1, '#c8401f');
      ctx.fillStyle = dead ? '#ff4d6d' : g;
      ctx.beginPath(); ctx.ellipse(-0.06, 0, 0.48, 0.42, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.3, 0, 0.3, 0.28, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff27a';
      for (const s of [1, -1]) { ctx.beginPath(); ctx.ellipse(0.08, s * 0.2, 0.11, 0.065, s * 0.35, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#3a0d05';
      for (const s of [1, -1]) {
        ctx.beginPath(); ctx.ellipse(0.1, s * 0.2, 0.025, 0.055, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0.5, s * 0.1, 0.035, 0, TAU); ctx.fill();
      }
    } else if (lk.head === 'bug') {
      // 앞으로 뻗은 더듬이 두 개(끝에 노란 구슬) · 광택 둥근 머리 · 작은 눈
      ctx.strokeStyle = '#ffd6f0'; ctx.lineWidth = 0.07;
      const wig = tm ? Math.sin(tm * 6) * 0.06 : 0;
      for (const s of [1, -1]) {
        ctx.beginPath(); ctx.moveTo(0.18, s * 0.26);
        ctx.quadraticCurveTo(0.45, s * (0.3 + wig), 0.62, s * (0.66 + wig)); ctx.stroke();
        ctx.fillStyle = '#ffe66d'; ctx.beginPath(); ctx.arc(0.62, s * (0.66 + wig), 0.1, 0, TAU); ctx.fill();
      }
      const g = ctx.createRadialGradient(-0.14, -0.16, 0.05, 0, 0, 0.52);
      g.addColorStop(0, '#ffd6f4'); g.addColorStop(0.5, '#ff5ec8'); g.addColorStop(1, '#a3137a');
      ctx.fillStyle = dead ? '#ff4d6d' : g;
      ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(80,0,50,0.7)'; ctx.lineWidth = 0.05; ctx.stroke();
      for (const s of [1, -1]) {
        ctx.fillStyle = '#1a0614'; ctx.beginPath(); ctx.arc(0.24, s * 0.18, 0.075, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0.26, s * 0.18 - 0.025, 0.025, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#5a0a40'; ctx.lineWidth = 0.045;
      ctx.beginPath(); ctx.arc(0.3, 0, 0.12, -0.9, 0.9); ctx.stroke();
    } else if (lk.head === 'galaxy') {
      // 잎 모양 볏 · 속이 비치는 짙은 머리 · 청록 눈 (왕관은 아래에서 화면 위쪽으로)
      ctx.fillStyle = 'rgba(199,166,255,0.45)'; ctx.strokeStyle = 'rgba(225,210,255,0.8)'; ctx.lineWidth = 0.04;
      for (const s of [1, -1]) {
        ctx.beginPath(); ctx.moveTo(-0.1, s * 0.3);
        ctx.quadraticCurveTo(-0.3, s * 0.85, -0.7, s * 0.58);
        ctx.lineTo(-0.36, s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      const g = ctx.createRadialGradient(0.05, -0.1, 0.05, 0, 0, 0.55);
      g.addColorStop(0, '#6a4ee0'); g.addColorStop(1, '#1c1660');
      ctx.fillStyle = dead ? '#ff4d6d' : g;
      ctx.beginPath(); ctx.ellipse(0.04, 0, 0.52, 0.44, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c7a6ff'; ctx.lineWidth = 0.07; ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); sparkle(ctx, -0.22, 0.1, 0.1); sparkle(ctx, -0.05, -0.2, 0.07); ctx.fill();
      ctx.fillStyle = '#8ff6ff';
      for (const s of [1, -1]) { ctx.beginPath(); ctx.ellipse(0.26, s * 0.17, 0.08, 0.05, 0, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    if (lk.head === 'galaxy') paintCrown(ctx, h.x, h.y - c * 0.36, c);
    ctx.lineCap = 'butt';
  }

  // 금빛 왕관: 언제나 화면 위쪽을 향한다 (보석 셋)
  function paintCrown(ctx, x, y, c) {
    const w = c * 0.72, hh = c * 0.46;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -hh * 0.55); ctx.lineTo(-w / 4, -hh * 0.2); ctx.lineTo(0, -hh);
    ctx.lineTo(w / 4, -hh * 0.2); ctx.lineTo(w / 2, -hh * 0.55); ctx.lineTo(w / 2, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, -hh, 0, 0);
    g.addColorStop(0, '#fff4c2'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#c08a00');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#7a5200'; ctx.lineWidth = Math.max(1, c * 0.04); ctx.stroke();
    ctx.fillStyle = '#ff5ec8'; ctx.beginPath(); ctx.arc(0, -hh * 0.3, c * 0.06, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5ee7ff';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * w * 0.3, -hh * 0.18, c * 0.045, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

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
    const lk = lookOf(v.char || v.skin), tm = v.calm ? 0 : W.t, d = SN.World.DIRS[W.dir];
    // 포털·벽 넘기로 떨어진 마디 사이는 잇지 않는다
    const far = i => Math.abs(S[i].x - S[i - 1].x) + Math.abs(S[i].y - S[i - 1].y) > 1;
    // 거대 뱀: 몸이 굵고 금빛으로 빛난다 (끝나기 1초 전부터 깜빡, 움직임 줄이기면 그대로)
    const giant = W.eff && W.eff.giant > 0, gk = giant ? 1.7 : 1;
    if (giant) {
      const on = W.eff.giant > 1 || v.calm || Math.floor(W.t * 10) % 2;
      if (on) { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < n; i += 2) glow(ctx, 'rgba(255,220,90,0.6)', pts[i].x, pts[i].y, c * 1.9, 0.8); ctx.globalCompositeOperation = 'source-over'; }
    }
    paintBody(ctx, pts, far, c * gk, lk, tm, dead, d, v.calm);
    if (ghost) ctx.globalAlpha = 0.45 + (v.calm ? 0 : Math.sin(W.t * 12) * 0.12);
    paintHead(ctx, pts[0], d, c * gk, lk, tm, dead, String(n), W.eff && W.eff.double > 0, n > 1 && !far(1) ? pts[1] : null);
    ctx.globalAlpha = 1;
  }

  // ─── 라이벌 뱀 ─────────────────────────────────────────────
  const RIVAL_LOOK = { body: 'tube', glow: 'rgba(255,138,31,0.4)', headGlow: 'rgba(255,150,60,0.7)', gloss: 0.2,
    col: (t, i) => (i % 2 ? [255, 138, 31] : [139, 77, 255]) };
  // 머리: 주황 공에 보라 가면(눈구멍 둘), 이마에 작은 보라 뿔 둘. 멈칫하면 머리 위로 별이 돈다
  function paintRivalHead(ctx, h, d, c, tm, dizzy) {
    glow(ctx, RIVAL_LOOK.headGlow, h.x, h.y, c * 1.5, 0.9);
    ctx.save();
    faceTo(ctx, h, d);
    ctx.scale(c, c);
    ctx.fillStyle = '#6a2fd6';
    for (const s of [1, -1]) {
      ctx.beginPath(); ctx.moveTo(-0.1, s * 0.3); ctx.lineTo(-0.42, s * 0.62); ctx.lineTo(-0.3, s * 0.22); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createRadialGradient(-0.12, -0.14, 0.05, 0, 0, 0.55);
    g.addColorStop(0, '#ffd08a'); g.addColorStop(0.55, RIVAL_ORANGE); g.addColorStop(1, '#b8500a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5a2400'; ctx.lineWidth = 0.05; ctx.stroke();
    // 가면 띠
    ctx.fillStyle = '#4a1fa8';
    rrect(ctx, 0.02, -0.44, 0.3, 0.88, 0.12); ctx.fill();
    for (const s of [1, -1]) {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0.18, s * 0.2, 0.1, 0.085, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a0630';
      if (dizzy) { ctx.strokeStyle = '#1a0630'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(0.12, s * 0.2 - 0.05); ctx.lineTo(0.24, s * 0.2 + 0.05); ctx.moveTo(0.24, s * 0.2 - 0.05); ctx.lineTo(0.12, s * 0.2 + 0.05); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(0.22, s * 0.2, 0.045, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    if (dizzy) {
      // 어질어질 별 셋 (움직임 줄이기면 멈춘 채로)
      const r = c * 0.5, a0 = tm * 5;
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const a = a0 + k * TAU / 3; sparkle(ctx, h.x + Math.cos(a) * r, h.y - c * 0.62 + Math.sin(a) * r * 0.35, c * 0.16); }
      ctx.fill();
    }
  }
  function drawRival(ctx, W, v) {
    const V = W.rival;
    if (!V || !(V.phase === 'warn' || V.phase === 'play') || !V.body.length) return;
    const B = V.body, P = V.prev, n = B.length, c = v.cell;
    const a = W.phase === 'play' && V.phase === 'play' ? V.alpha : 0;
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = B[i];
      let q = P[i] || s;
      if (Math.abs(q.x - s.x) + Math.abs(q.y - s.y) > 1) q = s;
      pts[i] = { x: v.bx + (q.x + (s.x - q.x) * a + 0.5) * c, y: v.by + (q.y + (s.y - q.y) * a + 0.5) * c };
    }
    const tm = v.calm ? 0 : W.t, dizzy = V.stun > 0 && V.phase === 'play';
    // 나오기 전 예고: 깜빡이는 반투명 (부딪혀도 괜찮은 때)
    if (V.phase === 'warn') ctx.globalAlpha = v.calm ? 0.4 : 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(W.t * 14));
    else if (dizzy) ctx.globalAlpha = 0.8;
    const far = i => Math.abs(B[i].x - B[i - 1].x) + Math.abs(B[i].y - B[i - 1].y) > 1;
    const d = SN.World.DIRS[V.dir];
    // 대왕 뱀: 마디가 더 크고 머리에 금빛 왕관 (규칙은 한 칸 그대로)
    const bc = V.boss ? c * D.BOSS.cellMul : c;
    paintBody(ctx, pts, far, bc, RIVAL_LOOK, tm, false, d, v.calm);
    paintRivalHead(ctx, pts[0], d, bc, tm, dizzy);
    if (V.boss) paintCrown(ctx, pts[0].x, pts[0].y - bc * 0.55, bc * 0.9);
    ctx.globalAlpha = 1;
    R.rivalHead = pts[0];
  }
  // 이름표: 예고 중과 나온 뒤 몇 초, 멈칫할 때 (내 뱀 위에 그려 가려지지 않게)
  function drawRivalTag(ctx, W, v) {
    const V = W.rival;
    if (!V || !(V.phase === 'warn' || V.phase === 'play') || !V.body.length || !R.rivalHead) return;
    const c = v.cell, dizzy = V.stun > 0 && V.phase === 'play', pts = [R.rivalHead];
    if (V.phase === 'warn' || dizzy || W.time - (V.shownAt || 0) < 3) {
      const fs = Math.round(Math.max(13, Math.min(22, c * 0.52)));
      ctx.font = fs + 'px ' + DISP;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const nm = V.boss ? D.BOSS.name : '라이벌';
      const txt = V.phase === 'warn' ? nm + ' 등장!' : dizzy ? '멈칫!' : nm;
      const tx = Math.max(v.bx + fs * 2.5, Math.min(v.bx + v.bw - fs * 2.5, pts[0].x));
      let ty = pts[0].y - c * (dizzy ? 1.35 : 1.05) - (V.boss ? c * 0.6 : 0);
      if (ty - fs < v.by) ty = pts[0].y + c * 1.1;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.9)'; ctx.strokeText(txt, tx, ty);
      ctx.fillStyle = '#ffb35c'; ctx.fillText(txt, tx, ty);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // 캐릭터 미리보기: 작은 캔버스에 짧은 뱀 (칸 7×3, 머리가 오른쪽). 상점 카드·시작 화면 카드
  const PREVIEW = [[5, 0], [4, 0], [3, 0], [3, 1], [2, 1], [1, 1], [0, 1]];
  function drawCharPreview(cv, id, tm) {
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const c = Math.min(cv.width / 7.2, cv.height / 2.9);
    const ox = (cv.width - c * 6) / 2 + c * 0.3, oy = (cv.height - c * 2) / 2 + c * 0.15;
    const pts = PREVIEW.map(([x, y]) => ({ x: ox + (x + 0.5) * c, y: oy + (y + 0.5) * c }));
    const lk = lookOf(id), t = tm == null ? 1.3 : tm;
    paintBody(g, pts, () => false, c, lk, t, false, [1, 0], true);
    paintHead(g, pts[0], [1, 0], c, lk, t, false, String(PREVIEW.length), false, pts[1]);
  }

  // ─── HUD: 위쪽 한 줄. 오른쪽 끝에 점수, 그 왼쪽에 작은 칸들 ─────
  // gauge(0~1)가 있으면 글자 오른쪽에 작은 막대 (피버 모으기 · 대왕 뱀 남은 몸)
  function chip(ctx, x, y, h, txt, color, s, gauge, gcol) {
    const gw = gauge != null ? 52 * s : 0;
    const w = ctx.measureText(txt).width + 16 * s + gw;
    ctx.fillStyle = 'rgba(12,16,26,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w, y, w, h, 6 * s); else ctx.rect(x - w, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94,231,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (gauge != null) {
      const bx = x - 8 * s - gw + 6 * s, bw = gw - 10 * s, bh = Math.max(5, h * 0.28), by = y + (h - bh) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = gcol || color; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, gauge)), bh);
    }
    ctx.fillStyle = color;
    ctx.fillText(txt, x - 8 * s - gw, y + h / 2 + 1);
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
    // 라이벌과 겨루기: 나 : 라이벌 먹은 구슬 (라이벌이 나온 뒤부터)
    if (W.rival && W.rival.met && !W.rival.boss) items.push(['나 ' + (W.eaten + (W.rivalCells || 0)) + ' : ' + W.rival.eaten + ' 라이벌', W.eaten + (W.rivalCells || 0) >= W.rival.eaten ? '#8ff6ff' : '#ffb35c', Math.round(15 * s) + 'px ' + DISP]);
    const KO = Math.round(15 * s) + 'px ' + DISP;
    // 피버: 도는 동안 남은 초, 모으는 동안은 작은 막대 (숫자 % 대신)
    if (W.feverT > 0) items.push(['피버 ' + Math.ceil(W.feverT), v.calm ? '#ffd84a' : 'hsl(' + ((W.t * 200) % 360) + ',100%,70%)', KO]);
    else if (W.fun && W.fever > 0.05) items.push(['피버', '#ff9ad5', KO, W.fever]);
    if (W.eff && W.eff.giant > 0) items.push(['거대 ' + Math.ceil(W.eff.giant), '#ffe66d', Math.round(15 * s) + 'px ' + DISP]);
    if (W.hard) items.push(['어려움', '#ff8a96', Math.round(15 * s) + 'px ' + DISP]);
    // 스테이지: "3단계 5/10", 대왕 뱀 단계는 남은 대왕 뱀 막대
    const bl = SN.World.bossLeft ? SN.World.bossLeft(W) : null;
    if (W.mode === 'stage' && bl != null) items.push([W.level + '단계 대왕 뱀', '#ffb35c', KO, bl, '#ff8a1f']);
    else if (W.mode === 'stage') items.push([W.level + '단계 ' + Math.min(W.got, W.goal) + '/' + W.goal, '#5ee7ff', KO]);
    if (W.fun && W.mult > 1 && W.time - W.lastEat <= (W.comboWindow || D.COMBO.window)) items.push(['콤보 ×' + W.mult, W.mult >= 3 ? '#ff9f43' : '#ffd6e8', KO]);
    if (W.eff) for (const k of ['double', 'slow', 'ghost']) if (W.eff[k] > 0) items.push([ITEM[k].glyph + ' ' + Math.ceil(W.eff[k]), ITEM[k].color]);
    items.push(['길이 ' + W.snake.length, '#ffe66d', KO], ['최고 ' + Math.max(v.best || 0, W.score).toLocaleString(), '#bcd3e2', KO]);
    if (v.w >= 1000 && W.mode !== 'stage') items.push([SN.fmtTime(W.time), '#8aa4b8']);   // 작은 탭은 칸을 줄인다
    const numFont = ctx.font;
    for (const [txt, col, font, gauge, gcol] of items) {
      ctx.font = font || numFont;
      const need = ctx.measureText(txt).width + (gauge != null ? 56 * s : 0) + 22 * s;
      if (x - need < v.hudLeft) break; // 버튼 묶음과 겹치면 생략
      x -= chip(ctx, x, cy, ch, txt, col, s, gauge, gcol) + 6 * s;
    }
    ctx.textBaseline = 'alphabetic';
    // 새 하늘 알림 ("화성 도착!"): 버튼 묶음과 칸들 사이 빈 곳에 (판을 가리지 않게). 알림(토스트)이 떠 있으면 쉰다
    if (SN.Space && !(v.toastUntil && performance.now() < v.toastUntil)) SN.Space.drawBanner(ctx, W, v, v.hudLeft, x);
  }

  // 출발 대기("준비")와 처음 몇 초 조작 안내
  function drawIntro(ctx, W, v) {
    const cx = v.bx + v.bw / 2, cy = v.by + v.bh * 0.3;
    // 스테이지: 레벨을 깼을 때 큰 글자, 레벨 시작 때 이름과 목표
    if (W.phase === 'clear') {
      const k = Math.min(1, W.clearT * 4), fs = Math.round(Math.min(72, v.bw / 7));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = k;
      glow(ctx, 'rgba(94,231,255,0.4)', cx, v.by + v.bh * 0.42, fs * 2, 0.9);
      ctx.font = Math.round(fs * 0.9) + 'px ' + DISP;
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(5,7,12,0.9)';
      ctx.strokeText(W.level + '단계 성공!', cx + (1 - k) * 40, v.by + v.bh * 0.34);
      ctx.fillStyle = '#e8f7ff';
      ctx.fillText(W.level + '단계 성공!', cx + (1 - k) * 40, v.by + v.bh * 0.34);
      // 별 (하나씩 톡톡 나타난다)
      const ls = W.lastStars, n = ls ? ls.stars : 1, sr = fs * 0.34;
      for (let i = 0; i < D.STARS.max; i++) {
        const sk = v.calm ? 1 : Math.max(0, Math.min(1, (W.clearT - 0.25 - i * 0.22) * 5));
        const sx = cx + (i - 1) * sr * 2.6, sy = v.by + v.bh * 0.34 + fs * 0.95;
        ctx.save(); ctx.translate(sx, sy); ctx.scale(sk || 0.001, sk || 0.001);
        ctx.fillStyle = i < n ? '#ffd23f' : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        for (let j = 0; j < 10; j++) { const r = j % 2 ? sr * 0.45 : sr, a = -Math.PI / 2 + j * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        if (i < n) { ctx.strokeStyle = '#fff4c2'; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.restore();
      }
      ctx.font = Math.round(fs * 0.34) + 'px ' + DISP;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.9)';
      const bt = '보너스 +' + (D.STAGE.clearBonus * W.level + (W.boss ? D.BOSS.bonus : 0)) + (n < 2 ? ' · 빨리 깨면 별이 더!' : n < 3 ? ' · 황금 구슬도 먹으면 별 셋!' : '');
      ctx.strokeText(bt, cx, v.by + v.bh * 0.34 + fs * 1.7);
      ctx.fillStyle = '#ffe66d';
      ctx.fillText(bt, cx, v.by + v.bh * 0.34 + fs * 1.7);
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
      return;
    }
    if (W.mode === 'stage' && W.wait > 0 && !W.justRevived) {
      const fs = Math.round(Math.min(56, v.bw / 9));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      glow(ctx, 'rgba(94,231,255,0.35)', cx, cy, fs * 1.8, 0.8);
      ctx.font = fs + 'px ' + DISP;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(5,7,12,0.9)';
      ctx.strokeText(W.level + '단계', cx, cy - fs * 0.2);
      ctx.fillStyle = '#e8f7ff';
      ctx.fillText(W.level + '단계', cx, cy - fs * 0.2);
      ctx.font = Math.round(fs * 0.42) + 'px ' + DISP;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.9)';
      const goalTxt = W.lv.name + ' · ' + (W.boss ? '대왕 뱀을 냠냠!' : '구슬 ' + W.goal + '개');
      ctx.strokeText(goalTxt, cx, cy + fs * 0.55);
      ctx.fillStyle = W.boss ? '#ffb35c' : '#5ee7ff';
      ctx.fillText(goalTxt, cx, cy + fs * 0.55);
      if (W.walls && W.walls.some(Boolean)) {
        const wt = '빨간 줄무늬 벽은 피해요!', ww = ctx.measureText(wt).width + fs * 0.8, wy = cy + fs * 1.85;
        ctx.fillStyle = 'rgba(30,4,10,0.9)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - ww / 2, wy - fs * 0.38, ww, fs * 0.76, fs * 0.2); else ctx.rect(cx - ww / 2, wy - fs * 0.38, ww, fs * 0.76);
        ctx.fill(); ctx.strokeStyle = '#ff3b4e'; ctx.lineWidth = 2; ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.9)';
        ctx.strokeText(wt, cx, cy + fs * 1.85);
        ctx.fillStyle = '#ff8a96'; ctx.fillText(wt, cx, cy + fs * 1.85);
      }
      if (W.easy) {
        const hint = v.touch ? '화면을 밀면 출발!' : '방향키를 누르면 출발!';
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
      ctx.font = fs + 'px ' + DISP;
      ctx.fillStyle = '#e8f7ff';
      glow(ctx, 'rgba(94,231,255,0.35)', cx, cy, fs * 1.6, 0.8);
      ctx.fillText(W.justRevived ? '한 번 더!' : '준비', cx, cy);
    }
    ctx.globalAlpha = W.easy && W.wait > 0 ? 0.75 + (v.calm ? 0 : Math.sin(W.t * 5) * 0.25) : hintA * 0.85;
    ctx.font = Math.round(Math.max(16, Math.min(26, v.cell * 0.7))) + 'px ' + DISP;
    ctx.fillStyle = '#bff8ff';
    const hint = W.easy && W.wait > 0 ? (v.touch ? '화면을 밀면 출발!' : '방향키를 누르면 출발!') : v.touch ? '화면 아무 데나 밀어서 방향 바꾸기' : '방향키 또는 WASD로 방향 바꾸기';
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
    drawBackground(ctx, W, v, dt);
    ctx.save();
    if (R.shake > 0) ctx.translate((Math.random() - 0.5) * R.shake, (Math.random() - 0.5) * R.shake);
    drawPortals(ctx, W, v);
    drawFood(ctx, W, v);
    drawBonus(ctx, W, v);
    drawItem(ctx, W, v);
    drawGift(ctx, W, v);
    drawRival(ctx, W, v);
    drawSnake(ctx, W, v);
    drawRivalTag(ctx, W, v);
    if (v.hud !== false) drawDanger(ctx, W, v);
    drawFx(ctx, v);
    drawFeverBorder(ctx, W, v);
    if (v.hud !== false) drawBanner(ctx, v, W);
    ctx.restore();
    if (R.flash > 0) {
      ctx.fillStyle = 'rgba(255,77,109,' + (R.flash * 0.7).toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
    // 느린 시계: 화면 가장자리가 푸르게
    if (W.eff && W.eff.slow > 0) { ctx.fillStyle = 'rgba(127,211,255,' + (0.06 + Math.min(1, W.eff.slow) * 0.05) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    if (v.hud !== false) { drawHud(ctx, W, v); drawIntro(ctx, W, v); drawSwipe(ctx, W, v); }
  }

  // 멈춘 화면처럼 입자가 남아 있는지 (다 사라지면 그리기를 쉰다)
  const busy = () => R.parts.length > 0 || R.shake > 0 || R.flash > 0 || !!R.banner || !!(SN.Space && SN.Space.busy());

  SN.Render = { draw, layout, busy, drawCharPreview, drawSkinPreview: drawCharPreview, CHAR_IDS: Object.keys(LOOKS) };
})(SN);
