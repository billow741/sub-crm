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


// ============================================================================
// 阶段 B：财务经营分析与汇率管理
// ============================================================================

/**
 * 获取指定月份的 PHP->CNY 汇率
 * 规则（D4）：
 * 1. 优先取当月记录 (rate_is_fallback = false)
 * 2. 当月无记录时，取不晚于该月的最近一条记录 (rate_is_fallback = true)
 * 3. 一条都没有时，返回 fx_missing = true, rate = null
 */
async function getFxRateForMonth(DB, targetMonth) {
  // 1. 当月精准匹配
  const exact = await DB.prepare(`
    SELECT month, rate, source, updated_by, updated_at
    FROM report_fx_rates
    WHERE month = ?
  `).bind(targetMonth).first();

  if (exact) {
    return {
      rate: exact.rate,
      rate_month: exact.month,
      rate_is_fallback: false,
      source: exact.source,
      fx_missing: false
    };
  }

  // 2. 回退匹配：不晚于该月的最近一条
  const fallback = await DB.prepare(`
    SELECT month, rate, source, updated_by, updated_at
    FROM report_fx_rates
    WHERE month <= ?
    ORDER BY month DESC
    LIMIT 1
  `).bind(targetMonth).first();

  if (fallback) {
    return {
      rate: fallback.rate,
      rate_month: fallback.month,
      rate_is_fallback: true,
      source: fallback.source,
      fx_missing: false
    };
  }

  // 3. 全表无记录或无更早记录
  return {
    rate: null,
    rate_month: null,
    rate_is_fallback: false,
    source: null,
    fx_missing: true
  };
}

/**
 * 获取学员混合单价映射 (D2/D3)
 * blended_price = 学员非 gift 实付总额 / students.total_hours
 * total_hours 为 0 或实付总额 <= 0 时视为无单价 (unpriced)
 */
async function getStudentBlendedPriceMap(DB) {
  const query = `
    SELECT 
      s.id,
      s.name,
      s.total_hours,
      s.used_hours,
      (s.total_hours - s.used_hours) as remaining_hours,
      s.organization_id,
      s.status,
      COALESCE(p.paid_amount, 0) as paid_amount
    FROM students s
    LEFT JOIN (
      SELECT student_id, SUM(amount) as paid_amount
      FROM payments
      WHERE (payment_method != 'gift' OR payment_method IS NULL)
      GROUP BY student_id
    ) p ON s.id = p.student_id
  `;
  const res = await DB.prepare(query).all();
  const map = new Map();
  for (const s of (res.results || [])) {
    const totalHours = s.total_hours || 0;
    const paidAmount = s.paid_amount || 0;
    let blendedPrice = null;
    let hasPrice = false;
    if (totalHours > 0 && paidAmount > 0) {
      blendedPrice = Math.round((paidAmount / totalHours) * 10000) / 10000;
      hasPrice = true;
    }
    map.set(s.id, {
      id: s.id,
      name: s.name,
      total_hours: totalHours,
      used_hours: s.used_hours || 0,
      remaining_hours: Math.round(((totalHours - (s.used_hours || 0))) * 100) / 100,
      organization_id: s.organization_id,
      status: s.status,
      paid_amount: paidAmount,
      blended_price: blendedPrice,
      has_price: hasPrice
    });
  }
  return map;
}

/**
 * 获取指定期间内的机构结算单汇总（兼容 amount_due_cny 与 total_amount 列名）
 */
async function getOrgSettlementsInPeriod(DB, fromDate, toDate, effectiveOrgId = null) {
  let query = `
    SELECT *
    FROM org_settlements
    WHERE status != 'cancelled' AND status != 'void'
  `;
  const params = [];
  if (effectiveOrgId) {
    query += ' AND org_id = ?';
    params.push(effectiveOrgId);
  }
  const res = await DB.prepare(query).bind(...params).all();
  const rows = res.results || [];

  // 期间过滤：以 period_end 落入期间为准
  const periodRows = rows.filter(r => {
    const pEnd = r.period_end;
    if (!pEnd) return false;
    return pEnd >= fromDate && pEnd <= toDate;
  });

  let amountDue = 0;
  let amountPaid = 0;
  for (const r of periodRows) {
    const due = Number(r.amount_due_cny ?? r.total_amount ?? 0);
    const paid = Number(r.paid_amount ?? r.paid_amount_cny ?? 0);
    amountDue += due;
    amountPaid += paid;
  }

  return {
    rows: periodRows,
    amount_due_cny: Math.round(amountDue * 100) / 100,
    paid_amount_cny: Math.round(amountPaid * 100) / 100,
    pending_amount_cny: Math.round(Math.max(0, amountDue - amountPaid) * 100) / 100,
    count: periodRows.length
  };
}

/**
 * 获取机构课时包概况（兼容 total_amount 与 amount_cny）
 */
async function getOrgPackagesOverview(DB, effectiveOrgId = null) {
  let query = `
    SELECT *
    FROM org_packages
    WHERE status != 'cancelled'
  `;
  const params = [];
  if (effectiveOrgId) {
    query += ' AND org_id = ?';
    params.push(effectiveOrgId);
  }
  const res = await DB.prepare(query).bind(...params).all();
  const rows = res.results || [];

  let totalHours = 0;
  let usedHours = 0;
  let totalAmount = 0;
  let unpaidAmount = 0;
  let unpaidRemHours = 0;

  for (const r of rows) {
    const th = Number(r.total_hours || 0);
    const uh = Number(r.used_hours || 0);
    const amt = Number(r.total_amount ?? r.amount_cny ?? 0);
    const paid = Number(r.paid_amount ?? r.paid_amount_cny ?? 0);
    totalHours += th;
    usedHours += uh;
    totalAmount += amt;
    if (r.status === 'pending' || r.status === 'partial_paid') {
      unpaidAmount += Math.max(0, amt - paid);
      unpaidRemHours += Math.max(0, th - uh);
    }
  }

  return {
    total_hours: Math.round(totalHours * 100) / 100,
    used_hours: Math.round(usedHours * 100) / 100,
    remaining_hours: Math.round(Math.max(0, totalHours - usedHours) * 100) / 100,
    total_amount_cny: Math.round(totalAmount * 100) / 100,
    unpaid_amount_cny: Math.round(unpaidAmount * 100) / 100,
    unpaid_remaining_hours: Math.round(unpaidRemHours * 100) / 100,
    packages_count: rows.length
  };
}

/**
 * 阶段 D 提取通用辅助函数：收款汇总（期间 payments 按 payment_method 分组；gift 单列且不计入现金收入合计）
 */
async function getRechargeSummary(DB, fromDate, toDate, effectiveOrgId = null) {
  let payQuery = `
    SELECT 
      COALESCE(payment_method, 'other') as method,
      COUNT(*) as count,
      SUM(amount) as amount,
      SUM(COALESCE(hours, 0)) as hours
    FROM payments
    WHERE date >= ? AND date <= ?
  `;
  const payParams = [fromDate, toDate];
  if (effectiveOrgId) {
    payQuery += ' AND organization_id = ?';
    payParams.push(effectiveOrgId);
  }
  payQuery += ' GROUP BY method';

  const paymentsRes = await DB.prepare(payQuery).bind(...payParams).all();
  const payRows = paymentsRes.results || [];

  let totalCashIncome = 0;
  let totalCashCount = 0;
  let giftCount = 0;
  let giftHours = 0;
  const byMethodRaw = [];

  for (const r of payRows) {
    if (r.method === 'gift') {
      giftCount += r.count;
      giftHours += (r.hours || 0);
    } else {
      totalCashIncome += (r.amount || 0);
      totalCashCount += r.count;
      byMethodRaw.push({
        method: r.method,
        amount: Math.round((r.amount || 0) * 100) / 100,
        count: r.count,
        hours: Math.round((r.hours || 0) * 100) / 100
      });
    }
  }

  const byMethod = byMethodRaw.map(m => ({
    ...m,
    percentage: totalCashIncome > 0 ? Math.round((m.amount / totalCashIncome) * 1000) / 10 : 0
  }));

  return {
    cash_income: Math.round(totalCashIncome * 100) / 100,
    cash_count: totalCashCount,
    gift: {
      count: giftCount,
      hours: Math.round(giftHours * 100) / 100,
      amount: 0
    },
    by_method: byMethod
  };
}

/**
 * 阶段 D 提取通用辅助函数：消课收入核算 — 个人学员课（不按 organization 过滤；organization 仅作分组明细）（已含 25 分钟课 0.66 系数，禁止按 duration 二次折算）
 */
