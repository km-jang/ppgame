'use strict';
// 게임 루프와 화면 전환. 규칙은 world.js, 그리기는 render.js가 맡는다.
(function (SN) {
  const $ = id => document.getElementById(id);
  const D = SN.DATA;
  const canvas = $('game');
  // alpha:false = 배경이 불투명하다고 알려 합성 비용을 줄인다
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  // 터치 기기 판별 (갤럭시탭·폰). 안내 문구와 버튼 크기를 터치 기준으로 맞춘다
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  const calmQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const input = SN.createInput(canvas);
  const BEST_KEY = 'snake.best';   // {score, len}
  const MUTE_KEY = 'snake.muted';

  const view = { dpr: 1, w: 0, h: 0, ui: 1, hudMid: 32, hudLeft: 150, hudRight: 14, touch: isTouch, calm: false, best: 0 };
  const demoView = Object.create(view, { hud: { value: false } });

  let W = null;        // 실제 판
  let demo = null;     // 시작 화면 뒤에서 혼자 도는 시연 판
  let demoRest = 0;    // 시연 판이 끝난 뒤 다시 시작까지
  let mode = 'title';  // title | play | paused | over
  let auto = false;    // 자동 운전 (테스트·시연용)
  let overAt = 0;
  let best = SN.store.get(BEST_KEY, { score: 0, len: 0 });
  if (!best || typeof best.score !== 'number') best = { score: 0, len: 0 };
  let lastTs = 0;
  let frozenDrawn = false; // 일시정지 화면에선 한 번만 그리고 쉰다 (배터리)

  // ─── 화면 크기 ─────────────────────────────────────────────
  const size = () => ({ w: window.innerWidth, h: window.innerHeight });
  // 판 모양: 가로 화면은 32×20, 세로 화면(폰)은 20×32
  const boardFor = ({ w, h }) => (h > w * 1.1 ? D.BOARD.port : D.BOARD.land);

  function fit(world) {
    const L = SN.Render.layout(world.cols, world.rows, view.w, view.h, view.hudH);
    Object.assign(view, L);
  }

  // HUD 줄은 왼쪽 위 버튼 묶음과 같은 높이. 판은 그 아래부터.
  // 일시정지 버튼은 게임 중에만 보이므로 화면이 바뀔 때마다 다시 잰다
  function measureHud() {
    const tb = $('topbar').getBoundingClientRect();
    view.hudLeft = Math.round(tb.right) + 12;
    view.hudMid = Math.round((tb.top + tb.bottom) / 2);
    view.hudRight = Math.max(14, Math.round(tb.left));
    view.hudH = Math.round(tb.bottom) + 10;
  }

  function resize() {
    const { w, h } = size();
    view.w = w; view.h = h;
    // 해상도 상한: 태블릿 원래 해상도로 그리면 픽셀이 너무 많아 느려진다.
    // 약 220만 픽셀까지만 그리고 나머지는 브라우저가 늘려 보여 준다
    view.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.2e6 / (w * h))));
    view.ui = isTouch ? (Math.min(w, h) >= 600 ? 1.3 : 1.1) : 1;
    measureHud();
    input.threshold = Math.max(D.SWIPE.min, Math.min(w, h) * D.SWIPE.ratio);
    view.calm = !!(calmQuery && calmQuery.matches);
    frozenDrawn = false;
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    // 시연 판은 화면 방향이 바뀌면 새로 만든다 (실제 판은 모양 유지, 크기만 맞춤)
    if (demo && boardFor({ w, h })[0] !== demo.cols) demo = null;
  }
  window.addEventListener('resize', resize);

  // ─── 오버레이 ──────────────────────────────────────────────
  const screens = ['scr-title', 'scr-pause', 'scr-over'];
  function show(id) {
    for (const s of screens) $(s).classList.toggle('on', s === id);
    document.body.classList.toggle('playing', mode === 'play');
    if (mode === 'play') measureHud();
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
    view.best = best.score;
    $('best').textContent = best.score > 0
      ? '최고 기록 ' + best.score.toLocaleString() + '점 · 길이 ' + best.len
      : '첫 도전을 시작하세요';
  }

  // ─── 흐름 ──────────────────────────────────────────────────
  function newGame(seed) {
    SN.Audio.unlock();
    const [cols, rows] = boardFor(size());
    W = SN.World.create(cols, rows, seed);
    input.reset();
    mode = 'play';
    wakeLock(true);
    show(null);
    SN.Audio.play('start');
  }

  function toTitle() {
    W = null;
    mode = 'title';
    wakeLock(false);
    renderBest();
    show('scr-title');
  }

  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    frozenDrawn = false;
    show('scr-pause');
  }

  function resume() {
    if (mode !== 'paused') return;
    input.reset();
    mode = 'play';
    show(null);
  }

  function gameOver() {
    mode = 'over';
    overAt = performance.now();
    const isBest = W.score > best.score;
    if (isBest || W.snake.length > best.len) {
      best = { score: Math.max(best.score, W.score), len: Math.max(best.len, W.snake.length) };
      SN.store.set(BEST_KEY, best);
    }
    $('over-title').textContent = W.won ? '판을 가득 채웠다!' : W.cause === 'self' ? '꼬리를 물었다' : '벽에 부딪혔다';
    $('over-score').textContent = W.score.toLocaleString();
    $('over-new').style.display = isBest ? '' : 'none';
    $('over-len').textContent = W.snake.length;
    $('over-eaten').textContent = W.eaten + (W.golds ? ' (황금 ' + W.golds + ')' : '');
    $('over-time').textContent = SN.fmtTime(W.time);
    wakeLock(false);
    // 충돌 연출을 잠깐 보여 준 뒤 결과 화면
    setTimeout(() => { if (mode === 'over') show('scr-over'); }, 800);
  }

  function drainEvents(world, sound) {
    for (const ev of world.events) {
      if (!sound) continue;
      if (ev === 'eat') SN.Audio.play('eat', { k: (world.eaten - 1) % D.FOOD.goldEvery });
      else SN.Audio.play(ev);
      if (ev === 'over') vibrate(250);
      else if (ev === 'gold') vibrate([20, 30, 40]);
    }
    world.events.length = 0;
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 지원 안 하면 무시 */ }
  }

  // ─── 입력 연결 ─────────────────────────────────────────────
  input.onDir = dir => {
    SN.Audio.unlock();
    if (mode === 'play' && W) SN.World.turn(W, dir);
  };
  input.onKey = code => {
    SN.Audio.unlock();
    if (code === 'KeyM') return toggleMute();
    if ((mode === 'title' || mode === 'over') && (code === 'Enter' || code === 'Space')) return newGame();
    if (code === 'KeyP' || code === 'Escape' || code === 'Space') return mode === 'play' ? pause() : resume();
  };

  function toggleMute() {
    SN.Audio.unlock();
    SN.Audio.setMuted(!SN.Audio.muted);
    SN.store.set(MUTE_KEY, SN.Audio.muted);
    $('btn-mute').classList.toggle('muted', SN.Audio.muted);
    toast(SN.Audio.muted ? '소리 끔' : '소리 켬');
  }

  // 브라우저는 첫 터치·클릭 뒤에야 소리를 허락한다
  window.addEventListener('pointerdown', () => SN.Audio.unlock(), { passive: true });
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  // 최고 점수가 브라우저 정리 때 지워지지 않게 요청 (돈 0원, 이 기기 안에서만)
  const keep = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 무시 */ } };
  $('btn-start').addEventListener('click', () => { keep(); newGame(); });
  $('btn-retry').addEventListener('click', () => newGame());
  $('btn-home').addEventListener('click', toTitle);
  $('btn-resume').addEventListener('click', resume);
  $('btn-quit').addEventListener('click', toTitle);
  $('btn-pause').addEventListener('click', () => (mode === 'play' ? pause() : resume()));
  $('btn-mute').addEventListener('click', toggleMute);

  // 게임 중 화면이 어두워지거나 꺼지지 않게 (지원 기기만, 거절되면 무시)
  let lock = null;
  function wakeLock(on) {
    try {
      if (on && !lock && navigator.wakeLock) {
        navigator.wakeLock.request('screen').then(l => { lock = l; l.addEventListener('release', () => { lock = null; }); }).catch(() => {});
      } else if (!on && lock) { lock.release().catch(() => {}); lock = null; }
    } catch (e) { /* 무시 */ }
  }

  // 전체 화면 (주소창을 없앤다). 지원 안 하는 환경에선 버튼을 숨긴다
  const fsBtn = $('btn-fs');
  const root = document.documentElement;
  if (!(document.fullscreenEnabled && root.requestFullscreen)) fsBtn.hidden = true;
  const hideFs = () => { fsBtn.hidden = true; resize(); };
  fsBtn.addEventListener('click', () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else root.requestFullscreen({ navigationUI: 'hide' }).catch(() => { hideFs(); toast('이 화면에선 전체 화면을 쓸 수 없어요'); });
    } catch (e) { hideFs(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (mode === 'play' || mode === 'paused') wakeLock(true); // 돌아오면 다시 요청
  });

  // ─── 루프 ──────────────────────────────────────────────────
  function drive(world) {
    if (!world.queue.length) SN.World.turn(world, SN.World.botDir(world));
  }

  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;

    if (mode === 'title') {
      // 시연: 자동 운전 뱀이 시작 화면 뒤에서 돈다. 끝나면 잠시 뒤 새로
      if (!demo) { const [c, r] = boardFor(size()); demo = SN.World.create(c, r, 777); demo.wait = 0; demoRest = 0; }
      if (demo.phase === 'play') { drive(demo); SN.World.step(demo, dt); }
      else if ((demoRest += dt) > 1.5) demo = null;
      if (demo) {
        drainEvents(demo, false);
        fit(demo);
        SN.Render.draw(ctx, demo, demoView, dt);
      }
    } else if (W) {
      if (mode === 'play') {
        if (auto) drive(W);
        SN.World.step(W, dt);
        drainEvents(W, true);
        if (W.phase === 'over') gameOver();
        frozenDrawn = false;
      }
      // 결과 화면이 뜨고 연출이 끝나면 그리기를 쉰다 (배터리)
      const idle = mode === 'paused' || (mode === 'over' && performance.now() - overAt > 1200 && !SN.Render.busy());
      if (!idle || !frozenDrawn) {
        fit(W);
        SN.Render.draw(ctx, W, view, dt);
        frozenDrawn = idle;
      }
    }
    requestAnimationFrame(frame);
  }

  // ─── 시작 ──────────────────────────────────────────────────
  SN.Audio.setMuted(SN.store.get(MUTE_KEY, false));
  $('btn-mute').classList.toggle('muted', SN.Audio.muted);
  resize();
  toTitle();
  requestAnimationFrame(ts => { lastTs = ts; frame(ts); });
  // 오프라인 실행 (홈 화면에 추가했을 때). 미리보기 창 안에서는 조용히 건너뛴다
  try {
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && window.top === window) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      Promise.all([navigator.serviceWorker.ready, document.fonts ? document.fonts.ready : null]).then(([reg]) => {
        const urls = performance.getEntriesByType('resource').map(r => r.name).filter(u => /fonts\.(googleapis|gstatic)\.com/.test(u));
        if (urls.length && reg.active) reg.active.postMessage({ type: 'cache-fonts', urls });
      }).catch(() => {});
    }
  } catch (e) { /* 무시 */ }

  // 개발·테스트용 손잡이
  SN.debug = {
    get world() { return W; },
    get mode() { return mode; },
    get demo() { return demo; },
    get best() { return best; },
    newGame, pause, resume, toTitle,
    turn(dir) { return W ? SN.World.turn(W, dir) : false; },
    autopilot(on) { auto = on !== false; return auto; },
  };
})(SN);
