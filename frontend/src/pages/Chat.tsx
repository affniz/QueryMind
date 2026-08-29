import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { X, Sparkles, GripHorizontal } from 'lucide-react';
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
  const datasetFolderMap: Record<string, string> = JSON.parse(localStorage.getItem('qm_ds_folders') || '{}');
  const currentFolder = id ? (datasetFolderMap[id] ?? null) : null;
  const folderDatasetIds = datasets
    .filter(ds => (datasetFolderMap[ds.id] ?? null) === currentFolder)
    .map(ds => Number(ds.id));
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  // The SQL and results of the most recent response, displayed in the right panel.
  const [activeSql, setActiveSql] = useState<string | null>(null);
  const [activeResults, setActiveResults] = useState<any[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<string>('');
  // Keep a ref to the active SSE reader so we can cancel it if needed.
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Resizable table panel — tableHeightPx=null means "natural flex" (auto split).
  const [tableHeightPx, setTableHeightPx] = useState<number | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !resultsContainerRef.current) return;
      const containerRect = resultsContainerRef.current.getBoundingClientRect();
      // Distance from the bottom of the container to the cursor
      const newTableHeight = containerRect.bottom - ev.clientY;
      // Clamp: min 60px, max is container height minus 60px for the chart
      const clamped = Math.max(60, Math.min(containerRect.height - 60, newTableHeight));
      setTableHeightPx(clamped);
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
    setTableHeightPx(null);
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
    <div className="flex-1 flex min-w-0 gap-6 h-full">
      {/* Left: Chat Assistant */}
      <div className="w-[380px] bg-[#191e2b] rounded-xl border border-white/5 flex flex-col shrink-0 overflow-hidden min-h-0">
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

      {/* Right: Results Display */}
      <div className="flex-1 bg-[#11141d] rounded-xl border border-white/5 flex flex-col p-6 overflow-hidden min-w-0 max-w-full">
        <div className="mb-4">
          <h2 className="text-xl font-medium text-white m-0 mb-2">{activeQuestion}</h2>
          {activeSql && (
            <p className="font-mono text-[13px] text-slate-400 m-0 mb-6 leading-relaxed bg-[#191e2b] p-3 rounded-lg border border-white/5">
              {activeSql}
            </p>
          )}
        </div>

        {activeResults && activeResults.length > 0 ? (
          <div
            ref={resultsContainerRef}
            className="flex-1 bg-[#191e2b] rounded-xl border border-accent-primary/30 flex flex-col overflow-hidden min-w-0 max-w-full"
          >
            {/* Chart — takes remaining space */}
            <div className="flex-1 min-h-0 overflow-hidden p-4">
              <AutoChart data={activeResults} />
            </div>

            {/* Drag handle */}
            <div
              onMouseDown={onDragStart}
              className="flex items-center justify-center h-4 cursor-row-resize group shrink-0 border-t border-b border-white/5 bg-[#11141d] hover:bg-[#1e2435] transition-colors select-none"
              title="Drag to resize table"
            >
              <GripHorizontal size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
            </div>

            {/* Table — height controlled by drag */}
            <div
              className="overflow-auto scrollbar-custom shrink-0"
              style={{ height: tableHeightPx !== null ? `${tableHeightPx}px` : '40%' }}
            >
              <DataTable data={activeResults} />
            </div>

            <details className="mt-2 p-4 text-slate-500 text-xs border-t border-white/5 shrink-0">
              <summary className="cursor-pointer hover:text-slate-300 transition-colors w-fit">View Raw JSON</summary>
              <pre className="bg-[#11141d] p-3 rounded-md overflow-x-auto mt-2 whitespace-pre-wrap break-words border border-white/5">
                {JSON.stringify(activeResults, null, 2)}
              </pre>
            </details>
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
