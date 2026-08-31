import { useState, useEffect } from 'react';
import { CreditCard, Plus, User, Calendar, Trash2, Search, DollarSign, Receipt, Loader2, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { studentOps, paymentOps } from '../store';
import OrgFilter from '../components/OrgFilter';
import { setSelectedOrg, organizationOps } from '../store/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrgState] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState([]);
  const [formData, setFormData] = useState({
    studentId: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    method: 'wechat',
    notes: '',
    packageHours: 0,
    lessonType: '50',      // '50' = 50分钟, '25' = 25分钟
    lessonCount: '',       // 节数
  });

  useEffect(() => {
    loadPayments();
    if (orgs.length === 0) {
      organizationOps.getAll().then(data => setOrgs(data)).catch(() => {});
    }
  }, [selectedOrg]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const payParams = {};
      if (selectedOrg) payParams.org_id = selectedOrg;
      const [pays, studs] = await Promise.all([
        paymentOps.getAll(payParams),
        studentOps.getAll()
      ]);
      setPayments(Array.isArray(pays) ? pays : []);
      setStudents(Array.isArray(studs) ? studs : []);
    } catch (err) {
      console.error('Load error:', err);
      setPayments([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await paymentOps.add(formData.studentId, {
        amount: parseFloat(formData.amount) || 0,
        date: formData.date,
        payment_method: formData.method,
        description: formData.notes,
        hours: parseFloat(formData.packageHours) || 0
      });

      setShowModal(false);
      setFormData({
        studentId: '',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        method: 'wechat',
        notes: '',
        packageHours: 0,
        lessonType: '50',
        lessonCount: '',
      });
      loadPayments();
    } catch (err) {
      alert('保存失败：' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('确定要删除该付款记录吗？')) {
      await paymentOps.delete(id);
      loadPayments();
    }
  };

  const getStudentName = (payment) => {
    if (payment.student_name) {
      const student = students.find(s => s.id === payment.studentId || s.id === payment.student_id);
      if (student?.english_name) return `${payment.student_name} (${student.english_name})`;
      return payment.student_name;
    }
    const student = students.find(s => s.id === payment.studentId || s.id === payment.student_id);
    if (!student) return '未知学生';
    return student.english_name ? `${student.name} (${student.english_name})` : student.name;
  };

  const getOrgName = (orgId) => {
    if (!orgId) return '总部';
    const org = orgs.find(o => o.id === parseInt(orgId));
    return org ? org.name : '总部';
  };

  const methodLabels = {
    wechat: '微信支付',
    alipay: '支付宝',
    bank: '银行转账',
    cash: '现金',
    other: '其他',
  };

  const methodBadgeVariants = {
    wechat: 'success',
    alipay: 'primary',
    bank: 'purple',
    cash: 'warning',
    other: 'default',
  };

  const getMethodLabel = (payment) => {
    const method = payment.payment_method || payment.method || 'other';
    return methodLabels[method] || method || '未指定';
  };

  const getMethodVariant = (payment) => {
    const method = payment.payment_method || payment.method || 'other';
    return methodBadgeVariants[method] || 'default';
  };

  const filteredPayments = payments.filter(p => {
    const studentName = getStudentName(p).toLowerCase();
    return studentName.includes(searchTerm.toLowerCase());
  });

  const totalReceived = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthTotal = payments
    .filter(p => p.date?.startsWith(thisMonth))
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与操作栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">收款记录</h1>
          <p className="text-sm text-gray-500 mt-1">管理学员课时缴费明细与流水统计</p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          className="gap-2 self-start sm:self-auto shadow-sm"
        >
          <Plus className="w-4 h-4" />
          添加收款
        </Button>
      </div>

      {/* 收入数据卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">累计总收入</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">
            ¥{totalReceived.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">全机构历史总实收</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">本月收入</span>
            <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-primary-600 mt-2">
            ¥{thisMonthTotal.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">{new Date().getMonth() + 1} 月实时收款额</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">收款总笔数</span>
            <div className="w-9 h-9 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800 mt-2">
            {payments.length} <span className="text-sm font-normal text-gray-400">笔</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">已成功入账交易数</div>
        </Card>
      </div>

      {/* 搜索与筛选 */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索学员姓名或英文名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="shrink-0">
            <OrgFilter selectedOrg={selectedOrg} onChange={(orgId) => { setSelectedOrgState(orgId); setSelectedOrg(orgId); }} />
          </div>
        </div>
      </Card>

      {/* 列表表格 */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-50 rounded-lg"></div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-600">日期</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-600">学员</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-600 hidden sm:table-cell">所属机构</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-600">付款方式</th>
                  <th className="text-center px-6 py-3.5 text-xs font-semibold text-gray-600">充值课时</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-600 hidden md:table-cell">备注</th>
                  <th className="text-right px-6 py-3.5 text-xs font-semibold text-gray-600">金额</th>
                  <th className="text-right px-6 py-3.5 text-xs font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayments.length > 0 ? (
                  filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {payment.date}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <Link 
                          to={`/students/${payment.studentId || payment.student_id}`} 
                          className="flex items-center gap-1.5 font-medium text-gray-900 hover:text-primary-600 transition-colors"
                        >
                          <User className="w-4 h-4 text-gray-400" />
                          {getStudentName(payment)}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap hidden sm:table-cell">
                        <Badge variant="primary">
                          {getOrgName(payment.organization_id)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <Badge variant={getMethodVariant(payment)}>
                          {getMethodLabel(payment)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-center whitespace-nowrap">
                        {payment.hours > 0 ? (
                          <span className="font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full text-xs">
                            +{payment.hours} 节
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate hidden md:table-cell">
                        {payment.notes || payment.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className="text-base font-bold text-emerald-600">
                          +¥{payment.amount?.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleDelete(payment.id)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="删除记录"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Receipt className="w-8 h-8 text-gray-300" />
                        <span>{searchTerm ? '未找到匹配的记录' : '暂无收款记录'}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 添加收款弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-gray-800">添加收款</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                关闭
              </button>
            </div>

            <form id="payment-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">学员 *</label>
                <select
                  required
                  value={formData.studentId}
                  onChange={(e) => setFormData({ ...formData, studentId: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">选择学员</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name} {s.english_name ? `(${s.english_name})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">购买课时</label>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">单节时长</label>
                    <select
                      value={formData.lessonType}
                      onChange={(e) => {
                        const type = e.target.value;
                        const count = parseInt(formData.lessonCount) || 0;
                        const coeff = type === '25' ? 0.66 : 1.0;
                        setFormData({ ...formData, lessonType: type, packageHours: parseFloat((count * coeff).toFixed(2)) });
                      }}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs bg-white"
                    >
                      <option value="50">50分钟/节</option>
                      <option value="25">25分钟/节</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">节数</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.lessonCount}
                      onChange={(e) => {
                        const count = parseInt(e.target.value) || 0;
                        const coeff = formData.lessonType === '25' ? 0.66 : 1.0;
                        setFormData({ ...formData, lessonCount: count, packageHours: parseFloat((count * coeff).toFixed(2)) });
                      }}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                      placeholder="如：20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">折算课时</label>
                    <input
                      type="text"
                      readOnly
                      value={formData.packageHours ? `${formData.packageHours} 课时` : '—'}
                      className="w-full px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-semibold"
                      placeholder="自动计算"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {formData.lessonType === '25'
                    ? `25分钟课 × ${formData.lessonCount || 0}节 × 0.66系数 = ${formData.packageHours || 0}课时`
                    : `50分钟课 × ${formData.lessonCount || 0}节 × 1.0 = ${formData.packageHours || 0}课时`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">实收金额 *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¥</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                      className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款日期 *</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">支付渠道</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="wechat">微信支付</option>
                  <option value="alipay">支付宝</option>
                  <option value="bank">银行转账</option>
                  <option value="cash">现金</option>
                  <option value="other">其他</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注说明</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="如：续费60节口语强化课"
                />
              </div>
            </form>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 bg-white"
              >
                取消
              </Button>
              <Button
                type="submit"
                form="payment-form"
                className="flex-1"
              >
                确认收款
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
