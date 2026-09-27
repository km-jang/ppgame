'use strict';
// 게임 루프와 화면 전환. 규칙은 world.js, 그리기는 render.js가 맡는다.
(function (JP) {
  const $ = id => document.getElementById(id);
  const D = JP.DATA;
  const canvas = $('game');
  // alpha:false = 배경이 불투명하다고 알려 합성 비용을 줄인다
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  // 터치 기기 판별 (갤럭시탭·폰). 안내 문구와 버튼 크기를 터치 기준으로 맞춘다
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  const calmQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const input = JP.createInput(canvas);
  const MUTE_KEY = 'jump.muted';
  const EASY_KEY = 'jump.easy';
  const REC_KEY = 'jump.rec';

  const view = { dpr: 1, w: 0, h: 0, ui: 1, hudMid: 32, hudLeft: 150, hudRight: 14, hudH: 64, touch: isTouch, calm: false, bestH: 0 };
  view.pad = input;   // 누른 쪽 화살표 그리기용 (render.js가 읽기만 한다)
  const demoView = Object.create(view, { hud: { value: false } });

  let W = null;        // 실제 판
  let demo = null;     // 시작 화면 뒤에서 혼자 도는 시연 판
  let demoRest = 0;    // 시연 판이 끝난 뒤 다시 시작까지
  let mode = 'title';  // title | play | paused | over
  let auto = false;    // 자동 운전 (테스트·시연용)
  let overAt = 0;
  let easy = JP.store.get(EASY_KEY, true) !== false;   // 쉬움이 기본. 이 기기에 기억한다
  let lastSeed;        // 다시 하기용 (시드를 정해 시작했으면 같은 판)

  // 기록 장부: 최고 높이·점수, 모두 합친 수, 받은 메달 (이 기기 안에만)
  const blankRec = () => ({ best: { height: 0, score: 0, stars: 0 }, total: { games: 0, stars: 0, height: 0, rescues: 0 }, medals: {} });
  function loadRec() {
    const r = blankRec(), got = JP.store.get(REC_KEY, null);
    if (got && typeof got === 'object') for (const k of Object.keys(r)) Object.assign(r[k], got[k] || {});
    return r;
  }
  let rec = loadRec();
  const saveRec = () => JP.store.set(REC_KEY, rec);
  let medalCheckT = 0;
  let lastTs = 0;
  let frozenDrawn = false; // 일시정지 화면에선 한 번만 그리고 쉰다 (배터리)
  let fastScreen = 0, skip = false;   // 120Hz 화면이면 한 번 걸러 그린다 (60번만)

  // ─── 화면 크기 ─────────────────────────────────────────────
  const size = () => ({ w: window.innerWidth, h: window.innerHeight });

  function fit(world) {
    Object.assign(view, JP.Render.layout(view.w, view.h, view.hudH));
    if (world) world.viewH = view.viewH;
  }
  function renderEasy() {
    for (const b of document.querySelectorAll('[data-easy]')) b.setAttribute('aria-pressed', String((b.dataset.easy === '1') === easy));
  }
  function setEasy(on) {
    easy = !!on; JP.store.set(EASY_KEY, easy); renderEasy();
  }

  // HUD 줄은 왼쪽 위 버튼 묶음과 같은 높이. 기둥은 (세로 화면이면) 그 아래부터.
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
    view.ui = isTouch ? (Math.min(w, h) >= 600 ? 1.25 : 1.05) : 1;
    measureHud();
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
    measureHud();
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
  }

  function renderBest() {
    view.bestH = rec.best.height;
    $('best').textContent = rec.best.height > 0 ? '최고 ' + rec.best.height + 'm · ' + rec.best.score.toLocaleString() + '점' : '얼마나 높이 갈 수 있을까요?';
    $('medal-count').textContent = Object.keys(rec.medals).length + '/' + D.MEDALS.length;
  }

  // ─── 메달 ──────────────────────────────────────────────────
  // 새로 딴 메달을 장부에 적고 돌려준다. live면 게임 중이라 토스트로 알린다
  function checkMedals(live) {
    const run = JP.World.runStats(W), fresh = [];
    for (const m of D.MEDALS) {
      if (rec.medals[m.id]) continue;
      let ok = false;
      try { ok = m.check(run, rec); } catch (e) { ok = false; }
      if (ok) { rec.medals[m.id] = new Date().toISOString().slice(0, 10); fresh.push(m); }
    }
    if (fresh.length) {
      saveRec();
      if (live) { toast('메달 획득: ' + fresh.map(m => m.name).join(', ')); JP.Audio.play('medal'); vibrate([20, 40, 20]); }
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
    const B = rec.best, T = rec.total, rows = [
      ['최고 높이', B.height + 'm'], ['최고 점수', B.score.toLocaleString()], ['한 판 최고 별', B.stars],
      ['모두 한 판', T.games], ['모은 별', T.stars.toLocaleString()], ['모두 오른 높이', T.height.toLocaleString() + 'm'],
    ];
    $('record-list').innerHTML = rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
    show('scr-medals');
  }

  // ─── 흐름 ──────────────────────────────────────────────────
  // opts: {easy} (없으면 지금 고른 난이도)
  function newGame(seed, opts) {
    JP.Audio.unlock();
    if (opts && typeof opts.easy === 'boolean') setEasy(opts.easy);
    lastSeed = seed;
    fit(null);
    W = JP.World.create(seed, { easy, viewH: view.viewH });
    view.bestH = rec.best.height;
    medalCheckT = 0;
    input.reset();
    mode = 'play';
    wakeLock(true);
    show(null);
    JP.Audio.play('start');
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
    overAt = performance.now();
    // 기록 장부: 신기록은 칩으로 보여 준다
    const newRec = [], B = rec.best, T = rec.total;
    T.games++; T.stars += W.starsGot; T.height += W.height; T.rescues += W.rescued;
    const isBest = W.score > B.score && W.score > 0;
    if (isBest) B.score = W.score;
    if (W.height > B.height) { B.height = W.height; newRec.push('최고 높이 ' + W.height + 'm'); }
    if (W.starsGot > B.stars) { B.stars = W.starsGot; newRec.push('별 ' + W.starsGot + '개'); }
    saveRec();
    const fresh = checkMedals(false);
    $('over-records').innerHTML = newRec.map(x => '<span>신기록 · ' + x + '</span>').join('');
    $('over-medals').innerHTML = fresh.map(m => medalHtml(m, false)).join('');
    if (fresh.length) setTimeout(() => { if (mode === 'over') JP.Audio.play('medal'); }, 900);
    // 쉬움은 부드럽게 끝난다 (칭찬하는 말, 빨간색 없음)
    const soft = W.easy;
    $('scr-over').classList.toggle('soft', soft);
    $('over-title').textContent = soft ? (W.height >= 30 ? '높이 날았어요!' : '잘했어요!') : W.cause === 'mine' ? '가시 폭탄에 닿았다' : '아래로 떨어졌다';
    $('over-sub').textContent = soft ? '구름이 다 쉬러 갔어요. 한 번 더 해 볼까요?' : '';
    $('over-score').textContent = W.score.toLocaleString();
    $('over-new').style.display = isBest ? '' : 'none';
    $('over-height').textContent = W.height + 'm';
    $('over-stars').textContent = W.starsGot;
    $('over-time').textContent = JP.fmtTime(W.t);
    wakeLock(false);
    // 떨어지는 모습을 잠깐 보여 준 뒤 결과 화면
    setTimeout(() => { if (mode === 'over') show('scr-over'); }, 900);
  }

  function drainEvents(world, sound) {
    for (const ev of world.events) {
      if (!sound) continue;
      if (ev === 'bounce') JP.Audio.play('bounce', { k: world.combo });
      else if (ev === 'over') {
        JP.Audio.play(world.cause === 'fall' && !world.easy ? 'fall' : 'over', { soft: world.easy });
        vibrate(world.easy ? 60 : 220);
      } else JP.Audio.play(ev);
      if (ev === 'spring' || ev === 'rescue') vibrate([15, 30, 25]);
      else if (ev === 'star') vibrate(8);
      else if (ev === 'crumble' || ev === 'save') vibrate(30);
      else if (ev === 'rocket' || ev === 'shield') vibrate(20);
    }
    world.events.length = 0;
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 지원 안 하면 무시 */ }
  }

  // ─── 입력 연결 ─────────────────────────────────────────────
  input.onPress = () => JP.Audio.unlock();
  for (const b of document.querySelectorAll('[data-easy]')) b.addEventListener('click', () => { JP.Audio.unlock(); setEasy(b.dataset.easy === '1'); });
  input.onKey = code => {
    JP.Audio.unlock();
    if (code === 'KeyM') return toggleMute();
    if (mode === 'title' && (code === 'Enter' || code === 'Space')) return newGame();
    if (mode === 'over' && (code === 'Enter' || code === 'Space')) return newGame(lastSeed);
    if (code === 'KeyP' || code === 'Escape' || code === 'Space') return mode === 'play' ? pause() : resume();
  };

  function toggleMute() {
    JP.Audio.unlock();
    JP.Audio.setMuted(!JP.Audio.muted);
    JP.store.set(MUTE_KEY, JP.Audio.muted);
    $('btn-mute').classList.toggle('muted', JP.Audio.muted);
    toast(JP.Audio.muted ? '소리 끔' : '소리 켬');
  }

  // 브라우저는 첫 터치·클릭 뒤에야 소리를 허락한다
  window.addEventListener('pointerdown', () => JP.Audio.unlock(), { passive: true });
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  // 기록이 브라우저 정리 때 지워지지 않게 요청 (돈 0원, 이 기기 안에서만)
  const keep = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 무시 */ } };
  $('btn-start').addEventListener('click', () => { keep(); newGame(); });
  $('btn-medals').addEventListener('click', () => { JP.Audio.unlock(); openMedals(); });
  $('btn-medals-back').addEventListener('click', toTitle);
  $('btn-retry').addEventListener('click', () => newGame(lastSeed));
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
  // 뒤로 가기 제스처·앱 전환으로 창이 가려져도 멈춤 화면
  window.addEventListener('pagehide', pause);

  // ─── 루프 ──────────────────────────────────────────────────
  function frame(ts) {
    const raw = (ts - lastTs) / 1000 || 0;
    const dt = Math.min(0.05, raw);
    lastTs = ts;
    // 화면 주사율 살피기: 100Hz가 넘으면 그리기는 한 번 걸러 (물리는 매번 돈다)
    if (raw > 0 && raw < 0.1) fastScreen = fastScreen * 0.9 + (raw < 0.0095 ? 1 : 0) * 0.1;
    skip = fastScreen > 0.6 ? !skip : false;

    if (mode === 'title') {
      // 시연: 자동 운전 로봇이 시작 화면 뒤에서 통통 튄다. 끝나면 잠시 뒤 새로
      fit(demo);
      if (!demo) { demo = JP.World.create(777, { easy: true, viewH: view.viewH }); demoRest = 0; }
      if (demo.phase === 'play') { demo.input.dir = JP.World.botDir(demo); JP.World.step(demo, dt); }
      else if ((demoRest += dt) > 1.5) demo = null;
      if (demo && demo.t > 90) demo = null;   // 너무 높이 가면 처음부터
      if (demo) {
        drainEvents(demo, false);
        if (!skip) JP.Render.draw(ctx, demo, demoView, dt);
      }
    } else if (W) {
      fit(W);
      if (mode === 'play') {
        W.input.dir = auto ? JP.World.botDir(W) : input.dir();
        JP.World.step(W, dt);
        drainEvents(W, true);
        // 게임 중에 딸 수 있는 메달은 바로 알려 준다
        if ((medalCheckT += dt) > 0.5 && W.phase === 'play') { medalCheckT = 0; checkMedals(true); }
        if (W.phase === 'over') gameOver();
        frozenDrawn = false;
      } else if (mode === 'over') {
        input.dir();   // 화살표 불빛 끄기
      }
      // 결과 화면이 뜨고 연출이 끝나면 그리기를 쉰다 (배터리)
      const idle = mode === 'paused' || (mode === 'over' && performance.now() - overAt > 1300 && !JP.Render.busy());
      if ((!idle || !frozenDrawn) && !(skip && !idle)) {
        JP.Render.draw(ctx, W, view, mode === 'play' || mode === 'over' ? dt : 0);
        frozenDrawn = idle;
      }
    }
    requestAnimationFrame(frame);
  }

  // ─── 시작 ──────────────────────────────────────────────────
  renderEasy();
  JP.Audio.setMuted(JP.store.get(MUTE_KEY, false));
  $('btn-mute').classList.toggle('muted', JP.Audio.muted);
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
  JP.debug = {
    get world() { return W; },
    get mode() { return mode; },
    get demo() { return demo; },
    get rec() { return rec; }, get easy() { return easy; }, setEasy,
    newGame, pause, resume, toTitle, openMedals,
    autopilot(on) { auto = on !== false; return auto; },
    get pad() { return input; }, get view() { return view; },
  };
})(JP);
