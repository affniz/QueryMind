import { Paperclip, Mic, Send } from 'lucide-react';
import { useState, useRef } from 'react';

interface ChatInputProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
}

// Tiny "Coming soon" pill that auto-dismisses after 2 s
function ComingSoonHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#252b3d] border border-white/10 text-slate-300 text-[11px] px-2 py-1 rounded-md shadow-lg pointer-events-none z-50">
      Coming soon
    </span>
  );
}

export default function ChatInput({ onSubmit, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [attachHint, setAttachHint] = useState(false);
  const [micHint, setMicHint] = useState(false);
  const attachTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = (
    setter: (v: boolean) => void,
    timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  ) => {
    setter(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setter(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSubmit(input);
    setInput('');
  };

  return (
    <div className="p-5 shrink-0">
      <form onSubmit={handleSubmit} className="bg-[#11141d] border border-white/10 rounded-xl flex flex-col p-3 shadow-inner">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask QueryMind about your data..."
          disabled={isLoading}
          className="bg-transparent border-none text-white text-[15px] outline-none mb-4 w-full placeholder:text-slate-500 disabled:opacity-50"
        />
        <div className="flex items-center gap-3">
          <div className="relative" onClick={() => showHint(setAttachHint, attachTimer)}>
            <Paperclip size={16} className="text-slate-400 cursor-pointer hover:text-white transition-colors" />
            <ComingSoonHint visible={attachHint} />
          </div>
          <div className="relative" onClick={() => showHint(setMicHint, micTimer)}>
            <Mic size={16} className="text-slate-400 cursor-pointer hover:text-white transition-colors" />
            <ComingSoonHint visible={micHint} />
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="ml-auto bg-accent-primary border-none w-7 h-7 rounded-md flex items-center justify-center text-white cursor-pointer hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

