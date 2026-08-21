/**
 * Dashboard 路由
 * P0: 统计数据和预警
 */
import { Hono } from 'hono';
import { success } from '../utils/response.js';

const dashboard = new Hono();

// 获取统计数据
dashboard.get('/stats', async (c) => {
  const DB = c.env.DB;

  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);

  // 今日统计
  const todayClasses = await DB.prepare(`
    SELECT COUNT(*) as count FROM classes WHERE date = ? AND status = 'completed'
  `).bind(today).first();

  const todayStudents = await DB.prepare(`
    SELECT COUNT(DISTINCT student_id) as count FROM classes WHERE date = ? AND status = 'completed'
  `).bind(today).first();

  // 本月统计
  const thisMonthStats = await DB.prepare(`
    SELECT
      COUNT(DISTINCT student_id) as active_students,
      COUNT(*) as class_count,
      SUM(hours) as total_hours
    FROM classes
    WHERE strftime('%Y-%m', date) = ? AND status = 'completed'
  `).bind(thisMonth).first();

  const newStudents = await DB.prepare(`
    SELECT COUNT(*) as count FROM students
    WHERE strftime('%Y-%m', created_at) = ?
  `).bind(thisMonth).first();

  const revenue = await DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE strftime('%Y-%m', date) = ?
  `).bind(thisMonth).first();

  // 预警：课时不足的学生（剩余<=5）
  const lowBalanceStudents = await DB.prepare(`
    SELECT s.id, s.name, s.phone,
           ROUND((s.total_hours - s.used_hours), 2) as remaining_hours
    FROM students s
    WHERE (s.total_hours - s.used_hours) <= 3
      AND (s.total_hours - s.used_hours) > 0
    ORDER BY (s.total_hours - s.used_hours) ASC
    LIMIT 10
  `).all();

  // 预警：即将过期的课时包（7天内）
  const expiringPackages = await DB.prepare(`
    SELECT p.id, s.name as student_name, p.name as package_name,
           p.expire_date, p.remaining as remaining_hours
    FROM packages p
    JOIN students s ON p.student_id = s.id
    WHERE p.status = 'active'
      AND p.expire_date IS NOT NULL
      AND date(p.expire_date) BETWEEN date('now') AND date('now', '+7 days')
    ORDER BY p.expire_date ASC
    LIMIT 10
  `).all();

  // 趋势数据：最近6个月
  const monthlyClasses = await DB.prepare(`
    SELECT strftime('%Y-%m', date) as month, COUNT(*) as count
    FROM classes
    WHERE status = 'completed' AND date >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month ASC
  `).all();

  const monthlyRevenue = await DB.prepare(`
    SELECT strftime('%Y-%m', date) as month, SUM(amount) as amount
    FROM payments
    WHERE date >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month ASC
  `).all();

  return c.json(success({
    today: {
      classes: todayClasses?.count || 0,
      students: todayStudents?.count || 0
    },
    this_month: {
      new_students: newStudents?.count || 0,
      classes: thisMonthStats?.class_count || 0,
      total_hours: thisMonthStats?.total_hours || 0,
      revenue: revenue?.total || 0,
      active_students: thisMonthStats?.active_students || 0
    },
    warnings: {
      low_balance_students: lowBalanceStudents.results?.map(s => ({
        id: s.id,
        name: s.name,
        remaining_hours: s.remaining_hours
      })) || [],
      expiring_packages: expiringPackages.results?.map(p => ({
        id: p.id,
        student_name: p.student_name,
        package_name: p.package_name,
        expire_date: p.expire_date,
        remaining_hours: p.remaining_hours
      })) || []
    },
    trends: {
      monthly_classes: monthlyClasses.results?.map(m => ({
        month: m.month,
        count: m.count
      })) || [],
      monthly_revenue: monthlyRevenue.results?.map(m => ({
        month: m.month,
        amount: m.amount
      })) || []
    }
  }));
});

// 获取今日课程
dashboard.get('/today', async (c) => {
  const DB = c.env.DB;

  const today = new Date().toISOString().split('T')[0];

  const results = await DB.prepare(`
    SELECT c.id, c.teacher, c.subject, c.start_time, c.end_time, c.status,
           s.name as student_name
    FROM classes c
    JOIN students s ON c.student_id = s.id
    WHERE c.date = ?
    ORDER BY c.start_time ASC
  `).bind(today).all();

  const data = results.results?.map(cls => ({
    id: cls.id,
    student_name: cls.student_name,
    teacher: cls.teacher,
    subject: cls.subject,
    start_time: cls.start_time,
    end_time: cls.end_time,
    status: cls.status
  })) || [];

  return c.json(success(data));
});

// 获取概览数据（简化版）
dashboard.get('/overview', async (c) => {
  const DB = c.env.DB;

  const totalStudents = await DB.prepare(`
    SELECT COUNT(*) as count FROM students WHERE status = 'active'
  `).first();

  const totalPackages = await DB.prepare(`
    SELECT
      COALESCE(SUM(total), 0) as total,
      COALESCE(SUM(used), 0) as used,
      COALESCE(SUM(remaining), 0) as remaining
    FROM packages WHERE status = 'active'
  `).first();

  const totalRevenue = await DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
  `).first();

  return c.json(success({
    students: {
      active: totalStudents?.count || 0
    },
    packages: {
      total_hours: totalPackages?.total || 0,
      used_hours: totalPackages?.used || 0,
      remaining_hours: totalPackages?.remaining || 0
    },
    revenue: {
      total: totalRevenue?.total || 0
    }
  }));
});

export default dashboard;