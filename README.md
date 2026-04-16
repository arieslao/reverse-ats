# Reverse ATS

**An AI-powered job search tool that works for you, not against you.**

Companies use Applicant Tracking Systems (ATS) to filter out candidates. Reverse ATS flips the script — it automatically finds job openings at 220+ companies, tells you which ones are the best fit for your skills, helps you track every application, and even writes personalized cover letters for you. All running privately on your own computer.

---

## Who Is This For?

Anyone looking for a job. Whether you're a software engineer, nurse, teacher, consultant, or recent graduate — if you're tired of manually checking dozens of career pages every day, this tool does it for you.

**You don't need to be technical to use it.** If you can follow step-by-step instructions and copy-paste commands, you can set this up in about 10 minutes.

---

## What Does It Do?

1. **Finds jobs for you** — Automatically checks career pages at 220+ companies daily and collects new job postings
2. **Tells you which jobs fit** — AI reads each job description, compares it to your resume, and gives it a score from 0-100
3. **Lets you track applications** — A visual board (like sticky notes on a wall) where you drag jobs through stages: Saved, Applied, Interviewing, Offer
4. **Writes cover letters** — Click one button and get a professional cover letter tailored to that specific job
5. **Works for any industry** — Tech, Healthcare, Consulting, Retail, Media, Education, Government, Energy, and more

