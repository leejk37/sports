// 앱 껍데기(화면·라이브러리·아이콘)를 기기에 저장해 빠르게 열리게 합니다.
// 파일을 고쳐 올릴 때마다 VERSION 숫자를 올리면 기기들이 새 버전을 받습니다.
const VERSION = 'qr-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './lib/html5-qrcode.min.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 기록 전송(POST)과 다른 사이트 요청은 건드리지 않습니다.
// 내 파일은 '인터넷 먼저, 안 되면 저장본' 순서로 엽니다.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
