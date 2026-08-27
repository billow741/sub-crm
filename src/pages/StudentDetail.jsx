import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, Calendar, CreditCard, Clock, Plus, Trash2, AlertTriangle, MessageSquare, FileText } from 'lucide-react';
import { studentOps, packageOps, classOps, paymentOps, hourChangeOps } from '../store';
import { request } from '../store/api';
import AdjustHoursModal from '../components/AdjustHoursModal';

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
            
            // 加载课时变动记录（来源1: API hour_changes 表）
            let hcFromApi = [];
            try {
              const hcResult = await hourChangeOps.getByStudent(id);
              hcFromApi = Array.isArray(hcResult) ? hcResult : [];
            } catch (err) {
              console.error('Load hour changes error:', err);
            }

            // 补全课时变动（来源2+3: 从 classes 和 payments 动态合成，补齐缺失记录）
            // 用 related_id + type 做去重键，避免和 API 返回的重复
            const seenKeys = new Set(hcFromApi.map(hc => `${hc.type}-${hc.related_id}`));
            const synthesized = [];
            // 从 classes 合成上课消耗（completed 状态才有课时变动）
            (Array.isArray(classesData) ? classesData : []).forEach(cls => {
              if (cls.status === 'completed' || cls.status === 'absent') {
                const key = `class-${cls.id}`;
                if (!seenKeys.has(key)) {
                  const sign = cls.status === 'absent' ? 0 : -1;
                  const amount = cls.status === 'absent' ? 0 : -(cls.hours || 1);
                  synthesized.push({
                    id: `cls-${cls.id}`,
                    type: 'class',
                    amount,
                    related_id: cls.id,
                    description: cls.status === 'absent'
                      ? `缺席 ${cls.date || ''} ${cls.subject || ''}`
                      : `上课消耗 ${cls.date || ''} ${cls.subject || ''}`,
                    detail_text: `${cls.date || ''} ${cls.subject || cls.teacher || ''}`,
                    created_at: cls.created_at || (cls.date ? cls.date + ' 00:00:00' : null),
                  });
                }
              }
            });
            // 从 payments 合成购买课时
            (Array.isArray(paymentsData) ? paymentsData : []).forEach(p => {
              const key = `payment-${p.id}`;
              if (!seenKeys.has(key)) {
                // 金额 / 估单价 = 课时数，或用 hours 字段
                const hours = p.hours || p.class_count || (p.amount ? Math.round(p.amount / 118) : 0);
                synthesized.push({
                  id: `pay-${p.id}`,
                  type: 'payment',
                  amount: hours,
                  related_id: p.id,
                  description: `购买课时 ${p.description || ''}`,
                  detail_text: p.description || `付款 ¥${(p.amount || 0).toLocaleString()}`,
                  created_at: p.created_at || (p.date ? p.date + ' 00:00:00' : null),
                });
              }
            });

            const merged = [...hcFromApi, ...synthesized];
            // 按 created_at 降序
            merged.sort((a, b) => {
              const ta = a.created_at || '';
              const tb = b.created_at || '';
              return tb.localeCompare(ta);
            });
            setHourChanges(merged);
          }
          
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
      // 直接添加课程，不再需要 packageId
      await classOps.add(id, { ...classForm, studentId: id, hours: hoursToConsume });
      setShowClassModal(false);
      setClassForm({ date: '', hours: 1, notes: '' });
      const [packagesData, classesData] = await Promise.all([
        packageOps.getByStudent(id),
        classOps.getByStudent(id)
      ]);
      setPackages(Array.isArray(packagesData) ? packagesData : []);
      setClasses(Array.isArray(classesData) ? classesData : []);
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
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    }
  };

  const handleAdjustSuccess = async () => {
    loadStudent();
  };

  const totalRemaining = student ? (student.remaining_hours !== undefined && student.remaining_hours !== null
    ? student.remaining_hours
    : Math.round(((student.total_hours ?? student.package_summary?.total_hours ?? 0) - (student.used_hours ?? student.package_summary?.used_hours ?? 0)) * 100) / 100) : 0;
  const totalSpent = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // 获取第一个活跃的课时包（用于调整）
  const activePackage = packages.find(p => p.remaining > 0) || packages[0];

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-gray-500">学生不存在</p>
          <Link to="/students" className="text-primary-600 hover:underline mt-2 inline-block">
            返回学生列表
          </Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: '概览' },
    { id: 'classes', label: '上课记录' },
    { id: 'payments', label: '付款记录' },
    { id: 'hour-changes', label: '课时变动' },
    { id: 'assessments', label: '评估报告' },
  ];

  const STATUS_LABELS = {
    completed: '已完成',
    scheduled: '已排课',
    cancelled: '已取消',
    absent: '缺席'
  };

  const STATUS_COLORS = {
    completed: 'bg-green-100 text-green-700',
    scheduled: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-gray-100 text-gray-700',
    absent: 'bg-red-100 text-red-700'
  };

  return (
    <div className="p-8">
      <button onClick={() => navigate('/students')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6">
        <ArrowLeft size={20} />
        返回学生列表
      </button>

      {/* 学生基本信息 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-2xl text-primary-700 font-bold">
                {student.name?.charAt(0) || '学'}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{student.name}</h1>
              {student.english_name && <div className="text-sm text-gray-400 mt-0.5">{student.english_name}</div>}
              <div className="flex items-center gap-4 mt-2 text-gray-500">
                {student.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={16} />
                    {student.phone}
                  </span>
                )}
                {student.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={16} />
                    {student.email}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                {student.grade && <span>等级: {student.grade}</span>}
                {student.age && <span>年龄: {student.age}</span>}
                {student.parentName && <span>家长: {student.parentName}</span>}
              </div>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            student.status === 'active' ? 'bg-green-100 text-green-700' :
            student.status === 'inactive' ? 'bg-gray-100 text-gray-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {student.status === 'active' ? '学习中' : student.status === 'inactive' ? '已暂停' : '已结课'}
          </span>
        </div>

        {/* 课时不足警告 */}
        {totalRemaining > 0 && totalRemaining < 3 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertTriangle size={18} />
            <span className="text-sm font-medium">课时不足！剩余 {totalRemaining} 节，请提醒家长续费</span>
          </div>
        )}
        {totalRemaining === 0 && (
          <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2 text-red-800">
            <AlertTriangle size={18} />
            <span className="text-sm font-medium">课时已用完，请立即购买新课时</span>
          </div>
        )}

        {/* 快速统计 */}
        <div className="grid grid-cols-5 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{student?.total_hours ?? student?.package_summary?.total_hours ?? 0}</div>
            <div className="text-sm text-gray-500">总课时</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-600">{totalRemaining}</div>
            <div className="text-sm text-gray-500">剩余课时</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{classes.filter(c => c.status === 'completed').length}</div>
            <div className="text-sm text-gray-500">上课次数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">¥{totalSpent.toLocaleString()}</div>
            <div className="text-sm text-gray-500">累计消费</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{payments.length}</div>
            <div className="text-sm text-gray-500">付款次数</div>
          </div>
        </div>
      </div>

      {/* 标签页 */}
      <div className="mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 概览 */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 课时余额概览 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">课时余额</h3>
              {student && (
                <button
                  onClick={() => setShowAdjustModal(true)}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  调整课时
                </button>
              )}
            </div>
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-primary-600">{totalRemaining}</div>
              <div className="text-sm text-gray-500 mt-1">剩余课时</div>
            </div>
            {/* 课时包列表 */}
            {packages.length > 0 && (
              <div className="mt-4 space-y-2">
                {packages.map(pkg => (
                  <div key={pkg.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <span className="text-gray-600">{pkg.name || `套餐 #${pkg.id}`}</span>
                    <span className="font-medium text-primary-600">{pkg.remaining}/{pkg.total}</span>
                  </div>
                ))}
              </div>
            )}
            {totalRemaining < 3 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                课时不足，请提醒家长续费
              </div>
            )}
          </div>

          {/* 最近上课记录 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">最近上课</h3>
              <button onClick={() => setShowClassModal(true)} className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1">
                <Plus size={16} />
                添加
              </button>
            </div>
            {classes.length > 0 ? (
              <div className="space-y-3">
                {classes.slice(0, 3).map(cls => (
                  <div key={cls.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Clock size={16} className="text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-800">{cls.date}</div>
                        <div className="text-sm text-gray-500">
                          {cls.hours} 节
                          {cls.status && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[cls.status]}`}>
                              {STATUS_LABELS[cls.status]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {(cls.content || cls.homework || (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))) && (
                      <button onClick={() => (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))
                        ? setShowAssessmentFeedback(assessments.find(a => parseInt(a.class_id) === parseInt(cls.id)))
                        : setShowFeedbackModal(cls)} className="text-primary-600 hover:text-primary-700" title={cls.is_trial === 1 ? "查看报告" : "查看反馈"}>
                        {(cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))
                          ? <FileText size={16} />
                          : <MessageSquare size={16} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-4">暂无上课记录</p>
            )}
          </div>
        </div>
      )}

      {/* 上课记录 */}
      {activeTab === 'classes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-gray-800">上课记录</h3>
            <button onClick={() => setShowClassModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
              <Plus size={18} />
              记录上课
            </button>
          </div>
          {classes.length > 0 ? (
            <div className="space-y-3">
              {classes.map(cls => (
                <div key={cls.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
                      <Clock className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">{cls.date}</div>
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        {cls.hours} 节
                        {cls.status && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[cls.status]}`}>
                            {STATUS_LABELS[cls.status]}
                          </span>
                        )}
                        {cls.content && <span className="text-primary-600">· 有反馈</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(cls.content || cls.homework || (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))) && (
                      <button onClick={() => (cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))
                        ? setShowAssessmentFeedback(assessments.find(a => parseInt(a.class_id) === parseInt(cls.id)))
                        : setShowFeedbackModal(cls)} className="p-2 text-primary-600 hover:text-primary-700" title={cls.is_trial === 1 ? "查看报告" : "查看反馈"}>
                        {(cls.is_trial === 1 && assessments.some(a => parseInt(a.class_id) === parseInt(cls.id)))
                          ? <FileText size={18} />
                          : <MessageSquare size={18} />}
                      </button>
                    )}
                    <button onClick={() => handleDeleteClass(cls.id)} className="p-2 text-gray-400 hover:text-red-600">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无上课记录</p>
            </div>
          )}
        </div>
      )}

      {/* 付款记录 */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-6">付款记录</h3>
          {payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map(payment => (
                <div key={payment.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">{payment.date}</div>
                      <div className="text-sm text-gray-500">
                        {payment.payment_method || payment.method || '微信支付'}
                        {payment.description && ` · ${payment.description}`}
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg font-semibold ${payment.amount > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {payment.amount > 0 ? '+' : ''}¥{payment.amount?.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无付款记录</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'hour-changes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-6">课时变动记录</h3>
          {hourChanges.length > 0 ? (
            <div className="space-y-3">
              {hourChanges.map(hc => (
                <div key={hc.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      hc.type === 'payment' ? 'bg-green-50' :
                      hc.type === 'class' ? 'bg-red-50' : 'bg-blue-50'
                    }`}>
                      {hc.type === 'payment' ? '+' : hc.type === 'class' ? '-' : '~'}
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">
                        {hc.type === 'payment' && '购买课时'}
                        {hc.type === 'class' && '上课消耗'}
                        {hc.type === 'adjust' && '手动调整'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {hc.description || hc.detail_text || '-'}
                        {hc.created_at && ` · ${hc.created_at.split(' ')[0]}`}
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg font-semibold ${
                    hc.amount > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {hc.amount > 0 ? '+' : ''}{hc.amount} 课时
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p>暂无课时变动记录</p>
            </div>
          )}
        </div>
      )}

      {/* 评估与阶段成长报告 */}
      {activeTab === 'assessments' && (
        <div className="space-y-6">
          {/* 阶段性里程碑成长报告 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800 text-lg flex items-center gap-2">
                  <span>🏆 阶段性成长报告 (Milestone Reports)</span>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full font-medium">共 {progressReports.length} 份</span>
                </h3>
                <p className="text-xs text-gray-500 mt-1">系统在学生完成第 10、30、60 节课或晋级升阶时自动生成的阶段能力综合评估</p>
              </div>
            </div>

            {progressReports.length > 0 ? (
              <div className="space-y-4">
                {progressReports.map(pr => {
                  const typeMap = {
                    milestone_10: { label: '🥉 10课时适应期评估', color: 'bg-amber-50 text-amber-800 border-amber-200' },
                    milestone_30: { label: '🥈 30课时进阶期评估', color: 'bg-blue-50 text-blue-800 border-blue-200' },
                    milestone_60: { label: '🥇 60课时大纲总结', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
                    level_up: { label: '🚀 能力等级跃迁报告', color: 'bg-purple-50 text-purple-800 border-purple-200' }
                  };
                  const badge = typeMap[pr.report_type] || { label: '📋 ' + (pr.report_type || '阶段评估'), color: 'bg-gray-50 text-gray-800 border-gray-200' };

                  return (
                    <div key={pr.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-white">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-xs px-2.5 py-1 rounded-md font-semibold border ${badge.color}`}>
                              {badge.label}
                            </span>
                            <span className="text-sm text-gray-500">{pr.created_at ? pr.created_at.substring(0,10) : ''}</span>
                            <span className="text-sm font-medium text-gray-700">执教教师：{pr.teacher_name || '-'}</span>
                          </div>
                          {(pr.from_level || pr.to_level) && (
                            <div className="mt-2 inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 text-xs px-3 py-1 rounded-lg font-medium">
                              <span>🎓 级别晋升：</span>
                              <span>{pr.from_level || '入学'}</span>
                              <span>→</span>
                              <span className="font-bold text-purple-900">{pr.to_level}</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setShowProgressReportModal(pr)}
                          className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 font-medium flex items-center gap-1"
                        >
                          <FileText className="w-4 h-4" />
                          查看详情
                        </button>
                      </div>

                      {/* 阶段摘要与评语 */}
                      {pr.summary && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                          <span className="font-semibold text-gray-800">📋 阶段总结：</span>{pr.summary}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        {pr.strengths && (
                          <div className="p-3 bg-green-50 rounded-lg text-xs text-green-900 border border-green-100">
                            <span className="font-bold text-green-800 block mb-1">💪 亮点优势：</span>
                            <p className="whitespace-pre-wrap">{pr.strengths}</p>
                          </div>
                        )}
                        {pr.improvements && (
                          <div className="p-3 bg-orange-50 rounded-lg text-xs text-orange-900 border border-orange-100">
                            <span className="font-bold text-orange-800 block mb-1">📈 建议提升：</span>
                            <p className="whitespace-pre-wrap">{pr.improvements}</p>
                          </div>
                        )}
                      </div>

                      {pr.teacher_message && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-900 border border-blue-100">
                          <span className="font-bold text-blue-800 block mb-1">💌 教师寄语：</span>
                          <p className="whitespace-pre-wrap">{pr.teacher_message}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-500" />
                <p className="text-sm">暂无阶段性成长报告（完成 10、30、60 课时或升阶时将自动触发教师生成）</p>
              </div>
            )}
          </div>

          {/* 体验课评估报告 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 text-lg mb-4 flex items-center gap-2">
              <span>📝 体验课入学评估 (Trial Assessment)</span>
              <span className="text-xs bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full font-medium">共 {assessments.length} 份</span>
            </h3>
            {assessments.length > 0 ? (
              <div className="space-y-4">
                {assessments.map(a => (
                  <div key={a.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {a.is_trial === 1 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">🎁 体验课</span>}
                          <span className="text-sm text-gray-500">{a.class_date} {a.start_time?.substring(0,5)} - {a.end_time?.substring(0,5)}</span>
                          <span className="text-sm font-medium text-gray-700">教师：{a.teacher_name || '-'}</span>
                        </div>
                        <div className="text-sm text-gray-500">课程：{a.subject || '英语'}</div>
                        {a.recommended_level && (
                          <div className="mt-2 inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-lg">
                            🎓 建议级别: {a.recommended_level}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => openAssessmentReport(a)}
                        className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm hover:bg-orange-200 font-medium flex items-center gap-1"
                      >
                        <FileText className="w-4 h-4" />
                        查看 / 导出PDF
                      </button>
                    </div>
                    {a.teacher_message && (
                      <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-gray-600">
                        <span className="font-medium">💌 教师寄语：</span>{a.teacher_message}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-400">{a.status === 'published' ? '已发布' : '草稿'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-orange-500" />
                <p className="text-sm">暂无体验课评估报告</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 添加上课记录弹窗 */}
      {showClassModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">记录上课</h2>
            <form onSubmit={handleAddClass} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">上课日期 *</label>
                <input
                  type="date"
                  required
                  value={classForm.date}
                  onChange={(e) => setClassForm({ ...classForm, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">消耗课时 *</label>
                <input
                  type="number"
                  required
                  min="0.5"
                  step="0.5"
                  value={classForm.hours}
                  onChange={(e) => setClassForm({ ...classForm, hours: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <input
                  type="text"
                  value={classForm.notes}
                  onChange={(e) => setClassForm({ ...classForm, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="如：口语课、阅读课"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowClassModal(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                  取消
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 反馈详情弹窗 */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-4">上课反馈详情</h2>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">学生：</span>
                  <span className="font-medium text-gray-800">{student.name}</span>
                </div>
                <div>
                  <span className="text-gray-500">日期：</span>
                  <span className="font-medium text-gray-800">{showFeedbackModal.date}</span>
                </div>
                <div>
                  <span className="text-gray-500">课时：</span>
                  <span className="font-medium text-gray-800">{showFeedbackModal.hours} 节</span>
                </div>
                <div>
                  <span className="text-gray-500">状态：</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[showFeedbackModal.status]}`}>
                    {STATUS_LABELS[showFeedbackModal.status]}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {showFeedbackModal.content && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">上课内容</h3>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap">
                    {showFeedbackModal.content}
                  </div>
                </div>
              )}
              {showFeedbackModal.homework && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">作业布置</h3>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap">
                    {showFeedbackModal.homework}
                  </div>
                </div>
              )}
              {showFeedbackModal.notes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">备注</h3>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap">
                    {showFeedbackModal.notes}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={() => setShowFeedbackModal(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 阶段性成长报告详情弹窗 */}
      {showProgressReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <span>🏆 阶段性成长评估报告</span>
                </h2>
                <p className="text-xs text-gray-400 mt-1">报告生成时间：{showProgressReportModal.created_at || '-'}</p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                {showProgressReportModal.report_type === 'milestone_10' ? '🥉 10课时适应期' :
                 showProgressReportModal.report_type === 'milestone_30' ? '🥈 30课时进阶期' :
                 showProgressReportModal.report_type === 'milestone_60' ? '🥇 60课时大纲总结' :
                 showProgressReportModal.report_type === 'level_up' ? '🚀 等级跃迁' :
                 (showProgressReportModal.report_type || '阶段里程碑')}
              </span>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 my-4 grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">学生姓名：</span><span className="font-semibold text-gray-800">{student.name} {student.english_name ? `(${student.english_name})` : ''}</span></div>
              <div><span className="text-gray-500">执教教师：</span><span className="font-semibold text-gray-800">{showProgressReportModal.teacher_name || '-'}</span></div>
              {(showProgressReportModal.from_level || showProgressReportModal.to_level) && (
                <div className="col-span-2 flex items-center gap-2 font-medium text-purple-700 bg-purple-50 p-2 rounded-lg">
                  <span>🎓 能力级别跃迁：</span>
                  <span>{showProgressReportModal.from_level || '入学'}</span>
                  <span>→</span>
                  <span className="font-bold text-purple-900">{showProgressReportModal.to_level}</span>
                </div>
              )}
            </div>

            <div className="space-y-4 text-sm">
              {showProgressReportModal.summary && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-1 flex items-center gap-1.5">
                    <span>📋 阶段学习总结 (Summary)</span>
                  </h4>
                  <div className="p-3 bg-gray-50 rounded-xl text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {showProgressReportModal.summary}
                  </div>
                </div>
              )}

              {showProgressReportModal.strengths && (
                <div>
                  <h4 className="font-bold text-green-800 mb-1 flex items-center gap-1.5">
                    <span>💪 亮点与优势 (Strengths)</span>
                  </h4>
                  <div className="p-3 bg-green-50 rounded-xl text-green-900 border border-green-100 whitespace-pre-wrap leading-relaxed">
                    {showProgressReportModal.strengths}
                  </div>
                </div>
              )}

              {showProgressReportModal.improvements && (
                <div>
                  <h4 className="font-bold text-orange-800 mb-1 flex items-center gap-1.5">
                    <span>📈 建议重点提升 (Areas to Improve)</span>
                  </h4>
                  <div className="p-3 bg-orange-50 rounded-xl text-orange-900 border border-orange-100 whitespace-pre-wrap leading-relaxed">
                    {showProgressReportModal.improvements}
                  </div>
                </div>
              )}

              {showProgressReportModal.recommendation && (
                <div>
                  <h4 className="font-bold text-indigo-800 mb-1 flex items-center gap-1.5">
                    <span>🎯 后续规划与建议教材 (Recommendations)</span>
                  </h4>
                  <div className="p-3 bg-indigo-50 rounded-xl text-indigo-900 border border-indigo-100 whitespace-pre-wrap leading-relaxed">
                    {showProgressReportModal.recommendation}
                  </div>
                </div>
              )}

              {showProgressReportModal.teacher_message && (
                <div>
                  <h4 className="font-bold text-blue-800 mb-1 flex items-center gap-1.5">
                    <span>💌 老师寄语 (Teacher's Message)</span>
                  </h4>
                  <div className="p-3 bg-blue-50 rounded-xl text-blue-900 border border-blue-100 whitespace-pre-wrap leading-relaxed">
                    {showProgressReportModal.teacher_message}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowProgressReportModal(null)}
                className="px-5 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 评估报告弹窗（上课记录中体验课查看） */}
      {showAssessmentFeedback && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">📝 体验课评估报告</h2>
              <span className="text-sm text-orange-600 font-medium">🎁 体验课</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">学生：</span><span className="font-medium text-gray-800">{showAssessmentFeedback.student_name || student.name}{showAssessmentFeedback.student_english_name ? ` (${showAssessmentFeedback.student_english_name})` : ''}</span></div>
                <div><span className="text-gray-500">教师：</span><span className="font-medium text-gray-800">{showAssessmentFeedback.teacher_name || '-'}</span></div>
                <div><span className="text-gray-500">日期：</span><span className="font-medium text-gray-800">{showAssessmentFeedback.class_date} {(showAssessmentFeedback.start_time||'').substring(0,5)}-{(showAssessmentFeedback.end_time||'').substring(0,5)}</span></div>
                <div><span className="text-gray-500">科目：</span><span className="font-medium text-gray-800">{showAssessmentFeedback.subject || '英语'}</span></div>
              </div>
            </div>
            {(() => {
              const a = showAssessmentFeedback;
              const StarRow = ({ score }) => (
                <span className="text-lg tracking-tight">
                  {[1,2,3,4,5].map(i => <span key={i} className={i <= (a[score]||0) ? 'text-orange-400' : 'text-gray-300'}>★</span>)}
                </span>
              );
              const dims = [
                {title:'🎧 听力评估',items:[['listening_conversation','日常对话理解'],['listening_key_info','关键信息抓取']],comment:'listening_comments'},
                {title:'🗣️ 口语评估',items:[['speaking_pronunciation','发音与流利度'],['speaking_communication','表达能力']],comment:'speaking_comments'},
                {title:'📖 阅读评估',items:[['reading_vocabulary','词汇量'],['reading_comprehension','阅读理解']],comment:'reading_comments'},
                {title:'✍️ 写作评估',items:[['writing_spelling','基础拼写'],['writing_sentences','简单句构建']],comment:'writing_comments'},
                {title:'🌟 课堂表现',items:[['classroom_participation','参与度'],['classroom_focus','专注力'],['classroom_interaction','互动意愿']],comment:'classroom_comments'},
              ];
              return (
                <div className="space-y-3">
                  {dims.map(dim => (
                    <div key={dim.title} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-medium text-gray-700 text-sm mb-2">{dim.title}</div>
                      {dim.items.map(item => (
                        <div key={item[0]} className="flex items-center justify-between py-1">
                          <span className="text-sm text-gray-600">{item[1]}</span>
                          <StarRow score={item[0]} />
                        </div>
                      ))}
                      {a[dim.comment] && (
                        <div className="mt-2 p-2 bg-orange-50 border-l-2 border-orange-300 rounded text-sm text-gray-600 whitespace-pre-wrap">{a[dim.comment]}</div>
                      )}
                    </div>
                  ))}
                  <div className="border border-gray-200 rounded-lg p-3 bg-orange-50">
                    <div className="font-medium text-gray-700 text-sm mb-2">📋 综合评估</div>
                    {a.strengths && <div className="mb-2"><span className="text-sm font-medium text-gray-700">💪 强项</span><div className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{a.strengths}</div></div>}
                    {a.improvements && <div className="mb-2"><span className="text-sm font-medium text-gray-700">📈 待提升</span><div className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{a.improvements}</div></div>}
                    {a.recommended_level && <div className="mb-2"><span className="text-sm font-medium text-gray-700">🎓 建议级别</span><span className="ml-2 text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{a.recommended_level}</span></div>}
                    {a.teacher_message && <div className="mt-3 p-3 bg-blue-50 rounded-lg"><span className="text-sm font-medium text-gray-700">💌 教师寄语</span><div className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{a.teacher_message}</div></div>}
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-between mt-6">
              <button onClick={() => openAssessmentReport(showAssessmentFeedback)} className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm flex items-center gap-1">
                <FileText size={16} /> 导出 PDF
              </button>
              <button onClick={() => setShowAssessmentFeedback(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">关闭</button>
            </div>
          </div>
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

    // Fetch full data
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
    // Header with logo + gradient
    html += '<div class="report-header">';
    html += '<div class="header-top">';
    html += '<div class="brand"><img src="/sunblogo.webp" class="brand-logo" alt="SunnyBridge"></div>';
    html += '<div class="header-website">www.sunnybridge.qzz.io</div>';
    html += '</div>';
    html += '<div class="report-title"><h1>体验课评估报告</h1>';
    html += '<div class="subtitle">Trial Class Assessment Report</div></div>';
    html += '</div>';

    // Student Info
    html += '<div class="info-section">';
    html += `<div class="info-item"><div class="info-label">学生姓名 / Student Name</div><div class="info-value">${esc(a.student_name||'')}${a.student_english_name?' ('+esc(a.student_english_name)+')':''}</div></div>`;
    html += `<div class="info-item"><div class="info-label">授课教师 / Teacher</div><div class="info-value">${esc(a.teacher_name||'-')}</div></div>`;
    html += `<div class="info-item"><div class="info-label">上课日期 / Date & Time</div><div class="info-value">${a.class_date||''} ${(a.start_time||'').substring(0,5)}-${(a.end_time||'').substring(0,5)}</div></div>`;
    html += `<div class="info-item"><div class="info-label">课程科目 / Subject</div><div class="info-value">${esc(a.subject||'英语')}</div></div>`;
    html += '</div>';

    // Dimensions (精简后: 3个维度, 各2项)
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

    // Overall
    html += '<div class="overall-section">';
    html += '<div class="overall-title">📋 综合评估 Overall Assessment</div>';
    if (a.recommended_level) html += `<div class="overall-item"><span class="overall-label">🎓 建议级别 Recommended Level</span><div class="overall-text">${esc(a.recommended_level)}</div></div>`;
    if (a.strengths) html += `<div class="overall-item"><span class="overall-label">💪 强项 Strengths</span><div class="overall-text">${esc(a.strengths)}</div></div>`;
    if (a.improvements) html += `<div class="overall-item"><span class="overall-label">📈 待提升 Areas to Improve</span><div class="overall-text">${esc(a.improvements)}</div></div>`;
    html += '</div>';

    // Teacher Message
    if (a.teacher_message) {
      html += '<div class="message-section">';
      html += '<div class="message-header">💌 教师寄语 Teacher\'s Message</div>';
      html += `<div class="message-text">${esc(a.teacher_message)}</div>`;
      html += '</div>';
    }

    // Footer
    html += '<div class="report-footer">';
    html += '<div class="footer-brand">SunnyBridge 少儿英语</div>';
    html += '<div class="footer-slogan">Bridging Smiles, Building Futures</div>';
    html += '<div class="footer-website">www.sunnybridge.qzz.io</div>';
    html += '<div class="footer-date">' + new Date().toLocaleDateString('zh-CN') + '</div>';
    html += '</div>';

    // Print button
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
