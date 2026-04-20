import { SectionHeader } from './HowItWorks'

const COMPARISON_PRICES = [
  { tool: 'Indeed Premium', price: '$14.99/mo' },
  { tool: 'Teal HQ Premium', price: '$29/mo' },
  { tool: 'LinkedIn Premium Career', price: '$29.99/mo' },
  { tool: 'ResumeWorded', price: '$19/mo' },
]

export function Pricing() {
  return (
    <section
      id="pricing"
      className="px-5 sm:px-8 py-24 sm:py-32"
      style={{ background: 'var(--color-bg-section)' }}
    >
      <div className="max-w-5xl mx-auto">
        <SectionHeader
          eyebrow="Pricing"
          title="Free if you self-host. $10/mo if you don't want to."
          subtitle="That's the whole price page. No tiers. No Pro upsell. No surprise charges."
        />

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-5">
          <PricingCard
            name="Self-host"
            price="Free"
            priceSubtext="MIT licensed, forever"
            description="Run it on your own laptop. Your data never leaves your machine. Best for privacy-conscious folks comfortable with a terminal."
            features={[
              'Every feature, no limits',
              'Use a free local AI (Ollama) or your own API key',
              'Your data, your computer, your rules',
              'About a 10-minute setup, walked through step by step',
            ]}
            cta="View install guide"
            ctaHref="https://github.com/arieslao/reverse-ats#installation-guide-step-by-step"
            primary={false}
          />

          <PricingCard
            name="Hosted"
            price="$10"
            priceSubtext="per month, cancel anytime"
            description="We run it for you. Sign in with GitHub. Your data lives encrypted on Cloudflare's infrastructure, never sold. For folks who want it to just work."
            features={[
              'Every feature, same as self-host',
              'No setup. No terminal. No Ollama install.',
              'Sign in with GitHub. You\'re in.',
              'Cancel anytime. Your data exports as JSON.',
            ]}
            cta="Reserve your spot — $10/mo"
            ctaHref="https://github.com/sponsors/arieslao"
            primary
            badge="Launching soon"
          />
        </div>

        {/* Price-anchor row */}
        <div
          className="mt-16 rounded-3xl p-8 text-center"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-5"
            style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}
          >
            For comparison
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {COMPARISON_PRICES.map((c) => (
              <div key={c.tool} className="flex items-baseline gap-2">
                <span
                  className="text-[14px]"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {c.tool}
                </span>
                <span
                  className="text-[14px] tabular-nums"
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
      className="rounded-3xl p-8 sm:p-10 relative"
      style={{
        background: 'var(--color-bg-card)',
        border: primary
          ? '2px solid var(--color-accent)'
          : '1px solid var(--color-border-subtle)',
      }}
    >
      {badge && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.14em] font-medium px-3 py-1 rounded-full"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
          }}
        >
          {badge}
        </div>
      )}

      <div className="mb-8">
        <h3
          className="text-[24px] mb-3 tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.022em',
          }}
        >
          {name}
        </h3>
        <p
          className="text-[15px] leading-[1.55]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {description}
        </p>
      </div>

      <div className="mb-8 pb-8 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div className="flex items-baseline gap-1.5">
          <span
            className="tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '3.5rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}
          >
            {price}
          </span>
        </div>
        <div
          className="mt-2 text-[14px]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {priceSubtext}
        </div>
      </div>

      <ul className="space-y-3.5 mb-9">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-3 text-[15px]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className="flex-shrink-0 mt-0.5"
              style={{ color: 'var(--color-success)' }}
            >
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1" opacity="0.2" />
              <path
                d="M6 10l3 3 5-6"
                stroke="currentColor"
                strokeWidth="1.5"
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
        className="block text-center px-5 py-3 rounded-full text-[15px] transition-colors"
        style={
          primary
            ? {
                background: 'var(--color-accent)',
                color: 'var(--color-accent-text)',
                fontWeight: 500,
              }
            : {
                background: 'var(--color-bg-tinted)',
                color: 'var(--color-text-primary)',
                fontWeight: 500,
              }
        }
        onMouseEnter={(e) => {
          if (primary) {
            e.currentTarget.style.background = 'var(--color-accent-hover)'
          } else {
            e.currentTarget.style.background = 'var(--color-border-subtle)'
          }
        }}
        onMouseLeave={(e) => {
          if (primary) {
            e.currentTarget.style.background = 'var(--color-accent)'
          } else {
            e.currentTarget.style.background = 'var(--color-bg-tinted)'
          }
        }}
      >
        {cta}
      </a>
    </div>
  )
}
