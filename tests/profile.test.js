'use strict';
// 아이 프로필 · 보호자 설정 · 놀이 시간 (common/profile.js) 테스트. 실행: node tests/profile.test.js
// node + vm: 가짜 Storage(브라우저의 Storage.prototype과 같은 모양)를 깔고 profile.js를 불러,
// 키 접두어·공통 키·첫째 무접두어·바꾸기·지우기·4명 제한·시간 계산·날짜 바뀜·알림 순서·소리 상한을 본다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'common', 'profile.js'), 'utf8');
const HUB_SRC = fs.readFileSync(path.join(__dirname, '..', 'common', 'hub.js'), 'utf8');
const SND_SRC = fs.readFileSync(path.join(__dirname, '..', 'common', 'sound.js'), 'utf8');

// 브라우저처럼: 메서드는 Storage.prototype에, localStorage는 그 인스턴스
function makeStorageClass() {
  class Storage {
    constructor() { Object.defineProperty(this, '_m', { value: new Map(), enumerable: false }); }
    getItem(k) { k = String(k); return this._m.has(k) ? this._m.get(k) : null; }
    setItem(k, v) { this._m.set(String(k), String(v)); }
    removeItem(k) { this._m.delete(String(k)); }
    key(i) { const a = [...this._m.keys()]; return i < a.length ? a[i] : null; }
    get length() { return this._m.size; }
    clear() { this._m.clear(); }
  }
  return Storage;
}

// 같은 저장소(mem)를 쓰는 새 페이지를 연다. extra: 'hub' · 'snd'도 같이 불러오기
function page(mem, extra) {
  const Storage = makeStorageClass();
  const ls = new Storage();
  if (mem) for (const [k, v] of mem) ls._m.set(k, v);
  const ss = new Storage();
  const ctx = vm.createContext({ console, Math, Date, JSON, Number, String, Object, Array, Map, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() {}, Storage, localStorage: ls, sessionStorage: ss });
  vm.runInContext(SRC, ctx, { filename: 'profile.js' });
  if (extra && extra.includes('hub')) vm.runInContext(HUB_SRC, ctx, { filename: 'hub.js' });
  if (extra && extra.includes('snd')) vm.runInContext(SND_SRC, ctx, { filename: 'sound.js' });
  const P = vm.runInContext('PROFILE', ctx);
  return { P, ls, ss, mem: ls._m, ctx, run: code => vm.runInContext(code, ctx) };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }
const J = x => JSON.stringify(x);

console.log('아이 프로필 · 보호자 테스트');

test('처음: 첫째 한 명(기본 그림), play.profiles 모양', () => {
  const { P, mem } = page();
  const s = JSON.parse(mem.get('play.profiles'));
  assert(s.v === 1 && s.active === 1 && s.list.length === 1, J(s));
  assert(s.list[0].id === 1 && s.list[0].name === '첫째' && P.ICONS.includes(s.list[0].icon), J(s.list[0]));
  assert(P.ICONS.length === 12 && P.MAX === 4, '그림 12개 · 최대 4명');
  assert(P.current().name === '첫째' && P.activeId() === 1, 'current');
});

test('첫째는 접두어 없음: 예전 기록이 그대로 보이고 그대로 저장된다', () => {
  const { P, ls, mem } = page(new Map([['play.hub1', '{"coins":77}'], ['ngun.rec1', '{"x":1}']]));
  assert(P.prefixOf(1) === '' && P.prefixOf(3) === 'p3:', 'prefixOf');
  assert(ls.getItem('play.hub1') === '{"coins":77}', '예전 지갑이 그대로');
  ls.setItem('snake.best', '5');
  assert(mem.get('snake.best') === '5' && !mem.has('p1:snake.best'), '첫째는 맨 키로 저장');
});

