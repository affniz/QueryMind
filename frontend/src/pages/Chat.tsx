import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { X, Sparkles, GripHorizontal, Code2, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';
import { Dataset, HistoryEntry, Message } from '../types';
import AutoChart from '../components/chat/AutoChart';
import DataTable from '../components/chat/DataTable';
import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

const MAX_HISTORY_TURNS = 3;

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { datasets } = useOutletContext<{ activeFolder: string | null; datasets: Dataset[] }>();

  // Compute the IDs of all datasets in the same folder as the current one.
  // This is sent to the backend so the LLM only sees tables from this folder.
  const currentDataset = id ? datasets.find(ds => String(ds.id) === String(id)) : null;
  const currentFolderId = currentDataset?.folder_id ?? null;
  const folderDatasetIds = datasets
    .filter(ds => (ds.folder_id ?? null) === currentFolderId)
    .map(ds => Number(ds.id));
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  // The SQL and results of the most recent response, displayed in the right panel.
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


  // Fetch Dataset Info & Preview
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

  // Reset all panel state whenever the selected dataset changes
  useEffect(() => {
    setMessages([]);
    setActiveSql(null);
    setActiveResults([]);
    setActiveQuestion('');
    setSplitPct(50);
    setSqlExpanded(false);
  }, [id]);

  // Initialize messages and preview panel once data is ready
  useEffect(() => {
    if (datasetInfo && !isPreviewPending && previewData) {
      setMessages([{
        role: 'system',
        content: `I'm ready to answer questions about the ${datasetInfo.name} dataset.`,
        results: previewData || [],
        sql: null
      }]);
      setActiveResults(previewData || []);
      setActiveQuestion(`Data Overview: ${datasetInfo.name}`);
    }
  }, [datasetInfo, previewData, isPreviewPending]);

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
      } else if (msg.role === 'system' && msg.content && !msg.content.startsWith("I'm ready")) {
        history.push({ role: 'assistant', content: msg.content });
      }
    }
    return history.slice(-(MAX_HISTORY_TURNS * 2));
  };

  const handleSubmit = async (input: string) => {
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
        body: JSON.stringify({ question: input, history, folder_dataset_ids: folderDatasetIds }),
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
