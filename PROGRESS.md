# sudo make AGI — 개발 진행 문서

> 바닐라 JS/HTML/CSS 해커 터미널 테마 방치형 클리커 게임  
> 외부 라이브러리 없음 · BigInt 전용 연산 · 3파일 구조

---

## 파일 구조

```
sudo-make-agi/
├── index.html   — 3패널 레이아웃, FBI 오버레이, 모든 DOM 구조
├── style.css    — CRT 터미널 테마, 오버클럭/FBI/콤보/프레스티지 스타일
└── script.js    — 전체 게임 로직 (~680줄, 'use strict')
```

---

## 아키텍처 핵심 원칙

| 항목 | 결정 사항 |
|------|-----------|
| 통화 타입 | BigInt 전일 (`0n`, `100n`). Number 교차는 `BigInt(u.owned)`, `Math.floor` 인덱싱에만 허용 |
| 비용 증가 공식 | `cost += cost * 15n / 100n` (float 교차 없는 15% 인상) |
| UI 루프 | `requestAnimationFrame(rafUpdate)` — 60fps에서 표시·어포더빌리티 dirty 체크 |
| 패시브 수입 | `setInterval 1Hz` — 틱당 `dps * mult` 적용 |
| 오버클럭 100× | `const mult = overclock.active ? 100n : 1n` (BigInt 곱셈) |
| DOM 쓰로틀 | `u._canAfford` dirty flag — 어포더빌리티 변경 시에만 DOM 갱신 |
| 세이브 | BigInt `.toString()` / `BigInt()` 직렬화, localStorage, 30s 자동저장 |
| 탭 숨김 | `visibilitychange` → `_pausedAt` 기록 후 복귀 시 `endTime += 경과` 보정 |
| 매트릭스 속도 | IIFE 밖에 `let matrixSetSpeed = () => {}` stub, IIFE 내에서 실체 할당 |

---

## 현재 구현 완료 목록

### 코어 게임루프
- [x] 클릭 → DATA 수집 (`hack-btn`)
- [x] DPS 패시브 수입 (1Hz 틱)
- [x] DPC 클릭 파워
- [x] 숫자 포맷: `formatNum()` (소수 2자리 K/M/B), `formatBig()` (T/P/E/Z/Y까지)

### 업그레이드 시스템 (7종)
| ID | 이름 | 타입 | 기본비용 | 수익 |
|----|------|------|---------|------|
| tier1 | Auto_Clicker.py | DPS | 50 | +2/s |
| tier2 | Botnet_Infection.exe | DPS | 500 | +15/s |
| tier3 | AWS_Server_Hijack | DPS | 5,000 | +120/s |
| tier4 | Quantum_Core_Link | DPS | 100,000 | +3,500/s |
| tier5 | Global_Grid_Takeover | DPS | 5,000,000 | +80,000/s |
| click_exploit | click_exploit.sh | DPC | 30 | +3/click |
| quantum_tap | quantum_tap.py | DPC | 500 | +25/click |

비용 스케일: 구매마다 +15% (`currentCost + currentCost * 15n / 100n`)

### 업적 시스템 (8종)
| ID | 조건 |
|----|------|
| first_blood | totalClicks ≥ 1 |
| click_100 | totalClicks ≥ 100 |
| data_1k | totalEarned ≥ 1,000 |
| data_1m | totalEarned ≥ 1,000,000 |
| upgrade_first | 업그레이드 1종 이상 보유 |
| upgrade_all | 업그레이드 전종 보유 |
| dps_100 | DPS ≥ 100 |
| prestige_ready | data ≥ 1,000,000,000 |

체크: 1Hz 틱에서 `Date.now()` 1000ms 스로틀

### 오버클럭 시스템
- 클릭마다 게이지 +1 (0→100, 오버클럭 비활성 시에만)
- 100% 도달 시 빨간 펄싱 버튼 활성화
- 발동 시 10초간 DPC/DPS × 100 (BigInt `100n`)
- 매트릭스 비 속도 50ms → 15ms
- 게이지 드레인: `Math.ceil(remaining / 100)` (10000ms→100)

