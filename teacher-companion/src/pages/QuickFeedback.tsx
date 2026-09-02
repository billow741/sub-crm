import React from 'react';
import { ClassRecord } from '../lib/types';
import { FeedbackTemplates } from '../components/FeedbackTemplates';
import { submitClassFeedback } from '../lib/api';
import { ArrowLeft, Save, Sparkles, CheckCircle2 } from 'lucide-react';

interface Props {
  classItem: ClassRecord;
  apiBase: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const QuickFeedback: React.FC<Props> = ({ classItem, apiBase, onBack, onSuccess }) => {
  const [formData, setFormData] = React.useState({
    textbook_code: classItem.textbook_code || '',
    unit_number: classItem.unit_number || 1,
    page_from: classItem.page_from || 1,
    page_to: classItem.page_to || 1,
    fb_vocab: classItem.fb_vocab || '',
    fb_patterns: classItem.fb_patterns || '',
    fb_grammar: classItem.fb_grammar || '',
    fb_teacher_message: classItem.fb_teacher_message || '',
    fb_homework: classItem.fb_homework || '',
    fb_next_preview: classItem.fb_next_preview || '',
  });

  const [saving, setSaving] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await submitClassFeedback(apiBase, classItem.id, formData);
    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } else {
      alert('保存失败，请检查网络后重试');
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4" /> 返回课表
        </button>
        <div className="text-right">
          <span className="text-sm font-bold text-slate-100">{classItem.student_name}</span>
          <span className="text-xs text-slate-400 block">{classItem.date} {classItem.start_time}-{classItem.end_time}</span>
        </div>
      </div>

      {success ? (
        <div className="py-12 text-center space-y-2">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
          <h3 className="text-base font-bold text-slate-100">课后反馈已提交并核销课时！</h3>
          <p className="text-xs text-slate-400">正在返回课表...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 教材进度 */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3.5 space-y-2.5">
            <h4 className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
              <span>📚</span> 今日教材与课件进度
            </h4>
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className="text-[11px] text-slate-400 block mb-1">教材代码</label>
                <input
                  type="text"
                  placeholder="如 EU-S"
                  value={formData.textbook_code}
                  onChange={(e) => setFormData({ ...formData, textbook_code: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">单元 (Unit)</label>
                <input
                  type="number"
                  value={formData.unit_number}
                  onChange={(e) => setFormData({ ...formData, unit_number: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">页码 (From-To)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={formData.page_from}
                    onChange={(e) => setFormData({ ...formData, page_from: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 text-xs text-slate-100 text-center"
                  />
                  <span className="text-slate-500">-</span>
                  <input
                    type="number"
                    value={formData.page_to}
                    onChange={(e) => setFormData({ ...formData, page_to: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 text-xs text-slate-100 text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 学习重点 */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3.5 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-200">🔤 重点词汇 & 句型</h4>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">词汇 (Vocabulary)</label>
              <input
                type="text"
                placeholder="例如: pencil, eraser, ruler"
                value={formData.fb_vocab}
                onChange={(e) => setFormData({ ...formData, fb_vocab: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">句型与表达 (Patterns)</label>
              <input
                type="text"
                placeholder="例如: What do you have? I have a..."
                value={formData.fb_patterns}
                onChange={(e) => setFormData({ ...formData, fb_patterns: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>
          </div>

          {/* 老师评语 */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200">💌 老师评语 (Teacher Feedback)</h4>
              <span className="text-[11px] text-sky-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> 点击快捷填入模板
              </span>
            </div>
            <textarea
              rows={3}
              placeholder="对学生本节课表现的鼓励与建议..."
              value={formData.fb_teacher_message}
              onChange={(e) => setFormData({ ...formData, fb_teacher_message: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100"
            />
            <FeedbackTemplates
              onSelect={(tpl) => {
                const current = formData.fb_teacher_message;
                setFormData({
                  ...formData,
                  fb_teacher_message: current ? `${current}\n${tpl}` : tpl,
                });
              }}
            />
          </div>

          {/* 课后作业 */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3.5">
            <h4 className="text-xs font-bold text-slate-200 mb-1.5">📝 课后作业 (Homework)</h4>
            <input
              type="text"
              placeholder="例如: 复习 Unit 1 单词，完成练习册第 4 页"
              value={formData.fb_homework}
              onChange={(e) => setFormData({ ...formData, fb_homework: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? '保存中...' : '提交反馈'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
