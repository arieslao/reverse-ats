interface ScoreBadgeProps {
  score: number | null
  label?: string
  size?: 'sm' | 'md'
}

export function ScoreBadge({ score, label, size = 'md' }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span
        style={{
          background: '#2e3140',
          color: '#a1a1aa',
          borderRadius: 4,
          padding: size === 'sm' ? '1px 6px' : '2px 8px',
          fontSize: size === 'sm' ? 11 : 12,
          fontWeight: 600,
          fontFamily: 'monospace',
          letterSpacing: '0.02em',
        }}
      >
        {label || '—'}
      </span>
    )
  }

  let bg: string
  let color: string

  if (score >= 90) {
    bg = 'rgba(245, 158, 11, 0.15)'
    color = '#f59e0b'
  } else if (score >= 70) {
    bg = 'rgba(34, 197, 94, 0.15)'
    color = '#22c55e'
  } else if (score >= 50) {
    bg = 'rgba(59, 130, 246, 0.15)'
    color = '#3b82f6'
  } else if (score >= 30) {
    bg = 'rgba(234, 179, 8, 0.12)'
    color = '#ca8a04'
  } else {
    bg = 'rgba(161, 161, 170, 0.1)'
    color = '#71717a'
  }

  return (
    <span
      style={{
        background: bg,
        color,
        borderRadius: 4,
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 700,
        fontFamily: 'monospace',
        letterSpacing: '0.02em',
      }}
    >
      {label || score}
    </span>
  )
}
