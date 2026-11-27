import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Database,
  Disc3,
  Download,
  Eye,
  EyeOff,
  FileSignature,
  Globe,
  Layers,
  LifeBuoy,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { SafeImage } from '../components/SafeImage.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { ASSETS, SUPPORTED_STORES, formatBytes, formatDateDDMMYYYY, formatINR, getLocalTodayIso } from '../lib/assets.ts';
import type {
  AdminArtistKycDetail,
  AgreementStatus,
  AppView,
  ArtistBalanceSummary,
  ArtistServiceRequest,
  DistributionPlatformConfig,
  LoginHistoryItem,
  PayoutRequest,
  PlatformDeliveryItem,
  PlatformDeliveryStatus,
  ReleaseChangeRequest,
  ReleaseItem,
  ReleaseStatus,
  RoyaltyEntry,
  SiteSettings,
  SongAgreementItem,
  SupportChatMessage,
  SupportTicket,
  SystemBackupItem,
} from '../types.ts';

interface AdminMetrics {
  totalArtists: number;
  totalReleases: number;
  pendingReleases: number;
  approvedReleases: number;
  liveReleases: number;
  rejectedReleases: number;
  totalSongs: number;
  verifiedRoyaltiesTotal: number;
  pendingPayoutRequests: number;
  openSupportTickets: number;
}

interface AdminArtistRow {
  id: number;
  full_name: string;
  stage_name: string;
  country: string;
  mobile: string;
  email: string;
  payout_method: string;
  payout_details: string;
  verification_status?: string;
  verification_doc_url?: string;
  verification_notes?: string;
  kyc_status?: string;
  aadhaar_masked?: string;
  pan_masked?: string;
  full_address?: string;
  consent_timestamp?: string;
  has_aadhaar_front?: boolean;
  has_aadhaar_back?: boolean;
  has_pan_card?: boolean;
  otp_verified?: number;
  account_protected?: number;
  created_at: string;
  release_count: number;
  song_count: number;
  balance: ArtistBalanceSummary;
}

type AdminTab =
  | 'releases'
  | 'agreements'
  | 'artists'
  | 'platforms'
  | 'royalties'
  | 'payouts'
  | 'services'
  | 'support'
  | 'website-security';

interface AdminDashboardPageProps {
  onNavigate: (view: AppView) => void;
}

