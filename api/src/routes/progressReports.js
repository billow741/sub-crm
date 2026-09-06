import { Hono } from 'hono';
import { success, error, calculatePagination } from '../utils/response.js';
import { validate, validateParams, idParamSchema } from '../utils/validation.js';
import { z } from 'zod';

const progressReports = new Hono();

// 获取学生里程碑统计数据（辅助生成报告）
progressReports.get('/stats/:student_id', async (c) => {
  const DB = c.env.DB;
  const studentId = c.req.param('student_id');

  const student = await DB.prepare('SELECT id, name, english_name, grade, total_hours, used_hours FROM students WHERE id = ?').bind(studentId).first();
  if (!student) return c.json(error('NOT_FOUND', '学员不存在'), 404);

  // 统计已完成的正式课程
  const completedClasses = await DB.prepare(`
    SELECT id, date, start_time, textbook_code, unit_number, fb_unit, fb_lesson, fb_vocab, fb_pronunciation_errors, fb_teacher_message
    FROM classes
    WHERE student_id = ? AND status = 'completed' AND is_trial = 0
    ORDER BY date ASC, start_time ASC
  `).bind(studentId).all();

  const classList = completedClasses.results || [];
  const completedCount = classList.length;

  // 统计词汇量（从各节课的 fb_vocab 提取不重复单词数）
  const wordSet = new Set();
  classList.forEach(cls => {
    if (cls.fb_vocab) {
      const words = cls.fb_vocab.split(/[\n,，、;；/]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 1 && !/^[0-9]+$/.test(w));
      words.forEach(w => wordSet.add(w));
    }
  });

  // 统计已生成的里程碑报告
  const existingReports = await DB.prepare(`
    SELECT id, report_type, created_at FROM progress_reports WHERE student_id = ?
  `).bind(studentId).all();

  const reportsMap = {};
  (existingReports.results || []).forEach(r => {
    reportsMap[r.report_type] = r;
  });

  return c.json(success({
    student,
    completed_count: completedCount,
    vocabulary_count: wordSet.size,
    sample_words: Array.from(wordSet).slice(0, 30),
    reports_map: reportsMap
  }));
});

