import { Hono } from 'hono';
import { success, error, calculatePagination } from '../utils/response.js';
import { validate, validateParams, idParamSchema } from '../utils/validation.js';
import { triggerPushNotification } from '../utils/push.js';
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

// 检查并自动发布到期的阶段报告 (Auto-publish scheduled reports)
export async function checkAndAutoPublishReports(DB) {
  try {
    const expired = await DB.prepare(`
      SELECT id, student_id, class_id, report_type 
      FROM progress_reports 
      WHERE status = 'scheduled' 
        AND scheduled_publish_at IS NOT NULL 
        AND datetime(scheduled_publish_at) <= datetime('now')
    `).all();

    if (!expired || !expired.results || expired.results.length === 0) {
      return 0;
    }

    let publishedCount = 0;
    for (const r of expired.results) {
      await DB.prepare(`
        UPDATE progress_reports 
        SET status = 'published', updated_at = datetime('now') 
        WHERE id = ?
      `).bind(r.id).run();

      publishedCount++;

      try {
        const milestoneNumber = (r.report_type || '').replace('milestone_', '');
        const title = '🎉 智能教研阶段评估报告已生成！';
        const body = `宝贝已顺利完成第 ${milestoneNumber || ''} 课时，基于大数据分析的五维能力雷达模型及进阶规划已全面出炉，点击查阅！`;
        await triggerPushNotification(DB, 'parent', r.student_id, 'milestone_report', title, body, r.class_id || null);
      } catch (pushErr) {
        console.warn('[AutoPublish Push] failed for report ' + r.id, pushErr);
      }
    }
    return publishedCount;
  } catch (err) {
    console.error('checkAndAutoPublishReports error:', err);
    return 0;
  }
}

