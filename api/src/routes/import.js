/**
 * Import 路由
 * 数据导入功能
 */
import { Hono } from 'hono';
import { success, error } from '../utils/response.js';

const importRoute = new Hono();

// 导入数据
importRoute.post('/', async (c) => {
  const DB = c.env.DB;
  
  try {
    const body = await c.req.json();
    const { data, mode = 'merge' } = body;
    
    if (!data) {
      return c.json(error('INVALID_DATA', '无效的导入数据'), 400);
    }
    
    const results = {
      students: { imported: 0, skipped: 0 },
      packages: { imported: 0, skipped: 0 },
      classes: { imported: 0, skipped: 0 },
      payments: { imported: 0, skipped: 0 },
      teachers: { imported: 0, skipped: 0 },
      courses: { imported: 0, skipped: 0 },
      settings: { imported: 0, skipped: 0 }
    };
    
    // 如果模式是 'replace'，先清空数据（注意外键依赖顺序：先子表后父表）
    if (mode === 'replace') {
      await DB.prepare('DELETE FROM org_settlement_items').run();
      await DB.prepare('DELETE FROM org_settlements').run();
      await DB.prepare('DELETE FROM org_hour_allocations').run();
      await DB.prepare('DELETE FROM org_packages').run();
      await DB.prepare('DELETE FROM classes').run();
      await DB.prepare('DELETE FROM payments').run();
      await DB.prepare('DELETE FROM packages').run();
      await DB.prepare('DELETE FROM hour_changes').run();
      await DB.prepare('DELETE FROM teacher_payments').run();
      await DB.prepare('DELETE FROM leads').run();
      await DB.prepare('DELETE FROM students').run();
      await DB.prepare('DELETE FROM teachers').run();
      await DB.prepare('DELETE FROM courses').run();
      await DB.prepare('DELETE FROM organizations').run();
      await DB.prepare('DELETE FROM settings').run();
      await DB.prepare("DELETE FROM sqlite_sequence WHERE name IN ('classes', 'payments', 'packages', 'students', 'teachers', 'courses', 'settings', 'hour_changes', 'teacher_payments', 'leads', 'organizations', 'org_packages', 'org_hour_allocations', 'org_settlements', 'org_settlement_items')").run();
    }
    
    // 导入学生
    if (data.students && Array.isArray(data.students)) {
      for (const student of data.students) {
        try {
          // 检查是否已存在
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM students WHERE id = ?').bind(student.id).first();
            if (existing) {
              results.students.skipped++;
              continue;
            }
          }
          
          await DB.prepare(`
            INSERT INTO students (id, name, english_name, gender, phone, email, age, grade, parent_name, notes, status, total_hours, used_hours, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            student.id,
            student.name,
            student.english_name || null,
            student.gender || null,
            student.phone || null,
            student.email || null,
            student.age || null,
            student.grade || null,
            student.parent_name || null,
            student.notes || null,
            student.status || 'active',
            student.total_hours || 0,
            student.used_hours || 0,
            student.created_at || new Date().toISOString(),
            student.updated_at || new Date().toISOString()
          ).run();
          results.students.imported++;
        } catch (err) {
          console.error('Import student error:', err);
          results.students.skipped++;
        }
      }
    }
    
    // 导入教师
    if (data.teachers && Array.isArray(data.teachers)) {
      for (const teacher of data.teachers) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(teacher.id).first();
            if (existing) {
              results.teachers.skipped++;
              continue;
            }
          }
          
          await DB.prepare(`
            INSERT INTO teachers (id, name, phone, email, subjects, hourly_rate, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            teacher.id,
            teacher.name,
            teacher.phone || null,
            teacher.email || null,
            teacher.subjects || null,
            teacher.hourly_rate || null,
            teacher.status || 'active',
            teacher.notes || null,
            teacher.created_at || new Date().toISOString(),
            teacher.updated_at || new Date().toISOString()
          ).run();
          results.teachers.imported++;
        } catch (err) {
          console.error('Import teacher error:', err);
          results.teachers.skipped++;
        }
      }
    }
    
    // 导入课程
    if (data.courses && Array.isArray(data.courses)) {
      for (const course of data.courses) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM courses WHERE id = ?').bind(course.id).first();
            if (existing) {
              results.courses.skipped++;
              continue;
            }
          }
          
          await DB.prepare(`
            INSERT INTO courses (id, name, subject, level, duration, price, description, teacher_id, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            course.id,
            course.name,
            course.subject || null,
            course.level || 'all',
            course.duration || 60,
            course.price || null,
            course.description || null,
            course.teacher_id || null,
            course.status || 'active',
            course.created_at || new Date().toISOString(),
            course.updated_at || new Date().toISOString()
          ).run();
          results.courses.imported++;
        } catch (err) {
          console.error('Import course error:', err);
          results.courses.skipped++;
        }
      }
    }
    
    // 导入课时包
    if (data.packages && Array.isArray(data.packages)) {
      for (const pkg of data.packages) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM packages WHERE id = ?').bind(pkg.id).first();
            if (existing) {
              results.packages.skipped++;
              continue;
            }
          }
          
          await DB.prepare(`
            INSERT INTO packages (id, student_id, name, total, used, remaining, price, purchase_date, expire_date, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            pkg.id,
            pkg.student_id,
            pkg.name || `${pkg.total}节套餐`,
            pkg.total,
            pkg.used || 0,
            pkg.remaining || pkg.total,
            pkg.price || null,
            pkg.purchase_date || new Date().toISOString().split('T')[0],
            pkg.expire_date || null,
            pkg.notes || null,
            pkg.status || 'active',
            pkg.created_at || new Date().toISOString(),
            pkg.updated_at || new Date().toISOString()
          ).run();
          results.packages.imported++;
        } catch (err) {
          console.error('Import package error:', err);
          results.packages.skipped++;
        }
      }
    }
    
    // 导入上课记录
    if (data.classes && Array.isArray(data.classes)) {
      for (const cls of data.classes) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM classes WHERE id = ?').bind(cls.id).first();
            if (existing) {
              results.classes.skipped++;
              continue;
            }
          }
          
          await DB.prepare(`
            INSERT INTO classes (id, student_id, package_id, teacher, teacher_id, subject, hours, date, start_time, end_time, content, homework, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            cls.id,
            cls.student_id,
            cls.package_id || null,
            cls.teacher || null,
            cls.teacher_id || null,
            cls.subject || null,
            cls.hours || 1,
            cls.date,
            cls.start_time || null,
            cls.end_time || null,
            cls.content || null,
            cls.homework || null,
            cls.notes || null,
            cls.status || 'completed',
            cls.created_at || new Date().toISOString(),
            cls.updated_at || new Date().toISOString()
          ).run();
          results.classes.imported++;
        } catch (err) {
          console.error('Import class error:', err);
          results.classes.skipped++;
        }
      }
    }
    
    // 导入付款记录
    if (data.payments && Array.isArray(data.payments)) {
      for (const payment of data.payments) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM payments WHERE id = ?').bind(payment.id).first();
            if (existing) {
              results.payments.skipped++;
              continue;
            }
          }
          
          await DB.prepare(`
            INSERT INTO payments (id, student_id, amount, payment_method, package_id, description, date, receipt_number, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            payment.id,
            payment.student_id,
            payment.amount,
            payment.payment_method || 'other',
            payment.package_id || null,
            payment.description || null,
            payment.date,
            payment.receipt_number || null,
            payment.notes || null,
            payment.created_at || new Date().toISOString()
          ).run();
          results.payments.imported++;
        } catch (err) {
          console.error('Import payment error:', err);
          results.payments.skipped++;
        }
      }
    }
    
    // 导入设置
    if (data.settings && Array.isArray(data.settings)) {
      for (const setting of data.settings) {
        try {
          await DB.prepare(`
            INSERT OR REPLACE INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
          `).bind(
            setting.key,
            setting.value,
            setting.updated_at || new Date().toISOString()
          ).run();
          results.settings.imported++;
        } catch (err) {
          console.error('Import setting error:', err);
          results.settings.skipped++;
        }
      }
    }
    

    
    // 导入课时变动记录
    if (data.hour_changes && Array.isArray(data.hour_changes)) {
      for (const hc of data.hour_changes) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM hour_changes WHERE id = ?').bind(hc.id).first();
            if (existing) continue;
          }
          await DB.prepare(`
            INSERT INTO hour_changes (id, student_id, type, amount, description, related_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            hc.id,
            hc.student_id,
            hc.type,
            hc.amount,
            hc.description || null,
            hc.related_id || null,
            hc.created_at || new Date().toISOString()
          ).run();
        } catch (err) {
          console.error('Import hour_changes error:', err);
        }
      }
    }
    
    // 导入教师薪资记录
    if (data.teacher_payments && Array.isArray(data.teacher_payments)) {
      for (const tp of data.teacher_payments) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM teacher_payments WHERE id = ?').bind(tp.id).first();
            if (existing) continue;
          }
          await DB.prepare(`
            INSERT INTO teacher_payments (id, teacher_id, period_start, period_end, total_classes, total_hours, hourly_rate, total_amount, notes, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            tp.id,
            tp.teacher_id,
            tp.period_start || null,
            tp.period_end || null,
            tp.total_classes || 0,
            tp.total_hours || 0,
            tp.hourly_rate || 0,
            tp.total_amount || 0,
            tp.notes || null,
            tp.status || 'pending',
            tp.created_at || new Date().toISOString()
          ).run();
        } catch (err) {
          console.error('Import teacher_payments error:', err);
        }
      }
    }
    
    // 导入 leads
    if (data.leads && Array.isArray(data.leads)) {
      for (const lead of data.leads) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM leads WHERE id = ?').bind(lead.id).first();
            if (existing) continue;
          }
          await DB.prepare(`
            INSERT INTO leads (id, name, phone, email, age, course, source, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            lead.id, lead.name, lead.phone || null, lead.email || '',
            lead.age || '', lead.course || '', lead.source || 'website',
            lead.message || '', lead.created_at || new Date().toISOString()
          ).run();
        } catch (err) {
          console.error('Import leads error:', err);
        }
      }
    }

    // 导入 organizations
    if (data.organizations && Array.isArray(data.organizations)) {
      for (const org of data.organizations) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(org.id).first();
            if (existing) continue;
          }
          await DB.prepare(`
            INSERT INTO organizations (id, name, contact_name, contact_phone, contact_email, address, notes, status, login_code, password_hash, unit_price_cny, settlement_day, credit_limit_cny, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            org.id, org.name, org.contact_name || null, org.contact_phone || null,
            org.contact_email || null, org.address || null, org.notes || null, org.status || 'active',
            org.login_code || null, org.password_hash || null, org.unit_price_cny || 80,
            org.settlement_day || 'monday', org.credit_limit_cny || 0,
            org.created_at || new Date().toISOString(), org.updated_at || new Date().toISOString()
          ).run();
        } catch (err) {
          console.error('Import organizations error:', err);
        }
      }
    }

    // 导入 org_packages
    if (data.org_packages && Array.isArray(data.org_packages)) {
      for (const pkg of data.org_packages) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM org_packages WHERE id = ?').bind(pkg.id).first();
            if (existing) continue;
          }
          await DB.prepare(`
            INSERT INTO org_packages (id, org_id, total_hours, used_hours, unit_price_cny, amount_cny, paid_amount_cny, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            pkg.id, pkg.org_id, pkg.total_hours || 0, pkg.used_hours || 0,
            pkg.unit_price_cny || 0, pkg.amount_cny || pkg.total_hours * pkg.unit_price_cny || 0,
            pkg.paid_amount_cny || 0, pkg.status || 'pending',
            pkg.notes || null, pkg.created_at || new Date().toISOString(), pkg.updated_at || new Date().toISOString()
          ).run();
        } catch (err) {
          console.error('Import org_packages error:', err);
        }
      }
    }

    // 导入 org_hour_allocations
    if (data.org_hour_allocations && Array.isArray(data.org_hour_allocations)) {
      for (const alloc of data.org_hour_allocations) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM org_hour_allocations WHERE id = ?').bind(alloc.id).first();
            if (existing) continue;
          }
          await DB.prepare(`
            INSERT INTO org_hour_allocations (id, org_id, package_id, student_id, hours, notes, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            alloc.id, alloc.org_id, alloc.package_id || null, alloc.student_id || null,
            alloc.hours || 0, alloc.notes || null,
            alloc.created_by || 'super_admin', alloc.created_at || new Date().toISOString()
          ).run();
        } catch (err) {
          console.error('Import org_hour_allocations error:', err);
        }
      }
    }

    // 导入 org_settlements
    if (data.org_settlements && Array.isArray(data.org_settlements)) {
      for (const st of data.org_settlements) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM org_settlements WHERE id = ?').bind(st.id).first();
            if (existing) continue;
          }
          await DB.prepare(`
            INSERT INTO org_settlements (id, org_id, period_start, period_end, total_classes, total_hours, unit_price_cny, amount_due_cny, status, paid_at, payment_ref, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            st.id, st.org_id, st.period_start || null, st.period_end || null,
            st.total_classes || 0, st.total_hours || 0,
            st.unit_price_cny || 0, st.amount_due_cny || st.total_hours * st.unit_price_cny || 0,
            st.status || 'pending', st.paid_at || null,
            st.payment_ref || null, st.generated_at || new Date().toISOString()
          ).run();
        } catch (err) {
          console.error('Import org_settlements error:', err);
        }
      }
    }

    // 导入 org_settlement_items
    if (data.org_settlement_items && Array.isArray(data.org_settlement_items)) {
      for (const item of data.org_settlement_items) {
        try {
          if (mode === 'merge') {
            const existing = await DB.prepare('SELECT id FROM org_settlement_items WHERE id = ?').bind(item.id).first();
            if (existing) continue;
          }
          await DB.prepare(`
            INSERT INTO org_settlement_items (id, settlement_id, class_id, student_id, student_name, teacher_name, class_date, hours, unit_price_cny, subtotal_cny)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            item.id, item.settlement_id, item.class_id || null,
            item.student_id || null, item.student_name || null, item.teacher_name || null,
            item.class_date || null, item.hours || 0,
            item.unit_price_cny || 0, item.subtotal_cny || item.hours * item.unit_price_cny || 0
          ).run();
        } catch (err) {
          console.error('Import org_settlement_items error:', err);
        }
      }
    }
    
    return c.json(success({
      message: '数据导入完成',
      results,
      importedAt: new Date().toISOString()
    }));
  } catch (err) {
    console.error('Import error:', err);
    return c.json(error('IMPORT_ERROR', '导入失败: ' + err.message), 500);
  }
});

export default importRoute;
