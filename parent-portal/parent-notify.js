// --- Notification System ---
const PUBLIC_VAPID_KEY = "BOA2LGHT-fbTvPMpNOahcwDtsDJRMebMSXGf99sGONyOO7sE3_CkPPvl4sQxsP_dQK3rxt8feaJ4Ryfjt_e1hyo"; // Actual VAPID key

function setupNotifications() {
  const bellBtn = document.getElementById('notify-bell-btn');
  const badge = document.getElementById('notify-badge');
  if (!bellBtn) return;
  
  // Create Dropdown
  const dropdown = document.createElement('div');
  dropdown.id = 'notify-dropdown';
  dropdown.style.cssText = 'position:absolute; right:12px; top:54px; width:300px; max-height:400px; background:#fff; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.1); z-index:9999; display:none; flex-direction:column; overflow:hidden; border:1px solid #e2e8f0;';
  
  const header = document.createElement('div');
  header.style.cssText = 'padding:12px 16px; border-bottom:1px solid #e2e8f0; font-weight:700; font-size:14px; color:#1e293b; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;';
  header.innerHTML = '<span>通知中心</span><button id="notify-enable-btn" style="background:#3b82f6; color:#fff; border:none; padding:4px 8px; border-radius:6px; font-size:11px; cursor:pointer;">开启推送</button>';
  
  const list = document.createElement('div');
  list.id = 'notify-list';
  list.style.cssText = 'overflow-y:auto; flex:1; max-height:300px; background:#fff; text-align:left;';
  
  dropdown.appendChild(header);
  dropdown.appendChild(list);
  document.body.appendChild(dropdown);
  
  let isOpen = false;
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    dropdown.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
      loadNotifications();
    }
  });
  
  document.addEventListener('click', (e) => {
    if (isOpen && !dropdown.contains(e.target) && e.target !== bellBtn) {
      isOpen = false;
      dropdown.style.display = 'none';
    }
  });

  const enableBtn = header.querySelector('#notify-enable-btn');
  enableBtn.addEventListener('click', async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const studentId = getStudentId();
        
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const swReg = await navigator.serviceWorker.ready;
          const subscription = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: PUBLIC_VAPID_KEY
          });
          
          await fetch(`${API_BASE_URL}/notifications/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify({
              user_type: 'parent',
              user_id: studentId,
              subscription: subscription
            })
          });
        }
        
        alert('系统推送通知已开启，排课变动将及时通知您。');
        enableBtn.style.display = 'none';
      } else {
        alert('推送通知权限被拒绝。');
      }
    } catch (e) {
      console.error(e);
    }
  });
  
  // Initial check
  if (window.Notification && Notification.permission === 'granted') {
    enableBtn.style.display = 'none';
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service Worker registration failed:', err);
    });
  }
  
  // Load unread count
  loadNotifications(true);
}

async function loadNotifications(onlyCount = false) {
  const studentId = getStudentId();
  if (!studentId) return;
  try {
    const res = await apiGet('/notifications/history?user_type=parent&user_id=' + studentId);
    let data = [];
    if (res && res.data) data = res.data;
    
    const unreadCount = data.filter(n => !n.is_read).length;
    const badge = document.getElementById('notify-badge');
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
    
    if (onlyCount) return;
    
    const list = document.getElementById('notify-list');
    if (data.length === 0) {
      list.innerHTML = '<div style="padding:32px 16px; text-align:center; color:#94a3b8; font-size:12px;">暂无通知</div>';
      return;
    }
    
    let html = '';
    data.forEach(n => {
      const bg = n.is_read ? '#fff' : '#f0fdf4';
      const icon = n.action_type === 'cancelled' ? '⚠️' : (n.action_type === 'updated' ? '⏰' : '📅');
      html += `<div onclick="markNotifyRead(${n.id})" style="padding:12px 16px; border-bottom:1px solid #f1f5f9; background:${bg}; cursor:pointer; transition:background 0.2s;">
        <div style="display:flex; align-items:start; gap:10px;">
          <span style="font-size:18px; margin-top:2px;">${icon}</span>
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:600; color:#1e293b; margin-bottom:4px;">${escapeHtml(n.title)}</div>
            <div style="font-size:12px; color:#475569; line-height:1.4;">${escapeHtml(n.body)}</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:6px;">${new Date(n.created_at).toLocaleString()}</div>
          </div>
          ${!n.is_read ? '<div style="width:8px; height:8px; background:#ef4444; border-radius:50%; margin-top:6px;"></div>' : ''}
        </div>
      </div>`;
    });
    list.innerHTML = html;
    
  } catch (e) {
    console.error('Failed to load notifications:', e);
  }
}

window.markNotifyRead = async function(id) {
  try {
    await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY }
    });
    loadNotifications(); // Reload list
  } catch (e) {
    console.error(e);
  }
};

// Call setup on load
document.addEventListener('DOMContentLoaded', setupNotifications);
