'use strict';
// 첫 화면(게임 고르기) 카드 그림 만들기: 다섯 게임을 실제 크로미움으로 열고, 한 장면을 손으로 차려 놓고(주인공·적·별 자리를 정해 둠)
// 세상을 멈춘 뒤 찍어, 2:1 WebP 두 크기(640×320 · 960×480)로 common/thumbs/에 저장한다.
// 게임 그림이 크게 바뀌었을 때 다시 돌린다:
//   node tools/thumbs.js            (다섯 게임 모두)
//   node tools/thumbs.js jump       (하나만)
//   SHOTS=/경로 node tools/thumbs.js (다듬기 전 원본 PNG도 그 폴더에 남긴다, 확인용)
// Playwright 위치를 직접 줄 때: PW=/경로/playwright node tools/thumbs.js
// 그림은 모두 우리 게임 화면이다 (내려받은 그림 없음). 글자(점수·안내·이름표)는 찍지 않는다.
//
// 장면 짜는 법 (2026-09-28, 소유자: "스크린샷 이미지 조금 더 깔끔하게 다듬어줘"):
//   · 자동 운전을 기다리지 않는다. 판을 열자마자 규칙 한 걸음(World.step)을 비워 세상을 멈추고, 주인공·적·별·발판을 정한 자리에 놓는다
//   · 움직임 줄이기(reduced motion)로 열어 배경 시계·반짝임·찌그러짐이 멈춰 있고, Math.random도 고정 씨앗으로 바꿔 돌릴 때마다 같은 그림
//   · 카드 아래쪽 약 45%는 제목·설명·그러데이션이 덮고, 작은 탭(893×533)에서는 위아래 12%씩 잘린다.
//     그래서 주인공은 그림 높이 25 ~ 45%, 가로 가운데 ~ 오른쪽 3분의 1에 둔다. 왼쪽 위 모서리는 분류 이름표 자리
//   · 가장자리에 잘리는 물체가 없게, 행성은 통째로 보이거나 아예 안 보이게
//   · 마무리(finish): 네 장이 한 가족처럼 보이게 아주 약한 대비·채도·밝기와 가장자리 어둡게 (게임마다 조금씩)
const path = require('path');
const fs = require('fs');

let pw = null;
for (const p of [process.env.PW, 'playwright', '/opt/node22/lib/node_modules/playwright']) {
  if (!p) continue;
  try { pw = require(p); break; } catch (e) { /* 다음 후보 */ }
}
if (!pw) { console.error('Playwright가 없어 그림을 만들 수 없어요'); process.exit(1); }

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'common', 'thumbs');
const SIZES = [640, 960];   // 가로 px, 세로는 절반 (2:1)
const QUALITY = 0.8;
const BIG = 1152;           // 찍는 가로 픽셀 (960보다 조금 크게 찍어 줄이면 선이 곱다)

