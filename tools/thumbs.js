'use strict';
// 첫 화면(게임 고르기) 카드 그림 만들기: 네 게임을 실제 크로미움으로 잠깐 자동으로 돌려 한 장면을 찍고,
// 2:1로 잘라 WebP 두 크기(640×320 · 960×480)로 common/thumbs/에 저장한다.
// 게임 그림이 크게 바뀌었을 때 다시 돌린다:
//   node tools/thumbs.js            (네 게임 모두)
//   node tools/thumbs.js jump       (하나만)
//   SHOTS=/경로 node tools/thumbs.js (자르기 전 원본 PNG도 그 폴더에 남긴다, 확인용)
// Playwright 위치를 직접 줄 때: PW=/경로/playwright node tools/thumbs.js
// 그림은 모두 우리 게임 화면이다 (내려받은 그림 없음). 글자(점수·안내)는 찍기 전에 숨긴다.
// 자동 운전이라 돌릴 때마다 장면이 조금씩 다르다. 찍은 뒤 common/thumbs/*.webp를 꼭 눈으로 볼 것.
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
const DSF = 1.5;            // 찍는 배율 (960px 그림을 선명하게. 게임 해상도 상한 약 240만 픽셀 안)
const SIZES = [640, 960];   // 가로 px, 세로는 절반 (2:1)
const QUALITY = 0.8;

