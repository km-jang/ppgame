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
    } else if (Z.id === 'space') {
      // 멀리 고리 달린 행성 (기둥 왼쪽 위)
      const px = w * 0.13, py = h * 0.3, pr = Math.min(w, h) * 0.09;
      puff(px, py, pr * 2.6, 'rgba(120,90,255,0.25)');
      const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, '#c7b8ff'); pg.addColorStop(0.55, '#6a4bd6'); pg.addColorStop(1, '#231454');
      g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(210,200,255,0.55)'; g.lineWidth = pr * 0.12;
      g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, 0, TAU); g.stroke();
      puff(w * 0.9, h * 0.75, Math.min(w, h) * 0.05, 'rgba(94,231,255,0.5)');
    } else if (Z.id === 'stars') {
      // 별나라: 빛나는 은하 띠
      g.save(); g.translate(w / 2, h / 2); g.rotate(-0.5);
      const band = g.createLinearGradient(0, -h * 0.2, 0, h * 0.2);
      band.addColorStop(0, 'rgba(255,94,200,0)'); band.addColorStop(0.5, 'rgba(255,190,240,0.3)'); band.addColorStop(1, 'rgba(255,94,200,0)');
      g.fillStyle = band; g.fillRect(-w, -h * 0.2, w * 2, h * 0.4);
      g.restore();
      for (let i = 0; i < 6; i++) puff(rand() * w, rand() * h, Math.min(w, h) * (0.03 + rand() * 0.04), 'rgba(255,230,109,0.45)');
    }
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

  // 주인공 몸통 (반지름·배율별 한 번): 광택 네온 공
  const bodyCache = {};
  const skinOf = id => D.SKINS.find(k => k.id === id) || D.SKINS[0];
  function bodySprite(r, dpr, skin) {
    const K = skinOf(skin);
    const key = r + '|' + dpr + '|' + K.id;
    let c = bodyCache[key];
    if (c) return c;
    const m = 4, size = (r + m) * 2;
    c = document.createElement('canvas');
    c.width = c.height = Math.round(size * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(r + m, r + m);
    const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    grad.addColorStop(0, K.body[0]); grad.addColorStop(0.35, K.body[1]); grad.addColorStop(1, K.body[2]);
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    // 아래쪽 반사광 (주황 네온)
    const rim = g.createLinearGradient(0, r * 0.3, 0, r);
    rim.addColorStop(0, 'rgba(' + K.rim + ',0)'); rim.addColorStop(1, 'rgba(' + K.rim + ',0.55)');
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
  const R = { bgKey: '', zones: [], cloudLayer: null, stars: null, colKey: '', col: null, mileKey: '', miles: {},
    parts: [], texts: [], clouds: [], shake: 0, flash: 0, world: null, banner: null, big: null };
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
    if (R.world !== W) { R.world = W; R.parts.length = 0; R.texts.length = 0; R.clouds.length = 0; R.shake = 0; R.flash = 0; R.banner = null; R.big = null; }
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
        R.banner = { title: Z.banner, sub: Z.from + ' m', color: Z.color, life: 2.6, max: 2.6 };
        R.big = null;   // 구역 배너가 100m 글자보다 먼저
        ring(f.x, f.y, 110 * s, Z.color, 0.8);
        burst(f.x, f.y, 34, [Z.color, '#ffffff', '#ffe66d'], 520, 6 * s);
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
      if (q.dust) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.88; q.vy *= 0.9; }
      else if (!q.ring) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy = q.vy * 0.9 - 300 * dt; }
    }
    for (let i = R.texts.length - 1; i >= 0; i--) { const q = R.texts[i]; q.life -= dt; q.y += 40 * dt; if (q.life <= 0) R.texts.splice(i, 1); }
    for (let i = R.clouds.length - 1; i >= 0; i--) { const q = R.clouds[i]; q.life -= dt; q.y += 30 * dt; if (q.life <= 0) R.clouds.splice(i, 1); }
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
      const x = Math.max(v.cx + hw, Math.min(v.cx + v.cw - hw, SX(v, q.x))), y = SY(v, q.y);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(q.txt, x, y);
      ctx.fillStyle = q.color; ctx.fillText(q.txt, x, y);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // ─── 배경 ─────────────────────────────────────────────────
  // 화면 가운데 높이(m)에서 지금 구역과 다음 구역을 얼마나 섞을지: [구역, 다음 구역, 섞는 정도 0 ~ 1]
  function zoneBlend(m) {
    const Z = D.ZONES;
    let i = 0;
    for (let k = 0; k < Z.length; k++) if (m >= Z[k].from - D.ZONE_FADE) i = k;
    // i는 이미 섞이기 시작한 구역. 경계 앞 ZONE_FADE m 동안 앞 구역에서 넘어간다
    if (i === 0) return [0, 0, 0];
    const t = Math.max(0, Math.min(1, (m - (Z[i].from - D.ZONE_FADE)) / D.ZONE_FADE));
    return [i - 1, i, t];
  }
  function drawBackground(ctx, W, v) {
    const bk = v.w + 'x' + v.h;
    if (R.bgKey !== bk) { R.bgKey = bk; R.zones = []; R.cloudLayer = null; R.stars = makeStars(v.w, v.h); }
    const zone = i => R.zones[i] || (R.zones[i] = paintZone(D.ZONES[i], v.w, v.h));
    const m = (CAM + v.viewH * 0.5) / D.METER;
    const [a, b, t] = zoneBlend(m);
    const A = D.ZONES[a], B = D.ZONES[b];
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
    const key = [v.cw, v.ch, v.w, v.dpr].join(',');
    if (R.colKey !== key) { R.colKey = key; R.col = paintColumn(v, v.dpr); }
    ctx.drawImage(R.col, v.cx - CM, v.cy - CM, v.cw + CM * 2, v.ch + CM * 2);
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
        const txt = m + ' m', tw = ctx.measureText(txt).width + fs * 0.8;
        ctx.fillStyle = gold ? 'rgba(40,30,4,0.85)' : 'rgba(4,20,30,0.8)';
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(v.cx + 6, y - fs * 1.5, tw, fs * 1.25, fs * 0.35); else ctx.rect(v.cx + 6, y - fs * 1.5, tw, fs * 1.25); ctx.fill();
        ctx.fillStyle = gold ? '#ffe66d' : '#bff8ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, v.cx + 6 + tw / 2, y - fs * 0.86);
        continue;
      }
      ctx.fillStyle = 'rgba(94,231,255,0.08)';
      ctx.fillRect(v.cx, y, v.cw, 1);
      ctx.font = '700 ' + Math.round(Math.max(11, 13 * v.scale * 1.2)) + 'px ' + NUM;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(160,190,210,0.5)';
      ctx.fillText(m + 'm', v.cx + 6, y - 2);
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

  // 머리 장식 (꾸미기). front=false: 몸 뒤에 그릴 것, true: 몸 앞에 그릴 것. 좌표는 몸 가운데가 (0,0)
  function drawHat(ctx, hat, r, lean, front) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const antenna = (col, tip) => {
      const tipX = -lean * r * 0.45 + r * 0.15, tipY = -r * 1.55;
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, r * 0.1);
      ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.9); ctx.quadraticCurveTo(r * 0.15, -r * 1.3, tipX, tipY); ctx.stroke();
      glow(ctx, 'rgba(255,230,109,0.9)', tipX, tipY, r * 0.55, 0.9);
      ctx.fillStyle = tip; ctx.beginPath(); ctx.arc(tipX, tipY, r * 0.16, 0, TAU); ctx.fill();
      return [tipX, tipY];
    };
    const leaf = (x, y, len, ang, col) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(0,60,20,0.45)'; ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.moveTo(len * 0.1, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke();
      ctx.restore();
    };
    if (!front) {
      if (hat === 'antenna') antenna('#bff8ff', '#ffe66d');
      else if (hat === 'leaf') {
        const w = -lean * r * 0.12;
        leaf(w, -r * 0.88, r * 0.62, -Math.PI * 0.85, '#3dd96b');
        leaf(w, -r * 0.88, r * 0.62, -Math.PI * 0.15, '#2fc45c');
        leaf(w, -r * 0.88, r * 0.5, -Math.PI * 0.5, '#55ef80');
      } else if (hat === 'sprout') {
        const tx = -lean * r * 0.3, ty = -r * 1.35;
        ctx.strokeStyle = '#2fc45c'; ctx.lineWidth = Math.max(1.5, r * 0.09);
        ctx.beginPath(); ctx.moveTo(0, -r * 0.92); ctx.quadraticCurveTo(tx * 0.3, -r * 1.15, tx, ty); ctx.stroke();
        leaf(tx, ty, r * 0.55, -Math.PI * 0.95 - lean * 0.2, '#7dff9a');
        leaf(tx, ty, r * 0.55, -Math.PI * 0.05 - lean * 0.2, '#5ff08a');
      } else if (hat === 'bolt') {
        const [tx, ty] = antenna('#fff4c2', '#ffffff');
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#8a4a00'; ctx.lineWidth = Math.max(1, r * 0.05);
        const k = r * 0.32;
        ctx.beginPath();
        ctx.moveTo(tx + k * 0.2, ty - k * 1.1); ctx.lineTo(tx - k * 0.55, ty + k * 0.1); ctx.lineTo(tx - k * 0.02, ty + k * 0.1);
        ctx.lineTo(tx - k * 0.25, ty + k * 1.05); ctx.lineTo(tx + k * 0.6, ty - k * 0.2); ctx.lineTo(tx + k * 0.05, ty - k * 0.2); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (hat === 'helmet') antenna('#e8f0ff', '#5ee7ff');
      return;
    }
    if (hat === 'helmet') {
      // 유리 헬멧: 몸을 감싸는 투명한 공 + 반사광 + 목 둘레 고리
      ctx.fillStyle = 'rgba(190,230,255,0.13)';
      ctx.strokeStyle = 'rgba(220,240,255,0.75)'; ctx.lineWidth = Math.max(1.5, r * 0.07);
      ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 1.24, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 1.05, Math.PI * 1.12, Math.PI * 1.42); ctx.stroke();
      ctx.fillStyle = '#9fb3cc';
      ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.78, r * 0.2, 0, 0, TAU); ctx.fill();
    } else if (hat === 'crown') {
      const w = r * 0.62, b = -r * 0.82, h = r * 0.55, sh = -lean * r * 0.1;
      glow(ctx, 'rgba(255,207,58,0.8)', sh, b - h * 0.5, r * 0.9, 0.7);
      const g = ctx.createLinearGradient(0, b - h, 0, b);
      g.addColorStop(0, '#fff6c2'); g.addColorStop(1, '#e0a000');
      ctx.fillStyle = g; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      ctx.moveTo(sh - w, b); ctx.lineTo(sh - w, b - h * 0.6); ctx.lineTo(sh - w * 0.5, b - h * 0.25); ctx.lineTo(sh, b - h);
      ctx.lineTo(sh + w * 0.5, b - h * 0.25); ctx.lineTo(sh + w, b - h * 0.6); ctx.lineTo(sh + w, b); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(sh, b - h * 0.35, r * 0.09, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5ee7ff';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(sh + d * w * 0.55, b - h * 0.2, r * 0.065, 0, TAU); ctx.fill(); }
    }
  }

  // 상점 미리보기: 캔버스 한가운데 로봇 공 하나 (움직임 없이)
  function paintSkin(cv, skin) {
    if (!cv) return;
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const r = Math.round(Math.min(w, h) * 0.27);
    const stub = { phase: 'play', rocket: 0, shield: false, t: 1, cause: null, p: { vx: 0, vy: 0 }, ctl: { maxVx: 1 } };
    drawBot(g, stub, { calm: true, dpr: 1, skin }, w / 2, h * 0.58, r, 1, 1);
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
      if (k >= 0 && k < 0.2) { const q = Math.sin((1 - k / 0.2) * Math.PI * 0.5) * 0.2; sx = 1 + q; sy = 1 - q; }
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
    const K = skinOf(v.skin);
    glow(ctx, dead ? 'rgba(255,77,109,0.6)' : 'rgba(' + K.glow + ',0.6)', x, y, r * 2.5, 0.8);
    const lean = Math.max(-1, Math.min(1, P.vx / W.ctl.maxVx));
    ctx.save();
    ctx.translate(x, y + r);
    ctx.scale(sx, sy);
    ctx.translate(0, -r);
    // 가는 쪽으로 몸을 살짝 기울인다 (움직임 줄이기면 똑바로)
    if (!v.calm) ctx.rotate(lean * 0.14);
    // 머리 장식 뒤쪽 (안테나·잎·번개, 꾸미기): 움직이는 반대쪽으로 살짝 휜다
    drawHat(ctx, K.hat, r, lean, false);
    // 몸통 (미리 그린 광택 공)
    const spr = bodySprite(Math.round(r), v.dpr, K.id), half = Math.round(r) + 4;
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
    drawHat(ctx, K.hat, r, lean, true);   // 앞쪽 장식 (헬멧 유리·왕관)
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
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    // 난이도 · 지금 구역
    const Z = D.ZONES[W.zone];
    ctx.font = Math.round(15 * s) + 'px ' + DISP;
    ctx.fillStyle = '#8aa4b8';
    const dn = W.L.name + ' · ';
    ctx.fillText(dn, x0, y);
    ctx.fillStyle = Z.color;
    ctx.fillText(Z.name, x0 + ctx.measureText(dn).width, y);
    y += 26 * s;
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
    // 콤보 칩: 이어서 더 높이 밟은 수 · 별 점수 배율
    if (W.combo >= D.COMBO.show) {
      const mul = JP.World.comboMul(W.combo);
      ctx.font = Math.round(18 * s) + 'px ' + DISP;
      const txt = '콤보 ' + W.combo, tw = ctx.measureText(txt).width;
      const sub = mul > 1 ? '별 ×' + mul : '', ch = 30 * s;
      ctx.font = '700 ' + Math.round(15 * s) + 'px ' + NUM;
      const sw2 = sub ? ctx.measureText(sub).width + 10 * s : 0;
      ctx.fillStyle = 'rgba(60,10,50,0.75)'; ctx.strokeStyle = 'rgba(255,94,200,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y, tw + sw2 + 22 * s, ch, ch / 2); else ctx.rect(x0, y, tw + sw2 + 22 * s, ch); ctx.fill(); ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.font = Math.round(18 * s) + 'px ' + DISP; ctx.fillStyle = '#ff9ee0';
      ctx.fillText(txt, x0 + 11 * s, y + ch / 2 + 1);
      if (sub) { ctx.font = '700 ' + Math.round(15 * s) + 'px ' + NUM; ctx.fillStyle = '#ffe66d'; ctx.fillText(sub, x0 + 11 * s + tw + 10 * s, y + ch / 2 + 1); }
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
    if (W.combo >= D.COMBO.show) items.push(['콤보 ' + W.combo, '#ff9ee0']);
    if (W.L.rescues) items.push(['구름 ' + W.rescues, '#e9f6ff']);
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
    const T = W.tut && !W.tut.done ? W.tut : null;
    const want = T ? (T.left ? 1 : -1) : 0;   // 처음 안내: 눌러 볼 쪽
    const show = v.touch || (I && I.used) || W.t < D.HINT_TIME || T;
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
      const on = side === d, x = d < 0 ? lx : rx, ask = want === d;
      const a = (on ? 0.85 : v.side ? 0.22 : 0.14) + (ask ? 0.6 : pulse);
      if (on) glow(ctx, 'rgba(94,231,255,0.5)', x, y, size * 1.8, 0.8);
      if (ask) {
        // 여기를 눌러요: 노란 빛 + 퍼지는 고리
        const k = v.calm ? 0.5 : (W.t * 1.2) % 1;
        glow(ctx, 'rgba(255,230,109,0.55)', x, y, size * 2, 0.9);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = Math.max(3, size * 0.08);
        ctx.beginPath(); ctx.arc(x, y, size * (1 + k * 0.7), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = 'rgba(12,22,38,0.6)';
      ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
      ctx.strokeStyle = ask ? '#ffe66d' : on ? '#bff8ff' : '#5ee7ff'; ctx.lineWidth = Math.max(2, size * 0.06);
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

  // 글자 한 줄 (검은 테두리)
  function outlined(ctx, t, x, y, fill) {
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }

  // 처음 몇 초 조작 안내. 처음 해 보는 판(W.tut)은 양쪽을 다 눌러 볼 때까지 큰 안내
  function drawIntro(ctx, W, v) {
    const T = W.tut;
    const cx = v.cx + v.cw / 2, cy = v.cy + v.ch * 0.3;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.round(Math.max(18, Math.min(30, v.cw * 0.058)));
    if (T && (!T.done || W.t - T.at < 1.6)) {
      let lines, a = 1;
      if (T.done) { lines = [['잘했어요!', '#ffe66d'], ['이제 위로 위로!', '#bff8ff']]; a = Math.min(1, (1.6 - (W.t - T.at)) * 2); }
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
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
      return;
    }
    const a = Math.max(0, Math.min(1, D.HINT_TIME - W.t));
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.font = fs + 'px ' + DISP;
    const lines = v.touch ? ['왼쪽·오른쪽을', '누르고 있으면 움직여요'] : ['← → 방향키로', '움직여요'];
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
      const bw = Math.min(v.cw - 16, ctx.measureText(B.title).width + fs * 1.4), bh = fs * 2.2;
      ctx.globalAlpha = a;
      glow(ctx, 'rgba(255,255,255,0.25)', cx, y + fs * 0.3, bw * 0.6, 0.8);
      ctx.fillStyle = 'rgba(6,10,20,0.72)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - bw / 2, y - fs * 0.8, bw, bh, fs * 0.5); else ctx.rect(cx - bw / 2, y - fs * 0.8, bw, bh); ctx.fill();
      ctx.strokeStyle = B.color; ctx.lineWidth = 2; ctx.stroke();
      outlined(ctx, B.title, cx, y, B.color);
      ctx.font = '700 ' + Math.round(fs * 0.5) + 'px ' + NUM;
      outlined(ctx, B.sub, cx, y + fs * 0.85, '#e8f7ff');
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
    drawDust(ctx, v);
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
      drawBanner(ctx, W, v);
    }
  }

  // 멈춘 화면처럼 입자가 남아 있는지 (다 사라지면 그리기를 쉰다)
  const busy = () => R.parts.length > 0 || R.shake > 0 || R.flash > 0 || R.clouds.length > 0 || !!R.banner || !!R.big;

  JP.Render = { draw, layout, busy, paintSkin };
})(JP);