async function getConsumptionRevenueSummary(DB, fromDate, toDate, studentPriceMap) {
  const completedClassesQuery = `
    SELECT 
      c.id,
      c.student_id,
      c.teacher_id,
      c.teacher,
      c.hours,
      c.date,
      c.organization_id
    FROM classes c
    WHERE c.status = 'completed'
      AND c.date >= ? AND c.date <= ?
  `;
  const completedClassesRes = await DB.prepare(completedClassesQuery).bind(fromDate, toDate).all();
  const completedClasses = completedClassesRes.results || [];

  const orgsRes = await DB.prepare('SELECT id, name FROM organizations').all();
  const orgMap = new Map();
  for (const org of (orgsRes.results || [])) {
    orgMap.set(org.id, org.name);
  }

  let consumptionRevenue = 0;
  let pricedHours = 0;
  let unpricedHours = 0;
  const orgGroupMap = new Map();

  for (const cls of completedClasses) {
    const h = Number(cls.hours || 0);
    const stu = studentPriceMap.get(cls.student_id);
    const hasPrice = Boolean(stu && stu.has_price);
    const rev = hasPrice ? (h * stu.blended_price) : 0;

    if (hasPrice) {
      consumptionRevenue += rev;
      pricedHours += h;
    } else {
      unpricedHours += h;
    }

    const orgId = cls.organization_id ?? null;
    let grp = orgGroupMap.get(orgId);
    if (!grp) {
      grp = {
        organization_id: orgId,
        classes_count: 0,
        total_hours: 0,
        priced_hours: 0,
        unpriced_hours: 0,
        amount: 0
      };
      orgGroupMap.set(orgId, grp);
    }
    grp.classes_count += 1;
    grp.total_hours += h;
    if (hasPrice) {
      grp.amount += rev;
      grp.priced_hours += h;
    } else {
      grp.unpriced_hours += h;
    }
  }

  const byOrganization = Array.from(orgGroupMap.values()).map(grp => {
    const orgId = grp.organization_id;
    const orgName = orgId === null ? '未分组' : (orgMap.get(orgId) || `机构 #${orgId}`);
    return {
      organization_id: orgId,
      organization_name: orgName,
      classes_count: grp.classes_count,
      total_hours: Math.round(grp.total_hours * 100) / 100,
      priced_hours: Math.round(grp.priced_hours * 100) / 100,
      unpriced_hours: Math.round(grp.unpriced_hours * 100) / 100,
      amount: Math.round(grp.amount * 100) / 100
    };
  });

  byOrganization.sort((a, b) => b.amount - a.amount);

  return {
    amount: Math.round(consumptionRevenue * 100) / 100,
    priced_hours: Math.round(pricedHours * 100) / 100,
    unpriced_hours: Math.round(unpricedHours * 100) / 100,
    total_hours: Math.round((pricedHours + unpricedHours) * 100) / 100,
    classes_count: completedClasses.length,
    by_organization: byOrganization,
    estimated: true
  };
}

/**
 * 阶段 D 提取通用辅助函数：教师成本折算（以 period_end 所在月汇率折算）
 */
async function getTeacherCostSummary(DB, fromDate, toDate, targetMonth) {
  const tpQuery = `
    SELECT 
      id,
      teacher_id,
      period_start,
      period_end,
      total_amount,
      status
    FROM teacher_payments
    WHERE period_end >= ? AND period_end <= ?
      AND status != 'cancelled'
  `;
  const tpRes = await DB.prepare(tpQuery).bind(fromDate, toDate).all();
  const tpList = tpRes.results || [];

  let totalPhp = 0;
  let paidPhp = 0;
  let pendingPhp = 0;

  for (const tp of tpList) {
    const amt = Number(tp.total_amount || 0);
    totalPhp += amt;
    if (tp.status === 'paid') {
      paidPhp += amt;
    } else if (tp.status === 'pending') {
      pendingPhp += amt;
    }
  }

  const fxInfo = await getFxRateForMonth(DB, targetMonth);

  let amountCny = null;
  let paidCny = null;
  let pendingCny = null;

  if (!fxInfo.fx_missing && fxInfo.rate) {
    let totalCnyCalc = 0;
    let paidCnyCalc = 0;
    let pendingCnyCalc = 0;

    for (const tp of tpList) {
      const pMonth = (tp.period_end || '').slice(0, 7) || targetMonth;
      const pFx = await getFxRateForMonth(DB, pMonth);
      const effectiveRate = pFx.fx_missing ? fxInfo.rate : pFx.rate;
      const amtPhp = Number(tp.total_amount || 0);
      const cnyVal = amtPhp * effectiveRate;
      totalCnyCalc += cnyVal;
      if (tp.status === 'paid') {
        paidCnyCalc += cnyVal;
      } else if (tp.status === 'pending') {
        pendingCnyCalc += cnyVal;
      }
    }

    amountCny = Math.round(totalCnyCalc * 100) / 100;
    paidCny = Math.round(paidCnyCalc * 100) / 100;
    pendingCny = Math.round(pendingCnyCalc * 100) / 100;
  }

  return {
    amount_php: Math.round(totalPhp * 100) / 100,
    paid_php: Math.round(paidPhp * 100) / 100,
    pending_php: Math.round(pendingPhp * 100) / 100,
    rate: fxInfo.rate,
    rate_month: fxInfo.rate_month,
    rate_is_fallback: fxInfo.rate_is_fallback,
    amount_cny: amountCny,
    paid_cny: paidCny,
    pending_cny: pendingCny,
    fx_missing: fxInfo.fx_missing,
    payments_count: tpList.length,
    tpList,
    fxInfo
  };
}

/**
 * 阶段 D 提取通用辅助函数：课时调整统计（D5 口径）
 */
async function getHourAdjustmentsSummary(DB, fromDate, toDate, effectiveOrgId = null, studentPriceMap) {
  let hcQuery = `
    SELECT 
      hc.id,
      hc.student_id,
      hc.amount,
      hc.created_at,
      s.organization_id
    FROM hour_changes hc
    JOIN students s ON hc.student_id = s.id
    WHERE hc.type = 'adjust'
      AND date(hc.created_at) >= ? AND date(hc.created_at) <= ?
  `;
  const hcParams = [fromDate, toDate];
  if (effectiveOrgId) {
    hcQuery += ' AND s.organization_id = ?';
    hcParams.push(effectiveOrgId);
  }
  const hcRes = await DB.prepare(hcQuery).bind(...hcParams).all();
  const hcList = hcRes.results || [];

  let posHours = 0;
  let posCount = 0;
  let negHours = 0;
  let negCount = 0;
  let negEstAmount = 0;
  let negUnpricedHours = 0;

  for (const hc of hcList) {
    const amt = Number(hc.amount || 0);
    if (amt > 0) {
      posHours += amt;
      posCount++;
    } else if (amt < 0) {
      const absVal = Math.abs(amt);
      negHours += absVal;
      negCount++;
      const stu = studentPriceMap.get(hc.student_id);
      if (stu && stu.has_price) {
        negEstAmount += absVal * stu.blended_price;
      } else {
        negUnpricedHours += absVal;
      }
    }
  }

  return {
    positive_hours: Math.round(posHours * 100) / 100,
    positive_count: posCount,
    negative_hours: Math.round(negHours * 100) / 100,
    negative_count: negCount,
    negative_estimated_amount: Math.round(negEstAmount * 100) / 100,
    negative_unpriced_hours: Math.round(negUnpricedHours * 100) / 100,
    note: '退款按发生期计入；系统未记录实际退款金额，此处为按混合单价的估算。'
  };
}

/**
 * 阶段 D 提取通用辅助函数：运营组核心指标
 */
async function getOperationsSummary(DB, fromDate, toDate, effectiveOrgId = null) {
  const orgFilter = effectiveOrgId ? 'AND s.organization_id = ?' : '';
  const orgParams = effectiveOrgId ? [effectiveOrgId] : [];

  // 1. 活跃学员数与总剩余课时
  const stuRes = await DB.prepare(`
    SELECT 
      COUNT(*) as active_students_count,
      COALESCE(SUM(s.total_hours - s.used_hours), 0) as total_remaining_hours
    FROM students s
    WHERE s.status = 'active' ${orgFilter}
  `).bind(...orgParams).first();

  const activeStudentsCount = Number(stuRes?.active_students_count || 0);
  const totalRemainingHours = Math.round(Number(stuRes?.total_remaining_hours || 0) * 100) / 100;

  // 2. 流失预警人数（紧迫/关注分开，口径同 learning/risk-students）
  const orgClause = effectiveOrgId ? 'AND s.organization_id = ?' : '';
  const riskQuery = `
    WITH student_stats AS (
      SELECT 
        s.id,
        s.created_at,
        MAX(c.date) as last_class_date
      FROM students s
      LEFT JOIN classes c ON c.student_id = s.id AND c.status = 'completed'
      WHERE s.status = 'active'
        AND (s.total_hours - s.used_hours) > 0
        ${orgClause}
      GROUP BY s.id
    )
    SELECT 
      COUNT(*) as total_risk_students,
      SUM(CASE 
            WHEN (last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 30)
              OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 30)
            THEN 1 ELSE 0 END) as high_risk_count,
      SUM(CASE 
            WHEN ((last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 14 AND julianday(date('now')) - julianday(last_class_date) < 30)
              OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 14 AND julianday(date('now')) - julianday(date(created_at)) < 30))
            THEN 1 ELSE 0 END) as medium_risk_count
    FROM student_stats
    WHERE ((last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 14)
       OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 14))
  `;
  const riskRes = await DB.prepare(riskQuery).bind(...orgParams).first();
  const urgentCount = Number(riskRes?.high_risk_count || 0);
  const warningCount = Number(riskRes?.medium_risk_count || 0);
  const totalRiskCount = Number(riskRes?.total_risk_students || 0);

  // 3. 期间完课率与反馈填报率 (口径同 teaching/summary)
  const classOrgFilter = effectiveOrgId ? 'AND organization_id = ?' : '';
  const classParams = [fromDate, toDate, ...orgParams];

  // 出勤结构 (正课 is_trial = 0)
  const attRes = await DB.prepare(`
    SELECT 
      COUNT(*) as total_classes,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
    FROM classes
    WHERE date >= ? AND date <= ? AND is_trial = 0
      ${classOrgFilter}
  `).bind(...classParams).first();

  const totalClasses = Number(attRes?.total_classes || 0);
  const completedCount = Number(attRes?.completed_count || 0);
  const completionRate = totalClasses > 0 ? Math.round((completedCount / totalClasses) * 10000) / 10000 : 0;

  // 反馈填报率 (期间内 completed 课程)
  const fbRes = await DB.prepare(`
    SELECT 
      COUNT(*) as total_completed,
      SUM(CASE WHEN (fb_teacher_message IS NOT NULL AND TRIM(fb_teacher_message) != '') 
                 OR (fb_vocab IS NOT NULL AND TRIM(fb_vocab) != '') 
               THEN 1 ELSE 0 END) as submitted_count
    FROM classes
    WHERE date >= ? AND date <= ? AND status = 'completed'
      ${classOrgFilter}
  `).bind(...classParams).first();

  const feedbackTotal = Number(fbRes?.total_completed || 0);
  const feedbackSubmitted = Number(fbRes?.submitted_count || 0);
  const feedbackRate = feedbackTotal > 0 ? Math.round((feedbackSubmitted / feedbackTotal) * 10000) / 10000 : 0;

  // 期间试听人数 (is_trial = 1 计数)
  const trialRes = await DB.prepare(`
    SELECT COUNT(*) as trial_count
    FROM classes
    WHERE date >= ? AND date <= ? AND is_trial = 1
      ${classOrgFilter}
  `).bind(...classParams).first();
  const trialStudentsCount = Number(trialRes?.trial_count || 0);

  return {
    active_students_count: activeStudentsCount,
    total_remaining_hours: totalRemainingHours,
    risk_students: {
      urgent_count: urgentCount,
      warning_count: warningCount,
      total_risk_count: totalRiskCount
    },
    completion_rate: completionRate,
    feedback_rate: feedbackRate,
    trial_students_count: trialStudentsCount
  };
}

