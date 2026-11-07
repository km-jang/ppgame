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
  const R = { parts: [], sky: null, skyKey: '', ter: null, terKey: '', vig: null, vigKey: '', t: 0, weather: [], fit: { k: 1, ox: 0, oy: 0 },
    // (2026-11-07) 시각 효과 상태: 손끝 용접 불꽃 · 공 젤리 탄성 · 지난 프레임 공 속도 (그림 전용, 규칙과 무관)
    calm: false, res: 2, weld: new VFX.ParticleEmitter({ max: 220, seed: 11 }), tip: null, sputter: 0,
    jelly: new VFX.SpringScaler({ stiffness: 380, damping: 14 }), jAng: Math.PI / 2, prev: null };

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
  // ─── 바위 질감 (2026-11-07 시각 품질 3단계) ─────────────────
  // 이어 붙여도 이음매가 안 보이는 회색 잡음 한 장(384px)을 행성마다 한 번 만든다. 큰 무늬(물결 같은 덩어리)와
  // 날카로운 줄무늬(바위 결)를 섞었고, 땅을 미리 그릴 때 부드러운 빛 섞기(soft-light)로 덮는다. 게임 중에는 다시 만들지 않는다
  const NOISE = {};
  function noiseTile(seed) {
    if (NOISE[seed]) return NOISE[seed];
    const N = 512, cv = canvas(N, N), g = cv.getContext('2d');
    const img = g.createImageData(N, N), d = img.data, rnd = BR.rng(seed);
    const oct = [8, 16, 32, 64, 128, 256].map(p => { const v = new Float32Array(p * p); for (let i = 0; i < v.length; i++) v[i] = rnd(); return { p, v }; });
    const sm = t => t * t * (3 - 2 * t);
    const val = (o, x, y) => {
      const fx = x * o.p / N, fy = y * o.p / N, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
      const p = o.p, a = o.v[(iy % p) * p + ix % p], b = o.v[(iy % p) * p + (ix + 1) % p], c = o.v[((iy + 1) % p) * p + ix % p], e = o.v[((iy + 1) % p) * p + (ix + 1) % p];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // 고른 덩어리(앞 셋)와 거친 결(뒤 셋)을 비슷한 무게로, 마지막에 낱알 하나하나 작은 잡티를 더해 모래알처럼
      let f = 0, ridge = 0;
      const W6 = [0.3, 0.2, 0.16, 0.14, 0.11, 0.09];
      for (let k = 0; k < oct.length; k++) { const n = val(oct[k], x, y); f += n * W6[k]; if (k === 1 || k === 2) ridge += (1 - Math.abs(n * 2 - 1)) * (k === 1 ? 0.6 : 0.4); }
      const v = Math.max(0, Math.min(1, f * 0.82 + Math.pow(ridge, 4) * 0.2 + (rnd() - 0.5) * 0.14 + 0.02));
      const c = Math.round(v * 255), i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return (NOISE[seed] = cv);
  }
  function polyPath(g, P) { g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
  function linePath(g, pts, dy) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + (dy || 0)) : g.moveTo(x, y + (dy || 0)))); }

  // 땅 덩어리 하나. 위에서 아래로: 햇빛 받은 윗면 · 바위 몸 · 어둠 속으로 사라지는 아랫부분.
  // 겹: 세로 그라데이션 몸 · 바위 질감 · 윗면과 나란한 지층 · 가장자리 안쪽 그늘 · 깨진 틈 · 운석 구덩이(화성은 자갈도) ·
  //     윗면 햇빛 띠 · 아래로 갈수록 하늘 색 어둠 · 빛나는 윗면 테두리(넓은 빛 번짐 + 색 + 하얀 심) · 반짝이는 알갱이
  function paintRock(g, T, poly, rim, ice, seed) {
    const P = widen(poly);
    const cols = ice ? ICE : T.rock;
    const c0 = VC.parse(cols[0]), c1 = VC.parse(cols[1]), c2 = VC.parse(cols[2]), sky = VC.parse(T.sky[0]);
    const rimC = VC.parse(ice ? '#dffaff' : T.rim);
    const rm = widen(rim.map(p => p.slice()));
    const xs = P.map(p => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const top = Math.min(...P.map(p => p[1]));
    const rnd = BR.rng(seed);
    g.save();
    polyPath(g, P);
    // 1) 몸: 윗면은 밝고, 조금 아래 본래 색, 깊을수록 하늘 쪽 남색으로 가라앉는다
    const gr = g.createLinearGradient(0, top, 0, top + 520);
    gr.addColorStop(0, VC.rgba(VC.lighten(c0, 0.05), 1));
    gr.addColorStop(0.08, VC.rgba(VC.mix(c0, c1, 0.45), 1));
    gr.addColorStop(0.3, VC.rgba(c1, 1));
    gr.addColorStop(0.62, VC.rgba(VC.mix(c2, sky, 0.25), 1));
    gr.addColorStop(1, VC.rgba(VC.mix(c2, sky, 0.7), 1));
    g.fillStyle = gr; g.fill();
    g.clip();
    // 2) 바위 질감 (얼음은 옅게)
    const tile = noiseTile(ice ? 41 : (T === THEME.mars ? 23 : 17));
    const pat = g.createPattern(tile, 'repeat');
    if (pat) {
      if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().translate(seed * 37, seed * 11).scale(0.55));
      g.globalCompositeOperation = 'soft-light'; g.globalAlpha = ice ? 0.4 : 0.8;
      g.fillStyle = pat; g.fillRect(x0 - 10, top - 10, x1 - x0 + 20, 1700);
      g.globalAlpha = ice ? 0.12 : 0.22; g.globalCompositeOperation = 'multiply';
      g.fillRect(x0 - 10, top - 10, x1 - x0 + 20, 1700);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (ice) {
      // 얼음: 안쪽 깊은 푸른 결정면 + 비스듬한 부드러운 빛줄기(가산 혼합) + 가는 날카로운 반사선
      const deep = g.createLinearGradient(0, top + 40, 0, top + 420);
      deep.addColorStop(0, 'rgba(40,120,200,0)'); deep.addColorStop(1, 'rgba(10,40,110,0.55)');
      g.fillStyle = deep; g.fillRect(x0 - 10, top, x1 - x0 + 20, 1200);
      g.globalCompositeOperation = 'lighter';
      for (let x = x0 - 260; x < x1; x += 120 + rnd() * 80) {
        const wv = 30 + rnd() * 50;
        const band = g.createLinearGradient(x, top, x + wv, top);
        band.addColorStop(0, 'rgba(200,245,255,0)'); band.addColorStop(0.5, 'rgba(200,245,255,0.16)'); band.addColorStop(1, 'rgba(200,245,255,0)');
        g.save(); g.transform(1, 0, 0.55, 1, -0.55 * top, 0); g.fillStyle = band; g.fillRect(x, top, wv, 1400); g.restore();
        g.lineWidth = 1.2;
        const sl = g.createLinearGradient(0, top, 0, top + 520); sl.addColorStop(0, 'rgba(235,252,255,0.4)'); sl.addColorStop(1, 'rgba(235,252,255,0)');
        g.strokeStyle = sl; g.beginPath(); g.moveTo(x + wv * 0.5, top); g.lineTo(x + wv * 0.5 + 286, top + 520); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    } else {
      // 3) 지층: 윗면 모양을 따라 아래로 겹겹이 (밝은 줄 위, 어두운 줄 아래로 한 쌍)
      for (let i = 1, off = 30; i < 11; i++, off += 26 + i * 5) {
        const wob = rnd() * 10;
        const band = rm.map(([x, y]) => [x, y + off + Math.sin(x * 0.012 + i * 1.7) * (5 + wob) + Math.sin(x * 0.041 + i) * 2.5]);
        g.lineJoin = 'round';
        g.strokeStyle = 'rgba(255,255,255,' + (0.07 - i * 0.004).toFixed(3) + ')'; g.lineWidth = 2;
        linePath(g, band, -2); g.stroke();
        g.strokeStyle = 'rgba(0,0,12,' + (0.22 - i * 0.012).toFixed(3) + ')'; g.lineWidth = 3 + i * 0.4;
        linePath(g, band, 1); g.stroke();
      }
      // 4) 깨진 틈: 윗면에서 아래로 갈라져 내려가는 지그재그 (어두운 틈 + 오른쪽 아래 밝은 모서리)
      const nCrack = Math.max(1, Math.round((x1 - x0) / 260));
      for (let k = 0; k < nCrack; k++) {
        const t0 = rnd(), seg = Math.min(rm.length - 2, Math.floor(t0 * (rm.length - 1))), u = rnd();
        if (seg < 0) break;
        let cx = rm[seg][0] + (rm[seg + 1][0] - rm[seg][0]) * u, cy = rm[seg][1] + (rm[seg + 1][1] - rm[seg][1]) * u + 6;
        const pts = [[cx, cy]], len = 4 + Math.floor(rnd() * 5);
        for (let j = 0; j < len; j++) { cx += (rnd() - 0.5) * 36; cy += 18 + rnd() * 26; pts.push([cx, cy]); }
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = 'rgba(0,0,10,0.45)'; g.lineWidth = 3.2; linePath(g, pts); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.2; g.save(); g.translate(1.6, 1.4); linePath(g, pts); g.stroke(); g.restore();
      }
      // 5) 운석 구덩이: 빛이 왼쪽 위에서 오니 안쪽 벽은 왼쪽 위가 그늘, 오른쪽 아래가 밝고, 바깥 테는 왼쪽 위가 밝다
      const nCr = Math.min(36, Math.round((x1 - x0) / 75));
      for (let i = 0; i < nCr; i++) {
        const cx = x0 + rnd() * (x1 - x0), cy = top + 48 + Math.pow(rnd(), 1.4) * 320, cr = 5 + Math.pow(rnd(), 2) * 22, e = 0.55;
        g.save(); g.translate(cx, cy); g.scale(1, e);
        const bowl = g.createLinearGradient(-cr, -cr, cr, cr);
        bowl.addColorStop(0, 'rgba(0,0,12,0.5)'); bowl.addColorStop(0.55, 'rgba(0,0,12,0.18)'); bowl.addColorStop(1, VC.rgba(VC.lighten(c0, 0.2), 0.32));
        g.fillStyle = bowl; g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.fill();
        g.strokeStyle = VC.rgba(VC.lighten(c0, 0.3), 0.35); g.lineWidth = Math.max(1, cr * 0.16);
        g.beginPath(); g.arc(0, 0, cr * 1.04, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
        g.strokeStyle = 'rgba(0,0,12,0.25)';
        g.beginPath(); g.arc(0, 0, cr * 1.06, Math.PI * 1.95, Math.PI * 0.75); g.stroke();
        g.restore();
      }
      // 화성: 반쯤 묻힌 작은 자갈 (위 밝고 아래 그림자)
      if (T === THEME.mars) for (let i = 0, n = Math.round((x1 - x0) / 40); i < n; i++) {
        const cx = x0 + rnd() * (x1 - x0), cy = top + 30 + Math.pow(rnd(), 1.6) * 260, r = 2.5 + rnd() * 6;
        g.fillStyle = 'rgba(0,0,8,0.35)'; g.beginPath(); g.ellipse(cx + r * 0.3, cy + r * 0.45, r, r * 0.55, 0, 0, TAU); g.fill();
        const pg = g.createRadialGradient(cx - r * 0.35, cy - r * 0.45, 0, cx, cy, r);
        pg.addColorStop(0, VC.rgba(VC.lighten(c0, 0.35), 1)); pg.addColorStop(1, VC.rgba(VC.mix(c1, c2, 0.5), 1));
        g.fillStyle = pg; g.beginPath(); g.ellipse(cx, cy, r, r * 0.7, 0, 0, TAU); g.fill();
      }
    }
    // 6) 가장자리 안쪽 그늘: 덩어리 테두리 안쪽을 어둡게 해 입체로 (윗면은 다음 겹에서 다시 밝힌다)
    g.lineJoin = 'round';
    //    덩어리 바깥을 칠하면서 그 그림자를 안쪽으로 흐리게 떨어뜨린다 (미리 그리는 그림이라 번짐을 써도 된다). 바깥 칠은 잘라 낸 영역 밖이라 안 보인다
    for (const [blur, al] of ice ? [[60, 0.35]] : [[70, 0.55], [22, 0.35]]) {
      g.save(); g.shadowColor = 'rgba(2,4,16,' + al + ')'; g.shadowBlur = blur; g.fillStyle = '#000';
      g.beginPath(); g.rect(x0 - 3000, top - 3000, x1 - x0 + 6000, 9000); P.slice().reverse().forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fill('evenodd'); g.restore();
    }
    // 7) 윗면 햇빛 띠: 테두리 바로 아래가 가장 밝고 아래로 사라진다 (가산 혼합 여러 겹)
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const [lw, al] of [[56, 0.05], [34, 0.07], [18, 0.1], [8, 0.14]]) { linePath(g, rm); g.strokeStyle = VC.rgba(VC.lighten(c0, 0.2), al); g.lineWidth = lw; g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    // 윗면 가까이 고운 먼지 알갱이
    for (let i = 0, n = Math.round((x1 - x0) / 9); i < n; i++) {
      const t = rnd(), seg = Math.min(rm.length - 2, Math.floor(t * (rm.length - 1)));
      if (seg < 0) break;
      const u = rnd(), x = rm[seg][0] + (rm[seg + 1][0] - rm[seg][0]) * u, y = rm[seg][1] + (rm[seg + 1][1] - rm[seg][1]) * u + 3 + Math.pow(rnd(), 2) * 40;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,12,0.2)';
      g.fillRect(x, y, 1.6, 1.6);
    }
    // 8) 아래로 갈수록 하늘 색 어둠에 잠긴다 (땅이 화면 아래로 끝없이 이어져 보이게)
    const fade = g.createLinearGradient(0, top + 220, 0, top + 760);
    fade.addColorStop(0, VC.rgba(sky, 0)); fade.addColorStop(0.6, VC.rgba(sky, 0.55)); fade.addColorStop(1, VC.rgba(sky, 0.85));
    g.fillStyle = fade; g.fillRect(x0 - 10, top + 220, x1 - x0 + 20, 2000);
    g.restore();

    // 9) 빛나는 윗면 테두리: 넓은 빛 번짐 · 색 띠 · 하얀 심 (미리 그리는 그림이라 번짐을 써도 된다)
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.globalCompositeOperation = 'lighter';
    for (const [lw, al] of [[26, 0.05], [16, 0.08], [9, 0.14]]) { linePath(g, rm); g.strokeStyle = VC.rgba(rimC, al); g.lineWidth = lw; g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    g.shadowColor = VC.rgba(rimC, 0.9); g.shadowBlur = 14; g.strokeStyle = VC.rgba(rimC, 0.95); g.lineWidth = 3.2;
    linePath(g, rm); g.stroke();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 1.3; linePath(g, rm, -0.4); g.stroke();
    // 10) 테두리 위 반짝이: 십자 빛 몇 개
    g.globalCompositeOperation = 'lighter';
    for (let i = 0, n = Math.max(2, Math.round((x1 - x0) / 220)); i < n; i++) {
      const t = rnd(), seg = Math.min(rm.length - 2, Math.floor(t * (rm.length - 1)));
      if (seg < 0) break;
      const u = rnd(), x = rm[seg][0] + (rm[seg + 1][0] - rm[seg][0]) * u, y = rm[seg][1] + (rm[seg + 1][1] - rm[seg][1]) * u, L = 7 + rnd() * 9;
      glowDot(g, x, y, L * 1.4, VC.rgba(rimC, 0.45));
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - L, y); g.lineTo(x + L, y); g.moveTo(x, y - L * 0.7); g.lineTo(x, y + L * 0.7); g.stroke();
    }
    g.restore();
  }
  // 둥근 바위: 입체 몸 · 바위 질감 · 구덩이 · 아래 그늘 · 왼쪽 위 빛나는 테 · 아래 반사광
  function paintBoulder(g, T, x, y, r) {
    const c0 = VC.parse(T.rock[0]), c1 = VC.parse(T.rock[1]), c2 = VC.parse(T.rock[2]), rimC = VC.parse(T.rim), sky = VC.parse(T.sky[0]);
    glowDot(g, x, y - r * 0.3, r * 1.5, 'rgba(' + T.haze + ',0.12)');
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    const gr = g.createRadialGradient(x - r * 0.38, y - r * 0.45, r * 0.08, x, y, r * 1.05);
    gr.addColorStop(0, VC.rgba(VC.lighten(c0, 0.1), 1)); gr.addColorStop(0.4, VC.rgba(c1, 1)); gr.addColorStop(0.85, VC.rgba(VC.mix(c2, sky, 0.3), 1)); gr.addColorStop(1, VC.rgba(VC.mix(c2, sky, 0.6), 1));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    const pat = g.createPattern(noiseTile(T === THEME.mars ? 23 : 17), 'repeat');
    if (pat) { g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.9; g.fillStyle = pat; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    for (const [dx, dy, k] of [[-0.3, -0.3, 0.16], [0.35, -0.1, 0.12], [0.05, 0.3, 0.2], [-0.45, 0.25, 0.09]]) {
      const cx = x + dx * r, cy = y + dy * r, cr = k * r;
      const bowl = g.createLinearGradient(cx - cr, cy - cr, cx + cr, cy + cr);
      bowl.addColorStop(0, 'rgba(0,0,12,0.45)'); bowl.addColorStop(1, VC.rgba(VC.lighten(c0, 0.2), 0.28));
      g.fillStyle = bowl; g.beginPath(); g.ellipse(cx, cy, cr, cr * 0.7, 0, 0, TAU); g.fill();
    }
    const sh = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.5, x, y, r);
    sh.addColorStop(0, 'rgba(2,4,16,0)'); sh.addColorStop(1, 'rgba(2,4,16,0.5)');
    g.fillStyle = sh; g.fillRect(x - r, y - r, r * 2, r * 2);
    // 아래 반사광 (가산 혼합)
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = VC.rgba(rimC, 0.12); g.lineWidth = r * 0.05;
    g.beginPath(); g.arc(x, y, r * 0.95, Math.PI * 0.05, Math.PI * 0.75); g.stroke();
    g.restore();
    g.save(); g.lineCap = 'round';
    g.globalCompositeOperation = 'lighter';
    for (const [lw, al] of [[18, 0.06], [10, 0.1]]) { g.strokeStyle = VC.rgba(rimC, al); g.lineWidth = lw; g.beginPath(); g.arc(x, y, r - 1, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    g.shadowColor = T.rim; g.shadowBlur = 12; g.strokeStyle = T.rim; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r - 1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, r - 1.5, Math.PI * 1.2, Math.PI * 1.75); g.stroke();
    g.restore();
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
  function circlePts(x, y, r) { const o = []; for (let i = 0; i < 24; i++) { const a = i * TAU / 24; o.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }); } return o; }
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
  // 그린 선 (2026-11-07 시각 품질 2단계: 입체 유리 튜브와 에너지 심지)
  // 그리는 중: 반투명하게 빛나는 3겹 에너지 선이 맥박처럼 숨 쉰다 (VFX.drawEnergyLine)
  // 물건이 된 선: 바닥 그림자 · 펜 색 빛 번짐 · 짙은 유리관 · 관 속 색 · 위쪽 반사 줄 · 아래 반사광 · 하얀 에너지 심지
  // 관 굵기는 규칙의 선 굵기(PH.lineHalf * 2)와 같다. 빛 번짐만 바깥으로 퍼진다.
  // ramps: 선 끝 비탈(세 점 묶음). 몸통 겹과 같은 색으로 채워 이어 보이게
  const VC = VFX.color;
  function penRGB(pen) { return VC.parse(pen.c[1]); }
  function inkLine(g, pts, mode, pen, ramps, t) {
    if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.5, pts[0][1]]];
    const C = pen.c, col = penRGB(pen);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (mode === 'drawing') {
      // 맥박: 1초에 약 1.3번 두께가 미세하게 부풀었다 가라앉는다 (움직임 줄이기면 멈춤)
      const beat = R.calm ? 0.5 : 0.5 + 0.5 * Math.sin((t || 0) * 8.2);
      const wv = 10 * (1 + (beat - 0.5) * 0.14);
      if (pen.rainbow) {
        const gr = rainbowOf(g, pts);
        g.globalCompositeOperation = 'lighter';
        smoothPath(g, pts);
        for (const [k, al] of [[3.6, 0.06], [2.4, 0.1], [1.5, 0.16]]) { g.globalAlpha = al * (0.85 + beat * 0.3); g.strokeStyle = gr; g.lineWidth = wv * k; g.stroke(); }
        g.globalAlpha = 0.72; g.strokeStyle = gr; g.lineWidth = wv; g.stroke();
        g.globalAlpha = 0.9; g.strokeStyle = '#ffffff'; g.lineWidth = wv * 0.3; g.stroke();
      } else {
        VFX.drawEnergyLine(g, pts.map(p => ({ x: p[0], y: p[1] })), { color: C[1], width: wv, alpha: 0.72, glow: 1.15, core: 0.3, pulse: beat });
      }
      g.restore();
      return;
    }
    const w = PH.lineHalf * 2;
    const main = pen.rainbow ? rainbowOf(g, pts) : C[1];
    const deep = VC.rgba(VC.deep(col, 0.62), 0.92);
    const layer = (style, lw, alpha) => {
      g.globalAlpha = alpha == null ? 1 : alpha;
      smoothPath(g, pts); g.strokeStyle = style; g.lineWidth = lw; g.stroke();
      for (const r of ramps || []) {
        g.beginPath(); g.moveTo(r[0][0], r[0][1]); g.lineTo(r[1][0], r[1][1]); g.lineTo(r[2][0], r[2][1]); g.closePath();
        g.fillStyle = style; g.fill();
        if (lw > w) { g.lineWidth = lw - w; g.stroke(); }
      }
    };
    // 1) 바닥 그림자
    g.save(); g.translate(0, 6); layer('rgba(0,0,8,0.34)', w + 4); g.restore();
    // 2) 바깥 빛 번짐: 넓고 옅은 펜 색을 가산 혼합으로 세 번 (가운데로 갈수록 저절로 밝아짐)
    g.globalCompositeOperation = 'lighter';
    const halo = pen.rainbow ? main : VC.rgba(VC.vivid(col, 0.4), 1);
    for (const [k, al] of [[34, 0.026], [27, 0.032], [21, 0.04], [15, 0.052], [10, 0.07], [6, 0.09]]) layer(halo, w + k, al);
    g.globalCompositeOperation = 'source-over';
    // 3) 유리관: 짙은 몸통 위에 펜 색이 비치는 반투명 속
    layer(deep, w + 1);
    g.globalCompositeOperation = 'lighter';
    layer(main, w - 1, 0.42);
    // 4) 관의 굴곡: 위쪽 가는 흰 반사 줄과 아래쪽 펜 색 반사광 (몸통 길이를 따라서만)
    g.globalAlpha = 0.55; g.save(); g.translate(0, -w * 0.27); smoothPath(g, pts); g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.stroke(); g.restore();
    g.globalAlpha = 0.6; g.save(); g.translate(0, w * 0.3); smoothPath(g, pts); g.strokeStyle = pen.rainbow ? main : VC.rgba(VC.lighten(col, 0.3), 1); g.lineWidth = 1.4; g.stroke(); g.restore();
    // 5) 에너지 심지: 펜 색 빛 위에 새하얀 가는 심
    g.globalAlpha = 0.9; smoothPath(g, pts); g.strokeStyle = main; g.lineWidth = w * 0.42; g.stroke();
    g.globalAlpha = 1; smoothPath(g, pts); g.strokeStyle = VC.rgba(VC.lighten(col, 0.85), 1); g.lineWidth = w * 0.2; g.stroke();
    g.restore();
  }
  // 톡 구슬: 펜 색 유리 광택 구슬 (도는 것은 무늬가 아니라 구슬 자체라 광택은 덮개로 고정)
  function inkDot(g, x, y, a, pen) {
    const r = PH.dotR, col = pen.rainbow ? '#b37dff' : pen.c[1];
    VFX.drawSphere(g, VFX.createGlossySphere(r, col, { glow: 0.6, shadow: 0.4, gloss: 0, res: R.res }), x, y);
    VFX.drawSphere(g, VFX.createGlossCap(r, { res: R.res }), x, y);
  }

  // 공 캐릭터. mood: happy | wow | joy
  // (2026-11-07) 유리 광택 구슬: 미리 그린 몸통(그림자·입체 그라데이션·두께감·속빛·아래 반사광) 위에
  // 도는 금속 무늬(rot만큼 회전)와 얼굴(돌지 않음)을 그리고, 맨 위에 광택 덮개를 얹는다.
  // 광택 덮개는 회전하지 않아 굴러도 반사광이 늘 왼쪽 위 조명 쪽에 있다.
  // sq: 젤리 탄성 {sx: 접선 방향 배율, sy: 부딪힌 방향 배율, ang: 부딪힌 방향 각도}. 닿은 점이 고정되게 중심을 옮긴다
  function ball(g, x, y, r, rot, mood, ch, glow, sq, res) {
    const col = ch.col;
    const body = VFX.createGlossySphere(r, col[1], { glow: glow === false ? 0 : 0.5, shadow: 0.38, gloss: 0, glass: 0.75, rim: 1.1, rimColor: col[0], res });
    const cap = VFX.createGlossCap(r, { gloss: 1.15, res });
    g.save();
    if (sq && (sq.sx !== 1 || sq.sy !== 1)) {
      // 부딪힌 방향(ang)으로 납작하게, 그 직각으로 넓게. 닿은 점은 그대로
      const nx = Math.cos(sq.ang), ny = Math.sin(sq.ang);
      x -= nx * r * (1 - sq.sy); y -= ny * r * (1 - sq.sy);
      g.translate(x, y); g.rotate(sq.ang); g.scale(sq.sy, sq.sx); g.rotate(-sq.ang);
    } else g.translate(x, y);
    VFX.drawSphere(g, body, 0, 0);
    // 도는 금속 무늬: 구슬 안에만, 조금 패인 듯 어두운 그림자 한 번 + 밝은 무늬 한 번, 가장자리로 갈수록 어둡게
    g.save(); g.beginPath(); g.arc(0, 0, r * 0.97, 0, TAU); g.clip();
    g.rotate(rot);
    const deco = (fill, off) => {
      g.save(); g.translate(off, off); g.fillStyle = fill;
      if (ch.deco === 'rays') {
        for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * TAU / 6); g.beginPath(); g.moveTo(r * 0.55, -r * 0.1); g.lineTo(r * 1.05, 0); g.lineTo(r * 0.55, r * 0.1); g.fill(); g.restore(); }
      } else if (ch.deco === 'seeds') {
        for (let i = 0; i < 9; i++) { const a = i * 2.4, d = r * (0.35 + (i % 3) * 0.2); g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.06, r * 0.1, a, 0, TAU); g.fill(); }
      } else {
        for (const [a, d, k] of [[0.3, 0.72, 0.2], [2.4, 0.7, 0.16], [4.2, 0.74, 0.18]]) { starPath(g, Math.cos(a) * r * d, Math.sin(a) * r * d, r * k, r * k * 0.45); g.fill(); }
      }
      g.restore();
    };
    deco('rgba(4,10,30,0.35)', r * 0.04);
    const spot = VC.parse(ch.deco === 'rays' ? '#ffffff' : ch.spot);
    const mg = g.createLinearGradient(-r, -r, r, r); // 금속 광택: 밝은 쪽에서 짙은 쪽으로
    mg.addColorStop(0, VC.rgba(VC.lighten(spot, 0.5), ch.deco === 'rays' ? 0.5 : 1));
    mg.addColorStop(0.5, VC.rgba(spot, ch.deco === 'rays' ? 0.38 : 1));
    mg.addColorStop(1, VC.rgba(VC.darken(spot, 0.35), ch.deco === 'rays' ? 0.3 : 1));
    deco(mg, 0);
    g.restore();
    // 무늬 위에 다시 둥근 음영 (무늬가 구슬 표면을 따라 굽어 보이게)
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
    const sh = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r);
    sh.addColorStop(0, 'rgba(4,8,30,0)'); sh.addColorStop(0.7, 'rgba(4,8,30,0.1)'); sh.addColorStop(1, 'rgba(4,8,30,0.42)');
    g.fillStyle = sh; g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
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
    // 광택 덮개 (돌지 않음)
    VFX.drawSphere(g, cap, 0, 0);
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
    const ft = g.createLinearGradient(0, -18, 0, 2);
    ft.addColorStop(0, '#5fe89a'); ft.addColorStop(0.6, '#25a05a'); ft.addColorStop(1, '#0f5a32');
    g.fillStyle = ft; rr(g, -20, -18, 12, 20, 6); g.fill(); rr(g, 8, -18, 12, 20, 6); g.fill();
    g.translate(0, bob);
    g.strokeStyle = '#4fd68a'; g.lineWidth = 11; g.lineCap = 'round';
    const wave = calm ? 0 : Math.sin(t * 8) * 8 * ex;
    const arms = () => {
      g.beginPath(); g.moveTo(-26, -48); g.quadraticCurveTo(-50, -60 - ex * 30, -48 - wave * 0.3, -84 + (1 - ex) * 40 + wave);
      g.moveTo(26, -48); g.quadraticCurveTo(52, -62 - ex * 30, 56 + wave * 0.3, -90 + (1 - ex) * 44 - wave);
    };
    g.strokeStyle = '#1f8a4e'; g.lineWidth = 12; arms(); g.stroke();
    g.strokeStyle = '#4fd68a'; g.lineWidth = 9; arms(); g.stroke();
    // 팔 위쪽 광택 줄 (가산 혼합)
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(-1.5, -2); g.strokeStyle = 'rgba(200,255,220,0.45)'; g.lineWidth = 3; arms(); g.stroke(); g.restore();
    const bgr = g.createRadialGradient(-12, -70, 6, 0, -48, 48);
    bgr.addColorStop(0, '#c8ffd8'); bgr.addColorStop(0.5, '#4fd68a'); bgr.addColorStop(1, '#1a7a4a');
    g.fillStyle = bgr; g.beginPath(); g.ellipse(0, -50, 36, 42, 0, 0, TAU); g.fill();
    // (2026-11-07) 유리 광택 몸: 가장자리 두께감 · 아래 반사광 · 속빛 · 왼쪽 위 광택
    g.save(); g.beginPath(); g.ellipse(0, -50, 36, 42, 0, 0, TAU); g.clip();
    const edge = g.createRadialGradient(-4, -54, 22, 0, -50, 44);
    edge.addColorStop(0, 'rgba(4,30,16,0)'); edge.addColorStop(0.75, 'rgba(4,30,16,0.18)'); edge.addColorStop(1, 'rgba(4,30,16,0.5)');
    g.fillStyle = edge; g.fillRect(-40, -96, 80, 92);
    g.globalCompositeOperation = 'lighter';
    const inner = g.createRadialGradient(12, -30, 0, 12, -30, 30);
    inner.addColorStop(0, 'rgba(160,255,200,0.35)'); inner.addColorStop(1, 'rgba(160,255,200,0)');
    g.fillStyle = inner; g.fillRect(-40, -96, 80, 92);
    const rim = g.createLinearGradient(-20, -80, 20, -10);
    rim.addColorStop(0, 'rgba(180,255,210,0)'); rim.addColorStop(0.6, 'rgba(180,255,210,0)'); rim.addColorStop(1, 'rgba(200,255,225,0.85)');
    g.strokeStyle = rim; g.lineWidth = 4; g.beginPath(); g.ellipse(0, -50, 34, 40, 0, 0, TAU); g.stroke();
    g.restore();
    g.save(); g.translate(-15, -74); g.rotate(-0.7); g.scale(1, 0.5);
    const sp = g.createRadialGradient(0, 0, 0, 0, 0, 14);
    sp.addColorStop(0, 'rgba(255,255,255,0.95)'); sp.addColorStop(0.55, 'rgba(255,255,255,0.75)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill(); g.restore();
    g.fillStyle = 'rgba(255,154,232,0.8)';
    for (const [a, b, c] of [[-18, -30, 5], [14, -26, 4], [20, -68, 3]]) { g.beginPath(); g.arc(a, b, c, 0, TAU); g.fill(); }
    g.strokeStyle = '#4fd68a'; g.lineWidth = 4;
    const sway = calm ? 0 : Math.sin(t * 2.2) * 5;
    g.beginPath(); g.moveTo(0, -90); g.quadraticCurveTo(6 + sway, -112, -4 + sway, -124); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter'; glowDot(g, -4 + sway, -126, 24, 'rgba(255,230,109,0.55)'); g.restore();
    VFX.drawSphere(g, VFX.createGlossySphere(7, '#ffe66d', { glow: 0.8, shadow: 0, res: R.res }), -4 + sway, -126);
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
  const busy = () => R.parts.length > 0 || R.weld.count > 0 || !R.jelly.settled;

  // 손끝 용접 불꽃: 그리는 동안 손가락 자리에서 작은 빛 알갱이가 톡톡 튄다.
  // 움직인 거리만큼 더 많이, 멈춰 있어도 가끔 한두 개. 위쪽으로 튀어 포물선을 그리며 떨어지고 작아지며 사라진다
  function weld(W, tip, pen, dt) {
    if (!(W.drawing && tip)) { R.tip = null; return; }
    const [x, y] = tip;
    const col = pen.rainbow ? ['#ffffff', '#ff7ac8', '#5ee7ff', '#ffe66d'] : ['#ffffff', VC.rgba(VC.lighten(penRGB(pen), 0.45), 1), pen.c[1]];
    let n = 0;
    if (R.tip) n = Math.min(9, Math.floor(Math.hypot(x - R.tip[0], y - R.tip[1]) / 7));
    R.sputter += dt;
    if (R.sputter > 0.04) { R.sputter = 0; n += 2 + (R.weld.rand() < 0.5 ? 1 : 0); }
    if (n > 0) R.weld.emit(x, y, { count: n, kind: 'spark', colors: col, speed: 300, speedJitter: 0.6, angle: -Math.PI / 2, spread: 2.9, gravity: 1300, drag: 1.1, life: 0.48, lifeJitter: 0.45, size: 3.4, sizeJitter: 0.5, glow: 1.3 });
    R.tip = [x, y];
  }
  // 공이 쿵 부딪히는 순간 찾기: 지난 프레임과 속도가 크게 다르면(중력만으로는 못 바뀌는 만큼) 부딪힌 것.
  // 속도가 바뀐 방향이 닿은 면에서 공 쪽으로 미는 방향이라, 그 방향으로 납작하게 한다
  function bounce(W, bs, dt) {
    const p = R.prev;
    R.prev = { W, x: bs.x, y: bs.y, vx: bs.vx, vy: bs.vy, phase: W.phase };
    R.jelly.update(dt);
    if (!p || p.W !== W || p.phase !== W.phase || W.phase !== 'run') return;
    if (Math.hypot(bs.x - p.x, bs.y - p.y) > 120) return; // 처음 자리로 돌아감 같은 순간 이동
    const dvx = bs.vx - p.vx, dvy = bs.vy - p.vy - PH.gravity * PH.scale * dt;
    const dv = Math.hypot(dvx, dvy);
    if (dv < 160) return;
    const k = Math.min(1, (dv - 160) / 520) * 0.75 + 0.25;
    if (k * 0.3 > (R.jelly.scaleX - 1) + 0.02) { R.jAng = Math.atan2(-dvy, -dvx); R.jelly.squash(k); }
  }

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
    R.calm = calm; R.res = Math.max(1, Math.min(3, dpr * f.k * 1.25));
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
    if (W.drawing && W.drawing.pts.length) inkLine(g, W.drawing.pts, 'drawing', pen, null, R.t);
    weld(W, view.drawTip, pen, dt);
    R.weld.update(dt);
    if (view.drawTip) {
      // 손끝: 펜 색 빛 번짐 + 하얀 불씨 + 얇은 빛 고리 (가산 혼합)
      const [x, y] = view.drawTip, pc = pen.rainbow ? [255, 255, 255] : penRGB(pen);
      const flick = calm ? 1 : 0.85 + 0.3 * Math.random();
      g.save(); g.globalCompositeOperation = 'lighter';
      glowDot(g, x, y, 64, VC.rgba(pc, 0.28));
      glowDot(g, x, y, 16 * flick, 'rgba(255,255,255,0.95)');
      g.restore();
      if (W.drawing || !calm) VFX.drawEnergyLine(g, circlePts(x, y, 28), { color: pen.rainbow ? '#ffffff' : pen.c[1], width: 2.2, glow: 0.8, alpha: 0.75, closed: true });
    }
    R.weld.draw(g);
    // 공
    const ch = D.CHARS.find(c => c.id === view.char) || D.CHARS[0];
    const speed = Math.hypot(bs.vx, bs.vy);
    const mood = won ? 'joy' : W.phase === 'fall' || speed > 520 ? 'wow' : 'happy';
    bounce(W, bs, dt);
    if (!calm && speed > 380 && W.phase === 'run') {
      // 빠를 때 혜성 꼬리: 지나온 길을 따라 갈수록 작고 옅어지는 빛 방울 (가산 혼합)
      const k = Math.min(1, (speed - 380) / 500), cc = VC.parse(ch.col[1]);
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 7; i++) {
        const u = i / 7, back = (0.012 + 0.05 * k) * i;
        glowDot(g, bs.x - bs.vx * back, bs.y - bs.vy * back, PH.ballR * (1.05 - u * 0.6), VC.rgba(cc, (0.2 + 0.12 * k) * (1 - u)));
      }
      g.restore();
    }
    const J = R.jelly;
    ball(g, bs.x, bs.y, PH.ballR, bs.a, mood, ch, true, J.settled ? null : { sx: J.scaleX, sy: J.scaleY, ang: R.jAng }, R.res);
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
    ball(g, s / 2, s / 2 - s * 0.02, s * 0.36, 0.3, 'happy', ch, true, null, 2);
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
