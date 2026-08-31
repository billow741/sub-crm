import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, User, BookOpen, Lock, AlertCircle, Calendar, CheckCircle } from 'lucide-react';
import { API_BASE_URL } from '../store';
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

export default function TeacherShare() {
  const { token } = useParams();
  const [teacher, setTeacher] = useState(null);
  const [todayClasses, setTodayClasses] = useState([]);
  const [upcomingClasses, setUpcomingClasses] = useState([]);
  const [pastClasses, setPastClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 密码验证状态
  const [verified, setVerified] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // 反馈相关
  const [selectedClass, setSelectedClass] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    content: '',
    homework: '',
    notes: '',
    status: 'completed'
  });

  const API_BASE = API_BASE_URL;

  useEffect(() => {
    loadTeacherInfo();
  }, [token]);

  const loadTeacherInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/teacher/share/${token}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error.message);
        setLoading(false);
        return;
      }

      setTeacher(data.data);
      await loadClassData(data.data.id);
    } catch (err) {
      setError('加载失败，请检查链接是否正确');
    }
    setLoading(false);
  };

  const loadClassData = async (teacherId) => {
    try {
      const classesRes = await fetch(`${API_BASE}/classes`);
      const classesData = await classesRes.json();
      const allClasses = classesData.data?.data || [];

      const teacherClasses = allClasses.filter(c => c.teacher_id === teacherId);

      const studentsRes = await fetch(`${API_BASE}/students`);
      const studentsData = await studentsRes.json();
      const students = studentsData.data?.data || [];
      const studentMap = {};
      students.forEach(s => { studentMap[s.id] = s.name; });

      const classesWithNames = teacherClasses.map(c => ({
        ...c,
        student_name: c.student_name || studentMap[c.student_id] || '未知学生'
      }));

      const today = new Date().toISOString().split('T')[0];
      const todayCls = classesWithNames.filter(c => c.date === today && c.status === 'scheduled');
      const upcoming = classesWithNames.filter(c => c.date > today && c.status === 'scheduled');
      const past = classesWithNames.filter(c => c.date < today || c.status !== 'scheduled');

      todayCls.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      upcoming.sort((a, b) => a.date.localeCompare(b.date));
      past.sort((a, b) => b.date.localeCompare(a.date));

      setTodayClasses(todayCls);
      setUpcomingClasses(upcoming.slice(0, 10));
      setPastClasses(past.slice(0, 20));
    } catch (err) {
      console.error('Load class error:', err);
    }
  };

  const handleVerifyPassword = async (e) => {
    e.preventDefault();
    setVerifying(true);
    setPasswordError('');

    try {
      const res = await fetch(`${API_BASE}/teacher/share/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (data.error) {
        setPasswordError(data.error.message);
      } else {
        setVerified(true);
        setShowPasswordModal(false);
      }
    } catch (err) {
      setPasswordError('验证失败，请重试');
    }
    setVerifying(false);
  };

  const handleOpenFeedback = (cls) => {
    if (!verified) {
      setShowPasswordModal(true);
      return;
    }
    setSelectedClass(cls);
    setFeedbackForm({
      content: cls.content || '',
      homework: cls.homework || '',
      notes: cls.notes || '',
      status: 'completed'
    });
    setShowFeedbackModal(true);
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    alert('外部分享链接的反馈提交功能正在升级中...');
    setShowFeedbackModal(false);
  };

  const formatTime = (time) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-500 font-medium">加载中，请稍候...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center border-0 shadow-lg">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">链接无效或已过期</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* 沉浸式顶部导航 */}
      <div className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center shadow-inner">
                <User className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{teacher?.name} 的专属门户</h1>
                <p className="text-sm text-gray-500 font-medium">
                  {teacher?.subjects?.length > 0 ? `可授科目：${teacher.subjects.join(', ')}` : '线上授课端'}
                </p>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-500 bg-gray-50 px-4 py-2 rounded-lg flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* 密码未验证提示 */}
        {!verified && (
          <div className="bg-gradient-to-r from-warning-50 to-warning-100/50 border border-warning-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
            <div className="p-3 bg-white/80 rounded-full shrink-0">
              <Lock className="w-6 h-6 text-warning-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-warning-900 text-lg">需验证身份</p>
              <p className="text-sm text-warning-700 mt-1">您目前处于只读模式。如需提交课后反馈、查看详细信息，请输入专属访问密码。</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowPasswordModal(true)}
              className="bg-white border-warning-300 text-warning-700 hover:bg-warning-50 whitespace-nowrap shrink-0"
            >
              验证身份
            </Button>
          </div>
        )}

        {/* 今日课程 */}
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
                    
                    {cls.status === 'scheduled' && (
                      <Button
                        variant={verified ? 'primary' : 'outline'}
                        onClick={() => handleOpenFeedback(cls)}
                        className={`w-full ${!verified ? 'border-dashed border-gray-300 text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700' : 'shadow-sm'}`}
                      >
                        {verified ? '提交上课反馈' : '需验证身份提交反馈'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 即将到来的课程 */}
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {upcomingClasses.map(cls => (
                        <tr key={cls.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3 text-gray-800">
                            <div className="font-medium">{cls.date}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{formatTime(cls.start_time)}</div>
                          </td>
                          <td className="px-5 py-3 font-medium text-gray-700">{cls.student_name}</td>
                          <td className="px-5 py-3 text-gray-600">{cls.subject}</td>
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

          {/* 历史课程 */}
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
                        <th className="px-5 py-3.5">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pastClasses.map(cls => (
                        <tr key={cls.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-800">{cls.student_name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{cls.date}</div>
                          </td>
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
              <div className="text-sm text-gray-400 p-4 border border-dashed rounded-lg bg-gray-50 text-center">暂无历史排课记录</div>
            )}
          </section>
        </div>
      </div>

      {/* 密码验证弹窗 */}
      {showPasswordModal && !verified && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <Card className="w-full max-w-sm shadow-2xl border-0 overflow-hidden">
            <div className="h-2 bg-warning-500"></div>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-warning-50 rounded-full flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-warning-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">验证教师身份</h2>
                <p className="text-sm text-gray-500">为了保护学生隐私并提交反馈，请输入您的专属访问密码。</p>
              </div>

              <form onSubmit={handleVerifyPassword} className="space-y-5">
                <div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入访问密码..."
                    className="w-full px-4 py-3 text-center tracking-widest text-lg border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-warning-500/20 focus:border-warning-500 transition-all outline-none"
                    autoFocus
                  />
                  {passwordError && (
                    <p className="text-danger-500 text-sm mt-2 text-center animate-in slide-in-from-top-1">{passwordError}</p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPasswordModal(false)}
                    className="flex-1"
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={verifying || !password}
                    className="flex-1 bg-warning-600 hover:bg-warning-700 text-white"
                  >
                    {verifying ? '验证中...' : '确认进入'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 简单的反馈弹窗 (如果验证后点击了反馈) */}
      {showFeedbackModal && verified && selectedClass && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <Card className="w-full max-w-md shadow-2xl border-0">
            <CardHeader className="flex justify-between items-center border-b border-gray-100">
              <h3 className="font-bold text-lg">快速提交反馈</h3>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm text-gray-600 mb-4">当前系统处于预览状态，完整反馈表单请在教师后台使用。</p>
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="font-medium">{selectedClass.student_name}</div>
                <div className="text-sm text-gray-500">{selectedClass.date} {formatTime(selectedClass.start_time)}</div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowFeedbackModal(false)}>关闭</Button>
                <Button variant="primary" onClick={handleSubmitFeedback}>我知道了</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