test('둘째부터는 p<id>: 접두어, 공통 키는 안 붙는다', () => {
  const { P, ls, mem } = page();
  const b = P.add('민지', '🐱');
  assert(b && b.id === 2 && b.name === '민지' && b.icon === '🐱', J(b));
  P.switchTo(2);
  ls.setItem('play.hub1', '{"coins":5}');
  ls.setItem('jump.rec', '1');
  assert(mem.get('p2:play.hub1') === '{"coins":5}' && mem.get('p2:jump.rec') === '1', '접두어');
  assert(!mem.has('play.hub1') && !mem.has('jump.rec'), '맨 키는 그대로 비어 있음');
  for (const k of ['play.profiles', 'play.parent', 'play.time', 'play.sound1', 'play.dev.x', 'play.devtools', 'sw.ver', 'fonts.cache']) {
    ls.setItem(k, '"v"');
    assert(mem.get(k) === '"v"' && !mem.has('p2:' + k), '공통 키 ' + k);
    assert(P.isShared(k), 'isShared ' + k);
  }
  assert(!P.isShared('play.hub1') && !P.isShared('ngun.shop1'), '지갑·상점은 아이마다');
  // 이미 접두어가 붙은 키는 두 번 안 붙인다
  ls.setItem('p3:foo', 'x');
  assert(mem.get('p3:foo') === 'x' && !mem.has('p2:p3:foo'), '두 번 안 붙임');
  ls.removeItem('jump.rec');
  assert(!mem.has('p2:jump.rec'), 'removeItem도 접두어');
});

test('sessionStorage는 건드리지 않는다', () => {
  const { P, ss } = page();
  P.add(); P.switchTo(2);
  ss.setItem('a', '1');
  assert(ss._m.get('a') === '1' && ss.getItem('a') === '1', 'sessionStorage 맨 키');
});

test('key()·length: 지금 아이 키 + 공통 키만, 접두어 없이', () => {
  const { P, ls, mem } = page(new Map([['play.hub1', '1'], ['ngun.x', '1'], ['play.sound1', '{}']]));
  P.add(); P.add();
  mem.set('p2:play.hub1', '2'); mem.set('p2:snake.y', '2'); mem.set('p3:z', '3');
  let keys = []; for (let i = 0; i < ls.length; i++) keys.push(ls.key(i));
  assert(keys.includes('play.hub1') && keys.includes('ngun.x') && keys.includes('play.sound1') && keys.includes('play.profiles'), '첫째 ' + J(keys));
  assert(!keys.some(k => /^p\d+:/.test(k)), '첫째에게 다른 아이 키가 보임 ' + J(keys));
  P.switchTo(2);
  keys = []; for (let i = 0; i < ls.length; i++) keys.push(ls.key(i));
  assert(keys.includes('play.hub1') && keys.includes('snake.y') && keys.includes('play.sound1'), '둘째 ' + J(keys));
  assert(!keys.includes('ngun.x') && !keys.includes('z'), '둘째에게 다른 아이 키 ' + J(keys));
  assert(ls.getItem('play.hub1') === '2', '둘째 지갑');
  assert(ls.key(999) === null, '범위 밖');
});

test('HUB 지갑(play.hub1)은 아이마다, 소리 설정(play.sound1)은 기기 하나', () => {
  const mem = new Map();
  let pg = page(mem, ['hub', 'snd']);
  pg.run('HUB.addCoins(100); SND.setMusic(false);');
  assert(pg.run('HUB.coins()') === 100, '첫째 100');
  pg.P.add('둘째'); pg.P.switchTo(2);
  // 새 페이지(다시 불러오기)처럼
  pg = page(pg.mem, ['hub', 'snd']);
  assert(pg.P.activeId() === 2, '다시 불러도 둘째');
  assert(pg.run('HUB.coins()') === 0, '둘째 지갑은 0');
  assert(pg.run('SND.musicOn()') === false, '소리 설정은 같이');
  pg.run('HUB.addCoins(30)');
  pg.P.switchTo(1);
  pg = page(pg.mem, ['hub']);
  assert(pg.run('HUB.coins()') === 100, '첫째 다시 100');
  assert(JSON.parse(pg.mem.get('p2:play.hub1')).coins === 30, '둘째 30 저장');
});

test('바꾸기: 없는 아이로는 못 바꾸고, 바꾸면 active가 저장된다', () => {
  const { P, mem } = page();
  assert(P.switchTo(5) === false && P.activeId() === 1, '없는 아이');
  P.add(); P.add();
  assert(P.switchTo(3) === true && JSON.parse(mem.get('play.profiles')).active === 3, '저장');
  assert(page(mem).P.activeId() === 3, '새 페이지도 셋째');
});

