'use strict';
// 소리. 파일 없이 WebAudio로 합성한다.
//  - 효과음: 총소리·폭발은 잡음(노이즈)+저음 펀치, 나머지는 발진기
//  - 배경음악: 16스텝 시퀀서 (베이스·킥·스네어·하이햇·아르페지오), 보스전엔 템포·층을 올린다
// 브라우저 정책상 첫 터치·클릭·키 입력 뒤에야 소리가 난다 (unlock).
(function (NG) {
  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let muted = false, sfxOn = true, musicOn = true;
  const last = {}; // 같은 소리 과다 재생 방지

  const VOL = { master: 0.5, sfx: 0.8, music: 0.38 };

  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain();
      // 여러 소리가 겹쳐도 찢어지지 않게 마지막에 압축
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      applyGains();
      if (wantMusic) startMusic(wantMusic);
    } catch (e) { ac = null; }
  }

  function applyGains() {
    if (!ac) return;
    const t = ac.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : VOL.master, t, 0.02);
    sfxBus.gain.setTargetAtTime(sfxOn ? VOL.sfx : 0, t, 0.02);
    musicBus.gain.setTargetAtTime(musicOn ? VOL.music * duck : 0, t, 0.15);
  }

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

  // ─── 효과음 ───────────────────────────────────────────────
  // gap: 같은 소리 최소 간격(초)
  const SFX = {
    shoot: { gap: 0.055, fn(t, o) {
      // 총열이 많을수록 소리가 두껍고 낮아진다
      const n = Math.min(12, (o && o.n) || 1);
      const pitch = 0.9 + Math.random() * 0.2;
      noise(sfxBus, t, 'bandpass', 2600 * pitch, 700, 0.07, 0.5 + n * 0.03, 1.2);   // 탕 (고음 파열)
      noise(sfxBus, t, 'lowpass', 1400, 200, 0.05 + n * 0.006, 0.35 + n * 0.03);      // 폭음 몸통
      tone(sfxBus, t, 'sine', 170 - n * 5, 45, 0.07, 0.45);                            // 저음 펀치
      tone(sfxBus, t, 'square', 1600 * pitch, 400, 0.02, 0.05);                        // 금속성 딸깍
    } },
    hit:     { gap: 0.04, fn: t => { noise(sfxBus, t, 'highpass', 3000, 3000, 0.03, 0.18); tone(sfxBus, t, 'triangle', 420, 260, 0.04, 0.12); } },
    kill:    { gap: 0.03, fn: t => {
      noise(sfxBus, t, 'lowpass', 2400, 120, 0.22, 0.55);
      tone(sfxBus, t, 'sine', 120, 40, 0.18, 0.4);
    } },
    hurt:    { gap: 0.10, fn: t => {
      tone(sfxBus, t, 'sawtooth', 180, 50, 0.32, 0.4);
      noise(sfxBus, t, 'lowpass', 900, 100, 0.3, 0.5);
    } },
    dash:    { gap: 0.05, fn: t => { noise(sfxBus, t, 'bandpass', 500, 3500, 0.16, 0.35, 2); } },
    nova:    { gap: 0.10, fn: t => {
      noise(sfxBus, t, 'lowpass', 3000, 60, 0.45, 0.7);
      tone(sfxBus, t, 'sine', 90, 30, 0.4, 0.6);
    } },
    heal:    { gap: 0.05, fn: t => { tone(sfxBus, t, 'sine', 660, 660, 0.08, 0.25); tone(sfxBus, t + 0.07, 'sine', 990, 990, 0.12, 0.25); } },
    eshoot:  { gap: 0.08, fn: t => { tone(sfxBus, t, 'triangle', 700, 350, 0.08, 0.12); } },
    pick:    { gap: 0.05, fn: t => { [523, 659, 784].forEach((f, i) => tone(sfxBus, t + i * 0.05, 'square', f, f, 0.1, 0.12)); } },
    clear:   { gap: 0.10, fn: t => { [440, 554, 659, 880].forEach((f, i) => tone(sfxBus, t + i * 0.07, 'triangle', f, f, 0.18, 0.25)); } },
    wave:    { gap: 0.10, fn: t => { tone(sfxBus, t, 'triangle', 330, 660, 0.25, 0.22); } },
    boss:    { gap: 0.50, fn: t => {
      for (let i = 0; i < 3; i++) tone(sfxBus, t + i * 0.28, 'sawtooth', 220, 180, 0.22, 0.25);
      tone(sfxBus, t, 'sine', 55, 40, 1.0, 0.5);
    } },
    bossDown:{ gap: 0.50, fn: t => {
      noise(sfxBus, t, 'lowpass', 4000, 40, 1.4, 0.9);
      tone(sfxBus, t, 'sine', 80, 25, 1.2, 0.7);
      noise(sfxBus, t + 0.25, 'lowpass', 2000, 60, 0.8, 0.5);
    } },
    over:    { gap: 0.50, fn: t => {
      noise(sfxBus, t, 'lowpass', 2500, 50, 1.0, 0.7);
      [392, 330, 262, 196].forEach((f, i) => tone(sfxBus, t + 0.2 + i * 0.18, 'triangle', f, f * 0.98, 0.3, 0.2));
    } },
  };

  function play(name, opt) {
    if (!ac || muted || !sfxOn) return;
    const s = SFX[name];
    if (!s) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < s.gap) return;
    last[name] = now;
    s.fn(now + 0.005, opt);
  }

  // ─── 배경음악 ─────────────────────────────────────────────
  // A단조 4마디 진행 (Am - F - C - G). 음 이름 대신 MIDI 번호
  const PROG = [
    { root: 45, chord: [57, 60, 64] }, // Am
    { root: 41, chord: [53, 57, 60] }, // F
    { root: 48, chord: [55, 60, 64] }, // C
    { root: 43, chord: [55, 59, 62] }, // G
  ];
  const BOSS_PROG = [
    { root: 45, chord: [57, 60, 64] }, // Am
    { root: 46, chord: [58, 62, 65] }, // Bb
    { root: 45, chord: [57, 60, 64] }, // Am
    { root: 44, chord: [56, 59, 63] }, // G#dim 느낌
  ];
  // 모드별 편성. bpm, 층 켜기
  const MODES = {
    title: { bpm: 100, kick: false, snare: false, hat: true,  bass: true, arp: false, lead: false, prog: PROG },
    play:  { bpm: 128, kick: true,  snare: true,  hat: true,  bass: true, arp: true,  lead: false, prog: PROG },
    boss:  { bpm: 146, kick: true,  snare: true,  hat: true,  bass: true, arp: true,  lead: true,  prog: BOSS_PROG },
  };
  const LEAD = [0, -1, 7, -1, 5, -1, 3, 2, 0, -1, -1, 3, 5, 7, 10, 12]; // 보스전 멜로디 (반음, -1은 쉼)

  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  let wantMusic = null;  // 요청된 모드 (unlock 전에도 기억)
  let seq = null;        // { mode, step, next, timer }
  let duck = 1;          // 일시정지 때 줄이기

  function schedStep(m, step, t) {
    const bar = m.prog[Math.floor(step / 16) % m.prog.length];
    const s = step % 16;
    const spb = 60 / m.bpm / 4; // 16분음표 길이
    if (m.kick && s % 4 === 0) {
      tone(musicBus, t, 'sine', 140, 40, 0.16, 0.9);
    }
    if (m.snare && (s === 4 || s === 12)) {
      noise(musicBus, t, 'highpass', 1500, 1500, 0.14, 0.35);
      tone(musicBus, t, 'triangle', 220, 160, 0.08, 0.2);
    }
    if (m.hat && s % 2 === 1) noise(musicBus, t, 'highpass', 7000, 7000, 0.03, s % 4 === 3 ? 0.18 : 0.1);
    if (m.bass && s % 2 === 0) {
      const note = bar.root + (s % 8 === 6 ? 12 : 0);
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = midi(note);
      f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(180, t + spb * 1.8);
      env(g, t, 0.32, 0.005, spb * 1.9);
      o.connect(f); f.connect(g); g.connect(musicBus);
      o.start(t); o.stop(t + spb * 2);
    }
    if (m.arp) {
      const n = bar.chord[s % 3] + (s >= 8 ? 12 : 0);
      tone(musicBus, t, 'square', midi(n), midi(n), spb * 0.9, 0.05);
    }
    if (m.lead && LEAD[s] >= 0) {
      const n = 69 + LEAD[s] + (bar.root - 45);
      tone(musicBus, t, 'sawtooth', midi(n), midi(n), spb * 1.8, 0.08, 0.01);
    }
  }

  function tick() {
    if (!seq || !ac) return;
    const m = MODES[seq.mode];
    const spb = 60 / m.bpm / 4;
    // 0.12초 앞까지 미리 예약 (setInterval이 흔들려도 박자가 안 밀림)
    while (seq.next < ac.currentTime + 0.12) {
      schedStep(m, seq.step, seq.next);
      seq.step++;
      seq.next += spb;
    }
  }

  function startMusic(mode) {
    if (!ac) return;
    if (seq && seq.mode === mode) return;
    if (seq) { seq.mode = mode; return; } // 이어서 모드만 바꿈 (박자 유지)
    seq = { mode, step: 0, next: ac.currentTime + 0.05, timer: setInterval(tick, 25) };
  }

  function stopMusic() {
    if (seq) { clearInterval(seq.timer); seq = null; }
  }

  // mode: 'title' | 'play' | 'boss' | 'off'
  function music(mode) {
    wantMusic = mode === 'off' ? null : mode;
    if (!ac) return;
    if (!wantMusic) stopMusic(); else startMusic(wantMusic);
  }

  function setDuck(on) { duck = on ? 0.35 : 1; applyGains(); }

  function setMuted(m) { muted = !!m; applyGains(); }
  function setSfx(on) { sfxOn = !!on; applyGains(); }
  function setMusic(on) { musicOn = !!on; applyGains(); }

  NG.Audio = {
    unlock, play, music, setDuck, setMuted, setSfx, setMusic,
    get muted() { return muted; }, get sfxOn() { return sfxOn; }, get musicOn() { return musicOn; },
  };
})(NG);
