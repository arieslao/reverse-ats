import { Link } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

// Slim Apple-style top nav. Backdrop-blurred. Bold wordmark.
// Mobile: wordmark + theme toggle + Sign in + Sponsor.
// Sign up + GitHub icon stay hidden until sm: — Sign in is the more
// frequent action for returning users, and the /sign-in page already
// links out to /sign-up so we don't lose the path.

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#transparency', label: 'Roadmap' },
  { href: '#faq', label: 'FAQ' },
]

export function Navigation() {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background: 'color-mix(in srgb, var(--color-bg-base) 80%, transparent)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      <nav className="max-w-7xl mx-auto px-5 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        {/* Wordmark — bold, tight tracking, premium */}
        <a href="#top" className="flex items-center gap-2.5">
          <span
            className="text-[17px] tracking-tight"
            style={{
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.022em',
            }}
          >
            Reverse ATS
          </span>
          <span
            className="hidden sm:inline-block text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded"
            style={{
              color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border-muted)',
              fontWeight: 500,
            }}
            title="This site is under active development. See Roadmap for details."
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
              className="text-[13px] transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <a
            href="https://github.com/arieslao/reverse-ats"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-tinted)'
              e.currentTarget.style.color = 'var(--color-text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
            aria-label="GitHub repository"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.3v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
            </svg>
          </a>
          <Link
            to="/sign-in"
            className="inline-flex items-center text-[13px] px-2.5 sm:px-3 h-9 rounded-full transition-colors whitespace-nowrap"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          >
            Sign in
          </Link>
          <Link
            to="/sign-up"
            className="hidden sm:inline-flex items-center text-[13px] font-medium px-4 h-9 rounded-full transition-colors"
            style={{
              background: 'var(--color-bg-tinted)',
              color: 'var(--color-text-primary)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-border-subtle)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-tinted)')}
          >
            Sign up
          </Link>
          <a
            href="https://github.com/sponsors/arieslao"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-[13px] font-medium px-4 h-9 inline-flex items-center rounded-full transition-colors"
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