test('최대 4명, 이름·그림 바꾸기, 이상한 이름은 거절·다듬기', () => {
  const { P } = page();
  const a = P.add(), b = P.add(), c = P.add();
  assert(a.name === '둘째' && b.name === '셋째' && c.name === '넷째', '기본 이름 ' + [a.name, b.name, c.name]);
  assert(new Set(P.list().map(p => p.icon)).size === 4, '기본 그림이 서로 다름');
  assert(P.add() === null && P.list().length === 4, '5번째는 안 됨');
  assert(P.rename(1, '  하준이  ') && P.get(1).name === '하준이', '첫째 이름 바꾸기');
  assert(P.rename(2, '') === false && P.get(2).name === '둘째', '빈 이름 거절');
  assert(P.rename(2, '<b>아주아주긴이름이에요</b>') && P.get(2).name.length <= P.NAME_MAX && !/[<>]/.test(P.get(2).name), '다듬기 ' + P.get(2).name);
  assert(P.setIcon(3, '🦖') && P.get(3).icon === '🦖', '그림');
  assert(P.setIcon(3, '💩') === false && P.get(3).icon === '🦖', '목록 밖 그림 거절');
});

test('지우기: 그 아이 키만 모두 지운다, 첫째는 못 지운다, 지운 아이였으면 첫째로', () => {
  const { P, ls, mem } = page(new Map([['play.hub1', '1'], ['ngun.rec1', '1']]));
  P.add(); P.add();
  P.switchTo(2); ls.setItem('play.hub1', '2'); ls.setItem('snake.best', '2');
  P.switchTo(3); ls.setItem('play.hub1', '3');
  P.setLimit(2, 30); P.addExtra(2); P.addPlayed(2, 120);
  P.switchTo(2);
  assert(P.remove(1) === false, '첫째 못 지움');
  assert(P.remove(2) === true, '둘째 지움');
  assert(!mem.has('p2:play.hub1') && !mem.has('p2:snake.best'), '둘째 키가 남음');
  assert(mem.get('p3:play.hub1') === '3' && mem.get('play.hub1') === '1' && mem.get('ngun.rec1') === '1', '다른 아이 키는 그대로');
  assert(P.activeId() === 1 && JSON.parse(mem.get('play.profiles')).active === 1, '첫째로');
  assert(P.limit(2) === 0 && P.extraMin(2) === 0 && P.played(2) === 0, '보호자 설정·시간도 지움');
  assert(P.list().length === 2 && P.remove(2) === false, '두 번 지우기');
  // 새로 만든 아이는 빈 기록 (예전 번호 기록이 남아 있어도)
  mem.set('p4:play.hub1', 'old');
  const d = P.add();
  assert(d.id === 4 && !mem.has('p4:play.hub1'), '새 아이는 빈 기록 ' + d.id);
});

test('망가진 play.profiles도 올바른 모양으로 (첫째는 늘 있다)', () => {
  const bad = [null, 'x', '{"list":5}', '{"list":[{"id":3,"name":"셋","icon":"🐸"},{"id":3},{"id":-1}],"active":9}'];
  for (const raw of bad) {
    const mem = new Map(); if (raw != null) mem.set('play.profiles', raw);
    const { P } = page(mem);
    const l = P.list();
    assert(l[0].id === 1 && l.length >= 1 && new Set(l.map(p => p.id)).size === l.length, '모양 ' + raw + ' ' + J(l));
    assert(l.some(p => p.id === P.activeId()), 'active ' + raw);
  }
  const { P } = page(new Map([['play.profiles', J({ v: 1, list: [1, 2, 3, 4, 5].map(i => ({ id: i, name: 'a' + i, icon: '🐱' })), active: 5 })]]));
  assert(P.list().length === 4 && P.activeId() === 1, '4명까지, 없는 active는 첫째');
});

