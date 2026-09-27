'use strict';
// 놀이 본부: 네 게임이 함께 쓰는 별코인 지갑 · 기록 요약 · 오늘의 미션.
// DOM을 쓰지 않는다 (node 테스트가 그대로 불러 쓴다: tests/hub.test.js). 저장은 HUB.store를 통해서만.
// 네 게임이 같은 주소(도메인)라 한 태블릿 안에서는 지갑 하나를 같이 쓴다.
//
// 저장 키
//   play.hub1 : { v:1, coins, earned, spent, moved:{게임:true},
//                 games:{ 게임: { best, bestText, medals, medalMax, games, sec, last } },
//                 daily:{ day, list:[{game, stat, goal, text, reward, sum}], prog:[], claimed:[], bonus },
//                 play:{ day, sec } }
var HUB = (typeof HUB !== 'undefined' && HUB) || {};
(function (H) {
  const KEY = 'play.hub1';

  // 게임 목록 (게임 고르기 화면·기록실 순서)
  const GAMES = [
    { id: 'ngun', name: '뿅뿅 우주선', path: 'game/', color: '#5ee7ff' },
    { id: 'snake', name: '냠냠 뱀', path: 'snake/', color: '#ff5fa8' },
    { id: 'jump', name: '통통 점프', path: 'jump/', color: '#7dff6a' },
    { id: 'runner', name: '슝슝 우주 달리기', path: 'runner/', color: '#ffb13d' },
  ];

  // 오늘의 미션 후보. 게임이 판이 끝날 때 reportRun(게임, {stat: 값})으로 알려 준다.
  // sum: true면 하루 동안 더해 가고, 아니면 한 판 최고값으로 잰다
  const DAILY = {
    ngun: [
      { stat: 'wave', goal: 5, text: '뿅뿅 우주선 웨이브 5 가기', reward: 60 },
      { stat: 'bosses', goal: 1, text: '뿅뿅 우주선 보스 1마리 잡기', reward: 80 },
      { stat: 'kills', goal: 150, sum: true, text: '뿅뿅 우주선 적 150마리', reward: 70 },
      { stat: 'games', goal: 3, sum: true, text: '뿅뿅 우주선 3판 하기', reward: 50 },
    ],
    snake: [
      { stat: 'len', goal: 20, text: '냠냠 뱀 길이 20 만들기', reward: 60 },
      { stat: 'golds', goal: 3, sum: true, text: '냠냠 뱀 황금 구슬 3개', reward: 60 },
      { stat: 'orbs', goal: 60, sum: true, text: '냠냠 뱀 구슬 60개 먹기', reward: 70 },
      { stat: 'games', goal: 3, sum: true, text: '냠냠 뱀 3판 하기', reward: 50 },
    ],
    jump: [
      { stat: 'height', goal: 100, text: '통통 점프 100m 오르기', reward: 60 },
      { stat: 'stars', goal: 40, sum: true, text: '통통 점프 별 40개', reward: 60 },
      { stat: 'springs', goal: 5, sum: true, text: '통통 점프 스프링 5번', reward: 50 },
      { stat: 'games', goal: 3, sum: true, text: '통통 점프 3판 하기', reward: 50 },
    ],
    runner: [
      { stat: 'dist', goal: 800, text: '슝슝 달리기 800m 달리기', reward: 60 },
      { stat: 'stars', goal: 60, sum: true, text: '슝슝 달리기 별 60개', reward: 60 },
      { stat: 'jumps', goal: 10, sum: true, text: '슝슝 달리기 레이저 문 10번 넘기', reward: 60 },
      { stat: 'games', goal: 3, sum: true, text: '슝슝 달리기 3판 하기', reward: 50 },
    ],
  };
  const DAILY_COUNT = 3;       // 하루 미션 수 (서로 다른 게임에서 하나씩)
  const DAILY_BONUS = 150;     // 셋 다 받으면 보너스 상자

  // 브라우저 저장소. 막혀 있어도(사생활 보호 창 등) 게임은 돈다. 테스트는 H.store를 바꿔 끼운다
  H.store = H.store || {
    get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
  };

  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const int = v => Math.floor(num(v));
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);

  // 오늘 날짜 'YYYY-MM-DD' (이 기기 시간 기준)
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function blank() {
    return { v: 1, coins: 0, earned: 0, spent: 0, moved: {}, games: {}, daily: { day: '', list: [], prog: [], claimed: [], bonus: false }, play: { day: '', sec: 0 } };
  }

  // 망가진 저장본도 올바른 모양으로
  function clean(raw) {
    const s = blank();
    if (!isObj(raw)) return s;
    s.coins = int(raw.coins); s.earned = int(raw.earned); s.spent = int(raw.spent);
    if (isObj(raw.moved)) for (const g of GAMES) if (raw.moved[g.id] === true) s.moved[g.id] = true;
    if (isObj(raw.games)) for (const g of GAMES) {
      const r = raw.games[g.id];
      if (!isObj(r)) continue;
      s.games[g.id] = { best: num(r.best), bestText: typeof r.bestText === 'string' ? r.bestText.slice(0, 40) : '', medals: int(r.medals), medalMax: int(r.medalMax), games: int(r.games), sec: num(r.sec), last: typeof r.last === 'string' ? r.last : '' };
    }
    if (isObj(raw.daily) && Array.isArray(raw.daily.list)) {
      const d = raw.daily;
      s.daily.day = typeof d.day === 'string' ? d.day : '';
      s.daily.list = d.list.filter(m => isObj(m) && DAILY[m.game] && DAILY[m.game].some(x => x.stat === m.stat)).slice(0, DAILY_COUNT)
        .map(m => Object.assign({ game: m.game }, DAILY[m.game].find(x => x.stat === m.stat)));
      s.daily.prog = s.daily.list.map((m, i) => Math.min(m.goal, num(Array.isArray(d.prog) ? d.prog[i] : 0)));
      s.daily.claimed = s.daily.list.map((m, i) => Array.isArray(d.claimed) && d.claimed[i] === true);
      s.daily.bonus = d.bonus === true;
    }
    if (isObj(raw.play)) { s.play.day = typeof raw.play.day === 'string' ? raw.play.day : ''; s.play.sec = num(raw.play.sec); }
    return s;
  }

  const load = () => clean(H.store.get(KEY, null));
  const save = s => H.store.set(KEY, s);

  // ─── 지갑 ─────────────────────────────────────────────────
  function coins() { return load().coins; }
  // 게임이 번 코인 (0 이하는 무시). 돌려주는 값: 새 잔액
  function addCoins(n) {
    n = int(n);
    const s = load();
    s.coins += n; s.earned += n;
    save(s);
    return s.coins;
  }
  // 모자라면 false (아무것도 안 바뀜)
  function spend(n) {
    n = int(n);
    const s = load();
    if (s.coins < n) return false;
    s.coins -= n; s.spent += n;
    save(s);
    return true;
  }
  // 게임 상점이 자기 잔액을 통째로 맞출 때 (뿅뿅 우주선 상점처럼 잔액을 들고 계산하는 경우). 늘면 번 것, 줄면 쓴 것
  function setCoins(n) {
    n = int(n);
    const s = load();
    if (n > s.coins) s.earned += n - s.coins; else s.spent += s.coins - n;
    s.coins = n;
    save(s);
    return n;
  }
  // 예전에 게임 안에만 따로 모아 둔 코인을 지갑으로 한 번만 옮긴다
  function moveIn(game, n) {
    const s = load();
    if (s.moved[game]) return false;
    s.moved[game] = true;
    n = int(n);
    s.coins += n; s.earned += n;
    save(s);
    return true;
  }

  // ─── 기록 요약 (기록실) ────────────────────────────────────
  // sum: { best: 비교용 숫자, bestText: '최고 1,234점', medals, medalMax, games }
  function report(game, sum) {
    if (!GAMES.some(g => g.id === game) || !isObj(sum)) return;
    const s = load();
    const r = s.games[game] || { best: 0, bestText: '', medals: 0, medalMax: 0, games: 0, sec: 0, last: '' };
    if (num(sum.best) >= r.best || !r.bestText) { r.best = Math.max(r.best, num(sum.best)); if (sum.bestText) r.bestText = String(sum.bestText).slice(0, 40); }
    if (sum.medals != null) r.medals = int(sum.medals);
    if (sum.medalMax != null) r.medalMax = int(sum.medalMax);
    if (sum.games != null) r.games = Math.max(r.games, int(sum.games));
    r.last = dayKey();
    s.games[game] = r;
    save(s);
  }

  // ─── 오늘의 미션 ───────────────────────────────────────────
  // 날짜로 정해지는 난수: 같은 날은 늘 같은 미션
  function seedOf(day) { let h = 2166136261; for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h || 1; }
  function pickDaily(day) {
    let x = seedOf(day);
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const games = GAMES.map(g => g.id);
    for (let i = games.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [games[i], games[j]] = [games[j], games[i]]; }
    return games.slice(0, DAILY_COUNT).map(g => { const pool = DAILY[g]; return Object.assign({ game: g }, pool[Math.floor(rnd() * pool.length)]); });
  }
  // 날짜가 바뀌었으면 새 미션으로 (바뀐 저장본 s를 돌려준다)
  function freshDaily(s, day) {
    day = day || dayKey();
    if (s.daily.day !== day || s.daily.list.length !== DAILY_COUNT) {
      s.daily = { day, list: pickDaily(day), prog: [0, 0, 0], claimed: [false, false, false], bonus: false };
    }
    if (s.play.day !== day) s.play = { day, sec: 0 };
    return s;
  }
  function daily(day) {
    const s = freshDaily(load(), day);
    save(s);
    return s.daily.list.map((m, i) => ({ game: m.game, text: m.text, goal: m.goal, reward: m.reward, prog: s.daily.prog[i], done: s.daily.prog[i] >= m.goal, claimed: s.daily.claimed[i] }));
  }
  // 한 판이 끝났을 때. stats: {stat: 값}, sec: 이번 판 시간(초). 돌려주는 값: 이번에 새로 채운 오늘의 미션 글 목록
  function reportRun(game, stats, sec, day) {
    const s = freshDaily(load(), day);
    const fresh = [];
    const st = Object.assign({ games: 1 }, isObj(stats) ? stats : {});
    s.daily.list.forEach((m, i) => {
      if (m.game !== game || st[m.stat] == null) return;
      const was = s.daily.prog[i];
      const v = num(st[m.stat]);
      s.daily.prog[i] = Math.min(m.goal, m.sum ? was + v : Math.max(was, v));
      if (was < m.goal && s.daily.prog[i] >= m.goal) fresh.push(m.text);
    });
    const r = s.games[game] || { best: 0, bestText: '', medals: 0, medalMax: 0, games: 0, sec: 0, last: '' };
    r.sec += num(sec); r.last = s.daily.day;
    s.games[game] = r;
    s.play.sec += num(sec);
    save(s);
    return fresh;
  }
  // 채운 미션 보상 받기. 돌려주는 값: 받은 코인 (못 받으면 0). 셋 다 받으면 보너스 상자까지
  function claimDaily(i, day) {
    const s = freshDaily(load(), day);
    const m = s.daily.list[i];
    if (!m || s.daily.claimed[i] || s.daily.prog[i] < m.goal) { save(s); return 0; }
    s.daily.claimed[i] = true;
    let got = m.reward;
    if (!s.daily.bonus && s.daily.claimed.every(Boolean)) { s.daily.bonus = true; got += DAILY_BONUS; }
    s.coins += got; s.earned += got;
    save(s);
    return got;
  }

  // 기록실 화면용 한 번에 읽기
  function summary(day) {
    const s = freshDaily(load(), day);
    save(s);
    let medals = 0, medalMax = 0, games = 0;
    const rows = GAMES.map(g => {
      const r = s.games[g.id] || { best: 0, bestText: '', medals: 0, medalMax: 0, games: 0, sec: 0, last: '' };
      medals += r.medals; medalMax += r.medalMax; games += r.games;
      return Object.assign({ id: g.id, name: g.name, color: g.color }, r);
    });
    return { coins: s.coins, earned: s.earned, spent: s.spent, medals, medalMax, games, todaySec: s.play.sec, rows };
  }

  Object.assign(H, { KEY, GAMES, DAILY, DAILY_COUNT, DAILY_BONUS, dayKey, blank, clean, load, save, coins, addCoins, spend, setCoins, moveIn, report, pickDaily, daily, reportRun, claimDaily, summary });
})(HUB);
