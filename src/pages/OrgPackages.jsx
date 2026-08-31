import { useState, useEffect } from 'react';
import { Package, Plus, CheckCircle, Eye, DollarSign, X } from 'lucide-react';
import { request, organizationOps } from '../store/api';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export default function OrgPackages() {
  const [packages, setPackages] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [filterOrg, setFilterOrg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(null);
  const [showAllocModal, setShowAllocModal] = useState(null);
  const [createForm, setCreateForm] = useState({ org_id: '', total_hours: '', unit_price_cny: '80', notes: '' });
  const [payForm, setPayForm] = useState({ paid_amount_cny: '', payment_ref: '' });

  useEffect(() => { loadOrgs(); }, []);
  useEffect(() => { loadPackages(); }, [filterOrg]);

  const loadOrgs = async () => {
    try {
      const data = await organizationOps.getAll();
      setOrgs(data || []);
    } catch (e) { console.error(e); }
  };

  const loadPackages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterOrg) params.set('org_id', filterOrg);
      const res = await request(`/org-packages?${params.toString()}`);
      setPackages(res.data?.data || []);
    } catch (e) {
      console.error('加载课时包失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await request('/org-packages', {
        method: 'POST',
        body: {
          org_id: parseInt(createForm.org_id),
          total_hours: parseFloat(createForm.total_hours),
          unit_price_cny: parseFloat(createForm.unit_price_cny),
          notes: createForm.notes,
        },
      });
      alert('✅ 课时包已创建');
      setShowCreateModal(false);
      setCreateForm({ org_id: '', total_hours: '', unit_price_cny: '80', notes: '' });
      loadPackages();
    } catch (e) {
      alert('创建失败: ' + e.message);
    }
  };

  const handlePay = async () => {
    try {
      await request(`/org-packages/${showPayModal}/pay`, {
        method: 'POST',
        body: {
          paid_amount_cny: parseFloat(payForm.paid_amount_cny),
          payment_ref: payForm.payment_ref,
        },
      });
      alert('✅ 收款已记录');
      setShowPayModal(null);
      setPayForm({ paid_amount_cny: '', payment_ref: '' });
      loadPackages();
    } catch (e) {
      alert('收款失败: ' + e.message);
    }
  };

  const loadAllocations = async (id) => {
    try {
      const res = await request(`/org-packages/${id}`);
      setShowAllocModal(res.data);
    } catch (e) {
      alert('加载失败: ' + e.message);
    }
  };

  const totalHours = packages.reduce((s, p) => s + (p.total_hours || 0), 0);
  const usedHours = packages.reduce((s, p) => s + (p.used_hours || 0), 0);
  const remainHours = totalHours - usedHours;

  const getStatusVariant = (status) => {
    switch(status) {
      case 'pending': return 'warning';
      case 'partial_paid': return 'primary';
      case 'paid': return 'success';
      default: return 'secondary';
    }
  };
  
  const getStatusLabel = (status) => {
    const labels = { pending: '待付款', partial_paid: '部分付款', paid: '已付清' };
    return labels[status] || status;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">机构课时包</h1>
          <p className="text-sm text-gray-500 mt-1">管理合作机构批量采购的预付课时</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="shadow-sm">
          <Plus className="w-5 h-5 mr-1" /> 新建课时包
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-5 flex items-center justify-between bg-gradient-to-br from-white to-gray-50/50">
          <div>
            <p className="text-sm font-medium text-gray-500">累计总课时</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{totalHours}</p>
          </div>
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <Package className="w-6 h-6 text-gray-500" />
          </div>
        </Card>
        <Card className="p-5 flex items-center justify-between bg-gradient-to-br from-white to-orange-50/30 border-orange-100/50">
          <div>
            <p className="text-sm font-medium text-orange-600/80">已消耗课时</p>
            <p className="text-3xl font-bold text-orange-600 mt-1">{usedHours}</p>
          </div>
          <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center border border-orange-100">
            <CheckCircle className="w-6 h-6 text-orange-400" />
          </div>
        </Card>
        <Card className="p-5 flex items-center justify-between bg-gradient-to-br from-white to-success-50/30 border-success-100/50">
          <div>
            <p className="text-sm font-medium text-success-600/80">剩余可用课时</p>
            <p className="text-3xl font-bold text-success-600 mt-1">{remainHours}</p>
          </div>
          <div className="w-12 h-12 bg-success-50 rounded-full flex items-center justify-center border border-success-100">
            <DollarSign className="w-6 h-6 text-success-500" />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        {/* 筛选区 */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="w-64">
            <select
              value={filterOrg}
              onChange={(e) => setFilterOrg(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">全部机构</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>

        {/* 表格 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white border-b border-gray-100 text-gray-500 font-medium">
              <tr>
                <th className="px-5 py-3.5">机构</th>
                <th className="px-5 py-3.5 text-center">总课时</th>
                <th className="px-5 py-3.5 text-center">已用</th>
                <th className="px-5 py-3.5 text-center">可用</th>
                <th className="px-5 py-3.5 text-center">单价</th>
                <th className="px-5 py-3.5 text-right">金额</th>
                <th className="px-5 py-3.5 text-right">已付</th>
                <th className="px-5 py-3.5 text-center">状态</th>
                <th className="px-5 py-3.5 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="9" className="text-center py-12 text-gray-400">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 mr-2"></div>
                    加载中...
                  </div>
                </td></tr>
              ) : packages.length === 0 ? (
                <tr><td colSpan="9" className="text-center py-12 text-gray-400">暂无课时包数据</td></tr>
              ) : packages.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.org_name}</td>
                  <td className="px-5 py-3 text-center">{p.total_hours}</td>
                  <td className="px-5 py-3 text-center font-medium text-orange-500">{p.used_hours}</td>
                  <td className="px-5 py-3 text-center font-bold text-success-600">{p.remaining_hours}</td>
                  <td className="px-5 py-3 text-center text-gray-500">¥{p.unit_price_cny}</td>
                  <td className="px-5 py-3 text-right font-medium">¥{p.amount_cny?.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-gray-500">¥{p.paid_amount_cny?.toLocaleString()}</td>
                  <td className="px-5 py-3 text-center">
                    <Badge variant={getStatusVariant(p.status)}>{getStatusLabel(p.status)}</Badge>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => loadAllocations(p.id)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="查看分配">
                        <Eye size={16} />
                      </button>
                      {p.status !== 'paid' && (
                        <button onClick={() => setShowPayModal(p.id)} className="p-1.5 text-gray-400 hover:text-success-600 hover:bg-success-50 rounded-lg transition-colors" title="标记收款">
                          <DollarSign size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 创建课时包 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md shadow-2xl border-0 overflow-hidden">
            <CardHeader className="flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-600" />
                新建课时包
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择合作机构</label>
                <select
                  value={createForm.org_id}
                  onChange={(e) => setCreateForm({ ...createForm, org_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">请选择机构...</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">总课时 (50min/节)</label>
                  <input type="number" value={createForm.total_hours}
                    onChange={(e) => setCreateForm({ ...createForm, total_hours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="如 50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">课时单价 (¥)</label>
                  <input type="number" value={createForm.unit_price_cny}
                    onChange={(e) => setCreateForm({ ...createForm, unit_price_cny: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="如 80" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注说明</label>
                <textarea value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" rows="2" />
              </div>
              
              {createForm.total_hours && createForm.unit_price_cny && (
                <div className="bg-primary-50 border border-primary-100 rounded-lg p-3 text-sm flex items-center justify-between">
                  <span className="text-primary-800">预计订单总额</span>
                  <span className="font-bold text-lg text-primary-700">¥{(parseFloat(createForm.total_hours || 0) * parseFloat(createForm.unit_price_cny || 0)).toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50 justify-end">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>取消</Button>
              <Button onClick={handleCreate} disabled={!createForm.org_id || !createForm.total_hours}>
                确认创建
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 标记收款 Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-sm shadow-2xl border-0 overflow-hidden">
            <CardHeader className="flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-success-600" />
                标记收款
              </h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowPayModal(null); setPayForm({ paid_amount_cny: '', payment_ref: '' }); }} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">本次收款金额 (¥)</label>
                <input type="number" value={payForm.paid_amount_cny}
                  onChange={(e) => setPayForm({ ...payForm, paid_amount_cny: e.target.value })}
                  placeholder="例如: 4000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-success-500" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">付款凭证/流水号 (可选)</label>
                <input type="text" value={payForm.payment_ref}
                  onChange={(e) => setPayForm({ ...payForm, payment_ref: e.target.value })}
                  placeholder="如银行流水单号"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-success-500" />
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50 justify-end">
              <Button variant="outline" onClick={() => { setShowPayModal(null); setPayForm({ paid_amount_cny: '', payment_ref: '' }); }}>取消</Button>
              <Button variant="success" onClick={handlePay} disabled={!payForm.paid_amount_cny}>确认收款</Button>
            </div>
          </Card>
        </div>
      )}

      {/* 分配明细 Modal */}
      {showAllocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border-0 overflow-hidden">
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-600" />
                课时包分配明细 <span className="text-gray-400 font-normal text-sm ml-1">#{showAllocModal.id}</span>
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAllocModal(null)} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            
            <div className="shrink-0 bg-gray-50 border-b border-gray-100 p-4">
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs mb-1">所属机构</p>
                  <p className="font-medium text-gray-900">{showAllocModal.org_name}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">总课时 / 已用</p>
                  <p className="font-medium text-gray-900">{showAllocModal.total_hours} / <span className="text-orange-600">{showAllocModal.used_hours}</span></p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">剩余可用</p>
                  <p className="font-bold text-success-600">{showAllocModal.remaining_hours}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">当前状态</p>
                  <Badge variant={getStatusVariant(showAllocModal.status)}>{getStatusLabel(showAllocModal.status)}</Badge>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-white border-b border-gray-100 sticky top-0 text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">扣费对象 (学生)</th>
                    <th className="px-5 py-3 font-medium text-center">课时变动</th>
                    <th className="px-5 py-3 font-medium">备注说明</th>
                    <th className="px-5 py-3 font-medium text-right">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(showAllocModal.allocations || []).map(a => (
                    <tr key={a.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-800">{a.student_name || `#${a.student_id}`}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${a.hours > 0 ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
                          {a.hours > 0 ? '+' : ''}{a.hours}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs truncate max-w-[200px]" title={a.notes}>{a.notes || '-'}</td>
                      <td className="px-5 py-3 text-right text-gray-400 text-xs">{a.created_at}</td>
                    </tr>
                  ))}
                  {(showAllocModal.allocations || []).length === 0 && (
                    <tr><td colSpan="4" className="text-center py-12 text-gray-400">暂无任何课时扣除或分配记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
