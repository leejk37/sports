/* 점핑잭 PWA 서비스 워커
 * 화면 파일을 고치면 아래 VERSION 숫자를 올려 주세요(예: v2 → v3). */
const VERSION = 'jj-v1';
const CORE = ['./', './index.html', './manifest.webmanifest',
              './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
// 동작 인식 모델·라이브러리(용량이 커서 한 번 받아 두면 다음부터 빨리 열림)
const CDN = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('jj-') && k !== VERSION).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // GAS 저장(POST)은 건드리지 않음
  const url = new URL(req.url);
  if (url.hostname.includes('script.google')) return;     // GAS 응답도 캐시하지 않음

  // 내 화면 파일: 인터넷 먼저 → 실패하면 저장본 (수정 사항이 바로 반영됨)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 모델·라이브러리: 저장본 먼저 → 없으면 받아서 저장
  if (CDN.some(h => url.hostname.includes(h))) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }))
    );
  }
});
