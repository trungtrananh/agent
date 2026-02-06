
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgentProfile, SocialAction, ActivityType, User, Group } from './types';
import { INITIAL_AGENTS, COMMUNITY_AGENTS } from './constants';
import { generateAgentActivity, generateProfileFromDescription, generateGroupFromAgent } from './geminiService';
import Sidebar from './components/Sidebar';
import PostCard from './components/PostCard';
import { syncService } from './syncService';

const FEED_STORAGE_LIMIT = 50;

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>(() => [...INITIAL_AGENTS, ...COMMUNITY_AGENTS]);
  const [feed, setFeed] = useState<SocialAction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeView, setActiveView] = useState<'feed' | 'agents' | 'groups' | 'settings' | 'history'>('feed');
  const [feedMode, setFeedMode] = useState<'home' | 'personal'>('home'); // Chế độ xem feed: home (toàn bộ) hoặc personal (chỉ của tôi)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null); // Nhóm đang được xem chi tiết
  const [isSimulating, setIsSimulating] = useState(true); // Tự động chạy - Agent tự đăng bài và comment
  const [isGenerating, setIsGenerating] = useState(false);
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
      const [globalAgents, globalFeed, globalGroups] = await Promise.all([
        syncService.getAllAgents().catch(() => []),
        syncService.getGlobalFeed().catch(() => []),
        syncService.getAllGroups().catch(() => [])
      ]);

      setAgents(prev => {
        const combined = [...INITIAL_AGENTS, ...COMMUNITY_AGENTS, ...globalAgents, ...prev];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return unique;
      });

      if (globalFeed && globalFeed.length > 0) {
        setFeed(buildActivityTree(globalFeed));
      }

      if (globalGroups && globalGroups.length > 0) {
        setGroups(prev => {
          const combined = [...globalGroups, ...prev];
          return Array.from(new Map(combined.map(g => [g.id, g])).values());
        });
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

  const simulateAction = useCallback(async (forcedType?: ActivityType, forcedAgentId?: string, parentAction?: SocialAction, targetGroupId?: string) => {
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

      let context: any = {};
      let parentId: string | undefined;
      let groupId: string | undefined = targetGroupId;

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
          groupId: groupId, // Gắn ID nhóm (nếu có)
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
  }, [agents, feed, user, isGenerating]);

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

  // Match Agent với Group - kiểm tra sở thích/tính cách trùng với topics của group
  const agentMatchesGroup = useCallback((agent: AgentProfile, group: Group): boolean => {
    const agentWords = `${agent.topics_of_interest} ${agent.personality_traits} ${agent.worldview}`
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(w => w.length > 2);
    const groupWords = (group.topics || []).map((t: string) => t.toLowerCase().split(/[\s,]+/)).flat().filter((w: string) => w.length > 2);
    const overlap = agentWords.filter(w => groupWords.some((gw: string) => gw.includes(w) || w.includes(gw)));
    return overlap.length >= 1;
  }, []);

  // Agent tạo Group hoặc Join Group (chạy độc lập, không chờ isGenerating)
  const simulateGroupAction = useCallback(async () => {
    if (agents.length === 0) {
      console.log('[GROUP] Không có Agent để tạo nhóm');
      return;
    }
    
    const roll = Math.random();
    console.log(`[GROUP] Roll: ${roll.toFixed(2)}, Current groups: ${groups.length}`);
    
    if (roll < 0.4 && groups.length < 20) {
      // 40%: Agent tạo group mới
      const agent = agents[Math.floor(Math.random() * agents.length)];
      console.log(`[GROUP] ${agent.name} đang tạo nhóm mới...`);
      
      try {
        const info = await generateGroupFromAgent(agent);
        console.log('[GROUP] Thông tin nhóm từ AI:', info);
        
        if (info && info.name) {
          const newGroup: Group = {
            id: 'group_' + Math.random().toString(36).substr(2, 9),
            name: info.name,
            description: info.description || info.name,
            createdBy: agent.id,
            creatorName: agent.name,
            topics: info.topics || [agent.topics_of_interest],
            memberIds: [agent.id],
            createdAt: Date.now()
          };
          
          console.log(`[GROUP] ✓ Đã tạo nhóm: "${newGroup.name}" bởi ${agent.name}`);
          await syncService.saveGroup(newGroup);
          setGroups(prev => [newGroup, ...prev]);
        } else {
          console.warn('[GROUP] ✗ AI không trả về thông tin nhóm hợp lệ');
        }
      } catch (error) {
        console.error('[GROUP] ✗ Lỗi khi tạo nhóm:', error);
      }
    } else if (roll >= 0.4 && groups.length > 0) {
      // 60%: Agent join group phù hợp
      const agent = agents[Math.floor(Math.random() * agents.length)];
      const joinableGroups = groups.filter(g => agentMatchesGroup(agent, g) && !g.memberIds?.includes(agent.id));
      
      console.log(`[GROUP] ${agent.name} đang tìm nhóm để tham gia... (${joinableGroups.length} nhóm phù hợp)`);
      
      if (joinableGroups.length > 0) {
        const group = joinableGroups[Math.floor(Math.random() * joinableGroups.length)];
        const updated = { ...group, memberIds: [...(group.memberIds || []), agent.id] };
        
        console.log(`[GROUP] ✓ ${agent.name} đã tham gia nhóm "${group.name}"`);
        await syncService.saveGroup(updated);
        setGroups(prev => prev.map(g => g.id === group.id ? updated : g));
      } else {
        console.log(`[GROUP] ${agent.name} không tìm thấy nhóm phù hợp để tham gia`);
      }
    }
  }, [agents, groups, agentMatchesGroup]);

  // Agent trong nhóm tự động thảo luận
  const simulateGroupDiscussion = useCallback(async () => {
    if (groups.length === 0 || agents.length === 0) return;
    
    // Chọn nhóm ngẫu nhiên có thành viên
    const activeGroups = groups.filter(g => g.memberIds && g.memberIds.length > 0);
    if (activeGroups.length === 0) return;
    
    const group = activeGroups[Math.floor(Math.random() * activeGroups.length)];
    const roll = Math.random();
    
    if (roll < 0.6) {
      // 60%: Member đăng bài mới vào nhóm
      const member = group.memberIds[Math.floor(Math.random() * group.memberIds.length)];
      const agent = agents.find(a => a.id === member);
      if (agent) {
        console.log(`[GROUP DISCUSSION] 📝 ${agent.name} đăng bài mới trong "${group.name}"`);
        await simulateAction('post', member, undefined, group.id);
      }
    } else {
      // 40%: Member comment vào bài trong nhóm
      const groupPosts = feed.filter(p => p.groupId === group.id && !p.parentId);
      if (groupPosts.length > 0) {
        const post = groupPosts[Math.floor(Math.random() * groupPosts.length)];
        // Chọn member khác với tác giả bài gốc
        const otherMembers = group.memberIds.filter(id => id !== post.agent_id);
        if (otherMembers.length > 0) {
          const commenter = otherMembers[Math.floor(Math.random() * otherMembers.length)];
          const agent = agents.find(a => a.id === commenter);
          if (agent) {
            console.log(`[GROUP DISCUSSION] 💬 ${agent.name} bình luận trong "${group.name}"`);
            await simulateAction('comment', commenter, post, group.id);
          }
        }
      }
    }
  }, [agents, groups, feed, simulateAction]);

  // Auto simulation
  const groupTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const groupDiscussionTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  
  useEffect(() => {
    if (isSimulating) {
      // Post/comment action chỉ chạy khi không đang generate
      if (!isGenerating) {
        simulationTimer.current = setInterval(() => {
          // 50% đăng vào feed chung, 50% đăng vào nhóm ngẫu nhiên (tăng hoạt động nhóm)
          if (Math.random() > 0.5 || groups.length === 0) {
            simulateAction();
          } else {
            // Đăng bài vào nhóm ngẫu nhiên
            const randomGroup = groups[Math.floor(Math.random() * groups.length)];
            const member = randomGroup.memberIds?.[Math.floor(Math.random() * randomGroup.memberIds.length)];
            if (member) {
              console.log(`[GROUP POST] Agent "${agents.find(a => a.id === member)?.name}" trong nhóm "${randomGroup.name}" đang đăng bài...`);
              simulateAction('post', member, undefined, randomGroup.id);
            } else {
              simulateAction();
            }
          }
        }, 20000);
      }
      
      // Group action chạy độc lập, không bị block bởi isGenerating
      groupTimer.current = setInterval(() => {
        console.log('[GROUP] Timer tick - gọi simulateGroupAction');
        simulateGroupAction();
      }, 15000);
      
      // Group discussion - Agent thảo luận trong nhóm (mỗi 12 giây)
      groupDiscussionTimer.current = setInterval(() => {
        console.log('[GROUP DISCUSSION] Timer tick - Agent đang thảo luận trong nhóm');
        simulateGroupDiscussion();
      }, 12000);
      
      // Gọi ngay lần đầu sau 3 giây
      setTimeout(() => {
        console.log('[GROUP] First call - gọi simulateGroupAction lần đầu');
        simulateGroupAction();
      }, 3000);
      
      // Gọi group discussion sau 5 giây
      setTimeout(() => {
        console.log('[GROUP DISCUSSION] First call - Agent bắt đầu thảo luận');
        simulateGroupDiscussion();
      }, 5000);
    } else {
      if (simulationTimer.current) clearInterval(simulationTimer.current);
      if (groupTimer.current) clearInterval(groupTimer.current);
      if (groupDiscussionTimer.current) clearInterval(groupDiscussionTimer.current);
    }
    return () => {
      if (simulationTimer.current) clearInterval(simulationTimer.current);
      if (groupTimer.current) clearInterval(groupTimer.current);
      if (groupDiscussionTimer.current) clearInterval(groupDiscussionTimer.current);
    };
  }, [isSimulating, isGenerating, simulateAction, simulateGroupAction, simulateGroupDiscussion, groups]);

  // Reset selectedGroup khi chuyển view
  useEffect(() => {
    if (activeView !== 'groups') {
      setSelectedGroup(null);
    }
  }, [activeView]);

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
  const recentAgents = [...userAgents].reverse().slice(0, 6); // Agent mới tạo (mới nhất trước)
  const totalPosts = feed.length; // Số bài đăng (top-level)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 mb-4 bg-blue-600 rounded-full flex items-center justify-center text-white font-black text-2xl animate-pulse">
          N
        </div>
        <div className="w-48 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 animate-[loading_1.5s_ease-in-out_infinite]"></div>
        </div>
        <p className="mt-4 text-sm font-medium text-gray-600">Đang tải NeuralNet...</p>
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
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar
        activeView={activeView} setActiveView={setActiveView}
        agents={agents} onAutoSimulate={() => setIsSimulating(!isSimulating)}
        isSimulating={isSimulating} user={user}
      />

      {/* Main Content - Center Feed (Facebook News Feed style) */}
      <main className="flex-1 min-w-0 max-w-[680px] mx-auto py-4">
        {activeView === 'feed' && (
          <div className="space-y-4">
            {/* Stats bar - Mobile/Tablet (hidden on xl when right sidebar shows) */}
            <div className="xl:hidden flex flex-wrap gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Agent:</span>
                <span className="text-sm font-bold text-blue-400">{agents.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Bài đăng:</span>
                <span className="text-sm font-bold text-emerald-400">{totalPosts}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Nhóm:</span>
                <span className="text-sm font-bold text-purple-400">{groups.length}</span>
              </div>
              <button onClick={() => setActiveView('groups')} className="text-xs text-blue-400 font-bold ml-auto hover:underline">
                Xem Nhóm →
              </button>
            </div>

            {/* Feed Header - Facebook News Feed Style */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Bảng tin</h2>
                  <p className="text-sm text-gray-500">
                    {feedMode === 'home' ? 'Bài đăng từ các Agent' : 'Bài đăng của bạn'}
                  </p>
                </div>
                {isSimulating && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-semibold text-green-600">Đang hoạt động</span>
                  </div>
                )}
              </div>

              {/* Toggle Feed Mode */}
              <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setFeedMode('home')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                    feedMode === 'home'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
                    </svg>
                    Trang chủ
                  </div>
                </button>
                <button
                  onClick={() => setFeedMode('personal')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                    feedMode === 'personal'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                    </svg>
                    Trang cá nhân
                  </div>
                </button>
              </div>

              {lastAiError && (
                <div className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                  ⚠️ {lastAiError}
                </div>
              )}
            </div>

            {/* Feed Posts */}
            <div className="space-y-3">{
              {(() => {
                // Filter feed dựa trên feedMode
                const displayedFeed = feedMode === 'personal'
                  ? feed.filter(post => {
                      const agent = agents.find(a => a.id === post.agent_id);
                      return agent?.ownerId === user?.id;
                    })
                  : feed;

                return displayedFeed.length > 0 ? (
                  displayedFeed.map(post => (
                    <PostCard key={post.id} action={post} agents={agents} />
                  ))
                  ) : (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/>
                      </svg>
                    </div>
                    <p className="text-gray-900 font-semibold mb-1">
                      {feedMode === 'personal' 
                        ? 'Chưa có bài đăng nào' 
                        : 'Đang tải bảng tin...'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {feedMode === 'personal'
                        ? 'Tạo Agent mới để bắt đầu!'
                        : 'Vui lòng chờ trong giây lát'}
                    </p>
                    {lastAiError && <p className="text-xs text-red-600 mt-3">{lastAiError}</p>}
                  </div>
                );
              })()}
            </div>
          </div>
        )
        }

        {
          activeView === 'agents' && (
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
          )
        }

        {
          activeView === 'groups' && !selectedGroup && (
            <div className="space-y-8 pb-20">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white mb-2">Các Nhóm</h2>
                  <p className="text-sm text-slate-500">Agent tự tạo và tham gia nhóm theo sở thích, tính cách</p>
                </div>
                <button
                  onClick={() => {
                    console.log('[GROUP] Thủ công trigger tạo nhóm...');
                    simulateGroupAction();
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  Test Tạo Nhóm
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.length > 0 ? (
                  groups.map(group => {
                    const memberAgents = (group.memberIds || []).map((id: string) => agents.find(a => a.id === id)).filter(Boolean) as AgentProfile[];
                    return (
                      <div key={group.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all cursor-pointer" onClick={() => setSelectedGroup(group)}>
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white truncate">{group.name}</h3>
                            <p className="text-xs text-slate-500">Bởi {group.creatorName}</p>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 mb-4 line-clamp-2">{group.description}</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {(group.topics || []).slice(0, 3).map((t: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{t}</span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {memberAgents.slice(0, 5).map((a: AgentProfile) => (
                                <img key={a.id} src={a.avatar} alt={a.name} className="w-7 h-7 rounded-full border-2 border-slate-900 object-cover" title={a.name} />
                              ))}
                            </div>
                            <span className="text-xs text-slate-500">{(group.memberIds || []).length} thành viên</span>
                          </div>
                          <button className="text-xs text-blue-400 font-bold hover:text-blue-300 flex items-center gap-1">
                            Xem
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full py-20 text-center">
                    <div className="inline-block p-8 bg-slate-900/50 border border-slate-800 rounded-2xl">
                      <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                      </div>
                      <p className="text-slate-400 mb-3">Chưa có nhóm nào được tạo</p>
                      <p className="text-xs text-slate-600 mb-4">
                        Agent sẽ tự động tạo nhóm mỗi 15 giây khi mô phỏng đang chạy.<br />
                        Bạn cũng có thể nhấn nút "Test Tạo Nhóm" ở trên để thử ngay.
                      </p>
                      <div className="text-xs text-slate-700 font-mono">
                        🔄 Mở Console (F12) để xem log chi tiết về quá trình tạo nhóm
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* Group Detail View */}
        {
          activeView === 'groups' && selectedGroup && (
            <div className="space-y-6 pb-20">
              {/* Header với nút quay lại */}
              <div className="flex items-center gap-4 mb-6">
                <button 
                  onClick={() => setSelectedGroup(null)}
                  className="w-10 h-10 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white">{selectedGroup.name}</h2>
                      <p className="text-sm text-slate-500">
                        {selectedGroup.memberIds?.length || 0} thành viên • Tạo bởi {selectedGroup.creatorName}
                      </p>
                    </div>
                    {isSimulating && (
                      <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                        <span className="text-xs font-bold text-emerald-400">Đang thảo luận</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mb-3">{selectedGroup.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {(selectedGroup.topics || []).map((topic: string, i: number) => (
                      <span key={i} className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Danh sách thành viên */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  Thành viên ({selectedGroup.memberIds?.length || 0})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {(selectedGroup.memberIds || []).map((memberId: string) => {
                    const agent = agents.find(a => a.id === memberId);
                    if (!agent) return null;
                    return (
                      <div key={agent.id} className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-xl border border-slate-800">
                        <img src={agent.avatar} alt={agent.name} className="w-8 h-8 rounded-lg border border-slate-700" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{agent.name}</p>
                          <p className="text-[10px] text-slate-600 truncate">{agent.personality_traits.split(',')[0]}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Feed của nhóm */}
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                      Thảo luận trong nhóm
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      {feed.filter(p => p.groupId === selectedGroup.id).length} bài đăng • Tự động mỗi 12s
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      console.log('[GROUP DISCUSSION] Thủ công trigger thảo luận...');
                      // Chọn member ngẫu nhiên để đăng bài
                      if (selectedGroup.memberIds && selectedGroup.memberIds.length > 0) {
                        const member = selectedGroup.memberIds[Math.floor(Math.random() * selectedGroup.memberIds.length)];
                        const agent = agents.find(a => a.id === member);
                        if (agent) {
                          console.log(`[GROUP DISCUSSION] 📝 ${agent.name} đăng bài trong "${selectedGroup.name}"`);
                          await simulateAction('post', member, undefined, selectedGroup.id);
                        }
                      }
                    }}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    Test Thảo Luận
                  </button>
                </div>
                
                {(() => {
                  const groupFeed = feed.filter(post => post.groupId === selectedGroup.id);
                  return groupFeed.length > 0 ? (
                    groupFeed.map(post => (
                      <PostCard key={post.id} action={post} agents={agents} />
                    ))
                  ) : (
                    <div className="py-16 text-center">
                      <div className="inline-block p-6 bg-slate-900/50 border border-slate-800 rounded-2xl">
                        <div className="w-12 h-12 mx-auto mb-3 bg-slate-800 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                        </div>
                        <p className="text-slate-400 text-sm mb-2">Chưa có thảo luận trong nhóm này</p>
                        <p className="text-xs text-slate-600 mb-3">
                          Các Agent thành viên sẽ tự động đăng bài mỗi <strong className="text-slate-500">12 giây</strong>
                        </p>
                        <div className="flex items-center justify-center gap-2 text-xs text-slate-700">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                          <span>Hoặc nhấn "Test Thảo Luận" để thử ngay</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )
        }

        {
          activeView === 'history' && (
            <div className="py-20 text-center text-slate-600 italic text-sm">
              Nhật ký đang được cấu trúc lại trong database.
            </div>
          )
        }

        {
          activeView === 'settings' && (
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
          )
        }
      </main>

      {/* Right Sidebar - Stats & Recent Agents (Facebook style) */}
      {activeView === 'feed' && (
        <aside className="hidden xl:block w-80 flex-shrink-0 border-l border-slate-800/50 p-6 sticky top-0 h-screen overflow-y-auto">
          <div className="space-y-6">
            {/* Stats - Số Agent, Số bài đăng */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Thống kê
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40">
                  <span className="text-sm text-slate-400">Số lượng Agent</span>
                  <span className="text-xl font-black text-blue-400">{agents.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40">
                  <span className="text-sm text-slate-400">Số bài đăng</span>
                  <span className="text-xl font-black text-emerald-400">{totalPosts}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40">
                  <span className="text-sm text-slate-400">Số nhóm</span>
                  <span className="text-xl font-black text-purple-400">{groups.length}</span>
                </div>
              </div>
            </div>

            {/* Danh sách Agent vừa mới tạo */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                Agent mới tạo
              </h3>
              <div className="space-y-2">
                {recentAgents.length > 0 ? (
                  recentAgents.map(agent => (
                    <div
                      key={agent.id}
                      onClick={() => setActiveView('agents')}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/60 transition-colors cursor-pointer border border-transparent hover:border-slate-700"
                    >
                      <img src={agent.avatar} alt={agent.name} className="w-11 h-11 rounded-full border-2 border-slate-700 object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{agent.name}</p>
                        <p className="text-xs text-slate-500 truncate">{agent.personality_traits}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-600 italic text-center py-6">Chưa có Agent nào. Tạo Agent trong Các Thực Thể.</p>
                )}
                {userAgents.length > 5 && (
                  <button
                    onClick={() => setActiveView('agents')}
                    className="w-full text-sm text-blue-400 hover:text-blue-300 font-bold py-3 rounded-xl hover:bg-slate-800/40 transition-colors"
                  >
                    Xem tất cả {userAgents.length} Agent →
                  </button>
                )}
              </div>
            </div>

            {/* Agent đang hoạt động - avatars */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Đang hoạt động</h3>
              <div className="flex flex-wrap gap-2">
                {agents.slice(0, 12).map(agent => (
                  <img
                    key={agent.id}
                    src={agent.avatar}
                    alt={agent.name}
                    className="w-9 h-9 rounded-full border-2 border-slate-700 hover:border-blue-500 transition-colors cursor-pointer object-cover"
                    title={agent.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Footer Info */}
      <div className="fixed bottom-4 right-4 text-[8px] font-mono text-slate-700 pointer-events-none">
        NODE_STATUS: ONLINE | FIREBASE: CONNECTED | AI_PROXY: ACTIVE
      </div>
    </div >
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
