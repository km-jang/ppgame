'use strict';
// 캔버스 그리기. 게임 상태를 읽기만 하고 바꾸지 않는다.
(function (NG) {
  const TAU = Math.PI * 2;
  const D = NG.DATA;

  function poly(ctx, x, y, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + TAU * i / sides;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // 뾰족 별 (보스 스타 크러셔)
  function star(ctx, x, y, r, n, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + Math.PI * i / n, rr = i % 2 ? r * inner : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  // 톱니 (보스 톱날 군주): 이빨이 한쪽으로 기운 원
  function saw(ctx, x, y, r, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = rot + TAU * i / n, a1 = rot + TAU * (i + 0.7) / n;
      const p0x = x + Math.cos(a0) * r * 0.78, p0y = y + Math.sin(a0) * r * 0.78;
      if (i === 0) ctx.moveTo(p0x, p0y); else ctx.lineTo(p0x, p0y);
      ctx.lineTo(x + Math.cos(a1) * r * 1.12, y + Math.sin(a1) * r * 1.12);
    }
    ctx.closePath();
  }

  function shapePath(ctx, e) {
    const { x, y, r } = e;
    if (e.look) {
      switch (e.look.shape) {
        case 'star': star(ctx, x, y, r * 1.18, 6, 0.58, e.ang * 0.6); return;
        case 'hex': poly(ctx, x, y, r * 1.02, 6, e.ang * 0.15); return;
        case 'eye': ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.82, 0, 0, TAU); return;
        case 'saw': saw(ctx, x, y, r, 12, e.ang * 1.6); return;
        default: poly(ctx, x, y, r, 8, e.ang * 0.3); return;
      }
    }
    switch (e.def.shape) {
      case 'tri': poly(ctx, x, y, r * 1.2, 3, Math.atan2(e.vy, e.vx)); break;
      case 'diamond': poly(ctx, x, y, r * 1.15, 4, 0); break;
      case 'square': poly(ctx, x, y, r * 1.2, 4, e.ang); break;
      case 'penta': poly(ctx, x, y, r * 1.1, 5, e.ang); break;
      case 'octa': poly(ctx, x, y, r, 8, e.ang * 0.3); break;
      default: ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    }
  }

  // ─── 배경 ─────────────────────────────────────────────────
  // 층: ①성운 배경(저해상도로 미리 그려 늘려 찍음, 가장자리 어둡게 포함) ②별 3겹 시차 스크롤
  //     ③네온 격자(미리 그림, 큰 폭발 때 번쩍) ④보스전 붉은 테두리 맥동
  // 웨이브가 오를수록 테마가 바뀐다 (청록 → 보라 → 자홍 → 불씨), 보스 웨이브는 핏빛
  const THEMES = [
    { from: 1,  base: '#05070c', a: '#0d4a6b', b: '#10284f', grid: '94,231,255' },
    { from: 5,  base: '#07050e', a: '#3d1f7a', b: '#0f3b63', grid: '170,150,255' },
    { from: 10, base: '#0a050b', a: '#6b1a55', b: '#2b1a6b', grid: '255,120,200' },
    { from: 15, base: '#0b0605', a: '#7a3510', b: '#5a0f35', grid: '255,170,90' },
  ];
  const BOSS_THEME = { base: '#0b0406', a: '#6b0a26', b: '#2a0712', grid: '255,70,120' };

  // 보스마다 배경색이 다르다 (같은 객체를 돌려줘야 배경을 다시 그리지 않는다)
  const bossThemes = {};
  function bossTheme(look) {
    if (!look) return BOSS_THEME;
    if (!bossThemes[look.id]) bossThemes[look.id] = Object.assign({ from: 100 + D.BOSSES.indexOf(look) }, look.theme);
    return bossThemes[look.id];
  }
  const bossOf = W => W.enemies.find(e => e.type === 'boss');
  function themeFor(W) {
    if (W.bossWave && bossOf(W)) return bossTheme(bossOf(W).look);
    let t = THEMES[0];
    for (const th of THEMES) if (W.wave >= th.from) t = th;
    return t;
  }

  // 성운: 1/4 해상도 캔버스에 흐릿한 빛 덩어리 몇 개 + 가장자리 어둡게
  function paintBackdrop(th, w, h) {
    const s = 0.25;
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * s)); c.height = Math.max(8, Math.round(h * s));
    const g = c.getContext('2d');
    g.scale(s, s);
    g.fillStyle = th.base;
    g.fillRect(0, 0, w, h);
    const rand = NG.rng(th.a.length * 97 + th.from * 31 + 7);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = rand() * w, y = rand() * h, rad = Math.max(w, h) * (0.25 + rand() * 0.35);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, i % 2 ? th.a : th.b);
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

  function paintGrid(ctx, w, h, rgb) {
    ctx.strokeStyle = 'rgba(' + rgb + ',0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = 0; y <= h; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(' + rgb + ',0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  function makeStars(w, h) {
    const rand = NG.rng(4242);
    const layers = [
      { n: 70, size: 1,   alpha: 0.35, drift: 4,  par: 0.015 },
      { n: 40, size: 1.6, alpha: 0.55, drift: 10, par: 0.04 },
      { n: 18, size: 2.4, alpha: 0.85, drift: 22, par: 0.08 },
    ];
    const area = (w * h) / (1280 * 800); // 화면 넓이에 비례해 개수 조절
    for (const L of layers) {
      L.stars = [];
      const n = Math.max(6, Math.round(L.n * area));
      for (let i = 0; i < n; i++) L.stars.push({ x: rand() * w, y: rand() * h, ph: rand() * TAU });
    }
    return layers;
  }

  const bg = { key: '', w: 0, h: 0, dpr: 0, backdrop: null, prev: null, fade: 0, grid: null, stars: null, theme: null, last: 0 };

  function drawBackground(ctx, W, dpr) {
    const th = themeFor(W);
    const now = performance.now();
    const rdt = Math.min(0.1, (now - (bg.last || now)) / 1000);
    bg.last = now;
    const sizeChanged = bg.w !== W.w || bg.h !== W.h || bg.dpr !== dpr;
    if (sizeChanged) {
      bg.w = W.w; bg.h = W.h; bg.dpr = dpr;
      bg.stars = makeStars(W.w, W.h);
      bg.theme = null;
      bg.prev = null;
    }
    if (bg.theme !== th) {
      // 테마가 바뀌면 1.5초에 걸쳐 새 성운으로 넘어간다
      if (bg.backdrop && !sizeChanged) { bg.prev = bg.backdrop; bg.fade = 1; }
      bg.backdrop = paintBackdrop(th, W.w, W.h);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W.w * dpr)); c.height = Math.max(1, Math.round(W.h * dpr));
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      paintGrid(g, W.w, W.h, th.grid);
      bg.grid = c;
      bg.theme = th;
    }

    // 플레이어 위치에 따라 배경이 살짝 반대로 밀린다 (깊이감)
    const p = W.player;
    const px = W.w / 2 - p.x, py = W.h / 2 - p.y;

    const m = 24;
    ctx.drawImage(bg.backdrop, -m + px * 0.01, -m + py * 0.01, W.w + m * 2, W.h + m * 2);
    if (bg.prev && bg.fade > 0) {
      ctx.globalAlpha = bg.fade;
      ctx.drawImage(bg.prev, -m + px * 0.01, -m + py * 0.01, W.w + m * 2, W.h + m * 2);
      ctx.globalAlpha = 1;
      bg.fade -= rdt / 1.5;
      if (bg.fade <= 0) bg.prev = null;
    }

    // 별: 천천히 흘러가고 반짝인다. 가까운 층일수록 빠르고 크다
    ctx.fillStyle = '#e8f7ff';
    const t = now / 1000;
    for (const L of bg.stars) {
      const ox = px * L.par - t * L.drift * 0.35, oy = py * L.par + t * L.drift;
      for (const s of L.stars) {
        let x = (s.x + ox) % W.w; if (x < 0) x += W.w;
        let y = (s.y + oy) % W.h; if (y < 0) y += W.h;
        ctx.globalAlpha = L.alpha * (0.65 + 0.35 * Math.sin(t * 2 + s.ph));
        ctx.fillRect(x, y, L.size, L.size);
      }
    }
    ctx.globalAlpha = 1;

    // 격자: 웨이브가 오를수록 선명해지고, 큰 폭발 때 번쩍인다
    const tier = Math.min(3, Math.floor((W.wave - 1) / 5));
    ctx.globalAlpha = 0.65 + tier * 0.1;
    ctx.drawImage(bg.grid, 0, 0, W.w, W.h);
    if (W.pulse > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, W.pulse * 1.4);
      ctx.drawImage(bg.grid, 0, 0, W.w, W.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  // 보스전: 화면 가장자리가 심장 박동처럼 붉게 뛴다
  let dangerCache = null;
  function drawDanger(ctx, W) {
    const boss = W.bossWave && bossOf(W);
    if (!boss) return;
    const tint = boss.look ? boss.look.glow : '255,30,80';
    if (!dangerCache || dangerCache.w !== W.w || dangerCache.h !== W.h || dangerCache.tint !== tint) {
      const s = 0.25;
      const c = document.createElement('canvas');
      c.width = Math.max(8, Math.round(W.w * s)); c.height = Math.max(8, Math.round(W.h * s));
      const g = c.getContext('2d');
      g.scale(s, s);
      const v = g.createRadialGradient(W.w / 2, W.h / 2, Math.min(W.w, W.h) * 0.35, W.w / 2, W.h / 2, Math.hypot(W.w, W.h) * 0.55);
      v.addColorStop(0, 'rgba(' + tint + ',0)');
      v.addColorStop(1, 'rgba(' + tint + ',0.55)');
      g.fillStyle = v;
      g.fillRect(0, 0, W.w, W.h);
      dangerCache = { c, w: W.w, h: W.h, tint };
    }
    const beat = Math.pow(Math.max(0, Math.sin(performance.now() / 1000 * 2.4 * Math.PI)), 6);
    ctx.globalAlpha = 0.35 + beat * 0.5;
    ctx.drawImage(dangerCache.c, 0, 0, W.w, W.h);
    ctx.globalAlpha = 1;
  }

  const glowCache = {};
  function glow(ctx, color, x, y, radius, alpha) {
    const key = color + radius;
    let c = glowCache[key];
    if (!c) {
      c = document.createElement('canvas');
      const s = radius * 2;
      c.width = c.height = s;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      glowCache[key] = c;
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, x - radius, y - radius);
    ctx.globalAlpha = 1;
  }

  function drawEnemies(ctx, W) {
    for (const e of W.enemies) {
      if (e.spawnT > 0) {
        // 등장 경고 원
        const k = 1 - e.spawnT / D.WAVE.spawnWarn;
        ctx.strokeStyle = e.def.color;
        ctx.globalAlpha = 0.35 + 0.5 * k;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.8 - 0.8 * k), 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        continue;
      }
      if (e.type === 'boss') glow(ctx, 'rgba(' + (e.look ? e.look.glow : '255,46,136') + ',0.55)', e.x, e.y, Math.round(e.r * 1.8), 1);
      if (e.look) bossBack(ctx, e, W);
      shapePath(ctx, e);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.look ? e.look.color : e.def.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      if (e.look) { bossFront(ctx, e, W); continue; }
      // 사수는 눈으로 조준 방향 표시
      if (e.type === 'shooter' || e.type === 'boss') {
        const a = Math.atan2(W.player.y - e.y, W.player.x - e.x);
        ctx.fillStyle = '#07080d';
        ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * e.r * 0.45, e.y + Math.sin(a) * e.r * 0.45, e.r * 0.22, 0, TAU); ctx.fill();
      }
      // 체력바 (다친 일반 적만)
      if (e.type !== 'boss' && e.hp < e.maxHp) {
        const w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, 3);
        ctx.fillStyle = e.def.color;
        ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * Math.max(0, e.hp / e.maxHp), 3);
      }
    }
  }

  // ─── 보스 꾸밈: 모양마다 뒤(몸 아래)와 앞(몸 위)에 한 겹씩 ───
  function bossBack(ctx, e, W) {
    const { x, y, r } = e, L = e.look;
    ctx.strokeStyle = L.color;
    if (L.shape === 'hex') {
      // 바깥을 도는 방패 조각 6개
      ctx.lineWidth = r * 0.14;
      for (let i = 0; i < 6; i++) { const a = -e.ang * 0.9 + TAU * i / 6; ctx.beginPath(); ctx.arc(x, y, r * L.atk.shieldR, a, a + L.atk.shieldArc); ctx.stroke(); }
    } else if (L.shape === 'eye') {
      // 속눈썹 가시 10개
      ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = e.ang * 0.4 + TAU * i / 10; ctx.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.7); ctx.lineTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.15); }
      ctx.stroke(); ctx.lineCap = 'butt';
    } else if (L.shape === 'star') {
      // 뒤에서 반대로 도는 옅은 별
      ctx.globalAlpha = 0.35; star(ctx, x, y, r * 1.45, 6, 0.5, -e.ang * 0.4 + 0.5); ctx.fillStyle = L.color; ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  function bossFront(ctx, e, W) {
    const { x, y, r } = e, L = e.look;
    const a = Math.atan2(W.player.y - y, W.player.x - x);
    const dark = '#07080d';
    if (L.shape === 'eye') {
      // 흰자 · 큰 눈동자가 플레이어를 따라본다
      ctx.fillStyle = '#f2ecff'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.78, r * 0.55, 0, 0, TAU); ctx.fill();
      const ix = x + Math.cos(a) * r * 0.3, iy = y + Math.sin(a) * r * 0.2;
      ctx.fillStyle = L.color; ctx.beginPath(); ctx.arc(ix, iy, r * 0.36, 0, TAU); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(ix, iy, r * 0.18, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ix - r * 0.1, iy - r * 0.1, r * 0.06, 0, TAU); ctx.fill();
      return;
    }
    if (L.shape === 'saw') {
      // 가운데 볼트와 회전 무늬
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
      ctx.strokeStyle = L.color; ctx.lineWidth = r * 0.07;
      for (let i = 0; i < 3; i++) { const b = e.ang * 1.6 + TAU * i / 3; ctx.beginPath(); ctx.arc(x, y, r * 0.62, b, b + 1.2); ctx.stroke(); }
    } else if (L.shape === 'hex') {
      ctx.fillStyle = dark; poly(ctx, x, y, r * 0.55, 6, e.ang * 0.15 + Math.PI / 6); ctx.fill();
      ctx.strokeStyle = L.color; ctx.lineWidth = 3; ctx.stroke();
    } else if (L.shape === 'star') {
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = dark; poly(ctx, x, y, r * 0.5, 8, e.ang * 0.3); ctx.fill();
    }
    // 조준하는 눈 (보스 색으로 빛남)
    const ex = x + Math.cos(a) * r * 0.2, ey = y + Math.sin(a) * r * 0.2;
    glow(ctx, 'rgba(' + L.glow + ',0.9)', ex, ey, Math.round(r * 0.5), 0.9);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex, ey, r * 0.16, 0, TAU); ctx.fill();
  }

  function drawPlayer(ctx, W) {
    const p = W.player;
    const g = p.gun;
    const blink = p.iframe > 0 && p.dashT <= 0 && Math.floor(W.t * 20) % 2 === 0;
    if (W.phase === 'over') return;

    // 드론
    if (p.drones > 0) {
      const DR = D.DRONE;
      ctx.fillStyle = p.passive === 'hive' && p.look ? '#a6ffc9' : '#b8f2ff';
      for (let i = 0; i < p.drones; i++) {
        const a = p.droneAng + TAU * i / p.drones;
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * DR.radius, p.y + Math.sin(a) * DR.radius, DR.r, 0, TAU); ctx.fill();
      }
    }
    if (blink) return;

    // 총열 N개를 부채꼴로
    const n = g.barrels;
    const spread = Math.min(g.spreadStep * (n - 1), g.spreadMax);
    ctx.strokeStyle = '#ffe66d';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = p.aim + (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1));
      ctx.moveTo(p.x + Math.cos(a) * p.r * 0.5, p.y + Math.sin(a) * p.r * 0.5);
      ctx.lineTo(p.x + Math.cos(a) * (p.r + 10), p.y + Math.sin(a) * (p.r + 10));
    }
    ctx.stroke();

    // 총구 화염
    if (p.muzzle > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,230,109,' + (p.muzzle / 0.05) + ')';
      for (let i = 0; i < n; i++) {
        const a = p.aim + (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1));
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * (p.r + 13), p.y + Math.sin(a) * (p.r + 13), 5, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // 필살기 준비됨: 금빛 기운이 맥박친다. 발동 직후엔 크게 번쩍
    if (p.ult >= D.ULT.need || p.ultT > 0) {
      const pulse = p.ultT > 0 ? 1 : 0.55 + Math.sin(W.t * 7) * 0.25;
      glow(ctx, 'rgba(255,207,58,0.7)', p.x, p.y, p.ultT > 0 ? 70 : 46, pulse);
    }
    // 과열: 붉은 기운
    if (p.heatT > 0) glow(ctx, 'rgba(255,122,61,0.7)', p.x, p.y, 40, 0.6 + 0.3 * Math.sin(W.t * 18));
    const look = p.look || SHIP0;
    glow(ctx, 'rgba(' + look.glow + ',0.6)', p.x, p.y, 34, p.dashT > 0 ? 1 : 0.7);
    drawShip(ctx, look, p.x, p.y, p.r, p.aim, p.dashT > 0);
    // 방패: 기체를 감싸는 푸른 육각 고리
    if (p.shield > 0) {
      ctx.strokeStyle = 'rgba(94,231,255,0.85)';
      ctx.lineWidth = 2.5;
      poly(ctx, p.x, p.y, p.r + 11, 6, W.t * 1.2);
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#5ee7ff';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // 기체 모양 (게임 안 + 상점·시작 화면 미리보기). look: data.js SHIPS 한 칸, rot: 앞 방향, white: 대시 중 흰색
  const SHIP0 = { shape: 'circle', color: '#5ee7ff', glow: '94,231,255' };
  function drawShip(ctx, look, x, y, r, rot, white) {
    const L = look || SHIP0;
    ctx.fillStyle = white ? '#ffffff' : L.color;
    switch (L.shape) {
      case 'tri': poly(ctx, x, y, r * 1.45, 3, rot); break;
      case 'square': poly(ctx, x, y, r * 1.4, 4, rot + Math.PI / 4); break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(rot) * r * 1.75, y + Math.sin(rot) * r * 1.75);
        ctx.lineTo(x + Math.cos(rot + 1.57) * r * 0.85, y + Math.sin(rot + 1.57) * r * 0.85);
        ctx.lineTo(x - Math.cos(rot) * r * 1.05, y - Math.sin(rot) * r * 1.05);
        ctx.lineTo(x + Math.cos(rot - 1.57) * r * 0.85, y + Math.sin(rot - 1.57) * r * 0.85);
        ctx.closePath();
        break;
      case 'hex': poly(ctx, x, y, r * 1.25, 6, rot); break;
      case 'star': star(ctx, x, y, r * 1.5, 5, 0.5, rot); break;
      default: ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
    // 가운데 조종석: 어두운 알 + 앞쪽 빛
    ctx.fillStyle = '#07080d';
    ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = white ? '#5ee7ff' : L.color;
    ctx.beginPath(); ctx.arc(x + Math.cos(rot) * r * 0.16, y + Math.sin(rot) * r * 0.16, r * 0.17, 0, TAU); ctx.fill();
  }

  // 필살기 충격파: 금빛 굵은 고리 + 총열 N×3개의 빛줄기가 함께 퍼진다
  function drawShocks(ctx, W) {
    if (!W.shocks || !W.shocks.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const s of W.shocks) {
      const k = s.r / s.max, a = Math.max(0, 1 - k);
      // 안쪽 옅은 빛
      ctx.globalAlpha = 0.18 * a;
      ctx.fillStyle = '#ffcf3a';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      // 굵은 고리 두 겹
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 14 * a + 4;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, s.r - 10), 0, TAU); ctx.stroke();
      // 빛줄기
      ctx.strokeStyle = '#fff4c2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        const ang = s.rot + TAU * i / s.n;
        const c = Math.cos(ang), sn = Math.sin(ang);
        ctx.moveTo(s.x + c * s.r * 0.72, s.y + sn * s.r * 0.72);
        ctx.lineTo(s.x + c * (s.r + 18), s.y + sn * (s.r + 18));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBullets(ctx, W) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffe66d';
    for (const b of W.bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const b of W.eBullets) {
      // 보스마다 탄 모양이 다르다: 별(호박) · 육각(민트) · 따라오는 구슬(보라) · 톱날(은)
      if (b.k === 'star') {
        ctx.fillStyle = '#ffb703'; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = W.t * 6 + Math.PI * i / 4, rr = i % 2 ? b.r * 0.6 : b.r * 1.7; ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff4c2'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, TAU); ctx.fill();
      } else if (b.k === 'hex') {
        ctx.fillStyle = '#06d6a0'; ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + TAU * i / 6; ctx.lineTo(b.x + Math.cos(a) * (b.r + 2), b.y + Math.sin(a) * (b.r + 2)); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d9fff3'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 2, 0, TAU); ctx.fill();
      } else if (b.k === 'orb') {
        glow(ctx, 'rgba(155,107,255,0.8)', b.x, b.y, 22, 0.9);
        ctx.fillStyle = '#9b6bff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#07080d'; ctx.beginPath(); ctx.arc(b.x + b.vx * 0.012, b.y + b.vy * 0.012, b.r * 0.45, 0, TAU); ctx.fill();
      } else if (b.k === 'blade') {
        const a0 = W.t * 14;
        ctx.fillStyle = '#dfe7f2'; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = a0 + i * Math.PI / 2; ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(a) * (b.r + 5), b.y + Math.sin(a) * (b.r + 5)); ctx.lineTo(b.x + Math.cos(a + 0.9) * (b.r + 1), b.y + Math.sin(a + 0.9) * (b.r + 1)); }
        ctx.fill();
        ctx.fillStyle = '#6b7a90'; ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = '#ff3df2';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd6fb';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1.5, 0, TAU); ctx.fill();
      }
    }
  }

  // 보스 예고선: 스타 크러셔 돌진 방향, 보이드 아이 레이저 (예고 → 발사)
  function drawWarnings(ctx, W) {
    const far = Math.hypot(W.w, W.h);
    for (const e of W.enemies) {
      if (!(e.warnT > 0)) continue;
      const k = 1 - e.warnT / e.look.atk.chargeWarn, c = Math.cos(e.chargeA), s = Math.sin(e.chargeA);
      ctx.strokeStyle = 'rgba(255,183,3,' + (0.25 + k * 0.6) + ')';
      ctx.lineWidth = e.r * 1.6 * (0.3 + k * 0.7);
      ctx.setLineDash([18, 12]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + c * far, e.y + s * far); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const L of W.lasers) {
      if (L.x == null) continue;
      const c = Math.cos(L.ang), s = Math.sin(L.ang), x2 = L.x + c * far, y2 = L.y + s * far;
      if (L.t < L.warn) {
        const k = L.t / L.warn, blink = Math.floor(L.t * (k > 0.6 ? 16 : 8)) % 2;
        ctx.strokeStyle = 'rgba(155,107,255,' + (0.3 + k * 0.5 + blink * 0.15) + ')';
        ctx.lineWidth = 2 + k * 3;
        ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(x2, y2); ctx.stroke();
      } else {
        const k = 1 - (L.t - L.warn) / L.on;
        ctx.globalCompositeOperation = 'lighter';
        for (const [w, col] of [[L.w * 1.8, 'rgba(155,107,255,0.35)'], [L.w, 'rgba(200,170,255,0.8)'], [L.w * 0.35, 'rgba(255,255,255,0.95)']]) {
          ctx.strokeStyle = col; ctx.lineWidth = w * (0.6 + k * 0.4);
          ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(x2, y2); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  // 게임 중 아이템: 코인은 도는 금화, 나머지는 색 고리 안에 그림 (방패 육각·과열 겹화살·자석 말굽·폭탄)
  function drawItem(ctx, d, t) {
    const I = D.ITEMS[d.type];
    if (!I) return;
    const bob = Math.sin(t * 4 + (d.ph || 0)) * 2;
    const x = d.x, y = d.y + bob;
    if (d.type === 'coin') {
      const sx = Math.max(0.25, Math.abs(Math.cos(t * 5 + (d.ph || 0))));
      glow(ctx, 'rgba(255,210,63,0.55)', x, y, 16, 0.8);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(x, y, 7 * sx, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b37a00';
      ctx.beginPath(); ctx.ellipse(x, y, 3.2 * sx, 3.2, 0, 0, TAU); ctx.fill();
      return;
    }
    glow(ctx, I.color, x, y, 22, 0.45 + 0.2 * Math.sin(t * 6 + (d.ph || 0)));
    ctx.fillStyle = 'rgba(7,8,13,0.85)';
    ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = I.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = I.color;
    ctx.lineCap = 'round';
    if (d.type === 'shield') {
      poly(ctx, x, y, 6.5, 6, Math.PI / 6); ctx.lineWidth = 2; ctx.stroke();
    } else if (d.type === 'heat') {
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (const o of [-3, 2]) { ctx.moveTo(x + o - 2.5, y - 5); ctx.lineTo(x + o + 2.5, y); ctx.lineTo(x + o - 2.5, y + 5); }
      ctx.stroke();
    } else if (d.type === 'magnet') {
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - 0.5, 4.5, Math.PI, 0, true); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 4.5, y - 0.5); ctx.lineTo(x - 4.5, y - 5); ctx.moveTo(x + 4.5, y - 0.5); ctx.lineTo(x + 4.5, y - 5); ctx.stroke();
    } else if (d.type === 'bomb') {
      ctx.beginPath(); ctx.arc(x - 1, y + 1.5, 4.8, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffe66d';
      ctx.beginPath(); ctx.moveTo(x + 2, y - 2); ctx.lineTo(x + 4.5, y - 6); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function drawFx(ctx, W) {
    for (const d of W.drops) {
      const blink = d.life < 3 && Math.floor(d.life * 8) % 2 === 0;
      if (blink) continue;
      if (!d.type || d.type === 'heal') {
        ctx.fillStyle = '#3dff8b';
        ctx.fillRect(d.x - 3, d.y - 9, 6, 18);
        ctx.fillRect(d.x - 9, d.y - 3, 18, 6);
      } else drawItem(ctx, d, W.t);
    }
    for (const q of W.particles) {
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a;
      if (q.ring) {
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 2 + a * 4;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.2 - a * 0.9), 0, TAU); ctx.stroke();
      } else if (q.shard) {
        // 회전하며 날아가는 삼각 파편
        const s = q.size * (0.5 + a * 0.5);
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.moveTo(q.x + Math.cos(q.rot) * s, q.y + Math.sin(q.rot) * s);
        ctx.lineTo(q.x + Math.cos(q.rot + 2.4) * s * 0.7, q.y + Math.sin(q.rot + 2.4) * s * 0.7);
        ctx.lineTo(q.x + Math.cos(q.rot + 4.0) * s * 0.8, q.y + Math.sin(q.rot + 4.0) * s * 0.8);
        ctx.closePath();
        ctx.fill();
      } else if (q.pop) {
        // 처치 순간 흰 섬광
        ctx.fillStyle = q.color;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.6 - a * 0.6), 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const t of W.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = t.col || (t.heal ? '#3dff8b' : '#ffe66d');
      ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  const NUM = '"Rajdhani", system-ui, sans-serif', DISP = '"Jua", system-ui, sans-serif';
  // 켜져 있는 아이템 효과: 게이지 아래 작은 칸을 세로로 (방패 · 과열 남은 초 · 자석 남은 초, 남은 시간 막대)
  function drawEffectChips(ctx, W, x, y, s) {
    const p = W.player, I = D.ITEMS;
    if (!I) return;
    const list = [];
    if (p.shield > 0) list.push([I.shield.color, '방패', '', 1]);
    if (p.heatT > 0) list.push([I.heat.color, '과열', p.heatT.toFixed(1), p.heatT / I.heat.time]);
    if (p.magT > 0) list.push([I.magnet.color, '자석', p.magT.toFixed(1), p.magT / I.magnet.time]);
    const h = 17 * s, w = 76 * s;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    list.forEach((c, i) => {
      const cy = y + i * (h + 3 * s);
      ctx.fillStyle = 'rgba(12,16,26,0.78)';
      ctx.fillRect(x, cy, w, h);
      ctx.fillStyle = c[0];
      ctx.fillRect(x, cy, 3 * s, h);
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x + 3 * s, cy + h - 2 * s, (w - 3 * s) * Math.max(0, Math.min(1, c[3])), 2 * s);
      ctx.globalAlpha = 1;
      ctx.font = Math.round(12 * s) + 'px ' + DISP;
      ctx.fillText(c[1], x + 8 * s, cy + h / 2 + 0.5);
      if (c[2]) {
        ctx.textAlign = 'right';
        ctx.font = '700 ' + Math.round(12 * s) + 'px ' + NUM;
        ctx.fillStyle = '#e8f7ff';
        ctx.fillText(c[2], x + w - 5 * s, cy + h / 2 + 0.5);
        ctx.textAlign = 'left';
      }
    });
    ctx.textBaseline = 'top';
  }

  function drawHud(ctx, W, view) {
    const p = W.player;
    const top = view.hudTop;
    const s = view.ui || 1; // 터치 기기에서 글자·칸을 키운다
    const right = W.w - view.hudRight;
    ctx.textBaseline = 'top';

    // 체력 칸 (많아지면 줄을 바꾼다)
    const x0 = view.hudLeft;
    const cell = 16 * s, perRow = Math.max(5, Math.floor((right - 120 * s - x0) / cell));
    for (let i = 0; i < p.maxHp; i++) {
      const hx = x0 + (i % perRow) * cell, hy = top + 2 + Math.floor(i / perRow) * cell, hs = 12 * s;
      const on = i < p.hp;
      ctx.fillStyle = on ? '#ff4d6d' : 'rgba(255,77,109,0.16)';
      if (on) { ctx.shadowColor = 'rgba(255,77,109,0.8)'; ctx.shadowBlur = 6; }
      ctx.beginPath(); ctx.moveTo(hx + hs * 0.25, hy); ctx.lineTo(hx + hs, hy); ctx.lineTo(hx + hs * 0.75, hy + hs); ctx.lineTo(hx, hy + hs); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
    const rows = Math.ceil(p.maxHp / perRow);
    // 대시 게이지
    const k = 1 - p.dashCd / p.dashCdMax;
    const gy = top + 2 + rows * cell + 4;
    ctx.fillStyle = 'rgba(94,231,255,0.16)';
    ctx.fillRect(x0, gy, 76 * s, 5 * s);
    ctx.fillStyle = k >= 1 ? '#5ee7ff' : '#2b7f91';
    if (k >= 1) { ctx.shadowColor = '#5ee7ff'; ctx.shadowBlur = 8; }
    ctx.fillRect(x0, gy, 76 * s * k, 5 * s);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.font = '700 ' + Math.round(11 * s) + 'px ' + NUM;
    ctx.fillStyle = k >= 1 ? '#5ee7ff' : '#4a7f8c';
    ctx.fillText('DASH', x0 + 80 * s, gy - 3 * s);
    // 필살기 게이지
    const u = Math.min(1, p.ult / D.ULT.need), uy = gy + 14 * s, full = u >= 1;
    ctx.fillStyle = 'rgba(255,207,58,0.16)';
    ctx.fillRect(x0, uy, 76 * s, 5 * s);
    ctx.fillStyle = full ? '#ffd23f' : '#a67c12';
    if (full) { ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 10; }
    ctx.fillRect(x0, uy, 76 * s * u, 5 * s);
    ctx.shadowBlur = 0;
    ctx.fillStyle = full ? (Math.floor(W.t * 3) % 2 ? '#fff4c2' : '#ffd23f') : '#8a6d2a';
    ctx.fillText(full ? (view.ui > 1 ? 'N-BURST!' : 'N-BURST [Q]') : 'N-BURST', x0 + 80 * s, uy - 3 * s);
    drawEffectChips(ctx, W, x0, uy + 12 * s, s);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8f7ff';
    ctx.font = '700 ' + Math.round(26 * s) + 'px ' + NUM;
    ctx.fillText(W.score.toLocaleString(), right, top - 4 * s);
    // WAVE · N · 시간을 작은 칸으로
    ctx.font = '700 ' + Math.round(13 * s) + 'px ' + NUM;
    const chips = [['WAVE', W.wave], ['N', p.gun.barrels], ['', NG.fmtTime(W.stats.time)]];
    let cx = right;
    for (let i = chips.length - 1; i >= 0; i--) {
      const txt = (chips[i][0] ? chips[i][0] + ' ' : '') + chips[i][1];
      const w = ctx.measureText(txt).width + 14 * s;
      ctx.fillStyle = 'rgba(12,16,26,0.72)';
      ctx.fillRect(cx - w, top + 26 * s, w, 18 * s);
      ctx.fillStyle = i === 1 ? '#ffe66d' : '#bcd3e2';
      ctx.fillText(txt, cx - 7 * s, top + 28.5 * s);
      cx -= w + 4 * s;
    }

    // 보스 체력바
    const boss = W.enemies.find(e => e.type === 'boss' && e.spawnT <= 0);
    const by = Math.max(top + 44 * s, gy + 28 * s);
    if (boss) {
      const bw = Math.min(420, W.w - 40), bx = (W.w - bw) / 2;
      const L = boss.look, col = L ? L.color : '#ff2e88', rgb = L ? L.glow : '255,46,136';
      ctx.fillStyle = 'rgba(' + rgb + ',0.2)';
      ctx.fillRect(bx, by, bw, 8);
      ctx.fillStyle = col;
      ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 8);
      ctx.textAlign = 'center';
      ctx.fillStyle = col;
      ctx.font = '700 13px ' + NUM;
      ctx.fillText('BOSS #' + (W.bossKills + 1), W.w / 2 - 6, by + 12);
      if (L) {
        ctx.font = Math.round(14) + 'px ' + DISP;
        ctx.textAlign = 'left';
        ctx.fillText(L.name + (boss.mk > 1 ? ' MK' + boss.mk : ''), W.w / 2 + 34, by + 12);
        ctx.textAlign = 'center';
      }
    }

    drawCombo(ctx, W, view, right, boss ? by + 26 : top + 50 * s);

    // 웨이브 알림
    if (W.banner > 0 && W.phase === 'play') {
      const a = Math.min(1, W.banner, (D.WAVE.banner - W.banner) * 4);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.min(64, Math.round(W.w / 7));
      const ty = W.h * 0.38, slide = view.calm ? 0 : (1 - Math.min(1, (D.WAVE.banner - W.banner) * 3)) * 40;
      ctx.font = 'italic 700 ' + fs + 'px ' + NUM;
      const nb = NG.World.bossLook(W.bossKills);   // 이번 웨이브에 나올 보스
      ctx.fillStyle = W.bossWave ? nb.color : '#e8f7ff';
      ctx.shadowColor = W.bossWave ? 'rgba(' + nb.glow + ',0.8)' : 'rgba(94,231,255,0.7)'; ctx.shadowBlur = 20;
      ctx.fillText(W.bossWave ? 'BOSS WAVE' : 'WAVE ' + W.wave, W.w / 2 + slide, ty);
      ctx.shadowBlur = 0;
      ctx.font = Math.round(fs * 0.32) + 'px ' + DISP;
      ctx.fillStyle = W.bossWave ? '#ffffff' : '#8aa4b8';
      ctx.fillText(W.bossWave ? nb.name + (W.bossKills >= D.BOSSES.length ? ' MK' + (Math.floor(W.bossKills / D.BOSSES.length) + 1) : '') + ' 등장!' : '끝까지 버텨라', W.w / 2 - slide, ty + fs * 0.62);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 연속 처치 콤보: 오른쪽 위 점수 아래. 잡을 때마다 튀어 오르고, 끊기기까지 남은 시간을 막대로
  // 색: 3~9 청록 · 10~24 노랑 · 25~49 주황 · 50~ 분홍
  function drawCombo(ctx, W, view, right, y) {
    const C = D.COMBO, n = W.combo;
    if (n < C.show || W.phase !== 'play') return;
    const s = view.ui || 1;
    const pop = view.calm ? 0 : W.comboPop;
    const col = n >= 50 ? '#ff2e88' : n >= 25 ? '#ffb703' : n >= 10 ? '#ffe66d' : '#5ee7ff';
    const fs = Math.round(24 * s * (1 + 0.4 * pop * pop));
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = 'italic 700 ' + fs + 'px ' + NUM;
    const txt = 'x' + n + ' COMBO';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(txt, right + 2, y + 2);
    ctx.fillStyle = pop > 0.6 ? '#ffffff' : col;
    ctx.fillText(txt, right, y);
    const by = y + fs + 2, bw = 96 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(right - bw, by, bw, 3 * s);
    ctx.fillStyle = col;
    ctx.fillRect(right - bw * Math.max(0, W.comboT / C.window), by, bw * Math.max(0, W.comboT / C.window), 3 * s);
    const mul = D.comboMul(n);
    if (mul > 1) {
      ctx.font = '700 ' + Math.round(12 * s) + 'px ' + NUM;
      ctx.fillStyle = '#bcd3e2';
      ctx.fillText('SCORE x' + mul.toFixed(1), right, by + 6 * s);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 게임 시작 직후 몇 초, 무엇을 누르면 되는지 보여 준다 (스틱 자체는 main.js가 DOM으로 그린다)
  function drawTouchHint(ctx, W, touch) {
    if (W.t > 5 || touch.move || touch.aim) return;
    const a = Math.min(1, (5 - W.t) / 1.5) * 0.7;
    const h = touch.home, R = touch.radius;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#e8f7ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '16px ' + DISP;
    ctx.fillText('엄지로 밀어서 이동', h.x, h.y - R - 14);
    ctx.textBaseline = 'middle';
    ctx.fillText('오른쪽 드래그: 조준', W.w * 0.72, W.h * 0.5);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('(안 해도 자동 조준)', W.w * 0.72, W.h * 0.5 + 20);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  // view: {dpr, hudTop, hudLeft, hud(false면 HUD 생략), calm(움직임 줄이기)}, touch: 입력 모듈의 터치 상태
  function draw(ctx, W, view, touch) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawBackground(ctx, W, view.dpr);
    ctx.save();
    // 움직임 줄이기 설정이면 화면 흔들림·번쩍임을 뺀다
    if (W.shake > 0 && !view.calm) {
      const s = W.shake * 0.5;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawFx(ctx, W);
    drawEnemies(ctx, W);
    drawWarnings(ctx, W);
    drawBullets(ctx, W);
    drawShocks(ctx, W);
    drawPlayer(ctx, W);
    ctx.restore();
    drawDanger(ctx, W);
    if (W.flash > 0) {
      ctx.fillStyle = 'rgba(255,77,109,' + (W.flash * 0.6) + ')';
      ctx.fillRect(0, 0, W.w, W.h);
    }
    if (W.whiteFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(view.calm ? 0.12 : 0.4, W.whiteFlash * 0.8) + ')';
      ctx.fillRect(0, 0, W.w, W.h);
    }
    if (view.hud !== false) drawHud(ctx, W, view);
    if (touch && view.touchHint) drawTouchHint(ctx, W, touch);
  }

  NG.Render = { draw, drawShip };
})(NG);
