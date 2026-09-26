'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
(function (SN) {
  SN.DATA = {
    // 판 크기(칸). 가로 화면은 넓게, 세로 화면(폰)은 돌려서 쓴다
    BOARD: { land: [32, 20], port: [20, 32] },

    // 시작: 길이 4칸, 1초 숨 고르고 출발 (그 전에 방향을 넣으면 바로 출발)
    START: { len: 4, wait: 1.0 },

    // 속도(초당 칸 수): 한 칸 길어질 때마다 조금씩 빨라지고 상한에서 멈춘다
    SPEED: { base: 8, perGrow: 0.15, max: 15 },

    // 먹이: 일반 10점 + 길이 10칸마다 2점 보너스. 5번째마다 황금 구슬(50점 + 같은 보너스)
    FOOD: { points: 10, bonusPer: 10, bonus: 2, goldEvery: 5, goldPoints: 50 },

    // 빠르게 두 번 밀어도 잃지 않게 방향을 2개까지 줄 세운다
    TURN_QUEUE: 2,

    // 연출 (그리기 전용, 규칙에는 영향 없음)
    FX: { eatSparks: 12, goldSparks: 26, deathSparks: 36, maxParticles: 180, shake: 16, flash: 0.35 },

    // 밀기 판정: 짧은 변 길이의 3% 또는 18px 중 큰 값 이상 움직이면 방향 전환
    SWIPE: { min: 18, ratio: 0.03 },

    // 처음 몇 초 조작 안내를 보여 준다
    HINT_TIME: 4,
  };
})(SN);
