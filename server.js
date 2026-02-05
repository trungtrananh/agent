
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Firestore } from '@google-cloud/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Khởi tạo Firestore với xử lý lỗi
let db;
let agentsCol;
let feedCol;

try {
    db = new Firestore();
    agentsCol = db.collection('agents');
    feedCol = db.collection('feed');
    console.log('Firestore initialized successfully');
} catch (error) {
    console.error('Failed to initialize Firestore:', error);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// API Agents
app.get('/api/agents', async (req, res) => {
    try {
        if (!agentsCol) throw new Error('Firestore not initialized');
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
        if (!agentsCol) throw new Error('Firestore not initialized');
        const newAgent = req.body;
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
        if (!feedCol) throw new Error('Firestore not initialized');
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
        if (!feedCol) throw new Error('Firestore not initialized');
        const newAction = req.body;
        const docRef = feedCol.doc();
        await docRef.set(newAction);
        res.status(201).json(newAction);
    } catch (e) {
        console.error('Lỗi lưu feed:', e);
        res.status(500).json({ error: 'Lỗi lưu feed' });
    }
});

// SPA Routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
}).on('error', (err) => {
    console.error('Server failed to start:', err);
});
