import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { enrollTotp, verifyMfa } from '../../lib/auth';

export default function MfaSetup() {
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    enrollTotp().then((res) => {
      if (!res) {
        setError('Could not start TOTP enrollment.');
        return;
      }
      setEnrollment(res);
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    setError('');
    setLoading(true);
    const ok = await verifyMfa(enrollment.factorId, code);
    setLoading(false);
    if (!ok) {
      setError('Invalid code. Try again.');
      return;
    }
    navigate('/app', { replace: true });
  };

  if (!enrollment) {
    return (
      <div className="text-center text-sm text-[var(--color-text-secondary)]">
        {error || 'Preparing…'}
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-center">Set up two-factor auth</h1>
      <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1 mb-6">
        Scan the QR code with an authenticator app, then enter the 6-digit code.
      </p>

      <div className="flex justify-center mb-4">
        <div
          className="w-48 h-48 bg-white p-2 rounded-md"
          dangerouslySetInnerHTML={{ __html: enrollment.qrCode }}
        />
      </div>

      <details className="mb-4 text-xs text-[var(--color-text-tertiary)]">
        <summary className="cursor-pointer">Can't scan? Enter manually</summary>
        <code className="block mt-2 p-2 bg-[var(--color-bg-tinted)] rounded select-all break-all">
          {enrollment.secret}
        </code>
      </details>

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
          {loading ? 'Verifying…' : 'Confirm and enable'}
        </button>
      </form>
    </>
  );
}
