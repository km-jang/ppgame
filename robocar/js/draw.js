'use strict';
// 그리기: 로봇카(차·로봇 두 모습), 도시 배경, 장애물. 그림책 느낌 = 원색 + 두꺼운 테두리
(function (RC) {
  const D = RC.DATA;
  const GY = D.RUN.groundY;
  const INK = '#1b1e2b';
  const TAU = Math.PI * 2;

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function fillInk(ctx, color, lw) {
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = lw || 4; ctx.strokeStyle = INK; ctx.stroke();
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  function star(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.48 : r;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  function drawStar(ctx, x, y, r, t) {
    star(ctx, x, y + Math.sin(t * 4 + x * 0.05) * 3, r, Math.sin(t * 2 + x) * 0.15);
    ctx.fillStyle = '#ffd21a'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#b86e00'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3 + Math.sin(t * 4 + x * 0.05) * 3, r * 0.18, 0, TAU); ctx.fill();
  }

  // 눈: 로봇카의 표정. 가끔 깜빡인다
  function eyes(ctx, x, y, s, t, sleep) {
    if (sleep) {
      // 자는 눈: 아래로 휜 선
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const dx of [-11 * s, 11 * s]) { ctx.beginPath(); ctx.arc(x + dx, y - 2, 7 * s, 0.2, Math.PI - 0.2); ctx.stroke(); }
      return;
    }
    const blink = (t % 3.3) < 0.12;
    for (const dx of [-11 * s, 11 * s]) {
      ctx.beginPath(); ctx.ellipse(x + dx, y, 8 * s, blink ? 1.5 : 10 * s, 0, 0, TAU);
      fillInk(ctx, '#ffffff', 2.5);
      if (!blink) {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(x + dx + 3 * s, y + 1, 4.5 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + dx + 4.5 * s, y - 2.5 * s, 1.6 * s, 0, TAU); ctx.fill();
      }
    }
  }

  function wheel(ctx, x, y, r, t, type) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fillInk(ctx, '#2a2d3a', 3);
    if (type === 'monster') {
      ctx.strokeStyle = '#11131a'; ctx.lineWidth = 4;
      for (let i = 0; i < 10; i++) {
        const a = t + i * TAU / 10;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r - 5), y + Math.sin(a) * (r - 5)); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); fillInk(ctx, '#c7cdd9', 2.5);
    ctx.strokeStyle = '#7b8292'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      const a = t + i * TAU / 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45); ctx.stroke();
    }
  }

  function spring(ctx, x, y0, y1) {
    ctx.strokeStyle = '#8a93a6'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x, y0);
    const n = 5;
    for (let i = 1; i <= n; i++) ctx.lineTo(x + (i % 2 ? 9 : -9), y0 + (y1 - y0) * i / n);
    ctx.lineTo(x, y1); ctx.stroke();
  }

  // ─── 차 모습 ─────────────────────────────────────────────
  // (x, y) = 바퀴가 땅에 닿는 가운데. o: {t, thrust, glide, spin, bounce}
  function drawCar(ctx, cfg, x, y, o) {
    const t = o.t || 0;
    const W = RC.find(D.WHEELS, cfg.wheel);
    const body = cfg.body, color = cfg.color || RC.find(D.BODIES, body).color;
    const wr = W.r;
    const lift = W.id === 'spring' ? 12 + Math.sin(t * 16) * 3 : 0;
    const yb = y - wr - 6 - lift - (o.bounce || 0); // 차체 바닥
    const roll = (o.dist || 0) / wr;

    ctx.save();
    if (o.spin) { ctx.translate(x, yb - 25); ctx.rotate(o.spin); ctx.translate(-x, -(yb - 25)); }

    // 등 장비 (차체 뒤에 먼저)
    if (cfg.gear === 'wing') {
      const flap = o.glide ? Math.sin(t * 18) * 0.25 : 0;
      ctx.save(); ctx.translate(x - 30, yb - 38); ctx.rotate(-0.5 + flap);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-30, -50, -70, -40); ctx.quadraticCurveTo(-45, -18, -40, 4); ctx.closePath();
      fillInk(ctx, '#e8f4ff', 3);
      ctx.strokeStyle = '#9fb7d1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-52, -34); ctx.moveTo(-18, 0); ctx.lineTo(-48, -18); ctx.stroke();
      ctx.restore();
    } else if (cfg.gear === 'jet') {
      rr(ctx, x - 78, yb - 48, 26, 36, 8); fillInk(ctx, '#b8c2d4', 3);
      rr(ctx, x - 84, yb - 22, 14, 14, 3); fillInk(ctx, '#6b7385', 3);
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x - 74, yb - 42, 18, 5);
      if (o.thrust) {
        const fl = 18 + Math.random() * 14;
        ctx.beginPath(); ctx.moveTo(x - 84, yb - 20); ctx.lineTo(x - 84 - fl, yb - 15 + fl * 0.4); ctx.lineTo(x - 84, yb - 10); ctx.closePath();
        ctx.fillStyle = '#ffb020'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 84, yb - 18); ctx.lineTo(x - 84 - fl * 0.55, yb - 15 + fl * 0.25); ctx.lineTo(x - 84, yb - 12); ctx.closePath();
        ctx.fillStyle = '#fff3a0'; ctx.fill();
      }
    } else if (cfg.gear === 'drill') {
      ctx.save(); ctx.translate(x + 64, yb - 20);
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(38, 0); ctx.lineTo(0, 16); ctx.closePath();
      fillInk(ctx, '#c7cdd9', 3);
      ctx.strokeStyle = '#7b8292'; ctx.lineWidth = 2.5;
      const ph = (t * 40) % 10;
      for (let i = 0; i < 4; i++) { const xx = 4 + i * 9 + ph * 0.9; if (xx < 34) { const hh = 16 * (1 - xx / 38); ctx.beginPath(); ctx.moveTo(xx, -hh); ctx.lineTo(xx + 5, hh); ctx.stroke(); } }
      ctx.restore();
    }

    // 스프링
    if (W.id === 'spring') { spring(ctx, x - 40, yb - 2, y - wr); spring(ctx, x + 42, yb - 2, y - wr); }

    // 차체
    if (body === 'racer') {
      ctx.beginPath();
      ctx.moveTo(x - 66, yb); ctx.lineTo(x + 60, yb); ctx.quadraticCurveTo(x + 72, yb - 8, x + 66, yb - 20);
      ctx.lineTo(x + 22, yb - 30); ctx.quadraticCurveTo(x + 4, yb - 52, x - 24, yb - 50); ctx.lineTo(x - 44, yb - 34);
      ctx.lineTo(x - 64, yb - 30); ctx.closePath();
      fillInk(ctx, color);
      // 스포일러
      rr(ctx, x - 76, yb - 50, 26, 9, 3); fillInk(ctx, shade(color, 0.7), 3);
      ctx.beginPath(); ctx.moveTo(x - 62, yb - 41); ctx.lineTo(x - 60, yb - 30); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
      // 창문
      ctx.beginPath(); ctx.moveTo(x + 16, yb - 31); ctx.quadraticCurveTo(x + 2, yb - 47, x - 20, yb - 45); ctx.lineTo(x - 33, yb - 33); ctx.closePath();
      fillInk(ctx, '#bfefff', 3);
      // 번호 동그라미
      ctx.beginPath(); ctx.arc(x - 30, yb - 16, 10, 0, TAU); fillInk(ctx, '#fff', 2.5);
      ctx.fillStyle = INK; ctx.font = 'bold 13px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('1', x - 30, yb - 15);
      eyes(ctx, x - 2, yb - 38, 0.8, t, o.sleep);
    } else if (body === 'fire') {
      rr(ctx, x - 66, yb - 48, 92, 48, 6); fillInk(ctx, color);
      rr(ctx, x + 18, yb - 62, 48, 62, 8); fillInk(ctx, color);
      // 사다리
      rr(ctx, x - 70, yb - 60, 84, 10, 3); fillInk(ctx, '#d9dee8', 3);
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 62 + i * 13, yb - 60); ctx.lineTo(x - 62 + i * 13, yb - 50); ctx.stroke(); }
      // 흰 띠
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 64, yb - 22, 128, 6);
      // 창문 + 경광등
      rr(ctx, x + 28, yb - 56, 32, 24, 5); fillInk(ctx, '#bfefff', 3);
      const on = Math.floor(t * 4) % 2;
      rr(ctx, x + 32, yb - 72, 22, 10, 4); fillInk(ctx, on ? '#ff3b3b' : '#ffb3b3', 3);
      eyes(ctx, x + 44, yb - 44, 0.72, t, o.sleep);
      // 호스 감개
      ctx.beginPath(); ctx.arc(x - 26, yb - 26, 12, 0, TAU); fillInk(ctx, '#ffd21a', 3);
    } else {
      // 경찰차
      ctx.beginPath();
      ctx.moveTo(x - 66, yb); ctx.lineTo(x + 64, yb); ctx.quadraticCurveTo(x + 70, yb - 14, x + 60, yb - 28);
      ctx.lineTo(x + 30, yb - 30); ctx.lineTo(x + 16, yb - 54); ctx.lineTo(x - 34, yb - 54); ctx.lineTo(x - 48, yb - 30);
      ctx.lineTo(x - 64, yb - 28); ctx.closePath();
      fillInk(ctx, color);
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 60, yb - 24, 122, 12);
      ctx.fillStyle = INK; ctx.font = 'bold 11px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('POLICE', x, yb - 17.5);
      ctx.beginPath(); ctx.moveTo(x + 12, yb - 50); ctx.lineTo(x + 24, yb - 32); ctx.lineTo(x - 42, yb - 32); ctx.lineTo(x - 30, yb - 50); ctx.closePath();
      fillInk(ctx, '#bfefff', 3);
      const on = Math.floor(t * 5) % 2;
      rr(ctx, x - 22, yb - 64, 18, 10, 3); fillInk(ctx, on ? '#ff3b3b' : '#6b2a2a', 3);
      rr(ctx, x - 4, yb - 64, 18, 10, 3); fillInk(ctx, on ? '#2a3f7a' : '#3b8bff', 3);
      eyes(ctx, x - 8, yb - 41, 0.72, t, o.sleep);
    }
    // 전조등·후미등
    ctx.beginPath(); ctx.arc(x + 62, yb - 12, 5, 0, TAU); fillInk(ctx, '#fff6b0', 2.5);
    ctx.beginPath(); ctx.arc(x - 64, yb - 12, 4, 0, TAU); fillInk(ctx, '#ff5a5a', 2.5);

    wheel(ctx, x - 40, y - wr, wr, roll, W.id);
    wheel(ctx, x + 42, y - wr, wr, roll, W.id);
    ctx.restore();
  }

  // ─── 로봇 모습 ───────────────────────────────────────────
  function drawRobot(ctx, cfg, x, y, o) {
    const t = o.t || 0;
    const body = cfg.body, color = cfg.color || RC.find(D.BODIES, body).color;
    const run = o.running ? Math.sin(t * 16) : 0;
    const air = o.air;
    const dark = shade(color, 0.65);

    // 등 장비
    if (cfg.gear === 'jet') {
      rr(ctx, x - 50, y - 128, 22, 50, 8); fillInk(ctx, '#b8c2d4', 3);
      if (o.thrust) {
        const fl = 20 + Math.random() * 16;
        ctx.beginPath(); ctx.moveTo(x - 46, y - 78); ctx.lineTo(x - 39, y - 78 + fl); ctx.lineTo(x - 32, y - 78); ctx.closePath();
        ctx.fillStyle = '#ffb020'; ctx.fill();
      }
    } else if (cfg.gear === 'wing') {
      const flap = o.glide ? Math.sin(t * 18) * 0.3 : 0;
      for (const s of [1, 0.8]) {
        ctx.save(); ctx.translate(x - 24, y - 118); ctx.rotate(-0.7 + flap * s);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-40 * s, -60 * s, -90 * s, -50 * s); ctx.quadraticCurveTo(-55 * s, -20 * s, -46 * s, 10); ctx.closePath();
        fillInk(ctx, s === 1 ? '#e8f4ff' : '#cfe3f7', 3);
        ctx.restore();
      }
    }

    // 다리 (바퀴가 달린 발)
    const legY = y - 52;
    for (const [dx, ph] of [[-15, 1], [15, -1]]) {
      const kick = air ? (dx < 0 ? -8 : 10) : run * 10 * ph;
      rr(ctx, x + dx - 9 + kick * 0.3, legY, 18, 40, 6); fillInk(ctx, '#5b6275', 3.5);
      rr(ctx, x + dx - 13 + kick, y - 14, 28, 14, 6); fillInk(ctx, '#3a3f4f', 3.5);
      ctx.beginPath(); ctx.arc(x + dx - 12 + kick * 0.3, legY + 18, 7, 0, TAU); fillInk(ctx, '#2a2d3a', 2.5);
    }

    // 몸통
    rr(ctx, x - 34, y - 116, 68, 66, 12); fillInk(ctx, color);
    rr(ctx, x - 24, y - 106, 48, 32, 8); fillInk(ctx, dark, 3);
    // 가슴 문양
    ctx.save(); ctx.translate(x, y - 90);
    if (body === 'racer') {
      ctx.beginPath(); ctx.moveTo(4, -13); ctx.lineTo(-8, 2); ctx.lineTo(0, 2); ctx.lineTo(-4, 14); ctx.lineTo(9, -2); ctx.lineTo(1, -2); ctx.closePath();
      fillInk(ctx, '#ffd21a', 2.5);
    } else if (body === 'fire') {
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(11, 2, 0, 11); ctx.quadraticCurveTo(-11, 2, 0, -13); fillInk(ctx, '#7fd3ff', 2.5);
    } else {
      star(ctx, 0, 0, 13, 0); fillInk(ctx, '#ffd21a', 2.5);
    }
    ctx.restore();

    // 팔
    const punch = o.punch > 0;
    // 뒤쪽 팔
    rr(ctx, x - 46, y - 110 + run * 3, 16, 42, 7); fillInk(ctx, dark, 3.5);
    // 앞쪽 팔: 부술 때 앞으로 쭉
    if (punch) {
      rr(ctx, x + 22, y - 104, 50, 18, 8); fillInk(ctx, dark, 3.5);
      if (cfg.gear === 'drill') {
        ctx.beginPath(); ctx.moveTo(x + 70, y - 108); ctx.lineTo(x + 104, y - 95); ctx.lineTo(x + 70, y - 82); ctx.closePath(); fillInk(ctx, '#c7cdd9', 3);
      } else { ctx.beginPath(); ctx.arc(x + 76, y - 95, 13, 0, TAU); fillInk(ctx, '#e3e7ef', 3.5); }
    } else {
      rr(ctx, x + 30, y - 110 - run * 3, 16, 42, 7); fillInk(ctx, dark, 3.5);
      if (cfg.gear === 'drill') {
        ctx.beginPath(); ctx.moveTo(x + 30, y - 70); ctx.lineTo(x + 38, y - 44); ctx.lineTo(x + 46, y - 70); ctx.closePath(); fillInk(ctx, '#c7cdd9', 3);
      } else { ctx.beginPath(); ctx.arc(x + 38, y - 68, 10, 0, TAU); fillInk(ctx, '#e3e7ef', 3.5); }
    }
    // 어깨 바퀴
    ctx.beginPath(); ctx.arc(x - 34, y - 112, 11, 0, TAU); fillInk(ctx, '#2a2d3a', 3);
    ctx.beginPath(); ctx.arc(x + 34, y - 112, 11, 0, TAU); fillInk(ctx, '#2a2d3a', 3);

    // 머리
    rr(ctx, x - 22, y - 152, 44, 38, 10); fillInk(ctx, '#e3e7ef');
    rr(ctx, x - 17, y - 142, 34, 18, 7); fillInk(ctx, '#3fd7ff', 3);
    const blink = (t % 3.1) < 0.12;
    ctx.fillStyle = '#ffffff';
    for (const dx of [-7, 7]) { ctx.beginPath(); ctx.ellipse(x + dx + 2, y - 133, 3.5, blink ? 0.8 : 4.5, 0, 0, TAU); ctx.fill(); }
    // 머리 장식
    if (body === 'police') {
      const on = Math.floor(t * 5) % 2;
      rr(ctx, x - 12, y - 162, 11, 10, 3); fillInk(ctx, on ? '#ff3b3b' : '#6b2a2a', 2.5);
      rr(ctx, x + 1, y - 162, 11, 10, 3); fillInk(ctx, on ? '#2a3f7a' : '#3b8bff', 2.5);
    } else if (body === 'fire') {
      ctx.beginPath(); ctx.moveTo(x - 26, y - 150); ctx.quadraticCurveTo(x, y - 178, x + 26, y - 150); ctx.closePath(); fillInk(ctx, '#ffd21a', 3);
    } else {
      ctx.beginPath(); ctx.moveTo(x - 2, y - 152); ctx.lineTo(x - 12, y - 170); ctx.lineTo(x + 8, y - 152); ctx.closePath(); fillInk(ctx, color, 3);
    }
  }

  // 변신 중이면 반짝이며 모습이 바뀐다
  function drawBot(ctx, cfg, x, y, o) {
    const m = o.morph || 0;
    const showRobot = o.form === 'robot' ? m < 0.2 : m > 0.2;
    if (m > 0) {
      const k = 1 - Math.abs(m - 0.175) / 0.175;
      ctx.save(); ctx.translate(x, y); ctx.scale(1 + k * 0.15, 1 - k * 0.2); ctx.translate(-x, -y);
    }
    if (showRobot) drawRobot(ctx, cfg, x, y, o); else drawCar(ctx, cfg, x, y, o);
    if (m > 0) {
      ctx.restore();
      ctx.globalAlpha = Math.min(1, m / 0.35);
      const g = ctx.createRadialGradient(x, y - 60, 0, x, y - 60, 110);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 60, 110, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ─── 도시 배경 ───────────────────────────────────────────
  let city = null;
  function cityData() {
    if (city) return city;
    const rand = RC.rng(99);
    const far = [], near = [], clouds = [];
    for (let x = 0; x < 2400; x += 70 + rand() * 60) far.push({ x, w: 60 + rand() * 70, h: 120 + rand() * 150, c: ['#a9cdf0', '#b9d7f5', '#9ec3ea'][Math.floor(rand() * 3)] });
    for (let x = 0; x < 2400; x += 120 + rand() * 120) {
      if (rand() < 0.35) near.push({ x, tree: true, h: 70 + rand() * 30 });
      else near.push({ x, w: 90 + rand() * 60, h: 110 + rand() * 90, c: ['#ffb4a2', '#ffd6a5', '#caffbf', '#bde0fe', '#ffc6ff'][Math.floor(rand() * 5)] });
    }
    for (let i = 0; i < 7; i++) clouds.push({ x: rand() * 2400, y: 50 + rand() * 120, s: 0.7 + rand() * 0.7 });
    city = { far, near, clouds };
    return city;
  }

  function drawSky(ctx, vw) {
    const g = ctx.createLinearGradient(0, 0, 0, GY);
    g.addColorStop(0, '#6cc8ff'); g.addColorStop(1, '#dff6ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, GY);
    ctx.fillStyle = '#fff4a8';
    ctx.beginPath(); ctx.arc(vw - 110, 90, 44, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,244,168,0.35)';
    ctx.beginPath(); ctx.arc(vw - 110, 90, 64, 0, TAU); ctx.fill();
  }

  function cloud(ctx, x, y, s) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, TAU); ctx.arc(x + 28 * s, y - 12 * s, 30 * s, 0, TAU); ctx.arc(x + 60 * s, y, 24 * s, 0, TAU);
    ctx.fill();
    ctx.fillRect(x, y, 60 * s, 24 * s);
  }

  function wrapX(x, cam, par, span, vw) {
    let px = x - cam * par;
    px = ((px % span) + span) % span;
    return px > vw + 200 ? px - span : px;
  }

  function drawCity(ctx, cam, vw, t) {
    const C = cityData();
    drawSky(ctx, vw);
    for (const c of C.clouds) { const x = wrapX(c.x + t * 8, cam, 0.1, 2400, vw); if (x > -150 && x < vw + 50) cloud(ctx, x, c.y, c.s); }
    for (const b of C.far) {
      const x = wrapX(b.x, cam, 0.25, 2400, vw);
      if (x < -150 || x > vw + 20) continue;
      ctx.fillStyle = b.c; ctx.fillRect(x, GY - 40 - b.h, b.w, b.h + 40);
    }
    for (const b of C.near) {
      const x = wrapX(b.x, cam, 0.5, 2400, vw);
      if (x < -200 || x > vw + 20) continue;
      if (b.tree) {
        rr(ctx, x + 22, GY - 30 - b.h * 0.4, 12, b.h * 0.4 + 10, 4); fillInk(ctx, '#9b6b43', 3);
        ctx.beginPath(); ctx.arc(x + 28, GY - 30 - b.h * 0.55, b.h * 0.38, 0, TAU); fillInk(ctx, '#5fd068', 3);
      } else {
        rr(ctx, x, GY - 22 - b.h, b.w, b.h + 22, 6); fillInk(ctx, b.c, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (let wy = GY - b.h; wy < GY - 50; wy += 30) for (let wx = x + 14; wx < x + b.w - 20; wx += 26) ctx.fillRect(wx, wy, 14, 16);
      }
    }
  }

  function drawRoad(ctx, cam, vw, pits) {
    // 인도
    ctx.fillStyle = '#c9ced9'; ctx.fillRect(0, GY - 22, vw, 22);
    ctx.fillStyle = '#9aa3b5'; ctx.fillRect(0, GY - 4, vw, 6);
    // 도로
    ctx.fillStyle = '#4b4f5c'; ctx.fillRect(0, GY + 2, vw, 600 - GY);
    ctx.fillStyle = '#ffffff';
    const off = ((-cam % 120) + 120) % 120;
    for (let x = off - 120; x < vw; x += 120) ctx.fillRect(x, GY + 60, 60, 8);
    // 구덩이 (공사 중)
    for (const p of pits) {
      const x = p.x - cam;
      if (x > vw || x + p.w < 0) continue;
      ctx.fillStyle = '#22242e'; ctx.fillRect(x, GY - 22, p.w, 600 - GY + 22);
      ctx.fillStyle = '#15161d'; ctx.fillRect(x + 8, GY + 20, p.w - 16, 600);
      for (const ex of [x - 10, x + p.w - 6]) {
        for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? '#1b1e2b' : '#ffd21a'; ctx.fillRect(ex, GY - 22 + k * 10, 16, 10); }
      }
    }
  }

  function drawItems(ctx, R, cam, vw, t) {
    for (const o of R.level.items) {
      const x = o.x - cam;
      if (x < -200 || x > vw + 200) continue;
      switch (o.type) {
        case 'star': if (!o.got) drawStar(ctx, x, o.y, 17, t); break;
        case 'box':
          if (o.broken) break;
          for (let k = 0; k < o.n; k++) {
            const y = GY - 64 * (k + 1);
            rr(ctx, x, y, 64, 64, 4); fillInk(ctx, '#d99a55');
            ctx.strokeStyle = '#9b6b33'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + 58, y + 58); ctx.moveTo(x + 58, y + 6); ctx.lineTo(x + 6, y + 58); ctx.stroke();
            ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x + 6, y + 6, 52, 52);
          }
          break;
        case 'rock':
          if (o.broken) break;
          ctx.beginPath(); ctx.moveTo(x, GY); ctx.lineTo(x + 8, GY - 44); ctx.lineTo(x + 34, GY - 70); ctx.lineTo(x + 70, GY - 58); ctx.lineTo(x + 90, GY);
          ctx.closePath(); fillInk(ctx, '#9aa0ad');
          ctx.fillStyle = '#c3c8d2'; ctx.beginPath(); ctx.moveTo(x + 16, GY - 40); ctx.lineTo(x + 34, GY - 60); ctx.lineTo(x + 44, GY - 44); ctx.closePath(); ctx.fill();
          break;
        case 'fire':
          if (o.out) {
            ctx.fillStyle = '#7fd3ff'; ctx.beginPath(); ctx.ellipse(x + o.w / 2, GY - 2, o.w / 2, 8, 0, 0, TAU); ctx.fill();
          } else {
            for (let k = 0; k < 4; k++) {
              const fx = x + 14 + k * 26, h = 46 + Math.sin(t * 12 + k * 1.7) * 12;
              ctx.beginPath(); ctx.moveTo(fx - 14, GY); ctx.quadraticCurveTo(fx - 12, GY - h * 0.6, fx, GY - h); ctx.quadraticCurveTo(fx + 12, GY - h * 0.6, fx + 14, GY); ctx.closePath();
              fillInk(ctx, '#ff7a1a', 3);
              ctx.beginPath(); ctx.moveTo(fx - 7, GY); ctx.quadraticCurveTo(fx - 5, GY - h * 0.35, fx, GY - h * 0.55); ctx.quadraticCurveTo(fx + 5, GY - h * 0.35, fx + 7, GY); ctx.closePath();
              ctx.fillStyle = '#ffe14d'; ctx.fill();
            }
          }
          break;
        case 'ramp':
          ctx.beginPath(); ctx.moveTo(x, GY); ctx.lineTo(x + o.w, GY - o.h); ctx.lineTo(x + o.w, GY); ctx.closePath();
          fillInk(ctx, '#ffd21a');
          ctx.save(); ctx.clip();
          ctx.fillStyle = INK;
          for (let k = -2; k < 10; k++) { ctx.beginPath(); ctx.moveTo(x + k * 24, GY); ctx.lineTo(x + k * 24 + 12, GY); ctx.lineTo(x + k * 24 + 42, GY - 60); ctx.lineTo(x + k * 24 + 30, GY - 60); ctx.fill(); }
          ctx.restore();
          break;
        case 'banana':
          if (o.hit) break;
          ctx.beginPath(); ctx.arc(x, GY - 20, 16, 0.2, Math.PI - 0.2); ctx.lineWidth = 8; ctx.strokeStyle = '#ffd21a'; ctx.stroke();
          ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
          break;
        case 'monkey': drawMonkey(ctx, x, o, t); break;
        case 'flag': {
          rr(ctx, x - 4, GY - 190, 8, 190, 3); fillInk(ctx, '#e3e7ef', 3);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
            const wave = Math.sin(t * 6 + c * 0.8) * 4;
            ctx.fillStyle = (r + c) % 2 ? INK : '#ffffff';
            ctx.fillRect(x + 4 + c * 14, GY - 188 + r * 14 + wave, 14, 14);
          }
          ctx.fillStyle = INK; ctx.font = '28px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          ctx.fillText('도착!', x + 46, GY - 200);
          break;
        }
      }
    }
    for (const f of R.flying) drawStar(ctx, f.x - cam, f.y, 15, t);
  }

  function drawMonkey(ctx, x, o, t) {
    let y = GY;
    if (o.state === 'jump') y -= Math.max(0, Math.sin(Math.min(1, o.jumpT / 0.7) * Math.PI)) * 150;
    const wave = o.state === 'throw' ? Math.sin(t * 10) * 0.6 : Math.sin(t * 3) * 0.3;
    // 다리
    rr(ctx, x - 14, y - 22, 10, 22, 4); fillInk(ctx, '#7a4e2d', 3);
    rr(ctx, x + 4, y - 22, 10, 22, 4); fillInk(ctx, '#7a4e2d', 3);
    // 몸
    ctx.beginPath(); ctx.ellipse(x, y - 44, 22, 26, 0, 0, TAU); fillInk(ctx, '#a0693d');
    ctx.beginPath(); ctx.ellipse(x, y - 40, 13, 15, 0, 0, TAU); ctx.fillStyle = '#e8c49a'; ctx.fill();
    // 팔 흔들기
    ctx.save(); ctx.translate(x + 18, y - 56); ctx.rotate(-1.2 + wave);
    rr(ctx, -5, -30, 10, 30, 5); fillInk(ctx, '#7a4e2d', 3); ctx.restore();
    // 머리 + 안테나
    ctx.beginPath(); ctx.moveTo(x, y - 94); ctx.lineTo(x, y - 108); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - 110, 5, 0, TAU); fillInk(ctx, '#ff3b3b', 2.5);
    ctx.beginPath(); ctx.arc(x, y - 78, 20, 0, TAU); fillInk(ctx, '#a0693d');
    ctx.beginPath(); ctx.ellipse(x, y - 74, 14, 11, 0, 0, TAU); ctx.fillStyle = '#e8c49a'; ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x - 6, y - 80, 3, 0, TAU); ctx.arc(x + 6, y - 80, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 72, 5, 0.1, Math.PI - 0.1); ctx.lineWidth = 2; ctx.stroke();
  }

  function drawFx(ctx, R, cam) {
    for (const q of R.fx) {
      const a = Math.max(0, q.life / q.max);
      const x = q.x - cam;
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillStyle = q.color;
      if (q.kind === 'spark') { star(ctx, x, q.y, q.size, q.rot); ctx.fill(); }
      else if (q.kind === 'confetti') { ctx.save(); ctx.translate(x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2); ctx.restore(); }
      else if (q.kind === 'chunk') { ctx.save(); ctx.translate(x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(x, q.y, q.size, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  // 달리기 화면 전체. vw: 논리 너비
  function drawRun(ctx, R, vw) {
    const c = R.car;
    const cam = c.x - vw * 0.3;
    const t = R.t;
    drawCity(ctx, cam, vw, t);
    drawRoad(ctx, cam, vw, R.level.pits);
    drawItems(ctx, R, cam, vw, t);
    const spin = c.spin > 0 ? (1 - c.spin / 0.9) * Math.PI * 2 : 0;
    const bounce = c.bump > 0 ? Math.sin(c.bump * 40) * 4 : 0;
    drawBot(ctx, R.cfg, c.x - cam, c.y, {
      t, form: c.form, morph: c.morph, thrust: c.thrusting, glide: c.gliding, spin, bounce,
      dist: c.x, running: c.onGround, air: !c.onGround, punch: c.punch,
    });
    // 물대포 줄기
    if (c.form === 'robot' && R.body.ability === 'water' && c.robotT > D.RUN.robotTime - 0.8) {
      ctx.strokeStyle = 'rgba(127,211,255,0.8)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x - cam + 70, c.y - 95); ctx.quadraticCurveTo(c.x - cam + 300, c.y - 160, c.x - cam + 520, c.y - 10); ctx.stroke();
    }
    // 사이렌 파동
    if (c.form === 'robot' && R.body.ability === 'siren') {
      const k = (t * 1.5) % 1;
      ctx.strokeStyle = k < 0.5 ? 'rgba(255,59,59,' + (1 - k) + ')' : 'rgba(59,139,255,' + (1 - k) + ')';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(c.x - cam, c.y - 150, 30 + k * 250, 0, TAU); ctx.stroke();
    }
    drawFx(ctx, R, cam);
  }

  // 차고 (조립 화면 배경 + 받침대)
  function drawGarage(ctx, vw, vh, t, ty) {
    ty = ty || vh * 0.7;
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#ffe9c7'); g.addColorStop(1, '#ffd49a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    // 벽 구멍판
    ctx.fillStyle = 'rgba(160,110,60,0.18)';
    for (let y = 30; y < ty - 30; y += 28) for (let x = 20; x < vw; x += 28) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
    // 바닥
    ctx.fillStyle = '#c9a27a'; ctx.fillRect(0, ty - 24, vw, vh);
    ctx.fillStyle = '#b8906a';
    for (let x = 0; x < vw; x += 90) ctx.fillRect(x, ty - 24, 4, vh);
    // 받침대 (돌아가는 판)
    ctx.beginPath(); ctx.ellipse(vw / 2, ty + 6, 190, 34, 0, 0, TAU); fillInk(ctx, '#8a93a6');
    ctx.beginPath(); ctx.ellipse(vw / 2, ty, 170, 26, 0, 0, TAU); ctx.fillStyle = '#b8c2d4'; ctx.fill();
    ctx.strokeStyle = 'rgba(27,30,43,0.25)'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = t * 0.8 + i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(vw / 2 + Math.cos(a) * 60, ty + Math.sin(a) * 9); ctx.lineTo(vw / 2 + Math.cos(a) * 160, ty + Math.sin(a) * 24); ctx.stroke();
    }
  }

  // 잠자기 화면: 밤 차고에서 로봇카가 코 자는 모습
  function drawNight(ctx, cfg, vw, t) {
    const g = ctx.createLinearGradient(0, 0, 0, 600);
    g.addColorStop(0, '#1b2a5a'); g.addColorStop(1, '#3a3f8f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, 600);
    const rand = RC.rng(5);
    for (let i = 0; i < 60; i++) {
      const x = rand() * vw, y = rand() * 330, tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.globalAlpha = 0.4 + tw * 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.arc(vw * 0.78, 110, 46, 0, TAU); ctx.fill();
    ctx.fillStyle = '#26356b'; ctx.beginPath(); ctx.arc(vw * 0.78 + 20, 96, 42, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2f63'; ctx.fillRect(0, 430, vw, 170);
    const x = vw / 2, y = 430;
    ctx.save(); ctx.translate(x, y); ctx.scale(1.3, 1.3 + Math.sin(t * 1.6) * 0.015); ctx.translate(-x, -y);
    drawCar(ctx, cfg, x, y, { t: 0, sleep: true });
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '34px Jua, sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.5 + i / 3) % 1);
      ctx.globalAlpha = 1 - k;
      ctx.fillText('z', x + 110 + k * 60 + i * 6, y - 120 - k * 90);
    }
    ctx.globalAlpha = 1;
  }

  RC.Draw = { drawNight, drawCar, drawRobot, drawBot, drawRun, drawGarage, drawStar, drawCity, drawRoad, GY };
})(RC);
