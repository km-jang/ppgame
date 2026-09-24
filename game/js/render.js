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

  function shapePath(ctx, e) {
    const { x, y, r } = e;
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

  function themeFor(W) {
    if (W.bossWave && W.enemies.some(e => e.type === 'boss')) return BOSS_THEME;
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
    if (!(W.bossWave && W.enemies.some(e => e.type === 'boss'))) return;
    if (!dangerCache || dangerCache.w !== W.w || dangerCache.h !== W.h) {
      const s = 0.25;
      const c = document.createElement('canvas');
      c.width = Math.max(8, Math.round(W.w * s)); c.height = Math.max(8, Math.round(W.h * s));
      const g = c.getContext('2d');
      g.scale(s, s);
      const v = g.createRadialGradient(W.w / 2, W.h / 2, Math.min(W.w, W.h) * 0.35, W.w / 2, W.h / 2, Math.hypot(W.w, W.h) * 0.55);
      v.addColorStop(0, 'rgba(255,30,80,0)');
      v.addColorStop(1, 'rgba(255,30,80,0.55)');
      g.fillStyle = v;
      g.fillRect(0, 0, W.w, W.h);
      dangerCache = { c, w: W.w, h: W.h };
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
      if (e.type === 'boss') glow(ctx, 'rgba(255,46,136,0.55)', e.x, e.y, Math.round(e.r * 1.8), 1);
      shapePath(ctx, e);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.def.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      // 사수·보스는 눈으로 조준 방향 표시
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

  function drawPlayer(ctx, W) {
    const p = W.player;
    const g = p.gun;
    const blink = p.iframe > 0 && p.dashT <= 0 && Math.floor(W.t * 20) % 2 === 0;
    if (W.phase === 'over') return;

    // 드론
    if (p.drones > 0) {
      const DR = D.DRONE;
      ctx.fillStyle = '#b8f2ff';
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

    glow(ctx, 'rgba(94,231,255,0.6)', p.x, p.y, 34, p.dashT > 0 ? 1 : 0.7);
    ctx.fillStyle = p.dashT > 0 ? '#ffffff' : '#5ee7ff';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#07080d';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), p.x, p.y + 0.5);
  }

  function drawBullets(ctx, W) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffe66d';
    for (const b of W.bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const b of W.eBullets) {
      ctx.fillStyle = '#ff3df2';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd6fb';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1.5, 0, TAU); ctx.fill();
    }
  }

  function drawFx(ctx, W) {
    for (const d of W.drops) {
      const blink = d.life < 3 && Math.floor(d.life * 8) % 2 === 0;
      if (blink) continue;
      ctx.fillStyle = '#3dff8b';
      ctx.fillRect(d.x - 3, d.y - 9, 6, 18);
      ctx.fillRect(d.x - 9, d.y - 3, 18, 6);
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
      ctx.fillStyle = t.heal ? '#3dff8b' : '#ffe66d';
      ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  const NUM = '"Rajdhani", system-ui, sans-serif', DISP = '"Black Han Sans", system-ui, sans-serif';
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
    if (boss) {
      const bw = Math.min(420, W.w - 40), bx = (W.w - bw) / 2, by = Math.max(top + 44 * s, gy + 14);
      ctx.fillStyle = 'rgba(255,46,136,0.2)';
      ctx.fillRect(bx, by, bw, 8);
      ctx.fillStyle = '#ff2e88';
      ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 8);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb3d4';
      ctx.font = '700 13px ' + NUM;
      ctx.fillText('BOSS #' + (W.bossKills + 1), W.w / 2, by + 12);
    }

    // 웨이브 알림
    if (W.banner > 0 && W.phase === 'play') {
      const a = Math.min(1, W.banner, (D.WAVE.banner - W.banner) * 4);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.min(64, Math.round(W.w / 7));
      const ty = W.h * 0.38, slide = (1 - Math.min(1, (D.WAVE.banner - W.banner) * 3)) * 40;
      ctx.font = 'italic 700 ' + fs + 'px ' + NUM;
      ctx.fillStyle = W.bossWave ? '#ff2e88' : '#e8f7ff';
      ctx.shadowColor = W.bossWave ? 'rgba(255,46,136,0.8)' : 'rgba(94,231,255,0.7)'; ctx.shadowBlur = 20;
      ctx.fillText(W.bossWave ? 'BOSS WAVE' : 'WAVE ' + W.wave, W.w / 2 + slide, ty);
      ctx.shadowBlur = 0;
      ctx.font = Math.round(fs * 0.32) + 'px ' + DISP;
      ctx.fillStyle = W.bossWave ? '#ffb3d4' : '#8aa4b8';
      ctx.fillText(W.bossWave ? '보스가 나타났다!' : '끝까지 버텨라', W.w / 2 - slide, ty + fs * 0.62);
      ctx.globalAlpha = 1;
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

  // view: {dpr, hudTop, hudLeft, hud(false면 HUD 생략)}, touch: 입력 모듈의 터치 상태
  function draw(ctx, W, view, touch) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawBackground(ctx, W, view.dpr);
    ctx.save();
    if (W.shake > 0) {
      const s = W.shake * 0.5;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawFx(ctx, W);
    drawEnemies(ctx, W);
    drawBullets(ctx, W);
    drawPlayer(ctx, W);
    ctx.restore();
    drawDanger(ctx, W);
    if (W.flash > 0) {
      ctx.fillStyle = 'rgba(255,77,109,' + (W.flash * 0.6) + ')';
      ctx.fillRect(0, 0, W.w, W.h);
    }
    if (W.whiteFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.4, W.whiteFlash * 0.8) + ')';
      ctx.fillRect(0, 0, W.w, W.h);
    }
    if (view.hud !== false) drawHud(ctx, W, view);
    if (touch && view.touchHint) drawTouchHint(ctx, W, touch);
  }

  NG.Render = { draw };
})(NG);
