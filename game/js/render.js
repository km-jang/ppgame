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

  // 모바일 최적화: 배경 격자와 발광은 미리 그려 두고 이미지로 찍는다
  // (매 프레임 선 수백 개·shadowBlur는 모바일 GPU에서 가장 비싼 작업)
  let gridCache = null;
  function drawGrid(ctx, W, dpr) {
    if (!gridCache || gridCache.w !== W.w || gridCache.h !== W.h || gridCache.dpr !== dpr) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W.w * dpr));
      c.height = Math.max(1, Math.round(W.h * dpr));
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      paintGrid(g, W);
      gridCache = { c, w: W.w, h: W.h, dpr };
    }
    ctx.drawImage(gridCache.c, 0, 0, W.w, W.h);
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

  function paintGrid(ctx, W) {
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, W.w, W.h);
    ctx.strokeStyle = 'rgba(94,231,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W.w; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, W.h); }
    for (let y = 0; y <= W.h; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W.w, y + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(94,231,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W.w - 2, W.h - 2);
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
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.2 - a * 0.4), 0, TAU); ctx.stroke();
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
      ctx.fillStyle = i < p.hp ? '#ff4d6d' : 'rgba(255,77,109,0.18)';
      ctx.fillRect(x0 + (i % perRow) * cell, top + 2 + Math.floor(i / perRow) * cell, 12 * s, 12 * s);
    }
    const rows = Math.ceil(p.maxHp / perRow);
    // 대시 게이지
    const k = 1 - p.dashCd / p.dashCdMax;
    const gy = top + 2 + rows * cell + 4;
    ctx.fillStyle = 'rgba(94,231,255,0.18)';
    ctx.fillRect(x0, gy, 76 * s, 4 * s);
    ctx.fillStyle = k >= 1 ? '#5ee7ff' : '#2b7f91';
    ctx.fillRect(x0, gy, 76 * s * k, 4 * s);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8f7ff';
    ctx.font = 'bold ' + Math.round(18 * s) + 'px system-ui, sans-serif';
    ctx.fillText(W.score.toLocaleString(), right, top);
    ctx.font = Math.round(12 * s) + 'px system-ui, sans-serif';
    ctx.fillStyle = '#8aa4b8';
    ctx.fillText('W' + W.wave + ' · N=' + p.gun.barrels + ' · ' + NG.fmtTime(W.stats.time), right, top + 22 * s);

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
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('보스 #' + (W.bossKills + 1), W.w / 2, by + 12);
    }

    // 웨이브 알림
    if (W.banner > 0 && W.phase === 'play') {
      const a = Math.min(1, W.banner, (D.WAVE.banner - W.banner) * 4);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + Math.min(44, Math.round(W.w / 9)) + 'px system-ui, sans-serif';
      ctx.fillStyle = W.bossWave ? '#ff2e88' : '#e8f7ff';
      ctx.fillText(W.bossWave ? '⚠ 보스 웨이브' : 'WAVE ' + W.wave, W.w / 2, W.h * 0.38);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 게임 시작 직후 몇 초, 손가락을 어디에 둘지 보여 준다
  function drawTouchHint(ctx, W, touch) {
    if (W.t > 5 || touch.move || touch.aim) return;
    const a = Math.min(1, (5 - W.t) / 1.5) * 0.55;
    ctx.globalAlpha = a;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#e8f7ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W.w / 2, W.h * 0.3); ctx.lineTo(W.w / 2, W.h - 20); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8f7ff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('드래그: 이동', W.w * 0.25, W.h * 0.7);
    ctx.fillText('드래그: 조준', W.w * 0.75, W.h * 0.62);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('(안 하면 자동 조준)', W.w * 0.75, W.h * 0.62 + 22);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  function drawSticks(ctx, touch) {
    for (const s of [touch.move, touch.aim]) {
      if (!s) continue;
      ctx.strokeStyle = 'rgba(232,247,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.ox, s.oy, touch.radius, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(232,247,255,0.25)';
      ctx.beginPath(); ctx.arc(s.kx, s.ky, 22, 0, TAU); ctx.fill();
    }
  }

  // view: {dpr, hudTop, hudLeft, hud(false면 HUD 생략)}, touch: 입력 모듈의 터치 상태
  function draw(ctx, W, view, touch) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawGrid(ctx, W, view.dpr);
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
    if (W.flash > 0) {
      ctx.fillStyle = 'rgba(255,77,109,' + (W.flash * 0.6) + ')';
      ctx.fillRect(0, 0, W.w, W.h);
    }
    if (view.hud !== false) drawHud(ctx, W, view);
    if (touch) {
      if (view.touchHint) drawTouchHint(ctx, W, touch);
      drawSticks(ctx, touch);
    }
  }

  NG.Render = { draw };
})(NG);
