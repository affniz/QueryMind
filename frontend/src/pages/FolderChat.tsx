import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { X, Sparkles, GripHorizontal, Database } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { Dataset, HistoryEntry, Message, ChatSession } from '../types';
import AutoChart from '../components/chat/AutoChart';
import DataTable from '../components/chat/DataTable';
import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';
import ChatSessionPanel from '../components/chat/ChatSessionPanel';
import ExportButton from '../components/chat/ExportButton';
import { useChatSessions } from '../hooks/useChatSessions';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';
const MAX_HISTORY_TURNS = 3;

function getUserIdFromToken(): number | null {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.id === 'number' ? payload.id : null;
  } catch { return null; }
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

export default function FolderChat() {
  const { folderId } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { datasets } = useOutletContext<{ activeFolder: string | null; datasets: Dataset[] }>();

  // Folder resolution state — must be declared before folderDatasets
  const [folderDbId, setFolderDbId] = useState<number | null>(null);
  const [folderName, setFolderName] = useState<string>(folderId ?? 'Folder');
  const [folderLoading, setFolderLoading] = useState(true);

  // Datasets that belong to this folder — resolved from server data via folderDbId
  const folderDatasets = folderDbId
    ? datasets.filter(ds => ds.folder_id === folderDbId)
    : [];

  // ── Messages & panel state ───────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([{ role: 'system', content: 'Loading folder…', results: [], sql: null }]);
  const [isAsking, setIsAsking] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSql, setActiveSql] = useState<string | null>(null);
  const [activeResults, setActiveResults] = useState<any[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<string>('');
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Resizable table panel
  const [tableHeightPx, setTableHeightPx] = useState<number | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !resultsContainerRef.current) return;
      const rect = resultsContainerRef.current.getBoundingClientRect();
      setTableHeightPx(Math.max(60, Math.min(rect.height - 60, rect.bottom - ev.clientY)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  // ── Chat sessions ────────────────────────────────────────────────────────
  const scope = folderDbId ? { type: 'folder' as const, id: String(folderDbId) } : undefined;
  const { sessions, isLoadingSessions, createSession, renameSession, deleteSession } = useChatSessions(scope);

  // ── Export filename ──────────────────────────────────────────────────────
  const userId = getUserIdFromToken();
  const exportFilename = `u${userId ?? 'x'}_folder_${toSlug(folderName)}_results`;

  // Resolve folder DB id from name
  useEffect(() => {
    if (!folderId) { setFolderLoading(false); return; }
    setFolderLoading(true);
    api.get('/folders/').then(res => {
      const found = res.data.find((f: any) => f.name === folderId);
      if (found) {
        setFolderDbId(found.id);
        setFolderName(found.name);
      }
    }).catch(() => {}).finally(() => {
      setFolderLoading(false);
    });
  }, [folderId]);

  // ── Reset immediately when folder route changes ───────────────────────────
  useEffect(() => {
    setFolderDbId(null);
    setFolderLoading(true);
    setMessages([{ role: 'system', content: 'Loading folder…', results: [], sql: null }]);
    setActiveResults([]);
    setActiveSql(null);
    setActiveQuestion('');
    setActiveSessionId(null);
    setTableHeightPx(null);
  }, [folderId]);

  // ── Update welcome message once folder & datasets are resolved ────────────
  useEffect(() => {
    if (folderLoading || !folderDbId) return;
    const count = datasets.filter(ds => ds.folder_id === folderDbId).length;
    setMessages([{
      role: 'system',
      content: `I'm ready to answer questions across all ${count} table${count !== 1 ? 's' : ''} in "${folderName}". Ask me anything — I can JOIN across tables.`,
      results: [],
      sql: null,
    }]);
  }, [folderDbId, folderLoading]);

  // ── Load session ─────────────────────────────────────────────────────────
  const loadSession = async (session: ChatSession) => {
    setActiveSessionId(session.id);
    setActiveSql(null);
    setActiveResults([]);
    setActiveQuestion('');
    try {
      const res = await api.get(`/chats/${session.id}`);
      const detail = res.data;
      const restored: Message[] = (detail.messages ?? []).map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'system',
        content: m.content,
        sql: m.sql ?? null,
        results: m.results ?? [],
      }));
      const lastAssistant = [...restored].reverse().find(m => m.role === 'system' && m.results?.length);
      if (lastAssistant) {
        setActiveResults(lastAssistant.results ?? []);
        setActiveSql(lastAssistant.sql ?? null);
        const lastUser = [...restored].reverse().find(m => m.role === 'user');
        setActiveQuestion(lastUser?.content ?? session.title);
      }
      setMessages(restored.length > 0 ? restored : [{
        role: 'system',
        content: `Resumed "${session.title}". Ask me anything.`,
        results: [],
        sql: null,
      }]);
    } catch {
      setMessages([{
        role: 'system',
        content: `Resumed "${session.title}". Ask me anything.`,
        results: [],
        sql: null,
      }]);
    }
  };

  const handleNewChat = async (firstQuestion?: string) => {
    if (!folderDbId) return null;
    const title = firstQuestion
      ? firstQuestion.slice(0, 80)
      : `Chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const session = await createSession(title);
    setActiveSessionId(session.id);
    return session.id;
  };

  const buildHistory = (currentMessages: Message[]): HistoryEntry[] => {
    const history: HistoryEntry[] = [];
    for (const msg of currentMessages) {
      if (msg.role === 'user') history.push({ role: 'user', content: msg.content });
      else if (msg.role === 'system' && msg.content && !msg.content.startsWith("I'm ready") && !msg.content.startsWith('Resumed'))
        history.push({ role: 'assistant', content: msg.content });
    }
    return history.slice(-(MAX_HISTORY_TURNS * 2));
  };

  const handleSubmit = async (input: string) => {
    let sessionId = activeSessionId;
    if (sessionId === null) sessionId = await handleNewChat(input);

    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setIsAsking(true);
    setActiveQuestion(input);
    setActiveSql(null);
    setMessages(prev => [...prev, { role: 'system', content: '', isStreaming: true, sql: null, results: [] }]);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/datasets/folder/${folderDbId}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: input, history: buildHistory(messages), session_id: sessionId }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'system', content: `Sorry, I couldn't process that. ${errorData.detail || ''}`, isStreaming: false };
          return updated;
        });
        return;
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const rawData = line.slice(6).trim();
          if (!rawData) continue;
          const eventLine = lines[lines.indexOf(line) - 1] ?? '';
          const eventType = eventLine.startsWith('event: ') ? eventLine.slice(7).trim() : 'token';
          try {
            const payload = JSON.parse(rawData);
            if (eventType === 'sql') {
              setActiveSql(payload);
              setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], sql: payload }; return u; });
            } else if (eventType === 'token') {
              setMessages(prev => { const u = [...prev]; const l = u[u.length - 1]; u[u.length - 1] = { ...l, content: l.content + payload }; return u; });
            } else if (eventType === 'done') {
              setActiveResults(payload.results ?? []);
              setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], isStreaming: false, results: payload.results ?? [] }; return u; });
              queryClient.invalidateQueries({ queryKey: ['chat-sessions', 'folder', String(folderDbId)] });
            } else if (eventType === 'error') {
              setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'system', content: `Error: ${payload}`, isStreaming: false }; return u; });
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'system', content: `Error: ${err.message ?? ''}`, isStreaming: false }; return u; });
    } finally {
      setIsAsking(false);
      readerRef.current = null;
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    await deleteSession(sessionId);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([{
        role: 'system',
        content: `I'm ready to answer questions across all tables in "${folderName}".`,
        results: [], sql: null,
      }]);
      setActiveResults([]);
    }
  };

  const handleNewChatButton = () => {
    setActiveSessionId(null);
    setMessages([{
      role: 'system',
      content: `I'm ready to answer questions across all ${folderDatasets.length} table${folderDatasets.length !== 1 ? 's' : ''} in "${folderName}". Ask me anything — I can JOIN across tables.`,
      results: [], sql: null,
    }]);
    setActiveResults([]);
    setActiveSql(null);
    setActiveQuestion('');
  };

  return (
    <div className="flex-1 flex min-w-0 gap-6 h-full">
      {/* Left: Chat */}
      <div className="w-[380px] bg-[#191e2b] rounded-xl border border-white/5 flex flex-col shrink-0 overflow-hidden min-h-0">
        <div className="flex items-center justify-between py-4 px-5 border-b border-white/5 bg-[#11141d]">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-slate-400" />
            <div>
              <h3 className="text-white font-medium m-0 leading-tight">{folderName}</h3>
              <p className="text-slate-500 text-[11px] m-0">Folder chat</p>
            </div>
          </div>
          <div className="cursor-pointer hover:text-white text-slate-400 transition-colors" onClick={() => navigate('/')} title="Close">
            <X size={16} />
          </div>
        </div>

        {/* Table chips */}
        {folderDatasets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-white/5 bg-[#11141d]/50">
            {folderDatasets.map(ds => (
              <span key={ds.id} className="flex items-center gap-1 text-[11px] text-slate-400 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                <Database size={10} />
                {ds.name}
              </span>
            ))}
          </div>
        )}

        <MessageList messages={messages} isLoading={isAsking} />
        <ChatInput onSubmit={handleSubmit} isLoading={isAsking || folderLoading} />
        <ChatSessionPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          isLoading={isLoadingSessions}
          onNew={handleNewChatButton}
          onSelect={loadSession}
          onRename={(sessionId, title) => renameSession({ sessionId, title })}
          onDelete={handleDeleteSession}
        />
      </div>

      {/* Right: Results */}
      <div className="flex-1 bg-[#11141d] rounded-xl border border-white/5 flex flex-col p-6 overflow-hidden min-w-0 max-w-full">
        <div className="mb-4">
          <h2 className="text-xl font-medium text-white m-0 mb-2">{activeQuestion}</h2>
          {activeSql && (
            <p className="font-mono text-[13px] text-slate-400 m-0 mb-6 leading-relaxed bg-[#191e2b] p-3 rounded-lg border border-white/5">
              {activeSql}
            </p>
          )}
        </div>

        {activeResults?.length > 0 ? (
          <div ref={resultsContainerRef} className="flex-1 bg-[#191e2b] rounded-xl border border-accent-primary/30 flex flex-col overflow-hidden min-w-0 max-w-full">
            <div className="flex-1 min-h-0 overflow-hidden p-4">
              <AutoChart data={activeResults} />
            </div>
            <div onMouseDown={onDragStart} className="flex items-center justify-center h-4 cursor-row-resize group shrink-0 border-t border-b border-white/5 bg-[#11141d] hover:bg-[#1e2435] transition-colors select-none" title="Drag to resize">
              <GripHorizontal size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
            </div>
            <div className="overflow-auto scrollbar-custom shrink-0" style={{ height: tableHeightPx !== null ? `${tableHeightPx}px` : '200px' }}>
              <DataTable data={activeResults} />
            </div>
            <div className="flex items-center justify-between mt-2 p-4 border-t border-white/5 shrink-0 gap-4">
              <details className="text-slate-500 text-xs flex-1 min-w-0">
                <summary className="cursor-pointer hover:text-slate-300 transition-colors w-fit">View Raw JSON</summary>
                <pre className="bg-[#11141d] p-3 rounded-md overflow-x-auto mt-2 whitespace-pre-wrap break-words border border-white/5">
                  {JSON.stringify(activeResults, null, 2)}
                </pre>
              </details>
              <ExportButton data={activeResults} defaultFilename={exportFilename} />
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-[#191e2b] rounded-xl border border-white/5 gap-3">
            <Sparkles size={32} className="text-slate-700" />
            <p className="text-sm">Ask a question to query across all tables in this folder</p>
          </div>
        )}
      </div>
    </div>
  );
}
