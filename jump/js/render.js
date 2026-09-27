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
  // 높이 구역 배경 (D.ZONES): 1/4 해상도에 하늘 그라데이션 + 흐릿한 빛 덩어리 + 구역 소품 + 가장자리 어둡게.
  // 구역·화면 크기마다 한 번만 그리고, 넘어갈 때는 두 장을 섞어 찍는다
  function paintZone(Z, w, h) {
    const s = 0.25;
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * s)); c.height = Math.max(8, Math.round(h * s));
    const g = c.getContext('2d');
    g.scale(s, s);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, Z.sky[0]); sky.addColorStop(0.6, Z.sky[1]); sky.addColorStop(1, Z.sky[2]);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const rand = JP.rng(2718 + Z.from);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = rand() * w, y = h * (0.15 + rand() * 0.8), rad = Math.max(w, h) * (0.22 + rand() * 0.3);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, Z.glow[i % 2]);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.18 + rand() * 0.18;
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const puff = (x, y, r, col) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    };
    if (Z.id === 'sky') {
      // 노을 해: 아래쪽 가운데가 따뜻하게 빛난다
      puff(w * 0.5, h * 1.02, Math.max(w, h) * 0.55, 'rgba(255,170,90,0.55)');
      puff(w * 0.5, h * 1.02, Math.max(w, h) * 0.2, 'rgba(255,220,150,0.6)');
    } else if (Z.id === 'cloud') {
      // 발아래 구름 바다
      for (let i = 0; i < 16; i++) puff(rand() * w, h * (0.88 + rand() * 0.2), Math.max(w, h) * (0.08 + rand() * 0.1), 'rgba(235,245,255,0.45)');
    } else if (Z.id === 'stars') {
      // 별나라: 빛나는 은하 띠
      g.save(); g.translate(w / 2, h / 2); g.rotate(-0.5);
      const band = g.createLinearGradient(0, -h * 0.2, 0, h * 0.2);
      band.addColorStop(0, 'rgba(255,94,200,0)'); band.addColorStop(0.5, 'rgba(255,190,240,0.3)'); band.addColorStop(1, 'rgba(255,94,200,0)');
      g.fillStyle = band; g.fillRect(-w, -h * 0.2, w * 2, h * 0.4);
      g.restore();
      for (let i = 0; i < 6; i++) puff(rand() * w, rand() * h, Math.min(w, h) * (0.03 + rand() * 0.04), 'rgba(255,230,109,0.45)');
    }
    // 높은 하늘 · 대기권 끝(둥근 지구) · 행성별 덧그림 (sky.js)
    if (JP.Sky) JP.Sky.paintScene(g, Z, w, h, rand);
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    return c;
  }

  // 구름 층 (하늘·구름 위 구역): 반 해상도로 한 번 그려 두고 세로로 이어 붙여 천천히 흘린다
  function paintClouds(w, h) {
    const s = 0.5;
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * s)); c.height = Math.max(8, Math.round(h * s));
    const g = c.getContext('2d');
    g.scale(s, s);
    const rand = JP.rng(911);
    const n = Math.max(5, Math.round(9 * w / 1280));
    for (let i = 0; i < n; i++) {
      const cx = rand() * w, cy = rand() * h, sc = Math.max(w, h) * (0.03 + rand() * 0.03);
      for (let k = 0; k < 5; k++) {
        const x = cx + (k - 2) * sc * 0.9 + (rand() - 0.5) * sc * 0.4, y = cy + (rand() - 0.5) * sc * 0.4, r = sc * (0.8 + rand() * 0.5);
        for (const yy of [y - h, y, y + h]) {   // 위아래로 이어 붙여도 끊기지 않게
          const gr = g.createRadialGradient(x, yy, 0, x, yy, r);
          gr.addColorStop(0, 'rgba(255,245,240,0.32)'); gr.addColorStop(1, 'rgba(255,245,240,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, yy, r, 0, TAU); g.fill();
        }
      }
    }
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
    bg.addColorStop(0, 'rgba(6,12,24,0.42)');
    bg.addColorStop(1, 'rgba(3,7,14,0.6)');
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

  // 캐릭터 몸통 (캐릭터·반지름·배율별 한 번): 광택 네온 몸. 움직이는 부분(다리·귀·날개·불꽃·눈)은 그 위에 따로 그린다
  const bodyCache = {};
  const charOf = id => D.CHARS.find(k => k.id === id) || D.CHARS[0];
  function bodySprite(r, dpr, id) {
    const K = charOf(id);
    const key = r + '|' + dpr + '|' + K.id;
    let c = bodyCache[key];
    if (c) return c;
    const m = Math.ceil(r * 0.2) + 4, size = (r + m) * 2;
    c = document.createElement('canvas');
    c.width = c.height = Math.round(size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(r + m, r + m);
    // 몸 모양: 로봇·토끼·외계인은 공, 개구리는 옆으로 조금 넓게, 펭귄은 달걀
    const shape = () => {
      g.beginPath();
      if (K.look === 'frog') g.ellipse(0, r * 0.06, r * 1.1, r * 0.9, 0, 0, TAU);
      else if (K.look === 'penguin') g.ellipse(0, 0, r * 0.9, r * 1.08, 0, 0, TAU);
      else g.arc(0, 0, r, 0, TAU);
    };
    const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
    grad.addColorStop(0, K.body[0]); grad.addColorStop(0.35, K.body[1]); grad.addColorStop(1, K.body[2]);
    g.fillStyle = grad;
    shape(); g.fill();
    g.save(); shape(); g.clip();
    if (K.look === 'frog') {
      // 밝은 배
      const b = g.createLinearGradient(0, r * 0.1, 0, r);
      b.addColorStop(0, '#f6ffc8'); b.addColorStop(1, '#b8e65a');
      g.fillStyle = b;
      g.beginPath(); g.ellipse(0, r * 0.62, r * 0.7, r * 0.5, 0, 0, TAU); g.fill();
    } else if (K.look === 'penguin') {
      // 하얀 얼굴과 배 (턱시도)
      const b = g.createLinearGradient(0, -r * 0.6, 0, r);
      b.addColorStop(0, '#ffffff'); b.addColorStop(1, '#cfe0f5');
      g.fillStyle = b;
      g.beginPath();
      g.ellipse(0, r * 0.38, r * 0.6, r * 0.66, 0, 0, TAU);
      g.moveTo(-r * 0.02, -r * 0.3); g.arc(-r * 0.27, -r * 0.3, r * 0.3, 0, TAU);
      g.moveTo(r * 0.58, -r * 0.3); g.arc(r * 0.28, -r * 0.3, r * 0.3, 0, TAU);
      g.fill();
    } else if (K.look === 'alien') {
      // 밝은 점무늬
      g.fillStyle = 'rgba(255,220,255,0.35)';
      for (const [x, y, s] of [[-0.62, 0.42, 0.16], [0.58, 0.52, 0.12], [0.2, 0.78, 0.1], [-0.2, 0.7, 0.08]]) { g.beginPath(); g.arc(x * r, y * r, s * r, 0, TAU); g.fill(); }
    } else if (K.look === 'rabbit') {
      // 볼 분홍
      g.fillStyle = 'rgba(255,120,170,0.35)';
      for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * r * 0.55, r * 0.28, r * 0.2, r * 0.13, 0, 0, TAU); g.fill(); }
    }
    // 아래쪽 반사광 (네온)
    const rim = g.createLinearGradient(0, r * 0.3, 0, r * 1.1);
    rim.addColorStop(0, 'rgba(' + K.rim + ',0)'); rim.addColorStop(1, 'rgba(' + K.rim + ',0.55)');
    g.fillStyle = rim;
    g.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1, r * 0.06);
    shape(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.ellipse(-r * 0.4, -r * 0.58, r * 0.24, r * 0.12, -0.5, 0, TAU); g.fill();
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
  const R = { bgKey: '', zones: [], cloudLayer: null, stars: null, colKey: '', col: null, mileKey: '', miles: {},
    parts: [], texts: [], clouds: [], squash: [], shake: 0, flash: 0, world: null, banner: null, big: null, stormKey: '', storm: null,
    occ: [], fixed: [] };

  // ─── 글자 자리 나누기 (2026-09-27 점검) ─────────────────────
  // 이름표("위에서 꾹!"·"위험!" 등)가 높이 눈금 이름표·주인공·주인공이 노리는 발판·서로와 겹치지 않게, 한 프레임 동안 차지한 칸을 적어 둔다.
  // R.occ: 이름표가 피할 칸 (화면 좌표 사각형) · R.fixed: 떠오르는 글자(+10 등)가 피할 칸 (위쪽 시간 막대)
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function occupy(x, y, w, h) { R.occ.push({ x, y, w, h }); }
  // 가운데 (x, y), 크기 w × h 이름표를 놓을 세로 자리: 원래 자리 → 위 → 아래 → 두 칸 위 … 빈 곳. 다 막히면 원래 자리
  function placeY(x, y, w, h, lo, hi) {
    for (const k of [0, -1, 1, -2, 2, -3]) {
      const yy = y + k * (h + 4);
      if (yy - h / 2 < lo || yy + h / 2 > hi) continue;
      const box = { x: x - w / 2, y: yy - h / 2, w, h };
      if (!R.occ.some(o => overlap(box, o))) { R.occ.push(box); return yy; }
    }
    R.occ.push({ x: x - w / 2, y: y - h / 2, w, h });
    return y;
  }
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
  // 착지 먼지: 발밑에서 양옆으로 퍼지는 작은 뭉게 (그리기는 부드러운 동그라미)
  function dust(x, y, s) {
    const P = R.parts;
    for (let i = 0; i < D.FX.dust; i++) {
      if (P.length >= D.FX.maxParticles) P.shift();
      const d = i % 2 ? 1 : -1, sp = 80 + Math.random() * 110, life = 0.3 + Math.random() * 0.2;
      P.push({ dust: true, x: x + d * (10 + Math.random() * 8), y: y + 1, vx: d * sp, vy: 10 + Math.random() * 25, life, max: life, color: 'rgba(210,235,255,0.32)', size: (2.5 + Math.random() * 2.5) * s });
    }
  }
  function ring(x, y, r, color, life) {
    if (R.parts.length >= D.FX.maxParticles) R.parts.shift();
    R.parts.push({ ring: true, x, y, r, color, life, max: life });
  }

  // 규칙이 남긴 연출 요청(W.fx)을 입자로 바꾼다. 좌표는 월드(점), 크기는 화면 픽셀
  function takeFx(W, v) {
    if (R.world !== W) { R.world = W; R.parts.length = 0; R.texts.length = 0; R.clouds.length = 0; R.squash.length = 0; R.shake = 0; R.flash = 0; R.banner = null; R.big = null; }
    const s = v.scale, big = v.hud !== false;
    const zoneNow = W.fx.some(f => f.kind === 'zone');
    for (const f of W.fx) {
      if (f.kind === 'bounce') {
        dust(f.x, f.y, s);
        if (big) burst(f.x, f.y + 4, 3, ['#bff8ff', '#5ee7ff'], 120, 3 * s);
        // 콤보가 배율 단계에 오를 때마다 작은 글자
        const C = D.COMBO;
        if (big && f.combo >= C.step && f.combo % C.step === 0) text(f.x, f.y + 70, '콤보 ' + f.combo + '!', '#ff9ee0', 24 * s);
      } else if (f.kind === 'zone') {
        const Z = D.ZONES[f.zone];
        if (!W.fx.some(q => q.kind === 'planet')) R.banner = { title: Z.banner, sub: Z.from + ' m', color: Z.color, life: 2.6, max: 2.6 };
        R.big = null;   // 구역 배너가 100m 글자보다 먼저
        ring(f.x, f.y, 110 * s, Z.color, 0.8);
        burst(f.x, f.y, 34, [Z.color, '#ffffff', '#ffe66d'], 520, 6 * s);
      } else if (f.kind === 'planet') {
        // 행성 도착 배너. 우주 구역 도착(수성)과 같은 때면 "우주 도착!" 아래에 행성 이름
        const P = D.PLANETS[f.i];
        R.banner = zoneNow ? { title: D.ZONES[W.zone].banner, sub: P.name + ' · ' + P.line, color: P.color, life: 3, max: 3, text: true }
          : { title: P.name + ' 도착!', sub: P.line, color: P.color, life: 2.8, max: 2.8, text: true };
        R.big = null;
        ring(f.x, f.y, 100 * s, P.color, 0.7);
        burst(f.x, f.y, 26, [P.color, '#ffffff'], 440, 5 * s);
      } else if (f.kind === 'leg') {
        // 땅에서 우주까지 여정 배너 (구름 속 · 높은 하늘 · 대기권 돌파)
        const G = D.SKY.legs[f.i];
        if (!zoneNow && !W.fx.some(q => q.kind === 'planet')) { R.banner = { title: G.banner, sub: G.sub, color: G.color, life: 2.6, max: 2.6, text: true }; R.big = null; }
        ring(f.x, f.y, 90 * s, G.color, 0.7);
        burst(f.x, f.y, 22, [G.color, '#ffffff'], 420, 5 * s);
      } else if (f.kind === 'gift') {
        // 깜짝 선물: 알록달록 색종이 + 무엇을 받았는지
        const title = f.reward === 'coins' ? '선물: 코인 ' + f.n + '개!' : f.reward === 'rocket' ? '선물: 로켓!' : f.reward === 'shield' ? '선물: 방패 방울!'
          : '선물: 다음 판 ' + (f.item === 'rocketStart' ? '로켓 출발' : '방패 방울') + '!';
        R.banner = { title, sub: f.reward === 'item' ? '다음 판 시작할 때 자동으로 써요' : '', color: '#ffe66d', life: 2.4, max: 2.4, text: true };
        R.big = null;
        ring(f.x, f.y, 70 * s, '#ffe66d', 0.5);
        burst(f.x, f.y, 40, ['#ff5ec8', '#ffe66d', '#5ee7ff', '#7dff6a', '#ff9f43', '#ffffff'], 520, 6 * s);
      } else if (f.kind === 'fever') {
        R.banner = { title: '피버!', sub: '별 점수 두 배! ' + D.FEVER.time + '초', color: '#ff9ee0', life: 2.2, max: 2.2, text: true };
        R.big = null;
        ring(f.x, f.y, 120 * s, '#ff9ee0', 0.7);
        burst(f.x, f.y, 36, ['#ff5ec8', '#ffe66d', '#5ee7ff', '#7dff6a'], 560, 6 * s);
      } else if (f.kind === 'room') {
        R.banner = { title: '비밀 방!', sub: D.ROOM.time + '초 동안 별을 모아요 · 떨어지지 않아요', color: '#d9c8ff', life: 2.6, max: 2.6, text: true };
        R.big = null; R.parts.length = 0;
      } else if (f.kind === 'roomEnd') {
        R.banner = { title: '비밀 방 끝!', sub: '원래 자리로 돌아왔어요', color: '#d9c8ff', life: 2, max: 2, text: true };
        ring(f.x, f.y, 80 * s, '#d9c8ff', 0.6);
      } else if (f.kind === 'hole') {
        R.banner = { title: '블랙홀 주의!', sub: (f.side < 0 ? '왼쪽' : '오른쪽') + '으로 살짝 끌려가요 · 반대쪽으로 가요', color: '#c9a0ff', life: 2.8, max: 2.8, text: true };
        R.big = null;
      } else if (f.kind === 'warp') {
        // 출발 장소에서 시작: 발사대에서 슝
        const S = D.STARTS.find(q => q.id === f.id) || D.STARTS[0];
        R.banner = { title: S.name + '에서 출발!', sub: '발사대에서 슝!', color: S.color, life: 2.4, max: 2.4, text: true };
        R.big = null;
        ring(f.x, f.y, 90 * s, S.color, 0.7);
        burst(f.x, f.y, 26, [S.color, '#ffffff', '#ffe66d'], 420, 5 * s);
      } else if (f.kind === 'revive') {
        R.banner = { title: '한 번 더!', sub: D.CONTINUE.safe + '초 동안 지켜 줄게요', color: '#ffe66d', life: 2.2, max: 2.2, text: true };
        R.big = null;
        burst(f.x, f.y, 30, ['#ffe66d', '#ffffff', '#5ee7ff'], 460, 6 * s);
      } else if (f.kind === 'mile') {
        if (!zoneNow && !R.banner) R.big = { txt: f.m + ' m!', life: 1.6, max: 1.6 };
        ring(W.p.x, W.p.y, 90 * s, '#ffe66d', 0.6);
        burst(W.p.x, W.p.y, 24, ['#ffe66d', '#fff4c2', '#5ee7ff'], 440, 5 * s);
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
        if (big) text(f.x, f.y + 26, '+' + (f.pts || D.STAR.points), f.pts > D.STAR.points ? '#ff9ee0' : '#ffe66d', 22 * s);
      } else if (f.kind === 'item') {
        const K = ITEM[f.item];
        ring(f.x, f.y, 60 * s, K.color, 0.5);
        burst(f.x, f.y, 22, [K.color, '#ffffff'], 380, 5 * s);
        if (big) text(f.x, f.y + 40, K.name + '!', K.color, 30 * s);
      } else if (f.kind === 'save' || f.kind === 'pop') {
        ring(f.x, f.y, 60 * s, '#7fd3ff', 0.5);
        burst(f.x, f.y, 18, ['#7fd3ff', '#ffffff', '#ff4d6d'], 360, 4 * s);
        if (f.kind === 'save' && big) text(f.x, f.y + 40, '방울이 지켜 줬어요!', '#7fd3ff', 24 * s);
      } else if (f.kind === 'stomp') {
        // 몬스터 밟기: 납작하게 눌린 몬스터가 잠깐 남고, 반짝이 · 점수
        const K = MON[f.mk] || MON.slime;
        if (R.squash.length > 6) R.squash.shift();
        R.squash.push({ x: f.x, y: f.y, kind: f.mk, life: 0.4, max: 0.4 });
        ring(f.x, f.y, 50 * s, K.top, 0.4);
        burst(f.x, f.y, 16, [K.color, K.top, '#ffffff', '#ffe66d'], 340, 5 * s);
        if (big) { text(f.x, f.y + 44, '꾹!', K.top, 30 * s); text(f.x + 30, f.y + 10, '+' + f.pts, '#ffe66d', 22 * s); }
      } else if (f.kind === 'bump') {
        ring(f.x, f.y, 34 * s, '#ffffff', 0.3);
        if (big) text(f.x, f.y + 40, '앗!', '#ffe6f4', 24 * s);
      } else if (f.kind === 'rescue') {
        R.clouds.push({ x: f.x, y: f.y, life: 1.1, max: 1.1 });
        burst(f.x, f.y + 20, 16, ['#ffffff', '#bfe3ff', '#ffe66d'], 260, 5 * s);
        if (big) text(f.x, f.y + 110, '구름이 받아 줬어요!', '#ffffff', 26 * s);
      } else if (f.kind === 'die') {
        if (f.cause === 'mine' || f.cause === 'monster') {
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
      if (q.dust) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.88; q.vy *= 0.9; }
      else if (!q.ring) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy = q.vy * 0.9 - 300 * dt; }
    }
    for (let i = R.texts.length - 1; i >= 0; i--) { const q = R.texts[i]; q.life -= dt; q.y += 40 * dt; if (q.life <= 0) R.texts.splice(i, 1); }
    for (let i = R.clouds.length - 1; i >= 0; i--) { const q = R.clouds[i]; q.life -= dt; q.y += 30 * dt; if (q.life <= 0) R.clouds.splice(i, 1); }
    for (let i = R.squash.length - 1; i >= 0; i--) { if ((R.squash[i].life -= dt) <= 0) R.squash.splice(i, 1); }
    if (R.banner && (R.banner.life -= dt) <= 0) R.banner = null;
    if (R.big && (R.big.life -= dt) <= 0) R.big = null;
    R.shake = Math.max(0, R.shake - dt * 40);
    R.flash = Math.max(0, R.flash - dt);
  }

  // ─── 좌표 ─────────────────────────────────────────────────
  // 월드(점) → 화면(픽셀). cam = 화면 맨 아래의 높이
  let CAM = 0;
  const SX = (v, x) => v.cx + x * v.scale;
  const SY = (v, y) => v.cy + v.ch - (y - CAM) * v.scale;

  // 착지 먼지: 주인공 뒤에 깔리게 먼저 그린다
  function drawDust(ctx, v) {
    for (const q of R.parts) {
      if (!q.dust) continue;
      const a = q.life / q.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(SX(v, q.x), SY(v, q.y), q.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawFx(ctx, v) {
    ctx.globalCompositeOperation = 'lighter';
    for (const q of R.parts) {
      if (q.dust) continue;   // 먼지는 주인공보다 먼저 (drawDust)
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
      const hw = ctx.measureText(q.txt).width / 2 + 6;   // 기둥 밖으로 잘리지 않게
      const x = Math.max(v.cx + hw, Math.min(v.cx + v.cw - hw, SX(v, q.x)));
      let y = SY(v, q.y);
      // 위쪽 시간 막대(비밀 방·피버)와 겹치면 그 아래로
      const hh = Math.max(14, q.size) * 0.7;
      for (const f of R.fixed) if (overlap({ x: x - hw, y: y - hh, w: hw * 2, h: hh * 2 }, f)) y = f.y + f.h + hh + 2;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(q.txt, x, y);
      ctx.fillStyle = q.color; ctx.fillText(q.txt, x, y);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // ─── 배경 ─────────────────────────────────────────────────
  // 배경 장면 목록: 하늘 · 구름 위 · 높은 하늘 · 대기권 끝 · 행성 아홉(우주) · 외계 행성 여덟 · 별나라.
  // 행성마다 하늘색이 다르다. 장면마다 1/4 해상도로 한 번 그려 두고, 경계 앞 fade m 동안 두 장을 섞는다
  const SCENES = (() => {
    const out = [];
    D.ZONES.forEach((Z, i) => {
      const next = D.ZONES[i + 1] ? D.ZONES[i + 1].from : Infinity;
      const P = D.PLANETS.filter(p => p.at >= Z.from && p.at < next);
      if ((Z.id === 'space' || Z.id === 'exo') && P.length) {
        for (const p of P) out.push({ id: 'planet', planet: p.id, from: p.at, sky: p.sky, glow: p.glow, stars: Z.stars, clouds: 0, fade: p.at === Z.from ? D.ZONE_FADE : D.PLANET_FADE });
      } else out.push(Object.assign({ fade: D.ZONE_FADE }, Z));
    });
    for (const sc of D.SKY.scenes) out.push(Object.assign({ fade: D.ZONE_FADE }, sc));
    return out.sort((a, b) => a.from - b.from);
  })();
  // 지금 있는 곳 이름·색 (점수판 · 결과 화면): 우주·외계에서는 가장 최근 행성, 그 전에는 구역(높은 하늘 · 대기권 끝 포함)
  function placeOf(W) {
    const Z = D.ZONES[W.zone];
    if ((Z.id === 'space' || Z.id === 'exo') && W.planet > 0) { const P = D.PLANETS[W.planet - 1]; return { name: P.name, color: P.color, planet: true }; }
    if (Z.id === 'sky' || Z.id === 'cloud') {
      let sc = null;
      for (const q of D.SKY.scenes) if (W.height >= q.from) sc = q;
      if (sc) return { name: sc.name, color: sc.color || Z.color, planet: false };
    }
    return { name: Z.name, color: Z.color, planet: false };
  }
  // 화면 가운데 높이(m)에서 지금 장면과 다음 장면을 얼마나 섞을지: [장면, 다음 장면, 섞는 정도 0 ~ 1]
  function zoneBlend(m) {
    const Z = SCENES;
    let i = 0;
    for (let k = 0; k < Z.length; k++) if (m >= Z[k].from - Z[k].fade) i = k;
    // i는 이미 섞이기 시작한 장면. 경계 앞 fade m 동안 앞 장면에서 넘어간다
    if (i === 0) return [0, 0, 0];
    const t = Math.max(0, Math.min(1, (m - (Z[i].from - Z[i].fade)) / Z[i].fade));
    return [i - 1, i, t];
  }

  // 행성·블랙홀이 화면 어디에 떠 있는지. 가로 화면이면 기둥 옆자리 가운데, 좁으면 기둥 가장자리(유리 뒤라 흐리게 보인다).
  // 세로로는 발판보다 훨씬 느리게 흘러간다 (SPAN m에 화면 한 높이): 그 높이(hc)에 닿을 때 화면 42% 높이
  const SPAN = 70;
  function skyPlace(v, side, hc, size) {
    const mc = (CAM + v.viewH * 0.5) / D.METER;
    const y = v.h * 0.42 + (mc - hc) * v.h / SPAN;
    let x, r;
    if (v.side) {
      const sw = side < 0 ? v.cx : v.w - v.cx - v.cw;
      x = side < 0 ? v.cx * 0.5 : v.cx + v.cw + sw * 0.5;
      r = Math.min(sw * 0.34, v.h * 0.19) * size;
    } else {
      x = side < 0 ? v.cx + v.cw * 0.08 : v.cx + v.cw * 0.92;
      r = Math.min(v.cw * 0.2, v.h * 0.15) * size;
    }
    return { x, y, r };
  }
  // 행성: 지금 화면 가까이 있는 것만 찍는다. 달은 행성 둘레를 아주 천천히 돈다 (움직임 줄이기면 멈춤)
  function drawPlanets(ctx, W, v) {
    if (!JP.Space) return;
    const q = Math.min(v.dpr, 1.25), tt = v.calm ? 0 : performance.now() / 1000;
    for (const P of D.PLANETS) {
      const pl = skyPlace(v, P.side, P.at + 25, P.size);
      const R = Math.max(12, Math.round(pl.r));
      const k = JP.Space.PLANET_K[P.id] || 1.4;
      if (pl.y + R * k < -20 || pl.y - R * k > v.h + 20) continue;
      const sp = JP.Space.planetSprite(P.id, R, q);
      ctx.globalAlpha = P.id === 'pluto' ? 0.85 : 0.95;
      ctx.drawImage(sp.c, pl.x - sp.half, pl.y - sp.half, sp.half * 2, sp.half * 2);
      const moons = JP.Space.MOONS[P.id] || [];
      moons.forEach((mo, i) => {
        const ms = JP.Space.moonSprite(mo, R, q, i, P.id);
        const a = mo.a + tt * 0.05 * (i % 2 ? -1 : 1);
        const mx = pl.x + Math.cos(a) * R * mo.d, my = pl.y + Math.sin(a) * R * mo.d * 0.9;
        ctx.drawImage(ms.c, mx - ms.half, my - ms.half, ms.half * 2, ms.half * 2);
      });
      ctx.globalAlpha = 1;
    }
  }
  // 블랙홀 구간: 끌어당기는 쪽 옆자리에 블랙홀(원반 + 도는 소용돌이). 구간 가운데 높이에서 화면 42% 높이
  function drawHoles(ctx, W, v) {
    if (!JP.Space || !W.holeList) return;
    const mc = (CAM + v.viewH * 0.5) / D.METER;
    if (mc < W.holeFirst - SPAN) return;
    JP.World.holesUpTo(W, mc + SPAN);
    const q = Math.min(v.dpr, 1.25), tt = v.calm ? 0 : performance.now() / 1000;
    for (const h of W.holeList) {
      const pl = skyPlace(v, h.side, (h.from + h.to) / 2, 1);
      const R = Math.max(20, Math.round(pl.r * 1.1));
      if (pl.y + R * 2.5 < -20 || pl.y - R * 2.5 > v.h + 20) continue;
      const sw = JP.Space.swirlSprite(Math.round(R * 2.4));
      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.rotate(-tt * 0.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(sw.c, -sw.half, -sw.half, sw.half * 2, sw.half * 2);
      ctx.restore();
      const hs = JP.Space.holeSprite(R, q);
      ctx.drawImage(hs.c, pl.x - hs.half, pl.y - hs.half, hs.half * 2, hs.half * 2);
    }
  }
  // 블랙홀 구간 안: 기둥 안에 빛 알갱이가 그쪽으로 흘러가고, 그쪽 가장자리가 보랏빛 (끌리는 쪽을 알 수 있게)
  function drawPull(ctx, W, v) {
    const h = W.hole;
    if (!h || W.phase !== 'play') return;
    const tt = performance.now() / 1000;
    const ex = h.side < 0 ? v.cx : v.cx + v.cw, gw = Math.max(30, v.cw * 0.12);
    const g = ctx.createLinearGradient(ex - h.side * gw, 0, ex, 0);
    g.addColorStop(0, 'rgba(170,110,255,0)'); g.addColorStop(1, 'rgba(170,110,255,0.35)');
    ctx.fillStyle = g; ctx.fillRect(Math.min(ex, ex - h.side * gw), v.cy, gw, v.ch);
    if (v.calm) return;
    ctx.fillStyle = '#e8d2ff';
    const rnd = JP.rng(77);
    for (let i = 0; i < 26; i++) {
      const y0 = rnd() * v.ch, sp = 0.15 + rnd() * 0.25, ph = rnd();
      const k = (tt * sp + ph) % 1;
      const x = h.side > 0 ? v.cx + k * v.cw : v.cx + (1 - k) * v.cw;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.5;
      ctx.fillRect(x, v.cy + y0, 6 + sp * 10, 2);
    }
    ctx.globalAlpha = 1;
  }
  function drawBackground(ctx, W, v, dt) {
    const bk = v.w + 'x' + v.h;
    if (R.bgKey !== bk) { R.bgKey = bk; R.zones = []; R.cloudLayer = null; R.stars = makeStars(v.w, v.h); if (JP.Space) JP.Space.clear(); if (JP.Sky) JP.Sky.clear(); }
    const zone = i => R.zones[i] || (R.zones[i] = paintZone(SCENES[i], v.w, v.h));
    const m = (CAM + v.viewH * 0.5) / D.METER;
    const [a, b, t] = zoneBlend(m);
    const A = SCENES[a], B = SCENES[b];
    ctx.drawImage(zone(a), 0, 0, v.w, v.h);
    if (t > 0.01) { ctx.globalAlpha = t; ctx.drawImage(zone(b), 0, 0, v.w, v.h); ctx.globalAlpha = 1; }
    const up = CAM * v.scale;
    // 구름 층 두 겹 (느린 먼 층 · 빠른 가까운 층)
    const cl = A.clouds + (B.clouds - A.clouds) * t;
    if (cl > 0.02) {
      if (!R.cloudLayer) R.cloudLayer = paintClouds(v.w, v.h);
      for (const [k, al, flip] of [[0.12, 0.8, false], [0.3, 0.55, true]]) {
        const y = ((up * k) % v.h + v.h) % v.h;
        ctx.globalAlpha = cl * al;
        ctx.save();
        if (flip) { ctx.translate(v.w, 0); ctx.scale(-1, 1); }
        ctx.drawImage(R.cloudLayer, 0, y - v.h, v.w, v.h);
        ctx.drawImage(R.cloudLayer, 0, y, v.w, v.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    // 별 두 겹: 먼 별은 느리게, 가까운 별은 빠르게 아래로 흘러 올라가는 느낌. 구역마다 밝기가 다르다
    const sa = A.stars + (B.stars - A.stars) * t;
    ctx.fillStyle = '#e8f7ff';
    const tt = performance.now() / 1000;
    for (const st of R.stars) {
      const y = ((st.y + up * st.k) % v.h + v.h) % v.h;
      ctx.globalAlpha = sa * (v.calm ? st.a : st.a * (0.65 + 0.35 * Math.sin(tt * 1.4 + st.ph)));
      ctx.fillRect(st.x, y, st.s, st.s);
    }
    ctx.globalAlpha = 1;
    // 땅에서 우주까지: 배경 소품(새·열기구·비행기·인공위성·달) · 구름 벽 (기둥 유리 뒤)
    if (JP.Sky) { JP.Sky.drawDeco(ctx, v, CAM, tt); JP.Sky.drawCloudBank(ctx, v, CAM); }
    // 우주: 지나가는 행성 · 블랙홀 (기둥 유리 뒤에 그려 발판이 늘 또렷하다)
    if (m > D.PLANETS[0].at - SPAN) drawPlanets(ctx, W, v);
    drawHoles(ctx, W, v);
    const key = [v.cw, v.ch, v.w, v.dpr].join(',');
    if (R.colKey !== key) { R.colKey = key; R.col = paintColumn(v, v.dpr); }
    ctx.drawImage(R.col, v.cx - CM, v.cy - CM, v.cw + CM * 2, v.ch + CM * 2);
    // 유리 위 · 발판 아래: 땅(동네·발사대) · 대기권 끝 빛나는 선 · 행성 날씨
    if (JP.Sky) { JP.Sky.drawGround(ctx, v, CAM, tt); JP.Sky.drawEdge(ctx, v, CAM); JP.Sky.drawWeather(ctx, v, CAM, dt, tt); }
  }

  // 50m마다 빛나는 선 (100m는 금색): 기둥 폭마다 한 번 그려 두고 찍는다
  function mileSprite(v, gold) {
    const key = v.cw + '|' + v.dpr + '|' + gold;
    if (R.mileKey !== v.cw + '|' + v.dpr) { R.mileKey = v.cw + '|' + v.dpr; R.miles = {}; }
    if (R.miles[key]) return R.miles[key];
    const h = 24, c = document.createElement('canvas');
    c.width = Math.round(v.cw * v.dpr); c.height = Math.round(h * v.dpr);
    const g = c.getContext('2d');
    g.scale(v.dpr, v.dpr);
    const col = gold ? '255,230,109' : '94,231,255';
    const band = g.createLinearGradient(0, 0, 0, h);
    band.addColorStop(0, 'rgba(' + col + ',0)'); band.addColorStop(0.5, 'rgba(' + col + ',0.35)'); band.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = band; g.fillRect(0, 0, v.cw, h);
    g.fillStyle = 'rgba(' + col + ',0.9)'; g.fillRect(0, h / 2 - 1, v.cw, 2);
    // 양 끝은 흐리게
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, v.cw, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0.2)'); fade.addColorStop(0.15, '#000'); fade.addColorStop(0.85, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = fade; g.fillRect(0, 0, v.cw, h);
    R.miles[key] = c;
    return c;
  }

  // 기둥 모서리 꺾쇠(paintColumn) 자리: 위·아래 끝에서 EDGE px, 왼쪽에서 EDGE_X px 안쪽은 눈금 글자를 피한다
  const EDGE = 30, EDGE_X = 12;
  // 높이 눈금 (10m마다) + 50m 빛나는 선 + 최고 기록 선
  function drawMarks(ctx, W, v) {
    const M = D.METER, step = D.MILE.tick;
    const lo = Math.max(1, Math.ceil(CAM / M / step)), hi = Math.floor((CAM + v.ch / v.scale) / M / step);
    for (let k = lo; k <= hi; k++) {
      const m = k * step, y = Math.round(SY(v, m * M)) + 0.5;
      if (m % D.MILE.line === 0) {
        const gold = m % D.MILE.big === 0;
        ctx.drawImage(mileSprite(v, gold), v.cx, y - 12, v.cw, 24);
        const fs = Math.round(Math.max(14, 17 * v.ui));
        ctx.font = '700 ' + fs + 'px ' + NUM;
        const txt = m + ' m', tw = ctx.measureText(txt).width + fs * 0.8, th = fs * 1.25;
        // 이름표는 선 위에. 기둥 위 끝(모서리 꺾쇠)에 걸리면 선 아래로
        const ty = y - fs * 1.5 < v.cy + EDGE ? y + fs * 0.25 : y - fs * 1.5, lx = v.cx + EDGE_X;
        ctx.fillStyle = gold ? 'rgba(40,30,4,0.85)' : 'rgba(4,20,30,0.8)';
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(lx, ty, tw, th, fs * 0.35); else ctx.rect(lx, ty, tw, th); ctx.fill();
        ctx.fillStyle = gold ? '#ffe66d' : '#bff8ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, lx + tw / 2, ty + th / 2 + 1);
        occupy(lx, ty, tw, th);
        continue;
      }
      ctx.fillStyle = 'rgba(94,231,255,0.08)';
      ctx.fillRect(v.cx, y, v.cw, 1);
      // 작은 눈금 글자: 기둥 위·아래 끝 모서리(꺾쇠)에 걸리는 자리에서는 쓰지 않는다
      const fs2 = Math.round(Math.max(11, 13 * v.scale * 1.2));
      if (y - fs2 - 2 < v.cy + EDGE || y > v.cy + v.ch - EDGE) continue;
      ctx.font = '700 ' + fs2 + 'px ' + NUM;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(160,190,210,0.5)';
      ctx.fillText(m + 'm', v.cx + EDGE_X, y - 2);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
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
        const x = v.cx + v.cw - tw - EDGE_X, ty = y - fs * 1.4 < v.cy + EDGE ? y + fs * 0.2 : y - fs * 1.4;
        ctx.fillStyle = 'rgba(40,30,4,0.85)';
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, ty, tw, fs * 1.3, fs * 0.4); else ctx.rect(x, ty, tw, fs * 1.3); ctx.fill();
        ctx.fillStyle = '#ffe66d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + tw / 2, ty + fs * 0.68);
        occupy(x, ty, tw, fs * 1.3);
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
      if (p.pad) drawPad(ctx, W, v, y, hPx);
    }
  }

  // 발사대 (높은 곳에서 출발할 때 첫 발판): 노랑·검정 줄무늬 띠와 양옆 깜빡이는 불, 가운데 과녁
  function drawPad(ctx, W, v, y, hPx) {
    const x0 = v.cx, w = v.cw, bh = Math.max(10, hPx * 0.9);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y + hPx, w, bh); ctx.clip();
    ctx.fillStyle = '#1a1406'; ctx.fillRect(x0, y + hPx, w, bh);
    ctx.strokeStyle = 'rgba(255,210,63,0.9)'; ctx.lineWidth = bh * 0.45;
    ctx.beginPath();
    for (let x = x0 - bh; x < x0 + w + bh; x += bh * 1.4) { ctx.moveTo(x, y + hPx + bh); ctx.lineTo(x + bh, y + hPx); }
    ctx.stroke();
    ctx.restore();
    const blink = v.calm ? 1 : 0.5 + 0.5 * Math.sin(W.t * 8);
    for (const f of [0.08, 0.92]) glow(ctx, 'rgba(255,90,90,0.9)', x0 + w * f, y - 4, 10 + 6 * blink, 0.9);
    ctx.strokeStyle = 'rgba(255,230,109,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x0 + w / 2, y + hPx * 0.45, w * 0.1, hPx * 0.35, 0, 0, TAU); ctx.stroke();
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

  // 비어 있는 자리를 찾아 이름표를 단다 (placeY). 기둥 안에서만
  function plabel(ctx, v, txt, x, y, fs, color, bg, border) {
    ctx.font = fs + 'px ' + DISP;
    const tw = ctx.measureText(txt).width + fs * 0.9, th = fs * 1.44;
    x = Math.max(v.cx + tw / 2 + 4, Math.min(v.cx + v.cw - tw / 2 - 4, x));
    const yy = placeY(x, y, tw, th, v.cy + 2, v.cy + v.ch - 2);
    label(ctx, txt, x, yy, fs, color, bg, border);
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
        plabel(ctx, v, K.name, x, Math.max(v.cy + fs, y - r - fs), fs, K.color, 'rgba(5,7,12,0.85)', null);
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
        plabel(ctx, v, '위험!', x, Math.max(v.cy + fs, y - r * 1.5 - fs), fs, '#ffd0d5', 'rgba(40,4,10,0.9)', '#ff3b4e');
        ctx.globalAlpha = 1;
      }
    }
  }

  // ─── 밟는 몬스터 (D.MONSTER) ───────────────────────────────
  // 몸통(광택·그라데이션·윗면 빛)은 종류·크기별로 한 번 미리 그려 두고 찍기만 한다. 눈·날개만 매 프레임 도형으로.
  // 윗면은 밝게 빛나 "여기를 밟아요", 보통·어려움은 옆·아래에 작은 빨간 경고 테두리
  const MON = D.MONSTER.kinds;
  const monCache = {};
  function monSprite(kind, rp, dpr) {
    const key = kind + '|' + rp + '|' + dpr;
    let c = monCache[key];
    if (c) return c;
    const K = MON[kind] || MON.slime, m = Math.ceil(rp * 0.5) + 4, size = (rp + m) * 2;
    c = document.createElement('canvas');
    c.width = c.height = Math.round(size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(size / 2, size / 2);
    const body = new Path2D();
    if (kind === 'slime') {
      // 말랑한 방울 모양: 아래는 넓고 평평, 위는 둥글게
      body.moveTo(-rp * 1.05, rp * 0.75);
      body.bezierCurveTo(-rp * 1.2, -rp * 0.2, -rp * 0.7, -rp * 1.05, 0, -rp * 1.05);
      body.bezierCurveTo(rp * 0.7, -rp * 1.05, rp * 1.2, -rp * 0.2, rp * 1.05, rp * 0.75);
      body.quadraticCurveTo(0, rp * 1.0, -rp * 1.05, rp * 0.75);
    } else if (kind === 'balloon') {
      body.ellipse(0, -rp * 0.08, rp * 0.98, rp * 1.02, 0, 0, TAU);
    } else {
      body.ellipse(0, 0, rp * 1.05, rp * 0.82, 0, 0, TAU);
    }
    g.shadowColor = K.color; g.shadowBlur = rp * 0.6;
    const grad = g.createLinearGradient(0, -rp, 0, rp);
    grad.addColorStop(0, K.top); grad.addColorStop(0.45, K.color); grad.addColorStop(1, 'rgba(20,10,40,0.95)');
    g.fillStyle = grad; g.fill(body);
    g.shadowBlur = 0;
    // 윗면 빛 띠 (밟는 곳)
    g.save(); g.clip(body);
    const cap = g.createLinearGradient(0, -rp * 1.1, 0, -rp * 0.2);
    cap.addColorStop(0, 'rgba(255,255,255,0.85)'); cap.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cap; g.fillRect(-rp * 1.3, -rp * 1.2, rp * 2.6, rp);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = Math.max(1.5, rp * 0.12); g.lineCap = 'round';
    g.beginPath(); g.ellipse(-rp * 0.35, -rp * 0.55, rp * 0.28, rp * 0.14, -0.5, 0, TAU); g.stroke();
    if (kind === 'balloon') {
      // 풍선 매듭과 짧은 줄
      g.fillStyle = K.color;
      g.beginPath(); g.moveTo(-rp * 0.16, rp * 0.92); g.lineTo(rp * 0.16, rp * 0.92); g.lineTo(0, rp * 1.12); g.fill();
      g.strokeStyle = 'rgba(255,214,244,0.7)'; g.lineWidth = Math.max(1, rp * 0.07);
      g.beginPath(); g.moveTo(0, rp * 1.12); g.quadraticCurveTo(rp * 0.25, rp * 1.3, 0, rp * 1.45); g.stroke();
    } else if (kind === 'bird') {
      // 로봇 새: 부리 · 머리 안테나 · 배의 볼트
      g.fillStyle = '#ffe66d';
      g.beginPath(); g.moveTo(rp * 0.95, -rp * 0.05); g.lineTo(rp * 1.35, rp * 0.08); g.lineTo(rp * 0.95, rp * 0.22); g.fill();
      g.strokeStyle = K.top; g.lineWidth = Math.max(1, rp * 0.08);
      g.beginPath(); g.moveTo(0, -rp * 0.8); g.lineTo(rp * 0.1, -rp * 1.15); g.stroke();
      g.fillStyle = '#fff4c2'; g.beginPath(); g.arc(rp * 0.1, -rp * 1.18, rp * 0.1, 0, TAU); g.fill();
      g.fillStyle = 'rgba(40,20,0,0.5)'; g.beginPath(); g.arc(-rp * 0.2, rp * 0.45, rp * 0.08, 0, TAU); g.arc(rp * 0.2, rp * 0.45, rp * 0.08, 0, TAU); g.fill();
    }
    monCache[key] = c;
    return c;
  }
  // 눈: 주인공 쪽을 본다. 움직임 줄이기면 깜빡이지 않는다
  function monEyes(ctx, x, y, rp, look, t, calm, id) {
    const blink = !calm && ((t + id * 0.37) % 3.2) < 0.12;
    for (const e of [-1, 1]) {
      const ex = x + e * rp * 0.36, ey = y - rp * 0.1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, ey, rp * 0.24, blink ? rp * 0.04 : rp * 0.28, 0, 0, TAU); ctx.fill();
      if (blink) continue;
      ctx.fillStyle = '#1b1030';
      ctx.beginPath(); ctx.arc(ex + look * rp * 0.08, ey + rp * 0.04, rp * 0.13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + look * rp * 0.08 - rp * 0.05, ey - rp * 0.04, rp * 0.045, 0, TAU); ctx.fill();
    }
    // 웃는 입
    ctx.strokeStyle = '#1b1030'; ctx.lineWidth = Math.max(1.2, rp * 0.08); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y + rp * 0.2, rp * 0.18, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  function drawMonsters(ctx, W, v, a) {
    const s = v.scale, rp = Math.max(6, Math.round(D.MONSTER.r * s)), P = W.p;
    for (const m of W.monsters) {
      if (m.gone) continue;
      const K = MON[m.kind] || MON.slime;
      const wx = Math.abs(m.x - m.px) < WW / 2 ? m.px + (m.x - m.px) * a : m.x;
      const x = SX(v, wx), y = SY(v, m.y);
      if (y < v.cy - 50 || y > v.cy + v.ch + 50) continue;
      const spr = monSprite(m.kind, rp, v.dpr), hs = spr.width / v.dpr / 2;
      // 통통 숨쉬기 (움직임 줄이기면 가만히)
      const k = v.calm ? 0 : Math.sin(W.t * 5 + m.id) * 0.06;
      const sx = 1 + k, sy = 1 - k;
      const by = y;
      // 윗면 빛: 여기를 밟아요
      glow(ctx, K.top.length === 7 ? K.top : '#ffffff', x, by - rp * 0.95, rp * 1.25, 0.45);
      // 보통·어려움: 옆·아래 빨간 경고 테두리
      if (!W.easy) {
        ctx.strokeStyle = 'rgba(255,77,109,0.85)'; ctx.lineWidth = Math.max(2, rp * 0.14); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, by, rp * 1.2, 0.05 * Math.PI, 0.95 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, by, rp * 1.2, -0.02 * Math.PI, 0.12 * Math.PI, true); ctx.stroke();
      }
      // 로봇 새 날개 (몸 뒤)
      if (m.kind === 'bird') {
        const f = v.calm ? 0.5 : (Math.sin(W.t * 18 + m.id) + 1) / 2;
        ctx.fillStyle = K.color;
        for (const e of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + e * rp * 0.4, by);
          ctx.lineTo(x + e * rp * 1.35, by - rp * (0.2 + f * 0.8));
          ctx.lineTo(x + e * rp * 1.1, by + rp * 0.3);
          ctx.fill();
        }
      }
      ctx.save();
      ctx.translate(x, by + rp * 0.8);
      ctx.scale(m.vx < 0 && m.kind === 'bird' ? -sx : sx, sy);
      ctx.drawImage(spr, -hs, -hs - rp * 0.8, hs * 2, hs * 2);
      ctx.restore();
      const look = Math.sign(JP.World.wrapDelta(m.x, P.x)) || 0;
      monEyes(ctx, x, by, rp, look, W.t, v.calm, m.id);
      // 처음 보일 때 이름표 "위에서 꾹!"
      const age = m.seen >= 0 ? W.t - m.seen : 0;
      if (age < 2.5 && v.hud !== false && y > v.cy + 20) {
        const fs = Math.round(Math.max(13, 15 * v.ui));
        ctx.globalAlpha = Math.min(1, (2.5 - age) * 2);
        plabel(ctx, v, W.easy ? '위에서 꾹!' : '위에서만 꾹!', x, Math.max(v.cy + fs, y - rp * 2.2 - fs * 0.5), fs, K.top, 'rgba(5,7,12,0.85)', W.easy ? null : 'rgba(255,77,109,0.8)');
        ctx.globalAlpha = 1;
      }
    }
    // 밟힌 몬스터: 납작하게 눌렸다가 사라진다
    for (const q of R.squash) {
      const k = q.life / q.max, x = SX(v, q.x), y = SY(v, q.y);
      const spr = monSprite(q.kind, rp, v.dpr), hs = spr.width / v.dpr / 2;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.save();
      ctx.translate(x, y + rp * 0.8);
      if (!v.calm) ctx.scale(1.45, 0.35);
      ctx.drawImage(spr, -hs, -hs - rp * 0.8, hs * 2, hs * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ─── 깜짝 선물 · 비밀 방 문 ─────────────────────────────────
  // 선물 상자: 리본 두른 반짝 상자 (크기별 한 번). 문: 빛나는 구름 문 (크기별 한 번)
  const giftCache = {};
  function giftSprite(rp, dpr, kind) {
    const key = kind + '|' + rp + '|' + dpr;
    if (giftCache[key]) return giftCache[key];
    const m = Math.ceil(rp * 0.6) + 4, w = kind === 'door' ? rp * 2.4 : rp * 2, h = kind === 'door' ? rp * 3 : rp * 2;
    const c = document.createElement('canvas');
    c.width = Math.round((w + m * 2) * dpr); c.height = Math.round((h + m * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(m + w / 2, m + h / 2);
    if (kind === 'gift') {
      g.shadowColor = 'rgba(255,94,200,0.9)'; g.shadowBlur = rp * 0.6;
      const bg = g.createLinearGradient(0, -rp, 0, rp);
      bg.addColorStop(0, '#ff9ee0'); bg.addColorStop(1, '#b0247a');
      g.fillStyle = bg;
      g.beginPath(); if (g.roundRect) g.roundRect(-rp * 0.85, -rp * 0.55, rp * 1.7, rp * 1.4, rp * 0.18); else g.rect(-rp * 0.85, -rp * 0.55, rp * 1.7, rp * 1.4); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ff5ec8';
      g.beginPath(); if (g.roundRect) g.roundRect(-rp * 0.98, -rp * 0.8, rp * 1.96, rp * 0.4, rp * 0.1); else g.rect(-rp * 0.98, -rp * 0.8, rp * 1.96, rp * 0.4); g.fill();
      g.fillStyle = '#ffe66d';
      g.fillRect(-rp * 0.14, -rp * 0.8, rp * 0.28, rp * 1.65);
      g.fillRect(-rp * 0.98, -rp * 0.2, rp * 1.96, rp * 0.2);
      // 리본 매듭
      g.beginPath(); g.ellipse(-rp * 0.32, -rp * 0.95, rp * 0.32, rp * 0.18, -0.5, 0, TAU); g.ellipse(rp * 0.32, -rp * 0.95, rp * 0.32, rp * 0.18, 0.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(-rp * 0.7, -rp * 0.45, rp * 0.2, rp * 0.9);
    } else {
      // 구름 문: 뭉게구름 테두리 안에 빛나는 문
      g.shadowColor = 'rgba(210,190,255,0.95)'; g.shadowBlur = rp * 0.7;
      g.fillStyle = '#f2ecff';
      g.beginPath();
      for (const [dx, dy, rr] of [[-0.9, 1.1, 0.45], [-1, 0.4, 0.42], [-0.85, -0.35, 0.44], [-0.45, -0.95, 0.46], [0.1, -1.15, 0.5], [0.6, -0.9, 0.44], [0.95, -0.3, 0.42], [1, 0.45, 0.42], [0.9, 1.1, 0.45]]) {
        g.moveTo(dx * rp + rr * rp, dy * rp); g.arc(dx * rp, dy * rp, rr * rp, 0, TAU);
      }
      g.fill();
      g.shadowBlur = 0;
      const dg = g.createLinearGradient(0, -rp, 0, rp * 1.4);
      dg.addColorStop(0, '#fff8d6'); dg.addColorStop(0.5, '#c9a0ff'); dg.addColorStop(1, '#6a3fd0');
      g.fillStyle = dg;
      g.beginPath(); g.moveTo(-rp * 0.55, rp * 1.4); g.lineTo(-rp * 0.55, -rp * 0.3); g.arc(0, -rp * 0.3, rp * 0.55, Math.PI, 0); g.lineTo(rp * 0.55, rp * 1.4); g.closePath(); g.fill();
      g.fillStyle = '#ffe66d'; g.beginPath(); g.arc(rp * 0.3, rp * 0.5, rp * 0.08, 0, TAU); g.fill();
    }
    giftCache[key] = { c, w: w + m * 2, h: h + m * 2 };
    return giftCache[key];
  }
  function drawGifts(ctx, W, v) {
    const s = v.scale;
    const bob = k => (v.calm ? 0 : Math.sin(W.t * 3 + k) * 3 * s);
    for (const g of W.gifts) {
      if (g.got) continue;
      const x = SX(v, g.x), y = SY(v, g.y) + bob(g.id);
      if (y < v.cy - 60 || y > v.cy + v.ch + 60) continue;
      const rp = Math.max(8, Math.round(D.GIFT.r * s * 0.85)), sp = giftSprite(rp, v.dpr, 'gift');
      glow(ctx, 'rgba(255,230,109,0.7)', x, y, rp * 2.6, v.calm ? 0.6 : 0.5 + Math.sin(W.t * 5) * 0.15);
      ctx.drawImage(sp.c, x - sp.w / 2, y - sp.h / 2, sp.w, sp.h);
      const age = g.seen >= 0 ? W.t - g.seen : 0;
      if (age < 3 && v.hud !== false) {
        const fs = Math.round(Math.max(13, 15 * v.ui));
        ctx.globalAlpha = Math.min(1, (3 - age) * 2);
        plabel(ctx, v, '깜짝 선물!', x, Math.max(v.cy + fs, y - rp * 1.8 - fs * 0.4), fs, '#ffe66d', 'rgba(5,7,12,0.85)', null);
        ctx.globalAlpha = 1;
      }
    }
    for (const d of W.doors) {
      if (d.used) continue;
      const x = SX(v, d.x), yb = SY(v, d.y - D.ROOM.r);   // 문 아래 끝 = 발판 윗면
      if (yb < v.cy - 80 || yb > v.cy + v.ch + 80) continue;
      const rp = Math.max(8, Math.round(D.ROOM.r * s * 0.62)), sp = giftSprite(rp, v.dpr, 'door');
      glow(ctx, 'rgba(201,160,255,0.75)', x, yb - rp * 1.3, rp * 3.2, v.calm ? 0.6 : 0.5 + Math.sin(W.t * 2.5) * 0.15);
      ctx.drawImage(sp.c, x - sp.w / 2, yb - sp.h + (sp.h - rp * 3) / 2 - rp * 0.1, sp.w, sp.h);
      const age = d.seen >= 0 ? W.t - d.seen : 0;
      if (age < 3.5 && v.hud !== false) {
        const fs = Math.round(Math.max(13, 15 * v.ui));
        ctx.globalAlpha = Math.min(1, (3.5 - age) * 2);
        plabel(ctx, v, '비밀 방!', x, Math.max(v.cy + fs, yb - rp * 3.2 - fs * 0.4), fs, '#e6dcff', 'rgba(24,16,48,0.9)', '#a98bff');
        ctx.globalAlpha = 1;
      }
    }
  }

  // ─── 비밀 방 · 피버 ─────────────────────────────────────────
  // 비밀 방: 기둥 안을 조용한 별빛 방으로 덮는다 (한 번 그려 두고 찍기)
  function roomSprite(v) {
    const key = v.cw + '|' + v.ch + '|' + v.dpr;
    if (R.roomKey === key) return R.roomC;
    const c = document.createElement('canvas');
    c.width = Math.round(v.cw * v.dpr); c.height = Math.round(v.ch * v.dpr);
    const g = c.getContext('2d');
    g.scale(v.dpr, v.dpr);
    const bg = g.createLinearGradient(0, 0, 0, v.ch);
    bg.addColorStop(0, '#120a2e'); bg.addColorStop(0.6, '#241250'); bg.addColorStop(1, '#3a1a5e');
    g.fillStyle = bg; g.fillRect(0, 0, v.cw, v.ch);
    const rnd = JP.rng(99);
    for (let i = 0; i < 90; i++) {
      g.globalAlpha = 0.25 + rnd() * 0.6;
      g.fillStyle = rnd() < 0.2 ? '#ffe66d' : '#e8f0ff';
      const sz = rnd() < 0.15 ? 2.5 : 1.3;
      g.fillRect(rnd() * v.cw, rnd() * v.ch, sz, sz);
    }
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(v.cw / 2, v.ch / 2, Math.min(v.cw, v.ch) * 0.3, v.cw / 2, v.ch / 2, Math.hypot(v.cw, v.ch) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(120,80,220,0.35)');
    g.fillStyle = vg; g.fillRect(0, 0, v.cw, v.ch);
    R.roomKey = key; R.roomC = c;
    return c;
  }
  function drawRoom(ctx, W, v) {
    if (!W.room) return;
    ctx.drawImage(roomSprite(v), v.cx, v.cy, v.cw, v.ch);
  }
  // 시간 막대가 차지하는 자리 (떠오르는 글자·이름표가 피한다)
  function timersRect(W, v) {
    const n = (W.room ? 1 : 0) + (W.feverT > 0 ? 1 : 0);
    if (!n) return null;
    const fs = Math.round(Math.max(14, Math.min(20, v.cw * 0.04)));
    const bw = Math.min(v.cw * 0.5, 220) + fs * 2;
    return { x: v.cx + v.cw / 2 - bw / 2, y: v.cy, w: bw, h: fs * 1.2 + n * fs * 2.3 };
  }
  // 비밀 방 남은 시간 · 피버 남은 시간 (기둥 위쪽 가운데 막대)
  function drawTimers(ctx, W, v) {
    const bars = [];
    if (W.room) bars.push(['비밀 방 ' + Math.ceil(W.room.t) + '초', W.room.t / D.ROOM.time, '#c9a0ff']);
    if (W.feverT > 0) bars.push(['피버 ' + Math.ceil(W.feverT) + '초', W.feverT / D.FEVER.time, '#ff9ee0']);
    const fs = Math.round(Math.max(14, Math.min(20, v.cw * 0.04)));
    let y = v.cy + fs * 1.2;
    for (const [txt, k, col] of bars) {
      const bw = Math.min(v.cw * 0.5, 220), x = v.cx + v.cw / 2;
      label(ctx, txt, x, y, fs, col, 'rgba(8,6,20,0.85)', col);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x - bw / 2, y + fs * 0.95, bw, 5);
      ctx.fillStyle = col; ctx.fillRect(x - bw / 2, y + fs * 0.95, bw * Math.max(0, Math.min(1, k)), 5);
      y += fs * 2.3;
    }
  }
  // 피버: 기둥 가장자리가 무지개로 (움직임 줄이기면 흐르지 않고 가만히)
  function drawFeverEdge(ctx, W, v) {
    if (!(W.feverT > 0)) return;
    const t = v.calm ? 0 : performance.now() / 1000;
    const g = ctx.createLinearGradient(0, v.cy, 0, v.cy + v.ch);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, 'hsl(' + Math.round((i * 60 + t * 120) % 360) + ',100%,65%)');
    ctx.strokeStyle = g; ctx.lineWidth = 5;
    ctx.strokeRect(v.cx + 2.5, v.cy + 2.5, v.cw - 5, v.ch - 5);
    const k = Math.min(1, W.feverT / 1.5);   // 끝나 갈 때 흐려진다
    ctx.globalAlpha = 0.18 * k;
    ctx.lineWidth = 16; ctx.strokeRect(v.cx + 8, v.cy + 8, v.cw - 16, v.ch - 16);
    ctx.globalAlpha = 1;
  }

  // ─── 쫓아오는 먹구름 (보통·어려움) ─────────────────────────
  // 기둥 폭의 먹구름 띠를 한 번 그려 두고, 윗면 높이에 맞춰 찍는다. 그 아래는 어두운 색으로 채운다
  function stormSprite(v) {
    const key = v.cw + '|' + v.dpr;
    if (R.stormKey === key) return R.storm;
    const w = v.cw * 1.5, h = Math.max(90, v.cw * 0.28);
    const c = document.createElement('canvas');
    c.width = Math.round(w * v.dpr); c.height = Math.round(h * v.dpr);
    const g = c.getContext('2d');
    g.scale(v.dpr, v.dpr);
    const rnd = JP.rng(1234);
    // 아래는 꽉 찬 어두운 층
    const base = g.createLinearGradient(0, h * 0.35, 0, h);
    base.addColorStop(0, 'rgba(38,30,70,0.96)'); base.addColorStop(1, 'rgba(14,10,28,1)');
    g.fillStyle = base; g.fillRect(0, h * 0.45, w, h * 0.55);
    // 위쪽 뭉게 덩어리 (가장자리는 보랏빛으로 빛난다)
    g.shadowColor = 'rgba(160,120,255,0.8)'; g.shadowBlur = 14;
    for (let i = 0; i < 16; i++) {
      const x = (i / 15) * w, rr = h * (0.22 + rnd() * 0.18), y = h * 0.42 + rnd() * h * 0.08;
      const gr = g.createRadialGradient(x, y - rr * 0.4, rr * 0.1, x, y, rr);
      gr.addColorStop(0, 'rgba(120,100,170,1)'); gr.addColorStop(0.6, 'rgba(62,48,104,1)'); gr.addColorStop(1, 'rgba(40,30,72,1)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
    g.shadowBlur = 0;
    R.stormKey = key; R.storm = c;
    return c;
  }
  function drawStorm(ctx, W, v, a) {
    const S = W.storm;
    if (!S || !S.on) return;
    const wy = S.py + (S.y - S.py) * a;
    const bottom = v.cy + v.ch;
    // 가까워질수록 화면 아래 끝에서 뭉게구름이 조금씩 고개를 내민다 (닿는 선은 wy 그대로)
    const near = Math.max(0, Math.min(1, 1 - (CAM - wy) / (W.viewH * D.STORM.lag)));
    const top = Math.min(SY(v, wy), bottom - near * near * v.ch * 0.1);
    const spr = stormSprite(v), sw = spr.width / v.dpr, sh = spr.height / v.dpr;
    const y0 = top - sh * 0.3;   // 뭉게 윗면이 먹구름 높이에 오게
    if (y0 < bottom) {
      const drift = v.calm ? 0 : (W.t * 12) % (sw - v.cw);
      ctx.drawImage(spr, v.cx - drift, y0, sw, sh);
      if (y0 + sh < bottom) { ctx.fillStyle = 'rgb(14,10,28)'; ctx.fillRect(v.cx, y0 + sh - 1, v.cw, bottom - y0 - sh + 1); }
      // 가끔 번쩍 (움직임 줄이기면 없음)
      if (!v.calm && (W.t % 3.7) < 0.08) glow(ctx, 'rgba(200,180,255,0.8)', v.cx + v.cw * ((Math.floor(W.t / 3.7) * 0.37) % 1), y0 + sh * 0.6, sh * 0.8, 0.7);
    }
    // 화면 아래에 숨어 있을 때: 아래 끝이 보랏빛으로 어둑어둑 (가까울수록 진하게)
    const gap = (CAM - wy) / W.viewH;
    if (gap > -0.05) {
      const k = Math.max(0, Math.min(1, 1 - gap / D.STORM.lag));
      const h = Math.max(26, v.ch * 0.08);
      const g = ctx.createLinearGradient(0, bottom - h, 0, bottom);
      g.addColorStop(0, 'rgba(90,60,170,0)'); g.addColorStop(1, 'rgba(90,60,170,' + (0.25 + k * 0.5).toFixed(2) + ')');
      ctx.fillStyle = g; ctx.fillRect(v.cx, bottom - h, v.cw, h);
    }
  }
  // 먹구름까지 남은 높이(m). 없으면 null
  function stormGap(W) {
    const S = W.storm;
    if (!S || !S.on || W.phase !== 'play') return null;
    return Math.max(0, (W.p.y - D.PLAYER.r - S.y) / D.METER);
  }
  // "구름이 쫓아와요!" (처음 화면에 보인 뒤 잠깐)
  function drawStormHint(ctx, W, v) {
    const S = W.storm;
    if (!S || S.seen < 0) return;
    const age = W.t - S.seen;
    if (age > D.STORM.hint) return;
    const fs = Math.round(Math.max(18, Math.min(28, v.cw * 0.055)));
    ctx.globalAlpha = Math.min(1, age * 4, (D.STORM.hint - age) * 2);
    label(ctx, '구름이 쫓아와요! 위로 위로!', v.cx + v.cw / 2, v.cy + v.ch * 0.78, fs, '#e6dcff', 'rgba(24,16,48,0.92)', '#a98bff');
    ctx.globalAlpha = 1;
  }

  // ─── 캐릭터 다섯 (D.CHARS) ─────────────────────────────────
  // 좌표는 몸 가운데가 (0,0), 반지름 r. S: {lean -1~1, up 0~1 오르는 힘, fall 0~1 떨어지는 빠르기, land 0~1 착지 직후,
  // t 시간, calm 움직임 줄이기, dead, cause, blink, rocket}
  const rrect = (ctx, x, y, w, h, rad) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h); };

  // 끝난 판의 눈: 가시 폭탄이면 X, 떨어졌으면 아래로 굽은 눈
  function deadEye(ctx, S, cx, ey, r, col) {
    const hurt = S.cause === 'mine' || S.cause === 'monster';
    ctx.strokeStyle = hurt ? '#ff8a96' : col; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.lineCap = 'round';
    ctx.beginPath();
    if (hurt) { const e = r * 0.12; ctx.moveTo(cx - e, ey - e); ctx.lineTo(cx + e, ey + e); ctx.moveTo(cx + e, ey - e); ctx.lineTo(cx - e, ey + e); }
    else ctx.arc(cx, ey + r * 0.05, r * 0.12, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  // 반짝이는 동그란 눈 (토끼·펭귄): 어두운 눈동자 + 하얀 빛 두 점
  function glossEye(ctx, S, cx, ey, r, w, h) {
    if (S.dead) { deadEye(ctx, S, cx, ey, r, '#1b2340'); return; }
    if (S.blink) { ctx.strokeStyle = '#1b2340'; ctx.lineWidth = Math.max(1.5, r * 0.07); ctx.beginPath(); ctx.moveTo(cx - w, ey); ctx.lineTo(cx + w, ey); ctx.stroke(); return; }
    ctx.fillStyle = '#141a33';
    ctx.beginPath(); ctx.ellipse(cx, ey, w, h, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx - w * 0.3, ey - h * 0.35, w * 0.38, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(cx + w * 0.35, ey + h * 0.4, w * 0.18, 0, TAU); ctx.fill();
  }

  // 1. 통통 로봇: 어두운 유리 가리개에 빛나는 눈 두 개, 흔들리는 안테나
  const robot = {
    back(ctx, K, r, S) {
      const tipX = -S.lean * r * 0.45 + r * 0.15 + (S.calm ? 0 : Math.sin(S.t * 9) * r * 0.08 * S.land), tipY = -r * 1.55 + S.up * r * 0.12;
      ctx.strokeStyle = '#bff8ff'; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.9); ctx.quadraticCurveTo(r * 0.15, -r * 1.3, tipX, tipY); ctx.stroke();
      glow(ctx, 'rgba(255,230,109,0.9)', tipX, tipY, r * 0.55, 0.9);
      ctx.fillStyle = '#ffe66d'; ctx.beginPath(); ctx.arc(tipX, tipY, r * 0.16, 0, TAU); ctx.fill();
    },
    front(ctx, K, r, S) {
      const lx = S.lean * r * 0.16, ly = S.look * r * 0.1;
      const vw = r * 1.3, vh = r * 0.62;
      ctx.fillStyle = 'rgba(4,10,24,0.88)';
      rrect(ctx, -vw / 2 + lx * 0.5, -r * 0.34 + ly * 0.5, vw, vh, vh / 2); ctx.fill();
      ctx.strokeStyle = 'rgba(94,231,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      const ey = -r * 0.03 + ly;
      for (const ex of [-r * 0.27, r * 0.27]) {
        const cx = ex + lx;
        if (S.dead) { deadEye(ctx, S, cx, ey, r, '#bff8ff'); continue; }
        const eh = S.blink ? r * 0.05 : r * 0.3, ew = r * 0.17;
        ctx.fillStyle = '#bff8ff';
        rrect(ctx, cx - ew / 2, ey - eh / 2, ew, eh, ew / 2); ctx.fill();
        if (!S.blink) { ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - ew * 0.15, ey - eh * 0.32, ew * 0.3, eh * 0.22); }
      }
    },
  };

  // 2. 개구리: 큰 뒷다리 (착지하면 접고, 뛰어오를 때 쭉 편다), 머리 위 눈 두 개, 넓은 웃음
  const frog = {
    back(ctx, K, r, S) {
      const ext = S.calm ? 0.25 : Math.max(0, S.up * 1.1 - S.land);   // 0 접음 · 1 쭉 폄
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const d of [-1, 1]) {
        const hip = [d * r * 0.62, r * 0.42];
        const knee = [d * r * (1.18 - 0.4 * ext), r * (0.5 + 0.45 * ext)];
        const foot = [d * r * (0.9 - 0.35 * ext), r * (0.98 + 0.55 * ext)];
        ctx.strokeStyle = K.body[2]; ctx.lineWidth = r * 0.42;
        ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
        ctx.strokeStyle = K.body[1]; ctx.lineWidth = r * 0.26;
        ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
        // 물갈퀴 발
        ctx.fillStyle = '#b8f56a';
        ctx.beginPath(); ctx.ellipse(foot[0] + d * r * 0.18, foot[1] + r * 0.06, r * 0.3, r * 0.12, d * 0.15, 0, TAU); ctx.fill();
      }
    },
    front(ctx, K, r, S) {
      const lx = S.lean * r * 0.1, ly = S.look * r * 0.06;
      // 머리 위 눈 봉우리
      for (const d of [-1, 1]) {
        const cx = d * r * 0.45, cy = -r * 0.72;
        const g = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.12, r * 0.03, cx, cy, r * 0.34);
        g.addColorStop(0, K.body[0]); g.addColorStop(0.5, K.body[1]); g.addColorStop(1, K.body[2]);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.34, 0, TAU); ctx.fill();
        const ex = cx + lx, ey = cy + ly;
        if (S.dead) { deadEye(ctx, S, ex, ey, r, '#0d3a18'); continue; }
        if (S.blink) {
          ctx.strokeStyle = '#0d3a18'; ctx.lineWidth = Math.max(1.5, r * 0.08);
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
          continue;
        }
        ctx.fillStyle = '#fbfff0';
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.23, 0, TAU); ctx.fill();
        // 가로로 길쭉한 개구리 눈동자
        ctx.fillStyle = '#10240f';
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.14, r * 0.085, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ex - r * 0.06, ey - r * 0.04, r * 0.04, 0, TAU); ctx.fill();
      }
      // 넓은 웃음 (착지하면 입을 크게)
      ctx.strokeStyle = '#0d4a1c'; ctx.lineWidth = Math.max(1.5, r * 0.07); ctx.lineCap = 'round';
      const open = S.dead ? -0.1 : 0.12 + S.land * 0.1;
      ctx.beginPath(); ctx.moveTo(-r * 0.5 + lx, r * 0.06); ctx.quadraticCurveTo(lx, r * (0.06 + open * 2.4), r * 0.5 + lx, r * 0.06); ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,150,0.45)';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * r * 0.66, r * 0.14, r * 0.14, r * 0.08, 0, 0, TAU); ctx.fill(); }
    },
  };

  // 3. 토끼: 긴 귀 (뛰어오를 때 뒤로 눕고, 떨어질 때 쫑긋 서서 팔랑), 동그란 꼬리
  const rabbit = {
    back(ctx, K, r, S) {
      // 동그란 꼬리 (가는 쪽 반대편)
      ctx.fillStyle = '#ffffff';
      const tx = -S.face * r * 0.92;
      ctx.beginPath(); ctx.arc(tx, r * 0.5, r * 0.24, 0, TAU); ctx.fill();
      const flap = S.calm ? 0 : Math.sin(S.t * 20) * 0.14 * S.fall;
      for (const d of [-1, 1]) {
        // 귀 기울기: 오를 때 바깥으로 눕고, 가는 반대쪽으로 날리고, 착지하면 잠깐 옆으로 펄럭
        const ang = d * (0.16 + 0.75 * S.up + 0.45 * S.land) - S.lean * 0.35 + d * flap;
        const len = r * (1.3 - 0.15 * S.up), wd = r * 0.2;
        ctx.save();
        ctx.translate(d * r * 0.34, -r * 0.72);
        ctx.rotate(ang);
        const bend = d * r * 0.18 * S.up;   // 눕을 때 끝이 휜다
        ctx.fillStyle = K.body[0];
        ctx.strokeStyle = 'rgba(192,96,143,0.55)'; ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath();
        ctx.moveTo(-wd, 0);
        ctx.quadraticCurveTo(-wd * 1.4 + bend, -len * 0.6, bend * 1.6, -len);
        ctx.quadraticCurveTo(wd * 1.4 + bend, -len * 0.6, wd, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff9ccd';
        ctx.beginPath();
        ctx.moveTo(-wd * 0.45, -len * 0.08);
        ctx.quadraticCurveTo(-wd * 0.7 + bend, -len * 0.58, bend * 1.5, -len * 0.88);
        ctx.quadraticCurveTo(wd * 0.7 + bend, -len * 0.58, wd * 0.45, -len * 0.08);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    },
    front(ctx, K, r, S) {
      const lx = S.lean * r * 0.14, ly = S.look * r * 0.08;
      for (const d of [-1, 1]) glossEye(ctx, S, d * r * 0.32 + lx, -r * 0.1 + ly, r, r * 0.13, r * 0.18);
      // 분홍 코와 입
      ctx.fillStyle = '#ff6fae';
      ctx.beginPath(); ctx.moveTo(lx - r * 0.09, r * 0.12 + ly); ctx.lineTo(lx + r * 0.09, r * 0.12 + ly); ctx.lineTo(lx, r * 0.22 + ly); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a3a62'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lx, r * 0.22 + ly); ctx.quadraticCurveTo(lx - r * 0.06, r * 0.34 + ly, lx - r * 0.14, r * 0.3 + ly);
      ctx.moveTo(lx, r * 0.22 + ly); ctx.quadraticCurveTo(lx + r * 0.06, r * 0.34 + ly, lx + r * 0.14, r * 0.3 + ly);
      ctx.stroke();
    },
  };

  // 4. 펭귄: 턱시도, 떨어질 때 파닥이는 작은 날개, 주황 부리와 발
  const penguin = {
    back(ctx, K, r, S) {
      ctx.fillStyle = '#ff9f43';
      const spread = r * 0.1 * S.land;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * (r * 0.36 + spread), r * 1.02, r * 0.26, r * 0.11, 0, 0, TAU); ctx.fill(); }
    },
    front(ctx, K, r, S) {
      // 날개: 떨어질 때 빠르게 파닥, 오를 때는 몸에 붙인다
      const flap = S.calm ? 0.55 : S.fall > 0.05 ? 0.5 + 0.55 * S.fall * (0.5 + 0.5 * Math.sin(S.t * 26)) : 0.18 + 0.2 * S.land;
      for (const d of [-1, 1]) {
        ctx.save();
        ctx.translate(d * r * 0.78, -r * 0.2);
        ctx.rotate(-d * flap);
        const g = ctx.createLinearGradient(0, 0, 0, r * 0.8);
        g.addColorStop(0, K.body[1]); g.addColorStop(1, K.body[2]);
        ctx.fillStyle = g;
        ctx.strokeStyle = 'rgba(127,180,255,0.6)'; ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath(); ctx.ellipse(d * r * 0.06, r * 0.36, r * 0.17, r * 0.44, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      const lx = S.lean * r * 0.12, ly = S.look * r * 0.06;
      for (const d of [-1, 1]) glossEye(ctx, S, d * r * 0.26 + lx, -r * 0.34 + ly, r, r * 0.09, r * 0.12);
      // 부리
      ctx.fillStyle = '#ffb347'; ctx.strokeStyle = '#b85410'; ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.beginPath(); ctx.moveTo(lx * 1.6 - r * 0.15, -r * 0.14 + ly); ctx.lineTo(lx * 1.6 + r * 0.15, -r * 0.14 + ly); ctx.lineTo(lx * 1.9, r * 0.06 + ly); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,150,0.4)';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * r * 0.46, -r * 0.08, r * 0.1, r * 0.06, 0, 0, TAU); ctx.fill(); }
    },
  };

  // 5. 꼬마 외계인: 빛나는 유리 가리개, 더듬이 두 개, 작은 제트팩 (불꽃이 늘 조금, 오를 때 크게)
  const alien = {
    back(ctx, K, r, S) {
      // 제트팩 통 두 개 (몸 양옆 아래)
      for (const d of [-1, 1]) {
        const x = d * r * 0.9, y = r * 0.12;
        const fl = S.dead ? 0 : (0.35 + 0.75 * S.up + 0.2 * S.fall) * (S.calm ? 1 : 0.8 + 0.4 * Math.abs(Math.sin(S.t * 31 + d)));
        if (fl > 0) {
          glow(ctx, 'rgba(94,255,200,0.8)', x, y + r * 0.55 + fl * r * 0.3, r * (0.45 + fl * 0.35), 0.7);
          ctx.fillStyle = '#e8fff6';
          ctx.beginPath(); ctx.moveTo(x - r * 0.12, y + r * 0.34); ctx.lineTo(x, y + r * (0.42 + fl * 0.75)); ctx.lineTo(x + r * 0.12, y + r * 0.34); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#5effc8';
          ctx.beginPath(); ctx.moveTo(x - r * 0.08, y + r * 0.36); ctx.lineTo(x, y + r * (0.38 + fl * 0.5)); ctx.lineTo(x + r * 0.08, y + r * 0.36); ctx.closePath(); ctx.fill();
        }
        const g = ctx.createLinearGradient(x - r * 0.18, 0, x + r * 0.18, 0);
        g.addColorStop(0, '#6b7690'); g.addColorStop(0.45, '#e8eef8'); g.addColorStop(1, '#58627a');
        ctx.fillStyle = g;
        rrect(ctx, x - r * 0.17, y - r * 0.32, r * 0.34, r * 0.68, r * 0.15); ctx.fill();
        ctx.fillStyle = '#ff5ec8';
        ctx.fillRect(x - r * 0.17, y - r * 0.08, r * 0.34, r * 0.08);
      }
      // 더듬이 (가는 반대쪽으로 휘고, 착지하면 통 흔들)
      ctx.lineCap = 'round';
      for (const d of [-1, 1]) {
        const wob = S.calm ? 0 : Math.sin(S.t * 14 + d) * r * 0.1 * S.land;
        const tx = d * r * 0.58 - S.lean * r * 0.3 + wob, ty = -r * 1.42 + S.up * r * 0.1;
        ctx.strokeStyle = K.body[1]; ctx.lineWidth = Math.max(1.5, r * 0.09);
        ctx.beginPath(); ctx.moveTo(d * r * 0.3, -r * 0.85); ctx.quadraticCurveTo(d * r * 0.36, -r * 1.2, tx, ty); ctx.stroke();
        glow(ctx, 'rgba(157,255,106,0.9)', tx, ty, r * 0.45, 0.85);
        ctx.fillStyle = '#c8ff8a'; ctx.beginPath(); ctx.arc(tx, ty, r * 0.14, 0, TAU); ctx.fill();
      }
    },
    front(ctx, K, r, S) {
      const lx = S.lean * r * 0.14, ly = S.look * r * 0.08;
      // 유리 가리개
      const vx = lx * 0.4, vy = -r * 0.14 + ly * 0.4;
      const g = ctx.createLinearGradient(0, vy - r * 0.45, 0, vy + r * 0.45);
      g.addColorStop(0, 'rgba(20,70,90,0.95)'); g.addColorStop(1, 'rgba(6,20,36,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(vx, vy, r * 0.74, r * 0.46, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(94,255,200,0.8)'; ctx.lineWidth = Math.max(1.5, r * 0.07); ctx.stroke();
      // 빛나는 눈 (가리개 안)
      for (const d of [-1, 1]) {
        const ex = vx + d * r * 0.3 + lx * 0.6, ey = vy + ly * 0.5;
        if (S.dead) { deadEye(ctx, S, ex, ey, r, '#7dfff0'); continue; }
        const eh = S.blink ? r * 0.05 : r * 0.26;
        ctx.fillStyle = '#7dfff0';
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.13, eh / 2, d * 0.25, 0, TAU); ctx.fill();
        if (!S.blink) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex - r * 0.04, ey - r * 0.06, r * 0.04, 0, TAU); ctx.fill(); }
      }
      // 가리개 반사광
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(vx, vy, r * 0.62, r * 0.34, 0, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
      // 작은 웃음
      ctx.strokeStyle = '#3a0f6e'; ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.arc(lx * 0.6, r * 0.5, r * 0.14, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    },
  };
  const LOOKS = { robot, frog, rabbit, penguin, alien };

  // 상점·시작 화면 미리보기: 캔버스 한가운데 캐릭터 하나 (움직임 없이)
  function paintChar(cv, id) {
    if (!cv) return;
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    // 토끼 귀 끝(몸 위 약 2배)부터 개구리 발(아래 1.3배)까지 들어가게
    const r = Math.round(Math.min(w, h) * 0.3);
    const stub = { phase: 'play', rocket: 0, shield: false, t: 1, cause: null, p: { vx: 0, vy: 0, land: -9, face: 1 }, ctl: { maxVx: 1 } };
    drawBot(g, stub, { calm: true, dpr: 1, char: id }, w / 2, h * 0.03 + r * 2.04, r, 1, 1);
  }

  // 출발 장소 그림 버튼 (시작 화면): 그곳 하늘색 + 알아보기 쉬운 소품 하나. 잠긴 곳은 어둡게 + 자물쇠
  const PLACE_SKY = { ground: ['#1a3570', '#3d5fa8', '#e08a64'] };
  function paintPlace(cv, id, locked) {
    if (!cv) return;
    const g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const Z = D.ZONES.find(z => z.id === id) || D.ZONES[0], sky = PLACE_SKY[id] || Z.sky;
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, sky[0]); bg.addColorStop(0.6, sky[1]); bg.addColorStop(1, sky[2]);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const rnd = JP.rng(id.length * 31 + 7);
    const dots = n => { g.fillStyle = '#e8f7ff'; for (let i = 0; i < n; i++) { g.globalAlpha = 0.3 + rnd() * 0.6; g.fillRect(rnd() * w, rnd() * h * 0.8, 1.6, 1.6); } g.globalAlpha = 1; };
    const puff = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); for (const [dx, dy, k] of [[-1, 0.2, 0.7], [-0.3, -0.25, 0.9], [0.5, -0.05, 0.8], [1.1, 0.25, 0.6]]) { g.moveTo(x + dx * r + k * r, y + dy * r); g.arc(x + dx * r, y + dy * r, k * r, 0, TAU); } g.fill(); };
    if (id === 'ground') {
      g.fillStyle = 'rgba(255,190,110,0.9)'; g.beginPath(); g.arc(w * 0.72, h * 0.62, h * 0.18, 0, TAU); g.fill();
      g.fillStyle = '#16203a';
      for (const [x, bw, bh] of [[0.02, 0.2, 0.26], [0.2, 0.16, 0.36], [0.36, 0.22, 0.22], [0.78, 0.2, 0.3]]) { g.fillRect(w * x, h * (1 - bh), w * bw, h * bh); g.beginPath(); g.moveTo(w * x - 2, h * (1 - bh)); g.lineTo(w * (x + bw / 2), h * (1 - bh - 0.1)); g.lineTo(w * (x + bw) + 2, h * (1 - bh)); g.fill(); }
      g.fillStyle = '#ffd23f'; g.fillRect(w * 0.6, h * 0.35, w * 0.035, h * 0.65); g.fillRect(w * 0.55, h * 0.35, w * 0.13, h * 0.04);
    } else if (id === 'cloud') {
      dots(6);
      g.fillStyle = 'rgba(255,240,200,0.9)'; g.beginPath(); g.arc(w * 0.78, h * 0.28, h * 0.12, 0, TAU); g.fill();
      puff(w * 0.28, h * 0.8, h * 0.2, 'rgba(255,255,255,0.95)'); puff(w * 0.72, h * 0.88, h * 0.18, 'rgba(235,245,255,0.9)'); puff(w * 0.5, h * 0.5, h * 0.12, 'rgba(255,255,255,0.7)');
    } else if (id === 'space') {
      dots(26);
      const px = w * 0.55, py = h * 0.55, pr = h * 0.24;
      const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, '#fff3c4'); pg.addColorStop(1, '#c08a3a');
      g.strokeStyle = 'rgba(243,213,140,0.9)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(px, py, pr * 1.8, pr * 0.5, -0.3, Math.PI, TAU); g.stroke();
      g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(px, py, pr * 1.8, pr * 0.5, -0.3, 0, Math.PI); g.stroke();
    } else {
      dots(26);
      const px = w * 0.45, py = h * 0.58, pr = h * 0.27;
      glow(g, 'rgba(125,255,207,0.6)', px, py, pr * 2, 0.8);
      const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, '#d8fff0'); pg.addColorStop(0.5, '#3fd6a8'); pg.addColorStop(1, '#0f5a58');
      g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
      g.fillStyle = '#c9a0ff'; g.beginPath(); g.arc(w * 0.8, h * 0.28, h * 0.08, 0, TAU); g.fill();
      g.fillStyle = '#ffe66d'; g.beginPath(); g.arc(w * 0.18, h * 0.25, h * 0.05, 0, TAU); g.fill();
    }
    if (locked) {
      g.fillStyle = 'rgba(5,7,12,0.62)'; g.fillRect(0, 0, w, h);
      const lx = w / 2, ly = h / 2 + 4, lw = h * 0.3;
      g.strokeStyle = '#cfd8e6'; g.lineWidth = Math.max(3, lw * 0.18);
      g.beginPath(); g.arc(lx, ly - lw * 0.35, lw * 0.36, Math.PI, TAU); g.stroke();
      g.fillStyle = '#cfd8e6'; g.fillRect(lx - lw * 0.55, ly - lw * 0.35, lw * 1.1, lw * 0.85);
    }
  }

  // ─── 주인공 ────────────────────────────────────────────────
  function drawPlayer(ctx, W, v, a) {
    const P = W.p, s = v.scale, r = D.PLAYER.r * s;
    const wx = P.px + (P.x - P.px) * a, wy = P.py + (P.y - P.py) * a;
    const x = SX(v, wx), y = SY(v, wy);
    // 착지 찌그러짐 · 오를 때 늘어남 (움직임 줄이기 설정이면 생략). 개구리는 더 말랑, 펭귄은 덜
    const look = charOf(W.char || v.char).look;
    const soft = look === 'frog' ? 1.4 : look === 'penguin' ? 0.75 : 1;
    let sx = 1, sy = 1;
    if (!v.calm) {
      const k = W.t - P.land;
      if (k >= 0 && k < 0.2) { const q = Math.sin((1 - k / 0.2) * Math.PI * 0.5) * 0.2 * soft; sx = 1 + q; sy = 1 - q; }
      else if (P.vy > 0) { const q = Math.min(0.14, P.vy / 7000) * soft; sx = 1 - q * 0.6; sy = 1 + q; }
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
    // 게임 판이면 판의 캐릭터(W.char), 미리보기면 v.char (예전 이름 v.skin도)
    const K = charOf(W.char || v.char || v.skin), L = LOOKS[K.look] || robot;
    glow(ctx, dead ? 'rgba(255,77,109,0.6)' : 'rgba(' + K.glow + ',0.6)', x, y, r * 2.5, 0.8);
    const lean = Math.max(-1, Math.min(1, P.vx / W.ctl.maxVx));
    const sinceLand = W.t - (P.land == null ? -9 : P.land);
    const S = {
      lean, face: P.face || 1, t: W.t, calm: !!v.calm, dead, cause: W.cause, rocket: W.rocket > 0,
      up: W.rocket > 0 ? 1 : Math.max(0, Math.min(1, P.vy / 900)),
      fall: W.rocket > 0 ? 0 : Math.max(0, Math.min(1, -P.vy / 700)),
      land: v.calm ? 0 : Math.max(0, 1 - sinceLand / 0.25),
      look: -Math.max(-1, Math.min(1, P.vy / 1400)),
      blink: !v.calm && !dead && (W.t % 3.3) < 0.12,
    };
    ctx.save();
    ctx.translate(x, y + r);
    ctx.scale(sx, sy);
    ctx.translate(0, -r);
    // 가는 쪽으로 몸을 살짝 기울인다 (움직임 줄이기면 똑바로)
    if (!v.calm) ctx.rotate(lean * 0.14);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    L.back(ctx, K, r, S);                       // 몸 뒤: 안테나·다리·귀·발·제트팩
    const spr = bodySprite(Math.round(r), v.dpr, K.id), half = Math.round(r) + Math.ceil(Math.round(r) * 0.2) + 4;
    ctx.drawImage(spr, -half, -half, half * 2, half * 2);   // 몸통 (미리 그린 광택 몸)
    L.front(ctx, K, r, S);                      // 몸 앞: 얼굴·눈·날개·가리개
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
    // 한 번 더 뒤 지켜 주는 동안: 금빛 반짝 고리 (끝나 갈수록 흐려진다)
    if (W.safeT > 0) {
      const k = Math.min(1, W.safeT / 1), wob = v.calm ? 1 : 0.8 + Math.sin(W.t * 12) * 0.2;
      glow(ctx, 'rgba(255,230,109,0.5)', x, y, r * 2.4, 0.7 * k);
      ctx.globalAlpha = k * wob;
      ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = Math.max(2, r * 0.12); ctx.setLineDash([r * 0.5, r * 0.3]);
      ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 1.7, v.calm ? 0 : W.t * 3, (v.calm ? 0 : W.t * 3) + TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
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
    if (!W.L.rescues) {
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
    const n = W.rescueMax, s = Math.max(0.55, Math.min(1.2, v.scale));
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
    const big = Math.min(54 * s, sw * 0.3);
    // 점수판 뒤에는 늘 짙은 유리 판을 깐다: 블랙홀·행성·새·구름이 뒤로 지나가도 글자가 또렷하게 (2026-09-27 점검).
    // 판 높이는 아래에서 쓸 줄 수만큼 (sideHudRows와 같은 계산)
    {
      const px = x0 - 14 * s, pw = right - px + 8 * s, ph = sideHudHeight(W, v, big) + 26 * s;
      ctx.fillStyle = 'rgba(5,8,18,0.84)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px, y - 14 * s, pw, ph, 14 * s); else ctx.rect(px, y - 14 * s, pw, ph); ctx.fill();
      ctx.strokeStyle = 'rgba(94,231,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    // 난이도 · 지금 구역
    const PL = placeOf(W);
    ctx.font = Math.round(15 * s) + 'px ' + DISP;
    ctx.fillStyle = '#8aa4b8';
    const dn = W.L.name + ' · ';
    ctx.fillText(dn, x0, y);
    ctx.fillStyle = PL.color;
    ctx.fillText(PL.planet ? PL.name + ' 근처' : PL.name, x0 + ctx.measureText(dn).width, y);
    y += 26 * s;
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
    // 최고 기록: 처음 하는 판(기록 없음)에는 보이지 않는다. 넘어서면 금색으로 "최고 기록!"
    if (v.bestH > 0) {
      const over = W.height > v.bestH;
      ctx.font = Math.round(16 * s) + 'px ' + DISP; ctx.fillStyle = over ? '#ffe66d' : '#bcd3e2';
      ctx.fillText(over ? '최고 기록! ' + W.height + ' m' : '최고 ' + v.bestH + ' m', x0, y);
      y += 30 * s;
    }
    // 콤보 칩: 이어서 더 높이 밟은 수 · 별 점수 배율
    if (W.combo >= D.COMBO.show) {
      // 별 점수가 커진 만큼 작은 별을 하나씩 (배율 숫자 대신)
      const mul = JP.World.comboMul(W.combo), pips = Math.round((mul - 1) / D.COMBO.add);
      ctx.font = Math.round(18 * s) + 'px ' + DISP;
      const txt = '콤보 ' + W.combo, tw = ctx.measureText(txt).width;
      const sub = pips > 0 ? '★'.repeat(pips) : '', ch = 30 * s;
      ctx.font = Math.round(15 * s) + 'px ' + DISP;
      const sw2 = sub ? ctx.measureText(sub).width + 10 * s : 0;
      ctx.fillStyle = 'rgba(60,10,50,0.75)'; ctx.strokeStyle = 'rgba(255,94,200,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y, tw + sw2 + 22 * s, ch, ch / 2); else ctx.rect(x0, y, tw + sw2 + 22 * s, ch); ctx.fill(); ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.font = Math.round(18 * s) + 'px ' + DISP; ctx.fillStyle = '#ff9ee0';
      ctx.fillText(txt, x0 + 11 * s, y + ch / 2 + 1);
      if (sub) { ctx.font = Math.round(15 * s) + 'px ' + DISP; ctx.fillStyle = '#ffe66d'; ctx.fillText(sub, x0 + 11 * s + tw + 10 * s, y + ch / 2 + 1); }
      ctx.textBaseline = 'top';
      y += ch + 12 * s;
    }
    if (W.rescueMax) {
      ctx.font = Math.round(15 * s) + 'px ' + DISP; ctx.fillStyle = '#8aa4b8';
      ctx.fillText('구조 구름', x0, y);
      const gap = Math.min(30 * s, (sw - 24 * s) / Math.max(1, W.rescueMax));
      for (let i = 0; i < W.rescueMax; i++) cloudIcon(ctx, x0 + 12 * s + i * gap, y + 34 * s, 1.2 * s * Math.min(1, gap / (30 * s)), i < W.rescues);
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
      ctx.fillStyle = '#ff9f43'; ctx.fillRect(x0 + 44 * s, y + 6 * s, bw * Math.min(1, W.rocket / W.rocketTime), 8 * s);
      y += 30 * s;
    }
    // 피버 게이지: 가득 차면 FEVER
    if (W.fever > 0 || W.feverT > 0) {
      const on = W.feverT > 0, k = on ? W.feverT / D.FEVER.time : W.fever;
      ctx.font = Math.round(15 * s) + 'px ' + DISP; ctx.fillStyle = on ? '#ff9ee0' : '#d8a8d0';
      ctx.fillText(on ? '피버!' : '피버', x0, y);
      const bw = Math.min(sw - 60 * s, 110 * s), bx = x0 + 56 * s;
      ctx.fillStyle = 'rgba(255,94,200,0.18)'; ctx.fillRect(bx, y + 6 * s, bw, 8 * s);
      ctx.fillStyle = on ? '#ffe66d' : '#ff5ec8'; ctx.fillRect(bx, y + 6 * s, bw * Math.min(1, k), 8 * s);
      y += 28 * s;
    }
    // 블랙홀 구간: 끌리는 쪽 화살표
    if (W.hole && W.phase === 'play') {
      ctx.font = Math.round(16 * s) + 'px ' + DISP; ctx.fillStyle = '#c9a0ff';
      ctx.fillText(W.hole.side < 0 ? '← 블랙홀이 끌어요' : '블랙홀이 끌어요 →', x0, y);
      y += 30 * s;
    }
    // 먹구름까지 남은 높이: 가까울수록 막대가 차고 빨개진다
    const sg = stormGap(W);
    if (sg != null) {
      const near = sg < D.STORM.warn, full = W.viewH * D.STORM.lag / D.METER + 4;
      ctx.font = Math.round(15 * s) + 'px ' + DISP; ctx.fillStyle = near ? '#ff8a96' : '#b9a6ff';
      const lt = '먹구름 ' + Math.floor(sg) + 'm 아래';
      ctx.fillText(lt, x0, y);
      const bw = Math.min(sw - 8 * s, 150 * s), by = y + 24 * s;
      ctx.fillStyle = 'rgba(169,139,255,0.18)'; ctx.fillRect(x0, by, bw, 8 * s);
      const k = Math.max(0.04, Math.min(1, 1 - sg / full));
      ctx.fillStyle = near ? '#ff4d6d' : '#a98bff'; ctx.fillRect(x0, by, bw * k, 8 * s);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 옆자리 점수판 높이 (drawSideHud가 한 줄씩 내려가는 만큼, 뒤 판 크기용)
  function sideHudHeight(W, v, big) {
    const s = v.ui;
    let h = 26 * s + 18 * s + big + 10 * s + 36 * s;
    if (v.bestH > 0) h += 30 * s;
    if (W.combo >= D.COMBO.show) h += 42 * s;
    if (W.rescueMax) h += 56 * s;
    if (W.shield) h += 30 * s;
    if (W.rocket > 0) h += 30 * s;
    if (W.fever > 0 || W.feverT > 0) h += 28 * s;
    if (W.hole && W.phase === 'play') h += 30 * s;
    if (stormGap(W) != null) h += 34 * s;
    return h - 10 * s;
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
    if (W.combo >= D.COMBO.show) items.push(['콤보 ' + W.combo, '#ff9ee0']);
    if (W.L.rescues) items.push(['구름 ' + W.rescues, '#e9f6ff']);
    if (W.shield) items.push(['방울', '#7fd3ff']);
    const sg = stormGap(W);
    if (sg != null) items.push(['먹구름 ' + Math.floor(sg) + 'm', sg < D.STORM.warn ? '#ff8a96' : '#b9a6ff']);
    if (W.hole && W.phase === 'play') items.push([W.hole.side < 0 ? '← 블랙홀' : '블랙홀 →', '#c9a0ff']);
    if (W.feverT > 0) items.push(['피버!', '#ff9ee0']); else if (W.fever >= 0.3) items.push(['피버 ' + Math.floor(W.fever * 100) + '%', '#d8a8d0']);
    if (v.bestH > 0) items.push(W.height > v.bestH ? ['최고 기록!', '#ffe66d'] : ['최고 ' + v.bestH + ' m', '#bcd3e2']);
    for (const [txt, col] of items) {
      if (x - 70 * s < v.hudLeft) break; // 버튼 묶음과 겹치면 생략
      x -= chip(ctx, x, cy, ch, txt, col, s) + 6 * s;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 누르는 자리 안내: 양옆 아래 작은 화살표 (D.PAD). 누르고 있는 쪽이 밝아진다
  function drawControls(ctx, W, v) {
    const I = v.pad, side = I ? I.side : 0;
    const T = W.tut && !W.tut.done ? W.tut : null;
    const want = T ? (T.left ? 1 : -1) : 0;   // 처음 안내: 눌러 볼 쪽
    const show = v.touch || (I && I.used) || W.t < D.HINT_TIME || T;
    if (!show) return;
    const pulse = W.t < D.HINT_TIME && !v.calm ? 0.12 + Math.sin(W.t * 5) * 0.08 : 0;
    let size, lx, rx, y;
    size = Math.min(D.PAD.max, D.PAD.size * Math.max(1, v.ui * 0.9));
    if (v.side) {
      lx = v.cx / 2; rx = v.cx + v.cw + (v.w - v.cx - v.cw) / 2; y = v.h - size * 2.4;
    } else {
      lx = v.cx + size * 1.6; rx = v.cx + v.cw - size * 1.6; y = v.cy + v.ch - size * 1.8;
    }
    for (const d of [-1, 1]) {
      const on = side === d, x = d < 0 ? lx : rx, ask = want === d;
      const a = (on ? 0.85 : v.side ? 0.3 : 0.2) + (ask ? 0.5 : pulse);
      // 짙은 받침: 행성·풍선·구름 위에서도 화살표가 사라지지 않게
      ctx.fillStyle = 'rgba(4,7,14,0.62)';
      ctx.beginPath(); ctx.arc(x, y, size * 1.3, 0, TAU); ctx.fill();
      if (on) glow(ctx, 'rgba(94,231,255,0.5)', x, y, size * 1.8, 0.8);
      if (ask) glow(ctx, 'rgba(255,230,109,0.45)', x, y, size * 1.8, 0.8);
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = 'rgba(12,22,38,0.6)';
      ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
      ctx.strokeStyle = ask ? '#ffe66d' : on ? '#bff8ff' : '#5ee7ff'; ctx.lineWidth = Math.max(2, size * 0.06);
      ctx.stroke();
      ctx.strokeStyle = on ? '#ffffff' : '#bff8ff'; ctx.lineWidth = Math.max(2, size * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const k = size * 0.32;
      for (const off of [-0.18, 0.2]) {
        const cx = x + d * size * off;
        ctx.beginPath(); ctx.moveTo(cx - d * k * 0.6, y - k); ctx.lineTo(cx + d * k * 0.4, y); ctx.lineTo(cx - d * k * 0.6, y + k); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
  }

  // 글자 한 줄 (검은 테두리)
  function outlined(ctx, t, x, y, fill) {
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }

  // 처음 몇 초 조작 안내. 처음 해 보는 판(W.tut)은 양쪽을 다 눌러 볼 때까지 큰 안내
  // 처음 안내의 큰 화살표: 눌러 볼 쪽 기둥 안에 반투명하게 (안내 글 바로 아래, 퍼지는 노란 고리)
  function tutArrow(ctx, W, v, d, y) {
    const sz = Math.max(34, Math.min(70, v.cw * 0.13)), x = v.cx + v.cw * (d < 0 ? 0.2 : 0.8);
    const k = v.calm ? 0.5 : (W.t * 1.2) % 1, bob = v.calm ? 0 : Math.sin(W.t * 6) * sz * 0.12;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(4,7,14,0.7)';
    ctx.beginPath(); ctx.arc(x, y, sz * 1.15, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = Math.max(3, sz * 0.07);
    ctx.beginPath(); ctx.arc(x, y, sz * (1.15 + k * 0.5), 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(255,230,109,0.85)'; ctx.strokeStyle = 'rgba(40,30,4,0.9)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    const ax = x + d * bob;
    ctx.beginPath();
    ctx.moveTo(ax + d * sz * 0.72, y);
    ctx.lineTo(ax - d * sz * 0.05, y - sz * 0.62);
    ctx.lineTo(ax - d * sz * 0.05, y - sz * 0.26);
    ctx.lineTo(ax - d * sz * 0.66, y - sz * 0.26);
    ctx.lineTo(ax - d * sz * 0.66, y + sz * 0.26);
    ctx.lineTo(ax - d * sz * 0.05, y + sz * 0.26);
    ctx.lineTo(ax - d * sz * 0.05, y + sz * 0.62);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawIntro(ctx, W, v) {
    const T = W.tut;
    // 안내 글은 기둥 위쪽: 주인공 바로 위 발판들을 가리지 않게 (2026-09-27 점검)
    const cx = v.cx + v.cw / 2, cy = v.cy + v.ch * 0.1 + 20;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.round(Math.max(18, Math.min(30, v.cw * 0.058)));
    if (T && (!T.done || W.t - T.at < 1.6)) {
      let lines, a = 1;
      if (T.done) { lines = [['잘했어요!', '#ffe66d'], [v.touch ? '손가락으로 밀어도 돼요' : '이제 위로 위로!', '#bff8ff']]; a = Math.min(1, (1.6 - (W.t - T.at)) * 2); }
      else if (!T.left) lines = v.touch ? [['화면 왼쪽을 누르면', '#ffe66d'], ['왼쪽으로 가요', '#bff8ff']] : [['← 키를 누르면', '#ffe66d'], ['왼쪽으로 가요', '#bff8ff']];
      else lines = v.touch ? [['이번엔 화면 오른쪽!', '#ffe66d'], ['오른쪽으로 가요', '#bff8ff']] : [['이번엔 → 키!', '#ffe66d'], ['오른쪽으로 가요', '#bff8ff']];
      // 뒤에 어두운 판을 깔아 어느 배경에서도 잘 보이게
      const big = Math.round(fs * 1.15);
      ctx.font = big + 'px ' + DISP;
      const bw = Math.min(v.cw - 20, Math.max(...lines.map(l => ctx.measureText(l[0]).width)) + big * 1.6), bh = big * 3.3;
      ctx.globalAlpha = a * 0.78;
      ctx.fillStyle = 'rgba(6,10,20,0.9)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - bw / 2, cy - big * 1.1, bw, bh, big * 0.6); else ctx.rect(cx - bw / 2, cy - big * 1.1, bw, bh); ctx.fill();
      ctx.globalAlpha = a;
      lines.forEach(([t, col], i) => { ctx.font = (i ? fs : big) + 'px ' + DISP; outlined(ctx, t, cx, cy + i * big * 1.35, col); });
      ctx.globalAlpha = 1;
      if (!T.done) tutArrow(ctx, W, v, T.left ? 1 : -1, cy - big * 1.1 + bh + Math.max(34, Math.min(70, v.cw * 0.13)) * 1.5);
      ctx.textBaseline = 'alphabetic';
      return;
    }
    const a = Math.max(0, Math.min(1, D.HINT_TIME - W.t));
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.font = fs + 'px ' + DISP;
    const lines = v.touch ? ['왼쪽·오른쪽을 누르거나', '손가락으로 밀어 움직여요'] : ['← → 방향키로', '움직여요'];
    lines.forEach((t, i) => outlined(ctx, t, cx, cy + i * fs * 1.35, i ? '#bff8ff' : '#ffe66d'));
    if (!W.L.rescues) {
      ctx.font = Math.round(fs * 0.8) + 'px ' + DISP;
      outlined(ctx, '아래로 떨어지면 끝!', cx, cy + fs * 3, '#ff8a96');
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  // 구역 도착 배너 · 100m 축하 글자 (기둥 위쪽, 화면 좌표)
  function drawBanner(ctx, W, v) {
    const cx = v.cx + v.cw / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const B = R.banner;
    if (B) {
      const age = B.max - B.life, a = Math.min(1, age * 4, B.life * 2.5);
      const pop = v.calm ? 1 : 1 + Math.max(0, 0.25 - age) * 1.2;
      const fs = Math.round(Math.max(26, Math.min(46, v.cw * 0.085)) * pop), y = v.cy + v.ch * 0.2;
      ctx.font = fs + 'px ' + DISP;
      const titleW = ctx.measureText(B.title).width;
      // 한 줄 글(행성 한 줄·블랙홀 안내)은 둥근 글꼴, 숫자(높이)는 숫자 글꼴. 상자는 제목과 한 줄 중 넓은 쪽에 맞추고,
      // 기둥보다 넓으면 한 줄 글자를 줄여 상자 안에 들어가게 (2026-09-27 점검: 한 줄이 상자 밖으로 삐져나왔다)
      let sf = Math.round(fs * (B.text ? 0.46 : 0.5));
      const subFont = () => (B.text ? '' : '700 ') + sf + 'px ' + (B.text ? DISP : NUM);
      ctx.font = subFont();
      let sw = B.sub ? ctx.measureText(B.sub).width : 0;
      const maxW = v.cw - 16;
      const bw = Math.min(maxW, Math.max(titleW + fs * 1.4, sw + fs * 1.0)), bh = fs * 2.2;
      if (sw > bw - fs * 0.8) { sf = Math.max(11, Math.floor(sf * (bw - fs * 0.8) / sw)); ctx.font = subFont(); sw = ctx.measureText(B.sub).width; }
      ctx.font = fs + 'px ' + DISP;
      ctx.globalAlpha = a;
      glow(ctx, 'rgba(255,255,255,0.25)', cx, y + fs * 0.3, bw * 0.6, 0.8);
      ctx.fillStyle = 'rgba(6,10,20,0.72)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - bw / 2, y - fs * 0.8, bw, bh, fs * 0.5); else ctx.rect(cx - bw / 2, y - fs * 0.8, bw, bh); ctx.fill();
      ctx.strokeStyle = B.color; ctx.lineWidth = 2; ctx.stroke();
      if (titleW > bw - fs * 0.4) ctx.font = Math.max(14, Math.floor(fs * (bw - fs * 0.4) / titleW)) + 'px ' + DISP;
      outlined(ctx, B.title, cx, y, B.color);
      if (B.sub) { ctx.font = subFont(); outlined(ctx, B.sub, cx, y + fs * 0.85, '#e8f7ff'); }
    }
    const G = R.big;
    if (G) {
      const age = G.max - G.life, a = Math.min(1, age * 5, G.life * 2);
      const sc = v.calm ? 1 : 0.7 + Math.min(1, age * 5) * 0.3 + age * 0.08;
      const fs = Math.round(Math.max(34, Math.min(64, v.cw * 0.12)) * sc), y = v.cy + v.ch * 0.24;
      ctx.globalAlpha = a;
      ctx.font = '700 ' + fs + 'px ' + NUM;
      glow(ctx, 'rgba(255,230,109,0.45)', cx, y, fs * 1.8, 0.9);
      outlined(ctx, G.txt, cx, y, '#ffe66d');
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // view: {dpr, w, h, cx, cy, cw, ch, scale, side, ui, hudMid, hudLeft, hudRight, hud, touch, calm, bestH, pad}
  function draw(ctx, W, v, dt) {
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const a = W.phase === 'play' ? W.alpha : 1;
    CAM = W.pcam + (W.cam - W.pcam) * a;
    R.occ.length = 0;
    takeFx(W, v);
    updateFx(dt || 0);
    drawBackground(ctx, W, v, dt);
    // 이번 프레임 글자 자리: 시간 막대 · 주인공 · 주인공이 노리는 발판 (이름표가 피한다)
    R.occ.length = 0; R.fixed.length = 0;
    if (v.hud !== false && W.phase === 'play') {
      const tr = timersRect(W, v);
      if (tr) { R.fixed.push(tr); R.occ.push(tr); }
      const P = W.p, r = D.PLAYER.r * v.scale, hx = SX(v, P.px + (P.x - P.px) * a), hy = SY(v, P.py + (P.y - P.py) * a);
      occupy(hx - r * 1.8, hy - r * 2.4, r * 3.6, r * 3.8);
      const reach = (W.phys ? W.phys.jump : D.PLAYER.jump) * 1.6;
      for (const p of W.plats) {
        if (!p.main || p.broken || p.y < P.y - D.PLAYER.r * 2 || p.y > P.y + reach) continue;
        const wp = p.w * v.scale;
        occupy(SX(v, p.x) - wp / 2, SY(v, p.y) - r * 2.2, wp, r * 2.2 + D.PLAT.h * v.scale);
      }
    }
    ctx.save();
    if (R.shake > 0) ctx.translate((Math.random() - 0.5) * R.shake, (Math.random() - 0.5) * R.shake);
    ctx.beginPath(); ctx.rect(v.cx, v.cy, v.cw, v.ch); ctx.clip();
    drawRoom(ctx, W, v);
    if (!W.room) { drawPull(ctx, W, v); drawMarks(ctx, W, v); }
    drawPlats(ctx, W, v, a);
    drawGifts(ctx, W, v);
    drawStars(ctx, W, v);
    drawItems(ctx, W, v);
    drawMines(ctx, W, v);
    drawMonsters(ctx, W, v, a);
    drawRescue(ctx, v);
    drawDust(ctx, v);
    drawPlayer(ctx, W, v, a);
    drawFx(ctx, v);
    if (!W.room) { drawStorm(ctx, W, v, a); drawBottom(ctx, W, v); }
    drawFeverEdge(ctx, W, v);
    ctx.restore();
    // 구름 속을 지나는 동안 앞에도 구름이 흘러 지나간다
    if (JP.Sky && !W.room) JP.Sky.drawCloudFront(ctx, v, CAM, performance.now() / 1000);
    if (R.flash > 0) {
      ctx.fillStyle = 'rgba(255,77,109,' + (R.flash * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
    if (v.hud !== false) {
      if (v.side) drawSideHud(ctx, W, v); else drawTopHud(ctx, W, v);
      if (W.phase === 'play') { drawControls(ctx, W, v); drawIntro(ctx, W, v); if (!W.room) drawStormHint(ctx, W, v); drawTimers(ctx, W, v); }
      drawBanner(ctx, W, v);
    }
  }

  // 멈춘 화면처럼 입자가 남아 있는지 (다 사라지면 그리기를 쉰다)
  const busy = () => R.parts.length > 0 || R.shake > 0 || R.flash > 0 || R.clouds.length > 0 || R.squash.length > 0 || !!R.banner || !!R.big;

  JP.Render = { draw, layout, busy, paintChar, paintSkin: paintChar, paintPlace, placeOf };
})(JP);