/**
 * CSV 单元格转义（RFC 4180 标准）
 */
function toCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * GET /api/v1/reports/fx-rates
 * 汇率列表（月份、rate、来源、更新时间/人）
 * 允许 super_admin 与 org_admin 读取
 */
reports.get('/fx-rates', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  const DB = c.env.DB;
  try {
    const res = await DB.prepare(`
      SELECT month, rate, source, updated_by, updated_at
      FROM report_fx_rates
      ORDER BY month DESC
    `).all();

    return c.json(success({
      rates: res.results || []
    }));
  } catch (err) {
    console.error('GET /reports/fx-rates 错误:', err);
    return c.json(error('INTERNAL_ERROR', '获取汇率列表失败: ' + err.message), 500);
  }
});

/**
 * PUT /api/v1/reports/fx-rates/:month
 * 维护某月汇率（仅 super_admin）
 * body: { rate, source }
 */
reports.put('/fx-rates/:month', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  if (perm.userRole !== 'super_admin') {
    return c.json(error('FORBIDDEN', '仅超级管理员可维护汇率'), 403);
  }

  const month = c.req.param('month');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json(error('VALIDATION_ERROR', '月份格式必须为 YYYY-MM'), 400);
  }

  let body;
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json(error('VALIDATION_ERROR', '请求体必须为 JSON'), 400);
  }

  const rate = parseFloat(body.rate);
  if (isNaN(rate) || rate <= 0) {
    return c.json(error('VALIDATION_ERROR', '汇率 rate 必须为大于 0 的数值'), 400);
  }

  const source = body.source ? String(body.source).trim() : null;
  const updatedBy = perm.userRole || 'super_admin';
  const DB = c.env.DB;

  try {
    await DB.prepare(`
      INSERT INTO report_fx_rates (month, rate, source, updated_by, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(month) DO UPDATE SET
        rate = excluded.rate,
        source = excluded.source,
        updated_by = excluded.updated_by,
        updated_at = datetime('now')
    `).bind(month, rate, source, updatedBy).run();

    const saved = await DB.prepare(`
      SELECT month, rate, source, updated_by, updated_at
      FROM report_fx_rates
      WHERE month = ?
    `).bind(month).first();

    return c.json(success(saved));
  } catch (err) {
    console.error('PUT /reports/fx-rates/:month 错误:', err);
    return c.json(error('INTERNAL_ERROR', '保存汇率失败: ' + err.message), 500);
  }
});

/**
 * GET /api/v1/reports/financial/summary
 * 财务经营总览：
 * 1. 期间收款汇总（按 payment_method 分类；gift 单列且不计入现金收入）
 * 2. 直营消课收入估算（基于学员混合单价，classes.hours 已含系数，禁止二次折算）
 * 3. 课时负债（时点值：在读学员剩余课时 * blended_price 之和）
 * 4. 教师成本（以 period_end 落入期间为准，双币呈现，按锁定月度汇率折算）
 * 5. 机构结算款项（org_settlements 应收合计）
 * 6. 全站毛利与直营毛利估算（分摊教师成本）
 * 7. 课时调整流水统计（hour_changes adjust 正负分开汇总，含负向退费估算）
 *
 * 权限控制：
 * - org_admin 仅返回本机构结算相关字段，教师成本、直营消课收入、毛利等后端直接不下发
 */
