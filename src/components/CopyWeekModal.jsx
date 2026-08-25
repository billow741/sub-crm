import { useState, useEffect, useMemo } from 'react';
import { Copy, X, Check, AlertTriangle } from 'lucide-react';

/**
 * 一键复制上周排课到本周 Modal
 *
 * Props:
 * - isOpen: 是否打开
 * - onClose: 关闭回调
 * - teachers: 所有老师列表 (Array<{id, name, ...}>)
 * - sourceSchedules: 上一周所有排课 (Array)
 * - targetSchedules: 本周已存在的排课(用于冲突检测)
 * - sourceWeekLabel: 源周标签 (如 "8-17 ~ 8-23")
 * - targetWeekLabel: 目标周标签 (如 "8-24 ~ 8-30")
 * - onConfirm: 确认回调 (selectedSchedules: Array) => Promise<void>
 */
export default function CopyWeekModal({
  isOpen,
  onClose,
  teachers,
  sourceSchedules,
  targetSchedules,
  sourceWeekLabel,
  targetWeekLabel,
  onConfirm
}) {
  // 默认:全部老师 + include completed + 不 include trial
  const [selectedTeacherIds, setSelectedTeacherIds] = useState(new Set());
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeTrial, setIncludeTrial] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // 打开 modal 时,默认全选老师
  useEffect(() => {
    if (isOpen && teachers.length > 0) {
      setSelectedTeacherIds(new Set(teachers.map(t => t.id)));
      setIncludeCompleted(true);
      setIncludeTrial(false);
      setProgress({ done: 0, total: 0 });
    }
  }, [isOpen, teachers]);

  // 过滤 + 计算预览
  const { preview, total, conflicts } = useMemo(() => {
    const filtered = sourceSchedules.filter(s => {
      if (!selectedTeacherIds.has(s.teacher_id)) return false;
      if (s.status === 'cancelled') return false;
      if (!includeCompleted && s.status === 'completed') return false;
      if (!includeTrial && s.is_trial === 1) return false;
      return true;
    });

    // 检测冲突(目标周已有同时间课)
    const conflictList = [];
    const previewList = filtered.map(s => {
      // 计算新日期 (+7 天)
      const [y, m, d] = s.date.split('-').map(Number);
      const newDate = new Date(y, m - 1, d + 7);
      const newDateStr = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;

      // 冲突:同老师同时间、同学生同时间
      const hasConflict = targetSchedules.some(t =>
        t.date === newDateStr &&
        t.status !== 'cancelled' &&
        ((t.teacher_id === s.teacher_id) || (t.student_id === s.student_id)) &&
        t.start_time === s.start_time
      );

      if (hasConflict) {
        conflictList.push({ ...s, newDate: newDateStr });
      }

      return {
        source_id: s.id,
        student_id: s.student_id,
        teacher_id: s.teacher_id,
        teacher_name: s.teacher_name || s.teacher,
        student_name: s.student_name,
        new_date: newDateStr,
        new_date_display: `${newDate.getMonth() + 1}-${newDate.getDate()}`,
        weekday: ['日', '一', '二', '三', '四', '五', '六'][newDate.getDay()],
        start_time: s.start_time,
        duration: s.duration,
        is_trial: s.is_trial,
        has_conflict: hasConflict
      };
    });

    return { preview: previewList, total: previewList.length, conflicts: conflictList };
  }, [sourceSchedules, targetSchedules, selectedTeacherIds, includeCompleted, includeTrial]);

  const toCreate = preview.filter(p => !p.has_conflict).length;
  const toSkip = preview.filter(p => p.has_conflict).length;

  // 切换老师
  const toggleTeacher = (id) => {
    const newSet = new Set(selectedTeacherIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTeacherIds(newSet);
  };

  // 按老师分组统计源周排课数
  const teacherStats = useMemo(() => {
    const stats = new Map();
    sourceSchedules.forEach(s => {
      if (s.status === 'cancelled') return;
      const key = s.teacher_id;
      if (!stats.has(key)) stats.set(key, 0);
      stats.set(key, stats.get(key) + 1);
    });
    return stats;
  }, [sourceSchedules]);

  // 确认
  const handleConfirm = async () => {
    if (preview.length === 0) return;
    if (toCreate === 0) {
      alert('没有可创建的课(全部冲突或被过滤)');
      return;
    }
    if (!confirm(`将创建 ${toCreate} 条新排课${toSkip > 0 ? `,跳过 ${toSkip} 条冲突` : ''}。继续?`)) return;

    setSubmitting(true);
    setProgress({ done: 0, total: toCreate });

    try {
      await onConfirm(
        preview.filter(p => !p.has_conflict),
        (done) => setProgress({ done, total: toCreate })
      );
      onClose();
    } catch (err) {
      alert(`复制失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-bold">复制上周排课到本周</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 范围 */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded p-3">
              <div className="text-gray-500 text-xs">源(上周)</div>
              <div className="font-medium">{sourceWeekLabel}</div>
            </div>
            <div className="bg-purple-50 rounded p-3">
              <div className="text-gray-500 text-xs">目标(本周)</div>
              <div className="font-medium text-purple-700">{targetWeekLabel}</div>
            </div>
          </div>

          {/* 老师筛选 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">按老师筛选</span>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setSelectedTeacherIds(new Set(teachers.map(t => t.id)))}
                  className="text-purple-600 hover:text-purple-700"
                >
                  全选
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setSelectedTeacherIds(new Set())}
                  className="text-gray-500 hover:text-gray-700"
                >
                  清空
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto">
              {teachers.map(t => {
                const checked = selectedTeacherIds.has(t.id);
                const count = teacherStats.get(t.id) || 0;
                return (
                  <label
                    key={t.id}
                    onClick={() => toggleTeacher(t.id)}
                    className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer ${
                      checked ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${
                      checked ? 'bg-purple-600 border-purple-600' : 'border-gray-300 bg-white'
                    }`}>
                      {checked && <Check size={12} className="text-white" />}
                    </span>
                    <span className="flex-1 text-sm truncate">{t.name}</span>
                    <span className="text-xs text-gray-400">({count})</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 排除规则 */}
          <div className="border-t pt-4">
            <span className="text-sm font-medium text-gray-700 block mb-2">规则</span>
            <label className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={e => setIncludeCompleted(e.target.checked)}
                className="rounded text-purple-600"
              />
              <span className="text-sm">包含已完成的课 (status=completed)</span>
            </label>
            <label className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={includeTrial}
                onChange={e => setIncludeTrial(e.target.checked)}
                className="rounded text-purple-600"
              />
              <span className="text-sm">包含体验课 (is_trial=1)</span>
            </label>
            <div className="text-xs text-gray-500 mt-1 pl-6">
              ⚠️ 已取消的课 (status=cancelled) 始终跳过
            </div>
          </div>

          {/* 预览 */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">预览</span>
              <span className="text-sm text-gray-500">
                共 {total} 条,创建 {toCreate},跳过 {toSkip}
              </span>
            </div>

            {total === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                {sourceSchedules.length === 0 ? '上周无排课' : '当前筛选下没有要复制的课'}
              </div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto border rounded divide-y">
                {preview.map((p, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 px-3 py-2 text-sm ${
                      p.has_conflict ? 'bg-orange-50 text-orange-700' : ''
                    }`}
                  >
                    {p.has_conflict && <AlertTriangle size={14} />}
                    <span className="w-16 text-gray-600">{p.new_date_display} (周{p.weekday})</span>
                    <span className="w-14 font-mono">{p.start_time}</span>
                    <span className="flex-1 truncate">
                      {p.student_name} → {p.teacher_name}
                    </span>
                    {p.is_trial === 1 && <span className="text-xs">🎁</span>}
                    {p.has_conflict && <span className="text-xs">冲突</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 进度 */}
          {submitting && (
            <div className="bg-purple-50 rounded p-3">
              <div className="text-sm text-purple-700 mb-1">
                创建中... {progress.done}/{progress.total}
              </div>
              <div className="w-full bg-purple-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || toCreate === 0}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? `复制中 ${progress.done}/${progress.total}` : `确认复制 ${toCreate} 条`}
          </button>
        </div>
      </div>
    </div>
  );
}
