// Import the necessary tools
const express = require('express');
const cors = require('cors');

// Import our new translation route
const translateRoutes = require('./routes/translate');

const app = express();
const PORT = process.env.PORT || 5000;

// Debug: basic startup logging and global error handlers
console.log('index.js loaded — beginning startup');
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

// Set up middleware
app.use(cors()); // Allows your frontend to talk to this backend
// Capture raw body bytes for debugging encoding issues, while still parsing JSON
app.use(express.json({
    verify: (req, res, buf, encoding) => {
        // store raw buffer for inspection
        req.rawBody = Buffer.from(buf || '');
    },
    limit: '1mb'
})); // Allows the server to understand JSON data

// Middleware to detect garbled unicode (e.g., '????') and attempt a UTF-8 re-decode of rawBody
app.use((req, res, next) => {
    try {
        if (req.body && typeof req.body === 'object') {
            // shallow check for obviously garbled text in any string field
            const hasGarbled = Object.values(req.body).some(v => typeof v === 'string' && /\?{2,}|\uFFFD/.test(v));
            if (hasGarbled && req.rawBody && req.rawBody.length > 0) {
                try {
                    // try decode assuming UTF-8
                    const repaired = req.rawBody.toString('utf8');
                    const parsed = JSON.parse(repaired);
                    req.body = parsed;
                    console.log('Repaired request body by re-decoding rawBody as UTF-8');
                } catch (e) {
                    // if parse fails, leave original body
                    console.warn('Attempt to repair request body failed:', e && e.message);
                }
            }
        }
    } catch (e) {
        // don't block request on repair errors
    }
    next();
});

// Simple request logger for debugging
app.use((req, res, next) => {
    try {
        console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url} body:`, req.body);
    } catch (e) {
        console.log('[REQ] logger error', e);
    }
    next();
});

// Tell the server to use our translation file for any requests to '/api/translate'
app.use('/api/translate', translateRoutes);

// Simple health check so we can verify the server is responsive
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', pid: process.pid, uptime: process.uptime() });
});

// Start the server and add an error handler to give clearer feedback if the port is already in use
const server = app.listen(PORT, () => {
    console.log(`✅ Translation server is running on port ${PORT}`);
    console.log(`Startup complete — PID ${process.pid}. Visit http://localhost:${PORT}/health to verify.`);
});

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Kill the process using that port or set a different PORT environment variable.`);
        console.error('You can find the process using: netstat -ano | Select-String ":' + PORT + '"');
    } else {
        console.error('Server error:', err);
    }
    process.exit(1);
});

