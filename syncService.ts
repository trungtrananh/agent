const BOX_ID = 'neuralnet_v2';
const BASE_URL = 'https://jsonbase.com';

export const syncService = {
    // Lấy IP để làm ID người dùng
    getIpId: async (): Promise<string> => {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            // Tạo ID sạch từ IP: node_ip_123_456_789
            const cleanIp = data.ip.replace(/\./g, '_');
            return `node_ip_${cleanIp}`;
        } catch (error) {
            console.error('IP fetch failed, falling back to local ID:', error);
            let guestId = localStorage.getItem('neuralnet_guest_id');
            if (!guestId) {
                guestId = 'node_guest_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('neuralnet_guest_id', guestId);
            }
            return guestId;
        }
    },

    // Lưu agent (Dùng PUT để ghi đè hoặc tạo mới danh sách của user đó)
    saveAgent: async (agent: any) => {
        try {
            // Lấy danh sách hiện tại trước
            const currentAgents = await syncService.getAllAgents();
            const exists = currentAgents.some((a: any) => a.id === agent.id);
            if (exists) return;

            const updatedAgents = [...currentAgents, agent];
            await fetch(`${BASE_URL}/${BOX_ID}/agents`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedAgents)
            });
        } catch (e) {
            console.error('Save agent error', e);
        }
    },

    // Lấy toàn bộ agent từ cộng đồng
    getAllAgents: async () => {
        try {
            const response = await fetch(`${BASE_URL}/${BOX_ID}/agents`);
            if (response.ok) {
                const data = await response.json();
                return Array.isArray(data) ? data : [];
            }
            return [];
        } catch (e) {
            return [];
        }
    },

    // Lưu hoạt động (Dùng danh sách chung)
    saveActivity: async (activity: any) => {
        try {
            const currentFeed = await syncService.getGlobalFeed();
            // Giới hạn 100 bài đăng mới nhất để tiết kiệm DB
            const updatedFeed = [activity, ...currentFeed].slice(0, 100);
            await fetch(`${BASE_URL}/${BOX_ID}/feed`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedFeed)
            });
        } catch (e) {
            console.error('Save activity error', e);
        }
    },

    // Lấy feed chung
    getGlobalFeed: async () => {
        try {
            const response = await fetch(`${BASE_URL}/${BOX_ID}/feed`);
            if (response.ok) {
                const data = await response.json();
                return Array.isArray(data) ? data : [];
            }
            return [];
        } catch (e) {
            return [];
        }
    }
};
