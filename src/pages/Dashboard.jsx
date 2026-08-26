import { useState, useEffect, useCallback } from 'react';
import { Users, Package, CreditCard, Calendar, AlertTriangle, ArrowRight, Loader2, Clock, Receipt } from 'lucide-react';
import { getStats, getTodayClasses } from '../store';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [todayClasses, setTodayClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, classes] = await Promise.all([getStats(), getTodayClasses()]);
      setStats(data);
      setTodayClasses(classes);
    } catch (err) {
      console.error('加载统计失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-red-500" />
          <h3 className="text-lg font-medium text-red-800 mb-2">加载失败</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadStats}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: '今日课程',
      value: stats?.todayClasses || 0,
      icon: Calendar,
      color: 'bg-blue-500',
    },
    {
      title: '本月新增学生',
      value: stats?.newStudentsThisMonth || 0,
      icon: Users,
      color: 'bg-green-500',
    },
    {
      title: '活跃学生',
      value: stats?.activeStudents || 0,
      icon: Users,
      color: 'bg-purple-500',
    },
    {
      title: '本月消课数',
      value: stats?.classesThisMonth || 0,
      icon: Package,
      color: 'bg-orange-500',
    },
    {
      title: '本月收入',
      value: `¥${(stats?.revenueThisMonth || 0).toLocaleString()}`,
      icon: CreditCard,
      color: 'bg-emerald-500',
    },
    {
      title: '待收账款',
      value: `¥${(stats?.pendingReceivables || 0).toLocaleString()}`,
      icon: Receipt,
      color: 'bg-amber-500',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
        <p className="text-gray-500 mt-1">欢迎使用阳光桥 CRM 系统</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
        {statCards.map((card, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.color} p-3 rounded-lg`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800">{card.value}</div>
            <div className="text-sm text-gray-500 mt-1">{card.title}</div>
          </div>
        ))}
      </div>

      {/* 今日课程 */}
        {todayClasses.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-800">今日课程</h2>
                <p className="text-sm text-gray-500">即将上课的安排</p>
              </div>
              <span className="ml-auto bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                {todayClasses.length} 节
              </span>
            </div>
            <div className="space-y-3">
              {todayClasses.map((cls) => (
                <div key={cls.id} className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {cls.start_time?.substring(0, 5) || '--:--'}
                      </div>
                      <div className="text-xs text-gray-500">-{cls.end_time?.substring(0, 5) || '--:--'}</div>
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">{cls.student_name || '未知学生'}</div>
                      <div className="text-sm text-gray-500">
                        {cls.teacher || '未指定老师'} · {cls.subject || '未指定科目'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                      {cls.status === 'scheduled' ? '已预约' : cls.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 课时预警 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">课时预警</h2>
            <p className="text-sm text-gray-500">剩余课时不足 3 节的学生</p>
          </div>
          {stats?.warningStudents > 0 && (
            <span className="ml-auto bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
              {stats.warningStudents} 人
            </span>
          )}
        </div>

        {stats?.warningStudentDetails?.length > 0 ? (
          <div className="space-y-3">
            {stats.warningStudentDetails.map((student) => (
              <Link
                key={student.id}
                to={`/students/${student.id}`}
                className="flex items-center justify-between p-4 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center">
                    <span className="text-red-700 font-medium">
                      {student.name?.charAt(0) || '学'}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-800">{student.name}</div>
                    <div className="text-sm text-gray-500">{student.phone}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-red-600">
                  <span className="font-semibold">剩余 {student.remaining_hours || 0} 节</span>
                  <ArrowRight size={16} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无课时预警</p>
          </div>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">快捷操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/students?action=add"
            className="p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors text-center"
          >
            <Users className="w-8 h-8 mx-auto mb-2 text-primary-600" />
            <div className="text-primary-700 font-medium">添加学生</div>
          </Link>
          <Link
            to="/payments?action=add"
            className="p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors text-center"
          >
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-green-600" />
            <div className="text-green-700 font-medium">添加收款</div>
          </Link>
          <Link
            to="/settings"
            className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center"
          >
            <Package className="w-8 h-8 mx-auto mb-2 text-gray-600" />
            <div className="text-gray-700 font-medium">导出/导入数据</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
