import { useState, useEffect } from 'react'

interface FilterState {
  search: string
  category: string
  min_score: number
  remote_only: boolean
  since_days: number
  sort_by: string
  exclude_companies: string
}

interface FilterBarProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  categories?: string[]
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'big_tech', label: 'Big Tech' },
  { value: 'ai_tech', label: 'AI & Tech' },
  { value: 'healthtech', label: 'HealthTech' },
  { value: 'quant', label: 'Quant / Trading' },
]

const SORT_OPTIONS = [
  { value: 'score', label: 'Best Match' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'company', label: 'Company A-Z' },
  { value: 'title', label: 'Title A-Z' },
]

const inputStyle: React.CSSProperties = {
  background: '#1a1d27',
  border: '1px solid #2e3140',
  borderRadius: 6,
  color: '#e4e4e7',
  fontSize: 13,
  padding: '6px 10px',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#a1a1aa',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 2,
  display: 'block',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-end',
  flexWrap: 'wrap',
}

export function FilterBar({ filters, onChange, categories }: FilterBarProps) {
  const [local, setLocal] = useState(filters)

  useEffect(() => {
    setLocal(filters)
  }, [filters])

  const update = (patch: Partial<FilterState>) => {
    const next = { ...local, ...patch }
    setLocal(next)
    onChange(next)
  }

  const categoryOpts = categories
    ? [{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))]
    : CATEGORY_OPTIONS

  const hasActiveFilters =
    local.search ||
    local.category ||
    local.min_score > 0 ||
    local.remote_only ||
    local.since_days > 0 ||
    local.exclude_companies ||
    (local.sort_by && local.sort_by !== 'score')

  return (
    <div
      style={{
        background: '#1a1d27',
        border: '1px solid #2e3140',
        borderRadius: 8,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Row 1: Search, Category, Sort */}
      <div style={rowStyle}>
        {/* Search */}
        <div style={{ flex: '1 1 200px', minWidth: 160 }}>
          <label style={labelStyle}>Search</label>
          <input
            type="text"
            placeholder="Company, title, keywords..."
            value={local.search}
            onChange={(e) => update({ search: e.target.value })}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Category */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>Category</label>
          <select
            value={local.category}
            onChange={(e) => update({ category: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {categoryOpts.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>Sort By</label>
          <select
            value={local.sort_by || 'score'}
            onChange={(e) => update({ sort_by: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Min Score, New Since, Remote Only, Exclude Companies, Clear */}
      <div style={{ ...rowStyle, alignItems: 'flex-end' }}>
        {/* Min Score */}
        <div style={{ flex: '0 0 auto', minWidth: 140 }}>
          <label style={labelStyle}>Min Score: {local.min_score}</label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={local.min_score}
            onChange={(e) => update({ min_score: Number(e.target.value) })}
            style={{ width: 120, accentColor: '#3b82f6', cursor: 'pointer' }}
          />
        </div>

        {/* New Since */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>New Since</label>
          <select
            value={local.since_days}
            onChange={(e) => update({ since_days: Number(e.target.value) })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value={0}>All Time</option>
            <option value={1}>Today</option>
            <option value={3}>Last 3 Days</option>
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
        </div>

        {/* Remote Only */}
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
          <label style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              onClick={() => update({ remote_only: !local.remote_only })}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: local.remote_only ? '#3b82f6' : '#2e3140',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 3,
                  left: local.remote_only ? 19 : 3,
                  transition: 'left 0.2s',
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: '#e4e4e7', textTransform: 'none', letterSpacing: 'normal' }}>
              Remote Only
            </span>
          </label>
        </div>

        {/* Exclude Companies */}
        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
          <label style={labelStyle}>Exclude Companies</label>
          <input
            type="text"
            placeholder="e.g. Databricks, Figma"
            value={local.exclude_companies}
            onChange={(e) => update({ exclude_companies: e.target.value })}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            onClick={() =>
              update({
                search: '',
                category: '',
                min_score: 0,
                remote_only: false,
                since_days: 0,
                sort_by: 'score',
                exclude_companies: '',
              })
            }
            style={{
              background: 'transparent',
              border: '1px solid #2e3140',
              borderRadius: 6,
              color: '#a1a1aa',
              fontSize: 12,
              padding: '6px 12px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
