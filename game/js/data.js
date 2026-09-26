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
    boss:     { name: '보스',   r: 58, hp: 320, speed: 42,  score: 1000, color: '#ff2e88', shape: 'octa',
                ringCd: 3.0, ringCount: 14, ringSpeed: 170,
                aimCd: 1.4, aimSpeed: 240, summonCd: 6.5 },
  };

  // from: 등장 웨이브, w: 등장 가중치
  const WAVE_POOL = [
    { type: 'grunt',    from: 1, w: 10 },
    { type: 'runner',   from: 2, w: 5 },
    { type: 'shooter',  from: 3, w: 3 },
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
  const DIFFICULTY = {
    easy:   { id: 'easy',   name: '쉬움',   hp: 8, enemyHp: 0.6,  enemySpeed: 0.8,  count: 0.75, bulletSpeed: 0.75, fireRate: 0.7,  score: 0.6 },
    normal: { id: 'normal', name: '보통',   hp: 5, enemyHp: 1,    enemySpeed: 1,    count: 1,    bulletSpeed: 1,    fireRate: 1,    score: 1 },
    hard:   { id: 'hard',   name: '어려움', hp: 4, enemyHp: 1.5,  enemySpeed: 1.2,  count: 1.3,  bulletSpeed: 1.2,  fireRate: 1.35, score: 1.6 },
  };

  // 타격감: 큰 적을 잡는 순간 화면을 아주 잠깐 멈춘다 (초). 연달아 걸리지 않게 간격을 둔다
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
    { id: 'barrel', icon: 'N+', name: '총열 추가', desc: '총열 +1. 부채꼴 탄막이 넓어진다', w: 2, max: 11,
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
    { id: 'games10', tier: 1, icon: '10판', name: '단골',          desc: '10판 플레이',                           check: (r, L) => L.games >= 10 },
  ];

  NG.DATA = { ULT, IMPACT, DIFFICULTY, PLAYER, GUN, ENEMIES, WAVE_POOL, WAVE, DROP, CARDS, FALLBACK_CARD, DRONE, NOVA, COMBO, comboMul, MEDALS };
})(NG);
