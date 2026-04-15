import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchProfile,
  updateProfile,
  fetchCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  fetchScrapeStatus,
  triggerScrape,
  fetchLLMSettings,
  updateLLMSettings,
  testLLMSettings,
} from '../lib/api'
import type { Profile, Company } from '../lib/types'

// ─── Tag Input ───────────────────────────────────────────────────────────────

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')

  const addTag = (raw: string) => {
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !value.includes(t))
    if (tags.length) onChange([...value, ...tags])
    setInput('')
  }

  return (
    <div
      style={{
        background: '#0f1117',
        border: '1px solid #2e3140',
        borderRadius: 6,
        padding: '6px 8px',
        minHeight: 36,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        alignItems: 'center',
      }}
    >
      {value.map((tag) => (
        <span
          key={tag}
          style={{
            background: 'rgba(59,130,246,0.15)',
            color: '#60a5fa',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {tag}
          <button
            onClick={() => onChange(value.filter((v) => v !== tag))}
            style={{
              background: 'none',
              border: 'none',
              color: '#60a5fa',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
            }}
          >
            &times;
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        placeholder={value.length === 0 ? (placeholder || 'Type and press Enter or comma...') : ''}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            if (input.trim()) addTag(input)
          } else if (e.key === 'Backspace' && !input && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => {
          if (input.trim()) addTag(input)
        }}
        style={{
          background: 'none',
          border: 'none',
          color: '#e4e4e7',
          fontSize: 12,
          outline: 'none',
          minWidth: 120,
          flex: 1,
        }}
      />
    </div>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const queryClient = useQueryClient()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const [form, setForm] = useState<Partial<Profile>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        resume_text: profile.resume_text || '',
        target_roles: profile.target_roles || [],
        target_locations: profile.target_locations || [],
        remote_only: profile.remote_only || false,
        min_seniority: profile.min_seniority || '',
        salary_min: profile.salary_min ?? null,
        salary_max: profile.salary_max ?? null,
        must_have_skills: profile.must_have_skills || [],
        nice_to_have_skills: profile.nice_to_have_skills || [],
        blacklisted_companies: profile.blacklisted_companies || [],
        blacklisted_keywords: profile.blacklisted_keywords || [],
        priority_categories: profile.priority_categories || [],
      })
    }
  }, [profile])

  const updateMut = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const PRIORITY_CATEGORIES = [
    'tech', 'finance', 'healthcare', 'consulting', 'media', 'retail', 'education', 'government', 'other',
  ]

  const SENIORITY_OPTIONS = ['', 'intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'director', 'vp', 'c-level']

  if (isLoading) return <div style={{ color: '#52525b', padding: 24 }}>Loading profile...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title="Resume">
        <textarea
          value={form.resume_text || ''}
          onChange={(e) => setForm((f) => ({ ...f, resume_text: e.target.value }))}
          placeholder="Paste your resume here (plain text or markdown)..."
          rows={12}
          style={{
            ...textareaStyle,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        />
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Section title="Target Roles">
          <TagInput
            value={form.target_roles || []}
            onChange={(v) => setForm((f) => ({ ...f, target_roles: v }))}
            placeholder="e.g. Product Manager, Engineering Manager..."
          />
        </Section>

        <Section title="Target Locations">
          <TagInput
            value={form.target_locations || []}
            onChange={(v) => setForm((f) => ({ ...f, target_locations: v }))}
            placeholder="e.g. San Francisco, Remote..."
          />
        </Section>

        <Section title="Must-Have Skills">
          <TagInput
            value={form.must_have_skills || []}
            onChange={(v) => setForm((f) => ({ ...f, must_have_skills: v }))}
            placeholder="e.g. Python, SQL..."
          />
        </Section>

        <Section title="Nice-to-Have Skills">
          <TagInput
            value={form.nice_to_have_skills || []}
            onChange={(v) => setForm((f) => ({ ...f, nice_to_have_skills: v }))}
            placeholder="e.g. Kubernetes, Go..."
          />
        </Section>

        <Section title="Blacklisted Companies">
          <TagInput
            value={form.blacklisted_companies || []}
            onChange={(v) => setForm((f) => ({ ...f, blacklisted_companies: v }))}
            placeholder="Companies to hide..."
          />
        </Section>

        <Section title="Blacklisted Keywords">
          <TagInput
            value={form.blacklisted_keywords || []}
            onChange={(v) => setForm((f) => ({ ...f, blacklisted_keywords: v }))}
            placeholder="Job title keywords to exclude..."
          />
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
        <Section title="Min Seniority">
          <select
            value={form.min_seniority || ''}
            onChange={(e) => setForm((f) => ({ ...f, min_seniority: e.target.value || null }))}
            style={selectStyle}
          >
            {SENIORITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s || 'Any'}
              </option>
            ))}
          </select>
        </Section>

        <Section title="Salary Min">
          <input
            type="number"
            placeholder="e.g. 120000"
            value={form.salary_min ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, salary_min: e.target.value ? Number(e.target.value) : null }))}
            style={inputStyle}
          />
        </Section>

        <Section title="Salary Max">
          <input
            type="number"
            placeholder="e.g. 250000"
            value={form.salary_max ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, salary_max: e.target.value ? Number(e.target.value) : null }))}
            style={inputStyle}
          />
        </Section>

        <Section title="Remote Only">
          <div
            onClick={() => setForm((f) => ({ ...f, remote_only: !f.remote_only }))}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: form.remote_only ? '#3b82f6' : '#2e3140',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: 3,
                left: form.remote_only ? 23 : 3,
                transition: 'left 0.2s',
              }}
            />
          </div>
        </Section>
      </div>

      <Section title="Priority Categories">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {PRIORITY_CATEGORIES.map((cat) => {
            const selected = (form.priority_categories || []).includes(cat)
            return (
              <label
                key={cat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: selected ? '#e4e4e7' : '#71717a',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const cats = form.priority_categories || []
                    setForm((f) => ({
                      ...f,
                      priority_categories: selected
                        ? cats.filter((c) => c !== cat)
                        : [...cats, cat],
                    }))
                  }}
                  style={{ accentColor: '#3b82f6' }}
                />
                {cat}
              </label>
            )
          })}
        </div>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => updateMut.mutate(form)}
          disabled={updateMut.isPending}
          style={primaryBtnStyle}
        >
          {updateMut.isPending ? 'Saving...' : 'Save Profile'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#22c55e' }}>Saved successfully</span>}
        {updateMut.isError && <span style={{ fontSize: 12, color: '#ef4444' }}>Save failed</span>}
      </div>
    </div>
  )
}

