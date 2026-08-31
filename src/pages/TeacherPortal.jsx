import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, User, BookOpen, CheckCircle, XCircle, Calendar, Edit, Plus, X, Search } from 'lucide-react';
import { teacherOps, classOps, packageOps, API_BASE_URL } from '../store';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

const STATUS_LABELS = {
  scheduled: '已预约',
  completed: '已完成',
  cancelled: '已取消',
  absent: '缺席'
};

const STATUS_VARIANTS = {
  scheduled: 'warning',
  completed: 'success',
  cancelled: 'default',
  absent: 'danger'
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

  const [feedbackForm, setFeedbackForm] = useState({});
  const [pronErrors, setPronErrors] = useState([]);
  const [gramErrors, setGramErrors] = useState([]);
  const [textbooksList, setTextbooksList] = useState([]);
  const [suggestData, setSuggestData] = useState(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  useEffect(() => {
    loadTeacherData();
    loadTextbooks();
  }, [teacherId]);

  const loadTextbooks = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/textbooks`, { headers: { 'X-API-Key': 'DEMO_KEY' } });
      const json = await res.json();
      if (json.data) setTextbooksList(json.data);
    } catch (e) {
      console.warn('Failed to load textbooks in TeacherPortal:', e);
    }
  };

  useEffect(() => {
    if (feedbackForm.textbook_code && feedbackForm.unit_number) {
      fetchSuggestions(feedbackForm.textbook_code, feedbackForm.unit_number);
    } else {
      setSuggestData(null);
    }
  }, [feedbackForm.textbook_code, feedbackForm.unit_number]);

  const fetchSuggestions = async (code, unit) => {
    setLoadingSuggest(true);
    try {
      const res = await fetch(`${API_BASE_URL}/textbooks/suggest?textbook_code=${encodeURIComponent(code)}&unit_number=${encodeURIComponent(unit)}`, {
        headers: { 'X-API-Key': 'DEMO_KEY' }
      });
      const json = await res.json();
      if (json.data && json.data.has_content) {
        setSuggestData(json.data);
      } else {
        setSuggestData(null);
      }
    } catch (e) {
      setSuggestData(null);
    }
    setLoadingSuggest(false);
  };

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
      textbook_code: cls.textbook_code || '',
      unit_number: cls.unit_number || '',
      page_from: cls.page_from || '',
      page_to: cls.page_to || '',
      status: cls.status || 'completed'
    });
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

  const addPronError = () => setPronErrors([...pronErrors, { wrong: '', right: '' }]);
  const removePronError = (i) => setPronErrors(pronErrors.filter((_, idx) => idx !== i));
  const updatePronError = (i, field, val) => setPronErrors(pronErrors.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  const addGramError = () => setGramErrors([...gramErrors, { wrong: '', right: '' }]);
  const removeGramError = (i) => setGramErrors(gramErrors.filter((_, idx) => idx !== i));
  const updateGramError = (i, field, val) => setGramErrors(gramErrors.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-500 font-medium">加载中，请稍候...</p>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center border-0 shadow-lg">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">教师不存在</h2>
          <p className="text-gray-500 text-sm">请检查链接或教师ID是否正确</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center shadow-inner">
                <User className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{teacher.name} 的教师门户</h1>
                <p className="text-sm text-gray-500 font-medium">
                  {teacher.subjects?.length > 0 ? `可授科目：${teacher.subjects.join(', ')}` : '未设置授课科目'}
                </p>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-500 bg-gray-50 px-4 py-2 rounded-lg">
              {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-primary-100 rounded-lg">
              <Calendar className="w-5 h-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">今日课程 <span className="text-gray-400 font-normal text-sm ml-1">({todayClasses.length})</span></h2>
          </div>
          
          {todayClasses.length === 0 ? (
            <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50 shadow-none">
              <CardContent className="p-12 text-center text-gray-400">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <Clock className="w-8 h-8 text-gray-300" />
                </div>
                <p className="font-medium text-gray-500">今天没有安排课程</p>
                <p className="text-sm mt-1">您可以好好休息一下</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {todayClasses.map(cls => (
                <Card key={cls.id} className="hover:shadow-md hover:border-primary-200 transition-all group overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-primary-400 to-primary-600"></div>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-50 rounded text-gray-500">
                          <Clock className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-gray-800 text-lg">
                          {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                        </span>
                      </div>
                      <Badge variant={STATUS_VARIANTS[cls.status]}>
                        {STATUS_LABELS[cls.status]}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 mb-5">
                      <div className="flex items-center gap-3 text-sm">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-700">{cls.student_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <BookOpen className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{cls.subject}</span>
                      </div>
                    </div>
                    
                    {cls.status === 'scheduled' ? (
                      <Button
                        variant="primary"
                        onClick={() => handleOpenFeedback(cls)}
                        className="w-full shadow-sm"
                      >
                        提交上课反馈
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => handleOpenFeedback(cls)}
                        className="w-full text-primary-600 border-primary-200 hover:bg-primary-50"
                      >
                        编辑反馈
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-blue-100 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">即将到来 <span className="text-gray-400 font-normal text-sm ml-1">({upcomingClasses.length})</span></h2>
            </div>
            
            {upcomingClasses.length > 0 ? (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/80 border-b border-gray-100 text-gray-500 font-medium">
                      <tr>
                        <th className="px-5 py-3.5">日期/时间</th>
                        <th className="px-5 py-3.5">学生</th>
                        <th className="px-5 py-3.5">科目</th>
                        <th className="px-5 py-3.5">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {upcomingClasses.map(cls => (
                        <tr key={cls.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3 text-gray-800">
                            <div className="font-medium">{cls.date}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{formatTime(cls.start_time)} - {formatTime(cls.end_time)}</div>
                          </td>
                          <td className="px-5 py-3 font-medium text-gray-700">{cls.student_name}</td>
                          <td className="px-5 py-3 text-gray-600">{cls.subject}</td>
                          <td className="px-5 py-3">
                            <Badge variant={STATUS_VARIANTS[cls.status]}>{STATUS_LABELS[cls.status]}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <div className="text-sm text-gray-400 p-4 border border-dashed rounded-lg bg-gray-50 text-center">暂无即将到来的排课</div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-gray-100 rounded-lg">
                <Clock className="w-5 h-5 text-gray-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">历史记录 <span className="text-gray-400 font-normal text-sm ml-1">(最近20节)</span></h2>
            </div>
            
            {pastClasses.length > 0 ? (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/80 border-b border-gray-100 text-gray-500 font-medium">
                      <tr>
                        <th className="px-5 py-3.5">日期/学生</th>
                        <th className="px-5 py-3.5">科目</th>
                        <th className="px-5 py-3.5">状态/反馈</th>
                        <th className="px-5 py-3.5">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pastClasses.map(cls => (
                        <tr key={cls.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-800">{cls.student_name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{cls.date} · {formatTime(cls.start_time)}</div>
                          </td>
                          <td className="px-5 py-3 text-gray-600">{cls.subject}</td>
                          <td className="px-5 py-3">
                            <div className="flex flex-col gap-1.5">
                              <Badge variant={STATUS_VARIANTS[cls.status]}>{STATUS_LABELS[cls.status]}</Badge>
                              {cls.status !== 'scheduled' ? (
                                <span className="text-xs text-success-600 flex items-center gap-1 font-medium">
                                  <CheckCircle className="w-3 h-3" /> 已提交
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 flex items-center gap-1 font-medium">
                                  <XCircle className="w-3 h-3" /> 未提交
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => handleOpenFeedback(cls)}
                              className="text-primary-600 hover:text-primary-800 hover:bg-primary-50 p-1.5 rounded transition-colors"
                              title={cls.status !== 'scheduled' ? '编辑反馈' : '填写反馈'}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <div className="text-sm text-gray-400 p-4 border border-dashed rounded-lg bg-gray-50 text-center">暂无历史排课</div>
            )}
          </section>
        </div>
      </div>

      {/* 📝 课堂反馈弹窗 (Refactored) */}
      {showFeedbackModal && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl border-0 overflow-hidden">
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />
                课堂反馈 - {selectedClass.student_name}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowFeedbackModal(false)} className="w-8 h-8 p-0 rounded-full">
                <XCircle className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-gray-50/50">
              {/* 左侧：课件预览区 */}
              <div className="w-full md:w-5/12 border-r border-gray-100 bg-white flex flex-col">
                <div className="p-3 border-b border-gray-50 bg-gray-50/50 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">关联课件预览</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {selectedClass.textbook_name ? (
                    <div className="space-y-4">
                      <div className="text-sm font-bold text-gray-800">{selectedClass.textbook_name}</div>
                      <div className="text-xs text-gray-500 mb-2">进度: P.{selectedClass.progress_start_page} - P.{selectedClass.progress_end_page}</div>
                      
                      {selectedClass.pdf_url ? (
                        <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative group flex items-center justify-center">
                          <BookOpen className="w-8 h-8 text-gray-300" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <a 
                              href={`${selectedClass.pdf_url}#page=${selectedClass.progress_start_page || 1}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-50"
                            >
                              打开教材 PDF
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-[3/4] bg-gray-50 rounded-lg border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                          <FileText className="w-8 h-8 mb-2 opacity-50" />
                          <span className="text-xs">该教材暂未上传PDF</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <BookOpen className="w-8 h-8 mb-2 opacity-50" />
                      <span className="text-sm">本节课未关联教材</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：反馈表单区 */}
              <div className="w-full md:w-7/12 flex-1 overflow-y-auto p-5 space-y-5">
                <form id="feedbackForm" onSubmit={submitFeedback} className="space-y-6">
                  
                  {/* Block 1: 新词汇 */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-4 bg-primary-500 rounded-full"></span> 新词汇 (New Words)
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addVocab} className="h-7 text-xs py-0">
                        <Plus className="w-3 h-3 mr-1" /> 添加
                      </Button>
                    </div>
                    {vocabList.length === 0 && <p className="text-xs text-gray-400 mb-2">点击右侧按钮添加新词汇记录</p>}
                    <div className="space-y-2">
                      {vocabList.map((v, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={v.word}
                            onChange={(e) => updateVocab(i, 'word', e.target.value)}
                            placeholder="单词 (e.g. Apple)"
                            className="w-1/3 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                          />
                          <input
                            type="text"
                            value={v.meaning}
                            onChange={(e) => updateVocab(i, 'meaning', e.target.value)}
                            placeholder="释义 (e.g. 苹果)"
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                          />
                          <button type="button" onClick={() => removeVocab(i)} className="text-gray-400 hover:text-danger-500 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Block 2: 发音纠正 */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-4 bg-warning-400 rounded-full"></span> 发音纠正 (Pronunciation)
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setPronErrors([{ wrong: 'No errors today', right: 'Perfect!' }])} className="h-7 text-xs py-0">
                          今日无错误
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={addPronError} className="h-7 text-xs py-0">
                          <Plus className="w-3 h-3 mr-1" /> 添加
                        </Button>
                      </div>
                    </div>
                    {pronErrors.length === 0 && <p className="text-xs text-gray-400 mb-2">记录学生读错的发音...</p>}
                    <div className="space-y-2">
                      {pronErrors.map((err, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={err.wrong}
                            onChange={(e) => updatePronError(i, 'wrong', e.target.value)}
                            placeholder="✗ 错误 (e.g. aple)"
                            className="flex-1 px-3 py-1.5 text-sm border border-danger-200 bg-danger-50 text-danger-900 rounded-lg focus:ring-2 focus:ring-danger-500"
                          />
                          <span className="text-gray-400 text-sm">→</span>
                          <input
                            type="text"
                            value={err.right}
                            onChange={(e) => updatePronError(i, 'right', e.target.value)}
                            placeholder="✓ 正确 (e.g. apple)"
                            className="flex-1 px-3 py-1.5 text-sm border border-success-200 bg-success-50 text-success-900 rounded-lg focus:ring-2 focus:ring-success-500"
                          />
                          <button type="button" onClick={() => removePronError(i)} className="text-gray-400 hover:text-danger-500 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Block 3: 语法纠正 */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-4 bg-purple-500 rounded-full"></span> 语法纠正 (Grammar)
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setGramErrors([{ wrong: 'No errors today', right: 'Good grammar!' }])} className="h-7 text-xs py-0">
                          今日无错误
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={addGramError} className="h-7 text-xs py-0">
                          <Plus className="w-3 h-3 mr-1" /> 添加
                        </Button>
                      </div>
                    </div>
                    {gramErrors.length === 0 && <p className="text-xs text-gray-400 mb-2">记录需要纠正的句子结构...</p>}
                    <div className="space-y-2">
                      {gramErrors.map((err, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={err.wrong}
                            onChange={(e) => updateGramError(i, 'wrong', e.target.value)}
                            placeholder="✗ 错误句子"
                            className="flex-1 px-3 py-1.5 text-sm border border-danger-200 bg-danger-50 text-danger-900 rounded-lg focus:ring-2 focus:ring-danger-500"
                          />
                          <span className="text-gray-400 text-sm">→</span>
                          <input
                            type="text"
                            value={err.right}
                            onChange={(e) => updateGramError(i, 'right', e.target.value)}
                            placeholder="✓ 正确句子"
                            className="flex-1 px-3 py-1.5 text-sm border border-success-200 bg-success-50 text-success-900 rounded-lg focus:ring-2 focus:ring-success-500"
                          />
                          <button type="button" onClick={() => removeGramError(i)} className="text-gray-400 hover:text-danger-500 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Block 4: 老师评语 */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="font-bold text-gray-800 text-sm flex items-center gap-1.5 mb-3">
                      <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span> 综合评语 (Overall Feedback)
                    </div>
                    <textarea
                      value={feedbackForm.fb_teacher_message || ''}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_teacher_message: e.target.value })}
                      rows={4}
                      placeholder="肯定表现 → 具体亮点 → 提升建议..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* Block 5 & 6: 作业与预告 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="font-bold text-gray-800 text-sm flex items-center gap-1.5 mb-3">
                        <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span> 课后作业
                      </div>
                      <textarea
                        value={feedbackForm.fb_homework || ''}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_homework: e.target.value })}
                        rows={2}
                        placeholder="选填..."
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 mb-2"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {PRACTICE_TEMPLATES.map((tpl, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setFeedbackForm({ ...feedbackForm, fb_homework: (feedbackForm.fb_homework || '') + (feedbackForm.fb_homework ? '\n' : '') + tpl })}
                            className="text-[10px] px-2 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-primary-50 hover:text-primary-700 transition-colors"
                          >
                            + {tpl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="font-bold text-gray-800 text-sm flex items-center gap-1.5 mb-3">
                        <span className="w-1.5 h-4 bg-teal-500 rounded-full"></span> 下节课预告
                      </div>
                      <textarea
                        value={feedbackForm.fb_next_preview || ''}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, fb_next_preview: e.target.value })}
                        rows={3}
                        placeholder="选填..."
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  {/* 课程状态 */}
                  {selectedClass.status === 'scheduled' && (
                    <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 shadow-sm">
                      <label className="block text-sm font-bold text-primary-900 mb-2">完课确认</label>
                      <select
                        value={feedbackForm.status}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, status: e.target.value })}
                        className="w-full px-3 py-2 border border-primary-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 text-sm font-medium"
                      >
                        <option value="completed">✅ 已完成 (正常扣课时)</option>
                        <option value="absent">❌ 学生缺席 (不扣课时)</option>
                        <option value="cancelled">🚫 已取消 (不扣课时)</option>
                      </select>
                    </div>
                  )}
                  
                </form>
              </div>
            </div>

            <div className="shrink-0 p-4 border-t border-gray-100 bg-white flex justify-end gap-3 rounded-b-xl">
              <Button type="button" variant="outline" onClick={() => setShowFeedbackModal(false)}>取消</Button>
              <Button type="submit" variant="primary" form="feedbackForm">
                {selectedClass.status !== 'scheduled' ? '保存修改' : '提交反馈'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
