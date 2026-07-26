/**
 * Zero-dependency Node.js backend for the portfolio site.
 * Run with: node server.js
 *
 * Endpoints:
 *   GET  /                 -> serves public/index.html and other static files
 *   POST /api/contact      -> accepts {name, email, company, type, budget, message}
 *                             validates, stores to data/leads.json, optionally
 *                             forwards to a webhook (Zapier/Slack/Make/email tool)
 *   GET  /api/leads?token= -> lists stored leads (protected by ADMIN_TOKEN)
 *
 * Environment variables (optional):
 *   PORT         - port to listen on (default 3000)
 *   ADMIN_TOKEN  - required to view /api/leads. Leave unset to disable the endpoint.
 *   WEBHOOK_URL  - if set, every new lead is POSTed here as JSON (e.g. a Zapier
 *                  "Catch Hook" or Slack incoming webhook URL) so you get notified
 *                  or can pipe it into email automation without adding SMTP code.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleContact(req, res) {
  let payload;
  try {
    const raw = await readBody(req);
    payload = JSON.parse(raw || '{}');
  } catch (err) {
    return sendJSON(res, 400, { error: 'Invalid request body.' });
  }

  const { name, email, company, type, budget, message, website } = payload;

  // Honeypot field: real users never fill in "website" (hidden in the form via CSS).
  if (website) {
    return sendJSON(res, 200, { ok: true, message: 'Received' });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return sendJSON(res, 400, { error: 'Name is required.' });
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return sendJSON(res, 400, { error: 'A valid email address is required.' });
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: String(name).slice(0, 200).trim(),
    email: String(email).slice(0, 200).trim(),
    company: company ? String(company).slice(0, 200).trim() : '',
    type: type ? String(type).slice(0, 100).trim() : '',
    budget: budget ? String(budget).slice(0, 100).trim() : '',
    message: message ? String(message).slice(0, 2000).trim() : '',
    receivedAt: new Date().toISOString(),
  };

  try {
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8') || '[]');
    leads.push(entry);
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  } catch (err) {
    console.error('Failed to persist lead:', err);
    return sendJSON(res, 500, { error: 'Could not save your message. Please try again.' });
  }

  if (WEBHOOK_URL) {
    // Fire-and-forget; a webhook failure shouldn't block the user's confirmation.
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch((err) => console.error('Webhook forward failed:', err.message));
  }

  sendJSON(res, 200, { ok: true, message: 'Received' });
}

function handleGetLeads(req, res, query) {
  if (!ADMIN_TOKEN) {
    return sendJSON(res, 404, { error: 'Not found' });
  }
  if (query.token !== ADMIN_TOKEN) {
    return sendJSON(res, 401, { error: 'Unauthorized' });
  }
  try {
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8') || '[]');
    sendJSON(res, 200, { count: leads.length, leads });
  } catch (err) {
    sendJSON(res, 500, { error: 'Could not read leads.' });
  }
}

function serveStatic(req, res, urlPath) {
  let relativePath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(relativePath)));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch (err) {
    res.writeHead(400);
    return res.end('Bad request');
  }

  if (req.method === 'POST' && url.pathname === '/api/contact') {
    return handleContact(req, res);
  }
  if (req.method === 'GET' && url.pathname === '/api/leads') {
    return handleGetLeads(req, res, Object.fromEntries(url.searchParams));
  }
  if (req.method === 'GET') {
    return serveStatic(req, res, url.pathname);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Portfolio server running at http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) {
    console.log('Set ADMIN_TOKEN to enable GET /api/leads for viewing submissions.');
  }
  if (!WEBHOOK_URL) {
    console.log('Set WEBHOOK_URL to forward new leads to Slack/Zapier/email automation.');
  }
});
