'use strict';
// 놀이터 모드 그리기 (위에서 내려다본 공원). 규칙은 park.js, 여기는 그림만.
// 비싼 그림(잔디·길·모래밭·연못·꽃밭·벤치·미끄럼틀·나무 그림자)은 공원이 만들어질 때 한 번만 큰 캔버스에 그려 두고,
// 매 프레임에는 보이는 부분만 잘라 찍은 뒤 움직이는 것(나무 흔들림·분수·별·풍선·친구·차·입자)만 그린다.
(function (RC) {
  const A = RC.Art;
  const { TAU, INK, shade, mix, rgba, rr, lin, glow, soft } = A;
  const PK = RC.Park.PK;
  const isLow = () => !!(RC.Draw && RC.Draw.low);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const FONT = '"Black Han Sans", sans-serif';
  // 움직임 줄이기 설정이면 화면 흔들림·번쩍임을 뺀다
  const calm = () => { try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  // 가운데가 원점인 스프라이트 (배율 k로 선명하게)
  function sprite(w, h, k, fn) {
    const c = canvas(w * k, h * k), g = c.getContext('2d');
    g.scale(k, k); g.translate(w / 2, h / 2); fn(g);
    return { c, w, h };
  }
  function put(ctx, s, x, y, sc) { sc = sc || 1; ctx.drawImage(s.c, x - s.w / 2 * sc, y - s.h / 2 * sc, s.w * sc, s.h * sc); }

  // ─── 바닥 (한 번만) ──────────────────────────────────────
  let GROUND = null;
  function ground(P) {
    const res = isLow() ? 0.6 : 0.85;
    const key = P.seed + ':' + res;
    if (GROUND && GROUND.key === key && GROUND.park === P.park) return GROUND;
    const L = P.park, W = L.W, H = L.H;
    const c = canvas(W * res, H * res), g = c.getContext('2d');
    g.scale(res, res);
    const rand = RC.rng(P.seed * 7 + 3);

    // 잔디: 짙은 초록 바탕 + 깎은 줄무늬 + 얼룩 + 풀잎
    g.fillStyle = lin(g, 0, 0, W, H, [[0, '#2c7437'], [0.5, '#35843b'], [1, '#276a35']]);
    g.fillRect(0, 0, W, H);
    g.save(); g.rotate(-0.35);
    for (let i = -20; i < 40; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)'; g.fillRect(i * 110, -800, 110, H + 2400); }
    g.restore();
    const blobs = ['#4d9f45', '#1f5e2e', '#5daa4c', '#2b7a36', '#6fb552'];
    for (let i = 0; i < 240; i++) {
      const x = rand() * W, y = rand() * H, r = 40 + rand() * 120, col = blobs[i % blobs.length];
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(col, 0.22 + rand() * 0.12)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineCap = 'round';
    for (let i = 0; i < (isLow() ? 2500 : 6000); i++) {
      const x = rand() * W, y = rand() * H, h = 3 + rand() * 5;
      g.strokeStyle = rand() < 0.5 ? 'rgba(120,190,90,0.35)' : 'rgba(18,60,30,0.35)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x - 3, y - h); g.moveTo(x + 1, y); g.lineTo(x + 2, y - h * 0.9); g.stroke();
    }
    // 풀밭에 흩어진 작은 들꽃
    for (let i = 0; i < 260; i++) {
      const x = rand() * W, y = rand() * H;
      g.fillStyle = ['#ffffff', '#ffe066', '#ffb3c7', '#c7b3ff'][i % 4]; g.globalAlpha = 0.8;
      g.beginPath(); g.arc(x, y, 2 + rand() * 1.4, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // 나무·덤불 그림자 (해는 왼쪽 위)
    for (const t of L.trees) { g.fillStyle = 'rgba(8,30,14,0.32)'; g.beginPath(); g.ellipse(t.x + 20, t.y + 26, 58 * t.s, 50 * t.s, 0.3, 0, TAU); g.fill(); }
    for (const b of L.bushes) { g.fillStyle = 'rgba(8,30,14,0.28)'; g.beginPath(); g.ellipse(b.x + 10, b.y + 13, b.r * 1.05, b.r * 0.85, 0.3, 0, TAU); g.fill(); }

    // 울타리 산울타리 (공원 가장자리)
    g.strokeStyle = '#17482a'; g.lineWidth = 34; g.strokeRect(0, 0, W, H);
    for (let i = 0; i < (W + H) * 2 / 26; i++) {
      const d = i * 26; let x, y;
      if (d < W) { x = d; y = 8; } else if (d < W + H) { x = W - 8; y = d - W; } else if (d < W * 2 + H) { x = W - (d - W - H); y = H - 8; } else { x = 8; y = H - (d - W * 2 - H); }
      const gr = g.createRadialGradient(x - 4, y - 5, 2, x, y, 16);
      gr.addColorStop(0, '#5fae52'); gr.addColorStop(1, '#1d5a2e'); g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fill();
    }

    // 산책로: 흙 가장자리 → 경계석 → 포장 → 가운데 밝게 → 이음매·자갈
    const pw = L.pathW;
    const strokeAll = (w, col, a) => {
      g.lineWidth = w; g.strokeStyle = col; g.globalAlpha = a == null ? 1 : a; g.lineJoin = 'round'; g.lineCap = 'round';
      for (const p of L.paths) { g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
      g.globalAlpha = 1;
    };
    strokeAll(pw + 18, 'rgba(40,30,18,0.35)');
    strokeAll(pw + 8, '#8d8274');
    strokeAll(pw, '#cdb993');
    strokeAll(pw * 0.62, '#dccaa6', 0.7);
    strokeAll(pw * 0.2, '#e8dabb', 0.35);
    g.strokeStyle = 'rgba(70,52,30,0.16)'; g.lineWidth = 1.5;
    for (const p of L.paths) for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1], [bx, by] = p[i], len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
      for (let s = 0; s < len; s += 34) { const x = ax + ux * s, y = ay + uy * s; g.beginPath(); g.moveTo(x - uy * pw / 2, y + ux * pw / 2); g.lineTo(x + uy * pw / 2, y - ux * pw / 2); g.stroke(); }
      for (let s = 0; s < len; s += 9) {
        const x = ax + ux * s + (rand() - 0.5) * 6, y = ay + uy * s, o = (rand() - 0.5) * pw * 0.9;
        g.fillStyle = rand() < 0.5 ? 'rgba(90,70,45,0.25)' : 'rgba(255,250,235,0.35)';
        g.fillRect(x - uy * o, y + ux * o, 2, 2);
      }
    }

    // 분수 광장: 동심원 돌바닥
    const pz = L.plaza;
    g.fillStyle = '#8d8274'; g.beginPath(); g.arc(pz.x, pz.y, pz.r + 6, 0, TAU); g.fill();
    let gr = g.createRadialGradient(pz.x - 60, pz.y - 70, 20, pz.x, pz.y, pz.r);
    gr.addColorStop(0, '#e9dcc0'); gr.addColorStop(1, '#bfa983'); g.fillStyle = gr;
    g.beginPath(); g.arc(pz.x, pz.y, pz.r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(70,52,30,0.2)'; g.lineWidth = 1.5;
    for (let r = 120; r < pz.r; r += 26) { g.beginPath(); g.arc(pz.x, pz.y, r, 0, TAU); g.stroke(); }
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; g.beginPath(); g.moveTo(pz.x + Math.cos(a) * 120, pz.y + Math.sin(a) * 120); g.lineTo(pz.x + Math.cos(a) * pz.r, pz.y + Math.sin(a) * pz.r); g.stroke(); }
    // 분수대: 돌 테두리 + 물
    const fo = L.fountain;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(fo.x + 8, fo.y + 10, fo.r + 4, 0, TAU); g.fill();
    gr = g.createRadialGradient(fo.x - 30, fo.y - 40, 10, fo.x, fo.y, fo.r);
    gr.addColorStop(0, '#f4f1ea'); gr.addColorStop(0.7, '#b9b3a8'); gr.addColorStop(1, '#6f6a63'); g.fillStyle = gr;
    g.beginPath(); g.arc(fo.x, fo.y, fo.r, 0, TAU); g.fill();
    gr = g.createRadialGradient(fo.x, fo.y, 10, fo.x, fo.y, fo.r - 14);
    gr.addColorStop(0, '#39b6e6'); gr.addColorStop(0.7, '#1579b4'); gr.addColorStop(1, '#0b4674'); g.fillStyle = gr;
    g.beginPath(); g.arc(fo.x, fo.y, fo.r - 14, 0, TAU); g.fill();
    g.fillStyle = lin(g, fo.x - 24, fo.y - 24, fo.x + 24, fo.y + 24, [[0, '#ffffff'], [1, '#8f8a82']]);
    g.beginPath(); g.arc(fo.x, fo.y, 24, 0, TAU); g.fill();
    g.fillStyle = '#2aa3d9'; g.beginPath(); g.arc(fo.x, fo.y, 13, 0, TAU); g.fill();

    // 큰 꽃밭 (둥근 생울타리 + 꽃)
    const gd = L.garden;
    g.fillStyle = '#17482a'; g.beginPath(); g.arc(gd.x, gd.y, gd.r, 0, TAU); g.fill();
    for (let k = 0; k < 30; k++) {
      const a = k / 30 * TAU, x = gd.x + Math.cos(a) * (gd.r - 8), y = gd.y + Math.sin(a) * (gd.r - 8);
      gr = g.createRadialGradient(x - 3, y - 4, 1, x, y, 11); gr.addColorStop(0, '#6cbf5a'); gr.addColorStop(1, '#1f5f30'); g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, 11, 0, TAU); g.fill();
    }
    g.fillStyle = lin(g, 0, gd.y - 70, 0, gd.y + 70, [[0, '#6a4a2e'], [1, '#3e2a1a']]); g.beginPath(); g.arc(gd.x, gd.y, gd.r - 20, 0, TAU); g.fill();
    flowers(g, gd.x, gd.y, gd.r - 24, rand, 90);
    // 가운데 작은 돌 조각 (로봇 모양 받침)
    g.fillStyle = lin(g, 0, gd.y - 18, 0, gd.y + 18, [[0, '#e8e4dc'], [1, '#8a857c']]); rr(g, gd.x - 16, gd.y - 16, 32, 32, 6); g.fill();
    g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(gd.x, gd.y, 7, 0, TAU); g.fill();

    // 작은 꽃밭
    for (const b of L.beds) {
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(b.x + 5, b.y + 6, b.r, b.r * 0.8, 0, 0, TAU); g.fill();
      g.fillStyle = '#7a7266'; g.beginPath(); g.ellipse(b.x, b.y, b.r + 4, b.r * 0.8 + 4, 0, 0, TAU); g.fill();
      g.fillStyle = lin(g, 0, b.y - b.r, 0, b.y + b.r, [[0, '#6a4a2e'], [1, '#402b1a']]); g.beginPath(); g.ellipse(b.x, b.y, b.r, b.r * 0.8, 0, 0, TAU); g.fill();
      flowers(g, b.x, b.y, b.r * 0.85, rand, Math.round(b.r * 0.9), 0.8);
    }

    // 모래밭: 나무 틀 + 모래 결 + 모래성·양동이·삽
    const sb = L.sandbox, sx = sb.x - sb.w / 2, sy = sb.y - sb.h / 2;
    g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, sx + 6, sy + 9, sb.w, sb.h, 18); g.fill();
    g.fillStyle = lin(g, 0, sy, 0, sy + sb.h, [[0, '#c98a4a'], [1, '#7a4a22']]); rr(g, sx - 10, sy - 10, sb.w + 20, sb.h + 20, 20); g.fill();
    g.strokeStyle = 'rgba(60,30,10,0.4)'; g.lineWidth = 1.5; rr(g, sx - 4, sy - 4, sb.w + 8, sb.h + 8, 16); g.stroke();
    g.fillStyle = lin(g, sx, sy, sx + sb.w, sy + sb.h, [[0, '#f2dca4'], [1, '#d2ab68']]); rr(g, sx, sy, sb.w, sb.h, 12); g.fill();
    g.save(); rr(g, sx, sy, sb.w, sb.h, 12); g.clip();
    g.strokeStyle = 'rgba(150,105,50,0.28)'; g.lineWidth = 2;
    for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(sx + 40 + (k % 3) * 120, sy + 30 + Math.floor(k / 3) * 70, 18 + (k % 2) * 10, 0.4, 2.6); g.stroke(); }
    for (let i = 0; i < 500; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(255,245,210,0.5)' : 'rgba(150,105,50,0.25)'; g.fillRect(sx + rand() * sb.w, sy + rand() * sb.h, 1.6, 1.6); }
    g.restore();
    // 모래성
    const cx0 = sx + 60, cy0 = sy + sb.h - 55;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(cx0 + 4, cy0 + 5, 46, 36);
    g.fillStyle = lin(g, 0, cy0, 0, cy0 + 36, [[0, '#f7e4b4'], [1, '#c9a060']]); g.fillRect(cx0, cy0, 46, 36);
    for (const [ox, oy] of [[0, 0], [34, 0], [0, 24], [34, 24]]) { g.fillStyle = '#e8cf92'; g.fillRect(cx0 + ox - 2, cy0 + oy - 2, 16, 16); g.fillStyle = 'rgba(120,80,30,0.3)'; g.fillRect(cx0 + ox + 4, cy0 + oy + 4, 4, 4); }
    // 양동이·삽
    const bx0 = sx + sb.w - 60, by0 = sy + 44;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(bx0 + 4, by0 + 5, 17, 0, TAU); g.fill();
    gr = g.createRadialGradient(bx0 - 5, by0 - 6, 2, bx0, by0, 17); gr.addColorStop(0, '#ff8a8a'); gr.addColorStop(1, '#c41e3a'); g.fillStyle = gr;
    g.beginPath(); g.arc(bx0, by0, 16, 0, TAU); g.fill();
    g.fillStyle = '#7a1020'; g.beginPath(); g.arc(bx0, by0, 10, 0, TAU); g.fill();
    g.save(); g.translate(bx0 - 40, by0 + 20); g.rotate(-0.6);
    g.fillStyle = '#2f6bff'; g.fillRect(-22, -3, 30, 6); g.fillStyle = '#9fb6ff'; rr(g, 6, -9, 18, 18, 5); g.fill();
    g.restore();

    // 연못: 물가 돌 · 물 · 연잎 · 갈대
    const pd = L.pond;
    g.fillStyle = '#4a4a3a'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.rx + 18, pd.ry + 16, 0, 0, TAU); g.fill();
    for (let k = 0; k < 54; k++) {
      const a = k / 54 * TAU, x = pd.x + Math.cos(a) * (pd.rx + 10), y = pd.y + Math.sin(a) * (pd.ry + 9), r = 8 + rand() * 6;
      gr = g.createRadialGradient(x - 3, y - 3, 1, x, y, r); gr.addColorStop(0, '#d9d6cc'); gr.addColorStop(1, '#6d6a62'); g.fillStyle = gr;
      g.beginPath(); g.ellipse(x, y, r, r * 0.8, a, 0, TAU); g.fill();
    }
    gr = g.createRadialGradient(pd.x - pd.rx * 0.3, pd.y - pd.ry * 0.4, 10, pd.x, pd.y, pd.rx);
    gr.addColorStop(0, '#2fa9c4'); gr.addColorStop(0.6, '#177a9e'); gr.addColorStop(1, '#0b4262'); g.fillStyle = gr;
    g.beginPath(); g.ellipse(pd.x, pd.y, pd.rx, pd.ry, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.beginPath(); g.ellipse(pd.x, pd.y, pd.rx - 6, pd.ry - 5, 0, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
    for (let k = 0; k < 7; k++) {
      const a = rand() * TAU, q = 0.45 + rand() * 0.4, x = pd.x + Math.cos(a) * pd.rx * q, y = pd.y + Math.sin(a) * pd.ry * q, r = 12 + rand() * 8;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.arc(x + 3, y + 4, r, 0, TAU); g.fill();
      g.fillStyle = lin(g, x - r, y - r, x + r, y + r, [[0, '#6cc35a'], [1, '#2a7a36']]);
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + 0.35, a + TAU - 0.35); g.closePath(); g.fill();
      if (k % 3 === 0) { g.fillStyle = '#ff7eb0'; g.beginPath(); g.arc(x + 3, y - 2, 5, 0, TAU); g.fill(); g.fillStyle = '#ffe066'; g.beginPath(); g.arc(x + 3, y - 2, 2, 0, TAU); g.fill(); }
    }
    g.strokeStyle = '#3d6b2a'; g.lineWidth = 2.5; g.lineCap = 'round';
    for (let k = 0; k < 16; k++) {
      const a = Math.PI * 0.1 + rand() * 0.8 + (k % 2 ? Math.PI : 0), x = pd.x + Math.cos(a) * (pd.rx + 6), y = pd.y + Math.sin(a) * (pd.ry + 6);
      for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (j - 1) * 6, y - 16 - j * 3); g.stroke(); }
      g.fillStyle = '#6a4a2a'; g.fillRect(x - 2, y - 22, 4, 9);
    }

    // 미끄럼틀: 고무 바닥 + 사다리 + 지붕 + 미끄럼 판
    const sl = L.slide;
    g.fillStyle = 'rgba(0,0,0,0.25)'; rr(g, sl.x - 150, sl.y - 80, 300, 170, 30); g.fill();
    g.fillStyle = lin(g, 0, sl.y - 84, 0, sl.y + 84, [[0, '#c65a3c'], [1, '#8f3620']]); rr(g, sl.x - 154, sl.y - 86, 300, 168, 28); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1.5;
    for (let x = sl.x - 150; x < sl.x + 150; x += 30) { g.beginPath(); g.moveTo(x, sl.y - 84); g.lineTo(x, sl.y + 82); g.stroke(); }
    for (let y = sl.y - 84; y < sl.y + 84; y += 30) { g.beginPath(); g.moveTo(sl.x - 152, y); g.lineTo(sl.x + 146, y); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.32)'; rr(g, sl.x - 96, sl.y - 18, 210, 58, 16); g.fill();
    // 사다리
    g.fillStyle = '#3a4150'; g.fillRect(sl.x - 110, sl.y - 26, 44, 6); g.fillRect(sl.x - 110, sl.y + 20, 44, 6);
    g.fillStyle = A.chrome(g, sl.y - 26, sl.y + 26);
    for (let k = 0; k < 5; k++) g.fillRect(sl.x - 108 + k * 9, sl.y - 22, 4, 44);
    // 미끄럼 판 (광택)
    g.fillStyle = lin(g, 0, sl.y - 24, 0, sl.y + 24, [[0, '#ffe066'], [0.45, '#ffb020'], [1, '#d9730f']]); rr(g, sl.x - 20, sl.y - 24, 130, 48, 18); g.fill();
    g.fillStyle = lin(g, 0, sl.y - 14, 0, sl.y + 14, [[0, '#fff3c4'], [1, '#ffcf4a']]); rr(g, sl.x - 14, sl.y - 13, 118, 26, 12); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(sl.x - 4, sl.y - 9, 90, 3);
    // 꼭대기 지붕
    g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, sl.x - 68, sl.y - 36, 76, 82, 10); g.fill();
    g.fillStyle = lin(g, sl.x - 72, sl.y - 40, sl.x, sl.y + 36, [[0, '#ff6b6b'], [0.5, '#e02a3a'], [1, '#8f1020']]); rr(g, sl.x - 72, sl.y - 40, 76, 76, 12); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(sl.x - 72, sl.y - 40); g.lineTo(sl.x + 4, sl.y + 36); g.moveTo(sl.x + 4, sl.y - 40); g.lineTo(sl.x - 72, sl.y + 36); g.stroke();
    g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(sl.x - 34, sl.y - 2, 7, 0, TAU); g.fill();

    // 벤치
    for (const b of L.benches) {
      g.save(); g.translate(b.x, b.y); g.rotate(b.a);
      g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, -30, -11, 66, 30, 6); g.fill();
      g.fillStyle = '#2a303c'; g.fillRect(-34, -14, 6, 30); g.fillRect(28, -14, 6, 30);
      for (let k = 0; k < 4; k++) { g.fillStyle = lin(g, 0, -13 + k * 7, 0, -8 + k * 7, [[0, '#d29a5c'], [1, '#8a5a2a']]); rr(g, -30, -13 + k * 7, 60, 5.5, 2); g.fill(); }
      g.restore();
    }
    // 부스터 발판 바탕 (빛은 매 프레임)
    for (const p of L.pads) {
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, -44, -34, 92, 72, 14); g.fill();
      g.fillStyle = lin(g, 0, -34, 0, 34, [[0, '#2a3346'], [1, '#0d1322']]); rr(g, -46, -36, 92, 72, 14); g.fill();
      g.strokeStyle = '#5d6679'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(57,216,255,0.25)'; g.lineWidth = 6; g.lineJoin = 'round';
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-26 + k * 20, -20); g.lineTo(-10 + k * 20, 0); g.lineTo(-26 + k * 20, 20); g.stroke(); }
      g.restore();
    }
    // 덤불 뒤 숨은 친구 자리 둘레 풀 (조금 더 수북하게)
    for (const f of L.friends) if (f.where === 'bush') { g.fillStyle = 'rgba(20,70,30,0.3)'; g.beginPath(); g.arc(f.hx, f.hy, 70, 0, TAU); g.fill(); }

    GROUND = { key, park: L, c, res };
    return GROUND;
  }

  function flowers(g, x, y, r, rand, n, sq) {
    const cols = ['#ff3b5c', '#ffd23a', '#ffffff', '#a855f7', '#ff8a1a'];
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, q = Math.sqrt(rand()) * r, fx = x + Math.cos(a) * q, fy = y + Math.sin(a) * q * (sq || 1);
      g.fillStyle = '#2f7a36'; g.beginPath(); g.arc(fx + 2, fy + 2, 4.5, 0, TAU); g.fill();
      const col = cols[(i + Math.floor(q)) % cols.length];
      for (let p = 0; p < 5; p++) { const pa = p / 5 * TAU; g.fillStyle = col; g.beginPath(); g.arc(fx + Math.cos(pa) * 3, fy + Math.sin(pa) * 3, 2.4, 0, TAU); g.fill(); }
      g.fillStyle = col === '#ffd23a' ? '#ff8a1a' : '#ffe066'; g.beginPath(); g.arc(fx, fy, 1.6, 0, TAU); g.fill();
    }
  }

  // ─── 나무 · 덤불 스프라이트 ───────────────────────────────
  let TREES = null, BUSHES = null;
  function trees() {
    if (TREES) return TREES;
    const kinds = [
      ['#1a5229', '#3d9443', '#86cf62'],
      ['#123f22', '#2f7d3a', '#6cbf5a'],
      ['#2a5a1e', '#5f9e36', '#b7df6a'],
    ];
    TREES = kinds.map((cols, v) => sprite(140, 140, 2, g => {
      const rand = RC.rng(11 + v * 5);
      const blobs = [];
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + rand() * 0.4, q = 22 + rand() * 12; blobs.push([Math.cos(a) * q, Math.sin(a) * q, 26 + rand() * 8]); }
      blobs.push([0, 0, 34]);
      // 가장자리 짙게 → 윗잎 밝게 (왼쪽 위에서 빛)
      for (const [x, y, r] of blobs) { g.fillStyle = cols[0]; g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.fill(); }
      for (const [x, y, r] of blobs) {
        const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 2, x, y, r);
        gr.addColorStop(0, cols[2]); gr.addColorStop(0.55, cols[1]); gr.addColorStop(1, cols[0]);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.strokeStyle = rgba('#0b2a14', 0.35); g.lineWidth = 1.5;
      for (let i = 0; i < 40; i++) { const a = rand() * TAU, q = rand() * 44, x = Math.cos(a) * q, y = Math.sin(a) * q; g.beginPath(); g.arc(x, y, 3 + rand() * 3, 0.2, 2.2); g.stroke(); }
      if (v === 2) for (let i = 0; i < 16; i++) { const a = rand() * TAU, q = rand() * 40; g.fillStyle = i % 2 ? '#ff5a4a' : '#ffb020'; g.beginPath(); g.arc(Math.cos(a) * q, Math.sin(a) * q, 3.4, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(Math.cos(a) * q - 1.5, Math.sin(a) * q - 1.5, 1.4, 1.4); }
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-16, -20, 18, 10, -0.6, 0, TAU); g.fill();
    }));
    return TREES;
  }
  function bushes() {
    if (BUSHES) return BUSHES;
    BUSHES = [0, 1].map(v => sprite(100, 100, 2, g => {
      const rand = RC.rng(31 + v);
      const cols = v ? ['#174a26', '#2e8a3e', '#7fd06a'] : ['#1d4f1f', '#3f8f2f', '#9ad85a'];
      const blobs = [];
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + rand(), q = 14 + rand() * 8; blobs.push([Math.cos(a) * q, Math.sin(a) * q, 16 + rand() * 6]); }
      blobs.push([0, 0, 22]);
      for (const [x, y, r] of blobs) { g.fillStyle = cols[0]; g.beginPath(); g.arc(x, y, r + 2, 0, TAU); g.fill(); }
      for (const [x, y, r] of blobs) {
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
        gr.addColorStop(0, cols[2]); gr.addColorStop(0.6, cols[1]); gr.addColorStop(1, cols[0]); g.fillStyle = gr;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      if (v) for (let i = 0; i < 9; i++) { const a = rand() * TAU, q = rand() * 26; g.fillStyle = '#fff4f8'; g.beginPath(); g.arc(Math.cos(a) * q, Math.sin(a) * q, 2.4, 0, TAU); g.fill(); }
    }));
    return BUSHES;
  }

  // ─── 차 (위에서 본 모습) ─────────────────────────────────
  // 차 앞은 +x. 몸통 길이 약 84 · 폭 46. 광택은 왼쪽 위(북쪽)에서.
  const carCache = {};
  function carSprite(P) {
    const cfg = P.cfg, body = P.body.id, wheel = P.wheel.id, gear = P.gear.id;
    const color = cfg.color || P.body.color || '#ff3b3b';
    const key = [body, wheel, gear, color].join('|');
    if (carCache[key]) return carCache[key];
    const s = sprite(200, 130, 2.5, g => {
      const hw = body === 'fire' ? 24 : 23;
      const x0 = body === 'fire' ? -46 : -42, x1 = body === 'fire' ? 46 : 42;
      // 날개 (몸통 아래)
      if (gear === 'wing') {
        for (const sy of [-1, 1]) {
          g.beginPath(); g.moveTo(4, sy * (hw - 4)); g.lineTo(-18, sy * (hw + 22)); g.lineTo(-30, sy * (hw + 22)); g.lineTo(-22, sy * (hw - 4)); g.closePath();
          g.fillStyle = lin(g, 0, sy * hw, 0, sy * (hw + 22), [[0, '#eef2f7'], [1, '#8fa0b8']]); g.fill();
          g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
          g.fillStyle = color; g.fillRect(-30, sy > 0 ? hw + 17 : -hw - 22, 12, 5);
        }
      }
      // 바퀴
      const mon = wheel === 'monster', spr = wheel === 'spring';
      const wl = mon ? 26 : 19, ww = mon ? 14 : 9, wy = hw + (mon ? 5 : spr ? 5 : 1);
      for (const wx of [x0 + 20, x1 - 20]) for (const sy of [-1, 1]) {
        if (spr) {
          g.strokeStyle = '#c9d2df'; g.lineWidth = 2.2; g.beginPath();
          for (let k = 0; k <= 6; k++) { const yy = sy * (hw - 6 + k * 1.8); g.lineTo(wx + (k % 2 ? 5 : -5), yy); }
          g.stroke();
        }
        const cy = sy * wy;
        g.fillStyle = '#12151d'; rr(g, wx - wl / 2, cy - ww / 2, wl, ww, 4); g.fill();
        if (mon) { g.fillStyle = '#3a4150'; for (let k = 0; k < 6; k++) g.fillRect(wx - wl / 2 + 2 + k * 4, cy - ww / 2, 2, ww); }
        g.fillStyle = A.chrome(g, cy - ww / 2, cy + ww / 2); g.fillRect(wx - 3, cy - ww / 2 + 2, 6, ww - 4);
      }
      // 제트 노즐
      if (gear === 'jet') for (const sy of [-1, 1]) {
        g.fillStyle = A.gunmetal(g, sy * 10 - 6, sy * 10 + 6); rr(g, x0 - 12, sy * 11 - 6, 18, 12, 4); g.fill();
        g.fillStyle = '#0d1322'; g.beginPath(); g.ellipse(x0 - 12, sy * 11, 2.5, 4.5, 0, 0, TAU); g.fill();
      }
      // 드릴 코
      if (gear === 'drill') {
        g.beginPath(); g.moveTo(x1 - 2, -13); g.lineTo(x1 + 26, 0); g.lineTo(x1 - 2, 13); g.closePath();
        g.fillStyle = A.chrome(g, -13, 13); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
        g.strokeStyle = 'rgba(40,50,70,0.6)'; g.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) { const x = x1 + 2 + k * 6, h = 13 * (1 - (k * 6 + 4) / 28); g.beginPath(); g.moveTo(x, -h); g.lineTo(x + 5, h); g.stroke(); }
      }
      // 몸통 모양
      const shape = () => {
        g.beginPath();
        if (body === 'racer') {
          g.moveTo(x0 + 4, -hw); g.lineTo(x1 - 16, -hw + 2); g.quadraticCurveTo(x1 + 2, -hw + 6, x1 + 2, 0); g.quadraticCurveTo(x1 + 2, hw - 6, x1 - 16, hw - 2);
          g.lineTo(x0 + 4, hw); g.quadraticCurveTo(x0 - 2, hw, x0 - 2, hw - 6); g.lineTo(x0 - 2, -hw + 6); g.quadraticCurveTo(x0 - 2, -hw, x0 + 4, -hw); g.closePath();
        } else rr(g, x0, -hw, x1 - x0, hw * 2, body === 'police' ? 13 : 8);
      };
      shape();
      g.fillStyle = lin(g, 0, -hw, 0, hw, [[0, shade(color, 1.4)], [0.3, shade(color, 1.08)], [0.65, color], [1, shade(color, 0.5)]]); g.fill();
      g.strokeStyle = shade(color, 0.35); g.lineWidth = 1.6; g.stroke();
      g.save(); shape(); g.clip();
      if (body === 'racer') {
        g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(x0 - 4, -7, x1 - x0 + 10, 4); g.fillRect(x0 - 4, 3, x1 - x0 + 10, 4);
      } else if (body === 'police') {
        g.fillStyle = lin(g, 0, -hw, 0, hw, [[0, '#ffffff'], [0.6, '#e3e8f0'], [1, '#9aa4b4']]); g.fillRect(-16, -hw - 2, 32, hw * 2 + 4);
      } else if (body === 'fire') {
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x0, -hw + 3, x1 - x0, 3); g.fillRect(x0, hw - 6, x1 - x0, 3);
        g.fillStyle = '#ffd23a'; for (let k = 0; k < 9; k++) g.fillRect(x0 + 4 + k * 10, hw - 6, 5, 3);
      }
      g.restore();
      // 유리 (앞유리·지붕·뒷유리)
      const glass = (x, y, w, h, r) => { rr(g, x, y, w, h, r); g.fillStyle = lin(g, x, y, x + w, y + h, [[0, '#8fd0ff'], [0.45, '#1c3558'], [1, '#0b1426']]); g.fill(); };
      if (body === 'racer') {
        g.beginPath(); g.moveTo(-10, -14); g.quadraticCurveTo(20, -15, 24, 0); g.quadraticCurveTo(20, 15, -10, 14); g.quadraticCurveTo(-16, 0, -10, -14); g.closePath();
        g.fillStyle = lin(g, -10, -14, 24, 14, [[0, '#8fd0ff'], [0.45, '#1c3558'], [1, '#0b1426']]); g.fill();
        // 뒷날개(스포일러)
        g.fillStyle = A.gunmetal(g, -hw - 4, hw + 4); rr(g, x0 - 8, -hw - 3, 9, hw * 2 + 6, 3); g.fill();
        g.fillStyle = color; g.fillRect(x0 - 8, -hw - 3, 9, 4); g.fillRect(x0 - 8, hw - 1, 9, 4);
      } else if (body === 'police') {
        glass(10, -hw + 5, 12, hw * 2 - 10, 4);
        g.fillStyle = shade('#ffffff', 0.93); rr(g, -12, -hw + 5, 22, hw * 2 - 10, 5); g.fill();
        glass(-22, -hw + 6, 8, hw * 2 - 12, 3);
        // 경광등 막대 (빨강·파랑은 매 프레임 깜빡임)
        g.fillStyle = '#1b1f2c'; rr(g, -6, -hw + 3, 10, hw * 2 - 6, 3); g.fill();
        g.fillStyle = '#b0182a'; rr(g, -5, -hw + 4, 8, hw - 5, 2); g.fill();
        g.fillStyle = '#1b3fb0'; rr(g, -5, 1, 8, hw - 5, 2); g.fill();
        // 보닛 별 배지
        g.fillStyle = '#ffd23a'; g.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 6; g.lineTo(32 + Math.cos(a) * r, Math.sin(a) * r); }
        g.closePath(); g.fill();
      } else if (body === 'fire') {
        glass(26, -hw + 4, 10, hw * 2 - 8, 3);
        // 사다리
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 6, -11, 58, 24);
        g.fillStyle = A.chrome(g, -12, 12); g.fillRect(x0 + 4, -12, 60, 4); g.fillRect(x0 + 4, 8, 60, 4);
        for (let k = 0; k < 9; k++) g.fillRect(x0 + 6 + k * 7, -9, 2.5, 18);
        // 경광등 받침
        g.fillStyle = '#1b1f2c'; rr(g, 22, -hw + 2, 6, hw * 2 - 4, 2); g.fill();
      }
      // 전조등 · 후미등
      for (const sy of [-1, 1]) {
        g.fillStyle = '#fff6c8'; rr(g, x1 - 6, sy * (hw - 8) - 3, 5, 6, 2); g.fill();
        g.fillStyle = '#ff2a3a'; rr(g, x0 + 1, sy * (hw - 7) - 3, 4, 6, 1.5); g.fill();
      }
      // 광택 줄
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0 + 10, -hw + 3); g.lineTo(x1 - 14, -hw + 4); g.stroke();
    });
    carCache[key] = s;
    return s;
  }

  // 친구 수레 (기차 칸)
  let WAGON = {};
  function wagon(color) {
    if (WAGON[color]) return WAGON[color];
    WAGON[color] = sprite(60, 50, 2.5, g => {
      for (const wx of [-10, 10]) for (const sy of [-1, 1]) { g.fillStyle = '#12151d'; rr(g, wx - 6, sy * 15 - 3, 12, 6, 2); g.fill(); }
      rr(g, -17, -14, 34, 28, 7); g.fillStyle = A.gunmetal(g, -14, 14); g.fill();
      rr(g, -17, -14, 34, 28, 7); g.lineWidth = 3; g.strokeStyle = color; g.stroke();
      rr(g, -12, -9, 24, 18, 4); g.fillStyle = '#1b2233'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-12, -12); g.lineTo(12, -12); g.stroke();
    });
    return WAGON[color];
  }

  // ─── 그리기 상태 (입자·글자 튀기 등 꾸밈, 규칙과 따로) ─────────
  function stateOf(P) {
    if (!P._pk) {
      P._pk = {
        last: 0, pf: [], conf: [], pops: [], ui: [], banner: null, shake: 0, flash: 0, em: 0,
        seen: { stars: 0, saved: 0, popped: 0, boosts: 0, splashes: 0, missions: 0, gate: false, done: false, peek: 0 },
      };
    }
    return P._pk;
  }
  function puff(K, x, y, vx, vy, life, size, kind, color) {
    if (K.pf.length >= 90) K.pf.shift();
    K.pf.push({ x, y, vx, vy, life, max: life, size, kind, color });
  }
  function pop(K, x, y, txt, c) { K.pops.push({ x, y, txt, c, t: 0 }); if (K.pops.length > 6) K.pops.shift(); }

  // 규칙 쪽 숫자가 바뀐 것을 보고 연출을 붙인다 (부모가 따로 알려 주지 않아도 된다)
  function watch(P, K, cx, cy) {
    const S = K.seen, c = P.car, L = P.park;
    if (P.stars > S.stars) {
      const n = P.stars - S.stars; S.stars = P.stars;
      const s = P.lastStar || c;
      for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, v = 80 + Math.random() * 140; puff(K, s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.4, 2.5, 'spark', '#ffd23a'); }
      for (let i = 0; i < Math.min(n, 3); i++) { K.ui.push({ x: s.x - cx, y: s.y - cy, t: -i * 0.06 }); if (K.ui.length > 12) K.ui.shift(); }
    }
    if (P.saved > S.saved) {
      S.saved = P.saved; pop(K, c.x, c.y - 70, '구했다!', '#3aff9a'); K.flash = 0.18; K.shake = Math.max(K.shake, 4);
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; puff(K, c.x, c.y, Math.cos(a) * 220, Math.sin(a) * 220, 0.5, 3, 'spark', i % 2 ? '#3aff9a' : '#ffffff'); }
    }
    if (P.popped > S.popped) {
      S.popped = P.popped;
      for (const b of L.balloons) if (b.popped && !b._fx) {
        b._fx = true; pop(K, b.x, b.y - 90, '펑!', '#ffffff'); K.shake = Math.max(K.shake, 3);
        for (let i = 0; i < 14; i++) { const a = Math.random() * TAU, v = 120 + Math.random() * 200; puff(K, b.x, b.y - 60, Math.cos(a) * v, Math.sin(a) * v, 0.7, 5, 'bit', i % 3 ? b.color : '#ffffff'); }
      }
    }
    if (P.boosts > S.boosts) { S.boosts = P.boosts; pop(K, c.x, c.y - 60, '슝!', '#39d8ff'); K.shake = Math.max(K.shake, 3); }
    if (P.splashes > S.splashes) {
      S.splashes = P.splashes; pop(K, c.x, c.y - 60, '첨벙!', '#8fe8ff');
      for (let i = 0; i < 12; i++) { const a = Math.random() * TAU, v = 90 + Math.random() * 160; puff(K, c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 5, 'drop', '#bfe8ff'); }
    }
    const md = P.missions.filter(m => m.done).length;
    if (md > S.missions) { S.missions = md; K.banner = { big: '해냈다!', small: P.lastMission || '', c: '#ffd23a', t: 0, life: 1.8 }; }
    if (P.gate && !S.gate) { S.gate = true; K.banner = { big: '도착 문이 나왔어!', small: '반짝이는 문으로 가 봐', c: '#3aff9a', t: 0, life: 2.2 }; K.shake = Math.max(K.shake, 3); }
    if (P.done && !S.done) {
      S.done = true; K.banner = { big: '도착!', small: '잘했어!', c: '#ffd23a', t: 0, life: 3 }; K.flash = 0.35; K.shake = Math.max(K.shake, 6);
      K.confT = 2.2;
    }
  }

  let hud = { x: 60, y: 40 };
  function setHud(x, y) { hud = { x, y }; }

  // ─── 한 프레임 ────────────────────────────────────────────
  function draw(ctx, P, vw) {
    P.vw = vw;
    const L = P.park, K = stateOf(P), low = isLow();
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = K.last ? clamp((now - K.last) / 1000, 0, 0.05) : 1 / 60; K.last = now;
    const t = P.t, al = P.alpha || 0, c = P.car;
    const camX = P.cam.px + (P.cam.x - P.cam.px) * al, camY = P.cam.py + (P.cam.y - P.cam.py) * al;
    const ix = c.px + (c.x - c.px) * al, iy = c.py + (c.y - c.py) * al;
    const ia = c.pa + Math.atan2(Math.sin(c.a - c.pa), Math.cos(c.a - c.pa)) * al;
    K.shake = Math.max(0, K.shake - dt * 25); K.flash = Math.max(0, K.flash - dt);
    if (calm()) { K.shake = 0; K.flash = 0; }
    const shx = K.shake ? (Math.random() - 0.5) * K.shake : 0, shy = K.shake ? (Math.random() - 0.5) * K.shake : 0;
    const cx = camX - shx, cy = camY - shy;
    watch(P, K, camX, camY);

    // 바닥: 보이는 부분만 잘라 찍는다
    const G = ground(P), r = G.res;
    const sx = clamp(cx, 0, L.W - vw), sy = clamp(cy, 0, L.H - 600);
    ctx.fillStyle = '#17482a'; ctx.fillRect(0, 0, vw, 600);
    ctx.drawImage(G.c, sx * r, sy * r, Math.min(vw, L.W) * r, 600 * r, sx - cx, sy - cy, Math.min(vw, L.W), 600);

    ctx.save(); ctx.translate(-cx, -cy);
    const vis = (x, y, m) => x > cx - m && x < cx + vw + m && y > cy - m && y < cy + 600 + m;

    // 분수 물결 · 물보라
    const fo = L.fountain;
    if (vis(fo.x, fo.y, 160)) fountain(ctx, fo, t, P.splashT, low);
    // 연못 반짝임 · 오리
    const pd = L.pond;
    if (vis(pd.x, pd.y, pd.rx + 40)) pond(ctx, pd, t, low);
    // 부스터 발판 빛
    for (const p of L.pads) if (vis(p.x, p.y, 80)) padGlow(ctx, p, t);
    // 도착 문 바닥 빛
    const g = P.gate;
    if (g && vis(g.x, g.y, 200)) glow(ctx, '#ffd23a', g.x, g.y, 150, 0.35 + Math.sin(t * 4) * 0.12);

    // 바닥 입자 (먼지)
    emit(P, K, dt, ix, iy, ia, low);
    stepParticles(K, dt);
    for (const q of K.pf) if (q.kind === 'dust') soft(ctx, q.color, q.x, q.y, q.size * (1 + (1 - q.life / q.max) * 1.5) * 1.6, 0.45 * q.life / q.max);

    // 풍선 그림자
    for (const b of L.balloons) if (!b.popped && vis(b.x, b.y, 100)) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(b.x + 16, b.y + 8, 20, 9, 0.3, 0, TAU); ctx.fill(); }

    // 별
    const drawStar = parkStar;
    for (const s of L.stars) if (!s.got && vis(s.x, s.y, 40)) drawStar(ctx, s.x, s.y, 20, t);
    for (const s of P.flying) if (!s.got && vis(s.x, s.y, 40)) drawStar(ctx, s.x, s.y, 16, t);

    // 덤불 (숨은 친구는 덤불 뒤에서 빼꼼)
    const BS = bushes();
    for (const f of L.friends) if (f.where === 'bush' && f.state === 'hide' && vis(f.hx, f.hy, 80)) peekBush(ctx, f, t);
    for (let i = 0; i < L.bushes.length; i++) {
      const b = L.bushes[i];
      if (!vis(b.x, b.y, 60)) continue;
      const wob = b.v > 0 ? Math.sin(t * 40 + i) * 0.08 * b.v : 0;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(wob); put(ctx, BS[i % 2], 0, 0, b.r / 32); ctx.restore();
      if (b.hide && !low) {
        // 숨은 친구 힌트: 가끔 반짝
        const f = L.friends.find(f => f.hx === b.x && f.hy === b.y);
        if (f && f.state === 'hide') { const ph = (t * 0.5 + i * 0.37) % 1; if (ph < 0.2) glow(ctx, '#ffe9a0', b.x + 18, b.y - 20, 22, Math.sin(ph / 0.2 * Math.PI)); }
      }
    }
    for (const f of L.friends) if (f.where === 'sand' && f.state === 'hide' && vis(f.hx, f.hy, 80)) sandMound(ctx, f, t);

    // 나와서 기다리는 친구
    for (const f of L.friends) if (f.state === 'out' && vis(f.x, f.y, 120)) {
      glow(ctx, '#ffb020', f.x, f.y - 10, 60, 0.3 + Math.abs(Math.sin(t * 3)) * 0.2);
      const k = Math.min(1, f.t / 0.35), s = 0.95 * (k < 1 ? 0.5 + k * 0.6 : 1);
      RC.Friends.friend(ctx, f.kind, f.x, f.y + 18, s, t, true);
    }

    // 친구 수레 기차
    const wcol = P.cfg.color || P.body.color;
    let hx = ix - Math.cos(ia) * 44, hy = iy - Math.sin(ia) * 44;
    for (let i = 0; i < P.followers.length; i++) {
      const w = P.followers[i];
      const fx = w.x, fy = w.y;
      ctx.strokeStyle = '#3a4150'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx + Math.cos(w.a) * 16, fy + Math.sin(w.a) * 16); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(fx + 5, fy + 7, 20, 15, w.a, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(w.a); put(ctx, wagon(wcol), 0, 0); ctx.restore();
      RC.Friends.friend(ctx, w.kind, fx, fy + 8, 0.52, t + i, false);
      hx = fx - Math.cos(w.a) * 17; hy = fy - Math.sin(w.a) * 17;
    }

    // 차
    drawCar(ctx, P, ix, iy, ia, t, low);

    // 나무 (차 위로 잎이 살짝 덮인다)
    const TS = trees();
    for (const tr of L.trees) {
      if (!vis(tr.x, tr.y, 80)) continue;
      const sw = low ? 0 : Math.sin(t * 1.2 + tr.ph) * 1.6;
      put(ctx, TS[tr.v], tr.x + sw, tr.y + sw * 0.4, tr.s);
    }

    // 풍선 (공중에 떠 있다)
    for (const b of L.balloons) {
      if (b.popped || !vis(b.x, b.y, 120)) continue;
      if (!b._o) b._o = { x: b.x, y: b.y - 62, color: b.color };
      RC.Friends.balloon(ctx, b._o, b.x, t + b.ph);
    }

    // 도움 요청 말풍선
    for (const f of L.friends) if (f.state === 'out' && vis(f.x, f.y, 140)) bubble(ctx, f.x, f.y - 92 + Math.sin(t * 3) * 3, '도와줘!');

    // 도착 문
    if (g) gate(ctx, g, t, P.done);

    // 반짝이·풍선 조각·물방울
    for (const q of K.pf) {
      if (q.kind === 'dust') continue;
      const k = q.life / q.max;
      if (q.kind === 'spark') glow(ctx, q.color, q.x, q.y, q.size * 4, k);
      else if (q.kind === 'drop') soft(ctx, q.color, q.x, q.y, q.size * 1.4, k * 0.8);
      else if (q.kind === 'flame') glow(ctx, q.color, q.x, q.y, q.size * 2.4, k * 0.8);
      else { ctx.globalAlpha = k; ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 4, q.size, q.size / 2); ctx.globalAlpha = 1; }
    }

    // 글자 튀기 (구했다! 펑! 슝!)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of K.pops) {
      p.t += dt;
      const k = p.t / 1.1, a = k < 0.75 ? 1 : Math.max(0, 1 - (k - 0.75) / 0.25), sc = p.t < 0.15 ? 0.6 + p.t / 0.15 * 0.55 : 1.15 - Math.min(0.15, (p.t - 0.15));
      const y = p.y - k * 50;
      glow(ctx, p.c, p.x, y, 60, 0.35 * a);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, y); ctx.scale(sc, sc);
      ctx.font = '34px ' + FONT; ctx.lineJoin = 'round';
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(10,16,32,0.9)'; ctx.strokeText(p.txt, 0, 0);
      ctx.fillStyle = p.c; ctx.fillText(p.txt, 0, 0);
      ctx.restore();
    }
    K.pops = K.pops.filter(p => p.t < 1.1);
    ctx.restore();

    // ─── 화면 고정 그림 ───
    // 도착 문이 화면 밖이면 가장자리에 화살표
    if (g && !P.done && !vis(g.x, g.y, -40)) edgeArrow(ctx, g.x - camX, g.y - camY, vw, t);
    // HUD로 날아가는 별
    const img = RC.Draw && RC.Draw.starImg ? RC.Draw.starImg() : null;
    for (const u of K.ui) {
      u.t += dt;
      if (u.t < 0) continue;
      const k = Math.min(1, u.t / 0.55), e = k * k * (3 - 2 * k);
      const x = u.x + (hud.x - u.x) * e, y = u.y + (hud.y - u.y) * e - Math.sin(k * Math.PI) * 60;
      const s = 0.42 - k * 0.2;
      if (img) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.drawImage(img, -48, -48); ctx.restore(); } else ownStar(ctx, x, y, 38 * s, t);
    }
    K.ui = K.ui.filter(u => u.t < 0.55);
    // 가운데 알림 (미션 완료 · 문 · 도착)
    if (K.banner) {
      const B = K.banner; B.t += dt;
      if (B.t > B.life) K.banner = null; else banner(ctx, B, vw);
    }
    // 도착 종이꽃
    if (K.confT > 0) {
      K.confT -= dt;
      const n = low ? 2 : 4;
      for (let i = 0; i < n && K.conf.length < 70; i++) K.conf.push({ x: Math.random() * vw, y: -10, vx: (Math.random() - 0.5) * 120, vy: 180 + Math.random() * 200, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, c: ['#ff3b3b', '#ffd23a', '#3aff9a', '#39d8ff', '#a855f7', '#ffffff'][Math.floor(Math.random() * 6)], s: 8 + Math.random() * 6 });
    }
    for (const q of K.conf) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.vr * dt; q.vx += Math.sin(q.y * 0.02) * 30 * dt;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.fillStyle = q.c; ctx.fillRect(-q.s / 2, -q.s / 4, q.s, q.s / 2 * Math.abs(Math.cos(q.r * 2)) + 1); ctx.restore();
    }
    K.conf = K.conf.filter(q => q.y < 620);
    if (K.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.35, K.flash) + ')'; ctx.fillRect(0, 0, vw, 600); }
  }

  // ─── 조각 그림 ───────────────────────────────────────────
  // 별: 빛 번짐과 별을 한 장에 미리 그려 두고 찍기만 한다 (별이 많아도 가볍게)
  let STAR = null;
  function starSprite() {
    if (STAR) return STAR;
    STAR = sprite(96, 96, 1.5, g => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 46);
      gr.addColorStop(0, 'rgba(255,207,58,0.55)'); gr.addColorStop(0.4, 'rgba(255,207,58,0.2)'); gr.addColorStop(1, 'rgba(255,207,58,0)');
      g.fillStyle = gr; g.fillRect(-48, -48, 96, 96);
      if (RC.Draw && RC.Draw.starImg) { g.scale(0.55, 0.55); g.drawImage(RC.Draw.starImg(), -48, -48); }
      else ownStar(g, 0, 0, 21, 0, true);
    });
    return STAR;
  }
  function parkStar(ctx, x, y, r, t) {
    const s = r / 20 * (1 + Math.sin(t * 5 + x * 0.03) * 0.07), yy = y + Math.sin(t * 4 + x * 0.05) * 3;
    put(ctx, starSprite(), x, yy, s);
    const ph = (t * 0.7 + x * 0.0071) % 1;
    if (ph < 0.12 && !isLow()) glow(ctx, '#fff6d6', x - r * 0.25, yy - r * 0.3, r * 1.2 * Math.sin(ph / 0.12 * Math.PI) + 4, 0.8);
  }
  function ownStar(ctx, x, y, r, t, noGlow) {
    if (!noGlow) glow(ctx, '#ffcf3a', x, y, r * 2.2, 0.55);
    glow(ctx, '#ffcf3a', x, y, r * 2.2, 0.55);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5 + Math.sin(t * 2 + x) * 0.15, q = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    ctx.closePath(); ctx.fillStyle = '#ffd23a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#6b3f00'; ctx.stroke();
  }

  function fountain(ctx, fo, t, splash, low) {
    ctx.save();
    ctx.beginPath(); ctx.arc(fo.x, fo.y, fo.r - 14, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) { const r = 26 + ((t * 26 + k * 20) % 60); ctx.globalAlpha = 1 - (r - 26) / 60; ctx.beginPath(); ctx.arc(fo.x, fo.y, r, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.restore();
    // 가운데 물줄기: 사방으로 떨어지는 물방울
    const n = low ? 8 : 16, big = splash > 0 ? 1.5 : 1;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + t * 0.4, ph = (t * 1.1 + i * 0.37) % 1, rr0 = 14 + ph * 58 * big;
      const lift = Math.sin(ph * Math.PI) * 22 * big;
      soft(ctx, '#d8f3ff', fo.x + Math.cos(a) * rr0, fo.y + Math.sin(a) * rr0 * 0.8 - lift, 5, 0.75 * (1 - ph * 0.6));
    }
    glow(ctx, '#bfe8ff', fo.x, fo.y - 14, 36 * big, 0.6);
    glow(ctx, '#ffffff', fo.x, fo.y - 18, 14, 0.9);
  }

  function pond(ctx, pd, t, low) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(pd.x, pd.y, pd.rx - 4, pd.ry - 4, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const x = pd.x - pd.rx * 0.7 + ((k * 97 + t * 14) % (pd.rx * 1.4)), y = pd.y - pd.ry * 0.6 + (k * 53 % (pd.ry * 1.2));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y - 4 + Math.sin(t * 2 + k) * 2, x + 22, y); ctx.stroke();
    }
    ctx.restore();
    if (low) return;
    // 오리 두 마리
    for (let i = 0; i < 2; i++) {
      const a = t * 0.25 * (i ? -1 : 1) + i * 2.4, x = pd.x + Math.cos(a) * pd.rx * 0.55, y = pd.y + Math.sin(a) * pd.ry * 0.5;
      const dir = a + (i ? -Math.PI / 2 : Math.PI / 2);
      ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-6, 0, 16, 2.3, 4); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(2, 3, 12, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, -8, 0, 8, [[0, '#fff7c2'], [1, '#e8b820']]); ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(10, 0, 5.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff8a1a'; ctx.beginPath(); ctx.moveTo(14, -2); ctx.lineTo(19, 0); ctx.lineTo(14, 2); ctx.fill();
      ctx.fillStyle = '#1b1f2c'; ctx.fillRect(11, -3, 1.6, 1.6); ctx.fillRect(11, 1.6, 1.6, 1.6);
      ctx.restore();
    }
  }

  function padGlow(ctx, p, t) {
    glow(ctx, '#39d8ff', p.x, p.y, 70, 0.3);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const on = Math.max(0, Math.sin(t * 8 - k * 1.2));
      ctx.strokeStyle = rgba('#8fe8ff', 0.25 + on * 0.75);
      ctx.beginPath(); ctx.moveTo(-26 + k * 20, -20); ctx.lineTo(-10 + k * 20, 0); ctx.lineTo(-26 + k * 20, 20); ctx.stroke();
    }
    ctx.restore();
  }

  function peekBush(ctx, f, t) {
    // 덤불 위로 머리만 빼꼼 (오르락내리락)
    const up = Math.max(0, Math.sin(t * 1.6 + f.hx * 0.01)) * 16;
    RC.Friends.friend(ctx, f.kind, f.hx + 8, f.hy - 26 - up, 0.75, t, false);
  }
  function sandMound(ctx, f, t) {
    const x = f.hx, y = f.hy, wig = Math.sin(t * 6) * 2;
    ctx.fillStyle = 'rgba(120,80,30,0.25)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 6, 34, 18, 0, 0, TAU); ctx.fill();
    // 귀·안테나가 모래 위로
    ctx.save(); ctx.beginPath(); ctx.rect(x - 60, y - 80, 120, 80); ctx.clip();
    RC.Friends.friend(ctx, f.kind, x, y + 18 - Math.max(0, Math.sin(t * 1.4)) * 10, 0.8, t, false);
    ctx.restore();
    const gr = ctx.createRadialGradient(x - 8, y - 6, 2, x, y, 34);
    gr.addColorStop(0, '#fbe9bb'); gr.addColorStop(1, '#cfa45e');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, 32 + wig * 0.5, 16, 0, 0, TAU); ctx.fill();
    if (Math.floor(t * 2) % 3 === 0) glow(ctx, '#ffe9a0', x + 20, y - 18, 18, 0.7);
  }

  function bubble(ctx, x, y, txt) {
    ctx.save();
    ctx.font = '22px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 28;
    rr(ctx, x - w / 2, y - 18, w, 36, 12); ctx.fillStyle = 'rgba(10,16,32,0.9)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffb020'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7, y + 17); ctx.lineTo(x + 7, y + 17); ctx.lineTo(x, y + 27); ctx.closePath(); ctx.fillStyle = 'rgba(10,16,32,0.9)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + 1);
    ctx.restore();
  }

  function drawCar(ctx, P, x, y, a, t, low) {
    const c = P.car, spr = carSprite(P), fast = c.v / P.maxV;
    // 그림자 (해는 왼쪽 위 → 오른쪽 아래로)
    ctx.save(); ctx.translate(x + 6, y + 9); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(ctx, -50, -29, 100, 58, 18); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; rr(ctx, -45, -25, 90, 50, 14); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    // 부스터·제트 불꽃 (뒤로)
    const x0 = P.body.id === 'fire' ? -46 : -42;
    if (c.boost > 0 || (P.gear.id === 'jet' && fast > 0.55)) {
      const k = c.boost > 0 ? 1 : (fast - 0.55) / 0.45, fl = 0.8 + Math.sin(t * 50) * 0.2;
      for (const sy of (P.gear.id === 'jet' ? [-11, 11] : [0])) {
        const bx = x0 - (P.gear.id === 'jet' ? 20 : 6);
        ctx.beginPath(); ctx.moveTo(bx, sy - 5); ctx.lineTo(bx - 26 * k * fl, sy); ctx.lineTo(bx, sy + 5); ctx.closePath();
        ctx.fillStyle = lin(ctx, bx, 0, bx - 26, 0, [[0, '#ffffff'], [0.3, '#8fe8ff'], [1, 'rgba(57,120,255,0)']]); ctx.fill();
        glow(ctx, c.boost > 0 ? '#39d8ff' : '#ff8a1a', bx - 8, sy, 22 * k + 6, 0.8);
      }
    }
    // 부딪히면 살짝 찌그러졌다 펴진다
    const sq = c.hit > 0 ? 1 - Math.sin(c.hit / 0.3 * Math.PI) * 0.06 : 1;
    ctx.scale(sq, 2 - sq);
    put(ctx, spr, 0, 0);
    // 깜빡이는 불빛
    const blink = Math.floor(t * 5) % 2;
    if (P.body.id === 'police') {
      glow(ctx, '#ff3048', -1, -11, blink ? 26 : 12, blink ? 1 : 0.4);
      glow(ctx, '#3a6bff', -1, 11, blink ? 12 : 26, blink ? 0.4 : 1);
    } else if (P.body.id === 'fire') {
      glow(ctx, '#ff3030', 25, -14, blink ? 20 : 9, blink ? 1 : 0.5);
      glow(ctx, '#ff3030', 25, 14, blink ? 9 : 20, blink ? 0.5 : 1);
    }
    const x1 = P.body.id === 'fire' ? 46 : 42;
    if (!low) { glow(ctx, '#fff2b0', x1, -15, 12, 0.7); glow(ctx, '#fff2b0', x1, 15, 12, 0.7); }
    ctx.restore();
  }

  function emit(P, K, dt, x, y, a, low) {
    const c = P.car, L = P.park;
    if (P.done && c.v < 5) return;
    K.em += dt;
    const every = low ? 0.1 : 0.05;
    while (K.em > every) {
      K.em -= every;
      if (c.v < 70) continue;
      const sb = L.sandbox;
      const inSand = Math.abs(x - sb.x) < sb.w / 2 && Math.abs(y - sb.y) < sb.h / 2;
      const col = inSand ? '#e8cf92' : c.onPath ? '#d6c6a2' : '#5f8a3a';
      const bx = x - Math.cos(a) * 34, by = y - Math.sin(a) * 34, r = Math.random();
      for (const sy of [-1, 1]) {
        const ox = -Math.sin(a) * 20 * sy, oy = Math.cos(a) * 20 * sy;
        if (r < 0.7 || inSand) puff(K, bx + ox, by + oy, -Math.cos(a) * 40 + (Math.random() - 0.5) * 40, -Math.sin(a) * 40 + (Math.random() - 0.5) * 40, 0.5, 4 + r * 3, 'dust', col);
      }
      if (c.boost > 0) puff(K, bx, by, -Math.cos(a) * 160, -Math.sin(a) * 160, 0.3, 4, 'flame', '#39d8ff');
    }
  }
  function stepParticles(K, dt) {
    for (const q of K.pf) {
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      const f = q.kind === 'spark' ? 3 : 2;
      q.vx *= 1 - Math.min(1, dt * f); q.vy *= 1 - Math.min(1, dt * f);
    }
    K.pf = K.pf.filter(q => q.life > 0);
  }

  function gate(ctx, g, t, done) {
    const k = Math.min(1, g.t / 0.5), sc = k < 1 ? k * (1.2 - 0.2 * k) : 1 + Math.sin(t * 3) * 0.02;
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.a); ctx.scale(sc, sc);
    const half = 92;
    // 바닥 체크무늬 띠
    ctx.save(); ctx.globalAlpha = 0.85;
    for (let i = -8; i < 8; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#1b1f2c'; ctx.fillRect(i * 11, -11 + j * 11, 11, 11); }
    ctx.restore();
    // 기둥 그림자 · 기둥
    for (const sx of [-half, half]) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(sx + 8, 10, 18, 0, TAU); ctx.fill();
      const gr = ctx.createRadialGradient(sx - 5, -6, 2, sx, 0, 17);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#aeb8c8'); gr.addColorStop(1, '#3a4150');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, 0, 16, 0, TAU); ctx.fill();
      glow(ctx, '#ffd23a', sx, 0, 30, 0.6 + Math.sin(t * 6 + sx) * 0.3);
    }
    // 아치 (높이감: 기둥보다 위쪽으로 떠 있게)
    ctx.restore();
    ctx.save(); ctx.translate(g.x, g.y - 34 * sc); ctx.rotate(g.a); ctx.scale(sc, sc);
    rr(ctx, -half - 10, -14, half * 2 + 20, 28, 12);
    ctx.fillStyle = lin(ctx, 0, -14, 0, 14, [[0, '#ffb04a'], [1, '#e0400f']]); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#7a2a08'; ctx.stroke();
    const cols = ['#ff3b3b', '#ffd23a', '#3aff9a', '#39d8ff'];
    for (let i = 0; i < 11; i++) {
      const px = -half + i * (half * 2 / 10), on = (Math.floor(t * 8) + i) % 4;
      ctx.fillStyle = cols[on]; ctx.beginPath(); ctx.arc(px, 0, 4, 0, TAU); ctx.fill();
      glow(ctx, cols[on], px, 0, done ? 18 : 12, done ? 1 : 0.8);
    }
    ctx.restore();
    // 글자는 늘 똑바로
    ctx.save(); ctx.translate(g.x, g.y - 78 * sc); ctx.scale(sc, sc);
    ctx.font = '28px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText('도착').width + 36;
    rr(ctx, -w / 2, -21, w, 42, 14); ctx.fillStyle = 'rgba(10,16,32,0.9)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd23a'; ctx.stroke();
    ctx.fillStyle = '#ffd23a'; ctx.fillText('도착', 0, 1);
    ctx.restore();
  }

  function edgeArrow(ctx, sx, sy, vw, t) {
    const cx = vw / 2, cy = 300, dx = sx - cx, dy = sy - cy;
    const m = 70, kx = (vw / 2 - m) / Math.abs(dx || 1e-6), ky = (300 - m) / Math.abs(dy || 1e-6), k = Math.min(kx, ky);
    const x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx), pul = 1 + Math.sin(t * 6) * 0.08;
    glow(ctx, '#ffd23a', x, y, 60, 0.45);
    ctx.save(); ctx.translate(x, y); ctx.scale(pul, pul);
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fillStyle = 'rgba(10,16,32,0.88)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23a'; ctx.stroke();
    ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -13); ctx.lineTo(-3, 0); ctx.lineTo(-8, 13); ctx.closePath(); ctx.fillStyle = '#ffd23a'; ctx.fill();
    ctx.restore();
  }

  function banner(ctx, B, vw) {
    const k = B.t, inA = Math.min(1, k / 0.25), outA = Math.min(1, (B.life - k) / 0.35), a = Math.min(inA, outA);
    const sc = 0.8 + 0.2 * (1 - Math.pow(1 - inA, 3));
    const x = vw / 2, y = 170;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.font = '44px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.max(ctx.measureText(B.big).width + 80, 300);
    glow(ctx, B.c, 0, 0, w * 0.55, 0.3);
    rr(ctx, -w / 2, -48, w, B.small ? 96 : 76, 20);
    ctx.fillStyle = 'rgba(10,16,32,0.86)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = B.c; ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, -40, 0, 0, [[0, '#ffffff'], [1, B.c]]);
    ctx.fillText(B.big, 0, -12);
    if (B.small) { ctx.font = '22px ' + FONT; ctx.fillStyle = '#dfe8f5'; ctx.fillText(B.small, 0, 28); }
    ctx.restore();
  }

  RC.ParkDraw = { draw, setHud, carSprite };
})(RC);
