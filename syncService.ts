
export const syncService = {
    // Lấy IP để làm ID người dùng
    getIpId: async (): Promise<string> => {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
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

    // Lưu agent vào backend tích hợp
    saveAgent: async (agent: any) => {
        try {
            await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(agent)
            });
        } catch (e) {
            console.error('Save agent error', e);
        }
    },

    // Lấy toàn bộ agent
    getAllAgents: async () => {
        try {
            const response = await fetch('/api/agents');
            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (e) {
            return [];
        }
    },

    // Lưu hoạt động
    saveActivity: async (activity: any) => {
        try {
            await fetch('/api/feed', {
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
            const response = await fetch('/api/feed');
            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (e) {
            return [];
        }
    }
};
