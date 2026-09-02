import React, { useEffect, useState } from 'react';
import { ClassRecord, DetectedRecording, AppSettings } from './lib/types';
import { fetchTeacherClasses } from './lib/api';
import { ScheduleView } from './pages/ScheduleView';
import { QuickFeedback } from './pages/QuickFeedback';
import { RecordingManager } from './pages/RecordingManager';
import { SettingsPage } from './pages/Settings';
import { RecordingDetectedModal } from './components/RecordingDetectedModal';
import { UploadProgress } from './components/UploadProgress';
import {
  Calendar,
  Video,
  Settings as SettingsIcon,
} from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = {
  watchDirectory: 'C:\\Users\\' + (navigator.userAgent.includes('Windows') ? 'User' : 'roger') + '\\Documents\\TencentMeeting',
  autoStart: true,
  preClassReminderMinutes: 5,
  autoPromptFeedback: true,
  apiBaseUrl: 'https://api.sunnybridge.qzz.io/api/v1',
  teacherToken: '',
  teacherId: 6,
  teacherName: 'test-teacher',
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'recordings' | 'settings'>('schedule');
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('sb_companion_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFeedbackClass, setActiveFeedbackClass] = useState<ClassRecord | null>(null);

  // New Recording Detected State
  const [detectedRecording, setDetectedRecording] = useState<DetectedRecording | null>(null);
  const [allDetectedRecordings, setAllDetectedRecordings] = useState<DetectedRecording[]>([]);

  // Upload progress state
  const [uploadState, setUploadState] = useState<{
    fileName: string;
    progress: number;
    status: 'idle' | 'uploading' | 'completed' | 'error';
    errorMessage?: string;
  }>({
    fileName: '',
    progress: 0,
    status: 'idle',
  });

  const loadClasses = async () => {
    setLoading(true);
    const list = await fetchTeacherClasses(settings.apiBaseUrl, settings.teacherId);
    setClasses(list);
    setLoading(false);
  };

  useEffect(() => {
    loadClasses();
    const interval = setInterval(loadClasses, 60000); // 1 min sync
    return () => clearInterval(interval);
  }, [settings.teacherId, settings.apiBaseUrl]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('sb_companion_settings', JSON.stringify(newSettings));
  };

  const handleManualUpload = (classItem: ClassRecord) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploadState({
        fileName: file.name,
        progress: 10,
        status: 'uploading',
      });

      try {
        const formData = new FormData();
        formData.append('video', file);

        setUploadState((prev) => ({ ...prev, progress: 45 }));

        const res = await fetch(`${settings.apiBaseUrl}/classes/upload-recording/${classItem.id}`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

        setUploadState({
          fileName: file.name,
          progress: 100,
          status: 'completed',
        });

        setTimeout(() => {
          setUploadState((prev) => ({ ...prev, status: 'idle' }));
          loadClasses();
        }, 2000);
      } catch (err: any) {
        setUploadState({
          fileName: file.name,
          progress: 0,
          status: 'error',
          errorMessage: err.message || '上传失败',
        });
      }
    };
    input.click();
  };

  const handleConfirmDetectedUpload = async (classId: number, filePath: string) => {
    setDetectedRecording(null);
    setAllDetectedRecordings((prev) => prev.filter((r) => r.filePath !== filePath));

    const cls = classes.find((c) => c.id === classId);
    if (cls) {
      handleManualUpload(cls);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* 顶部标题栏 (Window Titlebar) */}
      <header className="titlebar-drag-region h-11 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white text-[10px] font-black">
            SB
          </div>
          <span className="text-xs font-bold text-slate-200">SunnyBridge 教学伴侣</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/10 text-sky-400 font-semibold rounded border border-sky-500/20">
            v1.0 MVP
          </span>
        </div>

        {/* 顶部标签切换 */}
        <nav className="titlebar-no-drag flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => {
              setActiveFeedbackClass(null);
              setActiveTab('schedule');
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              activeTab === 'schedule' && !activeFeedbackClass
                ? 'bg-sky-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> 课表
          </button>
          <button
            onClick={() => {
              setActiveFeedbackClass(null);
              setActiveTab('recordings');
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              activeTab === 'recordings'
                ? 'bg-sky-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" /> 录像归档
            {allDetectedRecordings.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => {
              setActiveFeedbackClass(null);
              setActiveTab('settings');
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              activeTab === 'settings'
                ? 'bg-sky-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" /> 设置
          </button>
        </nav>

        {/* 教师身份指示 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            👤 <b className="text-slate-200">{settings.teacherName}</b>
          </span>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 overflow-y-auto">
        {uploadState.status !== 'idle' && (
          <div className="p-3 bg-slate-950/60 border-b border-slate-800">
            <UploadProgress {...uploadState} />
          </div>
        )}

        {activeFeedbackClass ? (
          <QuickFeedback
            classItem={activeFeedbackClass}
            apiBase={settings.apiBaseUrl}
            onBack={() => setActiveFeedbackClass(null)}
            onSuccess={() => {
              setActiveFeedbackClass(null);
              loadClasses();
            }}
          />
        ) : activeTab === 'schedule' ? (
          <ScheduleView
            classes={classes}
            loading={loading}
            onRefresh={loadClasses}
            onOpenFeedback={(c) => setActiveFeedbackClass(c)}
            onManualUpload={handleManualUpload}
          />
        ) : activeTab === 'recordings' ? (
          <RecordingManager
            classes={classes}
            recordings={allDetectedRecordings}
            onUploadFile={handleConfirmDetectedUpload}
            onRefresh={loadClasses}
            onOpenFolder={() => {}}
          />
        ) : (
          <SettingsPage
            settings={settings}
            onSave={handleSaveSettings}
            onSelectFolder={async () => null}
          />
        )}
      </main>

      {/* 智能感知新录像弹窗 */}
      {detectedRecording && (
        <RecordingDetectedModal
          recording={detectedRecording}
          classes={classes}
          onConfirmUpload={handleConfirmDetectedUpload}
          onDismiss={() => setDetectedRecording(null)}
        />
      )}

      {/* 底部状态栏 */}
      <footer className="h-7 bg-slate-950 border-t border-slate-800/80 px-3 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>录制监控: 正常运行中</span>
        </div>
        <div>
          <span>Cloudflare R2 私有流媒体直连</span>
        </div>
      </footer>
    </div>
  );
};
