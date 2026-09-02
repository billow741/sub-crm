import React from 'react';
import { ClassRecord } from '../lib/types';
import { Clock, BookOpen, CheckCircle, Video, FileEdit } from 'lucide-react';

interface Props {
  classItem: ClassRecord;
  onOpenFeedback: (classItem: ClassRecord) => void;
  onManualUpload: (classItem: ClassRecord) => void;
}

export const ClassCard: React.FC<Props> = ({ classItem, onOpenFeedback, onManualUpload }) => {
  const isCompleted = classItem.status === 'completed';
  const hasRecording = classItem.fb_recording_status === 'ready';

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      isCompleted
        ? 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
        : 'bg-slate-800 border-sky-500/30 hover:border-sky-500/60 shadow-lg shadow-sky-950/20'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base text-slate-100">{classItem.student_name}</span>
            {classItem.student_grade && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-sky-500/20 text-sky-300 rounded-full border border-sky-500/30">
                {classItem.student_grade}
              </span>
            )}
            <span className="text-xs text-slate-400">· {classItem.subject}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{classItem.start_time} - {classItem.end_time}</span>
            {classItem.duration && <span className="text-slate-500">({classItem.duration}m)</span>}
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
              <CheckCircle className="w-3 h-3" /> 已完成
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-full border border-amber-500/20">
              <Clock className="w-3 h-3" /> 待上课
            </span>
          )}
        </div>
      </div>

      {/* Textbook info */}
      {classItem.textbook_code && (
        <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-700/50 mb-3">
          <BookOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="font-medium text-sky-200">{classItem.textbook_code}</span>
          {classItem.unit_number && <span>· U{classItem.unit_number}</span>}
          {classItem.page_from && <span>· P{classItem.page_from}-{classItem.page_to}</span>}
        </div>
      )}

      {/* Recording status tag */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
        <div className="flex items-center gap-1.5 text-xs">
          <Video className="w-3.5 h-3.5 text-slate-400" />
          {hasRecording ? (
            <span className="text-emerald-400 font-medium">✅ 录像已归档 (R2)</span>
          ) : classItem.fb_recording_status === 'pending' ? (
            <span className="text-amber-400 font-medium">⏳ 录像同步中</span>
          ) : (
            <span className="text-slate-400">未归档录像</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!hasRecording && (
            <button
              onClick={() => onManualUpload(classItem)}
              className="px-2.5 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-all"
            >
              📤 传录像
            </button>
          )}
          <button
            onClick={() => onOpenFeedback(classItem)}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg shadow-sm transition-all"
          >
            <FileEdit className="w-3 h-3" />
            {isCompleted ? '修改反馈' : '填写反馈'}
          </button>
        </div>
      </div>
    </div>
  );
};
