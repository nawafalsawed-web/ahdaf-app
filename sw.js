/* Service Worker — مفتاح تدمير ذاتي: يلغي نفسه ويمسح كل الكاش القديم */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.navigate(c.url));   // أعد تحميل الصفحات بنسخة نظيفة
    } catch (e) {}
  })());
});
/* بدون كاش — كل شي من الشبكة مباشرة */
self.addEventListener('fetch', () => {});
