import { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, Calendar, CheckCircle, XCircle, Plus, RefreshCw, Trash2, 
  CreditCard, Edit2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, 
  Filter, Clock, User, Users, Receipt, Wallet, Coins, AlertCircle, 
  ArrowRight, FileText, Check, Layers, ExternalLink 
} from 'lucide-react';
import { teacherOps, teacherPaymentOps } from '../store';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export default function TeacherPayments() {
  // ── 导航与视图状态 ──
  const [activeTab, setActiveTab] = useState('board'); // 'board' | 'settlements' | 'vouchers'

  // ── 数据状态 ──
  const [boardData, setBoardData] = useState({ teachers: [], global_stats: {} });
  const [boardLoading, setBoardLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [vouchers, setVouchers] = useState([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [teachers, setTeachers] = useState([]);

  // ── 结算单筛选与分页 (20条/页) ──
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // ── 付款单筛选与分页 (20条/页) ──
  const [voucherFilterTeacher, setVoucherFilterTeacher] = useState('');
  const [voucherFilterMonth, setVoucherFilterMonth] = useState('');
  const [voucherFilterType, setVoucherFilterType] = useState('');
  const [voucherFilterStatus, setVoucherFilterStatus] = useState('');
  const [voucherPage, setVoucherPage] = useState(1);

  // ── 弹窗控制 ──
  // 1. 新建结算单
  const [showModal, setShowModal] = useState(false);
  const [creatingSettlement, setCreatingSettlement] = useState(false);
  const [teacherAdvanceInfo, setTeacherAdvanceInfo] = useState({ balance: 0, count: 0 });
  const [formData, setFormData] = useState({
    teacher_id: '',
    period_start: '',
    period_end: '',
    notes: ''
  });

  // 2. 录入付款单 / 预付款
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [submittingVoucher, setSubmittingVoucher] = useState(false);
  const [voucherForm, setVoucherForm] = useState({
    teacher_id: '',
    amount: '',
    voucher_type: 'advance', // 'advance' | 'settlement'
    settlement_id: '',
    payment_method: 'gcash',
    paid_at: new Date().toISOString().split('T')[0],
    transaction_ref: '',
    notes: ''
  });

  // 3. 结算单付款弹窗
  const [showPayModal, setShowPayModal] = useState(false);
  const [payingSettlement, setPayingSettlement] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('gcash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  // 4. 明细弹窗
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 5. 教师时薪设置
  const [showRateModal, setShowRateModal] = useState(false);
  const [editingRateTeacher, setEditingRateTeacher] = useState(null);
  const [rateValue, setRateValue] = useState('');
  const [rateValue25, setRateValue25] = useState('');
  const [showRateSection, setShowRateSection] = useState(false);

  // ── 初始化加载 ──
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    loadBoardSummary();
    loadPayments();
    loadVouchers();
    loadTeachers();
  };

  const loadBoardSummary = async () => {
    setBoardLoading(true);
    try {
      const data = await teacherPaymentOps.getBoardSummary();
      setBoardData(data || { teachers: [], global_stats: {} });
    } catch (err) {
      console.error('加载看板汇总失败:', err);
    }
    setBoardLoading(false);
  };

  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      const data = await teacherPaymentOps.getAll();
      setPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('加载结算单列表失败:', err);
    }
    setPaymentsLoading(false);
  };

  const loadVouchers = async () => {
    setVouchersLoading(true);
    try {
      const data = await teacherPaymentOps.getVouchers();
      setVouchers(Array.isArray(data?.vouchers) ? data.vouchers : (Array.isArray(data) ? data : []));
    } catch (err) {
      console.error('加载付款单流水失败:', err);
    }
    setVouchersLoading(false);
  };

  const loadTeachers = async () => {
    try {
      const data = await teacherOps.getAll();
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('加载教师列表失败:', err);
    }
  };

  // ── 辅助常量 ──
  const SETTLEMENT_STATUS_MAP = {
    pending: { label: '待支付', variant: 'warning', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    partial: { label: '部分付款', variant: 'primary', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    paid: { label: '已结清', variant: 'success', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    cancelled: { label: '已取消', variant: 'default', color: 'text-gray-500 bg-gray-50 border-gray-200' }
  };

  const VOUCHER_STATUS_MAP = {
    unallocated: { label: '待抵扣 (全额)', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    partially_allocated: { label: '部分已抵扣', color: 'text-sky-700 bg-sky-50 border-sky-200' },
    fully_allocated: { label: '已完全核销', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    cancelled: { label: '已作废', color: 'text-gray-400 bg-gray-50 border-gray-200' }
  };

  const PAYMENT_METHOD_MAP = {
    gcash: 'GCash',
    bank: '银行转账',
    cash: '现金',
    other: '其他'
  };

  // ── 周期计算辅助 ──
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

  const quickFillLastWeek = () => {
    const { start, end } = getLastWeek();
    setFormData(prev => ({ ...prev, period_start: start, period_end: end }));
  };

  // ── 结算单表单联动 ──
  const handleTeacherChangeInSettlement = async (teacherId) => {
    let periodStart = '';
    let advBalance = 0;
    let advCount = 0;

    if (teacherId) {
      const teacherPayments = payments.filter(p => p.teacher_id === parseInt(teacherId) && p.status !== 'cancelled');
      if (teacherPayments.length > 0) {
        const lastPayment = teacherPayments.sort((a, b) => 
          new Date(b.period_end) - new Date(a.period_end)
        )[0];
        const lastEnd = lastPayment.period_end;
        const nextDay = new Date(lastEnd);
        nextDay.setDate(nextDay.getDate() + 1);
        periodStart = nextDay.toISOString().split('T')[0];
      }

      // 查询可用预付款
      const tBoard = boardData.teachers?.find(t => t.id === parseInt(teacherId));
      if (tBoard) {
        advBalance = tBoard.advance_balance || 0;
        advCount = tBoard.advance_count || 0;
      } else {
        try {
          const stats = await teacherPaymentOps.getStats(teacherId);
          advBalance = stats.advance_balance || 0;
          advCount = stats.advance_count || 0;
        } catch (e) {
          console.error(e);
        }
      }
    }

    setTeacherAdvanceInfo({ balance: advBalance, count: advCount });
    setFormData(prev => ({ ...prev, teacher_id: teacherId, period_start: periodStart }));
  };

  // 打开新建结算单弹窗
  const openCreateSettlementModal = (prefilledTeacherId = '') => {
    const initialTeacherId = prefilledTeacherId ? String(prefilledTeacherId) : '';
    setFormData({
      teacher_id: initialTeacherId,
      period_start: '',
      period_end: '',
      notes: ''
    });
    setShowModal(true);
    if (initialTeacherId) {
      handleTeacherChangeInSettlement(initialTeacherId);
    } else {
      setTeacherAdvanceInfo({ balance: 0, count: 0 });
    }
  };

  // 提交新建结算单
  const handleCreateSettlement = async (e) => {
    e.preventDefault();
    setCreatingSettlement(true);
    try {
      const result = await teacherPaymentOps.create(formData);
      const c50 = result.count_50min || 0;
      const c25 = result.count_25min || 0;
      const r50 = result.rate_50min || result.hourly_rate || 0;
      const r25 = result.rate_25min || 0;
      const appliedAdv = result.applied_advance || 0;
      const balDue = result.balance_due !== undefined ? result.balance_due : (result.total_amount - appliedAdv);

      let msg = `✅ 结算单创建成功！\n\n`;
      msg += `📊 课酬核算：\n`;
      msg += `• 50分钟课: ${c50}节 × ₱${r50} = ₱${c50 * r50}\n`;
      msg += `• 25分钟课: ${c25}节 × ₱${r25} = ₱${c25 * r25}\n`;
      msg += `• 应结总额: ₱${result.total_amount}\n`;
      if (appliedAdv > 0) {
        msg += `\n⚡ 自动核销预付款: -₱${appliedAdv}\n`;
        msg += `• 待付余额: ₱${balDue} (${result.status === 'paid' ? '已全额结清' : '部分结清'})\n`;
      }
      alert(msg);
      setShowModal(false);
      loadAllData();
    } catch (err) {
      alert('创建结算单失败: ' + err.message);
    }
    setCreatingSettlement(false);
  };

  // ── 录入付款单 ──
  const openCreateVoucherModal = (prefilledTeacherId = '', type = 'advance') => {
    setVoucherForm({
      teacher_id: prefilledTeacherId ? String(prefilledTeacherId) : '',
      amount: '',
      voucher_type: type,
      settlement_id: '',
      payment_method: 'gcash',
      paid_at: new Date().toISOString().split('T')[0],
      transaction_ref: '',
      notes: ''
    });
    setShowVoucherModal(true);
  };

  const handleCreateVoucher = async (e) => {
    e.preventDefault();
    if (!voucherForm.teacher_id || !voucherForm.amount || parseFloat(voucherForm.amount) <= 0) {
      alert('请完整填写教师和有效付款金额');
      return;
    }
    setSubmittingVoucher(true);
    try {
      const res = await teacherPaymentOps.createVoucher({
        ...voucherForm,
        teacher_id: parseInt(voucherForm.teacher_id),
        amount: parseFloat(voucherForm.amount),
        settlement_id: voucherForm.settlement_id ? parseInt(voucherForm.settlement_id) : null
      });

      alert(`✅ 付款单录入成功！\n凭证号: ${res.voucher_no || res.id}\n类型: ${voucherForm.voucher_type === 'advance' ? '预付款' : '结算付款'}\n金额: ₱${voucherForm.amount}`);
      setShowVoucherModal(false);
      loadAllData();
    } catch (err) {
      alert('录入付款单失败: ' + err.message);
    }
    setSubmittingVoucher(false);
  };

  const handleDeleteVoucher = async (voucher) => {
    if (voucher.allocated_amount > 0) {
      alert('该付款单已产生核销，无法直接撤销！如需撤销，请先取消对应的结算单以反冲释放核销额度。');
      return;
    }
    if (!confirm(`确认撤销/删除此付款单 (凭证号: ${voucher.voucher_no})？金额 ₱${voucher.amount}`)) return;

    try {
      await teacherPaymentOps.deleteVoucher(voucher.id);
      loadAllData();
    } catch (err) {
      alert('撤销失败: ' + err.message);
    }
  };

  // ── 结算单支付 ──
  const handleOpenPay = (payment) => {
    setPayingSettlement(payment);
    const due = payment.balance_due !== undefined ? payment.balance_due : Math.max(0, payment.total_amount - (payment.paid_amount || 0));
    setPayAmount(due.toFixed(2));
    setPayMethod('gcash');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes('');
    setShowPayModal(true);
  };

  const confirmPay = async (e) => {
    e.preventDefault();
    if (!payingSettlement) return;
    setSubmittingPay(true);
    try {
      await teacherPaymentOps.markPaid(payingSettlement.id, {
        amount: payAmount ? parseFloat(payAmount) : undefined,
        payment_method: payMethod,
        paid_at: payDate,
        notes: payNotes
      });
      setShowPayModal(false);
      loadAllData();
    } catch (err) {
      alert('支付结算失败: ' + err.message);
    }
    setSubmittingPay(false);
  };

  // ── 结算单取消与删除 ──
  const handleCancelSettlement = async (id) => {
    if (!confirm('确认取消此结算单？取消后将自动释放/反冲所有已核销的付款单额度。')) return;
    try {
      await teacherPaymentOps.cancel(id);
      loadAllData();
    } catch (err) {
      alert('取消失败: ' + err.message);
    }
  };

  const handleDeleteSettlement = async (id) => {
    if (!confirm('确定要彻底删除此结算记录吗？')) return;
    try {
      await teacherPaymentOps.delete(id);
      loadAllData();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  // ── 查看明细 ──
  const handleViewDetail = async (id) => {
    setDetailLoading(true);
    setShowDetailModal(true);
    try {
      const res = await teacherPaymentOps.getDetails(id);
      setDetailData(res);
    } catch (err) {
      alert('加载明细失败: ' + err.message);
      setShowDetailModal(false);
    }
    setDetailLoading(false);
  };

  // ── 教师时薪设置 ──
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
      loadBoardSummary();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  };

  // ── 结算单过滤与分页 (20条) ──
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (filterTeacher && p.teacher_id !== parseInt(filterTeacher)) return false;
      if (filterMonth && !p.period_start?.startsWith(filterMonth)) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    });
  }, [payments, filterTeacher, filterMonth, filterStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterTeacher, filterMonth, filterStatus]);

  const pageSize = 20;
  const settlementTotalPages = Math.ceil(filteredPayments.length / pageSize) || 1;
  const curPage = Math.min(Math.max(1, currentPage), settlementTotalPages);
  const settlementStartIdx = (curPage - 1) * pageSize;
  const settlementEndIdx = Math.min(settlementStartIdx + pageSize, filteredPayments.length);
  const paginatedPayments = filteredPayments.slice(settlementStartIdx, settlementEndIdx);

  // ── 付款单过滤与分页 (20条) ──
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      if (voucherFilterTeacher && v.teacher_id !== parseInt(voucherFilterTeacher)) return false;
      if (voucherFilterMonth && !v.paid_at?.startsWith(voucherFilterMonth)) return false;
      if (voucherFilterType && v.voucher_type !== voucherFilterType) return false;
      if (voucherFilterStatus && v.status !== voucherFilterStatus) return false;
      return true;
    });
  }, [vouchers, voucherFilterTeacher, voucherFilterMonth, voucherFilterType, voucherFilterStatus]);

  useEffect(() => {
    setVoucherPage(1);
  }, [voucherFilterTeacher, voucherFilterMonth, voucherFilterType, voucherFilterStatus]);

  const voucherTotalPages = Math.ceil(filteredVouchers.length / pageSize) || 1;
  const curVoucherPage = Math.min(Math.max(1, voucherPage), voucherTotalPages);
  const voucherStartIdx = (curVoucherPage - 1) * pageSize;
  const voucherEndIdx = Math.min(voucherStartIdx + pageSize, filteredVouchers.length);
  const paginatedVouchers = filteredVouchers.slice(voucherStartIdx, voucherEndIdx);

  // 全局汇总统计指标
  const globalStats = boardData.global_stats || {
    total_pending_amount: 0,
    total_advance_balance: 0,
    total_paid_this_month: 0,
    active_teachers_count: teachers.filter(t => t.status === 'active').length,
    total_teachers_count: teachers.length
  };

  const activeTeachers = teachers.filter(t => t.status === 'active');

  return (
    <div className="p-4 sm:p-6 relative min-h-screen space-y-6 max-w-7xl mx-auto">
      {/* ── 顶部标题与快捷操作 ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-primary-600 bg-primary-50 rounded-lg p-1" />
            教师薪资与付款管理
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            结算单（算薪依据）与付款单（出账凭证）双轨协同，支持随时预付与自动对冲核销
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="ghost" size="sm" onClick={loadAllData} className="text-gray-500 hover:text-gray-900">
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
          <Button 
            variant="outline" 
            onClick={() => openCreateVoucherModal('', 'advance')}
            className="border-primary-200 text-primary-700 bg-primary-50/50 hover:bg-primary-100"
          >
            <Wallet className="w-4 h-4 mr-1.5 text-primary-600" /> 录入付款 / 预付款
          </Button>
          <Button variant="primary" onClick={() => openCreateSettlementModal('')}>
            <Plus className="w-4 h-4 mr-1.5" /> 新建结算单
          </Button>
        </div>
      </div>

      {/* ── 📊 全局核心 KPI 指标卡片 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50/60 border-amber-200/80 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">待付结算总额</p>
              <p className="text-2xl font-black text-gray-900">
                <span className="text-base font-bold text-amber-700 mr-0.5">₱</span>
                {(globalStats.total_pending_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">已有课酬结算待支付</p>
            </div>
            <div className="w-11 h-11 bg-white/80 rounded-xl flex items-center justify-center shadow-sm text-amber-600 border border-amber-100">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-sky-50 to-blue-50/60 border-sky-200/80 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-sky-800 uppercase tracking-wider mb-1">待抵扣预付款总额</p>
              <p className="text-2xl font-black text-gray-900">
                <span className="text-base font-bold text-sky-700 mr-0.5">₱</span>
                {(globalStats.total_advance_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-sky-700 mt-0.5">已预借待在结算中扣减</p>
            </div>
            <div className="w-11 h-11 bg-white/80 rounded-xl flex items-center justify-center shadow-sm text-sky-600 border border-sky-100">
              <Wallet className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50/60 border-emerald-200/80 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-1">本月实付出账</p>
              <p className="text-2xl font-black text-gray-900">
                <span className="text-base font-bold text-emerald-700 mr-0.5">₱</span>
                {(globalStats.total_paid_this_month || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-emerald-700 mt-0.5">本月付款凭证汇总</p>
            </div>
            <div className="w-11 h-11 bg-white/80 rounded-xl flex items-center justify-center shadow-sm text-emerald-600 border border-emerald-100">
              <CheckCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-indigo-50/60 border-purple-200/80 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-purple-800 uppercase tracking-wider mb-1">教师覆盖概况</p>
              <p className="text-2xl font-black text-gray-900">
                {globalStats.active_teachers_count || activeTeachers.length}
                <span className="text-xs font-normal text-gray-500 ml-1">在职 / 共{globalStats.total_teachers_count || teachers.length}名</span>
              </p>
              <p className="text-[11px] text-purple-700 mt-0.5">全员账目实时跟踪</p>
            </div>
            <div className="w-11 h-11 bg-white/80 rounded-xl flex items-center justify-center shadow-sm text-purple-600 border border-purple-100">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 视图切换导航 Tab ── */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('board')}
            className={`py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'board'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            📌 教师付款看板
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'settlements'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Receipt className="w-4 h-4" />
            🧾 结算单列表 ({payments.length})
          </button>
          <button
            onClick={() => setActiveTab('vouchers')}
            className={`py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'vouchers'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Coins className="w-4 h-4" />
            💸 付款单流水 ({vouchers.length})
          </button>
        </nav>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          VIEW 1: 教师付款看板 (Kanban Board)
         ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'board' && (
        <div className="space-y-6 animate-in fade-in">
          {boardLoading ? (
            <div className="py-20 text-center text-gray-400">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-sm">正在汇总各教师收支流水与看板指标...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {(boardData.teachers || []).map(t => (
                <Card 
                  key={t.id} 
                  className={`border shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                    t.pending_settlements_amount > 0 ? 'border-amber-200 bg-white' : 'border-gray-200 bg-white'
                  }`}
                >
                  <CardContent className="p-5 space-y-4">
                    {/* 卡片头部：教师基本信息与基准时薪 */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900">{t.name}</h3>
                          <Badge variant={t.status === 'active' ? 'success' : 'default'} className="text-[10px] px-1.5 py-0.5">
                            {t.status === 'active' ? '在职' : '离职'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span>50m: <span className="font-semibold text-gray-700">₱{t.hourly_rate || 0}</span></span>
                          <span className="text-gray-300">|</span>
                          <span>25m: <span className="font-semibold text-gray-700">₱{t.hourly_rate_25 || 80}</span></span>
                          <button 
                            onClick={() => handleEditRate(t)} 
                            className="text-primary-600 hover:text-primary-800 ml-1 p-0.5" 
                            title="修改时薪基准"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 3格核心财务指标 */}
                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                      {/* 待付结算 */}
                      <div className={`p-2.5 rounded-xl border ${
                        t.pending_settlements_amount > 0 
                          ? 'bg-amber-50/80 border-amber-200 text-amber-900' 
                          : 'bg-gray-50/70 border-gray-100 text-gray-500'
                      }`}>
                        <div className="text-[11px] font-medium opacity-80">待付结算</div>
                        <div className={`text-base font-black mt-0.5 ${t.pending_settlements_amount > 0 ? 'text-amber-700' : 'text-gray-700'}`}>
                          ₱{t.pending_settlements_amount.toFixed(0)}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{t.pending_settlements_count} 笔待付</div>
                      </div>

                      {/* 待抵扣预付款 */}
                      <div className={`p-2.5 rounded-xl border ${
                        t.advance_balance > 0 
                          ? 'bg-sky-50/80 border-sky-200 text-sky-900' 
                          : 'bg-gray-50/70 border-gray-100 text-gray-500'
                      }`}>
                        <div className="text-[11px] font-medium opacity-80">待抵扣预付</div>
                        <div className={`text-base font-black mt-0.5 ${t.advance_balance > 0 ? 'text-sky-700' : 'text-gray-700'}`}>
                          ₱{t.advance_balance.toFixed(0)}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{t.advance_count} 笔可用</div>
                      </div>

                      {/* 本月已打款 */}
                      <div className="p-2.5 rounded-xl border bg-emerald-50/70 border-emerald-100 text-emerald-900">
                        <div className="text-[11px] font-medium opacity-80">本月实付</div>
                        <div className="text-base font-black text-emerald-700 mt-0.5">
                          ₱{t.paid_this_month.toFixed(0)}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">累计 ₱{t.total_paid.toFixed(0)}</div>
                      </div>
                    </div>

                    {/* 状态提要 & 课时进度 */}
                    <div className="bg-gray-50/80 rounded-xl p-3 text-xs space-y-1.5 border border-gray-100">
                      <div className="flex items-center justify-between text-gray-600">
                        <span>未结算新完课：</span>
                        <span className={`font-semibold ${t.unsettled_classes_count > 0 ? 'text-primary-700' : 'text-gray-500'}`}>
                          {t.unsettled_classes_count > 0 ? `${t.unsettled_classes_count} 节 (${t.unsettled_classes_hours} 小时)` : '已全部结算'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-gray-500 text-[11px]">
                        <span>最近结算周期：</span>
                        <span>
                          {t.latest_settlement 
                            ? `${t.latest_settlement.period_start} ~ ${t.latest_settlement.period_end}` 
                            : '暂无历史结算'}
                        </span>
                      </div>
                      {t.advance_balance > 0 && t.pending_settlements_amount > 0 && (
                        <div className="text-[11px] text-amber-700 font-medium flex items-center gap-1 pt-0.5">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          存在可用预付款，新建结算单时将自动优先抵扣。
                        </div>
                      )}
                    </div>

                    {/* 底部操作快捷按钮 */}
                    <div className="pt-2 flex items-center gap-2 border-t border-gray-100">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 text-xs border-sky-200 text-sky-700 hover:bg-sky-50"
                        onClick={() => openCreateVoucherModal(t.id, 'advance')}
                      >
                        <Wallet className="w-3.5 h-3.5 mr-1" /> 预付薪资
                      </Button>
                      <Button 
                        variant="primary" 
                        size="sm" 
                        className="flex-1 text-xs"
                        onClick={() => openCreateSettlementModal(t.id)}
                      >
                        <Receipt className="w-3.5 h-3.5 mr-1" /> 新建结算
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs text-gray-500 hover:text-gray-800 px-2"
                        title="查看往来结算明细"
                        onClick={() => {
                          setFilterTeacher(String(t.id));
                          setActiveTab('settlements');
                        }}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {boardData.teachers?.length === 0 && (
                <div className="col-span-full py-16 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
                  <User className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>暂无教师数据</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          VIEW 2: 结算单列表 (Settlement Statements)
         ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'settlements' && (
        <div className="space-y-4 animate-in fade-in">
          {/* 筛选栏 */}
          <Card className="shadow-sm">
            <CardContent className="p-3.5 flex items-center gap-3 flex-wrap text-sm">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterTeacher}
                onChange={(e) => setFilterTeacher(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
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
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              >
                <option value="">全部状态</option>
                <option value="pending">待支付 (pending)</option>
                <option value="partial">部分付款 (partial)</option>
                <option value="paid">已结清 (paid)</option>
                <option value="cancelled">已取消 (cancelled)</option>
              </select>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setFilterTeacher(''); setFilterMonth(''); setFilterStatus(''); }}
                className="text-gray-500 text-xs"
              >
                清除筛选
              </Button>
            </CardContent>
          </Card>

          {/* 结算记录卡片列表 */}
          <div className="space-y-3">
            {paymentsLoading ? (
              <div className="py-16 text-center text-gray-400">
                <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm">加载结算记录中...</p>
              </div>
            ) : filteredPayments.length === 0 ? (
              <Card className="border-dashed shadow-none bg-gray-50/50">
                <CardContent className="p-12 text-center text-gray-400">
                  <Receipt className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>暂无符合条件的结算记录</p>
                </CardContent>
              </Card>
            ) : (
              paginatedPayments.map(payment => {
                const statusMeta = SETTLEMENT_STATUS_MAP[payment.status] || SETTLEMENT_STATUS_MAP.cancelled;
                const paidAmt = payment.paid_amount || 0;
                const balDue = payment.balance_due !== undefined ? payment.balance_due : Math.max(0, payment.total_amount - paidAmt);

                return (
                  <Card key={payment.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* 左侧：基本信息与周期 */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-bold text-gray-900 text-base sm:text-lg">{payment.teacher_name}</h3>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${statusMeta.color}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 bg-gray-50 w-fit px-2.5 py-1 rounded-lg">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{payment.period_start} ~ {payment.period_end}</span>
                        </div>

                        <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-500">
                          <span>课时: <b className="text-gray-800">{payment.total_classes}</b> 节</span>
                          <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                          <span>工时: <b className="text-gray-800">{payment.total_hours}</b> 小时</span>
                          <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                          <span>基准时薪: ₱{payment.hourly_rate}</span>
                          {payment.notes && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                              <span className="text-gray-400 italic truncate max-w-[200px]">"{payment.notes}"</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 中间/右侧：金额与核销情况 */}
                      <div className="sm:text-right flex flex-col sm:items-end gap-2 border-t sm:border-t-0 sm:border-l border-gray-100 pt-3 sm:pt-0 sm:pl-5 min-w-[220px]">
                        <div>
                          <div className="text-xs text-gray-400">应结总额</div>
                          <div className="text-xl sm:text-2xl font-black text-gray-900">
                            <span className="text-sm font-semibold text-gray-400 mr-0.5">₱</span>
                            {payment.total_amount?.toFixed(2)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            已付: ₱{paidAmt.toFixed(2)}
                          </span>
                          {balDue > 0 && (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">
                              待付: ₱{balDue.toFixed(2)}
                            </span>
                          )}
                        </div>
                        
                        {/* 按钮群 */}
                        <div className="flex items-center gap-2 flex-wrap sm:justify-end pt-1">
                          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleViewDetail(payment.id)}>
                            明细
                          </Button>
                          {(payment.status === 'pending' || payment.status === 'partial') && (
                            <>
                              <Button 
                                variant="primary" 
                                size="sm" 
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" 
                                onClick={() => handleOpenPay(payment)}
                              >
                                支付结清
                              </Button>
                              <button 
                                onClick={() => handleCancelSettlement(payment.id)} 
                                className="text-gray-400 hover:text-danger-600 p-1.5 rounded hover:bg-gray-50" 
                                title="取消结算单 (释放核销)"
                              >
                                <Trash2 className="w-4 h-4"/>
                              </button>
                            </>
                          )}
                          {payment.status === 'cancelled' && (
                            <button 
                              onClick={() => handleDeleteSettlement(payment.id)} 
                              className="text-gray-400 hover:text-danger-600 p-1.5 rounded hover:bg-gray-50" 
                              title="永久删除"
                            >
                              <Trash2 className="w-4 h-4"/>
                            </button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* 📄 分页控制 (每页20条) */}
          {settlementTotalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 bg-white rounded-xl border border-gray-200 shadow-sm mt-4">
              <div className="text-xs text-gray-500">
                显示第 <span className="font-semibold text-gray-700">{settlementStartIdx + 1}</span> - <span className="font-semibold text-gray-700">{settlementEndIdx}</span> 条，共 <span className="font-semibold text-gray-700">{filteredPayments.length}</span> 条结算单（每页 20 条）
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={curPage <= 1}
                  className="h-8 px-2.5 text-xs text-gray-600 border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> 上一页
                </Button>
                <span className="px-2 text-xs font-semibold text-gray-600 min-w-[70px] text-center">
                  第 {curPage} / {settlementTotalPages} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(settlementTotalPages, p + 1))}
                  disabled={curPage >= settlementTotalPages}
                  className="h-8 px-2.5 text-xs text-gray-600 border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                >
                  下一页 <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          VIEW 3: 付款单流水 (Payment Vouchers)
         ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'vouchers' && (
        <div className="space-y-4 animate-in fade-in">
          {/* 筛选栏 */}
          <Card className="shadow-sm">
            <CardContent className="p-3.5 flex items-center gap-3 flex-wrap text-sm">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={voucherFilterTeacher}
                onChange={(e) => setVoucherFilterTeacher(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              >
                <option value="">全部教师</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <input
                type="month"
                value={voucherFilterMonth}
                onChange={(e) => setVoucherFilterMonth(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
              <select
                value={voucherFilterType}
                onChange={(e) => setVoucherFilterType(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              >
                <option value="">全部类型</option>
                <option value="advance">预付款 (advance)</option>
                <option value="settlement">结算付款 (settlement)</option>
              </select>
              <select
                value={voucherFilterStatus}
                onChange={(e) => setVoucherFilterStatus(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              >
                <option value="">全部状态</option>
                <option value="unallocated">待核销 (全额可用)</option>
                <option value="partially_allocated">部分核销</option>
                <option value="fully_allocated">完全核销</option>
                <option value="cancelled">已作废</option>
              </select>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setVoucherFilterTeacher(''); setVoucherFilterMonth(''); setVoucherFilterType(''); setVoucherFilterStatus(''); }}
                className="text-gray-500 text-xs"
              >
                清除筛选
              </Button>
            </CardContent>
          </Card>

          {/* 付款单列表 */}
          <div className="space-y-3">
            {vouchersLoading ? (
              <div className="py-16 text-center text-gray-400">
                <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm">加载付款单流水中...</p>
              </div>
            ) : filteredVouchers.length === 0 ? (
              <Card className="border-dashed shadow-none bg-gray-50/50">
                <CardContent className="p-12 text-center text-gray-400">
                  <Coins className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>暂无符合条件的付款单记录</p>
                </CardContent>
              </Card>
            ) : (
              paginatedVouchers.map(v => {
                const statusMeta = VOUCHER_STATUS_MAP[v.status] || VOUCHER_STATUS_MAP.cancelled;
                const isAdvance = v.voucher_type === 'advance';

                return (
                  <Card key={v.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* 左侧：凭证编号、类型、教师 */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono font-bold text-gray-800 text-sm bg-gray-100 px-2 py-0.5 rounded">
                            {v.voucher_no || `VCH-${v.id}`}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-md ${
                            isAdvance ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {isAdvance ? '预付款' : '结算付款'}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-md border ${statusMeta.color}`}>
                            {statusMeta.label}
                          </span>
                          <span className="font-bold text-gray-900 text-base ml-1">
                            {v.teacher_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            {v.paid_at?.split(' ')[0]}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                          <span>支付方式: <b className="text-gray-700">{PAYMENT_METHOD_MAP[v.payment_method] || v.payment_method}</b></span>
                          {v.transaction_ref && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                              <span>交易号: {v.transaction_ref}</span>
                            </>
                          )}
                          {v.notes && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                              <span className="text-gray-500 italic max-w-[200px] truncate">"{v.notes}"</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 右侧：金额与核销明细 */}
                      <div className="sm:text-right flex flex-col sm:items-end gap-2 border-t sm:border-t-0 sm:border-l border-gray-100 pt-3 sm:pt-0 sm:pl-5 min-w-[200px]">
                        <div>
                          <div className="text-xs text-gray-400">实付打款额</div>
                          <div className="text-xl sm:text-2xl font-black text-gray-900">
                            <span className="text-sm font-semibold text-gray-400 mr-0.5">₱</span>
                            {v.amount?.toFixed(2)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                            已核销: ₱{(v.allocated_amount || 0).toFixed(2)}
                          </span>
                          {v.unallocated_amount > 0 && (
                            <span className="text-sky-700 bg-sky-50 px-2 py-0.5 rounded font-semibold border border-sky-100">
                              待抵扣: ₱{v.unallocated_amount.toFixed(2)}
                            </span>
                          )}
                        </div>

                        {/* 撤销按钮（仅允许全额未核销的作废） */}
                        {v.allocated_amount === 0 && v.status === 'unallocated' && (
                          <div className="pt-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-xs text-danger-600 hover:bg-danger-50"
                              onClick={() => handleDeleteVoucher(v)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" /> 撤销作废
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* 📄 分页控制 (每页20条) */}
          {voucherTotalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 bg-white rounded-xl border border-gray-200 shadow-sm mt-4">
              <div className="text-xs text-gray-500">
                显示第 <span className="font-semibold text-gray-700">{voucherStartIdx + 1}</span> - <span className="font-semibold text-gray-700">{voucherEndIdx}</span> 条，共 <span className="font-semibold text-gray-700">{filteredVouchers.length}</span> 条付款单（每页 20 条）
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVoucherPage(p => Math.max(1, p - 1))}
                  disabled={curVoucherPage <= 1}
                  className="h-8 px-2.5 text-xs text-gray-600 border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> 上一页
                </Button>
                <span className="px-2 text-xs font-semibold text-gray-600 min-w-[70px] text-center">
                  第 {curVoucherPage} / {voucherTotalPages} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVoucherPage(p => Math.min(voucherTotalPages, p + 1))}
                  disabled={curVoucherPage >= voucherTotalPages}
                  className="h-8 px-2.5 text-xs text-gray-600 border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                >
                  下一页 <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          教师时薪基准折叠栏
         ════════════════════════════════════════════════════════════════ */}
      <Card className="mt-8 border-dashed shadow-none bg-transparent">
        <button
          onClick={() => setShowRateSection(!showRateSection)}
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <div className="flex items-center gap-2 font-bold text-gray-700">
            <Edit2 className="w-4 h-4 text-primary-600" /> 教师时薪基准统一配置
          </div>
          {showRateSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        
        {showRateSection && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {activeTeachers.map(teacher => (
                <div key={teacher.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:border-primary-300 transition-colors">
                  <div>
                    <div className="font-bold text-gray-800 text-sm mb-0.5">{teacher.name}</div>
                    <div className="text-xs text-primary-600 font-semibold">
                      50min: ₱{teacher.hourly_rate || 0}/节
                    </div>
                    <div className="text-xs text-amber-600 font-semibold">
                      25min: ₱{teacher.hourly_rate_25 || 80}/节
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleEditRate(teacher)} className="p-2 h-auto text-gray-400 hover:text-primary-600">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ════════════════════════════════════════════════════════════════
          MODAL 1: 新建薪资结算单
         ════════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <Card className="w-full max-w-md shadow-2xl border-0">
            <CardHeader className="border-b border-gray-100 pb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary-600" />
                新建薪资结算单
              </h2>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleCreateSettlement} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">选择教师</label>
                  <select
                    value={formData.teacher_id}
                    onChange={(e) => handleTeacherChangeInSettlement(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                    required
                  >
                    <option value="">请选择教师...</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* 预付款抵扣提示 */}
                {teacherAdvanceInfo.balance > 0 && (
                  <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 flex items-start gap-2">
                    <Wallet className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">该教师当前有 ₱{teacherAdvanceInfo.balance} 可用预付款</div>
                      <div className="text-sky-700 text-[11px] mt-0.5">
                        系统将在生成结算单时自动扣抵该额度，并抵扣待付总额。
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">开始日期</label>
                    <input
                      type="date"
                      value={formData.period_start}
                      onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">结束日期</label>
                    <input
                      type="date"
                      value={formData.period_end}
                      onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={quickFillLastWeek}
                  className="text-xs text-primary-600 hover:underline flex items-center gap-1 font-medium bg-primary-50 px-2.5 py-1.5 rounded-lg w-fit"
                >
                  <RefreshCw className="w-3 h-3" /> 自动填入上周周期
                </button>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">备注说明 (可选)</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="如：2026年11月第一周课酬"
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>取消</Button>
                  <Button type="submit" variant="primary" className="flex-1" disabled={creatingSettlement}>
                    {creatingSettlement ? '核算生成中...' : '生成结算单'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 2: 录入付款单 / 预付款凭证
         ════════════════════════════════════════════════════════════════ */}
      {showVoucherModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <Card className="w-full max-w-md shadow-2xl border-0">
            <CardHeader className="border-b border-gray-100 pb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-sky-600" />
                录入付款单凭证
              </h2>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleCreateVoucher} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">收款教师 *</label>
                  <select
                    value={voucherForm.teacher_id}
                    onChange={(e) => setVoucherForm({ ...voucherForm, teacher_id: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                    required
                  >
                    <option value="">请选择教师...</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">付款凭证类型</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center gap-2 p-3 border rounded-xl cursor-pointer text-sm font-medium transition-colors ${
                      voucherForm.voucher_type === 'advance' 
                        ? 'border-sky-500 bg-sky-50 text-sky-900' 
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}>
                      <input
                        type="radio"
                        name="voucher_type"
                        value="advance"
                        checked={voucherForm.voucher_type === 'advance'}
                        onChange={() => setVoucherForm({ ...voucherForm, voucher_type: 'advance', settlement_id: '' })}
                        className="text-sky-600"
                      />
                      <span>预付薪资 (Advance)</span>
                    </label>

                    <label className={`flex items-center gap-2 p-3 border rounded-xl cursor-pointer text-sm font-medium transition-colors ${
                      voucherForm.voucher_type === 'settlement' 
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900' 
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}>
                      <input
                        type="radio"
                        name="voucher_type"
                        value="settlement"
                        checked={voucherForm.voucher_type === 'settlement'}
                        onChange={() => setVoucherForm({ ...voucherForm, voucher_type: 'settlement' })}
                        className="text-emerald-600"
                      />
                      <span>结算付款 (Settlement)</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {voucherForm.voucher_type === 'advance' 
                      ? '💡 预付款可在该教师未来生成结算单时自动扣减抵充。' 
                      : '💡 直接针对现有结算单核销支付。'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">付款金额 (₱) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={voucherForm.amount}
                    onChange={(e) => setVoucherForm({ ...voucherForm, amount: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm font-bold"
                    placeholder="如：5000"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">支付方式</label>
                    <select
                      value={voucherForm.payment_method}
                      onChange={(e) => setVoucherForm({ ...voucherForm, payment_method: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                    >
                      <option value="gcash">GCash</option>
                      <option value="bank">银行转账</option>
                      <option value="cash">现金</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">支付日期</label>
                    <input
                      type="date"
                      value={voucherForm.paid_at}
                      onChange={(e) => setVoucherForm({ ...voucherForm, paid_at: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">交易凭证号 / 转账单号 (可选)</label>
                  <input
                    type="text"
                    value={voucherForm.transaction_ref}
                    onChange={(e) => setVoucherForm({ ...voucherForm, transaction_ref: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="如：GCash Ref 100984829"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">备注说明 (可选)</label>
                  <input
                    type="text"
                    value={voucherForm.notes}
                    onChange={(e) => setVoucherForm({ ...voucherForm, notes: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="如：11月中旬生活费预借"
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowVoucherModal(false)}>取消</Button>
                  <Button type="submit" variant="primary" className="flex-1 bg-sky-600 hover:bg-sky-700" disabled={submittingVoucher}>
                    {submittingVoucher ? '保存中...' : '确认录入付款'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 3: 结算单支付弹窗
         ════════════════════════════════════════════════════════════════ */}
      {showPayModal && payingSettlement && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <Card className="w-full max-w-sm shadow-2xl border-0">
            <div className="h-2 bg-emerald-500 rounded-t-xl"></div>
            <CardContent className="p-6">
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600">
                  <CreditCard className="w-7 h-7" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">支付结算单</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  为 {payingSettlement.teacher_name} ({payingSettlement.period_start} ~ {payingSettlement.period_end}) 登记付款
                </p>
              </div>

              <form onSubmit={confirmPay} className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">应付总额:</span>
                    <span className="font-bold">₱{payingSettlement.total_amount?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">已付金额:</span>
                    <span className="text-emerald-600 font-semibold">₱{(payingSettlement.paid_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
                    <span className="text-gray-700">待付余额:</span>
                    <span className="text-amber-700">
                      ₱{(payingSettlement.balance_due !== undefined ? payingSettlement.balance_due : (payingSettlement.total_amount - (payingSettlement.paid_amount || 0))).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">本次实付金额 (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm font-bold"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">支付方式</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                    >
                      <option value="gcash">GCash</option>
                      <option value="bank">银行转账</option>
                      <option value="cash">现金</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">支付日期</label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">备注说明 (可选)</label>
                  <input
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                    placeholder="如：GCash转账结清"
                  />
                </div>

                <div className="flex gap-3 pt-3 border-t border-gray-100">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPayModal(false)}>取消</Button>
                  <Button type="submit" variant="primary" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={submittingPay}>
                    {submittingPay ? '提交中...' : '确认已付款'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 4: 结算单明细 (含核销凭证与课时明细)
         ════════════════════════════════════════════════════════════════ */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border-0 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary-600" />
                结算单明细全貌
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowDetailModal(false)} className="w-8 h-8 p-0 rounded-full">
                <XCircle className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-gray-50/50">
              {detailLoading ? (
                <div className="flex flex-col items-center justify-center h-48">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                  <p className="mt-3 text-sm text-gray-500">获取明细数据中...</p>
                </div>
              ) : detailData ? (
                <>
                  {/* 顶栏周期与统计卡片 */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">结算周期</div>
                      <div className="font-bold text-gray-800 text-xs sm:text-sm">{detailData.payment?.period_start} ~ {detailData.payment?.period_end}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">50分钟课时</div>
                      <div className="font-bold text-gray-800">{detailData.payment?.count_50min} 节 × ₱{detailData.payment?.rate_50min}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">25分钟课时</div>
                      <div className="font-bold text-gray-800">{detailData.payment?.count_25min} 节 × ₱{detailData.payment?.rate_25min}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">应付总额</div>
                      <div className="font-black text-primary-600 text-lg">₱{detailData.payment?.total_amount}</div>
                    </div>
                  </div>

                  {/* 核销付款凭证列表 */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <h4 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-sky-600" />
                        已核销付款凭证 (Allocated Vouchers)
                      </h4>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        已付/已抵扣: ₱{(detailData.payment?.paid_amount || 0).toFixed(2)}
                      </span>
                    </div>

                    {(detailData.allocations && detailData.allocations.length > 0) ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-50 text-gray-500 font-medium">
                            <tr>
                              <th className="p-2">凭证编号</th>
                              <th className="p-2">凭证类型</th>
                              <th className="p-2">支付方式</th>
                              <th className="p-2">支付日期</th>
                              <th className="p-2 text-right">本次核销抵扣</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {detailData.allocations.map((a, i) => (
                              <tr key={i} className="hover:bg-gray-50/60">
                                <td className="p-2 font-mono font-bold text-gray-700">{a.voucher_no}</td>
                                <td className="p-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                    a.voucher_type === 'advance' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {a.voucher_type === 'advance' ? '预付款抵扣' : '结算打款'}
                                  </span>
                                </td>
                                <td className="p-2 text-gray-600">{PAYMENT_METHOD_MAP[a.payment_method] || a.payment_method}</td>
                                <td className="p-2 text-gray-500">{a.paid_at?.split(' ')[0]}</td>
                                <td className="p-2 text-right font-bold text-emerald-700">
                                  ₱{a.allocated_amount?.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-xs text-gray-400 bg-gray-50 rounded-lg">
                        暂未核销任何付款凭证（待支付）
                      </div>
                    )}
                  </div>

                  {/* 课时明细列表 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-3 bg-gray-50/80 border-b border-gray-200 font-bold text-sm text-gray-800 flex items-center justify-between">
                      <span>课时完成记录 (共 {detailData.details?.length || 0} 节)</span>
                    </div>
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-xs text-left whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0">
                          <tr>
                            <th className="px-3 py-2">序号</th>
                            <th className="px-3 py-2">上课时间</th>
                            <th className="px-3 py-2">学员</th>
                            <th className="px-3 py-2">时长</th>
                            <th className="px-3 py-2 text-right">课酬单价</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {(detailData.details || []).map((d, i) => (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 font-medium">
                                {d.date} <span className="text-gray-400 ml-1">{d.start_time}</span>
                              </td>
                              <td className="px-3 py-2">
                                {d.student_name}{d.student_english_name ? ` (${d.student_english_name})` : ''}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                  d.is_50min ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {d.is_50min ? '50min' : '25min'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                ₱{d.is_50min ? detailData.payment?.rate_50min : detailData.payment?.rate_25min}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-400 border border-dashed rounded-xl bg-gray-50">暂无明细数据</div>
              )}
            </div>
            <div className="shrink-0 p-4 border-t border-gray-100 bg-white flex justify-end rounded-b-xl">
              <Button variant="outline" size="sm" onClick={() => setShowDetailModal(false)}>关闭</Button>
            </div>
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 5: 教师课时单价基准弹窗
         ════════════════════════════════════════════════════════════════ */}
      {showRateModal && editingRateTeacher && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <Card className="w-full max-w-sm shadow-2xl border-0">
            <CardHeader className="border-b border-gray-100 pb-3">
              <h2 className="text-base font-bold text-gray-900">配置课时单价基准</h2>
            </CardHeader>
            <CardContent className="p-5">
              <div className="bg-primary-50 p-3 rounded-xl mb-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm text-primary-600">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-gray-900 text-sm">{editingRateTeacher.name}</div>
                  <div className="text-[11px] text-gray-500">ID: {editingRateTeacher.id}</div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">50分钟课程单价 (₱/节)</label>
                  <input
                    type="number" step="0.01"
                    value={rateValue} onChange={(e) => setRateValue(e.target.value)}
                    className="w-full px-3 py-2 font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">25分钟课程单价 (₱/节)</label>
                  <input
                    type="number" step="0.01"
                    value={rateValue25} onChange={(e) => setRateValue25(e.target.value)}
                    className="w-full px-3 py-2 font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-5">
                <Button variant="outline" className="flex-1" size="sm" onClick={() => setShowRateModal(false)}>取消</Button>
                <Button variant="primary" className="flex-1" size="sm" onClick={handleSaveRate}>保存配置</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
