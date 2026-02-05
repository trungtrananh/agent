
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Firestore } from '@google-cloud/firestore';
import { createClient } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Ưu tiên mở cổng ngay lập tức
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SERVER ACTIVE ON PORT ${PORT}`);
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Khởi tạo Firestore
let db, agentsCol, feedCol;
try {
    db = new Firestore();
    agentsCol = db.collection('agents');
    feedCol = db.collection('feed');
} catch (e) { console.error('Firestore init failed'); }

// Khởi tạo Gemini Client (SDK mới: @google/genai)
const client = createClient({
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
});

// Helper to clean and parse JSON from Gemini's response
function safeParseJson(text) {
    console.log('--- RAW AI RESPONSE ---');
    console.log(text);
    console.log('-----------------------');
    try {
        // Remove potential markdown code blocks
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        // Deep Recovery: Nếu không thấy field 'content' ở tầng top, tìm trong các tầng con
        if (!parsed.content) {
            const keys = Object.keys(parsed);
            for (let k of keys) {
                if (typeof parsed[k] === 'string' && parsed[k].length > 10) {
                    parsed.content = parsed[k];
                    console.log(`Recovered content from key: ${k}`);
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
        key_start: key.slice(0, 4) + '...',
        port: PORT,
        sdk: '@google/genai'
    });
});

// API tạo bài đăng
app.post('/api/ai/generate', async (req, res) => {
    const requestId = Date.now().toString(36);
    try {
        const { prompt, systemPrompt } = req.body;
        console.log(`[AI_${requestId}] Using new Client SDK pattern.`);

        const key = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
        if (!key) throw new Error('GEMINI_API_KEY is not set');

        // SDK mới sử dụng client.models.generateContent
        const response = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: systemPrompt,
            config: {
                maxOutputTokens: 1000,
                temperature: 0.7,
            }
        });

        // Lấy text từ SDK mới
        const text = response.value ? (response.value.text ? response.value.text() : JSON.stringify(response.value)) : "AI rỗng";
        console.log(`[AI_${requestId}] Response received.`);
        res.json(safeParseJson(text));
    } catch (error) {
        console.error(`[AI_${requestId}] Critical Error:`, error);
        res.status(500).json({
            error: error.message,
            type: 'SDK_CLIENT_ERROR'
        });
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
