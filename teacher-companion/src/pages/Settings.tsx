import React from 'react';
import { AppSettings } from '../lib/types';
import { Settings as SettingsIcon, Save, Folder, Bell, Globe } from 'lucide-react';

interface Props {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  onSelectFolder: () => Promise<string | null>;
}

export const SettingsPage: React.FC<Props> = ({ settings, onSave, onSelectFolder }) => {
  const [formData, setFormData] = React.useState<AppSettings>(settings);
  const [saved, setSaved] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChooseFolder = async () => {
    const folder = await onSelectFolder();
    if (folder) {
      setFormData({ ...formData, watchDirectory: folder });
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <SettingsIcon className="w-4 h-4 text-sky-400" />
            偏好设置
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">个性化配置教学伴侣与录制监控目录</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 监控目录 */}
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3.5 space-y-2">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-sky-400" /> 腾讯会议本地录制保存目录
          </h4>
          <p className="text-[11px] text-slate-400">
            教学伴侣仅监听该文件夹下的 .mp4 文件创建事件，绝不访问其他目录。
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={formData.watchDirectory}
              onChange={(e) => setFormData({ ...formData, watchDirectory: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
            />
            <button
              type="button"
              onClick={handleChooseFolder}
              className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg shrink-0"
            >
              浏览...
            </button>
          </div>
        </div>

        {/* 自动化与通知 */}
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3.5 space-y-3">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-sky-400" /> 智能提醒与自启
          </h4>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-200 font-medium block">开机自动启动</span>
              <span className="text-[11px] text-slate-400 block">开机自动进入后台托盘静默守护</span>
            </div>
            <input
              type="checkbox"
              checked={formData.autoStart}
              onChange={(e) => setFormData({ ...formData, autoStart: e.target.checked })}
              className="w-4 h-4 rounded text-sky-600 bg-slate-900 border-slate-700 focus:ring-0"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
            <div>
              <span className="text-xs text-slate-200 font-medium block">课前提醒时间</span>
              <span className="text-[11px] text-slate-400 block">在屏幕角弹出课程倒计时与录制提醒</span>
            </div>
            <select
              value={formData.preClassReminderMinutes}
              onChange={(e) => setFormData({ ...formData, preClassReminderMinutes: Number(e.target.value) })}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
            >
              <option value={1}>课前 1 分钟</option>
              <option value={3}>课前 3 分钟</option>
              <option value={5}>课前 5 分钟</option>
              <option value={10}>课前 10 分钟</option>
            </select>
          </div>
        </div>

        {/* 教师身份信息 */}
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3.5 space-y-3">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-sky-400" /> 机构与教师绑定
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">教师 ID</label>
              <input
                type="number"
                value={formData.teacherId}
                onChange={(e) => setFormData({ ...formData, teacherId: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">教师姓名</label>
              <input
                type="text"
                value={formData.teacherName}
                onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">CRM API 地址</label>
            <input
              type="text"
              value={formData.apiBaseUrl}
              onChange={(e) => setFormData({ ...formData, apiBaseUrl: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          {saved && <span className="text-xs text-emerald-400 font-medium">✅ 保存成功</span>}
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md transition-all"
          >
            <Save className="w-3.5 h-3.5" /> 保存配置
          </button>
        </div>
      </form>
    </div>
  );
};