test('하루 놀이 시간: 제한·10분 더·남은 분 계산', () => {
  const { P, mem } = page();
  const day = P.dayKey();
  assert(P.leftSec(1) === null && P.leftMin(1) === null, '제한 없음');
  assert(P.setLimit(1, 25) === false && P.limit(1) === 0, '목록 밖 제한 거절');
  for (const m of P.LIMITS) { assert(P.setLimit(1, m), '제한 ' + m); assert(P.limit(1) === m, '읽기 ' + m); }
  P.setLimit(1, 30);
  P.addPlayed(1, 7 * 60 + 30);
  assert(P.leftSec(1) === 22 * 60 + 30 && P.leftMin(1) === 23, '남은 ' + P.leftSec(1) + ' ' + P.leftMin(1));
  assert(P.addExtra(1) === 10 && P.addExtra(1) === 20 && P.extraMin(1) === 20, '10분 더 두 번');
  assert(P.leftMin(1) === 43, '더한 뒤 ' + P.leftMin(1));
  P.addPlayed(1, 60 * 60);
  assert(P.leftSec(1) < 0 && P.leftMin(1) === 0, '넘으면 0');
  const pa = JSON.parse(mem.get('play.parent'));
  assert(pa.v === 1 && pa.limits[1] === 30 && pa.extra[1].day === day && pa.extra[1].min === 20 && pa.volMax === 1, J(pa));
  assert(P.setLimit(1, 0) && P.leftMin(1) === null && !('1' in JSON.parse(mem.get('play.parent')).limits), '제한 없음으로');
  // 어제 준 10분은 오늘 안 센다
  P.setLimit(1, 20);
  assert(P.extraMin(1, '2000-01-01') === 0, '다른 날 더한 시간');
});

test('날짜가 바뀌면 논 시간·알림이 새로', () => {
  const { P, mem } = page();
  P.setLimit(1, 20);
  P.addPlayed(1, 600, '2026-09-27');
  assert(P.played(1, '2026-09-27') === 600, '어제');
  assert(P.played(1, '2026-09-28') === 0 && P.leftMin(1, '2026-09-28') === 20, '오늘은 0');
  P.addPlayed(1, 30, '2026-09-28');
  const t = JSON.parse(mem.get('play.time'));
  assert(t.day === '2026-09-28' && t.sec[1] === 30, J(t));
  P.addExtra(1, 10, '2026-09-27');
  assert(P.extraMin(1, '2026-09-28') === 0 && P.addExtra(1, 10, '2026-09-28') === 10, '10분 더도 날마다');
});

test('알림 순서: 10분 → 5분 → 끝 → 논 시간 5분마다, 한 번씩만', () => {
  const { P } = page();
  const st = { f10: false, f5: false, f0: false, last: 0 };
  const seq = [];
  // 20분 제한, 5초씩 30분 동안
  for (let played = 0; played <= 30 * 60; played += 5) { const k = P.warnStep(st, 20 * 60 - played, played); if (k) seq.push(k + '@' + played); }
  assert(J(seq) === J(['soon@600', 'sooner@900', 'over@1200', 'over@1500', 'over@1800']), J(seq));
  assert(P.warnStep({ f10: false, f5: false, f0: false, last: 0 }, null, 0) === null, '제한 없음');
  // 7분 남은 채로 시작하면 한 번만 (10분 알림, 글은 남은 분)
  const s2 = { f10: false, f5: false, f0: false, last: 0 };
  assert(P.warnStep(s2, 420, 0) === 'soon' && P.warnStep(s2, 415, 5) === null, '7분 시작');
  assert(P.warnText('soon', 420).text === '놀이 시간이 7분 남았어요', P.warnText('soon', 420).text);
  assert(P.warnText('soon', 600).text === '놀이 시간이 10분 남았어요' && P.warnText('sooner', 300).text === '놀이 시간이 5분 남았어요', '10·5분 글');
  assert(/약속한 놀이 시간이 끝났어요! 이 판을 마치고 쉬어요/.test(P.warnText('over', 0).text), '끝 글');
  // 10분 더 받으면 다시 알림
  const s3 = { f10: true, f5: true, f0: true, last: 100 };
  assert(P.warnStep(s3, 10 * 60 - 5, 200) === 'soon' && !s3.f0 && !s3.f5, '10분 더 받고 다시');
});

