import { useState, type FormEvent } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { login, checkMfaRequired } from '../../lib/auth';
import { useAuthStore } from '../../stores/auth';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const user = await login(email, password);
    setLoading(false);

    if (!user) {
      setError('Invalid email or password.');
      return;
    }

    setUser(user);

    const mfaFactorId = await checkMfaRequired();
    if (mfaFactorId) {
      navigate('/mfa-verify', { replace: true, state: { from } });
      return;
    }

    navigate(from, { replace: true });
  };

  return (
    <>
      <h1 className="text-2xl font-semibold text-center">Welcome back</h1>
      <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1 mb-6">
        Sign in to your Reverse ATS account
      </p>

      {error && (
        <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 rounded-md px-4 py-2 text-sm text-[var(--color-danger)] mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" />
        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-text)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 text-center space-y-2">
        <Link to="/forgot-password" className="block text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
          Forgot password?
        </Link>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Don't have an account?{' '}
          <Link to="/sign-up" className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">Sign up</Link>
        </p>
      </div>
    </>
  );
}

function Field(props: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{props.label}</label>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        className="w-full h-10 px-3 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-muted)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
      />
    </div>
  );
}
