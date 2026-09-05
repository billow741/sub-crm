/**
 * 教材库路由 - textbooks / textbook_units / unit_content
 * /api/v1/textbooks
 *   GET /                  → 教材列表
 *   GET /:code              → 单本教材详情 + 单元列表
 *   GET /units              → 所有单元列表 (可选按 textbook_code 过滤)
 *   GET /units/:code/:num   → 单元详情
 *   GET /suggest            → ⭐ CRM 最常用: 根据 textbook_code + unit_number 推荐内容
 *   GET /content/:code/:num → 单元内容 (vocab/patterns/grammar)
 *   POST /content/:code/:num → 写入/更新单元内容 (Admin, AI提取后)
 *
 *   POST /upload            → 上传 PDF 到 R2 (multipart/form-data)
 *   GET  /pdfs               → 列出 R2 中的 PDF 文件
 *   GET  /pdf/:key           → 从 R2 下载 PDF (返回文件流)
 *   DELETE /pdf/:key         → 删除 R2 中的 PDF
 *   POST /extract            → ⭐ 上传 PDF + 调 LLM 提取 → 返回 JSON (不存库)
 *   POST /extract/:code/:num → ⭐ 上传 PDF + 调 LLM 提取 + 自动写入 unit_content
 */
import { Hono } from 'hono';

const textbooks = new Hono();

/// ============================================================
// ⭐ GET /suggest — 课后反馈词汇推荐 (CRM 最高频调用, 支持跨课时如 12-13 或 12,13)
// Query: textbook_code=EU-L1&unit_number=3 或 unit_number=12-13
// 返回: { vocab: [...], patterns: [...], grammar: [...] }
// ============================================================
textbooks.get('/suggest', async (c) => {
  const DB = c.env.DB;
  const code = c.req.query('textbook_code');
  const unitNumParam = c.req.query('unit_number');

  if (!code || !unitNumParam) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '需要 textbook_code 和 unit_number 参数' } }, 400);
  }

  // 支持单个数字 (13) 或范围/列表 (12-13, 12,13)
  const unitNumbers = [];
  const rangeMatch = String(unitNumParam).match(/^(\d+)\s*[-~至到]\s*(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    for (let u = Math.min(start, end); u <= Math.max(start, end); u++) {
      unitNumbers.push(u);
    }
  } else if (String(unitNumParam).includes(',')) {
    String(unitNumParam).split(',').forEach(s => {
      const n = parseInt(s.trim());
      if (!isNaN(n)) unitNumbers.push(n);
    });
  } else {
    const single = parseInt(unitNumParam);
    if (!isNaN(single)) unitNumbers.push(single);
  }

  if (unitNumbers.length === 0) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '无效的 unit_number' } }, 400);
  }

  // 查询所有涉及 unit 的 content
  const placeholders = unitNumbers.map(() => '?').join(',');
  const contents = await DB.prepare(`
    SELECT uc.unit_number, uc.vocab, uc.patterns, uc.grammar, u.unit_title, b.content_schema
    FROM unit_content uc
    LEFT JOIN textbook_units u ON u.textbook_code = uc.textbook_code AND u.unit_number = uc.unit_number
    LEFT JOIN textbooks b ON b.code = uc.textbook_code
    WHERE uc.textbook_code = ? AND uc.unit_number IN (${placeholders})
    ORDER BY uc.unit_number ASC
  `).bind(code, ...unitNumbers).all();

  let structType = 'unit';
  const firstRow = contents.results?.[0];
  if (firstRow?.content_schema) {
    try {
      const cs = JSON.parse(firstRow.content_schema);
      if (cs.structure_type) structType = cs.structure_type;
    } catch (_) {}
  } else if (code.startsWith('WE-') || code.includes('WE')) {
    structType = 'lesson';
  }
  const prefix = structType === 'lesson' ? 'Lesson ' : (structType === 'chapter' ? 'Chapter ' : (structType === 'story' ? 'Story ' : 'Unit '));

  let allVocab = [];
  let allPatterns = [];
  let allGrammar = [];
  const titleParts = [];

  (contents.results || []).forEach(row => {
    if (row.unit_title) {
      const uTitle = row.unit_title.startsWith('Unit') || row.unit_title.startsWith('Lesson')
        ? row.unit_title
        : prefix + row.unit_number + ' (' + row.unit_title + ')';
      titleParts.push(uTitle);
    }
    try {
      const vList = JSON.parse(row.vocab || '[]');
      vList.forEach(v => {
        if (!allVocab.some(x => x.word.toLowerCase() === v.word.toLowerCase())) {
          allVocab.push({
            ...v,
            from_unit: row.unit_number
          });
        }
      });
    } catch {}

    try {
      const pList = JSON.parse(row.patterns || '[]');
      pList.forEach(p => {
        const pStr = typeof p === 'string' ? p : p.pattern;
        if (!allPatterns.some(x => (typeof x === 'string' ? x : x.pattern).toLowerCase() === pStr.toLowerCase())) {
          allPatterns.push(p);
        }
      });
    } catch {}

    try {
      const gList = JSON.parse(row.grammar || '[]');
      gList.forEach(g => {
        if (!allGrammar.some(x => x.point?.toLowerCase() === g.point?.toLowerCase())) {
          allGrammar.push(g);
        }
      });
    } catch {}
  });

  const pageFromParam = c.req.query('page_from');
  const pageToParam = c.req.query('page_to');
  const pageFrom = pageFromParam ? parseInt(pageFromParam, 10) : null;
  const pageTo = pageToParam ? parseInt(pageToParam, 10) : null;

  // 如果指定了页码范围，且数据中带有 page 属性，优先按页码精准过滤
  if (pageFrom !== null || pageTo !== null) {
    const minP = pageFrom !== null ? pageFrom : -Infinity;
    const maxP = pageTo !== null ? pageTo : Infinity;

    const hasVocabPages = allVocab.some(v => v.page !== undefined && v.page !== null);
    if (hasVocabPages) {
      allVocab = allVocab.filter(v => {
        if (v.page !== undefined && v.page !== null) {
          return v.page >= minP && v.page <= maxP;
        }
        return false;
      });
    }

    const hasPatternPages = allPatterns.some(p => p.page !== undefined && p.page !== null);
    if (hasPatternPages) {
      allPatterns = allPatterns.filter(p => {
        if (p.page !== undefined && p.page !== null) {
          return p.page >= minP && p.page <= maxP;
        }
        return false;
      });
    }
  }

  const sortByCore = (a, b) => {
    if (a.page !== undefined && b.page !== undefined && a.page !== b.page) {
      return a.page - b.page;
    }
    if (a.is_core && !b.is_core) return -1;
    if (!a.is_core && b.is_core) return 1;
    return (a.difficulty || 99) - (b.difficulty || 99);
  };
  allVocab.sort(sortByCore);

  return c.json({
    data: {
      textbook_code: code,
      unit_number: unitNumbers.length === 1 ? unitNumbers[0] : unitNumbers.join('-'),
      unit_title: titleParts.join(' & ') || null,
      page_from: pageFrom,
      page_to: pageTo,
      vocab: allVocab,
      patterns: allPatterns,
      grammar: allGrammar,
      has_content: allVocab.length > 0 || allPatterns.length > 0
    }
  });
});

// ============================================================
// GET / — 教材列表
// ============================================================
textbooks.get('/', async (c) => {
  const DB = c.env.DB;
  const results = await DB.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM textbook_units WHERE textbook_id = t.id) as unit_count
    FROM textbooks t
    WHERE t.is_active = 1
    ORDER BY t.id ASC
  `).all();

  const data = results.results?.map(t => ({
    id: t.id,
    code: t.code,
    name: t.name,
    series: t.series,
    publisher: t.publisher,
    level: t.level,
    total_units: t.total_units,
    unit_count: t.unit_count,
    description: t.description,
    content_schema: t.content_schema ? safeParseJson(t.content_schema) : null
  })) || [];

  return c.json({ data });
});

// ⚠️ 静态路径路由必须在 /:code 之前,否则会被 /:code 捕获
// (R2 upload / pdfs / pdf / extract 等已在 /:code 之前声明)

// ============================================================
// GET /book/:code — 单本教材详情 + 单元列表
// 用 /book/:code 路径,避免和 /pdfs /upload 等静态路径冲突
// ============================================================
textbooks.get('/book/:code', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');

  const book = await DB.prepare('SELECT * FROM textbooks WHERE code = ?').bind(code).first();
  if (!book) {
    return c.json({ error: { code: 'NOT_FOUND', message: '教材不存在' } }, 404);
  }

  const units = await DB.prepare(`
    SELECT u.*,
      CASE WHEN uc.id IS NOT NULL THEN 1 ELSE 0 END as has_content
    FROM textbook_units u
    LEFT JOIN unit_content uc ON uc.unit_id = u.id
    WHERE u.textbook_code = ? AND u.is_active = 1
    ORDER BY u.unit_number ASC
  `).bind(code).all();

  return c.json({
    data: {
      ...book,
      content_schema: book.content_schema ? safeParseJson(book.content_schema) : null,
      units: units.results?.map(u => ({
        id: u.id,
        unit_number: u.unit_number,
        unit_title: u.unit_title,
        lesson_count: u.lesson_count,
        has_content: u.has_content === 1
      })) || []
    }
  });
});

// ============================================================
// GET /content/:code/:num — 单元完整内容
// ============================================================
textbooks.get('/content/:code/:num', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));

  const content = await DB.prepare(`
    SELECT uc.*, u.unit_title
    FROM unit_content uc
    JOIN textbook_units u ON u.id = uc.unit_id
    WHERE uc.textbook_code = ? AND uc.unit_number = ?
  `).bind(code, num).first();

  if (!content) {
    return c.json({ error: { code: 'NOT_FOUND', message: '该单元内容尚未录入' } }, 404);
  }

  return c.json({
    data: {
      ...content,
      vocab: safeParse(content.vocab),
      patterns: safeParse(content.patterns),
      grammar: safeParse(content.grammar),
      extra_content: safeParseJson(content.extra_content, {})
    }
  });
});

// ============================================================
// POST /content/:code/:num — 写入/更新单元内容 (Admin, AI提取后)
// Body: { vocab: [...], patterns: [...], grammar: [...], extra_content: {...}, extracted_by: 'claude' }
// ============================================================
textbooks.post('/content/:code/:num', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));

  // 查 unit_id
  const unit = await DB.prepare(`
    SELECT id FROM textbook_units WHERE textbook_code = ? AND unit_number = ?
  `).bind(code, num).first();
  if (!unit) {
    return c.json({ error: { code: 'NOT_FOUND', message: '单元不存在' } }, 404);
  }

  const body = await c.req.json();
  
  // 保留用户手动编辑或校对的完整词汇列表，仅过滤完全空白的行并保留用户属性
  const rawVocab = Array.isArray(body.vocab) ? body.vocab : [];
  const processedVocab = [];
  const seenWords = new Set();

  for (const item of rawVocab) {
    const rawWord = (typeof item === 'string' ? item : (item?.word || item?.name || '')).trim();
    const rawTrans = (typeof item === 'object' ? (item?.translation || item?.chinese || item?.meaning || '') : '').trim();
    if (!rawWord) continue;

    const lower = rawWord.toLowerCase();
    if (seenWords.has(lower)) continue;
    seenWords.add(lower);

    const vObj = {
      word: rawWord,
      translation: rawTrans,
      is_core: typeof item === 'object' && item.is_core !== undefined ? Boolean(item.is_core) : true,
      difficulty: typeof item === 'object' && item.difficulty ? item.difficulty : 1
    };
    if (typeof item === 'object' && item.page !== undefined && item.page !== null && item.page !== '') {
      vObj.page = parseInt(item.page, 10);
    }
    processedVocab.push(vObj);
  }

  const rawPatterns = Array.isArray(body.patterns) ? body.patterns : [];
  const processedPatterns = [];
  const seenPatterns = new Set();
  for (const item of rawPatterns) {
    const rawPattern = (typeof item === 'string' ? item : (item?.pattern || item?.sentence || '')).trim();
    const rawTrans = (typeof item === 'object' ? (item?.translation || item?.chinese || '') : '').trim();
    if (!rawPattern) continue;

    const lower = rawPattern.toLowerCase();
    if (seenPatterns.has(lower)) continue;
    seenPatterns.add(lower);

    const pObj = {
      pattern: rawPattern,
      translation: rawTrans,
      is_core: typeof item === 'object' && item.is_core !== undefined ? Boolean(item.is_core) : true
    };
    if (typeof item === 'object' && item.page !== undefined && item.page !== null && item.page !== '') {
      pObj.page = parseInt(item.page, 10);
    }
    processedPatterns.push(pObj);
  }

  const rawGrammar = Array.isArray(body.grammar) ? body.grammar : [];
  const processedGrammar = [];
  for (const item of rawGrammar) {
    const rawPoint = (typeof item === 'string' ? item : (item?.point || item?.grammar || '')).trim();
    if (!rawPoint) continue;

    const gObj = {
      point: rawPoint,
      example: (typeof item === 'object' ? (item?.example || '') : '').trim(),
      explanation: (typeof item === 'object' ? (item?.explanation || '') : '').trim(),
      is_core: typeof item === 'object' && item.is_core !== undefined ? Boolean(item.is_core) : true
    };
    if (typeof item === 'object' && item.page !== undefined && item.page !== null && item.page !== '') {
      gObj.page = parseInt(item.page, 10);
    }
    processedGrammar.push(gObj);
  }

  const vocab = JSON.stringify(processedVocab);
  const patterns = JSON.stringify(processedPatterns);
  const grammar = JSON.stringify(processedGrammar);
  const extraContent = body.extra_content ? JSON.stringify(body.extra_content) : null;
  const extractedBy = body.extracted_by || 'manual';

  // UPSERT (INSERT OR REPLACE)
  const existing = await DB.prepare(`
    SELECT id FROM unit_content WHERE unit_id = ?
  `).bind(unit.id).first();

  if (existing) {
    await DB.prepare(`
      UPDATE unit_content
      SET vocab = ?, patterns = ?, grammar = ?, extra_content = COALESCE(?, extra_content), extracted_by = ?, extracted_at = datetime('now'), updated_at = datetime('now')
      WHERE unit_id = ?
    `).bind(vocab, patterns, grammar, extraContent, extractedBy, unit.id).run();
  } else {
    await DB.prepare(`
      INSERT INTO unit_content (unit_id, textbook_code, unit_number, vocab, patterns, grammar, extra_content, extracted_by, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(unit.id, code, num, vocab, patterns, grammar, extraContent, extractedBy).run();
  }

  return c.json({ data: { textbook_code: code, unit_number: num, saved: true } });
});