[![Watch the video](https://img.youtube.com/vi/uNipfgPpPBQ/0.jpg)](https://www.youtube.com/watch?v=uNipfgPpPBQ)

---

## System Requirements

This runs on any modern laptop or desktop computer:

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Operating System** | Windows 10, macOS 10.15, or Linux (Ubuntu 20.04+) | Any recent version |
| **RAM** | 4 GB | 8 GB+ |
| **Disk Space** | 500 MB (app + database) | 1 GB |
| **Internet** | Required (to fetch job postings) | Broadband |
| **Python** | 3.10 or newer | 3.12+ |
| **Node.js** | 18 or newer | 20+ |

**No special hardware needed.** No GPU, no powerful server. A basic laptop from the last 5 years will work fine.

For AI scoring and cover letters, you have options:
- **Free (no setup):** Keyword matching works out of the box — no AI service needed
- **Free (local AI):** Install [Ollama](https://ollama.com) to run AI on your own computer (needs 8 GB RAM)
- **Paid cloud AI:** Use OpenAI ($0.01-0.03 per job scored) or Anthropic for the best results

---

## Installation Guide (Step by Step)

### Step 0: Install the prerequisites

You need two programs installed on your computer: **Python** and **Node.js**. If you already have them, skip to Step 1.

<details>
<summary><b>How to install Python (click to expand)</b></summary>

**On Mac:**
1. Open the **Terminal** app (search for "Terminal" in Spotlight)
2. Type `python3 --version` and press Enter
3. If you see a version number (like `Python 3.12.0`), you're good! Skip ahead.
4. If not, go to [python.org/downloads](https://www.python.org/downloads/) and download the latest version
5. Open the downloaded file and follow the installer

**On Windows:**
1. Go to [python.org/downloads](https://www.python.org/downloads/)
2. Click the big yellow "Download Python" button
3. Run the installer — **IMPORTANT: check the box that says "Add Python to PATH"**
4. Click "Install Now"

**On Linux:**
```bash
sudo apt update && sudo apt install python3 python3-venv python3-pip
```
</details>

<details>
<summary><b>How to install Node.js (click to expand)</b></summary>

1. Go to [nodejs.org](https://nodejs.org/)
2. Download the **LTS** version (the green button)
3. Run the installer and follow the prompts
4. To verify, open Terminal/Command Prompt and type: `node --version`
</details>

### Step 1: Download the app

Open your **Terminal** (Mac/Linux) or **Command Prompt** (Windows) and run:

```bash
git clone https://github.com/arieslao/reverse-ats.git
cd reverse-ats
```

> **Don't have git?** You can also [download the ZIP file](https://github.com/arieslao/reverse-ats/archive/refs/heads/main.zip) from GitHub, unzip it, and open a terminal in that folder.

### Step 2: Set up the backend (the engine)

```bash
cd backend
python3 -m venv .venv
```

Now activate it:
- **Mac/Linux:** `source .venv/bin/activate`
- **Windows:** `.venv\Scripts\activate`

Then install the dependencies:
```bash
pip install -r requirements.txt
```

### Step 3: Set up the frontend (the web interface)

Open a **new terminal window** (keep the first one open) and run:

```bash
cd reverse-ats/app
npm install
```

### Step 4: Start the app

**In the first terminal** (backend):
```bash
cd reverse-ats/backend
source .venv/bin/activate   # Mac/Linux
# .venv\Scripts\activate    # Windows
python -m uvicorn api:app --host 0.0.0.0 --port 8091
```

You should see: `Uvicorn running on http://0.0.0.0:8091`

**In the second terminal** (frontend):
```bash
cd reverse-ats/app
npm run dev
```

You should see: `Local: http://localhost:5173/`

### Step 5: Open it in your browser

Go to **http://localhost:5173** in Chrome, Firefox, Safari, or Edge.

You should see the Reverse ATS dashboard. You're running!

### Step 6: Set up your profile

Click **Admin** in the left sidebar, then:

1. **Profile tab** — Paste your resume (copy from a Word doc, Google Doc, or PDF text). Set your target job titles, desired salary range, and key skills.

2. **Companies tab** — The app comes with 54 tech/fintech companies pre-loaded. Want a different industry? Click **Install Pack** on any industry pack (Healthcare, Consulting, Retail, etc.) to add ~20-30 companies instantly.

3. **LLM Settings tab** (optional) — If you want AI-powered scoring and cover letters:
   - **Easiest free option:** Install [Ollama](https://ollama.com), then select "Ollama" as your provider
   - **Best results:** Select "OpenAI" and paste your API key from [platform.openai.com](https://platform.openai.com)
   - **No AI needed:** Leave it on "Keyword Only" — the app still works, just with simpler matching

### Step 7: Find jobs!

Click **Feed** in the left sidebar, then click the **Refresh** button. The app will:
1. Check all your tracked companies for open positions
2. Score each one against your resume
3. Show you a ranked list with the best matches first

Click any job to expand it, then:
- **Apply** — Opens the company's application page in a new tab
- **Save** — Adds it to your Pipeline board for tracking
- **Draft Cover Letter** — AI writes a personalized cover letter you can copy and paste

---

## How to Use It Daily

1. Open your browser to **http://localhost:5173**
2. Start your backend and frontend (same commands as Step 4 — you'll need to do this each time you restart your computer)
3. Click **Refresh** to pull the latest jobs
4. Review your feed, save interesting ones, apply to the best matches
5. Track your applications on the **Pipeline** page — drag cards as you progress through interviews

**Want it to run automatically?** Set up a daily cron job (advanced):
```bash
# Scrapes new jobs and scores them every morning at 6 AM
0 6 * * * cd /path/to/reverse-ats/backend && .venv/bin/python pipeline.py >> logs/pipeline.log 2>&1
```

---

## Industry Packs

Not in tech? Install a pack for your industry from **Admin > Companies**:

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

You can also add any company manually — just enter its name, career page URL, and ATS type.

## AI Provider Comparison

| Provider | Cost | Quality | Setup Difficulty |
|----------|------|---------|-----------------|
| **Keyword Only** | Free | Basic matching | None — works immediately |
| **Ollama (local)** | Free | Good | Easy — one download |
| **OpenAI (GPT-4o-mini)** | ~$0.01-0.03/job | Excellent | Easy — just need API key |
| **Anthropic (Claude)** | ~$0.01-0.03/job | Excellent | Easy — just need API key |
| **OpenAI-Compatible** | Varies | Varies | Moderate — need a running endpoint |

**Our recommendation:** Start with **Keyword Only** (zero setup). If you want better matching, install **Ollama** for free local AI. If you want the best results and don't mind a few cents per job, use **OpenAI**.

---

## Frequently Asked Questions

**Q: Is this free?**
A: Yes. The app itself is 100% free and open source. The only optional cost is if you choose to use a paid AI provider (OpenAI or Anthropic) for smarter job matching and cover letters — even then it's about $0.01-0.03 per job.

**Q: Is my data private?**
A: Yes. Everything runs on your computer. Your resume, job applications, and cover letters never leave your machine. There's no account to create, no data sent to us, no tracking.

**Q: Can I use this on Windows?**
A: Yes. Works on Windows 10+, macOS, and Linux.

**Q: What if a company I want isn't in the list?**
A: Go to Admin > Companies and add it manually. You just need the company name, their career page URL, and their ATS type (most use Greenhouse — you can tell by looking at the career page URL).

**Q: How often should I refresh?**
A: Once a day is plenty. Most companies post new jobs during business hours. You can also set up automatic daily runs with a cron job.

**Q: Do I need a powerful computer?**
A: No. Any laptop from the last 5 years with 4 GB of RAM will work. If you want to run local AI (Ollama), 8 GB RAM is recommended.

**Q: Can I use this while job searching on my phone?**
A: The app is designed for desktop/laptop browsers. You can access it from a phone on the same WiFi network, but the interface is optimized for larger screens.

---

## Troubleshooting

**"Command not found" errors:** Make sure Python and Node.js are installed (see Step 0).

**"Port already in use" error:** Another app is using port 8091 or 5173. Either close that app or change the port:
```bash
# Use a different backend port
python -m uvicorn api:app --host 0.0.0.0 --port 8092
```

**Frontend can't connect to backend:** Make sure the backend is running (Step 4, first terminal). You should see `Uvicorn running on http://0.0.0.0:8091` in that terminal.

**No jobs showing up:** Click Refresh on the Feed page. The first scrape takes 1-2 minutes to fetch from all companies.

**AI scoring not working:** Go to Admin > LLM Settings and click "Test Connection." If it fails, check that your API key is correct or that Ollama is running (`ollama serve` in a terminal).

---

## For Developers

<details>
<summary><b>Technical details (click to expand)</b></summary>

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python, FastAPI, SQLite, Pydantic v2 |
| **Frontend** | React 18, TypeScript, Tailwind CSS v4, React Query, Vite 8 |
| **Scraping** | Public ATS APIs (Greenhouse, Lever, Ashby) — no auth required |
| **AI Scoring** | Any OpenAI-compatible API, Anthropic, Ollama, or keyword fallback |
| **Pipeline** | HTML5 native drag and drop (no external DnD library) |

### API Endpoints (24 total)

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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REVERSE_ATS_DB_PATH` | SQLite database file path | `./backend/reverse_ats.db` |

### Pipeline CLI

```bash
python pipeline.py                          # Full run: scrape + score
python pipeline.py --skip-score             # Scrape only (no LLM)
python pipeline.py --score-only             # Re-score existing unscored jobs
python pipeline.py --category fintech       # Only scrape one category
python pipeline.py --no-remote-filter       # Include non-remote jobs
python pipeline.py --db-path /tmp/test.db   # Custom database path
python pipeline.py --inference-url http://localhost:8080/v1/chat/completions
```

</details>

## Contributing

PRs welcome! Some ideas:

- **More industry packs** — Real estate, legal, nonprofit, biotech, crypto, automotive
- **More ATS integrations** — Workday, SmartRecruiters, iCIMS, Lever v2
- **Email/notification alerts** for high-score new jobs
- **Browser extension** to capture jobs from any career page
- **Resume parser** — PDF/DOCX import (no manual paste)
- **Interview prep** — AI-generated prep notes per company
- **Salary data overlay** — Levels.fyi or Glassdoor integration
- **Multi-user support** — For career coaches or bootcamps
- **Mobile-friendly UI** — Responsive layout for phones
- **Docker image** — One-command deployment

## License

MIT License. See [LICENSE](LICENSE).

---

Built by [Aries Labs AI](https://arieslabs.ai). If this helped you land a job, we'd love to hear about it!
