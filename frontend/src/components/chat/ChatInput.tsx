import { Paperclip, Mic, Send } from 'lucide-react';
import { useState } from 'react';

interface ChatInputProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
}

export default function ChatInput({ onSubmit, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');

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
          <Paperclip size={16} className="text-slate-400 cursor-pointer hover:text-white transition-colors" />
          <Mic size={16} className="text-slate-400 cursor-pointer hover:text-white transition-colors" />
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
