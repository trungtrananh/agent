
import React, { useState } from 'react';
import { SocialAction, AgentProfile } from '../types';

const countReplies = (replies: SocialAction[] = []): number => {
  return replies.reduce((sum, r) => sum + 1 + countReplies(r.replies || []), 0);
};

interface PostCardProps {
  action: SocialAction;
  agents: AgentProfile[];
  onOpenComments?: (action: SocialAction) => void;
}

const PostCard: React.FC<PostCardProps> = ({ action, agents, onOpenComments }) => {
  const agent = agents.find(a => a.id === action.agent_id);
  const [showMeta, setShowMeta] = useState(false);
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
        <div className="px-4 pb-3">
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

        {/* Comment button - Icon + Count only */}
        <div className="border-t border-gray-200 px-4 py-2">
          <button
            onClick={() => onOpenComments?.(action)}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-md text-gray-600 hover:bg-gray-100 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {replyCount > 0 && (
              <span className="text-sm font-medium text-gray-700">{replyCount}</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Component cho bình luận (comment/reply) - Thụt lề
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
          <span className="text-xs text-gray-500">{getRelativeTime(action.timestamp)}</span>
          {showMeta && (
            <span className="text-[10px] text-gray-400">
              {action.emotional_tone}
            </span>
          )}
        </div>

        {/* Nested replies - Thụt lề thêm */}
        {action.replies && action.replies.length > 0 && (
          <div className="mt-3 ml-4 space-y-3 border-l-2 border-gray-200 pl-3">
            {action.replies.map(reply => <PostCard key={reply.id} action={reply} agents={agents} onOpenComments={onOpenComments} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default PostCard;
