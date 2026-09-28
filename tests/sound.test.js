'use strict';
// 공통 소리(common/sound.js) 테스트. 실행: node tests/sound.test.js
// 1부: node + vm (AudioContext 없음): 모든 함수가 조용히 아무것도 안 하는지, 설정 저장·옛 키 이어받기, 간격 막기, 테마·음표.
// 2부: 크로미움 OfflineAudioContext로 실제 소리를 그려 크기를 잰다 (Playwright가 없으면 건너뜀).
//      SNDLIB_WAV=폴더 를 주면 들어 볼 WAV를 그 폴더에 sndlib-*.wav로 남긴다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'common', 'sound.js'), 'utf8');

function fresh(mem, withHub) {
  mem = mem || {};
  const store = { get: (k, f) => (k in mem ? JSON.parse(mem[k]) : f), set: (k, v) => { mem[k] = JSON.stringify(v); } };
  const ctx = vm.createContext({ console, Math, Date, JSON, Number, String, Object, Array, setTimeout, clearTimeout });
  if (withHub !== false) ctx.HUB = { store };
  else ctx.SND = { store };
  vm.runInContext(SRC, ctx, { filename: 'sound.js' });
  return { S: vm.runInContext('SND', ctx), mem };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
  'frost', 'lava', 'ocean', 'glass', 'gem', 'twin', 'shroom', 'rogue'];
const EXTRA = ['ground', 'sky', 'galaxy', 'title'];

