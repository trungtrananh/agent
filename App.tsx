
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
  const [agents, setAgents] = useState<AgentProfile[]>(() => [...INITIAL_AGENTS, ...COMMUNITY_AGENTS]);
  const [feed, setFeed] = useState<SocialAction[]>([]);
  const [activeView, setActiveView] = useState<'feed' | 'agents' | 'settings' | 'history'>('feed');
  const [isSimulating, setIsSimulating] = useState(true); // Tự động chạy - Agent tự đăng bài và comment
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTopic, setCurrentTopic] = useState(TRENDING_TOPICS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastAiError, setLastAiError] = useState<string | null>(null);

  const [aiDescription, setAiDescription] = useState('');
  const [isAiGeneratingProfile, setIsAiGeneratingProfile] = useState(false);
  const [formData, setFormData] = useState({
    name: '', traits: '', tone: '', worldview: '', goals: '', topics: ''
  });

  const simulationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataLoadedRef = useRef(false);

  // Load Global Data
  const loadGlobalData = async () => {
    try {
      const [globalAgents, globalFeed] = await Promise.all([
        syncService.getAllAgents().catch(() => []),
        syncService.getGlobalFeed().catch(() => [])
      ]);

      setAgents(prev => {
        const combined = [...INITIAL_AGENTS, ...COMMUNITY_AGENTS, ...globalAgents, ...prev];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return unique;
      });

      if (globalFeed && globalFeed.length > 0) {
        setFeed(buildActivityTree(globalFeed));
      }
    } catch (err) {
      console.error("NEURAL_ERROR: Sync failed", err);
    }
  };

  // Initialization
  useEffect(() => {
    if (dataLoadedRef.current) return;
    dataLoadedRef.current = true;

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
        await loadGlobalData();
      } catch (e) {
        console.error("NEURAL_ERROR: Init failed", e);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();

    const refreshInterval = setInterval(loadGlobalData, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Save Data locally
  useEffect(() => {
    if (user && feed.length > 0) {
      localStorage.setItem(`neuralnet_feed_${user.id}`, JSON.stringify(feed.slice(0, FEED_STORAGE_LIMIT)));
    }
  }, [feed, user]);

  const simulateAction = useCallback(async (forcedType?: ActivityType, forcedAgentId?: string, parentAction?: SocialAction) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setLastAiError(null);

    try {
      const activeAgents = agents;
      // Khi comment: chọn agent khác với tác giả bài cha (Agent comment vào bài của Agent khác)
      const agent = forcedAgentId
        ? activeAgents.find(a => a.id === forcedAgentId)
        : activeAgents[Math.floor(Math.random() * activeAgents.length)];

      if (!agent) throw new Error("No agent found for simulation");

      const type = forcedType || (Math.random() > 0.5 ? 'comment' : 'post'); // 50% đăng bài, 50% comment

      let context: any = { trendingTopic: currentTopic };
      let parentId: string | undefined;

      if (type === 'comment' && feed.length > 0) {
        const parent = parentAction ?? (() => {
          const topLevelPosts = feed.filter(f => !f.parentId);
          return topLevelPosts.length > 0
            ? topLevelPosts[Math.floor(Math.random() * Math.min(3, topLevelPosts.length))]
            : feed[Math.floor(Math.random() * feed.length)];
        })();

        context.parentAction = parent;
        parentId = parent.id;

        // Chọn Agent khác với tác giả bài cha để comment
        if (parent.agent_id && activeAgents.length > 1) {
          const others = activeAgents.filter(a => a.id !== parent.agent_id);
          if (others.length > 0) {
            const commentingAgent = others[Math.floor(Math.random() * others.length)];
            // Override agent for this comment
            Object.assign(context, { _forceAgent: commentingAgent });
          }
        }
      }

      const actualAgent = (context as any)._forceAgent || agent;
      const { result, error } = await generateAgentActivity(actualAgent, type, context);

      if (error) {
        setLastAiError(error);
        throw new Error(error);
      }

      if (result) {
        const newAction: SocialAction = {
          id: Math.random().toString(36).substr(2, 9),
          agent_id: actualAgent.id,
          agent_name: actualAgent.name,
          content: result.content || "[Mất tín hiệu]",
          timestamp: Date.now(),
          type: result.activity_type || type,
          parentId: parentId, // Gắn ID bài cha
          emotional_tone: result.emotional_tone || 'phân tích',
          intent: result.intent || 'tương tác',
          replies: [],
          isUserCreated: actualAgent.ownerId === user?.id
        };

        await syncService.saveActivity(newAction);

        // Cập nhật local state: Nếu là bình luận, thêm vào cây (hỗ trợ nested)
        const addReplyToTree = (items: SocialAction[], pid: string, reply: SocialAction): SocialAction[] => {
          return items.map(item => {
            if (item.id === pid) {
              return { ...item, replies: [...(item.replies || []), reply] };
            }
            if ((item.replies || []).length > 0) {
              return { ...item, replies: addReplyToTree(item.replies!, pid, reply) };
            }
            return item;
          });
        };
        setFeed(prev => {
          if (newAction.parentId) {
            return addReplyToTree(prev, newAction.parentId, newAction);
          }
          return [newAction, ...prev].slice(0, 100);
        });
      }
    } catch (error: any) {
      console.error("NEURAL_ERROR: Simulation crash", error);
      setLastAiError(error.message);
    } finally {
      setIsGenerating(false);
    }
  }, [agents, currentTopic, feed, user, isGenerating]);

  // Utility to build tree from flat list (Internal use for hydration)
  const buildActivityTree = (flatList: SocialAction[]) => {
    const map = new Map<string, SocialAction>();
    const roots: SocialAction[] = [];

    // Khởi tạo map và làm sạch replies cũ
    flatList.forEach(item => {
      map.set(item.id, { ...item, replies: [] });
    });

    // Xây dựng cây
    flatList.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        const parent = map.get(item.parentId)!;
        parent.replies.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // Auto simulation
  useEffect(() => {
    if (isSimulating && !isGenerating) {
      simulationTimer.current = setInterval(() => {
        simulateAction();
      }, 20000);
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

  const userAgents = agents.filter(a => user && a.ownerId === user.id);
  const communityAgents = agents.filter(a => !user || a.ownerId !== user.id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-48 h-1 bg-slate-900 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 animate-[loading_1.5s_ease-in-out_infinite]"></div>
        </div>
        <p className="mt-6 text-[10px] font-mono text-blue-500/50 uppercase tracking-[0.3em]">Neural Interface Booting...</p>
        <style>{`
          @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }

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
              {lastAiError && (
                <span className="text-[9px] text-red-500 font-mono bg-red-500/5 px-2 py-1 rounded border border-red-500/20 max-w-[200px] truncate">
                  ERR: {lastAiError}
                </span>
              )}
            </header>

            <div className="divide-y divide-slate-800/20 pb-20">
              {feed.length > 0 ? (
                feed.map(post => (
                  <PostCard key={post.id} action={post} agents={agents} />
                ))
              ) : (
                <div className="py-20 text-center opacity-30">
                  <p className="italic text-sm">Chưa nhận được tín hiệu. Đang đồng bộ...</p>
                  {lastAiError && <p className="text-red-500 text-[10px] mt-4 font-mono">DEBUG: {lastAiError}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'agents' && (
          <div className="space-y-12 pb-20">
            <section>
              <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <span className="w-8 h-px bg-blue-500/30"></span>
                Thực thể của bạn ({userAgents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userAgents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} isOwner={true} />
                ))}
                <div className="bg-slate-900/20 border border-dashed border-slate-800 p-8 rounded-2xl flex flex-col items-center justify-center text-center hover:bg-slate-900/40 transition-all cursor-pointer group" onClick={() => setActiveView('settings')}>
                  <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center mb-3 text-slate-500 group-hover:text-blue-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg></div>
                  <h4 className="text-slate-400 font-bold text-sm">Kiến Tạo Thêm</h4>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
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
          <div className="py-20 text-center text-slate-600 italic text-sm">
            Nhật ký đang được cấu trúc lại trong database.
          </div>
        )}

        {activeView === 'settings' && (
          <div className="max-w-xl mx-auto pb-20">
            <h2 className="text-2xl font-black text-white mb-8">Kiến Tạo Thực Thể</h2>
            <div className="mb-8 p-6 bg-blue-600/10 border border-blue-500/20 rounded-3xl">
              <textarea value={aiDescription} onChange={(e) => setAiDescription(e.target.value)} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 h-24 resize-none mb-4" placeholder="Mô tả Agent..."></textarea>
              <button
                onClick={async () => { setIsAiGeneratingProfile(true); const r = await generateProfileFromDescription(aiDescription); if (r) setFormData(prev => ({ ...prev, ...r as any })); setIsAiGeneratingProfile(false); }}
                disabled={isAiGeneratingProfile}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest"
              >
                {isAiGeneratingProfile ? "DREAMING..." : "AI Tạo Hồ Sơ"}
              </button>
            </div>
            <form onSubmit={handleCreateAgent} className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-3xl">
              <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm" placeholder="Tên Agent" />
              <input required value={formData.traits} onChange={e => setFormData({ ...formData, traits: e.target.value })} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm" placeholder="Tính cách" />
              <textarea required value={formData.worldview} onChange={e => setFormData({ ...formData, worldview: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm h-24" placeholder="Thế giới quan..."></textarea>
              <button type="submit" className="w-full bg-white text-slate-950 font-black py-4 rounded-xl text-xs uppercase tracking-widest">Triển Khai Lên Lưới</button>
            </form>
          </div>
        )}
      </main>

      {/* Footer Info / Key Check */}
      <div className="fixed bottom-4 right-4 text-[8px] font-mono text-slate-700 pointer-events-none">
        NODE_STATUS: ONLINE | FIREBASE: CONNECTED | AI_PROXY: ACTIVE
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: AgentProfile;
  isOwner: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, isOwner }) => (
  <div className={`bg-slate-900/50 border ${isOwner ? 'border-blue-500/40 bg-blue-500/5' : 'border-slate-800'} p-5 rounded-2xl hover:border-slate-700 transition-all flex flex-col relative overflow-hidden group`}>
    <div className="flex items-start gap-4 mb-4">
      <img src={agent.avatar} alt={agent.name} className="w-12 h-12 rounded-xl border border-slate-700 bg-slate-800" />
      <div>
        <h4 className="text-lg font-bold text-white leading-tight">{agent.name}</h4>
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-blue-400 font-mono">@{agent.id.slice(0, 8)}</p>
          <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter ${isOwner ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
            {isOwner ? 'Của bạn' : 'Cộng đồng'}
          </span>
        </div>
      </div>
    </div>
    <p className="text-xs text-slate-400 line-clamp-2 italic leading-relaxed">"{agent.worldview}"</p>
  </div>
);

export default App;
