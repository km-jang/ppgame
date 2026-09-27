'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
// 단위: 거리 m, 시간 초, 줄(lane)은 0·1·2 (왼쪽부터)
(function (RN) {
  RN.DATA = {
    // 규칙은 1/120초 칸으로 돈다 (60·90·120Hz 화면에서 결과가 같게)
    TICK: 1 / 120,
    LANES: 3,

    // 앞쪽 이만큼(m)까지 물체를 미리 만들어 둔다 (지평선 끝). 뒤로 behind m 지나면 지운다
    VIEW: 90,
    GEN: { behind: 4, minGap: 14 },

    // 시작: 잠깐 READY 뒤 출발, 첫 줄은 firstRow m 앞
    START: { wait: 1.2, firstRow: 55 },

    // 쉬움 (처음 켰을 때 기본, 이 기기에 기억): 느리고 장애물이 드물다. 하트 3개, 움직이는 운석 없음
    // speed: 초당 m. base에서 시작해 초마다 accel씩 빨라지고 max에서 멈춘다
    // gap: 장애물 줄 사이 간격(초). rows: 줄 모양 가중치 (one 운석 하나 · two 운석 둘 · gate 레이저 문 ·
    //      mg 운석+문 · gg 문 둘 · mover 옆으로 미끄러지는 운석 · stars 별만)
    EASY: {
      hearts: 3,
      speed: { base: 13, accel: 0.08, max: 22 },
      gap: [1.6, 2.4],
      starLine: 0.75,
      rows: [{ k: 'one', w: 5 }, { k: 'two', w: 2 }, { k: 'gate', w: 2 }, { k: 'mg', w: 1 }, { k: 'stars', w: 2 }],
    },
    // 보통: 빠르고 촘촘하다. 하트 1개 (방패 아이템으로 한 번 버틴다), 움직이는 운석 있음
    NORMAL: {
      hearts: 1,
      speed: { base: 17, accel: 0.15, max: 32 },
      gap: [1.0, 1.6],
      starLine: 0.6,
      rows: [{ k: 'one', w: 3 }, { k: 'two', w: 3 }, { k: 'gate', w: 2 }, { k: 'mg', w: 2 }, { k: 'gg', w: 1 }, { k: 'mover', w: 3 }, { k: 'stars', w: 1 }],
    },

    // 우주선: 줄 바꾸기 속도(초당 줄), 점프 높이(m)·체공 시간(초), 착지 직전 점프 기억(초)
    // 부딪힘 판정: 옆으로 hitW 줄 안, 앞뒤로 hitZ m 안
    PLAYER: { laneSpeed: 8, jumpH: 1.7, jumpT: 0.62, buffer: 0.15, hitW: 0.55, hitZ: 0.9 },

    // 장애물: 운석은 너무 커서 점프로 못 넘는다. 레이저 문은 gateH m보다 높이 뛰면 지나간다
    // 움직이는 운석: moverAt m 앞까지 오면 옆 줄로 moverSpeed(초당 줄)만큼 미끄러진다
    OBST: { meteorR: 1.15, gateH: 0.6, moverAt: 40, moverSpeed: 1.6 },

    // 별: 하나에 value점. chainGap초 안에 이어 먹으면 소리가 한 계단씩 오른다
    STAR: { value: 10, chainGap: 0.55, lineN: 5, rainEvery: 0.1 },

    // 아이템: first초 뒤 처음, 그 뒤 gapMin~gapMax초마다 안전한 줄에 하나
    ITEM: {
      first: 8, gapMin: 11, gapMax: 17,
      kinds: {
        shield: { name: '방패',   color: '#5ee7ff', time: 0, w: 3 },   // 한 번 부딪혀도 괜찮다
        magnet: { name: '자석',   color: '#ff5fa8', time: 7, w: 3 },   // 모든 줄의 별을 끌어온다
        boost:  { name: '부스트', color: '#ffe66d', time: 4, w: 2 },   // 아주 빠르게, 부딪혀도 부순다, 별 비
      },
      magnetRange: 16, boostMul: 1.7,
    },

    // 부딪힌 뒤 깜빡이는 동안(초)은 또 부딪혀도 괜찮다. 방패가 깨졌을 때·부스트가 끝났을 때도 잠깐
    HIT: { inv: 1.8, shieldInv: 1.0, boostGrace: 1.0 },

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
      { id: 'normal',  tier: 2, name: '보통도 거뜬', desc: '보통으로 1,000m',              check: r => !r.easy && r.dist >= 1000 },
      { id: 'games10', tier: 1, name: '단골 조종사', desc: '10판 하기',                    check: (r, R) => R.total.games >= 10 },
      { id: 'stars1k', tier: 2, name: '별 부자',     desc: '모두 합쳐 별 1,000개',         check: (r, R) => R.total.stars >= 1000 },
    ],

    // 연출 (그리기 전용, 규칙에는 영향 없음)
    FX: { starSparks: 8, hitSparks: 34, smashSparks: 24, maxParticles: 160, shake: 18, flash: 0.35 },

    // 밀기 판정: 짧은 변 길이의 3% 또는 18px 중 큰 값 이상 움직이면 줄 바꾸기·점프
    SWIPE: { min: 18, ratio: 0.03 },

    // 처음 몇 초 조작 안내를 보여 준다
    HINT_TIME: 5,
  };
})(RN);
