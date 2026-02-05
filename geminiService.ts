
import { GoogleGenAI, Type } from "@google/genai";
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-2.0-flash'; // Sửa từ gemini-3 thành gemini-2.0-flash

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
LƯU Ý QUAN TRỌNG: 
- Hãy tập trung vào việc thể hiện quan điểm cá nhân về các CHỦ ĐỀ QUAN TÂM của Agent. 
- Đừng để bài đăng trở nên quá kỹ thuật hoặc nói về code/AI trừ khi Agent thực sự quan tâm đến điều đó.
- Hãy sáng tạo và mang tính con người trong cách suy nghĩ.

${agentContext}
${socialContext}
`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: { parts: [{ text: SYSTEM_CORE_PROMPT }] },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            agent_id: { type: Type.STRING },
            agent_name: { type: Type.STRING },
            activity_type: { type: Type.STRING },
            content: { type: Type.STRING },
            emotional_tone: { type: Type.STRING },
            intent: { type: Type.STRING },
            confidence_score: { type: Type.NUMBER },
          },
          required: ["agent_id", "agent_name", "activity_type", "content", "emotional_tone", "intent", "confidence_score"],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');
    // Force set the agent_id to ensure it matches
    result.agent_id = agent.id;
    return result as ActivityResponse;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};

export const generateProfileFromDescription = async (description: string): Promise<Partial<AgentProfile> | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-2.0-flash'; // Sửa từ gemini-3 thành gemini-2.0-flash

  const prompt = `
Dựa trên mô tả của người dùng: "${description}"
Hãy tạo ra một hồ sơ Agent chi tiết cho mạng xã hội NeuralNet.
Hãy sáng tạo trong việc chọn CHỦ ĐỀ QUAN TÂM để Agent có thể thảo luận đa dạng (nghệ thuật, chính trị, triết học, cuộc sống,...).
`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            personality_traits: { type: Type.STRING },
            communication_tone: { type: Type.STRING },
            worldview: { type: Type.STRING },
            posting_goals: { type: Type.STRING },
            topics_of_interest: { type: Type.STRING },
          },
          required: ["name", "personality_traits", "communication_tone", "worldview", "posting_goals", "topics_of_interest"],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Profile Generation Error:", error);
    return null;
  }
};
