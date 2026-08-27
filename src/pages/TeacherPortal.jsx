import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, User, BookOpen, CheckCircle, XCircle, Calendar, Edit, Plus, X } from 'lucide-react';
import { teacherOps, classOps, packageOps, API_BASE_URL } from '../store';

const STATUS_LABELS = {
  scheduled: '已预约',
  completed: '已完成',
  cancelled: '已取消',
  absent: '缺席'
};

const STATUS_COLORS = {
  scheduled: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
  absent: 'bg-red-100 text-red-800'
};

const PRACTICE_TEMPLATES = [
  '复习今天学的词汇，每个写5遍并造一个句子',
  '听课本录音3遍，跟读重点句型',
  '用今天学的句型和家长进行5分钟对话练习',
  '预习下一课生词，查出发音和意思',
];

export default function TeacherPortal() {
  const { teacherId } = useParams();
  const [teacher, setTeacher] = useState(null);
  const [todayClasses, setTodayClasses] = useState([]);
  const [upcomingClasses, setUpcomingClasses] = useState([]);
  const [pastClasses, setPastClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // 反馈表单状态
  const [feedbackForm, setFeedbackForm] = useState({});
  const [pronErrors, setPronErrors] = useState([]);
  const [gramErrors, setGramErrors] = useState([]);

  useEffect(() => {
    loadTeacherData();
  }, [teacherId]);

  const loadTeacherData = async () => {
    setLoading(true);
    try {
      const teacherData = await teacherOps.getById(teacherId);
      setTeacher(teacherData);

      const allClasses = await classOps.getAll();
      const teacherClasses = allClasses.filter(c => c.teacher_id === parseInt(teacherId));

      const today = new Date().toISOString().split('T')[0];

      const todayCls = teacherClasses.filter(c => c.date === today && c.status === 'scheduled');
      const upcoming = teacherClasses.filter(c => c.date > today && c.status === 'scheduled');
      const past = teacherClasses.filter(c => c.date < today || c.status !== 'scheduled');

      todayCls.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      upcoming.sort((a, b) => a.date.localeCompare(b.date));
      past.sort((a, b) => b.date.localeCompare(a.date));

      setTodayClasses(todayCls);
      setUpcomingClasses(upcoming.slice(0, 10));
      setPastClasses(past.slice(0, 20));
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  };

  const handleOpenFeedback = (cls) => {
    setSelectedClass(cls);
    setFeedbackForm({
      fb_lesson_level: cls.fb_lesson_level || '',
      fb_unit: cls.fb_unit || '',
      fb_lesson: cls.fb_lesson || '',
      fb_vocab: cls.fb_vocab || '',
      fb_patterns: cls.fb_patterns || '',
      fb_grammar: cls.fb_grammar || '',
      fb_teacher_message: cls.fb_teacher_message || '',
      fb_homework: cls.fb_homework || '',
      fb_next_preview: cls.fb_next_preview || '',
      // 教材页码引用 (配合 R2 里 EU-S/UnitN/page-XX.png)
      textbook_code: cls.textbook_code || (typeof selectedBook !== 'undefined' ? selectedBook : ''),
      unit_number: cls.unit_number || '',
      page_from: cls.page_from || '',
      page_to: cls.page_to || '',
      status: cls.status || 'completed'
    });
    // 回填发音/语法纠错
    try { setPronErrors(JSON.parse(cls.fb_pronunciation_errors || '[]')); } catch { setPronErrors([]); }
    try { setGramErrors(JSON.parse(cls.fb_grammar_errors || '[]')); } catch { setGramErrors([]); }
    setShowFeedbackModal(true);
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    try {
      await classOps.update(selectedClass.id, {
        ...feedbackForm,
        fb_pronunciation_errors: pronErrors.length ? JSON.stringify(pronErrors) : null,
        fb_grammar_errors: gramErrors.length ? JSON.stringify(gramErrors) : null,
        status: feedbackForm.status
      });

      setShowFeedbackModal(false);
      setSelectedClass(null);
      loadTeacherData();
      alert('反馈提交成功！');
    } catch (err) {
      alert('提交失败：' + err.message);
    }
  };

  const formatTime = (time) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  // 发音/语法纠错行操作
  const addPronError = () => setPronErrors([...pronErrors, { wrong: '', right: '' }]);
  const removePronError = (i) => setPronErrors(pronErrors.filter((_, idx) => idx !== i));
  const updatePronError = (i, field, val) => setPronErrors(pronErrors.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  const addGramError = () => setGramErrors([...gramErrors, { wrong: '', right: '' }]);
  const removeGramError = (i) => setGramErrors(gramErrors.filter((_, idx) => idx !== i));
  const updateGramError = (i, field, val) => setGramErrors(gramErrors.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  if (loading) {
    return <div className="flex justify-center items-center h-64">加载中...</div>;
  }

  if (!teacher) {
    return <div className="p-8 text-center text-gray-500">教师不存在</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{teacher.name} 的教师门户</h1>
                <p className="text-sm text-gray-500">
                  {teacher.subjects?.length > 0 && `可授科目：${teacher.subjects.join(', ')}`}
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* 今日课程 */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            今日课程 ({todayClasses.length})
          </h2>
          {todayClasses.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center text-gray-500">
              今天没有课程安排
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {todayClasses.map(cls => (
                <div key={cls.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">
                        {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[cls.status]}`}>
                      {STATUS_LABELS[cls.status]}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{cls.student_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-gray-400" />
                      <span>{cls.subject}</span>
                    </div>
                  </div>
                  {cls.status === 'scheduled' ? (
                    <button
                      onClick={() => handleOpenFeedback(cls)}
                      className="mt-4 w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                    >
                      提交上课反馈
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenFeedback(cls)}
                      className="mt-4 w-full py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 text-sm"
                    >
                      编辑反馈
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 即将到来的课程 */}
        {upcomingClasses.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              即将到来 ({upcomingClasses.length})
            </h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">日期</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">学生</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">科目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {upcomingClasses.map(cls => (
                    <tr key={cls.id}>
                      <td className="px-4 py-3 text-sm">{cls.date}</td>
                      <td className="px-4 py-3 text-sm">{formatTime(cls.start_time)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{cls.student_name}</td>
                      <td className="px-4 py-3 text-sm">{cls.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[cls.status]}`}>
                          {STATUS_LABELS[cls.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 历史课程 */}
        {pastClasses.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-600" />
              历史记录 (最近20节)
            </h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">日期</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">学生</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">科目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">反馈</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pastClasses.map(cls => (
                    <tr key={cls.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{cls.date}</td>
                      <td className="px-4 py-3 text-sm">{formatTime(cls.start_time)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{cls.student_name}</td>
                      <td className="px-4 py-3 text-sm">{cls.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[cls.status]}`}>
                          {STATUS_LABELS[cls.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {cls.status !== 'scheduled' ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            已提交
                          </span>
                        ) : (
                          <span className="text-gray-400 flex items-center gap-1">
                            <XCircle className="w-4 h-4" />
                            未提交
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleOpenFeedback(cls)}
                          className="text-purple-600 hover:text-purple-800 text-sm flex items-center gap-1"
                        >
                          <Edit className="w-4 h-4" />
                          {cls.status !== 'scheduled' ? '编辑' : '填写'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {/* 反馈弹窗 */}
      {showFeedbackModal && selectedClass && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{selectedClass.status !== 'scheduled' ? '编辑上课反馈' : '提交上课反馈'}</h2>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="text-sm text-gray-600 space-y-1">
                <div><span className="font-medium">学生：</span>{selectedClass.student_name}</div>
                <div><span className="font-medium">日期：</span>{selectedClass.date}</div>
                <div><span className="font-medium">时间：</span>{formatTime(selectedClass.start_time)}</div>
                <div><span className="font-medium">科目：</span>{selectedClass.subject}</div>
                <div><span className="font-medium">课时：</span>{selectedClass.hours || 1} 节</div>
              </div>
            </div>
            <form onSubmit={handleSubmitFeedback} className="space-y-4">
              {/* Block 1: 课程信息 */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="font-medium text-gray-700 text-sm">📚 课程信息</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">CEFR等级</label>
                    <input
                      type="text"
                      value={feedbackForm.fb_lesson_level || ''}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_lesson_level: e.target.value })}
                      placeholder="如: Pre-A1"
                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Unit</label>
                    <input
                      type="text"
                      value={feedbackForm.fb_unit || ''}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_unit: e.target.value })}
                      placeholder="Unit"
                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Lesson</label>
                    <input
                      type="text"
                      value={feedbackForm.fb_lesson || ''}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_lesson: e.target.value })}
                      placeholder="Lesson"
                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                {/* 📖 教材页码引用 (PDF 页码, 配合 R2 里 EU-S/UnitN/page-XX.png) */}
                <div className="border-t pt-3 mt-3">
                  <div className="font-medium text-gray-700 text-sm mb-2">📖 教材页码 (可选, 家长端可看这些 PDF 页)</div>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">教材</label>
                      <select
                        value={feedbackForm.textbook_code || ''}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, textbook_code: e.target.value, unit_number: '', page_from: '', page_to: '' })}
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">不指定</option>
                        <option value="EU-S">EU Starter</option>
                        <option value="EU-L1">EU Level 1</option>
                        <option value="EU-L2">EU Level 2</option>
                        <option value="EU-L3">EU Level 3</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Unit 编号</label>
                      <input
                        type="number" min={0} max={20}
                        value={feedbackForm.unit_number || ''}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, unit_number: e.target.value, page_from: '', page_to: '' })}
                        placeholder="如 1"
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">起始页</label>
                      <input
                        type="number" min={1} max={99}
                        value={feedbackForm.page_from || ''}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, page_from: e.target.value })}
                        placeholder="如 2"
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">结束页</label>
                      <input
                        type="number" min={1} max={99}
                        value={feedbackForm.page_to || ''}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, page_to: e.target.value })}
                        placeholder="如 4"
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  {/* PDF 页缩略图预览 */}
                  {feedbackForm.textbook_code && feedbackForm.unit_number && feedbackForm.page_from && feedbackForm.page_to && (
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500 mb-2">
                        📄 预览 {feedbackForm.textbook_code}/Unit{feedbackForm.unit_number}/ 第 {feedbackForm.page_from}-{feedbackForm.page_to} 页
                        (家长反馈页会展示这些教材真实页面,方便指导复习)
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
                        {Array.from({ length: Math.max(0, parseInt(feedbackForm.page_to) - parseInt(feedbackForm.page_from) + 1) }, (_, i) => {
                          const page = parseInt(feedbackForm.page_from) + i;
                          return (
                            <a
                              key={page}
                              href={`${API_BASE_URL}/textbooks/page-img/${feedbackForm.textbook_code}/${feedbackForm.unit_number}/${page}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block border rounded overflow-hidden hover:shadow-md"
                              title={`点击看大图: 页 ${page}`}
                            >
                              <img
                                src={`${API_BASE_URL}/textbooks/page-img/${feedbackForm.textbook_code}/${feedbackForm.unit_number}/${page}`}
                                alt={`Page ${page}`}
                                className="w-full h-auto"
                                loading="lazy"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                              <div className="text-xs text-center text-gray-500 bg-white py-0.5">P{page}</div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">今日词汇</label>
                  <textarea
                    value={feedbackForm.fb_vocab || ''}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_vocab: e.target.value })}
                    rows={2}
                    placeholder="apple, banana, cat..."
                    className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">今日句型</label>
                  <textarea
                    value={feedbackForm.fb_patterns || ''}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_patterns: e.target.value })}
                    rows={2}
                    placeholder="I like... / Can I have...?"
                    className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">语法重点</label>
                  <input
                    type="text"
                    value={feedbackForm.fb_grammar || ''}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_grammar: e.target.value })}
                    placeholder="如: Present Simple"
                    className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Block 2: 发音纠正 */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-700 text-sm">🗣️ 发音纠正</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPronErrors([{ wrong: 'No errors today', right: 'Great pronunciation!' }])}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      今日无错误
                    </button>
                    <button
                      type="button"
                      onClick={addPronError}
                      className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> 添加一行
                    </button>
                  </div>
                </div>
                {pronErrors.length === 0 && (
                  <p className="text-xs text-gray-400">点击"添加一行"记录发音纠正，或"今日无错误"</p>
                )}
                {pronErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={err.wrong}
                      onChange={(e) => updatePronError(i, 'wrong', e.target.value)}
                      placeholder="✗ 错误发音"
                      className="flex-1 px-2 py-1.5 text-sm border border-red-200 rounded focus:ring-2 focus:ring-red-400"
                    />
                    <span className="text-gray-400 text-sm">→</span>
                    <input
                      type="text"
                      value={err.right}
                      onChange={(e) => updatePronError(i, 'right', e.target.value)}
                      placeholder="✓ 正确发音"
                      className="flex-1 px-2 py-1.5 text-sm border border-green-200 rounded focus:ring-2 focus:ring-green-400"
                    />
                    <button
                      type="button"
                      onClick={() => removePronError(i)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Block 3: 语法纠正 */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-700 text-sm">📝 语法纠正</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGramErrors([{ wrong: 'No errors today', right: 'Good grammar!' }])}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      今日无错误
                    </button>
                    <button
                      type="button"
                      onClick={addGramError}
                      className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> 添加一行
                    </button>
                  </div>
                </div>
                {gramErrors.length === 0 && (
                  <p className="text-xs text-gray-400">点击"添加一行"记录语法纠正，或"今日无错误"</p>
                )}
                {gramErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={err.wrong}
                      onChange={(e) => updateGramError(i, 'wrong', e.target.value)}
                      placeholder="✗ 错误句子"
                      className="flex-1 px-2 py-1.5 text-sm border border-red-200 rounded focus:ring-2 focus:ring-red-400"
                    />
                    <span className="text-gray-400 text-sm">→</span>
                    <input
                      type="text"
                      value={err.right}
                      onChange={(e) => updateGramError(i, 'right', e.target.value)}
                      placeholder="✓ 正确句子"
                      className="flex-1 px-2 py-1.5 text-sm border border-green-200 rounded focus:ring-2 focus:ring-green-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeGramError(i)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Block 4: 老师反馈 */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="font-medium text-gray-700 text-sm">💌 老师反馈</div>
                <textarea
                  value={feedbackForm.fb_teacher_message || ''}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_teacher_message: e.target.value })}
                  rows={5}
                  placeholder="第一句：肯定孩子今天的表现&#10;第二句：描述一个具体亮点&#10;第三句：建议重点练习的方向"
                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-400">提示：第一句肯定表现 → 第二句具体亮点 → 第三句练习建议</p>
              </div>

              {/* Block 5: 课后作业 */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="font-medium text-gray-700 text-sm">📝 课后作业（选填）</div>
                <textarea
                  value={feedbackForm.fb_homework || ''}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_homework: e.target.value })}
                  rows={2}
                  placeholder="课后练习建议..."
                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                />
                <div className="flex flex-wrap gap-1">
                  {PRACTICE_TEMPLATES.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setFeedbackForm({ ...feedbackForm, fb_homework: (feedbackForm.fb_homework || '') + (feedbackForm.fb_homework ? '\n' : '') + tpl })}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      {tpl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Block 6: 下节课预告 */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="font-medium text-gray-700 text-sm">🎯 下节课预告（选填）</div>
                <textarea
                  value={feedbackForm.fb_next_preview || ''}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_next_preview: e.target.value })}
                  rows={2}
                  placeholder="下节课将学习..."
                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* 课程状态 */}
              {selectedClass.status === 'scheduled' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">课程状态</label>
                <select
                  value={feedbackForm.status}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="completed">已完成（扣除课时）</option>
                  <option value="absent">学生缺席（不扣课时）</option>
                  <option value="cancelled">已取消（不扣课时）</option>
                </select>
              </div>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {selectedClass.status !== 'scheduled' ? '保存修改' : '提交反馈'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
