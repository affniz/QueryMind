import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Database, Folder, FolderOpen, Upload, Plus, ChevronRight, ChevronDown, Search, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useDialog } from '../context/DialogContext';
import { Dataset } from '../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useFolders, useCreateFolder, useDeleteFolder, useMoveDataset } from '../hooks/useFolders';

interface SidebarProps {
  activeFolder: string | null;
  setActiveFolder: (folder: string | null) => void;
  datasets: Dataset[];
}

export default function Sidebar({ activeFolder, setActiveFolder, datasets }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { showConfirm, showPrompt, showChoice } = useDialog();
  const queryClient = useQueryClient();

  // ── Server-backed folder data ──────────────────────────────────────────────
  const { data: folders = [] } = useFolders();
  const createFolderMutation = useCreateFolder();
  const deleteFolderMutation = useDeleteFolder();
  const moveMutation = useMoveDataset();

  // ── Dataset delete ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete('/datasets/' + id);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success("Dataset deleted successfully");
      if (location.pathname === '/dataset/' + id) {
        navigate('/');
      }
    },
    onError: () => {
      toast.error("Failed to delete dataset.");
    }
  });

  // ── Upload ─────────────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async ({ formData, folderId }: { formData: FormData; folderId: number | null }) => {
      const res = await api.post('/datasets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return { data: res.data, folderId };
    },
    onSuccess: async ({ data, folderId }) => {
      if (folderId !== null) {
        // Move newly uploaded dataset into the target folder immediately
        await api.patch('/datasets/' + data.id + '/folder', { folder_id: folderId });
      }
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success("Dataset uploaded successfully");
      if (folderId !== null) {
        const folder = folders.find(f => f.id === folderId);
        if (folder) setActiveFolder(folder.name);
      }
    },
    onError: () => {
      toast.error("Failed to upload dataset.");
    }
  });

  const deleteDataset = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const confirmed = await showConfirm("Are you sure you want to delete this dataset? This cannot be undone.");
    if (!confirmed) return;
    deleteMutation.mutate(id);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, folderId: number | null = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    uploadMutation.mutate({ formData, folderId });
  };

  const createFolder = async () => {
    const name = await showPrompt("Enter folder name:");
    if (!name) return;
    createFolderMutation.mutate(name, {
      onSuccess: (created) => {
        setActiveFolder(created.name);
        toast.success('Folder "' + created.name + '" created.');
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.detail || "Failed to create folder.");
      }
    });
  };

  const deleteFolder = async (e: React.MouseEvent, folderId: number, folderName: string) => {
    e.stopPropagation();

    const choice = await showChoice(
      'What would you like to do with the datasets inside "' + folderName + '"?',
      [
        { label: '🗑 Delete folder and all its datasets', value: 'delete', danger: true },
        { label: '📂 Delete folder only — move datasets to Uncategorized', value: 'move' },
      ]
    );
    if (!choice) return;

    if (choice === 'delete') {
      // Delete every dataset in the folder, then the folder itself
      const datasetsInFolder = datasets.filter(ds => ds.folder_id === folderId);
      await Promise.all(datasetsInFolder.map(ds => api.delete('/datasets/' + ds.id)));
    }

    deleteFolderMutation.mutate(folderId, {
      onSuccess: () => {
        toast.success('Folder "' + folderName + '" deleted.');
        if (activeFolder === folderName) setActiveFolder(null);
      },
      onError: () => {
        toast.error("Failed to delete folder.");
      }
    });
  };

  const toggleFolder = (folderName: string) => {
    setActiveFolder(activeFolder === folderName ? null : folderName);
  };

  const moveDatasetToFolder = (datasetId: string, folderId: number | null) => {
    moveMutation.mutate({ datasetId, folderId }, {
      onError: () => toast.error("Failed to move dataset."),
    });
  };

  // ── Build grouped view ─────────────────────────────────────────────────────
  // Map folder id → folder name for quick lookup
  const folderMap = new Map(folders.map(f => [f.id, f.name]));

  const groupedDatasets: Record<string, Dataset[]> = { "Uncategorized": [] };
  folders.forEach(f => groupedDatasets[f.name] = []);

  datasets.forEach(ds => {
    const folderName = ds.folder_id != null ? (folderMap.get(ds.folder_id) ?? "Uncategorized") : "Uncategorized";
    if (groupedDatasets[folderName] !== undefined) {
      groupedDatasets[folderName].push(ds);
    } else {
      groupedDatasets["Uncategorized"].push(ds);
    }
  });

  const lowerQuery = searchQuery.toLowerCase();
  const displayGroups: Record<string, Dataset[]> = {};

  folders.forEach(folder => {
    const folderMatches = searchQuery === '' || folder.name.toLowerCase().includes(lowerQuery);
    if (folderMatches) {
      displayGroups[folder.name] = groupedDatasets[folder.name];
    } else {
      const matchingDatasets = groupedDatasets[folder.name].filter(ds => ds.name.toLowerCase().includes(lowerQuery));
      if (matchingDatasets.length > 0) {
        displayGroups[folder.name] = matchingDatasets;
      }
    }
  });

  const uncatMatches = searchQuery === '' || "uncategorized".includes(lowerQuery);
  if (uncatMatches) {
    displayGroups["Uncategorized"] = groupedDatasets["Uncategorized"];
  } else {
    const matchingUncat = groupedDatasets["Uncategorized"].filter(ds => ds.name.toLowerCase().includes(lowerQuery));
    if (matchingUncat.length > 0) {
      displayGroups["Uncategorized"] = matchingUncat;
    }
  }

  // ── Collapsed icon rail ────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="w-[52px] bg-[#191e2b] rounded-xl border border-white/5 flex flex-col items-center py-4 gap-3 shrink-0 transition-all duration-200">
        {/* Expand toggle */}
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>

        {/* Upload shortcut */}
        <label
          className="p-2 rounded-lg text-slate-400 hover:text-accent-primary hover:bg-accent-primary/10 transition-colors cursor-pointer"
          title="Upload CSV"
        >
          <Upload size={16} />
          <input type="file" accept=".csv" className="hidden" onChange={handleUpload} style={{ display: 'none' }} />
        </label>



      </aside>
    );
  }


  return (
    <aside className="w-[260px] bg-[#191e2b] rounded-xl border border-white/5 flex flex-col p-5 shrink-0 transition-all duration-200">
      {/* Header row: title + collapse toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="m-0 text-white font-semibold text-base">Datasets & Chats</h4>
          <span className="text-slate-500 text-xs">Select a dataset to ask questions</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="bg-[#11141d] rounded-lg border border-white/10 flex items-center px-3 py-2 gap-2 mb-6">
        <Search size={16} className="text-slate-500" />
        <input
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="bg-transparent border-none text-white outline-none w-full text-sm placeholder:text-slate-500"
        />
      </div>

      <div className="flex flex-col gap-3 mb-6">
        <button onClick={createFolder} className="w-full flex items-center justify-center gap-2 p-[0.6rem] rounded-lg text-sm font-medium cursor-pointer border border-dashed border-accent-primary text-accent-primary bg-transparent hover:bg-accent-primary/10 hover:shadow-[0_4px_15px_rgba(139,92,246,0.2)] transition-all">
          <Plus size={16} /> New Folder
        </button>
        <label className={`w-full flex items-center justify-center gap-2 p-[0.6rem] rounded-lg text-sm font-medium cursor-pointer border-none bg-accent-primary text-white hover:bg-[#9333ea] hover:-translate-y-[2px] hover:shadow-[0_4px_15px_rgba(139,92,246,0.5)] transition-all ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload size={16} /> {uploadMutation.isPending ? 'Uploading...' : 'Upload CSV'}
          <input type="file" accept=".csv" className="hidden" onChange={handleUpload} style={{ display: 'none' }} />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-custom pr-2 -mr-2">
        {folders.map(folder => {
          if (searchQuery && !displayGroups[folder.name]) return null;

          return (
          <div key={folder.id} className="mb-2 group/folder">
            <div className="flex items-center justify-between text-white text-[15px] font-medium py-2 cursor-pointer" onClick={() => toggleFolder(folder.name)}>
              <div className="flex items-center gap-2">
                {activeFolder === folder.name ? <FolderOpen size={16} className="text-accent-primary" /> : <Folder size={16} className="text-accent-primary" />}
                <span>{folder.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="text-slate-400 p-1 rounded-md transition-all cursor-pointer flex items-center justify-center opacity-0 group-hover/folder:opacity-100 hover:text-red-500 hover:bg-red-500/10 hover:shadow-[0_2px_10px_rgba(239,68,68,0.15)]"
                  onClick={(e) => deleteFolder(e, folder.id, folder.name)}
                  title={'Delete folder "' + folder.name + '"'}
                >
                  <Trash2 size={14} />
                </div>
                {activeFolder === folder.name && (
                  <label
                    onClick={e => e.stopPropagation()}
                    className="text-slate-400 p-1 rounded-md transition-all cursor-pointer flex items-center justify-center hover:text-accent-primary hover:bg-accent-primary/15 hover:shadow-[0_2px_10px_rgba(167,139,250,0.2)]"
                    title={'Upload directly to ' + folder.name}
                  >
                    <Plus size={14} />
                    <input type="file" accept=".csv" className="hidden" onChange={(e) => handleUpload(e, folder.id)} style={{ display: 'none' }} />
                  </label>
                )}
                <div className="text-slate-400 p-1 rounded-md flex items-center justify-center hover:text-white hover:bg-white/10 transition-colors">
                  {activeFolder === folder.name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              </div>
            </div>

            {(activeFolder === folder.name || searchQuery) && (
              <div className="pl-5 flex flex-col gap-1 mt-1 mb-4">
                {(displayGroups[folder.name] ?? []).map(ds => (
                  <Link
                    key={ds.id}
                    to={'/dataset/' + ds.id}
                    title="Ask questions about this dataset"
                    className={'flex items-center justify-between py-1.5 px-2 rounded-md text-sm decoration-none transition-colors ' + (location.pathname === '/dataset/' + ds.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Database size={14} className="shrink-0" />
                      <span className="truncate max-w-[140px]">{ds.name}</span>
                    </div>
                    <div
                      className="text-slate-400 p-1 rounded-md transition-all cursor-pointer flex items-center justify-center hover:text-red-500 hover:bg-red-500/10 hover:shadow-[0_2px_10px_rgba(239,68,68,0.15)] shrink-0"
                      onClick={(e) => deleteDataset(e, ds.id)}
                      title="Delete Dataset"
                    >
                      <Trash2 size={14} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          );
        })}

        {(!searchQuery || displayGroups["Uncategorized"]) && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-white text-[15px] font-medium py-2 cursor-pointer" onClick={() => toggleFolder('Uncategorized')}>
            <div className="flex items-center gap-2">
              {activeFolder === 'Uncategorized' ? <FolderOpen size={16} className="text-slate-400" /> : <Folder size={16} className="text-slate-400" />}
              <span className="text-slate-400">Uncategorized</span>
            </div>
            <div className="flex items-center gap-2">
              {activeFolder === 'Uncategorized' && (
                <label
                  onClick={e => e.stopPropagation()}
                  className="text-slate-400 p-1 rounded-md transition-all cursor-pointer flex items-center justify-center hover:text-accent-primary hover:bg-accent-primary/15 hover:shadow-[0_2px_10px_rgba(167,139,250,0.2)]"
                  title="Upload to Uncategorized"
                >
                  <Plus size={14} />
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleUpload(e, null)} style={{ display: 'none' }} />
                </label>
              )}
              <div className="text-slate-400 p-1 rounded-md flex items-center justify-center hover:text-white hover:bg-white/10 transition-colors">
                {activeFolder === 'Uncategorized' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
            </div>
          </div>

          {(activeFolder === 'Uncategorized' || searchQuery) && displayGroups["Uncategorized"] && (
            <div className="pl-5 flex flex-col gap-1 mt-1 mb-4">
              {displayGroups["Uncategorized"].map(ds => (
                 <div key={ds.id} className="flex flex-col mb-2">
                   <Link
                      to={'/dataset/' + ds.id}
                      title="Ask questions about this dataset"
                      className={'flex items-center justify-between py-1.5 px-2 rounded-md text-sm decoration-none transition-colors ' + (location.pathname === '/dataset/' + ds.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Database size={14} className="shrink-0" />
                        <span className="truncate max-w-[140px]">{ds.name}</span>
                      </div>
                      <div
                        className="text-slate-400 p-1 rounded-md transition-all cursor-pointer flex items-center justify-center hover:text-red-500 hover:bg-red-500/10 hover:shadow-[0_2px_10px_rgba(239,68,68,0.15)] shrink-0"
                        onClick={(e) => deleteDataset(e, ds.id)}
                        title="Delete Dataset"
                      >
                        <Trash2 size={14} />
                      </div>
                    </Link>
                   {folders.length > 0 && (
                     <select
                       className="bg-[#11141d] text-slate-500 border border-white/10 text-xs p-1 rounded ml-2 mt-1 outline-none focus:border-accent-primary"
                       onChange={(e) => moveDatasetToFolder(ds.id, Number(e.target.value))}
                       value=""
                     >
                       <option value="" disabled>Move to...</option>
                       {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                     </select>
                   )}
                 </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </aside>
  );
}
