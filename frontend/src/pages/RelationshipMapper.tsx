import { useState, useCallback, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  addEdge,
  Connection,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import api from '../utils/api';
import { Dataset } from '../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface TableNodeData {
  label: string;
  columns: string[];
  types: Record<string, string>;
}

interface Relationship {
  id: number;
  source_dataset_id: number;
  target_dataset_id: number;
  source_column: string;
  target_column: string;
}

const TableNode = ({ data }: { data: TableNodeData }) => {
  return (
    <div className="bg-[#191e2d]/95 border border-accent-primary/50 rounded-lg min-w-[220px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.5)]">
      <div className="px-3 py-2.5 bg-black/40 border-b border-white/10 font-semibold text-white rounded-t-lg cursor-grab active:cursor-grabbing">
        {data.label}
      </div>
      <div className="flex flex-col">
        {data.columns.map((col) => (
          <div key={col} className="relative px-3 py-2 flex justify-between items-center border-b border-white/[0.02] hover:bg-accent-primary/10 transition-colors">
            <Handle 
              type="target" 
              position={Position.Left} 
              id={`tgt-${col}`} 
              className="absolute top-0 left-0 w-full h-full opacity-0 z-[1] cursor-crosshair !border-none !rounded-none !transform-none"
            />
            <span className="text-[13px] text-slate-300 pointer-events-none z-[5]">{col}</span>
            <span className="text-[11px] text-slate-500 pointer-events-none z-[5]">{data.types[col] || 'string'}</span>
            <Handle 
              type="source" 
              position={Position.Right} 
              id={`src-${col}`} 
              className="absolute top-0 left-0 w-full h-full opacity-0 z-[2] cursor-crosshair !border-none !rounded-none !transform-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default function RelationshipMapper() {
  const { activeFolder, datasets: allDatasets } = useOutletContext<{ activeFolder: string | null, datasets: Dataset[] }>();
  const queryClient = useQueryClient();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const nodeTypes = useMemo(() => ({ table: TableNode }), []);

  const { data: allRelationships } = useQuery<Relationship[]>({
    queryKey: ['relationships'],
    queryFn: async () => {
      const res = await api.get('/datasets/relationships/');
      return res.data;
    }
  });

  useEffect(() => {
    const datasetFolderMap = JSON.parse(localStorage.getItem('qm_ds_folders') || '{}');
    const visibleDatasets = allDatasets.filter(ds => {
      const folder = datasetFolderMap[ds.id] || "Uncategorized";
      return folder === activeFolder;
    });

    const visibleIds = new Set(visibleDatasets.map(ds => parseInt(ds.id)));

    const initialNodes = visibleDatasets.map((ds, index) => ({
      id: `ds-${ds.id}`,
      type: 'table',
      data: { 
        label: ds.name,
        columns: Object.keys((ds as any).columns || {}),
        types: (ds as any).columns || {}
      },
      position: { x: 100 + (index % 3) * 350, y: 100 + Math.floor(index / 3) * 300 }
    }));

    const rels = allRelationships || [];
    const initialEdges = rels
      .filter(rel => visibleIds.has(rel.source_dataset_id) && visibleIds.has(rel.target_dataset_id))
      .map(rel => ({
        id: `rel-${rel.id}`,
        source: `ds-${rel.source_dataset_id}`,
        target: `ds-${rel.target_dataset_id}`,
        sourceHandle: `src-${rel.source_column}`,
        targetHandle: `tgt-${rel.target_column}`,
        animated: true,
        className: 'custom-edge',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
        markerStart: { type: MarkerType.ArrowClosed, color: '#8b5cf6' }
      }));

    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [allDatasets, allRelationships, activeFolder, setNodes, setEdges]);

  const addRelMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.post('/datasets/relationships/', {
        source_dataset_id: data.source_dataset_id,
        target_dataset_id: data.target_dataset_id,
        source_column: data.source_column,
        target_column: data.target_column
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationships'] });
    },
    onError: (err: any, variables: any) => {
      if (variables?.tempId) {
        setEdges((eds) => eds.filter(e => e.id !== variables.tempId));
      }
      toast.error("Failed to create relationship: " + (err.response?.data?.detail || err.message));
    }
  });

  const onConnect = useCallback(async (params: Connection) => {
    const srcId = params.source?.replace('ds-', '');
    const tgtId = params.target?.replace('ds-', '');
    const srcCol = params.sourceHandle?.replace('src-', '');
    const tgtCol = params.targetHandle?.replace('tgt-', '');

    if (!srcCol || !tgtCol || !srcId || !tgtId) {
      toast.error("Please connect from a specific column to another column.");
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const newEdge = {
        ...params,
        id: tempId,
        animated: true,
        className: 'custom-edge',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
        markerStart: { type: MarkerType.ArrowClosed, color: '#8b5cf6' }
    };
    setEdges((eds) => addEdge(newEdge, eds));

    addRelMutation.mutate({
      source_dataset_id: parseInt(srcId),
      target_dataset_id: parseInt(tgtId),
      source_column: srcCol,
      target_column: tgtCol,
      tempId
    });
  }, [setEdges, addRelMutation]);

  const delRelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/datasets/relationships/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationships'] });
    }
  });

  const onEdgesDelete = useCallback(async (deletedEdges: Edge[]) => {
    for (const edge of deletedEdges) {
      const relId = edge.id.replace('rel-', '');
      delRelMutation.mutate(relId);
    }
  }, [delRelMutation]);

  const autoDetectMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/datasets/relationships/auto-detect');
      return res.data;
    },
    onSuccess: (data) => {
      const datasetFolderMap = JSON.parse(localStorage.getItem('qm_ds_folders') || '{}');
      const sugs = data.filter((sug: any) => {
        const sourceFolder = datasetFolderMap[sug.source_dataset_id] || "Uncategorized";
        const targetFolder = datasetFolderMap[sug.target_dataset_id] || "Uncategorized";
        return sourceFolder === activeFolder && targetFolder === activeFolder;
      });

      if (sugs.length === 0) {
        toast.info(`No relationships could be auto-detected in the "${activeFolder}" folder.`);
      } else {
        setSuggestions(sugs);
        setShowModal(true);
      }
    },
    onError: () => toast.error("Failed to auto-detect relationships")
  });

  const handleAutoDetect = async () => {
    if (!activeFolder) {
      toast.info("Please select a folder from the sidebar first to auto-detect relationships.");
      return;
    }
    autoDetectMutation.mutate();
  };

  const approveSuggestions = async () => {
    let created = 0;
    for (let i = 0; i < suggestions.length; i++) {
      const checkbox = document.getElementById(`sug-${i}`) as HTMLInputElement;
      if (checkbox && checkbox.checked) {
        const sug = suggestions[i];
        try {
          await api.post('/datasets/relationships/', {
            source_dataset_id: sug.source_dataset_id,
            target_dataset_id: sug.target_dataset_id,
            source_column: sug.source_column,
            target_column: sug.target_column
          });
          created++;
        } catch (e) {
        }
      }
    }
    setShowModal(false);
    if (created > 0) toast.success(`Successfully created ${created} relationships!`);
    queryClient.invalidateQueries({ queryKey: ['relationships'] });
  };

  return (
    <div className="flex-1 bg-[#11141d] rounded-xl border border-white/5 flex flex-col overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
        <div>
          <h2 className="text-xl font-medium text-white m-0">Dataset Relationship Mapper</h2>
          <p className="text-sm text-slate-400 mt-1">Visually map relationships between your uploaded datasets.</p>
        </div>
        <div className="flex gap-4">
          <button 
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none bg-accent-primary text-white hover:bg-[#9333ea] hover:-translate-y-px hover:shadow-[0_4px_15px_rgba(139,92,246,0.5)] transition-all disabled:opacity-50"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['relationships'] })}
          >
            Refresh Data
          </button>
          <button 
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none bg-accent-primary text-white hover:bg-[#9333ea] hover:-translate-y-px hover:shadow-[0_4px_15px_rgba(139,92,246,0.5)] transition-all disabled:opacity-50"
            onClick={handleAutoDetect}
            disabled={autoDetectMutation.isPending}
          >
            {autoDetectMutation.isPending ? 'Detecting...' : 'Auto-Detect Relationships'}
          </button>
        </div>
      </div>
      
      <div className="flex-1 w-full relative min-h-[600px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgesDelete={onEdgesDelete}
          onConnect={onConnect}
          fitView
          className="bg-[#0b0f19]"
        >
          <Background color="#1e293b" gap={16} />
          <Controls position="bottom-right" className="!bg-[#191e2b] !border-white/10 !rounded-lg overflow-hidden [&>button]:!bg-[#191e2b] [&>button]:!border-b-white/5 [&>button:hover]:!bg-[#2d3748] [&>button>svg]:!fill-slate-400" />
          <MiniMap 
            position="bottom-left"
            nodeColor="rgba(139, 92, 246, 0.5)"
            maskColor="rgba(11, 15, 25, 0.8)"
            className="!bg-[#191e2d]"
          />
        </ReactFlow>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4">
          <div className="bg-[#11141d] p-6 rounded-xl w-full max-w-[550px] border border-white/10 shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="m-0 mb-4 text-white text-xl">Approve Relationships</h3>
            <p className="text-slate-400 text-sm mb-4">Review the automatically detected foreign keys. Uncheck any you do not wish to create.</p>
            <div className="max-h-[300px] overflow-y-auto mb-6 pr-2 scrollbar-custom">
              {suggestions.map((sug, idx) => (
                <div key={idx} className="p-3 border-b border-white/5 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked id={`sug-${idx}`} className="accent-accent-primary w-4 h-4 cursor-pointer" />
                    <span className="text-slate-200 text-sm">
                      <strong className="text-white">{sug.source_dataset_name}</strong>.{sug.source_column}
                      <span className="text-accent-primary mx-2">→</span>
                      <strong className="text-white">{sug.target_dataset_name}</strong>.{sug.target_column}
                    </span>
                  </div>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${sug.confidence === 'high' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {sug.confidence.toUpperCase()} CONFIDENCE
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-white/5">
              <button 
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border border-dashed border-accent-primary text-accent-primary bg-transparent hover:bg-accent-primary/10 transition-colors"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
                onClick={approveSuggestions}
              >
                Approve Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
