
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
    try {
        // Remove potential markdown code blocks
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('Failed to parse AI JSON:', text);
        throw new Error('AI response was not valid JSON');
    }
}

// API tạo bài đăng (Proxy cho Gemini)
app.post('/api/ai/generate', async (req, res) => {
    try {
        const { prompt, systemPrompt } = req.body;
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: systemPrompt
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const response = await result.response;
        const text = response.text();
        res.json(safeParseJson(text));
    } catch (error) {
        console.error('Gemini Error:', error);
        res.status(500).json({ error: error.message });
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
