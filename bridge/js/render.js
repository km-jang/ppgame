'use strict';
// 그리기. 규칙(world.js)은 읽기만 한다. 판(1280×800)을 화면에 통째로 맞춰 늘리고, 남는 곳은 하늘과 땅을 이어 그린다.
// 비싼 그림(하늘·별·행성·먼 산 / 땅·바위 / 가장자리 어둡게)은 미리 그려 두고 찍기만 한다. 매 프레임 shadowBlur는 쓰지 않는다.
(function (BR) {
  const D = BR.DATA, PH = D.PHYS, VW = D.VIEW.w, VH = D.VIEW.h;
  const TAU = Math.PI * 2;
  const Wd = () => BR.World;

  // 행성 모양
  const THEME = {
    moon: { sky: ['#05060f', '#11163a', '#262c5a'], neb: ['rgba(120,140,255,0.20)', 'rgba(255,120,220,0.10)'],
      rock: ['#c4c8da', '#6a6f8a', '#30344a'], rim: '#eef4ff', far: '#1e2346', far2: '#141836', haze: '150,170,255',
      planet: { x: 1030, y: 150, r: 84, c: ['#9fd8ff', '#2f7bd8', '#123a7a'], land: '#4fd68a' }, weather: 'dust', music: 'earth' },
    mars: { sky: ['#12040a', '#3a0f14', '#7a2a1c'], neb: ['rgba(255,110,80,0.22)', 'rgba(180,70,255,0.14)'],
      rock: ['#c0553a', '#5a1a12', '#2a0a08'], rim: '#ffb07a', far: '#4a1512', far2: '#2c0b0c', haze: '255,160,120',
      planet: { x: 980, y: 140, r: 46, c: ['#e8dcc8', '#9a8a7a', '#3a3028'], moon2: true }, weather: 'sand', music: 'mars' },
  };
  const ICE = ['#e6fbff', '#8fd6f0', '#2a6a9a'];
  BR.THEME = THEME;

  // 그리기 상태 (규칙과 따로: 입자·흔들림·캐시)
  const R = { parts: [], sky: null, skyKey: '', ter: null, terKey: '', vig: null, vigKey: '', t: 0, weather: [], fit: { k: 1, ox: 0, oy: 0 } };

  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function starPath(g, cx, cy, R1, r, n, rot) {
    n = n || 5; rot = rot == null ? -Math.PI / 2 : rot;
    g.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, k = i % 2 ? r : R1; g.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); }
    g.closePath();
  }
  function glowDot(g, x, y, r, col, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a == null ? 1 : a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
  }
  function canvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch (e) { /* 아래로 */ } }
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  // 화면에 판 맞추기: k배, 가운데
  function fitOf(w, h) {
    const k = Math.min(w / VW, h / VH);
    return { k, ox: (w - VW * k) / 2, oy: (h - VH * k) / 2 };
  }
  // 화면 좌표 → 판 좌표
  function toLevel(sx, sy) { const f = R.fit; return [(sx - f.ox) / f.k, (sy - f.oy) / f.k]; }

  // ─── 하늘 (미리 그림) ─────────────────────────────────────
  function bigPlanet(g, P) {
    const { x, y, r, c } = P;
    glowDot(g, x, y, r * 2.2, 'rgba(160,200,255,0.16)');
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.1);
    gr.addColorStop(0, c[0]); gr.addColorStop(0.55, c[1]); gr.addColorStop(1, c[2]);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    if (P.land) { // 지구: 초록 땅과 흰 구름
      g.fillStyle = P.land; g.globalAlpha = 0.8;
      for (const [dx, dy, a, b] of [[-0.35, -0.1, 0.35, 0.22], [0.25, 0.25, 0.3, 0.18], [0.1, -0.45, 0.2, 0.1]]) { g.beginPath(); g.ellipse(x + dx * r, y + dy * r, a * r, b * r, 0.4, 0, TAU); g.fill(); }
      g.fillStyle = '#fff'; g.globalAlpha = 0.5;
      for (const [dx, dy, a] of [[-0.1, 0.05, 0.5], [0.3, -0.3, 0.35], [-0.4, 0.45, 0.3]]) { g.beginPath(); g.ellipse(x + dx * r, y + dy * r, a * r, 0.06 * r, -0.2, 0, TAU); g.fill(); }
    } else {
      g.globalAlpha = 0.25; g.fillStyle = '#000';
      for (const [dx, dy, rr0] of [[-0.3, -0.2, 0.18], [0.3, 0.2, 0.14], [0.05, 0.45, 0.1]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, rr0 * r, 0, TAU); g.fill(); }
    }
    g.globalAlpha = 1;
    const sh = g.createRadialGradient(x - r * 0.5, y - r * 0.5, r * 0.6, x - r * 0.2, y - r * 0.2, r * 1.6);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = sh; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
  }
  function paintSky(g, T, w, h, f) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, T.sky[0]); gr.addColorStop(0.55, T.sky[1]); gr.addColorStop(1, T.sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.save(); g.translate(f.ox, f.oy); g.scale(f.k, f.k);
    const x0 = -f.ox / f.k, x1 = (w - f.ox) / f.k, y0 = -f.oy / f.k, y1 = (h - f.oy) / f.k;
    glowDot(g, VW * 0.22, VH * 0.3, 560, T.neb[0]);
    glowDot(g, VW * 0.72, VH * 0.18, 480, T.neb[1]);
    const rnd = BR.rng(7);
    const n = Math.round(240 * (x1 - x0) * (y1 - y0) / (VW * VH));
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0) * 0.85, big = rnd() < 0.07, r = big ? 2.2 : rnd() * 1.3 + 0.3;
      g.globalAlpha = 0.35 + rnd() * 0.65; g.fillStyle = rnd() < 0.2 ? '#ffe9b0' : '#eaf6ff';
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      if (big) { g.globalAlpha = 0.5; g.fillRect(x - 6, y - 0.5, 12, 1); g.fillRect(x - 0.5, y - 6, 1, 12); }
    }
    g.globalAlpha = 1;
    bigPlanet(g, T.planet);
    if (T.planet.moon2) bigPlanet(g, { x: T.planet.x + 150, y: T.planet.y + 70, r: 22, c: ['#d8c8b8', '#8a7a6a', '#2a2018'] });
    // 먼 산 두 겹
    const base = 540;
    for (const [col, off, amp] of [[T.far2, -70, 60], [T.far, 0, 40]]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(x0, y1);
      for (let x = Math.floor(x0 / 40) * 40; x <= x1 + 40; x += 40) {
        const y = base + off - Math.abs(Math.sin(x * 0.006 + off) * amp) - Math.sin(x * 0.021 + off) * amp * 0.35;
        g.lineTo(x, y);
      }
      g.lineTo(x1, y1); g.closePath(); g.fill();
    }
    const hz = g.createLinearGradient(0, base - 120, 0, base + 60);
    hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.7, 'rgba(' + T.haze + ',0.10)'); hz.addColorStop(1, 'rgba(' + T.haze + ',0)');
    g.fillStyle = hz; g.fillRect(x0, base - 120, x1 - x0, 180);
    g.restore();
  }

  // ─── 땅 (판마다 미리 그림) ──────────────────────────────────
  // 화면이 판보다 넓거나 길면 가장자리 땅을 바깥으로 이어 그린다 (그림만. 규칙은 그대로)
  function widen(poly) {
    const xs = poly.map(p => p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    return poly.map(([x, y]) => [x <= 0 && minX <= 0 ? x - 900 : x >= VW && maxX >= VW ? x + 900 : x, y >= VH + 150 ? y + 1200 : y]);
  }
  function rimOf(gr) {
    if (gr.top) return gr.top.map(p => p.slice());
    return [gr.poly[0], gr.poly[1]];
  }
  function paintRock(g, T, poly, rim, ice, seed) {
    const P = widen(poly);
    const cols = ice ? ICE : T.rock;
    g.save();
    g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    const top = Math.min(...P.map(p => p[1]));
    const gr = g.createLinearGradient(0, top, 0, top + 320);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.25, cols[1]); gr.addColorStop(1, cols[2]);
    g.fillStyle = gr; g.fill();
    g.clip();
    const xs = P.map(p => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const rnd = BR.rng(seed);
    if (ice) {
      // 얼음: 비스듬한 빛줄기
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 10;
      for (let x = x0 - 200; x < x1; x += 90) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + 160, top + 320); g.stroke(); }
    } else {
      g.globalAlpha = 0.16; g.strokeStyle = '#000'; g.lineWidth = 3;
      for (let i = 1; i < 9; i++) { g.beginPath(); for (let x = x0 - 20; x < x1 + 20; x += 30) g.lineTo(x, top + 26 + i * 34 + Math.sin(x * 0.03 + i) * 6); g.stroke(); }
      g.globalAlpha = 1;
      const n = Math.min(40, Math.round((x1 - x0) / 70));
      for (let i = 0; i < n; i++) {
        const cx = x0 + rnd() * (x1 - x0), cy = top + 40 + rnd() * 300, cr = 6 + rnd() * 16;
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(cx, cy, cr, cr * 0.6, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.ellipse(cx, cy + cr * 0.25, cr * 0.8, cr * 0.3, 0, 0, Math.PI); g.fill();
      }
    }
    g.restore();
    // 윗면 빛 테 (미리 그리는 그림이라 번짐을 써도 된다)
    const rm = widen(rim.concat([]).map(p => p.slice()));
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = ice ? '#bff4ff' : T.rim; g.shadowBlur = 16; g.strokeStyle = ice ? '#dffaff' : T.rim; g.lineWidth = 4;
    g.beginPath(); rm.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
  function paintBoulder(g, T, x, y, r) {
    glowDot(g, x, y - r * 0.3, r * 1.4, 'rgba(' + T.haze + ',0.10)');
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    gr.addColorStop(0, T.rock[0]); gr.addColorStop(0.5, T.rock[1]); gr.addColorStop(1, T.rock[2]);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (const [dx, dy, k] of [[-0.3, -0.3, 0.16], [0.35, -0.1, 0.12], [0.05, 0.3, 0.2]]) { g.beginPath(); g.ellipse(x + dx * r, y + dy * r, k * r, k * r * 0.7, 0, 0, TAU); g.fill(); }
    g.restore();
    g.save(); g.shadowColor = T.rim; g.shadowBlur = 12; g.strokeStyle = T.rim; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r - 1, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.restore();
  }
  function paintTerrain(g, W, T, f) {
    g.save(); g.translate(f.ox, f.oy); g.scale(f.k, f.k);
    const L = W.level;
    // 시소 받침 (움직이지 않는 세모)
    for (const s of L.seesaws || []) {
      g.fillStyle = '#8fa0b8'; g.beginPath(); g.moveTo(s.x, s.y - 4); g.lineTo(s.x - 30, s.y + 56); g.lineTo(s.x + 30, s.y + 56); g.closePath(); g.fill();
      g.fillStyle = '#c8d4e6'; g.beginPath(); g.moveTo(s.x, s.y - 4); g.lineTo(s.x - 10, s.y + 56); g.lineTo(s.x + 4, s.y + 56); g.closePath(); g.fill();
    }
    L.ground.forEach((gr, i) => paintRock(g, T, Wd().groundPoly(gr), rimOf(gr), !!gr.ice, 11 + i * 7));
    for (const r of L.rocks || []) paintBoulder(g, T, r[0], r[1], r[2]);
    // 스프링 받침 (눌리는 판은 매 프레임)
    for (const s of L.springs || []) {
      g.fillStyle = '#3a2a50'; rr(g, s.x - s.w / 2 - 6, s.y + 4, s.w + 12, 14, 6); g.fill();
    }
    g.restore();
  }

  function vignette(g, w, h) {
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  }

  // ─── 움직이는 것들 ─────────────────────────────────────────
  function smoothPath(g, pts) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]);
  }
  function penOf(id) { return D.PENS.find(p => p.id === id) || D.PENS[0]; }
  function rainbowOf(g, pts) {
    const xs = pts.map(p => p[0]), a = Math.min(...xs), b = Math.max(...xs) + 1;
    const gr = g.createLinearGradient(a, 0, b, 0);
    ['#ff5e7a', '#ffb13d', '#ffe66d', '#7dff9a', '#5ee7ff', '#b37dff'].forEach((c, i) => gr.addColorStop(i / 5, c));
    return gr;
  }
  // 그린 선: 그리는 중(빛 분필) · 진짜 물건이 된 선(단단한 막대)
  // ramps: 선 끝 비탈(세 점 묶음). 선과 같은 층마다 같은 색으로 채우고, 층이 선보다 굵은 만큼 테두리를 둘러 이어 보이게
  function inkLine(g, pts, mode, pen, ramps) {
    const C = pen.c;
    if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.5, pts[0][1]]];
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const main = pen.rainbow ? rainbowOf(g, pts) : C[1];
    if (mode === 'drawing') {
      smoothPath(g, pts);
      g.strokeStyle = C[0]; g.lineWidth = 26; g.stroke();
      g.strokeStyle = C[0]; g.lineWidth = 16; g.stroke();
      g.strokeStyle = main; g.lineWidth = 9; g.stroke();
      g.strokeStyle = C[2]; g.lineWidth = 3.5; g.stroke();
    } else {
      const w = PH.lineHalf * 2;
      const layer = (color, lw) => {
        smoothPath(g, pts); g.strokeStyle = color; g.lineWidth = lw; g.stroke();
        for (const r of ramps || []) {
          g.beginPath(); g.moveTo(r[0][0], r[0][1]); g.lineTo(r[1][0], r[1][1]); g.lineTo(r[2][0], r[2][1]); g.closePath();
          g.fillStyle = color; g.fill();
          if (lw > w) { g.lineWidth = lw - w; g.stroke(); }
        }
      };
      g.save(); g.translate(0, 6); layer('rgba(0,0,0,0.32)', w + 4); g.restore();
      layer(C[0], w + 10);
      layer(C[3], w + 3);
      layer(main, w - 1);
      g.save(); g.translate(0, -2); smoothPath(g, pts); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2.5; g.stroke(); g.restore();
    }
    g.restore();
  }
  function inkDot(g, x, y, a, pen) {
    const C = pen.c, r = PH.dotR;
    glowDot(g, x, y, r * 2.4, C[0]);
    g.fillStyle = C[3]; g.beginPath(); g.arc(x, y, r + 1.5, 0, TAU); g.fill();
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
    gr.addColorStop(0, C[2]); gr.addColorStop(1, pen.rainbow ? '#ff7ac8' : C[1]);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r - 0.5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - r * 0.35 + Math.cos(a) * 0.5, y - r * 0.35, r * 0.25, 0, TAU); g.fill();
  }

  // 공 캐릭터. mood: happy | wow | joy
  function ball(g, x, y, r, rot, mood, ch, glow) {
    const col = ch.col;
    if (glow !== false) glowDot(g, x, y, r * 2.3, 'rgba(255,255,255,0.18)');
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y + r + 3, r * 0.85, r * 0.18, 0, 0, TAU); g.fill();
    g.save(); g.translate(x, y);
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
    gr.addColorStop(0, col[0]); gr.addColorStop(0.45, col[1]); gr.addColorStop(1, col[2]);
    g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
    // 도는 무늬 (구르는 느낌)
    g.rotate(rot);
    if (ch.deco === 'rays') {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * TAU / 6); g.beginPath(); g.moveTo(r * 0.55, -r * 0.1); g.lineTo(r * 1.05, 0); g.lineTo(r * 0.55, r * 0.1); g.fill(); g.restore(); }
    } else if (ch.deco === 'seeds') {
      g.fillStyle = ch.spot;
      for (let i = 0; i < 9; i++) { const a = i * 2.4, d = r * (0.35 + (i % 3) * 0.2); g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.06, r * 0.1, a, 0, TAU); g.fill(); }
    } else {
      for (const [a, d, k] of [[0.3, 0.72, 0.2], [2.4, 0.7, 0.16], [4.2, 0.74, 0.18]]) {
        g.fillStyle = ch.spot; starPath(g, Math.cos(a) * r * d, Math.sin(a) * r * d, r * k, r * k * 0.45); g.fill();
      }
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r - 1, 0, TAU); g.stroke();
    // 얼굴 (돌지 않음)
    const ex = r * 0.3, ey = -r * 0.12;
    if (mood === 'joy') {
      g.strokeStyle = '#0a1a2a'; g.lineWidth = r * 0.08; g.lineCap = 'round';
      for (const s of [-1, 1]) { g.beginPath(); g.arc(s * ex, ey + r * 0.06, r * 0.13, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    } else {
      for (const s of [-1, 1]) {
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(s * ex, ey, r * 0.2, r * 0.25, 0, 0, TAU); g.fill();
        g.fillStyle = '#0a1a2a'; g.beginPath(); g.ellipse(s * ex + r * 0.05, ey + r * 0.03, r * 0.11, r * 0.15, 0, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(s * ex + r * 0.09, ey - r * 0.04, r * 0.045, 0, TAU); g.fill();
      }
    }
    g.fillStyle = 'rgba(255,120,170,0.55)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * r * 0.55, r * 0.2, r * 0.13, r * 0.08, 0, 0, TAU); g.fill(); }
    g.strokeStyle = '#0a1a2a'; g.fillStyle = '#0a1a2a'; g.lineWidth = r * 0.07; g.lineCap = 'round';
    g.beginPath();
    if (mood === 'wow') { g.ellipse(0, r * 0.33, r * 0.12, r * 0.15, 0, 0, TAU); g.fill(); }
    else if (mood === 'joy') { g.arc(0, r * 0.16, r * 0.26, 0.1, Math.PI - 0.1); g.closePath(); g.fill(); }
    else { g.arc(0, r * 0.18, r * 0.22, 0.2, Math.PI - 0.2); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-r * 0.45, -r * 0.55, r * 0.2, r * 0.11, -0.6, 0, TAU); g.fill();
    g.restore();
  }

  // 외계인 친구 (도착 발판 위). ex: 0 기다림 ~ 1 신남, jump: 폴짝 높이
  function friend(g, x, y, s, t, ex, jump, calm) {
    const bob = calm ? 0 : Math.sin(t * 3) * 3;
    // 도착 발판 빛 고리 (천천히 퍼진다)
    glowDot(g, x, y, 120 * s, 'rgba(125,255,154,0.26)');
    g.strokeStyle = 'rgba(125,255,154,0.9)'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(x, y, 62 * s, 14 * s, 0, 0, TAU); g.stroke();
    const k = calm ? 0.5 : (t * 0.6) % 1;
    g.globalAlpha = 0.6 * (1 - k); g.beginPath(); g.ellipse(x, y, (62 + 50 * k) * s, (14 + 12 * k) * s, 0, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    const bg = g.createLinearGradient(0, y - 110 * s, 0, y);
    bg.addColorStop(0, 'rgba(125,255,154,0)'); bg.addColorStop(1, 'rgba(125,255,154,0.22)');
    g.fillStyle = bg; g.beginPath(); g.moveTo(x - 60 * s, y); g.lineTo(x - 40 * s, y - 110 * s); g.lineTo(x + 40 * s, y - 110 * s); g.lineTo(x + 60 * s, y); g.fill();
    g.save(); g.translate(x, y - 6 * s - (jump || 0)); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 4 + (jump || 0) / s, 34, 7, 0, 0, TAU); g.fill();
    g.fillStyle = '#2fb86a'; rr(g, -20, -18, 12, 20, 6); g.fill(); rr(g, 8, -18, 12, 20, 6); g.fill();
    g.translate(0, bob);
    g.strokeStyle = '#4fd68a'; g.lineWidth = 11; g.lineCap = 'round';
    const wave = calm ? 0 : Math.sin(t * 8) * 8 * ex;
    g.beginPath(); g.moveTo(-26, -48); g.quadraticCurveTo(-50, -60 - ex * 30, -48 - wave * 0.3, -84 + (1 - ex) * 40 + wave); g.stroke();
    g.beginPath(); g.moveTo(26, -48); g.quadraticCurveTo(52, -62 - ex * 30, 56 + wave * 0.3, -90 + (1 - ex) * 44 - wave); g.stroke();
    const bgr = g.createRadialGradient(-12, -70, 6, 0, -48, 48);
    bgr.addColorStop(0, '#c8ffd8'); bgr.addColorStop(0.5, '#4fd68a'); bgr.addColorStop(1, '#1a7a4a');
    g.fillStyle = bgr; g.beginPath(); g.ellipse(0, -50, 36, 42, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,154,232,0.8)';
    for (const [a, b, c] of [[-18, -30, 5], [14, -26, 4], [20, -68, 3]]) { g.beginPath(); g.arc(a, b, c, 0, TAU); g.fill(); }
    g.strokeStyle = '#4fd68a'; g.lineWidth = 4;
    const sway = calm ? 0 : Math.sin(t * 2.2) * 5;
    g.beginPath(); g.moveTo(0, -90); g.quadraticCurveTo(6 + sway, -112, -4 + sway, -124); g.stroke();
    glowDot(g, -4 + sway, -126, 22, 'rgba(255,230,109,0.9)');
    g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(-4 + sway, -126, 6, 0, TAU); g.fill();
    // 눈 (가끔 깜빡)
    const blink = !calm && (t % 3.7) < 0.12;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, -60, 17, blink ? 2 : 18, 0, 0, TAU); g.fill();
    if (!blink) {
      g.fillStyle = '#0d3a18'; g.beginPath(); g.arc(3, -58, 9, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(6, -62, 3.5, 0, TAU); g.fill();
    }
    g.fillStyle = '#0d3a18'; g.beginPath();
    if (ex > 0.5) { g.ellipse(0, -30, 10, 8, 0, 0, Math.PI); g.fill(); g.fillStyle = '#ff7aa8'; g.beginPath(); g.ellipse(0, -26, 5, 3, 0, 0, TAU); g.fill(); }
    else { g.strokeStyle = '#0d3a18'; g.lineWidth = 3; g.arc(0, -34, 8, 0.2, Math.PI - 0.2); g.stroke(); }
    g.restore();
  }
  function speech(g, x, y, text) {
    g.font = '28px Jua, sans-serif';
    const w = g.measureText(text).width + 40;
    x = Math.max(w / 2 + 10, Math.min(VW - w / 2 - 10, x));
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.96)'; rr(g, x - w / 2, y - 28, w, 56, 28); g.fill();
    g.beginPath(); g.moveTo(x - w / 2 + 26, y + 22); g.lineTo(x - w / 2 + 12, y + 44); g.lineTo(x - w / 2 + 46, y + 24); g.fill();
    g.fillStyle = '#12304a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 2);
    g.restore();
  }
  function hand(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s); g.rotate(-0.35);
    g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, -14, 4, 36, 60, 16); g.fill();
    g.fillStyle = '#ffe3c8'; g.strokeStyle = '#6a3a1a'; g.lineWidth = 3;
    rr(g, -8, -40, 20, 60, 10); g.fill(); g.stroke();
    rr(g, -20, 4, 46, 52, 18); g.fill(); g.stroke();
    g.fillStyle = '#ffffff'; rr(g, -3, -36, 10, 12, 5); g.fill();
    g.restore();
  }
  function heart(g, x, y, s, col) {
    g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = col || '#ff5ec8';
    g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-22, -8, -10, -24, 0, -12); g.bezierCurveTo(10, -24, 22, -8, 0, 8); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-7, -10, 4, 2.5, -0.6, 0, TAU); g.fill();
    g.restore();
  }
  function crate(g, b) {
    const s = Wd().bodyState(b), u = b.getUserData();
    g.save(); g.translate(s.x, s.y); g.rotate(s.a);
    const w = u.w, h = u.h;
    g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, -w / 2 + 4, -h / 2 + 6, w, h, 10); g.fill();
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, '#6a7a9a'); gr.addColorStop(0.5, '#a8b8d8'); gr.addColorStop(1, '#5a6a88');
    g.fillStyle = gr; rr(g, -w / 2, -h / 2, w, h, 10); g.fill();
    g.strokeStyle = '#2a3450'; g.lineWidth = 4; g.stroke();
    g.strokeStyle = 'rgba(255,210,63,0.9)'; g.lineWidth = 8;
    for (let y = -h / 2 + 30; y < h / 2 - 10; y += 60) { g.beginPath(); g.moveTo(-w / 2 + 12, y); g.lineTo(w / 2 - 12, y + 20); g.stroke(); }
    g.fillStyle = '#e8f7ff'; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(dx * (w / 2 - 12), dy * (h / 2 - 12), 5, 0, TAU); g.fill(); }
    g.restore();
  }
  function plank(g, sw) {
    const s = Wd().bodyState(sw.plank), w = sw.w, h = PH.plankHalf * 2;
    g.save(); g.translate(s.x, s.y); g.rotate(s.a);
    g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, -w / 2 + 3, -h / 2 + 7, w, h, h / 2); g.fill();
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#b8c8e0'); gr.addColorStop(1, '#6a7a98');
    g.fillStyle = gr; rr(g, -w / 2, -h / 2, w, h, h / 2); g.fill();
    g.strokeStyle = '#2a3450'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#ff5ec8'; for (const e of [-1, 1]) { rr(g, e * (w / 2 - 22) - 8, -h / 2, 16, h, 4); g.fill(); }
    g.restore();
    // 받침 못
    g.fillStyle = '#ffe66d'; g.beginPath(); g.arc(sw.x, sw.y, 7, 0, TAU); g.fill();
    g.fillStyle = '#8a5a00'; g.beginPath(); g.arc(sw.x, sw.y, 3, 0, TAU); g.fill();
  }
  function spring(g, sp, t) {
    const o = sp.o, sq = sp.squash, top = o.y - 10 + sq * 8;
    // 용수철
    g.strokeStyle = '#ffb3e6'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath();
    const n = 4, y0 = top + 12, y1 = o.y + 8;
    for (let i = 0; i <= n * 2; i++) { const x = o.x + (i % 2 ? 1 : -1) * (o.w / 2 - 16) * (i === 0 || i === n * 2 ? 0 : 1); g.lineTo(x, y0 + (y1 - y0) * i / (n * 2)); }
    g.stroke();
    glowDot(g, o.x, top, o.w * 0.9, 'rgba(255,94,200,0.3)');
    const gr = g.createLinearGradient(0, top - 10, 0, top + 12);
    gr.addColorStop(0, '#ffd0f0'); gr.addColorStop(1, '#ff3ea8');
    g.fillStyle = gr; rr(g, o.x - o.w / 2, top - 10, o.w, 20, 10); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; rr(g, o.x - o.w / 2 + 8, top - 7, o.w - 16, 5, 3); g.fill();
    // 위쪽 화살표 (살짝 깜빡)
    g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 5);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(o.x, top - 44); g.lineTo(o.x - 12, top - 26); g.lineTo(o.x + 12, top - 26); g.fill();
    g.globalAlpha = 1;
  }

  // 날씨 (그림만): 모래바람 · 달 먼지 반짝임
  function weather(g, kind, dt, calm, f, w, h) {
    const x0 = -f.ox / f.k, x1 = (w - f.ox) / f.k, y1 = (h - f.oy) / f.k, y0 = -f.oy / f.k;
    if (!R.weather.length || R.weatherKind !== kind) {
      R.weatherKind = kind; R.weather = [];
      const rnd = BR.rng(99), n = kind === 'sand' ? 70 : 26;
      for (let i = 0; i < n; i++) R.weather.push({ x: rnd(), y: rnd(), s: 0.5 + rnd(), p: rnd() * TAU });
    }
    for (const q of R.weather) {
      if (!calm) { q.x += (kind === 'sand' ? 0.22 : 0.01) * q.s * dt; q.p += dt * 2; if (q.x > 1) q.x -= 1; }
      const x = x0 + q.x * (x1 - x0), y = y0 + q.y * (y1 - y0);
      if (kind === 'sand') {
        const l = 10 + 22 * q.s;
        g.strokeStyle = 'rgba(255,190,140,' + (0.12 + 0.2 * q.s) + ')'; g.lineWidth = 1 + q.s;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + l * 0.12); g.stroke();
      } else {
        g.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(q.p)); g.fillStyle = '#dfe8ff';
        g.beginPath(); g.arc(x, y, 1.2 * q.s + 0.6, 0, TAU); g.fill(); g.globalAlpha = 1;
      }
    }
  }

  // ─── 입자 ─────────────────────────────────────────────────
  const CONF = ['#ffe66d', '#5ee7ff', '#ff5ec8', '#7dff9a', '#ffffff', '#b37dff'];
  function fx(kind, x, y, o) {
    const P = R.parts, rnd = Math.random;
    const push = p => { if (P.length < 140) P.push(p); };
    if (kind === 'dust') for (let i = 0; i < 6; i++) push({ k: 'dust', x: x + (rnd() - 0.5) * 30, y, vx: (rnd() - 0.5) * 90, vy: -30 - rnd() * 50, life: 0.6, t: 0, r: 5 + rnd() * 7, c: (o && o.c) || 'rgba(255,220,190,0.5)' });
    if (kind === 'spark') for (let i = 0; i < 10; i++) { const a = rnd() * TAU, v = 60 + rnd() * 160; push({ k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, t: 0, r: 5 + rnd() * 4, c: (o && o.c) || '#ffe66d' }); }
    if (kind === 'line') { const pts = o.pts; for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 10))) push({ k: 'star', x: pts[i][0], y: pts[i][1], vx: (rnd() - 0.5) * 60, vy: -40 - rnd() * 60, life: 0.55, t: 0, r: 4 + rnd() * 3, c: o.c }); }
    if (kind === 'hearts') for (let i = 0; i < 7; i++) push({ k: 'heart', x: x + (rnd() - 0.5) * 120, y: y - rnd() * 40, vx: (rnd() - 0.5) * 40, vy: -80 - rnd() * 80, life: 1.6, t: -i * 0.08, r: 0.9 + rnd() * 0.7, c: rnd() < 0.3 ? '#ffe66d' : '#ff5ec8' });
    if (kind === 'confetti') for (let i = 0; i < 60; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, v = 300 + rnd() * 420; push({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 2.2, t: 0, r: 5 + rnd() * 5, c: CONF[i % CONF.length], rot: rnd() * TAU, star: i % 3 === 0 }); }
    if (kind === 'puff') for (let i = 0; i < 14; i++) { const a = rnd() * TAU, v = 40 + rnd() * 120; push({ k: 'dust', x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, t: 0, r: 8 + rnd() * 10, c: 'rgba(230,240,255,0.5)' }); }
  }
  function drawParts(g, dt) {
    const P = R.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t > p.life) { P.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'conf') { p.vy += 700 * dt; p.vx *= 0.99; p.rot += dt * 6; } else if (p.k !== 'heart') { p.vy += 120 * dt; }
      const a = 1 - p.t / p.life;
      g.globalAlpha = Math.max(0, Math.min(1, a * 1.4));
      if (p.k === 'dust') { g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + p.t), 0, TAU); g.fill(); }
      else if (p.k === 'star') { g.fillStyle = p.c; starPath(g, p.x, p.y, p.r, p.r * 0.45, 4, p.t * 4); g.fill(); }
      else if (p.k === 'heart') heart(g, p.x, p.y, p.r, p.c);
      else if (p.k === 'conf') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c; if (p.star) { starPath(g, 0, 0, p.r * 1.6, p.r * 0.7); g.fill(); } else g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore(); }
    }
    g.globalAlpha = 1;
  }
  const busy = () => R.parts.length > 0;

  // ─── 한 장 그리기 ─────────────────────────────────────────
  // view: {w, h, dpr, calm, char, pen, hint (0~1 힌트 점선), tutorial, drawTip:[x,y] 손가락 자리, noSay}
  function draw(ctx, W, view, dt) {
    R.t += dt;
    const w = view.w, h = view.h, dpr = view.dpr;
    const f = fitOf(w, h);
    R.fit = f;
    const T = THEME[W.level.planet] || THEME.moon;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    // 하늘 캐시
    const skyKey = W.level.planet + '|' + pw + 'x' + ph;
    if (R.skyKey !== skyKey) {
      R.sky = canvas(pw, ph); const g = R.sky.getContext('2d'); g.scale(dpr, dpr); paintSky(g, T, w, h, f); R.skyKey = skyKey;
    }
    const terKey = W.level.id + '|' + pw + 'x' + ph;
    if (R.terKey !== terKey) {
      R.ter = canvas(pw, ph); const g = R.ter.getContext('2d'); g.scale(dpr, dpr); paintTerrain(g, W, T, f); R.terKey = terKey;
    }
    const vigKey = pw + 'x' + ph;
    if (R.vigKey !== vigKey) { R.vig = canvas(pw, ph); const g = R.vig.getContext('2d'); vignette(g, pw, ph); R.vigKey = vigKey; }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(R.sky, 0, 0);
    ctx.setTransform(dpr * f.k, 0, 0, dpr * f.k, dpr * f.ox, dpr * f.oy);
    const g = ctx, calm = !!view.calm;
    weather(g, T.weather, dt, calm, f, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(R.ter, 0, 0);
    ctx.setTransform(dpr * f.k, 0, 0, dpr * f.k, dpr * f.ox, dpr * f.oy);

    // 움직이는 물건
    for (const sw of W.seesaws) plank(g, sw);
    for (const b of W.boxes) crate(g, b);
    for (const sp of W.springs) spring(g, sp, R.t);
    // 친구 (공이 가까우면 신남)
    const L = W.level, bs = Wd().ballState(W);
    const near = Math.max(0, Math.min(1, 1 - (Math.hypot(bs.x - L.goal[0], bs.y - L.goal[1]) - 120) / 360));
    const won = W.phase === 'win';
    const jump = won && !calm ? Math.abs(Math.sin((W.t - W.win.t) * 7)) * 26 * Math.max(0, 1 - (W.t - W.win.t) / 2.5) : 0;
    friend(g, L.goal[0], L.goal[1], 1, R.t, won ? 1 : near, jump, calm);
    // 힌트 점선 + 처음 판 손가락
    if (view.hint > 0 && L.sol) {
      g.save(); g.globalAlpha = Math.min(1, view.hint); g.setLineDash([4, 18]); g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 8;
      for (const s of L.sol) { smoothPath(g, s.length > 1 ? s : [s[0], [s[0][0] + 1, s[0][1]]]); g.stroke(); }
      g.restore();
      if (view.tutorial && L.sol[0].length > 1) {
        // 손가락이 정답 선을 따라 천천히 (움직임 줄이기면 가운데에 멈춤)
        const s = L.sol[0], k = calm ? 0.5 : (R.t * 0.35) % 1.3;
        const q = Math.min(1, k), seg = q * (s.length - 1), i = Math.min(s.length - 2, Math.floor(seg)), u = seg - i;
        const hx = s[i][0] + (s[i + 1][0] - s[i][0]) * u, hy = s[i][1] + (s[i + 1][1] - s[i][1]) * u;
        glowDot(g, hx, hy, 40, 'rgba(255,255,255,0.35)');
        hand(g, hx + 4, hy + 40, 1.1);
      }
    }
    // 그린 선
    const pen = penOf(view.pen);
    for (let i = 0; i < W.lines.length; i++) {
      const s = W.strokes[i];
      if (s.kind === 'dot') { const st = Wd().bodyState(W.lines[i]); inkDot(g, st.x, st.y, st.a, pen); }
      else inkLine(g, Wd().linePoints(W, i), 'solid', pen, Wd().rampPoints(W, i));
    }
    if (W.drawing && W.drawing.pts.length) inkLine(g, W.drawing.pts, 'drawing', pen);
    if (view.drawTip) {
      const [x, y] = view.drawTip;
      glowDot(g, x, y, 60, 'rgba(255,255,255,0.3)');
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 28, 0, TAU); g.stroke();
    }
    // 공
    const ch = D.CHARS.find(c => c.id === view.char) || D.CHARS[0];
    const speed = Math.hypot(bs.vx, bs.vy);
    const mood = won ? 'joy' : W.phase === 'fall' || speed > 520 ? 'wow' : 'happy';
    if (!calm && speed > 380 && W.phase === 'run') {
      // 빠를 때 꼬리
      g.globalAlpha = 0.18; g.fillStyle = ch.col[1];
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(bs.x - bs.vx * 0.02 * k, bs.y - bs.vy * 0.02 * k, PH.ballR * (1 - k * 0.12), 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    }
    ball(g, bs.x, bs.y, PH.ballR, bs.a, mood, ch);
    // 말풍선 (판을 막 열었을 때)
    if (!view.noSay && W.phase === 'ready' && W.t < 6 && L.say) speech(g, L.goal[0] + 60, L.goal[1] - 180, L.say);
    drawParts(g, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(R.vig, 0, 0);
  }

  // ─── 작은 그림 (상점·시작 화면) ──────────────────────────
  function paintChar(cv, id) {
    const g = cv.getContext('2d'), s = cv.width;
    g.clearRect(0, 0, s, s);
    const ch = D.CHARS.find(c => c.id === id) || D.CHARS[0];
    ball(g, s / 2, s / 2 - s * 0.02, s * 0.36, 0.3, 'happy', ch, true);
  }
  function paintPen(cv, id) {
    const g = cv.getContext('2d'), s = cv.width;
    g.clearRect(0, 0, s, s);
    const pen = penOf(id), k = s / 160;
    g.save(); g.scale(k, k);
    inkLine(g, [[26, 110], [60, 70], [100, 90], [134, 48]], 'solid', pen);
    g.restore();
  }
  function paintPlanet(cv, planet, locked) {
    const g = cv.getContext('2d'), s = cv.width;
    g.clearRect(0, 0, s, s);
    const T = THEME[planet] || THEME.moon;
    const c = planet === 'moon' ? ['#ffffff', '#b8bccf', '#4a4f6a'] : ['#ffcf9a', '#d4553a', '#6a1c14'];
    g.save(); if (locked) g.globalAlpha = 0.45;
    bigPlanet(g, { x: s / 2, y: s / 2, r: s * 0.4, c });
    g.restore();
    return T;
  }

  BR.Render = { draw, fx, busy, toLevel, fitOf, paintChar, paintPen, paintPlanet, THEME, get fit() { return R.fit; }, _R: R };
})(BR);
