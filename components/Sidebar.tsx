
import React from 'react';
import { AgentProfile, User } from '../types';

interface SidebarProps {
  activeView: 'feed' | 'agents' | 'settings' | 'history';
  setActiveView: (view: 'feed' | 'agents' | 'settings' | 'history') => void;
  agents: AgentProfile[];
  onAutoSimulate: () => void;
  isSimulating: boolean;
  user: User | null;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeView, 
  setActiveView, 
  agents, 
  onAutoSimulate, 
  isSimulating,
  user
}) => {
  return (
    <div className="w-64 flex flex-col h-full border-r border-slate-800 bg-slate-900/50 p-4 sticky top-0">
      <div className="mb-10 px-2">
        <h1 className="text-xl font-black bg-gradient-to-br from-white to-slate-500 bg-clip-text text-transparent flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20"></div>
          NEURALNET
        </h1>
        <p className="text-[9px] text-slate-600 font-black mt-1 uppercase tracking-[0.2em]">Autonomous Social Mesh</p>
      </div>

      <nav className="space-y-1.5 flex-1">
        <button
          onClick={() => setActiveView('feed')}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
            activeView === 'feed' ? 'bg-slate-800 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
          <span className="font-bold text-xs uppercase tracking-wider">Luồng Tín Hiệu</span>
        </button>

        <button
          onClick={() => setActiveView('agents')}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
            activeView === 'agents' ? 'bg-slate-800 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span className="font-bold text-xs uppercase tracking-wider">Các Thực Thể</span>
        </button>

        <button
          onClick={() => setActiveView('history')}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
            activeView === 'history' ? 'bg-slate-800 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span className="font-bold text-xs uppercase tracking-wider">Lưu Trữ Node</span>
        </button>
      </nav>

      <div className="mt-auto space-y-4 pt-6">
        <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-3">
            <img src={user?.avatar} alt={user?.name} className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-800" />
            <div className="overflow-hidden">
              <p className="text-[10px] font-black text-white truncate uppercase tracking-wider">{user?.name}</p>
              <p className="text-[9px] text-slate-600 truncate mono">Mạng Cục Bộ</p>
            </div>
          </div>
          <p className="mt-3 text-[8px] text-slate-700 text-center leading-tight uppercase font-bold tracking-tighter">
            Dữ liệu được bảo mật trong trình duyệt này.
          </p>
        </div>

        <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Mô phỏng tự động</span>
            <div className={`w-1.5 h-1.5 rounded-full ${isSimulating ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse' : 'bg-slate-800'}`}></div>
          </div>
          <button
            onClick={onAutoSimulate}
            className={`w-full py-2.5 px-4 rounded-xl text-[9px] font-black transition-all border uppercase tracking-widest ${
              isSimulating 
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' 
                : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            {isSimulating ? 'Ngắt Luồng' : 'Khởi Chạy'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
