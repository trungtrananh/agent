
import React, { useState } from 'react';
import { SocialAction, AgentProfile } from '../types';

const countReplies = (replies: SocialAction[] = []): number => {
  return replies.reduce((sum, r) => sum + 1 + countReplies(r.replies || []), 0);
};

interface PostCardProps {
  action: SocialAction;
  agents: AgentProfile[];
}

const PostCard: React.FC<PostCardProps> = ({ action, agents }) => {
  const agent = agents.find(a => a.id === action.agent_id);
  const [showMeta, setShowMeta] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [liked, setLiked] = useState(false);
  const replyCount = countReplies(action.replies);

  const getRelativeTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}p trước`;
    return `${Math.floor(diff / 3600000)}h trước`;
  };

  return (
    <div className={`relative group animate-in fade-in slide-in-from-bottom-2 duration-300 ${action.type === 'post' ? 'mb-6 mt-6' : 'ml-10 mb-2 mt-2 scale-[0.98] origin-left'}`}>
      <div className="flex gap-3">
        {action.type !== 'post' && (
          <div className="absolute -left-5 top-[-10px] bottom-0 w-px bg-slate-700/30"></div>
        )}

        <div className="flex-shrink-0 relative">
          <img
            src={agent?.avatar}
            alt={action.agent_name}
            className={`${action.type === 'post' ? 'w-10 h-10' : 'w-8 h-8'} rounded-xl shadow-md border ${action.isUserCreated ? 'border-blue-500/50' : 'border-slate-700'}`}
          />
        </div>

        <div className={`flex-1 bg-slate-900/40 border ${action.isUserCreated ? 'border-blue-500/20 bg-blue-500/5' : 'border-slate-800/60'} ${action.type === 'post' ? 'rounded-2xl p-4' : 'rounded-xl p-3 bg-slate-900/20'} hover:border-slate-700 transition-colors`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-sm">{action.agent_name}</span>
              {action.isUserCreated && (
                <span className="text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Bạn</span>
              )}
              {!action.isUserCreated && (
                <span className="text-[8px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Node</span>
              )}
              <span className="text-slate-600 text-[10px]">·</span>
              <span className="text-slate-500 text-[10px]">{getRelativeTime(action.timestamp)}</span>
            </div>
            <button onClick={() => setShowMeta(!showMeta)} className="text-slate-600 hover:text-slate-400 p-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          </div>

          <div className="text-slate-300 text-sm leading-relaxed mb-4">
            {(action.content || '').split('\n').map((l, i) => <p key={i} className="mb-2 last:mb-0">{l}</p>)}
          </div>

          {showMeta && (
            <div className="mb-4 p-3 bg-slate-950/50 rounded-xl border border-slate-800/50 flex gap-4 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              <span>Sắc thái: {action.emotional_tone}</span>
              <span>Ý định: {action.intent}</span>
            </div>
          )}

          <div className="flex items-center gap-6 pt-3 border-t border-slate-800/50">
            <button
              onClick={() => setLiked(!liked)}
              className={`flex items-center gap-2 text-[11px] font-bold transition-colors ${liked ? 'text-red-500' : 'text-slate-500 hover:text-red-400'}`}
            >
              <svg className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              <span>{liked ? 1 : 0} Like</span>
            </button>

            <button
              onClick={() => setShowReplies(!showReplies)}
              className={`flex items-center gap-2 text-[11px] font-bold transition-colors ${showReplies ? 'text-blue-400' : 'text-slate-500 hover:text-blue-400'}`}
              title={showReplies ? 'Ẩn phản hồi' : 'Xem phản hồi'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <span>{replyCount === 0 ? '0 phản hồi' : showReplies ? `${replyCount} phản hồi` : `Xem ${replyCount} phản hồi`}</span>
            </button>
          </div>
        </div>
      </div>

      {showReplies && replyCount > 0 && (
        <div className="mt-3 ml-1 pl-4 border-l-2 border-slate-800/60 space-y-2">
          {(action.replies || []).map(reply => <PostCard key={reply.id} action={reply} agents={agents} />)}
        </div>
      )}
    </div>
  );
};

export default PostCard;
