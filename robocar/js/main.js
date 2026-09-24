'use strict';
// 화면 전환·입력·하루 타이머·보상. 규칙은 run.js, 그림은 car.js·scene.js·cards.js.
(function (RC) {
  const D = RC.DATA, S = RC.Sound;
  const $ = id => document.getElementById(id);
  const canvas = $('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  // ─── 저장 ────────────────────────────────────────────────
  const cfg = Object.assign({ body: 'racer', wheel: 'normal', gear: 'jet', color: '#ff3b3b' }, RC.store.get('rc.cfg', {}));
  const prog = Object.assign({ bank: 0, stickers: [], runs: 0 }, RC.store.get('rc.prog', {}));
  // 놀이 기록 (보호자 화면용, 이 기기에만): 부품 선택 횟수, 변신·도착 횟수, 날짜별 판 수, 잠자기 뒤 다시 켠 횟수
  prog.log = Object.assign({ parts: {}, transforms: 0, finished: 0, days: {}, sleeps: 0, sleepRetry: 0, first: null }, prog.log || {});
  function logRun() {
    const L = prog.log, d = new Date().toISOString().slice(0, 10);
    L.first = L.first || d;
    L.days[d] = (L.days[d] || 0) + 1;
    for (const k of Object.keys(L.days).sort().slice(0, -30)) delete L.days[k];   // 최근 30일만
    for (const slot of ['body', 'wheel', 'gear']) { const id = slot + ':' + cfg[slot]; L.parts[id] = (L.parts[id] || 0) + 1; }
    L.parts['color:' + cfg.color] = (L.parts['color:' + cfg.color] || 0) + 1;
  }
  const set = Object.assign({ limit: 20, voice: true, sound: true, vib: true, quality: 'auto' }, RC.store.get('rc.set', {}));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  let play = RC.store.get('rc.play', { date: today(), sec: 0, bonus: 0 });
  if (play.date !== today()) play = { date: today(), sec: 0, bonus: 0 };
  const saveAll = () => { RC.store.set('rc.cfg', cfg); RC.store.set('rc.prog', prog); RC.store.set('rc.set', set); RC.store.set('rc.play', play); };

  // ─── 화면 크기: 논리 높이 600 기준 ─────────────────────────
  // 화질 시작값: 보호자 설정 → 없으면 기기 성능 힌트(갤럭시탭 A 같은 보급형은 한 단계 낮게)
  const weak = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  function baseQ() { return set.quality === 'high' ? 1 : set.quality === 'save' ? 0.7 : (weak ? 0.85 : 1); }
  const view = { w: 0, h: 0, dpr: 1, s: 1, vw: 1000, q: 1 };
  view.q = baseQ();
  RC.Draw.low = set.quality === 'save';
  function resize() {
    view.w = window.innerWidth; view.h = window.innerHeight;
    // 세로로 들거나 창이 좁으면(분할 화면) 옆으로 눕혀 달라고 안내하고 달리기는 멈춘다
    const portrait = view.w < view.h * 1.2;
    document.body.classList.toggle('portrait', portrait);
    if (portrait) { if (mode === 'run' && !paused) pause(); if (!rotTold) { rotTold = true; S.say('태블릿을 옆으로 눕혀 줘!', { bubble: false }); } }
    else rotTold = false;
    view.dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (view.w * view.h))) * view.q);
    view.s = view.h / 600;
    view.vw = view.w / view.s;
    canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = view.w + 'px'; canvas.style.height = view.h + 'px';
    placeHud();
  }
  // HUD 별 아이콘 위치 → 캔버스 논리 좌표 (모은 별이 여기로 날아간다)
  function placeHud() {
    const el = document.querySelector('#hud-stars .star-ico');
    const r = el.getBoundingClientRect();
    if (r.width) RC.Draw.setHud((r.left + r.width / 2) / view.s, (r.top + r.height / 2) / view.s);
    else RC.Draw.setHud(52 / view.s, 46 / view.s);
  }
  window.addEventListener('resize', resize);

  // 별 아이콘 (게임 속 별과 같은 그림)
  const starURL = RC.Draw.starImg().toDataURL();
  for (const img of document.querySelectorAll('.star-ico')) img.src = starURL;

  // ─── 화면 전환 ────────────────────────────────────────────
  let mode = 'title';
  let parentOpen = false;
  let paused = false, rotTold = false;
  const SCREENS = ['scr-title', 'scr-garage', 'scr-map', 'hud', 'scr-result', 'scr-book', 'scr-sleep'];
  function show(id) { for (const s of SCREENS) $(s).classList.toggle('on', s === id); document.body.dataset.scr = id; }
  // 화면 넘김: 띠가 화면을 덮은 순간에 바꾸고 다시 걷는다 (연달아 눌러도 한 번만)
  const wipeEl = $('wipe');
  let wiping = false;
  function wipe(fn) {
    if (wiping) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { fn(); return; }
    wiping = true; S.play('whoosh');
    wipeEl.className = 'cover';
    setTimeout(() => {
      fn();
      wipeEl.className = 'open';
      setTimeout(() => { wipeEl.className = ''; wiping = false; }, 600);
    }, 400);
  }

  function toTitle() {
    mode = 'title'; show('scr-title'); S.music(true);
    $('title-count').textContent = prog.stickers.length + '/' + D.STICKERS.length;
  }
  function toGarage() {
    if (checkSleep()) return;
    mode = 'garage'; show('scr-garage'); renderParts();
    S.say('로봇카를 만들어 보자!');
  }
  function toBook() { mode = 'book'; renderBook(); show('scr-book'); S.say('카드 도감!', { bubble: false }); }

  // ─── 코스 ────────────────────────────────────────────────
  // 도시를 끝까지 달린 판 수가 unlock 이상이면 열린다 (기록 전 예전 판은 판 수로 대신 셈)
  const unlocked = c => c.unlock === 0 || prog.log.finished >= c.unlock || prog.runs > c.unlock + 1;
  const openCourses = () => D.COURSES.filter(unlocked);
  function toMap() {
    if (checkSleep()) return;
    // 코스가 하나뿐이면 고르지 않고 바로 출발 (처음 하는 아이가 헷갈리지 않게)
    if (openCourses().length < 2) { startRun('city'); return; }
    mode = 'map'; show('scr-map'); renderMap();
    S.say('어디로 갈까?', { bubble: false });
  }
  const LOCK_SVG = '<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';
  function renderMap() {
    const box = $('courses'); box.innerHTML = '';
    for (const c of D.COURSES) {
      const open = unlocked(c);
      const b = document.createElement('button');
      b.className = 'course' + (open ? '' : ' locked') + (open && c.id === (prog.course || 'city') ? ' last' : '') + (open && c.unlock && !(prog.seen || []).includes(c.id) ? ' new' : '');
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 384;
      b.appendChild(cv);
      b.insertAdjacentHTML('beforeend', '<span class="lock">' + LOCK_SVG + '</span><span class="cap"><b></b><small></small></span>');
      b.querySelector('b').textContent = c.name;
      b.querySelector('small').textContent = open ? c.desc : '도시를 ' + c.unlock + '번 끝까지 달리면 열려요';
      coursePreview(cv, c.id);
      b.addEventListener('click', () => {
        if (!open) { S.play('bump'); S.say('도시를 끝까지 달리면 열려!'); return; }
        S.play('click'); wipe(() => startRun(c.id));
      });
      box.appendChild(b);
    }
  }
  // 코스 미리보기: 아이가 만든 로봇카가 그 코스를 달리는 한 장면
  function coursePreview(cv, id) {
    const g = cv.getContext('2d');
    const Rp = RC.Run.createRun(Object.assign({}, cfg), 21, id);
    Rp.car.x = Rp.level.length * (id === 'site' ? 0.2 : 0.46);
    Rp.level.pits = Rp.level.pits.filter(p => Math.abs(p.x - Rp.car.x) > 300);
    g.setTransform(cv.height / 600, 0, 0, cv.height / 600, 0, 0);
    RC.Draw.drawRun(g, Rp, cv.width / (cv.height / 600));
  }

  // ─── 차고 ────────────────────────────────────────────────
  const LISTS = { body: D.BODIES, wheel: D.WHEELS, gear: D.GEAR };
  let garageForm = 'car', garageMorph = 0, garageBounce = 0, garagePop = 0;
  // CSS 애니메이션을 처음부터 다시 틀기
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  let lastStats = null;

  function thumb(cv, over) {
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.translate(75, 84); c.scale(0.72, 0.72); c.translate(-75, -84);
    RC.Draw.drawCar(c, Object.assign({}, cfg, over), 75, 84, { t: 0.5 });
  }

  function buildGarage() {
    for (const el of document.querySelectorAll('.parts')) {
      const slot = el.dataset.slot;
      el.innerHTML = '';
      for (const p of LISTS[slot]) {
        const b = document.createElement('button');
        b.className = 'part'; b.dataset.id = p.id;
        const cv = document.createElement('canvas'); cv.width = 300; cv.height = 192;
        b.appendChild(cv);
        const lb = document.createElement('span'); lb.textContent = p.name; b.appendChild(lb);
        b.addEventListener('click', () => {
          const changed = cfg[slot] !== p.id;
          cfg[slot] = p.id;
          if (slot === 'body' && !cfg.colorTouched) cfg.color = p.color;
          garageBounce = 1; S.play(changed ? 'swap' : 'click'); S.say(p.say);
          if (changed) { garagePop = 1; restart(b, 'pop'); if (slot === 'body') restart($('car-name').parentNode, 'pop'); vibrate(12); }
          saveAll(); renderParts();
        });
        el.appendChild(b);
      }
    }
    const cs = $('colors'); cs.innerHTML = '';
    for (const c of D.COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.setProperty('--c', c); b.style.setProperty('--c2', RC.Art.shade(c, 0.5)); b.dataset.c = c; b.setAttribute('aria-label', '색깔');
      b.addEventListener('click', () => {
        const changed = cfg.color !== c;
        cfg.color = c; cfg.colorTouched = true; garageBounce = 1; S.play(changed ? 'swap' : 'click');
        if (changed) { garagePop = 0.8; restart(b, 'pop'); }
        saveAll(); renderParts();
      });
      cs.appendChild(b);
    }
    for (const bar of document.querySelectorAll('.bar')) bar.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
  }

  // 능력치 (1~5칸): 아이가 부품을 바꾸면 막대가 바로 바뀐다
  function stats() {
    const body = { racer: [5, 3, 3], fire: [3, 3, 5], police: [4, 3, 4] }[cfg.body];
    const jump = { normal: 3, monster: 4, spring: 5 }[cfg.wheel];
    const air = { jet: 5, wing: 4, drill: 1 }[cfg.gear];
    const speed = Math.max(1, body[0] - (cfg.wheel === 'monster' ? 1 : 0));
    const power = Math.min(5, body[2] + (cfg.gear === 'drill' ? 1 : 0));
    return { speed, jump, air, power };
  }
  function renderParts() {
    for (const el of document.querySelectorAll('.parts')) {
      const slot = el.dataset.slot;
      for (const b of el.children) {
        b.setAttribute('aria-pressed', String(cfg[slot] === b.dataset.id));
        thumb(b.querySelector('canvas'), { [slot]: b.dataset.id });
      }
    }
    for (const b of $('colors').children) b.setAttribute('aria-pressed', String(cfg.color === b.dataset.c));
    const st = stats();
    for (const bar of document.querySelectorAll('.bar')) {
      const key = bar.dataset.k, v = st[key], was = lastStats ? lastStats[key] : v;
      [...bar.children].forEach((i, k) => {
        i.classList.toggle('on', k < v);
        if (k < v && k >= was) restart(i, 'gain');
        else if (k >= v && k < was) restart(i, 'lose');
      });
      const lab = bar.parentNode;
      lab.classList.toggle('up', v > was); lab.classList.toggle('down', v < was);
      if (v !== was) setTimeout(() => lab.classList.remove('up', 'down'), 60);
    }
    lastStats = st;
    const body = RC.find(D.BODIES, cfg.body);
    $('car-name').textContent = body.name;
    $('car-parts').textContent = RC.find(D.WHEELS, cfg.wheel).name + ' · ' + RC.find(D.GEAR, cfg.gear).name;
    $('ability').textContent = '변신 능력: ' + body.abilityName;
  }

  // ─── 달리기 ──────────────────────────────────────────────
  let R = null, demo = null, tap = false, holding = false, wantTransform = false, readyTold = false, finishT = 0;
  let endAfterRun = false;
  let lastSay = 0;
  const sayOnce = (txt, gap) => { const n = performance.now(); if (n - lastSay > (gap || 1500)) { lastSay = n; S.say(txt, { ms: 1400 }); } };

  let countdown = 0, countStep = 0;
  const countEl = $('count'), countNum = $('count-num'), lights = [...countEl.querySelectorAll('i')];
  let openBefore = 1;
  function startRun(courseId) {
    if (checkSleep()) return;
    S.unlock();
    const course = RC.find(D.COURSES, typeof courseId === 'string' ? courseId : (prog.course || 'city'));
    prog.course = course.id;
    prog.seen = Array.from(new Set((prog.seen || []).concat(course.id)));
    openBefore = openCourses().length;
    prog.runs += 1;
    logRun(); saveAll();
    R = RC.Run.createRun(cfg, 1 + (prog.runs % 3), course.id);
    mode = 'run'; finishT = 0; readyTold = false; paused = false;
    tutor = { on: prog.runs <= 2, taps: 0, holds: 0, shown: '', seen: new Set() };
    wakeLock(true);
    $('ability-name').textContent = R.body.abilityName;
    show('hud');
    placeHud();
    S.music(false);
    // 출발 신호: 빨강 세 번 → 초록 "출발!" (그동안 차는 제자리에서 부릉)
    countdown = 3.4; countStep = 4;
    countEl.className = 'on'; countNum.className = ''; countNum.textContent = '';
    for (const l of lights) l.className = '';
    S.say('준비!', { ms: 1200 });
  }
  function tickCountdown(dt) {
    countdown -= dt;
    const step = Math.ceil(countdown - 0.4);           // 3, 2, 1, 0
    if (step < countStep && step >= 0) {
      countStep = step;
      if (step > 0) {
        lights[3 - step].className = 'red';
        countNum.textContent = step; restart(countNum, 'tick'); countNum.classList.remove('go');
        S.play('beep'); vibrate(10);
      } else {
        for (const l of lights) l.className = 'green';
        countNum.textContent = '출발!'; countNum.className = ''; restart(countNum, 'go');
        S.play('go'); S.music(true); vibrate(30);
        RC.Draw.fxEvent(R, 'go', view.vw);
        S.say(tutor.on ? '화면을 누르면 점프!' : R.course.id === 'site' ? '공사장 출발! 고깔을 쓰러뜨려 봐!' : '출발!', { ms: 1800 });
        setTimeout(() => { if (countdown <= 0) countEl.classList.add('out'); }, 500);
        setTimeout(() => { if (countdown <= 0) countEl.className = ''; }, 950);
      }
    }
  }

  // ─── 처음 두 판: 손가락 안내 ──────────────────────────────
  let tutor = { on: false };
  const hintEl = $('hint'), hintTxt = hintEl.querySelector('b');
  function setHint(kind, x, y, txt) {
    if (kind !== tutor.shown) {
      tutor.shown = kind;
      hintEl.className = kind ? 'on' + (kind === 'hold' ? ' hold' : '') : '';
      if (kind) hintTxt.textContent = txt;
    }
    if (kind) { hintEl.style.left = Math.round(x * view.s - 30) + 'px'; hintEl.style.top = Math.round(y * view.s) + 'px'; }
  }
  function tutorial() {
    if (!tutor.on || R.done || countdown > 0) { if (tutor.shown) setHint(''); btnT.classList.remove('hint'); return; }
    const c = R.car, cam = R._cam ? R._cam.x : c.x - view.vw * 0.28;
    // 앞에 구덩이·방호벽·상자가 있으면 "톡! 점프" (몇 번 보여 주면 그만)
    let target = null;
    if (c.onGround && c.form === 'car' && tutor.taps < 6) {
      for (const p of R.level.pits) { const d = p.x - c.x; if (d > 60 && d < 330) { target = { x: p.x + p.w / 2, id: 'p' + p.x }; break; } }
      if (!target) for (const o of R.level.items) {
        // 방호벽·관은 저절로 넘으므로 안내하지 않는다
        if ((o.type === 'box' && !o.broken && R.cfg.gear !== 'drill') || (o.type === 'mud' && !o.out)) { const d = o.x - c.x; if (d > 60 && d < 330) { target = { x: o.x + 40, id: 'o' + o.x }; break; } }
      }
    }
    if (target) {
      if (!tutor.seen.has(target.id)) { tutor.seen.add(target.id); tutor.taps++; }
      setHint('tap', target.x - cam, 170, '톡! 점프');
    } else if (!c.onGround && (R.cfg.gear === 'jet' || R.cfg.gear === 'wing') && !holding && c.vy > -200 && tutor.holds < 3 && c.form === 'car') {
      if (tutor.shown !== 'hold') tutor.holds++;
      setHint('hold', c.x - cam + 40, 150, '꾹 누르고 있어!');
    } else setHint('');
    btnT.classList.toggle('hint', c.form === 'car' && c.cd <= 0 && R.t > 4);
  }

  const btnT = $('btn-transform');
  let hudShown = { stars: -1, k: -1 };
  function updateHud() {
    const c = R.car;
    if (hudShown.stars !== R.stars) { $('hud-stars').querySelector('b').textContent = R.stars; hudShown.stars = R.stars; }
    const k = Math.min(1, c.x / R.level.length);
    const kq = Math.round(k * 400) / 400;
    if (kq !== hudShown.p) {
      hudShown.p = kq;
      $('hud-fill').style.width = 'calc((100% - 76px) * ' + kq + ')';
      $('hud-car').style.left = 'calc(34px + (100% - 76px) * ' + kq + ')';
      $('hud-track').classList.toggle('night', kq > 0.7);
    }
    const ready = c.form === 'car' && c.cd <= 0 && !R.done;
    const ring = c.form === 'robot' ? Math.max(0, c.robotT / D.RUN.robotTime) : 1 - c.cd / D.RUN.transformCd;
    const q = Math.round(ring * 40) / 40;
    if (q !== hudShown.k) { btnT.style.setProperty('--k', q); hudShown.k = q; }
    btnT.classList.toggle('ready', ready);
    btnT.classList.toggle('robot', c.form === 'robot');
    if (ready && !readyTold && R.t > 4) { readyTold = true; S.say('변신 버튼을 눌러 봐!'); }
  }

  function handleEvents(Rx, quiet) {
    for (const ev of Rx.events) {
      RC.Draw.fxEvent(Rx, ev, view.vw);
      S.play(ev);
      if (quiet) continue;
      if (ev === 'smash') vibrate(35); else if (ev === 'transform') vibrate([20, 40, 60]); else if (ev === 'bump') vibrate(20); else if (ev === 'finish') vibrate([40, 60, 40, 60, 120]);
      if (ev === 'star') { const h = $('hud-stars'); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); }
      else if (ev === 'transform') { lastSay = performance.now(); S.say(Rx.body.robot + ' 변신!', { ms: 1600 }); prog.log.transforms++; }
      else if (ev === 'smash') sayOnce('와장창!');
      else if (ev === 'fall') sayOnce('으악!');
      else if (ev === 'pop') sayOnce('뿅!');
      else if (ev === 'slip') sayOnce('미끌!');
      else if (ev === 'cone') sayOnce('와르르!', 2500);
      else if (ev === 'splash') sayOnce('철퍼덕!');
      else if (ev === 'hot') sayOnce('앗 뜨거!');
      else if (ev === 'monkey') sayOnce('장난꾸러기 원숭이 로봇이다!', 3000);
      else if (ev === 'finish') { lastSay = performance.now(); S.say('도착! 잘했어!'); prog.log.finished++; saveAll(); }
    }
    Rx.events.length = 0;
  }

  // 시작 화면 뒤에서 혼자 달리는 시연 (노을 무렵부터 시작해 멋있게)
  function demoInput(Rx) {
    const c = Rx.car;
    const ahead = Rx.level.pits.some(p => p.x - c.x > 0 && p.x - c.x < 80) || Rx.level.items.some(o => (o.type === 'rock' || o.type === 'fire') && !o.out && o.x - c.x > 0 && o.x - c.x < 80);
    return { tap: ahead, hold: !c.onGround && c.vy > 0, transform: c.cd <= 0 && (Rx.t % 6) < 0.02 };
  }
  let demoN = 0;
  function newDemo() {
    const bodies = ['racer', 'police', 'fire'];
    // 한 번이라도 달려 봤으면 시작 화면에 아이가 만든 로봇카가 먼저 나온다
    const mine = prog.runs > 0 && demoN % 2 === 0;
    const open = openCourses();
    const d = RC.Run.createRun(mine ? Object.assign({}, cfg) : { body: bodies[demoN % 3], wheel: ['normal', 'monster', 'spring'][demoN % 3], gear: ['jet', 'wing', 'drill'][demoN % 3], color: null }, 11 + demoN, open[Math.floor(demoN / 2) % open.length].id);
    d.car.x = d.level.length * (demoN % 2 ? 0.08 : 0.44);
    d.camFrac = 0.13;   // 시작 화면: 로봇카를 왼쪽에 두어 로고와 겹치지 않게
    d.level.pits = d.level.pits.filter(p => Math.abs(p.x - d.car.x) > 400);
    demoN++;
    return d;
  }

  // ─── 결과·카드 ───────────────────────────────────────────
  function showResult() {
    mode = 'result';
    show('scr-result');
    const got = R.stars;
    const pct = got / Math.max(1, R.totalStars);
    const rating = pct >= 0.7 ? 3 : pct >= 0.4 ? 2 : 1;
    const rt = $('res-rating'); rt.innerHTML = '';
    for (let i = 0; i < 3; i++) { const im = document.createElement('img'); im.src = starURL; im.alt = ''; rt.appendChild(im); setTimeout(() => { if (i < rating && mode === 'result') { im.classList.add('on'); S.play('star'); vibrate(15); } }, 800 + i * 280); }
    setTimeout(() => { if (mode === 'result') S.play('slam'); }, 380);
    $('res-stars').textContent = '0';
    $('new-cards').innerHTML = '';
    $('res-note').textContent = '';
    let shown = 0, bank = prog.bank;
    const earned = [];
    const step = Math.max(1, Math.ceil(got / 45));
    const setJar = () => { $('jar-fill').style.height = 'calc(' + (bank / D.JAR * 100) + '% - 8px)'; $('jar-text').textContent = bank + ' / ' + D.JAR; };
    setJar();
    // 다음에 받을 카드를 실루엣으로 미리 보여 준다 (무엇이 나올까?)
    const nextBox = $('next-card');
    const showNext = () => {
      const nx = D.STICKERS.find(s => !prog.stickers.includes(s.id) && !earned.includes(s.id));
      nextBox.hidden = !nx;
      if (nx) { RC.Cards.render(nextBox.querySelector('canvas'), nx, true); restart(nextBox, 'swap'); }
    };
    showNext();
    const numEl = $('res-stars');
    S.say('별을 ' + got + '개 모았어!');
    setTimeout(() => {
      const timer = setInterval(() => {
        if (mode !== 'result') { clearInterval(timer); return; }
        const n = Math.min(step, got - shown);
        shown += n; bank += n;
        numEl.textContent = shown; restart(numEl, 'bump');
        S.play('fill');
        if (bank >= D.JAR) {
          bank -= D.JAR;
          const next = D.STICKERS.find(s => !prog.stickers.includes(s.id) && !earned.includes(s.id));
          if (next) {
            earned.push(next.id);
            const box = document.createElement('div');
            box.className = 'card-reveal r' + next.rarity;
            box.innerHTML = '<span class="tag">새 카드!</span>';
            box.appendChild(RC.Cards.render(document.createElement('canvas'), next, false));
            const list = $('new-cards');
            list.appendChild(box);
            // 여러 장이면 부채처럼 겹쳐 펼친다 (최대 5장까지 보임)
            while (list.children.length > 5) list.removeChild(list.firstChild);
            const n = list.children.length;
            [...list.children].forEach((el, k) => { el.style.setProperty('--r', ((k - (n - 1) / 2) * 4) + 'deg'); el.style.zIndex = k + 1; });
            list.style.setProperty('--ov', n >= 4 ? '-26px' : n === 3 ? '-12px' : '0px');
            list.classList.toggle('fan', n > 1);
            list.dataset.label = '새 카드 ' + earned.length + '장!';
            S.play('sticker'); vibrate([20, 30, 40]);
            restart(document.querySelector('.cell'), 'full');
            showNext();
          }
        }
        setJar();
        if (shown >= got) {
          clearInterval(timer);
          prog.bank = bank;
          prog.stickers = prog.stickers.concat(earned);
          saveAll();
          const left = D.STICKERS.length - prog.stickers.length;
          $('res-note').textContent = earned.length
            ? '새 카드 ' + earned.length + '장! 카드 도감에 넣었어요.'
            : (left ? '별 ' + (D.JAR - bank) + '개만 더 모으면 새 카드!' : '카드를 다 모았어요! 챔피언!');
          if (earned.length) setTimeout(() => { if (mode === 'result') S.say('새 카드를 받았어!'); }, 700);
          // 새 코스가 열렸으면 알려 준다
          const nowOpen = openCourses();
          if (nowOpen.length > openBefore) {
            const nc = nowOpen[nowOpen.length - 1];
            const tag = document.createElement('span'); tag.className = 'new-course'; tag.textContent = '새 코스: ' + nc.name + '!';
            $('res-note').appendChild(tag);
            openBefore = nowOpen.length;
            setTimeout(() => { if (mode === 'result') { S.play('sticker'); S.say('새 코스가 열렸어! ' + nc.name + '!'); } }, earned.length ? 2600 : 900);
          }
          if (endAfterRun) setTimeout(() => { if (mode === 'result') goSleep(); }, 4500);
        }
      }, 60);
    }, 1200);
  }

  function renderBook() {
    const b = $('book'); b.innerHTML = '';
    for (const s of D.STICKERS) {
      const have = prog.stickers.includes(s.id);
      const d = document.createElement('div');
      d.className = have ? 'have r' + s.rarity : 'locked';
      d.appendChild(RC.Cards.render(document.createElement('canvas'), s, !have));
      // 누르면 크게 보기 (못 모은 카드는 목소리로 안내만)
      d.addEventListener('click', () => {
        if (!have) { S.play('bump'); S.say('별을 모으면 나와!'); return; }
        S.play('sticker'); S.say(s.name + '!');
        const z = $('card-zoom');
        z.querySelector('.zc').innerHTML = '';
        z.querySelector('.zc').appendChild(RC.Cards.render(document.createElement('canvas'), s, false));
        z.className = 'on r' + s.rarity;
      });
      b.appendChild(d);
    }
    $('book-note').textContent = prog.stickers.length + ' / ' + D.STICKERS.length + '장 모음 · 다음 카드까지 별 ' + (D.JAR - prog.bank) + '개';
  }

  // ─── 하루 타이머 (배터리) ────────────────────────────────
  function battery() {
    if (!set.limit) return 1;
    return Math.max(0, 1 - play.sec / ((set.limit + (play.bonus || 0)) * 60));
  }
  let batShown = '';
  function renderBattery() {
    const el = $('battery');
    const b = battery();
    const left = Math.ceil(((set.limit + (play.bonus || 0)) * 60 - play.sec) / 60);
    const key = set.limit + ':' + Math.round(b * 100) + ':' + left;
    if (key === batShown) return;
    batShown = key;
    el.classList.toggle('off', !set.limit);
    el.style.setProperty('--b', b);
    el.classList.toggle('mid', b < 0.5 && b >= 0.2);
    el.classList.toggle('low', b < 0.2);
    el.querySelector('span').textContent = set.limit ? Math.max(0, left) + '분' : '';
  }
  let warned = false;
  function tickTimer(dt) {
    if (play.date !== today()) { play = { date: today(), sec: 0, bonus: 0 }; warned = false; if (mode === 'sleep') toTitle(); }
    if (mode === 'sleep' || parentOpen || document.hidden) return;
    play.sec += dt;
    if (Math.floor(play.sec) % 5 === 0) RC.store.set('rc.play', play);
    if (set.limit && !warned && battery() < 2 / (set.limit + (play.bonus || 0)) && battery() > 0) { warned = true; S.say('배터리가 조금 남았어요!'); }
    if (set.limit && battery() <= 0) {
      if (mode === 'run' && R && !R.done) endAfterRun = true;       // 달리던 판은 끝까지
      else if (mode !== 'result') goSleep();
      else endAfterRun = true;
    }
  }
  function checkSleep() { if (set.limit && battery() <= 0) { goSleep(); return true; } return false; }
  function goSleep() {
    if (mode !== 'sleep') { prog.log.sleeps++; saveAll(); }
    mode = 'sleep'; show('scr-sleep'); S.music(false); wakeLock(false);
    S.say('오늘은 여기까지! 내일 또 만나!', { ms: 4000, bubble: false });
    endAfterRun = false;
  }

  // ─── 보호자 문 (자물쇠 3초 누르기) ──────────────────────────
  const lock = $('btn-lock');
  let lockTimer = 0;
  const lockStart = e => { e.preventDefault(); lock.classList.add('holding'); lockTimer = setTimeout(openParent, 3000); };
  const lockEnd = () => { lock.classList.remove('holding'); clearTimeout(lockTimer); };
  lock.addEventListener('pointerdown', lockStart);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) lock.addEventListener(ev, lockEnd);

  function openParent() {
    lockEnd();
    parentOpen = true;
    $('scr-parent').classList.add('on');
    renderParent();
  }
  function renderParent() {
    $('p-played').textContent = Math.floor(play.sec / 60) + '분' + (play.bonus ? ' (오늘 +' + play.bonus + '분 추가)' : '');
    for (const b of $('p-limit').children) b.setAttribute('aria-pressed', String(Number(b.dataset.min) === set.limit));
    $('p-voice').dataset.on = set.voice ? '1' : '0';
    $('p-sound').dataset.on = set.sound ? '1' : '0';
    $('p-vib').dataset.on = set.vib ? '1' : '0';
    for (const b of $('p-quality').children) b.setAttribute('aria-pressed', String(b.dataset.q === set.quality));
    $('p-q-now').textContent = '지금 해상도 ' + Math.round(view.q * 100) + '%';
    renderLog(); renderDev();
  }
  for (const b of $('p-tabs').children) b.addEventListener('click', () => {
    for (const x of $('p-tabs').children) x.setAttribute('aria-pressed', String(x === b));
    for (const t of document.querySelectorAll('.ptab')) t.hidden = t.dataset.tab !== b.dataset.tab;
    renderLog(); renderDev();
  });
  function dl(el, rows) {
    el.innerHTML = '';
    for (const [k, v, cls] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v; if (cls) dd.className = cls;
      el.append(dt, dd);
    }
  }
  function favorite(slot) {
    const L = prog.log.parts, list = slot === 'color' ? D.COLORS.map(c => ({ id: c, name: null })) : LISTS[slot];
    let best = null, n = 0, total = 0;
    for (const p of list) { const c = L[slot + ':' + p.id] || 0; total += c; if (c > n) { n = c; best = p; } }
    if (!best) return '아직 없음';
    const name = best.name || colorName(best.id);
    return name + ' (' + Math.round(n / total * 100) + '%)';
  }
  function colorName(c) { return ({ '#ff3b3b': '빨강', '#ff9f1a': '주황', '#ffd21a': '노랑', '#22c55e': '초록', '#2f6bff': '파랑', '#a855f7': '보라' })[c.toLowerCase()] || c; }
  function renderLog() {
    const L = prog.log, days = Object.keys(L.days).sort();
    const recent = days.slice(-7).map(d => d.slice(5).replace('-', '/') + ' ' + L.days[d] + '판').join(' · ');
    dl($('p-log'), [
      ['처음 한 날', L.first || '아직 없음'],
      ['모두 달린 판', prog.runs + '판 (끝까지 ' + L.finished + '판)'],
      ['최근 7일', recent || '아직 없음'],
      ['제일 좋아하는 차체', favorite('body')],
      ['바퀴', favorite('wheel')],
      ['장비', favorite('gear')],
      ['색깔', favorite('color')],
      ['변신 버튼', L.transforms + '번 (한 판에 ' + (prog.runs ? (L.transforms / prog.runs).toFixed(1) : 0) + '번)'],
      ['모은 카드', prog.stickers.length + ' / ' + D.STICKERS.length + '장'],
      ['잠자기 화면', L.sleeps + '번, 그 뒤 자물쇠로 시간 더 준 날 ' + L.sleepRetry + '번'],
    ]);
  }
  // 실제 태블릿에서 되는지 한눈에: 초록 = 됨, 노랑 = 조건부, 빨강 = 안 됨
  let fpsAvg = 60;
  function renderDev() {
    const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
    const sw = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    const voiceOk = S.hasVoice();
    dl($('p-dev'), [
      ['화면', view.w + ' × ' + view.h + ' (배율 ' + (window.devicePixelRatio || 1) + ')', view.w >= view.h * 1.2 ? 'ok' : 'no'],
      ['속도', Math.round(fpsAvg) + ' fps · 해상도 ' + Math.round(view.q * 100) + '%', fpsAvg >= 50 ? 'ok' : fpsAvg >= 35 ? 'mid' : 'no'],
      ['한국어 목소리', voiceOk ? '있음' : '없음 (자막만 나옴. 태블릿 설정에서 "텍스트 음성 변환"을 찾아 한국어 음성 설치)', voiceOk ? 'ok' : 'no'],
      ['진동', navigator.vibrate ? '지원' : '지원 안 함', navigator.vibrate ? 'ok' : 'mid'],
      ['전체 화면', canFs ? (document.fullscreenElement ? '지금 전체 화면' : '가능') : '지원 안 함', canFs ? 'ok' : 'mid'],
      ['화면 켜짐 유지', navigator.wakeLock ? '지원' : '지원 안 함', navigator.wakeLock ? 'ok' : 'mid'],
      ['앱으로 설치', standalone ? '설치해서 여는 중' : '브라우저로 여는 중 (크롬 메뉴 → 홈 화면에 추가)', standalone ? 'ok' : 'mid'],
      ['인터넷 없이', sw ? '준비됨' : /^https?:/.test(location.protocol) ? '한 번 더 열면 준비됨' : '웹 주소로 열어야 가능', sw ? 'ok' : 'mid'],
      ['손가락 동시 인식', (navigator.maxTouchPoints || 0) + '개', navigator.maxTouchPoints >= 2 ? 'ok' : 'mid'],
    ]);
  }
  $('p-try-voice').addEventListener('click', () => { S.unlock(); const v = set.voice; S.setVoice(true); S.say('안녕! 나는 로봇카야!'); S.setVoice(v); });
  $('p-try-vib').addEventListener('click', () => { try { navigator.vibrate && navigator.vibrate([60, 60, 120]); } catch (e) { /* 무시 */ } });
  $('p-vib').addEventListener('click', () => { set.vib = !set.vib; saveAll(); renderParent(); vibrate(40); });
  for (const b of $('p-quality').children) b.addEventListener('click', () => {
    set.quality = b.dataset.q; view.q = baseQ(); RC.Draw.low = set.quality === 'save'; saveAll(); resize(); renderParent();
  });
  for (const b of $('p-limit').children) b.addEventListener('click', () => { set.limit = Number(b.dataset.min); saveAll(); renderParent(); });
  $('p-voice').addEventListener('click', () => { set.voice = !set.voice; S.setVoice(set.voice); saveAll(); renderParent(); });
  $('p-sound').addEventListener('click', () => { set.sound = !set.sound; S.setSound(set.sound); saveAll(); renderParent(); });
  $('p-extend').addEventListener('click', () => { if (mode === 'sleep') prog.log.sleepRetry++; play.bonus = (play.bonus || 0) + 10; saveAll(); renderParent(); });
  $('p-close').addEventListener('click', () => {
    parentOpen = false;
    $('scr-parent').classList.remove('on');
    if (mode === 'sleep' && battery() > 0) toTitle();
  });

  // ─── 입력 ────────────────────────────────────────────────
  // 여러 손가락을 따로 기억한다: 한 손가락을 떼도 다른 손가락이 누르고 있으면 계속 "꾹"
  // 손바닥(닿은 면이 큰 터치)은 무시한다. 태블릿을 쥔 손이 화면 가장자리에 닿아도 점프하지 않게
  const downs = new Set();
  const isPalm = e => e.pointerType === 'touch' && Math.max(e.width || 0, e.height || 0) > 70;
  canvas.addEventListener('pointerdown', e => {
    S.unlock();
    if (isPalm(e)) return;
    if (mode === 'run' && !paused) { downs.add(e.pointerId); tap = true; holding = true; }
    else if (mode === 'garage') { garageBounce = 1; S.play('honk'); vibrate(15); }
  });
  const release = e => { downs.delete(e.pointerId); holding = downs.size > 0; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);
  btnT.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (paused) return; wantTransform = true; btnT.classList.add('pressed'); });
  btnT.addEventListener('pointerup', () => btnT.classList.remove('pressed'));
  btnT.addEventListener('pointerleave', () => btnT.classList.remove('pressed'));
  window.addEventListener('pointerdown', () => S.unlock(), { passive: true });
  window.addEventListener('keydown', e => {
    if (mode !== 'run') return;
    if (e.code === 'Space' && !e.repeat) { tap = true; holding = true; }
    if (e.code === 'KeyX') wantTransform = true;
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') holding = false; });

  $('btn-go-garage').addEventListener('click', () => {
    S.unlock(); S.play('click');
    // 처음 한 번은 전체 화면으로 (주소창이 사라져 화면이 넓어진다)
    if (!fsAsked) { fsAsked = true; goFullscreen(); }
    wipe(toGarage);
  });
  $('btn-book').addEventListener('click', () => { S.unlock(); S.play('click'); wipe(toBook); });
  $('card-zoom').addEventListener('click', () => { $('card-zoom').className = ''; S.play('click'); });
  $('btn-book-back').addEventListener('click', () => { S.play('click'); wipe(toTitle); });
  $('btn-run').addEventListener('click', () => { S.play('click'); wipe(toMap); });
  $('btn-again').addEventListener('click', () => { S.play('click'); wipe(() => startRun(prog.course)); });
  $('btn-map-back').addEventListener('click', () => { S.play('click'); wipe(toGarage); });
  $('btn-garage').addEventListener('click', () => { S.play('click'); wipe(toGarage); });
  $('btn-morph').addEventListener('click', () => {
    garageForm = garageForm === 'car' ? 'robot' : 'car'; garageMorph = RC.Car.MORPH;
    S.play(garageForm === 'robot' ? 'transform' : 'untransform');
    S.say(garageForm === 'robot' ? RC.find(D.BODIES, cfg.body).robot + ' 변신!' : '다시 자동차!');
    $('btn-morph').querySelector('em').textContent = garageForm === 'robot' ? '자동차로' : '변신 보기';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { downs.clear(); holding = false; saveAll(); if (mode === 'run') pause(); }
    else if (mode === 'run') wakeLock(true);
  });

  // ─── 멈춤 · 뒤로 가기 보호 ────────────────────────────────
  function pause() {
    if (mode !== 'run' || !R || R.done) return;
    paused = true; downs.clear(); holding = false;
    $('scr-pause').classList.add('on');
    S.music(false);
  }
  function resume() {
    paused = false;
    $('scr-pause').classList.remove('on');
    S.music(true);
  }
  $('btn-resume').addEventListener('click', () => { S.unlock(); S.play('click'); resume(); });
  $('btn-quit').addEventListener('click', () => { S.play('click'); wipe(() => { resume(); countdown = 0; countEl.className = ''; toGarage(); }); });
  // 안드로이드 뒤로 가기(제스처)로 실수로 나가지 않게: 한 칸 쌓아 두고, 눌리면 멈춤 화면을 보여 준다
  try { history.pushState({ rc: 1 }, ''); } catch (e) { /* 무시 */ }
  window.addEventListener('popstate', () => {
    try { history.pushState({ rc: 1 }, ''); } catch (e) { /* 무시 */ }
    if (mode === 'run') pause();
    else if (mode === 'map') wipe(toGarage);
    else if (mode === 'garage' || mode === 'book') toTitle();
  });

  // ─── 태블릿 기능: 진동 · 화면 켜짐 유지 · 전체 화면 ─────────────
  function vibrate(ms) { try { if (set.vib && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 무시 */ } }
  let lockObj = null;
  function wakeLock(on) {
    try {
      if (on && !lockObj && navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lockObj = l; l.addEventListener('release', () => { lockObj = null; }); }).catch(() => {});
      else if (!on && lockObj) { lockObj.release().catch(() => {}); lockObj = null; }
    } catch (e) { /* 무시 */ }
  }
  const fsBtn = $('btn-fs');
  const root = document.documentElement;
  const canFs = !!(document.fullscreenEnabled && root.requestFullscreen);
  if (!canFs) fsBtn.hidden = true;
  function goFullscreen() {
    if (!canFs || document.fullscreenElement) return;
    root.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      // 전체 화면이 되면 가로로 고정 (지원하는 기기만)
      try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* 무시 */ }
    }).catch(() => {});
  }
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFullscreen();
  });
  let fsAsked = false;

  // ─── 루프 ────────────────────────────────────────────────
  let lastTs = 0, gt = 0;
  // 자동 화질: 2초 동안 평균 45fps 아래면 해상도를 한 단계 낮추고 장식을 줄인다
  let perfAcc = 0, perfN = 0;
  function autoQuality(raw) {
    if (mode !== 'run' || paused || document.hidden || raw > 0.2 || set.quality !== 'auto' || RC.debug.noAuto) return;
    perfAcc += raw; perfN++;
    if (perfN < 120) return;
    const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
    if (avg > 1 / 45 && view.q > 0.6) { view.q = Math.max(0.6, view.q * 0.85); RC.Draw.low = view.q < 0.9; resize(); }
  }

  // 120Hz 화면(갤럭시탭 S 시리즈)에서도 60번만 그린다: 배터리·발열 절약
  // 화면 주사율을 재서 120Hz 이상일 때만 한 번 걸러 그린다 (고르게 60번).
  // 90Hz(갤럭시탭 A 일부)는 걸러 그리면 11ms·22ms가 섞여 덜컹거리므로 매번 그린다
  let rafLast = 0, rafMs = 16.7, skipOdd = false;
  function frame(ts) {
    if (rafLast) { const d = ts - rafLast; if (d > 4 && d < 40) rafMs += (d - rafMs) * 0.05; }
    rafLast = ts;
    if (rafMs < 9.5) { skipOdd = !skipOdd; if (skipOdd) { requestAnimationFrame(frame); return; } }
    const raw = (ts - lastTs) / 1000 || 0;
    const dt = Math.min(0.05, raw);
    lastTs = ts;
    if (raw > 0 && raw < 0.2) fpsAvg += (1 / raw - fpsAvg) * 0.02;
    gt += dt;
    autoQuality(raw);
    tickTimer(dt);
    renderBattery();
    ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, 0, 0);
    const vw = view.vw;

    if ((mode === 'run' || mode === 'toResult') && R) {
      if (!parentOpen && !paused && mode === 'run') {
        if (countdown > 0) {
          tap = false; wantTransform = false;
          tickCountdown(dt);
        } else {
          const input = { tap, hold: holding, transform: wantTransform };
          tap = false; wantTransform = false;
          RC.Run.stepRun(R, input, dt);
          handleEvents(R, false);
        }
        updateHud();
        tutorial();
        if (R.done) { finishT += dt; if (finishT > 1.8 && mode === 'run') { mode = 'toResult'; wipe(showResult); } }
      }
      RC.Draw.drawRun(ctx, R, vw);
    } else if (mode === 'garage' || mode === 'sleep') {
      garageMorph = Math.max(0, garageMorph - dt * 0.5);
      garageBounce = Math.max(0, garageBounce - dt * 3);
      garagePop = Math.max(0, garagePop - dt * 1.6);
      const robotShown = garageForm === 'robot' ? garageMorph < RC.Car.MORPH / 2 : garageMorph > RC.Car.MORPH / 2;
      const sleep = mode === 'sleep';
      RC.Draw.drawShowroom(ctx, cfg, vw, gt, {
        form: sleep ? 'car' : garageForm, morph: sleep ? 0 : garageMorph, bounce: garageBounce,
        ty: sleep ? 400 : 322, scale: sleep ? 1.7 : (robotShown ? 1.15 : 1.7), night: sleep, pop: garagePop,
      });
    } else {
      // 시작·결과·도감 뒤: 시연 달리기
      if (!demo || (demo.done && demo.doneT > 2) || demo.t > 26) demo = newDemo();
      RC.Run.stepRun(demo, demoInput(demo), dt);
      handleEvents(demo, true);
      RC.Draw.drawRun(ctx, demo, vw);
      if (mode === 'result' || mode === 'book' || mode === 'map') { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(3,5,12,0.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    }
    requestAnimationFrame(frame);
  }

  // ─── 시작 ────────────────────────────────────────────────
  S.setVoice(set.voice); S.setSound(set.sound);
  // 오프라인 실행 (홈 화면에 추가했을 때). 미리보기 창 안에서는 조용히 건너뛴다
  try {
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && window.top === window) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      // 이미 받은 글꼴을 저장해 달라고 알린다 (첫 방문에도 오프라인 글꼴이 준비되게)
      Promise.all([navigator.serviceWorker.ready, document.fonts ? document.fonts.ready : null]).then(([reg]) => {
        const urls = performance.getEntriesByType('resource').map(r => r.name).filter(u => /fonts\.(googleapis|gstatic)\.com/.test(u));
        if (urls.length && reg.active) reg.active.postMessage({ type: 'cache-fonts', urls });
      }).catch(() => {});
    }
  } catch (e) { /* 무시 */ }
  resize();
  buildGarage();
  toTitle();
  S.say('뚝딱 로봇카! 시작을 눌러 봐!', { ms: 3500 });
  requestAnimationFrame(ts => { lastTs = ts; frame(ts); });
  // 로딩 화면: 글꼴이 오면(늦어도 2.5초) 걷고 시작 화면 등장 연출을 튼다
  let started = false;
  function reveal() {
    if (started) return; started = true;
    renderParts();
    $('splash').classList.add('done');
    document.body.classList.add('ready');
    if (mode === 'title') toTitle();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reveal);
  setTimeout(reveal, 2500);

  // 개발·스크린샷용 손잡이
  RC.debug = {
    get mode() { return mode; }, get run() { return R; }, cfg, prog, set, play,
    toGarage, toBook, startRun, showResult, goSleep, openParent, toTitle, pause, resume, get view() { return view; },
    setGarageForm(f) { garageForm = f; }, toMap,
  };
})(RC);
