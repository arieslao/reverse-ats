# Reverse ATS

**An AI-powered job search tool that works for you, not against you.**

In a traditional ATS (Applicant Tracking System), recruiters filter candidates. Reverse ATS flips this — it scrapes job postings from 220+ companies across 9 industries, scores them against your resume using AI, tracks your applications with a drag-and-drop Kanban board, and generates tailored cover letters with one click.

Built for job seekers tired of manually checking career pages and guessing which roles are a good fit.

## What It Does

- **Scrapes 220+ companies** via public ATS APIs (Greenhouse, Lever, Ashby) — no API keys needed for scraping
- **9 industry packs** — Tech, Healthcare, Consulting, E-Commerce, Media, SaaS, Education, Defense, Climate
- **AI-powered matching** — an LLM reads each job description against your resume and scores relevance 0-100 with reasoning
- **Smart filters** — sort by Best Match/Newest/Company, filter by category, score, remote-only, exclude companies
- **Application pipeline** — drag-and-drop Kanban board to track every application from Saved through Offer
- **Cover letter generation** — one-click AI-drafted cover letters tailored to each specific job, stored per application
- **Works with any LLM** — OpenAI, Anthropic, Ollama (free/local), llama.cpp, or just keyword matching (no LLM needed)
- **Fully self-hosted** — your data stays on your machine. No accounts, no tracking, no subscriptions.

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Clone and install

```bash
git clone https://github.com/arieslao/reverse-ats.git
cd reverse-ats

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Frontend
cd ../app
npm install
```

### 2. Start the backend

```bash
cd backend
source .venv/bin/activate
python -m uvicorn api:app --host 0.0.0.0 --port 8091
```

The first run automatically:
- Creates the SQLite database
- Seeds 54 tech/fintech companies from the built-in registry
- Creates default profile and settings

### 3. Start the frontend

```bash
cd app
npm run dev
```

Open **http://localhost:5173**

### 4. Set up your profile

Go to the **Admin** tab:
1. **Profile** — Paste your resume, set target roles, skills, salary range, and preferences
2. **LLM Settings** — Pick your AI provider (or skip for free keyword matching)
3. **Companies** — Install industry packs or add individual companies

### 5. Run your first scrape

Click the **Refresh** button on the Feed page (triggers scrape + AI scoring), or run manually:

```bash
cd backend
python pipeline.py              # scrape + score all new jobs
python pipeline.py --skip-score # scrape only (faster, no LLM needed)
python pipeline.py --score-only # re-score existing jobs with updated profile
```

## Industry Packs

Not in tech? No problem. Install pre-built company packs for your industry from **Admin > Companies**:

| Pack | Companies | Examples |
|------|-----------|---------|
| **Tech & Fintech** | 54 (pre-installed) | Stripe, Coinbase, Anthropic, Netflix, Google |
| **Healthcare & Life Sciences** | 27 | Epic, UnitedHealth, Moderna, Flatiron Health, Tempus |
| **Consulting & Professional** | 20 | McKinsey, Deloitte, Accenture, Booz Allen, PwC |
| **E-Commerce & Retail** | 23 | Shopify, DoorDash, Airbnb, Nike, Target, Instacart |
| **Media & Entertainment** | 20 | Spotify, Disney, Roblox, Reddit, Bloomberg, Discord |
| **Enterprise SaaS & Cloud** | 30 | Salesforce, Snowflake, Cloudflare, Atlassian, MongoDB |
| **Education & EdTech** | 15 | Coursera, Duolingo, Khan Academy, Handshake |
| **Government & Defense** | 18 | SpaceX, Palantir, Lockheed Martin, Shield AI, Anduril |
| **Climate & Clean Energy** | 14 | Tesla, Rivian, Watershed, Form Energy, ChargePoint |

One click to install. You can also add any company manually with its ATS type and career page URL.

## LLM Providers

Configure in **Admin > LLM Settings**. All providers are optional — keyword matching works without any API key.

