'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
// 길이 단위는 "점" (놀이 기둥 가로 폭 = 400점). 높이는 위로 갈수록 커진다.
(function (JP) {
  JP.DATA = {
    // 놀이 기둥 가로 폭. 화면이 달라도 이 폭을 기둥 너비에 맞춰 늘린다
    WORLD: { w: 400 },
    // 1m = 50점 (보통 한 번 튀면 4m 오른다)
    METER: 50,

    // 물리는 1/120초 칸으로 쪼개 돈다 (60·90·120Hz 화면 모두 같은 결과)
    STEP: 1 / 120,

    // 주인공: 반지름, 중력, 한 번 튀는 높이, 좌우 최고 속도·가속·멈춤
    PLAYER: { r: 20, gravity: 1900, jump: 200, maxVx: 430, accel: 3400, decel: 2800 },

    // 카메라: 주인공이 화면 아래에서 focus 비율 높이에 오도록 따라 올라간다 (내려가지는 않는다).
    // ease: 따라가는 부드러움 (1초에 남은 거리의 몇 배), lead: 주인공이 focus보다 이만큼(화면 비율) 위로는 못 간다
    CAM: { focus: 0.42, start: 0.12, ease: 9, lead: 0.2 },

    // 발판 모양 (크기는 난이도 표 DIFFICULTY의 w)
    PLAT: { h: 16 },
    // 스프링: 아주 높이 튄다
    SPRING: { jump: 560 },
    // 구름 발판: on초 보였다가 off초 사라지기를 되풀이 (사라진 동안은 빠져나간다)
    CLOUD: { on: 2.4, off: 1.5, fade: 0.4 },
    // 부서지는 발판: 한 번 튀면 부서져 떨어진다 (fall초 동안 조각 연출)
    CRUMBLE: { fall: 0.6 },

    // ─── 난이도 (쉬움 · 보통 · 어려움) ─────────────────────────
    // 높이가 오를수록 어려워진다. warm(m)까지는 몸풀기, full(m)에서 가장 어렵다 (그 사이는 부드럽게 이어진다).
    //   warmGap·warmW : 몸풀기 구간 발판 간격 [최소, 최대]·폭. 몸풀기에는 스프링 말고 특별한 발판이 없다
    //   gap : 발판 사이 높이 간격 [처음 최소, 처음 최대, 끝 최소, 끝 최대]. 한 번 튀는 높이(200)의 0.9배보다 늘 작게
    //   w   : 발판 폭 [처음, 끝]
    //   main: 길을 이루는 발판 종류 가중치 [처음, 끝] · extra: 곁 발판 종류 가중치 · extraChance: 곁 발판이 나올 확률 [처음, 끝]
    //   moveSpeed: 움직이는 발판 속도 [처음, 끝] (점/초)
    //   mine: 가시 폭탄 {from: 처음 나오는 높이(m), chance: 줄마다 나올 확률 [처음, 끝]}. null이면 없음
    //   rescues: 떨어지면 받아 주는 구조 구름 수 · itemGap: 아이템 사이 높이(m) [최소, 최대]
    //   ctl: 좌우 움직임 {maxVx 최고 속도, accel 붙는 힘, decel 멈추는 힘}
    DIFFICULTY: {
      easy: {
        id: 'easy', name: '쉬움', hint: '구조 구름 3번 · 폭탄 없음',
        warm: 30, full: 700, warmGap: [44, 66], warmW: 136,
        gap: [50, 78, 80, 124], w: [120, 102],
        main:  { normal: [80, 42], moving: [5, 22], crumble: [3, 14], spring: [9, 9] },
        extraChance: [0.55, 0.35],
        extra: { normal: [70, 35], cloud: [18, 38], crumble: [12, 27] },
        moveSpeed: [35, 85],
        mine: null,
        rescues: 3, itemGap: [40, 70],
        ctl: { maxVx: 400, accel: 2900, decel: 3000 },
      },
      normal: {
        id: 'normal', name: '보통', hint: '가시 폭탄 · 떨어지면 끝',
        warm: 15, full: 550, warmGap: [52, 82], warmW: 104,
        gap: [58, 96, 108, 160], w: [90, 78],
        main:  { normal: [72, 28], moving: [8, 30], crumble: [4, 22], spring: [7, 8] },
        extraChance: [0.45, 0.2],
        extra: { normal: [60, 20], cloud: [25, 50], crumble: [15, 30] },
        moveSpeed: [50, 145],
        mine: { from: 45, chance: [0.06, 0.34] },
        rescues: 0, itemGap: [55, 95],
        ctl: { maxVx: 430, accel: 3400, decel: 2800 },
      },
      hard: {
        id: 'hard', name: '어려움', hint: '좁고 빠른 발판 · 폭탄 일찍',
        warm: 5, full: 320, warmGap: [66, 100], warmW: 86,
        gap: [72, 118, 128, 172], w: [78, 66],
        main:  { normal: [52, 18], moving: [16, 34], crumble: [12, 28], spring: [6, 7] },
        extraChance: [0.32, 0.14],
        extra: { normal: [45, 15], cloud: [30, 50], crumble: [25, 35] },
        moveSpeed: [85, 175],
        mine: { from: 15, chance: [0.14, 0.42] },
        rescues: 0, itemGap: [70, 120],
        ctl: { maxVx: 470, accel: 3700, decel: 3100 },
      },
    },
    DIFF_ORDER: ['easy', 'normal', 'hard'],

    // 별: 줄마다 나올 확률, 점수, 가끔 세로로 줄지어 여러 개
    STAR: { chance: 0.4, points: 10, r: 14, lineChance: 0.15, line: 4 },

    // 아이템: 처음 나오는 높이(m) (다음까지 간격은 난이도 itemGap). 이름표를 달고 나타난다
    ITEM: {
      first: 25, r: 18,
      kinds: {
        rocket: { name: '로켓', color: '#ff9f43', w: 1 },        // 잠깐 쭉 날아오른다
        shield: { name: '방패 방울', color: '#7fd3ff', w: 1 },   // 한 번 지켜 준다 (가시 폭탄·떨어짐)
      },
    },
    ROCKET: { time: 2.2, speed: 1300, after: 700 },

    // 가시 폭탄 (보통·어려움): 크기, 발판에서 가로로 떨어뜨리는 거리. 나오는 높이·확률은 난이도 mine
    MINE: { r: 15, clear: 105 },

    // 구조 구름·방패 방울이 던져 올리는 높이 (화면 높이 배율, 상한 520점)
    RESCUE: { jump: 0.75, max: 520 },

    // ─── 높이 구역 ─────────────────────────────────────────────
    // 오를수록 배경이 바뀐다 (from m부터). mix: 발판·별 섞임을 살짝 바꾼다 (가중치 배율 · 별 확률 더하기)
    // sky/glow/far: 그리기 색 (render.js가 구역마다 미리 그려 둔다), stars: 배경 별 밝기 0 ~ 1, clouds: 구름 층 진하기 0 ~ 1
    ZONES: [
      { id: 'sky',   name: '하늘',    from: 0,   color: '#ffb36b', banner: '',
        sky: ['#1b2a5c', '#5a3a7a', '#e0765a'], glow: ['#ff9d5c', '#7a4bd0'], stars: 0.25, clouds: 1, mix: {} },
      { id: 'cloud', name: '구름 위', from: 100, color: '#bfe9ff', banner: '구름 위 도착!',
        sky: ['#0f2150', '#2c4f9a', '#7fb2e6'], glow: ['#9fd8ff', '#5d7bff'], stars: 0.35, clouds: 0.85, mix: { cloud: 1.5 } },
      { id: 'space', name: '우주',    from: 250, color: '#b388ff', banner: '우주 도착!',
        sky: ['#05070f', '#0d1633', '#1c1446'], glow: ['#3a2a8a', '#0d6a8a'], stars: 0.85, clouds: 0, mix: { moving: 1.3, star: 0.05 } },
      { id: 'stars', name: '별나라',  from: 500, color: '#ffe66d', banner: '별나라 도착!',
        sky: ['#0b0418', '#2a0c42', '#40104a'], glow: ['#ff5ec8', '#ffe66d'], stars: 1, clouds: 0, mix: { spring: 1.3, star: 0.12 } },
    ],
    // 구역이 바뀔 때 배경이 섞여 넘어가는 높이 (m, 경계 앞쪽)
    ZONE_FADE: 25,

    // 높이 눈금: 작은 눈금 10m, 빛나는 선 50m, 100m마다 큰 축하
    MILE: { tick: 10, line: 50, big: 100 },

    // 콤보: 이어서 더 높은 발판을 밟은 수. show번부터 칩으로 보이고,
    // step번마다 별 점수 배율이 add씩 오른다 (max까지)
    COMBO: { show: 3, step: 4, add: 0.25, max: 2 },

    // 메달. check(run, rec): run = 이번 판 기록, rec = 평생 기록. tier: 1 동 · 2 은 · 3 금
    MEDALS: [
      { id: 'h50',      tier: 1, name: '첫 50m',        desc: '한 판에 50m',                  check: r => r.height >= 50 },
      { id: 'h150',     tier: 2, name: '하늘 150',      desc: '한 판에 150m',                 check: r => r.height >= 150 },
      { id: 'h400',     tier: 3, name: '우주 400',      desc: '한 판에 400m',                 check: r => r.height >= 400 },
      { id: 'n100',     tier: 3, name: '용감한 100',    desc: '보통·어려움으로 100m',         check: r => (r.diff ? r.diff !== 'easy' : !r.easy) && r.height >= 100 },
      { id: 'star20',   tier: 1, name: '별 20',         desc: '한 판에 별 20개',              check: r => r.stars >= 20 },
      { id: 'star60',   tier: 2, name: '별 60',         desc: '한 판에 별 60개',              check: r => r.stars >= 60 },
      { id: 'spring5',  tier: 1, name: '통통 스프링',   desc: '한 판에 스프링 5번',           check: r => r.springs >= 5 },
      { id: 'rocket',   tier: 1, name: '로켓 발사',     desc: '로켓 타기',                    check: r => r.rockets >= 1 },
      { id: 'shield',   tier: 2, name: '방울 덕분에',   desc: '방패 방울로 살아남기',         check: r => r.saves >= 1 },
      { id: 'combo10',  tier: 2, name: '계단 10',       desc: '10번 연속 더 높은 발판',      check: r => r.maxCombo >= 10 },
      { id: 'games10',  tier: 1, name: '단골',          desc: '10판 하기',                    check: (r, R) => R.total.games >= 10 },
      { id: 'stars500', tier: 2, name: '별 500',        desc: '모두 합쳐 별 500개',           check: (r, R) => R.total.stars >= 500 },
      // 2026-09-27 높이 구역·콤보와 함께
      { id: 'cloudz',   tier: 1, name: '구름 위 도착',  desc: '100m 구름 위까지',             check: r => r.height >= 100 },
      { id: 'spacez',   tier: 2, name: '우주 도착',     desc: '250m 우주까지',                check: r => r.height >= 250 },
      { id: 'starz',    tier: 3, name: '별나라 도착',   desc: '500m 별나라까지',              check: r => r.height >= 500 },
      { id: 'combo20',  tier: 3, name: '콤보 20',       desc: '콤보 20 만들기',               check: r => r.maxCombo >= 20 },
      { id: 'hard100',  tier: 3, name: '어려움 100',    desc: '어려움으로 100m',              check: r => r.diff === 'hard' && r.height >= 100 },
    ],

    // 연출 (그리기 전용, 규칙에는 영향 없음)
    FX: { starSparks: 12, springSparks: 18, dust: 6, maxParticles: 160, shake: 7, flash: 0.3 },

    // 처음 몇 초 조작 안내를 보여 준다 (처음 해 보는 판은 양쪽을 다 눌러 볼 때까지 큰 안내)
    HINT_TIME: 4,
  };
})(JP);
