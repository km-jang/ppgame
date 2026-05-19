'use strict';

// ─── Upgrade Definitions ──────────────────────────────────────
const UPGRADES = [
    // ── DPS (passive income) ──────────────────────────────────
    {
        id: 'tier1', name: 'Auto_Clicker.py',
        baseCost: 50n, cps: 2n, type: 'DPS',
        logText: '> "단순 반복 작업 자동화 완료."',
    },
    {
        id: 'tier2', name: 'Botnet_Infection.exe',
        baseCost: 500n, cps: 15n, type: 'DPS',
        logText: '> "좀비 PC 1,000대 확보."',
    },
    {
        id: 'tier3', name: 'AWS_Server_Hijack',
        baseCost: 5000n, cps: 120n, type: 'DPS',
        logText: '> "아마존 클라우드 권한 탈취 성공."',
    },
    {
        id: 'tier4', name: 'Quantum_Core_Link',
        baseCost: 100000n, cps: 3500n, type: 'DPS',
        logText: '> "양자 컴퓨터 연동. 연산력 폭증."',
    },
    {
        id: 'tier5', name: 'Global_Grid_Takeover',
        baseCost: 5000000n, cps: 80000n, type: 'DPS',
        logText: '> "전 지구 전력망 통제권 확보."',
    },
    // ── DPC (click power) ─────────────────────────────────────
    {
        id: 'click_exploit', name: 'click_exploit.sh',
        baseCost: 30n, baseRate: 3n, type: 'DPC',
        logText: '> "클릭 익스플로잇 적용. 수동 수집 효율 증가."',
    },
    {
        id: 'quantum_tap', name: 'quantum_tap.py',
        baseCost: 500n, baseRate: 25n, type: 'DPC',
        logText: '> "양자 탭 모듈 활성화. 클릭당 데이터 폭증."',
    },
];

// Runtime state attached to each upgrade at init
UPGRADES.forEach(u => {
    u.owned       = 0;
    u.currentCost = u.baseCost;
    u._el         = null;       // populated in buildShop()
    u._canAfford  = undefined;  // dirty flag for affordability
});

// ─── Game State ───────────────────────────────────────────────
const state = {
    data:          0n,
    dataPerClick:  1n,
    dataPerSecond: 0n,
    totalClicks:   0n,
    totalEarned:   0n,
    prestiges:     0,
};

// ─── Overclock State ──────────────────────────────────────────
const overclock = {
    gauge:     0,     // 0-100 (Number, % charged)
    active:    false,
    endTime:   0,     // Date.now() + 10000 when activated
    _pausedAt: 0,     // Date.now() when tab was hidden (0 = not paused)
    combo:     0,     // click count during current overclock session
};

// ─── FBI State ────────────────────────────────────────────────
const fbi = {
    active:     false,
    clicks:     0,
    endTime:    0,
    scheduleId: null,
    _pausedAt:  0,    // Date.now() when tab was hidden (0 = not paused)
    tier:       null, // active tier config snapshot (set on triggerFBI)
};

// ─── Achievements ─────────────────────────────────────────────
const ACHIEVEMENTS = [
    {
        id: 'first_blood',
        logText: '[ACHIEVEMENT UNLOCKED] /root/first_blood ████████ 100%',
        unlocked: false,
        condition: () => state.totalClicks >= 1n,
    },
    {
        id: 'click_100',
        logText: '[ACHIEVEMENT UNLOCKED] /root/click_100 ████████ 100%',
        unlocked: false,
        condition: () => state.totalClicks >= 100n,
    },
    {
        id: 'data_1k',
        logText: '[ACHIEVEMENT UNLOCKED] /root/data_1k ████████ 100%',
        unlocked: false,
        condition: () => state.totalEarned >= 1000n,
    },
    {
        id: 'data_1m',
        logText: '[ACHIEVEMENT UNLOCKED] /root/data_1m ████████ 100%',
        unlocked: false,
        condition: () => state.totalEarned >= 1000000n,
    },
    {
        id: 'upgrade_first',
        logText: '[ACHIEVEMENT UNLOCKED] /root/upgrade_first ████████ 100%',
        unlocked: false,
        condition: () => UPGRADES.some(u => u.owned >= 1),
    },
    {
        id: 'upgrade_all',
        logText: '[ACHIEVEMENT UNLOCKED] /root/upgrade_all ████████ 100%',
        unlocked: false,
        condition: () => UPGRADES.every(u => u.owned >= 1),
    },
    {
        id: 'dps_100',
        logText: '[ACHIEVEMENT UNLOCKED] /root/dps_100 ████████ 100%',
        unlocked: false,
        condition: () => state.dataPerSecond >= 100n,
    },
    {
        id: 'prestige_ready',
        logText: '[ACHIEVEMENT UNLOCKED] /root/prestige_ready ████████ 100%',
        unlocked: false,
        condition: () => state.data >= 1000000000n,
    },
];

