'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
// 단위: 거리 m, 시간 초, 줄(lane)은 0·1·2 (왼쪽부터)
(function (RN) {
  // ─── 난이도 세 단계 (시작 화면에서 고르고 이 기기에 기억: runner.diff) ───
  // hearts: 하트 수 · inv: 부딪힌 뒤 깜빡이는(무적) 시간
  // speed: 초당 m. warm초 동안은 base 그대로(몸풀기), 그 뒤 ramp초에 걸쳐 max까지 부드럽게(처음·끝이 완만한 곡선) 오른다
  // gap: 장애물 줄 사이 간격(초). 몸풀기 끝에서 start, 다 빨라졌을 때 end (그 사이는 같은 곡선으로 옮겨 간다)
  // warmRows: 몸풀기 동안 줄 모양 · rows: 줄 모양 가중치, start에서 end로 옮겨 간다
  //   one 운석 하나 · two 운석 둘 · gate 레이저 문 · mg 운석+문 · gg 문 둘 · mover 옆으로 미끄러지는 운석 · stars 별만
  //   (레이저 문 비율 = gate·mg·gg, 움직이는 운석 비율 = mover)
  // starLine: 장애물 줄에 별 한 줄이 붙을 확률
  // item: first초 뒤 처음, 그 뒤 gap초마다 안전한 줄에 하나. w: 종류별 가중치 (heart 0이면 하트 아이템 없음)
  const DIFFICULTY = {
    easy: {
      id: 'easy', name: '쉬움', desc: '천천히 · 하트 3개',
      hearts: 3, inv: 2.4,
      speed: { base: 12, max: 20, warm: 20, ramp: 260 },
      gap: { start: [2.0, 2.7], end: [1.45, 2.0] },
      warmRows: [{ k: 'one', w: 5 }, { k: 'stars', w: 3 }],
      rows: {
        start: { one: 6, two: 1, gate: 2, mg: 0, gg: 0, mover: 0, stars: 3 },
        end:   { one: 4, two: 3, gate: 2, mg: 2, gg: 0, mover: 0, stars: 2 },
      },
      starLine: 0.85,
      item: { first: 7, gap: [9, 14], w: { shield: 3, magnet: 3, boost: 2, heart: 1.5 } },
    },
    normal: {
      id: 'normal', name: '보통', desc: '빠르게 · 하트 2개',
      hearts: 2, inv: 1.8,
      speed: { base: 16, max: 33, warm: 4, ramp: 90 },
      gap: { start: [1.3, 1.8], end: [0.8, 1.1] },
      rows: {
        start: { one: 4, two: 3, gate: 2, mg: 1, gg: 0, mover: 1, stars: 1 },
        end:   { one: 2, two: 4, gate: 1, mg: 3, gg: 1, mover: 4, stars: 1 },
      },
      starLine: 0.65,
      item: { first: 8, gap: [11, 17], w: { shield: 3, magnet: 3, boost: 2, heart: 0.8 } },
    },
    hard: {
      id: 'hard', name: '어려움', desc: '아주 빠르게 · 하트 1개',
      hearts: 1, inv: 1.4,
      speed: { base: 20, max: 38, warm: 0, ramp: 80 },
      gap: { start: [1.0, 1.4], end: [0.72, 1.0] },
      rows: {
        start: { one: 3, two: 3, gate: 2, mg: 2, gg: 1, mover: 2, stars: 1 },
        end:   { one: 2, two: 4, gate: 1, mg: 3, gg: 2, mover: 4, stars: 1 },
      },
      starLine: 0.55,
      item: { first: 9, gap: [12, 18], w: { shield: 4, magnet: 2, boost: 2, heart: 0 } },
    },
  };
  const DIFF_ORDER = ['easy', 'normal', 'hard'];

  // ─── 우주 구역: 달린 거리(m)에 따라 하늘·행성·길 색이 바뀐다 (그리기 색은 render.js ZONE_ART) ───
  const ZONES = [
    { at: 0,    id: 'dusk',   name: '노을 우주' },
    { at: 500,  id: 'ice',    name: '얼음 행성' },
    { at: 1250, id: 'nebula', name: '초록 성운' },
    { at: 2000, id: 'core',   name: '은하 중심' },
  ];

  RN.DATA = {
    // 규칙은 1/120초 칸으로 돈다 (60·90·120Hz 화면에서 결과가 같게)
    TICK: 1 / 120,
    LANES: 3,

    DIFFICULTY, DIFF_ORDER, ZONES,

    // 앞쪽 이만큼(m)까지 물체를 미리 만들어 둔다 (지평선 끝). 뒤로 behind m 지나면 지운다
    VIEW: 90,
    GEN: { behind: 4, minGap: 14 },

    // 시작: 잠깐 READY 뒤 출발, 첫 줄은 firstRow m 앞
    START: { wait: 1.2, firstRow: 55 },

    // 옛 이름 (쉬움·보통 두 단계였을 때). 읽기 전용으로 남겨 둔다
    get EASY() { return DIFFICULTY.easy; },
    get NORMAL() { return DIFFICULTY.normal; },

    // 우주선: 줄 바꾸기 시간(laneT초, 처음 빠르고 끝이 부드러운 곡선), 점프 높이(m)·체공 시간(초),
    // 착지 직전 점프 기억(초). 점프는 빨리 오르고 꼭대기에서 잠깐 머문다(arc: 1보다 작을수록 둥실)
    // 부딪힘 판정: 옆으로 hitW 줄 안, 앞뒤로 hitZ m 안
    PLAYER: { laneT: 0.17, jumpH: 1.7, jumpT: 0.6, arc: 0.6, buffer: 0.15, hitW: 0.55, hitZ: 0.9 },

    // 장애물: 운석은 너무 커서 점프로 못 넘는다. 레이저 문은 gateH m보다 높이 뛰면 지나간다
    // 움직이는 운석: moverAt m 앞까지 오면 옆 줄로 moverSpeed(초당 줄)만큼 미끄러진다
    OBST: { meteorR: 1.15, gateH: 0.6, moverAt: 40, moverSpeed: 1.6 },

    // 별: 하나에 value점. chainGap초 안에 이어 먹으면 소리가 한 계단씩 오른다
    // 한 줄을 모두 먹으면 "완벽!" perfect점
    STAR: { value: 10, chainGap: 0.55, lineN: 5, rainEvery: 0.1, perfect: 20 },

    // 기념 아치: every m마다 거리 숫자가 적힌 빛나는 문을 지나간다 (bonus점)
    MILESTONE: { every: 250, bonus: 50 },

    // 아슬아슬: 운석·레이저 문이 있던 줄에서 window초 안에 옆 줄로 비켜 지나가면 bonus점.
    // 위험하게 기다릴수록 이득이 되지 않게 점수는 작고, cool초에 한 번만
    NEAR: { window: 0.7, bonus: 5, cool: 1.2, side: 1.3 },

    // 아이템 모양·효과 (나오는 빈도는 난이도의 item)
    ITEM: {
      kinds: {
        shield: { name: '방패',   color: '#5ee7ff', time: 0 },   // 한 번 부딪혀도 괜찮다
        magnet: { name: '자석',   color: '#ff5fa8', time: 7 },   // 모든 줄의 별을 끌어온다
        boost:  { name: '부스트', color: '#ffe66d', time: 4 },   // 아주 빠르게, 부딪혀도 부순다, 별 비
        heart:  { name: '하트',   color: '#ff6b8a', time: 0 },   // 하트 하나 채우기 (가득이면 안 나온다)
      },
      magnetRange: 16, boostMul: 1.7,
    },

    // 방패가 깨졌을 때·부스트가 끝났을 때·불사조가 다시 살아났을 때 잠깐 깜빡이는 시간 (부딪힌 뒤 시간은 난이도의 inv)
    HIT: { shieldInv: 1.0, boostGrace: 1.0, revive: 2.5, get inv() { return DIFFICULTY.easy.inv; } },

    // 처음 한 번만 나오는 안내: 옆으로 밀기 → 레이저 문이 오면 위로 밀기 (그동안 slow배로 느려진다).
    // 안내용 레이저 문은 세 줄 모두 막지만 부딪혀도 하트를 잃지 않는다. tries번 놓치면 안내를 마친다
    TUTORIAL: { slow: 0.5, showSec: 2.4, tries: 3, laneSec: 2.5 },

    // 메달. check(run, rec): run = 이번 판 기록, rec = 평생 기록 (main.js가 판이 끝날 때·게임 중에 확인)
    // tier: 1 동 · 2 은 · 3 금
    MEDALS: [
      { id: 'd500',    tier: 1, name: '첫 비행',     desc: '한 판에 500m',                 check: r => r.dist >= 500 },
      { id: 'd1500',   tier: 2, name: '먼 우주',     desc: '한 판에 1,500m',               check: r => r.dist >= 1500 },
      { id: 'd3000',   tier: 3, name: '은하 끝까지', desc: '한 판에 3,000m',               check: r => r.dist >= 3000 },
      { id: 's50',     tier: 1, name: '별 50',       desc: '한 판에 별 50개',              check: r => r.stars >= 50 },
      { id: 's150',    tier: 2, name: '별 150',      desc: '한 판에 별 150개',             check: r => r.stars >= 150 },
      { id: 'gate10',  tier: 1, name: '폴짝폴짝',    desc: '한 판에 레이저 문 10번 넘기',  check: r => r.gates >= 10 },
      { id: 'shield',  tier: 1, name: '튼튼 방패',   desc: '방패로 운석 막기',             check: r => r.blocks >= 1 },
      { id: 'boost3',  tier: 2, name: '슝슝슝',      desc: '한 판에 부스트 3번',           check: r => r.boosts >= 3 },
      { id: 'clean',   tier: 3, name: '무사고 비행', desc: '안 부딪히고 1,000m',           check: r => r.hits === 0 && r.blocks === 0 && r.dist >= 1000 },
      { id: 'normal',  tier: 2, name: '보통도 거뜬', desc: '보통이나 어려움으로 1,000m',   check: r => r.diff !== 'easy' && r.dist >= 1000 },
      { id: 'hard',    tier: 3, name: '어려움 정복', desc: '어려움으로 1,000m',            check: r => r.diff === 'hard' && r.dist >= 1000 },
      { id: 'nebula',  tier: 2, name: '성운 탐험가', desc: '한 판에 초록 성운 도착',       check: r => r.zone >= 2 },
      { id: 'near10',  tier: 1, name: '아슬아슬',    desc: '한 판에 아슬아슬 10번',        check: r => r.nears >= 10 },
      { id: 'perfect5', tier: 1, name: '완벽한 별길', desc: '한 판에 별 한 줄 다 먹기 5번', check: r => r.perfects >= 5 },
      { id: 'games10', tier: 1, name: '단골 조종사', desc: '10판 하기',                    check: (r, R) => R.total.games >= 10 },
      { id: 'stars1k', tier: 2, name: '별 부자',     desc: '모두 합쳐 별 1,000개',         check: (r, R) => R.total.stars >= 1000 },
    ],

    // 연출 (그리기 전용, 규칙에는 영향 없음). 부딪힘은 분명하지만 무섭지 않게: 흔들림·번쩍임은 작게
    FX: { starSparks: 8, hitSparks: 26, smashSparks: 24, maxParticles: 160, shake: 10, flash: 0.22, zoneFade: 2.2, banner: 2.6 },

    // 밀기 판정: 짧은 변 길이의 3% 또는 18px 중 큰 값 이상 움직이면 줄 바꾸기·점프
    SWIPE: { min: 18, ratio: 0.03 },

    // 처음 몇 초 조작 안내를 보여 준다 (처음 한 번 나오는 안내가 끝난 뒤의 판에서)
    HINT_TIME: 5,
  };
})(RN);

