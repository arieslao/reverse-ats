// Apple-style hero. Massive bold display headline, restrained subhead,
// clean pill CTAs, generous vertical room.

export function Hero() {
  return (
    <section
      id="top"
      className="relative px-5 sm:px-8 pt-20 pb-24 sm:pt-32 sm:pb-32 overflow-hidden"
    >
      <div className="max-w-5xl mx-auto text-center">
        {/* Eyebrow — minimal, premium */}
        <div
          className="inline-flex items-center gap-2 text-[12px] tracking-tight mb-7"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-success)' }}
          />
          Open source · Self-host free · Hosted launching soon
        </div>

        {/* Display headline — Apple sizing, very tight tracking */}
        <h1
          className="font-bold leading-[1.02]"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 7vw, 5.5rem)',
            letterSpacing: '-0.04em',
            color: 'var(--color-text-primary)',
            fontWeight: 700,
          }}
        >
          Job hunting,
          <br />
          <span style={{
            background: 'linear-gradient(90deg, var(--color-accent) 0%, #6da4ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            on your side.
          </span>
        </h1>

        {/* Subhead — Apple's quiet authority */}
        <p
          className="mt-7 sm:mt-9 max-w-2xl mx-auto leading-[1.5]"
          style={{
            fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)',
            color: 'var(--color-text-secondary)',
            fontWeight: 400,
          }}
        >
          An open-source companion that watches 220+ employers, scores each opening
          against your background, drafts your cover letters, and keeps every
          application organized. So you can spend less time scrolling, more time
          interviewing.
        </p>

        {/* CTAs — pill-shaped, refined hierarchy */}
        <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://github.com/sponsors/arieslao"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-7 py-3 rounded-full text-[15px] transition-all"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              fontWeight: 500,
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
            className="group w-full sm:w-auto inline-flex items-center justify-center text-[15px] px-1 transition-colors"
            style={{ color: 'var(--color-accent)', fontWeight: 500 }}
          >
            <span>Run it yourself, free</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="ml-1 transition-transform group-hover:translate-x-0.5"
            >
              <path
                d="M5 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>

        {/* Built-for row — universal audience tags */}
        <div className="mt-20 sm:mt-24">
          <div
            className="text-[11px] uppercase tracking-[0.18em] mb-5"
            style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}
          >
            Built for everyone job-hunting
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2.5 max-w-3xl mx-auto">
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
                className="text-[14px]"
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
