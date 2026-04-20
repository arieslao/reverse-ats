import { useState, useEffect, useMemo, useRef } from 'react'
import type { FeedLocations } from '../lib/api'

interface FilterState {
  search: string
  category: string
  min_score: number
  remote_only: boolean
  since_days: number
  sort_by: string
  exclude_companies: string
  locations: string[]
}

interface IndustryOption {
  value: string
  label: string
}

interface FilterBarProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  industries?: IndustryOption[]
  locationsData?: FeedLocations
  // Live result count from the parent's job query — shown inside the
  // Locations popover so users can see filter impact without closing it.
  matchingCount?: number | null
  isLoading?: boolean
}

const DEFAULT_INDUSTRY_OPTIONS: IndustryOption[] = [
  { value: '', label: 'All Industries' },
]

const SORT_OPTIONS = [
  { value: 'score', label: 'Best Match' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'company', label: 'Company A-Z' },
  { value: 'title', label: 'Title A-Z' },
]

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border-muted)',
  borderRadius: 6,
  color: 'var(--color-text-primary)',
  fontSize: 13,
  padding: '6px 10px',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-secondary)',
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

export function FilterBar({ filters, onChange, industries, locationsData, matchingCount, isLoading }: FilterBarProps) {
  const [local, setLocal] = useState(filters)

  useEffect(() => {
    setLocal(filters)
  }, [filters])

  const update = (patch: Partial<FilterState>) => {
    const next = { ...local, ...patch }
    setLocal(next)
    onChange(next)
  }

  const industryOpts: IndustryOption[] =
    industries && industries.length > 0
      ? [{ value: '', label: 'All Industries' }, ...industries]
      : DEFAULT_INDUSTRY_OPTIONS

  const hasActiveFilters =
    local.search ||
    local.category ||
    local.min_score > 0 ||
    local.remote_only ||
    local.since_days > 0 ||
    local.exclude_companies ||
    local.locations.length > 0 ||
    (local.sort_by && local.sort_by !== 'score')

  return (
    <div
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-muted)',
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

        {/* Industry */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>Industry</label>
          <select
            value={local.category}
            onChange={(e) => update({ category: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {industryOpts.map((c) => (
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
            style={{ width: 120, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
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
                background: local.remote_only ? 'var(--color-accent)' : 'var(--color-border-muted)',
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
                  background: 'var(--color-bg-elevated)',
                  position: 'absolute',
                  top: 3,
                  left: local.remote_only ? 19 : 3,
                  transition: 'left 0.2s',
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: 'normal' }}>
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
                locations: [],
              })
            }
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border-muted)',
              borderRadius: 6,
              color: 'var(--color-text-secondary)',
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

      {/* Row 3: Locations multi-select + chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <LocationsPicker
          selected={local.locations}
          onChange={(next) => update({ locations: next })}
          data={locationsData}
          matchingCount={matchingCount}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}

// ─── Locations Multi-Select ──────────────────────────────────────────────────
//
// A dropdown that opens to a panel with a search box and three grouped
// checkbox sections (Countries, States, Cities) plus a Remote toggle.
// Selected items render below as removable chips. Multi-selecting any
// combination ORs the matches in the backend.

function LocationsPicker({
  selected,
  onChange,
  data,
  matchingCount,
  isLoading,
}: {
  selected: string[]
  onChange: (next: string[]) => void
  data?: FeedLocations
  matchingCount?: number | null
  isLoading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click / escape
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const selectedLower = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected])

  const toggle = (name: string) => {
    if (selectedLower.has(name.toLowerCase())) {
      onChange(selected.filter((s) => s.toLowerCase() !== name.toLowerCase()))
    } else {
      onChange([...selected, name])
    }
  }

  const remove = (name: string) => {
    onChange(selected.filter((s) => s.toLowerCase() !== name.toLowerCase()))
  }

  const matchesQuery = (name: string) =>
    !query || name.toLowerCase().includes(query.toLowerCase())

  const filtered = useMemo(() => {
    if (!data) return { countries: [], states: [], cities: [], remote: { count: 0 } }
    return {
      countries: data.countries.filter((t) => matchesQuery(t.name)),
      states: data.states.filter((t) => matchesQuery(t.name)),
      cities: data.cities.filter((t) => matchesQuery(t.name)),
      remote: data.remote,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query])

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <label style={labelStyle}>Locations</label>

      {/* Trigger / chip box */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          ...inputStyle,
          minHeight: 32,
          padding: '4px 8px',
          cursor: 'pointer',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          alignItems: 'center',
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            Click to filter by city, state, or country…
          </span>
        ) : (
          <>
            {selected.map((s) => (
              <span
                key={s}
                onClick={(e) => {
                  e.stopPropagation()
                  remove(s)
                }}
                style={{
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.4)',
                  borderRadius: 4,
                  color: '#bfdbfe',
                  fontSize: 12,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
                title="Click to remove"
              >
                {s} ×
              </span>
            ))}
          </>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
          {open ? '▴' : '▾'}
        </span>
      </div>

      {/* Popover */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-muted)',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            zIndex: 50,
            padding: 12,
            maxHeight: 420,
            overflow: 'auto',
          }}
        >
          <input
            type="text"
            placeholder="Filter (e.g. San Francisco, California, US)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              ...inputStyle,
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: 10,
            }}
          />

          {!data && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: 8, textAlign: 'center' }}>
              Loading locations…
            </div>
          )}

          {data && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <LocationGroup
                title="Countries"
                items={filtered.countries}
                selectedLower={selectedLower}
                onToggle={toggle}
                accent="var(--color-success)"
              />
              <LocationGroup
                title="States"
                items={filtered.states}
                selectedLower={selectedLower}
                onToggle={toggle}
                accent="var(--color-accent)"
              />
              <LocationGroup
                title="Cities"
                items={filtered.cities}
                selectedLower={selectedLower}
                onToggle={toggle}
                accent="var(--color-warning)"
              />
            </div>
          )}

          {data && (
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--color-border-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                flexWrap: 'wrap',
              }}
            >
              <div>
                {selected.length === 0 ? (
                  <span>Pick locations to narrow your feed.</span>
                ) : (
                  <span>
                    {selected.length} selected — narrowing other columns to match.
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Live result count from the parent's job query */}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      matchingCount === 0
                        ? 'var(--color-danger)'
                        : matchingCount && matchingCount > 0
                          ? 'var(--color-success)'
                          : 'var(--color-text-secondary)',
                  }}
                >
                  {isLoading
                    ? 'Loading…'
                    : matchingCount == null
                      ? '—'
                      : `${matchingCount.toLocaleString()} job${matchingCount === 1 ? '' : 's'} match`}
                </span>
                {selected.length > 0 && (
                  <button
                    onClick={() => onChange([])}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-border-muted)',
                      borderRadius: 4,
                      color: 'var(--color-text-secondary)',
                      fontSize: 11,
                      padding: '3px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'var(--color-accent)',
                    border: '1px solid var(--color-accent)',
                    borderRadius: 4,
                    color: 'var(--color-bg-elevated)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 12px',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LocationGroup({
  title,
  items,
  selectedLower,
  onToggle,
  accent,
}: {
  title: string
  items: { name: string; count: number }[]
  selectedLower: Set<string>
  onToggle: (name: string) => void
  accent: string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 6,
        }}
      >
        {title} {items.length > 0 && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({items.length})</span>}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '6px 0' }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflow: 'auto' }}>
          {items.map((t) => {
            const isSelected = selectedLower.has(t.name.toLowerCase())
            return (
              <label
                key={t.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  padding: '3px 4px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(59,130,246,0.08)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(t.name)}
                  style={{ accentColor: accent, cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>{t.count}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