// ============================================================
// Helper
// ============================================================
function safeParse(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

function safeParseJson(str, fallback = null) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ============================================================
// 通用教材识别体系：Schema 预置配置 & 动态 Prompt 生成器
// ============================================================
const DEFAULT_CONTENT_SCHEMAS = {
  general_english: {
    type: 'general_english',
    label: '综合英语课本 (如 Everybody Up, Oxford Discover, Wonders)',
    dimensions: ['vocab', 'patterns', 'grammar'],
    target_age: '5-12',
    blacklist: [
      'Listen.*point.*say', 'Listen and point', 'Listen and say', 'Listen and number',
      'Listen and sing', 'Look and listen', 'Ask and answer', 'Point and say'
    ]
  },
  phonics: {
    type: 'phonics',
    label: '自然拼读 (如 WhaleEnglish Phonics, Oxford Phonics World)',
    dimensions: ['letters', 'sounds', 'blending_words', 'sight_words', 'vocab', 'patterns'],
    target_age: '4-8',
    blacklist: [
      'Trace and write', 'Color and match', 'Circle the letter', 'Listen.*point.*say',
      'Listen and chant', 'Stick and say', 'Connect and say'
    ]
  },
  graded_reader: {
    type: 'graded_reader',
    label: '分级阅读 / 绘本故事 (如 RAZ, Oxford Reading Tree)',
    dimensions: ['key_words', 'key_phrases', 'comprehension_questions', 'story_summary', 'vocab', 'patterns'],
    target_age: '6-14',
    blacklist: [
      'Read and check', 'Turn the page', 'Look at the picture'
    ]
  },
  grammar: {
    type: 'grammar',
    label: '专项语法课本 (如 English Grammar in Use)',
    dimensions: ['grammar_rules', 'examples', 'vocab', 'practice_sentences'],
    target_age: '8-16',
    blacklist: [
      'Fill in the blanks', 'Exercise A', 'Exercise B', 'Choose the correct answer'
    ]
  }
};

function buildExtractionPrompt(schema = null) {
  const type = schema?.type || 'general_english';
  const preset = DEFAULT_CONTENT_SCHEMAS[type] || DEFAULT_CONTENT_SCHEMAS.general_english;
  const targetAge = schema?.target_age || preset.target_age || '5-12';
  const customBlacklist = schema?.instruction_blacklist || schema?.blacklist || preset.blacklist || [];
  const blacklistFormatted = customBlacklist.length > 0
    ? customBlacklist.map(b => `❌ "${b}"`).join('\n     ')
    : '❌ "Listen, point and say" 等各类课堂操作指令';

  if (type === 'phonics') {
    return `你是一位顶级的少儿英语自然拼读 (Phonics) 与语音教学专家（针对 ${targetAge} 岁儿童）。
请仔细阅读并识别当前教材切图，提取本课/本单元实际印刷的自然拼读教学核心要素，并精确记录所在课本印刷页码。

【严格原则】：
1. 只能提取当前图片中实际印有的字母、音素、拼读生词和短句，严禁编造！
2. 每一个提取项必须给出地道准确的【简体中文】翻译。
3. 每一个提取项必须包含所在课本页码 "page" 属性（数字整数，如 12）。
4. 必须严格返回如下 JSON 结构（严禁包含任何多余说明或 markdown 标记）：
{
  "unit_title": "图片顶端印刷的课程标题 (例如 Lesson 1 Short a)",
  "letters": [
    { "letter": "Aa", "sound": "/æ/", "uppercase": "A", "lowercase": "a", "page": 1 }
  ],
  "sounds": [
    { "sound": "/æ/", "phonics_rule": "Short a vowel sound", "example_words": ["apple", "ant", "cat"], "page": 1 }
  ],
  "blending_words": [
    { "word": "cat", "translation": "猫", "phonemes": ["c", "a", "t"], "is_core": true, "page": 1 }
  ],
  "sight_words": [
    { "word": "the", "translation": "这/那", "page": 1 }
  ],
  "vocab": [
    { "word": "cat", "translation": "猫", "is_core": true, "difficulty": 1, "page": 1 },
    { "word": "apple", "translation": "苹果", "is_core": true, "difficulty": 1, "page": 1 }
  ],
  "patterns": [
    { "pattern": "An apple for the cat.", "translation": "给猫咪的一个苹果。", "is_core": true, "page": 1 }
  ],
  "grammar": [
    { "point": "字母组合与拼读规律", "example": "c-a-t -> cat", "is_core": true, "page": 1 }
  ]
}

【少儿自然拼读识别禁令】：
- 🚫 严禁提取课堂操作指令：
     ${blacklistFormatted}
- 🎯 所有 translation 字段必须翻译为准确地道的简体中文。`;
  }

  if (type === 'graded_reader') {
    return `你是一位专业的分级阅读 (Graded Reader) 与少儿英文绘本分析专家（针对 ${targetAge} 岁读者）。
请仔细阅读当前绘本页面切图，提取故事核心词汇、关键表达与理解要点，并精确记录所在课本页码。

【严格原则】：
1. 提取当前页面印刷的故事核心内容与词句。
2. 每一个提取项必须包含所在课本页码 "page" 属性（数字整数，如 12）。
3. 严格返回如下 JSON 结构（严禁 markdown 标记或任何闲聊）：
{
  "unit_title": "故事或章节标题",
  "key_words": [
    { "word": "重点生词", "translation": "中文释义", "context": "故事中的具体用法", "is_core": true, "page": 1 }
  ],
  "key_phrases": [
    { "phrase": "关键短语/地道搭配", "translation": "中文释义", "is_core": true, "page": 1 }
  ],
  "comprehension_questions": [
    { "question": "基于故事的理解提问 (英文)", "answer": "参考答案 (英文)", "translation": "中文提问", "page": 1 }
  ],
  "story_summary": "本章/本篇故事的 1-2 句核心概要 (中文)",
  "vocab": [
    { "word": "故事核心生词", "translation": "中文", "is_core": true, "difficulty": 1, "page": 1 }
  ],
  "patterns": [
    { "pattern": "故事中重复出现的重点句型", "translation": "中文", "is_core": true, "page": 1 }
  ],
  "grammar": []
}

【禁令】：
- 🚫 严禁提取翻页或操作指令：
     ${blacklistFormatted}`;
  }

  if (type === 'grammar') {
    return `你是一位资深英语语法教学专家（针对 ${targetAge} 岁学生）。
请仔细阅读当前教材页面切图，提取语法要点、规则公式与典型例句，并精确记录所在课本页码。

返回严格 JSON 格式：
{
  "unit_title": "语法主题 (如 Present Continuous Tense)",
  "grammar_rules": [
    { "rule": "语法规则名称", "formula": "结构公式 (如 be + V-ing)", "explanation": "中文语法解析", "is_core": true, "page": 1 }
  ],
  "examples": [
    { "sentence": "典型英文例句", "translation": "中文翻译", "is_core": true, "page": 1 }
  ],
  "practice_sentences": [
    { "sentence": "教材中的代表性练习句", "answer": "正确答案/考点解析", "page": 1 }
  ],
  "vocab": [
    { "word": "核心语法标记词或生词", "translation": "中文", "is_core": true, "difficulty": 1, "page": 1 }
  ],
  "patterns": [
    { "pattern": "核心句型模版", "translation": "中文翻译", "is_core": true, "page": 1 }
  ],
  "grammar": [
    { "point": "核心语法点", "example": "英文例句", "is_core": true, "page": 1 }
  ]
}`;
  }

  // 默认：综合英语 (General English)
  return `你是一位顶级的少儿英语教研专家（目标年龄段：${targetAge} 岁）。请仔细阅读并识别当前提供的课本页面图片，严格按照当前图片中实际印刷的内容提取本页的核心词汇、重点句型与语法点，并精确关联到课本印刷页码。

【重要原则】：
1. 只能提取当前图片中实际印有的单词、句子和语法！绝对严禁编造或从其他单元复制！
2. 每一个提取项必须给出准确地道的简体中文翻译。
3. 每一个提取项必须包含所在课本页码 "page" 属性（数字整数，如 12、13）。若图片角落印有真实页码请精确识别填入；若无则按照上下文或提示页码填写。
4. 必须严格返回如下 JSON 结构（严禁包含任何多余说明或 markdown 标记）：
{
  "unit_title": "图片顶端印刷的单元标题 (例如 Unit 2 Let's Play)",
  "vocab": [
    { "word": "当前图片中印刷的英文目标单词", "translation": "地道简体中文翻译", "is_core": true, "difficulty": 1, "page": 1 }
  ],
  "patterns": [
    { "pattern": "当前图片对话框或句型框中印刷的核心交际句型", "translation": "地道简体中文翻译", "is_core": true, "page": 1 }
  ],
  "grammar": [
    { "point": "当前页面的语法要点", "example": "当前页面对应的真实英文例句", "is_core": true, "page": 1 }
  ]
}

【少儿英语切图识别严格铁律】：
1. 🎯 核心词汇 (vocab) 严格标准：
   - 必须只能提取独立的【目标生词】或【固定名词短语】（如 pen, pencil, backpack, pencil case 等）！
   - 🚫 绝对严禁带不定冠词 a/an（提取 pen 而不是 a pen；提取 eraser 而不是 an eraser）！
   - 🚫 绝对严禁把句子或交际短语放入词汇（如 "Thank you.", "I'm fine.", "Hi!", "I'm OK." 绝不是词汇，严禁放入 vocab，必须归入 patterns 句型中）！
   - 🚫 单词项绝不能包含句号、问号、感叹号等标点符号！
   - 📄 必须附带所在页码 "page": 整数！
2. 💬 重点句型 (patterns) 严格标准：
   - 提取本课核心目标交际句型与问答模版（如 "What is it? It's a pen." 或 "How are you? I'm fine. Thank you."）！
   - 🚫 严禁整首歌谣/歌曲 (Song/Chant) 的重复歌词大段堆砌输出！必须提纯为简练的标准交际问答句！
   - 🚫 严禁把语法注释说明（如 "It's = It is"、"isn't = is not"）粘连在句型末尾！语法规则必须单独提取到 grammar 中！
   - 🚫 严格避免重复句型！相同结构的句子（如 "It's a pen." 和 "It's a book."）只提取最具代表性的 1~2 个句型，不要罗列十几个同构句！
   - 📄 必须附带所在页码 "page": 整数！
3. 📖 语法点 (grammar)：
   - 提取本页涉及的核心语法规则或结构解析（如 "缩写形式：It's = It is, isn't = is not"、"be动词特殊疑问句：What is it? / It's a..."）！
   - 📄 必须附带所在页码 "page": 整数！
4. 🚫 绝对黑名单（严禁作为句型或语法点输出）：
   - 严禁提取课堂指令词！例如：
     ${blacklistFormatted}
   - 严禁输出任何与本页图片无关的词汇或句子！
5. 🇨🇳 翻译全部使用规范准确的【简体中文】。`;
}

// 兼容老调用代码的通用 Prompt 导出
const EXTRACTION_PROMPT = buildExtractionPrompt(DEFAULT_CONTENT_SCHEMAS.general_english);

// 健壮的 JSON 解析器 (自动剥离 markdown 与前后非 JSON 字符)
function cleanAndParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();
  try { return JSON.parse(trimmed); } catch(e) {}

  // 剥离 ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch(e) {}
  }

  // 提取最外层的大括号对象
  const objMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objMatch) {
    try { return JSON.parse(objMatch[1]); } catch(e) {}
  }

  // 提取最外层的数组对象
  const arrMatch = trimmed.match(/(\[[\s\S]*\])/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[1]); } catch(e) {}
  }

  return null;
}

// ============================================================
// 词汇与句型智能提纯清洗与去重工具函数
// ============================================================
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
  'and', 'or', 'but'
]);

function isCommandInstruction(s) {
  const trimmed = (s || '').trim();
  if (!trimmed) return false;
  // 单个词绝不当作指令（例如 sing, read, write, color, circle, talk, clap 均为常见教材核心词汇）
  if (!/\s/.test(trimmed)) return false;
  return /^(listen|point|say|sing|ask|answer|look|read|circle|write|number|trace|color|match|talk|chant|clap|stomp|tap|show\s+and\s+tell|make\s+a)\b/i.test(trimmed);
}

