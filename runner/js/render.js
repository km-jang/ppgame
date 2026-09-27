'use strict';
// 캔버스 그리기. 게임 상태를 읽기만 하고 규칙은 바꾸지 않는다.
// 입자·흔들림·빛줄기 같은 꾸밈은 규칙 파일이 아니라 여기(R)에 둔다.
// 원근: 카메라는 우주선 뒤 CAMZ m, 높이 camH m에서 앞을 본다. 물체는 규칙의 줄 번호와 거리(z)를 그대로 쓴다
(function (RN) {
  const TAU = Math.PI * 2;
  const D = RN.DATA;
  const NUM = '"Rajdhani", system-ui, sans-serif', DISP = '"Jua", system-ui, sans-serif';
  const LW = 3;     // 줄 사이 거리(m, 그리기 전용)
  const CAMZ = 10;   // 카메라가 우주선 뒤로 떨어진 거리(m)
  const ITEM = D.ITEM.kinds;

  // ─── 화면 배치 ─────────────────────────────────────────────
  // 지평선 높이(hy)와 우주선 바닥 높이(py), 우주선 자리에서 줄 사이 픽셀(lane)을 정하고 원근 값을 맞춘다
  function layout(w, h) {
    const port = h > w * 1.1;
    const hy = Math.round(h * (port ? 0.32 : 0.35));
    const py = h * (port ? 0.8 : 0.83);
    const lane = port ? w * 0.29 : Math.min(w * 0.23, h * 0.4);
    const F = lane * CAMZ / LW;
    return { port, w, h, hy, py, lane, F, camH: (py - hy) * CAMZ / F, cx: w / 2 };
  }
  // lx: 줄 좌표(0·1·2, 소수 가능), rel: 우주선 앞 거리(m), y: 높이(m) → 화면 x·y와 1m당 픽셀 s
  function proj(L, lx, rel, y) {
    const s = L.F / Math.max(0.6, rel + CAMZ);
    return { x: L.cx + (lx - 1) * LW * s, y: L.hy + (L.camH - (y || 0)) * s, s };
  }

  // ─── 미리 그려 두는 것들 ───────────────────────────────────
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // 발광 스프라이트: 색마다 한 번 그려 두고 크기만 바꿔 찍는다 (매 프레임 shadowBlur 금지)
  const glowCache = {};
  function glow(ctx, color, x, y, r, a) {
    let c = glowCache[color];
    if (!c) {
      c = glowCache[color] = mk(64, 64);
      const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    }
    if (r < 1) return;
    ctx.globalAlpha = a;
    ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // ─── 태양계 여행 그림 (data.js ZONES와 같은 차례) + 블랙홀 ───
  // sky: 하늘 위→지평선 · neb: 성운 두 색 · star: 가끔 섞는 별 색 · floor: 바닥 · track: 길 띠
  // grid: 바깥 격자 (r,g,b) · lane: 줄 선·길 테두리 (r,g,b) · glow: 지평선 빛 (r,g,b) · line: 지평선 줄 · accent: 아치·글자 색
  // paint(g, L, S): 하늘에 떠 있는 행성·해·달 (S: 크기 도우미). 모두 미리 그려 두는 그림이라 여기서는 shadowBlur를 써도 된다
  const PLANET_ART = [
    { id: 'mercury', sky: ['#07030a', '#2a0f14', '#6a2a1a'], neb: ['rgba(255,140,60,0.28)', 'rgba(255,80,60,0.2)'], star: '#ffe0c0',
      floor: ['#2a1410', '#140a08', '#070304'], track: ['rgba(140,90,70,0.45)', 'rgba(90,60,50,0.35)'],
      grid: '255,150,70', lane: '255,230,170', glow: '255,170,90', line: 'rgba(255,230,190,0.95)', accent: '#ffd27a',
      paint(g, L, S) {
        // 아주 가까운 커다란 해 (줄무늬로 잘린 신스웨이브 해)
        stripedSun(g, L.cx, L.hy - S.sr * 0.05, S.sr * 1.55, ['#fffbe0', '#ffd24a', '#ff6a2a'], 'rgba(255,170,60,0.9)', '#3a1208');
        // 회색 곰보 수성
        const p = S.side(0.12);
        sphere(g, p.x, p.y, p.r, ['#f2eee8', '#a39c95', '#3b3632'], 'rgba(255,220,180,0.45)', -0.9, (x, y, r) => {
          const cr = RN.rng(4);
          for (let k = 0; k < 16; k++) {
            const a = cr() * TAU, d = Math.sqrt(cr()) * r * 0.85, rr = r * (0.05 + cr() * 0.13);
            const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
            g.fillStyle = 'rgba(40,34,30,0.45)'; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
            g.strokeStyle = 'rgba(255,250,240,0.35)'; g.lineWidth = Math.max(1, rr * 0.18);
            g.beginPath(); g.arc(cx - rr * 0.1, cy - rr * 0.1, rr, Math.PI * 0.9, Math.PI * 1.7); g.stroke();
          }
        });
      } },
    { id: 'venus', sky: ['#0a0603', '#2e1a06', '#6e4410'], neb: ['rgba(255,200,80,0.25)', 'rgba(255,150,40,0.2)'], star: '#fff0c0',
      floor: ['#2c1d08', '#150e04', '#070502'], track: ['rgba(200,150,60,0.4)', 'rgba(140,90,30,0.3)'],
      grid: '255,190,60', lane: '255,236,160', glow: '255,200,90', line: 'rgba(255,240,200,0.95)', accent: '#ffe066',
      paint(g, L, S) {
        smallSun(g, S.x(0.18), L.hy * 0.3, S.m * 0.03, 'rgba(255,240,200,0.9)');
        // 크게 떠오르는 금성: 노랑·주황 두꺼운 구름이 빙글빙글
        const r = S.m * 0.33, y = L.hy + r * 0.42;
        sphere(g, L.cx, y, r, ['#fff4c8', '#f0b44a', '#8a4a10'], 'rgba(255,200,90,0.7)', -0.5, (x, yy, rr) => {
          const cr = RN.rng(12);
          for (let k = 0; k < 26; k++) {
            const ry = yy - rr * (0.95 - k * 0.075), w = rr * (0.7 + cr() * 0.6), a = 0.1 + cr() * 0.16;
            g.strokeStyle = k % 3 ? 'rgba(255,245,210,' + a + ')' : 'rgba(170,90,20,' + a + ')';
            g.lineWidth = rr * (0.03 + cr() * 0.05);
            g.beginPath(); g.ellipse(x + (cr() - 0.5) * rr * 0.6, ry, w, rr * (0.06 + cr() * 0.12), (cr() - 0.5) * 0.25, Math.PI * (0.1 + cr() * 0.3), Math.PI * (1.2 + cr() * 0.7)); g.stroke();
          }
          // 소용돌이 몇 개
          for (let k = 0; k < 3; k++) {
            const sx = x + (cr() - 0.5) * rr, sy = yy - rr * (0.3 + cr() * 0.5);
            g.strokeStyle = 'rgba(255,250,225,0.3)'; g.lineWidth = rr * 0.025;
            g.beginPath();
            for (let t = 0; t < 1; t += 0.04) { const a = t * 9, d = rr * 0.12 * t; g.lineTo(sx + Math.cos(a) * d * 1.6, sy + Math.sin(a) * d * 0.6); }
            g.stroke();
          }
        });
      } },
    { id: 'earth', sky: ['#01030c', '#06163a', '#10407a'], neb: ['rgba(60,140,255,0.25)', 'rgba(120,80,220,0.18)'], star: '#e8f4ff',
      floor: ['#0a1e3a', '#050f22', '#02060e'], track: ['rgba(60,140,255,0.35)', 'rgba(40,200,160,0.25)'],
      grid: '80,170,255', lane: '140,255,200', glow: '120,200,255', line: 'rgba(210,240,255,0.95)', accent: '#8cffc8',
      paint(g, L, S) {
        // 달 (회색, 곰보)
        const mo = S.side(0.06);
        sphere(g, mo.x, mo.y, mo.r, ['#ffffff', '#b8bcc4', '#4a4e58'], 'rgba(220,230,255,0.5)', -0.8, (x, y, r) => {
          const cr = RN.rng(33);
          for (let k = 0; k < 7; k++) { g.fillStyle = 'rgba(70,74,86,0.4)'; g.beginPath(); g.arc(x + (cr() - 0.5) * r * 1.3, y + (cr() - 0.5) * r * 1.3, r * (0.08 + cr() * 0.16), 0, TAU); g.fill(); }
        });
        // 떠오르는 지구: 파란 바다, 초록·갈색 땅, 흰 구름
        const r = S.m * 0.36, y = L.hy + r * 0.4;
        sphere(g, L.cx, y, r, ['#bfe6ff', '#2f7de0', '#08255a'], 'rgba(110,190,255,0.9)', -0.6, (x, yy, rr) => {
          const cr = RN.rng(21);
          const blob = (bx, by, br, col) => {
            g.fillStyle = col; g.beginPath();
            for (let k = 0; k < 14; k++) { const a = TAU * k / 14, d = br * (0.6 + cr() * 0.5); g.lineTo(bx + Math.cos(a) * d * 1.3, by + Math.sin(a) * d * 0.8); }
            g.closePath(); g.fill();
          };
          blob(x - rr * 0.45, yy - rr * 0.55, rr * 0.28, '#3fa85a'); blob(x - rr * 0.3, yy - rr * 0.35, rr * 0.18, '#7a9a3a');
          blob(x + rr * 0.35, yy - rr * 0.7, rr * 0.22, '#46b060'); blob(x + rr * 0.55, yy - rr * 0.45, rr * 0.15, '#a88a4a');
          blob(x + rr * 0.05, yy - rr * 0.85, rr * 0.12, '#58b868');
          // 구름 띠
          g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineCap = 'round';
          for (let k = 0; k < 9; k++) {
            g.lineWidth = rr * (0.025 + cr() * 0.03);
            const cy2 = yy - rr * (0.3 + cr() * 0.65), cx2 = x + (cr() - 0.5) * rr * 1.5;
            g.beginPath(); g.ellipse(cx2, cy2, rr * (0.15 + cr() * 0.25), rr * 0.05, (cr() - 0.5) * 0.4, 0, Math.PI * (0.8 + cr())); g.stroke();
          }
          // 북극 얼음
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(x - rr * 0.1, yy - rr * 0.97, rr * 0.3, rr * 0.08, 0, 0, TAU); g.fill();
        });
      } },
    { id: 'mars', sky: ['#0a0305', '#2e0c10', '#7a2a1c'], neb: ['rgba(255,110,70,0.28)', 'rgba(200,60,90,0.18)'], star: '#ffd8c8',
      floor: ['#3a140c', '#1c0806', '#0a0302'], track: ['rgba(220,90,50,0.4)', 'rgba(150,50,30,0.3)'],
      grid: '255,110,60', lane: '255,200,160', glow: '255,120,80', line: 'rgba(255,215,190,0.95)', accent: '#ffab7a',
      paint(g, L, S) {
        smallSun(g, L.cx, L.hy - S.m * 0.02, S.m * 0.035, 'rgba(255,230,210,0.9)');
        const p = S.side(0.15);
        sphere(g, p.x, p.y, p.r, ['#ffc8a0', '#e0602c', '#6a1a08'], 'rgba(255,120,70,0.6)', -0.8, (x, y, r) => {
          const cr = RN.rng(8);
          for (let k = 0; k < 7; k++) {
            g.fillStyle = 'rgba(90,25,10,' + (0.25 + cr() * 0.25) + ')';
            g.beginPath(); g.ellipse(x + (cr() - 0.5) * r * 1.2, y + (cr() - 0.3) * r, r * (0.12 + cr() * 0.22), r * (0.06 + cr() * 0.1), cr() * 3, 0, TAU); g.fill();
          }
          // 흰 얼음 모자 (극지방)
          g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.ellipse(x, y - r * 0.9, r * 0.38, r * 0.14, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(x + r * 0.1, y + r * 0.93, r * 0.22, r * 0.07, 0, 0, TAU); g.fill();
        });
        // 작은 달 둘 (포보스·데이모스)
        g.fillStyle = '#b8a090'; g.beginPath(); g.ellipse(p.x - p.r * 1.5, p.y - p.r * 0.5, p.r * 0.09, p.r * 0.07, 0.5, 0, TAU); g.fill();
        g.fillStyle = '#a89080'; g.beginPath(); g.arc(p.x + p.r * 1.6, p.y + p.r * 0.2, p.r * 0.05, 0, TAU); g.fill();
      } },
    { id: 'jupiter', sky: ['#060308', '#1e0e1a', '#4a2a22'], neb: ['rgba(255,170,110,0.2)', 'rgba(160,80,160,0.2)'], star: '#fff0d8',
      floor: ['#2a1a12', '#140c08', '#060403'], track: ['rgba(220,160,100,0.38)', 'rgba(170,90,60,0.28)'],
      grid: '255,170,100', lane: '255,230,190', glow: '255,190,130', line: 'rgba(255,238,210,0.95)', accent: '#ffc98a',
      paint(g, L, S) {
        // 아주 큰 목성: 줄무늬와 커다란 빨간 점
        const r = S.m * 0.56, y = L.hy + r * 0.5;
        sphere(g, L.cx, y, r, ['#fff0d8', '#d8a878', '#5a3420'], 'rgba(255,200,150,0.6)', -0.4, (x, yy, rr) => {
          const bands = [['rgba(150,80,40,0.55)', 0.06], ['rgba(255,240,215,0.5)', 0.05], ['rgba(180,100,60,0.5)', 0.08], ['rgba(250,225,190,0.45)', 0.05],
            ['rgba(130,70,40,0.5)', 0.07], ['rgba(255,235,205,0.5)', 0.06], ['rgba(170,95,55,0.45)', 0.07]];
          let by = yy - rr * 0.98;
          const cr = RN.rng(5);
          for (const [col, hgt] of bands) {
            by += rr * (0.05 + cr() * 0.04);
            g.fillStyle = col;
            g.beginPath(); g.ellipse(x, by + rr * hgt * 0.5, rr * 1.1, rr * hgt * 0.55, 0, 0, TAU); g.fill();
            by += rr * hgt;
          }
          // 커다란 빨간 점
          const sx = x + rr * 0.3, sy = yy - rr * 0.74;
          const sg = g.createRadialGradient(sx, sy, 0, sx, sy, rr * 0.16);
          sg.addColorStop(0, '#e05030'); sg.addColorStop(0.7, '#b83a22'); sg.addColorStop(1, 'rgba(160,60,40,0)');
          g.fillStyle = sg; g.beginPath(); g.ellipse(sx, sy, rr * 0.17, rr * 0.08, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,220,190,0.6)'; g.lineWidth = rr * 0.012; g.beginPath(); g.ellipse(sx, sy, rr * 0.19, rr * 0.095, 0, 0, TAU); g.stroke();
        });
        // 작은 달들
        for (const [fx, fy, rr, c] of [[0.14, 0.3, 0.012, '#ffe27a'], [0.26, 0.18, 0.009, '#e8e4dc'], [0.82, 0.22, 0.011, '#c8b8a0']]) {
          g.fillStyle = c; g.beginPath(); g.arc(L.w * fx, L.hy * fy, S.m * rr, 0, TAU); g.fill();
        }
      } },
    { id: 'saturn', sky: ['#050408', '#1a1428', '#4a3a3a'], neb: ['rgba(255,210,120,0.22)', 'rgba(120,100,200,0.2)'], star: '#fff4d8',
      floor: ['#241c14', '#120e0a', '#060504'], track: ['rgba(230,190,110,0.38)', 'rgba(150,120,80,0.28)'],
      grid: '255,205,110', lane: '255,240,200', glow: '255,215,140', line: 'rgba(255,244,215,0.95)', accent: '#ffe08a',
      paint(g, L, S) {
        smallSun(g, S.x(0.2), L.hy * 0.75, S.m * 0.02, 'rgba(255,245,220,0.8)');
        // 금빛 토성과 넓은 고리 (고리 뒤쪽 반 → 행성 → 앞쪽 반)
        const r = Math.min(S.m * 0.12, L.hy * 0.26), x = L.port ? L.w * 0.6 : L.w * 0.66, y = L.hy * 0.5, tilt = -0.28;
        const rings = [[2.25, 0.16, 'rgba(230,200,150,0.55)'], [2.0, 0.1, 'rgba(255,235,190,0.85)'], [1.78, 0.14, 'rgba(210,175,120,0.75)'], [1.5, 0.12, 'rgba(160,130,90,0.45)']];
        const ringDraw = front => {
          for (const [k, wd, col] of rings) {
            g.strokeStyle = col; g.lineWidth = r * wd;
            g.beginPath(); g.ellipse(x, y, r * k, r * k * 0.3, tilt, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
          }
        };
        ringDraw(false);
        sphere(g, x, y, r, ['#fff4d0', '#e0b868', '#6a4a20'], 'rgba(255,220,150,0.6)', -0.7, (cx, cy, rr) => {
          for (let k = -3; k <= 3; k++) { g.fillStyle = k % 2 ? 'rgba(170,120,60,0.3)' : 'rgba(255,245,220,0.25)'; g.fillRect(cx - rr, cy + k * rr * 0.26 - rr * 0.07, rr * 2, rr * 0.14); }
        });
        ringDraw(true);
      } },
    { id: 'uranus', sky: ['#020608', '#082628', '#1a5a5e'], neb: ['rgba(120,240,240,0.22)', 'rgba(80,160,220,0.18)'], star: '#e0ffff',
      floor: ['#0a2a2c', '#051618', '#020808'], track: ['rgba(120,230,230,0.32)', 'rgba(80,170,200,0.25)'],
      grid: '110,240,230', lane: '210,255,255', glow: '140,240,240', line: 'rgba(225,255,255,0.95)', accent: '#aaf8ff',
      paint(g, L, S) {
        smallSun(g, S.x(0.2), L.hy * 0.8, S.m * 0.014, 'rgba(255,255,240,0.8)');
        // 옆으로 누운 하늘색 천왕성 (고리가 거의 세로)
        const p = S.side(0.13), tilt = 1.35;
        const ring = front => {
          g.strokeStyle = 'rgba(210,255,255,0.7)'; g.lineWidth = Math.max(1.5, p.r * 0.05);
          g.beginPath(); g.ellipse(p.x, p.y, p.r * 1.45, p.r * 0.36, tilt, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
          g.strokeStyle = 'rgba(170,230,240,0.45)'; g.lineWidth = Math.max(1, p.r * 0.03);
          g.beginPath(); g.ellipse(p.x, p.y, p.r * 1.6, p.r * 0.4, tilt, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
        };
        ring(false);
        sphere(g, p.x, p.y, p.r, ['#effffd', '#8ee4e6', '#2a7a88'], 'rgba(160,250,250,0.55)', -0.8, (x, y, r) => {
          g.fillStyle = 'rgba(255,255,255,0.12)';
          for (let k = -2; k <= 2; k++) { g.save(); g.translate(x, y); g.rotate(tilt); g.fillRect(-r, k * r * 0.3 - r * 0.05, r * 2, r * 0.1); g.restore(); }
        });
        ring(true);
      } },
    { id: 'neptune', sky: ['#01020a', '#05103a', '#10287a'], neb: ['rgba(60,100,255,0.28)', 'rgba(40,200,255,0.16)'], star: '#dfe8ff',
      floor: ['#081440', '#040a22', '#02040e'], track: ['rgba(70,110,255,0.4)', 'rgba(40,180,255,0.25)'],
      grid: '80,120,255', lane: '150,210,255', glow: '100,150,255', line: 'rgba(200,225,255,0.95)', accent: '#8ab8ff',
      paint(g, L, S) {
        smallSun(g, S.x(0.24), L.hy * 0.85, S.m * 0.011, 'rgba(255,255,240,0.8)');
        const p = S.side(0.15);
        sphere(g, p.x, p.y, p.r, ['#b8d4ff', '#2f5ae0', '#081a60'], 'rgba(90,140,255,0.7)', -0.8, (x, y, r) => {
          g.fillStyle = 'rgba(20,40,140,0.35)';
          for (let k = -2; k <= 2; k++) g.fillRect(x - r, y + k * r * 0.35 - r * 0.06, r * 2, r * 0.12);
          // 검은 폭풍 + 흰 구름 줄
          g.fillStyle = 'rgba(8,16,60,0.8)'; g.beginPath(); g.ellipse(x - r * 0.2, y - r * 0.15, r * 0.24, r * 0.12, -0.1, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineCap = 'round'; g.lineWidth = r * 0.04;
          for (const [dx, dy, ww] of [[-0.15, 0.02, 0.25], [0.3, 0.35, 0.2], [0.1, -0.45, 0.18]]) { g.beginPath(); g.moveTo(x + (dx - ww) * r, y + dy * r); g.lineTo(x + (dx + ww) * r, y + dy * r - r * 0.03); g.stroke(); }
        });
      } },
    { id: 'pluto', sky: ['#020203', '#0b0a14', '#1e1a2a'], neb: ['rgba(140,120,200,0.14)', 'rgba(90,120,160,0.12)'], star: '#f0f0ff',
      floor: ['#1c2230', '#0e121a', '#05060a'], track: ['rgba(190,210,240,0.28)', 'rgba(150,140,200,0.22)'],
      grid: '180,170,255', lane: '225,235,255', glow: '170,180,230', line: 'rgba(230,236,255,0.9)', accent: '#e6d8ff',
      paint(g, L, S) {
        // 아주 먼 해: 작은 밝은 점
        smallSun(g, L.cx - S.m * 0.1, L.hy - S.m * 0.05, S.m * 0.008, 'rgba(255,255,230,0.9)');
        // 작고 옅은 명왕성, 하트 무늬 + 카론
        const p = S.side(0.08);
        sphere(g, p.x, p.y, p.r, ['#fff4e4', '#d8b890', '#5a4030'], 'rgba(255,230,200,0.35)', -0.9, (x, y, r) => {
          g.fillStyle = 'rgba(140,70,40,0.45)'; g.beginPath(); g.ellipse(x - r * 0.45, y + r * 0.35, r * 0.45, r * 0.3, 0.4, 0, TAU); g.fill();
          // 하트 모양 얼음 평원
          const hx = x + r * 0.18, hy = y + r * 0.05, hs = r * 0.42;
          g.fillStyle = 'rgba(255,252,244,0.95)';
          g.beginPath(); g.moveTo(hx, hy + hs * 0.85);
          g.bezierCurveTo(hx - hs * 1.3, hy - hs * 0.05, hx - hs * 0.6, hy - hs * 1.1, hx, hy - hs * 0.4);
          g.bezierCurveTo(hx + hs * 0.6, hy - hs * 1.1, hx + hs * 1.3, hy - hs * 0.05, hx, hy + hs * 0.85);
          g.fill();
        });
        g.fillStyle = '#9a9aa4'; g.beginPath(); g.arc(p.x + p.r * 1.9, p.y - p.r * 0.6, p.r * 0.42, 0, TAU); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(p.x + p.r * 2.0, p.y - p.r * 0.52, p.r * 0.36, 0, TAU); g.fill();
      } },
    { id: 'beyond', sky: ['#06020e', '#1d0838', '#4e1a62'], neb: ['rgba(160,70,255,0.35)', 'rgba(255,180,60,0.22)'], star: '#fff2d0',
      floor: ['#1c0a2e', '#0c0418', '#05020c'], track: ['rgba(140,70,220,0.45)', 'rgba(255,170,60,0.22)'],
      grid: '255,190,60', lane: '205,150,255', glow: '255,190,90', line: 'rgba(255,236,190,0.95)', accent: '#ffd24a',
      paint(g, L, S) {
        // 금빛 소용돌이 은하
        const sr = S.sr, cx = L.cx, gy = L.hy - sr * 0.25;
        g.globalCompositeOperation = 'lighter';
        for (let arm = 0; arm < 2; arm++) {
          for (let k = 0; k < 90; k++) {
            const t = k / 90, a = arm * Math.PI + t * 5.2, rr = sr * (0.15 + t * 1.9);
            const x = cx + Math.cos(a) * rr, y = gy + Math.sin(a) * rr * 0.28, rad = sr * (0.2 - t * 0.12);
            const gr = g.createRadialGradient(x, y, 0, x, y, rad);
            gr.addColorStop(0, t < 0.5 ? 'rgba(255,210,120,0.22)' : 'rgba(190,120,255,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
          }
        }
        const cg = g.createRadialGradient(cx, gy, 0, cx, gy, sr * 0.9);
        cg.addColorStop(0, 'rgba(255,255,235,1)'); cg.addColorStop(0.25, 'rgba(255,215,110,0.85)'); cg.addColorStop(1, 'rgba(180,80,255,0)');
        g.fillStyle = cg; g.beginPath(); g.ellipse(cx, gy, sr * 0.9, sr * 0.45, 0, 0, TAU); g.fill();
        g.globalCompositeOperation = 'source-over';
      } },
  ];
  // 블랙홀 하늘 (side 0 왼쪽 · 2 오른쪽). 빛나는 강착 원반, 둘레의 빛 고리. 도는 빛은 bhSwirl 스프라이트로 따로
  const BH_ART = { id: 'blackhole', sky: ['#000000', '#07020e', '#1a0826'], neb: ['rgba(120,40,200,0.2)', 'rgba(255,120,40,0.12)'], star: '#e8d8ff',
    floor: ['#120818', '#08040c', '#020104'], track: ['rgba(150,70,230,0.35)', 'rgba(255,130,60,0.18)'],
    grid: '170,90,255', lane: '230,190,255', glow: '255,150,70', line: 'rgba(240,215,255,0.9)', accent: '#d8b0ff' };
  const bhSpot = (L, side) => ({ x: side === 0 ? L.w * (L.port ? 0.3 : 0.24) : L.w * (L.port ? 0.7 : 0.76), y: L.hy * 0.5, r: Math.min(L.w, L.h) * (L.port ? 0.07 : 0.075) });
  function paintHole(g, L, side) {
    const b = bhSpot(L, side), r = b.r;
    // 강착 원반 (뒤쪽 반): 주황·흰 빛 고리가 납작하게
    const disk = front => {
      for (let k = 0; k < 7; k++) {
        const rr = r * (1.6 + k * 0.32), a = 0.75 - k * 0.09;
        g.strokeStyle = k < 2 ? 'rgba(255,250,230,' + a + ')' : k < 4 ? 'rgba(255,190,90,' + a + ')' : 'rgba(255,110,60,' + (a * 0.8) + ')';
        g.lineWidth = r * 0.3;
        g.beginPath(); g.ellipse(b.x, b.y, rr, rr * 0.26, -0.12, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
      }
    };
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(b.x, b.y, r, b.x, b.y, r * 5);
    halo.addColorStop(0, 'rgba(255,160,80,0.35)'); halo.addColorStop(0.4, 'rgba(160,70,255,0.18)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(b.x - r * 5, b.y - r * 5, r * 10, r * 10);
    disk(false);
    // 휘어 보이는 빛 (구멍 위아래로 넘어가는 고리)
    g.lineWidth = r * 0.22; g.strokeStyle = 'rgba(255,215,150,0.6)';
    g.beginPath(); g.ellipse(b.x, b.y, r * 1.45, r * 1.3, 0, 0, TAU); g.stroke();
    g.globalCompositeOperation = 'source-over';
    // 사건의 지평선: 새까만 구멍 + 얇은 빛 테두리
    g.shadowColor = 'rgba(255,220,160,0.9)'; g.shadowBlur = r * 0.5;
    g.fillStyle = '#000'; g.beginPath(); g.arc(b.x, b.y, r, 0, TAU); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,245,220,0.95)'; g.lineWidth = Math.max(1.5, r * 0.07);
    g.beginPath(); g.arc(b.x, b.y, r * 1.04, 0, TAU); g.stroke();
    g.globalCompositeOperation = 'lighter';
    disk(true);
    g.globalCompositeOperation = 'source-over';
    // 앞쪽 원반이 구멍을 가리는 곳은 다시 까맣게 (구멍이 원반 위로 보이게)
    g.save(); g.beginPath(); g.arc(b.x, b.y, r * 0.96, Math.PI, TAU); g.clip();
    g.fillStyle = '#000'; g.fillRect(b.x - r, b.y - r, r * 2, r);
    g.restore();
  }
  // 도는 빛: 블랙홀 둘레로 빨려 드는 빛줄기 (한 장 그려 두고 천천히 돌린다)
  let swirlSpr = null;
  function bhSwirl() {
    if (swirlSpr) return swirlSpr;
    const n = 256, c = mk(n, n), g = c.getContext('2d'), o = n / 2;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let arm = 0; arm < 5; arm++) {
      for (let k = 0; k < 40; k++) {
        const t = k / 40, a = arm * TAU / 5 + t * 4.2, d = o * (0.95 - t * 0.7);
        g.fillStyle = arm % 2 ? 'rgba(200,140,255,' + (0.05 + t * 0.12) + ')' : 'rgba(255,190,120,' + (0.05 + t * 0.12) + ')';
        g.beginPath(); g.arc(o + Math.cos(a) * d, o + Math.sin(a) * d, 2 + t * 3, 0, TAU); g.fill();
      }
    }
    return (swirlSpr = c);
  }

  // 해와 행성 그리기 도우미 (미리 그릴 때만 쓴다)
  // 줄무늬로 잘린 신스웨이브 해
  function stripedSun(g, x, y, r, col, glowCol, stripe) {
    const sg = g.createLinearGradient(0, y - r, 0, y + r * 0.3);
    sg.addColorStop(0, col[0]); sg.addColorStop(0.55, col[1]); sg.addColorStop(1, col[2]);
    g.shadowColor = glowCol; g.shadowBlur = r * 0.45;
    g.fillStyle = sg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = stripe;
    for (let k = 0; k < 6; k++) g.fillRect(x - r, y - r * 0.1 + k * r * 0.16, r * 2, 2 + k * r * 0.018);
  }
  // 작은 해: 밝은 점 + 빛무리
  function smallSun(g, x, y, r, col) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 6);
    gr.addColorStop(0, col); gr.addColorStop(0.2, col.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // 둥근 행성: 색 그러데이션 + 가장자리 빛(대기) + 무늬(detail, 행성 안쪽에만) + 밤쪽 그늘
  // light: 해가 있는 쪽 각도 (라디안, 0 = 오른쪽, -π/2 = 위)
  function sphere(g, x, y, r, col, rimCol, light, detail) {
    const lx = Math.cos(light), ly = Math.sin(light);
    const pg = g.createRadialGradient(x + lx * r * 0.45, y + ly * r * 0.45, r * 0.1, x, y, r);
    pg.addColorStop(0, col[0]); pg.addColorStop(0.5, col[1]); pg.addColorStop(1, col[2]);
    g.shadowColor = rimCol; g.shadowBlur = r * 0.35;
    g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.shadowBlur = 0;
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    if (detail) detail(x, y, r);
    // 밤쪽 그늘
    const sh = g.createRadialGradient(x + lx * r * 0.7, y + ly * r * 0.7, r * 0.5, x + lx * r * 0.3, y + ly * r * 0.3, r * 1.6);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.55, 'rgba(0,0,0,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = sh; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
    // 가장자리 빛 테두리
    g.strokeStyle = rimCol; g.lineWidth = Math.max(1.5, r * 0.03);
    g.beginPath(); g.arc(x, y, r - g.lineWidth / 2, light - 1.4, light + 1.4); g.stroke();
  }

  // 하늘·행성·해·바닥·줄 테두리: 화면 크기나 곳이 바뀔 때만 다시 그린다 (곳마다 한 장). key: 행성 차례(0~9) 또는 'bh0'·'bh2'
  function paintBackdrop(L, dpr, key) {
    const A = artOf(key);
    const { w, h, hy, cx } = L;
    const c = mk(w * dpr, h * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    const sky = g.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, A.sky[0]); sky.addColorStop(0.55, A.sky[1]); sky.addColorStop(1, A.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, w, hy + 1);
    const rand = RN.rng(9091);
    // 성운
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = rand() * w, y = rand() * hy * 0.8, r = Math.max(w, h) * (0.18 + rand() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, A.neb[i % 2]); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, hy);
    }
    g.globalCompositeOperation = 'source-over';
    // 별
    const n = Math.round(160 * (w * hy) / (1280 * 280));
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.25 + rand() * 0.6;
      g.fillStyle = rand() < 0.15 ? A.star : '#dff6ff';
      const s = rand() < 0.15 ? 2 : 1;
      g.fillRect(rand() * w, rand() * hy * 0.97, s, s);
    }
    g.globalAlpha = 1;
    const m = Math.min(w, h);
    // 하늘의 행성·해 (지평선 아래로는 그리지 않는다)
    const S = {
      m, sr: m * (L.port ? 0.24 : 0.2),
      x: f => (L.port ? 1 - f : f) * w,
      // 옆 하늘에 뜬 행성 자리 (가로 화면은 오른쪽 위, 세로 화면은 왼쪽 위). k: 크기 (짧은 변 비율)
      side: k => { const r = Math.min(m * k, hy * 0.36); return { x: L.port ? w * 0.26 : w * 0.76, y: Math.max(r + 8, hy * 0.52), r }; },
    };
    g.save();
    g.beginPath(); g.rect(0, 0, w, hy); g.clip();
    if (typeof key === 'string' && key.startsWith('bh')) paintHole(g, L, +key.slice(2));
    else A.paint(g, L, S);
    g.restore();
    // 바닥 (가까울수록 짙게)
    const fl = g.createLinearGradient(0, hy, 0, h);
    fl.addColorStop(0, A.floor[0]); fl.addColorStop(0.25, A.floor[1]); fl.addColorStop(1, A.floor[2]);
    g.fillStyle = fl; g.fillRect(0, hy, w, h - hy);
    // 달리는 길: 조금 밝은 띠
    const far = D.VIEW, near = -CAMZ + 0.7;
    const quad = (l0, l1) => {
      const a = proj(L, l0, far), b = proj(L, l1, far), cc = proj(L, l1, near), d = proj(L, l0, near);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(cc.x, cc.y); g.lineTo(d.x, d.y); g.closePath();
    };
    const tg = g.createLinearGradient(0, hy, 0, h);
    tg.addColorStop(0, A.track[0]); tg.addColorStop(1, A.track[1]);
    g.fillStyle = tg; quad(-0.5, 2.5); g.fill();
    const line = (l, color, width, blur) => {
      const a = proj(L, l, far), b = proj(L, l, near);
      g.strokeStyle = color; g.lineWidth = width; g.shadowColor = color; g.shadowBlur = blur;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    };
    for (let k = 1; k <= 8; k++) { line(-0.5 - k, 'rgba(' + A.grid + ',0.28)', 1.5, 0); line(2.5 + k, 'rgba(' + A.grid + ',0.28)', 1.5, 0); }
    // 줄 사이 선 (옅게) · 길 테두리 (밝게, 발광은 여기서 한 번만)
    line(0.5, 'rgba(' + A.lane + ',0.35)', 2, 6); line(1.5, 'rgba(' + A.lane + ',0.35)', 2, 6);
    line(-0.5, 'rgba(' + A.lane + ',0.95)', 3, 16); line(2.5, 'rgba(' + A.lane + ',0.95)', 3, 16);
    g.shadowBlur = 0;
    // 지평선 빛
    const hg = g.createLinearGradient(0, hy - 18, 0, hy + 30);
    hg.addColorStop(0, 'rgba(' + A.glow + ',0)'); hg.addColorStop(0.35, 'rgba(' + A.glow + ',0.55)'); hg.addColorStop(1, 'rgba(' + A.glow + ',0)');
    g.fillStyle = hg; g.fillRect(0, hy - 18, w, 48);
    g.fillStyle = A.line; g.fillRect(0, hy, w, 1.5);
    // 가장자리 어둡게
    const v = g.createRadialGradient(cx, h * 0.55, m * 0.35, cx, h * 0.55, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    return c;
  }

  // 운석: 울퉁불퉁한 바위 + 빨간 테두리·빨간 빛무리 + 달아오른 금 (위험하다는 것이 한눈에)
  const MS = 128, MR = 42;   // 스프라이트 크기, 그 안의 바위 반지름
  const meteorSprites = [];
  function meteorSprite(i) {
    if (meteorSprites[i]) return meteorSprites[i];
    const c = mk(MS, MS), g = c.getContext('2d'), o = MS / 2, rand = RN.rng(31 + i * 17);
    const halo = g.createRadialGradient(o, o, MR * 0.8, o, o, o);
    halo.addColorStop(0, 'rgba(255,59,78,0.75)'); halo.addColorStop(1, 'rgba(255,59,78,0)');
    g.fillStyle = halo; g.fillRect(0, 0, MS, MS);
    const pts = [];
    for (let k = 0; k < 11; k++) { const a = TAU * k / 11, r = MR * (0.82 + rand() * 0.18); pts.push([o + Math.cos(a) * r, o + Math.sin(a) * r]); }
    const path = () => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    const rg = g.createRadialGradient(o - MR * 0.4, o - MR * 0.45, MR * 0.1, o, o, MR);
    rg.addColorStop(0, '#8a6470'); rg.addColorStop(0.55, '#46283a'); rg.addColorStop(1, '#1e0f1c');
    path(); g.fillStyle = rg; g.fill();
    // 구덩이
    for (let k = 0; k < 4; k++) {
      const a = rand() * TAU, d = rand() * MR * 0.5, r = MR * (0.1 + rand() * 0.1);
      g.fillStyle = 'rgba(15,5,12,0.55)'; g.beginPath(); g.arc(o + Math.cos(a) * d, o + Math.sin(a) * d, r, 0, TAU); g.fill();
    }
    // 달아오른 금
    g.strokeStyle = '#ff7a3d'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.shadowColor = '#ff3b4e'; g.shadowBlur = 8;
    for (let k = 0; k < 3; k++) {
      let x = o + (rand() - 0.5) * MR, y = o + (rand() - 0.5) * MR;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += (rand() - 0.5) * MR * 0.6; y += (rand() - 0.5) * MR * 0.6; g.lineTo(x, y); }
      g.stroke();
    }
    // 빨간 테두리
    g.shadowBlur = 10; g.strokeStyle = '#ff3b4e'; g.lineWidth = 4; g.lineJoin = 'round';
    path(); g.stroke();
    g.shadowBlur = 0;
    return (meteorSprites[i] = c);
  }

  // 별: 노란 네 갈래 별 + 흰 가운데
  let starSpr = null;
  function starSprite() {
    if (starSpr) return starSpr;
    const c = mk(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,230,109,0.7)'); gr.addColorStop(1, 'rgba(255,230,109,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffe66d';
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + TAU * i / 8, r = i % 2 ? 7 : 20; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.strokeStyle = '#fff4c2'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 4.5, 0, TAU); g.fill();
    return (starSpr = c);
  }

  // 아이템 그림 (HUD 칸·아이템 구슬 공용). r: 크기
  function itemIcon(g, kind, x, y, r, color) {
    g.fillStyle = color; g.strokeStyle = color;
    if (kind === 'shield') {
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r * 0.85, y - r * 0.6); g.lineTo(x + r * 0.75, y + r * 0.25);
      g.quadraticCurveTo(x + r * 0.4, y + r * 0.8, x, y + r); g.quadraticCurveTo(x - r * 0.4, y + r * 0.8, x - r * 0.75, y + r * 0.25);
      g.lineTo(x - r * 0.85, y - r * 0.6); g.closePath(); g.fill();
      g.fillStyle = 'rgba(7,10,18,0.55)'; g.beginPath(); g.moveTo(x, y - r * 0.55); g.lineTo(x + r * 0.45, y - r * 0.3); g.lineTo(x, y + r * 0.55); g.closePath(); g.fill();
    } else if (kind === 'magnet') {
      g.lineWidth = r * 0.5; g.lineCap = 'butt';
      g.beginPath(); g.arc(x, y - r * 0.05, r * 0.6, Math.PI, 0, true); g.stroke();
      g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.05); g.lineTo(x - r * 0.6, y - r * 0.75); g.moveTo(x + r * 0.6, y - r * 0.05); g.lineTo(x + r * 0.6, y - r * 0.75); g.stroke();
      g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.55); g.lineTo(x - r * 0.6, y - r * 0.8); g.moveTo(x + r * 0.6, y - r * 0.55); g.lineTo(x + r * 0.6, y - r * 0.8); g.stroke();
    } else if (kind === 'boost') {
      g.beginPath();
      g.moveTo(x + r * 0.2, y - r); g.lineTo(x - r * 0.6, y + r * 0.12); g.lineTo(x - r * 0.02, y + r * 0.12);
      g.lineTo(x - r * 0.25, y + r); g.lineTo(x + r * 0.62, y - r * 0.18); g.lineTo(x + r * 0.04, y - r * 0.18); g.closePath(); g.fill();
    } else if (kind === 'star') {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + TAU * i / 10, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    } else if (kind === 'heart' || kind === 'heart0') {
      g.beginPath();
      g.moveTo(x, y + r * 0.85);
      g.bezierCurveTo(x - r * 1.3, y - r * 0.05, x - r * 0.6, y - r * 1.1, x, y - r * 0.4);
      g.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.3, y - r * 0.05, x, y + r * 0.85);
      g.closePath();
      if (kind === 'heart') g.fill(); else { g.lineWidth = Math.max(1.5, r * 0.22); g.stroke(); }
    }
  }
  const itemSprites = {};
  function itemSprite(kind) {
    if (itemSprites[kind]) return itemSprites[kind];
    const c = mk(96, 96), g = c.getContext('2d'), K = ITEM[kind];
    const gr = g.createRadialGradient(48, 48, 20, 48, 48, 48);
    gr.addColorStop(0, K.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.7; g.fillStyle = gr; g.fillRect(0, 0, 96, 96); g.globalAlpha = 1;
    g.fillStyle = 'rgba(7,10,18,0.92)'; g.beginPath(); g.arc(48, 48, 30, 0, TAU); g.fill();
    g.lineWidth = 4; g.strokeStyle = K.color; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(40, 34, 12, 6, -0.5, 0, TAU); g.fill();
    itemIcon(g, kind, 48, 49, 17, K.color);
    return (itemSprites[kind] = c);
  }

  // 곳 이름표 → 그림: 행성 차례(0~9)는 PLANET_ART, 'bh0'·'bh2'는 블랙홀
  const artOf = key => (typeof key === 'string' && key.startsWith('bh') ? BH_ART : PLANET_ART[+key] || PLANET_ART[0]);
  const stopOf = zone => RN.World.placeOf(zone).stop;
  // 지금 보여 줄 하늘: 블랙홀 구간이면 블랙홀, 아니면 지금 행성
  const skyKey = W => (W.bh ? 'bh' + W.bh.side : String(stopOf(W.zone)));

  // ─── 그리기 상태 (꾸밈 전용) ───────────────────────────────
  // bgs: 곳마다 미리 그린 배경 (지금·겹치는 중·곧 올 것만 남긴다) · key/fromKey/zf: 곳이 바뀔 때 겹쳐 바뀌기 · banner: 가운데 큰 글자
  // bhK: 블랙홀 연출 세기 (0 → 1, 별이 휘어 보이기·도는 빛) · sk: 미끄러지는 자세 (0 → 1)
  const R = { bgKey: '', bgs: {}, L: null, parts: [], texts: [], shake: 0, flash: 0, flashColor: '255,77,109', world: null, lines: [], twinkle: null,
    key: '0', fromKey: null, zf: 1, banner: null, bank: 0, bhK: 0, bhSide: 0, sk: 0,
    pirK: 0, pirX: 0, pirY: 0 };

  function text(x, y, txt, color, size, life) {
    if (R.texts.length > 10) R.texts.shift();
    R.texts.push({ x, y, txt, color, size, life: life || 0.9, max: life || 0.9 });
  }
  function burst(x, y, n, colors, speed, size) {
    const P = R.parts;
    for (let i = 0; i < n; i++) {
      if (P.length >= D.FX.maxParticles) P.shift();
      const a = Math.random() * TAU, sp = speed * (0.35 + Math.random() * 0.65), life = 0.35 + Math.random() * 0.4;
      P.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color: colors[i % colors.length], size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  function ring(x, y, r, color, life) {
    if (R.parts.length >= D.FX.maxParticles) R.parts.shift();
    R.parts.push({ ring: true, x, y, r, color, life, max: life });
  }

  // 규칙이 남긴 연출 요청(W.fx)을 입자로 바꾼다
  function takeFx(W, v, L, dist) {
    if (R.world !== W) { R.world = W; R.parts.length = 0; R.texts.length = 0; R.shake = 0; R.flash = 0; R.key = skyKey(W); R.fromKey = null; R.zf = 1; R.banner = null; R.bhK = W.bh ? 1 : 0; R.sk = 0; }
    const s0 = L.F / CAMZ, sq = proj(L, W.p.x, 0, 1.4);
    for (const f of W.fx) {
      const q = proj(L, f.x, Math.max(0, f.z - dist), f.kind === 'star' || f.kind === 'power' ? (f.y || 0.5) : 0.9);
      if (f.kind === 'star') {
        burst(q.x, q.y, D.FX.starSparks, ['#ffe66d', '#fff4c2', '#ffffff'], s0 * 3, s0 * 0.07);
        if (W.chain >= 5 && W.chain % 5 === 0 && !W.fx.some(g => g.kind === 'perfect')) text(q.x, q.y - s0 * 0.6, W.chain + '연속!', '#ffe66d', s0 * 0.3);
      } else if (f.kind === 'power') {
        const K = ITEM[f.item];
        ring(q.x, q.y, s0 * 1.4, K.color, 0.5);
        burst(q.x, q.y, 22, [K.color, '#ffffff'], s0 * 4, s0 * 0.09);
        text(q.x, q.y - s0 * 0.8, f.item === 'heart' ? '하트 +1' : K.name + '!', K.color, s0 * 0.36);
      } else if (f.kind === 'shield') {
        ring(q.x, q.y, s0 * 1.6, '#5ee7ff', 0.5); ring(q.x, q.y, s0 * 2.4, '#bff8ff', 0.6);
        burst(q.x, q.y, 20, ['#5ee7ff', '#ffffff', '#8a6470'], s0 * 5, s0 * 0.1);
        text(q.x, q.y - s0 * 0.9, '방패가 막았다!', '#5ee7ff', s0 * 0.3);
        R.flash = D.FX.flash * 0.6; R.flashColor = '94,231,255';
      } else if (f.kind === 'smash') {
        burst(q.x, q.y, D.FX.smashSparks, f.what === 'gate' ? ['#ff3b4e', '#ffe66d', '#ffffff'] : ['#8a6470', '#ff7a3d', '#ffe66d', '#46283a'], s0 * 6, s0 * 0.12);
        ring(q.x, q.y, s0 * 1.4, '#ffe66d', 0.35);
        if (!v.calm) R.shake = Math.max(R.shake, D.FX.shake * 0.35);
      } else if (f.kind === 'hit' || f.kind === 'crash') {
        // 분명하지만 무섭지 않게: 동그란 고리 + 별가루 + 짧은 글자, 흔들림·번쩍임은 작게
        const big = f.kind === 'crash';
        ring(q.x, q.y, s0 * (big ? 2.4 : 1.7), '#ff6b8a', 0.55);
        burst(q.x, q.y, D.FX.hitSparks * (big ? 1.4 : 1), ['#ff6b8a', '#ffd0d5', '#ffffff', '#ffe66d', '#8a6470'], s0 * (big ? 7 : 5), s0 * 0.11);
        if (!v.calm) R.shake = D.FX.shake * (big ? 1.2 : 1);
        R.flash = D.FX.flash; R.flashColor = '255,107,138';
        if (!big && !W.fx.some(g => g.kind === 'revive')) text(sq.x, sq.y - s0 * 0.4, W.hearts > 0 ? '앗, 쿵! 하트 ' + W.hearts + '개 남았어요' : '쿵!', '#ffb3c4', s0 * 0.3, 1.3);
      } else if (f.kind === 'near') {
        text(sq.x, sq.y - s0 * 0.2, '아슬아슬! +' + f.pts, '#bff8ff', s0 * 0.3, 1.0);
        burst(sq.x, sq.y + s0 * 0.3, 10, ['#bff8ff', '#ffffff'], s0 * 3, s0 * 0.06);
      } else if (f.kind === 'perfect') {
        ring(q.x, q.y, s0 * 1.8, '#ffe66d', 0.6);
        burst(q.x, q.y, 16, ['#ffe66d', '#fff4c2', '#ff9fcb'], s0 * 5, s0 * 0.09);
        text(sq.x, sq.y - s0 * 1.0, '완벽! +' + f.pts, '#ffe66d', s0 * 0.4, 1.2);
      } else if (f.kind === 'milestone') {
        const A = artOf(R.key);
        // 행성 도착과 같은 아치면 행성 글자 아래에 거리만 덧붙인다
        if (R.banner && !R.banner.small && R.banner.t < 0.5) R.banner.sub2 = f.m.toLocaleString() + 'm · +' + f.pts + '점';
        else R.banner = { big: f.m.toLocaleString() + 'm', sub: '+' + f.pts + '점', color: A.accent, t: 0, max: 1.6, small: true };
        burst(L.cx, L.hy + (L.py - L.hy) * 0.2, 26, [A.accent, '#ffffff'], s0 * 6, s0 * 0.1);
      } else if (f.kind === 'zone') {
        // 행성 도착: 이름과 한 줄 (2바퀴째부터는 몇 바퀴째인지도)
        const pl = RN.World.placeOf(f.i), A = PLANET_ART[pl.stop];
        R.banner = { big: pl.name + ' 도착!', sub: (pl.lap > 1 && pl.stop === 0 ? '태양계 ' + pl.lap + '바퀴째! ' : '') + pl.line, color: A.accent, t: 0, max: D.FX.banner + 0.6 };
      } else if (f.kind === 'bh') {
        R.banner = { big: '블랙홀 주의!', sub: '끌려가면 반대쪽으로 밀어서 버텨요', color: '#d8b0ff', t: 0, max: D.FX.banner + 0.6 };
        if (!v.calm) R.shake = Math.max(R.shake, D.FX.shake * 0.4);
      } else if (f.kind === 'bhout') {
        R.banner = { big: '블랙홀 탈출!', sub: '+' + f.pts + '점', color: '#d8b0ff', t: 0, max: 1.8, small: true, disp: true };
        burst(L.cx, L.hy + (L.py - L.hy) * 0.2, 26, ['#d8b0ff', '#ffd27a', '#ffffff'], s0 * 6, s0 * 0.1);
      } else if (f.kind === 'pirate') {
        R.banner = { big: '우주 해적 출현!', sub: '빨갛게 빛나는 줄은 옆으로 피해요', color: '#ff9a3d', t: 0, max: D.FX.banner + 0.6 };
        R.pirY = 0;
      } else if (f.kind === 'pirout') {
        R.banner = { big: '해적선을 따돌렸어요!', sub: '+' + f.pts + '점 · 별 소나기!', color: '#ffe66d', t: 0, max: 2.6, disp: true };
        burst(L.cx, L.hy * 0.5, 30, ['#ffe66d', '#ff9a3d', '#ffffff'], s0 * 7, s0 * 0.1);
      } else if (f.kind === 'pull') {
        text(sq.x, sq.y - s0 * 0.6, '슈웅, 끌려갔어요', '#d8b0ff', s0 * 0.3, 1.1);
        burst(sq.x, sq.y, 14, ['#d8b0ff', '#ffffff'], s0 * 4, s0 * 0.07);
      } else if (f.kind === 'resist') {
        text(sq.x, sq.y - s0 * 0.6, '버텼다!', '#ffe66d', s0 * 0.4, 1.1);
        ring(sq.x, sq.y, s0 * 1.5, '#d8b0ff', 0.45);
      } else if (f.kind === 'revive') {
        // 불사조: 불꽃 고리와 함께 다시 날아오른다
        ring(sq.x, sq.y, s0 * 1.6, '#ffd24a', 0.6); ring(sq.x, sq.y, s0 * 2.6, '#ff5a7a', 0.8);
        burst(sq.x, sq.y, 30, ['#ffd24a', '#ff8a3d', '#ff5a7a', '#fff4c2'], s0 * 6, s0 * 0.11);
        text(sq.x, sq.y - s0 * 1.25, '불사조 부활! 다시 날아요', '#ffd24a', s0 * 0.34, 1.6);
      } else if (f.kind === 'tutok') {
        text(sq.x, sq.y - s0 * 0.8, '잘했어요!', '#ffe66d', s0 * 0.45, 1.4);
        burst(sq.x, sq.y, 24, ['#ffe66d', '#5ee7ff', '#ffffff'], s0 * 5, s0 * 0.1);
      } else if (f.kind === 'tutmiss') {
        text(sq.x, sq.y - s0 * 0.8, '괜찮아요! 다시 한 번', '#bff8ff', s0 * 0.36, 1.4);
      }
    }
    W.fx.length = 0;
  }

  function updateFx(dt) {
    const P = R.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life -= dt;
      if (q.life <= 0) { P.splice(i, 1); continue; }
      if (!q.ring) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9; }
    }
    for (let i = R.texts.length - 1; i >= 0; i--) { const q = R.texts[i]; q.life -= dt; q.y -= 36 * dt; if (q.life <= 0) R.texts.splice(i, 1); }
    R.shake = Math.max(0, R.shake - dt * 40);
    R.flash = Math.max(0, R.flash - dt);
    if (R.zf < 1) { R.zf = Math.min(1, R.zf + dt / D.FX.zoneFade); if (R.zf >= 1) R.fromKey = null; }
    if (R.banner && (R.banner.t += dt) > R.banner.max) R.banner = null;
  }

  function drawFx(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const q of R.parts) {
      const a = q.life / q.max;
      ctx.globalAlpha = a;
      if (q.ring) {
        ctx.strokeStyle = q.color; ctx.lineWidth = 2 + a * 4;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.1 - a * 0.8), 0, TAU); ctx.stroke();
      } else {
        const s = q.size * (0.5 + a * 0.5);
        ctx.fillStyle = q.color; ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const q of R.texts) {
      ctx.globalAlpha = Math.min(1, q.life / q.max * 2);
      ctx.font = Math.round(Math.max(16, Math.min(40, q.size))) + 'px ' + DISP;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(q.txt, q.x, q.y);
      ctx.fillStyle = q.color; ctx.fillText(q.txt, q.x, q.y);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // ─── 배경 · 움직이는 바닥 격자 · 빛줄기 ───────────────────
  function backdrop(key, L, v) {
    return R.bgs[key] || (R.bgs[key] = paintBackdrop(L, v.dpr, key));
  }
  function drawBackground(ctx, W, v, L, dist, dt) {
    const key = v.w + 'x' + v.h + '@' + v.dpr;
    if (R.bgKey !== key) {
      R.bgKey = key; R.bgs = {};
      const rand = RN.rng(515);
      R.twinkle = [];
      for (let i = 0; i < 26; i++) R.twinkle.push({ x: rand() * v.w, y: rand() * L.hy * 0.9, ph: rand() * TAU });
    }
    // 곳이 바뀌면 (새 행성·블랙홀 들어감·나옴) 겹쳐 바꾼다
    const skyNow = skyKey(W);
    if (skyNow !== R.key) { R.fromKey = R.zf < 1 && R.fromKey != null ? R.fromKey : R.key; R.key = skyNow; R.zf = 0; }
    // 곧 올 곳: 다음 행성(160m 전부터), 다가오는 블랙홀 구간. 그 밖의 배경은 버린다 (메모리)
    const leg = D.ROUTE.leg, nextZone = Math.floor(dist / leg) + 1;
    const soon = [];
    if (nextZone * leg - dist < 160) soon.push(String(stopOf(nextZone)));
    const hole = W.bhs && W.bhs.find(b => b.start > dist && b.start - dist < 160);
    if (hole) soon.push('bh' + hole.side);
    if (W.bh && W.bh.end - dist < 160) soon.push(String(stopOf(Math.floor(W.bh.end / leg))));
    for (const k in R.bgs) if (k !== R.key && k !== R.fromKey && soon.indexOf(k) < 0) delete R.bgs[k];
    for (const k of soon) if (!R.bgs[k]) { backdrop(k, L, v); break; }   // 한 번에 한 장만 (끊김 없게)
    if (R.zf < 1 && R.fromKey != null) {
      ctx.drawImage(backdrop(R.fromKey, L, v), 0, 0, v.w, v.h);
      ctx.globalAlpha = R.zf;
      ctx.drawImage(backdrop(R.key, L, v), 0, 0, v.w, v.h);
      ctx.globalAlpha = 1;
    } else ctx.drawImage(backdrop(R.key, L, v), 0, 0, v.w, v.h);
    const A = artOf(R.key);
    // 블랙홀: 둘레로 빨려 드는 빛이 천천히 돈다 (움직임 줄이기면 멈춤)
    R.bhK += ((W.bh ? 1 : 0) - R.bhK) * Math.min(1, dt * 1.5);
    if (W.bh) R.bhSide = W.bh.side;
    if (R.bhK > 0.02) {
      const b = bhSpot(L, R.bhSide), sz = b.r * 7, rot = v.calm ? 0.6 : -performance.now() / 1000 * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = R.bhK * 0.9;
      ctx.translate(b.x, b.y); ctx.scale(1, 0.55); ctx.rotate(rot);
      ctx.drawImage(bhSwirl(), -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    // 반짝이는 별 몇 개
    const t = performance.now() / 1000;
    ctx.fillStyle = '#ffffff';
    for (const s of R.twinkle) {
      const a = v.calm ? 0.5 : 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.3 + s.ph));
      ctx.globalAlpha = a; ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3);
    }
    ctx.globalAlpha = 1;
    // 가로 격자선: 5m마다, 달린 만큼 다가온다
    const gap = 5, first = Math.ceil(dist / gap) * gap - dist;
    ctx.lineWidth = 1.5;
    for (let rel = first - gap; rel < D.VIEW; rel += gap) {
      if (rel < -CAMZ + 0.8) continue;
      const a = Math.min(1, (D.VIEW - rel) / 30);
      const l = proj(L, -8.5, rel), r = proj(L, 10.5, rel), tl = proj(L, -0.5, rel), tr = proj(L, 2.5, rel);
      ctx.globalAlpha = a * 0.35; ctx.strokeStyle = 'rgb(' + A.grid + ')';
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
      ctx.globalAlpha = a * 0.55; ctx.strokeStyle = 'rgb(' + A.lane + ')';
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 빛줄기: 빨라질수록·부스트 때 지평선에서 사방으로 흩어진다 (움직임 줄이기 설정이면 생략)
    if (v.calm || !W || W.phase !== 'play' || W.wait > 0) return;
    const S = RN.World.cfg(W).speed, sp = RN.World.speed(W);
    const k = Math.max(0, Math.min(1, (sp - S.base) / (S.max - S.base)));
    const boost = W.eff.boost > 0, want = boost ? 26 : Math.round(4 + k * 10);
    while (R.lines.length < want) R.lines.push({ a: Math.random() * TAU, r: Math.random() * 0.8 + 0.1, v: 0.6 + Math.random() * 0.8 });
    if (R.lines.length > want) R.lines.length = want;
    const maxR = Math.hypot(v.w, v.h) * 0.6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = boost ? '#ffe66d' : '#bff8ff';
    ctx.lineWidth = boost ? 2.5 : 1.5;
    for (const q of R.lines) {
      q.r += q.v * dt * (boost ? 2.4 : 1 + k);
      if (q.r > 1.1) { q.r = 0.12; q.a = Math.random() * TAU; }
      const ca = Math.cos(q.a), sa = Math.sin(q.a);
      if (sa < 0.03) { q.a = 0.1 + Math.random() * (Math.PI - 0.2); continue; }   // 하늘 쪽 위로는 그리지 않는다
      const r0 = q.r * q.r * maxR, r1 = r0 + (0.05 + q.r * 0.18) * maxR;
      ctx.globalAlpha = Math.min(1, q.r * 2) * (boost ? 0.55 : 0.28);
      ctx.beginPath(); ctx.moveTo(L.cx + ca * r0, L.hy + sa * r0); ctx.lineTo(L.cx + ca * r1, L.hy + sa * r1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ─── 우주 해적선 (한 장 미리 그려 두고 찍는다) ───
  // 통통한 보라 배 + 금빛 테두리, 분홍 돛 둘, 별 무늬 깃발, 둥근 창 불빛, 뒤쪽 주황 엔진 (무섭지 않게 장난스러운 모양)
  let pirSpr = null;
  const PIR_W = 320, PIR_H = 220;
  function pirateSprite() {
    if (pirSpr) return pirSpr;
    const c = mk(PIR_W, PIR_H), g = c.getContext('2d'), cx = PIR_W / 2;
    // 돛대와 돛
    g.fillStyle = '#5a3a1a'; g.fillRect(cx - 50, 30, 7, 110); g.fillRect(cx + 38, 44, 7, 96);
    const sail = (x, y, w, h, col) => {
      const sg = g.createLinearGradient(x, y, x + w, y);
      sg.addColorStop(0, col[0]); sg.addColorStop(1, col[1]);
      g.fillStyle = sg;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w * 1.25, y + h * 0.5, x, y + h); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.stroke();
    };
    sail(cx - 43, 36, 70, 88, ['#ff5fa8', '#ffc0dc']);
    sail(cx + 45, 50, 56, 74, ['#ff5fa8', '#ffc0dc']);
    // 깃발 (노란 별)
    g.fillStyle = '#1a0a2a'; g.fillRect(cx - 43, 16, 34, 20);
    g.fillStyle = '#ffe66d'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + TAU * i / 10, r = i % 2 ? 3.5 : 8; g.lineTo(cx - 26 + Math.cos(a) * r, 26 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    // 배 몸통
    const hg = g.createLinearGradient(0, 120, 0, 200);
    hg.addColorStop(0, '#8a4ad8'); hg.addColorStop(0.5, '#5a2a9a'); hg.addColorStop(1, '#2a1050');
    g.fillStyle = hg;
    g.beginPath(); g.moveTo(18, 128); g.lineTo(PIR_W - 18, 128); g.quadraticCurveTo(PIR_W - 30, 200, cx + 40, 204); g.lineTo(cx - 40, 204); g.quadraticCurveTo(30, 200, 18, 128); g.closePath(); g.fill();
    g.strokeStyle = '#ffd24a'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(255,210,74,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(28, 150); g.lineTo(PIR_W - 28, 150); g.stroke();
    // 둥근 창 불빛
    for (let i = -2; i <= 2; i++) {
      g.fillStyle = '#2a1050'; g.beginPath(); g.arc(cx + i * 44, 172, 11, 0, TAU); g.fill();
      g.fillStyle = '#ffe66d'; g.beginPath(); g.arc(cx + i * 44, 172, 7, 0, TAU); g.fill();
    }
    // 앞쪽 레이저 포 (가운데 아래)
    g.fillStyle = '#3a1a5a'; g.fillRect(cx - 12, 198, 24, 14);
    g.fillStyle = '#ff6b3d'; g.beginPath(); g.arc(cx, 212, 7, 0, TAU); g.fill();
    return (pirSpr = c);
  }
  // 줄 가운데 선의 화면 x (멀리 far m, 가까이 near m)
  function laneQuad(ctx, L, lane, halfW, near, far) {
    const a = proj(L, lane - halfW, far), b = proj(L, lane + halfW, far), c = proj(L, lane + halfW, near), d = proj(L, lane - halfW, near);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }
  // 해적선 + 레이저 경고(줄이 주황으로 깜빡) + 레이저(분홍·흰 빛기둥). 바닥 위, 물체보다 먼저 그린다
  function drawPirate(ctx, W, L, v, dt) {
    const S = W.pir;
    R.pirK += ((S ? 1 : 0) - R.pirK) * Math.min(1, dt * (S ? 2.5 : 1.5));
    if (R.pirK < 0.02) return;
    const Z = S && S.laser, t = performance.now() / 1000;
    const aim = Z ? Z.lane : W.p.x;
    R.pirX += (aim - R.pirX) * Math.min(1, dt * 3);
    const s = Math.min(v.w, v.h) / 800;
    const w = PIR_W * 0.9 * s, h = PIR_H * 0.9 * s;
    const x = L.cx + (R.pirX - 1) * v.w * 0.16, bob = v.calm ? 0 : Math.sin(t * 2) * 6 * s;
    const y = L.hy * 0.42 - (1 - R.pirK) * L.hy * 0.9 + bob;
    // 레이저 경고: 그 줄 바닥이 주황으로 깜빡 + 느낌표 판
    if (Z && Z.phase === 'warn') {
      const k = 1 - Z.t / Z.max, blink = v.calm ? 0.7 : 0.45 + 0.35 * Math.abs(Math.sin(t * (8 + k * 10)));
      ctx.globalAlpha = blink * (0.35 + 0.45 * k);
      ctx.fillStyle = '#ff7a2a';
      laneQuad(ctx, L, Z.lane, 0.46, -CAMZ + 0.8, D.VIEW); ctx.fill();
      ctx.globalAlpha = 1;
      for (const rel of [5, 14, 26]) {
        const q = proj(L, Z.lane, rel, 0.05), r = Math.max(10, q.s * 0.45);
        ctx.fillStyle = 'rgba(40,12,4,0.85)'; ctx.strokeStyle = '#ffb13d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(q.x, q.y - r * 1.6); ctx.lineTo(q.x + r, q.y); ctx.lineTo(q.x - r, q.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe66d'; ctx.font = Math.round(r * 1.1) + 'px ' + NUM; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', q.x, q.y - r * 0.5);
      }
      ctx.textBaseline = 'alphabetic';
    }
    // 해적선
    ctx.globalAlpha = Math.min(1, R.pirK * 1.3);
    glow(ctx, 'rgba(255,120,60,0.8)', x, y + h * 0.35, w * 0.35, 0.5);
    ctx.drawImage(pirateSprite(), x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1;
    // 레이저: 배의 포에서 그 줄 먼 곳으로, 그리고 줄 전체가 분홍·흰 빛
    if (Z && Z.phase === 'beam') {
      const k = Z.t / Z.max, gx = x, gy = y + h * 0.46;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + 0.45 * k;
      ctx.fillStyle = '#ff4fa0';
      laneQuad(ctx, L, Z.lane, 0.42, -CAMZ + 0.8, D.VIEW); ctx.fill();
      ctx.fillStyle = '#fff0f8';
      laneQuad(ctx, L, Z.lane, 0.14, -CAMZ + 0.8, D.VIEW); ctx.fill();
      const far = proj(L, Z.lane, D.VIEW * 0.6, 0.3);
      ctx.strokeStyle = '#ff9ad0'; ctx.lineWidth = Math.max(4, 10 * s); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(far.x, far.y); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, 4 * s);
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(far.x, far.y); ctx.stroke();
      glow(ctx, 'rgba(255,120,200,0.9)', gx, gy, 30 * s, 1);
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // 해적 폭탄: 둥근 주황 폭탄 + 뾰족 가시 + 깜빡이는 불빛 (뛰어넘는다). 떨어질 때 위에서 내려온다
  let bombSpr = null;
  function bombSprite() {
    if (bombSpr) return bombSpr;
    const c = mk(96, 96), g = c.getContext('2d'), o = 48;
    const halo = g.createRadialGradient(o, o, 18, o, o, 48);
    halo.addColorStop(0, 'rgba(255,140,60,0.7)'); halo.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 96, 96);
    g.fillStyle = '#ffb13d';
    for (let i = 0; i < 8; i++) { const a = TAU * i / 8; g.beginPath(); g.moveTo(o + Math.cos(a - 0.2) * 22, o + Math.sin(a - 0.2) * 22); g.lineTo(o + Math.cos(a) * 34, o + Math.sin(a) * 34); g.lineTo(o + Math.cos(a + 0.2) * 22, o + Math.sin(a + 0.2) * 22); g.fill(); }
    const bg = g.createRadialGradient(o - 8, o - 8, 3, o, o, 26);
    bg.addColorStop(0, '#a070e0'); bg.addColorStop(0.6, '#4a2080'); bg.addColorStop(1, '#1a0830');
    g.fillStyle = bg; g.beginPath(); g.arc(o, o, 25, 0, TAU); g.fill();
    g.strokeStyle = '#ffb13d'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(o - 9, o - 10, 8, 4, -0.6, 0, TAU); g.fill();
    return (bombSpr = c);
  }
  function drawBomb(ctx, W, L, o, rel, fade, v) {
    ctx.globalAlpha = fade * 0.4;
    ctx.fillStyle = '#ff9a3d';
    floorQuad(ctx, L, o.x, rel, 0.38, 0.6); ctx.fill();
    const fall = Math.max(0, 1 - (W.t - (o.born || 0)) / 0.6);
    const q = proj(L, o.x, rel, 0.55 + fall * fall * 7), size = q.s * 1.7;
    ctx.globalAlpha = fade;
    ctx.drawImage(bombSprite(), q.x - size / 2, q.y - size / 2, size, size);
    const on = v.calm || Math.sin(W.t * 10 + o.z) > 0;
    if (on) glow(ctx, 'rgba(255,80,60,0.95)', q.x, q.y - size * 0.3, size * 0.14, fade);
    ctx.globalAlpha = 1;
  }

  // ─── 물체 ─────────────────────────────────────────────────
  // 바닥의 위험 표시: 장애물이 있는 줄 바닥에 빨간 판
  function floorQuad(ctx, L, lx, rel, halfW, depth) {
    const a = proj(L, lx - halfW, rel + depth), b = proj(L, lx + halfW, rel + depth), c = proj(L, lx + halfW, Math.max(-CAMZ + 0.7, rel - depth)), d = proj(L, lx - halfW, Math.max(-CAMZ + 0.7, rel - depth));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }

  function drawMeteor(ctx, W, L, o, rel, fade, v) {
    ctx.globalAlpha = fade * 0.4;
    ctx.fillStyle = '#ff3b4e';
    floorQuad(ctx, L, o.x, rel, 0.42, 1.1); ctx.fill();
    ctx.globalAlpha = fade;
    const q = proj(L, o.x, rel, D.OBST.meteorR * 0.95);
    const r = D.OBST.meteorR * q.s, spr = meteorSprite(Math.abs(Math.round(o.z * 7)) % 3), size = r * MS / MR;
    const rot = (v.calm ? 0 : W.t * 0.8) + o.z;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(rot);
    ctx.drawImage(spr, -size / 2, -size / 2, size, size);
    ctx.restore();
    // 움직이는 운석: 미끄러질 방향으로 빨간 꺾쇠
    if (o.moving && o.x !== o.to) {
      const d = Math.sign(o.to - o.from), blink = v.calm ? 1 : 0.6 + 0.4 * Math.sin(W.t * 14);
      ctx.globalAlpha = fade * blink;
      ctx.strokeStyle = '#ffd0d5'; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const k of [1.25, 1.6]) {
        const x = q.x + d * r * k, a = r * 0.28;
        ctx.beginPath(); ctx.moveTo(x - d * a, q.y - a); ctx.lineTo(x, q.y); ctx.lineTo(x - d * a, q.y + a); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
  }

  // 레이저 문: 양쪽 기둥 + 빨간 레이저 두 줄 + 바닥 노랑·검정 사선 줄무늬 (뛰어서 넘는다)
  function drawGate(ctx, W, L, o, rel, fade, v) {
    ctx.globalAlpha = fade;
    ctx.save();
    floorQuad(ctx, L, o.x, rel, 0.47, 0.5);
    ctx.fillStyle = '#2a070c'; ctx.fill();
    ctx.clip();
    const a = proj(L, o.x - 0.5, rel), b = proj(L, o.x + 0.5, rel);
    ctx.strokeStyle = 'rgba(255,200,40,0.8)'; ctx.lineWidth = Math.max(2, a.s * 0.25);
    ctx.beginPath();
    for (let k = -0.6; k < 1.6; k += 0.22) { const x = a.x + (b.x - a.x) * k; ctx.moveTo(x, a.y + a.s * 0.5); ctx.lineTo(x + a.s * 0.5, a.y - a.s * 0.5); }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = fade;
    const hgt = D.OBST.gateH;
    const lb = proj(L, o.x - 0.44, rel, 0), lt = proj(L, o.x - 0.44, rel, hgt + 0.35), rb = proj(L, o.x + 0.44, rel, 0), rt = proj(L, o.x + 0.44, rel, hgt + 0.35);
    // 기둥
    const pw = Math.max(2, lb.s * 0.16);
    ctx.fillStyle = '#3a0a10'; ctx.strokeStyle = '#ff3b4e'; ctx.lineWidth = Math.max(1, pw * 0.25);
    for (const [bt, tp] of [[lb, lt], [rb, rt]]) { ctx.fillRect(bt.x - pw / 2, tp.y, pw, bt.y - tp.y); ctx.strokeRect(bt.x - pw / 2, tp.y, pw, bt.y - tp.y); }
    // 레이저 (깜빡이는 빨강, 발광은 스프라이트로)
    const flick = v.calm ? 1 : 0.8 + 0.2 * Math.sin(W.t * 30 + o.z);
    ctx.globalCompositeOperation = 'lighter';
    for (const hh of [hgt * 0.45, hgt * 0.9]) {
      const l = proj(L, o.x - 0.44, rel, hh), r = proj(L, o.x + 0.44, rel, hh);
      const n = 5;
      for (let i = 0; i <= n; i++) glow(ctx, 'rgba(255,59,78,0.9)', l.x + (r.x - l.x) * i / n, l.y, l.s * 0.3, fade * 0.6 * flick);
      ctx.globalAlpha = fade * flick;
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = Math.max(2, l.s * 0.09);
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
      ctx.strokeStyle = '#ffd0d5'; ctx.lineWidth = Math.max(1, l.s * 0.03);
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 기둥 끝 불빛
    ctx.fillStyle = '#ffe66d';
    for (const tp of [lt, rt]) { ctx.beginPath(); ctx.arc(tp.x, tp.y, Math.max(1.5, tp.s * 0.1), 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  // 위쪽 막대: 길 위에 떠 있는 두꺼운 보라 막대 + 높은 기둥 (밑으로 미끄러져 지나간다).
  // 바닥 레이저 문(빨강, 바닥 줄무늬)과 한눈에 다르게: 높이 떠 있고, 밑이 비어 보이고, 막대에 아래 화살표
  function drawBar(ctx, W, L, o, rel, fade, v) {
    const lo = D.OBST.barLo, hi = D.OBST.barHi, top = hi + 0.55;
    // 바닥: 밑으로 지나갈 길이 파랗게 빛난다
    ctx.globalAlpha = fade * 0.35;
    ctx.fillStyle = '#7a5cff';
    floorQuad(ctx, L, o.x, rel, 0.42, 0.45); ctx.fill();
    ctx.globalAlpha = fade;
    // 기둥 (위로 높이)
    const lb = proj(L, o.x - 0.46, rel, 0), lt = proj(L, o.x - 0.46, rel, top), rb = proj(L, o.x + 0.46, rel, 0), rt = proj(L, o.x + 0.46, rel, top);
    const pw = Math.max(2, lb.s * 0.12);
    ctx.fillStyle = '#1e0a36'; ctx.strokeStyle = '#b36bff'; ctx.lineWidth = Math.max(1, pw * 0.25);
    for (const [bt, tp] of [[lb, lt], [rb, rt]]) { ctx.fillRect(bt.x - pw / 2, tp.y, pw, bt.y - tp.y); ctx.strokeRect(bt.x - pw / 2, tp.y, pw, bt.y - tp.y); }
    // 막대: 두꺼운 띠 + 흰·보라 사선 줄무늬 (위험 표시) + 빛
    const a = proj(L, o.x - 0.46, rel, hi), b = proj(L, o.x + 0.46, rel, lo);
    const flick = v.calm ? 1 : 0.85 + 0.15 * Math.sin(W.t * 18 + o.z);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i <= 4; i++) glow(ctx, 'rgba(190,110,255,0.9)', a.x + (b.x - a.x) * i / 4, (a.y + b.y) / 2, a.s * 0.45, fade * 0.45 * flick);
    ctx.globalCompositeOperation = 'source-over';
    const bw = b.x - a.x, bh = b.y - a.y;
    ctx.save();
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(a.x, a.y, bw, bh, Math.min(bh * 0.3, 8)); else ctx.rect(a.x, a.y, bw, bh);
    ctx.fillStyle = '#6a22c8'; ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,240,255,0.55)'; ctx.lineWidth = Math.max(2, bh * 0.22);
    ctx.beginPath();
    for (let x = a.x - bh; x < b.x + bh; x += bh * 0.9) { ctx.moveTo(x, b.y); ctx.lineTo(x + bh, a.y); }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#e8c8ff'; ctx.lineWidth = Math.max(1.5, a.s * 0.05);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(a.x, a.y, bw, bh, Math.min(bh * 0.3, 8)); else ctx.rect(a.x, a.y, bw, bh); ctx.stroke();
    // 막대 가운데 아래 화살표 (밑으로!)
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, ar = bh * 0.32;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(cx - ar, cy - ar * 0.5); ctx.lineTo(cx + ar, cy - ar * 0.5); ctx.lineTo(cx, cy + ar * 0.7); ctx.closePath(); ctx.fill();
    // 기둥 끝 불빛
    ctx.fillStyle = '#e8c8ff';
    for (const tp of [lt, rt]) { ctx.beginPath(); ctx.arc(tp.x, tp.y, Math.max(1.5, tp.s * 0.1), 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  // 블랙홀 구간: 멀리 있는 별은 블랙홀 쪽으로 휘어 보인다 (그림만, 가까이 오면 제자리라 먹는 판정은 그대로)
  const bend = rel => (R.bhK > 0.01 ? (R.bhSide === 0 ? -1 : 1) * R.bhK * 0.9 * Math.pow(Math.max(0, Math.min(1, (rel - 6) / 50)), 1.3) : 0);
  function drawStar(ctx, W, L, o, rel, fade, v) {
    const q = proj(L, o.x + bend(rel), rel, o.y + (v.calm ? 0 : Math.sin(W.t * 4 + o.z) * 0.08));
    const size = q.s * 0.9 * (o.mag ? 0.8 : 1);
    if (size < 1.5) return;
    ctx.globalAlpha = fade;
    if (v.calm) ctx.drawImage(starSprite(), q.x - size / 2, q.y - size / 2, size, size);
    else {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.sin(W.t * 3 + o.z) * 0.35);
      ctx.drawImage(starSprite(), -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawItem(ctx, W, L, o, rel, fade, v) {
    const K = ITEM[o.item];
    const q = proj(L, o.x, rel, o.y + (v.calm ? 0 : Math.sin(W.t * 5) * 0.1));
    const size = q.s * 1.35;
    ctx.globalAlpha = fade;
    ctx.drawImage(itemSprite(o.item), q.x - size / 2, q.y - size / 2, size, size);
    // 이름표: 멀리서도 읽을 수 있게 글자 크기는 너무 작아지지 않는다 (좋은 것이라는 것을 알 수 있게)
    if (rel > 2) {
      const fs = Math.round(Math.max(14, Math.min(26, q.s * 0.42)));
      ctx.font = fs + 'px ' + DISP;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const ty = q.y - size * 0.42 - fs * 0.7;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.9)'; ctx.strokeText(K.name, q.x, ty);
      ctx.fillStyle = K.color; ctx.fillText(K.name, q.x, ty);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  }

  // 기념 아치: 길 전체를 덮는 빛나는 문 + 거리 숫자 (구역이 바뀌는 곳이면 구역 이름도)
  function drawArch(ctx, W, L, o, rel, fade, v) {
    const A = PLANET_ART[stopOf(o.zone != null ? o.zone : W.zone)], col = 'rgb(' + A.lane + ')';
    const H = 4.4, n = 18, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = Math.PI * t;
      pts.push(proj(L, 1 - Math.cos(a) * 1.85, rel, Math.sin(a) * H * 0.75));
    }
    // 기둥
    const lb = proj(L, -0.85, rel, 0), rb = proj(L, 2.85, rel, 0), s = lb.s;
    ctx.globalAlpha = fade;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i <= n; i += 2) glow(ctx, 'rgba(' + A.lane + ',0.8)', pts[i].x, pts[i].y, s * 0.55, fade * 0.35);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(lb.x, lb.y); for (const q of pts) ctx.lineTo(q.x, q.y); ctx.lineTo(rb.x, rb.y); };
    path(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, s * 0.22); ctx.stroke();
    path(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, s * 0.07); ctx.stroke();
    // 아치 위 작은 불빛들 (돈다)
    const tt = v.calm ? 0 : W.t * 1.5;
    ctx.fillStyle = A.accent;
    for (let k = 0; k < 5; k++) { const q = pts[Math.floor(((k / 5 + tt * 0.1) % 1) * n)]; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.5, s * 0.1), 0, TAU); ctx.fill(); }
    // 거리 판
    const top = pts[n >> 1], fs = Math.round(Math.max(10, Math.min(64, s * 0.8)));
    if (fs >= 11) {
      const zoneHere = o.m % D.ROUTE.leg === 0 ? RN.World.placeOf(o.m / D.ROUTE.leg) : null;
      const txt = o.m.toLocaleString() + 'm';
      ctx.font = 'italic 700 ' + fs + 'px ' + NUM;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(txt).width + fs * 0.8, th = fs * 1.2, ty = top.y - th * 0.15;
      ctx.fillStyle = 'rgba(8,10,20,0.85)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(top.x - tw / 2, ty - th / 2, tw, th, fs * 0.3); else ctx.rect(top.x - tw / 2, ty - th / 2, tw, th); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, fs * 0.06); ctx.stroke();
      ctx.fillStyle = A.accent; ctx.fillText(txt, top.x, ty + 1);
      if (zoneHere && fs >= 14) {
        const zs = Math.round(fs * 0.55);
        ctx.font = zs + 'px ' + DISP;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(zoneHere.name, top.x, ty + th * 0.95);
        ctx.fillStyle = '#ffffff'; ctx.fillText(zoneHere.name, top.x, ty + th * 0.95);
      }
      ctx.textBaseline = 'alphabetic';
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  function drawObject(ctx, W, L, o, dist, v) {
    const rel = o.z - dist;
    if (rel + CAMZ < 1.2 || rel > D.VIEW) return;
    if (o.kind === 'arch') {
      if (rel < -CAMZ + 3) return;
      const fa = Math.max(0, Math.min(1, (D.VIEW - rel) / 18, (rel + CAMZ - 3) / 5));
      if (fa > 0) drawArch(ctx, W, L, o, rel, fa, v);
      return;
    }
    // 지평선 쪽에서 서서히 나타나고, 우주선 뒤로 지나가면 금방 사라진다
    const fade = Math.max(0, Math.min(1, (D.VIEW - rel) / 18, 1 + rel / 3));
    if (fade <= 0) return;
    if (o.kind === 'meteor') drawMeteor(ctx, W, L, o, rel, fade, v);
    else if (o.kind === 'gate') drawGate(ctx, W, L, o, rel, fade, v);
    else if (o.kind === 'bar') drawBar(ctx, W, L, o, rel, fade, v);
    else if (o.kind === 'bomb') drawBomb(ctx, W, L, o, rel, fade, v);
    else if (o.kind === 'star') drawStar(ctx, W, L, o, rel, fade, v);
    else if (o.kind === 'item') drawItem(ctx, W, L, o, rel, fade, v);
  }

  // ─── 캐릭터 5종 (data.js CHARS) ───
  // 몸 좌표: 가운데가 (0,0), 앞(코)이 위(-1), 뒤(엔진)가 아래(+0.5), 옆 끝이 ±1 안팎. ctx는 이미 옮기고 늘려 둔 상태.
  // ph: 움직임 차례 (0 → 1, 꼬리 흔들기·불빛 돌기·날갯짓) · up: 점프 자세 (0 땅 · 1 뜸)
  const charOf = id => (D.CHARS && (D.CHARS.find(x => x.id === id) || D.CHARS[0])) ||
    { id: 'jet', shape: 'jet', body: ['#d9fbff', '#5ee7ff', '#1a9ec0'], accent: '#ff2e88', flame: '255,46,136', core: '#5ee7ff' };
  // 캐릭터마다: 엔진 불꽃 자리 · 움직임 빠르기(초당 차례) · 기울기 배율 · 기울 때 옆으로 줄어드는 정도
  const POSE = {
    jet:     { jets: [[-0.26, 0.42], [0.26, 0.42]], rate: 0,   tilt: 1,   squash: 0.5 },
    ufo:     { jets: [[0, 0.34]],                   rate: 1.6, tilt: 1.35, squash: 0.15 },
    whale:   { jets: [[0, 0.86]],                   rate: 0.8, tilt: 0.7, squash: 0.3 },
    fox:     { jets: [[-0.22, 0.46], [0.22, 0.46]], rate: 0.7, tilt: 1.2, squash: 0.5 },
    phoenix: { jets: [[0, 0.5]],                    rate: 1.3, tilt: 0.9, squash: 0.3 },
  };
  const poseOf = SK => POSE[SK.shape] || POSE.jet;
  const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  const mirror = half => half.concat(half.slice().reverse().map(([x, y]) => [-x, y]));
  const vgrad = (ctx, col, y0, y1) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, col[0]); g.addColorStop(0.45, col[1]); g.addColorStop(1, col[2]);
    return g;
  };
  const rim = ctx => { ctx.lineWidth = 0.04; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke(); };
  // 조종석: 어두운 알 + 앞쪽 빛 + 반사
  function cockpit(ctx, SK, x, y, rx, ry) {
    ctx.fillStyle = '#07080d';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SK.core;
    ctx.beginPath(); ctx.arc(x, y - ry * 0.45, rx * 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.35, y - ry * 0.2, rx * 0.25, ry * 0.38, 0, 0, TAU); ctx.fill();
  }
  function engines(ctx, SK, pts) {
    for (const [x, y] of pts) {
      ctx.fillStyle = '#0c2a3a'; ctx.fillRect(x - 0.1, y - 0.12, 0.2, 0.2);
      ctx.fillStyle = 'rgb(' + SK.flame + ')'; ctx.fillRect(x - 0.07, y + 0.02, 0.14, 0.06);
    }
  }

  // 1. 슝슝 제트: 뿅뿅 우주선 가족의 날개 제트
  function drawJet(ctx, SK) {
    const body = mirror([[0, -1.05], [0.3, -0.25], [1.02, 0.34], [0.95, 0.46], [0.3, 0.36], [0.18, 0.5]]);
    poly(ctx, body); ctx.fillStyle = vgrad(ctx, SK.body, -1, 0.5); ctx.fill(); rim(ctx);
    ctx.strokeStyle = SK.accent; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(0.42, 0.05); ctx.lineTo(0.9, 0.38); ctx.moveTo(-0.42, 0.05); ctx.lineTo(-0.9, 0.38); ctx.stroke();
    engines(ctx, SK, [[-0.26, 0.4], [0.26, 0.4]]);
    cockpit(ctx, SK, 0, -0.12, 0.2, 0.32);
    ctx.fillStyle = '#ffe66d';
    ctx.beginPath(); ctx.arc(1.0, 0.4, 0.05, 0, TAU); ctx.arc(-1.0, 0.4, 0.05, 0, TAU); ctx.fill();
  }

  // 2. 비행접시: 넓은 은빛 접시 + 연두 유리 지붕(조종사 그림자) + 테두리를 따라 도는 불빛
  function drawUfo(ctx, SK, ph, up) {
    // 아래 불빛 창
    ctx.fillStyle = '#1c2233';
    ctx.beginPath(); ctx.ellipse(0, 0.26, 0.62, 0.16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(' + SK.flame + ',' + (0.55 + up * 0.4).toFixed(2) + ')';
    ctx.beginPath(); ctx.ellipse(0, 0.28, 0.42, 0.09, 0, 0, TAU); ctx.fill();
    // 접시
    ctx.beginPath(); ctx.ellipse(0, 0.1, 1.1, 0.36, 0, 0, TAU);
    ctx.fillStyle = vgrad(ctx, SK.body, -0.26, 0.46); ctx.fill(); rim(ctx);
    ctx.strokeStyle = 'rgba(40,48,70,0.6)'; ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.ellipse(0, 0.1, 0.8, 0.22, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    // 유리 지붕
    const dg = ctx.createLinearGradient(0, -0.62, 0, 0.05);
    dg.addColorStop(0, 'rgba(230,255,200,0.95)'); dg.addColorStop(1, 'rgba(90,170,60,0.85)');
    ctx.beginPath(); ctx.ellipse(0, 0.02, 0.52, 0.62, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = dg; ctx.fill(); rim(ctx);
    // 조종사: 둥근 헬멧 그림자 + 더듬이 불빛 하나
    ctx.fillStyle = 'rgba(12,26,16,0.85)';
    ctx.beginPath(); ctx.arc(0, -0.14, 0.2, 0, TAU); ctx.fill();
    ctx.fillRect(-0.22, -0.02, 0.44, 0.06);
    ctx.strokeStyle = 'rgba(12,26,16,0.85)'; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(0.06, -0.32); ctx.lineTo(0.14, -0.44); ctx.stroke();
    ctx.fillStyle = SK.core; ctx.beginPath(); ctx.arc(0.14, -0.45, 0.045, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-0.28, -0.3, 0.07, 0.17, -0.5, 0, TAU); ctx.fill();
    // 테두리 불빛: 앞쪽 절반만, 차례마다 두 칸씩 돈다
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i + ph * 2) / N * TAU, sy = Math.sin(a);
      if (sy < -0.15) continue;
      const x = Math.cos(a) * 1.0, y = 0.14 + sy * 0.3;
      ctx.fillStyle = i % 2 ? '#ffe66d' : SK.accent;
      ctx.beginPath(); ctx.arc(x, y, 0.075, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 0.03, 0, TAU); ctx.fill();
    }
  }

  // 3. 우주 고래: 둥근 파란 몸, 등 숨구멍, 옆 지느러미, 좌우로 흔드는 꼬리
  function drawWhale(ctx, SK, ph, up) {
    const sw = Math.sin(ph * TAU) * 0.28;
    // 꼬리 (몸 뒤): 부드러운 두 갈래 꼬리지느러미
    ctx.save(); ctx.translate(0, 0.5); ctx.rotate(sw);
    ctx.beginPath();
    ctx.moveTo(-0.14, -0.12); ctx.lineTo(0.14, -0.12); ctx.lineTo(0.1, 0.14);
    ctx.bezierCurveTo(0.3, 0.06, 0.56, 0.02, 0.74, 0.12);
    ctx.bezierCurveTo(0.62, 0.3, 0.36, 0.4, 0.12, 0.34);
    ctx.quadraticCurveTo(0.03, 0.3, 0, 0.4);
    ctx.quadraticCurveTo(-0.03, 0.3, -0.12, 0.34);
    ctx.bezierCurveTo(-0.36, 0.4, -0.62, 0.3, -0.74, 0.12);
    ctx.bezierCurveTo(-0.56, 0.02, -0.3, 0.06, -0.1, 0.14);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, [SK.body[1], SK.body[2], '#1a2570'], -0.1, 0.4); ctx.fill(); rim(ctx);
    ctx.restore();
    // 옆 지느러미
    ctx.fillStyle = SK.body[2];
    for (const k of [-1, 1]) {
      ctx.save(); ctx.translate(k * 0.52, 0.12); ctx.rotate(k * (0.7 + Math.sin(ph * TAU + 1) * 0.12));
      ctx.beginPath(); ctx.ellipse(k * 0.2, 0, 0.3, 0.1, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // 몸
    ctx.beginPath();
    ctx.moveTo(0, -1.0);
    ctx.bezierCurveTo(0.5, -1.0, 0.7, -0.45, 0.62, -0.05);
    ctx.bezierCurveTo(0.56, 0.3, 0.3, 0.56, 0, 0.6);
    ctx.bezierCurveTo(-0.3, 0.56, -0.56, 0.3, -0.62, -0.05);
    ctx.bezierCurveTo(-0.7, -0.45, -0.5, -1.0, 0, -1.0);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, SK.body, -1, 0.6); ctx.fill(); rim(ctx);
    // 등 무늬: 가운데 등줄기 + 흩어진 물빛 점
    ctx.strokeStyle = 'rgba(191,248,255,0.55)'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(0, -0.62); ctx.quadraticCurveTo(0.03, 0.05, 0, 0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(223,247,255,0.85)';
    for (const [x, y, r] of [[-0.3, -0.62, 0.04], [0.28, -0.7, 0.035], [-0.44, -0.3, 0.045], [0.45, -0.34, 0.035], [-0.36, 0.12, 0.035], [0.4, 0.08, 0.045], [-0.2, 0.36, 0.03], [0.22, 0.4, 0.03]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    // 숨구멍 + 점프하면 물줄기
    ctx.fillStyle = '#1a2570';
    ctx.beginPath(); ctx.ellipse(0, -0.72, 0.08, 0.04, 0, 0, TAU); ctx.fill();
    if (up > 0) {
      ctx.fillStyle = 'rgba(191,248,255,0.9)';
      for (const [x, y, r] of [[0, -0.95, 0.07], [-0.14, -1.08, 0.05], [0.14, -1.08, 0.05], [-0.24, -1.0, 0.04], [0.24, -1.0, 0.04], [0, -1.18, 0.05]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    }
    // 조종석: 등에 얹은 가로로 긴 유리 덮개 (눈처럼 보이지 않게 넓고 납작하게)
    ctx.fillStyle = '#0b1a3a';
    ctx.beginPath(); ctx.ellipse(0, -0.28, 0.3, 0.13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(191,248,255,0.55)';
    ctx.beginPath(); ctx.ellipse(0, -0.31, 0.24, 0.07, 0, Math.PI, 0); ctx.fill();
    ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.ellipse(0, -0.28, 0.3, 0.13, 0, 0, TAU); ctx.stroke();
  }

  // 4. 번개 여우: 뾰족한 주황 여우 얼굴 기체, 쫑긋한 귀 날개, 흰 볼, 등에 번개 줄, 뒤로 흔드는 꼬리
  function drawFox(ctx, SK, ph, up) {
    const sw = Math.sin(ph * TAU) * 0.22;
    // 꼬리 (몸 뒤): 주황 붓 모양, 끝은 흰색
    ctx.save(); ctx.translate(0, 0.42); ctx.rotate(sw);
    ctx.beginPath(); ctx.moveTo(-0.1, 0); ctx.quadraticCurveTo(-0.36, 0.45, 0, 0.9); ctx.quadraticCurveTo(0.36, 0.45, 0.1, 0); ctx.closePath();
    ctx.fillStyle = SK.body[1]; ctx.fill(); rim(ctx);
    ctx.beginPath(); ctx.moveTo(-0.17, 0.62); ctx.quadraticCurveTo(0, 0.56, 0.17, 0.62); ctx.quadraticCurveTo(0.12, 0.8, 0, 0.9); ctx.quadraticCurveTo(-0.12, 0.8, -0.17, 0.62);
    ctx.fillStyle = '#fff4e6'; ctx.fill();
    ctx.restore();
    // 얼굴 몸
    const body = mirror([[0, -1.15], [0.22, -0.7], [0.52, -0.16], [0.86, 0.28], [0.6, 0.46], [0.22, 0.4], [0, 0.5]]);
    poly(ctx, body); ctx.fillStyle = vgrad(ctx, SK.body, -1.1, 0.5); ctx.fill(); rim(ctx);
    // 흰 볼 털
    ctx.fillStyle = '#fff4e6';
    for (const k of [-1, 1]) { poly(ctx, [[k * 0.5, -0.1], [k * 0.86, 0.28], [k * 0.6, 0.46], [k * 0.34, 0.26]]); ctx.fill(); }
    // 귀 날개: 뒤쪽에서 위로 쫑긋 (점프하면 더 세운다), 끝은 까맣게
    const tw = Math.sin(ph * TAU * 2) * 0.04, perk = up * 0.14;
    for (const k of [-1, 1]) {
      const tip = [k * (0.56 + tw * k), -0.78 - perk], a = [k * 0.14, 0.02], b = [k * 0.56, 0.06];
      poly(ctx, [a, tip, b]); ctx.fillStyle = SK.body[2]; ctx.fill(); rim(ctx);
      poly(ctx, [[k * 0.26, -0.02], [tip[0] * 0.95, tip[1] * 0.8], [k * 0.46, 0.0]]); ctx.fillStyle = '#ffb38a'; ctx.fill();
      const m = 0.3;
      poly(ctx, [tip, [tip[0] + (a[0] - tip[0]) * m, tip[1] + (a[1] - tip[1]) * m], [tip[0] + (b[0] - tip[0]) * m, tip[1] + (b[1] - tip[1]) * m]]);
      ctx.fillStyle = '#20140e'; ctx.fill();
    }
    // 등 번개 줄
    ctx.strokeStyle = SK.accent; ctx.lineWidth = 0.07; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0.02, -0.98); ctx.lineTo(-0.1, -0.62); ctx.lineTo(0.08, -0.56); ctx.lineTo(-0.05, -0.28); ctx.stroke();
    engines(ctx, SK, [[-0.22, 0.44], [0.22, 0.44]]);
    // 조종석: 여우 눈매처럼 가늘고 긴 창
    ctx.fillStyle = '#07080d';
    poly(ctx, [[0, -0.2], [0.26, 0.02], [0, 0.12], [-0.26, 0.02]]); ctx.fill();
    ctx.fillStyle = SK.core; ctx.beginPath(); ctx.arc(0, -0.04, 0.06, 0, TAU); ctx.fill();
  }

  // 5. 불사조: 불꽃 깃털 날개(날갯짓), 머리 볏, 긴 꼬리 깃털 세 개
  function drawPhoenix(ctx, SK, ph, up) {
    const fl = Math.sin(ph * TAU);
    // 꼬리 깃털 (몸 뒤)
    for (const [k, len] of [[-1, 1.05], [0, 1.25], [1, 1.05]]) {
      const bend = Math.sin(ph * TAU + k) * 0.08;
      const g = ctx.createLinearGradient(0, 0.2, 0, len);
      g.addColorStop(0, SK.body[1]); g.addColorStop(0.6, SK.accent); g.addColorStop(1, 'rgba(255,230,109,0.2)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(k * 0.06 - 0.07, 0.25);
      ctx.quadraticCurveTo(k * 0.34 + bend - 0.08, len * 0.7, k * 0.3 + bend, len);
      ctx.quadraticCurveTo(k * 0.34 + bend + 0.08, len * 0.7, k * 0.06 + 0.07, 0.25); ctx.closePath(); ctx.fill();
    }
    // 날개: 날갯짓 (점프하면 위로 활짝)
    const f = fl * 0.1 + up * 0.22;
    for (const k of [-1, 1]) {
      const W = [[0.16, -0.22], [0.5, -0.46 - f], [0.9, -0.62 - f * 1.5], [1.26, -0.56 - f * 1.8], [1.02, -0.36 - f * 1.3], [1.2, -0.24 - f * 1.3], [0.92, -0.1 - f], [1.06, 0.06 - f * 0.8], [0.72, 0.08 - f * 0.5], [0.8, 0.24 - f * 0.3], [0.44, 0.2], [0.16, 0.24]];
      const g = ctx.createLinearGradient(0, 0, k * 1.2, 0);
      g.addColorStop(0, SK.body[2]); g.addColorStop(0.45, SK.body[1]); g.addColorStop(1, SK.accent);
      poly(ctx, W.map(([x, y]) => [x * k, y])); ctx.fillStyle = g; ctx.fill(); rim(ctx);
      // 깃털 결
      ctx.strokeStyle = 'rgba(255,240,190,0.75)'; ctx.lineWidth = 0.035;
      ctx.beginPath();
      for (const [x, y] of [[0.9, -0.52 - f * 1.4], [0.95, -0.2 - f * 1.1], [0.7, 0.02 - f * 0.6]]) { ctx.moveTo(k * 0.28, 0); ctx.lineTo(k * x, y); }
      ctx.stroke();
    }
    // 몸
    ctx.beginPath(); ctx.ellipse(0, -0.12, 0.25, 0.56, 0, 0, TAU);
    ctx.fillStyle = vgrad(ctx, SK.body, -0.7, 0.45); ctx.fill(); rim(ctx);
    // 머리 + 불꽃 볏 (살랑)
    ctx.fillStyle = SK.body[1];
    ctx.beginPath(); ctx.arc(0, -0.72, 0.19, 0, TAU); ctx.fill(); rim(ctx);
    for (const [x, h, i] of [[-0.1, 0.24, 0], [0, 0.34, 1], [0.1, 0.24, 2]]) {
      const hh = h * (1 + Math.sin(ph * TAU * 2 + i * 2) * 0.15);
      ctx.fillStyle = i === 1 ? '#fff4c2' : SK.accent;
      poly(ctx, [[x - 0.06, -0.82], [x + x * 0.4, -0.82 - hh], [x + 0.06, -0.82]]); ctx.fill();
    }
    // 등의 보석 (조종석 빛)
    poly(ctx, [[0, -0.42], [0.1, -0.24], [0, -0.06], [-0.1, -0.24]]);
    ctx.fillStyle = '#fff4c2'; ctx.fill();
    poly(ctx, [[0, -0.36], [0.05, -0.24], [0, -0.12], [-0.05, -0.24]]);
    ctx.fillStyle = SK.accent; ctx.fill();
  }

  // 캐릭터 몸 하나 그리기 (미리 그리기·상점 그림 둘 다 이것을 쓴다)
  function drawCharBody(ctx, SK, ph, up) {
    ph = ph || 0; up = up || 0;
    if (SK.shape === 'ufo') drawUfo(ctx, SK, ph, up);
    else if (SK.shape === 'whale') drawWhale(ctx, SK, ph, up);
    else if (SK.shape === 'fox') drawFox(ctx, SK, ph, up);
    else if (SK.shape === 'phoenix') drawPhoenix(ctx, SK, ph, up);
    else drawJet(ctx, SK);
  }

  // 미리 그린 캐릭터 그림: (캐릭터, 움직임 차례 6칸, 점프 자세 2칸)마다 한 장. 크기가 바뀌거나 캐릭터를 바꾸면 비운다
  const SPR_BOX = 1.45, SPR_FRAMES = 6;
  const sprites = { key: '', map: {} };
  function charSprite(SK, frame, up, px) {
    const k0 = SK.id + '@' + Math.round(px);
    if (sprites.key !== k0) { sprites.key = k0; sprites.map = {}; }
    const k = frame + '|' + up;
    let c = sprites.map[k];
    if (!c) {
      const n = Math.ceil(SPR_BOX * 2 * px);
      c = sprites.map[k] = mk(n, n);
      const g = c.getContext('2d');
      g.translate(n / 2, n / 2); g.scale(px, px);
      drawCharBody(g, SK, frame / SPR_FRAMES, up);
    }
    return c;
  }

  // 상점·시작 화면의 작은 그림 (캔버스 하나에 캐릭터 하나, 불꽃까지)
  function paintChar(cv, id) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, SK = charOf(id), PO = poseOf(SK);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const s = Math.min(w, h) * 0.36, cx = w / 2, cy = h * 0.47;
    g.globalCompositeOperation = 'lighter';
    for (const [ex, ey] of PO.jets) glow(g, 'rgba(' + SK.flame + ',0.9)', cx + ex * s, cy + (ey + 0.2) * s, 0.3 * s, 1);
    if (SK.shape === 'phoenix') for (const k of [-1, 1]) glow(g, 'rgba(255,150,40,0.7)', cx + k * 1.1 * s, cy - 0.5 * s, 0.35 * s, 0.8);
    g.globalCompositeOperation = 'source-over';
    g.save(); g.translate(cx, cy); g.scale(s, s);
    drawCharBody(g, SK, 0.15, 0);
    g.restore();
  }

  // 캐릭터마다 뒤로 남는 자국 (미리 그린 빛 스프라이트로만): 고래 물빛 반짝이 · 여우 번개 불똥 · 불사조 날개 불꽃 · 비행접시 아래 빛
  function drawTrail(ctx, SK, q, s, t, boost, calm, a, up) {
    const k = boost ? 1.6 : 1;
    ctx.globalCompositeOperation = 'lighter';
    if (SK.shape === 'whale') {
      for (let i = 0; i < 6; i++) {
        const u = calm ? i / 6 : (t * 1.2 + i / 6) % 1;
        const x = q.x + Math.sin(i * 2.3 + t * 2) * s * 0.3 * (1 - u), y = q.y + s * (0.8 + u * 1.2);
        glow(ctx, 'rgba(191,248,255,0.9)', x, y, s * 0.13 * (1 - u) * k, a * (1 - u));
      }
    } else if (SK.shape === 'fox') {
      if (boost || !calm) for (let i = 0; i < 3; i++) {
        const u = calm ? i / 3 : (t * 2.2 + i / 3) % 1;
        glow(ctx, 'rgba(255,236,140,0.95)', q.x + (i - 1) * s * 0.35 * (1 - u * 0.5), q.y + s * (0.6 + u), s * 0.1 * k, a * (1 - u) * (boost ? 1 : 0.6));
      }
    } else if (SK.shape === 'phoenix') {
      const f = 0.1 * Math.sin(t * TAU * 1.3) + up * 0.22;
      for (const d of [-1, 1]) {
        glow(ctx, 'rgba(255,150,40,0.8)', q.x + d * 1.15 * s, q.y - (0.52 + f * 1.6) * s, s * 0.4 * k, a * 0.8);
        glow(ctx, 'rgba(255,230,109,0.8)', q.x + d * 0.9 * s, q.y + 0.1 * s, s * 0.25 * k, a * 0.6);
      }
    } else if (SK.shape === 'ufo') {
      glow(ctx, 'rgba(' + SK.flame + ',0.6)', q.x, q.y + s * (0.5 + up * 0.5), s * (0.55 + up * 0.35) * k, a * (0.5 + up * 0.4));
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ─── 우주선 (고른 캐릭터) ───
  function drawShip(ctx, W, L, v) {
    const p = W.p, a = W.phase === 'play' ? W.alpha : 1;
    const x = p.px + (p.x - p.px) * a, y = p.py + (p.y - p.py) * a;
    const dead = W.phase === 'over';
    const SK = charOf(W.char || W.skin), PO = poseOf(SK);
    // 바닥 그림자: 뛰면 작고 옅어진다
    const sh = proj(L, x, 0, 0), k = 1 / (1 + y * 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(sh.x, sh.y, sh.s * 0.9 * k, sh.s * 0.22 * k, 0, 0, TAU); ctx.fill();
    glow(ctx, W.eff.boost > 0 ? 'rgba(255,230,109,0.55)' : 'rgba(' + SK.flame + ',0.45)', sh.x, sh.y, sh.s * 1.1 * k, 0.8 * k);
    if (dead) return;
    // 깜빡임 (부딪힌 뒤 무적)
    if (W.inv > 0 && Math.floor(W.t * 12) % 2 === 0) ctx.globalAlpha = 0.3;
    // 미끄러지기: 바닥에 납작 붙는다 (자세는 부드럽게 바뀐다)
    R.sk += ((W.phase === 'play' && p.sl > 0 ? 1 : 0) - R.sk) * Math.min(1, (R.dt || 0.016) * 18);
    const sk = R.sk;
    const q = proj(L, x, 0, y + 0.45 - 0.3 * sk), s = q.s;
    if (sk > 0.5 && !v.calm && W.phase === 'play' && Math.random() < 0.6) burst(sh.x + (Math.random() - 0.5) * sh.s * 0.8, sh.y, 1, ['#d8b0ff', '#ffffff', SK.accent], sh.s * 3, sh.s * 0.06);
    // 기울기: 옆으로 움직이는 빠르기를 따라 부드럽게 (줄 바꾸기 곡선과 같이 기울었다 돌아온다). 캐릭터마다 기우는 정도가 다르다
    const vel = W.phase === 'play' ? (p.x - p.px) / D.TICK : 0;
    R.bank += (Math.max(-0.5, Math.min(0.5, vel * 0.05)) - R.bank) * Math.min(1, (R.dt || 0.016) * 20);
    let bank = R.bank * PO.tilt + (W.inv > 0 && W.hits && !v.calm ? Math.sin(W.t * 30) * 0.04 * Math.min(1, W.inv) : 0);
    if (SK.shape === 'ufo' && !v.calm) bank += Math.sin(W.t * 2.6) * 0.05;   // 비행접시는 살짝 흔들흔들
    const boost = W.eff.boost > 0;
    const alphaNow = ctx.globalAlpha;
    const up = y > 0.25 ? 1 : 0;
    // 엔진 불꽃 (화면 아래쪽 = 카메라 쪽으로)
    const fl = (boost ? 1.9 : 1) * (v.calm ? 1 : 0.85 + Math.random() * 0.3);
    ctx.globalCompositeOperation = 'lighter';
    for (const [ex, ey] of PO.jets) {
      const fx = q.x + ex * s, fy = q.y + ey * s;
      glow(ctx, boost ? 'rgba(255,230,109,0.9)' : 'rgba(' + SK.flame + ',0.85)', fx, fy + 0.18 * s * fl, 0.3 * s * fl, alphaNow);
      glow(ctx, 'rgba(255,244,194,0.9)', fx, fy + 0.08 * s, 0.14 * s, alphaNow);
    }
    ctx.globalCompositeOperation = 'source-over';
    drawTrail(ctx, SK, q, s, W.t, boost, v.calm, alphaNow, up);
    // 몸 밑 발광
    glow(ctx, boost ? 'rgba(255,230,109,0.6)' : 'rgba(' + SK.flame + ',0.35)', q.x, q.y, s * 1.25, 0.7 * alphaNow);
    // 몸: 미리 그린 그림을 찍는다 (움직임 차례는 부스트 때 더 빠르게)
    const rate = PO.rate * (boost ? 1.8 : 1);
    const frame = v.calm || !rate ? 0 : Math.floor(W.t * rate * SPR_FRAMES) % SPR_FRAMES;
    const px = Math.min(s * (v.dpr || 1), s * 1.25);
    const spr = charSprite(SK, frame, up, px);
    ctx.save();
    ctx.translate(q.x, q.y); ctx.rotate(bank); ctx.scale(s * (1 - Math.min(0.35, Math.abs(bank) * PO.squash)) * (1 + 0.15 * sk), s * (1 - 0.42 * sk));
    ctx.drawImage(spr, -SPR_BOX, -SPR_BOX, SPR_BOX * 2, SPR_BOX * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
    // 방패: 둥근 막
    if (W.shield) {
      const pulse = v.calm ? 1 : 1 + Math.sin(W.t * 4) * 0.04;
      glow(ctx, 'rgba(94,231,255,0.35)', q.x, q.y, s * 1.5 * pulse, 0.8);
      ctx.strokeStyle = 'rgba(191,248,255,0.85)'; ctx.lineWidth = Math.max(2, s * 0.04);
      ctx.beginPath(); ctx.ellipse(q.x, q.y - s * 0.1, s * 1.25 * pulse, s * 0.85 * pulse, 0, 0, TAU); ctx.stroke();
    }
    // 자석: 분홍 고리가 번져 나간다
    if (W.eff.magnet > 0) {
      const tt = v.calm ? 0.5 : (W.t * 1.5) % 1;
      ctx.globalAlpha = (1 - tt) * 0.7 * Math.min(1, W.eff.magnet);
      ctx.strokeStyle = '#ff5fa8'; ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath(); ctx.ellipse(q.x, q.y, s * (1 + tt * 1.4), s * (0.5 + tt * 0.7), 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ─── 위험 · 점프 · 숙여 안내: 지금 줄 바로 앞 장애물 위에 말풍선 ───
  // 운석 "위험!"(빨강) · 바닥 레이저 문 "점프!"(노랑, 위 화살표) · 위쪽 막대 "숙여!"(보라, 아래 화살표)
  const BUBBLE = {
    meteor: { txt: '위험!', bg: 'rgba(40,4,10,0.9)', edge: '#ff3b4e', ink: '#ffd0d5', arrow: 0 },
    gate:   { txt: '점프!', bg: 'rgba(40,30,4,0.9)', edge: '#ffe66d', ink: '#fff4c2', arrow: -1 },
    bar:    { txt: '숙여!', bg: 'rgba(26,8,44,0.92)', edge: '#c98cff', ink: '#f0dcff', arrow: 1 },
  };
  BUBBLE.bomb = BUBBLE.gate;
  function drawDanger(ctx, W, L, dist, v) {
    if (W.phase !== 'play' || W.wait > 0 || W.eff.boost > 0) return;
    const d = RN.World.dangerAhead(W, 1.3);
    if (!d || d.t < 0.12) return;
    const o = d.o, rel = o.z - dist, B = BUBBLE[o.kind] || BUBBLE.meteor;
    const lx = o.moving && o.x !== o.to ? W.p.lane : o.x;
    const hgt = o.kind === 'gate' || o.kind === 'bomb' ? D.OBST.gateH + 0.9 : o.kind === 'bar' ? D.OBST.barHi + 0.75 : D.OBST.meteorR * 2 + 0.5;
    const q = proj(L, lx, rel, hgt);
    const fs = Math.round(Math.max(16, Math.min(28, q.s * 0.5 + 8)));
    const blink = v.calm ? 1 : 0.7 + Math.sin(W.t * (d.t < 0.6 ? 22 : 12)) * 0.3;
    ctx.globalAlpha = blink;
    ctx.font = fs + 'px ' + DISP;
    const aw = B.arrow ? fs * 0.9 : 0;
    const tw = ctx.measureText(B.txt).width + fs * 1.1 + aw, th = fs * 1.5;
    ctx.fillStyle = B.bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(q.x - tw / 2, q.y - th, tw, th, fs * 0.4); else ctx.rect(q.x - tw / 2, q.y - th, tw, th);
    ctx.fill();
    ctx.strokeStyle = B.edge; ctx.lineWidth = 2; ctx.stroke();
    // 꼬리
    ctx.beginPath(); ctx.moveTo(q.x - fs * 0.3, q.y); ctx.lineTo(q.x, q.y + fs * 0.4); ctx.lineTo(q.x + fs * 0.3, q.y); ctx.closePath();
    ctx.fillStyle = B.edge; ctx.fill();
    const cy = q.y - th / 2;
    // 화살표: 점프는 위, 숙여는 아래
    if (B.arrow) {
      const ax = q.x - tw / 2 + fs * 0.55 + aw * 0.35, a = fs * 0.36, dir = B.arrow;
      ctx.beginPath(); ctx.moveTo(ax - a, cy - dir * a * 0.45); ctx.lineTo(ax + a, cy - dir * a * 0.45); ctx.lineTo(ax, cy + dir * a * 0.75); ctx.closePath();
      ctx.fillStyle = B.edge; ctx.fill();
    }
    ctx.fillStyle = B.ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(B.txt, q.x + aw / 2, cy + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  // ─── 블랙홀이 끌어당기려 할 때: 우주선 옆에 블랙홀 쪽 꺾쇠 + 위에 "반대로 밀어요!" (움직임 줄이기면 꺾쇠가 가만히) ───
  function drawPull(ctx, W, L, v) {
    const P0 = W.pull;
    if (!P0 || P0.done || W.phase !== 'play') return;
    const p = W.p, k = 1 - Math.max(0, P0.t) / P0.max, dir = P0.dir;
    const q = proj(L, p.x, 0, 0.7), s = q.s, t = performance.now() / 1000;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 블랙홀 쪽으로 흘러가는 꺾쇠 셋
    for (let i = 0; i < 3; i++) {
      const u = v.calm ? i / 3 : ((t * 1.6 + i / 3) % 1);
      const x = q.x + dir * s * (0.9 + u * 1.3), a = s * 0.3;
      ctx.globalAlpha = (0.35 + 0.65 * k) * (v.calm ? 0.9 : 1 - u * 0.6);
      ctx.strokeStyle = '#d8b0ff'; ctx.lineWidth = Math.max(3, s * 0.1);
      ctx.beginPath(); ctx.moveTo(x - dir * a, q.y - a); ctx.lineTo(x, q.y); ctx.lineTo(x - dir * a, q.y + a); ctx.stroke();
    }
    // 위쪽 말: 반대로 밀어요 + 반대쪽 화살표
    const fs = Math.round(Math.max(16, Math.min(26, v.w / 44)));
    ctx.font = fs + 'px ' + DISP;
    const txt = v.touch ? '반대로 밀어서 버텨요' : (dir < 0 ? '→' : '←') + ' 키로 버텨요';
    const tw = ctx.measureText(txt).width + fs * 2.4, th = fs * 1.6, ty = q.y - s * 1.9;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(20,6,36,0.88)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(q.x - tw / 2, ty - th / 2, tw, th, fs * 0.5); else ctx.rect(q.x - tw / 2, ty - th / 2, tw, th); ctx.fill();
    ctx.strokeStyle = '#d8b0ff'; ctx.lineWidth = 2; ctx.stroke();
    // 게이지: 남은 시간
    ctx.fillStyle = 'rgba(216,176,255,0.35)'; ctx.fillRect(q.x - tw / 2 + 6, ty + th / 2 - 5, (tw - 12) * (1 - k), 3);
    const ax = q.x - dir * (tw / 2 - fs * 0.8), a = fs * 0.35;
    ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = Math.max(3, fs * 0.16);
    ctx.beginPath(); ctx.moveTo(ax + dir * a, ty - a); ctx.lineTo(ax, ty); ctx.lineTo(ax + dir * a, ty + a); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, q.x + dir * fs * 0.45, ty + 1);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  // ─── 밀기 표시: 손가락으로 민(누른) 자리에 그 방향 화살표가 잠깐 떴다 사라진다 (알아들었다는 표시) ───
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const SWIPE_TIME = 380;
  function drawSwipe(ctx, W, v) {
    const I = v.pad, sw = I && I.swipe;
    if (!sw || W.phase === 'over') return;
    const age = performance.now() - sw.t;
    if (age > SWIPE_TIME) { I.swipe = null; return; }
    const k = age / SWIPE_TIME, d = DIRS[sw.dir] || DIRS.up;
    const r = Math.max(24, Math.min(40, Math.min(v.w, v.h) * 0.045)), push = v.calm ? 0 : k * r * 0.8;
    const x = sw.x + d[0] * push, y = sw.y + d[1] * push;
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.fillStyle = 'rgba(12,22,38,0.5)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = Math.max(3, r * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const off of [-0.22, 0.2]) {
      const cx = x + d[0] * r * off, cy = y + d[1] * r * off, a = r * 0.38;
      ctx.beginPath();
      ctx.moveTo(cx - d[0] * a + d[1] * a, cy - d[1] * a + d[0] * a);
      ctx.lineTo(cx + d[0] * a * 0.2, cy + d[1] * a * 0.2);
      ctx.lineTo(cx - d[0] * a - d[1] * a, cy - d[1] * a - d[0] * a);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  // ─── HUD: 위쪽 한 줄. 오른쪽 끝에 거리, 그 왼쪽에 작은 칸들 ─────
  // icon: 칸 왼쪽의 작은 그림 ('star' 'heart' 'shield' 'magnet' 'boost'), hearts: [찬 수, 전체]
  function chipW(ctx, h, txt, s, icon, hearts) {
    const ir = h * 0.3;
    return (txt ? ctx.measureText(txt).width : 0) + 16 * s + (icon ? ir * 2 + 5 * s : 0) + (hearts ? hearts[1] * (ir * 2.2 + 3 * s) : 0) - (txt ? 0 : 5 * s);
  }
  function chip(ctx, x, y, h, txt, color, s, icon, hearts) {
    const ir = h * 0.3, w = chipW(ctx, h, txt, s, icon, hearts);
    ctx.fillStyle = 'rgba(12,16,26,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w, y, w, h, 6 * s); else ctx.rect(x - w, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94,231,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();
    let ix = x - w + 8 * s + ir;
    if (icon) { itemIcon(ctx, icon, ix, y + h / 2, ir, color); ix += ir * 2 + 5 * s; }
    if (hearts) for (let i = 0; i < hearts[1]; i++) { itemIcon(ctx, i < hearts[0] ? 'heart' : 'heart0', ix, y + h / 2 + 1, ir, i < hearts[0] ? '#ff4d6d' : 'rgba(255,77,109,0.5)'); ix += ir * 2.2 + 3 * s; }
    if (txt) { ctx.fillStyle = color; ctx.fillText(txt, x - 8 * s, y + h / 2 + 1); }
    return w;
  }

  function drawHud(ctx, W, v) {
    const s = v.ui, mid = v.hudMid, right = v.w - v.hudRight;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillStyle = '#e8f7ff';
    ctx.font = '700 ' + Math.round(30 * s) + 'px ' + NUM;
    const dm = Math.floor(W.dist).toLocaleString() + 'm';
    ctx.fillText(dm, right, mid + 2 * s);
    let x = right - ctx.measureText(dm).width - 12 * s;
    ctx.font = '700 ' + Math.round(15 * s) + 'px ' + NUM;
    const ch = 24 * s;
    let cy = mid - ch / 2;
    // 좁은 화면(세로 폰): 칸들은 거리 아래 둘째 줄에
    const narrow = v.w < 600;
    if (narrow) { x = right; cy = mid + 22 * s; }
    const items = [];
    if (W.maxHearts > 1) items.push(['', '#ff4d6d', null, [W.hearts, W.maxHearts]]);
    items.push([String(W.stars), '#ffe66d', 'star']);
    if (W.shield) items.push(['', '#5ee7ff', 'shield']);
    if (W.eff.magnet > 0) items.push([String(Math.ceil(W.eff.magnet)), ITEM.magnet.color, 'magnet']);
    if (W.eff.boost > 0) items.push([String(Math.ceil(W.eff.boost)), ITEM.boost.color, 'boost']);
    if (W.revives > W.revived) items.push(['부활', '#ffd24a']);   // 불사조: 아직 다시 살아날 수 있다
    if (W.pir) items.push(['해적 ' + Math.max(0, Math.ceil(W.pir.t)), '#ff9a3d']);   // 해적선이 물러갈 때까지 남은 초
    if (v.w >= 700 && v.best > 0) items.push(['BEST ' + Math.max(v.best || 0, Math.floor(W.dist)).toLocaleString() + 'm', '#bcd3e2']);
    for (const [txt, col, icon, hearts] of items) {
      if (x - chipW(ctx, ch, txt, s, icon, hearts) < (narrow ? 8 : v.hudLeft)) continue;   // 버튼 묶음과 겹치면 생략
      x -= chip(ctx, x, cy, ch, txt, col, s, icon, hearts) + 6 * s;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 출발 대기(READY)·출발!·처음 몇 초 조작 안내
  function drawIntro(ctx, W, v, L) {
    const cx = v.w / 2, cy = L.hy + (L.py - L.hy) * 0.3;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.round(Math.min(72, v.w / 9));
    if (W.wait > 0 || (W.runT < 0.6 && W.phase === 'play')) {
      const go = W.wait <= 0, k = go ? 1 - W.runT / 0.6 : 1;
      ctx.globalAlpha = k;
      glow(ctx, go ? 'rgba(255,230,109,0.45)' : 'rgba(94,231,255,0.4)', cx, cy, fs * 1.8, 0.9);
      ctx.font = go ? fs + 'px ' + DISP : 'italic 700 ' + fs + 'px ' + NUM;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(5,7,12,0.8)';
      const t = go ? '출발!' : 'READY';
      ctx.strokeText(t, cx, cy);
      ctx.fillStyle = go ? '#ffe66d' : '#e8f7ff'; ctx.fillText(t, cx, cy);
      ctx.globalAlpha = 1;
    }
    if (W.tut && W.tut.step !== 'done') { drawTutorial(ctx, W, v, L); ctx.textBaseline = 'alphabetic'; return; }
    const hintA = W.laneMoves === 0 && W.phase === 'play' ? Math.max(0, Math.min(1, D.HINT_TIME - W.runT)) : 0;
    if (hintA > 0) {
      ctx.globalAlpha = hintA * 0.9;
      const hs = Math.round(Math.max(16, Math.min(26, v.w / 40)));
      ctx.font = hs + 'px ' + DISP;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,7,12,0.85)';
      const lines = v.touch ? ['옆으로 밀거나 양옆을 눌러서 줄 바꾸기', '위로 밀면 점프! 아래로 밀면 미끄러지기!'] : ['← → 방향키로 줄 바꾸기', '↑ 점프! ↓ 미끄러지기!'];
      lines.forEach((t, i) => {
        const yy = cy + fs * 0.85 + i * hs * 1.4;
        ctx.strokeText(t, cx, yy);
        ctx.fillStyle = i ? '#ffe66d' : '#bff8ff'; ctx.fillText(t, cx, yy);
      });
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 처음 한 번 나오는 안내: 큰 글자 + 손가락 방향 화살표 (움직임 줄이기면 화살표가 가만히 있다)
  function drawTutorial(ctx, W, v, L) {
    const T = W.tut, what = T.show;
    if (!what || W.phase !== 'play') return;
    // 하늘 쪽에 띄운다 (다가오는 운석·문을 가리지 않게)
    const fs = Math.round(Math.max(20, Math.min(42, v.w / 24, L.hy / 5.2)));
    const cx = v.w / 2, cy = Math.max(v.hudMid + 24 + fs * 1.95, L.hy - fs * 2.3);
    const t = performance.now() / 1000, bob = v.calm ? 0 : Math.sin(t * 5);
    const lane = what === 'lane', down = what === 'slide';
    const txt = lane ? (v.touch ? '옆으로 밀어서 줄 바꾸기' : '← → 키로 줄 바꾸기')
      : down ? (v.touch ? '아래로 밀어서 미끄러지기!' : '↓ 키로 미끄러지기!')
      : (v.touch ? '위로 밀어서 점프!' : '↑ 키나 스페이스로 점프!');
    const sub = lane ? '빨간 운석은 피해요' : down ? '보라 막대 밑으로 쏙' : '바닥 레이저 문을 넘어요';
    ctx.font = fs + 'px ' + DISP;
    const tw = Math.max(ctx.measureText(txt).width, fs * 6) + fs * 1.6, th = fs * 3.9;
    const x0 = cx - tw / 2, y0 = cy - th / 2;
    ctx.fillStyle = 'rgba(8,12,24,0.8)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, tw, th, fs * 0.5); else ctx.rect(x0, y0, tw, th); ctx.fill();
    ctx.strokeStyle = lane ? 'rgba(94,231,255,0.8)' : down ? 'rgba(216,176,255,0.9)' : 'rgba(255,230,109,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    // 화살표 그림
    const ay = y0 + fs * 1.1, col = lane ? '#5ee7ff' : down ? '#d8b0ff' : '#ffe66d';
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(3, fs * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const chev = (x, y, dx, dy, a) => { ctx.beginPath(); ctx.moveTo(x - dx * a + dy * a, y - dy * a + dx * a); ctx.lineTo(x, y); ctx.lineTo(x - dx * a - dy * a, y - dy * a - dx * a); ctx.stroke(); };
    if (lane) {
      const off = fs * (1.3 + bob * 0.25);
      chev(cx - off, ay, -1, 0, fs * 0.35); chev(cx + off, ay, 1, 0, fs * 0.35);
      ctx.beginPath(); ctx.arc(cx, ay, fs * 0.3, 0, TAU); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    } else if (down) {
      const dn = fs * (0.15 + bob * 0.15);
      chev(cx, ay + dn + fs * 0.2, 0, 1, fs * 0.35); chev(cx, ay + dn - fs * 0.25, 0, 1, fs * 0.35);
    } else {
      const up = fs * (0.15 + bob * 0.15);
      chev(cx, ay - up - fs * 0.2, 0, -1, fs * 0.35); chev(cx, ay - up + fs * 0.25, 0, -1, fs * 0.35);
    }
    ctx.lineCap = 'butt';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, cx, y0 + fs * 2.3);
    ctx.font = Math.round(Math.max(15, fs * 0.55)) + 'px ' + DISP;
    ctx.fillStyle = lane ? '#bff8ff' : down ? '#f0dcff' : '#fff4c2'; ctx.fillText(sub, cx, y0 + fs * 3.25);
  }

  // 구역 도착·기념 아치: 가운데 위쪽에 큰 글자가 잠깐 (움직임 줄이기면 커지는 연출 없이)
  function drawBanner(ctx, v, L) {
    const b = R.banner;
    if (!b) return;
    const k = b.t / b.max, a = Math.min(1, b.t / 0.2, (b.max - b.t) / 0.5);
    const pop = v.calm ? 1 : 1 + Math.max(0, 0.25 - b.t) * 1.2;
    const fs = Math.round(Math.max(26, Math.min(b.small ? 52 : 64, v.w / (b.small ? 16 : 13))) * pop);
    const cx = v.w / 2, cy = L.hy * (b.small ? 0.62 : 0.55) - (v.calm ? 0 : k * 10);
    ctx.globalAlpha = Math.max(0, a);
    glow(ctx, b.color, cx, cy, fs * 3, 0.25);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = (b.small && !b.disp ? 'italic 700 ' + fs + 'px ' + NUM : fs + 'px ' + DISP);
    ctx.lineWidth = Math.max(4, fs * 0.12); ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.strokeText(b.big, cx, cy);
    ctx.fillStyle = b.color; ctx.fillText(b.big, cx, cy);
    if (b.sub) {
      ctx.font = Math.round(Math.max(16, fs * 0.45)) + 'px ' + DISP;
      ctx.lineWidth = 4; ctx.strokeText(b.sub, cx, cy + fs * 0.75);
      ctx.fillStyle = '#ffffff'; ctx.fillText(b.sub, cx, cy + fs * 0.75);
    }
    if (b.sub2) {
      ctx.font = 'italic 700 ' + Math.round(Math.max(15, fs * 0.4)) + 'px ' + NUM;
      ctx.lineWidth = 4; ctx.strokeText(b.sub2, cx, cy + fs * 1.3);
      ctx.fillStyle = b.color; ctx.fillText(b.sub2, cx, cy + fs * 1.3);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  // view: {dpr, w, h, ui, hudMid, hudLeft, hudRight, hud, touch, calm, best, pad}
  function draw(ctx, W, v, dt) {
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const L = R.L && R.L.w === v.w && R.L.h === v.h ? R.L : (R.L = layout(v.w, v.h));
    const dist = W.phase === 'play' ? W.pdist + (W.dist - W.pdist) * W.alpha : W.dist;
    R.dt = dt || 0;
    takeFx(W, v, L, dist);
    updateFx(dt || 0);
    drawBackground(ctx, W, v, L, dist, dt || 0);
    drawPirate(ctx, W, L, v, dt || 0);
    ctx.save();
    if (R.shake > 0) ctx.translate((Math.random() - 0.5) * R.shake, (Math.random() - 0.5) * R.shake);
    // 먼 것부터 그리고, 우주선보다 뒤(카메라 쪽)로 지나간 것은 우주선 다음에
    const list = W.obs.filter(o => !o.done).sort((a, b) => b.z - a.z);
    let i = 0;
    for (; i < list.length && list[i].z - dist > 0.3; i++) drawObject(ctx, W, L, list[i], dist, v);
    drawShip(ctx, W, L, v);
    for (; i < list.length; i++) drawObject(ctx, W, L, list[i], dist, v);
    if (v.hud !== false) { drawDanger(ctx, W, L, dist, v); drawPull(ctx, W, L, v); }
    drawFx(ctx);
    ctx.restore();
    if (R.flash > 0 && !v.calm) {
      ctx.fillStyle = 'rgba(' + R.flashColor + ',' + (R.flash * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
    // 부스트: 화면 가장자리가 노랗게
    if (W.eff.boost > 0) { ctx.fillStyle = 'rgba(255,230,109,' + (0.05 + Math.min(1, W.eff.boost) * 0.04).toFixed(3) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    if (v.hud !== false) { if (W.phase === 'play') drawBanner(ctx, v, L); drawHud(ctx, W, v); drawIntro(ctx, W, v, L); drawSwipe(ctx, W, v); }
  }

  // 멈춘 화면처럼 입자가 남아 있는지 (다 사라지면 그리기를 쉰다)
  const busy = () => R.parts.length > 0 || R.shake > 0 || R.flash > 0;

  RN.Render = { draw, layout, busy, proj, paintChar, paintSkin: paintChar, drawCharBody, charOf };
})(RN);
