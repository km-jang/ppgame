'use strict';
// 게임 루프와 화면 전환. 규칙은 world.js, 그리기는 render.js가 맡는다.
(function (RN) {
  const $ = id => document.getElementById(id);
  const D = RN.DATA;
  const canvas = $('game');
  // alpha:false = 배경이 불투명하다고 알려 합성 비용을 줄인다
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  // 터치 기기 판별 (갤럭시탭·폰). 안내 문구와 버튼 크기를 터치 기준으로 맞춘다
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  const calmQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const input = RN.createInput(canvas);
  const MUTE_KEY = 'runner.muted';
  const EASY_KEY = 'runner.easy';
  const REC_KEY = 'runner.rec';

  const view = { dpr: 1, w: 0, h: 0, ui: 1, hudMid: 32, hudLeft: 150, hudRight: 14, touch: isTouch, calm: false, best: 0 };
  view.pad = input;   // 밀기 화살표 그리기용 (render.js가 읽기만 한다)
  const demoView = Object.create(view, { hud: { value: false } });

  let W = null;        // 실제 판
  let demo = null;     // 시작 화면 뒤에서 자동 운전으로 도는 시연 판
  let mode = 'title';  // title | play | paused | over
  let auto = false;    // 자동 운전 (테스트용)
  let overAt = 0;
  let easy = RN.store.get(EASY_KEY, true) !== false;   // 쉬움이 기본. 이 기기에 기억한다
  // 기록 장부: 최고 거리·점수, 모두 합친 수, 받은 메달 (이 기기 안에만)
  const blankRec = () => ({ best: { dist: 0, score: 0, stars: 0 }, total: { games: 0, stars: 0, dist: 0 }, medals: {} });
  function loadRec() {
    const r = blankRec(), got = RN.store.get(REC_KEY, null);
    if (got && typeof got === 'object') for (const k of Object.keys(r)) Object.assign(r[k], got[k] || {});
    return r;
  }
  let rec = loadRec();
  const saveRec = () => RN.store.set(REC_KEY, rec);
  let lastOpts = {};
  let medalCheckT = 0;
  let lastTs = 0;
  let frozenDrawn = false;   // 일시정지 화면에선 한 번만 그리고 쉰다 (배터리)

  // ─── 화면 크기 ─────────────────────────────────────────────
  function renderEasy() {
    for (const b of document.querySelectorAll('[data-easy]')) b.setAttribute('aria-pressed', String((b.dataset.easy === '1') === easy));
  }
  function setEasy(on) {
    easy = !!on; RN.store.set(EASY_KEY, easy); renderEasy();
  }

  // HUD 줄은 왼쪽 위 버튼 묶음과 같은 높이. 일시정지 버튼은 게임 중에만 보이므로 화면이 바뀔 때마다 다시 잰다
  function measureHud() {
    const tb = $('topbar').getBoundingClientRect();
    view.hudLeft = Math.round(tb.right) + 12;
    view.hudMid = Math.round((tb.top + tb.bottom) / 2);
    view.hudRight = Math.max(14, Math.round(tb.left));
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
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
  }
  window.addEventListener('resize', resize);

  // ─── 오버레이 ──────────────────────────────────────────────
  const screens = ['scr-title', 'scr-pause', 'scr-over', 'scr-medals'];
  function show(id) {
    for (const s of screens) $(s).classList.toggle('on', s === id);
    document.body.classList.toggle('playing', mode === 'play');
    input.active = mode === 'play';
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
    view.best = rec.best.dist;
    $('best').textContent = rec.best.dist > 0
      ? '최고 ' + rec.best.dist.toLocaleString() + 'm · ' + rec.best.score.toLocaleString() + '점'
      : '첫 비행을 시작해요';
    $('medal-count').textContent = Object.keys(rec.medals).length + '/' + D.MEDALS.length;
  }

  // ─── 메달 ──────────────────────────────────────────────────
  // 새로 딴 메달을 장부에 적고 돌려준다. live면 게임 중이라 토스트로 알린다
  function checkMedals(live) {
    const run = RN.World.runStats(W), fresh = [];
    for (const m of D.MEDALS) {
      if (rec.medals[m.id]) continue;
      let ok = false;
      try { ok = m.check(run, rec); } catch (e) { ok = false; }
      if (ok) { rec.medals[m.id] = new Date().toISOString().slice(0, 10); fresh.push(m); }
    }
    if (fresh.length) {
      saveRec();
      if (live) { toast('메달 획득: ' + fresh.map(m => m.name).join(', ')); RN.Audio.play('medal'); vibrate([20, 40, 20]); }
    }
    return fresh;
  }
  const TIER = { 1: '동', 2: '은', 3: '금' };
  function medalHtml(m, locked) {
    return '<div class="medal t' + m.tier + (locked ? ' locked' : '') + '"><span class="coin">' + (locked ? '?' : TIER[m.tier]) + '</span><span><b>' + m.name + '</b><small>' + m.desc + '</small></span></div>';
  }
  function openMedals() {
    $('medal-sub').textContent = '메달 ' + Object.keys(rec.medals).length + ' / ' + D.MEDALS.length;
    $('medal-list').innerHTML = D.MEDALS.map(m => medalHtml(m, !rec.medals[m.id])).join('');
    const T = rec.total, rows = [
      ['최고 거리', rec.best.dist.toLocaleString() + 'm'], ['최고 점수', rec.best.score.toLocaleString()], ['한 판 최고 별', rec.best.stars],
      ['모두 한 판', T.games], ['모은 별', T.stars.toLocaleString()], ['모두 달린 거리', Math.floor(T.dist).toLocaleString() + 'm'],
    ];
    $('record-list').innerHTML = rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
    show('scr-medals');
  }

  // ─── 흐름 ──────────────────────────────────────────────────
  // opts: { easy } 를 주면 그 난이도로 (없으면 지금 고른 난이도)
  function newGame(seed, opts) {
    RN.Audio.unlock();
    if (opts && typeof opts.easy === 'boolean') setEasy(opts.easy);
    lastOpts = { easy };
    W = RN.World.create(seed, lastOpts);
    view.best = rec.best.dist;
    medalCheckT = 0;
    input.reset();
    mode = 'play';
    wakeLock(true);
    show(null);
    RN.Audio.play('start');
    return W;
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
    input.active = false;
    overAt = performance.now();
    // 기록 장부: 신기록은 칩으로 보여 준다
    const newRec = [], T = rec.total, dist = Math.floor(W.dist);
    T.games++; T.stars += W.stars; T.dist += dist;
    const isBest = W.score > rec.best.score && W.score > 0;
    if (isBest) rec.best.score = W.score;
    if (dist > rec.best.dist) { rec.best.dist = dist; newRec.push('최고 거리 ' + dist.toLocaleString() + 'm'); }
    if (W.stars > rec.best.stars) { rec.best.stars = W.stars; newRec.push('한 판 별 ' + W.stars); }
    saveRec();
    const fresh = checkMedals(false);
    $('over-records').innerHTML = newRec.map(x => '<span>신기록 · ' + x + '</span>').join('');
    $('over-medals').innerHTML = fresh.map(m => medalHtml(m, false)).join('');
    if (fresh.length) setTimeout(() => { if (mode === 'over') RN.Audio.play('medal'); }, 900);
    $('over-title').textContent = W.cause === 'gate' ? '레이저에 찌릿!' : '운석에 쾅!';
    $('over-score').textContent = W.score.toLocaleString();
    $('over-new').style.display = isBest ? '' : 'none';
    $('over-dist').textContent = dist.toLocaleString() + 'm';
    $('over-stars').textContent = W.stars;
    $('over-time').textContent = RN.fmtTime(W.runT);
    wakeLock(false);
    // 부딪힌 연출을 잠깐 보여 준 뒤 결과 화면
    setTimeout(() => { if (mode === 'over') show('scr-over'); }, 900);
  }

  function drainEvents(world, sound) {
    for (const ev of world.events) {
      if (!sound) continue;
      if (ev === 'star') RN.Audio.play('star', { k: (world.chain - 1) % 8 });
      else RN.Audio.play(ev);
      if (ev === 'over') vibrate(250);
      else if (ev === 'hit') vibrate([60, 40, 60]);
      else if (ev === 'shield' || ev === 'smash') vibrate(30);
      else if (ev === 'power' || ev === 'boost') vibrate([20, 30, 20]);
    }
    world.events.length = 0;
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 지원 안 하면 무시 */ }
  }

  // ─── 입력 연결 ─────────────────────────────────────────────
  function move(dir) { return W && mode === 'play' ? RN.World.move(W, dir) : false; }
  input.onMove = (dir, touch) => {
    RN.Audio.unlock();
    if (move(dir) && touch) vibrate(10);
  };
  for (const b of document.querySelectorAll('[data-easy]')) b.addEventListener('click', () => { RN.Audio.unlock(); setEasy(b.dataset.easy === '1'); });
  input.onKey = code => {
    RN.Audio.unlock();
    if (code === 'KeyM') return toggleMute();
    if (mode === 'title' && (code === 'Enter' || code === 'Space')) return newGame();
    if (mode === 'over' && (code === 'Enter' || code === 'Space')) return newGame();
    if (code === 'KeyP' || code === 'Escape') return mode === 'play' ? pause() : resume();
    if (mode === 'paused' && (code === 'Enter' || code === 'Space')) return resume();
  };

  function toggleMute() {
    RN.Audio.unlock();
    RN.Audio.setMuted(!RN.Audio.muted);
    RN.store.set(MUTE_KEY, RN.Audio.muted);
    $('btn-mute').classList.toggle('muted', RN.Audio.muted);
    toast(RN.Audio.muted ? '소리 끔' : '소리 켬');
  }

  // 브라우저는 첫 터치·클릭 뒤에야 소리를 허락한다
  window.addEventListener('pointerdown', () => RN.Audio.unlock(), { passive: true });
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  // 기록이 브라우저 정리 때 지워지지 않게 요청 (돈 0원, 이 기기 안에서만)
  const keep = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 무시 */ } };
  $('btn-start').addEventListener('click', () => { keep(); newGame(); });
  $('btn-medals').addEventListener('click', () => { RN.Audio.unlock(); openMedals(); });
  $('btn-medals-back').addEventListener('click', toTitle);
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
    else if (mode === 'play' || mode === 'paused') wakeLock(true);   // 돌아오면 다시 요청
  });
  // 뒤로 가기 제스처: 나가지 않고 멈춤 화면으로
  try {
    history.pushState({ rn: 1 }, '');
    window.addEventListener('popstate', () => { if (mode === 'play') { pause(); history.pushState({ rn: 1 }, ''); } });
  } catch (e) { /* 무시 */ }

  // ─── 루프 ──────────────────────────────────────────────────
  // 120Hz 화면에서도 60번만 그린다 (배터리·발열). 규칙은 흐른 시간만큼 1/120초 칸으로 돌아 결과가 같다
  const MIN_FRAME = 1000 / 60 - 2;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastTs < MIN_FRAME) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;

    if (mode === 'title') {
      // 시연: 자동 운전 우주선이 시작 화면 뒤에서 달린다. 끝나면(드물게) 새로
      if (!demo || demo.phase !== 'play' || demo.dist > 4000) demo = RN.World.create(777 + Math.floor(Math.random() * 1000), { easy: true, auto: true, wait: 0 });
      RN.World.step(demo, dt);
      drainEvents(demo, false);
      RN.Render.draw(ctx, demo, demoView, dt);
    } else if (W) {
      if (mode === 'play') {
        W.auto = auto;
        RN.World.step(W, dt);
        drainEvents(W, true);
        // 게임 중에 딸 수 있는 메달은 바로 알려 준다
        if ((medalCheckT += dt) > 0.5 && W.phase === 'play') { medalCheckT = 0; checkMedals(true); }
        if (W.phase === 'over') gameOver();
        frozenDrawn = false;
      }
      // 결과 화면이 뜨고 연출이 끝나면 그리기를 쉰다 (배터리)
      const idle = mode === 'paused' || (mode === 'over' && performance.now() - overAt > 1300 && !RN.Render.busy());
      if (!idle || !frozenDrawn) {
        RN.Render.draw(ctx, W, view, mode === 'play' || mode === 'over' ? dt : 0);
        frozenDrawn = idle;
      }
    }
  }

  // ─── 시작 ──────────────────────────────────────────────────
  renderEasy();
  RN.Audio.setMuted(RN.store.get(MUTE_KEY, false));
  $('btn-mute').classList.toggle('muted', RN.Audio.muted);
  resize();
  toTitle();
  requestAnimationFrame(ts => { lastTs = ts - 20; frame(ts); });
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
  RN.debug = {
    get world() { return W; },
    get mode() { return mode; },
    get demo() { return demo; },
    get rec() { return rec; },
    get easy() { return easy; }, setEasy,
    newGame, pause, resume, toTitle, openMedals,
    move(dir) { return move(dir); },
    autopilot(on) { auto = on !== false; return auto; },
    get pad() { return input; }, get view() { return view; },
  };
})(RN);