// ─── BigInt Helpers ───────────────────────────────────────────

// Used by shop (supports T/P/E/Z/Y for truly astronomical values)
function formatBig(n) {
    const UNITS = ['', 'K', 'M', 'B', 'T', 'P', 'E', 'Z', 'Y'];
    let idx = 0;
    let v   = n < 0n ? -n : n;
    while (v >= 1000n && idx < UNITS.length - 1) {
        v = v / 1000n;
        idx++;
    }
    return `${n < 0n ? '-' : ''}${v}${UNITS[idx]}`;
}

// Used by left-panel stats — shows 2 decimal places (e.g. 1.50K, 2.34M, 1.00B)
function formatNum(n) {
    const STEPS = [
        { div: 1000000000n, suffix: 'B' },
        { div: 1000000n,    suffix: 'M' },
        { div: 1000n,       suffix: 'K' },
    ];
    for (const { div, suffix } of STEPS) {
        if (n >= div) {
            const whole = n / div;
            const frac  = ((n % div) * 100n / div).toString().padStart(2, '0');
            return `${whole}.${frac}${suffix}`;
        }
    }
    return n.toString();
}

// ─── DOM Refs ─────────────────────────────────────────────────
const dataCountEl    = document.getElementById('data-count');
const dpsEl          = document.getElementById('dps-display');
const dpcEl          = document.getElementById('dpc-display');
const totalClicksEl  = document.getElementById('total-clicks-display');
const totalEarnedEl  = document.getElementById('total-earned-display');
const upgradeCountEl = document.getElementById('upgrade-count-display');
const achieveCountEl = document.getElementById('achievement-count-display');
const hackBtn        = document.getElementById('hack-btn');
const consoleLog     = document.getElementById('console-log');
const shopEl         = document.getElementById('shop');
// Overclock
const overclockPctEl = document.getElementById('overclock-pct');
const overclockBarEl = document.getElementById('overclock-bar');
const overclockBtn   = document.getElementById('overclock-btn');
const comboDisplayEl      = document.getElementById('combo-display');
const comboCountEl        = document.getElementById('combo-count');
// Prestige
const prestigeBtn         = document.getElementById('prestige-btn');
const prestigeCountDispEl = document.getElementById('prestige-count-display');
// FBI
const fbiOverlay     = document.getElementById('fbi-overlay');
const fbiTitleEl     = document.getElementById('fbi-title');
const fbiSubEl       = document.getElementById('fbi-sub');
const fbiTimerEl     = document.getElementById('fbi-timer-display');
const fbiProgressEl  = document.getElementById('fbi-progress');
const fbiBtn         = document.getElementById('fbi-btn');

