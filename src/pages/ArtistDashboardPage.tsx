import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Disc3, ExternalLink, Megaphone, PlusCircle, ShieldCheck, Upload, Wallet } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { SafeImage } from '../components/SafeImage.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { ASSETS, formatDateDDMMYYYY, formatINR } from '../lib/assets.ts';
import type {
  AppView,
  ArtistOverviewMetrics,
  NotificationItem,
  ReleaseItem,
  RoyaltyEntry,
  SiteSettings,
} from '../types.ts';

interface ArtistDashboardPageProps {
  onNavigate: (view: AppView, opts?: { smartLinkSlug?: string }) => void;
}

export function ArtistDashboardPage({ onNavigate }: ArtistDashboardPageProps) {
  const { token, user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ArtistOverviewMetrics>({
    totalSongs: 0,
    liveSongs: 0,
    pendingSongs: 0,
    rejectedSongs: 0,
    totalReleases: 0,
    liveReleases: 0,
    approvedReleases: 0,
    pendingReleases: 0,
    rejectedReleases: 0,
    verifiedEarnings: 0,
    availableBalance: 0,
    totalPaidOut: 0,
    pendingPayouts: 0,
    totalStreams: 0,
    liveStoreDeliveries: 0,
    totalStoreDeliveries: 0,
    unreadNotifications: 0,
  });
  const [recentReleases, setRecentReleases] = useState<ReleaseItem[]>([]);
  const [recentRoyalties, setRecentRoyalties] = useState<RoyaltyEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadDashboard = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [res, settingsRes] = await Promise.all([
        apiFetch<{
          metrics: ArtistOverviewMetrics;
          recentReleases: ReleaseItem[];
          recentRoyalties: RoyaltyEntry[];
          recentNotifications?: NotificationItem[];
        }>('/api/artist/overview', { token }),
        apiFetch<{ settings: SiteSettings }>('/api/site-settings').catch(() => ({ settings: null })),
      ]);
      setMetrics(res.metrics);
      setRecentReleases(res.recentReleases);
      setRecentRoyalties(res.recentRoyalties);
      setNotifications(res.recentNotifications || []);
      if (settingsRes.settings) setSiteSettings(settingsRes.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [token]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await apiFetch<{ url: string }>('/api/upload/artwork', {
        method: 'POST',
        token,
        body: formData,
        isFormData: true,
      });
      await apiFetch('/api/artist/profile', {
        method: 'PATCH',
        token,
        body: { avatarUrl: uploaded.url },
      });
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile photo upload failed.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const markNotificationRead = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`/api/artist/notifications/${id}/read`, { method: 'PATCH', token });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setMetrics((prev) => ({
        ...prev,
        unreadNotifications: Math.max(0, (prev.unreadNotifications || 0) - 1),
      }));
    } catch {
      // ignore transient error
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await apiFetch('/api/artist/notifications/read-all', { method: 'PATCH', token });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setMetrics((prev) => ({ ...prev, unreadNotifications: 0 }));
    } catch {
      // ignore transient error
    }
  };

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  return (
    <DashboardLayout
      currentView="artist-dashboard"
      onNavigate={onNavigate}
      title="Artist Overview"
      actionButton={
        <button
          type="button"
          onClick={() => onNavigate('create-release')}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-md text-xs sm:text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" aria-hidden="true" />
          <span>New Release</span>
        </button>
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Artist Identity Bar */}
      <div className="mb-6 p-5 rounded-xl border border-[#D4AF37]/25 bg-[#0B0B0F]/76 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <SafeImage
            src={user?.avatar_url || ASSETS.artistAvatar}
            fallbackSrc={ASSETS.artistAvatar}
            alt={user?.full_name || 'Artist portrait'}
            className="w-14 h-14 rounded-full object-cover border border-[#D4AF37]/40 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-lg font-semibold text-zinc-100 truncate">
                {user?.stage_name || user?.full_name}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('account-security')}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E5C158] hover:underline cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{user?.verification_status || 'Unverified'}</span>
              </button>
            </div>
            <p className="text-xs text-zinc-400 truncate">
              {user?.country || 'India'} · {user?.mobile} · {user?.email}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2.5 pr-3 border-r border-zinc-800">
            <SafeImage
              src={ASSETS.brandEmblem}
              alt="ANGAD MUSIC DISTRIBUTOR logo"
              className="w-12 h-12 rounded-lg object-contain bg-black border border-[#D4AF37]/45 p-0.5 shrink-0"
            />
            <div className="text-right">
              <div className="text-[11px] font-semibold text-[#E5C158] tracking-wide">ANGAD MUSIC</div>
              <div className="text-[10px] text-zinc-400">Official Artist Roster</div>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-md text-xs font-medium text-zinc-200 bg-[#09090B]/80 border border-zinc-700/80 hover:border-[#D4AF37]/60 cursor-pointer shrink-0">
            <Upload className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden="true" />
            <span>{uploadingAvatar ? 'Uploading...' : 'Update Photo'}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} className="sr-only" />
          </label>
        </div>
      </div>

      {/* KYC Identity Verification Action Banner */}
      {user?.verification_status !== 'Verified' && (
        <div className="mb-6 p-4 sm:p-5 rounded-xl border border-amber-500/35 bg-[#12100B]/82 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#E5C158] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs sm:text-sm font-semibold text-zinc-100">
                  Artist Identity KYC Verification
                </p>
                <StatusText status={user?.verification_status || 'Unverified'} />
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Complete your private Aadhaar, PAN card, and address verification. Documents are stored securely for
                admin approval only and are never displayed publicly.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('account-security')}
            className="px-4 py-2.5 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {user?.verification_status === 'Pending Verification' ? 'View KYC Submission →' : 'Complete KYC Verification →'}
          </button>
        </div>
      )}

      {/* Latest Updates from Label Desk */}
      {siteSettings && (siteSettings.latest_update_text || siteSettings.announcement_banner) && (
        <div className="mb-6 p-4 sm:p-5 rounded-xl border border-[#D4AF37]/35 bg-[#12100B]/78 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Megaphone className="w-4 h-4 text-[#E5C158] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[#E5C158] uppercase tracking-wider">Latest Updates</p>
              <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
                {siteSettings.latest_update_text || siteSettings.announcement_banner}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('services')}
              className="text-xs font-medium text-[#E5C158] hover:underline whitespace-nowrap cursor-pointer"
            >
              Artist Services →
            </button>
          </div>
        </div>
      )}

      {/* 6 Core Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
        {[
          { label: 'Total Songs', value: metrics.totalSongs, accent: false },
          { label: 'Live Songs', value: metrics.liveSongs, accent: false },
          { label: 'Pending Songs', value: metrics.pendingSongs, accent: false },
          { label: 'Rejected Songs', value: metrics.rejectedSongs, accent: false },
          { label: 'Releases', value: metrics.totalReleases, accent: false },
          { label: 'Verified Earnings', value: formatINR(metrics.verifiedEarnings), accent: true },
        ].map((item) => (
          <div
            key={item.label}
            className="p-5 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/76 backdrop-blur-md shadow-[0_6px_24px_rgba(0,0,0,0.4)]"
          >
            <p className="text-xs text-zinc-300 mb-2 truncate">{item.label}</p>
            {loading ? (
              <div className="h-7 w-16 bg-zinc-800 rounded animate-pulse" />
            ) : (
              <p
                className={`font-mono text-2xl font-semibold tabular-nums truncate ${
                  item.accent ? 'text-[#E5C158]' : 'text-zinc-100'
                }`}
              >
                {item.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Extended Distribution Statistics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/76 backdrop-blur-md shadow-[0_6px_24px_rgba(0,0,0,0.4)]">
          <p className="text-xs text-zinc-300 mb-1">Approved / Live Releases</p>
          <p className="font-mono text-lg font-semibold text-zinc-100 tabular-nums">
            {loading ? '—' : `${metrics.approvedReleases ?? 0} Approved · ${metrics.liveReleases} Live`}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/76 backdrop-blur-md shadow-[0_6px_24px_rgba(0,0,0,0.4)]">
          <p className="text-xs text-zinc-300 mb-1">Confirmed Store Deliveries</p>
          <p className="font-mono text-lg font-semibold text-emerald-400 tabular-nums">
            {loading ? '—' : `${metrics.liveStoreDeliveries ?? 0} / ${metrics.totalStoreDeliveries ?? 0} LIVE`}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/76 backdrop-blur-md shadow-[0_6px_24px_rgba(0,0,0,0.4)]">
          <p className="text-xs text-zinc-300 mb-1">Verified Streams Reported</p>
          <p className="font-mono text-lg font-semibold text-zinc-100 tabular-nums">
            {loading ? '—' : (metrics.totalStreams ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/76 backdrop-blur-md shadow-[0_6px_24px_rgba(0,0,0,0.4)]">
          <p className="text-xs text-zinc-300 mb-1">Available Balance / Paid Out</p>
          <p className="font-mono text-lg font-semibold text-[#E5C158] tabular-nums">
            {loading ? '—' : `${formatINR(metrics.availableBalance)} · ${formatINR(metrics.totalPaidOut)}`}
          </p>
        </div>
      </div>

      {/* Notifications Panel */}
      <div className="mb-8 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/78 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-[#E5C158]" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-zinc-100">
              Artist Notifications
              {unreadCount > 0 ? ` (${unreadCount} unread)` : ''}
            </h3>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E5C158] hover:underline cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Mark All Read</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-5 space-y-2.5">
            <div className="h-10 bg-zinc-900 rounded animate-pulse" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-6 text-xs text-zinc-400">
            No notifications yet. Release QA updates, confirmed store deliveries, verified royalty statements, payout
            statuses, and support replies appear here automatically.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  n.is_read === 0 ? 'bg-[#D4AF37]/5' : ''
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100">{n.title}</span>
                    {n.is_read === 0 && (
                      <span className="text-[11px] font-semibold text-[#E5C158]">New</span>
                    )}
                    <span className="text-[11px] text-zinc-500 font-mono">
                      · {n.created_at.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{n.message}</p>
                </div>
                {n.is_read === 0 && (
                  <button
                    type="button"
                    onClick={() => markNotificationRead(n.id)}
                    className="text-xs font-medium text-zinc-300 hover:text-[#E5C158] shrink-0 self-start sm:self-center cursor-pointer"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Split: Recent Releases + Verified Earnings Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/78 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800/90 flex items-center justify-between gap-4">
            <h3 className="font-display text-base font-semibold text-zinc-100">Recent Releases</h3>
            <button
              type="button"
              onClick={() => onNavigate('my-releases')}
              className="text-xs font-medium text-[#E5C158] hover:underline cursor-pointer"
            >
              Open Release Folders
            </button>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-12 bg-zinc-900 rounded animate-pulse" />
              <div className="h-12 bg-zinc-900 rounded animate-pulse" />
            </div>
          ) : recentReleases.length === 0 ? (
            <div className="p-8 text-center">
              <Disc3 className="w-8 h-8 text-zinc-600 mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-zinc-200 mb-1">No releases submitted yet</p>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-5">
                Submit your first Single, EP, or Album to begin quality review with Palamu Entertainment Industry.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('create-release')}
                className="px-4 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
              >
                Create First Release
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {recentReleases.map((rel) => (
                <div key={rel.id} className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-zinc-900/50">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <SafeImage
                      src={rel.cover_url || ASSETS.releaseFallback}
                      fallbackSrc={ASSETS.releaseFallback}
                      alt={rel.title}
                      className="w-11 h-11 rounded object-cover border border-zinc-800 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{rel.title}</p>
                      <p className="text-xs text-zinc-400 truncate">
                        {rel.release_type} · {rel.track_count ?? 0} track{(rel.track_count ?? 0) === 1 ? '' : 's'} ·{' '}
                        <span className="font-mono tabular-nums">{formatDateDDMMYYYY(rel.release_date)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusText status={rel.status} />
                    {rel.smart_link_slug && (
                      <button
                        type="button"
                        onClick={() => onNavigate('public-smart-link', { smartLinkSlug: rel.smart_link_slug })}
                        title="Open Smart Link"
                        className="p-2 text-zinc-400 hover:text-[#E5C158] cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-xl border border-zinc-700/70 bg-[#0B0B0F]/78 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800/90 flex items-center justify-between gap-4">
            <h3 className="font-display text-base font-semibold text-zinc-100">Verified Royalty Statements</h3>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-medium text-[#E5C158] hover:underline cursor-pointer"
            >
              Ledger
            </button>
          </div>

          <div className="px-6 py-4 bg-[#09090B]/60 border-b border-zinc-800/80 flex items-center justify-between">
            <span className="text-xs text-zinc-300">Available for Payout</span>
            <span className="font-mono text-base font-semibold text-[#E5C158] tabular-nums">
              {formatINR(metrics.availableBalance)}
            </span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-10 bg-zinc-900 rounded animate-pulse" />
              <div className="h-10 bg-zinc-900 rounded animate-pulse" />
            </div>
          ) : recentRoyalties.length === 0 ? (
            <div className="p-8 text-center">
              <Wallet className="w-8 h-8 text-zinc-600 mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-zinc-200 mb-1">No royalty statements posted</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Earnings are credited strictly from verified store reports once your releases are live and streaming
                statements settle.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {recentRoyalties.map((entry) => (
                <div key={entry.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{entry.store_name}</p>
                    <p className="text-xs text-zinc-400 truncate">
                      {entry.period} · <span className="font-mono tabular-nums">{entry.streams.toLocaleString()}</span>{' '}
                      streams
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-emerald-400 tabular-nums shrink-0">
                    +{formatINR(entry.amount_inr)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