### 콤보 카운터 (오버클럭 연동)
- 오버클럭 중 클릭마다 `overclock.combo++`
- 콤보 10 이상: `earned += dataPerClick * BigInt(combo) * 2n` 추가 보너스
- `COMBO x{n}` 빨간 텍스트 (클릭마다 스케일 애니메이션)
- 오버클럭 종료 시 콤보 0 리셋

### FBI/NSA 이벤트 (3티어)
| 티어 | 조건 (totalEarned) | 클릭 횟수 | 제한시간 | 보너스/패널티 | 헤더 |
|------|------------------|---------|---------|-------------|------|
| T1 | < 1M | 3회 | 5초 | ±20% | FBI 추적 감지 |
| T2 | ≥ 1M | 5회 | 4초 | ±30% | FBI 추적 감지 |
| T3 | ≥ 1B | 7회 | 3초 | ±50% | NSA 감시망 감지 |

- 60~120초 랜덤 간격으로 발동 (`scheduleFBI`)
- 모달 내 이동하는 버튼 (CSS `position:absolute` + `transition`)
- 성공: `data * pct / 100n` 보너스 / 실패: 동일 비율 패널티
- 이벤트 발동 시점의 티어 스냅샷 (`fbi.tier`)으로 규칙 고정

### 프레스티지 시스템
- `state.data >= 1B` 시 금색 펄싱 버튼 활성화
- 클릭 시: data 0 리셋, 업그레이드 전체 초기화
- 유지: totalClicks, totalEarned, 업적
- 보상: 프레스티지 횟수만큼 기본 DPC +1 (`recalcDPC`에 `BigInt(state.prestiges)` 반영)

### 세이브/로드
저장 항목: `data`, `totalClicks`, `totalEarned`, `prestiges`, 업그레이드(owned/currentCost), 업적(unlocked), `overclock.gauge`  
미저장(런타임 임시): `overclock.active/endTime`, `fbi.active/tier/endTime`

### 비주얼
- CRT 스캔라인 (`body::after`, z-index 9999)
- 인광 비네트 (`body::before`, z-index 9998)
- CRT 플리커 (`@keyframes crt-flicker`, 10s loop)
- 매트릭스 비 캔버스 (z-index 0, opacity 0.4, IIFE, 이진수+hex 문자)

---

## state 객체 전체 구조

```javascript
// 게임 상태
const state = {
    data, dataPerClick, dataPerSecond,  // BigInt
    totalClicks, totalEarned,           // BigInt
    prestiges,                          // Number
};

// 오버클럭
const overclock = {
    gauge,      // 0-100 Number
    active,     // bool
    endTime,    // Date.now() + 10000
    _pausedAt,  // visibilitychange 보정용
    combo,      // 오버클럭 세션 내 클릭 수
};

// FBI
const fbi = {
    active, clicks, endTime, scheduleId,
    _pausedAt,  // visibilitychange 보정용
    tier,       // 발동 시 스냅샷 {clicks,duration,pct,title,sub,prefix,logMsg}
};
```

---

## 다음 작업 우선순위

### 즉시 추가 권장 (게임플레이 완성도)

1. **오프라인 수입 계산**  
   로드 시 `Date.now() - lastSaveTime` 만큼 DPS 적산.  
   세이브에 `savedAt: Date.now()` 추가, 로드 시 `state.data += dps * BigInt(elapsed / 1000)`.  
   단, 최대 오프라인 시간 캡 필요 (예: 8시간).

2. **클릭 파티클 / 숫자 팝업**  
   해킹 클릭마다 `+{earned} DATA` 텍스트가 버튼 위로 떠오르며 사라지는 애니메이션.  
   순수 DOM + CSS `@keyframes` 또는 별도 캔버스 레이어로 구현 가능.

3. **업적 언락 토스트**  
   현재는 콘솔 로그에만 표시. 화면 우상단에 2~3초 팝업되는 알림 추가.

4. **업그레이드 티어 확장**  
   tier6~tier8 DPS 추가 (비용 100M~100B 범위).  
   프레스티지 전용 업그레이드 카테고리 (`[PRESTIGE]` 뱃지).