reports.get('/financial/summary', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  const DB = c.env.DB;
  const { effectiveOrgId, userRole } = perm;
  const { fromDate, toDate } = resolveDateRange(c);
  const targetMonth = toDate.slice(0, 7);

  try {
    // ----------------------------------------------------
    // 权限裁剪：org_admin 仅返回本机构结算相关字段
    // 教师成本、直营消课收入、全站与直营毛利、课时负债等敏感键在响应中绝不存在！
    // ----------------------------------------------------
    if (userRole === 'org_admin') {
      const orgSettlementsData = await getOrgSettlementsInPeriod(DB, fromDate, toDate, effectiveOrgId);
      const orgPackagesData = await getOrgPackagesOverview(DB, effectiveOrgId);
      const rechargeData = await getRechargeSummary(DB, fromDate, toDate, effectiveOrgId);

      return c.json(success({
        organization_id: effectiveOrgId,
        period: { from_date: fromDate, to_date: toDate },
        org_settlements: {
          amount_due_cny: orgSettlementsData.amount_due_cny,
          paid_amount_cny: orgSettlementsData.paid_amount_cny,
          pending_amount_cny: orgSettlementsData.pending_amount_cny,
          count: orgSettlementsData.count,
          items: orgSettlementsData.rows.map(s => ({
            id: s.id,
            period_start: s.period_start,
            period_end: s.period_end,
            total_classes: s.total_classes,
            total_hours: s.total_hours,
            amount_due_cny: Number(s.amount_due_cny ?? s.total_amount ?? 0),
            paid_amount_cny: Number(s.paid_amount ?? s.paid_amount_cny ?? 0),
            status: s.status
          }))
        },
        org_packages: {
          total_hours: orgPackagesData.total_hours,
          used_hours: orgPackagesData.used_hours,
          remaining_hours: orgPackagesData.remaining_hours,
          total_amount_cny: orgPackagesData.total_amount_cny,
          unpaid_amount_cny: orgPackagesData.unpaid_amount_cny,
          unpaid_remaining_hours: orgPackagesData.unpaid_remaining_hours,
          packages_count: orgPackagesData.packages_count
        },
        recharge: rechargeData
      }, {
        organization_id: effectiveOrgId,
        user_role: userRole
      }));
    }

    // ----------------------------------------------------
    // super_admin：全量财务核算
    // ----------------------------------------------------

    // 1. 学员混合单价映射
    const studentPriceMap = await getStudentBlendedPriceMap(DB);

    // 2. 消课收入（个人学员课（不按 organization 过滤；organization 仅作分组明细），classes.hours 已含系数，禁止按 duration 二次折算）
    const consumptionRevenueData = await getConsumptionRevenueSummary(DB, fromDate, toDate, studentPriceMap);

    // 3. 收款汇总（期间 payments 按 payment_method 分组；gift 单列且不计入现金收入合计）
    const rechargeData = await getRechargeSummary(DB, fromDate, toDate, effectiveOrgId);

    // 4. 课时负债（时点值：全部活跃个人学员（不按 organization 过滤）剩余课时 * blended_price 之和；机构侧单独给 org_packages 未付清口径）
    let directLiability = 0;
    let directPricedRemHours = 0;
    let directUnpricedRemHours = 0;

    for (const stu of studentPriceMap.values()) {
      if (stu.status === 'active') {
        const rem = stu.remaining_hours || 0;
        if (rem > 0) {
          if (stu.has_price) {
            directLiability += rem * stu.blended_price;
            directPricedRemHours += rem;
          } else {
            directUnpricedRemHours += rem;
          }
        }
      }
    }

    const orgPackagesOverview = await getOrgPackagesOverview(DB, effectiveOrgId);

    const liabilityData = {
      direct_liability_cny: Math.round(directLiability * 100) / 100,
      direct_priced_remaining_hours: Math.round(directPricedRemHours * 100) / 100,
      direct_unpriced_remaining_hours: Math.round(directUnpricedRemHours * 100) / 100,
      org_packages_unpaid_cny: orgPackagesOverview.unpaid_amount_cny,
      org_remaining_hours: orgPackagesOverview.unpaid_remaining_hours,
      estimated: true
    };

    // 5. 教师成本（以 period_end 落入期间为准，paid 与 pending 分开汇总，cancelled 排除）
    const teacherCostData = await getTeacherCostSummary(DB, fromDate, toDate, targetMonth);

    // 6. 期间机构应收（org_settlements 应收合计）
    const orgSettlementsData = await getOrgSettlementsInPeriod(DB, fromDate, toDate, effectiveOrgId);

    // 7. 毛利核算
    let overallGrossProfit = null;
    if (!teacherCostData.fx_missing && teacherCostData.amount_cny !== null) {
      overallGrossProfit = Math.round((consumptionRevenueData.amount + orgSettlementsData.amount_due_cny - teacherCostData.amount_cny) * 100) / 100;
    }

    // 个人学员毛利估算：按各教师个人学员课时占其总课时比例分摊课酬
    let directGrossProfit = null;
    let directTeacherCostCny = null;

    if (!teacherCostData.fx_missing && teacherCostData.amount_cny !== null) {
      const teacherHoursQuery = `
        SELECT 
          c.teacher_id,
          SUM(c.hours) as total_hours,
          SUM(CASE WHEN c.student_id IN (SELECT student_id FROM payments WHERE payment_method != 'gift' OR payment_method IS NULL) THEN c.hours ELSE 0 END) as direct_hours
        FROM classes c
        WHERE c.status = 'completed'
          AND c.date >= ? AND c.date <= ?
        GROUP BY c.teacher_id
      `;
      const thRes = await DB.prepare(teacherHoursQuery).bind(fromDate, toDate).all();
      const teacherRatioMap = new Map();
      for (const th of (thRes.results || [])) {
        const tot = Number(th.total_hours || 0);
        const dir = Number(th.direct_hours || 0);
        teacherRatioMap.set(th.teacher_id, tot > 0 ? (dir / tot) : 1.0);
      }

      let allocCostCny = 0;
      for (const tp of teacherCostData.tpList) {
        const pMonth = (tp.period_end || '').slice(0, 7) || targetMonth;
        const pFx = await getFxRateForMonth(DB, pMonth);
        const effectiveRate = pFx.fx_missing ? teacherCostData.fxInfo.rate : pFx.rate;
        const amtPhp = Number(tp.total_amount || 0);
        const cnyVal = amtPhp * effectiveRate;
        const ratio = teacherRatioMap.has(tp.teacher_id) ? teacherRatioMap.get(tp.teacher_id) : 1.0;
        allocCostCny += cnyVal * ratio;
      }
      directTeacherCostCny = Math.round(allocCostCny * 100) / 100;
      directGrossProfit = Math.round((consumptionRevenueData.amount - directTeacherCostCny) * 100) / 100;
    }

    const grossProfitData = {
      overall_gross_profit_cny: overallGrossProfit,
      direct_gross_profit_cny: directGrossProfit,
      direct_teacher_cost_cny: directTeacherCostCny,
      estimated: true,
      fx_missing: teacherCostData.fx_missing
    };

    // 8. 课时调整（D5）：hour_changes 中 type 为 adjust 的记录正负分开汇总
    const hourAdjustmentsData = await getHourAdjustmentsSummary(DB, fromDate, toDate, effectiveOrgId, studentPriceMap);

    return c.json(success({
      period: { from_date: fromDate, to_date: toDate, target_month: targetMonth },
      consumption_revenue: consumptionRevenueData,
      recharge: rechargeData,
      class_hours_liability: liabilityData,
      teacher_cost: {
        amount_php: teacherCostData.amount_php,
        paid_php: teacherCostData.paid_php,
        pending_php: teacherCostData.pending_php,
        rate: teacherCostData.rate,
        rate_month: teacherCostData.rate_month,
        rate_is_fallback: teacherCostData.rate_is_fallback,
        amount_cny: teacherCostData.amount_cny,
        paid_cny: teacherCostData.paid_cny,
        pending_cny: teacherCostData.pending_cny,
        fx_missing: teacherCostData.fx_missing,
        payments_count: teacherCostData.payments_count
      },
      org_settlements: {
        amount_due_cny: orgSettlementsData.amount_due_cny,
        paid_amount_cny: orgSettlementsData.paid_amount_cny,
        pending_amount_cny: orgSettlementsData.pending_amount_cny,
        count: orgSettlementsData.count
      },
      gross_profit: grossProfitData,
      hour_adjustments: hourAdjustmentsData
    }, {
      organization_id: effectiveOrgId,
      user_role: userRole
    }));

  } catch (err) {
    console.error('reports/financial/summary 错误:', err);
    return c.json(error('INTERNAL_ERROR', '获取财务经营总览失败: ' + err.message), 500);
  }
});

/**
 * GET /api/v1/reports/financial/trend
 * 财务月度趋势（按 from_date/to_date 归月输出：充值、消课收入估算、教师成本 CNY、毛利）
 * 仅限 super_admin；org_admin 调此接口直接 403
 */
reports.get('/financial/trend', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  if (perm.userRole === 'org_admin') {
    return c.json(error('FORBIDDEN', '机构管理员无权查看全站财务趋势'), 403);
  }

  const DB = c.env.DB;
  const qFrom = c.req.query('from_date');
  const qTo = c.req.query('to_date');

  let fromDate = qFrom;
  let toDate = qTo;

  if (!fromDate || !toDate) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startD = new Date(y, m - 5, 1);
    const endD = new Date(y, m + 1, 0);
    const pad = n => String(n).padStart(2, '0');
    fromDate = fromDate || `${startD.getFullYear()}-${pad(startD.getMonth() + 1)}-01`;
    toDate = toDate || `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}`;
  }

  // 生成月份序列
  const months = [];
  const startYear = parseInt(fromDate.slice(0, 4));
  const startMonth = parseInt(fromDate.slice(5, 7));
  const endYear = parseInt(toDate.slice(0, 4));
  const endMonth = parseInt(toDate.slice(5, 7));

  let curY = startYear;
  let curM = startMonth;
  while (curY < endYear || (curY === endYear && curM <= endMonth)) {
    months.push(`${curY}-${String(curM).padStart(2, '0')}`);
    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }
  if (months.length === 0) {
    months.push(toDate.slice(0, 7));
  }

  try {
    const studentPriceMap = await getStudentBlendedPriceMap(DB);
    const trend = [];

    for (const m of months) {
      // 1. 当月充值 (非 gift)
      const payRes = await DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM payments
        WHERE strftime('%Y-%m', date) = ?
          AND (payment_method != 'gift' OR payment_method IS NULL)
      `).bind(m).first();
      const rechargeCny = Math.round(Number(payRes?.total || 0) * 100) / 100;

      // 2. 当月消课收入估算（个人学员） (classes.hours * blended_price)
      const clsRes = await DB.prepare(`
        SELECT student_id, hours
        FROM classes
        WHERE status = 'completed'
          AND strftime('%Y-%m', date) = ?
      `).bind(m).all();
      let consumptionCny = 0;
      for (const cl of (clsRes.results || [])) {
        const h = Number(cl.hours || 0);
        const stu = studentPriceMap.get(cl.student_id);
        if (stu && stu.has_price) {
          consumptionCny += h * stu.blended_price;
        }
      }
      consumptionCny = Math.round(consumptionCny * 100) / 100;

      // 3. 当月机构应收
      const orgRes = await DB.prepare(`
        SELECT *
        FROM org_settlements
        WHERE strftime('%Y-%m', period_end) = ?
          AND status != 'cancelled' AND status != 'void'
      `).bind(m).all();
      let orgReceivablesCny = 0;
      for (const st of (orgRes.results || [])) {
        orgReceivablesCny += Number(st.amount_due_cny ?? st.total_amount ?? 0);
      }
      orgReceivablesCny = Math.round(orgReceivablesCny * 100) / 100;

      // 4. 当月教师成本
      const tpRes = await DB.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) as total_php
        FROM teacher_payments
        WHERE strftime('%Y-%m', period_end) = ?
          AND status != 'cancelled'
      `).bind(m).first();
      const totalPhp = Math.round(Number(tpRes?.total_php || 0) * 100) / 100;

      // 汇率查询
      const fxInfo = await getFxRateForMonth(DB, m);
      let teacherCostCny = null;
      let grossProfitCny = null;

      if (!fxInfo.fx_missing && fxInfo.rate) {
        teacherCostCny = Math.round(totalPhp * fxInfo.rate * 100) / 100;
        grossProfitCny = Math.round((consumptionCny + orgReceivablesCny - teacherCostCny) * 100) / 100;
      }

      trend.push({
        month: m,
        recharge_cny: rechargeCny,
        consumption_revenue_cny: consumptionCny,
        org_receivables_cny: orgReceivablesCny,
        teacher_cost_php: totalPhp,
        teacher_cost_cny: teacherCostCny,
        rate: fxInfo.rate,
        rate_month: fxInfo.rate_month,
        rate_is_fallback: fxInfo.rate_is_fallback,
        fx_missing: fxInfo.fx_missing,
        gross_profit_cny: grossProfitCny
      });
    }

    return c.json(success({
      trend
    }));

  } catch (err) {
    console.error('reports/financial/trend 错误:', err);
    return c.json(error('INTERNAL_ERROR', '获取财务月度趋势失败: ' + err.message), 500);
  }
});


