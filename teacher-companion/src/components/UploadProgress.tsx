import React from 'react';
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  fileName: string;
  progress: number;
  status: 'idle' | 'uploading' | 'completed' | 'error';
  errorMessage?: string;
}

export const UploadProgress: React.FC<Props> = ({
  fileName,
  progress,
  status,
  errorMessage,
}) => {
  if (status === 'idle') return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 shadow-lg">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <UploadCloud className={`w-4 h-4 shrink-0 ${status === 'uploading' ? 'text-sky-400 animate-pulse' : 'text-slate-400'}`} />
          <span className="text-xs font-medium text-slate-200 truncate">{fileName}</span>
        </div>
        <div>
          {status === 'uploading' && (
            <span className="text-xs font-bold text-sky-400">{progress}%</span>
          )}
          {status === 'completed' && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> 上传完成
            </span>
          )}
          {status === 'error' && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400">
              <AlertCircle className="w-3.5 h-3.5" /> 失败
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            status === 'completed' ? 'bg-emerald-500' : status === 'error' ? 'bg-rose-500' : 'bg-sky-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {errorMessage && (
        <p className="text-[11px] text-rose-400 mt-1.5">{errorMessage}</p>
      )}
    </div>
  );
};
