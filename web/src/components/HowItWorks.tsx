// Three steps. Plain language. No "AI-powered platform" jargon.

const STEPS = [
  {
    n: 'One',
    title: 'Tell us about you',
    body: 'Paste your resume. Pick the kinds of roles you want. Choose which industries to follow — tech, healthcare, design, education, climate, whichever fits. Takes about 5 minutes.',
    accent: 'var(--color-accent-soft)',
    border: 'rgba(201, 83, 46, 0.18)',
    accentText: 'var(--color-accent)',
  },
  {
    n: 'Two',
    title: 'We do the searching',
    body: 'Every 30 minutes, we quietly check 220+ employers. New openings get scored against your background — so when you sit down to look, the list is already short and relevant.',
    accent: 'var(--color-success-soft)',
    border: 'rgba(91, 129, 99, 0.2)',
    accentText: 'var(--color-success)',
  },
  {
    n: 'Three',
    title: 'You apply with less friction',
    body: 'Save the ones you like. Drag through stages — Saved → Applied → Phone Screen → Offer. Generate a cover letter in one click. Get a nudge when it\'s time to follow up.',
    accent: 'var(--color-warning-soft)',
    border: 'rgba(192, 138, 62, 0.2)',
    accentText: 'var(--color-warning)',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-5 sm:px-8 py-20 sm:py-28">
      <div className="max-w-5xl mx-auto">
        <SectionHeader
          eyebrow="How it works"
          title="Three steps. About ten minutes of setup."
          subtitle="Not “sign up and figure it out yourself.” We walk you through it."
        />

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="rounded-2xl p-7 transition-transform hover:translate-y-[-3px]"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <div
                className="inline-flex items-center justify-center px-3 py-1 rounded-full mb-5"
                style={{
                  background: step.accent,
                  border: `1px solid ${step.border}`,
                }}
              >
                <span
                  className="text-xs uppercase tracking-[0.14em] font-medium"
                  style={{ color: step.accentText }}
                >
                  {step.n}
                </span>
              </div>
              <h3
                className="text-2xl mb-3 tracking-tight"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {step.title}
              </h3>
              <p
                className="text-[15px] leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {step.body}
              </p>
            </div>
          ))}
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
    <div className="text-center max-w-2xl mx-auto">
      <div
        className="text-xs uppercase tracking-[0.16em] font-medium mb-4"
        style={{ color: 'var(--color-accent)' }}
      >
        {eyebrow}
      </div>
      <h2
        className="text-3xl sm:text-4xl md:text-5xl tracking-tight leading-[1.15]"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.025em',
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className="mt-4 text-base sm:text-lg leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
