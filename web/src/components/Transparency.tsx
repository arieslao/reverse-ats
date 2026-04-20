import { SectionHeader } from './HowItWorks'

const ROLLOUT = [
  {
    phase: 'Today',
    label: 'Live',
    status: 'done',
    title: 'You can run the full app yourself, free',
    body: 'The whole project is open source. If you\'re comfortable with a terminal, follow the setup guide and you have the entire tool — running on your laptop, with your data staying on your machine.',
  },
  {
    phase: 'This week',
    label: 'In progress',
    status: 'progress',
    title: 'Improving how the AI reads jobs',
    body: 'We\'re tuning the way the AI extracts skills, seniority, and salary ranges from raw job posts. Better understanding here means better matches when the hosted version opens.',
  },
  {
    phase: 'Next few weeks',
    label: 'Next',
    status: 'next',
    title: 'More employers, better matching',
    body: 'Expanding from 220 employers to over 1,000 — across more industries. Adding smart deduplication so the same job posted on three different boards shows up as one entry, not three.',
  },
  {
    phase: '1–2 weeks out',
    label: 'Coming',
    status: 'later',
    title: 'Sign-in and reading the job feed',
    body: 'Sponsors will be able to sign in with GitHub and browse the live job feed — read-only at first, no resume uploads yet. Lets us prove the sign-in flow is solid before any sensitive data is involved.',
  },
  {
    phase: '~6–8 weeks out',
    label: 'Hosted opens',
    status: 'later',
    title: 'Full hosted version goes live',
    body: 'Paste your resume, get your scored feed, drag jobs through your pipeline, generate cover letters, the whole thing. By this point all the safety pieces below are firmly in place.',
  },
]

const SAFETY_REASONS = [
  {
    title: 'A privacy promise we can stand behind',
    why: 'You\'ll be giving us your resume — that\'s sensitive personal information. We need a real privacy policy and terms of service stating exactly what we do with it (almost nothing, for what it\'s worth) before we accept a single byte.',
  },
  {
    title: 'Sign-in we\'d trust ourselves',
    why: 'We use GitHub sign-in to avoid password leaks entirely. But we still want to test session management and access checks carefully before storing your application history.',
  },
  {
    title: 'Daily backups of your data',
    why: 'Software changes as it grows. We won\'t store your saved jobs and notes until we have automatic daily backups and a tested way to restore them. Your work is too important to risk.',
  },
  {
    title: 'A clean way to leave',
    why: 'When you cancel, you should be able to download everything as a single file and have us delete the rest within 30 days. The download already works. The deletion needs to be airtight.',
  },
  {
    title: 'Spending caps that protect everyone',
    why: 'We\'re running on free cloud tiers to keep this affordable. Hard limits on per-account usage protect against abuse spiking our bills and forcing the service to shut down. Boring but important.',
  },
]

export function Transparency() {
  return (
    <section id="transparency" className="px-5 sm:px-8 py-24 sm:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="Where we are"
          title="Shipping in phases — on purpose."
          subtitle="A note on why the hosted version isn't live yet, and why holding back is actually the kindest thing we can do."
        />

        <div className="mt-16 sm:mt-20 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Rollout phases */}
          <div>
            <h3
              className="text-[12px] uppercase tracking-[0.18em] font-medium mb-6"
              style={{ color: 'var(--color-accent)' }}
            >
              The plan
            </h3>
            <ol className="space-y-3">
              {ROLLOUT.map((item) => (
                <li
                  key={item.phase}
                  className="rounded-2xl p-5"
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-subtle)',
                    opacity: item.status === 'later' ? 0.78 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <span
                      className="text-[15px]"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        letterSpacing: '-0.022em',
                      }}
                    >
                      {item.phase}
                    </span>
                    <span
                      className="flex-shrink-0 text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
                      style={{
                        color:
                          item.status === 'done'
                            ? 'var(--color-success)'
                            : item.status === 'progress'
                            ? 'var(--color-warning)'
                            : 'var(--color-text-tertiary)',
                        background:
                          item.status === 'done'
                            ? 'var(--color-success-soft)'
                            : item.status === 'progress'
                            ? 'var(--color-warning-soft)'
                            : 'var(--color-bg-tinted)',
                        fontWeight: 500,
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                  <div
                    className="text-[14px] mb-2"
                    style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}
                  >
                    {item.title}
                  </div>
                  <p
                    className="text-[14px] leading-[1.55]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {/* Why we're holding back */}
          <div>
            <h3
              className="text-[12px] uppercase tracking-[0.18em] font-medium mb-6"
              style={{ color: 'var(--color-accent)' }}
            >
              Why we're holding back
            </h3>
            <div
              className="rounded-2xl p-6 mb-3"
              style={{
                background: 'var(--color-accent-soft)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              }}
            >
              <p
                className="text-[15px] leading-[1.55]"
                style={{ color: 'var(--color-text-primary)' }}
              >
                We could ship the hosted version today and start charging for it.
                We're choosing not to, until the items below are in place — because
                shipping a half-baked product that holds your resume and
                application history is how trust gets broken. These come{' '}
                <em style={{ fontStyle: 'italic' }}>first</em>, then features.
              </p>
            </div>

            <ul className="space-y-3">
              {SAFETY_REASONS.map((reason) => (
                <li
                  key={reason.title}
                  className="rounded-2xl p-5"
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      style={{ color: 'var(--color-success)' }}
                      className="flex-shrink-0"
                    >
                      <path
                        d="M9 1.5L2 4.5v5c0 4 3 7.5 7 8 4-.5 7-4 7-8v-5L9 1.5z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6 9l2 2 4-4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      className="text-[15px]"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        letterSpacing: '-0.022em',
                      }}
                    >
                      {reason.title}
                    </span>
                  </div>
                  <p
                    className="text-[14px] leading-[1.55] pl-7"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {reason.why}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="mt-12 rounded-3xl p-7 text-center"
          style={{
            background: 'var(--color-bg-section)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <p
            className="text-[15px]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Want the technical detail? The full architecture, cost analysis, and
            per-feature build estimates are public →{' '}
            <a
              href="https://github.com/arieslao/reverse-ats/blob/main/backlog.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: 'var(--color-text-primary)' }}
            >
              backlog.md on GitHub
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}
