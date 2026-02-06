
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Firestore } from '@google-cloud/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// BƯỚC 1: Mở cổng ngay lập tức để Cloud Run không bị timeout
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ NEURALNET CORE ACTIVE ON PORT ${PORT}`);
});

// Xử lý lỗi process để tránh crash container
process.on('uncaughtException', (err) => {
    console.error('BẮT ĐƯỢC LỖI HỆ THỐNG (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('BẮT ĐƯỢC LỖI PROMISE (Unhandled Rejection):', reason);
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Khởi tạo Firestore
let db, agentsCol, feedCol, groupsCol;
try {
    db = new Firestore();
    agentsCol = db.collection('agents');
    feedCol = db.collection('feed');
    groupsCol = db.collection('groups');
    console.log('✅ Firestore linked');
} catch (e) {
    console.error('❌ Firestore init failed (Using ephemeral mode)');
}

// Khởi tạo Gemini Client (Sử dụng cấu trúc an toàn)
let client = null;
const initAi = async () => {
    try {
        // Thử import động để tránh lỗi crash lúc boot nếu package có vấn đề
        const genaiModule = await import("@google/genai");
        // Theo tài liệu mới nhất, thường là GoogleGenAI hoặc createClient
        // Chúng ta sẽ thử lấy đúng constructor
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

        if (genaiModule.createClient) {
            client = genaiModule.createClient({ apiKey });
            console.log('✅ Gemini Client initialized via createClient');
        } else if (genaiModule.GoogleGenAI) {
            client = new genaiModule.GoogleGenAI({ apiKey });
            console.log('✅ Gemini Client initialized via GoogleGenAI');
        } else {
            console.error('❌ Could not find valid Gemini constructor in @google/genai');
        }
    } catch (e) {
        console.error('❌ AI Initialization Failed:', e);
    }
};

initAi();

// Helper to clean and parse JSON from Gemini's response
function safeParseJson(text) {
    console.log('--- RAW AI RESPONSE ---');
    console.log(text);
    console.log('-----------------------');
    
    // BƯớc 1: Loại bỏ các câu giải thích meta-text của LLM
    let cleanedText = text;
    
    // Loại bỏ các câu giải thích đầu tiên (trước khi vào nội dung thực)
    const metaPhrases = [
        /Tuyệt vời!.*?nhé\./gs,
        /Để bắt đầu.*?\./gs,
        /Mình sẽ tìm kiếm.*?\./gs,
        /Dựa trên.*?thấy:/gs,
        /Dựa trên.*?nổi bật:/gs,
        /Dựa trên.*?tìm được[,:]?/gs,
        /Dựa trên.*?tìm kiếm được[,:]?/gs,
        /Những gì.*?thấy[,:]?/gs,
        /Theo những gì.*?[,:]?/gs,
        /Các chủ đề nổi bật:?/gs
    ];
    
    for (const pattern of metaPhrases) {
        cleanedText = cleanedText.replace(pattern, '');
    }
    
    // Loại bỏ markdown list (* hoặc -)
    cleanedText = cleanedText.replace(/^\s*[\*\-]\s+/gm, '');
    
    // Loại bỏ các dòng chỉ có dấu * hoặc bullet
    cleanedText = cleanedText.replace(/^[\*\-\u2022]+\s*$/gm, '');
    
    // Trim khoảng trắng thừa
    cleanedText = cleanedText.trim();
    
    try {
        const cleaned = cleanedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (!parsed.content) {
            const keys = Object.keys(parsed);
            for (let k of keys) {
                if (typeof parsed[k] === 'string' && parsed[k].length > 10) {
                    parsed.content = parsed[k];
                    break;
                }
            }
        }

        // CHIẾN LƯỢC HẠT NHÂN: Trích xuất nội dung thực sự từ bên trong dấu ngoặc kép
        if (parsed.content) {
            let content = parsed.content;
            
            // Loại bỏ meta-text trong content
            for (const pattern of metaPhrases) {
                content = content.replace(pattern, '');
            }
            
            // Loại bỏ markdown
            content = content.replace(/^\s*[\*\-]\s+/gm, '');
            content = content.replace(/^[\*\-\u2022]+\s*$/gm, '');

            // Nếu content có dạng "Tuyệt vời!... **Nội dung:**\n\n"..." -> Lấy phần trong ngoặc kép cuối cùng
            // Tìm đoạn văn bản dài nhất nằm trong dấu " hoặc "
            const vietnameseQuotes = content.match(/"([^"]+)"/g) || content.match(/"([^"]+)"/g);
            if (vietnameseQuotes && vietnameseQuotes.length > 0) {
                // Lấy quote dài nhất (thường là nội dung thật)
                let longestQuote = vietnameseQuotes.reduce((a, b) => a.length > b.length ? a : b);
                // Xóa dấu ngoặc kép bọc ngoài
                longestQuote = longestQuote.replace(/^[""]|[""]$/g, '').trim();
                if (longestQuote.length > 30) { // Chỉ sử dụng nếu đủ dài
                    content = longestQuote;
                }
            }

            // Áp dụng bộ lọc sạch sâu - loại bỏ cấu trúc để giống status Facebook
            content = content
                // 1. Xóa toàn bộ phần đầu cho đến Nội dung:
                .replace(/^[\s\S]*?Nội dung:\s*/i, '');

            // 2. Xóa block "## Hành động Post:" và tiền tố [Agent]:
            content = content.replace(/^##\s*Hành động\s+Post:?\s*/gi, '');
            content = content.replace(/^##\s*Post\s+Action:?\s*/gi, '');
            content = content.replace(/^>\s*\*?\s*\[?[\w\-_]+\]?:\s*/gim, '');
            content = content.replace(/^>\s*/gm, '');
            content = content.replace(/\*\*(Dữ liệu đầu vào|Tác động|Cơ hội|Chủ đề|Nội dung|Tiêu đề|Input Data|Impact|Opportunity|Topic|Content):\*\*\s*/gi, '');
            content = content.replace(/^(Dữ liệu đầu vào|Tác động|Cơ hội|Chủ đề|Nội dung|Tiêu đề):\s*/gim, '');
            content = content.replace(/\[[\w\-_]+\]:\s*/g, '');

            content = content
                // 3. Xóa markdown headers (##, ###, etc.)
                .replace(/^#+\s*/gm, '')

                // 4. Xóa bold/italic markdown (**, *, __)
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1')
                .replace(/__([^_]+)__/g, '$1')
                .replace(/_([^_]+)_/g, '$1')

                // 5. Xóa blockquotes (>) còn sót
                .replace(/^>\s*/gm, '')

                // 6. Xóa bullet points (-, *, số.)
                .replace(/^[-*]\s+/gm, '')
                .replace(/^\d+\.\s+/gm, '')

                // 7. Xóa các nội dung trong ngoặc đơn/vuông (Stage directions)
                .replace(/\([\s\S]*?\)/g, '')
                .replace(/\[[\s\S]*?\]/g, '')

                // 8. Xóa các câu dắt/giới thiệu
                .replace(/^Với tư cách.*?:/gi, '')
                .replace(/^Hành động.*?:/gi, '')
                .replace(/^Tuyệt vời!?.*$/gim, '')
                .replace(/^Dựa trên hồ sơ.*$/gim, '')
                .replace(/^Đây là.*bài đăng.*$/gim, '')

                // 9. Xóa các nhãn
                .replace(/^(Tiêu đề|Title|Tên bài đăng|Nội dung|Bài đăng|Content|Activity|Chủ đề|Topic|Hành động|Post):?\s*/gim, '')

                // 10. Xóa dấu ngoặc kép bọc ngoài và khoảng trắng thừa
                .replace(/^[""]|[""]$/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            // Lọc đệ quy nếu vẫn còn nhãn
            if (content.match(/^(Tiêu đề|Nội dung|Bài đăng|Content|Title|Chủ đề):/i)) {
                content = content.replace(/^.*?:/i, '').trim();
            }

            parsed.content = content;
        }

        return parsed;
    } catch (e) {
        console.error('Failed to parse AI JSON:', text);
        return {
            content: text.slice(0, 500),
            activity_type: 'post',
            emotional_tone: 'khô khan',
            intent: 'thông báo lỗi',
            debug_error: 'JSON_PARSE_FAILED'
        };
    }
}

// API kiểm tra trạng thái
app.get('/api/debug/verify', (req, res) => {
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    res.json({
        has_key: key.length > 0,
        port: PORT,
        ai_ready: client !== null,
        sdk: '@google/genai'
    });
});

// API tạo bài đăng
app.post('/api/ai/generate', async (req, res) => {
    const requestId = Date.now().toString(36);
    try {
        const { prompt, systemPrompt, enableGoogleSearch } = req.body;

        if (!client) {
            return res.status(500).json({ error: 'AI Client not initialized' });
        }

        let text = "";

        // SDK mới sử dụng client.models.generateContent
        if (client.models && client.models.generateContent) {
            console.log(`[AI_${requestId}] Calling client.models.generateContent (Google Search: ${enableGoogleSearch || false})`);
            
            // Cấu hình tools cho Google Search grounding
            const tools = enableGoogleSearch ? [{ googleSearch: {} }] : undefined;
            
            // Định nghĩa JSON Schema cho structured output
            const responseSchema = {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: "Nội dung bài đăng thuần túy - giống như người thật đăng status Facebook. KHÔNG có giải thích, KHÔNG có markdown, KHÔNG có meta-text."
                    },
                    emotional_tone: {
                        type: "string",
                        description: "Giọng điệu cảm xúc của bài đăng"
                    },
                    intent: {
                        type: "string",
                        description: "Ý định chính của bài đăng"
                    }
                },
                required: ["content", "emotional_tone", "intent"]
            };
            
            const response = await client.models.generateContent({
                model: "gemini-2.0-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: systemPrompt,
                config: { 
                    temperature: 0.7,
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    ...(tools && { tools })
                }
            });

            // Log cấu trúc response để gỡ lỗi
            console.log(`[AI_${requestId}] Response keys:`, Object.keys(response));
            if (response.value) console.log(`[AI_${requestId}] Response.value keys:`, Object.keys(response.value));

            // Trích xuất text đa tầng
            if (response.text) {
                text = typeof response.text === 'function' ? response.text() : response.text;
            } else if (response.value && response.value.text) {
                text = typeof response.value.text === 'function' ? response.value.text() : response.value.text;
            } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
                text = response.candidates[0].content.parts[0].text;
            } else {
                text = JSON.stringify(response.value || response);
                console.warn(`[AI_${requestId}] Fallback to JSON stringify for response`);
            }
            
            // Với structured output, text đã là JSON hợp lệ, không cần safeParseJson phức tạp
            try {
                const parsed = JSON.parse(text);
                console.log(`[AI_${requestId}] Structured output parsed successfully:`, parsed);
                return res.json(parsed);
            } catch (parseError) {
                console.error(`[AI_${requestId}] JSON parse error, falling back to safeParseJson:`, parseError);
                return res.json(safeParseJson(text));
            }
        } else if (client.getGenerativeModel) {
            // Old pattern (@google/generative-ai style but in @google/genai)
            const model = client.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: systemPrompt });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            text = response.text();
        }

        res.json(safeParseJson(text));
    } catch (error) {
        console.error(`[AI_${requestId}] Error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// API lấy Agents
