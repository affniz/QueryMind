import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { X, Sparkles, GripHorizontal, Code2, ChevronDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

/** Number of past conversation turns (user+assistant pairs) sent to the LLM. */
const MAX_HISTORY_TURNS = 3;

/** Decode the numeric user ID from the JWT stored in localStorage. Returns null if unavailable. */
function getUserIdFromToken(): number | null {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.id === 'number' ? payload.id : null;
  } catch {
    return null;
  }
}

/** Slugify a string for use as a filename stem. */
function toSlug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { datasets } = useOutletContext<{ activeFolder: string | null; datasets: Dataset[] }>();

  // Compute the IDs of all datasets in the same folder as the current one.
  // This is sent to the backend so the LLM only sees tables from this folder.
  const currentDataset = id ? datasets.find(ds => String(ds.id) === String(id)) : null;
  const currentFolderId = currentDataset?.folder_id ?? null;
  const folderDatasetIds = datasets
    .filter(ds => (ds.folder_id ?? null) === currentFolderId)
    .map(ds => Number(ds.id));

  // ── Chat messages state ─────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  // ── Active session ──────────────────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  // ── Results panel state ─────────────────────────────────────────────────
  const [activeSql, setActiveSql] = useState<string | null>(null);
  const [activeResults, setActiveResults] = useState<any[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<string>('');

  // Keep a ref to the active SSE reader so we can cancel it if needed.
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // SQL query collapsed by default — toggle to expand
  const [sqlExpanded, setSqlExpanded] = useState(false);

  // ── Chat / Results outer split ─────────────────────────────────────────────
  // Chat panel width as a percentage of the combined area (default ~28%)
  const [chatPct, setChatPct] = useState(28);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const isOuterDragging = useRef(false);

  const onOuterDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isOuterDragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isOuterDragging.current || !outerContainerRef.current) return;
      const rect = outerContainerRef.current.getBoundingClientRect();
      const rawPct = ((ev.clientX - rect.left) / rect.width) * 100;
      // Clamp: chat panel min 18%, max 50%
      setChatPct(Math.max(18, Math.min(50, rawPct)));
    };

    const onMouseUp = () => {
      isOuterDragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  // ── Chart / Table inner split ──────────────────────────────────────────────
  // Left chart panel width as a percentage (default 50%)
  const [splitPct, setSplitPct] = useState(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const rawPct = ((ev.clientX - rect.left) / rect.width) * 100;
      // Clamp between 20% and 80% so neither panel disappears
      setSplitPct(Math.max(20, Math.min(80, rawPct)));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);


  // ── Fetch Dataset Info & Preview ────────────────────────────────────────
  const { data: datasetInfo, isLoading: isDatasetLoading } = useQuery<Dataset>({
    queryKey: ['dataset', id],
    queryFn: async () => {
      const res = await api.get(`/datasets/${id}`);
      return res.data;
    }
  });

  const { data: previewData, isPending: isPreviewPending } = useQuery({
    queryKey: ['dataset-preview', id],
    queryFn: async () => {
      const res = await api.get(`/datasets/${id}/preview?limit=10`);
      return res.data.rows;
    }
  });

  // ── Chat session hooks ──────────────────────────────────────────────────
  const { sessions, isLoadingSessions, createSession, renameSession, deleteSession } =
    useChatSessions(id ? { type: 'dataset', id } : undefined);

  // ── Export filename ─────────────────────────────────────────────────────
  const userId = getUserIdFromToken();
  const exportFilename = datasetInfo
    ? `u${userId ?? 'x'}_d${id}_${toSlug(datasetInfo.name)}`
    : `u${userId ?? 'x'}_d${id}_results`;

  // ── Reset state when the dataset changes ────────────────────────────────
  useEffect(() => {
    setMessages([]);
    setActiveSql(null);
    setActiveResults([]);
    setActiveQuestion('');
    setSplitPct(50);
    setSqlExpanded(false);
    setActiveSessionId(null);
  }, [id]);

  // ── Initialize messages and preview panel once data is ready ────────────
  useEffect(() => {
    if (datasetInfo && !isPreviewPending && previewData && activeSessionId === null) {
      setMessages([{
        role: 'system',
        content: `I'm ready to answer questions about the ${datasetInfo.name} dataset.`,
        results: previewData || [],
        sql: null
      }]);
      setActiveResults(previewData || []);
      setActiveQuestion(`Data Overview: ${datasetInfo.name}`);
    }
  }, [datasetInfo, previewData, isPreviewPending, activeSessionId]);

  // ── Load a session (restore its messages) ──────────────────────────────
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

      // Set the results panel to the last assistant message that has data
      const lastAssistant = [...restored].reverse().find(m => m.role === 'system' && m.results?.length);
      if (lastAssistant) {
        setActiveResults(lastAssistant.results ?? []);
        setActiveSql(lastAssistant.sql ?? null);
        const lastUser = [...restored].reverse().find(m => m.role === 'user');
        setActiveQuestion(lastUser?.content ?? session.title);
      }

      setMessages(restored.length > 0 ? restored : [{
        role: 'system',
        content: `Resumed session: "${session.title}". Ask me anything about this dataset.`,
        results: [],
        sql: null,
      }]);
    } catch {
      setMessages([{
        role: 'system',
        content: `Resumed session: "${session.title}". Ask me anything about this dataset.`,
        results: [],
        sql: null,
      }]);
    }
  };

  // ── Start a new chat session ────────────────────────────────────────────
  const handleNewChat = async (firstQuestion?: string) => {
    const title = firstQuestion
      ? firstQuestion.slice(0, 80)
      : `Chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const session = await createSession(title);
    setActiveSessionId(session.id);
    return session.id;
  };

  /**
   * Build the history array from the current messages state.
   * Converts user/system message pairs into {role, content} HistoryEntry objects
   * and caps at MAX_HISTORY_TURNS.
   */
  const buildHistory = (currentMessages: Message[]): HistoryEntry[] => {
    const history: HistoryEntry[] = [];
    for (const msg of currentMessages) {
      if (msg.role === 'user') {
        history.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'system' && msg.content && !msg.content.startsWith("I'm ready") && !msg.content.startsWith('Resumed')) {
        history.push({ role: 'assistant', content: msg.content });
      }
    }
    return history.slice(-(MAX_HISTORY_TURNS * 2));
  };

  const handleSubmit = async (input: string) => {
    // On the very first question of a session-less chat, create the session now
    let sessionId = activeSessionId;
    if (sessionId === null) {
      sessionId = await handleNewChat(input);
    }

    const userMessage: Message = { role: 'user', content: input };
    const history = buildHistory(messages);

    setMessages(prev => [...prev, userMessage]);
    setIsAsking(true);
    setActiveQuestion(input);
    setActiveSql(null);
    setSqlExpanded(false);

    // Add a placeholder streaming message that we'll update in-place
    const streamingPlaceholder: Message = {
      role: 'system',
      content: '',
      isStreaming: true,
      sql: null,
      results: [],
    };
    setMessages(prev => [...prev, streamingPlaceholder]);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/datasets/${id}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question: input,
          history,
          folder_dataset_ids: folderDatasetIds,
          session_id: sessionId,
        }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'system',
            content: `Sorry, I couldn't process that query. ${errorData.detail || ''}`,
            isStreaming: false,
          };
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
          if (line.startsWith('event: ')) {
            // events are followed by a data line; handled below
          } else if (line.startsWith('data: ')) {
            const rawData = line.slice(6).trim();
            if (!rawData) continue;

            // Peek at the preceding event line from the raw buffer
            const eventLine = lines[lines.indexOf(line) - 1] ?? '';
            const eventType = eventLine.startsWith('event: ')
              ? eventLine.slice(7).trim()
              : 'token';

            try {
              const payload = JSON.parse(rawData);

              if (eventType === 'sql') {
                setActiveSql(payload);
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    sql: payload,
                  };
                  return updated;
                });
              } else if (eventType === 'token') {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + payload,
                  };
                  return updated;
                });
              } else if (eventType === 'done') {
                setActiveResults(payload.results ?? []);
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    isStreaming: false,
                    results: payload.results ?? [],
                  };
                  return updated;
                });
                // Refresh session list so updated_at re-sorts
                queryClient.invalidateQueries({ queryKey: ['chat-sessions', id] });
              } else if (eventType === 'error') {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'system',
                    content: `Sorry, an error occurred while generating the answer: ${payload}`,
                    isStreaming: false,
                  };
                  return updated;
                });
              }
            } catch {
              // Non-JSON data line — skip
            }
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'system',
          content: `Sorry, I couldn't process that query. ${err.message ?? ''}`,
          isStreaming: false,
        };
        return updated;
      });
    } finally {
      setIsAsking(false);
      readerRef.current = null;
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    await deleteSession(sessionId);
    if (activeSessionId === sessionId) {
      // Reset to the fresh "no session" view
      setActiveSessionId(null);
      if (datasetInfo && previewData) {
        setMessages([{
          role: 'system',
          content: `I'm ready to answer questions about the ${datasetInfo.name} dataset.`,
          results: previewData || [],
          sql: null,
        }]);
        setActiveResults(previewData || []);
        setActiveQuestion(`Data Overview: ${datasetInfo.name}`);
      } else {
        setMessages([]);
        setActiveResults([]);
      }
    }
  };

  const handleSelectSession = (session: ChatSession) => {
    loadSession(session);
  };

  const handleNewChatButton = async () => {
    setActiveSessionId(null);
    if (datasetInfo && previewData) {
      setMessages([{
        role: 'system',
        content: `I'm ready to answer questions about the ${datasetInfo.name} dataset.`,
        results: previewData || [],
        sql: null,
      }]);
      setActiveResults(previewData || []);
      setActiveQuestion(`Data Overview: ${datasetInfo.name}`);
    } else {
      setMessages([]);
      setActiveResults([]);
      setActiveQuestion('');
    }
  };

  return (
    <div ref={outerContainerRef} className="flex-1 flex min-w-0 h-full overflow-hidden">
      {/* Left: Chat Assistant */}
      <div
        className="bg-[#191e2b] rounded-xl border border-white/5 flex flex-col shrink-0 overflow-hidden min-h-0"
        style={{ width: `${chatPct}%` }}
      >
        <div className="flex items-center justify-between py-4 px-5 border-b border-white/5 bg-[#11141d]">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-slate-400" />
            <h3 className="text-white font-medium m-0">Data Assistant</h3>
          </div>
          <div className="flex gap-2 text-slate-400">
            <div className="cursor-pointer hover:text-white transition-colors" onClick={() => navigate('/')} title="Close Chat">
              <X size={16} />
            </div>
          </div>
        </div>

        {isDatasetLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">Loading...</div>
        ) : (
          <>
            <MessageList messages={messages} isLoading={isAsking} />
            <ChatInput onSubmit={handleSubmit} isLoading={isAsking} />
            <ChatSessionPanel
              sessions={sessions}
              activeSessionId={activeSessionId}
              isLoading={isLoadingSessions}
              onNew={handleNewChatButton}
              onSelect={handleSelectSession}
              onRename={(sessionId, title) => renameSession({ sessionId, title })}
              onDelete={handleDeleteSession}
            />
          </>
        )}
      </div>

      {/* Outer vertical drag handle */}
      <div
        onMouseDown={onOuterDragStart}
        className="flex items-center justify-center w-4 cursor-col-resize group shrink-0 hover:bg-white/[0.03] transition-colors select-none"
        title="Drag to resize panels"
      >
        <div className="w-[3px] h-8 rounded-full bg-white/10 group-hover:bg-accent-primary/60 transition-colors" />
      </div>

      {/* Right: Results Display */}
      <div className="flex-1 bg-[#11141d] rounded-xl border border-white/5 flex flex-col p-6 overflow-hidden min-w-0 max-w-full">

        {/* Header: question title + SQL toggle */}
        <div className="mb-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-medium text-white m-0 leading-snug">{activeQuestion}</h2>
            {activeSql && (
              <button
                onClick={() => setSqlExpanded(prev => !prev)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-[#191e2b] border border-white/5 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                title={sqlExpanded ? 'Hide SQL' : 'Show SQL'}
              >
                <Code2 size={12} />
                SQL
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${sqlExpanded ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>

          {/* Collapsible SQL block */}
          {activeSql && sqlExpanded && (
            <div className="mt-3 font-mono text-[13px] text-slate-400 leading-relaxed bg-[#191e2b] p-3 rounded-lg border border-white/5 overflow-x-auto">
              {activeSql}
            </div>
          )}
        </div>

        {activeResults && activeResults.length > 0 ? (
          /* Horizontal split container */
          <div
            ref={splitContainerRef}
            className="flex-1 flex overflow-hidden rounded-xl border border-accent-primary/30 min-h-0"
          >
            {/* Left: Chart */}
            <div
              className="flex flex-col overflow-hidden bg-[#191e2b] min-w-0"
              style={{ width: `${splitPct}%` }}
            >
              <div className="flex items-center px-4 py-2.5 border-b border-white/5 shrink-0">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Chart</span>
              </div>
              <div className="flex-1 min-h-0 p-4">
                <AutoChart data={activeResults} />
              </div>
            </div>

            {/* Vertical drag handle */}
            <div
              onMouseDown={onDragStart}
              className="flex items-center justify-center w-3 cursor-col-resize group shrink-0 border-l border-r border-white/5 bg-[#11141d] hover:bg-[#1e2435] transition-colors select-none"
              title="Drag to resize"
            >
              <GripHorizontal size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors rotate-90" />
            </div>

            {/* Right: Table */}
            <div
              className="flex flex-col overflow-hidden bg-[#191e2b] min-w-0"
              style={{ width: `${100 - splitPct}%` }}
            >
              <div className="flex items-center px-4 py-2.5 border-b border-white/5 shrink-0">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Table</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <DataTable data={activeResults} />
              </div>
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
          <div className="h-full flex items-center justify-center text-slate-500 bg-[#191e2b] rounded-xl border border-white/5">
            No data to display.
          </div>
        )}
      </div>
    </div>
  );
}
