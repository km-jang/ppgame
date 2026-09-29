'use strict';
// 놀이 본부(공통 지갑·기록 요약·오늘의 미션) 테스트. 실행: node tests/hub.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function fresh() {
  const mem = {};
  const ctx = vm.createContext({ console, Math, Date, JSON, Number, String, Object, Array, Set });
  ctx.HUB = { store: { get: (k, f) => (k in mem ? JSON.parse(mem[k]) : f), set: (k, v) => { mem[k] = JSON.stringify(v); } } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common', 'hub.js'), 'utf8'), ctx, { filename: 'hub.js' });
  return { H: vm.runInContext('HUB', ctx), mem };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

console.log('놀이 본부 테스트');

test('빈 지갑에서 시작, 벌고 쓰기, 모자라면 못 씀', () => {
  const { H } = fresh();
  assert(H.coins() === 0, 'start 0');
  assert(H.addCoins(120) === 120, 'add');
  assert(H.spend(50) === true && H.coins() === 70, 'spend');
  assert(H.spend(100) === false && H.coins() === 70, 'not enough keeps balance');
  const s = H.load();
  assert(s.earned === 120 && s.spent === 50, 'earned/spent ' + s.earned + '/' + s.spent);
  assert(H.addCoins(-5) === 70 && H.addCoins('abc') === 70, 'bad input ignored');
});

test('setCoins: 게임 상점이 잔액을 맞추면 번 것·쓴 것으로 나뉜다', () => {
  const { H } = fresh();
  H.addCoins(100);
  H.setCoins(160);
  H.setCoins(40);
  const s = H.load();
  assert(s.coins === 40 && s.earned === 160 && s.spent === 120, JSON.stringify(s));
});

test('예전 게임 코인은 한 번만 지갑으로 옮긴다', () => {
  const { H } = fresh();
  assert(H.moveIn('ngun', 300) === true && H.coins() === 300, 'moved');
  assert(H.moveIn('ngun', 300) === false && H.coins() === 300, 'only once');
});

test('망가진 저장본도 기본 모양으로 읽는다', () => {
  const { H, mem } = fresh();
  mem['play.hub1'] = JSON.stringify({ coins: -5, games: { ngun: 'x', snake: { best: 'a', medals: 3 } }, daily: { list: [{ game: 'zzz' }] } });
  const s = H.load();
  assert(s.coins === 0 && !s.games.ngun && s.games.snake.medals === 3 && s.daily.list.length === 0, JSON.stringify(s));
  mem['play.hub1'] = '"hello"';
  assert(H.coins() === 0, 'string save');
});

test('오늘의 미션: 같은 날은 같은 3개, 서로 다른 게임, 날이 바뀌면 새로', () => {
  const { H } = fresh();
  const a = H.daily('2026-09-27'), b = H.daily('2026-09-27');
  assert(a.length === 3 && JSON.stringify(a) === JSON.stringify(b), 'same day same list');
  assert(new Set(a.map(m => m.game)).size === 3, 'different games');
  let differs = false;
  for (let d = 1; d <= 20; d++) if (JSON.stringify(H.pickDaily('2026-10-' + String(d).padStart(2, '0'))) !== JSON.stringify(H.pickDaily('2026-09-27'))) differs = true;
  assert(differs, 'other days differ');
});

test('오늘의 미션 진행: 한 판 최고값 / 하루 합계, 채우면 받기 + 셋 다 받으면 보너스', () => {
  const { H } = fresh();
  const day = '2026-09-27';
  const list = H.daily(day);
  // 각 미션의 게임에 목표만큼(합계형은 두 번 나눠서) 알려 준다
  list.forEach(m => {
    const def = H.DAILY[m.game].find(x => x.text === m.text);
    if (def.sum) { H.reportRun(m.game, { [def.stat]: Math.ceil(m.goal / 2) }, 30, day); H.reportRun(m.game, { [def.stat]: Math.ceil(m.goal / 2) }, 30, day); }
    else { H.reportRun(m.game, { [def.stat]: m.goal - 1 }, 30, day); assert(!H.daily(day).find(x => x.text === m.text).done, 'not yet'); H.reportRun(m.game, { [def.stat]: m.goal + 5 }, 30, day); }
  });
  const after = H.daily(day);
  assert(after.every(m => m.done && !m.claimed), 'all done');
  const c0 = H.coins();
  const g0 = H.claimDaily(0, day), g1 = H.claimDaily(1, day), g2 = H.claimDaily(2, day);
  assert(g0 === list[0].reward && g1 === list[1].reward && g2 === list[2].reward + H.DAILY_BONUS, 'rewards ' + [g0, g1, g2]);
  assert(H.coins() === c0 + g0 + g1 + g2, 'coins added');
  assert(H.claimDaily(0, day) === 0, 'no double claim');
});

test('다른 게임 기록은 오늘의 미션을 채우지 않고, 못 채운 건 못 받는다', () => {
  const { H } = fresh();
  const day = '2026-09-28';
  const list = H.daily(day);
  const other = H.GAMES.map(g => g.id).find(g => !list.some(m => m.game === g));
  H.reportRun(other, { wave: 99, len: 99, height: 999, dist: 9999, stars: 999, games: 9 }, 10, day);
  assert(H.daily(day).every(m => m.prog === 0), 'untouched');
  assert(H.claimDaily(0, day) === 0 && H.claimDaily(5, day) === 0, 'cannot claim');
});

test('기록실: 게임별 최고·메달·판 수, 합계, 오늘 논 시간', () => {
  const { H } = fresh();
  const day = H.dayKey();
  H.report('snake', { best: 500, bestText: '최고 500점', medals: 4, medalMax: 16, games: 7 });
  H.report('snake', { best: 300, bestText: '최고 300점', medals: 5, medalMax: 16, games: 8 });
  H.report('ngun', { best: 1000, bestText: '최고 1,000점', medals: 2, medalMax: 18, games: 3 });
  H.report('nope', { best: 1 });
  H.reportRun('snake', { len: 5 }, 90, day);
  H.reportRun('ngun', { wave: 2 }, 30, day);
  const s = H.summary(day);
  const sn = s.rows.find(r => r.id === 'snake');
  assert(sn.bestText === '최고 500점' && sn.best === 500 && sn.medals === 5 && sn.games === 8, JSON.stringify(sn));
  assert(s.medals === 7 && s.medalMax === H.GAMES.reduce((t, g) => t + H.MEDAL_MAX[g.id], 0) && s.games === 11, 'totals ' + JSON.stringify([s.medals, s.medalMax, s.games]));
  assert(s.todaySec === 120 && sn.sec === 90, 'time ' + s.todaySec);
  assert(s.rows.length === 5 && s.rows.map(r => r.id).join() === 'ngun,snake,jump,runner,bridge', 'order');
});

test('날이 바뀌면 오늘 논 시간이 0부터', () => {
  const { H } = fresh();
  H.reportRun('jump', { height: 10 }, 100, '2026-09-27');
  assert(H.summary('2026-09-27').todaySec === 100, 'day 1');
  assert(H.summary('2026-09-28').todaySec === 0, 'day 2 resets');
});

test('알아서 맞춰 주는 난이도: 처음 두 판은 그대로, 계속 빨리 지면 살짝 쉽게, 잘하면 살짝 어렵게, 범위 안에서만', () => {
  const { H } = fresh();
  assert(H.adaptMul('jump', 'easy') === 1, 'start 1');
  H.adaptRun('jump', 'easy', 0.2);
  assert(H.adaptMul('jump', 'easy') === 1, 'warm-up keeps 1');
  for (let i = 0; i < 10; i++) H.adaptRun('jump', 'easy', 0.2);
  const easy = H.adaptMul('jump', 'easy');
  assert(easy < 1 && easy >= H.ADAPT.min, 'easier after quick losses ' + easy);
  for (let i = 0; i < 20; i++) H.adaptRun('jump', 'easy', 3);
  const hard = H.adaptMul('jump', 'easy');
  assert(hard > 1 && hard <= H.ADAPT.max, 'harder after great runs ' + hard);
  assert(H.adaptMul('jump', 'normal') === 1 && H.adaptMul('snake', 'easy') === 1, 'separate per game and level');
  H.adaptRun('ngun', 'hard', 'x'); H.adaptRun('ngun', 'hard', -5); H.adaptRun('ngun', 'hard', 99);
  const m = H.adaptMul('ngun', 'hard');
  assert(m >= H.ADAPT.min && m <= H.ADAPT.max, 'bad input stays in range ' + m);
});

test('스티커북: 판 결과로 붙고, 한 번만, 다른 게임 값으로는 안 붙고, 열어 보면 새 표시가 꺼진다', () => {
  const { H } = fresh();
  const day = '2026-09-27';
  assert(H.stickers().length === H.STICKERS.length && H.stickers().every(t => !t.got), 'empty book');
  assert(new Set(H.STICKERS.map(t => t.id)).size === H.STICKERS.length, 'unique ids');
  for (const g of H.GAMES) assert(H.STICKERS.filter(t => t.game === g.id).length >= 5, 'each game has stickers ' + g.id);
  H.reportRun('jump', { height: 120, stars: 3 }, 30, day);
  let b = H.stickers();
  const got = id => b.find(t => t.id === id).got;
  assert(got('jp_first') && got('jp_cloud') && !got('jp_space'), 'jump stickers');
  assert(!got('rn_1k') && !got('sn_first'), 'other games untouched');
  H.reportRun('runner', { height: 999 }, 30, day);
  b = H.stickers();
  assert(!got('jp_space') && got('rn_first'), 'runner run does not give jump stickers');
  assert(b.filter(t => t.fresh).length === 3, 'fresh count ' + b.filter(t => t.fresh).length);
  H.seeStickers();
  assert(H.stickers().every(t => !t.fresh), 'seen');
  H.reportRun('jump', { height: 300 }, 30, day);
  b = H.stickers();
  assert(got('jp_space') && b.filter(t => t.fresh).length === 1 && got('jp_first') === day, 'new one only');
});

test('기록실 메달 합계: 아직 안 연 게임도 메달 수를 세고, 게임이 더 큰 수를 알려 주면 그쪽', () => {
  const { H } = fresh();
  const base = H.GAMES.reduce((t, g) => t + H.MEDAL_MAX[g.id], 0);
  assert(H.GAMES.every(g => H.MEDAL_MAX[g.id] > 0), 'every game has a default');
  assert(H.summary().medalMax === base, 'empty book ' + H.summary().medalMax);
  H.report('snake', { medals: 3, medalMax: 5 });            // 옛 게임이 작은 수를 알려도 기본값 아래로 안 내려간다
  assert(H.summary().medalMax === base, 'smaller report ignored');
  H.report('jump', { medals: 2, medalMax: H.MEDAL_MAX.jump + 4 });   // 메달이 늘었으면 그쪽
  const s = H.summary();
  assert(s.medalMax === base + 4 && s.medals === 5, 'bigger report ' + s.medalMax);
  assert(s.rows.find(r => r.id === 'runner').medalMax === H.MEDAL_MAX.runner, 'row max for unopened game');
});

test('게임 주소는 index.html까지 (파일로 바로 열어도 열리게)', () => {
  const { H } = fresh();
  assert(H.GAMES.map(g => g.path).join() === 'game/index.html,snake/index.html,jump/index.html,runner/index.html,bridge/index.html', H.GAMES.map(g => g.path).join());
});

test('오늘의 미션 글: 게임 이름을 되풀이하지 않고 짧게', () => {
  const { H } = fresh();
  const names = ['뿅뿅', '냠냠', '통통', '슝슝', '우주선', '달리기 '];
  for (const g of Object.keys(H.DAILY)) for (const m of H.DAILY[g]) {
    assert(!names.some(n => m.text.startsWith(n) || m.text.includes(n + ' ')), 'game name in ' + m.text);
    assert(m.text.length <= 16, 'too long ' + m.text);
  }
  // 예전 글로 저장된 오늘의 미션도 새 글로 읽힌다 (stat으로 찾아 맞춘다)
  const { H: H2, mem } = fresh();
  mem['play.hub1'] = JSON.stringify({ daily: { day: '2026-09-27', list: [{ game: 'runner', stat: 'jumps', text: '슝슝 달리기 레이저 문 10번 넘기' }, { game: 'jump', stat: 'height' }, { game: 'ngun', stat: 'wave' }], prog: [3, 0, 0], claimed: [false, false, false] } });
  const d = H2.daily('2026-09-27');
  assert(d[0].text === '레이저 문 10번 뛰어넘기' && d[0].prog === 3, JSON.stringify(d[0]));
});

test('새 스티커: 보스 도감·외계 행성·별 모으기 대장·태양계 밖으로', () => {
  const { H } = fresh();
  const day = '2026-09-27';
  const got = id => H.stickers().find(t => t.id === id).got;
  assert(H.STICKERS.length >= 29, 'count ' + H.STICKERS.length);
  H.reportRun('ngun', { bossKinds: 2, planet: 9 }, 10, day);
  assert(!got('ng_boss3') && !got('ng_exo'), 'not yet');
  H.reportRun('ngun', { bossKinds: 3, planet: 10 }, 10, day);
  assert(got('ng_boss3') && got('ng_exo'), 'ngun new');
  H.reportRun('snake', { stageStars: 14 }, 10, day);
  assert(!got('sn_stars'), 'snake not yet');
  H.reportRun('snake', { stageStars: 15 }, 10, day);
  assert(got('sn_stars'), 'snake stars');
  H.reportRun('jump', { height: 699 }, 10, day);
  assert(!got('jp_exo') && got('jp_stars'), 'jump 699');
  H.reportRun('jump', { height: 700 }, 10, day);
  assert(got('jp_exo'), 'jump 700');
  H.reportRun('runner', { dist: 3374 }, 10, day);
  assert(!got('rn_exo'), 'runner 3374');
  H.reportRun('runner', { dist: 3375 }, 10, day);
  assert(got('rn_exo'), 'runner 3375');
  H.reportRun('ngun', { continues: 2 }, 10, day);   // 모르는 값은 그냥 무시
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
