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
  const PF = RN.Prefs;

  // ─── 소리: 네 게임이 함께 쓰는 common/sound.js (SND). 화면 소리·배경 음악·소리 끄기는 SND, 게임 효과음은 RN.Audio ───
  const HAS_SND = typeof SND !== 'undefined' && SND;
  const ui = (name, o) => { if (HAS_SND) SND.ui(name, o); };
  // 배경 음악 행성 id: 은하 너머(beyond)는 공통 음악의 galaxy
  const planetOf = zone => { const id = RN.World.placeOf(zone).id; return id === 'beyond' ? 'galaxy' : id; };
  // 음악 분위기는 바뀔 때만 보낸다 (매 프레임 부르지 않게)
  const mood = { fever: false, boss: false, calm: false };
  function musicMood(o) {
    if (!HAS_SND) return;
    const ch = {};
    for (const k in o) if (mood[k] !== o[k]) { mood[k] = o[k]; ch[k] = o[k]; }
    if (Object.keys(ch).length) SND.music.setMood(ch);
  }
  function musicPlay(planet) { if (HAS_SND) { SND.music.duck(1); SND.music.play('runner', planet); } }
  const musicDuck = v => { if (HAS_SND) SND.music.duck(v); };
  const musicStop = sec => { if (HAS_SND) SND.music.stop(sec); };

  const view = { dpr: 1, w: 0, h: 0, ui: 1, hudMid: 32, hudLeft: 150, hudRight: 14, touch: isTouch, calm: false, best: 0 };
  view.pad = input;   // 밀기 화살표 그리기용 (render.js가 읽기만 한다)
  const demoView = Object.create(view, { hud: { value: false } });

  let W = null;        // 실제 판
  let demo = null;     // 시작 화면 뒤에서 자동 운전으로 도는 시연 판
  let mode = 'title';  // title | play | paused | cont (한 번 더?) | over
  let auto = false;    // 자동 운전 (테스트용)
  let overAt = 0;
  // 난이도: 'easy' | 'normal' | 'hard'. 쉬움이 기본, 이 기기에 기억한다 (옛 runner.easy도 이어받는다)
  let diff = PF.diff(RN.store);
  // 기록 장부: 난이도별 최고 거리·점수, 모두 합친 수, 받은 메달 (이 기기 안에만)
  let rec = PF.rec(RN.store);
  const saveRec = () => RN.store.set(PF.KEYS.rec, rec);
  const bestOf = d => rec.best[d] || rec.best.easy;
  // 코인·상점·미션 (shop.js). 저장 키 runner.shop1, 코인은 네 게임이 함께 쓰는 지갑(common/hub.js)
  const SH = RN.Shop;
  let shop = SH.load();
  let shopTab = 'chars';
  const TAB_ALIAS = { skins: 'chars' };   // 옛 칸 이름
  let lastEarn = null;   // 이번 판에 받은 코인 {coins, parts, done}
  const fmt = n => Math.floor(n).toLocaleString();
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let lastOpts = {};
  let medalCheckT = 0;
  let lastTs = 0;
  let frozenDrawn = false;   // 일시정지 화면에선 한 번만 그리고 쉰다 (배터리)

  // ─── 화면 크기 ─────────────────────────────────────────────
  function renderDiff() {
    for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === diff));
    renderBest();
  }
  function setDiff(id) {
    if (!D.DIFFICULTY[id]) return;
    diff = id; PF.setDiff(RN.store, id); renderDiff();
  }
  // 옛 손잡이: 켜면 쉬움, 끄면 보통
  function setEasy(on) { setDiff(on ? 'easy' : 'normal'); }

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
  const screens = ['scr-title', 'scr-shop', 'scr-pause', 'scr-over', 'scr-medals', 'scr-cont'];
  // 누르기 막기: 결과 화면·한 번 더 화면이 막 떴을 때 (부딪힌 뒤에도 계속 누르는 아이 손가락이 버튼을 잘못 누르지 않게)
  let guardUntil = 0;
  const guarded = () => performance.now() < guardUntil;
  function show(id) {
    for (const s of screens) $(s).classList.toggle('on', s === id);
    document.body.classList.toggle('playing', mode === 'play');
    document.body.classList.toggle('at-title', id === 'scr-title');
    input.active = mode === 'play';
    if (mode === 'play') measureHud();
    hideToast();   // 다른 화면으로 넘어가면 글 띠를 지운다 (새 화면의 버튼을 가리지 않게)
    if (id === 'scr-over' || id === 'scr-cont') {
      const el = $(id), ms = D.CONTINUE.guard * 1000;
      guardUntil = performance.now() + ms;
      el.classList.add('guard');
      setTimeout(() => el.classList.remove('guard'), ms);
    }
  }

  let toastTimer = 0;
  function hideToast() { clearTimeout(toastTimer); $('toast').classList.remove('on'); }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1400);
  }

  function renderBest() {
    const b = bestOf(diff), name = D.DIFFICULTY[diff].name;
    view.best = b.dist;
    $('best').textContent = b.dist > 0
      ? name + ' 최고 ' + b.dist.toLocaleString() + 'm · ' + b.score.toLocaleString() + '점'
      : name + ' 첫 비행을 시작해요';
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
      if (live) { toast('메달 획득: ' + fresh.map(m => m.name).join(', ')); ui('medal'); vibrate([20, 40, 20]); }
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
    const T = rec.total, rows = D.DIFF_ORDER.map(d => {
      const b = rec.best[d];
      return [D.DIFFICULTY[d].name + ' 최고', b.dist > 0 ? b.dist.toLocaleString() + 'm · ' + b.score.toLocaleString() + '점' : '아직'];
    }).concat([
      ['모두 한 판', T.games], ['모은 별', T.stars.toLocaleString()], ['모두 달린 거리', Math.floor(T.dist).toLocaleString() + 'm'],
    ]);
    $('record-list').innerHTML = rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
    ui('open');
    show('scr-medals');
  }

  // ─── 흐름 ──────────────────────────────────────────────────
  // opts: { diff } 또는 옛 방식 { easy } 를 주면 그 난이도로 (없으면 지금 고른 난이도).
  // 처음 한 판은 조작 안내가 나온다 (opts.tutorial로 켜고 끌 수 있다)
  function newGame(seed, opts) {
    RN.Audio.unlock();
    opts = opts || {};
    if (D.DIFFICULTY[opts.diff]) setDiff(opts.diff);
    else if (typeof opts.easy === 'boolean') setEasy(opts.easy);
    const tutorial = typeof opts.tutorial === 'boolean' ? opts.tutorial : PF.tutorialPending(RN.store);
    // 안내를 이 기기에서 두 판 시작했으면 다 못 마쳐도 다음부터는 안 나온다 (매 판 안내가 나오지 않게)
    if (tutorial && typeof opts.tutorial !== 'boolean') PF.startTutorial(RN.store);
    lastOpts = { diff, tutorial };
    // 시작 아이템은 이번 판에 하나씩 쓰고 사라진다
    const lo = SH.takeLoadout(shop, diff);
    SH.save(shop);
    // 알아서 맞춰 주는 난이도 (놀이 본부가 최근 판들을 보고 0.85 ~ 1.12, 처음 두 판은 1)
    let adapt = 1;
    try { if (typeof HUB !== 'undefined' && HUB.adaptMul) adapt = HUB.adaptMul('runner', diff) || 1; } catch (e) { adapt = 1; }
    W = RN.World.create(seed, Object.assign({}, lastOpts, SH.worldOpts(shop, lo), { adapt }));
    view.best = bestOf(diff).dist;
    medalCheckT = 0;
    input.reset();
    mode = 'play';
    wakeLock(true);
    show(null);
    pushHistory();
    ui('start');
    // 배경 음악: 첫 행성(수성)부터. 쉬움은 차분하게
    musicMood({ fever: false, boss: false, calm: diff === 'easy' });
    musicPlay(planetOf(W.zone));
    return W;
  }

  function toTitle() {
    clearTimeout(contTimer);
    popHistory();
    W = null;
    mode = 'title';
    wakeLock(false);
    renderBest();
    renderTitleShop();
    show('scr-title');
    musicMood({ fever: false, boss: false, calm: false });
    musicPlay('title');
  }

  // ─── 상점 · 미션 화면 ──────────────────────────────────────
  const ICON = { magnet: 'i-magnet', shield: 'i-shield', boost: 'i-bolt', star: 'i-star', heart: 'i-heart' };
  const ICON_COL = { magnet: '#ff5fa8', shield: '#5ee7ff', boost: '#ffe66d', star: '#ffe66d', heart: '#ff6b8a' };
  const iconSvg = k => '<svg class="i" aria-hidden="true" style="color:' + (ICON_COL[k] || '#5ee7ff') + '"><use href="#' + (ICON[k] || 'i-star') + '"/></svg>';
  function missionsHtml(head) {
    return '<p class="mc-head">' + head + '</p>' + SH.missionView(shop).map((m, i) =>
      '<div class="mrow' + (m.done ? ' done' : '') + '" data-mid="' + m.id + '">' +
        '<span class="m-txt">' + esc(m.text) + '</span>' +
        (m.done
          ? '<button type="button" class="claim" data-claim="' + i + '">받기 <i class="cn" aria-hidden="true"></i>' + m.reward + '</button>'
          : '<span class="m-rew"><i class="cn" aria-hidden="true"></i>' + m.reward + '</span>') +
        '<span class="m-bar"><i style="width:' + Math.round(m.pct * 100) + '%"></i></span>' +
        '<span class="m-num">' + fmt(m.prog) + ' / ' + fmt(m.goal) + (m.kind === 'life' ? ' · 여러 판' : ' · 한 판') + '</span>' +
      '</div>').join('');
  }
  function renderTitleShop() {
    const ch = SH.charDef(shop.char) || D.CHARS[0];
    RN.Render.paintChar($('ship-preview'), ch.id);
    $('ship-name').textContent = ch.name;
    $('ship-desc').textContent = ch.desc;
    $('btn-ship').style.setProperty('--sc', ch.ui);
    if (demo) demo.char = ch.id;   // 시작 화면 뒤 시연도 고른 캐릭터로
    $('coin-count').textContent = fmt(shop.coins);
    $('title-missions').innerHTML = missionsHtml('미션');
    const lo = D.START_ITEMS.filter(it => shop.items[it.id] > 0).map(it => it.name + (shop.items[it.id] > 1 ? ' ×' + shop.items[it.id] : ''));
    $('loadout-line').textContent = lo.length ? '다음 판 시작 아이템: ' + lo.join(' · ') : '';
  }
  function priceBtn(id, label) {
    const cost = SH.price(shop, id);
    if (cost == null) return '<span class="maxed">' + label + '</span>';
    return '<button type="button" class="buy' + (shop.coins < cost ? ' poor' : '') + '" data-buy="' + id + '"><i class="cn" aria-hidden="true"></i>' + fmt(cost) + '</button>';
  }
  function renderShop() {
    $('shop-coins').textContent = fmt(shop.coins);
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === shopTab));
    const list = $('shop-list');
    list.className = 'shop-list t-' + shopTab;
    let h = '';
    if (shopTab === 'chars') {
      $('shop-sub').textContent = '캐릭터마다 모양과 특기가 달라요. 가진 캐릭터는 눌러서 고르세요';
      h = D.CHARS.map(ch => {
        const own = !!shop.chars[ch.id], cur = shop.char === ch.id;
        return '<div class="sitem skin char' + (cur ? ' cur' : '') + (own ? '' : ' locked') + '" style="--sc:' + ch.ui + '">' +
          '<canvas class="ship-cv" width="160" height="160" data-char="' + ch.id + '" aria-hidden="true"></canvas>' +
          '<b class="s-name">' + esc(ch.name) + '</b><span class="s-desc">' + esc(ch.desc) + '</span>' +
          (cur ? '<span class="maxed on">사용 중</span>' : own ? '<button type="button" class="use" data-use="' + ch.id + '">고르기</button>' : priceBtn(ch.id, '')) +
        '</div>';
      }).join('');
    } else if (shopTab === 'up') {
      $('shop-sub').textContent = '한 번 사면 모든 판에 계속 적용돼요 (5단계)';
      h = D.UPGRADES.map(u => {
        const lv = shop.up[u.id] || 0;
        let pips = '';
        for (let k = 0; k < D.UPGRADE_MAX; k++) pips += '<i class="' + (k < lv ? 'on' : '') + '"></i>';
        return '<div class="sitem row"><span class="s-icon">' + iconSvg(u.icon) + '</span>' +
          '<span class="s-mid"><b class="s-name">' + esc(u.name) + ' <small>' + lv + '단계</small></b><span class="s-desc">' + esc(u.desc) + '</span><span class="pips">' + pips + '</span></span>' +
          priceBtn(u.id, '최대') + '</div>';
      }).join('');
    } else {
      $('shop-sub').textContent = '사 두면 다음 판 시작할 때 하나씩 자동으로 써요 (종류마다 3개까지)';
      h = D.START_ITEMS.map(it => {
        const n = shop.items[it.id] || 0;
        return '<div class="sitem row"><span class="s-icon">' + iconSvg(it.icon) + '</span>' +
          '<span class="s-mid"><b class="s-name">' + esc(it.name) + ' <small>' + n + '/' + it.max + '개</small></b><span class="s-desc">' + esc(it.desc) + '</span></span>' +
          priceBtn(it.id, '가득') + '</div>';
      }).join('');
    }
    list.innerHTML = h;
    for (const cv of list.querySelectorAll('canvas[data-char]')) RN.Render.paintChar(cv, cv.dataset.char);
  }
  function openShop(tab) {
    if (mode !== 'title') return;
    RN.Audio.unlock();
    mode = 'shop';
    if (tab) shopTab = TAB_ALIAS[tab] || tab;
    renderShop();
    ui('open');
    show('scr-shop');
  }
  function closeShop() {
    if (mode !== 'shop') return;
    mode = 'title';
    renderBest(); renderTitleShop();
    ui('close');
    show('scr-title');
  }
  const NAMES = { coins: '코인이 모자라요', owned: '이미 가진 캐릭터예요', max: '더는 살 수 없어요' };
  function buyThing(id) {
    const r = SH.buy(shop, id);
    if (r.ok) {
      SH.save(shop);
      ui('buy');
      vibrate(20);
      if (SH.charDef(id)) toast('새 캐릭터: ' + SH.charDef(id).name + '!');
    } else {
      ui('deny');
      toast(NAMES[r.reason] || '살 수 없어요');
    }
    if (mode === 'shop') renderShop();
    renderTitleShop();
    return r;
  }
  function useChar(id) {
    const ok = SH.selectChar(shop, id);
    if (ok) { SH.save(shop); ui('tap'); }
    if (mode === 'shop') renderShop();
    renderTitleShop();
    return ok;
  }
  // 미션 보상 받기: 코인 +, 소리, 버튼 자리에서 "+120"이 튀어 오른다
  function claimMission(i, btn) {
    const got = SH.claim(shop, i);
    if (!got) return 0;
    SH.save(shop);
    ui('claim');
    vibrate([15, 30, 15]);
    if (btn && !view.calm) {
      const r = btn.getBoundingClientRect(), pop = document.createElement('span');
      pop.className = 'coin-pop'; pop.textContent = '+' + got;
      pop.style.left = (r.left + r.width / 2) + 'px'; pop.style.top = r.top + 'px';
      document.body.appendChild(pop);
      setTimeout(() => pop.remove(), 1000);
    }
    renderTitleShop();
    if (mode === 'over') { $('over-missions').innerHTML = missionsHtml('미션'); markNew('over-missions', i); }
    else markNew('title-missions', i);
    return got;
  }
  function markNew(id, i) { const row = $(id).querySelectorAll('.mrow')[i]; if (row) row.classList.add('fresh'); }

  // 게임 오버: 받은 코인 (부분별) + 미션 진행
  function renderEarn() {
    const e = lastEarn || { coins: 0, parts: {}, done: [] }, P = e.parts;
    $('over-coins').textContent = '+0';
    const bits = [['거리', P.dist], ['별', P.stars], ['기념 아치', P.arch], ['행성', P.zone], ['난이도', P.diff], ['강화 보너스', P.bonus], ['선물', P.gift]];
    $('over-coin-parts').innerHTML = bits.filter(b => b[1] > 0).map(b => '<span>' + b[0] + ' <b>' + fmt(b[1]) + '</b></span>').join('');
    $('over-missions').innerHTML = missionsHtml(e.done.length ? '미션 완료 ' + e.done.length + '개! 받기를 누르세요' : '미션');
    for (const id of e.done) { const row = $('over-missions').querySelector('[data-mid="' + id + '"]'); if (row) row.classList.add('fresh'); }
  }
  function countCoins() {
    const el = $('over-coins'), total = lastEarn ? lastEarn.coins : 0;
    if (view.calm || total <= 0) { el.textContent = '+' + fmt(total); return; }
    const t0 = performance.now(), dur = 1100;
    let lastTick = -1;
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), v = Math.round(total * (1 - Math.pow(1 - k, 3)));
      el.textContent = '+' + fmt(v);
      const st = Math.floor(k * 12);
      if (st !== lastTick) { lastTick = st; ui('coin'); }
      if (k < 1 && mode === 'over') requestAnimationFrame(tick);
      else { el.textContent = '+' + fmt(total); el.classList.add('done'); }
    };
    el.classList.remove('done');
    requestAnimationFrame(tick);
  }

  // 놀이 본부(common/hub.js)에 알린다: 기록실 요약과 오늘의 미션
  function reportSummary() {
    if (typeof HUB === 'undefined' || !HUB.report) return;
    try {
      let best = 0;
      for (const d of D.DIFF_ORDER) best = Math.max(best, rec.best[d].dist || 0);
      HUB.report('runner', { best, bestText: best ? '최고 ' + best.toLocaleString() + 'm' : '', medals: Object.keys(rec.medals).length, medalMax: D.MEDALS.length, games: rec.total.games });
    } catch (e) { /* 무시 */ }
  }
  function reportHub(quit) {
    if (typeof HUB === 'undefined' || !HUB.reportRun) return;
    reportSummary();
    // 알아서 맞춰 주는 난이도: 이번 판 성적 = 달린 거리 ÷ 그 난이도의 보통 잘하는 아이 거리 (스스로 그만둔 판은 넣지 않는다)
    try { if (HUB.adaptRun && !quit) HUB.adaptRun('runner', W.diff, W.dist / (D.ADAPT.target[W.diff] || 1000)); } catch (e) { /* 무시 */ }
    try {
      const s = RN.World.runStats(W);
      // 스티커·오늘의 미션: 거리 · 별 · 넘은 레이저 문 · 미끄러지기 · 가장 멀리 간 행성(1 수성 ~ 9 명왕성) · 따돌린 해적선
      //   · 연 선물 상자 · 피버 타임 · 지나간 워프 관문
      const fresh = HUB.reportRun('runner', { dist: s.dist, stars: s.stars, jumps: s.gates, slides: s.slides, planet: s.planet, pirates: s.pirates,
        gifts: s.gifts, fevers: s.fevers, warps: s.warps, games: 1 }, W.runT);
      if (fresh && fresh.length) setTimeout(() => toast('오늘의 미션 완료: ' + fresh[0]), 1200);
    } catch (e) { /* 본부 기록이 실패해도 게임은 계속 */ }
  }

  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    frozenDrawn = false;
    ui('open');
    musicDuck(0.3);   // 멈춤 화면에서는 음악을 작게
    show('scr-pause');
  }

  function resume() {
    if (mode !== 'paused') return;
    input.reset();
    mode = 'play';
    ui('close');
    musicDuck(1);
    show(null);
  }

  // 판을 마무리한다 (게임 오버와 일시정지 → 처음 화면으로 둘 다): 기록 장부·메달·코인·미션·놀이 본부.
  // quit: 스스로 그만뒀다 (알아서 맞춰 주는 난이도에는 넣지 않는다: 진 판이 아니니까)
  function settle(quit) {
    if (!W || W.settled) return null;
    W.settled = true;
    // 다른 창(놀이 본부·다른 게임)에서 지갑이 바뀌었을 수 있으니 저장본을 다시 읽고 더한다
    shop = SH.load();
    rec = PF.rec(RN.store);
    const newRec = [], T = rec.total, dist = Math.floor(W.dist), B = bestOf(W.diff);
    T.games++; T.stars += W.stars; T.dist += dist;
    const isBest = W.score > B.score && W.score > 0;
    if (isBest) B.score = W.score;
    if (dist > B.dist) { B.dist = dist; newRec.push('최고 거리 ' + dist.toLocaleString() + 'm'); }
    if (W.stars > B.stars) { B.stars = W.stars; newRec.push('한 판 별 ' + W.stars); }
    saveRec();
    const fresh = checkMedals(false);
    lastEarn = SH.finishRun(shop, SH.runOf(W));
    SH.save(shop);
    reportHub(quit);
    return { newRec, isBest, fresh, dist, B };
  }

  // 일시정지 → 처음 화면으로: 판을 버리지 않고 마무리한다 (코인·미션·메달·기록 모두)
  function quitRun() {
    if (!W || (mode !== 'paused' && mode !== 'cont')) return toTitle();
    const moved = W.dist >= 1;
    const r = moved ? settle(true) : null;
    toTitle();
    if (r) {
      const bits = ['코인 +' + fmt(lastEarn ? lastEarn.coins : 0)];
      if (r.fresh.length) bits.push('메달 ' + r.fresh.map(m => m.name).join(', '));
      if (lastEarn && lastEarn.done.length) bits.push('미션 완료 ' + lastEarn.done.length + '개');
      toast(bits.join(' · '));
    }
  }

  // ─── 한 번 더! (하트가 다했을 때 한 판에 한 번) ─────────────────
  let contTimer = 0, contTick = 0;
  function crashed() {
    if (RN.World.canContinue(W)) {
      mode = 'cont';
      input.active = false;
      overAt = performance.now();
      wakeLock(false);
      musicDuck(0.3);
      // 부딪힌 연출을 잠깐 보여 준 뒤 물어본다
      clearTimeout(contTimer);
      contTimer = setTimeout(askContinue, D.CONTINUE.show * 1000);
    } else gameOver();
  }
  function askContinue() {
    if (mode !== 'cont') return;
    $('cont-title').textContent = causeText(W.cause);
    const ask = D.CONTINUE.ask;
    let left = ask;
    $('cont-num').textContent = left;
    const ring = $('cont-ring');
    ring.style.animation = 'none'; void ring.getBoundingClientRect(); ring.style.animation = '';
    ring.style.animationDuration = ask + 's';
    show('scr-cont');
    ui('continueAsk');
    clearInterval(contTick);
    // 초 세기: 한 칸마다 똑딱, 마지막 1은 높은 소리
    contTick = setInterval(() => {
      left--;
      if (mode !== 'cont') { clearInterval(contTick); return; }
      $('cont-num').textContent = Math.max(0, left);
      if (left >= 1) ui('tick', { hi: left === 1 });
    }, 1000);
    clearTimeout(contTimer);
    contTimer = setTimeout(() => { clearInterval(contTick); if (mode === 'cont') gameOver(); }, ask * 1000);
  }
  function contYes() {
    if (mode !== 'cont' || guarded() || !$('scr-cont').classList.contains('on')) return false;
    clearTimeout(contTimer); clearInterval(contTick);
    if (!RN.World.continueRun(W)) { gameOver(); return false; }
    input.reset();
    mode = 'play';
    wakeLock(true);
    show(null);
    ui('continueGo');
    musicDuck(1);
    vibrate([20, 30, 20]);
    return true;
  }
  function contNo() {
    if (mode !== 'cont' || guarded()) return false;
    clearTimeout(contTimer); clearInterval(contTick);
    gameOver();
    return true;
  }
  const causeText = c => ({ gate: '레이저에 찌릿!', bar: '막대에 머리 콩!', laser: '해적 레이저에 찌릿!', bomb: '해적 폭탄에 펑!' }[c] || '운석에 쾅!');

  function gameOver() {
    const fromCont = mode === 'cont';
    clearTimeout(contTimer); clearInterval(contTick);
    mode = 'over';
    input.active = false;
    overAt = performance.now();
    // 끝 소리: 쉬움은 더 부드럽게. 음악은 천천히 멈춘다
    ui(W.diff === 'easy' ? 'overSoft' : 'over');
    musicStop(0.8);
    musicMood({ fever: false, boss: false });
    const r = settle(false) || { newRec: [], isBest: false, fresh: [], dist: Math.floor(W.dist), B: bestOf(W.diff) };
    renderEarn();
    $('over-records').innerHTML = r.newRec.map(x => '<span>신기록 · ' + x + '</span>').join('');
    // 새 메달: 이름만 작은 칩으로 (여러 개여도 결과 화면이 한 화면에 들어가게)
    // 아주 많으면 다섯 개와 "+N개 더" (모두 메달·기록 화면에 있다)
    const MC = 6, shown = r.fresh.length > MC ? r.fresh.slice(0, MC - 1) : r.fresh;
    $('over-medals').innerHTML = shown.map(m => '<span class="mchip t' + m.tier + '"><i>' + TIER[m.tier] + '</i>' + esc(m.name) + '</span>').join('') +
      (r.fresh.length > shown.length ? '<span class="mchip more">새 메달 ' + (r.fresh.length - shown.length) + '개 더</span>' : '');
    // 신기록이면 결과 화면이 뜰 때 팡파르, 새 메달 소리는 그 뒤에
    const best = r.isBest || r.newRec.length > 0, showMs = fromCont ? 0 : 900;
    if (best) setTimeout(() => { if (mode === 'over') ui('fanfare'); }, showMs);
    if (r.fresh.length) setTimeout(() => { if (mode === 'over') ui('medal'); }, showMs + (best ? 1700 : 0));
    $('over-title').textContent = causeText(W.cause);
    $('over-score').textContent = W.score.toLocaleString();
    $('over-new').style.display = r.isBest ? '' : 'none';
    $('over-dist').textContent = r.dist.toLocaleString() + 'm';
    $('over-stars').textContent = W.stars;
    $('over-time').textContent = RN.fmtTime(W.runT);
    const place = RN.World.placeOf(W.zone);
    $('over-diff').textContent = D.DIFFICULTY[W.diff].name + ' 최고 ' + r.B.dist.toLocaleString() + 'm · ' + place.name + '까지' + (place.lap > 1 ? ' (' + place.lap + '바퀴째)' : '');
    wakeLock(false);
    // 부딪힌 연출을 잠깐 보여 준 뒤 결과 화면 (한 번 더 화면에서 왔으면 바로)
    setTimeout(() => { if (mode === 'over') { show('scr-over'); countCoins(); } }, fromCont ? 0 : 900);
  }

  function drainEvents(world, sound) {
    for (const ev of world.events) {
      if (!sound) continue;
      if (ev === 'star') RN.Audio.play('star', { k: (world.chain - 1) % 10 });
      else if (ev === 'zone') { RN.Audio.play('zone', { i: world.zone }); if (HAS_SND) SND.music.setMood({ planet: planetOf(world.zone) }); }
      else if (ev === 'perfect') RN.Audio.play('perfect', { n: world.perfects });
      else if (ev === 'over') RN.Audio.play('crash');   // 끝 알림(over·overSoft)은 gameOver가
      else if (ev !== 'continue') RN.Audio.play(ev);   // 이어하기 소리는 contYes의 continueGo
      if (ev === 'over') vibrate(180);
      else if (ev === 'hit') vibrate([40, 30, 40]);
      else if (ev === 'shield' || ev === 'smash') vibrate(30);
      else if (ev === 'power' || ev === 'boost' || ev === 'heal') vibrate([20, 30, 20]);
      else if (ev === 'pull') vibrate([30, 20, 30]);
      else if (ev === 'gift') vibrate([20, 30, 20, 30, 40]);
      else if (ev === 'fever' || ev === 'warp') vibrate([25, 25, 25]);
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
  for (const b of document.querySelectorAll('[data-diff]')) b.addEventListener('click', () => { RN.Audio.unlock(); setDiff(b.dataset.diff); ui('tap'); });
  input.onKey = code => {
    RN.Audio.unlock();
    if (code === 'KeyM') return toggleMute();
    if (mode === 'shop') { if (code === 'Escape') closeShop(); return; }
    if (mode === 'title' && (code === 'Enter' || code === 'Space')) return newGame();
    if (mode === 'cont') { if (code === 'Enter' || code === 'Space') contYes(); else if (code === 'Escape') contNo(); return; }
    if (mode === 'over' && (code === 'Enter' || code === 'Space')) return guarded() ? null : newGame();
    if (code === 'KeyP' || code === 'Escape') return mode === 'play' ? pause() : resume();
    if (mode === 'paused' && (code === 'Enter' || code === 'Space')) return resume();
  };

  // 소리 끄기: 네 게임·첫 화면이 함께 쓰는 설정 하나 (SND, 키 play.sound1)
  function toggleMute() {
    RN.Audio.unlock();
    if (HAS_SND) SND.toggleMuted();
    showMute();
    toast(RN.Audio.muted ? '소리 끔' : '소리 켬');
  }
  const showMute = () => $('btn-mute').classList.toggle('muted', RN.Audio.muted);
  if (HAS_SND) SND.onChange(showMute);   // 다른 게임·다른 창에서 바꿔도 버튼이 따라온다

  // 브라우저는 첫 터치·클릭 뒤에야 소리를 허락한다
  window.addEventListener('pointerdown', () => RN.Audio.unlock(), { passive: true });
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  // 기록이 브라우저 정리 때 지워지지 않게 요청 (돈 0원, 이 기기 안에서만)
  const keep = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 무시 */ } };
  $('btn-start').addEventListener('click', () => { keep(); newGame(); });
  $('btn-medals').addEventListener('click', () => { RN.Audio.unlock(); openMedals(); });
  $('btn-shop').addEventListener('click', () => openShop('chars'));
  $('btn-ship').addEventListener('click', () => openShop('chars'));
  $('btn-shop-back').addEventListener('click', closeShop);
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { shopTab = b.dataset.tab; renderShop(); ui('tap'); });
  $('shop-list').addEventListener('click', e => {
    const b = e.target.closest('[data-buy],[data-use]');
    if (!b) return;
    if (b.dataset.buy) buyThing(b.dataset.buy); else useChar(b.dataset.use);
  });
  for (const id of ['title-missions', 'over-missions']) {
    $(id).addEventListener('click', e => { const b = e.target.closest('[data-claim]'); if (b) claimMission(+b.dataset.claim, b); });
  }
  $('btn-medals-back').addEventListener('click', () => { ui('close'); toTitle(); });
  $('btn-retry').addEventListener('click', () => { if (!guarded()) newGame(); });
  $('btn-home').addEventListener('click', () => { if (!guarded()) toTitle(); });
  $('btn-resume').addEventListener('click', resume);
  $('btn-quit').addEventListener('click', quitRun);
  $('btn-cont').addEventListener('click', contYes);
  $('btn-cont-no').addEventListener('click', contNo);
  // 게임 고르기(집) 링크: 결과 화면에서는 막 떴을 때 누른 것은 무시
  $('btn-over-hub').addEventListener('click', e => { if (guarded()) e.preventDefault(); });
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

  // 다른 창·다른 게임에서 지갑이 바뀌었을 수 있다: 돌아오면(뒤로 가기로 저장된 페이지가 다시 보일 때도) 상점·기록을 다시 읽는다.
  // 옛 코인 수를 들고 있다가 함께 쓰는 지갑을 덮어쓰지 않게
  function refreshSaved() {
    if (mode !== 'title' && mode !== 'shop' && mode !== 'over') return;
    shop = SH.load();
    rec = PF.rec(RN.store);
    renderBest(); renderTitleShop();
    if (mode === 'shop') renderShop();
  }
  window.addEventListener('pageshow', e => { if (e.persisted) refreshSaved(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else {
      if (mode === 'play' || mode === 'paused') wakeLock(true);   // 돌아오면 다시 요청
      refreshSaved();
    }
  });
  // 뒤로 가기 제스처: 판을 하는 동안에만 나가지 않고 멈춤 화면으로. 기록을 판이 시작할 때만 하나 쌓고, 판에서 나오면 되돌린다
  // (시작 화면에서는 뒤로 가기 한 번이면 게임 고르기로)
  let histOn = false, ignorePop = false;
  function pushHistory() {
    if (histOn) return;
    try { history.pushState({ rn: 1 }, ''); histOn = true; } catch (e) { /* 무시 */ }
  }
  function popHistory() {
    if (!histOn) return;
    histOn = false;
    try { ignorePop = true; history.back(); } catch (e) { ignorePop = false; }
  }
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (!histOn) return;
    histOn = false;
    if (mode === 'play' || mode === 'paused') { pause(); pushHistory(); }
    else if (mode === 'cont') contNo();
    else if (mode === 'over') toTitle();
  });

  // ─── 루프 ──────────────────────────────────────────────────
  // 120Hz 화면에서도 60번만 그린다 (배터리·발열). 규칙은 흐른 시간만큼 1/120초 칸으로 돌아 결과가 같다
  const MIN_FRAME = 1000 / 60 - 2;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastTs < MIN_FRAME) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;

    if (mode === 'title' || mode === 'shop') {
      // 시연: 자동 운전 우주선이 시작 화면 뒤에서 달린다. 끝나면(드물게) 새로
      if (!demo || demo.phase !== 'play' || demo.dist > 3400) demo = RN.World.create(777 + Math.floor(Math.random() * 1000), { diff: 'easy', auto: true, wait: 0, char: shop.char });
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
        // 처음 안내를 마치면 이 기기에 적어 둔다 (다음 판부터 안 나온다)
        if (W.tut && W.tut.step === 'done' && !W.tut.saved) { W.tut.saved = true; PF.markTutorial(RN.store); }
        if (W.phase === 'over') crashed();
        frozenDrawn = false;
      }
      // 배경 음악 분위기: 피버는 빠르고 반짝, 해적 추격은 단조로 힘차게, 쉬움·블랙홀 구간은 차분하게
      if (mode === 'play') musicMood({ fever: W.phase === 'play' && W.fever > 0, boss: W.phase === 'play' && !!W.pir, calm: W.diff === 'easy' || !!W.bh });
      // 결과 화면이 뜨고 연출이 끝나면 그리기를 쉰다 (배터리)
      const idle = mode === 'paused' || ((mode === 'over' || mode === 'cont') && performance.now() - overAt > 1300 && !RN.Render.busy());
      if (!idle || !frozenDrawn) {
        RN.Render.draw(ctx, W, view, mode === 'play' || mode === 'over' || mode === 'cont' ? dt : 0);
        frozenDrawn = idle;
      }
    }
  }

  // 옛 꾸미기를 코인으로 돌려받았으면 한 번 알려 준다
  function tellRefund() {
    if (!shop.refunded) return;
    const n = shop.refunded;
    delete shop.refunded;
    setTimeout(() => toast('옛 꾸미기를 코인 ' + fmt(n) + '개로 돌려받았어요'), 600);
  }

  // ─── 시작 ──────────────────────────────────────────────────
  renderDiff();
  tellRefund();
  reportSummary();
  showMute();
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
    get easy() { return diff === 'easy'; }, setEasy,
    get diff() { return diff; }, setDiff,
    newGame, pause, resume, toTitle, openMedals, quitRun, contYes, contNo,
    get guarded() { return guarded(); },
    get histOn() { return histOn; },
    move(dir) { return move(dir); },
    autopilot(on) { auto = on !== false; return auto; },
    // 상점·미션 (shop.js)
    get shop() { return shop; }, get missions() { return SH.missionView(shop); }, get lastEarn() { return lastEarn; },
    giveCoins(n) { shop.coins += n; SH.save(shop); renderTitleShop(); if (mode === 'shop') renderShop(); return shop.coins; },
    openShop, closeShop, claim: i => claimMission(i),
    buy: id => buyThing(id), selectChar: id => useChar(id), selectSkin: id => useChar(id),
    get char() { return shop.char; },
    reload() { rec = PF.rec(RN.store); shop = SH.load(); renderBest(); renderTitleShop(); tellRefund(); },
    get pad() { return input; }, get view() { return view; },
    get adapt() { return W ? W.adapt : 1; },
  };
})(RN);
