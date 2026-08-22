/**
 * Sunnybridge CRM API - Cloudflare Workers 入口
 * 使用 Hono 框架实现 REST API
 */
import { Hono } from 'hono';
import { cors, orgContext } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// 路由
import students from './routes/students.js';
import packages from './routes/packages.js';
import classes from './routes/classes.js';
import payments from './routes/payments.js';
import teachers from './routes/teachers.js';
import courses from './routes/courses.js';
import settings from './routes/settings.js';
import search from './routes/search.js';
import dashboard from './routes/dashboard.js';
import admin from './routes/admin.js';
import exportRoute from './routes/export.js';
import importRoute from './routes/import.js';
import teacherShare from './routes/teacherShare.js';
import teacherPayments from './routes/teacherPayments.js';
import hourChanges from './routes/hourChanges.js';
import leads from './routes/leads.js';
import authRoute from './routes/auth.js';
import orgPackages from './routes/org-packages.js';
import orgSettlements from './routes/org-settlements.js';
import assessments from './routes/assessments.js';
import progressReports from './routes/progressReports.js';
import textbooks from './routes/textbooks.js';
import classComplete from './routes/classComplete.js';

const app = new Hono();

// 全局中间件
app.use('*', cors);
app.use('*', orgContext);
app.use('*', errorHandler);

// 根路由
app.get('/', (c) => {
  return c.json({
    name: 'Sunnybridge CRM API',
    version: '1.0.0',
    description: '英语培训学校客户管理系统 API',
    endpoints: {
      students: '/api/v1/students',
      packages: '/api/v1/packages',
      classes: '/api/v1/classes',
      payments: '/api/v1/payments',
      teachers: '/api/v1/teachers',
      settings: '/api/v1/settings',
      search: '/api/v1/search',
      dashboard: '/api/v1/dashboard'
    },
    documentation: '/api/v1/docs'
  });
});

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// API v1 路由
import organizations from './routes/organizations.js';
app.route('/api/v1/students', students);
app.route('/api/v1/packages', packages);
app.route('/api/v1/classes', classes);
app.route('/api/v1/payments', payments);
app.route('/api/v1/teachers', teachers);
app.route('/api/v1/courses', courses);
app.route('/api/v1/settings', settings);
app.route('/api/v1/search', search);
app.route('/api/v1/dashboard', dashboard);
app.route('/api/v1/admin', admin);
app.route('/api/v1/export', exportRoute);
app.route('/api/v1/import', importRoute);
app.route('/api/v1/teacher/share', teacherShare);
app.route('/api/v1/teacher-payments', teacherPayments);

app.route('/api/v1/hour-changes', hourChanges);
app.route('/api/v1/leads', leads);

app.route('/api/v1/organizations', organizations);
app.route('/api/v1/org-packages', orgPackages);
app.route('/api/v1/org-settlements', orgSettlements);
app.route('/api/v1/org', authRoute);
app.route('/api/v1/assessments', assessments);
app.route('/api/v1/progress-reports', progressReports);
app.route('/api/v1/textbooks', textbooks);
app.route('/api/v1/classes', classComplete); // 自动扣课时相关端点：/start, /complete, /rollback

// 404 处理
app.notFound(notFound);

export default app;