5. **세이브 내보내기/가져오기**  
   JSON을 Base64로 인코딩해 텍스트 박스에 표시/붙여넣기.  
   리셋 기능도 같이 추가.

### 중기 작업 (몰입도 강화)

6. **Web Audio API 사운드**  
   외부 파일 없이 `OscillatorNode`로 합성음 구현.  
   클릭음(짧은 펄스), 업그레이드 구매음, 오버클럭 발동음, FBI 경고음.

7. **뉴스 티커 / 스토리 로그**  
   하단 콘솔 위 또는 헤더 아래에 1줄 티커 추가.  
   게임 진행 단계에 따라 AGI 발전 스토리 메시지 표시.

8. **크리티컬 히트**  
   클릭마다 낮은 확률(예: 5%)로 `earned *= 10n` 순간 크리 적용.  
   화면 플래시 효과 + 콘솔 `[CRIT]` 로그.

9. **마일스톤 패널 또는 팝업**  
   특정 data/totalEarned 기준점 도달 시 스토리 메시지 모달 (FBI 모달 재활용 가능).

10. **통계 화면**  
    우측 패널 탭 전환(SHOP / STATS)으로 플레이 통계 표시.  
    클릭당 평균 수익, 최고 DPS, 프레스티지 횟수, 총 FBI 이벤트 승/패 등.

### 장기 작업 (콘텐츠 확장)

11. **2차 자원 타입 — COMPUTE**  
    일정 DATA 이상 보유 시 COMPUTE 자원 언락.  
    COMPUTE는 특수 업그레이드 잠금 해제에 사용.

12. **프레스티지 전용 업그레이드 트리**  
    프레스티지 횟수에 따라 잠금 해제되는 영구 버프 업그레이드.  
    예: "전역 DPS +5%", "FBI 이벤트 타이머 +1초" 등.

13. **이벤트 시스템 확장**  
    FBI/NSA 외 추가 이벤트: 화이트햇 버그바운티(보너스), 서버 다운(DPS 일시 정지) 등.

14. **모바일 레이아웃**  
    현재 `overflow: hidden` + 고정 px 레이아웃으로 모바일 미지원.  
    미디어쿼리 또는 CSS Grid 비율 기반으로 전환.

---

## 알려진 기술 부채

| 항목 | 내용 |
|------|------|
| FBI 이벤트 타이머 정확도 | `setInterval` 기반 아님, `Date.now()` 절대값 사용 → 1% 미만 오차 있음 (허용 범위) |
| 매트릭스 비 속도 하드코딩 | `matrixSetSpeed(50)` 복구값이 하드코딩. IIFE 밖에 `MATRIX_NORMAL_MS = 50` 상수 추출 권장 |
| 콘솔 트림 300엔트리 | 600 자식 노드 초과 시 삭제. 급속 클릭 시 소량 DOM 재계산 발생 (실용적으론 무방) |
| 업적 카운트 HTML 하드코딩 | `ACHIEVEMENTS: 0 / 8` 초기값이 HTML에 고정. 업적 추가 시 HTML도 수정 필요 |
| 프레스티지 확인 없음 | 클릭 즉시 리셋. 실수 방지를 위한 `confirm()` 또는 인게임 확인 UI 추가 고려 |

---

## 빠른 테스트 치트 (브라우저 콘솔)

```javascript
// 현재 상태 확인
console.log({ data: state.data, dps: state.dataPerSecond, prestiges: state.prestiges });

// FBI T2 강제 테스트
state.totalEarned = 1000000n;

// FBI T3 강제 테스트
state.totalEarned = 1000000000n;

// 오버클럭 즉시 발동
overclock.gauge = 100;

// 프레스티지 버튼 즉시 활성화
state.data = 1000000000n;

// 세이브 초기화
localStorage.removeItem('sudoMakeAGI_save'); location.reload();
```

---

*최종 업데이트: 2026-05-19*  
*구현 단계: MVP 완료 — 콘텐츠 확장 및 주스 단계 진입 가능*