// 게임마다: vp 화면 크기(CSS px), compose 장면 차리기(페이지 안에서 돈다, 끝에 자를 칸 {x, y, width, height}을 돌려준다),
// finish 마무리 {b 밝기, c 대비, s 채도, vig 가장자리 어둡게 0 ~ 1}
const GAMES = [
  {
    // 뿅뿅 우주선: 토성 앞에서 대포 7개로 쏘는 둥근 코어 우주선. 부채꼴 총알이 오른쪽 적 쪽으로 날아간다
    // 작은 화면(590×226)에서 찍어 우주선이 카드에서 크게 보이고, 토성이 고리까지 통째로 들어온다
    id: 'ngun', ns: 'NG', folder: 'game', vp: [590, 226],
    compose: () => {
      NG.debug.selectShip('core');
      NG.debug.newGame();
      NG.World.step = () => {};
      NG.DATA.VIEW.planetDim = 0.9;   // 웨이브 중 어둡게 누르는 행성을 조금 밝게
      const W = NG.debug.world, p = W.player;
      W.wave = 11; W.place = NG.World.placeOf(11); W.bossWave = false; W.banner = 0; W.spawnQueue = [];
      for (const k of ['enemies', 'bullets', 'eBullets', 'lasers', 'particles', 'drops', 'texts', 'tags', 'meteors', 'mists', 'booms', 'shocks']) if (W[k]) W[k].length = 0;
      W.gift = W.capsule = W.wing = W.hole = null; W.shake = W.flash = W.whiteFlash = W.pulse = 0; W.feverT = 0;
      NG.debug.view.hud = false;
      // 자를 칸: 화면 오른쪽 437×218.5 (왼쪽은 버린다. 토성이 고리 끝까지 카드 안에 들어오게, 가장자리 판 테두리 빛은 빼고)
      const C = { x: W.w - 440, y: 4, width: 437, height: 218.5 };
      const X = f => C.x + C.width * f, Y = f => C.y + C.height * f;
      p.x = X(0.3); p.y = Y(0.35); p.aim = -0.14; p.iframe = 0; p.drones = 0; p.muzzle = 0;
      p.gun.barrels = 7;
      // 대포 7개가 쏜 총알이 부채꼴로 퍼진다 (한 대포에 네 알씩)
      const g = p.gun, n = g.barrels, spread = Math.min(g.spreadStep * (n - 1), g.spreadMax);
      for (const d of [34, 55, 76, 97]) for (let i = 0; i < n; i++) {
        const a = p.aim - spread / 2 + spread * i / (n - 1);
        W.bullets.push({ x: p.x + Math.cos(a) * (p.r + d), y: p.y + Math.sin(a) * (p.r + d), vx: Math.cos(a) * g.speed, vy: Math.sin(a) * g.speed,
          r: g.size, dmg: 0, life: 9, pierce: 0, bounce: 0, hits: [] });
      }
      const put = (t, fx, fy) => { const e = NG.World.spawnEnemy(W, t); e.x = X(fx); e.y = Y(fy); e.spawnT = 0; e.ang = 0.3; return e; };
      put('grunt', 0.62, 0.28);
      put('shooter', 0.87, 0.4);
      W.tags.length = 0; W.texts.length = 0;
      return C;
    },
    finish: { b: 1.08, c: 1.06, s: 1.12, vig: 0.28 },
  },
  {
    // 냠냠 뱀: 해왕성 하늘 판 안쪽만 잘라, 무지개 애벌레가 S자로 구불구불 오른쪽 구슬을 향해 간다. 판 테두리는 안 보인다
    id: 'snake', ns: 'SN', folder: 'snake', vp: [640, 400],
    compose: () => {
      SN.store.set('snake.sky', 7);   // 해왕성 (판 뒤 오른쪽 아래에 파란 행성이 은은하게)
      SN.debug.setRival(false);
      SN.debug.newGame();
      SN.World.step = () => {};
      const W = SN.debug.world, v = SN.debug.view;
      v.hud = false;
      W.char = 'bug'; v.char = 'bug';
      // 자를 칸: 판의 (2, 1) 칸부터 가로 20칸 · 세로 10칸. 아래 좌표는 그 칸 안의 칸 번호.
      // 가장 아래 줄(4)은 가운데 오른쪽에만 (작은 탭에서 왼쪽 제목 뒤로 숨지 않게)
      const o = [2, 1];
      const path = [[15, 2], [14, 2], [13, 2], [12, 2], [12, 3], [12, 4], [11, 4], [10, 4], [9, 4], [8, 4], [8, 3], [8, 2], [7, 2], [6, 2], [5, 2], [4, 2], [4, 3], [3, 3], [2, 3]];
      W.snake = path.map(([x, y]) => ({ x: x + o[0], y: y + o[1] }));
      W.prev = W.snake.map(s => ({ x: s.x, y: s.y }));
      W.dir = 'right'; W.queue = []; W.alpha = 0; W.wait = 0; W.phase = 'play'; W.grow = 0;
      W.food = { x: 17 + o[0], y: 2 + o[1], gold: false, born: W.t - 5 };
      W.item = null; W.gift = null; W.bonus = null; W.fx = []; W.feverT = 0;
      W.eff = { slow: 0, double: 0, ghost: 0, giant: 0 };
      window.__clip = () => ({ x: v.bx + o[0] * v.cell, y: v.by + o[1] * v.cell, width: 20 * v.cell, height: 10 * v.cell });
      return null;
    },
    finish: { b: 1.1, c: 1.06, s: 1.1, vig: 0.26 },
  },
  {
    // 통통 점프: 저녁 하늘(40m, 소품 없이)에서 로봇 공이 아래 발판을 차고 오른쪽 위 발판과 별 두 개 쪽으로 튀어 오른다
    // 세로 화면이면 발판 기둥이 화면 너비를 다 쓴다. 높이 눈금 글자·배경 소품(연·열기구·새)은 가장자리에서 잘리니 뺀다
    id: 'jump', ns: 'JP', folder: 'jump', vp: [500, 800],
    compose: () => {
      JP.debug.newGame(7, { tutorial: false, start: 'ground' });
      JP.World.step = () => {};
      JP.DATA.MILE.tick = 1e9;   // 높이 눈금 글자 없음
      JP.DATA.SKY.deco = [];     // 배경 소품 없음
      const W = JP.debug.world, v = JP.debug.view, M = JP.DATA.METER;
      v.hud = false;
      const H = 40 * M;
      W.cam = W.pcam = H; W.alpha = 0; W.phase = 'play';
      W.plats = []; W.stars = []; W.items = []; W.mines = []; W.monsters = []; W.gifts = []; W.doors = []; W.fx = []; W.storm = null;
      W.room = null; W.rocket = 0; W.shield = false; W.feverT = 0;
      W.maxY = H + 400; W.height = Math.floor(W.maxY / M);
      // 자를 칸 (화면 CSS px): 기둥 안쪽, 위에서 조금 내려온 곳
      const C = { x: v.cx + 30, y: v.cy + 230, width: v.cw - 60, height: (v.cw - 60) / 2 };
      const at = (fx, fy) => ({ x: (C.x + fx * C.width - v.cx) / v.scale, y: H + (v.cy + v.ch - (C.y + fy * C.height)) / v.scale });
      const plat = (kind, fx, fy, w) => {
        const q = at(fx, fy);
        W.plats.push({ id: ++W.ids, kind, x: q.x, y: q.y, w, px: q.x, vx: 0, broken: false, bt: 0, on: true, t: 0, hit: -9, main: true });
      };
      const star = (fx, fy) => { const q = at(fx, fy); W.stars.push({ id: ++W.ids, x: q.x, y: q.y, got: false }); };
      plat('normal', 0.3, 0.76, 96);
      plat('normal', 0.76, 0.46, 88);
      star(0.64, 0.27); star(0.77, 0.23);
      const b = at(0.52, 0.36);
      Object.assign(W.p, { x: b.x, px: b.x, y: b.y, py: b.y, vx: 0, vy: 420, land: -9 });
      return C;
    },
    finish: { b: 1.08, c: 1.08, s: 1.2, vig: 0.26 },
  },
  {
    // 슝슝 우주 달리기: 수성 구간 해 뜨는 지평선. 우주선이 오른쪽 줄에서 높이 뛰어 해와 수성 사이에 뜨고,
    // 가운데 줄에는 별이 지평선까지 줄지어 있다
    id: 'runner', ns: 'RN', folder: 'runner', vp: [1120, 560],
    compose: () => {
      RN.debug.newGame();
      RN.World.step = () => {};
      const W = RN.debug.world, v = RN.debug.view;
      v.hud = false;
      W.wait = 0; W.phase = 'play'; W.tut = null;
      W.obs = []; W.fx = []; W.pir = null; W.warp = null; W.bh = null; W.pull = null; W.feverM = 0;
      const J = 2.7;   // 뛰는 높이 (m, 실제 꼭대기 1.7보다 조금 높게 해서 우주선이 제목 위에 오게)
      Object.assign(W.p, { lane: 2, x: 1.84, px: 1.84, y: J, py: J, vy: 0, from: 2, fromLane: 2, sl: 0, drop: false, jt: 0.3 });
      const d = W.dist;
      for (let i = 0; i < 6; i++) W.obs.push({ kind: 'star', x: 1, y: 0.5, z: d + 8 + i * 5, row: 1, line: 1 });
      RN.DATA.ZONES[0].weather = null;   // 수성 불씨 알갱이는 작은 점으로만 보여 뺀다
      return { x: 0, y: 0, width: v.w, height: v.w / 2 };
    },
    finish: { b: 1.02, c: 1.04, s: 1.06, vig: 0.22 },
  },
  {
    // 슥슥 우주 다리: 달 3판. 기둥에서 오른쪽 땅까지 그린 빛 다리로 떨어지는 공, 오른쪽에 외계인 친구, 뒤에 지구
    id: 'bridge', ns: 'BR', folder: 'bridge', vp: [1120, 560],
    compose: () => {
      BR.debug.unlockAll();
      BR.debug.startLevel('moon-3');
      BR.debug.drawSol(0);
      const W = BR.debug.world;
      for (let i = 0; i < 600 && BR.World.ballState(W).y < 390; i++) BR.World.step(W, 1 / 60);
      BR.World.step = () => {};
      W.events.length = 0;
      // 공·다리·친구 쪽으로 조금 당겨 자른다 (넓은 카드에서 위아래가 잘려도 공이 보이게)
      return { x: 250, y: 150, width: 840, height: 420 };
    },
    finish: { b: 1.06, c: 1.05, s: 1.1, vig: 0.22 },
  },
];

