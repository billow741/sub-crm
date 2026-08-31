import { useState, useEffect, useCallback } from 'react';
import { Users, Package, CreditCard, Calendar, AlertTriangle, ArrowRight, Loader2, Clock, Receipt } from 'lucide-react';
import { getStats, getTodayClasses } from '../store';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

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
      <div className="p-4 md:p-8 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-64"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent>
                <div className="h-10 w-10 bg-gray-200 rounded-lg mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <Card className="border-danger-200 bg-danger-50">
          <CardContent className="text-center py-8">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-danger-500" aria-hidden="true" />
            <h3 className="text-lg font-medium text-danger-800 mb-2">加载失败</h3>
            <p className="text-danger-600 mb-4">{error}</p>
            <button
              onClick={loadStats}
              className="px-4 py-2 bg-danger-500 text-white rounded-lg hover:bg-danger-600 transition-colors focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:outline-none"
            >
              重试
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    {
      title: '今日课程',
      value: stats?.todayClasses || 0,
      icon: Calendar,
      color: 'bg-primary-500',
    },
    {
      title: '本月新增学生',
      value: stats?.newStudentsThisMonth || 0,
      icon: Users,
      color: 'bg-success-500',
    },
    {
      title: '活跃学生',
      value: stats?.activeStudents || 0,
      icon: Users,
      color: 'bg-indigo-500',
    },
    {
      title: '本月消课数',
      value: stats?.classesThisMonth || 0,
      icon: Package,
      color: 'bg-warning-500',
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
      color: 'bg-danger-500',
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
        <p className="text-gray-500 mt-1">欢迎使用阳光桥 CRM 系统</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6 mb-6 md:mb-8">
        {statCards.map((card, index) => (
          <Card key={index}>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className={`${card.color} p-3 rounded-lg shadow-sm`}>
                  <card.icon className="w-5 h-5 md:w-6 md:h-6 text-white" aria-hidden="true" />
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-bold text-gray-800">{card.value}</div>
              <div className="text-sm text-gray-500 mt-1">{card.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8">
        {/* 主要内容区 (占 2 栏) */}
        <div className="xl:col-span-2 space-y-6 md:space-y-8">
          {/* 今日课程 */}
          {todayClasses.length > 0 && (
            <Card>
              <CardContent>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <Clock className="w-5 h-5 text-primary-600" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">今日课程</h2>
                    <p className="text-sm text-gray-500">即将上课的安排</p>
                  </div>
                  <Badge variant="primary" className="ml-auto">
                    {todayClasses.length} 节
                  </Badge>
                </div>
                <div className="space-y-3">
                  {todayClasses.map((cls) => (
                    <div key={cls.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="text-center min-w-[70px]">
                          <div className="text-xl md:text-2xl font-bold text-primary-600">
                            {cls.start_time?.substring(0, 5) || '--:--'}
                          </div>
                          <div className="text-xs text-gray-500">-{cls.end_time?.substring(0, 5) || '--:--'}</div>
                        </div>
                        <div className="hidden sm:block w-px h-10 bg-gray-200"></div>
                        <div>
                          <div className="font-medium text-gray-800">{cls.student_name || '未知学生'}</div>
                          <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                            <span className="truncate max-w-[120px]" title={cls.teacher}>{cls.teacher || '未指定老师'}</span>
                            <span>·</span>
                            <span className="truncate max-w-[120px]" title={cls.subject}>{cls.subject || '未指定科目'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-left sm:text-right flex items-center justify-between sm:block">
                        <span className="sm:hidden text-sm text-gray-500">状态：</span>
                        <Badge variant={cls.status === 'scheduled' ? 'success' : 'default'}>
                          {cls.status === 'scheduled' ? '已预约' : cls.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 快捷操作 */}
          <Card>
            <CardContent>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">快捷操作</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <Link
                  to="/students?action=add"
                  className="flex flex-col items-center justify-center p-4 md:p-6 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none group"
                >
                  <Users className="w-6 h-6 md:w-8 md:h-8 mb-2 md:mb-3 text-primary-500 group-hover:scale-110 transition-transform duration-200" aria-hidden="true" />
                  <span className="text-sm md:text-base text-primary-700 font-medium">添加学生</span>
                </Link>
                <Link
                  to="/payments?action=add"
                  className="flex flex-col items-center justify-center p-4 md:p-6 bg-success-50 rounded-lg hover:bg-success-100 transition-colors focus-visible:ring-2 focus-visible:ring-success-500 focus-visible:outline-none group"
                >
                  <CreditCard className="w-6 h-6 md:w-8 md:h-8 mb-2 md:mb-3 text-success-500 group-hover:scale-110 transition-transform duration-200" aria-hidden="true" />
                  <span className="text-sm md:text-base text-success-700 font-medium">添加收款</span>
                </Link>
                <Link
                  to="/settings"
                  className="flex flex-col items-center justify-center p-4 md:p-6 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:outline-none group col-span-2 md:col-span-1"
                >
                  <Package className="w-6 h-6 md:w-8 md:h-8 mb-2 md:mb-3 text-gray-500 group-hover:scale-110 transition-transform duration-200" aria-hidden="true" />
                  <span className="text-sm md:text-base text-gray-700 font-medium">数据管理</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 侧边栏 (占 1 栏) */}
        <div className="space-y-6 md:space-y-8">
          {/* 课时预警 */}
          <Card>
            <CardContent>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-danger-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-danger-600" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">课时预警</h2>
                </div>
                {stats?.warningStudents > 0 && (
                  <Badge variant="danger" className="ml-auto">
                    {stats.warningStudents} 人
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-4">剩余课时不足 3 节的学生</p>

              {stats?.warningStudentDetails?.length > 0 ? (
                <div className="space-y-3">
                  {stats.warningStudentDetails.map((student) => (
                    <Link
                      key={student.id}
                      to={`/students/${student.id}`}
                      className="flex items-center justify-between p-3 md:p-4 bg-danger-50 rounded-lg hover:bg-danger-100 transition-colors focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:outline-none group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white shadow-sm border border-danger-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-danger-600 font-medium">
                            {student.name?.charAt(0) || '学'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 truncate">{student.name}</div>
                          <div className="text-xs md:text-sm text-gray-500 truncate">{student.phone}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-danger-600 shrink-0">
                        <span className="font-semibold text-sm">剩 {student.remaining_hours || 0} 节</span>
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-50" aria-hidden="true" />
                  <p className="text-sm">暂无课时预警</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
