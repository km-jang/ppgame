'use strict';
// 게임 수치 모음. 밸런스 조정은 이 파일만 고친다.
(function (NG) {
  const PLAYER = {
    r: 12, hp: 5, speed: 220, iframe: 1.0,
    dashTime: 0.18, dashMul: 3.2, dashCd: 1.2, dashIframe: 0.25,
  };

  const GUN = {
    barrels: 1, rate: 5, dmg: 1, speed: 520, life: 1.1,
    pierce: 0, bounce: 0, size: 4, crit: 0.05, critMul: 2.5,
    spreadStep: 0.12, spreadMax: 2.8,
  };

  // shape: 그리기용 도형. score: 처치 점수
  const ENEMIES = {
    grunt:    { name: '졸개',   r: 14, hp: 3,   speed: 72,  score: 10,  color: '#ff4d6d', shape: 'circle' },
    runner:   { name: '돌격병', r: 10, hp: 2,   speed: 150, score: 15,  color: '#ffb703', shape: 'tri' },
    shooter:  { name: '사수',   r: 15, hp: 5,   speed: 58,  score: 30,  color: '#06d6a0', shape: 'diamond',
                keep: 250, fireCd: 2.2, bulletSpeed: 210 },
    tank:     { name: '중장갑', r: 26, hp: 18,  speed: 44,  score: 50,  color: '#8f5cff', shape: 'square' },
    splitter: { name: '분열체', r: 20, hp: 8,   speed: 62,  score: 25,  color: '#fb5607', shape: 'penta', splitInto: 'mini' },
    mini:     { name: '새끼',   r: 9,  hp: 1,   speed: 125, score: 5,   color: '#ff9e6d', shape: 'circle' },
    // 돌진이 (2026-09-27): 가까이 오면 멈춰서 예고선을 보여 주고(warn초) 그 방향으로 쏜살같이 돌진한다.
    // 예고선이 굳은 뒤에 옆으로 비키면 안 맞는다 (가만히 서 있으면 맞는다)
    charger:  { name: '돌진이', r: 13, hp: 4,   speed: 64,  score: 20,  color: '#ff8c42', shape: 'arrow',
                range: 340, warn: 0.75, dashSpeed: 560, dashTime: 0.5, rest: 1.4 },
    // ─── 행성마다 다른 적 (2026-09-27, 소유자 "추천대로") ───────────────
    // 그 행성 웨이브(2개)에만 섞여 나온다 (PLANETS[].foe, PLANET_FOE). 모두 맞기 전에 알아볼 수 있는 예고가 있다.
    // 경고 시간(초)에는 난이도 foeWarn을 곱한다 (쉬움은 조금 길게)
    // 수성 태양 불씨: 해가 있는 쪽(왼쪽·위)에서 날아오는 작고 빠른 불씨. 방향을 천천히만 틀어서 옆으로 비키면 스쳐 간다. 닿으면 꺼진다
    ember:    { name: '태양 불씨', r: 8,  hp: 1,  speed: 175, score: 8,  color: '#ffb347', shape: 'ember', turn: 0.9 },
    // 금성 산성 구름: 느린 구름. mistCd초마다 제자리에 안개 웅덩이를 남긴다 (mistForm초 동안 점선으로 생기고, mistLife초 동안
    // 그 안에선 내 속도가 slow배). 아프지는 않다
    acid:     { name: '산성 구름', r: 22, hp: 6,  speed: 38,  score: 25, color: '#c8f04a', shape: 'acid',
                mistCd: 3.2, mistR: 58, mistForm: 0.6, mistLife: 4.5, slow: 0.55, mistMax: 6 },
    // 지구 인공위성: 나를 가운데 두고 orbit px 거리에서 빙 돈다. beamCd초마다 멈춰서 점선 예고(beamWarn, 방향은 예고 시작 때 굳음)
    // 뒤 짧은 빛줄기(길이 beamLen)를 beamOn초 쏜다
    sat:      { name: '인공위성', r: 14, hp: 5,  speed: 75,  score: 30, color: '#9fd8ff', shape: 'sat',
                orbit: 240, beamCd: 3.4, beamWarn: 0.9, beamOn: 0.25, beamLen: 440, beamW: 14 },
    // 화성 모래 벌레: 땅속(모래 더미)으로 나를 따라오다(digSpeed, 이때는 못 맞히고 안 아프다) 내 밑에 오거나 digMax초가 지나면
    // 멈춰서 둥근 예고(popR, popWarn초) 뒤 튀어나온다. 원 안에 있으면 아프다. 그다음 upTime초 동안 밖에 나와 느리게 쫓아온다
    worm:     { name: '모래 벌레', r: 17, hp: 7,  speed: 45,  score: 35, color: '#e0824f', shape: 'worm',
                digSpeed: 100, digMax: 5, popR: 50, popWarn: 0.9, upTime: 2.6 },
    // 목성 번개 구름: 거리를 두고 떠 있다가 번개를 모은다(zapWarn초, 불꽃 + 내가 있던 자리까지 점선). 그 자리까지 짧은 번개
    zap:      { name: '번개 구름', r: 21, hp: 7,  speed: 50,  score: 35, color: '#c9b6ff', shape: 'zap',
                keep: 270, zapCd: 3.8, zapWarn: 1.0, zapOn: 0.18, zapW: 18, zapReach: 520 },
    // 토성 고리 조각: 화면 왼쪽·오른쪽 끝에서 내 높이로 줄을 맞추고(aim초) 가로 띠 예고(warn초) 뒤 반대쪽 끝까지 휙 (sweep px/초)
    shard:    { name: '고리 조각', r: 14, hp: 5,  speed: 150, score: 25, color: '#f3d58c', shape: 'shard',
                aim: 1.3, warn: 1.0, sweep: 400 },
    // 천왕성 얼음 결정: 부수면 작은 얼음 조각 3개로 쪼개진다
    ice:      { name: '얼음 결정', r: 17, hp: 6,  speed: 60,  score: 25, color: '#bff6ff', shape: 'ice', splitInto: 'iceBit', splitN: 3 },
    iceBit:   { name: '얼음 조각', r: 8,  hp: 1,  speed: 120, score: 5,  color: '#e6fbff', shape: 'iceBit' },
    // 해왕성 폭풍 드론: 나를 둘러싸고 소용돌이치며(near~far px) 돈다. 둘레 windR px 안을 지나는 내 총알을 옆으로 휘게 한다
    storm:    { name: '폭풍 드론', r: 15, hp: 6,  speed: 90,  score: 30, color: '#6fa8ff', shape: 'storm',
                near: 150, far: 290, windR: 95, windTurn: 3.0 },
    // 명왕성 하트 유령: 보였다(on초) 흐려졌다(off초) 한다 (fade초에 걸쳐). 흐릴 땐 못 맞히고 닿아도 안 아프며, 나에게서 keepOff px 떨어져 있다
    ghost:    { name: '하트 유령', r: 17, hp: 5,  speed: 75,  score: 30, color: '#ffb3d9', shape: 'ghost',
                on: 2.4, off: 1.8, fade: 0.45, keepOff: 140 },
    boss:     { name: '보스',   r: 58, hp: 320, speed: 42,  score: 1000, color: '#ff2e88', shape: 'octa',
                ringCd: 3.0, ringCount: 14, ringSpeed: 170,
                aimCd: 1.4, aimSpeed: 240, summonCd: 6.5 },
  };

  // from: 등장 웨이브, w: 등장 가중치
  const WAVE_POOL = [
    { type: 'grunt',    from: 1, w: 10 },
    { type: 'runner',   from: 2, w: 5 },
    { type: 'shooter',  from: 3, w: 3 },
    { type: 'charger',  from: 3, w: 3 },
    { type: 'tank',     from: 4, w: 2 },
    { type: 'splitter', from: 6, w: 3 },
  ];

  const WAVE = {
    bossEvery: 5,
    baseCount: 6, perWave: 2.6,
    hpPerWave: 0.15, speedPerWave: 0.02, speedMax: 0.4,
    bossHpPerBoss: 0.8,
    spawnGap: (n) => Math.max(0.25, 1.1 - n * 0.05),
    groupSize: (n) => 1 + Math.floor(n / 6),
    spawnWarn: 0.6, safeRadius: 180,
    clearDelay: 0.8, banner: 2.0,
  };

  // 난이도. 적 체력·속도·수, 적 탄 속도·연사, 내 체력, 점수 배율
  // (2026-09-27 소유자: "난이도 더 높여도 돼, 쉬움부터 상하좌우 움직이게") 아래를 더했다
  // lead: 사수가 내가 움직이는 쪽을 얼마나 앞질러 쏘나 (0 그대로 겨눔, 1 정확히 앞질러)
  // meteor: 운석이 떨어지는 간격(초)·예고 시간(초). 예고 원이 내 자리에 생기고 warn초 뒤 떨어진다
  // foeWarn: 행성 적(PLANET_FOE)의 예고 시간 배율
  // pull·bulletPull: 블랙홀 웨이브에서 나와 적 탄을 끌어당기는 힘 (px/초, px/초²). 내 속도(220)보다 한참 약하다
  const DIFFICULTY = {
    easy:   { id: 'easy',   name: '쉬움',   hp: 8, enemyHp: 0.7,  enemySpeed: 0.85, count: 0.9,  bulletSpeed: 0.8,  fireRate: 0.8,  score: 0.6,
              lead: 0.3,  meteorEvery: 5.2, meteorWarn: 1.35, pull: 38, bulletPull: 70, foeWarn: 1.2 },
    normal: { id: 'normal', name: '보통',   hp: 5, enemyHp: 1.05, enemySpeed: 1.05, count: 1.1,  bulletSpeed: 1.05, fireRate: 1.1,  score: 1,
              lead: 0.6,  meteorEvery: 4.0, meteorWarn: 1.15, pull: 52, bulletPull: 100, foeWarn: 1 },
    hard:   { id: 'hard',   name: '어려움', hp: 4, enemyHp: 1.5,  enemySpeed: 1.2,  count: 1.35, bulletSpeed: 1.2,  fireRate: 1.4,  score: 1.6,
              lead: 0.85, meteorEvery: 3.2, meteorWarn: 1.0,  pull: 66, bulletPull: 130, foeWarn: 0.85 },
  };

  // 운석 (2026-09-27): 가만히 서 있으면 맞도록 내 자리를 노린다. 예고 원(빨간 점선 + 차오르는 빛)이 먼저 뜨고
  // 떨어질 때 원 안에 있으면 1칸 아프다. 원 안의 일반 적도 피해를 입는다 (적을 끌어들여 맞히는 재미)
  // 간격 = 난이도 meteorEvery × max(minMul, 1 - (웨이브-1) × perWave). extraEvery 웨이브마다 운석이 하나씩 더 (내 주변 spread px 안)
  const METEOR = {
    r: 58,             // 떨어지는 원 반지름 (내가 0.35초면 빠져나간다)
    firstDelay: 2.6,   // 웨이브 시작 뒤 첫 운석까지
    perWave: 0.03, minMul: 0.6,
    extraEvery: 6, extraMax: 3, spread: 190,
    bossMul: 1.5,      // 보스 웨이브에선 덜 자주
    enemyDmg: 5,       // 원 안의 적 피해 (웨이브 체력 배율·난이도 적 체력 배율을 곱함. 졸개·돌격병·새끼는 한 방)
    stop: 0.05,        // 떨어지는 순간 화면 멈춤
  };

  // 태양계 여행 (2026-09-27, 소유자: "배경 행성을 수금지화목토천해명 지나가면 각 특색 있는 행성, 간혹 블랙홀 배경도")
  // 웨이브 perPlanet개마다 다음 행성으로. 명왕성 다음은 다시 수성 (2바퀴, 3바퀴 …)
  // 그림(색·무늬)은 render.js PLANET_ART. 여기는 이름·한 줄 설명·알림 색
  const JOURNEY = { perPlanet: 2 };
  // foe: 그 행성 웨이브에 섞여 나오는 행성 적 (ENEMIES)
  const PLANETS = [
    { id: 'mercury', name: '수성',   fact: '태양과 가장 가까운 행성',   color: '#c9c3bb', foe: 'ember' },
    { id: 'venus',   name: '금성',   fact: '노란 구름이 빙글빙글',       color: '#ffcf6b', foe: 'acid' },
    { id: 'earth',   name: '지구',   fact: '우리 집! 파란 바다 행성',    color: '#6fc3ff', foe: 'sat' },
    { id: 'mars',    name: '화성',   fact: '빨간 모래 행성',             color: '#ff7a4d', foe: 'worm' },
    { id: 'jupiter', name: '목성',   fact: '가장 큰 행성, 커다란 빨간 점', color: '#f0b98a', foe: 'zap' },
    { id: 'saturn',  name: '토성',   fact: '멋진 고리를 두른 행성',      color: '#f3d58c', foe: 'shard' },
    { id: 'uranus',  name: '천왕성', fact: '옆으로 누워 도는 얼음 행성', color: '#9ef0f0', foe: 'ice' },
    { id: 'neptune', name: '해왕성', fact: '바람이 가장 센 파란 행성',   color: '#5b8cff', foe: 'storm' },
    { id: 'pluto',   name: '명왕성', fact: '작고 추운 하트 행성',        color: '#e8d2b8', foe: 'ghost' },
  ];
  // 행성 적 섞기: 일반 웨이브는 적 수의 share만큼(최소 min), 보스 웨이브는 boss마리를 웨이브 안에 고르게 바꿔 넣는다.
  // 처음 만나면 그 적 위에 이름표("화성 모래 벌레!")를 tag초 띄운다
  const PLANET_FOE = { share: 0.3, min: 2, boss: 2, tag: 2.4 };

  // 알아서 맞춰 주는 난이도 (2026-09-27, common/hub.js HUB.adaptMul). 판을 시작할 때 받은 배율 m(0.85 ~ 1.12, 처음 두 판은 1)을
  // 압박 손잡이에 살짝 곱한다: 손잡이 = 1 + (m - 1) × 무게. count 적 수 · gap 적이 나오는 간격(나눔) · meteor 운석 간격(나눔) · fire 적 연사
  // 판이 끝나면 perf = 버틴 시간 ÷ target[난이도] (최대 3)를 HUB.adaptRun으로 알린다. 1이면 "그 난이도에서 보통 잘한 판"
  // target은 원 그리기 봇(피하지 않고 돌기만, 아이 흉내)의 버틴 시간 중앙값 근처 (PLAN.md 5.6)
  const ADAPT = { count: 1, gap: 1, meteor: 1, fire: 0.6, min: 0.8, max: 1.2, target: { easy: 240, normal: 120, hard: 100 }, maxPerf: 3 };

  // 블랙홀 웨이브: from 웨이브부터, 보스 웨이브가 아니고 바로 앞 웨이브가 블랙홀이 아니면 chance 확률로
  // 블랙홀은 화면 안쪽(place 비율 사이)에, 내 자리에서 minFromPlayer px 이상 떨어져 생긴다.
  // 끌어당기는 힘 = 난이도 pull × (near + (1 - near) × 가까움), 가까움 = 1 - 거리/(range × 화면 긴 변). 한가운데(core)는 힘 없음
  // 적은 끌려가지 않는다 (적을 나에게 떠밀지 않게). 적 탄은 휘고, 가운데(swallow px)에 닿은 탄은 삼켜진다
  const BLACKHOLE = { from: 4, chance: 0.16, core: 14, swallow: 26, range: 0.7, near: 0.35, place: [0.28, 0.72], minFromPlayer: 220 };

  // 타격감: 큰 적을 잡는 순간 화면을 아주 잠깐 멈춘다 (초). 연달아 걸리지 않게 간격을 둔다
  // 보스 모습: 5웨이브마다 차례로 바뀐다 (한 바퀴 돌면 같은 모습에 "MK2", "MK3"…). 규칙(체력·탄막)은 같다
  // color: 몸 색 · glow: 발광·보스전 배경 색(r,g,b) · shape: 그리기 모양 · theme: 보스전 배경
  // atk: 보스마다 다른 공격 (world.js bossAttack). 간격(초)은 체력 절반 아래에서 rage만큼 짧아진다
  const BOSSES = [
    { id: 'octa',  name: '옥타 코어',   color: '#ff2e88', glow: '255,46,136',  shape: 'octa',
      desc: '둥근 탄막 + 세 갈래 조준 + 졸개 부르기',
      theme: { base: '#0b0406', a: '#6b0a26', b: '#2a0712', grid: '255,70,120' } },
    { id: 'star',  name: '스타 크러셔', color: '#ffb703', glow: '255,183,3',   shape: 'star',
      desc: '팔에서 도는 소용돌이 탄 + 예고선 뒤 돌진',
      atk: { spiralGap: 0.22, arms: 4, spin: 1.5, spiralSpeed: 160, spiralOn: 3.5, spiralOff: 1.5,
             chargeCd: 5.5, chargeWarn: 0.8, chargeSpeed: 540, chargeTime: 0.6 },
      theme: { base: '#0b0803', a: '#6b4200', b: '#3a1a05', grid: '255,190,80' } },
    { id: 'hex',   name: '헥사 가디언', color: '#06d6a0', glow: '6,214,160',   shape: 'hex',
      desc: '도는 방패가 내 총알을 막음 + 여섯 방향 연발 + 사수 부르기',
      atk: { shieldR: 1.42, shieldBand: 0.25, shieldArc: 0.5, shieldSpin: 1.8,
             volleyCd: 1.8, volleySpeeds: [150, 190, 230], summonCd: 9 },
      theme: { base: '#03090a', a: '#0a5a48', b: '#06303a', grid: '90,255,200' } },
    { id: 'eye',   name: '보이드 아이', color: '#9b6bff', glow: '155,107,255', shape: 'eye',
      desc: '예고선 뒤 레이저 + 따라오는 구슬',
      atk: { laserCd: 3.8, laserWarn: 1.0, laserTrack: 0.6, laserOn: 0.55, laserW: 30, rageSplit: 0.38,
             orbCd: 2.2, orbs: 3, orbSpeed: 155, orbTurn: 2.1, orbHome: 3.5, keep: 300 },
      theme: { base: '#06040d', a: '#3a1a7a', b: '#1a0b3a', grid: '180,150,255' } },
    { id: 'saw',   name: '톱날 군주',   color: '#dfe7f2', glow: '210,225,255', shape: 'saw',
      desc: '벽에 튕기며 날아다님 + 휘어 도는 톱날 고리 + 돌격병 부르기',
      atk: { bounceSpeed: 150, rageSpeed: 215, ringCd: 2.6, ring: 10, ringSpeed: 160, curve: 0.9, summonCd: 8 },
      theme: { base: '#06070a', a: '#3a4458', b: '#1a1f2c', grid: '210,225,255' } },
  ];

  const IMPACT = {
    stop: { shooter: 0.03, splitter: 0.045, tank: 0.07, boss: 0.32 },
    hurtStop: 0.09,
    gap: 0.25,                 // 일반 적 멈춤 사이 최소 간격 (게임 시간)
    bossSlow: 1.4, slowRate: 0.3, // 보스 격파 후 느린 화면
    bossBooms: 7,              // 보스 격파 연쇄 폭발 수
  };

  const DROP = { healChance: 0.04, life: 10, pickR: 24, magnetR: 90 };

  // 카드. apply(p): 플레이어 상태를 바꾼다. max: 최대 선택 횟수
  const CARDS = [
    { id: 'barrel', icon: 'N+', name: '총열 추가', desc: '총열 +1. 부채꼴 탄막이 넓어진다', w: 6, max: 11,
      apply: p => { p.gun.barrels += 1; } },
    { id: 'rate', icon: '≫', name: '연사', desc: '연사 속도 +20%', w: 5, max: 8,
      apply: p => { p.gun.rate *= 1.2; } },
    { id: 'dmg', icon: '✦', name: '위력', desc: '탄 위력 ×1.25', w: 5, max: 10,
      apply: p => { p.gun.dmg *= 1.25; } },
    { id: 'velocity', icon: '➶', name: '고속탄', desc: '탄속 +20%, 사거리 +15%', w: 3, max: 5,
      apply: p => { p.gun.speed *= 1.2; p.gun.life *= 1.15; } },
    { id: 'pierce', icon: '⇉', name: '관통탄', desc: '적을 1마리 더 꿰뚫는다', w: 3, max: 5,
      apply: p => { p.gun.pierce += 1; } },
    { id: 'bounce', icon: '↯', name: '도탄', desc: '벽에서 1번 더 튕긴다', w: 3, max: 4,
      apply: p => { p.gun.bounce += 1; } },
    { id: 'size', icon: '●', name: '대구경', desc: '탄 크기 +30%, 위력 +10%', w: 3, max: 4,
      apply: p => { p.gun.size *= 1.3; p.gun.dmg *= 1.1; } },
    { id: 'crit', icon: '✚', name: '급소 조준', desc: '치명타 확률 +8%', w: 3, max: 5,
      apply: p => { p.gun.crit += 0.08; } },
    { id: 'move', icon: '»', name: '경량화', desc: '이동 속도 +12%', w: 3, max: 4,
      apply: p => { p.speed *= 1.12; } },
    { id: 'vital', icon: '♥', name: '강화 외골격', desc: '최대 체력 +1, 체력 전부 회복', w: 3, max: 5,
      apply: p => { p.maxHp += 1; p.hp = p.maxHp; } },
    { id: 'dash', icon: '⤳', name: '추진기', desc: '대시 쿨다운 -25%', w: 3, max: 3,
      apply: p => { p.dashCdMax *= 0.75; } },
    { id: 'drone', icon: '◎', name: '궤도 드론', desc: '주위를 도는 드론 +1', w: 3, max: 4,
      apply: p => { p.drones += 1; } },
    { id: 'vamp', icon: '❦', name: '흡혈', desc: '처치 시 4% 확률로 체력 +1', w: 2, max: 3,
      apply: p => { p.vamp += 0.04; } },
    { id: 'nova', icon: '✺', name: '충격파', desc: '대시가 끝날 때 주변을 폭발시킨다', w: 2, max: 3,
      apply: p => { p.nova += 1; } },
  ];

  // 고를 카드가 모자랄 때만 나오는 보충 카드
  const FALLBACK_CARD = { id: 'patch', icon: '+', name: '응급 수리', desc: '체력 2 회복', w: 0, max: Infinity,
    apply: p => { p.hp = Math.min(p.maxHp, p.hp + 2); } };

  // 필살기 "N-버스트": 적에게 준 피해로 게이지가 찬다. 가득 차면 버튼(PC: Q 또는 E)으로 발동.
  // 나를 중심으로 충격파가 화면 끝까지 퍼지며 닿는 적에게 큰 피해를 주고 적 탄을 지운다.
  // 게이지 단위는 "적 기본 체력만큼의 피해" (졸개 1마리 = 3). 웨이브가 올라 적이 단단해져도 차는 속도가 같다
  const ULT = {
    need: 90,        // 가득 차는 양 (대략 2~3웨이브에 한 번, 첫 보스 전에 한 번)
    bossRate: 0.35,  // 보스에게 준 피해는 덜 찬다 (보스전 연속 사용 방지)
    speed: 1500,     // 충격파가 퍼지는 속도 (px/초)
    sec: 4,          // 피해 = 지금 총의 4초치 화력 (총열·연사·위력 모두 반영)
    minMul: 20,      // 최소 피해 = 위력 × 20
                     // 위 피해에 웨이브 체력 배율을 곱한다 (웨이브가 올라도 일반 적을 쓸어 낸다)
    bossMul: 0.4,    // 보스는 피해 40%만 (보스 체력의 대략 5분의 1)
    bossCap: 0.25,   // 그래도 한 번에 보스 최대 체력의 25%까지만 (총이 커진 뒤 보스를 한 방에 지우지 않게. 봇 실측: 상한 전엔 쉬움 보스 절반 이상이 한 방)
    iframe: 0.9,     // 발동하면 잠깐 무적
    stop: 0.14,      // 발동 순간 화면 멈춤
    spokes: 3,       // 충격파에 그리는 빛줄기 수 = 총열 N × 3
  };

  const DRONE = { radius: 46, spin: 2.6, r: 7, dmgMul: 1.5, hitGap: 0.25 };
  const NOVA = { radius: 95, dmgMul: 5 };

  // 연속 처치 콤보: 앞 처치 뒤 window초 안에 또 잡으면 이어진다.
  // 점수 배율 = 1 + min(maxBonus, floor(콤보 / per) × bonus). 5콤보 ×1.1 … 50콤보 ×2
  const COMBO = {
    window: 1.6,       // 이 시간 안에 다음 처치가 없으면 끊김 (초, 게임 시간)
    per: 5, bonus: 0.1, maxBonus: 1.0,
    show: 3,           // HUD에 "x3 COMBO"를 띄우기 시작하는 수
    marks: [10, 25, 50, 100], // 이 수를 넘길 때 소리
    breakOnHurt: true, // 맞으면 끊김
  };
  const comboMul = n => 1 + Math.min(COMBO.maxBonus, Math.floor(n / COMBO.per) * COMBO.bonus);

  // 메달. tier: 1 동 · 2 은 · 3 금. icon: 메달 가운데 짧은 글자.
  // check(r, L): r = 이번 판 기록(records.js runOf), L = 이번 판까지 더한 평생 기록.
  // 판 도중에도 검사하므로 r은 "지금까지"다 (게임 오버 뒤 한 번 더 검사)
  const MEDALS = [
    { id: 'boss1',   tier: 1, icon: 'B',   name: '첫 보스 격파',   desc: '보스를 처음으로 쓰러뜨린다',            check: (r, L) => L.bosses >= 1 },
    { id: 'boss3',   tier: 3, icon: 'B3',  name: '보스 사냥꾼',    desc: '한 판에 보스 3마리 격파',               check: r => r.bossKills >= 3 },
    { id: 'ultBoss', tier: 2, icon: 'N!',  name: '마무리 일격',    desc: 'N-버스트로 보스의 숨통을 끊는다',       check: r => r.ultBoss >= 1 },
    { id: 'n3',      tier: 1, icon: 'N3',  name: '세 갈래',        desc: '한 판에 총열 N 3',                      check: r => r.maxN >= 3 },
    { id: 'n5',      tier: 2, icon: 'N5',  name: '다섯 갈래',      desc: '한 판에 총열 N 5',                      check: r => r.maxN >= 5 },
    { id: 'n8',      tier: 3, icon: 'N8',  name: '여덟 갈래',      desc: '한 판에 총열 N 8',                      check: r => r.maxN >= 8 },
    { id: 'k100',    tier: 1, icon: '100', name: '백 처치',        desc: '한 판에 적 100마리',                    check: r => r.kills >= 100 },
    { id: 'k500',    tier: 2, icon: '500', name: '오백 처치',      desc: '한 판에 적 500마리',                    check: r => r.kills >= 500 },
    { id: 'c10',     tier: 1, icon: 'x10', name: '연쇄 반응',      desc: '10콤보',                                check: r => r.bestCombo >= 10 },
    { id: 'c25',     tier: 2, icon: 'x25', name: '폭주',           desc: '25콤보',                                check: r => r.bestCombo >= 25 },
    { id: 'c50',     tier: 3, icon: 'x50', name: '멈출 수 없다',   desc: '50콤보',                                check: r => r.bestCombo >= 50 },
    { id: 'ult3',    tier: 1, icon: 'Q3',  name: '필살 3연발',     desc: '한 판에 N-버스트 3번',                  check: r => r.ults >= 3 },
    { id: 'ultMass', tier: 2, icon: 'Q15', name: '한 방 청소',     desc: 'N-버스트 한 번에 적 15마리',            check: r => r.ultBest >= 15 },
    { id: 'clean',   tier: 3, icon: '0',   name: '무결점',         desc: '보스 웨이브를 한 대도 안 맞고 클리어',  check: r => r.cleanBoss >= 1 },
    { id: 'w10',     tier: 1, icon: '10',  name: '10웨이브',       desc: '아무 난이도로 10웨이브 도달',           check: r => r.wave >= 10 },
    { id: 'w10n',    tier: 2, icon: '10',  name: '보통 10웨이브',  desc: '보통 이상으로 10웨이브 도달',           check: r => r.wave >= 10 && r.diff !== 'easy' },
    { id: 'w15h',    tier: 3, icon: '15',  name: '어려움 15웨이브', desc: '어려움으로 15웨이브 도달',             check: r => r.wave >= 15 && r.diff === 'hard' },
    { id: 'pluto',   tier: 2, icon: '♥',   name: '태양계 끝까지', desc: '한 판에 명왕성까지 가기 (17웨이브)',     check: r => r.wave >= 17 },
    { id: 'games10', tier: 1, icon: '10판', name: '단골',          desc: '10판 플레이',                           check: (r, L) => L.games >= 10 },
  ];

  NG.DATA = { BOSSES, ULT, IMPACT, DIFFICULTY, METEOR, JOURNEY, PLANETS, PLANET_FOE, ADAPT, BLACKHOLE, PLAYER, GUN, ENEMIES, WAVE_POOL, WAVE, DROP, CARDS, FALLBACK_CARD, DRONE, NOVA, COMBO, comboMul, MEDALS };

  // ═══ 기체 · 상점 · 미션 · 아이템 (2026-09-26, 소유자: "캐릭터 고를 수 있게, 상점·미션·아이템") ═══
  // 기체. hp: 체력 더하기, speed·dashCd: 배율, gun: 총 바꾸기(barrels 더하기, rate·dmg·speed 배율, crit 더하기,
  // critMul·pierce 바꾸기), drones: 시작 드론, passive: 작은 특기 (world.js makePlayer가 읽는다)
  // price 0 = 처음부터 있음. shape: 그리기 모양 (render.js drawShip)
  const SHIPS = [
    { id: 'core', name: '코어', shape: 'circle', color: '#5ee7ff', glow: '94,231,255', price: 0,
      desc: '균형형. 회복 아이템이 1.5배 자주 나온다',
      hp: 0, speed: 1, dashCd: 1, gun: {}, drones: 0, passive: 'heal', healMul: 1.5 },
    { id: 'viper', name: '바이퍼', shape: 'tri', color: '#b6ff5c', glow: '182,255,92', price: 0,
      desc: '빠르고 대시가 자주, 연사 +10%. 체력 -1',
      hp: -1, speed: 1.18, dashCd: 0.7, gun: { rate: 1.1, dmg: 0.95 }, drones: 0 },
    { id: 'titan', name: '타이탄', shape: 'square', color: '#ff9f43', glow: '255,159,67', price: 600,
      desc: '체력 +3, 위력 ×1.3. 느리고 연사가 느리다. 맞은 뒤 무적 1.5배',
      hp: 3, speed: 0.86, dashCd: 1.25, gun: { rate: 0.8, dmg: 1.3 }, drones: 0, passive: 'armor', iframeMul: 1.5 },
    { id: 'lancer', name: '랜서', shape: 'diamond', color: '#b388ff', glow: '179,136,255', price: 800,
      desc: '한 발이 무겁다. 관통 +1, 치명타 10%·3.5배. 연사 느림',
      hp: 0, speed: 1, dashCd: 1, gun: { rate: 0.5, dmg: 1.7, speed: 1.35, crit: 0.05, critMul: 3.5, pierce: 1 }, drones: 0 },
    { id: 'hive', name: '하이브', shape: 'hex', color: '#3dff8b', glow: '61,255,139', price: 1000,
      desc: '드론 2개로 시작, 5웨이브에 1개 더. 총은 조금 약함',
      hp: 0, speed: 1, dashCd: 1, gun: { dmg: 0.95 }, drones: 2, passive: 'hive' },
    { id: 'nova', name: '노바', shape: 'star', color: '#ff5ec8', glow: '255,94,200', price: 1400,
      desc: '총열 2개로 시작, 필살기가 1.25배 빨리 찬다. 체력 -1, 위력 약함',
      hp: -1, speed: 1.05, dashCd: 1, gun: { barrels: 1, dmg: 0.75, rate: 0.9 }, drones: 0, passive: 'ult', ultMul: 1.25 },
  ];

  // 영구 강화 (5단계). per: 한 단계 효과. prices: 단계별 값 (1단계부터)
  const UPGRADES = [
    { id: 'hp',       icon: '♥', name: '체력',          desc: '최대 체력 +1',            per: 1,    prices: [150, 300, 500, 800, 1200] },
    { id: 'dmg',      icon: '✦', name: '공격력',        desc: '탄 위력 +6%',             per: 0.06, prices: [200, 400, 700, 1100, 1600] },
    { id: 'ultStart', icon: 'N', name: '필살기 시작',   desc: '필살기 게이지 12% 찬 채로 시작', per: 0.12, prices: [120, 250, 450, 700, 1000] },
    { id: 'coin',     icon: '¢', name: '코인 보너스',   desc: '판이 끝날 때 코인 +10%',   per: 0.1,  prices: [150, 300, 550, 900, 1400] },
    { id: 'magnet',   icon: '◉', name: '줍기 자석',     desc: '아이템을 끌어오는 범위 +25%', per: 0.25, prices: [100, 200, 350, 550, 800] },
  ];
  const UPGRADE_MAX = 5;

  // 시작 아이템: 판 시작 전에 사 두면 다음 판 한 번에 쓰고 사라진다. max: 쌓아 둘 수 있는 개수
  const START_ITEMS = [
    { id: 'shield',  icon: '◯', name: '방패',         desc: '처음 맞는 한 대를 막는다',   price: 80,  max: 3 },
    { id: 'barrel',  icon: 'N+', name: '총열 +1 시작', desc: '총열 하나를 더 달고 시작',   price: 150, max: 3 },
    { id: 'fullult', icon: 'Q',  name: '필살기 가득',  desc: '필살기 게이지가 가득 찬 채로 시작', price: 120, max: 3 },
  ];

  // 판이 끝날 때 받는 코인 = 점수 ÷ 40 + (웨이브-1) × 5 + 보스 × 40 + 주운 코인. 그 뒤 코인 보너스 강화만큼 더
  // (2026-09-27 난이도를 올리며 웨이브 코인 4 → 5: 판이 짧아져도 한 판에 받는 코인이 비슷하게)
  const COINS = { perScore: 40, perWave: 5, perBoss: 40 };

  // 게임 중 떨어지는 아이템 (일반 적 처치마다, 회복 다음에 한 번 굴림). chance: 처치당 확률
  // coin: value 코인, 보스는 bossCoins개를 흩뿌림 · heat: time초 동안 연사 mul배 · magnet: time초 동안 모든 아이템을 끌어옴
  // bomb: radius 안 적에게 필살기 피해의 dmgMul배(보스는 bossCap까지), 화면의 적 탄 모두 지움
  const ITEMS = {
    coin:   { name: '코인',  chance: 0.09,  value: 3, life: 8, color: '#ffd23f', bossCoins: 6 },
    shield: { name: '방패',  chance: 0.012, life: 10, color: '#5ee7ff' },
    heat:   { name: '과열',  chance: 0.015, life: 10, color: '#ff7a3d', time: 6, mul: 2 },
    magnet: { name: '자석',  chance: 0.012, life: 10, color: '#c77dff', time: 8, speed: 620 },
    bomb:   { name: '폭탄',  chance: 0.01,  life: 10, color: '#ff4d6d', radius: 260, dmgMul: 0.6, bossCap: 0.05 },
  };

  // 미션: 늘 3개. kind 'life' = 여러 판 누적, 'run' = 한 판 안에서. stat: 판 요약(shop.js runOf)의 칸 이름
  // ship: 그 기체로 할 때만 (가진 기체일 때만 나온다). 다 채우면 받기 버튼 → reward 코인, 새 미션으로 바뀜
  const MISSIONS = [
    { id: 'k300',   kind: 'life', stat: 'kills',     goal: 300,  reward: 120, text: '적 300마리 처치 (누적)' },
    { id: 'boss2',  kind: 'life', stat: 'bosses',    goal: 2,    reward: 150, text: '보스 2마리 격파 (누적)' },
    { id: 'ult5',   kind: 'life', stat: 'ults',      goal: 5,    reward: 100, text: '필살기 5번 쓰기 (누적)' },
    { id: 'dash40', kind: 'life', stat: 'dashes',    goal: 40,   reward: 80,  text: '대시 40번 (누적)' },
    { id: 'coin20', kind: 'life', stat: 'coinPicks', goal: 20,   reward: 80,  text: '코인 아이템 20개 줍기 (누적)' },
    { id: 'item8',  kind: 'life', stat: 'items',     goal: 8,    reward: 90,  text: '방패·과열·자석·폭탄 8개 줍기 (누적)' },
    { id: 'block3', kind: 'life', stat: 'blocks',    goal: 3,    reward: 100, text: '방패로 3번 막기 (누적)' },
    { id: 'bomb15', kind: 'life', stat: 'bombKills', goal: 15,   reward: 100, text: '폭탄으로 적 15마리 (누적)' },
    { id: 'games5', kind: 'life', stat: 'games',     goal: 5,    reward: 80,  text: '5판 플레이 (누적)' },
    { id: 'c20',    kind: 'run',  stat: 'bestCombo', goal: 20,   reward: 120, text: '한 판에 20콤보' },
    { id: 'w10',    kind: 'run',  stat: 'wave',      goal: 10,   reward: 200, text: '한 판에 웨이브 10 도달' },
    { id: 'clean3', kind: 'run',  stat: 'cleanWaves', goal: 3,   reward: 120, text: '한 판에 안 맞고 웨이브 3번 클리어' },
    { id: 'n4',     kind: 'run',  stat: 'maxN',      goal: 4,    reward: 150, text: '한 판에 총열 N 4' },
    { id: 's5000',  kind: 'run',  stat: 'score',     goal: 5000, reward: 150, text: '한 판에 5,000점' },
    { id: 't300',   kind: 'run',  stat: 'time',      goal: 300,  reward: 120, text: '한 판에 5분 버티기' },
    { id: 'viper6', kind: 'run',  stat: 'wave',      goal: 6,    reward: 130, text: '바이퍼로 웨이브 6 도달', ship: 'viper' },
    { id: 'titanB', kind: 'run',  stat: 'bossKills', goal: 1,    reward: 160, text: '타이탄으로 보스 격파', ship: 'titan' },
    { id: 'lancer8', kind: 'run', stat: 'wave',      goal: 8,    reward: 180, text: '랜서로 웨이브 8 도달', ship: 'lancer' },
  ];
  const MISSION_SLOTS = 3;

  // ═══ 깜짝 선물 상자 · 피버 타임 · 동료 우주선 (2026-09-27, 소유자 "추천대로") ═══
  // 셋 다 판을 어렵게 만들지 않는 "반가운 일"이다. 뽑기는 게임 규칙 난수(W.rand)와 따로 도는 난수(W.fun)를 써서
  // 적·카드·운석이 나오는 차례는 예전과 똑같다

  // 깜짝 선물 상자: 플레이 시간 gap초(사이 아무 값)마다 한 번, 반짝이는 선물 상자가 life초 동안 화면을 가로질러 둥실 떠 간다.
  // 총알 hits발(또는 닿기)로 열린다. 웨이브 시작 quiet초·보스 웨이브 bossQuiet초·블랙홀 웨이브 holeQuiet초 동안은 안 나오고
  // (보스 등장·블랙홀 시작 방해 안 함), 그때 차례가 오면 retry초 뒤 다시 본다. 웨이브 끝(적이 다 나오고 다 잡힘)에도 안 나온다
  // 선물(rewards, w 가중치): 코인 min~max(step 단위, 판 끝 코인에 더해짐) · 방패 · 드론 time초 · 필살기 가득 · 다음 판 시작 아이템 하나
  // 방패가 이미 있으면 방패, 필살기가 이미 가득이면 필살기는 뽑지 않는다. 시작 아이템 칸이 가득이면 판 끝에 itemFullCoins 코인으로
  const GIFT = {
    first: [45, 75], gap: [60, 100],
    quiet: 4, bossQuiet: 7, holeQuiet: 7, retry: 1.5,
    life: 8, r: 26, hits: 3, bob: 16, margin: 44, band: [0.22, 0.78],
    popup: 2.6,       // 가운데 위 "선물: 코인 25개!" 알림 (초)
    confetti: 42,     // 열릴 때 색종이 수
    rewards: [
      { id: 'coins',  w: 5, min: 15, max: 40, step: 5 },
      { id: 'shield', w: 2 },
      { id: 'drone',  w: 2, time: 20 },
      { id: 'ult',    w: 2 },
      { id: 'item',   w: 1.5 },
    ],
    itemFullCoins: 30,
  };

  // 피버 타임: 콤보가 fromCombo 이상인 처치마다 게이지 1 (보스는 bossAdd 더). need가 차면 time초 동안 FEVER:
  // 점수 scoreMul배 · 화면 가장자리 무지개 · 음악 빨라짐 · 반짝이는 총알 · 가운데 위 "FEVER!" (banner초).
  // 콤보가 끊겨 있는 동안은 게이지가 초당 idleDrain씩 조금 줄고, 피버가 끝나면 0부터 다시
  // 적·탄·체력은 그대로 (어려워지지 않는다). 움직임 줄이기 설정이면 깜빡임 없이 고정 테두리와 글자만
  // 원 그리기 봇(아이 흉내) 실측: 5분에 2~3번, 첫 피버는 1분 반 안팎 (PLAN.md 5.13)
  const FEVER = { need: 35, fromCombo: 2, bossAdd: 10, idleDrain: 0.25, time: 10, scoreMul: 2, banner: 1.6 };

  // 동료 우주선: firstWave 웨이브부터 2~3웨이브(every)마다 한 번, 웨이브 시작 delay초(사이 아무 값) 뒤 구조 캡슐이 가장자리에서
  // capSpeed로 화면을 가로질러 떠 온다 (capLife초 뒤 사라짐). 총알 capHits발(또는 닿기)로 열면 작은 동료 기체가 나와
  // time초 동안 내 옆(side px, 조준 뒤쪽)을 따라다니며 range 안의 가장 가까운 적에게 초당 rate발(위력 = 내 위력 × dmgMul)을 쏜다.
  // 끝나면 bye초 동안 손을 흔들고("고마워!") 떠난다. 동료·캡슐은 한 번에 하나뿐. 맞지 않고 적을 막지도 않는다
  const WINGMAN = {
    firstWave: 2, every: [2, 3], delay: [5, 12],
    capR: 22, capHits: 3, capSpeed: 70, capLife: 20,
    time: 25, bye: 2.2, rate: 3, dmgMul: 0.5, bulletSpeed: 480, range: 560, r: 10, side: 60, follow: 6,
  };

  Object.assign(NG.DATA, { SHIPS, UPGRADES, UPGRADE_MAX, START_ITEMS, COINS, ITEMS, MISSIONS, MISSION_SLOTS, GIFT, FEVER, WINGMAN });
})(NG);
