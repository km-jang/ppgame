'use strict';
// 땅에서 우주까지 · 행성 날씨 그림 (2026-09-27, 소유자: "땅에서 시작해 구름도 통과하고 대기권 통과 우주",
// "얼음 행성이면 눈이 오고 불의 행성이면 그에 맞게"). 그리기 전용이라 놀이 규칙은 바꾸지 않는다.
//   땅: 동네 지붕 · 나무 · 발사대 탑 (0m, 발판과 같이 흘러내린다)
//   낮은 하늘: 연 · 새 떼 · 열기구 / 높은 하늘: 비행기 · 기상 풍선 / 우주 입구: 인공위성 · 달 (배경 소품, 천천히 흘러간다)
//   구름 층: 뒤에 구름 벽 + 그 안을 지날 때 앞으로도 구름이 흘러 지나간다
//   대기권 끝: 빛나는 파란 선 (그 높이에 고정)
//   행성 날씨: WORLDS.weatherOf 종류대로 입자 (눈 · 불씨 · 비 · 유리비 · 반짝이 · 모래 · 방울 · 씨앗 · 번개 · 오로라 · 안개)
// 모든 그림은 한 번 캔버스에 그려 두고 찍기만 한다 (매 프레임 shadowBlur 없음). 입자는 D.WEATHER.max개까지.
// 수치(높이·입자 수)는 data.js SKY · WEATHER.
(function (JP) {
  const TAU = Math.PI * 2;
  const D = JP.DATA;
  const S = D.SKY, M = D.METER;
  const cache = {};
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    return c;
  }
  function clear() { for (const k of Object.keys(cache)) delete cache[k]; WX.list.length = 0; WX.id = null; WX.cam = null; }

  // 월드 높이(점) → 화면 y
  const SY = (v, cam, y) => v.cy + v.ch - (y - cam) * v.scale;
  // 화면 가운데 높이(m)
  const midM = (v, cam) => (cam + v.viewH * 0.5) / M;

  // ─── 배경 장면에 덧그리기 (render.js paintZone이 부른다, 1/4 해상도) ───
  function paintScene(g, Z, w, h, rand) {
    const puff = (x, y, r, col) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    };
    // 둥근 지구 가장자리: 아주 큰 원의 윗부분. top: 화면 높이 비율, rad: 원 반지름(화면 긴 변 배율)
    const earth = (top, rad, glowA) => {
      const R = Math.max(w, h) * rad, cy = h * top + R, cx = w * 0.5;
      const at = g.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.06);
      at.addColorStop(0, 'rgba(120,200,255,' + glowA + ')'); at.addColorStop(0.35, 'rgba(90,170,255,' + glowA * 0.55 + ')'); at.addColorStop(1, 'rgba(60,120,255,0)');
      g.fillStyle = at; g.beginPath(); g.arc(cx, cy, R * 1.06, 0, TAU); g.fill();
      const body = g.createLinearGradient(0, h * top, 0, h);
      body.addColorStop(0, '#5aa8ff'); body.addColorStop(0.08, '#2a6ad0'); body.addColorStop(0.5, '#123a80'); body.addColorStop(1, '#0a2050');
      g.fillStyle = body; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
      // 발아래 구름 무늬
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
      for (let i = 0; i < 26; i++) puff(rand() * w, h * top + rand() * h * (1 - top), Math.max(w, h) * (0.02 + rand() * 0.04), 'rgba(255,255,255,0.35)');
      g.restore();
      g.strokeStyle = 'rgba(200,240,255,0.8)'; g.lineWidth = Math.max(2, h * 0.004);
      g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    };
    if (Z.id === 'high') earth(0.8, 1.7, 0.7);
    else if (Z.id === 'edge') earth(0.9, 1.0, 0.9);
    else if (Z.id === 'planet' && Z.planet === 'twin') {
      // 해님 둘
      for (const [x, y, r] of [[0.16, 0.2, 0.05], [0.3, 0.09, 0.035]]) {
        puff(w * x, h * y, Math.max(w, h) * r * 4, 'rgba(255,200,120,0.35)');
        puff(w * x, h * y, Math.max(w, h) * r * 1.4, 'rgba(255,235,170,0.9)');
        puff(w * x, h * y, Math.max(w, h) * r * 0.7, 'rgba(255,255,230,1)');
      }
    } else if (Z.id === 'planet' && Z.planet === 'lava') {
      puff(w * 0.5, h * 1.05, Math.max(w, h) * 0.5, 'rgba(255,90,20,0.4)');
    } else if (Z.id === 'planet' && Z.planet === 'frost') {
      puff(w * 0.5, h * 1.05, Math.max(w, h) * 0.5, 'rgba(200,240,255,0.25)');
    }
  }

  // ─── 땅: 동네 지붕 · 나무 · 발사대 탑 ─────────────────────
  // 한 번 그려 둔 가로 전체 그림. 아래 끝이 땅(0m)에 붙는다
  function townSprite(v) {
    const key = 'town:' + v.w + 'x' + v.h + ':' + v.dpr;
    if (cache[key]) return cache[key];
    const s = v.scale, H = Math.round(200 * s), q = Math.min(v.dpr, 1.5);
    const c = canvas(v.w * q, H * q), g = c.getContext('2d');
    g.scale(q, q);
    const rand = JP.rng(1207);
    // 멀리 있는 높은 건물 (흐린 남보라)
    const col = v.cx, ce = v.cx + v.cw;
    let x = -10;
    while (x < v.w) {
      const bw = (26 + rand() * 40) * s, inCol = x + bw > col && x < ce;
      const bh = (inCol ? 40 + rand() * 50 : 70 + rand() * 110) * s;
      g.fillStyle = '#1b2350';
      g.fillRect(x, H - bh, bw, bh);
      // 창문 불빛
      g.fillStyle = 'rgba(255,214,130,0.75)';
      for (let wy = H - bh + 8 * s; wy < H - 10 * s; wy += 13 * s) for (let wx = x + 5 * s; wx < x + bw - 8 * s; wx += 10 * s) if (rand() < 0.4) g.fillRect(wx, wy, 4 * s, 5 * s);
      x += bw + (2 + rand() * 6) * s;
    }
    // 가까운 집 (세모 지붕)
    x = -20;
    while (x < v.w) {
      const hw = (36 + rand() * 24) * s, hh = (22 + rand() * 12) * s, roof = (14 + rand() * 8) * s;
      const hue = ['#2a3470', '#302a66', '#243c6e'][Math.floor(rand() * 3)];
      g.fillStyle = hue; g.fillRect(x, H - hh, hw, hh);
      g.fillStyle = ['#c0504a', '#d0784a', '#6a4ab0', '#3a8a9a'][Math.floor(rand() * 4)];
      g.beginPath(); g.moveTo(x - 4 * s, H - hh); g.lineTo(x + hw / 2, H - hh - roof); g.lineTo(x + hw + 4 * s, H - hh); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,220,140,0.9)'; g.fillRect(x + hw * 0.3, H - hh * 0.7, 6 * s, 7 * s);
      if (rand() < 0.6) g.fillRect(x + hw * 0.62, H - hh * 0.7, 6 * s, 7 * s);
      x += hw + (10 + rand() * 30) * s;
    }
    // 둥근 나무
    for (let i = 0; i < Math.round(v.w / (70 * s)); i++) {
      const tx = rand() * v.w, tr = (8 + rand() * 7) * s;
      g.fillStyle = '#1f5a3a'; g.beginPath(); g.arc(tx, H - tr * 0.9, tr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(120,220,140,0.35)'; g.beginPath(); g.arc(tx - tr * 0.3, H - tr * 1.2, tr * 0.45, 0, TAU); g.fill();
    }
    // 발사대 탑: 기둥 왼쪽 끝 안쪽, 격자 탑 + 꼭대기 빨간 불
    const gx = v.cx + 18 * s, gw = 22 * s, gh = 170 * s;
    g.strokeStyle = '#8fa8c8'; g.lineWidth = Math.max(1, 2 * s);
    g.beginPath();
    g.moveTo(gx, H); g.lineTo(gx, H - gh); g.moveTo(gx + gw, H); g.lineTo(gx + gw, H - gh);
    for (let y = H; y > H - gh; y -= 16 * s) { g.moveTo(gx, y); g.lineTo(gx + gw, y - 16 * s); g.moveTo(gx + gw, y); g.lineTo(gx, y - 16 * s); }
    g.moveTo(gx + gw, H - gh * 0.8); g.lineTo(gx + gw + 26 * s, H - gh * 0.8);
    g.stroke();
    cache[key] = { c, H, light: { x: gx + gw / 2, y: H - gh - 4 * s } };
    return cache[key];
  }
  // 땅 (0m 아래) · 동네 · 발사대 탑. 기둥 유리 위에 그려 또렷하게 (발판은 그 위에)
  function drawGround(ctx, v, cam, t) {
    const y0 = SY(v, cam, 0);
    if (y0 > v.h + 220 * v.scale || cam > S.ground * M) return;
    const T = townSprite(v);
    if (y0 - T.H < v.h) {
      ctx.drawImage(T.c, 0, y0 - T.H, v.w, T.H);
      // 탑 꼭대기 빨간 불: 천천히 깜빡 (움직임 줄이기면 켜 둔 채)
      const on = v.calm ? 1 : 0.55 + 0.45 * Math.sin(t * 3);
      ctx.globalAlpha = on;
      ctx.fillStyle = '#ff4d5a';
      ctx.beginPath(); ctx.arc(T.light.x, y0 - T.H + T.light.y, Math.max(2, 4 * v.scale), 0, TAU); ctx.fill();
      ctx.globalAlpha = on * 0.35;
      ctx.beginPath(); ctx.arc(T.light.x, y0 - T.H + T.light.y, Math.max(5, 11 * v.scale), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (y0 < v.h) {
      const g = ctx.createLinearGradient(0, y0, 0, Math.min(v.h, y0 + 140 * v.scale));
      g.addColorStop(0, '#2f8a4a'); g.addColorStop(0.15, '#1d5e36'); g.addColorStop(1, '#0a2414');
      ctx.fillStyle = g; ctx.fillRect(0, y0, v.w, v.h - y0 + 2);
      ctx.fillStyle = '#7dff9a'; ctx.globalAlpha = 0.6; ctx.fillRect(0, y0, v.w, Math.max(2, 3 * v.scale)); ctx.globalAlpha = 1;
    }
  }

  // ─── 구름 층 ───────────────────────────────────────────────
  // 폭신한 구름 한 줄 (구름 벽의 윗면·아랫면, 앞 구름). 반 해상도로 한 번
  function puffRow(v, seed, n, alpha) {
    const key = 'row:' + seed + ':' + v.w + 'x' + v.h;
    if (cache[key]) return cache[key];
    const H = v.h * 0.3, q = 0.5, c = canvas(v.w * q, H * q), g = c.getContext('2d');
    g.scale(q, q);
    const rand = JP.rng(seed);
    for (let i = 0; i < n; i++) {
      const x = rand() * v.w, r = v.h * (0.06 + rand() * 0.07), y = H - r * (0.4 + rand() * 0.5);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(240,248,255,' + alpha + ')'); gr.addColorStop(0.6, 'rgba(230,242,255,' + alpha * 0.8 + ')'); gr.addColorStop(1, 'rgba(230,242,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    cache[key] = { c, H };
    return cache[key];
  }
  // 앞 구름 한 장 (화면 높이, 위아래로 이어 붙는다)
  function frontSheet(v, seed) {
    const key = 'front:' + seed + ':' + v.w + 'x' + v.h;
    if (cache[key]) return cache[key];
    const q = 0.4, c = canvas(v.w * q, v.h * q), g = c.getContext('2d');
    g.scale(q, q);
    const rand = JP.rng(seed);
    const n = Math.max(5, Math.round(8 * v.w / 1280));
    for (let i = 0; i < n; i++) {
      const cx = rand() * v.w, cy = rand() * v.h, sc = v.h * (0.07 + rand() * 0.06);
      for (let k = 0; k < 6; k++) {
        const x = cx + (k - 2.5) * sc * 0.8 + (rand() - 0.5) * sc * 0.5, y = cy + (rand() - 0.5) * sc * 0.6, r = sc * (0.8 + rand() * 0.6);
        for (const yy of [y - v.h, y, y + v.h]) {
          const gr = g.createRadialGradient(x, yy, 0, x, yy, r);
          gr.addColorStop(0, 'rgba(245,250,255,0.55)'); gr.addColorStop(1, 'rgba(245,250,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, yy, r, 0, TAU); g.fill();
        }
      }
    }
    cache[key] = c;
    return c;
  }
  // 구름 벽 (기둥 유리 뒤): cloud[0] ~ cloud[1] m 사이가 뿌옇고, 윗면·아랫면은 뭉게뭉게
  function drawCloudBank(ctx, v, cam) {
    const yb = SY(v, cam, S.cloud[0] * M), yt = SY(v, cam, S.cloud[1] * M);
    const top = puffRow(v, 31, Math.round(26 * v.w / 1280) + 8, 0.95);
    if (yb < -top.H || yt > v.h + top.H) return;
    const a = Math.max(yt, -10), b = Math.min(yb, v.h + 10);
    if (b > a) {
      const g = ctx.createLinearGradient(0, yt, 0, yb);
      g.addColorStop(0, 'rgba(225,238,255,0.8)'); g.addColorStop(0.7, 'rgba(205,222,245,0.7)'); g.addColorStop(1, 'rgba(190,210,240,0.35)');
      ctx.fillStyle = g; ctx.fillRect(0, a, v.w, b - a);
    }
    ctx.drawImage(top.c, 0, yt - top.H + 1, v.w, top.H);
    const bot = puffRow(v, 57, Math.round(20 * v.w / 1280) + 6, 0.45);
    ctx.save(); ctx.translate(0, yb - 1); ctx.scale(1, -1);
    ctx.drawImage(bot.c, 0, -bot.H, v.w, bot.H);
    ctx.restore();
  }
  // 구름 속을 지나는 동안 앞에 흘러 지나가는 구름 (주인공·발판 위). 발판이 늘 보이게 옅게
  function cloudInside(v, cam) {
    const m = midM(v, cam), c0 = S.cloud[0], c1 = S.cloud[1];
    return clamp01((m - (c0 - 6)) / 10) * clamp01((c1 + 8 - m) / 10);
  }
  function drawCloudFront(ctx, v, cam, t) {
    const f = cloudInside(v, cam);
    if (f <= 0.01) return;
    ctx.fillStyle = 'rgba(225,238,255,' + (0.1 * f).toFixed(3) + ')';
    ctx.fillRect(0, 0, v.w, v.h);
    const up = cam * v.scale;
    for (const [seed, k, al, drift] of [[71, 1.5, 0.5, 14], [93, 2.3, 0.38, -22]]) {
      const sh = frontSheet(v, seed);
      const y = ((up * k) % v.h + v.h) % v.h;
      const x = v.calm ? 0 : ((t * drift) % v.w + v.w) % v.w;
      ctx.globalAlpha = al * f;
      for (const xx of [x - v.w, x]) {
        ctx.drawImage(sh, xx, y - v.h, v.w, v.h);
        ctx.drawImage(sh, xx, y, v.w, v.h);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ─── 대기권 끝: 빛나는 파란 선 ─────────────────────────────
  function edgeSprite(v) {
    const key = 'edge:' + v.w + 'x' + v.h;
    if (cache[key]) return cache[key];
    const H = Math.round(v.h * 0.5), c = canvas(v.w, H), g = c.getContext('2d');
    const mid = H * 0.3;
    // 선 아래는 푸르스름한 대기, 위는 금방 사라진다
    const band = g.createLinearGradient(0, 0, 0, H);
    band.addColorStop(0, 'rgba(80,170,255,0)');
    band.addColorStop(0.25, 'rgba(90,190,255,0.25)');
    band.addColorStop(0.3, 'rgba(170,235,255,0.55)');
    band.addColorStop(0.36, 'rgba(70,150,255,0.3)');
    band.addColorStop(1, 'rgba(40,100,255,0)');
    g.fillStyle = band; g.fillRect(0, 0, v.w, H);
    g.fillStyle = 'rgba(210,248,255,0.95)'; g.fillRect(0, mid - 1, v.w, 2);
    // 양 끝은 흐리게
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, v.w, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0.35)'); fade.addColorStop(0.2, '#000'); fade.addColorStop(0.8, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = fade; g.fillRect(0, 0, v.w, H);
    cache[key] = { c, H, mid };
    return cache[key];
  }
  function drawEdge(ctx, v, cam) {
    const y = SY(v, cam, S.edge * M), E = edgeSprite(v);
    if (y + E.H < 0 || y - E.mid > v.h) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(E.c, 0, y - E.mid, v.w, E.H);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ─── 배경 소품 (연 · 새 · 열기구 · 비행기 · 기상 풍선 · 인공위성 · 달) ───
  const SPAN_D = 48;   // 소품은 화면 한 높이에 48m (행성보다 빠르고 발판보다 느리게)
  function decoSprite(kind, U, frame) {
    const key = 'deco:' + kind + ':' + Math.round(U) + ':' + (frame || 0);
    if (cache[key]) return cache[key];
    const W = U * 3, c = canvas(W, W), g = c.getContext('2d');
    g.translate(W / 2, W / 2);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'kite') {
      const k = U * 0.55;
      const quads = [['#ff5ec8', 0, -1, 1, 0], ['#ffe66d', 1, 0, 0, 1], ['#5ee7ff', 0, 1, -1, 0], ['#ff9f43', -1, 0, 0, -1]];
      for (const [col, ax, ay, bx, by] of quads) {
        g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(ax * k * 0.8, ay * k * (ay < 0 ? 1.2 : 1.1)); g.lineTo(bx * k * 0.8, by * k * (by < 0 ? 1.2 : 1.1)); g.closePath(); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(1, U * 0.03);
      g.beginPath(); g.moveTo(0, -k * 1.2); g.lineTo(0, k * 1.1); g.moveTo(-k * 0.8, 0); g.lineTo(k * 0.8, 0); g.stroke();
      // 꼬리 리본
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.beginPath(); g.moveTo(0, k * 1.1); g.bezierCurveTo(U * 0.3, U * 0.9, -U * 0.3, U * 1.1, U * 0.1, U * 1.45); g.stroke();
      for (const [bx, by, col] of [[U * 0.12, U * 0.85, '#ff5ec8'], [-U * 0.06, U * 1.1, '#5ee7ff'], [U * 0.08, U * 1.35, '#ffe66d']]) {
        g.fillStyle = col; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - U * 0.08, by - U * 0.05); g.lineTo(bx - U * 0.08, by + U * 0.05); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + U * 0.08, by - U * 0.05); g.lineTo(bx + U * 0.08, by + U * 0.05); g.closePath(); g.fill();
      }
    } else if (kind === 'bird') {
      // 새 한 마리 (날개 위 · 아래 두 장)
      const up = frame ? -1 : 0.4;
      g.strokeStyle = '#1b1f3a'; g.lineWidth = Math.max(1.5, U * 0.07);
      g.beginPath(); g.moveTo(-U * 0.45, U * 0.2 * up); g.quadraticCurveTo(-U * 0.2, -U * 0.12 * up - U * 0.05, 0, U * 0.05); g.quadraticCurveTo(U * 0.2, -U * 0.12 * up - U * 0.05, U * 0.45, U * 0.2 * up); g.stroke();
    } else if (kind === 'balloon') {
      // 열기구: 줄무늬 풍선 + 바구니
      const r = U * 0.6;
      g.save(); g.beginPath(); g.arc(0, -U * 0.25, r, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(r * 0.3, U * 0.55); g.lineTo(-r * 0.3, U * 0.55); g.closePath(); g.clip();
      const cols = ['#ff5a5f', '#ffe66d', '#5ee7ff', '#ff9f43', '#ff5a5f', '#ffe66d'];
      for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.fillRect(-r + i * r / 3, -U * 0.9, r / 3 + 1, U * 1.6); }
      const sh = g.createRadialGradient(-r * 0.35, -U * 0.5, r * 0.1, 0, -U * 0.25, r * 1.2);
      sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = sh; g.fillRect(-r, -U, r * 2, U * 1.7);
      g.restore();
      g.strokeStyle = '#6a4a2a'; g.lineWidth = Math.max(1, U * 0.03);
      g.beginPath(); g.moveTo(-r * 0.3, U * 0.55); g.lineTo(-U * 0.12, U * 0.8); g.moveTo(r * 0.3, U * 0.55); g.lineTo(U * 0.12, U * 0.8); g.stroke();
      g.fillStyle = '#9a6a3a'; g.fillRect(-U * 0.14, U * 0.8, U * 0.28, U * 0.2);
    } else if (kind === 'plane') {
      // 하얀 비행기 (오른쪽으로)
      g.fillStyle = '#eef4ff';
      g.beginPath(); g.ellipse(0, 0, U * 0.7, U * 0.11, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-U * 0.05, 0); g.lineTo(-U * 0.3, U * 0.4); g.lineTo(-U * 0.15, U * 0.4); g.lineTo(U * 0.2, 0); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-U * 0.5, 0); g.lineTo(-U * 0.7, -U * 0.3); g.lineTo(-U * 0.58, -U * 0.3); g.lineTo(-U * 0.4, 0); g.closePath(); g.fill();
      g.fillStyle = '#5ee7ff';
      for (let i = 0; i < 6; i++) g.fillRect(-U * 0.3 + i * U * 0.1, -U * 0.04, U * 0.05, U * 0.04);
      g.fillStyle = '#ff5a5f'; g.beginPath(); g.arc(-U * 0.64, -U * 0.26, U * 0.03, 0, TAU); g.fill();
    } else if (kind === 'wballoon') {
      // 기상 풍선: 하얀 풍선 + 줄 + 작은 상자
      const r = U * 0.42;
      const gr = g.createRadialGradient(-r * 0.3, -U * 0.4 - r * 0.3, r * 0.1, 0, -U * 0.4, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#b8c8e0');
      g.fillStyle = gr; g.beginPath(); g.arc(0, -U * 0.4, r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(220,230,255,0.8)'; g.lineWidth = Math.max(1, U * 0.02);
      g.beginPath(); g.moveTo(0, -U * 0.4 + r); g.lineTo(0, U * 0.55); g.stroke();
      g.fillStyle = '#ff9f43'; g.fillRect(-U * 0.08, U * 0.55, U * 0.16, U * 0.12);
    } else if (kind === 'sat') {
      // 인공위성: 금빛 몸 + 파란 태양 전지판 둘 + 안테나
      g.fillStyle = '#2a5ad0';
      for (const sx of [-1, 1]) {
        g.fillRect(sx > 0 ? U * 0.18 : -U * 0.78, -U * 0.14, U * 0.6, U * 0.28);
        g.strokeStyle = 'rgba(160,210,255,0.8)'; g.lineWidth = Math.max(1, U * 0.02);
        for (let i = 1; i < 4; i++) { const xx = (sx > 0 ? U * 0.18 : -U * 0.78) + i * U * 0.15; g.beginPath(); g.moveTo(xx, -U * 0.14); g.lineTo(xx, U * 0.14); g.stroke(); }
      }
      g.fillStyle = '#9aa8b8'; g.fillRect(-U * 0.18, -U * 0.02, U * 0.36, U * 0.04);
      const body = g.createLinearGradient(-U * 0.16, 0, U * 0.16, 0);
      body.addColorStop(0, '#ffe08a'); body.addColorStop(1, '#b08a2a');
      g.fillStyle = body; g.fillRect(-U * 0.16, -U * 0.2, U * 0.32, U * 0.4);
      g.strokeStyle = '#dfe8f0'; g.lineWidth = Math.max(1, U * 0.03);
      g.beginPath(); g.moveTo(0, -U * 0.2); g.lineTo(0, -U * 0.4); g.stroke();
      g.fillStyle = '#ff5a5f'; g.beginPath(); g.arc(0, -U * 0.42, U * 0.04, 0, TAU); g.fill();
    }
    cache[key] = { c, half: W / 2 };
    return cache[key];
  }
  function decoPlace(v, cam, d) {
    const mc = midM(v, cam);
    const y = v.h * 0.42 + (mc - d.at) * v.h / SPAN_D;
    let x, U;
    if (v.side) {
      const sw = d.side < 0 ? v.cx : v.w - v.cx - v.cw;
      x = d.side < 0 ? v.cx * 0.5 : v.cx + v.cw + sw * 0.5;
      U = Math.min(sw * 0.28, v.h * 0.12) * d.size;
    } else {
      x = d.side < 0 ? v.cx + v.cw * 0.12 : v.cx + v.cw * 0.88;
      U = Math.min(v.cw * 0.14, v.h * 0.1) * d.size;
    }
    return { x, y, U: Math.max(10, U) };
  }
  // 소품: 기둥 유리 뒤 (render.js가 행성보다 먼저 부른다)
  function drawDeco(ctx, v, cam, t) {
    const tt = v.calm ? 0 : t;
    for (let i = 0; i < S.deco.length; i++) {
      const d = S.deco[i], p = decoPlace(v, cam, d);
      if (p.y < -p.U * 3 || p.y > v.h + p.U * 3) continue;
      if (d.kind === 'birds') {
        // 새 떼: 화면을 가로질러 날아간다 (날갯짓 두 장)
        const dir = d.side < 0 ? 1 : -1, span = v.w + p.U * 8;
        const lead = ((i * 331 + tt * 38) % span) - p.U * 4;
        const x0 = dir > 0 ? lead : v.w - lead;
        for (let b = 0; b < 4; b++) {
          const sp = decoSprite('bird', p.U * 0.55, v.calm ? 0 : (Math.floor(tt * 4 + b) % 2));
          const bx = x0 - dir * b * p.U * 0.7, by = p.y + (b % 2 ? 1 : -1) * b * p.U * 0.22 + Math.sin(tt * 2 + b) * 3;
          ctx.drawImage(sp.c, bx - sp.half, by - sp.half);
        }
        continue;
      }
      if (d.kind === 'moon') {
        if (!JP.Space) continue;
        const ms = JP.Space.moonSprite({ r: 1, c1: '#f2f2ee', c2: '#4a4a52', craters: true }, p.U, Math.min(v.dpr, 1.25), 9, 'deco');
        ctx.drawImage(ms.c, p.x - ms.half, p.y - ms.half, ms.half * 2, ms.half * 2);
        continue;
      }
      if (d.kind === 'plane') {
        // 비행기: 천천히 가로지르고 뒤로 하얀 비행기 구름
        const span = v.w + p.U * 6, x = ((tt * 26 + i * 170) % span) - p.U * 3;
        const g = ctx.createLinearGradient(x - p.U * 5, 0, x - p.U * 0.6, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.55)');
        ctx.fillStyle = g; ctx.fillRect(x - p.U * 5, p.y - p.U * 0.05, p.U * 4.4, p.U * 0.08);
        const sp = decoSprite('plane', p.U);
        ctx.drawImage(sp.c, x - sp.half, p.y - sp.half);
        continue;
      }
      const sp = decoSprite(d.kind, p.U);
      const bob = Math.sin(tt * 0.9 + i) * p.U * 0.06;
      if (d.kind === 'kite') {
        // 연줄: 아래로 길게
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y + bob + p.U * 0.6); ctx.quadraticCurveTo(p.x + p.U * 0.8, p.y + p.U * 3, p.x + p.U * 0.4, v.h + 10); ctx.stroke();
      }
      if (d.kind === 'sat' || d.kind === 'kite') {
        ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(d.kind === 'sat' ? 0.3 + tt * 0.08 : Math.sin(tt * 1.3) * 0.12);
        ctx.drawImage(sp.c, -sp.half, -sp.half); ctx.restore();
      } else ctx.drawImage(sp.c, p.x - sp.half, p.y + bob - sp.half);
    }
  }

  // ─── 행성 날씨 ─────────────────────────────────────────────
  // 입자는 화면 좌표. 카메라가 오르면 depth만큼 아래로 흘러 "올라가며 지나친다". 화면 밖으로 나가면 반대쪽에서 다시
  const WX = { id: null, kind: null, list: [], cam: null, bolt: 0, boltAt: 0, boltX: 0, boltFlip: 1 };
  // 지금 높이(m)의 행성 날씨와 세기 0 ~ 1 (행성 도착 fade m 앞에서 들어오고, 다음 행성 앞에서 빠진다)
  function weatherAt(m) {
    const P = D.PLANETS, F = D.WEATHER.fade;
    const stars = D.ZONES.find(z => z.id === 'stars');
    for (let i = 0; i < P.length; i++) {
      const start = P[i].at - F, end = i + 1 < P.length ? P[i + 1].at - F : (stars ? stars.from - F : P[i].at + 50);
      if (m >= start && m < end) {
        const w = D.weatherOf(P[i].id);
        if (!w) return null;
        return { id: P[i].id, w, k: Math.min(clamp01((m - start) / F), clamp01((end - m) / (F * 0.5))) };
      }
    }
    return null;
  }
  // 입자 그림: 종류·색마다 한 번
  function pSprite(kind, col) {
    const key = 'wx:' + kind + ':' + col;
    if (cache[key]) return cache[key];
    let c, g;
    const soft = (r, core) => {
      c = canvas(r * 2, r * 2); g = c.getContext('2d');
      const gr = g.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, core || col); gr.addColorStop(0.35, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    };
    if (kind === 'snow') soft(8, '#ffffff');
    else if (kind === 'ember' || kind === 'spore') soft(10, '#fffbe0');
    else if (kind === 'haze') soft(64);
    else if (kind === 'rain') {
      c = canvas(4, 30); g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, col);
      g.fillStyle = gr; g.fillRect(1, 0, 2, 30);
    } else if (kind === 'glass') {
      // 옆으로 비스듬히 날리는 유리 조각: 가는 줄 + 반짝 머리
      c = canvas(40, 16); g = c.getContext('2d');
      g.translate(20, 8); g.rotate(0.28);
      const gr = g.createLinearGradient(-18, 0, 18, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, col);
      g.fillStyle = gr; g.beginPath(); g.moveTo(-18, 0); g.lineTo(14, -2); g.lineTo(18, 0); g.lineTo(14, 2); g.closePath(); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(14, -1, 4, 2);
    } else if (kind === 'sand') {
      c = canvas(20, 6); g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 20, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col);
      g.fillStyle = gr; g.fillRect(0, 2, 20, 2);
      g.fillStyle = col; g.beginPath(); g.arc(17, 3, 2.4, 0, TAU); g.fill();
    } else if (kind === 'sparkle') {
      c = canvas(24, 24); g = c.getContext('2d');
      g.translate(12, 12);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 10); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(-12, -12, 24, 24);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(0, -11); g.lineTo(1.4, 0); g.lineTo(0, 11); g.lineTo(-1.4, 0); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-11, 0); g.lineTo(0, 1.4); g.lineTo(11, 0); g.lineTo(0, -1.4); g.closePath(); g.fill();
    } else if (kind === 'bubble') {
      c = canvas(20, 20); g = c.getContext('2d');
      g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.arc(10, 10, 8, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(7, 7, 2, 0, TAU); g.fill();
    } else soft(8);
    cache[key] = c;
    return c;
  }
  function boltSprite(h) {
    const key = 'bolt:' + Math.round(h);
    if (cache[key]) return cache[key];
    const w = h * 0.4, c = canvas(w, h), g = c.getContext('2d');
    const rand = JP.rng(Math.round(h));
    const pts = [[w * 0.5, 0]];
    let x = w * 0.5;
    for (let y = h / 8; y <= h; y += h / 8) { x = Math.max(w * 0.15, Math.min(w * 0.85, x + (rand() - 0.5) * w * 0.5)); pts.push([x, y]); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, lw] of [['rgba(255,230,160,0.25)', w * 0.2], ['rgba(255,240,200,0.6)', w * 0.06], ['#ffffff', Math.max(1.5, w * 0.02)]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    }
    cache[key] = c;
    return c;
  }
  function auroraSprite(v, col, seed) {
    const key = 'aur:' + col + ':' + seed + ':' + v.w + 'x' + v.h;
    if (cache[key]) return cache[key];
    const w = v.w * 0.7, h = v.h * 0.5, q = 0.5, c = canvas(w * q, h * q), g = c.getContext('2d');
    g.scale(q, q);
    const rand = JP.rng(seed);
    // 커튼: 세로 줄 여러 개가 물결 모양 윗선에서 아래로 흐려진다
    const n = 40;
    for (let i = 0; i < n; i++) {
      const x = w * i / n, top = h * (0.15 + 0.12 * Math.sin(i / n * TAU * 1.3 + seed) + rand() * 0.04), len = h * (0.35 + rand() * 0.3);
      const gr = g.createLinearGradient(0, top, 0, top + len);
      gr.addColorStop(0, 'rgba(' + col + ',0)'); gr.addColorStop(0.15, 'rgba(' + col + ',0.5)'); gr.addColorStop(1, 'rgba(' + col + ',0)');
      g.fillStyle = gr; g.fillRect(x, top, w / n + 1.5, len);
    }
    cache[key] = c;
    return c;
  }
  const RISE = { ember: 1, bubble: 1, spore: 0.3 };
  // 새 입자 하나: 종류마다 빠르기·크기가 다르다 (u: 화면 크기 배율)
  function spawn(kind, w, v, fresh) {
    const u = v.h / 800, slow = v.calm ? D.WEATHER.calmSpeed : 1, r = Math.random;
    const p = { x: r() * v.w, y: fresh ? r() * v.h : (RISE[kind] ? v.h + 20 : -20), vx: 0, vy: 0, s: 1, a: 1, c: r() < 0.5 ? 0 : 1, ph: r() * TAU, age: 0, life: 0, max: 0, die: 0 };
    const wind = w.wind || 0;
    if (kind === 'snow') { p.vy = (35 + r() * 55) * u; p.vx = wind * 70 * u; p.s = 0.5 + r() * 0.9; p.a = 0.6 + r() * 0.4; }
    else if (kind === 'ember') { p.vy = -(35 + r() * 80) * u; p.vx = wind * 40 * u; p.s = 0.4 + r() * 0.7; }
    else if (kind === 'rain') { p.vy = (520 + r() * 260) * u; p.vx = wind * 160 * u; p.s = 0.7 + r() * 0.6; p.a = 0.35 + r() * 0.35; }
    else if (kind === 'glass') { p.vx = (380 + r() * 220) * u * (wind < 0 ? -1 : 1); p.vy = (100 + r() * 80) * u; p.s = 0.7 + r() * 0.6; p.a = 0.55 + r() * 0.4; if (!fresh) { p.y = r() * v.h; p.x = wind < 0 ? v.w + 20 : -20; } }
    else if (kind === 'sand') { p.vx = (300 + r() * 220) * u * (wind < 0 ? -1 : 1); p.vy = (10 + r() * 30) * u; p.s = 0.6 + r() * 0.8; p.a = 0.45 + r() * 0.4; if (!fresh) { p.y = r() * v.h; p.x = wind < 0 ? v.w + 20 : -20; } }
    else if (kind === 'sparkle') { p.y = r() * v.h; p.vx = (r() - 0.5) * 8 * u; p.vy = (r() - 0.5) * 8 * u; p.s = 0.5 + r() * 0.8; p.max = p.life = 1.2 + r() * 1.8; }
    else if (kind === 'bubble') { p.vy = -(30 + r() * 50) * u; p.vx = wind * 20 * u; p.s = 0.6 + r() * 1; p.a = 0.5 + r() * 0.4; }
    else if (kind === 'spore') { p.vy = (r() - 0.6) * 20 * u; p.vx = (wind * 25 + (r() - 0.5) * 16) * u; p.s = 0.5 + r() * 0.8; }
    else if (kind === 'haze') { p.vx = (8 + r() * 14) * u * (wind < 0 ? -1 : 1); p.vy = (r() - 0.5) * 4 * u; p.s = 2 + r() * 2.5; p.a = 0.12 + r() * 0.12; }
    p.vx *= slow; p.vy *= slow;
    return p;
  }
  // 날씨 한 장면 그리기 (기둥 유리 위, 발판 아래). dt: 지난 그림에서 흐른 시간(초)
  function drawWeather(ctx, v, cam, dt, t) {
    const now = weatherAt(midM(v, cam));
    const list = WX.list;
    dt = Math.min(0.05, dt || 0);
    // 카메라가 오른 만큼 아래로 흘린다 (새 판·순간 이동이면 처음부터)
    let dy = WX.cam == null ? 0 : (cam - WX.cam) * v.scale;
    if (Math.abs(dy) > v.h * 0.8) { list.length = 0; dy = 0; WX.id = null; }
    WX.cam = cam;
    if (!now || now.id !== WX.id) { for (const p of list) if (!p.die) p.die = 0.6; WX.id = now ? now.id : null; WX.kind = now ? now.w.kind : null; }
    const kind = WX.kind, w = now && now.w;
    const calm = v.calm, cap = D.WEATHER.max;
    // 번개 · 오로라는 입자가 아니라 큰 그림
    if (w && kind === 'bolt') drawBolt(ctx, v, w, now.k, dt, t);
    if (w && kind === 'aurora') drawAurora(ctx, v, w, now.k, t);
    let want = 0;
    if (w && kind !== 'bolt' && kind !== 'aurora') want = Math.round((kind === 'haze' ? 10 : cap) * (w.amount || 0.5) * now.k * (calm ? D.WEATHER.calm : 1));
    let alive = 0;
    for (const p of list) if (!p.die) alive++;
    for (let n = 0; alive < want && n < 4 && list.length < cap; n++, alive++) list.push(Object.assign(spawn(kind, w, v, alive < want * 0.5), { kind }));
    // 넘치면 (세기가 줄 때) 몇 개씩 사라지게
    if (alive > want) { let extra = alive - want; for (const p of list) { if (extra <= 0) break; if (!p.die) { p.die = 0.5; extra--; } } }
    const depth = D.WEATHER.depth;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.die) { p.die -= dt; if (p.die <= 0) { list.splice(i, 1); continue; } }
      const sway = p.kind === 'snow' || p.kind === 'bubble' || p.kind === 'spore' ? Math.sin(t * (calm ? 0.6 : 1.4) + p.ph) * 18 * (v.h / 800) : 0;
      p.x += (p.vx + sway * 0.8) * dt;
      p.y += p.vy * dt + dy * depth * (p.kind === 'haze' ? 0.4 : 1);
      if (p.kind === 'sparkle' && !p.die) { p.life -= dt; if (p.life <= 0) { Object.assign(p, spawn('sparkle', w || {}, v, true), { kind: 'sparkle' }); } }
      if (p.y > v.h + 40) { p.y -= v.h + 70; p.x = Math.random() * v.w; }
      else if (p.y < -40) { p.y += v.h + 70; p.x = Math.random() * v.w; }
      if (p.x < -40) p.x += v.w + 70; else if (p.x > v.w + 40) p.x -= v.w + 70;
    }
    if (!list.length) return;
    const cols = (w && w.color) || ['#ffffff', '#ffffff'];
    const u = v.h / 800;
    for (const p of list) {
      const K = p.kind;
      let a = p.a * Math.min(1, p.age / 0.5) * (p.die ? Math.max(0, p.die / 0.6) : 1);
      if (K === 'ember' && !calm) a *= 0.55 + 0.45 * Math.sin(t * 7 + p.ph);
      if (K === 'spore') a *= calm ? 0.8 : 0.6 + 0.4 * Math.sin(t * 1.5 + p.ph);
      if (K === 'sparkle') a *= Math.sin(Math.PI * Math.max(0, p.life) / p.max) * (calm ? 0.7 : 1);
      if (a <= 0.01) continue;
      const img = pSprite(K, (p.kind === WX.kind ? cols : ['#ffffff', '#dddddd'])[p.c]);
      const glowK = K === 'ember' || K === 'sparkle' || K === 'spore';
      if (glowK) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, a);
      const sw = img.width * p.s * u * (K === 'haze' ? 2.2 : 1.2), sh = img.height * p.s * u * (K === 'haze' ? 2.2 : 1.2);
      if (K === 'glass' && p.vx < 0) { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(-1, 1); ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh); ctx.restore(); }
      else if (K === 'sand' && p.vx < 0) { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(-1, 1); ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh); ctx.restore(); }
      else ctx.drawImage(img, p.x - sw / 2, p.y - sh / 2, sw, sh);
      if (glowK) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
  // 번개: 멀리서 가끔 번쩍 (움직임 줄이기면 번쩍임 없이 옆 하늘이 은은하게 빛난다)
  function drawBolt(ctx, v, w, k, dt, t) {
    const side = v.side ? v.cx * 0.5 : v.w * 0.15;
    if (v.calm) {
      const g = ctx.createRadialGradient(side, v.h * 0.3, 0, side, v.h * 0.3, v.h * 0.4);
      g.addColorStop(0, 'rgba(255,235,190,' + (0.3 * k).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,235,190,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, v.w, v.h);
      return;
    }
    if (WX.bolt <= 0 && t > WX.boltAt) {
      WX.bolt = 0.35; WX.boltAt = t + (1.2 + Math.random() * 2) / Math.max(0.5, w.amount || 0.5);
      WX.boltFlip = Math.random() < 0.5 ? -1 : 1;
      WX.boltX = v.side ? (WX.boltFlip < 0 ? v.cx * (0.25 + Math.random() * 0.5) : v.cx + v.cw + (v.w - v.cx - v.cw) * (0.25 + Math.random() * 0.5)) : v.w * (0.1 + Math.random() * 0.8);
    }
    if (WX.bolt > 0) {
      WX.bolt -= dt;
      const a = Math.max(0, WX.bolt / 0.35) * k;
      ctx.fillStyle = 'rgba(255,240,210,' + (0.1 * a).toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
      const img = boltSprite(v.h * 0.45);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.drawImage(img, WX.boltX - img.width / 2, v.h * 0.05);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // 오로라: 하늘 위쪽에 두 장이 천천히 일렁인다 (움직임 줄이기면 멈춤)
  function drawAurora(ctx, v, w, k, t) {
    const hex = c => { const n = parseInt(c.slice(1), 16); return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); };
    const tt = v.calm ? 0 : t;
    ctx.globalCompositeOperation = 'lighter';
    [[0, -0.05, 11], [1, 0.35, 23]].forEach(([ci, x0, seed], i) => {
      const img = auroraSprite(v, hex(w.color[ci]), seed);
      ctx.globalAlpha = k * (0.55 + (v.calm ? 0 : 0.2 * Math.sin(tt * 0.4 + i * 2)));
      const x = v.w * x0 + Math.sin(tt * 0.15 + i * 1.7) * v.w * 0.04;
      ctx.drawImage(img, x, v.h * (0.02 + i * 0.06), v.w * 0.7, v.h * 0.5);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  JP.Sky = { paintScene, drawGround, drawCloudBank, drawCloudFront, drawEdge, drawDeco, drawWeather, weatherAt, cloudInside, clear };
})(JP);
