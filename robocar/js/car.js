'use strict';
// 로봇카 그리기 (차 모습 · 로봇 모습 · 변신 연출).
// 방향: 오른쪽을 본다. 좌표 (x, y) = 바퀴·발이 땅에 닿는 가운데.
// 연출 원칙: 도장은 위가 밝고 아래가 어두운 그라디언트 + 윗선 하이라이트, 테두리는 얇게,
//            빛나는 부분(눈·전조등·경광등)은 발광 스프라이트를 겹친다.
(function (RC) {
  const A = RC.Art, D = RC.DATA;
  const { TAU, INK, shade, rr, poly, lin, glow, chrome, gunmetal, paint } = A;
  const MORPH = 0.4;

  function outline(ctx, w) { ctx.lineWidth = w || 2.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }

  // ─── 바퀴 ────────────────────────────────────────────────
  function wheel(ctx, x, cy, r, rot, type, speed, cap) {
    // 타이어
    ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU);
    ctx.fillStyle = '#14171d'; ctx.fill(); outline(ctx, 2);
    if (type === 'monster') {
      ctx.fillStyle = '#0a0c10';
      for (let i = 0; i < 12; i++) {
        const a = rot + i * TAU / 12;
        ctx.save(); ctx.translate(x + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1)); ctx.rotate(a);
        ctx.fillRect(-3, -4, 5, 8); ctx.restore();
      }
    }
    ctx.beginPath(); ctx.arc(x, cy, r * 0.8, 0, TAU); ctx.lineWidth = r * 0.1; ctx.strokeStyle = '#2a2f3a'; ctx.stroke();
    // 휠 (크롬)
    ctx.beginPath(); ctx.arc(x, cy, r * 0.62, 0, TAU);
    ctx.fillStyle = lin(ctx, 0, cy - r * 0.62, 0, cy + r * 0.62, [[0, '#f4f7fb'], [0.5, '#8e99ab'], [1, '#dfe5ee']]); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#4a5263'; ctx.stroke();
    // 스포크: 빠를수록 흐려진다
    const blur = Math.min(1, (speed || 0) / 300);
    ctx.strokeStyle = 'rgba(58,65,80,' + (1 - blur * 0.75) + ')'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = rot + i * TAU / 5;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.16, cy + Math.sin(a) * r * 0.16); ctx.lineTo(x + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55); ctx.stroke();
    }
    if (blur > 0.3) { ctx.beginPath(); ctx.arc(x, cy, r * 0.5, 0, TAU); ctx.fillStyle = 'rgba(150,160,178,' + (blur * 0.35) + ')'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, cy, r * 0.17, 0, TAU); ctx.fillStyle = cap; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // 휠하우스(바퀴가 들어가는 어두운 홈)
  function arch(ctx, x, cy, r) {
    ctx.beginPath(); ctx.arc(x, cy, r + 5, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = '#0b0e16'; ctx.fill();
  }

  // LED 눈: 비스듬한 빛나는 눈 + 눈썹. 자면 감은 선
  function ledEyes(ctx, cx, cy, s, sleep, t) {
    if (sleep) {
      ctx.strokeStyle = 'rgba(160,220,255,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const dx of [-8, 7]) { ctx.beginPath(); ctx.moveTo(cx + dx * s - 5 * s, cy); ctx.quadraticCurveTo(cx + dx * s, cy + 3 * s, cx + dx * s + 5 * s, cy); ctx.stroke(); }
      ctx.lineCap = 'butt';
      return;
    }
    const blink = (t % 3.7) < 0.1;
    glow(ctx, '#39d8ff', cx, cy, 20 * s, 0.9);
    ctx.fillStyle = '#eafcff';
    for (const dx of [-8, 7]) {
      const ex = cx + dx * s;
      if (blink) { ctx.fillRect(ex - 5 * s, cy - 0.5, 10 * s, 1.5); continue; }
      poly(ctx, [-5, -2, 5, -4, 5, 2, -5, 3].map(v => v * s), ex, cy); ctx.fill();
    }
    // 눈썹 (앞쪽으로 내려가 씩씩한 표정)
    ctx.strokeStyle = 'rgba(8,18,37,0.9)'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(cx - 14 * s, cy - 6 * s); ctx.lineTo(cx - 2 * s, cy - 8 * s); ctx.moveTo(cx + 2 * s, cy - 8.5 * s); ctx.lineTo(cx + 13 * s, cy - 7 * s); ctx.stroke();
  }

  function glass(ctx, pts, x, yb) {
    poly(ctx, pts, x, yb);
    let minY = 1e9, maxY = -1e9;
    for (let i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
    ctx.fillStyle = lin(ctx, 0, yb + minY, 0, yb + maxY, [[0, '#0b1a33'], [0.55, '#153e6b'], [1, '#2aa6d6']]);
    ctx.fill(); outline(ctx, 2);
    // 유리 반사 줄
    ctx.save(); poly(ctx, pts, x, yb); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.moveTo(x + pts[0] + 10, yb + minY); ctx.lineTo(x + pts[0] + 22, yb + minY); ctx.lineTo(x + pts[0] + 2, yb + maxY); ctx.lineTo(x + pts[0] - 10, yb + maxY); ctx.fill();
    ctx.restore();
  }

  function light(ctx, pts, x, yb, color, glowColor, on) {
    poly(ctx, pts, x, yb); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    if (on !== false) glow(ctx, glowColor, x + pts[0], yb + pts[1], 16, 0.8);
  }

  function highlight(ctx, pts, x, yb) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) { if (i === 0) ctx.moveTo(x + pts[i], yb + pts[i + 1]); else ctx.lineTo(x + pts[i], yb + pts[i + 1]); }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  }

  // ─── 차체 3종 ─────────────────────────────────────────────
  // 반환: 장비 달 자리 {pod: 뒤쪽 지붕, nose: 앞코}
  function bodyRacer(ctx, x, yb, color, t, o) {
    const P = [-78, 0, -83, -14, -81, -28, -56, -32, -34, -50, -8, -52, 22, -33, 58, -27, 82, -18, 88, -9, 78, 0];
    poly(ctx, P, x, yb); ctx.fillStyle = paint(ctx, color, yb - 52, yb); ctx.fill(); outline(ctx, 2.5);
    // 아래 스커트
    poly(ctx, [-76, 0, 76, 0, 78, -6, -78, -6], x, yb); ctx.fillStyle = shade(color, 0.45); ctx.fill();
    // 레이싱 줄무늬
    const stripe = shade(color, 1.75);
    poly(ctx, [-80, -21, 84, -14, 84, -11, -80, -17], x, yb); ctx.fillStyle = stripe; ctx.fill();
    // 옆 흡기구
    poly(ctx, [-28, -24, -8, -24, -12, -12, -30, -12], x, yb);
    ctx.fillStyle = lin(ctx, 0, yb - 24, 0, yb - 12, [[0, '#05070c'], [1, '#2a303c']]); ctx.fill(); outline(ctx, 1.5);
    // 번호판
    ctx.save(); ctx.translate(x - 52, yb - 13); ctx.transform(1, 0, -0.25, 1, 0, 0);
    rr(ctx, -10, -8, 22, 14, 3); ctx.fillStyle = '#f4f7fb'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK; ctx.font = '12px "Black Han Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('07', 1, -0.5);
    ctx.restore();
    glass(ctx, [-50, -33, -32, -47, -8, -49, 16, -34], x, yb);
    highlight(ctx, [-79, -27, -56, -30, -34, -47, -8, -49, 20, -31, 58, -24, 80, -16], x, yb);
    ledEyes(ctx, x - 1, yb - 40, 0.95, o.sleep, t);
    light(ctx, [70, -24, 85, -18, 84, -14, 70, -18], x, yb, '#fff4c4', '#ffe7a0', !o.sleep);
    light(ctx, [-83, -25, -78, -25, -78, -17, -83, -18], x, yb, '#ff4050', '#ff3040', !o.sleep);
    // 뒷날개
    ctx.fillStyle = gunmetal(ctx, yb - 50, yb - 30);
    ctx.fillRect(x - 70, yb - 46, 4, 16); ctx.fillRect(x - 58, yb - 46, 4, 15);
    poly(ctx, [-90, -50, -48, -50, -51, -44, -90, -43], x, yb); ctx.fillStyle = gunmetal(ctx, yb - 50, yb - 43); ctx.fill(); outline(ctx, 2);
    poly(ctx, [-92, -56, -86, -56, -86, -40, -92, -40], x, yb); ctx.fillStyle = shade(color, 0.8); ctx.fill(); outline(ctx, 1.5);
    return { pod: { x: x - 60, y: yb - 58 }, nose: { x: x + 86, y: yb - 11 }, roof: yb - 52 };
  }

  function bodyFire(ctx, x, yb, color, t, o) {
    // 장비칸
    rr(ctx, x - 86, yb - 60, 110, 60, 5); ctx.fillStyle = paint(ctx, color, yb - 60, yb); ctx.fill(); outline(ctx, 2.5);
    // 셔터 문
    rr(ctx, x - 80, yb - 54, 96, 30, 3); ctx.fillStyle = shade(color, 0.78); ctx.fill();
    ctx.strokeStyle = shade(color, 0.55); ctx.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x - 80, yb - 50 + k * 6); ctx.lineTo(x + 16, yb - 50 + k * 6); ctx.stroke(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 32, yb - 54); ctx.lineTo(x - 32, yb - 24); ctx.stroke();
    // 운전석
    poly(ctx, [22, 0, 22, -68, 58, -68, 80, -42, 88, -30, 88, 0], x, yb); ctx.fillStyle = paint(ctx, color, yb - 68, yb); ctx.fill(); outline(ctx, 2.5);
    // 반사띠
    poly(ctx, [-86, -20, 88, -20, 88, -13, -86, -13], x, yb); ctx.fillStyle = '#ffd23a'; ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 9; k++) { poly(ctx, [0, 0, 6, 0, 2, 7, -4, 7], x - 80 + k * 20, yb - 20); ctx.fill(); }
    glass(ctx, [28, -62, 56, -62, 76, -42, 28, -42], x, yb);
    ledEyes(ctx, x + 48, yb - 51, 0.9, o.sleep, t);
    // 사다리
    ctx.fillStyle = chrome(ctx, yb - 76, yb - 62);
    ctx.fillRect(x - 88, yb - 72, 122, 3); ctx.fillRect(x - 88, yb - 65, 122, 3);
    ctx.fillStyle = '#9aa5b8';
    for (let k = 0; k < 13; k++) ctx.fillRect(x - 86 + k * 9.5, yb - 70, 2.5, 6);
    // 경광등
    const on = Math.floor(t * 5) % 2;
    rr(ctx, x + 28, yb - 76, 28, 8, 3); ctx.fillStyle = gunmetal(ctx, yb - 76, yb - 68); ctx.fill();
    rr(ctx, x + 30, yb - 75, 11, 6, 2); ctx.fillStyle = on ? '#ff5050' : '#7a1c1c'; ctx.fill();
    rr(ctx, x + 43, yb - 75, 11, 6, 2); ctx.fillStyle = on ? '#8a2a2a' : '#ff5050'; ctx.fill();
    if (!o.sleep) glow(ctx, '#ff3030', x + (on ? 35 : 48), yb - 72, 26, 0.9);
    // 호스 감개
    ctx.beginPath(); ctx.arc(x - 8, yb - 36, 8, 0, TAU); ctx.fillStyle = chrome(ctx, yb - 44, yb - 28); ctx.fill(); outline(ctx, 1.5);
    highlight(ctx, [-84, -58, 20, -58], x, yb);
    highlight(ctx, [24, -66, 56, -66, 78, -41], x, yb);
    light(ctx, [80, -30, 88, -28, 88, -22, 80, -24], x, yb, '#fff4c4', '#ffe7a0', !o.sleep);
    // 범퍼
    ctx.fillStyle = chrome(ctx, yb - 10, yb); ctx.fillRect(x + 82, yb - 10, 10, 8); ctx.fillRect(x - 90, yb - 10, 8, 8);
    return { pod: { x: x - 80, y: yb - 88 }, nose: { x: x + 92, y: yb - 18 }, roof: yb - 76 };
  }

  function bodyPolice(ctx, x, yb, color, t, o) {
    const P = [-80, 0, -84, -14, -80, -28, -56, -31, -38, -52, 18, -52, 38, -32, 72, -28, 84, -18, 86, -6, 80, 0];
    poly(ctx, P, x, yb); ctx.fillStyle = paint(ctx, color, yb - 52, yb); ctx.fill(); outline(ctx, 2.5);
    // 흰 문 도색
    ctx.save(); poly(ctx, P, x, yb); ctx.clip();
    poly(ctx, [-40, -31, 36, -31, 40, -4, -44, -4], x, yb);
    ctx.fillStyle = lin(ctx, 0, yb - 31, 0, yb, [[0, '#ffffff'], [1, '#c9d1dd']]); ctx.fill();
    ctx.restore();
    poly(ctx, [-76, 0, 76, 0, 78, -5, -78, -5], x, yb); ctx.fillStyle = '#1a1e28'; ctx.fill();
    ctx.fillStyle = INK; ctx.font = '11px "Black Han Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('POLICE', x + 6, yb - 16);
    // 별 배지
    ctx.save(); ctx.translate(x - 28, yb - 17); ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3 : 7; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = '#ffcf3a'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#7a5200'; ctx.stroke(); ctx.restore();
    glass(ctx, [-52, -31, -36, -48, 14, -48, 32, -31], x, yb);
    ctx.fillStyle = INK; ctx.fillRect(x - 12, yb - 48, 3, 17);
    ledEyes(ctx, x + 14, yb - 40, 0.85, o.sleep, t);
    highlight(ctx, [-79, -27, -56, -29, -38, -50, 18, -50, 38, -30, 72, -25, 84, -15], x, yb);
    // 경광등 막대
    const on = Math.floor(t * 6) % 2;
    rr(ctx, x - 26, yb - 60, 42, 8, 3); ctx.fillStyle = gunmetal(ctx, yb - 60, yb - 52); ctx.fill();
    rr(ctx, x - 24, yb - 59, 18, 6, 2); ctx.fillStyle = on ? '#ff4a4a' : '#6b1d1d'; ctx.fill();
    rr(ctx, x - 4, yb - 59, 18, 6, 2); ctx.fillStyle = on ? '#1d2f6b' : '#4a8bff'; ctx.fill();
    if (!o.sleep) glow(ctx, on ? '#ff3040' : '#3a7bff', x + (on ? -15 : 5), yb - 56, 30, 1);
    light(ctx, [72, -25, 85, -18, 84, -14, 72, -19], x, yb, '#fff4c4', '#ffe7a0', !o.sleep);
    light(ctx, [-84, -24, -79, -24, -79, -16, -84, -17], x, yb, '#ff4050', '#ff3040', !o.sleep);
    // 푸시 범퍼
    ctx.fillStyle = gunmetal(ctx, yb - 22, yb);
    ctx.fillRect(x + 84, yb - 20, 8, 3); ctx.fillRect(x + 84, yb - 11, 8, 3); ctx.fillRect(x + 90, yb - 22, 3, 20);
    return { pod: { x: x - 76, y: yb - 45 }, nose: { x: x + 92, y: yb - 11 }, roof: yb - 52 };
  }

  // ─── 장비 ────────────────────────────────────────────────
  function jetPod(ctx, px, py, thrust, t) {
    rr(ctx, px, py, 32, 13, 6); ctx.fillStyle = gunmetal(ctx, py, py + 13); ctx.fill(); outline(ctx, 2);
    ctx.fillStyle = '#ff6a1a'; ctx.fillRect(px + 8, py + 2, 16, 3);
    poly(ctx, [0, 1, -8, -1, -8, 14, 0, 12], px, py); ctx.fillStyle = chrome(ctx, py, py + 14); ctx.fill(); outline(ctx, 1.5);
    const nx = px - 8, ny = py + 6.5;
    if (thrust) {
      const L = 34 + Math.random() * 18;
      poly(ctx, [0, -7, -L, 0, 0, 7], nx, ny);
      ctx.fillStyle = lin(ctx, nx, 0, nx - L, 0, [[0, '#ffffff'], [0.25, '#ffe066'], [0.6, '#ff8a1a'], [1, 'rgba(255,60,0,0)']]); ctx.fill();
      glow(ctx, '#ff8a1a', nx - 8, ny, 38, 1);
    } else {
      glow(ctx, '#3aa8ff', nx, ny, 10, 0.7 + Math.sin(t * 8) * 0.2);
    }
  }

  function wing(ctx, px, py, spread, t, glide) {
    const flap = glide ? Math.sin(t * 16) * 0.12 : 0;
    const base = spread ? -0.35 : -0.05;
    for (let i = 2; i >= 0; i--) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(base - i * (spread ? 0.28 : 0.1) + flap);
      const L = (spread ? 78 : 44) - i * (spread ? 12 : 6);
      poly(ctx, [0, -3, -L, -10, -L + 8, 2, 0, 5], 0, 0);
      ctx.fillStyle = lin(ctx, 0, -10, 0, 5, [[0, '#e9eef6'], [1, '#8d98ab']]); ctx.fill(); outline(ctx, 1.5);
      ctx.strokeStyle = 'rgba(80,220,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(-L + 2, -9); ctx.stroke();
      ctx.restore();
    }
    if (spread) glow(ctx, '#39d8ff', px - 30, py - 12, 30, 0.35);
  }

  function drill(ctx, nx, ny, t, s) {
    s = s || 1;
    ctx.save(); ctx.translate(nx, ny); ctx.scale(s, s);
    rr(ctx, -4, -11, 10, 22, 3); ctx.fillStyle = gunmetal(ctx, -11, 11); ctx.fill(); outline(ctx, 1.5);
    poly(ctx, [6, -12, 46, 0, 6, 12], 0, 0); ctx.fillStyle = chrome(ctx, -12, 12); ctx.fill(); outline(ctx, 2);
    ctx.save(); poly(ctx, [6, -12, 46, 0, 6, 12], 0, 0); ctx.clip();
    ctx.strokeStyle = 'rgba(40,48,62,0.75)'; ctx.lineWidth = 2.5;
    const ph = (t * 60) % 10;
    for (let k = -1; k < 5; k++) { const xx = 6 + k * 10 + ph; ctx.beginPath(); ctx.moveTo(xx, -14); ctx.lineTo(xx + 8, 14); ctx.stroke(); }
    ctx.restore(); ctx.restore();
  }

  function springs(ctx, x, y0, y1) {
    ctx.fillStyle = gunmetal(ctx, y0, y1); ctx.fillRect(x - 2.5, y0, 5, y1 - y0);
    ctx.strokeStyle = '#d7dde7'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y0);
    const n = 6; for (let i = 1; i <= n; i++) ctx.lineTo(x + (i % 2 ? 8 : -8), y0 + (y1 - y0) * i / n);
    ctx.stroke();
  }

  // ─── 차 모습 ─────────────────────────────────────────────
  // o: {t, thrust, glide, spin, bounce, dist, sleep, tilt, squash, speed}
  function drawCar(ctx, cfg, x, y, o) {
    o = o || {};
    const t = o.t || 0;
    const W = RC.find(D.WHEELS, cfg.wheel);
    const color = cfg.color || RC.find(D.BODIES, cfg.body).color;
    const wr = W.r;
    const lift = W.id === 'spring' ? 13 + Math.sin(t * 14) * 3 : W.id === 'monster' ? 8 : 0;
    const axleY = y - wr;
    const yb = axleY + 4 - lift - (o.bounce || 0);
    const rot = (o.dist || 0) / wr;
    const wx = cfg.body === 'fire' ? [-56, 56] : [-50, 52];

    ctx.save();
    const piv = yb - 26;
    if (o.squash) { ctx.translate(x, y); ctx.scale(1 + o.squash * 0.08, 1 - o.squash * 0.12); ctx.translate(-x, -y); }
    if (o.tilt || o.spin) { ctx.translate(x, piv); ctx.rotate((o.tilt || 0) + (o.spin || 0)); ctx.translate(-x, -piv); }

    // 스프링 (차체 뒤)
    if (W.id === 'spring') for (const dx of wx) springs(ctx, x + dx, yb - 4, axleY);
    // 몬스터 바퀴 서스펜션
    if (W.id === 'monster') { ctx.fillStyle = gunmetal(ctx, yb - 4, axleY); for (const dx of wx) ctx.fillRect(x + dx - 3, yb - 6, 6, axleY - yb + 6); }

    const body = cfg.body === 'fire' ? bodyFire : cfg.body === 'police' ? bodyPolice : bodyRacer;
    // 날개는 차체 뒤에 먼저
    const pre = cfg.gear === 'wing';
    let mounts = null;
    if (pre) {
      const roof = cfg.body === 'fire' ? { x: x - 40, y: yb - 74 } : { x: x - 36, y: yb - 46 };
      wing(ctx, roof.x, roof.y, !!o.glide, t, o.glide);
    }
    mounts = body(ctx, x, yb, color, t, o);
    for (const dx of wx) arch(ctx, x + dx, axleY, wr);
    for (const dx of wx) wheel(ctx, x + dx, axleY, wr, rot, W.id, o.speed, color);
    if (cfg.gear === 'jet') jetPod(ctx, mounts.pod.x, mounts.pod.y, o.thrust, t);
    if (cfg.gear === 'drill') drill(ctx, mounts.nose.x - 6, mounts.nose.y, t);
    ctx.restore();
  }

  // ─── 로봇 모습 ───────────────────────────────────────────
  function limb(ctx, x0, y0, ang, len, w, fill, edge) {
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(-ang);
    rr(ctx, -w / 2, 0, w, len, w * 0.45); ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = edge || INK; ctx.stroke();
    ctx.restore();
    return { x: x0 + Math.sin(ang) * len, y: y0 + Math.cos(ang) * len };
  }
  function joint(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = gunmetal(ctx, y - r, y + r); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
  }

  function drawRobot(ctx, cfg, x, y, o) {
    o = o || {};
    const t = o.t || 0;
    const body = cfg.body;
    const color = cfg.color || RC.find(D.BODIES, body).color;
    const armor = paint(ctx, color, y - 190, y);
    const dim = shade(color, 0.62);
    const ph = t * 13;
    const run = !!o.running && !o.air;

    ctx.save();
    if (run) { ctx.translate(x, y); ctx.rotate(0.1); ctx.translate(-x, -y); }
    const bob = run ? Math.abs(Math.sin(ph)) * 4 : 0;
    const hipY = y - 80 - bob;

    // 다리 각도 (세로 기준, +는 앞으로)
    function legPose(p, front) {
      if (o.air) return front ? [0.55, -0.25] : [-0.35, -1.0];
      if (!run) return [front ? 0.06 : -0.06, 0];
      const th = Math.sin(p) * 0.6;
      return [th, th - (0.15 + Math.max(0, Math.sin(p + 1.3)) * 1.1)];
    }
    function drawLeg(p, front) {
      const [a1, a2] = legPose(p, front);
      const hx = x + (front ? 9 : -9);
      const k = limb(ctx, hx, hipY, a1, 36, 21, front ? gunmetal(ctx, hipY, hipY + 36) : '#2a303c');
      // 허벅지 장갑
      ctx.save(); ctx.translate(hx, hipY); ctx.rotate(-a1); rr(ctx, -12, 3, 24, 24, 7); ctx.fillStyle = front ? armor : dim; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
      joint(ctx, k.x, k.y, 8);
      const a = limb(ctx, k.x, k.y, a2, 38, 27, front ? armor : dim);
      // 종아리 바퀴
      ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(-a2);
      ctx.beginPath(); ctx.arc(-15, 20, 10, 0, TAU); ctx.fillStyle = '#14171d'; ctx.fill(); ctx.beginPath(); ctx.arc(-15, 20, 5.5, 0, TAU); ctx.fillStyle = '#9aa5b8'; ctx.fill();
      ctx.restore();
      // 발
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(-a2 * 0.3);
      poly(ctx, [-15, -5, 14, -7, 24, 2, 24, 7, -17, 7], 0, 0); ctx.fillStyle = front ? gunmetal(ctx, -6, 6) : '#23272f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
    }
    function armPose(p, front) {
      if (front && o.punch > 0) return [1.55, 1.55];
      if (o.air) return front ? [0.9, 1.6] : [-0.6, 0.2];
      if (!run) return [front ? 0.12 : -0.1, front ? 0.35 : 0.2];
      const u = -Math.sin(p) * 0.7;
      return [u, u + 0.7];
    }
    function drawArm(p, front) {
      const [u, f] = armPose(p, front);
      const sx = x + (front ? 16 : -16), sy = y - 144 - bob;
      const e = limb(ctx, sx, sy, u, 30, 18, front ? gunmetal(ctx, sy, sy + 30) : '#2a303c');
      joint(ctx, e.x, e.y, 7);
      const h = limb(ctx, e.x, e.y, f, 32, 25, front ? armor : dim);
      if (front && cfg.gear === 'drill') {
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(Math.PI / 2 - f); drill(ctx, 0, 0, t, 0.8); ctx.restore();
      } else {
        rr(ctx, h.x - 12, h.y - 8, 24, 20, 7); ctx.fillStyle = front ? gunmetal(ctx, h.y - 7, h.y + 9) : '#23272f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      }
      if (front && o.punch > 0) glow(ctx, '#ffd070', h.x + 16, h.y, 40, o.punch * 3);
    }

    // 뒤쪽 장비
    if (cfg.gear === 'jet') {
      for (const dx of [-40, -28]) {
        rr(ctx, x + dx - 7, y - 158 - bob, 14, 44, 6); ctx.fillStyle = gunmetal(ctx, y - 158, y - 114); ctx.fill(); outline(ctx, 2);
        const nx = x + dx, ny = y - 112 - bob;
        if (o.thrust) {
          const L = 36 + Math.random() * 20;
          poly(ctx, [-6, 0, 0, L, 6, 0], nx, ny);
          ctx.fillStyle = lin(ctx, 0, ny, 0, ny + L, [[0, '#ffffff'], [0.3, '#ffe066'], [0.7, '#ff8a1a'], [1, 'rgba(255,60,0,0)']]); ctx.fill();
          glow(ctx, '#ff8a1a', nx, ny + 12, 34, 1);
        } else glow(ctx, '#3aa8ff', nx, ny + 2, 10, 0.8);
      }
    } else if (cfg.gear === 'wing') {
      ctx.save(); ctx.translate(x - 22, y - 148 - bob); ctx.scale(1.35, 1.35);
      wing(ctx, 0, 0, true, t, o.glide); ctx.restore();
    }

    drawArm(ph + Math.PI, false);
    drawLeg(ph + Math.PI, false);

    // 골반
    rr(ctx, x - 22, hipY - 12, 44, 18, 6); ctx.fillStyle = gunmetal(ctx, hipY - 12, hipY + 4); ctx.fill(); outline(ctx, 2);
    drawLeg(ph, true);

    // 몸통
    const ty = y - bob;
    poly(ctx, [-38, -156, 38, -156, 32, -104, 18, -90, -18, -90, -32, -104], x, ty);
    ctx.fillStyle = armor; ctx.fill(); outline(ctx, 2.5);
    poly(ctx, [-16, -104, 16, -104, 13, -92, -13, -92], x, ty); ctx.fillStyle = gunmetal(ctx, ty - 104, ty - 92); ctx.fill();
    // 가슴 유리 + 코어
    poly(ctx, [-25, -150, 25, -150, 19, -116, -19, -116], x, ty);
    ctx.fillStyle = lin(ctx, 0, ty - 148, 0, ty - 118, [[0, '#0b1a33'], [1, '#1f6a9c']]); ctx.fill(); outline(ctx, 2);
    const coreC = body === 'fire' ? '#5fd8ff' : body === 'police' ? '#ffd23a' : '#ffe04a';
    glow(ctx, coreC, x, ty - 133, 26, 0.9 + Math.sin(t * 5) * 0.1);
    ctx.save(); ctx.translate(x, ty - 133); ctx.fillStyle = '#ffffff';
    if (body === 'racer') { poly(ctx, [3, -9, -6, 1, 0, 1, -3, 9, 6, -2, 0, -2], 0, 0); ctx.fill(); }
    else if (body === 'fire') { ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(8, 2, 0, 8); ctx.quadraticCurveTo(-8, 2, 0, -9); ctx.fill(); }
    else { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.5 : 8.5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // 가슴 아래 전조등
    for (const dx of [-24, 24]) { ctx.beginPath(); ctx.arc(x + dx, ty - 110, 3.5, 0, TAU); ctx.fillStyle = '#fff4c4'; ctx.fill(); glow(ctx, '#ffe7a0', x + dx, ty - 110, 10, 0.7); }
    highlight(ctx, [-36, -153, 36, -153], x, ty);

    // 어깨 바퀴 + 견갑
    ctx.beginPath(); ctx.arc(x - 38, ty - 150, 15, 0, TAU); ctx.fillStyle = '#14171d'; ctx.fill(); ctx.beginPath(); ctx.arc(x - 38, ty - 150, 7.5, 0, TAU); ctx.fillStyle = '#9aa5b8'; ctx.fill();
    // 머리
    rr(ctx, x - 5, ty - 164, 10, 12, 3); ctx.fillStyle = gunmetal(ctx, ty - 164, ty - 152); ctx.fill();
    poly(ctx, [-18, -192, 16, -194, 23, -178, 20, -158, -18, -158, -22, -176], x, ty); ctx.fillStyle = armor; ctx.fill(); outline(ctx, 2.5);
    poly(ctx, [-16, -182, 22, -182, 19, -169, -16, -169], x, ty); ctx.fillStyle = '#071224'; ctx.fill();
    glow(ctx, '#39d8ff', x + 4, ty - 175, 22, 0.9);
    ctx.fillStyle = '#eafcff';
    const blink = (t % 3.3) < 0.1;
    for (const dx of [-3, 11]) { if (blink) ctx.fillRect(x + dx - 5, ty - 176, 10, 1.5); else { poly(ctx, [-5, -1, 6, -3, 6, 2, -5, 3], x + dx, ty - 176); ctx.fill(); } }
    rr(ctx, x - 13, ty - 166, 30, 6, 2); ctx.fillStyle = '#9aa5b8'; ctx.fill();
    // 머리 장식
    if (body === 'racer') {
      poly(ctx, [-8, -186, -30, -198, -12, -180], x, ty); ctx.fillStyle = armor; ctx.fill(); outline(ctx, 2);
      poly(ctx, [4, -189, -8, -202, 10, -189], x, ty); ctx.fillStyle = shade(color, 1.3); ctx.fill(); outline(ctx, 1.5);
    } else if (body === 'fire') {
      poly(ctx, [-18, -186, 16, -190, 10, -196, -12, -194], x, ty); ctx.fillStyle = '#ffd23a'; ctx.fill(); outline(ctx, 2);
      const on = Math.floor(t * 5) % 2; ctx.beginPath(); ctx.arc(x, ty - 198, 4, 0, TAU); ctx.fillStyle = on ? '#ff5050' : '#7a1c1c'; ctx.fill(); if (on) glow(ctx, '#ff3030', x, ty - 198, 18, 1);
    } else {
      const on = Math.floor(t * 6) % 2;
      rr(ctx, x - 16, ty - 196, 10, 7, 2); ctx.fillStyle = on ? '#ff4a4a' : '#6b1d1d'; ctx.fill();
      rr(ctx, x + 6, ty - 197, 10, 7, 2); ctx.fillStyle = on ? '#1d2f6b' : '#4a8bff'; ctx.fill();
      glow(ctx, on ? '#ff3040' : '#3a7bff', x + (on ? -11 : 11), ty - 193, 22, 1);
    }
    // 앞쪽 견갑
    poly(ctx, [-2, -164, 30, -168, 44, -152, 40, -134, 6, -136], x, ty); ctx.fillStyle = armor; ctx.fill(); outline(ctx, 2.5);
    highlight(ctx, [2, -162, 28, -165, 41, -152], x, ty);
    ctx.beginPath(); ctx.arc(x + 44, ty - 150, 9, 0, TAU); ctx.fillStyle = '#14171d'; ctx.fill(); ctx.beginPath(); ctx.arc(x + 44, ty - 150, 4.5, 0, TAU); ctx.fillStyle = '#c9d2df'; ctx.fill();
    drawArm(ph, true);
    ctx.restore();
  }

  // ─── 변신 연출 ───────────────────────────────────────────
  // o.morph: 남은 시간 (MORPH → 0). o.form: 변신이 끝났을 때의 모습
  function drawBot(ctx, cfg, x, y, o) {
    const m = o.morph || 0;
    if (m <= 0) { if (o.form === 'robot') drawRobot(ctx, cfg, x, y, o); else drawCar(ctx, cfg, x, y, o); return; }
    const k = 1 - m / MORPH; // 0 → 1
    const toRobot = o.form === 'robot';
    const cy = y - 70;
    // 빛줄기
    ctx.save(); ctx.translate(x, cy); ctx.rotate(k * 2);
    const burst = Math.sin(k * Math.PI);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      ctx.rotate(TAU / 10);
      ctx.fillStyle = 'rgba(120,220,255,' + (0.18 * burst) + ')';
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(170 * burst, -9); ctx.lineTo(170 * burst, 9); ctx.lineTo(0, 3); ctx.fill();
    }
    ctx.restore();
    // 육각 링
    ctx.save(); ctx.strokeStyle = 'rgba(120,230,255,' + (1 - k) + ')'; ctx.lineWidth = 4;
    ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * TAU / 6 + k; const r = 40 + k * 140; ctx.lineTo(x + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); } ctx.stroke(); ctx.restore();
    // 모습 바꾸기: 앞 절반은 이전 모습이 늘어나며 사라지고, 뒤 절반은 새 모습이 커지며 나타난다
    if (k < 0.5) {
      const s = 1 + k * 0.5;
      ctx.save(); ctx.globalAlpha = 1 - k * 1.2; ctx.translate(x, y); ctx.scale(1 - k * 0.3, s); ctx.translate(-x, -y);
      if (toRobot) drawCar(ctx, cfg, x, y, o); else drawRobot(ctx, cfg, x, y, o);
      ctx.restore();
    } else {
      const s = 0.7 + (k - 0.5) * 0.6;
      ctx.save(); ctx.globalAlpha = Math.min(1, (k - 0.5) * 3); ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y);
      if (toRobot) drawRobot(ctx, cfg, x, y, o); else drawCar(ctx, cfg, x, y, o);
      ctx.restore();
    }
    glow(ctx, '#ffffff', x, cy, 110, burst * 0.8);
  }

  RC.Car = { drawCar, drawRobot, drawBot, MORPH };
})(RC);
