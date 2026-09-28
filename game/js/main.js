'use strict';
// 게임 루프와 화면 전환. 규칙은 world.js, 그리기는 render.js가 맡는다.
(function (NG) {
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  // alpha:false = 배경이 불투명하다고 알려 합성 비용을 줄인다
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  // 터치 기기 판별 (갤럭시탭·폰). PC 조작도 그대로 되지만 화면은 터치 기준으로 맞춘다
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  const input = NG.createInput(canvas);
  const stickMove = $('stick-move'), stickAim = $('stick-aim');
  // 움직임 줄이기 설정: 화면 흔들림·번쩍임·튀어 오름을 뺀다 (render.js)
  const calmQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const view = { dpr: 1, hudTop: 14, hudLeft: 104, hudRight: 12, ui: 1, touchHint: isTouch, calm: !!(calmQ && calmQ.matches) };
  if (calmQ && calmQ.addEventListener) calmQ.addEventListener('change', () => { view.calm = calmQ.matches; });
  const demoView = Object.create(view, { hud: { value: false } });
  const DIFF_KEY = 'ngun.diff';
  // 소리 끄기·음악·효과음 설정은 공통 소리 장치 SND(play.sound1, 네 게임 함께). 옛 ngun.muted·ngun.audio는 SND가 이어받는다

  let W = null;        // 실제 판
  let demo = null;     // 시작 화면 뒤에서 혼자 도는 시연 판
  let mode = 'title';  // title | medals | shop | play | cards | paused | continue | over
  let cardsShownAt = 0;
  let overShownAt = 0;   // 결과 화면이 뜬 시각 (처음 REVIVE.guard초 동안 누른 것은 무시)
  let contShownAt = 0, contT = 0; // 한 번 더! 화면이 뜬 시각 · 지난 시간 (초)
  let runLoadout = {};   // 이번 판에 쓴 시작 아이템 (금방 그만두면 돌려준다)
  let cardsIdle = false; // 카드 화면에 오래 머물러 화면 켜 두기를 풀었나
  // 처음 켠 기기는 쉬움 (2026-09-27 점검). 이미 고른 난이도가 저장돼 있으면 그대로
  const DEF_DIFF = NG.DATA.DIFFICULTY[NG.DATA.DEFAULT_DIFF] ? NG.DATA.DEFAULT_DIFF : 'easy';
  let diff = NG.store.get(DIFF_KEY, DEF_DIFF);
  if (typeof diff !== 'string' || !NG.DATA.DIFFICULTY[diff]) diff = DEF_DIFF;
  const GUARD = ((NG.DATA.REVIVE && NG.DATA.REVIVE.guard) || 0.6) * 1000;
  // 기록·메달 (records.js). 예전 최고 기록 키(ngun.best2)도 읽어 합치고 계속 같이 쓴다
  const REC = NG.Records;
  let rec = REC.load();
  // 코인·상점·미션 (shop.js). 저장 키 ngun.shop1
  const SH = NG.Shop;
  let shop = SH.load();
  let shopTab = 'ships';
  let lastEarn = null;  // 이번 판에 받은 코인 {coins, parts, done}
  let runMedals = [];   // 이번 판에 딴 메달
  let runSaved = false; // 이번 판 기록을 이미 넣었나 (게임 오버·그만두기 중 한 번만)
  let medalCheckT = 0;
  let lastTs = 0;
  let frozenDrawn = false; // 일시정지·카드 화면에선 한 번만 그리고 쉰다 (배터리)

  // ─── 화면 크기 ─────────────────────────────────────────────
  function size() {
    return { w: window.innerWidth, h: window.innerHeight };
  }
  function resize() {
    const { w, h } = size();
    // 해상도 상한: 태블릿(2560×1600)을 그대로 그리면 픽셀이 400만 개라 느려진다.
    // 약 220만 픽셀까지만 그리고 나머지는 브라우저가 늘려 보여 준다 (선명도 차이는 거의 안 보임)
    view.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.2e6 / (w * h))));
    // 터치 기기는 HUD를 키우고, 왼쪽 위 버튼(44px 두 개)만큼 비켜서 그린다
    view.ui = isTouch ? (Math.min(w, h) >= 600 ? 1.35 : 1.15) : 1;
    // HUD는 왼쪽 위 버튼 묶음 오른쪽부터 (전체 화면 버튼이 숨겨지면 그만큼 당긴다)
    // (집 버튼은 시작 화면에서만 보이므로 빼고 잰다)
    let barRight = 0;
    for (const id of ['btn-pause', 'btn-mute', 'btn-fs']) { const el = $(id); if (!el.hidden) barRight = Math.max(barRight, el.getBoundingClientRect().right); }
    view.hudLeft = Math.round(barRight || $('topbar').getBoundingClientRect().right) + 12;
    view.hudTop = isTouch ? 16 : 14;
    // 이동 스틱: 태블릿은 크게, 폰은 조금 작게. 왼쪽 아래 엄지가 닿는 자리에 둔다
    const R = Math.min(w, h) >= 600 ? 80 : 62;
    input.touch.radius = R;
    input.touch.home = { x: Math.round(28 + R * 1.15), y: Math.round(h - 30 - R * 1.15) };
    for (const el of [stickMove, stickAim]) el.style.setProperty('--r', R + 'px');
    frozenDrawn = false;
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (W) NG.World.resize(W, w, h);
    if (demo) NG.World.resize(demo, w, h);
  }
  window.addEventListener('resize', resize);

  // ─── 오버레이 ──────────────────────────────────────────────
  const screens = ['scr-title', 'scr-shop', 'scr-medals', 'scr-cards', 'scr-pause', 'scr-continue', 'scr-over'];
  function show(id) {
    for (const s of screens) $(s).classList.toggle('on', s === id);
    document.body.classList.toggle('playing', mode === 'play');
    document.body.classList.toggle('at-title', mode === 'title');
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
    const b = rec.best[diff];
    $('best').textContent = b.score > 0
      ? NG.DATA.DIFFICULTY[diff].name + ' 최고 기록 ' + b.score.toLocaleString() + '점 · 웨이브 ' + b.wave
      : NG.DATA.DIFFICULTY[diff].name + ' 첫 도전을 시작하세요';
    $('medal-count').textContent = REC.count(rec) + '/' + NG.DATA.MEDALS.length;
    renderTitleShop();
  }

  // ─── 메달 ──────────────────────────────────────────────────
  const TIER = ['', '동', '은', '금'];
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function medalHtml(m, got, date) {
    return '<div class="medal t' + m.tier + (got ? '' : ' locked') + '">' +
      '<span class="coin' + (got && String(m.icon).length > 2 ? ' long' : '') + '" aria-hidden="true"><i>' + esc(got ? m.icon : '?') + '</i></span>' +
      '<span class="mtxt"><b>' + esc(m.name) + ' <em>' + TIER[m.tier] + '</em></b><small>' + esc(m.desc) + '</small>' +
      (date ? '<small class="date">' + esc(date) + '</small>' : '') + '</span></div>';
  }

  // 새 메달 검사. live면 게임 중 알림, finished면 판이 끝난 것 (판 수 메달)
  function checkMedals(live, finished) {
    if (!W) return [];
    const fresh = REC.newMedals(rec, REC.runOf(W), finished);
    if (!fresh.length) return fresh;
    REC.award(rec, fresh);
    REC.save(rec);
    for (const m of fresh) runMedals.push(m);
    if (live) {
      for (const m of fresh) medalToast(m);
      NG.Audio.ui('medal');
      vibrate([20, 40, 20]);
    }
    return fresh;
  }

  // 게임 중 메달 알림: 아래 가운데에 하나씩 차례로
  const toastQ = [];
  let toastBusy = false;
  function medalToast(m) {
    toastQ.push(m);
    if (!toastBusy) nextMedalToast();
  }
  function nextMedalToast() {
    const el = $('medal-toast');
    const m = toastQ.shift();
    if (!m) { toastBusy = false; el.classList.remove('on'); return; }
    toastBusy = true;
    el.innerHTML = '<span class="mt-head">메달 획득</span>' + medalHtml(m, true);
    el.classList.remove('on');
    void el.offsetWidth; // 애니메이션 다시 시작
    el.classList.add('on');
    setTimeout(nextMedalToast, 2400);
  }
  function clearMedalToasts() {
    toastQ.length = 0;
    $('medal-toast').classList.remove('on');
  }

  function renderMedalBoard() {
    const M = NG.DATA.MEDALS;
    $('medal-sub').textContent = '메달 ' + REC.count(rec) + ' / ' + M.length + ' · 잠긴 메달은 조건을 채우면 열립니다';
    $('medal-list').innerHTML = M.map(m => medalHtml(m, rec.medals[m.id] != null, rec.medals[m.id])).join('');
    const rows = [['최고 점수', 'score', v => v.toLocaleString()], ['최고 웨이브', 'wave', String], ['최다 처치', 'kills', v => v.toLocaleString()],
      ['최장 생존', 'time', NG.fmtTime], ['최고 콤보', 'combo', String]];
    let h = '<thead><tr><th></th>' + REC.DIFFS.map(d => '<th class="d-' + d + '">' + NG.DATA.DIFFICULTY[d].name + '</th>').join('') + '</tr></thead><tbody>';
    for (const [name, k, f] of rows) {
      h += '<tr><th>' + name + '</th>' + REC.DIFFS.map(d => { const v = rec.best[d][k]; return '<td>' + (v > 0 ? f(v) : '-') + '</td>'; }).join('') + '</tr>';
    }
    $('rec-table').innerHTML = h + '</tbody>';
    const L = rec.life;
    $('rec-life').innerHTML = '<span>총 <b>' + L.games.toLocaleString() + '</b>판</span><span>처치 <b>' + L.kills.toLocaleString() + '</b></span>' +
      '<span>보스 <b>' + L.bosses.toLocaleString() + '</b></span><span>필살기 <b>' + L.ults.toLocaleString() + '</b></span><span>플레이 <b>' + NG.fmtTime(L.time) + '</b></span>';
  }

  function openMedals() {
    if (mode !== 'title') return;
    mode = 'medals';
    NG.Audio.ui('open');
    renderMedalBoard();
    show('scr-medals');
  }
  function closeMedals() {
    if (mode !== 'medals') return;
    mode = 'title';
    NG.Audio.ui('close');
    renderBest();
    show('scr-title');
  }

  // 이번 판을 기록에 넣는다 (게임 오버, 또는 10초 넘게 하고 그만둘 때). 깬 기록 이름 목록을 돌려준다
  function saveRun(finished) {
    if (!W || runSaved) return [];
    runSaved = true;
    const run = REC.runOf(W);
    checkMedals(false, finished);
    const broken = REC.finish(rec, run);
    REC.addBossKinds(rec, W.stats.bossTypes);
    REC.save(rec);
    // 지갑은 네 게임이 같이 쓴다: 다른 게임에서 바뀐 코인을 먼저 다시 읽고 더한다 (옛 코인으로 덮어쓰지 않게)
    shop = SH.load();
    lastEarn = SH.finishRun(shop, SH.runOf(W));
    SH.save(shop);
    reportHub(run);
    return broken;
  }

  // 놀이 본부(common/hub.js)에 알린다: 기록실 요약과 오늘의 미션
  function reportSummary() {
    if (typeof HUB === 'undefined' || !HUB.report) return;
    try {
      let best = 0;
      for (const d of Object.keys(rec.best)) best = Math.max(best, rec.best[d].score || 0);
      HUB.report('ngun', { best, bestText: best ? '최고 ' + best.toLocaleString() + '점' : '', medals: REC.count(rec), medalMax: NG.DATA.MEDALS.length, games: rec.life.games });
    } catch (e) { /* 무시 */ }
  }
  // 알아서 맞춰 주는 난이도 (common/hub.js). 본부가 없거나 실패하면 1 (원래 난이도)
  function adaptMul() {
    if (typeof HUB === 'undefined' || !HUB.adaptMul) return 1;
    try { const m = Number(HUB.adaptMul('ngun', diff)); return Number.isFinite(m) && m > 0 ? m : 1; } catch (e) { return 1; }
  }
  // 판이 끝났을 때(게임 오버) 이번 판 성적을 알린다. 1 = 그 난이도에서 보통 잘한 판 (world.js perfOf)
  function adaptReport() {
    if (typeof HUB === 'undefined' || !HUB.adaptRun || !W) return;
    try { HUB.adaptRun('ngun', W.diff.id, NG.World.perfOf(W)); } catch (e) { /* 무시 */ }
  }
  function reportHub(run) {
    if (typeof HUB === 'undefined' || !HUB.report) return;
    reportSummary();
    try {
      // planet: 가 본 가장 먼 행성 (1 수성 … 9 명왕성, 10 얼음 … 17 떠돌이 외계 행성, 2바퀴는 18부터) · blackholes: 깬 블랙홀 웨이브 수 (스티커북)
      // gifts: 연 선물 상자 · fevers: 피버 타임 횟수 · wingmen: 구한 동료 우주선 (2026-09-27)
      const fresh = HUB.reportRun('ngun', { wave: W.wave, bosses: W.bossKills, kills: W.stats.kills, planet: W.stats.planet, blackholes: W.stats.holesCleared,
        gifts: W.stats.gifts, fevers: W.stats.fevers, wingmen: W.stats.wingmen,
        // bossKinds: 지금까지 이긴 보스 종류 수 (보스 스티커, 2026-09-27) · revives: 한 번 더! 쓴 수
        bossKinds: REC.bossKindCount(rec), revives: W.stats.revives || 0 }, W.stats.time);
      if (fresh.length) toast('오늘의 미션 완료: ' + fresh[0]);
    } catch (e) { /* 본부 기록이 실패해도 게임은 계속 */ }
  }

  function setDiff(d, tap) {
    if (tap && d !== diff) NG.Audio.ui('tap');
    diff = d;
    NG.store.set(DIFF_KEY, d);
    for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === d));
    renderBest();
  }

  function renderAudioToggles() {
    for (const b of document.querySelectorAll('[data-audio]')) {
      const on = b.dataset.audio === 'music' ? SND.musicOn() : SND.fxOn();
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.state').textContent = on ? '켬' : '끔';
    }
    $('btn-mute').classList.toggle('muted', SND.muted());
  }

  // 음악·효과음 켜고 끄기 (공통 설정, 다른 게임에도 그대로). 아이콘은 SND.onChange가 다시 그린다
  function toggleAudio(kind) {
    NG.Audio.unlock();
    if (kind === 'music') SND.setMusic(!SND.musicOn());
    else SND.setFx(!SND.fxOn());
    NG.Audio.ui('tap');
  }

  // ─── 기체 · 상점 · 미션 ───────────────────────────────────
  const DD = NG.DATA;
  const fmt = n => Math.floor(n).toLocaleString();

  // 기체 미리보기: 총열 + 모양 (render.js drawShip)
  function paintShip(cv, look) {
    const g = cv.getContext('2d');
    const S = cv.width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    const k = S / 64;
    g.setTransform(k, 0, 0, k, 0, 0);
    const n = 1 + ((look.gun && look.gun.barrels) || 0), rot = -Math.PI / 2, r = 13;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, 'rgba(' + look.glow + ',0.45)');
    grad.addColorStop(1, 'rgba(' + look.glow + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ffe66d'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    const spread = Math.min(0.12 * (n - 1) * 2.5, 2.8);
    for (let i = 0; i < n; i++) {
      const a = rot + (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1));
      g.moveTo(32 + Math.cos(a) * r * 0.5, 34 + Math.sin(a) * r * 0.5);
      g.lineTo(32 + Math.cos(a) * (r + 11), 34 + Math.sin(a) * (r + 11));
    }
    g.stroke();
    NG.Render.drawShip(g, look, 32, 34, r, rot, false);
    if (look.drones) {
      g.fillStyle = '#a6ffc9';
      for (let i = 0; i < look.drones; i++) { const a = 0.6 + Math.PI * i; g.beginPath(); g.arc(32 + Math.cos(a) * 24, 34 + Math.sin(a) * 24, 4, 0, Math.PI * 2); g.fill(); }
    }
  }

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
    const ship = SH.shipDef(shop.ship) || DD.SHIPS[0];
    paintShip($('ship-preview'), ship);
    $('ship-name').textContent = ship.name;
    $('ship-name').style.color = ship.color;
    $('ship-desc').textContent = ship.desc;
    $('coin-count').textContent = fmt(shop.coins);
    $('title-missions').innerHTML = missionsHtml('미션');
    const lo = DD.START_ITEMS.filter(it => shop.items[it.id] > 0).map(it => it.name + (shop.items[it.id] > 1 ? ' ×' + shop.items[it.id] : ''));
    $('loadout-line').textContent = lo.length ? '다음 판 시작 아이템: ' + lo.join(' · ') : '';
  }

  function shipStats(s) {
    const g = s.gun || {};
    const fire = (1 + (g.barrels || 0)) * (g.rate || 1) * (g.dmg || 1) * (1 + ((0.05 + (g.crit || 0)) * ((g.critMul || 2.5) - 1))) * (1 + 0.35 * ((g.pierce || 0) + (s.drones || 0)));
    return [['체력', (5 + s.hp) / 8], ['속도', s.speed / 1.25], ['화력', fire / 2.2], ['대시', (1 / s.dashCd) / 1.5]];
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
    if (shopTab === 'ships') {
      $('shop-sub').textContent = '기체마다 모양·능력치·특기가 다릅니다. 산 기체는 눌러서 고르세요';
      h = DD.SHIPS.map(s => {
        const own = !!shop.ships[s.id], cur = shop.ship === s.id;
        return '<div class="sitem ship' + (cur ? ' cur' : '') + (own ? '' : ' locked') + '" style="--sc:' + s.color + '">' +
          '<canvas class="ship-cv" width="128" height="128" data-ship="' + s.id + '" aria-hidden="true"></canvas>' +
          '<b class="s-name">' + esc(s.name) + '</b>' +
          '<span class="s-desc">' + esc(s.desc) + '</span>' +
          '<span class="s-bars">' + shipStats(s).map(([n, v]) => '<span><em>' + n + '</em><i><u style="width:' + Math.round(Math.max(0.08, Math.min(1, v)) * 100) + '%"></u></i></span>').join('') + '</span>' +
          (cur ? '<span class="maxed on">사용 중</span>' : own ? '<button type="button" class="use" data-use="' + s.id + '">고르기</button>' : priceBtn(s.id, '')) +
        '</div>';
      }).join('');
    } else if (shopTab === 'up') {
      $('shop-sub').textContent = '한 번 사면 모든 판에 계속 적용됩니다 (5단계)';
      h = DD.UPGRADES.map(u => {
        const lv = shop.up[u.id] || 0;
        let pips = '';
        for (let k = 0; k < DD.UPGRADE_MAX; k++) pips += '<i class="' + (k < lv ? 'on' : '') + '"></i>';
        return '<div class="sitem row"><span class="s-icon">' + u.icon + '</span>' +
          '<span class="s-mid"><b class="s-name">' + esc(u.name) + ' <small>' + lv + '단계</small></b><span class="s-desc">' + esc(u.desc) + '</span><span class="pips">' + pips + '</span></span>' +
          priceBtn(u.id, '최대') + '</div>';
      }).join('');
    } else {
      $('shop-sub').textContent = '사 두면 다음 판 시작할 때 하나씩 자동으로 씁니다 (종류마다 3개까지)';
      h = DD.START_ITEMS.map(it => {
        const n = shop.items[it.id] || 0;
        return '<div class="sitem row"><span class="s-icon">' + it.icon + '</span>' +
          '<span class="s-mid"><b class="s-name">' + esc(it.name) + ' <small>' + n + '/' + it.max + '개</small></b><span class="s-desc">' + esc(it.desc) + '</span></span>' +
          priceBtn(it.id, '가득') + '</div>';
      }).join('');
    }
    list.innerHTML = h;
    for (const cv of list.querySelectorAll('canvas[data-ship]')) paintShip(cv, SH.shipDef(cv.dataset.ship));
  }

  function openShop(tab) {
    if (mode !== 'title') return;
    mode = 'shop';
    NG.Audio.ui('open');
    if (tab) shopTab = tab;
    renderShop();
    show('scr-shop');
  }
  function closeShop() {
    if (mode !== 'shop') return;
    mode = 'title';
    NG.Audio.ui('close');
    renderBest();
    show('scr-title');
  }

  const NAMES = { coins: '코인이 모자라요', owned: '이미 가진 기체예요', max: '더는 살 수 없어요' };
  function buyThing(id) {
    const r = SH.buy(shop, id);
    if (r.ok) {
      SH.save(shop);
      NG.Audio.ui('buy');
      vibrate(20);
      if (SH.shipDef(id)) toast(SH.shipDef(id).name + ' 구입! 이제 이 기체로 출격합니다');
    } else {
      NG.Audio.ui('deny');
      toast(NAMES[r.reason] || '살 수 없어요');
    }
    if (mode === 'shop') renderShop();
    renderTitleShop();
    return r;
  }
  function useShip(id) {
    const ok = SH.selectShip(shop, id);
    if (ok) { SH.save(shop); NG.Audio.ui('tap'); }
    if (mode === 'shop') renderShop();
    renderTitleShop();
    return ok;
  }

  // 미션 보상 받기: 코인 +, 소리, 버튼 자리에서 "+120"이 튀어 오른다
  function claimMission(i, btn) {
    const got = SH.claim(shop, i);
    if (!got) return 0;
    SH.save(shop);
    NG.Audio.ui('claim');
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
    const e = lastEarn || { coins: 0, parts: { score: 0, wave: 0, boss: 0, pickup: 0, gift: 0, bonus: 0 }, done: [] };
    $('over-coins').textContent = '+0';
    const P = e.parts, bits = [['점수', P.score], ['웨이브', P.wave], ['보스', P.boss], ['주운 코인', P.pickup], ['선물 상자', P.gift], ['강화 보너스', P.bonus]];
    // 선물 상자에서 받은 다음 판 시작 아이템
    const gi = (e.items || []).map(id => { const it = SH.itemDef(id); return it ? it.name : ''; }).filter(Boolean);
    $('over-coin-parts').innerHTML = bits.filter(b => b[1] > 0).map(b => '<span>' + b[0] + ' <b>' + fmt(b[1]) + '</b></span>').join('') +
      (gi.length ? '<span>다음 판 선물 <b>' + esc(gi.join(' · ')) + '</b></span>' : '');
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
      if (step !== lastTick) { lastTick = step; NG.Audio.ui('coin'); }
      if (k < 1 && mode === 'over') requestAnimationFrame(tick);
      else { el.textContent = '+' + fmt(total); el.classList.add('done'); }
    };
    el.classList.remove('done');
    requestAnimationFrame(tick);
  }

  // ─── 흐름 ──────────────────────────────────────────────────
  function newGame() {
    NG.Audio.unlock();
    const { w, h } = size();
    // 시작 아이템은 이번 판에 하나씩 쓰고 사라진다
    shop = SH.load();
    const lo = SH.takeLoadout(shop);
    SH.save(shop);
    runLoadout = lo;
    // 알아서 맞춰 주는 난이도: 놀이 본부가 최근 판들을 보고 준 배율 (처음 두 판은 1, 없으면 1)
    const opts = SH.worldOpts(shop, lo);
    opts.adapt = adaptMul();
    W = NG.World.createWorld(w, h, undefined, diff, opts);
    lastEarn = null;
    const used = NG.DATA.START_ITEMS.filter(it => lo[it.id]).map(it => it.name);
    if (used.length) setTimeout(() => { if (mode === 'play') toast('시작 아이템: ' + used.join(' · ')); }, 300);
    input.reset();
    runMedals = [];
    runSaved = false;
    hideSticker();
    cardsIdle = false;
    medalCheckT = 0;
    clearMedalToasts();
    mode = 'play';
    NG.Audio.ui('start');
    NG.Audio.startPlay(W.place ? W.place.planet.id : 'mercury');
    wakeLock(true);
    show(null);
  }

  // 판을 도중에 그만둘 때(일시정지 → 처음 화면으로·게임 고르기로): 게임 오버처럼 코인·기록·미션·메달·본부 알림을 다 하고 나간다.
  // 아무것도 조용히 버리지 않는다. 시작하고 QUIT.refundSec초 안이면 이번 판에 쓴 시작 아이템도 돌려준다
  function endRun() {
    if (!W || runSaved) return null;
    if (W.phase === 'over') NG.World.giveUp(W);
    const before = runMedals.length;
    saveRun(true);
    const Q = NG.DATA.QUIT;
    if (W.stats.time >= Q.adaptMin) adaptReport();
    let back = 0;
    if (W.stats.time < Q.refundSec) {
      for (const it of NG.DATA.START_ITEMS) {
        if (runLoadout[it.id] && (shop.items[it.id] || 0) < it.max) { shop.items[it.id] = (shop.items[it.id] || 0) + 1; back++; }
      }
      if (back) SH.save(shop);
    }
    runLoadout = {};
    const bits = [];
    if (lastEarn && lastEarn.coins > 0) bits.push('코인 +' + fmt(lastEarn.coins));
    if (runMedals.length > before) bits.push('새 메달 ' + (runMedals.length - before) + '개');
    if (back) bits.push('시작 아이템 돌려받음');
    return bits.join(' · ');
  }

  function toTitle() {
    const note = endRun();
    clearMedalToasts();
    hideSticker();
    W = null;
    mode = 'title';
    NG.Audio.title();
    wakeLock(false);
    renderBest();
    show('scr-title');
    if (note) setTimeout(() => toast(note), 250);
  }

  // 게임 고르기 화면으로 (첫 화면 ../index.html). 판 중이면 먼저 제대로 끝낸다
  function toHub() {
    endRun();
    wakeLock(false);
    try { location.href = '../index.html'; } catch (e) { /* 무시 */ }
  }

  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    $('pause-aim').textContent = input.aimMode === 'mouse' ? '마우스' : '자동';
    NG.Audio.duck(true);
    NG.Audio.ui('open');
    show('scr-pause');
  }

  function resume() {
    if (mode !== 'paused') return;
    input.clearButtons(); // 댄 엄지는 그대로 (손을 떼지 않고 바로 이어서 움직인다)
    mode = 'play';
    NG.Audio.duck(false);
    NG.Audio.ui('close');
    show(null);
  }

  // 단계 표시: 이미 올린 칸(채움) · 이번에 올릴 칸(깜빡) · 남은 칸
  function pips(lv, max) {
    let h = '';
    for (let k = 0; k < max; k++) h += '<i class="' + (k < lv ? 'on' : k === lv ? 'next' : '') + '"></i>';
    return h; // 칸만 (영어 Lv 글자 없이)
  }

  function showCards() {
    mode = 'cards';
    cardsShownAt = performance.now();
    cardsIdle = false;
    $('cards-title').textContent = '웨이브 ' + W.wave + ' 끝!';
    const list = $('card-list');
    list.innerHTML = '';
    // 쉬움이면 한 장에 살짝 "추천" (world.js recommendCard)
    const rec1 = W.diff.id === 'easy' ? W.recommend : -1;
    W.cards.forEach((c, i) => {
      const lv = W.player.lvl[c.id] || 0;
      const t = NG.World.cardText(c);
      const b = document.createElement('button');
      b.className = 'card' + (c.id === 'barrel' ? ' rare' : '') + (i === rec1 ? ' pick-me' : '');
      b.setAttribute('aria-label', t.words + (i === rec1 ? ' (추천)' : ''));
      b.innerHTML =
        '<span class="card-key only-pc">' + (i + 1) + '</span>' +
        (i === rec1 ? '<span class="card-rec">추천</span>' : '') +
        '<span class="card-icon" aria-hidden="true">' + esc(t.pic) + '</span>' +
        '<span class="card-name">' + esc(t.words) + '</span>' +
        '<span class="card-desc">' + esc(t.small) + '</span>' +
        '<span class="card-lv">' + (c.max === Infinity ? '' : pips(lv, c.max)) + '</span>';
      b.style.animationDelay = (i * 0.07) + 's';
      b.addEventListener('click', () => choose(i));
      list.appendChild(b);
    });
    show('scr-cards');
  }

  function choose(i) {
    // 사격하다 실수로 누르는 것 방지
    // 터치는 조준하던 손가락이 그대로 카드를 누르기 쉬워서 더 길게 막는다
    if (mode !== 'cards' || performance.now() - cardsShownAt < (isTouch ? 600 : 350)) return;
    if (NG.World.pickCard(W, i)) {
      input.clearButtons(); // 댄 엄지는 그대로 (카드를 고른 뒤 바로 이어서 움직인다)
      mode = 'play';
      show(null);
      if (cardsIdle) { wakeLock(true); cardsIdle = false; }
      drainEvents(W);
    }
  }

  // ─── 한 번 더! (2026-09-27) ───────────────────────────────
  // 지면 한 판에 한 번 큰 "한 번 더!" 버튼과 줄어드는 고리(REVIVE.wait초). 누르면 world.js revive로 그 자리에서 되살아난다 (공짜)
  function showContinue() {
    mode = 'continue';
    contShownAt = performance.now();
    contT = 0;
    NG.Audio.duck(true);
    // 기체가 터지는 소리 뒤에 "한 번 더?" 소리
    setTimeout(() => { if (mode === 'continue') NG.Audio.ui('continueAsk'); }, 450);
    const wait = NG.DATA.REVIVE.wait;
    $('cont-num').textContent = String(wait);
    const ring = $('cont-ring');
    ring.style.animation = 'none';
    void ring.getBoundingClientRect();
    ring.style.animation = view.calm ? 'none' : '';
    ring.style.setProperty('--wait', wait + 's');
    show('scr-continue');
  }
  function doRevive() {
    if (mode !== 'continue' || performance.now() - contShownAt < GUARD) return false;
    if (!NG.World.revive(W)) return false;
    input.clearButtons();
    mode = 'play';
    NG.Audio.duck(false);
    show(null);
    drainEvents(W); // world 'revive' → 공통 continueGo
    vibrate([20, 30, 40]);
    return true;
  }
  function giveUpContinue(force) {
    if (mode !== 'continue') return false;
    if (!force && performance.now() - contShownAt < GUARD) return false;
    NG.World.giveUp(W);
    gameOver(true);
    return true;
  }
  function tickContinue(dt) {
    contT += dt;
    const wait = NG.DATA.REVIVE.wait, left = Math.max(0, Math.ceil(wait - contT));
    const el = $('cont-num');
    // 숫자가 바뀔 때마다 똑딱, 마지막 1은 높게
    if (el.textContent !== String(left)) { el.textContent = String(left); if (left > 0) NG.Audio.ui('tick', { hi: left === 1 }); }
    if (contT >= wait) giveUpContinue(true);
  }

  // quick: 한 번 더! 화면에서 넘어오면 바로 보여 준다 (쓰러지는 장면은 이미 봤다)
  function gameOver(quick) {
    mode = 'over';
    const broken = saveRun(true);
    adaptReport();
    wakeLock(false);
    runLoadout = {};
    clearMedalToasts(); // 이번 판 메달은 결과 화면에 모아 보여 준다
    // 음악은 멈추고 게임 오버 소리 (쉬움은 부드러운 overSoft)
    NG.Audio.stopMusic(1.2);
    const overSnd = W.diff.id === 'easy' ? 'overSoft' : 'over';
    setTimeout(() => { if (mode === 'over') NG.Audio.ui(overSnd); }, quick ? 0 : 600);
    $('over-diff').textContent = W.diff.name;
    $('over-score').textContent = W.score.toLocaleString();
    $('over-new').style.display = broken.indexOf('score') >= 0 ? '' : 'none';
    $('over-wave').textContent = W.wave;
    $('over-kills').textContent = W.stats.kills.toLocaleString();
    $('over-time').textContent = NG.fmtTime(W.stats.time);
    $('over-combo').textContent = W.stats.bestCombo;
    $('over-n').textContent = W.player.gun.barrels;
    const ship = SH.shipDef(W.player.ship) || NG.DATA.SHIPS[0];
    $('over-ship').textContent = ship.name;
    $('over-ship').style.color = ship.color;
    renderEarn();
    // 깬 기록마다 "신기록!" 딱지
    for (const el of document.querySelectorAll('#scr-over [data-rec]')) {
      const hit = broken.indexOf(el.dataset.rec) >= 0;
      el.classList.toggle('rec', hit);
      const old = el.querySelector('.chip');
      if (old) old.remove();
      if (hit) el.insertAdjacentHTML('beforeend', '<span class="chip">신기록!</span>');
    }
    // 이번 판에 딴 메달 (게임 중에 딴 것 포함)
    renderOverMedals();
    const counts = {};
    for (const id of W.stats.picks) counts[id] = (counts[id] || 0) + 1;
    const all = NG.DATA.CARDS.concat([NG.DATA.FALLBACK_CARD]);
    $('over-picks').innerHTML = Object.keys(counts).length
      ? Object.keys(counts).map(id => {
          const c = all.find(x => x.id === id);
          const t = NG.World.cardText(c);
          return '<span class="pick">' + esc(t.pic) + ' ' + esc(t.words) + (counts[id] > 1 ? ' ×' + counts[id] : '') + '</span>';
        }).join('')
      : '<span class="pick">없음</span>';
    // 결과 화면이 뜨면: 코인 세기(똑딱) → 새 최고 점수면 팡파르 → 새 메달이면 메달 소리 (겹치지 않게 차례로)
    const record = broken.indexOf('score') >= 0, medals = runMedals.length > 0;
    setTimeout(() => {
      if (mode !== 'over') return;
      overShownAt = performance.now(); show('scr-over'); countCoins();
      if (record) setTimeout(() => { if (mode === 'over') NG.Audio.ui('fanfare'); }, 1200);
      if (medals) setTimeout(() => { if (mode === 'over') NG.Audio.ui('medal'); }, record ? 2800 : 1200);
    }, quick ? 0 : 900);
  }

  // 이번 판에 딴 메달: 3개까지는 카드로, 더 많으면 동그란 메달만 한 줄로 (작은 화면에서도 다시 하기 버튼이 늘 보이게)
  function renderOverMedals() {
    const om = $('over-medals');
    const n = runMedals.length;
    om.classList.toggle('strip', n > 3);
    if (!n) { om.innerHTML = ''; return; }
    if (n <= 3) { om.innerHTML = '<p class="nm-head">새 메달 ' + n + '개</p>' + runMedals.map(m => medalHtml(m, true)).join(''); return; }
    om.innerHTML = '<p class="nm-head">새 메달 ' + n + '개</p>' + runMedals.map(m =>
      '<span class="medal t' + m.tier + ' mini" title="' + esc(m.name) + '"><span class="coin' + (String(m.icon).length > 2 ? ' long' : '') + '" aria-hidden="true"><i>' + esc(m.icon) + '</i></span><span class="mname">' + esc(m.name) + '</span></span>').join('');
  }

  function drainEvents(world) {
    for (const ev of world.events) {
      // 소리: NG.Audio.event (이름이 다른 것은 audio.js ALIAS·UI_EVENT)
      if (ev === 'shoot') NG.Audio.event(ev, { n: world.player.gun.barrels });
      else NG.Audio.event(ev);
      if (world === W) {
        // 웨이브 시작: 행성이 바뀌면 그 행성 음악으로, 보스 웨이브면 힘찬 보스 분위기
        if (ev === 'wave' || ev === 'boss') NG.Audio.planet(world.place && world.place.planet.id, ev === 'boss');
        if (ev === 'boss') NG.Audio.boss(true);
        else if (ev === 'bossDown') { NG.Audio.boss(false); bossSticker(world); }
        else if (ev === 'hurt' || ev === 'over') vibrate(ev === 'over' ? 300 : 60);
        else if (ev === 'ult') vibrate([30, 40, 90]);
        else if (ev === 'ultReady') vibrate(25);
        else if (ev === 'shieldBlock' || ev === 'bomb') vibrate(ev === 'bomb' ? [20, 30, 60] : 40);
        // 피버 타임: 음악이 빨라진다 · 선물 상자·동료 구출: 짧은 진동
        else if (ev === 'fever') { NG.Audio.fever(true); vibrate([20, 30, 20, 30, 40]); }
        else if (ev === 'feverEnd') NG.Audio.fever(false);
        else if (ev === 'gift' || ev === 'wingman') vibrate([15, 25, 30]);
      }
    }
    world.events.length = 0;
  }

  // ─── 보스 스티커 (2026-09-27) ──────────────────────────────
  // 처음 이긴 보스 종류면 "보스 스티커 받았다!" 창을 잠깐 (누르지 않아도 사라지고, 게임을 막지 않는다)
  let stickerTimer = 0;
  function bossSticker(world) {
    const id = world.lastBoss;
    if (!id) return;
    const fresh = REC.addBossKinds(rec, [id]);
    if (!fresh.length) return;
    REC.save(rec);
    showSticker(id);
  }
  function showSticker(id) {
    const look = NG.DATA.BOSSES.find(b => b.id === id);
    if (!look) return;
    const el = $('sticker');
    const cv = $('sticker-cv');
    NG.Render.drawBossIcon(cv.getContext('2d'), look, cv.width);
    $('sticker-name').textContent = look.name;
    $('sticker-name').style.color = look.color;
    $('sticker-count').textContent = '보스 스티커 ' + REC.bossKindCount(rec) + ' / ' + NG.DATA.BOSSES.length;
    el.style.setProperty('--sc', look.color);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    NG.Audio.ui('sticker');
    vibrate([20, 40, 20, 40, 60]);
    clearTimeout(stickerTimer);
    stickerTimer = setTimeout(hideSticker, NG.DATA.STICKER.show * 1000);
  }
  function hideSticker() {
    clearTimeout(stickerTimer);
    $('sticker').classList.remove('on');
  }

  // ─── 입력 연결 ─────────────────────────────────────────────
  input.onKey = code => {
    NG.Audio.unlock();
    if (code === 'KeyM') return toggleMute();
    if (code === 'KeyF') { toast('조준: ' + (input.toggleAim() === 'mouse' ? '마우스' : '자동')); return; }
    if (mode === 'medals') { if (code === 'Escape' || code === 'Enter') closeMedals(); return; }
    if (mode === 'shop') { if (code === 'Escape') closeShop(); return; }
    if (mode === 'title' && code === 'Enter') return newGame();
    if (mode === 'over' && code === 'Enter') return retry();
    if (mode === 'continue') { if (code === 'Enter' || code === 'Space') doRevive(); else if (code === 'Escape') giveUpContinue(); return; }
    if (code === 'KeyP' || code === 'Escape') return mode === 'play' ? pause() : resume();
    if (mode === 'cards') {
      const i = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
      if (i != null) choose(i);
    }
  };

  // 소리 끄기·켜기 (네 게임과 첫 화면이 함께 따른다). 켤 때는 톡 소리로 알려 준다
  function toggleMute() {
    NG.Audio.unlock();
    SND.toggleMuted();
    NG.Audio.ui('tap');
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 지원 안 하면 무시 */ }
  }

  for (const b of document.querySelectorAll('[data-diff]')) b.addEventListener('click', () => setDiff(b.dataset.diff, true));
  for (const b of document.querySelectorAll('[data-audio]')) b.addEventListener('click', () => toggleAudio(b.dataset.audio));
  // 브라우저는 첫 터치·클릭 뒤에야 소리를 허락한다. 시작 화면 음악도 그때 시작
  window.addEventListener('pointerdown', () => NG.Audio.unlock(), { passive: true });

  // 최고 점수·설정이 브라우저 정리 때 지워지지 않게 요청 (돈 0원, 이 기기 안에서만)
  const keep = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 무시 */ } };
  $('btn-start').addEventListener('click', () => { keep(); newGame(); });
  // 결과 화면: 뜨고 나서 REVIVE.guard초 동안 누른 것은 무시 (아이들이 계속 두드려서 바로 넘어가지 않게)
  const overReady = () => mode === 'over' && performance.now() - overShownAt >= GUARD;
  function retry() { if (overReady()) newGame(); }
  $('btn-retry').addEventListener('click', retry);
  $('btn-again').addEventListener('click', doRevive);
  $('btn-giveup').addEventListener('click', () => giveUpContinue());
  $('btn-hub').addEventListener('click', () => { if (mode === 'title') toHub(); });
  $('btn-over-hub').addEventListener('click', () => { if (overReady()) toHub(); });
  $('btn-quit-hub').addEventListener('click', () => { if (mode === 'paused') toHub(); });
  $('btn-medals').addEventListener('click', () => { NG.Audio.unlock(); openMedals(); });
  $('btn-medals-back').addEventListener('click', closeMedals);
  $('btn-shop').addEventListener('click', () => { NG.Audio.unlock(); openShop('ships'); });
  $('btn-ship').addEventListener('click', () => { NG.Audio.unlock(); openShop('ships'); });
  $('btn-shop-back').addEventListener('click', closeShop);
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { if (shopTab !== b.dataset.tab) NG.Audio.ui('tap'); shopTab = b.dataset.tab; renderShop(); });
  $('shop-list').addEventListener('click', e => {
    const b = e.target.closest('[data-buy],[data-use]');
    if (!b) return;
    if (b.dataset.buy) buyThing(b.dataset.buy); else useShip(b.dataset.use);
  });
  for (const id of ['title-missions', 'over-missions']) {
    $(id).addEventListener('click', e => { const b = e.target.closest('[data-claim]'); if (b) claimMission(+b.dataset.claim, b); });
  }
  $('btn-home').addEventListener('click', () => { if (overReady()) toTitle(); });
  $('btn-resume').addEventListener('click', resume);
  $('btn-quit').addEventListener('click', toTitle);
  $('btn-pause').addEventListener('click', () => (mode === 'play' ? pause() : resume()));
  $('btn-mute').addEventListener('click', toggleMute);
  const dashBtn = $('btn-dash');
  dashBtn.addEventListener('touchstart', e => { e.preventDefault(); input.queueDash(); vibrate(15); dashBtn.classList.add('pressed'); }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) dashBtn.addEventListener(ev, () => dashBtn.classList.remove('pressed'));
  dashBtn.addEventListener('mousedown', () => input.queueDash());
  const ultBtn = $('btn-ult');
  ultBtn.addEventListener('touchstart', e => { e.preventDefault(); input.queueUlt(); ultBtn.classList.add('pressed'); }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) ultBtn.addEventListener(ev, () => ultBtn.classList.remove('pressed'));
  ultBtn.addEventListener('mousedown', () => input.queueUlt());
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
  // 스틱 그리기: 손가락 입력 상태를 DOM 위치로 옮긴다
  function placeStick(el, s, fallback) {
    const R = input.touch.radius;
    const o = s || fallback;
    el.style.transform = 'translate3d(' + (o.ox - R) + 'px,' + (o.oy - R) + 'px,0)';
    el.firstElementChild.style.transform = 'translate3d(' + (o.kx - o.ox) + 'px,' + (o.ky - o.oy) + 'px,0)';
    el.classList.toggle('active', !!s);
    el.classList.toggle('idle', !s);
  }
  function updateSticks() {
    const t = input.touch, h = t.home;
    placeStick(stickMove, t.move, { ox: h.x, oy: h.y, kx: h.x, ky: h.y });
    stickAim.classList.toggle('on', !!t.aim);
    if (t.aim) placeStick(stickAim, t.aim);
  }

  let dashShown = -1;
  function updateDashBtn() {
    const p = W.player;
    const k = Math.round((1 - p.dashCd / p.dashCdMax) * 20) / 20; // 5% 단위로만 스타일 갱신
    if (k === dashShown) return;
    dashShown = k;
    dashBtn.style.setProperty('--k', k);
    dashBtn.classList.toggle('ready', k >= 1);
  }

  let ultShown = -1;
  function updateUltBtn() {
    const p = W.player;
    const k = Math.floor(p.ult / NG.DATA.ULT.need * 20) / 20;
    if (k === ultShown) return;
    ultShown = k;
    ultBtn.style.setProperty('--k', k);
    ultBtn.classList.toggle('ready', k >= 1);
  }

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

  // 다른 게임·다른 창에서 별코인이 바뀌었을 수 있으니 저장본을 다시 읽는다 (옛 코인으로 지갑을 덮어쓰지 않게)
  function reloadSaved() {
    try {
      shop = SH.load();
      rec = REC.load();
      if (mode === 'title') renderBest();
      else if (mode === 'shop') { renderShop(); renderTitleShop(); }
      reportSummary();
    } catch (e) { /* 무시 */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); wakeLock(false); }
    else {
      reloadSaved();
      if (mode === 'play' || mode === 'paused') wakeLock(true); // 돌아오면 다시 요청
    }
  });
  // 뒤로 가기로 돌아온 페이지(브라우저가 통째로 기억해 둔 것)도 저장본을 다시 읽는다
  window.addEventListener('pageshow', e => { if (e.persisted) reloadSaved(); });
  window.addEventListener('pagehide', () => wakeLock(false));

  // ─── 루프 ──────────────────────────────────────────────────
  function demoInput(D) {
    const t = D.t;
    return { moveX: Math.cos(t * 0.5), moveY: Math.sin(t * 0.7), aimAngle: null, dash: false, ult: D.player.ult >= NG.DATA.ULT.need };
  }

  function frame(ts) {
    // 놀이 시간 세기 (common/profile.js): 판이 도는 동안과 카드 고르는 동안만
    if (typeof PROFILE !== 'undefined') PROFILE.setPlaying(mode === 'play' || (mode === 'cards' && !cardsIdle));
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;

    if (mode === 'title' || mode === 'medals' || mode === 'shop') {
      // 시연 판은 8웨이브를 넘기면 처음부터 (오래 켜 두면 적이 계속 늘어 느려지지 않게)
      if (demo && demo.wave > 8) demo = null;
      if (!demo) { const { w, h } = size(); demo = NG.World.createWorld(w, h, 12345); }
      if (demo.phase === 'cards') NG.World.pickCard(demo, 0);
      demo.player.hp = demo.player.maxHp;
      NG.World.step(demo, demoInput(demo), dt);
      demo.events.length = 0;
      NG.Render.draw(ctx, demo, demoView, null);
    } else if (W) {
      if (mode === 'continue') tickContinue(dt);
      // 카드 화면에 1분 넘게 있으면 화면 켜 두기를 푼다 (배터리). 카드를 고르면 다시 요청
      if (mode === 'cards' && !cardsIdle && performance.now() - cardsShownAt > 60000) { cardsIdle = true; wakeLock(false); }
      if (mode === 'play' || mode === 'over' || mode === 'continue') {
        const inp = input.read(W.player);
        // 프레임이 길면 두 번에 나눠 진행 (빠른 탄이 적을 뚫고 지나가지 않게)
        const n = dt > 1 / 50 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          NG.World.step(W, i === 0 ? inp : Object.assign({}, inp, { dash: false, ult: false }), dt / n);
        }
        drainEvents(W);
        // 메달은 0.5초마다 검사 (판 도중에 딴 것은 바로 알림)
        if (mode === 'play' && W.phase !== 'over' && (medalCheckT += dt) > 0.5) { medalCheckT = 0; checkMedals(true, false); }
        if (mode === 'play' && W.phase === 'cards') showCards();
        else if (mode === 'play' && W.phase === 'over') { if (W.canRevive) showContinue(); else gameOver(); }
        updateDashBtn();
        updateUltBtn();
        if (isTouch) updateSticks();
        frozenDrawn = false;
      }
      if (!frozenDrawn) {
        NG.Render.draw(ctx, W, view, mode === 'play' ? input.touch : null);
        if (mode === 'paused' || mode === 'cards') frozenDrawn = true;
      }
    }
    requestAnimationFrame(frame);
  }

  // ─── 시작 ──────────────────────────────────────────────────
  renderAudioToggles();
  SND.onChange(renderAudioToggles); // 다른 게임·다른 창에서 바꿔도 아이콘이 따라온다
  setDiff(diff);
  resize();
  toTitle();
  reportSummary();
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
  NG.debug = {
    get world() { return W; }, get mode() { return mode; }, get diff() { return diff; },
    get medals() { return rec; }, get runMedals() { return runMedals; },
    newGame, choose, setDiff, openMedals, closeMedals, checkMedals,
    // 한 번 더! · 보스 스티커 · 판 끝내기 (2026-09-27)
    revive: () => doRevive(), giveUp: () => giveUpContinue(true), showSticker, hideSticker, endRun, toTitle, renderOverMedals,
    get guard() { return GUARD; }, get view() { return view; }, get touch() { return input.touch; },
    // 기록을 다시 읽는다 (테스트가 저장소를 바꾼 뒤)
    reload() { rec = REC.load(); shop = SH.load(); renderBest(); },
    // 상점·미션 (shop.js)
    get shop() { return shop; }, get missions() { return SH.missionView(shop); }, get lastEarn() { return lastEarn; },
    giveCoins(n) { shop.coins += n; SH.save(shop); renderTitleShop(); if (mode === 'shop') renderShop(); return shop.coins; },
    openShop, closeShop, claim: i => claimMission(i),
    buy: id => buyThing(id), selectShip: id => useShip(id),
  };
})(NG);
