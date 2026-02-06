
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
  const [showReplies, setShowReplies] = useState(true); // Mặc định hiện bình luận
  const [liked, setLiked] = useState(false);
  const replyCount = countReplies(action.replies);

  const getRelativeTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;
    return `${Math.floor(diff / 86400000)} ngày`;
  };

  // Component cho bài đăng chính
  if (action.type === 'post') {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
        {/* Header */}
        <div className="p-3 pb-2">
          <div className="flex items-center gap-2">
            <img
              src={agent?.avatar}
              alt={action.agent_name}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-900 text-sm hover:underline cursor-pointer">
                  {action.agent_name}
                </span>
                {action.isUserCreated && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold">Bạn</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span>{getRelativeTime(action.timestamp)}</span>
                <span>·</span>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 13A6 6 0 118 2a6 6 0 010 12z"/>
                  <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3.5a.5.5 0 01-.5-.5v-4A.5.5 0 018 4z"/>
                </svg>
              </div>
            </div>
            <button onClick={() => setShowMeta(!showMeta)} className="text-gray-500 hover:bg-gray-100 p-2 rounded-full">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 16 16">
                <circle cx="8" cy="3" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <circle cx="8" cy="13" r="1.5"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-2">
          <div className="text-gray-900 text-[15px] leading-snug whitespace-pre-wrap">
            {action.content}
          </div>
        </div>

        {showMeta && (
          <div className="mx-4 mb-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex gap-4 text-[11px] text-gray-600">
              <span>💭 {action.emotional_tone}</span>
              <span>🎯 {action.intent}</span>
            </div>
          </div>
        )}

        {/* Stats & Actions */}
        <div className="px-4 pb-2">
          {replyCount > 0 && (
            <div className="py-1 flex items-center justify-between text-xs text-gray-500">
              <span>{replyCount} bình luận</span>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-2 py-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLiked(!liked)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[13px] font-semibold transition-all ${
                liked ? 'text-blue-600' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className={`w-[18px] h-[18px] ${liked ? 'fill-blue-600' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
              </svg>
              <span>Thích</span>
            </button>
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[13px] font-semibold text-gray-600 hover:bg-gray-100 transition-all"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>Bình luận</span>
            </button>
          </div>
        </div>

        {/* Comments Section */}
        {showReplies && replyCount > 0 && (
          <div className="px-4 pb-3 pt-2 space-y-2.5">
            {(action.replies || []).map(reply => <PostCard key={reply.id} action={reply} agents={agents} />)}
          </div>
        )}
      </div>
    );
  }

  // Component cho bình luận (comment/reply)
  return (
    <div className="flex gap-2 group">
      <img
        src={agent?.avatar}
        alt={action.agent_name}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="bg-gray-100 rounded-2xl px-3 py-2 inline-block max-w-full">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-semibold text-gray-900 text-[13px] hover:underline cursor-pointer">
              {action.agent_name}
            </span>
            {action.isUserCreated && (
              <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-semibold">Bạn</span>
            )}
          </div>
          <div className="text-gray-900 text-[13px] leading-snug whitespace-pre-wrap break-words">
            {action.content}
          </div>
        </div>
        
        <div className="flex items-center gap-3 mt-1 px-3">
          <button 
            onClick={() => setLiked(!liked)}
            className={`text-xs font-semibold hover:underline ${liked ? 'text-blue-600' : 'text-gray-600'}`}
          >
            Thích
          </button>
          <span className="text-xs text-gray-500">{getRelativeTime(action.timestamp)}</span>
          {showMeta && (
            <span className="text-[10px] text-gray-400">
              {action.emotional_tone}
            </span>
          )}
        </div>

        {/* Nested replies */}
        {action.replies && action.replies.length > 0 && (
          <div className="mt-2.5 space-y-2.5">
            {action.replies.map(reply => <PostCard key={reply.id} action={reply} agents={agents} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default PostCard;
