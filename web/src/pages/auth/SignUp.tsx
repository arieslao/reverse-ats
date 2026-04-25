import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signup } from '../../lib/auth';
import { useAuthStore } from '../../stores/auth';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signup(email, password);
    setLoading(false);

    if (result.status === 'error') {
      setError(result.message);
      return;
    }
    if (result.status === 'confirm_email') {
      setConfirmSent(true);
      return;
    }
    setUser(result.user);
    navigate('/app', { replace: true });
  };

  if (confirmSent) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          We sent a confirmation link to <span className="font-medium">{email}</span>. Click it to finish creating your account.
        </p>
        <Link to="/sign-in" className="inline-block text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-center">Create your account</h1>
      <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1 mb-6">
        Free to start — upgrade for AI scoring &amp; tooling
      </p>

      {error && (
        <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 rounded-md px-4 py-2 text-sm text-[var(--color-danger)] mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            autoComplete="email" placeholder="you@example.com"
            className="w-full h-10 px-3 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Password</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            autoComplete="new-password" minLength={8} placeholder="At least 8 characters"
            className="w-full h-10 px-3 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <button
          type="submit" disabled={loading}
          className="w-full h-10 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-[var(--color-text-tertiary)]">
        Already have an account?{' '}
        <Link to="/sign-in" className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">Sign in</Link>
      </p>
    </>
  );
}
