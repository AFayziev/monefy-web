// Minimal webhook receiver: prints incoming requests to the console.
// Usage: node scripts/webhook-receiver.js
// Reads API_KEY and PORT from scripts/.env (copy .env.example). Needs Node 20.12+.

const http = require('http');
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (err) {
  console.error(`Cannot load ${path.join(__dirname, '.env')}: ${err.message}`);
  process.exit(1);
}

if (!process.env.API_KEY) {
  console.error('API_KEY is not set in .env');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const stamp = new Date().toISOString();

      if (API_KEY && req.headers['x-api-key'] !== API_KEY) {
        console.log(`[${stamp}] ${req.method} ${req.url} -> 401 (bad or missing X-API-Key)`);
        res.writeHead(401).end('unauthorized');
        return;
      }

      console.log(`[${stamp}] ${req.method} ${req.url}`);

      try {
        console.dir(JSON.parse(body), { depth: null });
      } catch {
        console.log(body);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    });
  })
  .listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
