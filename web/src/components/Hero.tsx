// Hero — first 2 seconds. Empathetic over aggressive: job hunting IS brutal,
// we're not pretending otherwise. The site is for people who are tired.

export function Hero() {
  return (
    <section id="top" className="relative px-5 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div className="max-w-4xl mx-auto text-center">
        {/* Eyebrow — subtle context before the headline lands */}
        <div
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-6"
          style={{
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent-hover)',
            border: '1px solid rgba(124, 158, 255, 0.2)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-success)' }}
          />
          Open source · Self-host free · Hosted launching soon
        </div>

        {/* Empathy-first headline. No "REVOLUTIONIZE YOUR CAREER!!" */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.1]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Job hunting is brutal.
          <br />
          <span style={{ color: 'var(--color-text-secondary)' }}>
            We built a tool to make it less brutal.
          </span>
        </h1>

        {/* Subhead — what it actually does, in one sentence */}
        <p
          className="mt-6 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Reverse ATS finds jobs at <strong style={{ color: 'var(--color-text-primary)' }}>220+ companies</strong>,
          scores each one against your resume with AI, tracks every application, and
          drafts personalized cover letters. Open source. Yours forever.
        </p>

        {/* CTAs — two clear paths, equal visual weight */}
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://github.com/sponsors/arieslao"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3 rounded-lg font-medium text-base transition-all hover:translate-y-[-1px]"
            style={{
              background: 'var(--color-accent)',
              color: '#0a0a0f',
              boxShadow: '0 8px 24px rgba(124, 158, 255, 0.25)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-accent)')}
          >
            Sponsor for hosted access — $10/mo
          </a>
          <a
            href="https://github.com/arieslao/reverse-ats#installation-guide-step-by-step"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3 rounded-lg font-medium text-base transition-all"
            style={{
              border: '1px solid var(--color-border-muted)',
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-elevated)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-muted)')}
          >
            Self-host (always free) →
          </a>
        </div>

        {/* Trust micro-copy under CTAs */}
        <p
          className="mt-5 text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          No credit card to self-host · GitHub Sponsors handles billing · Cancel anytime
        </p>
      </div>
    </section>
  )
}
