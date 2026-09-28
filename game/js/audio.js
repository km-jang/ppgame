'use strict';
// 소리 (2026-09-27 공통 소리로 옮김, game/PLAN.md "소리" 절).
// 소리 판(AudioContext)·잠금 풀기·끄기 설정·배경 음악·메뉴 효과음은 공통 소리 장치 SND(../common/sound.js)가 맡는다.
// 여기는 뿅뿅 우주선만의 싸움 효과음: WebAudio 합성음이 바탕이고, 진짜 소리 파일(sounds/, Kenney MIT)을 겹쳐 두께를 더한다.
// 파일을 못 받으면 합성음만 난다.
//
// 연결: 게임 master(VOL) → SND.out() (효과 버스 → 공통 리미터). 제 compressor는 두지 않는다.
//       총소리만 따로 shot 버스를 거친다: 경고음이 나는 동안 총소리를 잠깐 줄이기(duckShots) 위해서.
// 크기 기준 (크로미움 OfflineAudioContext로 잼, PLAN.md): 판 중 전체 약 -27 LUFS, 보스·필살기에도 꼭대기 -1dBFS 아래.
//   총소리는 초당 5발 넘게 나므로 가장 작게, 총열이 늘어도 크기는 그대로. 경고음은 총소리 위로 들리게 둥근 소리로.
(function (NG) {
  let ac = null, master = null, shotBus = null, shotLp = null, noiseBuf = null, fxRef = null;
  const last = {}; // 같은 소리 과다 재생 방지 (소리 판 시각 기준)
  let shotK = 0;   // 총소리 음높이 세 가지를 돌아가며

  const VOL = 0.34;

  // ─── 연결 ────────────────────────────────────────────────
  function setup(c) {
    ac = c;
    master = c.createGain();
    master.gain.value = VOL;
    master.connect(SND.out());
    fxRef = SND.fx;
    shotBus = c.createGain(); shotBus.connect(master);
    // 총소리 파일은 밝아서 높은 쪽을 깎는다
    shotLp = c.createBiquadFilter(); shotLp.type = 'lowpass'; shotLp.frequency.value = 3200; shotLp.Q.value = 0.5; shotLp.connect(shotBus);
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    SM.load(c, FILES);
  }
  if (typeof SND !== 'undefined') SND.onReady(setup);
  // 소리 판이 새로 깔렸으면(테스트의 SND._use) 다시 잇는다
  function ensure() {
    if (typeof SND === 'undefined' || !SND.fx) return false;
    if (SND.fx !== fxRef) setup(SND.fx.context);
    return !!ac;
  }

  function unlock() { if (typeof SND !== 'undefined') SND.unlock(); }

  // ─── 합성 부품 ────────────────────────────────────────────
  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(bus, t, type, f0, f1, dur, vol, attack) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, vol, attack || 0.003, dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 필터를 거친 잡음. ftype: highpass/bandpass/lowpass, f0→f1로 필터를 쓸어내린다
  function noise(bus, t, ftype, f0, f1, dur, vol, q) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = ftype; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    env(g, t, vol, 0.002, dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // 경고음이 나는 동안 총소리를 잠깐 줄인다 (depth배로 len초, 0.25초에 걸쳐 돌아옴)
  function duckShots(t, depth, len) {
    const g = shotBus.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(depth, t + 0.03);
      g.setValueAtTime(depth, t + len);
      g.linearRampToValueAtTime(1, t + len + 0.25);
    } catch (e) { /* 무시 */ }
  }
  // 경고음 공통: 둥근 소리(사인·세모파) + 총소리 줄이기
  function warnTone(t, len) { duckShots(t, 0.35, len); }

  // ─── 효과음 ───────────────────────────────────────────────
  // gap: 같은 소리 최소 간격(초). 메뉴·보상·게임 오버·한 번 더! 소리는 SND.ui (공통)
  const B = () => master;
  const SFX = {
    // 총소리: 초당 5발 넘게 나므로 부드럽고 작게. 총열이 늘어도 크기는 그대로(조금 낮아질 뿐), 음높이 세 가지를 돌아가며
    shoot: { gap: 0.055, fn(t, o) {
      const n = Math.min(12, (o && o.n) || 1);
      const pitch = [1, 0.93, 1.07][shotK++ % 3] * (1 - (n - 1) * 0.012);
      noise(shotBus, t, 'bandpass', 1500 * pitch, 450, 0.06, 0.22, 0.7);   // 퓽 (부드러운 파열)
      noise(shotBus, t, 'lowpass', 900, 180, 0.05, 0.16);                  // 몸통
      tone(shotBus, t, 'sine', 150 * pitch, 50, 0.06, 0.2);                // 저음 펀치
      tone(shotBus, t, 'triangle', 700 * pitch, 330, 0.03, 0.03);          // 부드러운 딸깍
    } },
    hit:     { gap: 0.04, fn: t => { noise(B(), t, 'bandpass', 1800, 1200, 0.03, 0.1, 0.9); tone(B(), t, 'triangle', 420, 260, 0.04, 0.07); } },
    kill:    { gap: 0.03, fn: t => {
      noise(B(), t, 'lowpass', 2200, 120, 0.22, 0.5);
      tone(B(), t, 'sine', 120, 40, 0.18, 0.4);
    } },
    hurt:    { gap: 0.10, fn: t => {
      tone(B(), t, 'sawtooth', 180, 50, 0.32, 0.35);
      noise(B(), t, 'lowpass', 900, 100, 0.3, 0.5);
    } },
    dash:    { gap: 0.05, fn: t => { noise(B(), t, 'bandpass', 500, 2600, 0.16, 0.35, 2); } },
    nova:    { gap: 0.10, fn: t => {
      noise(B(), t, 'lowpass', 2600, 60, 0.45, 0.6);
      tone(B(), t, 'sine', 90, 30, 0.4, 0.5);
    } },
    // 필살기: 짧게 빨려 들어가는 소리 뒤에 저음 폭발, 위로 퍼지는 울림 (꼭대기가 넘치지 않게 크기를 줄임)
    ult:     { gap: 0.30, fn: t => {
      tone(B(), t, 'triangle', 220, 1100, 0.12, 0.16);
      noise(B(), t + 0.1, 'lowpass', 3500, 50, 1.2, 0.55);
      tone(B(), t + 0.1, 'sine', 110, 28, 0.9, 0.5);
      [660, 880, 1320].forEach((f, i) => tone(B(), t + 0.12 + i * 0.06, 'sine', f, f * 1.5, 0.4, 0.1));
    } },
    // 필살기 게이지가 가득 참: 올라가는 종소리 네 음
    ultReady:{ gap: 0.50, fn: t => { [784, 988, 1175, 1568].forEach((f, i) => tone(B(), t + i * 0.055, 'triangle', f, f, 0.12, 0.1)); } },
    // 콤보 10·25·50·100을 넘길 때: 짧게 두 번 올라가는 음
    combo:   { gap: 0.20, fn: t => { tone(B(), t, 'triangle', 880, 1175, 0.08, 0.12); tone(B(), t + 0.06, 'triangle', 1175, 1568, 0.1, 0.1); } },
    // 아이템 (2026-09-26). 코인 줍기는 종소리 두 음
    coin:    { gap: 0.04, fn: t => { tone(B(), t, 'sine', 1319, 1319, 0.07, 0.12); tone(B(), t + 0.045, 'sine', 1760, 1760, 0.1, 0.09); } },
    shieldUp:{ gap: 0.10, fn: t => { tone(B(), t, 'triangle', 440, 880, 0.18, 0.2); tone(B(), t + 0.05, 'sine', 1320, 1760, 0.2, 0.08); } },
    // 방패가 한 대를 대신 막음 (world.js): 크고 시원하게 "텅" + 올라가는 울림
    shieldBlock: { gap: 0.10, fn: t => {
      tone(B(), t, 'sine', 180, 90, 0.25, 0.45);
      noise(B(), t, 'bandpass', 1600, 500, 0.2, 0.3, 1.2);
      tone(B(), t + 0.02, 'triangle', 523, 1047, 0.3, 0.16);
      tone(B(), t + 0.1, 'sine', 1047, 1319, 0.35, 0.08);
    } },
    // 헥사 가디언 방패가 내 총알을 막음: 작고 부드러운 톡 (자주 난다)
    hexBlock:{ gap: 0.06, fn: t => { tone(B(), t, 'triangle', 900, 700, 0.05, 0.09); } },
    heat:    { gap: 0.10, fn: t => { tone(B(), t, 'triangle', 200, 800, 0.25, 0.16); noise(B(), t, 'bandpass', 1500, 3000, 0.25, 0.1, 1); } },
    magnet:  { gap: 0.10, fn: t => { tone(B(), t, 'sine', 300, 600, 0.3, 0.2); tone(B(), t + 0.02, 'sine', 303, 606, 0.3, 0.15); } },
    bomb:    { gap: 0.20, fn: t => { noise(B(), t, 'lowpass', 3000, 60, 0.7, 0.7); tone(B(), t, 'sine', 100, 30, 0.6, 0.6); } },
    heal:    { gap: 0.05, fn: t => { tone(B(), t, 'sine', 660, 660, 0.08, 0.25); tone(B(), t + 0.07, 'sine', 990, 990, 0.12, 0.25); } },
    eshoot:  { gap: 0.08, fn: t => { tone(B(), t, 'triangle', 700, 350, 0.08, 0.12); } },
    // 보스 예고(돌진·레이저): 둥근 세모파 "삐-뽀-삐" (옛 1200Hz 네모파 세 번 대신)
    warn:    { gap: 0.3, fn: t => {
      warnTone(t, 0.4);
      [740, 554, 740].forEach((f, i) => { tone(B(), t + i * 0.12, 'triangle', f, f, 0.11, 0.22, 0.01); tone(B(), t + i * 0.12, 'sine', f / 2, f / 2, 0.11, 0.15, 0.01); });
    } },
    laser:   { gap: 0.2, fn: t => { tone(B(), t, 'sawtooth', 120, 60, 0.5, 0.22); noise(B(), t, 'bandpass', 2000, 700, 0.45, 0.28, 1); } },
    // 태양계 여행 (2026-09-27): 운석 예고 휘익 · 운석 쿵 · 돌진이 예고·돌진 · 블랙홀 웨이브 · 새 행성 도착
    meteorWarn: { gap: 0.4, fn: t => {
      warnTone(t, 0.5);
      tone(B(), t, 'sine', 1100, 380, 0.55, 0.18, 0.02); tone(B(), t, 'triangle', 550, 190, 0.55, 0.07, 0.02);
    } },
    meteor:  { gap: 0.12, fn: t => { noise(B(), t, 'lowpass', 1800, 80, 0.35, 0.5); tone(B(), t, 'sine', 90, 35, 0.3, 0.45); } },
    // 돌진이 예고: 낮게 부릉 올라가는 소리 (옛 소리가 가장 묻혀서 가장 많이 키움)
    chargeWarn: { gap: 0.25, fn: t => {
      warnTone(t, 0.35);
      tone(B(), t, 'triangle', 196, 392, 0.24, 0.16, 0.01); tone(B(), t, 'sine', 98, 196, 0.24, 0.14, 0.01);
      tone(B(), t + 0.12, 'sine', 392, 523, 0.14, 0.08, 0.01);
    } },
    charge:  { gap: 0.12, fn: t => { noise(B(), t, 'bandpass', 400, 1800, 0.22, 0.3, 1.5); } },
    hole:    { gap: 1.0, fn: t => { tone(B(), t, 'sine', 70, 40, 1.2, 0.4); tone(B(), t, 'triangle', 300, 120, 1.0, 0.1); tone(B(), t + 0.02, 'triangle', 306, 118, 1.0, 0.08); } },
    planet:  { gap: 1.0, fn: t => { [523, 784, 1047, 1319].forEach((f, i) => tone(B(), t + 0.1 + i * 0.09, 'triangle', f, f, 0.4, 0.12)); } },
    // 행성 적 (2026-09-27): 처음 만남 · 금성 안개 · 인공위성 예고·빛줄기 · 모래 벌레 예고·튀어나옴 · 번개 모으기·번개 · 고리 조각 띠 예고·휙 · 얼음 쪼개짐
    foe:     { gap: 0.8, fn: t => { [659, 880, 1175].forEach((f, i) => tone(B(), t + i * 0.08, 'triangle', f, f * 1.01, 0.14, 0.1)); } },
    mist:    { gap: 0.3, fn: t => { for (let i = 0; i < 3; i++) tone(B(), t + i * 0.07, 'sine', 300 + i * 90, 520 + i * 120, 0.08, 0.08); } },
    // 인공위성 빛줄기 예고: 사인 "뾰롱" 두 번
    beamWarn:{ gap: 0.3, fn: t => {
      warnTone(t, 0.4);
      for (const d of [0, 0.17]) { tone(B(), t + d, 'sine', 880, 1175, 0.14, 0.17, 0.01); tone(B(), t + d, 'triangle', 440, 587, 0.14, 0.07, 0.01); }
    } },
    beam:    { gap: 0.15, fn: t => { tone(B(), t, 'sawtooth', 900, 300, 0.25, 0.08); noise(B(), t, 'bandpass', 2200, 1200, 0.2, 0.12, 1); } },
    wormWarn:{ gap: 0.3, fn: t => { tone(B(), t, 'sine', 60, 90, 0.6, 0.25); noise(B(), t, 'lowpass', 300, 600, 0.6, 0.18); } },
    wormPop: { gap: 0.15, fn: t => { noise(B(), t, 'lowpass', 2500, 200, 0.35, 0.5); tone(B(), t, 'triangle', 180, 60, 0.2, 0.18); } },
    // 번개 모으기: 올라가는 톡톡 다섯 번 + 낮은 웅 (지직거리는 높은 잡음 대신)
    zapWarn: { gap: 0.3, fn: t => {
      warnTone(t, 0.7);
      tone(B(), t, 'triangle', 220, 440, 0.7, 0.1, 0.05);
      for (let i = 0; i < 5; i++) tone(B(), t + i * 0.12, 'sine', 523 + i * 110, 523 + i * 110, 0.07, 0.16, 0.004);
    } },
    zap:     { gap: 0.15, fn: t => { noise(B(), t, 'bandpass', 2600, 800, 0.25, 0.4, 0.8); tone(B(), t, 'triangle', 900, 120, 0.18, 0.15); } },
    // 고리 조각 띠 예고: 위로 "우웁" 쓸어 올림
    bandWarn:{ gap: 0.3, fn: t => {
      warnTone(t, 0.5);
      tone(B(), t, 'triangle', 300, 900, 0.5, 0.15, 0.02); tone(B(), t, 'sine', 150, 450, 0.5, 0.115, 0.02);
    } },
    sweep:   { gap: 0.15, fn: t => { noise(B(), t, 'bandpass', 600, 2400, 0.35, 0.3, 2); } },
    crack:   { gap: 0.1, fn: t => { [1047, 1319, 1568].forEach((f, i) => tone(B(), t + i * 0.03, 'triangle', f, f * 0.9, 0.15, 0.08)); noise(B(), t, 'bandpass', 3000, 2000, 0.1, 0.1, 1); } },
    // 깜짝 선물 상자 · 피버 · 동료 (2026-09-27): 상자 등장 딸랑 · 상자에 맞음 톡 · 상자 열림 팡 + 반짝 화음 ·
    // 피버 시작 쭉 올라가는 소리 + 화음 · 피버 끝 내려가는 두 음 · 캡슐 등장 삐빅 · 동료 구출 짧은 팡파르 · 동료 인사 두 음
    giftAppear: { gap: 1.0, fn: t => { [784, 1047, 1319].forEach((f, i) => tone(B(), t + i * 0.08, 'sine', f, f, 0.2, 0.12)); } },
    giftHit: { gap: 0.06, fn: t => { tone(B(), t, 'triangle', 900, 1100, 0.05, 0.08); } },
    gift:    { gap: 0.30, fn: t => {
      noise(B(), t, 'bandpass', 1500, 3000, 0.12, 0.3, 1.2);
      [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(B(), t + 0.05 + i * 0.06, 'triangle', f, f, 0.16, 0.1));
    } },
    fever:   { gap: 1.0, fn: t => {
      tone(B(), t, 'triangle', 300, 1200, 0.35, 0.14);
      [523, 659, 784, 1047].forEach((f, i) => tone(B(), t + 0.3 + i * 0.05, 'triangle', f, f, 0.3, 0.1));
    } },
    feverEnd:{ gap: 1.0, fn: t => { tone(B(), t, 'triangle', 880, 880, 0.12, 0.1); tone(B(), t + 0.12, 'triangle', 660, 660, 0.2, 0.1); } },
    capsule: { gap: 1.0, fn: t => { tone(B(), t, 'sine', 1047, 1047, 0.08, 0.1); tone(B(), t + 0.12, 'sine', 1319, 1319, 0.1, 0.1); } },
    wingman: { gap: 0.5, fn: t => { [659, 880, 1047, 1319].forEach((f, i) => tone(B(), t + i * 0.07, 'triangle', f, f, 0.2, 0.14)); } },
    wingBye: { gap: 0.5, fn: t => { tone(B(), t, 'triangle', 1047, 1047, 0.14, 0.1); tone(B(), t + 0.16, 'triangle', 1319, 1319, 0.22, 0.1); } },
    clear:   { gap: 0.10, fn: t => { [440, 554, 659, 880].forEach((f, i) => tone(B(), t + i * 0.07, 'triangle', f, f, 0.18, 0.22)); } },
    wave:    { gap: 0.10, fn: t => { tone(B(), t, 'triangle', 330, 660, 0.25, 0.22); } },
    boss:    { gap: 0.50, fn: t => {
      for (let i = 0; i < 3; i++) tone(B(), t + i * 0.28, 'sawtooth', 220, 180, 0.22, 0.2);
      tone(B(), t, 'sine', 55, 40, 1.0, 0.45);
    } },
    bossDown:{ gap: 0.50, fn: t => {
      noise(B(), t, 'lowpass', 3000, 40, 1.4, 0.55);
      tone(B(), t, 'sine', 80, 25, 1.2, 0.5);
      noise(B(), t + 0.25, 'lowpass', 1600, 60, 0.8, 0.35);
    } },
    // 내 기체가 터짐 (world 'over'). 뒤이어 "한 번 더!"(SND continueAsk)나 게임 오버(SND over·overSoft)가 난다
    down:    { gap: 0.50, fn: t => {
      noise(B(), t, 'lowpass', 2200, 50, 1.0, 0.6);
      tone(B(), t, 'sine', 110, 35, 0.6, 0.4);
    } },
  };

  // 판 이벤트(world.js W.events) → 소리. 이름이 같으면 그대로, 아래는 바꿔 부른다
  const ALIAS = { over: 'down' };
  // 공통 효과음(SND.ui)으로 내는 판 이벤트: 카드 고르기 · 한 번 더! 되살아남
  const UI_EVENT = { pick: 'tap', revive: 'continueGo' };

  // 합성음 위에 겹치는 소리 파일: f 파일, v 크기, r 빠르기, d 길이 자르기, jit 음높이 흔들기
  const SM = NG.makeSamples('sounds/');
  const SAMPLE = {
    shoot:    { f: 'blaster', v: 0.12, r: 1.25, d: 0.14, jit: 0.08, shot: true },
    hit:      { f: 'enemy_hurt', v: 0.13, jit: 0.1 },
    kill:     { f: 'enemy_destroy', v: 0.4, d: 0.55, jit: 0.1 },
    hurt:     { f: 'impact', v: 0.9 },
    eshoot:   { f: 'enemy_attack', v: 0.3, jit: 0.08 },
    dash:     { f: 'weapon_change', v: 0.5, r: 1.3 },
    bossDown: { f: 'enemy_destroy', v: 0.8, r: 0.6 },
    ult:      { f: 'enemy_destroy', v: 0.6, r: 0.5 },
    bomb:     { f: 'enemy_destroy', v: 0.7, r: 0.7 },
    down:     { f: 'enemy_destroy', v: 0.6, r: 0.6 },
  };
  const FILES = Array.from(new Set(Object.values(SAMPLE).map(s => s.f)));

  function play(name, opt) {
    if (typeof SND === 'undefined' || SND.muted() || !SND.fxOn() || !ensure()) return;
    const s = SFX[name];
    if (!s) return;
    const now = ac.currentTime;
    if (last[name] != null && now - last[name] < s.gap) return;
    last[name] = now;
    SND.run(t => {
      s.fn(t, opt);
      const m = SAMPLE[name];
      if (m) SM.play(m.f, m.shot ? shotLp : master, { vol: m.v, rate: (m.r || 1) * (1 + (Math.random() - 0.5) * (m.jit || 0)), dur: m.d });
    }, name);
  }
  function ui(name, opt) { if (typeof SND !== 'undefined') SND.ui(name, opt); }
  // 판 이벤트 하나를 소리로
  function event(ev, opt) {
    if (UI_EVENT[ev]) return ui(UI_EVENT[ev], opt);
    play(ALIAS[ev] || ev, opt);
  }
  const soundOf = ev => (UI_EVENT[ev] ? 'ui.' + UI_EVENT[ev] : SFX[ALIAS[ev] || ev] ? (ALIAS[ev] || ev) : null);

  // ─── 배경 음악 (SND.music, 행성마다 다른 테마) ─────────────
  const M = () => (typeof SND !== 'undefined' ? SND.music : null);
  function title() { const m = M(); if (!m) return; m.duck(1); m.setMood({ boss: false, fever: false, calm: false }); m.play(SND.themeFor('ngun', 'title')); }
  function startPlay(planet) { const m = M(); if (!m) return; m.duck(1); m.setMood({ boss: false, fever: false, calm: false }); m.play(SND.themeFor('ngun', planet || 'mercury')); }
  function planet(id, boss) { const m = M(); if (m && id) m.setMood({ planet: id, boss: !!boss }); }
  function boss(on) { const m = M(); if (m) m.setMood({ boss: !!on }); }
  function fever(on) { const m = M(); if (m) m.setMood({ fever: !!on }); }
  function duck(on) { const m = M(); if (m) m.duck(on ? 0.3 : 1); }
  function stopMusic(sec) { const m = M(); if (m) m.stop(sec == null ? 1.2 : sec); }

  NG.Audio = {
    unlock, play, ui, event, soundOf, title, startPlay, planet, boss, fever, duck, stopMusic,
    names: Object.keys(SFX), ALIAS, UI_EVENT,
  };
})(NG);