function isSentenceOrGreeting(s) {
  const trimmed = (s || '').trim();
  if (!trimmed) return false;
  // 包含句末或标点符号
  if (/[?!.]/.test(trimmed)) return true;
  // 包含常见主谓/问候/交际句首
  if (/^(thank\s*you|thanks|hi|hello|good\s+(morning|afternoon|evening|night)|goodbye|bye|how\s+are\s+you|how\s+do\s+you|nice\s+to\s+meet|see\s+you|i'?m\b|it'?s\b|what'?s\b|what\s+is\b|who\s+is\b|how\s+is\b|where\s+is\b|this\s+is\b|that\s+is\b|is\s+it\b|are\s+you\b|are\s+they\b|do\s+you\b|can\s+you\b|my\s+name\s+is\b|your\s+name\b|yes\b|no\b|excuse\s+me)\b/i.test(trimmed)) {
    return true;
  }
  // 单词数 >= 4 (通常是完整句子或长复合句)
  if (trimmed.split(/\s+/).length >= 4) return true;
  return false;
}

function normalizeVocabWord(w) {
  let s = (w || '').trim();
  // 剥离冠词 a/an/the
  s = s.replace(/^(?:a|an|the)\s+/i, '').trim();
  // 剥离前后非英文字母标点
  s = s.replace(/^[^\w]+|[^\w]+$/g, '').trim();
  return s;
}

function cleanVocabList(rawList) {
  const cleaned = [];
  const seen = new Set();
  const misclassifiedSentences = [];

  const list = Array.isArray(rawList) ? rawList : [];
  for (const item of list) {
    const rawWord = (typeof item === 'string' ? item : (item.word || item.name || '')).trim();
    const rawTrans = (typeof item === 'object' ? (item.translation || item.chinese || item.meaning || '') : '').trim();
    if (!rawWord || isCommandInstruction(rawWord)) continue;

    if (isSentenceOrGreeting(rawWord)) {
      const sObj = {
        pattern: rawWord,
        translation: rawTrans || rawWord,
        is_core: true
      };
      if (item.page !== undefined && item.page !== null) {
        sObj.page = parseInt(item.page, 10);
      }
      misclassifiedSentences.push(sObj);
      continue;
    }

    const normWord = normalizeVocabWord(rawWord);
    if (!normWord || isCommandInstruction(normWord)) continue;

    const key = normWord.toLowerCase();
    // 过滤纯虚词/代词/功能词 (如 this, is, my, these, are, at, and)
    if (FUNCTION_WORDS.has(key)) continue;

    // 单复数去重：如果单数形式已存在，不重复添加复数
    if (key.endsWith('s') && seen.has(key.slice(0, -1))) continue;

    if (!seen.has(key)) {
      seen.add(key);
      const vObj = {
        word: normWord,
        translation: rawTrans || normWord,
        is_core: true,
        difficulty: item.difficulty || 1
      };
      if (item.page !== undefined && item.page !== null) {
        vObj.page = parseInt(item.page, 10);
      }
      cleaned.push(vObj);
    }
  }
  return { cleanedVocab: cleaned, extraSentences: misclassifiedSentences };
}

function cleanPatternList(rawList, extraCandidates = []) {
  const allList = [...(Array.isArray(rawList) ? rawList : []), ...extraCandidates];
  const patternMap = new Map();
  const seenQuestionPrefixes = new Set();

  // 检查是否已有较完整的日常交际问句 (如 How are you? ...)
  const hasFullGreeting = allList.some(item => {
    const p = (typeof item === 'string' ? item : (item.pattern || item.sentence || '')).trim();
    return /how\s+are\s+you/i.test(p);
  });

  for (const item of allList) {
    let p = (typeof item === 'string' ? item : (item.pattern || item.sentence || '')).trim();
    let trans = (typeof item === 'object' ? (item.translation || item.chinese || '') : '').trim();
    if (!p || isCommandInstruction(p)) continue;

    // 1. 规范标点符号
    p = p.replace(/！/g, '! ').replace(/？/g, '? ').replace(/。/g, '. ').replace(/，/g, ', ').replace(/\s+/g, ' ').trim();

    // 2. 剥离末尾粘连的语法注释 (如 "It's = It is", "isn't = is not", "Can't = can not")
    p = p.replace(/\s*(?:It'?s\s*=\s*It\s*is|isn'?t\s*=\s*is\s*not|What'?s\s*=\s*What\s*is|I'?m\s*=\s*I\s*am|Can'?t\s*=\s*can\s*not).*$/i, '').trim();

    // 3. 过滤歌谣/Chant长串 (长度超长且同一有效单词>=3字母反复出现3次以上)
    if (p.length > 50 && (/\b([a-zA-Z]{3,})\b.*\b\1\b.*\b\1\b/i.test(p) || p.split(/\s+/).length > 15)) {
      const mQa = p.match(/(What\s+is\s+it\?\s*It'?s\s+a\s+[^.]+\.)/i) || p.match(/(Is\s+it\s+a\s+[^?]+\?\s*(?:Yes,\s*it\s*is|No,\s*it\s*isn'?t)\.?)/i);
      const mEx = p.match(/(Excuse\s+me\.?\s*(?:I\s+can'?t\s+see\.?)?)/i);
      if (mQa) {
        p = mQa[1];
        if (trans.length > 30 || /歌|chant|notebook|桌子|铅笔/i.test(trans)) {
          trans = p.toLowerCase().includes('what is it') ? '它是什么？它是一本书。' : '它是一只...吗？是的/不是。';
        }
      } else if (mEx) {
        p = mEx[1].trim();
        if (!p.endsWith('.')) p += '.';
        trans = '打扰一下。/ 对不起，我看不见。';
      } else {
        const mNeg = p.match(/(It\s+isn'?t\s+a\s+[^.]+\.)/i);
        if (mNeg) {
          p = mNeg[1];
          if (trans.length > 30) trans = '它不是一个...。';
        } else {
          continue; // 丢弃长歌词
        }
      }
    }

    // 4. 规范日常问候多重重复
    if (/How\s+are\s+you.*How\s+are\s+you/i.test(p)) {
      p = "How are you? - I'm fine. / I'm OK. / I'm great. Thank you.";
      trans = "你好吗？我很好。/ 我还行。/ 我棒极了。谢谢你。";
    }

    // 5. 如果已有完整问候，过滤孤立的微小问候/应答碎片 (如 "Hi!", "I'm OK!", "I'm great!", "Thank you.")
    if (hasFullGreeting && /^(hi|hello|thank\s*you|thanks|i'?m\s*(fine|ok|great|good)|goodbye|bye)\b[!. ]*$/i.test(p)) {
      continue;
    }

    if (!p) continue;

    // 6. 句型问答模版去重 (如果已有相同前缀>=3个词的疑问句，避免出现多个相同句式仅换名词的句子，如 "Are these my eyes?", "Are these my ears?")
    const words = p.split(/\s+/);
    if (p.endsWith('?') && words.length >= 3) {
      const qPrefix = words.slice(0, -1).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
      if (seenQuestionPrefixes.has(qPrefix)) {
        continue;
      }
      seenQuestionPrefixes.add(qPrefix);
    }

    // 7. 语义指纹去重 (去除标点、统一缩写)
    const fp = p.toLowerCase()
      .replace(/what's/g, 'what is')
      .replace(/it's/g, 'it is')
      .replace(/isn't/g, 'is not')
      .replace(/i'm/g, 'i am')
      .replace(/you're/g, 'you are')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let isDup = false;
    for (const [existingFp, existingItem] of patternMap.entries()) {
      if (fp === existingFp) {
        isDup = true;
        break;
      }
      // 包含关系：若现有句型是新句型子集且较长，用完整句型替换
      if (fp.includes(existingFp) && existingFp.length > 12) {
        patternMap.delete(existingFp);
        break;
      }
      // 反之，若已有更长更完整的句型，跳过子句
      if (existingFp.includes(fp) && fp.length > 12) {
        isDup = true;
        break;
      }
    }

    if (!isDup) {
      const pObj = {
        pattern: p,
        translation: trans || p,
        is_core: true
      };
      if (item.page !== undefined && item.page !== null) {
        pObj.page = parseInt(item.page, 10);
      }
      patternMap.set(fp, pObj);
    }
  }

  return Array.from(patternMap.values());
}

function cleanGrammarList(rawList) {
  const list = Array.isArray(rawList) ? rawList : [];
  const grammarMap = new Map();

  for (const g of list) {
    let pt = (g.point || g.topic || g.title || '').trim();
    let ex = (g.example || g.explanation || g.desc || '').trim();
    if (!pt || isCommandInstruction(pt)) continue;

    // 剥离歌词误入语法
    if (pt.length > 30 && (/\b(\w+)\b.*\b\1\b.*\b\1\b/i.test(pt) || /\.\s*\w+\s*\.\s*\w+\s*\./.test(pt) || /\bmy\s*\./i.test(pt))) continue;

    // 规整纯问答句为标准语法点描述
    if (/^what\s+is\s+it/i.test(pt)) {
      pt = '特殊疑问句：What is it? / It is a...';
      if (!ex || ex === pt) ex = "What is it? - It's a pen.";
    } else if (/^how\s+are\s+you/i.test(pt)) {
      pt = '日常交际问候：How are you? / I am...';
      if (!ex || ex === pt) ex = "How are you? - I'm fine. Thank you.";
    } else if (/it'?s\s*=\s*it\s*is/i.test(pt)) {
      pt = "缩写形式：It's = It is, isn't = is not";
      if (!ex || ex === pt) ex = "It's a book. It isn't a notebook.";
    }

    const gFp = pt.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '');
    if (!grammarMap.has(gFp)) {
      const gObj = {
        point: pt,
        example: ex || pt,
        is_core: true
      };
      if (g.page !== undefined && g.page !== null && !isNaN(parseInt(g.page, 10))) {
        gObj.page = parseInt(g.page, 10);
      }
      grammarMap.set(gFp, gObj);
    }
  }

  return Array.from(grammarMap.values());
}

// ============================================================
// 调 LLM 做结构化提取
// ============================================================
async function callLLM(c, textContent) {
  const baseUrl = c.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = c.env.LLM_API_KEY;
  const model = c.env.LLM_MODEL || 'gpt-4o';

  if (!apiKey) {
    throw new Error('LLM_API_KEY not configured. Run: wrangler secret put LLM_API_KEY');
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: `Here is the textbook unit content:\n\n${textContent}` }
      ],
      temperature: 0.1,
      max_tokens: 4096
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${errText.substring(0, 200)}`);
  }

  const data = await resp.json();
  let raw = data.choices?.[0]?.message?.content || '';
  // 去掉 ```json 包裹
  raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(raw);
  } catch {
    return { vocab: [], patterns: [], grammar: [], _raw: raw.substring(0, 500) };
  }
}

// 从 PDF ArrayBuffer 提取文字 (用 unpdf,Workers 兼容)
// 然后把文字喂给 LLM 做结构化提取
async function callLLMWithPDF(c, pdfBuffer, filename) {
  const baseUrl = c.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = c.env.LLM_API_KEY;
  const model = c.env.LLM_MODEL || 'gpt-4o';

  if (!apiKey) {
    throw new Error('LLM_API_KEY not configured. Run: wrangler secret put LLM_API_KEY');
  }

  // 1. unpdf 提取文字
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdfBytes = new Uint8Array(pdfBuffer);
  const pdf = await getDocumentProxy(pdfBytes);
  const { text: pdfText } = await extractText(pdf, { mergePages: true });

  if (!pdfText || pdfText.trim().length === 0) {
    throw new Error('PDF 提取不到文字 (可能是扫描版 PDF,需要 OCR)');
  }

  // 2. 调 LLM
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: `Here is the textbook unit content (extracted from PDF ${filename}):\n\n${pdfText}` }
      ],
      temperature: 0.1,
      max_tokens: 2048
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${errText.substring(0, 200)}`);
  }

  const data = await resp.json();
  let raw = data.choices?.[0]?.message?.content || '';
  raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(raw);
  } catch {
    return { vocab: [], patterns: [], grammar: [], _raw: raw.substring(0, 500) };
  }
}

// ============================================================
// POST /upload — 上传 PDF 到 R2
// multipart/form-data, field name: "pdf"
// 可选: textbook_code, unit_number (会作为 R2 key 前缀)
// ============================================================
textbooks.post('/upload', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  if (!R2) return c.json({ error: { code: 'R2_NOT_BOUND', message: 'R2 bucket not configured' } }, 500);

  const formData = await c.req.formData();
  const file = formData.get('pdf');
  if (!file || !file.name) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing pdf file' } }, 400);
  }

  const textbookCode = formData.get('textbook_code') || 'unknown';
  const unitNumber = formData.get('unit_number') || '0';
  const key = `${textbookCode}/Unit${unitNumber}_${file.name}`;

  const arrayBuffer = await file.arrayBuffer();
  await R2.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type || 'application/pdf' }
  });

  return c.json({
    data: {
      key,
      filename: file.name,
      size: arrayBuffer.byteLength,
      textbook_code: textbookCode,
      unit_number: unitNumber
    }
  });
});

// ============================================================
// GET /pdfs — 列出 R2 中的 PDF
// ============================================================
textbooks.get('/pdfs', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  if (!R2) return c.json({ error: { code: 'R2_NOT_BOUND', message: 'R2 bucket not configured' } }, 500);

  const listed = await R2.list();
  const files = listed.objects.map(obj => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded?.toISOString()
  }));

  return c.json({ data: files });
});

// ============================================================
// GET /pdf/:key — 下载 PDF (key 用 URL 编码,可能含 /)
// ============================================================
textbooks.get('/pdf/:key', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  if (!R2) return c.json({ error: { code: 'R2_NOT_BOUND' } }, 500);

  const key = decodeURIComponent(c.req.param('key'));
  const object = await R2.get(key);
  if (!object) return c.json({ error: { code: 'NOT_FOUND', message: 'PDF not found' } }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${key.split('/').pop()}"`
    }
  });
});

// ============================================================
// DELETE /pdf/:key — 删除 R2 中的 PDF
// ============================================================
textbooks.delete('/pdf/:key', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  if (!R2) return c.json({ error: { code: 'R2_NOT_BOUND' } }, 500);

  const key = decodeURIComponent(c.req.param('key'));
  await R2.delete(key);
  return c.json({ data: { deleted: key } });
});

// ============================================================
// POST /extract — 上传图片(可多张) → 调 vision LLM → 返回 JSON (不存库)
// 用途: Admin 页面"预览提取结果"按钮
// Form fields: images[] (FileList,1-8张) 可选 textbook_code unit_number
// ============================================================
textbooks.post('/extract', async (c) => {
  const formData = await c.req.formData();

  // 收集所有 images[] 文件
  const images = formData.getAll('images').filter(f => f && f.name);

  if (images.length === 0) {
    // 兼容: 也许传的是 pdf 字段? Workers 端 unpdf 解析试一下
    const pdf = formData.get('pdf');
    if (!pdf) return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing images[] or pdf' } }, 400);

    // fallback unpdf 文字提取
    try {
      const arrayBuffer = await pdf.arrayBuffer();
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdfBytes = new Uint8Array(arrayBuffer);
      const pdfDoc = await getDocumentProxy(pdfBytes);
      const { text: pdfText } = await extractText(pdfDoc, { mergePages: true });
      if (pdfText && pdfText.trim().length > 0) {
        const result = await callLLM(c, pdfText);
        if (result) {
          const { cleanedVocab, extraSentences } = cleanVocabList(result.vocab || []);
          result.vocab = cleanedVocab;
          result.patterns = cleanPatternList(result.patterns || [], extraSentences);
          result.grammar = cleanGrammarList(result.grammar || []);
        }
        return c.json({ data: result, _method: 'unpdf' });
      }
      return c.json({ error: { code: 'NO_TEXT', message: 'PDF 提取不到文字 (可能是扫描版,需用浏览器先转图片后上传)' } }, 400);
    } catch (err) {
      return c.json({ error: { code: 'UNPDF_ERROR', message: err.message } }, 500);
    }
  }

  // 有图片 → 调 vision LLM
  try {
    const result = await callLLMWithImages(c, images);
    if (result) {
      const { cleanedVocab, extraSentences } = cleanVocabList(result.vocab || []);
      result.vocab = cleanedVocab;
      result.patterns = cleanPatternList(result.patterns || [], extraSentences);
      result.grammar = cleanGrammarList(result.grammar || []);
    }
    return c.json({ data: result, _method: 'vision' });
  } catch (err) {
    return c.json({ error: { code: 'LLM_ERROR', message: err.message } }, 502);
  }
});

// ============================================================
// POST /extract/:code/:num — 上传图片 → R2 备份 + vision LLM 提取 + 写入 unit_content
// 用途: Admin 页面"AI 提取并保存"按钮 (扫描版 PDF 转图片后)
// ============================================================
textbooks.post('/extract/:code/:num', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  const DB = c.env.DB;
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));

  const formData = await c.req.formData();
  const images = formData.getAll('images').filter(f => f && f.name);
  const pdf = formData.get('pdf');  // 也允许多传 PDF 原文件 (备份用)

  // 查 unit_id
  const unit = await DB.prepare(`
    SELECT id FROM textbook_units WHERE textbook_code = ? AND unit_number = ?
  `).bind(code, num).first();
  if (!unit) return c.json({ error: { code: 'NOT_FOUND', message: 'Unit not found' } }, 404);

  let content;
  try {
    if (images.length > 0) {
      content = await callLLMWithImages(c, images);
    } else if (pdf) {
      // 无图但只有 PDF → unpdf 尝试文字提取
      const arrayBuffer = await pdf.arrayBuffer();
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdfBytes = new Uint8Array(arrayBuffer);
      const pdfDoc = await getDocumentProxy(pdfBytes);
      const { text: pdfText } = await extractText(pdfDoc, { mergePages: true });
      if (!pdfText || pdfText.trim().length === 0) {
        return c.json({ error: { code: 'NO_TEXT', message: 'PDF 提取不到文字 (扫描版?). 请在前端把 PDF 转图片后再上传' } }, 400);
      }
      content = await callLLM(c, pdfText);
    } else {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing images[] or pdf' } }, 400);
    }
  } catch (err) {
    return c.json({ error: { code: 'LLM_ERROR', message: err.message } }, 502);
  }

  // 上传到 R2 (有 PDF 就存 PDF,否则存第一张图)
  let r2Key = '';
  if (pdf) {
    r2Key = `${code}/Unit${num}_${pdf.name}`;
    await R2.put(r2Key, await pdf.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });
  } else if (images.length > 0 && R2) {
    r2Key = `${code}/Unit${num}_${images[0].name}`;
    await R2.put(r2Key, await images[0].arrayBuffer(), { httpMetadata: { contentType: images[0].type } });
  }

  // 运行智能清洗管道
  const { cleanedVocab, extraSentences } = cleanVocabList(content.vocab || []);
  const cleanPatterns = cleanPatternList(content.patterns || [], extraSentences);
  const cleanGrammar = cleanGrammarList(content.grammar || []);

  // 写入 unit_content
  const vocab = JSON.stringify(cleanedVocab);
  const patterns = JSON.stringify(cleanPatterns);
  const grammar = JSON.stringify(cleanGrammar);

  const existing = await DB.prepare('SELECT id FROM unit_content WHERE unit_id = ?').bind(unit.id).first();
  if (existing) {
    await DB.prepare(`
      UPDATE unit_content SET vocab = ?, patterns = ?, grammar = ?, extracted_by = 'llm', extracted_at = datetime('now'), updated_at = datetime('now')
      WHERE unit_id = ?
    `).bind(vocab, patterns, grammar, unit.id).run();
  } else {
    await DB.prepare(`
      INSERT INTO unit_content (unit_id, textbook_code, unit_number, vocab, patterns, grammar, extracted_by, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?, 'llm', datetime('now'))
    `).bind(unit.id, code, num, vocab, patterns, grammar).run();
  }

  return c.json({
    data: {
      textbook_code: code,
      unit_number: num,
      r2_key: r2Key,
      content,
      saved: true
    }
  });
});

// ============================================================
// POST /test-llm — 测试 AI 视觉大模型连接性
// Body: { base_url, api_key, model }
// ============================================================
textbooks.post('/test-llm', async (c) => {
  let body = {};
  try { body = await c.req.json(); } catch {}
  
  const baseUrl = body.base_url || c.req.header('x-llm-base-url') || c.env.LLM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  const apiKey = body.api_key || c.req.header('x-llm-api-key') || c.env.LLM_API_KEY;
  const model = body.model || c.req.header('x-llm-model') || c.env.LLM_MODEL || 'meta/llama-3.2-11b-vision-instruct';

  if (!apiKey) {
    return c.json({ error: { code: 'NO_API_KEY', message: '未提供 API Key' } }, 400);
  }

  try {
    const t0 = Date.now();
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "Hello, vision model is ready!"' }],
        max_tokens: 30
      })
    });

    const elapsed = Date.now() - t0;
    if (!resp.ok) {
      const errText = await resp.text();
      return c.json({ error: { code: `HTTP_${resp.status}`, message: `API 报错 (${resp.status}): ${errText.substring(0, 300)}` } }, 400);
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || '';
    return c.json({ data: { success: true, elapsed_ms: elapsed, model, reply } });
  } catch (err) {
    return c.json({ error: { code: 'NETWORK_ERROR', message: `连接异常: ${err.message}` } }, 500);
  }
});

// ============================================================
// GET /llm-models — 查询当前提供商支持的模型列表
// ============================================================
textbooks.get('/llm-models', async (c) => {
  const baseUrl = c.req.query('base_url') || c.req.header('x-llm-base-url') || c.env.LLM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  const apiKey = c.req.query('api_key') || c.req.header('x-llm-api-key') || c.env.LLM_API_KEY;
  if (!apiKey) return c.json({ error: { code: 'NO_API_KEY', message: '未配置 API Key' } }, 400);

  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!resp.ok) {
      const err = await resp.text();
      return c.json({ error: { code: 'FETCH_ERROR', message: err } }, 400);
    }
    const json = await resp.json();
    return c.json({ success: true, data: json.data || json });
  } catch (err) {
    return c.json({ error: { code: 'NETWORK_ERROR', message: err.message } }, 500);
  }
});

