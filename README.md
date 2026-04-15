# Reverse ATS

**An AI-powered job search tool that works for you, not against you.**

In a traditional ATS (Applicant Tracking System), recruiters filter candidates. Reverse ATS flips this — it scrapes job postings from 54+ companies, scores them against your resume using AI, and gives you a daily ranked feed of jobs you should actually apply for.

Built for job seekers tired of manually checking career pages and guessing which roles are a good fit.

## What It Does

- **Scrapes 54+ companies daily** via public ATS APIs (Greenhouse, Lever, Ashby) — no API keys needed for scraping
- **AI-powered matching** — an LLM reads each job description against your resume and scores relevance 0-100 with reasoning
- **Application pipeline** — Kanban board to track every application from Saved through Offer (drag and drop)
- **Cover letter generation** — one-click AI-drafted cover letters tailored to each specific job posting
- **Works with any LLM** — OpenAI, Anthropic, Ollama (free/local), llama.cpp, or just keyword matching (no LLM needed)
- **Fully self-hosted** — your data stays on your machine. No accounts, no tracking, no subscriptions.

## Screenshots

| Job Feed | Pipeline | Cover Letter |
|----------|----------|--------------|
| Ranked feed with filters, scores, and direct apply links | Drag-and-drop Kanban board | AI-generated, copy-pasteable |

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Clone and install

```bash
git clone https://github.com/arieslabs/reverse-ats.git
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
- Seeds 54 companies from the built-in registry
- Creates default profile and settings

### 3. Start the frontend

```bash
cd app
npm run dev
```

Open **http://localhost:5173**

### 4. Configure your profile

Go to **Admin** tab:
1. **Profile** — Paste your resume, set target roles, skills, salary range
2. **LLM Settings** — Pick your AI provider (or skip for free keyword matching)
3. **Companies** — Add/remove companies to track

### 5. Run your first scrape

Click **Refresh** on the Feed page, or run manually:

```bash
cd backend
python pipeline.py              # scrape + score
python pipeline.py --skip-score # scrape only (faster, no LLM needed)
python pipeline.py --score-only # re-score existing jobs
```

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
- Filter by category (Fintech, Big Tech, AI, HealthTech, Quant)
- Sort by Best Match, Newest, Company, Title
- Min score slider (uses LLM score when available, keyword score as fallback)
- Exclude specific companies
- Remote-only toggle
- Direct "Apply" links to each company's career page

### Application Pipeline
- **Drag and drop** cards between stages: Saved, Applied, Phone Screen, Technical, Final, Offer, Rejected, Withdrawn
- Track contacts, notes, salary offers, next steps per application
- Cover letter generation and storage per application
- Archive/remove stale applications
- Timeline of all stage changes

### AI Scoring
- LLM reads the full job description against your resume
- Scores 0-100 with written reasoning
- Highlights matching skills and flags concerns
- Falls back to keyword matching if LLM is unavailable

### Cover Letters
- One-click generation from any job card
- Tailored to the specific role and company
- References real achievements from your resume
- Copy to clipboard with one click
- Stored in your pipeline for future reference

### Admin
- **Profile**: Resume, target roles, salary range, must-have/nice-to-have skills, blacklists
- **Companies**: Add/remove/enable/disable target companies with their ATS type
- **LLM Settings**: Configure AI provider, API key, model, temperature
- **Scrape Status**: View last run, trigger manual scrapes

## Supported Companies (54 built-in)

**Big Tech:** Netflix, NVIDIA, Google, Apple, Amazon, Meta, Microsoft

**Fintech:** Stripe, Block, Plaid, Affirm, Robinhood, Coinbase, Ripple, Ramp, Brex, Chime, Marqeta, Upstart, SoFi, Remitly, Wise, Toast, Bill.com, Wealthfront, Betterment, Airwallex, Mercury, Carta, Gusto, Deel, Klarna, PayPal, Mastercard, Visa, Adyen, Checkout.com

**AI & Tech:** Anthropic, OpenAI, Datadog, Databricks, Scale AI, Anduril, Palantir, Notion, Figma, Vercel, Supabase

**HealthTech:** Arcadia, Strata Decision, Oscar Health, Devoted Health, Cityblock Health

**Quant:** Citadel, Two Sigma, Jane Street, DE Shaw, Jump Trading, Hudson River Trading

Add more via the Admin > Companies tab or by editing `infrastructure/scripts/job_scraper.py`.

## Daily Automation

Set up a cron job for automatic daily scraping:

```bash
# Run daily at 6:00 AM
0 6 * * * cd /path/to/reverse-ats/backend && .venv/bin/python pipeline.py >> logs/pipeline.log 2>&1
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python, FastAPI, SQLite, Pydantic v2 |
| **Frontend** | React 18, TypeScript, Tailwind CSS v4, React Query, Vite |
| **Scraping** | Public ATS APIs (Greenhouse, Lever, Ashby) — no auth required |
| **AI** | Any OpenAI-compatible API, Anthropic, Ollama, or keyword fallback |

## API Endpoints

```
GET  /api/jobs                      — Paginated job feed with filters
GET  /api/jobs/:id                  — Single job detail
POST /api/jobs/:id/dismiss          — Dismiss a job
POST /api/jobs/:id/save             — Save to pipeline
POST /api/jobs/:id/cover-letter     — Generate cover letter

GET  /api/pipeline                  — All pipeline entries (Kanban data)
POST /api/pipeline                  — Create pipeline entry
PUT  /api/pipeline/:id              — Update stage, notes, contacts
DELETE /api/pipeline/:id            — Archive/remove entry
GET  /api/pipeline/:id/events       — Stage change history

GET  /api/profile                   — Get profile/preferences
PUT  /api/profile                   — Update profile

GET  /api/admin/companies           — List tracked companies
POST /api/admin/companies           — Add company
PUT  /api/admin/companies/:id       — Update company
DELETE /api/admin/companies/:id     — Remove company

GET  /api/admin/llm-settings        — Get LLM config
PUT  /api/admin/llm-settings        — Update LLM config
POST /api/admin/llm-settings/test   — Test LLM connection

GET  /api/analytics                 — Funnel metrics
GET  /api/scrape/status             — Last scrape run
POST /api/scrape/trigger            — Trigger scrape + score
```

## Contributing

PRs welcome. Some ideas:
- More ATS integrations (Workday, SmartRecruiters, iCIMS)
- Email/notification alerts for high-score new jobs
- Browser extension to capture jobs from any career page
- Resume parser (PDF/DOCX to structured profile)
- Interview prep notes per company
- Salary data integration

## License

MIT License. See [LICENSE](LICENSE).

---

Built by [Aries Labs AI](https://arieslabs.ai). If this helped you land a job, let us know!
