import { supabase, type Tier } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
  tier: Tier;
}

export async function getUser(): Promise<AuthUser | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return await loadProfile(session.user.id, session.user.email ?? '');
}

async function loadProfile(userId: string, email: string): Promise<AuthUser> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, tier')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[auth] profile fetch failed:', error.message);
  }

  if (!data) {
    return { id: userId, email, tier: 'free' };
  }
  return { id: data.id, email: data.email, tier: data.tier as Tier };
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.tier === 'admin';
}

export function hasTier(user: AuthUser | null, required: Tier): boolean {
  if (!user) return false;
  const order: Record<Tier, number> = { free: 0, sponsor: 1, admin: 2 };
  return order[user.tier] >= order[required];
}

export async function login(email: string, password: string): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return await loadProfile(data.user.id, data.user.email ?? '');
}

export type SignupResult =
  | { status: 'ok'; user: AuthUser }
  | { status: 'confirm_email' }
  | { status: 'error'; message: string };

export async function signup(email: string, password: string): Promise<SignupResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { status: 'error', message: error.message };

  // No session means the project requires email confirmation before sign-in.
  if (!data.session) return { status: 'confirm_email' };

  const user = await loadProfile(data.user!.id, data.user!.email ?? '');
  return { status: 'ok', user };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function sendPasswordReset(email: string): Promise<boolean> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return !error;
}

export async function updatePassword(newPassword: string): Promise<boolean> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return !error;
}

/** Returns the verified TOTP factor id if the session needs to step up to AAL2, else null. */
export async function checkMfaRequired(): Promise<string | null> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!data) return null;
  if (data.currentLevel === 'aal1' && data.nextLevel === 'aal2') {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find(f => f.status === 'verified');
    return verified?.id ?? null;
  }
  return null;
}

export async function verifyMfa(factorId: string, code: string): Promise<boolean> {
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr || !challenge) return false;
  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  return !vErr;
}

export async function enrollTotp(): Promise<{ factorId: string; qrCode: string; secret: string } | null> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (error || !data) return null;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}