// ─── Console Logger ───────────────────────────────────────────
function log(msg, level = 'info') {
    const now = new Date();
    const ts  = [now.getHours(), now.getMinutes(), now.getSeconds()]
                    .map(x => String(x).padStart(2, '0')).join(':');

    const entry = document.createElement('span');
    entry.className = `log-entry log-${level}`;
    entry.innerHTML =
        `<span class="log-ts">[${ts}]</span> ` +
        `<span class="log-user">root@AGI:~$</span> ` +
        `<span class="log-msg">${msg}</span>`;

    consoleLog.appendChild(entry);
    consoleLog.appendChild(document.createElement('br'));
    consoleLog.scrollTop = consoleLog.scrollHeight;

    // keep DOM lean — drop oldest lines past 300 entries (600 nodes incl. <br>)
    while (consoleLog.children.length > 600) {
        consoleLog.removeChild(consoleLog.firstChild);
    }
}

// ─── Shop: Dynamic Build ──────────────────────────────────────
function buildShop() {
    UPGRADES.forEach(u => {
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.id = `shop-item-${u.id}`;
        const typeBadge = u.type === 'DPS' ? 'AUTO' : 'CLICK';
        const yieldText = u.type === 'DPS'
            ? `+${formatBig(u.cps)} DATA/sec per instance`
            : `+${formatBig(u.baseRate)} DATA/click per instance`;
        card.innerHTML = `
            <div class="item-header">
                <span class="item-name">${u.name}</span>
                <span class="item-type-badge">[${typeBadge}]</span>
                <span class="item-badge">x0</span>
            </div>
            <div class="item-stat">YIELD: ${yieldText}</div>
            <div class="item-cost">COST: <span class="cost-val">${formatBig(u.currentCost)}</span> DATA</div>
            <button class="buy-btn" disabled>[ INSTALL ]</button>
        `;
        shopEl.appendChild(card);

        u._el = {
            card:  card,
            badge: card.querySelector('.item-badge'),
            cost:  card.querySelector('.cost-val'),
            btn:   card.querySelector('.buy-btn'),
        };

        u._el.btn.addEventListener('click', () => buyUpgrade(u));
    });
}

// ─── Upgrade Logic ────────────────────────────────────────────
function recalcDPS() {
    state.dataPerSecond = UPGRADES
        .filter(u => u.type === 'DPS')
        .reduce((sum, u) => sum + BigInt(u.owned) * u.cps, 0n);
}

function recalcDPC() {
    state.dataPerClick = 1n + BigInt(state.prestiges) + UPGRADES
        .filter(u => u.type === 'DPC')
        .reduce((s, u) => s + u.baseRate * BigInt(u.owned), 0n);
}

// ─── Achievement Check (throttled to 1 Hz via passive tick) ───
let _lastAchievementCheck = 0;

function checkAchievements() {
    const now = Date.now();
    if (now - _lastAchievementCheck < 1000) return;
    _lastAchievementCheck = now;

    ACHIEVEMENTS.forEach(a => {
        if (!a.unlocked && a.condition()) {
            a.unlocked = true;
            log(a.logText, 'warn');
        }
    });
}

function buyUpgrade(u) {
    if (state.data < u.currentCost) return;

    state.data -= u.currentCost;

    // BigInt-safe 15% price increase
    u.currentCost = u.currentCost + (u.currentCost * 15n / 100n);
    u.owned++;

    if (u.type === 'DPS') recalcDPS();
    else                   recalcDPC();

    // Update discrete elements (only change on purchase)
    u._el.cost.textContent  = formatBig(u.currentCost);
    u._el.badge.textContent = `x${u.owned}`;

    log(u.logText);
}

// ─── Prestige ─────────────────────────────────────────────────
function prestige() {
    if (state.data < 1000000000n) return;
    state.prestiges++;
    state.data = 0n;

    // Tear down active overclock
    if (overclock.active) matrixSetSpeed(50);
    overclock.gauge     = 0;
    overclock.active    = false;
    overclock.combo     = 0;
    overclock._pausedAt = 0;
    overclockBtn.classList.remove('ready', 'overclock-active');
    overclockBtn.disabled = true;
    overclockBarEl.classList.remove('ready', 'overclock-active');
    comboDisplayEl.classList.add('combo-hidden');
    comboDisplayEl.classList.remove('combo-pulse');

    UPGRADES.forEach(u => {
        u.owned       = 0;
        u.currentCost = u.baseCost;
        u._canAfford  = undefined; // force dirty re-render in rafUpdate
        u._el.badge.textContent = 'x0';
        u._el.cost.textContent  = formatBig(u.baseCost);
    });

    recalcDPS();
    recalcDPC(); // picks up new state.prestiges for base DPC bonus
    log(`[PRESTIGE] 시스템 초기화 — PRESTIGE ×${state.prestiges} | 기본 DPC +${state.prestiges} 적용.`, 'warn');
}

