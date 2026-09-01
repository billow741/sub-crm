// 基础 Service Worker
// 当前主要作用是触发 PWA 的安装机制（Add to Home Screen）
// 后续如有需求，可以在这里添加离线缓存或消息推送逻辑

const CACHE_NAME = 'sunnybridge-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // 强制新版本立即激活
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim()); // 立即接管控制权
});

// 简单的网络优先策略（不缓存强要求）
// PWA 最基本的要求是有一个 fetch 事件监听器
self.addEventListener('fetch', (event) => {
  // 暂时不做强制离线缓存，确保每次获取最新数据
  event.respondWith(fetch(event.request));
});
