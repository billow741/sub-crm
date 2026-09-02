import React from 'react';
import { ClassRecord } from '../lib/types';
import { ClassCard } from '../components/ClassCard';
import { Calendar, RefreshCw, Sparkles } from 'lucide-react';

interface Props {
  classes: ClassRecord[];
  loading: boolean;
  onRefresh: () => void;
  onOpenFeedback: (classItem: ClassRecord) => void;
  onManualUpload: (classItem: ClassRecord) => void;
}

export const ScheduleView: React.FC<Props> = ({
  classes,
  loading,
  onRefresh,
  onOpenFeedback,
  onManualUpload,
}) => {
  const [filter, setFilter] = React.useState<'all' | 'pending' | 'completed'>('all');

  const filteredClasses = classes.filter((c) => {
    if (filter === 'pending') return c.status !== 'completed';
    if (filter === 'completed') return c.status === 'completed';
    return true;
  });

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="p-4 space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-sky-400" />
              今日课表
            </h3>
            <span className="text-xs text-slate-400 font-mono">({todayStr})</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            共 {classes.length} 节课 · 已完成 {classes.filter((c) => c.status === 'completed').length} 节
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded-md transition-all ${filter === 'all' ? 'bg-sky-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              全部
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-2 py-1 rounded-md transition-all ${filter === 'pending' ? 'bg-sky-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              待上课
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-2 py-1 rounded-md transition-all ${filter === 'completed' ? 'bg-sky-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              已完成
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-all"
            title="刷新课表"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Class List */}
      <div className="space-y-3">
        {loading && classes.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-400" />
            正在同步今日课表...
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="py-12 text-center bg-slate-800/40 rounded-xl border border-dashed border-slate-700 space-y-1">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">暂无符合条件的课程</p>
            <p className="text-[11px] text-slate-500">休息一下，或者刷新获取最新排课</p>
          </div>
        ) : (
          filteredClasses.map((cls) => (
            <ClassCard
              key={cls.id}
              classItem={cls}
              onOpenFeedback={onOpenFeedback}
              onManualUpload={onManualUpload}
            />
          ))
        )}
      </div>
    </div>
  );
};
