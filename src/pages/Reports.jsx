import { useState, useEffect, useCallback } from 'react';
import { 
  BarChart2, 
  Calendar, 
  Building2, 
  AlertTriangle, 
  BookOpen, 
  Award, 
  Users, 
  Clock, 
  TrendingUp, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  CheckCircle2, 
  Info,
  DollarSign,
  GraduationCap
} from 'lucide-react';
import { reportOps, organizationOps, getUserRole } from '../store';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

// 格式化日期为 YYYY-MM-DD
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 获取常用时间范围
function getDateRangePresets() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // 本月
  const thisMonthStart = new Date(year, month, 1);
  const thisMonthEnd = new Date(year, month + 1, 0);

  // 上月
  const lastMonthStart = new Date(year, month - 1, 1);
  const lastMonthEnd = new Date(year, month, 0);

  // 近3月
  const threeMonthsAgoStart = new Date(year, month - 2, 1);

  return {
    this_month: {
      label: '本月',
      from: formatDate(thisMonthStart),
      to: formatDate(thisMonthEnd)
    },
    last_month: {
      label: '上月',
      from: formatDate(lastMonthStart),
      to: formatDate(lastMonthEnd)
    },
    last_3_months: {
      label: '近3月',
      from: formatDate(threeMonthsAgoStart),
      to: formatDate(thisMonthEnd)
    }
  };
}

