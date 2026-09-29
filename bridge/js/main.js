'use strict';
// 화면 전환 · 입력 연결 · 루프. 규칙은 world.js, 그리기는 render.js, 코인·기록은 shop.js가 맡는다.
(function (BR) {
  const $ = id => document.getElementById(id);
  const D = BR.DATA, PH = D.PHYS, Wd = BR.World, SH = BR.Shop, RD = BR.Render;
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  const calmQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const input = BR.createInput(canvas);

  // ─── 소리 ───
  const HAS_SND = typeof SND !== 'undefined' && SND;
  const ui = (name, o) => { if (HAS_SND) SND.ui(name, o); };
  const sfx = (name, o) => BR.Audio.play(name, o);
  function musicPlay(planet) { if (HAS_SND) { SND.music.duck(1); SND.music.setMood({ calm: true }); SND.music.play('bridge', planet); } }
  const musicOf = planet => (BR.THEME[planet] || BR.THEME.moon).music;

  const view = { w: 0, h: 0, dpr: 1, calm: false, char: 'roll', pen: 'cyan', hint: 0, tutorial: false, drawTip: null };
  const demoView = Object.assign({}, view, { noSay: true });

  let W = null;          // 지금 판
  let demo = null;       // 시작 화면 뒤 시연
  let mode = 'title';    // title | levels | shop | medals | play | clear
  let shop = SH.load();
  let rec = SH.loadRec();
  let shopTab = 'chars';
  let lvPlanet = 'moon';
  let lastEarn = null;
  let hintT = 0, fallT = 0, clearT = 0, scratchT = 0, tipLeft = 0;
  let lastTs = 0, frozen = false;
  const fmt = n => Math.floor(n).toLocaleString();
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const saveAll = () => { SH.save(shop); SH.saveRec(rec); };
  const planetName = id => (D.PLANETS.find(p => p.id === id) || {}).name || id;
  const shortPlanet = id => planetName(id);
  const levelName = L => shortPlanet(L.planet) + ' ' + L.n + '판';

  // ─── 화면 크기 ───
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    view.w = demoView.w = w; view.h = demoView.h = h;
    view.dpr = demoView.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (w * h))));
    view.calm = demoView.calm = !!(calmQuery && calmQuery.matches);
    canvas.width = Math.round(w * view.dpr); canvas.height = Math.round(h * view.dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    frozen = false;
  }
  window.addEventListener('resize', resize);

  // ─── 화면 ───
  const screens = ['scr-title', 'scr-levels', 'scr-clear', 'scr-shop', 'scr-medals'];
  let guardUntil = 0;
  const guarded = () => performance.now() < guardUntil;
  function show(id) {
    for (const s of screens) $(s).classList.toggle('on', s === id);
    document.body.classList.toggle('playing', mode === 'play');
    document.body.classList.toggle('at-title', id === 'scr-title');
    input.active = mode === 'play';
    hideToast();
    if (id === 'scr-clear') {
      guardUntil = performance.now() + 700;
      $(id).classList.add('guard');
      setTimeout(() => $(id).classList.remove('guard'), 700);
    }
  }
  let toastTimer = 0;
  function hideToast() { clearTimeout(toastTimer); $('toast').classList.remove('on'); }
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), ms || 1800);
  }
  function tip(text, sec) {
    const el = $('tip');
    el.textContent = text || '';
    el.classList.toggle('on', !!text);
    tipLeft = text ? sec || 0 : 0;
  }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 무시 */ } }

  // ─── 시작 화면 ───
  const STAR = '<svg class="i" aria-hidden="true"><use href="#i-star"/></svg>';
  function missionsHtml(head) {
    return '<p class="mc-head">' + head + '</p>' + SH.missionView(shop).map((m, i) =>
      '<div class="mrow' + (m.done ? ' done' : '') + '" data-mid="' + m.id + '">' +
        '<span class="m-txt">' + esc(m.text) + '</span>' +
        (m.done ? '<button type="button" class="claim" data-claim="' + i + '">받기 <i class="cn" aria-hidden="true"></i>' + m.reward + '</button>'
          : '<span class="m-rew"><i class="cn" aria-hidden="true"></i>' + m.reward + '</span>') +
        '<span class="m-bar"><i style="width:' + Math.round(m.pct * 100) + '%"></i></span>' +
        '<span class="m-num">' + fmt(m.prog) + ' / ' + fmt(m.goal) + '</span>' +
      '</div>').join('');
  }
  function renderTitle() {
    const ch = SH.charDef(shop.char) || D.CHARS[0];
    view.char = demoView.char = ch.id; view.pen = demoView.pen = shop.pen;
    RD.paintChar($('char-preview'), ch.id);
    $('char-name').textContent = ch.name;
    $('char-desc').textContent = ch.desc;
    $('btn-char').style.setProperty('--sc', ch.ui);
    $('coin-count').textContent = fmt(shop.coins);
    $('title-missions').innerHTML = missionsHtml('미션');
    const n = D.cleared(rec), stars = D.starSum(rec);
    $('best').textContent = n ? n + '판 깼어요 · 별 ' + stars + ' / ' + D.LEVELS.length * 3 : '첫 다리를 그려 볼까요?';
    $('medal-count').textContent = Object.keys(rec.medals).length + '/' + D.MEDALS.length;
    const next = SH.nextLevel(rec);
    $('start-label').textContent = (n ? '이어서! ' : '출발! ') + levelName(next);
    $('planets').innerHTML = D.PLANETS.map(P => {
      const open = SH.planetOpen(rec, P.id), list = D.levelsOf(P.id);
      const c = list.filter(l => rec.levels[l.id] && rec.levels[l.id].stars > 0).length;
      const s = list.reduce((a, l) => a + ((rec.levels[l.id] && rec.levels[l.id].stars) || 0), 0);
      const sub = open ? c + ' / ' + list.length + '판' : '달에서 ' + P.open + '판 깨면 열려요';
      return '<button type="button" class="planet' + (open ? '' : ' locked') + (next.planet === P.id ? ' now' : '') + '" data-planet="' + P.id + '">' +
        '<canvas width="152" height="152" data-pl="' + P.id + '" aria-hidden="true"></canvas>' +
        '<span><b>' + esc(P.name) + '</b><small>' + sub + '</small>' + (open ? '<span class="pst">' + STAR + s + ' / ' + list.length * 3 + '</span>' : '') + '</span></button>';
    }).join('');
    for (const cv of $('planets').querySelectorAll('canvas[data-pl]')) RD.paintPlanet(cv, cv.dataset.pl, !SH.planetOpen(rec, cv.dataset.pl));
  }
  function toTitle() {
    popHistory();
    W = null; mode = 'title';
    input.reset();
    tip('');
    renderTitle();
    show('scr-title');
    musicPlay('title');
  }

  // ─── 판 고르기 ───
  function openLevels(planet) {
    if (!SH.planetOpen(rec, planet)) {
      const P = D.PLANETS.find(p => p.id === planet);
      ui('deny'); toast('달에서 ' + P.open + '판 깨면 ' + P.name + '이 열려요');
      return false;
    }
    popHistory();
    W = null; mode = 'levels'; lvPlanet = planet;
    tip('');
    const list = D.levelsOf(planet), next = SH.nextLevel(rec, planet);
    $('lv-title').textContent = planetName(planet);
    $('lv-sub').textContent = '별 ' + list.reduce((a, l) => a + ((rec.levels[l.id] && rec.levels[l.id].stars) || 0), 0) + ' / ' + list.length * 3 + ' · 잉크를 아끼면 별이 많아요';
    $('lv-grid').innerHTML = list.map(L => {
      const open = SH.levelOpen(rec, L.id), st = (rec.levels[L.id] && rec.levels[L.id].stars) || 0;
      let stars = '';
      for (let k = 0; k < 3; k++) stars += '<svg class="i' + (k < st ? ' on' : '') + '" aria-hidden="true"><use href="#i-star"/></svg>';
      return '<button type="button" class="lv' + (open ? '' : ' locked') + (open && L.id === next.id && !st ? ' next' : '') + '" data-lv="' + L.id + '" aria-label="' + esc(levelName(L) + ' ' + L.name) + '">' +
        '<b>' + L.n + '</b>' + (open ? '<span class="st">' + stars + '</span><small>' + esc(L.name) + '</small>' : '<svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>') + '</button>';
    }).join('');
    ui('open');
    show('scr-levels');
    musicPlay(musicOf(planet));
    return true;
  }

  // ─── 판 ───
  function startLevel(id) {
    const L = D.levelById(id);
    if (!L || !SH.levelOpen(rec, id)) { ui('deny'); return null; }
    BR.Audio.unlock();
    W = Wd.create(L, { char: shop.char });
    mode = 'play';
    hintT = 0; fallT = 0; clearT = 0;
    view.tutorial = !!L.tip && !rec.tut[L.id];
    view.drawTip = null;
    input.reset();
    $('hud-level').querySelector('b').textContent = levelName(L);
    $('hud-level').style.setProperty('--pc', (D.PLANETS.find(p => p.id === L.planet) || {}).color || '#b8bccf');
    $('btn-hint').classList.remove('pulse'); $('btn-reset').classList.remove('pulse');
    const f = L.par;   // 잉크 막대의 별 눈금: 남은 잉크가 이 자리보다 많으면 그 별
    $('ink-s3').style.left = (100 * (1 - f[0] / L.ink)) + '%';
    $('ink-s2').style.left = (100 * (1 - f[1] / L.ink)) + '%';
    updateInk();
    show(null);
    pushHistory();
    ui('start');
    musicPlay(musicOf(L.planet));
    if (view.tutorial) tip(L.tip, 0);
    return W;
  }
  function updateInk() {
    if (!W) return;
    const left = Wd.inkLeft(W), max = W.ink.max, fr = left / max, L = W.level;
    $('ink-fill').style.width = (100 * fr) + '%';
    const used = max - left;
    $('ink-s3').classList.toggle('off', used > L.par[0]);
    $('ink-s2').classList.toggle('off', used > L.par[1]);
    $('ink').classList.toggle('low', fr < 0.2);
    $('btn-undo').disabled = !W.lines.length || W.phase === 'win';
  }
  function undo() { if (W && mode === 'play' && Wd.undo(W)) { ui('tap'); updateInk(); } }
  function resetLevel() { if (W && mode === 'play' && W.phase !== 'win') { Wd.reset(W); fallT = 0; $('btn-reset').classList.remove('pulse'); updateInk(); } }
  function showHint() {
    if (!W || mode !== 'play') return;
    hintT = 5; ui('open');
    $('btn-hint').classList.remove('pulse');
    tip('점선을 따라 그려 봐요', 3);
  }

  // 판을 깼다: 장부·코인·미션·메달·놀이 본부, 그리고 결과 화면
  function settle() {
    shop = SH.load(); rec = SH.loadRec();   // 다른 창에서 지갑이 바뀌었을 수 있다
    const run = SH.runOf(W);
    lastEarn = SH.finishLevel(shop, rec, run);
    saveAll();
    reportHub(run);
    return lastEarn;
  }
  function reportSummary() {
    if (typeof HUB === 'undefined' || !HUB.report) return;
    try {
      const stars = D.starSum(rec);
      HUB.report('bridge', { best: stars, bestText: stars ? '별 ' + stars + '개 · ' + D.cleared(rec) + '판' : '', medals: Object.keys(rec.medals).length, medalMax: D.MEDALS.length, games: rec.total.clears });
    } catch (e) { /* 무시 */ }
  }
  function reportHub(run) {
    if (typeof HUB === 'undefined' || !HUB.reportRun) return;
    reportSummary();
    try {
      // 스티커·오늘의 미션: 깬 판 · 별 · 별 3개 판 · 그린 선 · 행성(1 달, 2 화성) · 시소 · 스프링 · 모두 깬 판 수
      const fresh = HUB.reportRun('bridge', { clears: run.clears, stars: run.stars, three: run.three, lines: run.lines, planet: run.planet === 'mars' ? 2 : 1,
        seesaw: run.seesaw, springs: run.springs, moonAll: D.cleared(rec, 'moon'), marsAll: D.cleared(rec, 'mars'), games: 1 }, run.time);
      if (fresh && fresh.length) setTimeout(() => toast('오늘의 미션 완료: ' + fresh[0]), 1600);
    } catch (e) { /* 본부 기록이 실패해도 게임은 계속 */ }
  }
  function openClear() {
    mode = 'clear';
    input.reset();
    const e = lastEarn, st = W.stars, L = W.level;
    const stars = $('clear-stars').querySelectorAll('i');
    stars.forEach((s, i) => { s.classList.remove('on'); void s.offsetWidth; s.classList.toggle('on', i < st); });
    for (let i = 0; i < st; i++) setTimeout(() => { if (mode === 'clear') sfx('star', { k: i * 2 }); }, 250 + i * 250);
    $('clear-title').textContent = st >= 3 ? '최고예요!' : '만났다!';
    $('clear-line').textContent = st >= 3 ? '잉크를 조금만 썼어요!' : st === 2 ? '잉크를 조금 더 아끼면 별 3개!' : '다음엔 더 짧게 그려 볼까요?';
    $('clear-coins').textContent = '+' + fmt(e.coins);
    const bits = [[e.first ? '처음 깬 판' : '다시 깬 판', e.parts.clear], ['별', e.parts.stars], ['별 더 받음', e.parts.better]];
    $('clear-parts').innerHTML = bits.filter(b => b[1] > 0).map(b => '<span>' + b[0] + ' <b>' + fmt(b[1]) + '</b></span>').join('');
    $('clear-missions').innerHTML = missionsHtml(e.done.length ? '미션 완료! 받기를 누르세요' : '미션');
    for (const id of e.done) { const row = $('clear-missions').querySelector('[data-mid="' + id + '"]'); if (row) row.classList.add('fresh'); }
    const TIER = { 1: '동', 2: '은', 3: '금' };
    $('clear-medals').innerHTML = e.medals.map(m => '<span class="mchip t' + m.tier + '"><i>' + TIER[m.tier] + '</i>' + esc(m.name) + '</span>').join('');
    if (e.medals.length) setTimeout(() => { if (mode === 'clear') ui('medal'); }, 1100);
    const nx = nextAfter(L);
    $('btn-next').hidden = !nx;
    show('scr-clear');
    popHistory();
    reportSummary();
  }
  // 다음 판: 같은 행성 다음 번호, 없으면 다음 행성 첫 판 (열려 있을 때만)
  function nextAfter(L) {
    const i = D.LEVELS.indexOf(L);
    for (let k = i + 1; k < D.LEVELS.length; k++) if (SH.levelOpen(rec, D.LEVELS[k].id)) return D.LEVELS[k];
    return null;
  }

  // ─── 상점 ───
  function renderShop() {
    $('shop-coins').textContent = fmt(shop.coins);
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === shopTab));
    const list = $('shop-list');
    list.className = 'shop-list t-' + shopTab;
    const priceBtn = id => { const c = SH.price(shop, id); return '<button type="button" class="buy' + (shop.coins < c ? ' poor' : '') + '" data-buy="' + id + '"><i class="cn" aria-hidden="true"></i>' + fmt(c) + '</button>'; };
    if (shopTab === 'chars') {
      $('shop-sub').textContent = '공 모양만 달라요. 가진 캐릭터는 눌러서 고르세요';
      list.innerHTML = D.CHARS.map(ch => {
        const own = !!shop.chars[ch.id], cur = shop.char === ch.id;
        return '<div class="sitem skin char' + (cur ? ' cur' : '') + (own ? '' : ' locked') + '" style="--sc:' + ch.ui + '">' +
          '<canvas class="ship-cv" width="160" height="160" data-char="' + ch.id + '" aria-hidden="true"></canvas>' +
          '<b class="s-name">' + esc(ch.name) + '</b><span class="s-desc">' + esc(ch.desc) + '</span>' +
          (cur ? '<span class="maxed on">사용 중</span>' : own ? '<button type="button" class="use" data-use="' + ch.id + '">고르기</button>' : priceBtn(ch.id)) + '</div>';
      }).join('');
      for (const cv of list.querySelectorAll('canvas[data-char]')) RD.paintChar(cv, cv.dataset.char);
    } else {
      $('shop-sub').textContent = '그린 선의 색이 바뀌어요';
      list.innerHTML = D.PENS.map(p => {
        const own = !!shop.pens[p.id], cur = shop.pen === p.id;
        return '<div class="sitem pen' + (cur ? ' cur' : '') + (own ? '' : ' locked') + '" style="--sc:' + p.c[1] + '">' +
          '<canvas class="ship-cv" width="160" height="160" data-pen="' + p.id + '" aria-hidden="true"></canvas>' +
          '<b class="s-name">' + esc(p.name) + '</b>' +
          (cur ? '<span class="maxed on">사용 중</span>' : own ? '<button type="button" class="use" data-use="' + p.id + '">고르기</button>' : priceBtn(p.id)) + '</div>';
      }).join('');
      for (const cv of list.querySelectorAll('canvas[data-pen]')) RD.paintPen(cv, cv.dataset.pen);
    }
  }
  function openShop(tab) {
    if (mode !== 'title') return;
    BR.Audio.unlock();
    mode = 'shop'; shopTab = tab || 'chars';
    renderShop(); ui('open'); show('scr-shop');
  }
  function closeShop() { if (mode !== 'shop') return; mode = 'title'; renderTitle(); ui('close'); show('scr-title'); }
  const DENY = { coins: '코인이 모자라요', owned: '이미 가졌어요' };
  function buyThing(id) {
    const r = SH.buy(shop, id);
    if (r.ok) { SH.save(shop); ui('buy'); vibrate(20); toast('새로 샀어요: ' + (SH.charDef(id) || SH.penDef(id)).name + '!'); }
    else { ui('deny'); toast(DENY[r.reason] || '살 수 없어요'); }
    if (mode === 'shop') renderShop();
    renderTitle();
    return r;
  }
  function useThing(id) {
    const ok = SH.select(shop, id);
    if (ok) { SH.save(shop); ui('tap'); }
    if (mode === 'shop') renderShop();
    renderTitle();
    return ok;
  }
  function claimMission(i, btn) {
    const got = SH.claim(shop, i);
    if (!got) return 0;
    SH.save(shop); ui('claim'); vibrate([15, 30, 15]);
    if (btn && !view.calm) {
      const r = btn.getBoundingClientRect(), pop = document.createElement('span');
      pop.className = 'coin-pop'; pop.textContent = '+' + got;
      pop.style.left = (r.left + r.width / 2) + 'px'; pop.style.top = r.top + 'px';
      document.body.appendChild(pop); setTimeout(() => pop.remove(), 1000);
    }
    renderTitle();
    if (mode === 'clear') $('clear-missions').innerHTML = missionsHtml('미션');
    return got;
  }

  // ─── 메달 ───
  function openMedals() {
    if (mode !== 'title') return;
    mode = 'medals';
    const TIER = { 1: '동', 2: '은', 3: '금' };
    $('medal-sub').textContent = '메달 ' + Object.keys(rec.medals).length + ' / ' + D.MEDALS.length;
    $('medal-list').innerHTML = D.MEDALS.map(m => { const lk = !rec.medals[m.id]; return '<div class="medal t' + m.tier + (lk ? ' locked' : '') + '"><span class="coin">' + (lk ? '?' : TIER[m.tier]) + '</span><span><b>' + m.name + '</b><small>' + m.desc + '</small></span></div>'; }).join('');
    const T = rec.total;
    const rows = [['깬 판', D.cleared(rec) + ' / ' + D.LEVELS.length], ['모은 별', D.starSum(rec) + ' / ' + D.LEVELS.length * 3], ['별 3개 판', D.threeCount(rec)],
      ['그린 선', fmt(T.lines)], ['톡 구슬', fmt(T.dots)], ['논 시간', BR.fmtTime(T.sec)]];
    $('record-list').innerHTML = rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
    ui('open'); show('scr-medals');
  }

  // ─── 입력: 선 그리기 ───
  input.onDown = (sx, sy) => {
    if (!W || mode !== 'play') return;
    BR.Audio.unlock();
    const [x, y] = RD.toLevel(sx, sy);
    if (Wd.beginStroke(W, x, y)) {
      view.drawTip = [x, y];
      if (view.tutorial) { view.tutorial = false; rec.tut[W.level.id] = true; SH.saveRec(rec); tip(''); }
      hintT = Math.min(hintT, 1);
    }
  };
  input.onMove = (sx, sy) => {
    if (!W || !W.drawing) return;
    const [x, y] = RD.toLevel(sx, sy);
    const before = W.drawing.len;
    Wd.drawTo(W, x, y);
    view.drawTip = [x, y];
    if (W.drawing && W.drawing.len > before && (scratchT += W.drawing.len - before) > 40) { scratchT = 0; sfx('scratch'); }
    updateInk();
  };
  input.onUp = () => {
    view.drawTip = null;
    if (!W || !W.drawing) return;
    const s = Wd.endStroke(W);
    if (s) {
      const pen = D.PENS.find(p => p.id === shop.pen) || D.PENS[0];
      RD.fx(s.kind === 'dot' ? 'spark' : 'line', s.pts[0][0], s.pts[0][1], { pts: s.pts, c: pen.c[1] });
      vibrate(12);
    }
    updateInk();
  };

  function drain() {
    for (const ev of W.events) {
      const b = Wd.ballState(W);
      if (ev === 'line' || ev === 'dot' || ev === 'go' || ev === 'undo' || ev === 'reset' || ev === 'thud' || ev === 'bump') sfx(ev);
      if (ev === 'bump' && Math.abs(b.vy) > 200) RD.fx('dust', b.x, b.y + PH.ballR);
      if (ev === 'noInk') { sfx('noInk'); toast('잉크가 다 떨어졌어요'); $('btn-reset').classList.add('pulse'); }
      if (ev === 'spring') { sfx('spring'); RD.fx('spark', b.x, b.y + PH.ballR, { c: '#ff9ae8' }); vibrate(20); }
      if (ev === 'stuck') { sfx('stuck'); toast('막혔나요? 되돌리기나 다시 하기를 눌러요', 2600); $('btn-reset').classList.add('pulse'); }
      if (ev === 'fall') {
        sfx('fall'); fallT = PH.fallShow;
        toast(W.stats.falls >= 2 ? '앗! 힌트 전구를 눌러 봐요' : '앗! 다시 해 볼까요?');
        if (W.stats.falls >= 2) $('btn-hint').classList.add('pulse');
      }
      if (ev === 'win') {
        sfx('win'); vibrate([20, 40, 20, 40, 60]);
        const L = W.level;
        RD.fx('hearts', L.goal[0], L.goal[1] - 120); RD.fx('confetti', L.goal[0], L.goal[1] - 80);
        clearT = 1.4;
        settle();
      }
    }
    W.events.length = 0;
  }

  // ─── 버튼 ───
  const keep = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* 무시 */ } };
  $('btn-start').addEventListener('click', () => { keep(); startLevel(SH.nextLevel(rec).id); });
  $('planets').addEventListener('click', e => { const b = e.target.closest('[data-planet]'); if (b) openLevels(b.dataset.planet); });
  $('lv-grid').addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (!b) return; if (!SH.levelOpen(rec, b.dataset.lv)) { ui('deny'); toast('앞 판을 먼저 깨요'); return; } startLevel(b.dataset.lv); });
  $('btn-lv-back').addEventListener('click', () => { ui('close'); toTitle(); });
  $('btn-back').addEventListener('click', () => { ui('close'); openLevels(W ? W.level.planet : lvPlanet); });
  $('btn-undo').addEventListener('click', undo);
  $('btn-reset').addEventListener('click', () => { ui('tap'); resetLevel(); });
  $('btn-hint').addEventListener('click', showHint);
  $('btn-again').addEventListener('click', () => { if (!guarded() && W) startLevel(W.level.id); });
  $('btn-next').addEventListener('click', () => { if (guarded() || !W) return; const n = nextAfter(W.level); if (n) startLevel(n.id); });
  $('btn-clear-levels').addEventListener('click', () => { if (!guarded()) openLevels(W ? W.level.planet : lvPlanet); });
  $('btn-shop').addEventListener('click', () => openShop('chars'));
  $('btn-char').addEventListener('click', () => openShop('chars'));
  $('btn-shop-back').addEventListener('click', closeShop);
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { shopTab = b.dataset.tab; renderShop(); ui('tap'); });
  $('shop-list').addEventListener('click', e => { const b = e.target.closest('[data-buy],[data-use]'); if (!b) return; if (b.dataset.buy) buyThing(b.dataset.buy); else useThing(b.dataset.use); });
  for (const id of ['title-missions', 'clear-missions']) $(id).addEventListener('click', e => { const b = e.target.closest('[data-claim]'); if (b) claimMission(+b.dataset.claim, b); });
  $('btn-medals').addEventListener('click', () => { BR.Audio.unlock(); openMedals(); });
  $('btn-medals-back').addEventListener('click', () => { ui('close'); toTitle(); });

  // 소리 끄기 (다섯 게임·첫 화면 공통, SND)
  function toggleMute() { BR.Audio.unlock(); if (HAS_SND) SND.toggleMuted(); showMute(); toast(BR.Audio.muted ? '소리 끔' : '소리 켬'); }
  const showMute = () => $('btn-mute').classList.toggle('muted', BR.Audio.muted);
  if (HAS_SND) SND.onChange(showMute);
  $('btn-mute').addEventListener('click', toggleMute);
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyM') toggleMute();
    else if (mode === 'play' && (e.code === 'KeyZ' || e.code === 'Backspace')) undo();
    else if (mode === 'play' && e.code === 'KeyR') resetLevel();
    else if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) startLevel(SH.nextLevel(rec).id);
    else if (mode === 'clear' && (e.code === 'Enter' || e.code === 'Space') && !guarded()) $('btn-next').hidden ? startLevel(W.level.id) : $('btn-next').click();
  });

  // 전체 화면
  const fsBtn = $('btn-fs'), root = document.documentElement;
  if (!(document.fullscreenEnabled && root.requestFullscreen)) fsBtn.hidden = true;
  fsBtn.addEventListener('click', () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else root.requestFullscreen({ navigationUI: 'hide' }).catch(() => { fsBtn.hidden = true; toast('이 화면에선 전체 화면을 쓸 수 없어요'); });
    } catch (e) { fsBtn.hidden = true; }
  });

  // 게임 중 화면이 꺼지지 않게
  let lock = null;
  function wakeLock(on) {
    try {
      if (on && !lock && navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lock = l; l.addEventListener('release', () => { lock = null; }); }).catch(() => {});
      else if (!on && lock) { lock.release().catch(() => {}); lock = null; }
    } catch (e) { /* 무시 */ }
  }
  // 다른 창에서 지갑이 바뀌었을 수 있다: 돌아오면 다시 읽는다
  function refreshSaved() {
    if (mode === 'play') return;
    shop = SH.load(); rec = SH.loadRec();
    if (mode === 'title') renderTitle();
    if (mode === 'shop') renderShop();
  }
  window.addEventListener('pageshow', e => { if (e.persisted) refreshSaved(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshSaved(); if (mode === 'play') wakeLock(true); } });
  // 뒤로 가기: 판 중에는 판 고르기로 (게임 고르기로 바로 나가지 않게)
  let histOn = false, ignorePop = false;
  function pushHistory() { if (histOn) return; try { history.pushState({ br: 1 }, ''); histOn = true; } catch (e) { /* 무시 */ } wakeLock(true); }
  function popHistory() { wakeLock(false); if (!histOn) return; histOn = false; try { ignorePop = true; history.back(); } catch (e) { ignorePop = false; } }
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (!histOn) return;
    histOn = false;
    if (mode === 'play') openLevels(W.level.planet);
  });

  // ─── 시작 화면 뒤 시연: 정답 선을 손으로 그리듯 그리고 공이 굴러간다 ───
  const DEMO_LEVELS = ['moon-1', 'moon-3', 'mars-1', 'moon-5', 'mars-2', 'moon-10'];
  let demoI = 0;
  function newDemo() {
    const L = D.levelById(DEMO_LEVELS[demoI++ % DEMO_LEVELS.length]);
    demo = { W: Wd.create(L, { char: shop.char }), s: 0, i: 1, d: 0, wait: 0.8, done: 0 };
  }
  function stepDemo(dt) {
    if (!demo) newDemo();
    const q = demo, Wq = q.W, sol = Wq.level.sol;
    if (q.wait > 0) { q.wait -= dt; }
    else if (q.s < sol.length) {
      const s = sol[q.s];
      if (q.i === 1 && !Wq.drawing) Wd.beginStroke(Wq, s[0][0], s[0][1]);
      let go = 700 * dt;
      while (go > 0 && q.i < s.length) {
        const [ax, ay] = s[q.i - 1], [bx, by] = s[q.i], l = Math.hypot(bx - ax, by - ay);
        const take = Math.min(go, l - q.d); q.d += take; go -= take;
        const u = q.d / l; Wd.drawTo(Wq, ax + (bx - ax) * u, ay + (by - ay) * u);
        demoView.drawTip = [ax + (bx - ax) * u, ay + (by - ay) * u];
        if (q.d >= l - 1e-6) { q.i++; q.d = 0; }
      }
      if (q.i >= s.length || s.length === 1) { Wd.endStroke(Wq); demoView.drawTip = null; q.s++; q.i = 1; q.d = 0; q.wait = 0.2; }
    }
    Wd.step(Wq, dt);
    Wq.events.length = 0;
    if (Wq.phase === 'win' || Wq.phase === 'fall' || Wq.runT > 12) { q.done += dt; if (q.done > 2.2) newDemo(); }
  }

  // ─── 루프 ───
  const MIN_FRAME = 1000 / 60 - 2;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (typeof PROFILE !== 'undefined') PROFILE.setPlaying(mode === 'play' && (!W || W.phase !== 'win'));
    if (ts - lastTs < MIN_FRAME) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    if (tipLeft > 0 && (tipLeft -= dt) <= 0) tip('');
    if (mode === 'play' && W) {
      Wd.step(W, dt);
      drain();
      if (fallT > 0 && (fallT -= dt) <= 0) { Wd.reset(W); W.events.length = 0; updateInk(); }
      if (clearT > 0 && (clearT -= dt) <= 0) openClear();
      hintT = Math.max(0, hintT - dt);
      view.hint = view.tutorial && W.phase === 'ready' ? 1 : Math.min(1, hintT);
      RD.draw(ctx, W, view, dt);
      frozen = false;
    } else if (mode === 'clear' && W) {
      // 결과 화면 뒤: 친구가 폴짝, 하트가 다 날아가면 그리기를 쉰다 (배터리)
      if (!frozen || RD.busy()) { view.hint = 0; RD.draw(ctx, W, view, dt); frozen = !RD.busy(); }
    } else {
      stepDemo(dt);
      RD.draw(ctx, demo.W, demoView, dt);
    }
  }

  // ─── 시작 ───
  reportSummary();
  showMute();
  resize();
  toTitle();
  requestAnimationFrame(ts => { lastTs = ts - 20; frame(ts); });
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
  BR.debug = {
    get world() { return W; }, get mode() { return mode; }, get demo() { return demo; }, get rec() { return rec; }, get shop() { return shop; },
    get lastEarn() { return lastEarn; }, get view() { return view; },
    startLevel, toTitle, openLevels, openShop, closeShop, openMedals, undo, resetLevel, showHint,
    buy: id => buyThing(id), select: id => useThing(id), claim: i => claimMission(i),
    giveCoins(n) { shop.coins += n; SH.save(shop); renderTitle(); if (mode === 'shop') renderShop(); return shop.coins; },
    // 정답 선을 손가락처럼 그린다 (판 좌표)
    drawSol(k) {
      if (!W) return false;
      const s = W.level.sol[k || 0];
      if (view.tutorial) { view.tutorial = false; rec.tut[W.level.id] = true; SH.saveRec(rec); tip(''); }
      Wd.beginStroke(W, s[0][0], s[0][1]);
      for (let i = 1; i < s.length; i++) { const [ax, ay] = s[i - 1], [bx, by] = s[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 6); for (let j = 1; j <= n; j++) Wd.drawTo(W, ax + (bx - ax) * j / n, ay + (by - ay) * j / n); }
      input.onUp();
      return true;
    },
    unlockAll() { for (const L of D.LEVELS) rec.levels[L.id] = rec.levels[L.id] || { stars: 1, best: 0, clears: 1 }; SH.saveRec(rec); renderTitle(); },
    reload() { shop = SH.load(); rec = SH.loadRec(); renderTitle(); },
    toLevel: RD.toLevel,
  };
})(BR);
