'use strict';
// 오프라인 실행: 게임 파일을 기기에 저장해 두고 인터넷 없이도 연다.
// 파일이 바뀌면 VERSION을 올린다.
const VERSION = 'ngun-v1';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.svg',
  'js/util.js', 'js/data.js', 'js/world.js', 'js/render.js', 'js/input.js', 'js/audio.js', 'js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ngun-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 저장본 먼저(빠름), 뒤에서 새 버전 받아 두기
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
