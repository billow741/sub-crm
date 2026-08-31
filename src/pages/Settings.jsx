import { useState, useRef, useEffect } from 'react';
import { Download, Upload, Database, Trash2, AlertTriangle, Users, ExternalLink, Settings, Calculator, Sparkles, Server, Copy } from 'lucide-react';
import { exportData, importData } from '../store';
import { adminOps, request } from '../store/api';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export default function SettingsPage() {
  const [message, setMessage] = useState({ type: '', text: '' });
  const [confirmClear, setConfirmClear] = useState(false);
  const [stats, setStats] = useState({ students: 0, packages: 0, classes: 0, payments: 0 });
  const fileInputRef = useRef(null);
  const [coefficient, setCoefficient] = useState('0.66');

  // 加载课时系数
  useEffect(() => {
    async function loadCoefficient() {
      try {
        const res = await request('/settings/short_class_coefficient');
        const val = res?.data?.value || res?.value || '0.66';
        setCoefficient(val);
      } catch(e) { /* 可能还没配置 */ }
    }
    loadCoefficient();
  }, []);

  const handleSaveCoefficient = async () => {
    try {
      await request('/settings', {
        method: 'PATCH',
        body: { short_class_coefficient: coefficient },
      });
      setMessage({ type: 'success', text: `课时系数已保存为 ${coefficient}` });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch(e) {
      setMessage({ type: 'error', text: '保存失败：' + (e.message || '未知错误') });
    }
  };

  // 加载数据统计
  useEffect(() => {
    async function loadStats() {
      try {
        const data = await adminOps.getStats();
        if (data) {
          setStats({
            students: data.students || 0,
            packages: data.packages || 0,
            classes: data.classes || 0,
            payments: data.payments || 0,
          });
        }
      } catch (err) {
        console.error('加载统计失败:', err);
      }
    }
    loadStats();
  }, []);

  const handleExport = async () => {
    try {
      const result = await exportData();
      // 创建下载链接
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sunnybridge-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: '数据已导出成功！' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: '导出失败：' + err.message });
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data, 'replace');
      setMessage({ type: 'success', text: '数据导入成功！页面即将刷新...' });
      setTimeout(() => {
        setMessage({ type: '', text: '' });
        window.location.reload();
      }, 1500);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || '导入失败，请检查文件格式' });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearData = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    
    if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
      try {
        await adminOps.clearAll();
        setMessage({ type: 'success', text: '数据已清空！' });
        setConfirmClear(false);
        window.location.reload();
      } catch (err) {
        setMessage({ type: 'error', text: '清空失败：' + err.message });
        setConfirmClear(false);
      }
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      <div className="flex items-center gap-4 border-b border-gray-200 pb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl flex items-center justify-center text-primary-600 shadow-inner">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
          <p className="text-sm text-gray-500 font-medium">全局配置 · 数据备份与统计信息</p>
        </div>
      </div>

      {/* 消息提示 */}
      {message.text && (
        <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 font-bold ${
          message.type === 'success' ? 'bg-success-50 text-success-700 border border-success-200' : 'bg-danger-50 text-danger-700 border border-danger-200'
        }`}>
          {message.type === 'success' ? <Sparkles className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* 数据统计 */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 flex items-center gap-2 px-6 py-4">
              <Database className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-gray-900 text-base">系统数据概览</h2>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col justify-center items-center p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-indigo-200 transition-colors">
                  <div className="text-3xl font-black text-indigo-600 mb-1">{stats.students}</div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">入库学生</div>
                </div>
                <div className="flex flex-col justify-center items-center p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-orange-200 transition-colors">
                  <div className="text-3xl font-black text-orange-600 mb-1">{stats.packages}</div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">售出课时包</div>
                </div>
                <div className="flex flex-col justify-center items-center p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                  <div className="text-3xl font-black text-blue-600 mb-1">{stats.classes}</div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">消课记录</div>
                </div>
                <div className="flex flex-col justify-center items-center p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-green-200 transition-colors">
                  <div className="text-3xl font-black text-green-600 mb-1">{stats.payments}</div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">财务流水</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 课时系数配置 */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="bg-primary-50/30 border-b border-primary-100 flex items-center gap-2 px-6 py-4">
              <Calculator className="w-5 h-5 text-primary-600" />
              <h2 className="font-bold text-gray-900 text-base">课时与计费基准配置</h2>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-1">25 分钟短课时折算系数</label>
                  <p className="text-xs text-gray-500">影响学生消课及购买。基准: 50分钟 = 1 课时</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="0.01" min="0.01" max="1"
                    value={coefficient}
                    onChange={(e) => setCoefficient(e.target.value)}
                    className="w-24 px-4 py-2 text-center font-bold text-gray-900 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none transition-shadow"
                  />
                  <Button variant="primary" onClick={handleSaveCoefficient}>
                    保存设置
                  </Button>
                </div>
              </div>
              
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="bg-orange-200 text-orange-800 font-bold">试算示例</Badge>
                  <span className="text-xs text-gray-500">按当前系数 {coefficient || 0.66} 计算</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-700 font-medium mt-3">
                  <div className="flex items-center justify-between border-b border-orange-200/50 pb-1">
                    <span>25分钟单次消课：</span>
                    <span className="font-bold text-gray-900">{coefficient || 0.66} 课时</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-orange-200/50 pb-1">
                    <span>充值 25分钟 10节：</span>
                    <span className="font-bold text-gray-900">{((parseFloat(coefficient) || 0.66) * 10).toFixed(2)} 课时</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-orange-200/50 pb-1">
                    <span>50分钟单次消课：</span>
                    <span className="font-bold text-gray-900">1.00 课时</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-orange-200/50 pb-1">
                    <span>充值 50分钟 10节：</span>
                    <span className="font-bold text-gray-900">10.00 课时</span>
                  </div>
                </div>
                <p className="text-[10px] text-orange-600/80 mt-3 font-bold">* 注：教师薪酬结算按实际上课次数独立计费，不受此系数影响。</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* 家长访问入口 */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 flex items-center gap-2 px-6 py-4">
              <Users className="w-5 h-5 text-gray-500" />
              <h2 className="font-bold text-gray-900 text-base">C 端客户入口分发</h2>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-gray-600 text-sm mb-5 leading-relaxed">
                为家长提供免密查询入口。家长凭学生 ID 或预留手机号即可自助查询课时余额、学习报告与课堂反馈。
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <a
                  href="/parent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors shadow-sm font-bold w-full sm:w-auto"
                >
                  <ExternalLink size={18} />
                  打开家长端 Web App
                </a>
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 w-full sm:w-auto">
                  <span className="shrink-0 font-medium">相对路径:</span> 
                  <code className="text-gray-900 font-bold">/parent</code>
                </div>
              </div>
              
              <div className="mt-5 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <h3 className="font-bold text-gray-800 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-gray-500" /> 分发须知
                </h3>
                <ul className="text-xs text-gray-500 space-y-1.5 pl-5 list-disc font-medium">
                  <li>无需注册或密码，极大降低家长接入成本。</li>
                  <li>数据仅提供只读权限 (Read-Only)，安全可控。</li>
                  <li>建议将其配置到微信公众号菜单「我的课表」中。</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* 数据导出/导入 & 危险操作 */}
          <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow border-red-100">
            <CardHeader className="bg-red-50/30 border-b border-red-100 flex items-center gap-2 px-6 py-4">
              <Server className="w-5 h-5 text-red-500" />
              <h2 className="font-bold text-gray-900 text-base">系统数据维护区</h2>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">备份与恢复</h3>
                <p className="text-gray-500 text-xs mb-4">
                  将完整数据库快照导出为 JSON。导入时将覆盖当前所有数据，请谨慎操作。
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <Download size={16} className="mr-2" />
                    下载数据快照
                  </Button>
                  <div className="relative">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleImport}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900">
                      <Upload size={16} className="mr-2" />
                      从快照恢复
                    </Button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h3 className="text-sm font-bold text-red-600 mb-2">危险区域 (Danger Zone)</h3>
                <p className="text-gray-500 text-xs mb-4">
                  抹除系统内的所有业务数据（学生、课时、流水等）。操作不可撤销！
                </p>
                <button
                  onClick={handleClearData}
                  className={`flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm ${
                    confirmClear 
                      ? 'bg-red-600 text-white hover:bg-red-700 ring-4 ring-red-100' 
                      : 'bg-white border-2 border-red-200 text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 size={18} />
                  {confirmClear ? '确认执行抹除操作' : '清空全站数据'}
                </button>
                {confirmClear && (
                  <p className="mt-2 text-xs text-red-500 font-bold animate-pulse">
                    ⚠️ 请再次点击以确认，此操作无法恢复！
                  </p>
                )}
              </div>

            </CardContent>
          </Card>
        </div>
      </div>

      <div className="pt-8 pb-4 text-center">
        <Badge variant="secondary" className="bg-gray-100 text-gray-400 font-mono text-[10px]">
          SunnyBridge CRM System v1.0 • Built with React & Tailwind
        </Badge>
      </div>
    </div>
  );
}
