'use strict';
// 아이 프로필 · 보호자 설정 · 놀이 시간 (2026-09-28 소유자 결정: 프로필은 아이마다 따로, 부모 기능은 소리 크기 상한과 남은 시간 알림).
// 모든 페이지(첫 화면, 네 게임)에서 **가장 먼저** 불러오는 일반 <script>. 전역 PROFILE.
// 핵심 계산은 DOM 없이 돈다 (node 테스트: tests/profile.test.js). 화면 도구(알림·배지)는 document가 있을 때만.
//
// 기록 나누기
//   localStorage(Storage.prototype getItem·setItem·removeItem·key·length)를 감싸서, 지금 아이가 쓰는 키에 'p<id>:'를 붙인다.
//   첫 번째 아이(id 1)는 아무것도 안 붙인다: 예전 기록이 그대로 첫째 것이 된다 (옮길 것 없음).
//   기기 공통 키는 안 붙인다: play.profiles · play.parent · play.time · play.sound1, play.dev로 시작하는 것, sw.·fonts.로 시작하는 것,
//   그리고 이미 p<숫자>:로 시작하는 키(보호자 화면이 직접 다루는 것).
//   그래서 게임 코드는 그대로 두어도 별코인(play.hub1)·기록·스티커·미션·캐릭터가 아이마다 따로 저장된다. 소리 설정은 기기 하나.
//   localStorage.clear()는 감싸지 않는다 (기기 전체를 지운다. 게임은 쓰지 않고 테스트만 쓴다).
//
// 저장 키 (모두 기기 공통)
//   play.profiles : { v:1, list:[{id, name, icon}], active }       아이 최대 4명
//   play.parent   : { v:1, limits:{[id]: 분 또는 0}, extra:{[id]:{day, min}}, volMax: 0.25~1 }
//   play.time     : { day:'YYYY-MM-DD', sec:{[id]: 초}, warn:{[id]:{f10, f5, f0, last}} }   오늘 논 시간(이 기기 날짜 기준)
//
// 게임이 하는 일: 판이 도는 동안 PROFILE.setPlaying(true), 멈춤·끝·시작 화면이면 false (main.js frame에서 매번 불러도 된다).
// 놀이 시간은 게임 페이지가 보이고 판이 도는 동안만 5초마다 센다. 시간이 다 되어도 판을 멈추거나 끝내지 않는다(알림만).
var PROFILE = (typeof PROFILE !== 'undefined' && PROFILE) || {};
(function (P) {
  const W = typeof window !== 'undefined' ? window : null, D = typeof document !== 'undefined' ? document : null;
  const K_PROFILES = 'play.profiles', K_PARENT = 'play.parent', K_TIME = 'play.time';
  const SHARED = [K_PROFILES, K_PARENT, K_TIME, 'play.sound1'];
  const MAX = 4;
  const ICONS = ['🚀', '🐱', '🐶', '🦊', '🐼', '🐯', '🐸', '🐧', '🦄', '🐙', '🦖', '⭐'];
  const NAMES = ['첫째', '둘째', '셋째', '넷째'];
  const LIMITS = [0, 20, 30, 45, 60, 90];
  const VOLS = [0.25, 0.5, 0.75, 1];
  const EXTRA_MIN = 10;
  const WARN = { soon: 600, sooner: 300, again: 300 }; // 10분 · 5분 남았을 때, 끝난 뒤에는 논 시간 5분마다 다시
  const TICK = 5000, NAME_MAX = 8;

  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ─── 저장소 감싸기 ───
  let LS = null;
  try { LS = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { LS = null; }
  const SP = typeof Storage !== 'undefined' && Storage.prototype ? Storage.prototype : null;
  // 감싸기 전의 원래 함수 (두 번 불러와도 원래 것을 잡도록 SP._pfRaw에 둔다)
  const RAW = SP ? (SP._pfRaw || {
    get: SP.getItem, set: SP.setItem, rm: SP.removeItem, key: SP.key,
    len: (Object.getOwnPropertyDescriptor(SP, 'length') || {}).get,
  }) : null;
  const OWN = /^p\d+:/;
  const shared = k => SHARED.indexOf(k) >= 0 || k.indexOf('play.dev') === 0 || k.indexOf('sw.') === 0 || k.indexOf('fonts.') === 0 || OWN.test(k);
  let cur = 1;
  const prefixOf = id => (id === 1 ? '' : 'p' + id + ':');
  const mapKey = k => { k = String(k); return shared(k) ? k : prefixOf(cur) + k; };

  // 원래 저장소 (감싸지 않은 키 그대로). 막혀 있으면 조용히
  const raw = {
    get(k) { try { return LS && RAW ? RAW.get.call(LS, k) : null; } catch (e) { return null; } },
    set(k, v) { try { if (LS && RAW) RAW.set.call(LS, k, v); } catch (e) { /* 무시 */ } },
    rm(k) { try { if (LS && RAW) RAW.rm.call(LS, k); } catch (e) { /* 무시 */ } },
    keys() {
      const out = [];
      try { if (LS && RAW) { const n = RAW.len.call(LS); for (let i = 0; i < n; i++) { const k = RAW.key.call(LS, i); if (k != null) out.push(k); } } } catch (e) { /* 무시 */ }
      return out;
    },
  };
  const jget = (k, f) => { const v = raw.get(k); if (v == null) return f; try { return JSON.parse(v); } catch (e) { return f; } };
  const jset = (k, v) => raw.set(k, JSON.stringify(v));

  // 지금 아이에게 보이는 키 (감싼 key()·length용): 공통 키 + 제 키(접두어 뗀 것)
  function visibleKeys() {
    const pre = prefixOf(cur), out = [];
    for (const k of raw.keys()) {
      if (SHARED.indexOf(k) >= 0 || (!OWN.test(k) && shared(k))) out.push(k);
      else if (pre ? k.indexOf(pre) === 0 : !OWN.test(k)) out.push(pre ? k.slice(pre.length) : k);
    }
    return out;
  }
  function wrap() {
    if (!SP || !RAW || !LS || SP._pfRaw) return;
    try {
      Object.defineProperty(SP, '_pfRaw', { value: RAW, enumerable: false });
      SP.getItem = function (k) { return RAW.get.call(this, this === LS ? mapKey(k) : k); };
      SP.setItem = function (k, v) { return RAW.set.call(this, this === LS ? mapKey(k) : k, v); };
      SP.removeItem = function (k) { return RAW.rm.call(this, this === LS ? mapKey(k) : k); };
      SP.key = function (i) { if (this !== LS) return RAW.key.call(this, i); const v = visibleKeys()[i]; return v == null ? null : v; };
      if (RAW.len) Object.defineProperty(SP, 'length', { configurable: true, enumerable: true, get() { return this === LS ? visibleKeys().length : RAW.len.call(this); } });
    } catch (e) { /* 감싸기 실패: 모두 첫째 기록으로 */ }
  }

  // ─── 프로필 ───
  function cleanProfiles(v) {
    const out = { v: 1, list: [], active: 1 };
    const seen = {};
    const src = isObj(v) && Array.isArray(v.list) ? v.list : [];
    for (const p of src) {
      if (!isObj(p)) continue;
      const id = Math.floor(Number(p.id));
      if (!(id >= 1) || seen[id]) continue;
      seen[id] = true;
      out.list.push({ id, name: cleanName(p.name) || NAMES[Math.min(out.list.length, 3)], icon: ICONS.indexOf(p.icon) >= 0 ? p.icon : ICONS[0] });
    }
    if (!seen[1]) out.list.unshift({ id: 1, name: NAMES[0], icon: ICONS[0] });
    out.list.sort((a, b) => (a.id === 1 ? -1 : b.id === 1 ? 1 : 0));
    out.list = out.list.slice(0, MAX);
    const act = isObj(v) ? Math.floor(Number(v.active)) : 1;
    out.active = out.list.some(p => p.id === act) ? act : 1;
    return out;
  }
  function cleanName(n) { return typeof n === 'string' ? n.replace(/[<>&"]/g, '').trim().slice(0, NAME_MAX) : ''; }
  function loadProfiles() {
    const v = jget(K_PROFILES, null);
    const c = cleanProfiles(v);
    if (!v || JSON.stringify(v) !== JSON.stringify(c)) jset(K_PROFILES, c);
    return c;
  }
  const list = () => loadProfiles().list.map(p => Object.assign({}, p));
  const get = id => list().find(p => p.id === id) || null;
  function current() { return get(cur) || { id: 1, name: NAMES[0], icon: ICONS[0] }; }
  function add(name, icon) {
    const s = loadProfiles();
    if (s.list.length >= MAX) return null;
    const id = s.list.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const used = s.list.map(p => p.icon), usedN = s.list.map(p => p.name);
    const p = {
      id,
      name: cleanName(name) || NAMES.find(n => usedN.indexOf(n) < 0) || '친구' + id,
      icon: ICONS.indexOf(icon) >= 0 ? icon : (ICONS.find(i => used.indexOf(i) < 0) || ICONS[0]),
    };
    // 같은 번호를 예전에 쓰다 지운 기록이 남아 있으면 먼저 치운다 (새 친구는 빈 기록으로)
    wipe(id);
    s.list.push(p);
    jset(K_PROFILES, s);
    return Object.assign({}, p);
  }
  function rename(id, name) {
    const s = loadProfiles(), p = s.list.find(x => x.id === id), n = cleanName(name);
    if (!p || !n) return false;
    p.name = n; jset(K_PROFILES, s); return true;
  }
  function setIcon(id, icon) {
    const s = loadProfiles(), p = s.list.find(x => x.id === id);
    if (!p || ICONS.indexOf(icon) < 0) return false;
    p.icon = icon; jset(K_PROFILES, s); return true;
  }
  // 그 아이의 저장 키를 모두 지운다 (첫째는 접두어가 없어서 여기로 지울 수 없다)
  function wipe(id) {
    if (!(id > 1)) return 0;
    const pre = prefixOf(id);
    let n = 0;
    for (const k of raw.keys()) if (k.indexOf(pre) === 0) { raw.rm(k); n++; }
    return n;
  }
  function remove(id) {
    if (id === 1) return false;
    const s = loadProfiles();
    if (!s.list.some(p => p.id === id)) return false;
    wipe(id);
    s.list = s.list.filter(p => p.id !== id);
    if (s.active === id) s.active = 1;
    jset(K_PROFILES, s);
    const pa = parent();
    delete pa.limits[id]; delete pa.extra[id];
    jset(K_PARENT, pa);
    const t = loadTime();
    delete t.sec[id]; delete t.warn[id];
    jset(K_TIME, t);
    if (cur === id) cur = 1;
    return true;
  }
  // 아이 바꾸기: 저장하고 이 페이지의 접두어도 바로 바꾼다 (화면은 페이지를 다시 불러 새로 읽는다)
  function switchTo(id) {
    const s = loadProfiles();
    if (!s.list.some(p => p.id === id)) return false;
    s.active = id; jset(K_PROFILES, s);
    cur = id;
    return true;
  }

  // ─── 보호자 설정 ───
  function parent() {
    const v = jget(K_PARENT, null), out = { v: 1, limits: {}, extra: {}, volMax: 1 };
    if (!isObj(v)) return out;
    if (isObj(v.limits)) for (const k of Object.keys(v.limits)) { const m = Math.floor(Number(v.limits[k])); if (/^\d+$/.test(k) && LIMITS.indexOf(m) > 0) out.limits[k] = m; }
    if (isObj(v.extra)) for (const k of Object.keys(v.extra)) { const e = v.extra[k]; if (/^\d+$/.test(k) && isObj(e) && typeof e.day === 'string') out.extra[k] = { day: e.day.slice(0, 10), min: Math.min(600, Math.floor(num(e.min))) }; }
    out.volMax = capOf(v.volMax);
    return out;
  }
  function capOf(x) { const n = Number(x); return Number.isFinite(n) ? Math.max(0.25, Math.min(1, n)) : 1; }
  const limit = id => parent().limits[id] || 0;
  function setLimit(id, min) {
    min = Math.floor(Number(min)) || 0;
    if (LIMITS.indexOf(min) < 0) return false;
    const pa = parent();
    if (min) pa.limits[id] = min; else delete pa.limits[id];
    jset(K_PARENT, pa); return true;
  }
  function extraMin(id, day) { const e = parent().extra[id]; return e && e.day === (day || dayKey()) ? e.min : 0; }
  function addExtra(id, min, day) {
    day = day || dayKey(); min = Math.floor(num(min == null ? EXTRA_MIN : min));
    const pa = parent(), e = pa.extra[id];
    pa.extra[id] = { day, min: Math.min(600, (e && e.day === day ? e.min : 0) + min) };
    jset(K_PARENT, pa);
    return pa.extra[id].min;
  }
  const volMax = () => parent().volMax;
  function setVolMax(v) {
    const n = Number(v), snap = VOLS.reduce((b, x) => (Math.abs(x - n) < Math.abs(b - n) ? x : b), 1);
    const pa = parent(); pa.volMax = snap; jset(K_PARENT, pa);
    try { if (typeof SND !== 'undefined' && SND && SND.setCap) SND.setCap(snap); } catch (e) { /* 무시 */ }
    return snap;
  }

  // ─── 놀이 시간 ───
  function loadTime(day) {
    day = day || dayKey();
    const v = jget(K_TIME, null), out = { day, sec: {}, warn: {} };
    if (!isObj(v) || v.day !== day) return out; // 날짜가 바뀌면 새로 (경고도 다시)
    if (isObj(v.sec)) for (const k of Object.keys(v.sec)) if (/^\d+$/.test(k)) out.sec[k] = num(v.sec[k]);
    if (isObj(v.warn)) for (const k of Object.keys(v.warn)) { const w = v.warn[k]; if (/^\d+$/.test(k) && isObj(w)) out.warn[k] = { f10: w.f10 === true, f5: w.f5 === true, f0: w.f0 === true, last: num(w.last) }; }
    return out;
  }
  const played = (id, day) => loadTime(day).sec[id] || 0;
  function addPlayed(id, sec, day) {
    sec = num(sec);
    const t = loadTime(day);
    t.sec[id] = Math.round(((t.sec[id] || 0) + sec) * 10) / 10;
    jset(K_TIME, t);
    return t.sec[id];
  }
  // 남은 초 (제한 없으면 null, 넘으면 음수)
  function leftSec(id, day, extraPlayed) {
    const lim = limit(id);
    if (!lim) return null;
    return (lim + extraMin(id, day)) * 60 - played(id, day) - (extraPlayed || 0);
  }
  // 남은 분 (보여 주기용, 올림. 제한 없으면 null)
  function leftMin(id, day) { const l = leftSec(id, day); return l == null ? null : Math.max(0, Math.ceil(l / 60)); }

  // 알림 판정 (순수): st = {f10, f5, f0, last}를 고치고 알릴 종류('soon' 10분 · 'sooner' 5분 · 'over' 끝)나 null을 돌려준다.
  // left: 남은 초(null이면 제한 없음), playedSec: 오늘 논 초. 시간이 다시 늘면(10분 더·제한 바꿈) 알림을 다시 켠다
  function warnStep(st, left, playedSec) {
    if (left == null) return null;
    if (left > 0 && st.f0) st.f0 = st.f5 = st.f10 = false; // 끝난 뒤 시간을 더 받았으면 처음부터
    if (left > WARN.soon) st.f10 = false;
    if (left > WARN.sooner) st.f5 = false;
    if (left <= 0) {
      if (!st.f0) { st.f0 = st.f5 = st.f10 = true; st.last = playedSec; return 'over'; }
      if (playedSec - st.last >= WARN.again) { st.last = playedSec; return 'over'; }
      return null;
    }
    if (left <= WARN.sooner) { if (!st.f5) { st.f5 = st.f10 = true; return 'sooner'; } return null; }
    if (left <= WARN.soon && !st.f10) { st.f10 = true; return 'soon'; }
    return null;
  }
  function warnText(kind, left) {
    if (kind === 'over') return { icon: '🌙', text: '약속한 놀이 시간이 끝났어요! 이 판을 마치고 쉬어요' };
    return { icon: '⏰', text: '놀이 시간이 ' + Math.max(1, Math.ceil(left / 60)) + '분 남았어요' };
  }

  // ─── 판 도는 동안 세기 (게임 페이지) ───
  let playing = false, mark = 0, pend = 0, timer = 0, lastWrite = 0;
  const now = () => Date.now();
  const visible = () => !D || D.visibilityState !== 'hidden';
  const counting = () => playing && visible();
  function settle() {
    if (mark) { const t = now(); pend += Math.min(15, Math.max(0, (t - mark) / 1000)); mark = t; }
    if (!counting()) mark = 0;
    else if (!mark) mark = now();
  }
  function flush() {
    if (pend <= 0) return;
    addPlayed(cur, pend); pend = 0; lastWrite = now();
  }
  // 알림 확인: 남은 시간을 보고 알릴 것이 있으면 알림 띄우기. force: 판 시작 때 이미 끝났으면 바로 한 번
  function check(force) {
    const t = loadTime(), id = cur, p = (t.sec[id] || 0) + pend, left = leftSec(id, null, pend);
    if (left == null) return null;
    const st = t.warn[id] || { f10: false, f5: false, f0: false, last: 0 }, was = JSON.stringify(st);
    let kind = warnStep(st, left, p);
    if (!kind && force && left <= 0) { kind = 'over'; st.last = p; }
    if (JSON.stringify(st) !== was) { t.warn[id] = st; jset(K_TIME, t); }
    if (kind) { const m = warnText(kind, left); toast(m.text, m.icon, kind); }
    return kind;
  }
  function tick() {
    settle();
    if (pend > 0 && now() - lastWrite >= TICK - 50) flush();
    if (counting()) check(false);
  }
  function setPlaying(b) {
    b = !!b;
    if (b === playing) return;
    settle();
    playing = b;
    settle();
    if (!timer && typeof setInterval !== 'undefined') timer = setInterval(tick, TICK);
    if (b) check(true);
  }

  // ─── 기록 옮기기: 내보내기 · 불러오기 (2026-09-28 소유자 승인) ───
  // 브라우저에서 앱(안드로이드 WebView)으로, 태블릿에서 태블릿으로. 글 코드(base64) 하나 또는 .json 파일.
  // 묶음(payload) = { app:'ppyong-kids', v:1, sum, data }, data = { at, scope:'one'|'all', kids:[{name, icon, limit, keys:{키: 저장된 글}}], device? }
  //   sum은 JSON.stringify(data)의 FNV-1a (복사하다 잘리거나 바뀐 코드를 알아챈다). device(소리 설정·소리 크기 상한)는 '모든 아이'일 때만
  const APP = 'ppyong-kids', XV = 1;
  // 그 아이 것인 저장 키 (원래 키 이름 목록). 첫째: 접두어 없는 키 중 공통 키가 아닌 것, 둘째부터: p<id>: 로 시작하는 것
  function ownKeys(id) {
    const pre = prefixOf(id);
    return raw.keys().filter(k => (pre ? k.indexOf(pre) === 0 : !shared(k)));
  }
  function wipeOwn(id) { const ks = ownKeys(id); for (const k of ks) raw.rm(k); return ks.length; }
  function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64enc(bin) {
    let out = '';
    for (let i = 0; i < bin.length; i += 3) {
      const a = bin.charCodeAt(i), b = bin.charCodeAt(i + 1), c = bin.charCodeAt(i + 2), n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bin.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bin.length ? B64[n & 63] : '=');
    }
    return out;
  }
  function b64dec(s) {
    s = s.replace(/[^A-Za-z0-9+/]/g, '');
    let out = '';
    for (let i = 0; i < s.length; i += 4) {
      const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63);
      out += String.fromCharCode((n >> 16) & 255);
      if (i + 2 < s.length) out += String.fromCharCode((n >> 8) & 255);
      if (i + 3 < s.length) out += String.fromCharCode(n & 255);
    }
    return out;
  }
  const utf8 = s => unescape(encodeURIComponent(s));
  const unutf8 = s => decodeURIComponent(escape(s));
  function kidData(id) {
    const p = get(id);
    if (!p) return null;
    const pre = prefixOf(id), keys = {};
    for (const k of ownKeys(id)) { const v = raw.get(k); if (v != null) keys[pre ? k.slice(pre.length) : k] = v; }
    return { name: p.name, icon: p.icon, limit: limit(id), keys };
  }
  // who: 아이 id 또는 'all'. 돌려주는 값: 묶음 (파일에 그대로 쓴다)
  function exportData(who, when) {
    const at = (when || new Date()).toISOString();
    const all = who === 'all';
    const kids = (all ? list().map(p => p.id) : [who]).map(kidData).filter(Boolean);
    const data = { at, scope: all ? 'all' : 'one', kids };
    if (all) data.device = { volMax: volMax(), sound1: raw.get('play.sound1') };
    return { app: APP, v: XV, sum: fnv(JSON.stringify(data)), data };
  }
  const exportCode = (who, when) => b64enc(utf8(JSON.stringify(exportData(who, when))));
  const exportFileName = d => { d = d || new Date(); return 'ppyong-kids-' + dayKey(d).replace(/-/g, '') + '.json'; };
  // 코드(base64)나 파일 글(JSON)을 읽는다. 돌려주는 값: {ok:true, data} 또는 {ok:false, msg}
  const BAD = '코드가 망가졌어요. 처음부터 다시 복사해 주세요';
  function decode(text) {
    let s = String(text == null ? '' : text).trim();
    if (!s) return { ok: false, msg: '코드를 붙여 넣거나 파일을 골라 주세요' };
    let o = null;
    try { o = JSON.parse(s[0] === '{' ? s : unutf8(b64dec(s))); } catch (e) { return { ok: false, msg: BAD }; }
    if (!isObj(o) || o.app !== APP) return { ok: false, msg: '이 게임 모음의 기록 코드가 아니에요' };
    if (!(Number(o.v) >= 1)) return { ok: false, msg: BAD };
    if (Number(o.v) > XV) return { ok: false, msg: '더 새 버전에서 만든 코드예요. 게임을 새로 고친 뒤 다시 해 보세요' };
    if (!isObj(o.data) || o.sum !== fnv(JSON.stringify(o.data))) return { ok: false, msg: BAD };
    const d = o.data;
    if (!Array.isArray(d.kids) || !d.kids.length || d.kids.length > MAX) return { ok: false, msg: BAD };
    for (const k of d.kids) {
      if (!isObj(k) || !isObj(k.keys)) return { ok: false, msg: BAD };
      for (const key of Object.keys(k.keys)) if (typeof k.keys[key] !== 'string' || shared(key)) return { ok: false, msg: BAD };
    }
    return { ok: true, data: d };
  }
  // 미리 보기: 아이마다 이름·그림·별코인·메달·스티커 수, 만든 날
  function preview(d) {
    return d.kids.map(k => {
      let hub = null;
      try { hub = JSON.parse(k.keys['play.hub1'] || 'null'); } catch (e) { hub = null; }
      let medals = 0;
      if (isObj(hub) && isObj(hub.games)) for (const g of Object.keys(hub.games)) medals += Math.floor(num(hub.games[g] && hub.games[g].medals));
      return {
        name: cleanName(k.name) || '친구', icon: ICONS.indexOf(k.icon) >= 0 ? k.icon : ICONS[0],
        coins: isObj(hub) ? Math.floor(num(hub.coins)) : 0, medals, stickers: isObj(hub) && isObj(hub.stickers) ? Object.keys(hub.stickers).length : 0,
        keys: Object.keys(k.keys).length, at: typeof d.at === 'string' ? d.at.slice(0, 10) : '',
      };
    });
  }
  function writeKid(id, k) {
    const pre = prefixOf(id);
    wipeOwn(id);
    for (const key of Object.keys(k.keys)) raw.set(pre + key, k.keys[key]);
    const lim = Math.floor(Number(k.limit)) || 0;
    if (LIMITS.indexOf(lim) >= 0) setLimit(id, lim);
  }
  // 한 아이 불러오기. target: 'new'(새 아이로 추가) 또는 덮어쓸 아이 id (이름·그림은 그 아이 것 그대로). 돌려주는 값: 받은 아이 id 또는 0
  function importKid(d, target, i) {
    const k = d.kids[i || 0];
    if (!k) return 0;
    let id = target;
    if (target === 'new') { const p = add(k.name, k.icon); if (!p) return 0; id = p.id; }
    else if (!get(id)) return 0;
    writeKid(id, k);
    return id;
  }
  // 모두 새 아이로 추가 (자리가 모자라면 아무것도 안 하고 0)
  function importAllNew(d) {
    if (list().length + d.kids.length > MAX) return 0;
    let n = 0;
    for (let i = 0; i < d.kids.length; i++) if (importKid(d, 'new', i)) n++;
    return n;
  }
  // 이 기기 기록을 모두 바꾸기: 지금 아이들 기록을 다 지우고 코드의 아이들로 (첫 아이가 첫째 자리). '모든 아이' 코드면 소리 설정도
  function importReplace(d) {
    for (const p of list()) wipeOwn(p.id);
    for (const k of raw.keys()) if (OWN.test(k)) raw.rm(k);
    const kids = d.kids.slice(0, MAX);
    jset(K_PROFILES, { v: 1, list: kids.map((k, i) => ({ id: i + 1, name: cleanName(k.name) || NAMES[i], icon: ICONS.indexOf(k.icon) >= 0 ? k.icon : ICONS[0] })), active: 1 });
    const pa = parent(); pa.limits = {}; pa.extra = {};
    if (isObj(d.device) && d.device.volMax != null) pa.volMax = capOf(d.device.volMax);
    jset(K_PARENT, pa);
    jset(K_TIME, { day: dayKey(), sec: {}, warn: {} });
    if (isObj(d.device) && typeof d.device.sound1 === 'string') raw.set('play.sound1', d.device.sound1);
    kids.forEach((k, i) => writeKid(i + 1, k));
    cur = 1;
    return kids.length;
  }

  // ─── 화면 도구 (document가 있을 때만) ───
  const still = () => { try { return !!(W && W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CSS = [
    '#pf-toast{position:fixed;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + var(--pf-toast-y,0px));z-index:9999;display:flex;align-items:center;gap:10px;max-width:min(92vw,560px);',
    'padding:8px 18px 8px 12px;border-radius:24px;background:rgba(18,24,44,.94);border:2px solid #ffe08a;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.45);',
    'font:normal 22px/1.25 "Jua","Noto Sans KR",sans-serif;cursor:pointer;opacity:0;transform:translate(-50%,-140%);transition:opacity .25s,transform .35s cubic-bezier(.2,1.3,.4,1);pointer-events:none;word-break:keep-all}',
    '#pf-toast.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}',
    '#pf-toast.over{border-color:#b8a4ff;background:rgba(30,20,60,.95)}',
    '#pf-toast i{font-style:normal;font-size:28px;line-height:1}',
    '@media (max-height:600px){#pf-toast{font-size:19px;padding:6px 16px 6px 10px}#pf-toast i{font-size:24px}}',
    '@media (prefers-reduced-motion:reduce){#pf-toast{transition:none;transform:translate(-50%,0)}}',
    '.pf-badge{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px 0 8px;border-radius:999px;background:rgba(12,16,26,.85);',
    'border:1px solid rgba(255,255,255,.28);color:#fff;font:normal 16px "Jua","Noto Sans KR",sans-serif;white-space:nowrap;pointer-events:none}',
    '.pf-badge i{font-style:normal;font-size:18px;line-height:1}',
    '.pf-badge[hidden]{display:none}',
    '.tpanel>.pf-badge{position:absolute;top:0;right:22px;transform:translateY(-50%);z-index:2}',
    '#scr-title .panel.tpanel{position:relative}',
  ].join('');
  let toastEl = null, toastTimer = 0;
  function ensureCss() {
    if (!D || D.getElementById('pf-css')) return;
    const s = D.createElement('style'); s.id = 'pf-css'; s.textContent = CSS;
    (D.head || D.documentElement).appendChild(s);
  }
  function toast(text, icon, kind) {
    P.lastToast = { text, icon: icon || '', kind: kind || '', at: now() };
    if (!D || !D.body) return;
    ensureCss();
    if (!toastEl) {
      toastEl = D.createElement('div'); toastEl.id = 'pf-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
      const hide = e => { if (e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); } toastEl.classList.remove('on'); };
      toastEl.addEventListener('pointerdown', hide);
      toastEl.addEventListener('click', hide);
      D.body.appendChild(toastEl);
    }
    toastEl.innerHTML = (icon ? '<i aria-hidden="true">' + esc(icon) + '</i>' : '') + '<span>' + esc(text) + '</span>';
    toastEl.classList.toggle('over', kind === 'over');
    if (still()) toastEl.classList.add('on');
    else { toastEl.classList.remove('on'); void toastEl.offsetWidth; toastEl.classList.add('on'); }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl && toastEl.classList.remove('on'), 4000);
    try { if (typeof SND !== 'undefined' && SND && SND.ui) SND.ui(kind === 'over' ? 'continueAsk' : 'sticker'); } catch (e) { /* 무시 */ }
  }
  // 게임 시작 화면의 작은 이름표 (읽기만): <span class="pf-badge" data-pf-badge hidden></span>
  function renderBadges() {
    if (!D) return;
    ensureCss();
    const p = current();
    D.querySelectorAll('[data-pf-badge]').forEach(el => {
      el.innerHTML = '<i aria-hidden="true">' + esc(p.icon) + '</i><span>' + esc(p.name) + '</span>';
      el.setAttribute('aria-label', '지금 노는 친구: ' + p.name);
      el.hidden = false;
    });
  }

  function init() {
    cur = loadProfiles().active;
    wrap();
    if (!W || !W.addEventListener) return;
    // 다른 탭에서 온 저장 알림: 다른 아이 키면 이 페이지에는 안 알린다, 제 키면 접두어를 떼서 알린다 (게임·본부 코드는 그대로)
    W.addEventListener('storage', e => {
      try {
        if (!e || e.storageArea !== LS || e.key == null) return;
        const k = e.key;
        if (k === K_PROFILES) { const a = cleanProfiles(jget(K_PROFILES, null)).active; if (a !== cur && P.onSwitchElsewhere) P.onSwitchElsewhere(a); return; }
        if (SHARED.indexOf(k) >= 0 || (!OWN.test(k) && shared(k))) return;
        const pre = prefixOf(cur);
        if (pre ? k.indexOf(pre) === 0 : !OWN.test(k)) { if (pre) Object.defineProperty(e, 'key', { value: k.slice(pre.length), configurable: true }); return; }
        e.stopImmediatePropagation();
      } catch (err) { /* 무시 */ }
    }, true);
    if (D) {
      D.addEventListener('visibilitychange', () => { settle(); if (!visible()) flush(); });
      const ready = () => renderBadges();
      if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', ready); else ready();
    }
    W.addEventListener('pagehide', () => { settle(); flush(); });
    // 뒤로 가기 저장본에서 살아났는데 그사이 아이가 바뀌었으면: 새 아이 기록으로 다시 불러온다
    W.addEventListener('pageshow', e => { if (e && e.persisted && cleanProfiles(jget(K_PROFILES, null)).active !== cur) { try { location.reload(); } catch (err) { /* 무시 */ } } });
  }

  Object.assign(P, {
    KEYS: { profiles: K_PROFILES, parent: K_PARENT, time: K_TIME }, SHARED, MAX, ICONS, NAMES, LIMITS, VOLS, EXTRA_MIN, WARN, NAME_MAX,
    dayKey, isShared: shared, prefixOf, mapKey, raw, visibleKeys,
    cleanProfiles, list, get, current, activeId: () => cur, add, rename, setIcon, remove, switchTo, wipe,
    parent, limit, setLimit, extraMin, addExtra, volMax, setVolMax, capOf,
    loadTime, played, addPlayed, leftSec, leftMin, warnStep, warnText,
    setPlaying, playing: () => playing, check, toast, renderBadges,
    ownKeys, exportData, exportCode, exportFileName, decode, preview, importKid, importAllNew, importReplace,
    onSwitchElsewhere: null,
    // 테스트·점검용: 놀이 시간을 빨리 감기
    debug: {
      addPlayed(sec) { addPlayed(cur, sec); return check(false); },
      tick,
      pending: () => pend,
    },
  });
  init();
})(PROFILE);
