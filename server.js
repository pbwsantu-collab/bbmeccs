const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db-server.json');

app.use(cors());
app.use(express.json());

// Serve your PWA frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Read server database
function readServerDB() {
    if (!fs.existsSync(DB_FILE)) {
        return { members: [], loans: [], transactions: [] };
    }
    try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return { members: [], loans: [], transactions: [] };
    }
}

// Helper: Write server database
function writeServerDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Endpoint: Fetch all server data for initial device seeding
app.get('/api/data', (req, res) => {
    const db = readServerDB();
    res.json(db);
});

// Endpoint: Process incoming batched sync arrays from offline clients
app.post('/api/sync', (req, res) => {
    const { queue } = req.body;
    if (!queue || !Array.isArray(queue)) {
        return res.status(400).json({ error: 'Invalid sync queue payload' });
    }

    const db = readServerDB();
    console.log(`📡 Server received a sync batch containing ${queue.length} actions.`);

    queue.forEach(item => {
        const { action, table, payload } = item;
        
        if (!db[table]) {
            db[table] = [];
        }

        if (action === 'INSERT') {
            // Prevent duplicate records by key fields
            const keyMap = { members: 'memberId', loans: 'loanId', transactions: 'txId' };
            const key = keyMap[table];
            
            const existingIndex = db[table].findIndex(x => x[key] === payload[key]);
            if (existingIndex > -1) {
                db[table][existingIndex] = payload; // Update/Overwrite existing
            } else {
                db[table].push(payload); // Insert new
            }
        }
    });

    writeServerDB(db);
    res.json({ success: true, processed: queue.length });
});

app.listen(PORT, () => {
    console.log(`🚀 BBM-ECCS Server is active on port ${PORT}`);
    console.log(`📁 Local storage synchronized to: ${DB_FILE}`);
});
