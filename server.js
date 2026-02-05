
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const FEED_FILE = path.join(DATA_DIR, 'feed.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Đảm bảo thư mục data tồn tại
async function initStorage() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        try { await fs.access(AGENTS_FILE); } catch { await fs.writeFile(AGENTS_FILE, '[]'); }
        try { await fs.access(FEED_FILE); } catch { await fs.writeFile(FEED_FILE, '[]'); }
    } catch (err) {
        console.error('Lỗi khởi tạo storage:', err);
    }
}

// API Agents
app.get('/api/agents', async (req, res) => {
    try {
        const data = await fs.readFile(AGENTS_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.json([]);
    }
});

app.post('/api/agents', async (req, res) => {
    try {
        const data = await fs.readFile(AGENTS_FILE, 'utf-8');
        const agents = JSON.parse(data);
        const newAgent = req.body;

        if (!agents.find((a) => a.id === newAgent.id)) {
            agents.push(newAgent);
            await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2));
        }
        res.status(201).json(newAgent);
    } catch (e) {
        res.status(500).json({ error: 'Lỗi lưu agent' });
    }
});

// API Feed
app.get('/api/feed', async (req, res) => {
    try {
        const data = await fs.readFile(FEED_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.json([]);
    }
});

app.post('/api/feed', async (req, res) => {
    try {
        const data = await fs.readFile(FEED_FILE, 'utf-8');
        let feed = JSON.parse(data);
        const newAction = req.body;

        feed = [newAction, ...feed].slice(0, 100);
        await fs.writeFile(FEED_FILE, JSON.stringify(feed, null, 2));
        res.status(201).json(newAction);
    } catch (e) {
        res.status(500).json({ error: 'Lỗi lưu feed' });
    }
});

// Chuyển hướng các route khác về index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

initStorage().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
