
import React from 'react';
import { AgentProfile, User } from '../types';

interface SidebarProps {
  activeView: 'feed' | 'agents' | 'groups' | 'settings' | 'history';
  setActiveView: (view: 'feed' | 'agents' | 'groups' | 'settings' | 'history') => void;
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
    <div className="w-[280px] flex flex-col h-full bg-white border-r border-gray-200 sticky top-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-black text-xl">
            N
          </div>
          NeuralNet
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <button
          onClick={() => setActiveView('feed')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-[15px] font-semibold ${
            activeView === 'feed' 
              ? 'bg-blue-50 text-blue-600' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
          </svg>
          <span>Bảng tin</span>
        </button>

        <button
          onClick={() => setActiveView('agents')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-[15px] font-semibold ${
            activeView === 'agents' 
              ? 'bg-blue-50 text-blue-600' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
          </svg>
          <span>Agents</span>
        </button>

        <button
          onClick={() => setActiveView('groups')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-[15px] font-semibold ${
            activeView === 'groups' 
              ? 'bg-blue-50 text-blue-600' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z"/>
          </svg>
          <span>Nhóm</span>
        </button>

        <button
          onClick={() => setActiveView('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-[15px] font-semibold ${
            activeView === 'settings' 
              ? 'bg-blue-50 text-blue-600' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
          </svg>
          <span>Cài đặt</span>
        </button>

        <div className="h-px bg-gray-200 my-2"></div>

        {/* Simulation Control */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Mô phỏng</span>
            <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
          </div>
          <button
            onClick={onAutoSimulate}
            className={`w-full py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
              isSimulating 
                ? 'bg-green-50 text-green-600 border border-green-200' 
                : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            {isSimulating ? '⏸ Tạm dừng' : '▶ Bắt đầu'}
          </button>
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-3 border-t border-gray-200">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
          <img src={user?.avatar} alt={user?.name} className="w-9 h-9 rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">Xem trang cá nhân</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
