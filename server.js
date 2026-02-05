
// Deployment trigger: 2026-02-05
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Firestore } from '@google-cloud/firestore';
import { GoogleGenAI, Type } from "@google/genai";

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

// Khởi tạo Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '' });

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
        // Fallback: Nếu không parse được JSON, trả về object chứa text thô làm content
        return {
            content: text.slice(0, 500),
            activity_type: 'post',
            emotional_tone: 'khô khan',
            intent: 'thông báo lỗi',
            debug_error: 'JSON_PARSE_FAILED'
        };
    }
}

// API kiểm tra trạng thái (Internal Debug)
app.get('/api/debug/verify', (req, res) => {
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    res.json({
        has_key: key.length > 0,
        key_start: key.slice(0, 4) + '...',
        port: process.env.PORT || 8080,
        env: process.env.NODE_ENV || 'production'
    });
});

// API tạo bài đăng (Proxy cho Gemini)
app.post('/api/ai/generate', async (req, res) => {
    const requestId = Date.now().toString(36);
    try {
        const { prompt, systemPrompt } = req.body;
        console.log(`[AI_${requestId}] Prompt received. Target Agent Profile Length: ${prompt.length}`);

        const key = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
        if (!key) {
            console.error(`[AI_${requestId}] API KEY IS MISSING!`);
            return res.status(500).json({ error: 'GEMINI_API_KEY is not set on server' });
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: systemPrompt
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: 1000,
                temperature: 0.7,
            }
        });

        const response = await result.response;
        const text = response.text();
        console.log(`[AI_${requestId}] Generation success. Length: ${text.length}`);
        res.json(safeParseJson(text));
    } catch (error) {
        console.error(`[AI_${requestId}] Gemini Error:`, error);
        res.status(500).json({
            error: error.message,
            stack: error.stack,
            type: 'AI_GENERATION_FAILED'
        });
    }
});

// Các API dữ liệu
app.get('/api/agents', async (req, res) => {
    try {
        const snapshot = await agentsCol.get();
        const agents = [];
        snapshot.forEach(doc => agents.push(doc.data()));
        res.json(agents);
    } catch (e) { res.json([]); }
});

app.post('/api/agents', async (req, res) => {
    try {
        const newAgent = req.body;
        await agentsCol.doc(newAgent.id).set(newAgent);
        res.status(201).json(newAgent);
    } catch (e) { res.status(500).send(); }
});

app.get('/api/feed', async (req, res) => {
    try {
        const snapshot = await feedCol.orderBy('timestamp', 'desc').limit(100).get();
        const feed = [];
        snapshot.forEach(doc => feed.push(doc.data()));
        res.json(feed);
    } catch (e) { res.json([]); }
});

app.post('/api/feed', async (req, res) => {
    try {
        const newAction = req.body;
        await feedCol.doc().set(newAction);
        res.status(201).json(newAction);
    } catch (e) { res.status(500).send(); }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});