// ============================================================
// Vision LLM: 用图片直接读 (优先使用 Header 传入的动态配置)
// ============================================================
async function callLLMWithImages(c, imageFiles, opts = {}) {
  const baseUrl = opts.baseUrl || c.req.header('x-llm-base-url') || c.env.LLM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  const apiKey = opts.apiKey || c.req.header('x-llm-api-key') || c.env.LLM_API_KEY;
  const model = opts.model || c.req.header('x-llm-model') || c.env.LLM_MODEL || 'meta/llama-3.2-11b-vision-instruct';
  const fallbackModels = [model, 'meta/llama-3.2-11b-vision-instruct', 'meta/llama-3.2-90b-vision-instruct'];

  if (!apiKey) {
    throw new Error('LLM_API_KEY not configured. Please set API Key in Model Settings.');
  }

  // 批量高效 Base64 转换 (单次处理 32KB 块，耗时 0.5ms，零依赖)
  function arrayBufferToBase64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    const len = bytes.byteLength;
    const CHUNK_SIZE = 0x8000; // 32768
    for (let i = 0; i < len; i += CHUNK_SIZE) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK_SIZE, len)));
    }
    return btoa(binary);
  }

  const imageContents = [];
  const maxPages = opts.maxPages || 8;
  for (let i = 0; i < imageFiles.length; i++) {
    const f = imageFiles[i];
    if (i >= maxPages) break;
    const buf = await f.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    const mime = f.type || 'image/jpeg';
    imageContents.push({
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${b64}` }
    });
  }

  // 单元模式 vs 整本书模式
  let promptText = opts.bookMode
    ? `You are given pages from a language textbook. Extract vocabulary, patterns, and grammar PER UNIT. Every item MUST have accurate Simplified Chinese translations and the exact textbook "page" number (integer). Return ONLY a JSON array of units.`
    : buildExtractionPrompt(opts.schema);

  if (opts.pageHint) {
    promptText += `\n\n【当前切片课本印刷页码】：第 ${opts.pageHint} 页。请务必将提取出的所有 vocab, patterns, grammar 中的 "page" 属性均设为 ${opts.pageHint}。`;
  }

  if (opts.unitText) {
    promptText += `\n\n=== 课本文本层内容 (包含该单元各课全部单词与对话) ===\n${opts.unitText}\n======================================================`;
  }

  const userContent = [
    { type: 'text', text: `${promptText}\n\n请立即输出纯 JSON 数据：` },
    ...imageContents
  ];

  async function tryCall(m) {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: m,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.1,
        max_tokens: opts.bookMode ? 4096 : 2048
      })
    });
    return resp;
  }

  // 自动二级提纯函数：将自然语言描述提纯为带中文翻译的标准 JSON
  async function refineToJSON(m, rawText, schema = null) {
    const type = schema?.type || 'general_english';
    const instructions = type === 'phonics'
      ? '提取为包含 "unit_title", "letters", "sounds", "blending_words", "sight_words", "vocab", "patterns", "grammar" 的严格 JSON。所有条目必须保留 "page" (数字页码，如未标明则设为 null)；所有单词与短语必须带有准确的简体中文 "translation"。'
      : (type === 'graded_reader'
        ? '提取为包含 "unit_title", "key_words", "key_phrases", "comprehension_questions", "story_summary", "vocab", "patterns" 的严格 JSON。所有条目必须保留 "page" (数字页码)。'
        : '提取为严格的 JSON 对象，必须包含 "unit_title", "vocab" (包含 "word", "translation", is_core: true, difficulty: 1, "page": 整数页码), "patterns" (包含 "pattern", "translation", is_core: true, "page": 整数页码), "grammar" (包含 "point", "example", is_core: true, "page": 整数页码)。所有 item 必须包含准确地道的简体中文 "translation"。');

    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: m,
          messages: [
            {
              role: 'user',
              content: `请将以下教材分析内容整理为严格的 JSON 对象。\n${instructions}\n\n所有 translation 字段必须翻译为准确地道的【简体中文】，不可留空。\n\n原始内容:\n${rawText}\n\n只返回纯 JSON，严禁任何多余文字。`
            }
          ],
          temperature: 0.1,
          max_tokens: 2048
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || '';
        return cleanAndParseJson(text);
      }
    } catch (e) {
      console.warn('refineToJSON error:', e);
    }
    return null;
  }

  // 按优先级尝试所有模型,429 限流就 fallback
  const modelsToTry = [model, ...fallbackModels.filter(m => m !== model)];
  let lastError = '';
  for (const m of modelsToTry) {
    let resp;
    try { 
      resp = await tryCall(m); 
    } catch (err) { 
      lastError = err.message; 
      continue; 
    }

    if (resp.ok) {
      const data = await resp.json();
      let raw = data.choices?.[0]?.message?.content || '';
      let parsed = cleanAndParseJson(raw);
      if (!parsed && raw.trim().length > 0) {
        // 如果视觉模型输出了大段描述，启动二级智能提纯
        parsed = await refineToJSON(m, raw, opts.schema);
      }
      if (parsed) return parsed;
      throw new Error(`大模型返回了非标准 JSON: ${raw.substring(0, 200)}`);
    }

    const errText = await resp.text();
    lastError = `[${m}] 报错 (${resp.status}): ${errText.substring(0, 200)}`;

    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      try { 
        resp = await tryCall(m); 
        if (resp.ok) {
          const data = await resp.json();
          let raw = data.choices?.[0]?.message?.content || '';
          let parsed = cleanAndParseJson(raw);
          if (!parsed && raw.trim().length > 0) {
            parsed = await refineToJSON(m, raw, opts.schema);
          }
          if (parsed) return parsed;
          throw new Error(`大模型返回了非标准 JSON: ${raw.substring(0, 200)}`);
        }
      } catch (err) {
        lastError = err.message;
      }
    }
  }

  throw new Error(lastError || '未知大模型错误');
}

// ============================================================
// POST /preview-unit/:code/:num — 单 Unit 模式图片 → AI 识别 → 返回 JSON (不写库)
// 用途: Admin 单 Unit 模式"AI 识别"按钮 — 先输出到前端校对,确认后才保存
// Form: images[] (多页图片,属于选定的这一个 unit)
// ============================================================
textbooks.post('/preview-unit/:code/:num', async (c) => {
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));

  let formData;
  try {
    formData = await c.req.formData();
  } catch (e) {
    formData = new FormData();
  }

  const images = formData.getAll ? formData.getAll('images').filter(f => f && f.name) : [];
  const aiVision = formData.get ? formData.get('ai_vision') : null;
  // 优先采用按页切片的单页图列表，以保证 AI 能够精确逐页提取并关联页码
  let imagesToLLM = images.length > 0 ? [...images] : (aiVision ? [aiVision] : []);

  // 查询 DB 中教材配置与 unit_title
  let schema = null;
  let dbUnitTitle = '';
  try {
    const [unit, book] = await Promise.all([
      c.env.DB.prepare(`
        SELECT id, unit_title FROM textbook_units WHERE textbook_code = ? AND unit_number = ?
      `).bind(code, num).first(),
      c.env.DB.prepare(`
        SELECT id, name, series, content_schema FROM textbooks WHERE code = ?
      `).bind(code).first()
    ]);
    if (unit) dbUnitTitle = unit.unit_title;
    if (book?.content_schema) {
      schema = typeof book.content_schema === 'string' ? safeParseJson(book.content_schema) : book.content_schema;
    }
  } catch (e) {
    console.error('DB query error:', e);
  }

  // 允许前端临时传递 schema 覆盖
  const reqSchema = formData.get ? formData.get('content_schema') : null;
  if (reqSchema) {
    try { schema = typeof reqSchema === 'object' ? reqSchema : JSON.parse(reqSchema); } catch {}
  }
  if (!schema) {
    schema = (code.toLowerCase().includes('phonics') || code.startsWith('WE-P'))
      ? DEFAULT_CONTENT_SCHEMAS.phonics
      : DEFAULT_CONTENT_SCHEMAS.general_english;
  }

  // 如果前端没有携带图片（例如页面刷新后），自动从 R2 提取该单元已存切图
  if (imagesToLLM.length === 0) {
    const R2 = c.env.TEXTBOOKS_R2;
    if (R2) {
      const prefix1 = `${code}/Unit${num}/`;
      const prefix2 = `${code}/Unit${num}_`;
      const [res1, res2] = await Promise.all([
        R2.list({ prefix: prefix1, limit: 100 }),
        R2.list({ prefix: prefix2, limit: 100 })
      ]);
      // 严格正则过滤：只保留属于精确当前 Unit${num} 的图片，杜绝 Unit1 误匹配到 Unit10/11/12
      const allObjs = [...(res1.objects || []), ...(res2.objects || [])]
        .filter(o => {
          if (!/\.(png|jpg|jpeg|webp)$/i.test(o.key)) return false;
          const isSlashMatch = o.key.startsWith(`${code}/Unit${num}/`);
          const isUnderMatch = o.key.startsWith(`${code}/Unit${num}_`) && !new RegExp(`^${code}/Unit${num}\\d`, 'i').test(o.key);
          return isSlashMatch || isUnderMatch;
        })
        .sort((a, b) => a.key.localeCompare(b.key));

      // 按页全量提取：取出属于当前 Unit${num} 的所有切片页面（按页码自然升序排列）
      const totalPages = allObjs.length;
      const targetIndices = allObjs.map((_, i) => i);

      for (const idx of targetIndices) {
        if (allObjs[idx]) {
          const key = allObjs[idx].key;
          const ext = key.split('.').pop() || 'jpeg';
          imagesToLLM.push({
            name: key.split('/').pop(),
            key: key,
            type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            arrayBuffer: async () => {
              const file = await R2.get(key);
              return file ? await file.arrayBuffer() : new ArrayBuffer(0);
            }
          });
        }
      }
    }
  }

  if (imagesToLLM.length === 0) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '未找到本单元切图，请先上传 PDF 切片后再试' } }, 400);
  }

  try {
    // 从 Header 或 FormData 读取动态模型配置与页面文本
    const llmBaseUrl = formData.get('llm_base_url') || c.req.header('x-llm-base-url');
    const llmApiKey = formData.get('llm_api_key') || c.req.header('x-llm-api-key');
    const llmModel = formData.get('llm_model') || c.req.header('x-llm-model');
    const unitText = formData.get('unit_text') || '';

    // 对切片页面受控并发提取并聚合 (每次并发 3 页，兼顾极速吞吐与频控)
    const groupResults = [];
    const BATCH_CONCURRENCY = 3;
    for (let i = 0; i < imagesToLLM.length; i += BATCH_CONCURRENCY) {
      const chunk = imagesToLLM.slice(i, i + BATCH_CONCURRENCY);
      const chunkPromises = chunk.map(async (imgItem, subIdx) => {
        try {
          const singlePage = [imgItem];
          const pageMatch = (imgItem.name || '').match(/page[_-](\d+)/i);
          const slicePageNum = pageMatch ? parseInt(pageMatch[1], 10) : null;
          const pageRes = await callLLMWithImages(c, singlePage, {
            bookMode: false,
            maxPages: 1,
            baseUrl: llmBaseUrl,
            apiKey: llmApiKey,
            model: llmModel,
            unitText,
            schema,
            pageHint: slicePageNum
          });
          return { res: pageRes, fallbackPage: slicePageNum };
        } catch (err) {
          console.warn(`Page ${i + subIdx} extract warn:`, err.message);
          return null;
        }
      });
      const chunkRes = await Promise.all(chunkPromises);
      groupResults.push(...chunkRes.filter(Boolean));
    }

    // 把这次上传的 PDF 页面图保存到 R2 (path: `${code}/Unit${num}/page-${i}.png`)
    const R2 = c.env.TEXTBOOKS_R2;
    let pagesSaved = 0;
    if (R2 && images.length > 0) {
      const images_arr = Array.isArray(images) ? images : [images];
      pagesSaved = images_arr.length;
      for (let i = 0; i < images_arr.length; i++) {
        const f = images_arr[i];
        const buf = await f.arrayBuffer();
        const key = `${code}/Unit${num}/${f.name || `page-${String(i+1).padStart(2,'0')}.png`}`;
        await R2.put(key, buf, { httpMetadata: { contentType: f.type || 'image/png' } });
      }
    }

    // 智能多维度聚合器
    const vocabMap = new Map();
    const patternMap = new Map();
    const grammarMap = new Map();
    const letterMap = new Map();
    const soundMap = new Map();
    const blendingMap = new Map();
    const sightWordMap = new Map();
    const keyWordMap = new Map();
    const keyPhraseMap = new Map();
    const compQuestions = [];
    const grammarRulesMap = new Map();
    const examplesList = [];
    const practiceList = [];
    let storySummary = '';
    let finalUnitTitle = dbUnitTitle || '';

    const isCommand = (s) => /^(listen|point|say|sing|ask|answer|look|read|circle|write|number|trace|color|match)\b/i.test((s || '').trim());

    for (const itemResult of groupResults) {
      if (!itemResult) continue;
      const res = itemResult.res;
      const fallbackPage = itemResult.fallbackPage;
      if (!res) continue;
      if (!finalUnitTitle && (res.unit_title || res.title)) finalUnitTitle = res.unit_title || res.title;

      // 词汇 (vocab / vocabulary / words)
      const rawVocab = res.vocab || res.vocabulary || res.words || (Array.isArray(res) ? res : []);
      for (const v of rawVocab) {
        const cleanWord = (typeof v === 'string' ? v : (v.word || v.name || '')).trim();
        const cleanTrans = (typeof v === 'object' ? (v.translation || v.chinese || v.meaning || '') : '').trim();
        const itemPage = (v.page !== undefined && v.page !== null && !isNaN(parseInt(v.page, 10)))
          ? parseInt(v.page, 10)
          : fallbackPage;

        if (cleanWord && !isCommand(cleanWord)) {
          const key = cleanWord.toLowerCase();
          if (!vocabMap.has(key)) {
            vocabMap.set(key, {
              word: cleanWord,
              translation: cleanTrans || cleanWord,
              is_core: true,
              difficulty: v.difficulty || 1,
              ...(itemPage ? { page: itemPage } : {})
            });
          } else {
            const existing = vocabMap.get(key);
            if (!existing.page && itemPage) {
              existing.page = itemPage;
            }
          }
        }
      }

      // 句型 (patterns / sentence_patterns / sentences)
      const rawPatterns = res.patterns || res.sentence_patterns || res.sentences || [];
      for (const p of rawPatterns) {
        const cleanPat = (typeof p === 'string' ? p : (p.pattern || p.sentence || '')).trim();
        const cleanTrans = (typeof p === 'object' ? (p.translation || p.chinese || '') : '').trim();
        const itemPage = (p.page !== undefined && p.page !== null && !isNaN(parseInt(p.page, 10)))
          ? parseInt(p.page, 10)
          : fallbackPage;

        if (cleanPat && !isCommand(cleanPat)) {
          const key = cleanPat.toLowerCase();
          if (!patternMap.has(key)) {
            patternMap.set(key, {
              pattern: cleanPat,
              translation: cleanTrans || cleanPat,
              is_core: true,
              ...(itemPage ? { page: itemPage } : {})
            });
          } else {
            const existing = patternMap.get(key);
            if (!existing.page && itemPage) {
              existing.page = itemPage;
            }
          }
        }
      }

      // 语法点
      const rawGrammar = res.grammar || res.grammar_points || [];
      for (const g of rawGrammar) {
        const pt = (g.point || g.topic || g.title || '').trim();
        const ex = (g.example || g.explanation || g.desc || '').trim();
        const itemPage = (g.page !== undefined && g.page !== null && !isNaN(parseInt(g.page, 10)))
          ? parseInt(g.page, 10)
          : fallbackPage;

        if (pt && !isCommand(pt)) {
          const key = pt.toLowerCase();
          if (!grammarMap.has(key)) {
            grammarMap.set(key, {
              point: pt,
              example: ex || pt,
              is_core: true,
              ...(itemPage ? { page: itemPage } : {})
            });
          } else {
            const existing = grammarMap.get(key);
            if (!existing.page && itemPage) {
              existing.page = itemPage;
            }
          }
        }
      }

      // 自然拼读: 字母 (letters)
      const rawLetters = res.letters || [];
      for (const l of rawLetters) {
        const letter = (typeof l === 'string' ? l : (l.letter || '')).trim();
        const itemPage = (l.page !== undefined && l.page !== null && !isNaN(parseInt(l.page, 10))) ? parseInt(l.page, 10) : fallbackPage;
        if (letter && !letterMap.has(letter.toLowerCase())) {
          letterMap.set(letter.toLowerCase(), {
            letter,
            sound: l.sound || '',
            uppercase: l.uppercase || letter.charAt(0).toUpperCase(),
            lowercase: l.lowercase || letter.toLowerCase(),
            ...(itemPage ? { page: itemPage } : {})
          });
        }
      }

      // 自然拼读: 发音音素 (sounds)
      const rawSounds = res.sounds || [];
      for (const s of rawSounds) {
        const snd = (typeof s === 'string' ? s : (s.sound || '')).trim();
        const itemPage = (s.page !== undefined && s.page !== null && !isNaN(parseInt(s.page, 10))) ? parseInt(s.page, 10) : fallbackPage;
        if (snd && !soundMap.has(snd)) {
          soundMap.set(snd, {
            sound: snd,
            phonics_rule: s.phonics_rule || s.rule || '',
            example_words: Array.isArray(s.example_words) ? s.example_words : [],
            ...(itemPage ? { page: itemPage } : {})
          });
        }
      }

      // 自然拼读: 拼读生词 (blending_words)
      const rawBlending = res.blending_words || [];
      for (const b of rawBlending) {
        const w = (typeof b === 'string' ? b : (b.word || '')).trim();
        const trans = (typeof b === 'object' ? (b.translation || b.chinese || '') : '').trim();
        const itemPage = (b.page !== undefined && b.page !== null && !isNaN(parseInt(b.page, 10))) ? parseInt(b.page, 10) : fallbackPage;
        if (w && !blendingMap.has(w.toLowerCase())) {
          blendingMap.set(w.toLowerCase(), {
            word: w,
            translation: trans || w,
            phonemes: Array.isArray(b.phonemes) ? b.phonemes : [],
            is_core: true,
            ...(itemPage ? { page: itemPage } : {})
          });
          // 自动双向同步至 vocabMap，保证排课和课评词汇库通用无缝
          if (!vocabMap.has(w.toLowerCase())) {
            vocabMap.set(w.toLowerCase(), {
              word: w,
              translation: trans || w,
              is_core: true,
              difficulty: 1,
              ...(itemPage ? { page: itemPage } : {})
            });
          }
        }
      }

      // 自然拼读: 视读词 (sight_words)
      const rawSight = res.sight_words || [];
      for (const sw of rawSight) {
        const w = (typeof sw === 'string' ? sw : (sw.word || '')).trim();
        const trans = (typeof sw === 'object' ? (sw.translation || '') : '').trim();
        const itemPage = (sw.page !== undefined && sw.page !== null && !isNaN(parseInt(sw.page, 10))) ? parseInt(sw.page, 10) : fallbackPage;
        if (w && !sightWordMap.has(sw.toLowerCase())) {
          sightWordMap.set(sw.toLowerCase(), {
            word: w,
            translation: trans,
            ...(itemPage ? { page: itemPage } : {})
          });
        }
      }

      // 分级阅读: key_words & key_phrases
      const rawKeyWords = res.key_words || [];
      for (const kw of rawKeyWords) {
        const w = (typeof kw === 'string' ? kw : (kw.word || '')).trim();
        const trans = (typeof kw === 'object' ? (kw.translation || '') : '').trim();
        const itemPage = (kw.page !== undefined && kw.page !== null && !isNaN(parseInt(kw.page, 10))) ? parseInt(kw.page, 10) : fallbackPage;
        if (w && !keyWordMap.has(w.toLowerCase())) {
          keyWordMap.set(w.toLowerCase(), {
            word: w,
            translation: trans || w,
            context: kw.context || '',
            is_core: true,
            ...(itemPage ? { page: itemPage } : {})
          });
          if (!vocabMap.has(w.toLowerCase())) {
            vocabMap.set(w.toLowerCase(), {
              word: w,
              translation: trans || w,
              is_core: true,
              difficulty: 1,
              ...(itemPage ? { page: itemPage } : {})
            });
          }
        }
      }

      const rawKeyPhrases = res.key_phrases || [];
      for (const kp of rawKeyPhrases) {
        const p = (typeof kp === 'string' ? kp : (kp.phrase || '')).trim();
        const trans = (typeof kp === 'object' ? (kp.translation || kp.chinese || '') : '').trim();
        const itemPage = (kp.page !== undefined && kp.page !== null && !isNaN(parseInt(kp.page, 10))) ? parseInt(kp.page, 10) : fallbackPage;
        if (p && !keyPhraseMap.has(p.toLowerCase())) {
          keyPhraseMap.set(p.toLowerCase(), {
            phrase: p,
            translation: trans,
            is_core: true,
            ...(itemPage ? { page: itemPage } : {})
          });
        }
      }

      if (Array.isArray(res.comprehension_questions)) {
        res.comprehension_questions.forEach(q => { if (q.question) compQuestions.push(q); });
      }
      if (res.story_summary && !storySummary) storySummary = res.story_summary;

      // 语法专项: rules & examples
      const rawRules = res.grammar_rules || [];
      for (const gr of rawRules) {
        const r = (gr.rule || '').trim();
        if (r && !grammarRulesMap.has(r.toLowerCase())) {
          grammarRulesMap.set(r.toLowerCase(), {
            rule: r,
            formula: gr.formula || '',
            explanation: gr.explanation || '',
            is_core: true
          });
        }
      }
      if (Array.isArray(res.examples)) {
        res.examples.forEach(ex => { if (ex.sentence) examplesList.push(ex); });
      }
      if (Array.isArray(res.practice_sentences)) {
        res.practice_sentences.forEach(pr => { if (pr.sentence) practiceList.push(pr); });
      }
    }

    // 运行智能提纯清洗与去重管道
    const { cleanedVocab, extraSentences } = cleanVocabList(Array.from(vocabMap.values()));
    let cleanPatterns = cleanPatternList(Array.from(patternMap.values()), extraSentences);
    let cleanGrammar = cleanGrammarList(Array.from(grammarMap.values()).filter(g => !isCommandInstruction(g.point)));

    // 仅综合英语模式在句型为空时生成标准交际句型，绝不污染 Phonics / 阅读教材
    if (schema.type === 'general_english') {
      if (cleanPatterns.length === 0 && cleanedVocab.length > 0) {
        const firstWord = cleanedVocab[0].word;
        const firstTrans = cleanedVocab[0].translation;
        cleanPatterns = [
          { pattern: `I have ${firstWord}.`, translation: `我有一张/个${firstTrans}。`, is_core: true },
          { pattern: `What do you have? - I have ${firstWord}.`, translation: `你有什么？- 我有${firstTrans}。`, is_core: true }
        ];
      }
      if (cleanGrammar.length === 0) {
        cleanGrammar = [{
          point: '重点句型与词汇综合应用',
          example: '掌握本单元核心词汇的陈述与问答表达',
          is_core: true
        }];
      }
    }

    // 组织扩展维度 extra_content
    const extraContent = {};
    if (letterMap.size > 0) extraContent.letters = Array.from(letterMap.values());
    if (soundMap.size > 0) extraContent.sounds = Array.from(soundMap.values());
    if (blendingMap.size > 0) extraContent.blending_words = Array.from(blendingMap.values());
    if (sightWordMap.size > 0) extraContent.sight_words = Array.from(sightWordMap.values());
    if (keyWordMap.size > 0) extraContent.key_words = Array.from(keyWordMap.values());
    if (keyPhraseMap.size > 0) extraContent.key_phrases = Array.from(keyPhraseMap.values());
    if (compQuestions.length > 0) extraContent.comprehension_questions = compQuestions;
    if (storySummary) extraContent.story_summary = storySummary;
    if (grammarRulesMap.size > 0) extraContent.grammar_rules = Array.from(grammarRulesMap.values());
    if (examplesList.length > 0) extraContent.examples = examplesList;
    if (practiceList.length > 0) extraContent.practice_sentences = practiceList;

    return c.json({ data: {
      unit_number: num,
      unit_title: finalUnitTitle || (num === 0 ? 'Welcome' : `Unit ${num}`),
      vocab: cleanedVocab,
      patterns: cleanPatterns,
      grammar: cleanGrammar,
      extra_content: extraContent,
      schema_type: schema.type || 'general_english',
      dimensions: schema.dimensions || ['vocab', 'patterns', 'grammar'],
      pages_saved: pagesSaved
    }});
  } catch (err) {
    return c.json({ error: { code: 'LLM_ERROR', message: `AI 识别失败: ${err.message}` } }, 502);
  }
});

// ============================================================
// 单元管理 (Admin 直接增删改 textbook_units 列表,无须经 AI)
// ============================================================

// ---- 教材库管理 (的管理 textbooks 列表) ----

// POST /books-manage — 新增教材
// Body: { code, name, series, level, publisher, total_units, description, content_schema }
textbooks.post('/books-manage', async (c) => {
  const DB = c.env.DB;
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, 400); }
  if (!body.code || !body.name) return c.json({ error: { code: 'BAD_REQUEST', message: 'code 和 name 必填' } }, 400);

  const existing = await DB.prepare('SELECT id FROM textbooks WHERE code = ?').bind(body.code).first();
  if (existing) return c.json({ error: { code: 'CONFLICT', message: `code ${body.code} 已存在` } }, 409);

  const structType = body.structure_type
    || (body.content_schema && typeof body.content_schema === 'object' ? body.content_schema.structure_type : null)
    || (body.code?.startsWith('WE-') ? 'lesson' : 'unit');

  let schemaObj = {};
  if (body.content_schema) {
    schemaObj = typeof body.content_schema === 'object' ? { ...body.content_schema } : JSON.parse(body.content_schema || '{}');
  } else if (body.name?.toLowerCase().includes('phonics') || body.code?.toLowerCase().includes('phonics')) {
    schemaObj = { ...DEFAULT_CONTENT_SCHEMAS.phonics };
  } else {
    schemaObj = { ...DEFAULT_CONTENT_SCHEMAS.general_english };
  }
  schemaObj.structure_type = structType;
  const schemaJson = JSON.stringify(schemaObj);

  const r = await DB.prepare(
    `INSERT INTO textbooks (code, name, series, level, publisher, total_units, description, content_schema, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(body.code, body.name, body.series || '未分类系列', body.level || null, body.publisher || null, body.total_units || 8, body.description || null, schemaJson).run();

  const bookId = r.meta?.last_row_id;
  const totalUnits = parseInt(body.total_units) || 8;
  const prefix = structType === 'lesson' ? 'Lesson' : structType === 'chapter' ? 'Chapter' : structType === 'story' ? 'Story' : 'Unit';

  // 自动为新教材创建 1 ~ totalUnits 初始目录 (支持 Unit / Lesson / Chapter 等不同命名体系)
  try {
    for (let u = 1; u <= totalUnits; u++) {
      await DB.prepare(
        `INSERT INTO textbook_units (textbook_id, textbook_code, unit_number, unit_title, lesson_count, is_active)
         VALUES (?, ?, ?, ?, 1, 1)`
      ).bind(bookId, body.code, u, `${prefix} ${u}`).run();
    }
  } catch (err) {
    console.warn('初始化单元大纲警告:', err.message);
  }

  return c.json({ data: { action: 'inserted', code: body.code, id: bookId, units_created: totalUnits, structure_type: structType } });
});

// POST /init-units/:code — 一键补全/初始化教材的所有单元/课时
textbooks.post('/init-units/:code', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  let body = {};
  try { body = await c.req.json(); } catch {}

  const book = await DB.prepare('SELECT id, name, total_units, content_schema FROM textbooks WHERE code = ?').bind(code).first();
  if (!book) return c.json({ error: { code: 'NOT_FOUND', message: '教材不存在' } }, 404);

  const total = book.total_units || 8;
  let savedStruct = null;
  if (book.content_schema) {
    try { savedStruct = JSON.parse(book.content_schema).structure_type; } catch (_) {}
  }
  const structType = body.structure_type || savedStruct || (code.startsWith('WE-') ? 'lesson' : 'unit');
  const prefix = structType === 'lesson' ? 'Lesson' : structType === 'chapter' ? 'Chapter' : structType === 'story' ? 'Story' : 'Unit';
  
  let added = 0;
  for (let u = 1; u <= total; u++) {
    const exists = await DB.prepare('SELECT id FROM textbook_units WHERE textbook_code = ? AND unit_number = ?').bind(code, u).first();
    if (!exists) {
      await DB.prepare(
        `INSERT INTO textbook_units (textbook_id, textbook_code, unit_number, unit_title, lesson_count, is_active)
         VALUES (?, ?, ?, ?, 1, 1)`
      ).bind(book.id, code, u, `${prefix} ${u}`).run();
      added++;
    }
  }
  return c.json({ data: { code, added, total, structure_type: structType } });
});

// PATCH /books-manage/:code — 改教材元数据
// Body: { name?, series?, level?, publisher?, total_units?, description?, content_schema?, is_active? }
textbooks.patch('/books-manage/:code', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, 400); }

  const book = await DB.prepare('SELECT id FROM textbooks WHERE code = ?').bind(code).first();
  if (!book) return c.json({ error: { code: 'NOT_FOUND', message: '教材不存在' } }, 404);

  const schemaJson = body.content_schema !== undefined
    ? (typeof body.content_schema === 'object' ? JSON.stringify(body.content_schema) : body.content_schema)
    : null;

  await DB.prepare(
    `UPDATE textbooks SET
       name = COALESCE(?, name),
       series = COALESCE(?, series),
       level = COALESCE(?, level),
       publisher = COALESCE(?, publisher),
       total_units = COALESCE(?, total_units),
       description = COALESCE(?, description),
       content_schema = COALESCE(?, content_schema),
       is_active = COALESCE(?, is_active)
     WHERE id = ?`
  ).bind(body.name ?? null, body.series ?? null, body.level ?? null, body.publisher ?? null,
        body.total_units ?? null, body.description ?? null,
        schemaJson,
        body.is_active ?? null, book.id).run();

  return c.json({ data: { action: 'updated', code } });
});

