# Hosting — Dashboard Bot

## Current setup

- **Railway** — main server: Telegram bot (webhook), Express, dashboard snapshots
- **Alpic** — MCP endpoint only (proxies dashboard creation to Railway)

## Railway (production)

- **URL**: `dashboard-bot-production.up.railway.app`
- **Plan**: Hobby ($5/mo) or free trial
- **Deploy**: auto-deploy on push to `main`
- **Env vars**: set in Railway dashboard → service → Variables

## Alpic (MCP)

- **URL**: `dashboard-bot-0a1dae4f.alpic.live`
- **Purpose**: MCP `analyze_data` tool visible in Alpic Playground and Claude.ai connectors
- **Note**: Alpic only routes `/mcp` — all other routes return 404
- **Env var**: `DASHBOARD_API_URL` must point to Railway URL

## Alternative hosting options

### VPS (full control)
- **Hetzner Cloud**: €3.29/mo (CX22 — 2 vCPU, 4GB RAM)
- **DigitalOcean**: $4-6/mo (1 vCPU, 512MB-1GB RAM)
- Deploy: ssh → git pull → pm2 start

### PaaS (zero-config)
- **Render**: free tier (750 hrs/mo) or $7/mo — sleeps after 15 min inactivity on free tier
- **Fly.io**: free tier (3 shared VMs) — `fly launch` → `fly deploy`

### Not recommended
- **Vercel / Netlify**: no long-running processes, would need webhook-only architecture
- **Alpic alone**: only routes `/mcp`, cannot serve dashboards or receive Telegram webhooks
