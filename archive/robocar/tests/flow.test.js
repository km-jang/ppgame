'use strict';
// 뚝딱 로봇카 화면 흐름 점검 (보류, 2026-09-27에 저장소 테스트에서 떼어 옴).
// 실행: node archive/robocar/tests/flow.test.js
// Playwright가 없으면 건너뛴다 (규칙 테스트 sim.test.js · robocar.test.js는 따로 돈다).
// Playwright 위치를 직접 줄 때: PW=/경로/playwright node tests/flow.test.js
const path = require('path');

let pw = null;
for (const p of [process.env.PW, 'playwright', '/opt/node22/lib/node_modules/playwright']) {
  if (!p) continue;
  try { pw = require(p); break; } catch (e) { /* 다음 후보 */ }
}
if (!pw) { console.log('  skip Playwright가 없어 화면 흐름 점검을 건너뜀'); process.exit(0); }

const ROOT = 'file://' + path.resolve(__dirname, '..', '..', '..');   // 저장소 맨 위 (보류 폴더 안에서 돈다)
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

// 결과 화면 뒤 선물 상자가 뜨면 하나 골라 닫는다 (뒤 버튼을 누를 수 있게)
async function takeGift(page) {
  if (await until(page, () => RC.debug.giftOpen, null, 6000)) await page.evaluate(() => { RC.debug.pickGift(0); RC.debug.closeGifts(); });
}

