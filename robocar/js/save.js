'use strict';
// 기록 지키기. 게임 기록은 태블릿 브라우저 저장소(localStorage)에 있다. 여기서 세 겹으로 지킨다.
//  1) 예비 사본: 저장할 때마다 전체를 한 덩어리로 localStorage('rc.backup')와 IndexedDB 두 곳에 더 적는다.
//     하나가 깨지거나 비어도 다른 데서 되살린다 (시작할 때 자동).
//  2) 지워지지 않게 요청: navigator.storage.persist(). 브라우저가 저장 공간이 모자랄 때 스스로 지우는 것을 막는다.
//  3) 옮기기: 보호자 화면에서 기록을 파일·코드로 내보내고, 다른 태블릿이나 브라우저를 지운 뒤에 불러온다.
// 서버로 보내는 것은 없다 (돈 0원, 데이터 수집 없음).
(function (RC) {
  const KEYS = ['rc.cfg', 'rc.prog', 'rc.set', 'rc.play'];
  const BK = 'rc.backup';
  const hasLS = (() => { try { const k = '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })();

  function readJSON(k) { try { const v = localStorage.getItem(k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } }
  function snapshot() { const d = {}; for (const k of KEYS) { const v = readJSON(k); if (v !== undefined) d[k] = v; } return { v: 1, ts: Date.now(), data: d }; }
  function valid(b) { return b && b.v === 1 && b.data && typeof b.data === 'object' && b.data['rc.prog'] && typeof b.data['rc.prog'] === 'object'; }
  function writeAll(data) { for (const k of KEYS) if (data[k] !== undefined) try { localStorage.setItem(k, JSON.stringify(data[k])); } catch (e) { /* 무시 */ } }

  // ─── IndexedDB (두 번째 예비 사본) ─────────────────────────
  function idb() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open('robocar-save', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  function idbPut(v) { return idb().then(db => new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'backup'); t.oncomplete = () => { db.close(); res(true); }; t.onerror = () => { db.close(); res(false); }; })).catch(() => false); }
  function idbGet() { return idb().then(db => new Promise(res => { const t = db.transaction('kv', 'readonly'); const q = t.objectStore('kv').get('backup'); q.onsuccess = () => { db.close(); res(q.result); }; q.onerror = () => { db.close(); res(undefined); }; })).catch(() => undefined); }

  // 저장할 때마다 부른다 (가볍게: 0.5초에 한 번까지)
  // wasEmpty: 시작할 때 본 기록도 예비 사본도 없었다. 이때는 IndexedDB를 다 볼 때까지 예비 사본을 쓰지 않는다
  // (새로 만든 빈 기록이 IndexedDB의 좋은 사본을 덮지 않게)
  let pend = 0, wasEmpty = false, hold = false;
  // frozen: 예비 사본을 되살렸거나 불러와서 곧 다시 연다. 그 사이 게임이 들고 있는 옛 기록으로 덮어쓰지 않게 저장을 멈춘다
  let frozen = false;
  function backup() {
    if (!hasLS || pend || hold || frozen) return;
    pend = setTimeout(() => {
      pend = 0;
      const s = snapshot();
      if (!valid(s)) return;
      try { localStorage.setItem(BK, JSON.stringify(s)); } catch (e) { /* 무시 */ }
      idbPut(s);
    }, 500);
  }

  // 지금 바로 (게임을 닫거나 다른 앱으로 갈 때: 0.5초 기다리면 그 사이에 꺼질 수 있다)
  function backupNow() {
    if (!hasLS || hold || frozen) return;
    if (pend) { clearTimeout(pend); pend = 0; }
    const s = snapshot();
    if (!valid(s)) return;
    try { localStorage.setItem(BK, JSON.stringify(s)); } catch (e) { /* 무시 */ }
    idbPut(s);
  }

  // 시작할 때(게임이 기록을 읽기 전에) 부른다: 본 기록이 비었거나 깨졌으면 예비 사본으로 되살린다
  let restored = '';
  function restoreSync() {
    if (!hasLS) return '';
    const prog = readJSON('rc.prog');
    if (prog && typeof prog === 'object') return '';
    const b = readJSON(BK);
    if (valid(b)) { writeAll(b.data); restored = 'local'; } else { wasEmpty = true; hold = true; }
    return restored;
  }
  // localStorage가 통째로 비었으면 IndexedDB를 본다. 찾으면 되살리고 onFound() (다시 읽기)
  // (그 사이 게임이 새 빈 기록을 적었어도 wasEmpty면 되살린다)
  function restoreAsync(onFound) {
    if (!hasLS) return;
    // 기록이 있으면 여는 김에 두 번째 사본도 새로 적어 둔다 (닫을 때 적는 것은 브라우저가 끊을 수 있다)
    if (!wasEmpty) { backup(); return; }
    idbGet().then(b => {
      hold = false;
      if (valid(b)) { writeAll(b.data); try { localStorage.setItem(BK, JSON.stringify(b)); } catch (e) { /* 무시 */ } restored = 'idb'; frozen = true; onFound && onFound(); }
      else backup();
    });
  }

  // ─── 지워지지 않게 요청 ──────────────────────────────────
  let persisted = null;
  function persist() {
    try {
      if (!navigator.storage || !navigator.storage.persist) { persisted = false; return Promise.resolve(false); }
      return navigator.storage.persisted().then(p => p || navigator.storage.persist()).then(p => { persisted = !!p; return persisted; }).catch(() => { persisted = false; return false; });
    } catch (e) { persisted = false; return Promise.resolve(false); }
  }

  // ─── 내보내기·불러오기 ───────────────────────────────────
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const unb64 = s => decodeURIComponent(escape(atob(s)));
  function exportCode() { return 'RC1-' + b64(JSON.stringify(snapshot())); }
  function exportFile() {
    const s = snapshot(), name = 'robocar-record-' + new Date().toISOString().slice(0, 10) + '.json';
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) { return false; }
  }
  // 파일 내용(JSON) 또는 코드(RC1-...)를 받아 기록을 바꾼다. 성공하면 true (그다음 페이지를 다시 연다)
  function importText(text) {
    let b = null;
    try {
      const t = String(text || '').trim();
      b = t.indexOf('RC1-') === 0 ? JSON.parse(unb64(t.slice(4))) : JSON.parse(t);
    } catch (e) { return false; }
    if (!valid(b)) return false;
    writeAll(b.data);
    try { localStorage.setItem(BK, JSON.stringify(b)); } catch (e) { /* 무시 */ }
    idbPut(b);
    frozen = true;
    return true;
  }

  RC.Save = {
    backup, backupNow, restoreSync, restoreAsync, persist, exportCode, exportFile, importText,
    get persisted() { return persisted; }, get frozen() { return frozen; }, get restored() { return restored; }, get available() { return hasLS; },
    lastBackup() { const b = readJSON(BK); return b && b.ts || 0; },
  };
  // 게임이 기록을 읽기 전에 바로 되살려 둔다
  restoreSync();
})(RC);
