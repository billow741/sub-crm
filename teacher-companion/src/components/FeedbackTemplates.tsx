import React from 'react';

interface Props {
  onSelect: (text: string) => void;
}

export const TEMPLATES = [
  { label: '🌟 表现优异', text: 'Great job today! Very active and responsive throughout the whole lesson.' },
  { label: '📖 专注朗读', text: 'Excellent reading and clear pronunciation today. Kept good focus.' },
  { label: '🗣️ 积极发言', text: 'Showed great improvement in speaking sentences complete and fluently.' },
  { label: '✏️ 需多复习', text: 'Good effort today. Please review the new vocabulary and practice the sentence patterns.' },
  { label: '🎯 语法提醒', text: 'Well done! Pay extra attention to the verb tenses and plural forms when making sentences.' },
];

export const FeedbackTemplates: React.FC<Props> = ({ onSelect }) => {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {TEMPLATES.map((t, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onSelect(t.text)}
          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700/60 transition-all text-left"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};
