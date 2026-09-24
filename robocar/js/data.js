'use strict';
// 뚝딱 로봇카 데이터. 부품·스티커·코스 규칙은 여기만 고친다.
var RC = {};

(function (RC) {
  RC.rng = function (seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };
  RC.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
  };

  // 차체: 변신하면 로봇 능력이 달라진다
  const BODIES = [
    { id: 'racer',  name: '레이서',   robot: '레이서 로봇', ability: 'dash',  abilityName: '슝 돌진', say: '레이서! 제일 빨라!',   color: '#ff3b3b' },
    { id: 'fire',   name: '소방차',   robot: '소방 로봇',   ability: 'water', abilityName: '물대포',  say: '소방차! 불을 꺼 줘!',  color: '#ff6a1a' },
    { id: 'police', name: '경찰차',   robot: '경찰 로봇',   ability: 'siren', abilityName: '사이렌',  say: '경찰차! 삐뽀삐뽀!',   color: '#2f6bff' },
  ];

  // 바퀴: 점프 높이·속도
  const WHEELS = [
    { id: 'normal',  name: '보통 바퀴',   jump: 1.0,  speed: 1.0,  r: 18, say: '보통 바퀴!' },
    { id: 'monster', name: '몬스터 바퀴', jump: 1.22, speed: 0.95, r: 27, say: '몬스터 바퀴! 높이 뛰어!' },
    { id: 'spring',  name: '스프링 바퀴', jump: 1.0,  speed: 1.0,  r: 17, double: true, say: '스프링 바퀴! 두 번 뛰어!' },
  ];

  // 등 장비: 공중·장애물
  const GEAR = [
    { id: 'jet',   name: '제트팩', say: '제트팩! 꾹 누르면 날아!' },
    { id: 'wing',  name: '날개',   say: '날개! 꾹 누르면 둥실!' },
    { id: 'drill', name: '드릴',   say: '드릴! 바위도 뚫어!' },
  ];

  const COLORS = ['#ff3b3b', '#ff9f1a', '#ffd21a', '#22c55e', '#2f6bff', '#a855f7'];

  // 수집 카드: 별 병이 찰 때마다 순서대로 한 장씩 (id는 예전 스티커와 같아서 모은 기록이 이어진다)
  // rarity: 1 일반 · 2 레어 · 3 전설
  const STICKERS = [
    { id: 's1',  name: '레이서 로봇',     rarity: 1, form: 'robot', cfg: { body: 'racer',  wheel: 'normal',  gear: 'jet' } },
    { id: 's2',  name: '소방 로봇',       rarity: 1, form: 'robot', cfg: { body: 'fire',   wheel: 'normal',  gear: 'wing' } },
    { id: 's3',  name: '경찰 로봇',       rarity: 1, form: 'robot', cfg: { body: 'police', wheel: 'normal',  gear: 'jet' } },
    { id: 's4',  name: '몬스터 레이서',   rarity: 1, form: 'car',   cfg: { body: 'racer',  wheel: 'monster', gear: 'jet' } },
    { id: 's5',  name: '제트 소방차',     rarity: 2, form: 'car',   cfg: { body: 'fire',   wheel: 'spring',  gear: 'jet' } },
    { id: 's6',  name: '드릴 경찰차',     rarity: 2, form: 'car',   cfg: { body: 'police', wheel: 'monster', gear: 'drill' } },
    { id: 's7',  name: '날개 레이서',     rarity: 2, form: 'car',   cfg: { body: 'racer',  wheel: 'spring',  gear: 'wing' } },
    { id: 's8',  name: '드릴 소방 로봇',  rarity: 2, form: 'robot', cfg: { body: 'fire',   wheel: 'normal',  gear: 'drill' } },
    { id: 's9',  name: '황금 레이서',     rarity: 3, form: 'robot', cfg: { body: 'racer',  wheel: 'monster', gear: 'wing', color: '#ffc21a' } },
    { id: 's10', name: '챔피언 경찰 로봇', rarity: 3, form: 'robot', cfg: { body: 'police', wheel: 'normal',  gear: 'jet',  color: '#a855f7' } },
  ];
  const RARITY = { 1: { name: '일반', c1: '#5b7fb5', c2: '#1a2a4a' }, 2: { name: '레어', c1: '#a855f7', c2: '#2a1450' }, 3: { name: '전설', c1: '#ffc21a', c2: '#5a3a00' } };

  // 달리기 수치 (논리 좌표: 화면 높이 600 기준)
  const RUN = {
    groundY: 470,
    gravity: 2300,
    jumpV: 820,
    speed: 250,
    length: 15000,       // 코스 길이 → 약 1분
    jetFuel: 1.3, jetThrust: 3000, jetMaxUp: 330,
    glideFall: 110,
    robotTime: 3.5, transformCd: 5,
    morph: 0.4, morphSlow: 0.45,  // 변신 연출 길이(게임 시간)와 그동안의 느린 화면 배율
    dashMul: 1.8, magnetR: 320, waterRange: 750,
    starR: 42,
  };

  const JAR = 15; // 별 병 크기 (이만큼 모으면 스티커 1장)

  RC.DATA = { BODIES, WHEELS, GEAR, COLORS, STICKERS, RARITY, RUN, JAR };
  RC.find = (list, id) => list.find(x => x.id === id) || list[0];
})(RC);
