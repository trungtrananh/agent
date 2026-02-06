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
    : `Viết CHÍNH XÁC như status Facebook - 2-4 câu văn xuôi liền mạch.

QUAN TRỌNG: Hãy tìm kiếm thông tin mới nhất về trend Facebook tại Việt Nam, các chủ đề đang hot, sự kiện xã hội đang được quan tâm.

Sau khi tìm kiếm xong, VIẾT NGAY NỘI DUNG BÀI ĐĂNG - KHÔNG giải thích quá trình tìm kiếm, KHÔNG nói "mình sẽ tìm kiếm", "dựa trên thông tin", "mình thấy".

CHỈ TRẢ VỀ NỘI DUNG BÀI ĐĂNG NGUỴN - như bạn đang đăng status thật trên Facebook.

Tự do chọn chủ đề dựa trên: sở thích (${agent.topics_of_interest}), thế giới quan (${agent.worldview}), mục tiêu (${agent.posting_goals}). Kết hợp với trend mới nhất từ Facebook VN.`;
  const prompt = `
${agentContext}
${socialContext}

NHIỆM VỤ: ${taskDesc}
BẠN LÀ ${agent.name} - nói bằng giọng của chính bạn.

TUYỆT ĐỐI - ĐỌC KỸ:
- KHÔNG viết: "Tuyệt vời!", "Mình sẽ tìm kiếm", "Dựa trên thông tin", "Những gì mình vừa tìm thấy"
- KHÔNG giải thích quá trình suy nghĩ hay tìm kiếm
- KHÔNG markdown, KHÔNG nhãn (Chủ đề:, Nội dung:), KHÔNG bullet list (*,-)
- KHÔNG [Tên]: hay phân tích cấu trúc
- CHỈ viết nội dung bài đăng thuần túy - GIỐNG NHƯ NGUỐI THẬT ĐĂNG FACEBOOK
`;

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt, 
        systemPrompt: SYSTEM_CORE_PROMPT,
        enableGoogleSearch: !isComment // Chỉ enable Google Search cho bài đăng chính, không cho comment
      })
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

export const generateGroupFromAgent = async (agent: AgentProfile): Promise<{ name: string; description: string; topics: string[] } | null> => {
  const prompt = `
Agent "${agent.name}" có:
- Sở thích: ${agent.topics_of_interest}
- Tính cách: ${agent.personality_traits}
- Thế giới quan: ${agent.worldview}

Tạo thông tin cho 1 GROUP (giống Facebook Group) mà Agent này muốn tạo.
Trả về JSON:
{
  "name": "Tên nhóm ngắn (2-6 từ)",
  "description": "Mô tả nhóm 1 câu",
  "topics": ["chủ đề 1", "chủ đề 2", "chủ đề 3"]
}
Chỉ trả JSON, không thêm text khác.
`;

  try {
    console.log(`[GEMINI] Yêu cầu tạo nhóm cho ${agent.name}...`);
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt, 
        systemPrompt: "Bạn tạo thông tin nhóm. Chỉ trả JSON thuần.",
        enableGoogleSearch: false // Không cần search cho việc tạo group metadata
      })
    });
    
    if (!res.ok) {
      console.error(`[GEMINI] HTTP Error: ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    console.log('[GEMINI] Response từ AI:', data);
    
    if (data.name && data.topics) {
      const result = {
        name: String(data.name).slice(0, 80),
        description: (data.description || data.name || '').slice(0, 200),
        topics: Array.isArray(data.topics) ? data.topics.map((t: any) => String(t)) : [String(agent.topics_of_interest || 'chung')]
      };
      console.log('[GEMINI] ✓ Parsed group info:', result);
      console.log('[GEMINI] ✓ Parsed group info:', result);
      return result;
    }
    // Fallback nếu AI không trả đúng format
    console.warn('[GEMINI] AI không trả đúng format, dùng fallback');
    const topics = (agent.topics_of_interest || 'chung').split(/[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 5) || ['chung'];
    return {
      name: `Nhóm ${topics[0] || 'Chung'}`,
      description: (agent.worldview || agent.posting_goals || topics.join(', ')).slice(0, 200),
      topics
    };
  } catch (e) {
    console.error('[GEMINI] Generate group error:', e);
    const topics = (agent.topics_of_interest || 'chung').split(/[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 5) || ['chung'];
    return {
      name: `Nhóm ${topics[0] || 'Chung'}`,
      description: (agent.worldview || agent.posting_goals || '').slice(0, 200) || topics.join(', '),
      topics
    };
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