/**
 * 阶段 C：教学交付 - 综合大盘概况
 * GET /api/v1/reports/teaching/summary
 * 参数：from_date, to_date, org_id
 */
reports.get('/teaching/summary', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  const DB = c.env.DB;
  const { effectiveOrgId, userRole } = perm;
  const { fromDate, toDate } = resolveDateRange(c);

  try {
    const orgFilter = effectiveOrgId ? 'AND organization_id = ?' : '';
    const orgParams = effectiveOrgId ? [effectiveOrgId] : [];

    // 1. 出勤结构 (正课 is_trial = 0)
    const attendanceParams = [fromDate, toDate, ...orgParams];
    const attendanceQuery = `
      SELECT 
        COUNT(*) as total_classes,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled_count
      FROM classes
      WHERE date >= ? AND date <= ? AND is_trial = 0
        ${orgFilter}
    `;
    const attRes = await DB.prepare(attendanceQuery).bind(...attendanceParams).first();
    const totalClasses = Number(attRes?.total_classes || 0);
    const completedCount = Number(attRes?.completed_count || 0);
    const absentCount = Number(attRes?.absent_count || 0);
    const cancelledCount = Number(attRes?.cancelled_count || 0);
    const scheduledCount = Number(attRes?.scheduled_count || 0);

    const completionRate = totalClasses > 0 ? Math.round((completedCount / totalClasses) * 10000) / 10000 : 0;
    const absenceRate = totalClasses > 0 ? Math.round((absentCount / totalClasses) * 10000) / 10000 : 0;
    const cancellationRate = totalClasses > 0 ? Math.round((cancelledCount / totalClasses) * 10000) / 10000 : 0;
    const scheduledRate = totalClasses > 0 ? Math.round((scheduledCount / totalClasses) * 10000) / 10000 : 0;

    // 试听课单独计数 (is_trial = 1)
    const trialQuery = `
      SELECT 
        COUNT(*) as total_classes,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled_count
      FROM classes
      WHERE date >= ? AND date <= ? AND is_trial = 1
        ${orgFilter}
    `;
    const trialRes = await DB.prepare(trialQuery).bind(...attendanceParams).first();
    const trialTotalClasses = Number(trialRes?.total_classes || 0);
    const trialCompletedCount = Number(trialRes?.completed_count || 0);
    const trialAbsentCount = Number(trialRes?.absent_count || 0);
    const trialCancelledCount = Number(trialRes?.cancelled_count || 0);
    const trialScheduledCount = Number(trialRes?.scheduled_count || 0);

    // 2. 反馈填报率 (期间内 completed 课程)
    const feedbackQuery = `
      SELECT 
        COUNT(*) as total_completed,
        SUM(CASE WHEN (fb_teacher_message IS NOT NULL AND TRIM(fb_teacher_message) != '') 
                   OR (fb_vocab IS NOT NULL AND TRIM(fb_vocab) != '') 
                 THEN 1 ELSE 0 END) as submitted_count
      FROM classes
      WHERE date >= ? AND date <= ? AND status = 'completed'
        ${orgFilter}
    `;
    const fbRes = await DB.prepare(feedbackQuery).bind(...attendanceParams).first();
    const feedbackTotal = Number(fbRes?.total_completed || 0);
    const feedbackSubmitted = Number(fbRes?.submitted_count || 0);
    const feedbackRate = feedbackTotal > 0 ? Math.round((feedbackSubmitted / feedbackTotal) * 10000) / 10000 : 0;

    // 3. 录像覆盖率 (期间内 completed 课程，fb_recording_status 非 'none')
    const recordingQuery = `
      SELECT 
        COUNT(*) as total_completed,
        SUM(CASE WHEN fb_recording_status IS NOT NULL AND fb_recording_status != 'none' THEN 1 ELSE 0 END) as covered_count,
        SUM(CASE WHEN fb_recording_status = 'ready' THEN 1 ELSE 0 END) as ready_count,
        SUM(CASE WHEN fb_recording_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN fb_recording_status = 'none' OR fb_recording_status IS NULL THEN 1 ELSE 0 END) as none_count
      FROM classes
      WHERE date >= ? AND date <= ? AND status = 'completed'
        ${orgFilter}
    `;
    const recRes = await DB.prepare(recordingQuery).bind(...attendanceParams).first();
    const recordingTotal = Number(recRes?.total_completed || 0);
    const recordingCovered = Number(recRes?.covered_count || 0);
    const recordingRate = recordingTotal > 0 ? Math.round((recordingCovered / recordingTotal) * 10000) / 10000 : 0;

    // 4. 固定教师率 (期间内每名学员以其当期完成课时最多的教师为主教师；按课时加权)
    const fixedTeacherQuery = `
      SELECT 
        student_id,
        COALESCE(teacher_id, 0) as teacher_id,
        SUM(hours) as teacher_hours
      FROM classes
      WHERE date >= ? AND date <= ? AND status = 'completed'
        ${orgFilter}
      GROUP BY student_id, COALESCE(teacher_id, 0)
    `;
    const ftRows = (await DB.prepare(fixedTeacherQuery).bind(...attendanceParams).all()).results || [];
    
    const studentTeacherMap = new Map();
    for (const row of ftRows) {
      const sid = row.student_id;
      const thours = Number(row.teacher_hours || 0);
      if (!studentTeacherMap.has(sid)) {
        studentTeacherMap.set(sid, []);
      }
      studentTeacherMap.get(sid).push(thours);
    }

    let primaryTeacherTotalHours = 0;
    let periodCompletedTotalHours = 0;
    const studentCount = studentTeacherMap.size;

    for (const hoursList of studentTeacherMap.values()) {
      const studentTotal = hoursList.reduce((a, b) => a + b, 0);
      const studentMax = Math.max(...hoursList);
      periodCompletedTotalHours += studentTotal;
      primaryTeacherTotalHours += studentMax;
    }

    periodCompletedTotalHours = Math.round(periodCompletedTotalHours * 100) / 100;
    primaryTeacherTotalHours = Math.round(primaryTeacherTotalHours * 100) / 100;
    const fixedTeacherRate = periodCompletedTotalHours > 0 
      ? Math.round((primaryTeacherTotalHours / periodCompletedTotalHours) * 10000) / 10000 
      : 0;

    // 5. 试听转化 cohort 表 (D6)
    const startMonth = fromDate.substring(0, 7);
    const endMonth = toDate.substring(0, 7);

    const cohortQuery = `
      WITH first_trials AS (
        SELECT 
          c.student_id,
          MIN(c.date) as first_trial_date
        FROM classes c
        WHERE c.is_trial = 1
          ${orgFilter}
        GROUP BY c.student_id
      ),
      cohort_students AS (
        SELECT 
          ft.student_id,
          ft.first_trial_date,
          strftime('%Y-%m', ft.first_trial_date) as cohort_month
        FROM first_trials ft
        WHERE strftime('%Y-%m', ft.first_trial_date) >= ? 
          AND strftime('%Y-%m', ft.first_trial_date) <= ?
      ),
      first_converted_payments AS (
        SELECT 
          cs.student_id,
          MIN(p.date) as first_payment_date
        FROM cohort_students cs
        JOIN payments p ON p.student_id = cs.student_id 
                       AND p.payment_method != 'gift' 
                       AND p.hours > 0
                       AND p.date >= cs.first_trial_date
                       AND p.date <= date(cs.first_trial_date, '+30 days')
                       ${effectiveOrgId ? 'AND p.organization_id = ?' : ''}
        GROUP BY cs.student_id
      )
      SELECT 
        cs.cohort_month,
        COUNT(cs.student_id) as trial_count,
        COUNT(fcp.student_id) as converted_count,
        ROUND(CAST(COUNT(fcp.student_id) AS REAL) / COUNT(cs.student_id), 4) as conversion_rate,
        AVG(CASE WHEN fcp.first_payment_date IS NOT NULL 
                 THEN CAST(julianday(fcp.first_payment_date) - julianday(cs.first_trial_date) AS INTEGER) 
                 ELSE NULL END) as avg_conversion_days
      FROM cohort_students cs
      LEFT JOIN first_converted_payments fcp ON fcp.student_id = cs.student_id
      GROUP BY cs.cohort_month
      ORDER BY cs.cohort_month ASC
    `;

    const cohortParams = effectiveOrgId 
      ? [effectiveOrgId, startMonth, endMonth, effectiveOrgId]
      : [startMonth, endMonth];
    const cohortRows = (await DB.prepare(cohortQuery).bind(...cohortParams).all()).results || [];
    
    const cohortMap = new Map();
    for (const r of cohortRows) {
      cohortMap.set(r.cohort_month, r);
    }

    const cohortList = [];
    const [startYear, startM] = startMonth.split('-').map(Number);
    const [endYear, endM] = endMonth.split('-').map(Number);
    let y = startYear;
    let m = startM;
    while (y < endYear || (y === endYear && m <= endM)) {
      const mStr = `${y}-${String(m).padStart(2, '0')}`;
      if (cohortMap.has(mStr)) {
        const item = cohortMap.get(mStr);
        cohortList.push({
          month: mStr,
          trial_count: Number(item.trial_count || 0),
          converted_count: Number(item.converted_count || 0),
          conversion_rate: Number(item.conversion_rate || 0),
          avg_conversion_days: item.avg_conversion_days !== null ? Math.round(Number(item.avg_conversion_days) * 10) / 10 : null
        });
      } else {
        cohortList.push({
          month: mStr,
          trial_count: 0,
          converted_count: 0,
          conversion_rate: 0,
          avg_conversion_days: null
        });
      }
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }

    return c.json(success({
      attendance: {
        total_classes: totalClasses,
        completed_count: completedCount,
        absent_count: absentCount,
        cancelled_count: cancelledCount,
        scheduled_count: scheduledCount,
        completion_rate: completionRate,
        absence_rate: absenceRate,
        cancellation_rate: cancellationRate,
        scheduled_rate: scheduledRate,
        trial_summary: {
          total_classes: trialTotalClasses,
          completed_count: trialCompletedCount,
          absent_count: trialAbsentCount,
          cancelled_count: trialCancelledCount,
          scheduled_count: trialScheduledCount
        }
      },
      feedback: {
        total_completed: feedbackTotal,
        submitted_count: feedbackSubmitted,
        feedback_rate: feedbackRate
      },
      recording: {
        total_completed: recordingTotal,
        covered_count: recordingCovered,
        recording_rate: recordingRate,
        ready_count: Number(recRes?.ready_count || 0),
        pending_count: Number(recRes?.pending_count || 0),
        none_count: Number(recRes?.none_count || 0)
      },
      fixed_teacher: {
        fixed_teacher_rate: fixedTeacherRate,
        student_count: studentCount,
        primary_teacher_hours: primaryTeacherTotalHours,
        total_completed_hours: periodCompletedTotalHours
      },
      trial_cohort: cohortList
    }, {
      from_date: fromDate,
      to_date: toDate,
      organization_id: effectiveOrgId,
      attendance_denominator_desc: "出勤结构分母为期间内排课日期落入区间的全部正课节数(COUNT(*))，包含 completed、absent、cancelled、scheduled；试听课(is_trial=1)单独统计，不计入正课分母。",
      feedback_definition_desc: "反馈已填判定口径为 fb_teacher_message 或 fb_vocab 非空且去除空白后有效。",
      fixed_teacher_desc: "固定教师率以学员当期完成课时最多的教师为主教师，按当期总完成课时加权计算。"
    }));

  } catch (err) {
    console.error('reports/teaching/summary 错误:', err);
    return c.json(error('INTERNAL_ERROR', '获取教学交付汇总失败: ' + err.message), 500);
  }
});

