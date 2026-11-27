import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { SafeImage } from '../components/SafeImage.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { ASSETS, COMPANY_INFO } from '../lib/assets.ts';
import type { AppView, UserProfile } from '../types.ts';

interface AdminAuthPageProps {
  onNavigate: (view: AppView) => void;
}

export function AdminAuthPage({ onNavigate }: AdminAuthPageProps) {
  const { setSession } = useAuth();
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [envManaged, setEnvManaged] = useState(false);

  const [email, setEmail] = useState('palamuentertainmentindustry@gmail.com');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ configured: boolean; envManaged: boolean }>('/api/auth/admin/status')
      .then((res) => {
        if (!active) return;
        setConfigured(res.configured);
        setEnvManaged(res.envManaged);
      })
      .catch(() => {
        if (!active) return;
        setConfigured(true);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!configured && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = configured ? '/api/auth/admin/login' : '/api/auth/admin/claim';
      const res = await apiFetch<{ token: string; user: UserProfile }>(endpoint, {
        method: 'POST',
        body: { email, password },
      });
      setSession(res.token, res.user);
      onNavigate('admin-dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Administrator authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800/80 px-5 sm:px-8 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors min-h-[44px] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Home</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('artist-auth')}
          className="text-xs font-medium text-zinc-400 hover:text-[#E5C158] transition-colors min-h-[44px] px-2 cursor-pointer"
        >
          Artist Sign In
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 sm:px-5 py-8 sm:py-10">
        <div className="w-full max-w-[440px] rounded-xl border border-[#D4AF37]/30 bg-[#111114] p-6 sm:p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <SafeImage
              src={ASSETS.brandEmblem}
              alt="ANGAD MUSIC DISTRIBUTOR logo"
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-contain bg-black border border-[#D4AF37]/45 p-1 mb-4 shadow-[0_0_24px_rgba(212,175,55,0.16)]"
            />
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E5C158] mb-1">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Restricted Label Access</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-zinc-100">
              {checking
                ? 'Verifying Console...'
                : configured
                  ? 'Admin Console Sign In'
                  : 'Claim Administrator Account'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              {COMPANY_INFO.brandName} · {COMPANY_INFO.parentCompany}
            </p>
          </div>

          {!checking && !configured && (
            <div className="mb-5 p-3.5 rounded-md bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-xs text-[#F5E6B3] leading-relaxed">
              First-run setup: Claim your Palamu Entertainment Industry administrator password now. Once claimed,
              registration locks permanently on the server.
            </div>
          )}

          {!checking && configured && envManaged && (
            <div className="mb-5 p-3 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
              Administrator passcode is verified against server environment configuration.
            </div>
          )}

          {error && (
            <div className="mb-5 p-3.5 rounded-md bg-rose-950/40 border border-rose-800/60 text-xs sm:text-sm text-rose-300">
              {error}
            </div>
          )}

          {checking ? (
            <div className="py-10 text-center text-sm text-zinc-400">Loading security state...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="admin-email">
                  Administrator Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="admin-password">
                  {configured ? 'Administrator Password' : 'Create Administrator Password'}
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 pr-11 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {!configured && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="admin-confirm">
                    Confirm Administrator Password
                  </label>
                  <input
                    id="admin-confirm"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-md text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 transition-colors cursor-pointer mt-2"
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>
                  {loading ? 'Authenticating...' : configured ? 'Sign In to Admin Dashboard' : 'Save & Enter Admin Console'}
                </span>
              </button>
            </form>
          )}

          <p className="mt-6 text-[11px] text-zinc-500 text-center">
            {COMPANY_INFO.brandName} · Separate Admin Security Boundary
          </p>
        </div>
      </div>
    </div>
  );
}
