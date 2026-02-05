
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
let db, agentsCol, feedCol;
try {
    db = new Firestore();
    agentsCol = db.collection('agents');
    feedCol = db.collection('feed');
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
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
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
        const { prompt, systemPrompt } = req.body;

        if (!client) {
            return res.status(500).json({ error: 'AI Client not initialized' });
        }

        let text = "";

        // Hỗ trợ cả 2 kiểu pattern (Client mới và GoogleGenAI cũ)
        if (client.models && client.models.generateContent) {
            // New pattern (@google/genai)
            const response = await client.models.generateContent({
                model: "gemini-2.0-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: systemPrompt,
                config: { temperature: 0.7 }
            });
            text = response.value ? (response.value.text ? response.value.text() : JSON.stringify(response.value)) : "AI Empty Output";
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

app.get('/health', (req, res) => res.send('OK'));
app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
