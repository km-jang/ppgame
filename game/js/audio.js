'use strict';
// 효과음. 파일 없이 WebAudio 발진기로 합성한다.
// 브라우저 정책상 첫 클릭·키 입력 뒤에야 소리가 난다 (unlock).
(function (NG) {
  let ac = null, master = null;
  let muted = false;
  const last = {}; // 같은 소리 과다 재생 방지

  const SFX = {
    //         파형,      시작Hz, 끝Hz, 길이,  음량, 최소간격
    shoot:   ['square',   880,  440,  0.05, 0.10, 0.06],
    hit:     ['triangle', 300,  200,  0.04, 0.12, 0.04],
    kill:    ['square',   220,  60,   0.12, 0.18, 0.03],
    hurt:    ['sawtooth', 160,  50,   0.30, 0.35, 0.10],
    dash:    ['sine',     300,  900,  0.12, 0.20, 0.05],
    nova:    ['sawtooth', 600,  40,   0.35, 0.30, 0.10],
    heal:    ['sine',     520,  1040, 0.18, 0.25, 0.05],
    eshoot:  ['triangle', 500,  380,  0.06, 0.07, 0.08],
    pick:    ['square',   440,  880,  0.15, 0.20, 0.05],
    clear:   ['sine',     660,  1320, 0.25, 0.25, 0.10],
    wave:    ['triangle', 330,  660,  0.25, 0.22, 0.10],
    boss:    ['sawtooth', 110,  70,   0.80, 0.35, 0.50],
    bossDown:['sawtooth', 400,  30,   1.00, 0.40, 0.50],
    over:    ['sawtooth', 300,  40,   1.20, 0.40, 0.50],
  };

  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
  }

  function play(name) {
    if (!ac || muted) return;
    const s = SFX[name];
    if (!s) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < s[5]) return;
    last[name] = now;
    const [type, f0, f1, dur, vol] = s;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g); g.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.35;
  }

  NG.Audio = { unlock, play, setMuted, get muted() { return muted; } };
})(NG);