// ─── Company Manager Tab ──────────────────────────────────────────────────────

interface CompanyFormData {
  name: string
  ats: string
  slug: string
  category: string
  careers_url: string
  workday_url: string
  enabled: boolean
}

const BLANK_COMPANY: CompanyFormData = {
  name: '',
  ats: 'greenhouse',
  slug: '',
  category: 'tech',
  careers_url: '',
  workday_url: '',
  enabled: true,
}

const ATS_OPTIONS = ['greenhouse', 'lever', 'workday', 'icims', 'taleo', 'bamboohr', 'smartrecruiters', 'ashby', 'other']
const CATEGORY_OPTIONS = ['tech', 'finance', 'healthcare', 'consulting', 'media', 'retail', 'education', 'government', 'other']

function CompanyTab() {
  const queryClient = useQueryClient()
  const [filterCat, setFilterCat] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<CompanyFormData>(BLANK_COMPANY)
  const [addForm, setAddForm] = useState<CompanyFormData>(BLANK_COMPANY)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies', filterCat],
    queryFn: () => fetchCompanies(filterCat ? { category: filterCat } : undefined),
  })

  const createMut = useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setShowAdd(false)
      setAddForm(BLANK_COMPANY)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Company> }) => updateCompany(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setEditingId(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setDeleteConfirm(null)
    },
  })

  const toggleEnabled = (company: Company) => {
    updateMut.mutate({ id: company.id, data: { enabled: !company.enabled } })
  }

  const startEdit = (company: Company) => {
    setEditingId(company.id)
    setEditForm({
      name: company.name,
      ats: company.ats,
      slug: company.slug,
      category: company.category,
      careers_url: company.careers_url || '',
      workday_url: company.workday_url || '',
      enabled: company.enabled,
    })
  }

  if (isLoading) return <div style={{ color: '#52525b', padding: 24 }}>Loading companies...</div>

  const list = companies || []

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          style={{ ...selectStyle, minWidth: 140 }}
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <span style={{ fontSize: 12, color: '#52525b', marginLeft: 4 }}>{list.length} companies</span>

        <button
          onClick={() => setShowAdd((v) => !v)}
          style={{ ...primaryBtnStyle, marginLeft: 'auto' }}
        >
          {showAdd ? 'Cancel' : '+ Add Company'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div
          style={{
            background: '#1a1d27',
            border: '1px solid #2e3140',
            borderRadius: 8,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7', marginBottom: 12 }}>
            Add New Company
          </div>
          <CompanyFormFields form={addForm} setForm={setAddForm} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => createMut.mutate(addForm)}
              disabled={createMut.isPending || !addForm.name}
              style={primaryBtnStyle}
            >
              {createMut.isPending ? 'Creating...' : 'Create'}
            </button>
            {createMut.isError && <span style={{ fontSize: 12, color: '#ef4444' }}>Failed to create</span>}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ border: '1px solid #2e3140', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#111318' }}>
              {['Company', 'ATS', 'Category', 'Slug', 'Enabled', 'Actions'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: 11,
                    color: '#52525b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                    borderBottom: '1px solid #2e3140',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: '#52525b' }}>
                  No companies found
                </td>
              </tr>
            )}
            {list.map((company) => (
              <>
                <tr
                  key={company.id}
                  style={{ borderBottom: '1px solid #1e2030' }}
                >
                  <td style={{ padding: '8px 12px', color: '#e4e4e7', fontWeight: 500 }}>{company.name}</td>
                  <td style={{ padding: '8px 12px', color: '#a1a1aa' }}>{company.ats}</td>
                  <td style={{ padding: '8px 12px', color: '#a1a1aa' }}>{company.category}</td>
                  <td style={{ padding: '8px 12px', color: '#71717a', fontFamily: 'monospace', fontSize: 11 }}>{company.slug}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div
                      onClick={() => toggleEnabled(company)}
                      style={{
                        width: 32,
                        height: 18,
                        borderRadius: 9,
                        background: company.enabled ? '#3b82f6' : '#2e3140',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: '#fff',
                          position: 'absolute',
                          top: 3,
                          left: company.enabled ? 17 : 3,
                          transition: 'left 0.2s',
                        }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => editingId === company.id ? setEditingId(null) : startEdit(company)}
                        style={ghostBtnStyle}
                      >
                        {editingId === company.id ? 'Cancel' : 'Edit'}
                      </button>
                      {deleteConfirm === company.id ? (
                        <>
                          <button
                            onClick={() => deleteMut.mutate(company.id)}
                            style={{ ...ghostBtnStyle, color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                          >
                            Confirm
                          </button>
                          <button onClick={() => setDeleteConfirm(null)} style={ghostBtnStyle}>
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(company.id)}
                          style={{ ...ghostBtnStyle, color: '#71717a' }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {editingId === company.id && (
                  <tr key={`edit-${company.id}`} style={{ borderBottom: '1px solid #1e2030' }}>
                    <td colSpan={6} style={{ padding: '12px 16px', background: '#111318' }}>
                      <CompanyFormFields form={editForm} setForm={setEditForm} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => updateMut.mutate({ id: company.id, data: editForm })}
                          disabled={updateMut.isPending}
                          style={primaryBtnStyle}
                        >
                          {updateMut.isPending ? 'Saving...' : 'Save'}
                        </button>
                        {updateMut.isError && <span style={{ fontSize: 12, color: '#ef4444' }}>Save failed</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CompanyFormFields({
  form,
  setForm,
}: {
  form: CompanyFormData
  setForm: React.Dispatch<React.SetStateAction<CompanyFormData>>
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      <FieldWrap label="Company Name *">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          style={inputStyle}
          placeholder="Acme Corp"
        />
      </FieldWrap>
      <FieldWrap label="ATS Type">
        <select value={form.ats} onChange={(e) => setForm((f) => ({ ...f, ats: e.target.value }))} style={selectStyle}>
          {ATS_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </FieldWrap>
      <FieldWrap label="Category">
        <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={selectStyle}>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FieldWrap>
      <FieldWrap label="Slug">
        <input
          type="text"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          style={inputStyle}
          placeholder="acme-corp"
        />
      </FieldWrap>
      <FieldWrap label="Careers URL">
        <input
          type="url"
          value={form.careers_url}
          onChange={(e) => setForm((f) => ({ ...f, careers_url: e.target.value }))}
          style={inputStyle}
          placeholder="https://..."
        />
      </FieldWrap>
      <FieldWrap label="Workday URL">
        <input
          type="url"
          value={form.workday_url}
          onChange={(e) => setForm((f) => ({ ...f, workday_url: e.target.value }))}
          style={inputStyle}
          placeholder="https://..."
        />
      </FieldWrap>
    </div>
  )
}

// ─── Scrape Status Tab ────────────────────────────────────────────────────────

function ScrapeTab() {
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['scrape-status'],
    queryFn: fetchScrapeStatus,
    refetchInterval: 30_000,
  })

  const triggerMut = useMutation({
    mutationFn: triggerScrape,
    onSuccess: () => {
      setTimeout(() => refetch(), 3000)
    },
  })

  function formatDatetime(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => triggerMut.mutate()}
          disabled={triggerMut.isPending}
          style={primaryBtnStyle}
        >
          {triggerMut.isPending ? 'Triggering...' : 'Run Scrape Now'}
        </button>
        {triggerMut.isSuccess && <span style={{ fontSize: 12, color: '#22c55e' }}>Scrape triggered — check back in a minute</span>}
        {triggerMut.isError && <span style={{ fontSize: 12, color: '#ef4444' }}>Failed to trigger</span>}
      </div>

      {isLoading && <div style={{ color: '#52525b' }}>Loading scrape status...</div>}

      {!isLoading && !status && (
        <div style={{ color: '#52525b', padding: 24, textAlign: 'center', border: '1px dashed #2e3140', borderRadius: 8 }}>
          No scrape runs recorded yet
        </div>
      )}

      {status && (
        <div style={{ background: '#1a1d27', border: '1px solid #2e3140', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Last Scrape Run
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <StatRow label="Started" value={formatDatetime(status.started_at)} />
            <StatRow label="Completed" value={formatDatetime(status.completed_at)} />
            <StatRow label="Total Fetched" value={status.total_fetched} highlight />
            <StatRow label="New Jobs" value={status.new_jobs} highlight color="#22c55e" />
            <StatRow label="Updated" value={status.updated_jobs} />
            <StatRow label="Expired" value={status.expired_jobs} color="#f87171" />
            <StatRow label="LLM Scored" value={status.llm_scored} color="#818cf8" />
          </div>

          {status.errors && status.errors.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#52525b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Errors ({status.errors.length})
              </div>
              <div
                style={{
                  background: '#0f1117',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 6,
                  padding: 10,
                  maxHeight: 160,
                  overflow: 'auto',
                }}
              >
                {status.errors.map((err, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#f87171', marginBottom: 4, fontFamily: 'monospace' }}>
                    {err}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatRow({
  label,
  value,
  highlight,
  color,
}: {
  label: string
  value: string | number
  highlight?: boolean
  color?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#71717a' }}>{label}</span>
      <span
        style={{
          fontSize: highlight ? 16 : 13,
          fontWeight: highlight ? 700 : 500,
          color: color || (highlight ? '#e4e4e7' : '#a1a1aa'),
          fontFamily: 'monospace',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── LLM Settings Tab ─────────────────────────────────────────────────────────

const LLM_PROVIDERS: { id: string; name: string; default_url: string; default_model: string; requires_key: boolean }[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    default_url: 'https://api.openai.com/v1/chat/completions',
    default_model: 'gpt-4o-mini',
    requires_key: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    default_url: 'https://api.anthropic.com/v1/messages',
    default_model: 'claude-sonnet-4-20250514',
    requires_key: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    default_url: 'http://localhost:11434/v1/chat/completions',
    default_model: 'llama3.1:8b',
    requires_key: false,
  },
  {
    id: 'openai_compatible',
    name: 'OpenAI-Compatible',
    default_url: 'http://localhost:8080/v1/chat/completions',
    default_model: 'default',
    requires_key: false,
  },
  {
    id: 'keyword_only',
    name: 'Keyword Only',
    default_url: '',
    default_model: '',
    requires_key: false,
  },
]

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  openai: 'Use GPT-4o, GPT-4o-mini, or any OpenAI model',
  anthropic: 'Use Claude Sonnet, Haiku, or any Anthropic model',
  ollama: 'Free, runs locally. No API key needed.',
  openai_compatible: 'llama.cpp, vLLM, LiteLLM, Groq, Together AI, etc.',
  keyword_only: 'No LLM. Uses keyword matching only (free, no setup needed)',
}

const PROVIDER_COST_NOTES: Record<string, string> = {
  openai: '~$0.01–0.03 per job scored with gpt-4o-mini',
  anthropic: '~$0.01–0.03 per job scored with Claude Haiku',
  ollama: 'Free — runs on your hardware',
  openai_compatible: 'Depends on your endpoint',
  keyword_only: 'Free — no API calls',
}

function LLMTab() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['llm-settings'],
    queryFn: fetchLLMSettings,
  })

  const [provider, setProvider] = useState('keyword_only')
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.1)
  const [maxTokens, setMaxTokens] = useState(500)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<{
    health: { healthy: boolean; provider: string; message: string }
    test_score: { score: number; reasoning: string }
    provider: string
  } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider || 'keyword_only')
      setApiKey(settings.api_key || '')
      setApiUrl(settings.api_url || '')
      setModel(settings.model || '')
      setTemperature(settings.temperature ?? 0.1)
      setMaxTokens(settings.max_tokens ?? 500)
    }
  }, [settings])

  // When provider changes, pre-fill defaults only if the url/model are empty or were the old provider's defaults
  const handleProviderChange = (newId: string) => {
    const prev = LLM_PROVIDERS.find((p) => p.id === provider)
    const next = LLM_PROVIDERS.find((p) => p.id === newId)
    if (!next) return
    setProvider(newId)
    // Reset to new defaults if fields are blank or were the previous provider's defaults
    if (!apiUrl || apiUrl === (prev?.default_url ?? '')) setApiUrl(next.default_url)
    if (!model || model === (prev?.default_model ?? '')) setModel(next.default_model)
    if (!next.requires_key) setApiKey('')
  }

  const saveMut = useMutation({
    mutationFn: () =>
      updateLLMSettings({
        provider,
        api_key: apiKey || null,
        api_url: apiUrl || null,
        model: model || null,
        temperature,
        max_tokens: maxTokens,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const testMut = useMutation({
    mutationFn: testLLMSettings,
    onSuccess: (data) => {
      setTestResult(data)
      setTestError(null)
    },
    onError: (err: Error) => {
      setTestResult(null)
      setTestError(err.message)
    },
  })

  const selectedProvider = LLM_PROVIDERS.find((p) => p.id === provider)
  const showKeyField = selectedProvider?.requires_key ?? false
  const showUrlField = provider !== 'keyword_only'
  const showModelField = provider !== 'keyword_only'

  if (isLoading) return <div style={{ color: '#52525b', padding: 24 }}>Loading LLM settings...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      {/* Info box */}
      <div
        style={{
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 13,
          color: '#93c5fd',
          lineHeight: 1.6,
        }}
      >
        Configure your LLM provider for AI-powered job scoring. The LLM reads each job description
        against your resume and scores relevance 0–100. Without an LLM, keyword matching is used as
        a free fallback.
      </div>

      {/* Provider selection */}
      <Section title="Provider">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {LLM_PROVIDERS.map((p) => {
            const selected = provider === p.id
            return (
              <label
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${selected ? '#3b82f6' : '#2e3140'}`,
                  background: selected ? 'rgba(59,130,246,0.07)' : '#1a1d27',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.id}
                  checked={selected}
                  onChange={() => handleProviderChange(p.id)}
                  style={{ accentColor: '#3b82f6', marginTop: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: selected ? '#e4e4e7' : '#a1a1aa' }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 11, color: selected ? '#60a5fa' : '#52525b', whiteSpace: 'nowrap' }}>
                      {PROVIDER_COST_NOTES[p.id]}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>
                    {PROVIDER_DESCRIPTIONS[p.id]}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </Section>

      {/* Config fields */}
      {(showKeyField || showUrlField || showModelField) && (
        <Section title="Configuration">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
            {showKeyField && (
              <FieldWrap label="API Key">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    style={{ ...inputStyle, paddingRight: 72 }}
                  />
                  <button
                    onClick={() => setShowKey((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#71717a',
                      fontSize: 11,
                      cursor: 'pointer',
                      padding: '2px 6px',
                    }}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </FieldWrap>
            )}

            {showUrlField && (
              <FieldWrap label="API URL">
                <input
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder={selectedProvider?.default_url || 'https://...'}
                  style={inputStyle}
                />
              </FieldWrap>
            )}

            {showModelField && (
              <FieldWrap label="Model">
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={selectedProvider?.default_model || 'model name'}
                  style={inputStyle}
                />
              </FieldWrap>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldWrap label={`Temperature: ${temperature.toFixed(1)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#3b82f6', marginTop: 6 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#52525b', marginTop: 2 }}>
                  <span>0.0 (focused)</span>
                  <span>1.0 (creative)</span>
                </div>
              </FieldWrap>

              <FieldWrap label="Max Tokens">
                <input
                  type="number"
                  min={100}
                  max={4000}
                  step={100}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  style={inputStyle}
                />
              </FieldWrap>
            </div>
          </div>
        </Section>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          style={primaryBtnStyle}
        >
          {saveMut.isPending ? 'Saving...' : 'Save Settings'}
        </button>
        <button
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending}
          style={{
            ...ghostBtnStyle,
            color: '#a1a1aa',
            padding: '7px 16px',
            fontSize: 13,
          }}
        >
          {testMut.isPending ? 'Testing...' : 'Test Connection'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#22c55e' }}>Saved successfully</span>}
        {saveMut.isError && <span style={{ fontSize: 12, color: '#ef4444' }}>Save failed</span>}
      </div>

      {/* Test result */}
      {testResult && (
        <div
          style={{
            background: '#1a1d27',
            border: `1px solid ${testResult.health.healthy ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: testResult.health.healthy ? '#22c55e' : '#ef4444',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: testResult.health.healthy ? '#22c55e' : '#ef4444' }}>
              {testResult.health.healthy ? 'Connection OK' : 'Connection Failed'}
            </span>
            <span style={{ fontSize: 12, color: '#71717a', marginLeft: 4 }}>
              Provider: {testResult.provider}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 6 }}>
            {testResult.health.message}
          </div>
          {testResult.test_score && (
            <div
              style={{
                background: '#0f1117',
                border: '1px solid #2e3140',
                borderRadius: 6,
                padding: '10px 12px',
                marginTop: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Test Score
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#e4e4e7', fontFamily: 'monospace' }}>
                  {testResult.test_score.score}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.5 }}>
                {testResult.test_score.reasoning}
              </div>
            </div>
          )}
        </div>
      )}

      {testError && (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: '#f87171',
          }}
        >
          Test failed: {testError}
        </div>
      )}
    </div>
  )
}

// ─── Admin ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'profile', label: 'Profile & Resume' },
  { id: 'companies', label: 'Company Manager' },
  { id: 'scrape', label: 'Scrape Status' },
  { id: 'llm', label: 'LLM Settings' },
]

export function Admin() {
  const [activeTab, setActiveTab] = useState('profile')

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#e4e4e7', letterSpacing: '-0.02em' }}>
          Admin
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#71717a' }}>
          Profile settings, company management, and scrape controls
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #2e3140', paddingBottom: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? '#3b82f6' : 'transparent'}`,
              color: activeTab === tab.id ? '#3b82f6' : '#71717a',
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 16px',
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'companies' && <CompanyTab />}
      {activeTab === 'scrape' && <ScrapeTab />}
      {activeTab === 'llm' && <LLMTab />}
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          color: '#52525b',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {title}
      </label>
      {children}
    </div>
  )
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0f1117',
  border: '1px solid #2e3140',
  borderRadius: 6,
  color: '#e4e4e7',
  fontSize: 13,
  padding: '7px 10px',
  outline: 'none',
  width: '100%',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  resize: 'vertical',
  lineHeight: 1.6,
}

const primaryBtnStyle: React.CSSProperties = {
  background: '#3b82f6',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  padding: '8px 16px',
  cursor: 'pointer',
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2e3140',
  borderRadius: 5,
  color: '#a1a1aa',
  fontSize: 12,
  padding: '4px 10px',
  cursor: 'pointer',
}
