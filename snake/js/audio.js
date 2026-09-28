'use strict';
// 소리. 파일 없이 WebAudio 합성음만 쓴다.
// 소리 장치(AudioContext)·끄기·잠금 풀기·배경 음악은 공통 소리(common/sound.js, SND)가 맡는다 (2026-09-27, 소유자 승인).
// 이 파일은 냠냠 뱀만의 효과음을 그려 SND.out()(효과 버스)에 잇는다. 상점·메달·결과·한 번 더 같은 소리는 SND.ui(공통 효과음).
// 크기 기준 (snake/PLAN.md 소리 절): 판 중 전체 약 -26 ~ -28 LUFS, 효과 한 개는 짧은 창 -30 ~ -52 LUFS.
// 1.3kHz 위 네모파와 5kHz 위 잡음은 쓰지 않는다 (귀가 따가움). 반짝임은 사인파 종소리로.
(function (SN) {
  const HAS = typeof SND !== 'undefined' && !!SND;
  let ac = null, master = null, noiseBuf = null;
  const last = {}; // 같은 소리 과다 재생 방지 (AudioContext 시각)
  // 게임 효과음 전체 크기. 옛 0.45(제 압축기 뒤)에서 +8dB 안팎 올림 (먹이 사슬 + 음악이 -26 ~ -28 LUFS가 되게, 2026-09-27 측정)
  const VOL = 1.1;

  if (HAS) SND.onReady(c => {
    ac = c;
    master = c.createGain();
    master.gain.value = VOL;
    master.connect(SND.out());
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    let r = 11; // 늘 같은 잡음 (재기·테스트가 흔들리지 않게)
    for (let i = 0; i < ch.length; i++) { r = (r * 16807) % 2147483647; ch[i] = r / 1073741823.5 - 1; }
  });

  function unlock() { if (HAS) SND.unlock(); }

  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(t, type, f0, f1, dur, vol, attack, detune) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (detune) o.detune.setValueAtTime(detune, t);
    env(g, t, vol, attack || 0.004, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, ftype, f0, f1, dur, vol, q) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = ftype;
    if (q) f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    env(g, t, vol, 0.004, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, (t * 7.3) % 0.5); s.stop(t + dur + 0.02);
  }
  // 종소리: 사인 기본음 + 작은 배음 (반짝임을 네모파·고역 잡음 대신)
  function bell(t, f, dur, vol) { tone(t, 'sine', f, f, dur, vol, 0.003); tone(t, 'sine', f * 2, f * 2, dur * 0.5, vol * 0.2, 0.003); }

  // 냠: 입을 벌렸다 닫는 듯 위로 살짝 휘는 세모파 + 아래 톡 + 끝에 작은 종.
  // k: 5개 묶음 안의 차례(0~4, 5음 음계로 한 계단씩), m: 콤보 배율(1~, 반음씩 조금 더 높게, 5반음까지)
  // 먹을 때마다 두 가지 입 모양과 아주 작은 흔들림(±12센트)을 번갈아 써서 똑같이 들리지 않게
  const PENTA = [0, 2, 4, 7, 9];
  let eatN = 0;
  function eatSemis(o) {
    const k = Math.max(0, Math.min(4, (o && o.k) | 0)), m = Math.max(1, (o && o.m) || 1);
    return PENTA[k] + Math.min(5, m - 1);
  }
  function eatSound(t, o) {
    const f = 494 * Math.pow(2, eatSemis(o) / 12), v = eatN++ % 2, dt = v ? 12 : -12;
    tone(t, 'triangle', f * 0.75, f * (v ? 1.06 : 1.0), 0.07, 0.24, 0.004, dt);   // 냐
    tone(t + 0.05, 'sine', f * 1.5, f * (v ? 1.4 : 1.33), 0.1, 0.13, 0.006, dt);   // 암
    tone(t, 'sine', 240, 120, 0.05, 0.18, 0.002);                                 // 톡
  }

  // gap: 같은 소리 최소 간격(초)
  const SFX = {
    eat: { gap: 0.03, fn: eatSound },
    // 황금 구슬: 밝은 화음이 차례로 + 사인 종소리 (고역 잡음 없앰)
    gold: { gap: 0.1, fn(t) {
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.05, 'triangle', f, f, 0.32, 0.11));
      bell(t + 0.2, 1568, 0.45, 0.05);
    } },
    // 방향 전환 소리는 없앴다 (1분에 60~85번이라 거슬림, 2026-09-27 소리 점검)
    // 부딪힘: 부드러운 쿵 (결과 소리는 공통 over·overSoft가 따로)
    crash: { gap: 0.3, fn(t) {
      tone(t, 'sine', 180, 55, 0.35, 0.2);
      noise(t, 'lowpass', 900, 120, 0.3, 0.18);
    } },
    // 콤보 배율 오름: 올라가는 두 음 (세모파)
    combo: { gap: 0.1, fn(t) { tone(t, 'triangle', 784, 784, 0.08, 0.16); tone(t + 0.06, 'triangle', 1175, 1175, 0.12, 0.14); } },
    // 아이템이 나타남 · 먹음
    item: { gap: 0.3, fn(t) { tone(t, 'sine', 660, 990, 0.18, 0.1); } },
    power: { gap: 0.1, fn(t) { tone(t, 'triangle', 300, 1000, 0.25, 0.12); [1047, 1319, 1568].forEach((f, i) => tone(t + 0.1 + i * 0.05, 'sine', f, f, 0.2, 0.09)); } },
    // 포털: 휘익 빨려 들어갔다 나옴
    portal: { gap: 0.08, fn(t) { tone(t, 'sine', 1400, 200, 0.18, 0.12); tone(t + 0.12, 'sine', 200, 1200, 0.16, 0.1); } },
    // 앞에 부딪힐 것이 있음: 짧은 경고음 두 번 (한 번 더 묻기에는 쓰지 않는다)
    warn: { gap: 0.6, fn(t) { tone(t, 'square', 880, 880, 0.06, 0.06); tone(t + 0.1, 'square', 880, 880, 0.06, 0.06); } },
    // 라이벌 뱀: 나오기 전 예고(우우) · 나옴(낮은 나팔) · 내 몸에 쿵(보잉) · 쉬움에서 지나감(휙) · 라이벌이 먹음(낮은 냠)
    rivalwarn: { gap: 0.5, fn(t) { tone(t, 'triangle', 330, 440, 0.18, 0.1); tone(t + 0.2, 'triangle', 330, 440, 0.18, 0.1); } },
    rival: { gap: 0.5, fn(t) { [262, 330, 392].forEach((f, i) => tone(t + i * 0.1, 'triangle', f, f, i === 2 ? 0.18 : 0.1, 0.14)); } },
    bump: { gap: 0.15, fn(t) { tone(t, 'sine', 520, 140, 0.3, 0.14); tone(t + 0.05, 'triangle', 900, 700, 0.12, 0.05); } },
    pass: { gap: 0.2, fn(t) { noise(t, 'bandpass', 1400, 500, 0.22, 0.24, 1.2); tone(t, 'sine', 700, 1100, 0.14, 0.065); } },
    // 라이벌을 물어 먹음: 와삭 (통째로면 더 크게) · 머리끼리 쿵
    bite: { gap: 0.1, fn(t) { noise(t, 'bandpass', 1800, 700, 0.12, 0.28, 1.5); tone(t, 'triangle', 600, 300, 0.1, 0.12); tone(t + 0.08, 'triangle', 880, 1320, 0.12, 0.08); } },
    biteall: { gap: 0.3, fn(t) { noise(t, 'bandpass', 1800, 500, 0.2, 0.32, 1.5); [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.1 + i * 0.06, 'triangle', f, f, 0.16, 0.12)); } },
    headbump: { gap: 0.2, fn(t) { tone(t, 'sine', 300, 120, 0.2, 0.14); } },
    rivaleat: { gap: 0.08, fn(t) { tone(t, 'triangle', 262, 330, 0.06, 0.16); tone(t + 0.05, 'triangle', 392, 330, 0.09, 0.09); } },
    // 재미 셋: 선물 상자 나타남(딸랑) · 열기(팡파르) · 피버 시작(빠르게 오르는 음계) · 피버 끝 · 거대 변신(낮게 부풂) · 벽 부숨(쾅)
    gift: { gap: 0.5, fn(t) { [1319, 1760].forEach((f, i) => bell(t + i * 0.08, f, 0.22, 0.07)); } },
    giftopen: { gap: 0.3, fn(t) { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, f, 0.16, 0.12)); bell(t + 0.3, 2093, 0.4, 0.04); } },
    fever: { gap: 0.5, fn(t) { [523, 587, 659, 784, 880, 1047, 1175, 1319].forEach((f, i) => tone(t + i * 0.045, 'triangle', f, f, 0.1, 0.1)); } },
    feverend: { gap: 0.5, fn(t) { tone(t, 'triangle', 880, 440, 0.3, 0.1); } },
    giant: { gap: 0.5, fn(t) { tone(t, 'sawtooth', 110, 330, 0.5, 0.1); tone(t + 0.1, 'triangle', 220, 660, 0.4, 0.08); } },
    smash: { gap: 0.08, fn(t) { noise(t, 'lowpass', 1500, 200, 0.25, 0.25); tone(t, 'sine', 140, 60, 0.2, 0.2); } },
    // 새 하늘(행성·블랙홀)에 도착: 반짝이는 화음
    planet: { gap: 0.5, fn(t) { [659, 880, 1175, 1568].forEach((f, i) => tone(t + i * 0.07, 'sine', f, f, 0.35, 0.07)); } },
    // 판 끝을 넘어 반대편으로 (쉬움): 부드러운 휙
    wrap: { gap: 0.08, fn(t) { noise(t, 'bandpass', 600, 1600, 0.16, 0.26, 1.2); } },
    // 황금 구슬이 식음
    cool: { gap: 0.3, fn(t) { tone(t, 'triangle', 700, 350, 0.25, 0.1); } },
    // 다음 레벨
    level: { gap: 0.3, fn(t) { tone(t, 'triangle', 392, 784, 0.2, 0.12); } },
  };
  // 공통 효과음으로 바꾼 것 (이름이 오면 SND.ui로): 스테이지 깸·판 가득·대왕 뱀 쓰러뜨림은 팡파르 (대왕 뱀은 와삭 + 팡파르)
  const UI = { clear: 'fanfare', win: 'fanfare', bossdown: 'fanfare', medal: 'medal', coin: 'coin', buy: 'buy', deny: 'deny', claim: 'claim',
    pick: 'tap', tap: 'tap', open: 'open', close: 'close', start: 'start', over: 'over', overSoft: 'overSoft',
    continueAsk: 'continueAsk', continueGo: 'continueGo', tick: 'tick', fanfare: 'fanfare' };
  // 소리 없는 사건: turn(방향 전환) · revive(한 번 더는 continueGo가 맡는다) · giftgone
  const SILENT = { turn: 1, revive: 1, giftgone: 1 };

  function play(name, o) {
    if (!HAS || SILENT[name]) return false;
    if (UI[name]) {
      if (name === 'bossdown') play('biteall');
      return SND.ui(UI[name], o);
    }
    const s = SFX[name];
    if (!s) return false;
    if (SND.muted() || !SND.fxOn()) return false;   // 꺼져 있으면 소리를 그리지 않는다 (배터리)
    // 같은 소리 간격: 소리 장치 시각으로 (아직 잠겨 있으면 SND.run이 같은 이름을 하나만 기다리게 한다)
    if (ac && SND.ready()) {
      const now = ac.currentTime;
      if (last[name] != null && now - last[name] < s.gap && now >= last[name]) return false;
      last[name] = now;
    }
    return SND.run(t => { if (master) s.fn(t, o); }, 'sn.' + name);
  }

  // 옛 손잡이 (끄기는 네 게임 공통 SND)
  function setMuted(m) { if (HAS) SND.setMuted(m); }

  SN.Audio = { unlock, play, setMuted, get muted() { return HAS ? SND.muted() : false; }, eatSemis, SFX_NAMES: Object.keys(SFX), UI_MAP: UI, SILENT };
})(SN);