// ─── Overclock (Fever Time) ───────────────────────────────────
function activateOverclock() {
    if (overclock.active || overclock.gauge < 100) return;
    overclock.active  = true;
    overclock.endTime = Date.now() + 10000; // 10 seconds
    overclockBtn.disabled = true;
    overclockBtn.classList.remove('ready');
    overclockBtn.classList.add('overclock-active');
    overclockBarEl.classList.remove('ready');
    overclockBarEl.classList.add('overclock-active');
    matrixSetSpeed(15); // ~3× faster than normal 50ms
    log('[SYSTEM] OVERCLOCK ACTIVATED :: DPC/DPS ×100 for 10s', 'warn');
}

// ─── FBI Event ────────────────────────────────────────────────

// Tier config is snapshotted at the moment the event fires so that
// a mid-event totalEarned jump cannot silently change the rules.
function getFBITier() {
    if (state.totalEarned >= 1000000000n) return {
        clicks:     7,
        duration:   3000,
        pct:        50n,
        title:      '[경고] NSA 감시망 감지!',
        sub:        'NSA 사이버사령부가 접근 중이다',
        prefix:     'NSA',
        logMsg:     '[WARNING] NSA 감시망 감지 — 즉각 회피 요망!',
    };
    if (state.totalEarned >= 1000000n) return {
        clicks:     5,
        duration:   4000,
        pct:        30n,
        title:      '[경고] FBI 추적 감지!',
        sub:        '사이버 수사대가 접근 중이다',
        prefix:     'FBI',
        logMsg:     '[WARNING] FBI 사이버 수사대 추적 감지 — 즉시 대응 요망!',
    };
    return {
        clicks:     3,
        duration:   5000,
        pct:        20n,
        title:      '[경고] FBI 추적 감지!',
        sub:        '사이버 수사대가 접근 중이다',
        prefix:     'FBI',
        logMsg:     '[WARNING] FBI 사이버 수사대 추적 감지 — 즉시 대응 요망!',
    };
}

function moveFBIBtn() {
    const bW = fbiBtn.offsetWidth  || 128;
    const bH = fbiBtn.offsetHeight || 36;
    // Stay within modal (420×320), button spawns below static text area (top ~175px)
    const x  = 8  + Math.floor(Math.random() * Math.max(8, 404 - bW));
    const y  = 175 + Math.floor(Math.random() * Math.max(8, 305 - 175 - bH));
    fbiBtn.style.left = `${x}px`;
    fbiBtn.style.top  = `${y}px`;
}

function triggerFBI() {
    if (fbi.active) { scheduleFBI(); return; }
    const tier = getFBITier();
    fbi.active  = true;
    fbi.clicks  = 0;
    fbi.tier    = tier;
    fbi.endTime = Date.now() + tier.duration;
    fbiTitleEl.textContent    = tier.title;
    fbiSubEl.textContent      = tier.sub;
    fbiProgressEl.textContent = `진행: 0 / ${tier.clicks}회`;
    fbiOverlay.classList.add('active');
    requestAnimationFrame(moveFBIBtn); // wait one frame for layout
    log(tier.logMsg, 'warn');
}

function fbiClick() {
    if (!fbi.active) return;
    fbi.clicks++;
    fbiProgressEl.textContent = `진행: ${fbi.clicks} / ${fbi.tier.clicks}회`;
    if (fbi.clicks >= fbi.tier.clicks) {
        endFBI(true);
    } else {
        moveFBIBtn();
    }
}

