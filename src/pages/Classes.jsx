import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Plus, Trash2, User, Clock, Search, CheckCircle, XCircle, AlertCircle, MessageSquare, FileText, ChevronLeft, ChevronRight, Filter, Loader2 } from 'lucide-react';
import { classOps, studentOps, packageOps } from '../store';
import { organizationOps, request } from '../store/api';
import OrgFilter from '../components/OrgFilter';
import { setSelectedOrg } from '../store/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

function Classes() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [packages, setPackages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrgState] = useState('');
  const [quickFilter, setQuickFilter] = useState({ teacher: '', status: '', dateRange: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;
  const [newClass, setNewClass] = useState({
    studentId: '',
    packageId: '',
    date: new Date().toISOString().slice(0, 10),
    hours: 1,
    teacher: '',
    notes: ''
  });
  const [orgs, setOrgs] = useState([]);
  const [assessments, setAssessments] = useState([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const classParams = {};
      if (selectedOrg) classParams.org_id = selectedOrg;
      const [classesData, studentsData, packagesData] = await Promise.all([
        classOps.getAll(classParams),
        studentOps.getAll(),
        packageOps.getAll()
      ]);

      // 加载评估报告
      try {
        const aResp = await request('/assessments?page_size=1000');
        const aData = aResp?.data?.data || aResp?.data || [];
        setAssessments(Array.isArray(aData) ? aData : []);
      } catch(e) { console.error('Load assessments:', e); }

      // 转换字段名 snake_case -> camelCase
      const normalizedClasses = (Array.isArray(classesData) ? classesData : []).map(cls => ({
        ...cls,
        studentId: cls.student_id ?? cls.studentId,
        packageId: cls.package_id ?? cls.packageId,
        teacherId: cls.teacher_id ?? cls.teacherId,
        studentName: cls.student_name,
        teacherName: cls.teacher_name,
        packageName: cls.package_name,
        startTime: cls.start_time,
        endTime: cls.end_time,
      }));

      const normalizedStudents = (Array.isArray(studentsData) ? studentsData : []).map(s => ({
        ...s,
        teacherId: s.teacher_id ?? s.teacherId,
      }));

      setClasses(normalizedClasses.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setStudents(normalizedStudents);
      setPackages(Array.isArray(packagesData) ? packagesData : []);

      // 加载机构列表
      try {
        const orgsData = await organizationOps.getAll();
        setOrgs(Array.isArray(orgsData) ? orgsData : []);
      } catch {
        setOrgs([]);
      }
    } catch (err) {
      console.error('Load error:', err);
      setClasses([]);
      setStudents([]);
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOrg]);

  useEffect(() => {
    loadData();
    if (orgs.length === 0) {
      organizationOps.getAll().then(data => setOrgs(data)).catch(() => {});
    }
  }, [loadData, orgs.length]);

  // orgId → orgName 映射
  const getOrgName = (orgId) => {
    if (!orgId) return '总部';
    const org = orgs.find(o => o.id === parseInt(orgId));
    return org ? org.name : '总部';
  };

  // 去重老师列表（不区分大小写，全大写保留，其他首字母大写）
  const uniqueTeachers = useMemo(() => {
    const seen = new Map();
    classes.forEach(c => {
      const t = (c.teacherName || c.teacher || '').trim();
      if (t && !seen.has(t.toLowerCase())) {
        // 全大写保持原样，其他转首字母大写
        const normalized = /[a-z]/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
        seen.set(t.toLowerCase(), normalized);
      }
    });
    return [...seen.values()].sort();
  }, [classes]);

  // 快捷日期范围
  const getDateRange = (range) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    switch (range) {
      case 'today': return { start: today, end: today };
      case 'thisWeek': {
        const day = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
      }
      case 'lastWeek': {
        const day = now.getDay();
        const lastMonday = new Date(now);
        lastMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        return { start: lastMonday.toISOString().split('T')[0], end: lastSunday.toISOString().split('T')[0] };
      }
      case 'thisMonth': {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { start: first.toISOString().split('T')[0], end: last.toISOString().split('T')[0] };
      }
      default: return null;
    }
  };

  const handleQuickFilter = (key, value) => {
    setQuickFilter(prev => ({
      ...prev,
      [key]: prev[key] === value ? '' : value
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setQuickFilter({ teacher: '', status: '', dateRange: '' });
    setCurrentPage(1);
  };

  const hasActiveFilter = searchTerm || quickFilter.teacher || quickFilter.status || quickFilter.dateRange;

  const filteredClasses = classes.filter(cls => {
    const student = students.find(s => s.id === cls.studentId);
    // 文本搜索
    const matchesSearch = !searchTerm ||
      student?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.teacher?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.date?.includes(searchTerm);
    // 教师筛选
    const matchesTeacher = !quickFilter.teacher ||
      cls.teacherName === quickFilter.teacher ||
      cls.teacher === quickFilter.teacher;
    // 状态筛选
    const matchesStatus = !quickFilter.status || cls.status === quickFilter.status;
    // 日期范围
    let matchesDate = true;
    if (quickFilter.dateRange) {
      const range = getDateRange(quickFilter.dateRange);
      if (range) {
        matchesDate = cls.date >= range.start && cls.date <= range.end;
      }
    }
    return matchesSearch && matchesTeacher && matchesStatus && matchesDate;
  });

  const handleAddClass = async () => {
    if (!newClass.studentId) return;

    await classOps.add(newClass.studentId, {
      packageId: newClass.packageId || null,
      date: newClass.date,
      hours: parseFloat(newClass.hours) || 1,
      teacher: newClass.teacher,
      notes: newClass.notes
    });

    loadData();
    setShowAddModal(false);
    setNewClass({
      studentId: '',
      packageId: '',
      date: new Date().toISOString().slice(0, 10),
      hours: 1,
      teacher: '',
      notes: ''
    });
  };

  const handleDelete = async (id) => {
    if (confirm('确定要删除这条上课记录吗？')) {
      await classOps.delete(id);
      loadData();
    }
  };

  // 分页计算
  const totalPages = Math.ceil(filteredClasses.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedClasses = filteredClasses.slice(startIndex, endIndex);

  // 搜索时重置页码
  useEffect(() => {
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const getStudentPackages = (studentId) => {
    return packages.filter(p => p.studentId === studentId);
  };

  const STATUS_LABELS = {
    completed: '已完成',
    scheduled: '待上课',
    cancelled: '已取消',
    absent: '缺课',
    pending: '待确认'
  };

  const STATUS_VARIANTS = {
    completed: 'success',
    scheduled: 'primary',
    cancelled: 'default',
    absent: 'danger',
    pending: 'warning'
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">上课记录</h1>
          <p className="text-gray-500 mt-1">共 {classes.length} 条记录</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="w-full sm:w-auto">
          <Plus size={20} className="mr-2" aria-hidden="true" /> 
          添加记录
        </Button>
      </div>

      {/* 搜索 */}
      <Card className="mb-6">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} aria-hidden="true" />
              <input
                type="text"
                placeholder="搜索学生姓名、老师或日期..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
              />
            </div>
            <div className="w-full sm:w-auto">
              <OrgFilter 
                selectedOrg={selectedOrg} 
                onChange={(orgId) => { setSelectedOrgState(orgId); setSelectedOrg(orgId); }} 
                className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              />
            </div>
          </div>

          {/* 快捷筛选 */}
          <div className="space-y-3">
            {/* 教师 */}
            {uniqueTeachers.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500 flex items-center gap-1 min-w-[40px]">
                  <Filter size={12} aria-hidden="true" />教师
                </span>
                {uniqueTeachers.map(t => (
                  <button
                    key={t}
                    onClick={() => handleQuickFilter('teacher', t)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                      quickFilter.teacher === t
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600'
                    }`}
                  >{t}</button>
                ))}
              </div>
            )}
            
            {/* 状态 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 min-w-[40px]">状态</span>
              {[...new Set(classes.map(c => c.status).filter(Boolean))].sort().map(s => ({ key: s, label: STATUS_LABELS[s] || s })).map(s => (
                <button
                  key={s.key}
                  onClick={() => handleQuickFilter('status', s.key)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                    quickFilter.status === s.key
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600'
                  }`}
                >{s.label}</button>
              ))}
            </div>
            
            {/* 日期 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 min-w-[40px]">日期</span>
              {[{ key: 'today', label: '今天' }, { key: 'thisWeek', label: '本周' }, { key: 'lastWeek', label: '上周' }, { key: 'thisMonth', label: '本月' }].map(d => (
                <button
                  key={d.key}
                  onClick={() => handleQuickFilter('dateRange', d.key)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                    quickFilter.dateRange === d.key
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600'
                  }`}
                >{d.label}</button>
              ))}
            </div>
          </div>

          {/* 已激活筛选标签 */}
          {hasActiveFilter && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">已筛选出 {filteredClasses.length} 条结果</span>
              <button 
                onClick={clearFilters} 
                className="text-sm text-primary-600 hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded px-1"
              >
                清除全部
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 记录列表 */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center space-x-4">
                <div className="rounded-full bg-gray-200 h-10 w-10"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {filteredClasses.length > 0 ? (
              <table className="w-full text-sm sm:text-base whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 md:px-6 py-4 text-left font-medium text-gray-500">日期</th>
                    <th className="px-4 md:px-6 py-4 text-left font-medium text-gray-500">学生</th>
                    <th className="px-4 md:px-6 py-4 text-left font-medium text-gray-500">课时</th>
                    <th className="px-4 md:px-6 py-4 text-left font-medium text-gray-500 hidden sm:table-cell">老师</th>
                    <th className="px-4 md:px-6 py-4 text-left font-medium text-gray-500 hidden lg:table-cell">所属机构</th>
                    <th className="px-4 md:px-6 py-4 text-left font-medium text-gray-500">状态</th>
                    <th className="px-4 md:px-6 py-4 text-left font-medium text-gray-500">反馈</th>
                    <th className="px-4 md:px-6 py-4 text-right font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedClasses.map(cls => {
                    const student = students.find(s => s.id === cls.studentId);
                    let displayName = '未知';
                    if (cls.studentName && student?.english_name) {
                      displayName = `${cls.studentName} (${student.english_name})`;
                    } else if (cls.studentName) {
                      displayName = cls.studentName;
                    } else if (student) {
                      displayName = student.english_name ? `${student.name} (${student.english_name})` : student.name;
                    }
                    const status = cls.status || 'pending';

                    return (
                      <tr key={cls.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 md:px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-gray-400" aria-hidden="true" />
                            <span className="text-gray-800">{cls.date}</span>
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center shrink-0 border border-primary-200/50">
                              <span className="text-primary-700 font-medium text-sm">
                                {displayName.charAt(0) || '学'}
                              </span>
                            </div>
                            <span className="font-medium text-gray-800">{displayName}</span>
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <div className="flex items-center gap-1 text-gray-700">
                            <Clock size={16} className="text-gray-400" aria-hidden="true" />
                            <span>{cls.hours} 节</span>
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4 text-gray-600 hidden sm:table-cell">
                          {cls.teacherName || cls.teacher || '-'}
                        </td>
                        <td className="px-4 md:px-6 py-4 hidden lg:table-cell">
                          <Badge variant="primary" className="bg-indigo-50 text-indigo-700">
                            {getOrgName(cls.organization_id)}
                          </Badge>
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <Badge variant={STATUS_VARIANTS[status] || 'default'}>
                            {STATUS_LABELS[status] || status}
                          </Badge>
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          {(cls.content || cls.homework || cls.fb_teacher_message || cls.fb_homework || cls.fb_vocab || cls.fb_patterns || cls.fb_grammar || cls.fb_pronunciation_errors || cls.fb_grammar_errors) ? (
                            <button
                              onClick={() => setShowFeedbackModal(cls)}
                              className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded p-1 -ml-1"
                            >
                              <MessageSquare size={16} aria-hidden="true" />
                              <span className="hidden sm:inline">查看反馈</span>
                            </button>
                          ) : (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id))) ? (
                            <button
                              onClick={() => setShowFeedbackModal(cls)}
                              className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded p-1 -ml-1"
                            >
                              <FileText size={16} aria-hidden="true" />
                              <span className="hidden sm:inline">查看报告</span>
                            </button>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 md:px-6 py-4 text-right">
                          <button
                            onClick={() => handleDelete(cls.id)}
                            className="p-2 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
                            aria-label="删除记录"
                          >
                            <Trash2 size={18} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                <FileText size={48} className="mb-4 text-gray-300" aria-hidden="true" />
                <p>{searchTerm ? '没有找到匹配的记录' : '暂无上课记录'}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 分页控制 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4">
          <div className="text-sm text-gray-500">
            显示 {startIndex + 1}-{Math.min(endIndex, filteredClasses.length)} 条，共 {filteredClasses.length} 条
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="px-4 py-2 text-sm font-medium">
              第 {currentPage} / {totalPages} 页
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {/* 添加记录弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-gray-800">添加上课记录</h2>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
              >
                关闭
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">学生 *</label>
                <select
                  value={newClass.studentId}
                  onChange={(e) => {
                    const studentId = Number(e.target.value);
                    setNewClass({ ...newClass, studentId, packageId: '' });
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">选择学生</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {newClass.studentId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">关联课时包</label>
                  <select
                    value={newClass.packageId}
                    onChange={(e) => setNewClass({ ...newClass, packageId: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">不关联</option>
                    {getStudentPackages(newClass.studentId).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (剩余 {p.remaining} 节)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
                  <input
                    type="date"
                    value={newClass.date}
                    onChange={(e) => setNewClass({ ...newClass, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">课时数</label>
                  <input
                    type="number"
                    min="1"
                    value={newClass.hours}
                    onChange={(e) => setNewClass({ ...newClass, hours: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">老师</label>
                <input
                  type="text"
                  value={newClass.teacher}
                  onChange={(e) => setNewClass({ ...newClass, teacher: e.target.value })}
                  placeholder="授课老师姓名"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={newClass.notes}
                  onChange={(e) => setNewClass({ ...newClass, notes: e.target.value })}
                  placeholder="课后反馈或备注"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
              <Button
                variant="outline"
                onClick={() => setShowAddModal(false)}
                className="flex-1 bg-white"
              >
                取消
              </Button>
              <Button
                onClick={handleAddClass}
                disabled={!newClass.studentId}
                className="flex-1"
              >
                添加记录
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 反馈详情弹窗 / 评估报告弹窗 */}
      {showFeedbackModal && (() => {
        const isTrialReport = showFeedbackModal.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(showFeedbackModal.id));
        const a = isTrialReport ? assessments.find(item => parseInt(item.class_id) === parseInt(showFeedbackModal.id)) : null;
        return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-gray-800">{isTrialReport ? '📝 体验课评估报告' : '上课反馈详情'}</h2>
              <div className="flex items-center gap-3">
                {isTrialReport && <span className="text-sm text-orange-600 font-medium bg-orange-50 px-2 py-1 rounded">🎁 体验课</span>}
                <button 
                  onClick={() => setShowFeedbackModal(null)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">学生：</span><span className="font-medium text-gray-800">{showFeedbackModal.studentName || showFeedbackModal.student_name || '未知'}</span></div>
                  <div><span className="text-gray-500">日期：</span><span className="font-medium text-gray-800">{showFeedbackModal.date}</span></div>
                  <div><span className="text-gray-500">老师：</span><span className="font-medium text-gray-800">{showFeedbackModal.teacherName || showFeedbackModal.teacher_name || showFeedbackModal.teacher || '-'}</span></div>
                  <div className="flex items-center gap-2"><span className="text-gray-500">状态：</span><Badge variant={STATUS_VARIANTS[showFeedbackModal.status] || 'default'}>{STATUS_LABELS[showFeedbackModal.status] || showFeedbackModal.status}</Badge></div>
                </div>
              </div>

            {isTrialReport && a ? (() => {
              const dims = [
                {title:'🗣️ 口语表现',items:[['speaking_pronunciation','发音清晰度'],['speaking_communication','开口主动性']]},
                {title:'🎧 理解能力',items:[['listening_conversation','理解与反应']]},
                {title:'🌟 课堂表现',items:[['classroom_interaction','参与度与互动']]},
              ];
              return (
                <div className="space-y-3">
                  {dims.map(dim => (
                    <div key={dim.title} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-medium text-gray-700 text-sm mb-2">{dim.title}</div>
                      {dim.items.map(item => (
                        <div key={item[0]} className="flex items-center justify-between py-1">
                          <span className="text-sm text-gray-600">{item[1]}</span>
                          <span className="text-lg tracking-tight">
                            {[1,2,3,4,5].map(i => <span key={i} className={i <= (a[item[0]]||0) ? 'text-orange-400' : 'text-gray-300'}>★</span>)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="border border-gray-200 rounded-lg p-3 bg-orange-50">
                    <div className="font-medium text-gray-700 text-sm mb-2">📋 综合评估</div>
                    {a.recommended_level && <div className="mb-2"><span className="text-sm font-medium text-gray-700">🎓 建议级别</span><span className="ml-2 text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{a.recommended_level}</span></div>}
                    {a.strengths && <div className="mb-2"><span className="text-sm font-medium text-gray-700">💪 孩子的亮点</span><div className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{a.strengths}</div></div>}
                    {a.improvements && <div className="mb-2"><span className="text-sm font-medium text-gray-700">📈 建议重点提升</span><div className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{a.improvements}</div></div>}
                    {a.teacher_message && <div className="mt-3 p-3 bg-blue-50 rounded-lg"><span className="text-sm font-medium text-gray-700">💌 老师寄语</span><div className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{a.teacher_message}</div></div>}
                  </div>
                </div>
              );
            })() : (
            <div className="space-y-3">
              {/* 📅 上课信息 */}
              {(showFeedbackModal.fb_lesson_level || showFeedbackModal.fb_unit || showFeedbackModal.fb_lesson) && (
                <div className="border rounded-lg p-3">
                  <div className="font-medium text-gray-700 text-sm mb-2">📅 上课信息</div>
                  <div className="text-sm text-gray-600">课程级别：{showFeedbackModal.fb_lesson_level || '-'} · 教材进度：Unit {showFeedbackModal.fb_unit || '-'} / Lesson {showFeedbackModal.fb_lesson || '-'}</div>
                </div>
              )}
              {/* 📚 今日学习内容 */}
              {(showFeedbackModal.fb_vocab || showFeedbackModal.fb_patterns || showFeedbackModal.fb_grammar) && (
                <div className="border rounded-lg p-3">
                  <div className="font-medium text-gray-700 text-sm mb-2">📚 今日学习内容</div>
                  {showFeedbackModal.fb_vocab && <div className="mb-1 text-sm text-gray-600"><b>词汇：</b>{showFeedbackModal.fb_vocab}</div>}
                  {showFeedbackModal.fb_patterns && <div className="mb-1 text-sm text-gray-600"><b>句型：</b>{showFeedbackModal.fb_patterns}</div>}
                  {showFeedbackModal.fb_grammar && <div className="mb-1 text-sm text-gray-600"><b>语法重点：</b>{showFeedbackModal.fb_grammar}</div>}
                </div>
              )}
              {/* 🗣️ 发音纠正 */}
              {(() => {
                let errors = [];
                try { errors = JSON.parse(showFeedbackModal.fb_pronunciation_errors || '[]'); } catch {}
                if (!errors.length) return null;
                return (
                  <div className="border rounded-lg p-3">
                    <div className="font-medium text-gray-700 text-sm mb-2">🗣️ 发音纠正</div>
                    {errors.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 text-sm">
                        <span className="text-red-500">✗ {e.wrong}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-600">✓ {e.right}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {/* 📝 语法纠正 */}
              {(() => {
                let errors = [];
                try { errors = JSON.parse(showFeedbackModal.fb_grammar_errors || '[]'); } catch {}
                if (!errors.length) return null;
                return (
                  <div className="border rounded-lg p-3">
                    <div className="font-medium text-gray-700 text-sm mb-2">📝 语法纠正</div>
                    {errors.map((e, i) => (
                      <div key={i} className="py-1 text-sm">
                        <div className="text-red-500">✗ {e.wrong}</div>
                        <div className="text-green-600">✓ {e.right}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {/* 综合总结 */}
              {(showFeedbackModal.fb_teacher_message || showFeedbackModal.fb_homework || showFeedbackModal.fb_next_preview) && (
                <div className="border rounded-lg p-3 bg-purple-50">
                  <div className="font-medium text-gray-700 text-sm mb-2">📋 课后总结</div>
                  {showFeedbackModal.fb_teacher_message && <div className="mb-2 text-sm"><span className="font-medium text-gray-700">💌 老师反馈</span><div className="text-gray-600 whitespace-pre-wrap mt-1">{showFeedbackModal.fb_teacher_message}</div></div>}
                  {showFeedbackModal.fb_homework && <div className="mb-2 text-sm"><span className="font-medium text-gray-700">📝 课后作业</span><div className="text-gray-600 whitespace-pre-wrap mt-1">{showFeedbackModal.fb_homework}</div></div>}
                  {showFeedbackModal.fb_next_preview && <div className="mb-2 text-sm"><span className="font-medium text-gray-700">🎯 下节课预告</span><div className="text-gray-600 whitespace-pre-wrap mt-1">{showFeedbackModal.fb_next_preview}</div></div>}
                </div>
              )}
              {/* 旧格式兼容：content/homework/notes */}
              {(showFeedbackModal.content || showFeedbackModal.homework || showFeedbackModal.notes) && !showFeedbackModal.fb_teacher_message && !showFeedbackModal.fb_vocab && (
                <div className="border rounded-lg p-3">
                  <div className="font-medium text-gray-700 text-sm mb-2">📋 反馈内容</div>
                  {showFeedbackModal.content && <div className="mb-2 text-sm"><span className="font-medium text-gray-700">上课内容</span><div className="text-gray-600 whitespace-pre-wrap mt-1">{showFeedbackModal.content}</div></div>}
                  {showFeedbackModal.homework && <div className="mb-2 text-sm"><span className="font-medium text-gray-700">作业布置</span><div className="text-gray-600 whitespace-pre-wrap mt-1">{showFeedbackModal.homework}</div></div>}
                  {showFeedbackModal.notes && <div className="text-sm"><span className="font-medium text-gray-700">备注</span><div className="text-gray-600 whitespace-pre-wrap mt-1">{showFeedbackModal.notes}</div></div>}
                </div>
              )}
            </div>
            )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 justify-end shrink-0">
              {isTrialReport && a && (
                <Button
                  onClick={() => {
                    const dims = [
                      {icon:'🗣️',title:'口语表现 Speaking Performance',items:[['speaking_pronunciation','发音清晰度 Pronunciation Clarity'],['speaking_communication','开口意愿 Willingness to Speak']]},
                      {icon:'🎧',title:'理解能力 Comprehension',items:[['listening_conversation','理解与反应 Comprehension & Response']]},
                      {icon:'🌟',title:'课堂表现 Classroom Performance',items:[['classroom_interaction','参与度与互动 Engagement & Interaction']]},
                    ];
                    const stars = (n) => [1,2,3,4,5].map(i => `<span class="star${i<=(n||0)?' active':''}">★</span>`).join('');
                    const esc = (s) => (s||'').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>');
                    const win = window.open('', '_blank');
                    win.document.write(`<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>体验课评估报告</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700;800&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f0f4f8; padding: 24px; color: #1C244B; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.report-page { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 20px; box-shadow: 0 8px 40px rgba(28,36,75,0.1); overflow: hidden; position: relative; }
.report-header { background: #fff; padding: 28px 48px 28px; color: #1C244B; position: relative; }
.report-header::after { content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #F5A623, #E26B31); }
.header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.brand-logo { height: 44px; width: auto; }
.header-website { font-size: 12px; color: #6B7F8F; letter-spacing: 0.5px; }
.report-title { text-align: center; margin-top: 4px; }
.report-title h1 { font-size: 24px; font-weight: 700; color: #1C244B; margin-bottom: 4px; letter-spacing: 2px; }
.report-title .subtitle { font-size: 13px; color: #6B7F8F; letter-spacing: 2px; text-transform: uppercase; }
.info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 32px; padding: 24px 48px; background: #F7FAFC; border-bottom: 1px solid #E8EDF2; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 11px; color: #6B7F8F; font-weight: 500; letter-spacing: 0.5px; }
.info-value { font-size: 15px; color: #1C244B; font-weight: 600; }
.dimensions { padding: 28px 48px; }
.dim-card { background: #fff; border: 1px solid #E8EDF2; border-radius: 14px; padding: 18px 22px; margin-bottom: 14px; page-break-inside: avoid; }
.dim-header { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: #1C244B; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #F7FAFC; }
.dim-icon { font-size: 20px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: #F7FAFC; border-radius: 8px; }
.dim-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
.dim-label { font-size: 14px; color: #475569; }
.stars-readonly { display: inline-flex; gap: 3px; }
.stars-readonly .star { font-size: 18px; color: #d1d5db; }
.stars-readonly .star.active { color: #F5A623; }
.overall-section { margin: 0 48px 20px; padding: 22px 24px; background: linear-gradient(135deg, #F7FAFC, #FFFBF4); border-radius: 14px; border: 1px solid #E8EDF2; page-break-inside: avoid; }
.overall-title { font-size: 16px; font-weight: 600; color: #1C244B; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid rgba(75,159,224,0.1); }
.overall-item { margin-bottom: 12px; }
.overall-item:last-child { margin-bottom: 0; }
.overall-label { display: inline-block; font-size: 14px; font-weight: 600; color: #1C244B; margin-bottom: 4px; }
.overall-text { font-size: 14px; color: #475569; line-height: 1.7; padding-left: 12px; white-space: pre-wrap; }
.message-section { margin: 0 48px 20px; padding: 22px 24px; background: linear-gradient(135deg, rgba(75,159,224,0.06), rgba(245,166,35,0.06)); border-radius: 14px; border: 1px solid rgba(75,159,224,0.15); page-break-inside: avoid; }
.message-header { font-size: 16px; font-weight: 600; color: #1C244B; margin-bottom: 10px; }
.message-text { font-size: 14px; color: #475569; line-height: 1.8; white-space: pre-wrap; }
.report-footer { text-align: center; padding: 24px 48px; border-top: 1px solid #E8EDF2; margin-top: 8px; }
.footer-brand { font-size: 13px; font-weight: 600; color: #1C244B; }
.footer-slogan { font-size: 11px; color: #6B7F8F; margin-top: 2px; letter-spacing: 1px; }
.footer-website { font-size: 12px; color: #4B9FE0; margin-top: 6px; font-weight: 500; }
.footer-date { font-size: 11px; color: #b0b8c4; margin-top: 8px; }
.print-btn-area { text-align: center; padding: 0 48px 32px; }
.print-btn { background: linear-gradient(135deg, #4B9FE0, #2E7AC4); color: #fff; border: none; padding: 12px 36px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 16px rgba(75,159,224,0.35); }
.print-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(75,159,224,0.45); }
@media print {
  body { background: #fff; padding: 0; }
  .report-page { box-shadow: none; border-radius: 0; max-width: 100%; }
  .print-btn-area { display: none; }
  .report-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .dim-card { page-break-inside: avoid; }
  .overall-section { page-break-inside: avoid; }
  .message-section { page-break-inside: avoid; }
  @page { margin: 1.5cm; }
}
</style></head><body>
<div class="report-page">
  <div class="report-header">
    <div class="header-top">
      <div class="brand"><img src="/sunblogo.webp" class="brand-logo" alt="SunnyBridge"></div>
      <div class="header-website">www.sunnybridge.qzz.io</div>
    </div>
    <div class="report-title"><h1>体验课评估报告</h1><div class="subtitle">Trial Class Assessment Report</div></div>
  </div>
  <div class="info-section">
    <div class="info-item"><div class="info-label">学生姓名 / Student Name</div><div class="info-value">${esc(showFeedbackModal.studentName||'未知')}</div></div>
    <div class="info-item"><div class="info-label">授课教师 / Teacher</div><div class="info-value">${esc(showFeedbackModal.teacherName||showFeedbackModal.teacher||'-')}</div></div>
    <div class="info-item"><div class="info-label">上课日期 / Date</div><div class="info-value">${esc(showFeedbackModal.date||'-')}</div></div>
    <div class="info-item"><div class="info-label">课程科目 / Subject</div><div class="info-value">${esc(a.subject||'英语')}</div></div>
  </div>
  <div class="dimensions">
  ${dims.map(dim => `
  <div class="dim-card">
    <div class="dim-header"><span class="dim-icon">${dim.icon}</span>${dim.title}</div>
    ${dim.items.map(item => `<div class="dim-item"><span class="dim-label">${item[1]}</span><span class="stars-readonly">${stars(a[item[0]])}</span></div>`).join('')}
  </div>`).join('')}
  </div>
  <div class="overall-section">
    <div class="overall-title">📋 综合评估 Overall Assessment</div>
    ${a.recommended_level ? `<div class="overall-item"><span class="overall-label">🎓 建议级别 Recommended Level</span><div class="overall-text">${esc(a.recommended_level)}</div></div>` : ''}
    ${a.strengths ? `<div class="overall-item"><span class="overall-label">💪 强项 Strengths</span><div class="overall-text">${esc(a.strengths)}</div></div>` : ''}
    ${a.improvements ? `<div class="overall-item"><span class="overall-label">📈 待提升 Areas to Improve</span><div class="overall-text">${esc(a.improvements)}</div></div>` : ''}
  </div>
  ${a.teacher_message ? `<div class="message-section"><div class="message-header">💌 教师寄语 Teacher's Message</div><div class="message-text">${esc(a.teacher_message)}</div></div>` : ''}
  <div class="report-footer">
    <div class="footer-brand">SunnyBridge 少儿英语</div>
    <div class="footer-slogan">Bridging Smiles, Building Futures</div>
    <div class="footer-website">www.sunnybridge.qzz.io</div>
    <div class="footer-date">${new Date().toLocaleDateString('zh-CN')}</div>
  </div>
  <div class="print-btn-area"><button class="print-btn" onclick="window.print()">🖨️ 导出 / 打印 PDF</button></div>
</div>
</body></html>`);
                    win.document.close();
                  }}
                >
                  🖨️ 导出 PDF
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowFeedbackModal(null)}
                className="bg-white"
              >
                关闭
              </Button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

export default Classes;
