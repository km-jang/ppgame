'use strict';
// 오프라인 실행: 게임 파일을 기기에 저장해 두고 인터넷 없이도 연다.
// 파일이 바뀌면 VERSION을 올린다. 옛 저장본은 snake- 로 시작하는 것만 지운다 (다른 게임 것은 건드리지 않음).
const VERSION = 'snake-v6';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.svg',
  'js/util.js', 'js/data.js', 'js/world.js', 'js/render.js', 'js/input.js', 'js/audio.js', 'js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('snake-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 저장본 먼저(빠름), 뒤에서 새 버전 받아 두기. 글꼴도 한 번 받으면 저장본 사용
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (e.request.method !== 'GET' || (url.origin !== location.origin && !isFont)) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// 첫 방문 때 받은 글꼴을 페이지가 알려 주면 저장한다 (다음부터 인터넷 없이도 같은 글꼴)
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'cache-fonts' || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(VERSION).then(cache => Promise.all(d.urls
    .filter(u => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u))
    .map(u => cache.match(u).then(hit => hit || fetch(u).then(r => { if (r.ok) return cache.put(u, r); }).catch(() => {}))))));
});
