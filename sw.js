// Service Worker - 网络优先策略，确保刷新能看到最新版本
const CACHE = 'daily-workspace-v138';
const VER = CACHE.replace('daily-workspace-', ''); // 页面显示用的版本号，如 'v118'
const ASSETS = ['./index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  // 关键：先 skipWaiting 确保新 SW 必定激活，避免 addAll 任一资源失败导致整段 reject、
  // 新 SW 卡在 waiting、旧 SW 永远控制页面、用户卡在旧版本（v137→v138 升级时曾出现"硬刷都刷不出新版"即此因）
  e.waitUntil((async () => {
    await self.skipWaiting();
    try { const cache = await caches.open(CACHE); await cache.addAll(ASSETS); } catch (_) {}
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() => {
      // 广播当前版本号给所有已打开的页面（用于「刷新提示」与常驻徽章显示实际版本）
      self.clients.matchAll({includeUncontrolled: true}).then(cs => cs.forEach(c => {
        try { c.postMessage({type: 'SW_VERSION', ver: VER}); } catch (_) {}
      }));
    })
  );
});

// 页面主动询问当前版本（首次加载即可显示，无需等待下一次更新）
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'GET_VERSION') {
    const src = e.source;
    if (src && src.postMessage) { try { src.postMessage({type: 'SW_VERSION', ver: VER}); } catch (_) {} }
  }
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
