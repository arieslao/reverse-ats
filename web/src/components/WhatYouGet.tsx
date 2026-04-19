import { SectionHeader } from './HowItWorks'

// What's included. Honest list — distinguishes "live now" from "coming."
// Job seekers respect honesty more than aspirational marketing.

const FEATURES = [
  { name: 'AI-scored job feed (Llama 3.3 70B)', status: 'live' },
  { name: '220+ companies scraped automatically', status: 'live' },
  { name: 'Filter by industry, location, score, freshness', status: 'live' },
  { name: 'Pipeline tracking (Saved → Applied → Offer)', status: 'live' },
  { name: 'AI-drafted cover letters (5 styles)', status: 'live' },
  { name: 'Auto-suggest target roles from your resume', status: 'live' },
  { name: 'Daily/weekly digest of new high-score jobs', status: 'live' },
  { name: 'CSV/JSON export of your whole pipeline', status: 'live' },
  { name: 'Career chatbot (ask anything)', status: 'soon' },
  { name: 'Interview prep + Q&A per job', status: 'soon' },
  { name: 'Salary negotiation coach', status: 'soon' },
  { name: 'SMS / Discord alerts for 90+ matches', status: 'soon' },
  { name: 'Multi-resume support (different roles)', status: 'soon' },
  { name: 'LinkedIn referral / intro drafter', status: 'planned' },
] as const

type FeatureStatus = (typeof FEATURES)[number]['status']

const STATUS_CONFIG: Record<FeatureStatus, { label: string; color: string; bg: string }> = {
  live: {
    label: 'Live',
    color: 'var(--color-success)',
    bg: 'rgba(109, 217, 164, 0.1)',
  },
  soon: {
    label: 'Coming this season',
    color: 'var(--color-warning)',
    bg: 'rgba(240, 184, 122, 0.1)',
  },
  planned: {
    label: 'Planned',
    color: 'var(--color-text-tertiary)',
    bg: 'rgba(122, 122, 146, 0.1)',
  },
}

export function WhatYouGet() {
  return (
    <section className="px-5 sm:px-8 py-20 sm:py-28">
      <div className="max-w-4xl mx-auto">
        <SectionHeader
          eyebrow="Everything included"
          title="One price. No Pro tier. No upsells."
          subtitle="If we build it, you get it. The list below is the entire roadmap — color-coded by what's working today vs. what's coming."
        />

        <div
          className="mt-10 rounded-2xl p-2"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <ul className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
            {FEATURES.map((feature) => {
              const cfg = STATUS_CONFIG[feature.status]
              return (
                <li
                  key={feature.name}
                  className="flex items-center justify-between gap-4 px-4 py-3.5"
                >
                  <span
                    className="text-sm sm:text-base"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {feature.name}
                  </span>
                  <span
                    className="flex-shrink-0 text-[11px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-md"
                    style={{
                      color: cfg.color,
                      background: cfg.bg,
                      border: `1px solid ${cfg.color}33`,
                    }}
                  >
                    {cfg.label}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <p
          className="mt-6 text-sm text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          See the full feature roadmap →{' '}
          <a
            href="https://github.com/arieslao/reverse-ats/blob/main/backlog.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            backlog.md
          </a>{' '}
          (yes, the actual roadmap is public)
        </p>
      </div>
    </section>
  )
}
