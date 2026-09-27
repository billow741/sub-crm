import { useState, useEffect, useCallback } from 'react';
import { Search, Phone, MessageSquare, ExternalLink, UserPlus, RefreshCw, Mail, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { leadOps } from '../store';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leadOps.getAll(100);
      setLeads(data || []);
    } catch (err) {
      console.error('获取线索失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 格式化为马尼拉时间 (GMT+8)
  const formatManilaTime = (dateStr) => {
    if (!dateStr) return '—';
    let isoStr = dateStr;
    if (!isoStr.endsWith('Z') && !isoStr.includes('+')) {
      isoStr = isoStr.replace(' ', 'T') + 'Z';
    }
    try {
      const date = new Date(isoStr);
      return date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Manila',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return dateStr;
    }
  };

  const handleConvertToStudent = (lead) => {
    // 自动带入参数跳转到学生添加页面
    navigate(`/students?action=add&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(lead.phone)}&notes=${encodeURIComponent(`来源: ${lead.source || '留资'} | 意向: ${lead.course || ''} | 备注: ${lead.message || ''}`)}`);
  };

  const handleDelete = async (lead) => {
    if (!window.confirm(`确定要删除客户【${lead.name}】的预约线索吗？此操作不可撤销。`)) {
      return;
    }
    try {
      await leadOps.delete(lead.id);
      setLeads(prev => prev.filter(l => l.id !== lead.id));
    } catch {
      alert('删除失败，请稍后重试');
    }
  };

  const handleClearTestLeads = async () => {
    if (!window.confirm('确定要清除所有测试线索吗？\n（将清除姓名或来源中带有“测试 / Test / 联调”的记录）')) {
      return;
    }
    try {
      await leadOps.clear();
      fetchLeads();
    } catch {
      alert('清除失败，请稍后重试');
    }
  };

  // 统计数据
  const totalCount = leads.length;
  const weappCount = leads.filter(l => (l.source || '').includes('小程序')).length;
  const webCount = leads.filter(l => (l.source || '').includes('官网') || (l.source || '').includes('website')).length;

  // 过滤
  const filteredLeads = leads.filter(lead => {
    const matchesSearch =
      (lead.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.phone || '').includes(searchTerm) ||
      (lead.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.course || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSource =
      sourceFilter === 'all' ||
      (sourceFilter === 'weapp' && (lead.source || '').includes('小程序')) ||
      (sourceFilter === 'web' && ((lead.source || '').includes('官网') || (lead.source || '').includes('website')));

    return matchesSearch && matchesSource;
  });

  return (
    <div className="space-y-6">
      {/* 顶部标题区 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">全渠道预约与咨询线索</h1>
          <p className="text-sm text-gray-500 mt-1">
            实时归集来自【微信小程序】与【官方网站】的客户留资申请，支持即时跟进与一键转正
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearTestLeads}
            disabled={loading}
            className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 hover:border-red-200"
            title="一键清除包含测试/Test字样的线索"
          >
            <Trash2 size={14} />
            清除测试数据
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLeads}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            刷新数据
          </Button>
        </div>
      </div>

      {/* 核心指标统计卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary-500">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-gray-500">全部预约线索</div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
              <Badge variant="outline" className="text-xs">全量沉淀</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-gray-500">微信小程序来源</div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-emerald-600">{weappCount}</div>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">小程序端</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-gray-500">官方网站来源</div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-blue-600">{webCount}</div>
              <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">官网端</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索与筛选工具栏 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索客户姓名、联系电话、微信或意向内容..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">所有渠道来源</option>
            <option value="weapp">微信小程序</option>
            <option value="web">官方网站</option>
          </select>
        </div>
      </div>

      {/* 线索列表展示 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              正在加载最新线索...
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              暂无匹配的预约申请记录
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                  <tr>
                    <th className="py-3.5 px-4">客户信息</th>
                    <th className="py-3.5 px-4">联系方式</th>
                    <th className="py-3.5 px-4">意向课程 / 交流</th>
                    <th className="py-3.5 px-4">渠道来源</th>
                    <th className="py-3.5 px-4">需求留言</th>
                    <th className="py-3.5 px-4" title="马尼拉时间 (GMT+8)">提交时间 (马尼拉)</th>
                    <th className="py-3.5 px-4 text-right">跟进操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLeads.map((lead) => {
                    const isWeapp = (lead.source || '').includes('小程序');
                    return (
                      <tr key={lead.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-900">{lead.name}</div>
                          {lead.age && (
                            <span className="text-xs text-gray-500">年龄: {lead.age}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <a
                              href={`tel:${lead.phone}`}
                              className="text-primary-600 font-medium hover:underline flex items-center gap-1"
                              title="点击直拨"
                            >
                              <Phone size={13} />
                              {lead.phone}
                            </a>
                            <button
                              onClick={() => handleCopy(lead.phone, `phone-${lead.id}`)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                              title="复制号码"
                            >
                              {copiedId === `phone-${lead.id}` ? '✓ 已复制' : '复制'}
                            </button>
                          </div>
                          {lead.email && (
                            <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <Mail size={12} />
                              {lead.email}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-gray-800 line-clamp-1 max-w-[200px]" title={lead.course}>
                            {lead.course || '未指定'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            className={
                              isWeapp
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }
                          >
                            {lead.source || '官网'}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 max-w-[240px]">
                          <div className="text-xs text-gray-600 line-clamp-2" title={lead.message}>
                            {lead.message || '—'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-gray-500 font-medium whitespace-nowrap">
                          {formatManilaTime(lead.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleConvertToStudent(lead)}
                              className="inline-flex items-center gap-1 text-xs"
                            >
                              <UserPlus size={13} />
                              转为学员
                            </Button>
                            <button
                              onClick={() => handleDelete(lead)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="删除此线索"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
