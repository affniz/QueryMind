import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Database, Folder, FolderOpen, Upload, Plus, ChevronRight, ChevronDown, Search, Trash2 } from 'lucide-react';
import { useDialog } from '../context/DialogContext';
import { Dataset } from '../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface SidebarProps {
  activeFolder: string | null;
  setActiveFolder: (folder: string | null) => void;
  datasets: Dataset[];
}

export default function Sidebar({ activeFolder, setActiveFolder, datasets }: SidebarProps) {
  const [folders, setFolders] = useState<string[]>(() => JSON.parse(localStorage.getItem('qm_folders') || '["Sales Data", "HR Data"]'));
  const [datasetFolderMap, setDatasetFolderMap] = useState<Record<string, string>>(() => JSON.parse(localStorage.getItem('qm_ds_folders') || '{}'));
  const [searchQuery, setSearchQuery] = useState('');
  
  const location = useLocation();
  const navigate = useNavigate();
  const { showConfirm, showPrompt } = useDialog();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/datasets/${id}`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success("Dataset deleted successfully");
      if (location.pathname === `/dataset/${id}`) {
        navigate('/'); 
      }
    },
    onError: () => {
      toast.error("Failed to delete dataset.");
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ formData }: { formData: FormData, targetFolder: string }) => {
      const res = await api.post('/datasets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: (data, variables) => {
      const newDatasetId = data.id;
      const targetFolder = variables.targetFolder;
      const newMap = { ...datasetFolderMap, [newDatasetId]: targetFolder };
      setDatasetFolderMap(newMap);
      localStorage.setItem('qm_ds_folders', JSON.stringify(newMap));
      setActiveFolder(targetFolder);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success("Dataset uploaded successfully");
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetFolder = "Uncategorized") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    uploadMutation.mutate({ formData, targetFolder });
  };

  const createFolder = async () => {
    const name = await showPrompt("Enter folder name:");
    if (name && !folders.includes(name)) {
      const newFolders = [...folders, name];
      setFolders(newFolders);
      localStorage.setItem('qm_folders', JSON.stringify(newFolders));
      setActiveFolder(name);
    }
  };

  const toggleFolder = (folderName: string) => {
    setActiveFolder(activeFolder === folderName ? null : folderName);
  };

  const moveDatasetToFolder = (datasetId: string, folderName: string) => {
    const newMap = { ...datasetFolderMap, [datasetId]: folderName };
    setDatasetFolderMap(newMap);
    localStorage.setItem('qm_ds_folders', JSON.stringify(newMap));
    setActiveFolder(folderName);
  };

  const groupedDatasets: Record<string, Dataset[]> = { "Uncategorized": [] };
  folders.forEach(f => groupedDatasets[f] = []);
  
  datasets.forEach(ds => {
    const folder = datasetFolderMap[ds.id] || "Uncategorized";
    if (groupedDatasets[folder]) {
      groupedDatasets[folder].push(ds);
    } else {
      groupedDatasets["Uncategorized"].push(ds);
    }
  });

  const lowerQuery = searchQuery.toLowerCase();
  const displayGroups: Record<string, Dataset[]> = {};
  
  folders.forEach(folder => {
    const folderMatches = searchQuery === '' || folder.toLowerCase().includes(lowerQuery);
    if (folderMatches) {
      displayGroups[folder] = groupedDatasets[folder];
    } else {
      const matchingDatasets = groupedDatasets[folder].filter(ds => ds.name.toLowerCase().includes(lowerQuery));
      if (matchingDatasets.length > 0) {
        displayGroups[folder] = matchingDatasets;
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

  return (
    <aside className="w-[260px] bg-[#191e2b] rounded-xl border border-white/5 flex flex-col p-5 shrink-0">
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

      <div className="mb-4">
        <h4 className="m-0 text-white font-semibold text-base">Datasets & Chats</h4>
        <span className="text-slate-500 text-xs">Select a dataset to ask questions</span>
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
          if (searchQuery && !displayGroups[folder]) return null;
          
          return (
          <div key={folder} className="mb-2">
            <div className="flex items-center justify-between text-white text-[15px] font-medium py-2 cursor-pointer" onClick={() => toggleFolder(folder)}>
              <div className="flex items-center gap-2">
                {activeFolder === folder ? <FolderOpen size={16} className="text-accent-primary" /> : <Folder size={16} className="text-accent-primary" />}
                <span>{folder}</span>
              </div>
              <div className="flex items-center gap-2">
                {activeFolder === folder && (
                  <label 
                    onClick={e => e.stopPropagation()} 
                    className="text-slate-400 p-1 rounded-md transition-all cursor-pointer flex items-center justify-center hover:text-accent-primary hover:bg-accent-primary/15 hover:shadow-[0_2px_10px_rgba(167,139,250,0.2)]"
                    title={`Upload directly to ${folder}`}
                  >
                    <Plus size={14} />
                    <input type="file" accept=".csv" className="hidden" onChange={(e) => handleUpload(e, folder)} style={{ display: 'none' }} />
                  </label>
                )}
                <div className="text-slate-400 p-1 rounded-md flex items-center justify-center hover:text-white hover:bg-white/10 transition-colors">
                  {activeFolder === folder ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              </div>
            </div>
            
            {(activeFolder === folder || searchQuery) && (
              <div className="pl-5 flex flex-col gap-1 mt-1 mb-4">
                {displayGroups[folder].map(ds => (
                  <Link 
                    key={ds.id} 
                    to={`/dataset/${ds.id}`}
                    title="Ask questions about this dataset"
                    className={`flex items-center justify-between py-1.5 px-2 rounded-md text-sm decoration-none transition-colors ${location.pathname === `/dataset/${ds.id}` ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
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
        )})}
        
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
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleUpload(e, 'Uncategorized')} style={{ display: 'none' }} />
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
                      to={`/dataset/${ds.id}`}
                      title="Ask questions about this dataset"
                      className={`flex items-center justify-between py-1.5 px-2 rounded-md text-sm decoration-none transition-colors ${location.pathname === `/dataset/${ds.id}` ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
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
                    <select 
                      className="bg-[#11141d] text-slate-500 border border-white/10 text-xs p-1 rounded ml-2 mt-1 outline-none focus:border-accent-primary" 
                      onChange={(e) => moveDatasetToFolder(ds.id, e.target.value)}
                      value=""
                    >
                      <option value="" disabled>Move to...</option>
                      {folders.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
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
