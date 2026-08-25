import { useState, useEffect, useRef } from 'react';
import { Users, ChevronDown, Check } from 'lucide-react';

/**
 * 老师筛选多选组件
 * 跟 OrgFilter 风格一致,但支持多选
 *
 * Props:
 * - teachers: 老师列表 (Array<{id, name, ...}>)
 * - selectedIds: 当前选中的老师 ID 集合 (Set<number|string>)
 * - onChange: 选中变化回调 (newSelectedIds: Set<number|string>) => void
 * - className: 额外样式
 */
export default function TeacherFilter({ teachers, selectedIds, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // 没有老师时不显示
  if (!teachers || teachers.length === 0) return null;

  // 计算显示文本
  const getButtonText = () => {
    const total = teachers.length;
    const selected = selectedIds.size;
    if (selected === 0) return '老师: 无';
    if (selected === total) return `老师: 全部 (${total})`;
    if (selected === 1) {
      const t = teachers.find(t => selectedIds.has(t.id));
      return `老师: ${t?.name || '1 位'}`;
    }
    return `老师: 已选 ${selected}/${total}`;
  };

  // 切换某个老师
  const toggleTeacher = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onChange(newSet);
  };

  // 全选 / 全清
  const selectAll = () => {
    onChange(new Set(teachers.map(t => t.id)));
  };
  const clearAll = () => {
    onChange(new Set());
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`pl-9 pr-8 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center gap-2 ${
          selectedIds.size === 0
            ? 'border-red-300 text-red-600'
            : 'border-gray-300 text-gray-700'
        }`}
      >
        <Users size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${
          selectedIds.size === 0 ? 'text-red-400' : 'text-gray-400'
        }`} />
        <span>{getButtonText()}</span>
        <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[240px]">
          <div className="flex justify-between items-center px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-500">老师筛选</span>
            <div className="flex gap-2 text-xs">
              <button
                onClick={selectAll}
                className="text-primary-600 hover:text-primary-700"
              >
                全选
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={clearAll}
                className="text-gray-500 hover:text-gray-700"
              >
                清空
              </button>
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            {teachers.map(t => {
              const checked = selectedIds.has(t.id);
              return (
                <label
                  key={t.id}
                  onClick={() => toggleTeacher(t.id)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <span className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${
                    checked ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'
                  }`}>
                    {checked && <Check size={12} className="text-white" />}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{t.name}</span>
                  {t.english_name && (
                    <span className="text-xs text-gray-400">{t.english_name}</span>
                  )}
                </label>
              );
            })}
          </div>

          {selectedIds.size === 0 && (
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-red-500 bg-red-50">
              ⚠️ 当前不显示任何老师的课程
            </div>
          )}
        </div>
      )}
    </div>
  );
}
