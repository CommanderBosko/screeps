#!/usr/bin/env node
// Streams Screeps MMO console output to the terminal in real time,
// and appends each line to screeps-console.log with a timestamp prefix.
// Run with: nix-shell -p nodejs --run "node watch.js"

'use strict';

const fs    = require('fs');
const https = require('https');
const path  = require('path');
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const configPath = path.join(__dirname, '.screeps.json');
if (!fs.existsSync(configPath)) {
    console.error('ERROR: .screeps.json not found. Create it with your auth token.');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8')).main;
const TOKEN = config.token;
const HOST  = config.hostname || 'screeps.com';
const WS_URL = `wss://${HOST}/socket/websocket`;

// ---------------------------------------------------------------------------
// File logging
// ---------------------------------------------------------------------------

const LOG_PATH = path.join(__dirname, 'screeps-console.log');
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

/**
 * Write to the log file. Strips ANSI codes so the file stays clean.
 * @param {string} line  — already-formatted string (may contain ANSI)
 */
function writeToFile(line) {
    // Strip ANSI escape sequences before writing to file
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
    logStream.write(clean + '\n');
}

// ---------------------------------------------------------------------------
// Reconnect state
// ---------------------------------------------------------------------------

const RECONNECT_DELAY_MS   = 3000;
const RECONNECT_DELAY_MAX  = 30000;
let reconnectDelay = RECONNECT_DELAY_MS;
let ws = null;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

// Strip Screeps HTML-style colour tags: <font color='#rrggbb'>text</font>
// Also strips <b>, </b>, etc.
function stripTags(str) {
    return str.replace(/<[^>]*>/g, '');
}

// ANSI colour codes for terminal output
const ANSI = {
    reset:  '\x1b[0m',
    dim:    '\x1b[2m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    cyan:   '\x1b[36m',
    green:  '\x1b[32m',
};

function timestamp() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function printLog(line, tick) {
    const tickStr = tick != null
        ? `${ANSI.dim}[t${tick}]${ANSI.reset} `
        : '';
    const plain = stripTags(line);
    const ts = timestamp();
    const out = `[${ts}] ${tickStr}${plain}`;
    console.log(out);
    writeToFile(`[${ts}] ${tick != null ? `[t${tick}] ` : ''}${plain}`);
}

function printResult(line, tick) {
    const tickStr = tick != null
        ? `${ANSI.dim}[t${tick}]${ANSI.reset} `
        : '';
    // Results (REPL output) get a different colour to distinguish them
    const plain = stripTags(line);
    const ts = timestamp();
    const out = `[${ts}] ${tickStr}${ANSI.cyan}=> ${plain}${ANSI.reset}`;
    console.log(out);
    writeToFile(`[${ts}] ${tick != null ? `[t${tick}] ` : ''}=> ${plain}`);
}

function printMeta(msg) {
    const ts = timestamp();
    const out = `[${ts}] ${ANSI.dim}${ANSI.green}[watch] ${msg}${ANSI.reset}`;
    console.log(out);
    writeToFile(`[${ts}] [watch] ${msg}`);
}

function printError(msg) {
    const ts = timestamp();
    const out = `[${ts}] ${ANSI.red}[watch] ${msg}${ANSI.reset}`;
    console.error(out);
    writeToFile(`[${ts}] [watch] ERROR: ${msg}`);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

// Screeps WebSocket frames are plain UTF-8 strings with one of:
//   "auth ok <token>"            — successful auth confirmation
//   "auth failed"                — bad token
//   ["console", { messages: { log: [...], results: [...] }, tick: N }]
//   ["console.result", ...]      — less common variant
//   heartbeat frames: just a single integer as a string e.g. "12345"
//
function handleMessage(raw) {
    const str = raw.toString();

    // Heartbeat — an integer tick number
    if (/^\d+$/.test(str.trim())) {
        return;
    }

    // Auth result
    if (str.startsWith('auth ok')) {
        printMeta('authenticated — subscribing to console');
        ws.send(`subscribe user:${userId}/console`);
        reconnectDelay = RECONNECT_DELAY_MS; // reset backoff on successful auth
        return;
    }

    if (str.startsWith('auth failed')) {
        printError('authentication failed — check your token in .screeps.json');
        ws.close();
        process.exit(1);
    }

    // JSON frame — array starting with an event name
    let frame;
    try {
        frame = JSON.parse(str);
    } catch (_) {
        // Not JSON, ignore
        return;
    }

    if (!Array.isArray(frame) || frame.length < 2) return;

    const [event, payload] = frame;

    if (event === `user:${userId}/console` || event === 'console') {
        const messages = (payload && payload.messages) || {};
        const tick     = payload && payload.tick;

        const logs    = messages.log     || [];
        const results = messages.results || [];

        for (const line of logs)    printLog(line, tick);
        for (const line of results) printResult(line, tick);
        return;
    }

    // "console.result" can arrive for some eval results
    if (event === 'console.result') {
        const tick = payload && payload.tick;
        const result = payload && payload.result;
        if (result != null) printResult(String(result), tick);
        return;
    }

    // Error frames from the server
    if (event === 'error') {
        printError(`server error: ${JSON.stringify(payload)}`);
        return;
    }
}

// ---------------------------------------------------------------------------
// User ID — fetched once at startup, then reused for subscribe messages
// ---------------------------------------------------------------------------

let userId = null;

function fetchUserId() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            path:     '/api/auth/me',
            method:   'GET',
            headers:  { 'X-Token': TOKEN },
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data._id) {
                        return reject(new Error(`/api/auth/me response missing _id: ${body}`));
                    }
                    resolve(data._id);
                } catch (err) {
                    reject(new Error(`Failed to parse /api/auth/me response: ${err.message}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Connect / reconnect loop
// ---------------------------------------------------------------------------

function connect() {
    printMeta(`connecting to ${WS_URL}`);

    ws = new WebSocket(WS_URL, {
        headers: { 'X-Token': TOKEN },
    });

    ws.on('open', () => {
        printMeta('connected — authenticating');
        ws.send(`auth ${TOKEN}`);
    });

    ws.on('message', (data) => {
        try {
            handleMessage(data);
        } catch (err) {
            printError(`message handler error: ${err.message}`);
        }
    });

    ws.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : 'no reason given';
        printMeta(`disconnected (${code}: ${reasonStr}) — reconnecting in ${reconnectDelay / 1000}s`);
        scheduleReconnect();
    });

    ws.on('error', (err) => {
        printError(`WebSocket error: ${err.message}`);
        // 'close' will fire after 'error', so reconnect is handled there
    });
}

function scheduleReconnect() {
    setTimeout(() => {
        // Exponential backoff, capped at max
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_DELAY_MAX);
        connect();
    }, reconnectDelay);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

printMeta(`Screeps console watcher started at ${timestamp()}`);
printMeta(`server: ${HOST}  |  token: ${TOKEN.slice(0, 8)}...`);
printMeta(`logging to: ${LOG_PATH}`);

fetchUserId()
    .then((id) => {
        userId = id;
        printMeta(`userId: ${id}`);
        connect();
    })
    .catch((err) => {
        printError(`Failed to fetch userId: ${err.message}`);
        process.exit(1);
    });

// Keep process alive — WebSocket events drive everything
process.on('SIGINT', () => {
    printMeta('shutting down');
    if (ws) ws.close();
    logStream.end(() => process.exit(0));
});

process.on('SIGTERM', () => {
    printMeta('shutting down (SIGTERM)');
    if (ws) ws.close();
    logStream.end(() => process.exit(0));
});