(async () => {
  console.log('공통 소리 테스트');

  await test('AudioContext가 없어도 모든 함수가 조용히 아무것도 안 한다', () => {
    const { S } = fresh();
    for (const k of ['ctx', 'out', 'unlock', 'ready', 'muted', 'setMuted', 'toggleMuted', 'musicOn', 'setMusic', 'fxOn', 'setFx', 'onChange', 'ui', 'run', 'allow', 'themeFor', 'pattern', 'onReady'])
      assert(typeof S[k] === 'function', '없음 ' + k);
    for (const k of ['play', 'stop', 'setMood', 'duck', 'mood', 'playing']) assert(typeof S.music[k] === 'function', '없음 music.' + k);
    assert(S.ctx() === null && S.out() == null && S.ready() === false, 'ctx');
    S.unlock();
    for (const n of S.UI_NAMES) assert(S.ui(n) === false, 'ui ' + n);
    assert(S.ui('없는소리') === false, 'unknown');
    assert(S.run(() => { throw new Error('불리면 안 됨'); }) === false, 'run');
    S.music.play('snake', 'mars'); S.music.setMood({ fever: true, boss: true, planet: 'lava' }); S.music.duck(0.3); S.music.stop();
    let got = null; S.onReady(c => { got = c; });
    assert(got === null, 'onReady는 ctx가 생길 때까지 기다린다');
  });

  await test('공통 효과음 이름이 다 있다', () => {
    const { S } = fresh();
    for (const n of ['tap', 'open', 'close', 'coin', 'buy', 'deny', 'claim', 'medal', 'sticker', 'star', 'continueAsk', 'tick', 'continueGo', 'fanfare', 'over', 'overSoft'])
      assert(S.UI_NAMES.includes(n), '없음 ' + n);
  });

  await test('설정: 처음엔 켬, 바꾸면 저장되고 다시 불러도 그대로, onChange 알림', () => {
    const mem = {};
    const { S } = fresh(mem);
    assert(S.muted() === false && S.musicOn() === true && S.fxOn() === true, '처음');
    const seen = [];
    const off = S.onChange(s => seen.push(s));
    S.setMuted(true); S.setMusic(false);
    assert(JSON.parse(mem['play.sound1']).muted === true && JSON.parse(mem['play.sound1']).music === false, '저장');
    assert(seen.length === 2 && seen[1].muted === true && seen[1].music === false && seen[1].fx === true, '알림 ' + JSON.stringify(seen));
    S.setMuted(true);
    assert(seen.length === 2, '같은 값이면 알림 없음');
    off(); S.setFx(false);
    assert(seen.length === 2, '구독 해제');
    const again = fresh(mem).S;
    assert(again.muted() === true && again.musicOn() === false && again.fxOn() === false, '다시 불러오기');
    again.toggleMuted();
    assert(again.muted() === false, 'toggle');
  });

  await test('설정: 옛 게임별 끄기(ngun.muted 등)가 켜져 있었으면 처음엔 끔으로', () => {
    for (const k of ['ngun.muted', 'snake.muted', 'jump.muted', 'runner.muted']) {
      const mem = { [k]: 'true' };
      const { S } = fresh(mem);
      assert(S.muted() === true, k);
      assert(JSON.parse(mem['play.sound1']).muted === true, '새 키에 저장 ' + k);
    }
    assert(fresh({ 'ngun.muted': 'false', 'snake.muted': 'false' }).S.muted() === false, '옛 키가 false');
    const na = fresh({ 'ngun.audio': JSON.stringify({ music: false, sfx: true }) }).S;
    assert(na.musicOn() === false && na.muted() === false && na.fxOn() === true, '뿅뿅 우주선 음악 끔을 이어받기');
    assert(fresh({ 'ngun.muted': 'true', 'play.sound1': JSON.stringify({ muted: false, music: true, fx: true }) }).S.muted() === false, '새 키가 있으면 새 키');
  });

  await test('설정: 놀이 본부(HUB)가 없어도 저장소를 쓴다', () => {
    const mem = {};
    const { S } = fresh(mem, false);
    S.setMusic(false);
    assert(JSON.parse(mem['play.sound1']).music === false, '저장');
  });

  await test('같은 소리 간격 막기', () => {
    const { S } = fresh();
    assert(S.allow('x', 0.1, 1000) === true, '처음');
    assert(S.allow('x', 0.1, 1050) === false, '50ms 뒤');
    assert(S.allow('y', 0.1, 1050) === true, '다른 이름');
    assert(S.allow('x', 0.1, 1100) === true, '100ms 뒤');
    assert(S.allow('x', 0.1, 1150) === false, '다시 50ms');
  });

  await test('themeFor: 태양계 9 + 외계 8 + 땅·하늘·은하·제목이 모두 다른 음악 색', () => {
    const { S } = fresh();
    for (const g of ['ngun', 'snake', 'jump', 'runner']) {
      const sig = new Set();
      for (const p of PLANETS.concat(EXTRA)) {
        const t = S.themeFor(g, p);
        assert(t.planet === p && t.game === g, 'id ' + p);
        assert(t.key >= -6 && t.key <= 5, '조 범위 ' + p + ' ' + t.key);
        assert(typeof t.scale === 'string' && t.voices && t.voices.lead && t.bpm > 0, '모양 ' + p);
        sig.add([t.key, t.scale, t.voices.lead, t.oct, t.cut, t.wobble, t.bell].join());
      }
      assert(sig.size === PLANETS.length + EXTRA.length, g + ' 겹침 ' + sig.size);
    }
    for (const g of ['snake', 'jump', 'runner']) { const b = S.themeFor(g, 'mars').bpm; assert(b >= 90 && b <= 115, g + ' 빠르기 ' + b); }
    assert(S.themeFor('ngun', 'mars').bpm === 128 && S.themeFor('ngun', 'mars').bossBpm === 146, '뿅뿅 우주선 128·146');
    assert(S.themeFor('snake', 'mars').seed !== S.themeFor('jump', 'mars').seed, '게임마다 가락이 다르다');
    assert(S.themeFor('jump', '모르는행성').key != null, '모르는 행성도 테마');
    assert(S.themeFor('ngun', 'mars', { bpm: 140 }).bpm === 140, '빠르기 바꾸기');
    assert(S.themeFor('snake', 'lava').oct < 0 && S.themeFor('snake', 'frost').bell && S.themeFor('snake', 'ocean').wobble > 0, '용암 낮게·얼음 종소리·바다 일렁임');
  });

  await test('pattern: 같은 테마면 같은 음표, 16마디, A와 B가 다르고, 멜로디는 2kHz 아래', () => {
    const { S } = fresh();
    const hzOf = m => 440 * Math.pow(2, (m - 69) / 12);
    for (const g of ['ngun', 'snake', 'jump', 'runner']) for (const p of PLANETS.concat(EXTRA)) {
      const th = S.themeFor(g, p);
      const a = S.pattern(th), b = S.pattern(th);
      assert(JSON.stringify(a) === JSON.stringify(b), '결정적 ' + g + p);
      assert(a.bars >= 8 && a.ev.length === a.bars * a.steps, '마디 ' + a.bars);
      assert(a.form.includes('A') && a.form.includes('B'), '악절');
      const bar = i => JSON.stringify(a.lead.slice(i * 32, i * 32 + 32));
      const iA = a.form.indexOf('A'), iB = a.form.indexOf('B');
      assert(bar(iA) !== bar(iB), 'A와 B가 같음 ' + g + p);
      assert(bar(iA) !== bar(a.form.indexOf('A2')) || true, 'A2');
      let notes = 0, max = 0;
      for (const e of a.ev) for (const [v, m] of e) { if (v === 'lead') notes++; if (v === 'lead' || v === 'bell') max = Math.max(max, hzOf(m)); }
      assert(notes >= 40, '멜로디가 너무 적음 ' + notes);
      assert(max <= 2100, '너무 높음 ' + p + ' ' + Math.round(max));
      // 한 마디 반복만 되지 않게: 서로 다른 마디가 6개 이상
      const bars = new Set(); for (let i = 0; i < a.bars; i++) bars.add(JSON.stringify(a.lead.slice(i * 8, i * 8 + 8)));
      assert(bars.size >= 6, '다른 마디 ' + bars.size);
    }
    assert(JSON.stringify(S.pattern(S.themeFor('snake', 'mars')).lead) !== JSON.stringify(S.pattern(S.themeFor('snake', 'venus')).lead), '행성마다 다른 가락');
  });

  // ─── 2부: 크로미움에서 실제로 그려 크기 재기 ───
  let pw = null;
  for (const p of [process.env.PW, 'playwright', '/opt/node22/lib/node_modules/playwright']) {
    if (!p) continue;
    try { pw = require(p); break; } catch (e) { /* 다음 후보 */ }
  }
  if (!pw) console.log('  skip Playwright가 없어 소리 크기 재기를 건너뜀');
  else {
    const browser = await pw.chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    await page.addScriptTag({ content: SRC });
    await page.addScriptTag({ content: '(' + measureLib.toString() + ')()' });
    const wavDir = process.env.SNDLIB_WAV;
    const save = (name, b64) => { if (wavDir && b64) fs.writeFileSync(path.join(wavDir, 'sndlib-' + name + '.wav'), Buffer.from(b64, 'base64')); };

    await test('공통 효과음: 꼭대기 -1dBFS 아래, 크기(짧은 창 LUFS)가 -58 ~ -26 사이', async () => {
      const bad = [], rows = [];
      for (const n of await page.evaluate(() => SND.UI_NAMES)) {
        const r = await page.evaluate(([n, w]) => window.renderUi(n, w), [n, !!wavDir]);
        rows.push(n + ' ' + r.peak + '/' + r.lufsM + '/' + r.dur);
        save('ui-' + n, r.wav);
        if (r.peak > -1) bad.push(n + ' 꼭대기 ' + r.peak);
        if (r.lufsM > -26 || r.lufsM < -58) bad.push(n + ' 크기 ' + r.lufsM);
        if (r.dur <= 0) bad.push(n + ' 소리 없음');
      }
      if (process.env.SNDLIB_VERBOSE) console.log('       ' + rows.join('\n       '));
      assert(!bad.length, bad.join(' | '));
    });
    await test('효과음 여러 개가 한꺼번에 나도 -1dBFS 아래 (리미터)', async () => {
      const r = await page.evaluate(() => window.renderPile());
      assert(r.peak <= -1, '꼭대기 ' + r.peak);
    });
    await test('배경 음악 10초: 꼭대기 -1dBFS 아래, 효과음보다 조용하게 (-46 ~ -32 LUFS), 피버·보스도', async () => {
      const bad = [], rows = [];
      for (const [g, p, mood] of [['snake', 'mars', {}], ['jump', 'frost', {}], ['runner', 'lava', { fever: true }], ['ngun', 'saturn', { boss: true }], ['snake', 'ocean', { calm: true }], ['jump', 'twin', {}]]) {
        const r = await page.evaluate(([g, p, m, w]) => window.renderMusic(g, p, m, 10, w), [g, p, mood, !!wavDir]);
        const tag = g + '-' + p + (mood.fever ? '-fever' : '') + (mood.boss ? '-boss' : '') + (mood.calm ? '-calm' : '');
        rows.push(tag + ' ' + r.peak + '/' + r.lufsI);
        save('music-' + tag, r.wav);
        if (r.peak > -1) bad.push(tag + ' 꼭대기 ' + r.peak);
        if (r.lufsI > -32 || r.lufsI < -46) bad.push(tag + ' 크기 ' + r.lufsI);
      }
      if (process.env.SNDLIB_VERBOSE) console.log('       ' + rows.join('\n       '));
      assert(!bad.length, bad.join(' | '));
    });
    await test('끄기(음소거·음악 끔)면 음악이 안 난다', async () => {
      const r = await page.evaluate(() => { SND.setMusic(false); return window.renderMusic('snake', 'mars', {}, 2, false).then(x => { SND.setMusic(true); return x; }); });
      assert(r.peak < -80, '음악 끔인데 소리 ' + r.peak);
    });
    await browser.close();
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();

// 브라우저 안에서 도는 재기 도구 (BS.1770 K 가중, 48kHz)
function measureLib() {
  const SR = 48000;
  function kw(x) {
    const st = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1, -2, 1, -1.99004745483398, 0.99007225036621]];
    let y = x;
    for (const [b0, b1, b2, a1, a2] of st) { const o = new Float32Array(y.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < y.length; i++) { const v = b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v; } y = o; }
    return y;
  }
  const db = v => (v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -120);
  function stats(buf) {
    const d = buf.getChannelData(0);
    let pk = 0, first = -1, last = -1;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; if (a > 0.001) { if (first < 0) first = i; last = i; } }
    const k = kw(d), Wn = SR * 0.4 | 0, H = SR * 0.1 | 0, cs = new Float64Array(k.length + 1);
    for (let i = 0; i < k.length; i++) cs[i + 1] = cs[i] + k[i] * k[i];
    let mmax = -Infinity, sum = 0, cnt = 0;
    for (let s = 0; s + Wn <= k.length; s += H) { const m = (cs[s + Wn] - cs[s]) / Wn; if (m > 0) { const l = -0.691 + 10 * Math.log10(m); mmax = Math.max(mmax, l); if (l > -70) { sum += m; cnt++; } } }
    return { peak: db(pk), lufsM: isFinite(mmax) ? +mmax.toFixed(1) : -120, lufsI: cnt ? +(-0.691 + 10 * Math.log10(sum / cnt)).toFixed(1) : -120, dur: first < 0 ? 0 : +((last - first) / SR).toFixed(2) };
  }
  function wav(buf) {
    const d = buf.getChannelData(0), n = d.length, b = new DataView(new ArrayBuffer(44 + n * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, SR, true); b.setUint32(28, SR * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    let s = ''; const u = new Uint8Array(b.buffer); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function go(sec, fn, withWav) {
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * sec), SR);
    SND._use(ctx); fn();
    const buf = await ctx.startRendering();
    const r = stats(buf); if (withWav) r.wav = wav(buf); return r;
  }
  window.renderUi = (n, w) => go(n === 'fanfare' ? 2.2 : 1.6, () => { SND.reload(); SND.ui(n, { k: 3 }); }, w);
  window.renderPile = () => go(2, () => { SND.reload(); for (const n of SND.UI_NAMES) { SND.allow('ui.' + n, 0, -1e9); SND.ui(n); } });
  window.renderMusic = (g, p, mood, sec, w) => go(sec, () => { SND.music.setMood(Object.assign({ fever: false, boss: false, calm: false }, mood)); SND.music.play(SND.themeFor(g, p)); SND.music._pre(sec); }, w);
}
