// API 配置
const API_BASE_URL = 'https://sunnybridge-crm-api.xiwanqin03.workers.dev/api/v1';
const API_KEY='sunnyb...2024';

// 当前选中的机构 ID（用于多机构数据隔离）
let _selectedOrgId = '';
let _userRole = 'super_admin'; // 默认超管，后续从登录态获取

// 机构端登录 token（localStorage 持久化）
let _orgToken = localStorage.getItem('org_token') || '';
let _orgId = localStorage.getItem('org_id') || '';
let _orgName = localStorage.getItem('org_name') || '';

export function setSelectedOrg(orgId) { _selectedOrgId = orgId; }
export function getSelectedOrg() { return _selectedOrgId; }
export function setUserRole(role) { _userRole = role; }
export function getUserRole() { return _userRole; }

// 机构端登录/登出
export function setOrgSession(token, orgId, orgName) {
  _orgToken = token;
  _orgId = String(orgId);
  _orgName = orgName;
  localStorage.setItem('org_token', token);
  localStorage.setItem('org_id', String(orgId));
  localStorage.setItem('org_name', orgName);
  // 机构端：设置角色为 org_admin，锁定 orgId
  _userRole = 'org_admin';
  _selectedOrgId = String(orgId);
}
export function clearOrgSession() {
  _orgToken = '';
  _orgId = '';
  _orgName = '';
  localStorage.removeItem('org_token');
  localStorage.removeItem('org_id');
  localStorage.removeItem('org_name');
  // 恢复超管
  _userRole = 'super_admin';
  _selectedOrgId = '';
}
export function getOrgSession() {
  return { token: _orgToken, orgId: _orgId, orgName: _orgName };
}
export function isOrgLoggedIn() {
  return !!_orgToken;
}

// 通用请求函数
export async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-User-Role': _userRole,
    ...(_selectedOrgId ? { 'X-Organization-Id': _selectedOrgId } : {}),
    ...options.headers,
  };
  // 机构端登录后附加 Authorization
  if (_orgToken) {
    headers['Authorization'] = `Bearer ${_orgToken}`;
  }
  const config = { ...options, headers };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  // 处理空响应（204 No Content）
  if (response.status === 204) {
    return null;
  }

  // 按 content-type 选择解析方式：后端可能因异常返回纯文本 500
  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = { error: { message: text || `HTTP ${response.status}` } };
  }

  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }
  return data;
}

// ============================================
// 学生相关操作
// ============================================
export const studentOps = {
  getAll: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/students?${query}` : '/students';
    const result = await request(endpoint);
    return result.data?.data || result.data || [];
  },
  getById: async (id) => {
    const result = await request(`/students/${id}`);
    return result.data;
  },
  add: async (student) => {
    const result = await request('/students', {
      method: 'POST',
      body: student,
    });
    return result.data;
  },
  update: async (id, updates) => {
    const result = await request(`/students/${id}`, {
      method: 'PATCH',
      body: updates,
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/students/${id}`, { method: 'DELETE' });
    return true;
  },
  getPaginated: async (page = 1, pageSize = 20, filters = {}) => {
    const params = { page, page_size: pageSize, ...filters };
    const query = new URLSearchParams(params).toString();
    const result = await request(`/students?${query}`);
    return result.data?.data || [];
  },
  search: async (searchTerm, status = '') => {
    const params = { search: searchTerm };
    if (status) params.status = status;
    const query = new URLSearchParams(params).toString();
    const result = await request(`/students?${query}`);
    return result.data?.data || [];
  },
  // 增加学生课时
  addHours: async (studentId, hours) => {
    const result = await request(`/students/${studentId}/add-hours`, {
      method: 'PATCH',
      body: { hours },
    });
    return result.data;
  },
  // 调整学生课时（可增可减）
  adjustHours: async (studentId, adjustment, reason) => {
    const result = await request(`/students/${studentId}/adjust-hours`, {
      method: 'PATCH',
      body: { adjustment, reason },
    });
    return result.data;
  },
};

