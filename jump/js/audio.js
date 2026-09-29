'use strict';
// 소리. 파일 없이 WebAudio 합성음만 쓴다 (2026-09-27 공통 소리 common/sound.js의 SND에 붙음).
//   소리 판(AudioContext)·잠금 풀기·끄기·마지막 리미터는 SND가 맡고, 여기는 통통 점프만의 효과음과 배경 음악 고르기만 한다.
//   메달·보상 받기·사기·안 됨·코인·고르기·시작·끝·신기록·한 번 더는 네 게임 공통 소리(SND.ui)를 쓴다.
// 소리 크기 (2026-09-27 측정, jump/PLAN.md "소리"): 판 중 통통+별+음악이 약 -27 LUFS, 효과 하나는 짧은 창 -30 ~ -44 LUFS.
//   소리마다 db(데시벨)로 크기를 맞춘다. 통은 1분에 70번 넘게 나므로 부드러운 사인, 별은 통보다 3dB쯤 작게.
(function (JP) {
  const S = typeof SND !== 'undefined' && SND ? SND : null;
  let ac = null, master = null, noiseBuf = null;
  let lv = 1;                // 지금 그리는 소리의 크기 배율 (SFX[이름].db)
  const last = {};           // 같은 소리 과다 재생 방지 (소리 판 시간 기준)
  const VOL = 1.35;          // 게임 전체 크기 (예전 0.45 + 압축기 → 공통 버스에 맞춰 올림)
  // 통 소리 음계 (반음 수): 도레미솔라 두 옥타브
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  let flip = false, bounceN = 0;
  let starK = 0, starAt = -9;   // 별을 잇달아 먹으면 한 칸씩 높게

  if (S) S.onReady(c => {
    ac = c;
    master = c.createGain();
    master.gain.value = VOL;
    master.connect(S.out());
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    let r = 11;
    for (let i = 0; i < ch.length; i++) { r = (r * 16807) % 2147483647; ch[i] = r / 1073741823.5 - 1; }
  });

  function unlock() { if (S) S.unlock(); }

  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * lv), t + attack);
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
    return o;
  }

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
  // 작은 종: 사인 + 아주 작은 배음 (날카로운 네모파·높은 잡음 대신)
  function bell(t, f, dur, vol) { tone(t, 'sine', f, f, dur, vol, 0.004); tone(t, 'sine', f * 2, f * 2, dur * 0.5, vol * 0.2, 0.004); }

  // gap: 같은 소리 최소 간격(초) · db: 크기 (0이면 그대로)
  const SFX = {
    // 통: 이어서 더 높은 발판을 밟을수록(콤보) 5음계를 따라 한 칸씩 오른다 (두 옥타브에서 다시 처음으로).
    // 1분에 70번 넘게 나므로 질리지 않게: 음높이·크기·길이를 아주 조금씩 흔들고, 두 가지 울림을 번갈아, 네 번에 한 번은 살짝 짧고 낮게
    bounce: { gap: 0.04, db: 0, fn(t, o) {
      const c = (o && o.k) || 0, step = PENTA[c % PENTA.length];
      const k = Math.pow(2, step / 12) * (1 + (Math.random() - 0.5) * 0.03);
      const v = 1 + (Math.random() - 0.5) * 0.2, n = bounceN++ % 4;
      const d = n === 3 ? 0.105 : 0.115 + Math.random() * 0.02;
      tone(t, 'sine', 290 * k * (n === 3 ? 0.97 : 1), 600 * k, d, 0.19 * v, 0.006);
      if ((flip = !flip)) tone(t, 'triangle', 600 * k, 880 * k, 0.07, 0.05 * v);
      else tone(t + 0.01, 'sine', 870 * k, 1180 * k, 0.06, 0.04 * v);
      // 피버 중: 한 옥타브 위 작은 종 두 음 (신나게, 날카롭지 않게)
      if (o && o.fever) { bell(t + 0.04, 1320 * k, 0.08, 0.035); bell(t + 0.08, 1760 * k, 0.09, 0.03); }
    } },
    // 별: 반짝 두 음. 잇달아 먹으면(0.9초 안) 한 칸씩 높아진다 (5음계 여덟 칸). 통보다 3dB쯤 작게
    star: { gap: 0.03, db: 1, fn(t, o) {
      const c = o && o.k != null ? o.k : 0, k = Math.pow(2, PENTA[Math.min(7, c)] / 12);
      tone(t, 'sine', 1319 * k, 1319 * k, 0.06, 0.07);
      tone(t + 0.045, 'triangle', 1976 * k, 2637 * k, 0.13, 0.07);
    } },
    // 구역 도착: 반짝이는 오르는 화음 + 부드러운 바람
    zone: { gap: 0.5, db: -10, fn(t) {
      noise(t, 'bandpass', 800, 3200, 0.9, 0.06, 0, 0.3);
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.08, 'triangle', f, f, 0.45, 0.12));
      tone(t + 0.42, 'sine', 1568, 2093, 0.5, 0.08);
    } },
    // 행성 도착: 우주 느낌의 반짝이는 화음 (구역 소리보다 짧게)
    planet: { gap: 0.5, db: -9, fn(t) {
      [392, 587, 784, 1175].forEach((f, i) => tone(t + i * 0.07, 'sine', f, f * 1.003, 0.5, 0.1));
      tone(t + 0.3, 'triangle', 1568, 1568, 0.4, 0.05);
    } },
    // 여정 배너 (구름 속 · 높은 하늘 · 대기권 돌파): 쉬익 바람 + 오르는 두 음
    leg: { gap: 0.5, db: -5, fn(t) {
      noise(t, 'bandpass', 600, 2600, 0.7, 0.06, 0, 0.25);
      tone(t + 0.05, 'sine', 659, 659, 0.3, 0.09);
      tone(t + 0.15, 'sine', 988, 988, 0.4, 0.09);
    } },
    // 블랙홀 구간: 우웅 하고 빨려 드는 소리
    hole: { gap: 1, db: -8, fn(t) { tone(t, 'sine', 220, 70, 1.1, 0.14); noise(t, 'bandpass', 900, 200, 1, 0.08); } },
    // 깜짝 선물: 딸랑 + 반짝이는 오름 화음 (높은 잡음 대신 작은 종)
    gift: { gap: 0.3, db: -8, fn(t) {
      [784, 988, 1175, 1568].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, f, 0.25, 0.12));
      bell(t + 0.26, 2093, 0.3, 0.05);
    } },
    // 피버 시작: 빠른 팡파르 (세모파) · 끝: 내려오는 두 음
    fever: { gap: 0.5, db: -6, fn(t) { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.055, 'triangle', f, f, 0.14, 0.1)); } },
    feverEnd: { gap: 0.5, db: -4, fn(t) { tone(t, 'triangle', 988, 988, 0.12, 0.08); tone(t + 0.1, 'triangle', 659, 659, 0.2, 0.08); } },
    // 비밀 방: 들어갈 때 신비한 화음 · 나올 때 짧은 딩동
    room: { gap: 0.5, db: -10, fn(t) { [440, 554, 659, 880, 1109].forEach((f, i) => tone(t + i * 0.09, 'sine', f, f * 1.004, 0.6, 0.1)); } },
    roomEnd: { gap: 0.5, db: -6, fn(t) { tone(t, 'sine', 1175, 1175, 0.2, 0.1); tone(t + 0.12, 'sine', 880, 880, 0.3, 0.1); } },
    // 100m 눈금: 딩동 두 음
    mile: { gap: 0.4, db: -9, fn(t) {
      tone(t, 'sine', 1047, 1047, 0.3, 0.13);
      tone(t + 0.11, 'sine', 1568, 1568, 0.45, 0.13);
      tone(t + 0.11, 'sine', 3136, 3136, 0.2, 0.02);
    } },
    // 처음 안내를 다 해 냈을 때
    tut: { gap: 0.4, db: -6, fn(t) { [659, 784, 1047].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.25, 0.12)); } },
    // 스프링: 뿌잉 하고 떨리며 올라간다
    spring: { gap: 0.1, db: -5, fn(t) {
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
    // 로켓: 쉬익 하는 바람 + 올라가는 소리 + 반짝 세 음
    rocket: { gap: 0.3, db: -7, fn(t) {
      noise(t, 'bandpass', 400, 3000, 1.6, 0.2, 0.8, 0.15);
      tone(t, 'sawtooth', 110, 660, 1.4, 0.05, 0.05);
      [523, 784, 1047].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, f, 0.18, 0.08));
    } },
    // 워프 출발 (구름 위·우주·외계 행성에서 시작): 발사대에서 슈우웅 올라가는 로켓 바람 (로켓 아이템보다 짧고 부드럽게)
    warp: { gap: 0.5, db: -6, fn(t) {
      noise(t, 'bandpass', 250, 2400, 1.1, 0.22, 0.9, 0.35);
      noise(t, 'lowpass', 180, 90, 0.5, 0.18, 0, 0.02);
      tone(t, 'triangle', 90, 520, 1.0, 0.1, 0.12);
      tone(t + 0.1, 'sine', 180, 1040, 0.9, 0.05, 0.1);
      bell(t + 0.75, 1568, 0.35, 0.04);
    } },
    // 방패 방울을 먹음 · 방울이 지켜 줌(퐁)
    shield: { gap: 0.2, db: -3, fn(t) { tone(t, 'sine', 500, 1000, 0.25, 0.12); tone(t + 0.08, 'sine', 1000, 1500, 0.2, 0.08); } },
    save: { gap: 0.2, db: -4, fn(t) { tone(t, 'sine', 1400, 300, 0.2, 0.16); noise(t, 'bandpass', 2600, 1800, 0.12, 0.06, 1.2); } },
    // 몬스터 밟기: 뽁 눌리는 소리 + 뿅 올라가는 소리
    stomp: { gap: 0.05, db: -4, fn(t) {
      tone(t, 'triangle', 320, 110, 0.08, 0.14);
      noise(t, 'lowpass', 1200, 300, 0.08, 0.12);
      tone(t + 0.05, 'triangle', 420, 1260, 0.2, 0.13);
      tone(t + 0.12, 'sine', 1568, 1976, 0.12, 0.06);
    } },
    // 쉬움에서 몬스터에 살짝 부딪힘: 부드러운 "앗" (다치지 않는다)
    bump: { gap: 0.2, db: 0, fn(t) { tone(t, 'sine', 700, 420, 0.12, 0.1); tone(t + 0.04, 'triangle', 560, 360, 0.1, 0.05); } },
    // 먹구름이 처음 보일 때: 낮게 우르릉
    storm: { gap: 1, db: -8, fn(t) { noise(t, 'lowpass', 300, 80, 1.2, 0.22, 0, 0.2); tone(t, 'sine', 70, 45, 1.1, 0.16, 0.1); } },
    // 부서지는 발판: 바삭
    crumble: { gap: 0.08, db: 0, fn(t) { noise(t, 'bandpass', 2400, 500, 0.22, 0.2); tone(t, 'triangle', 180, 90, 0.1, 0.07); } },
    // 구조 구름이 받아 줌: 부드럽게 올라가는 화음
    rescue: { gap: 0.3, db: -8, fn(t) {
      noise(t, 'lowpass', 900, 300, 0.4, 0.12);
      [392, 523, 659, 784].forEach((f, i) => tone(t + 0.05 + i * 0.07, 'sine', f, f, 0.3, 0.12));
    } },
    // 아이템이 나타남
    item: { gap: 0.3, db: 0, fn(t) { tone(t, 'sine', 660, 990, 0.18, 0.08); } },
    // ─── 펫 (2026-09-29): 별 소리(db 1)보다 약 6dB 작게, 짧고 부드럽게 ───
    // 펫이 별을 주워 옴: 작은 "삐롱" (사인 두 음, 별보다 한 칸 낮게)
    petStar: { gap: 0.08, db: -5, fn(t) { tone(t, 'sine', 1175, 1175, 0.05, 0.07); tone(t + 0.04, 'sine', 1568, 1976, 0.1, 0.06); } },
    // 펫 응원 (밟기·아슬아슬·신기록·새 장소): "삐요!" 두 음 오르고 작은 종
    petCheer: { gap: 0.5, db: -6, fn(t) { tone(t, 'triangle', 988, 1319, 0.09, 0.08); tone(t + 0.08, 'sine', 1319, 1760, 0.12, 0.07); bell(t + 0.16, 2093, 0.14, 0.025); } },
    // 아기 해파리 폴짝: 부드러운 "보잉" 한 번 더
    petBoost: { gap: 0.3, db: -5, fn(t) { tone(t, 'sine', 330, 990, 0.22, 0.12, 0.008); tone(t + 0.06, 'triangle', 660, 1320, 0.12, 0.04); } },
    // 꼬마 UFO 톡: "뿅" 하고 작게 터지는 소리
    petZap: { gap: 0.3, db: -5, fn(t) { tone(t, 'sine', 1400, 500, 0.14, 0.1); noise(t + 0.02, 'lowpass', 1400, 400, 0.08, 0.06); bell(t + 0.08, 1760, 0.1, 0.03); } },
    // 떨어짐 (보통·어려움): 휘이잉 내려가는 소리. 끝 소리(SND.ui over)는 이것 대신 다른 끝(가시 폭탄·몬스터)에
    fall: { gap: 0.3, db: -6, fn(t) { tone(t, 'sine', 900, 120, 0.8, 0.14, 0.01); } },
  };

  function play(name, o) {
    const s = SFX[name];
    if (!s || !S) return false;
    if (S.muted() || !S.fxOn()) return false;
    if (name === 'star' && !(o && o.k != null)) {   // 잇달아 먹은 별은 한 칸씩 높게
      const now = ac ? ac.currentTime : 0;
      starK = now - starAt < 0.9 ? Math.min(7, starK + 1) : 0; starAt = now;
      o = Object.assign({}, o, { k: starK });
    }
    if (ac && S.ready()) {
      const now = ac.currentTime;
      if (last[name] != null && now - last[name] < s.gap) return false;
      last[name] = now;
    }
    return S.run(t => {
      if (!ac || !master) return;
      lv = Math.pow(10, (s.db || 0) / 20);
      try { s.fn(t, o); } finally { lv = 1; }
    }, 'jp.' + name);
  }

  // 네 게임 공통 소리 (tap open close start coin buy deny claim medal tick continueAsk continueGo fanfare over overSoft)
  const ui = (name, o) => (S ? S.ui(name, o) : false);

  // ─── 배경 음악 (SND.music) ───
  // 높이를 따라 바뀐다: 땅 'ground' → 구름 층(70m)부터 'sky' → 대기권 돌파(232m) 'galaxy' → 우주 행성(수성 ~ 명왕성) →
  // 외계 행성 여덟 → 별나라(1100m) 'galaxy'. 테마 이름은 common/sound.js의 행성 id와 같다
  function placeFor(W) {
    const D = JP.DATA, Z = D.ZONES[W.zone] || D.ZONES[0], h = W.height || 0;
    if (Z.id === 'stars') return 'galaxy';
    if (Z.id === 'space' || Z.id === 'exo') { const P = W.planet > 0 && D.PLANETS[W.planet - 1]; return P ? P.id : 'galaxy'; }
    if (h >= D.SKY.edge) return 'galaxy';
    if (h >= D.SKY.cloud[0]) return 'sky';
    return 'ground';
  }
  // 분위기: 피버와 비밀 방은 반짝이(빠르게), 쉬움은 차분하게 (쉬움도 피버·비밀 방 동안은 반짝이)
  function moodFor(W) {
    const fever = W.feverT > 0 || !!W.room;
    return { planet: placeFor(W), fever, calm: !!W.easy && !fever };
  }
  let cur = null;   // 지금 음악에 알려 준 분위기
  function musicTitle() { cur = null; if (!S) return; S.music.duck(1); S.music.setMood({ fever: false, calm: false, boss: false }); S.music.play('jump', 'title'); }
  function musicStart(W) {
    if (!S) return;
    cur = moodFor(W);
    S.music.duck(1);
    S.music.setMood({ fever: cur.fever, calm: cur.calm, boss: false });
    S.music.play('jump', cur.planet);
  }
  // 판 중 매 프레임: 바뀐 것만 알린다 (행성이 바뀌면 1초 동안 겹쳐 넘어간다)
  function follow(W) {
    if (!S || !W) return;
    const m = moodFor(W);
    if (!cur) { musicStart(W); return; }
    const o = {};
    if (m.fever !== cur.fever) o.fever = m.fever;
    if (m.calm !== cur.calm) o.calm = m.calm;
    if (m.planet !== cur.planet) o.planet = m.planet;
    if (Object.keys(o).length) { cur = m; S.music.setMood(o); }
  }
  function musicStop(sec) { cur = null; if (S) { S.music.stop(sec); } }
  function duck(v) { if (S) S.music.duck(v); }

  JP.Audio = {
    unlock, play, ui, placeFor, moodFor, follow, musicTitle, musicStart, musicStop, duck,
    NAMES: Object.keys(SFX),
    get muted() { return S ? S.muted() : true; },
    toggleMuted() { if (S) S.toggleMuted(); return S ? S.muted() : true; },
    onChange(fn) { return S ? S.onChange(fn) : () => {}; },
  };
})(JP);