// ═══ 상점 · 미션 (2026-09-27, 소유자: "미션·상점·기록을 모든 게임에", 코인은 네 게임이 함께 쓰는 지갑) ═══
(function (RN) {
  // 캐릭터 5종 (2026-09-27, 소유자: "각 게임마다 캐릭터를 고를 수 있게 5종, 다양하게").
  // 모양이 확 다르고, 작은 특기가 하나씩 있다. 특기는 돕기만 하고 손해는 없다 (서로 다른 쪽을 도와서 어느 하나가 다 낫지 않게).
  // 그리기: render.js drawCharBody (shape). 특기 숫자: trait (world.js create가 읽는다)
  //   perfectMul: 완벽한 별길 보너스 배율 · magnet: 자석 시간 +초 · magnetRange: 자석이 끌어오는 거리(m)
  //   heart: 하트 +개 (쉬움·보통) · hardShield: 어려움에서는 방패를 두르고 출발
  //   laneT: 줄 바꾸기 시간(초, 작을수록 빠름) · nearMul: 아슬아슬 보너스 배율
  //   boost: 부스트 시간 +초 · revive: 한 판에 이만큼 다시 살아난다
  // body: [밝은 곳, 가운데, 어두운 곳] · accent: 무늬 색 · flame: 엔진 불꽃·몸 밑 빛 (r,g,b) · core: 조종석 빛 · ui: 상점 카드 색
  const CHARS = [
    { id: 'jet', name: '슝슝 제트', price: 0, shape: 'jet', ui: '#5ee7ff',
      body: ['#d9fbff', '#5ee7ff', '#1a9ec0'], accent: '#ff2e88', flame: '255,46,136', core: '#5ee7ff',
      look: '청록 날개, 분홍 불꽃', desc: '균형형: 별 한 줄 다 먹기 보너스 1.5배',
      trait: { perfectMul: 1.5 } },
    { id: 'ufo', name: '비행접시', price: 300, shape: 'ufo', ui: '#b6ff5c',
      body: ['#ffffff', '#c9d3e6', '#56607a'], accent: '#b6ff5c', flame: '182,255,92', core: '#b6ff5c',
      look: '둥근 접시, 연두 유리 지붕, 도는 불빛', desc: '자석이 3초 더 오래, 더 멀리서 별을 끌어와요',
      trait: { magnet: 3, magnetRange: 24 } },
    { id: 'whale', name: '우주 고래', price: 500, shape: 'whale', ui: '#7aa6ff',
      body: ['#e0ecff', '#5b8cff', '#2a3fa8'], accent: '#bff8ff', flame: '120,220,255', core: '#bff8ff',
      look: '꼬리를 흔드는 파란 고래, 물빛 반짝이', desc: '하트 +1 (어려움에서는 방패를 두르고 출발)',
      trait: { heart: 1, hardShield: true } },
    { id: 'fox', name: '번개 여우', price: 800, shape: 'fox', ui: '#ff9a3d',
      body: ['#ffe6cc', '#ff8a2a', '#a8420c'], accent: '#ffe66d', flame: '255,236,140', core: '#ffe66d',
      look: '귀 날개가 쫑긋한 주황 여우', desc: '줄 바꾸기가 빨라요, 아슬아슬 보너스 2배',
      trait: { laneT: 0.13, nearMul: 2 } },
    { id: 'phoenix', name: '불사조', price: 1200, shape: 'phoenix', ui: '#ff5a7a',
      body: ['#fff0c0', '#ff4f6a', '#8a0f3c'], accent: '#ffd24a', flame: '255,150,40', core: '#ffe66d',
      look: '불꽃 날개를 펄럭이는 새', desc: '부스트 1.5초 더, 한 판에 한 번 다시 살아나요',
      trait: { boost: 1.5, revive: 1 } },
  ];
  // 옛 꾸미기(모양만 달랐던 우주선 6종)를 가진 저장본 옮기기: to = 이 캐릭터를 준다, refund = 값을 한 번 돌려준다
  const OLD_SKINS = {
    basic: { to: 'jet' }, bolt: { to: 'fox' }, whale: { to: 'whale' }, phoenix: { to: 'phoenix' },
    comet: { refund: 500 }, gold: { refund: 1200 },
  };

  // 강화 (5단계). per: 한 단계 효과. prices: 단계별 값 (1단계부터). world.js create(opts.up)가 읽는다
  const UPGRADES = [
    { id: 'magnet', icon: 'magnet', name: '자석 시간',   desc: '자석이 1초 더 오래',                 per: 1,    prices: [100, 200, 350, 550, 800] },
    { id: 'shield', icon: 'shield', name: '방패 여유',   desc: '방패가 막은 뒤 깜빡이는 시간 +0.4초', per: 0.4,  prices: [100, 200, 350, 550, 800] },
    { id: 'boost',  icon: 'boost',  name: '부스트 시간', desc: '부스트가 0.6초 더 오래',             per: 0.6,  prices: [120, 250, 450, 700, 1000] },
    { id: 'coin',   icon: 'star',   name: '별 코인 보너스', desc: '판이 끝날 때 코인 +10%',          per: 0.1,  prices: [150, 300, 550, 900, 1200] },
  ];
  const UPGRADE_MAX = 5;

  // 시작 아이템: 사 두면 다음 판 시작할 때 하나씩 자동으로 쓴다. max: 쌓아 둘 수 있는 개수
  // give: 판에 주는 것 (world.js create opts.loadout의 칸). 하트는 하트가 하나뿐인 어려움에서는 쓰지 않고 남겨 둔다
  const START_ITEMS = [
    { id: 'sshield', give: 'shield', icon: 'shield', name: '방패 출발',   desc: '방패를 두르고 출발',     price: 80,  max: 3 },
    { id: 'sboost',  give: 'boost',  icon: 'boost',  name: '부스트 출발', desc: '출발하자마자 부스트',     price: 120, max: 3 },
    { id: 'sheart',  give: 'heart',  icon: 'heart',  name: '하트 +1',     desc: '하트 하나 더 (쉬움·보통)', price: 100, max: 3, not: ['hard'] },
  ];

  // 판이 끝날 때 받는 코인 = 거리 ÷ perDist + 별 ÷ perStar + 기념 아치 × perArch + 새 구역 × perZone,
  // 난이도 배율(diffMul)을 곱하고, 그 뒤 별 코인 보너스 강화만큼 더. 보통 한 판(500~1,000m) 20~60개
  const COINS = { perDist: 40, perStar: 4, perArch: 2, perZone: 10, diffMul: { easy: 1, normal: 1.2, hard: 1.5 } };

  // 미션: 늘 3개. kind 'life' = 여러 판 누적, 'run' = 한 판 안에서. stat: 판 요약(shop.js runOf)의 칸 이름
  const MISSIONS = [
    { id: 'st300',  kind: 'life', stat: 'stars',    goal: 300,  reward: 100, text: '별 300개 모으기 (누적)' },
    { id: 'gt30',   kind: 'life', stat: 'gates',    goal: 30,   reward: 100, text: '레이저 문 30번 넘기 (누적)' },
    { id: 'd5k',    kind: 'life', stat: 'dist',     goal: 5000, reward: 120, text: '모두 5,000m 달리기 (누적)' },
    { id: 'it15',   kind: 'life', stat: 'items',    goal: 15,   reward: 90,  text: '아이템 15개 줍기 (누적)' },
    { id: 'nm15',   kind: 'life', stat: 'nears',    goal: 15,   reward: 90,  text: '아슬아슬 15번 (누적)' },
    { id: 'pf10',   kind: 'life', stat: 'perfects', goal: 10,   reward: 100, text: '별 한 줄 다 먹기 10번 (누적)' },
    { id: 'bs5',    kind: 'life', stat: 'boosts',   goal: 5,    reward: 80,  text: '부스트 5번 (누적)' },
    { id: 'g5',     kind: 'life', stat: 'games',    goal: 5,    reward: 60,  text: '5판 하기 (누적)' },
    { id: 'r1000',  kind: 'run',  stat: 'dist',     goal: 1000, reward: 120, text: '한 판에 1,000m' },
    { id: 'rs80',   kind: 'run',  stat: 'stars',    goal: 80,   reward: 120, text: '한 판에 별 80개' },
    { id: 'rg8',    kind: 'run',  stat: 'gates',    goal: 8,    reward: 100, text: '한 판에 레이저 문 8번' },
    { id: 'rice',   kind: 'run',  stat: 'zone',     goal: 1,    reward: 90,  text: '한 판에 얼음 행성 도착' },
    { id: 'rneb',   kind: 'run',  stat: 'zone',     goal: 2,    reward: 180, text: '한 판에 초록 성운 도착' },
    { id: 'rclean', kind: 'run',  stat: 'clean',    goal: 600,  reward: 150, text: '한 판에 안 부딪히고 600m' },
    { id: 'rnm5',   kind: 'run',  stat: 'nears',    goal: 5,    reward: 100, text: '한 판에 아슬아슬 5번' },
  ];
  const MISSION_SLOTS = 3;

  Object.assign(RN.DATA, { CHARS, OLD_SKINS, SKINS: CHARS, UPGRADES, UPGRADE_MAX, START_ITEMS, COINS, MISSIONS, MISSION_SLOTS });
})(RN);
