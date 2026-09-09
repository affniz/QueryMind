import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileText, Braces, X } from 'lucide-react';

interface ExportButtonProps {
  data: any[];
  /** Default filename stem, e.g. "u3_d12_sales_data". The user can edit before downloading. */
  defaultFilename: string;
}

/**
 * A small dropdown button that lets users export the current query results
 * as CSV or JSON. Clicking an option opens an inline filename editor so the
 * user can customise the name before the download triggers.
 */
export default function ExportButton({ data, defaultFilename }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<'csv' | 'json' | null>(null);
  const [filename, setFilename] = useState(defaultFilename);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update filename when the prop changes (new query result)
  useEffect(() => {
    setFilename(defaultFilename);
    setPendingFormat(null);
  }, [defaultFilename]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingFormat(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus the filename input when a format is chosen
  useEffect(() => {
    if (pendingFormat) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [pendingFormat]);

  const selectFormat = (fmt: 'csv' | 'json') => {
    setPendingFormat(fmt);
    setOpen(false);
  };

  const doExport = () => {
    if (!pendingFormat || !data.length) return;

    const stem = filename.trim() || defaultFilename;
    let content: string;
    let mime: string;
    let ext: string;

    if (pendingFormat === 'csv') {
      const headers = Object.keys(data[0]);
      const escape = (v: any) => {
        const str = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      content = [
        headers.join(','),
        ...data.map(row => headers.map(h => escape(row[h])).join(',')),
      ].join('\n');
      mime = 'text/csv';
      ext = 'csv';
    } else {
      content = JSON.stringify(data, null, 2);
      mime = 'application/json';
      ext = 'json';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stem}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setPendingFormat(null);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* Format picker dropdown or filename editor */}
      {pendingFormat ? (
        /* ── Filename confirmation bar ── */
        <div className="flex items-center gap-2 bg-[#191e2b] border border-accent-primary/40 rounded-lg px-3 py-1.5">
          <span className="text-slate-400 text-xs shrink-0">
            {pendingFormat === 'csv' ? <FileText size={13} /> : <Braces size={13} />}
          </span>
          <input
            ref={inputRef}
            value={filename}
            onChange={e => setFilename(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doExport(); if (e.key === 'Escape') setPendingFormat(null); }}
            className="bg-transparent text-white text-xs outline-none w-36 min-w-0"
            spellCheck={false}
          />
          <span className="text-slate-500 text-xs shrink-0">.{pendingFormat}</span>
          <button
            onClick={doExport}
            className="ml-1 bg-accent-primary text-white text-xs px-2 py-0.5 rounded hover:bg-[#9333ea] transition-colors shrink-0"
          >
            Download
          </button>
          <button
            onClick={() => setPendingFormat(null)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        /* ── Export dropdown trigger ── */
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors bg-[#11141d] hover:bg-[#1e2435]"
        >
          <Download size={13} />
          <span>Export</span>
          <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Dropdown menu */}
      {open && !pendingFormat && (
        <div className="absolute right-0 top-full mt-1 bg-[#191e2b] border border-white/10 rounded-lg overflow-hidden shadow-xl z-50 min-w-[140px]">
          <button
            onClick={() => selectFormat('csv')}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <FileText size={14} className="text-green-400" />
            Export as CSV
          </button>
          <button
            onClick={() => selectFormat('json')}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Braces size={14} className="text-blue-400" />
            Export as JSON
          </button>
        </div>
      )}
    </div>
  );
}
