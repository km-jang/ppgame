'use strict';
// 무대 그리기: 시간이 흐르는 도시(낮 → 노을 → 밤), 시차 스크롤, 도로·소품·장애물, 카메라, 후처리.
// 차고(쇼룸)와 밤 차고도 여기서 그린다.
// 성능: 건물 층은 팔레트별로 한 번만 그려 두고(타일) 매 프레임 찍기만 한다.
(function (RC) {
  const A = RC.Art, C = RC.Car, D = RC.DATA;
  const { TAU, INK, shade, mix, rgba, rr, poly, lin, glow, soft, smooth, chrome, gunmetal } = A;
  const GY = D.RUN.groundY;

  // ─── 팔레트: 낮 · 노을 · 밤 ─────────────────────────────────
  const PAL = [
    { top: '#1f78e0', mid: '#5cb4f5', hor: '#d4f0ff', far: '#9fc1e4', farHaze: '#c6def3', mid2: '#6d8db6', trim: '#8fb0d6', win: '#bfe0ff', lit: 0.05, road: '#3a3f4b', side: '#b9c1ce', tree: '#3fa34d', cloud: '#ffffff', lamps: 0 },
    { top: '#2a2f6b', mid: '#b4527c', hor: '#ffae55', far: '#a0617a', farHaze: '#d88a7e', mid2: '#56396a', trim: '#8a5577', win: '#ffcf7a', lit: 0.35, road: '#302d3e', side: '#9c8a98', tree: '#2c5236', cloud: '#ffb78f', lamps: 0.6 },
    { top: '#050818', mid: '#0f1740', hor: '#2b2f6e', far: '#1b2150', farHaze: '#262c66', mid2: '#121836', trim: '#232b5a', win: '#ffd76a', lit: 0.75, road: '#1b1f2c', side: '#454b63', tree: '#132419', cloud: '#3a4278', lamps: 1 },
  ];
  function weights(p) { return [smooth(0.36, 0.52, p), smooth(0.66, 0.82, p)]; }
  function palAt(p) {
    const [ws, wn] = weights(p);
    const out = {};
    for (const k of Object.keys(PAL[0])) {
      const a = PAL[0][k], b = PAL[1][k], c = PAL[2][k];
      out[k] = typeof a === 'number' ? (a + (b - a) * ws) * (1 - wn) + c * wn : mix(mix(a, b, ws), c, wn);
    }
    out.ws = ws; out.wn = wn;
    return out;
  }

  // ─── 건물 타일 (팔레트별) ───────────────────────────────────
  const TILE_W = 1600, RES = 1.25;
  const tiles = { city: { far: [], mid: [] }, site: { far: [], mid: [] } };
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.round(w * RES); c.height = Math.round(h * RES); const g = c.getContext('2d'); g.scale(RES, RES); return [c, g]; }

  function buildFar(pi) {
    const P = PAL[pi], H = 330;
    const [c, g] = makeCanvas(TILE_W, H);
    const rand = RC.rng(31);
    for (let x = -20; x < TILE_W; ) {
      const w = 50 + rand() * 80, h = 90 + rand() * 210;
      const top = H - h;
      g.fillStyle = lin(g, 0, top, 0, H, [[0, P.far], [1, P.farHaze]]);
      g.fillRect(x, top, w, h);
      if (rand() < 0.35) { g.fillRect(x + w * 0.2, top - 18, w * 0.6, 18); }
      if (rand() < 0.25) { g.fillRect(x + w / 2 - 1.5, top - 50, 3, 50); }
      // 창문
      const lit = P.lit;
      for (let wy = top + 10; wy < H - 20; wy += 12) for (let wx = x + 6; wx < x + w - 8; wx += 10) {
        const on = rand() < lit;
        if (on) { g.fillStyle = rgba(P.win, 0.85); g.fillRect(wx, wy, 5, 6); }
        else if (pi === 0 && rand() < 0.5) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(wx, wy, 5, 6); }
      }
      x += w + 4 + rand() * 18;
    }
    return c;
  }

  function billboard(g, x, y, w, h, pi, kind) {
    rr(g, x, y, w, h, 4); g.fillStyle = pi === 2 ? '#0c1024' : '#1d2438'; g.fill();
    const neon = ['#39d8ff', '#ff4fa3', '#ffd23a'][kind % 3];
    g.lineWidth = 3; g.strokeStyle = pi === 0 ? shade(neon, 0.8) : neon; g.stroke();
    if (pi > 0) { g.shadowColor = neon; g.shadowBlur = pi === 2 ? 18 : 8; g.stroke(); g.shadowBlur = 0; }
    g.fillStyle = pi === 0 ? '#e8eef7' : neon;
    g.font = '22px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(['ROBO', '뚝딱', 'TURBO'][kind % 3], x + w / 2, y + h / 2 + 1);
    // 기둥
    g.fillStyle = '#1a1f2c'; g.fillRect(x + w * 0.25, y + h, 4, 16); g.fillRect(x + w * 0.72, y + h, 4, 16);
  }

  function buildMid(pi) {
    const P = PAL[pi], H = 360;
    const [c, g] = makeCanvas(TILE_W, H);
    const rand = RC.rng(77);
    let n = 0;
    for (let x = 0; x < TILE_W; ) {
      const w = 110 + rand() * 90, h = 150 + rand() * 170;
      const top = H - h;
      // 몸통 + 오른쪽 그늘면
      g.fillStyle = lin(g, 0, top, 0, H, [[0, shade(P.mid2, pi === 2 ? 1.2 : 1.12)], [1, shade(P.mid2, 0.8)]]);
      g.fillRect(x, top, w, h);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + w - 16, top, 16, h);
      g.fillStyle = P.trim; g.fillRect(x - 3, top - 6, w + 6, 8);
      // 옥상 소품
      const r = rand();
      if (r < 0.3) { g.fillStyle = shade(P.mid2, 0.7); rr(g, x + 16, top - 30, 26, 24, 4); g.fill(); g.fillRect(x + 20, top - 8, 4, 4); g.fillRect(x + 34, top - 8, 4, 4); }
      else if (r < 0.55) { g.fillStyle = shade(P.mid2, 0.75); g.fillRect(x + w - 40, top - 16, 24, 12); g.fillRect(x + 20, top - 12, 16, 8); }
      else if (r < 0.75) billboard(g, x + 10, top - 62, w - 20, 44, pi, n++);
      // 창문 격자
      for (let wy = top + 16; wy < H - 26; wy += 22) for (let wx = x + 12; wx < x + w - 24; wx += 18) {
        const on = rand() < P.lit;
        g.fillStyle = on ? P.win : (pi === 0 ? 'rgba(210,235,255,0.55)' : 'rgba(10,14,30,0.55)');
        g.fillRect(wx, wy, 10, 13);
        if (on && pi > 0) { g.fillStyle = rgba(P.win, 0.25); g.fillRect(wx - 3, wy - 3, 16, 19); }
      }
      // 1층 가게
      g.fillStyle = shade(P.mid2, 0.6); g.fillRect(x, H - 30, w, 30);
      g.fillStyle = pi === 0 ? '#a9d6ff' : rgba(P.win, 0.9); g.fillRect(x + 10, H - 24, w - 36, 18);
      g.fillStyle = ['#ff5a5a', '#2f9bff', '#22c55e', '#ffb020'][Math.floor(rand() * 4)]; g.fillRect(x + 6, H - 34, w - 28, 6);
      x += w + 14 + rand() * 40;
    }
    return c;
  }

  function ensureTiles(theme) {
    const T = tiles[theme];
    if (T.far.length) return T;
    for (let i = 0; i < 3; i++) {
      if (theme === 'site') {
        const [cf, gf] = makeCanvas(TILE_W, 330); RC.Site.buildFar(PAL[i], i, TILE_W, 330, gf); T.far.push(cf);
        const [cm, gm] = makeCanvas(TILE_W, 360); RC.Site.buildMid(PAL[i], i, TILE_W, 360, gm); T.mid.push(cm);
      } else { T.far.push(buildFar(i)); T.mid.push(buildMid(i)); }
    }
    return T;
  }

  function drawLayer(ctx, list, w, cam, par, y, h, vw) {
    const off = ((-cam * par) % TILE_W + TILE_W) % TILE_W - TILE_W;
    for (let i = 0; i < 3; i++) {
      if (w[i] <= 0.001) continue;
      ctx.globalAlpha = w[i];
      for (let x = off; x < vw; x += TILE_W) ctx.drawImage(list[i], x, y, TILE_W, h);
    }
    ctx.globalAlpha = 1;
  }
  // 크로스페이드 가중치: 위에 덮는 방식이라 가장 위 층이 1이면 아래 층은 그리지 않는다
  function layerWeights(ws, wn) {
    if (wn >= 0.999) return [0, 0, 1];
    if (ws >= 0.999 && wn <= 0.001) return [0, 1, 0];
    return [ws >= 0.999 ? 0 : 1, ws, wn];
  }

  // ─── 하늘 ────────────────────────────────────────────────
  // 하늘은 1/4 해상도로 그려 두고 늘려 찍는다 (시간대가 조금 바뀔 때만 다시 그림)
  const skyStars = [];
  const skyCache = { key: '', c: null };
  function skyBase(P, vw) {
    const key = Math.round(P.ws * 40) + ':' + Math.round(P.wn * 40) + ':' + Math.round(vw);
    if (skyCache.key === key) return skyCache.c;
    const s = 0.25, W = Math.ceil(vw * s), H = Math.ceil((GY + 10) * s);
    const c = skyCache.c || document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = lin(g, 0, 0, 0, GY, [[0, P.top], [0.55, P.mid], [1, P.hor]]);
    g.fillRect(0, 0, vw, GY + 10);
    const ws = P.ws, wn = P.wn;
    if (wn < 1) {
      const sx = vw * (0.68 - ws * 0.14), sy = 120 + ws * 200;
      const col = mix('#fff6c9', '#ff9a4a', ws);
      glow(g, col, sx, sy, 200 + ws * 90, (0.8 + ws * 0.2) * (1 - wn));
      g.globalAlpha = 1 - wn;
      g.beginPath(); g.arc(sx, sy, 42 + ws * 14, 0, TAU); g.fillStyle = mix('#ffffff', '#ffcf7a', ws); g.fill();
      g.globalAlpha = 1;
    }
    if (wn > 0) {
      const mx = vw * 0.78, my = 110;
      g.globalAlpha = wn;
      glow(g, '#bcd4ff', mx, my, 110, wn * 0.6);
      g.beginPath(); g.arc(mx, my, 34, 0, TAU); g.fillStyle = '#f2f5ff'; g.fill();
      g.beginPath(); g.arc(mx + 14, my - 8, 30, 0, TAU); g.fillStyle = P.top; g.fill();
      g.globalAlpha = 1;
    }
    skyCache.key = key; skyCache.c = c;
    return c;
  }
  function sky(ctx, P, vw, t) {
    ctx.drawImage(skyBase(P, vw), 0, 0, vw, GY + 10);
    const wn = P.wn;
    if (wn > 0) {
      if (!skyStars.length) { const r = RC.rng(3); for (let i = 0; i < 90; i++) skyStars.push([r(), r() * 0.7, r() * 6]); }
      ctx.fillStyle = '#ffffff';
      for (const st of skyStars) { ctx.globalAlpha = wn * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + st[2]))); ctx.fillRect(st[0] * vw, st[1] * GY, 2, 2); }
      ctx.globalAlpha = 1;
    }
  }

  const cloudSprites = {};
  function cloudSprite(color, v) {
    const key = color + v;
    if (cloudSprites[key]) return cloudSprites[key];
    const c = document.createElement('canvas'); c.width = 320; c.height = 140;
    const g = c.getContext('2d');
    const r = RC.rng(v * 17 + 5);
    for (let i = 0; i < 9; i++) {
      const x = 50 + r() * 220, y = 70 + (r() - 0.5) * 30, rad = 30 + r() * 30;
      const grad = g.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad);
      grad.addColorStop(0, color); grad.addColorStop(0.7, rgba(color, 0.85)); grad.addColorStop(1, rgba(color, 0));
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    cloudSprites[key] = c;
    return c;
  }
  function clouds(ctx, P, cam, vw, t, lw) {
    for (let i = 0; i < 6; i++) {
      const span = vw + 400;
      const x = ((i * 520 + t * 10 - cam * 0.06) % span + span) % span - 300;
      const y = 60 + (i % 3) * 55, k = 0.8 + (i % 2) * 0.3;
      for (let p = 0; p < 3; p++) {
        if (lw[p] <= 0.001) continue;
        ctx.globalAlpha = lw[p] * (p === 2 ? 0.5 : 0.9);
        ctx.drawImage(cloudSprite(PAL[p].cloud, i % 3), x, y, 320 * k, 140 * k);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ─── 도로 ────────────────────────────────────────────────

  // 도로 줄(인도·연석·아스팔트·차선)은 타일로 그려 두고 이어 찍는다
  const ROAD_W = 840, ROAD_Y = GY - 26, ROAD_H = 600 - GY + 26;
  const roadCache = { key: '', c: null };
  function roadTile(P, theme) {
    const key = theme + Math.round(P.ws * 30) + ':' + Math.round(P.wn * 30);
    if (roadCache.key === key) return roadCache.c;
    const R2 = 1.25;
    const c = roadCache.c || document.createElement('canvas');
    c.width = Math.round(ROAD_W * R2); c.height = Math.round(ROAD_H * R2);
    const g = c.getContext('2d');
    g.setTransform(R2, 0, 0, R2, 0, -ROAD_Y * R2);
    if (theme === 'site') { RC.Site.roadTile(g, P, ROAD_W); roadCache.key = key; roadCache.c = c; return c; }
    g.fillStyle = lin(g, 0, GY - 26, 0, GY, [[0, shade(P.side, 1.1)], [1, shade(P.side, 0.85)]]);
    g.fillRect(0, GY - 26, ROAD_W, 26);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1.5;
    g.beginPath(); for (let x = 0; x <= ROAD_W; x += 60) { g.moveTo(x + 8, GY - 26); g.lineTo(x, GY); } g.stroke();
    g.fillStyle = shade(P.side, 0.7); g.fillRect(0, GY - 4, ROAD_W, 8);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, GY - 4, ROAD_W, 2);
    g.fillStyle = lin(g, 0, GY + 4, 0, 600, [[0, shade(P.road, 1.15)], [1, shade(P.road, 0.8)]]);
    g.fillRect(0, GY + 4, ROAD_W, 600 - GY);
    const r = RC.rng(9);
    for (let i = 0; i < 1400; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(r() * ROAD_W, GY + 6 + r() * (600 - GY), 2, 2); }
    g.fillStyle = mix('#f2f2f2', '#9aa1b8', P.wn * 0.6);
    for (let x = 0; x < ROAD_W; x += 140) { poly(g, [0, 0, 70, 0, 66, 7, -4, 7], x + 4, GY + 62); g.fill(); }
    g.fillStyle = 'rgba(255,210,58,0.85)'; g.fillRect(0, GY + 14, ROAD_W, 3);
    roadCache.key = key; roadCache.c = c;
    return c;
  }

  function road(ctx, P, cam, vw, pits, theme) {
    const tile = roadTile(P, theme);
    const off = ((-cam % ROAD_W) + ROAD_W) % ROAD_W - ROAD_W;
    for (let x = off; x < vw; x += ROAD_W) ctx.drawImage(tile, x, ROAD_Y, ROAD_W + 0.5, ROAD_H);
    // 공사 구덩이
    for (const p of pits) {
      const x = p.x - cam;
      if (x > vw + 60 || x + p.w < -60) continue;
      ctx.fillStyle = lin(ctx, 0, GY - 26, 0, 600, [[0, '#2a2118'], [0.2, '#15110d'], [1, '#050506']]);
      ctx.fillRect(x, GY - 26, p.w, 600 - GY + 26);
      ctx.fillStyle = '#5a4430'; ctx.fillRect(x, GY - 26, 6, 600); ctx.fillRect(x + p.w - 6, GY - 26, 6, 600);
      barrier(ctx, x - 26, P);
      barrier(ctx, x + p.w + 4, P);
    }
  }

  function barrier(ctx, x, P) {
    const y = GY - 26;
    ctx.fillStyle = gunmetal(ctx, y - 44, y); ctx.fillRect(x + 2, y - 40, 4, 40); ctx.fillRect(x + 18, y - 40, 4, 40);
    rr(ctx, x - 2, y - 44, 28, 14, 3); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); rr(ctx, x - 2, y - 44, 28, 14, 3); ctx.clip();
    ctx.fillStyle = '#ff6a1a'; for (let k = -2; k < 5; k++) { poly(ctx, [0, 0, 6, 0, 0, 14, -6, 14], x + k * 10, y - 44); ctx.fill(); }
    ctx.restore();
    const on = Math.floor(performance.now() / 400) % 2;
    ctx.beginPath(); ctx.arc(x + 12, y - 49, 4, 0, TAU); ctx.fillStyle = on ? '#ffb020' : '#7a4a00'; ctx.fill();
    if (on) glow(ctx, '#ffb020', x + 12, y - 49, 22, 0.9);
  }

  // ─── 거리 소품: 가로등 · 나무 ───────────────────────────────
  function props(ctx, P, cam, vw, t) {
    const lampGap = 420;
    const first = Math.floor((cam - 100) / lampGap);
    for (let i = first; i * lampGap - cam < vw + 100; i++) {
      const wx = i * lampGap + 120;
      const x = wx - cam;
      // 나무 (가로등 사이)
      if (i % 2 === 0) tree(ctx, x + 210, P, i);
      // 가로등
      const y = GY - 26;
      ctx.fillStyle = lin(ctx, x - 3, 0, x + 3, 0, [[0, '#3a4150'], [0.5, '#6b7488'], [1, '#2a303c']]);
      ctx.fillRect(x - 3, y - 170, 6, 170);
      ctx.fillRect(x - 3, y - 172, 34, 5);
      rr(ctx, x + 18, y - 170, 24, 9, 4); ctx.fillStyle = '#2a303c'; ctx.fill();
      if (P.lamps > 0.02) {
        ctx.fillStyle = mix('#555a66', '#fff2c4', P.lamps); ctx.fillRect(x + 21, y - 162, 18, 3);
        glow(ctx, '#ffd68a', x + 30, y - 160, 60, P.lamps * 0.9);
        // 불빛 원뿔
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = P.lamps * 0.18;
        ctx.fillStyle = lin(ctx, 0, y - 160, 0, GY + 40, [[0, '#ffe2a0'], [1, 'rgba(255,226,160,0)']]);
        poly(ctx, [22, -160, 38, -160, 80, 60, -20, 60], x, y); ctx.fill();
        ctx.restore();
        // 젖은 도로 반사
        soft(ctx, '#ffd68a', x + 30, GY + 40, 40, P.lamps * 0.25);
      }
    }
  }
  function tree(ctx, x, P, seed) {
    const y = GY - 26;
    ctx.fillStyle = shade('#6b4a2e', 0.6 + (1 - P.wn) * 0.4); ctx.fillRect(x - 4, y - 60, 8, 60);
    const base = P.tree;
    const r = RC.rng(seed * 7 + 3);
    for (let k = 0; k < 5; k++) {
      const cx = x + (r() - 0.5) * 50, cy = y - 80 - r() * 40, rad = 22 + r() * 16;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU);
      ctx.fillStyle = lin(ctx, 0, cy - rad, 0, cy + rad, [[0, shade(base, 1.35)], [1, shade(base, 0.7)]]); ctx.fill();
    }
  }

  // 전경 (카메라보다 빠르게 지나가는 어두운 실루엣 → 깊이감)
  function foreground(ctx, P, cam, vw) {
    const gap = 900, par = 1.3;
    const first = Math.floor((cam * par) / gap) - 1;
    for (let i = first; i * gap - cam * par < vw + 200; i++) {
      const x = i * gap - cam * par + 400;
      ctx.fillStyle = mix('#1a2a1e', '#05070c', P.wn);
      ctx.beginPath(); ctx.arc(x, 612, 70, Math.PI, 0); ctx.arc(x + 70, 616, 55, Math.PI, 0); ctx.fill();
      ctx.fillStyle = mix('#2a303c', '#05070c', P.wn * 0.7);
      ctx.fillRect(x + 160, 520, 10, 90);
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(x + 160, 534, 10, 6);
    }
  }

  // ─── 수집품 · 장애물 ─────────────────────────────────────
  let starSprite = null;
  function starImg() {
    if (starSprite) return starSprite;
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d'); g.translate(48, 48);
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 17 : 38; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
    g.fillStyle = '#e59a00'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#6b3f00'; g.stroke();
    // 입체감: 중심에서 각 꼭짓점으로 나눈 면을 번갈아 밝게
    for (let i = 0; i < 10; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % 10];
      g.beginPath(); g.moveTo(0, 0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath();
      g.fillStyle = i % 2 ? '#ffd23a' : '#ffe88a';
      if (i >= 5 && i <= 7) g.fillStyle = i % 2 ? '#f0b400' : '#ffcf3a';
      g.fill();
    }
    g.beginPath(); g.arc(-10, -12, 5, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
    starSprite = c;
    return c;
  }
  function drawStar(ctx, x, y, r, t) {
    const s = r / 38 * (1 + Math.sin(t * 5 + x * 0.03) * 0.06);
    glow(ctx, '#ffcf3a', x, y, r * 2.2, 0.55);
    ctx.save(); ctx.translate(x, y + Math.sin(t * 4 + x * 0.05) * 3); ctx.rotate(Math.sin(t * 2 + x) * 0.18); ctx.scale(s, s);
    ctx.drawImage(starImg(), -48, -48); ctx.restore();
    // 반짝: 별마다 다른 때에 십자 빛이 스친다
    const ph = (t * 0.7 + x * 0.0071) % 1;
    if (ph < 0.12 && !RC.Draw.low) {
      const k = Math.sin(ph / 0.12 * Math.PI), L = r * 1.6 * k;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * 0.9; ctx.fillStyle = '#fff6d6';
      const yy = y + Math.sin(t * 4 + x * 0.05) * 3 - r * 0.3, xx = x - r * 0.25;
      poly(ctx, [0, -L, 2, -2, L, 0, 2, 2, 0, L, -2, 2, -L, 0, -2, -2], xx, yy); ctx.fill();
      ctx.restore();
    }
  }

  function crate(ctx, x, y, w, h, style) {
    if (style) {
      // 금속 컨테이너
      rr(ctx, x, y, w, h, 4); ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, '#ff9a4a'], [1, '#c24a14']]); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
      for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x + k * w / 5, y + 6); ctx.lineTo(x + k * w / 5, y + h - 6); ctx.stroke(); }
      ctx.save(); rr(ctx, x, y + h * 0.4, w, 12, 0); ctx.clip();
      ctx.fillStyle = INK; ctx.fillRect(x, y + h * 0.4, w, 12); ctx.fillStyle = '#ffd23a';
      for (let k = -1; k < 8; k++) { poly(ctx, [0, 0, 8, 0, 0, 12, -8, 12], x + k * 14, y + h * 0.4); ctx.fill(); }
      ctx.restore();
    } else {
      // 나무 상자
      rr(ctx, x, y, w, h, 3); ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, '#d8a060'], [1, '#8c5a2b']]); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.strokeStyle = '#6b4020'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x + 8, y + h - 8); ctx.lineTo(x + w - 8, y + 8); ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 4, y + 3); ctx.lineTo(x + w - 4, y + 3); ctx.stroke();
      ctx.fillStyle = '#aab3c2'; for (const [dx, dy] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.5, 0, TAU); ctx.fill(); }
    }
  }

  function items(ctx, R, cam, vw, t, P) {
    for (const o of R.level.items) {
      const x = o.x - cam;
      if (x < -220 || x > vw + 220) continue;
      switch (o.type) {
        case 'star': if (!o.got) drawStar(ctx, x, o.y, 19, t); break;
        case 'box':
          if (o.broken) break;
          for (let k = 0; k < o.n; k++) crate(ctx, x, GY - 64 * (k + 1), 64, 64, (Math.floor(o.x / 97) + k) % 2);
          break;
        case 'rock': {
          if (o.broken) break;
          if (o.style === 'pipe') { RC.Site.pipe(ctx, x, o); break; }
          // 콘크리트 방호벽
          poly(ctx, [0, 0, 10, -16, 22, -66, 68, -66, 80, -16, 90, 0], x, GY);
          ctx.fillStyle = lin(ctx, 0, GY - 66, 0, GY, [[0, '#e3e7ee'], [1, '#8e96a3']]); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
          ctx.save(); poly(ctx, [0, 0, 10, -16, 22, -66, 68, -66, 80, -16, 90, 0], x, GY); ctx.clip();
          ctx.fillStyle = '#ff5a1a'; for (let k = -1; k < 7; k++) { poly(ctx, [0, 0, 10, 0, 0, 14, -10, 14], x + k * 18, GY - 48); ctx.fill(); }
          ctx.fillStyle = '#ffffff'; for (let k = -1; k < 7; k++) { poly(ctx, [0, 0, 10, 0, 0, 14, -10, 14], x + k * 18 + 9, GY - 48); ctx.fill(); }
          ctx.restore();
          ctx.strokeStyle = 'rgba(40,44,54,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 30, GY - 66); ctx.lineTo(x + 38, GY - 54); ctx.lineTo(x + 34, GY - 40); ctx.stroke();
          const on = Math.floor(t * 3) % 2; ctx.beginPath(); ctx.arc(x + 45, GY - 70, 5, 0, TAU); ctx.fillStyle = on ? '#ffb020' : '#7a4a00'; ctx.fill(); if (on) glow(ctx, '#ffb020', x + 45, GY - 70, 26, 1);
          break;
        }
        case 'fire':
          if (o.out) {
            ctx.fillStyle = lin(ctx, 0, GY - 6, 0, GY + 6, [[0, 'rgba(120,200,255,0.8)'], [1, 'rgba(40,120,200,0.4)']]);
            ctx.beginPath(); ctx.ellipse(x + o.w / 2, GY, o.w / 2 + 10, 7, 0, 0, TAU); ctx.fill();
            soft(ctx, '#ffffff', x + o.w / 2, GY - 30 - (t * 30 % 30), 24, 0.25);
          } else {
            glow(ctx, '#ff6a1a', x + o.w / 2, GY - 30, 110, 0.7);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 5; k++) {
              const fx = x + 10 + k * 22, h = 60 + Math.sin(t * 11 + k * 1.9) * 16 + (k % 2) * 14;
              const g = ctx.createLinearGradient(0, GY, 0, GY - h);
              g.addColorStop(0, 'rgba(255,255,220,0.95)'); g.addColorStop(0.3, 'rgba(255,190,60,0.9)'); g.addColorStop(0.7, 'rgba(255,90,20,0.7)'); g.addColorStop(1, 'rgba(255,40,0,0)');
              ctx.fillStyle = g;
              const sw = Math.sin(t * 9 + k) * 5;
              ctx.beginPath(); ctx.moveTo(fx - 16, GY); ctx.quadraticCurveTo(fx - 14, GY - h * 0.55, fx + sw, GY - h); ctx.quadraticCurveTo(fx + 14, GY - h * 0.55, fx + 16, GY); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
            soft(ctx, '#2a2a33', x + o.w / 2 + Math.sin(t) * 10, GY - 110 - (t * 40 % 40), 40, 0.35);
          }
          break;
        case 'cone': RC.Site.cone(ctx, x, o); break;
        case 'mud': RC.Site.mud(ctx, x, o, t); break;
        case 'hook': RC.Site.hook(ctx, x, t); break;
        case 'ramp': {
          if (o.style === 'dirt') { RC.Site.dirtRamp(ctx, x, o); break; }
          // 강철 점프대
          ctx.fillStyle = '#2a303c';
          for (let k = 0; k < 4; k++) { const xx = x + 20 + k * 36, hh = o.h * (xx - x) / o.w; ctx.fillRect(xx - 2, GY - hh, 4, hh); }
          ctx.strokeStyle = '#3a4150'; ctx.lineWidth = 3; ctx.beginPath();
          for (let k = 0; k < 3; k++) { const x1 = x + 20 + k * 36, x2 = x1 + 36; ctx.moveTo(x1, GY); ctx.lineTo(x2, GY - o.h * (x2 - x) / o.w); } ctx.stroke();
          poly(ctx, [0, 0, o.w, -o.h, o.w, -o.h + 10, 0, 6], x, GY);
          ctx.fillStyle = chrome(ctx, GY - o.h, GY); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
          ctx.fillStyle = '#ffd23a';
          for (let k = 1; k < 5; k++) { const xx = x + k * o.w / 5, yy = GY - o.h * k / 5; poly(ctx, [-6, 2, 4, -1, 10, 6, 0, 9], xx, yy); ctx.fill(); }
          break;
        }
        case 'banana':
          if (o.hit) break;
          ctx.beginPath(); ctx.arc(x, GY - 16, 15, 0.25, Math.PI - 0.25); ctx.lineWidth = 9; ctx.strokeStyle = '#6b4a00'; ctx.stroke();
          ctx.lineWidth = 6; ctx.strokeStyle = '#ffd23a'; ctx.stroke();
          break;
        case 'monkey': monkey(ctx, x, o, t); break;
        case 'flag': finishGate(ctx, x, t, P); break;
      }
    }
    for (const f of R.flying) drawStar(ctx, f.x - cam, f.y, 16, t);
  }

  function monkey(ctx, x, o, t) {
    let y = GY;
    if (o.state === 'jump') y -= Math.max(0, Math.sin(Math.min(1, o.jumpT / 0.7) * Math.PI)) * 150;
    const wave = o.state === 'throw' ? Math.sin(t * 10) * 0.7 : Math.sin(t * 3) * 0.3;
    // 꼬리
    ctx.strokeStyle = '#3a4150'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 14, y - 36); ctx.quadraticCurveTo(x - 44, y - 40 + Math.sin(t * 4) * 6, x - 36, y - 70); ctx.stroke(); ctx.lineCap = 'butt';
    // 다리
    ctx.fillStyle = gunmetal(ctx, y - 24, y); rr(ctx, x - 14, y - 24, 10, 24, 4); ctx.fill(); rr(ctx, x + 4, y - 24, 10, 24, 4); ctx.fill();
    // 몸
    ctx.beginPath(); ctx.ellipse(x, y - 46, 22, 25, 0, 0, TAU); ctx.fillStyle = lin(ctx, 0, y - 71, 0, y - 21, [[0, '#b0703f'], [1, '#6b3f1f']]); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    rr(ctx, x - 12, y - 56, 24, 22, 8); ctx.fillStyle = chrome(ctx, y - 56, y - 34); ctx.fill();
    // 팔
    ctx.save(); ctx.translate(x + 18, y - 58); ctx.rotate(-1.2 + wave);
    rr(ctx, -5, -34, 10, 34, 5); ctx.fillStyle = gunmetal(ctx, -34, 0); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    // 머리
    for (const dx of [-19, 19]) { ctx.beginPath(); ctx.arc(x + dx, y - 82, 7, 0, TAU); ctx.fillStyle = '#8a5530'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y - 82, 19, 0, TAU); ctx.fillStyle = lin(ctx, 0, y - 101, 0, y - 63, [[0, '#c07d48'], [1, '#7a4a28']]); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    rr(ctx, x - 13, y - 88, 26, 16, 7); ctx.fillStyle = '#e8c49a'; ctx.fill();
    for (const dx of [-6, 6]) { ctx.beginPath(); ctx.arc(x + dx, y - 81, 3, 0, TAU); ctx.fillStyle = '#ff3030'; ctx.fill(); glow(ctx, '#ff3030', x + dx, y - 81, 9, 0.8); }
    ctx.beginPath(); ctx.moveTo(x, y - 101); ctx.lineTo(x + 4, y - 114); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    const on = Math.floor(t * 4) % 2; ctx.beginPath(); ctx.arc(x + 4, y - 116, 4, 0, TAU); ctx.fillStyle = on ? '#ff3030' : '#6b1d1d'; ctx.fill();
  }

  function finishGate(ctx, x, t, P) {
    const y = GY - 26;
    for (const dx of [-120, 120]) {
      rr(ctx, x + dx - 10, y - 220, 20, 220, 5); ctx.fillStyle = gunmetal(ctx, y - 220, y); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const on = (Math.floor(t * 8) + k) % 4 === 0;
        ctx.fillStyle = on ? '#ffe066' : '#6a5a2a'; ctx.fillRect(x + dx - 4, y - 206 + k * 24, 8, 10);
        if (on) glow(ctx, '#ffd23a', x + dx, y - 201 + k * 24, 18, 1);
      }
    }
    rr(ctx, x - 136, y - 262, 272, 46, 6); ctx.fillStyle = '#0d1322'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); rr(ctx, x - 132, y - 258, 264, 38, 4); ctx.clip();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 22; c++) { ctx.fillStyle = (r + c) % 2 ? '#ffffff' : '#1b1f2c'; ctx.fillRect(x - 132 + c * 12, y - 258 + r * 13, 12, 13); }
    ctx.restore();
    rr(ctx, x - 64, y - 252, 128, 26, 6); ctx.fillStyle = '#ff3b3b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '20px "Black Han Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('도착 FINISH', x, y - 238);
  }

  // ─── 효과 ────────────────────────────────────────────────
  function fx(ctx, R, cam) {
    for (const q of R.fx) {
      const a = Math.max(0, q.life / q.max);
      const x = q.x - cam;
      if (q.kind === 'spark') {
        glow(ctx, q.color, x, q.y, q.size * 3, a);
      } else if (q.kind === 'confetti') {
        ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = q.color;
        ctx.save(); ctx.translate(x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2); ctx.restore();
      } else if (q.kind === 'chunk') {
        ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.save(); ctx.translate(x, q.y); ctx.rotate(q.rot);
        ctx.fillStyle = lin(ctx, 0, -q.size / 2, 0, q.size / 2, [[0, shade(q.color, 1.3)], [1, shade(q.color, 0.7)]]);
        ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.strokeRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7);
        ctx.restore();
      } else if (q.kind === 'flame') {
        glow(ctx, '#ff8a1a', x, q.y, q.size * 2, a);
      } else {
        soft(ctx, q.kind === 'steam' ? '#dfe8f2' : q.kind === 'dust' ? '#c9c2b4' : q.color, x, q.y, q.size * 1.6, a * 0.8);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ─── 화면 전용 입자 (배기·바퀴 먼지·착지 불꽃·발 먼지) ─────────
  // 규칙(run.js)과 상관없는 꾸밈이라 카메라 상태(K.pf)에 따로 둔다.
  function puffAdd(K, x, y, vx, vy, life, size, kind, color) {
    if (K.pf.length > 90) K.pf.shift();
    K.pf.push({ x, y, vx, vy, life, max: life, size, kind, color });
  }
  function emit(K, R, dt, P, speed) {
    const c = R.car, low = RC.Draw.low;
    const dust = R.course && R.course.id === 'site' ? mix(RC.Site.dust, '#4a4458', P.wn * 0.7) : mix(P.side, '#ffffff', 0.15);
    K.em = (K.em || 0) + dt;
    const step = low ? 0.1 : 0.05;
    while (K.em > step) {
      K.em -= step;
      if (c.fall) continue;
      const r = Math.random();
      if (c.form === 'car') {
        // 배기: 뒤꽁무니에서 옅은 연기 (밤엔 푸르스름)
        puffAdd(K, c.x - 92, c.y - 24 + r * 4, -30 - r * 40, -18 - r * 20, 0.55, 5 + r * 3, 'smoke', mix('#b9c0cc', '#6d7aa6', P.wn));
        // 바퀴 먼지: 땅에 있고 빠를수록 짙게
        if (c.onGround && R.t > 0 && speed > D.RUN.speed * 0.9) puffAdd(K, c.x - 52 + r * 10, GY - 3, -60 - r * 60, -30 - r * 40, 0.45, 5 + r * 4, 'dust', dust);
      } else if (c.onGround) {
        // 로봇 발 먼지: 보폭에 맞춰
        if (Math.sin(c.x * 0.045) > 0.6) puffAdd(K, c.x - 10 + r * 20, GY - 2, -50 - r * 40, -40 - r * 30, 0.4, 6 + r * 4, 'dust', dust);
      }
    }
  }
  function burst(K, x, y, heavy) {
    for (let i = 0; i < (heavy ? 12 : 7); i++) {
      const a = Math.PI + (Math.random() - 0.5) * 0.9, sp = 120 + Math.random() * 220;
      puffAdd(K, x + (Math.random() - 0.5) * 120, y - 2, Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), -40 - Math.random() * 80, 0.5, 8 + Math.random() * 6, 'dust', '#d6d0c4');
    }
    for (let i = 0; i < (heavy ? 10 : 6); i++) {
      const dir = i % 2 ? 1 : -1;
      puffAdd(K, x + dir * 40, y - 2, dir * (260 + Math.random() * 300), -120 - Math.random() * 220, 0.35 + Math.random() * 0.2, 2.5, 'spark', '#ffc96a');
    }
  }
  function particles(ctx, K, cam, dt) {
    if (!K.pf.length) return;
    for (const q of K.pf) {
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.kind === 'spark') q.vy += 900 * dt; else { q.vx *= 1 - dt * 2.5; q.vy *= 1 - dt * 2; }
    }
    K.pf = K.pf.filter(q => q.life > 0);
    for (const q of K.pf) {
      const k = q.life / q.max, x = q.x - cam;
      if (q.kind === 'spark') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
        ctx.strokeStyle = q.color; ctx.lineWidth = q.size; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, q.y); ctx.lineTo(x - q.vx * 0.03, q.y - q.vy * 0.03); ctx.stroke();
        ctx.restore();
      } else {
        const grow = 1 + (1 - k) * (q.kind === 'smoke' ? 2.4 : 1.6);
        soft(ctx, q.color, x, q.y, q.size * grow * 1.6, (q.kind === 'smoke' ? 0.32 : 0.5) * k);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 새 떼 (낮·노을): 멀리서 천천히 지나간다
  function birds(ctx, P, cam, vw, t) {
    const a = 1 - P.wn;
    if (a <= 0.02) return;
    const span = vw + 600;
    const bx = ((t * 38 - cam * 0.03) % span + span) % span - 300;
    ctx.save(); ctx.globalAlpha = a * 0.75; ctx.strokeStyle = mix('#2a3550', '#3a2238', P.ws); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 6; i++) {
      const x = bx + [0, -26, -30, -54, -60, -86][i], y = 150 + [0, -12, 12, -22, 20, -8][i] + Math.sin(t * 1.3 + i) * 3;
      const f = Math.sin(t * 9 + i * 1.7), w = 9 - (i % 3);
      ctx.beginPath(); ctx.moveTo(x - w, y - f * 5); ctx.quadraticCurveTo(x - w * 0.4, y - 3 - f * 3, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - 3 - f * 3, x + w, y - f * 5); ctx.stroke();
    }
    ctx.restore();
  }

  // 노을 빛줄기: 해에서 천천히 도는 옅은 빛살 (건물 뒤)
  function godRays(ctx, P, vw, t) {
    const a = P.ws * (1 - P.wn);
    if (a <= 0.02) return;
    const sx = vw * (0.68 - P.ws * 0.14), sy = 120 + P.ws * 200;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, sy, 20, sx, sy, 620);
    g.addColorStop(0, 'rgba(255,190,110,' + 0.22 * a + ')'); g.addColorStop(1, 'rgba(255,150,90,0)');
    ctx.fillStyle = g;
    for (let i = 0; i < 9; i++) {
      const ang = t * 0.03 + i * TAU / 9 + Math.sin(i * 3.1) * 0.2, w = 0.06 + (i % 3) * 0.03;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ang - w) * 700, sy + Math.sin(ang - w) * 700);
      ctx.lineTo(sx + Math.cos(ang + w) * 700, sy + Math.sin(ang + w) * 700);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ─── 카메라 ──────────────────────────────────────────────
  function camOf(R, vw) {
    if (!R._cam) R._cam = { x: R.car.x - vw * 0.28, zoom: 1, shake: 0, flash: 0, last: performance.now(), land: 0, ui: [], pf: [] };
    return R._cam;
  }
  // main.js가 사건마다 불러 준다 (흔들림·섬광·HUD로 날아가는 별)
  function fxEvent(R, ev, vw) {
    const K = camOf(R, vw || 1000);
    if (ev === 'smash') K.shake = Math.max(K.shake, 9);
    else if (ev === 'bump') K.shake = Math.max(K.shake, 6);
    else if (ev === 'land') { K.shake = Math.max(K.shake, 3); K.land = 0.25; burst(K, R.car.x, GY, R.car.vy > 900 || R.car.form === 'robot'); }
    else if (ev === 'ramp') burst(K, R.car.x + 40, R.car.y, false);
    else if (ev === 'transform') { K.shake = Math.max(K.shake, 7); K.flash = 0.45; }
    else if (ev === 'go') { K.shake = Math.max(K.shake, 5); for (let i = 0; i < 10; i++) puffAdd(K, R.car.x - 60 + Math.random() * 30, GY - 4, -120 - Math.random() * 200, -30 - Math.random() * 60, 0.7, 8 + Math.random() * 6, 'dust', '#cfd3da'); }
    else if (ev === 'cone') K.shake = Math.max(K.shake, 2.5);
    else if (ev === 'splash') { K.shake = Math.max(K.shake, 3); for (let i = 0; i < 8; i++) puffAdd(K, R.car.x - 20 + Math.random() * 40, GY - 4, (Math.random() - 0.3) * 260, -120 - Math.random() * 160, 0.5, 5 + Math.random() * 4, 'dust', '#6a4424'); }
    else if (ev === 'pop') K.shake = Math.max(K.shake, 4);
    else if (ev === 'star' && R.lastStar) K.ui.push({ wx: R.lastStar.x, wy: R.lastStar.y, t: 0 });
  }
  let hud = { x: 60, y: 40 };
  function setHud(x, y) { hud = { x, y }; }

  function drawRun(ctx, R, vw) {
    const theme = R.course && R.course.id === 'site' ? 'site' : 'city';
    const T = ensureTiles(theme);
    const c = R.car;
    const K = camOf(R, vw);
    const now = performance.now();
    const dt = Math.min(0.05, (now - K.last) / 1000); K.last = now;
    const speed = RC.Run.speedOf(R);
    const fast = speed > D.RUN.speed * 1.3;
    const targetX = c.x - vw * 0.28 + (fast ? 60 : 0);
    K.x += (targetX - K.x) * Math.min(1, dt * 6);
    const high = c.y < GY - 170;
    const targetZ = c.morph > 0 ? 1.12 : high ? 0.9 : 1;
    K.zoom += (targetZ - K.zoom) * Math.min(1, dt * 4);
    K.shake = Math.max(0, K.shake - dt * 30); K.flash = Math.max(0, K.flash - dt); K.land = Math.max(0, K.land - dt);
    const cam = K.x, t = R.t;
    const P = palAt(Math.min(1, c.x / R.level.length));
    const lw = layerWeights(P.ws, P.wn);

    // 배경 (카메라 확대 영향 없음)
    const low = RC.Draw.low;
    sky(ctx, P, vw, t);
    if (!low) { godRays(ctx, P, vw, t); clouds(ctx, P, cam, vw, t, lw); birds(ctx, P, cam, vw, t); }
    drawLayer(ctx, T.far, lw, cam, 0.12, GY - 26 - 330 + 20, 330, vw);
    drawLayer(ctx, T.mid, lw, cam, 0.38, GY - 26 - 360 + 10, 360, vw);

    // 월드 (확대·흔들림)
    ctx.save();
    const fx0 = c.x - cam, fy0 = c.y - 60;
    const sh = K.shake;
    ctx.translate(fx0 + (Math.random() - 0.5) * sh, fy0 + (Math.random() - 0.5) * sh);
    ctx.scale(K.zoom, K.zoom);
    ctx.translate(-fx0, -fy0);
    if (theme === 'site') RC.Site.props(ctx, P, cam, vw, t); else props(ctx, P, cam, vw, t);
    road(ctx, P, cam, vw, R.level.pits, theme);
    items(ctx, R, cam, vw, t, P);

    // 입자: 차 뒤에 그려서 연기가 차체를 덮지 않게
    if (!R.freeze) emit(K, R, dt, P, speed);
    particles(ctx, K, cam, R.freeze ? 0 : dt);
    // 차 그림자
    const cx = c.x - cam;
    if (!c.fall) {
      const h = Math.max(0, GY - c.y);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.38 * Math.max(0.15, 1 - h / 300)) + ')';
      ctx.beginPath(); ctx.ellipse(cx, GY + 2, 80 * Math.max(0.5, 1 - h / 500), 9, 0, 0, TAU); ctx.fill();
    }
    // 밤 전조등 빛
    if (P.lamps > 0.2 && c.form === 'car') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = P.lamps * 0.35;
      ctx.fillStyle = lin(ctx, cx + 80, 0, cx + 420, 0, [[0, 'rgba(255,240,200,0.9)'], [1, 'rgba(255,240,200,0)']]);
      poly(ctx, [80, -24, 420, -70, 420, 30, 80, -14], cx, c.y - 4); ctx.fill();
      ctx.restore();
    }
    // 기울기: 공중에서는 속도 방향으로, 경사로에서는 경사를 따라
    let tilt = 0;
    const onRamp = R.level.items.find(o => o.type === 'ramp' && c.x >= o.x && c.x <= o.x + o.w);
    if (onRamp && c.onGround) tilt = -Math.atan(onRamp.h / onRamp.w);
    else if (!c.onGround) tilt = Math.max(-0.3, Math.min(0.3, c.vy / 2600));
    const spin = c.spin > 0 ? (1 - c.spin / 0.9) * TAU : 0;
    C.drawBot(ctx, R.cfg, cx, c.y, {
      t, form: c.form, morph: c.morph, thrust: c.thrusting, glide: c.gliding, spin, tilt: c.form === 'car' ? tilt : 0,
      bounce: c.bump > 0 ? Math.sin(c.bump * 40) * 4 : R.t === 0 ? Math.abs(Math.sin(now * 0.028)) * 1.6 : (c.onGround && c.form === 'car' ? Math.sin(c.x * 0.09) * 0.9 + Math.sin(c.x * 0.031) * 0.6 : 0), squash: K.land > 0 ? Math.sin(K.land / 0.25 * Math.PI) : 0,
      dist: c.x, speed, running: c.onGround, air: !c.onGround, punch: c.punch,
    });
    // 능력 연출
    if (c.form === 'robot' && R.body.ability === 'water' && c.robotT > D.RUN.robotTime - 0.9) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const [w, a] of [[16, 0.25], [8, 0.6]]) {
        ctx.strokeStyle = 'rgba(120,210,255,' + a + ')'; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(cx + 60, c.y - 118); ctx.quadraticCurveTo(cx + 320, c.y - 200, cx + 560, c.y - 6); ctx.stroke();
      }
      ctx.restore();
    }
    if (c.form === 'robot' && R.body.ability === 'siren') {
      for (let i = 0; i < 2; i++) {
        const k = ((t * 1.4) + i * 0.5) % 1;
        ctx.strokeStyle = (i ? 'rgba(80,140,255,' : 'rgba(255,70,80,') + (1 - k) * 0.8 + ')'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx, c.y - 190, 30 + k * 260, 0, TAU); ctx.stroke();
      }
    }
    if (c.form === 'robot' && R.body.ability === 'dash') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(255,90,60,' + (0.25 - i * 0.045) + ')'; ctx.fillRect(cx - 60 - i * 40, c.y - 150 + i * 6, 50, 110 - i * 12); }
      ctx.restore();
    }
    fx(ctx, R, cam);
    if (!low) { if (theme === 'site') RC.Site.foreground(ctx, P, cam, vw); else foreground(ctx, P, cam, vw); }
    ctx.restore();

    // 속도선
    if (fast || c.hop > 0 || (!c.onGround && c.vy < -600)) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const r = RC.rng(Math.floor(t * 20));
      for (let i = 0; i < 14; i++) {
        const y = r() * 600, len = 80 + r() * 200, x = (vw + 200) - ((t * 2200 + i * 170) % (vw + 400));
        ctx.fillStyle = 'rgba(255,255,255,' + (0.08 + r() * 0.12) + ')'; ctx.fillRect(x, y, len, 2);
      }
      ctx.restore();
    }
    // HUD로 날아가는 별
    for (const u of K.ui) {
      u.t += dt;
      const k = Math.min(1, u.t / 0.55), e = k * k;
      const sx0 = u.wx - cam, sy0 = u.wy;
      const x = sx0 + (hud.x - sx0) * e, y = sy0 + (hud.y - sy0) * e - Math.sin(k * Math.PI) * 60;
      ctx.save(); ctx.translate(x, y); ctx.scale(0.35 - k * 0.12, 0.35 - k * 0.12); ctx.drawImage(starImg(), -48, -48); ctx.restore();
    }
    K.ui = K.ui.filter(u => u.t < 0.55);
    post(ctx, P, vw);
    if (K.flash > 0) { ctx.fillStyle = 'rgba(210,245,255,' + Math.min(0.6, K.flash) + ')'; ctx.fillRect(0, 0, vw, 600); }
  }

  // 가장자리 어둡게 + 시간대 색감: 한 장으로 합쳐 두고 한 번만 찍는다
  const vig = { key: '', c: null };
  function post(ctx, P, vw) {
    const key = Math.round(P.ws * 20) + ':' + Math.round(P.wn * 20);
    if (vig.key !== key) {
      const c = vig.c || document.createElement('canvas'); c.width = 400; c.height = 240;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 400, 240);
      if (P.ws > 0 && P.wn < 1) { g.fillStyle = 'rgba(255,120,60,' + (0.07 * P.ws * (1 - P.wn)) + ')'; g.fillRect(0, 0, 400, 240); }
      if (P.wn > 0) { g.fillStyle = 'rgba(20,30,90,' + (0.12 * P.wn) + ')'; g.fillRect(0, 0, 400, 240); }
      const gr = g.createRadialGradient(200, 120, 60, 200, 120, 240);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,10,0.42)');
      g.fillStyle = gr; g.fillRect(0, 0, 400, 240);
      vig.key = key; vig.c = c;
    }
    ctx.drawImage(vig.c, 0, 0, vw, 600);
  }

  // ─── 쇼룸 (차고) ─────────────────────────────────────────
  // st: {form, morph, bounce, ty, scale, night}
  function drawShowroom(ctx, cfg, vw, t, st) {
    const ty = st.ty, night = !!st.night;
    // 벽
    ctx.fillStyle = lin(ctx, 0, 0, 0, ty, night ? [[0, '#05070f'], [1, '#101634']] : [[0, '#070b18'], [1, '#18223f']]);
    ctx.fillRect(0, 0, vw, ty + 2);
    // 벽 패널 줄
    ctx.strokeStyle = 'rgba(120,160,255,0.07)'; ctx.lineWidth = 2;
    for (let x = (vw / 2) % 120; x < vw; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ty); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, ty - 120); ctx.lineTo(vw, ty - 120); ctx.stroke();
    if (night) {
      // 창문과 달빛
      rr(ctx, vw * 0.14, 70, 160, 120, 6); ctx.fillStyle = '#15204d'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#2a3150'; ctx.stroke();
      ctx.fillStyle = '#2a3150'; ctx.fillRect(vw * 0.14 + 77, 70, 6, 120); ctx.fillRect(vw * 0.14, 127, 160, 6);
      ctx.beginPath(); ctx.arc(vw * 0.14 + 115, 105, 18, 0, TAU); ctx.fillStyle = '#f2f5ff'; ctx.fill();
      glow(ctx, '#9fb8ff', vw * 0.14 + 115, 105, 70, 0.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.08; ctx.fillStyle = '#9fb8ff';
      poly(ctx, [0, 0, 160, 0, 420, ty - 60, 260, ty - 60], vw * 0.14, 190); ctx.fill(); ctx.restore();
    } else {
      // 로고 판
      ctx.save(); ctx.globalAlpha = 0.9;
      ctx.font = '64px "Black Han Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(80,140,255,0.12)'; ctx.fillText('ROBO GARAGE', vw / 2, 90);
      ctx.restore();
    }
    // 스포트라이트
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [sx, col] of [[vw / 2 - 260, night ? '#1a3a7a' : '#2f7bff'], [vw / 2 + 260, night ? '#3a2a6a' : '#ff7a2f']]) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, ty, [[0, rgba(col, 0.35)], [1, rgba(col, 0)]]);
      poly(ctx, [-20, 0, 20, 0, (vw / 2 - sx) + 170, ty, (vw / 2 - sx) - 170, ty], sx, 0); ctx.fill();
    }
    ctx.restore();
    glow(ctx, night ? '#2a4a9a' : '#39d8ff', vw / 2 - 150, ty - 70, 200, night ? 0.25 : 0.35);
    glow(ctx, night ? '#4a2a7a' : '#ff8a3a', vw / 2 + 170, ty - 60, 200, night ? 0.2 : 0.3);
    // 바닥
    ctx.fillStyle = lin(ctx, 0, ty, 0, 600, [[0, night ? '#0b1026' : '#141b33'], [1, '#05070d']]);
    ctx.fillRect(0, ty, vw, 600 - ty);
    // 회전판
    ctx.beginPath(); ctx.ellipse(vw / 2, ty + 6, 230, 40, 0, 0, TAU); ctx.fillStyle = lin(ctx, 0, ty - 34, 0, ty + 46, [[0, '#3a4358'], [1, '#12161f']]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(vw / 2, ty, 214, 32, 0, 0, TAU); ctx.fillStyle = lin(ctx, 0, ty - 32, 0, ty + 32, [[0, '#2a3246'], [1, '#161b28']]); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = night ? 'rgba(90,120,255,0.5)' : 'rgba(57,216,255,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(vw / 2, ty, 214, 32, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 8; ctx.strokeStyle = night ? 'rgba(90,120,255,0.12)' : 'rgba(57,216,255,0.25)'; ctx.stroke();
    // 돌아가는 눈금
    ctx.strokeStyle = 'rgba(57,216,255,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = t * 0.6 + i * TAU / 24;
      if (Math.sin(a) < 0) continue;
      ctx.beginPath(); ctx.moveTo(vw / 2 + Math.cos(a) * 190, ty + Math.sin(a) * 28); ctx.lineTo(vw / 2 + Math.cos(a) * 206, ty + Math.sin(a) * 30); ctx.stroke();
    }
    ctx.restore();

    const sc = st.scale, cx = vw / 2;
    // 부품을 바꾸면 회전판에서 빛 고리가 퍼지고 불꽃이 튄다
    if (st.pop > 0) {
      const k = 1 - st.pop;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(120,230,255,' + st.pop * 0.9 + ')'; ctx.lineWidth = 6 * st.pop + 1;
      ctx.beginPath(); ctx.ellipse(vw / 2, ty, 120 + k * 200, 18 + k * 34, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,170,80,' + st.pop * 0.6 + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(vw / 2, ty, 80 + k * 140, 12 + k * 22, 0, 0, TAU); ctx.stroke();
      const r = RC.rng(5);
      for (let i = 0; i < 16; i++) {
        const a = r() * TAU, sp = 0.6 + r() * 0.8;
        const px = vw / 2 + Math.cos(a) * (60 + k * 240 * sp), py = ty - 20 - k * (80 + r() * 140) + k * k * 90 + Math.sin(a) * 20;
        glow(ctx, i % 3 ? '#8fe8ff' : '#ffc96a', px, py, 10 * st.pop + 4, st.pop);
      }
      ctx.restore();
    }
    const hop = Math.sin((st.bounce || 0) * Math.PI) * 18;
    const o = { t, form: st.form, morph: st.morph, dist: t * 20, running: false, sleep: night, speed: 0 };
    // 바닥 반사
    ctx.save();
    ctx.beginPath(); ctx.rect(0, ty, vw, 600 - ty); ctx.clip();
    ctx.globalAlpha = 0.22;
    ctx.translate(cx, ty); ctx.scale(sc, -sc * 0.9); ctx.translate(-cx, -ty);
    C.drawBot(ctx, cfg, cx, ty - hop, o);
    ctx.restore();
    ctx.fillStyle = lin(ctx, 0, ty, 0, ty + 160, [[0, 'rgba(10,14,26,0)'], [1, 'rgba(10,14,26,0.95)']]);
    ctx.fillRect(0, ty + 20, vw, 160);
    // 그림자 + 본체
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(cx, ty + 2, 150 * sc / 1.8, 12, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(cx, ty); ctx.scale(sc, sc); ctx.translate(-cx, -ty);
    C.drawBot(ctx, cfg, cx, ty - hop, o);
    ctx.restore();

    if (night) {
      // 충전 케이블 + 흐르는 빛
      const px = cx - 150 * sc / 1.8 - 60;
      ctx.strokeStyle = '#1b1f2c'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(40, ty - 140); ctx.bezierCurveTo(120, ty + 30, px - 40, ty + 20, px + 40, ty - 40); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const k = ((t * 0.5) + i / 4) % 1;
        const bx = (1 - k) ** 3 * 40 + 3 * (1 - k) ** 2 * k * 120 + 3 * (1 - k) * k * k * (px - 40) + k ** 3 * (px + 40);
        const by = (1 - k) ** 3 * (ty - 140) + 3 * (1 - k) ** 2 * k * (ty + 30) + 3 * (1 - k) * k * k * (ty + 20) + k ** 3 * (ty - 40);
        glow(ctx, '#3aff9a', bx, by, 16, 0.9);
      }
      rr(ctx, 20, ty - 170, 40, 60, 6); ctx.fillStyle = gunmetal(ctx, ty - 170, ty - 110); ctx.fill();
      ctx.fillStyle = '#3aff9a'; ctx.fillRect(30, ty - 160, 20, 6 + (Math.sin(t * 2) + 1) * 12);
      // Zzz
      ctx.fillStyle = '#cfe0ff'; ctx.font = '34px "Black Han Sans", sans-serif'; ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) { const k = ((t * 0.45 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.fillText('Z', cx + 120 + k * 60 + i * 6, ty - 140 - k * 90); }
      ctx.globalAlpha = 1;
    }
    // 떠다니는 먼지
    ctx.fillStyle = 'rgba(200,230,255,0.5)';
    const r = RC.rng(12);
    for (let i = 0; i < 30; i++) { const x = (r() * vw + t * (6 + r() * 10)) % vw, y = (r() * ty + Math.sin(t + i) * 10); ctx.globalAlpha = 0.2 + 0.3 * Math.abs(Math.sin(t + i)); ctx.fillRect(x, y, 2, 2); }
    ctx.globalAlpha = 1;
  }

  RC.Draw = {
    low: false, // 느린 기기에서 main.js가 켠다 (구름·전경 생략)
    drawRun, drawShowroom, fxEvent, setHud, drawStar, starImg,
    drawCar: C.drawCar, drawRobot: C.drawRobot, drawBot: C.drawBot, GY,
  };
})(RC);