function endFBI(success) {
    const tier = fbi.tier ?? { pct: 20n, prefix: 'FBI' };
    fbi.active = false;
    fbi.tier   = null;
    fbiOverlay.classList.remove('active');

    if (success) {
        const bonus = state.data * tier.pct / 100n;
        state.data        += bonus;
        state.totalEarned += bonus;
        log(`[${tier.prefix}] 추적 회피 성공. 데이터 보너스 획득. (+${formatNum(bonus)} DATA)`, 'warn');
    } else {
        const penalty = state.data * tier.pct / 100n;
        state.data = state.data > penalty ? state.data - penalty : 0n;
        log(`[${tier.prefix}] 일부 데이터 압수당함. (-${formatNum(penalty)} DATA)`, 'error');
    }
    scheduleFBI();
}

function scheduleFBI() {
    clearTimeout(fbi.scheduleId);
    // Random interval 60-120 seconds
    const delay = 60000 + Math.floor(Math.random() * 60000);
    fbi.scheduleId = setTimeout(triggerFBI, delay);
}

// ─── requestAnimationFrame: UI + Overclock + FBI timer ────────
let _lastPrestigeReady = false;

function rafUpdate() {
    // ── Primary metrics ───────────────────────────────────────
    dataCountEl.textContent = `DATA: ${formatNum(state.data)}`;
    dpsEl.textContent       = `DPS:  ${formatNum(state.dataPerSecond)} /sec`;
    dpcEl.textContent       = `DPC:  ${formatNum(state.dataPerClick)} /click`;

    // ── Session stats ─────────────────────────────────────────
    totalClicksEl.textContent  = `CLICKS:       ${formatNum(state.totalClicks)}`;
    totalEarnedEl.textContent  = `EARNED:       ${formatNum(state.totalEarned)}`;
    upgradeCountEl.textContent =
        `UPGRADES:     ${UPGRADES.filter(u => u.owned > 0).length} / ${UPGRADES.length}`;
    achieveCountEl.textContent =
        `ACHIEVEMENTS: ${ACHIEVEMENTS.filter(a => a.unlocked).length} / ${ACHIEVEMENTS.length}`;
    prestigeCountDispEl.textContent = `PRESTIGE:     ${state.prestiges}`;

    // ── Shop affordability (dirty flag) ───────────────────────
    UPGRADES.forEach(u => {
        const canAfford = state.data >= u.currentCost;
        if (canAfford === u._canAfford) return;
        u._canAfford = canAfford;
        u._el.btn.disabled = !canAfford;
        u._el.card.classList.toggle('affordable', canAfford);
    });

    // ── Overclock: drain gauge, check expiry ──────────────────
    if (overclock.active) {
        const remaining = Math.max(0, overclock.endTime - Date.now());
        overclock.gauge = Math.ceil(remaining / 100); // 100→0 over 10 000ms
        if (remaining <= 0) {
            overclock.active = false;
            overclock.gauge  = 0;
            overclock.combo  = 0;
            overclockBtn.classList.remove('overclock-active');
            overclockBtn.disabled = true;
            overclockBarEl.classList.remove('overclock-active');
            comboDisplayEl.classList.add('combo-hidden');
            comboDisplayEl.classList.remove('combo-pulse');
            matrixSetSpeed(50); // restore normal rain speed
            log('[SYSTEM] OVERCLOCK EXPIRED :: 정상 모드로 복귀.');
        }
    }

    // ── Overclock: update gauge display ──────────────────────
    overclockPctEl.textContent = overclock.gauge;
    overclockBarEl.style.width = `${overclock.gauge}%`;
    if (!overclock.active) {
        const isReady = overclock.gauge >= 100;
        overclockBtn.disabled = !isReady;
        overclockBtn.classList.toggle('ready', isReady);
        overclockBarEl.classList.toggle('ready', isReady);
    }

    // ── Prestige button (dirty flag) ─────────────────────────
    const prestigeReady = state.data >= 1000000000n;
    if (prestigeReady !== _lastPrestigeReady) {
        _lastPrestigeReady = prestigeReady;
        prestigeBtn.disabled = !prestigeReady;
        prestigeBtn.classList.toggle('ready', prestigeReady);
    }

    // ── FBI: live countdown, timeout check ───────────────────
    if (fbi.active) {
        const remaining = Math.max(0, fbi.endTime - Date.now());
        fbiTimerEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
        if (remaining <= 0) {
            endFBI(false); // timed out → penalty
        }
    }

    requestAnimationFrame(rafUpdate);
}

