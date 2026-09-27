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
  const RC = JP.Records;

  const view = { dpr: 1, w: 0, h: 0, ui: 1, hudMid: 32, hudLeft: 150, hudRight: 14, hudH: 64, touch: isTouch, calm: false, bestH: 0 };
  view.pad = input;   // 누른 쪽 화살표 그리기용 (render.js가 읽기만 한다)
  const demoView = Object.create(view, { hud: { value: false } });

  let W = null;        // 실제 판
  let demo = null;     // 시작 화면 뒤에서 혼자 도는 시연 판
  let demoRest = 0;    // 시연 판이 끝난 뒤 다시 시작까지
  let mode = 'title';  // title | play | paused | over
  let auto = false;    // 자동 운전 (테스트·시연용)
  let overAt = 0;
  let diff = RC.loadDiff(JP.store);   // 쉬움이 기본. 이 기기에 기억한다 (예전 쉬움 켜기 키도 이어받음)
  let tutNeed = RC.needTutorial(JP.store);   // 처음 해 보는 판에만 큰 조작 안내
  let lastSeed;        // 다시 하기용 (시드를 정해 시작했으면 같은 판)

  // 기록 장부: 난이도별 최고 높이·점수, 모두 합친 수, 받은 메달 (이 기기 안에만, records.js)
  let rec = RC.load(JP.store);
  const saveRec = () => RC.save(rec, JP.store);
  // 코인·상점·미션 (shop.js, 저장 키 jump.shop1). 코인은 네 게임이 같이 쓰는 별코인 지갑(common/hub.js)
  const SH = JP.Shop;
  let shop = SH.load();
  let shopTab = 'chars';
  let lastEarn = null;   // 이번 판에 받은 코인 {coins, parts, done}
  view.char = shop.char;
  const fmt = n => Math.floor(n).toLocaleString();
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
  function renderDiff() {
    for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === diff));
    renderBest();
  }
  function setDiff(id) {
    if (!D.DIFFICULTY[id]) return diff;
    diff = id; RC.saveDiff(diff, JP.store); renderDiff();
    return diff;
  }
  // 예전 손잡이 (쉬움 켜기·끄기): 켜면 쉬움, 끄면 보통
  const setEasy = on => setDiff(on ? 'easy' : 'normal');

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
  const screens = ['scr-title', 'scr-shop', 'scr-pause', 'scr-over', 'scr-medals'];
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
    const b = rec.byDiff[diff], name = D.DIFFICULTY[diff].name;
    view.bestH = b.height;
    $('best').textContent = b.height > 0 ? name + ' 최고 ' + b.height + 'm · ' + b.score.toLocaleString() + '점' : name + ' 첫 도전! 얼마나 높이 갈까요?';
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
    const T = rec.total, rows = D.DIFF_ORDER.map(d => [D.DIFFICULTY[d].name + ' 최고', rec.byDiff[d].height + 'm · ' + rec.byDiff[d].score.toLocaleString() + '점']).concat([
      ['모두 한 판', T.games], ['모은 별', T.stars.toLocaleString()], ['모두 오른 높이', T.height.toLocaleString() + 'm'],
    ]);
    $('record-list').innerHTML = rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
    show('scr-medals');
  }

  // ─── 상점 · 미션 ───────────────────────────────────────────
  function missionsHtml(head) {
    const ms = SH.missionView(shop);
    return '<p class="mc-head">' + head + '</p>' + ms.map((m, i) =>
      '<div class="mrow' + (m.done ? ' done' : '') + '" data-mid="' + m.id + '">' +
        '<span class="m-txt">' + esc(m.text) + '</span>' +
        (m.done
          ? '<button type="button" class="claim" data-claim="' + i + '">받기 <i class="cn" aria-hidden="true"></i>' + m.reward + '</button>'
          : '<span class="m-rew"><i class="cn" aria-hidden="true"></i>' + m.reward + '</span>') +
        '<span class="m-bar"><i style="width:' + Math.round(m.pct * 100) + '%"></i></span>' +
        '<span class="m-num">' + fmt(m.prog) + ' / ' + fmt(m.goal) + (m.kind === 'life' ? ' 누적' : ' 한 판') + '</span>' +
      '</div>').join('');
  }

  function renderTitleShop() {
    const K = SH.charDef(shop.char) || D.CHARS[0];
    view.char = K.id;
    if (demo && demo.char !== K.id) demo = null;   // 시연 판도 고른 캐릭터로 새로
    JP.Render.paintChar($('char-preview'), K.id);
    $('char-name').textContent = K.name;
    $('char-desc').textContent = K.desc;
    $('btn-char').style.setProperty('--sc', 'rgb(' + K.glow + ')');
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
      $('shop-sub').textContent = '캐릭터마다 좋은 점이 하나씩 있어요. 산 캐릭터는 눌러서 고르세요';
      h = D.CHARS.map(k => {
        const own = !!shop.chars[k.id], cur = shop.char === k.id;
        return '<div class="sitem ship' + (cur ? ' cur' : '') + (own ? '' : ' locked') + '" style="--sc:rgb(' + k.glow + ')">' +
          '<canvas class="ship-cv" width="128" height="128" data-char="' + k.id + '" aria-hidden="true"></canvas>' +
          '<b class="s-name">' + esc(k.name) + '</b>' +
          '<span class="s-desc"><i class="trait">' + esc(k.short) + '</i> ' + esc(k.desc) + '</span>' +
          (cur ? '<span class="maxed on">사용 중</span>' : own ? '<button type="button" class="use" data-use="' + k.id + '">고르기</button>' : priceBtn(k.id, '')) +
        '</div>';
      }).join('');
    } else if (shopTab === 'up') {
      $('shop-sub').textContent = '한 번 사면 모든 판에 계속 적용돼요 (5단계)';
      h = D.UPGRADES.map(u => {
        const lv = shop.up[u.id] || 0;
        let pips = '';
        for (let k = 0; k < D.UPGRADE_MAX; k++) pips += '<i class="' + (k < lv ? 'on' : '') + '"></i>';
        return '<div class="sitem row"><span class="s-icon">' + u.icon + '</span>' +
          '<span class="s-mid"><b class="s-name">' + esc(u.name) + ' <small>Lv ' + lv + '</small></b><span class="s-desc">' + esc(u.desc) + '</span><span class="pips">' + pips + '</span></span>' +
          priceBtn(u.id, '최대') + '</div>';
      }).join('');
    } else {
      $('shop-sub').textContent = '사 두면 다음 판 시작할 때 하나씩 자동으로 써요 (종류마다 3개까지)';
      h = D.START_ITEMS.map(it => {
        const n = shop.items[it.id] || 0;
        return '<div class="sitem row"><span class="s-icon">' + it.icon + '</span>' +
          '<span class="s-mid"><b class="s-name">' + esc(it.name) + ' <small>' + n + '/' + it.max + '개</small></b><span class="s-desc">' + esc(it.desc) + '</span></span>' +
          priceBtn(it.id, '가득') + '</div>';
      }).join('');
    }
    list.innerHTML = h;
    for (const cv of list.querySelectorAll('canvas[data-char]')) JP.Render.paintChar(cv, cv.dataset.char);
  }

  function openShop(tab) {
    if (mode !== 'title') return;
    mode = 'shop';
    SH.sync(shop);
    if (tab) shopTab = tab;
    renderShop();
    show('scr-shop');
  }
  function closeShop() {
    if (mode !== 'shop') return;
    mode = 'title';
    renderBest(); renderTitleShop();
    show('scr-title');
  }

  const NAMES = { coins: '코인이 모자라요', owned: '이미 가진 캐릭터예요', max: '더는 살 수 없어요' };
  function buyThing(id) {
    const r = SH.buy(shop, id);
    if (r.ok) {
      SH.save(shop);
      JP.Audio.play('buy');
      vibrate(20);
      if (SH.charDef(id)) toast(SH.charDef(id).name + ' 출동!');
    } else {
      JP.Audio.play('deny');
      toast(NAMES[r.reason] || '살 수 없어요');
    }
    if (mode === 'shop') renderShop();
    renderTitleShop();
    return r;
  }
  function useChar(id) {
    const ok = SH.selectChar(shop, id);
    if (ok) { SH.save(shop); JP.Audio.play('pick'); }
    if (mode === 'shop') renderShop();
    renderTitleShop();
    return ok;
  }

  // 미션 보상 받기: 코인 +, 소리, 버튼 자리에서 "+120"이 튀어 오른다
  function claimMission(i, btn) {
    const got = SH.claim(shop, i);
    if (!got) return 0;
    SH.save(shop);
    JP.Audio.play('claim');
    vibrate([15, 30, 15]);
    if (btn && !view.calm) {
      const r = btn.getBoundingClientRect();
      const pop = document.createElement('span');
      pop.className = 'coin-pop';
      pop.textContent = '+' + got;
      pop.style.left = (r.left + r.width / 2) + 'px';
      pop.style.top = r.top + 'px';
      document.body.appendChild(pop);
      setTimeout(() => pop.remove(), 1000);
    }
    renderTitleShop();
    if (mode === 'over') { $('over-missions').innerHTML = missionsHtml('미션'); markNew('over-missions', i); }
    else markNew('title-missions', i);
    return got;
  }
  function markNew(id, i) {
    const row = $(id).querySelectorAll('.mrow')[i];
    if (row) row.classList.add('fresh');
  }

  // 게임 오버: 받은 코인 (부분별) + 미션 진행
  function renderEarn() {
    const e = lastEarn || { coins: 0, parts: { height: 0, stars: 0, zone: 0, level: 0, bonus: 0, gift: 0 }, done: [] };
    $('over-coins').textContent = '+0';
    const P = e.parts, bits = [['높이', P.height], ['별', P.stars], ['구역', P.zone], ['난이도 보너스', P.level], ['강화 보너스', P.bonus], ['선물', P.gift || 0]];
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
      const step = Math.floor(k * 12);
      if (step !== lastTick) { lastTick = step; JP.Audio.play('coin'); }
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
      for (const d of D.DIFF_ORDER) best = Math.max(best, rec.byDiff[d].height || 0);
      HUB.report('jump', { best, bestText: best ? '최고 ' + best.toLocaleString() + 'm' : '', medals: Object.keys(rec.medals).length, medalMax: D.MEDALS.length, games: rec.total.games });
    } catch (e) { /* 무시 */ }
  }
  // 알아서 맞춰 주는 난이도 (common/hub.js): 판을 시작할 때 배율, 끝날 때 얼마나 잘했나(오른 높이 ÷ 기준 높이)
  function adaptMul(d) {
    try { return typeof HUB !== 'undefined' && HUB.adaptMul ? HUB.adaptMul('jump', d) : 1; } catch (e) { return 1; }
  }
  function adaptRun() {
    try { if (typeof HUB !== 'undefined' && HUB.adaptRun) HUB.adaptRun('jump', W.diff, W.height / (D.ADAPT.target[W.diff] || 100)); } catch (e) { /* 무시 */ }
  }
  function reportHub() {
    if (typeof HUB === 'undefined' || !HUB.report) return;
    reportSummary();
    try {
      // 오늘의 미션·스티커북: 높이·별·스프링·밟은 몬스터·지나온 가장 먼 행성(1 수성 … 9 명왕성)·선물·피버·비밀 방 (이번 판)
      const fresh = HUB.reportRun('jump', { height: W.height, stars: W.starsGot, springs: W.springs, stomps: W.stomps, planet: W.planet, gifts: W.giftsGot, fevers: W.fevers, rooms: W.rooms, games: 1 }, W.t);
      if (fresh && fresh.length) setTimeout(() => toast('오늘의 미션 완료: ' + fresh[0]), 1200);
    } catch (e) { /* 본부 기록이 실패해도 게임은 계속 */ }
  }

  // ─── 흐름 ──────────────────────────────────────────────────
  // opts: {diff: 'easy'|'normal'|'hard'} 또는 예전 방식 {easy} (없으면 지금 고른 난이도), {tutorial} 처음 안내 강제
  function newGame(seed, opts) {
    JP.Audio.unlock();
    opts = opts || {};
    if (opts.diff && D.DIFFICULTY[opts.diff]) setDiff(opts.diff);
    else if (typeof opts.easy === 'boolean') setEasy(opts.easy);
    lastSeed = seed;
    fit(null);
    const tutorial = typeof opts.tutorial === 'boolean' ? opts.tutorial : tutNeed && !auto;
    // 시작 아이템은 이번 판에 하나씩 쓰고 사라진다. 강화는 계속
    const lo = SH.takeLoadout(shop);
    SH.save(shop);
    W = JP.World.create(seed, Object.assign({ diff, viewH: view.viewH, tutorial, adapt: opts.adapt != null ? opts.adapt : adaptMul(diff) }, SH.worldOpts(shop, lo)));
    view.bestH = rec.byDiff[diff].height;
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
    SH.sync(shop);
    renderBest();
    renderTitleShop();
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
    // 기록 장부 (난이도별): 신기록은 칩으로 보여 준다
    const { isBest, chips } = RC.finish(rec, JP.World.runStats(W));
    saveRec();
    const fresh = checkMedals(false);
    // 코인·미션 (상점)
    lastEarn = SH.finishRun(shop, SH.runOf(W));
    SH.save(shop);
    reportHub();
    if (!auto) adaptRun();
    renderEarn();
    $('over-records').innerHTML = chips.map(x => '<span>신기록 · ' + x + '</span>').join('') + (W.stomps ? '<span>꾹 밟은 몬스터 ' + W.stomps + '</span>' : '');
    $('over-medals').innerHTML = fresh.map(m => medalHtml(m, false)).join('');
    if (fresh.length) setTimeout(() => { if (mode === 'over') JP.Audio.play('medal'); }, 900);
    // 쉬움은 부드럽게 끝난다 (칭찬하는 말, 빨간색 없음)
    const soft = W.easy;
    $('scr-over').classList.toggle('soft', soft);
    $('over-title').textContent = soft ? (W.height >= 30 ? '높이 날았어요!' : '잘했어요!') : ({ mine: '가시 폭탄에 닿았다', monster: '몬스터에 부딪혔다', storm: '먹구름에 잡혔다' }[W.cause] || '아래로 떨어졌다');
    $('over-sub').textContent = soft ? '구름이 다 쉬러 갔어요. 한 번 더 해 볼까요?' : '';
    $('over-score').textContent = W.score.toLocaleString();
    $('over-new').style.display = isBest ? '' : 'none';
    $('over-height').textContent = W.height + 'm';
    $('over-combo').textContent = W.maxCombo;
    $('over-diff').textContent = D.DIFFICULTY[W.diff].name;
    $('over-zone').textContent = W.zone === 2 && W.planet > 0 ? D.PLANETS[W.planet - 1].name + ' 근처' : D.ZONES[W.zone].name + ' 구역';
    $('over-new-txt').textContent = D.DIFFICULTY[W.diff].name + ' 최고 점수 경신';
    $('over-stars').textContent = W.starsGot;
    $('over-time').textContent = JP.fmtTime(W.t);
    wakeLock(false);
    // 떨어지는 모습을 잠깐 보여 준 뒤 결과 화면
    setTimeout(() => { if (mode === 'over') { show('scr-over'); countCoins(); } }, 900);
  }

  function drainEvents(world, sound) {
    const zoneNow = world.events.includes('zone'), planetNow = world.events.includes('planet');
    for (const ev of world.events) {
      if (!sound) continue;
      if (ev === 'tut') { tutNeed = false; RC.tutorialDone(JP.store); }
      if (ev === 'mile' && (zoneNow || planetNow)) continue;   // 구역·행성 축하와 겹치면 그 소리만
      if (ev === 'zone' && planetNow) continue;
      if (ev === 'bounce') JP.Audio.play('bounce', { k: world.combo + (world.feverT > 0 ? 5 : 0), fever: world.feverT > 0 });
      else if (ev === 'over') {
        JP.Audio.play((world.cause === 'fall' || world.cause === 'storm') && !world.easy ? 'fall' : 'over', { soft: world.easy });
        vibrate(world.easy ? 60 : 220);
      } else JP.Audio.play(ev);
      if (ev === 'spring' || ev === 'rescue') vibrate([15, 30, 25]);
      else if (ev === 'star') vibrate(8);
      else if (ev === 'crumble' || ev === 'save') vibrate(30);
      else if (ev === 'stomp') vibrate([12, 20, 18]);
      else if (ev === 'bump') vibrate(15);
      else if (ev === 'storm') vibrate([40, 60, 40]);
      else if (ev === 'rocket' || ev === 'shield') vibrate(20);
      else if (ev === 'zone' || ev === 'planet') vibrate([20, 40, 20, 40, 30]);
      else if (ev === 'hole') vibrate([30, 50, 30]);
      else if (ev === 'gift' || ev === 'fever' || ev === 'room') vibrate([20, 40, 20]);
    }
    world.events.length = 0;
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 지원 안 하면 무시 */ }
  }

  // ─── 입력 연결 ─────────────────────────────────────────────
  input.onPress = () => JP.Audio.unlock();
  for (const b of document.querySelectorAll('[data-diff]')) b.addEventListener('click', () => { JP.Audio.unlock(); setDiff(b.dataset.diff); });
  input.onKey = code => {
    JP.Audio.unlock();
    if (code === 'KeyM') return toggleMute();
    if (mode === 'shop') { if (code === 'Escape') closeShop(); return; }
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
  $('btn-shop').addEventListener('click', () => { JP.Audio.unlock(); openShop('chars'); });
  $('btn-char').addEventListener('click', () => { JP.Audio.unlock(); openShop('chars'); });
  $('btn-shop-back').addEventListener('click', closeShop);
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { shopTab = b.dataset.tab; renderShop(); });
  $('shop-list').addEventListener('click', e => {
    const b = e.target.closest('[data-buy],[data-use]');
    if (!b) return;
    JP.Audio.unlock();
    if (b.dataset.buy) buyThing(b.dataset.buy); else useChar(b.dataset.use);
  });
  for (const id of ['title-missions', 'over-missions']) {
    $(id).addEventListener('click', e => { const b = e.target.closest('[data-claim]'); if (b) { JP.Audio.unlock(); claimMission(+b.dataset.claim, b); } });
  }
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

    if (mode === 'title' || mode === 'shop') {
      // 시연: 자동 운전 로봇이 시작 화면 뒤에서 통통 튄다. 끝나면 잠시 뒤 새로
      fit(demo);
      if (!demo) { demo = JP.World.create(777, { diff: 'easy', viewH: view.viewH, char: shop.char }); demoRest = 0; }
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
  renderDiff();
  renderTitleShop();
  reportSummary();
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
    get rec() { return rec; }, get easy() { return diff === 'easy'; }, setEasy,
    get diff() { return diff; }, setDiff,
    get tutorial() { return tutNeed; },
    // 상점·미션 (shop.js)
    get shop() { return shop; }, get missions() { return SH.missionView(shop); }, get lastEarn() { return lastEarn; },
    giveCoins(n) { shop.coins += n; SH.save(shop); renderTitleShop(); if (mode === 'shop') renderShop(); return shop.coins; },
    openShop, closeShop, claim: i => claimMission(i), buy: id => buyThing(id), selectChar: id => useChar(id), selectSkin: id => useChar(id),
    reload() { rec = RC.load(JP.store); shop = SH.load(); renderBest(); renderTitleShop(); }, resetTutorial() { tutNeed = true; JP.store.set(RC.TUT_KEY, false); },
    newGame, pause, resume, toTitle, openMedals, adaptMul,
    autopilot(on) { auto = on !== false; return auto; },
    get pad() { return input; }, get view() { return view; },
  };
})(JP);