test('판 도는 동안 세기: setPlaying·debug.addPlayed로 알림이 한 번씩 뜬다 (저장된 알림 상태로 페이지를 옮겨도)', () => {
  const mem = new Map();
  let pg = page(mem);
  pg.P.setLimit(1, 20);
  pg.P.setPlaying(true);
  assert(pg.P.lastToast == null, '아직 알림 없음');
  assert(pg.P.debug.addPlayed(9 * 60 + 55) === null, '10분 5초 남음');
  assert(pg.P.debug.addPlayed(10) === 'soon' && pg.P.lastToast.text === '놀이 시간이 10분 남았어요', '10분 ' + J(pg.P.lastToast));
  // 다른 게임 페이지로 가도 10분 알림은 다시 안 뜬다
  pg = page(pg.mem); pg.P.setPlaying(true);
  assert(pg.P.debug.addPlayed(5) === null, '다시 안 뜸');
  assert(pg.P.debug.addPlayed(300) === 'sooner', '5분');
  assert(pg.P.debug.addPlayed(300) === 'over' && pg.P.lastToast.kind === 'over', '끝');
  assert(pg.P.debug.addPlayed(200) === null && pg.P.debug.addPlayed(100) === 'over', '5분 뒤 다시');
  // 이미 끝난 채로 판을 시작하면 바로 알림
  pg = page(pg.mem);
  pg.P.lastToast = null;
  pg.P.setPlaying(true);
  assert(pg.P.lastToast && pg.P.lastToast.kind === 'over', '판 시작 때 ' + J(pg.P.lastToast));
  pg.P.setPlaying(false);
  // 제한이 없으면 알림 없음
  const q = page(); q.P.setPlaying(true);
  assert(q.P.debug.addPlayed(5000) === null && q.P.lastToast == null, '제한 없음');
});

test('시계로 세기: 판이 돌 때만, 5초마다 저장', () => {
  let t = 1000000;
  // profile.js는 Date.now를 쓰므로 가짜 시계를 넣은 페이지를 연다
  const Storage = makeStorageClass();
  const ls = new Storage();
  const c2 = vm.createContext({ console, Math, JSON, Number, String, Object, Array, Map, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() {}, Storage, localStorage: ls,
    Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => t }) });
  vm.runInContext(SRC, c2);
  const Q = vm.runInContext('PROFILE', c2);
  Q.setPlaying(true);
  t += 5000; Q.debug.tick();
  assert(Math.abs(Q.played(1) - 5) < 0.01, '5초 ' + Q.played(1));
  t += 2000; Q.debug.tick();
  assert(Math.abs(Q.played(1) - 5) < 0.01 && Math.abs(Q.debug.pending() - 2) < 0.01, '5초 안 된 것은 모아 둠');
  Q.setPlaying(false);
  t += 60000; Q.debug.tick();
  assert(Math.abs(Q.played(1) + Q.debug.pending() - 7) < 0.01, '멈춤 동안은 안 셈 ' + Q.played(1) + ' ' + Q.debug.pending());
  Q.setPlaying(true);
  t += 600000; Q.debug.tick(); // 오래 멈췄다 온 한 번은 15초까지만
  assert(Q.played(1) <= 7 + 15 + 0.01, '큰 틈은 잘라 냄 ' + Q.played(1));
});

test('소리 크기 상한: 보호자 설정 저장·가까운 칸으로·SND에 바로', () => {
  const pg = page(null, ['snd']);
  const { P, mem } = pg;
  assert(P.volMax() === 1 && pg.run('SND.cap()') === 1, '기본 100%');
  assert(P.setVolMax(0.5) === 0.5 && JSON.parse(mem.get('play.parent')).volMax === 0.5, '저장');
  assert(pg.run('SND.cap()') === 0.5 && pg.run('SND.masterTarget()') === 0.5, 'SND에 바로');
  assert(P.setVolMax(0.3) === 0.25 && P.setVolMax(0.8) === 0.75 && P.setVolMax(7) === 1, '가까운 칸');
  assert(P.capOf('x') === 1 && P.capOf(0.1) === 0.25 && P.capOf(2) === 1, 'capOf');
  P.setVolMax(0.25);
  pg.run('SND.setMuted(true)');
  assert(pg.run('SND.masterTarget()') === 0, '음소거면 0');
  // 새 페이지도 상한을 읽는다
  const again = page(mem, ['snd']);
  assert(again.run('SND.cap()') === 0.25, '다시 불러도 25%');
});

