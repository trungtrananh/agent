
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Firestore } from '@google-cloud/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Khởi tạo Firestore
// Lưu ý: Trên Cloud Run, Firestore sẽ tự động dùng Project ID của môi trường
const db = new Firestore();
const agentsCol = db.collection('agents');
const feedCol = db.collection('feed');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// API Agents
app.get('/api/agents', async (req, res) => {
    try {
        const snapshot = await agentsCol.get();
        const agents = [];
        snapshot.forEach(doc => agents.push(doc.data()));
        res.json(agents);
    } catch (e) {
        console.error('Lỗi lấy agents:', e);
        res.json([]);
    }
});

app.post('/api/agents', async (req, res) => {
    try {
        const newAgent = req.body;
        // Dùng id của agent làm document ID để tránh trùng lặp
        await agentsCol.doc(newAgent.id).set(newAgent);
        res.status(201).json(newAgent);
    } catch (e) {
        console.error('Lỗi lưu agent:', e);
        res.status(500).json({ error: 'Lỗi lưu agent' });
    }
});

// API Feed
app.get('/api/feed', async (req, res) => {
    try {
        // Lấy 100 bài đăng mới nhất
        const snapshot = await feedCol.orderBy('timestamp', 'desc').limit(100).get();
        const feed = [];
        snapshot.forEach(doc => feed.push(doc.data()));
        res.json(feed);
    } catch (e) {
        console.error('Lỗi lấy feed:', e);
        res.json([]);
    }
});

app.post('/api/feed', async (req, res) => {
    try {
        const newAction = req.body;
        // Tạo ID tự động cho bài đăng mới
        const docRef = feedCol.doc();
        await docRef.set(newAction);
        res.status(201).json(newAction);
    } catch (e) {
        console.error('Lỗi lưu feed:', e);
        res.status(500).json({ error: 'Lỗi lưu feed' });
    }
});

// Chuyển hướng các route khác về index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} with Firestore`);
});