// ============================================
// 课时包相关操作
// ============================================
export const packageOps = {
  getByStudent: async (studentId) => {
    const result = await request(`/packages/student/${studentId}`);
    return result.data?.data || result.data || [];
  },
  getAll: async () => {
    const result = await request('/packages');
    return result.data?.data || result.data || [];
  },
  add: async (studentId, pkg) => {
    // 使用正确的路由: /packages/student/:student_id
    const result = await request(`/packages/student/${studentId}`, {
      method: 'POST',
      body: pkg,
    });
    return result.data;
  },
  update: async (id, updates) => {
    const result = await request(`/packages/${id}`, {
      method: 'PATCH',
      body: updates,
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/packages/${id}`, { method: 'DELETE' });
    return true;
  },
  // 调整课时（管理员使用）
  adjust: async (packageId, adjustment, reason, notes = '') => {
    const result = await request(`/packages/${packageId}/adjust`, {
      method: 'POST',
      body: { adjustment, reason, notes },
    });
    return result.data;
  },
};

// ============================================
// 上课记录相关操作
// ============================================
export const classOps = {
  getByStudent: async (studentId, params = {}) => {
    const queryParams = { page_size: 100, ...params, student_id: studentId };
    const query = new URLSearchParams(queryParams).toString();
    const result = await request(`/classes?${query}`);
    return result.data?.data || result.data || [];
  },
  getAll: async (params = {}) => {
    const queryParams = { page_size: 1000, ...params };
    const query = new URLSearchParams(queryParams).toString();
    const result = await request(`/classes?${query}`);
    return result.data?.data || result.data || [];
  },
  // Returns full response including pagination meta
  getPage: async (page = 1, pageSize = 20, extraParams = {}) => {
    const queryParams = { page, page_size: pageSize, ...extraParams };
    const query = new URLSearchParams(queryParams).toString();
    const result = await request(`/classes?${query}`);
    return result.data || { data: [], pagination: { total: 0, pages: 0 } };
  },
  add: async (studentId, cls) => {
    const result = await request(`/classes/student/${studentId}`, {
      method: 'POST',
      body: cls,
    });
    return result.data;
  },
  update: async (id, updates) => {
    const result = await request(`/classes/${id}`, {
      method: 'PATCH',
      body: updates,
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/classes/${id}`, { method: 'DELETE' });
    return true;
  },
};

// ============================================
// 应收账款相关操作
// ============================================
export const receivableOps = {
  getByStudent: async (studentId) => {
    const result = await request(`/receivables/student/${studentId}`);
    return result.data?.data || result.data || [];
  },
  getAll: async () => {
    const result = await request('/receivables');
    return result.data?.data || result.data || [];
  },
  add: async (studentId, receivable) => {
    const result = await request(`/receivables/student/${studentId}`, {
      method: 'POST',
      body: receivable,
    });
    return result.data;
  },
  markPaid: async (id) => {
    const result = await request(`/receivables/${id}/paid`, {
      method: 'POST',
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/receivables/${id}`, { method: 'DELETE' });
    return true;
  },
};

// ============================================
// 付款记录相关操作
// ============================================
export const paymentOps = {
  getByStudent: async (studentId) => {
    // 使用正确的路由: /payments/student/:student_id
    const result = await request(`/payments/student/${studentId}`);
    return result.data?.data || result.data || [];
  },
  getAll: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const result = await request(query ? `/payments?${query}` : '/payments');
    return result.data?.data || result.data || [];
  },
  add: async (studentId, payment) => {
    // 使用正确的路由: /payments/student/:student_id
    const result = await request(`/payments/student/${studentId}`, {
      method: 'POST',
      body: payment,
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/payments/${id}`, { method: 'DELETE' });
    return true;
  },
}

// ============================================
// 课时变动记录
// ============================================
export const hourChangeOps = {
  getByStudent: async (studentId, params = {}) => {
    const queryParams = { page_size: 100, ...params };
    const query = new URLSearchParams(queryParams).toString();
    const result = await request(`/hour-changes/student/${studentId}?${query}`);
    return result.data?.data || result.data || [];
  },
};

// ============================================
// 教师相关操作
// ============================================
export const teacherOps = {
  getAll: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const result = await request(query ? `/teachers?${query}` : '/teachers');
    return result.data?.items || result.data?.data || result.data || [];
  },
  getById: async (id) => {
    const result = await request(`/teachers/${id}`);
    return result.data;
  },
  add: async (teacher) => {
    const result = await request('/teachers', {
      method: 'POST',
      body: teacher,
    });
    return result.data;
  },
  update: async (id, updates) => {
    const result = await request(`/teachers/${id}`, {
      method: 'PATCH',
      body: updates,
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/teachers/${id}`, { method: 'DELETE' });
    return true;
  },
};

// ============================================
// 课程相关操作
// ============================================

// ============================================
// 教师薪资相关操作
// ============================================
export const teacherPaymentOps = {
  getAll: async () => {
    const result = await request('/teacher-payments');
    return result.data?.data || result.data || [];
  },
  getById: async (id) => {
    const result = await request(`/teacher-payments/${id}`);
    return result.data;
  },
  create: async (data) => {
    const result = await request('/teacher-payments', {
      method: 'POST',
      body: data,
    });
    return result.data;
  },
  markPaid: async (id, paymentData) => {
    const result = await request(`/teacher-payments/${id}/pay`, {
      method: 'PATCH',
      body: paymentData,
    });
    return result.data;
  },
  cancel: async (id) => {
    const result = await request(`/teacher-payments/${id}/cancel`, {
      method: 'PATCH',
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/teacher-payments/${id}`, { method: 'DELETE' });
    return true;
  },
};
export const courseOps = {
  getAll: async () => {
    const result = await request('/courses');
    return result.data?.data || result.data || [];
  },
  getById: async (id) => {
    const result = await request(`/courses/${id}`);
    return result.data;
  },
  add: async (course) => {
    const result = await request('/courses', {
      method: 'POST',
      body: course,
    });
    return result.data;
  },
  update: async (id, updates) => {
    const result = await request(`/courses/${id}`, {
      method: 'PATCH',
      body: updates,
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/courses/${id}`, { method: 'DELETE' });
    return true;
  },
};

// ============================================
// 统计数据
// ============================================
export async function getStats() {
  const result = await request('/dashboard/stats');
  const data = result.data;

  return {
    todayClasses: data.today?.classes || 0,
    newStudentsThisMonth: data.this_month?.new_students || 0,
    activeStudents: data.this_month?.active_students || 0,
    classesThisMonth: data.this_month?.classes || 0,
    revenueThisMonth: data.this_month?.revenue || 0,
    warningStudents: data.warnings?.low_balance_students?.length || 0,
    warningStudentDetails: data.warnings?.low_balance_students || [],
  };
}

// ============================================
// 今日课程
// ============================================
export async function getTodayClasses() {
  const result = await request('/dashboard/today');
  return result.data || [];
}

// ============================================
// 搜索
// ============================================
export async function searchAll(query, type = '') {
  const params = { q: query };
  if (type) params.type = type;
  const queryString = new URLSearchParams(params).toString();
  const result = await request(`/search?${queryString}`);
  return result.data;
}

// ============================================
// 设置相关操作
// ============================================
export const settingsOps = {
  getAll: async () => {
    const result = await request('/settings');
    return result.data;
  },
  update: async (settings) => {
    const result = await request('/settings', {
      method: 'PATCH',
      body: settings,
    });
    return result.data;
  },
};

// ============================================
// 数据导出/导入
// ============================================
export async function exportData(format = 'json') {
  const result = await request(`/export?format=${format}`);
  return result;
}

export async function importData(data, mode = 'replace') {
  const result = await request('/import', {
    method: 'POST',
    body: { data, mode },
  });
  return result;
}

// ============================================
// 机构管理相关操作
// ============================================
export const organizationOps = {
  getAll: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/organizations?${query}` : '/organizations';
    const result = await request(endpoint);
    return result.data?.data || result.data || [];
  },
  getById: async (id) => {
    const result = await request(`/organizations/${id}`);
    return result.data;
  },
  add: async (org) => {
    const result = await request('/organizations', {
      method: 'POST',
      body: org,
    });
    return result.data;
  },
  update: async (id, updates) => {
    const result = await request(`/organizations/${id}`, {
      method: 'PATCH',
      body: updates,
    });
    return result.data;
  },
  delete: async (id) => {
    await request(`/organizations/${id}`, { method: 'DELETE' });
    return true;
  },
};

// ============================================
// 管理操作
// ============================================
export const adminOps = {
  clearAll: async () => {
    const result = await request('/admin/clear-all', { method: 'POST' });
    return result.data;
  },
  getStats: async () => {
    const result = await request('/admin/stats');
    return result.data;
  },
};

// ============================================
// 兼容旧代码的 localStorage 回退
// ============================================
const STORAGE_KEY = 'sunnybridge_crm_data';
const USE_API = true;

export function loadData() {
  if (USE_API) {
    console.warn('loadData() is deprecated, use studentOps.getAll() instead');
    return { students: [], packages: [], payments: [], classes: [], settings: {} };
  }
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('加载数据失败:', e);
  }
  return { students: [], packages: [], payments: [], classes: [], settings: {} };
}

export function saveData(data) {
  if (USE_API) {
    console.warn('saveData() is deprecated, use API operations instead');
    return true;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('保存数据失败:', e);
    return false;
  }
}