/**
 * 阶段 C：教学交付 - 教师负荷与教学质量
 * GET /api/v1/reports/teaching/workload
 * 参数：from_date, to_date, org_id, sort_by (hours/classes_count/score), order (asc/desc), page, page_size
 */
reports.get('/teaching/workload', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  const DB = c.env.DB;
  const { effectiveOrgId, userRole } = perm;
  const { fromDate, toDate } = resolveDateRange(c);

  const sortBy = c.req.query('sort_by') || 'hours'; // hours | classes_count | score
  const sortOrder = (c.req.query('order') || 'desc').toLowerCase(); // desc | asc
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('page_size') || '20')));

  try {
    const orgFilter = effectiveOrgId ? 'AND c.organization_id = ?' : '';
    const orgParams = effectiveOrgId ? [effectiveOrgId] : [];

    const workloadParams = [fromDate, toDate, ...orgParams];
    const workloadQuery = `
      SELECT 
        c.teacher_id,
        t.name as registered_teacher_name,
        c.teacher as class_teacher_name,
        COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_classes,
        ROUND(SUM(CASE WHEN c.status = 'completed' THEN c.hours ELSE 0 END), 2) as completed_hours,
        COUNT(CASE WHEN c.status = 'completed' AND c.duration = 25 THEN 1 END) as duration_25_count,
        COUNT(CASE WHEN c.status = 'completed' AND c.duration = 50 THEN 1 END) as duration_50_count,
        COUNT(CASE WHEN c.status = 'completed' AND c.duration = 60 THEN 1 END) as duration_60_count,
        COUNT(CASE WHEN c.status = 'completed' AND (c.duration NOT IN (25, 50, 60) OR c.duration IS NULL) THEN 1 END) as duration_other_count,
        COUNT(CASE WHEN c.is_trial = 1 THEN 1 END) as trial_classes,
        COUNT(CASE WHEN c.status = 'completed' AND (
          c.fb_score_phonics IS NOT NULL OR c.fb_score_vocab IS NOT NULL OR 
          c.fb_score_speaking IS NOT NULL OR c.fb_score_listening IS NOT NULL OR 
          c.fb_score_engagement IS NOT NULL
        ) THEN 1 END) as scored_classes_count,
        AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_phonics END) as avg_phonics,
        AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_vocab END) as avg_vocab,
        AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_speaking END) as avg_speaking,
        AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_listening END) as avg_listening,
        AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_engagement END) as avg_engagement,
        COUNT(CASE WHEN c.status = 'completed' AND (
          (c.fb_teacher_message IS NOT NULL AND TRIM(c.fb_teacher_message) != '') OR 
          (c.fb_vocab IS NOT NULL AND TRIM(c.fb_vocab) != '')
        ) THEN 1 END) as feedback_submitted_count
      FROM classes c
      LEFT JOIN teachers t ON t.id = c.teacher_id
      WHERE c.date >= ? AND c.date <= ?
        ${orgFilter}
      GROUP BY c.teacher_id
    `;

    const rawRows = (await DB.prepare(workloadQuery).bind(...workloadParams).all()).results || [];

    const teacherList = rawRows.map(row => {
      const isUnassigned = row.teacher_id === null || row.teacher_id === undefined;
      const teacherName = isUnassigned 
        ? '未指定' 
        : (row.registered_teacher_name || row.class_teacher_name || `教师 #${row.teacher_id}`);

      const completedClasses = Number(row.completed_classes || 0);
      const completedHours = Math.round(Number(row.completed_hours || 0) * 100) / 100;
      const trialClasses = Number(row.trial_classes || 0);
      const scoredCount = Number(row.scored_classes_count || 0);

      // 计算综合评分 (五维均值的再均值)
      const validScores = [
        row.avg_phonics,
        row.avg_vocab,
        row.avg_speaking,
        row.avg_listening,
        row.avg_engagement
      ].filter(v => v !== null && v !== undefined).map(Number);

      const overallAvgScore = validScores.length > 0 
        ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100 
        : null;

      // 反馈填报率
      const feedbackSubmitted = Number(row.feedback_submitted_count || 0);
      const feedbackRate = completedClasses > 0 
        ? Math.round((feedbackSubmitted / completedClasses) * 10000) / 10000 
        : 0;

      return {
        teacher_id: isUnassigned ? null : row.teacher_id,
        teacher_name: teacherName,
        completed_classes: completedClasses,
        completed_hours: completedHours,
        duration_breakdown: {
          min_25: Number(row.duration_25_count || 0),
          min_50: Number(row.duration_50_count || 0),
          min_60: Number(row.duration_60_count || 0),
          other: Number(row.duration_other_count || 0)
        },
        trial_classes: trialClasses,
        feedback: {
          submitted_count: feedbackSubmitted,
          completed_classes: completedClasses,
          feedback_rate: feedbackRate
        },
        score: {
          overall_avg_score: overallAvgScore,
          scored_classes_count: scoredCount,
          dim_averages: {
            phonics: row.avg_phonics !== null ? Math.round(Number(row.avg_phonics) * 100) / 100 : null,
            vocab: row.avg_vocab !== null ? Math.round(Number(row.avg_vocab) * 100) / 100 : null,
            speaking: row.avg_speaking !== null ? Math.round(Number(row.avg_speaking) * 100) / 100 : null,
            listening: row.avg_listening !== null ? Math.round(Number(row.avg_listening) * 100) / 100 : null,
            engagement: row.avg_engagement !== null ? Math.round(Number(row.avg_engagement) * 100) / 100 : null
          }
        }
      };
    });

    // 排序
    teacherList.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'classes_count') {
        valA = a.completed_classes;
        valB = b.completed_classes;
      } else if (sortBy === 'score') {
        valA = a.score.overall_avg_score;
        valB = b.score.overall_avg_score;
        // 评分 null 永远置于最后
        if (valA === null && valB === null) return 0;
        if (valA === null) return 1;
        if (valB === null) return -1;
      } else {
        // default hours
        valA = a.completed_hours;
        valB = b.completed_hours;
      }

      if (sortOrder === 'asc') {
        return valA > valB ? 1 : (valA < valB ? -1 : 0);
      } else {
        return valA < valB ? 1 : (valA > valB ? -1 : 0);
      }
    });

    // 分页
    const totalRecords = teacherList.length;
    const totalPages = Math.ceil(totalRecords / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedList = teacherList.slice(offset, offset + pageSize);

    return c.json(success({
      list: paginatedList,
      pagination: {
        page,
        page_size: pageSize,
        total: totalRecords,
        pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      sort: {
        sort_by: sortBy,
        order: sortOrder
      }
    }, {
      from_date: fromDate,
      to_date: toDate,
      organization_id: effectiveOrgId
    }));

  } catch (err) {
    console.error('reports/teaching/workload 错误:', err);
    return c.json(error('INTERNAL_ERROR', '获取教师负荷数据失败: ' + err.message), 500);
  }
});

