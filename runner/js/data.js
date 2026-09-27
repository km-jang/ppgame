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

    // 방패가 깨졌을 때·부스트가 끝났을 때 잠깐 깜빡이는 시간 (부딪힌 뒤 시간은 난이도의 inv)
    HIT: { shieldInv: 1.0, boostGrace: 1.0, get inv() { return DIFFICULTY.easy.inv; } },

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
