import { SectionHeader } from './HowItWorks'

// THE transparency section. The user explicitly asked for this — be honest
// about why we're holding back features and that it's for user safety.
//
// Most "we're in beta" pages are vague. This one is specific: phases, dates,
// and the actual reason each phase comes when it does.

const ROLLOUT = [
  {
    phase: 'Phase 0',
    label: 'Live now',
    status: 'done',
    date: 'April 2026',
    title: 'Open-source repo + headless scrape pipeline',
    body: 'You can clone the repo today and self-host the entire app on your laptop. The cloud scrape pipeline (Cloudflare Workers + D1 + Workers AI) is also live, processing ~850 jobs every 30 minutes.',
  },
  {
    phase: 'Phase 1',
    label: 'In progress',
    status: 'progress',
    date: 'Late April 2026',
    title: 'AI preprocessing tuning',
    body: 'Improving how we extract structured fields (skills, seniority, comp range) from raw job descriptions. Better data here means better matches downstream.',
  },
  {
    phase: 'Phase 1.5',
    label: 'Next',
    status: 'next',
    date: 'May 2026',
    title: 'Coverage + dedup expansion',
    body: 'Adding 4 new ATS types (SmartRecruiters, Workable, BambooHR, Recruitee) plus aggregator APIs (Adzuna, USAJobs). Goes from 220 → 1000+ companies. Semantic dedup catches the same job posted on multiple boards.',
  },
  {
    phase: 'Phases 2-3',
    label: 'After 1.5',
    status: 'later',
    date: 'May-June 2026',
    title: 'Multi-tenant API + tiered model routing',
    body: 'Per-user data isolation, GitHub OAuth login, sponsor gate. Smart routing of LLM calls to the right model size for each task (cheap for routine, premium for high-stakes).',
  },
  {
    phase: 'Phase 4-5',
    label: 'Hosted launch',
    status: 'later',
    date: '~6-8 weeks out',
    title: 'Hosted tier opens — sponsors get access',
    body: 'Public app at hosted URL. Sign in with GitHub. If you sponsor at $10/mo, you\'re in. Self-host stays free forever.',
  },
]

const SAFETY_REASONS = [
  {
    title: 'Privacy policy + Terms of Service',
    why: 'You\'ll be giving us your resume. That\'s sensitive personal data. We need formal documents stating exactly what we do with it (and don\'t do — we don\'t sell anything, ever) before we accept a single byte.',
  },
  {
    title: 'Auth-grade security review',
    why: 'GitHub OAuth eliminates the password-leak risk entirely, but we still need to test session management, token rotation, and authorization checks before storing your application history.',
  },
  {
    title: 'Daily encrypted backups',
    why: 'Schema migrations happen as we build. We won\'t store your saved jobs, notes, or pipeline state until we have automatic daily backups and a tested restore procedure. Your work is too important to risk.',
  },
  {
    title: 'GDPR/CCPA-ready data deletion',
    why: 'When you cancel, your data should be downloadable as a single JSON file and fully deleted within 30 days. The export already works. The deletion automation needs to be airtight.',
  },
  {
    title: 'Cost-cap safeguards',
    why: 'Per-user daily compute limits ensure no abuse can spike Cloudflare bills and force a service shutdown. These caps protect the project so it stays around for you.',
  },
]

export function Transparency() {
  return (
    <section id="transparency" className="px-5 sm:px-8 py-20 sm:py-28">
      <div className="max-w-5xl mx-auto">
        <SectionHeader
          eyebrow="Status & timeline"
          title="We're shipping in phases — on purpose."
          subtitle="A note on why the hosted version isn't live yet, and why that's actually for your protection."
        />

        {/* Phased rollout list */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <h3
              className="text-sm uppercase tracking-wider font-medium mb-5"
              style={{ color: 'var(--color-accent-hover)' }}
            >
              Rollout plan (public roadmap)
            </h3>
            <ol className="space-y-3">
              {ROLLOUT.map((item) => (
                <li
                  key={item.phase}
                  className="rounded-xl p-4"
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-subtle)',
                    opacity: item.status === 'later' ? 0.7 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {item.phase} — {item.title}
                    </span>
                    <span
                      className="flex-shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        color:
                          item.status === 'done'
                            ? 'var(--color-success)'
                            : item.status === 'progress'
                            ? 'var(--color-warning)'
                            : 'var(--color-text-tertiary)',
                        background:
                          item.status === 'done'
                            ? 'rgba(109, 217, 164, 0.1)'
                            : item.status === 'progress'
                            ? 'rgba(240, 184, 122, 0.1)'
                            : 'rgba(122, 122, 146, 0.1)',
                        border: `1px solid ${
                          item.status === 'done'
                            ? 'rgba(109, 217, 164, 0.3)'
                            : item.status === 'progress'
                            ? 'rgba(240, 184, 122, 0.3)'
                            : 'rgba(122, 122, 146, 0.2)'
                        }`,
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                  <div
                    className="text-xs mb-2"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {item.date}
                  </div>
                  <p
                    className="text-sm leading-relaxed"
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
              className="text-sm uppercase tracking-wider font-medium mb-5"
              style={{ color: 'var(--color-accent-hover)' }}
            >
              Why we're not shipping the hosted version yet
            </h3>
            <div
              className="rounded-xl p-5 mb-5"
              style={{
                background: 'rgba(124, 158, 255, 0.06)',
                border: '1px solid rgba(124, 158, 255, 0.2)',
              }}
            >
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--color-text-primary)' }}
              >
                We could ship the hosted app today. We're choosing not to until the
                items below are in place — because shipping a half-baked product that
                holds your resume and application history is how trust gets broken.
                Open-dev shipping fast doesn't excuse us from protecting your data.
                These come <em>first</em>, then features.
              </p>
            </div>

            <ul className="space-y-3">
              {SAFETY_REASONS.map((reason) => (
                <li
                  key={reason.title}
                  className="rounded-xl p-4"
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div
                    className="flex items-center gap-2 mb-1.5"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      style={{ color: 'var(--color-success)' }}
                      className="flex-shrink-0"
                    >
                      <path
                        d="M8 1.5L2 4v4c0 3.5 2.5 6.5 6 7 3.5-.5 6-3.5 6-7V4L8 1.5z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5.5 8l2 2 3-3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="font-semibold text-sm">{reason.title}</span>
                  </div>
                  <p
                    className="text-sm leading-relaxed pl-6"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {reason.why}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer link to actual technical roadmap */}
        <div
          className="mt-10 rounded-xl p-5 text-center"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <p
            className="text-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Want the technical detail? The full architecture, cost analysis,
            and per-feature build estimates are public →{' '}
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
