/**
 * Content 路由 - 小程序合规展示内容动态库 (每日磨耳朵 + 世界文化漫游)
 * GET  /api/v1/content/public  - 小程序公开获取活跃内容列表
 * GET  /api/v1/content         - 后台管理查看内容列表
 * POST /api/v1/content         - 新增内容
 * PUT  /api/v1/content/:id     - 编辑内容
 * DELETE /api/v1/content/:id  - 删除内容
 */
import { Hono } from 'hono';

const content = new Hono();

// 0. 音频流式传输接口：直接从 Cloudflare R2 流式输出 MP3 音频
content.get('/audio/:key', async (c) => {
  try {
    const R2 = c.env.TEXTBOOKS_R2;
    if (!R2) {
      return c.json({ error: { code: 'R2_NOT_BOUND', message: 'R2 bucket not bound' } }, 500);
    }

    let key = decodeURIComponent(c.req.param('key'));
    if (!key.endsWith('.mp3')) {
      key += '.mp3';
    }
    const objectKey = key.startsWith('audio/') ? key : `audio/${key}`;
    const object = await R2.get(objectKey);

    if (!object) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Audio not found' } }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    return new Response(object.body, {
      headers,
      status: 200
    });
  } catch (err) {
    console.error('[content:audio] Error:', err.message);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: '音频流传输失败' } }, 500);
  }
});

// 1. 公开接口：供小程序前端直接拉取最新内容库
content.get('/public', async (c) => {
  try {
    const DB = c.env.DB;

    const items = await DB.prepare(`
      SELECT * FROM mini_program_contents
      WHERE status = 'active'
      ORDER BY sort_order ASC, created_at DESC
    `).all();

    const results = items.results || [];

    const dailySparks = results
      .filter((r) => r.type === 'daily_spark')
      .map((r) => ({
        id: r.id,
        theme: r.theme,
        en: r.content_en,
        zh: r.content_zh,
        tip: r.tip,
        soundDesc: r.sound_desc || '美式纯正原声 · 节奏欢快',
        audioUrl: r.audio_url || `https://api.sunnybridge.qzz.io/api/v1/content/audio/${r.id}.mp3`
      }));

    const cultureBites = results
      .filter((r) => r.type === 'culture_bite')
      .map((r) => {
        let words = [];
        try {
          words = r.metadata ? JSON.parse(r.metadata).words || [] : [];
        } catch (e) {
          words = [];
        }
        return {
          id: r.id,
          icon: r.icon || '🌍',
          tabName: r.theme,
          title: r.title,
          subtitle: r.subtitle,
          fact: r.content_zh,
          words
        };
      });

    return c.json({
      success: true,
      data: {
        daily_sparks: dailySparks,
        culture_bites: cultureBites
      }
    });
  } catch (err) {
    console.error('[content:public] Error:', err.message);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取内容失败' }
    }, 500);
  }
});

// 2. 后台接口：获取所有内容列表
content.get('/', async (c) => {
  try {
    const DB = c.env.DB;
    const type = c.req.query('type');
    let query = 'SELECT * FROM mini_program_contents';
    const params = [];

    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }
    query += ' ORDER BY sort_order ASC, created_at DESC';

    const result = await DB.prepare(query).bind(...params).all();

    return c.json({
      success: true,
      data: result.results || []
    });
  } catch (err) {
    console.error('[content:list] Error:', err.message);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '获取内容失败' }
    }, 500);
  }
});

// 3. 后台接口：新增内容
content.post('/', async (c) => {
  try {
    const DB = c.env.DB;
    const body = await c.req.json();
    const id = body.id || `cnt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await DB.prepare(`
      INSERT INTO mini_program_contents (
        id, type, theme, title, subtitle, content_en, content_zh, tip, audio_url, sound_desc, icon, metadata, status, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.type || 'daily_spark',
      body.theme || '',
      body.title || null,
      body.subtitle || null,
      body.content_en || null,
      body.content_zh || '',
      body.tip || null,
      body.audio_url || null,
      body.sound_desc || null,
      body.icon || null,
      body.metadata ? JSON.stringify(body.metadata) : null,
      body.status || 'active',
      body.sort_order || 0
    ).run();

    return c.json({
      success: true,
      data: { id }
    }, 201);
  } catch (err) {
    console.error('[content:create] Error:', err.message);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '创建内容失败' }
    }, 500);
  }
});

// 4. 后台接口：更新内容
content.put('/:id', async (c) => {
  try {
    const DB = c.env.DB;
    const id = c.req.param('id');
    const body = await c.req.json();

    await DB.prepare(`
      UPDATE mini_program_contents SET
        theme = COALESCE(?, theme),
        title = COALESCE(?, title),
        subtitle = COALESCE(?, subtitle),
        content_en = COALESCE(?, content_en),
        content_zh = COALESCE(?, content_zh),
        tip = COALESCE(?, tip),
        audio_url = COALESCE(?, audio_url),
        sound_desc = COALESCE(?, sound_desc),
        icon = COALESCE(?, icon),
        metadata = COALESCE(?, metadata),
        status = COALESCE(?, status),
        sort_order = COALESCE(?, sort_order),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      body.theme !== undefined ? body.theme : null,
      body.title !== undefined ? body.title : null,
      body.subtitle !== undefined ? body.subtitle : null,
      body.content_en !== undefined ? body.content_en : null,
      body.content_zh !== undefined ? body.content_zh : null,
      body.tip !== undefined ? body.tip : null,
      body.audio_url !== undefined ? body.audio_url : null,
      body.sound_desc !== undefined ? body.sound_desc : null,
      body.icon !== undefined ? body.icon : null,
      body.metadata !== undefined ? JSON.stringify(body.metadata) : null,
      body.status !== undefined ? body.status : null,
      body.sort_order !== undefined ? body.sort_order : null,
      id
    ).run();

    return c.json({ success: true });
  } catch (err) {
    console.error('[content:update] Error:', err.message);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '更新内容失败' }
    }, 500);
  }
});

// 5. 后台接口：删除内容
content.delete('/:id', async (c) => {
  try {
    const DB = c.env.DB;
    const id = c.req.param('id');

    await DB.prepare(`DELETE FROM mini_program_contents WHERE id = ?`).bind(id).run();

    return c.json({ success: true });
  } catch (err) {
    console.error('[content:delete] Error:', err.message);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '删除内容失败' }
    }, 500);
  }
});

export default content;
