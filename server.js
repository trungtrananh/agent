
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Firestore } from '@google-cloud/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- SYSTEM STARTUP ---');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Kiểm tra thư mục dist
const distPath = path.join(__dirname, 'dist');
console.log('Static files path:', distPath);

app.use(express.static(distPath));

// Khởi tạo Firestore
let db;
let agentsCol;
let feedCol;

try {
    console.log('Attempting to initialize Firestore...');
    db = new Firestore();
    agentsCol = db.collection('agents');
    feedCol = db.collection('feed');
    console.log('Firestore collections referenced.');
} catch (error) {
    console.error('CRITICAL: Firestore init failed:', error.message);
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
        if (!agentsCol) throw new Error('DB not ready');
        const newAgent = req.body;
        await agentsCol.doc(newAgent.id).set(newAgent);
        res.status(201).json(newAgent);
    } catch (e) {
        console.error('API Error (post agent):', e.message);
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
        if (!feedCol) throw new Error('DB not ready');
        const newAction = req.body;
        const docRef = feedCol.doc();
        await docRef.set(newAction);
        res.status(201).json(newAction);
    } catch (e) {
        console.error('API Error (post feed):', e.message);
        res.status(500).json({ error: e.message });
    }
});

// SPA Routing
app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('File send error:', err.message);
            res.status(404).send('Application files not found. Please check build.');
        }
    });
});

console.log(`Preparing to listen on port ${PORT}...`);
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SUCCESS: Server is active on port ${PORT}`);
}).on('error', (err) => {
    console.error('❌ SERVER CRASH on listen:', err);
    process.exit(1);
});
