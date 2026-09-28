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
  let warnKey = '';
  const BEST_KEY = 'snake.best';   // {score, len}
  // 소리 끄기·음악은 네 게임 공통 (common/sound.js, 키 play.sound1). 옛 snake.muted는 SND가 처음 한 번 이어받는다
  const HAS_SND = typeof SND !== 'undefined' && !!SND;
  const MUS = HAS_SND ? SND.music : null;

  const view = { dpr: 1, w: 0, h: 0, ui: 1, hudMid: 32, hudLeft: 150, hudRight: 14, touch: isTouch, calm: false, best: 0 };
  view.pad = input;   // 밀기 화살표 그리기용 (render.js가 읽기만 한다)
  const demoView = Object.create(view, { hud: { value: false } });

  let W = null;        // 실제 판
  let demo = null;     // 시작 화면 뒤에서 혼자 도는 시연 판
  let demoRest = 0;    // 시연 판이 끝난 뒤 다시 시작까지
  let mode = 'title';  // title | shop | stage | medals | play | paused | cont(한 번 더?) | over
  let auto = false;    // 자동 운전 (테스트·시연용)
  let overAt = 0;
  let best = SN.store.get(BEST_KEY, { score: 0, len: 0 });
  if (!best || typeof best.score !== 'number') best = { score: 0, len: 0 };
  // 기록 장부: 무한·스테이지 최고, 모두 합친 수, 받은 메달 (이 기기 안에만)
  const REC_KEY = 'snake.rec';
  // best: 무한 모드 난이도별 최고 {easy|normal|hard: {score, len}} (2026-09-27, 어려움 추가 때. 그 전 기록은 endless에만 있다)
  // stage.stars: 단계마다 가장 많이 받은 별 {단계 번호: 1~3} (2026-09-27)
  const blankRec = () => ({ endless: { score: 0, len: 0, combo: 0 }, stage: { max: 0, score: 0, level: 0, stars: {} }, total: { games: 0, orbs: 0, golds: 0, powers: 0, portals: 0, levels: 0 }, medals: {},
    best: { easy: { score: 0, len: 0 }, normal: { score: 0, len: 0 }, hard: { score: 0, len: 0 } } });
  function loadRec() {
    const r = blankRec(), got = SN.store.get(REC_KEY, null);
    if (got && typeof got === 'object') for (const k of Object.keys(r)) {
      if (k === 'best') { const b = got.best || {}; for (const d of Object.keys(r.best)) if (b[d] && typeof b[d] === 'object') { r.best[d].score = Math.max(0, Number(b[d].score) || 0); r.best[d].len = Math.max(0, Number(b[d].len) || 0); } }
      else Object.assign(r[k], got[k] || {});
    }
    // 단계 별: 모양이 이상하면 버린다 (1~3만)
    const st = {};
    if (r.stage.stars && typeof r.stage.stars === 'object') for (const n of Object.keys(r.stage.stars)) { const v = Math.floor(Number(r.stage.stars[n])); if (/^\d+$/.test(n) && v >= 1) st[n] = Math.min(D.STARS.max, v); }
    r.stage.stars = st;
    // 예전 최고 기록(snake.best)을 무한 모드 기록으로 이어받는다
    r.endless.score = Math.max(r.endless.score, best.score || 0);
    r.endless.len = Math.max(r.endless.len, best.len || 0);
    return r;
  }
  let rec = loadRec();
  const saveRec = () => SN.store.set(REC_KEY, rec);
  const starTotal = () => Object.values(rec.stage.stars || {}).reduce((a, n) => a + n, 0);
  const starText = n => '★'.repeat(n) + '☆'.repeat(Math.max(0, D.STARS.max - n));
  let lastOpts = { mode: 'endless' };
  // 코인·상점·미션 (shop.js). 저장 키 snake.shop1, 코인은 네 게임이 같이 쓰는 지갑(common/hub.js)
  const SH = SN.Shop;
  let shop = SH.load();
  let shopTab = 'chars';
  let lastEarn = null;   // 이번 판에 받은 코인 {coins, parts, done}
  view.char = shop.char;
  const fmt = n => Math.floor(n).toLocaleString();
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let medalCheckT = 0;
  let lastTs = 0;
  let frozenDrawn = false; // 일시정지 화면에선 한 번만 그리고 쉰다 (배터리)

  // ─── 화면 크기 ─────────────────────────────────────────────
  const size = () => ({ w: window.innerWidth, h: window.innerHeight });
  // 판 모양: 가로 화면은 32×20, 세로 화면(폰)은 20×32
  // 난이도 쉬움(기본) · 보통 · 어려움. 이 기기에 기억한다 (snake.diff). 예전 snake.easy(true/false)는 쉬움·보통으로 이어받는다
  // 쉬움: 칸이 크고 느리며 판 끝을 넘으면 반대편으로
  const EASY_KEY = 'snake.easy', DIFF_KEY = 'snake.diff';
  let diff = SH.diffFrom(SN.store.get(DIFF_KEY, null), SN.store.get(EASY_KEY, null));
  const boardFor = ({ w, h }) => { const B = diff === 'easy' ? D.EASY.board : D.BOARD; return h > w * 1.1 ? B.port : B.land; };
  const diffName = id => (D.DIFFS.find(d => d.id === id) || D.DIFFS[1]).name;

  // 판은 화면을 가득 쓴다 (버튼 자리를 비우지 않는다. 조작은 화면 밀기)
  function fit(world) {
    const L = SN.Render.layout(world.cols, world.rows, view.w, view.h, view.hudH);
    Object.assign(view, L);
  }
  function renderDiff() {
    for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === diff));
  }
  function setDiff(id) {
    if (!D.DIFFS.some(d => d.id === id)) return diff;
    diff = id; SN.store.set(DIFF_KEY, diff); SN.store.set(EASY_KEY, diff === 'easy'); renderDiff();
    demo = null;
    if (mode === 'title') renderBest();
    return diff;
  }
  // 옛 손잡이: true 쉬움 · false 보통
  function setEasy(on) { return setDiff(on ? 'easy' : 'normal'); }
  // 라이벌 뱀 켜기·끄기 (그냥 놀기에만, 처음엔 켬). 이 기기에 기억한다
  const RIVAL_KEY = 'snake.rival';
  let rivalOn = SN.store.get(RIVAL_KEY, true) !== false;
  function renderRival() {
    const b = $('btn-rival');
    b.setAttribute('aria-pressed', String(rivalOn));
    $('rival-state').textContent = rivalOn ? '켬' : '끔';
  }
  function setRival(on) { rivalOn = !!on; SN.store.set(RIVAL_KEY, rivalOn); renderRival(); }
  // 우주 여행 이어 가기 (2026-09-27): 그냥 놀기는 지난 판에 닿은 행성에서 출발한다 (행성 번호 0~16, 이 기기에 기억)
  const SKY_KEY = 'snake.sky';
  const skyStart = () => SN.World.skyStartOf(SN.store.get(SKY_KEY, 0));
  function keepSky() { if (W && W.mode === 'endless' && W.space) SN.store.set(SKY_KEY, SN.World.skyNext(W)); }

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
  const screens = ['scr-title', 'scr-pause', 'scr-over', 'scr-cont', 'scr-stage', 'scr-medals', 'scr-shop'];
  const shownAt = {};
  // 게임 중 알림 자리: 판 위쪽 안 (HUD 칸을 가리지 않게). 뱀 머리가 그 근처면 판 가운데로 옮긴다 (판 아래 줄은 비워 둔다)
  function placeToast() {
    const t = $('toast');
    if (mode !== 'play' || !W || !view.cell || !t.classList.contains('on')) { if (t.style.top) t.style.top = ''; return; }
    const h = W.snake[0], hy = view.by + (h.y + 0.5) * view.cell, hx = view.bx + (h.x + 0.5) * view.cell;
    const th = t.offsetHeight || 40, tw = t.offsetWidth || 300;
    let y = view.by + 10;
    const near = hy < y + th + view.cell * 1.5 && Math.abs(hx - innerWidth / 2) < tw / 2 + view.cell * 2;
    if (near) y = Math.round(view.by + view.bh * 0.5 - th / 2);
    t.style.top = y + 'px';
  }
  function show(id) {
    for (const s of screens) $(s).classList.toggle('on', s === id);
    if (id) shownAt[id] = performance.now();
    placeToast();
    document.body.classList.toggle('playing', mode === 'play');
    document.body.classList.toggle('on-title', mode === 'title');
    if (mode === 'play') measureHud();
  }
  // 결과·한 번 더 화면이 막 떴을 때 누른 것은 무시한다 (죽는 순간 밀던 손가락이 단추를 누르지 않게)
  const tooSoon = id => performance.now() - (shownAt[id] || 0) < D.CONTINUE.tapGuard * 1000;

  let toastTimer = 0;
  // 알림: 위쪽 가운데 (게임 중에는 판 위 HUD 줄에, 판·뱀 머리를 가리지 않게). kind 'rv' = 라이벌(주황)
  function toast(msg, kind) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'on' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    const ms = msg.length > 14 ? 2000 : 1500;
    view.toastUntil = performance.now() + ms;   // 그동안 HUD 줄의 행성 알림은 쉰다 (서로 겹치지 않게)
    toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }

  function renderBest() {
    // 고른 난이도의 무한 최고 (난이도별 기록이 없던 예전 판은 쉬움·보통 어느 쪽인지 몰라 전체 최고로 보여 준다)
    const b = rec.best[diff];
    view.best = b.score;
    const parts = [];
    if (b.score > 0) parts.push(diffName(diff) + ' 최고 ' + b.score.toLocaleString() + '점');
    else if (rec.endless.score > 0 && diff !== 'hard') parts.push('무한 최고 ' + rec.endless.score.toLocaleString() + '점');
    else if (diff === 'hard') parts.push('어려움 첫 도전');
    if (rec.stage.max > 0) parts.push('스테이지 ' + rec.stage.max + '단계 · ★' + starTotal());
    $('best').textContent = parts.length ? parts.join(' · ') : '첫 도전을 시작해요';
    $('stage-tag').textContent = rec.stage.max > 0 ? (rec.stage.max + 1) + '단계' : '';
    $('medal-count').textContent = Object.keys(rec.medals).length + '/' + D.MEDALS.length;
    renderTitleShop();
  }

  // ─── 코인 · 상점 · 미션 ───────────────────────────────────
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
    $('coin-count').textContent = fmt(SH.coins());
    $('title-missions').innerHTML = missionsHtml('미션');
    const lo = D.START_ITEMS.filter(it => shop.items[it.id] > 0).map(it => it.name + (shop.items[it.id] > 1 ? ' ×' + shop.items[it.id] : ''));
    $('loadout-line').textContent = lo.length ? '다음 판 시작 아이템: ' + lo.join(' · ') : '';
    renderCharCard();
  }

  // 시작 화면 "내 캐릭터" 칸: 미리보기 · 이름 · 특기 (누르면 상점 캐릭터 칸)
  let cardChar = '';
  function renderCharCard() {
    const ch = SH.charDef(shop.char) || D.CHARS[0];
    view.char = ch.id;
    if (demo && demo.char !== ch.id) demo = null;   // 시연 뱀도 새 캐릭터로
    if (cardChar === ch.id) return;
    cardChar = ch.id;
    $('char-name').textContent = ch.name;
    $('char-name').style.color = ch.color;
    $('char-trait').textContent = ch.trait;
    SN.Render.drawCharPreview($('char-preview'), ch.id);
  }

  function priceBtn(id, label) {
    const cost = SH.price(shop, id);
    if (cost == null) return '<span class="maxed">' + label + '</span>';
    return '<button type="button" class="buy' + (SH.coins() < cost ? ' poor' : '') + '" data-buy="' + id + '"><i class="cn" aria-hidden="true"></i>' + fmt(cost) + '</button>';
  }

  function renderShop() {
    $('shop-coins').textContent = fmt(SH.coins());
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === shopTab));
    const list = $('shop-list');
    list.className = 'shop-list t-' + shopTab;
    let h = '';
    if (shopTab === 'chars') {
      $('shop-sub').textContent = '캐릭터마다 모양과 특기가 달라요';
      h = D.CHARS.map(s => {
        const own = !!shop.chars[s.id], cur = shop.char === s.id;
        return '<div class="sitem skin char' + (cur ? ' cur' : '') + (own ? '' : ' locked') + '" style="--sc:' + s.color + '">' +
          '<canvas class="skin-cv" width="168" height="76" data-char="' + s.id + '" aria-hidden="true"></canvas>' +
          '<b class="s-name">' + esc(s.name) + '</b>' +
          '<span class="s-desc">' + esc(s.look) + '</span>' +
          '<span class="s-trait">특기 · ' + esc(s.trait) + '</span>' +
          (cur ? '<span class="maxed on">사용 중</span>' : own ? '<button type="button" class="use" data-use="' + s.id + '">고르기</button>' : priceBtn(s.id, '')) +
        '</div>';
      }).join('');
    } else if (shopTab === 'up') {
      $('shop-sub').textContent = '한 번 사면 계속 좋아져요 (칸 5개)';
      h = D.UPGRADES.map(u => {
        const lv = shop.up[u.id] || 0;
        let pips = '';
        for (let k = 0; k < D.UPGRADE_MAX; k++) pips += '<i class="' + (k < lv ? 'on' : '') + '"></i>';
        return '<div class="sitem row"><span class="s-icon">' + esc(u.icon) + '</span>' +
          '<span class="s-mid"><b class="s-name">' + esc(u.name) + '</b><span class="s-desc">' + esc(u.desc) + '</span><span class="pips">' + pips + '</span></span>' +
          priceBtn(u.id, '최대') + '</div>';
      }).join('');
    } else {
      $('shop-sub').textContent = '사 두면 다음 판에 저절로 써요 (3개까지)';
      h = D.START_ITEMS.map(it => {
        const n = shop.items[it.id] || 0;
        return '<div class="sitem row"><span class="s-icon">' + esc(it.icon) + '</span>' +
          '<span class="s-mid"><b class="s-name">' + esc(it.name) + ' <small>' + n + '/' + it.max + '개</small></b><span class="s-desc">' + esc(it.desc) + '</span></span>' +
          priceBtn(it.id, '가득') + '</div>';
      }).join('');
    }
    list.innerHTML = h;
    for (const cv of list.querySelectorAll('canvas[data-char]')) SN.Render.drawCharPreview(cv, cv.dataset.char);
  }

  function openShop(tab) {
    if (mode !== 'title') return;
    mode = 'shop';
    if (tab) shopTab = tab;
    renderShop();
    show('scr-shop');
    SN.Audio.play('open');
  }
  function closeShop() {
    if (mode !== 'shop') return;
    mode = 'title';
    SN.Audio.play('close');
    renderBest();
    show('scr-title');
  }

  const NAMES = { coins: '코인이 모자라요', owned: '이미 가진 캐릭터예요', max: '더는 살 수 없어요' };
  function buyThing(id) {
    const r = SH.buy(shop, id);
    if (r.ok) {
      SH.save(shop);
      SN.Audio.play('buy');
      vibrate(20);
      if (SH.charDef(id)) toast(SH.charDef(id).name + ' 골랐어요!');
    } else {
      SN.Audio.play('deny');
      toast(NAMES[r.reason] || '살 수 없어요');
    }
    if (mode === 'shop') renderShop();
    renderTitleShop();
    return r;
  }
  function useChar(id) {
    const ok = SH.selectChar(shop, id);
    if (ok) { SH.save(shop); SN.Audio.play('tap'); toast(SH.charDef(id).name + ' 골랐어요!'); }
    if (mode === 'shop') renderShop();
    renderTitleShop();
    return ok;
  }

  // 미션 보상 받기: 코인 +, 소리, 버튼 자리에서 "+120"이 튀어 오른다
  function claimMission(i, btn) {
    const got = SH.claim(shop, i);
    if (!got) return 0;
    SH.save(shop);
    SN.Audio.play('claim');
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
    const e = lastEarn || { coins: 0, parts: { score: 0, gold: 0, level: 0, bonus: 0 }, done: [] };
    $('over-coins').textContent = '+0';
    const P = e.parts, bits = [['점수', P.score], ['황금 구슬', P.gold], ['깬 단계', P.level], ['강화 보너스', P.bonus], ['선물 상자', P.gift]];
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
      if (step !== lastTick) { lastTick = step; SN.Audio.play('coin'); }
      if (k < 1 && mode === 'over') requestAnimationFrame(tick);
      else { el.textContent = '+' + fmt(total); el.classList.add('done'); }
    };
    el.classList.remove('done');
    requestAnimationFrame(tick);
  }

  // 놀이 본부(common/hub.js)의 알아서 맞춰 주는 난이도. 본부가 없거나 실패하면 1
  function adaptMul(d) {
    try { if (typeof HUB !== 'undefined' && HUB.adaptMul) { const m = Number(HUB.adaptMul('snake', d)); if (m > 0) return m; } } catch (err) { /* 무시 */ }
    return 1;
  }
  let rivalToast = false;

  // 놀이 본부(common/hub.js)에 알린다: 기록실 요약과 오늘의 미션
  function reportSummary() {
    if (typeof HUB === 'undefined' || !HUB.report) return;
    try {
      const b = rec.endless.score;
      HUB.report('snake', { best: b, bestText: b ? '최고 ' + b.toLocaleString() + '점' : '', medals: Object.keys(rec.medals).length, medalMax: D.MEDALS.length, games: rec.total.games });
    } catch (e) { /* 무시 */ }
  }
  function reportHub() {
    if (typeof HUB === 'undefined' || !HUB.reportRun) return;
    reportSummary();
    try {
      // 스티커북·오늘의 미션: 길이 · 황금 · 구슬 · 깬 레벨 · 라이벌 이김 (world.js hubStats)
      // stageStars: 스테이지 별 모두 합친 수 (이 기기 기록, 스티커용)
      const done = HUB.reportRun('snake', Object.assign(SN.World.hubStats(W), { games: 1, stageStars: starTotal() }), W.time);
      if (done && done.length) setTimeout(() => toast('오늘의 미션 완료: ' + done[0]), 1000);
    } catch (e) { /* 본부 기록이 실패해도 게임은 계속 */ }
    try { if (HUB.adaptRun) HUB.adaptRun('snake', W.diff, SN.World.adaptPerf(W)); } catch (e) { /* 무시 */ }
  }

  // 예전 꾸미기를 캐릭터로 바꿨으면 한 번 알려 준다
  function tellMigration() {
    const m = SH.takeMigration();
    if (!m) return;
    renderTitleShop();
    setTimeout(() => toast(m.refund > 0 ? '꾸미기가 캐릭터로 바뀌었어요 · 코인 ' + fmt(m.refund) + '개 돌려받음' : '꾸미기가 캐릭터로 바뀌었어요'), 600);
  }

  // ─── 메달 ──────────────────────────────────────────────────
  // 새로 딴 메달을 장부에 적고 돌려준다. live면 게임 중이라 토스트로 알린다
  function checkMedals(live) {
    const run = SN.World.runStats(W), fresh = [];
    for (const m of D.MEDALS) {
      if (rec.medals[m.id]) continue;
      let ok = false;
      try { ok = m.check(run, rec); } catch (e) { ok = false; }
      if (ok) { rec.medals[m.id] = new Date().toISOString().slice(0, 10); fresh.push(m); }
    }
    if (fresh.length) {
      saveRec();
      if (live) { toast('메달 획득: ' + fresh.map(m => m.name).join(', ')); SN.Audio.play('medal'); vibrate([20, 40, 20]); }
    }
    return fresh;
  }
  const TIER = { 1: '동', 2: '은', 3: '금' };
  function medalHtml(m, locked) {
    return '<div class="medal t' + m.tier + (locked ? ' locked' : '') + '"><span class="coin">' + (locked ? '?' : TIER[m.tier]) + '</span><span><b>' + m.name + '</b><small>' + m.desc + '</small></span></div>';
  }
  // 결과 화면: 새 메달은 동전 줄 하나 (많아도 한 줄, 이름은 누르면 알림으로)
  function medalStrip(list) {
    if (!list.length) return '';
    return '<p class="ms-head">새 메달 ' + list.length + '개!</p><div class="ms-row">' +
      list.map(m => '<button type="button" class="ms-coin medal t' + m.tier + '" data-medal="' + m.id + '" aria-label="' + esc(m.name) + '"><span class="coin">' + TIER[m.tier] + '</span></button>').join('') + '</div>';
  }
  function openMedals() {
    $('medal-sub').textContent = '메달 ' + Object.keys(rec.medals).length + ' / ' + D.MEDALS.length;
    $('medal-list').innerHTML = D.MEDALS.map(m => medalHtml(m, !rec.medals[m.id])).join('');
    const T = rec.total, rows = [
      ['무한 최고 점수', rec.endless.score.toLocaleString()], ['무한 최고 길이', rec.endless.len], ['최고 콤보', rec.endless.combo],
      ['스테이지 최고 단계', rec.stage.max ? rec.stage.max + '단계' : '없음'], ['스테이지 별', '★ ' + starTotal()], ['스테이지 최고 점수', rec.stage.score.toLocaleString()], ['모두 한 판', T.games],
      ['먹은 구슬', T.orbs.toLocaleString()], ['황금 구슬', T.golds], ['아이템', T.powers],
      ...D.DIFFS.map(d => [d.name + ' 최고', rec.best[d.id].score ? rec.best[d.id].score.toLocaleString() + '점 · 길이 ' + rec.best[d.id].len : '없음']),
    ];
    $('record-list').innerHTML = rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
    mode = 'medals';
    show('scr-medals');
    SN.Audio.play('open');
  }

  // ─── 스테이지 고르기 ───────────────────────────────────────
  function openStage() {
    const box = $('level-list'), open = rec.stage.max + 1;
    box.innerHTML = '';
    $('stage-stars').textContent = '★ ' + starTotal();
    // 12레벨을 다 깨면 외계 행성 레벨(13~20, 더 빠른 두 번째 바퀴)이 열린 만큼 칸이 늘어난다 (그 전에는 12칸 그대로)
    const last = rec.stage.max >= D.LEVELS.length ? Math.min(D.SPACE.stage.length, Math.max(open, D.LEVELS.length + 1)) : D.LEVELS.length;
    for (let n = 1; n <= last; n++) {
      const L = SN.World.levelDef(n), b = document.createElement('button');
      b.className = 'lvl' + (n <= rec.stage.max ? ' done' : n === open ? ' next' : n > open ? ' locked' : '');
      // 레벨마다 정해진 하늘 (1~9 수성~명왕성, 10 블랙홀, 11 은하수, 12 은하 중심, 13~20 외계 행성): 칸 구석에 작은 그림
      const sky = SN.World.sceneInfo(SN.World.stageScene(n));
      const st = rec.stage.stars[n] || 0;
      if (L.boss) b.classList.add('boss');
      b.innerHTML = '<canvas class="lvl-sky" width="72" height="72" aria-hidden="true"></canvas><b>' + n + '</b><small>' + esc(L.name) + '</small>' +
        '<em class="lvl-stars' + (st ? '' : ' none') + '" aria-label="별 ' + st + '개">' + starText(st) + '</em>';
      if (SN.Space) SN.Space.icon(b.querySelector('canvas'), sky.id);
      b.addEventListener('click', () => {
        if (n > open) { SN.Audio.play('deny'); toast((n - 1) + '단계를 먼저 깨요'); return; }
        keep(); newGame(undefined, { mode: 'stage', level: n });
      });
      box.appendChild(b);
    }
    mode = 'stage';
    show('scr-stage');
    SN.Audio.play('open');
  }

  // ─── 흐름 ──────────────────────────────────────────────────
  function newGame(seed, opts) {
    SN.Audio.unlock();
    if (opts) {
      // 난이도: opts.diff > 옛 opts.easy(true/false) > 시작 화면에서 고른 것
      const d = D.DIFFS.some(x => x.id === opts.diff) ? opts.diff : typeof opts.easy === 'boolean' ? (opts.easy ? 'easy' : 'normal') : diff;
      lastOpts = Object.assign({ rival: rivalOn }, opts, { diff: d, easy: d === 'easy' });
    }
    if (!lastOpts.diff) { lastOpts.diff = diff; lastOpts.easy = diff === 'easy'; }
    const [cols, rows] = lastOpts.diff === 'easy' ? (size().h > size().w * 1.1 ? D.EASY.board.port : D.EASY.board.land) : (size().h > size().w * 1.1 ? D.BOARD.port : D.BOARD.land);
    // 시작 아이템은 이번 판에 하나씩 쓰고 사라진다. 강화는 늘 적용
    const lo = SH.takeLoadout(shop);
    SH.save(shop);
    // 알아서 맞춰 주는 난이도 (놀이 본부): 처음 두 판은 1, 그 뒤 0.85~1.12. 속도 오름·황금 시간·라이벌 실력에 조금씩
    W = SN.World.create(cols, rows, seed, Object.assign(SH.worldOpts(shop, lo, lastOpts), { adapt: adaptMul(lastOpts.diff), skyStart: skyStart() }));
    rivalToast = false;
    lastEarn = null;
    view.char = shop.char;
    const used = D.START_ITEMS.filter(it => lo[it.id]).map(it => it.name);
    if (used.length) setTimeout(() => { if (mode === 'play') toast('시작 아이템: ' + used.join(' · ')); }, 300);
    view.best = W.mode === 'stage' ? rec.stage.score : rec.best[W.diff].score;
    medalCheckT = 0;
    input.reset();
    view.danger = null; warnKey = '';
    mode = 'play';
    wakeLock(true);
    show(null);
    SN.Audio.play('start');
    startMusic();
  }

  // ─── 배경 음악 (common/sound.js) ───────────────────────────
  // 시작 화면은 'title', 판 중에는 지금 하늘(행성) 음악. 블랙홀은 'space', 은하 중심은 'galaxy'로
  // 피버는 빠르게, 대왕 뱀과 겨루는 동안은 단조로 힘차게, 쉬움은 차분하게. 멈춤·한 번 더 묻기는 작게, 결과 화면은 멈춤
  const musicId = id => (id === 'hole' ? 'space' : id === 'core' ? 'galaxy' : id || 'mercury');
  let musKey = '';
  function musicMood(world) {
    return {
      planet: musicId(world.space && world.space.scene), fever: world.feverT > 0,
      boss: !!(world.boss && world.rival && world.rival.boss && !world.rival.down), calm: world.diff === 'easy',
    };
  }
  function startMusic() {
    if (!MUS || !W) return;
    const m = musicMood(W);
    musKey = JSON.stringify(m);
    MUS.duck(1);
    MUS.setMood({ fever: m.fever, boss: m.boss, calm: m.calm });
    MUS.play('snake', m.planet);
  }
  function syncMusic() {
    if (!MUS || !W) return;
    const m = musicMood(W), k = JSON.stringify(m);
    if (k === musKey) return;
    musKey = k;
    MUS.setMood(m);
  }
  function titleMusic() {
    if (!MUS) return;
    musKey = '';
    MUS.duck(1);
    MUS.setMood({ fever: false, boss: false, calm: false });
    MUS.play('snake', 'title');
  }

  function toTitle() {
    keepSky();
    clearTimeout(overTimer);
    W = null;
    mode = 'title';
    wakeLock(false);
    renderBest();
    show('scr-title');
    titleMusic();
  }
  // 스테이지 고르기·메달 화면 닫기
  function closeMenu() { SN.Audio.play('close'); toTitle(); }

  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    frozenDrawn = false;
    show('scr-pause');
    renderMusicBtn();
    if (MUS) MUS.duck(0.3);
  }

  function resume() {
    if (mode !== 'paused') return;
    input.reset();
    mode = 'play';
    show(null);
    if (MUS) MUS.duck(1);
  }

  // 판 정리: 기록 장부 · 메달 · 코인 · 미션 · 놀이 본부 (결과 화면으로 가든, 멈춤에서 처음 화면으로 가든 똑같이 한 번만)
  let overTimer = 0;
  function settleRun() {
    if (!W || W.settled) return null;
    W.settled = true;
    keepSky();
    // 기록 장부: 신기록은 칩으로 보여 준다
    const newRec = [];
    const T = rec.total;
    T.games++; T.orbs += W.eaten; T.golds += W.golds; T.powers += W.powers; T.portals += W.portalsUsed;
    let isBest;
    if (W.mode === 'stage') {
      isBest = W.score > rec.stage.score;
      if (isBest) { rec.stage.score = W.score; if (W.score > 0) newRec.push('스테이지 최고 점수'); }
    } else {
      // 난이도별 최고 (신기록 표시는 고른 난이도 기준) + 전체 최고
      const dn = diffName(W.diff), nb = SH.recordBest(rec.best, W.diff, W.score, W.maxLen);
      isBest = nb.score;
      if (nb.score) newRec.push(dn + ' 최고 점수');
      if (nb.len) newRec.push(dn + ' 최고 길이 ' + W.maxLen);
      rec.endless.score = Math.max(rec.endless.score, W.score);
      rec.endless.len = Math.max(rec.endless.len, W.maxLen);
    }
    if (W.maxCombo > rec.endless.combo && W.maxCombo > 1) { rec.endless.combo = W.maxCombo; newRec.push('최고 콤보 ' + W.maxCombo); }
    saveRec();
    if (W.mode !== 'stage' && W.eaten > 0 && (W.score > best.score || W.snake.length > best.len)) {
      best = { score: Math.max(best.score, W.score), len: Math.max(best.len, W.snake.length) };
      SN.store.set(BEST_KEY, best);
    }
    // 스테이지는 다시 하기를 누르면 죽은 레벨부터
    if (W.mode === 'stage') lastOpts = { mode: 'stage', level: W.level };
    const fresh = checkMedals(false);
    // 코인 · 미션 · 놀이 본부
    lastEarn = SH.finishRun(shop, SH.runOf(W));
    SH.save(shop);
    reportHub();
    return { newRec, isBest, fresh };
  }

  // 멈춤 화면 "처음 화면으로": 판을 버리지 않고 정리(코인·미션·메달)한 뒤 나간다
  function quitRun() {
    const r = W && !W.settled ? settleRun() : null;
    toTitle();
    if (r && lastEarn) {
      const bits = [];
      if (lastEarn.coins > 0) bits.push('코인 +' + fmt(lastEarn.coins));
      if (r.fresh.length) bits.push('새 메달 ' + r.fresh.length + '개');
      if (lastEarn.done.length) bits.push('미션 완료!');
      if (bits.length) setTimeout(() => toast(bits.join(' · ')), 250);
    }
  }

  // 판이 끝났다: 한 번 더 할 수 있으면 먼저 묻고, 아니면 결과 화면
  let contAt = 0, contTick = 0;
  function onDeath() {
    if (SN.World.canContinue(W)) {
      mode = 'cont';
      overAt = performance.now();
      contAt = 0;
      wakeLock(false);
      // 부딪힌 모습을 잠깐 보여 준 뒤 묻는다
      clearTimeout(overTimer);
      overTimer = setTimeout(() => {
        if (mode !== 'cont') return;
        contAt = performance.now();
        const ring = $('cont-ring');
        ring.classList.remove('run'); void ring.offsetWidth; ring.classList.add('run');
        show('scr-cont');
        contTick = 0;
        SN.Audio.play('continueAsk');
        if (MUS) MUS.duck(0.3);
      }, 700);
      return;
    }
    gameOver();
  }
  function continueRun() {
    if (mode !== 'cont' || !contAt || tooSoon('scr-cont')) return false;
    if (!SN.World.revive(W)) return false;
    input.reset();
    view.danger = null; warnKey = '';
    mode = 'play';
    wakeLock(true);
    show(null);
    // 한 번 더: continueGo 하나만 (시작 소리·되살아남 소리를 겹쳐 틀지 않는다. world의 revive 사건은 소리 없음)
    SN.Audio.play('continueGo');
    if (MUS) MUS.duck(1);
    vibrate([20, 30, 20]);
    return true;
  }
  function giveUp(force) {
    if (mode !== 'cont' || (!force && tooSoon('scr-cont'))) return;
    gameOver(true);
  }

  // 결과 화면. soon: 한 번 더 화면에서 넘어와 바로 보여 줄 때
  function gameOver(soon) {
    mode = 'over';
    overAt = performance.now();
    // 결과 소리: 쉬움은 부드럽게, 보통·어려움은 내려가는 소리 (판을 가득 채웠으면 팡파르가 이미 났다)
    if (!W.won) SN.Audio.play(W.diff === 'easy' ? 'overSoft' : 'over');
    if (MUS) MUS.stop(0.8);
    const res = settleRun() || { newRec: [], isBest: false, fresh: [] };
    const { newRec, isBest } = res, fresh = res.fresh;
    renderEarn();
    $('over-records').innerHTML = newRec.filter(x => !(isBest && x.indexOf('최고 점수') >= 0)).map(x => '<span>신기록 · ' + x + '</span>').join('') +
      // 스테이지: 이번 판에 깬 단계와 별
      (W.stars || []).slice(-4).map(s => '<span class="st">' + s.level + '단계 <i>' + starText(s.stars) + '</i></span>').join('');
    $('over-medals').innerHTML = medalStrip(fresh);
    if (fresh.length) setTimeout(() => { if (mode === 'over') SN.Audio.play('medal'); }, 900);
    $('over-t3').textContent = W.mode === 'stage' ? '단계' : '시간';
    // 다정한 제목 (빨간 "부딪혔다" 대신 따뜻한 색)
    $('over-title').textContent = W.won ? '판을 가득 채웠어요!' : W.cause === 'self' ? '앗, 내 꼬리!' : '앗, 쿵!';
    // 라이벌과 겨룬 결과 (라이벌이 나온 판만). 져도 다정하게
    const rr = SN.World.rivalResult(W), rl = $('over-rival');
    if (rr) {
      rl.textContent = rr.diff > 0 ? '라이벌보다 ' + rr.diff + '개 더 먹었어요!' : rr.diff === 0 ? '라이벌과 똑같이 먹었어요! 아깝다' : '라이벌이 ' + (-rr.diff) + '개 더 먹었어요. 다음엔 이길 수 있어요!';
      if (rr.bites > 0) rl.textContent += ' 라이벌을 ' + rr.bites + '번 냠냠했어요!';
      else if (rr.bumps > 0) rl.textContent += ' (라이벌 멈칫 ' + rr.bumps + '번)';
      rl.className = 'rival-line' + (rr.diff > 0 ? ' win' : '');
      rl.hidden = false;
    } else rl.hidden = true;
    $('over-score').textContent = W.score.toLocaleString();
    $('over-new').style.display = isBest ? '' : 'none';
    $('over-len').textContent = W.snake.length;
    $('over-eaten').innerHTML = W.eaten + (W.golds ? '<small> ★' + W.golds + '</small>' : '');
    $('over-time').textContent = W.mode === 'stage' ? W.level + '단계' : SN.fmtTime(W.time);
    wakeLock(false);
    // 충돌 연출을 잠깐 보여 준 뒤 결과 화면
    clearTimeout(overTimer);
    overTimer = setTimeout(() => { if (mode === 'over') { show('scr-over'); countCoins(); } }, soon ? 0 : 800);
  }

  function drainEvents(world, sound) {
    for (const ev of world.events) {
      if (!sound) continue;
      // 냠: 5개 묶음 안의 차례로 한 계단씩, 콤보 배율로 조금 더 높게. 부딪힘은 부드러운 쿵 (결과 소리는 gameOver에서)
      if (ev === 'eat') SN.Audio.play('eat', { k: (world.eaten - 1) % D.FOOD.goldEvery, m: world.mult || 1 });
      else if (ev === 'over') SN.Audio.play('crash');
      else SN.Audio.play(ev);
      if (ev === 'rival') {
        if (world.rival && world.rival.boss) { if (!rivalToast) toast('대왕 뱀 등장! 꼬리를 냠냠!', 'rv'); }
        else toast(rivalToast ? '라이벌이 다시 왔어요' : '라이벌 뱀 등장! 구슬을 먼저 먹어요', 'rv');
        rivalToast = true;
      }
      else if (ev === 'bossdown') vibrate([40, 40, 80]);
      else if (ev === 'bump' || ev === 'headbump') vibrate([15, 20, 15]);
      else if (ev === 'bite') vibrate(30);
      else if (ev === 'biteall') vibrate([30, 30, 60]);
      else if (ev === 'giftopen' || ev === 'fever') vibrate([20, 30, 20]);
      else if (ev === 'giant') vibrate(60);
      else if (ev === 'smash') vibrate(25);
      if (ev === 'over') vibrate(250);
      else if (ev === 'gold') vibrate([20, 30, 40]);
      else if (ev === 'power' || ev === 'combo') vibrate(20);
      else if (ev === 'clear') { vibrate([30, 40, 30, 40, 80]); onClear(); }
    }
    world.events.length = 0;
  }

  // 스테이지 레벨을 깼다: 장부에 적고 메달 확인
  function onClear() {
    rec.stage.max = Math.max(rec.stage.max, W.level);
    rec.total.levels++;
    // 단계 별: 가장 많이 받은 것만 남긴다
    const ls = W.lastStars;
    if (ls) rec.stage.stars[ls.level] = Math.max(rec.stage.stars[ls.level] || 0, ls.stars);
    saveRec();
    checkMedals(true);
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 지원 안 하면 무시 */ }
  }

  // ─── 입력 연결 ─────────────────────────────────────────────
  input.onDir = (dir, touch) => {
    SN.Audio.unlock();
    if (mode === 'play' && W && SN.World.turn(W, dir) && touch) vibrate(10);
  };
  for (const b of document.querySelectorAll('[data-diff]')) b.addEventListener('click', () => { SN.Audio.unlock(); setDiff(b.dataset.diff); SN.Audio.play('tap'); });
  $('btn-rival').addEventListener('click', () => { SN.Audio.unlock(); setRival(!rivalOn); SN.Audio.play('tap'); });
  input.onKey = code => {
    SN.Audio.unlock();
    if (code === 'KeyM') return toggleMute();
    if (mode === 'shop') { if (code === 'Escape') closeShop(); return; }
    // 스테이지 고르기·메달 화면은 제 화면 (Enter·Space로 무한 모드가 시작되지 않게)
    if (mode === 'stage' || mode === 'medals') { if (code === 'Escape') closeMenu(); return; }
    if (mode === 'cont') { if (code === 'Enter' || code === 'Space') continueRun(); else if (code === 'Escape') giveUp(); return; }
    if (mode === 'title' && (code === 'Enter' || code === 'Space')) return newGame(undefined, { mode: 'endless' });
    if (mode === 'over') { if ((code === 'Enter' || code === 'Space') && !tooSoon('scr-over') && $('scr-over').classList.contains('on')) newGame(); return; }
    if (code === 'KeyP' || code === 'Escape' || code === 'Space') return mode === 'play' ? pause() : resume();
  };

  // 소리 단추: 네 게임과 첫 화면이 함께 꺼지고 켜진다 (SND). 단추 모양은 onChange로 (다른 게임에서 바꿔도 따라온다)
  function toggleMute() {
    if (!HAS_SND) return;
    SND.unlock();
    SND.toggleMuted();
    toast(SND.muted() ? '소리 끔' : '소리 켬');
  }
  function renderMute() { $('btn-mute').classList.toggle('muted', HAS_SND && SND.muted()); }
  // 멈춤 화면의 음악 켜기·끄기 (효과음은 그대로)
  function renderMusicBtn() {
    const b = $('btn-music');
    if (!b) return;
    const on = HAS_SND && SND.musicOn();
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').textContent = on ? '음악 켬' : '음악 끔';
    b.hidden = !HAS_SND;
  }
  function toggleMusic() {
    if (!HAS_SND) return;
    SND.unlock();
    SND.setMusic(!SND.musicOn());
    SN.Audio.play('tap');
  }

  // 브라우저는 첫 터치·클릭 뒤에야 소리를 허락한다 (SND도 스스로 듣지만, 밀기 시작에서도 풀어 둔다)
  window.addEventListener('pointerdown', () => SN.Audio.unlock(), { passive: true });
  if (HAS_SND) SND.onChange(() => { renderMute(); renderMusicBtn(); });
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  // 최고 점수가 브라우저 정리 때 지워지지 않게 요청 (돈 0원, 이 기기 안에서만)
  const keep = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 무시 */ } };
  $('btn-start').addEventListener('click', () => { keep(); newGame(undefined, { mode: 'endless' }); });
  $('btn-stage').addEventListener('click', () => { SN.Audio.unlock(); openStage(); });
  $('btn-medals').addEventListener('click', () => { SN.Audio.unlock(); openMedals(); });
  $('btn-shop').addEventListener('click', () => { SN.Audio.unlock(); openShop(); });
  $('btn-char').addEventListener('click', () => { SN.Audio.unlock(); openShop('chars'); });
  $('btn-shop-back').addEventListener('click', closeShop);
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { shopTab = b.dataset.tab; renderShop(); SN.Audio.play('tap'); });
  $('shop-list').addEventListener('click', e => {
    const b = e.target.closest('[data-buy],[data-use]');
    if (!b) return;
    if (b.dataset.buy) buyThing(b.dataset.buy); else useChar(b.dataset.use);
  });
  for (const id of ['title-missions', 'over-missions']) {
    $(id).addEventListener('click', e => { const b = e.target.closest('[data-claim]'); if (b) claimMission(+b.dataset.claim, b); });
  }
  $('btn-stage-back').addEventListener('click', closeMenu);
  $('btn-medals-back').addEventListener('click', closeMenu);
  $('btn-medals-x').addEventListener('click', closeMenu);
  $('btn-stage-x').addEventListener('click', closeMenu);
  $('btn-retry').addEventListener('click', () => { if (!tooSoon('scr-over')) newGame(); });
  $('btn-home').addEventListener('click', () => { if (!tooSoon('scr-over')) toTitle(); });
  $('btn-resume').addEventListener('click', resume);
  $('btn-quit').addEventListener('click', quitRun);
  $('btn-cont').addEventListener('click', continueRun);
  $('btn-giveup').addEventListener('click', () => giveUp());
  // 게임 고르기(놀이 본부)로: 시작 화면 위쪽 집 단추 · 결과 화면 집 단추
  const toHub = () => { keepSky(); location.href = '../index.html'; };
  $('btn-hub').addEventListener('click', toHub);
  $('btn-hub2').addEventListener('click', () => { if (!tooSoon('scr-over')) toHub(); });
  $('over-medals').addEventListener('click', e => {
    const b = e.target.closest('[data-medal]');
    const m = b && D.MEDALS.find(x => x.id === b.dataset.medal);
    if (m) toast(m.name + ': ' + m.desc);
  });
  $('btn-pause').addEventListener('click', () => (mode === 'play' ? pause() : resume()));
  $('btn-mute').addEventListener('click', toggleMute);
  $('btn-music').addEventListener('click', toggleMusic);

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

  // 다른 게임에서 코인을 쓰고 돌아왔을 때: 상점 저장본·기록을 다시 읽는다 (옛 값을 덮어쓰지 않게, 지갑은 늘 새로 읽는다)
  function refreshSaved() {
    shop = SH.load(); rec = loadRec(); cardChar = '';
    if (mode === 'title') renderBest();
    else if (mode === 'shop') { renderShop(); renderTitleShop(); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else {
      if (mode === 'play' || mode === 'paused') wakeLock(true); // 돌아오면 다시 요청
      if (mode === 'title' || mode === 'shop' || mode === 'stage' || mode === 'medals') refreshSaved();
    }
  });
  window.addEventListener('pageshow', e => { if (e.persisted) refreshSaved(); });

  // ─── 루프 ──────────────────────────────────────────────────
  function drive(world) {
    if (!world.queue.length) SN.World.turn(world, SN.World.botDir(world));
  }

  // 그리기 속도: 120Hz 화면에서도 1초에 60번 정도 (D.DRAW.minGap보다 빠른 프레임은 건너뛴다. 90Hz는 그대로)
  // 느린 기기: 최근 평균 프레임이 느리면 절약 모드 (view.low: 날씨·연출 입자 절반). SN.debug.noAuto면 끔 (스크린샷용)
  let slowAcc = 0, slowN = 0, slowT = 0;
  function watchSpeed(dt) {
    if (SN.debug && SN.debug.noAuto) return;
    slowAcc += dt; slowN++; slowT += dt;
    if (slowT >= D.DRAW.slowWindow) {
      const avg = slowAcc / Math.max(1, slowN);
      if (!view.low && avg > D.DRAW.slowFrame) view.low = true;
      slowAcc = 0; slowN = 0; slowT = 0;
    }
  }
  function frame(ts) {
    if (typeof PROFILE !== 'undefined') PROFILE.setPlaying(mode === 'play'); // 놀이 시간 세기 (common/profile.js)
    if (lastTs && ts - lastTs < D.DRAW.minGap * 1000) { requestAnimationFrame(frame); return; }
    const raw = (ts - lastTs) / 1000 || 0;
    const dt = Math.min(0.05, raw);
    lastTs = ts;
    if (raw > 0 && raw < 0.5 && !document.hidden) watchSpeed(raw);

    if (mode === 'title' || mode === 'shop' || mode === 'stage' || mode === 'medals') {
      // 시연: 자동 운전 뱀이 시작 화면 뒤에서 돈다. 끝나면 잠시 뒤 새로
      if (!demo) { const [c, r] = boardFor(size()); demo = SN.World.create(c, r, 777, { skyStart: skyStart() }); demo.char = view.char; demo.wait = 0; demoRest = 0; }
      if (demo.phase === 'play') { drive(demo); SN.World.step(demo, dt); }
      else if ((demoRest += dt) > 1.5) demo = null;
      if (demo) {
        drainEvents(demo, false);
        fit(demo);
        SN.Render.draw(ctx, demo, demoView, dt);
      }
    } else if (W) {
      if (mode === 'play') {
        if (auto && W.phase === 'play') drive(W);
        SN.World.step(W, dt);
        drainEvents(W, true);
        // 스테이지: 깬 뒤 잠깐 축하하고 다음 레벨로
        if (W.phase === 'clear' && W.clearT > D.STAGE.clearTime) { SN.World.nextLevel(W); drainEvents(W, true); }
        // 게임 중에 딸 수 있는 메달은 바로 알려 준다
        if ((medalCheckT += dt) > 0.5 && W.phase === 'play') { medalCheckT = 0; checkMedals(true); }
        if (W.phase === 'over') onDeath();
        // 앞길 경고: 바로 앞 칸이 위험해지는 순간 짧은 경고음·진동 (같은 위험에는 한 번만)
        view.danger = SN.World.dangerAhead(W, 3);
        placeToast();
        const dk = view.danger && view.danger.dist === 1 ? view.danger.x + ',' + view.danger.y : '';
        if (dk && dk !== warnKey) { SN.Audio.play('warn'); vibrate(30); }
        warnKey = dk;
        frozenDrawn = false;
        syncMusic();
      }
      // 한 번 더?: 1초마다 똑딱 (마지막 1초는 높게)
      if (mode === 'cont' && contAt) {
        const left = Math.ceil(D.CONTINUE.time - (performance.now() - contAt) / 1000);
        if (left >= 1 && left < D.CONTINUE.time && left !== contTick) { contTick = left; SN.Audio.play('tick', { hi: left === 1 }); }
      }
      // 한 번 더?: 시간이 다 되면 결과 화면으로
      if (mode === 'cont' && contAt && performance.now() - contAt > D.CONTINUE.time * 1000) giveUp(true);
      // 결과 화면이 뜨고 연출이 끝나면 그리기를 쉰다 (배터리)
      const idle = mode === 'paused' || ((mode === 'over' || mode === 'cont') && performance.now() - overAt > 1200 && !SN.Render.busy());
      if (!idle || !frozenDrawn) {
        fit(W);
        SN.Render.draw(ctx, W, view, dt);
        frozenDrawn = idle;
      }
    }
    requestAnimationFrame(frame);
  }

  // ─── 시작 ──────────────────────────────────────────────────
  renderDiff();
  renderRival();
  renderMute();
  renderMusicBtn();
  resize();
  toTitle();
  reportSummary();
  tellMigration();
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
    get rec() { return rec; }, get easy() { return diff === 'easy'; }, setEasy, get diff() { return diff; }, setDiff,
    get rival() { return rivalOn; }, setRival, get adapt() { return W ? W.adapt : adaptMul(diff); },
    newGame, pause, resume, toTitle, toggleMute, toggleMusic, get musicMood() { return W ? musicMood(W) : null; }, openStage, openMedals, quitRun, continueRun, giveUp: () => giveUp(true),
    noAuto: false, get low() { return !!view.low; }, set low(v) { view.low = !!v; },
    turn(dir) { return W ? SN.World.turn(W, dir) : false; },
    autopilot(on) { auto = on !== false; return auto; },
    get pad() { return input; }, get view() { return view; },
    // 상점·미션 (shop.js)
    get shop() { return shop; }, get missions() { return SH.missionView(shop); }, get lastEarn() { return lastEarn; },
    get coins() { return SH.coins(); },
    giveCoins(n) { SH.getWallet().add(n); renderTitleShop(); if (mode === 'shop') renderShop(); return SH.coins(); },
    openShop, closeShop, claim: i => claimMission(i),
    buy: id => buyThing(id), selectChar: id => useChar(id), selectSkin: id => useChar(id),
    get char() { return shop.char; },
    // 저장소를 바꾼 뒤 다시 읽기 (테스트용)
    reload() { shop = SH.load(); cardChar = ''; renderBest(); tellMigration(); },
  };
})(SN);
