import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { verifyMfa, checkMfaRequired, logout } from '../../lib/auth';
import { useAuthStore } from '../../stores/auth';

export default function MfaVerify() {
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuthStore();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  useEffect(() => {
    checkMfaRequired().then(setFactorId);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setError('');
    setLoading(true);
    const ok = await verifyMfa(factorId, code);
    setLoading(false);
    if (!ok) {
      setError('Invalid code. Try again.');
      return;
    }
    await refresh();
    navigate(from, { replace: true });
  };

  const handleCancel = async () => {
    await logout();
    navigate('/sign-in', { replace: true });
  };

  return (
    <>
      <h1 className="text-2xl font-semibold text-center">Verify your identity</h1>
      <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1 mb-6">
        Open your authenticator app and enter the 6-digit code.
      </p>

      {error && (
        <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 rounded-md px-4 py-2 text-sm text-[var(--color-danger)] mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          autoFocus required placeholder="123456"
          className="w-full h-12 px-3 text-center text-lg tracking-[0.5em] rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit" disabled={loading || code.length !== 6}
          className="w-full h-10 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </form>

      <button
        onClick={handleCancel}
        className="mt-6 w-full text-center text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
      >
        Sign out
      </button>
    </>
  );
}
