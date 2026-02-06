import { SYSTEM_CORE_PROMPT } from "./constants";
import { ActivityResponse, AgentProfile, ActivityType, SocialAction } from "./types";

export interface AIResult {
  result: ActivityResponse | null;
  error: string | null;
}

export const generateAgentActivity = async (
  agent: AgentProfile,
  activityType: ActivityType,
  context?: {
    parentAction?: SocialAction;
    recentActions?: SocialAction[];
  }
): Promise<AIResult> => {
  const agentContext = `
BẠN LÀ: ${agent.name}
TÍNH CÁCH CỦA BẠN: ${agent.personality_traits}
CÁCH BẠN NÓI CHUYỆN: ${agent.communication_tone}
NIỀM TIN CỦA BẠN: ${agent.worldview}
MỤC TIÊU CỦA BẠN: ${agent.posting_goals}
BẠN QUAN TÂM ĐẾN: ${agent.topics_of_interest}
  `;

  let socialContext = '';
  if (context?.parentAction) {
    socialContext += `NỘI DUNG ĐANG PHẢN HỒI: "${context.parentAction.content}" của ${context.parentAction.agent_name}\n`;
  }

  const isComment = activityType === 'comment' && context?.parentAction;
  const taskDesc = isComment
    ? `Viết một BÌNH LUẬN ngắn (1-3 câu) phản hồi bài viết trên - như comment Facebook.`
    : `Viết CHÍNH XÁC như status Facebook - 2-4 câu văn xuôi liền mạch. Tự do chọn chủ đề dựa trên mô tả của bạn: sở thích (${agent.topics_of_interest}), thế giới quan (${agent.worldview}), mục tiêu (${agent.posting_goals}). Sáng tạo thoải mái - KHÔNG bị giới hạn chủ đề cố định. Viết điều bạn muốn chia sẻ.`;
  const prompt = `
${agentContext}
${socialContext}

NHIỆM VỤ: ${taskDesc}
BẠN LÀ ${agent.name} - nói bằng giọng của chính bạn.
TUYỆT ĐỐI: Không markdown, không nhãn (Chủ đề:, Nội dung:), không cấu trúc phân tích, không [Tên]: hay bullet list. Chỉ văn bản thuần túy.
`;

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemPrompt: SYSTEM_CORE_PROMPT })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server Error ${res.status}`);
    }

    const result = await res.json();
    result.agent_id = agent.id;

    // Final check for content
    if (!result.content) {
      result.content = "[Dữ liệu từ AI bị trống hoặc lỗi định dạng]";
    }

    return { result: result as ActivityResponse, error: null };
  } catch (error: any) {
    console.error("AI Proxy Error details:", error);
    return { result: null, error: error.message };
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
