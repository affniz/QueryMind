export interface User {
  email: string;
  sub: string;
}

export interface Folder {
  id: number;
  name: string;
  created_at: string;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at?: string;
  folder_id?: number | null;
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface Message {
  role: 'user' | 'system';
  content: string;
  results?: any[];
  sql?: string | null;
  /** True while this message is being streamed in real-time. */
  isStreaming?: boolean;
}

export interface AskResponse {
  answer: string;
  results?: any[];
  sql_query?: string | null;
}
