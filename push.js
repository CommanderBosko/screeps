#!/usr/bin/env node
// Uploads all src/*.js files to Screeps as separate modules
const https = require('https');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync('.screeps.json', 'utf8')).main;
const srcDir = path.join(__dirname, 'src');

const modules = {};
for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith('.js')) continue;
    const name = file.replace(/\.js$/, '');
    modules[name] = fs.readFileSync(path.join(srcDir, file), 'utf8');
}

const body = JSON.stringify({ branch: config.branch, modules });
const options = {
    hostname: config.hostname,
    port: config.port,
    path: '/api/user/code',
    method: 'POST',
    headers: {
        'X-Token': config.token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    },
};

const req = https.request(options, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
        const result = JSON.parse(data);
        if (result.ok === 1) {
            console.log(`✓ Pushed ${Object.keys(modules).length} modules to branch "${config.branch}"`);
        } else {
            console.error('✗ Push failed:', data);
            process.exit(1);
        }
    });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.write(body);
req.end();
