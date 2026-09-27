'use strict';
// 기록 장부 · 난이도 기억 · 처음 안내. DOM을 쓰지 않는다 (저장은 store.get/set으로만, node 테스트가 그대로 부른다).
//
// 저장 키 (이 기기 안에만)
//   jump.rec  : { v:2, best:{height,score,stars} (난이도 합쳐 최고),
//                 byDiff:{easy|normal|hard:{height,score,stars,games}},
//                 total:{games,stars,height,rescues,stomps(밟은 몬스터)}, medals:{id:'YYYY-MM-DD'},
//                 places:{cloud|space|exo:true} (한 번이라도 올라서 닿은 출발 장소, D.STARTS) }
//               v1(난이도 칸 없음) 기록은 어느 난이도였는지 몰라 쉬움 칸으로 옮긴다
//   jump.diff : 'easy' | 'normal' | 'hard'. 없으면 예전 키 jump.easy (false → 보통, 그 밖 → 쉬움)
//   jump.tut  : 처음 안내를 끝까지 봤으면 true
//   jump.start: 고른 출발 장소 id (D.STARTS). 아직 열리지 않은 곳이면 땅
(function (JP) {
  const D = JP.DATA;
  const KEY = 'jump.rec', DIFF_KEY = 'jump.diff', OLD_EASY_KEY = 'jump.easy', TUT_KEY = 'jump.tut', START_KEY = 'jump.start';
  const DIFFS = D.DIFF_ORDER;
  const BEST = ['height', 'score', 'stars'];
  const TOTAL = ['games', 'stars', 'height', 'rescues', 'stomps'];

  // 저장소에서 읽은 값은 믿지 않는다: 숫자가 아니거나 음수면 0
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);

  const blankBest = () => ({ height: 0, score: 0, stars: 0, games: 0 });
  function blank() {
    const byDiff = {};
    for (const d of DIFFS) byDiff[d] = blankBest();
    return { v: 2, best: { height: 0, score: 0, stars: 0 }, byDiff, total: { games: 0, stars: 0, height: 0, rescues: 0, stomps: 0 }, medals: {}, places: {} };
  }

  // 아무 값이나 받아 올바른 모양으로 (망가진 저장본이 와도 게임이 멈추지 않게)
  function clean(raw) {
    const r = blank();
    if (!isObj(raw)) return r;
    if (isObj(raw.best)) for (const f of BEST) r.best[f] = num(raw.best[f]);
    if (isObj(raw.total)) for (const f of TOTAL) r.total[f] = num(raw.total[f]);
    if (isObj(raw.medals)) {
      const ids = new Set(D.MEDALS.map(m => m.id));
      for (const id of Object.keys(raw.medals)) if (ids.has(id)) r.medals[id] = typeof raw.medals[id] === 'string' ? raw.medals[id].slice(0, 10) : '';
    }
    if (isObj(raw.byDiff)) {
      for (const d of DIFFS) if (isObj(raw.byDiff[d])) for (const f of Object.keys(r.byDiff[d])) r.byDiff[d][f] = num(raw.byDiff[d][f]);
    } else {
      // v1: 난이도를 모르는 옛 최고 기록은 쉬움 칸으로
      for (const f of BEST) r.byDiff.easy[f] = r.best[f];
      r.byDiff.easy.games = r.total.games;
    }
    // 난이도 합친 최고는 칸마다의 최고보다 작을 수 없다
    for (const d of DIFFS) for (const f of BEST) r.best[f] = Math.max(r.best[f], r.byDiff[d][f]);
    // 열린 출발 장소: 저장된 것 + 최고 높이로 이미 닿았던 곳 (출발 장소 고르기 전의 기록도 이어받는다)
    for (const S of D.STARTS) {
      if (!S.at) continue;
      if ((isObj(raw.places) && raw.places[S.id] === true) || r.best.height >= S.at) r.places[S.id] = true;
    }
    return r;
  }

  const load = store => clean(store.get(KEY, null));
  const save = (rec, store) => store.set(KEY, rec);

  // 고른 난이도: 새 키가 먼저, 없으면 예전 쉬움 켜기 키
  function loadDiff(store) {
    const d = store.get(DIFF_KEY, null);
    if (typeof d === 'string' && D.DIFFICULTY[d]) return d;
    return store.get(OLD_EASY_KEY, true) === false ? 'normal' : 'easy';
  }
  const saveDiff = (d, store) => store.set(DIFF_KEY, d);

  // 한 판이 끝나면 장부에 적는다. 돌려주는 것: 이 난이도 최고 점수인지, 신기록 칩 글자들
  function finish(rec, run) {
    const d = D.DIFFICULTY[run.diff] ? run.diff : 'easy';
    const B = rec.byDiff[d], T = rec.total, name = D.DIFFICULTY[d].name;
    T.games++; T.stars += run.stars; T.height += run.height; T.rescues += run.rescued || 0; T.stomps += run.stomps || 0;
    B.games++;
    const chips = [];
    const isBest = run.score > B.score && run.score > 0;
    if (isBest) B.score = run.score;
    if (run.height > B.height) { B.height = run.height; chips.push(name + ' 최고 높이 ' + run.height + 'm'); }
    if (run.stars > B.stars) { B.stars = run.stars; chips.push(name + ' 별 ' + run.stars + '개'); }
    for (const f of BEST) rec.best[f] = Math.max(rec.best[f], B[f]);
    // 새로 열린 출발 장소 (올라서 닿은 곳)
    if (!rec.places) rec.places = {};
    const places = [];
    for (const S of D.STARTS) if (S.at && run.height >= S.at && !rec.places[S.id]) { rec.places[S.id] = true; places.push(S.id); }
    return { isBest, chips, places };
  }

  // 출발 장소: 열렸는지 (땅은 늘) · 고른 곳 기억 (열리지 않은 곳이면 땅)
  const placeOpen = (rec, id) => { const S = D.STARTS.find(x => x.id === id); return !!S && (!S.at || !!(rec.places && rec.places[id])); };
  function loadStart(store, rec) {
    const id = store.get(START_KEY, 'ground');
    return typeof id === 'string' && placeOpen(rec, id) ? id : 'ground';
  }
  const saveStart = (id, store) => store.set(START_KEY, id);

  // 처음 안내: 한 번 끝까지 보면(양쪽을 다 눌러 보면) 다시 안 나온다
  const needTutorial = store => store.get(TUT_KEY, false) !== true;
  const tutorialDone = store => store.set(TUT_KEY, true);

  JP.Records = { KEY, DIFF_KEY, OLD_EASY_KEY, TUT_KEY, START_KEY, blank, clean, load, save, loadDiff, saveDiff, finish, needTutorial, tutorialDone, placeOpen, loadStart, saveStart };
})(JP);