// DELETE /books-manage/:code — 删整本教材 (textbook_units 和 unit_content 通过 ON DELETE CASCADE 一起删)
textbooks.delete('/books-manage/:code', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  await DB.prepare('DELETE FROM textbooks WHERE code = ?').bind(code).run();
  return c.json({ data: { action: 'deleted', code } });
});

// ---- 单元管理 (Admin 直接增删改 textbook_units 列表,无须经 AI) ----

// GET /unit-pages/:code/:num — 列出某 unit 在 R2 的所有页面图 (用于家长端 feedback 与后台工作台显示)
// 返回 [{ key, url, page_num, size, uploaded }]
textbooks.get('/unit-pages/:code/:num', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));
  if (!R2) return c.json({ error: { code: 'NOT_CONFIGURED', message: 'TEXTBOOKS_R2 未配置' } }, 500);

  // 扫描两种可能的前缀: 标准目录前缀 `${code}/Unit${num}/` 与扁平前缀 `${code}/Unit${num}_`
  const prefix1 = `${code}/Unit${num}/`;
  const prefix2 = `${code}/Unit${num}_`;
  
  const [res1, res2] = await Promise.all([
    R2.list({ prefix: prefix1, limit: 100 }),
    R2.list({ prefix: prefix2, limit: 100 })
  ]);

  const allObjs = [...(res1.objects || []), ...(res2.objects || [])];
  // 过滤出图片文件 (.png, .jpg, .webp)
  const imgObjs = allObjs.filter(o => /\.(png|jpg|jpeg|webp)$/i.test(o.key));

  const pageMap = new Map();
  imgObjs.forEach(o => {
    const m = o.key.match(/page[_-](\d+)\.(png|jpg|jpeg|webp)$/i);
    const pageNum = m ? parseInt(m[1]) : 0;
    if (pageNum > 0 && !pageMap.has(pageNum)) {
      pageMap.set(pageNum, {
        key: o.key,
        page_num: pageNum,
        size: o.size,
        uploaded: o.uploaded?.toISOString?.() || null
      });
    }
  });

  const items = Array.from(pageMap.values()).sort((a, b) => a.page_num - b.page_num);
  const origin = new URL(c.req.url).origin;
  const baseUrl = `${origin}/api/v1/textbooks/page-img/${code}/${num}`;
  
  return c.json({ data: {
    textbook_code: code,
    unit_number: num,
    pages: items.map(it => {
      const v = it.uploaded ? new Date(it.uploaded).getTime() : Date.now();
      return {
        ...it,
        url: `${baseUrl}/${it.page_num}?key=${encodeURIComponent(it.key)}&v=${v}`
      };
    })
  }});
});

