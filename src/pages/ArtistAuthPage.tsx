import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail, Smartphone } from 'lucide-react';
import { SafeImage } from '../components/SafeImage.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { ASSETS, COMPANY_INFO } from '../lib/assets.ts';
import type { AppView, UserProfile } from '../types.ts';

const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'United Arab Emirates',
  'Nepal',
  'Bangladesh',
  'Pakistan',
  'Singapore',
  'Germany',
  'France',
  'Other',
];

type AuthMode = 'login' | 'otp' | 'register' | 'forgot';

interface ArtistAuthPageProps {
  initialMode?: 'login' | 'register';
  onNavigate: (view: AppView) => void;
}

export function ArtistAuthPage({ initialMode = 'login', onNavigate }: ArtistAuthPageProps) {
  const { setSession } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Register fields: Full Name, Country, Mobile, Email, Password
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('India');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Mobile OTP Login state
  const [otpMobile, setOtpMobile] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [previewOtpNotice, setPreviewOtpNotice] = useState<string | null>(null);

  // Forgot & Reset Password state
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setSuccessMsg(null);
    setPreviewOtpNotice(null);
  };

  const handleEmailOrRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/artist/register', {
          method: 'POST',
          body: { fullName, country, mobile, email, password },
        });
        setSession(res.token, res.user);
        onNavigate('account-security');
      } else {
        const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/artist/login', {
          method: 'POST',
          body: { email, password },
        });
        setSession(res.token, res.user);
        onNavigate('artist-dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestMobileOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setPreviewOtpNotice(null);
    setLoading(true);
    try {
      const res = await apiFetch<{
        sent: boolean;
        deliveryMode: string;
        previewOtp?: string;
        message: string;
      }>('/api/auth/artist/otp/request', {
        method: 'POST',
        body: { mobile: otpMobile },
      });
      setOtpRequested(true);
      setSuccessMsg(res.message);
      if (res.previewOtp) {
        setPreviewOtpNotice(`Preview OTP: ${res.previewOtp}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMobileOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/artist/otp/verify', {
        method: 'POST',
        body: { mobile: otpMobile, otp: otpCode },
      });
      setSession(res.token, res.user);
      onNavigate('artist-dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setPreviewOtpNotice(null);
    setLoading(true);
    try {
      const res = await apiFetch<{
        sent: boolean;
        deliveryMode: string;
        previewOtp?: string;
        message: string;
      }>('/api/auth/artist/forgot-password', {
        method: 'POST',
        body: { identifier: resetIdentifier },
      });
      setResetStep('confirm');
      setSuccessMsg(res.message);
      if (res.previewOtp) {
        setPreviewOtpNotice(`Preview Reset OTP: ${res.previewOtp}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ reset: boolean; message: string }>('/api/auth/artist/reset-password', {
        method: 'POST',
        body: { identifier: resetIdentifier, otp: resetOtp, newPassword: resetNewPassword },
      });
      setResetStep('request');
      setResetOtp('');
      setResetNewPassword('');
      setPreviewOtpNotice(null);
      setMode('login');
      setSuccessMsg(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
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
          onClick={() => onNavigate('admin-auth')}
          className="text-xs font-medium text-zinc-400 hover:text-[#E5C158] transition-colors min-h-[44px] px-2 cursor-pointer"
        >
          Admin Portal
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 sm:px-5 py-8 sm:py-10">
        <div className="w-full max-w-[480px] rounded-xl border border-zinc-800 bg-[#111114] p-6 sm:p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <SafeImage
              src={ASSETS.brandEmblem}
              alt="ANGAD MUSIC DISTRIBUTOR logo"
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-contain bg-black border border-[#D4AF37]/45 p-1 mb-4 shadow-[0_0_24px_rgba(212,175,55,0.16)]"
            />
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-zinc-100">
              {mode === 'register'
                ? 'Artist Registration'
                : mode === 'otp'
                  ? 'Mobile OTP Sign In'
                  : mode === 'forgot'
                    ? 'Forgot & Reset Password'
                    : 'Artist Sign In'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              {COMPANY_INFO.brandName} · {COMPANY_INFO.parentCompany}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 min-h-[40px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Email</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('otp')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 min-h-[40px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'otp' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Mobile OTP</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 min-h-[40px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-md bg-rose-950/40 border border-rose-800/60 text-xs sm:text-sm text-rose-300">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-5 p-3.5 rounded-md bg-emerald-950/40 border border-emerald-800/60 text-xs sm:text-sm text-emerald-300 space-y-1">
              <p>{successMsg}</p>
              {previewOtpNotice && <p className="font-mono font-semibold text-[#E5C158]">{previewOtpNotice}</p>}
            </div>
          )}

          {/* EMAIL LOGIN OR SIGN UP */}
          {(mode === 'login' || mode === 'register') && (
            <form onSubmit={handleEmailOrRegisterSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="artist-fullname">
                      Full Name
                    </label>
                    <input
                      id="artist-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Angad Kumar Verma"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="artist-country">
                        Country
                      </label>
                      <select
                        id="artist-country"
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="artist-mobile">
                        Mobile
                      </label>
                      <input
                        id="artist-mobile"
                        type="tel"
                        required
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="+91 9876543210"
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="artist-email">
                  Email
                </label>
                <input
                  id="artist-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="artist@domain.com"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-zinc-300" htmlFor="artist-password">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs text-[#E5C158] hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="artist-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 pr-11 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
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

              {mode === 'register' && (
                <div className="p-3 rounded-lg bg-[#09090B] border border-[#D4AF37]/30 text-[11px] text-zinc-300 leading-relaxed">
                  <strong className="text-[#E5C158]">Mandatory Artist KYC Step:</strong> After creating your account,
                  you will complete identity verification with Aadhaar, PAN card, and address details. All KYC
                  documents are stored encrypted and never displayed publicly.
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 min-h-[44px] rounded-md text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 transition-colors cursor-pointer mt-2"
              >
                {loading
                  ? 'Please wait...'
                  : mode === 'register'
                    ? 'Create Artist Account & Continue to KYC'
                    : 'Sign In to Artist Dashboard'}
              </button>
            </form>
          )}

          {/* MOBILE OTP LOGIN */}
          {mode === 'otp' && (
            <form
              onSubmit={otpRequested ? handleVerifyMobileOtp : handleRequestMobileOtp}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="otp-mobile">
                  Registered Mobile Number
                </label>
                <input
                  id="otp-mobile"
                  type="tel"
                  required
                  value={otpMobile}
                  onChange={(e) => setOtpMobile(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {otpRequested && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="otp-code">
                    6-Digit OTP Code
                  </label>
                  <input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono tracking-widest text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 min-h-[44px] rounded-md text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {loading
                  ? 'Verifying...'
                  : otpRequested
                    ? 'Verify OTP & Sign In'
                    : 'Request 6-Digit Mobile OTP'}
              </button>

              {otpRequested && (
                <button
                  type="button"
                  onClick={handleRequestMobileOtp}
                  className="w-full text-xs text-zinc-400 hover:text-[#E5C158] cursor-pointer"
                >
                  Resend 6-digit OTP
                </button>
              )}
            </form>
          )}

          {/* FORGOT PASSWORD & RESET */}
          {mode === 'forgot' && (
            <form
              onSubmit={resetStep === 'request' ? handleForgotRequest : handlePasswordReset}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="reset-id">
                  Registered Email or Mobile Number
                </label>
                <input
                  id="reset-id"
                  type="text"
                  required
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="artist@domain.com or +91 9876543210"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {resetStep === 'confirm' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="reset-otp">
                      6-Digit Reset OTP
                    </label>
                    <input
                      id="reset-otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={resetOtp}
                      onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit OTP"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono tracking-widest text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="reset-pass">
                      New Password (Minimum 8 Characters)
                    </label>
                    <input
                      id="reset-pass"
                      type="password"
                      required
                      minLength={8}
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="Enter strong new password"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-md text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4" aria-hidden="true" />
                <span>
                  {loading
                    ? 'Processing...'
                    : resetStep === 'request'
                      ? 'Send Password Reset OTP'
                      : 'Verify OTP & Reset Password'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Back to Email Sign In
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-zinc-500 text-center">
            Need help signing in? Call <span className="font-mono text-zinc-300">{COMPANY_INFO.phone}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