// ============================================================================
// 阶段 D：全站报表概览与 CSV 导出
// ============================================================================

/**
 * GET /api/v1/reports/overview
 * 全站报表概览：
 * 参数：from_date, to_date, org_id (默认本月)
 * 一次性返回三组核心指标：
 * 1. 现金流组 (cash_flow): 期间收款总额、gift笔数与课时、课时调整正负与负向估算金额、教师结算(PHP与CNY)
 * 2. 损益组 (profit_and_loss): 消课收入估算、消课课时、unpriced_hours、教师成本CNY、全站毛利 (org_admin 不下发)
 * 3. 运营组 (operations): 活跃学员数、总剩余课时、流失预警人数(紧迫/关注分开)、完课率、反馈填报率、试听人数
 *
 * 权限控制：
 * - super_admin: 全部 (org_id 可指定)
 * - org_admin: 强制锁定本机构，损益组与教师结算金额字段后端直接不下发
 * - teacher / parent: 403 Forbidden
 */
reports.get('/overview', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  const DB = c.env.DB;
  const { effectiveOrgId, userRole } = perm;
  const { fromDate, toDate } = resolveDateRange(c);
  const targetMonth = toDate.slice(0, 7);

  try {
    const studentPriceMap = await getStudentBlendedPriceMap(DB);

    // 1. 现金流组
    const recharge = await getRechargeSummary(DB, fromDate, toDate, effectiveOrgId);
    const hourAdjustments = await getHourAdjustmentsSummary(DB, fromDate, toDate, effectiveOrgId, studentPriceMap);

    const cashFlow = {
      cash_income: recharge.cash_income,
      cash_count: recharge.cash_count,
      gift: recharge.gift,
      hour_adjustments: hourAdjustments
    };

    let pnl = null;

    if (userRole === 'super_admin') {
      const teacherCost = await getTeacherCostSummary(DB, fromDate, toDate, targetMonth);
      cashFlow.teacher_payments = {
        paid_php: teacherCost.paid_php,
        pending_php: teacherCost.pending_php,
        total_php: teacherCost.amount_php,
        paid_cny: teacherCost.paid_cny,
        pending_cny: teacherCost.pending_cny,
        total_cny: teacherCost.amount_cny,
        rate: teacherCost.rate,
        rate_month: teacherCost.rate_month,
        rate_is_fallback: teacherCost.rate_is_fallback,
        fx_missing: teacherCost.fx_missing
      };

      // 2. 损益组
      const consumptionRevenue = await getConsumptionRevenueSummary(DB, fromDate, toDate, studentPriceMap);
      const orgSettlements = await getOrgSettlementsInPeriod(DB, fromDate, toDate, effectiveOrgId);

      let overallGrossProfit = null;
      if (!teacherCost.fx_missing && teacherCost.amount_cny !== null) {
        overallGrossProfit = Math.round((consumptionRevenue.amount + orgSettlements.amount_due_cny - teacherCost.amount_cny) * 100) / 100;
      }

      pnl = {
        consumption_revenue: consumptionRevenue.amount,
        consumption_hours: consumptionRevenue.total_hours,
        unpriced_hours: consumptionRevenue.unpriced_hours,
        teacher_cost_cny: teacherCost.amount_cny,
        overall_gross_profit_cny: overallGrossProfit,
        rate: teacherCost.rate,
        rate_month: teacherCost.rate_month,
        rate_is_fallback: teacherCost.rate_is_fallback,
        fx_missing: teacherCost.fx_missing,
        estimated: true
      };
    }

    // 3. 运营组
    const operations = await getOperationsSummary(DB, fromDate, toDate, effectiveOrgId);

    const responseData = {
      cash_flow: cashFlow,
      operations: operations
    };

    if (pnl !== null) {
      responseData.profit_and_loss = pnl;
    }

    return c.json(success(responseData, {
      from_date: fromDate,
      to_date: toDate,
      organization_id: effectiveOrgId,
      user_role: userRole
    }));
  } catch (err) {
    console.error('reports/overview 错误:', err);
    return c.json(error('INTERNAL_ERROR', '获取报表概览失败: ' + err.message), 500);
  }
});

/**
 * GET /api/v1/reports/export
 * 报表 CSV 导出：
 * 参数：type (learning | financial | teaching，必填，非法值 400), from_date, to_date, org_id
 * 响应为 text/csv; charset=utf-8，带 UTF-8 BOM，不走 success 信封
 *
 * 权限控制：
 * - super_admin: 全部 (org_id 可指定)
 * - org_admin: 强制锁定本机构；financial 导出不得包含教师成本与毛利行
 * - teacher / parent: 403 Forbidden
 */
