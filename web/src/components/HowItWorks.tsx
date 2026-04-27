// Three steps. Apple-style: alternating section background, large display
// numbers, premium card layout, with hero illustrations from /public/steps.

const STEPS = [
  {
    n: '01',
    title: 'Tell us about you',
    body: 'Paste your resume. Our AI reads it and suggests roles that match your background today — plus the natural next steps for your career, so you can aim for both. Then pick which industries to follow.',
    image: '/steps/01-tell-us-about-you.png',
    imageAlt: 'Pasting your resume — the AI suggests roles you fit today plus stretch roles for the next level',
  },
  {
    n: '02',
    title: 'We do the searching',
    body: 'Every 30 minutes, we quietly check 220+ employers. New openings get scored against your background — so when you sit down to look, the list is already short and relevant.',
    image: '/steps/02-we-search.png',
    imageAlt: 'A scored job feed of relevant openings appearing automatically',
  },
  {
    n: '03',
    title: 'You apply with less friction',
    body: 'Save the ones you like. Drag through stages — Saved → Applied → Phone Screen → Offer. Generate a cover letter in one click. Get a nudge when it\'s time to follow up.',
    image: '/steps/03-you-apply.png',
    imageAlt: 'A pipeline board tracking applications through stages from Saved to Offer',
  },
]

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="px-5 sm:px-8 py-16 sm:py-32"
      style={{ background: 'var(--color-bg-section)' }}
    >
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="How it works"
          title="Three steps. About ten minutes."
          subtitle="Not “sign up and figure it out yourself.” We walk you through it."
        />

        <div className="mt-16 sm:mt-20 grid grid-cols-1 md:grid-cols-3 gap-5">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="rounded-3xl overflow-hidden flex flex-col transition-transform hover:translate-y-[-3px]"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              {/* Hero illustration */}
              <div
                className="relative w-full overflow-hidden"
                style={{
                  aspectRatio: '4 / 3',
                  background: 'var(--color-bg-tinted)',
                }}
              >
                <img
                  src={step.image}
                  alt={step.imageAlt}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  style={{
                    display: 'block',
                  }}
                />
              </div>

              {/* Card body */}
              <div className="flex-1 p-7 sm:p-8">
                <div
                  className="text-[32px] sm:text-[36px] mb-4 tabular-nums"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    color: 'var(--color-accent)',
                    letterSpacing: '-0.04em',
                    lineHeight: 1,
                  }}
                >
                  {step.n}
                </div>
                <h3
                  className="text-[22px] sm:text-[24px] mb-3 tracking-tight"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.022em',
                  }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-[15px] leading-[1.55]"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Reinforce the AI role-suggestion benefit below the steps */}
        <div
          className="mt-12 max-w-3xl mx-auto rounded-2xl p-6 sm:p-7 text-center"
          style={{
            background: 'var(--color-accent-soft)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
          }}
        >
          <p
            className="text-[15px] sm:text-[16px] leading-[1.55]"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <strong style={{ color: 'var(--color-accent)' }}>Aim higher than today's role.</strong>{' '}
            Our AI doesn't just match you to jobs you already qualify for — it also surfaces the
            natural next-step roles based on your background, so every application is a chance to
            advance, not just stay level.
          </p>
        </div>
      </div>
    </section>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="text-center max-w-3xl mx-auto">
      <div
        className="text-[12px] uppercase tracking-[0.18em] mb-4"
        style={{ color: 'var(--color-accent)', fontWeight: 500 }}
      >
        {eyebrow}
      </div>
      <h2
        className="tracking-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 4vw, 3.5rem)',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.035em',
          lineHeight: 1.05,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className="mt-5 text-[17px] sm:text-[19px] leading-[1.5]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