export function AdminDashboardPage({ onNavigate }: AdminDashboardPageProps) {
  const { token } = useAuth();
  const [tab, setTab] = useState<AdminTab>('releases');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalArtists: 0,
    totalReleases: 0,
    pendingReleases: 0,
    approvedReleases: 0,
    liveReleases: 0,
    rejectedReleases: 0,
    totalSongs: 0,
    verifiedRoyaltiesTotal: 0,
    pendingPayoutRequests: 0,
    openSupportTickets: 0,
  });

  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [releaseRequests, setReleaseRequests] = useState<ReleaseChangeRequest[]>([]);
  const [artists, setArtists] = useState<AdminArtistRow[]>([]);
  const [platforms, setPlatforms] = useState<DistributionPlatformConfig[]>([]);
  const [royalties, setRoyalties] = useState<RoyaltyEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ArtistServiceRequest[]>([]);
  const [chatMessages, setChatMessages] = useState<SupportChatMessage[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [backups, setBackups] = useState<SystemBackupItem[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({
    brand_tagline: '',
    announcement_banner: '',
    latest_update_text: '',
    whatsapp_number: '',
    support_phone: '',
    support_email: '',
  });

  // Release review editor state
  const [editingReleaseId, setEditingReleaseId] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReleaseStatus>('Pending Review');
  const [reviewUpc, setReviewUpc] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [trackIsrcs, setTrackIsrcs] = useState<Record<number, string>>({});
  const [platformDrafts, setPlatformDrafts] = useState<Record<string, PlatformDeliveryItem>>({});
  const [savingPlatforms, setSavingPlatforms] = useState(false);

  // Release change request admin note map
  const [changeReqNoteMap, setChangeReqNoteMap] = useState<Record<number, string>>({});
  // Artist verification note & private KYC inspector state
  const [artistVerifyNoteMap, setArtistVerifyNoteMap] = useState<Record<number, string>>({});
  const [inspectingKycArtistId, setInspectingKycArtistId] = useState<number | null>(null);
  const [inspectedKyc, setInspectedKyc] = useState<AdminArtistKycDetail | null>(null);
  const [loadingKycDetail, setLoadingKycDetail] = useState(false);
  const [revealSensitiveKyc, setRevealSensitiveKyc] = useState(false);
  const [kycDocModal, setKycDocModal] = useState<{ title: string; url: string; mime: string } | null>(null);

  // Single Song Agreements state
  const [agreements, setAgreements] = useState<SongAgreementItem[]>([]);
  const [agreementFilter, setAgreementFilter] = useState<'All' | AgreementStatus>('All');
  const [agreementNoteMap, setAgreementNoteMap] = useState<Record<number, string>>({});
  const [uploadingSignedAgId, setUploadingSignedAgId] = useState<number | null>(null);

  // Platform add form
  const [newPlatformName, setNewPlatformName] = useState('');
  const [newPlatformCategory, setNewPlatformCategory] = useState('Global DSP');
  const [newPlatformNotes, setNewPlatformNotes] = useState('');

  // Royalty posting state
  const [royaltyArtistId, setRoyaltyArtistId] = useState<string>('');
  const [royaltyReleaseId, setRoyaltyReleaseId] = useState<string>('');
  const [royaltyStore, setRoyaltyStore] = useState<string>(SUPPORTED_STORES[0]);
  const [royaltyPeriod, setRoyaltyPeriod] = useState(() => getLocalTodayIso().slice(0, 7));
  const [royaltyEntryDate, setRoyaltyEntryDate] = useState(() => getLocalTodayIso());
  const [royaltyStreams, setRoyaltyStreams] = useState('0');
  const [royaltyAmount, setRoyaltyAmount] = useState('');
  const [royaltyNote, setRoyaltyNote] = useState('');

  // Payout edit state
  const [payoutRefMap, setPayoutRefMap] = useState<Record<number, string>>({});
  // Support reply state
  const [ticketReplyMap, setTicketReplyMap] = useState<Record<number, string>>({});
  const [chatReplyMap, setChatReplyMap] = useState<Record<string, string>>({});
  // Service note map
  const [serviceNoteMap, setServiceNoteMap] = useState<Record<number, string>>({});
  // Notification broadcast
  const [notifTargetArtistId, setNotifTargetArtistId] = useState<string>('');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');

  const loadAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ov, rels, reqs, agrs, arts, plats, roys, pays, sups, svcs, chat, sec, sett] = await Promise.all([
        apiFetch<{ metrics: AdminMetrics }>('/api/admin/overview', { token }),
        apiFetch<{ releases: ReleaseItem[] }>('/api/admin/releases', { token }),
        apiFetch<{ requests: ReleaseChangeRequest[] }>('/api/admin/release-requests', { token }),
        apiFetch<{ agreements: SongAgreementItem[] }>('/api/admin/agreements', { token }),
        apiFetch<{ artists: AdminArtistRow[] }>('/api/admin/artists', { token }),
        apiFetch<{ platforms: DistributionPlatformConfig[] }>('/api/admin/platforms', { token }),
        apiFetch<{ entries: RoyaltyEntry[] }>('/api/admin/royalties', { token }),
        apiFetch<{ payouts: PayoutRequest[] }>('/api/admin/payouts', { token }),
        apiFetch<{ tickets: SupportTicket[] }>('/api/admin/support', { token }),
        apiFetch<{ services: ArtistServiceRequest[] }>('/api/admin/services', { token }),
        apiFetch<{ messages: SupportChatMessage[] }>('/api/admin/support/chat', { token }),
        apiFetch<{ loginHistory: LoginHistoryItem[]; backups: SystemBackupItem[] }>('/api/admin/security', { token }),
        apiFetch<{ settings: SiteSettings }>('/api/site-settings'),
      ]);
      setMetrics(ov.metrics);
      setReleases(rels.releases);
      setReleaseRequests(reqs.requests || []);
      setAgreements(agrs.agreements || []);
      setArtists(arts.artists);
      setPlatforms(plats.platforms || []);
      setRoyalties(roys.entries);
      setPayouts(pays.payouts);
      setTickets(sups.tickets);
      setServiceRequests(svcs.services || []);
      setChatMessages(chat.messages || []);
      setLoginHistory(sec.loginHistory || []);
      setBackups(sec.backups || []);
      if (sett.settings) setSiteSettings(sett.settings);
      if (arts.artists.length > 0 && !royaltyArtistId) {
        setRoyaltyArtistId(String(arts.artists[0].id));
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load admin console.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [token]);

  useEffect(() => {
    return () => {
      if (kycDocModal?.url) URL.revokeObjectURL(kycDocModal.url);
    };
  }, [kycDocModal]);

  const agreementByTrackId = useMemo(() => {
    const map = new Map<number, SongAgreementItem>();
    for (const ag of agreements) {
      map.set(ag.track_id, ag);
    }
    return map;
  }, [agreements]);

  const filteredAgreements = useMemo(() => {
    if (agreementFilter === 'All') return agreements;
    return agreements.filter((ag) => ag.status === agreementFilter);
  }, [agreements, agreementFilter]);

  const sha256Counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of releases) {
      for (const t of r.tracks || []) {
        if (t.audio_sha256) {
          map.set(t.audio_sha256, (map.get(t.audio_sha256) || 0) + 1);
        }
      }
    }
    return map;
  }, [releases]);

  const chatThreads = useMemo(() => {
    const map = new Map<string, SupportChatMessage[]>();
    for (const msg of [...chatMessages].reverse()) {
      const list = map.get(msg.session_key) || [];
      list.push(msg);
      map.set(msg.session_key, list);
    }
    return Array.from(map.entries());
  }, [chatMessages]);

  const openReleaseReview = (rel: ReleaseItem) => {
    setEditingReleaseId(rel.id);
    setReviewStatus(rel.status);
    setReviewUpc(rel.upc || '');
    setReviewNotes(rel.admin_notes || '');
    const map: Record<number, string> = {};
    (rel.tracks || []).forEach((t) => {
      map[t.id] = t.isrc || '';
    });
    setTrackIsrcs(map);

    const pMap: Record<string, PlatformDeliveryItem> = {};
    (rel.platform_deliveries || []).forEach((pd) => {
      pMap[pd.platform_name] = { ...pd };
    });
    setPlatformDrafts(pMap);
  };

  const updatePlatformDraft = (platformName: string, patch: Partial<PlatformDeliveryItem>) => {
    setPlatformDrafts((prev) => {
      const current = prev[platformName];
      if (!current) return prev;
      return {
        ...prev,
        [platformName]: { ...current, ...patch },
      };
    });
  };

  const savePlatforms = async (releaseId: number, singlePlatform?: string) => {
    if (!token) return;
    setFeedback(null);
    const items = singlePlatform
      ? [platformDrafts[singlePlatform]].filter(Boolean)
      : Object.values(platformDrafts);

    for (const item of items) {
      if (item.delivery_status === 'LIVE' && (!item.partner_name.trim() || !item.partner_confirmation_id.trim())) {
        setFeedback({
          type: 'error',
          text: `${item.platform_name} cannot be marked LIVE without a real Distribution Partner Name and Confirmation ID.`,
        });
        return;
      }
    }

    setSavingPlatforms(true);
    try {
      const res = await apiFetch<{ platform_deliveries: PlatformDeliveryItem[] }>(
        `/api/admin/releases/${releaseId}/platforms`,
        {
          method: 'PATCH',
          token,
          body: {
            updates: items.map((item) => ({
              platformName: item.platform_name,
              deliveryStatus: item.delivery_status,
              partnerName: item.partner_name,
              partnerConfirmationId: item.partner_confirmation_id,
              liveUrl: item.live_url,
            })),
          },
        }
      );

      setReleases((prev) =>
        prev.map((r) => (r.id === releaseId ? { ...r, platform_deliveries: res.platform_deliveries } : r))
      );
      const nextMap: Record<string, PlatformDeliveryItem> = {};
      res.platform_deliveries.forEach((pd) => {
        nextMap[pd.platform_name] = { ...pd };
      });
      setPlatformDrafts(nextMap);
      setFeedback({
        type: 'success',
        text: singlePlatform
          ? `${singlePlatform} delivery status updated for Release #${releaseId}.`
          : `All platform delivery statuses updated for Release #${releaseId}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update platform status.' });
    } finally {
      setSavingPlatforms(false);
    }
  };

  const saveReleaseReview = async (releaseId: number) => {
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/releases/${releaseId}/status`, {
        method: 'PATCH',
        token,
        body: {
          status: reviewStatus,
          upc: reviewUpc,
          adminNotes: reviewNotes,
          trackIsrcs: Object.entries(trackIsrcs).map(([id, isrc]) => ({ id: Number(id), isrc })),
        },
      });
      setEditingReleaseId(null);
      setFeedback({ type: 'success', text: `Release #${releaseId} updated to ${reviewStatus}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update release.' });
    }
  };

  const handleRecordRoyalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch('/api/admin/royalties', {
        method: 'POST',
        token,
        body: {
          artistId: Number(royaltyArtistId),
          releaseId: royaltyReleaseId ? Number(royaltyReleaseId) : null,
          storeName: royaltyStore,
          period: royaltyPeriod,
          entryDate: royaltyEntryDate,
          streams: Number(royaltyStreams),
          amountInr: Number(royaltyAmount),
          referenceNote: royaltyNote,
        },
      });
      setRoyaltyAmount('');
      setRoyaltyNote('');
      setFeedback({ type: 'success', text: 'Verified royalty statement credited to artist ledger.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not post royalty statement.' });
    }
  };

  const handlePayoutAction = async (payoutId: number, status: 'Processing' | 'Paid' | 'Declined') => {
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/payouts/${payoutId}`, {
        method: 'PATCH',
        token,
        body: {
          status,
          adminReference: payoutRefMap[payoutId] || '',
        },
      });
      setFeedback({ type: 'success', text: `Payout #${payoutId} marked ${status}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not update payout.' });
    }
  };

  const handleSupportAction = async (ticketId: number, status: 'Open' | 'In Progress' | 'Resolved') => {
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/support/${ticketId}`, {
        method: 'PATCH',
        token,
        body: {
          status,
          adminReply: ticketReplyMap[ticketId] ?? '',
        },
      });
      setFeedback({ type: 'success', text: `Ticket #${ticketId} updated to ${status}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not update support ticket.' });
    }
  };

  const handleArtistVerification = async (artistId: number, verificationStatus: 'Verified' | 'Rejected') => {
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/artists/${artistId}/verification`, {
        method: 'PATCH',
        token,
        body: {
          verificationStatus,
          notes: artistVerifyNoteMap[artistId] || '',
        },
      });
      setFeedback({ type: 'success', text: `Artist #${artistId} profile verification set to ${verificationStatus}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not update verification.' });
    }
  };

  const handleReleaseChangeRequest = async (id: number, status: 'Approved' | 'Completed' | 'Rejected') => {
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/release-requests/${id}`, {
        method: 'PATCH',
        token,
        body: {
          status,
          adminNotes: changeReqNoteMap[id] || '',
        },
      });
      setFeedback({ type: 'success', text: `Release request #${id} marked ${status}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not update release request.' });
    }
  };

  const handleTogglePlatform = async (plat: DistributionPlatformConfig) => {
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/platforms/${plat.id}`, {
        method: 'PATCH',
        token,
        body: {
          isEnabled: plat.is_enabled === 0,
          partnerNotes: plat.partner_notes || '',
        },
      });
      setFeedback({
        type: 'success',
        text: `${plat.name} ${plat.is_enabled === 0 ? 'enabled' : 'disabled'} for artist release submissions.`,
      });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not update platform.' });
    }
  };

  const handleAddPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch('/api/admin/platforms', {
        method: 'POST',
        token,
        body: {
          name: newPlatformName,
          category: newPlatformCategory,
          partnerNotes: newPlatformNotes,
        },
      });
      setNewPlatformName('');
      setNewPlatformNotes('');
      setFeedback({ type: 'success', text: 'New music distribution platform added.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not add platform.' });
    }
  };

  const handleServiceAction = async (
    id: number,
    status: 'In Review' | 'Active' | 'Completed' | 'Declined'
  ) => {
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/services/${id}`, {
        method: 'PATCH',
        token,
        body: {
          status,
          adminNotes: serviceNoteMap[id] || '',
        },
      });
      setFeedback({ type: 'success', text: `Service request #${id} updated to ${status}.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not update service request.' });
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    try {
      const res = await apiFetch<{ sentCount: number }>('/api/admin/notifications/broadcast', {
        method: 'POST',
        token,
        body: {
          artistId: notifTargetArtistId ? Number(notifTargetArtistId) : null,
          title: notifTitle,
          message: notifMessage,
        },
      });
      setNotifTitle('');
      setNotifMessage('');
      setFeedback({ type: 'success', text: `Notification dispatched to ${res.sentCount} artist account(s).` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not send notification.' });
    }
  };

  const handleSendChatReply = async (sessionKey: string) => {
    if (!token) return;
    const msg = (chatReplyMap[sessionKey] || '').trim();
    if (!msg) return;
    setFeedback(null);
    try {
      await apiFetch('/api/admin/support/chat', {
        method: 'POST',
        token,
        body: { sessionKey, message: msg },
      });
      setChatReplyMap((prev) => ({ ...prev, [sessionKey]: '' }));
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not send live chat reply.' });
    }
  };

  const handleSaveSiteSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    try {
      await apiFetch('/api/admin/site-settings', {
        method: 'PUT',
        token,
        body: siteSettings,
      });
      setFeedback({ type: 'success', text: 'Website settings & latest announcement updated live.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not save website settings.' });
    }
  };

  const handleCreateBackup = async () => {
    if (!token) return;
    setFeedback(null);
    try {
      const res = await apiFetch<{ backup: SystemBackupItem }>('/api/admin/backups', {
        method: 'POST',
        token,
      });
      setFeedback({ type: 'success', text: `Manual backup created: ${res.backup.filename}` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Backup creation failed.' });
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not download backup file.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Backup download failed.' });
    }
  };

  const downloadProtectedPdf = async (url: string, filename: string) => {
    if (!token) return;
    setFeedback(null);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not download PDF document.');
      const blob = await response.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'PDF download failed.' });
    }
  };

  const handleGenerateAgreementForTrack = async (trackId: number) => {
    if (!token) return;
    setFeedback(null);
    try {
      const res = await apiFetch<{ agreement: SongAgreementItem }>(`/api/admin/agreements/generate/${trackId}`, {
        method: 'POST',
        token,
      });
      setAgreements((prev) => {
        const exists = prev.some((ag) => ag.id === res.agreement.id);
        return exists
          ? prev.map((ag) => (ag.id === res.agreement.id ? res.agreement : ag))
          : [res.agreement, ...prev];
      });
      setFeedback({
        type: 'success',
        text: `Agreement ${res.agreement.agreement_code} generated for "${res.agreement.song_title}".`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to generate agreement.' });
    }
  };

  const handleUpdateAgreementStatus = async (
    agreementId: number,
    status: AgreementStatus,
    sentVia?: string
  ) => {
    if (!token) return;
    setFeedback(null);
    try {
      const res = await apiFetch<{ agreement: SongAgreementItem }>(`/api/admin/agreements/${agreementId}/status`, {
        method: 'PATCH',
        token,
        body: {
          status,
          sentVia: sentVia || '',
          adminNotes: agreementNoteMap[agreementId] ?? '',
        },
      });
      setAgreements((prev) => prev.map((ag) => (ag.id === agreementId ? res.agreement : ag)));
      setFeedback({
        type: 'success',
        text: `Agreement ${res.agreement.agreement_code} updated to ${status}${sentVia ? ` via ${sentVia}` : ''}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update agreement status.' });
    }
  };

  const handleAdminUploadSignedPdf = async (agreementId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploadingSignedAgId(agreementId);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch<{ agreement: SongAgreementItem }>(`/api/agreements/${agreementId}/signed-pdf`, {
        method: 'POST',
        token,
        body: fd,
        isFormData: true,
      });
      setAgreements((prev) => prev.map((ag) => (ag.id === agreementId ? res.agreement : ag)));
      setFeedback({
        type: 'success',
        text: `Signed Agreement PDF attached for ${res.agreement.agreement_code} (${res.agreement.status}).`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Signed PDF upload failed.' });
    } finally {
      setUploadingSignedAgId(null);
      e.target.value = '';
    }
  };

  const handleInspectArtistKyc = async (artistId: number) => {
    if (inspectingKycArtistId === artistId) {
      setInspectingKycArtistId(null);
      setInspectedKyc(null);
      setRevealSensitiveKyc(false);
      return;
    }
    if (!token) return;
    setInspectingKycArtistId(artistId);
    setRevealSensitiveKyc(false);
    setLoadingKycDetail(true);
    try {
      const res = await apiFetch<{ kyc: AdminArtistKycDetail }>(`/api/admin/kyc/${artistId}`, { token });
      setInspectedKyc(res.kyc);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not inspect private KYC.' });
    } finally {
      setLoadingKycDetail(false);
    }
  };

  const openAdminPrivateKycModal = async (
    artistId: number,
    slot: 'aadhaar_front' | 'aadhaar_back' | 'pan_card',
    title: string
  ) => {
    if (!token) return;
    setFeedback(null);
    try {
      const response = await fetch(`/api/private-docs/kyc/${artistId}/${slot}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not open private KYC document.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setKycDocModal((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { title, url, mime: blob.type || 'image/jpeg' };
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not view KYC file.' });
    }
  };

  const buildWhatsAppAgreementHref = (ag: SongAgreementItem) => {
    const cleanDigits = String(ag.artist_mobile || '').replace(/\D/g, '');
    const waDigits = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
    const text = `Hello ${ag.artist_name}, your Single Song Agreement (${ag.agreement_code}) for "${ag.song_title}" with ANGAD MUSIC DISTRIBUTOR (PALAMU ENTERTAINMENT INDUSTRY) is ready. Please download the Agreement PDF from your dashboard under My Releases, sign it, and upload the signed PDF. Date: ${ag.agreement_date}.`;
    return `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`;
  };

  const buildEmailAgreementHref = (ag: SongAgreementItem) => {
    const subject = `Single Song Agreement (${ag.agreement_code}) - ${ag.song_title} | ANGAD MUSIC DISTRIBUTOR`;
    const body = `Dear ${ag.artist_name},\n\nYour Single Song Distribution Agreement (${ag.agreement_code}) for "${ag.song_title}" (Singer: ${ag.singer_name}, Label: ${ag.label_name}) has been generated by ANGAD MUSIC DISTRIBUTOR / PALAMU ENTERTAINMENT INDUSTRY.\n\nPlease log in to your Artist Dashboard -> My Releases, download the Agreement PDF, affix your signature, and upload the signed PDF for final approval.\n\nRegards,\nPALAMU ENTERTAINMENT INDUSTRY\nPhone: 9939149838`;
    return `mailto:${ag.artist_email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const artistReleasesForRoyalty = releases.filter((r) => String(r.artist_id) === royaltyArtistId);
  const storeOptions = platforms.length > 0 ? platforms.map((p) => p.name) : [...SUPPORTED_STORES];

  return (
    <DashboardLayout
      currentView="admin-dashboard"
      onNavigate={onNavigate}
      title="Label Administrator Console"
      actionButton={
        <button
          type="button"
          onClick={loadAll}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-md text-xs font-medium bg-[#111114] border border-zinc-800 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>Refresh</span>
        </button>
      }
    >
      {feedback && (
        <div
          className={`mb-6 p-4 rounded-lg border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Admin Private KYC Document Modal */}
      {kycDocModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-[#111114] overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#E5C158]" />
                <h3 className="text-sm font-semibold text-zinc-100">{kycDocModal.title} (Confidential Admin View)</h3>
              </div>
              <button
                type="button"
                onClick={() => setKycDocModal(null)}
                className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 cursor-pointer"
                aria-label="Close private document preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-[#09090B] flex items-center justify-center max-h-[75vh] overflow-auto">
              {kycDocModal.mime.includes('pdf') ? (
                <iframe src={kycDocModal.url} title={kycDocModal.title} className="w-full h-[65vh] rounded" />
              ) : (
                <img src={kycDocModal.url} alt={kycDocModal.title} className="max-h-[65vh] rounded object-contain" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Label Brand Identity Header */}
      <div className="mb-6 p-4 sm:p-5 rounded-xl border border-[#D4AF37]/30 bg-[#111114] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <SafeImage
            src={ASSETS.brandEmblem}
            alt="ANGAD MUSIC DISTRIBUTOR logo"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-contain bg-black border border-[#D4AF37]/45 p-0.5 shrink-0 shadow-[0_0_20px_rgba(212,175,55,0.16)]"
          />
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-100 truncate">
              ANGAD MUSIC DISTRIBUTOR
            </h2>
            <p className="text-xs text-[#E5C158] truncate">
              PALAMU ENTERTAINMENT INDUSTRY · Label Control &amp; Store Verification
            </p>
          </div>
        </div>
        <div className="text-xs text-zinc-400 sm:text-right shrink-0">
          <div className="font-mono text-zinc-200">9939149838</div>
          <div className="truncate">palamuentertainmentindustry@gmail.com</div>
        </div>
      </div>

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Artists', value: metrics.totalArtists },
          { label: 'Pending Review', value: metrics.pendingReleases },
          { label: 'Live Releases', value: metrics.liveReleases },
          { label: 'Total Songs', value: metrics.totalSongs },
          { label: 'Verified Royalties', value: formatINR(metrics.verifiedRoyaltiesTotal) },
          { label: 'Open Tickets', value: metrics.openSupportTickets },
        ].map((k) => (
          <div key={k.label} className="p-4 rounded-xl border border-zinc-800 bg-[#111114]">
            <p className="text-xs text-zinc-400 mb-1.5 truncate">{k.label}</p>
            <p className="font-mono text-xl font-semibold text-zinc-100 tabular-nums truncate">
              {loading ? '—' : k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Console Sub-Navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg mb-6 w-fit max-w-full overflow-x-auto">
        {[
          { id: 'releases' as const, label: `Releases (${releases.length})`, icon: Disc3 },
          { id: 'agreements' as const, label: `Agreements (${agreements.length})`, icon: FileSignature },
          { id: 'artists' as const, label: `Artists & KYC (${artists.length})`, icon: Users },
          { id: 'platforms' as const, label: `Platforms (${platforms.length})`, icon: Layers },
          { id: 'royalties' as const, label: 'Royalty Ledger', icon: Wallet },
          { id: 'payouts' as const, label: `Payouts (${payouts.length})`, icon: Check },
          { id: 'services' as const, label: `Services & Alerts (${serviceRequests.length})`, icon: Sparkles },
          { id: 'support' as const, label: `Support & Chat (${tickets.length})`, icon: LifeBuoy },
          { id: 'website-security' as const, label: 'Website & Security', icon: Shield },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[38px] rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                active ? 'bg-[#D4AF37] text-[#09090B] font-semibold' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: RELEASE QUEUE */}
      {tab === 'releases' && (
        <div className="space-y-4">
          {releases.length === 0 ? (
            <div className="p-10 rounded-xl border border-zinc-800 bg-[#111114] text-center text-sm text-zinc-400">
              No artist releases have been submitted yet.
            </div>
          ) : (
            releases.map((rel) => {
              const isEditing = editingReleaseId === rel.id;
              return (
                <div key={rel.id} className="rounded-xl border border-zinc-800 bg-[#111114] p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <SafeImage
                        src={rel.cover_url || ASSETS.releaseFallback}
                        fallbackSrc={ASSETS.releaseFallback}
                        alt={rel.title}
                        className="w-14 h-14 rounded-md object-cover border border-zinc-800 shrink-0"
                      />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="font-display text-base font-semibold text-zinc-100">{rel.title}</h3>
                        <StatusText status={rel.status} />
                        {rel.processing_tier === 'Fast Track' && (
                          <span className="text-[11px] font-semibold text-[#E5C158]">Fast Track Priority QC</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400">
                        Artist: {rel.primary_artist} ({rel.artist_email} · {rel.artist_mobile})
                      </p>
                      <p className="text-xs text-zinc-500 font-mono tabular-nums">
                        {rel.release_type} · {rel.release_schedule_mode === 'Instant Request' ? 'Instant Request' : 'Scheduled'} ·{' '}
                        {rel.genre}
                        {rel.subgenre ? ` / ${rel.subgenre}` : ''} · {rel.language} · Date:{' '}
                        {formatDateDDMMYYYY(rel.release_date)} · Cat#: {rel.catalogue_number || '—'} · UPC:{' '}
                        {rel.upc || 'Unassigned'} · Stores:{' '}
                        {(rel.platform_deliveries || []).filter((p) => p.delivery_status === 'LIVE').length} /{' '}
                        {(rel.platform_deliveries || []).length || 15} LIVE
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => (isEditing ? setEditingReleaseId(null) : openReleaseReview(rel))}
                    className="px-4 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#09090B] border border-zinc-700 hover:border-[#D4AF37] text-zinc-100 shrink-0 cursor-pointer"
                  >
                    {isEditing ? 'Close Inspector' : 'Review & Manage'}
                  </button>
                </div>

                {isEditing && (
                  <div className="pt-4 border-t border-zinc-800 space-y-6">
                    {/* Complete Release Metadata & Copyright Inspector */}
                    <div className="p-4 rounded-lg bg-[#09090B] border border-zinc-800 space-y-3">
                      <h4 className="font-display text-xs font-semibold text-[#E5C158] tracking-wide">
                        Release Metadata &amp; Copyright Inspector
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-zinc-500 block">Version / Subtitle</span>
                          <span className="text-zinc-200">{rel.release_version || 'Original'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Featured Artists / Compilation</span>
                          <span className="text-zinc-200">
                            {rel.featured_artists || '—'} · Various Artists: {rel.various_artists ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Genre / Subgenre</span>
                          <span className="text-zinc-200">
                            {rel.genre}
                            {rel.subgenre ? ` · ${rel.subgenre}` : ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Main / Original Release</span>
                          <span className="font-mono text-zinc-200 tabular-nums">
                            {formatDateDDMMYYYY(rel.release_date)} /{' '}
                            {formatDateDDMMYYYY(rel.original_release_date || rel.release_date)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Catalogue # / Label</span>
                          <span className="text-zinc-200">
                            <span className="font-mono">{rel.catalogue_number || '—'}</span> · {rel.label_name}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Production Year / Copyright</span>
                          <span className="text-zinc-200">
                            <span className="font-mono">{rel.production_year || rel.copyright_year || '—'}</span> ·{' '}
                            {rel.copyright_owner || rel.label_name}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Music Director / Producer</span>
                          <span className="text-zinc-200">
                            {[rel.music_director, rel.producer].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Artist Location</span>
                          <span className="text-zinc-200">{rel.artist_country || 'India'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-zinc-500 block">P-Line (Phonographic)</span>
                          <span className="text-zinc-200">{rel.p_line || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-zinc-500 block">C-Line (Composition)</span>
                          <span className="text-zinc-200">{rel.c_line || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-zinc-500 block">Processing Queue Tier</span>
                          <span className={rel.processing_tier === 'Fast Track' ? 'text-[#E5C158] font-semibold' : 'text-zinc-200'}>
                            {rel.processing_tier === 'Fast Track'
                              ? 'Fast Track Release (Priority QC — 4–5 working days estimate*; depends on partner approval)'
                              : 'Standard Queue'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Release QA Status</label>
                        <select
                          value={reviewStatus}
                          onChange={(e) => setReviewStatus(e.target.value as ReleaseStatus)}
                          className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                        >
                          <option value="Pending Review">Pending Review</option>
                          <option value="Approved">Approved</option>
                          <option value="Live">Live</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Assign UPC</label>
                        <input
                          type="text"
                          value={reviewUpc}
                          onChange={(e) => setReviewUpc(e.target.value)}
                          placeholder="12-13 digit UPC"
                          className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B] border border-zinc-800 text-xs font-mono text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Reviewer Notes (Visible to Artist)</label>
                        <input
                          type="text"
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Approval note or rejection reason"
                          className="w-full px-3 py-2 min-h-[40px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-medium text-zinc-300">Tracks, Lyrics &amp; Audio Quality Audit</p>
                      {(rel.tracks || []).map((t) => (
                        <div
                          key={t.id}
                          className="p-4 rounded-md bg-[#09090B] border border-zinc-800 space-y-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-semibold text-zinc-100">
                                  Disc {t.disc_number || 1} · Track {t.track_number}. {t.title}
                                  {t.primary_track_type || t.song_version
                                    ? ` (${t.primary_track_type || t.song_version})`
                                    : ''}
                                </p>
                                {t.is_instrumental === 1 && (
                                  <span className="text-[11px] font-medium text-[#E5C158]">Instrumental</span>
                                )}
                                {(t.parental_advisory === 'Explicit' || t.explicit === 1) && (
                                  <span className="text-[11px] font-medium text-rose-400">
                                    {t.parental_advisory || 'Explicit'}
                                  </span>
                                )}
                                {t.youtube_content_id === 1 && (
                                  <span className="text-[11px] font-medium text-emerald-400">YouTube Content ID: Yes</span>
                                )}
                                {t.audio_quality_status && <StatusText status={t.audio_quality_status} />}
                              </div>
                              <p className="text-[11px] text-zinc-400">
                                Lyrics Language: {t.vocal_language || rel.language} · Advisory:{' '}
                                {t.parental_advisory || (t.explicit ? 'Explicit' : 'Non-Explicit')} · Preview Start:{' '}
                                <span className="font-mono">{t.caller_tune_start_time || '00:00'}</span>
                              </p>
                              <p className="text-[11px] text-zinc-400">
                                Author: {t.author || t.lyricist || '—'} · Composer: {t.composer || '—'} · Remixer:{' '}
                                {t.remixer || '—'} · Music Director: {t.music_director || rel.music_director || '—'} ·
                                Producer: {t.producer || rel.producer || '—'} · Publisher: {t.publisher || '—'}
                              </p>
                              <p className="text-[11px] font-mono text-zinc-400 tabular-nums">
                                Duration: {t.duration_seconds ? `${Math.floor(t.duration_seconds / 60)}:${String(t.duration_seconds % 60).padStart(2, '0')}` : '—'}
                                {t.audio_sample_rate ? ` · ${(t.audio_sample_rate / 1000).toFixed(1).replace(/\.0$/, '')} kHz` : ''}
                                {t.audio_bit_depth ? ` · ${t.audio_bit_depth}-bit` : ''}
                                {t.audio_channels ? ` · ${t.audio_channels === 2 ? 'Stereo' : t.audio_channels === 1 ? 'Mono' : `${t.audio_channels}ch`}` : ''}
                                {t.audio_size_bytes ? ` · ${(t.audio_size_bytes / (1024 * 1024)).toFixed(2)} MB` : ''}
                              </p>
                              {t.audio_quality_notes && (
                                <p className="text-[11px] text-zinc-500">{t.audio_quality_notes}</p>
                              )}
                              {t.audio_sha256 && (
                                <p className="text-[11px] font-mono text-zinc-500">
                                  SHA-256: {t.audio_sha256.slice(0, 16)}...
                                  {(sha256Counts.get(t.audio_sha256) || 0) > 1 && (
                                    <span className="ml-2 text-amber-400 font-sans font-semibold">
                                      Duplicate Master Detected Across Catalog ({sha256Counts.get(t.audio_sha256)} matches)
                                    </span>
                                  )}
                                </p>
                              )}
                              {t.artist_roles && t.artist_roles.length > 0 && (
                                <p className="text-[11px] text-zinc-400">
                                  Artist Roles: {t.artist_roles.map((r) => `${r.name} (${r.role})`).join(' · ')}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                              <input
                                type="text"
                                value={trackIsrcs[t.id] ?? ''}
                                onChange={(e) => setTrackIsrcs((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                placeholder="Assign ISRC"
                                className="w-36 px-2.5 py-1.5 rounded bg-[#111114] border border-zinc-800 text-xs font-mono text-zinc-100"
                              />
                              {t.audio_url && <audio controls src={t.audio_url} className="h-8 max-w-[200px]" />}
                            </div>
                          </div>

                          {(t.lyrics_text || t.lyrics_url) && (
                            <div className="pt-2 border-t border-zinc-800/80 space-y-1.5 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-zinc-300">Lyrics Sheet</span>
                                {t.lyrics_url && (
                                  <a
                                    href={t.lyrics_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-[#E5C158] hover:underline"
                                  >
                                    Download {t.lyrics_filename || 'Lyrics File'}
                                  </a>
                                )}
                              </div>
                              {t.lyrics_text && (
                                <pre className="p-2.5 rounded bg-[#111114] border border-zinc-800 text-[11px] text-zinc-300 whitespace-pre-wrap max-h-36 overflow-y-auto font-sans">
                                  {t.lyrics_text}
                                </pre>
                              )}
                            </div>
                          )}

                          {/* Track Single Song Agreement Bar */}
                          {(() => {
                            const ag = agreementByTrackId.get(t.id);
                            return (
                              <div className="pt-2.5 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                  <FileSignature className="w-3.5 h-3.5 text-[#E5C158]" />
                                  <span className="font-medium text-zinc-200">Single Song Agreement:</span>
                                  {ag ? (
                                    <>
                                      <span className="font-mono text-[11px] text-zinc-400">{ag.agreement_code}</span>
                                      <StatusText status={ag.status} />
                                    </>
                                  ) : (
                                    <span className="text-zinc-500">Not generated yet</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {!ag ? (
                                    <button
                                      type="button"
                                      onClick={() => handleGenerateAgreementForTrack(t.id)}
                                      className="px-2.5 py-1.5 rounded bg-[#D4AF37] text-[#09090B] text-[11px] font-semibold cursor-pointer"
                                    >
                                      Generate Song Agreement PDF
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          downloadProtectedPdf(
                                            `/api/agreements/${ag.id}/pdf`,
                                            `${ag.agreement_code}_${ag.song_title.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`
                                          )
                                        }
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-[11px] text-zinc-200 cursor-pointer"
                                      >
                                        <Download className="w-3 h-3 text-[#D4AF37]" />
                                        <span>Download PDF</span>
                                      </button>
                                      <a
                                        href={buildWhatsAppAgreementHref(ag)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => handleUpdateAgreementStatus(ag.id, 'Sent', 'WhatsApp')}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-950/50 border border-emerald-700/60 text-[11px] text-emerald-300"
                                      >
                                        <Send className="w-3 h-3" />
                                        <span>WhatsApp</span>
                                      </a>
                                      <a
                                        href={buildEmailAgreementHref(ag)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => handleUpdateAgreementStatus(ag.id, 'Sent', 'Email')}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-sky-950/50 border border-sky-700/60 text-[11px] text-sky-300"
                                      >
                                        <Mail className="w-3 h-3" />
                                        <span>Email</span>
                                      </a>
                                      {ag.status !== 'Approved' && (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateAgreementStatus(ag.id, 'Approved')}
                                          className="px-2.5 py-1.5 rounded bg-[#D4AF37] text-[#09090B] text-[11px] font-semibold cursor-pointer"
                                        >
                                          Approve Agreement
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => saveReleaseReview(rel.id)}
                        className="px-5 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                      >
                        Save Release Decision
                      </button>
                    </div>

                      {/* Per-Platform Delivery Verification */}
                      <div className="pt-5 border-t border-zinc-800 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="font-display text-sm font-semibold text-zinc-100">
                              Per-Platform Distribution Verification ({Object.keys(platformDrafts).length} Stores)
                            </h4>
                            <p className="text-xs text-zinc-400">
                              LIVE requires a real Distribution Partner Name and Confirmation ID. Delivery is never
                              simulated.
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={savingPlatforms}
                            onClick={() => savePlatforms(rel.id)}
                            className="px-4 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 self-start sm:self-center shrink-0 cursor-pointer"
                          >
                            {savingPlatforms ? 'Saving...' : 'Save All Platforms'}
                          </button>
                        </div>

                        <div className="space-y-3">
                          {Object.keys(platformDrafts).map((storeName) => {
                            const pd = platformDrafts[storeName];
                            if (!pd) return null;
                            return (
                              <div
                                key={storeName}
                                className="p-3.5 rounded-lg bg-[#09090B] border border-zinc-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                              >
                                <div className="md:col-span-2 flex items-center justify-between md:block">
                                  <p className="text-xs font-semibold text-zinc-100">{storeName}</p>
                                  <div className="mt-1">
                                    <StatusText status={pd.delivery_status} />
                                  </div>
                                </div>

                                <div className="md:col-span-2">
                                  <select
                                    aria-label={`${storeName} delivery status`}
                                    value={pd.delivery_status}
                                    onChange={(e) =>
                                      updatePlatformDraft(storeName, {
                                        delivery_status: e.target.value as PlatformDeliveryStatus,
                                      })
                                    }
                                    className="w-full px-2.5 py-2 min-h-[38px] rounded bg-[#111114] border border-zinc-800 text-xs text-zinc-100"
                                  >
                                    <option value="Not Submitted">Not Submitted</option>
                                    <option value="Queued for Partner">Queued for Partner</option>
                                    <option value="In Review">In Review</option>
                                    <option value="LIVE">LIVE</option>
                                    <option value="Rejected">Rejected</option>
                                    <option value="Takedown">Takedown</option>
                                  </select>
                                </div>

                                <div className="md:col-span-2">
                                  <input
                                    type="text"
                                    aria-label={`${storeName} partner name`}
                                    value={pd.partner_name}
                                    onChange={(e) =>
                                      updatePlatformDraft(storeName, { partner_name: e.target.value })
                                    }
                                    placeholder="Partner Name"
                                    className="w-full px-2.5 py-2 min-h-[38px] rounded bg-[#111114] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600"
                                  />
                                </div>

                                <div className="md:col-span-2">
                                  <input
                                    type="text"
                                    aria-label={`${storeName} confirmation ID`}
                                    value={pd.partner_confirmation_id}
                                    onChange={(e) =>
                                      updatePlatformDraft(storeName, { partner_confirmation_id: e.target.value })
                                    }
                                    placeholder="Confirmation ID"
                                    className="w-full px-2.5 py-2 min-h-[38px] rounded bg-[#111114] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600"
                                  />
                                </div>

                                <div className="md:col-span-3">
                                  <input
                                    type="url"
                                    aria-label={`${storeName} live URL`}
                                    value={pd.live_url}
                                    onChange={(e) => updatePlatformDraft(storeName, { live_url: e.target.value })}
                                    placeholder="Verified https:// store URL"
                                    className="w-full px-2.5 py-2 min-h-[38px] rounded bg-[#111114] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600"
                                  />
                                </div>

                                <div className="md:col-span-1 flex justify-end">
                                  <button
                                    type="button"
                                    disabled={savingPlatforms}
                                    onClick={() => savePlatforms(rel.id, storeName)}
                                    className="w-full md:w-auto px-3 py-2 min-h-[38px] rounded text-xs font-medium bg-zinc-900 border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Release Update & Takedown Requests Queue */}
          <div className="mt-8 rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h3 className="font-display text-base font-semibold text-zinc-100">
                Release Update &amp; Song Takedown Requests ({releaseRequests.length})
              </h3>
            </div>
            {releaseRequests.length === 0 ? (
              <div className="p-6 text-xs text-zinc-400">No update or takedown requests submitted by artists.</div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {releaseRequests.map((req) => (
                  <div key={req.id} className="p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-semibold text-zinc-100">
                            {req.request_type}: {req.release_title}
                          </span>
                          <StatusText status={req.status} />
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Artist: {req.artist_name} ({req.artist_email}) · Reason: {req.reason}
                        </p>
                        {req.details && <p className="text-xs text-zinc-300 mt-1">{req.details}</p>}
                      </div>
                      <span className="font-mono text-xs text-zinc-500">
                        {formatDateDDMMYYYY(req.created_at.slice(0, 10))}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <input
                        type="text"
                        value={changeReqNoteMap[req.id] ?? req.admin_notes ?? ''}
                        onChange={(e) =>
                          setChangeReqNoteMap((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        placeholder="Admin processing note..."
                        className="flex-1 min-w-[200px] px-3 py-2 min-h-[38px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleReleaseChangeRequest(req.id, 'Approved')}
                        className="px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReleaseChangeRequest(req.id, 'Completed')}
                        className="px-3 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                      >
                        {req.request_type === 'Takedown' ? 'Complete Takedown' : 'Complete Update'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReleaseChangeRequest(req.id, 'Rejected')}
                        className="px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-rose-950/60 border border-rose-800/60 text-rose-300 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: SINGLE SONG AGREEMENTS & SIGNATURES */}
      {tab === 'agreements' && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl border border-[#D4AF37]/30 bg-[#111114] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-zinc-100">
                Single Song Agreement PDFs &amp; Signature Tracker ({agreements.length})
              </h2>
              <p className="text-xs text-zinc-400">
                Every submitted song gets an individual Agreement PDF with ANGAD MUSIC DISTRIBUTOR &amp; PALAMU
                ENTERTAINMENT INDUSTRY branding. Download, dispatch via WhatsApp/Email, collect signed PDFs, and
                approve.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Pending', 'Sent', 'Signed', 'Approved'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setAgreementFilter(st)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                    agreementFilter === st
                      ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                      : 'bg-[#09090B] border border-zinc-800 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredAgreements.length === 0 ? (
            <div className="p-10 rounded-xl border border-zinc-800 bg-[#111114] text-center text-sm text-zinc-400">
              No song agreements match this status filter yet.
            </div>
          ) : (
            filteredAgreements.map((ag) => (
              <div key={ag.id} className="p-5 rounded-xl border border-zinc-800 bg-[#111114] space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-semibold text-[#E5C158]">{ag.agreement_code}</span>
                      <h3 className="font-display text-base font-semibold text-zinc-100">{ag.song_title}</h3>
                      <StatusText status={ag.status} />
                      {ag.audio_quality_status && <StatusText status={ag.audio_quality_status} />}
                    </div>
                    <p className="text-xs text-zinc-300">
                      Artist: <strong>{ag.artist_name}</strong> · Singer: {ag.singer_name} · Music Director:{' '}
                      {ag.music_director || '—'} · Lyricist: {ag.lyricist || '—'} · Label: {ag.label_name}
                    </p>
                    <p className="text-[11px] font-mono text-zinc-500">
                      Date: {ag.agreement_date} · Mobile: {ag.artist_mobile || '—'} · Email: {ag.artist_email || '—'}
                      {ag.sent_via ? ` · Sent via ${ag.sent_via}` : ''}
                      {ag.signed_pdf_original_name ? ` · Signed File: ${ag.signed_pdf_original_name}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleGenerateAgreementForTrack(ag.track_id)}
                      className="px-3 py-2 min-h-[36px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37] text-zinc-300 cursor-pointer"
                    >
                      Refresh Metadata
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadProtectedPdf(
                          `/api/agreements/${ag.id}/pdf`,
                          `${ag.agreement_code}_${ag.song_title.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <a
                      href={buildWhatsAppAgreementHref(ag)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleUpdateAgreementStatus(ag.id, 'Sent', 'WhatsApp')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-md text-xs font-medium bg-emerald-950/50 border border-emerald-700/60 text-emerald-300"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send WhatsApp</span>
                    </a>
                    <a
                      href={buildEmailAgreementHref(ag)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleUpdateAgreementStatus(ag.id, 'Sent', 'Email')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-md text-xs font-medium bg-sky-950/50 border border-sky-700/60 text-sky-300"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Send Email</span>
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-zinc-800/80">
                  <input
                    type="text"
                    value={agreementNoteMap[ag.id] ?? ag.admin_notes ?? ''}
                    onChange={(e) => setAgreementNoteMap((prev) => ({ ...prev, [ag.id]: e.target.value }))}
                    placeholder="Signature / legal review note..."
                    className="flex-1 min-w-[200px] px-3 py-2 min-h-[38px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                  />

                  <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{uploadingSignedAgId === ag.id ? 'Uploading...' : 'Upload Signed PDF'}</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => handleAdminUploadSignedPdf(ag.id, e)}
                      className="sr-only"
                    />
                  </label>

                  {ag.has_signed_pdf && (
                    <button
                      type="button"
                      onClick={() =>
                        downloadProtectedPdf(
                          `/api/agreements/${ag.id}/signed-pdf`,
                          ag.signed_pdf_original_name || `${ag.agreement_code}-Signed.pdf`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-emerald-950/40 border border-emerald-700/60 text-emerald-300 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>View Signed PDF</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleUpdateAgreementStatus(ag.id, 'Signed')}
                    className="px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer"
                  >
                    Mark Signed
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateAgreementStatus(ag.id, 'Approved')}
                    className="px-3.5 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                  >
                    Approve Agreement
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: ARTISTS DIRECTORY & PRIVATE KYC INSPECTOR */}
      {tab === 'artists' && (
        <div className="space-y-4">
          {artists.length === 0 ? (
            <div className="p-10 rounded-xl border border-zinc-800 bg-[#111114] text-center text-sm text-zinc-400">
              No registered artists yet.
            </div>
          ) : (
            artists.map((a) => {
              const isInspecting = inspectingKycArtistId === a.id;
              return (
                <div key={a.id} className="p-5 rounded-xl border border-zinc-800 bg-[#111114] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <p className="font-medium text-zinc-100">{a.full_name}</p>
                        <StatusText status={a.kyc_status || a.verification_status || 'Unverified'} />
                        {a.otp_verified === 1 && (
                          <span className="text-[11px] font-medium text-emerald-400">OTP Verified</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {a.email} · {a.mobile} · {a.country}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1 font-mono tabular-nums">
                        Releases: {a.release_count} · Songs: {a.song_count} · Verified Balance:{' '}
                        <span className="text-[#E5C158]">{formatINR(a.balance.availableBalance)}</span>
                        {a.aadhaar_masked ? ` · Aadhaar: ${a.aadhaar_masked}` : ''}
                        {a.pan_masked ? ` · PAN: ${a.pan_masked}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleInspectArtistKyc(a.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#09090B] border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#E5C158] cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{isInspecting ? 'Hide Private KYC' : 'Inspect Private KYC & Docs'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Confidential Admin KYC Drawer */}
                  {isInspecting && (
                    <div className="p-4 rounded-lg bg-[#09090B] border border-[#D4AF37]/35 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-[#E5C158]" />
                          <span className="font-semibold text-[#E5C158]">
                            Confidential Artist KYC Vault (Admin Access Only)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRevealSensitiveKyc((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111114] border border-zinc-700 text-[11px] text-zinc-200 cursor-pointer"
                        >
                          {revealSensitiveKyc ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{revealSensitiveKyc ? 'Mask Aadhaar/PAN' : 'Reveal Full Numbers'}</span>
                        </button>
                      </div>

                      {loadingKycDetail || !inspectedKyc ? (
                        <p className="text-zinc-400">Decrypting private KYC record...</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                              <span className="text-zinc-500 block">Legal Name</span>
                              <span className="text-zinc-200 font-medium">{inspectedKyc.legal_name || '—'}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">Aadhaar Number</span>
                              <span className="font-mono text-zinc-100">
                                {revealSensitiveKyc
                                  ? inspectedKyc.aadhaar_number || 'Not submitted'
                                  : inspectedKyc.aadhaar_masked || 'Not submitted'}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">PAN Card Number</span>
                              <span className="font-mono text-zinc-100 uppercase">
                                {revealSensitiveKyc
                                  ? inspectedKyc.pan_number || 'Not submitted'
                                  : inspectedKyc.pan_masked || 'Not submitted'}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">Privacy Consent Recorded</span>
                              <span className="text-zinc-200 font-mono">
                                {inspectedKyc.consent_accepted
                                  ? inspectedKyc.consent_timestamp
                                    ? inspectedKyc.consent_timestamp.slice(0, 19).replace('T', ' ')
                                    : 'Accepted'
                                  : 'Not Submitted'}
                              </span>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-4">
                              <span className="text-zinc-500 block">Full Residential Address</span>
                              <span className="text-zinc-200">{inspectedKyc.full_address || 'Not provided'}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800">
                            {inspectedKyc.has_aadhaar_front && (
                              <button
                                type="button"
                                onClick={() =>
                                  openAdminPrivateKycModal(a.id, 'aadhaar_front', `${a.full_name} — Aadhaar Front`)
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-[#E5C158] cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View Aadhaar Front</span>
                              </button>
                            )}
                            {inspectedKyc.has_aadhaar_back && (
                              <button
                                type="button"
                                onClick={() =>
                                  openAdminPrivateKycModal(a.id, 'aadhaar_back', `${a.full_name} — Aadhaar Back`)
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-[#E5C158] cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View Aadhaar Back</span>
                              </button>
                            )}
                            {inspectedKyc.has_pan_card && (
                              <button
                                type="button"
                                onClick={() =>
                                  openAdminPrivateKycModal(a.id, 'pan_card', `${a.full_name} — PAN Card`)
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-[#E5C158] cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View PAN Card</span>
                              </button>
                            )}
                            {!inspectedKyc.has_aadhaar_front && !inspectedKyc.has_pan_card && (
                              <span className="text-zinc-500">No private KYC documents uploaded yet.</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-zinc-800/80">
                    <input
                      type="text"
                      value={artistVerifyNoteMap[a.id] ?? a.verification_notes ?? ''}
                      onChange={(e) =>
                        setArtistVerifyNoteMap((prev) => ({ ...prev, [a.id]: e.target.value }))
                      }
                      placeholder="KYC verification reviewer note..."
                      className="flex-1 min-w-[200px] px-3 py-2 min-h-[38px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => handleArtistVerification(a.id, 'Verified')}
                      className="px-3.5 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                    >
                      Approve KYC Verification
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArtistVerification(a.id, 'Rejected')}
                      className="px-3.5 py-2 min-h-[38px] rounded-md text-xs font-medium bg-rose-950/60 border border-rose-800/60 text-rose-300 cursor-pointer"
                    >
                      Reject Verification
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB: MANAGE MUSIC PLATFORMS */}
      {tab === 'platforms' && (
        <div className="space-y-6">
          <form onSubmit={handleAddPlatform} className="p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4">
            <h2 className="font-display text-base font-semibold text-zinc-100">Add Distribution Platform / DSP</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Platform Name *</label>
                <input
                  type="text"
                  required
                  value={newPlatformName}
                  onChange={(e) => setNewPlatformName(e.target.value)}
                  placeholder="e.g. Resso / Tidal"
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Category</label>
                <select
                  value={newPlatformCategory}
                  onChange={(e) => setNewPlatformCategory(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                >
                  <option value="Global DSP">Global DSP</option>
                  <option value="Indian DSP">Indian DSP</option>
                  <option value="Social Audio">Social Audio</option>
                  <option value="Telco CRBT">Telco CRBT</option>
                  <option value="Partner Network">Partner Network</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Partner Integration Notes</label>
                <input
                  type="text"
                  value={newPlatformNotes}
                  onChange={(e) => setNewPlatformNotes(e.target.value)}
                  placeholder="Optional ingestion note"
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
              >
                Add Platform
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-zinc-800 bg-[#111114] divide-y divide-zinc-800/80 overflow-hidden">
            {platforms.map((plat) => (
              <div key={plat.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{plat.name}</p>
                  <p className="text-xs text-zinc-500">
                    {plat.category} {plat.partner_notes ? `· ${plat.partner_notes}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePlatform(plat)}
                  className={`px-3.5 py-2 min-h-[36px] rounded-md text-xs font-semibold border cursor-pointer ${
                    plat.is_enabled === 1
                      ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {plat.is_enabled === 1 ? 'Enabled in Catalog' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ROYALTY LEDGER */}
      {tab === 'royalties' && (
        <div className="space-y-6">
          <form
            onSubmit={handleRecordRoyalty}
            className="p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4"
          >
            <h2 className="font-display text-base font-semibold text-zinc-100">Post Verified Store Royalty Statement</h2>
            {artists.length === 0 ? (
              <p className="text-xs text-zinc-400">Register an artist account before posting royalty statements.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Artist Account *</label>
                    <select
                      value={royaltyArtistId}
                      onChange={(e) => {
                        setRoyaltyArtistId(e.target.value);
                        setRoyaltyReleaseId('');
                      }}
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                    >
                      {artists.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name} ({a.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Release (Optional)</label>
                    <select
                      value={royaltyReleaseId}
                      onChange={(e) => setRoyaltyReleaseId(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                    >
                      <option value="">General Catalog Settlement</option>
                      {artistReleasesForRoyalty.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">DSP Store *</label>
                    <select
                      value={royaltyStore}
                      onChange={(e) => setRoyaltyStore(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                    >
                      {storeOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Reporting Period *</label>
                    <input
                      type="text"
                      required
                      value={royaltyPeriod}
                      onChange={(e) => setRoyaltyPeriod(e.target.value)}
                      placeholder="YYYY-MM"
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs font-mono text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Statement Date</label>
                    <input
                      type="date"
                      value={royaltyEntryDate}
                      onChange={(e) => setRoyaltyEntryDate(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs font-mono text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Verified Streams</label>
                    <input
                      type="number"
                      min={0}
                      value={royaltyStreams}
                      onChange={(e) => setRoyaltyStreams(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs font-mono text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Net Royalty (INR) *</label>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      required
                      value={royaltyAmount}
                      onChange={(e) => setRoyaltyAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs font-mono text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Statement Reference</label>
                    <input
                      type="text"
                      value={royaltyNote}
                      onChange={(e) => setRoyaltyNote(e.target.value)}
                      placeholder="Report ID / Note"
                      className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-5 py-2.5 min-h-[42px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                  >
                    Credit Verified Royalty
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h3 className="font-display text-sm font-semibold text-zinc-100">Posted Ledger Entries</h3>
            </div>
            {royalties.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">No royalty statements posted yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-3 px-5 font-medium">Artist</th>
                      <th className="py-3 px-4 font-medium">Store</th>
                      <th className="py-3 px-4 font-medium">Period</th>
                      <th className="py-3 px-4 font-medium text-right">Streams</th>
                      <th className="py-3 px-5 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {royalties.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-5 text-zinc-100">
                          {r.artist_name} · <span className="text-zinc-400">{r.release_title || 'General'}</span>
                        </td>
                        <td className="py-3 px-4 text-zinc-300">{r.store_name}</td>
                        <td className="py-3 px-4 font-mono text-zinc-400">{r.period}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                          {r.streams.toLocaleString()}
                        </td>
                        <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-emerald-400">
                          {formatINR(r.amount_inr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PAYOUT REQUESTS */}
      {tab === 'payouts' && (
        <div className="space-y-4">
          {payouts.length === 0 ? (
            <div className="p-10 rounded-xl border border-zinc-800 bg-[#111114] text-center text-sm text-zinc-400">
              No artist payout requests submitted yet.
            </div>
          ) : (
            payouts.map((p) => (
              <div key={p.id} className="p-5 rounded-xl border border-zinc-800 bg-[#111114] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-zinc-100">{p.artist_name}</p>
                      <StatusText status={p.status} />
                    </div>
                    <p className="text-xs text-zinc-400">
                      {p.payment_method}: {p.account_summary} · {p.artist_email}
                    </p>
                  </div>
                  <p className="font-mono text-lg font-semibold text-[#E5C158] tabular-nums">
                    {formatINR(p.amount_inr)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-800/80">
                  <input
                    type="text"
                    value={payoutRefMap[p.id] ?? p.admin_reference ?? ''}
                    onChange={(e) => setPayoutRefMap((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="UTR / Bank Reference ID"
                    className="flex-1 min-w-[200px] px-3 py-2 min-h-[38px] rounded-md bg-[#09090B] border border-zinc-800 text-xs font-mono text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => handlePayoutAction(p.id, 'Processing')}
                    className="px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer"
                  >
                    Mark Processing
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePayoutAction(p.id, 'Paid')}
                    className="px-3 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                  >
                    Mark Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePayoutAction(p.id, 'Declined')}
                    className="px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-rose-950/60 border border-rose-800/60 text-rose-300 cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: SERVICES & NOTIFICATION BROADCASTS */}
      {tab === 'services' && (
        <div className="space-y-6">
          <form
            onSubmit={handleBroadcastNotification}
            className="p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4"
          >
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#E5C158]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-zinc-100">Manage Notifications &amp; Broadcasts</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Audience</label>
                <select
                  value={notifTargetArtistId}
                  onChange={(e) => setNotifTargetArtistId(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                >
                  <option value="">All Registered Artists ({artists.length})</option>
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name} ({a.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Notification Title *</label>
                <input
                  type="text"
                  required
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="e.g. Monthly Store Royalty Cycle Settled"
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Message *</label>
              <textarea
                rows={2}
                required
                value={notifMessage}
                onChange={(e) => setNotifMessage(e.target.value)}
                placeholder="Write official artist announcement..."
                className="w-full px-3 py-2 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
              >
                Send Notification
              </button>
            </div>
          </form>

          <div className="space-y-4">
            <h3 className="font-display text-base font-semibold text-zinc-100">
              Artist Service Requests ({serviceRequests.length})
            </h3>
            {serviceRequests.length === 0 ? (
              <div className="p-8 rounded-xl border border-zinc-800 bg-[#111114] text-center text-xs text-zinc-400">
                No artist promotion, video distribution, branding, or cover design requests yet.
              </div>
            ) : (
              serviceRequests.map((s) => (
                <div key={s.id} className="p-5 rounded-xl border border-zinc-800 bg-[#111114] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <p className="text-sm font-semibold text-zinc-100">{s.service_type}</p>
                        <StatusText status={s.status} />
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Artist: {s.artist_name} ({s.artist_email})
                        {s.release_title ? ` · Release: ${s.release_title}` : ''}
                        {s.budget_note ? ` · Budget: ${s.budget_note}` : ''}
                      </p>
                      <p className="text-xs text-zinc-300 mt-1">{s.brief}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={serviceNoteMap[s.id] ?? s.admin_notes ?? ''}
                      onChange={(e) => setServiceNoteMap((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      placeholder="Campaign status note for artist..."
                      className="flex-1 min-w-[200px] px-3 py-2 min-h-[38px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                    />
                    {(['In Review', 'Active', 'Completed', 'Declined'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleServiceAction(s.id, st)}
                        className="px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-zinc-900 border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: SUPPORT TICKETS & LIVE CHAT */}
      {tab === 'support' && (
        <div className="space-y-8">
          <div className="space-y-4">
            <h2 className="font-display text-base font-semibold text-zinc-100">
              Support Tickets ({tickets.length})
            </h2>
            {tickets.length === 0 ? (
              <div className="p-10 rounded-xl border border-zinc-800 bg-[#111114] text-center text-sm text-zinc-400">
                No support tickets in queue.
              </div>
            ) : (
              tickets.map((t) => (
                <div key={t.id} className="p-5 rounded-xl border border-zinc-800 bg-[#111114] space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-sm font-semibold text-zinc-100">{t.subject}</h3>
                        <StatusText status={t.status} />
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        From: {t.name} ({t.email} {t.phone ? `· ${t.phone}` : ''}) · {t.category}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-zinc-500">#{t.id}</span>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed bg-[#09090B] p-3.5 rounded-md border border-zinc-800">
                    {t.message}
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={ticketReplyMap[t.id] ?? t.admin_reply ?? ''}
                      onChange={(e) => setTicketReplyMap((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      placeholder="Write official reply to artist..."
                      className="flex-1 min-w-[240px] px-3 py-2 min-h-[38px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => handleSupportAction(t.id, 'In Progress')}
                      className="px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer"
                    >
                      In Progress
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSupportAction(t.id, 'Resolved')}
                      className="px-3 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                    >
                      Send Reply &amp; Resolve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Live Support Chat Threads */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#E5C158]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-zinc-100">
                Live Support Chat Desk ({chatThreads.length} active threads)
              </h2>
            </div>
            {chatThreads.length === 0 ? (
              <div className="p-8 rounded-xl border border-zinc-800 bg-[#111114] text-center text-xs text-zinc-400">
                No live support chat conversations yet.
              </div>
            ) : (
              chatThreads.map(([sessionKey, thread]) => (
                <div key={sessionKey} className="p-5 rounded-xl border border-zinc-800 bg-[#111114] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[#E5C158]">{sessionKey}</span>
                    <span className="text-zinc-500">{thread.length} messages</span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto bg-[#09090B] p-3 rounded-lg border border-zinc-800">
                    {thread.map((m) => (
                      <div key={m.id} className="text-xs">
                        <span className={m.sender_role === 'admin' ? 'text-[#E5C158] font-semibold' : 'text-zinc-200 font-medium'}>
                          {m.sender_name}:{' '}
                        </span>
                        <span className="text-zinc-300">{m.message}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={chatReplyMap[sessionKey] || ''}
                      onChange={(e) => setChatReplyMap((prev) => ({ ...prev, [sessionKey]: e.target.value }))}
                      placeholder="Reply directly in live chat..."
                      className="flex-1 px-3 py-2 min-h-[38px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendChatReply(sessionKey)}
                      className="px-4 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                    >
                      Send Reply
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB: WEBSITE MANAGEMENT, AUTOMATIC BACKUPS & SECURITY */}
      {tab === 'website-security' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveSiteSettings}
            className="p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4"
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#E5C158]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-zinc-100">Website Management</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Hero Tagline / Company Label</label>
                <input
                  type="text"
                  value={siteSettings.brand_tagline}
                  onChange={(e) => setSiteSettings((prev) => ({ ...prev, brand_tagline: e.target.value }))}
                  className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Homepage Top Announcement Banner</label>
                <input
                  type="text"
                  value={siteSettings.announcement_banner}
                  onChange={(e) => setSiteSettings((prev) => ({ ...prev, announcement_banner: e.target.value }))}
                  placeholder="Optional top banner shown on homepage"
                  className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Artist Dashboard Latest Update Banner</label>
                <input
                  type="text"
                  value={siteSettings.latest_update_text}
                  onChange={(e) => setSiteSettings((prev) => ({ ...prev, latest_update_text: e.target.value }))}
                  className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Support Phone</label>
                <input
                  type="text"
                  value={siteSettings.support_phone}
                  onChange={(e) => setSiteSettings((prev) => ({ ...prev, support_phone: e.target.value }))}
                  className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs font-mono text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">WhatsApp Number (with country code)</label>
                <input
                  type="text"
                  value={siteSettings.whatsapp_number}
                  onChange={(e) => setSiteSettings((prev) => ({ ...prev, whatsapp_number: e.target.value }))}
                  className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs font-mono text-zinc-100"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-5 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
              >
                Save Website Settings
              </button>
            </div>
          </form>

          {/* Automatic & Manual Backups */}
          <div className="p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#E5C158]" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-base font-semibold text-zinc-100">
                    Automatic &amp; Manual Database Backups
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Automatic SQLite snapshots run on boot and every 12 hours into isolated backup storage.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateBackup}
                className="px-4 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
              >
                Create Backup Now
              </button>
            </div>

            <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-lg bg-[#09090B]">
              {backups.map((b) => (
                <div key={b.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-mono text-zinc-100">{b.filename}</p>
                    <p className="text-zinc-500">
                      {b.trigger_type} · {formatBytes(b.size_bytes)} · {b.created_at.slice(0, 19).replace('T', ' ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadBackup(b.filename)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Download</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Security Audit: Admin Access Control & Login History */}
          <div className="rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h2 className="font-display text-base font-semibold text-zinc-100">
                Platform Security &amp; Login Audit Log ({loginHistory.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-3 px-5 font-medium">Timestamp</th>
                    <th className="py-3 px-4 font-medium">Role</th>
                    <th className="py-3 px-4 font-medium">Account / Identifier</th>
                    <th className="py-3 px-4 font-medium">Method</th>
                    <th className="py-3 px-4 font-medium">IP</th>
                    <th className="py-3 px-5 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {loginHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-5 font-mono text-zinc-400">
                        {h.created_at.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="py-2.5 px-4 uppercase text-zinc-300">{h.role}</td>
                      <td className="py-2.5 px-4 text-zinc-200">{h.identifier}</td>
                      <td className="py-2.5 px-4 text-zinc-400">{h.login_method}</td>
                      <td className="py-2.5 px-4 font-mono text-zinc-500">{h.ip_address}</td>
                      <td className="py-2.5 px-5 text-right">
                        <span className={h.status === 'Success' ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
