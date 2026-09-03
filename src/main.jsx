import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 捕获生产环境部署更新引起的动态 Chunk 404，自动刷新加载最新代码
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite dynamic import chunk failed, reloading page...', event);
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

