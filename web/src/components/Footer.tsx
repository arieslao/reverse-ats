// Footer — minimal, trust-building. Links to repo, sponsor, contact.

export function Footer() {
  return (
    <footer
      className="px-5 sm:px-8 py-12 mt-12"
      style={{
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-elevated)',
      }}
    >
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">
        {/* Brand */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
              style={{
                background: 'linear-gradient(135deg, var(--color-accent) 0%, #5d7eff 100%)',
                color: '#0a0a0f',
              }}
            >
              R
            </div>
            <span className="font-semibold tracking-tight">Reverse ATS</span>
          </div>
          <p
            className="text-sm leading-relaxed max-w-md"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            An open-source AI tool that flips the script on Applicant Tracking Systems.
            Built openly by{' '}
            <a
              href="https://arieslabs.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Aries Labs
            </a>{' '}
            with help from job seekers who tested it and made it better.
          </p>
        </div>

        {/* Project links */}
        <div>
          <h4
            className="text-xs uppercase tracking-wider font-medium mb-4"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Project
          </h4>
          <ul className="space-y-2.5 text-sm">
            <FooterLink href="https://github.com/arieslao/reverse-ats">
              GitHub Repo
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

        {/* Contact */}
        <div>
          <h4
            className="text-xs uppercase tracking-wider font-medium mb-4"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Contact
          </h4>
          <ul className="space-y-2.5 text-sm">
            <FooterLink href="mailto:aries@arieslabs.ai">
              aries@arieslabs.ai
            </FooterLink>
            <FooterLink href="https://github.com/arieslao">@arieslao on GitHub</FooterLink>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="max-w-5xl mx-auto mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-muted)',
        }}
      >
        <div>© 2026 Aries Labs. MIT licensed. Built openly.</div>
        <div className="flex items-center gap-3">
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
