import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { fetchProfile, updateProfile, type Profile } from '../../lib/api';

const SENIORITY_OPTIONS = ['', 'intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'director', 'vp', 'c-level'] as const;
const PRIORITY_CATEGORIES = ['tech', 'finance', 'healthcare', 'consulting', 'media', 'retail', 'education', 'government', 'other'] as const;

const EMPTY: Profile = {
  resume_text: '',
  target_roles: [],
  target_locations: [],
  remote_only: false,
  min_seniority: null,
  salary_min: null,
  salary_max: null,
  must_have_skills: [],
  nice_to_have_skills: [],
  blacklisted_companies: [],
  blacklisted_keywords: [],
  priority_categories: [],
  updated_at: '',
};

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (!cancelled) setForm({ ...p, resume_text: p.resume_text ?? '' });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await updateProfile({
        resume_text: form.resume_text || null,
        target_roles: form.target_roles,
        target_locations: form.target_locations,
        remote_only: form.remote_only,
        min_seniority: form.min_seniority || null,
        salary_min: form.salary_min,
        salary_max: form.salary_max,
        must_have_skills: form.must_have_skills,
        nice_to_have_skills: form.nice_to_have_skills,
        blacklisted_companies: form.blacklisted_companies,
        blacklisted_keywords: form.blacklisted_keywords,
        priority_categories: form.priority_categories,
      });
      setForm({ ...next, resume_text: next.resume_text ?? '' });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/app" className="text-sm font-medium tracking-tight">Reverse ATS</Link>
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
            <Link to="/app" className="hover:text-[var(--color-text-primary)]">Back to app</Link>
            <span>{user?.email}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Tell Reverse ATS what you're looking for. Used for job matching, scoring, and cover letters.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
        ) : (
          <div className="flex flex-col gap-8">
            <Field label="Resume" hint="Plain text or markdown — used as the source for AI matching.">
              <textarea
                value={form.resume_text ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, resume_text: e.target.value }))}
                rows={12}
                placeholder="Paste your resume here…"
                className="w-full px-3 py-2 text-xs font-mono rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none resize-y"
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Target Roles">
                <TagInput
                  value={form.target_roles}
                  onChange={(v) => setForm((f) => ({ ...f, target_roles: v }))}
                  placeholder="e.g. Product Manager, Engineering Manager"
                />
              </Field>
              <Field label="Target Locations">
                <TagInput
                  value={form.target_locations}
                  onChange={(v) => setForm((f) => ({ ...f, target_locations: v }))}
                  placeholder="e.g. San Francisco, Remote"
                />
              </Field>
              <Field label="Must-Have Skills">
                <TagInput
                  value={form.must_have_skills}
                  onChange={(v) => setForm((f) => ({ ...f, must_have_skills: v }))}
                  placeholder="e.g. Python, SQL"
                />
              </Field>
              <Field label="Nice-to-Have Skills">
                <TagInput
                  value={form.nice_to_have_skills}
                  onChange={(v) => setForm((f) => ({ ...f, nice_to_have_skills: v }))}
                  placeholder="e.g. Kubernetes, Go"
                />
              </Field>
              <Field label="Blacklisted Companies">
                <TagInput
                  value={form.blacklisted_companies}
                  onChange={(v) => setForm((f) => ({ ...f, blacklisted_companies: v }))}
                  placeholder="Companies to hide"
                />
              </Field>
              <Field label="Blacklisted Keywords">
                <TagInput
                  value={form.blacklisted_keywords}
                  onChange={(v) => setForm((f) => ({ ...f, blacklisted_keywords: v }))}
                  placeholder="Job title keywords to exclude"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <Field label="Min Seniority">
                <select
                  value={form.min_seniority ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, min_seniority: e.target.value || null }))}
                  className="w-full h-9 px-2 text-sm rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                >
                  {SENIORITY_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s || 'Any'}</option>
                  ))}
                </select>
              </Field>
              <Field label="Salary Min">
                <input
                  type="number"
                  value={form.salary_min ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, salary_min: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="120000"
                  className="w-full h-9 px-2 text-sm rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </Field>
              <Field label="Salary Max">
                <input
                  type="number"
                  value={form.salary_max ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, salary_max: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="250000"
                  className="w-full h-9 px-2 text-sm rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </Field>
              <Field label="Remote Only">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, remote_only: !f.remote_only }))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    form.remote_only ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-muted)]'
                  }`}
                  aria-pressed={form.remote_only}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--color-bg-elevated)] transition-all ${
                      form.remote_only ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </Field>
            </div>

            <Field label="Priority Categories">
              <div className="flex flex-wrap gap-3">
                {PRIORITY_CATEGORIES.map((cat) => {
                  const selected = form.priority_categories.includes(cat);
                  return (
                    <label
                      key={cat}
                      className={`flex items-center gap-1.5 text-sm cursor-pointer ${
                        selected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setForm((f) => ({
                            ...f,
                            priority_categories: selected
                              ? f.priority_categories.filter((c) => c !== cat)
                              : [...f.priority_categories, cat],
                          }))
                        }
                        className="accent-[var(--color-accent)]"
                      />
                      {cat}
                    </label>
                  );
                })}
              </div>
            </Field>

            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="text-sm px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg,white)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              {savedAt && Date.now() - savedAt < 4000 && (
                <span className="text-xs text-[var(--color-text-secondary)]">Saved</span>
              )}
              {error && <span className="text-xs text-[var(--color-danger,#dc2626)]">{error}</span>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Small bits ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">{label}</span>
        {hint && <span className="text-xs text-[var(--color-text-secondary)]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const next = draft.trim();
    if (!next) return;
    if (!value.some((v) => v.toLowerCase() === next.toLowerCase())) onChange([...value, next]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-1.5 min-h-9 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] focus-within:border-[var(--color-accent)]">
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-[var(--color-bg-tinted,rgba(120,120,120,0.12))]"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length ? '' : placeholder}
        className="flex-1 min-w-[120px] bg-transparent text-sm focus:outline-none"
      />
    </div>
  );
}
