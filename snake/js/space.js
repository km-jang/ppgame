'use strict';
// 우주 여행 배경 (2026-09-27, 소유자: "다른 게임도 우주배경 반영").
// 판 뒤 하늘이 뿅뿅 우주선처럼 태양계(수성 ~ 명왕성)를 지나가고, 가끔 블랙홀, 스테이지 10~12는 블랙홀·은하수·은하 중심.
// 그림만 맡는다 (규칙은 world.js spaceScene: 무한은 구슬 12개마다, 스테이지는 레벨마다).
// 행성 그림은 뿅뿅 우주선 game/js/render.js의 PAINT를 그대로 옮겨 왔다 (그쪽을 고치면 여기도 같이 맞춘다).
// 성능: 하늘은 1/4 해상도로, 행성·달·블랙홀 원반·소용돌이·은하는 장면이 바뀔 때 한 번만 그려 두고 매 프레임 찍기만 한다.
// 매 프레임 shadowBlur 없음. 장면이 바뀌면 1.5초에 걸쳐 앞 장면이 흐려진다 (움직임 줄이기면 바로 바뀌고 모두 멈춰 있다).
// 행성 날씨 (2026-09-27, 소유자: "얼음 행성이면 눈, 불의 행성이면 그에 맞게"): 공통 도감 common/worlds.js의 날씨를
// 판 뒤 하늘에 뿌린다 (판의 어두운 유리 바닥 아래라 판 위에서는 아주 흐리다). 판 테두리 바깥에는 쌓인 눈·용암 빛·모래 더미 같은
// 테두리 꾸밈(drawFrame)을 그린다. 입자는 최대 90개, 빛 알갱이는 미리 그린 그림을 찍기만 한다.
// 명왕성 다음 외계 행성 여덟의 그림도 여기 있다 (모양·색은 도감의 look·colors를 따름).
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

  // 외계 행성 여덟 (common/worlds.js EXO): 하늘 색은 도감의 sky(위·가운데·아래)를 옅게 깔고, 빛 덩어리는 glow.
  // pos·size·veil은 태양계와 같은 뜻, suns: 하늘에 뜬 해 [x 비율, y 비율, 크기, 색] (해님 둘 사막 행성), sun: 왼쪽 위 해 빛 세기
  const WL = typeof WORLDS !== 'undefined' && WORLDS && WORLDS.exo ? WORLDS : null;
  const rgbOf = hex => { const n = parseInt(String(hex).slice(1), 16); return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); };
  const EXO_LAYOUT = {
    frost:  { pos: [0.8, 0.3],   size: 0.5,  sun: 0.12, veil: 0.22 },
    lava:   { pos: [0.2, 0.72],  size: 0.58, sun: 0.3,  veil: 0.1 },
    ocean:  { pos: [0.8, 0.72],  size: 0.6,  sun: 0.3,  veil: 0.24 },
    glass:  { pos: [0.18, 0.3],  size: 0.74, sun: 0.16, veil: 0.28 },
    gem:    { pos: [0.78, 0.32], size: 0.44, sun: 0.1,  veil: 0.2 },
    twin:   { pos: [0.8, 0.74],  size: 0.52, sun: 0,    veil: 0.24, suns: [[0.09, 0.14, 0.05, '255,232,150'], [0.22, 0.07, 0.035, '255,150,90']] },
    shroom: { pos: [0.2, 0.72],  size: 0.5,  sun: 0.14, veil: 0.2 },
    rogue:  { pos: [0.74, 0.42], size: 0.62, sun: 0,    veil: 0.04 },
  };
  if (WL) for (const e of WL.EXO) {
    const L = EXO_LAYOUT[e.id];
    if (!L) continue;
    PLANET_ART[e.id] = Object.assign({ sky: { base: '#04050a', a: e.sky[1], b: e.sky[2], tint: e.sky, blob: 0.4 }, atm: rgbOf(e.glow[0]), exo: true }, L);
  }

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

  const PLANET_K = { mercury: 1.3, venus: 1.35, earth: 1.3, mars: 1.3, jupiter: 1.14, saturn: 2.35, uranus: 1.95, neptune: 1.3, pluto: 1.4,
    frost: 1.3, lava: 1.35, ocean: 1.3, glass: 1.25, gem: 1.35, twin: 1.3, shroom: 1.35, rogue: 1.5 };
  // 금·갈라짐: 한 점에서 꺾이며 뻗는 선 (얼음 금, 용암 틈). 같은 모양을 두 번 그릴 수 있게 점 목록을 돌려준다
  function cracks(R, rand, n, seg) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const a0 = rand() * TAU, d0 = Math.sqrt(rand()) * R * 0.85;
      let x = Math.cos(a0) * d0, y = Math.sin(a0) * d0, a = rand() * TAU;
      const pts = [[x, y]];
      for (let k = 0; k < seg; k++) {
        a += (rand() - 0.5) * 1.4;
        const l = R * (0.08 + rand() * 0.14);
        x += Math.cos(a) * l; y += Math.sin(a) * l;
        pts.push([x, y]);
        if (rand() < 0.25) { const b = a + (rand() < 0.5 ? 1 : -1) * (0.8 + rand() * 0.6), bl = l * 0.8; list.push([[x, y], [x + Math.cos(b) * bl, y + Math.sin(b) * bl]]); }
      }
      list.push(pts);
    }
    return list;
  }
  function strokeLines(g, list) {
    g.beginPath();
    for (const pts of list) { g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); }
    g.stroke();
  }
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
  // 외계 행성 여덟 (도감 look을 따름)
  Object.assign(PAINT, {
    // 꽁꽁 얼음: 하얀 얼음 공, 금 간 푸른 얼음 무늬, 극지 흰 모자
    frost(g, R, rand) {
      halo(g, R, '191,244,255', 1.3);
      sphere(g, R, '#f4fdff', '#6aa6cc', '205,245,255', (g, R) => {
        for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(110,185,230,' + (0.22 + rand() * 0.2) + ')'; blob(g, (rand() - 0.5) * 1.7 * R, (rand() - 0.5) * 1.5 * R, R * (0.14 + rand() * 0.22), rand, 9); g.fill(); }
        const cr = cracks(R, rand, 11, 6);
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = 'rgba(40,110,175,0.7)'; g.lineWidth = R * 0.02; strokeLines(g, cr);
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = R * 0.007; g.save(); g.translate(-R * 0.012, -R * 0.012); strokeLines(g, cr); g.restore();
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.beginPath(); g.ellipse(0, -R * 0.93, R * 0.72, R * 0.26, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(0, R * 0.95, R * 0.5, R * 0.16, 0, 0, TAU); g.fill();
      });
      return 1.3;
    },
    // 부글부글 용암: 검은 바위 공에 빛나는 주황 틈 (그림자 쪽에서도 틈은 빛난다)
    lava(g, R, rand) {
      halo(g, R, '255,110,40', 1.35);
      const cr = cracks(R, rand, 15, 6);
      const pools = [];
      for (let i = 0; i < 6; i++) pools.push([(rand() - 0.5) * 1.5 * R, (rand() - 0.5) * 1.5 * R, R * (0.05 + rand() * 0.09)]);
      const glowCracks = (g, a) => {
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = 'rgba(255,60,15,' + (0.5 * a) + ')'; g.lineWidth = R * 0.06; strokeLines(g, cr);
        g.strokeStyle = 'rgba(255,105,25,' + (0.95 * a) + ')'; g.lineWidth = R * 0.02; strokeLines(g, cr);
        for (const [x, y, r] of pools) {
          const pg = g.createRadialGradient(x, y, 0, x, y, r * 1.8);
          pg.addColorStop(0, 'rgba(255,220,110,' + (0.95 * a) + ')'); pg.addColorStop(0.45, 'rgba(255,110,30,' + (0.7 * a) + ')'); pg.addColorStop(1, 'rgba(255,60,10,0)');
          g.fillStyle = pg; g.beginPath(); g.arc(x, y, r * 1.8, 0, TAU); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      };
      sphere(g, R, '#4a2418', '#100504', '255,120,50', (g, R) => {
        for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(18,7,4,' + (0.3 + rand() * 0.3) + ')'; blob(g, (rand() - 0.5) * 1.8 * R, (rand() - 0.5) * 1.6 * R, R * (0.12 + rand() * 0.2), rand, 9); g.fill(); }
        glowCracks(g, 1);
      });
      g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip(); glowCracks(g, 0.45); g.restore();
      return 1.35;
    },
    // 출렁출렁 바다: 파란 물 공, 흰 소용돌이 구름
    ocean(g, R, rand) {
      halo(g, R, '61,214,255', 1.3);
      sphere(g, R, '#3cc6ff', '#06306e', '120,220,255', (g, R) => {
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? 'rgba(10,70,160,0.35)' : 'rgba(120,230,255,0.25)'; blob(g, (rand() - 0.5) * 1.7 * R, (rand() - 0.5) * 1.5 * R, R * (0.15 + rand() * 0.25), rand, 10); g.fill(); }
        g.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const cx = (rand() - 0.5) * R * 1.1, cy = (rand() - 0.5) * R * 1.1, sz = 0.018 + rand() * 0.012;
          g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = R * 0.022;
          g.beginPath();
          for (let t = 0; t < 10; t += 0.2) { const rr = R * sz * t; const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr * 0.75; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
          g.stroke();
        }
        for (let i = 0; i < 14; i++) {
          const x = (rand() - 0.5) * 2 * R, y = (rand() - 0.5) * 1.8 * R, l = R * (0.2 + rand() * 0.4);
          g.strokeStyle = 'rgba(255,255,255,' + (0.4 + rand() * 0.35) + ')'; g.lineWidth = R * (0.02 + rand() * 0.04);
          g.beginPath(); g.moveTo(x - l / 2, y); g.quadraticCurveTo(x, y - R * 0.06, x + l / 2, y + R * 0.04); g.stroke();
        }
      });
      return 1.3;
    },
    // 쨍그랑 유리비: 짙은 파랑 가스 행성, 옆으로 흐르는 줄무늬와 유리 빛줄기
    glass(g, R, rand) {
      halo(g, R, '91,140,255', 1.25);
      sphere(g, R, '#4a78ff', '#0a1650', '140,180,255', (g, R) => {
        bands(g, R, ['#3a64e8', '#2f55d0', '#4870f0', '#2748b8', '#3d68e8', '#22409e', '#4570ec', '#2a4cc0', '#3a60e0', '#24449f'], rand, 0.22);
        g.lineCap = 'round';
        for (let i = 0; i < 22; i++) {
          const x = (rand() - 0.5) * 1.8 * R, y = (rand() - 0.5) * 1.8 * R, l = R * (0.2 + rand() * 0.5);
          g.strokeStyle = 'rgba(200,230,255,' + (0.25 + rand() * 0.35) + ')'; g.lineWidth = R * (0.006 + rand() * 0.012);
          g.beginPath(); g.moveTo(x - l / 2, y - l * 0.06); g.lineTo(x + l / 2, y + l * 0.06); g.stroke();
        }
      });
      return 1.25;
    },
    // 반짝반짝 보석: 보랏빛 공에 각진 보석 면
    gem(g, R, rand) {
      halo(g, R, '230,179,255', 1.35);
      sphere(g, R, '#e2cdff', '#4a2a7a', '230,190,255', (g, R) => {
        const N = 6, st = 2 * R / N, P = [];
        for (let j = 0; j <= N; j++) { P.push([]); for (let i = 0; i <= N; i++) P[j].push([-R + i * st + (rand() - 0.5) * st * 0.6, -R + j * st + (rand() - 0.5) * st * 0.6]); }
        const fills = ['rgba(255,255,255,0.2)', 'rgba(180,140,255,0.28)', 'rgba(110,240,255,0.2)', 'rgba(80,40,150,0.3)', 'rgba(240,200,255,0.25)'];
        g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = Math.max(0.6, R * 0.008); g.lineJoin = 'round';
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i + 1], d = P[j + 1][i];
          for (const tri of [[a, b, c], [a, c, d]]) {
            g.fillStyle = fills[Math.floor(rand() * fills.length)];
            g.beginPath(); g.moveTo(tri[0][0], tri[0][1]); g.lineTo(tri[1][0], tri[1][1]); g.lineTo(tri[2][0], tri[2][1]); g.closePath(); g.fill(); g.stroke();
          }
        }
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const x = (rand() - 0.5) * 1.4 * R, y = (rand() - 0.5) * 1.4 * R, r = R * (0.04 + rand() * 0.05);
          g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.22, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.22, y); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(x - r, y); g.lineTo(x, y + r * 0.22); g.lineTo(x + r, y); g.lineTo(x, y - r * 0.22); g.closePath(); g.fill();
        }
      });
      return 1.35;
    },
    // 해님 둘 사막: 모래색 공에 모래 언덕 줄무늬
    twin(g, R, rand) {
      halo(g, R, '255,224,138', 1.3);
      sphere(g, R, '#f6cd8e', '#8a5428', '255,225,160', (g, R) => {
        g.lineCap = 'round';
        for (let i = 0; i < 18; i++) {
          const y0 = -R + (i + 0.5) * 2 * R / 18, amp = R * (0.03 + rand() * 0.05), f = 3 + rand() * 3, ph = rand() * TAU;
          g.strokeStyle = i % 2 ? 'rgba(150,85,40,0.35)' : 'rgba(255,238,195,0.3)';
          g.lineWidth = R * (0.025 + rand() * 0.04);
          g.beginPath();
          for (let x = -R; x <= R; x += R / 12) { const yy = y0 + Math.sin(x / R * f + ph) * amp; if (x === -R) g.moveTo(x, yy); else g.lineTo(x, yy); }
          g.stroke();
        }
        for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(110,60,25,0.35)'; blob(g, (rand() - 0.5) * 1.5 * R, (rand() - 0.5) * 1.4 * R, R * (0.06 + rand() * 0.1), rand, 8); g.fill(); }
      });
      return 1.3;
    },
    // 둥실둥실 버섯: 초록 공에 분홍·하늘색 빛 점
    shroom(g, R, rand) {
      halo(g, R, '125,255,154', 1.35);
      sphere(g, R, '#5ee29a', '#0f4a2e', '140,255,170', (g, R) => {
        for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(15,80,45,' + (0.3 + rand() * 0.25) + ')'; blob(g, (rand() - 0.5) * 1.8 * R, (rand() - 0.5) * 1.6 * R, R * (0.12 + rand() * 0.2), rand, 9); g.fill(); }
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
          const x = (rand() - 0.5) * 1.8 * R, y = (rand() - 0.5) * 1.8 * R, r = R * (0.03 + rand() * 0.06), col = rand() < 0.6 ? '255,154,232' : '106,240,255';
          const sg = g.createRadialGradient(x, y, 0, x, y, r * 2);
          sg.addColorStop(0, 'rgba(' + col + ',0.95)'); sg.addColorStop(0.4, 'rgba(' + col + ',0.5)'); sg.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = sg; g.beginPath(); g.arc(x, y, r * 2, 0, TAU); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      });
      return 1.35;
    },
    // 깜깜 떠돌이: 어두운 공, 테두리와 극지에만 오로라 빛
    rogue(g, R, rand) {
      halo(g, R, '106,255,200', 1.45);
      sphere(g, R, '#3a3a5a', '#08081a', '106,255,200', (g, R) => {
        for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(10,10,30,' + (0.3 + rand() * 0.3) + ')'; blob(g, (rand() - 0.5) * 1.7 * R, (rand() - 0.5) * 1.5 * R, R * (0.12 + rand() * 0.2), rand, 9); g.fill(); }
      });
      g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
      g.globalCompositeOperation = 'lighter';
      // 극지 오로라: 윗가장자리에 초록 빛이 번지고 보라로 옅어진다
      const ag = g.createRadialGradient(0, -R * 1.05, R * 0.1, 0, -R * 1.05, R * 0.85);
      ag.addColorStop(0, 'rgba(106,255,200,0.5)'); ag.addColorStop(0.45, 'rgba(106,255,200,0.22)'); ag.addColorStop(0.75, 'rgba(179,125,255,0.14)'); ag.addColorStop(1, 'rgba(179,125,255,0)');
      g.fillStyle = ag; g.fillRect(-R, -R, R * 2, R * 2);
      g.restore();
      g.globalCompositeOperation = 'source-over';
      return 1.5;
    },
  });

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
    // 외계 행성: 도감의 하늘 색(위·가운데·아래)을 옅게 깐다 (판 유리 아래라 판 위에서는 더 옅다)
    if (sky.tint) {
      const lg = g.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, sky.tint[0]); lg.addColorStop(0.55, sky.tint[1]); lg.addColorStop(1, sky.tint[2]);
      g.globalAlpha = 0.34; g.fillStyle = lg; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
    }
    let seed = 7;
    for (let i = 0; i < id.length; i++) seed = seed * 31 + id.charCodeAt(i);
    const rand = SN.rng(seed);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = rand() * w, y = rand() * h, rad = Math.max(w, h) * (0.25 + rand() * 0.35);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, i % 2 ? sky.a : sky.b); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = (sky.blob || 0.9) * (0.5 + rand() * 0.4);
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
    // 하늘에 뜬 해 (해님 둘 사막 행성): 빛 번짐 + 동그란 해. 가장자리 어둡게 한 뒤라 또렷하다
    if (art.suns) for (const [sx, sy, sr, col] of art.suns) {
      const x = sx * w, y = sy * h, r = Math.min(w, h) * sr;
      const sg = g.createRadialGradient(x, y, 0, x, y, r * 6);
      sg.addColorStop(0, 'rgba(' + col + ',0.9)'); sg.addColorStop(0.18, 'rgba(' + col + ',0.4)'); sg.addColorStop(1, 'rgba(' + col + ',0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = sg; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(' + col + ',1)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,252,240,0.95)'; g.beginPath(); g.arc(x, y, r * 0.75, 0, TAU); g.fill();
    }
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
    for (const k of Object.keys(sprites)) if (!keep.has(sprites[k]) && !k.startsWith('icon:') && !k.startsWith('wx:')) delete sprites[k];
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
    // 행성 날씨: 장면이 바뀌면 새 날씨로 (흐려지는 동안 천천히 나타난다)
    if (wx.id !== id || wx.key !== v.w + 'x' + v.h + ':' + (v.calm ? 1 : 0)) wxSetup(id, v);
    wxUpdate(v, Math.min(0.1, dt || 0));
    wxDraw(ctx, v, 1 - k);
  }
  // 장면이 흐려지며 넘어가는 중인가 (멈춘 화면에서 그리기를 쉬어도 되는지)
  const busy = () => bg.fade > 0;

  // ─── 행성 날씨 (그림만) ───────────────────────────────────────
  // 도감(common/worlds.js)의 kind·amount·wind·color대로. 판 뒤 하늘에 그려서 판의 어두운 유리 아래로 흐리게 비친다.
  // 입자 수: 1280×800에서 최대 WX_MAX개 (작은 화면은 비율대로 줄되 최소 60%), 움직임 줄이기면 40%로 줄고 절반 속도, 깜빡임·번개 없음.
  const WX_MAX = 84;
  const wx = { id: '', key: '', cfg: null, parts: [], t: 0, bolt: null, boltT: 3, extra: null };
  const weatherOf = id => (WL && WL.weatherOf(id)) || null;

  // 빛 알갱이 그림 (미리 한 번): 부드러운 동그라미 · 네 갈래 반짝이 · 유리 조각 · 방울 · 눈송이
  function dotSprite(col, r, core) {
    const key = 'wx:dot:' + col + ':' + r + ':' + core;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas'), half = Math.ceil(r);
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(half, half, 0, half, half, r);
    rg.addColorStop(0, 'rgba(' + col + ',1)'); rg.addColorStop(core, 'rgba(' + col + ',0.75)'); rg.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = rg; g.fillRect(0, 0, half * 2, half * 2);
    return (sprites[key] = { c, half });
  }
  function starSprite(col, r) {
    const key = 'wx:star:' + col + ':' + r;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas'), half = Math.ceil(r);
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.45);
    rg.addColorStop(0, 'rgba(' + col + ',0.9)'); rg.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r * 0.45, 0, TAU); g.fill();
    g.fillStyle = 'rgba(' + col + ',1)';
    for (const [sx, sy] of [[1, 0.16], [0.16, 1]]) { g.beginPath(); g.moveTo(-r * sx, 0); g.lineTo(0, -r * sy); g.lineTo(r * sx, 0); g.lineTo(0, r * sy); g.closePath(); g.fill(); }
    return (sprites[key] = { c, half });
  }
  function shardSprite(col, len) {
    const key = 'wx:shard:' + col + ':' + len;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas'), half = Math.ceil(len / 2) + 1;
    c.width = half * 2; c.height = 8;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, half * 2, 0);
    lg.addColorStop(0, 'rgba(' + col + ',0)'); lg.addColorStop(0.7, 'rgba(' + col + ',0.8)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(0, 4); g.lineTo(half * 1.5, 1.2); g.lineTo(half * 2, 4); g.lineTo(half * 1.5, 6.8); g.closePath(); g.fill();
    return (sprites[key] = { c, half, hy: 4 });
  }
  function ringSprite(col, r) {
    const key = 'wx:ring:' + col + ':' + r;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas'), half = Math.ceil(r) + 2;
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(' + col + ',0.85)'; g.lineWidth = Math.max(1, r * 0.16);
    g.beginPath(); g.arc(half, half, r, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(half - r * 0.35, half - r * 0.35, r * 0.2, 0, TAU); g.fill();
    return (sprites[key] = { c, half });
  }
  function flakeSprite(col, r) {
    const key = 'wx:flake:' + col + ':' + r;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas'), half = Math.ceil(r) + 1;
    c.width = c.height = half * 2;
    const g = c.getContext('2d');
    g.translate(half, half);
    g.strokeStyle = 'rgba(' + col + ',0.95)'; g.lineWidth = Math.max(1, r * 0.16); g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
      g.moveTo(0, 0); g.lineTo(ca * r, sa * r);
      const m = r * 0.55, b = r * 0.3;
      g.moveTo(ca * m, sa * m); g.lineTo(ca * m + Math.cos(a + 0.8) * b, sa * m + Math.sin(a + 0.8) * b);
      g.moveTo(ca * m, sa * m); g.lineTo(ca * m + Math.cos(a - 0.8) * b, sa * m + Math.sin(a - 0.8) * b);
    }
    g.stroke();
    return (sprites[key] = { c, half });
  }
  // 넓은 안개·모래 먼지·오로라 띠 (저해상도로 한 번)
  function hazeSprite(col, r) {
    const key = 'wx:haze:' + col + ':' + Math.round(r);
    if (sprites[key]) return sprites[key];
    const q = 0.25, c = document.createElement('canvas'), half = Math.ceil(r * q);
    c.width = half * 2; c.height = Math.ceil(half * 0.9);
    const g = c.getContext('2d');
    g.translate(half, c.height / 2); g.scale(1, 0.45);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, half);
    rg.addColorStop(0, 'rgba(' + col + ',0.55)'); rg.addColorStop(0.5, 'rgba(' + col + ',0.22)'); rg.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, half, 0, TAU); g.fill();
    return (sprites[key] = { c, half: half / q, hh: c.height / 2 / q });
  }
  function auroraSprite(c1, c2, w, h, seed) {
    const key = 'wx:aurora:' + c1 + c2 + ':' + Math.round(w) + 'x' + Math.round(h) + ':' + seed;
    if (sprites[key]) return sprites[key];
    const q = 0.25, c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * q)); c.height = Math.max(8, Math.round(h * q));
    const g = c.getContext('2d');
    g.scale(q, q);
    const rand = SN.rng(seed * 71 + 9);
    g.globalCompositeOperation = 'lighter';
    // 세로 커튼 줄을 물결 따라 촘촘히: 아래는 밝은 초록, 위로 갈수록 보라로 옅어진다
    const ph = rand() * TAU, f = 1.5 + rand() * 1.5;
    for (let x = 0; x < w; x += 6) {
      const k = x / w, base = h * (0.62 + Math.sin(k * TAU * f + ph) * 0.14 + Math.sin(k * TAU * 3.7 + ph * 2) * 0.05);
      const top = base - h * (0.3 + 0.25 * Math.abs(Math.sin(k * TAU * 2.2 + ph)));
      const edge = Math.min(1, k * 5, (1 - k) * 5);
      const lg = g.createLinearGradient(0, top, 0, base);
      lg.addColorStop(0, 'rgba(' + c2 + ',0)'); lg.addColorStop(0.55, 'rgba(' + c2 + ',' + (0.18 * edge) + ')'); lg.addColorStop(0.92, 'rgba(' + c1 + ',' + (0.42 * edge) + ')'); lg.addColorStop(1, 'rgba(' + c1 + ',0)');
      g.fillStyle = lg; g.fillRect(x, top, 7, base - top);
    }
    return (sprites[key] = { c, w, h });
  }

  function wxSetup(id, v) {
    const cfg = weatherOf(id);
    wx.id = id; wx.key = v.w + 'x' + v.h + ':' + (v.calm ? 1 : 0); wx.cfg = cfg; wx.parts = []; wx.bolt = null; wx.boltT = 2 + Math.random() * 2; wx.extra = null;
    if (!cfg) return;
    const w = v.w, h = v.h, area = Math.max(0.6, Math.min(1, (w * h) / (1280 * 800)));
    const kind = cfg.kind;
    let n = Math.round(WX_MAX * area * (0.3 + 0.7 * cfg.amount));
    if (kind === 'bolt') n = Math.round(n * 0.35);        // 폭풍: 번개가 주인공, 바람 알갱이는 조금
    if (kind === 'haze' || kind === 'aurora') n = Math.round(n * 0.3);   // 안개·오로라는 큰 그림이 주인공, 작은 반짝이만 조금
    if (v.calm) n = Math.round(n * 0.4);
    n = Math.min(90, n);
    const cols = cfg.color.map(rgbOf);
    for (let i = 0; i < n; i++) wx.parts.push(wxSpawn({}, v, true, i));
    if (kind === 'haze') {
      wx.extra = [];
      for (let i = 0; i < 5; i++) wx.extra.push({ x: Math.random() * w, y: h * (0.1 + 0.8 * Math.random()), r: Math.max(w, h) * (0.3 + Math.random() * 0.2), a: 0.5 + Math.random() * 0.4, sp: 0.6 + Math.random() * 0.8, col: cols[i % 2] });
    } else if (kind === 'sand') {
      wx.extra = [];
      for (let i = 0; i < 3; i++) wx.extra.push({ x: Math.random() * w, y: h * (0.2 + 0.7 * Math.random()), r: Math.max(w, h) * (0.35 + Math.random() * 0.2), a: 0.45 + Math.random() * 0.3, sp: 0.8 + Math.random() * 0.6, col: cols[i % 2] });
    } else if (kind === 'aurora') {
      wx.extra = [0, 1].map(i => ({ sp: auroraSprite(cols[0], cols[1], w * 1.1, h * 0.55, i + 1), y: h * (i ? 0.02 : 0.2), ph: i * 2.1, a: i ? 0.8 : 1 }));
    }
  }
  // 입자 하나 새로 (처음이면 화면 아무 데나, 아니면 들어오는 쪽 가장자리에서)
  function wxSpawn(p, v, first, i) {
    const cfg = wx.cfg, w = v.w, h = v.h, wind = cfg.wind || 0, r = Math.random();
    const slow = v.calm ? 0.5 : 1;
    p.ph = Math.random() * TAU; p.c = (i != null ? i : Math.floor(Math.random() * 7)) % 2; p.age = 0;
    p.x = Math.random() * w; p.y = Math.random() * h;
    switch (cfg.kind) {
      case 'snow':
        p.s = 1.6 + r * r * 3.4; p.big = cfg.amount >= 0.95 && Math.random() < 0.14;
        if (p.big) p.s = 4.5 + Math.random() * 3;
        p.vy = (26 + p.s * 9) * slow; p.vx = wind * (60 + p.s * 16) * slow; p.a = 0.55 + Math.random() * 0.4;
        if (!first) { if (Math.abs(p.vx) > p.vy && Math.random() < 0.5) { p.x = p.vx > 0 ? -8 : w + 8; } else { p.y = -10; p.x = Math.random() * (w + Math.abs(p.vx) * 2) - (p.vx > 0 ? p.vx * 2 : 0); } }
        break;
      case 'ember': {
        p.s = 1.5 + r * 2.5; p.vy = -(28 + Math.random() * 46) * slow; p.vx = wind * 30 * slow; p.max = 2.5 + Math.random() * 2.5; p.a = 0.7 + Math.random() * 0.3;
        // 절반은 판 테두리(아래·양옆 아래쪽)에서 피어오른다 (용암 빛이 테두리에 닿은 느낌). 나머지는 화면 아래에서
        if (v.bw && Math.random() < 0.55) {
          const e = Math.random();
          if (e < 0.5) { p.x = v.bx + Math.random() * v.bw; p.y = v.by + v.bh + 2; }
          else { p.x = e < 0.75 ? v.bx - 4 - Math.random() * 10 : v.bx + v.bw + 4 + Math.random() * 10; p.y = v.by + v.bh * (0.3 + Math.random() * 0.7); }
        } else if (!first) { p.y = h + 6; }
        p.life = first ? Math.random() * p.max : p.max;
        break;
      }
      case 'rain':
        p.s = 12 + r * 12; p.vy = (520 + Math.random() * 220) * slow; p.vx = wind * 260 * slow; p.a = 0.28 + Math.random() * 0.35;
        if (!first) { p.y = -p.s - Math.random() * 40; p.x = Math.random() * (w + 60) - wind * 60; }
        break;
      case 'glass':
        p.s = 10 + r * 14; p.vx = (260 + Math.random() * 260) * (wind >= 0 ? 1 : -1) * Math.max(0.4, Math.abs(wind)) * slow; p.vy = (50 + Math.random() * 70) * slow; p.a = 0.45 + Math.random() * 0.45;
        if (!first) { if (Math.random() < 0.8) { p.x = p.vx > 0 ? -20 : w + 20; } else { p.y = -10; } }
        break;
      case 'sparkle':
        p.s = 3 + r * 4; p.max = (v.calm ? 3 : 0.9) + Math.random() * (v.calm ? 1.5 : 1.3); p.life = first ? Math.random() * p.max : p.max; p.vx = 0; p.vy = 0; p.a = 0.8;
        break;
      case 'sand':
        p.s = r < 0.6 ? 1.5 : 2.5; p.vx = (220 + Math.random() * 240) * (wind >= 0 ? 1 : -1) * Math.max(0.3, Math.abs(wind)) * slow; p.vy = (Math.random() - 0.3) * 30 * slow; p.a = 0.35 + Math.random() * 0.45;
        if (!first) p.x = p.vx > 0 ? -4 : w + 4;
        break;
      case 'bubble':
        p.s = 2.5 + r * 5; p.vy = -(20 + Math.random() * 30) * slow; p.vx = wind * 20 * slow; p.a = 0.4 + Math.random() * 0.4;
        if (!first) p.y = h + 10;
        break;
      case 'spore':
        p.s = 2.5 + r * 3.5; p.vy = -(6 + Math.random() * 14) * slow; p.vx = wind * 24 * slow; p.a = 0.55 + Math.random() * 0.4;
        if (!first) { p.y = h + 8; p.x = Math.random() * w; }
        break;
      default:   // bolt의 바람 알갱이 · haze·aurora의 작은 반짝이
        p.s = cfg.kind === 'bolt' ? 1.5 + r * 1.5 : 2 + r * 2; p.vx = wind * (cfg.kind === 'bolt' ? 160 : 12) * slow; p.vy = (cfg.kind === 'bolt' ? 20 : 4) * slow; p.a = 0.35 + Math.random() * 0.35;
        if (!first) p.x = p.vx >= 0 ? -4 : w + 4;
    }
    return p;
  }
  // 번개 한 줄기 (위에서 아래로 지그재그, 곁가지 하나)
  function makeBolt(v) {
    const w = v.w, h = v.h;
    // 판 밖 여백(왼쪽·오른쪽)이나 위쪽에서 치게: 판 위를 가로지르지 않게 옆 여백 쪽을 고른다
    const side = Math.random() < 0.5;
    const x0 = side ? w * (0.02 + Math.random() * 0.12) : w * (0.86 + Math.random() * 0.12);
    const pts = [[x0, -10]];
    let x = x0, y = -10;
    const end = h * (0.35 + Math.random() * 0.4);
    while (y < end) { y += 16 + Math.random() * 26; x += (Math.random() - 0.5) * 38; pts.push([x, y]); }
    const k = Math.floor(pts.length / 2), br = [pts[k]];
    let bx = pts[k][0], by = pts[k][1];
    for (let i = 0; i < 4; i++) { by += 14 + Math.random() * 16; bx += (side ? 1 : -1) * (8 + Math.random() * 16); br.push([bx, by]); }
    return { pts, br, life: 0.32, max: 0.32, x: x0 };
  }

  function wxUpdate(v, dt) {
    const cfg = wx.cfg;
    if (!cfg) return;
    const w = v.w, h = v.h, t = bg.clock;
    for (const p of wx.parts) {
      p.age += dt;
      switch (cfg.kind) {
        case 'snow': p.x += (p.vx + Math.sin(t * 1.3 + p.ph) * 14) * dt; p.y += p.vy * dt; if (p.y > h + 10 || p.x < -20 || p.x > w + 20) wxSpawn(p, v, false); break;
        case 'ember': p.x += (p.vx + Math.sin(t * 2 + p.ph) * 10) * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0 || p.y < -10) wxSpawn(p, v, false); break;
        case 'sparkle': p.life -= dt; if (p.life <= 0) wxSpawn(p, v, false); break;
        case 'sand': p.x += p.vx * dt; p.y += (p.vy + Math.sin(t * 3 + p.ph) * 12) * dt; if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) wxSpawn(p, v, false); break;
        case 'spore': case 'bubble': p.x += (p.vx + Math.sin(t * 0.8 + p.ph) * 12) * dt; p.y += (p.vy + Math.cos(t * 0.6 + p.ph) * 5) * dt; if (p.y < -12 || p.x < -12 || p.x > w + 12) wxSpawn(p, v, false); break;
        default: p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > h + 30 || p.x < -30 || p.x > w + 30) wxSpawn(p, v, false);
      }
    }
    if (wx.extra && (cfg.kind === 'haze' || cfg.kind === 'sand')) for (const e of wx.extra) {
      e.x += (cfg.wind || 0.2) * (cfg.kind === 'sand' ? 70 : 14) * e.sp * (v.calm ? 0.5 : 1) * dt;
      if (e.x - e.r > w) e.x = -e.r; if (e.x + e.r < 0) e.x = w + e.r;
    }
    if (cfg.kind === 'bolt' && !v.calm) {
      if (wx.bolt) { wx.bolt.life -= dt; if (wx.bolt.life <= 0) wx.bolt = null; }
      else if ((wx.boltT -= dt) <= 0) { wx.bolt = makeBolt(v); wx.boltT = 3 + Math.random() * 4; }
    }
  }

  // 날씨 그리기 (판 뒤). a: 장면 흐려지기 비율
  function wxDraw(ctx, v, a) {
    const cfg = wx.cfg;
    if (!cfg || a <= 0.01) return;
    const t = bg.clock, calm = v.calm, cols = cfg.color.map(rgbOf), kind = cfg.kind;
    // 큰 그림 먼저 (안개·모래 먼지·오로라)
    if (wx.extra && (kind === 'haze' || kind === 'sand')) {
      ctx.globalCompositeOperation = 'lighter';
      for (const e of wx.extra) {
        const s = hazeSprite(e.col, e.r);
        ctx.globalAlpha = a * e.a * (kind === 'sand' ? 0.5 : 0.5);
        ctx.drawImage(s.c, e.x - s.half, e.y - s.hh, s.half * 2, s.hh * 2);
      }
    }
    if (kind === 'aurora' && wx.extra) {
      ctx.globalCompositeOperation = 'lighter';
      for (const e of wx.extra) {
        const sw = e.sp, dx = calm ? 0 : Math.sin(t * 0.07 + e.ph) * v.w * 0.04;
        ctx.globalAlpha = a * e.a * (calm ? 0.8 : 0.7 + 0.3 * Math.sin(t * 0.35 + e.ph));
        ctx.drawImage(sw.c, -v.w * 0.05 + dx, e.y, sw.w, sw.h);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    if (kind === 'rain' || kind === 'sand' || kind === 'bolt') {
      // 가는 줄·알갱이는 한 번에 칠한다
      if (kind === 'rain') {
        ctx.lineCap = 'round';
        for (let c = 0; c < 2; c++) {
          ctx.strokeStyle = 'rgba(' + cols[c] + ',1)'; ctx.lineWidth = c ? 1 : 1.6;
          ctx.globalAlpha = a * (c ? 0.45 : 0.35);
          ctx.beginPath();
          for (const p of wx.parts) if (p.c === c) { const k = p.s / Math.hypot(p.vx, p.vy); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k); }
          ctx.stroke();
        }
      } else {
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = 'rgba(' + cols[c] + ',1)';
          ctx.globalAlpha = a * (kind === 'bolt' ? 0.4 : 0.8);
          ctx.beginPath();
          for (const p of wx.parts) if (p.c === c) { if (kind === 'bolt') ctx.rect(p.x, p.y, p.s * 6, 1); else ctx.rect(p.x, p.y, p.s * 5, p.s); }
          ctx.fill();
        }
      }
    } else {
      for (const p of wx.parts) {
        let s, al = p.a;
        switch (kind) {
          case 'snow': s = p.big ? flakeSprite(cols[p.c], 6) : dotSprite(cols[p.c], 6, 0.35); break;
          case 'ember': {
            const k = p.life / p.max;
            s = dotSprite(p.c ? cols[1] : cols[0], 8, 0.25);
            al *= Math.min(1, k * 2.5, (1 - k) * 6 + 0.2) * (calm ? 1 : 0.7 + 0.3 * Math.sin(t * 9 + p.ph));
            break;
          }
          case 'glass': {
            const sh = shardSprite(cols[p.c], 24), ang = Math.atan2(p.vy, p.vx), sc = p.s / 24;
            ctx.globalAlpha = a * al;
            ctx.setTransform(v.dpr * Math.cos(ang) * sc, v.dpr * Math.sin(ang) * sc, -v.dpr * Math.sin(ang) * sc, v.dpr * Math.cos(ang) * sc, v.dpr * p.x, v.dpr * p.y);
            ctx.drawImage(sh.c, -sh.half * 2, -sh.hy);
            ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
            continue;
          }
          case 'sparkle': { const k = p.life / p.max; s = starSprite(cols[p.c], 8); al *= Math.sin(Math.PI * k); break; }
          case 'bubble': s = ringSprite(cols[p.c], 6); break;
          case 'spore': s = dotSprite(cols[p.c], 8, 0.3); al *= calm ? 1 : 0.65 + 0.35 * Math.sin(t * 1.7 + p.ph); break;
          default: s = starSprite(cols[p.c], 6); al *= calm ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.9 + p.ph);
        }
        const d = s.half * 2 * (p.s / (s.half * 0.9));
        ctx.globalAlpha = a * Math.max(0, al);
        ctx.drawImage(s.c, p.x - d / 2, p.y - d / 2, d, d);
      }
    }
    // 번개: 판 옆 여백에서 짧게 번쩍 (움직임 줄이기면 없음). 하늘도 아주 살짝 밝아진다
    if (wx.bolt) {
      const b = wx.bolt, k = b.life / b.max, fl = k > 0.6 ? 1 : k / 0.6;
      ctx.globalAlpha = a * 0.1 * fl;
      const fg = ctx.createRadialGradient(b.x, 0, 0, b.x, 0, v.h * 0.8);
      fg.addColorStop(0, 'rgba(' + cols[0] + ',1)'); fg.addColorStop(1, 'rgba(' + cols[0] + ',0)');
      ctx.fillStyle = fg; ctx.fillRect(0, 0, v.w, v.h);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [lw, al] of [[6, 0.25], [2, 0.95]]) {
        ctx.strokeStyle = 'rgba(' + (lw > 3 ? cols[1] : '255,255,255') + ',1)'; ctx.lineWidth = lw; ctx.globalAlpha = a * al * fl;
        ctx.beginPath();
        for (const line of [b.pts, b.br]) { ctx.moveTo(line[0][0], line[0][1]); for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ─── 판 테두리 꾸밈 (판 바깥에만, 판 칸은 가리지 않는다) ───────────
  // 행성마다: 얼음 행성은 테두리 위에 눈이 쌓이고 아래에 고드름, 용암 행성은 테두리 아래가 달아오른다 등
  const FRAME = {
    frost: 'ice', uranus: 'snowcap', neptune: 'snowcap', pluto: 'snowcap',
    lava: 'magma', mercury: 'heat',
    ocean: 'drops', earth: 'drops',
    mars: 'dune', twin: 'dune',
    gem: 'crystals', saturn: 'crystalsSmall',
    glass: 'shards', shroom: 'shrooms', rogue: 'glowrim',
  };
  const FM = 30;   // 꾸밈 그림 여백
  // 위 테두리에 쌓이는 눈 띠 (따로 그려서 시간이 지날수록 두꺼워진다)
  function capSprite(bw, hgt, seed) {
    const key = 'wx:cap:' + bw + ':' + hgt + ':' + seed;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas');
    c.width = Math.ceil(bw + 16); c.height = Math.ceil(hgt + 4);
    const g = c.getContext('2d'), rand = SN.rng(seed), base = c.height - 1;
    const lump = [];
    for (let x = 0; x <= c.width; x += 6) lump.push([x, base - hgt * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(x * 0.045 + seed)) * (0.7 + rand() * 0.3))]);
    // 가장자리는 얇게 (양 끝 8px에서 줄어든다)
    const edge = x => Math.min(1, x / 18, (c.width - x) / 18);
    g.beginPath(); g.moveTo(0, base);
    for (const [x, y] of lump) g.lineTo(x, base - (base - y) * Math.max(0, edge(x)));
    g.lineTo(c.width, base); g.closePath();
    const lg = g.createLinearGradient(0, base - hgt, 0, base);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.7, '#e6f6ff'); lg.addColorStop(1, '#9ccbeb');
    g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1; g.stroke();
    return (sprites[key] = { c, w: c.width, h: c.height });
  }
  function frameSprite(kind, v) {
    const bw = v.bw, bh = v.bh, cell = v.cell;
    const key = 'wx:frame:' + kind + ':' + bw + 'x' + bh + ':' + cell + ':' + Math.min(v.dpr || 1, 2);
    if (sprites[key]) return sprites[key];
    const q = Math.min(v.dpr || 1, 2), c = document.createElement('canvas');
    c.width = Math.ceil((bw + FM * 2) * q); c.height = Math.ceil((bh + FM * 2) * q);
    const g = c.getContext('2d');
    g.scale(q, q); g.translate(FM, FM);
    const rand = SN.rng(kind.length * 977 + bw);
    const L = -3, Rt = bw + 3, T = -3, B = bh + 3;   // 테두리 선 바로 바깥
    const room = FM - 4;
    const snowPile = (x, y, r, up) => {
      g.fillStyle = '#f4fbff';
      g.beginPath(); g.ellipse(x, y, r, r * 0.55, 0, up ? Math.PI : 0, up ? TAU : Math.PI); g.fill();
    };
    switch (kind) {
      case 'ice': {
        // 아래 테두리에 매달린 고드름 (판 바깥 아래로)
        for (let x = 10; x < bw - 6; x += 9 + rand() * 20) {
          const len = Math.min(room, 5 + rand() * 16), wd = 2.5 + rand() * 3.5;
          const lg = g.createLinearGradient(0, B, 0, B + len);
          lg.addColorStop(0, 'rgba(235,250,255,0.95)'); lg.addColorStop(1, 'rgba(150,215,255,0.25)');
          g.fillStyle = lg;
          g.beginPath(); g.moveTo(x - wd, B); g.lineTo(x + wd, B); g.lineTo(x + wd * 0.1, B + len); g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(240,250,255,0.95)'; g.fillRect(0, B - 1, bw, 3);
        // 양옆 테두리에 붙은 서리 알갱이
        g.fillStyle = 'rgba(220,245,255,0.8)';
        for (let i = 0; i < 70; i++) { const y = rand() * bh, sz = 1 + rand() * 2.5; g.fillRect((i % 2 ? Rt : L - sz) + (i % 2 ? rand() * 5 : -rand() * 5), y, sz, sz); }
        // 네 모서리 눈 더미
        for (const [x, y, up] of [[L, T, true], [Rt, T, true], [L, B, false], [Rt, B, false]]) snowPile(x, y, 14, up);
        break;
      }
      case 'snowcap':
        for (const [x, y, up] of [[L, T, true], [Rt, T, true]]) snowPile(x, y, 10, up);
        g.fillStyle = 'rgba(235,248,255,0.8)';
        for (let x = 6; x < bw; x += 14 + rand() * 30) { const r = 3 + rand() * 4; g.beginPath(); g.ellipse(x, B, r, r * 0.5, 0, 0, Math.PI); g.fill(); }
        break;
      case 'magma': case 'heat': {
        const hot = kind === 'magma';
        // 아래 테두리 밑이 달아오른다 + 양옆 아래쪽으로 번지는 빛
        const lg = g.createLinearGradient(0, B, 0, B + room);
        lg.addColorStop(0, hot ? 'rgba(255,170,60,0.95)' : 'rgba(255,190,110,0.5)'); lg.addColorStop(0.4, hot ? 'rgba(255,80,20,0.55)' : 'rgba(255,120,50,0.2)'); lg.addColorStop(1, 'rgba(255,40,0,0)');
        g.fillStyle = lg; g.fillRect(-FM, B, bw + FM * 2, room);
        for (const side of [0, 1]) {
          const x0 = side ? Rt : L, dir = side ? 1 : -1;
          const sg = g.createLinearGradient(x0, 0, x0 + dir * room, 0);
          sg.addColorStop(0, hot ? 'rgba(255,110,30,0.55)' : 'rgba(255,150,80,0.2)'); sg.addColorStop(1, 'rgba(255,60,0,0)');
          g.fillStyle = sg;
          // 위쪽은 옅게 시작해 아래로 갈수록 진하게 (칸을 나눠 칠한다)
          const y0 = bh * (hot ? 0.35 : 0.6), N = 14, step = (B - y0) / N;
          for (let i = 0; i < N; i++) { g.globalAlpha = Math.pow((i + 1) / N, 1.6); g.fillRect(side ? x0 : x0 - room, y0 + i * step, room, step + 0.5); }
          g.globalAlpha = 1;
        }
        if (hot) {
          // 테두리 밑에 흘러내린 용암 방울과 빛나는 틈
          g.lineCap = 'round';
          for (let x = 8; x < bw; x += 20 + rand() * 50) {
            const len = 4 + rand() * Math.min(12, room - 6);
            g.strokeStyle = 'rgba(255,200,80,0.95)'; g.lineWidth = 2 + rand() * 2;
            g.beginPath(); g.moveTo(x, B + 1); g.lineTo(x + (rand() - 0.5) * 3, B + len); g.stroke();
            g.fillStyle = '#ffd25a'; g.beginPath(); g.arc(x, B + len + 1, 2.2, 0, TAU); g.fill();
          }
          g.fillStyle = 'rgba(255,220,120,0.95)'; g.fillRect(0, B - 1, bw, 2.5);
        }
        break;
      }
      case 'drops': {
        // 위 테두리에 맺힌 물방울
        for (let x = 10; x < bw; x += 22 + rand() * 50) {
          const r = 1.5 + rand() * 2.5;
          g.fillStyle = 'rgba(170,230,255,0.75)'; g.beginPath(); g.arc(x, T - r * 0.6, r, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x - r * 0.4, T - r * 1.1, 1, 1);
        }
        for (let x = 14; x < bw; x += 30 + rand() * 60) {
          const len = 3 + rand() * 7;
          g.fillStyle = 'rgba(170,230,255,0.6)'; g.beginPath(); g.moveTo(x - 1.5, B); g.lineTo(x + 1.5, B); g.lineTo(x, B + len); g.closePath(); g.fill();
          g.beginPath(); g.arc(x, B + len + 1.5, 1.8, 0, TAU); g.fill();
        }
        break;
      }
      case 'dune': {
        // 아래 테두리 밑과 바람 부는 쪽(오른쪽) 모서리에 쌓인 모래
        const top = (x) => { const k = x / bw; return B + Math.max(1.5, (room - 4) * (0.12 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.03)) + Math.pow(k, 3) * 0.6)); };
        g.beginPath(); g.moveTo(-6, B + room);
        for (let x = -6; x <= bw + 14; x += 6) g.lineTo(x, B + room - (top(Math.max(0, Math.min(bw, x))) - B));
        g.lineTo(bw + 14, B + room); g.closePath();
        g.save(); g.clip();
        const lg = g.createLinearGradient(0, B, 0, B + room);
        lg.addColorStop(0, '#f4c98a'); lg.addColorStop(1, '#9a5a2a');
        g.fillStyle = lg; g.fillRect(-10, B, bw + 30, room);
        g.restore();
        // 오른쪽 옆 테두리에 붙은 모래 (위쪽까지 조금씩)
        g.fillStyle = 'rgba(240,195,130,0.7)';
        for (let i = 0; i < 60; i++) { const y = bh * Math.sqrt(rand()), sz = 1 + rand() * 2; g.fillRect(Rt + rand() * 4 * (y / bh + 0.3), y, sz, sz); }
        break;
      }
      case 'crystals': case 'crystalsSmall': {
        const big = kind === 'crystals';
        const cols2 = big ? ['#e6b3ff', '#b3f0ff', '#ffffff', '#b37dff'] : ['#fff1c2', '#f3d58c'];
        const cluster = (cx, cy, sx, sy) => {
          const n = big ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(sy, sx) + (i - (n - 1) / 2) * 0.35, len = (big ? 12 : 7) + rand() * (big ? 12 : 6), wd = (big ? 3.5 : 2.2) + rand() * 1.5;
            const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len, nx = -Math.sin(a) * wd, ny = Math.cos(a) * wd;
            g.fillStyle = cols2[i % cols2.length];
            g.globalAlpha = 0.85;
            g.beginPath(); g.moveTo(cx + nx, cy + ny); g.lineTo(ex - Math.cos(a) * wd + nx * 0.8, ey - Math.sin(a) * wd + ny * 0.8); g.lineTo(ex, ey); g.lineTo(ex - Math.cos(a) * wd - nx * 0.8, ey - Math.sin(a) * wd - ny * 0.8); g.lineTo(cx - nx, cy - ny); g.closePath(); g.fill();
            g.globalAlpha = 0.9; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
          }
          g.globalAlpha = 1;
        };
        cluster(L - 2, T - 2, -1, -1); cluster(Rt + 2, T - 2, 1, -1); cluster(L - 2, B + 2, -1, 1); cluster(Rt + 2, B + 2, 1, 1);
        if (big) for (let i = 0; i < 4; i++) { const x = bw * (0.2 + i * 0.2); cluster(x, B + 2, (rand() - 0.5) * 0.6, 1); }
        break;
      }
      case 'shards': {
        // 바람 부는 쪽(오른쪽) 테두리에 꽂힌 유리 조각
        for (let y = 10; y < bh - 6; y += 16 + rand() * 40) {
          const len = 8 + rand() * Math.min(16, room - 6), a = (rand() - 0.5) * 0.5;
          g.fillStyle = rand() < 0.5 ? 'rgba(223,243,255,0.85)' : 'rgba(127,178,255,0.8)';
          g.beginPath(); g.moveTo(Rt, y - 2.5); g.lineTo(Rt + Math.cos(a) * len, y + Math.sin(a) * len); g.lineTo(Rt, y + 2.5); g.closePath(); g.fill();
        }
        break;
      }
      case 'shrooms': {
        // 위·아래 테두리 바깥에 자라는 작은 빛 버섯
        const shroom = (x, y, up, sz, col) => {
          const d = up ? -1 : 1, stem = sz * 0.9;
          g.fillStyle = 'rgba(220,255,230,0.85)'; g.fillRect(x - sz * 0.14, up ? y - stem : y, sz * 0.28, stem);
          const cg = g.createRadialGradient(x, y + d * stem, 0, x, y + d * stem, sz * 1.4);
          cg.addColorStop(0, 'rgba(' + col + ',0.6)'); cg.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = cg; g.beginPath(); g.arc(x, y + d * stem, sz * 1.4, 0, TAU); g.fill();
          g.fillStyle = 'rgba(' + col + ',1)'; g.beginPath(); g.ellipse(x, y + d * stem, sz * 0.6, sz * 0.38, 0, up ? Math.PI : 0, up ? TAU : Math.PI); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x - sz * 0.2, y + d * stem + (up ? -sz * 0.22 : sz * 0.1), 1.5, 1.5);
        };
        for (let x = 14; x < bw - 8; x += 34 + rand() * 70) shroom(x, T, true, 6 + rand() * 5, rand() < 0.6 ? '255,154,232' : '106,240,255');
        for (let x = 20; x < bw - 8; x += 40 + rand() * 80) shroom(x, B, false, 5 + rand() * 4, rand() < 0.6 ? '179,255,200' : '255,154,232');
        break;
      }
      case 'glowrim': {
        // 떠돌이 행성: 판 둘레 바깥에 오로라 빛이 은은하게
        for (const [x0, y0, x1, y1, col, al] of [[0, T, 0, T - room, '106,255,200', 0.35], [0, B, 0, B + room * 0.5, '179,125,255', 0.2]]) {
          const lg = g.createLinearGradient(x0, y0, x1, y1);
          lg.addColorStop(0, 'rgba(' + col + ',' + al + ')'); lg.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = lg; g.fillRect(-4, Math.min(y0, y1), bw + 8, room);
        }
        break;
      }
    }
    return (sprites[key] = { c, w: bw + FM * 2, h: bh + FM * 2 });
  }
  // 테두리 꾸밈 그리기: render.js가 판(유리 바닥·테두리)을 그린 바로 뒤, 구슬·뱀보다 먼저 부른다
  function drawFrame(ctx, W, v) {
    if (!bg.cur || !v.bw) return;
    const id = bg.cur.id, kind = FRAME[id];
    if (!kind) return;
    const a = bg.prev ? 1 - bg.fade / FADE : 1;
    const s = frameSprite(kind, v);
    ctx.globalAlpha = a;
    ctx.drawImage(s.c, v.bx - FM, v.by - FM, s.w, s.h);
    // 눈은 시간이 지날수록 위 테두리에 두껍게 쌓인다 (움직임 줄이기면 처음부터 다 쌓인 모습)
    if (kind === 'ice' || kind === 'snowcap') {
      const full = Math.min(FM - 6, Math.max(5, v.cell * (kind === 'ice' ? 0.42 : 0.26)));
      const since = bg.clock - bg.cur.t0, grow = v.calm ? 1 : Math.min(1, 0.3 + since / 25);
      const cap = capSprite(Math.round(v.bw + 6), Math.round(full), kind === 'ice' ? 5 : 11), hh = cap.h * grow;
      ctx.drawImage(cap.c, v.bx - 3 - 8, v.by - 2 - hh, cap.w, hh);
    }
    // 바다 행성: 위 테두리에 빗방울이 톡톡 튄다 (움직임 줄이기면 없음)
    if (kind === 'drops' && !v.calm && wx.cfg && wx.cfg.kind === 'rain') {
      const t = bg.clock;
      ctx.strokeStyle = 'rgba(200,240,255,0.8)'; ctx.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const cyc = (t * 1.3 + i * 0.37) % 1, x = v.bx + ((i * 0.618 + Math.floor(t * 1.3 + i * 0.37) * 0.271) % 1) * v.bw;
        ctx.globalAlpha = a * (1 - cyc) * 0.8;
        ctx.beginPath(); ctx.ellipse(x, v.by - 3, 2 + cyc * 7, 1 + cyc * 2.5, 0, Math.PI, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

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

  SN.Space = { draw, drawFrame, icon, drawBanner, busy, weatherOf, frameOf: id => FRAME[id] || null, get particles() { return wx.parts.length; },
    ids: Object.keys(PLANET_ART).concat(Object.keys(OTHER_ART)) };
})(SN);
