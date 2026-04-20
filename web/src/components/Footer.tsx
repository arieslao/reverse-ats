// Apple-style footer — multiple columns, restrained, generous spacing.

const PROJECT_LINKS = [
  { label: 'GitHub repo', href: 'https://github.com/arieslao/reverse-ats' },
  { label: 'Sponsor — $10/mo', href: 'https://github.com/sponsors/arieslao' },
  { label: 'Roadmap', href: 'https://github.com/arieslao/reverse-ats/blob/main/backlog.md' },
  { label: 'Report an issue', href: 'https://github.com/arieslao/reverse-ats/issues' },
]

const CONTACT_LINKS = [
  { label: 'aries@arieslabs.ai', href: 'mailto:aries@arieslabs.ai' },
  { label: '@arieslao on GitHub', href: 'https://github.com/arieslao' },
]

export function Footer() {
  return (
    <footer
      className="px-5 sm:px-8 pt-16 pb-10"
      style={{
        background: 'var(--color-bg-base)',
        borderTop: '1px solid var(--color-border-subtle)',
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-14">
          {/* Brand */}
          <div className="md:col-span-5">
            <div
              className="text-[18px] tracking-tight mb-3"
              style={{
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.022em',
              }}
            >
              Reverse ATS
            </div>
            <p
              className="text-[14px] leading-[1.55] max-w-md"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              An open-source job-search tool that flips the script on Applicant
              Tracking Systems. Built openly with help from job seekers who tested
              it and made it better.
            </p>
          </div>

          <div className="md:col-span-3 md:col-start-7">
            <h4
              className="text-[12px] uppercase tracking-[0.16em] font-medium mb-4"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Project
            </h4>
            <ul className="space-y-2.5 text-[14px]">
              {PROJECT_LINKS.map((l) => (
                <FooterLink key={l.label} href={l.href}>{l.label}</FooterLink>
              ))}
            </ul>
          </div>

          <div className="md:col-span-3">
            <h4
              className="text-[12px] uppercase tracking-[0.16em] font-medium mb-4"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Get in touch
            </h4>
            <ul className="space-y-2.5 text-[14px]">
              {CONTACT_LINKS.map((l) => (
                <FooterLink key={l.label} href={l.href}>{l.label}</FooterLink>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px]"
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
