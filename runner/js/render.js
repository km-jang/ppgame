'use strict';
// 캔버스 그리기. 게임 상태를 읽기만 하고 규칙은 바꾸지 않는다.
// 입자·흔들림·빛줄기 같은 꾸밈은 규칙 파일이 아니라 여기(R)에 둔다.
// 원근: 카메라는 우주선 뒤 CAMZ m, 높이 camH m에서 앞을 본다. 물체는 규칙의 줄 번호와 거리(z)를 그대로 쓴다
(function (RN) {
  const TAU = Math.PI * 2;
  const D = RN.DATA;
  const NUM = '"Rajdhani", system-ui, sans-serif', DISP = '"Jua", system-ui, sans-serif';
  const LW = 3;     // 줄 사이 거리(m, 그리기 전용)
  const CAMZ = 10;   // 카메라가 우주선 뒤로 떨어진 거리(m)
  const ITEM = D.ITEM.kinds;

  // ─── 화면 배치 ─────────────────────────────────────────────
  // 지평선 높이(hy)와 우주선 바닥 높이(py), 우주선 자리에서 줄 사이 픽셀(lane)을 정하고 원근 값을 맞춘다
  function layout(w, h) {
    const port = h > w * 1.1;
    const hy = Math.round(h * (port ? 0.32 : 0.35));
    const py = h * (port ? 0.8 : 0.83);
    const lane = port ? w * 0.29 : Math.min(w * 0.23, h * 0.4);
    const F = lane * CAMZ / LW;
    return { port, w, h, hy, py, lane, F, camH: (py - hy) * CAMZ / F, cx: w / 2 };
  }
  // lx: 줄 좌표(0·1·2, 소수 가능), rel: 우주선 앞 거리(m), y: 높이(m) → 화면 x·y와 1m당 픽셀 s
  function proj(L, lx, rel, y) {
    const s = L.F / Math.max(0.6, rel + CAMZ);
    return { x: L.cx + (lx - 1) * LW * s, y: L.hy + (L.camH - (y || 0)) * s, s };
  }

  // ─── 미리 그려 두는 것들 ───────────────────────────────────
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // 발광 스프라이트: 색마다 한 번 그려 두고 크기만 바꿔 찍는다 (매 프레임 shadowBlur 금지)
  const glowCache = {};
  function glow(ctx, color, x, y, r, a) {
    let c = glowCache[color];
    if (!c) {
      c = glowCache[color] = mk(64, 64);
      const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    }
    if (r < 1) return;
    ctx.globalAlpha = a;
    ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // ─── 우주 구역 그림 (data.js ZONES와 같은 차례) ───
  // sky: 하늘 위→지평선 · neb: 성운 두 색 · planet: 행성 [밝은 곳, 가운데, 어두운 곳] · ring: 고리 색(r,g,b, 없으면 고리 없음)
  // moon: 작은 달 · hor: 지평선의 큰 것 (sun 줄무늬 해 · ice 얼음 행성 · galaxy 은하 소용돌이) · floor: 바닥 · track: 길 띠
  // grid: 바깥 격자 (r,g,b) · lane: 줄 선·길 테두리 (r,g,b) · glow: 지평선 빛 (r,g,b) · accent: 아치·안내 글자 색
  const ZONE_ART = [
    { sky: ['#04030c', '#120a2e', '#3b1257'], neb: ['rgba(20,90,140,0.35)', 'rgba(110,30,140,0.35)'], star: '#ffe6f2',
      planet: ['#9ff3ff', '#4a7de0', '#2a1a6a'], pglow: 'rgba(94,231,255,0.6)', ring: '255,190,120', moon: ['#ffd6e8', '#a03a7a'],
      hor: 'sun', sun: ['#ffe66d', '#ff7a59', '#ff2e88'], sunGlow: 'rgba(255,90,140,0.8)', stripe: '#2c0e46',
      floor: ['#1b0830', '#0b0418', '#05020c'], track: ['rgba(60,30,110,0.5)', 'rgba(30,60,120,0.35)'],
      grid: '255,46,136', lane: '94,231,255', glow: '255,90,170', line: 'rgba(255,200,230,0.9)', accent: '#ffe66d' },
    { sky: ['#01050f', '#08213f', '#2b6b98'], neb: ['rgba(120,200,255,0.3)', 'rgba(200,230,255,0.22)'], star: '#e8f6ff',
      planet: ['#ffe0f4', '#c080e0', '#40206a'], pglow: 'rgba(220,160,255,0.55)', ring: null, moon: ['#ffffff', '#7fb0d8'],
      hor: 'ice', sun: ['#ffffff', '#bfe8ff', '#5aa8e0'], sunGlow: 'rgba(170,225,255,0.85)', stripe: '#0d3a60',
      floor: ['#0b2440', '#061426', '#02060e'], track: ['rgba(120,190,255,0.3)', 'rgba(200,235,255,0.22)'],
      grid: '110,190,255', lane: '215,245,255', glow: '160,220,255', line: 'rgba(230,248,255,0.95)', accent: '#bff8ff' },
    { sky: ['#010806', '#05261f', '#0f4f3c'], neb: ['rgba(40,210,120,0.35)', 'rgba(20,150,170,0.3)'], star: '#e6ffe8',
      planet: ['#e4ffb8', '#5cc878', '#0d4a3a'], pglow: 'rgba(120,255,160,0.55)', ring: '200,255,150', moon: ['#fff6c8', '#b08a2a'],
      hor: 'sun', sun: ['#f6ff8a', '#8dff8a', '#16c9a0'], sunGlow: 'rgba(90,255,170,0.8)', stripe: '#062a22',
      floor: ['#07261d', '#03120d', '#010604'], track: ['rgba(40,160,110,0.4)', 'rgba(20,110,120,0.3)'],
      grid: '60,255,160', lane: '190,255,120', glow: '120,255,170', line: 'rgba(220,255,210,0.9)', accent: '#c8ff7a' },
    { sky: ['#06020e', '#1d0838', '#4e1a62'], neb: ['rgba(160,70,255,0.35)', 'rgba(255,180,60,0.22)'], star: '#fff2d0',
      planet: ['#fff2b0', '#e0a030', '#5a2a0a'], pglow: 'rgba(255,200,90,0.6)', ring: '255,220,140', moon: ['#e8d0ff', '#6a3aa0'],
      hor: 'galaxy', sun: ['#fffbe0', '#ffd24a', '#b04aff'], sunGlow: 'rgba(255,200,90,0.85)', stripe: '#2a0a3a',
      floor: ['#1c0a2e', '#0c0418', '#05020c'], track: ['rgba(140,70,220,0.45)', 'rgba(255,170,60,0.22)'],
      grid: '255,190,60', lane: '205,150,255', glow: '255,190,90', line: 'rgba(255,236,190,0.95)', accent: '#ffd24a' },
  ];

  // 하늘·행성·해·바닥·줄 테두리: 화면 크기나 구역이 바뀔 때만 다시 그린다 (구역마다 한 장)
  function paintBackdrop(L, dpr, A) {
    const { w, h, hy, cx } = L;
    const c = mk(w * dpr, h * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    const sky = g.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, A.sky[0]); sky.addColorStop(0.55, A.sky[1]); sky.addColorStop(1, A.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, w, hy + 1);
    const rand = RN.rng(9091);
    // 성운
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = rand() * w, y = rand() * hy * 0.8, r = Math.max(w, h) * (0.18 + rand() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, A.neb[i % 2]); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, hy);
    }
    g.globalCompositeOperation = 'source-over';
    // 별
    const n = Math.round(160 * (w * hy) / (1280 * 280));
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.25 + rand() * 0.6;
      g.fillStyle = rand() < 0.15 ? A.star : '#dff6ff';
      const s = rand() < 0.15 ? 2 : 1;
      g.fillRect(rand() * w, rand() * hy * 0.97, s, s);
    }
    g.globalAlpha = 1;
    const m = Math.min(w, h);
    // 행성 (오른쪽 위, 세로 화면은 왼쪽 위). 고리가 있으면 뒤·앞 반쪽을 나눠 그린다
    const px = L.port ? w * 0.24 : w * 0.8, pyy = hy * 0.4, pr = m * (L.port ? 0.1 : 0.085);
    const ringPath = (front) => {
      g.beginPath();
      g.ellipse(px, pyy, pr * 1.9, pr * 0.5, -0.35, front ? 0 : Math.PI, front ? Math.PI : TAU);
    };
    if (A.ring) { g.lineWidth = pr * 0.14; g.strokeStyle = 'rgba(' + A.ring + ',0.55)'; ringPath(false); g.stroke(); }
    const pg = g.createRadialGradient(px - pr * 0.4, pyy - pr * 0.4, pr * 0.1, px, pyy, pr);
    pg.addColorStop(0, A.planet[0]); pg.addColorStop(0.5, A.planet[1]); pg.addColorStop(1, A.planet[2]);
    g.shadowColor = A.pglow; g.shadowBlur = pr * 0.6;
    g.fillStyle = pg; g.beginPath(); g.arc(px, pyy, pr, 0, TAU); g.fill();
    g.shadowBlur = 0;
    g.save(); g.beginPath(); g.arc(px, pyy, pr, 0, TAU); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = -2; k <= 2; k++) g.fillRect(px - pr, pyy + k * pr * 0.35 - pr * 0.06, pr * 2, pr * 0.12);
    g.restore();
    if (A.ring) { g.strokeStyle = 'rgba(' + A.ring + ',0.85)'; g.lineWidth = pr * 0.14; ringPath(true); g.stroke(); }
    // 작은 달
    const mx = L.port ? w * 0.82 : w * 0.16, my = hy * 0.3, mr = m * 0.025;
    const mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
    mg.addColorStop(0, A.moon[0]); mg.addColorStop(1, A.moon[1]);
    g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    // 지평선의 큰 것
    const sr = m * (L.port ? 0.24 : 0.2), sy = hy - sr * 0.12;
    g.save();
    g.beginPath(); g.rect(0, 0, w, hy); g.clip();
    if (A.hor === 'sun') {
      // 줄무늬로 잘린 해
      const sg = g.createLinearGradient(0, sy - sr, 0, sy + sr * 0.3);
      sg.addColorStop(0, A.sun[0]); sg.addColorStop(0.55, A.sun[1]); sg.addColorStop(1, A.sun[2]);
      g.shadowColor = A.sunGlow; g.shadowBlur = sr * 0.5;
      g.fillStyle = sg; g.beginPath(); g.arc(cx, sy, sr, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = A.stripe;
      for (let k = 0; k < 6; k++) g.fillRect(cx - sr, sy - sr * 0.1 + k * sr * 0.16, sr * 2, 2 + k * sr * 0.018);
    } else if (A.hor === 'ice') {
      // 크게 떠오르는 얼음 행성: 흰 극지방 + 파란 띠 + 얼음 금
      const ir = sr * 1.5, iy = hy + ir * 0.45;
      const ig = g.createRadialGradient(cx - ir * 0.35, iy - ir * 0.6, ir * 0.1, cx, iy, ir);
      ig.addColorStop(0, A.sun[0]); ig.addColorStop(0.45, A.sun[1]); ig.addColorStop(1, A.sun[2]);
      g.shadowColor = A.sunGlow; g.shadowBlur = sr * 0.6;
      g.fillStyle = ig; g.beginPath(); g.arc(cx, iy, ir, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.save(); g.beginPath(); g.arc(cx, iy, ir, 0, TAU); g.clip();
      g.strokeStyle = 'rgba(90,160,220,0.45)'; g.lineWidth = Math.max(2, ir * 0.03);
      for (let k = 1; k <= 4; k++) { g.beginPath(); g.ellipse(cx, iy, ir * 1.1, ir * (0.2 + k * 0.17), 0, Math.PI, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1, ir * 0.012);
      const cr = RN.rng(77);
      for (let k = 0; k < 7; k++) {
        let x = cx + (cr() - 0.5) * ir * 1.4, y = iy - ir * (0.3 + cr() * 0.6);
        g.beginPath(); g.moveTo(x, y);
        for (let j2 = 0; j2 < 3; j2++) { x += (cr() - 0.5) * ir * 0.25; y += (cr() - 0.3) * ir * 0.12; g.lineTo(x, y); }
        g.stroke();
      }
      g.restore();
    } else if (A.hor === 'galaxy') {
      // 은하 중심: 금빛 소용돌이 팔 + 밝은 가운데
      g.globalCompositeOperation = 'lighter';
      const gy = hy - sr * 0.25;
      for (let arm = 0; arm < 2; arm++) {
        for (let k = 0; k < 90; k++) {
          const t = k / 90, a = arm * Math.PI + t * 5.2, rr = sr * (0.15 + t * 1.9);
          const x = cx + Math.cos(a) * rr, y = gy + Math.sin(a) * rr * 0.28, rad = sr * (0.2 - t * 0.12);
          const gr = g.createRadialGradient(x, y, 0, x, y, rad);
          gr.addColorStop(0, t < 0.5 ? 'rgba(255,210,120,0.22)' : 'rgba(190,120,255,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
      const cg = g.createRadialGradient(cx, gy, 0, cx, gy, sr * 0.9);
      cg.addColorStop(0, 'rgba(255,255,235,1)'); cg.addColorStop(0.25, 'rgba(255,215,110,0.85)'); cg.addColorStop(1, 'rgba(180,80,255,0)');
      g.fillStyle = cg; g.beginPath(); g.ellipse(cx, gy, sr * 0.9, sr * 0.45, 0, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
    // 바닥 (가까울수록 짙게)
    const fl = g.createLinearGradient(0, hy, 0, h);
    fl.addColorStop(0, A.floor[0]); fl.addColorStop(0.25, A.floor[1]); fl.addColorStop(1, A.floor[2]);
    g.fillStyle = fl; g.fillRect(0, hy, w, h - hy);
    // 달리는 길: 조금 밝은 띠
    const far = D.VIEW, near = -CAMZ + 0.7;
    const quad = (l0, l1) => {
      const a = proj(L, l0, far), b = proj(L, l1, far), cc = proj(L, l1, near), d = proj(L, l0, near);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(cc.x, cc.y); g.lineTo(d.x, d.y); g.closePath();
    };
    const tg = g.createLinearGradient(0, hy, 0, h);
    tg.addColorStop(0, A.track[0]); tg.addColorStop(1, A.track[1]);
    g.fillStyle = tg; quad(-0.5, 2.5); g.fill();
    const line = (l, color, width, blur) => {
      const a = proj(L, l, far), b = proj(L, l, near);
      g.strokeStyle = color; g.lineWidth = width; g.shadowColor = color; g.shadowBlur = blur;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    };
    for (let k = 1; k <= 8; k++) { line(-0.5 - k, 'rgba(' + A.grid + ',0.28)', 1.5, 0); line(2.5 + k, 'rgba(' + A.grid + ',0.28)', 1.5, 0); }
    // 줄 사이 선 (옅게) · 길 테두리 (밝게, 발광은 여기서 한 번만)
    line(0.5, 'rgba(' + A.lane + ',0.35)', 2, 6); line(1.5, 'rgba(' + A.lane + ',0.35)', 2, 6);
    line(-0.5, 'rgba(' + A.lane + ',0.95)', 3, 16); line(2.5, 'rgba(' + A.lane + ',0.95)', 3, 16);
    g.shadowBlur = 0;
    // 지평선 빛
    const hg = g.createLinearGradient(0, hy - 18, 0, hy + 30);
    hg.addColorStop(0, 'rgba(' + A.glow + ',0)'); hg.addColorStop(0.35, 'rgba(' + A.glow + ',0.55)'); hg.addColorStop(1, 'rgba(' + A.glow + ',0)');
    g.fillStyle = hg; g.fillRect(0, hy - 18, w, 48);
    g.fillStyle = A.line; g.fillRect(0, hy, w, 1.5);
    // 가장자리 어둡게
    const v = g.createRadialGradient(cx, h * 0.55, m * 0.35, cx, h * 0.55, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    return c;
  }

  // 운석: 울퉁불퉁한 바위 + 빨간 테두리·빨간 빛무리 + 달아오른 금 (위험하다는 것이 한눈에)
  const MS = 128, MR = 42;   // 스프라이트 크기, 그 안의 바위 반지름
  const meteorSprites = [];
  function meteorSprite(i) {
    if (meteorSprites[i]) return meteorSprites[i];
    const c = mk(MS, MS), g = c.getContext('2d'), o = MS / 2, rand = RN.rng(31 + i * 17);
    const halo = g.createRadialGradient(o, o, MR * 0.8, o, o, o);
    halo.addColorStop(0, 'rgba(255,59,78,0.75)'); halo.addColorStop(1, 'rgba(255,59,78,0)');
    g.fillStyle = halo; g.fillRect(0, 0, MS, MS);
    const pts = [];
    for (let k = 0; k < 11; k++) { const a = TAU * k / 11, r = MR * (0.82 + rand() * 0.18); pts.push([o + Math.cos(a) * r, o + Math.sin(a) * r]); }
    const path = () => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    const rg = g.createRadialGradient(o - MR * 0.4, o - MR * 0.45, MR * 0.1, o, o, MR);
    rg.addColorStop(0, '#8a6470'); rg.addColorStop(0.55, '#46283a'); rg.addColorStop(1, '#1e0f1c');
    path(); g.fillStyle = rg; g.fill();
    // 구덩이
    for (let k = 0; k < 4; k++) {
      const a = rand() * TAU, d = rand() * MR * 0.5, r = MR * (0.1 + rand() * 0.1);
      g.fillStyle = 'rgba(15,5,12,0.55)'; g.beginPath(); g.arc(o + Math.cos(a) * d, o + Math.sin(a) * d, r, 0, TAU); g.fill();
    }
    // 달아오른 금
    g.strokeStyle = '#ff7a3d'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.shadowColor = '#ff3b4e'; g.shadowBlur = 8;
    for (let k = 0; k < 3; k++) {
      let x = o + (rand() - 0.5) * MR, y = o + (rand() - 0.5) * MR;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += (rand() - 0.5) * MR * 0.6; y += (rand() - 0.5) * MR * 0.6; g.lineTo(x, y); }
      g.stroke();
    }
    // 빨간 테두리
    g.shadowBlur = 10; g.strokeStyle = '#ff3b4e'; g.lineWidth = 4; g.lineJoin = 'round';
    path(); g.stroke();
    g.shadowBlur = 0;
    return (meteorSprites[i] = c);
  }

  // 별: 노란 네 갈래 별 + 흰 가운데
  let starSpr = null;
  function starSprite() {
    if (starSpr) return starSpr;
    const c = mk(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,230,109,0.7)'); gr.addColorStop(1, 'rgba(255,230,109,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffe66d';
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + TAU * i / 8, r = i % 2 ? 7 : 20; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.strokeStyle = '#fff4c2'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 4.5, 0, TAU); g.fill();
    return (starSpr = c);
  }

  // 아이템 그림 (HUD 칸·아이템 구슬 공용). r: 크기
  function itemIcon(g, kind, x, y, r, color) {
    g.fillStyle = color; g.strokeStyle = color;
    if (kind === 'shield') {
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r * 0.85, y - r * 0.6); g.lineTo(x + r * 0.75, y + r * 0.25);
      g.quadraticCurveTo(x + r * 0.4, y + r * 0.8, x, y + r); g.quadraticCurveTo(x - r * 0.4, y + r * 0.8, x - r * 0.75, y + r * 0.25);
      g.lineTo(x - r * 0.85, y - r * 0.6); g.closePath(); g.fill();
      g.fillStyle = 'rgba(7,10,18,0.55)'; g.beginPath(); g.moveTo(x, y - r * 0.55); g.lineTo(x + r * 0.45, y - r * 0.3); g.lineTo(x, y + r * 0.55); g.closePath(); g.fill();
    } else if (kind === 'magnet') {
      g.lineWidth = r * 0.5; g.lineCap = 'butt';
      g.beginPath(); g.arc(x, y - r * 0.05, r * 0.6, Math.PI, 0, true); g.stroke();
      g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.05); g.lineTo(x - r * 0.6, y - r * 0.75); g.moveTo(x + r * 0.6, y - r * 0.05); g.lineTo(x + r * 0.6, y - r * 0.75); g.stroke();
      g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.55); g.lineTo(x - r * 0.6, y - r * 0.8); g.moveTo(x + r * 0.6, y - r * 0.55); g.lineTo(x + r * 0.6, y - r * 0.8); g.stroke();
    } else if (kind === 'boost') {
      g.beginPath();
      g.moveTo(x + r * 0.2, y - r); g.lineTo(x - r * 0.6, y + r * 0.12); g.lineTo(x - r * 0.02, y + r * 0.12);
      g.lineTo(x - r * 0.25, y + r); g.lineTo(x + r * 0.62, y - r * 0.18); g.lineTo(x + r * 0.04, y - r * 0.18); g.closePath(); g.fill();
    } else if (kind === 'star') {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + TAU * i / 10, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    } else if (kind === 'heart' || kind === 'heart0') {
      g.beginPath();
      g.moveTo(x, y + r * 0.85);
      g.bezierCurveTo(x - r * 1.3, y - r * 0.05, x - r * 0.6, y - r * 1.1, x, y - r * 0.4);
      g.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.3, y - r * 0.05, x, y + r * 0.85);
      g.closePath();
      if (kind === 'heart') g.fill(); else { g.lineWidth = Math.max(1.5, r * 0.22); g.stroke(); }
    }
  }
  const itemSprites = {};
  function itemSprite(kind) {
    if (itemSprites[kind]) return itemSprites[kind];
    const c = mk(96, 96), g = c.getContext('2d'), K = ITEM[kind];
    const gr = g.createRadialGradient(48, 48, 20, 48, 48, 48);
    gr.addColorStop(0, K.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.7; g.fillStyle = gr; g.fillRect(0, 0, 96, 96); g.globalAlpha = 1;
    g.fillStyle = 'rgba(7,10,18,0.92)'; g.beginPath(); g.arc(48, 48, 30, 0, TAU); g.fill();
    g.lineWidth = 4; g.strokeStyle = K.color; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(40, 34, 12, 6, -0.5, 0, TAU); g.fill();
    itemIcon(g, kind, 48, 49, 17, K.color);
    return (itemSprites[kind] = c);
  }

  // ─── 그리기 상태 (꾸밈 전용) ───────────────────────────────
  // bgs: 구역별 미리 그린 배경 (지금·다음 구역 것만 남긴다) · zone/fromZone/zf: 구역 바뀔 때 겹쳐 바뀌기 · banner: 가운데 큰 글자
  const R = { bgKey: '', bgs: {}, L: null, parts: [], texts: [], shake: 0, flash: 0, flashColor: '255,77,109', world: null, lines: [], twinkle: null,
    zone: 0, fromZone: -1, zf: 1, banner: null, bank: 0 };

  function text(x, y, txt, color, size, life) {
    if (R.texts.length > 10) R.texts.shift();
    R.texts.push({ x, y, txt, color, size, life: life || 0.9, max: life || 0.9 });
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

  // 규칙이 남긴 연출 요청(W.fx)을 입자로 바꾼다
  function takeFx(W, v, L, dist) {
    if (R.world !== W) { R.world = W; R.parts.length = 0; R.texts.length = 0; R.shake = 0; R.flash = 0; R.zone = W.zone; R.fromZone = -1; R.zf = 1; R.banner = null; }
    const s0 = L.F / CAMZ, sq = proj(L, W.p.x, 0, 1.4);
    for (const f of W.fx) {
      const q = proj(L, f.x, Math.max(0, f.z - dist), f.kind === 'star' || f.kind === 'power' ? (f.y || 0.5) : 0.9);
      if (f.kind === 'star') {
        burst(q.x, q.y, D.FX.starSparks, ['#ffe66d', '#fff4c2', '#ffffff'], s0 * 3, s0 * 0.07);
        if (W.chain >= 5 && W.chain % 5 === 0 && !W.fx.some(g => g.kind === 'perfect')) text(q.x, q.y - s0 * 0.6, W.chain + '연속!', '#ffe66d', s0 * 0.3);
      } else if (f.kind === 'power') {
        const K = ITEM[f.item];
        ring(q.x, q.y, s0 * 1.4, K.color, 0.5);
        burst(q.x, q.y, 22, [K.color, '#ffffff'], s0 * 4, s0 * 0.09);
        text(q.x, q.y - s0 * 0.8, f.item === 'heart' ? '하트 +1' : K.name + '!', K.color, s0 * 0.36);
      } else if (f.kind === 'shield') {
        ring(q.x, q.y, s0 * 1.6, '#5ee7ff', 0.5); ring(q.x, q.y, s0 * 2.4, '#bff8ff', 0.6);
        burst(q.x, q.y, 20, ['#5ee7ff', '#ffffff', '#8a6470'], s0 * 5, s0 * 0.1);
        text(q.x, q.y - s0 * 0.9, '방패가 막았다!', '#5ee7ff', s0 * 0.3);
        R.flash = D.FX.flash * 0.6; R.flashColor = '94,231,255';
      } else if (f.kind === 'smash') {
        burst(q.x, q.y, D.FX.smashSparks, f.what === 'gate' ? ['#ff3b4e', '#ffe66d', '#ffffff'] : ['#8a6470', '#ff7a3d', '#ffe66d', '#46283a'], s0 * 6, s0 * 0.12);
        ring(q.x, q.y, s0 * 1.4, '#ffe66d', 0.35);
        if (!v.calm) R.shake = Math.max(R.shake, D.FX.shake * 0.35);
      } else if (f.kind === 'hit' || f.kind === 'crash') {
        // 분명하지만 무섭지 않게: 동그란 고리 + 별가루 + 짧은 글자, 흔들림·번쩍임은 작게
        const big = f.kind === 'crash';
        ring(q.x, q.y, s0 * (big ? 2.4 : 1.7), '#ff6b8a', 0.55);
        burst(q.x, q.y, D.FX.hitSparks * (big ? 1.4 : 1), ['#ff6b8a', '#ffd0d5', '#ffffff', '#ffe66d', '#8a6470'], s0 * (big ? 7 : 5), s0 * 0.11);
        if (!v.calm) R.shake = D.FX.shake * (big ? 1.2 : 1);
        R.flash = D.FX.flash; R.flashColor = '255,107,138';
        if (!big) text(sq.x, sq.y - s0 * 0.4, W.hearts > 0 ? '앗, 쿵! 하트 ' + W.hearts + '개 남았어요' : '쿵!', '#ffb3c4', s0 * 0.3, 1.3);
      } else if (f.kind === 'near') {
        text(sq.x, sq.y - s0 * 0.2, '아슬아슬! +' + f.pts, '#bff8ff', s0 * 0.3, 1.0);
        burst(sq.x, sq.y + s0 * 0.3, 10, ['#bff8ff', '#ffffff'], s0 * 3, s0 * 0.06);
      } else if (f.kind === 'perfect') {
        ring(q.x, q.y, s0 * 1.8, '#ffe66d', 0.6);
        burst(q.x, q.y, 16, ['#ffe66d', '#fff4c2', '#ff9fcb'], s0 * 5, s0 * 0.09);
        text(sq.x, sq.y - s0 * 1.0, '완벽! +' + f.pts, '#ffe66d', s0 * 0.4, 1.2);
      } else if (f.kind === 'milestone') {
        const A = ZONE_ART[W.zone];
        // 구역 도착과 같은 아치면 구역 글자 아래에 거리만 덧붙인다
        if (R.banner && !R.banner.small && R.banner.t < 0.5) R.banner.sub = f.m.toLocaleString() + 'm · +' + f.pts + '점';
        else R.banner = { big: f.m.toLocaleString() + 'm', sub: '+' + f.pts + '점', color: A.accent, t: 0, max: 1.6, small: true };
        burst(L.cx, L.hy + (L.py - L.hy) * 0.2, 26, [A.accent, '#ffffff'], s0 * 6, s0 * 0.1);
      } else if (f.kind === 'zone') {
        R.fromZone = R.zone; R.zone = f.i; R.zf = 0;
        const A = ZONE_ART[f.i];
        R.banner = { big: D.ZONES[f.i].name + ' 도착!', sub: '', color: A.accent, t: 0, max: D.FX.banner };
      } else if (f.kind === 'tutok') {
        text(sq.x, sq.y - s0 * 0.8, '잘했어요!', '#ffe66d', s0 * 0.45, 1.4);
        burst(sq.x, sq.y, 24, ['#ffe66d', '#5ee7ff', '#ffffff'], s0 * 5, s0 * 0.1);
      } else if (f.kind === 'tutmiss') {
        text(sq.x, sq.y - s0 * 0.8, '괜찮아요! 다시 한 번', '#bff8ff', s0 * 0.36, 1.4);
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
    for (let i = R.texts.length - 1; i >= 0; i--) { const q = R.texts[i]; q.life -= dt; q.y -= 36 * dt; if (q.life <= 0) R.texts.splice(i, 1); }
    R.shake = Math.max(0, R.shake - dt * 40);
    R.flash = Math.max(0, R.flash - dt);
    if (R.zf < 1) R.zf = Math.min(1, R.zf + dt / D.FX.zoneFade);
    if (R.banner && (R.banner.t += dt) > R.banner.max) R.banner = null;
  }

  function drawFx(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const q of R.parts) {
      const a = q.life / q.max;
      ctx.globalAlpha = a;
      if (q.ring) {
        ctx.strokeStyle = q.color; ctx.lineWidth = 2 + a * 4;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.1 - a * 0.8), 0, TAU); ctx.stroke();
      } else {
        const s = q.size * (0.5 + a * 0.5);
        ctx.fillStyle = q.color; ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const q of R.texts) {
      ctx.globalAlpha = Math.min(1, q.life / q.max * 2);
      ctx.font = Math.round(Math.max(16, Math.min(40, q.size))) + 'px ' + DISP;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(q.txt, q.x, q.y);
      ctx.fillStyle = q.color; ctx.fillText(q.txt, q.x, q.y);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // ─── 배경 · 움직이는 바닥 격자 · 빛줄기 ───────────────────
  function backdrop(i, L, v) {
    return R.bgs[i] || (R.bgs[i] = paintBackdrop(L, v.dpr, ZONE_ART[i]));
  }
  function drawBackground(ctx, W, v, L, dist, dt) {
    const key = v.w + 'x' + v.h + '@' + v.dpr;
    if (R.bgKey !== key) {
      R.bgKey = key; R.bgs = {};
      const rand = RN.rng(515);
      R.twinkle = [];
      for (let i = 0; i < 26; i++) R.twinkle.push({ x: rand() * v.w, y: rand() * L.hy * 0.9, ph: rand() * TAU });
    }
    // 지금·겹치는 중인 구역 배경만 남긴다 (메모리). 다음 구역은 가까워지면 미리 그려 둔다
    for (const k in R.bgs) if (+k !== R.zone && +k !== R.fromZone && +k !== R.zone + 1) delete R.bgs[k];
    const next = D.ZONES[R.zone + 1];
    if (next && !R.bgs[R.zone + 1] && next.at - dist < 160) backdrop(R.zone + 1, L, v);
    if (R.zf < 1 && R.fromZone >= 0) {
      ctx.drawImage(backdrop(R.fromZone, L, v), 0, 0, v.w, v.h);
      ctx.globalAlpha = R.zf;
      ctx.drawImage(backdrop(R.zone, L, v), 0, 0, v.w, v.h);
      ctx.globalAlpha = 1;
    } else ctx.drawImage(backdrop(R.zone, L, v), 0, 0, v.w, v.h);
    const A = ZONE_ART[R.zone];
    // 반짝이는 별 몇 개
    const t = performance.now() / 1000;
    ctx.fillStyle = '#ffffff';
    for (const s of R.twinkle) {
      const a = v.calm ? 0.5 : 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.3 + s.ph));
      ctx.globalAlpha = a; ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3);
    }
    ctx.globalAlpha = 1;
    // 가로 격자선: 5m마다, 달린 만큼 다가온다
    const gap = 5, first = Math.ceil(dist / gap) * gap - dist;
    ctx.lineWidth = 1.5;
    for (let rel = first - gap; rel < D.VIEW; rel += gap) {
      if (rel < -CAMZ + 0.8) continue;
      const a = Math.min(1, (D.VIEW - rel) / 30);
      const l = proj(L, -8.5, rel), r = proj(L, 10.5, rel), tl = proj(L, -0.5, rel), tr = proj(L, 2.5, rel);
      ctx.globalAlpha = a * 0.35; ctx.strokeStyle = 'rgb(' + A.grid + ')';
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
      ctx.globalAlpha = a * 0.55; ctx.strokeStyle = 'rgb(' + A.lane + ')';
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 빛줄기: 빨라질수록·부스트 때 지평선에서 사방으로 흩어진다 (움직임 줄이기 설정이면 생략)
    if (v.calm || !W || W.phase !== 'play' || W.wait > 0) return;
    const S = RN.World.cfg(W).speed, sp = RN.World.speed(W);
    const k = Math.max(0, Math.min(1, (sp - S.base) / (S.max - S.base)));
    const boost = W.eff.boost > 0, want = boost ? 26 : Math.round(4 + k * 10);
    while (R.lines.length < want) R.lines.push({ a: Math.random() * TAU, r: Math.random() * 0.8 + 0.1, v: 0.6 + Math.random() * 0.8 });
    if (R.lines.length > want) R.lines.length = want;
    const maxR = Math.hypot(v.w, v.h) * 0.6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = boost ? '#ffe66d' : '#bff8ff';
    ctx.lineWidth = boost ? 2.5 : 1.5;
    for (const q of R.lines) {
      q.r += q.v * dt * (boost ? 2.4 : 1 + k);
      if (q.r > 1.1) { q.r = 0.12; q.a = Math.random() * TAU; }
      const ca = Math.cos(q.a), sa = Math.sin(q.a);
      if (sa < 0.03) { q.a = 0.1 + Math.random() * (Math.PI - 0.2); continue; }   // 하늘 쪽 위로는 그리지 않는다
      const r0 = q.r * q.r * maxR, r1 = r0 + (0.05 + q.r * 0.18) * maxR;
      ctx.globalAlpha = Math.min(1, q.r * 2) * (boost ? 0.55 : 0.28);
      ctx.beginPath(); ctx.moveTo(L.cx + ca * r0, L.hy + sa * r0); ctx.lineTo(L.cx + ca * r1, L.hy + sa * r1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ─── 물체 ─────────────────────────────────────────────────
  // 바닥의 위험 표시: 장애물이 있는 줄 바닥에 빨간 판
  function floorQuad(ctx, L, lx, rel, halfW, depth) {
    const a = proj(L, lx - halfW, rel + depth), b = proj(L, lx + halfW, rel + depth), c = proj(L, lx + halfW, Math.max(-CAMZ + 0.7, rel - depth)), d = proj(L, lx - halfW, Math.max(-CAMZ + 0.7, rel - depth));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }

  function drawMeteor(ctx, W, L, o, rel, fade, v) {
    ctx.globalAlpha = fade * 0.4;
    ctx.fillStyle = '#ff3b4e';
    floorQuad(ctx, L, o.x, rel, 0.42, 1.1); ctx.fill();
    ctx.globalAlpha = fade;
    const q = proj(L, o.x, rel, D.OBST.meteorR * 0.95);
    const r = D.OBST.meteorR * q.s, spr = meteorSprite(Math.abs(Math.round(o.z * 7)) % 3), size = r * MS / MR;
    const rot = (v.calm ? 0 : W.t * 0.8) + o.z;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(rot);
    ctx.drawImage(spr, -size / 2, -size / 2, size, size);
    ctx.restore();
    // 움직이는 운석: 미끄러질 방향으로 빨간 꺾쇠
    if (o.moving && o.x !== o.to) {
      const d = Math.sign(o.to - o.from), blink = v.calm ? 1 : 0.6 + 0.4 * Math.sin(W.t * 14);
      ctx.globalAlpha = fade * blink;
      ctx.strokeStyle = '#ffd0d5'; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const k of [1.25, 1.6]) {
        const x = q.x + d * r * k, a = r * 0.28;
        ctx.beginPath(); ctx.moveTo(x - d * a, q.y - a); ctx.lineTo(x, q.y); ctx.lineTo(x - d * a, q.y + a); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
  }

  // 레이저 문: 양쪽 기둥 + 빨간 레이저 두 줄 + 바닥 노랑·검정 사선 줄무늬 (뛰어서 넘는다)
  function drawGate(ctx, W, L, o, rel, fade, v) {
    ctx.globalAlpha = fade;
    ctx.save();
    floorQuad(ctx, L, o.x, rel, 0.47, 0.5);
    ctx.fillStyle = '#2a070c'; ctx.fill();
    ctx.clip();
    const a = proj(L, o.x - 0.5, rel), b = proj(L, o.x + 0.5, rel);
    ctx.strokeStyle = 'rgba(255,200,40,0.8)'; ctx.lineWidth = Math.max(2, a.s * 0.25);
    ctx.beginPath();
    for (let k = -0.6; k < 1.6; k += 0.22) { const x = a.x + (b.x - a.x) * k; ctx.moveTo(x, a.y + a.s * 0.5); ctx.lineTo(x + a.s * 0.5, a.y - a.s * 0.5); }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = fade;
    const hgt = D.OBST.gateH;
    const lb = proj(L, o.x - 0.44, rel, 0), lt = proj(L, o.x - 0.44, rel, hgt + 0.35), rb = proj(L, o.x + 0.44, rel, 0), rt = proj(L, o.x + 0.44, rel, hgt + 0.35);
    // 기둥
    const pw = Math.max(2, lb.s * 0.16);
    ctx.fillStyle = '#3a0a10'; ctx.strokeStyle = '#ff3b4e'; ctx.lineWidth = Math.max(1, pw * 0.25);
    for (const [bt, tp] of [[lb, lt], [rb, rt]]) { ctx.fillRect(bt.x - pw / 2, tp.y, pw, bt.y - tp.y); ctx.strokeRect(bt.x - pw / 2, tp.y, pw, bt.y - tp.y); }
    // 레이저 (깜빡이는 빨강, 발광은 스프라이트로)
    const flick = v.calm ? 1 : 0.8 + 0.2 * Math.sin(W.t * 30 + o.z);
    ctx.globalCompositeOperation = 'lighter';
    for (const hh of [hgt * 0.45, hgt * 0.9]) {
      const l = proj(L, o.x - 0.44, rel, hh), r = proj(L, o.x + 0.44, rel, hh);
      const n = 5;
      for (let i = 0; i <= n; i++) glow(ctx, 'rgba(255,59,78,0.9)', l.x + (r.x - l.x) * i / n, l.y, l.s * 0.3, fade * 0.6 * flick);
      ctx.globalAlpha = fade * flick;
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = Math.max(2, l.s * 0.09);
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
      ctx.strokeStyle = '#ffd0d5'; ctx.lineWidth = Math.max(1, l.s * 0.03);
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 기둥 끝 불빛
    ctx.fillStyle = '#ffe66d';
    for (const tp of [lt, rt]) { ctx.beginPath(); ctx.arc(tp.x, tp.y, Math.max(1.5, tp.s * 0.1), 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function drawStar(ctx, W, L, o, rel, fade, v) {
    const q = proj(L, o.x, rel, o.y + (v.calm ? 0 : Math.sin(W.t * 4 + o.z) * 0.08));
    const size = q.s * 0.9 * (o.mag ? 0.8 : 1);
    if (size < 1.5) return;
    ctx.globalAlpha = fade;
    if (v.calm) ctx.drawImage(starSprite(), q.x - size / 2, q.y - size / 2, size, size);
    else {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.sin(W.t * 3 + o.z) * 0.35);
      ctx.drawImage(starSprite(), -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawItem(ctx, W, L, o, rel, fade, v) {
    const K = ITEM[o.item];
    const q = proj(L, o.x, rel, o.y + (v.calm ? 0 : Math.sin(W.t * 5) * 0.1));
    const size = q.s * 1.35;
    ctx.globalAlpha = fade;
    ctx.drawImage(itemSprite(o.item), q.x - size / 2, q.y - size / 2, size, size);
    // 이름표: 멀리서도 읽을 수 있게 글자 크기는 너무 작아지지 않는다 (좋은 것이라는 것을 알 수 있게)
    if (rel > 2) {
      const fs = Math.round(Math.max(14, Math.min(26, q.s * 0.42)));
      ctx.font = fs + 'px ' + DISP;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const ty = q.y - size * 0.42 - fs * 0.7;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.9)'; ctx.strokeText(K.name, q.x, ty);
      ctx.fillStyle = K.color; ctx.fillText(K.name, q.x, ty);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  }

  // 기념 아치: 길 전체를 덮는 빛나는 문 + 거리 숫자 (구역이 바뀌는 곳이면 구역 이름도)
  function drawArch(ctx, W, L, o, rel, fade, v) {
    const A = ZONE_ART[o.zone != null ? o.zone : W.zone], col = 'rgb(' + A.lane + ')';
    const H = 4.4, n = 18, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = Math.PI * t;
      pts.push(proj(L, 1 - Math.cos(a) * 1.85, rel, Math.sin(a) * H * 0.75));
    }
    // 기둥
    const lb = proj(L, -0.85, rel, 0), rb = proj(L, 2.85, rel, 0), s = lb.s;
    ctx.globalAlpha = fade;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i <= n; i += 2) glow(ctx, 'rgba(' + A.lane + ',0.8)', pts[i].x, pts[i].y, s * 0.55, fade * 0.35);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(lb.x, lb.y); for (const q of pts) ctx.lineTo(q.x, q.y); ctx.lineTo(rb.x, rb.y); };
    path(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, s * 0.22); ctx.stroke();
    path(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, s * 0.07); ctx.stroke();
    // 아치 위 작은 불빛들 (돈다)
    const tt = v.calm ? 0 : W.t * 1.5;
    ctx.fillStyle = A.accent;
    for (let k = 0; k < 5; k++) { const q = pts[Math.floor(((k / 5 + tt * 0.1) % 1) * n)]; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.5, s * 0.1), 0, TAU); ctx.fill(); }
    // 거리 판
    const top = pts[n >> 1], fs = Math.round(Math.max(10, Math.min(64, s * 0.8)));
    if (fs >= 11) {
      const zoneHere = D.ZONES.find(z => z.at === o.m);
      const txt = o.m.toLocaleString() + 'm';
      ctx.font = 'italic 700 ' + fs + 'px ' + NUM;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(txt).width + fs * 0.8, th = fs * 1.2, ty = top.y - th * 0.15;
      ctx.fillStyle = 'rgba(8,10,20,0.85)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(top.x - tw / 2, ty - th / 2, tw, th, fs * 0.3); else ctx.rect(top.x - tw / 2, ty - th / 2, tw, th); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, fs * 0.06); ctx.stroke();
      ctx.fillStyle = A.accent; ctx.fillText(txt, top.x, ty + 1);
      if (zoneHere && fs >= 14) {
        const zs = Math.round(fs * 0.55);
        ctx.font = zs + 'px ' + DISP;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(zoneHere.name, top.x, ty + th * 0.95);
        ctx.fillStyle = '#ffffff'; ctx.fillText(zoneHere.name, top.x, ty + th * 0.95);
      }
      ctx.textBaseline = 'alphabetic';
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  function drawObject(ctx, W, L, o, dist, v) {
    const rel = o.z - dist;
    if (rel + CAMZ < 1.2 || rel > D.VIEW) return;
    if (o.kind === 'arch') {
      if (rel < -CAMZ + 3) return;
      const fa = Math.max(0, Math.min(1, (D.VIEW - rel) / 18, (rel + CAMZ - 3) / 5));
      if (fa > 0) drawArch(ctx, W, L, o, rel, fa, v);
      return;
    }
    // 지평선 쪽에서 서서히 나타나고, 우주선 뒤로 지나가면 금방 사라진다
    const fade = Math.max(0, Math.min(1, (D.VIEW - rel) / 18, 1 + rel / 3));
    if (fade <= 0) return;
    if (o.kind === 'meteor') drawMeteor(ctx, W, L, o, rel, fade, v);
    else if (o.kind === 'gate') drawGate(ctx, W, L, o, rel, fade, v);
    else if (o.kind === 'star') drawStar(ctx, W, L, o, rel, fade, v);
    else if (o.kind === 'item') drawItem(ctx, W, L, o, rel, fade, v);
  }

  // ─── 꾸미기 (상점) ───
  const skinOf = id => (D.SKINS && D.SKINS.find(x => x.id === id)) || (D.SKINS ? D.SKINS[0] : null) ||
    { shape: 'jet', body: ['#d9fbff', '#5ee7ff', '#1a9ec0'], stripe: '#ff2e88', flame: '255,46,136', core: '#5ee7ff' };
  // 우주선 몸: 가운데가 (0,0), 코가 위(-1), 엔진이 아래(+0.5), 날개 끝이 ±1. ctx는 이미 옮기고 늘려 둔 상태
  function drawShipBody(ctx, SK, boost, blink, t, calm) {
    const col = boost ? ['#fffbd0', '#ffe66d', '#d9a400'] : SK.body;
    const bg = ctx.createLinearGradient(0, -1, 0, 0.5);
    bg.addColorStop(0, col[0]); bg.addColorStop(0.45, col[1]); bg.addColorStop(1, col[2]);
    const poly = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
    const mirror = half => half.concat(half.slice().reverse().map(([x, y]) => [-x, y]));
    // 별똥: 몸 뒤로 반짝 꼬리
    if (SK.shape === 'comet') {
      const tg = ctx.createLinearGradient(0, 0.2, 0, 1.6);
      tg.addColorStop(0, 'rgba(255,230,109,0.8)'); tg.addColorStop(1, 'rgba(255,150,220,0)');
      ctx.fillStyle = tg;
      poly([[-0.45, 0.25], [0.45, 0.25], [0.12, 1.6], [-0.12, 1.6]]); ctx.fill();
    }
    let body;
    if (SK.shape === 'bolt') body = mirror([[0, -1.2], [0.2, -0.35], [0.55, -0.12], [0.36, 0.04], [1.05, 0.46], [0.3, 0.36], [0.18, 0.52]]);
    else if (SK.shape === 'comet') body = mirror([[0, -1.1], [0.28, -0.3], [0.85, 0.42], [0.3, 0.3], [0.18, 0.5]]);
    else if (SK.shape === 'phoenix') body = mirror([[0, -1.05], [0.22, -0.4], [0.6, -0.2], [1.08, -0.05], [0.82, 0.12], [1.02, 0.24], [0.72, 0.3], [0.9, 0.44], [0.3, 0.36], [0.18, 0.5]]);
    else if (SK.shape !== 'whale') body = mirror([[0, -1.05], [0.3, -0.25], [1.02, 0.34], [0.95, 0.46], [0.3, 0.36], [0.18, 0.5]]);
    if (SK.shape === 'whale') {
      // 고래: 둥근 몸 + 작은 지느러미 날개
      ctx.fillStyle = bg;
      poly([[0.35, 0.0], [1.0, 0.32], [0.95, 0.46], [0.3, 0.34]]); ctx.fill();
      poly([[-0.35, 0.0], [-1.0, 0.32], [-0.95, 0.46], [-0.3, 0.34]]); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -0.22, 0.46, 0.78, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 0.04; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
      ctx.strokeStyle = SK.stripe; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, -0.2, 0.36, 0.35, Math.PI - 0.35); ctx.stroke();
    } else {
      poly(body); ctx.fillStyle = bg; ctx.fill();
      ctx.lineWidth = 0.04; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
      // 날개 줄무늬
      ctx.strokeStyle = boost ? '#20242e' : SK.stripe; ctx.lineWidth = 0.07;
      ctx.beginPath();
      if (SK.shape === 'phoenix') { for (const k of [0.55, 0.8]) { ctx.moveTo(0.3, 0.05); ctx.lineTo(k + 0.15, k * 0.2 - 0.05); ctx.moveTo(-0.3, 0.05); ctx.lineTo(-k - 0.15, k * 0.2 - 0.05); } }
      else if (SK.shape === 'bolt') { ctx.moveTo(0.3, -0.05); ctx.lineTo(0.55, 0.12); ctx.lineTo(0.85, 0.38); ctx.moveTo(-0.3, -0.05); ctx.lineTo(-0.55, 0.12); ctx.lineTo(-0.85, 0.38); }
      else { ctx.moveTo(0.42, 0.05); ctx.lineTo(0.9, 0.38); ctx.moveTo(-0.42, 0.05); ctx.lineTo(-0.9, 0.38); }
      ctx.stroke();
    }
    // 엔진 두 개
    ctx.fillStyle = '#0c2a3a';
    ctx.fillRect(-0.36, 0.3, 0.2, 0.2); ctx.fillRect(0.16, 0.3, 0.2, 0.2);
    ctx.fillStyle = boost ? '#ffe66d' : 'rgb(' + SK.flame + ')';
    ctx.fillRect(-0.33, 0.44, 0.14, 0.06); ctx.fillRect(0.19, 0.44, 0.14, 0.06);
    // 조종석: 어두운 알 + 앞쪽 빛
    ctx.fillStyle = '#07080d';
    ctx.beginPath(); ctx.ellipse(0, -0.12, 0.2, 0.32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = boost ? '#ffe66d' : SK.core;
    ctx.beginPath(); ctx.arc(0, -0.26, 0.08, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-0.07, -0.2, 0.05, 0.12, 0, 0, TAU); ctx.fill();
    // 날개 끝 불빛
    ctx.fillStyle = blink ? '#ffe66d' : '#8a6a20';
    const wx = SK.shape === 'whale' ? 0.97 : SK.shape === 'bolt' ? 1.03 : 1.0;
    ctx.beginPath(); ctx.arc(wx, 0.4, 0.05, 0, TAU); ctx.arc(-wx, 0.4, 0.05, 0, TAU); ctx.fill();
    // 황금: 반짝이는 빛 한 줄기가 지나간다
    if (SK.shine && !calm) {
      const k = ((t || 0) * 0.6) % 1.6 - 0.3;
      ctx.save(); poly(body || []); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.moveTo(-1 + k * 2, -1.2); ctx.lineTo(-0.8 + k * 2, -1.2); ctx.lineTo(-1.2 + k * 2, 0.6); ctx.lineTo(-1.4 + k * 2, 0.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  // 상점·시작 화면의 작은 그림 (캔버스 하나에 우주선 하나, 불꽃까지)
  function paintSkin(cv, id) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, SK = skinOf(id);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const s = Math.min(w, h) * 0.4, cx = w / 2, cy = h * 0.5;
    g.globalCompositeOperation = 'lighter';
    for (const ex of [-0.26, 0.26]) glow(g, 'rgba(' + SK.flame + ',0.9)', cx + ex * s, cy + 0.62 * s, 0.3 * s, 1);
    g.globalCompositeOperation = 'source-over';
    g.save(); g.translate(cx, cy); g.scale(s, s);
    drawShipBody(g, SK, false, true, 0.4, true);
    g.restore();
  }

  // ─── 우주선 (뿅뿅 우주선 가족: 청록 몸 + 흰 테두리 + 어두운 조종석 알 + 앞쪽 빛) ───
  function drawShip(ctx, W, L, v) {
    const p = W.p, a = W.phase === 'play' ? W.alpha : 1;
    const x = p.px + (p.x - p.px) * a, y = p.py + (p.y - p.py) * a;
    const dead = W.phase === 'over';
    // 바닥 그림자: 뛰면 작고 옅어진다
    const sh = proj(L, x, 0, 0), k = 1 / (1 + y * 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(sh.x, sh.y, sh.s * 0.9 * k, sh.s * 0.22 * k, 0, 0, TAU); ctx.fill();
    glow(ctx, W.eff.boost > 0 ? 'rgba(255,230,109,0.55)' : 'rgba(94,231,255,0.45)', sh.x, sh.y, sh.s * 1.1 * k, 0.8 * k);
    if (dead) return;
    // 깜빡임 (부딪힌 뒤 무적)
    if (W.inv > 0 && Math.floor(W.t * 12) % 2 === 0) ctx.globalAlpha = 0.3;
    const q = proj(L, x, 0, y + 0.45), s = q.s;
    // 기울기: 옆으로 움직이는 빠르기를 따라 부드럽게 (줄 바꾸기 곡선과 같이 기울었다 돌아온다)
    const vel = W.phase === 'play' ? (p.x - p.px) / D.TICK : 0;
    R.bank += (Math.max(-0.5, Math.min(0.5, vel * 0.05)) - R.bank) * Math.min(1, (R.dt || 0.016) * 20);
    const bank = R.bank + (W.inv > 0 && W.hits && !v.calm ? Math.sin(W.t * 30) * 0.04 * Math.min(1, W.inv) : 0);
    const boost = W.eff.boost > 0, SK = skinOf(W.skin);
    const alphaNow = ctx.globalAlpha;
    // 엔진 불꽃 (화면 아래쪽 = 카메라 쪽으로). 색은 꾸미기마다
    const fl = (boost ? 1.9 : 1) * (v.calm ? 1 : 0.85 + Math.random() * 0.3);
    ctx.globalCompositeOperation = 'lighter';
    for (const ex of [-0.26, 0.26]) {
      const fx = q.x + ex * s, fy = q.y + 0.42 * s;
      glow(ctx, boost ? 'rgba(255,230,109,0.9)' : 'rgba(' + SK.flame + ',0.85)', fx, fy + 0.18 * s * fl, 0.3 * s * fl, alphaNow);
      glow(ctx, 'rgba(255,244,194,0.9)', fx, fy + 0.08 * s, 0.14 * s, alphaNow);
    }
    ctx.globalCompositeOperation = 'source-over';
    // 몸 밑 발광
    glow(ctx, boost ? 'rgba(255,230,109,0.6)' : 'rgba(' + SK.flame + ',0.35)', q.x, q.y, s * 1.25, 0.7 * alphaNow);
    ctx.save();
    ctx.translate(q.x, q.y); ctx.rotate(bank); ctx.scale(s * (1 - Math.min(0.35, Math.abs(bank) * 0.5)), s);
    drawShipBody(ctx, SK, boost, v.calm || Math.floor(W.t * 3) % 2 === 0, W.t, v.calm);
    ctx.restore();
    ctx.globalAlpha = 1;
    // 방패: 둥근 막
    if (W.shield) {
      const pulse = v.calm ? 1 : 1 + Math.sin(W.t * 4) * 0.04;
      glow(ctx, 'rgba(94,231,255,0.35)', q.x, q.y, s * 1.5 * pulse, 0.8);
      ctx.strokeStyle = 'rgba(191,248,255,0.85)'; ctx.lineWidth = Math.max(2, s * 0.04);
      ctx.beginPath(); ctx.ellipse(q.x, q.y - s * 0.1, s * 1.25 * pulse, s * 0.85 * pulse, 0, 0, TAU); ctx.stroke();
    }
    // 자석: 분홍 고리가 번져 나간다
    if (W.eff.magnet > 0) {
      const tt = v.calm ? 0.5 : (W.t * 1.5) % 1;
      ctx.globalAlpha = (1 - tt) * 0.7 * Math.min(1, W.eff.magnet);
      ctx.strokeStyle = '#ff5fa8'; ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath(); ctx.ellipse(q.x, q.y, s * (1 + tt * 1.4), s * (0.5 + tt * 0.7), 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ─── 위험 · 점프 안내: 지금 줄 바로 앞 장애물 위에 말풍선 ───
  function drawDanger(ctx, W, L, dist, v) {
    if (W.phase !== 'play' || W.wait > 0 || W.eff.boost > 0) return;
    const d = RN.World.dangerAhead(W, 1.3);
    if (!d || d.t < 0.12) return;
    const o = d.o, rel = o.z - dist, gate = o.kind === 'gate';
    const lx = o.moving && o.x !== o.to ? W.p.lane : o.x;
    const q = proj(L, lx, rel, gate ? D.OBST.gateH + 0.9 : D.OBST.meteorR * 2 + 0.5);
    const fs = Math.round(Math.max(16, Math.min(28, q.s * 0.5 + 8)));
    const txt = gate ? '점프!' : '위험!';
    const blink = v.calm ? 1 : 0.7 + Math.sin(W.t * (d.t < 0.6 ? 22 : 12)) * 0.3;
    ctx.globalAlpha = blink;
    ctx.font = fs + 'px ' + DISP;
    const tw = ctx.measureText(txt).width + fs * 1.1, th = fs * 1.5;
    ctx.fillStyle = gate ? 'rgba(40,30,4,0.9)' : 'rgba(40,4,10,0.9)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(q.x - tw / 2, q.y - th, tw, th, fs * 0.4); else ctx.rect(q.x - tw / 2, q.y - th, tw, th);
    ctx.fill();
    ctx.strokeStyle = gate ? '#ffe66d' : '#ff3b4e'; ctx.lineWidth = 2; ctx.stroke();
    // 꼬리
    ctx.beginPath(); ctx.moveTo(q.x - fs * 0.3, q.y); ctx.lineTo(q.x, q.y + fs * 0.4); ctx.lineTo(q.x + fs * 0.3, q.y); ctx.closePath();
    ctx.fillStyle = gate ? '#ffe66d' : '#ff3b4e'; ctx.fill();
    ctx.fillStyle = gate ? '#fff4c2' : '#ffd0d5';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, q.x, q.y - th / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  // ─── 밀기 표시: 손가락으로 민(누른) 자리에 그 방향 화살표가 잠깐 떴다 사라진다 (알아들었다는 표시) ───
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const SWIPE_TIME = 380;
  function drawSwipe(ctx, W, v) {
    const I = v.pad, sw = I && I.swipe;
    if (!sw || W.phase === 'over') return;
    const age = performance.now() - sw.t;
    if (age > SWIPE_TIME) { I.swipe = null; return; }
    const k = age / SWIPE_TIME, d = DIRS[sw.dir] || DIRS.up;
    const r = Math.max(24, Math.min(40, Math.min(v.w, v.h) * 0.045)), push = v.calm ? 0 : k * r * 0.8;
    const x = sw.x + d[0] * push, y = sw.y + d[1] * push;
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.fillStyle = 'rgba(12,22,38,0.5)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = Math.max(3, r * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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

  // ─── HUD: 위쪽 한 줄. 오른쪽 끝에 거리, 그 왼쪽에 작은 칸들 ─────
  // icon: 칸 왼쪽의 작은 그림 ('star' 'heart' 'shield' 'magnet' 'boost'), hearts: [찬 수, 전체]
  function chipW(ctx, h, txt, s, icon, hearts) {
    const ir = h * 0.3;
    return (txt ? ctx.measureText(txt).width : 0) + 16 * s + (icon ? ir * 2 + 5 * s : 0) + (hearts ? hearts[1] * (ir * 2.2 + 3 * s) : 0) - (txt ? 0 : 5 * s);
  }
  function chip(ctx, x, y, h, txt, color, s, icon, hearts) {
    const ir = h * 0.3, w = chipW(ctx, h, txt, s, icon, hearts);
    ctx.fillStyle = 'rgba(12,16,26,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w, y, w, h, 6 * s); else ctx.rect(x - w, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94,231,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();
    let ix = x - w + 8 * s + ir;
    if (icon) { itemIcon(ctx, icon, ix, y + h / 2, ir, color); ix += ir * 2 + 5 * s; }
    if (hearts) for (let i = 0; i < hearts[1]; i++) { itemIcon(ctx, i < hearts[0] ? 'heart' : 'heart0', ix, y + h / 2 + 1, ir, i < hearts[0] ? '#ff4d6d' : 'rgba(255,77,109,0.5)'); ix += ir * 2.2 + 3 * s; }
    if (txt) { ctx.fillStyle = color; ctx.fillText(txt, x - 8 * s, y + h / 2 + 1); }
    return w;
  }

  function drawHud(ctx, W, v) {
    const s = v.ui, mid = v.hudMid, right = v.w - v.hudRight;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillStyle = '#e8f7ff';
    ctx.font = '700 ' + Math.round(30 * s) + 'px ' + NUM;
    const dm = Math.floor(W.dist).toLocaleString() + 'm';
    ctx.fillText(dm, right, mid + 2 * s);
    let x = right - ctx.measureText(dm).width - 12 * s;
    ctx.font = '700 ' + Math.round(15 * s) + 'px ' + NUM;
    const ch = 24 * s;
    let cy = mid - ch / 2;
    // 좁은 화면(세로 폰): 칸들은 거리 아래 둘째 줄에
    const narrow = v.w < 600;
    if (narrow) { x = right; cy = mid + 22 * s; }
    const items = [];
    if (W.maxHearts > 1) items.push(['', '#ff4d6d', null, [W.hearts, W.maxHearts]]);
    items.push([String(W.stars), '#ffe66d', 'star']);
    if (W.shield) items.push(['', '#5ee7ff', 'shield']);
    if (W.eff.magnet > 0) items.push([String(Math.ceil(W.eff.magnet)), ITEM.magnet.color, 'magnet']);
    if (W.eff.boost > 0) items.push([String(Math.ceil(W.eff.boost)), ITEM.boost.color, 'boost']);
    if (v.w >= 700 && v.best > 0) items.push(['BEST ' + Math.max(v.best || 0, Math.floor(W.dist)).toLocaleString() + 'm', '#bcd3e2']);
    for (const [txt, col, icon, hearts] of items) {
      if (x - chipW(ctx, ch, txt, s, icon, hearts) < (narrow ? 8 : v.hudLeft)) continue;   // 버튼 묶음과 겹치면 생략
      x -= chip(ctx, x, cy, ch, txt, col, s, icon, hearts) + 6 * s;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 출발 대기(READY)·출발!·처음 몇 초 조작 안내
  function drawIntro(ctx, W, v, L) {
    const cx = v.w / 2, cy = L.hy + (L.py - L.hy) * 0.3;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.round(Math.min(72, v.w / 9));
    if (W.wait > 0 || (W.runT < 0.6 && W.phase === 'play')) {
      const go = W.wait <= 0, k = go ? 1 - W.runT / 0.6 : 1;
      ctx.globalAlpha = k;
      glow(ctx, go ? 'rgba(255,230,109,0.45)' : 'rgba(94,231,255,0.4)', cx, cy, fs * 1.8, 0.9);
      ctx.font = go ? fs + 'px ' + DISP : 'italic 700 ' + fs + 'px ' + NUM;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(5,7,12,0.8)';
      const t = go ? '출발!' : 'READY';
      ctx.strokeText(t, cx, cy);
      ctx.fillStyle = go ? '#ffe66d' : '#e8f7ff'; ctx.fillText(t, cx, cy);
      ctx.globalAlpha = 1;
    }
    if (W.tut && W.tut.step !== 'done') { drawTutorial(ctx, W, v, L); ctx.textBaseline = 'alphabetic'; return; }
    const hintA = W.laneMoves === 0 && W.phase === 'play' ? Math.max(0, Math.min(1, D.HINT_TIME - W.runT)) : 0;
    if (hintA > 0) {
      ctx.globalAlpha = hintA * 0.9;
      const hs = Math.round(Math.max(16, Math.min(26, v.w / 40)));
      ctx.font = hs + 'px ' + DISP;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.85)';
      const lines = v.touch ? ['옆으로 밀거나 양옆을 눌러서 줄 바꾸기', '위로 밀면 점프!'] : ['← → 방향키로 줄 바꾸기', '↑ 또는 스페이스로 점프!'];
      lines.forEach((t, i) => {
        const yy = cy + fs * 0.85 + i * hs * 1.4;
        ctx.strokeText(t, cx, yy);
        ctx.fillStyle = i ? '#ffe66d' : '#bff8ff'; ctx.fillText(t, cx, yy);
      });
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 처음 한 번 나오는 안내: 큰 글자 + 손가락 방향 화살표 (움직임 줄이기면 화살표가 가만히 있다)
  function drawTutorial(ctx, W, v, L) {
    const T = W.tut, what = T.show;
    if (!what || W.phase !== 'play') return;
    // 하늘 쪽에 띄운다 (다가오는 운석·문을 가리지 않게)
    const fs = Math.round(Math.max(20, Math.min(42, v.w / 24, L.hy / 5.2)));
    const cx = v.w / 2, cy = Math.max(v.hudMid + 24 + fs * 1.95, L.hy - fs * 2.3);
    const t = performance.now() / 1000, bob = v.calm ? 0 : Math.sin(t * 5);
    const lane = what === 'lane';
    const txt = lane ? (v.touch ? '옆으로 밀어서 줄 바꾸기' : '← → 키로 줄 바꾸기') : (v.touch ? '위로 밀어서 점프!' : '↑ 키나 스페이스로 점프!');
    const sub = lane ? '빨간 운석은 피해요' : '레이저 문을 넘어요';
    ctx.font = fs + 'px ' + DISP;
    const tw = Math.max(ctx.measureText(txt).width, fs * 6) + fs * 1.6, th = fs * 3.9;
    const x0 = cx - tw / 2, y0 = cy - th / 2;
    ctx.fillStyle = 'rgba(8,12,24,0.8)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, tw, th, fs * 0.5); else ctx.rect(x0, y0, tw, th); ctx.fill();
    ctx.strokeStyle = lane ? 'rgba(94,231,255,0.8)' : 'rgba(255,230,109,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    // 화살표 그림
    const ay = y0 + fs * 1.1, col = lane ? '#5ee7ff' : '#ffe66d';
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(3, fs * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const chev = (x, y, dx, dy, a) => { ctx.beginPath(); ctx.moveTo(x - dx * a + dy * a, y - dy * a + dx * a); ctx.lineTo(x, y); ctx.lineTo(x - dx * a - dy * a, y - dy * a - dx * a); ctx.stroke(); };
    if (lane) {
      const off = fs * (1.3 + bob * 0.25);
      chev(cx - off, ay, -1, 0, fs * 0.35); chev(cx + off, ay, 1, 0, fs * 0.35);
      ctx.beginPath(); ctx.arc(cx, ay, fs * 0.3, 0, TAU); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    } else {
      const up = fs * (0.15 + bob * 0.15);
      chev(cx, ay - up - fs * 0.2, 0, -1, fs * 0.35); chev(cx, ay - up + fs * 0.25, 0, -1, fs * 0.35);
    }
    ctx.lineCap = 'butt';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, cx, y0 + fs * 2.3);
    ctx.font = Math.round(Math.max(15, fs * 0.55)) + 'px ' + DISP;
    ctx.fillStyle = lane ? '#bff8ff' : '#fff4c2'; ctx.fillText(sub, cx, y0 + fs * 3.25);
  }

  // 구역 도착·기념 아치: 가운데 위쪽에 큰 글자가 잠깐 (움직임 줄이기면 커지는 연출 없이)
  function drawBanner(ctx, v, L) {
    const b = R.banner;
    if (!b) return;
    const k = b.t / b.max, a = Math.min(1, b.t / 0.2, (b.max - b.t) / 0.5);
    const pop = v.calm ? 1 : 1 + Math.max(0, 0.25 - b.t) * 1.2;
    const fs = Math.round(Math.max(26, Math.min(b.small ? 52 : 64, v.w / (b.small ? 16 : 13))) * pop);
    const cx = v.w / 2, cy = L.hy * (b.small ? 0.62 : 0.55) - (v.calm ? 0 : k * 10);
    ctx.globalAlpha = Math.max(0, a);
    glow(ctx, b.color, cx, cy, fs * 3, 0.25);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = (b.small ? 'italic 700 ' + fs + 'px ' + NUM : fs + 'px ' + DISP);
    ctx.lineWidth = Math.max(4, fs * 0.12); ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(b.big, cx, cy);
    ctx.fillStyle = b.color; ctx.fillText(b.big, cx, cy);
    if (b.sub) {
      ctx.font = Math.round(Math.max(16, fs * 0.45)) + 'px ' + DISP;
      ctx.lineWidth = 4; ctx.strokeText(b.sub, cx, cy + fs * 0.75);
      ctx.fillStyle = '#ffffff'; ctx.fillText(b.sub, cx, cy + fs * 0.75);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // view: {dpr, w, h, ui, hudMid, hudLeft, hudRight, hud, touch, calm, best, pad}
  function draw(ctx, W, v, dt) {
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const L = R.L && R.L.w === v.w && R.L.h === v.h ? R.L : (R.L = layout(v.w, v.h));
    const dist = W.phase === 'play' ? W.pdist + (W.dist - W.pdist) * W.alpha : W.dist;
    R.dt = dt || 0;
    takeFx(W, v, L, dist);
    updateFx(dt || 0);
    drawBackground(ctx, W, v, L, dist, dt || 0);
    ctx.save();
    if (R.shake > 0) ctx.translate((Math.random() - 0.5) * R.shake, (Math.random() - 0.5) * R.shake);
    // 먼 것부터 그리고, 우주선보다 뒤(카메라 쪽)로 지나간 것은 우주선 다음에
    const list = W.obs.filter(o => !o.done).sort((a, b) => b.z - a.z);
    let i = 0;
    for (; i < list.length && list[i].z - dist > 0.3; i++) drawObject(ctx, W, L, list[i], dist, v);
    drawShip(ctx, W, L, v);
    for (; i < list.length; i++) drawObject(ctx, W, L, list[i], dist, v);
    if (v.hud !== false) drawDanger(ctx, W, L, dist, v);
    drawFx(ctx);
    ctx.restore();
    if (R.flash > 0 && !v.calm) {
      ctx.fillStyle = 'rgba(' + R.flashColor + ',' + (R.flash * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
    // 부스트: 화면 가장자리가 노랗게
    if (W.eff.boost > 0) { ctx.fillStyle = 'rgba(255,230,109,' + (0.05 + Math.min(1, W.eff.boost) * 0.04).toFixed(3) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    if (v.hud !== false) { drawBanner(ctx, v, L); drawHud(ctx, W, v); drawIntro(ctx, W, v, L); drawSwipe(ctx, W, v); }
  }

  // 멈춘 화면처럼 입자가 남아 있는지 (다 사라지면 그리기를 쉰다)
  const busy = () => R.parts.length > 0 || R.shake > 0 || R.flash > 0;

  RN.Render = { draw, layout, busy, proj, paintSkin };
})(RN);
