'use strict';
// 뚝딱 로봇카 놀이터 모드 규칙 테스트. 실행: node tests/park.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON });
for (const f of ['data.js', 'park.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const RC = vm.runInContext('RC', ctx);
const { create, step, PK, colDist } = RC.Park;
const D = RC.DATA;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

const CFG = { body: 'racer', wheel: 'normal', gear: 'jet' };
const VW = 960;

// 화면 좌표로 바꿔서 "그 자리를 누르고 있기"
function holdAt(P, x, y) { return { hold: true, tx: x - P.cam.x, ty: y - P.cam.y, vw: VW }; }
const NONE = { hold: false, vw: VW };

// 부딪힘 도형을 r만큼 키웠을 때 그 안인가
function inside(o, x, y, r) {
  if (o.kind === 'c') return Math.hypot(x - o.x, y - o.y) < o.r + r;
  return Math.hypot((x - o.x) / (o.rx + r), (y - o.y) / (o.ry + r)) < 1;
}
// 차가 벽 안에 들어가 있지 않은지 (아주 작은 오차는 허용)
function checkCar(P, where) {
  const c = P.car;
  if (!Number.isFinite(c.x + c.y + c.a + c.v + P.cam.x + P.cam.y)) throw new Error('NaN ' + where);
  assert(c.x >= PK.carR && c.x <= PK.W - PK.carR && c.y >= PK.carR && c.y <= PK.H - PK.carR, 'out of world ' + where + ' ' + c.x + ',' + c.y);
  for (const o of P.park.obst) assert(inside(o, c.x, c.y, PK.carR - 1.5) === false, 'inside obstacle ' + where + ' ' + JSON.stringify(o) + ' car ' + c.x.toFixed(1) + ',' + c.y.toFixed(1));
}

function run(P, bot, sec, fps, onEv) {
  fps = fps || 60;
  let f = 0;
  const events = {};
  while (f++ < fps * sec) {
    step(P, bot(P, f), 1 / fps);
    for (const e of P.events) { events[e] = (events[e] || 0) + 1; if (onEv) onEv(e); }
    P.events.length = 0;
    checkCar(P, 'frame ' + f);
    if (P.done && P.doneT > 1) break;
  }
  return events;
}

// 남은 것 중 가장 가까운 것으로 가는 봇 (미션이 끝나면 도착 문으로)
function autopilot(P) {
  const c = P.car, L = P.park;
  if (P.gate) return holdAt(P, P.gate.x, P.gate.y);
  let best = null, bd = 1e18;
  const consider = (x, y) => { const d = (x - c.x) ** 2 + (y - c.y) ** 2; if (d < bd) { bd = d; best = { x, y }; } };
  const m = {}; for (const q of P.missions) m[q.id] = q.done;
  if (!m.friends) for (const f of L.friends) if (f.state !== 'saved') consider(f.x, f.y);
  if (!m.balloons) for (const b of L.balloons) if (!b.popped) consider(b.x, b.y);
  if (!m.stars) for (const s of L.stars) if (!s.got) consider(s.x, s.y);
  return best ? holdAt(P, best.x, best.y) : NONE;
}

console.log('뚝딱 로봇카 놀이터 규칙 테스트');

test('공원 준비물: 별 45개 이상 · 풍선 6개 이상 · 친구 3명 · 미션 3개 · 결과 화면용 값', () => {
  const P = create(CFG, 1);
  const L = P.park;
  assert(L.stars.length >= 45, 'stars ' + L.stars.length);
  assert(L.balloons.length >= 6, 'balloons ' + L.balloons.length);
  assert(L.friends.length === 3, 'friends');
  assert(new Set(L.friends.map(f => f.kind)).size === 3, 'friend kinds');
  assert(L.pads.length >= 1 && L.trees.length > 10, 'pads/trees ' + L.trees.length);
  assert(P.missions.length === 3 && P.missions.map(m => m.id).join() === 'friends,stars,balloons', 'missions');
  for (const m of P.missions) assert(m.got === 0 && m.need > 0 && typeof m.label === 'string', 'mission ' + m.id);
  assert(P.missions[1].need <= L.stars.length && P.missions[2].need <= L.balloons.length, 'reachable counts');
  assert(P.course.id === 'park' && P.course.name === '놀이터', 'course');
  assert(P.airBonus === 0 && P.stars === 0 && P.saved === 0 && P.totalStars === L.stars.length, 'result fields');
  assert(P.body.id === 'racer' && P.wheel.id === 'normal' && P.gear.id === 'jet', 'parts resolved');
  assert(P.cfg !== CFG && P.cfg.body === 'racer', 'cfg copied');
  // 모을 것이 벽 안에 있지 않다
  for (const s of L.stars) for (const o of L.obst) assert(colDist(o, s.x, s.y) > PK.carR, 'star in obstacle');
  for (const b of L.balloons) for (const o of L.obst) assert(colDist(o, b.x, b.y) > PK.carR, 'balloon in obstacle');
  for (const f of L.friends) for (const o of L.obst) assert(colDist(o, f.x, f.y) > PK.carR, 'friend in obstacle');
  checkCar(P, 'start');
});

test('멀리 누르고 있으면 그쪽으로 가고, 최고 속도를 넘지 않는다', () => {
  const P = create(CFG, 2);
  const x0 = P.car.x, y0 = P.car.y;
  const gx = 200, gy = 200;
  const d0 = Math.hypot(gx - x0, gy - y0);
  let vmax = 0;
  for (let f = 0; f < 120; f++) {
    step(P, holdAt(P, gx, gy), 1 / 60); P.events.length = 0;
    if (P.car.boost <= 0) vmax = Math.max(vmax, P.car.v);
    checkCar(P, 'f' + f);
  }
  const d1 = Math.hypot(gx - P.car.x, gy - P.car.y);
  assert(d1 < d0 - 300, 'moved toward target ' + d0.toFixed(0) + ' -> ' + d1.toFixed(0));
  assert(vmax <= P.maxV + 1e-6, 'speed ' + vmax);
  assert(P.car.v > P.maxV * 0.5, 'actually drives ' + P.car.v);
});

test('손을 떼면 부드럽게 선다 (한 번에 멈추지 않음)', () => {
  const P = create(CFG, 3);
  for (let f = 0; f < 90; f++) { step(P, holdAt(P, 250, 250), 1 / 60); P.events.length = 0; }
  const v0 = P.car.v;
  assert(v0 > 100, 'moving ' + v0);
  step(P, NONE, 1 / 60);
  assert(P.car.v > v0 * 0.7, 'not instant stop');
  for (let f = 0; f < 120; f++) { step(P, NONE, 1 / 60); P.events.length = 0; }
  assert(P.car.v === 0, 'stopped ' + P.car.v);
  const x = P.car.x; step(P, NONE, 1 / 60);
  assert(P.car.x === x, 'stays');
});

test('짧게 톡 누르면 그 자리까지 가서 선다', () => {
  const P = create(CFG, 4);
  const gx = P.car.x - 300, gy = P.car.y + 250;
  const tap = holdAt(P, gx, gy);
  for (let f = 0; f < 6; f++) { step(P, tap, 1 / 60); P.events.length = 0; }
  for (let f = 0; f < 400; f++) { step(P, NONE, 1 / 60); P.events.length = 0; checkCar(P, 'tap'); }
  const d = Math.hypot(P.car.x - gx, P.car.y - gy);
  assert(d < 40, 'arrived near tap point: ' + d.toFixed(1));
  assert(P.car.v < 1, 'stopped ' + P.car.v);
});

test('연못 둘레로 3분 빙빙: 공원 밖으로 안 나가고, 연못에 안 끼고, 계속 움직인다', () => {
  const P = create(CFG, 5);
  const pd = P.park.pond;
  let far = 0, minMove = 1e9, lastOdo = 0;
  run(P, (P, f) => {
    // 연못 한가운데를 도는 점을 계속 누른다 (차는 가장자리를 따라 돌아야 한다)
    const a = f / 60 * 0.9;
    const x = pd.x + Math.cos(a) * pd.rx * 0.6, y = pd.y + Math.sin(a) * pd.ry * 0.6;
    if (f % 600 === 0) { minMove = Math.min(minMove, P.car.odo - lastOdo); lastOdo = P.car.odo; }
    far = Math.max(far, Math.hypot(P.car.x - pd.x, P.car.y - pd.y));
    return holdAt(P, x, y);
  }, 180);
  assert(P.car.odo > 5000, 'kept moving ' + P.car.odo.toFixed(0));
  assert(minMove > 150, 'never stuck for 10s (min ' + minMove.toFixed(0) + ')');
  // 빙빙 도는 차: 이리저리 다닌다
  const P2 = create({ body: 'fire', wheel: 'monster', gear: 'drill' }, 6);
  run(P2, (P, f) => { const a = f / 60 * 1.3; return { hold: true, tx: VW / 2 + Math.cos(a) * 280, ty: 300 + Math.sin(a) * 250, vw: VW }; }, 180);
  assert(P2.car.odo > 20000, 'circle bot moved ' + P2.car.odo.toFixed(0));
});

test('공원 구석구석을 눌러도 벽 밖으로 안 나가고 멈춰 서지 않는다', () => {
  const P = create(CFG, 7);
  const spots = [[0, 0], [3000, 0], [3000, 1320], [0, 1320], [1500, 660], [2140, 880], [850, 445]];
  let i = 0;
  run(P, (P, f) => { if (f % 480 === 0) i++; const s = spots[i % spots.length]; return holdAt(P, s[0], s[1]); }, 60);
  assert(P.car.odo > 8000, 'moved ' + P.car.odo.toFixed(0));
});

test('아무 데나 톡톡 누르는 아이 (씨앗 12개 · 각 60초): 벽에 안 끼고 계속 다닌다', () => {
  for (let seed = 60; seed < 72; seed++) {
    const P = create(CFG, seed);
    const rnd = RC.rng(seed * 3 + 1);
    let tgt = null, stuck = 0, lastOdo = 0;
    run(P, (P, f) => {
      if (f % 90 === 1) tgt = { tx: rnd() * VW, ty: rnd() * 600 };
      if (f % 180 === 0) { if (P.car.odo - lastOdo < 30 && P.car.v > 0) stuck++; lastOdo = P.car.odo; }
      return f % 90 < 8 ? { hold: true, tx: tgt.tx, ty: tgt.ty, vw: VW } : NONE;
    }, 60);
    assert(P.car.odo > 3000, 'seed ' + seed + ' moved ' + P.car.odo.toFixed(0));
    assert(stuck === 0, 'seed ' + seed + ' stuck ' + stuck);
  }
});

test('별 가까이 가면 모인다', () => {
  const P = create(CFG, 8);
  const s = P.park.stars.find(s => Math.hypot(s.x - P.car.x, s.y - P.car.y) > 200);
  let got = 0;
  run(P, P => holdAt(P, s.x, s.y), 8, 60, e => { if (e === 'star') got++; });
  assert(s.got, 'target star taken');
  assert(P.stars === got && P.stars > 0, 'count ' + P.stars);
  assert(P.lastStar && Number.isFinite(P.lastStar.x), 'lastStar');
  assert(P.missions[1].got === Math.min(P.missions[1].need, P.stars), 'mission got');
});

test('친구 3명을 구하면 rescue 3번 · 미션 완료 · 기차로 따라온다', () => {
  const P = create(CFG, 9);
  let rescue = 0, mission = 0, peek = 0;
  const kinds = [];
  run(P, P => {
    const f = P.park.friends.find(f => f.state !== 'saved');
    return f ? holdAt(P, f.x, f.y) : NONE;
  }, 120, 60, e => {
    if (e === 'rescue') { rescue++; kinds.push(P.lastFriend.kind); }
    if (e === 'mission') mission++;
    if (e === 'peek') peek++;
  });
  assert(rescue === 3, 'rescue events ' + rescue);
  assert(peek === 3, 'peek ' + peek);
  assert(P.saved === 3 && P.missions[0].done && P.missions[0].got === 3, 'friends mission');
  assert(mission >= 1, 'mission event');
  assert(new Set(kinds).size === 3, 'lastFriend kinds ' + kinds);
  assert(P.followers.length === 3 && P.riders.length === 3, 'train');
  for (let f = 0; f < 120; f++) { step(P, holdAt(P, 1500, 300), 1 / 60); P.events.length = 0; }
  const w = P.followers;
  const gap = Math.hypot(w[0].x - P.car.x, w[0].y - P.car.y);
  assert(gap > 30 && gap < 110, 'first wagon behind car ' + gap.toFixed(0));
  for (let i = 1; i < 3; i++) { const g = Math.hypot(w[i].x - w[i - 1].x, w[i].y - w[i - 1].y); assert(g > 30 && g < 110, 'wagon gap ' + g.toFixed(0)); }
});

test('풍선을 터뜨리면 별 2개가 쏟아져 totalStars에 더해지고 차로 날아온다', () => {
  const P = create(CFG, 10);
  const t0 = P.totalStars;
  const b = P.park.balloons[0];
  let pops = 0;
  run(P, P => b.popped ? NONE : holdAt(P, b.x, b.y), 20, 60, e => { if (e === 'balloon') pops++; });
  assert(b.popped && pops >= 1, 'popped');
  assert(P.popped === pops, 'popped count');
  assert(P.totalStars === t0 + pops * 2, 'totalStars ' + P.totalStars + ' vs ' + t0);
  assert(P.flying.length === 0 || P.flying.every(s => s.got), 'spilled stars flew in');
  assert(P.stars >= pops * 2, 'spilled stars counted ' + P.stars);
});

test('150초가 지나면 미션과 상관없이 도착 문이 나오고, 가만히 있어도 결국 끝난다', () => {
  const P = create(CFG, 11);
  let gateAt = -1, finishAt = -1;
  run(P, () => NONE, 240, 60, e => { if (e === 'gate') gateAt = P.t; if (e === 'finish') finishAt = P.t; });
  assert(gateAt >= PK.gateAfter - 0.02 && gateAt < PK.gateAfter + 0.1, 'gate at ' + gateAt);
  assert(P.gate && P.gate.early, 'early gate');
  assert(P.done && finishAt > 0 && finishAt < 200, 'finished idle at ' + finishAt);
  assert(P.doneT > 0, 'doneT counts');
});

test('도착 문을 지나가면 끝 (done · finish)', () => {
  const P = create(CFG, 12);
  run(P, () => NONE, PK.gateAfter + 0.1);
  assert(P.gate && !P.done, 'gate out, not done yet');
  const gd = Math.hypot(P.gate.x - P.car.x, P.gate.y - P.car.y);
  assert(gd > PK.gateR + 40, 'gate not on top of car ' + gd.toFixed(0));
  let fin = 0;
  run(P, P => holdAt(P, P.gate.x, P.gate.y), 10, 60, e => { if (e === 'finish') fin++; });
  assert(P.done && fin === 1, 'finished');
  const t = P.doneT;
  for (let f = 0; f < 60; f++) step(P, holdAt(P, 100, 100), 1 / 60);
  assert(P.doneT > t, 'doneT grows');
  assert(P.car.v < 5, 'car stops after finish');
});

test('같은 씨앗이면 똑같다 · 다른 씨앗이면 배치가 다르다', () => {
  const a = create(CFG, 21), b = create(CFG, 21), c = create(CFG, 22);
  run(a, autopilot, 40); run(b, autopilot, 40);
  const snap = P => JSON.stringify({ car: P.car, stars: P.stars, saved: P.saved, popped: P.popped, t: P.t, cam: P.cam });
  assert(snap(a) === snap(b), 'same run');
  const lay = P => JSON.stringify(P.park.trees.map(t => [t.x | 0, t.y | 0]).concat(P.park.friends.map(f => f.kind + f.hx)));
  assert(lay(create(CFG, 21)) !== lay(c), 'different seeds differ');
});

test('화면이 60·90·120Hz여도 같은 움직임', () => {
  const pos = [];
  for (const hz of [60, 90, 120]) {
    const P = create(CFG, 30);
    const tgt = { x: 400, y: 1100 };
    for (let f = 0; f < hz * 3; f++) { step(P, { hold: true, tx: tgt.x - P.cam.x, ty: tgt.y - P.cam.y, vw: VW }, 1 / hz); P.events.length = 0; }
    pos.push([P.car.x, P.car.y]);
  }
  for (const p of pos) assert(Math.hypot(p[0] - pos[0][0], p[1] - pos[0][1]) < 12, 'hz drift ' + JSON.stringify(pos));
});

test('자동 운전 봇이 부품 27가지 모두 180초 안에 미션 3개를 끝내고 도착한다', () => {
  let worst = 0, sample = null;
  for (const b of D.BODIES) for (const w of D.WHEELS) for (const g of D.GEAR) {
    const P = create({ body: b.id, wheel: w.id, gear: g.id }, 40 + worst % 7);
    const evs = run(P, autopilot, 200);
    assert(P.done, b.id + '/' + w.id + '/' + g.id + ' not done');
    assert(P.missions.every(m => m.done), 'missions ' + JSON.stringify(P.missions.map(m => m.got)));
    assert(P.gate && !P.gate.early, 'gate by missions');
    const fin = P.t - P.doneT;
    assert(fin < 180, 'too slow ' + fin.toFixed(0));
    assert(evs.gate === 1 && evs.finish === 1 && evs.mission === 3 && evs.rescue === 3, 'events ' + JSON.stringify(evs));
    if (fin > worst) { worst = fin; sample = b.id + '/' + w.id + '/' + g.id; }
  }
  console.log('       가장 오래 걸린 조합 ' + sample + ' ' + worst.toFixed(0) + '초');
});

test('씨앗 20개 모두 자동 운전으로 끝난다 (배치 운이 나빠도)', () => {
  const times = [];
  for (let s = 100; s < 120; s++) {
    const P = create(CFG, s);
    run(P, autopilot, 200);
    assert(P.done && P.missions.every(m => m.done), 'seed ' + s);
    times.push(P.t - P.doneT);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log('       평균 ' + avg.toFixed(0) + '초, 최대 ' + Math.max(...times).toFixed(0) + '초');
  assert(Math.max(...times) < 180, 'max ' + Math.max(...times));
});

test('부스터 발판을 밟으면 boost, 분수 곁을 지나면 splash', () => {
  const P = create(CFG, 50);
  const pad = P.park.pads[0];
  let boost = 0, splash = 0, vb = 0;
  run(P, P => holdAt(P, pad.x - 120, pad.y), 3, 60);
  run(P, P => holdAt(P, pad.x + 400, pad.y), 3, 60, e => { if (e === 'boost') { boost++; vb = P.car.v; } });
  assert(boost >= 1 && vb > P.maxV, 'boost ' + boost + ' v ' + vb);
  run(P, P => holdAt(P, P.park.fountain.x - 170, P.park.fountain.y), 6, 60, e => { if (e === 'splash') splash++; });
  assert(splash >= 1, 'splash ' + splash);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
