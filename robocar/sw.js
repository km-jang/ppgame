// 오프라인 실행: 게임 파일과 글꼴을 태블릿에 저장해 두고 인터넷 없이도 연다.
// 파일이 바뀌면 VERSION을 올린다.
const VERSION = 'robocar-v3';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.svg',
  'js/data.js', 'js/run.js', 'js/art.js', 'js/car.js', 'js/scene.js', 'js/cards.js', 'js/sound.js', 'js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 게임 파일: 저장본 먼저(빠름), 뒤에서 새 버전 받아 두기. 글꼴: 한 번 받으면 저장본 사용.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !isFont) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request);
    const net = fetch(e.request).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
