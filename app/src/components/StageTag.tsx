import type { PipelineStage } from '../lib/types'

const STAGE_CONFIG: Record<PipelineStage, { label: string; bg: string; color: string }> = {
  discovered: { label: 'Discovered', bg: 'rgba(161, 161, 170, 0.1)', color: 'var(--color-text-tertiary)' },
  saved: { label: 'Saved', bg: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-accent)' },
  applied: { label: 'Applied', bg: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' },
  phone_screen: { label: 'Phone Screen', bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' },
  technical: { label: 'Technical', bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)' },
  final: { label: 'Final Round', bg: 'rgba(249, 115, 22, 0.15)', color: '#fb923c' },
  offer: { label: 'Offer', bg: 'rgba(34, 197, 94, 0.15)', color: 'var(--color-success)' },
  rejected: { label: 'Rejected', bg: 'rgba(239, 68, 68, 0.12)', color: 'var(--color-danger)' },
  withdrawn: { label: 'Withdrawn', bg: 'rgba(113, 113, 122, 0.1)', color: 'var(--color-text-muted)' },
}

interface StageTagProps {
  stage: PipelineStage
  size?: 'sm' | 'md'
}

export function StageTag({ stage, size = 'md' }: StageTagProps) {
  const config = STAGE_CONFIG[stage] || {
    label: stage,
    bg: 'rgba(161, 161, 170, 0.1)',
    color: 'var(--color-text-tertiary)',
  }

  return (
    <span
      style={{
        background: config.bg,
        color: config.color,
        borderRadius: 4,
        padding: size === 'sm' ? '1px 6px' : '2px 10px',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}
    >
      {config.label}
    </span>
  )
}

export { STAGE_CONFIG }
