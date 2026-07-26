# Alex Rivera — Portfolio Site

A responsive personal portfolio with a real backend for the contact form.
No npm packages required — the backend uses only Node's built-in modules.

## Personalize it first

Open `public/index.html` and replace the placeholder content:
- Name, initials (in `.avatar`), and tagline in the hero
- The "Career at a glance" receipt numbers
- Experience, Education, and Achievements sections
- Portfolio case studies and testimonials
- Update the page `<title>` and meta description

## Run it locally

Requires Node.js 18 or later (for built-in `fetch`, used for webhook forwarding).

```bash
node server.js
```

Then open http://localhost:3000. The contact form on the page posts to the
real `/api/contact` endpoint below — try submitting it.

## What the backend does

- Serves everything in `public/` (the site itself)
- `POST /api/contact` — validates name + email, stores each submission as a
  row in `data/leads.json`, and rejects bots via a hidden honeypot field
- `GET /api/leads?token=YOUR_TOKEN` — lists stored submissions (only enabled
  if you set `ADMIN_TOKEN`, see below)

## Configuration (environment variables, all optional)

| Variable      | Purpose                                                                 |
|---------------|--------------------------------------------------------------------------|
| `PORT`        | Port to listen on. Defaults to `3000`.                                  |
| `ADMIN_TOKEN` | Set this to view submissions at `/api/leads?token=...`. Unset = disabled.|
| `WEBHOOK_URL` | If set, every new submission is also POSTed here as JSON.               |

Example:

```bash
ADMIN_TOKEN=letmein PORT=8080 node server.js
```

### Getting an email/notification for each new lead

The server has no built-in email sending (that would require SMTP
credentials and an extra dependency). The easiest path instead:

1. Create a **Zapier** "Catch Hook" or **Make.com** webhook, or a **Slack**
   incoming webhook.
2. Set `WEBHOOK_URL` to that URL when you start the server.
3. Every submission is forwarded there automatically — from Zapier/Make you
   can then send yourself an email, add a row to a spreadsheet, etc.

## Deploying so it's live on the internet

Any host that runs a persistent Node process works, for example:

- **Render** — "New Web Service," connect your repo, start command `node server.js`
- **Railway** — new project from repo, it auto-detects Node
- **Fly.io** or a small **VPS** — run `node server.js` behind a process
  manager like `pm2`, and put it behind Nginx/Caddy for HTTPS

Note: `data/leads.json` is a plain file on disk. On most serverless
platforms (e.g. Vercel functions) the filesystem is not persistent between
requests — those work fine for a platform like Render/Railway/a VPS with a
persistent disk, but if you deploy to a serverless platform, swap the
file-write in `server.js` for a small database (SQLite with a mounted
volume, or a hosted database) instead.

## File structure

```
portfolio-site/
├── server.js          # backend (no dependencies)
├── package.json
├── data/
│   └── leads.json      # submissions land here
├── public/
│   └── index.html       # the site
└── README.md
```