// 获取学生的阶段报告
progressReports.get('/', async (c) => {
  const DB = c.env.DB;
  // 读时自动将到期的 scheduled 报告转换为 published
  await checkAndAutoPublishReports(DB);

  const studentId = c.req.query('student_id');
  const teacherId = c.req.query('teacher_id');
  const classId = c.req.query('class_id');
  const status = c.req.query('status');
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
  if (status) {
    whereClause += ' AND pr.status = ?';
    params.push(status);
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
    scheduled_publish_at: r.scheduled_publish_at,
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
  milestone_type: z.enum(['milestone_8', 'milestone_30', 'milestone_60', 'milestone_100', 'level_up']),
  class_id: z.coerce.number().int().positive().optional().nullable(),
  teacher_id: z.coerce.number().int().positive().optional().nullable()
});

/**
 * Core function to generate milestone report data using DB records + LLM
 */
export async function generateMilestoneReportData({ DB, env, student_id, milestone_type, class_id, teacher_id, headers = {} }) {
  const student = await DB.prepare('SELECT id, name, english_name, grade, status FROM students WHERE id = ?').bind(student_id).first();
  if (!student) throw new Error('Student not found');
  if (student.status === 'graduated') {
    throw new Error('The student has graduated. Milestone reports cannot be generated for graduated students.');
  }

  // Determine target lesson count
  let targetLessons = 8;
  let badgeName = '🥉 Rising Star';
  let stageLabel = '8 Lessons Adaptation & Habit Stage';
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
           fb_vocab, fb_patterns, fb_grammar, fb_pronunciation_errors, fb_grammar_errors, fb_teacher_message, fb_homework,
           fb_score_phonics, fb_score_vocab, fb_score_speaking, fb_score_listening, fb_score_engagement
    FROM classes
    WHERE student_id = ? AND status = 'completed' AND is_trial = 0
    ORDER BY date ASC, start_time ASC
    LIMIT ?
  `).bind(student_id, targetLessons).all();

  const classList = classesResult.results || [];
  const actualCount = classList.length;

  // Extract vocabulary, frequencies, sentences, pronunciation history, teacher notes & 5-dimension ratings
  const wordFreqMap = {};
  const allVocabSet = new Set();
  const practicedSentences = [];
  const pronunciationHistory = [];
  const grammarHistory = [];
  const teacherNotes = [];
  const textbookSet = new Set();

  const dimScores = {
    phonics: [],
    vocab: [],
    speaking: [],
    listening: [],
    engagement: []
  };

  classList.forEach(cls => {
    if (cls.textbook_code) textbookSet.add(cls.textbook_code);
    if (cls.fb_score_phonics) dimScores.phonics.push(cls.fb_score_phonics);
    if (cls.fb_score_vocab) dimScores.vocab.push(cls.fb_score_vocab);
    if (cls.fb_score_speaking) dimScores.speaking.push(cls.fb_score_speaking);
    if (cls.fb_score_listening) dimScores.listening.push(cls.fb_score_listening);
    if (cls.fb_score_engagement) dimScores.engagement.push(cls.fb_score_engagement);

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
        const cleanS = s.length > 120 ? s.slice(0, 117) + '...' : s;
        if (!practicedSentences.includes(cleanS) && practicedSentences.length < 20) {
          practicedSentences.push(cleanS);
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
      const cleanNote = cls.fb_teacher_message.trim().slice(0, 350);
      teacherNotes.push({ date: cls.date, text: cleanNote });
    }
  });

  const allVocab = Array.from(allVocabSet);
  const frequentWords = Object.entries(wordFreqMap)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  const displayName = student.english_name ? `${student.name} (${student.english_name})` : student.name;
  const textbooks = Array.from(textbookSet);

  // Determine CEFR Proficiency Level
  const rawLevel = (student.grade || '').trim() || (classList.find(c => c.fb_lesson_level)?.fb_lesson_level || '').trim();
  let cefrLevel = 'B1';
  if (/B2/i.test(rawLevel)) cefrLevel = 'B2';
  else if (/B1/i.test(rawLevel)) cefrLevel = 'B1';
  else if (/A2/i.test(rawLevel)) cefrLevel = 'A2';
  else if (/A1/i.test(rawLevel)) cefrLevel = 'A1';
  else if (/C1/i.test(rawLevel)) cefrLevel = 'C1';
  else if (rawLevel) cefrLevel = rawLevel;

  const isIntermediateOrAbove = ['B1', 'B2', 'C1', 'C2'].includes(cefrLevel);
  const studentAge = student.age ? `${student.age} years old` : 'Adolescent / Middle School';

  // Compute quantitative baseline scores from teacher's lesson evaluations (1-5 mapped to 60-100)
  const calcDimAvg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const avgPhonics = calcDimAvg(dimScores.phonics);
  const avgVocab = calcDimAvg(dimScores.vocab);
  const avgSpeaking = calcDimAvg(dimScores.speaking);
  const avgListening = calcDimAvg(dimScores.listening);
  const avgEngagement = calcDimAvg(dimScores.engagement);

  const to100Scale = (avg, fallback) => {
    if (avg === null || isNaN(avg)) return fallback;
    return Math.min(100, Math.max(60, Math.round(((avg - 1) / 4) * 40 + 60)));
  };

  const baseRadarScores = {
    phonics: to100Scale(avgPhonics, 88),
    vocabulary_retention: to100Scale(avgVocab, 90),
    spontaneous_speaking: to100Scale(avgSpeaking, 82),
    listening_comprehension: to100Scale(avgListening, 90),
    classroom_engagement: to100Scale(avgEngagement, 95)
  };

  const hasTeacherScores = dimScores.phonics.length > 0 || dimScores.vocab.length > 0 || dimScores.speaking.length > 0;

  // Try calling LLM
  let generatedData = null;
  let isFromLLM = false;
  let usedModel = null;

  try {
    const baseUrl = (headers && headers['x-llm-base-url']) || (env && env.LLM_BASE_URL) || 'https://integrate.api.nvidia.com/v1';
    const apiKey = (headers && headers['x-llm-api-key']) || (env && env.LLM_API_KEY);
    let preferredModel = (headers && headers['x-llm-model']) || (env && env.LLM_MODEL) || 'nvidia/nemotron-3-ultra-550b-a55b';
    if (preferredModel.includes('550b') || preferredModel.includes('nemotron-3-ultra')) {
      preferredModel = 'nvidia/nemotron-3-ultra-550b-a55b';
    }

    if (apiKey) {
      const systemPrompt = `You are a Senior Cambridge/CEFR ESL Pedagogical Director and Educational Psychologist at SunnyBridge Academy.
Your task is to analyze a student's milestone lesson logs and generate an authoritative, evidence-based, inspiring Milestone Stage Assessment Report in JSON format.

CRITICAL LEVEL AWARENESS & PEDAGOGICAL GROUNDING:
1. Strict CEFR Alignment: Calibrate your analysis strictly to CEFR ${cefrLevel} (${isIntermediateOrAbove ? 'Intermediate/Upper-Intermediate' : 'Foundational'}) level and chronological age (${studentAge}).
2. NEGATIVE CONSTRAINTS (STRICTLY ENFORCED):
${isIntermediateOrAbove ? `   - NEVER use early-childhood or beginner ESL terms such as "sight words", "CVC blending", "letter sounds", "Pre-A1/A1 fluency", or "alphabet phonics".
   - At CEFR ${cefrLevel}, "Phonics/Pronunciation" evaluates: multi-syllabic stress patterns (e.g. stress precision on words like "nutritious", "carbohydrate"), sentence rhythm, connected speech, and articulation clarity.
   - At CEFR ${cefrLevel}, learning focuses on: paragraph-level written cohesion, reading topic-sentence analysis, academic listening note-taking (shorthand vs verbatim transcription), and elaborating spontaneous speaking responses with descriptive clauses and reasons.` : `   - Calibrate strictly to foundational phonemic awareness and sentence frames appropriate for early stages.`}
3. Evidence-Based Analysis: Quote the student's actual curriculum (${textbooks.join(', ') || 'CECS'}), actual acquired vocabulary, and specific teacher observations from the lesson records.

RADAR SCORE CALIBRATION (Scale 60-100):
Anchor your radar_scores strictly on the calculated base scores from the teacher's lesson evaluations:
- phonics: ~${baseRadarScores.phonics}
- vocabulary_retention: ~${baseRadarScores.vocabulary_retention}
- spontaneous_speaking: ~${baseRadarScores.spontaneous_speaking}
- listening_comprehension: ~${baseRadarScores.listening_comprehension}
- classroom_engagement: ~${baseRadarScores.classroom_engagement}
You may adjust each dimension by only ±2 to ±4 points based on qualitative feedback, maintaining high fidelity to teacher ratings.

CRITICAL FORMAT & SPEED CONSTRAINTS:
- Do NOT output reasoning or <think> tags.
- Start directly with '{' and output ONLY valid JSON matching the schema below.

OUTPUT JSON SCHEMA:
{
  "summary": "String (80-100 words). High-level overview celebrating the student's milestone progress at CEFR ${cefrLevel}.",
  "stage_growth_insights": "String (80-110 words). Deep pedagogical analysis of cognitive and linguistic milestones achieved at this CEFR stage.",
  "strengths": ["Array of 3 Strings. Detailed strengths citing actual lesson evidence (e.g., written paragraph structure, audio comprehension, specific vocabulary)."],
  "improvements": ["Array of 2-3 Strings. Realistic pedagogical growth areas grounded in teacher observations (e.g., shorthand note-taking, elaborating answers with descriptive clauses)."],
  "next_phase_strategy": [
    {
      "goal": "String. Actionable goal for the next stage tailored to CEFR ${cefrLevel}.",
      "rationale": "String. Pedagogical rationale directly referencing the student's improvement points.",
      "action_plan": "String. Concrete classroom instruction method to be used by the teacher."
    }
  ],
  "radar_scores": {
    "phonics": 0,
    "vocabulary_retention": 0,
    "spontaneous_speaking": 0,
    "listening_comprehension": 0,
    "classroom_engagement": 0
  },
  "recommendation": "String (50-70 words). High-value, level-appropriate home learning recommendations. NO kindergarten/sight word advice.",
  "teacher_message": "String (50-70 words). Inspiring, mature message encouraging the student at their stage.",
  "score_listening": 0,
  "score_speaking": 0,
  "score_interaction": 0,
  "score_pronunciation": 0,
  "badge_name": "String. An inspiring title matching their level (e.g., '${isIntermediateOrAbove ? 'B1 Academic Pioneer' : 'Language Star'}')."
}`;

      const userPrompt = `Generate the JSON milestone report for this student:

<student_profile>
Name: ${displayName}
Age: ${studentAge}
Target Proficiency Level: CEFR ${cefrLevel} (${isIntermediateOrAbove ? 'Intermediate' : 'Foundational'})
Milestone Stage: ${stageLabel} (${actualCount || targetLessons} lessons completed)
Curriculum Track: ${textbooks.join(', ') || 'CECS'}
</student_profile>

<teacher_quantitative_evaluations>
Coverage: ${hasTeacherScores ? `${dimScores.phonics.length} lessons evaluated` : 'Historical baseline calibration'}
- Phonics Avg: ${avgPhonics ? avgPhonics.toFixed(1) + '/5' : 'Default'} -> Base Score: ${baseRadarScores.phonics}
- Vocab Retention Avg: ${avgVocab ? avgVocab.toFixed(1) + '/5' : 'Default'} -> Base Score: ${baseRadarScores.vocabulary_retention}
- Spontaneous Speaking Avg: ${avgSpeaking ? avgSpeaking.toFixed(1) + '/5' : 'Default'} -> Base Score: ${baseRadarScores.spontaneous_speaking}
- Listening Comprehension Avg: ${avgListening ? avgListening.toFixed(1) + '/5' : 'Default'} -> Base Score: ${baseRadarScores.listening_comprehension}
- Classroom Engagement Avg: ${avgEngagement ? avgEngagement.toFixed(1) + '/5' : 'Default'} -> Base Score: ${baseRadarScores.classroom_engagement}
</teacher_quantitative_evaluations>

<curriculum_data>
Textbooks Studied: ${textbooks.join(', ') || 'Core ESL Curriculum'}
Core Vocabulary Sample: ${allVocab.slice(0, 20).join(', ')}
Practiced Sentence Structures:
${practicedSentences.slice(0, 6).map(s => `- ${s}`).join('\n') || '- Interactive academic discussion'}
</curriculum_data>

<performance_data>
Pronunciation History (Wrong -> Corrected):
${pronunciationHistory.slice(0, 5).map(p => `- Corrected "${p.wrong}" -> "${p.right}"`).join('\n') || '- Clear pronunciation and stress'}

Teacher Notes Timeline:
${(teacherNotes.length > 4 ? teacherNotes.slice(-4) : teacherNotes).map(n => `- [${n.date}] ${n.text}`).join('\n') || '- High engagement in all sessions'}
</performance_data>

Output ONLY the JSON object.`;

      const candidateModels = [
        preferredModel,
        'nvidia/nemotron-3-ultra-550b-a55b'
      ].filter((v, idx, arr) => v && arr.indexOf(v) === idx && !v.includes('llama-3.2') && !v.includes('llama-3.1'));

      for (const m of candidateModels) {
        try {
          const timeoutMs = 50000;
          console.log(`[Milestone AI] Calling model ${m} (timeout ${timeoutMs}ms)...`);
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
              temperature: 0.1,
              max_tokens: 900
            }),
            signal: AbortSignal.timeout(timeoutMs)
          });

          if (resp.ok) {
            const data = await resp.json();
            const choiceMsg = data.choices?.[0]?.message;
            const rawContent = (choiceMsg?.content && choiceMsg.content.trim()) || choiceMsg?.reasoning_content || '';
            const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            const target = fenceMatch ? fenceMatch[1] : rawContent;
            const cleanText = target.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.summary && (parsed.strengths || parsed.stage_growth_insights)) {
                  generatedData = parsed;
                  isFromLLM = true;
                  usedModel = m;
                  console.log(`[Milestone AI] Successfully generated report using ${m}`);
                  break;
                } else {
                  usedModel = `MISSING_FIELDS_${Object.keys(parsed).join(',')}`;
                }
              } catch (pe) {
                usedModel = `JSON_PARSE_ERR_${pe.message}_RAW_${cleanText.slice(0, 60)}`;
              }
            } else {
              usedModel = `NO_JSON_FOUND_${cleanText.slice(0, 80)}`;
            }
          } else {
            const errText = await resp.text();
            console.warn(`[Milestone AI] Model ${m} returned HTTP ${resp.status}:`, errText);
            usedModel = `HTTP_${resp.status}_${errText.slice(0, 100)}`;
          }
        } catch(e) {
          console.warn(`[Milestone AI] Model ${m} failed:`, e.message);
          usedModel = `EXCEPTION_${e.message}`;
        }
      }
    }
  } catch(llmErr) {
    console.warn('LLM generation error:', llmErr.message);
  }

  // Fallback heuristic generator if LLM was unreachable or invalid
  if (!generatedData) {
    const vocabSample = frequentWords.slice(0, 5).join(', ') || allVocab.slice(0, 5).join(', ') || 'target academic terms';
    const sentSample = practicedSentences.slice(0, 2).join('; ') || 'structured topic responses';
    const errSample = pronunciationHistory.length > 0
      ? pronunciationHistory.slice(0, 3).map(e => `"${e.right}"`).join(', ')
      : 'multisyllabic word stress';

    if (isIntermediateOrAbove) {
      generatedData = {
        summary: `Over the course of completing ${actualCount || targetLessons} formal 1-on-1 English lessons, ${displayName} has demonstrated impressive academic and communicative growth at the CEFR ${cefrLevel} level. From structured guided discussions, ${displayName} now analyzes complex informational topics with confidence, actively integrating over ${allVocab.length} cumulative vocabulary words across ${textbooks.length ? textbooks.join(', ') : 'the CECS curriculum'}.`,
        stage_growth_insights: `The student is demonstrating advanced linguistic synthesis, progressing from sentence-level comprehension to paragraph-level structural writing and main idea extraction. In listening, they comprehend authentic discussions effectively, and are now optimizing active note-taking techniques.`,
        strengths: [
          `Demonstrates strong structural writing capability, producing multi-paragraph texts with clear organization and accurate grammar.`,
          `Quickly identifies central themes and topic sentences during analytical reading tasks.`,
          `Actively acquires and retains domain-specific intermediate vocabulary, including terms like ${vocabSample}.`
        ],
        improvements: [
          `Develop shorthand note-taking strategies during fast-paced authentic audio listening instead of attempting verbatim transcription.`,
          `Expand spontaneous conversational responses by incorporating more descriptive adjectives and causal explanations.`
        ],
        next_phase_strategy: [
          {
            goal: "Master shorthand note-taking for fast-paced audio comprehension.",
            rationale: "To avoid cognitive overload during authentic listening, key idea abbreviation is essential.",
            action_plan: "Teacher will introduce bullet-point note-taking drills using real-world audio excerpts."
          },
          {
            goal: "Enhance spoken discourse with descriptive elaboration.",
            rationale: "Transitioning from direct short answers to extended opinions strengthens B1 conversational depth.",
            action_plan: "Teacher will implement follow-up prompting (why/how) and introduce targeted descriptive adjectives."
          }
        ],
        radar_scores: baseRadarScores,
        recommendation: `Support CEFR ${cefrLevel} progress at home by encouraging 15 minutes of authentic English listening (podcasts or radio) and practicing 3-bullet shorthand summaries. Read graded articles and discuss opinions together.`,
        teacher_message: `Congratulations on reaching your ${targetLessons}-lesson milestone! Your intellectual curiosity, analytical thinking, and writing achievements at the ${cefrLevel} level are truly exceptional. Keep striving forward!`,
        score_listening: 5,
        score_speaking: 4,
        score_interaction: 5,
        score_pronunciation: 5,
        badge_name: `${cefrLevel} Academic Pioneer`
      };
    } else {
      generatedData = {
        summary: `Over the course of completing ${actualCount || targetLessons} formal 1-on-1 English lessons, ${displayName} has demonstrated consistent growth, expanding communicative confidence and foundational comprehension. Having actively acquired over ${allVocab.length} cumulative vocabulary words across ${textbooks.length ? textbooks.join(', ') : 'our core curriculum'}.`,
        stage_growth_insights: `The student is successfully transitioning from receptive vocabulary recognition to active spontaneous usage, demonstrating strong classroom engagement and phonemic awareness.`,
        strengths: [
          `Demonstrates solid retention of core vocabulary, readily recognizing words such as ${vocabSample}.`,
          `Actively applies learned sentence structures (${sentSample}) during teacher-led guided conversations.`,
          `Shows enthusiastic classroom engagement and receptive imitation during interactive activities.`
        ],
        improvements: [
          `Continue refining natural pronunciation flow and clarity on target sounds (e.g., sound precision in ${errSample}).`,
          `Encourage answering in full sentences rather than single-word prompts to strengthen spontaneous syntax.`
        ],
        next_phase_strategy: [
          {
            goal: "Consolidate phonemic precision and sentence frames.",
            rationale: "Consistent phonics and sentence patterns build strong communicative confidence.",
            action_plan: "Teacher will incorporate targeted conversational sentence drills at the start of each session."
          },
          {
            goal: "Transition to spontaneous full-sentence responses.",
            rationale: "To move beyond single-word answers, structured scaffolding is required.",
            action_plan: "Teacher will use guided prompt framing to elicit complete thoughts."
          }
        ],
        radar_scores: baseRadarScores,
        recommendation: `Advance to the subsequent curriculum units with structured daily 10-minute listening repetition and targeted vocabulary review.`,
        teacher_message: `Congratulations on reaching your ${targetLessons}-lesson milestone! Your positive attitude, resilience, and curiosity make every lesson a joy. Keep up the wonderful work!`,
        score_listening: 5,
        score_speaking: 5,
        score_interaction: 5,
        score_pronunciation: 4,
        badge_name: badgeName
      };
    }
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

  let rawRadar = {};
  try {
    rawRadar = typeof generatedData.radar_scores === 'string' ? JSON.parse(generatedData.radar_scores) : (generatedData.radar_scores || {});
  } catch(e) {}

  const finalRadarScores = {
    phonics: Math.min(100, Math.max(60, Number(rawRadar.phonics) || baseRadarScores.phonics)),
    vocabulary_retention: Math.min(100, Math.max(60, Number(rawRadar.vocabulary_retention) || baseRadarScores.vocabulary_retention)),
    spontaneous_speaking: Math.min(100, Math.max(60, Number(rawRadar.spontaneous_speaking) || baseRadarScores.spontaneous_speaking)),
    listening_comprehension: Math.min(100, Math.max(60, Number(rawRadar.listening_comprehension) || baseRadarScores.listening_comprehension)),
    classroom_engagement: Math.min(100, Math.max(60, Number(rawRadar.classroom_engagement) || baseRadarScores.classroom_engagement))
  };

  return {
    summary: normalizeParagraph(generatedData.summary),
    stage_growth_insights: normalizeParagraph(generatedData.stage_growth_insights),
    strengths: normalizeBulletList(generatedData.strengths),
    improvements: normalizeBulletList(generatedData.improvements),
    next_phase_strategy: typeof generatedData.next_phase_strategy === 'string' ? generatedData.next_phase_strategy : JSON.stringify(generatedData.next_phase_strategy || []),
    radar_scores: JSON.stringify(finalRadarScores),
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
    is_llm: isFromLLM,
    model_used: usedModel
  };
}

/**
 * Automatically create and publish a milestone report in the database
 */
export async function createPublishedMilestoneReport({
  DB,
  env,
  student_id,
  milestone_type,
  class_id = null,
  teacher_id = null,
  teacher_name = null,
  organization_id = null,
  status = 'scheduled',
  scheduled_publish_at = null,
  headers = {}
}) {
  const generated = await generateMilestoneReportData({
    DB,
    env,
    student_id,
    milestone_type,
    class_id,
    teacher_id,
    headers
  });

  const finalStatus = status || 'scheduled';
  let finalScheduledAt = scheduled_publish_at;
  if (finalStatus === 'scheduled' && !finalScheduledAt) {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    finalScheduledAt = d.toISOString();
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
      status, scheduled_publish_at, organization_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    student_id,
    class_id || null,
    milestone_type,
    teacher_id || null,
    teacher_name || null,
    generated.summary || null,
    generated.strengths || null,
    generated.improvements || null,
    generated.recommendation || null,
    generated.teacher_message || null,
    null,
    null,
    generated.total_lessons_completed || 0,
    generated.vocabulary_count || 0,
    generated.score_listening || 5,
    generated.score_speaking || 5,
    generated.score_interaction || 5,
    generated.score_pronunciation || 4,
    null,
    generated.badge_name || null,
    generated.stage_growth_insights || null,
    generated.radar_scores || null,
    generated.next_phase_strategy || null,
    finalStatus,
    finalScheduledAt || null,
    organization_id || null
  ).run();

  if (finalStatus === 'published') {
    try {
      const milestoneNumber = (milestone_type || '').replace('milestone_', '');
      const title = '🎉 智能教研阶段评估报告已生成！';
      const body = `宝贝已顺利完成第 ${milestoneNumber || ''} 课时，基于大数据分析的五维能力雷达模型及进阶规划已全面出炉，点击查阅！`;
      await triggerPushNotification(DB, 'parent', student_id, 'milestone_report', title, body, class_id);
    } catch (pushErr) {
      console.warn('[Milestone Notification] Push failed:', pushErr);
    }
  } else if (finalStatus === 'scheduled' && teacher_id) {
    // 延时发布模式下，给授课外教发送就绪待审通知 (全英文)
    try {
      const milestoneNumber = (milestone_type || '').replace('milestone_', '');
      const title = `🏅 Milestone ${milestoneNumber} Assessment Ready`;
      const body = `Pedagogical evaluation generated. Auto-publishes to parent in 24h. Click to review or fine-tune.`;
      await triggerPushNotification(DB, 'teacher', teacher_id, 'milestone_report', title, body, class_id);
    } catch (tErr) {
      console.warn('[Teacher Notification] Push failed:', tErr);
    }
  }

  return { id: result.meta.last_row_id, reportData: generated, status: finalStatus, scheduled_publish_at: finalScheduledAt };
}

progressReports.post('/ai-generate', validate(aiGenerateSchema), async (c) => {
  try {
    const DB = c.env.DB;
    const { student_id, milestone_type, class_id, teacher_id } = c.req.validated;

    const data = await generateMilestoneReportData({
      DB,
      env: c.env,
      student_id,
      milestone_type,
      class_id,
      teacher_id,
      headers: {
        'x-llm-base-url': c.req.header('x-llm-base-url'),
        'x-llm-api-key': c.req.header('x-llm-api-key'),
        'x-llm-model': c.req.header('x-llm-model')
      }
    });

    return c.json(success(data));
  } catch (err) {
    console.error('ai-generate fatal error:', err);
    if (err.message.includes('not found')) {
      return c.json(error('NOT_FOUND', err.message), 404);
    }
    if (err.message.includes('graduated')) {
      return c.json(error('STUDENT_GRADUATED', err.message), 400);
    }
    return c.json(error('AI_GENERATE_ERROR', err.message || 'Internal error in AI generation'), 500);
  }
});

// 创建阶段报告
const reportSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  class_id: z.coerce.number().int().positive().optional().nullable(),
  report_type: z.enum(['milestone_8', 'milestone_30', 'milestone_60', 'milestone_100', 'level_up']),
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
  status: z.enum(['draft', 'scheduled', 'published']).optional().default('scheduled'),
  scheduled_publish_at: z.string().optional().nullable(),
  organization_id: z.coerce.number().int().positive().optional().nullable()
});

progressReports.post('/', validate(reportSchema), async (c) => {
  const DB = c.env.DB;
  const data = c.req.validated;

  const student = await DB.prepare('SELECT id, status FROM students WHERE id = ?').bind(data.student_id).first();
  if (student && student.status === 'graduated') {
    return c.json(error('STUDENT_GRADUATED', 'The student has graduated. Milestone reports cannot be generated for graduated students.'), 400);
  }

  const finalStatus = data.status || 'scheduled';
  let finalScheduledAt = data.scheduled_publish_at;
  if (finalStatus === 'scheduled' && !finalScheduledAt) {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    finalScheduledAt = d.toISOString();
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
      status, scheduled_publish_at, organization_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    finalStatus,
    finalScheduledAt || null,
    data.organization_id || null
  ).run();

  if (finalStatus === 'published') {
    try {
      const milestoneNumber = (data.report_type || '').replace('milestone_', '');
      const title = '🎉 智能教研阶段评估报告已发布！';
      const body = `宝贝已完成阶段学习，专业阶段评估报告与进阶规划已发布，点击查阅！`;
      await triggerPushNotification(DB, 'parent', data.student_id, 'milestone_report', title, body, data.class_id || null);
    } catch (pushErr) {
      console.warn('[Milestone Notification] Push failed:', pushErr);
    }
  }

  return c.json(success({ id: result.meta.last_row_id, status: finalStatus, scheduled_publish_at: finalScheduledAt }), 201);
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

// 立即向家长端发布阶段报告 (Publish to Parents Now)
progressReports.post('/:id/publish-now', validateParams(idParamSchema), async (c) => {
  const DB = c.env.DB;
  const { id } = c.req.validatedParams;

  const existing = await DB.prepare('SELECT * FROM progress_reports WHERE id = ?').bind(id).first();
  if (!existing) return c.json(error('NOT_FOUND', 'Report not found'), 404);

  await DB.prepare(`
    UPDATE progress_reports 
    SET status = 'published', scheduled_publish_at = datetime('now'), updated_at = datetime('now') 
    WHERE id = ?
  `).bind(id).run();

  // 触发家长端通知推送
  try {
    const milestoneNumber = (existing.report_type || '').replace('milestone_', '');
    const title = '🎉 智能教研阶段评估报告已生成！';
    const body = `宝贝已顺利完成第 ${milestoneNumber || ''} 课时，基于大数据分析的五维能力雷达模型及进阶规划已全面出炉，点击查阅！`;
    await triggerPushNotification(DB, 'parent', existing.student_id, 'milestone_report', title, body, existing.class_id || null);
  } catch (pushErr) {
    console.warn('[PublishNow Push] failed:', pushErr);
  }

  return c.json(success({ id: parseInt(id), status: 'published', message: 'Report published successfully to parents' }));
});

export default progressReports;

