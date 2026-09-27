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
      case 'arrow': {
        // 돌진이: 화살촉 모양. 예고·돌진 중엔 굳은 방향을, 아니면 가는 방향을 가리킨다
        const a = e.chWarn > 0 || e.chDash > 0 ? e.chA : Math.atan2(e.vy, e.vx), c = Math.cos(a), s = Math.sin(a);
        const pt = (fx, fy) => [x + c * fx * r - s * fy * r, y + s * fx * r + c * fy * r];
        ctx.beginPath();
        [[1.45, 0], [-1, -1], [-0.4, 0], [-1, 1]].forEach(([fx, fy], i) => { const q = pt(fx, fy); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        ctx.closePath();
        break;
      }
      case 'diamond': poly(ctx, x, y, r * 1.15, 4, 0); break;
      case 'square': poly(ctx, x, y, r * 1.2, 4, e.ang); break;
      case 'penta': poly(ctx, x, y, r * 1.1, 5, e.ang); break;
      case 'octa': poly(ctx, x, y, r, 8, e.ang * 0.3); break;
      default: ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    }
  }

  // ─── 배경: 태양계 여행 (2026-09-27) ───────────────────────
  // 층: ①하늘(저해상도로 미리 그려 늘려 찍음, 성운·해 빛·가장자리 어둡게) ②별 3겹 시차 스크롤
  //     ③행성(한 번만 그려 둔 그림을 천천히 흘려 찍음) 또는 블랙홀(원반 그림 + 도는 소용돌이 + 빨려 드는 빛 알갱이)
  //     ④행성마다 다른 먼지(모래·얼음 반짝이·바람 줄기) ⑤네온 격자(미리 그림, 큰 폭발 때 번쩍)
  // 웨이브 2개마다 다음 행성 (world.js placeOf). 보스 웨이브는 그 행성 하늘에 보스 색 성운을 겹친다.
  // 장면이 바뀌면 1.5초에 걸쳐 앞 장면이 흐려지며 넘어간다. 움직임 줄이기면 별·먼지·행성·소용돌이가 멈춰 있다.

  // 행성 그림 설정. sky: 하늘색(base·성운 a·b) · grid: 격자 색 · pos: 화면 비율 위치 · size: 화면 짧은 변 대비 지름
  // atm: 가장자리 대기 빛 · dust: 먼지 종류와 색 · sun: 해 빛(왼쪽 위) 세기
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
  const HOLE_ART = { sky: { base: '#020104', a: '#2a0a3a', b: '#1a0a14' }, grid: '190,140,255', dust: ['swirl', '220,180,255'] };

  // 장면 객체는 같은 것을 돌려줘야 다시 그리지 않는다 (행성 · 보스 · 블랙홀 조합마다 하나)
  const scenes = {};
  const bossOf = W => W.enemies.find(e => e.type === 'boss');
  function sceneFor(W) {
    const place = W.place || NG.World.placeOf(W.wave);
    const pl = place.planet;
    const boss = W.bossWave && bossOf(W);
    const look = boss ? (boss.look || D.BOSSES[0]) : null;
    const key = W.hole ? 'hole' : pl.id + (look ? ':' + look.id : '');
    if (!scenes[key]) {
      const art = W.hole ? HOLE_ART : PLANET_ART[pl.id];
      scenes[key] = { key, id: W.hole ? 'hole' : pl.id, art, look, hole: !!W.hole,
        grid: look ? look.theme.grid : art.grid };
    }
    return scenes[key];
  }

  // 하늘: 1/4 해상도 캔버스에 흐릿한 빛 덩어리 몇 개 + 해 빛 + 가장자리 어둡게
  function paintBackdrop(sc, w, h) {
    const s = 0.25, sky = sc.art.sky;
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * s)); c.height = Math.max(8, Math.round(h * s));
    const g = c.getContext('2d');
    g.scale(s, s);
    g.fillStyle = sky.base;
    g.fillRect(0, 0, w, h);
    let seed = 7;
    for (let i = 0; i < sc.key.length; i++) seed = seed * 31 + sc.key.charCodeAt(i);
    const rand = NG.rng(seed);
    g.globalCompositeOperation = 'lighter';
    const blobs = (a, b, n, alpha) => {
      for (let i = 0; i < n; i++) {
        const x = rand() * w, y = rand() * h, rad = Math.max(w, h) * (0.25 + rand() * 0.35);
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, i % 2 ? a : b);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = alpha * (0.5 + rand() * 0.4);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }
    };
    blobs(sky.a, sky.b, 4, 0.9);
    // 보스 웨이브: 보스 색 성운을 겹친다 (행성은 그대로 보인다)
    if (sc.look) blobs(sc.look.theme.a, sc.look.theme.b, 4, 1);
    // 해 빛: 왼쪽 위에서 (수성은 아주 가깝고 크다, 멀어질수록 작아진다)
    const sun = sc.art.sun || 0;
    if (sun > 0) {
      const R = Math.max(w, h) * (0.25 + 0.55 * sun);
      const grad = g.createRadialGradient(-w * 0.04, -h * 0.06, 0, -w * 0.04, -h * 0.06, R);
      grad.addColorStop(0, 'rgba(255,245,220,' + (0.5 + 0.5 * sun) + ')');
      grad.addColorStop(0.25, 'rgba(255,200,120,' + (0.35 * sun + 0.1) + ')');
      grad.addColorStop(1, 'rgba(255,150,60,0)');
      g.globalAlpha = 1;
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
    const rand = NG.rng(id.length * 131 + 17);
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
    const rand = NG.rng(idx * 97 + 5);
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
  // 행성마다 다른 먼지 알갱이 (자리·빠르기·크기만 정해 두고 시간으로 흘린다)
  function makeDust(w, h) {
    const rand = NG.rng(777);
    const n = Math.max(12, Math.round(44 * (w * h) / (1280 * 800)));
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: rand() * w, y: rand() * h, s: 0.5 + rand(), ph: rand() * TAU, a: rand() * TAU, r: 0.15 + rand() * 0.85 });
    return out;
  }

  const bg = { w: 0, h: 0, dpr: 0, cur: null, prev: null, fade: 0, grid: null, stars: null, dust: null, last: 0, clock: 0 };

  // 장면 한 겹 만들기: 하늘 그림 + 격자 + 행성(또는 블랙홀) 크기·자리
  function buildLayer(sc, W, dpr) {
    const L = { sc, backdrop: paintBackdrop(sc, W.w, W.h), t0: bg.clock };
    const q = Math.min(dpr, 1.25); // 배경 그림은 화질을 조금 낮춰 기억을 아낀다
    const m = Math.min(W.w, W.h);
    if (sc.hole) {
      L.hx = W.hole ? W.hole.fx : 0.5; L.hy = W.hole ? W.hole.fy : 0.5;
      L.R = NG.clamp(m * 0.24, 90, 200);
      L.sprite = holeSprite(L.R, q);
      L.swirl = swirlSprite(Math.max(W.w, W.h) * 0.42);
    } else {
      const art = sc.art;
      L.R = m * art.size / 2;
      L.sprite = planetSprite(sc.id, L.R, q);
      L.moons = (MOONS[sc.id] || []).map((mo, i) => ({ mo, sp: moonSprite(mo, L.R, q, i, sc.id) }));
    }
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W.w * dpr)); c.height = Math.max(1, Math.round(W.h * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    paintGrid(g, W.w, W.h, sc.grid);
    L.grid = c;
    return L;
  }
  // 쓰지 않는 그림은 버린다 (지금 장면·흐려지는 앞 장면 것만 남김)
  function pruneSprites() {
    const keep = new Set();
    for (const L of [bg.cur, bg.prev]) {
      if (!L) continue;
      keep.add(L.sprite); if (L.swirl) keep.add(L.swirl);
      if (L.moons) for (const m of L.moons) keep.add(m.sp);
    }
    for (const k of Object.keys(sprites)) if (!keep.has(sprites[k])) delete sprites[k];
  }

  // 행성: 자리(pos) + 천천히 지나가기(도착 뒤 초당 2px, 최대 90px) + 플레이어 반대쪽 시차
  function drawPlanet(ctx, W, L, px, py, t, alpha) {
    const art = L.sc.art;
    const since = Math.max(0, t - L.t0);
    const pass = Math.min(90, since * 2);
    const cx = art.pos[0] * W.w - pass + px * 0.03, cy = art.pos[1] * W.h + pass * 0.3 + py * 0.03;
    const dim = L.sc.id === 'pluto' ? 0.8 : 0.92;
    ctx.globalAlpha = alpha * dim;
    const s = L.sprite;
    ctx.drawImage(s.c, cx - s.half, cy - s.half, s.half * 2, s.half * 2);
    // 달은 행성 둘레를 아주 천천히 돈다
    if (L.moons) for (let i = 0; i < L.moons.length; i++) {
      const { mo, sp } = L.moons[i];
      const a = mo.a + t * 0.012 * (i % 2 ? -1 : 1);
      const mx = cx + Math.cos(a) * L.R * mo.d, my = cy + Math.sin(a) * L.R * mo.d * 0.9;
      ctx.drawImage(sp.c, mx - sp.half, my - sp.half, sp.half * 2, sp.half * 2);
    }
    ctx.globalAlpha = 1;
  }

  // 블랙홀: 소용돌이 팔이 돌고, 빛 알갱이가 빙글빙글 빨려 든다
  function drawHole(ctx, W, L, t, alpha, calm) {
    const hx = L.hx * W.w, hy = L.hy * W.h;
    const sw = L.swirl;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(hx, hy);
    ctx.rotate(calm ? 0 : -t * 0.5);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sw.c, -sw.half, -sw.half, sw.half * 2, sw.half * 2);
    ctx.restore();
    // 빨려 드는 빛 알갱이: 먼 곳에서 나선을 그리며 가운데로 (움직임 줄이기면 멈춰 있다)
    const far = Math.max(W.w, W.h) * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#e8d2ff';
    for (const d of bg.dust) {
      const life = calm ? d.r : 1 - ((t * 0.09 * (0.6 + d.s * 0.5) + d.r) % 1);
      const r = L.R * 0.25 + far * life;
      const a = d.a + (calm ? 0 : t * 0.35) + 2.6 / (life + 0.15);
      const x = hx + Math.cos(a) * r, y = hy + Math.sin(a) * r * 0.8;
      ctx.globalAlpha = alpha * Math.min(1, (1 - life) * 1.6) * 0.8;
      const sz = 1.2 + d.s * 1.6;
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    const s = L.sprite;
    ctx.drawImage(s.c, hx - s.half, hy - s.half, s.half * 2, s.half * 2);
    ctx.globalAlpha = 1;
  }

  // 먼지: 수성 불씨(해에서 흘러옴) · 금성 안개 알갱이 · 화성 모래 · 토성·천왕성 얼음 반짝이 · 해왕성 바람 줄기 · 명왕성 눈
  function drawDust(ctx, W, sc, t, px, py) {
    const kind = sc.art.dust[0], rgb = sc.art.dust[1];
    if (kind === 'star' || kind === 'swirl') return;
    const w = W.w, h = W.h;
    ctx.fillStyle = 'rgb(' + rgb + ')';
    ctx.strokeStyle = 'rgb(' + rgb + ')';
    for (const d of bg.dust) {
      let vx = 0, vy = 0, a = 0.35, size = 1.5 + d.s * 1.5;
      if (kind === 'ember') { vx = 26 * d.s; vy = 18 * d.s; a = 0.3 + 0.3 * Math.sin(t * 3 + d.ph); }
      else if (kind === 'haze') { vx = 8 * d.s; vy = -4 * d.s; a = 0.16; size = 3 + d.s * 3; }
      else if (kind === 'sand') { vx = -40 * d.s; vy = 6 * d.s; a = 0.32; }
      else if (kind === 'ice') { vx = -6 * d.s; vy = 4 * d.s; a = Math.max(0, Math.sin(t * 2.2 + d.ph)) * 0.7; }
      else if (kind === 'snow') { vx = -5 * d.s; vy = 14 * d.s; a = 0.4; size = 1.2 + d.s; }
      else if (kind === 'wind') { vx = -170 * d.s - 60; vy = 0; a = 0.22; }
      let x = (d.x + vx * t + px * 0.05) % w; if (x < 0) x += w;
      let y = (d.y + vy * t + py * 0.05) % h; if (y < 0) y += h;
      ctx.globalAlpha = a;
      if (kind === 'wind') {
        ctx.lineWidth = 1 + d.s;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + d.s * 50, y); ctx.stroke();
      } else ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawBackground(ctx, W, dpr, calm) {
    const sc = sceneFor(W);
    const now = performance.now();
    const rdt = Math.min(0.1, (now - (bg.last || now)) / 1000);
    bg.last = now;
    if (!calm) bg.clock += rdt; // 움직임 줄이기면 배경 시계가 멈춘다
    const t = bg.clock;
    const sizeChanged = bg.w !== W.w || bg.h !== W.h || bg.dpr !== dpr;
    if (sizeChanged) {
      bg.w = W.w; bg.h = W.h; bg.dpr = dpr;
      bg.stars = makeStars(W.w, W.h);
      bg.dust = makeDust(W.w, W.h);
      bg.cur = null; bg.prev = null;
      for (const k of Object.keys(sprites)) delete sprites[k];
    }
    // 블랙홀이 같은 장면이라도 자리가 바뀌면 다시 만든다
    const holeMoved = bg.cur && sc.hole && W.hole && (bg.cur.hx !== W.hole.fx || bg.cur.hy !== W.hole.fy);
    if (!bg.cur || bg.cur.sc !== sc || holeMoved) {
      // 장면이 바뀌면 1.5초에 걸쳐 새 장면으로 넘어간다
      if (bg.cur && !sizeChanged) { bg.prev = bg.cur; bg.fade = 1; }
      bg.cur = buildLayer(sc, W, dpr);
      pruneSprites();
    }

    // 플레이어 위치에 따라 배경이 살짝 반대로 밀린다 (깊이감)
    const p = W.player;
    const px = W.w / 2 - p.x, py = W.h / 2 - p.y;
    const m = 24;
    const cur = bg.cur, prev = bg.prev && bg.fade > 0 ? bg.prev : null;
    if (prev) ctx.drawImage(prev.backdrop, -m + px * 0.01, -m + py * 0.01, W.w + m * 2, W.h + m * 2);
    ctx.globalAlpha = prev ? 1 - bg.fade : 1;
    ctx.drawImage(cur.backdrop, -m + px * 0.01, -m + py * 0.01, W.w + m * 2, W.h + m * 2);
    ctx.globalAlpha = 1;

    // 별: 천천히 흘러가고 반짝인다. 가까운 층일수록 빠르고 크다 (블랙홀 근처는 조금 어둡게)
    ctx.fillStyle = '#e8f7ff';
    const dimStars = sc.hole ? 0.6 : 1;
    for (const L of bg.stars) {
      const ox = px * L.par - t * L.drift * 0.35, oy = py * L.par + t * L.drift;
      for (const s of L.stars) {
        let x = (s.x + ox) % W.w; if (x < 0) x += W.w;
        let y = (s.y + oy) % W.h; if (y < 0) y += W.h;
        ctx.globalAlpha = L.alpha * dimStars * (0.65 + 0.35 * Math.sin(t * 2 + s.ph));
        ctx.fillRect(x, y, L.size, L.size);
      }
    }
    ctx.globalAlpha = 1;

    // 행성 또는 블랙홀 (앞 장면은 흐려지며 사라진다)
    const layer = (L, a) => { if (L.sc.hole) drawHole(ctx, W, L, t, a, calm); else drawPlanet(ctx, W, L, px, py, t, a); };
    if (prev) layer(prev, bg.fade);
    layer(cur, prev ? 1 - bg.fade : 1);
    if (prev) { bg.fade -= rdt / 1.5; if (bg.fade <= 0) { bg.prev = null; pruneSprites(); } }
    drawDust(ctx, W, sc, t, px, py);

    // 격자: 웨이브가 오를수록 조금 선명해지고, 큰 폭발 때 번쩍인다
    const tier = Math.min(3, Math.floor((W.wave - 1) / 5));
    ctx.globalAlpha = 0.55 + tier * 0.08;
    ctx.drawImage(cur.grid, 0, 0, W.w, W.h);
    if (W.pulse > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, W.pulse * 1.4);
      ctx.drawImage(cur.grid, 0, 0, W.w, W.h);
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

  // ─── 행성 적 그림 (2026-09-27) ─────────────────────────────
  // 몸은 처음 한 번만 캔버스에 그려 두고(발광·광택 포함, shadowBlur 없음) 매 프레임 찍기만 한다.
  // 맞았을 때 번쩍임은 흰 실루엣 그림을 따로 만들어 둔다. 선명하게 2배 크기로 그린다
  const FOE_SC = 2;
  const foeCache = {};
  function foeSprite(key, size, paint) {
    let c = foeCache[key];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * FOE_SC);
    const g = c.getContext('2d');
    g.scale(FOE_SC, FOE_SC);
    g.translate(size / 2, size / 2);
    paint(g);
    c.size = size;
    foeCache[key] = c;
    return c;
  }
  function whiteOf(key, src) {
    let c = foeCache[key + ':w'];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = src.width; c.height = src.height; c.size = src.size;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    foeCache[key + ':w'] = c;
    return c;
  }
  function softGlow(g, r, rgb, a) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  function radial(g, r, stops, ox, oy) {
    const gr = g.createRadialGradient((ox || 0) * r, (oy || 0) * r, r * 0.05, 0, 0, r);
    stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
    return gr;
  }

  // 종류별 몸 그림. r: 적 반지름. 돌려주는 값: [그림 크기(px), 그리기 함수]
  const FOE_ART = {
    // 태양 불씨: 흰 속 + 노랑·주황 불덩이, 뒤로 끌리는 불꼬리 (오른쪽이 앞)
    ember: r => [r * 7, g => {
      softGlow(g, r * 3.2, '255,150,50', 0.5);
      const tail = g.createLinearGradient(r, 0, -r * 3.2, 0);
      tail.addColorStop(0, 'rgba(255,220,120,0.95)'); tail.addColorStop(0.5, 'rgba(255,120,40,0.6)'); tail.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = tail;
      g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(-r * 1.6, -r * 0.7, -r * 3.2, 0); g.quadraticCurveTo(-r * 1.6, r * 0.7, 0, r); g.closePath(); g.fill();
      g.fillStyle = radial(g, r, ['#ffffff', '#ffe27a', '#ff9a2e', '#e8551a'], 0.25, -0.2);
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    }],
    // 산성 구름: 연두 뭉게구름 + 떨어지는 방울 + 찡그린 눈
    acid: r => [r * 3.6, g => {
      softGlow(g, r * 1.7, '200,240,74', 0.35);
      g.fillStyle = '#7fae22';
      for (const [x, y, s] of [[-0.45, 0.75, 0.2], [0.1, 0.9, 0.24], [0.55, 0.7, 0.18]]) {
        g.beginPath(); g.moveTo(x * r, (y - 0.35) * r); g.quadraticCurveTo((x + s) * r, (y + 0.05) * r, x * r, (y + s) * r); g.quadraticCurveTo((x - s) * r, (y + 0.05) * r, x * r, (y - 0.35) * r); g.fill();
      }
      const puffs = [[0, 0.05, 0.78], [-0.62, 0.2, 0.55], [0.64, 0.18, 0.56], [-0.32, -0.42, 0.55], [0.34, -0.4, 0.52]];
      g.fillStyle = '#6a9a18';
      for (const [x, y, s] of puffs) { g.beginPath(); g.arc(x * r, y * r + r * 0.08, s * r, 0, TAU); g.fill(); }
      g.fillStyle = radial(g, r * 1.2, ['#f4ffb8', '#c8f04a', '#8fc22a'], -0.3, -0.5);
      for (const [x, y, s] of puffs) { g.beginPath(); g.arc(x * r, y * r, s * r, 0, TAU); g.fill(); }
      g.fillStyle = '#2b3a0a';
      for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * r * 0.3, r * 0.08, r * 0.13, r * 0.09, sx * 0.35, 0, TAU); g.fill(); }
    }],
    // 인공위성: 은빛 몸통 + 양옆 파란 태양 전지판 + 앞쪽 접시 (오른쪽이 앞)
    sat: r => [r * 5, g => {
      softGlow(g, r * 1.8, '159,216,255', 0.35);
      for (const sy of [-1, 1]) {
        g.fillStyle = '#9aa7b8'; g.fillRect(-r * 0.12, sy > 0 ? r * 0.55 : -r * 0.85, r * 0.24, r * 0.3);
        const y0 = sy > 0 ? r * 0.85 : -r * 2.25;
        g.fillStyle = '#1d4f9e'; g.fillRect(-r * 0.55, y0, r * 1.1, r * 1.4);
        g.strokeStyle = '#7fc2ff'; g.lineWidth = 1;
        g.strokeRect(-r * 0.55, y0, r * 1.1, r * 1.4);
        g.beginPath();
        for (let i = 1; i < 4; i++) { g.moveTo(-r * 0.55, y0 + r * 0.35 * i); g.lineTo(r * 0.55, y0 + r * 0.35 * i); }
        g.moveTo(0, y0); g.lineTo(0, y0 + r * 1.4);
        g.stroke();
      }
      g.fillStyle = radial(g, r * 0.8, ['#ffffff', '#c9d6e6', '#6f7f96'], -0.3, -0.4);
      g.beginPath(); g.roundRect ? g.roundRect(-r * 0.62, -r * 0.62, r * 1.24, r * 1.24, r * 0.2) : g.rect(-r * 0.62, -r * 0.62, r * 1.24, r * 1.24); g.fill();
      g.fillStyle = '#e8f4ff';
      g.beginPath(); g.ellipse(r * 0.85, 0, r * 0.28, r * 0.55, 0, 0, TAU); g.fill();
      g.strokeStyle = '#9fd8ff'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(r * 0.85, 0); g.lineTo(r * 1.35, 0); g.stroke();
      g.fillStyle = '#ff5d5d'; g.beginPath(); g.arc(r * 1.38, 0, r * 0.12, 0, TAU); g.fill();
    }],
    // 모래 벌레 (밖에 나왔을 때): 마디진 둥근 머리 + 가운데 입과 이빨
    worm: r => [r * 3.2, g => {
      softGlow(g, r * 1.5, '224,130,79', 0.3);
      g.fillStyle = radial(g, r * 1.05, ['#ffc59a', '#e0824f', '#8a4424'], -0.3, -0.4);
      g.beginPath(); g.arc(0, 0, r * 1.05, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(90,40,20,0.6)'; g.lineWidth = 1.6;
      for (const k of [0.85, 0.7]) { g.beginPath(); g.arc(0, 0, r * k, 0, TAU); g.stroke(); }
      g.fillStyle = '#2a0f08';
      g.beginPath(); g.arc(0, 0, r * 0.55, 0, TAU); g.fill();
      g.fillStyle = '#fff1dc';
      for (let i = 0; i < 8; i++) {
        const a = TAU * i / 8, c = Math.cos(a), s = Math.sin(a);
        g.beginPath(); g.moveTo(c * r * 0.56 - s * r * 0.12, s * r * 0.56 + c * r * 0.12); g.lineTo(c * r * 0.56 + s * r * 0.12, s * r * 0.56 - c * r * 0.12); g.lineTo(c * r * 0.3, s * r * 0.3); g.closePath(); g.fill();
      }
    }],
    // 모래 더미 (땅속): 흙무더기와 자갈
    mound: r => [r * 3.4, g => {
      g.fillStyle = 'rgba(40,18,8,0.45)';
      g.beginPath(); g.ellipse(0, r * 0.25, r * 1.5, r * 0.9, 0, 0, TAU); g.fill();
      g.fillStyle = radial(g, r * 1.3, ['#f2b27c', '#c0703f', '#7a3c1c'], -0.2, -0.5);
      for (const [x, y, s] of [[0, 0, 1], [-0.7, 0.25, 0.6], [0.7, 0.22, 0.62], [0.2, -0.45, 0.55]]) { g.beginPath(); g.ellipse(x * r, y * r, s * r * 1.05, s * r * 0.75, 0, 0, TAU); g.fill(); }
      g.fillStyle = '#5a2c14';
      for (const [x, y] of [[-0.4, -0.1], [0.3, 0.2], [0.75, -0.1], [-0.8, 0.45], [0.05, 0.55]]) { g.beginPath(); g.arc(x * r, y * r, r * 0.1, 0, TAU); g.fill(); }
    }],
    // 번개 구름: 보랏빛 먹구름 + 가운데 노란 번개
    zap: r => [r * 3.6, g => {
      softGlow(g, r * 1.7, '201,182,255', 0.35);
      const puffs = [[0, 0.1, 0.8], [-0.66, 0.22, 0.55], [0.66, 0.2, 0.56], [-0.3, -0.42, 0.58], [0.36, -0.38, 0.52]];
      g.fillStyle = '#3a3158';
      for (const [x, y, s] of puffs) { g.beginPath(); g.arc(x * r, y * r + r * 0.1, s * r, 0, TAU); g.fill(); }
      g.fillStyle = radial(g, r * 1.2, ['#e9e2ff', '#9a8cc8', '#5b4f7a'], -0.3, -0.5);
      for (const [x, y, s] of puffs) { g.beginPath(); g.arc(x * r, y * r, s * r, 0, TAU); g.fill(); }
      g.fillStyle = '#ffe45c'; g.strokeStyle = '#8a6a00'; g.lineWidth = 1;
      g.beginPath();
      [[0.12, -0.55], [-0.25, 0.08], [0.02, 0.08], [-0.14, 0.62], [0.3, -0.05], [0.04, -0.05]].forEach(([x, y], i) => (i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r)));
      g.closePath(); g.fill(); g.stroke();
    }],
    // 고리 조각: 울퉁불퉁한 금빛 얼음 바위
    shard: r => [r * 3.4, g => {
      softGlow(g, r * 1.6, '243,213,140', 0.35);
      const pts = [[1.3, 0.1], [0.7, 0.75], [-0.2, 0.9], [-1.1, 0.45], [-1.25, -0.3], [-0.4, -0.85], [0.6, -0.7]];
      g.fillStyle = radial(g, r * 1.3, ['#fff6d8', '#f3d58c', '#b58a3c', '#6e5424'], -0.3, -0.4);
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r))); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-0.6 * r, -0.4 * r); g.lineTo(0.5 * r, -0.45 * r); g.moveTo(-0.3 * r, 0.3 * r); g.lineTo(0.7 * r, 0.1 * r); g.stroke();
      g.strokeStyle = 'rgba(80,55,20,0.6)';
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r))); g.closePath(); g.stroke();
    }],
    // 얼음 결정: 여섯 갈래 눈꽃 + 가운데 육각
    ice: r => [r * 3.2, g => {
      softGlow(g, r * 1.6, '191,246,255', 0.4);
      g.strokeStyle = '#bff6ff'; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = TAU * i / 6, c = Math.cos(a), s = Math.sin(a);
        g.lineWidth = r * 0.28;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(c * r * 1.2, s * r * 1.2); g.stroke();
        g.lineWidth = r * 0.14;
        for (const side of [-1, 1]) { const b = a + side * 0.7; g.beginPath(); g.moveTo(c * r * 0.75, s * r * 0.75); g.lineTo(c * r * 0.75 + Math.cos(b) * r * 0.35, s * r * 0.75 + Math.sin(b) * r * 0.35); g.stroke(); }
      }
      g.fillStyle = radial(g, r * 0.7, ['#ffffff', '#c8f7ff', '#6fcfe6'], -0.3, -0.4);
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = TAU * i / 6 + Math.PI / 6; g.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); } g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
      g.beginPath(); for (let i = 0; i < 3; i++) { const a = TAU * i / 6 + Math.PI / 6; g.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); g.lineTo(-Math.cos(a) * r * 0.7, -Math.sin(a) * r * 0.7); } g.stroke();
    }],
    // 얼음 조각: 작은 세모 얼음 (오른쪽이 앞)
    iceBit: r => [r * 3.4, g => {
      softGlow(g, r * 1.6, '230,251,255', 0.4);
      g.fillStyle = radial(g, r * 1.3, ['#ffffff', '#d6f8ff', '#7fd6ea'], -0.2, -0.3);
      g.beginPath(); g.moveTo(r * 1.3, 0); g.lineTo(-r * 0.8, -r * 0.8); g.lineTo(-r * 0.4, 0); g.lineTo(-r * 0.8, r * 0.8); g.closePath(); g.fill();
    }],
    // 폭풍 드론: 짙은 파란 구슬에 흰 소용돌이 팔 셋
    storm: r => [r * 3.4, g => {
      softGlow(g, r * 1.7, '111,168,255', 0.4);
      g.fillStyle = radial(g, r, ['#bcd6ff', '#4f7fe0', '#132a66'], -0.3, -0.4);
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = r * 0.16; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        for (let k = 0; k <= 10; k++) { const t = k / 10, a = TAU * i / 3 + t * 2.4, rr = r * (0.15 + t * 0.95); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
      }
      g.fillStyle = '#0a1840'; g.beginPath(); g.arc(0, 0, r * 0.2, 0, TAU); g.fill();
    }],
    // 하트 유령: 위는 하트, 아래는 물결 치마, 눈과 볼
    ghost: r => [r * 3.4, g => {
      softGlow(g, r * 1.7, '255,179,217', 0.4);
      g.fillStyle = radial(g, r * 1.3, ['#ffffff', '#ffd1e8', '#ff8cc6'], -0.3, -0.5);
      g.beginPath();
      g.moveTo(0, -r * 0.45);
      g.bezierCurveTo(-r * 0.2, -r * 1.25, -r * 1.25, -r * 1.05, -r * 1.05, -r * 0.1);
      g.lineTo(-r * 1.0, r * 0.95);
      for (let i = 0; i < 4; i++) { const x0 = -r * 1.0 + i * r * 0.5; g.quadraticCurveTo(x0 + r * 0.25, r * (i % 2 ? 0.65 : 1.25), x0 + r * 0.5, r * 0.95); }
      g.lineTo(r * 1.05, -r * 0.1);
      g.bezierCurveTo(r * 1.25, -r * 1.05, r * 0.2, -r * 1.25, 0, -r * 0.45);
      g.closePath(); g.fill();
      g.fillStyle = '#3a1030';
      for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * r * 0.36, r * 0.05, r * 0.17, r * 0.24, 0, 0, TAU); g.fill(); }
      g.fillStyle = '#ffffff';
      for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.36 + r * 0.05, -r * 0.05, r * 0.07, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,90,150,0.55)';
      for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.62, r * 0.35, r * 0.13, 0, TAU); g.fill(); }
    }],
  };

  function foeImg(kind, r, white) {
    const key = kind + '|' + r;
    const [size, paint] = FOE_ART[kind](r);
    const c = foeSprite(key, size, paint);
    return white ? whiteOf(key, c) : c;
  }
  function stamp(ctx, img, x, y, rot, alpha, scale) {
    const s = img.size * (scale || 1);
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // 행성 적 한 마리 그리기. 맞는 순간은 흰 실루엣
  function drawFoe(ctx, e, W) {
    const white = e.flash > 0, r = e.r, t = W.t;
    switch (e.type) {
      case 'ember': stamp(ctx, foeImg('ember', r, white), e.x, e.y, e.emA); return;
      case 'acid': stamp(ctx, foeImg('acid', r, white), e.x, e.y + Math.sin(t * 2.2 + e.id) * 2, 0); break;
      case 'sat': stamp(ctx, foeImg('sat', r, white), e.x, e.y, e.ang); break;
      case 'worm': {
        if (e.wm !== 'up') {
          // 땅속: 흔들리는 모래 더미. 예고 중엔 더 크게 들썩인다
          const shake = e.wm === 'warn' ? Math.sin(t * 50) * 2.5 : 0;
          stamp(ctx, foeImg('mound', r, false), e.x + shake, e.y, 0, 1, 1 + Math.sin(t * 12 + e.id) * 0.05);
          return;
        }
        stamp(ctx, foeImg('worm', r, white), e.x, e.y, t * 1.5);
        break;
      }
      case 'zap': {
        const charging = e.busy > 0;
        stamp(ctx, foeImg('zap', r, white || (charging && Math.floor(t * 14) % 2 === 0)), e.x, e.y, 0);
        if (charging) {
          // 모으는 번개 불꽃
          ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * TAU, r0 = r * 1.1, r1 = r * (1.6 + Math.random() * 0.5);
            ctx.moveTo(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0);
            ctx.lineTo(e.x + Math.cos(a + 0.25) * (r0 + r1) / 2, e.y + Math.sin(a + 0.25) * (r0 + r1) / 2);
            ctx.lineTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1);
          }
          ctx.stroke();
        }
        break;
      }
      case 'shard': stamp(ctx, foeImg('shard', r, white), e.x, e.y, e.ang); break;
      case 'ice': {
        stamp(ctx, foeImg('ice', r, white), e.x, e.y, e.ang * 0.3);
        // 금 간 얼음: 체력이 줄수록 금이 늘어난다 (곧 쪼개진다는 신호)
        const k = 1 - e.hp / e.maxHp;
        if (k > 0.3) {
          ctx.strokeStyle = 'rgba(40,90,110,0.8)'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          const n = k > 0.65 ? 3 : 2;
          for (let i = 0; i < n; i++) { const a = e.id + i * 2.1; ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * r * 0.5, e.y + Math.sin(a) * r * 0.5); ctx.lineTo(e.x + Math.cos(a + 0.4) * r * 0.9, e.y + Math.sin(a + 0.4) * r * 0.9); }
          ctx.stroke();
        }
        break;
      }
      case 'iceBit': stamp(ctx, foeImg('iceBit', r, white), e.x, e.y, Math.atan2(e.vy, e.vx)); return;
      case 'storm': stamp(ctx, foeImg('storm', r, white), e.x, e.y, -e.ang); break;
      case 'ghost': {
        const a = 0.12 + 0.88 * e.vis;
        if (e.hide) {
          // 흐릴 때: 점선 동그라미로 어디 있는지만 (이때는 못 맞히고 안 아프다)
          ctx.strokeStyle = 'rgba(255,179,217,0.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
          ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.2, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        stamp(ctx, foeImg('ghost', r, white), e.x, e.y + Math.sin(t * 3 + e.id) * 2, 0, a);
        break;
      }
    }
    // 체력바 (다친 적만)
    if (e.hp < e.maxHp && !e.hide) {
      const w = r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, e.y - r - 10, w, 3);
      ctx.fillStyle = e.def.color;
      ctx.fillRect(e.x - w / 2, e.y - r - 10, w * Math.max(0, e.hp / e.maxHp), 3);
    }
  }
  const FOE_DRAW = { ember: 1, acid: 1, sat: 1, worm: 1, zap: 1, shard: 1, ice: 1, iceBit: 1, storm: 1, ghost: 1 };

  // 폭풍 드론의 바람 고리 (내 총알이 휘는 곳)
  function drawWinds(ctx, W, calm) {
    for (const e of W.enemies) {
      if (e.type !== 'storm' || e.spawnT > 0) continue;
      const R = e.def.windR, rot = calm ? 0 : -W.t * 3 * e.strafe;
      ctx.strokeStyle = 'rgba(140,190,255,0.28)'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { const a = rot + TAU * i / 3; ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.92, a, a + 1.3); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(140,190,255,0.16)'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a = -rot * 1.4 + TAU * i / 3 + 0.8; ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.6, a, a + 1.1); ctx.stroke(); }
    }
  }

  // 금성 안개 웅덩이: 생기는 동안은 점선 원이 커지고, 다 생기면 연두 안개 + 보글보글 거품. 사라지기 전 옅어진다
  function drawMists(ctx, W, calm) {
    if (!W.mists || !W.mists.length) return;
    for (const m of W.mists) {
      if (m.t < m.form) {
        const k = m.t / m.form;
        ctx.strokeStyle = 'rgba(200,240,74,' + (0.4 + 0.5 * k) + ')'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.4 + 0.6 * k), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      const left = m.form + m.life - m.t, a = Math.min(1, left / 0.6, (m.t - m.form) / 0.2 + 0.3);
      const img = foeSprite('mist|' + m.r, m.r * 2.2, g => {
        softGlow(g, m.r * 1.1, '170,220,60', 0.55);
        g.fillStyle = 'rgba(200,240,74,0.18)'; g.beginPath(); g.arc(0, 0, m.r, 0, TAU); g.fill();
      });
      stamp(ctx, img, m.x, m.y, 0, a);
      ctx.strokeStyle = 'rgba(200,240,74,' + (0.55 * a) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(230,255,170,' + (0.7 * a) + ')';
      for (let i = 0; i < 5; i++) {
        const ph = calm ? i * 0.2 : (m.t * 0.7 + i * 0.2 + m.seed) % 1, ang = m.seed + i * 1.9;
        const rr = m.r * (0.25 + 0.5 * ((i * 0.37 + m.seed) % 1));
        ctx.beginPath(); ctx.arc(m.x + Math.cos(ang) * rr, m.y + Math.sin(ang) * rr - ph * 10, 2 + (1 - ph) * 3, 0, TAU); ctx.fill();
      }
    }
    // 안개 안에서 느려진 내 기체: 연두 고리
    const p = W.player;
    if (p.mist) {
      ctx.strokeStyle = 'rgba(200,240,74,0.8)'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // 행성 적 예고: 모래 벌레 둥근 예고 · 고리 조각 가로 띠 · 태양 불씨 날아올 방향
  function drawFoeWarnings(ctx, W, calm) {
    for (const e of W.enemies) {
      if (e.type === 'worm' && e.wm === 'warn') {
        const def = e.def, full = def.popWarn * (W.diff.foeWarn || 1), k = 1 - Math.max(0, e.wmT) / full;
        const blink = k > 0.7 && Math.floor(W.t * 14) % 2 === 0;
        ctx.fillStyle = 'rgba(224,110,50,' + (0.12 + 0.2 * k) + ')';
        ctx.beginPath(); ctx.arc(e.x, e.y, def.popR, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,170,90,' + (0.2 + 0.2 * k) + ')';
        ctx.beginPath(); ctx.arc(e.x, e.y, def.popR * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = blink ? '#ffffff' : 'rgba(255,140,70,' + (0.6 + 0.4 * k) + ')';
        ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.lineDashOffset = calm ? 0 : W.t * 30;
        ctx.beginPath(); ctx.arc(e.x, e.y, def.popR, 0, TAU); ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      } else if (e.type === 'shard' && e.sw === 'warn') {
        const def = e.def, full = def.warn * (W.diff.foeWarn || 1), k = 1 - Math.max(0, e.swT) / full;
        const hh = e.r + 12, blink = k > 0.7 && Math.floor(W.t * 14) % 2 === 0;
        ctx.fillStyle = 'rgba(243,213,140,' + (0.1 + 0.18 * k) + ')';
        ctx.fillRect(0, e.swY - hh, W.w, hh * 2);
        // 차오르는 띠 (조각이 지나갈 길)
        const fx = e.dir > 0 ? 0 : W.w * (1 - k);
        ctx.fillStyle = 'rgba(255,230,160,' + (0.12 + 0.15 * k) + ')';
        ctx.fillRect(fx, e.swY - hh, W.w * k, hh * 2);
        ctx.strokeStyle = blink ? '#ffffff' : 'rgba(243,213,140,' + (0.55 + 0.4 * k) + ')';
        ctx.lineWidth = 2; ctx.setLineDash([12, 8]);
        ctx.beginPath(); ctx.moveTo(0, e.swY - hh); ctx.lineTo(W.w, e.swY - hh); ctx.moveTo(0, e.swY + hh); ctx.lineTo(W.w, e.swY + hh); ctx.stroke();
        ctx.setLineDash([]);
        // 가는 쪽 화살표
        ctx.fillStyle = 'rgba(255,240,200,' + (0.35 + 0.4 * k) + ')';
        const off = calm ? 0 : (W.t * 160 * e.dir) % 120;
        for (let x = -120 + off; x < W.w + 120; x += 120) {
          const c = e.dir;
          ctx.beginPath(); ctx.moveTo(x + c * 12, e.swY); ctx.lineTo(x - c * 6, e.swY - 10); ctx.lineTo(x - c * 6, e.swY + 10); ctx.closePath(); ctx.fill();
        }
      } else if (e.type === 'ember' && e.spawnT > 0) {
        const c = Math.cos(e.emA), s = Math.sin(e.emA);
        ctx.strokeStyle = 'rgba(255,179,71,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + c * 70, e.y + s * 70); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  // 짧은 빛줄기(인공위성)·번개(번개 구름): 예고 점선 → 발사
  function drawFoeBeam(ctx, W, L) {
    const c = Math.cos(L.ang), s = Math.sin(L.ang), x2 = L.x + c * L.len, y2 = L.y + s * L.len;
    const bolt = L.kind === 'bolt', rgb = bolt ? '255,228,92' : '159,216,255';
    if (L.t < L.warn) {
      const k = L.t / L.warn, blink = Math.floor(L.t * (k > 0.6 ? 16 : 8)) % 2;
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.35 + k * 0.45 + blink * 0.15) + ')';
      ctx.lineWidth = 2 + k * 2;
      ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      // 끝 표시: 번개는 과녁, 빛줄기는 가로 막대
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (bolt) { ctx.arc(x2, y2, 10 + (1 - k) * 8, 0, TAU); ctx.moveTo(x2 - 6, y2); ctx.lineTo(x2 + 6, y2); ctx.moveTo(x2, y2 - 6); ctx.lineTo(x2, y2 + 6); }
      else { ctx.moveTo(x2 - s * 12, y2 + c * 12); ctx.lineTo(x2 + s * 12, y2 - c * 12); }
      ctx.stroke();
      return;
    }
    const k = 1 - (L.t - L.warn) / L.on;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    if (bolt) {
      // 지그재그 번개
      const n = 8, pts = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, j = i === 0 || i === n ? 0 : (Math.sin(L.seed + i * 12.9898 + Math.floor(L.t * 30)) * 43758.5453 % 1) * 16;
        pts.push([L.x + c * L.len * f - s * j, L.y + s * L.len * f + c * j]);
      }
      for (const [w, col] of [[L.w * 1.6, 'rgba(255,228,92,0.3)'], [L.w * 0.6, 'rgba(255,240,160,0.85)'], [3, 'rgba(255,255,255,0.95)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w * (0.6 + k * 0.4);
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    } else {
      for (const [w, col] of [[L.w * 1.8, 'rgba(159,216,255,0.35)'], [L.w, 'rgba(200,236,255,0.8)'], [L.w * 0.35, 'rgba(255,255,255,0.95)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w * (0.6 + k * 0.4);
        ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }

  // 처음 만난 행성 적 이름표 ("화성 모래 벌레!"): 적 위에 둥근 이름표, 처음에 톡 튀어나온다
  function drawTags(ctx, W, calm) {
    if (!W.tags || !W.tags.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const g of W.tags) {
      const age = g.max - g.life, a = Math.min(1, g.life / 0.4, age / 0.15);
      const pop = calm ? 1 : 1 + Math.max(0, 0.25 - age) * 1.6;
      const fs = Math.round(17 * pop);
      ctx.font = fs + 'px "Jua", system-ui, sans-serif';
      const tw = ctx.measureText(g.txt).width + 18;
      const x = NG.clamp(g.x, tw / 2 + 6, W.w - tw / 2 - 6), y = Math.max(fs + 6, g.y - 40);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,10,20,0.78)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - tw / 2, y - fs * 0.75, tw, fs * 1.5, fs * 0.75); else ctx.rect(x - tw / 2, y - fs * 0.75, tw, fs * 1.5);
      ctx.fill();
      ctx.strokeStyle = g.col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = g.col;
      ctx.fillText(g.txt, x, y + 1);
      // 꼬리 삼각형 (적을 가리킨다)
      ctx.beginPath(); ctx.moveTo(x - 6, y + fs * 0.75); ctx.lineTo(x + 6, y + fs * 0.75); ctx.lineTo(NG.clamp(g.x, x - 20, x + 20), y + fs * 0.75 + 8); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
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
      if (FOE_DRAW[e.type]) { drawFoe(ctx, e, W); continue; }
      if (e.type === 'boss') glow(ctx, 'rgba(' + (e.look ? e.look.glow : '255,46,136') + ',0.55)', e.x, e.y, Math.round(e.r * 1.8), 1);
      if (e.look) bossBack(ctx, e, W);
      if (e.chWarn > 0 || e.chDash > 0) glow(ctx, 'rgba(255,140,66,0.7)', e.x, e.y, Math.round(e.r * 2.4), e.chDash > 0 ? 0.9 : 0.5 + 0.4 * Math.sin(W.t * 30));
      shapePath(ctx, e);
      ctx.fillStyle = e.flash > 0 || (e.chWarn > 0 && Math.floor(W.t * 12) % 2) ? '#ffffff' : e.look ? e.look.color : e.def.color;
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
      if (e.chWarn > 0) {
        // 돌진이 예고선: 굵은 주황 점선이 차오른다 (선 밖으로 비키면 안 맞는다)
        const def = e.def, k = 1 - e.chWarn / def.warn, c = Math.cos(e.chA), s = Math.sin(e.chA);
        const len = def.dashSpeed * W.diff.enemySpeed * def.dashTime + e.r;
        ctx.strokeStyle = 'rgba(255,140,66,' + (0.3 + k * 0.55) + ')';
        ctx.lineWidth = e.r * 1.7 * (0.35 + k * 0.65);
        ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + c * len, e.y + s * len); ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
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
      if (L.len) { drawFoeBeam(ctx, W, L); continue; }
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

  // 운석 예고: 바닥에 빨간 점선 원 + 가운데부터 차오르는 빛. 떨어지기 직전엔 깜빡인다
  function drawMeteorZones(ctx, W, calm) {
    if (!W.meteors || !W.meteors.length) return;
    for (const m of W.meteors) {
      if (m.t < 0) continue;
      const k = Math.min(1, m.t / m.warn);
      const blink = k > 0.7 && Math.floor(m.t * 14) % 2 === 0;
      ctx.fillStyle = 'rgba(255,70,40,' + (0.1 + 0.2 * k) + ')';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,150,60,' + (0.18 + 0.2 * k) + ')';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * k, 0, TAU); ctx.fill();
      ctx.strokeStyle = blink ? '#ffffff' : 'rgba(255,110,60,' + (0.6 + 0.4 * k) + ')';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = calm ? 0 : -m.t * 40;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      // 가운데 과녁 표시
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x - 10, m.y); ctx.lineTo(m.x + 10, m.y); ctx.moveTo(m.x, m.y - 10); ctx.lineTo(m.x, m.y + 10);
      ctx.stroke();
    }
  }
  // 떨어지는 운석: 오른쪽 위에서 불꼬리를 끌며 내려온다
  function drawMeteorRocks(ctx, W) {
    if (!W.meteors || !W.meteors.length) return;
    for (const m of W.meteors) {
      if (m.t < 0) continue;
      const k = Math.min(1, m.t / m.warn), u = 1 - k;
      const rx = m.x + u * 150, ry = m.y - u * 320, sz = 8 + k * 8;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,140,50,0.45)';
      ctx.lineWidth = sz * 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + 40 + sz * 2, ry - 85 - sz * 4); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalCompositeOperation = 'source-over';
      glow(ctx, 'rgba(255,160,70,0.8)', rx, ry, 30, 0.8);
      ctx.fillStyle = '#6e5242';
      ctx.beginPath(); ctx.arc(rx, ry, sz, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd08a';
      ctx.beginPath(); ctx.arc(rx - sz * 0.25, ry + sz * 0.25, sz * 0.45, 0, TAU); ctx.fill();
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
    // 맨 앞 칸은 지금 있는 곳 (행성 이름 또는 블랙홀, 행성 색)
    const place = W.place || NG.World.placeOf(W.wave);
    const where = W.hole ? ['블랙홀', '#c9a0ff'] : [place.planet.name + (place.lap > 1 ? ' ' + place.lap + '바퀴' : ''), place.planet.color];
    const chips = [[where[0], '', where[1], true], ['WAVE', W.wave], ['N', p.gun.barrels, '#ffe66d'], ['', NG.fmtTime(W.stats.time)]];
    let cx = right;
    for (let i = chips.length - 1; i >= 0; i--) {
      const ch = chips[i];
      ctx.font = ch[3] ? Math.round(13 * s) + 'px ' + DISP : '700 ' + Math.round(13 * s) + 'px ' + NUM;
      const txt = ch[3] ? ch[0] : (ch[0] ? ch[0] + ' ' : '') + ch[1];
      const w = ctx.measureText(txt).width + 14 * s;
      ctx.fillStyle = 'rgba(12,16,26,0.72)';
      ctx.fillRect(cx - w, top + 26 * s, w, 18 * s);
      ctx.fillStyle = ch[2] || '#bcd3e2';
      ctx.fillText(txt, cx - 7 * s, top + (ch[3] ? 29 : 28.5) * s);
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
      // 아랫줄: 보스 이름 · 블랙홀 주의 · 새 행성 도착 (행성 색) · 그 밖엔 "끝까지 버텨라"
      const place = W.place || NG.World.placeOf(W.wave);
      let sub = '끝까지 버텨라', subCol = '#8aa4b8', fact = '';
      if (W.bossWave) { sub = nb.name + (W.bossKills >= D.BOSSES.length ? ' MK' + (Math.floor(W.bossKills / D.BOSSES.length) + 1) : '') + ' 등장!'; subCol = '#ffffff'; }
      else if (W.hole) { sub = '블랙홀 주의!'; subCol = '#d7b8ff'; fact = '빨려 들지 않게 계속 움직여요'; }
      else if (place.first) { sub = place.planet.name + ' 도착!' + (place.lap > 1 ? ' (' + place.lap + '바퀴)' : ''); subCol = place.planet.color; fact = place.planet.fact; }
      const big = !W.bossWave && (W.hole || place.first);
      ctx.font = Math.round(fs * (big ? 0.46 : 0.32)) + 'px ' + DISP;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      if (big) ctx.fillText(sub, W.w / 2 - slide + 2, ty + fs * 0.72 + 2);
      ctx.fillStyle = subCol;
      ctx.fillText(sub, W.w / 2 - slide, ty + fs * (big ? 0.72 : 0.62));
      if (fact) {
        ctx.font = Math.round(fs * 0.28) + 'px ' + DISP;
        ctx.fillStyle = '#e8f7ff';
        ctx.fillText(fact, W.w / 2 - slide, ty + fs * 1.18);
      }
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
    drawBackground(ctx, W, view.dpr, view.calm);
    ctx.save();
    // 움직임 줄이기 설정이면 화면 흔들림·번쩍임을 뺀다
    if (W.shake > 0 && !view.calm) {
      const s = W.shake * 0.5;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawMeteorZones(ctx, W, view.calm);
    drawMists(ctx, W, view.calm);
    drawFoeWarnings(ctx, W, view.calm);
    drawFx(ctx, W);
    drawWinds(ctx, W, view.calm);
    drawEnemies(ctx, W);
    drawWarnings(ctx, W);
    drawBullets(ctx, W);
    drawMeteorRocks(ctx, W);
    drawShocks(ctx, W);
    drawPlayer(ctx, W);
    drawTags(ctx, W, view.calm);
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
