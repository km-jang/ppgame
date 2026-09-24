'use strict';
// 화면 흐름 점검: 실제 브라우저(크로미움)로 두 게임을 처음부터 끝까지 한 번씩 넘겨 본다.
// 실행: node tests/flow.test.js
// Playwright가 없으면 건너뛴다 (규칙 테스트 sim.test.js · robocar.test.js는 따로 돈다).
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
  console.log('뚝딱 로봇카');
  const rc = await open(browser, ROOT + '/robocar/index.html');
  const P = rc.page;
  await P.evaluate(() => { localStorage.clear(); RC.debug.noAuto = true; });

  await test('로딩 화면이 걷히고 시작 화면이 나온다', async () => {
    assert(await until(P, () => document.getElementById('splash').classList.contains('done')), '로딩 화면이 안 걷힘');
    assert(await on(P, 'scr-title'), '시작 화면 아님');
  });
  await test('시작 → 차고 (화면 넘김 뒤)', async () => {
    await P.tap('#btn-go-garage');
    assert(await until(P, () => RC.debug.mode === 'garage'), '차고로 안 감');
    assert(await until(P, () => document.getElementById('wipe').className === ''), '화면 넘김 띠가 남아 있음');
  });
  await test('처음에는 부품 일부가 잠겨 있고, 누르면 바뀌지 않는다', async () => {
    assert(await P.evaluate(() => document.querySelector('.parts[data-slot=body] .part:nth-child(2)').classList.contains('locked')), '소방차가 잠겨 있지 않음');
    await P.tap('.parts[data-slot=body] .part:nth-child(2)');
    assert(await P.evaluate(() => RC.debug.cfg.body === 'racer'), '잠긴 부품이 골라짐');
    await P.evaluate(() => { RC.debug.prog.total = 999; RC.debug.renderParts(); });
    assert(!(await P.evaluate(() => document.querySelector('.part.locked'))), '별을 모아도 안 열림');
  });
  await test('색 버튼과 부품 카드는 아이 손가락 크기 (탭 S9에서 약 2cm)', async () => {
    const r = await P.evaluate(() => { const s = document.querySelector('.swatch').getBoundingClientRect(), p = document.querySelector('.part').getBoundingClientRect(); return [s.width, s.height, p.width, p.height]; });
    const cm = 1280 / 25.3;   // 11인치 탭 가로 약 25.3cm
    assert(r.every(v => v / cm >= 1.9), '크기 ' + r.map(v => (v / cm).toFixed(1) + 'cm').join(' '));
  });
  await test('부품을 바꾸면 이름·능력치가 바뀐다', async () => {
    const before = await P.evaluate(() => document.getElementById('car-name').textContent + [...document.querySelectorAll('.bar i.on')].length);
    await P.tap('.parts[data-slot=body] .part:nth-child(2)');
    await P.tap('.parts[data-slot=wheel] .part:nth-child(3)');
    const after = await P.evaluate(() => document.getElementById('car-name').textContent + [...document.querySelectorAll('.bar i.on')].length);
    assert(before !== after, '차고 표시가 그대로');
    assert(await P.evaluate(() => RC.debug.cfg.body === 'fire' && RC.debug.cfg.wheel === 'spring'), '고른 부품이 저장 안 됨');
  });
  await test('출발 → 신호등 3·2·1 동안 차가 서 있다', async () => {
    await P.tap('#btn-run');
    assert(await until(P, () => RC.debug.mode === 'run'), '달리기 화면 아님');
    assert(await on(P, 'count'), '신호등이 안 보임');
    await P.waitForTimeout(1500);
    assert(await P.evaluate(() => RC.debug.run.t === 0), '신호등 중에 달리기 시작함');
  });
  await test('초록불 뒤 차가 달린다', async () => {
    assert(await until(P, () => RC.debug.run.car.x > 600, null, 9000), '차가 안 움직임');
    assert(!(await on(P, 'count')), '신호등이 안 사라짐');
  });
  await test('첫 판에는 손가락 안내가 나온다', async () => {
    assert(await until(P, () => document.getElementById('hint').classList.contains('on'), null, 12000), '안내가 안 나옴');
  });
  await test('뒤로 가기 → 잠깐 멈춤 → 계속', async () => {
    await P.evaluate(() => history.back());
    assert(await until(P, () => document.getElementById('scr-pause').classList.contains('on')), '멈춤 화면 안 나옴');
    await P.tap('#btn-resume');
    assert(!(await on(P, 'scr-pause')), '계속이 안 됨');
  });
  await test('도착 → 결과 화면 (별·카드 에너지·다음 카드)', async () => {
    await P.evaluate(() => { const R = RC.debug.run; R.car.x = R.level.length - 200; });
    assert(await until(P, () => RC.debug.mode === 'result', null, 10000), '결과 화면 아님');
    assert(await until(P, () => /개|카드/.test(document.getElementById('res-note').textContent), null, 10000), '별 세기가 안 끝남');
    assert(await P.evaluate(() => !document.getElementById('next-card').hidden), '다음 카드 미리보기 없음');
  });
  await test('보호자 설정: 설정 · 놀이 기록 · 기기 점검 탭', async () => {
    await P.evaluate(() => RC.debug.openParent());
    for (const tab of ['log', 'dev', 'set']) {
      await P.tap('#p-tabs button[data-tab=' + tab + ']');
      assert(await P.evaluate(t => !document.querySelector('.ptab[data-tab=' + t + ']').hidden, tab), tab + ' 탭이 안 열림');
    }
    assert(await P.evaluate(() => /1판/.test(document.getElementById('p-log').textContent)), '놀이 기록에 판 수 없음');
    assert(await P.evaluate(() => /소방차/.test(document.getElementById('p-log').textContent)), '좋아하는 차체가 기록 안 됨');
    assert(await P.evaluate(() => document.querySelectorAll('#p-dev dt').length >= 8), '기기 점검 항목 부족');
    await P.tap('#p-close');
  });
  await test('도시를 한 번 끝까지 달리면 공사장 코스가 열린다', async () => {
    assert(await P.evaluate(() => /새 코스: 공사장/.test(document.getElementById('res-note').textContent)), '결과에 새 코스 알림 없음');
    await P.evaluate(() => RC.debug.toGarage());
    await P.waitForTimeout(400);
    await P.tap('#btn-run');
    assert(await until(P, () => RC.debug.mode === 'map'), '코스 고르기 화면 아님');
    assert(await P.evaluate(() => document.querySelectorAll('.course:not(.locked)').length === 2), '열린 코스가 두 개가 아님');
    await P.tap('.course:nth-child(2)');
    assert(await until(P, () => RC.debug.mode === 'run' && RC.debug.run.course.id === 'site'), '공사장으로 출발 안 함');
    assert(await until(P, () => RC.debug.run.level.items.some(o => o.type === 'cone' && o.down), null, 20000), '고깔을 하나도 못 쓰러뜨림');
    await P.evaluate(() => { const R = RC.debug.run; R.car.x = R.level.length - 200; });
    assert(await until(P, () => RC.debug.mode === 'result', null, 10000), '공사장 결과 화면 아님');
    await P.waitForTimeout(700);
    await P.tap('#btn-again');
    assert(await until(P, () => RC.debug.mode === 'run' && RC.debug.run.course.id === 'site'), '또 달리기가 같은 코스가 아님');
  });
  await test('시간이 다 되면 잠자기 화면', async () => {
    await P.evaluate(() => { RC.debug.play.sec = 99999; RC.debug.toGarage(); });
    assert(await until(P, () => RC.debug.mode === 'sleep'), '잠자기로 안 감');
  });
  await test('로봇카 콘솔 오류 없음', async () => { assert(!rc.errors.length, rc.errors.join(' | ')); });
  await rc.ctx.close();

  await test('세로로 들면 눕혀 달라는 화면', async () => {
    const pr = await open(browser, ROOT + '/robocar/index.html', Object.assign({}, TAB, { viewport: { width: 800, height: 1280 } }));
    await pr.page.waitForTimeout(500);
    assert(await pr.page.evaluate(() => document.body.classList.contains('portrait')), '세로 안내 없음');
    await pr.ctx.close();
  });
  await test('가로로 든 태블릿의 좁은 창(옆 창·화면 분할)에서는 막지 않고 줄여서 보여 준다', async () => {
    const ctx2 = await browser.newContext(Object.assign({}, TAB, { viewport: { width: 700, height: 760 } }));
    await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx2.addInitScript(() => { try { Object.defineProperty(screen.orientation, 'type', { get: () => 'landscape-primary' }); } catch (e) {} });
    const pg = await ctx2.newPage();
    await pg.goto(ROOT + '/robocar/index.html'); await pg.waitForTimeout(600);
    const st = await pg.evaluate(() => [document.body.classList.contains('portrait'), document.body.classList.contains('narrow'), document.body.style.zoom]);
    assert(!st[0] && st[1] && Number(st[2]) < 1, '좁은 가로 창 처리 ' + st.join(','));
    await pg.evaluate(() => RC.debug.toGarage()); await pg.waitForTimeout(500);
    const inside = await pg.evaluate(() => { const b = document.getElementById('btn-run').getBoundingClientRect(), k = Number(document.body.style.zoom) || 1; const cw = document.getElementById('stage').getBoundingClientRect().width, f = innerWidth / cw; return (b.right * f) <= innerWidth + 1 && (b.bottom * f) <= innerHeight + 1; });
    assert(inside, '출발 버튼이 화면 밖');
    await ctx2.close();
  });
  await test('세로에서 가로로 돌리면 안내가 사라진다', async () => {
    const ctx3 = await browser.newContext(Object.assign({}, TAB, { viewport: { width: 800, height: 1280 } }));
    await ctx3.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx3.addInitScript(() => { window.__o = 'portrait-primary'; try { Object.defineProperty(screen.orientation, 'type', { get: () => window.__o }); } catch (e) {} });
    const pg = await ctx3.newPage();
    await pg.goto(ROOT + '/robocar/index.html'); await pg.waitForTimeout(500);
    assert(await pg.evaluate(() => document.body.classList.contains('portrait')), '세로 안내 없음');
    await pg.evaluate(() => { window.__o = 'landscape-primary'; });
    await pg.setViewportSize({ width: 1280, height: 800 }); await pg.waitForTimeout(400);
    assert(!(await pg.evaluate(() => document.body.classList.contains('portrait'))), '돌려도 안내가 남음');
    await ctx3.close();
  });
  await test('작은 탭(A7 Lite)에서 코스 카드 두 장이 화면 안에 있다', async () => {
    const sm = await open(browser, ROOT + '/robocar/index.html', Object.assign({}, TAB, { viewport: { width: 893, height: 533 } }));
    await sm.page.evaluate(() => { RC.debug.prog.log.finished = 1; RC.debug.toMap(); });
    await sm.page.waitForTimeout(900);
    const r = await sm.page.evaluate(() => [...document.querySelectorAll('.course, #btn-map-back')].every(e => { const b = e.getBoundingClientRect(); return b.bottom <= innerHeight && b.right <= innerWidth && b.left >= 0; }));
    assert(r, '코스 카드나 돌아가기 버튼이 잘림');
    await sm.ctx.close();
  });
  await test('작은 탭(A7 Lite)에서도 차고 버튼이 화면 안에 있다', async () => {
    const sm = await open(browser, ROOT + '/robocar/index.html', Object.assign({}, TAB, { viewport: { width: 893, height: 533 } }));
    await sm.page.evaluate(() => RC.debug.toGarage());
    await sm.page.waitForTimeout(700);
    const r = await sm.page.evaluate(() => { const b = document.getElementById('btn-run').getBoundingClientRect(); return b.bottom <= innerHeight && b.right <= innerWidth && b.height >= 40; });
    assert(r, '출발 버튼이 잘리거나 너무 작음');
    await sm.ctx.close();
  });

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
  await test('체력이 다하면 게임 오버 → 다시 하기', async () => {
    await G.evaluate(() => { const p = NG.debug.world.player; p.hp = 1; p.iframe = 0; });
    // 적을 모두 플레이어 자리로 옮겨 부딪히게 한다
    assert(await until(G, () => { const W = NG.debug.world, p = W.player; for (const e of W.enemies) { e.x = p.x; e.y = p.y; } return NG.debug.mode === 'over'; }, null, 15000), '게임 오버 안 됨');
    await G.tap('#btn-retry');
    assert(await until(G, () => NG.debug.mode === 'play'), '다시 하기 안 됨');
  });
  await test('N-GUN 콘솔 오류 없음', async () => { assert(!ng.errors.length, ng.errors.join(' | ')); });
  await ng.ctx.close();

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