| Provider | Cost | Setup |
|----------|------|-------|
| **Keyword Only** | Free | No setup needed. Uses weighted keyword matching. |
| **Ollama** | Free | [Install Ollama](https://ollama.com), run `ollama pull llama3.1:8b` |
| **OpenAI** | ~$0.01-0.03/job | Get API key from [platform.openai.com](https://platform.openai.com) |
| **Anthropic** | ~$0.01-0.03/job | Get API key from [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI-Compatible** | Varies | Works with llama.cpp, vLLM, LiteLLM, Groq, Together AI, etc. |

**Recommended for free local scoring:** Install [Ollama](https://ollama.com) and select "Ollama" in LLM Settings. No API key, no cost, runs on your machine.

## Features

### Job Feed
- Search by company, title, keywords
- Filter by category (Fintech, Big Tech, AI, HealthTech, Quant, and all industry pack categories)
- Sort by Best Match, Newest First, Oldest First, Company A-Z, Title A-Z
- Min score slider — uses LLM score when available, keyword score as fallback
- Exclude specific companies (case-insensitive, comma-separated)
- Remote-only toggle
- "New Since" date filter (Today, Last 3/7/14/30 days)
- Direct "Apply" links to each company's career page
- Refresh button triggers a full scrape + score run
- Clean, readable job descriptions (HTML stripped and entities decoded)

### Application Pipeline
- **Drag and drop** cards between 8 stages: Saved, Applied, Phone Screen, Technical, Final, Offer, Rejected, Withdrawn
- Track contacts (name, email, role), notes, salary offers, and next steps per application
- Cover letter generation and storage — viewable anytime from the pipeline card
- **Archive/remove** individual applications with confirmation
- **Clear All** button for Rejected and Withdrawn columns
- Stage change timeline with full audit history
- Cards show company, title, location, score, applied date, and notes preview

### AI Scoring
- LLM reads the full job description against your resume
- Scores 0-100 with written reasoning
- Highlights matching skills and flags concerns
- Falls back to weighted keyword matching if LLM is unavailable
- Automatic scoring on daily scrape runs and manual refresh

### Cover Letters
- One-click generation from any job card (Feed or Pipeline)
- LLM writes a 3-4 paragraph letter tailored to the specific role and company
- References real achievements from your resume — no generic filler
- Avoids cliches ("I am writing to express my interest...")
- Copy to clipboard with one click
- Stored in your pipeline for future reference
- Regenerate for a different version

### Admin Panel (4 tabs)
- **Profile** — Resume text, target roles, salary range, must-have/nice-to-have skills, blacklisted companies/keywords, priority categories
- **Companies** — Industry packs (one-click install), add/edit/enable/disable individual companies, filter by category
- **LLM Settings** — Provider selector, API key, endpoint URL, model, temperature, max tokens, connection test
- **Scrape Status** — Last run details, trigger manual scrapes

### Analytics
- Application funnel visualization
- Key metrics: total discovered, applied, response rate
- Per-company breakdown with pipeline conversion rates
- Weekly activity trends (discovered vs applied)

## Daily Automation

Set up a cron job for automatic daily scraping and scoring:

```bash
# Run daily at 6:00 AM — scrapes new jobs and scores them with your LLM
0 6 * * * cd /path/to/reverse-ats/backend && .venv/bin/python pipeline.py >> logs/pipeline.log 2>&1
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python, FastAPI, SQLite, Pydantic v2 |
| **Frontend** | React 18, TypeScript, Tailwind CSS v4, React Query, Vite 8 |
| **Scraping** | Public ATS APIs (Greenhouse, Lever, Ashby) — no auth required |
| **AI Scoring** | Any OpenAI-compatible API, Anthropic, Ollama, or keyword fallback |
| **Pipeline** | HTML5 native drag and drop (no external DnD library) |

## API Endpoints

```
# Jobs
GET  /api/jobs                              — Paginated feed (sort, filter, exclude)
GET  /api/jobs/:id                          — Single job detail
POST /api/jobs/:id/dismiss                  — Dismiss a job
POST /api/jobs/:id/save                     — Save to pipeline
POST /api/jobs/:id/cover-letter             — Generate AI cover letter

# Pipeline
GET  /api/pipeline                          — All entries (Kanban data with job details)
POST /api/pipeline                          — Create pipeline entry
PUT  /api/pipeline/:id                      — Update stage, notes, contacts, cover letter
DELETE /api/pipeline/:id                    — Archive/remove entry
GET  /api/pipeline/:id/events               — Stage change history

# Profile
GET  /api/profile                           — Get profile and preferences
PUT  /api/profile                           — Update profile

# Admin — Companies
GET  /api/admin/companies                   — List tracked companies
POST /api/admin/companies                   — Add company
PUT  /api/admin/companies/:id               — Update company
DELETE /api/admin/companies/:id             — Remove company

# Admin — Industry Packs
GET  /api/admin/industry-packs              — List available packs
POST /api/admin/industry-packs/:id/install  — Install a pack

# Admin — LLM Settings
GET  /api/admin/llm-settings                — Get LLM config (key masked)
PUT  /api/admin/llm-settings                — Update LLM config
POST /api/admin/llm-settings/test           — Test connection + sample score

# Analytics & Scrape
GET  /api/analytics                         — Funnel metrics and trends
GET  /api/scrape/status                     — Last scrape run info
POST /api/scrape/trigger                    — Trigger scrape + score
```

## Contributing

PRs welcome. Some ideas:

- **More ATS integrations** — Workday, SmartRecruiters, iCIMS, Lever v2
- **More industry packs** — Real estate, legal, nonprofit, biotech, crypto
- **Email/notification alerts** for high-score new jobs (ntfy, email, Slack)
- **Browser extension** to capture jobs from any career page
- **Resume parser** — PDF/DOCX to structured profile (no manual paste)
- **Interview prep** — AI-generated prep notes per company and role
- **Salary data integration** — Levels.fyi, Glassdoor, or Payscale data overlay
- **Multi-user support** — auth + separate profiles (for career coaches, bootcamps)
- **Mobile-friendly UI** — responsive layout for phone/tablet use

## License

MIT License. See [LICENSE](LICENSE).

---

Built by [Aries Labs AI](https://arieslabs.ai). If this helped you land a job, let us know!
