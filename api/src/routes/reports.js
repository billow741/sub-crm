/**
 * 数据报表中心路由
 * 阶段 A：学习分析
 */
import { Hono } from 'hono';
import { success, error } from '../utils/response.js';

const reports = new Hono();

/**
 * 权限与机构上下文校验
 * - super_admin: 可查全部机构，可用 query.org_id 指定
 * - org_admin: 强制锁定自身机构 c.get('orgId')，传别人的 org_id 无效
 * - teacher / parent: 403 Forbidden
 */
function checkPermission(c) {
  const userRole = c.get('userRole') || 'super_admin';
  const contextOrgId = c.get('orgId');

  if (userRole === 'teacher' || userRole === 'parent') {
    return { forbidden: true, error: error('FORBIDDEN', '无权限访问数据报表') };
  }

  if (userRole === 'super_admin') {
    const queryOrgId = c.req.query('org_id');
    let effectiveOrgId = null;
    if (queryOrgId && queryOrgId !== 'all' && queryOrgId !== '') {
      const parsed = parseInt(queryOrgId);
      if (!isNaN(parsed)) {
        effectiveOrgId = parsed;
      }
    }
    return { forbidden: false, effectiveOrgId, userRole };
  }

  if (userRole === 'org_admin') {
    if (!contextOrgId) {
      return { forbidden: true, error: error('FORBIDDEN', '机构管理员缺少机构身份信息') };
    }
    // 强制锁定自身机构，忽略 query.org_id
    return { forbidden: false, effectiveOrgId: contextOrgId, userRole };
  }

  return { forbidden: true, error: error('FORBIDDEN', '无权限访问数据报表') };
}

/**
 * 通用起止日期解析（默认本月）
 */
function resolveDateRange(c) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();

  const defaultFrom = `${year}-${month}-01`;
  const defaultTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  const fromDate = c.req.query('from_date') || defaultFrom;
  const toDate = c.req.query('to_date') || defaultTo;

  return { fromDate, toDate };
}

/**
 * GET /api/v1/reports/learning/summary
 * 学习分析总览：
 * 1. 课时健康分布（<=3 紧迫 / 4-8 关注 / >8 健康）
 * 2. 学员状态分布（active / inactive / graduated）
 * 3. 教材分布与进度
 * 4. 五维评分均值与覆盖率（含月度趋势，classes.fb_score_* 现算）
 * 5. 里程碑计数（progress_reports）
 * 6. 流失预警概况
 */