// 게임마다: 어떤 판을 어떻게 차려 두고(setup), 언제 찍고(ready), 찍기 직전 무엇을 치우고(pre),
// 어디를 중심으로 자를지(focus: 화면 CSS 좌표, crop: 자를 너비와 그 점이 올 자리 비율)
const GAMES = [
  {
    id: 'ngun', ns: 'NG', folder: 'game', vp: [1280, 800], warm: 5000,
    // 토성 앞에서 대포 9개로 쏘는 판 (체력은 넉넉히, 운석과 토성 조각 띠는 없앤다). 우주선은 토성 고리 왼쪽 위에 둔다 (카드 왼쪽 아래는 제목 자리)
    setup: () => {
      NG.debug.selectShip('viper');   // 세모 우주선 (처음부터 있는 기체)
      NG.debug.newGame();
      const W = NG.debug.world, p = W.player;
      p.hp = p.maxHp = 99;
      p.gun.barrels = 9; p.gun.rate *= 1.6; p.gun.dmg *= 0.15; p.drones = 2;
      p.x = W.w * 0.52; p.y = W.h * 0.275;
      W.wave = 11; W.place = NG.World.placeOf(11); W.spawnQueue = NG.World.buildWave(11, W.rand, W.diff);
    },
    // 자를 칸 안에 적 4마리 이상, 총알 12개 이상. 우주선이 잘 보이게 바로 옆 적은 없고, 맞은 직후·피버 아닐 때
    ready: () => {
      const W = NG.debug.world, p = W.player;
      W.meteors.length = 0; W.meteorT = 99; W.enemies = W.enemies.filter(e => e.type !== 'shard');
      const inBox = o => o.x > p.x - 216 && o.x < p.x + 324 && o.y > p.y - 86 && o.y < p.y + 184;
      const near = W.enemies.some(e => Math.hypot(e.x - p.x, e.y - p.y) < 90);
      return NG.debug.mode === 'play' && !(p.iframe > 0) && !(W.feverT > 0) && !near &&
        W.enemies.filter(inBox).length >= 4 && W.bullets.filter(inBox).length >= 12;
    },
    pre: () => {
      const W = NG.debug.world; NG.debug.view.hud = false;
      // 떠오르는 숫자(피해 1! 등)와 이름표는 비우고 더 생기지 않게
      for (const a of [W.texts, W.tags]) if (a) { a.length = 0; a.push = () => 0; }
      W.meteors.length = 0; W.shake = 0; W.flash = 0; W.whiteFlash = 0;
    },
    focus: () => { const p = NG.debug.world.player; return { x: p.x, y: p.y }; },
    crop: { w: 540, fx: 0.4, fy: 0.32 },
  },
  {
    id: 'snake', ns: 'SN', folder: 'snake', vp: [1280, 800], warm: 7000,
    // 목성 앞, 무지개 애벌레가 길쭉하게 (라이벌 뱀도 함께)
    setup: () => {
      SN.store.set('snake.sky', 4);
      SN.debug.setRival(true);
      SN.debug.newGame();
      SN.debug.autopilot(true);
      const W = SN.debug.world;
      W.grow = 12; W.char = 'bug'; SN.debug.view.char = 'bug';
      W.space.step = 1e6;   // 목성에 머문다 (구슬을 먹어도 다음 행성으로 안 감)
    },
    // 라이벌 머리가 가까이(부딪히지는 않게) 있고 이름표가 사라진 뒤, 라이벌을 물거나 구슬 먹은 글자가 사라졌을 때 (유령·거인·느린 시계·피버처럼 색이 바뀐 때는 빼고)
    ready: () => {
      const W = SN.debug.world, V = W.rival, h = W.snake[0], r = V && V.body[0];
      // 점수가 오른 뒤(구슬·라이벌 냠냠) 떠오르는 글자가 사라질 때까지 기다린다
      const B = window.__calm || (window.__calm = { n: -1, t: 0 });
      const key = W.score + '/' + W.rivalBites;
      if (key !== B.n) { B.n = key; B.t = W.time; }
      const dx = r ? Math.abs(r.x - h.x) : 99, dy = r ? Math.abs(r.y - h.y) : 99;
      // 12초가 지나도 라이벌이 가까이 안 오면 라이벌 없이도 찍는다
      const t0 = window.__t0 || (window.__t0 = performance.now()), near = dx <= 8 && dy <= 4 && dx + dy >= 3;
      return W.phase === 'play' && (near || performance.now() - t0 > 12000) &&
        !(V && (V.phase === 'warn' || V.phase === 'play' && (V.stun > 0 || W.time - (V.shownAt || 0) < 3.2))) && W.time - B.t > 1.3 &&
        !(W.eff && (W.eff.slow > 0 || W.eff.ghost > 0 || W.eff.giant > 0)) && !(W.feverT > 0);
    },
    why: () => { const W = SN.debug.world, V = W.rival; return JSON.stringify({ phase: W.phase, mode: SN.debug.mode, rival: V && V.phase, eff: W.eff, len: W.snake.length }); },
    pre: () => { const W = SN.debug.world; SN.debug.view.hud = false; W.item = null; },
    // 내 뱀 머리와 라이벌 머리의 가운데
    focus: () => {
      const W = SN.debug.world, v = SN.debug.view, h = W.snake[0], q = W.rival && W.rival.body[0];
      const r = q && Math.abs(q.x - h.x) <= 8 && Math.abs(q.y - h.y) <= 4 ? q : h;
      return { x: v.bx + ((h.x + r.x) / 2 + 0.5) * v.cell, y: v.by + ((h.y + r.y) / 2 + 0.5) * v.cell };
    },
    crop: { w: 900, fx: 0.55, fy: 0.32 },
  },
  {
    id: 'jump', ns: 'JP', folder: 'jump', vp: [800, 1280], warm: 2500,
    // 세로 화면이면 발판 기둥이 화면 너비를 다 쓴다. 땅에서 출발해 저녁 하늘(열기구·연·구름)을 오를 때
    setup: () => {
      JP.debug.autopilot(true);
      JP.debug.newGame(7, { tutorial: false, start: 'ground' });
      JP.debug.autopilot(true);
    },
    // 로켓 없이 위로 튀어 오르는 중 (비밀 방 말고),
    // 자를 칸 안에 별이 둘 이상 있을 때
    ready: () => {
      const W = JP.debug.world, v = JP.debug.view, half = 180 / v.scale;
      const stars = (W.stars || []).filter(s => !s.got && !s.dead && s.y > W.p.y - half * 0.9 && s.y < W.p.y + half * 1.1).length;
      return W.phase === 'play' && !W.room && W.p.vy > 150 && W.p.vy < 900 && W.p.y > 500 && stars >= 2;
    },
    pre: () => { JP.debug.view.hud = false; },
    focus: () => { const W = JP.debug.world, v = JP.debug.view; return { x: v.cx + W.p.x * v.scale, y: v.cy + v.ch - (W.p.y - W.cam) * v.scale }; },
    // 왼쪽 가장자리의 높이 글자(20m 등)는 빼고 자른다
    crop: { w: 720, fx: 0.6, fy: 0.34, minX: 80 },
  },
  {
    id: 'runner', ns: 'RN', folder: 'runner', vp: [1280, 560], warm: 5000,
    // 넓은 화면(2.3:1)이면 우주선이 크고 조금 위에 보인다. 해 뜨는 지평선과 달, 우주선은 오른쪽 줄에서 점프 중
    // (카드 왼쪽 아래는 제목 자리라 우주선을 오른쪽 위로)
    setup: () => { RN.debug.newGame(); RN.debug.autopilot(true); },
    ready: () => {
      const W = RN.debug.world, p = W.p;
      if (W.phase !== 'play') return false;
      if (p.lane < 2) { RN.debug.autopilot(false); RN.debug.move('right'); return false; }
      if (Math.abs(p.px - 2) > 0.05) return false;
      if (p.y === 0 && W.t - (W.lastStar || 0) > 1.3) { RN.debug.move('up'); return false; }
      return p.y > 1.0 && p.vy < 2;   // 점프 꼭대기 가까이
    },
    pre: () => { RN.debug.view.hud = false; },
    focus: () => ({ x: 640, y: 280 }),
    crop: { w: 1120, fx: 0.43, fy: 0.5 },
  },
];