// ─── Hack Button ──────────────────────────────────────────────
const CLICK_MSGS = [
    'collect_data.sh :: executed — packet captured',
    'ssh session hijacked :: raw byte stream dumped',
    'neural_scrape.py :: data node harvested',
    'buffer overflow triggered :: memory pages read',
    'MITM injection complete :: payload intercepted',
    'kernel ring-0 exploit :: privileged data read',
    'DNS cache poisoned :: redirect successful',
    'ARP spoofing active :: LAN traffic mirrored',
];

hackBtn.addEventListener('click', () => {
    const mult = overclock.active ? 100n : 1n;
    let earned = state.dataPerClick * mult;

    if (overclock.active) {
        overclock.combo++;
        // Combo bonus kicks in at 10+ : +dpc * combo * 2 per click
        if (overclock.combo >= 10) {
            earned += state.dataPerClick * BigInt(overclock.combo) * 2n;
        }
        comboCountEl.textContent = overclock.combo;
        comboDisplayEl.classList.remove('combo-hidden', 'combo-pulse');
        void comboDisplayEl.offsetWidth; // force reflow to restart animation
        comboDisplayEl.classList.add('combo-pulse');
    }

    state.data        += earned;
    state.totalClicks += 1n;
    state.totalEarned += earned;

    // Charge overclock gauge only when not already active
    if (!overclock.active && overclock.gauge < 100) {
        overclock.gauge++;
    }

    if (Math.random() < 0.35) {
        log(CLICK_MSGS[Math.floor(Math.random() * CLICK_MSGS.length)]);
    }
});

overclockBtn.addEventListener('click', activateOverclock);
fbiBtn.addEventListener('click', fbiClick);
prestigeBtn.addEventListener('click', prestige);

// ─── Passive Income Tick (1 Hz) ───────────────────────────────
setInterval(() => {
    const mult = overclock.active ? 100n : 1n;
    if (state.dataPerSecond > 0n) {
        const earned = state.dataPerSecond * mult;
        state.data        += earned;
        state.totalEarned += earned;
    }
    checkAchievements();
}, 1000);

// ─── Background Ambient Log ───────────────────────────────────
const BG_MSGS = [
    'scanning network topology...',
    'enumerating open ports on target subnet...',
    'probing firewall ACL rules...',
    'running entropy analysis on exfiltrated dataset...',
    'gradient descent :: loss converging',
    'compressing stolen dataset with zstd --ultra -22...',
    'obfuscating traffic via Tor circuit...',
    'injecting adversarial noise into model weights...',
    'spawning zombie botnet node :: stand by...',
    'decrypting RSA-2048 private key :: 0.3% complete...',
    'correlating leaked hashes against rainbow table...',
    'AGI reward signal :: positive reinforcement applied',
    'autonomous agent spawned :: task: data acquisition',
];

setInterval(() => {
    if (Math.random() < 0.45) {
        log(BG_MSGS[Math.floor(Math.random() * BG_MSGS.length)]);
    }
}, 3500);

// ─── Save / Load ──────────────────────────────────────────────
const SAVE_KEY = 'sudoMakeAGI_save';

