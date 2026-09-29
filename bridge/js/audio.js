'use strict';
// 소리. 파일 없이 WebAudio 합성음만 (다른 네 게임과 같다). 소리 장치·소리 끄기·배경 음악은 common/sound.js(SND),
// 이 파일은 슥슥 우주 다리만의 효과음(선 그리기 사각사각·선이 굳음·구슬 톡·쿵·스프링·만났다 …)만 만든다.
(function (BR) {
  const HAS = typeof SND !== 'undefined' && SND;
  let ac = null, master = null, noiseBuf = null;
  const VOL = 1.2;
  if (HAS) {
    SND.onReady(c => {
      ac = c;
      master = c.createGain();
      master.gain.value = VOL;
      master.connect(SND.out());
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    });
  }
  function unlock() { if (HAS) SND.unlock(); }
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
  function noise(t, ftype, f0, f1, dur, vol, q, attack) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = ftype; if (q) f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    env(g, t, vol, attack || 0.002, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
  const SFX = {
    // 그리는 동안: 사각사각 (아주 작게, 짧게)
    scratch: { gap: 0.07, fn(t) { noise(t, 'bandpass', 2600, 3200, 0.05, 0.05, 2.5, 0.01); } },
    // 손을 떼어 선이 굳음: 반짝 두 음 · 구슬: 톡
    line: { gap: 0.1, fn(t) { tone(t, 'triangle', 660, 660, 0.08, 0.08); tone(t + 0.07, 'triangle', 990, 990, 0.14, 0.07); } },
    dot: { gap: 0.08, fn(t) { tone(t, 'sine', 1200, 700, 0.09, 0.12); } },
    // 잉크가 다 됨 · 다시 · 지우기
    noInk: { gap: 0.4, fn(t) { tone(t, 'sine', 440, 330, 0.18, 0.08); } },
    undo: { gap: 0.1, fn(t) { noise(t, 'bandpass', 1800, 600, 0.12, 0.12, 1.2, 0.01); tone(t, 'sine', 700, 400, 0.1, 0.05); } },
    reset: { gap: 0.2, fn(t) { [784, 659, 523].forEach((f, i) => tone(t + i * 0.05, 'triangle', f, f, 0.1, 0.05)); } },
    // 출발 (첫 선): 뿅
    go: { gap: 0.3, fn(t) { tone(t, 'sine', 392, 784, 0.14, 0.1, 0.006); } },
    // 공이 부딪힘 · 선이 땅에 떨어짐: 통 · 쿵 (낮고 둥글게)
    bump: { gap: 0.12, fn(t) { tone(t, 'sine', 220, 150, 0.1, 0.07); } },
    thud: { gap: 0.15, fn(t) { tone(t, 'sine', 140, 80, 0.14, 0.1); noise(t, 'lowpass', 600, 150, 0.1, 0.06); } },
    // 스프링: 보잉
    spring: { gap: 0.2, fn(t) { tone(t, 'sine', 300, 900, 0.25, 0.12, 0.006); tone(t + 0.05, 'triangle', 600, 1400, 0.2, 0.05); } },
    // 떨어짐: 휘유~ 내려가는 소리 (무섭지 않게)
    fall: { gap: 0.5, fn(t) { tone(t, 'triangle', 880, 330, 0.5, 0.07); } },
    // 만났다: 반짝이는 오르는 화음
    win: { gap: 0.5, fn(t) { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.3, 0.08)); tone(t + 0.35, 'sine', 523, 523, 0.5, 0.06, 0.01); } },
    // 별 하나씩 (결과 화면): 한 계단씩 높게
    star: { gap: 0.1, fn(t, o) { const k = Math.pow(2, PENTA[((o && o.k) || 0) % PENTA.length] / 12); tone(t, 'triangle', 988 * k, 988 * k, 0.2, 0.09); tone(t, 'sine', 1976 * k, 1976 * k, 0.25, 0.04); } },
    // 막혔나요?: 물어보는 두 음
    stuck: { gap: 1, fn(t) { tone(t, 'sine', 660, 660, 0.12, 0.06); tone(t + 0.14, 'sine', 880, 880, 0.18, 0.06); } },
  };
  function play(name, o) {
    const s = SFX[name];
    if (!s || !HAS) return false;
    if (!SND.allow('br.' + name, s.gap)) return false;
    return SND.run(t => { if (ac) s.fn(t, o); }, name);
  }
  BR.Audio = { unlock, play, get muted() { return HAS ? SND.muted() : false; }, NAMES: Object.keys(SFX) };
})(BR);