async function shoot(browser, g) {
  const ctx = await browser.newContext({ viewport: { width: g.vp[0], height: g.vp[1] }, deviceScaleFactor: DSF });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.join(ROOT, g.folder, 'index.html'));
  await page.waitForTimeout(600);
  await page.evaluate(g.setup);
  await page.waitForTimeout(g.warm);
  // 글자·단추·창은 모두 숨기고 게임 그림(canvas)만 남긴다
  await page.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
  const end = Date.now() + 20000;
  let ok = false;
  while (Date.now() < end && !(ok = await page.evaluate(g.ready))) await page.waitForTimeout(50);
  if (!ok) console.log('  ' + g.id + ': 기다리던 장면이 안 와서 지금 장면으로 찍음' + (g.why ? ' (' + await page.evaluate(g.why) + ')' : ''));
  // 그 순간에 세상을 멈춘다 (규칙 한 걸음을 비운다). 그림은 계속 그려서, 떠오르던 글자·반짝이가 사라진 뒤에 찍는다
  await page.evaluate(g.pre);
  await page.evaluate(ns => { window[ns].World.step = () => {}; }, g.ns);
  await page.waitForTimeout(1200);
  const f = await page.evaluate(g.focus);
  const w = Math.min(g.crop.w, g.vp[0]), h = Math.round(w / 2);
  const x = Math.max(g.crop.minX || 0, Math.min(g.vp[0] - w, Math.round(f.x - w * g.crop.fx)));
  const y = Math.max(0, Math.min(g.vp[1] - h, Math.round(f.y - h * g.crop.fy)));
  const png = await page.screenshot({ clip: { x, y, width: w, height: h } });
  if (errors.length) console.log('  ' + g.id + ' 페이지 오류: ' + errors.join(' | '));
  await ctx.close();
  return png;
}

// 브라우저 캔버스로 줄이고 WebP로 (Node에 WebP 도구가 없어도 되게)
async function encode(browser, png) {
  const page = await browser.newPage();
  const out = await page.evaluate(async ({ src, sizes, q }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const res = {};
    for (const W of sizes) {
      const c = document.createElement('canvas');
      c.width = W; c.height = W / 2;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/webp', q));
      if (!blob || blob.type !== 'image/webp') throw new Error('WebP를 못 만듦');
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      res[W] = btoa(s);
    }
    return res;
  }, { src: 'data:image/png;base64,' + png.toString('base64'), sizes: SIZES, q: QUALITY });
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
    const webp = await encode(browser, png);
    for (const W of SIZES) {
      const file = path.join(OUT, g.id + '-' + W + '.webp');
      fs.writeFileSync(file, Buffer.from(webp[W], 'base64'));
      console.log('  ' + path.relative(ROOT, file) + '  ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
