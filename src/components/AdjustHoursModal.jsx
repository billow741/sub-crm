import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { studentOps } from '../store/api';

/**
 * 调整学生总课时弹窗组件
 */
export default function AdjustHoursModal({ studentInfo, onClose, onSuccess }) {
  const [adjustment, setAdjustment] = useState(0);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 快捷调整选项
  const quickAdjustments = [
    { label: '+1', value: 1 },
    { label: '+5', value: 5 },
    { label: '+10', value: 10 },
    { label: '-1', value: -1 },
    { label: '-5', value: -5 },
  ];

  // 常用原因
  const commonReasons = ['赠送课时', '系统调整', '补偿课时', '其他'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (adjustment === 0) {
      setError('请选择调整数量');
      return;
    }
    if (!reason.trim()) {
      setError('请填写调整原因');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await studentOps.adjustHours(studentInfo.id, adjustment, reason);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || '调整失败');
    } finally {
      setLoading(false);
    }
  };

  const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

  const totalHours = r2(studentInfo?.total_hours);
  const usedHours = r2(studentInfo?.used_hours);
  const remainingHours = r2(totalHours - usedHours);

  const numAdj = typeof adjustment === 'number' ? adjustment : (parseFloat(adjustment) || 0);
  const newTotal = r2(totalHours + numAdj);
  const newRemaining = r2(remainingHours + numAdj);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-5 w-full max-w-sm mx-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">调整课时</h2>

        {/* 学生课时信息 */}
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="text-sm text-gray-500 mb-1">学生：{studentInfo?.name}</div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div>
              <div className="text-xs text-gray-400">总课时</div>
              <div className="text-lg font-bold text-gray-800">{totalHours}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">已用</div>
              <div className="text-lg font-bold text-gray-600">{usedHours}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">剩余</div>
              <div className="text-lg font-bold text-primary-600">{remainingHours}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* 快捷调整 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">快捷调整</label>
            <div className="flex gap-1.5">
              {quickAdjustments.map((qa) => (
                <button
                  key={qa.value}
                  type="button"
                  onClick={() => setAdjustment(r2(numAdj + qa.value))}
                  className={`px-2.5 py-1.5 text-sm rounded-lg border transition-colors ${
                    qa.value > 0
                      ? 'border-green-200 text-green-600 hover:bg-green-50'
                      : 'border-red-200 text-red-600 hover:bg-red-50'
                  }`}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>

          {/* 调整数量 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">调整数量 (支持小数，精度0.01) *</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdjustment(r2(numAdj - 1))}
                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Minus size={18} className="text-gray-600" />
              </button>
              <input
                type="number"
                step="0.01"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value === '' ? '' : (parseFloat(e.target.value) || 0))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="0.00"
              />
              <button
                type="button"
                onClick={() => setAdjustment(r2(numAdj + 1))}
                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Plus size={18} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* 调整后预览 */}
          {numAdj !== 0 && (
            <div className={`p-2.5 rounded-lg ${numAdj > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-sm">
                <span className="text-gray-600">调整后：</span>
                <span className={`font-bold ${numAdj > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {numAdj > 0 ? '+' : ''}{numAdj} 节
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                总课时: {totalHours} → {newTotal} | 剩余: {remainingHours} → {newRemaining}
              </div>
            </div>
          )}

          {/* 调整原因 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">调整原因 *</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {commonReasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
                    reason === r
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="请选择或输入调整原因"
            />
          </div>

          {/* 错误提示 */}
          {error && <div className="text-red-600 text-sm">{error}</div>}

          {/* 按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className={`flex-1 px-3 py-2 text-white rounded-lg ${
                adjustment >= 0 ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
              }`}
              disabled={loading}
            >
              {loading ? '处理中...' : '确认调整'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