test('기록 옮기기: 한 아이 내보내기 → 다른 기기에서 새 아이로 추가 (코드와 파일 둘 다)', () => {
  const a = page(new Map([['play.hub1', J({ coins: 321, stickers: { ng_first: '2026-09-28', jp_first: '2026-09-28' }, games: { ngun: { medals: 3 }, jump: { medals: 2 } } })], ['ngun.shop1', '{"ship":"twin"}'], ['play.sound1', '{"muted":true}']]));
  a.P.rename(1, '하준'); a.P.setIcon(1, '🦖'); a.P.setLimit(1, 45);
  a.P.add('민지', '🐱');
  a.mem.set('p2:play.hub1', J({ coins: 9 }));
  const code = a.P.exportCode(1, new Date(2026, 8, 28, 10, 0));
  assert(/^[A-Za-z0-9+/=]+$/.test(code), '코드는 base64 글자만');
  const file = JSON.stringify(a.P.exportData(1));
  assert(a.P.exportFileName(new Date(2026, 8, 28)) === 'ppyong-kids-20260928.json', a.P.exportFileName(new Date(2026, 8, 28)));
  const payload = JSON.parse(file);
  assert(payload.app === 'ppyong-kids' && payload.v === 1 && typeof payload.sum === 'string', '묶음 모양');
  assert(payload.data.kids.length === 1 && payload.data.kids[0].name === '하준' && !payload.data.device, '한 아이, 기기 설정 없음');
  const keys = Object.keys(payload.data.kids[0].keys);
  assert(keys.includes('play.hub1') && keys.includes('ngun.shop1') && !keys.includes('play.sound1') && !keys.includes('play.profiles') && !keys.some(k => /^p\d+:/.test(k)), '첫째 키만 ' + J(keys));
  for (const text of [code, file, '  ' + code.replace(/(.{60})/g, '$1\n') + '\n']) {
    const b = page();
    const r = b.P.decode(text);
    assert(r.ok, '읽기 ' + r.msg);
    const pv = b.P.preview(r.data);
    assert(pv.length === 1 && pv[0].name === '하준' && pv[0].icon === '🦖' && pv[0].coins === 321 && pv[0].medals === 5 && pv[0].stickers === 2, '미리 보기 ' + J(pv));
    const id = b.P.importKid(r.data, 'new');
    assert(id === 2 && b.P.get(2).name === '하준' && b.P.limit(2) === 45, '새 아이 ' + id);
    assert(JSON.parse(b.mem.get('p2:play.hub1')).coins === 321 && b.mem.get('p2:ngun.shop1') === '{"ship":"twin"}', '키가 둘째 접두어로');
    assert(!b.mem.has('play.hub1') || JSON.parse(b.mem.get('play.hub1')).coins !== 321, '첫째는 그대로');
  }
  // 둘째(접두어 있는 아이) 내보내기는 접두어 없이 담긴다
  const two = a.P.exportData(2).data.kids[0];
  assert(two.name === '민지' && J(Object.keys(two.keys)) === J(['play.hub1']), '둘째 ' + J(two));
});

test('기록 옮기기: 덮어쓰기는 그 아이 키만 바꾸고 이름·그림은 그대로', () => {
  const a = page(new Map([['play.hub1', J({ coins: 50 })], ['snake.best', '9']]));
  const code = a.P.exportCode(1);
  const b = page(new Map([['play.hub1', J({ coins: 1 })], ['jump.rec', 'old']]));
  b.P.add('둘'); b.mem.set('p2:play.hub1', J({ coins: 2 })); b.mem.set('p2:runner.rec', 'x');
  const d = b.P.decode(code).data;
  assert(b.P.importKid(d, 2) === 2, '둘째 덮어쓰기');
  assert(JSON.parse(b.mem.get('p2:play.hub1')).coins === 50 && b.mem.get('p2:snake.best') === '9' && !b.mem.has('p2:runner.rec'), '둘째 키가 바뀜');
  assert(b.P.get(2).name === '둘' && JSON.parse(b.mem.get('play.hub1')).coins === 1, '이름 그대로, 첫째 그대로');
  assert(b.P.importKid(d, 1) === 1 && JSON.parse(b.mem.get('play.hub1')).coins === 50 && !b.mem.has('jump.rec') && b.mem.has('play.profiles'), '첫째 덮어쓰기(공통 키는 남음)');
  assert(b.P.importKid(d, 7) === 0, '없는 아이');
  b.P.add(); b.P.add();
  assert(b.P.importKid(d, 'new') === 0, '4명이면 새 아이 안 됨');
});

