'use strict';
// 화면 흐름 점검: 실제 브라우저(크로미움)로 두 게임(뿅뿅 우주선·냠냠 뱀)을 처음부터 끝까지 한 번씩 넘겨 본다.
// 실행: node tests/flow.test.js
// Playwright가 없으면 건너뛴다 (규칙 테스트 sim.test.js · snake.test.js는 따로 돈다).
// Playwright 위치를 직접 줄 때: PW=/경로/playwright node tests/flow.test.js
const path = require('path');

let pw = null;
for (const p of [process.env.PW, 'playwright', '/opt/node22/lib/node_modules/playwright']) {
  if (!p) continue;
  try { pw = require(p); break; } catch (e) { /* 다음 후보 */ }
}
if (!pw) { console.log('  skip Playwright가 없어 화면 흐름 점검을 건너뜀'); process.exit(0); }

const ROOT = 'file://' + path.resolve(__dirname, '..');
const TAB = { viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

async function open(browser, url, opts) {
  const ctx = await browser.newContext(opts || TAB);
  // 글꼴 서버는 막는다 (없어도 기본 서체로 돈다, 네트워크를 기다리지 않게)
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  return { ctx, page, errors };
}
const on = (page, id) => page.evaluate(i => document.getElementById(i).classList.contains('on'), id);
async function until(page, fn, arg, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(80); }
  return false;
}


