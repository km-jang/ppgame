'use strict';
// 우주 여행 도감(common/worlds.js) 테스트. 실행: node tests/worlds.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common', 'worlds.js'), 'utf8'), ctx, { filename: 'worlds.js' });
const W = vm.runInContext('WORLDS', ctx);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }
const hex = s => /^#[0-9a-f]{6}$/i.test(s);

console.log('우주 여행 도감 테스트');

test('태양계 아홉 행성 모두 날씨가 있다', () => {
  for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'])
    assert(W.weatherOf(id), id);
});

test('외계 행성 여덟: id가 겹치지 않고 색·하늘·날씨가 온전하다', () => {
  assert(W.EXO.length === 8, 'eight');
  const ids = new Set();
  for (const p of W.EXO) {
    assert(!ids.has(p.id), 'dup ' + p.id); ids.add(p.id);
    assert(p.name && p.line, 'text ' + p.id);
    assert(hex(p.color) && p.sky.length === 3 && p.sky.every(hex) && p.glow.every(hex) && p.body.every(hex) && hex(p.accent), 'colors ' + p.id);
    assert(W.weatherOf(p.id) === p.weather && W.exo(p.id) === p, 'lookup ' + p.id);
  }
});

test('날씨 값은 알려진 종류, 양 0~1, 바람 -1~1, 색 두 개', () => {
  const all = Object.values(W.SOLAR_WEATHER).concat(W.EXO.map(p => p.weather));
  for (const w of all) {
    assert(W.KINDS.includes(w.kind), 'kind ' + w.kind);
    assert(w.amount >= 0 && w.amount <= 1 && w.wind >= -1 && w.wind <= 1, 'range ' + w.kind);
    assert(w.color.length === 2 && w.color.every(hex), 'color ' + w.kind);
  }
});

test('얼음 행성은 눈, 용암 행성은 불씨', () => {
  assert(W.weatherOf('frost').kind === 'snow' && W.weatherOf('lava').kind === 'ember');
  assert(W.weatherOf('nothing') === null && W.exo('nothing') === null);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
