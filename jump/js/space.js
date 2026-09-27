'use strict';
// 태양계 여행 그림 (2026-09-27, 외계 행성 여덟 추가, 소유자: "다른 게임도 우주배경 반영").
// 뿅뿅 우주선(game/js/render.js)의 행성·블랙홀 그림을 그대로 옮겨 왔다: 수성 · 금성 · 지구(달) · 화성 · 목성(대적점) ·
// 토성(고리) · 천왕성(누운 고리) · 해왕성(검은 폭풍) · 명왕성(하트), 블랙홀(강착 원반 + 소용돌이).
// 모두 한 번만 캔버스에 그려 두고(크기·화질별) render.js가 찍기만 한다 (매 프레임 shadowBlur 없음).
// 순서: 높이는 data.js PLANETS · BLACKHOLE, 규칙은 world.js planetAt · holeAt.
(function (JP) {
  const TAU = Math.PI * 2;
  const sprites = {};

  // 공 모양: 바탕 → 무늬(draw) → 해 반대쪽 그림자 → 광택 → 가장자리 대기 빛. 빛은 왼쪽 위(해)에서 온다
  function sphere(g, R, c1, c2, atm, draw) {
    g.save();
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    const base = g.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.05, 0, 0, R * 1.05);
    base.addColorStop(0, c1); base.addColorStop(1, c2);
    g.fillStyle = base; g.fillRect(-R, -R, R * 2, R * 2);
    if (draw) draw(g, R);
    const sh = g.createRadialGradient(-R * 0.5, -R * 0.5, R * 0.15, -R * 0.15, -R * 0.15, R * 1.45);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(0.5, 'rgba(0,0,0,0.12)');
    sh.addColorStop(0.8, 'rgba(0,0,0,0.55)');
    sh.addColorStop(1, 'rgba(0,0,0,0.88)');
    g.fillStyle = sh; g.fillRect(-R, -R, R * 2, R * 2);
    const gl = g.createRadialGradient(-R * 0.42, -R * 0.46, 0, -R * 0.42, -R * 0.46, R * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,0.28)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    if (atm) {
      g.globalCompositeOperation = 'lighter';
      const rim = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.14);
      rim.addColorStop(0, 'rgba(' + atm + ',0)');
      rim.addColorStop(0.45, 'rgba(' + atm + ',0.4)');
      rim.addColorStop(1, 'rgba(' + atm + ',0)');
      g.fillStyle = rim;
      g.beginPath(); g.arc(0, 0, R * 1.14, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
  }
  // 둘레의 은은한 빛 (네온 느낌)
  function halo(g, R, atm, k) {
    const h = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * k);
    h.addColorStop(0, 'rgba(' + atm + ',0.22)');
    h.addColorStop(1, 'rgba(' + atm + ',0)');
    g.fillStyle = h;
    g.beginPath(); g.arc(0, 0, R * k, 0, TAU); g.fill();
  }
  function blob(g, x, y, r, rand, pts) {
    g.beginPath();
    const n = pts || 9;
    for (let i = 0; i <= n; i++) {
      const a = TAU * i / n, rr = r * (0.65 + rand() * 0.55);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
      if (i === 0) g.moveTo(px, py); else g.quadraticCurveTo(x + Math.cos(a - 0.35) * rr * 1.15, y + Math.sin(a - 0.35) * rr * 0.9, px, py);
    }
    g.closePath();
  }
  // 가로 띠 (목성·토성·해왕성): y 위치에 물결진 띠를 칠한다
  function bands(g, R, list, rand, wave) {
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const y0 = -R + (2 * R) * i / n, hgt = 2 * R / n;
      g.fillStyle = list[i];
      g.beginPath();
      g.moveTo(-R, y0);
      for (let x = -R; x <= R; x += R / 8) g.lineTo(x, y0 + Math.sin(x / R * 6 + i * 1.7) * hgt * wave * (0.5 + rand() * 0.5));
      g.lineTo(R, y0 + hgt * 1.3);
      for (let x = R; x >= -R; x -= R / 8) g.lineTo(x, y0 + hgt * 1.3 + Math.sin(x / R * 5 + i) * hgt * wave * 0.5);
      g.closePath();
      g.fill();
    }
  }
  // 고리 (토성·천왕성): 반쪽씩 그려 행성 앞뒤로 겹친다. front면 앞쪽(아래 반)만
  function rings(g, R, tilt, flat, list, front) {
    g.save();
    g.rotate(tilt);
    g.scale(1, flat);
    if (front) { g.beginPath(); g.rect(-R * 3, 0, R * 6, R * 3 / flat); g.clip(); }
    for (const [r0, r1, col] of list) {
      g.beginPath();
      g.arc(0, 0, R * r1, 0, TAU);
      g.arc(0, 0, R * r0, 0, TAU, true);
      g.fillStyle = col;
      g.fill();
    }
    g.restore();
  }

  const PLANET_K = { mercury: 1.3, venus: 1.35, earth: 1.3, mars: 1.3, jupiter: 1.14, saturn: 2.35, uranus: 1.95, neptune: 1.3, pluto: 1.4,
    frost: 1.32, lava: 1.34, ocean: 1.3, glass: 1.3, gem: 1.36, twin: 1.3, shroom: 1.32, rogue: 1.4 };
  // 행성마다 그림. R: 반지름(px). 돌려주는 k: 그림 캔버스가 반지름의 몇 배 넓이인지(고리·빛 포함, PLANET_K와 같게)
  const PAINT = {
    mercury(g, R, rand) {
      halo(g, R, '255,230,200', 1.25);
      sphere(g, R, '#b9b2a8', '#3e3a36', '255,235,210', (g, R) => {
        for (let i = 0; i < 46; i++) {
          const a = rand() * TAU, d = Math.sqrt(rand()) * R * 0.95, cr = R * (0.03 + Math.pow(rand(), 3) * 0.16);
          const x = Math.cos(a) * d, y = Math.sin(a) * d;
          g.fillStyle = 'rgba(40,36,32,0.45)'; g.beginPath(); g.arc(x, y, cr, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(235,228,215,0.35)'; g.lineWidth = Math.max(1, cr * 0.18);
          g.beginPath(); g.arc(x - cr * 0.12, y - cr * 0.12, cr, Math.PI * 0.9, Math.PI * 1.7); g.stroke();
        }
      });
      return 1.3;
    },
    venus(g, R, rand) {
      halo(g, R, '255,210,120', 1.3);
      sphere(g, R, '#fbe3a0', '#9a6a22', '255,225,150', (g, R) => {
        g.lineCap = 'round';
        for (let i = 0; i < 26; i++) {
          const y = -R + rand() * 2 * R, amp = R * (0.05 + rand() * 0.12);
          g.strokeStyle = i % 3 ? 'rgba(255,240,200,0.35)' : 'rgba(190,120,40,0.35)';
          g.lineWidth = R * (0.04 + rand() * 0.08);
          g.beginPath();
          for (let x = -R; x <= R; x += R / 10) { const yy = y + Math.sin(x / R * 3 + i) * amp + x * 0.25; if (x === -R) g.moveTo(x, yy); else g.lineTo(x, yy); }
          g.stroke();
        }
        // 빙글빙글 소용돌이 구름 두어 개
        for (let k = 0; k < 2; k++) {
          const cx = (rand() - 0.6) * R * 0.8, cy = (rand() - 0.5) * R;
          g.strokeStyle = 'rgba(255,245,215,0.35)'; g.lineWidth = R * 0.035;
          g.beginPath();
          for (let t = 0; t < 14; t += 0.2) { const rr = R * 0.02 * t; const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr * 0.7; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
          g.stroke();
        }
      });
      return 1.35;
    },
    earth(g, R, rand) {
      halo(g, R, '110,180,255', 1.3);
      sphere(g, R, '#3d9bff', '#082a66', '120,195,255', (g, R) => {
        // 대륙: 초록·갈색 덩어리
        const lands = [[-0.35, -0.2, 0.42], [0.25, 0.25, 0.36], [-0.1, 0.55, 0.22], [0.45, -0.45, 0.25], [-0.6, 0.35, 0.2]];
        for (const [x, y, r] of lands) {
          g.fillStyle = '#3f9e4d'; blob(g, x * R, y * R, r * R, rand, 11); g.fill();
          g.fillStyle = 'rgba(150,115,60,0.75)'; blob(g, x * R + r * R * 0.2, y * R + r * R * 0.1, r * R * 0.5, rand, 8); g.fill();
        }
        // 극지방 얼음
        g.fillStyle = 'rgba(245,250,255,0.9)';
        g.beginPath(); g.ellipse(0, -R * 0.98, R * 0.55, R * 0.16, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(0, R * 0.98, R * 0.5, R * 0.14, 0, 0, TAU); g.fill();
        // 흰 구름 줄기
        g.lineCap = 'round';
        for (let i = 0; i < 16; i++) {
          const x = (rand() - 0.5) * 2 * R, y = (rand() - 0.5) * 1.8 * R, l = R * (0.2 + rand() * 0.45);
          g.strokeStyle = 'rgba(255,255,255,' + (0.45 + rand() * 0.35) + ')';
          g.lineWidth = R * (0.025 + rand() * 0.05);
          g.beginPath(); g.moveTo(x - l / 2, y); g.quadraticCurveTo(x, y - R * 0.08 * (rand() - 0.5) * 2, x + l / 2, y + R * 0.05); g.stroke();
        }
      });
      return 1.3;
    },
    mars(g, R, rand) {
      halo(g, R, '255,130,90', 1.28);
      sphere(g, R, '#f08050', '#5e1d0c', '255,160,120', (g, R) => {
        for (let i = 0; i < 9; i++) {
          g.fillStyle = 'rgba(110,40,22,' + (0.35 + rand() * 0.3) + ')';
          blob(g, (rand() - 0.5) * 1.7 * R, (rand() - 0.4) * 1.3 * R, R * (0.12 + rand() * 0.22), rand, 9); g.fill();
        }
        // 큰 협곡
        g.strokeStyle = 'rgba(80,25,12,0.6)'; g.lineWidth = R * 0.035; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-R * 0.6, R * 0.05); g.quadraticCurveTo(-R * 0.1, R * 0.15, R * 0.35, R * 0.02); g.stroke();
        // 북극 얼음
        g.fillStyle = 'rgba(255,248,240,0.92)';
        g.beginPath(); g.ellipse(-R * 0.05, -R * 0.95, R * 0.34, R * 0.13, -0.1, 0, TAU); g.fill();
      });
      return 1.3;
    },
    jupiter(g, R, rand) {
      halo(g, R, '255,200,150', 1.12);
      sphere(g, R, '#f5e3c8', '#6e4428', '255,215,175', (g, R) => {
        bands(g, R, ['#e9d6ba', '#c48b5c', '#f2e4cf', '#b8784c', '#ead2b0', '#a8683f', '#f4e6d2', '#c69264', '#e2c39e', '#9c5e3a', '#eedcc2', '#c08a5e', '#e6cfae', '#ad7148'], rand, 0.35);
        // 대적점 (커다란 빨간 점): 화면에 보이는 왼쪽 아래
        const sx = -R * 0.5, sy = R * 0.3;
        g.fillStyle = '#b8452a';
        g.beginPath(); g.ellipse(sx, sy, R * 0.2, R * 0.11, -0.08, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,220,190,0.6)'; g.lineWidth = R * 0.02;
        g.beginPath(); g.ellipse(sx, sy, R * 0.24, R * 0.14, -0.08, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(230,120,80,0.7)';
        g.beginPath(); g.ellipse(sx - R * 0.03, sy - R * 0.02, R * 0.1, R * 0.05, -0.08, 0, TAU); g.fill();
      });
      return 1.14;
    },
    saturn(g, R, rand) {
      const tilt = -0.32, flat = 0.3;
      const ringList = [[1.3, 1.55, 'rgba(200,170,110,0.55)'], [1.58, 1.95, 'rgba(240,215,160,0.8)'], [1.98, 2.02, 'rgba(0,0,0,0.25)'], [2.02, 2.25, 'rgba(215,190,135,0.7)']];
      halo(g, R, '255,225,150', 1.35);
      rings(g, R, tilt, flat, ringList, false);
      sphere(g, R, '#f7e0a0', '#7a5a22', '255,230,160', (g, R) => {
        bands(g, R, ['#f2dca0', '#e2c27e', '#f5e3b0', '#d8b46e', '#efd89c', '#caa35f', '#f0dca8', '#d9b877'], rand, 0.12);
      });
      rings(g, R, tilt, flat, ringList, true);
      return 2.35;
    },
    uranus(g, R, rand) {
      const tilt = 1.36, flat = 0.22;
      const ringList = [[1.45, 1.5, 'rgba(200,255,255,0.55)'], [1.6, 1.64, 'rgba(200,255,255,0.4)'], [1.75, 1.8, 'rgba(220,255,255,0.65)']];
      halo(g, R, '160,250,245', 1.35);
      rings(g, R, tilt, flat, ringList, false);
      sphere(g, R, '#c8fbf6', '#2e7f8c', '180,255,250', (g, R) => {
        g.fillStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(0, -R * 0.6 + i * R * 0.4, R * 1.1, R * 0.07, 0, 0, TAU); g.fill(); }
      });
      rings(g, R, tilt, flat, ringList, true);
      return 1.95;
    },
    neptune(g, R, rand) {
      halo(g, R, '100,150,255', 1.3);
      sphere(g, R, '#5b8cff', '#08145a', '120,170,255', (g, R) => {
        bands(g, R, ['#4a7cf0', '#3b67df', '#5687f5', '#3560d5', '#4b7df0', '#2f55c8'], rand, 0.1);
        // 커다란 검은 폭풍 + 옆의 흰 구름
        g.fillStyle = '#0c1a5a';
        g.beginPath(); g.ellipse(-R * 0.3, R * 0.15, R * 0.22, R * 0.12, -0.15, 0, TAU); g.fill();
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(240,248,255,0.85)'; g.lineWidth = R * 0.04;
        g.beginPath(); g.moveTo(-R * 0.45, R * 0.33); g.quadraticCurveTo(-R * 0.25, R * 0.3, -R * 0.02, R * 0.34); g.stroke();
        // 바람 줄기
        for (let i = 0; i < 9; i++) {
          const y = (rand() - 0.5) * 1.6 * R, x = (rand() - 0.5) * 1.4 * R, l = R * (0.25 + rand() * 0.4);
          g.strokeStyle = 'rgba(220,235,255,' + (0.3 + rand() * 0.35) + ')'; g.lineWidth = R * (0.012 + rand() * 0.02);
          g.beginPath(); g.moveTo(x - l / 2, y); g.lineTo(x + l / 2, y - R * 0.03); g.stroke();
        }
      });
      return 1.3;
    },
    pluto(g, R, rand) {
      halo(g, R, '230,215,200', 1.35);
      sphere(g, R, '#efdcc2', '#5a4838', '235,225,215', (g, R) => {
        // 어두운 적도 땅
        g.fillStyle = 'rgba(95,58,40,0.75)';
        blob(g, -R * 0.55, R * 0.25, R * 0.42, rand, 10); g.fill();
        // 하트 모양 얼음 평원
        g.fillStyle = 'rgba(255,250,242,0.95)';
        const hx = R * 0.2, hy = R * 0.12, s = R * 0.5;
        g.beginPath();
        g.moveTo(hx, hy + s * 0.55);
        g.bezierCurveTo(hx - s * 0.9, hy - s * 0.05, hx - s * 0.45, hy - s * 0.75, hx, hy - s * 0.25);
        g.bezierCurveTo(hx + s * 0.45, hy - s * 0.75, hx + s * 0.9, hy - s * 0.05, hx, hy + s * 0.55);
        g.fill();
      });
      return 1.4;
    },
    // ─── 외계 행성 여덟 (2026-09-27, 공용 도감 common/worlds.js의 look을 따라 그린다) ───
    frost(g, R, rand) {
      halo(g, R, '190,240,255', 1.32);
      sphere(g, R, '#f2fcff', '#6aa6c8', '205,245,255', (g, R) => {
        // 푸른 얼음 조각 · 금 간 무늬 · 극지 흰 모자
        for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(120,190,230,' + (0.18 + rand() * 0.2) + ')'; blob(g, (rand() - 0.5) * 1.7 * R, (rand() - 0.5) * 1.5 * R, R * (0.12 + rand() * 0.2), rand, 7); g.fill(); }
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (let i = 0; i < 9; i++) {
          let x = (rand() - 0.5) * 1.6 * R, y = (rand() - 0.5) * 1.6 * R;
          g.strokeStyle = 'rgba(70,150,210,0.7)'; g.lineWidth = R * (0.012 + rand() * 0.014);
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * R * 0.45; y += (rand() - 0.5) * R * 0.45; g.lineTo(x, y); }
          g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.beginPath(); g.ellipse(0, -R * 0.95, R * 0.62, R * 0.2, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(0, R * 0.97, R * 0.5, R * 0.15, 0, 0, TAU); g.fill();
      });
      return 1.32;
    },
    lava(g, R, rand) {
      halo(g, R, '255,110,50', 1.34);
      sphere(g, R, '#4a241a', '#120604', '255,120,60', (g, R) => {
        for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(10,4,2,' + (0.3 + rand() * 0.3) + ')'; blob(g, (rand() - 0.5) * 1.7 * R, (rand() - 0.5) * 1.6 * R, R * (0.1 + rand() * 0.2), rand, 8); g.fill(); }
        // 빛나는 용암 갈라짐 (두 겹: 주황 바깥 · 노란 속)
        g.lineCap = 'round'; g.lineJoin = 'round';
        const paths = [];
        for (let i = 0; i < 11; i++) {
          let x = (rand() - 0.5) * 1.7 * R, y = (rand() - 0.5) * 1.7 * R;
          const pts = [[x, y]];
          for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * R * 0.4; y += (rand() - 0.5) * R * 0.4; pts.push([x, y]); }
          paths.push(pts);
        }
        g.globalCompositeOperation = 'lighter';
        for (const [col, w] of [['rgba(255,110,30,0.75)', 0.05], ['rgba(255,220,80,0.9)', 0.018]]) {
          g.strokeStyle = col; g.lineWidth = R * w;
          for (const pts of paths) { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
        }
        for (let i = 0; i < 5; i++) {
          const x = (rand() - 0.5) * 1.4 * R, y = (rand() - 0.5) * 1.4 * R, r = R * (0.08 + rand() * 0.12);
          const lg = g.createRadialGradient(x, y, 0, x, y, r);
          lg.addColorStop(0, 'rgba(255,230,120,0.9)'); lg.addColorStop(0.5, 'rgba(255,120,30,0.6)'); lg.addColorStop(1, 'rgba(255,60,0,0)');
          g.fillStyle = lg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      });
      return 1.34;
    },
    ocean(g, R, rand) {
      halo(g, R, '90,200,255', 1.3);
      sphere(g, R, '#3cc0ff', '#083f86', '140,215,255', (g, R) => {
        for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(10,70,160,' + (0.2 + rand() * 0.2) + ')'; blob(g, (rand() - 0.5) * 1.7 * R, (rand() - 0.5) * 1.6 * R, R * (0.15 + rand() * 0.2), rand, 9); g.fill(); }
        // 흰 소용돌이 구름
        g.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const cx = (rand() - 0.5) * R * 1.1, cy = (rand() - 0.5) * R * 1.1;
          g.strokeStyle = 'rgba(240,252,255,0.75)'; g.lineWidth = R * 0.045;
          g.beginPath();
          for (let t = 0; t < 11; t += 0.2) { const rr = R * 0.024 * t; const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr * 0.75; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
          g.stroke();
        }
        for (let i = 0; i < 12; i++) {
          const x = (rand() - 0.5) * 2 * R, y = (rand() - 0.5) * 1.8 * R, l = R * (0.2 + rand() * 0.4);
          g.strokeStyle = 'rgba(255,255,255,' + (0.35 + rand() * 0.3) + ')'; g.lineWidth = R * (0.02 + rand() * 0.04);
          g.beginPath(); g.moveTo(x - l / 2, y); g.quadraticCurveTo(x, y - R * 0.06, x + l / 2, y + R * 0.03); g.stroke();
        }
      });
      return 1.3;
    },
    glass(g, R, rand) {
      halo(g, R, '110,150,255', 1.3);
      sphere(g, R, '#4a7cff', '#0c1a52', '150,190,255', (g, R) => {
        bands(g, R, ['#3a6cff', '#2a55e0', '#4c80ff', '#2248c8', '#3f72f5', '#1d3db0', '#4a7cff'], rand, 0.18);
        // 옆으로 쌩 흐르는 유리 줄
        g.lineCap = 'round';
        for (let i = 0; i < 16; i++) {
          const y = (rand() - 0.5) * 1.8 * R, x = (rand() - 0.5) * 1.6 * R, l = R * (0.3 + rand() * 0.5);
          g.strokeStyle = 'rgba(200,230,255,' + (0.3 + rand() * 0.4) + ')'; g.lineWidth = R * (0.008 + rand() * 0.018);
          g.beginPath(); g.moveTo(x - l / 2, y + l * 0.12); g.lineTo(x + l / 2, y - l * 0.12); g.stroke();
        }
      });
      return 1.3;
    },
    gem(g, R, rand) {
      halo(g, R, '230,180,255', 1.36);
      sphere(g, R, '#e2d0ff', '#4a2a7a', '235,205,255', (g, R) => {
        // 각진 보석 면: 흔든 격자의 삼각형마다 밝기가 다르다
        const n = 6, pts = [];
        for (let j = 0; j <= n; j++) { pts.push([]); for (let i = 0; i <= n; i++) pts[j].push([-R + 2 * R * i / n + (i % n ? (rand() - 0.5) * R * 0.22 : 0), -R + 2 * R * j / n + (j % n ? (rand() - 0.5) * R * 0.22 : 0)]); }
        const cols = ['rgba(255,255,255,', 'rgba(190,150,255,', 'rgba(120,80,200,', 'rgba(150,240,255,'];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i], d = pts[j + 1][i + 1];
          for (const tri of [[a, b, d], [a, d, c]]) {
            g.fillStyle = cols[Math.floor(rand() * cols.length)] + (0.12 + rand() * 0.28) + ')';
            g.beginPath(); g.moveTo(tri[0][0], tri[0][1]); g.lineTo(tri[1][0], tri[1][1]); g.lineTo(tri[2][0], tri[2][1]); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = Math.max(1, R * 0.008); g.stroke();
          }
        }
        // 번쩍이는 빛 몇 개
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const x = (rand() - 0.6) * R, y = (rand() - 0.6) * R, r = R * (0.06 + rand() * 0.06);
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.2, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.2, y); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(x - r, y); g.lineTo(x, y + r * 0.2); g.lineTo(x + r, y); g.lineTo(x, y - r * 0.2); g.closePath(); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      });
      return 1.36;
    },
    twin(g, R, rand) {
      halo(g, R, '255,215,150', 1.3);
      sphere(g, R, '#f6cc88', '#8a5424', '255,225,170', (g, R) => {
        bands(g, R, ['#f0c07a', '#dca060', '#f6d49a', '#c98a48', '#ecb86e', '#d49856', '#f4cc8c', '#c08040'], rand, 0.3);
        // 모래 언덕 물결
        g.lineCap = 'round';
        for (let i = 0; i < 10; i++) {
          const y = (rand() - 0.5) * 1.7 * R, x = (rand() - 0.5) * 1.2 * R, l = R * (0.3 + rand() * 0.4);
          g.strokeStyle = 'rgba(120,70,30,0.35)'; g.lineWidth = R * 0.02;
          g.beginPath(); g.moveTo(x - l / 2, y); g.quadraticCurveTo(x, y - R * 0.08, x + l / 2, y); g.stroke();
        }
      });
      return 1.3;
    },
    shroom(g, R, rand) {
      halo(g, R, '125,255,160', 1.32);
      sphere(g, R, '#5ee29a', '#12402a', '150,255,190', (g, R) => {
        for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(20,80,50,' + (0.3 + rand() * 0.3) + ')'; blob(g, (rand() - 0.5) * 1.7 * R, (rand() - 0.5) * 1.6 * R, R * (0.1 + rand() * 0.18), rand, 8); g.fill(); }
        // 빛나는 버섯 점 (분홍 · 하늘색)
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
          const x = (rand() - 0.5) * 1.8 * R, y = (rand() - 0.5) * 1.8 * R, r = R * (0.03 + rand() * 0.05);
          const col = rand() < 0.6 ? '255,154,232' : '106,240,255';
          const lg = g.createRadialGradient(x, y, 0, x, y, r * 2);
          lg.addColorStop(0, 'rgba(' + col + ',0.95)'); lg.addColorStop(0.4, 'rgba(' + col + ',0.5)'); lg.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = lg; g.beginPath(); g.arc(x, y, r * 2, 0, TAU); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      });
      return 1.32;
    },
    rogue(g, R, rand) {
      // 어두운 행성, 테두리만 오로라 빛 (초록 · 보라)
      const h = g.createRadialGradient(0, 0, R * 0.85, 0, 0, R * 1.4);
      h.addColorStop(0, 'rgba(106,255,200,0.4)'); h.addColorStop(0.35, 'rgba(154,125,255,0.22)'); h.addColorStop(1, 'rgba(154,125,255,0)');
      g.fillStyle = h; g.beginPath(); g.arc(0, 0, R * 1.4, 0, TAU); g.fill();
      sphere(g, R, '#44446a', '#0a0a18', '106,255,200', (g, R) => {
        for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(5,5,15,' + (0.3 + rand() * 0.3) + ')'; blob(g, (rand() - 0.5) * 1.6 * R, (rand() - 0.5) * 1.6 * R, R * (0.12 + rand() * 0.2), rand, 8); g.fill(); }
      });
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (const [col, a0, a1, w] of [['rgba(106,255,200,0.7)', -2.7, -0.5, 0.05], ['rgba(179,125,255,0.6)', -2.3, -0.9, 0.035], ['rgba(106,255,200,0.35)', 0.7, 2.2, 0.03]]) {
        g.strokeStyle = col; g.lineWidth = R * w;
        g.beginPath(); g.arc(0, 0, R * 1.02, a0, a1); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      return 1.4;
    },
  };
  // 작은 달 (지구의 달, 화성의 작은 달 둘, 목성의 이오, 명왕성의 카론)
  const MOONS = {
    earth: [{ d: 1.55, a: -2.45, r: 0.2, c1: '#e8e8e8', c2: '#4a4a4a', craters: true }],
    mars: [{ d: 1.45, a: 0.5, r: 0.09, c1: '#b8a898', c2: '#3a3028', lump: true }, { d: 1.9, a: -0.35, r: 0.06, c1: '#c8b8a8', c2: '#3e342c', lump: true }],
    jupiter: [{ d: 1.15, a: 3.6, r: 0.045, c1: '#fff08a', c2: '#8a6a1a' }],
    pluto: [{ d: 1.9, a: 2.6, r: 0.42, c1: '#c8c4c0', c2: '#3a3836' }],
  };

  function moonSprite(m, R, q, idx, pid) {
    const key = 'moon:' + pid + idx + ':' + Math.round(R) + ':' + q;
    if (sprites[key]) return sprites[key];
    const r = R * m.r;
    const c = document.createElement('canvas');
    const half = Math.ceil(r * 1.3 * q) + 2;
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half); g.scale(q, q);
    const rand = JP.rng(idx * 97 + 5);
    if (m.lump) g.scale(1.25, 0.85);
    sphere(g, r, m.c1, m.c2, null, m.craters ? (g, R) => {
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(60,60,60,0.35)'; g.beginPath(); g.arc((rand() - 0.5) * 1.6 * R, (rand() - 0.5) * 1.6 * R, R * (0.08 + rand() * 0.15), 0, TAU); g.fill(); }
    } : null);
    sprites[key] = { c, half: half / q };
    return sprites[key];
  }

  // 블랙홀: 강착 원반(기울어진 빛 고리) + 가운데 검은 그림자 + 둘레 빛 고리. 원반 앞쪽 반은 그림자 위에 다시 그린다
  function holeSprite(R, q) {
    const key = 'hole:' + Math.round(R) + ':' + q;
    if (sprites[key]) return sprites[key];
    const core = R * 0.2;
    const c = document.createElement('canvas');
    const half = Math.ceil(R * 1.5 * q);
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half); g.scale(q, q);
    const h = g.createRadialGradient(0, 0, core, 0, 0, R * 1.5);
    h.addColorStop(0, 'rgba(255,150,80,0.35)');
    h.addColorStop(0.4, 'rgba(150,70,255,0.18)');
    h.addColorStop(1, 'rgba(60,20,120,0)');
    g.fillStyle = h; g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();
    const disk = front => {
      g.save();
      g.rotate(-0.22); g.scale(1, 0.3);
      if (front) { g.beginPath(); g.rect(-R * 2, 0, R * 4, R * 4); g.clip(); }
      const dg = g.createRadialGradient(0, 0, core * 1.2, 0, 0, R);
      dg.addColorStop(0, 'rgba(255,255,240,1)');
      dg.addColorStop(0.15, 'rgba(255,220,130,0.95)');
      dg.addColorStop(0.45, 'rgba(255,120,40,0.75)');
      dg.addColorStop(0.75, 'rgba(170,40,90,0.4)');
      dg.addColorStop(1, 'rgba(90,20,120,0)');
      g.fillStyle = dg;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.arc(0, 0, core * 1.15, 0, TAU, true); g.fill('evenodd');
      g.restore();
    };
    g.globalCompositeOperation = 'lighter';
    disk(false);
    // 그림자 둘레로 휘어 보이는 빛 고리
    const ring = g.createRadialGradient(0, 0, core * 0.95, 0, 0, core * 1.7);
    ring.addColorStop(0, 'rgba(255,245,210,0)');
    ring.addColorStop(0.2, 'rgba(255,235,190,0.95)');
    ring.addColorStop(0.5, 'rgba(255,160,70,0.45)');
    ring.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = ring; g.beginPath(); g.arc(0, 0, core * 1.7, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000000';
    g.beginPath(); g.arc(0, 0, core, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter';
    disk(true);
    g.globalCompositeOperation = 'source-over';
    sprites[key] = { c, half: half / q };
    return sprites[key];
  }
  // 소용돌이 팔 (반투명, 천천히 돌려 찍는다). 저해상도로 그려 부드럽게
  function swirlSprite(R) {
    const key = 'swirl:' + Math.round(R);
    if (sprites[key]) return sprites[key];
    const q = 0.5;
    const c = document.createElement('canvas');
    const half = Math.ceil(R * q);
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half); g.scale(q, q);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'butt'; g.lineJoin = 'round';
    // 팔 하나를 12토막으로 나눠 토막마다 이어진 선 하나로 그린다 (바깥으로 갈수록 가늘고 흐리게)
    const at = (arm, t) => { const r = R * (0.12 + t * 0.88), a = arm * TAU / 4 + Math.log(r / R * 8 + 1) * 2.2; return [Math.cos(a) * r, Math.sin(a) * r]; };
    for (let arm = 0; arm < 4; arm++) {
      for (let ch = 0; ch < 12; ch++) {
        const t0 = ch / 12;
        g.strokeStyle = arm % 2 ? 'rgba(190,120,255,' + (0.2 * (1 - t0)) + ')' : 'rgba(255,150,80,' + (0.15 * (1 - t0)) + ')';
        g.lineWidth = R * (0.045 * (1 - t0) + 0.01);
        g.beginPath();
        for (let k = 0; k <= 6; k++) { const q = at(arm, t0 + k / 72); if (k) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
        g.stroke();
      }
    }
    sprites[key] = { c, half: half / q };
    return sprites[key];
  }


  // 행성 그림 (반지름 R px, 화질 q). 배경이라 한 겹 살짝 어둡게 덮는다 (발판·주인공이 행성 위에서도 잘 보이게)
  const VEIL = { mercury: 0.3, venus: 0.34, earth: 0.16, mars: 0.2, jupiter: 0.36, saturn: 0.26, uranus: 0.3, neptune: 0.16, pluto: 0.12,
    frost: 0.22, lava: 0.06, ocean: 0.2, glass: 0.18, gem: 0.3, twin: 0.32, shroom: 0.16, rogue: 0 };
  function planetSprite(id, R, q) {
    const key = id + ':' + Math.round(R) + ':' + q;
    if (sprites[key]) return sprites[key];
    const rand = JP.rng(id.length * 131 + 17);
    const k = PLANET_K[id] || 1.4;
    const c = document.createElement('canvas');
    const half = Math.ceil(R * k * q);
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half);
    g.scale(q, q);
    (PAINT[id] || PAINT.pluto)(g, R, rand);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(4,6,14,' + (VEIL[id] || 0.2) + ')';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    sprites[key] = { c, half: half / q, id };
    return sprites[key];
  }
  // 화면 크기가 바뀌면 옛 그림은 버린다
  function clear() { for (const k of Object.keys(sprites)) delete sprites[k]; }

  JP.Space = { planetSprite, moonSprite, holeSprite, swirlSprite, clear, MOONS, PLANET_K };
})(JP);
