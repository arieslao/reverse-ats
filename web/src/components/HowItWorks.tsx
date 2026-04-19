// 3 steps. Plain language. No jargon.

const STEPS = [
  {
    n: '01',
    title: 'Tell it about you',
    body: 'Paste your resume. Set the roles you want. Pick which industries (Tech, Healthcare, Consulting, Climate, etc.) to track. Takes 5 minutes.',
    accent: 'rgba(124, 158, 255, 0.15)',
    border: 'rgba(124, 158, 255, 0.3)',
  },
  {
    n: '02',
    title: 'AI does the searching',
    body: 'Every 30 minutes, we check 220+ company career pages and score new openings against your resume. Wake up to a curated list of jobs that actually fit.',
    accent: 'rgba(109, 217, 164, 0.12)',
    border: 'rgba(109, 217, 164, 0.3)',
  },
  {
    n: '03',
    title: 'Apply, track, iterate',
    body: 'Save jobs to your pipeline. Drag through stages (Applied → Phone Screen → Offer). Generate cover letters in one click. Get reminders to follow up.',
    accent: 'rgba(240, 184, 122, 0.12)',
    border: 'rgba(240, 184, 122, 0.3)',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-5 sm:px-8 py-20 sm:py-28">
      <div className="max-w-5xl mx-auto">
        <SectionHeader
          eyebrow="How it works"
          title="Three steps. About 10 minutes of setup."
          subtitle="Not 'sign up and figure it out yourself.' We walk you through it."
        />

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="rounded-xl p-6 transition-transform hover:translate-y-[-2px]"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center font-mono font-semibold text-sm mb-5"
                style={{
                  background: step.accent,
                  border: `1px solid ${step.border}`,
                  color: 'var(--color-text-primary)',
                }}
              >
                {step.n}
              </div>
              <h3
                className="text-lg font-semibold mb-2 tracking-tight"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {step.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
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
        className="text-xs uppercase tracking-wider font-medium mb-3"
        style={{ color: 'var(--color-accent-hover)' }}
      >
        {eyebrow}
      </div>
      <h2
        className="text-3xl sm:text-4xl font-semibold tracking-tight"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className="mt-3 text-base"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
