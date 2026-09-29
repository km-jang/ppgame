'use strict';
// 공통 소리: 네 게임과 첫 화면이 함께 쓰는 소리 장치 (2026-09-27, 소유자 승인: 합성음만, 0KB, 공통 효과음, 공통 끄기, 배경 음악).
// 일반 <script>로 hub.js·worlds.js 다음에 불러온다. AudioContext가 없으면(node 테스트, 옛 브라우저) 모든 함수가 조용히 아무것도 안 한다.
//
// 연결 (게임 audio.js)
//   SND.onReady(c => {...})  AudioContext가 처음 생기면 한 번 부른다(이미 있으면 바로). 여기서 게임 master를 만들고 SND.out()에 잇는다
//   SND.ctx()                AudioContext 하나 (없으면 만든다, 없는 환경이면 null)
//   SND.out()                효과 버스 입력(GainNode). 게임 master.connect(SND.out()). 게임은 제 compressor를 두지 않는다
//   SND.fx / SND.music.bus   효과 버스 · 음악 버스 GainNode (ctx 전에는 null)
//   SND.unlock()             손가락·키 입력에서 부른다. 자동으로도 pointerup·touchend·click·keydown(capture)에서 부른다
//   SND.run(fn, key)         fn(t)를 소리가 날 수 있을 때 부른다. 아직 잠겨 있으면 0.5초까지 기다렸다 틀고, 그보다 늦으면 버린다.
//                            key를 주면 기다리는 동안 같은 key는 하나만 (잠금 풀릴 때 한꺼번에 쏟아지지 않게)
//   SND.ready()              지금 바로 소리가 나는가
//   SND.allow(name, gapSec)  같은 이름이 gapSec 안에 또 오면 false (연속 재생 막기)
// 설정 (네 게임·첫 화면 공통, 키 play.sound1 = { muted, music, fx }. 옛 ngun.muted 등이 켜져 있었으면 처음엔 끔으로,
//      옛 ngun.audio.music이 false면 음악 끔으로 시작)
//   SND.muted() / setMuted(b) / toggleMuted()   SND.musicOn() / setMusic(b)   SND.fxOn() / setFx(b)
//   SND.onChange(fn)  바뀌면 fn({muted, music, fx}). 다른 탭·다른 게임 페이지에서 바꿔도(storage 이벤트) 불린다
// 소리 크기 상한 (보호자 화면, 2026-09-28): play.parent.volMax(0.25~1, 기본 1)를 처음과 저장 알림 때 읽어 마지막 master 크기에 곱한다.
//   SND.cap() 지금 상한 · SND.setCap(x) 바로 바꾸기(저장은 PROFILE.setVolMax가 한다). 네 게임과 첫 화면이 모두 여기를 지나므로 전부 줄어든다
// 공통 효과음: SND.ui(name, opt)
//   tap open close start coin buy deny claim medal sticker star({k: 0~7 한 계단씩 높게}) tick({hi}) continueAsk continueGo fanfare over overSoft
// 배경 음악
//   SND.themeFor(game, planetId)  game: ngun·snake·jump·runner·bridge, planetId: mercury~pluto, frost·lava·ocean·glass·gem·twin·shroom·rogue,
//                                  ground·sky·galaxy·title. 옵션 {bpm, bossBpm}로 빠르기를 바꿀 수 있다 (뿅뿅 우주선 128·146)
//   SND.music.play(theme) 또는 play(game, planetId)   같은 테마면 그대로, 다르면 1초 동안 겹쳐 바꾼다
//   SND.music.setMood({planet, fever, boss, calm})    planet이 바뀌면 같은 게임의 그 행성 음악으로, boss는 단조·힘차게, fever는 1.12배 빠르게 + 반짝이
//   SND.music.stop(sec) · SND.music.duck(0~1, 멈춤 화면에서 작게)
//   SND.pattern(theme)  음표 목록(순수 함수, 테스트용): 16마디, A A2 B A3
// 소리 크기 기준: 판 중 전체가 약 -26 ~ -28 LUFS. 효과 한 개는 -30 ~ -50 LUFS(짧은 창 기준), 음악은 효과보다 약 10dB 아래.
// 마지막에 리미터(-4dB, 20:1)가 있어 겹쳐도 찢어지지 않지만, 게임 소리는 리미터에 기대지 말고 원래 크기를 맞춘다.
var SND = (typeof SND !== 'undefined' && SND) || {};
(function (S) {
  const KEY = 'play.sound1', PKEY = 'play.parent', OLD = ['ngun.muted', 'snake.muted', 'jump.muted', 'runner.muted'];
  const W = typeof window !== 'undefined' ? window : null, D = typeof document !== 'undefined' ? document : null;
  const AC = W && (W.AudioContext || W.webkitAudioContext);
  const LV = { fx: 1, music: 0.45, ui: 0.45 }, XF = 1, LOOK = 0.1;
  const own = {
    get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
  };
  const store = () => (typeof HUB !== 'undefined' && HUB && HUB.store) || S.store || own;
  const ms = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const safe = (f, a) => { try { f(a); } catch (e) { /* 소리 때문에 게임이 멈추면 안 된다 */ } };
  const quiet = p => { try { p && p.catch && p.catch(() => {}); } catch (e) { /* 무시 */ } };

  // ─── 설정 ───
  let cfgv = null;
  const subs = [];
  function load() {
    const st = store();
    let v = st.get(KEY, null);
    if (!v || typeof v !== 'object') {
      const was = OLD.some(k => { const o = st.get(k, false); return o === true || o === 'true' || o === 1 || o === '1'; });
      const na = st.get('ngun.audio', null); // 뿅뿅 우주선에서 음악만 꺼 두었으면 음악 끔으로
      v = { muted: was, music: !(na && na.music === false), fx: true };
      st.set(KEY, v);
    }
    return { muted: !!v.muted, music: v.music !== false, fx: v.fx !== false };
  }
  const cfg = () => cfgv || (cfgv = load());
  // 소리 크기 상한 (보호자 화면)
  const capOf = x => { const n = Number(x); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1; };
  function readCap() { const p = store().get(PKEY, null); return p && typeof p === 'object' && p.volMax != null ? capOf(p.volMax) : 1; }
  let capv = null;
  const capNow = () => (capv == null ? (capv = readCap()) : capv);
  S.cap = () => capNow();
  S.setCap = x => { capv = capOf(x); apply(); return capv; };
  S.masterTarget = () => (cfg().muted ? 0 : capNow());
  function fire() { const s = Object.assign({}, cfg()); for (const f of subs.slice()) safe(f, s); }
  function put(k, b) { const s = cfg(); b = !!b; if (s[k] === b) return; s[k] = b; store().set(KEY, s); apply(); fire(); }
  S.KEY = KEY;
  S.muted = () => cfg().muted; S.setMuted = b => put('muted', b); S.toggleMuted = () => put('muted', !cfg().muted);
  S.musicOn = () => cfg().music; S.setMusic = b => put('music', b);
  S.fxOn = () => cfg().fx; S.setFx = b => put('fx', b);
  S.onChange = fn => { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; };
  S.reload = () => { cfgv = null; capv = null; apply(); fire(); };

  // ─── 소리 판 ───
  let c = null, master = null, fxBus = null, uiBus = null, musBus = null, noiseBuf = null, ever = false, hidden = false, force = false, blip = false, duckV = 1;
  const readyFns = [], q = [];
  S.fx = null;
  const running = () => !!c && (force || c.state === 'running');
  function build(x) {
    c = x;
    master = c.createGain();
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    master.connect(lim); lim.connect(c.destination);
    fxBus = c.createGain(); musBus = c.createGain();
    fxBus.connect(master); musBus.connect(master);
    uiBus = c.createGain(); uiBus.gain.value = LV.ui; uiBus.connect(fxBus);
    const s = cfg();
    master.gain.value = s.muted ? 0 : capNow(); fxBus.gain.value = s.fx ? LV.fx : 0; musBus.gain.value = s.music ? LV.music : 0;
    S.fx = fxBus; S.music.bus = musBus;
    const on = () => { if (c.state === 'running') { ever = true; flush(); if (M.want && !M.layers.length) start(M.want); tick(); } };
    if (c.addEventListener) c.addEventListener('statechange', on); else c.onstatechange = on;
    for (const f of readyFns.splice(0)) safe(f, c);
  }
  S.ctx = () => {
    if (!c && AC) { let x = null; try { x = new AC({ latencyHint: 'interactive' }); } catch (e) { try { x = new AC(); } catch (e2) { x = null; } } if (x) { try { build(x); } catch (e) { c = null; } } }
    return c;
  };
  S.out = () => (S.ctx(), fxBus);
  S.ready = running;
  S.onReady = fn => { if (c) safe(fn, c); else readyFns.push(fn); };
  S.unlock = () => {
    const x = S.ctx();
    if (!x || hidden || force) return;
    if (x.state !== 'running') { try { quiet(x.resume()); } catch (e) { /* 무시 */ } }
    if (!blip) { blip = true; try { const b = x.createBufferSource(); b.buffer = x.createBuffer(1, 1, 22050); b.connect(x.destination); b.start(0); } catch (e) { /* 무시 */ } }
  };
  function flush() { const now = ms(); for (const [at, fn] of q.splice(0)) if (now - at <= 500) safe(fn, c.currentTime + 0.01); }
  S.run = (fn, key) => {
    if (!AC && !force) return false;
    if (running()) { safe(fn, c.currentTime + 0.005); return true; }
    if (q.length < 24 && !(key && q.some(x => x[2] === key))) q.push([ms(), fn, key]);
    return true;
  };
  function ramp(p, v) { const t = c.currentTime; try { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(v, t + 0.08); } catch (e) { p.value = v; } }
  function apply() {
    if (!c) return;
    const s = cfg();
    ramp(master.gain, s.muted ? 0 : capNow()); ramp(fxBus.gain, s.fx ? LV.fx : 0); ramp(musBus.gain, s.music ? LV.music * duckV : 0);
  }
  // 테스트: OfflineAudioContext에 판을 새로 깐다 (늘 '돌아가는 중'으로 본다)
  S._master = () => master;
  S._use = x => { c = null; M.layers = []; M.want = null; M.cur = null; noiseBuf = null; force = true; ever = true; build(x); };

  // 손가락·키·화면 가림
  if (W && W.addEventListener) {
    const g = e => { if (e && e.type === 'pointerdown' && e.pointerType !== 'mouse') return; if (!c || c.state !== 'running') S.unlock(); };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) W.addEventListener(ev, g, { capture: true, passive: true });
    const hide = () => { hidden = true; if (c && !force && c.state === 'running') { try { quiet(c.suspend()); } catch (e) { /* 무시 */ } } };
    const show = () => { hidden = false; if (c && ever && !force && c.state !== 'running') { try { quiet(c.resume()); } catch (e) { /* 무시 */ } } };
    if (D) D.addEventListener('visibilitychange', () => (D.visibilityState === 'hidden' ? hide() : show()));
    W.addEventListener('pagehide', hide);
    W.addEventListener('pageshow', () => { S.reload(); if (!D || D.visibilityState !== 'hidden') show(); });
    W.addEventListener('storage', e => { if (!e.key || e.key === KEY) S.reload(); else if (e.key === PKEY) { capv = null; apply(); } });
  }

  // ─── 합성 도구 ───
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function tone(t, type, f0, f1, dur, vol, att, dst) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.9);
    att = att || 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst || uiBus); o.start(t); o.stop(t + dur + 0.03);
    return o;
  }
  // 종소리: 사인 기본음(2kHz 아래) + 아주 작은 배음
  function bell(t, f, dur, vol, dst) { tone(t, 'sine', f, f, dur, vol, 0.004, dst); tone(t, 'sine', f * 2, f * 2, dur * 0.5, vol * 0.22, 0.004, dst); tone(t, 'sine', f * 3, f * 3, dur * 0.3, vol * 0.07, 0.004, dst); }
  function hush(t, type, f0, f1, dur, vol, q1, dst) {
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); let r = 7; for (let i = 0; i < d.length; i++) { r = (r * 16807) % 2147483647; d[i] = r / 1073741823.5 - 1; } }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = type; f.Q.value = q1 || 1;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dst || uiBus); s.start(t); s.stop(t + dur + 0.02);
  }
  const arp = (t, type, notes, step, dur, vol) => notes.forEach((m, i) => tone(t + i * step, type, hz(m), hz(m), dur, vol, 0.008));

  // ─── 공통 효과음 [최소 간격(초), 그리기] ───
  const UI = {
    tap: [0.05, t => { tone(t, 'sine', 784, 587, 0.07, 0.25, 0.003); tone(t, 'triangle', 392, 392, 0.05, 0.12); }],
    open: [0.12, t => arp(t, 'triangle', [72, 79], 0.06, 0.16, 0.1)],
    close: [0.12, t => arp(t, 'triangle', [79, 72], 0.06, 0.16, 0.08)],
    start: [0.2, t => { arp(t, 'triangle', [67, 72, 79], 0.07, 0.18, 0.1); bell(t + 0.21, hz(84), 0.3, 0.05); }],
    coin: [0.045, t => bell(t, hz(88), 0.09, 0.09)],
    buy: [0.15, t => { arp(t, 'triangle', [72, 76, 79], 0.05, 0.14, 0.1); bell(t + 0.15, hz(84), 0.35, 0.07); }],
    deny: [0.3, t => { tone(t, 'sine', 220, 150, 0.2, 0.2, 0.004); tone(t, 'triangle', 294, 208, 0.13, 0.05); }],
    claim: [0.25, t => { arp(t, 'triangle', [67, 72, 76, 79], 0.06, 0.18, 0.1); bell(t + 0.26, hz(84), 0.5, 0.09); }],
    medal: [0.4, t => {
      arp(t, 'triangle', [72, 76, 79, 84], 0.07, 0.3, 0.12);
      for (const m of [60, 64, 67]) tone(t + 0.28, 'sine', hz(m), hz(m), 0.7, 0.07, 0.03);
      bell(t + 0.3, hz(91), 0.7, 0.06);
    }],
    sticker: [0.25, t => { tone(t, 'sine', hz(72), hz(84), 0.12, 0.12, 0.004); bell(t + 0.1, hz(88), 0.35, 0.07); bell(t + 0.2, hz(91), 0.4, 0.05); }],
    star: [0.06, (t, o) => { const k = Math.min(7, Math.max(0, (o && o.k) | 0)); bell(t, hz(79 + k), 0.25, 0.11); bell(t + 0.05, hz(86 + k), 0.2, 0.05); }],
    tick: [0.25, (t, o) => tone(t, 'sine', o && o.hi ? hz(91) : hz(84), 0, 0.06, 0.16, 0.003)],
    continueAsk: [0.6, t => { arp(t, 'triangle', [72, 76, 79], 0.12, 0.25, 0.09); tone(t + 0.38, 'triangle', hz(81), hz(83), 0.5, 0.1, 0.02); bell(t + 0.4, hz(88), 0.4, 0.03); }],
    continueGo: [0.6, t => {
      hush(t, 'bandpass', 300, 1800, 0.5, 0.12, 1.2);
      tone(t, 'triangle', hz(67), hz(91), 0.45, 0.09, 0.02);
      [84, 88, 91].forEach((m, i) => bell(t + 0.35 + i * 0.1, hz(m), 0.5, 0.07 - i * 0.015));
    }],
    fanfare: [1.5, t => {
      for (const [d, m, l] of [[0, 72, 0.12], [0.12, 72, 0.12], [0.24, 72, 0.12], [0.4, 79, 0.3], [0.72, 76, 0.14], [0.88, 84, 0.62]]) tone(t + d, 'triangle', hz(m), hz(m), l + 0.05, 0.12, 0.008);
      for (const [d, m, l] of [[0, 48, 0.35], [0.4, 55, 0.3], [0.88, 48, 0.6]]) tone(t + d, 'sine', hz(m), hz(m), l, 0.16, 0.01);
      for (const m of [64, 67, 72]) tone(t + 0.88, 'sine', hz(m), hz(m), 0.6, 0.05, 0.03);
      bell(t + 0.9, hz(91), 0.6, 0.05);
    }],
    over: [0.8, t => { tone(t, 'sine', 523, 196, 0.6, 0.15, 0.01); tone(t, 'triangle', 262, 98, 0.6, 0.06, 0.01); tone(t + 0.5, 'sine', 131, 131, 0.35, 0.1, 0.01); }],
    overSoft: [0.8, t => { arp(t, 'triangle', [76, 72], 0.18, 0.35, 0.07); tone(t + 0.18, 'sine', hz(60), hz(60), 0.4, 0.05, 0.01); }],
  };
  const lastAt = {};
  S.allow = (name, gap, now) => { now = now == null ? ms() : now; const l = lastAt[name]; if (l != null && now - l < gap * 1000) return false; lastAt[name] = now; return true; };
  S.UI_NAMES = Object.keys(UI);
  S.ui = (name, o) => {
    const u = UI[name];
    if (!u || (!AC && !force)) return false;
    const s = cfg(); if (s.muted || !s.fx) return false;
    if (!S.allow('ui.' + name, u[0])) return false;
    return S.run(t => u[1](t, o), name);
  };

  // ─── 배경 음악: 테마 ───
  const SC = { P: [0, 2, 4, 7, 9], m: [0, 3, 5, 7, 10], M: [0, 2, 4, 5, 7, 9, 11], n: [0, 2, 3, 5, 7, 8, 10], D: [0, 2, 3, 5, 7, 9, 10], L: [0, 2, 4, 6, 7, 9, 11], X: [0, 2, 4, 5, 7, 9, 10], S: [0, 1, 4, 5, 7, 8, 10] };
  const SCN = { P: 'major pentatonic', m: 'minor pentatonic', M: 'major', n: 'minor', D: 'dorian', L: 'lydian', X: 'mixolydian', S: 'desert' };
  const MINOR = { P: 'm', M: 'n', L: 'D', X: 'D', D: 'n', m: 'm', n: 'n', S: 'S' };
  // 행성 색: [조(반음), 음계, 멜로디 파형 t·s, 옥타브, 밝기(저역 통과 Hz), 일렁임(센트), 종소리]
  const PL = {
    title: [0, 'P', 't', 0, 2200, 0, 0], ground: [0, 'M', 't', 0, 2000, 0, 0], sky: [7, 'P', 's', 0, 2600, 0, 1], galaxy: [1, 'L', 's', 0, 2400, 4, 1],
    mercury: [2, 'P', 't', 0, 2400, 0, 0], venus: [5, 'L', 't', 0, 1800, 6, 0], earth: [4, 'M', 't', 0, 2200, 0, 0], mars: [9, 'D', 't', 0, 1600, 0, 0],
    jupiter: [-5, 'X', 's', 0, 1800, 0, 0], saturn: [3, 'P', 's', 0, 2600, 0, 1], uranus: [6, 'L', 's', 0, 2600, 3, 1], neptune: [1, 'm', 's', 0, 1800, 8, 0],
    pluto: [4, 'm', 't', 0, 1600, 0, 1], frost: [7, 'P', 't', 1, 3000, 0, 1], lava: [-7, 'm', 't', -1, 1200, 0, 0], ocean: [5, 'P', 's', 0, 1600, 10, 0],
    glass: [8, 'L', 's', 1, 2800, 0, 1], gem: [10, 'P', 't', 1, 2800, 0, 1], twin: [2, 'S', 't', 0, 2000, 0, 0], shroom: [3, 'D', 's', 0, 1800, 6, 0],
    rogue: [-3, 'n', 's', 0, 1400, 4, 0],
  };
  PL.space = PL.galaxy;
  const GM = { ngun: [128, 146, 2], snake: [98, 106, 0], jump: [106, 114, 1], runner: [112, 120, 1], bridge: [92, 100, 0] };
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  S.themeFor = (game, planet, o) => {
    const gm = GM[game] || [104, 112, 1], id = String(planet || 'title'), h = hash(id);
    const p = PL[id] || [(h % 12) - 6, 'PmDLX'[h % 5], h & 1 ? 't' : 's', 0, 2000, 0, (h >> 3) & 1];
    const k = ((p[0] % 12) + 18) % 12 - 6;
    return Object.assign({
      id: (game || '') + '.' + id, game: game || '', planet: id, bpm: gm[0], bossBpm: gm[1], drive: gm[2], key: k, scale: SCN[p[1]], sc: p[1],
      voices: { lead: p[2] === 't' ? 'triangle' : 'sine', pad: 'sine', bass: 'triangle' }, oct: p[3], cut: p[4], wobble: p[5], bell: !!p[6], seed: hash(game + '/' + id),
    }, o || {});
  };
  function bossify(th) { const sc = MINOR[th.sc] || 'm'; return Object.assign({}, th, { id: th.id + '!', sc, scale: SCN[sc], bpm: th.bossBpm || Math.round(th.bpm * 1.08), drive: (th.drive || 0) + 1, boss: true }); }

  // ─── 배경 음악: 음표 만들기 (순수 함수) ───
  // 8분음표 칸, 한 마디 8칸, 4마디 악절 넷: A · A2(끝만 다르게) · B(새 동기, 조금 높게, 다른 화성) · A3(A에 종소리 메아리). 모두 16마디
  const PROG = { maj: { A: [[0, 9, 5, 7], [0, 5, 0, 7], [0, 7, 9, 5]], B: [[5, 7, 4, 9], [9, 5, 0, 7], [5, 0, 7, 7]] },
                 min: { A: [[0, 8, 3, 10], [0, 5, 8, 7], [0, 10, 8, 10]], B: [[8, 10, 0, 0], [5, 8, 10, 7], [3, 10, 5, 7]] } };
  function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  S.pattern = th => {
    const r = rng(th.seed || hash(th.id || 'x')), code = th.sc || 'P', sc = SC[code] || SC.P;
    const minor = sc[2] === 3 || code === 'S' || code === 'D';
    const parent = sc.length === 7 ? sc : (minor ? SC.n : SC.M);
    const pc = x => ((x % 12) + 12) % 12;
    const inP = x => parent.includes(pc(x));
    const pick = a => a[Math.floor(r() * a.length)];
    const pg = PROG[minor ? 'min' : 'maj'], progA = pick(pg.A), progB = pick(pg.B);
    const k = th.key || 0, leadBase = 60 + k + 12 * (th.oct || 0), bassBase = 45 + k, padBase = 57 + k;
    const n = sc.length, deg = d => leadBase + 12 * Math.floor(d / n) + sc[((d % n) + n) % n];
    const chordOf = root => { const r0 = [root, root - 1, root + 1, root - 2, root + 2].find(x => inP(x) && inP(x + 7)); root = r0 == null ? root : r0; return [root, root + (inP(root + 4) ? 4 : 3), root + 7]; };
    // 2마디 동기: 첫 칸은 늘 소리, 센박이 여린박보다 자주
    const motif = () => { const m = []; for (let s = 0; s < 16; s++) if (s === 0 || r() < (s % 2 ? 0.3 : 0.65)) m.push([s, pick([-2, -1, -1, 0, 1, 1, 2])]); return m; };
    const mA = motif(), mB = motif(), endA = motif(), endA2 = motif();
    const LEN = 128, ev = Array.from({ length: LEN }, () => []), chords = [], lead = new Array(LEN).fill(null);
    const form = [['A', progA, mA, endA, 0], ['A2', progA, mA, endA2, 0], ['B', progB, mB, motif(), 2], ['A3', progA, mA, motif(), 0]];
    form.forEach(([name, prog, m1, m2, lift], sec) => {
      let d = n + lift;
      for (let b = 0; b < 4; b++) {
        const bar = sec * 4 + b, ch = chordOf(prog[b]).map(x => pc(x)), s0 = bar * 8;
        chords.push(ch);
        ev[s0].push(['pad', padBase + ch[0], 8, 1], ['pad', padBase + ch[0] + (ch[1] - ch[0] + 12) % 12, 8, 0.8], ['pad', padBase + ch[0] + 7, 8, 0.7]);
        ev[s0].push(['bass', bassBase + ch[0], 3, 1]);
        ev[s0 + 4].push(['bass', bassBase + ch[0] + (b % 2 ? 7 : 12), 3, 0.8]);
        const mo = b < 2 ? m1 : m2, half = (b % 2) * 8;
        const notes = mo.filter(x => x[0] >= half && x[0] < half + 8);
        notes.forEach(([s, step], i) => {
          d += step; d = Math.max(n - 3, Math.min(2 * n, d));
          if (s === half) { // 마디 첫 음은 화음 음으로
            let best = d, bd = 99;
            for (let e = d - 2; e <= d + 2; e++) { const x = pc(deg(e) - k); if (ch.includes(x) && Math.abs(e - d) < bd) { bd = Math.abs(e - d); best = e; } }
            d = best;
          }
          const next = i + 1 < notes.length ? notes[i + 1][0] : half + 8, last = b === 3 && i === notes.length - 1;
          let midi = deg(d);
          if (last) { let e = d; for (let j = 0; j < n; j++) if (pc(deg(d - j) - k) === (name === 'A' ? ch[1] : ch[0])) { e = d - j; break; } midi = deg(e); }
          ev[s0 + s - half].push(['lead', midi, last ? 8 - (s - half) : Math.min(3, next - s), s === half ? 1 : 0.8]);
          lead[s0 + s - half] = midi;
          if ((name === 'A3' || th.bell) && s % 4 === 2 && r() < 0.5) ev[s0 + s - half].push(['bell', midi + (midi < 72 ? 12 : 0), 2, 0.6]);
        });
      }
    });
    return { bars: 16, steps: 8, form: form.map(f => f[0]), chords, ev, lead };
  };

  // ─── 배경 음악: 순서기 (setTimeout 25ms, 0.1초 앞까지 예약, 멈췄다 오면 놓친 칸은 건너뜀) ───
  const M = { layers: [], want: null, cur: null, timer: 0, mood: { planet: null, fever: false, boss: false, calm: false } };
  const pats = {};
  function start(theme) {
    const th = M.mood.boss ? bossify(theme) : theme, t0 = c.currentTime;
    for (const L of M.layers) if (L.end === Infinity) { L.end = t0 + XF; try { L.g.gain.cancelScheduledValues(t0); L.g.gain.setValueAtTime(L.g.gain.value, t0); L.g.gain.linearRampToValueAtTime(0.0001, t0 + XF); } catch (e) { /* 무시 */ } }
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = th.cut || 2000; lp.Q.value = 0.5; lp.connect(g); g.connect(musBus);
    g.gain.setValueAtTime(M.layers.length ? 0.0001 : 1, t0); if (M.layers.length) g.gain.linearRampToValueAtTime(1, t0 + XF);
    const L = { th, pat: pats[th.id + th.seed] || (pats[th.id + th.seed] = S.pattern(th)), g, lp, step: 0, t: t0 + 0.06, end: Infinity };
    M.layers.push(L);
    tick();
  }
  // 일렁임: 음 높이를 천천히 흔든다 (LFO 없이 음마다 시작·끝 값만, 멈춘 소리에 연결이 남지 않게)
  function wob(o, th, t, d) { const w = (th.wobble || 0) * 3; if (!w) return; o.detune.setValueAtTime(w * Math.sin(t * 2.2), t); o.detune.linearRampToValueAtTime(w * Math.sin((t + d) * 2.2), t + d); }
  function stepDur(L) { return 60 / (L.th.bpm * (M.mood.fever ? 1.12 : 1)) / 2; }
  function play(L, i, t, sp) {
    const th = L.th, md = M.mood, calm = md.calm, drive = calm ? 0 : (th.drive || 0) + (md.fever ? 1 : 0);
    for (const [v, m, len, vel] of L.pat.ev[i]) {
      const dur = len * sp, f = hz(m);
      if (v === 'lead') wob(tone(t, th.voices.lead, f, f, dur * 0.95 + 0.05, (calm ? 0.05 : 0.08) * vel, 0.012, L.lp), th, t, dur);
      else if (v === 'pad') wob(tone(t, th.voices.pad, f, f, dur + 0.1, 0.035 * vel, 0.25, L.lp), th, t, dur);
      else if (v === 'bass') tone(t, th.voices.bass, f, f, dur * 0.9, 0.12 * vel, 0.01, L.lp);
      else if (v === 'bell' && !calm) bell(t, f, 0.5, 0.03 * vel, L.g);
    }
    if (drive >= 1 && i % (drive >= 3 ? 2 : 4) === 0) tone(t, 'sine', 110, 48, 0.16, 0.14, 0.003, L.g);
    if (drive >= 2 && i % 2 === 1) hush(t, 'bandpass', 2600, 2600, 0.05, 0.03, 1.5, L.g);
    if (md.fever && !calm) { const ch = L.pat.chords[Math.floor(i / 8) % 16], m = 76 + th.key + ch[(i >> 1) % 3] - (ch[(i >> 1) % 3] > 7 ? 12 : 0); bell(t, hz(m), 0.25, 0.022, L.g); }
  }
  function tick(until) {
    clearTimeout(M.timer); M.timer = 0;
    if (!running()) return;
    const now = c.currentTime, s = cfg(), on = s.music && !s.muted;
    for (const L of M.layers.slice()) {
      if (now > L.end + 0.2) { try { L.g.disconnect(); } catch (e) { /* 무시 */ } M.layers.splice(M.layers.indexOf(L), 1); continue; }
      const sp = stepDur(L), len = L.pat.ev.length;
      if (L.t < now - 0.05) { const miss = Math.ceil((now - L.t) / sp); L.t += miss * sp; L.step += miss; }
      while (L.t < (until || now + LOOK) && L.t < L.end) { if (on) play(L, L.step % len, L.t, sp); L.t += stepDur(L); L.step++; }
    }
    if (M.layers.length && !until) M.timer = setTimeout(() => tick(), 25);
  }
  S.music = {
    bus: null,
    play(theme, planet) {
      if (typeof theme === 'string') theme = S.themeFor(theme, planet || M.mood.planet);
      if (!theme) return;
      if (M.want && M.want.id === theme.id && M.want.bpm === theme.bpm && (M.layers.length || !running())) return;
      M.want = theme; M.cur = theme; M.mood.planet = theme.planet;
      if (running()) start(theme);
    },
    stop(sec) {
      M.want = null;
      if (!c) return;
      const t0 = c.currentTime, f = sec == null ? XF : sec;
      for (const L of M.layers) { L.end = Math.min(L.end, t0 + f); try { L.g.gain.cancelScheduledValues(t0); L.g.gain.setValueAtTime(L.g.gain.value, t0); L.g.gain.linearRampToValueAtTime(0.0001, t0 + Math.max(0.02, f)); } catch (e) { /* 무시 */ } }
    },
    setMood(o) {
      o = o || {};
      const md = M.mood, bossWas = md.boss;
      if ('fever' in o) md.fever = !!o.fever;
      if ('calm' in o) md.calm = !!o.calm;
      if ('boss' in o) md.boss = !!o.boss;
      if (o.planet != null && o.planet !== md.planet && M.cur) { md.planet = o.planet; return S.music.play(S.themeFor(M.cur.game, o.planet, { bpm: M.cur.bpm, bossBpm: M.cur.bossBpm })); }
      if (md.boss !== bossWas && M.want && running()) start(M.want);
    },
    mood: () => Object.assign({}, M.mood),
    playing: () => !!M.want,
    duck(v) { duckV = Math.max(0, Math.min(1, v == null ? 1 : v)); apply(); },
    _pre: sec => { if (running()) tick(c.currentTime + sec); },
  };
})(SND);
