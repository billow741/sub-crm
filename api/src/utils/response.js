/**
 * 统一响应格式工具
 */
export const success = (data, meta = {}) => {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
};

export const paginated = (data, pagination, baseUrl = '') => {
  const { page, page_size, total, pages } = pagination;
  const has_next = page < pages;
  const has_prev = page > 1;

  return {
    data,
    pagination: {
      page,
      page_size,
      total,
      pages,
      has_next,
      has_prev
    },
    links: {
      self: `${baseUrl}?page=${page}&page_size=${page_size}`,
      next: has_next ? `${baseUrl}?page=${page + 1}&page_size=${page_size}` : null,
      prev: has_prev ? `${baseUrl}?page=${page - 1}&page_size=${page_size}` : null
    }
  };
};

export const error = (code, message, details = null) => {
  const response = {
    error: {
      code,
      message
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };

  if (details) {
    response.error.details = details;
  }

  return response;
};

/**
 * 分页计算工具
 */
export const calculatePagination = (page, pageSize, total) => {
  const p = Math.max(1, parseInt(page) || 1);
  const ps = Math.min(2000, Math.max(1, parseInt(pageSize) || 20));
  const totalRecords = total || 0;
  const totalPages = Math.ceil(totalRecords / ps);

  return {
    page: p,
    page_size: ps,
    total: totalRecords,
    pages: totalPages,
    offset: (p - 1) * ps
  };
};

/**
 * 从查询参数解析分页
 */
export const parsePagination = (c) => {
  const page = c.req.query('page') || '1';
  const page_size = c.req.query('page_size') || '20';
  return { page, page_size };
};

/**
 * 数据库结果转换为标准格式
 */
export const toCamelCase = (obj) => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = toCamelCase(value);
  }
  return result;
};

/**
 * 生成随机请求ID
 */
export const generateRequestId = () => {
  return Math.random().toString(36).substring(2, 15);
};