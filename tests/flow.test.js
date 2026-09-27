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
    // 카드는 폴더가 아니라 index.html로 (파일로 바로 열어도 열리게)
    const hrefs = await HB.evaluate(() => [...document.querySelectorAll('.pick a')].map(a => a.getAttribute('href')).join());
    assert(hrefs === 'game/index.html,snake/index.html,jump/index.html,runner/index.html', '카드 주소 ' + hrefs);
    await HB.tap('#rec-open');
    assert(await HB.evaluate(() => document.getElementById('records').classList.contains('on') && document.querySelectorAll('#rec-rows .grow').length === 4), '기록실');
    // 아직 한 게임도 안 열었어도 메달 합계는 네 게임 메달 수
    const tot = await HB.evaluate(() => document.querySelector('#rec-tot div:nth-child(2) dd').textContent);
    assert(/^0 \/ \d{2,}$/.test(tot) && Number(tot.split('/ ')[1]) >= 70, '메달 합계 ' + tot);
    await HB.tap('#rec-close');
    assert(await HB.evaluate(() => !document.getElementById('records').classList.contains('on')), '기록실 닫기');
  });
  await test('오늘의 미션을 채우면 받기 버튼 → 누르면 별코인이 는다', async () => {
    await HB.evaluate(() => { const m = HUB.daily()[0]; const d = HUB.DAILY[m.game].find(x => x.text === m.text); HUB.reportRun(m.game, { [d.stat]: m.goal }, 10); renderHub(); });
    assert(await HB.evaluate(() => !!document.querySelector('#daily [data-claim="0"]')), '받기 버튼 없음');
    const want = await HB.evaluate(() => HUB.daily()[0].reward);
    await HB.tap('#daily [data-claim="0"]', { force: true });   // 나타나자마자 누르면(아이가 톡톡 두드리다) 안 받는다
    await HB.waitForTimeout(100);
    assert(await HB.evaluate(() => HUB.coins() === 0 && !!document.querySelector('#daily [data-claim="0"]')), '0.5초 안에 눌렀는데 받아짐');
    await HB.waitForTimeout(550);
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
    // 다른 곳에서 지갑이 바뀐 뒤 화면이 다시 보이면 새로 읽는다 (옛 잔액이 남지 않게)
    await HB.evaluate(() => { HUB.addCoins(7); document.dispatchEvent(new Event('visibilitychange')); });
    assert(await until(HB, b => document.getElementById('hub-coins').textContent === (b + 257).toLocaleString(), before), '다시 보일 때 지갑을 새로 안 읽음');
  });
  await test('스티커북: 판 결과로 스티커가 붙으면 새 표시, 열면 모든 칸이 보이고 새 표시가 꺼진다', async () => {
    await HB.evaluate(() => { HUB.reportRun('jump', { height: 120 }, 20); renderHub(); });
    assert(await HB.evaluate(() => !document.getElementById('stk-new').hidden), '새 스티커 표시 없음');
    await HB.tap('#stk-open');
    assert(await until(HB, () => document.getElementById('stickers').classList.contains('on')), '스티커북이 안 열림');
    assert(await HB.evaluate(() => document.querySelectorAll('#stk-list .stk').length === HUB.STICKERS.length && document.querySelectorAll('#stk-list .stk.got').length >= 2), '스티커 칸');
    assert(await HB.evaluate(() => document.getElementById('stk-new').hidden), '열었는데 새 표시가 남음');
    await HB.tap('#stk-close');
  });
  await test('소리 단추: 누르면 네 게임 함께 꺼지고(play.sound1) 다시 누르면 켜진다, 누르면 소리 판이 열린다', async () => {
    assert(await HB.evaluate(() => typeof SND !== 'undefined' && !SND.muted() && !document.getElementById('snd-btn').classList.contains('off')), '처음 켬');
    assert(await HB.evaluate(() => { const b = document.getElementById('snd-btn').getBoundingClientRect(); return b.width >= 40 && b.height >= 40 && b.right <= innerWidth && b.top >= 0; }), '소리 단추 크기·자리');
    await HB.tap('#snd-btn');
    assert(await HB.evaluate(() => SND.muted() && JSON.parse(localStorage.getItem('play.sound1')).muted === true && document.getElementById('snd-btn').classList.contains('off')), '끔');
    await HB.tap('#snd-btn');
    assert(await HB.evaluate(() => !SND.muted() && !document.getElementById('snd-btn').classList.contains('off')), '다시 켬');
    assert(await until(HB, () => SND.ready()), '눌렀는데 소리 판이 안 열림');
    // 다른 페이지(게임)에서 바꾼 것도 따라온다 (storage 이벤트)
    await HB.evaluate(() => { localStorage.setItem('play.sound1', JSON.stringify({ muted: true, music: true, fx: true })); window.dispatchEvent(new StorageEvent('storage', { key: 'play.sound1' })); });
    assert(await HB.evaluate(() => SND.muted() && document.getElementById('snd-btn').classList.contains('off')), '다른 곳에서 끈 것이 안 따라옴');
    await HB.evaluate(() => SND.setMuted(false));
  });
  await test('게임 카드를 누르면 톡 소리를 내고 0.15초 안에 게임으로 넘어간다', async () => {
    await HB.evaluate(() => {
      const a = document.querySelector('.pick a.snake');
      a.addEventListener('click', () => { localStorage.setItem('x.navAt', String(Date.now())); }, true);
      window.addEventListener('pagehide', () => { localStorage.setItem('x.navGone', String(Date.now())); });
    });
    await Promise.all([HB.waitForURL(u => /\/snake\/index\.html$/.test(String(u)), { timeout: 5000 }), HB.tap('.pick a.snake')]);
    const d = await HB.evaluate(() => Number(localStorage.getItem('x.navGone')) - Number(localStorage.getItem('x.navAt')));
    assert(d >= 0 && d < 150 + 100, '넘어가기까지 ' + d + 'ms');
    await HB.evaluate(() => { localStorage.removeItem('x.navAt'); localStorage.removeItem('x.navGone'); });
    await HB.goto(ROOT + '/index.html');
    assert(await until(HB, () => document.querySelectorAll('.pick a').length === 4), '돌아오기');
  });
  await test('게임 고르기 콘솔 오류 없음', async () => { assert(!hb.errors.length, hb.errors.join(' | ')); });
  await hb.ctx.close();
  // 두 탭 크기에서 글자: 카드 제목은 한 줄, 설명은 잘리지 않고, 미션 글은 15px 이상 (글꼴 서버를 막아 넓은 기본 서체로)
  for (const vp of [{ width: 1280, height: 800 }, { width: 893, height: 533 }]) {
    const sm = await open(browser, ROOT + '/index.html', Object.assign({}, TAB, { viewport: vp }));
    await test('게임 고르기 글자 ' + vp.width + 'x' + vp.height + ': 제목 한 줄, 설명 안 잘림, 미션 글 크게', async () => {
      await sm.page.waitForTimeout(700);
      const r = await sm.page.evaluate(() => {
        const out = [];
        for (const a of document.querySelectorAll('.pick a')) {
          const b = a.querySelector('b'), sm = a.querySelector('small');
          const fs = parseFloat(getComputedStyle(b).fontSize);
          if (b.getBoundingClientRect().height > fs * 1.6) out.push('제목 두 줄 ' + b.textContent);
          if (b.scrollWidth > a.clientWidth) out.push('제목 넘침 ' + b.textContent);
          if (sm.scrollWidth > sm.clientWidth + 1 || sm.scrollHeight > sm.clientHeight + 1 || getComputedStyle(sm).textOverflow === 'ellipsis') out.push('설명 잘림 ' + sm.textContent);
          if (sm.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom) out.push('설명이 카드 밖 ' + sm.textContent);
        }
        for (const t of document.querySelectorAll('#daily .dm .t')) {
          const f = parseFloat(getComputedStyle(t).fontSize);
          if (f < 15) out.push('미션 글 ' + f + 'px');
        }
        for (const t of document.querySelectorAll('#daily .dm .row')) if (parseFloat(getComputedStyle(t).fontSize) < 14) out.push('진행 글 작음');
        const last = document.querySelector('.pick a:last-child').getBoundingClientRect();
        if (last.bottom > innerHeight + 1) out.push('카드가 화면 밖 ' + Math.round(last.bottom));
        return out;
      });
      assert(!r.length, r.join(' | '));
      assert(!sm.errors.length, sm.errors.join(' | '));
    });
    await sm.ctx.close();
  }

  console.log('N-GUN');
  const ng = await open(browser, ROOT + '/game/index.html');
  const G = ng.page;
  await test('처음 켠 기기는 쉬움, 시작 화면에 게임 고르기(집) 버튼', async () => {
    await G.evaluate(() => { localStorage.removeItem('ngun.diff'); location.reload(); });
    await G.waitForTimeout(400);
    assert(await G.evaluate(() => NG.debug.diff === 'easy'), '처음 난이도가 쉬움이 아님');
    assert(await G.evaluate(() => { const b = document.getElementById('btn-hub').getBoundingClientRect(); return b.width >= 40 && b.top >= 0; }), '집 버튼이 안 보임');
  });
  await test('시작 화면 → 게임 시작', async () => {
    assert(await on(G, 'scr-title'), '시작 화면 아님');
    await G.tap('#btn-start');
    assert(await G.evaluate(() => { const b = document.getElementById('btn-hub').getBoundingClientRect(); return b.width === 0; }), '게임 중에 집 버튼이 보임');
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
  await test('누르고 있던 엄지는 카드를 고른 뒤에도 계속 움직인다, 손바닥은 무시', async () => {
    const cdp = await G.context().newCDPSession(G);
    const pt = (x, y, r) => [{ x, y, id: 7, radiusX: r || 8, radiusY: r || 8 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(200, 600) });
    assert(await until(G, () => !!NG.debug.touch.move), '엄지가 안 잡힘');
    // 이번 웨이브 적을 모두 없애 카드 화면을 부른다
    assert(await until(G, () => { const W = NG.debug.world; W.player.hp = 1e9; W.spawnQueue.length = 0; for (const e of W.enemies) if (!e.dead) NG.World.killEnemy(W, e, 0, 0); return NG.debug.mode === 'cards'; }, null, 20000), '카드 화면이 안 나옴');
    await G.evaluate(() => { NG.debug.world.player.hp = 5; });
    await G.waitForTimeout(700);
    await G.evaluate(() => NG.debug.choose(0));
    assert(await until(G, () => NG.debug.mode === 'play'), '카드 고르기 안 됨');
    assert(await G.evaluate(() => !!NG.debug.touch.move), '카드 고른 뒤 엄지가 풀림');
    const x0 = await G.evaluate(() => NG.debug.world.player.x);
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(200 + i * 20, 600) });
    assert(await until(G, x => NG.debug.world.player.x > x + 20, x0), '엄지를 밀어도 안 움직임');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(await until(G, () => !NG.debug.touch.move), '떼도 스틱이 남음');
    // 손바닥(닿은 면 지름 70px 넘음)은 스틱을 잡지 않는다
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(200, 600, 50) });
    await G.waitForTimeout(150);
    assert(await G.evaluate(() => !NG.debug.touch.move), '손바닥이 스틱을 잡음');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  await test('보스를 처음 이기면 보스 스티커 창, 기록에 남는다', async () => {
    await G.evaluate(() => { delete NG.debug.medals.bossKinds.octa; const W = NG.debug.world; W.bossKills = 0; const b = NG.World.spawnEnemy(W, 'boss'); b.spawnT = 0; NG.World.killEnemy(W, b, 0, 0); });
    assert(await until(G, () => document.getElementById('sticker').classList.contains('on')), '스티커 창이 안 뜸');
    assert(await G.evaluate(() => !!NG.debug.medals.bossKinds.octa && /옥타/.test(document.getElementById('sticker-name').textContent)), '보스 기록이 안 남음');
    assert(await until(G, () => !document.getElementById('sticker').classList.contains('on'), null, 5000), '스티커 창이 안 사라짐');
  });
  await test('지면 한 번 더! → 누르면 그 자리에서 다시, 또 지면 결과 화면 → 다시 하기', async () => {
    const die = () => until(G, () => { if (NG.debug.mode === 'cards') NG.debug.choose(0); const W = NG.debug.world, p = W.player; p.hp = Math.min(p.hp, 1); p.iframe = 0; p.dashT = 0; p.shield = 0; if (!W.enemies.length) NG.World.spawnEnemy(W, 'grunt'); for (const e of W.enemies) { e.spawnT = 0; e.x = p.x; e.y = p.y; } return /continue|over/.test(NG.debug.mode); }, null, 15000);
    assert(await die(), '안 짐');
    // 뜨자마자 누른 것은 무시 (0.6초, 아이들이 계속 두드려서)
    assert(await G.evaluate(() => { document.getElementById('btn-again').click(); return NG.debug.mode === 'continue'; }), '뜨자마자 누른 것이 먹힘');
    assert(await until(G, () => NG.debug.mode === 'continue' && document.getElementById('scr-continue').classList.contains('on')), '한 번 더! 화면이 안 뜸');
    await G.waitForTimeout(700);
    await G.tap('#btn-again');
    assert(await until(G, () => NG.debug.mode === 'play' && NG.debug.world.revives === 1 && NG.debug.world.player.iframe > 2), '되살아나지 않음');
    await G.waitForTimeout(3200);
    assert(await die(), '두 번째에 안 짐');
    assert(await until(G, () => NG.debug.mode === 'over' && document.getElementById('scr-over').classList.contains('on'), null, 4000), '두 번째엔 결과 화면이어야 함');
    assert(await G.evaluate(() => { document.getElementById('btn-retry').click(); return NG.debug.mode === 'over'; }), '결과 화면이 뜨자마자 누른 것이 먹힘');
    await G.waitForTimeout(700);
    await G.tap('#btn-retry');
    assert(await until(G, () => NG.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('일시정지 → 처음 화면으로: 판 기록·코인·본부 알림을 남기고, 바로 그만두면 시작 아이템을 돌려준다', async () => {
    const g0 = await G.evaluate(() => NG.debug.medals.life.games);
    await G.tap('#btn-pause');
    await G.tap('#btn-quit');
    assert(await until(G, () => NG.debug.mode === 'title'), '처음 화면으로 안 감');
    assert(await G.evaluate(g => NG.debug.medals.life.games === g + 1 && !!NG.debug.lastEarn, g0), '그만둔 판이 기록에 안 남음');
    await G.evaluate(() => { NG.debug.shop.items.shield = 1; NG.debug.giveCoins(0); });
    await G.tap('#btn-start');
    assert(await until(G, () => NG.debug.mode === 'play' && NG.debug.world.player.shield === 1 && NG.debug.shop.items.shield === 0), '시작 아이템이 안 쓰임');
    await G.tap('#btn-pause');
    await G.tap('#btn-quit');
    assert(await until(G, () => NG.debug.mode === 'title' && NG.debug.shop.items.shield === 1), '바로 그만뒀는데 시작 아이템이 안 돌아옴');
    await G.tap('#btn-start');
    assert(await until(G, () => NG.debug.mode === 'play'), '다시 시작 안 됨');
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
  await test('소리: 공통 SND로 소리 판이 열리고, 음악은 지금 행성·보스를 따르고, 끄기·음악 단추는 play.sound1에 저장', async () => {
    assert(await G.evaluate(() => typeof SND !== 'undefined' && typeof NG.Audio.event === 'function'), 'SND 없음');
    assert(await until(G, () => SND.ready() && SND.music.playing()), '소리 판이 안 열리거나 음악이 안 남');
    assert(await G.evaluate(() => SND.music.mood().planet === NG.debug.world.place.planet.id), '음악이 지금 행성이 아님');
    await G.evaluate(() => NG.debug.world.events.push('boss'));
    assert(await until(G, () => SND.music.mood().boss), '보스 웨이브에 보스 분위기가 아님');
    await G.evaluate(() => NG.debug.world.events.push('bossDown'));
    assert(await until(G, () => !SND.music.mood().boss), '보스를 이겼는데 보스 분위기 그대로');
    await G.tap('#btn-mute');
    assert(await G.evaluate(() => SND.muted() && JSON.parse(localStorage.getItem('play.sound1')).muted === true && document.getElementById('btn-mute').classList.contains('muted')), '끄기가 안 됨');
    await G.tap('#btn-mute');
    assert(await G.evaluate(() => !SND.muted() && !document.getElementById('btn-mute').classList.contains('muted')), '다시 켜기가 안 됨');
    await G.tap('#btn-pause');
    assert(await until(G, () => NG.debug.mode === 'paused'), '일시정지 안 됨');
    await G.tap('#scr-pause [data-audio="music"]');
    assert(await G.evaluate(() => !SND.musicOn() && JSON.parse(localStorage.getItem('play.sound1')).music === false && document.querySelector('#scr-pause [data-audio="music"] .state').textContent === '끔'), '음악 끄기가 안 됨');
    await G.tap('#scr-pause [data-audio="music"]');
    assert(await G.evaluate(() => SND.musicOn() && document.querySelector('#scr-title [data-audio="music"]').getAttribute('aria-pressed') === 'true'), '음악 다시 켜기가 안 됨');
    assert(await G.evaluate(() => localStorage.getItem('ngun.muted') === null || localStorage.getItem('ngun.muted') === 'false'), '옛 키에 저장함');
    await G.tap('#btn-resume');
    assert(await until(G, () => NG.debug.mode === 'play'), '계속 안 됨');
  });
  await test('N-GUN 콘솔 오류 없음', async () => { assert(!ng.errors.length, ng.errors.join(' | ')); });
  await ng.ctx.close();
  await test('뿅뿅 우주선 탭 A(893×533): 새 메달이 많아도 다시 하기·게임 고르기 버튼이 화면 안, 집 버튼은 게임 고르기로', async () => {
    const a7 = await open(browser, ROOT + '/game/index.html', Object.assign({}, TAB, { viewport: { width: 893, height: 533 } }));
    const P = a7.page;
    await P.evaluate(() => { NG.debug.newGame(); const W = NG.debug.world; W.canRevive = false; for (const m of NG.DATA.MEDALS.slice(0, 10)) NG.debug.runMedals.push(m); });
    await P.evaluate(() => { const W = NG.debug.world; W.revives = 1; });
    assert(await until(P, () => { const W = NG.debug.world, p = W.player; p.hp = Math.min(p.hp, 1); p.iframe = 0; p.dashT = 0; p.shield = 0; if (!W.enemies.length) NG.World.spawnEnemy(W, 'grunt'); for (const e of W.enemies) { e.spawnT = 0; e.x = p.x; e.y = p.y; } return NG.debug.mode === 'over'; }, null, 15000), '결과 화면이 안 나옴');
    assert(await until(P, () => document.getElementById('scr-over').classList.contains('on')), '결과 화면이 안 보임');
    await P.waitForTimeout(400);
    const fit = await P.evaluate(() => ['btn-retry', 'btn-over-hub', 'btn-home'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 0; }));
    assert(fit.every(Boolean), '버튼이 화면 밖 ' + JSON.stringify(fit));
    await P.waitForTimeout(400);
    await P.tap('#btn-home');
    assert(await until(P, () => NG.debug.mode === 'title'), '처음 화면으로 안 감');
    await Promise.all([P.waitForURL(u => /\/index\.html$/.test(String(u)) && !/\/game\//.test(String(u)), { timeout: 8000 }), P.tap('#btn-hub')]);
    assert(!a7.errors.length, a7.errors.join(' | '));
    await a7.ctx.close();
  });

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
  await test('벽에 부딪히면 "한 번 더!" → 그만하기 → 결과 화면 → 다시 하기 (막 뜬 화면은 누름 무시)', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(false); SN.debug.newGame(4, { mode: 'endless' }); });
    await Z.evaluate(() => { const W = SN.debug.world; W.snake[0].x = W.cols - 1; W.dir = 'right'; W.queue.length = 0; W.wait = 0; });
    assert(await until(Z, () => SN.debug.mode === 'cont', null, 6000), '한 번 더 묻기가 안 나옴');
    assert(await until(Z, () => document.getElementById('scr-cont').classList.contains('on'), null, 4000), '한 번 더 화면 안 나옴');
    // 막 뜬 화면(0.6초 안)에서 누른 것은 무시 (탭은 화면이 멈출 때까지 기다리므로 바로 누르기로)
    assert(await Z.evaluate(() => { document.getElementById('btn-giveup').click(); return SN.debug.mode === 'cont'; }), '막 뜬 화면에서 누른 것이 먹힘');
    await Z.waitForTimeout(700);
    await Z.tap('#btn-giveup');
    assert(await until(Z, () => SN.debug.mode === 'over' && document.getElementById('scr-over').classList.contains('on'), null, 4000), '결과 화면 안 나옴');
    assert(await Z.evaluate(() => { const b = document.getElementById('btn-retry').getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0; }), '다시 하기 단추가 화면 밖');
    await Z.waitForTimeout(700);
    await Z.tap('#btn-retry');
    assert(await until(Z, () => SN.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('한 번 더!: 누르면 길이 그대로 유령으로 되살아나고, 두 번째로 부딪히면 바로 결과 화면', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(false); SN.debug.newGame(9, { mode: 'endless', rival: false }); });
    await Z.evaluate(() => { const W = SN.debug.world; W.snake = W.snake.map((p, i) => ({ x: W.cols - 1 - i, y: 4 })); W.prev = W.snake.slice(); W.dir = 'right'; W.queue.length = 0; W.wait = 0; W.grow = 3; });
    assert(await until(Z, () => SN.debug.mode === 'cont' && document.getElementById('scr-cont').classList.contains('on'), null, 6000), '한 번 더 화면 안 나옴');
    const len = await Z.evaluate(() => SN.debug.world.snake.length);
    await Z.waitForTimeout(700);
    await Z.tap('#btn-cont');
    assert(await until(Z, () => SN.debug.mode === 'play' && SN.debug.world.eff.ghost > 0), '되살아나지 않음');
    assert(await Z.evaluate(l => SN.debug.world.snake.length === l && SN.debug.world.dir !== 'right', len), '길이·방향');
    await Z.evaluate(() => { const W = SN.debug.world; W.eff.ghost = 0; W.snake = W.snake.map((p, i) => ({ x: W.cols - 1 - i, y: 8 })); W.prev = W.snake.slice(); W.dir = 'right'; W.queue.length = 0; W.wait = 0; });
    assert(await until(Z, () => SN.debug.mode === 'over', null, 6000), '두 번째는 바로 결과');
  });
  await test('멈춤 → 처음 화면으로: 판을 정리하고(판 수·코인) 나간다, 시작 화면에서 소리 단추를 누를 수 있다', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(true); SN.debug.newGame(10, { mode: 'endless' }); });
    const g0 = await Z.evaluate(() => SN.debug.rec.total.games);
    await Z.evaluate(() => { SN.debug.world.score = 400; SN.debug.world.eaten = 5; SN.debug.pause(); });
    await Z.tap('#btn-quit');
    assert(await until(Z, () => SN.debug.mode === 'title'), '처음 화면으로 안 감');
    assert(await Z.evaluate(g => SN.debug.rec.total.games === g + 1 && SN.debug.lastEarn && SN.debug.lastEarn.coins >= 20, g0), '판 정리가 안 됨');
    const hit = await Z.evaluate(() => { const r = document.getElementById('btn-mute').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && !!el.closest('#btn-mute'); });
    assert(hit, '시작 화면에서 소리 단추가 가려짐');
    assert(await Z.evaluate(() => getComputedStyle(document.getElementById('btn-hub')).display !== 'none'), '집 단추가 안 보임');
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
    // 메달 화면에서 Enter를 눌러도 무한 모드가 시작되지 않고, 위쪽 닫기 단추가 넘기지 않아도 보인다
    await Z.keyboard.press('Enter');
    assert(await Z.evaluate(() => SN.debug.mode === 'medals'), 'Enter로 게임이 시작됨');
    assert(await Z.evaluate(() => { const r = document.getElementById('btn-medals-x').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), '닫기 단추가 안 보임');
    await Z.tap('#btn-medals-x');
    assert(await until(Z, () => SN.debug.mode === 'title' && document.getElementById('scr-title').classList.contains('on')), '닫기');
  });
  await test('단계 별: 깬 단계에 별이 보이고, 4단계는 대왕 뱀 (게이지를 채우면 성공)', async () => {
    await Z.tap('#btn-stage');
    assert(await until(Z, () => SN.debug.mode === 'stage'), '스테이지 화면');
    await Z.keyboard.press('Space');
    assert(await Z.evaluate(() => SN.debug.mode === 'stage'), 'Space로 게임이 시작됨');
    assert(await Z.evaluate(() => { const b = document.querySelector('#level-list .lvl:nth-child(1) .lvl-stars'); return b && /★/.test(b.textContent) && !b.classList.contains('none'); }), '1단계 별이 안 보임');
    assert(await Z.evaluate(() => document.querySelector('#level-list .lvl:nth-child(4)').classList.contains('boss')), '4단계 대왕 뱀 표시');
    await Z.evaluate(() => { SN.debug.rec.stage.max = Math.max(SN.debug.rec.stage.max, 3); SN.debug.newGame(2, { mode: 'stage', level: 4 }); });
    assert(await until(Z, () => SN.debug.mode === 'play' && SN.debug.world.boss && SN.debug.world.rival && SN.debug.world.rival.boss), '대왕 뱀 단계가 아님');
    assert(await until(Z, () => SND.music.mood().boss && SND.music.playing()), '대왕 뱀 음악(단조·힘차게)');
    await Z.evaluate(() => { const W = SN.debug.world; W.wait = 0; W.rival.bitten = W.rival.need - 1; SN.debug.autopilot(true); });
    assert(await until(Z, () => SN.debug.world && (SN.debug.world.level === 5 || SN.debug.world.bossWins >= 1), null, 20000), '대왕 뱀을 못 쓰러뜨림');
    assert(await until(Z, () => SN.debug.rec.stage.stars[4] >= 1, null, 4000), '4단계 별 기록이 없음');
    await Z.evaluate(() => { SN.debug.autopilot(false); SN.debug.toTitle(); });
  });
  await test('소리(SND): 소리 단추는 네 게임 함께, 시작 화면·행성 음악, 쉬움 차분·피버, 멈춤에서 작게·음악 켜기 끄기', async () => {
    // 공통 효과음·게임 효과음 엿듣기 (소리 이름만 적는다)
    await Z.evaluate(() => {
      window._ui = []; window._sn = [];
      const u = SND.ui; SND.ui = (n, o) => { window._ui.push(n + (o && o.hi ? '!' : '')); return u(n, o); };
      const p = SN.Audio.play; SN.Audio.play = (n, o) => { window._sn.push(n); return p(n, o); };
      SN.debug.toTitle();
    });
    assert(await Z.evaluate(() => SND.music.playing() && SND.music.mood().planet === 'title'), '시작 화면 음악');
    assert(await Z.evaluate(() => typeof SND !== 'undefined' && !SND.muted() && !document.getElementById('btn-mute').classList.contains('muted')), '처음 켬');
    await Z.tap('#btn-mute');
    assert(await Z.evaluate(() => SND.muted() && JSON.parse(localStorage.getItem('play.sound1')).muted === true && document.getElementById('btn-mute').classList.contains('muted')), '끔');
    assert(await Z.evaluate(() => localStorage.getItem('snake.muted') === null), '옛 snake.muted에 저장함');
    await Z.tap('#btn-mute');
    assert(await Z.evaluate(() => !SND.muted() && !document.getElementById('btn-mute').classList.contains('muted')), '다시 켬');
    // 다른 게임에서 끈 것이 따라온다
    await Z.evaluate(() => { localStorage.setItem('play.sound1', JSON.stringify({ muted: true, music: true, fx: true })); window.dispatchEvent(new StorageEvent('storage', { key: 'play.sound1' })); });
    assert(await Z.evaluate(() => document.getElementById('btn-mute').classList.contains('muted')), '다른 곳에서 끈 것이 안 따라옴');
    await Z.evaluate(() => SND.setMuted(false));
    // 판 중: 지금 하늘 음악, 쉬움은 차분하게, 피버는 빠르게
    await Z.evaluate(() => { SN.debug.setEasy(true); SN.debug.newGame(3, { mode: 'endless', rival: false }); });
    assert(await until(Z, () => { const m = SND.music.mood(); return SND.music.playing() && m.calm && m.planet !== 'title' && m.planet === SN.debug.musicMood.planet; }), '행성 음악·쉬움 차분');
    assert(await Z.evaluate(() => window._ui.includes('start')), '시작 소리');
    await Z.evaluate(() => { const W = SN.debug.world; W.wait = 0; SN.World.startFever(W); });
    assert(await until(Z, () => SND.music.mood().fever), '피버 음악');
    // 멈춤: 음악 켜기·끄기 (효과음은 그대로)
    await Z.evaluate(() => SN.debug.pause());
    assert(await Z.evaluate(() => { const b = document.getElementById('btn-music'); return !b.hidden && b.getBoundingClientRect().height > 0 && /켬/.test(b.textContent); }), '음악 단추');
    await Z.tap('#btn-music');
    assert(await Z.evaluate(() => !SND.musicOn() && !SND.muted() && JSON.parse(localStorage.getItem('play.sound1')).music === false && /끔/.test(document.getElementById('btn-music').textContent)), '음악 끔');
    await Z.tap('#btn-music');
    assert(await Z.evaluate(() => SND.musicOn() && /켬/.test(document.getElementById('btn-music').textContent)), '음악 켬');
    await Z.tap('#btn-resume');
    assert(await until(Z, () => SN.debug.mode === 'play'), '계속하기');
  });
  await test('소리(SND): 한 번 더는 경고음 대신 continueAsk·똑딱(마지막은 높게), 누르면 continueGo 하나만, 결과에서 over·음악 멈춤', async () => {
    await Z.evaluate(() => { SN.debug.setEasy(false); SN.debug.newGame(4, { mode: 'endless', rival: false }); });
    await Z.evaluate(() => { const W = SN.debug.world; W.snake = W.snake.map((p, i) => ({ x: W.cols - 1 - i, y: 4 })); W.prev = W.snake.slice(); W.dir = 'right'; W.queue.length = 0; W.wait = 0; window._ui.length = 0; window._sn.length = 0; });
    assert(await until(Z, () => SN.debug.mode === 'cont' && window._ui.includes('continueAsk'), null, 6000), 'continueAsk가 안 남');
    // 앞길 경고음은 부딪히기 전에만 (묻는 화면에는 쓰지 않는다)
    assert(await Z.evaluate(() => { const n = window._sn; return n.includes('crash') && n.lastIndexOf('warn') < n.indexOf('crash') && !window._ui.includes('over'); }), '부딪힘 소리 ' + await Z.evaluate(() => window._sn.join()));
    await Z.waitForTimeout(1300);
    assert(await Z.evaluate(() => window._ui.includes('tick')), '똑딱');
    await Z.evaluate(() => { window._ui.length = 0; window._sn.length = 0; });
    await Z.tap('#btn-cont');
    assert(await until(Z, () => SN.debug.mode === 'play'), '되살아나지 않음');
    await Z.waitForTimeout(200);
    assert(await Z.evaluate(() => window._ui.join() === 'continueGo' && !window._sn.includes('start') && SN.Audio.play('revive') === false), '한 번 더 소리 ' + await Z.evaluate(() => window._ui.join() + ' / ' + window._sn.join()));
    // 두 번째는 묻지 않고 결과: over, 음악 멈춤
    await Z.evaluate(() => { const W = SN.debug.world; W.eff.ghost = 0; W.snake = W.snake.map((p, i) => ({ x: W.cols - 1 - i, y: 8 })); W.prev = W.snake.slice(); W.dir = 'right'; W.queue.length = 0; W.wait = 0; });
    assert(await until(Z, () => SN.debug.mode === 'over', null, 6000), '결과 화면');
    assert(await Z.evaluate(() => window._ui.includes('over') && !window._ui.includes('overSoft') && !SND.music.playing()), '결과 소리·음악 ' + await Z.evaluate(() => window._ui.join()));
    // 기다리면 1초마다 똑딱, 마지막은 높게, 5초 뒤 결과 (쉬움은 부드러운 결과 소리). 쉬움은 벽이 없으니 제 몸에 부딪힌다
    await Z.evaluate(() => { SN.debug.setEasy(true); SN.debug.newGame(5, { mode: 'endless', rival: false }); });
    await Z.evaluate(() => { const W = SN.debug.world; W.snake = [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 7, y: 4 }]; W.prev = W.snake.slice(); W.dir = 'right'; W.queue.length = 0; W.wait = 0; W.food = { x: 0, y: 0, gold: false, born: 0 }; window._ui.length = 0; });
    assert(await until(Z, () => SN.debug.mode === 'cont', null, 4000), '쉬움 한 번 더 묻기');
    assert(await until(Z, () => window._ui.includes('tick!'), null, 7000), '마지막 똑딱 ' + await Z.evaluate(() => window._ui.join()));
    assert(await Z.evaluate(() => window._ui.filter(n => n === 'tick').length === 3), '똑딱 수 ' + await Z.evaluate(() => window._ui.join()));
    assert(await until(Z, () => SN.debug.mode === 'over', null, 3000), '5초 뒤 결과');
    assert(await Z.evaluate(() => window._ui.includes('overSoft') && !window._ui.includes('over')), '쉬움 결과 소리 ' + await Z.evaluate(() => window._ui.join()));
    await Z.evaluate(() => SN.debug.toTitle());
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
  await test('손가락으로 옆으로 밀면 주인공이 따라가고, 손가락을 멈추면 주인공도 멈춘다', async () => {
    const cdp = await J.context().newCDPSession(J);
    const x0 = await J.evaluate(() => JP.debug.world.p.x);
    const pt = x => [{ x, y: 520, id: 7 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(560) });
    // 한 번에 25px씩 (끌기로 바뀌는 D.DRAG.start 22px를 첫 걸음에 넘는다)
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(560 + i * 25) }); await J.waitForTimeout(16); }
    assert(await until(J, () => JP.debug.world.input.dir > 0, null, 2000), '오른쪽으로 밀었는데 오른쪽으로 안 감');
    // 손가락을 멈춘 채 누르고 있으면 곧 멈춘다 (누르기 방식이면 왼쪽 절반이라 왼쪽으로 갔을 것)
    assert(await until(J, () => JP.debug.world.input.dir === 0, null, 2000), '손가락을 멈췄는데 계속 움직임');
    const moved = await J.evaluate(x => { const WW = 400; let d = JP.debug.world.p.x - x; if (d < -WW / 2) d += WW; return d; }, x0);
    assert(moved > 40 && moved < 200, '따라간 거리가 이상함: ' + moved.toFixed(1));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  await test('쉬움: 떨어지면 구조 구름이 3번 살려 주고, 그다음 떨어지면 게임 오버 → 다시 하기', async () => {
    await J.evaluate(() => { JP.debug.setEasy(true); JP.debug.newGame(5, { easy: true }); JP.debug.autopilot(false); });
    // 발판을 계속 치워 떨어지게 한다
    assert(await until(J, () => { const W = JP.debug.world; W.plats.length = 0; return W.rescued >= 3 || JP.debug.mode === 'over'; }, null, 30000), '구조 구름이 3번 안 나옴');
    assert(await until(J, () => { const W = JP.debug.world; W.plats.length = 0; return JP.debug.mode === 'cont' || JP.debug.mode === 'over'; }, null, 20000), '게임 오버 안 됨');
    assert(await J.evaluate(() => JP.debug.world.rescued === 3), '구조 횟수가 3이 아님');
    // 한 판에 한 번 "한 번 더?" (쉬움은 구조 구름을 다 쓴 뒤): 막 뜬 때 누른 것은 무시, 그만하기 → 결과 화면
    assert(await until(J, () => JP.debug.mode === 'cont' && document.getElementById('scr-cont').classList.contains('on'), null, 4000), '한 번 더 화면 안 나옴');
    assert(await J.evaluate(() => { document.getElementById('btn-cont-no').click(); return JP.debug.mode === 'cont'; }), '막 뜬 화면에서 누른 것이 먹힘');
    await J.waitForTimeout(700);
    await J.tap('#btn-cont-no');
    assert(await until(J, () => JP.debug.mode === 'over' && document.getElementById('scr-over').classList.contains('on'), null, 4000), '게임 오버 화면 안 나옴');
    assert(await J.evaluate(() => document.getElementById('btn-retry').getBoundingClientRect().bottom <= innerHeight), '다시 하기 버튼이 화면 밖');
    await J.waitForTimeout(700);
    await J.tap('#btn-retry');
    assert(await until(J, () => JP.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('보통: 끝나면 "한 번 더!" → 구조 구름이 받아 이어 하고, 두 번째에는 묻지 않는다', async () => {
    await J.evaluate(() => { JP.debug.newGame(8, { diff: 'normal' }); JP.debug.autopilot(false); });
    assert(await until(J, () => { const W = JP.debug.world; W.plats.length = 0; return JP.debug.mode === 'cont'; }, null, 20000), '한 번 더 안 물어봄');
    assert(await until(J, () => document.getElementById('scr-cont').classList.contains('on'), null, 3000), '한 번 더 화면 안 나옴');
    await J.waitForTimeout(700);
    await J.tap('#btn-cont');
    assert(await until(J, () => JP.debug.mode === 'play' && JP.debug.world.continued && JP.debug.world.safeT > 0, null, 2000), '이어 하기 안 됨');
    assert(await until(J, () => { const W = JP.debug.world; if (W.safeT <= 0) W.plats.length = 0; return JP.debug.mode === 'over'; }, null, 20000), '두 번째에 게임 오버로 안 감');
    assert(await until(J, () => document.getElementById('scr-over').classList.contains('on'), null, 4000), '게임 오버 화면 안 나옴');
    assert(await J.evaluate(() => /잘했어요|높이|아이쿠|앗|먹구름/.test(document.getElementById('over-title').textContent) && !/떨어졌다/.test(document.getElementById('over-title').textContent)), '끝 제목이 따뜻하지 않음');
  });
  await test('멈춤 → 계속하기: 누르고 있던 손가락이 그대로 먹히고, 멈춘 동안 화살표 불은 꺼진다', async () => {
    await J.waitForTimeout(700);
    await J.tap('#btn-retry');
    assert(await until(J, () => JP.debug.mode === 'play'), '다시 하기 안 됨');
    const cdp = await J.context().newCDPSession(J);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1180, y: 500, id: 9 }] });
    assert(await until(J, () => JP.debug.world.input.dir === 1, null, 2000), '오른쪽이 안 잡힘');
    await J.evaluate(() => JP.debug.pause());
    assert(await J.evaluate(() => JP.debug.mode === 'paused' && JP.debug.pad.side === 0), '멈췄는데 화살표 불이 켜져 있음');
    await J.evaluate(() => JP.debug.resume());
    assert(await until(J, () => JP.debug.world.input.dir === 1, null, 2000), '계속하기 뒤 누르고 있던 손가락이 안 먹힘');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  await test('멈춤 → 처음 화면으로: 한 판이 끝난 것처럼 기록·코인을 챙긴다', async () => {
    const before = await J.evaluate(() => ({ games: JP.debug.rec.total.games, earned: JP.debug.shop.life.earned }));
    // 60m 오른 것으로 치고 (한 칸 돌아 높이에 적히게) 멈춘다
    assert(await until(J, () => { const W = JP.debug.world; W.maxY = Math.max(W.maxY, 3000); W.shield = true; return W.height >= 60 && JP.debug.mode === 'play'; }, null, 3000), '높이가 안 적힘');
    await J.evaluate(() => JP.debug.pause());
    await J.tap('#btn-quit');
    assert(await until(J, () => JP.debug.mode === 'title' && document.getElementById('scr-title').classList.contains('on'), null, 3000), '처음 화면으로 안 감');
    const after = await J.evaluate(() => ({ games: JP.debug.rec.total.games, earned: JP.debug.shop.life.earned, hub: JSON.parse(localStorage.getItem('play.hub1') || '{}') }));
    assert(after.games === before.games + 1, '판 수가 안 늘어남 ' + JSON.stringify([before, after.games]));
    assert(after.earned > before.earned, '코인을 안 받음');
  });
  await test('출발 장소: 닿은 곳이 열리면 시작 화면에서 골라 그 높이에서 출발한다', async () => {
    // 앞 판에서 60m(3000점) 넘게 오른 것으로 쳤으니 아직 구름 위는 잠겨 있다. 우주까지 열어 본다
    await J.evaluate(() => { JP.debug.unlockPlace('cloud'); JP.debug.unlockPlace('space'); });
    assert(await J.evaluate(() => !document.getElementById('start-pick').hidden && document.querySelectorAll('#start-row .sp').length === 4 && document.querySelectorAll('#start-row .sp.locked').length === 1), '출발 장소 버튼');
    await J.tap('#start-row [data-start="space"]');
    assert(await J.evaluate(() => JP.debug.start === 'space' && document.querySelector('[data-start="space"]').getAttribute('aria-pressed') === 'true'), '우주를 못 고름');
    await J.tap('#btn-start');
    assert(await until(J, () => JP.debug.mode === 'play' && JP.debug.world.start === 250 && JP.debug.world.height >= 250), '우주에서 출발 안 함');
    await J.evaluate(() => JP.debug.setStart('ground'));
  });
  await test('통통 점프 소리: 공통 소리(SND), 우주에서 출발하면 행성 음악, 처음 화면은 제목 음악, 소리 단추는 네 게임 함께 (play.sound1)', async () => {
    assert(await J.evaluate(() => typeof SND !== 'undefined' && SND.ready() && SND.music.playing()), '소리 판·음악이 안 열림');
    assert(await J.evaluate(() => JP.debug.mode === 'play' && ['galaxy', 'mercury', 'venus'].includes(SND.music.mood().planet)), '우주 출발인데 음악 ' + await J.evaluate(() => SND.music.mood().planet));
    await J.evaluate(() => { JP.debug.pause(); JP.debug.quitRun(); });
    assert(await until(J, () => JP.debug.mode === 'title' && SND.music.mood().planet === 'title', null, 3000), '처음 화면 음악이 아님');
    await J.tap('#btn-mute');
    assert(await J.evaluate(() => SND.muted() && JSON.parse(localStorage.getItem('play.sound1')).muted === true && document.getElementById('btn-mute').classList.contains('muted') && localStorage.getItem('jump.muted') === null), '소리 끔이 공통 설정에 안 적힘');
    await J.tap('#btn-mute');
    assert(await J.evaluate(() => !SND.muted() && !document.getElementById('btn-mute').classList.contains('muted')), '다시 켜기');
  });
  await test('시작 화면·결과 화면에 게임 고르기로 가는 집 버튼', async () => {
    assert(await J.evaluate(() => /index\.html$/.test(document.getElementById('btn-hub').getAttribute('href')) && /index\.html$/.test(document.getElementById('btn-over-hub').getAttribute('href'))), '집 버튼 주소');
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
  // 부딪힐 때까지 가만히 (쉬움은 느리므로 넉넉히 기다린다). 처음 안내 중에는 하트를 잃지 않으므로 안내는 끝낸다
  const crash = async want => {
    await U.evaluate(() => { const W = RN.debug.world; if (W.tut) W.tut.step = 'done'; W.hearts = 1; W.inv = 0; RN.debug.autopilot(false); });
    return until(U, w => { const W = RN.debug.world; W.inv = 0; W.shield = false; W.revives = 0; if (W.eff) for (const k in W.eff) W.eff[k] = 0; return RN.debug.mode === w; }, want, 40000);
  };
  await test('하트가 다하면 "한 번 더!" (0.6초 동안은 눌러도 무시) → 이어 달리기, 두 번째는 결과 화면', async () => {
    assert(await crash('cont'), '한 번 더 물어보지 않음');
    assert(await until(U, () => document.getElementById('scr-cont').classList.contains('on'), null, 3000), '한 번 더 화면 안 나옴');
    const d0 = await U.evaluate(() => RN.debug.world.dist);
    await U.evaluate(() => document.getElementById('btn-cont').click());   // 막 뜬 화면: 무시
    assert(await U.evaluate(() => RN.debug.mode === 'cont'), '막 뜬 화면에서 누른 것이 먹힘');
    await U.waitForTimeout(700);
    await U.tap('#btn-cont');
    assert(await until(U, () => RN.debug.mode === 'play'), '한 번 더가 안 됨');
    assert(await U.evaluate(d => { const W = RN.debug.world; return W.hearts === 1 && W.conts === 1 && Math.abs(W.dist - d) < 1; }, d0), '부딪힌 자리에서 하트 1개');
    assert(await crash('over'), '두 번째는 바로 게임 오버');
    assert(await until(U, () => document.getElementById('scr-over').classList.contains('on'), null, 4000), '게임 오버 화면 안 나옴');
    await U.evaluate(() => document.getElementById('btn-retry').click());   // 막 뜬 결과 화면: 무시
    assert(await U.evaluate(() => RN.debug.mode === 'over'), '막 뜬 결과 화면에서 누른 것이 먹힘');
    await U.waitForTimeout(700);
    await U.tap('#btn-retry');
    assert(await until(U, () => RN.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('한 번 더를 안 누르면 5초 뒤 결과 화면 ("그만하기"도 된다)', async () => {
    assert(await crash('cont'), '한 번 더 물어보지 않음');
    assert(await until(U, () => document.getElementById('scr-cont').classList.contains('on'), null, 3000), '한 번 더 화면 안 나옴');
    assert(await until(U, () => document.getElementById('scr-over').classList.contains('on'), null, 7000), '5초 뒤 결과 화면 안 나옴');
    await U.waitForTimeout(700);
    await U.tap('#btn-retry');
    assert(await crash('cont'), '다음 판에도 한 번 더');
    assert(await until(U, () => document.getElementById('scr-cont').classList.contains('on'), null, 3000), '한 번 더 화면 안 나옴');
    await U.waitForTimeout(700);
    await U.tap('#btn-cont-no');
    assert(await until(U, () => document.getElementById('scr-over').classList.contains('on'), null, 3000), '그만하기 → 결과 화면');
  });
  await test('결과 화면: 처음 화면으로·게임 고르기가 진짜 버튼, 작은 탭(893×533)에서 메달이 많아도 한 화면', async () => {
    await U.setViewportSize({ width: 893, height: 533 });
    await U.evaluate(() => {
      const TIER = { 1: '동', 2: '은', 3: '금' };
      document.getElementById('over-medals').innerHTML = RN.DATA.MEDALS.slice(0, 8).map(m => '<span class="mchip t' + m.tier + '"><i>' + TIER[m.tier] + '</i>' + m.name + '</span>').join('');
      document.getElementById('over-records').innerHTML = '<span>신기록 · 최고 거리 1,234m</span><span>신기록 · 한 판 별 99</span>';
    });
    await U.waitForTimeout(300);
    const box = await U.evaluate(() => { const r = document.querySelector('#scr-over .panel').getBoundingClientRect(), h = document.getElementById('btn-home').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, hh: h.height, hw: h.width }; });
    assert(box.top >= 0 && box.bottom <= 533, '한 화면에 안 들어감 ' + JSON.stringify(box));
    assert(box.hh >= 43.5 && box.hw >= 120, '처음 화면으로 버튼이 작음 ' + JSON.stringify(box));
    assert(await U.evaluate(() => /index\.html$/.test(document.getElementById('btn-over-hub').getAttribute('href'))), '결과 화면 집 버튼');
    await U.setViewportSize({ width: 1280, height: 800 });
  });
  await test('일시정지 → 처음 화면으로: 판을 버리지 않고 마무리 (코인·판 수·놀이 본부), 시작 화면에 집 버튼', async () => {
    await U.tap('#btn-home');
    assert(await until(U, () => RN.debug.mode === 'title'), '처음 화면 안 됨');
    assert(await U.evaluate(() => getComputedStyle(document.getElementById('btn-hub')).display !== 'none' && /index\.html$/.test(document.getElementById('btn-hub').getAttribute('href'))), '시작 화면 집 버튼');
    const before = await U.evaluate(() => ({ games: RN.debug.rec.total.games, coins: RN.debug.shop.coins, hub: HUB.load().games && HUB.load().games.runner ? HUB.load().games.runner.games : 0 }));
    await U.tap('#btn-start');
    assert(await until(U, () => RN.debug.mode === 'play'), '시작 안 됨');
    assert(await U.evaluate(() => getComputedStyle(document.getElementById('btn-hub')).display === 'none'), '게임 중에는 집 버튼 없음');
    await U.evaluate(() => { const W = RN.debug.world; if (W.tut) W.tut.step = 'done'; W.stars += 40; W.dist += 500; RN.debug.pause(); });
    await U.tap('#btn-quit');
    assert(await until(U, () => RN.debug.mode === 'title'), '처음 화면으로 안 감');
    const after = await U.evaluate(() => ({ games: RN.debug.rec.total.games, coins: RN.debug.shop.coins, toast: document.getElementById('toast').textContent }));
    assert(after.games === before.games + 1 && after.coins > before.coins, '판이 마무리 안 됨 ' + JSON.stringify([before, after]));
    assert(/코인/.test(after.toast), '받은 코인 안내 ' + after.toast);
  });
  await test('뒤로 가기: 시작 화면에서는 기록을 쌓지 않고, 판을 하는 동안만 멈춤 화면으로', async () => {
    assert(await U.evaluate(() => !RN.debug.histOn), '시작 화면에 뒤로 가기 기록이 남음');
    await U.tap('#btn-start');
    assert(await until(U, () => RN.debug.mode === 'play' && RN.debug.histOn), '판 시작 때 기록');
    await U.evaluate(() => history.back());
    assert(await until(U, () => RN.debug.mode === 'paused'), '뒤로 가기가 멈춤 화면이 아님');
    await U.tap('#btn-quit');
    assert(await until(U, () => RN.debug.mode === 'title' && !RN.debug.histOn), '처음 화면에서 기록이 남음');
  });
  await test('슝슝 우주 달리기 소리: 공통 소리(SND), 행성마다 음악, 피버·해적 분위기, 처음 화면은 제목 음악, 소리 단추는 네 게임 함께 (play.sound1)', async () => {
    assert(await U.evaluate(() => typeof SND !== 'undefined' && SND.ready() && SND.music.playing() && SND.music.mood().planet === 'title'), '처음 화면 음악이 아님');
    await U.tap('#btn-start');
    assert(await until(U, () => RN.debug.mode === 'play' && SND.music.mood().planet === 'mercury'), '출발했는데 수성 음악이 아님 ' + await U.evaluate(() => SND.music.mood().planet));
    assert(await U.evaluate(() => SND.music.mood().calm === (RN.debug.diff === 'easy')), '쉬움은 차분한 음악');
    await U.evaluate(() => { const W = RN.debug.world; if (W.tut) W.tut.step = 'done'; W.hearts = 9; W.dist = RN.DATA.ROUTE.leg + 1; });
    assert(await until(U, () => SND.music.mood().planet === 'venus', null, 3000), '금성에 왔는데 음악이 그대로 ' + await U.evaluate(() => SND.music.mood().planet));
    await U.evaluate(() => { RN.debug.world.fever = 30; });
    assert(await until(U, () => SND.music.mood().fever === true, null, 2000), '피버 음악');
    await U.evaluate(() => { const W = RN.debug.world; W.fever = 0; W.pir = { t: 99, max: 99, shotT: 99, laser: null, bombs: 0, bombT: 99, shots: 0 }; });
    assert(await until(U, () => SND.music.mood().fever === false && SND.music.mood().boss === true, null, 2000), '해적 추격 음악');
    await U.evaluate(() => { RN.debug.world.pir = null; });
    assert(await until(U, () => SND.music.mood().boss === false, null, 2000), '해적을 따돌리면 원래 음악');
    await U.evaluate(() => RN.debug.pause());
    await U.tap('#btn-mute');
    assert(await U.evaluate(() => SND.muted() && JSON.parse(localStorage.getItem('play.sound1')).muted === true && document.getElementById('btn-mute').classList.contains('muted') && localStorage.getItem('runner.muted') === null), '소리 끔이 공통 설정에 안 적힘');
    await U.tap('#btn-mute');
    assert(await U.evaluate(() => !SND.muted() && !document.getElementById('btn-mute').classList.contains('muted')), '다시 켜기');
    await U.tap('#btn-quit');
    assert(await until(U, () => RN.debug.mode === 'title' && SND.music.mood().planet === 'title' && !SND.music.mood().boss && !SND.music.mood().fever, null, 3000), '처음 화면으로 오면 제목 음악');
  });
  await test('슝슝 우주 달리기 콘솔 오류 없음', async () => { assert(!rn.errors.length, rn.errors.join(' | ')); });
  await rn.ctx.close();

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
