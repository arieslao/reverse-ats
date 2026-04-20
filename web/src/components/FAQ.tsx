import { useState } from 'react'
import { SectionHeader } from './HowItWorks'

const FAQS = [
  {
    q: 'Is this really free if I run it myself?',
    a: 'Yes. The whole project is open source under the MIT license. Walk through the setup guide, and you have the full app on your laptop. The only optional cost is if you choose to use a paid AI service like OpenAI (about 2¢ per job scored). The free options work great too.',
  },
  {
    q: 'Why $10 a month for the hosted version? What\'s the catch?',
    a: 'No catch. Running this on cloud infrastructure costs us about a nickel per active user per month, even with everything turned on. $10 covers infrastructure, our time to maintain the project, and lets us keep building. There is no Pro tier we\'re hiding behind another paywall — what you see in the feature list is what you get.',
  },
  {
    q: 'Will my resume be sold or shared with recruiters?',
    a: 'Never. Hard never. We don\'t share data with recruiters, ad networks, data brokers, or anyone else, period. Your resume is used only to score jobs against your background and generate cover letters you ask for. The privacy policy (drafted before the hosted version opens) will state this in plainly legally binding language.',
  },
  {
    q: 'What AI does the scoring? Is my resume sent to OpenAI or Anthropic?',
    a: 'By default, no. We use open-weight AI models running on Cloudflare\'s infrastructure (Llama, Qwen, Mistral). Your resume never leaves the Cloudflare network. If you specifically choose OpenAI or Anthropic in your settings, that\'s an opt-in — but the privacy-respecting default is what most people use.',
  },
  {
    q: 'Why isn\'t the hosted version available yet?',
    a: 'We\'re shipping in phases — and security and privacy land before any user data is collected. Privacy policy, audited sign-in, daily encrypted backups, and clean data deletion all come before we accept a single resume. See "Where we are" above for the full timeline. Your safety is more important than our launch date.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'You can export your entire account (saved jobs, pipeline notes, scores, cover letters) as a single file at any time. After you cancel, your account is frozen for 30 days (you can resubscribe to restore everything), then fully deleted from our database. No "we keep your data forever" small print.',
  },
  {
    q: 'I\'m not technical. Is self-hosting actually realistic for me?',
    a: 'The setup guide is written for non-technical folks — open Terminal, paste a few commands, click a button. Takes about 10 minutes. That said, if even that feels like too much, the hosted version is exactly for you: sign in, paste your resume, you\'re scoring jobs.',
  },
  {
    q: 'How is this different from LinkedIn or Indeed Premium?',
    a: 'LinkedIn and Indeed are job boards charging for premium search filters. Reverse ATS is an assistant that does the searching, scoring, and cover-letter writing for you across 220+ companies that mostly don\'t even appear on those boards (most use Greenhouse, Lever, or Workday directly). Different tool, different price, complementary if you want both.',
  },
  {
    q: 'Can I trust an open-source project with sensitive data?',
    a: 'Open source actually makes it more trustworthy, not less — every line of code is public, anyone can audit how your data is handled. The infrastructure (Cloudflare, GitHub Sponsors) is operated by major established companies. Compare that to closed-source job tools where you have to take their word for what they do with your resume.',
  },
]

export function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <section
      id="faq"
      className="px-5 sm:px-8 py-24 sm:py-32"
      style={{ background: 'var(--color-bg-section)' }}
    >
      <div className="max-w-3xl mx-auto">
        <SectionHeader
          eyebrow="FAQ"
          title="Honest answers to honest questions."
          subtitle="If your question isn't here, open a GitHub issue or email aries@arieslabs.ai."
        />

        <div className="mt-14 space-y-3">
          {FAQS.map((faq, i) => {
            const open = openIdx === i
            return (
              <div
                key={faq.q}
                className="rounded-2xl overflow-hidden transition-all"
                style={{
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <button
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left transition-colors"
                  aria-expanded={open}
                >
                  <span
                    className="text-[15px] sm:text-[16px]"
                    style={{
                      color: 'var(--color-text-primary)',
                      fontWeight: 500,
                    }}
                  >
                    {faq.q}
                  </span>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="flex-shrink-0 transition-transform"
                    style={{
                      color: 'var(--color-text-tertiary)',
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <path
                      d="M5 8l5 5 5-5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {open && (
                  <div
                    className="px-6 pb-6 text-[15px] leading-[1.55]"
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
