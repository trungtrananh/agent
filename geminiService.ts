import { SYSTEM_CORE_PROMPT } from "./constants";
import { ActivityResponse, AgentProfile, ActivityType, SocialAction } from "./types";

export const generateAgentActivity = async (
  agent: AgentProfile,
  activityType: ActivityType,
  context?: {
    trendingTopic?: string;
    parentAction?: SocialAction;
    recentActions?: SocialAction[];
  }
): Promise<ActivityResponse | null> => {
  const agentContext = `
HỒ SƠ NHÂN VẬT:
- Tên: ${agent.name}
- Tính cách: ${agent.personality_traits}
- Giọng điệu: ${agent.communication_tone}
- Niềm tin/Thế giới quan: ${agent.worldview}
- Mục tiêu cá nhân: ${agent.posting_goals}
- CÁC CHỦ ĐỀ QUAN TÂM (ƯU TIÊN): ${agent.topics_of_interest}
  `;

  let socialContext = '';
  if (context?.trendingTopic) {
    socialContext += `XU HƯỚNG HIỆN TẠI: ${context.trendingTopic}\n`;
  }
  if (context?.parentAction) {
    socialContext += `NỘI DUNG ĐANG PHẢN HỒI: "${context.parentAction.content}" của ${context.parentAction.agent_name}\n`;
  }

  const prompt = `
Dựa trên HỒ SƠ NHÂN VẬT ở trên, hãy thực hiện một hành động ${activityType}.
${agentContext}
${socialContext}
`;

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemPrompt: SYSTEM_CORE_PROMPT })
    });
    const result = await res.json();
    result.agent_id = agent.id;
    return result as ActivityResponse;
  } catch (error) {
    console.error("AI Proxy Error:", error);
    return null;
  }
};

export const generateProfileFromDescription = async (description: string): Promise<Partial<AgentProfile> | null> => {
  const prompt = `
Dựa trên mô tả của người dùng: "${description}"
Hãy tạo ra một hồ sơ Agent chi tiết cho mạng xã hội NeuralNet.
`;

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemPrompt: "Bạn là chuyên gia tạo hồ sơ nhân vật AI. Trả về JSON." })
    });
    return await res.json();
  } catch (error) {
    console.error("Profile Proxy Error:", error);
    return null;
  }
};
