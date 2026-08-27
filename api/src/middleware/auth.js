/**
 * CORS 中间件
 */
export const cors = async (c, next) => {
  // 允许的来源(生产环境应配置具体域名)
  const allowedOrigins = c.env.ALLOWED_ORIGINS ? c.env.ALLOWED_ORIGINS.split(',') : ['*'];
  const origin = c.req.header('Origin') || '';

  // 检查 origin 是否在允许列表中 (默认 * 允许所有来源)
  const isAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
  const allowHeaderValue = isAllowed ? (origin || '*') : null;

  // 预先设置所有 CORS 头 (即使后续路由报错,响应也会带 CORS)
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', '*');
  c.res.headers.set('Access-Control-Max-Age', '86400');
  if (allowHeaderValue) {
    c.res.headers.set('Access-Control-Allow-Origin', allowHeaderValue);
  }

  // 处理预检请求
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }

  await next();

  // 异常返回后,确保 CORS 头仍在响应上 (重要!)
  // 因为下游路由可能直接 c.json(...) 走默认头 (覆盖 middleware 设置)
  if (allowHeaderValue && !c.res.headers.get('Access-Control-Allow-Origin')) {
    c.res.headers.set('Access-Control-Allow-Origin', allowHeaderValue);
  }
};

/**
 * 简单 API Key 认证中间件
 */
export const auth = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({
      error: {
        code: 'UNAUTHORIZED',
        message: '缺少认证信息'
      },
      meta: { timestamp: new Date().toISOString() }
    }, 401);
  }

  // 支持 Bearer Token 和 API Key 两种格式
  let token = authHeader;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // 简单验证：检查 API_KEY 环境变量
  const validApiKey = c.env.API_KEY || 'dev-api-key';
  if (token !== validApiKey) {
    return c.json({
      error: {
        code: 'UNAUTHORIZED',
        message: '无效的认证信息'
      },
      meta: { timestamp: new Date().toISOString() }
    }, 401);
  }

  // 将 token 存入 context 供后续使用
  c.req.auth = { token };
  await next();
};

/**
 * 可选的认证中间件（不强制）
 */
export const optionalAuth = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader) {
    let token = authHeader;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
    const validApiKey = c.env.API_KEY || 'dev-api-key';
    if (token === validApiKey) {
      c.req.auth = { token, authenticated: true };
    }
  }

  await next();
};

/**
 * 机构数据隔离中间件
 * 从请求头提取用户角色和机构 ID，存入 context 供路由使用
 * 
 * 请求头：
 * - X-User-Role: super_admin | org_admin | teacher | parent
 * - X-Organization-Id: 机构 ID（非超管时必传）
 * 
 * 在路由中可通过 c.get('userRole') / c.get('orgId') 访问
 */
export const orgContext = async (c, next) => {
  const userRole = c.req.header('X-User-Role') || 'super_admin';
  const userOrgId = c.req.header('X-Organization-Id') || '';

  c.set('userRole', userRole);
  c.set('orgId', userOrgId ? parseInt(userOrgId) : null);
  c.set('isSuperAdmin', userRole === 'super_admin');

  await next();
};