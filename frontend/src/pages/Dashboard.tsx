import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { BrainCircuit, User, LogOut } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useDatasets } from '../hooks/useDatasets';

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('User');

  const { data: fetchedDatasets } = useDatasets();
  const datasets = fetchedDatasets || [];

  useEffect(() => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.sub) setUserEmail(payload.sub);
      }
    } catch (e) {
      console.error("Failed to parse token", e);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/auth');
    window.location.reload();
  };

  return (
    <div className="flex items-center justify-center h-screen w-screen bg-main-gradient p-8 box-border">
      <div className="w-full max-w-[1400px] h-full max-h-[900px] bg-[#11141d] rounded-xl border border-white/5 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="flex items-center justify-between py-5 px-8 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <BrainCircuit size={24} className="text-accent-primary" />
            <span className="text-xl font-semibold text-white">QueryMind</span>
          </div>
          
          <nav className="flex gap-10">
            <Link 
              to="/" 
              className={`text-[15px] font-medium pb-2 border-b-2 transition-all ${
                location.pathname === '/' || location.pathname.includes('/dataset') 
                  ? 'text-white border-accent-primary' 
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              Dashboard
            </Link>
            <Link 
              to="/relationships" 
              className={`text-[15px] font-medium pb-2 border-b-2 transition-all ${
                location.pathname === '/relationships' 
                  ? 'text-white border-accent-primary' 
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              Relationship Mapper
            </Link>
          </nav>

          <div className="flex items-center gap-6">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <div className="flex items-center gap-2 cursor-pointer outline-none" title="Profile">
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-slate-300 hover:bg-white/20 transition-colors">
                    <User size={16} />
                  </div>
                </div>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content 
                  className="min-w-[180px] bg-[#191e2b] border border-white/10 rounded-lg py-2 shadow-xl z-50 animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95" 
                  sideOffset={8}
                  align="end"
                >
                  <div className="px-4 py-2 border-b border-white/5 text-white text-sm font-medium break-all">
                    {userEmail}
                  </div>
                  <DropdownMenu.Item 
                    onClick={logout}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 cursor-pointer outline-none hover:bg-red-500/10 focus:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={14} />
                    Logout
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden p-6 gap-6">
          <Sidebar 
            activeFolder={activeFolder} 
            setActiveFolder={setActiveFolder} 
            datasets={datasets}
          />
          <Outlet context={{ activeFolder, datasets }} />
        </div>
      </div>
    </div>
  );
}