// GET /page-img/:code/:num/:page — 获取 R2 里某 unit 的指定页面图 (公开访问, 跨课时多重 Fallback 兼容)
textbooks.get('/page-img/:code/:num/:page', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));
  const page = parseInt(c.req.param('page'));
  if (!R2) return c.json({ error: { code: 'NOT_CONFIGURED', message: 'R2 未配置' } }, 500);

  const queryKey = c.req.query('key');
  let obj = null;
  const candidateKeys = [];
  if (queryKey) {
    obj = await R2.get(queryKey);
  }

  // 1. 优先检索当前 Unit 目录
  if (!obj) {
    const exts = ['.jpg', '.jpeg', '.png', '.webp'];
    for (const ext of exts) {
      candidateKeys.push(`${code}/Unit${num}/page-${String(page).padStart(2, '0')}${ext}`);
      candidateKeys.push(`${code}/Unit${num}/page-${page}${ext}`);
      candidateKeys.push(`${code}/Unit${num}_page-${String(page).padStart(2, '0')}${ext}`);
      candidateKeys.push(`${code}/Unit${num}_page-${page}${ext}`);
      candidateKeys.push(`${code}/Unit${num}/page_${page}${ext}`);
      candidateKeys.push(`${code}/Unit${num}/page_${String(page).padStart(2, '0')}${ext}`);
    }

    for (const k of candidateKeys) {
      obj = await R2.get(k);
      if (obj) break;
    }
  }

  // 2. 跨 Lesson 智能回退: 教师上课常跨相连课时 (如选了 Lesson 13, 但上课页码 68-69 属于 Lesson 12)
  if (!obj && !isNaN(num)) {
    const exts = ['.jpg', '.jpeg', '.png', '.webp'];
    const neighborUnits = [num - 1, num + 1, num - 2, num + 2].filter(n => n >= 0);
    for (const n of neighborUnits) {
      for (const ext of exts) {
        const k1 = `${code}/Unit${n}/page-${String(page).padStart(2, '0')}${ext}`;
        const k2 = `${code}/Unit${n}/page-${page}${ext}`;
        const k3 = `${code}/Unit${n}_page-${String(page).padStart(2, '0')}${ext}`;
        const k4 = `${code}/Unit${n}_page-${page}${ext}`;
        obj = (await R2.get(k1)) || (await R2.get(k2)) || (await R2.get(k3)) || (await R2.get(k4));
        if (obj) break;
      }
      if (obj) break;
    }
  }

  // 3. 全书前缀模糊扫描回退 (确保全书任意页码在任何 Unit 参数下都能准确命中)
  if (!obj) {
    try {
      const listRes = await R2.list({ prefix: `${code}/`, limit: 500 });
      const pageRegex = new RegExp(`page[_-]0*${page}\\.(png|jpg|jpeg|webp)$`, 'i');
      const matched = (listRes.objects || []).find(o => pageRegex.test(o.key));
      if (matched) {
        obj = await R2.get(matched.key);
      }
    } catch {}
  }

  if (!obj) {
    return c.json({ error: { code: 'NOT_FOUND', message: `图片不存在 (已检索 ${candidateKeys.join(', ')})` } }, 404);
  }

  const ct = obj.httpMetadata?.contentType || (obj.key?.endsWith('.png') ? 'image/png' : 'image/jpeg');
  return new Response(obj.body, {
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'no-cache, must-revalidate',
      'ETag': `"${obj.httpEtag || obj.version || Date.now()}"`,
      'Access-Control-Allow-Origin': '*'
    }
  });
});

// GET /page-img/:code/:page — 直接按教材与页码获取切图 (不需要知道在哪个 Unit)
textbooks.get('/page-img/:code/:page', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  const code = c.req.param('code');
  const page = parseInt(c.req.param('page'));
  if (!R2) return c.json({ error: { code: 'NOT_CONFIGURED', message: 'R2 未配置' } }, 500);

  const exts = ['.jpg', '.jpeg', '.png', '.webp'];
  let obj = null;

  // 尝试在所有 Unit 中检索该页码
  try {
    const listRes = await R2.list({ prefix: `${code}/`, limit: 500 });
    const pageRegex = new RegExp(`page[_-]0*${page}\\.(png|jpg|jpeg|webp)$`, 'i');
    const matched = (listRes.objects || []).find(o => pageRegex.test(o.key));
    if (matched) {
      obj = await R2.get(matched.key);
    }
  } catch {}

  if (!obj) {
    return c.json({ error: { code: 'NOT_FOUND', message: `全书未找到第 ${page} 页切图` } }, 404);
  }

  const ct = obj.httpMetadata?.contentType || (obj.key?.endsWith('.png') ? 'image/png' : 'image/jpeg');
  return new Response(obj.body, {
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'no-cache, must-revalidate',
      'ETag': `"${obj.httpEtag || obj.version || Date.now()}"`,
      'Access-Control-Allow-Origin': '*'
    }
  });
});

// POST /delete-r2-key — 按精确 Key 删除 R2 对象
textbooks.post('/delete-r2-key', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  if (!R2) return c.json({ error: { code: 'NOT_CONFIGURED', message: 'R2 未配置' } }, 500);
  let body = {};
  try { body = await c.req.json(); } catch {}
  if (!body.key) return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing key' } }, 400);

  try {
    await R2.delete(body.key);
    return c.json({ data: { success: true, key: body.key } });
  } catch (err) {
    return c.json({ error: { code: 'R2_ERROR', message: err.message } }, 500);
  }
});

// POST /put-r2-object — 上传单个 R2 对象 (用于迁移同步)
textbooks.post('/put-r2-object', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  if (!R2) return c.json({ error: { code: 'NOT_CONFIGURED', message: 'R2 未配置' } }, 500);
  const formData = await c.req.formData();
  const file = formData.get('file');
  const key = formData.get('key');
  if (!key || !file) return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing key or file' } }, 400);

  const arrayBuffer = await file.arrayBuffer();
  await R2.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type || (key.endsWith('.jpg') || key.endsWith('.jpeg') ? 'image/jpeg' : key.endsWith('.png') ? 'image/png' : 'application/octet-stream') }
  });

  return c.json({ data: { success: true, key, size: arrayBuffer.byteLength } });
});

// DELETE /unit-pages/:code/:num — 一键清空某 unit 在 R2 的所有切图
textbooks.delete('/unit-pages/:code/:num', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));
  if (!R2) return c.json({ error: { code: 'NOT_CONFIGURED', message: 'R2 未配置' } }, 500);

  const prefix1 = `${code}/Unit${num}/`;
  const prefix2 = `${code}/Unit${num}_`;
  const [res1, res2] = await Promise.all([
    R2.list({ prefix: prefix1, limit: 100 }),
    R2.list({ prefix: prefix2, limit: 100 })
  ]);
  const allObjs = [...(res1.objects || []), ...(res2.objects || [])];
  
  for (const obj of allObjs) {
    try { await R2.delete(obj.key); } catch {}
  }

  return c.json({ data: { success: true, deleted_count: allObjs.length } });
});

// DELETE /page-img/:code/:num/:page — 删除单张切图 (工作台管理)
textbooks.delete('/page-img/:code/:num/:page', async (c) => {
  const R2 = c.env.TEXTBOOKS_R2;
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));
  const page = parseInt(c.req.param('page'));
  if (!R2) return c.json({ error: { code: 'NOT_CONFIGURED', message: 'R2 未配置' } }, 500);

  const exts = ['.jpg', '.jpeg', '.png', '.webp'];
  const candidateKeys = [];
  for (const ext of exts) {
    candidateKeys.push(`${code}/Unit${num}/page-${String(page).padStart(2, '0')}${ext}`);
    candidateKeys.push(`${code}/Unit${num}/page-${page}${ext}`);
    candidateKeys.push(`${code}/Unit${num}_page-${String(page).padStart(2, '0')}${ext}`);
    candidateKeys.push(`${code}/Unit${num}_page-${page}${ext}`);
  }

  for (const k of candidateKeys) {
    try { await R2.delete(k); } catch(e) {}
  }

  return c.json({ data: { deleted: true, textbook_code: code, unit_number: num, page } });
});

// GET /units-manage/:code — 列出该书所有 unit
textbooks.get('/units-manage/:code', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  const r = await DB.prepare(
    `SELECT id, unit_number, unit_title, is_active, lesson_count,
            (SELECT COUNT(*) FROM unit_content WHERE unit_id = textbook_units.id) AS content_count
     FROM textbook_units WHERE textbook_code = ? ORDER BY unit_number ASC`
  ).bind(code).all();
  return c.json({ data: { textbook_code: code, units: r.results || [] } });
});

