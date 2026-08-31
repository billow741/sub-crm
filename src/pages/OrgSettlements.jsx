import { useState, useEffect } from 'react';
import { Receipt, Plus, CheckCircle, Trash2, Eye, FileText, Download, Search, Calculator, X } from 'lucide-react';
import { request, organizationOps } from '../store/api';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

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

  const getStatusVariant = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'paid': return 'success';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status) => {
    const labels = { pending: '待付款', paid: '已付款' };
    return labels[status] || status;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">机构结算</h1>
          <p className="text-sm text-gray-500 mt-1">管理与合作机构之间的财务结算对账</p>
        </div>
        <Button
          onClick={() => setShowGenModal(true)}
          className="shadow-sm"
        >
          <Plus className="w-5 h-5 mr-1" />
          生成结算单
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="p-5 flex items-center justify-between bg-gradient-to-br from-white to-warning-50/30 border-warning-100/50">
          <div>
            <p className="text-sm font-medium text-warning-600/80">待付款总额</p>
            <p className="text-3xl font-bold text-warning-600 mt-1">¥{totalPending.toLocaleString()}</p>
          </div>
          <div className="w-12 h-12 bg-warning-50 rounded-full flex items-center justify-center border border-warning-100">
            <Calculator className="w-6 h-6 text-warning-500" />
          </div>
        </Card>
        <Card className="p-5 flex items-center justify-between bg-gradient-to-br from-white to-success-50/30 border-success-100/50">
          <div>
            <p className="text-sm font-medium text-success-600/80">已付款总额</p>
            <p className="text-3xl font-bold text-success-600 mt-1">¥{totalPaid.toLocaleString()}</p>
          </div>
          <div className="w-12 h-12 bg-success-50 rounded-full flex items-center justify-center border border-success-100">
            <CheckCircle className="w-6 h-6 text-success-500" />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden mb-6">
        {/* 筛选 */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex gap-4">
          <div className="flex-1 max-w-xs flex items-center gap-3">
            <Search className="w-5 h-5 text-gray-400 ml-1" />
            <select
              value={filterOrg}
              onChange={(e) => setFilterOrg(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">全部机构</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="w-48">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">全部状态</option>
              <option value="pending">待付款</option>
              <option value="paid">已付款</option>
            </select>
          </div>
        </div>

        {/* 表格 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white border-b border-gray-100 text-gray-500 font-medium">
              <tr>
                <th className="px-5 py-3.5">机构</th>
                <th className="px-5 py-3.5">结算周期</th>
                <th className="px-5 py-3.5 text-center">课程数</th>
                <th className="px-5 py-3.5 text-center">课时</th>
                <th className="px-5 py-3.5 text-center">单价</th>
                <th className="px-5 py-3.5 text-right">金额</th>
                <th className="px-5 py-3.5 text-center">状态</th>
                <th className="px-5 py-3.5 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="8" className="text-center py-12 text-gray-400">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 mr-2"></div>
                    加载中...
                  </div>
                </td></tr>
              ) : settlements.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-16">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <FileText className="w-12 h-12 mb-3 text-gray-300" />
                      <p className="text-base font-medium text-gray-500">暂无结算单</p>
                      <p className="text-sm mt-1">点击右上角"生成结算单"开始结算</p>
                    </div>
                  </td>
                </tr>
              ) : settlements.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{s.org_name}</td>
                  <td className="px-5 py-3 text-gray-500">{s.period_start} ~ {s.period_end}</td>
                  <td className="px-5 py-3 text-center">{s.total_classes}</td>
                  <td className="px-5 py-3 text-center">{s.total_hours}</td>
                  <td className="px-5 py-3 text-center">¥{s.unit_price_cny}</td>
                  <td className="px-5 py-3 text-right font-bold text-primary-600">¥{s.amount_due_cny?.toLocaleString()}</td>
                  <td className="px-5 py-3 text-center">
                    <Badge variant={getStatusVariant(s.status)}>{getStatusLabel(s.status)}</Badge>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => loadDetail(s.id)} className="text-gray-500 hover:text-primary-600 p-1.5 h-auto">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {s.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setShowPayModal(s.id)} className="text-gray-500 hover:text-success-600 p-1.5 h-auto" title="确认收款">
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-gray-500 hover:text-danger-600 p-1.5 h-auto" title="删除">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 生成结算单 Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md shadow-2xl border-0 overflow-hidden flex flex-col max-h-[90vh]">
            <CardHeader className="flex items-center justify-between border-b border-gray-100 bg-white shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                <FileText className="w-5 h-5 text-primary-600" />
                生成结算单
              </h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowGenModal(false); setPreviewData(null); }} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择机构</label>
                <select
                  value={genForm.org_id}
                  onChange={(e) => setGenForm({ ...genForm, org_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">请选择机构...</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                  <input type="date" value={genForm.period_start} onChange={(e) => setGenForm({ ...genForm, period_start: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                  <input type="date" value={genForm.period_end} onChange={(e) => setGenForm({ ...genForm, period_end: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="pt-2">
                <Button variant="outline" className="w-full" onClick={handlePreview} disabled={!genForm.org_id || !genForm.period_start || !genForm.period_end}>
                  <Calculator className="w-4 h-4 mr-1.5" />
                  预览数据
                </Button>
              </div>
              {previewData && (
                <div className="bg-primary-50 rounded-lg p-4 border border-primary-100">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-primary-600/70 mb-1">包含课程</p>
                      <p className="text-lg font-bold text-primary-900">{previewData.total_classes} <span className="text-xs font-normal">节</span></p>
                    </div>
                    <div>
                      <p className="text-xs text-primary-600/70 mb-1">总计课时</p>
                      <p className="text-lg font-bold text-primary-900">{previewData.total_hours}</p>
                    </div>
                    <div>
                      <p className="text-xs text-primary-600/70 mb-1">应付金额</p>
                      <p className="text-lg font-bold text-primary-600">¥{previewData.amount_due_cny?.toLocaleString()}</p>
                    </div>
                  </div>
                  {previewData.total_classes === 0 && (
                    <p className="text-xs text-danger-500 mt-3 text-center">该周期内无符合条件的完课记录</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-gray-100 bg-gray-50 shrink-0">
              <Button variant="outline" onClick={() => { setShowGenModal(false); setPreviewData(null); }}>
                取消
              </Button>
              <Button onClick={handleGenerate} disabled={!previewData || previewData.total_classes === 0}>
                确认生成结算单
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 确认收款 Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-sm shadow-2xl border-0 overflow-hidden">
            <CardHeader className="flex items-center justify-between border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success-600" />
                确认机构付款
              </h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowPayModal(null); setPayRef(''); }} className="w-8 h-8 p-0 rounded-full">
                <X className="w-5 h-5 text-gray-400" />
              </Button>
            </CardHeader>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">付款凭证/流水号 (可选)</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="请输入银行流水号或备注"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-success-500"
                  autoFocus
                />
              </div>
              <div className="bg-success-50 text-success-800 text-xs p-3 rounded-lg border border-success-100">
                确认后该结算单状态将变更为<strong>已付款</strong>，此操作不可撤销。
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50 justify-end">
              <Button variant="outline" onClick={() => { setShowPayModal(null); setPayRef(''); }}>取消</Button>
              <Button variant="success" onClick={handlePay}>确认已收款</Button>
            </div>
          </Card>
        </div>
      )}

      {/* 结算明细 Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border-0 overflow-hidden">
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white p-5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900">结算单明细</h2>
                  <Badge variant={getStatusVariant(showDetailModal.status)} className="px-2 py-0.5">{getStatusLabel(showDetailModal.status)}</Badge>
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <span>单号: #{showDetailModal.id}</span>
                  <span className="text-gray-300">|</span>
                  <span>{showDetailModal.period_start} ~ {showDetailModal.period_end}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" size="sm"
                  onClick={handleExportCSV}
                  className="text-primary-600 border-primary-200 hover:bg-primary-50"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  导出 CSV
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowDetailModal(null)} className="w-8 h-8 p-0 rounded-full">
                  <X className="w-5 h-5 text-gray-400" />
                </Button>
              </div>
            </CardHeader>
            
            <div className="shrink-0 bg-gray-50 border-b border-gray-100 p-5">
              <div className="grid grid-cols-4 gap-6">
                <div>
                  <p className="text-gray-500 text-xs mb-1 font-medium">结算机构</p>
                  <p className="font-bold text-gray-900 text-lg">{showDetailModal.org_name}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1 font-medium">计费课时数</p>
                  <p className="font-bold text-gray-900 text-lg">{showDetailModal.total_hours}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1 font-medium">课时单价</p>
                  <p className="font-bold text-gray-900 text-lg">¥{showDetailModal.unit_price_cny}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1 font-medium">结算总金额</p>
                  <p className="font-bold text-primary-600 text-2xl">¥{showDetailModal.amount_due_cny?.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white p-5">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary-500" />
                包含的课程列表 ({showDetailModal.items?.length || 0})
              </h3>
              
              {showDetailModal.items && showDetailModal.items.length > 0 ? (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">上课时间</th>
                        <th className="px-4 py-3 font-medium">学生</th>
                        <th className="px-4 py-3 font-medium">教师</th>
                        <th className="px-4 py-3 font-medium text-center">计费课时</th>
                        <th className="px-4 py-3 font-medium text-right">小计金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {showDetailModal.items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-gray-800">{item.class_date}</td>
                          <td className="px-4 py-3 font-medium">{item.student_name}</td>
                          <td className="px-4 py-3 text-gray-600">{item.teacher_name}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{item.hours}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">¥{item.subtotal_cny}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400 border border-gray-100 border-dashed rounded-xl">
                  暂无课程明细数据
                </div>
              )}
            </div>
            
            {showDetailModal.status === 'pending' && (
              <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-end">
                <Button variant="success" onClick={() => {
                  setShowDetailModal(null);
                  setShowPayModal(showDetailModal.id);
                }}>
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  标记此单为已付款
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