// 페이지가 열리기 전에: Math.random을 고정 씨앗으로 (배경 별·먼지·날씨 알갱이가 돌릴 때마다 같게)
const SEED_SCRIPT = `(() => { let s = 0x2f6b1d3; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();`;

async function shoot(browser, g) {
  // 한 번 열어 자를 칸 크기를 보고, 그 칸이 BIG 픽셀이 되는 배율로 다시 연다
  let clip = null, png = null;
  for (let pass = 0; pass < 2; pass++) {
    const dsf = clip ? BIG / clip.width : 1;
    const ctx = await browser.newContext({ viewport: { width: g.vp[0], height: g.vp[1] }, deviceScaleFactor: dsf, reducedMotion: 'reduce' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(SEED_SCRIPT);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('file://' + path.join(ROOT, g.folder, 'index.html'));
    await page.waitForTimeout(600);
    let c = await page.evaluate(g.compose);
    // 글자·단추·창은 모두 숨기고 게임 그림(canvas)만 남긴다
    await page.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
    await page.waitForTimeout(1500);
    if (!c) c = await page.evaluate(() => window.__clip());
    clip = c;
    if (pass === 1) png = await page.screenshot({ clip });
    if (errors.length) console.log('  ' + g.id + ' 페이지 오류: ' + errors.join(' | '));
    await ctx.close();
  }
  return png;
}

// 브라우저 캔버스로 줄이고 마무리를 얹어 WebP로 (Node에 WebP 도구가 없어도 되게)
async function encode(browser, png, finish) {
  const page = await browser.newPage();
  const out = await page.evaluate(async ({ src, sizes, q, f }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const res = {};
    for (const W of sizes) {
      const c = document.createElement('canvas');
      c.width = W; c.height = W / 2;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.filter = 'brightness(' + f.b + ') contrast(' + f.c + ') saturate(' + f.s + ')';
      g.drawImage(img, 0, 0, c.width, c.height);
      g.filter = 'none';
      // 가장자리를 아주 살짝 어둡게 (가운데 주인공으로 눈이 가게)
      const v = g.createRadialGradient(W / 2, W / 4, W * 0.2, W / 2, W / 4, W * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,' + f.vig + ')');
      g.fillStyle = v;
      g.fillRect(0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/webp', q));
      if (!blob || blob.type !== 'image/webp') throw new Error('WebP를 못 만듦');
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      res[W] = btoa(s);
    }
    return res;
  }, { src: 'data:image/png;base64,' + png.toString('base64'), sizes: SIZES, q: QUALITY, f: finish });
  await page.close();
  return out;
}

(async () => {
  const only = process.argv.slice(2);
  const list = only.length ? GAMES.filter(g => only.includes(g.id)) : GAMES;
  if (!list.length) { console.error('게임 이름: ' + GAMES.map(g => g.id).join(', ')); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch();
  for (const g of list) {
    const png = await shoot(browser, g);
    if (process.env.SHOTS) fs.writeFileSync(path.join(process.env.SHOTS, 'thumb-' + g.id + '.png'), png);
    const webp = await encode(browser, png, g.finish);
    for (const W of SIZES) {
      const file = path.join(OUT, g.id + '-' + W + '.webp');
      fs.writeFileSync(file, Buffer.from(webp[W], 'base64'));
      console.log('  ' + path.relative(ROOT, file) + '  ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
