/* 허브(최상위) 서비스 워커 — 허브 화면 파일만 관리하고,
 * 운동 앱 폴더(squat/, curlup/ 등)는 각자의 sw.js에 맡깁니다. */
const VERSION = 'hub-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const HUB_PATHS = CORE.map(p => new URL(p, self.registration.scope).pathname);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('hub-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;  // GAS·외부 파일은 그대로
  if (!HUB_PATHS.includes(url.pathname)) return;                            // 운동 앱 폴더는 건드리지 않음
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
