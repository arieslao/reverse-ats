// Hero — written like a friend who's been there, not a SaaS pitch.
// Universal: works for nurses, teachers, designers, engineers, career switchers.

export function Hero() {
  return (
    <section id="top" className="relative px-5 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
      <div className="max-w-3xl mx-auto text-center">
        {/* Eyebrow — quiet context */}
        <div
          className="inline-flex items-center gap-2 text-xs px-3.5 py-1.5 rounded-full mb-8"
          style={{
            background: 'var(--color-bg-card)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-success)' }}
          />
          Open source · Self-host free · Hosted launching soon
        </div>

        {/* Display headline — serif, large, generous leading */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl tracking-tight leading-[1.08]"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.025em',
          }}
        >
          A kinder way to find{' '}
          <em style={{ color: 'var(--color-accent)', fontStyle: 'italic' }}>
            your next role.
          </em>
        </h1>

        {/* Subhead — sets the human tone */}
        <p
          className="mt-7 text-lg sm:text-xl max-w-2xl mx-auto leading-[1.65]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Most job tools work for the companies. This one works for{' '}
          <span style={{ color: 'var(--color-text-primary)' }}>you</span>. It quietly
          watches 220+ employers, scores each new opening against your experience,
          drafts your cover letters, and keeps your applications organized — so you
          can spend less time scrolling and more time interviewing.
        </p>

        {/* CTAs — equal visual weight, paired buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://github.com/sponsors/arieslao"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-7 py-3.5 rounded-full text-base transition-all hover:translate-y-[-1px]"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              fontWeight: 500,
              boxShadow: '0 6px 20px -6px rgba(201, 83, 46, 0.4)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-accent)')}
          >
            Reserve hosted access — $10/mo
          </a>
          <a
            href="https://github.com/arieslao/reverse-ats#installation-guide-step-by-step"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-7 py-3.5 rounded-full text-base transition-all"
            style={{
              border: '1px solid var(--color-border-strong)',
              color: 'var(--color-text-primary)',
              background: 'transparent',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-card)'
              e.currentTarget.style.borderColor = 'var(--color-text-tertiary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--color-border-strong)'
            }}
          >
            Run it yourself, free →
          </a>
        </div>

        {/* Trust micro-copy */}
        <p
          className="mt-6 text-sm"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          No credit card to self-host · Cancel hosted anytime · Your data exports as JSON
        </p>

        {/* Who's it for — universal, with visible diversity of roles */}
        <div className="mt-16">
          <div
            className="text-xs uppercase tracking-[0.18em] mb-4"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Built for everyone job-hunting
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 max-w-3xl mx-auto">
            {[
              'Engineers',
              'Designers',
              'Nurses',
              'Teachers',
              'Consultants',
              'Marketers',
              'PMs',
              'Career switchers',
              'New grads',
              'Returning to work',
            ].map((role) => (
              <span
                key={role}
                className="text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
