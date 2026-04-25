import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword } from '../../lib/auth';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const ok = await updatePassword(password);
    setLoading(false);
    if (!ok) {
      setError('Could not update password. The reset link may have expired.');
      return;
    }
    navigate('/app', { replace: true });
  };

  return (
    <>
      <h1 className="text-2xl font-semibold text-center">Set a new password</h1>
      <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1 mb-6">
        Choose something memorable but strong.
      </p>

      {error && (
        <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 rounded-md px-4 py-2 text-sm text-[var(--color-danger)] mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">New password</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            autoComplete="new-password" minLength={8}
            className="w-full h-10 px-3 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Confirm password</label>
          <input
            type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
            autoComplete="new-password" minLength={8}
            className="w-full h-10 px-3 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <button
          type="submit" disabled={loading}
          className="w-full h-10 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}
