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

    // 카메라: 주인공이 화면 아래에서 이 비율 높이에 오도록 따라 올라간다 (내려가지는 않는다)
    CAM: { focus: 0.42, start: 0.12 },

    // 발판 종류. main: 길을 이루는 발판 가중치 [처음, 가장 어려울 때]
    PLAT: {
      w: 84, h: 16,
      main: {
        normal:  [70, 26],
        moving:  [8, 30],
        crumble: [4, 22],
        spring:  [7, 8],
      },
      // 곁 발판 (길 옆에 하나 더): 나올 확률 [처음, 끝], 종류 가중치 [처음, 끝]
      extraChance: [0.45, 0.2],
      extra: {
        normal:  [60, 20],
        cloud:   [25, 50],
        crumble: [15, 30],
      },
      moveSpeed: [50, 150],   // 움직이는 발판 속도 (점/초)
    },
    // 스프링: 아주 높이 튄다
    SPRING: { jump: 560 },
    // 구름 발판: on초 보였다가 off초 사라지기를 되풀이 (사라진 동안은 빠져나간다)
    CLOUD: { on: 2.4, off: 1.5, fade: 0.4 },
    // 부서지는 발판: 한 번 튀면 부서져 떨어진다 (fall초 동안 조각 연출)
    CRUMBLE: { fall: 0.6 },

    // 발판 사이 높이 간격 [처음 최소, 처음 최대, 끝 최소, 끝 최대]. 한 번 튀는 높이(200)보다 늘 작게
    GAP: [58, 100, 112, 165],

    // 어려움이 끝까지 오르는 높이 (m)
    DIFF: { full: 400 },

    // 별: 줄마다 나올 확률, 점수, 가끔 세로로 줄지어 여러 개
    STAR: { chance: 0.4, points: 10, r: 14, lineChance: 0.15, line: 4 },

    // 아이템: 처음 나오는 높이(m), 다음까지 간격(m). 이름표를 달고 나타난다
    ITEM: {
      first: 25, gapMin: 55, gapMax: 95, r: 18,
      kinds: {
        rocket: { name: '로켓', color: '#ff9f43', w: 1 },        // 잠깐 쭉 날아오른다
        shield: { name: '방패 방울', color: '#7fd3ff', w: 1 },   // 한 번 지켜 준다 (가시 폭탄·떨어짐)
      },
    },
    ROCKET: { time: 2.2, speed: 1300, after: 700 },

    // 가시 폭탄 (보통만): 이 높이(m)부터, 줄마다 나올 확률 [처음, 끝]. 닿으면 끝 (방패가 있으면 한 번 살아남)
    MINE: { from: 30, chance: [0.08, 0.38], r: 15, clear: 105 },

    // 쉬움 (처음 켰을 때 기본): 가시 폭탄 없음, 발판이 넓고 많고 간격이 좁다.
    // 떨어지면 구조 구름이 3번 받아서 던져 올려 준다
    EASY: {
      w: 108, gap: [50, 85, 80, 125], extraChance: [0.6, 0.38], moveSpeed: [40, 90],
      rescues: 3, rescueJump: 0.75, itemGap: [40, 70],
    },

    // 메달. check(run, rec): run = 이번 판 기록, rec = 평생 기록. tier: 1 동 · 2 은 · 3 금
    MEDALS: [
      { id: 'h50',      tier: 1, name: '구름 위로',     desc: '한 판에 50m',                  check: r => r.height >= 50 },
      { id: 'h150',     tier: 2, name: '하늘 150',      desc: '한 판에 150m',                 check: r => r.height >= 150 },
      { id: 'h400',     tier: 3, name: '우주 400',      desc: '한 판에 400m',                 check: r => r.height >= 400 },
      { id: 'n100',     tier: 3, name: '용감한 100',    desc: '보통 모드로 100m',             check: r => !r.easy && r.height >= 100 },
      { id: 'star20',   tier: 1, name: '별 20',         desc: '한 판에 별 20개',              check: r => r.stars >= 20 },
      { id: 'star60',   tier: 2, name: '별 60',         desc: '한 판에 별 60개',              check: r => r.stars >= 60 },
      { id: 'spring5',  tier: 1, name: '통통 스프링',   desc: '한 판에 스프링 5번',           check: r => r.springs >= 5 },
      { id: 'rocket',   tier: 1, name: '로켓 발사',     desc: '로켓 타기',                    check: r => r.rockets >= 1 },
      { id: 'shield',   tier: 2, name: '방울 덕분에',   desc: '방패 방울로 살아남기',         check: r => r.saves >= 1 },
      { id: 'combo10',  tier: 2, name: '계단 10',       desc: '10번 연속 더 높은 발판',      check: r => r.maxCombo >= 10 },
      { id: 'games10',  tier: 1, name: '단골',          desc: '10판 하기',                    check: (r, R) => R.total.games >= 10 },
      { id: 'stars500', tier: 2, name: '별 500',        desc: '모두 합쳐 별 500개',           check: (r, R) => R.total.stars >= 500 },
    ],

    // 연출 (그리기 전용, 규칙에는 영향 없음)
    FX: { starSparks: 12, springSparks: 18, maxParticles: 160, shake: 7, flash: 0.3 },

    // 처음 몇 초 조작 안내를 보여 준다
    HINT_TIME: 4,
  };
})(JP);
