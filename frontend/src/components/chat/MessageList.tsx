import { Message } from '../../types';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-5 scrollbar-custom">
      {messages.map((msg, i) => (
        <div key={i} className={`flex w-full relative ${msg.role === 'user' ? 'justify-end' : 'justify-start gap-3'}`}>
          {msg.role === 'system' && (
            <div className="w-6 h-6 rounded-full bg-[#11141d] flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-white" />
            </div>
          )}
          <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%]`}>
            <div className={`py-3 px-4 rounded-xl text-[15px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-accent-primary text-white rounded-br-sm'
                : 'bg-[#252b3d] text-slate-200 rounded-tl-sm'
            }`}>
              {msg.content}
              {/* Blinking cursor shown while this specific message is being streamed */}
              {msg.isStreaming && (
                <span className="inline-block w-[2px] h-[1em] bg-slate-300 ml-0.5 align-middle animate-pulse" />
              )}
            </div>
            {msg.role === 'user' && <div className="mt-1.5 text-[11px] text-slate-500 font-medium">User</div>}
          </div>
        </div>
      ))}

      {/* Three-dot loader only when we haven't started streaming yet */}
      {isLoading && !messages.some(m => m.isStreaming) && (
        <div className="flex w-full justify-start gap-3 relative">
          <div className="w-6 h-6 rounded-full bg-[#11141d] flex items-center justify-center shrink-0">
            <Sparkles size={14} className="text-white" />
          </div>
          <div className="max-w-[80%] py-3 px-4 rounded-xl text-[15px] leading-relaxed bg-[#252b3d] text-slate-200 rounded-tl-sm flex items-center gap-2">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
            </span>
            <span className="text-slate-400 ml-2">Generating insights...</span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
