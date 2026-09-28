'use strict';
// 소리. 파일 없이 WebAudio 합성음만 쓴다 (2026-09-27 소유자 승인: 합성음만).
// 소리 장치는 네 게임이 함께 쓰는 common/sound.js(SND)의 것을 빌려 쓴다: AudioContext·리미터·소리 끄기·배경 음악은 SND,
// 이 파일은 슝슝 우주 달리기만의 효과음(줄 바꾸기·점프·별·블랙홀·해적선 …)만 만든다.
// 상점·메달·시작·끝·한 번 더 같은 화면 소리는 SND.ui 공통 소리(main.js)를 쓴다.
// 소리 크기 기준 (OfflineAudioContext로 잰 값, runner/PLAN.md 소리 절): 판 중 효과+음악 약 -27 LUFS, 봉우리 -1dBFS 아래.
(function (RN) {
  const HAS = typeof SND !== 'undefined' && SND;
  let ac = null, master = null, noiseBuf = null;
  // 게임 효과음 전체 크기. SND 효과 버스로 들어간다 (예전 0.45 + 압축기 → 공통 리미터 앞에서 크기를 직접 맞춘다)
  const VOL = 1.3;
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];   // 5음계 (반음 수)

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

  // 걸러 낸 바람 소리. q: 필터 좁기(쉭 하는 결), attack: 부드럽게 커지는 시간
  function noise(t, ftype, f0, f1, dur, vol, q, attack) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = ftype;
    if (q) f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    env(g, t, vol, attack || 0.002, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // 별이 몰려 올 때(1초에 여러 개) 조금씩 작게: 1분에 150개 가까이 먹어도 귀가 피곤하지 않게
  const starTimes = [];
  function starDensity(now) {
    while (starTimes.length && now - starTimes[0] > 1) starTimes.shift();
    starTimes.push(now);
    return starTimes.length;
  }

  // gap: 같은 소리 최소 간격(초)
  const SFX = {
    // 줄 바꾸기: 쉭 (부드럽게 부푸는 바람 + 아주 작은 올라가는 음)
    lane: { gap: 0.05, fn(t) { noise(t, 'bandpass', 700, 1700, 0.14, 0.34, 1.4, 0.025); tone(t, 'sine', 440, 660, 0.09, 0.06, 0.01); } },
    // 점프: 뿅 올라가는 둥근 소리 + 위로 쓱 · 착지: 폭신한 툭
    jump: { gap: 0.08, fn(t) {
      tone(t, 'sine', 392, 880, 0.15, 0.17, 0.006); tone(t, 'triangle', 523, 1047, 0.12, 0.06, 0.006);
      noise(t, 'bandpass', 500, 1500, 0.12, 0.11, 1.2, 0.02);
    } },
    land: { gap: 0.08, fn(t) { tone(t, 'sine', 170, 85, 0.11, 0.15, 0.004); noise(t, 'lowpass', 900, 200, 0.07, 0.08); } },
    // 미끄러지기: 쓱 내려가는 바람 · 빠르게 내려오기: 쉭 뚝 · 막대 밑을 지남: 낮은 두 음
    slide: { gap: 0.08, fn(t) { noise(t, 'bandpass', 2000, 600, 0.22, 0.26, 1.2, 0.02); tone(t, 'sine', 700, 300, 0.14, 0.08); } },
    drop: { gap: 0.08, fn(t) { noise(t, 'bandpass', 1600, 450, 0.11, 0.3, 1.3, 0.015); tone(t, 'sine', 700, 280, 0.1, 0.12); } },
    bar: { gap: 0.1, fn(t) { tone(t, 'triangle', 660, 660, 0.06, 0.08); tone(t + 0.06, 'triangle', 440, 440, 0.1, 0.08); } },
    // 블랙홀: 낮게 우웅 · 끌어당긴다는 알림: 위아래로 흔들리는 소리 · 끌려감: 휘익 · 버팀: 밝은 두 음 · 빠져나옴: 올라가는 화음
    bh: { gap: 1, fn(t) { tone(t, 'sine', 90, 55, 1.2, 0.09); tone(t, 'triangle', 180, 110, 1.0, 0.03); noise(t, 'lowpass', 400, 120, 1.0, 0.045); } },
    pullWarn: { gap: 0.4, fn(t) { tone(t, 'sine', 300, 200, 0.25, 0.09); tone(t + 0.25, 'sine', 300, 200, 0.25, 0.09); } },
    pull: { gap: 0.3, fn(t) { noise(t, 'bandpass', 500, 2200, 0.3, 0.2, 1.2, 0.03); tone(t, 'sine', 220, 440, 0.25, 0.08); } },
    // 끌려가지 않고 제자리 (끝 줄이거나 옆 줄이 막혀서): 부드러운 낮은 웅 (알림이 헛것처럼 끝나지 않게)
    pullHold: { gap: 0.3, fn(t) { tone(t, 'sine', 110, 82, 0.35, 0.07, 0.05); tone(t, 'triangle', 220, 165, 0.25, 0.015, 0.04); } },
    resist: { gap: 0.3, fn(t) { tone(t, 'triangle', 988, 988, 0.08, 0.09); tone(t + 0.08, 'triangle', 1319, 1319, 0.14, 0.09); } },
    // 우주 해적선: 뿌우 뱃고동 · 레이저 경고 삐삐(둥근 세모파) · 레이저 지잉 · 폭탄 휘잉 · 따돌림 팡파르
    pirate: { gap: 1, fn(t) { tone(t, 'sawtooth', 196, 196, 0.5, 0.045); tone(t + 0.5, 'sawtooth', 147, 147, 0.7, 0.045); tone(t, 'sine', 98, 98, 1.2, 0.08); } },
    laserWarn: { gap: 0.3, fn(t) { [0, 0.18, 0.36].forEach(d => tone(t + d, 'triangle', 1175, 1175, 0.08, 0.1)); } },
    laser: { gap: 0.2, fn(t) { tone(t, 'sawtooth', 1200, 300, 0.35, 0.06); noise(t, 'bandpass', 2400, 700, 0.35, 0.08); } },
    bomb: { gap: 0.3, fn(t) { tone(t, 'sine', 1400, 500, 0.5, 0.05); } },
    pirOut: { gap: 1, fn(t) { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.08, 'triangle', f, f, 0.3, 0.08)); noise(t + 0.3, 'bandpass', 3000, 4500, 0.5, 0.03, 1); } },
    bhOut: { gap: 0.5, fn(t) { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.22, 0.08)); } },
    // 레이저 문을 넘음: 짧은 두 음
    gate: { gap: 0.1, fn(t) { tone(t, 'triangle', 880, 880, 0.06, 0.08); tone(t + 0.06, 'triangle', 1320, 1320, 0.08, 0.08); } },
    // 별: 띵. 이어 먹을수록(10개 묶음 안에서) 5음계로 한 계단씩 오른다 (어떤 순서로 겹쳐도 듣기 좋게).
    // 같은 계단도 조금씩 다르게(±12센트), 몰려 오면 조금 작게
    star: { gap: 0.06, fn(t, o) {
      const k = Math.pow(2, (PENTA[((o && o.k) || 0) % PENTA.length] + (Math.random() - 0.5) * 0.24) / 12);
      const n = starDensity(t), v = n > 4 ? 0.75 : 1;
      tone(t, 'triangle', 880 * k, 1320 * k, 0.07, 0.07 * v);
      tone(t, 'sine', 1760 * k, 1760 * k, 0.14, 0.06 * v);
    } },
    // 별 한 줄을 모두 먹음: 첫 번과 세 번마다 반짝이는 올라가는 화음 (특별하게), 나머지는 작은 두 음
    perfect: { gap: 0.2, fn(t, o) {
      const n = (o && o.n) || 1;
      if (n === 1 || n % 3 === 0) {
        [1047, 1319, 1568, 2093].forEach((f, i) => tone(t + 0.05 + i * 0.055, 'triangle', f, f, 0.22, 0.036));
        tone(t + 0.22, 'sine', 523, 523, 0.3, 0.035, 0.01);
      } else {
        tone(t + 0.05, 'triangle', 1319, 1319, 0.12, 0.035); tone(t + 0.1, 'triangle', 1760, 1760, 0.16, 0.03);
      }
    } },
    // 아슬아슬: 휙 지나가는 바람 + 짧은 높은 음
    near: { gap: 0.3, fn(t) { noise(t, 'bandpass', 2600, 700, 0.22, 0.14, 1.2, 0.01); tone(t + 0.05, 'sine', 1400, 1900, 0.1, 0.05); } },
    // 기념 아치: 딩동 두 음
    milestone: { gap: 0.3, fn(t) { tone(t, 'triangle', 1175, 1175, 0.18, 0.08); tone(t + 0.14, 'triangle', 1568, 1568, 0.3, 0.08); tone(t + 0.14, 'sine', 784, 784, 0.3, 0.06); } },
    // 새 구역 도착: 작은 팡파르 (구역마다 조가 다르다). 둥근 세모파, 끝에 부드러운 반짝
    zone: { gap: 0.5, fn(t, o) {
      const k = Math.pow(2, [0, 2, 4, 5, 7, 9, 7, 4, 2, 12][((o && o.i) || 0) % 10] / 12);
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, 'triangle', f * k, f * k, i === 3 ? 0.45 : 0.12, 0.06));
      [523, 659, 784].forEach(f => tone(t + 0.33, 'sine', f * k, f * k, 0.6, 0.04));
      noise(t + 0.33, 'bandpass', 3000, 4500, 0.5, 0.025, 1);
    } },
    // 하트 채움: 따뜻한 두 음
    heal: { gap: 0.2, fn(t) { tone(t, 'sine', 523, 523, 0.2, 0.1); tone(t + 0.12, 'sine', 784, 784, 0.35, 0.1); tone(t + 0.12, 'triangle', 1568, 1568, 0.25, 0.03); } },
    // 처음 안내: 다음 단계 · 잘했어요 · 괜찮아요
    tutStep: { gap: 0.2, fn(t) { tone(t, 'sine', 880, 880, 0.1, 0.08); tone(t + 0.09, 'sine', 1175, 1175, 0.16, 0.08); } },
    tutDone: { gap: 0.3, fn(t) { [784, 988, 1175, 1568].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.25, 0.08)); } },
    tutMiss: { gap: 0.3, fn(t) { tone(t, 'sine', 660, 520, 0.2, 0.08); tone(t + 0.16, 'sine', 660, 660, 0.18, 0.06); } },
    // 아이템이 멀리서 나타남 · 먹음
    item: { gap: 0.3, fn(t) { tone(t, 'sine', 660, 990, 0.18, 0.07); tone(t + 0.1, 'sine', 990, 1320, 0.16, 0.05); } },
    power: { gap: 0.1, fn(t) { tone(t, 'triangle', 300, 1200, 0.25, 0.08); [1047, 1319, 1568].forEach((f, i) => tone(t + 0.1 + i * 0.05, 'triangle', f, f, 0.2, 0.08)); } },
    // 부스트: 부우웅 솟구치는 소리 + 반짝
    boost: { gap: 0.2, fn(t) {
      tone(t, 'sawtooth', 110, 660, 0.5, 0.08); noise(t, 'bandpass', 400, 3000, 0.6, 0.14, 1, 0.05);
      [784, 1047, 1319, 1568].forEach((f, i) => tone(t + 0.15 + i * 0.05, 'triangle', f, f, 0.2, 0.06));
    } },
    // 부스트로 부숨: 퍽
    smash: { gap: 0.06, fn(t) { noise(t, 'lowpass', 2400, 200, 0.2, 0.25); tone(t, 'triangle', 220, 80, 0.12, 0.1); } },
    // 부딪힘 (하트 하나): 둥근 쿵 + 뾰로롱 내려가는 소리 (무섭지 않게, 거친 톱니파 없이)
    hit: { gap: 0.3, fn(t) { tone(t, 'sine', 200, 70, 0.28, 0.2); noise(t, 'lowpass', 1500, 150, 0.25, 0.11); tone(t + 0.05, 'triangle', 660, 330, 0.25, 0.07); } },
    // 마지막 하트: 쿵만 (끝 알림은 main.js가 공통 SND.ui over·overSoft로)
    crash: { gap: 0.3, fn(t) { tone(t, 'sine', 180, 60, 0.35, 0.2); noise(t, 'lowpass', 1200, 120, 0.3, 0.11); } },
    // 방패가 깨짐: 유리 깨지는 반짝 (높은 쉿 소리는 줄였다)
    shield: { gap: 0.2, fn(t) { noise(t, 'bandpass', 2500, 5000, 0.3, 0.1, 1); [1568, 1175, 1568].forEach((f, i) => tone(t + i * 0.05, 'triangle', f, f, 0.14, 0.07)); } },
    // 불사조 부활: 아래에서 위로 솟는 불꽃 소리
    revive: { gap: 0.5, fn(t) { tone(t, 'sine', 330, 990, 0.45, 0.09); [784, 1047, 1319, 1568].forEach((f, i) => tone(t + 0.1 + i * 0.06, 'triangle', f, f, 0.2, 0.065)); noise(t, 'bandpass', 800, 3000, 0.4, 0.06, 1, 0.05); } },
    // 깜짝 선물 상자: 멀리서 나타남(작은 방울 소리) · 열었다(리본 푸는 소리 + 반짝 화음)
    giftHere: { gap: 0.5, fn(t) { [1568, 2093, 1568].forEach((f, i) => tone(t + i * 0.09, 'sine', f, f, 0.14, 0.05)); } },
    gift: { gap: 0.3, fn(t) {
      noise(t, 'bandpass', 1500, 4000, 0.18, 0.1, 1, 0.02);
      [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(t + 0.08 + i * 0.06, 'triangle', f, f, 0.26, 0.065));
      tone(t + 0.4, 'sine', 1976, 1976, 0.08, 0.04); tone(t + 0.45, 'sine', 2637, 2637, 0.12, 0.03);
    } },
    // 피버 시작: 계단처럼 빠르게 오르는 음 (둥근 세모파) · 끝: 부드럽게 내려오는 두 음. 피버 박자는 배경 음악(SND fever)이 맡는다
    fever: { gap: 0.5, fn(t) { [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(t + i * 0.05, 'triangle', f, f, 0.12, 0.07)); noise(t + 0.3, 'bandpass', 3000, 4500, 0.4, 0.03, 1); } },
    feverEnd: { gap: 0.5, fn(t) { tone(t, 'triangle', 1047, 1047, 0.15, 0.07); tone(t + 0.12, 'triangle', 784, 784, 0.25, 0.07); } },
    // 워프 관문: 멀리서 나타남(윙윙 떨리는 음) · 들어감(솟구치는 바람 휘잉) · 나옴(뿅)
    warpHere: { gap: 0.5, fn(t) { tone(t, 'sine', 440, 880, 0.3, 0.05); tone(t + 0.15, 'sine', 660, 1320, 0.3, 0.04); } },
    warp: { gap: 0.5, fn(t) { tone(t, 'triangle', 160, 1400, 0.9, 0.08); noise(t, 'bandpass', 300, 4000, 1.2, 0.16, 1, 0.15); tone(t + 0.2, 'sine', 880, 1760, 0.6, 0.05); } },
    warpOut: { gap: 0.5, fn(t) { noise(t, 'lowpass', 3000, 300, 0.3, 0.1); tone(t, 'triangle', 1319, 659, 0.25, 0.08); } },
  };

  // 게임 효과음. 같은 이름은 gap초 안에 한 번만. 소리 끄기·잠금은 SND가 맡는다 (잠겨 있으면 0.5초까지 기다렸다 튼다)
  function play(name, o) {
    const s = SFX[name];
    if (!s || !HAS) return false;
    if (!SND.allow('rn.' + name, s.gap)) return false;
    return SND.run(t => { if (ac) s.fn(t, o); }, name);
  }

  // 옛 손잡이 (소리 끄기는 이제 SND 하나로. 네 게임·첫 화면이 같이 쓴다)
  function setMuted(m) { if (HAS) SND.setMuted(!!m); }

  RN.Audio = { unlock, play, setMuted, get muted() { return HAS ? SND.muted() : false; }, NAMES: Object.keys(SFX) };
})(RN);
