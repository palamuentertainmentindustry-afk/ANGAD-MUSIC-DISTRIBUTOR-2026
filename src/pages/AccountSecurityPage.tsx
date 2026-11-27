import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Eye,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type { AppView, ArtistKycRecord, ArtistSubAccount, LoginHistoryItem } from '../types.ts';

interface AccountSecurityPageProps {
  onNavigate: (view: AppView) => void;
}

export function AccountSecurityPage({ onNavigate }: AccountSecurityPageProps) {
  const { token, user, refreshProfile } = useAuth();
  const [subAccounts, setSubAccounts] = useState<ArtistSubAccount[]>([]);
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);
  const [accountProtected, setAccountProtected] = useState(user?.account_protected !== 0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Artist KYC Verification state
  const [kycRecord, setKycRecord] = useState<ArtistKycRecord | null>(null);
  const [legalName, setLegalName] = useState(user?.full_name || '');
  const [kycMobile, setKycMobile] = useState(user?.mobile || '');
  const [kycEmail, setKycEmail] = useState(user?.email || '');
  const [fullAddress, setFullAddress] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [bio, setBio] = useState(user?.bio || '');
  const [kycNotes, setKycNotes] = useState(user?.verification_notes || '');
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [aadhaarFrontKey, setAadhaarFrontKey] = useState('');
  const [aadhaarBackKey, setAadhaarBackKey] = useState('');
  const [panCardKey, setPanCardKey] = useState('');
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [submittingKyc, setSubmittingKyc] = useState(false);

  // Authenticated private document preview modal
  const [previewModal, setPreviewModal] = useState<{ title: string; url: string; mime: string } | null>(null);

  // Multiple artist accounts form
  const [newArtistName, setNewArtistName] = useState('');
  const [newCountry, setNewCountry] = useState('India');
  const [newGenre, setNewGenre] = useState('Bhojpuri');
  const [newBio, setNewBio] = useState('');
  const [newInsta, setNewInsta] = useState('');
  const [newSpotify, setNewSpotify] = useState('');
  const [newYoutube, setNewYoutube] = useState('');

  // OTP & Change Password
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const loadSecurityData = async () => {
    if (!token) return;
    try {
      const [subs, sec, kycRes] = await Promise.all([
        apiFetch<{ profiles: ArtistSubAccount[] }>('/api/artist/sub-accounts', { token }),
        apiFetch<{ history: LoginHistoryItem[]; security: { account_protected: number } }>(
          '/api/artist/security',
          { token }
        ),
        apiFetch<{ kyc: ArtistKycRecord }>('/api/artist/kyc', { token }),
      ]);
      setSubAccounts(subs.profiles);
      setHistory(sec.history);
      setAccountProtected(sec.security?.account_protected !== 0);
      if (kycRes.kyc) {
        setKycRecord(kycRes.kyc);
        setLegalName(kycRes.kyc.legal_name || user?.full_name || '');
        setKycMobile(kycRes.kyc.mobile || user?.mobile || '');
        setKycEmail(kycRes.kyc.email || user?.email || '');
        setFullAddress(kycRes.kyc.full_address || '');
        setKycNotes(kycRes.kyc.notes || '');
        setConsentAccepted(Boolean(kycRes.kyc.consent_accepted));
      }
    } catch {
      // Ignore partial load error
    }
  };

  useEffect(() => {
    loadSecurityData();
  }, [token]);

  useEffect(() => {
    return () => {
      if (previewModal?.url) {
        URL.revokeObjectURL(previewModal.url);
      }
    };
  }, [previewModal]);

  const handleKycDocUpload = async (
    slot: 'aadhaar_front' | 'aadhaar_back' | 'pan_card',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploadingSlot(slot);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch<{ privateFileKey: string; originalName: string }>('/api/upload/kyc-doc', {
        method: 'POST',
        token,
        body: fd,
        isFormData: true,
      });
      if (slot === 'aadhaar_front') setAadhaarFrontKey(res.privateFileKey);
      if (slot === 'aadhaar_back') setAadhaarBackKey(res.privateFileKey);
      if (slot === 'pan_card') setPanCardKey(res.privateFileKey);
      setFeedback({
        type: 'success',
        text: `${res.originalName} uploaded to encrypted private KYC vault. Submit KYC Verification to complete.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'KYC document upload failed.' });
    } finally {
      setUploadingSlot(null);
      e.target.value = '';
    }
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    setSubmittingKyc(true);
    try {
      const res = await apiFetch<{ kyc: ArtistKycRecord }>('/api/artist/kyc', {
        method: 'POST',
        token,
        body: {
          legalName,
          mobile: kycMobile,
          email: kycEmail,
          fullAddress,
          aadhaarNumber,
          panNumber,
          notes: kycNotes,
          bio,
          consentAccepted,
          aadhaarFrontFile: aadhaarFrontKey,
          aadhaarBackFile: aadhaarBackKey,
          panCardFile: panCardKey,
        },
      });
      setKycRecord(res.kyc);
      setAadhaarNumber('');
      setPanNumber('');
      await refreshProfile();
      setFeedback({
        type: 'success',
        text: 'Artist KYC Identity Verification securely encrypted and submitted for Admin approval.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'KYC verification failed.' });
    } finally {
      setSubmittingKyc(false);
    }
  };

  const openPrivateDocPreview = async (slot: 'aadhaar_front' | 'aadhaar_back' | 'pan_card', label: string) => {
    if (!token || !user) return;
    setFeedback(null);
    try {
      const response = await fetch(`/api/private-docs/kyc/${user.id}/${slot}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not open private KYC document.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewModal((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { title: label, url, mime: blob.type || 'image/jpeg' };
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Preview unavailable.' });
    }
  };

  const handleCreateSubAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    try {
      const res = await apiFetch<{ profile: ArtistSubAccount }>('/api/artist/sub-accounts', {
        method: 'POST',
        token,
        body: {
          artistName: newArtistName,
          country: newCountry,
          genre: newGenre,
          bio: newBio,
          instagramUrl: newInsta,
          spotifyUrl: newSpotify,
          youtubeUrl: newYoutube,
        },
      });
      setSubAccounts((prev) => [res.profile, ...prev]);
      setNewArtistName('');
      setNewBio('');
      setNewInsta('');
      setNewSpotify('');
      setNewYoutube('');
      setFeedback({
        type: 'success',
        text: `Artist profile "${res.profile.artist_name}" added. You can select it directly when creating releases.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not add artist account.' });
    }
  };

  const handleDeleteSubAccount = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`/api/artist/sub-accounts/${id}`, { method: 'DELETE', token });
      setSubAccounts((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not remove artist profile.' });
    }
  };

  const handleRequestOtpVerify = async () => {
    if (!token) return;
    setFeedback(null);
    try {
      const res = await apiFetch<{ previewOtp?: string }>('/api/artist/security/otp-request', {
        method: 'POST',
        token,
      });
      setOtpRequested(true);
      if (res.previewOtp) setOtpPreview(res.previewOtp);
      setFeedback({ type: 'success', text: '6-digit mobile verification OTP generated.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not request OTP.' });
    }
  };

  const handleConfirmOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch('/api/artist/security/otp-confirm', {
        method: 'POST',
        token,
        body: { otp: otpInput },
      });
      setOtpRequested(false);
      setOtpInput('');
      setOtpPreview(null);
      await refreshProfile();
      setFeedback({ type: 'success', text: 'Mobile OTP verified and account protection enabled.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Invalid OTP.' });
    }
  };

  const handleToggleProtection = async () => {
    if (!token) return;
    const next = !accountProtected;
    try {
      await apiFetch('/api/artist/security', {
        method: 'PATCH',
        token,
        body: { accountProtected: next },
      });
      setAccountProtected(next);
      await refreshProfile();
    } catch {
      // Ignore toggle error
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch('/api/auth/artist/change-password', {
        method: 'POST',
        token,
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setFeedback({ type: 'success', text: 'Password updated securely.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not update password.' });
    }
  };

  const kycStatus = kycRecord?.kyc_status || user?.verification_status || 'Unverified';

  return (
    <DashboardLayout currentView="account-security" onNavigate={onNavigate} title="Artist KYC & Security">
      {feedback && (
        <div
          className={`mb-6 p-4 rounded-lg border text-sm backdrop-blur-md ${
            feedback.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/70 border-rose-800/60 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Private Authenticated Document Modal */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-[#111114] overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#E5C158]" />
                <h3 className="text-sm font-semibold text-zinc-100">{previewModal.title} (Private Vault)</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 cursor-pointer"
                aria-label="Close document preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-[#09090B] flex items-center justify-center max-h-[75vh] overflow-auto">
              {previewModal.mime.includes('pdf') ? (
                <iframe src={previewModal.url} title={previewModal.title} className="w-full h-[65vh] rounded" />
              ) : (
                <img src={previewModal.url} alt={previewModal.title} className="max-h-[65vh] rounded object-contain" />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Artist KYC Verification (Aadhaar & PAN) */}
        <form
          onSubmit={handleSubmitKyc}
          className="lg:col-span-7 p-6 rounded-xl border border-[#D4AF37]/30 bg-[#0B0B0F]/80 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-[#E5C158]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-zinc-100">
                Artist Identity KYC Verification
              </h2>
            </div>
            <StatusText status={kycStatus} />
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">
            Every artist distributing through ANGAD MUSIC DISTRIBUTOR (Palamu Entertainment Industry) must verify
            identity with Aadhaar, PAN card, and address. All documents stay encrypted and private — never public.
          </p>

          {kycRecord?.reviewer_notes && (
            <div className="p-3 rounded-lg bg-[#111114] border border-zinc-800 text-xs text-zinc-300">
              <span className="font-semibold text-[#E5C158]">Reviewer Note: </span>
              {kycRecord.reviewer_notes}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Full Legal Name *</label>
              <input
                type="text"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Name as on Aadhaar / PAN"
                className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Mobile Number *</label>
              <input
                type="tel"
                required
                value={kycMobile}
                onChange={(e) => setKycMobile(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={kycEmail}
                onChange={(e) => setKycEmail(e.target.value)}
                placeholder="artist@domain.com"
                className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-300 mb-1">Complete Residential Address *</label>
            <textarea
              rows={2}
              required
              minLength={10}
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              placeholder="House/Village, Post, Police Station, District, State & PIN Code"
              className="w-full px-3 py-2 rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs text-zinc-300 mb-1">
                Aadhaar Number (12 Digits) *{' '}
                {kycRecord?.aadhaar_masked && (
                  <span className="font-mono text-[#E5C158]">({kycRecord.aadhaar_masked})</span>
                )}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                required={!kycRecord?.aadhaar_masked}
                value={aadhaarNumber}
                onChange={(e) => setAadhaarNumber(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 14))}
                placeholder={kycRecord?.aadhaar_masked ? 'Enter 12 digits only to update' : '12-digit Aadhaar Number'}
                className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-300 mb-1">
                PAN Card Number *{' '}
                {kycRecord?.pan_masked && (
                  <span className="font-mono text-[#E5C158]">({kycRecord.pan_masked})</span>
                )}
              </label>
              <input
                type="text"
                maxLength={10}
                required={!kycRecord?.pan_masked}
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder={kycRecord?.pan_masked ? 'Enter 10-char PAN only to update' : 'ABCDE1234F'}
                className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs font-mono uppercase text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          {/* Secure Private Document Uploads */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-[#09090B]/90 border border-zinc-800 space-y-2">
              <p className="text-[11px] font-semibold text-zinc-200">Aadhaar Front *</p>
              <label className="inline-flex items-center justify-center gap-1.5 w-full px-2.5 py-2 min-h-[36px] rounded text-xs font-medium bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>
                  {uploadingSlot === 'aadhaar_front'
                    ? 'Uploading...'
                    : aadhaarFrontKey || kycRecord?.has_aadhaar_front
                      ? 'Attached ✓'
                      : 'Upload Front'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => handleKycDocUpload('aadhaar_front', e)}
                  className="sr-only"
                />
              </label>
              {kycRecord?.has_aadhaar_front && (
                <button
                  type="button"
                  onClick={() => openPrivateDocPreview('aadhaar_front', 'Aadhaar Front')}
                  className="inline-flex items-center gap-1 text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>View Saved Doc</span>
                </button>
              )}
            </div>

            <div className="p-3 rounded-lg bg-[#09090B]/90 border border-zinc-800 space-y-2">
              <p className="text-[11px] font-semibold text-zinc-200">Aadhaar Back</p>
              <label className="inline-flex items-center justify-center gap-1.5 w-full px-2.5 py-2 min-h-[36px] rounded text-xs font-medium bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>
                  {uploadingSlot === 'aadhaar_back'
                    ? 'Uploading...'
                    : aadhaarBackKey || kycRecord?.has_aadhaar_back
                      ? 'Attached ✓'
                      : 'Upload Back'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => handleKycDocUpload('aadhaar_back', e)}
                  className="sr-only"
                />
              </label>
              {kycRecord?.has_aadhaar_back && (
                <button
                  type="button"
                  onClick={() => openPrivateDocPreview('aadhaar_back', 'Aadhaar Back')}
                  className="inline-flex items-center gap-1 text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>View Saved Doc</span>
                </button>
              )}
            </div>

            <div className="p-3 rounded-lg bg-[#09090B]/90 border border-zinc-800 space-y-2">
              <p className="text-[11px] font-semibold text-zinc-200">PAN Card *</p>
              <label className="inline-flex items-center justify-center gap-1.5 w-full px-2.5 py-2 min-h-[36px] rounded text-xs font-medium bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>
                  {uploadingSlot === 'pan_card'
                    ? 'Uploading...'
                    : panCardKey || kycRecord?.has_pan_card
                      ? 'Attached ✓'
                      : 'Upload PAN'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => handleKycDocUpload('pan_card', e)}
                  className="sr-only"
                />
              </label>
              {kycRecord?.has_pan_card && (
                <button
                  type="button"
                  onClick={() => openPrivateDocPreview('pan_card', 'PAN Card')}
                  className="inline-flex items-center gap-1 text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>View Saved Doc</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Official Links / Artist Bio</label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Spotify / YouTube official link"
                className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Optional KYC Note</label>
              <input
                type="text"
                value={kycNotes}
                onChange={(e) => setKycNotes(e.target.value)}
                placeholder="Additional label authorization detail"
                className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
              />
            </div>
          </div>

          {/* Privacy Consent */}
          <label className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[#09090B]/90 border border-[#D4AF37]/30 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 accent-[#D4AF37]"
            />
            <span className="text-[11px] text-zinc-300 leading-relaxed">
              I confirm all identity details are accurate and provide explicit consent for ANGAD MUSIC DISTRIBUTOR /
              PALAMU ENTERTAINMENT INDUSTRY to securely encrypt and store my Aadhaar, PAN, and address information
              strictly for private KYC verification. These documents are never shared or displayed publicly.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
              <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Private AES-256 Encrypted Storage</span>
            </span>
            <button
              type="submit"
              disabled={submittingKyc}
              className="px-5 py-2.5 min-h-[42px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 cursor-pointer"
            >
              {submittingKyc ? 'Encrypting & Saving...' : 'Submit Artist KYC Verification'}
            </button>
          </div>
        </form>

        {/* Security Controls: OTP Verification, Account Protection & Password */}
        <div className="lg:col-span-5 p-6 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/80 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#E5C158]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-zinc-100">Account Protection &amp; OTP</h2>
            </div>
            <span className={`text-xs font-medium ${user?.otp_verified ? 'text-emerald-400' : 'text-amber-400'}`}>
              {user?.otp_verified ? 'OTP Verified' : 'Mobile Unverified'}
            </span>
          </div>

          <div className="p-4 rounded-lg bg-[#09090B]/90 border border-zinc-800 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-zinc-100">Account Protection Guard</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Audit every sign-in attempt and protect release/payout settings.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleProtection}
              className={`px-3.5 py-2 min-h-[38px] rounded-md text-xs font-semibold border cursor-pointer ${
                accountProtected
                  ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400'
              }`}
            >
              {accountProtected ? 'Protected: ON' : 'Protected: OFF'}
            </button>
          </div>

          <div className="p-4 rounded-lg bg-[#09090B]/90 border border-zinc-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-xs font-semibold text-zinc-100">Mobile OTP Verification ({user?.mobile})</span>
              </div>
              {!user?.otp_verified && (
                <button
                  type="button"
                  onClick={handleRequestOtpVerify}
                  className="text-xs font-semibold text-[#E5C158] hover:underline cursor-pointer"
                >
                  Send 6-Digit OTP
                </button>
              )}
            </div>
            {otpPreview && (
              <p className="text-xs font-mono text-[#E5C158]">Preview Verification OTP: {otpPreview}</p>
            )}
            {otpRequested && (
              <form onSubmit={handleConfirmOtpVerify} className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  className="flex-1 px-3 py-2 min-h-[38px] rounded bg-[#111114] border border-zinc-800 text-xs font-mono text-zinc-100"
                />
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[38px] rounded bg-[#D4AF37] text-[#09090B] text-xs font-semibold cursor-pointer"
                >
                  Confirm OTP
                </button>
              </form>
            )}
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D4AF37]" />
              <p className="text-xs font-semibold text-zinc-200">Change Secure Password</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
              />
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 chars)"
                className="px-3 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-zinc-900 border border-zinc-700 hover:border-[#D4AF37] text-zinc-100 cursor-pointer"
            >
              Update Password
            </button>
          </form>
        </div>
      </div>

      {/* Multiple Artist Accounts / Personas */}
      <section className="p-6 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/80 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-5 mb-8">
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-[#E5C158]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-semibold text-zinc-100">
              Multiple Artist Accounts ({subAccounts.length + 1} Active Profiles)
            </h2>
            <p className="text-xs text-zinc-300">
              Manage multiple artist names, bands, or label roster acts under your primary account for quick release
              submission.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateSubAccount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            required
            value={newArtistName}
            onChange={(e) => setNewArtistName(e.target.value)}
            placeholder="Artist / Band Name *"
            className="px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
          />
          <input
            type="text"
            value={newGenre}
            onChange={(e) => setNewGenre(e.target.value)}
            placeholder="Primary Genre (e.g. Bhojpuri)"
            className="px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
          />
          <input
            type="text"
            value={newCountry}
            onChange={(e) => setNewCountry(e.target.value)}
            placeholder="Country"
            className="px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[42px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Artist Account</span>
          </button>
          <input
            type="url"
            value={newSpotify}
            onChange={(e) => setNewSpotify(e.target.value)}
            placeholder="Spotify Artist URL (optional)"
            className="px-3.5 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
          />
          <input
            type="url"
            value={newYoutube}
            onChange={(e) => setNewYoutube(e.target.value)}
            placeholder="YouTube Channel URL (optional)"
            className="px-3.5 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
          />
          <input
            type="text"
            value={newInsta}
            onChange={(e) => setNewInsta(e.target.value)}
            placeholder="Instagram Handle / URL (optional)"
            className="px-3.5 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
          />
          <input
            type="text"
            value={newBio}
            onChange={(e) => setNewBio(e.target.value)}
            placeholder="Short artist note (optional)"
            className="px-3.5 py-2 min-h-[40px] rounded-md bg-[#09090B]/90 border border-zinc-800 text-xs text-zinc-100"
          />
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-lg bg-[#09090B]/90 border border-[#D4AF37]/40">
            <p className="text-xs font-semibold text-[#E5C158]">Primary Account</p>
            <p className="text-sm font-medium text-zinc-100 mt-1">{user?.stage_name || user?.full_name}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{user?.country} · {user?.email}</p>
          </div>
          {subAccounts.map((sa) => (
            <div key={sa.id} className="p-4 rounded-lg bg-[#09090B]/90 border border-zinc-800 flex justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100 truncate">{sa.artist_name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {sa.genre} · {sa.country}
                </p>
                {sa.bio && <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">{sa.bio}</p>}
              </div>
              <button
                type="button"
                onClick={() => handleDeleteSubAccount(sa.id)}
                aria-label={`Remove ${sa.artist_name}`}
                className="text-zinc-500 hover:text-rose-400 self-start cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Login History Audit */}
      <section className="rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/80 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="font-display text-base font-semibold text-zinc-100">Login History</h2>
          <p className="text-xs text-zinc-400">Recent sign-in events recorded for your artist account.</p>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400">No login events logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="py-3 px-6 font-medium">Timestamp (UTC)</th>
                  <th className="py-3 px-4 font-medium">Method</th>
                  <th className="py-3 px-4 font-medium">Identifier</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-6 font-medium">IP / Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-3 px-6 font-mono text-zinc-300 tabular-nums whitespace-nowrap">
                      {h.created_at}
                    </td>
                    <td className="py-3 px-4 text-zinc-200">{h.login_method}</td>
                    <td className="py-3 px-4 text-zinc-400">{h.identifier}</td>
                    <td className="py-3 px-4">
                      <StatusText status={h.status === 'Success' ? 'Live' : 'Rejected'} />
                    </td>
                    <td className="py-3 px-6 text-zinc-500 truncate max-w-[260px]">
                      {h.ip_address} · {h.user_agent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}
