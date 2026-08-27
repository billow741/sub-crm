import { useState, useEffect } from 'react';
import { CreditCard, Plus, User, Calendar, Trash2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { studentOps, paymentOps } from '../store';
import OrgFilter from '../components/OrgFilter';
import { setSelectedOrg, organizationOps } from '../store/api';


export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrgState] = useState('');
  const [showModal, setShowModal] = useState(false);
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
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await paymentOps.add(formData.studentId, {
        amount: parseFloat(formData.amount) || 0,
        date: formData.date,
        payment_method: formData.method,  // 修正字段名
        description: formData.notes,
      hours: parseFloat(formData.packageHours) || 0
      });

      // addStudentHours removed: backend already updates total_hours in payments.js

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
      // 如果API返回了student_name，尝试找到对应学生补充英文名
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

  const methodColors = {
    wechat: 'bg-green-100 text-green-700',
    alipay: 'bg-blue-100 text-blue-700',
    bank: 'bg-purple-100 text-purple-700',
    cash: 'bg-orange-100 text-orange-700',
    other: 'bg-gray-100 text-gray-700',
  };

  const getMethodLabel = (payment) => {
    const method = payment.payment_method || payment.method || 'other';
    return methodLabels[method] || method || '未指定';
  };

  const getMethodColor = (payment) => {
    const method = payment.payment_method || payment.method || 'other';
    return methodColors[method] || methodColors.other;
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">收款记录</h1>
          <p className="text-gray-500 mt-1">共 {payments.length} 条记录</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          <Plus size={20} />
          添加收款
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="text-3xl font-bold text-green-600">¥{totalReceived.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">累计总收入</div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="text-3xl font-bold text-primary-600">¥{thisMonthTotal.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">本月收入</div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="text-3xl font-bold text-gray-800">{payments.length}</div>
          <div className="text-sm text-gray-500 mt-1">收款次数</div>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="搜索学生姓名..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <OrgFilter selectedOrg={selectedOrg} onChange={(orgId) => { setSelectedOrgState(orgId); setSelectedOrg(orgId); }} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-4 font-medium text-gray-500">日期</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">学生</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">所属机构</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">付款方式</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">课时数</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">备注</th>
              <th className="text-right px-6 py-4 font-medium text-gray-500">金额</th>
              <th className="text-right px-6 py-4 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length > 0 ? (
              filteredPayments.map((payment) => (
                <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar size={16} className="text-gray-400" />
                      {payment.date}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/students/${payment.studentId || payment.student_id}`} className="flex items-center gap-2 text-gray-800 hover:text-primary-600">
                      <User size={16} className="text-gray-400" />
                      {getStudentName(payment)}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {getOrgName(payment.organization_id)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getMethodColor(payment)}`}>
                      {getMethodLabel(payment)}
                    </span>
                  </td>
 <td className="px-6 py-4 text-center">
 {payment.hours > 0 ? (
 <span className="text-primary-600 font-medium">{payment.hours}节</span>
 ) : (
 <span className="text-gray-400">-</span>
 )}
 </td>
 <td className="px-6 py-4 text-gray-500 text-sm">
                    {payment.notes || payment.description || '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-lg font-semibold text-green-600">
                      +¥{payment.amount?.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(payment.id)}
                      className="p-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                  {searchTerm ? '未找到匹配的记录' : '暂无收款记录'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">添加收款</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">学生 *</label>
                <select
                  required
                  value={formData.studentId}
                  onChange={(e) => setFormData({ ...formData, studentId: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">选择学生</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">购买课程</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">课程类型</label>
                    <select
                      value={formData.lessonType}
                      onChange={(e) => {
                        const type = e.target.value;
                        const count = parseInt(formData.lessonCount) || 0;
                        const coeff = type === '25' ? 0.66 : 1.0;
                        setFormData({ ...formData, lessonType: type, packageHours: parseFloat((count * coeff).toFixed(2)) });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    >
                      <option value="50">50分钟/节</option>
                      <option value="25">25分钟/节</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">节数</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.lessonCount}
                      onChange={(e) => {
                        const count = parseInt(e.target.value) || 0;
                        const coeff = formData.lessonType === '25' ? 0.66 : 1.0;
                        setFormData({ ...formData, lessonCount: count, packageHours: parseFloat((count * coeff).toFixed(2)) });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="如：10、20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">课时数（自动）</label>
                    <input
                      type="text"
                      readOnly
                      value={formData.packageHours ? `${formData.packageHours} 课时` : '—'}
                      className="w-full px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700 font-medium"
                      placeholder="自动计算"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {formData.lessonType === '25'
                    ? `25分钟课 × ${formData.lessonCount || 0}节 × 0.66系数 = ${formData.packageHours || 0}课时`
                    : `50分钟课 × ${formData.lessonCount || 0}节 × 1.0 = ${formData.packageHours || 0}课时`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">金额 *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="¥"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款日期 *</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="wechat">微信支付</option>
                  <option value="alipay">支付宝</option>
                  <option value="bank">银行转账</option>
                  <option value="cash">现金</option>
                  <option value="other">其他</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="如：续费60节口语课"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
