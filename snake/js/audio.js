'use strict';
// 소리. 파일 없이 WebAudio 합성음만 쓴다.
// 브라우저 정책상 첫 터치·클릭·키 입력 뒤에야 소리가 난다 (unlock).
(function (SN) {
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
    // 톡: 연속으로 먹을수록(5개 묶음 안에서) 음이 한 계단씩 오른다
    eat: { gap: 0.03, fn(t, o) {
      const k = Math.pow(2, ((o && o.k) || 0) * 2 / 12);
      tone(t, 'square', 520 * k, 1040 * k, 0.08, 0.16);
      tone(t, 'triangle', 1040 * k, 1560 * k, 0.1, 0.12);
    } },
    // 황금 구슬: 밝은 화음이 차례로 + 반짝이는 잡음
    gold: { gap: 0.1, fn(t) {
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.05, 'triangle', f, f, 0.32, 0.16));
      tone(t + 0.2, 'sine', 2093, 2093, 0.4, 0.06);
      noise(t, 'highpass', 6000, 9000, 0.3, 0.08);
    } },
    // 방향 전환: 아주 작은 딸깍
    turn: { gap: 0.04, fn(t) { tone(t, 'sine', 1300, 900, 0.03, 0.035); } },
    // 충돌: 아래로 떨어지는 톱니파 + 쿵
    over: { gap: 0.3, fn(t) {
      tone(t, 'sawtooth', 440, 50, 0.7, 0.22);
      tone(t, 'sine', 160, 40, 0.35, 0.4);
      noise(t, 'lowpass', 2400, 120, 0.45, 0.35);
    } },
    start: { gap: 0.2, fn(t) {
      tone(t, 'square', 392, 392, 0.08, 0.1);
      tone(t + 0.09, 'square', 784, 784, 0.12, 0.1);
    } },
    win: { gap: 0.5, fn(t) {
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(t + i * 0.08, 'triangle', f, f, 0.4, 0.14));
    } },
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

  SN.Audio = { unlock, play, setMuted, get muted() { return muted; } };
})(SN);
