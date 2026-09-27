'use strict';
// 공사장 코스 그리기: 기중기·짓고 있는 건물·비계·컨테이너 배경, 흙길, 가림막·굴착기·덤프트럭,
// 고깔·진흙·콘크리트 관·흙더미·기중기 갈고리. scene.js가 코스가 'site'일 때 부른다.
(function (RC) {
  const A = RC.Art, D = RC.DATA;
  const { TAU, INK, shade, mix, rgba, rr, poly, lin, glow, soft, gunmetal } = A;
  const GY = D.RUN.groundY;
  const YEL = '#ffc21a', ORG = '#ff6a1a';

  // ─── 먼 층: 기중기와 뼈대만 선 건물 ───────────────────────
  function towerCrane(g, x, base, h, jib, P, pi) {
    const col = shade(P.far, 0.78);
    g.strokeStyle = col; g.lineWidth = 2;
    // 격자 기둥
    g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - h); g.moveTo(x + 10, base); g.lineTo(x + 10, base - h);
    for (let y = base; y > base - h; y -= 14) { g.moveTo(x, y); g.lineTo(x + 10, y - 14); }
    g.stroke();
    // 팔(지브) + 뒤 팔 + 균형추
    const top = base - h;
    g.beginPath(); g.moveTo(x - 50, top); g.lineTo(x + jib, top); g.moveTo(x - 50, top - 8); g.lineTo(x + jib * 0.9, top - 8);
    for (let k = -50; k < jib * 0.9; k += 14) { g.moveTo(x + k, top); g.lineTo(x + k + 7, top - 8); g.lineTo(x + k + 14, top); }
    g.moveTo(x + 5, top - 8); g.lineTo(x + 5, top - 30); g.lineTo(x + jib * 0.6, top - 8); g.moveTo(x + 5, top - 30); g.lineTo(x - 50, top - 8);
    g.stroke();
    g.fillStyle = col; g.fillRect(x - 58, top - 6, 22, 14); g.fillRect(x - 6, top - 4, 16, 12);
    // 갈고리 줄
    const hx = x + jib * (0.45 + (x % 7) * 0.05);
    g.lineWidth = 1; g.beginPath(); g.moveTo(hx, top); g.lineTo(hx, top + 60 + (x % 5) * 12); g.stroke();
    g.fillRect(hx - 3, top + 60 + (x % 5) * 12, 6, 6);
    if (pi === 2) { g.fillStyle = '#ff3030'; g.beginPath(); g.arc(x + 5, top - 32, 3, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,60,60,0.35)'; g.beginPath(); g.arc(x + 5, top - 32, 9, 0, TAU); g.fill(); }
  }
  function buildFar(P, pi, W, H, g) {
    const rand = RC.rng(41);
    for (let x = -20; x < W; ) {
      const w = 70 + rand() * 90, h = 110 + rand() * 170, top = H - h;
      const done = 0.35 + rand() * 0.5;           // 아래쪽 몇 층은 벽이 있고 위는 뼈대만
      const wallTop = H - h * done;
      g.fillStyle = lin(g, 0, wallTop, 0, H, [[0, P.far], [1, P.farHaze]]);
      g.fillRect(x, wallTop, w, H - wallTop);
      // 뼈대: 층 바닥 + 기둥
      g.fillStyle = shade(P.far, 0.9);
      for (let y = wallTop; y > top; y -= 18) g.fillRect(x, y - 3, w, 3);
      for (let c = 0; c <= 4; c++) g.fillRect(x + c * (w - 4) / 4, top, 4, wallTop - top);
      // 창문 불빛
      for (let wy = wallTop + 10; wy < H - 20; wy += 14) for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        if (rand() < P.lit * 0.7) { g.fillStyle = rgba(P.win, 0.8); g.fillRect(wx, wy, 5, 6); }
      }
      if (rand() < 0.45) towerCrane(g, x + w * 0.4, top + 4, 70 + rand() * 50, 110 + rand() * 90, P, pi);
      x += w + 20 + rand() * 60;
    }
  }

  // ─── 가까운 층: 비계·안전망 두른 건물, 컨테이너, 현장 사무실 ─────
  function container(g, x, y, w, h, color, pi) {
    g.fillStyle = lin(g, 0, y, 0, y + h, [[0, shade(color, pi === 2 ? 0.7 : 1.1)], [1, shade(color, pi === 2 ? 0.45 : 0.75)]]);
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let k = x + 6; k < x + w - 4; k += 8) g.fillRect(k, y + 4, 3, h - 8);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  function buildMid(P, pi, W, H, g) {
    const rand = RC.rng(88);
    let n = 0;
    for (let x = 0; x < W; ) {
      const r = rand();
      if (r < 0.55) {
        // 짓고 있는 건물
        const w = 130 + rand() * 90, h = 170 + rand() * 150, top = H - h;
        g.fillStyle = lin(g, 0, top, 0, H, [[0, shade(P.mid2, 1.1)], [1, shade(P.mid2, 0.78)]]);
        g.fillRect(x, top, w, h);
        // 콘크리트 층 띠
        g.fillStyle = shade(P.trim, 1.05);
        for (let y = top; y < H - 20; y += 30) g.fillRect(x - 4, y, w + 8, 5);
        // 창(구멍): 낮엔 어둡고 밤엔 일부 작업등
        for (let y = top + 9; y < H - 30; y += 30) for (let wx = x + 10; wx < x + w - 20; wx += 24) {
          const on = rand() < P.lit * 0.6;
          g.fillStyle = on ? P.win : (pi === 0 ? 'rgba(20,28,45,0.55)' : 'rgba(5,8,18,0.7)');
          g.fillRect(wx, y, 16, 17);
        }
        // 비계(파이프 격자) + 안전망: 건물 한쪽 절반을 덮는다
        const sx = x + (rand() < 0.5 ? 0 : w * 0.45), sw = w * 0.55;
        g.fillStyle = pi === 2 ? 'rgba(30,90,60,0.55)' : 'rgba(40,150,90,0.55)';
        g.fillRect(sx, top - 10, sw, h * 0.75);
        g.strokeStyle = pi === 2 ? '#7a6a40' : '#c9a24a'; g.lineWidth = 2;
        g.beginPath();
        for (let px = sx; px <= sx + sw + 1; px += sw / 4) { g.moveTo(px, top - 16); g.lineTo(px, H); }
        for (let py = top - 10; py < H; py += 30) { g.moveTo(sx - 4, py); g.lineTo(sx + sw + 4, py); }
        for (let py = top - 10; py < H - 30; py += 60) { g.moveTo(sx, py); g.lineTo(sx + sw / 4, py + 30); }
        g.stroke();
        // 안전제일 현수막
        if (n++ % 2 === 0) {
          const bx = x + w / 2 - 50, by = top + 40;
          g.fillStyle = pi === 2 ? '#c9ced8' : '#ffffff'; g.fillRect(bx, by, 100, 30);
          g.fillStyle = '#1f9d55'; g.fillRect(bx + 6, by + 11, 18, 8); g.fillRect(bx + 11, by + 6, 8, 18);
          g.fillStyle = '#1b2233'; g.font = '17px "Black Han Sans", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText('안전제일', bx + 30, by + 16);
        }
        // 옥상 작업등
        if (pi > 0) { g.fillStyle = 'rgba(255,240,200,0.9)'; g.fillRect(x + w - 30, top - 14, 14, 6); }
        x += w + 18 + rand() * 30;
      } else if (r < 0.8) {
        // 컨테이너 더미
        const cols = ['#e2561d', '#2a6fc9', '#1f9d55', '#c9a21a'];
        const w = 140, h = 40;
        container(g, x, H - h, w, h, cols[Math.floor(rand() * 4)], pi);
        container(g, x + 20, H - h * 2, w, h, cols[Math.floor(rand() * 4)], pi);
        if (rand() < 0.5) container(g, x + 10, H - h * 3, w - 30, h, cols[Math.floor(rand() * 4)], pi);
        x += w + 40 + rand() * 30;
      } else {
        // 현장 사무실 (조립식 2층)
        const w = 150;
        for (let fl = 0; fl < 2; fl++) {
          const y = H - 46 * (fl + 1);
          g.fillStyle = lin(g, 0, y, 0, y + 46, [[0, pi === 2 ? '#8a93a8' : '#eef2f7'], [1, pi === 2 ? '#5a6278' : '#c3cad6']]);
          g.fillRect(x, y, w, 44);
          g.fillStyle = '#2a6fc9'; g.fillRect(x, y + 38, w, 6);
          for (let k = 0; k < 3; k++) { g.fillStyle = rand() < P.lit ? P.win : (pi === 0 ? '#9cc8ec' : '#1a2238'); g.fillRect(x + 14 + k * 46, y + 8, 30, 20); }
        }
        g.fillStyle = '#3a4150'; g.fillRect(x + w - 6, H - 92, 4, 92);
        x += w + 40 + rand() * 30;
      }
    }
  }

  // ─── 흙길 ────────────────────────────────────────────────
  function roadTile(g, P, RW) {
    const dirt = mix(mix('#b08a5e', '#7a5a45', P.ws * 0.6), '#3a3040', P.wn * 0.75);
    const grav = mix(mix('#c7b395', '#9a8070', P.ws * 0.6), '#4a4458', P.wn * 0.75);
    // 자갈 띠 (인도 자리)
    g.fillStyle = lin(g, 0, GY - 26, 0, GY, [[0, shade(grav, 1.08)], [1, shade(grav, 0.85)]]);
    g.fillRect(0, GY - 26, RW, 26);
    const r = RC.rng(19);
    for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)'; const s = 2 + r() * 3; g.fillRect(r() * RW, GY - 25 + r() * 22, s, s * 0.7); }
    // 길 가장자리: 나무 받침목
    g.fillStyle = mix('#6b4a2e', '#2a2230', P.wn * 0.7); g.fillRect(0, GY - 4, RW, 8);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, GY - 4, RW, 2);
    // 다진 흙
    g.fillStyle = lin(g, 0, GY + 4, 0, 600, [[0, shade(dirt, 1.1)], [1, shade(dirt, 0.72)]]);
    g.fillRect(0, GY + 4, RW, 600 - GY);
    for (let i = 0; i < 1300; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.07)' : 'rgba(40,20,0,0.13)'; g.fillRect(r() * RW, GY + 6 + r() * (600 - GY), 2 + r() * 2, 2); }
    // 바퀴 자국 두 줄 (무늬 있는)
    for (const ty of [GY + 30, GY + 78]) {
      g.fillStyle = 'rgba(40,24,10,0.22)';
      g.beginPath(); g.moveTo(0, ty);
      for (let x = 0; x <= RW; x += 20) g.lineTo(x, ty + Math.sin(x / RW * TAU * 2) * 3);
      for (let x = RW; x >= 0; x -= 20) g.lineTo(x, ty + 14 + Math.sin(x / RW * TAU * 2) * 3);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(30,18,6,0.25)';
      for (let x = 4; x < RW; x += 12) g.fillRect(x, ty + 3 + Math.sin(x / RW * TAU * 2) * 3, 6, 8);
    }
    // 웅덩이 자국
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(60,40,20,0.18)'; g.beginPath(); g.ellipse(120 + i * 280, GY + 110 + (i % 2) * 20, 50, 8, 0, 0, TAU); g.fill(); }
  }

  // ─── 길가: 가림막 · 조명탑 · 굴착기 · 덤프트럭 ─────────────────
  function fence(ctx, x0, x1, P) {
    const y = GY - 26, h = 64;
    const top = y - h;
    const tint = c => mix(mix(c, '#e8b8a8', P.ws * 0.35), '#3a4260', P.wn * 0.85);
    ctx.fillStyle = lin(ctx, 0, top, 0, y, [[0, tint('#f4f7fb')], [1, tint('#d6dde8')]]);
    ctx.fillRect(x0, top, x1 - x0, h);
    ctx.fillStyle = mix('#2a6fc9', '#16305e', P.wn * 0.8);
    ctx.fillRect(x0, top + 8, x1 - x0, 8); ctx.fillRect(x0, y - 12, x1 - x0, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = Math.ceil(x0 / 60) * 60; x < x1; x += 60) ctx.fillRect(x, top, 2, h);
  }
  function floodlight(ctx, x, P) {
    const y = GY - 26;
    ctx.fillStyle = gunmetal(ctx, y - 200, y); ctx.fillRect(x - 3, y - 200, 6, 200);
    ctx.strokeStyle = '#3a4150'; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0; k < 6; k++) { ctx.moveTo(x - 3, y - k * 32); ctx.lineTo(x + 3, y - k * 32 - 16); } ctx.stroke();
    rr(ctx, x - 26, y - 214, 52, 18, 3); ctx.fillStyle = '#2a303c'; ctx.fill();
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = mix('#666c78', '#fffbe8', P.lamps); ctx.fillRect(x - 22 + k * 16, y - 210, 12, 10);
    }
    if (P.lamps > 0.02) {
      glow(ctx, '#fff4d0', x, y - 205, 90, P.lamps * 0.9);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = P.lamps * 0.16;
      ctx.fillStyle = lin(ctx, 0, y - 200, 0, GY + 60, [[0, '#fff4d0'], [1, 'rgba(255,244,208,0)']]);
      poly(ctx, [-24, -200, 24, -200, 140, 90, -140, 90], x, y); ctx.fill();
      ctx.restore();
    }
  }
  function excavator(ctx, x, P, t) {
    const y = GY - 26, dark = P.wn * 0.55;
    const body = mix(YEL, '#6a5410', dark);
    // 무한궤도
    rr(ctx, x - 70, y - 26, 140, 26, 13); ctx.fillStyle = mix('#2a2e38', '#101218', dark); ctx.fill();
    ctx.fillStyle = mix('#4a5060', '#1a1e28', dark);
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x - 52 + k * 26, y - 13, 8, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 60, y - 24); ctx.lineTo(x + 60, y - 24); ctx.stroke();
    // 몸통 + 운전석
    rr(ctx, x - 64, y - 64, 110, 38, 6);
    ctx.fillStyle = lin(ctx, 0, y - 64, 0, y - 26, [[0, shade(body, 1.2)], [1, shade(body, 0.75)]]); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    rr(ctx, x - 10, y - 108, 50, 46, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, y - 104, 0, y - 70, [[0, mix('#bfe6ff', '#2a3a5a', P.wn)], [1, mix('#3a78b8', '#101a30', P.wn)]]);
    rr(ctx, x - 4, y - 102, 38, 30, 4); ctx.fill();
    if (P.lamps > 0.3) { ctx.fillStyle = rgba('#ffe7a0', P.lamps * 0.7); rr(ctx, x - 4, y - 102, 38, 30, 4); ctx.fill(); }
    ctx.fillStyle = '#1b1f2c'; ctx.fillRect(x - 60, y - 52, 30, 5);
    // 팔: 붐 → 암 → 버킷 (천천히 흙을 판다)
    const a = Math.sin(t * 0.9) * 0.18;
    const bx = x + 36, by = y - 70;
    const ex = bx + Math.cos(-0.9 + a) * 90, ey = by + Math.sin(-0.9 + a) * 90;
    const hx = ex + Math.cos(1.1 + a * 2) * 70, hy = ey + Math.sin(1.1 + a * 2) * 70;
    ctx.lineCap = 'round';
    for (const [w, c] of [[16, INK], [12, body]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    }
    ctx.strokeStyle = gunmetal(ctx, by - 40, by); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx - 4, by + 10); ctx.lineTo((bx + ex) / 2, (by + ey) / 2 + 8); ctx.stroke();
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(0.5 + a * 3);
    poly(ctx, [-4, -6, 26, -2, 30, 22, 8, 26, -6, 14], 0, 0);
    ctx.fillStyle = mix('#5a606e', '#20242e', dark); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#c9ced8'; for (let k = 0; k < 3; k++) ctx.fillRect(10 + k * 7, 24, 4, 6);
    ctx.restore();
    ctx.lineCap = 'butt';
    ctx.fillStyle = mix(INK, INK, 0); ctx.font = '12px "Black Han Sans", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = rgba('#1b1f2c', 0.8); ctx.fillText('ROBO', x - 20, y - 36);
  }
  function dumpTruck(ctx, x, P) {
    const y = GY - 26, dark = P.wn * 0.55;
    const body = mix(ORG, '#6a2a08', dark);
    // 짐칸 (흙이 담긴)
    poly(ctx, [-80, -30, 30, -30, 38, -84, -90, -84], x, y);
    ctx.fillStyle = lin(ctx, 0, y - 84, 0, y - 30, [[0, shade(body, 1.15)], [1, shade(body, 0.7)]]); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < 4; k++) ctx.fillRect(x - 76 + k * 28, y - 78, 4, 44);
    ctx.fillStyle = mix('#8a6a48', '#3a3040', P.wn * 0.7);
    ctx.beginPath(); ctx.moveTo(x - 88, y - 84); ctx.quadraticCurveTo(x - 30, y - 118, x + 36, y - 84); ctx.fill();
    // 운전석
    rr(ctx, x + 36, y - 76, 50, 48, 6); ctx.fillStyle = lin(ctx, 0, y - 76, 0, y - 28, [[0, shade(body, 1.15)], [1, shade(body, 0.75)]]); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, y - 70, 0, y - 50, [[0, mix('#bfe6ff', '#2a3a5a', P.wn)], [1, mix('#3a78b8', '#101a30', P.wn)]]);
    rr(ctx, x + 50, y - 70, 30, 20, 3); ctx.fill();
    ctx.fillStyle = '#1b1f2c'; ctx.fillRect(x - 84, y - 32, 170, 8);
    // 바퀴
    for (const dx of [-60, -30, 64]) {
      ctx.beginPath(); ctx.arc(x + dx, y - 14, 15, 0, TAU); ctx.fillStyle = '#15171d'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + dx, y - 14, 7, 0, TAU); ctx.fillStyle = mix('#b9c0cc', '#4a5060', dark); ctx.fill();
    }
    if (P.lamps > 0.2) glow(ctx, '#ffe7a0', x + 88, y - 36, 30, P.lamps * 0.8);
  }
  function props(ctx, P, cam, vw, t) {
    // 가림막은 화면 전체에 이어진다 (살짝 뒤쪽)
    fence(ctx, -10, vw + 10, P);
    const gap = 700;
    const first = Math.floor((cam - 300) / gap);
    for (let i = first; i * gap - cam < vw + 300; i++) {
      const x = i * gap + 200 - cam;
      const kind = ((i % 4) + 4) % 4;
      if (kind === 0) excavator(ctx, x + 180, P, t + i);
      else if (kind === 2) dumpTruck(ctx, x + 200, P);
      floodlight(ctx, x, P);
    }
  }

  // 전경: 모래주머니 더미 · 철근 묶음 (빠르게 지나가는 어두운 실루엣)
  function foreground(ctx, P, cam, vw) {
    const gap = 900, par = 1.3;
    const first = Math.floor((cam * par) / gap) - 1;
    for (let i = first; i * gap - cam * par < vw + 200; i++) {
      const x = i * gap - cam * par + 400;
      ctx.fillStyle = mix('#3a2e22', '#07080c', P.wn);
      for (let k = 0; k < 4; k++) { rr(ctx, x + k * 36 - (k > 2 ? 54 : 0), 574 - (k > 2 ? 30 : 0), 44, 30, 12); ctx.fill(); }
      ctx.strokeStyle = mix('#4a3a2a', '#0a0b10', P.wn); ctx.lineWidth = 5;
      ctx.beginPath(); for (let k = 0; k < 5; k++) { ctx.moveTo(x + 200 + k * 6, 610); ctx.lineTo(x + 330 + k * 6, 560 - k * 3); } ctx.stroke();
      ctx.fillStyle = ORG; ctx.fillRect(x + 326, 552, 12, 8);
    }
  }

  // ─── 장애물 · 수집품 ─────────────────────────────────────
  function cone(ctx, x, o) {
    ctx.save();
    ctx.translate(x + 15 + (o.dx || 0), GY + (o.cy || 0));
    if (o.down) ctx.rotate(o.rot || 0);
    ctx.fillStyle = '#1b1f2c'; rr(ctx, -19, -6, 38, 7, 2); ctx.fill();
    poly(ctx, [-14, -6, -4, -46, 4, -46, 14, -6], 0, 0);
    ctx.fillStyle = lin(ctx, -14, 0, 14, 0, [[0, '#ff8a3a'], [0.45, '#ff5a1a'], [1, '#b8340a']]); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#f4f7fb'; poly(ctx, [-10, -18, -7, -30, 7, -30, 10, -18], 0, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3, -44, 2, 36);
    ctx.restore();
  }
  function mud(ctx, x, o, t) {
    const cx = x + o.w / 2;
    if (o.out) {
      ctx.fillStyle = 'rgba(80,120,160,0.45)';
      ctx.beginPath(); ctx.ellipse(cx, GY + 2, o.w / 2, 8, 0, 0, TAU); ctx.fill();
      soft(ctx, '#ffffff', cx, GY - 20 - (t * 30 % 30), 20, 0.25);
      return;
    }
    ctx.fillStyle = lin(ctx, 0, GY - 8, 0, GY + 10, [[0, '#8a6038'], [1, '#4a3018']]);
    ctx.beginPath(); ctx.ellipse(cx, GY + 1, o.w / 2 + 8, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6a4424'; ctx.beginPath(); ctx.ellipse(cx, GY, o.w / 2 - 6, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,190,0.35)'; ctx.beginPath(); ctx.ellipse(cx - 20, GY - 3, 26, 2.5, 0, 0, TAU); ctx.fill();
    // 보글보글
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.8 + k * 0.37) % 1, bx = cx - 40 + k * 38;
      ctx.globalAlpha = 1 - ph; ctx.strokeStyle = '#a07850'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bx, GY - 1, 2 + ph * 5, Math.PI, 0); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function pipe(ctx, x, o) {
    const cx = x + o.w / 2, cy = GY - o.h / 2, r = o.h / 2;
    // 받침 나무
    ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x + 4, GY - 8, o.w - 8, 8);
    // 관 (앞에서 본 둥근 입구)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, r * 0.2, cx, cy, r);
    g.addColorStop(0, '#e8ebf0'); g.addColorStop(1, '#8a919c');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, TAU);
    ctx.fillStyle = lin(ctx, 0, cy - r * 0.6, 0, cy + r * 0.6, [[0, '#15181f'], [1, '#3a3f4b']]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    // 경고 띠
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.arc(cx, cy, r * 0.8, 0, TAU, true); ctx.clip();
    for (let k = 0; k < 12; k++) { ctx.fillStyle = k % 2 ? '#ffd23a' : '#1b1f2c'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, Math.PI + k * 0.12, Math.PI + (k + 1) * 0.12); ctx.fill(); }
    ctx.restore();
  }
  function dirtRamp(ctx, x, o) {
    // 흙더미: 점프대 경사 + 뒤쪽은 둥글게 내려감
    ctx.beginPath(); ctx.moveTo(x - 10, GY);
    ctx.quadraticCurveTo(x + o.w * 0.5, GY - o.h * 0.35, x + o.w, GY - o.h);
    ctx.quadraticCurveTo(x + o.w + 30, GY - o.h + 4, x + o.w + 56, GY);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, GY - o.h, 0, GY, [[0, '#c49a64'], [0.5, '#9a7040'], [1, '#6b4a2a']]); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    const r = RC.rng(Math.floor(o.x));
    for (let i = 0; i < 26; i++) {
      const k = r(), px = x + k * o.w, top = GY - o.h * k * (0.6 + 0.4 * k);
      const py = top + 6 + r() * (GY - top - 8);
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.25)' : 'rgba(40,20,0,0.25)'; ctx.fillRect(px, py, 3 + r() * 3, 2 + r() * 2);
    }
    // 바퀴 자국 + 풀 몇 포기
    ctx.strokeStyle = 'rgba(60,36,14,0.45)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(x + 10, GY - 4); ctx.quadraticCurveTo(x + o.w * 0.5, GY - o.h * 0.38 - 4, x + o.w - 6, GY - o.h + 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#4a8a3a'; ctx.lineWidth = 2;
    for (const k of [0.15, 0.7]) { const px = x + k * o.w, py = GY - o.h * k * (0.6 + 0.4 * k); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 4, py - 9); ctx.moveTo(px, py); ctx.lineTo(px + 3, py - 10); ctx.stroke(); }
    // 깃발
    ctx.fillStyle = '#3a4150'; ctx.fillRect(x + o.w - 2, GY - o.h - 40, 3, 40);
    poly(ctx, [0, 0, 22, 7, 0, 14], x + o.w + 1, GY - o.h - 40); ctx.fillStyle = ORG; ctx.fill();
  }
  function hook(ctx, x, t) {
    const sway = Math.sin(t * 1.3) * 8;
    const by = GY - 322;
    ctx.strokeStyle = '#2a303c'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, -20); ctx.lineTo(x + sway, by - 30); ctx.stroke();
    // 갈고리 블록
    rr(ctx, x + sway - 12, by - 34, 24, 22, 4); ctx.fillStyle = lin(ctx, 0, by - 34, 0, by - 12, [[0, '#ffe07a'], [1, '#d99a00']]); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = '#8a919c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x + sway, by - 4, 7, -Math.PI / 2, Math.PI * 0.9); ctx.stroke();
    // 매달린 H빔
    ctx.strokeStyle = '#2a303c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + sway, by + 2); ctx.lineTo(x + sway - 90, by + 22); ctx.moveTo(x + sway, by + 2); ctx.lineTo(x + sway + 90, by + 22); ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, by + 22, 0, by + 36, [[0, '#ff7a3a'], [1, '#b8340a']]);
    ctx.fillRect(x + sway - 110, by + 22, 220, 14); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(x + sway - 110, by + 22, 220, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + sway - 110, by + 27, 220, 4);
  }

  RC.Site = { buildFar, buildMid, roadTile, props, foreground, cone, mud, pipe, dirtRamp, hook, dust: '#b89a74' };
})(RC);
