import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface QuestionInputProps {
  onSubmit: (question: string) => void;
  disabled?: boolean;
}

export function QuestionInput({ onSubmit, disabled }: QuestionInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSubmit(text.trim());
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder="Interrupt and ask..."
        className="w-full bg-surface border border-white/10 rounded-full py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-primary text-bg rounded-full flex items-center justify-center disabled:opacity-50 disabled:bg-white/10 disabled:text-white/40 transition-colors"
      >
        <Send size={14} className={text.trim() ? "translate-x-[1px]" : ""} />
      </button>
    </form>
  );
}
