import { useState } from 'react'
import { SectionHeader } from './HowItWorks'

// Honest answers to questions job seekers actually have.
// Every "is this safe?" question gets a direct answer.

const FAQS = [
  {
    q: 'Is this actually free if I self-host?',
    a: 'Yes. The repo is MIT-licensed and the install guide walks you through it step-by-step. The only optional cost is if you choose to use a paid LLM (OpenAI ~$0.02/job scored). We recommend Groq\'s free tier or local Ollama — both completely free.',
  },
  {
    q: 'Why $10/month for hosted? What\'s the catch?',
    a: 'No catch. Compute on Cloudflare\'s free/cheap tiers costs us about $0.05 per heavy user per month, even with every feature turned on. $10 covers the infrastructure, our time to maintain the project, and lets us keep the app actively developed. There is no "Pro" tier we\'re hiding behind another paywall.',
  },
  {
    q: 'Will my resume be sold or shared with recruiters?',
    a: 'Never. Hard never. We don\'t share data with recruiters, advertisers, data brokers, or anyone else, period. Your resume is used only to score jobs against your profile and generate cover letters you ask for. The Privacy Policy (drafted before hosted launches) will state this in legally binding language.',
  },
  {
    q: 'What AI does the scoring? Is my resume sent to OpenAI?',
    a: 'By default, no. We use open-weight models (Llama 3.3 70B, Qwen, Mistral) running on Cloudflare\'s infrastructure. Your resume never leaves the Cloudflare network. If you specifically choose OpenAI or Anthropic in settings, that\'s an opt-in — but the default is privacy-respecting open models.',
  },
  {
    q: 'Why isn\'t the hosted version available yet?',
    a: 'We\'re shipping in phases, with security and privacy infrastructure landing before any user data is collected. Privacy policy, audited auth flows, daily encrypted backups, and GDPR-compliant data deletion all come BEFORE we accept a single resume. See the Status section above for the rollout timeline.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'You can export your entire account (saved jobs, pipeline notes, scores, generated cover letters) as a single JSON file at any time — that\'s already built. After you cancel, your account is frozen for 30 days (you can resubscribe to restore everything), then fully deleted from our database. No "we\'ll keep your data forever" tricks.',
  },
  {
    q: 'Can I trust an open-source project with sensitive data?',
    a: 'Open-source actually makes it more trustworthy, not less. Every line of code is public — anyone can audit how your data is handled. The infrastructure (Cloudflare, GitHub Sponsors) is operated by major established companies. Compare that to closed-source job tools where you have to take their word for what they do with your resume.',
  },
  {
    q: 'I\'m not technical. Is self-hosting really doable?',
    a: 'The README has a step-by-step install guide written for non-technical users — open Terminal, paste a few commands, click Refresh. Takes about 10 minutes. If that\'s too much, the hosted version ($10/mo) is exactly for you — sign in, paste your resume, you\'re scoring jobs.',
  },
  {
    q: 'How is this different from LinkedIn / Indeed Premium?',
    a: 'LinkedIn and Indeed are job boards that charge you for premium search filters. Reverse ATS is an AI assistant that does the searching, scoring, and cover-letter writing for you across 220+ companies that don\'t even appear on those boards (most use Greenhouse, Lever, Workday directly). Different tool, different price, complementary if you want.',
  },
]

export function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <section id="faq" className="px-5 sm:px-8 py-20 sm:py-28">
      <div className="max-w-3xl mx-auto">
        <SectionHeader
          eyebrow="FAQ"
          title="Honest answers to honest questions."
          subtitle="If your question isn't here, open a GitHub Issue or email aries@arieslabs.ai."
        />

        <div className="mt-10 space-y-3">
          {FAQS.map((faq, i) => {
            const open = openIdx === i
            return (
              <div
                key={faq.q}
                className="rounded-xl overflow-hidden transition-colors"
                style={{
                  background: 'var(--color-bg-card)',
                  border: `1px solid ${open ? 'var(--color-border-muted)' : 'var(--color-border-subtle)'}`,
                }}
              >
                <button
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left transition-colors"
                  aria-expanded={open}
                >
                  <span
                    className="text-sm sm:text-base font-medium"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {faq.q}
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    className="flex-shrink-0 transition-transform"
                    style={{
                      color: 'var(--color-text-tertiary)',
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <path
                      d="M4.5 7l4.5 4.5L13.5 7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {open && (
                  <div
                    className="px-5 pb-4 text-sm leading-relaxed"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