(async () => {
  const browser = await pw.chromium.launch();
  console.log('놀이 본부 (게임 고르기)');
  const hb = await open(browser, ROOT + '/index.html');
  const HB = hb.page;
  await test('게임 고르기: 네 게임 카드, 별코인, 오늘의 미션 3개, 기록실', async () => {
    await HB.evaluate(() => { localStorage.clear(); location.reload(); });
    await HB.waitForTimeout(400);
    assert(await HB.evaluate(() => document.querySelectorAll('.pick a').length === 4), '카드 수');
    assert(await HB.evaluate(() => document.getElementById('hub-coins').textContent === '0'), '처음 코인 0');
    assert(await HB.evaluate(() => document.querySelectorAll('#daily .dm').length === 3), '오늘의 미션 3개');
    await HB.tap('#rec-open');
    assert(await HB.evaluate(() => document.getElementById('records').classList.contains('on') && document.querySelectorAll('#rec-rows .grow').length === 4), '기록실');
    await HB.tap('#rec-close');
    assert(await HB.evaluate(() => !document.getElementById('records').classList.contains('on')), '기록실 닫기');
  });
  await test('오늘의 미션을 채우면 받기 버튼 → 누르면 별코인이 는다', async () => {
    await HB.evaluate(() => { const m = HUB.daily()[0]; const d = HUB.DAILY[m.game].find(x => x.text === m.text); HUB.reportRun(m.game, { [d.stat]: m.goal }, 10); renderHub(); });
    assert(await HB.evaluate(() => !!document.querySelector('#daily [data-claim="0"]')), '받기 버튼 없음');
    const want = await HB.evaluate(() => HUB.daily()[0].reward);
    await HB.tap('#daily [data-claim="0"]', { force: true });   // 버튼이 톡톡 튀고 있어서 기다리지 않고 누른다
    assert(await until(HB, w => document.getElementById('hub-coins').textContent === String(w), want), '코인이 안 늘어남');
  });
  await test('별코인은 네 게임이 같이 쓴다: 뿅뿅 우주선에서 번 코인이 게임 고르기에 보인다', async () => {
    const before = await HB.evaluate(() => HUB.coins());
    await HB.goto(ROOT + '/game/index.html');
    assert(await until(HB, () => typeof NG !== 'undefined' && NG.debug && NG.debug.shop), '뿅뿅 우주선이 안 열림');
    assert(await HB.evaluate(b => NG.debug.shop.coins === b, before), '게임 상점이 지갑 잔액을 못 읽음');
    await HB.evaluate(() => NG.debug.giveCoins(250));
    await HB.goto(ROOT + '/index.html');
    assert(await until(HB, b => document.getElementById('hub-coins').textContent === (b + 250).toLocaleString(), before), '게임 고르기에 코인이 안 보임');
  });
  await test('스티커북: 판 결과로 스티커가 붙으면 새 표시, 열면 24칸이 보이고 새 표시가 꺼진다', async () => {
    await HB.evaluate(() => { HUB.reportRun('jump', { height: 120 }, 20); renderHub(); });
    assert(await HB.evaluate(() => !document.getElementById('stk-new').hidden), '새 스티커 표시 없음');
    await HB.tap('#stk-open');
    assert(await until(HB, () => document.getElementById('stickers').classList.contains('on')), '스티커북이 안 열림');
    assert(await HB.evaluate(() => document.querySelectorAll('#stk-list .stk').length === HUB.STICKERS.length && document.querySelectorAll('#stk-list .stk.got').length >= 2), '스티커 칸');
    assert(await HB.evaluate(() => document.getElementById('stk-new').hidden), '열었는데 새 표시가 남음');
    await HB.tap('#stk-close');
  });
  await test('게임 고르기 콘솔 오류 없음', async () => { assert(!hb.errors.length, hb.errors.join(' | ')); });
  await hb.ctx.close();

  console.log('N-GUN');
  const ng = await open(browser, ROOT + '/game/index.html');
  const G = ng.page;
  await test('시작 화면 → 게임 시작', async () => {
    assert(await on(G, 'scr-title'), '시작 화면 아님');
    await G.tap('#btn-start');
    assert(await until(G, () => NG.debug.mode === 'play'), '게임이 시작 안 됨');
  });
  await test('일시정지 → 계속', async () => {
    await G.tap('#btn-pause');
    assert(await until(G, () => NG.debug.mode === 'paused'), '일시정지 안 됨');
    await G.tap('#btn-resume');
    assert(await until(G, () => NG.debug.mode === 'play'), '계속 안 됨');
  });
  await test('웨이브를 넘기면 카드 3장 → 고르면 다시 게임', async () => {
    await G.evaluate(() => { const W = NG.debug.world; W.player.hp = 1e9; for (const e of W.enemies) e.hp = 0; });
    assert(await until(G, () => NG.debug.mode === 'cards', null, 20000), '카드 화면이 안 나옴');
    await G.waitForTimeout(800);                       // 실수로 누르기 방지 시간(0.6초)이 지난 뒤 카드를 누른다
    await G.tap('#card-list .card:first-child');
    assert(await until(G, () => NG.debug.mode === 'play'), '카드 고른 뒤 게임으로 안 돌아감');
  });
  await test('필살기: 게이지가 차면 버튼이 빛나고, 누르면 충격파', async () => {
    await G.evaluate(() => { const p = NG.debug.world.player; p.hp = 1e9; p.ult = 0; });
    await G.waitForTimeout(200);
    assert(await G.evaluate(() => !document.getElementById('btn-ult').classList.contains('ready')), '빈 게이지인데 빛남');
    await G.evaluate(() => { NG.debug.world.player.ult = NG.DATA.ULT.need; });
    assert(await until(G, () => document.getElementById('btn-ult').classList.contains('ready')), '가득 찼는데 안 빛남');
    const b = await G.evaluate(() => { const r = document.getElementById('btn-ult').getBoundingClientRect(); const d = document.getElementById('btn-dash').getBoundingClientRect(); return r.width >= 60 && r.bottom <= d.top && r.top >= 0; });
    assert(b, '필살기 버튼이 대시 버튼 위, 화면 안에 있어야 함');
    await G.tap('#btn-ult');
    assert(await until(G, () => NG.debug.world.stats.ults === 1 && NG.debug.world.player.ult < 1), '눌러도 발동 안 됨');
    await G.evaluate(() => { NG.debug.world.player.hp = 5; });
  });
  await test('체력이 다하면 게임 오버 → 다시 하기', async () => {
    await G.evaluate(() => { const p = NG.debug.world.player; p.hp = 1; p.iframe = 0; });
    // 적을 모두 플레이어 자리로 옮겨 부딪히게 한다
    assert(await until(G, () => { const W = NG.debug.world, p = W.player; for (const e of W.enemies) { e.x = p.x; e.y = p.y; } return NG.debug.mode === 'over'; }, null, 15000), '게임 오버 안 됨');
    await G.tap('#btn-retry');
    assert(await until(G, () => NG.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('상점: 코인이 모자라면 못 사고, 모으면 기체를 사서 고르고 그 기체로 출발', async () => {
    await G.tap('#btn-pause');
    assert(await until(G, () => NG.debug.mode === 'paused'), '일시정지 안 됨');
    await G.tap('#btn-quit');
    assert(await on(G, 'scr-title'), '처음 화면으로 안 감');
    await G.tap('#btn-shop');
    assert(await until(G, () => NG.debug.mode === 'shop'), '상점이 안 열림');
    await G.evaluate(() => { NG.debug.shop.coins = 0; NG.debug.giveCoins(0); });
    await G.tap('#shop-list [data-buy="titan"]');
    assert(await G.evaluate(() => !NG.debug.shop.ships.titan), '코인 없이 샀음');
    await G.evaluate(() => NG.debug.giveCoins(600));
    await G.tap('#shop-list [data-buy="titan"]');
    assert(await until(G, () => NG.debug.shop.ships.titan && NG.debug.shop.coins === 0), '못 삼');
    if (await G.evaluate(() => NG.debug.shop.ship !== 'titan')) await G.tap('#shop-list [data-use="titan"]');
    assert(await until(G, () => NG.debug.shop.ship === 'titan'), '기체가 안 골라짐');
    await G.tap('#btn-shop-back');
    assert(await on(G, 'scr-title'), '상점 닫기 안 됨');
    await G.tap('#btn-start');
    assert(await until(G, () => NG.debug.mode === 'play' && NG.debug.world.player.ship === 'titan'), '고른 기체로 시작 안 함');
  });
  await test('N-GUN 콘솔 오류 없음', async () => { assert(!ng.errors.length, ng.errors.join(' | ')); });
  await ng.ctx.close();

  console.log('N-SNAKE');
  const sn = await open(browser, ROOT + '/snake/index.html');
  const Z = sn.page;
  await test('시작 → 뱀이 움직인다 → 방향을 바꾼다', async () => {
    assert(await on(Z, 'scr-title'), '시작 화면 아님');
    await Z.tap('#btn-start');
    assert(await until(Z, () => SN.debug.mode === 'play'), '게임이 시작 안 됨');
    const head0 = await Z.evaluate(() => SN.debug.world.snake[0].x + ',' + SN.debug.world.snake[0].y);
    await Z.evaluate(() => SN.debug.turn('up'));
    assert(await until(Z, h => { const s = SN.debug.world.snake[0]; return s.x + ',' + s.y !== h; }, head0), '뱀이 안 움직임');
    assert(await Z.evaluate(() => SN.debug.world.dir === 'up' || SN.debug.world.phase === 'over'), '방향이 안 바뀜');
  });
  await test('밀어서(스와이프) 방향을 바꾼다', async () => {
    await Z.evaluate(() => SN.debug.newGame(3));
    await Z.waitForTimeout(200);
    const cdp = await Z.context().newCDPSession(Z);
    const pt = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(640, 400) });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(640, 400 + i * 20) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(await until(Z, () => SN.debug.world.dir === 'down' || SN.debug.world.queue.includes('down')), '아래로 밀었는데 안 바뀜');
  });
  await test('밀기: ㄱ자로 밀면 두 번 꺾이고 민 자리에 화살표가 뜬다', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(false); SN.debug.newGame(6, { mode: 'endless' }); });
    await Z.waitForTimeout(200);
    const cdp = await Z.context().newCDPSession(Z);
    const pt = (x, y) => [{ x, y, id: 3 }];
    const t0 = await Z.evaluate(() => SN.debug.world.turns);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(400, 300) });
    for (let i = 1; i <= 3; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(400, 300 + i * 15) });
    assert(await Z.evaluate(() => !!SN.debug.pad.swipe && SN.debug.pad.swipe.dir === 'down'), '민 자리에 화살표가 안 뜸');
    for (let i = 1; i <= 3; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(400 - i * 15, 345) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(await until(Z, t => SN.debug.world.turns - t >= 2 || SN.debug.world.phase === 'over', t0, 3000), 'ㄱ자 밀기에서 두 번 안 꺾임');
  });
  await test('밀기: 아주 짧게 튕기듯 밀어도 뗄 때 꺾인다', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(false); SN.debug.newGame(7, { mode: 'endless' }); });
    await Z.waitForTimeout(200);
    const cdp = await Z.context().newCDPSession(Z);
    const th = await Z.evaluate(() => SN.debug.pad.threshold);
    const pt = (x, y) => [{ x, y, id: 4 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(500, 300) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(500, 300 - th * 0.7) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(await until(Z, () => SN.debug.world.dir === 'up' || SN.debug.world.queue.includes('up')), '짧은 튕기기를 못 알아들음');
  });
  await test('쉬움(기본): 조이스틱·버튼 없이 판이 화면 가득, 화면을 밀면 출발·방향 전환, 판 끝을 넘으면 반대편', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(true); SN.debug.newGame(8, { mode: 'endless' }); });
    await Z.waitForTimeout(300);
    const st = await Z.evaluate(() => ({ w: innerWidth, bw: SN.debug.view.bw, pad: !!document.getElementById('dpad') }));
    assert(st.bw >= st.w * 0.85 && !st.pad, '판이 줄어들었거나 버튼이 남음 ' + JSON.stringify(st));
    assert(await Z.evaluate(() => SN.debug.world.wait > 0 && SN.debug.world.ticks === 0), '누르기 전에 출발함');
    const cdp = await Z.context().newCDPSession(Z);
    const pt = (x, y) => [{ x, y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(900, 300) });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(900, 300 + i * 15) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(await until(Z, () => SN.debug.world.dir === 'down' && SN.debug.world.ticks > 0), '밀어서 출발·방향 전환 안 됨');
    await Z.evaluate(() => { const W = SN.debug.world; W.snake = W.snake.map((p, i) => ({ x: W.cols - 1 - i, y: 3 })); W.prev = W.snake.slice(); W.dir = 'right'; W.queue.length = 0; W.item = null; W.itemT = 99; });
    assert(await until(Z, () => SN.debug.world.snake[0].x < 3 && SN.debug.mode === 'play', null, 4000), '쉬움에서 판 끝을 넘지 못함');
  });
  await test('위험 경고: 보통에서 판 끝 앞이면 "위험!" 표시 정보가 생긴다', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(false); SN.debug.newGame(5, { mode: 'endless' }); SN.debug.pause(); });
    await Z.evaluate(() => { const W = SN.debug.world; W.snake = W.snake.map((p, i) => ({ x: W.cols - 2 - i, y: 5 })); W.prev = W.snake.slice(); W.dir = 'right'; W.queue.length = 0; W.wait = 0; W.acc = 0; SN.debug.resume(); });
    assert(await until(Z, () => { const d = SN.debug.view.danger; return d && d.cause === 'edge'; }, null, 3000), '판 끝 경고 없음');
  });
  await test('벽에 부딪히면 게임 오버 → 다시 하기', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(false); SN.debug.newGame(4, { mode: 'endless' }); });
    await Z.evaluate(() => { const W = SN.debug.world; W.snake[0].x = W.cols - 1; W.dir = 'right'; W.queue.length = 0; W.wait = 0; });
    assert(await until(Z, () => SN.debug.mode === 'over', null, 6000), '게임 오버 안 됨');
    assert(await until(Z, () => document.getElementById('scr-over').classList.contains('on'), null, 4000), '게임 오버 화면 안 나옴');
    await Z.tap('#btn-retry');
    assert(await until(Z, () => SN.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('스테이지: 레벨 고르기 → 목표를 채우면 다음 레벨, 기록과 메달 판', async () => {
    await Z.evaluate(() => SN.debug.toTitle());
    await Z.tap('#btn-stage');
    assert(await until(Z, () => document.getElementById('scr-stage').classList.contains('on')), '스테이지 화면이 안 나옴');
    assert(await Z.evaluate(() => document.querySelectorAll('#level-list .lvl').length === 12 && document.querySelectorAll('#level-list .lvl.locked').length === 12 - SN.debug.rec.stage.max - 1), '레벨 칸·잠금');
    await Z.tap('#level-list .lvl:nth-child(1)');
    assert(await until(Z, () => SN.debug.mode === 'play' && SN.debug.world.mode === 'stage' && SN.debug.world.level === 1), '레벨 1이 시작 안 됨');
    await Z.evaluate(() => { const W = SN.debug.world; W.got = W.goal - 1; SN.debug.autopilot(true); });
    assert(await until(Z, () => SN.debug.world.level === 2, null, 15000), '다음 레벨로 안 넘어감');
    assert(await Z.evaluate(() => SN.debug.rec.stage.max >= 1), '스테이지 기록이 안 남음');
    await Z.evaluate(() => { SN.debug.autopilot(false); SN.debug.toTitle(); });
    await Z.tap('#btn-medals');
    assert(await until(Z, () => document.getElementById('scr-medals').classList.contains('on')), '메달 화면이 안 나옴');
    assert(await Z.evaluate(() => document.querySelectorAll('#medal-list .medal').length === SN.DATA.MEDALS.length), '메달 칸 수');
    await Z.tap('#btn-medals-back');
    assert(await until(Z, () => SN.debug.mode === 'title' && document.getElementById('scr-title').classList.contains('on')), '닫기');
  });
  await test('N-SNAKE 콘솔 오류 없음', async () => { assert(!sn.errors.length, sn.errors.join(' | ')); });
  await sn.ctx.close();

  console.log('통통 점프');
  const jp = await open(browser, ROOT + '/jump/index.html');
  const J = jp.page;
  await test('시작 → 통통 뛰고, 화면 오른쪽을 누르고 있으면 오른쪽으로 간다', async () => {
    assert(await on(J, 'scr-title'), '시작 화면 아님');
    await J.tap('#btn-start');
    assert(await until(J, () => JP.debug.mode === 'play'), '게임이 시작 안 됨');
    const cdp = await J.context().newCDPSession(J);
    const x0 = await J.evaluate(() => JP.debug.world.p.x);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1180, y: 500, id: 6 }] });
    assert(await until(J, () => JP.debug.world.input.dir === 1, null, 2000), '오른쪽을 눌렀는데 방향이 안 잡힘');
    await J.waitForTimeout(300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const moved = await J.evaluate(x => { const d = JP.debug.world.p.x - x; return d !== 0; }, x0);
    assert(moved, '캐릭터가 안 움직임');
    assert(await until(J, () => JP.debug.world.input.dir === 0, null, 2000), '손을 뗐는데 계속 움직임');
  });
  await test('쉬움: 떨어지면 구조 구름이 3번 살려 주고, 그다음 떨어지면 게임 오버 → 다시 하기', async () => {
    await J.evaluate(() => { JP.debug.setEasy(true); JP.debug.newGame(5, { easy: true }); JP.debug.autopilot(false); });
    // 발판을 계속 치워 떨어지게 한다
    assert(await until(J, () => { const W = JP.debug.world; W.plats.length = 0; return W.rescued >= 3 || JP.debug.mode === 'over'; }, null, 30000), '구조 구름이 3번 안 나옴');
    assert(await until(J, () => { const W = JP.debug.world; W.plats.length = 0; return JP.debug.mode === 'over'; }, null, 20000), '게임 오버 안 됨');
    assert(await J.evaluate(() => JP.debug.world.rescued === 3), '구조 횟수가 3이 아님');
    assert(await until(J, () => document.getElementById('scr-over').classList.contains('on'), null, 4000), '게임 오버 화면 안 나옴');
    await J.tap('#btn-retry');
    assert(await until(J, () => JP.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('통통 점프 콘솔 오류 없음', async () => { assert(!jp.errors.length, jp.errors.join(' | ')); });
  await jp.ctx.close();

  console.log('슝슝 우주 달리기');
  const rn = await open(browser, ROOT + '/runner/index.html');
  const U = rn.page;
  await test('시작 → 옆으로 밀면 줄이 바뀌고, 위로 밀면 뛴다', async () => {
    assert(await on(U, 'scr-title'), '시작 화면 아님');
    await U.tap('#btn-start');
    assert(await until(U, () => RN.debug.mode === 'play'), '게임이 시작 안 됨');
    const cdp = await U.context().newCDPSession(U);
    const swipe = async (x0, y0, dx, dy) => {
      const pt = (x, y) => [{ x, y, id: 5 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
      for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + dx * i / 4, y0 + dy * i / 4) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const l0 = await U.evaluate(() => RN.debug.world.p.lane);
    await swipe(640, 500, 120, 0);
    assert(await until(U, l => RN.debug.world.p.lane === Math.min(2, l + 1), l0), '오른쪽으로 밀었는데 줄이 안 바뀜');
    await swipe(640, 500, 0, -120);
    assert(await until(U, () => RN.debug.world.p.y > 0, null, 2000), '위로 밀었는데 안 뜀');
  });
  await test('부딪혀서 하트가 다하면 게임 오버 → 다시 하기', async () => {
    await U.evaluate(() => { const W = RN.debug.world; W.hearts = 1; W.inv = 0; RN.debug.autopilot(false); });
    // 운석이 나올 때까지 줄을 바꾸지 않고 가만히 있는다 (쉬움은 느리므로 넉넉히 기다린다)
    assert(await until(U, () => { const W = RN.debug.world; W.inv = 0; W.shield = false; if (W.eff) for (const k in W.eff) W.eff[k] = 0; return RN.debug.mode === 'over'; }, null, 40000), '게임 오버 안 됨');
    assert(await until(U, () => document.getElementById('scr-over').classList.contains('on'), null, 4000), '게임 오버 화면 안 나옴');
    await U.tap('#btn-retry');
    assert(await until(U, () => RN.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('슝슝 우주 달리기 콘솔 오류 없음', async () => { assert(!rn.errors.length, rn.errors.join(' | ')); });
  await rn.ctx.close();

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
