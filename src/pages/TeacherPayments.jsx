import { useState, useEffect } from 'react';
import { DollarSign, Calendar, CheckCircle, XCircle, Plus, RefreshCw, Trash2, CreditCard, Edit2, ChevronDown, ChevronUp, Filter, Clock, User } from 'lucide-react';
import { teacherOps, teacherPaymentOps } from '../store';
import { request } from '../store/api';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export default function TeacherPayments() {
  const [payments, setPayments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payingId, setPayingId] = useState(null);
  const [payMethod, setPayMethod] = useState('gcash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [editingRateTeacher, setEditingRateTeacher] = useState(null);
  const [rateValue, setRateValue] = useState('');
  const [rateValue25, setRateValue25] = useState('');
  const [showRateSection, setShowRateSection] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // 筛选状态
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [formData, setFormData] = useState({
    teacher_id: '',
    period_start: '',
    period_end: '',
    notes: ''
  });

  useEffect(() => {
    loadPayments();
    loadTeachers();
  }, []);

  const loadPayments = async () => {
    try {
      const data = await teacherPaymentOps.getAll();
      setPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('加载薪资记录失败:', err);
    }
  };

  const loadTeachers = async () => {
    try {
      const data = await teacherOps.getAll();
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('加载教师列表失败:', err);
    }
  };

  const handleEditRate = (teacher) => {
    setEditingRateTeacher(teacher);
    setRateValue(teacher.hourly_rate || '');
    setRateValue25(teacher.hourly_rate_25 !== undefined && teacher.hourly_rate_25 !== null ? teacher.hourly_rate_25 : '80');
    setShowRateModal(true);
  };

  const handleSaveRate = async () => {
    if (!editingRateTeacher) return;
    try {
      await teacherOps.update(editingRateTeacher.id, {
        ...editingRateTeacher,
        hourly_rate: rateValue ? parseFloat(rateValue) : null,
        hourly_rate_25: rateValue25 ? parseFloat(rateValue25) : null
      });
      setShowRateModal(false);
      loadTeachers();
    } catch (err) {
      alert('保存失败：' + err.message);
    }
  };

  const handleViewDetail = async (id) => {
    setDetailLoading(true);
    setShowDetailModal(true);
    try {
      const res = await request(`/teacher-payments/${id}/details`);
      setDetailData(res.data);
    } catch (err) {
      alert('加载明细失败: ' + err.message);
      setShowDetailModal(false);
    }
    setDetailLoading(false);
  };

  const getFilteredPayments = () => {
    return payments.filter(p => {
      if (filterTeacher && p.teacher_id !== parseInt(filterTeacher)) return false;
      if (filterMonth && !p.period_start.startsWith(filterMonth)) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    });
  };

  const filteredPayments = getFilteredPayments();

  const stats = {
    pending: payments.filter(p => p.status === 'pending'),
    paidThisMonth: payments.filter(p => {
      if (p.status !== 'paid') return false;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      return p.period_start.startsWith(currentMonth);
    }),
    total: payments
  };

  const getThisWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0]
    };
  };

  const getLastWeek = () => {
    const { start, end } = getThisWeek();
    const lastStart = new Date(start);
    lastStart.setDate(lastStart.getDate() - 7);
    const lastEnd = new Date(end);
    lastEnd.setDate(lastEnd.getDate() - 7);
    return {
      start: lastStart.toISOString().split('T')[0],
      end: lastEnd.toISOString().split('T')[0]
    };
  };

  const handleTeacherChange = (teacherId) => {
    let periodStart = '';
    if (teacherId) {
      const teacherPayments = payments.filter(p => p.teacher_id === parseInt(teacherId));
      if (teacherPayments.length > 0) {
        const lastPayment = teacherPayments.sort((a, b) => 
          new Date(b.period_end) - new Date(a.period_end)
        )[0];
        const lastEnd = lastPayment.period_end;
        const nextDay = new Date(lastEnd);
        nextDay.setDate(nextDay.getDate() + 1);
        periodStart = nextDay.toISOString().split('T')[0];
      }
    }
    setFormData(prev => ({ ...prev, teacher_id: teacherId, period_start: periodStart }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await teacherPaymentOps.create(formData);
      const c50 = result.count_50min || 0;
      const c25 = result.count_25min || 0;
      const r50 = result.rate_50min || result.hourly_rate || 0;
      const r25 = result.rate_25min || 0;
      const details = result.details || [];

      let msg = `结算创建成功！\n\n`;
      msg += `📊 统计：\n`;
      msg += `50分钟课: ${c50}节 × ₱${r50} = ₱${c50 * r50}\n`;
      msg += `25分钟课: ${c25}节 × ₱${r25} = ₱${c25 * r25}\n`;
      msg += `总计: ₱${result.total_amount}\n`;
      if (details.length > 0) {
        msg += `\n📋 明细 (${details.length}节)：\n`;
        details.slice(0, 20).forEach((d, i) => {
          const student = d.student_name + (d.student_english_name ? '(' + d.student_english_name + ')' : '');
          msg += `${i + 1}. ${d.date} ${d.start_time || ''} ${student} ${d.is_50min ? '50min' : '25min'}\n`;
        });
        if (details.length > 20) msg += `... 共${details.length}节\n`;
      }
      alert(msg);
      setShowModal(false);
      loadPayments();
      setFormData({ teacher_id: '', period_start: '', period_end: '', notes: '' });
    } catch (err) {
      alert('创建失败: ' + err.message);
    }
    setLoading(false);
  };

  const handlePay = async (id) => {
    setPayingId(id);
    setPayMethod('gcash');
    setPayDate(new Date().toISOString().split('T')[0]);
    setShowPayModal(true);
  };

  const confirmPay = async () => {
    if (!payingId) return;
    try {
      await teacherPaymentOps.markPaid(payingId, { payment_method: payMethod, paid_at: payDate });
      setShowPayModal(false);
      loadPayments();
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('确认取消此结算？')) return;
    try {
      await teacherPaymentOps.cancel(id);
      loadPayments();
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除此结算记录吗？')) return;
    try {
      await teacherPaymentOps.delete(id);
      loadPayments();
    } catch (err) {
      alert('删除失败：' + err.message);
    }
  };

  const quickFillLastWeek = () => {
    const { start, end } = getLastWeek();
    setFormData(prev => ({ ...prev, period_start: start, period_end: end }));
  };

  const STATUS_VARIANTS = {
    pending: 'warning',
    paid: 'success',
    cancelled: 'default'
  };

  const STATUS_LABELS = {
    pending: '待支付',
    paid: '已支付',
    cancelled: '已取消'
  };

  const paymentMethodLabels = {
    gcash: 'GCash',
    bank: '银行转账',
    cash: '现金',
    other: '其他'
  };

  const activeTeachers = teachers.filter(t => t.status === 'active');

  return (
    <div className="p-6 relative min-h-screen space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">教师薪资结算</h1>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> 新建结算
        </Button>
      </div>

      {/* 📊 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-warning-50 to-orange-50 border-warning-100 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-warning-800 mb-1">待支付</p>
              <p className="text-3xl font-bold text-gray-900">
                <span className="text-lg">₱</span>{stats.pending.reduce((sum, p) => sum + p.total_amount, 0).toFixed(2)}
              </p>
              <p className="text-xs text-warning-600 mt-1">{stats.pending.length} 笔记录</p>
            </div>
            <div className="w-12 h-12 bg-white/60 rounded-full flex items-center justify-center shadow-sm">
              <Clock className="w-6 h-6 text-warning-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success-50 to-emerald-50 border-success-100 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-success-800 mb-1">本月已付</p>
              <p className="text-3xl font-bold text-gray-900">
                <span className="text-lg">₱</span>{stats.paidThisMonth.reduce((sum, p) => sum + p.total_amount, 0).toFixed(2)}
              </p>
              <p className="text-xs text-success-600 mt-1">{stats.paidThisMonth.length} 笔记录</p>
            </div>
            <div className="w-12 h-12 bg-white/60 rounded-full flex items-center justify-center shadow-sm">
              <CheckCircle className="w-6 h-6 text-success-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary-50 to-sky-50 border-primary-100 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-primary-800 mb-1">总计记录</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total.length}</p>
              <p className="text-xs text-primary-600 mt-1">
                累计 ₱{stats.total.reduce((sum, p) => sum + p.total_amount, 0).toFixed(2)}
              </p>
            </div>
            <div className="w-12 h-12 bg-white/60 rounded-full flex items-center justify-center shadow-sm">
              <DollarSign className="w-6 h-6 text-primary-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 🔍 筛选栏 */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          >
            <option value="">全部教师</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          >
            <option value="">全部状态</option>
            <option value="pending">待支付</option>
            <option value="paid">已支付</option>
            <option value="cancelled">已取消</option>
          </select>
          <Button variant="ghost" onClick={() => { setFilterTeacher(''); setFilterMonth(''); setFilterStatus(''); }}>
            清除筛选
          </Button>
        </CardContent>
      </Card>

      {/* 💳 结算记录卡片列表 */}
      <div className="space-y-4">
        {filteredPayments.length === 0 ? (
          <Card className="border-dashed shadow-none bg-gray-50/50">
            <CardContent className="p-12 text-center text-gray-400">
              <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>暂无符合条件的薪资记录</p>
            </CardContent>
          </Card>
        ) : (
          filteredPayments.map(payment => (
            <Card key={payment.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-gray-900 text-lg">{payment.teacher_name}</h3>
                    <Badge variant={STATUS_VARIANTS[payment.status]}>
                      {STATUS_LABELS[payment.status]}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 w-fit px-2 py-1 rounded">
                    <Calendar className="w-4 h-4" />
                    {payment.period_start} ~ {payment.period_end}
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-600">
                      <span className="font-bold text-gray-800">{payment.total_classes}</span> 课时
                    </span>
                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                    <span className="text-gray-600">
                      <span className="font-bold text-gray-800">{payment.total_hours}</span> 小时
                    </span>
                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                    <span className="text-gray-600">
                      基准时薪 ₱<span className="font-medium text-gray-800">{payment.hourly_rate}</span>
                    </span>
                  </div>
                </div>

                <div className="sm:text-right flex flex-col sm:items-end gap-3 border-t sm:border-t-0 sm:border-l border-gray-100 pt-3 sm:pt-0 sm:pl-5">
                  <div>
                    <div className="text-xs text-gray-500 sm:mb-1">应付总额</div>
                    <p className="text-2xl font-black text-gray-900">
                      <span className="text-lg font-medium text-gray-500 mr-1">₱</span>
                      {payment.total_amount?.toFixed(2)}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                    {payment.status === 'paid' && (
                      <div className="text-right text-xs bg-success-50 px-2.5 py-1 rounded-lg border border-success-100">
                        <div className="font-medium text-success-800">{payment.paid_at?.split(' ')[0]}</div>
                        <div className="text-success-600 text-[11px]">{paymentMethodLabels[payment.payment_method] || payment.payment_method}</div>
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleViewDetail(payment.id)}>明细</Button>
                    {payment.status === 'pending' && (
                      <>
                        <Button variant="primary" size="sm" onClick={() => handlePay(payment.id)}>支付</Button>
                        <button onClick={() => handleCancel(payment.id)} className="text-gray-400 hover:text-danger-600 ml-1 p-1" title="取消结算"><Trash2 className="w-4 h-4"/></button>
                      </>
                    )}
                    {payment.status === 'cancelled' && (
                      <button onClick={() => handleDelete(payment.id)} className="text-gray-400 hover:text-danger-600 ml-1 p-1" title="删除记录"><Trash2 className="w-4 h-4"/></button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ⚙️ 教师时薪设置 */}
      <Card className="mt-8 border-dashed shadow-none bg-transparent">
        <button
          onClick={() => setShowRateSection(!showRateSection)}
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Edit2 className="w-4 h-4" /> 教师时薪基准设置
          </div>
          {showRateSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        
        {showRateSection && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeTeachers.map(teacher => (
                <div key={teacher.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-primary-300 transition-colors">
                  <div>
                    <div className="font-bold text-gray-800 mb-1">{teacher.name}</div>
                    <div className={`text-xs ${teacher.hourly_rate ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>
                      {teacher.hourly_rate ? `50min: ₱${teacher.hourly_rate}/节` : '未设置'}
                    </div>
                    <div className="text-xs text-orange-600 font-medium">
                      {teacher.hourly_rate_25 ? `25min: ₱${teacher.hourly_rate_25}/节` : ''}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleEditRate(teacher)} className="p-2 h-auto text-gray-400 hover:text-primary-600">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {activeTeachers.length === 0 && (
                <p className="text-gray-400 text-sm col-span-full">暂无在职教师</p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 新建结算弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md shadow-2xl border-0 animate-in fade-in">
            <CardHeader className="border-b border-gray-100">
              <h2 className="text-xl font-bold">新建薪资结算</h2>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">选择教师</label>
                  <select
                    value={formData.teacher_id}
                    onChange={(e) => handleTeacherChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                    required
                  >
                    <option value="">请选择...</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                    <input
                      type="date"
                      value={formData.period_start}
                      onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                    <input
                      type="date"
                      value={formData.period_end}
                      onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={quickFillLastWeek}
                  className="text-xs text-primary-600 hover:underline flex items-center gap-1 font-medium bg-primary-50 px-2 py-1 rounded w-fit"
                >
                  <RefreshCw className="w-3 h-3" /> 自动填入上周周期
                </button>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注 (可选)</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="如：2023年10月第一周"
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>取消</Button>
                  <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
                    {loading ? '计算中...' : '生成结算单'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 支付确认弹窗 */}
      {showPayModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm shadow-2xl border-0">
            <div className="h-2 bg-success-500 rounded-t-xl"></div>
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-success-600" />
                </div>
                <h2 className="text-xl font-bold">确认支付</h2>
                <p className="text-sm text-gray-500 mt-1">请记录实际支付方式与日期</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">支付方式</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-success-500"
                  >
                    <option value="gcash">GCash</option>
                    <option value="bank">银行转账</option>
                    <option value="cash">现金</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">支付日期</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-success-500"
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button variant="outline" className="flex-1" onClick={() => setShowPayModal(false)}>取消</Button>
                  <Button variant="primary" className="flex-1 bg-success-600 hover:bg-success-700" onClick={confirmPay}>确认已支付</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 编辑时薪弹窗 */}
      {showRateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm shadow-2xl border-0">
            <CardHeader className="border-b border-gray-100">
              <h2 className="text-lg font-bold">设置课时单价</h2>
            </CardHeader>
            <CardContent className="p-6">
              <div className="bg-primary-50 p-3 rounded-lg mb-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <div className="font-bold text-gray-900">{editingRateTeacher?.name}</div>
                  <div className="text-xs text-gray-500">教师ID: {editingRateTeacher?.id}</div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">50分钟课程单价 (₱/节)</label>
                  <input
                    type="number" step="0.01"
                    value={rateValue} onChange={(e) => setRateValue(e.target.value)}
                    className="w-full px-4 py-2 font-medium border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">25分钟课程单价 (₱/节)</label>
                  <input
                    type="number" step="0.01"
                    value={rateValue25} onChange={(e) => setRateValue25(e.target.value)}
                    className="w-full px-4 py-2 font-medium border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-6">
                <Button variant="outline" className="flex-1" onClick={() => setShowRateModal(false)}>取消</Button>
                <Button variant="primary" className="flex-1" onClick={handleSaveRate}>保存设置</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 📋 结算明细弹窗 */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border-0 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary-600" />
                结算明细记录
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowDetailModal(false)} className="w-8 h-8 p-0 rounded-full">
                <XCircle className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
              {detailLoading ? (
                <div className="flex flex-col items-center justify-center h-40">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                  <p className="mt-3 text-sm text-gray-500">获取明细中...</p>
                </div>
              ) : detailData ? (
                <>
                  {detailData.payment.status === 'paid' && (
                    <div className="mb-4 bg-success-50 border border-success-200 rounded-xl p-3 flex items-center justify-between text-xs text-success-900">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-success-600 shrink-0" />
                        <span className="font-bold">已于 {detailData.payment.paid_at?.split(' ')[0]} 完成付款</span>
                      </div>
                      <div>
                        支付方式: <span className="font-semibold">{paymentMethodLabels[detailData.payment.payment_method] || detailData.payment.payment_method || '已付'}</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">结算周期</div>
                      <div className="font-bold text-sm bg-gray-50 px-2 py-1 rounded inline-block">{detailData.payment.period_start} <span className="text-gray-400 font-normal mx-1">至</span> {detailData.payment.period_end}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">50分钟课时</div>
                      <div className="font-bold text-sm">{detailData.payment.count_50min} <span className="text-gray-400 font-normal">节 ×</span> ₱{detailData.payment.rate_50min}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">25分钟课时</div>
                      <div className="font-bold text-sm">{detailData.payment.count_25min} <span className="text-gray-400 font-normal">节 ×</span> ₱{detailData.payment.rate_25min}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">应付总额</div>
                      <div className="font-black text-lg text-success-600">₱{detailData.payment.total_amount}</div>
                    </div>
                  </div>
                  
                  <Card className="overflow-hidden shadow-sm border-gray-200">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-medium">
                          <tr>
                            <th className="px-4 py-3">序号</th>
                            <th className="px-4 py-3">上课时间</th>
                            <th className="px-4 py-3">学员</th>
                            <th className="px-4 py-3">类型</th>
                            <th className="px-4 py-3 text-right">结算金额</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {(detailData.details || []).map((d, i) => (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                              <td className="px-4 py-3 font-medium">
                                {d.date} <span className="text-gray-500 font-normal ml-2">{d.start_time}</span>
                              </td>
                              <td className="px-4 py-3">{d.student_name}{d.student_english_name ? ` (${d.student_english_name})` : ''}</td>
                              <td className="px-4 py-3">
                                {d.is_50min 
                                  ? <Badge variant="primary" className="bg-primary-50 text-primary-700 hover:bg-primary-50">50min</Badge> 
                                  : <Badge variant="warning" className="bg-orange-50 text-orange-700 hover:bg-orange-50">25min</Badge>
                                }
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                ₱{d.is_50min ? detailData.payment.rate_50min : detailData.payment.rate_25min}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                          <tr>
                            <td colSpan="4" className="px-4 py-3 text-right">合计</td>
                            <td className="px-4 py-3 text-right text-success-600 text-base">₱{detailData.payment.total_amount}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </Card>
                </>
              ) : (
                <div className="text-center py-12 text-gray-400 border border-dashed rounded-xl bg-gray-50">暂无明细数据</div>
              )}
            </div>
            <div className="shrink-0 p-4 border-t border-gray-100 bg-white flex justify-end rounded-b-xl">
              <Button variant="outline" onClick={() => setShowDetailModal(false)}>关闭</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
