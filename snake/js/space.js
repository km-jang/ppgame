'use strict';
// 우주 여행 배경 (2026-09-27, 소유자: "다른 게임도 우주배경 반영").
// 판 뒤 하늘이 뿅뿅 우주선처럼 태양계(수성 ~ 명왕성)를 지나가고, 가끔 블랙홀, 스테이지 10~12는 블랙홀·은하수·은하 중심.
// 그림만 맡는다 (규칙은 world.js spaceScene: 무한은 구슬 12개마다, 스테이지는 레벨마다).
// 행성 그림은 뿅뿅 우주선 game/js/render.js의 PAINT를 그대로 옮겨 왔다 (그쪽을 고치면 여기도 같이 맞춘다).
// 성능: 하늘은 1/4 해상도로, 행성·달·블랙홀 원반·소용돌이·은하는 장면이 바뀔 때 한 번만 그려 두고 매 프레임 찍기만 한다.
// 매 프레임 shadowBlur 없음. 장면이 바뀌면 1.5초에 걸쳐 앞 장면이 흐려진다 (움직임 줄이기면 바로 바뀌고 모두 멈춰 있다).
(function (SN) {
  const TAU = Math.PI * 2;
  const DISP = '"Jua", system-ui, sans-serif';

  // 행성 그림 설정 (뿅뿅 우주선과 같은 값). sky: 하늘색 · pos: 화면 비율 위치 · size: 화면 짧은 변 대비 지름 · veil: 덮는 어둠
  const PLANET_ART = {
    mercury: { sky: { base: '#07070a', a: '#3a2a14', b: '#1a1f2e' }, grid: '255,214,150', pos: [0.8, 0.72], size: 0.46, atm: '255,230,200', dust: ['ember', '255,190,120'], sun: 1, veil: 0.34 },
    venus:   { sky: { base: '#0b0804', a: '#5a3a0c', b: '#3a2206' }, grid: '255,206,110', pos: [0.18, 0.76], size: 0.6,  atm: '255,220,140', dust: ['haze', '255,220,150'], sun: 0.55, veil: 0.34 },
    earth:   { sky: { base: '#040810', a: '#0d3a6b', b: '#0b2a3a' }, grid: '120,200,255', pos: [0.82, 0.78], size: 0.62, atm: '120,190,255', dust: ['star', '200,230,255'], sun: 0.35, veil: 0.18 },
    mars:    { sky: { base: '#0a0506', a: '#5a1a0c', b: '#2a0f16' }, grid: '255,140,100', pos: [0.2, 0.28], size: 0.5,  atm: '255,150,110', dust: ['sand', '255,140,90'], sun: 0.25, veil: 0.2 },
    jupiter: { sky: { base: '#08060a', a: '#4a2a1a', b: '#2a1a2a' }, grid: '240,190,140', pos: [0.95, 0.56], size: 1.3,  atm: '255,210,170', dust: ['star', '255,225,190'], sun: 0.15, veil: 0.5 },
    saturn:  { sky: { base: '#07060a', a: '#4a3a14', b: '#1f1a2e' }, grid: '245,215,140', pos: [0.74, 0.3],  size: 0.44, atm: '255,230,160', dust: ['ice', '255,230,170'], sun: 0.12, veil: 0.3 },
    uranus:  { sky: { base: '#040a0c', a: '#0e4a50', b: '#0b2a3a' }, grid: '150,240,240', pos: [0.2, 0.3],   size: 0.46, atm: '170,255,250', dust: ['ice', '180,255,250'], sun: 0.08, veil: 0.34 },
    neptune: { sky: { base: '#03050e', a: '#0f2a7a', b: '#0a1a4a' }, grid: '110,150,255', pos: [0.8, 0.72],  size: 0.56, atm: '110,160,255', dust: ['wind', '170,200,255'], sun: 0.05, veil: 0.14 },
    pluto:   { sky: { base: '#05050a', a: '#1a1a2a', b: '#10141e' }, grid: '220,210,200', pos: [0.76, 0.26], size: 0.2,  atm: '230,220,210', dust: ['snow', '230,235,255'], sun: 0.02, veil: 0.12 },
  };

  // ─── 행성 그리기 (한 번만. 결과 캔버스를 매 프레임 찍는다) ───
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

  const PLANET_K = { mercury: 1.3, venus: 1.35, earth: 1.3, mars: 1.3, jupiter: 1.14, saturn: 2.35, uranus: 1.95, neptune: 1.3, pluto: 1.4 };
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
  };
  // 작은 달 (지구의 달, 화성의 작은 달 둘, 목성의 이오, 명왕성의 카론)
  const MOONS = {
    earth: [{ d: 1.55, a: -2.45, r: 0.2, c1: '#e8e8e8', c2: '#4a4a4a', craters: true }],
    mars: [{ d: 1.45, a: 0.5, r: 0.09, c1: '#b8a898', c2: '#3a3028', lump: true }, { d: 1.9, a: -0.35, r: 0.06, c1: '#c8b8a8', c2: '#3e342c', lump: true }],
    jupiter: [{ d: 1.15, a: 3.6, r: 0.045, c1: '#fff08a', c2: '#8a6a1a' }],
    pluto: [{ d: 1.9, a: 2.6, r: 0.42, c1: '#c8c4c0', c2: '#3a3836' }],
  };

  // 그려 둔 그림 모음 (크기·화질이 바뀌면 다시)
  const sprites = {};
  function planetSprite(id, R, q) {
    const key = id + ':' + Math.round(R) + ':' + q;
    if (sprites[key]) return sprites[key];
    const rand = SN.rng(id.length * 131 + 17);
    // k: 그림 캔버스가 반지름의 몇 배 넓이인지 (고리·둘레 빛 포함, PAINT가 돌려주는 값과 같다)
    const k = PLANET_K[id] || 1.4;
    const c = document.createElement('canvas');
    const half = Math.ceil(R * k * q);
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half);
    g.scale(q, q);
    PAINT[id](g, R, rand);
    // 배경이라 한 겹 어둡게 덮는다 (적·탄이 행성 위에서도 잘 보이게, 밝은 행성일수록 진하게)
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(4,6,14,' + (PLANET_ART[id].veil || 0.2) + ')';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    sprites[key] = { c, half: half / q, id };
    return sprites[key];
  }
  function moonSprite(m, R, q, idx, pid) {
    const key = 'moon:' + pid + idx + ':' + Math.round(R) + ':' + q;
    if (sprites[key]) return sprites[key];
    const r = R * m.r;
    const c = document.createElement('canvas');
    const half = Math.ceil(r * 1.3 * q) + 2;
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half); g.scale(q, q);
    const rand = SN.rng(idx * 97 + 5);
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


  // 은하수: 저해상도로 그린 나선 팔 여러 개 + 밝은 가운데 + 별 알갱이 (기울여 납작하게 찍고 아주 천천히 돈다)
  function galaxySprite(R) {
    const key = 'galaxy:' + Math.round(R);
    if (sprites[key]) return sprites[key];
    const q = 0.5, c = document.createElement('canvas'), half = Math.ceil(R * q);
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half); g.scale(q, q);
    g.globalCompositeOperation = 'lighter';
    const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.45);
    core.addColorStop(0, 'rgba(255,240,210,0.9)'); core.addColorStop(0.3, 'rgba(255,200,150,0.45)'); core.addColorStop(1, 'rgba(120,120,255,0)');
    g.fillStyle = core; g.beginPath(); g.arc(0, 0, R * 0.45, 0, TAU); g.fill();
    const rand = SN.rng(8080);
    const at = (arm, t) => { const r = R * (0.08 + t * 0.92), a = arm * TAU / 3 + Math.log(r / R * 10 + 1) * 2.4; return [Math.cos(a) * r, Math.sin(a) * r]; };
    for (let arm = 0; arm < 3; arm++) {
      for (let ch = 0; ch < 14; ch++) {
        const t0 = ch / 14;
        g.strokeStyle = arm === 1 ? 'rgba(255,190,230,' + (0.22 * (1 - t0)) + ')' : 'rgba(150,180,255,' + (0.26 * (1 - t0)) + ')';
        g.lineWidth = R * (0.09 * (1 - t0) + 0.015);
        g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k <= 6; k++) { const p = at(arm, t0 + k / 84); if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
        g.stroke();
      }
      // 팔을 따라 뿌린 별 알갱이
      for (let i = 0; i < 90; i++) {
        const t = Math.pow(rand(), 0.8), p = at(arm, t), j = R * 0.06 * (1 - t * 0.5);
        g.fillStyle = rand() < 0.2 ? 'rgba(255,220,240,0.9)' : 'rgba(210,225,255,0.85)';
        const sz = 1 + rand() * 2.2;
        g.fillRect(p[0] + (rand() - 0.5) * j * 2 - sz / 2, p[1] + (rand() - 0.5) * j * 2 - sz / 2, sz, sz);
      }
    }
    sprites[key] = { c, half: half / q };
    return sprites[key];
  }

  // 하늘 그림 설정 (행성이 아닌 장면)
  const OTHER_ART = {
    hole:   { sky: { base: '#020104', a: '#2a0a3a', b: '#1a0a14' }, sun: 0 },
    galaxy: { sky: { base: '#03040c', a: '#1a2458', b: '#2a1446' }, sun: 0 },
    core:   { sky: { base: '#070406', a: '#4a2a10', b: '#2a0f30' }, sun: 0 },
  };
  const artOf = id => PLANET_ART[id] || OTHER_ART[id] || OTHER_ART.hole;

  // 하늘: 1/4 해상도 캔버스에 흐릿한 빛 덩어리 + 해 빛(왼쪽 위, 멀어질수록 작게) + 가장자리 어둡게
  function paintSky(id, w, h) {
    const s = 0.25, art = artOf(id), sky = art.sky;
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * s)); c.height = Math.max(8, Math.round(h * s));
    const g = c.getContext('2d');
    g.scale(s, s);
    g.fillStyle = sky.base; g.fillRect(0, 0, w, h);
    let seed = 7;
    for (let i = 0; i < id.length; i++) seed = seed * 31 + id.charCodeAt(i);
    const rand = SN.rng(seed);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = rand() * w, y = rand() * h, rad = Math.max(w, h) * (0.25 + rand() * 0.35);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, i % 2 ? sky.a : sky.b); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.9 * (0.5 + rand() * 0.4);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }
    const sun = art.sun || 0;
    if (sun > 0) {
      const R = Math.max(w, h) * (0.25 + 0.55 * sun);
      const grad = g.createRadialGradient(-w * 0.04, -h * 0.06, 0, -w * 0.04, -h * 0.06, R);
      grad.addColorStop(0, 'rgba(255,245,220,' + (0.5 + 0.5 * sun) + ')');
      grad.addColorStop(0.25, 'rgba(255,200,120,' + (0.35 * sun + 0.1) + ')');
      grad.addColorStop(1, 'rgba(255,150,60,0)');
      g.globalAlpha = 1; g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    return c;
  }

  function makeStars(w, h) {
    const rand = SN.rng(4242);
    const n = Math.max(20, Math.round(110 * (w * h) / (1280 * 800)));
    const stars = [];
    for (let i = 0; i < n; i++) stars.push({ x: rand() * w, y: rand() * h, s: rand() < 0.2 ? 2 : 1, a: 0.25 + rand() * 0.5, ph: rand() * TAU });
    return stars;
  }

  // ─── 장면 겹 (지금 것 + 흐려지는 앞 것) ────────────────────
  const FADE = 1.5;
  const bg = { key: '', cur: null, prev: null, fade: 0, clock: 0, stars: null, starKey: '' };

  function buildLayer(id, v) {
    const w = v.w, h = v.h, m = Math.min(w, h), q = Math.min(v.dpr || 1, 1.25);
    const L = { id, sky: paintSky(id, w, h), t0: bg.clock, w, h };
    if (PLANET_ART[id]) {
      const art = PLANET_ART[id];
      L.kind = 'planet'; L.R = m * art.size / 2;
      L.sprite = planetSprite(id, L.R, q);
      L.moons = (MOONS[id] || []).map((mo, i) => ({ mo, sp: moonSprite(mo, L.R, q, i, id) }));
      L.pos = art.pos;
    } else if (id === 'galaxy' || id === 'core') {
      L.kind = id;
      L.gal = galaxySprite(Math.max(w, h) * 0.5);
      if (id === 'core') { L.R = Math.max(60, Math.min(150, m * 0.16)); L.sprite = holeSprite(L.R, q); }
    } else {
      L.kind = 'hole';
      L.R = Math.max(90, Math.min(200, m * 0.24));
      L.sprite = holeSprite(L.R, q);
      L.swirl = swirlSprite(Math.max(w, h) * 0.42);
    }
    return L;
  }
  function pruneSprites() {
    const keep = new Set();
    for (const L of [bg.cur, bg.prev]) {
      if (!L) continue;
      for (const s of [L.sprite, L.swirl, L.gal]) if (s) keep.add(s);
      if (L.moons) for (const mo of L.moons) keep.add(mo.sp);
    }
    for (const k of Object.keys(sprites)) if (!keep.has(sprites[k]) && !k.startsWith('icon:')) delete sprites[k];
  }

  function drawLayer(ctx, L, v, alpha) {
    const t = bg.clock, calm = v.calm, w = v.w, h = v.h;
    ctx.globalAlpha = alpha;
    ctx.drawImage(L.sky, 0, 0, w, h);
    if (L.kind === 'planet') {
      // 도착 뒤 천천히 지나간다 (초당 2px, 최대 90px)
      const pass = calm ? 0 : Math.min(90, Math.max(0, t - L.t0) * 2);
      const cx = L.pos[0] * w - pass, cy = L.pos[1] * h + pass * 0.3, s = L.sprite;
      ctx.globalAlpha = alpha * (L.id === 'pluto' ? 0.8 : 0.88);
      ctx.drawImage(s.c, cx - s.half, cy - s.half, s.half * 2, s.half * 2);
      if (L.moons) for (let i = 0; i < L.moons.length; i++) {
        const { mo, sp } = L.moons[i];
        const a = mo.a + (calm ? 0 : t * 0.012 * (i % 2 ? -1 : 1));
        const mx = cx + Math.cos(a) * L.R * mo.d, my = cy + Math.sin(a) * L.R * mo.d * 0.9;
        ctx.drawImage(sp.c, mx - sp.half, my - sp.half, sp.half * 2, sp.half * 2);
      }
    } else if (L.kind === 'hole') {
      const hx = 0.72 * w, hy = 0.4 * h, sw = L.swirl;
      ctx.save();
      ctx.translate(hx, hy); ctx.rotate(calm ? 0 : -t * 0.4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(sw.c, -sw.half, -sw.half, sw.half * 2, sw.half * 2);
      ctx.restore();
      ctx.globalAlpha = alpha * 0.9;
      const s = L.sprite;
      ctx.drawImage(s.c, hx - s.half, hy - s.half, s.half * 2, s.half * 2);
    } else {
      // 은하수 · 은하 중심: 기울여 납작하게 찍은 나선이 아주 천천히 돈다
      const gx = w * 0.5, gy = h * 0.5, gl = L.gal;
      ctx.save();
      ctx.translate(gx, gy); ctx.rotate(-0.35); ctx.scale(1, 0.5); ctx.rotate(calm ? 0 : t * 0.03);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.85;
      ctx.drawImage(gl.c, -gl.half, -gl.half, gl.half * 2, gl.half * 2);
      ctx.restore();
      if (L.sprite) { const s = L.sprite; ctx.globalAlpha = alpha * 0.9; ctx.drawImage(s.c, gx - s.half, gy - s.half, s.half * 2, s.half * 2); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 판 뒤 하늘 전체: 장면 겹 + 반짝이는 별. dt: 이번 프레임 시간(초)
  function draw(ctx, W, v, dt) {
    bg.clock += Math.min(0.1, dt || 0);
    const id = (W && W.space && W.space.scene) || 'mercury';
    const sizeKey = v.w + 'x' + v.h + ':' + Math.min(v.dpr || 1, 1.25);
    if (!bg.cur || bg.cur.id !== id || bg.key !== sizeKey) {
      const sizeChanged = bg.key !== sizeKey;
      bg.prev = sizeChanged || v.calm ? null : bg.cur;
      bg.fade = bg.prev ? FADE : 0;
      bg.key = sizeKey;
      bg.cur = buildLayer(id, v);
      pruneSprites();
    }
    if (bg.fade > 0) {
      bg.fade = Math.max(0, bg.fade - (dt || 0));
      if (bg.fade === 0) { bg.prev = null; pruneSprites(); }
    }
    const k = bg.prev ? bg.fade / FADE : 0;
    if (bg.prev) drawLayer(ctx, bg.prev, v, 1);
    drawLayer(ctx, bg.cur, v, 1 - k);
    if (bg.starKey !== v.w + 'x' + v.h) { bg.starKey = v.w + 'x' + v.h; bg.stars = makeStars(v.w, v.h); }
    ctx.fillStyle = '#e8f7ff';
    const t = bg.clock;
    for (const s of bg.stars) {
      ctx.globalAlpha = v.calm ? s.a : s.a * (0.6 + 0.4 * Math.sin(t * 1.6 + s.ph));
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }
  // 장면이 흐려지며 넘어가는 중인가 (멈춘 화면에서 그리기를 쉬어도 되는지)
  const busy = () => bg.fade > 0;

  // 작은 행성 그림 (스테이지 고르기 칸). 캔버스 크기에 맞춰 한 번 그린다
  function icon(cv, id) {
    const g = cv.getContext('2d'), n = Math.min(cv.width, cv.height);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.save();
    g.translate(cv.width / 2, cv.height / 2);
    if (PLANET_ART[id]) {
      const k = PLANET_K[id] || 1.4, R = n / 2 / Math.max(1.12, k) * (id === 'pluto' ? 0.8 : 1);
      PAINT[id](g, R, SN.rng(id.length * 131 + 17));
    } else if (id === 'galaxy' || id === 'core') {
      const s = galaxySprite(n * 0.9);
      g.rotate(-0.35); g.scale(1, 0.55);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(s.c, -n / 2, -n / 2, n, n);
      g.globalCompositeOperation = 'source-over';
      g.setTransform(1, 0, 0, 1, cv.width / 2, cv.height / 2);
      if (id === 'core') { g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, n * 0.1, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,200,120,0.9)'; g.lineWidth = Math.max(1, n * 0.04); g.stroke(); }
    } else {
      const R = n * 0.34, s = holeSprite(R, 1);
      g.drawImage(s.c, -s.half, -s.half, s.half * 2, s.half * 2);
    }
    g.restore();
  }

  // 장면 알림 ("화성 도착!"): 판 위가 아니라 위쪽 HUD 줄의 빈 곳(x0 ~ x1)에 작은 알약으로, bannerTime초 동안
  function drawBanner(ctx, W, v, x0, x1) {
    if (!W.space || !SN.World.spaceScene) return;
    const sc = SN.World.spaceScene(W), T = SN.DATA.SPACE.bannerTime;
    if (sc.since < 0 || sc.since > T || W.phase === 'over') return;
    const a = Math.min(1, sc.since * 4, (T - sc.since) * 2.5);
    const s = v.ui || 1, fs = Math.round(17 * s), room = x1 - x0 - 16;
    if (room < fs * 5) return;
    ctx.font = fs + 'px ' + DISP;
    const head = sc.name + (sc.kind === 'planet' ? (W.mode === 'stage' ? '' : ' 도착!') + (sc.lap > 1 ? ' (' + sc.lap + '바퀴)' : '') : W.mode === 'stage' ? '' : '!');
    const small = Math.round(13 * s);
    let fact = sc.fact;
    ctx.font = fs + 'px ' + DISP;
    const hw = ctx.measureText(head).width;
    ctx.font = small + 'px ' + DISP;
    let fw = fact ? ctx.measureText(fact).width : 0;
    const ic = fs * 1.2;
    let w = ic + 8 * s + hw + (fw ? 10 * s + fw : 0) + 24 * s;
    if (w > room) { fact = ''; fw = 0; w = ic + 8 * s + hw + 24 * s; }
    if (w > room) return;
    const cx = (x0 + x1) / 2, y = v.hudMid, hgt = fs * 1.7, left = cx - w / 2;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,10,20,0.82)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(left, y - hgt / 2, w, hgt, hgt / 2); else ctx.rect(left, y - hgt / 2, w, hgt);
    ctx.fill();
    ctx.strokeStyle = sc.color; ctx.lineWidth = 1.5; ctx.stroke();
    // 작은 행성 아이콘 (한 번 그려 둔 것)
    const key = 'icon:' + sc.id + ':' + Math.round(ic);
    if (!sprites[key]) { const c = document.createElement('canvas'); c.width = c.height = Math.round(ic * 2); icon(c, sc.id); sprites[key] = { c, half: ic / 2 }; }
    ctx.drawImage(sprites[key].c, left + 12 * s, y - ic / 2, ic, ic);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let tx = left + 12 * s + ic + 8 * s;
    ctx.font = fs + 'px ' + DISP; ctx.fillStyle = sc.color;
    ctx.fillText(head, tx, y + 1);
    if (fact) { tx += hw + 10 * s; ctx.font = small + 'px ' + DISP; ctx.fillStyle = '#c9d8e6'; ctx.fillText(fact, tx, y + 1); }
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  SN.Space = { draw, icon, drawBanner, busy, ids: Object.keys(PLANET_ART).concat(Object.keys(OTHER_ART)) };
})(SN);
