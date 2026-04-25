import { Outlet, Link } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <Link to="/" className="mb-8 text-sm font-medium tracking-tight opacity-70 hover:opacity-100 transition-opacity">
        Reverse ATS
      </Link>
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
