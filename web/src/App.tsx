import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';

import RequireAuth from './components/auth/RequireAuth';
import RequireTier from './components/auth/RequireTier';

const Landing = lazy(() => import('./pages/marketing/Landing'));
const AuthLayout = lazy(() => import('./layouts/AuthLayout'));
const SignIn = lazy(() => import('./pages/auth/SignIn'));
const SignUp = lazy(() => import('./pages/auth/SignUp'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const MfaVerify = lazy(() => import('./pages/auth/MfaVerify'));
const MfaSetup = lazy(() => import('./pages/auth/MfaSetup'));
const AppIndex = lazy(() => import('./pages/app/Index'));
const ProfilePage = lazy(() => import('./pages/app/Profile'));
const FeedPage = lazy(() => import('./pages/app/Feed'));
const PipelinePage = lazy(() => import('./pages/app/Pipeline'));
const AnalyticsPage = lazy(() => import('./pages/app/Analytics'));
const AdminIndex = lazy(() => import('./pages/admin/Index'));

function Loading() {
  return <div className="min-h-screen flex items-center justify-center text-sm opacity-60">Loading…</div>;
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />

          <Route element={<AuthLayout />}>
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/mfa-verify" element={<MfaVerify />} />
            <Route path="/mfa-setup" element={<MfaSetup />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppIndex />} />
            <Route path="/app/profile" element={<ProfilePage />} />
            <Route path="/app/feed" element={<FeedPage />} />
            <Route path="/app/pipeline" element={<PipelinePage />} />
            <Route path="/app/analytics" element={<AnalyticsPage />} />
          </Route>

          <Route element={<RequireTier tier="admin" />}>
            <Route path="/admin" element={<AdminIndex />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
