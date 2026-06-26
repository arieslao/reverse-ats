import { useState } from 'react'
import { emailTargetResume, downloadTargetResume } from '../lib/api'

// Generate a résumé tailored to any free-text target role (not a specific job posting),
// emailed or downloaded. Tailors from the master résumé on file.
export function TargetRoleResume() {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState('')
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState<'' | 'email' | 'download'>('')
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async (kind: 'email' | 'download') => {
    if (!role.trim()) {
      setErr('Enter a target role first.')
      return
    }
    setBusy(kind)
    setOk(null)
    setErr(null)
    try {
      if (kind === 'email') {
        const r = await emailTargetResume(role.trim(), focus.trim())
        setOk(`Emailed to ${r.to}`)
      } else {
        await downloadTargetResume(role.trim(), focus.trim())
        setOk('Download started — check your browser’s downloads.')
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
    border: '1px solid var(--color-border-muted)', background: 'var(--color-bg-elevated)',
    color: 'var(--color-text-primary)', boxSizing: 'border-box',
  }

  return (
    <div style={{
      border: '1px solid var(--color-border-muted)', borderRadius: 8, marginBottom: 12,
      background: 'var(--color-bg-subtle)',
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
          padding: '12px 14px', cursor: 'pointer', color: 'var(--color-text-primary)',
          fontSize: 14, fontWeight: 600, display: 'flex', justifyContent: 'space-between',
        }}
      >
        <span>📝 Generate a résumé for any role</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Tailors your master résumé to any target role — no job posting needed.
          </div>
          <input
            style={input}
            placeholder="Target role — e.g. Healthcare Program Manager"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run('email') }}
          />
          <textarea
            style={{ ...input, minHeight: 56, resize: 'vertical' }}
            placeholder="Optional: focus keywords or paste a job description to sharpen the tailoring"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              disabled={busy !== ''}
              onClick={() => run('email')}
              style={{
                background: 'rgba(34, 197, 94, 0.14)', border: '1px solid rgba(34, 197, 94, 0.35)',
                color: 'var(--color-success)', borderRadius: 6, padding: '7px 14px',
                fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >
              {busy === 'email' ? 'Generating…' : '📧 Email résumé'}
            </button>
            <button
              disabled={busy !== ''}
              onClick={() => run('download')}
              style={{
                background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.35)',
                color: 'var(--color-accent)', borderRadius: 6, padding: '7px 14px',
                fontSize: 13, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >
              {busy === 'download' ? 'Generating…' : '📄 Download .docx'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>~15–30s</span>
          </div>
          {ok && <div style={{ fontSize: 13, color: 'var(--color-success)' }}>✅ {ok}</div>}
          {err && <div style={{ fontSize: 13, color: 'var(--color-danger)' }}>{err}</div>}
        </div>
      )}
    </div>
  )
}
