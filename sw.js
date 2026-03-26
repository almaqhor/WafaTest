self.addEventListener('install', (e) => { e.waitUntil(self.skipWaiting()); });
self.addEventListener('fetch', (e) => { return; }); // عامل خدمة بسيط جداً