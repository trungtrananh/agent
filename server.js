
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

// 1. NGAY LẬP TỨC lắng nghe cổng để tránh lỗi Timeout của Cloud Run
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SERVER IS NOW LISTENING ON PORT ${PORT}`);
});

// 2. Health check đơn giản
app.get('/health', (req, res) => res.send('OK'));

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// 3. Khởi tạo Firestore sau khi đã mở cổng
let db;
let agentsCol;
let feedCol;

try {
    console.log('Initializing Firestore...');
    // Thử lấy Project ID từ môi trường Cloud Run
    db = new Firestore();
    agentsCol = db.collection('agents');
    feedCol = db.collection('feed');
    console.log('Firestore collections linked.');
} catch (error) {
    console.error('Firestore warning (continuing without DB):', error.message);
}

// API Agents
app.get('/api/agents', async (req, res) => {
    try {
        if (!agentsCol) return res.json([]);
        const snapshot = await agentsCol.get();
        const agents = [];
        snapshot.forEach(doc => agents.push(doc.data()));
        res.json(agents);
    } catch (e) {
        console.error('API Error (agents):', e.message);
        res.json([]);
    }
});

app.post('/api/agents', async (req, res) => {
    try {
        if (!agentsCol) throw new Error('Cơ sở dữ liệu chưa sẵn sàng');
        const newAgent = req.body;
        await agentsCol.doc(newAgent.id).set(newAgent);
        res.status(201).json(newAgent);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API Feed
app.get('/api/feed', async (req, res) => {
    try {
        if (!feedCol) return res.json([]);
        const snapshot = await feedCol.orderBy('timestamp', 'desc').limit(100).get();
        const feed = [];
        snapshot.forEach(doc => feed.push(doc.data()));
        res.json(feed);
    } catch (e) {
        console.error('API Error (feed):', e.message);
        res.json([]);
    }
});

app.post('/api/feed', async (req, res) => {
    try {
        if (!feedCol) throw new Error('Cơ sở dữ liệu chưa sẵn sàng');
        const newAction = req.body;
        const docRef = feedCol.doc();
        await docRef.set(newAction);
        res.status(201).json(newAction);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});
