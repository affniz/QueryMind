import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { ChatSession } from '../types';

type SessionScope =
  | { type: 'dataset'; id: string }
  | { type: 'folder'; id: string };

/**
 * React Query hooks for chat session CRUD.
 * Works for both dataset-scoped and folder-scoped sessions.
 */
export function useChatSessions(scope: SessionScope | undefined) {
  const queryClient = useQueryClient();
  const queryKey = scope ? ['chat-sessions', scope.type, scope.id] : ['chat-sessions-none'];

  const listUrl = scope
    ? scope.type === 'dataset'
      ? `/datasets/${scope.id}/chats`
      : `/folders/${scope.id}/chats`
    : null;

  const createUrl = listUrl;

  // ── List sessions ───────────────────────────────────────────────────────
  const { data: sessions = [], isLoading: isLoadingSessions } = useQuery<ChatSession[]>({
    queryKey,
    queryFn: async () => {
      const res = await api.get(listUrl!);
      return res.data;
    },
    enabled: !!listUrl,
  });

  // ── Create ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await api.post(createUrl!, { title });
      return res.data as ChatSession;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  // ── Rename ──────────────────────────────────────────────────────────────
  const renameMutation = useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: number; title: string }) => {
      const res = await api.patch(`/chats/${sessionId}`, { title });
      return res.data as ChatSession;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  // ── Delete ──────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      await api.delete(`/chats/${sessionId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    sessions,
    isLoadingSessions,
    createSession: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    renameSession: renameMutation.mutateAsync,
    deleteSession: deleteMutation.mutateAsync,
  };
}
