'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
(function (SN) {
  SN.DATA = {
    // 판 크기(칸). 가로 화면은 넓게, 세로 화면(폰)은 돌려서 쓴다
    BOARD: { land: [32, 20], port: [20, 32] },

    // 시작: 길이 4칸, 1초 숨 고르고 출발 (그 전에 방향을 넣으면 바로 출발)
    START: { len: 4, wait: 1.0 },

    // 속도(초당 칸 수): 한 칸 길어질 때마다 조금씩 빨라지고 상한에서 멈춘다
    SPEED: { base: 8, perGrow: 0.15, max: 15, stagePerGrow: 0.1 },

    // 먹이: 일반 10점 + 길이 10칸마다 2점 보너스. 5번째마다 황금 구슬(50점 + 같은 보너스)
    // goldLife: 황금 구슬은 이 시간(초) 안에 먹어야 한다. 지나면 보통 구슬로 식는다 (무한·스테이지만)
    FOOD: { points: 10, bonusPer: 10, bonus: 2, goldEvery: 5, goldPoints: 50, goldLife: 6 },

    // 콤보: 앞 구슬을 먹고 window초 안에 또 먹으면 이어진다. 배율 = 1 + (콤보-1)/step 의 정수 부분, 최대 max
    COMBO: { window: 3.2, step: 2, max: 4 },

    // 아이템(변수): 판에 가끔 하나씩 나타나 life초 뒤 사라진다. 먹으면 time초 동안 효과
    ITEM: {
      first: 6, gapMin: 9, gapMax: 15, life: 8,
      kinds: {
        slow:   { name: '느린 시계', time: 6, color: '#7fd3ff', glyph: '◷' },   // 속도 60%
        double: { name: '점수 두 배', time: 8, color: '#ffe66d', glyph: '×2' },  // 먹이 점수 ×2
        ghost:  { name: '유령',      time: 5, color: '#c7a6ff', glyph: '◌' },   // 벽·몸 통과 (벽은 반대편으로)
        cut:    { name: '가위',      time: 0, color: '#3dff8b', glyph: '✂', points: 30 },  // 꼬리 3분의 1 자르기
      },
      slowMul: 0.6,
    },

    // 스테이지: 레벨마다 벽 모양·포털 수·목표 구슬·속도가 다르다. 12를 넘으면 모양을 다시 돌며 더 빠르게
    LEVELS: [
      { name: '첫 걸음',     goal: 8,  speed: 7,    walls: 'none' },
      { name: '기둥 숲',     goal: 10, speed: 7.5,  walls: 'pillars' },
      { name: '가운데 벽',   goal: 10, speed: 8,    walls: 'bar', items: true },
      { name: '순간 이동',   goal: 12, speed: 8,    walls: 'none', portals: 1, items: true },
      { name: '십자로',      goal: 12, speed: 8.5,  walls: 'cross', items: true },
      { name: '네 개의 방',  goal: 14, speed: 9,    walls: 'rooms', items: true },
      { name: '줄무늬',      goal: 14, speed: 9,    walls: 'stripes', portals: 1, items: true },
      { name: '상자 속',     goal: 15, speed: 9.5,  walls: 'box', items: true },
      { name: '포털 미로',   goal: 16, speed: 10,   walls: 'pillars', portals: 2, items: true },
      { name: '나선',        goal: 16, speed: 10,   walls: 'spiral', items: true },
      { name: '요새',        goal: 18, speed: 10.5, walls: 'fort', portals: 1, items: true },
      { name: '마지막 관문', goal: 20, speed: 11,   walls: 'rooms', portals: 2, items: true },
    ],
    STAGE: { loopSpeed: 0.8, clearBonus: 50, clearTime: 1.6 },

    // 메달. check(run, rec): run = 이번 판 기록, rec = 평생 기록 (main.js가 판이 끝날 때·레벨을 깰 때 확인)
    // tier: 1 동 · 2 은 · 3 금
    MEDALS: [
      { id: 'gold1',    tier: 1, name: '황금 맛',       desc: '황금 구슬 먹기',                 check: r => r.golds >= 1 },
      { id: 'len20',    tier: 1, name: '쭉쭉 20',       desc: '한 판에 길이 20',                check: r => r.maxLen >= 20 },
      { id: 'len40',    tier: 2, name: '길쭉 40',       desc: '한 판에 길이 40',                check: r => r.maxLen >= 40 },
      { id: 'len80',    tier: 3, name: '거대 뱀 80',    desc: '한 판에 길이 80',                check: r => r.maxLen >= 80 },
      { id: 'combo5',   tier: 1, name: '연속 5',        desc: '콤보 5 이어 가기',               check: r => r.maxCombo >= 5 },
      { id: 'combo10',  tier: 2, name: '연속 10',       desc: '콤보 10 이어 가기',              check: r => r.maxCombo >= 10 },
      { id: 'lvl3',     tier: 1, name: '입문',          desc: '스테이지 레벨 3 깨기',           check: (r, R) => R.stage.max >= 3 },
      { id: 'lvl6',     tier: 2, name: '숙련',          desc: '스테이지 레벨 6 깨기',           check: (r, R) => R.stage.max >= 6 },
      { id: 'lvl12',    tier: 3, name: '정복자',        desc: '스테이지 레벨 12 깨기',          check: (r, R) => R.stage.max >= 12 },
      { id: 'power4',   tier: 2, name: '아이템 수집가', desc: '한 판에 아이템 네 가지 모두',   check: r => r.powerKinds >= 4 },
      { id: 'portal10', tier: 1, name: '포털 여행자',   desc: '한 판에 포털 10번',              check: r => r.portals >= 10 },
      { id: 'ghost3',   tier: 2, name: '벽 너머',       desc: '유령일 때 벽을 3번 통과',        check: r => r.wraps >= 3 },
      { id: 'score1k',  tier: 1, name: '천 점',         desc: '무한 모드 1,000점',              check: r => r.mode === 'endless' && r.score >= 1000 },
      { id: 'score3k',  tier: 3, name: '삼천 점',       desc: '무한 모드 3,000점',              check: r => r.mode === 'endless' && r.score >= 3000 },
      { id: 'games10',  tier: 1, name: '단골',          desc: '10판 하기',                      check: (r, R) => R.total.games >= 10 },
      { id: 'orbs500',  tier: 2, name: '구슬 500',      desc: '모두 합쳐 구슬 500개',           check: (r, R) => R.total.orbs >= 500 },
    ],

    // 빠르게 두 번 밀어도 잃지 않게 방향을 2개까지 줄 세운다
    TURN_QUEUE: 2,

    // 연출 (그리기 전용, 규칙에는 영향 없음)
    FX: { eatSparks: 12, goldSparks: 26, deathSparks: 36, maxParticles: 200, shake: 16, flash: 0.35 },

    // 밀기 판정: 짧은 변 길이의 3% 또는 18px 중 큰 값 이상 움직이면 방향 전환
    SWIPE: { min: 18, ratio: 0.03 },

    // 처음 몇 초 조작 안내를 보여 준다
    HINT_TIME: 4,
  };
})(SN);
