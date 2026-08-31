import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Phone, Mail, Calendar, CreditCard, Clock, Plus, Trash2, 
  AlertTriangle, MessageSquare, FileText, Edit, Loader2, User, CheckCircle, 
  X, Calculator, FileCheck, FileSignature 
} from 'lucide-react';
import { studentOps, packageOps, classOps, paymentOps, hourChangeOps } from '../store';
import { request } from '../store/api';
import AdjustHoursModal from '../components/AdjustHoursModal';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [packages, setPackages] = useState([]);
  const [classes, setClasses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [showClassModal, setShowClassModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', english_name: '', gender: '', phone: '', email: '',
    age: '', grade: '', parentName: '', notes: '', status: 'active',
  });
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hourChanges, setHourChanges] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [progressReports, setProgressReports] = useState([]);
  const [showAssessmentFeedback, setShowAssessmentFeedback] = useState(null);
  const [showProgressReportModal, setShowProgressReportModal] = useState(null);
  const [classForm, setClassForm] = useState({ date: '', hours: 1, notes: '' });

  useEffect(() => {
    async function loadStudentData() {
      if (id) {
        setLoading(true);
        try {
          const s = await studentOps.getById(id);
          if (s) {
            setStudent(s);
            const [packagesData, classesData, paymentsData] = await Promise.all([
              packageOps.getByStudent(id),
              classOps.getByStudent(id),
              paymentOps.getByStudent(id)
            ]);
            setPackages(Array.isArray(packagesData) ? packagesData : []);
            setClasses(Array.isArray(classesData) ? classesData : []);
            setPayments(Array.isArray(paymentsData) ? paymentsData : []);
            
            // 加载课时变动记录
            let hcFromApi = [];
            try {
              const hcResult = await hourChangeOps.getByStudent(id);
              hcFromApi = Array.isArray(hcResult) ? hcResult : [];
            } catch (err) { console.error('Load hour changes error:', err); }

            // 补全课时变动
            const seenKeys = new Set(hcFromApi.map(hc => `${hc.type}-${hc.related_id}`));
            const synthesized = [];
            (Array.isArray(classesData) ? classesData : []).forEach(cls => {
              if (cls.status === 'completed' || cls.status === 'absent') {
                const key = `class-${cls.id}`;
                if (!seenKeys.has(key)) {
                  const sign = cls.status === 'absent' ? 0 : -1;
                  const amount = cls.status === 'absent' ? 0 : -(cls.hours || 1);
                  synthesized.push({
                    id: `cls-${cls.id}`, type: 'class', amount, related_id: cls.id,
                    description: cls.status === 'absent' ? `缺席 ${cls.date || ''} ${cls.subject || ''}` : `上课消耗 ${cls.date || ''} ${cls.subject || ''}`,
                    detail_text: `${cls.date || ''} ${cls.subject || cls.teacher || ''}`,
                    created_at: cls.created_at || (cls.date ? cls.date + ' 00:00:00' : null),
                  });
                }
              }
            });
            (Array.isArray(paymentsData) ? paymentsData : []).forEach(p => {
              const key = `payment-${p.id}`;
              if (!seenKeys.has(key)) {
                const hours = p.hours || p.class_count || (p.amount ? Math.round(p.amount / 118) : 0);
                synthesized.push({
                  id: `pay-${p.id}`, type: 'payment', amount: hours, related_id: p.id,
                  description: `购买课时 ${p.description || ''}`,
                  detail_text: p.description || `付款 ¥${(p.amount || 0).toLocaleString()}`,
                  created_at: p.created_at || (p.date ? p.date + ' 00:00:00' : null),
                });
              }
            });

            const merged = [...hcFromApi, ...synthesized];
            merged.sort((a, b) => {
              const ta = a.created_at || '';
              const tb = b.created_at || '';
              return tb.localeCompare(ta);
            });
            setHourChanges(merged);
            
            // 加载评估报告与阶段性成长报告
            try {
              const [assessmentsData, progressReportsData] = await Promise.all([
                request('/assessments?student_id=' + id + '&page_size=50').catch(() => ({ data: [] })),
                request('/progress-reports?student_id=' + id + '&page_size=50').catch(() => ({ data: [] }))
              ]);
              const aData = assessmentsData?.data?.data || assessmentsData?.data || [];
              const prData = progressReportsData?.data?.data || progressReportsData?.data || [];
              setAssessments(Array.isArray(aData) ? aData : []);
              setProgressReports(Array.isArray(prData) ? prData : []);
            } catch(e) { console.error('Load reports error:', e); }
          }
        } catch (err) {
          console.error('Load student error:', err);
        } finally {
          setLoading(false);
        }
      }
    }
    loadStudentData();
  }, [id]);

  const loadStudent = async () => {
    try {
      const s = await studentOps.getById(id);
      if (s) setStudent(s);
      const hcResult = await hourChangeOps.getByStudent(id);
      // reload hour changes simplified here for adjustment success
      window.location.reload(); 
    } catch(e) { }
  };

  const handleAddClass = async (e) => {
    e.preventDefault();
    const hoursToConsume = classForm.hours || 1;
    const totalRemaining = student ? (student.remaining_hours !== undefined && student.remaining_hours !== null
      ? student.remaining_hours
      : Math.round(((student.total_hours ?? student.package_summary?.total_hours ?? 0) - (student.used_hours ?? student.package_summary?.used_hours ?? 0)) * 100) / 100) : 0;
    if (totalRemaining < hoursToConsume) {
      alert(`课时不足！当前剩余 ${totalRemaining} 节，需要 ${hoursToConsume} 节。请先购买课时。`);
      return;
    }
    try {
      await classOps.add(id, { ...classForm, studentId: id, hours: hoursToConsume });
      setShowClassModal(false);
      setClassForm({ date: '', hours: 1, notes: '' });
      const [packagesData, classesData] = await Promise.all([
        packageOps.getByStudent(id),
        classOps.getByStudent(id)
      ]);
      setPackages(Array.isArray(packagesData) ? packagesData : []);
      setClasses(Array.isArray(classesData) ? classesData : []);
      
      const s = await studentOps.getById(id);
      if (s) setStudent(s);
    } catch (err) {
      alert('添加失败：' + err.message);
    }
  };

  const handleDeleteClass = async (classId) => {
    if (confirm('确定要删除该上课记录吗？')) {
      try {
        await classOps.delete(classId);
        const [packagesData, classesData] = await Promise.all([
          packageOps.getByStudent(id),
          classOps.getByStudent(id)
        ]);
        setPackages(Array.isArray(packagesData) ? packagesData : []);
        setClasses(Array.isArray(classesData) ? classesData : []);
        const s = await studentOps.getById(id);
        if (s) setStudent(s);
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    }
  };

  const handleAdjustSuccess = async () => {
    loadStudent();
  };

  const totalRemaining = student ? (student.remaining_hours !== undefined && student.remaining_hours !== null
    ? Math.round(parseFloat(student.remaining_hours) * 100) / 100
    : Math.round(((parseFloat(student.total_hours ?? student.package_summary?.total_hours) || 0) - (parseFloat(student.used_hours ?? student.package_summary?.used_hours) || 0)) * 100) / 100) : 0;
  const totalSpent = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const activePackage = packages.find(p => p.remaining > 0) || packages[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 mb-4">学生不存在</p>
        <Button onClick={() => navigate('/students')} variant="outline">返回学生列表</Button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: '概览' },
    { id: 'classes', label: '上课记录' },
    { id: 'payments', label: '付款记录' },
    { id: 'hour-changes', label: '课时变动' },
    { id: 'assessments', label: '报告与评估' },
  ];

  const STATUS_LABELS = { completed: '已完成', scheduled: '已排课', cancelled: '已取消', absent: '缺席' };
  const getStatusVariant = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'scheduled': return 'primary';
      case 'absent': return 'danger';
      default: return 'secondary';
    }
  };

  const handleOpenEdit = () => {
    if (!student) return;
    setEditForm({
      name: student.name || '',
      english_name: student.english_name || '',
      gender: student.gender || '',
      phone: student.phone || '',
      email: student.email || '',
      age: student.age || '',
      grade: student.grade || '',
      parentName: student.parent_name || student.parentName || '',
      notes: student.notes || '',
      status: student.status || 'active',
    });
    setShowEditModal(true);
  };

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    try {
      setSubmittingEdit(true);
      const apiData = {
        name: editForm.name,
        english_name: editForm.english_name || null,
        gender: editForm.gender || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
        age: editForm.age ? parseInt(editForm.age) : null,
        grade: editForm.grade || null,
        parent_name: editForm.parentName || null,
        notes: editForm.notes || null,
        status: editForm.status || 'active',
      };
      await studentOps.update(id, apiData);
      const updated = await studentOps.getById(id);
      if (updated) setStudent(updated);
      setShowEditModal(false);
    } catch (err) {
      alert('保存失败: ' + err.message);
    } finally {
      setSubmittingEdit(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center">
        <button onClick={() => navigate('/students')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft size={18} />
          <span>返回学生列表</span>
        </button>
      </div>

      {/* 学生基本信息 */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl flex items-center justify-center shadow-inner border border-primary-100">
              <span className="text-3xl text-primary-700 font-bold">
                {student.name?.charAt(0) || '学'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
                <Badge variant={student.status === 'active' ? 'success' : student.status === 'inactive' ? 'secondary' : 'primary'}>
                  {student.status === 'active' ? '学习中' : student.status === 'inactive' ? '已暂停' : '已结课'}
                </Badge>
              </div>
              {student.english_name && <div className="text-sm font-medium text-gray-500 mt-1">{student.english_name}</div>}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600">
                {student.phone && (
                  <span className="flex items-center gap-1.5"><Phone size={14} /> {student.phone}</span>
                )}
                {student.email && (
                  <span className="flex items-center gap-1.5"><Mail size={14} /> {student.email}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {student.gender && (
                  <Badge variant={student.gender === 'male' || student.gender === '男' ? 'primary' : 'danger'} className="bg-opacity-10 border-0">
                    {student.gender === 'male' ? '男' : student.gender === 'female' ? '女' : student.gender}
                  </Badge>
                )}
                {student.age && <Badge variant="default" className="bg-gray-100 border-0">{student.age}岁</Badge>}
                {student.grade && <Badge variant="warning" className="bg-warning-50 border-0">等级: {student.grade}</Badge>}
                {(student.parent_name || student.parentName) && (
                  <Badge variant="default" className="bg-gray-100 border-0">家长: {student.parent_name || student.parentName}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0">
            <Button variant="outline" onClick={handleOpenEdit}>
              <Edit className="w-4 h-4 mr-2" /> 编辑资料
            </Button>
          </div>
        </div>

        {/* 课时不足警告 */}
        {totalRemaining > 0 && totalRemaining < 3 && (
          <div className="mt-6 p-4 bg-warning-50 border border-warning-200 rounded-xl flex items-center gap-3 text-warning-800">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="font-medium">课时不足！剩余 {totalRemaining} 节，请提醒家长续费</span>
          </div>
        )}
        {totalRemaining <= 0 && (
          <div className="mt-6 p-4 bg-danger-50 border border-danger-200 rounded-xl flex items-center gap-3 text-danger-800">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="font-medium">课时已用完，请立即购买新课时</span>
          </div>
        )}

        {/* 快速统计 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">总课时</div>
            <div className="text-2xl font-bold text-gray-900">{Math.round((parseFloat(student?.total_hours ?? student?.package_summary?.total_hours) || 0) * 100) / 100}</div>
          </div>
          <div className="bg-primary-50/50 rounded-xl p-4 border border-primary-100">
            <div className="text-sm text-primary-600/80 mb-1">剩余课时</div>
            <div className="text-2xl font-bold text-primary-600">{totalRemaining}</div>
          </div>
          <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">上课次数</div>
            <div className="text-2xl font-bold text-gray-900">{classes.filter(c => c.status === 'completed').length}</div>
          </div>
          <div className="bg-success-50/50 rounded-xl p-4 border border-success-100">
            <div className="text-sm text-success-600/80 mb-1">累计消费</div>
            <div className="text-2xl font-bold text-success-600">¥{totalSpent.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
            <div className="text-sm text-gray-500 mb-1">付款次数</div>
            <div className="text-2xl font-bold text-gray-900">{payments.length}</div>
          </div>
        </div>
      </Card>

      {/* 标签页 */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id 
                ? 'border-primary-500 text-primary-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 概览 */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="font-bold text-gray-900">课时余额</h3>
              {student && (
                <Button variant="ghost" size="sm" onClick={() => setShowAdjustModal(true)}>
                  <Calculator className="w-4 h-4 mr-1" />
                  调整课时
                </Button>
              )}
            </CardHeader>
            <div className="p-6">
              <div className="flex items-center gap-6 mb-6">
                <div className="w-24 h-24 rounded-full border-[6px] border-primary-100 flex flex-col items-center justify-center shrink-0">
                  <span className="text-3xl font-bold text-primary-600 leading-none">{totalRemaining}</span>
                  <span className="text-[10px] text-gray-500 mt-1 font-medium">剩余</span>
                </div>
                <div className="flex-1 space-y-3">
                  {packages.length > 0 ? packages.map(pkg => (
                    <div key={pkg.id} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">{pkg.name || `套餐 #${pkg.id}`}</span>
                        <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                          {Math.round((parseFloat(pkg.remaining) || 0) * 100) / 100} / {Math.round((parseFloat(pkg.total) || 0) * 100) / 100} 节
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-primary-500 h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, Math.max(0, (pkg.remaining / pkg.total) * 100))}%` }}
                        ></div>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-gray-400">暂无活跃课时包</p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-bold text-gray-900">最近上课</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowClassModal(true)}>
                <Plus className="w-4 h-4 mr-1" /> 添加
              </Button>
            </CardHeader>
            <div className="p-6">
              {classes.length > 0 ? (
                <div className="space-y-4">
                  {classes.slice(0, 4).map(cls => (
                    <div key={cls.id} className="flex items-center justify-between border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls.status === 'completed' ? 'bg-success-50 text-success-600' : 'bg-gray-100 text-gray-400'}`}>
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm mb-0.5">{cls.date}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{cls.hours} 节课</span>
                            <Badge variant={getStatusVariant(cls.status)} className="px-1.5 py-0 text-[10px]">{STATUS_LABELS[cls.status]}</Badge>
                          </div>
                        </div>
                      </div>
                      {(cls.content || cls.homework || (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))) && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))
                            ? setShowAssessmentFeedback(assessments.find(a => parseInt(a.class_id) === parseInt(cls.id)))
                            : setShowFeedbackModal(cls)}
                        >
                          {(cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))
                            ? <FileText className="w-4 h-4 text-primary-600" />
                            : <MessageSquare className="w-4 h-4 text-primary-600" />}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">暂无上课记录</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* 上课记录 */}
      {activeTab === 'classes' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-900">上课记录</h3>
            <Button onClick={() => setShowClassModal(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> 记录上课
            </Button>
          </CardHeader>
          <div className="p-0">
            {classes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    <tr>
                      <th className="px-6 py-4 font-medium">日期</th>
                      <th className="px-6 py-4 font-medium">消耗课时</th>
                      <th className="px-6 py-4 font-medium">状态</th>
                      <th className="px-6 py-4 font-medium text-center">反馈/报告</th>
                      <th className="px-6 py-4 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {classes.map(cls => (
                      <tr key={cls.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{cls.date}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{cls.hours} 节</td>
                        <td className="px-6 py-4">
                          <Badge variant={getStatusVariant(cls.status)}>{STATUS_LABELS[cls.status]}</Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {(cls.content || cls.homework || (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))) ? (
                            <Button 
                              variant="outline" size="sm" className="h-7 text-xs px-2"
                              onClick={() => (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))
                                ? setShowAssessmentFeedback(assessments.find(a => parseInt(a.class_id) === parseInt(cls.id)))
                                : setShowFeedbackModal(cls)}
                            >
                              {(cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id))) ? '评估报告' : '上课反馈'}
                            </Button>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteClass(cls.id)} className="text-gray-400 hover:text-danger-600 px-2">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>暂无上课记录</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 付款记录 */}
      {activeTab === 'payments' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-900">付款记录</h3>
          </CardHeader>
          <div className="p-0">
            {payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    <tr>
                      <th className="px-6 py-4 font-medium">付款日期</th>
                      <th className="px-6 py-4 font-medium">支付方式</th>
                      <th className="px-6 py-4 font-medium">购买课时</th>
                      <th className="px-6 py-4 font-medium">说明</th>
                      <th className="px-6 py-4 font-medium text-right">金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map(payment => (
                      <tr key={payment.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 font-medium text-gray-900">{payment.date}</td>
                        <td className="px-6 py-4 text-gray-600">{payment.payment_method || payment.method || '微信支付'}</td>
                        <td className="px-6 py-4 text-gray-600">{payment.hours || payment.class_count || '-'} 节</td>
                        <td className="px-6 py-4 text-gray-500">{payment.description || '-'}</td>
                        <td className="px-6 py-4 text-right font-bold text-success-600">
                          +{payment.amount?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>暂无付款记录</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 课时变动 */}
      {activeTab === 'hour-changes' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-900">课时变动流水</h3>
          </CardHeader>
          <div className="p-0">
            {hourChanges.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    <tr>
                      <th className="px-6 py-4 font-medium">时间</th>
                      <th className="px-6 py-4 font-medium">类型</th>
                      <th className="px-6 py-4 font-medium">说明</th>
                      <th className="px-6 py-4 font-medium text-right">变动额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {hourChanges.map(hc => (
                      <tr key={hc.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 text-gray-500">{hc.created_at || '-'}</td>
                        <td className="px-6 py-4">
                          <Badge variant={hc.type === 'payment' ? 'success' : hc.type === 'class' ? 'danger' : 'warning'}>
                            {hc.type === 'payment' && '购买课时'}
                            {hc.type === 'class' && '上课消耗'}
                            {hc.type === 'adjust' && '手动调整'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-gray-700">{hc.description || hc.detail_text || '-'}</td>
                        <td className={`px-6 py-4 text-right font-bold ${hc.amount > 0 ? 'text-success-600' : 'text-danger-600'}`}>
                          {hc.amount > 0 ? '+' : ''}{hc.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>暂无课时变动记录</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 报告与评估 */}
      {activeTab === 'assessments' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-col items-start gap-1 pb-5">
              <div className="flex items-center justify-between w-full">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <FileSignature className="w-5 h-5 text-purple-600" />
                  阶段性成长报告
                </h3>
                <Badge variant="primary" className="bg-purple-100 text-purple-700">共 {progressReports.length} 份</Badge>
              </div>
              <p className="text-xs text-gray-500">系统在学生完成第 10、30、60 节课或晋级升阶时自动生成的阶段能力综合评估</p>
            </CardHeader>
            <div className="p-6 pt-0">
              {progressReports.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {progressReports.map(pr => {
                    const typeMap = {
                      milestone_10: { label: '🥉 10课时适应期', color: 'bg-amber-100 text-amber-800' },
                      milestone_30: { label: '🥈 30课时进阶期', color: 'bg-blue-100 text-blue-800' },
                      milestone_60: { label: '🥇 60课时大纲总结', color: 'bg-emerald-100 text-emerald-800' },
                      level_up: { label: '🚀 等级跃迁报告', color: 'bg-purple-100 text-purple-800' }
                    };
                    const badge = typeMap[pr.report_type] || { label: pr.report_type || '阶段评估', color: 'bg-gray-100 text-gray-800' };

                    return (
                      <div key={pr.id} className="border border-gray-100 rounded-xl p-5 hover:border-purple-200 hover:shadow-md transition-all bg-white cursor-pointer" onClick={() => setShowProgressReportModal(pr)}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex flex-col gap-2">
                            <span className={`text-xs px-2.5 py-1 rounded-md font-bold w-fit ${badge.color}`}>
                              {badge.label}
                            </span>
                            <span className="text-sm text-gray-500 flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5" /> {pr.created_at ? pr.created_at.substring(0,10) : ''}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" className="text-purple-600 hover:text-purple-700 bg-purple-50">
                            查看
                          </Button>
                        </div>
                        {(pr.from_level || pr.to_level) && (
                          <div className="mt-3 inline-flex items-center gap-2 bg-purple-50 text-purple-700 text-xs px-3 py-1.5 rounded-lg font-medium border border-purple-100">
                            🎓 级别晋升：<span>{pr.from_level || '入学'}</span> <ArrowLeft size={12} className="rotate-180" /> <span className="font-bold text-purple-900">{pr.to_level}</span>
                          </div>
                        )}
                        {pr.summary && (
                          <p className="mt-3 text-sm text-gray-600 line-clamp-2">{pr.summary}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <FileSignature className="w-10 h-10 mx-auto mb-3 opacity-30 text-purple-500" />
                  <p className="text-sm">暂无阶段性成长报告 (完成对应课时后自动生成)</p>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader className="flex-col items-start gap-1 pb-5">
              <div className="flex items-center justify-between w-full">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-500" />
                  体验课评估报告
                </h3>
                <Badge variant="warning" className="bg-orange-100 text-orange-700">共 {assessments.length} 份</Badge>
              </div>
            </CardHeader>
            <div className="p-6 pt-0">
              {assessments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assessments.map(a => (
                    <div key={a.id} className="border border-gray-100 rounded-xl p-5 hover:border-orange-200 hover:shadow-md transition-all bg-white cursor-pointer" onClick={() => openAssessmentReport(a)}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex flex-col gap-2">
                          {a.is_trial === 1 && <span className="text-xs px-2.5 py-1 rounded-md font-bold w-fit bg-orange-100 text-orange-800">🎁 体验课评估</span>}
                          <span className="text-sm text-gray-500 flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" /> {a.class_date} {(a.start_time||'').substring(0,5)}
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" className="text-orange-600 hover:text-orange-700 bg-orange-50">
                          查看PDF
                        </Button>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">教师：{a.teacher_name || '-'} · {a.subject || '英语'}</div>
                      {a.recommended_level && (
                        <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-md border border-blue-100 font-medium">
                          🎓 建议级别: {a.recommended_level}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30 text-orange-500" />
                  <p className="text-sm">暂无体验课评估报告</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* --- Modals --- */}
      
      {/* 记录上课 */}
      {showClassModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md shadow-2xl border-0 overflow-hidden">
            <CardHeader className="flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-600" />
                记录上课
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowClassModal(false)} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <form onSubmit={handleAddClass}>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">上课日期 *</label>
                  <input
                    type="date" required value={classForm.date} onChange={(e) => setClassForm({ ...classForm, date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">消耗课时 *</label>
                  <input
                    type="number" required min="0.1" step="0.01" value={classForm.hours} onChange={(e) => setClassForm({ ...classForm, hours: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <input
                    type="text" value={classForm.notes} onChange={(e) => setClassForm({ ...classForm, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="如：口语课、阅读课"
                  />
                </div>
              </div>
              <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50 justify-end">
                <Button variant="outline" type="button" onClick={() => setShowClassModal(false)}>取消</Button>
                <Button type="submit">保存</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* 反馈详情 */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg shadow-2xl border-0 overflow-hidden flex flex-col max-h-[90vh]">
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary-600" />
                上课反馈详情
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowFeedbackModal(null)} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <div className="p-5 overflow-y-auto space-y-5">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">日期：</span><span className="font-medium text-gray-900">{showFeedbackModal.date}</span></div>
                  <div><span className="text-gray-500">课时：</span><span className="font-medium text-gray-900">{showFeedbackModal.hours} 节</span></div>
                  <div className="col-span-2">
                    <span className="text-gray-500 mr-2">状态：</span>
                    <Badge variant={getStatusVariant(showFeedbackModal.status)}>{STATUS_LABELS[showFeedbackModal.status]}</Badge>
                  </div>
                </div>
              </div>
              {showFeedbackModal.content && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4" /> 上课内容</h3>
                  <div className="bg-blue-50/50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-blue-100">
                    {showFeedbackModal.content}
                  </div>
                </div>
              )}
              {showFeedbackModal.homework && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5"><Edit className="w-4 h-4" /> 作业布置</h3>
                  <div className="bg-orange-50/50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-orange-100">
                    {showFeedbackModal.homework}
                  </div>
                </div>
              )}
              {showFeedbackModal.notes && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">备注</h3>
                  <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed border border-gray-200">
                    {showFeedbackModal.notes}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end p-4 border-t border-gray-100 shrink-0">
              <Button variant="outline" onClick={() => setShowFeedbackModal(null)}>关闭</Button>
            </div>
          </Card>
        </div>
      )}

      {/* 阶段性成长报告详情 */}
      {showProgressReportModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl shadow-2xl border-0 overflow-hidden flex flex-col max-h-[90vh]">
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white p-5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <FileSignature className="w-6 h-6 text-purple-600" />
                    阶段性成长评估
                  </h2>
                </div>
                <div className="text-xs text-gray-400 mt-1">报告生成时间：{showProgressReportModal.created_at || '-'}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowProgressReportModal(null)} className="w-8 h-8 p-0 rounded-full bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </Button>
            </CardHeader>
            
            <div className="overflow-y-auto p-5">
              <div className="bg-purple-50/50 rounded-xl p-4 mb-6 border border-purple-100 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">学生：</span><span className="font-semibold text-gray-800">{student.name}</span></div>
                <div><span className="text-gray-500">教师：</span><span className="font-semibold text-gray-800">{showProgressReportModal.teacher_name || '-'}</span></div>
                {(showProgressReportModal.from_level || showProgressReportModal.to_level) && (
                  <div className="col-span-2 flex items-center gap-2 font-medium text-purple-700 bg-white p-2.5 rounded-lg border border-purple-100 shadow-sm">
                    🎓 能力级别跃迁：<span>{showProgressReportModal.from_level || '入学'}</span> <ArrowLeft size={14} className="rotate-180" /> <span className="font-bold text-purple-900">{showProgressReportModal.to_level}</span>
                  </div>
                )}
              </div>

              <div className="space-y-5 text-sm">
                {showProgressReportModal.summary && (
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">📋 阶段学习总结</h4>
                    <div className="p-4 bg-gray-50 rounded-xl text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-100">
                      {showProgressReportModal.summary}
                    </div>
                  </div>
                )}

                {showProgressReportModal.strengths && (
                  <div>
                    <h4 className="font-bold text-green-700 mb-2">💪 亮点与优势</h4>
                    <div className="p-4 bg-green-50/50 rounded-xl text-green-900 border border-green-100 whitespace-pre-wrap leading-relaxed">
                      {showProgressReportModal.strengths}
                    </div>
                  </div>
                )}

                {showProgressReportModal.improvements && (
                  <div>
                    <h4 className="font-bold text-orange-700 mb-2">📈 建议重点提升</h4>
                    <div className="p-4 bg-orange-50/50 rounded-xl text-orange-900 border border-orange-100 whitespace-pre-wrap leading-relaxed">
                      {showProgressReportModal.improvements}
                    </div>
                  </div>
                )}

                {showProgressReportModal.recommendation && (
                  <div>
                    <h4 className="font-bold text-primary-700 mb-2">🎯 后续规划与建议</h4>
                    <div className="p-4 bg-primary-50/50 rounded-xl text-primary-900 border border-primary-100 whitespace-pre-wrap leading-relaxed">
                      {showProgressReportModal.recommendation}
                    </div>
                  </div>
                )}

                {showProgressReportModal.teacher_message && (
                  <div>
                    <h4 className="font-bold text-purple-700 mb-2">💌 老师寄语</h4>
                    <div className="p-4 bg-purple-50/50 rounded-xl text-purple-900 border border-purple-100 whitespace-pre-wrap leading-relaxed">
                      {showProgressReportModal.teacher_message}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 体验课报告弹窗 */}
      {showAssessmentFeedback && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl shadow-2xl border-0 overflow-hidden flex flex-col max-h-[90vh]">
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                体验课评估报告
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAssessmentFeedback(null)} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <div className="overflow-y-auto p-5 space-y-5">
              <div className="bg-orange-50/50 rounded-xl p-4 border border-orange-100">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">学生：</span><span className="font-medium text-gray-900">{showAssessmentFeedback.student_name || student.name}</span></div>
                  <div><span className="text-gray-500">教师：</span><span className="font-medium text-gray-900">{showAssessmentFeedback.teacher_name || '-'}</span></div>
                  <div><span className="text-gray-500">日期：</span><span className="font-medium text-gray-900">{showAssessmentFeedback.class_date}</span></div>
                  <div><span className="text-gray-500">建议级别：</span><span className="font-bold text-blue-600">{showAssessmentFeedback.recommended_level || '-'}</span></div>
                </div>
              </div>

              {(() => {
                const a = showAssessmentFeedback;
                const StarRow = ({ score }) => (
                  <span className="text-lg tracking-tighter">
                    {[1,2,3,4,5].map(i => <span key={i} className={i <= (a[score]||0) ? 'text-orange-500' : 'text-gray-200'}>★</span>)}
                  </span>
                );
                const dims = [
                  {title:'🎧 听力评估',items:[['listening_conversation','日常对话理解'],['listening_key_info','关键信息抓取']],comment:'listening_comments'},
                  {title:'🗣️ 口语评估',items:[['speaking_pronunciation','发音与流利度'],['speaking_communication','表达能力']],comment:'speaking_comments'},
                  {title:'🌟 课堂表现',items:[['classroom_participation','参与度'],['classroom_focus','专注力'],['classroom_interaction','互动意愿']],comment:'classroom_comments'},
                ];
                return (
                  <div className="space-y-4">
                    {dims.map(dim => (
                      <div key={dim.title} className="border border-gray-100 rounded-xl p-4 shadow-sm">
                        <div className="font-bold text-gray-800 text-sm mb-3">{dim.title}</div>
                        <div className="space-y-2">
                          {dim.items.map(item => (
                            <div key={item[0]} className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">{item[1]}</span>
                              <StarRow score={item[0]} />
                            </div>
                          ))}
                        </div>
                        {a[dim.comment] && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">{a[dim.comment]}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="flex justify-between p-4 border-t border-gray-100 bg-gray-50 shrink-0">
              <Button onClick={() => openAssessmentReport(showAssessmentFeedback)} className="bg-orange-500 hover:bg-orange-600 border-0">
                <FileText className="w-4 h-4 mr-2" /> 导出打印 PDF
              </Button>
              <Button variant="outline" onClick={() => setShowAssessmentFeedback(null)}>关闭</Button>
            </div>
          </Card>
        </div>
      )}

      {/* 调整课时弹窗 */}
      {showAdjustModal && student && (
        <AdjustHoursModal
          studentInfo={student}
          onClose={() => setShowAdjustModal(false)}
          onSuccess={handleAdjustSuccess}
        />
      )}

      {/* 编辑学生资料 */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg shadow-2xl border-0 overflow-hidden flex flex-col max-h-[90vh]">
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Edit className="w-5 h-5 text-primary-600" />
                编辑学员资料
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowEditModal(false)} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <form onSubmit={handleSaveStudent} className="flex flex-col overflow-hidden">
              <div className="p-5 overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                    <input type="text" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">英文名</label>
                    <input type="text" value={editForm.english_name} onChange={(e) => setEditForm({ ...editForm, english_name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">性别</label>
                    <select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="">未知</option>
                      <option value="male">男</option>
                      <option value="female">女</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
                    <input type="number" value={editForm.age} onChange={(e) => setEditForm({ ...editForm, age: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">等级</label>
                    <select value={editForm.grade} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="">未定</option>
                      <option value="Pre-A1">Pre-A1</option><option value="A1">A1</option><option value="A2">A2</option><option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option><option value="C2">C2</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                    <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="active">学习中</option><option value="inactive">已暂停</option><option value="graduated">已结课</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">家长姓名</label>
                    <input type="text" value={editForm.parentName} onChange={(e) => setEditForm({ ...editForm, parentName: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                    <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">电子邮箱</label>
                    <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">备注说明</label>
                    <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50 justify-end shrink-0">
                <Button variant="outline" type="button" onClick={() => setShowEditModal(false)} disabled={submittingEdit}>取消</Button>
                <Button type="submit" disabled={submittingEdit}>
                  {submittingEdit ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 保存中...</> : '保存修改'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );

  // ===== Report Window Function =====
  function openAssessmentReport(assessment) {
    const reportWindow = window.open('', '_blank', 'width=800,height=900');
    reportWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>评估报告 - ${assessment.student_name || ''}</title>`);
    reportWindow.document.write(`<style>${getReportPrintCSS()}</style></head><body>`);
    reportWindow.document.write('<div id="loading" style="text-align:center;padding:60px;color:#94a3b8;">加载中...</div>');
    reportWindow.document.write('</body></html>');
    reportWindow.document.close();

    request(`/assessments/${assessment.id}`).then(data => {
      const a = data.data || data;
      reportWindow.document.body.innerHTML = buildReportHTML(a);
    }).catch(() => {
      reportWindow.document.body.innerHTML = '<div style="text-align:center;padding:60px;color:#c00;">加载失败</div>';
    });
  }

  function buildReportHTML(a) {
    const starHTML = (val) => {
      let h = '<span class="stars-readonly">';
      for (let i = 1; i <= 5; i++) h += `<span class="star ${i <= val ? 'active' : ''}">★</span>`;
      return h + '</span>';
    };
    const esc = (s) => { if (!s) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[c])); };

    let html = '<div class="report-page">';
    html += '<div class="report-header">';
    html += '<div class="header-top">';
    html += '<div class="brand"><img src="/sunblogo.webp" class="brand-logo" alt="SunnyBridge"></div>';
    html += '<div class="header-website">www.sunnybridge.qzz.io</div>';
    html += '</div>';
    html += '<div class="report-title"><h1>体验课评估报告</h1>';
    html += '<div class="subtitle">Trial Class Assessment Report</div></div>';
    html += '</div>';

    html += '<div class="info-section">';
    html += `<div class="info-item"><div class="info-label">学生姓名 / Student Name</div><div class="info-value">${esc(a.student_name||'')}${a.student_english_name?' ('+esc(a.student_english_name)+')':''}</div></div>`;
    html += `<div class="info-item"><div class="info-label">授课教师 / Teacher</div><div class="info-value">${esc(a.teacher_name||'-')}</div></div>`;
    html += `<div class="info-item"><div class="info-label">上课日期 / Date & Time</div><div class="info-value">${a.class_date||''} ${(a.start_time||'').substring(0,5)}-${(a.end_time||'').substring(0,5)}</div></div>`;
    html += `<div class="info-item"><div class="info-label">课程科目 / Subject</div><div class="info-value">${esc(a.subject||'英语')}</div></div>`;
    html += '</div>';

    const dims = [
      { icon: '🗣️', title: '口语表现 Speaking Performance', items: [['speaking_pronunciation','发音清晰度'],['speaking_communication','开口意愿']], comments: a.speaking_comments },
      { icon: '🎧', title: '理解能力 Comprehension', items: [['listening_conversation','指令理解'],['listening_key_info','反应速度']], comments: a.listening_comments },
      { icon: '🌟', title: '课堂表现 Classroom Performance', items: [['classroom_focus','专注力'],['classroom_interaction','师生互动']], comments: a.classroom_comments }
    ];

    html += '<div class="dimensions">';
    dims.forEach(dim => {
      html += '<div class="dim-card">';
      html += `<div class="dim-header"><span class="dim-icon">${dim.icon}</span>${dim.title}</div>`;
      dim.items.forEach(item => {
        const val = a[item[0]] || 0;
        html += `<div class="dim-item"><span class="dim-label">${item[1]}</span>${starHTML(val)}</div>`;
      });
      if (dim.comments) html += `<div class="dim-comments">评语：${esc(dim.comments)}</div>`;
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="overall-section">';
    html += '<div class="overall-title">📋 综合评估 Overall Assessment</div>';
    if (a.recommended_level) html += `<div class="overall-item"><span class="overall-label">🎓 建议级别 Recommended Level</span><div class="overall-text">${esc(a.recommended_level)}</div></div>`;
    if (a.strengths) html += `<div class="overall-item"><span class="overall-label">💪 强项 Strengths</span><div class="overall-text">${esc(a.strengths)}</div></div>`;
    if (a.improvements) html += `<div class="overall-item"><span class="overall-label">📈 待提升 Areas to Improve</span><div class="overall-text">${esc(a.improvements)}</div></div>`;
    html += '</div>';

    if (a.teacher_message) {
      html += '<div class="message-section">';
      html += '<div class="message-header">💌 教师寄语 Teacher\'s Message</div>';
      html += `<div class="message-text">${esc(a.teacher_message)}</div>`;
      html += '</div>';
    }

    html += '<div class="report-footer">';
    html += '<div class="footer-brand">SunnyBridge 少儿英语</div>';
    html += '<div class="footer-slogan">Bridging Smiles, Building Futures</div>';
    html += '<div class="footer-website">www.sunnybridge.qzz.io</div>';
    html += '<div class="footer-date">' + new Date().toLocaleDateString('zh-CN') + '</div>';
    html += '</div>';

    html += '<div class="print-btn-area"><button class="print-btn" onclick="window.print()">🖨️ 导出 / 打印 PDF</button></div>';
    html += '</div>';
    return html;
  }

  function getReportPrintCSS() {
    return `
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
      .dim-comments { margin-top: 10px; padding: 10px 14px; background: #FFFBF4; border-left: 3px solid #F5A623; border-radius: 6px; font-size: 14px; color: #475569; line-height: 1.6; white-space: pre-wrap; }
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
    `;
  }
}
