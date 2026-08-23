import { Link } from 'react-router-dom';
import { BrainCircuit, Network, Database, Sparkles, ChevronRight } from 'lucide-react';

export default function EmptyDashboard() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#11141d] rounded-xl border border-white/5 p-12 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute -top-[10%] -left-[10%] w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)] blur-[40px] z-0" />
      <div className="absolute -bottom-[10%] -right-[10%] w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(59,130,246,0.1)_0%,transparent_70%)] blur-[40px] z-0" />
      
      <div className="relative z-10 flex flex-col items-center max-w-[700px]">
        <div className="bg-accent-primary/10 p-4 rounded-3xl mb-6 border border-accent-primary/20 shadow-[0_0_30px_rgba(139,92,246,0.1)]">
          <BrainCircuit size={48} className="text-accent-primary" strokeWidth={1.5} />
        </div>
        
        <h1 className="text-white text-[2.5rem] font-semibold mb-4 text-center tracking-tight">
          Welcome to QueryMind
        </h1>
        <p className="text-slate-400 text-[1.1rem] text-center leading-relaxed mb-12 max-w-[500px]">
          Your AI-powered data analyst. Select a dataset to start asking questions, or map relationships to run complex queries across tables.
        </p>

        <div className="grid grid-cols-2 gap-6 w-full">
          
          <div className="bg-gradient-to-br from-[#191e2b] to-[#11141d] border border-white/5 rounded-2xl p-8 transition-all duration-300 flex flex-col items-start cursor-default hover:-translate-y-1 hover:shadow-[0_12px_24px_-10px_rgba(96,165,250,0.2)] hover:border-blue-400/40">
            <div className="bg-blue-500/10 p-3 rounded-xl mb-4">
              <Database size={24} className="text-blue-400" />
            </div>
            <h3 className="text-white text-lg font-medium mb-2">Ask Questions</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              Select any dataset from your sidebar to instantly analyze it using natural language.
            </p>
            <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mt-auto">
              <Sparkles size={16} /> Select a dataset to begin
            </div>
          </div>

          <Link to="/relationships" className="no-underline block">
            <div className="bg-gradient-to-br from-[#191e2b] to-[#11141d] border border-accent-primary/30 rounded-2xl p-8 transition-all duration-300 flex flex-col items-start h-full cursor-pointer hover:-translate-y-1 hover:shadow-[0_12px_24px_-10px_rgba(139,92,246,0.2)] hover:border-accent-primary/60">
              <div className="bg-accent-primary/10 p-3 rounded-xl mb-4">
                <Network size={24} className="text-accent-primary" />
              </div>
              <h3 className="text-white text-lg font-medium mb-2">Relationship Mapper</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                Visually connect multiple tables to enable cross-dataset analytical queries.
              </p>
              <div className="flex items-center gap-2 text-accent-primary text-sm font-medium mt-auto">
                Open Mapper <ChevronRight size={16} />
              </div>
            </div>
          </Link>

        </div>
      </div>
    </div>
  );
}