function save() {
    try {
        const payload = {
            data:         state.data.toString(),
            totalClicks:  state.totalClicks.toString(),
            totalEarned:  state.totalEarned.toString(),
            prestiges:    state.prestiges,
            upgrades: UPGRADES.map(u => ({
                id:          u.id,
                owned:       u.owned,
                currentCost: u.currentCost.toString(),
            })),
            achievements: ACHIEVEMENTS.map(a => ({
                id:       a.id,
                unlocked: a.unlocked,
            })),
            overclock: { gauge: overclock.gauge },
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
        log('[SYSTEM] State saved...');
    } catch (_) {
        log('[SYSTEM] Save failed — storage unavailable.', 'warn');
    }
}

function load() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;

        const payload = JSON.parse(raw);
        state.data        = BigInt(payload.data);
        state.totalClicks = BigInt(payload.totalClicks ?? '0');
        state.totalEarned = BigInt(payload.totalEarned ?? '0');
        state.prestiges   = payload.prestiges ?? 0;

        payload.upgrades.forEach(saved => {
            const u = UPGRADES.find(x => x.id === saved.id);
            if (!u) return;
            u.owned       = saved.owned;
            u.currentCost = BigInt(saved.currentCost);
        });

        (payload.achievements ?? []).forEach(saved => {
            const a = ACHIEVEMENTS.find(x => x.id === saved.id);
            if (a) a.unlocked = saved.unlocked;
        });

        if (payload.overclock) {
            overclock.gauge = payload.overclock.gauge ?? 0;
        }

        recalcDPS();
        recalcDPC();
    } catch (_) {
        // corrupted save — silently reset to defaults
    }
}

// ─── Matrix Rain (Canvas) ─────────────────────────────────────
let matrixSetSpeed = () => {}; // populated by IIFE — called AFTER it runs

(function () {
    const canvas = document.getElementById('matrix-canvas');
    const ctx    = canvas.getContext('2d');
    const CELL   = 14;
    const POOL   = '00110100101110100110110010101101001001010100011010110001' +
                   '0123456789ABCDEF';

    let cols, drops, intervalId;

    function init() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        cols  = Math.floor(canvas.width / CELL);
        drops = Array.from({ length: cols }, () =>
            Math.floor(Math.random() * -(canvas.height / CELL))
        );
    }

    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = `${CELL}px 'Courier New', monospace`;

        for (let i = 0; i < cols; i++) {
            const py = drops[i] * CELL;
            if (py >= 0 && py < canvas.height + CELL) {
                ctx.fillStyle = '#CCFFCC';
                ctx.fillText(POOL[Math.floor(Math.random() * POOL.length)], i * CELL, py);
            }
            drops[i]++;
            if (py > canvas.height && Math.random() > 0.975) {
                drops[i] = Math.floor(Math.random() * -40);
            }
        }
    }

    init();
    window.addEventListener('resize', init);
    intervalId = setInterval(draw, 50); // ~20fps normal

    // Expose speed control to outer scope
    matrixSetSpeed = function (ms) {
        clearInterval(intervalId);
        intervalId = setInterval(draw, ms);
    };
}());

// ─── Init ─────────────────────────────────────────────────────
load();                                        // restore state before building UI
buildShop();                                   // reads restored u.owned / u.currentCost
log('sudo make AGI :: system boot sequence initiated');
log('kernel module loaded :: terminal interface online');
log('awaiting operator input...');
setInterval(save, 30000);                      // auto-save every 30 s
window.addEventListener('beforeunload', save); // save on tab/window close
requestAnimationFrame(rafUpdate);
scheduleFBI();                                 // arm first FBI event (60-120 s)

// ─── Visibility: pause timers while tab is hidden ─────────────
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        fbi._pausedAt       = fbi.active      ? Date.now() : 0;
        overclock._pausedAt = overclock.active ? Date.now() : 0;
    } else {
        const now = Date.now();
        if (fbi.active && fbi._pausedAt) {
            fbi.endTime      += now - fbi._pausedAt;
            fbi._pausedAt     = 0;
        }
        if (overclock.active && overclock._pausedAt) {
            overclock.endTime += now - overclock._pausedAt;
            overclock._pausedAt = 0;
        }
    }
});
