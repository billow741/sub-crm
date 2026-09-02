import React from 'react';
import { ClassRecord, DetectedRecording } from '../lib/types';
import { Video, FolderOpen, RefreshCw, Upload, CheckCircle2 } from 'lucide-react';

interface Props {
  classes: ClassRecord[];
  recordings: DetectedRecording[];
  onUploadFile: (classId: number, filePath: string) => void;
  onRefresh: () => void;
  onOpenFolder: () => void;
}

export const RecordingManager: React.FC<Props> = ({
  classes,
  recordings,
  onUploadFile,
  onRefresh,
  onOpenFolder,
}) => {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <Video className="w-4 h-4 text-sky-400" />
            课堂录像智能归档中心
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">自动感知本地录像并一键归档到机构私有云</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenFolder}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-all"
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-400" /> 打开录像目录
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-all"
            title="刷新"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 待归档录像列表 */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-300">
          📂 本地新生成的录制文件 ({recordings.length})
        </h4>

        {recordings.length === 0 ? (
          <div className="p-8 text-center bg-slate-800/40 rounded-xl border border-dashed border-slate-700">
            <Video className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">当前没有未归档的本地录像</p>
            <p className="text-[11px] text-slate-500 mt-1">腾讯会议下课转码完成后，新视频将自动在此处展示</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recordings.map((rec, i) => (
              <div
                key={i}
                className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200 truncate">{rec.fileName}</span>
                    <span className="text-[11px] font-mono text-slate-400">{rec.fileSizeFormatted}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    生成时间: {rec.createdTime}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    id={`assign-class-${i}`}
                    defaultValue={rec.matchedClassId || classes[0]?.id}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 max-w-[160px]"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.start_time} {c.student_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const selectEl = document.getElementById(`assign-class-${i}`) as HTMLSelectElement;
                      const cid = Number(selectEl?.value || classes[0]?.id);
                      onUploadFile(cid, rec.filePath);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-all"
                  >
                    <Upload className="w-3 h-3" /> 一键归档
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 已归档课程概览 */}
      <div className="space-y-3 pt-4 border-t border-slate-800">
        <h4 className="text-xs font-semibold text-slate-300">
          ✨ 今日已完成归档课程 ({classes.filter((c) => c.fb_recording_status === 'ready').length})
        </h4>
        <div className="grid grid-cols-1 gap-2">
          {classes
            .filter((c) => c.fb_recording_status === 'ready')
            .map((c) => (
              <div
                key={c.id}
                className="p-2.5 bg-slate-800/40 border border-slate-700/60 rounded-lg flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-medium text-slate-200">{c.student_name}</span>
                  <span className="text-slate-400">({c.start_time}-{c.end_time})</span>
                </div>
                <span className="text-emerald-400 font-medium">已归档至 Cloudflare R2</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
