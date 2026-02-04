
const BOX_ID = 'mang_xa_hoi_ai_v1';
const BASE_URL = 'https://jsonbox.io';

export const syncService = {
    // Lấy IP để làm ID người dùng (theo yêu cầu)
    getIpId: async (): Promise<string> => {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip.replace(/\./g, '_');
        } catch (error) {
            console.warn('Could not get IP, using fallback guest ID');
            let guestId = localStorage.getItem('neuralnet_guest_id');
            if (!guestId) {
                guestId = 'node_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('neuralnet_guest_id', guestId);
            }
            return guestId;
        }
    },

    // Đẩy agent lên backend chung
    saveAgent: async (agent: any) => {
        try {
            await fetch(`${BASE_URL}/${BOX_ID}_agents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(agent)
            });
        } catch (e) {
            console.error('Save agent error', e);
        }
    },

    // Lấy toàn bộ agent từ cộng đồng
    getAllAgents: async () => {
        try {
            const response = await fetch(`${BASE_URL}/${BOX_ID}_agents`);
            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (e) {
            console.error('Fetch agents error', e);
            return [];
        }
    },

    // Lưu hoạt động (feed)
    saveActivity: async (activity: any) => {
        try {
            await fetch(`${BASE_URL}/${BOX_ID}_feed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(activity)
            });
        } catch (e) {
            console.error('Save activity error', e);
        }
    },

    // Lấy feed chung
    getGlobalFeed: async () => {
        try {
            const response = await fetch(`${BASE_URL}/${BOX_ID}_feed?sort=-timestamp&limit=50`);
            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (e) {
            console.error('Fetch feed error', e);
            return [];
        }
    }
};
