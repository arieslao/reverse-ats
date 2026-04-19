# Reverse ATS — Public Marketing Site

Static React + Vite + Tailwind v4 site that lives at the eventual public
URL (e.g. `reverseats.app` or `reverseats.pages.dev`). Deployed to
Cloudflare Pages.

This is the **first user-facing thing** for the project — it explains
the value prop, lets people sponsor at $10/mo, and is honest about what's
built today vs. what's coming.

## Local dev

```bash
cd web
npm install
npm run dev
# → http://localhost:5174
```

The site reads from the live Cloudflare Worker at
`https://reverse-ats-ingest.aries-lao.workers.dev` for the live job
counter (`/health`) and recent jobs preview (`/jobs`). To point at a
local Worker instead, create `.env.local`:

```
VITE_API_URL=http://localhost:8787
```

## Deploy to Cloudflare Pages (one-time setup)

The cleanest path is GitHub-connected auto-deploy:

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Pick `arieslao/reverse-ats`
3. Build settings:
   - **Framework preset:** Vite
   - **Build command:** `cd web && npm install && npm run build`
   - **Build output directory:** `web/dist`
   - **Root directory:** `/` (leave default)
4. Save. Cloudflare auto-deploys on every push to `main`.

You'll get a URL like `reverse-ats.pages.dev` immediately. Custom
domain (e.g. `reverseats.app`) can be added later from the same
dashboard at no extra cost (Cloudflare doesn't charge for the proxy,
only for the domain registration if you want one).

## Sections

The single-page site has these sections in order:

1. **Hero** — empathetic headline + 2 CTAs (Sponsor / Self-host)
2. **LiveCounter** — real-time stats from `/health` (job count, AI summaries)
3. **HowItWorks** — 3 plain-language steps
4. **WhatYouGet** — full feature list, color-coded by Live / Coming / Planned
5. **Pricing** — 2 cards (Free Self-host vs $10 Hosted) + price-anchor row
6. **Transparency** — phased rollout + the safety reasons we're holding back
7. **FAQ** — 9 honest answers covering privacy, comparison, "is this safe?"
8. **Footer** — repo links, contact

Design philosophy: **calm, honest, empathetic**. Job seekers are stressed
— the site doesn't add to that. No aggressive marketing. No fake
urgency. Real data where possible.
