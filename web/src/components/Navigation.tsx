// Sticky top nav. Minimal — site has 3 logical destinations max.
// Mobile-first: collapses to logo + Sponsor button on small screens.

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#transparency', label: 'Status' },
  { href: '#faq', label: 'FAQ' },
]

export function Navigation() {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md"
      style={{ background: 'rgba(10, 10, 15, 0.7)', borderBottom: '1px solid var(--color-border-subtle)' }}
    >
      <nav className="max-w-6xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <a href="#top" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-transform group-hover:scale-110"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent) 0%, #5d7eff 100%)',
              color: '#0a0a0f',
            }}
          >
            R
          </div>
          <span className="font-semibold tracking-tight">Reverse ATS</span>
          <span
            className="hidden sm:inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              color: 'var(--color-warning)',
              border: '1px solid rgba(240, 184, 122, 0.3)',
              background: 'rgba(240, 184, 122, 0.08)',
            }}
            title="This site is under active development. See the Status section for details."
          >
            Beta
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
            className="hidden sm:inline-block text-sm px-3 py-1.5 rounded-md transition-all"
            style={{
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-primary)'
              e.currentTarget.style.borderColor = 'var(--color-accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)'
              e.currentTarget.style.borderColor = 'var(--color-border-muted)'
            }}
          >
            GitHub
          </a>
          <a
            href="https://github.com/sponsors/arieslao"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium px-3.5 py-1.5 rounded-md transition-all"
            style={{
              background: 'var(--color-accent)',
              color: '#0a0a0f',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-accent)')}
          >
            ♥ Sponsor
          </a>
        </div>
      </nav>
    </header>
  )
}