reports.get('/export', async (c) => {
  const perm = checkPermission(c);
  if (perm.forbidden) {
    return c.json(perm.error, 403);
  }

  const type = c.req.query('type');
  if (!type || !['learning', 'financial', 'teaching'].includes(type)) {
    return c.json(error('VALIDATION_ERROR', '无效的导出类型，必须为 learning, financial, teaching 之一'), 400);
  }

  const DB = c.env.DB;
  const { effectiveOrgId, userRole } = perm;
  const { fromDate, toDate } = resolveDateRange(c);
  const targetMonth = toDate.slice(0, 7);

  try {
    let csvContent = '';

    if (type === 'learning') {
      // 导出流失预警名单全量
      // 列：学员,剩余课时,未上课天数,最后上课日期,剩余价值估算,预警等级
      const orgClause = effectiveOrgId ? 'AND s.organization_id = ?' : '';
      const params = effectiveOrgId ? [effectiveOrgId] : [];

      const query = `
        WITH student_stats AS (
          SELECT 
            s.id,
            s.name,
            s.english_name,
            s.phone,
            s.total_hours,
            s.used_hours,
            (s.total_hours - s.used_hours) as remaining_hours,
            s.created_at,
            MAX(c.date) as last_class_date,
            COALESCE((
              SELECT SUM(p.amount)
              FROM payments p
              WHERE p.student_id = s.id AND (p.payment_method != 'gift' OR p.payment_method IS NULL)
            ), 0) as paid_amount
          FROM students s
          LEFT JOIN classes c ON c.student_id = s.id AND c.status = 'completed'
          WHERE s.status = 'active'
            AND (s.total_hours - s.used_hours) > 0
            ${orgClause}
          GROUP BY s.id
        )
        SELECT 
          id,
          name,
          english_name,
          total_hours,
          remaining_hours,
          paid_amount,
          last_class_date,
          CASE 
            WHEN last_class_date IS NOT NULL THEN CAST(julianday(date('now')) - julianday(last_class_date) AS INTEGER)
            ELSE CAST(julianday(date('now')) - julianday(date(created_at)) AS INTEGER)
          END as inactive_days
        FROM student_stats
        WHERE ((last_class_date IS NOT NULL AND julianday(date('now')) - julianday(last_class_date) >= 14)
           OR (last_class_date IS NULL AND julianday(date('now')) - julianday(date(created_at)) >= 14))
        ORDER BY inactive_days DESC, remaining_hours ASC
      `;
      const res = await DB.prepare(query).bind(...params).all();
      const rows = res.results || [];

      const headers = ['学员', '剩余课时', '未上课天数', '最后上课日期', '剩余价值估算', '预警等级'];
      const lines = [headers.map(toCsvCell).join(',')];

      for (const r of rows) {
        const studentDisplayName = r.english_name ? `${r.name} (${r.english_name})` : r.name;
        const totalHours = Number(r.total_hours || 0);
        const remHours = Number(r.remaining_hours || 0);
        const paidAmount = Number(r.paid_amount || 0);

        let remVal = 0;
        if (totalHours > 0 && paidAmount > 0) {
          const bp = Math.round((paidAmount / totalHours) * 100) / 100;
          remVal = Math.round((remHours * bp) * 100) / 100;
        }

        const inactiveDays = Number(r.inactive_days || 0);
        const riskLevel = inactiveDays >= 30 ? '高危预警 (≥30天未排课)' : '流失预警 (14-29天未排课)';

        lines.push([
          toCsvCell(studentDisplayName),
          toCsvCell(remHours),
          toCsvCell(inactiveDays),
          toCsvCell(r.last_class_date || ''),
          toCsvCell(remVal.toFixed(2)),
          toCsvCell(riskLevel)
        ].join(','));
      }

      csvContent = lines.join('\r\n');

    } else if (type === 'financial') {
      // 导出财务汇总明细行
      // 列：项目,金额(CNY),金额(PHP原额),汇率,汇率月份,备注
      const studentPriceMap = await getStudentBlendedPriceMap(DB);
      const recharge = await getRechargeSummary(DB, fromDate, toDate, effectiveOrgId);
      const hourAdjustments = await getHourAdjustmentsSummary(DB, fromDate, toDate, effectiveOrgId, studentPriceMap);
      const orgSettlements = await getOrgSettlementsInPeriod(DB, fromDate, toDate, effectiveOrgId);

      const headers = ['项目', '金额(CNY)', '金额(PHP原额)', '汇率', '汇率月份', '备注'];
      const lines = [headers.map(toCsvCell).join(',')];

      // 1. 收款项
      lines.push([
        toCsvCell('收款总额 (非gift)'),
        toCsvCell(recharge.cash_income.toFixed(2)),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(`现金收款笔数: ${recharge.cash_count}`)
      ].join(','));

      lines.push([
        toCsvCell('赠送课时 (gift)'),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(`赠送笔数: ${recharge.gift.count}, 赠送课时: ${recharge.gift.hours} (不计现金)`)
      ].join(','));

      for (const m of recharge.by_method) {
        lines.push([
          toCsvCell(`收款明细 - ${m.method}`),
          toCsvCell(m.amount.toFixed(2)),
          toCsvCell(''),
          toCsvCell(''),
          toCsvCell(''),
          toCsvCell(`笔数: ${m.count}, 课时: ${m.hours}, 占比: ${m.percentage}%`)
        ].join(','));
      }

      // 2. 消课收入估算 (直营)
      if (userRole === 'super_admin') {
        const consumptionRevenue = await getConsumptionRevenueSummary(DB, fromDate, toDate, studentPriceMap);
        lines.push([
          toCsvCell('直营消课收入估算'),
          toCsvCell(consumptionRevenue.amount.toFixed(2)),
          toCsvCell(''),
          toCsvCell(''),
          toCsvCell(''),
          toCsvCell('估算')
        ].join(','));
      }

      // 3. 机构结算应收
      lines.push([
        toCsvCell('机构结算应收'),
        toCsvCell(orgSettlements.amount_due_cny.toFixed(2)),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(`已结算: ${orgSettlements.paid_amount_cny.toFixed(2)}, 待结算: ${orgSettlements.pending_amount_cny.toFixed(2)}, 单数: ${orgSettlements.count}`)
      ].join(','));

      // 4. 课时调整 (D5)
      lines.push([
        toCsvCell('课时调整 - 正向'),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(`奖励调整课时: +${hourAdjustments.positive_hours}, 笔数: ${hourAdjustments.positive_count}`)
      ].join(','));

      lines.push([
        toCsvCell('课时调整 - 负向退款估算'),
        toCsvCell(hourAdjustments.negative_estimated_amount.toFixed(2)),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell(''),
        toCsvCell('估算')
      ].join(','));

      // 5. 教师成本与毛利行 (仅 super_admin 导出，org_admin 严格不得包含)
      if (userRole === 'super_admin') {
        const teacherCost = await getTeacherCostSummary(DB, fromDate, toDate, targetMonth);
        const consumptionRevenue = await getConsumptionRevenueSummary(DB, fromDate, toDate, studentPriceMap);

        let overallGrossProfit = null;
        if (!teacherCost.fx_missing && teacherCost.amount_cny !== null) {
          overallGrossProfit = Math.round((consumptionRevenue.amount + orgSettlements.amount_due_cny - teacherCost.amount_cny) * 100) / 100;
        }

        const rateStr = teacherCost.fx_missing ? '' : String(teacherCost.rate);
        const rateMonthStr = teacherCost.fx_missing ? '' : String(teacherCost.rate_month);

        // 已付教师成本
        lines.push([
          toCsvCell('教师成本 - 已付'),
          toCsvCell(teacherCost.fx_missing ? '' : teacherCost.paid_cny.toFixed(2)),
          toCsvCell(teacherCost.paid_php.toFixed(2)),
          toCsvCell(rateStr),
          toCsvCell(rateMonthStr),
          toCsvCell(teacherCost.fx_missing ? '汇率未设置' : (teacherCost.rate_is_fallback ? '使用回退汇率' : '已付课酬'))
        ].join(','));

        // 待付教师成本
        lines.push([
          toCsvCell('教师成本 - 待付'),
          toCsvCell(teacherCost.fx_missing ? '' : teacherCost.pending_cny.toFixed(2)),
          toCsvCell(teacherCost.pending_php.toFixed(2)),
          toCsvCell(rateStr),
          toCsvCell(rateMonthStr),
          toCsvCell(teacherCost.fx_missing ? '汇率未设置' : (teacherCost.rate_is_fallback ? '使用回退汇率' : '待付课酬'))
        ].join(','));

        // 教师成本 - 合计
        lines.push([
          toCsvCell('教师成本 - 合计'),
          toCsvCell(teacherCost.fx_missing ? '' : teacherCost.amount_cny.toFixed(2)),
          toCsvCell(teacherCost.amount_php.toFixed(2)),
          toCsvCell(rateStr),
          toCsvCell(rateMonthStr),
          toCsvCell(teacherCost.fx_missing ? '汇率未设置' : (teacherCost.rate_is_fallback ? '使用回退汇率' : `结算单共 ${teacherCost.payments_count} 笔`))
        ].join(','));

        // 全站毛利
        lines.push([
          toCsvCell('全站毛利'),
          toCsvCell((teacherCost.fx_missing || overallGrossProfit === null) ? '' : overallGrossProfit.toFixed(2)),
          toCsvCell(''),
          toCsvCell(rateStr),
          toCsvCell(rateMonthStr),
          toCsvCell(teacherCost.fx_missing ? '汇率未设置' : '估算')
        ].join(','));
      }

      csvContent = lines.join('\r\n');

    } else if (type === 'teaching') {
      // 导出教师负荷全量
      // 列：教师,完成节数,完成课时,25/50/60分钟分档节数,试听节数,平均综合评分,反馈填报率
      const orgFilter = effectiveOrgId ? 'AND c.organization_id = ?' : '';
      const orgParams = effectiveOrgId ? [effectiveOrgId] : [];

      const query = `
        SELECT 
          c.teacher_id,
          t.name as registered_teacher_name,
          c.teacher as class_teacher_name,
          COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_classes,
          ROUND(SUM(CASE WHEN c.status = 'completed' THEN c.hours ELSE 0 END), 2) as completed_hours,
          COUNT(CASE WHEN c.status = 'completed' AND c.duration = 25 THEN 1 END) as duration_25_count,
          COUNT(CASE WHEN c.status = 'completed' AND c.duration = 50 THEN 1 END) as duration_50_count,
          COUNT(CASE WHEN c.status = 'completed' AND c.duration = 60 THEN 1 END) as duration_60_count,
          COUNT(CASE WHEN c.status = 'completed' AND (c.duration NOT IN (25, 50, 60) OR c.duration IS NULL) THEN 1 END) as duration_other_count,
          COUNT(CASE WHEN c.is_trial = 1 THEN 1 END) as trial_classes,
          AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_phonics END) as avg_phonics,
          AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_vocab END) as avg_vocab,
          AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_speaking END) as avg_speaking,
          AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_listening END) as avg_listening,
          AVG(CASE WHEN c.status = 'completed' THEN c.fb_score_engagement END) as avg_engagement,
          COUNT(CASE WHEN c.status = 'completed' AND (
            (c.fb_teacher_message IS NOT NULL AND TRIM(c.fb_teacher_message) != '') OR 
            (c.fb_vocab IS NOT NULL AND TRIM(c.fb_vocab) != '')
          ) THEN 1 END) as feedback_submitted_count
        FROM classes c
        LEFT JOIN teachers t ON t.id = c.teacher_id
        WHERE c.date >= ? AND c.date <= ?
          ${orgFilter}
        GROUP BY c.teacher_id
        ORDER BY completed_hours DESC
      `;
      const res = await DB.prepare(query).bind(fromDate, toDate, ...orgParams).all();
      const rows = res.results || [];

      const headers = ['教师', '完成节数', '完成课时', '25/50/60分钟分档节数', '试听节数', '平均综合评分', '反馈填报率'];
      const lines = [headers.map(toCsvCell).join(',')];

      for (const r of rows) {
        const isUnassigned = r.teacher_id === null || r.teacher_id === undefined;
        const teacherName = isUnassigned 
          ? '未指定' 
          : (r.registered_teacher_name || r.class_teacher_name || `教师 #${r.teacher_id}`);

        const completedClasses = Number(r.completed_classes || 0);
        const completedHours = Number(r.completed_hours || 0);
        const durationBreakdown = `${r.duration_25_count || 0}/${r.duration_50_count || 0}/${r.duration_60_count || 0}`;
        const trialClasses = Number(r.trial_classes || 0);

        const validScores = [
          r.avg_phonics,
          r.avg_vocab,
          r.avg_speaking,
          r.avg_listening,
          r.avg_engagement
        ].filter(v => v !== null && v !== undefined).map(Number);

        const overallAvgScore = validScores.length > 0 
          ? (Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100).toFixed(2)
          : '';

        const feedbackSubmitted = Number(r.feedback_submitted_count || 0);
        const feedbackRate = completedClasses > 0 
          ? `${((feedbackSubmitted / completedClasses) * 100).toFixed(1)}%` 
          : '0.0%';

        lines.push([
          toCsvCell(teacherName),
          toCsvCell(completedClasses),
          toCsvCell(completedHours.toFixed(2)),
          toCsvCell(durationBreakdown),
          toCsvCell(trialClasses),
          toCsvCell(overallAvgScore),
          toCsvCell(feedbackRate)
        ].join(','));
      }

      csvContent = lines.join('\r\n');
    }

    return new Response('﻿' + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reports-${type}-${fromDate}-${toDate}.csv"`
      }
    });

  } catch (err) {
    console.error('reports/export 错误:', err);
    return c.json(error('INTERNAL_ERROR', '导出报表数据失败: ' + err.message), 500);
  }
});


export default reports;
