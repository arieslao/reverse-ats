// Footer — minimal, warm, trust-building.

export function Footer() {
  return (
    <footer
      className="px-5 sm:px-8 py-14 mt-12"
      style={{
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-card)',
      }}
    >
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">
        {/* Brand */}
        <div className="md:col-span-2">
          <div className="flex items-baseline gap-2 mb-3">
            <span
              className="text-2xl"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 600,
                color: 'var(--color-accent)',
                letterSpacing: '-0.02em',
              }}
            >
              reverse
            </span>
            <span
              className="text-lg"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
              }}
            >
              ats
            </span>
          </div>
          <p
            className="text-[15px] leading-relaxed max-w-md"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            An open-source job-search tool that flips the script on Applicant
            Tracking Systems. Built openly with help from job seekers who
            tested it and made it better.
          </p>
        </div>

        <div>
          <h4
            className="text-xs uppercase tracking-[0.16em] font-medium mb-4"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Project
          </h4>
          <ul className="space-y-2.5 text-sm">
            <FooterLink href="https://github.com/arieslao/reverse-ats">
              GitHub repo
            </FooterLink>
            <FooterLink href="https://github.com/sponsors/arieslao">
              Sponsor — $10/mo
            </FooterLink>
            <FooterLink href="https://github.com/arieslao/reverse-ats/blob/main/backlog.md">
              Roadmap
            </FooterLink>
            <FooterLink href="https://github.com/arieslao/reverse-ats/issues">
              Report a bug
            </FooterLink>
          </ul>
        </div>

        <div>
          <h4
            className="text-xs uppercase tracking-[0.16em] font-medium mb-4"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Get in touch
          </h4>
          <ul className="space-y-2.5 text-sm">
            <FooterLink href="mailto:aries@arieslabs.ai">
              aries@arieslabs.ai
            </FooterLink>
            <FooterLink href="https://github.com/arieslao">@arieslao on GitHub</FooterLink>
          </ul>
        </div>
      </div>

      <div
        className="max-w-5xl mx-auto mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <div>© 2026. MIT licensed. Built openly.</div>
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-success)' }}
          />
          Pipeline running every 30 minutes
        </div>
      </div>
    </footer>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
      >
        {children}
      </a>
    </li>
  )
}
