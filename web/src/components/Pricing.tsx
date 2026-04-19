import { SectionHeader } from './HowItWorks'

// Pricing. Two cards: Free Self-Host, $10 Hosted. No tiers, no upsells.
// Honest about what's not built yet.

const COMPARISON_PRICES = [
  { tool: 'Indeed Premium', price: '$14.99/mo' },
  { tool: 'Teal HQ Premium', price: '$29/mo' },
  { tool: 'LinkedIn Premium Career', price: '$29.99/mo' },
  { tool: 'ResumeWorded', price: '$19/mo' },
]

export function Pricing() {
  return (
    <section id="pricing" className="px-5 sm:px-8 py-20 sm:py-28">
      <div className="max-w-5xl mx-auto">
        <SectionHeader
          eyebrow="Pricing"
          title="Free if you self-host. $10/month if you don't want to."
          subtitle="That's it. No tiers, no Pro upsell, no surprise charges."
        />

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Self-host card */}
          <PricingCard
            name="Self-host"
            price="Free"
            priceSubtext="MIT licensed, forever"
            description="Run it on your own laptop. Your data never leaves your machine. Best for privacy-conscious folks comfortable with a terminal."
            features={[
              'Every feature, no limits',
              'Bring your own LLM (or use free local Ollama)',
              'Your data, your computer, your rules',
              '~10-min setup, walked through step by step',
            ]}
            cta="View install guide →"
            ctaHref="https://github.com/arieslao/reverse-ats#installation-guide-step-by-step"
            primary={false}
          />

          {/* Hosted card — primary */}
          <PricingCard
            name="Hosted"
            price="$10"
            priceSubtext="per month, cancel anytime"
            description="We run it for you. Sign in with GitHub. Your data lives on Cloudflare's infrastructure, encrypted at rest, never sold. For folks who want it to just work."
            features={[
              'Every feature included — same as self-host',
              'No setup, no terminal, no Ollama',
              'Sign in with GitHub, you\'re in',
              'Cancel anytime, your data exports as JSON',
            ]}
            cta="Reserve your spot — $10/mo"
            ctaHref="https://github.com/sponsors/arieslao"
            primary
            badge="Launching ~6-8 weeks"
          />
        </div>

        {/* Price-anchor row */}
        <div
          className="mt-12 rounded-xl p-6 text-center"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            className="text-xs uppercase tracking-wider mb-3"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            For comparison
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {COMPARISON_PRICES.map((c) => (
              <div key={c.tool} className="flex items-baseline gap-2">
                <span
                  className="text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {c.tool}
                </span>
                <span
                  className="text-sm font-mono tabular-nums"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {c.price}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function PricingCard({
  name,
  price,
  priceSubtext,
  description,
  features,
  cta,
  ctaHref,
  primary,
  badge,
}: {
  name: string
  price: string
  priceSubtext: string
  description: string
  features: string[]
  cta: string
  ctaHref: string
  primary: boolean
  badge?: string
}) {
  return (
    <div
      className="rounded-2xl p-7 sm:p-8 relative"
      style={{
        background: primary ? 'var(--color-bg-card)' : 'var(--color-bg-elevated)',
        border: primary
          ? '1px solid rgba(124, 158, 255, 0.4)'
          : '1px solid var(--color-border-subtle)',
        boxShadow: primary ? '0 16px 40px -12px rgba(124, 158, 255, 0.15)' : undefined,
      }}
    >
      {badge && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-md"
          style={{
            background: 'var(--color-accent)',
            color: '#0a0a0f',
          }}
        >
          {badge}
        </div>
      )}

      <div className="mb-5">
        <h3
          className="text-xl font-semibold mb-1 tracking-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {name}
        </h3>
        <p
          className="text-sm"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {description}
        </p>
      </div>

      <div className="mb-6 pb-6 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div className="flex items-baseline gap-1">
          <span
            className="text-4xl font-semibold tracking-tight"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {price}
          </span>
        </div>
        <div
          className="mt-1 text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {priceSubtext}
        </div>
      </div>

      <ul className="space-y-2.5 mb-7">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2.5 text-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="flex-shrink-0 mt-0.5"
              style={{ color: 'var(--color-success)' }}
            >
              <path
                d="M3 8.5l3 3 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <a
        href={ctaHref}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center px-5 py-2.5 rounded-lg font-medium text-sm transition-all"
        style={
          primary
            ? {
                background: 'var(--color-accent)',
                color: '#0a0a0f',
              }
            : {
                background: 'transparent',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-muted)',
              }
        }
        onMouseEnter={(e) => {
          if (primary) {
            e.currentTarget.style.background = 'var(--color-accent-hover)'
          } else {
            e.currentTarget.style.borderColor = 'var(--color-accent)'
          }
        }}
        onMouseLeave={(e) => {
          if (primary) {
            e.currentTarget.style.background = 'var(--color-accent)'
          } else {
            e.currentTarget.style.borderColor = 'var(--color-border-muted)'
          }
        }}
      >
        {cta}
      </a>
    </div>
  )
}
