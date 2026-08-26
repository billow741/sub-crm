import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, User, BookOpen, Lock, AlertCircle } from 'lucide-react';

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

  const API_BASE = 'https://api.changtian.dpdns.org/api/v1';

  useEffect(() => {
    loadTeacherInfo();
  }, [token]);

  const loadTeacherInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      // 获取教师信息
      const res = await fetch(`${API_BASE}/teacher/share/${token}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error.message);
        setLoading(false);
        return;
      }

      setTeacher(data.data);

      // 加载课程数据
      await loadClassData(data.data.id);
    } catch (err) {
      setError('加载失败，请检查链接是否正确');
    }
    setLoading(false);
  };

  const loadClassData = async (teacherId) => {
    try {
      // 获取上课记录
      const classesRes = await fetch(`${API_BASE}/classes`);
      const classesData = await classesRes.json();
      const allClasses = classesData.data?.data || [];

      // 过滤该教师的课程
      const teacherClasses = allClasses.filter(c => c.teacher_id === teacherId);

      // 获取学生列表（用于显示学生姓名）
      const studentsRes = await fetch(`${API_BASE}/students`);
      const studentsData = await studentsRes.json();
      const students = studentsData.data?.data || [];
      const studentMap = {};
      students.forEach(s => { studentMap[s.id] = s.name; });

      // 添加学生姓名
      const classesWithNames = teacherClasses.map(c => ({
        ...c,
        student_name: c.student_name || studentMap[c.student_id] || '未知学生'
      }));

      // 分类
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
    // 实际提交逻辑需要在验证后实现
    // 这里简化处理
    alert('反馈提交功能需要进一步开发');
  };

  const formatTime = (time) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">链接无效</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
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
                <h1 className="text-xl font-bold text-gray-900">{teacher?.name} 的教师门户</h1>
                <p className="text-sm text-gray-500">
                  {teacher?.subjects?.length > 0 && `可授科目：${teacher.subjects.join(', ')}`}
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* 未验证提示 */}
        {!verified && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <Lock className="w-5 h-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">需要验证身份</p>
              <p className="text-sm text-yellow-600">提交反馈前请输入密码验证身份</p>
            </div>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="ml-auto px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              验证身份
            </button>
          </div>
        )}

        {/* 今日课程 */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-600" />
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
                  {cls.status === 'scheduled' && (
                    <button
                      onClick={() => handleOpenFeedback(cls)}
                      className={`mt-4 w-full py-2 text-white rounded-lg text-sm ${
                        verified ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {verified ? '提交上课反馈' : '需验证身份'}
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
            <h2 className="text-lg font-semibold text-gray-900 mb-3">即将到来 ({upcomingClasses.length})</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">日期</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">学生</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">科目</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {upcomingClasses.map(cls => (
                    <tr key={cls.id}>
                      <td className="px-4 py-3 text-sm">{cls.date}</td>
                      <td className="px-4 py-3 text-sm">{formatTime(cls.start_time)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{cls.student_name}</td>
                      <td className="px-4 py-3 text-sm">{cls.subject}</td>
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
            <h2 className="text-lg font-semibold text-gray-900 mb-3">历史记录 (最近20节)</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">日期</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">学生</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">科目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pastClasses.map(cls => (
                    <tr key={cls.id}>
                      <td className="px-4 py-3 text-sm">{cls.date}</td>
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
      </div>

      {/* 密码验证弹窗 */}
      {showPasswordModal && !verified && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-6 h-6 text-purple-600" />
              <h2 className="text-xl font-bold">验证身份</h2>
            </div>
            <p className="text-gray-600 mb-4">请输入您的密码以提交反馈</p>

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-red-500 text-sm mt-1">{passwordError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={verifying}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {verifying ? '验证中...' : '确认'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