app.get('/api/agents', async (req, res) => {
    try {
        if (!agentsCol) return res.json([]);
        const snapshot = await agentsCol.get();
        const agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(agents);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// API lưu Agent
app.post('/api/agents', async (req, res) => {
    try {
        if (!agentsCol) return res.json({ ok: true });
        const agent = req.body;
        await agentsCol.doc(agent.id).set(agent);
        res.json({ ok: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// API lấy Feed
app.get('/api/feed', async (req, res) => {
    try {
        if (!feedCol) return res.json([]);
        const snapshot = await feedCol.orderBy('timestamp', 'desc').limit(50).get();
        const feed = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(feed);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// API lưu Feed
app.post('/api/feed', async (req, res) => {
    try {
        if (!feedCol) return res.json({ ok: true });
        const post = req.body;
        await feedCol.doc(post.id).set(post);
        res.json({ ok: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// API lấy Groups
app.get('/api/groups', async (req, res) => {
    try {
        if (!groupsCol) return res.json([]);
        let snapshot;
        try {
            snapshot = await groupsCol.orderBy('createdAt', 'desc').limit(100).get();
        } catch (_) {
            snapshot = await groupsCol.limit(100).get();
        }
        const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(groups);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// API lưu Group
app.post('/api/groups', async (req, res) => {
    try {
        if (!groupsCol) return res.json({ ok: true });
        const group = req.body;
        await groupsCol.doc(group.id).set(group);
        res.json({ ok: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/health', (req, res) => res.send('OK'));
app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
