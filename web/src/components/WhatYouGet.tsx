import { SectionHeader } from './HowItWorks'

const FEATURES = [
  { name: 'AI-scored job feed', status: 'live' },
  { name: '220+ companies scraped automatically', status: 'live' },
  { name: 'Filter by industry, location, score, freshness', status: 'live' },
  { name: 'Pipeline tracking (Saved → Applied → Offer)', status: 'live' },
  { name: 'AI-drafted cover letters in five styles', status: 'live' },
  { name: 'Auto-suggest target roles from your resume', status: 'live' },
  { name: 'Daily or weekly digest of new high-fit jobs', status: 'live' },
  { name: 'Export your whole pipeline as CSV or JSON', status: 'live' },
  { name: 'Career chatbot — ask anything', status: 'soon' },
  { name: 'Interview prep + practice questions per job', status: 'soon' },
  { name: 'Salary negotiation coach', status: 'soon' },
  { name: 'Text or Discord alerts for 90+ matches', status: 'soon' },
  { name: 'Multiple resume versions for different roles', status: 'soon' },
  { name: 'LinkedIn referral and warm-intro drafter', status: 'planned' },
] as const

type FeatureStatus = (typeof FEATURES)[number]['status']

const STATUS_CONFIG: Record<FeatureStatus, { label: string; color: string; bg: string }> = {
  live: {
    label: 'Live',
    color: 'var(--color-success)',
    bg: 'var(--color-success-soft)',
  },
  soon: {
    label: 'Coming soon',
    color: 'var(--color-warning)',
    bg: 'var(--color-warning-soft)',
  },
  planned: {
    label: 'Planned',
    color: 'var(--color-text-tertiary)',
    bg: 'var(--color-bg-tinted)',
  },
}

export function WhatYouGet() {
  return (
    <section className="px-5 sm:px-8 py-24 sm:py-32">
      <div className="max-w-3xl mx-auto">
        <SectionHeader
          eyebrow="Everything included"
          title="One price. No tiers. No upsells."
          subtitle="If we build it, you get it. The list below is the entire roadmap — color-coded by what's working today vs. what's coming."
        />

        <div
          className="mt-16 rounded-3xl overflow-hidden"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <ul className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
            {FEATURES.map((feature) => {
              const cfg = STATUS_CONFIG[feature.status]
              return (
                <li
                  key={feature.name}
                  className="flex items-center justify-between gap-4 px-6 sm:px-7 py-5"
                >
                  <span
                    className="text-[15px] sm:text-[16px]"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {feature.name}
                  </span>
                  <span
                    className="flex-shrink-0 text-[11px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-full"
                    style={{
                      color: cfg.color,
                      background: cfg.bg,
                      fontWeight: 500,
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
          className="mt-8 text-[14px] text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          The full roadmap, including what's behind each item →{' '}
          <a
            href="https://github.com/arieslao/reverse-ats/blob/main/backlog.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            backlog.md
          </a>
        </p>
      </div>
    </section>
  )
}
