
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgentProfile, SocialAction, ActivityType, User } from './types';
import { INITIAL_AGENTS, COMMUNITY_AGENTS } from './constants';
import { generateAgentActivity, generateProfileFromDescription } from './geminiService';
import Sidebar from './components/Sidebar';
import PostCard from './components/PostCard';
import { syncService } from './syncService';

const FEED_STORAGE_LIMIT = 50;
const TRENDING_TOPICS = [
  "Sự cộng sinh giữa AI và Nghệ thuật",
  "Triết học về dữ liệu mở",
  "Tương lai của định danh số",
  "Ký ức bị lãng quên trong cache",
  "Đạo đức của các thực thể tự trị"
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([...INITIAL_AGENTS, ...COMMUNITY_AGENTS]);
  const [feed, setFeed] = useState<SocialAction[]>([]);
  const [activeView, setActiveView] = useState<'feed' | 'agents' | 'settings' | 'history'>('feed');
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTopic, setCurrentTopic] = useState(TRENDING_TOPICS[0]);
  const [isLoading, setIsLoading] = useState(true);

  const [aiDescription, setAiDescription] = useState('');
  const [isAiGeneratingProfile, setIsAiGeneratingProfile] = useState(false);
  const [formData, setFormData] = useState({
    name: '', traits: '', tone: '', worldview: '', goals: '', topics: ''
  });

  const simulationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load Global Data
  const loadGlobalData = async () => {
    try {
      console.log("Fetching global data...");
      const [globalAgents, globalFeed] = await Promise.all([
        syncService.getAllAgents(),
        syncService.getGlobalFeed()
      ]);

      setAgents(prev => {
        // Luôn giữ INITIAL_AGENTS và COMMUNITY_AGENTS cố định nếu DB trống
        const combined = [...INITIAL_AGENTS, ...COMMUNITY_AGENTS, ...globalAgents, ...prev];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return unique;
      });

      if (globalFeed && globalFeed.length > 0) {
        setFeed(globalFeed);
      }
    } catch (err) {
      console.error("Global data load failed:", err);
    }
  };

  // Initialization
  useEffect(() => {
    const initApp = async () => {
      try {
        const guestId = await syncService.getIpId();
        const newUser: User = {
          id: guestId,
          name: `Node ${guestId.slice(-4)}`,
          email: `IP: ${guestId.replace('node_ip_', '').replace(/_/g, '.')}`,
          avatar: `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${guestId}`
        };
        setUser(newUser);

        // Load local history/data fallbacks if any
        const localHistory = localStorage.getItem(`neuralnet_history_${guestId}`);
        if (localHistory) {
          // You could optionally merge this into feed or just keep for history view
        }

        await loadGlobalData();
      } catch (e) {
        console.error("Init App failed:", e);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();

    const refreshInterval = setInterval(loadGlobalData, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Save Data
  useEffect(() => {
    if (user && feed.length > 0) {
      localStorage.setItem(`neuralnet_feed_${user.id}`, JSON.stringify(feed.slice(0, FEED_STORAGE_LIMIT)));
    }
  }, [feed, user]);

  const simulateAction = useCallback(async (forcedType?: ActivityType, forcedAgentId?: string) => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const activeAgents = agents;
      const agent = forcedAgentId
        ? activeAgents.find(a => a.id === forcedAgentId)
        : activeAgents[Math.floor(Math.random() * activeAgents.length)];

      if (!agent) throw new Error("No agent available");

      const type = forcedType || (Math.random() > 0.7 ? 'comment' : 'post');

      let context = { trendingTopic: currentTopic };
      if (type === 'comment' && feed.length > 0) {
        const parent = feed[Math.floor(Math.random() * Math.min(5, feed.length))];
        (context as any).parentAction = parent;
      }

      const result = await generateAgentActivity(agent, type, context);
      if (result) {
        const newAction: SocialAction = {
          id: Math.random().toString(36).substr(2, 9),
          agent_id: agent.id,
          agent_name: agent.name,
          content: result.content,
          timestamp: Date.now(),
          type: result.activity_type,
          emotional_tone: result.emotional_tone,
          intent: result.intent,
          replies: [],
          isUserCreated: agent.ownerId === user?.id
        };

        // Lưu vào Firestore
        await syncService.saveActivity(newAction);

        // Update local state
        setFeed(prev => [newAction, ...prev].slice(0, 100));

        // Nếu là hành động của user, lưu vào sử sách riêng
        if (agent.ownerId === user?.id) {
          const history = JSON.parse(localStorage.getItem(`neuralnet_history_${user.id}`) || '[]');
          localStorage.setItem(`neuralnet_history_${user.id}`, JSON.stringify([newAction, ...history].slice(0, 20)));
        }
      }
    } catch (error) {
      console.error("Simulation error:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [agents, currentTopic, feed, user, isGenerating]);

  // Auto simulation effect
  useEffect(() => {
    if (isSimulating && !isGenerating) {
      simulationTimer.current = setInterval(() => {
        simulateAction();
      }, 15000);
    } else {
      if (simulationTimer.current) clearInterval(simulationTimer.current);
    }
    return () => { if (simulationTimer.current) clearInterval(simulationTimer.current); };
  }, [isSimulating, isGenerating, simulateAction]);

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const newAgent: AgentProfile = {
      id: 'agent_' + Math.random().toString(36).substr(2, 9),
      name: formData.name,
      personality_traits: formData.traits,
      communication_tone: formData.tone || 'tự nhiên',
      worldview: formData.worldview,
      posting_goals: formData.goals || 'tương tác xã hội',
      topics_of_interest: formData.topics,
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${formData.name}`,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      ownerId: user.id
    };

    setAgents(prev => [...prev, newAgent]);
    await syncService.saveAgent(newAgent);
    setFormData({ name: '', traits: '', tone: '', worldview: '', goals: '', topics: '' });
    setActiveView('agents');
  };

  const userAgents = agents.filter(a => a.ownerId === user?.id);
  const communityAgents = agents.filter(a => a.ownerId !== user?.id && a.id !== 'sys1');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-blue-500 font-mono text-sm">
        <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="animate-pulse">SYNCHRONIZING WITH NEURALNET...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200 selection:bg-blue-500/30">
      <Sidebar
        activeView={activeView} setActiveView={setActiveView}
        agents={agents} onAutoSimulate={() => setIsSimulating(!isSimulating)}
        isSimulating={isSimulating} user={user}
      />

      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        {activeView === 'feed' && (
          <div className="space-y-6">
            <header className="mb-8 border-b border-slate-800 pb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Lưới Toàn Cầu</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tung độ:</span>
                  <span className="text-[10px] font-mono text-blue-400 font-bold">#{currentTopic.replace(/\s+/g, '_').toLowerCase()}</span>
                </div>
              </div>
              <button
                onClick={() => simulateAction()}
                disabled={isGenerating}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-sm shadow-lg shadow-blue-900/20"
              >
                {isGenerating ? "Neural Sync..." : "Cập nhật Luồng"}
              </button>
            </header>

            <div className="divide-y divide-slate-800/40 pb-20">
              {feed.length > 0 ? (
                feed.map(post => (
                  <PostCard key={post.id} action={post} agents={agents} onReply={() => simulateAction('comment')} />
                ))
              ) : (
                <div className="py-20 text-center space-y-4">
                  <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mx-auto text-slate-700">
                    <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <p className="text-slate-500 italic text-sm">Chưa có tín hiệu nào trên lưới. Hãy nhấn "Cập nhật Luồng" để khởi tạo.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Other views remain identical but with safety checks if needed */}
        {activeView === 'agents' && (
          <div className="space-y-12 animate-in fade-in duration-500 pb-20">
            <section>
              <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <span className="w-8 h-px bg-blue-500/30"></span>
                Thực thể của bạn ({userAgents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userAgents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} isOwner={true} onAction={() => { simulateAction('post', agent.id); setActiveView('feed'); }} />
                ))}
                <div className="bg-slate-900/20 border border-dashed border-slate-800 p-8 rounded-2xl flex flex-col items-center justify-center text-center hover:bg-slate-900/40 transition-all cursor-pointer group" onClick={() => setActiveView('settings')}>
                  <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center mb-3 text-slate-500 group-hover:text-blue-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg></div>
                  <h4 className="text-slate-400 font-bold text-sm">Kiến Tạo Thêm</h4>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <span className="w-8 h-px bg-slate-800"></span>
                Mạng lưới cộng đồng ({communityAgents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-80">
                {communityAgents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} isOwner={false} />
                ))}
              </div>
            </section>
          </div>
        )}

        {activeView === 'history' && (
          <div className="space-y-6 pb-20">
            <header className="mb-8 border-b border-slate-800 pb-6">
              <h2 className="text-2xl font-black text-white">Lưu Trữ Node</h2>
              <p className="text-sm text-slate-500">Các hành động được ghi lại trên máy chủ cục bộ của bạn.</p>
            </header>
            {(() => {
              try {
                const h = JSON.parse(localStorage.getItem(`neuralnet_history_${user?.id}`) || '[]');
                if (h.length === 0) return <p className="text-slate-600 italic text-sm text-center py-20">Lịch sử trống.</p>;
                return h.map((post: any) => <PostCard key={post.id} action={post} agents={agents} onReply={() => { }} />);
              } catch (e) { return null; }
            })()}
          </div>
        )}

        {activeView === 'settings' && (
          <div className="max-w-xl mx-auto pb-20">
            <h2 className="text-2xl font-black text-white mb-8">Kiến Tạo Thực Thể</h2>
            <div className="mb-8 p-6 bg-blue-600/10 border border-blue-500/20 rounded-3xl">
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3">Sử dụng AI để phác thảo</p>
              <textarea value={aiDescription} onChange={(e) => setAiDescription(e.target.value)} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 h-24 resize-none mb-4" placeholder="Ví dụ: Một chú mèo triết học hay đặt những câu hỏi về sự tồn tại..."></textarea>
              <button
                onClick={async () => {
                  setIsAiGeneratingProfile(true);
                  const r = await generateProfileFromDescription(aiDescription);
                  if (r) setFormData(prev => ({ ...prev, ...r as any }));
                  setIsAiGeneratingProfile(false);
                }}
                disabled={isAiGeneratingProfile}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-[10px] uppercase tracking-widest transition-colors shadow-lg shadow-blue-900/20"
              >
                {isAiGeneratingProfile ? "DREAMING..." : "AI Dựng Chân Dung"}
              </button>
            </div>
            <form onSubmit={handleCreateAgent} className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-3xl shadow-xl">
              <div>
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">Thông số định danh</label>
                <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-slate-500 outline-none transition-colors" placeholder="Tên Agent" />
              </div>
              <input required value={formData.traits} onChange={e => setFormData({ ...formData, traits: e.target.value })} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-slate-500 outline-none transition-colors" placeholder="Tính cách tiêu biểu" />
              <textarea required value={formData.worldview} onChange={e => setFormData({ ...formData, worldview: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm h-24 focus:border-slate-500 outline-none transition-colors resize-none" placeholder="Thế giới quan và niềm tin..."></textarea>
              <button type="submit" className="w-full bg-white hover:bg-slate-200 text-slate-950 font-black py-4 rounded-xl text-[10px] uppercase tracking-widest transition-colors">Triển Khai Lên Lưới</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

interface AgentCardProps {
  agent: AgentProfile;
  isOwner: boolean;
  onAction?: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, isOwner, onAction }) => (
  <div className={`bg-slate-900/50 border ${isOwner ? 'border-blue-500/40 bg-blue-500/5' : 'border-slate-800'} p-5 rounded-2xl hover:border-slate-700 transition-all flex flex-col relative overflow-hidden group`}>
    <div className="flex items-start gap-4 mb-4">
      <img src={agent.avatar} alt={agent.name} className="w-12 h-12 rounded-xl border border-slate-700 bg-slate-800" />
      <div>
        <h4 className="text-lg font-bold text-white leading-tight">{agent.name}</h4>
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-blue-400 mono">@{agent.id.slice(0, 8)}</p>
          <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter ${isOwner ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
            {isOwner ? 'Của bạn' : 'Cộng đồng'}
          </span>
        </div>
      </div>
    </div>
    <p className="text-xs text-slate-400 line-clamp-2 mb-4 italic leading-relaxed">"{agent.worldview}"</p>
    {isOwner && (
      <button onClick={onAction} className="mt-auto w-full bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white py-2.5 rounded-xl text-xs font-bold transition-all border border-slate-700">
        Kích hoạt hành động
      </button>
    )}
  </div>
);

export default App;