reports.get('/learning/summary', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  const DB = c.env.DB;
  const { effectiveOrgId, userRole } = perm;
  const { fromDate, toDate } = resolveDateRange(c);

  try {
    // 1. 课时健康分布 (针对在读学员 status='active')
    const orgFilter = effectiveOrgId ? 'AND s.organization_id = ?' : '';
    const orgParams = effectiveOrgId ? [effectiveOrgId] : [];

    const studentsHoursQuery = `
      SELECT 
        s.id,
        s.total_hours,
        s.used_hours,
        (s.total_hours - s.used_hours) as remaining_hours
      FROM students s
      WHERE s.status = 'active' ${orgFilter}
    `;
    const studentsHoursRes = await DB.prepare(studentsHoursQuery).bind(...orgParams).all();
    const activeStudents = studentsHoursRes.results || [];

    let criticalCount = 0; // <= 3 节 (紧迫)
    let warningCount = 0;  // 4-8 节 (关注)
    let healthyCount = 0;  // > 8 节 (健康)
    let totalRemainingHours = 0;

    activeStudents.forEach(s => {
      const rem = s.remaining_hours || 0;
      totalRemainingHours += rem;
      if (rem <= 3) {
        criticalCount++;
      } else if (rem <= 8) {
        warningCount++;
      } else {
        healthyCount++;
      }
    });

    const totalActive = activeStudents.length;
    const calcPct = (cnt) => totalActive > 0 ? Math.round((cnt / totalActive) * 1000) / 10 : 0;

    const hourHealth = {
      total_active_students: totalActive,
      total_remaining_hours: Math.round(totalRemainingHours * 100) / 100,
      critical: {
        count: criticalCount,
        percentage: calcPct(criticalCount),
        label: '紧迫 (≤3节)'
      },
      warning: {
        count: warningCount,
        percentage: calcPct(warningCount),
        label: '关注 (4-8节)'
      },
      healthy: {
        count: healthyCount,
        percentage: calcPct(healthyCount),
        label: '健康 (>8节)'
      }
    };

    // 2. 学员状态分布 (全量状态)
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM students
      WHERE 1=1 ${effectiveOrgId ? 'AND organization_id = ?' : ''}
      GROUP BY status
    `;
    const statusRes = await DB.prepare(statusQuery).bind(...orgParams).all();
    const statusRows = statusRes.results || [];

    const statusMap = { active: 0, inactive: 0, graduated: 0 };
    let totalAllStudents = 0;
    statusRows.forEach(r => {
      if (statusMap[r.status] !== undefined) {
        statusMap[r.status] = r.count;
      }
      totalAllStudents += r.count;
    });

    const statusDistribution = {
      active: statusMap.active,
      inactive: statusMap.inactive,
      graduated: statusMap.graduated,
      total: totalAllStudents
    };

    // 3. 教材分布与进度 (从 student_textbook_progress + textbooks 聚合)
    const textbookQuery = `
      SELECT 
        stp.textbook_code,
        COALESCE(t.name, stp.textbook_code) as textbook_name,
        t.series,
        t.level,
        COUNT(DISTINCT stp.student_id) as student_count,
        ROUND(AVG(stp.current_unit), 1) as avg_current_unit,
        ROUND(AVG(stp.total_classes_done), 1) as avg_classes_done,
        SUM(CASE WHEN stp.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN stp.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN stp.status = 'paused' THEN 1 ELSE 0 END) as paused_count
      FROM student_textbook_progress stp
      JOIN students s ON s.id = stp.student_id
      LEFT JOIN textbooks t ON (t.code = stp.textbook_code OR t.id = stp.textbook_id)
      WHERE 1=1 ${effectiveOrgId ? 'AND s.organization_id = ?' : ''}
      GROUP BY stp.textbook_code
      ORDER BY student_count DESC
    `;
    const textbookRes = await DB.prepare(textbookQuery).bind(...orgParams).all();
    const textbooksList = (textbookRes.results || []).map(tb => ({
      textbook_code: tb.textbook_code,
      textbook_name: tb.textbook_name,
      series: tb.series,
      level: tb.level,
      student_count: tb.student_count || 0,
      avg_current_unit: tb.avg_current_unit || 1,
      avg_classes_done: tb.avg_classes_done || 0,
      in_progress_count: tb.in_progress_count || 0,
      completed_count: tb.completed_count || 0,
      paused_count: tb.paused_count || 0
    }));

    // 4. 五维评分均值与覆盖率 (classes.fb_score_* 统计 completed 课程)
    // 当前筛选期间汇总
    const periodScoreParams = [fromDate, toDate, ...(effectiveOrgId ? [effectiveOrgId] : [])];
    const periodScoreQuery = `
      SELECT 
        COUNT(*) as total_completed,
        SUM(CASE WHEN fb_score_phonics IS NOT NULL 
                   OR fb_score_vocab IS NOT NULL 
                   OR fb_score_speaking IS NOT NULL 
                   OR fb_score_listening IS NOT NULL 
                   OR fb_score_engagement IS NOT NULL 
                 THEN 1 ELSE 0 END) as scored_count,
        AVG(fb_score_phonics) as avg_phonics,
        AVG(fb_score_vocab) as avg_vocab,
        AVG(fb_score_speaking) as avg_speaking,
        AVG(fb_score_listening) as avg_listening,
        AVG(fb_score_engagement) as avg_engagement
      FROM classes
      WHERE status = 'completed'
        AND date >= ? AND date <= ?
        ${effectiveOrgId ? 'AND organization_id = ?' : ''}
    `;
    const scoreRes = await DB.prepare(periodScoreQuery).bind(...periodScoreParams).first();
    const totalCompleted = scoreRes?.total_completed || 0;
    const scoredCount = scoreRes?.scored_count || 0;
    const coverageRate = totalCompleted > 0 ? Math.round((scoredCount / totalCompleted) * 1000) / 1000 : 0;
    const isLowCoverage = coverageRate < 0.3;

    const round2 = (val) => val !== null && val !== undefined ? Math.round(Number(val) * 100) / 100 : null;

    const avgPhonics = round2(scoreRes?.avg_phonics);
    const avgVocab = round2(scoreRes?.avg_vocab);
    const avgSpeaking = round2(scoreRes?.avg_speaking);
    const avgListening = round2(scoreRes?.avg_listening);
    const avgEngagement = round2(scoreRes?.avg_engagement);

    const validScores = [avgPhonics, avgVocab, avgSpeaking, avgListening, avgEngagement].filter(s => s !== null);
    const overallAvg = validScores.length > 0 ? round2(validScores.reduce((a, b) => a + b, 0) / validScores.length) : null;

    // 月度趋势（业务日期 classes.date + strftime('%Y-%m')）
    const monthlyTrendQuery = `
      SELECT 
        strftime('%Y-%m', date) as month,
        COUNT(*) as total_completed,
        SUM(CASE WHEN fb_score_phonics IS NOT NULL 
                   OR fb_score_vocab IS NOT NULL 
                   OR fb_score_speaking IS NOT NULL 
                   OR fb_score_listening IS NOT NULL 
                   OR fb_score_engagement IS NOT NULL 
                 THEN 1 ELSE 0 END) as scored_count,
        AVG(fb_score_phonics) as avg_phonics,
        AVG(fb_score_vocab) as avg_vocab,
        AVG(fb_score_speaking) as avg_speaking,
        AVG(fb_score_listening) as avg_listening,
        AVG(fb_score_engagement) as avg_engagement
      FROM classes
      WHERE status = 'completed'
        AND date >= date(?, '-5 months') AND date <= ?
        ${effectiveOrgId ? 'AND organization_id = ?' : ''}
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `;
    const monthlyTrendRes = await DB.prepare(monthlyTrendQuery).bind(...periodScoreParams).all();
    const monthlyTrend = (monthlyTrendRes.results || []).map(row => {
      const tot = row.total_completed || 0;
      const sc = row.scored_count || 0;
      const cov = tot > 0 ? Math.round((sc / tot) * 1000) / 1000 : 0;
      const p = round2(row.avg_phonics);
      const v = round2(row.avg_vocab);
      const s = round2(row.avg_speaking);
      const l = round2(row.avg_listening);
      const e = round2(row.avg_engagement);
      const list = [p, v, s, l, e].filter(x => x !== null);
      const overall = list.length > 0 ? round2(list.reduce((a, b) => a + b, 0) / list.length) : null;

      return {
        month: row.month,
        total_completed: tot,
        scored_count: sc,
        coverage_rate: cov,
        is_low_coverage: cov < 0.3,
        phonics: p,
        vocab: v,
        speaking: s,
        listening: l,
        engagement: e,
        overall
      };
    });

    const competencyScores = {
      period: {
        from_date: fromDate,
        to_date: toDate,
        total_completed: totalCompleted,
        scored_count: scoredCount,
        coverage_rate: coverageRate,
        is_low_coverage: isLowCoverage,
        notice: isLowCoverage ? '数据积累中 (评分覆盖率低于30%)' : null,
        dimensions: {
          phonics: avgPhonics,
          vocab: avgVocab,
          speaking: avgSpeaking,
          listening: avgListening,
          engagement: avgEngagement,
          overall: overallAvg
        }
      },
      monthly_trend: monthlyTrend
    };

    // 5. 里程碑计数 (progress_reports 表)
    const milestoneAllQuery = `
      SELECT 
        report_type,
        COUNT(*) as count
      FROM progress_reports
      WHERE 1=1 ${effectiveOrgId ? 'AND organization_id = ?' : ''}
      GROUP BY report_type
    `;
    const milestoneAllRes = await DB.prepare(milestoneAllQuery).bind(...orgParams).all();
    const allMilestones = {
      milestone_8: 0,
      milestone_30: 0,
      milestone_60: 0,
      milestone_100: 0,
      level_up: 0,
      total: 0
    };
    (milestoneAllRes.results || []).forEach(r => {
      if (allMilestones[r.report_type] !== undefined) {
        allMilestones[r.report_type] = r.count;
      }
      allMilestones.total += r.count;
    });

    // 6. 流失预警概况摘要 (现算未上课天数，MAX(classes.date))
    const riskSummaryQuery = `
      WITH student_stats AS (
        SELECT 
          s.id,
          s.total_hours,
          s.used_hours,
          (s.total_hours - s.used_hours) as remaining_hours,
          s.created_at,
          MAX(c.date) as last_class_date,
          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.student_id = s.id AND p.payment_method != 'gift'
          ), 0) as paid_amount
        FROM students s
        LEFT JOIN classes c ON c.student_id = s.id AND c.status = 'completed'
        WHERE s.status = 'active'
          AND (s.total_hours - s.used_hours) > 0
          ${effectiveOrgId ? 'AND s.organization_id = ?' : ''}
        GROUP BY s.id
      )
      SELECT 
        remaining_hours,
        total_hours,
        paid_amount,
        CASE 
          WHEN last_class_date IS NOT NULL THEN CAST(julianday(date('now')) - julianday(last_class_date) AS INTEGER)
          ELSE CAST(julianday(date('now')) - julianday(date(created_at)) AS INTEGER)
        END as inactive_days
      FROM student_stats
      WHERE (last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 14)
         OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 14)
    `;
    const riskSummaryRes = await DB.prepare(riskSummaryQuery).bind(...orgParams).all();
    const riskRows = riskSummaryRes.results || [];

    let highRiskCount = 0;   // >= 30 天
    let mediumRiskCount = 0; // 14-29 天
    let totalRiskValue = 0;  // 剩余课时价值 (估算)

    riskRows.forEach(r => {
      if (r.inactive_days >= 30) {
        highRiskCount++;
      } else {
        mediumRiskCount++;
      }
      if (r.total_hours > 0 && r.paid_amount > 0) {
        const blended = r.paid_amount / r.total_hours;
        totalRiskValue += r.remaining_hours * blended;
      }
    });

    const riskSummary = {
      total_risk_students: riskRows.length,
      high_risk_count: highRiskCount,
      medium_risk_count: mediumRiskCount,
      total_remaining_value: Math.round(totalRiskValue * 100) / 100
    };

    return c.json(success({
      hour_health: hourHealth,
      status_distribution: statusDistribution,
      textbook_distribution: textbooksList,
      competency_scores: competencyScores,
      milestones: allMilestones,
      risk_summary: riskSummary
    }, {
      from_date: fromDate,
      to_date: toDate,
      organization_id: effectiveOrgId,
      user_role: userRole
    }));

  } catch (err) {
    console.error('reports/learning/summary error:', err);
    return c.json(error('INTERNAL_ERROR', '获取学习分析总览失败: ' + err.message), 500);
  }
});

/**
 * GET /api/v1/reports/learning/risk-students
 * 流失预警名单（含分页）
 * 口径：
 * - status = 'active'
 * - remaining_hours > 0
 * - 未上课天数 = 今天 - MAX(classes.date)（仅 completed），禁止用 last_class_at
 * - inactive_days >= 14 (30天为高危子集)
 * - 混合单价 blended_price = payments(非gift) / students.total_hours
 * - 剩余价值 = remaining_hours * blended_price
 */
reports.get('/learning/risk-students', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  const DB = c.env.DB;
  const { effectiveOrgId, userRole } = perm;

  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('page_size') || '20')));
  const riskFilter = c.req.query('risk_level') || 'all'; // all | high | medium
  const search = (c.req.query('search') || '').trim();

  try {
    const orgClause = effectiveOrgId ? 'AND s.organization_id = ?' : '';
    const baseParams = effectiveOrgId ? [effectiveOrgId] : [];

    // CTE 现算每个有效学员的剩余课时、累计实付与最后上课日期
    const cteQuery = `
      WITH student_stats AS (
        SELECT 
          s.id,
          s.name,
          s.english_name,
          s.phone,
          s.total_hours,
          s.used_hours,
          (s.total_hours - s.used_hours) as remaining_hours,
          s.organization_id,
          o.name as organization_name,
          s.created_at,
          MAX(c.date) as last_class_date,
          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.student_id = s.id AND p.payment_method != 'gift'
          ), 0) as paid_amount
        FROM students s
        LEFT JOIN organizations o ON o.id = s.organization_id
        LEFT JOIN classes c ON c.student_id = s.id AND c.status = 'completed'
        WHERE s.status = 'active'
          AND (s.total_hours - s.used_hours) > 0
          ${orgClause}
        GROUP BY s.id
      )
    `;

    // 筛选条件：未上课满 14 天
    let whereConditions = [
      `((last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 14)
         OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 14))`
    ];
    const whereParams = [...baseParams];

    if (riskFilter === 'high') {
      whereConditions.push(`
        ((last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 30)
         OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 30))
      `);
    } else if (riskFilter === 'medium') {
      whereConditions.push(`
        ((last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 14 AND julianday(date('now')) - julianday(last_class_date) < 30)
         OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 14 AND julianday(date('now')) - julianday(date(created_at)) < 30))
      `);
    }

    if (search) {
      whereConditions.push('(name LIKE ? OR english_name LIKE ? OR phone LIKE ?)');
      whereParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    // 1. 统计总数与金额汇总
    const countQuery = `
      ${cteQuery}
      SELECT 
        COUNT(*) as total,
        SUM(CASE 
              WHEN (last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 30)
                OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 30)
              THEN 1 ELSE 0 END) as high_risk_count,
        SUM(CASE 
              WHEN ((last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 14 AND julianday(date('now')) - julianday(last_class_date) < 30)
                OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 14 AND julianday(date('now')) - julianday(date(created_at)) < 30))
              THEN 1 ELSE 0 END) as medium_risk_count
      FROM student_stats
      ${whereClause}
    `;

    const countRes = await DB.prepare(countQuery).bind(...whereParams).first();
    const totalRecords = countRes?.total || 0;
    const totalPages = Math.ceil(totalRecords / pageSize);
    const offset = (page - 1) * pageSize;

    // 2. 分页查明细
    const listQuery = `
      ${cteQuery}
      SELECT 
        id,
        name,
        english_name,
        phone,
        total_hours,
        used_hours,
        remaining_hours,
        organization_id,
        organization_name,
        created_at,
        last_class_date,
        CASE 
          WHEN last_class_date IS NOT NULL THEN CAST(julianday(date('now')) - julianday(last_class_date) AS INTEGER)
          ELSE CAST(julianday(date('now')) - julianday(date(created_at)) AS INTEGER)
        END as inactive_days,
        paid_amount
      FROM student_stats
      ${whereClause}
      ORDER BY inactive_days DESC, remaining_hours ASC
      LIMIT ? OFFSET ?
    `;

    const listParams = [...whereParams, pageSize, offset];
    const listRes = await DB.prepare(listQuery).bind(...listParams).all();
    const rows = listRes.results || [];

    let totalValueOnCurrentPage = 0;
    const students = rows.map(r => {
      const remHours = r.remaining_hours || 0;
      const totalHours = r.total_hours || 0;
      const paidAmount = r.paid_amount || 0;

      let blendedPrice = null;
      let remainingValue = 0;
      let hasPrice = false;

      if (totalHours > 0 && paidAmount > 0) {
        blendedPrice = Math.round((paidAmount / totalHours) * 100) / 100;
        remainingValue = Math.round((remHours * blendedPrice) * 100) / 100;
        hasPrice = true;
      }

      totalValueOnCurrentPage += remainingValue;

      const inactiveDays = r.inactive_days || 0;
      const riskLevel = inactiveDays >= 30 ? 'high_risk' : 'medium_risk';
      const riskLabel = inactiveDays >= 30 ? '高危预警 (≥30天未排课)' : '流失预警 (14-29天未排课)';

      let hourLevel = 'healthy';
      if (remHours <= 3) {
        hourLevel = 'critical';
      } else if (remHours <= 8) {
        hourLevel = 'warning';
      }

      return {
        id: r.id,
        name: r.name,
        english_name: r.english_name,
        phone: r.phone,
        organization_id: r.organization_id,
        organization_name: r.organization_name || (r.organization_id === 1 ? 'SunnyBridge' : `机构 #${r.organization_id}`),
        total_hours: totalHours,
        used_hours: r.used_hours || 0,
        remaining_hours: remHours,
        last_class_date: r.last_class_date,
        inactive_days: inactiveDays,
        blended_price: blendedPrice,
        remaining_value: remainingValue,
        has_price: hasPrice,
        risk_level: riskLevel,
        risk_label: riskLabel,
        hour_level: hourLevel
      };
    });

    return c.json(success({
      students,
      pagination: {
        page,
        page_size: pageSize,
        total: totalRecords,
        pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      summary: {
        total_risk_students: totalRecords,
        high_risk_count: countRes?.high_risk_count || 0,
        medium_risk_count: countRes?.medium_risk_count || 0,
        page_remaining_value: Math.round(totalValueOnCurrentPage * 100) / 100
      }
    }, {
      organization_id: effectiveOrgId,
      user_role: userRole,
      risk_level: riskFilter
    }));

  } catch (err) {
    console.error('reports/learning/risk-students error:', err);
    return c.json(error('INTERNAL_ERROR', '获取流失预警名单失败: ' + err.message), 500);
  }
});

export default reports;