export default function Reports() {
  const userRole = getUserRole() || 'super_admin';
  const isSuperAdmin = userRole === 'super_admin';

  // 顶部筛选状态
  const presets = getDateRangePresets();
  const [activeTab, setActiveTab] = useState('learning'); // overview | learning | financial | teaching
  const [rangePreset, setRangePreset] = useState('this_month');
  const [fromDate, setFromDate] = useState(presets.this_month.from);
  const [toDate, setToDate] = useState(presets.this_month.to);
  const [selectedOrgId, setSelectedOrgId] = useState('all');
  const [organizations, setOrganizations] = useState([]);

  // 学习分析数据状态
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  // 流失预警列表状态
  const [riskData, setRiskData] = useState({ students: [], pagination: {}, summary: {} });
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskError, setRiskError] = useState(null);
  const [riskPage, setRiskPage] = useState(1);
  const [riskLevelFilter, setRiskLevelFilter] = useState('all'); // all | high | medium
  const [riskSearchInput, setRiskSearchInput] = useState('');
  const [riskSearchQuery, setRiskSearchQuery] = useState('');

  // 加载机构列表 (仅超管可见)
  useEffect(() => {
    if (isSuperAdmin) {
      organizationOps.getAll()
        .then(orgs => setOrganizations(orgs || []))
        .catch(err => console.warn('加载机构列表失败:', err));
    }
  }, [isSuperAdmin]);

  // 处理预设时间切换
  const handlePresetChange = (presetKey) => {
    setRangePreset(presetKey);
    if (presetKey !== 'custom' && presets[presetKey]) {
      setFromDate(presets[presetKey].from);
      setToDate(presets[presetKey].to);
    }
  };

  // 加载学习分析总览
  const fetchSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      setSummaryError(null);
      const params = {
        from_date: fromDate,
        to_date: toDate
      };
      if (isSuperAdmin && selectedOrgId !== 'all') {
        params.org_id = selectedOrgId;
      }
      const data = await reportOps.getLearningSummary(params);
      setSummary(data);
    } catch (err) {
      console.error('加载学习总览失败:', err);
      setSummaryError(err.message || '加载学习报表失败');
    } finally {
      setSummaryLoading(false);
    }
  }, [fromDate, toDate, selectedOrgId, isSuperAdmin]);

  // 加载流失预警名单
  const fetchRiskStudents = useCallback(async () => {
    try {
      setRiskLoading(true);
      setRiskError(null);
      const params = {
        page: riskPage,
        page_size: 10,
        risk_level: riskLevelFilter
      };
      if (riskSearchQuery) {
        params.search = riskSearchQuery;
      }
      if (isSuperAdmin && selectedOrgId !== 'all') {
        params.org_id = selectedOrgId;
      }
      const data = await reportOps.getRiskStudents(params);
      setRiskData(data || { students: [], pagination: {}, summary: {} });
    } catch (err) {
      console.error('加载预警名单失败:', err);
      setRiskError(err.message || '加载预警名单失败');
    } finally {
      setRiskLoading(false);
    }
  }, [riskPage, riskLevelFilter, riskSearchQuery, selectedOrgId, isSuperAdmin]);

  // 当时间或机构切换时重新请求
  useEffect(() => {
    if (activeTab === 'learning') {
      fetchSummary();
      setRiskPage(1);
    }
  }, [fetchSummary, activeTab]);

  useEffect(() => {
    if (activeTab === 'learning') {
      fetchRiskStudents();
    }
  }, [fetchRiskStudents, activeTab]);

  // 搜索处理
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setRiskPage(1);
    setRiskSearchQuery(riskSearchInput.trim());
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* ─── 页面标题与口径说明入口 ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl shadow-sm">
              <BarChart2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">数据报表中心</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                基于真实 D1 消课与课时流水的数据运营指标核算系统
              </p>
            </div>
          </div>
        </div>

        {/* 身份角标 */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs text-gray-400">当前身份:</span>
          <Badge variant={isSuperAdmin ? 'primary' : 'warning'}>
            {isSuperAdmin ? '👑 总部超级管理员' : '🏢 合作机构管理员'}
          </Badge>
        </div>
      </div>

      {/* ─── 顶部通用控制栏骨架 ─── */}
      <Card className="border-gray-200 bg-white shadow-sm">
        <CardContent className="p-4 md:p-5 space-y-4">
          {/* Tab 导航 */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('learning')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'learning'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>学习分析</span>
                <span className="text-xs px-1.5 py-0.2 bg-white/20 rounded font-normal">已就绪</span>
              </button>

              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'overview'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>概览大盘</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">待开放</span>
              </button>

              <button
                onClick={() => setActiveTab('financial')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'financial'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>财务经营</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">待开放</span>
              </button>

              <button
                onClick={() => setActiveTab('teaching')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'teaching'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                <span>教学交付</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">待开放</span>
              </button>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
              <Info className="w-3.5 h-3.5" />
              <span>阶段 1 口径执行中</span>
            </div>
          </div>

          {/* 筛选参数控制条 */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            {/* 时间预设与起止选择 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500 mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> 时间范围:
              </span>
              {['this_month', 'last_month', 'last_3_months', 'custom'].map((key) => {
                const isSelected = rangePreset === key;
                const label = key === 'custom' ? '自定义' : presets[key].label;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePresetChange(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-primary-50 text-primary-700 border border-primary-200'
                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}

              {/* 日期选择输入框 */}
              <div className="flex items-center gap-1.5 ml-2 text-xs text-gray-600">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setRangePreset('custom');
                  }}
                  className="px-2 py-1 bg-white border border-gray-300 rounded text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                />
                <span>至</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setRangePreset('custom');
                  }}
                  className="px-2 py-1 bg-white border border-gray-300 rounded text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>

            {/* 机构切换器 (仅 super_admin 显示) */}
            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> 机构过滤:
                </span>
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 focus:ring-1 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="all">全部合作机构 (含总部)</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name || `机构 #${org.id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── 占位 Tab (概览 / 教学) ─── */}
      {(activeTab === 'overview' || activeTab === 'teaching') && (
        <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-16 h-16 bg-primary-50 text-primary-500 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <TrendingUp className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                {activeTab === 'overview' && '概览大盘（阶段 D 交付）'}
                {activeTab === 'teaching' && '教学交付报表（阶段 C 交付）'}
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
                按照数据报表中心规划执行卡，当前仅执行【阶段 A：学习分析】与【阶段 B：财务】。
                {activeTab === 'teaching' && '包含完课率/缺勤率、外教负荷排行、试听转化漏斗等模块即将展开。'}
                {activeTab === 'overview' && '概览大盘将汇总前三阶段数据。'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setActiveTab('financial')}>
              切换至财务报表
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── 阶段 B：财务经营报表核心内容 ─── */}
      {activeTab === 'financial' && (
        <div className="space-y-6">
          {/* 加载中与错误提示 */}
          {finLoading && (
            <div className="py-12 text-center text-gray-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary-500" />
              <p className="text-sm">正在核算财务经营数据...</p>
            </div>
          )}

          {finError && (
            <Card className="border-danger-200 bg-danger-50">
              <CardContent className="p-4 text-sm text-danger-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>{finError}</span>
                </div>
                <Button size="sm" variant="outline" onClick={fetchFinSummary}>重试</Button>
              </CardContent>
            </Card>
          )}

          {!finLoading && !finError && finSummary && (
            <>
              {/* 汇率告警与提示横幅 (仅超管) */}
              {isSuperAdmin && finSummary.teacher_cost?.fx_missing && (
                <div className="p-4 bg-warning-50 border border-warning-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-warning-800 text-sm">
                    <AlertTriangle className="w-5 h-5 text-warning-600 shrink-0" />
                    <div>
                      <span className="font-semibold">汇率未设置警告：</span>
                      <span>当前结算期（{finSummary.period?.target_month || toDate.slice(0, 7)}）及更早月份未录入 PHP→CNY 汇率，教师成本折算与经营毛利已置空显示。</span>
                    </div>
                  </div>
                  <Button size="sm" className="bg-warning-600 hover:bg-warning-700 text-white shrink-0" onClick={() => handleOpenFxModal()}>
                    立即维护汇率
                  </Button>
                </div>
              )}

              {isSuperAdmin && !finSummary.teacher_cost?.fx_missing && finSummary.teacher_cost?.rate_is_fallback && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5 text-blue-800 text-xs sm:text-sm">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>汇率回退提示：</strong> 当前月份（{finSummary.period?.target_month}）未录入独立汇率，已自动采用不晚于该月的最近汇率（{finSummary.teacher_cost?.rate_month} 月份，1 PHP = ¥{finSummary.teacher_cost?.rate}）。
                  </span>
                </div>
              )}

              {/* ──────── 超管全景视图 ──────── */}
              {isSuperAdmin && (
                <>
                  {/* 第一行：5 大财务核心 KPI */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {/* 卡片 1: 期间现金收款 */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">现金收款合计</span>
                          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <CreditCard className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          ¥{(finSummary.recharge?.cash_income || 0).toLocaleString()}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <div className="flex justify-between">
                            <span>有效付款笔数:</span>
                            <span className="font-medium text-gray-700">{finSummary.recharge?.cash_count || 0} 笔</span>
                          </div>
                          <div className="pt-1.5 border-t border-gray-100 text-purple-600 font-medium flex justify-between">
                            <span>赠送课时 (gift):</span>
                            <span>{finSummary.recharge?.gift?.hours || 0} 课时 ({finSummary.recharge?.gift?.count || 0} 笔)</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 卡片 2: 直营消课收入 (估算) */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">直营消课收入</span>
                            <Badge variant="warning" className="text-[10px] px-1 py-0">估算</Badge>
                          </div>
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Coins className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          ¥{(finSummary.consumption_revenue?.amount || 0).toLocaleString()}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <div className="flex justify-between">
                            <span>消课总课时:</span>
                            <span className="font-medium text-gray-700">{finSummary.consumption_revenue?.total_hours || 0} 课时</span>
                          </div>
                          <div className="pt-1.5 border-t border-gray-100 flex justify-between text-[11px]">
                            <span>计费 {finSummary.consumption_revenue?.priced_hours || 0}h</span>
                            <span className="text-warning-600">未定价 {finSummary.consumption_revenue?.unpriced_hours || 0}h</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 卡片 3: 教师课酬成本 (双币 D4) */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">教师课酬 (双币)</span>
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Receipt className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          ₱{(finSummary.teacher_cost?.amount_php || 0).toLocaleString()}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <div className="flex items-center justify-between font-medium">
                            <span>折算人民币:</span>
                            {finSummary.teacher_cost?.fx_missing ? (
                              <Badge variant="warning">汇率未设置</Badge>
                            ) : (
                              <span className="text-indigo-700 font-bold">
                                ≈ ¥{(finSummary.teacher_cost?.amount_cny || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="pt-1.5 border-t border-gray-100 flex justify-between text-[11px] text-gray-400">
                            <span>
                              {finSummary.teacher_cost?.rate ? `汇率 ${finSummary.teacher_cost.rate} (${finSummary.teacher_cost.rate_month}${finSummary.teacher_cost.rate_is_fallback ? '参考' : ''})` : '汇率未绑定'}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 卡片 4: 经营毛利 */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">全站经营毛利</span>
                          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <TrendingUp className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          {finSummary.gross_profit?.fx_missing || finSummary.gross_profit?.overall_gross_profit_cny === null ? (
                            <span className="text-warning-600 text-lg">汇率未设置</span>
                          ) : (
                            `¥${(finSummary.gross_profit?.overall_gross_profit_cny || 0).toLocaleString()}`
                          )}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              直营估算:
                              <Badge variant="neutral" className="text-[9px] px-1 py-0">估算</Badge>
                            </span>
                            <span className="font-medium text-gray-700">
                              {finSummary.gross_profit?.direct_gross_profit_cny !== null ? `¥${(finSummary.gross_profit?.direct_gross_profit_cny || 0).toLocaleString()}` : '—'}
                            </span>
                          </div>
                          <div className="pt-1.5 border-t border-gray-100 flex justify-between text-[11px] text-gray-400">
                            <span>机构应收: ¥{(finSummary.org_settlements?.amount_due_cny || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 卡片 5: 课时负债 (时点值) */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">直营课时负债</span>
                            <Badge variant="warning" className="text-[10px] px-1 py-0">估算</Badge>
                          </div>
                          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <Clock className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                          ¥{(finSummary.class_hours_liability?.direct_liability_cny || 0).toLocaleString()}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <div className="flex justify-between">
                            <span>直营计费剩余:</span>
                            <span className="font-medium text-gray-700">{finSummary.class_hours_liability?.direct_priced_remaining_hours || 0} 课时</span>
                          </div>
                          <div className="pt-1.5 border-t border-gray-100 flex justify-between text-[11px] text-amber-700">
                            <span>机构未清: ¥{(finSummary.class_hours_liability?.org_packages_unpaid_cny || 0).toLocaleString()}</span>
                            <span>({finSummary.class_hours_liability?.org_remaining_hours || 0}h)</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 第二行：细分板块（收款渠道构成 ＋ 课时调整/退款估算） */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 左侧：收款渠道构成 */}
                    <Card>
                      <CardHeader className="pb-3 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-primary-500" />
                            收款方式构成看板（期间）
                          </h3>
                          <span className="text-xs text-gray-400">不含 gift 赠送</span>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5 space-y-4">
                        {finSummary.recharge?.by_method?.length > 0 ? (
                          <div className="space-y-3">
                            {finSummary.recharge.by_method.map((item) => (
                              <div key={item.method} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="font-medium text-gray-700 capitalize">
                                    {item.method === 'wechat' && '微信支付 (WeChat)'}
                                    {item.method === 'alipay' && '支付宝 (Alipay)'}
                                    {item.method === 'bank' && '银行转账 (Bank)'}
                                    {item.method === 'cash' && '现金 (Cash)'}
                                    {item.method === 'other' && '其他方式 (Other)'}
                                    {!['wechat', 'alipay', 'bank', 'cash', 'other'].includes(item.method) && item.method}
                                  </span>
                                  <span className="text-gray-500">
                                    ¥{item.amount.toLocaleString()} ({item.count} 笔，{item.percentage}%)
                                  </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(100, Math.max(2, item.percentage))}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-xs text-gray-400">期间暂无现金收款记录</div>
                        )}

                        {/* Gift 赠送单列说明 (D3) */}
                        <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-lg text-xs text-purple-800 flex items-start gap-2.5">
                          <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold">赠送课时单列披露（D3 规范）：</div>
                            <p className="mt-0.5 text-purple-700">
                              期间共赠送 <strong>{finSummary.recharge?.gift?.hours || 0}</strong> 课时（{finSummary.recharge?.gift?.count || 0} 笔）。赠送课时金额不计入现金收入，课时计入总课时分母以公允摊薄学员混合单价。
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 右侧：课时调整与退款估算看板 (D5) ＋ 机构结算应收 */}
                    <Card>
                      <CardHeader className="pb-3 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                            <Clock className="w-4 h-4 text-warning-500" />
                            课时调整与退款核算（D5 发生期）
                          </h3>
                          <Badge variant="warning" className="text-[10px]">估算</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3.5 bg-red-50/70 border border-red-100 rounded-lg">
                            <div className="text-xs text-red-600 font-medium">负向课时调整 (退款估算)</div>
                            <div className="text-lg font-bold text-red-700 mt-1">
                              -{finSummary.hour_adjustments?.negative_hours || 0} 课时
                            </div>
                            <div className="text-xs text-red-600/80 mt-1">
                              估算金额: ¥{(finSummary.hour_adjustments?.negative_estimated_amount || 0).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              共 {finSummary.hour_adjustments?.negative_count || 0} 笔调减
                            </div>
                          </div>

                          <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-lg">
                            <div className="text-xs text-emerald-600 font-medium">正向课时调整 (手工/补偿)</div>
                            <div className="text-lg font-bold text-emerald-700 mt-1">
                              +{finSummary.hour_adjustments?.positive_hours || 0} 课时
                            </div>
                            <div className="text-xs text-emerald-600/80 mt-1">
                              共 {finSummary.hour_adjustments?.positive_count || 0} 笔调增
                            </div>
                          </div>
                        </div>

                        {/* 规范原文注脚 (D5) */}
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-600 space-y-1">
                          <div className="font-semibold text-gray-700">退款口径规范声明：</div>
                          <p className="italic text-gray-600">
                            &ldquo;{finSummary.hour_adjustments?.note}&rdquo;
                          </p>
                        </div>

                        {/* 机构应收小计 */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                          <span>期间机构结算单应收合计:</span>
                          <span className="font-bold text-gray-800">
                            ¥{(finSummary.org_settlements?.amount_due_cny || 0).toLocaleString()} ({finSummary.org_settlements?.count || 0} 张结算单)
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 第三行：财务月度趋势对比 (轻量原生绘制) */}
                  <Card>
                    <CardHeader className="pb-3 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-primary-500" />
                            财务月度经营趋势（充值、消课收入、教师成本、毛利）
                          </h3>
                          <p className="text-xs text-gray-400 mt-0.5">按业务发生月份归集四线指标序列，纯原生可视化</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block"></span>充值现金</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-500 rounded-sm inline-block"></span>消课收入估算</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-indigo-500 rounded-sm inline-block"></span>教师成本 CNY</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-amber-500 rounded-sm inline-block"></span>毛利 CNY</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5">
                      {finTrendLoading ? (
                        <div className="py-8 text-center text-xs text-gray-400">加载趋势数据中...</div>
                      ) : finTrend?.length > 0 ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                            {finTrend.map((t) => (
                              <div key={t.month} className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl space-y-2">
                                <div className="flex items-center justify-between font-semibold text-xs text-gray-800 border-b border-gray-200 pb-1.5">
                                  <span>{t.month}</span>
                                  {t.fx_missing ? (
                                    <Badge variant="warning" className="text-[9px] px-1 py-0">无汇率</Badge>
                                  ) : (
                                    <span className="text-[10px] text-gray-400">r: {t.rate}</span>
                                  )}
                                </div>
                                <div className="space-y-1 text-xs">
                                  <div className="flex justify-between text-emerald-700">
                                    <span>充值:</span>
                                    <span className="font-medium">¥{t.recharge_cny?.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between text-blue-700">
                                    <span>消课估算:</span>
                                    <span className="font-medium">¥{t.consumption_revenue_cny?.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between text-indigo-700">
                                    <span>教师成本:</span>
                                    <span className="font-medium">
                                      {t.fx_missing ? '未折算' : `¥${t.teacher_cost_cny?.toLocaleString()}`}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-amber-800 pt-1 border-t border-gray-200 font-bold">
                                    <span>毛利:</span>
                                    <span>
                                      {t.fx_missing ? '未核算' : `¥${t.gross_profit_cny?.toLocaleString()}`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-xs text-gray-400">所选时间范围内暂无趋势记录</div>
                      )}
                    </CardContent>
                  </Card>

                  {/* 第四行：参考汇率维护小节 (仅超管) */}
                  <Card>
                    <CardHeader className="pb-3 border-b border-gray-100 flex flex-row items-center justify-between">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                          <Coins className="w-4 h-4 text-primary-500" />
                          PHP→CNY 月度参考汇率维护（D4 汇率库）
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          供教师比索课酬折算人民币及毛利分析使用。每月锁定人工录入，若无记录则自动回退至上一记录月。
                        </p>
                      </div>
                      <Button size="sm" onClick={() => handleOpenFxModal()} className="flex items-center gap-1.5 text-xs py-1.5">
                        <Plus className="w-3.5 h-3.5" /> 录入汇率
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-50/80 text-gray-500 uppercase tracking-wider border-b border-gray-100">
                            <tr>
                              <th className="py-3 px-4">月份 (YYYY-MM)</th>
                              <th className="py-3 px-4">汇率乘数 (1 PHP = ? CNY)</th>
                              <th className="py-3 px-4">数据来源</th>
                              <th className="py-3 px-4">维护人</th>
                              <th className="py-3 px-4">最后更新时间</th>
                              <th className="py-3 px-4 text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-700">
                            {fxRates?.length > 0 ? (
                              fxRates.map((fx) => (
                                <tr key={fx.month} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="py-3 px-4 font-bold text-gray-900">{fx.month}</td>
                                  <td className="py-3 px-4 font-mono font-semibold text-primary-700">
                                    {fx.rate}
                                  </td>
                                  <td className="py-3 px-4 text-gray-500">{fx.source || '—'}</td>
                                  <td className="py-3 px-4 text-gray-500">{fx.updated_by || 'system'}</td>
                                  <td className="py-3 px-4 text-gray-400">{fx.updated_at}</td>
                                  <td className="py-3 px-4 text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleOpenFxModal(fx)}
                                      className="text-primary-600 hover:text-primary-700 h-7 px-2 text-xs"
                                    >
                                      <Edit2 className="w-3 h-3 mr-1" /> 编辑
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="6" className="py-8 text-center text-gray-400">
                                  暂无月度参考汇率记录，请点击上方「录入汇率」新增
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* ──────── 机构管理员专属视图 (org_admin) ──────── */}
              {!isSuperAdmin && (
                <div className="space-y-6">
                  <div className="p-4 bg-primary-50 border border-primary-200 rounded-xl flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-primary-900 text-sm">机构财务结算大盘</h3>
                      <p className="text-xs text-primary-700 mt-0.5">本机构应收账款、已付金额及机构课时包采购消耗概况</p>
                    </div>
                    <Badge variant="primary">机构端专享</Badge>
                  </div>

                  {/* 机构 5 核心指标卡 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <Card>
                      <CardContent className="p-5">
                        <div className="text-xs font-semibold text-gray-500 uppercase">机构应收账款合计</div>
                        <div className="text-2xl font-bold text-gray-900 mt-2">
                          ¥{(finSummary.org_settlements?.amount_due_cny || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          共 {finSummary.org_settlements?.count || 0} 张结算单
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <div className="text-xs font-semibold text-gray-500 uppercase">已结款金额</div>
                        <div className="text-2xl font-bold text-emerald-600 mt-2">
                          ¥{(finSummary.org_settlements?.paid_amount_cny || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-emerald-600/80 mt-1">已确认入账</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <div className="text-xs font-semibold text-gray-500 uppercase">待结算金额</div>
                        <div className="text-2xl font-bold text-warning-600 mt-2">
                          ¥{(finSummary.org_settlements?.pending_amount_cny || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-warning-600/80 mt-1">待核对/未结清</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <div className="text-xs font-semibold text-gray-500 uppercase">机构课时包剩余</div>
                        <div className="text-2xl font-bold text-blue-600 mt-2">
                          {finSummary.org_packages?.remaining_hours || 0} 课时
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          已消耗 {finSummary.org_packages?.used_hours || 0} / 总 {finSummary.org_packages?.total_hours || 0}h
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <div className="text-xs font-semibold text-gray-500 uppercase">课时包未付清金额</div>
                        <div className="text-2xl font-bold text-gray-800 mt-2">
                          ¥{(finSummary.org_packages?.unpaid_amount_cny || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          共 {finSummary.org_packages?.packages_count || 0} 个采购课时包
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 机构结算单明细 */}
                  <Card>
                    <CardHeader className="pb-3 border-b border-gray-100">
                      <h3 className="font-bold text-gray-800 text-sm">本机构周期结算单列表</h3>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              <th className="py-3 px-4">单号</th>
                              <th className="py-3 px-4">周期 (起止日期)</th>
                              <th className="py-3 px-4 text-center">完课节数</th>
                              <th className="py-3 px-4 text-center">消耗课时</th>
                              <th className="py-3 px-4 text-right">应收金额 (CNY)</th>
                              <th className="py-3 px-4 text-right">已付金额 (CNY)</th>
                              <th className="py-3 px-4 text-center">结算状态</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-700">
                            {finSummary.org_settlements?.items?.length > 0 ? (
                              finSummary.org_settlements.items.map((it) => (
                                <tr key={it.id} className="hover:bg-gray-50/50">
                                  <td className="py-3 px-4 font-medium">#{it.id}</td>
                                  <td className="py-3 px-4">{it.period_start} ~ {it.period_end}</td>
                                  <td className="py-3 px-4 text-center">{it.total_classes}</td>
                                  <td className="py-3 px-4 text-center">{it.total_hours}h</td>
                                  <td className="py-3 px-4 text-right font-bold">¥{it.amount_due_cny.toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right text-emerald-600">¥{it.paid_amount_cny.toLocaleString()}</td>
                                  <td className="py-3 px-4 text-center">
                                    <Badge variant={it.status === 'paid' ? 'success' : 'warning'}>
                                      {it.status === 'paid' ? '已结清' : '待确认/未结'}
                                    </Badge>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="7" className="py-8 text-center text-gray-400">
                                  期间暂无结算单
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* 财务数据口径全站人话版注脚 (D2-D5) */}
              <div className="p-4 bg-gray-50/80 border border-gray-200 rounded-xl text-xs text-gray-600 space-y-1.5">
                <div className="font-semibold text-gray-700 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-primary-500" />
                  数据报表中心财务经营口径规范（D2–D5 说明）：
                </div>
                <p>
                  1. <strong>直营消课收入（D2）</strong>：混合单价按学员非 gift 实付总额除以总课时（<code className="bg-gray-200 px-1 rounded">blended_price = paid_amount / total_hours</code>）；期间消课收入按完课课时（已含 25 分钟 0.66 系数）乘单价汇总；无单价学员课时进 unpriced_hours 单列，收入计 0；机构课不走学员单价，从直营消课中剔除。
                </p>
                <p>
                  2. <strong>赠送课时（D3）</strong>：payments 中 gift 类型的记录不计入现金收入，课时计入总课时分母自然摊薄单价。
                </p>
                <p>
                  3. <strong>教师课酬与汇率（D4）</strong>：外教薪资原始币种为菲律宾比索（PHP），按结算期末月锁定汇率折算；无该月汇率时回退至最近历史月，缺失汇率时成本与毛利显示「汇率未设置」，严禁以 0 填充。
                </p>
                <p>
                  4. <strong>退款估算（D5）</strong>：系统未设退款金额字段，按当期负向课时调整（adjust）乘学员混合单价估算发生期冲减金额。
                </p>
                <p>
                  5. <strong>课时负债</strong>：直营在读学员剩余课时乘混合单价；机构未付清课时包单独核算，不并入直营负债。
                </p>
              </div>
            </>
          )}

          {/* 汇率录入/编辑 Modal (仅超管) */}
          {fxModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                    <Coins className="w-5 h-5 text-primary-500" />
                    维护 PHP→CNY 月度参考汇率
                  </h3>
                  <button
                    onClick={() => setFxModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveFxRate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      目标月份 (YYYY-MM) *
                    </label>
                    <input
                      type="text"
                      pattern="^\d{4}-\d{2}$"
                      required
                      value={fxForm.month}
                      onChange={(e) => setFxForm({ ...fxForm, month: e.target.value })}
                      placeholder="2026-10"
                      className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">以教师结算单 period_end 所在月为准</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      汇率乘数 (1 PHP = ? CNY) *
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      required
                      value={fxForm.rate}
                      onChange={(e) => setFxForm({ ...fxForm, rate: e.target.value })}
                      placeholder="0.1240"
                      className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">例如 0.1240，表示 100 菲律宾比索折合 12.4 元人民币</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      数据来源说明
                    </label>
                    <input
                      type="text"
                      value={fxForm.source}
                      onChange={(e) => setFxForm({ ...fxForm, source: e.target.value })}
                      placeholder="如 Wise 实际汇款 / XE 市场参考"
                      className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFxModalOpen(false)}
                      disabled={fxSubmitting}
                    >
                      取消
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={fxSubmitting}
                      className="flex items-center gap-1.5"
                    >
                      {fxSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                      保存汇率
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 阶段 A：学习分析核心内容 ─── */}
      {activeTab === 'learning' && (
        <div className="space-y-6">
          {/* 1. 核心 KPI 卡片组 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 卡片 1: 在读活跃学员 & 课时负债总量 */}
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">在读学员总量</span>
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {summaryLoading ? '...' : summary?.hour_health?.total_active_students || 0}
                  <span className="text-xs font-normal text-gray-500 ml-1.5">人</span>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                  <span>剩余总课时:</span>
                  <span className="font-semibold text-gray-700">
                    {summaryLoading ? '...' : summary?.hour_health?.total_remaining_hours || 0} 节
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 卡片 2: 流失预警人数 */}
            <Card className="hover:shadow-md transition-shadow border-l-4 border-l-danger-500">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-danger-700 uppercase tracking-wider">流失预警学员</span>
                  <div className="p-2 bg-danger-50 text-danger-600 rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-danger-600">
                  {summaryLoading ? '...' : summary?.risk_summary?.total_risk_students || 0}
                  <span className="text-xs font-normal text-gray-500 ml-1.5">人</span>
                </div>
                <div className="mt-2 text-xs text-danger-600 flex items-center justify-between">
                  <span>高危(≥30天未排课):</span>
                  <span className="font-bold">
                    {summaryLoading ? '...' : summary?.risk_summary?.high_risk_count || 0} 人
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 卡片 3: 五维评分覆盖率 & 均值 */}
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">五维评分均值</span>
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                    <Award className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 flex items-baseline gap-2">
                  <span>
                    {summaryLoading ? '...' : (summary?.competency_scores?.period?.dimensions?.overall ?? '--')}
                  </span>
                  <span className="text-xs text-gray-400 font-normal">/ 5.0 分</span>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                  <span>本期评分覆盖率:</span>
                  <span className="font-medium text-gray-700">
                    {summaryLoading ? '...' : `${Math.round((summary?.competency_scores?.period?.coverage_rate || 0) * 100)}%`}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 卡片 4: 里程碑评估报告发放 */}
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">里程碑报告发放</span>
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {summaryLoading ? '...' : summary?.milestones?.total || 0}
                  <span className="text-xs font-normal text-gray-500 ml-1.5">份</span>
                </div>
                <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                  <span>含 8/30/60/100 节及晋升</span>
                  <span className="text-emerald-600 font-medium">持续统计</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 2. 第一行：课时健康分布 + 学员状态分布 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 课时健康分布 (占 2 栏) */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary-600" />
                    课时健康分布（剩余课时）
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    口径：剩余课时 = students.total_hours − used_hours
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {summaryLoading ? (
                  <div className="h-32 flex items-center justify-center text-sm text-gray-400">加载中...</div>
                ) : (
                  <>
                    {/* 轻量可视化：横向堆叠条形 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                        <span>健康度构成比例</span>
                        <span>共 {summary?.hour_health?.total_active_students || 0} 名在读学员</span>
                      </div>
                      <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${summary?.hour_health?.critical?.percentage || 0}%` }}
                          className="bg-danger-500 transition-all"
                          title={`紧迫: ${summary?.hour_health?.critical?.count || 0}人 (${summary?.hour_health?.critical?.percentage || 0}%)`}
                        />
                        <div
                          style={{ width: `${summary?.hour_health?.warning?.percentage || 0}%` }}
                          className="bg-warning-500 transition-all"
                          title={`关注: ${summary?.hour_health?.warning?.count || 0}人 (${summary?.hour_health?.warning?.percentage || 0}%)`}
                        />
                        <div
                          style={{ width: `${summary?.hour_health?.healthy?.percentage || 0}%` }}
                          className="bg-success-500 transition-all"
                          title={`健康: ${summary?.hour_health?.healthy?.count || 0}人 (${summary?.hour_health?.healthy?.percentage || 0}%)`}
                        />
                      </div>
                    </div>

                    {/* 三档健康度指标卡 */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3.5 bg-danger-50/60 rounded-xl border border-danger-100">
                        <div className="text-xs font-medium text-danger-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-danger-500" />
                          紧迫 (≤3节)
                        </div>
                        <div className="text-xl font-bold text-danger-800 mt-2">
                          {summary?.hour_health?.critical?.count || 0}
                          <span className="text-xs font-normal text-danger-600 ml-1">人</span>
                        </div>
                        <div className="text-[11px] text-danger-600 mt-0.5">
                          占比 {summary?.hour_health?.critical?.percentage || 0}%
                        </div>
                      </div>

                      <div className="p-3.5 bg-warning-50/60 rounded-xl border border-warning-100">
                        <div className="text-xs font-medium text-warning-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-warning-500" />
                          关注 (4–8节)
                        </div>
                        <div className="text-xl font-bold text-warning-800 mt-2">
                          {summary?.hour_health?.warning?.count || 0}
                          <span className="text-xs font-normal text-warning-600 ml-1">人</span>
                        </div>
                        <div className="text-[11px] text-warning-600 mt-0.5">
                          占比 {summary?.hour_health?.warning?.percentage || 0}%
                        </div>
                      </div>

                      <div className="p-3.5 bg-success-50/60 rounded-xl border border-success-100">
                        <div className="text-xs font-medium text-success-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-success-500" />
                          健康 (&gt;8节)
                        </div>
                        <div className="text-xl font-bold text-success-800 mt-2">
                          {summary?.hour_health?.healthy?.count || 0}
                          <span className="text-xs font-normal text-success-600 ml-1">人</span>
                        </div>
                        <div className="text-[11px] text-success-600 mt-0.5">
                          占比 {summary?.hour_health?.healthy?.percentage || 0}%
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 学员状态分布 (占 1 栏) */}
            <Card>
              <CardHeader>
                <div>
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    学员生命周期状态
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">系统全量建档学员分布</p>
                </div>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="h-32 flex items-center justify-center text-sm text-gray-400">加载中...</div>
                ) : (
                  <div className="space-y-4">
                    {[
                      {
                        key: 'active',
                        label: '在读在约 (active)',
                        count: summary?.status_distribution?.active || 0,
                        color: 'bg-indigo-500',
                        textColor: 'text-indigo-600'
                      },
                      {
                        key: 'inactive',
                        label: '暂时停课 (inactive)',
                        count: summary?.status_distribution?.inactive || 0,
                        color: 'bg-amber-500',
                        textColor: 'text-amber-600'
                      },
                      {
                        key: 'graduated',
                        label: '圆满结业 (graduated)',
                        count: summary?.status_distribution?.graduated || 0,
                        color: 'bg-emerald-500',
                        textColor: 'text-emerald-600'
                      }
                    ].map(st => {
                      const total = summary?.status_distribution?.total || 1;
                      const pct = Math.round((st.count / total) * 100);
                      return (
                        <div key={st.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 font-medium">{st.label}</span>
                            <span className="font-semibold text-gray-800">{st.count} 人 ({pct}%)</span>
                          </div>
                          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${pct}%` }}
                              className={`h-full rounded-full ${st.color} transition-all`}
                            />
                          </div>
                        </div>
                      );
                    })}

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <span>系统建档总学员:</span>
                      <span className="font-bold text-gray-800">{summary?.status_distribution?.total || 0} 人</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 3. 第二行：五维评分均值与覆盖率（含月度趋势） */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2">
                <div>
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    五维核心能力综合评分与覆盖率
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    数据源：classes.fb_score_*（1–5星评分，按已完成课程现算）
                  </p>
                </div>
                {/* 覆盖率提示 */}
                {summary?.competency_scores?.period?.is_low_coverage && (
                  <Badge variant="warning" className="self-start sm:self-auto">
                    ⚠️ 数据积累中 (覆盖率低于30%)
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <div className="h-40 flex items-center justify-center text-sm text-gray-400">加载中...</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* 左栏：五维分值横向柱形 */}
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between text-xs text-gray-500 pb-1 border-b border-gray-100">
                      <span>核心维度</span>
                      <div className="flex items-center gap-4">
                        <span>完课: {summary?.competency_scores?.period?.total_completed || 0} 节</span>
                        <span>已评分: {summary?.competency_scores?.period?.scored_count || 0} 节</span>
                        <span className="font-semibold text-gray-700">
                          覆盖率: {Math.round((summary?.competency_scores?.period?.coverage_rate || 0) * 100)}%
                        </span>
                      </div>
                    </div>

                    {[
                      { key: 'phonics', label: '自然拼读 (Phonics)', val: summary?.competency_scores?.period?.dimensions?.phonics, color: 'bg-rose-500' },
                      { key: 'vocab', label: '词汇掌握 (Vocabulary)', val: summary?.competency_scores?.period?.dimensions?.vocab, color: 'bg-amber-500' },
                      { key: 'speaking', label: '口语表达 (Speaking)', val: summary?.competency_scores?.period?.dimensions?.speaking, color: 'bg-emerald-500' },
                      { key: 'listening', label: '听力理解 (Listening)', val: summary?.competency_scores?.period?.dimensions?.listening, color: 'bg-blue-500' },
                      { key: 'engagement', label: '课堂互动 (Engagement)', val: summary?.competency_scores?.period?.dimensions?.engagement, color: 'bg-indigo-500' },
                    ].map(dim => {
                      const score = dim.val || 0;
                      const pct = Math.min(100, (score / 5.0) * 100);
                      return (
                        <div key={dim.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-gray-700">{dim.label}</span>
                            <span className="font-bold text-gray-900">
                              {dim.val !== null ? `${dim.val} 分` : '暂无数据'}
                            </span>
                          </div>
                          <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${pct}%` }}
                              className={`h-full rounded-full ${dim.color} transition-all`}
                            />
                          </div>
                        </div>
                      );
                    })}

                    <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100 flex items-center justify-between mt-2">
                      <span className="text-xs font-semibold text-amber-800">五维综合均分:</span>
                      <span className="text-lg font-bold text-amber-700">
                        {summary?.competency_scores?.period?.dimensions?.overall ?? '--'} / 5.0
                      </span>
                    </div>
                  </div>

                  {/* 右栏：月度评分趋势对照 (纯 div 条形图画法) */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-gray-600 flex items-center justify-between pb-1 border-b border-gray-100">
                      <span>近几个月趋势（业务日期 classes.date 按月聚合）</span>
                      <span className="text-[11px] text-gray-400">零第三方图表依赖</span>
                    </div>

                    <div className="space-y-3 pt-2">
                      {(summary?.competency_scores?.monthly_trend || []).length === 0 ? (
                        <div className="text-xs text-gray-400 py-6 text-center">近几个月暂无课程评分记录</div>
                      ) : (
                        summary.competency_scores.monthly_trend.map(m => (
                          <div key={m.month} className="p-3 bg-gray-50 rounded-lg space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-gray-800">{m.month} 月</span>
                              <div className="flex items-center gap-3 text-gray-500">
                                <span>完课: {m.total_completed}</span>
                                <span>覆盖率: {Math.round(m.coverage_rate * 100)}%</span>
                                <span className="font-bold text-primary-600">均分: {m.overall ?? '--'}</span>
                              </div>
                            </div>
                            {/* 5维微型进度条指示 */}
                            <div className="grid grid-cols-5 gap-1.5 pt-1 text-[10px] text-gray-500 text-center">
                              <div>拼读: {m.phonics ?? '-'}</div>
                              <div>词汇: {m.vocab ?? '-'}</div>
                              <div>口语: {m.speaking ?? '-'}</div>
                              <div>听力: {m.listening ?? '-'}</div>
                              <div>互动: {m.engagement ?? '-'}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 4. 第三行：教材分布与进度 + 里程碑计数 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 教材分布与进度 (占 2 栏) */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                    教材分布与在学进度
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    数据源：student_textbook_progress + textbooks
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {summaryLoading ? (
                  <div className="h-32 flex items-center justify-center text-sm text-gray-400">加载中...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500 border-y border-gray-100">
                        <tr>
                          <th className="py-3 px-4 font-semibold">教材名称 / 编码</th>
                          <th className="py-3 px-3 font-semibold">系列与级别</th>
                          <th className="py-3 px-3 font-semibold text-center">在学人数</th>
                          <th className="py-3 px-3 font-semibold text-center">平均单元</th>
                          <th className="py-3 px-3 font-semibold text-center">平均消课</th>
                          <th className="py-3 px-4 font-semibold text-right">状态统计</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(summary?.textbook_distribution || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-gray-400">
                              暂无教材学习跟踪记录
                            </td>
                          </tr>
                        ) : (
                          summary.textbook_distribution.map(tb => (
                            <tr key={tb.textbook_code} className="hover:bg-gray-50/60">
                              <td className="py-3 px-4 font-medium text-gray-800">
                                <div>{tb.textbook_name}</div>
                                <div className="text-[11px] text-gray-400">{tb.textbook_code}</div>
                              </td>
                              <td className="py-3 px-3 text-gray-600">
                                {tb.series || '--'} ({tb.level || '--'})
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-gray-800">
                                {tb.student_count}
                              </td>
                              <td className="py-3 px-3 text-center text-gray-700">
                                Unit {tb.avg_current_unit}
                              </td>
                              <td className="py-3 px-3 text-center text-gray-700">
                                {tb.avg_classes_done} 节
                              </td>
                              <td className="py-3 px-4 text-right space-x-1">
                                <Badge variant="primary">在读 {tb.in_progress_count}</Badge>
                                {tb.completed_count > 0 && (
                                  <Badge variant="success">已结 {tb.completed_count}</Badge>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 里程碑计数 (占 1 栏) */}
            <Card>
              <CardHeader>
                <div>
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-600" />
                    里程碑阶段报告
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">口径：迁移030现行标准(8/30/60/100/升级)</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {summaryLoading ? (
                  <div className="h-32 flex items-center justify-center text-sm text-gray-400">加载中...</div>
                ) : (
                  <>
                    {[
                      { key: 'milestone_8', label: '第 8 课时阶段评估', badge: '🥉 Rising Star', count: summary?.milestones?.milestone_8 || 0 },
                      { key: 'milestone_30', label: '第 30 课时阶段评估', badge: '🥈 Steady Leaper', count: summary?.milestones?.milestone_30 || 0 },
                      { key: 'milestone_60', label: '第 60 课时阶段评估', badge: '🥇 Semester Pioneer', count: summary?.milestones?.milestone_60 || 0 },
                      { key: 'milestone_100', label: '第 100 课时阶段评估', badge: '💎 Century Club', count: summary?.milestones?.milestone_100 || 0 },
                      { key: 'level_up', label: '级别晋升评定', badge: '🎓 Level Up', count: summary?.milestones?.level_up || 0 },
                    ].map(m => (
                      <div key={m.key} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                        <div>
                          <div className="text-xs font-semibold text-gray-800">{m.label}</div>
                          <div className="text-[11px] text-gray-400">{m.badge}</div>
                        </div>
                        <span className="text-base font-bold text-primary-600">
                          {m.count} <span className="text-xs font-normal text-gray-500">份</span>
                        </span>
                      </div>
                    ))}

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-medium">
                      <span>累计报告签发总数:</span>
                      <span className="font-bold text-gray-900 text-sm">{summary?.milestones?.total || 0} 份</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 5. 第四行：流失预警名单（含分页与混合单价剩余价值估算） */}
          <Card>
            <CardHeader className="flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-danger-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger-600" />
                  流失预警名单（保续费与召回跟踪）
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  预警口径：在读学员 + 剩余课时 &gt; 0 + 未排课天数 ≥ 14 天（30 天为高危子集；未排课天数以 MAX(classes.date) 现算）
                </p>
              </div>

              {/* 预警等级切换 + 搜索框 */}
              <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                {/* 等级筛选 */}
                <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-xs">
                  {[
                    { key: 'all', label: '全部预警' },
                    { key: 'high', label: '高危 (≥30天)' },
                    { key: 'medium', label: '流失 (14-29天)' }
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => {
                        setRiskLevelFilter(f.key);
                        setRiskPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        riskLevelFilter === f.key
                          ? 'bg-white font-bold text-danger-700 shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* 搜索 */}
                <form onSubmit={handleSearchSubmit} className="flex items-center">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="搜索姓名/手机号..."
                      value={riskSearchInput}
                      onChange={(e) => setRiskSearchInput(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none w-44"
                    />
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  </div>
                </form>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* 预警汇总摘要横条 */}
              <div className="bg-danger-50/50 px-5 py-2.5 border-b border-danger-100 flex flex-wrap items-center justify-between text-xs text-danger-800 gap-2">
                <div className="flex items-center gap-4">
                  <span>符合预警条件: <strong>{riskData?.pagination?.total || 0}</strong> 人</span>
                  <span>高危占比: <strong>{riskData?.summary?.high_risk_count || 0}</strong> 人</span>
                  <span>关注预警: <strong>{riskData?.summary?.medium_risk_count || 0}</strong> 人</span>
                </div>
                <div>
                  本页滞留课时价值估算: <strong>¥{riskData?.summary?.page_remaining_value || 0}</strong>
                  <span className="text-[10px] text-danger-600 ml-1">(混合单价核算)</span>
                </div>
              </div>

              {/* 预警表格 */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="py-3 px-4 font-semibold">学员姓名</th>
                      <th className="py-3 px-3 font-semibold">所属机构</th>
                      <th className="py-3 px-3 font-semibold text-center">剩余课时</th>
                      <th className="py-3 px-3 font-semibold text-center">最后完成上课日</th>
                      <th className="py-3 px-3 font-semibold text-center">未上课天数</th>
                      <th className="py-3 px-3 font-semibold text-right">混合单价 (估算)</th>
                      <th className="py-3 px-4 font-semibold text-right">剩余课时价值 (估算)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {riskLoading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary-500" />
                          正在核算流失预警名单...
                        </td>
                      </tr>
                    ) : (riskData?.students || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400">
                          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success-500 opacity-60" />
                          太棒了！当前没有符合该预警条件的在读学员。
                        </td>
                      </tr>
                    ) : (
                      riskData.students.map((st) => (
                        <tr key={st.id} className="hover:bg-danger-50/30 transition-colors">
                          {/* 姓名与电话 */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-gray-800">
                              {st.name}
                              {st.english_name && (
                                <span className="text-gray-400 font-normal ml-1.5">({st.english_name})</span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">{st.phone || '--'}</div>
                          </td>

                          {/* 所属机构 */}
                          <td className="py-3 px-3 text-gray-600">
                            {st.organization_name}
                          </td>

                          {/* 剩余课时 */}
                          <td className="py-3 px-3 text-center">
                            <Badge
                              variant={
                                st.hour_level === 'critical' ? 'danger' : st.hour_level === 'warning' ? 'warning' : 'success'
                              }
                            >
                              剩 {st.remaining_hours} 节
                            </Badge>
                          </td>

                          {/* 最后上课日 */}
                          <td className="py-3 px-3 text-center text-gray-600 font-mono">
                            {st.last_class_date || <span className="text-gray-400">无上课记录</span>}
                          </td>

                          {/* 未上课天数 */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`font-bold ${
                                st.risk_level === 'high_risk' ? 'text-danger-600' : 'text-warning-600'
                              }`}
                            >
                              {st.inactive_days} 天
                            </span>
                            <div className="mt-0.5">
                              <Badge variant={st.risk_level === 'high_risk' ? 'danger' : 'warning'}>
                                {st.risk_level === 'high_risk' ? '高危' : '关注'}
                              </Badge>
                            </div>
                          </td>

                          {/* 混合单价 (估算) */}
                          <td className="py-3 px-3 text-right text-gray-600">
                            {st.has_price ? (
                              <span>¥{st.blended_price}/节</span>
                            ) : (
                              <span className="text-gray-400">无充值记录</span>
                            )}
                          </td>

                          {/* 剩余课时价值 (估算) */}
                          <td className="py-3 px-4 text-right font-bold text-gray-800">
                            {st.has_price ? (
                              <span>¥{st.remaining_value}</span>
                            ) : (
                              <span className="text-gray-400">¥0</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* 分页控制栏 */}
              <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
                <div>
                  显示第 {((riskPage - 1) * 10) + (riskData?.students?.length > 0 ? 1 : 0)} 至{' '}
                  {((riskPage - 1) * 10) + (riskData?.students?.length || 0)} 条，共{' '}
                  <span className="font-semibold text-gray-700">{riskData?.pagination?.total || 0}</span> 条记录
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!riskData?.pagination?.has_prev || riskLoading}
                    onClick={() => setRiskPage(p => Math.max(1, p - 1))}
                    className="flex items-center gap-1 py-1 px-2.5 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                  </Button>

                  <span className="px-2 py-1 bg-gray-50 rounded border border-gray-200 font-medium text-gray-700">
                    {riskPage} / {riskData?.pagination?.pages || 1}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!riskData?.pagination?.has_next || riskLoading}
                    onClick={() => setRiskPage(p => p + 1)}
                    className="flex items-center gap-1 py-1 px-2.5 text-xs"
                  >
                    下一页 <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* 口径注脚说明 (D2人话版注脚) */}
              <div className="p-4 bg-gray-50/70 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
                <div className="font-semibold text-gray-600 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary-500" />
                  数据口径规范说明（阶段 1）：
                </div>
                <p>
                  1. <strong>未上课天数</strong>：按当前时间减去该学员最近一节已完成课程的日期（<code className="bg-gray-200 px-1 rounded">MAX(classes.date)</code>，仅限 <code className="bg-gray-200 px-1 rounded">status=&apos;completed&apos;</code>）现算，不依赖手动维护字段。未排课满 14 天进入预警，满 30 天划为高危。
                </p>
                <p>
                  2. <strong>混合单价与剩余价值</strong>：因课包表已弃用，单价采用该学员非赠送（剔除 gift）实付总额除以总课时（<code className="bg-gray-200 px-1 rounded">blended_price = paid_amount / total_hours</code>）；剩余课时价值为估算值。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
