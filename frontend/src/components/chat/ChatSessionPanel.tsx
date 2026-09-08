import { useState } from 'react';
import { MessageSquarePlus, Trash2, PencilLine, Check, X, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { ChatSession } from '../../types';

interface ChatSessionPanelProps {
  sessions: ChatSession[];
  activeSessionId: number | null;
  isLoading: boolean;
  onNew: () => void;
  onSelect: (session: ChatSession) => void;
  onRename: (sessionId: number, newTitle: string) => void;
  onDelete: (sessionId: number) => void;
}

export default function ChatSessionPanel({
  sessions,
  activeSessionId,
  isLoading,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: ChatSessionPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditValue(session.title);
  };

  const commitEdit = (e: React.MouseEvent | React.KeyboardEvent, sessionId: number) => {
    e.stopPropagation();
    const trimmed = editValue.trim();
    if (trimmed) onRename(sessionId, trimmed);
    setEditingId(null);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="border-t border-white/5 shrink-0">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2 text-slate-400 text-xs font-medium uppercase tracking-wider">
          <MessageSquare size={13} />
          <span>Chat History</span>
          {sessions.length > 0 && (
            <span className="bg-white/10 text-slate-300 rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {sessions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onNew(); }}
            className="text-slate-400 hover:text-accent-primary transition-colors p-1 rounded hover:bg-accent-primary/10"
            title="New chat"
          >
            <MessageSquarePlus size={14} />
          </button>
          {expanded ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronRight size={13} className="text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="pb-3 max-h-[220px] overflow-y-auto scrollbar-custom">
          {isLoading && (
            <div className="px-5 py-2 text-slate-500 text-xs">Loading...</div>
          )}

          {!isLoading && sessions.length === 0 && (
            <div className="px-5 py-2 text-slate-600 text-xs italic">No previous chats</div>
          )}

          {sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onSelect(session)}
              className={`group flex items-center gap-2 px-5 py-2 cursor-pointer transition-colors ${
                activeSessionId === session.id
                  ? 'bg-accent-primary/10 text-white'
                  : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
              }`}
            >
              {/* Title or inline edit */}
              {editingId === session.id ? (
                <input
                  autoFocus
                  className="flex-1 bg-[#11141d] border border-accent-primary/50 rounded px-2 py-0.5 text-xs text-white outline-none min-w-0"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(e, session.id);
                    if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); }
                  }}
                />
              ) : (
                <span className="flex-1 text-xs truncate" title={session.title}>
                  {session.title}
                </span>
              )}

              {/* Date stamp (hidden during edit) */}
              {editingId !== session.id && (
                <span className="text-[10px] text-slate-600 shrink-0 group-hover:hidden">
                  {formatDate(session.updated_at)}
                </span>
              )}

              {/* Action buttons — visible on hover or during edit */}
              <div
                className={`flex items-center gap-1 shrink-0 ${editingId === session.id ? 'flex' : 'hidden group-hover:flex'}`}
                onClick={e => e.stopPropagation()}
              >
                {editingId === session.id ? (
                  <>
                    <button
                      onClick={e => commitEdit(e, session.id)}
                      className="text-green-400 hover:text-green-300 p-0.5 rounded transition-colors"
                      title="Save"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
                      title="Cancel"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={e => startEdit(e, session)}
                      className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
                      title="Rename"
                    >
                      <PencilLine size={12} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(session.id); }}
                      className="text-slate-500 hover:text-red-400 p-0.5 rounded transition-colors"
                      title="Delete chat"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
