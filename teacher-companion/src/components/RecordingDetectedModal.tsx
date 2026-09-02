import React from 'react';
import { DetectedRecording, ClassRecord } from '../lib/types';
import { Video, Sparkles, X, Upload } from 'lucide-react';

interface Props {
  recording: DetectedRecording;
  classes: ClassRecord[];
  onConfirmUpload: (classId: number, filePath: string) => void;
  onDismiss: () => void;
}

export const RecordingDetectedModal: React.FC<Props> = ({
  recording,
  classes,
  onConfirmUpload,
  onDismiss,
}) => {
  const [selectedClassId, setSelectedClassId] = React.useState<number>(
    recording.matchedClassId || (classes[0]?.id || 0)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-sky-500/40 rounded-2xl p-5 max-w-md w-full shadow-2xl shadow-sky-950/50 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">发现新课堂录像</h3>
              <p className="text-xs text-slate-400">智能感知到刚刚转码生成的本地视频</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File info card */}
        <div className="my-4 p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5 font-medium truncate">
              <Video className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              {recording.fileName}
            </span>
            <span className="text-slate-400 font-mono shrink-0">{recording.fileSizeFormatted}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            生成时间: {recording.createdTime}
          </div>
        </div>

        {/* Select Class */}
        <div className="space-y-2 mb-5">
          <label className="text-xs font-semibold text-slate-300 block">
            请确认归档到哪节课：
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-sky-500"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.date} {c.start_time} - {c.student_name} ({c.subject})
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5">
          <button
            onClick={onDismiss}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all"
          >
            稍后处理
          </button>
          <button
            onClick={() => onConfirmUpload(selectedClassId, recording.filePath)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white rounded-xl shadow-md shadow-sky-950/40 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            一键归档至私有云
          </button>
        </div>
      </div>
    </div>
  );
};
