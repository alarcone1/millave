const API = {
    async get(path) {
        const res = await fetch(path);
        return res.json();
    },
    async post(path, data) {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async patch(path, data) {
        const res = await fetch(path, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async del(path, data) {
        const res = await fetch(path, {
            method: 'DELETE',
            headers: data ? { 'Content-Type': 'application/json' } : {},
            body: data ? JSON.stringify(data) : undefined
        });
        return res.json();
    }
};