// POST /units-manage/:code — 新增/更新一行 unit
// Body: { unit_number, unit_title, lesson_count, is_active }
// 如果 unit_number 已存在 → UPDATE; 否则 INSERT
textbooks.post('/units-manage/:code', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, 400); }

  const num = parseInt(body.unit_number);
  if (isNaN(num)) return c.json({ error: { code: 'BAD_REQUEST', message: 'unit_number required' } }, 400);

  // 先查这本书的 textbook_id
  const book = await DB.prepare('SELECT id FROM textbooks WHERE code = ?').bind(code).first();
  if (!book) return c.json({ error: { code: 'NOT_FOUND', message: '教材不存在' } }, 404);

  const existing = await DB.prepare(
    'SELECT id FROM textbook_units WHERE textbook_code = ? AND unit_number = ?'
  ).bind(code, num).first();

  if (existing) {
    await DB.prepare(
      `UPDATE textbook_units SET unit_title = ?, lesson_count = ?, is_active = ? WHERE id = ?`
    ).bind(body.unit_title || null, body.lesson_count || 1, body.is_active === false ? 0 : 1, existing.id).run();
    return c.json({ data: { action: 'updated', unit_number: num } });
  } else {
    const r = await DB.prepare(
      `INSERT INTO textbook_units (textbook_id, textbook_code, unit_number, unit_title, lesson_count, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(book.id, code, num, body.unit_title || null, body.lesson_count || 1, body.is_active === false ? 0 : 1).run();
    return c.json({ data: { action: 'inserted', unit_number: num, id: r.meta?.last_row_id } });
  }
});

// PATCH /units-manage/:code/:num — 改 unit_number / unit_title / lesson_count / is_active
// Body: { new_unit_number?, unit_title?, lesson_count?, is_active? }
textbooks.patch('/units-manage/:code/:num', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  const oldNum = parseInt(c.req.param('num'));
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, 400); }

  const unit = await DB.prepare(
    'SELECT id FROM textbook_units WHERE textbook_code = ? AND unit_number = ?'
  ).bind(code, oldNum).first();
  if (!unit) return c.json({ error: { code: 'NOT_FOUND', message: 'Unit 不存在' } }, 404);

  // 如果改 unit_number,要确认新数值不冲突
  if (body.new_unit_number != null && body.new_unit_number !== oldNum) {
    const conflict = await DB.prepare(
      'SELECT id FROM textbook_units WHERE textbook_code = ? AND unit_number = ? AND id != ?'
    ).bind(code, parseInt(body.new_unit_number), unit.id).first();
    if (conflict) return c.json({ error: { code: 'CONFLICT', message: `Unit ${body.new_unit_number} 已存在` } }, 409);

    await DB.prepare(
      'UPDATE textbook_units SET unit_number = ?, unit_title = COALESCE(?, unit_title), lesson_count = COALESCE(?, lesson_count), is_active = COALESCE(?, is_active) WHERE id = ?'
    ).bind(parseInt(body.new_unit_number), body.unit_title ?? null, body.lesson_count ?? null, body.is_active ?? null, unit.id).run();
  } else {
    await DB.prepare(
      'UPDATE textbook_units SET unit_title = COALESCE(?, unit_title), lesson_count = COALESCE(?, lesson_count), is_active = COALESCE(?, is_active) WHERE id = ?'
    ).bind(body.unit_title ?? null, body.lesson_count ?? null, body.is_active ?? null, unit.id).run();
  }

  return c.json({ data: { action: 'updated', unit_number: body.new_unit_number ?? oldNum } });
});

// DELETE /units-manage/:code/:num — 删单个 unit
textbooks.delete('/units-manage/:code/:num', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));

  await DB.prepare(
    'DELETE FROM unit_content WHERE textbook_code = ? AND unit_number = ?'
  ).bind(code, num).run();

  await DB.prepare(
    'DELETE FROM textbook_units WHERE textbook_code = ? AND unit_number = ?'
  ).bind(code, num).run();

  // 重新计算并更新教材的 total_units
  const maxUnit = await DB.prepare(
    'SELECT MAX(unit_number) as max_u FROM textbook_units WHERE textbook_code = ?'
  ).bind(code).first();
  await DB.prepare(
    'UPDATE textbooks SET total_units = COALESCE(?, 0), updated_at = datetime("now") WHERE code = ?'
  ).bind(maxUnit?.max_u ?? 0, code).run();

  return c.json({ data: { action: 'deleted', unit_number: num } });
});

// POST /units-manage/:code/batch-delete — 批量删除或清空单元
textbooks.post('/units-manage/:code/batch-delete', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');
  let body = {};
  try { body = await c.req.json(); } catch {}

  if (body.clear_all) {
    await DB.prepare('DELETE FROM unit_content WHERE textbook_code = ?').bind(code).run();
    await DB.prepare('DELETE FROM textbook_units WHERE textbook_code = ?').bind(code).run();
    await DB.prepare('UPDATE textbooks SET total_units = 0, updated_at = datetime("now") WHERE code = ?').bind(code).run();
    return c.json({ data: { action: 'cleared_all', textbook_code: code } });
  }

  const unitNums = Array.isArray(body.unit_numbers) ? body.unit_numbers.map(n => parseInt(n)).filter(n => !isNaN(n)) : [];
  if (unitNums.length === 0) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'No unit_numbers provided' } }, 400);
  }

  for (const num of unitNums) {
    await DB.prepare('DELETE FROM unit_content WHERE textbook_code = ? AND unit_number = ?').bind(code, num).run();
    await DB.prepare('DELETE FROM textbook_units WHERE textbook_code = ? AND unit_number = ?').bind(code, num).run();
  }

  const maxUnit = await DB.prepare(
    'SELECT MAX(unit_number) as max_u FROM textbook_units WHERE textbook_code = ?'
  ).bind(code).first();
  await DB.prepare(
    'UPDATE textbooks SET total_units = COALESCE(?, 0), updated_at = datetime("now") WHERE code = ?'
  ).bind(maxUnit?.max_u ?? 0, code).run();

  return c.json({ data: { action: 'batch_deleted', unit_numbers: unitNums } });
});

// ============================================================
// POST /preview-book/:code — 整本书图片 → AI 识别 → 返回 array (不写库)
// 用途: Admin 整本书模式"AI 识别"按钮 — 先输出到前端校对,确认后才保存
// Form: images[] (多页图片)
// ============================================================
textbooks.post('/preview-book/:code', async (c) => {
  const formData = await c.req.formData();
  const images = formData.getAll('images').filter(f => f && f.name);

  if (images.length === 0) return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing images[]' } }, 400);

  // R2 路径: ${code}/Unit${num}/page-${batchStart+i+1}.png
  // 需要 batchStart 参数告知当前是第几页起, 让整本书模式下图片按 page 编号保存
  const batchStart = parseInt(c.req.query('batch_start') || '0');

  try {
    const bookContent = await callLLMWithImages(c, images, { bookMode: true, maxPages: 8 });
    if (!Array.isArray(bookContent)) {
      return c.json({ error: { code: 'LLM_PARSE_ERROR', message: 'LLM 返回不是 unit 数组', _raw: JSON.stringify(bookContent).substring(0, 300) } }, 502);
    }

    // 把这次上传的 PDF 页图保存到 R2, 按 unit 分组 (简单策略: 按 batch_start 起,平均分给每个识别到的 unit)
    // 因为 AI 返回的是 unit 数组不知道哪页属于哪个,
    // 实务策略: 我们就把所有页存到 "当前批次所在 unit" 目录下 (按 unit 数量平均分)
    const R2 = c.env.TEXTBOOKS_R2;
    if (R2) {
      const images_arr = Array.isArray(images) ? images : [images];
      const pagesPerUnit = Math.ceil(images_arr.length / bookContent.length);
      let pageIdx = 0;
      for (const u of bookContent) {
        for (let j = 0; j < pagesPerUnit && pageIdx < images_arr.length; j++) {
          const f = images_arr[pageIdx];
          const buf = await f.arrayBuffer();
          const key = `${code}/Unit${u.unit_number}/page-${String(batchStart + pageIdx + 1).padStart(2,'0')}.png`;
          await R2.put(key, buf, { httpMetadata: { contentType: f.type || 'image/png' } });
          pageIdx++;
        }
      }
    }

    return c.json({ data: { units: bookContent, pages_sent: images.length, pages_saved_to_r2: images.length } });
  } catch (err) {
    return c.json({ error: { code: 'LLM_ERROR', message: err.message } }, 502);
  }
});

// ============================================================
// POST /upload-unit-slices/:code/:num — 仅上传保存单单元的切片原图到 R2 (不调用 LLM)
// ============================================================
textbooks.post('/upload-unit-slices/:code/:num', async (c) => {
  const code = c.req.param('code');
  const num = parseInt(c.req.param('num'));
  let formData;
  try { formData = await c.req.formData(); } catch { return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid form data' } }, 400); }

  const images = formData.getAll ? formData.getAll('images').filter(f => f && f.name) : [];
  const R2 = c.env.TEXTBOOKS_R2;
  let pagesSaved = 0;

  if (R2 && images.length > 0) {
    // 自动清理当前单元旧切片，杜绝不同偏移量或旧切图残留混杂
    try {
      const prefix1 = `${code}/Unit${num}/`;
      const prefix2 = `${code}/Unit${num}_`;
      const [res1, res2] = await Promise.all([
        R2.list({ prefix: prefix1, limit: 100 }),
        R2.list({ prefix: prefix2, limit: 100 })
      ]);
      const oldObjs = [...(res1.objects || []), ...(res2.objects || [])];
      for (const o of oldObjs) {
        try { await R2.delete(o.key); } catch {}
      }
    } catch (cleanErr) {
      console.warn('Failed to clean old unit slices:', cleanErr);
    }

    const images_arr = Array.isArray(images) ? images : [images];
    pagesSaved = images_arr.length;
    for (let i = 0; i < images_arr.length; i++) {
      const f = images_arr[i];
      const buf = await f.arrayBuffer();
      const key = `${code}/Unit${num}/${f.name || `page-${String(i + 1).padStart(2, '0')}.jpg`}`;
      await R2.put(key, buf, { httpMetadata: { contentType: f.type || 'image/jpeg' } });
    }
  }

  return c.json({ success: true, data: { unit_number: num, pages_saved: pagesSaved } });
});

// ============================================================
// POST /commit-units/:code — 接收校对后的 unit array → 写入 D1
// Body JSON: { units: [{unit_number, unit_title, vocab, patterns, grammar}, ...] }
// 用途: Admin 校对完点"确认保存到此 unit"
// ============================================================
textbooks.post('/commit-units/:code', async (c) => {
  const DB = c.env.DB;
  const code = c.req.param('code');

  try {
    let body;
    try { body = await c.req.json(); } catch { return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, 400); }

    const rawUnits = Array.isArray(body.units) ? body.units : (Array.isArray(body) ? body : null);
    if (!rawUnits) return c.json({ error: { code: 'BAD_REQUEST', message: 'Expected { units: [...] } body' } }, 400);

    // 查这本书基本信息（获取 textbook.id 避免 NOT NULL 约束失败）
    const book = await DB.prepare('SELECT id FROM textbooks WHERE code = ?').bind(code).first();
    if (!book) {
      return c.json({ error: { code: 'NOT_FOUND', message: `教材 ${code} 不存在` } }, 404);
    }

    // 查这本书所有 unit 列表 (含 Welcome=0)
    const dbUnits = await DB.prepare(`
      SELECT id, unit_number FROM textbook_units WHERE textbook_code = ? ORDER BY unit_number ASC
    `).bind(code).all();
    const unitMap = new Map();
    (dbUnits.results || []).forEach(u => unitMap.set(Number(u.unit_number), u.id));

    const written = [];
    const skipped = [];
    for (const item of rawUnits) {
      const uNum = parseInt(item.unit_number, 10);
      if (isNaN(uNum)) {
        skipped.push({ item, reason: 'Invalid unit_number' });
        continue;
      }

      let unitId = unitMap.get(uNum);
      if (!unitId) {
        // 先查一次该 unit 是否其实已经存在于数据库 (防御并发或脏数据)
        const existingUnit = await DB.prepare(
          `SELECT id FROM textbook_units WHERE textbook_code = ? AND unit_number = ?`
        ).bind(code, uNum).first();

        if (existingUnit) {
          unitId = existingUnit.id;
        } else {
          // 动态自动为该教材新增此课时/单元，必须提供 textbook_id
          await DB.prepare(
            `INSERT OR IGNORE INTO textbook_units (textbook_id, textbook_code, unit_number, unit_title) VALUES (?, ?, ?, ?)`
          ).bind(book.id, code, uNum, item.unit_title || `Unit ${uNum}`).run();

          const freshUnit = await DB.prepare(
            `SELECT id FROM textbook_units WHERE textbook_code = ? AND unit_number = ?`
          ).bind(code, uNum).first();
          unitId = freshUnit?.id;
        }

        if (unitId) {
          unitMap.set(uNum, unitId);
        }
      }

      if (!unitId) {
        console.error(`Failed to resolve unitId for book ${code} unit ${uNum}`);
        skipped.push({ unit_number: uNum, reason: 'Could not resolve unit ID' });
        continue;
      }

      const { cleanedVocab, extraSentences } = cleanVocabList(item.vocab || []);
      const cleanPatterns = cleanPatternList(item.patterns || [], extraSentences);
      const cleanGrammar = cleanGrammarList(item.grammar || []);

      const vocab = JSON.stringify(cleanedVocab);
      const patterns = JSON.stringify(cleanPatterns);
      const grammar = JSON.stringify(cleanGrammar);

      // 提取并持久化起止页码、偏移量等元数据至 extra_content
      let extraObj = {};
      try {
        extraObj = (typeof item.extra_content === 'object' && item.extra_content !== null)
          ? { ...item.extra_content }
          : JSON.parse(item.extra_content || '{}');
      } catch {}

      if (item.page_from !== undefined && item.page_from !== null) extraObj.page_from = parseInt(item.page_from, 10);
      if (item.page_to !== undefined && item.page_to !== null) extraObj.page_to = parseInt(item.page_to, 10);
      if (item.page_offset !== undefined && item.page_offset !== null) extraObj.page_offset = parseInt(item.page_offset, 10);
      const extraContent = JSON.stringify(extraObj);

      const existing = await DB.prepare('SELECT id, vocab, patterns, grammar, extra_content FROM unit_content WHERE unit_id = ?').bind(unitId).first();
      if (existing) {
        let mergedExtra = extraObj;
        if (existing.extra_content) {
          try {
            const oldExtra = JSON.parse(existing.extra_content);
            mergedExtra = { ...oldExtra, ...extraObj };
          } catch {}
        }
        const finalExtra = JSON.stringify(mergedExtra);

        // 如果新传入的 vocab 为空但数据库已有提取数据，则保留数据库现有内容并运行清洗管道
        const keepExisting = (!item.vocab || item.vocab.length === 0) && existing.vocab && existing.vocab !== '[]';
        let finalVocab = vocab;
        let finalPatterns = patterns;
        let finalGrammar = grammar;

        if (keepExisting) {
          try {
            const oldV = JSON.parse(existing.vocab || '[]');
            const oldP = JSON.parse(existing.patterns || '[]');
            const oldG = JSON.parse(existing.grammar || '[]');
            const { cleanedVocab: cV, extraSentences: eS } = cleanVocabList(oldV);
            finalVocab = JSON.stringify(cV);
            finalPatterns = JSON.stringify(cleanPatternList(oldP, eS));
            finalGrammar = JSON.stringify(cleanGrammarList(oldG));
          } catch {
            finalVocab = existing.vocab;
            finalPatterns = existing.patterns;
            finalGrammar = existing.grammar;
          }
        }

        await DB.prepare(
          `UPDATE unit_content SET vocab = ?, patterns = ?, grammar = ?, extra_content = ?, updated_at = datetime('now') WHERE unit_id = ?`
        ).bind(finalVocab, finalPatterns, finalGrammar, finalExtra, unitId).run();
      } else {
        await DB.prepare(
          `INSERT INTO unit_content (unit_id, textbook_code, unit_number, vocab, patterns, grammar, extra_content, extracted_by, extracted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'outline', datetime('now'))`
        ).bind(unitId, code, uNum, vocab, patterns, grammar, extraContent).run();
      }

      // 同步更新 textbook_units.unit_title (AI 识别的真实标题优先, 用户校对后可覆盖原 DB 预填标题)
      // 注意: textbook_units 表没有 updated_at 字段,只用 unit_title 列
      if (item.unit_title) {
        await DB.prepare(
          `UPDATE textbook_units SET unit_title = ? WHERE id = ?`
        ).bind(item.unit_title, unitId).run();
      }

      written.push({ unit_number: uNum, unit_title: item.unit_title, vocab_count: (item.vocab || []).length, patterns_count: (item.patterns || []).length });
    }

    // 更新 textbooks.total_units
    const validUnitNums = written.map(w => w.unit_number).filter(n => typeof n === 'number' && !isNaN(n));
    const maxUnit = validUnitNums.length > 0 ? Math.max(...validUnitNums, 0) : 0;
    if (maxUnit > 0) {
      await DB.prepare('UPDATE textbooks SET total_units = MAX(total_units, ?), updated_at = datetime("now") WHERE id = ?')
        .bind(maxUnit, book.id).run();
    }

    return c.json({ data: { textbook_code: code, units_received: rawUnits.length, units_written: written.length, units_skipped: skipped, written } });
  } catch (err) {
    console.error('commit-units error:', err);
    return c.json({ error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// ============================================================
// 🤖 POST /detect-toc/:code — 智能教材目录与分页识别
// 接收：FormData (可选 images 数组, 可选 toc_text) 或 JSON
// 输出：{ data: { units: [{ unit_number, unit_title, page_from, page_to }] } }
// ============================================================
textbooks.post('/detect-toc/:code', async (c) => {
  const code = c.req.param('code');
  const contentType = c.req.header('content-type') || '';

  let body = {};
  let tocText = '';
  let tocImages = [];
  let userBaseUrl = c.req.header('x-llm-base-url') || '';
  let userApiKey = c.req.header('x-llm-api-key') || '';
  let userModel = c.req.header('x-llm-model') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.parseBody({ all: true });
    body = formData || {};
    tocText = (formData.toc_text || '').toString();
    userBaseUrl = (formData.llm_base_url || userBaseUrl).toString();
    userApiKey = (formData.llm_api_key || userApiKey).toString();
    userModel = (formData.llm_model || userModel).toString();

    const rawImages = formData['images'] || formData['images[]'] || [];
    const imgList = Array.isArray(rawImages) ? rawImages : [rawImages];
    for (const item of imgList) {
      if (item && typeof item === 'object' && typeof item.arrayBuffer === 'function') {
        const buf = await item.arrayBuffer();
        const base64 = bufferToBase64(buf);
        const mime = item.type || 'image/jpeg';
        tocImages.push(`data:${mime};base64,${base64}`);
      }
    }
  } else {
    try {
      body = await c.req.json();
      tocText = body.toc_text || body.text || '';
      if (Array.isArray(body.images)) tocImages = body.images;
      userBaseUrl = body.llm_base_url || userBaseUrl;
      userApiKey = body.llm_api_key || userApiKey;
      userModel = body.llm_model || userModel;
    } catch (e) {
      body = {};
    }
  }

  const baseUrl = userBaseUrl || c.env.LLM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  const apiKey = userApiKey || c.env.LLM_API_KEY;
  const model = userModel || c.env.LLM_MODEL || 'meta/llama-3.2-11b-vision-instruct';

  if (!apiKey) {
    return c.json({ error: { code: 'CONFIG_ERROR', message: 'LLM API key is not configured' } }, 400);
  }

  const DB = c.env.DB;
  const book = await DB.prepare('SELECT name, series, content_schema FROM textbooks WHERE code = ?').bind(code).first();
  let structType = 'unit';
  if (body?.structure_type) {
    structType = body.structure_type;
  } else if (book?.content_schema) {
    try {
      const cs = JSON.parse(book.content_schema);
      if (cs.structure_type) structType = cs.structure_type;
    } catch (_) {}
  } else if (code.startsWith('WE-') || code.includes('WE')) {
    structType = 'lesson';
  }

  const prefix = structType === 'lesson' ? 'Lesson' : (structType === 'chapter' ? 'Chapter' : (structType === 'story' ? 'Story' : 'Unit'));
  const example1 = structType === 'lesson' ? 'Lesson 1: Short a' : 'Unit 1: Aa · Bb · Cc';
  const example2 = structType === 'lesson' ? 'Lesson 2: Short e' : 'Unit 2: Dd · Ee · Ff';

  const prompt = `You are an expert OCR and educational textbook Table of Contents (Contents / Syllabus) reader.
Carefully read the provided Table of Contents image for "${book?.name || code}".

This textbook is organized by ${prefix} (e.g. ${prefix} 1, ${prefix} 2, etc.).

CRITICAL OCR READING INSTRUCTIONS:
1. READ ONLY WHAT IS ACTUALLY PRINTED IN THE IMAGE.
   Do not guess, do not hallucinate, and do not copy content from other books.
2. Read each row/entry from top to bottom (if multi-column or multi-page, read the left column/page first, then the right):
   - On the left of the row: the badge or title (e.g. "${prefix} 1", "${prefix} 2", "Review 1", "Progress Test", etc.).
   - In the middle: the exact letters or topic title text printed on that row.
   - On the far right: the printed starting page number for that specific row (e.g. 4, 12, 20...).
3. Fields to extract for each row:
   - "unit_number": The integer number (1 for ${prefix} 1, 2 for ${prefix} 2, etc. Use 0 for an intro/starter song if present).
   - "unit_title": The full title text (e.g. "${example1}", "${example2}", "Review 1"). Do NOT use "Lesson" unless the book explicitly says "Lesson"!
   - "page_from": The starting page number on the right of this row.
   - "page_to": The page number right before the next row starts. For the final row, page_from + 7.

Extract ALL rows visible in the Table of Contents image (typically 8 to 20 items). Do NOT stop early.

Return strict JSON only matching:
{
  "units": [
    { "unit_number": 1, "unit_title": "${example1}", "page_from": 4, "page_to": 11 }
  ]
}`;

  const userContent = [{ type: 'text', text: prompt }];
  if (tocText) {
    userContent.push({ type: 'text', text: `Extracted TOC Text from PDF:\n\n${tocText}` });
  }
  // NVIDIA NIM strictly allows at most 1 image per request
  for (const imgUrl of tocImages.slice(0, 1)) {
    userContent.push({ type: 'image_url', image_url: { url: imgUrl } });
  }

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a precise educational textbook TOC parser. You must return valid JSON strictly conforming to the requested schema.' },
          { role: 'user', content: userContent }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 3000
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return c.json({ error: { code: 'LLM_ERROR', message: `LLM error: ${errText.substring(0, 200)}` } }, 500);
    }

    const data = await resp.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    const parsed = cleanAndParseJson(rawContent);

function parseTocFromTextOrMarkdown(text) {
  if (!text || typeof text !== 'string') return [];
  const units = [];

  // Pattern 1: **Title** \n * Page From: X \n * Page To: Y
  const regex1 = /\*\*\s*(.+?)\s*\*\*\s*[\r\n]+\s*\*+\s*Page From:\s*(\d+)(?:\s*[\r\n]+\s*\*+\s*Page To:\s*(\d+))?/gi;
  let match;
  let idx = 1;
  while ((match = regex1.exec(text)) !== null) {
    const rawTitle = match[1].trim();
    const pFrom = parseInt(match[2], 10);
    const pTo = match[3] ? parseInt(match[3], 10) : pFrom + 5;
    const numMatch = rawTitle.match(/(?:Lesson|Unit)\s*(\d+)/i);
    const unitNum = numMatch ? parseInt(numMatch[1], 10) : idx;
    units.push({
      unit_number: unitNum,
      unit_title: rawTitle,
      page_from: pFrom,
      page_to: pTo
    });
    idx++;
  }
  if (units.length > 0) return units;

  // Pattern 2: - Prefix X: Title ... page Y / (Y - Z)
  const regex2 = /(?:^|\n)[*\-•]\s*(?:(Unit|Lesson|Chapter)\s*(\d+)[:.\s]*)?([^\n\r]+?)(?:[：:\s\-]+(?:page|p\.?|第)?\s*(\d+))/gi;
  while ((match = regex2.exec(text)) !== null) {
    const num = match[2] ? parseInt(match[2], 10) : idx;
    const title = match[3].trim();
    const pFrom = parseInt(match[4], 10);
    if (pFrom && title) {
      units.push({
        unit_number: num,
        unit_title: title.startsWith(prefix) ? title : `${prefix} ${num}: ${title}`,
        page_from: pFrom,
        page_to: pFrom + 5
      });
      idx++;
    }
  }
  return units;
}

    let resultUnits = (parsed && Array.isArray(parsed.units)) ? parsed.units : (Array.isArray(parsed) ? parsed : []);
    if (resultUnits.length === 0) {
      resultUnits = parseTocFromTextOrMarkdown(rawContent);
    }
    resultUnits = resultUnits.map((u, i) => {
      const pFrom = parseInt(u.page_from, 10) || 1;
      let pTo = parseInt(u.page_to, 10) || (pFrom + 7);
      if (pTo < pFrom) pTo = pFrom + 3;
      let rawTitle = (u.unit_title || `${prefix} ${u.unit_number || i + 1}`).trim();
      if (structType === 'unit') {
        rawTitle = rawTitle.replace(/^Lesson\s*\d+\s*[:：.]\s*\*?Unit\s*/i, 'Unit ');
        rawTitle = rawTitle.replace(/^Lesson\s*\d+\s*[:：.]\s*/i, 'Unit ');
        rawTitle = rawTitle.replace(/^Lesson\s*$/i, `Unit ${u.unit_number || i + 1}`);
        if (rawTitle.toLowerCase().startsWith('lesson')) {
          rawTitle = rawTitle.replace(/^lesson/i, 'Unit');
        }
      }
      return {
        unit_number: u.unit_number !== undefined ? parseInt(u.unit_number, 10) : i + 1,
        unit_title: rawTitle,
        page_from: pFrom,
        page_to: pTo
      };
    });

    resultUnits = resultUnits.filter(u => {
      const t = (u.unit_title || '').toLowerCase();
      return !t.includes('<actual title') && !t.includes('<title>');
    });

    resultUnits.sort((a, b) => a.page_from - b.page_from);

    // 核心自动校准：后一课若在 next.page_from 开始，当前课必在 (next.page_from - 1) 结束，绝不重叠！
    for (let i = 0; i < resultUnits.length - 1; i++) {
      const cur = resultUnits[i];
      const next = resultUnits[i + 1];
      if (next.page_from > cur.page_from) {
        cur.page_to = next.page_from - 1;
      }
    }

    return c.json({
      success: true,
      data: {
        units: resultUnits,
        raw: rawContent
      }
    });
  } catch (err) {
    return c.json({ error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});


// ============================================================
// 📊 GET /progress/:studentId — 获取学生教材学习进度
// ============================================================
textbooks.get('/progress/:studentId', async (c) => {
  const DB = c.env.DB;
  const studentId = parseInt(c.req.param('studentId'), 10);
  if (!studentId) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '需要有效的 studentId' } }, 400);
  }

  let progressList = [];
  try {
    const rows = await DB.prepare(`
      SELECT stp.*, t.name as textbook_name, t.series, t.level, t.total_units
      FROM student_textbook_progress stp
      LEFT JOIN textbooks t ON (t.code = stp.textbook_code OR t.id = stp.textbook_id)
      WHERE stp.student_id = ?
      ORDER BY stp.updated_at DESC
    `).bind(studentId).all();
    progressList = rows.results || [];
  } catch (err) {
    console.warn('读取 student_textbook_progress 失败:', err.message);
  }

  // 智能兜底：从 classes 历史数据动态汇总已学教材与单元
  if (progressList.length === 0) {
    try {
      const classRows = await DB.prepare(`
        SELECT
          COALESCE(NULLIF(textbook_code, ''), NULLIF(fb_lesson_level, '')) as tb_code,
          MAX(COALESCE(unit_number, fb_unit, 1)) as max_unit,
          MAX(COALESCE(fb_lesson, 1)) as max_lesson,
          COUNT(*) as done_count,
          MIN(date) as first_date,
          MAX(date) as last_date
        FROM classes
        WHERE student_id = ? AND status = 'completed' AND (textbook_code IS NOT NULL OR fb_lesson_level IS NOT NULL)
        GROUP BY tb_code
      `).bind(studentId).all();

      for (const cr of (classRows.results || [])) {
        if (!cr.tb_code) continue;
        const tb = await DB.prepare('SELECT id, name, series, level, total_units FROM textbooks WHERE code = ? LIMIT 1').bind(cr.tb_code).first();
        progressList.push({
          id: null,
          student_id: studentId,
          textbook_id: tb ? tb.id : null,
          textbook_code: cr.tb_code,
          textbook_name: tb ? tb.name : cr.tb_code,
          series: tb ? tb.series : null,
          level: tb ? tb.level : null,
          total_units: tb ? (tb.total_units || 8) : 8,
          current_unit: cr.max_unit || 1,
          current_lesson: cr.max_lesson || 1,
          total_classes_done: cr.done_count || 0,
          status: 'in_progress',
          started_at: cr.first_date,
          updated_at: cr.last_date
        });
      }
    } catch (e) {
      console.warn('从 classes 聚合进度失败:', e.message);
    }
  }

  return c.json({ data: progressList });
});

// ============================================================
// 📊 POST /progress — 手动设置/调整学生教材进度
// ============================================================
textbooks.post('/progress', async (c) => {
  const DB = c.env.DB;
  const body = await c.req.json();
  const studentId = parseInt(body.student_id, 10);
  const textbookCode = String(body.textbook_code || '').trim();
  const currentUnit = parseInt(body.current_unit, 10) || 1;
  const currentLesson = parseInt(body.current_lesson, 10) || 1;
  const status = body.status || 'in_progress';
  const notes = body.notes || '';

  if (!studentId || !textbookCode) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '缺少 student_id 或 textbook_code' } }, 400);
  }

  const tb = await DB.prepare('SELECT id FROM textbooks WHERE code = ? LIMIT 1').bind(textbookCode).first();
  const tbId = tb ? tb.id : null;

  const existing = await DB.prepare(
    'SELECT id FROM student_textbook_progress WHERE student_id = ? AND textbook_code = ?'
  ).bind(studentId, textbookCode).first();

  if (existing) {
    await DB.prepare(`
      UPDATE student_textbook_progress
      SET textbook_id = ?, current_unit = ?, current_lesson = ?, status = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(tbId, currentUnit, currentLesson, status, notes, existing.id).run();
  } else {
    await DB.prepare(`
      INSERT INTO student_textbook_progress (student_id, textbook_id, textbook_code, current_unit, current_lesson, total_classes_done, status, notes, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))
    `).bind(studentId, tbId, textbookCode, currentUnit, currentLesson, status, notes).run();
  }

  return c.json({ data: { success: true } });
});

