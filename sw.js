// Service Worker - 网络优先策略，确保刷新能看到最新版本
const CACHE = 'daily-workspace-v106';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 跨域 CDN（ECharts）走缓存优先，保证首次联网加载后可离线使用（中国地图 GeoJSON 已改为本地同源文件）
  const CDN_HOSTS = ['cdn.jsdelivr.net'];
  try {
    const u = new URL(e.request.url);
    if (CDN_HOSTS.includes(u.host)) {
      e.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const resp = await fetch(e.request);
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        } catch (err) {
          return cached || Response.error();
        }
      })());
      return;
    }
  } catch (_) {}
  // 导航请求（HTML页面）使用网络优先策略，确保刷新能看到最新内容
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // 静态资源使用缓存优先策略
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
