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
      className="px-5 sm:px-8 py-16 sm:py-32"
      style={{ background: 'var(--color-bg-section)' }}
    >
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="Pricing"
          title="Free to start. $5/mo if you want generous AI limits."
          subtitle="Hosted free works fully — just bounded so we can keep the lights on. Sponsor lifts the daily AI caps and unlimited saves."
        />

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-5">
          <PricingCard
            name="Self-host"
            price="Free"
            priceSubtext="MIT licensed, forever"
            description="Run it on your own laptop. Your data never leaves your machine. Best for the terminal-comfortable."
            features={[
              'Every feature, no limits',
              'Use free local AI (Ollama) or your own API key',
              'Your data, your computer, your rules',
              '~10 minute setup',
            ]}
            cta="View install guide"
            ctaHref="https://github.com/arieslao/reverse-ats#installation-guide-step-by-step"
            primary={false}
          />

          <PricingCard
            name="Hosted Free"
            price="$0"
            priceSubtext="sign up, no card required"
            description="The hosted app with daily AI caps. Resume edits, browsing, and pipeline tracking are all unlimited."
            features={[
              'Unlimited job feed + filters',
              'Unlimited resume edits',
              'Save up to 50 jobs to your pipeline',
              '2 AI cover letters per day',
              '1 batch rescore per day (25 jobs)',
              '1 AI role suggestion per day',
            ]}
            cta="Sign up free"
            ctaHref="/sign-up"
            primary={false}
          />

          <PricingCard
            name="Hosted Sponsor"
            price="$5"
            priceSubtext="per month, cancel anytime"
            description="Roomy AI limits and unlimited saves. Supports the project so the free tier stays generous."
            features={[
              'Unlimited saved jobs',
              '30 AI cover letters per day',
              '4 batch rescores per day (100 jobs)',
              '5 AI role suggestions per day',
              'Priority support · cancel anytime',
              'Data exports as JSON whenever',
            ]}
            cta="Become a sponsor — $5/mo"
            ctaHref="https://github.com/sponsors/arieslao"
            primary
            badge="Launching soon"
          />
        </div>

        {/* Detailed limit comparison */}
        <div
          className="mt-12 rounded-3xl overflow-hidden"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            className="px-8 py-5 border-b text-[11px] uppercase tracking-[0.16em]"
            style={{
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-tertiary)',
              fontWeight: 500,
            }}
          >
            What you get on each tier
          </div>
          {(() => {
            const rows: [string, string, string][] = [
              ['Save jobs', '50 lifetime', 'Unlimited'],
              ['AI cover letters', '2 / day', '30 / day'],
              ['Rescore (batches of 25)', '1 / day', '4 / day'],
              ['AI role suggestions', '1 / day', '5 / day'],
              ['Resume edits', 'Unlimited', 'Unlimited'],
              ['Job feed + filters', 'Unlimited', 'Unlimited'],
              ['Pipeline + analytics', 'Unlimited', 'Unlimited'],
            ];
            return (
              <>
                {/* Tablet+ — three-column table. Hidden on mobile in favor
                    of a stacked layout that doesn't force horizontal scroll. */}
                <div className="hidden sm:block">
                  <table
                    className="w-full"
                    style={{ borderCollapse: 'collapse', color: 'var(--color-text-secondary)' }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <th
                          className="text-left px-8 py-4 text-[14px] font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          Action
                        </th>
                        <th
                          className="text-left px-6 py-4 text-[14px] font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          Hosted Free
                        </th>
                        <th
                          className="text-left px-6 py-4 text-[14px] font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          Hosted Sponsor ($5/mo)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-[14px]">
                      {rows.map(([action, free, sponsor]) => (
                        <tr key={action} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                          <td className="px-8 py-3.5" style={{ color: 'var(--color-text-primary)' }}>{action}</td>
                          <td className="px-6 py-3.5">{free}</td>
                          <td className="px-6 py-3.5">{sponsor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile — Free/Sponsor side-by-side per row, no scrolling. */}
                <ul className="sm:hidden">
                  {rows.map(([action, free, sponsor], idx) => (
                    <li
                      key={action}
                      className="px-5 py-4"
                      style={{
                        borderTop: idx === 0 ? 'none' : '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <div
                        className="text-[14px] font-medium mb-2"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {action}
                      </div>
                      <div className="flex justify-between gap-4 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                        <div>
                          <div
                            className="text-[10px] uppercase tracking-[0.12em] mb-0.5"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            Free
                          </div>
                          {free}
                        </div>
                        <div className="text-right">
                          <div
                            className="text-[10px] uppercase tracking-[0.12em] mb-0.5"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            Sponsor
                          </div>
                          {sponsor}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
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
