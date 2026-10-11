// 설치형 앱용 최소 서비스 워커: 항상 최신 파일을 네트워크에서 받음
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
