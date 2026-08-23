import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';
import { Dataset } from '../types';

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: async (): Promise<Dataset[]> => {
      const res = await api.get('/datasets?skip=0&limit=100');
      return res.data;
    },
  });
}