test('기록 옮기기: 모든 아이 내보내기 → 기기 기록 모두 바꾸기 (소리 설정·상한도)', () => {
  const a = page(new Map([['play.hub1', J({ coins: 10 })], ['play.sound1', '{"muted":false,"music":false,"fx":true}']]));
  a.P.add('둘', '🐼'); a.mem.set('p2:play.hub1', J({ coins: 20 }));
  a.P.add('셋', '🐸'); a.mem.set('p3:play.hub1', J({ coins: 30 }));
  a.P.remove(2); // 번호에 빈칸이 있어도
  a.P.setVolMax(0.5); a.P.setLimit(3, 60);
  const d0 = a.P.exportData('all');
  assert(d0.data.scope === 'all' && d0.data.kids.length === 2 && d0.data.device.volMax === 0.5, '모든 아이 ' + J(d0.data.device));
  const b = page(new Map([['play.hub1', J({ coins: 999 })], ['p2:x', '1']]));
  b.P.add(); b.mem.set('p2:play.hub1', 'z');
  const r = b.P.decode(a.P.exportCode('all'));
  assert(r.ok && b.P.preview(r.data).map(x => x.coins).join() === '10,30', '미리 보기 ' + J(r.data && b.P.preview(r.data)));
  assert(b.P.importAllNew(r.data) === 2 && b.P.list().length === 4, '모두 새 아이로');
  assert(b.P.importAllNew(r.data) === 0, '자리가 모자라면 안 함');
  assert(b.P.importReplace(r.data) === 2, '모두 바꾸기');
  const l = b.P.list();
  assert(J(l.map(p => [p.id, p.name, p.icon])) === J([[1, '첫째', '🚀'], [2, '셋', '🐸']]), J(l));
  assert(JSON.parse(b.mem.get('play.hub1')).coins === 10 && JSON.parse(b.mem.get('p2:play.hub1')).coins === 30 && !b.mem.has('p3:play.hub1') && !b.mem.has('p2:x'), '키');
  assert(b.P.limit(2) === 60 && b.P.volMax() === 0.5 && JSON.parse(b.mem.get('play.sound1')).music === false && b.P.activeId() === 1, '설정');
});

test('기록 옮기기: 망가진 코드·다른 코드·새 버전 코드는 친절하게 거절', () => {
  const a = page(new Map([['play.hub1', J({ coins: 5 })]]));
  const code = a.P.exportCode(1), P = page().P;
  const bad = P.decode(code.slice(0, code.length - 12));
  assert(!bad.ok && /망가졌어요/.test(bad.msg), '잘린 코드 ' + J(bad));
  const obj = a.P.exportData(1); obj.data.kids[0].keys['play.hub1'] = J({ coins: 99999 });
  assert(/망가졌어요/.test(P.decode(JSON.stringify(obj)).msg), '바꾼 코드');
  assert(!P.decode('').ok && /붙여 넣거나/.test(P.decode('').msg), '빈 칸');
  assert(/망가졌어요/.test(P.decode('안녕하세요').msg) && /망가졌어요/.test(P.decode('{oops').msg), '엉뚱한 글');
  assert(/아니에요/.test(P.decode(J({ app: 'other', v: 1 })).msg), '다른 앱');
  const nv = a.P.exportData(1); nv.v = 2;
  assert(/새 버전/.test(P.decode(JSON.stringify(nv)).msg), '새 버전');
  const sh = a.P.exportData(1); sh.data.kids[0].keys['play.parent'] = '{}'; sh.sum = undefined;
  assert(!P.decode(JSON.stringify(sh)).ok, '공통 키가 든 코드');
  assert(!/[\u2014\u2013]/.test(bad.msg), '줄표 없음');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
