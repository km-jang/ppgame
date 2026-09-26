'use strict';
// 네온 시티 코스 그리기: 늘 밤. 빛나는 테두리 빌딩·네온 간판 배경, 반짝이는 길,
// 네온 가로등·홀로그램 광고판·빛 나무, 빛나는 상자·방호벽·점프대·가속 발판·불빛 터널·결승 문.
// N-GUN 색(청록 #39d8ff · 분홍 #ff2e88 · 노랑 #ffd23a)을 빌려 오고, 재질은 로봇카 방향(광택·금속)을 따른다.
// scene.js가 코스가 'neon'일 때 부른다. RC.Neon이 없으면 도시 그림으로 대신 그린다.
// 성능: 번짐(shadowBlur)은 미리 그리는 그림(타일·스프라이트)에서만 쓰고, 매 프레임은 찍기만 한다.
(function (RC) {
  const A = RC.Art, D = RC.DATA;
  const { TAU, shade, mix, rgba, rr, poly, lin, glow, soft } = A;
  const GY = D.RUN.groundY;
  const CY = '#39d8ff', CY2 = '#5ee7ff', PK = '#ff2e88', PK2 = '#ff4fa3', YL = '#ffd23a', VI = '#9b6bff';
  const FONT = '"Black Han Sans", "Noto Sans KR", sans-serif';
  const isLow = () => !!(RC.Draw && RC.Draw.low);
  // 글꼴이 늦게 오면 글자가 든 스프라이트를 한 번 다시 그린다
  // (document.fonts.check는 느려서 1초에 한 번만 묻고, 한 번 준비되면 다시 묻지 않는다)
  let fontState = 'n', fontAt = -1e9;
  function fontKey() {
    if (fontState === 'f') return fontState;
    const now = performance.now();
    if (now - fontAt < 1000) return fontState;
    fontAt = now;
    try { fontState = !document.fonts || document.fonts.check('20px "Black Han Sans"') ? 'f' : 'n'; } catch (e) { fontState = 'f'; }
    return fontState;
  }

  // ─── 스프라이트 캐시 ─────────────────────────────────────
  // w·h는 논리 크기, ox·oy는 기준점(그릴 때 x·y가 가리키는 곳)이 스프라이트 안에서 어디인지
  const SPR = {};
  const SS = 2;
  // q: 해상도 배율 (부드러운 빛은 낮게 그려도 티가 안 나고 찍기가 빠르다)
  function sprite(key, w, h, ox, oy, draw, q) {
    let c = SPR[key];
    if (c) return c;
    const k = q || SS;
    c = document.createElement('canvas');
    c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
    const g = c.getContext('2d');
    g.scale(k, k); g.translate(ox, oy);
    draw(g);
    c.lw = w; c.lh = h; c.ox = ox; c.oy = oy;
    SPR[key] = c;
    return c;
  }
  function stamp(ctx, c, x, y) { ctx.drawImage(c, x - c.ox, y - c.oy, c.lw, c.lh); }
  function stampAdd(ctx, c, x, y, a) {
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * (a == null ? 1 : a);
    ctx.drawImage(c, x - c.ox, y - c.oy, c.lw, c.lh);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }

  // 네온 관: 번진 바깥 빛 + 흰빛이 도는 가는 심지 (미리 그릴 때만 쓴다)
  function tube(g, color, width, blur, scale) {
    const k = scale || SS;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = color; g.shadowBlur = (blur == null ? 10 : blur) * k;
    g.strokeStyle = color; g.lineWidth = width; g.stroke();
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = mix(color, '#ffffff', 0.65); g.lineWidth = Math.max(0.8, width * 0.4); g.stroke();
    g.restore();
  }
  function neonText(g, txt, x, y, size, color, blur, scale) {
    const k = scale || SS;
    g.save();
    g.font = size + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = (blur == null ? 12 : blur) * k;
    g.fillStyle = color; g.fillText(txt, x, y); g.fillText(txt, x, y);
    g.shadowBlur = 0;
    g.fillStyle = mix(color, '#ffffff', 0.7); g.fillText(txt, x, y);
    g.restore();
  }

  // ─── 하늘: 남색 그라디언트 · 격자 · 별 · 빛나는 고리 달 ────────────
  const skyC = { key: '', c: null };
  // 화면 배율(Q) 그대로 그려 두면 찍을 때 늘이지 않아 빠르다. 길이 덮는 460 아래는 그리지 않는다
  function buildSky(vw, Q, key) {
    const W = Math.ceil(vw * Q), H = Math.ceil(460 * Q);
    const c = skyC.c || document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.setTransform(Q, 0, 0, Q, 0, 0);
    g.fillStyle = lin(g, 0, 0, 0, 600, [[0, '#02030b'], [0.35, '#060b24'], [0.62, '#0f1240'], [0.78, '#2a1558'], [0.9, '#4a1a62'], [1, '#6a2068']]);
    g.fillRect(0, 0, vw, 600);
    // 윗하늘 격자 (N-GUN 배경처럼 아주 옅게)
    g.strokeStyle = 'rgba(94,231,255,0.05)'; g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= vw; x += 80) { g.moveTo(x, 0); g.lineTo(x, 330); }
    for (let y = 10; y <= 330; y += 80) { g.moveTo(0, y); g.lineTo(vw, y); }
    g.stroke();
    // 위로 갈수록 격자가 흐려지게 덮기
    g.fillStyle = lin(g, 0, 0, 0, 330, [[0, 'rgba(2,3,11,0.85)'], [1, 'rgba(2,3,11,0)']]);
    g.fillRect(0, 0, vw, 330);
    // 지평선 원근 격자 (빌딩 사이로 보인다)
    const hz = 340, vx = vw / 2;
    g.strokeStyle = 'rgba(255,79,163,0.22)'; g.lineWidth = 2;
    g.beginPath();
    for (let i = -24; i <= 24; i++) { g.moveTo(vx + i * 12, hz); g.lineTo(vx + i * 150, 600); }
    for (let k = 0; k < 9; k++) { const y = hz + Math.pow(k / 8, 2) * (600 - hz); g.moveTo(0, y); g.lineTo(vw, y); }
    g.stroke();
    g.fillStyle = lin(g, 0, hz - 40, 0, hz + 6, [[0, 'rgba(255,46,136,0)'], [1, 'rgba(255,46,136,0.35)']]);
    g.fillRect(0, hz - 40, vw, 46);
    // 빛 안개 · 달 빛 번짐 (미리 그려 둔다)
    for (let i = 0; i < 3; i++) soft(g, i === 1 ? '#3a1a7a' : '#1a2a7a', vw * (0.15 + i * 0.33), 250 + i * 40, 230, 0.2);
    glow(g, PK, vw * 0.74, 150, 150, 0.25);
    // 별
    const r = RC.rng(7);
    for (let i = 0; i < Math.round(vw / 8); i++) {
      const x = r() * vw, y = r() * 300, s = r() < 0.15 ? 4 : 2.4;
      g.fillStyle = r() < 0.2 ? 'rgba(160,230,255,' + (0.4 + r() * 0.5) + ')' : 'rgba(255,255,255,' + (0.25 + r() * 0.5) + ')';
      g.fillRect(x, y, s, s);
    }
    // 커다란 고리 달: 줄무늬 원판 + 청록 고리
    const mx = vw * 0.74, my = 150, mr = 66;
    g.save();
    g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip();
    g.fillStyle = lin(g, 0, my - mr, 0, my + mr, [[0, '#ffd23a'], [0.5, '#ff4fa3'], [1, '#7a1a8a']]);
    g.globalAlpha = 0.55; g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    g.globalAlpha = 1; g.fillStyle = '#0f1240';
    for (let k = 0; k < 6; k++) { const y = my + 8 + k * 11, h = 2 + k * 1.3; g.fillRect(mx - mr, y, mr * 2, h); }
    g.restore();
    g.beginPath(); g.ellipse(mx, my, mr + 34, 16, -0.25, 0, TAU);
    tube(g, CY, 3, 10, Q);
    g.beginPath(); g.arc(mx, my, mr + 2, 0, TAU);
    g.strokeStyle = 'rgba(255,79,163,0.5)'; g.lineWidth = 2; g.stroke();
    skyC.key = key; skyC.c = c;
  }
  function sky(ctx, P, vw, t, cam) {
    let q = 1;
    try { q = ctx.getTransform().a || 1; } catch (e) { q = 1; }
    q = Math.max(0.5, Math.min(2.5, Math.round(q * 4) / 4));
    const key = Math.round(vw) + ':' + q;
    if (skyC.key !== key) buildSky(vw, q, key);
    ctx.drawImage(skyC.c, 0, 0, vw, 460);
    // 반짝이는 별 몇 개 (움직이는 것은 이것뿐: 달·안개는 미리 그려 둔 그림)
    for (let i = 0; i < 9; i++) {
      const a = 0.5 + 0.5 * Math.sin(t * (1.3 + i * 0.37) + i * 2.1);
      const x = ((i * 377 + 90) % 1000) / 1000 * vw, y = 30 + ((i * 131) % 230);
      glow(ctx, i % 3 ? '#cfefff' : PK2, x, y, 8, a * 0.9);
    }
  }

  // ─── 먼 층: 얇은 네온 테두리 빌딩 실루엣 ──────────────────────
  function buildFar(P, W, H, g) {
    const rand = RC.rng(53);
    const RES = 1.25;
    const edge = [CY, VI, PK2, CY, VI];
    for (let x = 14; ; ) {
      const w = 44 + rand() * 80;
      if (x + w > W - 14) break;
      const h = 90 + rand() * 200, top = H - h;
      const kind = rand();
      g.fillStyle = lin(g, 0, top, 0, H, [[0, '#101741'], [1, '#0a0f2c']]);
      // 윤곽: 평평 · 계단 · 뾰족
      g.beginPath();
      g.moveTo(x, H); g.lineTo(x, top);
      if (kind < 0.3) { g.lineTo(x + w * 0.25, top); g.lineTo(x + w * 0.25, top - 22); g.lineTo(x + w * 0.75, top - 22); g.lineTo(x + w * 0.75, top); }
      else if (kind < 0.5) { g.lineTo(x + w / 2, top - 34); }
      g.lineTo(x + w, top); g.lineTo(x + w, H);
      g.fill();
      g.globalAlpha = 0.55; tube(g, edge[Math.floor(rand() * edge.length)], 1.4, 5, RES); g.globalAlpha = 1;
      // 창문 불빛: 청록·분홍·노랑이 섞여 있다
      for (let wy = top + 12; wy < H - 16; wy += 11) for (let wx = x + 6; wx < x + w - 7; wx += 9) {
        const q = rand();
        if (q < 0.2) { g.fillStyle = rgba([CY2, PK2, YL, '#cfe8ff'][Math.floor(rand() * 4)], 0.55); g.fillRect(wx, wy, 4, 5); }
      }
      // 안테나 깜빡이 (그려 둔 빛)
      if (rand() < 0.4) {
        const ax = x + w * (0.3 + rand() * 0.4), ah = 20 + rand() * 40, at = (kind >= 0.3 && kind < 0.5) ? top - 34 : top - (kind < 0.3 ? 22 : 0);
        g.fillStyle = '#1a2150'; g.fillRect(ax - 1, at - ah, 2, ah);
        const col = rand() < 0.5 ? '#ff3b5c' : PK2;
        g.fillStyle = rgba(col, 0.3); g.beginPath(); g.arc(ax, at - ah, 7, 0, TAU); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(ax, at - ah, 2.4, 0, TAU); g.fill();
      }
      x += w + 6 + rand() * 30;
    }
    // 아래쪽 보랏빛 안개띠 (가까운 층과 떨어져 보이게)
    g.fillStyle = lin(g, 0, H - 120, 0, H, [[0, 'rgba(120,40,170,0)'], [1, 'rgba(120,40,170,0.45)']]);
    g.fillRect(0, H - 120, W, 120);
  }

  // ─── 가까운 층: 빛나는 모서리 빌딩 · 네온 간판 · 가게 ─────────────
  function sign(g, kind, x, top, w, h, rand, RES) {
    const cols = [CY, PK, YL, CY2, PK2];
    const col = cols[Math.floor(rand() * cols.length)];
    const k = kind % 5;
    if (k === 0) {
      // 옥상 가로 간판
      const sw = Math.min(w - 16, 120), sx = x + (w - sw) / 2, sy = top - 50;
      g.fillStyle = '#1a1f2c'; g.fillRect(sx + 12, sy + 34, 3, 16); g.fillRect(sx + sw - 15, sy + 34, 3, 16);
      rr(g, sx, sy, sw, 36, 5); g.fillStyle = '#080b1c'; g.fill();
      rr(g, sx, sy, sw, 36, 5); tube(g, col, 2.4, 9, RES);
      neonText(g, ['ROBO', 'TURBO', 'GO!'][Math.floor(rand() * 3)], sx + sw / 2, sy + 19, 22, col, 10, RES);
    } else if (k === 1) {
      // 옆에 매단 세로 간판 (뚝딱)
      const sx = x + w - 6, sy = top + 30;
      g.fillStyle = '#1a1f2c'; g.fillRect(sx - 6, sy + 8, 12, 3); g.fillRect(sx - 6, sy + 92, 12, 3);
      rr(g, sx + 4, sy, 34, 104, 5); g.fillStyle = '#080b1c'; g.fill();
      rr(g, sx + 4, sy, 34, 104, 5); tube(g, col, 2.2, 8, RES);
      neonText(g, '뚝', sx + 21, sy + 30, 24, col, 10, RES);
      neonText(g, '딱', sx + 21, sy + 74, 24, col, 10, RES);
    } else if (k === 2) {
      // 동그란 N 로고
      const cx = x + w / 2, cy = top + 60;
      g.beginPath(); g.arc(cx, cy, 24, 0, TAU); g.fillStyle = '#080b1c'; g.fill();
      g.beginPath(); g.arc(cx, cy, 24, 0, TAU); tube(g, col, 2.6, 10, RES);
      neonText(g, 'N', cx, cy + 2, 28, col, 10, RES);
    } else if (k === 3) {
      // 벽에 붙은 글자 간판
      const cx = x + w / 2, cy = top + 44;
      neonText(g, ['TURBO', '로봇', 'NEON'][Math.floor(rand() * 3)], cx, cy, 24, col, 12, RES);
      g.beginPath(); g.moveTo(cx - 44, cy + 18); g.lineTo(cx + 44, cy + 18); tube(g, col, 1.6, 6, RES);
    } else {
      // 화살표 간판 (앞으로 가라는 쪽)
      const sx = x + w / 2 - 34, sy = top + 36;
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(sx + i * 22, sy); g.lineTo(sx + i * 22 + 14, sy + 14); g.lineTo(sx + i * 22, sy + 28);
        g.globalAlpha = 0.5 + i * 0.25; tube(g, col, 3, 8, RES); g.globalAlpha = 1;
      }
    }
  }
  function buildMid(P, W, H, g) {
    const rand = RC.rng(97);
    const RES = 1.25;
    let n = 0;
    for (let x = 10; ; ) {
      const w = 100 + rand() * 90;
      if (x + w + 44 > W - 10) break;
      const h = 150 + rand() * 170, top = H - h;
      const edgeCol = [CY, PK, VI][n % 3];
      // 몸통: 짙은 남색 유리 + 오른쪽 그늘면
      g.fillStyle = lin(g, 0, top, 0, H, [[0, '#1a2250'], [0.5, '#121940'], [1, '#0a0e28']]);
      g.fillRect(x, top, w, h);
      g.fillStyle = 'rgba(0,0,8,0.3)'; g.fillRect(x + w - 18, top, 18, h);
      // 유리 반사 (비스듬한 빛줄)
      g.fillStyle = 'rgba(140,170,255,0.05)';
      poly(g, [0, 0, 26, 0, 26 - h * 0.35, h, -h * 0.35, h], x + w * 0.35, top); g.save(); g.beginPath(); g.rect(x, top, w, h); g.clip();
      poly(g, [0, 0, 26, 0, 26 - h * 0.35, h, -h * 0.35, h], x + w * 0.35, top); g.fill(); g.restore();
      // 창문 격자
      for (let wy = top + 16; wy < H - 44; wy += 22) for (let wx = x + 12; wx < x + w - 24; wx += 18) {
        const q = rand();
        if (q < 0.3) {
          const c = [CY2, PK2, YL, '#dfeaff'][Math.floor(rand() * 4)];
          g.fillStyle = rgba(c, 0.18); g.fillRect(wx - 3, wy - 3, 16, 19);
          g.fillStyle = rgba(c, 0.75); g.fillRect(wx, wy, 10, 13);
        } else { g.fillStyle = 'rgba(4,6,20,0.6)'; g.fillRect(wx, wy, 10, 13); }
      }
      // 빛나는 모서리 · 지붕선
      g.beginPath(); g.moveTo(x + 1, H - 34); g.lineTo(x + 1, top + 1); g.lineTo(x + w - 1, top + 1); g.lineTo(x + w - 1, H - 34);
      g.globalAlpha = 0.85; tube(g, edgeCol, 2, 8, RES); g.globalAlpha = 1;
      // 간판
      if (rand() < 0.8) sign(g, n, x, top, w, h, rand, RES);
      // 1층 가게: 빛나는 진열창 + 네온 차양
      const shop = [CY, PK, YL, VI][Math.floor(rand() * 4)];
      g.fillStyle = '#070a1a'; g.fillRect(x, H - 34, w, 34);
      g.fillStyle = lin(g, 0, H - 26, 0, H - 4, [[0, rgba(shop, 0.55)], [1, rgba(shop, 0.15)]]);
      g.fillRect(x + 10, H - 26, w - 40, 22);
      g.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = x + 30; k < x + w - 34; k += 28) g.fillRect(k, H - 26, 2, 22);
      g.beginPath(); g.moveTo(x + 4, H - 32); g.lineTo(x + w - 20, H - 32); tube(g, shop, 3, 8, RES);
      n++;
      x += w + 18 + rand() * 44;
    }
    // 전체를 살짝 어둡게: 장애물(앞쪽 빛)이 배경보다 늘 더 밝아 보이게
    g.save(); g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(5,7,22,0.3)'; g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ─── 길: 반짝이는 검은 길 · 청록 연석 · 네온 차선 ─────────────────
  function roadTile(g, P, RW) {
    const RES = 1.25;
    // 인도: 짙은 유리 판 + 빛 조각
    g.fillStyle = lin(g, 0, GY - 26, 0, GY, [[0, '#1c2352'], [1, '#0d1232']]);
    g.fillRect(0, GY - 26, RW, 26);
    g.strokeStyle = 'rgba(0,0,10,0.55)'; g.lineWidth = 1.5;
    g.beginPath(); for (let x = 0; x < RW; x += 70) { g.moveTo(x + 8, GY - 26); g.lineTo(x, GY - 4); } g.stroke();
    g.fillStyle = 'rgba(155,107,255,0.55)'; g.fillRect(0, GY - 26, RW, 1.5);
    for (let x = 35; x < RW; x += 70) {
      g.fillStyle = 'rgba(94,231,255,0.25)'; g.fillRect(x - 12, GY - 17, 24, 5);
      g.fillStyle = 'rgba(200,245,255,0.85)'; g.fillRect(x - 8, GY - 16, 16, 3);
    }
    // 연석: 빛나는 청록 줄
    g.fillStyle = '#070a1c'; g.fillRect(0, GY - 4, RW, 8);
    // 아스팔트 (젖은 검정)
    g.fillStyle = lin(g, 0, GY + 4, 0, 600, [[0, '#101538'], [0.4, '#0a0d26'], [1, '#040612']]);
    g.fillRect(0, GY + 4, RW, 600 - GY);
    const r = RC.rng(23);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(140,170,255,0.05)' : 'rgba(0,0,0,0.25)'; g.fillRect(r() * RW, GY + 6 + r() * (600 - GY), 2, 2); }
    // 바닥에 비친 격자 (아주 옅게)
    g.strokeStyle = 'rgba(57,216,255,0.07)'; g.lineWidth = 1.5;
    g.beginPath();
    for (let x = 0; x < RW + 70; x += 70) { g.moveTo(x, GY + 6); g.lineTo(x - 50, 600); }
    for (const y of [GY + 22, GY + 44, GY + 74, GY + 112]) { g.moveTo(0, y); g.lineTo(RW, y); }
    g.stroke();
    // 젖은 길에 비친 네온 (세로 번짐)
    const refl = [[80, PK], [300, CY], [520, VI], [700, YL]];
    for (const [x, c] of refl) {
      g.fillStyle = lin(g, 0, GY + 6, 0, GY + 110, [[0, rgba(c, 0.16)], [1, rgba(c, 0)]]);
      g.fillRect(x, GY + 6, 46, 104);
      g.fillStyle = lin(g, 0, GY + 6, 0, GY + 70, [[0, rgba(c, 0.18)], [1, rgba(c, 0)]]);
      g.fillRect(x + 18, GY + 6, 8, 64);
    }
    // 가운데 얇은 분홍 줄
    g.beginPath(); g.moveTo(-10, GY + 15); g.lineTo(RW + 10, GY + 15);
    g.globalAlpha = 0.6; tube(g, PK, 1.5, 5, RES); g.globalAlpha = 1;
    // 네온 차선 (노랑)
    for (let x = 35; x < RW; x += 140) {
      g.beginPath(); g.moveTo(x, GY + 66); g.lineTo(x + 70, GY + 66);
      tube(g, YL, 4, 9, RES);
    }
    // 연석 빛줄 (번짐이 길로 번지게 마지막에)
    g.beginPath(); g.moveTo(-10, GY - 1); g.lineTo(RW + 10, GY - 1);
    tube(g, CY, 3, 12, RES);
  }

  // 구덩이: 깊은 어둠 + 빛 격자 + 양쪽 경고 기둥 + 홀로그램 "!"
  function warnSprite() {
    return sprite('warn' + fontKey(), 90, 84, 45, 42, g => {
      g.beginPath(); g.moveTo(0, -30); g.lineTo(32, 26); g.lineTo(-32, 26); g.closePath();
      g.fillStyle = 'rgba(255,210,58,0.16)'; g.fill();
      tube(g, YL, 3.5, 10);
      neonText(g, '!', 0, 8, 34, YL, 8);
    });
  }
  function postSprite() {
    return sprite('post', 30, 70, 15, 60, g => {
      rr(g, -6, -48, 12, 50, 3);
      g.fillStyle = lin(g, 0, -48, 0, 0, [[0, '#3a4468'], [1, '#141a38']]); g.fill();
      g.save(); rr(g, -6, -40, 12, 22, 2); g.clip();
      for (let k = -2; k < 6; k++) { g.fillStyle = k % 2 ? '#1a1f2c' : YL; poly(g, [0, 0, 12, 0, 12, 6, 0, 12], -6, -40 + k * 6); g.fill(); }
      g.restore();
    });
  }
  function pit(ctx, x, p) {
    const top = GY - 26, w = p.w;
    ctx.fillStyle = lin(ctx, 0, top, 0, 600, [[0, '#0b0f2c'], [0.25, '#05071a'], [1, '#000000']]);
    ctx.fillRect(x, top, w, 600 - top);
    // 안쪽 빛 격자 (깊어질수록 촘촘하고 흐리게)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 1; k <= 6; k++) {
      const y = top + 14 + k * k * 4.5;
      ctx.fillStyle = rgba(CY, 0.3 * (1 - k / 7)); ctx.fillRect(x + 8, y, w - 16, 1.5);
    }
    for (let k = 1; k < 4; k++) { const xx = x + w * k / 4; ctx.fillStyle = rgba(CY, 0.1); ctx.fillRect(xx - 0.75, top + 18, 1.5, 150); }
    // 빛나는 가장자리 (분홍)
    ctx.fillStyle = rgba(PK, 0.85); ctx.fillRect(x, top, 3, 600 - top); ctx.fillRect(x + w - 3, top, 3, 600 - top);
    ctx.fillStyle = rgba(PK, 0.25); ctx.fillRect(x, top, 10, 600 - top); ctx.fillRect(x + w - 10, top, 10, 600 - top);
    ctx.restore();
    glow(ctx, PK, x, GY, 40, 0.6); glow(ctx, PK, x + w, GY, 40, 0.6);
    // 경고 기둥 + 깜빡이
    const on = Math.floor(performance.now() / 350) % 2;
    const ps = postSprite();
    for (const px of [x - 16, x + w + 16]) {
      stamp(ctx, ps, px, top);
      ctx.beginPath(); ctx.arc(px, top - 52, 5, 0, TAU); ctx.fillStyle = on ? '#fff3b0' : '#7a5a10'; ctx.fill();
      if (on) glow(ctx, YL, px, top - 52, 26, 1);
    }
    // 홀로그램 경고판 (둥실 떠서 살짝 깜빡)
    const ph = performance.now() / 1000;
    const a = 0.75 + 0.25 * Math.sin(ph * 9) * Math.sin(ph * 3.1);
    stampAdd(ctx, warnSprite(), x + w / 2, GY - 78 + Math.sin(ph * 2) * 4, a);
  }

  // ─── 길가 소품: 네온 가로등 · 홀로그램 광고판 · 빛 야자수 · 빛 나무 ─────
  function lampSprite(col) {
    return sprite('lamp' + col, 90, 216, 20, 206, g => {
      // 기둥 (광택 금속)
      g.fillStyle = lin(g, -4, 0, 4, 0, [[0, '#1c2140'], [0.5, '#56608a'], [1, '#141830']]);
      g.fillRect(-3.5, -190, 7, 190);
      g.fillRect(-7, -8, 14, 8);
      // 휘어진 팔
      g.beginPath(); g.moveTo(0, -186); g.quadraticCurveTo(4, -202, 26, -200); g.lineTo(52, -198);
      g.strokeStyle = '#3a4468'; g.lineWidth = 5; g.lineCap = 'round'; g.stroke();
      // 기둥에 붙은 네온 띠
      g.beginPath(); g.moveTo(0, -150); g.lineTo(0, -30); tube(g, col, 1.6, 6);
      // 등갓 + 빛 관
      rr(g, 30, -205, 34, 10, 5); g.fillStyle = '#1a1f38'; g.fill();
      g.beginPath(); g.moveTo(34, -194); g.lineTo(60, -194); tube(g, col, 3.5, 12);
    });
  }
  function coneSprite(col) {
    return sprite('cone' + col, 186, 266, 45, 196, g => {
      g.fillStyle = lin(g, 0, -194, 0, 70, [[0, rgba(col, 0.5)], [0.6, rgba(col, 0.14)], [1, rgba(col, 0)]]);
      poly(g, [34, -194, 60, -194, 125, 70, -35, 70], 0, 0); g.fill();
      // 길바닥에 떨어진 둥근 빛
      const gr = g.createRadialGradient(47, 44, 4, 47, 44, 90);
      gr.addColorStop(0, rgba(col, 0.35)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.beginPath(); g.ellipse(47, 44, 90, 16, 0, 0, TAU); g.fill();
    }, 0.5);
  }
  function holoPanel(txt, col) {
    return sprite('holo' + txt + col + fontKey(), 150, 96, 75, 48, g => {
      rr(g, -62, -36, 124, 72, 6);
      g.fillStyle = lin(g, 0, -36, 0, 36, [[0, rgba(col, 0.28)], [1, rgba(col, 0.08)]]); g.fill();
      rr(g, -62, -36, 124, 72, 6); tube(g, col, 2.2, 10);
      g.fillStyle = rgba(col, 0.12); for (let y = -32; y < 34; y += 4) g.fillRect(-60, y, 120, 1.5);
      neonText(g, txt, 0, 2, txt.length > 3 ? 28 : 34, col, 12);
    });
  }
  function holoPole() {
    return sprite('hpole', 40, 150, 20, 146, g => {
      g.fillStyle = lin(g, -4, 0, 4, 0, [[0, '#1c2140'], [0.5, '#4a5478'], [1, '#141830']]);
      g.fillRect(-3, -110, 6, 110);
      rr(g, -12, -6, 24, 6, 2); g.fillStyle = '#2a3150'; g.fill();
      // 투영기
      rr(g, -10, -118, 20, 10, 3); g.fillStyle = '#2a3150'; g.fill();
      g.fillStyle = CY2; g.fillRect(-6, -120, 12, 2);
    });
  }
  function palmSprite(col) {
    return sprite('palm' + col, 200, 240, 100, 232, g => {
      // 줄기: 마디가 있는 짙은 기둥 (살짝 휘어짐)
      g.strokeStyle = '#161b36'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-8, -90, 6, -176); g.stroke();
      g.strokeStyle = 'rgba(155,107,255,0.35)'; g.lineWidth = 2;
      for (let k = 1; k < 10; k++) { const y = -k * 17, xx = -8 * (1 - Math.pow(1 - k / 10, 2)) * 1.6 + (k > 7 ? (k - 7) * 3 : 0); g.beginPath(); g.moveTo(xx - 4, y); g.lineTo(xx + 4, y - 3); g.stroke(); }
      // 빛나는 잎
      const tx = 6, ty = -178;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + 0.25 + i * (Math.PI - 0.5) / 6;
        const ex = tx + Math.cos(a) * 80, ey = ty + Math.sin(a) * 40 + 36;
        const qx = tx + Math.cos(a) * 50, qy = ty + Math.sin(a) * 50 - 10;
        g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(qx, qy, ex, ey);
        // 잎 가닥: 잎줄기를 따라 짧은 빗금
        for (let k = 2; k <= 9; k++) {
          const u = k / 10, px = (1 - u) * (1 - u) * tx + 2 * u * (1 - u) * qx + u * u * ex, py = (1 - u) * (1 - u) * ty + 2 * u * (1 - u) * qy + u * u * ey;
          const ln = 12 * (1 - u * 0.6);
          g.moveTo(px, py); g.lineTo(px + Math.cos(a) * ln * 0.3, py + ln);
        }
        tube(g, i % 2 ? col : mix(col, '#ffffff', 0.2), 2.2, 9);
      }
      g.beginPath(); g.arc(tx, ty, 5, 0, TAU); g.fillStyle = YL; g.fill();
    });
  }
  function treeSprite() {
    return sprite('ltree', 120, 180, 60, 172, g => {
      g.fillStyle = '#161b36'; g.fillRect(-4, -40, 8, 40);
      rr(g, -18, -6, 36, 6, 2); g.fillStyle = '#2a3150'; g.fill();
      // 층층이 빛 줄로 감은 원뿔 나무
      g.beginPath(); g.moveTo(0, -160); g.lineTo(44, -36); g.lineTo(-44, -36); g.closePath();
      g.fillStyle = lin(g, 0, -160, 0, -36, [[0, '#18204a'], [1, '#0c1030']]); g.fill();
      g.beginPath(); g.moveTo(0, -160); g.lineTo(44, -36); g.lineTo(-44, -36); g.closePath();
      tube(g, VI, 1.6, 6);
      for (let k = 0; k < 4; k++) {
        const y0 = -140 + k * 28, hw = 8 + k * 9;
        g.beginPath(); g.moveTo(-hw, y0); g.quadraticCurveTo(0, y0 + 14, hw + 7, y0 + 4);
        tube(g, k % 2 ? CY : PK2, 2, 7);
      }
      g.beginPath(); g.moveTo(0, -172); for (let i = 1; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 5 : 12; g.lineTo(Math.cos(a) * rad, -160 + Math.sin(a) * rad); }
      g.closePath(); g.fillStyle = YL; g.fill();
    });
  }
  function rail(ctx, cam, vw) {
    // 인도 뒤 낮은 난간: 빛 줄 하나 + 기둥
    const y = GY - 26;
    ctx.fillStyle = '#0c1030'; ctx.fillRect(0, y - 20, vw, 4);
    ctx.fillStyle = rgba(CY, 0.55); ctx.fillRect(0, y - 21, vw, 1.5);
    ctx.fillStyle = '#141a3c';
    const off = ((-cam % 48) + 48) % 48;
    for (let x = off - 48; x < vw + 48; x += 48) ctx.fillRect(x, y - 20, 3, 20);
  }
  function props(ctx, P, cam, vw, t) {
    const y = GY - 26;
    rail(ctx, cam, vw);
    const gap = 420, low = isLow();
    const first = Math.floor((cam - 300) / gap);
    const last = Math.ceil((cam + vw + 300) / gap);
    // 1) 사이 소품 (광고판·나무)
    for (let i = first; i <= last; i++) {
      const x = i * gap + 120 - cam;
      const kind = ((i % 4) + 4) % 4;
      const mx = x + 210;
      if (mx < -140 || mx > vw + 140) continue;
      if (kind === 0) {
        stamp(ctx, holoPole(), mx, y);
        const words = ['ROBO', '뚝딱', 'TURBO', 'GO!', '로봇카'];
        const cols = [CY, PK, YL];
        const wi = ((Math.floor(i / 4) % words.length) + words.length) % words.length;
        const col = cols[((i % 3) + 3) % 3];
        const fl = Math.sin(t * 23 + i) > 0.93 ? 0.45 : 1;       // 가끔 지지직
        const bob = Math.sin(t * 1.6 + i) * 3;
        stampAdd(ctx, holoPanel(words[wi], col), mx, y - 160 + bob, 0.9 * fl);
        if (!low) {
          // 투영 빛 + 위아래로 지나가는 스캔 줄
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = rgba(col, 0.08); poly(ctx, [-4, -120, 4, -120, 60, -124 + bob, -60, -124 + bob], mx, y); ctx.fill();
          const sy = y - 196 + bob + ((t * 40 + i * 13) % 72);
          ctx.fillStyle = rgba(col, 0.35); ctx.fillRect(mx - 60, sy, 120, 2);
          ctx.restore();
        }
      } else if (kind === 1) {
        stamp(ctx, palmSprite(i % 8 === 1 ? PK2 : '#3affc8'), mx, y);
      } else if (kind === 2) {
        stamp(ctx, treeSprite(), mx, y);
        if (!low) glow(ctx, YL, mx, y - 166, 20, 0.5 + 0.3 * Math.sin(t * 3 + i));
      }
    }
    // 2) 가로등 (빛 원뿔은 더하기로)
    for (let i = first; i <= last; i++) {
      const x = i * gap + 120 - cam;
      if (x < -150 || x > vw + 150) continue;
      const col = ((i % 2) + 2) % 2 ? PK2 : CY2;
      stamp(ctx, lampSprite(col), x, y);
      stampAdd(ctx, coneSprite(col), x, y, 0.55);
      glow(ctx, col, x + 47, y - 194, 46, 0.8);
    }
  }

  // 전경: 카메라보다 빨리 지나가는 어두운 기둥·낮은 벽 (작은 네온 점)
  function foreground(ctx, P, cam, vw, t) {
    const gap = 1100, par = 1.3;
    const first = Math.floor((cam * par) / gap) - 1;
    for (let i = first; i * gap - cam * par < vw + 400; i++) {
      const x = i * gap - cam * par + 500;
      if (x > vw + 300 || x < -400) continue;
      const kind = ((i % 2) + 2) % 2;
      ctx.fillStyle = '#03040c';
      if (kind === 0) {
        // 낮은 벽 + 빛 띠
        rr(ctx, x, 562, 260, 50, 10); ctx.fill();
        ctx.fillStyle = rgba(CY, 0.6); ctx.fillRect(x + 12, 572, 236, 2);
        glow(ctx, CY, x + 20, 573, 14, 0.6);
      } else {
        // 볼라드 셋
        for (let k = 0; k < 3; k++) {
          const bx = x + k * 70;
          rr(ctx, bx, 540, 30, 70, 12); ctx.fill();
          ctx.fillStyle = PK; ctx.fillRect(bx + 6, 552, 18, 3);
          glow(ctx, PK, bx + 15, 553, 16, 0.5 + 0.3 * Math.sin(t * 4 + k));
          ctx.fillStyle = '#03040c';
        }
      }
    }
  }

  // ─── 장애물 ─────────────────────────────────────────────
  // 빛나는 화물 상자 (부술 수 있다)
  function crateSprite(col) {
    return sprite('crate' + col, 92, 92, 14, 14, g => {
      rr(g, 0, 0, 64, 64, 7);
      g.fillStyle = lin(g, 0, 0, 0, 64, [[0, mix(col, '#101640', 0.62)], [0.45, mix(col, '#0a0e2c', 0.8)], [1, mix(col, '#04061a', 0.9)]]);
      g.fill();
      // 안쪽 판 + X자 보강
      rr(g, 9, 9, 46, 46, 4); g.fillStyle = 'rgba(0,0,12,0.35)'; g.fill();
      g.save(); rr(g, 9, 9, 46, 46, 4); g.clip();
      g.strokeStyle = rgba(col, 0.45); g.lineWidth = 4;
      g.beginPath(); g.moveTo(9, 9); g.lineTo(55, 55); g.moveTo(55, 9); g.lineTo(9, 55); g.stroke();
      g.restore();
      // 가운데 번개 표시
      poly(g, [4, -14, -7, 2, 0, 2, -4, 14, 8, -3, 1, -3, 5, -14], 32, 32);
      g.fillStyle = '#080b1c'; g.fill();
      poly(g, [4, -14, -7, 2, 0, 2, -4, 14, 8, -3, 1, -3, 5, -14], 32, 32);
      g.save(); g.shadowColor = YL; g.shadowBlur = 8 * SS; g.fillStyle = YL; g.fill(); g.restore();
      // 빛나는 테두리
      rr(g, 1.5, 1.5, 61, 61, 6); tube(g, col, 3.2, 10);
      // 윗면 광택
      g.fillStyle = 'rgba(255,255,255,0.28)'; rr(g, 6, 3, 52, 4, 2); g.fill();
      // 모서리 쇠붙이
      g.fillStyle = '#cfe0ff';
      for (const [dx, dy] of [[6, 6], [58, 6], [6, 58], [58, 58]]) { g.beginPath(); g.arc(dx, dy, 2.2, 0, TAU); g.fill(); }
    });
  }
  function crate(ctx, x, y, w, h, k, t) {
    const col = k % 2 ? PK2 : CY;
    glow(ctx, col, x + w / 2, y + h / 2, 66, 0.4 + 0.12 * Math.sin(t * 4 + k * 1.7));
    ctx.drawImage(crateSprite(col), x - 14 * w / 64, y - 14 * h / 64, 92 * w / 64, 92 * h / 64);
  }

  // 네온 방호벽 (90×70)
  const JB = [0, 0, 10, -16, 22, -66, 68, -66, 80, -16, 90, 0];
  function barrierSprite() {
    return sprite('barrier', 126, 100, 18, 84, g => {
      poly(g, JB, 0, 0);
      g.fillStyle = lin(g, 0, -66, 0, 0, [[0, '#2c3470'], [0.5, '#1a2050'], [1, '#0b0f2a']]); g.fill();
      // 분홍·흰 빗금 띠
      g.save(); poly(g, JB, 0, 0); g.clip();
      g.fillStyle = '#fff4fa'; g.fillRect(0, -50, 90, 18);
      g.fillStyle = PK; for (let k = -2; k < 9; k++) { poly(g, [0, 0, 9, 0, -1, 18, -10, 18], k * 18, -50); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, -33, 90, 2);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, -66, 90, 5);
      g.restore();
      poly(g, JB, 0, 0); tube(g, PK, 3, 12);
      // 발 받침
      g.fillStyle = '#060818'; g.fillRect(4, -5, 82, 5);
      // 등 받침
      rr(g, 38, -76, 14, 10, 3); g.fillStyle = '#2a3150'; g.fill();
    });
  }
  function barrier(ctx, x, o, t) {
    glow(ctx, PK, x + 45, GY - 34, 70, 0.3);
    stamp(ctx, barrierSprite(), x, GY);
    const on = Math.floor(t * 3) % 2;
    ctx.beginPath(); ctx.arc(x + 45, GY - 79, 5, 0, TAU); ctx.fillStyle = on ? '#fff3b0' : '#7a5a10'; ctx.fill();
    if (on) glow(ctx, YL, x + 45, GY - 79, 30, 1);
  }

  // 점프대: 크롬 경사판 + 빛나는 가장자리 + 위로 흐르는 화살표
  function ramp(ctx, x, o, t) {
    const w = o.w, h = o.h;
    glow(ctx, CY, x + w * 0.62, GY - h * 0.4, 80, 0.35);
    // 속이 찬 쐐기: 청록빛 유리 + 빛 격자
    poly(ctx, [0, 0, w, -h, w, 0], x, GY);
    ctx.fillStyle = lin(ctx, 0, GY - h, 0, GY, [[0, '#2c4aa8'], [1, '#101850']]); ctx.fill();
    ctx.save(); poly(ctx, [0, 0, w, -h, w, 0], x, GY); ctx.clip();
    ctx.fillStyle = rgba(CY2, 0.3);
    for (let k = 1; k < 6; k++) ctx.fillRect(x + k * w / 6 - 1, GY - h, 2, h);
    ctx.fillRect(x, GY - h * 0.5, w, 2);
    ctx.restore();
    // 쐐기 옆면 노란 화살표 (위로 가라는 쪽)
    ctx.fillStyle = YL;
    const ang0 = -Math.atan2(h, w);
    for (const u of [0.52, 0.7, 0.88]) {
      const ph = ((t * 2.4 - u) % 1 + 1) % 1;
      ctx.globalAlpha = 0.55 + 0.45 * Math.pow(1 - ph, 2);
      ctx.save(); ctx.translate(x + u * w - 4, GY - h * u + 19); ctx.rotate(ang0);
      poly(ctx, [-7, -8, 0, -8, 9, 0, 0, 8, -7, 8, 2, 0], 0, 0); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // 뒷면 분홍 빛 기둥
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(PK, 0.35); ctx.fillRect(x + w - 8, GY - h, 8, h);
    ctx.fillStyle = PK2; ctx.fillRect(x + w - 3, GY - h, 3, h);
    ctx.restore();
    // 크롬 판 (두껍게)
    poly(ctx, [0, 0, w, -h, w, -h + 13, 0, 8], x, GY);
    ctx.fillStyle = lin(ctx, 0, GY - h, 0, GY, [[0, '#f6fbff'], [0.4, '#a8b6da'], [0.6, '#5a6894'], [1, '#d8e2f6']]); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    // 윗면 빛줄 (번짐 두 겹)
    for (const [lw, a] of [[12, 0.3], [3.5, 1]]) {
      ctx.strokeStyle = rgba(CY2, a); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x + 2, GY - 1); ctx.lineTo(x + w - 1, GY - h + 1); ctx.stroke();
    }
    // 판 위로 흐르는 노란 화살표
    const ang = -Math.atan2(h, w);
    for (let k = 1; k < 5; k++) {
      const u = k / 5, xx = x + u * w, yy = GY - h * u + 4;
      const ph = ((t * 2.2 - u) % 1 + 1) % 1;
      const a = 0.45 + 0.55 * Math.pow(1 - ph, 3);
      ctx.save(); ctx.translate(xx, yy); ctx.rotate(ang);
      ctx.fillStyle = rgba(YL, a);
      poly(ctx, [-8, -4, 2, -4, 9, 1.5, 2, 7, -8, 7, -1, 1.5], 0, 0); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    glow(ctx, PK, x + w, GY - h, 34, 0.9);
  }

  // 가속 발판: 앞으로 흐르는 화살표 + 위로 솟는 빛 (쓰면 흐려진다)
  function beamSprite(w) {
    return sprite('beam' + w, w + 20, 150, 10, 140, g => {
      g.fillStyle = lin(g, 0, -136, 0, 0, [[0, 'rgba(255,210,58,0)'], [0.55, 'rgba(255,210,58,0.35)'], [1, 'rgba(255,235,140,0.85)']]);
      poly(g, [10, 0, w + 4, 0, w - 6, -136, 20, -136], 0, 0); g.fill();
      g.fillStyle = lin(g, 0, -60, 0, 0, [[0, 'rgba(57,216,255,0)'], [1, 'rgba(57,216,255,0.35)']]);
      for (let k = 0; k < 5; k++) g.fillRect(12 + k * (w - 24) / 4 - 2, -60, 4, 60);
    }, 1);
  }
  function boost(ctx, x, o, t) {
    const w = o.w, used = !!o.used;
    // 길 위에 비스듬히 놓인 발판 (연석 빛줄과 겹치지 않게 조금 아래까지 내려 그린다)
    const pad = [0, -3, w, -3, w + 14, 22, 14, 22];
    poly(ctx, pad, x, GY); ctx.fillStyle = used ? '#0a1030' : '#1a1640'; ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (!used) stampAdd(ctx, beamSprite(w), x, GY, 0.85 + 0.15 * Math.sin(t * 8));
    // 화살표 (앞으로 흐른다)
    ctx.save(); poly(ctx, pad, x, GY); ctx.clip();
    ctx.fillStyle = used ? rgba(CY, 0.45) : YL;
    const sp = used ? 30 : 170;
    for (let k = -1; k < 6; k++) {
      const ax = x + ((k * 30 + t * sp) % 180 + 180) % 180 - 30;
      poly(ctx, [0, 0, 10, 0, 22, 9, 10, 18, 0, 18, 12, 9], ax, GY);
      ctx.fill();
    }
    ctx.restore();
    // 테두리 빛
    poly(ctx, pad, x, GY);
    ctx.strokeStyle = used ? rgba(CY, 0.4) : rgba(YL, 0.35); ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = used ? rgba(CY2, 0.5) : '#fff1a8'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    if (!used) glow(ctx, YL, x + w / 2 + 7, GY + 8, 50, 0.55);
  }

  // ─── 불빛 터널: 뒤(차 뒤) · 앞(차 앞) ─────────────────────────
  const T_TOP = GY - 250, T_CY = GY - 100, T_RY = 150, T_RX = 20, T_N = 8;
  function ringX(x, o, i) { return x + 30 + i * (o.w - 60) / (T_N - 1); }
  function ringCol(i) { return i === 0 || i === T_N - 1 ? PK : i % 2 ? VI : CY; }
  function pulse(t, i) { return Math.pow(0.5 + 0.5 * Math.sin(t * 6 - i * 0.9), 4); }
  // 고리 앞쪽 반(오른 호) 스프라이트: 매 프레임 번진 호를 긋지 않고 찍기만 한다. 반쪽만 담아 찍는 넓이를 줄인다
  function ringSprite(col, fat) {
    return sprite('ring' + col + (fat ? 'f' : ''), T_RX + 26, T_RY * 2 + 36, 8, T_RY + 18, g => {
      g.beginPath(); g.ellipse(0, 0, T_RX, T_RY, 0, -Math.PI / 2, Math.PI / 2);
      tube(g, col, fat ? 5 : 3.2, fat ? 14 : 10, 1.5);
    }, 1.5);
  }
  const T_LINES = [[T_TOP + 60, CY, 0.5], [T_TOP + 130, PK2, 0.35], [GY - 60, CY, 0.4]];
  function tunnelBack(ctx, x, o, t) {
    const w = o.w;
    const x0 = x + 30, x1 = x + w - 30;
    // 안쪽 벽 (어둡고 반투명) + 지붕 빛: 단색 채우기라 싸다
    ctx.fillStyle = 'rgba(6,9,30,0.72)'; ctx.fillRect(x0, T_TOP + 16, x1 - x0, GY - 26 - T_TOP - 16);
    ctx.fillStyle = 'rgba(155,107,255,0.3)'; ctx.fillRect(x0, T_TOP + 10, x1 - x0, 14);
    ctx.fillStyle = 'rgba(155,107,255,0.14)'; ctx.fillRect(x0, T_TOP + 24, x1 - x0, 26);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // 벽을 따라 뒤로 흐르는 빛 줄 (빨리 달리는 느낌)
    const off = ((-t * 420) % 90 + 90) % 90;
    for (const [ly, c, a] of T_LINES) {
      ctx.fillStyle = rgba(c, a * 0.35); ctx.fillRect(x0, ly, x1 - x0, 1.5);
      ctx.fillStyle = rgba(c, a);
      for (let dx = off; dx < x1 - x0; dx += 90) ctx.fillRect(x0 + dx, ly - 1, Math.min(40, x1 - x0 - dx), 3);
    }
    // 고리 뒤쪽 반 (왼쪽 호, 가는 선)
    ctx.lineWidth = 3;
    for (let i = 0; i < T_N; i++) {
      ctx.strokeStyle = rgba(ringCol(i), 0.3 + 0.4 * pulse(t, i));
      ctx.beginPath(); ctx.ellipse(ringX(x, o, i), T_CY, T_RX, T_RY, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    }
    // 바닥 빛
    ctx.fillStyle = rgba(CY, 0.18); ctx.fillRect(x0, GY - 2, x1 - x0, 6);
    ctx.restore();
  }
  function tunnelSign() {
    return sprite('tsign' + fontKey(), 170, 70, 85, 35, g => {
      rr(g, -70, -22, 140, 44, 8); g.fillStyle = '#080b1c'; g.fill();
      rr(g, -70, -22, 140, 44, 8); tube(g, PK, 2.6, 10);
      neonText(g, '슝 TURBO', 0, 2, 24, YL, 10);
    });
  }
  function tunnelFront(ctx, x, o, t) {
    const ax = ringX(x, o, 0), bx = ringX(x, o, T_N - 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // 지붕 빛 줄 (고리를 잇는다)
    ctx.fillStyle = rgba(CY2, 0.16); ctx.fillRect(ax, T_TOP - 5, bx - ax, 10);
    ctx.fillStyle = rgba(CY2, 0.85); ctx.fillRect(ax, T_TOP - 1.5, bx - ax, 3);
    // 고리 앞쪽 반 (오른쪽 호): 차례로 밝아진다
    for (let i = 0; i < T_N; i++) {
      const rx = ringX(x, o, i), p = pulse(t, i);
      const end = i === 0 || i === T_N - 1;
      ctx.globalAlpha = Math.min(1, (end ? 0.8 : 0.5) + 0.5 * p);
      const c = ringSprite(ringCol(i), end);
      ctx.drawImage(c, rx - c.ox, T_CY - c.oy, c.lw, c.lh);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    for (let i = 0; i < T_N; i++) { const p = pulse(t, i); if (p > 0.3) glow(ctx, ringCol(i), ringX(x, o, i), T_TOP, 26, p * 0.8); }
    // 입구 간판
    stamp(ctx, tunnelSign(), ax + 40, T_TOP - 30);
  }

  // ─── 결승 문: 네온 기둥 + 체커 현수막 "도착 FINISH" + 불꽃놀이 ────────
  function gateSprite() {
    return sprite('gate' + fontKey(), 320, 300, 160, 284, g => {
      const y = -26;
      for (const dx of [-120, 120]) {
        rr(g, dx - 12, y - 226, 24, 226, 6);
        g.fillStyle = lin(g, dx - 12, 0, dx + 12, 0, [[0, '#141a3c'], [0.45, '#4a5580'], [1, '#0c1030']]); g.fill();
        g.beginPath(); g.moveTo(dx, y - 210); g.lineTo(dx, y - 10); tube(g, CY, 3, 10);
        rr(g, dx - 18, y - 8, 36, 8, 2); g.fillStyle = '#2a3150'; g.fill();
      }
      // 현수막
      const bx = -140, by = y - 262, bw = 280, bh = 62;
      rr(g, bx, by, bw, bh, 8); g.fillStyle = '#070a1c'; g.fill();
      g.save(); rr(g, bx, by, bw, bh, 8); g.clip();
      // 체커 무늬 두 줄씩 (위·아래)
      g.fillStyle = 'rgba(240,248,255,0.9)';
      for (let k = 0; k < 28; k++) {
        const kx = bx + k * 10;
        if (k % 2) { g.fillRect(kx, by, 10, 5); g.fillRect(kx, by + bh - 10, 10, 5); }
        else { g.fillRect(kx, by + 5, 10, 5); g.fillRect(kx, by + bh - 5, 10, 5); }
      }
      g.restore();
      rr(g, bx, by, bw, bh, 8); tube(g, PK, 3.2, 14);
      neonText(g, '도착 FINISH', 0, by + bh / 2 + 1, 30, YL, 14);
    });
  }
  const FW = [CY2, PK2, YL, '#8affc1'];
  function finishGate(ctx, x, t, done) {
    const y = GY - 26;
    glow(ctx, PK, x, y - 232, 170, 0.3);
    stamp(ctx, gateSprite(), x, GY);
    // 기둥을 타고 오르는 빛 점
    for (const dx of [-120, 120]) {
      for (let k = 0; k < 8; k++) {
        const on = (Math.floor(t * 10) + k) % 4 === 0;
        const py = y - 22 - k * 26;
        ctx.fillStyle = on ? '#ffffff' : 'rgba(255,210,58,0.35)';
        ctx.fillRect(x + dx - 7, py - 2, 3, 4); ctx.fillRect(x + dx + 4, py - 2, 3, 4);
        if (on) glow(ctx, YL, x + dx, py, 18, 0.9);
      }
    }
    if (!done) return;
    // 불꽃놀이: 퍼지는 빛 점 고리
    const nb = isLow() ? 2 : 4, nd = isLow() ? 10 : 14;
    const cxs = [-170, 90, 200, -40], cys = [-380, -430, -350, -470];
    for (let b = 0; b < nb; b++) {
      const per = 1.5 + b * 0.17;
      const ph = ((t + b * 0.43) % per) / per;
      const cx = x + cxs[b], cy = GY + cys[b];
      const col = FW[b % FW.length];
      if (ph < 0.18) {
        // 올라가는 불씨
        const k = ph / 0.18;
        glow(ctx, col, cx, cy + (1 - k) * 160, 12, 0.9);
        continue;
      }
      const k = (ph - 0.18) / 0.82;
      const rad = 18 + (1 - Math.pow(1 - k, 2)) * 120, a = 1 - k, drop = k * k * 40;
      if (k < 0.2) glow(ctx, '#ffffff', cx, cy, 70, (0.2 - k) * 3);
      ctx.fillStyle = rgba(mix(col, '#ffffff', 0.5), a);
      for (let d = 0; d < nd; d++) {
        const an = d / nd * TAU + b;
        const px = cx + Math.cos(an) * rad, py = cy + Math.sin(an) * rad + drop;
        if (d % 2 === 0) glow(ctx, col, px, py, 14, a);
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
    }
  }

  RC.Neon = { buildFar, buildMid, roadTile, pit, sky, props, foreground, crate, barrier, ramp, boost, tunnelBack, tunnelFront, finishGate };
})(RC);
