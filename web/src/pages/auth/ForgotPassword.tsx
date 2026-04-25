import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordReset } from '../../lib/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await sendPasswordReset(email);
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          If <span className="font-medium">{email}</span> has an account, we sent a password reset link.
        </p>
        <Link to="/sign-in" className="inline-block text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-center">Reset your password</h1>
      <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1 mb-6">
        Enter your email and we'll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            autoComplete="email" placeholder="you@example.com"
            className="w-full h-10 px-3 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <button
          type="submit" disabled={loading}
          className="w-full h-10 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-[var(--color-text-tertiary)]">
        Remembered it?{' '}
        <Link to="/sign-in" className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">Sign in</Link>
      </p>
    </>
  );
}
