'use strict';
// 소리. 파일 없이 WebAudio 합성음만 쓴다.
// 브라우저 정책상 첫 터치·클릭·키 입력 뒤에야 소리가 난다 (unlock).
(function (RN) {
  let ac = null, master = null, noiseBuf = null;
  let muted = false;
  const last = {};   // 같은 소리 과다 재생 방지
  const VOL = 0.45;
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];   // 5음계 (반음 수)

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
    // 줄 바꾸기: 휙 (바람 소리)
    lane: { gap: 0.05, fn(t) { noise(t, 'bandpass', 900, 2600, 0.12, 0.12); tone(t, 'sine', 500, 800, 0.08, 0.04); } },
    // 점프: 뿅 올라가는 소리 · 착지: 작은 툭
    jump: { gap: 0.08, fn(t) { tone(t, 'square', 330, 880, 0.14, 0.09); tone(t, 'sine', 660, 1320, 0.12, 0.06); } },
    land: { gap: 0.08, fn(t) { tone(t, 'sine', 180, 90, 0.08, 0.1); } },
    // 레이저 문을 넘음: 짧은 두 음
    gate: { gap: 0.1, fn(t) { tone(t, 'triangle', 880, 880, 0.06, 0.08); tone(t + 0.06, 'triangle', 1320, 1320, 0.08, 0.08); } },
    // 별: 띵. 이어 먹을수록(10개 묶음 안에서) 5음계로 한 계단씩 오른다 (어떤 순서로 겹쳐도 듣기 좋게)
    star: { gap: 0.025, fn(t, o) {
      const k = Math.pow(2, PENTA[((o && o.k) || 0) % PENTA.length] / 12);
      tone(t, 'triangle', 880 * k, 1320 * k, 0.07, 0.08);
      tone(t, 'sine', 1760 * k, 1760 * k, 0.14, 0.07);
    } },
    // 별 한 줄을 모두 먹음: 반짝이는 올라가는 화음
    perfect: { gap: 0.2, fn(t) { [1047, 1319, 1568, 2093].forEach((f, i) => tone(t + 0.05 + i * 0.055, 'triangle', f, f, 0.22, 0.09)); noise(t + 0.05, 'highpass', 6000, 9000, 0.25, 0.04); } },
    // 아슬아슬: 휙 지나가는 바람 + 짧은 높은 음
    near: { gap: 0.3, fn(t) { noise(t, 'bandpass', 3000, 700, 0.22, 0.12); tone(t + 0.05, 'sine', 1400, 1900, 0.1, 0.05); } },
    // 기념 아치: 딩동 두 음
    milestone: { gap: 0.3, fn(t) { tone(t, 'triangle', 1175, 1175, 0.18, 0.1); tone(t + 0.14, 'triangle', 1568, 1568, 0.3, 0.1); tone(t + 0.14, 'sine', 784, 784, 0.3, 0.06); } },
    // 새 구역 도착: 작은 팡파르 (구역마다 조가 다르다)
    zone: { gap: 0.5, fn(t, o) {
      const k = Math.pow(2, [0, 2, 4, 7][((o && o.i) || 0) % 4] / 12);
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, 'square', f * k, f * k, i === 3 ? 0.45 : 0.12, 0.07));
      [523, 659, 784].forEach(f => tone(t + 0.33, 'triangle', f * k, f * k, 0.6, 0.07));
      noise(t + 0.33, 'highpass', 5000, 9000, 0.5, 0.04);
    } },
    // 하트 채움: 따뜻한 두 음
    heal: { gap: 0.2, fn(t) { tone(t, 'sine', 523, 523, 0.2, 0.12); tone(t + 0.12, 'sine', 784, 784, 0.35, 0.12); tone(t + 0.12, 'triangle', 1568, 1568, 0.25, 0.04); } },
    // 처음 안내: 다음 단계 · 잘했어요 · 괜찮아요
    tutStep: { gap: 0.2, fn(t) { tone(t, 'sine', 880, 880, 0.1, 0.08); tone(t + 0.09, 'sine', 1175, 1175, 0.16, 0.08); } },
    tutDone: { gap: 0.3, fn(t) { [784, 988, 1175, 1568].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.25, 0.1)); } },
    tutMiss: { gap: 0.3, fn(t) { tone(t, 'sine', 660, 520, 0.2, 0.08); tone(t + 0.16, 'sine', 660, 660, 0.18, 0.06); } },
    // 아이템이 멀리서 나타남 · 먹음
    item: { gap: 0.3, fn(t) { tone(t, 'sine', 660, 990, 0.18, 0.07); tone(t + 0.1, 'sine', 990, 1320, 0.16, 0.05); } },
    power: { gap: 0.1, fn(t) { tone(t, 'sawtooth', 300, 1200, 0.25, 0.09); [1047, 1319, 1568].forEach((f, i) => tone(t + 0.1 + i * 0.05, 'triangle', f, f, 0.2, 0.1)); } },
    // 부스트: 부우웅 솟구치는 소리 + 반짝
    boost: { gap: 0.2, fn(t) {
      tone(t, 'sawtooth', 110, 660, 0.5, 0.12); noise(t, 'bandpass', 400, 4000, 0.6, 0.14);
      [784, 1047, 1319, 1568].forEach((f, i) => tone(t + 0.15 + i * 0.05, 'triangle', f, f, 0.2, 0.08));
    } },
    // 부스트로 부숨: 퍽
    smash: { gap: 0.06, fn(t) { noise(t, 'lowpass', 3000, 200, 0.2, 0.25); tone(t, 'square', 220, 80, 0.12, 0.08); } },
    // 부딪힘 (하트 하나): 둥근 쿵 + 뾰로롱 내려가는 소리 (무섭지 않게, 거친 톱니파 없이)
    hit: { gap: 0.3, fn(t) { tone(t, 'sine', 200, 70, 0.28, 0.32); noise(t, 'lowpass', 1500, 150, 0.25, 0.2); tone(t + 0.05, 'triangle', 660, 330, 0.25, 0.08); } },
    // 방패가 깨짐: 유리 깨지는 반짝
    shield: { gap: 0.2, fn(t) { noise(t, 'highpass', 3000, 8000, 0.35, 0.18); [1568, 1175, 1568].forEach((f, i) => tone(t + i * 0.05, 'triangle', f, f, 0.14, 0.08)); } },
    // 끝: 아래로 떨어지는 톱니파 + 쿵
    over: { gap: 0.3, fn(t) { tone(t, 'sawtooth', 440, 50, 0.7, 0.2); tone(t, 'sine', 160, 40, 0.4, 0.4); noise(t, 'lowpass', 2400, 120, 0.5, 0.35); } },
    start: { gap: 0.2, fn(t) { tone(t, 'square', 392, 392, 0.08, 0.1); tone(t + 0.09, 'square', 523, 523, 0.08, 0.1); tone(t + 0.18, 'square', 784, 784, 0.14, 0.1); } },
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

  RN.Audio = { unlock, play, setMuted, get muted() { return muted; } };
})(RN);
