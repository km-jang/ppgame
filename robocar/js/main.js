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
  const SCREENS = ['scr-title', 'scr-garage', 'hud', 'scr-result', 'scr-book', 'scr-sleep'];
  function show(id) { for (const s of SCREENS) $(s).classList.toggle('on', s === id); }

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

  // ─── 차고 ────────────────────────────────────────────────
  const LISTS = { body: D.BODIES, wheel: D.WHEELS, gear: D.GEAR };
  let garageForm = 'car', garageMorph = 0, garageBounce = 0;

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
          cfg[slot] = p.id;
          if (slot === 'body' && !cfg.colorTouched) cfg.color = p.color;
          garageBounce = 1; S.play('click'); S.say(p.say);
          saveAll(); renderParts();
        });
        el.appendChild(b);
      }
    }
    const cs = $('colors'); cs.innerHTML = '';
    for (const c of D.COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.setProperty('--c', c); b.style.setProperty('--c2', RC.Art.shade(c, 0.5)); b.dataset.c = c; b.setAttribute('aria-label', '색깔');
      b.addEventListener('click', () => { cfg.color = c; cfg.colorTouched = true; garageBounce = 1; S.play('click'); saveAll(); renderParts(); });
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
    for (const bar of document.querySelectorAll('.bar')) [...bar.children].forEach((i, k) => i.classList.toggle('on', k < st[bar.dataset.k]));
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

  function startRun() {
    if (checkSleep()) return;
    S.unlock();
    prog.runs += 1; saveAll();
    R = RC.Run.createRun(cfg, 1 + (prog.runs % 3));
    mode = 'run'; finishT = 0; readyTold = false; paused = false;
    wakeLock(true);
    $('ability-name').textContent = R.body.abilityName;
    show('hud');
    placeHud();
    S.music(true);
    S.say('출발! 화면을 누르면 점프!');
  }

  const btnT = $('btn-transform');
  let hudShown = { stars: -1, k: -1 };
  function updateHud() {
    const c = R.car;
    if (hudShown.stars !== R.stars) { $('hud-stars').querySelector('b').textContent = R.stars; hudShown.stars = R.stars; }
    const k = Math.min(1, c.x / R.level.length);
    $('hud-fill').style.width = (k * 100) + '%';
    $('hud-car').style.left = (k * 100) + '%';
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
      else if (ev === 'transform') { lastSay = performance.now(); S.say(Rx.body.robot + ' 변신!', { ms: 1600 }); }
      else if (ev === 'smash') sayOnce('와장창!');
      else if (ev === 'fall') sayOnce('으악!');
      else if (ev === 'pop') sayOnce('뿅!');
      else if (ev === 'slip') sayOnce('미끌!');
      else if (ev === 'hot') sayOnce('앗 뜨거!');
      else if (ev === 'monkey') sayOnce('장난꾸러기 원숭이 로봇이다!', 3000);
      else if (ev === 'finish') { lastSay = performance.now(); S.say('도착! 잘했어!'); }
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
    const d = RC.Run.createRun({ body: bodies[demoN % 3], wheel: ['normal', 'monster', 'spring'][demoN % 3], gear: ['jet', 'wing', 'drill'][demoN % 3], color: null }, 11 + demoN);
    d.car.x = d.level.length * (demoN % 2 ? 0.08 : 0.44);
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
    for (let i = 0; i < 3; i++) { const im = document.createElement('img'); im.src = starURL; im.alt = ''; rt.appendChild(im); setTimeout(() => { if (i < rating) { im.classList.add('on'); S.play('star'); } }, 350 + i * 300); }
    $('res-stars').textContent = '0';
    $('new-cards').innerHTML = '';
    $('res-note').textContent = '';
    let shown = 0, bank = prog.bank;
    const earned = [];
    const step = Math.max(1, Math.ceil(got / 45));
    const setJar = () => { $('jar-fill').style.height = 'calc(' + (bank / D.JAR * 100) + '% - 8px)'; $('jar-text').textContent = bank + ' / ' + D.JAR; };
    setJar();
    S.say('별을 ' + got + '개 모았어!');
    setTimeout(() => {
      const timer = setInterval(() => {
        if (mode !== 'result') { clearInterval(timer); return; }
        const n = Math.min(step, got - shown);
        shown += n; bank += n;
        $('res-stars').textContent = shown;
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
            while (list.children.length > 3) list.removeChild(list.firstChild);
            S.play('sticker');
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
    mode = 'sleep'; show('scr-sleep'); S.music(false); wakeLock(false);
    S.say('오늘은 여기까지! 내일 또 만나!', { ms: 4000 });
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
  }
  $('p-vib').addEventListener('click', () => { set.vib = !set.vib; saveAll(); renderParent(); vibrate(40); });
  for (const b of $('p-quality').children) b.addEventListener('click', () => {
    set.quality = b.dataset.q; view.q = baseQ(); RC.Draw.low = set.quality === 'save'; saveAll(); resize(); renderParent();
  });
  for (const b of $('p-limit').children) b.addEventListener('click', () => { set.limit = Number(b.dataset.min); saveAll(); renderParent(); });
  $('p-voice').addEventListener('click', () => { set.voice = !set.voice; S.setVoice(set.voice); saveAll(); renderParent(); });
  $('p-sound').addEventListener('click', () => { set.sound = !set.sound; S.setSound(set.sound); saveAll(); renderParent(); });
  $('p-extend').addEventListener('click', () => { play.bonus = (play.bonus || 0) + 10; saveAll(); renderParent(); });
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
    toGarage();
  });
  $('btn-book').addEventListener('click', () => { S.unlock(); S.play('click'); toBook(); });
  $('btn-book-back').addEventListener('click', () => { S.play('click'); toTitle(); });
  $('btn-run').addEventListener('click', () => { S.play('click'); startRun(); });
  $('btn-again').addEventListener('click', () => { S.play('click'); startRun(); });
  $('btn-garage').addEventListener('click', () => { S.play('click'); toGarage(); });
  $('btn-morph').addEventListener('click', () => {
    garageForm = garageForm === 'car' ? 'robot' : 'car'; garageMorph = RC.Car.MORPH;
    S.play(garageForm === 'robot' ? 'transform' : 'untransform');
    S.say(garageForm === 'robot' ? RC.find(D.BODIES, cfg.body).robot + ' 변신!' : '다시 자동차!');
    $('btn-morph').querySelector('span').textContent = garageForm === 'robot' ? '자동차로' : '변신 보기';
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
  $('btn-quit').addEventListener('click', () => { S.play('click'); resume(); toGarage(); });
  // 안드로이드 뒤로 가기(제스처)로 실수로 나가지 않게: 한 칸 쌓아 두고, 눌리면 멈춤 화면을 보여 준다
  try { history.pushState({ rc: 1 }, ''); } catch (e) { /* 무시 */ }
  window.addEventListener('popstate', () => {
    try { history.pushState({ rc: 1 }, ''); } catch (e) { /* 무시 */ }
    if (mode === 'run') pause();
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
  function frame(ts) {
    if (ts - lastTs < 1000 / 60 - 3) { requestAnimationFrame(frame); return; }
    const raw = (ts - lastTs) / 1000 || 0;
    const dt = Math.min(0.05, raw);
    lastTs = ts;
    gt += dt;
    autoQuality(raw);
    tickTimer(dt);
    renderBattery();
    ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, 0, 0);
    const vw = view.vw;

    if (mode === 'run' && R) {
      if (!parentOpen && !paused) {
        const input = { tap, hold: holding, transform: wantTransform };
        tap = false; wantTransform = false;
        RC.Run.stepRun(R, input, dt);
        handleEvents(R, false);
        updateHud();
        if (R.done) { finishT += dt; if (finishT > 1.8) showResult(); }
      }
      RC.Draw.drawRun(ctx, R, vw);
    } else if (mode === 'garage' || mode === 'sleep') {
      garageMorph = Math.max(0, garageMorph - dt * 0.5);
      garageBounce = Math.max(0, garageBounce - dt * 3);
      const robotShown = garageForm === 'robot' ? garageMorph < RC.Car.MORPH / 2 : garageMorph > RC.Car.MORPH / 2;
      const sleep = mode === 'sleep';
      RC.Draw.drawShowroom(ctx, cfg, vw, gt, {
        form: sleep ? 'car' : garageForm, morph: sleep ? 0 : garageMorph, bounce: garageBounce,
        ty: sleep ? 400 : 322, scale: sleep ? 1.7 : (robotShown ? 1.15 : 1.7), night: sleep,
      });
    } else {
      // 시작·결과·도감 뒤: 시연 달리기
      if (!demo || (demo.done && demo.doneT > 2) || demo.t > 26) demo = newDemo();
      RC.Run.stepRun(demo, demoInput(demo), dt);
      handleEvents(demo, true);
      RC.Draw.drawRun(ctx, demo, vw);
      if (mode === 'result' || mode === 'book') { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(3,5,12,0.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    }
    requestAnimationFrame(frame);
  }

  // ─── 시작 ────────────────────────────────────────────────
  S.setVoice(set.voice); S.setSound(set.sound);
  // 오프라인 실행 (홈 화면에 추가했을 때). 미리보기 창 안에서는 조용히 건너뛴다
  try {
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && window.top === window) navigator.serviceWorker.register('sw.js').catch(() => {});
  } catch (e) { /* 무시 */ }
  resize();
  buildGarage();
  toTitle();
  S.say('뚝딱 로봇카! 시작을 눌러 봐!', { ms: 3500 });
  requestAnimationFrame(ts => { lastTs = ts; frame(ts); });
  // 웹폰트가 늦게 오면 썸네일을 다시 그린다
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderParts(); });

  // 개발·스크린샷용 손잡이
  RC.debug = {
    get mode() { return mode; }, get run() { return R; }, cfg, prog, set, play,
    toGarage, toBook, startRun, showResult, goSleep, openParent, toTitle, pause, resume, get view() { return view; },
    setGarageForm(f) { garageForm = f; },
  };
})(RC);
