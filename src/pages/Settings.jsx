import { useState, useRef, useEffect } from 'react';
import { Download, Upload, Database, Trash2, AlertTriangle, Users, ExternalLink } from 'lucide-react';
import { exportData, importData } from '../store';
import { adminOps, request } from '../store/api';

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
      setMessage({ type: 'success', text: '数据导入成功！' });
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

  // stats 已通过 useEffect 从 API 加载

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">设置</h1>
        <p className="text-gray-500 mt-1">数据管理与系统设置</p>
      </div>

      {/* 消息提示 */}
      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* 课时系数配置 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-semibold text-gray-800">课时与计费配置</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">25分钟课时系数</label>
              <p className="text-xs text-gray-400">影响学生扣课时和充值买课时。50分钟=1课时，25分钟=系数×1</p>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="1"
              value={coefficient}
              onChange={(e) => setCoefficient(e.target.value)}
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-center"
            />
            <button
              onClick={handleSaveCoefficient}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm"
            >
              保存系数
            </button>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 text-sm text-gray-600">
            <p className="font-medium text-gray-700 mb-1">计算示例：</p>
            <p>25分钟课扣课时 = {coefficient || 0.66} 课时</p>
            <p>充值25分钟10节 = {((parseFloat(coefficient) || 0.66) * 10).toFixed(2)} 课时</p>
            <p>充值50分钟10节 = 10 课时</p>
            <p className="mt-1 text-xs text-gray-400">老师结算按次数独立计费，不受系数影响</p>
          </div>
        </div>
      </div>

      {/* 数据统计 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-800">当前数据概览</h2>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-primary-600">{stats.students}</div>
            <div className="text-sm text-gray-500">学生</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{stats.packages}</div>
            <div className="text-sm text-gray-500">课时包</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{stats.classes}</div>
            <div className="text-sm text-gray-500">上课记录</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.payments}</div>
            <div className="text-sm text-gray-500">付款记录</div>
          </div>
        </div>
      </div>

      {/* 家长访问入口 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-5 h-5 text-orange-500" />
          <h2 className="font-semibold text-gray-800">家长访问</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          家长可通过以下链接查看孩子的学习进度和上课记录。无需登录，只需输入学生ID或手机号。
        </p>
        <div className="flex items-center gap-4">
          <a
            href="/parent"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <ExternalLink size={20} />
            打开家长端
          </a>
          <div className="text-sm text-gray-500">
            访问路径: <code className="bg-gray-100 px-2 py-1 rounded">/parent</code>
          </div>
        </div>
        <div className="mt-4 p-4 bg-orange-50 rounded-lg">
          <h3 className="font-medium text-orange-800 mb-2">使用说明</h3>
          <ul className="text-sm text-orange-700 space-y-1">
            <li>• 家长访问无需登录，直接通过学生ID或手机号查询</li>
            <li>• 家长只能查看数据，不能修改任何信息</li>
            <li>• 请将学生ID告知家长，以便他们查看孩子的学习进度</li>
          </ul>
        </div>
      </div>

      {/* 数据导出/导入 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">数据备份与恢复</h2>
        <p className="text-gray-500 text-sm mb-6">
          导出您的所有数据为 JSON 文件，以便备份或迁移到其他设备。导入数据将覆盖当前所有数据。
        </p>
        <div className="flex gap-4">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <Download size={20} />
            导出数据
          </button>
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <button className="flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              <Upload size={20} />
              导入数据
            </button>
          </div>
        </div>
      </div>

      {/* 危险操作 */}
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <h2 className="font-semibold text-red-600 mb-4">危险操作</h2>
        <p className="text-gray-500 text-sm mb-4">
          清空所有数据将删除所有学生、课时包、上课记录和付款记录。此操作不可恢复，请提前导出数据进行备份。
        </p>
        <button
          onClick={handleClearData}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
            confirmClear ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-red-200 text-red-600 hover:bg-red-50'
          }`}
        >
          <Trash2 size={20} />
          {confirmClear ? '再次点击确认清空' : '清空所有数据'}
        </button>
        {confirmClear && (
          <p className="mt-3 text-sm text-red-500 flex items-center gap-1">
            <AlertTriangle size={14} />
            请在 3 秒内再次点击确认
          </p>
        )}
      </div>

      {/* 关于 */}
      <div className="mt-6 text-center text-gray-400 text-sm">
        <p>阳光桥在线英语客户管理系统 v1.0</p>
        <p className="mt-1">基于 React + Tailwind CSS 构建</p>
      </div>
    </div>
  );
}
