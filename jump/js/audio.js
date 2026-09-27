'use strict';
// 소리. 파일 없이 WebAudio 합성음만 쓴다.
// 브라우저 정책상 첫 터치·클릭·키 입력 뒤에야 소리가 난다 (unlock).
(function (JP) {
  let ac = null, master = null, noiseBuf = null;
  let muted = false;
  const last = {}; // 같은 소리 과다 재생 방지
  const VOL = 0.45;

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
      master.gain.value = muted ? 0 : VOL;
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }

  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(t, type, f0, f1, dur, vol, attack) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, vol, attack || 0.004, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, ftype, f0, f1, dur, vol) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = ftype;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    env(g, t, vol, 0.002, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // gap: 같은 소리 최소 간격(초)
  const SFX = {
    // 통: 이어서 더 높은 발판을 밟을수록(콤보) 음이 조금씩 오른다 (한 옥타브까지)
    bounce: { gap: 0.04, fn(t, o) {
      const k = Math.pow(2, Math.min(12, ((o && o.k) || 0)) / 12);
      tone(t, 'sine', 300 * k, 620 * k, 0.12, 0.2);
      tone(t, 'triangle', 620 * k, 900 * k, 0.07, 0.07);
    } },
    // 스프링: 뿌잉 하고 떨리며 올라간다
    spring: { gap: 0.1, fn(t) {
      const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.35);
      lfo.frequency.value = 26; lg.gain.value = 60;
      lfo.connect(lg); lg.connect(o.frequency);
      env(g, t, 0.22, 0.005, 0.45);
      o.connect(g); g.connect(master);
      o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
      tone(t + 0.05, 'sine', 1200, 2400, 0.2, 0.05);
    } },
    // 별: 반짝 두 음
    star: { gap: 0.03, fn(t) {
      tone(t, 'square', 1319, 1319, 0.06, 0.07);
      tone(t + 0.05, 'triangle', 1976, 2637, 0.14, 0.1);
    } },
    // 로켓: 쉬익 하는 잡음 + 올라가는 톱니파
    rocket: { gap: 0.3, fn(t) {
      noise(t, 'bandpass', 400, 3000, 1.6, 0.22);
      tone(t, 'sawtooth', 110, 660, 1.4, 0.07, 0.05);
      [523, 784, 1047].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, f, 0.18, 0.08));
    } },
    // 방패 방울을 먹음 · 방울이 지켜 줌(퐁)
    shield: { gap: 0.2, fn(t) { tone(t, 'sine', 500, 1000, 0.25, 0.12); tone(t + 0.08, 'sine', 1000, 1500, 0.2, 0.08); } },
    save: { gap: 0.2, fn(t) { tone(t, 'sine', 1400, 300, 0.2, 0.16); noise(t, 'highpass', 3000, 6000, 0.12, 0.1); } },
    // 부서지는 발판: 바삭
    crumble: { gap: 0.08, fn(t) { noise(t, 'bandpass', 2400, 500, 0.22, 0.2); tone(t, 'square', 180, 90, 0.1, 0.05); } },
    // 구조 구름이 받아 줌: 부드럽게 올라가는 화음
    rescue: { gap: 0.3, fn(t) {
      noise(t, 'lowpass', 900, 300, 0.4, 0.12);
      [392, 523, 659, 784].forEach((f, i) => tone(t + 0.05 + i * 0.07, 'sine', f, f, 0.3, 0.12));
    } },
    // 아이템이 나타남
    item: { gap: 0.3, fn(t) { tone(t, 'sine', 660, 990, 0.18, 0.08); } },
    // 끝: 쉬움은 부드럽게 내려오는 세 음, 보통(가시 폭탄)은 쿵
    over: { gap: 0.3, fn(t, o) {
      if (o && o.soft) {
        [659, 523, 392].forEach((f, i) => tone(t + i * 0.16, 'triangle', f, f, 0.35, 0.14));
        return;
      }
      tone(t, 'sawtooth', 440, 60, 0.6, 0.18);
      tone(t, 'sine', 160, 40, 0.35, 0.35);
      noise(t, 'lowpass', 2400, 120, 0.45, 0.3);
    } },
    // 떨어짐 (보통): 휘이잉 내려가는 소리
    fall: { gap: 0.3, fn(t) { tone(t, 'sine', 900, 120, 0.8, 0.14); } },
    start: { gap: 0.2, fn(t) {
      tone(t, 'square', 392, 392, 0.08, 0.1);
      tone(t + 0.09, 'square', 784, 784, 0.12, 0.1);
    } },
    medal: { gap: 0.3, fn(t) { [784, 988, 1175, 1568, 2093].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.35, 0.14)); noise(t, 'highpass', 5000, 9000, 0.4, 0.06); } },
  };

  function play(name, o) {
    if (!ac || muted || ac.state !== 'running') return;
    const s = SFX[name];
    if (!s) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < s.gap) return;
    last[name] = now;
    try { s.fn(now + 0.005, o); } catch (e) { /* 소리 실패는 게임을 멈추지 않는다 */ }
  }

  function setMuted(m) {
    muted = !!m;
    if (ac) master.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.02);
  }

  JP.Audio = { unlock, play, setMuted, get muted() { return muted; } };
})(JP);
