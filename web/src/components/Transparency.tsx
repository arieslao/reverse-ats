import { SectionHeader } from './HowItWorks'

const ROLLOUT = [
  {
    phase: 'Live today',
    label: 'Live',
    status: 'done',
    title: 'Self-host free, or sponsor-tier hosted',
    body: 'The whole project is open source — if you can use a terminal, the setup guide gets the full tool running on your laptop with your data local. The hosted version is also live for sponsors at $5/mo: sign in, browse the scored feed, save jobs, work the pipeline, draft cover letters in three different lengths.',
  },
  {
    phase: 'Live today',
    label: 'Live',
    status: 'done',
    title: '220+ employers, 3,500+ live jobs',
    body: 'Greenhouse, Lever, Ashby, and Workday tenants (NVIDIA, CVS, Disney, Citi, Salesforce, plus Fortune 500 healthcare and retail) refreshed every 30 minutes across two redundant scrape lanes. Every posting shows when the employer posted it vs. when we saw it; reposted listings get a badge so ghost roles stand out.',
  },
  {
    phase: 'In progress',
    label: 'In progress',
    status: 'progress',
    title: 'Privacy policy + 30-day deletion guarantee',
    body: 'Drafting a real privacy policy and terms before we open enrollment beyond sponsors. Account-export already works; the verifiable 30-day deletion pipeline is in flight. These need to be airtight first.',
  },
  {
    phase: 'Coming soon',
    label: 'Next',
    status: 'next',
    title: 'Public open enrollment + 50 more Fortune 500 employers',
    body: 'Once the privacy and deletion items above are live, signups open to everyone. In parallel, the next batch of Workday tenants is staged: UnitedHealth, JPMorgan, Wells Fargo, Adobe, Target — bringing the registry from 174 companies to ~225.',
  },
  {
    phase: 'Planned',
    label: 'Later',
    status: 'later',
    title: 'PDF resume upload + email job alerts',
    body: 'Currently your resume is paste-as-text. PDF upload + parse next. Then opt-in email alerts so you don\'t have to refresh the feed — when a high-scoring match for your profile lands, we tell you.',
  },
]

const SAFETY_REASONS = [
  {
    title: 'Sign-in we trust ourselves',
    status: 'done',
    why: 'Email + password + TOTP multi-factor + password reset, all routed through Supabase Auth. Sessions, JWT verification, password handling — none of it our code, all audited and battle-tested.',
  },
  {
    title: 'Daily backups of your data',
    status: 'done',
    why: 'Cloudflare D1 automatically snapshots the database every day with point-in-time recovery. We didn\'t build our own backup pipeline — the platform handles it.',
  },
  {
    title: 'Spending caps that protect everyone',
    status: 'done',
    why: 'AI cover letters are tier-gated: 2/day free, 30/day sponsor. Same hard caps coming to AI scoring + embeddings so a single runaway account can\'t burn through the free-tier limits and force a shutdown.',
  },
  {
    title: 'A privacy promise we can stand behind',
    status: 'progress',
    why: 'Drafting a real privacy policy and terms before we open public signup. The short version: your resume stays in your account, gets used only to match jobs and draft cover letters, never gets sold or shared with third parties.',
  },
  {
    title: 'A clean way to leave',
    status: 'progress',
    why: 'When you cancel, you should be able to download everything as a single file (already works) and have us delete the rest within 30 days (pipeline in flight). Needs to be verifiable end-to-end before public enrollment.',
  },
]

export function Transparency() {
  return (
    <section id="transparency" className="px-5 sm:px-8 py-16 sm:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="Where we are"
          title="What's live, what's coming."
          subtitle="An honest changelog. Hosted is live for sponsors today. Public open enrollment waits until the trust foundations are airtight."
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

          {/* Trust foundations */}
          <div>
            <h3
              className="text-[12px] uppercase tracking-[0.18em] font-medium mb-6"
              style={{ color: 'var(--color-accent)' }}
            >
              Trust foundations
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
                Three of the five foundations below are already live. The
                remaining two gate <em style={{ fontStyle: 'italic' }}>public
                open enrollment</em> — sponsors trust us today; everyone else
                gets in when the privacy policy and 30-day deletion are
                airtight, not before.
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
                      style={{
                        color:
                          reason.status === 'done'
                            ? 'var(--color-success)'
                            : 'var(--color-warning)',
                      }}
                      className="flex-shrink-0"
                    >
                      <path
                        d="M9 1.5L2 4.5v5c0 4 3 7.5 7 8 4-.5 7-4 7-8v-5L9 1.5z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      {reason.status === 'done' ? (
                        <path
                          d="M6 9l2 2 4-4.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <path
                          d="M9 5.5v4M9 12v.01"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                    <span
                      className="text-[15px] flex-1"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        letterSpacing: '-0.022em',
                      }}
                    >
                      {reason.title}
                    </span>
                    <span
                      className="flex-shrink-0 text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
                      style={{
                        color:
                          reason.status === 'done'
                            ? 'var(--color-success)'
                            : 'var(--color-warning)',
                        background:
                          reason.status === 'done'
                            ? 'var(--color-success-soft)'
                            : 'var(--color-warning-soft)',
                        fontWeight: 500,
                      }}
                    >
                      {reason.status === 'done' ? 'Live' : 'In progress'}
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