(async () => {
  const browser = await pw.chromium.launch();
  console.log('뚝딱 로봇카');
  const rc = await open(browser, ROOT + '/archive/robocar/index.html');
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
    await takeGift(P);
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
    const pr = await open(browser, ROOT + '/archive/robocar/index.html', Object.assign({}, TAB, { viewport: { width: 800, height: 1280 } }));
    await pr.page.waitForTimeout(500);
    assert(await pr.page.evaluate(() => document.body.classList.contains('portrait')), '세로 안내 없음');
    await pr.ctx.close();
  });
  await test('가로로 든 태블릿의 좁은 창(옆 창·화면 분할)에서는 막지 않고 줄여서 보여 준다', async () => {
    const ctx2 = await browser.newContext(Object.assign({}, TAB, { viewport: { width: 700, height: 760 } }));
    await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx2.addInitScript(() => { try { Object.defineProperty(screen.orientation, 'type', { get: () => 'landscape-primary' }); } catch (e) {} });
    const pg = await ctx2.newPage();
    await pg.goto(ROOT + '/archive/robocar/index.html'); await pg.waitForTimeout(600);
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
    await pg.goto(ROOT + '/archive/robocar/index.html'); await pg.waitForTimeout(500);
    assert(await pg.evaluate(() => document.body.classList.contains('portrait')), '세로 안내 없음');
    await pg.evaluate(() => { window.__o = 'landscape-primary'; });
    await pg.setViewportSize({ width: 1280, height: 800 }); await pg.waitForTimeout(400);
    assert(!(await pg.evaluate(() => document.body.classList.contains('portrait'))), '돌려도 안내가 남음');
    await ctx3.close();
  });
  await test('작은 탭(A7 Lite)에서 코스 카드 두 장이 화면 안에 있다', async () => {
    const sm = await open(browser, ROOT + '/archive/robocar/index.html', Object.assign({}, TAB, { viewport: { width: 893, height: 533 } }));
    await sm.page.evaluate(() => { RC.debug.prog.log.finished = 1; RC.debug.toMap(); });
    await sm.page.waitForTimeout(900);
    const r = await sm.page.evaluate(() => [...document.querySelectorAll('.course, #btn-map-back')].every(e => { const b = e.getBoundingClientRect(); return b.bottom <= innerHeight && b.right <= innerWidth && b.left >= 0; }));
    assert(r, '코스 카드나 돌아가기 버튼이 잘림');
    await sm.ctx.close();
  });
  await test('작은 탭(A7 Lite)에서도 차고 버튼이 화면 안에 있다', async () => {
    const sm = await open(browser, ROOT + '/archive/robocar/index.html', Object.assign({}, TAB, { viewport: { width: 893, height: 533 } }));
    await sm.page.evaluate(() => RC.debug.toGarage());
    await sm.page.waitForTimeout(700);
    const r = await sm.page.evaluate(() => { const b = document.getElementById('btn-run').getBoundingClientRect(); return b.bottom <= innerHeight && b.right <= innerWidth && b.height >= 40; });
    assert(r, '출발 버튼이 잘리거나 너무 작음');
    await sm.ctx.close();
  });

  await test('기록 지키기: 다시 열어도 유지, 본 기록이 지워져도 예비 사본으로 복구, 코드로 옮기기', async () => {
    // IndexedDB는 file:// 에서 안 되므로 이 점검만 작은 웹 서버로 연다 (실제 사용은 https 주소)
    const http = require('http'), fs = require('fs');
    const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.ogg': 'audio/ogg' };
    const srv = http.createServer((q, r) => {
      const f = path.join(path.resolve(__dirname, '..', '..', '..'), decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (err, buf) => { if (err) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(buf); });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = 'http://127.0.0.1:' + srv.address().port;
    const sv = await open(browser, BASE + '/archive/robocar/index.html');
    const G = sv.page;
    await G.evaluate(() => { localStorage.clear(); });
    await G.reload(); await G.waitForTimeout(600);
    // 기록 만들기: 판 수·카드·별·최고 기록
    await G.evaluate(() => { const p = RC.debug.prog; p.runs = 7; p.stickers = ['s1', 's2']; p.total = 120; p.best = { city: 88 }; RC.debug.toGarage(); });
    await G.waitForTimeout(1200);   // 예비 사본은 0.5초 뒤에 적힌다
    const snap = () => G.evaluate(() => { const p = RC.debug.prog; return [p.runs, p.stickers.length, p.total, p.best.city].join(','); });
    await G.reload(); await G.waitForTimeout(600);
    assert(await snap() === '7,2,120,88', '다시 열면 기록이 남아야 함: ' + await snap());
    assert(await G.evaluate(() => !document.querySelector('.parts [data-id=fire]').classList.contains('locked')), '별 120이면 소방차가 열려 있어야 함');
    // 본 기록만 지워짐 → 예비 사본(localStorage)으로 복구
    // (게임을 닫은 상태에서 지운다: 게임은 나갈 때 저장하므로)
    const away = async fn => { await G.goto(BASE + '/archive/robocar/icon.svg'); await G.evaluate(fn); await G.goto(BASE + '/archive/robocar/index.html'); };
    await away(() => { localStorage.removeItem('rc.prog'); });
    await G.waitForTimeout(600);
    assert(await snap() === '7,2,120,88', '예비 사본으로 복구: ' + await snap());
    // 저장소 통째로 비움 → IndexedDB 사본으로 복구 (한 번 다시 열림)
    await G.waitForTimeout(800);
    await away(() => { localStorage.clear(); });
    await G.waitForTimeout(2500);
    assert(await snap() === '7,2,120,88', 'IndexedDB 사본으로 복구: ' + await snap());
    // 코드로 내보냈다가 모두 지우고 불러오기
    const code = await G.evaluate(() => RC.Save.exportCode());
    assert(/^RC1-/.test(code), '코드 모양');
    await away(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('robocar-save'); q.onsuccess = q.onerror = () => r(); }));
    await G.waitForTimeout(1200);
    assert(await G.evaluate(() => RC.debug.prog.runs) === 0, '다 지우면 처음부터');
    assert(await G.evaluate(c => RC.Save.importText(c), code), '코드 불러오기 실패');
    await G.reload(); await G.waitForTimeout(600);
    assert(await snap() === '7,2,120,88', '코드로 옮긴 기록: ' + await snap());
    assert(!(await G.evaluate(() => RC.Save.importText('엉터리'))), '엉터리 코드는 거절');
    assert(!sv.errors.length, sv.errors.join(' | '));
    await sv.ctx.close();
    srv.close();
  });

  await test('코스 고르기 2×2 (도시·공사장·네온 시티·놀이터), 놀이터에서 꾹 누르면 차가 간다', async () => {
    const pk = await open(browser, ROOT + '/archive/robocar/index.html');
    const Q = pk.page;
    await Q.evaluate(() => { RC.debug.noAuto = true; RC.debug.prog.runs = 9; RC.debug.prog.log.finished = 9; });
    await Q.waitForTimeout(600);
    await Q.evaluate(() => RC.debug.toMap());
    await Q.waitForTimeout(700);
    const cards = await Q.evaluate(() => [...document.querySelectorAll('#courses .course b')].map(b => b.textContent));
    assert(cards.join(',') === '도시,공사장,네온 시티,놀이터', '코스 카드: ' + cards.join(','));
    const fit = await Q.evaluate(() => [...document.querySelectorAll('.course, #btn-map-back')].every(e => { const b = e.getBoundingClientRect(); return b.bottom <= innerHeight && b.right <= innerWidth && b.left >= 0 && b.top >= 0; }));
    assert(fit, '코스 카드가 화면 밖으로 나감');
    await Q.tap('#courses .course:nth-child(4)');
    assert(await until(Q, () => RC.debug.mode === 'park'), '놀이터로 안 감');
    assert(await until(Q, () => document.getElementById('wipe').className === ''), '화면 넘김이 안 끝남');
    assert(await Q.evaluate(() => document.getElementById('park-missions').children.length === 3), '미션 세 개가 안 보임');
    const x0 = await Q.evaluate(() => RC.debug.run.car.x);
    await Q.mouse.move(1100, 300); await Q.mouse.down(); await Q.waitForTimeout(1200); await Q.mouse.up();
    const x1 = await Q.evaluate(() => RC.debug.run.car.x);
    assert(x1 > x0 + 60, '꾹 눌렀는데 차가 안 감: ' + x0.toFixed(0) + ' → ' + x1.toFixed(0));
    // 미션을 다 하면 도착 문 → 지나가면 결과 화면
    await Q.evaluate(() => { const P = RC.debug.run; P.saved = 3; P.stars = 40; P.popped = 5; });
    assert(await until(Q, () => !!RC.debug.run.gate), '도착 문이 안 나옴');
    await Q.evaluate(() => { const P = RC.debug.run; P.car.x = P.gate.x; P.car.y = P.gate.y; });
    assert(await until(Q, () => RC.debug.mode === 'result', null, 6000), '놀이터 결과 화면이 안 나옴');
    assert(!pk.errors.length, pk.errors.join(' | '));
    await pk.ctx.close();
  });
  await test('네온 시티를 달리고, 슈퍼 변신 버튼이 금색이 되면 누를 수 있다', async () => {
    const nn = await open(browser, ROOT + '/archive/robocar/index.html');
    const Q = nn.page;
    await Q.evaluate(() => { RC.debug.noAuto = true; RC.debug.prog.runs = 9; RC.debug.prog.log.finished = 9; });
    await Q.waitForTimeout(600);
    await Q.evaluate(() => RC.debug.startRun('neon'));
    assert(await until(Q, () => RC.debug.mode === 'run' && RC.debug.run.course.id === 'neon'), '네온 시티 시작 안 됨');
    await Q.waitForTimeout(3800);
    await Q.evaluate(() => { RC.debug.run.superG = 12; });
    assert(await until(Q, () => document.getElementById('btn-transform').classList.contains('super')), '금색 슈퍼 버튼이 안 됨');
    await Q.tap('#btn-transform');
    assert(await until(Q, () => RC.debug.run.car.super > 0), '슈퍼 변신이 안 됨');
    assert(!nn.errors.length, nn.errors.join(' | '));
    await nn.ctx.close();
  });
  await test('결과 뒤 선물 상자: 하나 고르면 받고, 차고 색깔 판에 선물 칸이 생긴다', async () => {
    const gf = await open(browser, ROOT + '/archive/robocar/index.html');
    const Q = gf.page;
    await Q.evaluate(() => { localStorage.clear(); RC.debug.noAuto = true; });
    await Q.waitForTimeout(600);
    await Q.evaluate(() => { RC.debug.startRun('city'); });
    await Q.waitForTimeout(300);
    await Q.evaluate(() => { const R = RC.debug.run; R.stars = 3; R.car.x = R.level.length + 10; });
    assert(await until(Q, () => RC.debug.mode === 'result', null, 8000), '결과 화면이 안 나옴');
    assert(await until(Q, () => RC.debug.giftOpen, null, 9000), '선물 상자가 안 나옴');
    await Q.waitForTimeout(300);
    await Q.tap('#gift-list .gift:nth-child(1)');
    assert(await until(Q, () => RC.debug.prog.gifts.length === 1), '선물을 못 받음');
    await Q.tap('#gift-ok');
    assert(await until(Q, () => !RC.debug.giftOpen), '선물 창이 안 닫힘');
    await Q.evaluate(() => RC.debug.toGarage());
    await Q.waitForTimeout(500);
    assert(await Q.evaluate(() => !!document.querySelector('#colors .swatch.special, #colors .swatch.trail')), '차고에 선물 칸이 없음');
    const fit = await Q.evaluate(() => { const r = document.querySelector('.color-panel').getBoundingClientRect(), g = document.querySelector('.garage-panel').getBoundingClientRect(); return r.bottom <= g.top + 2; });
    assert(fit, '색깔 판이 부품 판과 겹침');
    assert(!gf.errors.length, gf.errors.join(' | '));
    await gf.ctx.close();
  });

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
