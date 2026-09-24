'use strict';
// 게임 루프와 화면 전환. 규칙은 world.js, 그리기는 render.js가 맡는다.
(function (NG) {
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const input = NG.createInput(canvas);
  const view = { dpr: 1, hudTop: 14, hudLeft: 104 };
  const demoView = Object.create(view, { hud: { value: false } });
  const BEST_KEY = 'ngun.best2';   // 난이도별 {easy:{score,wave}, ...}
  const MUTE_KEY = 'ngun.muted';
  const DIFF_KEY = 'ngun.diff';
  const AUDIO_KEY = 'ngun.audio';

  let W = null;        // 실제 판
  let demo = null;     // 시작 화면 뒤에서 혼자 도는 시연 판
  let mode = 'title';  // title | play | cards | paused | over
  let cardsShownAt = 0;
  let diff = NG.store.get(DIFF_KEY, 'normal');
  if (!NG.DATA.DIFFICULTY[diff]) diff = 'normal';
  let bests = NG.store.get(BEST_KEY, null);
  if (!bests) {
    // 난이도 도입 전 기록은 '보통'으로 옮긴다
    const old = NG.store.get('ngun.best', null);
    bests = old ? { normal: old } : {};
  }
  const bestOf = d => bests[d] || { score: 0, wave: 0 };
  let lastTs = 0;

  // ─── 화면 크기 ─────────────────────────────────────────────
  function size() {
    return { w: window.innerWidth, h: window.innerHeight };
  }
  function resize() {
    const { w, h } = size();
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (W) NG.World.resize(W, w, h);
    if (demo) NG.World.resize(demo, w, h);
  }
  window.addEventListener('resize', resize);

  // ─── 오버레이 ──────────────────────────────────────────────
  const screens = ['scr-title', 'scr-cards', 'scr-pause', 'scr-over'];
  function show(id) {
    for (const s of screens) $(s).classList.toggle('on', s === id);
    document.body.classList.toggle('playing', mode === 'play');
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1400);
  }

  function renderBest() {
    const b = bestOf(diff);
    $('best').textContent = b.score > 0
      ? NG.DATA.DIFFICULTY[diff].name + ' 최고 기록 ' + b.score.toLocaleString() + '점 · WAVE ' + b.wave
      : NG.DATA.DIFFICULTY[diff].name + ' 첫 도전을 시작하세요';
  }

  function setDiff(d) {
    diff = d;
    NG.store.set(DIFF_KEY, d);
    for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === d));
    renderBest();
  }

  function renderAudioToggles() {
    for (const b of document.querySelectorAll('[data-audio]')) {
      const on = b.dataset.audio === 'music' ? NG.Audio.musicOn : NG.Audio.sfxOn;
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.state').textContent = on ? '켬' : '끔';
    }
    $('btn-mute').textContent = NG.Audio.muted ? '🔇' : '🔊';
  }

  function toggleAudio(kind) {
    NG.Audio.unlock();
    if (kind === 'music') NG.Audio.setMusic(!NG.Audio.musicOn);
    else NG.Audio.setSfx(!NG.Audio.sfxOn);
    NG.store.set(AUDIO_KEY, { music: NG.Audio.musicOn, sfx: NG.Audio.sfxOn });
    renderAudioToggles();
  }

  // ─── 흐름 ──────────────────────────────────────────────────
  function newGame() {
    NG.Audio.unlock();
    const { w, h } = size();
    W = NG.World.createWorld(w, h, undefined, diff);
    input.reset();
    mode = 'play';
    NG.Audio.setDuck(false);
    NG.Audio.music('play');
    show(null);
  }

  function toTitle() {
    W = null;
    mode = 'title';
    NG.Audio.setDuck(false);
    NG.Audio.music('title');
    renderBest();
    show('scr-title');
  }

  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    $('pause-aim').textContent = input.aimMode === 'mouse' ? '마우스' : '자동';
    NG.Audio.setDuck(true);
    show('scr-pause');
  }

  function resume() {
    if (mode !== 'paused') return;
    input.reset();
    mode = 'play';
    NG.Audio.setDuck(false);
    show(null);
  }

  function showCards() {
    mode = 'cards';
    cardsShownAt = performance.now();
    $('cards-title').textContent = 'WAVE ' + W.wave + ' 클리어';
    const list = $('card-list');
    list.innerHTML = '';
    W.cards.forEach((c, i) => {
      const lv = W.player.lvl[c.id] || 0;
      const b = document.createElement('button');
      b.className = 'card' + (c.id === 'barrel' ? ' rare' : '');
      b.innerHTML =
        '<span class="card-key">' + (i + 1) + '</span>' +
        '<span class="card-icon">' + c.icon + '</span>' +
        '<span class="card-name">' + c.name + '</span>' +
        '<span class="card-desc">' + c.desc + '</span>' +
        '<span class="card-lv">' + (c.max === Infinity ? '' : 'Lv ' + lv + ' → ' + (lv + 1) + ' / ' + c.max) + '</span>';
      b.addEventListener('click', () => choose(i));
      list.appendChild(b);
    });
    show('scr-cards');
  }

  function choose(i) {
    // 사격하다 실수로 누르는 것 방지
    if (mode !== 'cards' || performance.now() - cardsShownAt < 350) return;
    if (NG.World.pickCard(W, i)) {
      input.reset();
      mode = 'play';
      show(null);
      drainEvents(W);
    }
  }

  function gameOver() {
    mode = 'over';
    const b = bestOf(diff);
    const isBest = W.score > b.score;
    if (isBest || W.wave > b.wave) {
      bests[diff] = { score: Math.max(b.score, W.score), wave: Math.max(b.wave, W.wave) };
      NG.store.set(BEST_KEY, bests);
    }
    NG.Audio.music('off');
    $('over-diff').textContent = W.diff.name;
    $('over-score').textContent = W.score.toLocaleString();
    $('over-new').style.display = isBest ? '' : 'none';
    $('over-wave').textContent = W.wave;
    $('over-kills').textContent = W.stats.kills.toLocaleString();
    $('over-time').textContent = NG.fmtTime(W.stats.time);
    $('over-n').textContent = W.player.gun.barrels;
    const counts = {};
    for (const id of W.stats.picks) counts[id] = (counts[id] || 0) + 1;
    const all = NG.DATA.CARDS.concat([NG.DATA.FALLBACK_CARD]);
    $('over-picks').innerHTML = Object.keys(counts).length
      ? Object.keys(counts).map(id => {
          const c = all.find(x => x.id === id);
          return '<span class="pick">' + c.icon + ' ' + c.name + (counts[id] > 1 ? ' ×' + counts[id] : '') + '</span>';
        }).join('')
      : '<span class="pick">없음</span>';
    setTimeout(() => { if (mode === 'over') show('scr-over'); }, 900);
  }

  function drainEvents(world) {
    for (const ev of world.events) {
      if (ev === 'shoot') NG.Audio.play(ev, { n: world.player.gun.barrels });
      else NG.Audio.play(ev);
      if (world === W) {
        if (ev === 'boss') NG.Audio.music('boss');
        else if (ev === 'bossDown') NG.Audio.music('play');
        else if (ev === 'hurt' || ev === 'over') vibrate(ev === 'over' ? 300 : 60);
      }
    }
    world.events.length = 0;
  }

  // ─── 입력 연결 ─────────────────────────────────────────────
  input.onKey = code => {
    NG.Audio.unlock();
    if (code === 'KeyM') return toggleMute();
    if (code === 'KeyF') { toast('조준: ' + (input.toggleAim() === 'mouse' ? '마우스' : '자동')); return; }
    if (mode === 'title' && code === 'Enter') return newGame();
    if (mode === 'over' && code === 'Enter') return newGame();
    if (code === 'KeyP' || code === 'Escape') return mode === 'play' ? pause() : resume();
    if (mode === 'cards') {
      const i = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
      if (i != null) choose(i);
    }
  };

  function toggleMute() {
    NG.Audio.unlock();
    NG.Audio.setMuted(!NG.Audio.muted);
    NG.store.set(MUTE_KEY, NG.Audio.muted);
    renderAudioToggles();
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 지원 안 하면 무시 */ }
  }

  for (const b of document.querySelectorAll('[data-diff]')) b.addEventListener('click', () => setDiff(b.dataset.diff));
  for (const b of document.querySelectorAll('[data-audio]')) b.addEventListener('click', () => toggleAudio(b.dataset.audio));
  // 브라우저는 첫 터치·클릭 뒤에야 소리를 허락한다. 시작 화면 음악도 그때 시작
  window.addEventListener('pointerdown', () => NG.Audio.unlock(), { passive: true });

  $('btn-start').addEventListener('click', newGame);
  $('btn-retry').addEventListener('click', newGame);
  $('btn-home').addEventListener('click', toTitle);
  $('btn-resume').addEventListener('click', resume);
  $('btn-quit').addEventListener('click', toTitle);
  $('btn-pause').addEventListener('click', () => (mode === 'play' ? pause() : resume()));
  $('btn-mute').addEventListener('click', toggleMute);
  const dashBtn = $('btn-dash');
  dashBtn.addEventListener('touchstart', e => { e.preventDefault(); input.queueDash(); }, { passive: false });
  dashBtn.addEventListener('mousedown', () => input.queueDash());
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ─── 루프 ──────────────────────────────────────────────────
  function demoInput(D) {
    const t = D.t;
    return { moveX: Math.cos(t * 0.5), moveY: Math.sin(t * 0.7), aimAngle: null, dash: false };
  }

  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;

    if (mode === 'title') {
      if (!demo) { const { w, h } = size(); demo = NG.World.createWorld(w, h, 12345); }
      if (demo.phase === 'cards') NG.World.pickCard(demo, 0);
      demo.player.hp = demo.player.maxHp;
      NG.World.step(demo, demoInput(demo), dt);
      demo.events.length = 0;
      NG.Render.draw(ctx, demo, demoView, null);
    } else if (W) {
      if (mode === 'play' || mode === 'over') {
        const inp = input.read(W.player);
        // 프레임이 길면 두 번에 나눠 진행 (빠른 탄이 적을 뚫고 지나가지 않게)
        const n = dt > 1 / 50 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          NG.World.step(W, i === 0 ? inp : Object.assign({}, inp, { dash: false }), dt / n);
        }
        drainEvents(W);
        if (mode === 'play' && W.phase === 'cards') showCards();
        else if (mode === 'play' && W.phase === 'over') gameOver();
      }
      NG.Render.draw(ctx, W, view, mode === 'play' ? input.touch : null);
    }
    requestAnimationFrame(frame);
  }

  // ─── 시작 ──────────────────────────────────────────────────
  NG.Audio.setMuted(NG.store.get(MUTE_KEY, false));
  const audioPref = NG.store.get(AUDIO_KEY, { music: true, sfx: true });
  NG.Audio.setMusic(audioPref.music !== false);
  NG.Audio.setSfx(audioPref.sfx !== false);
  renderAudioToggles();
  setDiff(diff);
  resize();
  toTitle();
  requestAnimationFrame(ts => { lastTs = ts; frame(ts); });

  // 개발·테스트용 손잡이
  NG.debug = { get world() { return W; }, get mode() { return mode; }, get diff() { return diff; }, newGame, choose, setDiff };
})(NG);
