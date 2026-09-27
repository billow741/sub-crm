/**
 * Leads 路由 - 潜在客户/预约表单
 * POST /api/v1/leads - 提交表单 → D1 + Cloud Mail / Resend 邮件通知 + (可选) 企微机器人
 * GET  /api/v1/leads - 获取最新线索列表 (用于 CRM 看板)
 */
import { Hono } from 'hono';

const leads = new Hono();

// 1. 获取线索列表（CRM 管理看板使用）
leads.get('/', async (c) => {
  try {
    const DB = c.env.DB;
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const result = await DB.prepare(`
      SELECT * FROM leads
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const countResult = await DB.prepare(`SELECT count(*) as total FROM leads`).first();

    return c.json({
      success: true,
      data: result.results || [],
      pagination: {
        total: countResult?.total || 0,
        limit,
        offset
      }
    });
  } catch (err) {
    console.error('[leads:list] Error:', err.message);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取线索列表失败' }
    }, 500);
  }
});

// 2. 删除单条线索
leads.delete('/:id', async (c) => {
  try {
    const DB = c.env.DB;
    const id = c.req.param('id');
    await DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: '线索已删除' });
  } catch (err) {
    console.error('[leads:delete] Error:', err.message);
    return c.json({ success: false, error: { message: '删除失败' } }, 500);
  }
});

// 3. 清理指定线索（支持按 ID 列表或批量清理测试数据）
leads.post('/clear', async (c) => {
  try {
    const DB = c.env.DB;
    const body = await c.req.json().catch(() => ({}));
    const { ids } = body;
    if (Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await DB.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).bind(...ids).run();
      return c.json({ success: true, message: `已成功删除 ${ids.length} 条线索` });
    }
    // 默认清除标记为测试的数据
    await DB.prepare("DELETE FROM leads WHERE name LIKE '%测试%' OR name LIKE '%Test%' OR source LIKE '%测试%' OR source LIKE '%联调%' OR phone = '13800138000'").run();
    return c.json({ success: true, message: '测试线索已清除' });
  } catch (err) {
    console.error('[leads:clear] Error:', err.message);
    return c.json({ success: false, error: { message: '清除失败' } }, 500);
  }
});

// 2. 提交预约/交流申请表单（公开接口，官网与小程序统一对接）
leads.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      name,
      phone,
      email = '',
      age = '',
      course = '',
      source = '官网',
      message = '',
      wechat = '',
      purpose = '',
      identity = ''
    } = body;

    // 基本验证
    if (!name || !phone) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '姓名和联系电话为必填项' }
      }, 400);
    }

    // 格式化扩展留言信息（保证兼容现有 D1 表结构）
    const details = [];
    if (wechat) details.push(`微信号: ${wechat}`);
    if (identity) details.push(`身份: ${identity}`);
    if (purpose) details.push(`交流目的: ${purpose}`);
    if (message) details.push(`留言备注: ${message}`);
    const combinedMessage = details.join(' | ') || message;

    // 1. 写入 D1 数据库
    const DB = c.env.DB;
    const result = await DB.prepare(`
      INSERT INTO leads (name, phone, email, age, course, source, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(name, phone, email, age, course, source, combinedMessage).run();

    console.log('[leads] DB insert result:', JSON.stringify(result));

    // 2. 发送邮件通知至 Cloud Mail & 管理员
    const resendKey = c.env.RESEND_API_KEY;
    const submitTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    if (resendKey) {
      const emailTitle = `🔔 【新预约申请】${name} - ${phone} (来源: ${source})`;

      const emailText = `
【SunnyBridge 客户预约/交流新申请】

📍 渠道来源：${source}
👤 客户姓名：${name}
📱 联系电话：${phone}
💬 微信账号：${wechat || '未单独填写'}
📧 电子邮箱：${email || '未填写'}
🎂 年龄阶段：${age || '未填写'}
📚 意向方案：${course || '未指定'}
🎯 需求留言：${combinedMessage || '无'}
⏰ 提交时间：${submitTime}

请尽快登录 SunnyBridge CRM 或联系客户跟进！
`.trim();

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f7f9fa; padding: 20px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #FF7A00, #FF9500); padding: 24px; color: #ffffff; text-align: center; }
    .header h2 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0; opacity: 0.9; font-size: 13px; }
    .content { padding: 24px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #FFF4E5; color: #FF7A00; margin-bottom: 16px; }
    .info-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .info-table td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .info-label { width: 90px; color: #64748b; font-weight: 500; }
    .info-val { color: #0f172a; font-weight: 600; }
    .actions { margin-top: 24px; text-align: center; }
    .btn { display: inline-block; padding: 10px 20px; background: #FF7A00; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 0 6px; }
    .footer { background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>SunnyBridge 客户新申请提醒</h2>
      <p>官网 / 微信小程序全渠道线索统一归集</p>
    </div>
    <div class="content">
      <div><span class="badge">渠道来源：${source}</span></div>
      <table class="info-table">
        <tr><td class="info-label">👤 客户姓名</td><td class="info-val">${name}</td></tr>
        <tr><td class="info-label">📱 联系电话</td><td class="info-val"><a href="tel:${phone}" style="color:#FF7A00;text-decoration:none;">${phone}</a></td></tr>
        ${wechat ? `<tr><td class="info-label">💬 微信账号</td><td class="info-val">${wechat}</td></tr>` : ''}
        ${email ? `<tr><td class="info-label">📧 电子邮箱</td><td class="info-val">${email}</td></tr>` : ''}
        ${age ? `<tr><td class="info-label">🎂 年龄阶段</td><td class="info-val">${age}</td></tr>` : ''}
        ${course ? `<tr><td class="info-label">📚 意向方案</td><td class="info-val">${course}</td></tr>` : ''}
        <tr><td class="info-label">📝 详细留言</td><td class="info-val">${combinedMessage || '无'}</td></tr>
        <tr><td class="info-label">⏰ 提交时间</td><td class="info-val">${submitTime}</td></tr>
      </table>
      <div class="actions">
        <a class="btn" href="tel:${phone}">📞 立即拨打电话</a>
      </div>
    </div>
    <div class="footer">
      本邮件由 SunnyBridge CRM 自动分发至 Cloud Mail 企业邮箱系统 · 请及时联系客户
    </div>
  </div>
</body>
</html>
`.trim();

      // 发送至 Cloud Mail (admin@sunnybridge.qzz.io) 和 负责人邮箱
      try {
        const sendMail = async (toAddresses) => {
          return await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'SunnyBridge <onboarding@resend.dev>',
              to: toAddresses,
              subject: emailTitle,
              text: emailText,
              html: emailHtml
            })
          });
        };

        // 优先同时发送给 Cloud Mail 与 管理员邮箱
        let mailRes = await sendMail(['admin@sunnybridge.qzz.io', 'xiwanqin03@gmail.com']);
        let mailJson = await mailRes.json();

        // 若因域名未完全验证导致批量收件被拦截，则优雅降级为发送至 Resend 注册邮箱
        if (!mailRes.ok && mailJson.message?.includes('only send testing emails to your own email address')) {
          console.warn('[leads] Resend restriction detected, fallbacking to primary recipient:', mailJson);
          mailRes = await sendMail(['xiwanqin03@gmail.com']);
          mailJson = await mailRes.json();
        }

        console.log('[leads] Resend response:', JSON.stringify(mailJson));
      } catch (mailErr) {
        console.error('[leads] Resend dispatch failed:', mailErr);
      }
    } else {
      console.warn('[leads] RESEND_API_KEY not configured, skipping email notification');
    }

    // 3. 可选：企微群机器人 Webhook 推送
    if (c.env.WECOM_WEBHOOK_URL) {
      try {
        await fetch(c.env.WECOM_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
              content: `### 🔔 【SunnyBridge 新申请提醒】\n> **来源渠道**：<font color="info">${source}</font>\n> **客户姓名**：${name}\n> **联系电话**：[${phone}](tel:${phone})\n> **微信号**：${wechat || '无'}\n> **意向方案**：${course || '无'}\n> **时间**：${submitTime}`
            }
          })
        });
      } catch (botErr) {
        console.error('[leads] WeCom bot notify failed:', botErr);
      }
    }

    return c.json({
      success: true,
      message: '预约提交成功！专属交流顾问会尽快与您联系。',
      data: { id: result.meta?.last_row_id }
    });

  } catch (err) {
    console.error('[leads] Error:', err.message);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '提交失败，请稍后重试' }
    }, 500);
  }
});

export default leads;