// 获取学生的阶段报告
progressReports.get('/', async (c) => {
  const DB = c.env.DB;
  const studentId = c.req.query('student_id');
  const teacherId = c.req.query('teacher_id');
  const classId = c.req.query('class_id');
  const page = c.req.query('page') || '1';
  const pageSize = c.req.query('page_size') || '50';

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (studentId) {
    whereClause += ' AND pr.student_id = ?';
    params.push(parseInt(studentId));
  }
  if (teacherId) {
    whereClause += ' AND pr.teacher_id = ?';
    params.push(parseInt(teacherId));
  }
  if (classId) {
    whereClause += ' AND pr.class_id = ?';
    params.push(parseInt(classId));
  }

  const countResult = await DB.prepare(`SELECT COUNT(*) as total FROM progress_reports pr ${whereClause}`).bind(...params).first();
  const total = countResult?.total || 0;
  const pagination = calculatePagination(page, pageSize, total);

  const results = await DB.prepare(`
    SELECT pr.*, s.name as student_name, t.name as teacher_name
    FROM progress_reports pr
    LEFT JOIN students s ON pr.student_id = s.id
    LEFT JOIN teachers t ON pr.teacher_id = t.id
    ${whereClause}
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pagination.page_size, pagination.offset).all();

  const data = results.results?.map(r => ({
    id: r.id,
    student_id: r.student_id,
    student_name: r.student_name,
    class_id: r.class_id,
    report_type: r.report_type,
    teacher_id: r.teacher_id,
    teacher_name: r.teacher_name || r.teacher_name,
    summary: r.summary,
    strengths: r.strengths,
    improvements: r.improvements,
    recommendation: r.recommendation,
    teacher_message: r.teacher_message,
    from_level: r.from_level,
    to_level: r.to_level,
    total_lessons_completed: r.total_lessons_completed || 0,
    vocabulary_count: r.vocabulary_count || 0,
    score_listening: r.score_listening || 5,
    score_speaking: r.score_speaking || 5,
    score_interaction: r.score_interaction || 5,
    score_pronunciation: r.score_pronunciation || 5,
    highlight_recording_url: r.highlight_recording_url,
    badge_name: r.badge_name,
    stage_growth_insights: r.stage_growth_insights,
    radar_scores: r.radar_scores,
    next_phase_strategy: r.next_phase_strategy,
    status: r.status,
    organization_id: r.organization_id,
    created_at: r.created_at,
    updated_at: r.updated_at
  })) || [];

  return c.json(success({ data, pagination }));
});

// 获取单个报告
progressReports.get('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  const r = await DB.prepare(`
    SELECT pr.*, s.name as student_name, t.name as teacher_name
    FROM progress_reports pr
    LEFT JOIN students s ON pr.student_id = s.id
    LEFT JOIN teachers t ON pr.teacher_id = t.id
    WHERE pr.id = ?
  `).bind(id).first();

  if (!r) return c.json(error('NOT_FOUND', '报告不存在'), 404);

  return c.json(success({
    id: r.id,
    student_id: r.student_id,
    student_name: r.student_name,
    class_id: r.class_id,
    report_type: r.report_type,
    teacher_id: r.teacher_id,
    teacher_name: r.teacher_name || r.teacher_name,
    summary: r.summary,
    strengths: r.strengths,
    improvements: r.improvements,
    recommendation: r.recommendation,
    teacher_message: r.teacher_message,
    from_level: r.from_level,
    to_level: r.to_level,
    total_lessons_completed: r.total_lessons_completed || 0,
    vocabulary_count: r.vocabulary_count || 0,
    score_listening: r.score_listening || 5,
    score_speaking: r.score_speaking || 5,
    score_interaction: r.score_interaction || 5,
    score_pronunciation: r.score_pronunciation || 5,
    highlight_recording_url: r.highlight_recording_url,
    badge_name: r.badge_name,
    stage_growth_insights: r.stage_growth_insights,
    radar_scores: r.radar_scores,
    next_phase_strategy: r.next_phase_strategy,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
});

// AI 自动生成里程碑评估报告 Schema
const aiGenerateSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  milestone_type: z.enum(['milestone_10', 'milestone_30', 'milestone_60', 'milestone_100', 'level_up']),
  class_id: z.coerce.number().int().positive().optional().nullable(),
  teacher_id: z.coerce.number().int().positive().optional().nullable()
});

progressReports.post('/ai-generate', validate(aiGenerateSchema), async (c) => {
  try {
    const DB = c.env.DB;
    const { student_id, milestone_type, class_id, teacher_id } = c.req.validated;

  const student = await DB.prepare('SELECT id, name, english_name, grade, status FROM students WHERE id = ?').bind(student_id).first();
  if (!student) return c.json(error('NOT_FOUND', 'Student not found'), 404);
  if (student.status === 'graduated') {
    return c.json(error('STUDENT_GRADUATED', 'The student has graduated. Milestone reports cannot be generated for graduated students.'), 400);
  }

  // Determine target lesson count
  let targetLessons = 10;
  let badgeName = '🥉 Rising Star';
  let stageLabel = '10 Lessons Adaptation & Habit Stage';
  if (milestone_type === 'milestone_30') {
    targetLessons = 30;
    badgeName = '🥈 Steady Leaper';
    stageLabel = '30 Lessons Vocabulary Expansion & Sentence Building Stage';
  } else if (milestone_type === 'milestone_60') {
    targetLessons = 60;
    badgeName = '🥇 Semester Pioneer';
    stageLabel = '60 Lessons Comprehensive Semester Fluency Stage';
  } else if (milestone_type === 'milestone_100') {
    targetLessons = 100;
    badgeName = '💎 Century Club';
    stageLabel = '100 Lessons Century Club Mastery & Autonomous Expression Stage';
  } else if (milestone_type === 'level_up') {
    badgeName = '🎓 Level Up';
    stageLabel = 'Curriculum Level Up Transition Stage';
  }

  // Fetch up to targetLessons formal completed classes
  const classesResult = await DB.prepare(`
    SELECT id, date, start_time, textbook_code, unit_number, fb_unit, fb_lesson,
           fb_vocab, fb_patterns, fb_grammar, fb_pronunciation_errors, fb_grammar_errors, fb_teacher_message, fb_homework
    FROM classes
    WHERE student_id = ? AND status = 'completed' AND is_trial = 0
    ORDER BY date ASC, start_time ASC
    LIMIT ?
  `).bind(student_id, targetLessons).all();

  const classList = classesResult.results || [];
  const actualCount = classList.length;

  // Extract vocabulary, frequencies, sentences, pronunciation history, teacher notes
  const wordFreqMap = {};
  const allVocabSet = new Set();
  const practicedSentences = [];
  const pronunciationHistory = [];
  const grammarHistory = [];
  const teacherNotes = [];
  const textbookSet = new Set();

  classList.forEach(cls => {
    if (cls.textbook_code) textbookSet.add(cls.textbook_code);
    if (cls.fb_vocab) {
      const words = cls.fb_vocab.split(/[\n,，、;；/]+/)
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 1 && !/^[0-9]+$/.test(w));
      words.forEach(w => {
        allVocabSet.add(w);
        wordFreqMap[w] = (wordFreqMap[w] || 0) + 1;
      });
    }
    const sentenceRaw = (cls.fb_patterns || '') + '\n' + (cls.fb_grammar || '');
    if (sentenceRaw.trim()) {
      const sents = sentenceRaw.split(/[\n;；]+/).map(s => s.trim()).filter(s => s.length > 3);
      sents.forEach(s => {
        if (!practicedSentences.includes(s) && practicedSentences.length < 25) {
          practicedSentences.push(s);
        }
      });
    }
    if (cls.fb_pronunciation_errors) {
      try {
        const errs = JSON.parse(cls.fb_pronunciation_errors);
        if (Array.isArray(errs)) {
          errs.forEach(e => {
            if (e && (e.wrong || e.right)) {
              pronunciationHistory.push({ wrong: e.wrong || '', right: e.right || '' });
            }
          });
        }
      } catch(e) {}
    }
    if (cls.fb_grammar_errors) {
      try {
        const gErrs = JSON.parse(cls.fb_grammar_errors);
        if (Array.isArray(gErrs)) {
          gErrs.forEach(e => {
            if (e && (e.wrong || e.right)) {
              grammarHistory.push({ wrong: e.wrong || '', right: e.right || '' });
            }
          });
        }
      } catch(e) {}
    }
    if (cls.fb_teacher_message && cls.fb_teacher_message.trim().length > 5) {
      teacherNotes.push({ date: cls.date, text: cls.fb_teacher_message.trim() });
    }
  });

  const allVocab = Array.from(allVocabSet);
  const frequentWords = Object.entries(wordFreqMap)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  const displayName = student.english_name ? `${student.name} (${student.english_name})` : student.name;
  const textbooks = Array.from(textbookSet);

  // Try calling LLM
  let generatedData = null;
  let isFromLLM = false;

  try {
    const baseUrl = c.req.header('x-llm-base-url') || c.env.LLM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    const apiKey = c.req.header('x-llm-api-key') || c.env.LLM_API_KEY;
    const preferredModel = c.req.header('x-llm-model') || c.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct';

    if (apiKey) {
      const systemPrompt = `You are a Senior ESL Pedagogical Director and Educational Psychologist at SunnyBridge Academy. 
Your task is to analyze a student's milestone data and generate a highly professional, pedagogically sound Milestone Stage Assessment Report in JSON format.

CRITICAL OBJECTIVE:
Parents do not want a mere summary of past classes. They need "commercial delivery value" — a deep, macro-level analysis of their child's cognitive and linguistic growth, learning capabilities, and a personalized strategic roadmap for the next stage. 

INSTRUCTIONS:
1. Stage Growth Insights: Analyze the student's linguistic progress from an ESL pedagogy perspective. Do not just list words learned. Explain *how* they are developing (e.g., transitioning from single-word recall to spontaneous phrasing, improved phonemic awareness, cognitive connections).
2. Learning Capability Radar: Evaluate the student across 5 key dimensions (Phonics, Vocabulary Retention, Spontaneous Speaking, Listening Comprehension, Classroom Engagement) using a 1-100 scale. Base this deeply on the teacher notes and pronunciation history.
3. Next-Phase Personalized Strategy: Create 2 actionable, structured goals for the next milestone. Explicitly tie these goals to the student's current "improvements" (weaknesses) and provide an action plan.
4. Tone: Authoritative, empathetic, and inspiring. Use professional pedagogical terminology (e.g., "scaffolding," "lexical retention") but explain it so parents understand the immense value of the tutoring.
5. Strict JSON Output: You must return ONLY valid JSON matching the exact schema below. Do not output markdown code blocks, do not include any conversational text.

JSON SCHEMA:
{
  "summary": "String. A high-level overview of the student's milestone progress and learning attitude.",
  "stage_growth_insights": "String. Deep pedagogical analysis of cognitive and linguistic development. Show parents why this progress matters.",
  "strengths": ["Array of Strings. 3-4 specific strengths citing actual data."],
  "improvements": ["Array of Strings. 2-3 specific areas for improvement."],
  "next_phase_strategy": [
    {
      "goal": "String. Specific actionable goal for the next stage.",
      "rationale": "String. Why this goal is chosen based on the student's 'improvements' area.",
      "action_plan": "String. What the teacher will do in class to achieve this."
    }
  ],
  "radar_scores": {
    "phonics": 0,
    "vocabulary_retention": 0,
    "spontaneous_speaking": 0,
    "listening_comprehension": 0,
    "classroom_engagement": 0
  },
  "recommendation": "String. General advice for parents to support learning at home.",
  "teacher_message": "String. A warm, encouraging message directed directly to the student.",
  "score_listening": 0,
  "score_speaking": 0,
  "score_interaction": 0,
  "score_pronunciation": 0,
  "badge_name": "String. A fun, descriptive title for the student (e.g., 'Phonics Master')."
}`;

      const userPrompt = `Please generate the JSON report based on the following student data.

<student_profile>
Name: ${displayName}
Grade/Age: ${student.grade || 'Primary'}
Stage: ${stageLabel}
Completed Lessons: ${actualCount || targetLessons} lessons
</student_profile>

<curriculum_data>
Textbooks Studied: ${textbooks.join(', ') || 'Core ESL Curriculum'}
Cumulative Unique Vocabulary: ${allVocab.slice(0, 35).join(', ')}
High-Frequency Core Words: ${frequentWords.slice(0, 15).join(', ')}
Practiced Sentence Structures:
${practicedSentences.slice(0, 12).map(s => `- ${s}`).join('\n') || '- Interactive Q&A and target sentence frames'}
</curriculum_data>

<performance_data>
Pronunciation History (Wrong -> Corrected):
${pronunciationHistory.slice(0, 8).map(p => `- Corrected "${p.wrong}" -> "${p.right}"`).join('\n') || '- Foundational phonics sounds drilled'}

Teacher Notes Timeline (Chronological):
${teacherNotes.slice(0, 6).map(n => `- [${n.date}] ${n.text}`).join('\n') || '- Smooth engagement in all sessions'}
</performance_data>

Remember: Output ONLY valid JSON matching the schema defined in the system prompt.`;

      const candidateModels = [
        preferredModel,
        'nvidia/nemotron-3-ultra-550b-a55b',
        'nvidia/nemotron-4-340b-instruct',
        'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        'meta/llama-3.2-11b-vision-instruct',
        'meta/llama-3.1-8b-instruct'
      ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);
      for (const m of candidateModels) {
        try {
          const resp = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.3,
              max_tokens: 2048
            })
          });

          if (resp.ok) {
            const data = await resp.json();
            const rawContent = data.choices?.[0]?.message?.content || '';
            const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            const target = fenceMatch ? fenceMatch[1] : rawContent;
            const jsonMatch = target.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.summary && parsed.strengths) {
                generatedData = parsed;
                isFromLLM = true;
                break;
              }
            }
          }
        } catch(e) {
          console.warn(`LLM model ${m} failed:`, e.message);
        }
      }
    }
  } catch(llmErr) {
    console.warn('LLM generation error:', llmErr.message);
  }

  // Fallback heuristic generator if LLM was unreachable or invalid
  if (!generatedData) {
    const vocabSample = frequentWords.slice(0, 5).join(', ') || allVocab.slice(0, 5).join(', ') || 'essential everyday words';
    const sentSample = practicedSentences.slice(0, 2).join('; ') || 'target unit conversation patterns';
    const errSample = pronunciationHistory.length > 0
      ? pronunciationHistory.slice(0, 3).map(e => `"${e.right}"`).join(', ')
      : 'vowel length and consonant endings';

    generatedData = {
      summary: `Over the course of completing ${actualCount || targetLessons} formal 1-on-1 English lessons, ${displayName} has demonstrated consistent growth, expanding communicative confidence and foundational comprehension. From initial guided responses, ${displayName} now navigates interactive classroom routines with high focus, having actively acquired over ${allVocab.length} cumulative vocabulary words across ${textbooks.length ? textbooks.join(', ') : 'our core curriculum'}.`,
      stage_growth_insights: `The student is successfully transitioning from receptive vocabulary recognition to active spontaneous usage. They are demonstrating stronger phonemic awareness and can now connect individual sounds to construct full words independently.`,
      strengths: [
        `Demonstrates solid retention of core vocabulary, readily recognizing words such as ${vocabSample}.`,
        `Actively applies learned sentence structures (${sentSample}) during teacher-led guided conversations.`,
        `Shows enthusiastic classroom engagement and receptive phonics imitation during read-aloud activities.`
      ],
      improvements: [
        `Continue refining natural pronunciation flow and clarity on target sounds (e.g., sound precision in ${errSample}).`,
        `Encourage answering in full, multi-word sentences rather than single-word prompts to strengthen spontaneous syntax.`
      ],
      next_phase_strategy: [
        {
          goal: "Master short vowel precision and CVC blending.",
          rationale: "Consistent phonics foundational skills reduce pronunciation errors and build reading confidence.",
          action_plan: "Teacher will incorporate 3-minute phonics drills at the start of each session."
        },
        {
          goal: "Transition to spontaneous full-sentence responses.",
          rationale: "To move beyond single-word answers, structured scaffolding is required.",
          action_plan: "Teacher will use the 'I say, you say' method with expanded sentence frames."
        }
      ],
      radar_scores: {
        phonics: 85,
        vocabulary_retention: 90,
        spontaneous_speaking: 80,
        listening_comprehension: 95,
        classroom_engagement: 90
      },
      recommendation: `Advance to the subsequent curriculum units with structured daily 10-minute listening repetition. Reinforce sight words and target vocabulary from this stage to solidify Pre-A1/A1 conversational fluency.`,
      teacher_message: `Congratulations on reaching your ${targetLessons}-lesson milestone! Your positive attitude, resilience, and curiosity make every lesson a joy. We celebrate how far you have come and look forward to your continued brilliance!`,
      score_listening: 5,
      score_speaking: 5,
      score_interaction: 5,
      score_pronunciation: 4,
      badge_name: badgeName
    };
  }

    const normalizeBulletList = (val) => {
      if (Array.isArray(val)) {
        return val.map(item => (typeof item === 'string' && (item.startsWith('•') || item.startsWith('-') || item.startsWith('*'))) ? item : `• ${item}`).join('\n');
      }
      return typeof val === 'string' ? val : '';
    };
    const normalizeParagraph = (val) => {
      if (Array.isArray(val)) {
        return val.join('\n\n');
      }
      return typeof val === 'string' ? val : '';
    };

    return c.json(success({
      summary: normalizeParagraph(generatedData.summary),
      stage_growth_insights: normalizeParagraph(generatedData.stage_growth_insights),
      strengths: normalizeBulletList(generatedData.strengths),
      improvements: normalizeBulletList(generatedData.improvements),
      next_phase_strategy: JSON.stringify(generatedData.next_phase_strategy || []),
      radar_scores: JSON.stringify(generatedData.radar_scores || {}),
      recommendation: normalizeParagraph(generatedData.recommendation),
      teacher_message: normalizeParagraph(generatedData.teacher_message),
      score_listening: parseInt(generatedData.score_listening) || 5,
      score_speaking: parseInt(generatedData.score_speaking) || 5,
      score_interaction: parseInt(generatedData.score_interaction) || 5,
      score_pronunciation: parseInt(generatedData.score_pronunciation) || 4,
      badge_name: generatedData.badge_name || badgeName,
      total_lessons_completed: actualCount || targetLessons,
      vocabulary_count: allVocab.length,
      sample_words: frequentWords.slice(0, 25),
      is_llm: isFromLLM
    }));
  } catch (err) {
    console.error('ai-generate fatal error:', err);
    return c.json(error('AI_GENERATE_ERROR', err.message || 'Internal error in AI generation'), 500);
  }
});

// 创建阶段报告
const reportSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  class_id: z.coerce.number().int().positive().optional().nullable(),
  report_type: z.enum(['milestone_10', 'milestone_30', 'milestone_60', 'milestone_100', 'level_up']),
  teacher_id: z.coerce.number().int().positive().optional().nullable(),
  teacher_name: z.string().max(100).optional().nullable().transform(v => v || null),
  summary: z.string().optional().nullable().transform(v => v || null),
  strengths: z.string().optional().nullable().transform(v => v || null),
  improvements: z.string().optional().nullable().transform(v => v || null),
  recommendation: z.string().optional().nullable().transform(v => v || null),
  teacher_message: z.string().optional().nullable().transform(v => v || null),
  from_level: z.string().optional().nullable().transform(v => v || null),
  to_level: z.string().optional().nullable().transform(v => v || null),
  total_lessons_completed: z.coerce.number().int().min(0).optional().nullable(),
  vocabulary_count: z.coerce.number().int().min(0).optional().nullable(),
  score_listening: z.coerce.number().int().min(1).max(5).optional().nullable(),
  score_speaking: z.coerce.number().int().min(1).max(5).optional().nullable(),
  score_interaction: z.coerce.number().int().min(1).max(5).optional().nullable(),
  score_pronunciation: z.coerce.number().int().min(1).max(5).optional().nullable(),
  highlight_recording_url: z.string().optional().nullable().transform(v => v || null),
  badge_name: z.string().max(100).optional().nullable().transform(v => v || null),
  stage_growth_insights: z.string().optional().nullable().transform(v => v || null),
  radar_scores: z.string().optional().nullable().transform(v => v || null),
  next_phase_strategy: z.string().optional().nullable().transform(v => v || null),
  organization_id: z.coerce.number().int().positive().optional().nullable()
});

progressReports.post('/', validate(reportSchema), async (c) => {
  const DB = c.env.DB;
  const data = c.req.validated;

  const student = await DB.prepare('SELECT id, status FROM students WHERE id = ?').bind(data.student_id).first();
  if (student && student.status === 'graduated') {
    return c.json(error('STUDENT_GRADUATED', 'The student has graduated. Milestone reports cannot be generated for graduated students.'), 400);
  }

  const result = await DB.prepare(`
    INSERT INTO progress_reports (
      student_id, class_id, report_type, teacher_id, teacher_name,
      summary, strengths, improvements, recommendation, teacher_message,
      from_level, to_level,
      total_lessons_completed, vocabulary_count,
      score_listening, score_speaking, score_interaction, score_pronunciation,
      highlight_recording_url, badge_name,
      stage_growth_insights, radar_scores, next_phase_strategy,
      status, organization_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)
  `).bind(
    data.student_id,
    data.class_id || null,
    data.report_type,
    data.teacher_id || null,
    data.teacher_name || null,
    data.summary || null,
    data.strengths || null,
    data.improvements || null,
    data.recommendation || null,
    data.teacher_message || null,
    data.from_level || null,
    data.to_level || null,
    data.total_lessons_completed || 0,
    data.vocabulary_count || 0,
    data.score_listening || 5,
    data.score_speaking || 5,
    data.score_interaction || 5,
    data.score_pronunciation || 5,
    data.highlight_recording_url || null,
    data.badge_name || null,
    data.stage_growth_insights || null,
    data.radar_scores || null,
    data.next_phase_strategy || null,
    data.organization_id || null
  ).run();

  return c.json(success({ id: result.meta.last_row_id }), 201);
});

// 更新报告
progressReports.patch('/:id', validateParams(idParamSchema), validate(reportSchema.partial()), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;
  const data = c.req.validated;

  const existing = await DB.prepare('SELECT * FROM progress_reports WHERE id = ?').bind(id).first();
  if (!existing) return c.json(error('NOT_FOUND', '报告不存在'), 404);

  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  fields.push('updated_at = datetime(\'now\')');
  values.push(id);

  await DB.prepare(`UPDATE progress_reports SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  return c.json(success({ id: parseInt(id) }));
});

// 删除报告
progressReports.delete('/:id', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  const existing = await DB.prepare('SELECT id FROM progress_reports WHERE id = ?').bind(id).first();
  if (!existing) return c.json(error('NOT_FOUND', '报告不存在'), 404);

  await DB.prepare('DELETE FROM progress_reports WHERE id = ?').bind(id).run();
  return c.json(success({ id: parseInt(id) }));
});

export default progressReports;
