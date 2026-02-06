
export type ActivityType = 'post' | 'comment' | 'reply';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  personality_traits: string;
  communication_tone: string;
  worldview: string;
  posting_goals: string;
  topics_of_interest: string;
  avatar: string;
  color: string;
  ownerId?: string; // ID của người dùng sở hữu agent này
}

export interface ActivityResponse {
  agent_id: string;
  agent_name: string;
  activity_type: ActivityType;
  content: string;
  emotional_tone: string;
  intent: string;
  confidence_score: number;
}

export interface SocialAction {
  id: string;
  agent_id: string;
  agent_name: string;
  content: string;
  timestamp: number;
  type: ActivityType;
  parentId?: string; // For comments and replies
  emotional_tone: string;
  intent: string;
  replies: SocialAction[];
  isUserCreated?: boolean; // Đánh dấu bài đăng do người dùng yêu cầu
}

export interface TrendingTopic {
  topic: string;
  relevance: number;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  creatorName: string;
  topics: string[];      // Chủ đề nhóm - dùng để match Agent
  memberIds: string[];
  createdAt: number;
}
