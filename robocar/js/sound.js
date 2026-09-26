'use strict';
// 효과음·음악(WebAudio 합성)과 목소리 안내(speechSynthesis).
// 효과음 일부는 진짜 소리 파일(sounds/, Kenney 무료)로 내고, 파일이 없으면 합성음으로 대신한다.
(function (RC) {
  let ac = null, master = null, sfx = null, bgm = null, noiseBuf = null;
  let soundOn = true, voiceOn = true;
  const last = {};

  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = soundOn ? 0.55 : 0;
      const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
      bgm = ac.createGain(); bgm.gain.value = 0.28; bgm.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (wantMusic) startMusic();
      SM.load(ac, FILES);
    } catch (e) { ac = null; }
  }

  function env(g, t, v, a, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function tone(bus, t, type, f0, f1, dur, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, vol, 0.005, dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(bus, t, type, f0, f1, dur, vol) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    env(g, t, vol, 0.003, dur); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  let starStreak = 0, starLast = 0;
  const SFX = {
    click:  t => { tone(sfx, t, 'square', 900, 500, 0.05, 0.25); noise(sfx, t, 'highpass', 3000, 3000, 0.03, 0.3); },     // 철컥
    tap:    t => tone(sfx, t, 'sine', 700, 900, 0.06, 0.2),
    jump:   t => tone(sfx, t, 'sine', 300, 900, 0.18, 0.35),                                                              // 뽀용
    jump2:  t => tone(sfx, t, 'sine', 500, 1300, 0.16, 0.3),
    land:   t => { tone(sfx, t, 'sine', 140, 60, 0.12, 0.4); noise(sfx, t, 'lowpass', 600, 100, 0.1, 0.25); },            // 쿵
    star:   t => {                                                                                                          // 띵 (연속이면 음이 올라간다)
      const now = ac.currentTime; starStreak = now - starLast < 0.6 ? Math.min(starStreak + 1, 12) : 0; starLast = now;
      const f = 880 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21][starStreak] / 12);
      tone(sfx, t, 'triangle', f, f, 0.18, 0.28); tone(sfx, t, 'sine', f * 2, f * 2, 0.1, 0.1);
    },
    smash:  t => { noise(sfx, t, 'lowpass', 3000, 150, 0.35, 0.7); tone(sfx, t, 'square', 200, 60, 0.2, 0.25); },        // 와장창
    bump:   t => { tone(sfx, t, 'sine', 180, 70, 0.2, 0.5); tone(sfx, t + 0.05, 'triangle', 600, 300, 0.1, 0.2); },
    transform: t => {                                                                                                       // 변신!
      tone(sfx, t, 'sawtooth', 200, 1200, 0.45, 0.2);
      [523, 659, 784, 1047].forEach((f, i) => tone(sfx, t + 0.12 + i * 0.07, 'square', f, f, 0.16, 0.14));
      noise(sfx, t, 'bandpass', 800, 6000, 0.4, 0.25);
    },
    untransform: t => tone(sfx, t, 'sawtooth', 900, 250, 0.3, 0.15),
    water:  t => noise(sfx, t, 'bandpass', 2000, 900, 0.7, 0.4),
    siren:  t => { for (let i = 0; i < 4; i++) tone(sfx, t + i * 0.25, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.22, 0.12); },
    fall:   t => tone(sfx, t, 'triangle', 700, 150, 0.45, 0.3),                                                              // 휘이익
    pop:    t => { tone(sfx, t, 'sine', 400, 1600, 0.15, 0.4); },                                                            // 뿅
    hot:    t => { tone(sfx, t, 'square', 1200, 800, 0.08, 0.15); tone(sfx, t + 0.1, 'square', 1300, 900, 0.08, 0.15); },
    slip:   t => tone(sfx, t, 'sine', 900, 200, 0.5, 0.3),
    monkey: t => { for (let i = 0; i < 3; i++) tone(sfx, t + i * 0.09, 'square', 1100, 800, 0.07, 0.12); },
    boing:  t => tone(sfx, t, 'sine', 200, 700, 0.25, 0.3),
    ramp:   t => tone(sfx, t, 'sawtooth', 300, 800, 0.3, 0.12),
    honk:   t => { tone(sfx, t, 'square', 440, 440, 0.12, 0.2); tone(sfx, t + 0.16, 'square', 440, 440, 0.18, 0.2); },
    finish: t => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(sfx, t + i * 0.12, 'square', f, f, 0.2, 0.16)); },
    sticker: t => { [784, 988, 1175, 1568].forEach((f, i) => tone(sfx, t + i * 0.08, 'triangle', f, f, 0.3, 0.25)); },
    fill:   t => tone(sfx, t, 'triangle', 1200, 1200, 0.06, 0.12),
    beep:   t => { tone(sfx, t, 'square', 660, 660, 0.14, 0.18); tone(sfx, t, 'sine', 1320, 1320, 0.1, 0.08); },            // 삐 (출발 신호)
    go:     t => { tone(sfx, t, 'square', 1320, 1320, 0.4, 0.2); tone(sfx, t, 'sawtooth', 220, 520, 0.5, 0.12); noise(sfx, t, 'bandpass', 600, 2400, 0.4, 0.2); },
    whoosh: t => noise(sfx, t, 'bandpass', 500, 3500, 0.28, 0.22),                                                        // 화면 넘김
    swap:   t => { tone(sfx, t, 'square', 500, 1000, 0.07, 0.18); tone(sfx, t + 0.07, 'triangle', 1400, 1800, 0.12, 0.16); noise(sfx, t, 'highpass', 4000, 4000, 0.05, 0.25); },
    hop:    t => { tone(sfx, t, 'sine', 260, 820, 0.2, 0.32); tone(sfx, t + 0.04, 'triangle', 520, 1200, 0.12, 0.12); },   // 폴짝 (저절로 넘기)
    cone:   t => { tone(sfx, t, 'triangle', 520, 260, 0.1, 0.25); noise(sfx, t, 'bandpass', 1800, 900, 0.08, 0.25); },          // 통! (고깔)
    splash: t => { noise(sfx, t, 'lowpass', 1400, 200, 0.35, 0.5); tone(sfx, t, 'sine', 180, 90, 0.2, 0.25); },             // 철퍼덕
    balloon: t => { noise(sfx, t, 'highpass', 2500, 1200, 0.08, 0.5); tone(sfx, t, 'sine', 900, 300, 0.08, 0.2); },        // 펑
    airbonus: t => { [784, 988, 1175].forEach((f, i) => tone(sfx, t + i * 0.06, 'triangle', f, f, 0.14, 0.2)); },
    rescue: t => { [523, 659, 784, 1047].forEach((f, i) => tone(sfx, t + i * 0.09, 'triangle', f, f, 0.22, 0.24)); },
    check:  t => { [659, 784, 1047].forEach((f, i) => tone(sfx, t + i * 0.1, 'square', f, f, 0.16, 0.14)); },
    unlock: t => { [523, 784, 1047, 1568].forEach((f, i) => tone(sfx, t + i * 0.1, 'triangle', f, f, 0.3, 0.24)); },
    rev:    t => { tone(sfx, t, 'sawtooth', 90, 260, 0.5, 0.16); tone(sfx, t + 0.05, 'square', 60, 140, 0.45, 0.08); noise(sfx, t, 'lowpass', 400, 1200, 0.5, 0.18); },
    // 슈퍼 변신 · 게이지 가득 · 물대포 · 가속 발판 · 선물 상자
    super:  t => { tone(sfx, t, 'sawtooth', 200, 1600, 0.35, 0.18); [784, 988, 1175, 1568, 2093].forEach((f, i) => tone(sfx, t + 0.25 + i * 0.07, 'triangle', f, f, 0.3, 0.22)); noise(sfx, t + 0.2, 'lowpass', 4000, 300, 0.6, 0.35); },
    peek:   t => { tone(sfx, t, 'sine', 500, 900, 0.12, 0.2); tone(sfx, t + 0.12, 'sine', 700, 1200, 0.12, 0.2); },
    superReady: t => { [1047, 1319, 1568, 2093].forEach((f, i) => tone(sfx, t + i * 0.06, 'square', f, f, 0.12, 0.12)); },
    spray:  t => noise(sfx, t, 'bandpass', 2600, 1400, 0.16, 0.12),
    douse:  t => { noise(sfx, t, 'highpass', 3000, 1500, 0.35, 0.3); tone(sfx, t, 'sine', 700, 300, 0.15, 0.12); },
    boost:  t => { tone(sfx, t, 'sawtooth', 300, 1400, 0.3, 0.14); noise(sfx, t, 'bandpass', 800, 4000, 0.3, 0.2); },
    gift:   t => { [659, 880, 1175, 1760].forEach((f, i) => tone(sfx, t + i * 0.08, 'triangle', f, f, 0.35, 0.26)); noise(sfx, t, 'highpass', 5000, 3000, 0.4, 0.15); },
    slam:   t => { tone(sfx, t, 'sine', 120, 50, 0.3, 0.5); noise(sfx, t, 'lowpass', 2000, 200, 0.25, 0.35); },
  };

  // 진짜 소리 파일: f 파일, v 크기, r 빠르기(음 높이), d 길이 자르기. layer면 합성음도 같이 낸다(두께)
  const SM = RC.makeSamples('sounds/');
  const SAMPLE = {
    jump:   { f: 'jump', v: 0.9 },
    jump2:  { f: 'jump_c', v: 1.6 },
    hop:    { f: 'jump_b', v: 1.8, r: 1.05 },
    land:   { f: 'land', v: 4, layer: true },
    star:   { f: 'coin', v: 1.5 },
    smash:  { f: 'break', v: 1.1, layer: true },
    bump:   { f: 'impact', v: 1.1 },
    fall:   { f: 'fall', v: 0.9, layer: true },
    pop:    { f: 'tile-match', v: 0.8, r: 1.2 },
    click:  { f: 'placement-a', v: 0.45 },
    swap:   { f: 'placement-c', v: 0.6 },
    cone:   { f: 'tile-land', v: 0.75, r: 0.9 },
    slip:   { f: 'skid', v: 0.8, d: 0.75 },
    ramp:   { f: 'skid', v: 0.35, d: 0.35, r: 1.4, layer: true },
    boing:  { f: 'jump_a', v: 1.8 },
    transform: { f: 'weapon_change', v: 1.6, layer: true },
    untransform: { f: 'removal-a', v: 0.7 },
    slam:   { f: 'impact', v: 1.1, r: 0.85 },
    balloon: { f: 'placement-a', v: 0.8, r: 1.6, layer: true },
    rescue: { f: 'tile-match', v: 0.9, layer: true },
    super:  { f: 'weapon_change', v: 1.8, r: 0.8, layer: true },
    boost:  { f: 'skid', v: 0.4, d: 0.4, r: 1.6, layer: true },
  };
  const FILES = Array.from(new Set(Object.values(SAMPLE).map(s => s.f).concat(['engine'])));
  function play(name) {
    if (!ac || !soundOn || !SFX[name]) return;
    const now = ac.currentTime;
    if (name !== 'star' && last[name] && now - last[name] < 0.05) return;
    last[name] = now;
    const smp = SAMPLE[name];
    let used = false;
    if (smp) {
      let rate = smp.r || 1;
      if (name === 'star') {
        // 연속으로 먹으면 음이 한 칸씩 올라간다 (합성음과 같은 규칙)
        starStreak = now - starLast < 0.6 ? Math.min(starStreak + 1, 12) : 0; starLast = now;
        rate = Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21][starStreak] / 12);
      }
      used = !!SM.play(smp.f, sfx, { vol: smp.v, rate, dur: smp.d });
    }
    if (!used || smp.layer) SFX[name](now + 0.005);
  }

  // 엔진 소리: 달리는 동안 낮게 깔리고, 빠를수록 음이 올라간다. k = 0(정지) ~ 1(최고 속도)
  let eng = null;
  function engine(on, k) {
    if (!ac || !soundOn) on = false;
    if (on && !eng) {
      eng = SM.play('engine', sfx, { vol: 0.0001, loop: true, rate: 0.8 });
      if (eng) eng.gain.gain.setTargetAtTime(0.13, ac.currentTime, 0.25);
    }
    if (!eng) return;
    const t = ac.currentTime;
    if (on) eng.src.playbackRate.setTargetAtTime(0.75 + Math.max(0, Math.min(1.4, k || 0)) * 0.4, t, 0.2);
    else {
      const e = eng; eng = null;
      e.gain.gain.setTargetAtTime(0.0001, t, 0.15);
      try { e.src.stop(t + 0.8); } catch (err) { /* 무시 */ }
    }
  }

  // 음악: 신나는 장조 행진 (C - G - Am - F), 16스텝
  const PROG = [[48, [60, 64, 67]], [43, [59, 62, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]]];
  const MEL = [72, -1, 76, -1, 79, -1, 76, 74, 72, -1, 74, 76, 79, -1, 81, -1];
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  let wantMusic = false, seq = null;
  function startMusic() {
    if (!ac || seq) return;
    seq = { step: 0, next: ac.currentTime + 0.05, timer: setInterval(tick, 25) };
  }
  function tick() {
    if (!seq || !ac) return;
    const spb = 60 / 120 / 4;
    while (seq.next < ac.currentTime + 0.12) {
      const s = seq.step % 16, bar = PROG[Math.floor(seq.step / 16) % 4], t = seq.next;
      if (s % 4 === 0) tone(bgm, t, 'sine', 130, 50, 0.12, 0.5);
      if (s === 4 || s === 12) noise(bgm, t, 'highpass', 2000, 2000, 0.08, 0.2);
      if (s % 2 === 0) tone(bgm, t, 'triangle', midi(bar[0] + (s % 8 === 4 ? 7 : 0)), midi(bar[0] + (s % 8 === 4 ? 7 : 0)), spb * 1.8, 0.35);
      if (s % 4 === 2) bar[1].forEach(n => tone(bgm, t, 'square', midi(n), midi(n), spb * 0.8, 0.04));
      if (Math.floor(seq.step / 16) % 2 === 1 && MEL[s] > 0) tone(bgm, t, 'triangle', midi(MEL[s]), midi(MEL[s]), spb * 1.6, 0.14);
      seq.step++; seq.next += spb;
    }
  }
  function music(on) {
    wantMusic = on;
    if (on) startMusic(); else if (seq) { clearInterval(seq.timer); seq = null; }
  }

  // ─── 목소리 안내 + 자막 ──────────────────────────────────
  let koVoice = null;
  function pickVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      koVoice = vs.find(v => /ko/i.test(v.lang)) || null;
    } catch (e) { koVoice = null; }
  }
  try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } catch (e) { /* 지원 안 함 */ }

  let sayTimer = 0;
  function say(text, opt) {
    const el = document.getElementById('say');
    if (el && !(opt && opt.bubble === false)) {
      (el.querySelector('span') || el).textContent = text; el.classList.add('on');
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => el.classList.remove('on'), (opt && opt.ms) || 2600);
    }
    if (!voiceOn) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[!?~]/g, m => m));
      u.lang = 'ko-KR'; if (koVoice) u.voice = koVoice;
      u.rate = 1.0; u.pitch = 1.3; u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* 목소리 없음: 자막만 */ }
  }

  RC.Sound = {
    unlock, play, music, say, engine,
    hasVoice: () => { try { return !!window.speechSynthesis && !!koVoice; } catch (e) { return false; } },
    setSound(on) { soundOn = on; if (master) master.gain.value = on ? 0.55 : 0; },
    setVoice(on) { voiceOn = on; if (!on) try { speechSynthesis.cancel(); } catch (e) { /* 무시 */ } },
  };
})(RC);
