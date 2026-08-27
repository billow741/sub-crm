import { useState, useEffect } from 'react';
import { Receipt, Plus, CheckCircle, Trash2, Eye, FileText, Download } from 'lucide-react';
import { request, organizationOps } from '../store/api';


export default function OrgSettlements() {
  const [settlements, setSettlements] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [filterOrg, setFilterOrg] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [genForm, setGenForm] = useState({ org_id: '', period_start: '', period_end: '' });
  const [previewData, setPreviewData] = useState(null);
  const [payRef, setPayRef] = useState('');

  useEffect(() => {
    loadOrgs();
  }, []);

  useEffect(() => {
    loadSettlements();
  }, [filterOrg, filterStatus]);

  const loadOrgs = async () => {
    try {
      const data = await organizationOps.getAll();
      setOrgs(data || []);
    } catch (e) { console.error(e); }
  };

  const loadSettlements = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterOrg) params.set('org_id', filterOrg);
      if (filterStatus) params.set('status', filterStatus);
      const res = await request(`/org-settlements?${params.toString()}`);
      setSettlements(res.data?.data || []);
    } catch (e) {
      console.error('加载结算单失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!genForm.org_id || !genForm.period_start || !genForm.period_end) return;
    try {
      const params = new URLSearchParams({
        org_id: genForm.org_id,
        period_start: genForm.period_start,
        period_end: genForm.period_end,
      });
      const res = await request(`/org-settlements/preview?${params.toString()}`);
      setPreviewData(res.data);
    } catch (e) {
      alert('预览失败: ' + e.message);
    }
  };

  const handleGenerate = async () => {
    try {
      await request('/org-settlements/generate', {
        method: 'POST',
        body: {
          org_id: parseInt(genForm.org_id),
          period_start: genForm.period_start,
          period_end: genForm.period_end,
        },
      });
      alert('✅ 结算单已生成');
      setShowGenModal(false);
      setPreviewData(null);
      setGenForm({ org_id: '', period_start: '', period_end: '' });
      loadSettlements();
    } catch (e) {
      alert('生成失败: ' + e.message);
    }
  };

  const handlePay = async () => {
    try {
      await request(`/org-settlements/${showPayModal}/pay`, {
        method: 'POST',
        body: { payment_ref: payRef },
      });
      alert('✅ 已确认收款');
      setShowPayModal(null);
      setPayRef('');
      loadSettlements();
    } catch (e) {
      alert('收款失败: ' + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确认删除此结算单？')) return;
    try {
      await request(`/org-settlements/${id}`, { method: 'DELETE' });
      alert('已删除');
      loadSettlements();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const loadDetail = async (id) => {
    try {
      const res = await request(`/org-settlements/${id}`);
      setShowDetailModal(res.data);
    } catch (e) {
      alert('加载详情失败: ' + e.message);
    }
  };

  const handleExportCSV = () => {
    if (!showDetailModal || !showDetailModal.items) return;
    
    // CSV Header
    const headers = ['机构名称', '结算周期', '学生姓名', '教师姓名', '上课日期', '课时', '课时单价(元)', '小计金额(元)'];
    
    // CSV Rows
    const rows = showDetailModal.items.map(item => [
      showDetailModal.org_name,
      `${showDetailModal.period_start} ~ ${showDetailModal.period_end}`,
      item.student_name || '-',
      item.teacher_name || '-',
      item.class_date,
      item.hours,
      item.unit_price_cny,
      item.subtotal_cny
    ]);
    
    // Combine and add BOM for Excel UTF-8 support
    const csvContent = '\uFEFF' + [headers, ...rows].map(e => e.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `结算单明细_${showDetailModal.org_name}_${showDetailModal.period_start}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPending = settlements.filter(s => s.status === 'pending').reduce((sum, s) => sum + (s.amount_due_cny || 0), 0);
  const totalPaid = settlements.filter(s => s.status === 'paid').reduce((sum, s) => sum + (s.amount_due_cny || 0), 0);

  const statusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-700',
      paid: 'bg-green-100 text-green-700',
    };
    const labels = { pending: '待付款', paid: '已付款' };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>{labels[status] || status}</span>;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Receipt className="text-primary-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-800">机构结算</h1>
        </div>
        <button
          onClick={() => setShowGenModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={18} />
          生成结算单
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-sm text-gray-500">待付款总额</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">¥{totalPending.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-sm text-gray-500">已付款总额</p>
          <p className="text-2xl font-bold text-green-600 mt-1">¥{totalPaid.toLocaleString()}</p>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterOrg}
          onChange={(e) => setFilterOrg(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400"
        >
          <option value="">全部机构</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400"
        >
          <option value="">全部状态</option>
          <option value="pending">待付款</option>
          <option value="paid">已付款</option>
        </select>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">机构</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">周期</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">课程数</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">课时</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">单价</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">金额</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">状态</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan="8" className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : settlements.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-8 text-gray-400">暂无结算单</td></tr>
            ) : settlements.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{s.org_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{s.period_start} ~ {s.period_end}</td>
                <td className="px-4 py-3 text-sm text-center">{s.total_classes}</td>
                <td className="px-4 py-3 text-sm text-center">{s.total_hours}</td>
                <td className="px-4 py-3 text-sm text-center">¥{s.unit_price_cny}</td>
                <td className="px-4 py-3 text-sm text-center font-medium">¥{s.amount_due_cny?.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">{statusBadge(s.status)}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => loadDetail(s.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="查看明细">
                      <Eye size={16} />
                    </button>
                    {s.status === 'pending' && (
                      <>
                        <button onClick={() => setShowPayModal(s.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="确认收款">
                          <CheckCircle size={16} />
                        </button>
                        <button onClick={() => handleDelete(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="删除">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 生成结算单 Modal */}
      {showGenModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={22} className="text-primary-600" />
              <h2 className="text-lg font-bold">生成结算单</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">选择机构</label>
                <select
                  value={genForm.org_id}
                  onChange={(e) => setGenForm({ ...genForm, org_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">请选择</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">开始日期</label>
                  <input type="date" value={genForm.period_start} onChange={(e) => setGenForm({ ...genForm, period_start: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">结束日期</label>
                  <input type="date" value={genForm.period_end} onChange={(e) => setGenForm({ ...genForm, period_end: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <button onClick={handlePreview} className="px-4 py-2 text-sm border border-primary-200 text-primary-600 rounded-lg hover:bg-primary-50">
                预览数据
              </button>
              {previewData && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-gray-500">课程数</p>
                      <p className="text-lg font-bold">{previewData.total_classes}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">课时数</p>
                      <p className="text-lg font-bold">{previewData.total_hours}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">应付金额</p>
                      <p className="text-lg font-bold text-primary-600">¥{previewData.amount_due_cny?.toLocaleString()}</p>
                    </div>
                  </div>
                  {previewData.total_classes === 0 && (
                    <p className="text-xs text-red-500 mt-2 text-center">该周期内无符合的已完课记录</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setShowGenModal(false); setPreviewData(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleGenerate} disabled={!previewData || previewData.total_classes === 0}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                确认生成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认收款 Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={22} className="text-green-600" />
              <h2 className="text-lg font-bold">确认收款</h2>
            </div>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="付款凭证号（可选）"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowPayModal(null); setPayRef(''); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handlePay}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                确认收款
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 明细 Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[700px] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">结算单明细 #{showDetailModal.id}</h2>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleExportCSV}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                >
                  <Download size={16} />
                  导出表格
                </button>
                <button onClick={() => setShowDetailModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4 text-sm">
              <div><span className="text-gray-500">机构:</span> {showDetailModal.org_name}</div>
              <div><span className="text-gray-500">周期:</span> {showDetailModal.period_start} ~ {showDetailModal.period_end}</div>
              <div><span className="text-gray-500">课时:</span> {showDetailModal.total_hours}</div>
              <div><span className="text-gray-500">金额:</span> ¥{showDetailModal.amount_due_cny?.toLocaleString()}</div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">学生</th>
                  <th className="px-3 py-2 text-left">教师</th>
                  <th className="px-3 py-2 text-center">日期</th>
                  <th className="px-3 py-2 text-center">课时</th>
                  <th className="px-3 py-2 text-center">小计</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(showDetailModal.items || []).map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{item.student_name}</td>
                    <td className="px-3 py-2">{item.teacher_name}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{item.class_date}</td>
                    <td className="px-3 py-2 text-center">{item.hours}</td>
                    <td className="px-3 py-2 text-center">¥{item.subtotal_cny}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
