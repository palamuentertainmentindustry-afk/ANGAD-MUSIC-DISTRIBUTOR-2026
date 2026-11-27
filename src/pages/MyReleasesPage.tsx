import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Disc3,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Folder,
  PlusCircle,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { SafeImage } from '../components/SafeImage.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { ASSETS, formatBytes, formatDateDDMMYYYY, formatDuration } from '../lib/assets.ts';
import type { AppView, ReleaseChangeRequest, ReleaseItem, SongAgreementItem } from '../types.ts';

interface MyReleasesPageProps {
  onNavigate: (view: AppView, opts?: { smartLinkSlug?: string }) => void;
}

const RELEASE_FOLDERS = ['All', 'Pending Review', 'Approved', 'Live', 'Rejected'] as const;
type ReleaseFolder = (typeof RELEASE_FOLDERS)[number];

export function MyReleasesPage({ onNavigate }: MyReleasesPageProps) {
  const { token } = useAuth();
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [agreements, setAgreements] = useState<SongAgreementItem[]>([]);
  const [uploadingSignedId, setUploadingSignedId] = useState<number | null>(null);
  const [changeRequests, setChangeRequests] = useState<ReleaseChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReleaseFolder>('All');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Release Update / Takedown Request State
  const [requestTarget, setRequestTarget] = useState<{ release: ReleaseItem; type: 'Update' | 'Takedown' } | null>(
    null
  );
  const [reqReason, setReqReason] = useState('');
  const [reqDetails, setReqDetails] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);

  const loadReleases = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [relRes, reqRes, agrRes] = await Promise.all([
        apiFetch<{ releases: ReleaseItem[] }>('/api/artist/releases', { token }),
        apiFetch<{ requests: ReleaseChangeRequest[] }>('/api/artist/release-requests', { token }),
        apiFetch<{ agreements: SongAgreementItem[] }>('/api/artist/agreements', { token }),
      ]);
      setReleases(relRes.releases);
      setChangeRequests(reqRes.requests || []);
      setAgreements(agrRes.agreements || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load releases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReleases();
  }, [token]);

  const agreementsByRelease = useMemo(() => {
    const map = new Map<number, SongAgreementItem[]>();
    for (const ag of agreements) {
      const list = map.get(ag.release_id) || [];
      list.push(ag);
      map.set(ag.release_id, list);
    }
    return map;
  }, [agreements]);

  const downloadProtectedPdf = async (url: string, fallbackName: string) => {
    if (!token) return;
    setError(null);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not download agreement PDF.');
      const blob = await response.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fallbackName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agreement PDF download failed.');
    }
  };

  const handleUploadSignedAgreement = async (agreementId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploadingSignedId(agreementId);
    setError(null);
    setSuccessMsg(null);
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
      setSuccessMsg(
        `Signed agreement PDF uploaded for "${res.agreement.song_title}". Status is now ${res.agreement.status}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signed PDF upload failed.');
    } finally {
      setUploadingSignedId(null);
      e.target.value = '';
    }
  };

  const folderCounts = useMemo(() => {
    const counts: Record<ReleaseFolder, number> = {
      All: releases.length,
      'Pending Review': 0,
      Approved: 0,
      Live: 0,
      Rejected: 0,
    };
    for (const r of releases) {
      if (r.status in counts) {
        counts[r.status as Exclude<ReleaseFolder, 'All'>] += 1;
      }
    }
    return counts;
  }, [releases]);

  const filtered = useMemo(() => {
    return releases.filter((r) => {
      const matchesStatus = filter === 'All' || r.status === filter;
      const q = search.trim().toLowerCase();
      const matchesQuery =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.primary_artist.toLowerCase().includes(q) ||
        (r.catalogue_number || '').toLowerCase().includes(q) ||
        (r.upc || '').toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [releases, filter, search]);

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`/api/artist/releases/${id}`, { method: 'DELETE', token });
      setReleases((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete release.');
    }
  };

  const handleSubmitChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !requestTarget) return;
    setError(null);
    setSuccessMsg(null);
    setSubmittingReq(true);
    try {
      const res = await apiFetch<{ request: ReleaseChangeRequest }>('/api/artist/release-requests', {
        method: 'POST',
        token,
        body: {
          releaseId: requestTarget.release.id,
          requestType: requestTarget.type,
          reason: reqReason,
          details: reqDetails,
        },
      });
      setChangeRequests((prev) => [res.request, ...prev]);
      setSuccessMsg(
        `${requestTarget.type} request for "${requestTarget.release.title}" submitted to Palamu Entertainment Industry.`
      );
      setRequestTarget(null);
      setReqReason('');
      setReqDetails('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit release request.');
    } finally {
      setSubmittingReq(false);
    }
  };

  return (
    <DashboardLayout
      currentView="my-releases"
      onNavigate={onNavigate}
      title="My Releases"
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
      {successMsg && (
        <div className="mb-6 p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-sm text-emerald-300">
          {successMsg}
        </div>
      )}

      {/* Active Release Update / Takedown Request Form */}
      {requestTarget && (
        <form
          onSubmit={handleSubmitChangeRequest}
          className="mb-6 p-5 sm:p-6 rounded-xl border border-[#D4AF37]/40 bg-[#111114] space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-zinc-100">
                {requestTarget.type === 'Takedown'
                  ? `Request Song Takedown: ${requestTarget.release.title}`
                  : `Request Release Metadata Update: ${requestTarget.release.title}`}
              </h2>
              <p className="text-xs text-zinc-400">
                {requestTarget.type === 'Takedown'
                  ? 'Submit an official takedown notice for Palamu Entertainment Industry & DSP store processing.'
                  : 'Specify artwork, title, credit, or store metadata corrections for admin review.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRequestTarget(null)}
              className="text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Reason Summary *</label>
              <input
                type="text"
                required
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder={
                  requestTarget.type === 'Takedown'
                    ? 'e.g. Exclusive rights transfer or re-mastering'
                    : 'e.g. Correct lyricist credit / release date'
                }
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Specific Change / Store Details *</label>
              <input
                type="text"
                required
                value={reqDetails}
                onChange={(e) => setReqDetails(e.target.value)}
                placeholder="Provide exact field values or ISRC/store notes"
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submittingReq}
              className="px-5 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 cursor-pointer"
            >
              {submittingReq ? 'Submitting...' : `Submit ${requestTarget.type} Request`}
            </button>
          </div>
        </form>
      )}

      {/* Release Status Folders & Search */}
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {RELEASE_FOLDERS.map((folder) => {
            const active = filter === folder;
            return (
              <button
                key={folder}
                type="button"
                onClick={() => setFilter(folder)}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#D4AF37]/12 border-[#D4AF37]/50 text-[#F5E6B3]'
                    : 'bg-[#111114] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Folder
                    className={`w-4 h-4 shrink-0 ${active ? 'text-[#E5C158]' : 'text-zinc-500'}`}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-sm font-semibold tabular-nums">{folderCounts[folder]}</span>
                </div>
                <p className="text-xs font-medium truncate">{folder}</p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            Showing <strong className="text-zinc-200">{filtered.length}</strong> release
            {filtered.length === 1 ? '' : 's'} in <strong className="text-[#E5C158]">{filter}</strong> folder
          </p>
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, artist, catalogue #, UPC..."
              className="w-full pl-9 pr-3.5 py-2 min-h-[40px] rounded-md bg-[#111114] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-20 rounded-xl bg-[#111114] border border-zinc-800 animate-pulse" />
          <div className="h-20 rounded-xl bg-[#111114] border border-zinc-800 animate-pulse" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 rounded-xl border border-zinc-800 bg-[#111114] text-center">
          <Disc3 className="w-9 h-9 text-zinc-600 mx-auto mb-3" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-zinc-100 mb-1">
            No releases in {filter} folder
          </h2>
          <p className="text-xs text-zinc-400 mb-5">
            {releases.length === 0
              ? 'You have not submitted any music releases yet.'
              : 'Select another status folder or adjust your search query to inspect catalog items.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('create-release')}
            className="px-4 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
          >
            Submit Release
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((rel) => {
            const expanded = expandedId === rel.id;
            return (
              <div key={rel.id} className="rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden">
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <SafeImage
                      src={rel.cover_url || ASSETS.releaseFallback}
                      fallbackSrc={ASSETS.releaseFallback}
                      alt={rel.title}
                      className="w-16 h-16 rounded-md object-cover border border-zinc-800 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-1">
                        <h3 className="font-display text-base font-semibold text-zinc-100 truncate">{rel.title}</h3>
                        <StatusText status={rel.status} />
                        {rel.processing_tier === 'Fast Track' && (
                          <span className="text-[11px] font-semibold text-[#E5C158]">Fast Track (4–5 Days* Est. QC)</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 truncate">
                        {rel.primary_artist} · {rel.release_type} · {rel.genre}
                        {rel.subgenre ? ` / ${rel.subgenre}` : ''} · {rel.language}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1 font-mono tabular-nums">
                        Date: {formatDateDDMMYYYY(rel.release_date)} ·{' '}
                        {rel.release_schedule_mode === 'Instant Request' ? 'Instant Request' : 'Scheduled'} · Cat#:{' '}
                        {rel.catalogue_number || 'Pending'} · UPC: {rel.upc || 'Pending'} · Stores:{' '}
                        {(rel.platform_deliveries || []).filter((p) => p.delivery_status === 'LIVE').length} /{' '}
                        {(rel.platform_deliveries || []).length || 15} LIVE
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {rel.smart_link_slug && (
                      <button
                        type="button"
                        onClick={() => onNavigate('public-smart-link', { smartLinkSlug: rel.smart_link_slug })}
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Smart Link</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setRequestTarget({ release: rel, type: 'Update' });
                        setReqReason('');
                        setReqDetails('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37] text-zinc-300 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Update</span>
                    </button>

                    {rel.status === 'Live' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRequestTarget({ release: rel, type: 'Takedown' });
                          setReqReason('');
                          setReqDetails('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-800 hover:border-rose-700 text-zinc-300 hover:text-rose-300 cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        <span>Request Takedown</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelete(rel.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-800 hover:border-rose-700 text-zinc-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Withdraw</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : rel.id)}
                      className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-zinc-900 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                    >
                      <span>Details &amp; Stores ({rel.tracks?.length ?? 0})</span>
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="px-5 pb-5 pt-4 border-t border-zinc-800/80 bg-[#0C0C0F] space-y-6">
                    {rel.admin_notes && (
                      <div className="p-3.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
                        <span className="font-semibold text-[#E5C158]">Label Review Note: </span>
                        {rel.admin_notes}
                      </div>
                    )}

                    {/* Release Rights & Credits Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs p-4 rounded-lg bg-[#111114] border border-zinc-800">
                      <div>
                        <span className="text-zinc-500 block">P-Line</span>
                        <span className="text-zinc-200">{rel.p_line || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">C-Line</span>
                        <span className="text-zinc-200">{rel.c_line || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Version / Production Year</span>
                        <span className="text-zinc-200">
                          {rel.release_version || 'Original'} ·{' '}
                          <span className="font-mono">{rel.production_year || rel.copyright_year || '—'}</span>
                          {rel.various_artists ? ' · Various Artists' : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Label / Catalogue #</span>
                        <span className="text-zinc-200">
                          {rel.label_name} · <span className="font-mono">{rel.catalogue_number || '—'}</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Planned / Original Date</span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {formatDateDDMMYYYY(rel.release_date)} /{' '}
                          {formatDateDDMMYYYY(rel.original_release_date || rel.release_date)}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Processing Speed</span>
                        <span className={rel.processing_tier === 'Fast Track' ? 'text-[#E5C158] font-medium' : 'text-zinc-200'}>
                          {rel.processing_tier === 'Fast Track'
                            ? 'Fast Track Priority QC (4–5 working days est.*)'
                            : 'Standard Review Queue'}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-500">
                            <th className="py-2 pr-3 font-medium">Disc/Trk</th>
                            <th className="py-2 pr-3 font-medium">Track Title</th>
                            <th className="py-2 pr-3 font-medium">ISRC</th>
                            <th className="py-2 pr-3 font-medium">Credits &amp; Rights</th>
                            <th className="py-2 pr-3 font-medium">Duration &amp; Quality</th>
                            <th className="py-2 pr-3 font-medium">Status</th>
                            <th className="py-2 font-medium text-right">Master</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {(rel.tracks || []).map((t) => (
                            <tr key={t.id}>
                              <td className="py-2.5 pr-3 font-mono text-zinc-400 tabular-nums whitespace-nowrap">
                                D{t.disc_number || 1}-T{t.track_number}
                              </td>
                              <td className="py-2.5 pr-3 text-zinc-100 font-medium">
                                <div>
                                  {t.title}
                                  {(t.primary_track_type || t.song_version) && (
                                    <span className="ml-1.5 text-[11px] text-zinc-400">
                                      ({t.primary_track_type || t.song_version})
                                    </span>
                                  )}
                                  {(t.parental_advisory === 'Explicit' || t.explicit === 1) && (
                                    <span className="ml-2 text-[10px] text-amber-400">Explicit</span>
                                  )}
                                  {t.is_instrumental === 1 && (
                                    <span className="ml-2 text-[10px] text-[#E5C158]">Instrumental</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  Language: {t.vocal_language || rel.language} · Preview:{' '}
                                  <span className="font-mono">{t.caller_tune_start_time || '00:00'}</span>
                                  {t.youtube_content_id === 1 ? ' · Content ID: Yes' : ''}
                                </div>
                              </td>
                              <td className="py-2.5 pr-3 font-mono text-zinc-300 tabular-nums whitespace-nowrap">
                                {t.isrc || 'Pending'}
                              </td>
                              <td className="py-2.5 pr-3 text-zinc-400">
                                <div>
                                  {[
                                    t.author || t.lyricist,
                                    t.composer,
                                    t.remixer ? `Remix: ${t.remixer}` : '',
                                    t.publisher,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </div>
                                {t.artist_roles && t.artist_roles.length > 0 && (
                                  <div className="text-[11px] text-zinc-500">
                                    {t.artist_roles.map((r) => `${r.name} (${r.role})`).join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 pr-3 font-mono text-zinc-400 tabular-nums">
                                <div>
                                  {formatDuration(t.duration_seconds)}
                                  {t.audio_size_bytes ? ` · ${formatBytes(t.audio_size_bytes)}` : ''}
                                </div>
                                {t.audio_quality_status && (
                                  <div className="mt-0.5">
                                    <StatusText status={t.audio_quality_status} />
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 pr-3">
                                <StatusText status={t.status} />
                              </td>
                              <td className="py-2.5 text-right">
                                {t.audio_url ? (
                                  <audio controls src={t.audio_url} className="h-8 ml-auto max-w-[200px]" />
                                ) : (
                                  <span className="text-zinc-500">No file</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Single Song Agreements & Signature Upload */}
                    {(agreementsByRelease.get(rel.id) || []).length > 0 && (
                      <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                        <div>
                          <h4 className="font-display text-sm font-semibold text-zinc-100">
                            Single Song Agreement PDF &amp; Signature
                          </h4>
                          <p className="text-xs text-zinc-400">
                            Download your song-specific agreement generated by ANGAD MUSIC DISTRIBUTOR (Palamu
                            Entertainment Industry), sign it, and upload the signed PDF.
                          </p>
                        </div>

                        <div className="space-y-2.5">
                          {(agreementsByRelease.get(rel.id) || []).map((ag) => (
                            <div
                              key={ag.id}
                              className="p-3.5 rounded-lg bg-[#111114] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <FileText className="w-4 h-4 text-[#E5C158] shrink-0" aria-hidden="true" />
                                  <span className="text-xs font-semibold text-zinc-100">{ag.song_title}</span>
                                  <span className="text-[11px] font-mono text-zinc-400">{ag.agreement_code}</span>
                                  <StatusText status={ag.status} />
                                </div>
                                <p className="text-[11px] text-zinc-400">
                                  Date: <span className="font-mono">{ag.agreement_date}</span> · Label: {ag.label_name}
                                  {ag.sent_via ? ` · Sent via ${ag.sent_via}` : ''}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadProtectedPdf(
                                      `/api/agreements/${ag.id}/pdf`,
                                      `${ag.agreement_code}_${ag.song_title.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                                  <span>Agreement PDF</span>
                                </button>

                                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>
                                    {uploadingSignedId === ag.id
                                      ? 'Uploading...'
                                      : ag.has_signed_pdf
                                        ? 'Replace Signed PDF'
                                        : 'Upload Signed PDF'}
                                  </span>
                                  <input
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    onChange={(e) => handleUploadSignedAgreement(ag.id, e)}
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
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-md text-xs font-medium bg-emerald-950/50 border border-emerald-700/60 text-emerald-300 cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Signed PDF</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Per-Platform Delivery Status */}
                    <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                      <div>
                        <h4 className="font-display text-sm font-semibold text-zinc-100">
                          Platform Delivery Status
                        </h4>
                        <p className="text-xs text-zinc-500">
                          Platforms show LIVE only after delivery is confirmed by a real distribution partner.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(rel.platform_deliveries || []).map((pd) => (
                          <div
                            key={pd.platform_name}
                            className="p-3.5 rounded-lg bg-[#111114] border border-zinc-800 flex flex-col justify-between gap-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-zinc-100 truncate">
                                {pd.platform_name}
                              </span>
                              <StatusText status={pd.delivery_status} />
                            </div>
                            {pd.partner_name ? (
                              <p className="text-[11px] text-zinc-400 truncate">
                                Partner: {pd.partner_name}
                                {pd.partner_confirmation_id ? ` · Ref: ${pd.partner_confirmation_id}` : ''}
                              </p>
                            ) : (
                              <p className="text-[11px] text-zinc-500">Awaiting partner delivery confirmation</p>
                            )}
                            {pd.live_url && pd.delivery_status === 'LIVE' && (
                              <a
                                href={pd.live_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E5C158] hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Open Store Link</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Release Update & Takedown Request Log */}
      {changeRequests.length > 0 && (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h2 className="font-display text-base font-semibold text-zinc-100">
              Release Update &amp; Takedown Requests
            </h2>
          </div>
          <div className="divide-y divide-zinc-800/80">
            {changeRequests.map((req) => (
              <div key={req.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-medium text-zinc-100">
                      {req.request_type}: {req.release_title}
                    </span>
                    <StatusText status={req.status} />
                  </div>
                  <p className="text-xs text-zinc-400">
                    Reason: {req.reason} {req.details ? `· ${req.details}` : ''}
                  </p>
                  {req.admin_notes && (
                    <p className="text-xs text-[#E5C158]">Admin Response: {req.admin_notes}</p>
                  )}
                </div>
                <span className="font-mono text-xs text-zinc-500 shrink-0">
                  {formatDateDDMMYYYY(req.created_at.slice(0, 10))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
