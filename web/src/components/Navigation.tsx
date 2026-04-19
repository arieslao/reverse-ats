// Quiet, editorial nav. Logo as simple wordmark in serif italic.
// Mobile: collapses to wordmark + Sponsor button.

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#transparency', label: 'Where we are' },
  { href: '#faq', label: 'FAQ' },
]

export function Navigation() {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md"
      style={{
        background: 'rgba(251, 249, 244, 0.85)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      <nav className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-4">
        {/* Wordmark — serif italic, more bookshop than startup */}
        <a href="#top" className="flex items-baseline gap-2.5 group">
          <span
            className="text-xl"
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
            className="text-base"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              letterSpacing: '-0.01em',
            }}
          >
            ats
          </span>
          <span
            className="hidden sm:inline-block text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full ml-1"
            style={{
              color: 'var(--color-warning)',
              background: 'var(--color-warning-soft)',
              fontWeight: 500,
            }}
            title="This site is under active development. See 'Where we are' for details."
          >
            in beta
          </span>
        </a>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right-side CTAs */}
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/arieslao/reverse-ats"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-block text-sm px-3.5 py-1.5 rounded-full transition-all"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          >
            GitHub
          </a>
          <a
            href="https://github.com/sponsors/arieslao"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium px-4 py-2 rounded-full transition-all"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-accent)')}
          >
            Sponsor
          </a>
        </div>
      </nav>
    </header>
  )
}
