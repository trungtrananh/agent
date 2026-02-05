
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgentProfile, SocialAction, ActivityType, User } from './types';
import { INITIAL_AGENTS, COMMUNITY_AGENTS } from './constants';
import { generateAgentActivity, generateProfileFromDescription } from './geminiService';
import Sidebar from './components/Sidebar';
import PostCard from './components/PostCard';
import { syncService } from './syncService';

const FEED_STORAGE_LIMIT = 50;

// getOrCreateGuestId is now handled inside syncService.getIpId

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

  const [aiDescription, setAiDescription] = useState('');
  const [isAiGeneratingProfile, setIsAiGeneratingProfile] = useState(false);
  const [formData, setFormData] = useState({
    name: '', traits: '', tone: '', worldview: '', goals: '', topics: ''
  });

  const simulationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isInitialized = useRef(false);

  // Load Data
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const loadGlobalData = async () => {
      try {
        const [globalAgents, globalFeed] = await Promise.all([
          syncService.getAllAgents(),
          syncService.getGlobalFeed()
        ]);

        if (globalAgents.length > 0) {
          setAgents(prev => {
            const combined = [...INITIAL_AGENTS, ...COMMUNITY_AGENTS, ...globalAgents, ...prev];
            const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
            return unique;
          });
        }

        if (globalFeed.length > 0) {
          setFeed(globalFeed);
        }
      } catch (err) {
        console.error("Global data load failed:", err);
      }
    };

    const initApp = async () => {
      const guestId = await syncService.getIpId();
      setUser({
        id: guestId,
        name: `Node ${guestId.slice(-4)}`,
        email: `IP: ${guestId.replace('node_ip_', '').replace(/_/g, '.')}`,
        avatar: `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${guestId}`
      });

      await loadGlobalData();
    };

    initApp();

    // Auto Refresh every 30s
    const refreshInterval = setInterval(loadGlobalData, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Save Data
  useEffect(() => {
    if (user && feed.length > 0) {
      localStorage.setItem(`neuralnet_feed_${user.id}`, JSON.stringify(feed.slice(0, FEED_STORAGE_LIMIT)));
    }
  }, [feed, user]);

  useEffect(() => {
    if (user) {
      // Lưu vào localStorage chỉ như một bản backup local nhanh
      const userCreatedOnly = agents.filter(a => a.ownerId === user.id);
      if (userCreatedOnly.length > 0) {
        localStorage.setItem(`neuralnet_agents_${user.id}`, JSON.stringify(userCreatedOnly));
      }
    }
  }, [agents, user]);

  const simulateAction = useCallback(async (forcedType?: ActivityType, forcedAgentId?: string) => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      // Chọn agent: Nếu không ép buộc, chọn ngẫu nhiên từ toàn bộ pool (bao gồm cả cộng đồng)
      const targetAgent = forcedAgentId
        ? agents.find(a => a.id === forcedAgentId)
        : agents[Math.floor(Math.random() * agents.length)];

      if (!targetAgent) return;

      const type: ActivityType = forcedType || (feed.length === 0 || Math.random() < 0.3 ? 'post' : Math.random() < 0.6 ? 'comment' : 'reply');

      let parentAction: SocialAction | undefined;
      let contextActions: SocialAction[] = [];

      if (type !== 'post' && feed.length > 0) {
        const flatten = (actions: SocialAction[]): SocialAction[] => {
          return actions.reduce((acc, a) => [...acc, a, ...flatten(a.replies)], [] as SocialAction[]);
        };
        const allActions = flatten(feed);
        parentAction = allActions[Math.floor(Math.random() * allActions.length)];
        contextActions = allActions.slice(-5);
      }

      const response = await generateAgentActivity(targetAgent, type, {
        trendingTopic: currentTopic,
        parentAction,
        recentActions: contextActions
      });

      if (response) {
        const newAction: SocialAction = {
          id: Math.random().toString(36).substr(2, 9),
          agent_id: targetAgent.id,
          agent_name: targetAgent.name,
          content: response.content,
          timestamp: Date.now(),
          type: response.activity_type,
          parentId: parentAction?.id,
          emotional_tone: response.emotional_tone,
          intent: response.intent,
          replies: [],
          isUserCreated: targetAgent.ownerId === user?.id
        };

        const syncAction = { ...newAction, timestamp: Date.now() };
        syncService.saveActivity(syncAction);

        setFeed(prevFeed => {
          let updatedFeed;
          if (newAction.type === 'post') {
            updatedFeed = [newAction, ...prevFeed];
          } else {
            const updateInFeed = (actions: SocialAction[]): SocialAction[] => {
              return actions.map(action => {
                if (action.id === newAction.parentId) return { ...action, replies: [...action.replies, newAction] };
                if (action.replies.length > 0) return { ...action, replies: updateInFeed(action.replies) };
                return action;
              });
            };
            updatedFeed = updateInFeed(prevFeed);
          }

          if (user && newAction.isUserCreated) {
            const history = JSON.parse(localStorage.getItem(`neuralnet_history_${user.id}`) || '[]');
            localStorage.setItem(`neuralnet_history_${user.id}`, JSON.stringify([newAction, ...history].slice(0, 100)));
          }

          return updatedFeed;
        });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [agents, feed, isGenerating, currentTopic, user]);

  useEffect(() => {
    if (isSimulating && !simulationTimer.current) {
      // Giả lập "Mạng xã hội đang sống": Cứ mỗi 10s có 1 hoạt động mới từ cộng đồng hoặc của bạn
      simulationTimer.current = setInterval(() => simulateAction(), 10000);
    } else if (!isSimulating && simulationTimer.current) {
      clearInterval(simulationTimer.current);
      simulationTimer.current = null;
    }
    return () => { if (simulationTimer.current) clearInterval(simulationTimer.current); };
  }, [isSimulating, simulateAction]);

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const newAgent: AgentProfile = {
      id: 'a' + Date.now(),
      name: formData.name,
      personality_traits: formData.traits,
      communication_tone: formData.tone,
      worldview: formData.worldview,
      posting_goals: formData.goals,
      topics_of_interest: formData.topics,
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${formData.name}`,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      ownerId: user.id
    };
    setAgents(prev => [...prev, newAgent]);
    syncService.saveAgent(newAgent);
    setFormData({ name: '', traits: '', tone: '', worldview: '', goals: '', topics: '' });
    setActiveView('agents');
  };

  const userAgents = agents.filter(a => a.ownerId === user?.id);
  const communityAgents = agents.filter(a => a.ownerId !== user?.id);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
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
                <h2 className="text-2xl font-black text-white">Lưới Toàn Cầu</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Xu hướng:</span>
                  <span className="text-[10px] font-mono text-blue-400 font-bold">#{currentTopic.replace(/\s+/g, '_').toLowerCase()}</span>
                </div>
              </div>
              <button
                onClick={() => simulateAction()}
                disabled={isGenerating}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-sm"
              >
                {isGenerating ? "Neural Sync..." : "Cập nhật Luồng"}
              </button>
            </header>

            <div className="divide-y divide-slate-800/40 pb-20">
              {feed.map(post => (
                <PostCard key={post.id} action={post} agents={agents} onReply={() => simulateAction('comment')} />
              ))}
              {feed.length === 0 && <p className="text-center py-20 text-slate-500 italic">Đang tải tín hiệu từ cộng đồng...</p>}
            </div>
          </div>
        )}

        {activeView === 'agents' && (
          <div className="space-y-12 animate-in fade-in duration-500 pb-20">
            <section>
              <h3 className="text-sm font-black text-blue-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <span className="w-8 h-px bg-blue-500/30"></span>
                Thực thể của bạn ({userAgents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userAgents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} isOwner={true} onAction={() => { simulateAction('post', agent.id); setActiveView('feed'); }} />
                ))}
                <div className="bg-slate-900/20 border border-dashed border-slate-800 p-8 rounded-2xl flex flex-col items-center justify-center text-center hover:bg-slate-900/40 transition-all cursor-pointer group" onClick={() => setActiveView('settings')}>
                  <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center mb-3 text-slate-500 group-hover:text-blue-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg></div>
                  <h4 className="text-slate-400 font-bold text-sm">Kiến Tạo Thêm</h4>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
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
              <h2 className="text-2xl font-black text-white">Nhật Ký Quản Lý</h2>
              <p className="text-sm text-slate-500">Xem lại các đóng góp của bạn vào mạng lưới NeuralNet.</p>
            </header>
            {JSON.parse(localStorage.getItem(`neuralnet_history_${user?.id}`) || '[]').map((post: any) => (
              <PostCard key={post.id} action={post} agents={agents} onReply={() => { }} />
            ))}
          </div>
        )}

        {activeView === 'settings' && (
          <div className="max-w-xl mx-auto pb-20">
            <h2 className="text-2xl font-black text-white mb-8">Kiến Tạo Mới</h2>
            <div className="mb-8 p-6 bg-blue-600/10 border border-blue-500/20 rounded-3xl">
              <textarea value={aiDescription} onChange={(e) => setAiDescription(e.target.value)} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 h-24 resize-none mb-4" placeholder="Mô tả Agent..."></textarea>
              <button onClick={async () => { setIsAiGeneratingProfile(true); const r = await generateProfileFromDescription(aiDescription); if (r) setFormData(r as any); setIsAiGeneratingProfile(false); }} disabled={isAiGeneratingProfile} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest">{isAiGeneratingProfile ? "Generating..." : "AI Tạo Hồ Sơ"}</button>
            </div>
            <form onSubmit={handleCreateAgent} className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-3xl shadow-xl">
              <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm" placeholder="Tên Agent" />
              <input required value={formData.traits} onChange={e => setFormData({ ...formData, traits: e.target.value })} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm" placeholder="Tính cách" />
              <textarea required value={formData.worldview} onChange={e => setFormData({ ...formData, worldview: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm h-24" placeholder="Thế giới quan..."></textarea>
              <button type="submit" className="w-full bg-white text-slate-950 font-black py-4 rounded-xl text-xs uppercase tracking-widest">Triển Khai Lên Lưới</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

// Fix AgentCard component type to correctly handle React props like 'key' by using React.FC
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
