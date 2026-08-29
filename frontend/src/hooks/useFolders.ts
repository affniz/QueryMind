import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { Folder } from '../types';

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: async (): Promise<Folder[]> => {
      const res = await api.get('/folders');
      return res.data;
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<Folder> => {
      const res = await api.post('/folders', { name });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (folderId: number) => {
      await api.delete('/folders/' + folderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      // Datasets that were in this folder now have folder_id=null — re-fetch them too
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    },
  });
}

export function useMoveDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ datasetId, folderId }: { datasetId: string; folderId: number | null }) => {
      const res = await api.patch('/datasets/' + datasetId + '/folder', { folder_id: folderId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    },
  });
}