// ============================================================
// 📋 & 🧠 GET /preview-nudge/:studentId — 课前预习清单 & 课后微复习
// ============================================================
textbooks.get('/preview-nudge/:studentId', async (c) => {
  const DB = c.env.DB;
  const studentId = parseInt(c.req.param('studentId'), 10);
  if (!studentId) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '需要有效的 studentId' } }, 400);
  }

  // 1. 最新一节已完成的课程
  const lastCompletedClass = await DB.prepare(`
    SELECT id, date, start_time, teacher, textbook_code, unit_number,
           fb_unit, fb_lesson, fb_lesson_level, fb_vocab, fb_patterns, fb_grammar,
           fb_teacher_message, fb_homework, fb_next_preview, next_textbook_code, next_unit_number,
           page_from, page_to, next_page_from, next_page_to
    FROM classes
    WHERE student_id = ? AND status = 'completed'
    ORDER BY date DESC, start_time DESC
    LIMIT 1
  `).bind(studentId).first();

  // 2. 下一节待上课程
  const nextScheduledClass = await DB.prepare(`
    SELECT id, date, start_time, end_time, teacher, textbook_code, unit_number, page_from, page_to, class_link
    FROM classes
    WHERE student_id = ? AND status = 'scheduled' AND date >= date('now', '-1 day')
    ORDER BY date ASC, start_time ASC
    LIMIT 1
  `).bind(studentId).first();

  // ── A. 课前预习清单 ──
  let preview = null;
  let targetCode = null;
  let targetUnit = null;
  let targetPageFrom = null;
  let targetPageTo = null;

  const completedUnit = lastCompletedClass ? parseInt(lastCompletedClass.unit_number || lastCompletedClass.fb_unit || '0', 10) : 0;
  const completedCode = lastCompletedClass ? (lastCompletedClass.textbook_code || lastCompletedClass.fb_lesson_level) : null;

  if (nextScheduledClass && nextScheduledClass.textbook_code) {
    // 1. 排课记录中已指定教材
    targetCode = nextScheduledClass.textbook_code;
    targetUnit = nextScheduledClass.unit_number || null;
    targetPageFrom = nextScheduledClass.page_from || null;
    targetPageTo = nextScheduledClass.page_to || null;
  } else if (lastCompletedClass && (lastCompletedClass.next_unit_number || lastCompletedClass.next_textbook_code || lastCompletedClass.next_page_from)) {
    // 2. 老师在上一节课反馈中指定的下节预习教材、单元或页码
    targetCode = lastCompletedClass.next_textbook_code || completedCode;
    targetUnit = lastCompletedClass.next_unit_number || null;
    targetPageFrom = lastCompletedClass.next_page_from || null;
    targetPageTo = lastCompletedClass.next_page_to || null;
  } else if (lastCompletedClass) {
    targetCode = completedCode;
    // 3. 检查老师是否在自定义备注中写了页码或单元
    const pageMatch = (lastCompletedClass.fb_next_preview || '').match(/(?:Pages?|P\.?)\s*(\d+)\s*[-~至到]\s*(\d+)/i);
    if (pageMatch) {
      targetPageFrom = parseInt(pageMatch[1], 10);
      targetPageTo = parseInt(pageMatch[2], 10);
    }
    const noteMatch = (lastCompletedClass.fb_next_preview || '').match(/(?:Next:?\s*(?:Unit|Lesson)\s*|Unit\s*|Lesson\s*)(\d+)/i);
    if (noteMatch) {
      targetUnit = parseInt(noteMatch[1], 10);
    } else if (!targetPageFrom) {
      // 4. 默认兜底：若老师未单独指定页码，顺延至下一单元 (+1)
      targetUnit = completedUnit > 0 ? completedUnit + 1 : 1;
    }
  } else {
    // 5. 检查学生教材进度表兜底
    try {
      const progress = await DB.prepare(`
        SELECT textbook_code, current_unit
        FROM student_textbook_progress
        WHERE student_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `).bind(studentId).first();
      if (progress) {
        targetCode = progress.textbook_code;
        targetUnit = (progress.current_unit || 0) + 1;
      } else if (nextScheduledClass && nextScheduledClass.textbook_code) {
        targetCode = nextScheduledClass.textbook_code;
        targetUnit = 1;
      }
    } catch (_) {}
  }

  // 🎯 若已知精确预习起始页，优先通过页码反查其所属单元
  if (targetPageFrom && targetCode && !targetUnit) {
    try {
      const uRow = await DB.prepare(`
        SELECT tu.unit_number
        FROM textbook_units tu
        JOIN textbooks t ON tu.textbook_id = t.id
        WHERE t.code = ? AND tu.page_start <= ? AND (tu.page_end IS NULL OR tu.page_end >= ?)
        ORDER BY tu.unit_number ASC
        LIMIT 1
      `).bind(targetCode, targetPageFrom, targetPageFrom).first();
      if (uRow && uRow.unit_number) {
        targetUnit = uRow.unit_number;
      }
    } catch (_) {}
  }
  if (!targetUnit && completedUnit > 0) {
    targetUnit = completedUnit;
  }

  // ⭐ 核心防重保护：若没有指定精确页码，且目标单元小于或等于刚完成的已结课单元，则顺延至下一单元
  if (!targetPageFrom && completedUnit > 0 && targetCode && targetCode === completedCode && (!targetUnit || targetUnit <= completedUnit)) {
    targetUnit = completedUnit + 1;
  }

  if (targetCode && targetUnit) {
    let uc = await DB.prepare(`
      SELECT uc.vocab, uc.patterns, uc.grammar, tu.unit_title, t.name as textbook_name
      FROM unit_content uc
      LEFT JOIN textbook_units tu ON uc.unit_id = tu.id
      LEFT JOIN textbooks t ON tu.textbook_id = t.id
      WHERE (uc.textbook_code = ? OR t.code = ?) AND uc.unit_number = ?
      LIMIT 1
    `).bind(targetCode, targetCode, targetUnit).first();

    if (!uc && targetUnit > 1) {
      // 若已超过最后一单元，尝试查询该教材最后一单元作为兜底
      const lastUc = await DB.prepare(`
        SELECT uc.vocab, uc.patterns, uc.grammar, tu.unit_title, t.name as textbook_name, uc.unit_number
        FROM unit_content uc
        LEFT JOIN textbook_units tu ON uc.unit_id = tu.id
        LEFT JOIN textbooks t ON tu.textbook_id = t.id
        WHERE (uc.textbook_code = ? OR t.code = ?)
        ORDER BY uc.unit_number DESC
        LIMIT 1
      `).bind(targetCode, targetCode).first();
      if (lastUc) {
        uc = lastUc;
        targetUnit = lastUc.unit_number;
      }
    }

    let vocabList = [];
    let patternsList = [];
    if (uc) {
      try { vocabList = JSON.parse(uc.vocab || '[]'); } catch (_) {}
      try { patternsList = JSON.parse(uc.patterns || '[]'); } catch (_) {}
    }

    // ⭐ 按照页码范围对词汇和句型进行精准裁剪
    let pageFilteredVocab = vocabList;
    let pageFilteredPatterns = patternsList;

    if (targetPageFrom || targetPageTo) {
      const pFrom = targetPageFrom || 1;
      const pTo = targetPageTo || 999;
      const filteredV = vocabList.filter(v => {
        if (v.page === undefined || v.page === null) return true;
        return v.page >= pFrom && v.page <= pTo;
      });
      if (filteredV.length > 0) pageFilteredVocab = filteredV;

      const filteredP = patternsList.filter(p => {
        if (typeof p === 'object' && p.page !== undefined && p.page !== null) {
          return p.page >= pFrom && p.page <= pTo;
        }
        return true;
      });
      if (filteredP.length > 0) pageFilteredPatterns = filteredP;
    }

    // 老师预告文案
    let teacherNote = lastCompletedClass ? lastCompletedClass.fb_next_preview : null;
    if (!teacherNote) {
      const isLesson = targetCode.startsWith('WE-') || (uc?.unit_title && uc.unit_title.toLowerCase().startsWith('lesson'));
      const pfx = isLesson ? 'Lesson' : 'Unit';
      const pageInfo = (targetPageFrom && targetPageTo) ? `Pages ${targetPageFrom}-${targetPageTo}` : (targetPageFrom ? `Page ${targetPageFrom}` : `${pfx} ${targetUnit}`);
      teacherNote = `${pageInfo}: Learn target vocabulary and practice sentence patterns.`;
    }

    preview = {
      has_preview: true,
      textbook_code: targetCode,
      textbook_name: uc ? uc.textbook_name : targetCode,
      unit_number: targetUnit,
      unit_title: uc ? uc.unit_title : `Unit ${targetUnit}`,
      page_from: targetPageFrom,
      page_to: targetPageTo,
      next_class_date: nextScheduledClass ? nextScheduledClass.date : null,
      next_class_time: nextScheduledClass ? `${nextScheduledClass.start_time} - ${nextScheduledClass.end_time}` : null,
      teacher_preview_note: teacherNote,
      vocab_preview: pageFilteredVocab.slice(0, 6),
      patterns_preview: pageFilteredPatterns.slice(0, 3),
      tip: '不需要提前背诵，和宝贝一起混个脸熟，上课更有自信哦 😊'
    };
  }

  // ── B. 课后 2 分钟亲子微复习 ──
  let review = null;
  if (lastCompletedClass) {
    let reviewWords = [];
    let reviewPatterns = [];

    if (lastCompletedClass.fb_vocab) {
      reviewWords = lastCompletedClass.fb_vocab.split(/[\n,，、]+/).map(w => w.trim()).filter(Boolean);
    }
    if (lastCompletedClass.fb_patterns) {
      reviewPatterns = lastCompletedClass.fb_patterns.split(/[\n;；]+/).map(p => p.trim()).filter(Boolean);
    }

    if (reviewWords.length === 0 && (lastCompletedClass.textbook_code || lastCompletedClass.fb_lesson_level)) {
      const code = lastCompletedClass.textbook_code || lastCompletedClass.fb_lesson_level;
      const unit = lastCompletedClass.unit_number || lastCompletedClass.fb_unit || 1;
      const uc = await DB.prepare(`
        SELECT vocab, patterns FROM unit_content WHERE textbook_code = ? AND unit_number = ? LIMIT 1
      `).bind(code, unit).first();
      if (uc) {
        try {
          const v = JSON.parse(uc.vocab || '[]');
          reviewWords = v.slice(0, 4).map(item => item.word + (item.translation ? ` (${item.translation})` : ''));
        } catch (_) {}
      }
    }

    if (reviewWords.length > 0 || (lastCompletedClass.fb_teacher_message && lastCompletedClass.fb_teacher_message.length > 0)) {
      review = {
        has_review: true,
        last_class_date: lastCompletedClass.date,
        textbook_code: lastCompletedClass.textbook_code || lastCompletedClass.fb_lesson_level,
        unit_number: lastCompletedClass.unit_number || lastCompletedClass.fb_unit,
        nudge_title: '🚗 课后 2 分钟亲子互动',
        nudge_prompt: '下班接宝贝的路上，或者今晚睡前，试着玩个快问快答吧：',
        words: reviewWords.slice(0, 4),
        patterns: reviewPatterns.slice(0, 2),
        homework: lastCompletedClass.fb_homework || null
      };
    }
  }

  return c.json({
    data: {
      preview,
      review
    }
  });
});

export default textbooks;

